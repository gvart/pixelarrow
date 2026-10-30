import { describe, expect, it } from 'vitest';
import type { Env } from '../src/env';
import { db } from '../src/middleware';
import { api, devLogin } from './helpers';

describe('POST /api/auth/dev (dev sign-in)', () => {
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
  it('answers 503 when D1 is not configured', () => {
    const empty = {} as Env;
    expect(() => db(empty)).toThrow(expect.objectContaining({ status: 503, code: 'not_configured', message: 'database not configured' }));
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
