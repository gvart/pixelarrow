/**
 * V6-LINK-01: GET /api/account, renames (PUT /api/account/name), the public
 * boards opt-out and the admin rename (ADR-0009 §6, accounts-v6.md §14 Q5).
 */
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetRateLimits } from '../src/rateLimit';
import { nameKey } from '../src/names/validate';
import { api, devLogin } from './helpers';

const DB = () => env.DB!;
const DAY = 86_400_000;
const ADMIN = 'test-admin-token-0123456789abcdef0123456789';

let tg = 7_100_000;
const login = () => devLogin(++tg, 'RealFirstName');

const account = async (token: string) => {
  const r = await api('/api/account', { token });
  expect(r.status).toBe(200);
  return r.json<any>();
};
const rename = (token: string, name: unknown) => api('/api/account/name', { method: 'PUT', token, json: { name } });
const errorOf = async (r: Response) => (await r.json<{ error: Record<string, unknown> }>()).error;
const adminRename = (pid: number, requestId = `req_${crypto.randomUUID().replace(/-/g, '')}`) =>
  api(`/api/admin/players/${pid}/rename`, { method: 'POST', token: ADMIN, json: { requestId, reason: 'offensive name' } });

beforeEach(() => resetRateLimits());

describe('GET /api/account', () => {
  it('needs a session', async () => {
    expect((await api('/api/account')).status).toBe(401);
  });

  it('summarises the own account: name, identities, boards flag, sessions, purchases and the name status', async () => {
    const me = await login();
    const body = await account(me.token);
    expect(body).toEqual({
      displayName: me.name,
      identities: [{ kind: 'telegram', telegramUsername: null }],
      publicBoards: true,
      sessions: 1,
      hasPurchases: false,
      name: { freeChange: true, nextChangeAt: null, lockedUntil: null, moderatedAt: null },
    });
  });

  it('masks the email of a password identity and reports purchases', async () => {
    const me = await login();
    const now = Date.now();
    await DB().batch([
      DB().prepare(`INSERT INTO auth_identities (player_id, kind, subject, email, verified_at, created_at) VALUES (?1, 'password', 'jane.doe@gmail.com', 'Jane.Doe@gmail.com', ?2, ?2)`).bind(me.playerId, now),
      DB().prepare(`INSERT INTO purchases (telegram_payment_charge_id, player_id, product_id, currency, stars_amount, payload, created_at) VALUES (?1, ?2, 'founder', 'XTR', 100, '{}', ?3)`).bind(`ch_${me.playerId}`, me.playerId, now),
    ]);
    const body = await account(me.token);
    expect(body.identities).toContainEqual({ kind: 'password', emailMasked: 'j***@g***.com' });
    expect(body.hasPurchases).toBe(true);
  });
});

describe('PUT /api/account/name', () => {
  it('the first rename is free; the next one waits 30 days', async () => {
    const me = await login();
    const r = await rename(me.token, '  Night  Owl ');
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ displayName: 'Night Owl' });
    const after = await account(me.token);
    expect(after.displayName).toBe('Night Owl');
    expect(after.name.freeChange).toBe(false);
    expect(after.name.nextChangeAt).toBeGreaterThan(Date.now() + 29 * DAY);

    const again = await rename(me.token, 'Day Owl');
    expect(again.status).toBe(429);
    expect(await errorOf(again)).toMatchObject({ code: 'cooldown', nextChangeAt: after.name.nextChangeAt });

    await DB().prepare('UPDATE players SET name_changed_at = ?2 WHERE id = ?1').bind(me.playerId, Date.now() - 31 * DAY).run();
    expect((await rename(me.token, 'Day Owl')).status).toBe(200);
  });

  it('writes every change to display_name_history', async () => {
    const me = await login();
    await rename(me.token, 'Quiet Fox');
    const h = await DB().prepare('SELECT old, new, old_key, by_admin FROM display_name_history WHERE player_id = ?1').bind(me.playerId).all();
    expect(h.results).toEqual([{ old: me.name, new: 'Quiet Fox', old_key: nameKey(me.name), by_admin: 0 }]);
  });

  it('refuses invalid names with the validator reason, and blocked and reserved names alike', async () => {
    const me = await login();
    for (const [name, reason] of [['ab', 'length'], ['a@b.com', 'chars'], ['Bаdger', 'mixed_script'], ['Adm1n', 'reserved'], ['FuckFace', 'blocked']] as const) {
      const r = await rename(me.token, name);
      expect(r.status, name).toBe(400);
      expect(await errorOf(r)).toMatchObject({ code: 'invalid_name', reason, message: "This name isn't allowed" });
    }
    expect((await rename(me.token, 42)).status).toBe(400);
    expect((await account(me.token)).name.freeChange).toBe(true);
  });

  it('names are unique through the folded key, look-alikes included', async () => {
    const a = await login();
    const b = await login();
    expect((await rename(a.token, 'Iron Wolf')).status).toBe(200);
    for (const n of ['iron wolf', 'lron_W0lf', 'IRON-WOLF']) {
      const r = await rename(b.token, n);
      expect(r.status, n).toBe(409);
      expect((await errorOf(r)).code).toBe('taken');
    }
  });

  it('a freed name stays held for 30 days, except for the player who freed it', async () => {
    const a = await login();
    const b = await login();
    await rename(a.token, 'Old Name');
    await DB().prepare('UPDATE players SET name_changed_at = 0 WHERE id = ?1').bind(a.playerId).run();
    await rename(a.token, 'New Name');
    expect((await rename(b.token, 'Old Name')).status).toBe(409);
    await DB().prepare('UPDATE players SET name_changed_at = 0 WHERE id = ?1').bind(a.playerId).run();
    expect((await rename(a.token, 'Old Name')).status).toBe(200); // a takes it back
    // Thirty days on, a name freed by a third player is free again.
    await DB().prepare('UPDATE display_name_history SET changed_at = ?1').bind(Date.now() - 31 * DAY).run();
    await DB().prepare('UPDATE players SET name_changed_at = 0 WHERE id = ?1').bind(a.playerId).run();
    await rename(a.token, 'Third Name');
    await DB().prepare('UPDATE display_name_history SET changed_at = ?1').bind(Date.now() - 31 * DAY).run();
    expect((await rename(b.token, 'Old Name')).status).toBe(200);
  });

  it('a rename takes effect on the next request (sessions carry no name)', async () => {
    const me = await login();
    await rename(me.token, 'Fresh Name');
    const r = await api('/api/me', { token: me.token });
    expect((await r.json<any>()).player.displayName).toBe('Fresh Name');
  });
});

describe('PUT /api/account/public-boards', () => {
  it('turns the landing-page boards off and on', async () => {
    const me = await login();
    const off = await api('/api/account/public-boards', { method: 'PUT', token: me.token, json: { enabled: false } });
    expect(off.status).toBe(200);
    expect(await off.json()).toEqual({ publicBoards: false });
    expect((await account(me.token)).publicBoards).toBe(false);
    expect((await DB().prepare('SELECT public_boards FROM players WHERE id = ?1').bind(me.playerId).first<{ public_boards: number }>())!.public_boards).toBe(0);
    await api('/api/account/public-boards', { method: 'PUT', token: me.token, json: { enabled: true } });
    expect((await account(me.token)).publicBoards).toBe(true);
    expect((await api('/api/account/public-boards', { method: 'PUT', token: me.token, json: { enabled: 'no' } })).status).toBe(400);
  });
});

describe('POST /api/admin/players/:id/rename', () => {
  it('resets to a generated name, locks renames for 7 days and writes admin_audit and the history', async () => {
    const me = await login();
    await rename(me.token, 'Bad Name');
    const r = await adminRename(me.playerId);
    expect(r.status).toBe(200);
    const out = await r.json<any>();
    expect(out.displayName).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+\d{4}$/);
    expect(out.lockedUntil).toBeGreaterThan(Date.now() + 6 * DAY);

    const body = await account(me.token);
    expect(body.displayName).toBe(out.displayName);
    expect(body.name.lockedUntil).toBe(out.lockedUntil);
    expect(body.name.moderatedAt).toEqual(expect.any(Number));

    const locked = await rename(me.token, 'Good Name');
    expect(locked.status).toBe(423);
    expect(await errorOf(locked)).toMatchObject({ code: 'locked', lockedUntil: out.lockedUntil });

    const audit = await DB().prepare("SELECT actor, detail FROM admin_audit WHERE action = 'rename' AND player_id = ?1").bind(me.playerId).first<{ actor: string; detail: string }>();
    expect(audit!.actor).toBe('ops');
    expect(JSON.parse(audit!.detail)).toMatchObject({ reason: 'offensive name', old: 'Bad Name' });
    const h = await DB().prepare('SELECT old, new, by_admin FROM display_name_history WHERE player_id = ?1 ORDER BY id DESC LIMIT 1').bind(me.playerId).first();
    expect(h).toEqual({ old: 'Bad Name', new: out.displayName, by_admin: 1 });
    // The bad name stays held for 30 days.
    const other = await login();
    expect((await rename(other.token, 'Bad Name')).status).toBe(409);
  });

  it('needs the admin token, and the player search matches display names', async () => {
    const me = await login();
    expect((await api(`/api/admin/players/${me.playerId}/rename`, { method: 'POST', token: me.token, json: { requestId: 'req_12345678', reason: 'x y z' } })).status).toBe(401);
    await rename(me.token, 'Searchable One');
    const r = await api('/api/admin/players?q=Searchable', { token: ADMIN });
    expect((await r.json<any>()).players.map((p: { id: number }) => p.id)).toContain(me.playerId);
  });
});
