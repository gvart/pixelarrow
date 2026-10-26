import { describe, expect, it } from 'vitest';
import type { Env } from '../src/env';
import { db, secret } from '../src/middleware';
import { signInitData, validateInitData } from '../src/telegramAuth';
import { api, BOT_TOKEN, devLogin } from './helpers';

const now = () => Math.floor(Date.now() / 1000);
const user = { id: 777001, first_name: 'Leonidas', username: 'leo', language_code: 'en' };

async function initData(fields: Partial<Record<string, string>> = {}, token = BOT_TOKEN) {
  return signInitData({ query_id: 'AAH', user: JSON.stringify(user), auth_date: String(now()), ...fields } as Record<string, string>, token);
}

describe('initData validation', () => {
  it('accepts correctly signed data', async () => {
    const r = await validateInitData(await initData(), BOT_TOKEN);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.user.id).toBe(user.id);
  });

  it('rejects tampered data', async () => {
    const good = await initData();
    const tampered = good.replace(encodeURIComponent('"Leonidas"'), encodeURIComponent('"Xerxes"'));
    expect(tampered).not.toBe(good);
    expect(await validateInitData(tampered, BOT_TOKEN)).toEqual({ ok: false, reason: 'bad_hash' });
  });

  it('rejects data signed with another bot token', async () => {
    expect(await validateInitData(await initData({}, '999:OTHER'), BOT_TOKEN)).toEqual({ ok: false, reason: 'bad_hash' });
  });

  it('rejects data older than 24 h and from the far future', async () => {
    const old = await initData({ auth_date: String(now() - 24 * 3600 - 5) });
    expect(await validateInitData(old, BOT_TOKEN)).toEqual({ ok: false, reason: 'expired' });
    const fut = await initData({ auth_date: String(now() + 3600) });
    expect(await validateInitData(fut, BOT_TOKEN)).toEqual({ ok: false, reason: 'future' });
  });

  it('rejects a missing or malformed hash', async () => {
    expect((await validateInitData('auth_date=1&user=%7B%7D', BOT_TOKEN)).ok).toBe(false);
    expect((await validateInitData('auth_date=1&hash=zz', BOT_TOKEN)).ok).toBe(false);
  });
});

describe('POST /api/auth/telegram (dev sign-in)', () => {
  it('requires a session for /api/me', async () => {
    expect((await api('/api/me')).status).toBe(401);
    expect((await api('/api/me', { token: 'pa2_' + 'A'.repeat(43) })).status).toBe(401);
  });

  it('supports DEV_AUTH logins when enabled', async () => {
    const { token } = await devLogin(42);
    expect((await api('/api/me', { token })).status).toBe(200);
  });
});

describe('health', () => {
  it('reports configuration without leaking secrets', async () => {
    const res = await api('/api/health');
    expect(await res.json()).toMatchObject({ ok: true, db: true, secrets: { adminToken: true } });
  });
  it('unknown API routes are JSON 404s', async () => {
    const res = await api('/api/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: 'not_found' } });
  });
});

describe('missing configuration', () => {
  it('answers 503 when D1 or a secret is not configured', () => {
    const empty = {} as Env;
    expect(() => db(empty)).toThrow(expect.objectContaining({ status: 503, code: 'not_configured', message: 'database not configured' }));
    expect(() => secret(empty, 'TELEGRAM_BOT_TOKEN')).toThrow(expect.objectContaining({ status: 503, message: 'TELEGRAM_BOT_TOKEN not configured' }));
  });
});

describe('entry module', () => {
  it('exports only handlers, Durable Object classes and entrypoints (workerd rejects anything else)', async () => {
    const mod = await import('../src/index');
    expect(Object.keys(mod).sort()).toEqual(['PublicApi', 'WarRegionDO', 'WarWorldDO', 'default']);
    const { WorkerEntrypoint } = await import('cloudflare:workers');
    expect(mod.PublicApi.prototype).toBeInstanceOf(WorkerEntrypoint);
  });
});
