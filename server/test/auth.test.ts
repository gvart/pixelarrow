import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { Env } from '../src/env';
import { db, secret } from '../src/middleware';
import { signSession, verifySession } from '../src/session';
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

describe('session tokens', () => {
  const secret = 'unit-secret';
  it('round-trips and expires', async () => {
    const { token } = await signSession({ pid: 1, tg: 2, name: 'A' }, secret, 1000, 60);
    expect((await verifySession(token, secret, 1030))?.pid).toBe(1);
    expect(await verifySession(token, secret, 1061)).toBeNull();
  });
  it('rejects tampering and the wrong secret', async () => {
    const { token } = await signSession({ pid: 1, tg: 2, name: 'A' }, secret);
    const [p, body, sig] = token.split('.');
    const forged = btoa(JSON.stringify({ pid: 2, tg: 2, name: 'A', iat: 0, exp: 9e9 })).replace(/=+$/, '');
    expect(await verifySession(`${p}.${forged}.${sig}`, secret)).toBeNull();
    expect(await verifySession(`${p}.${body}.${sig}`, 'other')).toBeNull();
    expect(await verifySession('garbage', secret)).toBeNull();
  });
});

describe('POST /api/auth/telegram', () => {
  it('logs in with valid initData (JSON or raw body), upserts the player', async () => {
    const res = await api('/api/auth/telegram', { method: 'POST', json: { initData: await initData() } });
    expect(res.status).toBe(200);
    const body = await res.json<{ token: string; player: { telegramId: number; firstName: string } }>();
    expect(body.player).toMatchObject({ telegramId: user.id, firstName: 'Leonidas' });

    const raw = await api('/api/auth/telegram', { method: 'POST', body: await initData(), headers: { 'content-type': 'text/plain' } });
    expect(raw.status).toBe(200);
    const rows = await env.DB!.prepare('SELECT COUNT(*) AS n FROM players WHERE telegram_id = ?').bind(user.id).first<{ n: number }>();
    expect(rows?.n).toBe(1);

    const me = await api('/api/me', { token: body.token });
    expect(me.status).toBe(200);
    expect((await me.json<{ player: { username: string } }>()).player.username).toBe('leo');
  });

  it('rejects bad initData with the standard error shape', async () => {
    const res = await api('/api/auth/telegram', { method: 'POST', json: { initData: 'auth_date=1&hash=00' } });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: 'invalid_init_data' } });
  });

  it('requires a session for /api/me', async () => {
    expect((await api('/api/me')).status).toBe(401);
    expect((await api('/api/me', { token: 'pa1.x.y' })).status).toBe(401);
  });

  it('supports DEV_AUTH logins when enabled', async () => {
    const { token } = await devLogin(42);
    expect((await api('/api/me', { token })).status).toBe(200);
  });

  it('rate-limits logins per IP', async () => {
    const headers = { 'cf-connecting-ip': '203.0.113.9' };
    const statuses: number[] = [];
    for (let i = 0; i < 22; i++) {
      const r = await api('/api/auth/telegram', { method: 'POST', json: { dev: { id: 5000 + i } }, headers });
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe('health', () => {
  it('reports configuration without leaking secrets', async () => {
    const res = await api('/api/health');
    expect(await res.json()).toMatchObject({ ok: true, db: true, secrets: { telegramBotToken: true, sessionSecret: true } });
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
    expect(() => secret(empty, 'SESSION_SECRET')).toThrow(expect.objectContaining({ status: 503, message: 'SESSION_SECRET not configured' }));
  });
});

describe('entry module', () => {
  it('exports only handlers and Durable Object classes (workerd rejects anything else)', async () => {
    const mod = await import('../src/index');
    expect(Object.keys(mod).sort()).toEqual(['DuelDO', 'MatchmakerDO', 'RegionDO', 'default']);
  });
});
