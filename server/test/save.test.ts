import { describe, expect, it } from 'vitest';
import { api, devLogin } from './helpers';

const save = (gold: number) => ({ v: 3, gold, heroes: [], stash: [] });

describe('save storage', () => {
  it('starts empty, then enforces optimistic concurrency', async () => {
    const { token } = await devLogin(100);
    const empty = await api('/api/save', { token });
    expect(await empty.json()).toEqual({ revision: 0, version: null, data: null, updatedAt: null });

    const first = await api('/api/save', { method: 'PUT', token, json: { revision: 0, data: save(10) } });
    expect(first.status).toBe(200);
    expect((await first.json<{ revision: number }>()).revision).toBe(1);

    // A second device that still thinks there is no save conflicts.
    const stale = await api('/api/save', { method: 'PUT', token, json: { revision: 0, data: save(99) } });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: { code: 'save_conflict', revision: 1 } });

    const second = await api('/api/save', { method: 'PUT', token, json: { revision: 1, data: save(20) } });
    expect((await second.json<{ revision: number }>()).revision).toBe(2);
    const staleAgain = await api('/api/save', { method: 'PUT', token, json: { revision: 1, data: save(30) } });
    expect(staleAgain.status).toBe(409);

    const got = await (await api('/api/save', { token })).json<{ revision: number; version: number; data: { gold: number } }>();
    expect(got).toMatchObject({ revision: 2, version: 3, data: { gold: 20 } });
  });

  it('keeps saves per player', async () => {
    const a = await devLogin(101);
    const b = await devLogin(102);
    await api('/api/save', { method: 'PUT', token: a.token, json: { revision: 0, data: save(1) } });
    const got = await (await api('/api/save', { token: b.token })).json<{ revision: number }>();
    expect(got.revision).toBe(0);
  });

  it('rejects oversized and malformed saves', async () => {
    const { token } = await devLogin(103);
    const big = await api('/api/save', { method: 'PUT', token, json: { revision: 0, data: { v: 3, blob: 'x'.repeat(600 * 1024) } } });
    expect(big.status).toBe(413);
    const noVersion = await api('/api/save', { method: 'PUT', token, json: { revision: 0, data: { gold: 1 } } });
    expect(noVersion.status).toBe(400);
    expect(await noVersion.json()).toMatchObject({ error: { code: 'bad_request' } });
    const unauth = await api('/api/save', { method: 'PUT', json: { revision: 0, data: save(1) } });
    expect(unauth.status).toBe(401);
  });
});
