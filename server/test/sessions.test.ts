/**
 * V6-ACCT-02: server-side sessions, transports, the Origin check, the online
 * gate and the telegram identity mirror (ADR-0008 §1, §3, §7).
 */
import { env, SELF } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';
import { CACHE_TTL_MS, createSession, forgetSessions, hashToken, LIFETIME, lookupSession, pruneAuth, TOUCH_EVERY_MS } from '../src/auth/sessions';
import { sessionCookie, clearSessionCookie } from '../src/auth/cookies';
import { recordPayment } from '../src/payments';
import { generateDisplayName } from '../src/names/generate';
import { nameKey } from '../src/names/validate';
import { api, BASE, devLogin, GAME_ORIGIN } from './helpers';
import { SIM_VERSION } from '../../src/sim/version';

const DB = () => env.DB!;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Players whose `players.telegram_id` mirror differs from their telegram identity (must always be none). */
async function mirrorMismatches(): Promise<unknown[]> {
  const r = await DB()
    .prepare(
      `SELECT p.id, p.telegram_id, i.subject FROM players p
       LEFT JOIN auth_identities i ON i.player_id = p.id AND i.kind = 'telegram'
       WHERE (p.telegram_id IS NULL) != (i.id IS NULL) OR CAST(p.telegram_id AS TEXT) != i.subject`,
    )
    .all();
  return r.results;
}
afterEach(async () => {
  expect(await mirrorMismatches()).toEqual([]);
});

let seq = 0;
/** A player with no log-in identity (as a deleted-identity or test-only row would be). */
async function bareSessionPlayer(): Promise<number> {
  const name = `Bare${++seq}${Date.now() % 100000}`;
  const row = await DB()
    .prepare('INSERT INTO players (display_name, display_name_key, created_at, last_seen_at) VALUES (?1, ?2, ?3, ?3) RETURNING id')
    .bind(name, nameKey(name), Date.now())
    .first<{ id: number }>();
  return row!.id;
}

async function cookieLogin(tg: number): Promise<{ token: string; pid: number; bearer: string }> {
  const { token: bearer, playerId } = await devLogin(tg);
  const { token } = await createSession(DB(), playerId, 'cookie', 'password', 'Chrome on macOS');
  return { token, pid: playerId, bearer };
}

describe('session store', () => {
  it('creates pa2_ tokens, stores only their SHA-256, and looks them up', async () => {
    const { playerId } = await devLogin(610001);
    const { token, session } = await createSession(DB(), playerId, 'cookie', 'password', 'Firefox on Linux');
    expect(token).toMatch(/^pa2_[A-Za-z0-9_-]{43}$/);
    const rows = (await DB().prepare('SELECT id_hash FROM sessions WHERE player_id = ?1').bind(playerId).all<{ id_hash: string }>()).results.map((r) => r.id_hash);
    expect(rows).toContain(await hashToken(token));
    expect(rows).not.toContain(token);
    expect(await lookupSession(DB(), token, 'cookie')).toMatchObject({ pid: playerId, sid: session.sid, transport: 'cookie', method: 'password', hasIdentity: true });
    expect(await lookupSession(DB(), 'pa2_' + 'x'.repeat(43), 'cookie')).toBeNull();
    expect(await lookupSession(DB(), 'garbage', 'cookie')).toBeNull();
  });

  it('expires at the absolute lifetime and after idling, and slides the idle expiry at most hourly', async () => {
    const { playerId } = await devLogin(610002);
    const t0 = Date.now();
    const { token, session } = await createSession(DB(), playerId, 'cookie', 'password', null, t0);
    const idle = LIFETIME.cookie.idle;
    // Idle: unseen for the idle lifetime is the end.
    forgetSessions();
    expect(await lookupSession(DB(), token, 'cookie', t0 + idle - 1)).not.toBeNull();
    const after = await DB().prepare('SELECT last_seen_at, idle_expires_at FROM sessions WHERE id_hash = ?1').bind(session.sid).first<{ last_seen_at: number; idle_expires_at: number }>();
    expect(after).toEqual({ last_seen_at: t0 + idle - 1, idle_expires_at: t0 + 2 * idle - 1 }); // slid
    // A second use within the hour writes nothing.
    expect(await lookupSession(DB(), token, 'cookie', t0 + idle + TOUCH_EVERY_MS / 2)).not.toBeNull();
    expect((await DB().prepare('SELECT last_seen_at FROM sessions WHERE id_hash = ?1').bind(session.sid).first<{ last_seen_at: number }>())!.last_seen_at).toBe(t0 + idle - 1);
    forgetSessions();
    expect(await lookupSession(DB(), token, 'cookie', t0 + 2 * idle)).toBeNull(); // idle again
    // Absolute: never past 30 days however active.
    const fresh = await createSession(DB(), playerId, 'cookie', 'password', null, t0);
    for (let t = t0; t < t0 + LIFETIME.cookie.absolute; t += 5 * DAY) {
      forgetSessions();
      expect(await lookupSession(DB(), fresh.token, 'cookie', t)).not.toBeNull();
    }
    forgetSessions();
    expect(await lookupSession(DB(), fresh.token, 'cookie', t0 + LIFETIME.cookie.absolute)).toBeNull();
    // Bearer: 24 h.
    const b = await createSession(DB(), playerId, 'bearer', 'telegram', null, t0);
    expect(b.session.expiresAt - t0).toBe(DAY);
    forgetSessions();
    expect(await lookupSession(DB(), b.token, 'bearer', t0 + DAY - 1)).not.toBeNull();
    expect(await lookupSession(DB(), b.token, 'bearer', t0 + DAY)).toBeNull();
  });

  it('caches a positive lookup for at most 30 s', async () => {
    const { playerId } = await devLogin(610003);
    const t0 = Date.now();
    const { token, session } = await createSession(DB(), playerId, 'bearer', 'telegram', null, t0);
    expect(await lookupSession(DB(), token, 'bearer', t0)).not.toBeNull();
    // Revoked by another isolate (straight in D1, this isolate's cache untouched).
    await DB().prepare('DELETE FROM sessions WHERE id_hash = ?1').bind(session.sid).run();
    expect(await lookupSession(DB(), token, 'bearer', t0 + CACHE_TTL_MS - 1)).not.toBeNull();
    expect(await lookupSession(DB(), token, 'bearer', t0 + CACHE_TTL_MS)).toBeNull();
  });

  it('the daily prune drops expired sessions, spent email tokens and idle throttle rows only', async () => {
    const { playerId } = await devLogin(610004);
    const now = Date.now();
    const live = await createSession(DB(), playerId, 'cookie', 'password', null, now);
    const old = await createSession(DB(), playerId, 'bearer', 'telegram', null, now - 2 * DAY);
    const idle = await createSession(DB(), playerId, 'cookie', 'password', null, now - 8 * DAY);
    await DB().batch([
      DB().prepare("INSERT INTO email_tokens (token_hash, purpose, email_norm, email, created_at, expires_at, used_at) VALUES ('t-used', 'reset', 'a@b.c', 'a@b.c', ?1, ?2, ?1)").bind(now, now + HOUR),
      DB().prepare("INSERT INTO email_tokens (token_hash, purpose, email_norm, email, created_at, expires_at) VALUES ('t-old', 'signup', 'a@b.c', 'a@b.c', ?1, ?1)").bind(now - DAY),
      DB().prepare("INSERT INTO email_tokens (token_hash, purpose, email_norm, email, created_at, expires_at) VALUES ('t-live', 'signup', 'a@b.c', 'a@b.c', ?1, ?2)").bind(now, now + DAY),
      DB().prepare("INSERT INTO auth_throttle (key, window_start, count) VALUES ('login:idle', ?1, 1), ('login:recent', ?2, 1)").bind(now - 8 * DAY, now - DAY),
      DB().prepare("INSERT INTO auth_throttle (key, window_start, count, locked_until) VALUES ('login:locked', ?1, 9, ?2)").bind(now - 8 * DAY, now + HOUR),
    ]);
    await pruneAuth(DB(), now);
    const sids = (await DB().prepare('SELECT id_hash FROM sessions WHERE player_id = ?1').bind(playerId).all<{ id_hash: string }>()).results.map((r) => r.id_hash);
    expect(sids).toContain(live.session.sid);
    expect(sids).not.toContain(old.session.sid);
    expect(sids).not.toContain(idle.session.sid);
    expect((await DB().prepare("SELECT token_hash FROM email_tokens WHERE token_hash LIKE 't-%'").all()).results).toEqual([{ token_hash: 't-live' }]);
    expect((await DB().prepare("SELECT key FROM auth_throttle WHERE key LIKE 'login:%' ORDER BY key").all()).results).toEqual([{ key: 'login:locked' }, { key: 'login:recent' }]);
  });
});

describe('transports', () => {
  it('a cookie session works as a cookie; a bearer session as a bearer token', async () => {
    const { token, bearer } = await cookieLogin(610101);
    expect((await api('/api/me', { cookie: token })).status).toBe(200);
    expect((await api('/api/me', { token: bearer })).status).toBe(200);
  });

  it('refuses a cookie token as bearer, and a bearer token as the cookie', async () => {
    const { token, bearer } = await cookieLogin(610102);
    expect((await api('/api/me', { token })).status).toBe(401);
    expect((await api('/api/me', { cookie: bearer })).status).toBe(401);
  });

  it('refuses both transports on one request with 400', async () => {
    const { token, bearer } = await cookieLogin(610103);
    const res = await api('/api/me', { cookie: token, token: bearer });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'two_transports' } });
  });

  it('refuses a token in the URL, even next to a valid header', async () => {
    const { bearer } = await cookieLogin(610104);
    for (const init of [{}, { token: bearer }]) {
      const res = await api(`/api/me?token=${encodeURIComponent(bearer)}`, init);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: { code: 'token_in_url' } });
    }
  });

  it('refuses a cookie POST without the game Origin (403) and accepts it with it', async () => {
    const { token } = await cookieLogin(610105);
    for (const origin of ['https://evil.example', 'https://pixelarrow.app']) {
      const res = await api('/api/auth/logout', { method: 'POST', cookie: token, headers: { origin } });
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: { code: 'bad_origin' } });
    }
    const noOrigin = await SELF.fetch(`${BASE}/api/auth/logout`, { method: 'POST', headers: { cookie: `__Host-pa_sid=${token}` } });
    expect(noOrigin.status).toBe(403);
    expect((await api('/api/me', { cookie: token })).status).toBe(200); // still signed in
    const ok = await api('/api/auth/logout', { method: 'POST', cookie: token });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('set-cookie')).toBe(clearSessionCookie());
    expect((await api('/api/me', { cookie: token })).status).toBe(401);
  });

  it('the cookie is host-only, Secure, HttpOnly, SameSite=Lax, 30 days', () => {
    const c = sessionCookie('pa2_x');
    expect(c).toBe('__Host-pa_sid=pa2_x; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=2592000');
    expect(c).not.toMatch(/domain=/i);
  });
});

describe('sockets', () => {
  const upgrade = (headers: Record<string, string>, path = `/ws/war/test-ridge?sim=${SIM_VERSION}`) => SELF.fetch(`${BASE}${path}`, { headers: { upgrade: 'websocket', ...headers } });

  it('authenticate by the cookie from the game origin, or by Sec-WebSocket-Protocol', async () => {
    const { token, bearer } = await cookieLogin(610201);
    const byCookie = await upgrade({ cookie: `__Host-pa_sid=${token}`, origin: GAME_ORIGIN, 'sec-websocket-protocol': 'pixelarrow.v1' });
    expect(byCookie.status).toBe(101);
    expect(byCookie.headers.get('sec-websocket-protocol')).toBe('pixelarrow.v1');
    byCookie.webSocket!.accept();
    byCookie.webSocket!.close(1000);
    const byProtocol = await upgrade({ 'sec-websocket-protocol': `pixelarrow.v1, ${bearer}` });
    expect(byProtocol.status).toBe(101);
    byProtocol.webSocket!.accept();
    byProtocol.webSocket!.close(1000);
  });

  it('refuse a cookie upgrade from a foreign or missing Origin', async () => {
    const { token } = await cookieLogin(610202);
    expect((await upgrade({ cookie: `__Host-pa_sid=${token}`, origin: 'https://evil.example' })).status).toBe(403);
    expect((await upgrade({ cookie: `__Host-pa_sid=${token}` })).status).toBe(403);
  });

  it('refuse ?token=, both transports, and a token over the wrong transport', async () => {
    const { token, bearer } = await cookieLogin(610203);
    expect((await upgrade({}, `/ws/war/test-ridge?sim=${SIM_VERSION}&token=${encodeURIComponent(bearer)}`)).status).toBe(400);
    expect((await upgrade({ cookie: `__Host-pa_sid=${token}`, origin: GAME_ORIGIN, 'sec-websocket-protocol': `pixelarrow.v1, ${bearer}` })).status).toBe(400);
    expect((await upgrade({ 'sec-websocket-protocol': `pixelarrow.v1, ${token}` })).status).toBe(401);
  });
});

describe('revocation and the device list', () => {
  it('lists devices by handle only, revokes one, then all', async () => {
    const { token: web, pid, bearer } = await cookieLogin(610301);
    const other = await createSession(DB(), pid, 'cookie', 'password', 'Safari on iOS');
    const list = await api('/api/auth/sessions', { cookie: web });
    expect(list.status).toBe(200);
    const text = await list.text();
    const { sessions } = JSON.parse(text) as { sessions: { handle: string; current: boolean; device: string | null }[] };
    expect(sessions).toHaveLength(3);
    expect(sessions.filter((s) => s.current)).toHaveLength(1);
    expect(sessions.every((s) => s.handle.length === 12)).toBe(true);
    for (const t of [web, bearer, other.token]) {
      expect(text).not.toContain(t);
      expect(text).not.toContain(await hashToken(t));
    }
    // Revoke one by its handle.
    const handle = other.session.sid.slice(0, 12);
    expect((await api(`/api/auth/sessions/${handle}`, { method: 'DELETE', cookie: web })).status).toBe(200);
    expect((await api('/api/me', { cookie: other.token })).status).toBe(401);
    expect((await api(`/api/auth/sessions/${handle}`, { method: 'DELETE', cookie: web })).status).toBe(404);
    expect((await api('/api/auth/sessions/short', { method: 'DELETE', cookie: web })).status).toBe(400);
    // Another player's handle is not found.
    const stranger = await devLogin(610302);
    expect((await api(`/api/auth/sessions/${(await hashToken(web)).slice(0, 12)}`, { method: 'DELETE', token: stranger.token })).status).toBe(404);
    expect((await api('/api/me', { cookie: web })).status).toBe(200);
    // Log out everywhere.
    const all = await api('/api/auth/logout-all', { method: 'POST', token: bearer });
    expect(all.status).toBe(200);
    expect(all.headers.get('set-cookie')).toBeNull(); // a bearer session has no cookie to clear
    expect((await api('/api/me', { cookie: web })).status).toBe(401);
    expect((await api('/api/me', { token: bearer })).status).toBe(401);
    expect((await api('/api/me', { token: stranger.token })).status).toBe(200);
  });

  it('a bearer log-out ends only that session', async () => {
    const a = await devLogin(610303);
    const b = await devLogin(610303);
    expect((await api('/api/auth/logout', { method: 'POST', token: a.token })).status).toBe(200);
    expect((await api('/api/me', { token: a.token })).status).toBe(401);
    expect((await api('/api/me', { token: b.token })).status).toBe(200);
  });
});

describe('Telegram log-in', () => {
  it('issues a 24 h bearer session and writes the identity with its mirror', async () => {
    const before = Date.now();
    const res = await api('/api/auth/telegram', { method: 'POST', json: { dev: { id: 610401, first_name: 'Kleon' } }, headers: { 'cf-connecting-ip': '10.61.4.1', 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Telegram' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toBeNull();
    const body = await res.json<{ token: string; expiresAt: number; player: { id: number; displayName: string } }>();
    expect(body.expiresAt - before).toBeGreaterThanOrEqual(DAY);
    expect(body.expiresAt - Date.now()).toBeLessThanOrEqual(DAY);
    const row = await DB().prepare('SELECT transport, method, device FROM sessions WHERE id_hash = ?1').bind(await hashToken(body.token)).first();
    expect(row).toEqual({ transport: 'bearer', method: 'telegram', device: 'Telegram on iOS' });
    // A generated display name, never the Telegram name (ADR-0009 N-DN-2).
    expect(body.player.displayName).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+\d{4}$/);
    expect(body.player.displayName).not.toContain('Kleon');
    const ident = await DB().prepare("SELECT subject FROM auth_identities WHERE kind = 'telegram' AND player_id = ?1").bind(body.player.id).first();
    expect(ident).toEqual({ subject: '610401' });
    // A second log-in keeps the player and the name, with a new session.
    const again = await devLogin(610401, 'Kleon the Second');
    expect(again.playerId).toBe(body.player.id);
    expect(again.name).toBe(body.player.displayName);
    expect(again.token).not.toBe(body.token);
  });

  it('a Stars payment from an unseen Telegram user creates the player through the identity module', async () => {
    const from = { id: 610402, first_name: 'Payer' };
    await recordPayment(DB(), from, { currency: 'XTR', total_amount: 1, invoice_payload: 'x', telegram_payment_charge_id: `ch-${Date.now()}` } as never);
    const ident = await DB().prepare("SELECT p.telegram_id FROM auth_identities i JOIN players p ON p.id = i.player_id WHERE i.kind = 'telegram' AND i.subject = '610402'").first();
    expect(ident).toEqual({ telegram_id: 610402 });
  });

  it('generated names are well-formed and fold to their key', () => {
    let x = 0.123;
    const rng = () => (x = (x * 9301 + 0.49297) % 1);
    for (let i = 0; i < 50; i++) expect(generateDisplayName(rng)).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+[1-9]\d{3}$/);
    expect(nameKey('Adm1n_ 0K-')).toBe('admlnok');
  });
});

describe('online gate (requirePlayable)', () => {
  it('a session without an identity may use /api/me and saves but not online play', async () => {
    const pid = await bareSessionPlayer();
    const { token } = await createSession(DB(), pid, 'cookie', 'email_link', null);
    expect((await api('/api/me', { cookie: token })).status).toBe(200);
    for (const [method, path] of [['GET', '/api/online/status'], ['GET', '/api/duel/profile'], ['POST', '/api/battle/verify']] as const) {
      const res = await api(path, { method, cookie: token, ...(method === 'POST' ? { json: {} } : {}) });
      expect(res.status, path).toBe(403);
      expect(await res.json()).toMatchObject({ error: { code: 'not_playable' } });
    }
    const ws = await SELF.fetch(`${BASE}/ws/war/test-ridge?sim=${SIM_VERSION}`, { headers: { upgrade: 'websocket', cookie: `__Host-pa_sid=${token}`, origin: GAME_ORIGIN } });
    expect(ws.status).toBe(403);
  });

  it('a deleted player has no session; a banned one gets 403 banned', async () => {
    const { token, playerId } = await devLogin(610501);
    await DB().prepare('UPDATE players SET banned_at = ?2 WHERE id = ?1').bind(playerId, Date.now()).run();
    forgetSessions();
    expect(await (await api('/api/me', { token })).json()).toMatchObject({ error: { code: 'banned' } });
    await DB().prepare('UPDATE players SET banned_at = NULL, deleted_at = ?2 WHERE id = ?1').bind(playerId, Date.now()).run();
    forgetSessions();
    expect((await api('/api/me', { token })).status).toBe(401);
    await DB().prepare('UPDATE players SET deleted_at = NULL WHERE id = ?1').bind(playerId).run();
  });
});
