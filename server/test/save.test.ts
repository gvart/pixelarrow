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

describe('save version downgrade guard (ST-02b)', () => {
  const put = (token: string, revision: number, data: unknown) => api('/api/save', { method: 'PUT', token, json: { revision, data } });
  const stored = async (token: string) =>
    (await api('/api/save', { token })).json<{ revision: number; version: number; data: { v: number; gold: number } }>();
  /** What the live main client (SAVE_VERSION 5) uploads: the v5 blob shape, nothing else. */
  const mainSave = (gold: number) => ({ v: 5, seq: 3, savedAt: 1, gold, heroes: [], stash: [], world: {}, settings: {} });

  it('refuses an older-version upload over a newer stored save and keeps the stored copy', async () => {
    const { token } = await devLogin(104);
    expect((await put(token, 0, { v: 6, gold: 600 })).status).toBe(200);

    const down = await put(token, 1, mainSave(5));
    expect(down.status).toBe(409);
    expect(await down.json()).toMatchObject({ error: { code: 'save_version_downgrade', version: 6, revision: 1 } });
    expect(await stored(token)).toMatchObject({ revision: 1, version: 6, data: { v: 6, gold: 600 } });

    // Stale revision too: still the downgrade answer, not save_conflict (which a main client resolves by overwriting).
    const staleDown = await put(token, 0, mainSave(5));
    expect(staleDown.status).toBe(409);
    expect(await staleDown.json()).toMatchObject({ error: { code: 'save_version_downgrade', version: 6, revision: 1 } });
    expect(await stored(token)).toMatchObject({ revision: 1, version: 6, data: { gold: 600 } });
  });

  it('accepts same- and higher-version uploads exactly as before', async () => {
    const { token } = await devLogin(105);
    expect((await put(token, 0, mainSave(1))).status).toBe(200);
    const same = await put(token, 1, mainSave(2));
    expect(same.status).toBe(200);
    expect(await same.json()).toMatchObject({ revision: 2 });
    const up = await put(token, 2, { v: 6, gold: 3 });
    expect(up.status).toBe(200);
    expect(await stored(token)).toMatchObject({ revision: 3, version: 6, data: { gold: 3 } });
    // A same-version upload on a stale revision is still an ordinary conflict.
    const stale = await put(token, 2, { v: 6, gold: 4 });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: { code: 'save_conflict', revision: 3 } });
  });

  it('accepts a main-client-shaped upload over a stored save of the same or older version', async () => {
    const { token } = await devLogin(106);
    expect((await put(token, 0, { v: 3, gold: 1 })).status).toBe(200);
    const res = await put(token, 1, mainSave(9));
    expect(res.status).toBe(200);
    expect(await stored(token)).toMatchObject({ revision: 2, version: 5, data: { gold: 9 } });
  });

  it('rejects malformed versions without touching the stored save', async () => {
    const { token } = await devLogin(107);
    expect((await put(token, 0, { v: 6, gold: 7 })).status).toBe(200);
    for (const v of ['6', 6.5, 0, -1, null, 1e300, { n: 6 }]) {
      const res = await put(token, 1, { v, gold: 0 });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: { code: 'bad_request' } });
    }
    expect((await put(token, 1, [6])).status).toBe(400);
    expect(await stored(token)).toMatchObject({ revision: 1, version: 6, data: { gold: 7 } });
  });
});
