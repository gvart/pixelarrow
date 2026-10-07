/**
 * Operations: client telemetry (crash reports, analytics events), bans and
 * the admin API (auth, audited idempotent actions, refunds, season controls).
 */
import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeEvent, scrubText } from '../../src/platform/analyticsSchema';
import { forgetBans } from '../src/ban';
import { resetRateLimits } from '../src/rateLimit';
import { retentionEvents } from '../src/routes/auth';
import { setAnalyticsSink, type DatasetName } from '../src/telemetry/analytics';
import { ERROR_BATCHES_PER_MIN, resetTelemetryLimits } from '../src/telemetry/routes';
import { forgetSeasonCache } from '../src/online/store';
import { api, devLogin, mockTelegram, webhook } from './helpers';

const ADMIN = 'test-admin-token-0123456789abcdef0123456789';
const DB = () => env.DB!;

let points: { dataset: DatasetName; point: AnalyticsEngineDataPoint }[] = [];
beforeEach(() => {
  resetRateLimits();
  resetTelemetryLimits();
  forgetBans();
  forgetSeasonCache();
  points = [];
  setAnalyticsSink((dataset, point) => points.push({ dataset, point }));
});
afterEach(() => {
  setAnalyticsSink(null);
  vi.restoreAllMocks();
});

const events = (name?: string) => points.filter((p) => p.dataset === 'events' && (!name || p.point.blobs?.[0] === name)).map((p) => p.point);
let ipN = 1;
const freshIp = () => `10.9.${ipN >> 8}.${ipN++ & 255}`;

function adminApi(path: string, init: { method?: string; json?: unknown; token?: string; ip?: string } = {}) {
  return api(`/api/admin${path}`, { method: init.method ?? (init.json ? 'POST' : 'GET'), json: init.json, token: init.token ?? ADMIN, headers: { 'cf-connecting-ip': init.ip ?? freshIp() } });
}
const rid = () => `req_${crypto.randomUUID().replace(/-/g, '')}`;

// ------------------------------------------------------------------ telemetry

describe('POST /api/telemetry/errors', () => {
  const report = (over: Record<string, unknown> = {}) => ({
    app: { version: 'abc1234', platform: 'android', tg: '8.0' },
    device: { w: 390, h: 844, dpr: 3 },
    errors: [{ kind: 'error', message: 'Cannot read properties of undefined (reading "x") at 42', stack: 'TypeError: boom\n    at foo (https://pixelarrow.app/assets/index.js?v=1:10:20)', scene: 'Battle', count: 1, breadcrumbs: [{ t: 1, c: 'scene', m: 'start:Battle' }] }],
    ...over,
  });

  it('stores reports anonymously, deduplicated by fingerprint, and counts them in Analytics Engine', async () => {
    const ip = freshIp();
    const post = (body: unknown) => api('/api/telemetry/errors', { method: 'POST', json: body, headers: { 'cf-connecting-ip': ip } });
    expect((await post(report())).status).toBe(200);
    const again = report();
    (again.errors[0] as { message: string }).message = 'Cannot read properties of undefined (reading "x") at 77'; // numbers differ: same group
    expect((await post(again)).status).toBe(200);
    const rows = await DB().prepare("SELECT * FROM client_errors WHERE app_version = 'abc1234'").all<{ count: number; scene: string; platform: string; stack: string }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]).toMatchObject({ count: 2, scene: 'Battle', platform: 'android' });
    expect(rows.results[0].stack).not.toContain('?v=1');
    expect(points.filter((p) => p.dataset === 'errors')).toHaveLength(2);
  });

  it('attaches the player of a valid token (header or body) and scrubs secrets', async () => {
    const { token, playerId } = await devLogin(930001);
    const body = report({ token, app: { version: 'scrub01' } });
    body.errors[0] = { ...body.errors[0], message: `auth failed token=${token} initData=query_id%3DAAH` };
    const res = await api('/api/telemetry/errors', { method: 'POST', json: body, headers: { 'cf-connecting-ip': freshIp() } });
    expect(res.status).toBe(200);
    const row = await DB().prepare("SELECT message, last_player FROM client_errors WHERE app_version = 'scrub01'").first<{ message: string; last_player: number }>();
    expect(row!.last_player).toBe(playerId);
    expect(row!.message).not.toContain(token);
    expect(row!.message).not.toContain('AAH');
  });

  it('validates the body', async () => {
    const post = (body: unknown) => api('/api/telemetry/errors', { method: 'POST', json: body, headers: { 'cf-connecting-ip': freshIp() } });
    expect((await post({ errors: [] })).status).toBe(400);
    expect((await post({ errors: [{ kind: 'nope', message: 'x' }] })).status).toBe(400);
    expect((await post({ errors: Array.from({ length: 11 }, () => ({ kind: 'error', message: 'x' })) })).status).toBe(400);
    expect((await post({ errors: [{ kind: 'error', message: 'x'.repeat(2001) }] })).status).toBe(400);
    const big = await api('/api/telemetry/errors', { method: 'POST', body: 'x'.repeat(60_000), headers: { 'content-type': 'application/json', 'cf-connecting-ip': freshIp() } });
    expect(big.status).toBe(413);
  });

  it('rate limits per client IP', async () => {
    const ip = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i <= ERROR_BATCHES_PER_MIN; i++) {
      statuses.push((await api('/api/telemetry/errors', { method: 'POST', json: report({ app: { version: 'rl' } }), headers: { 'cf-connecting-ip': ip } })).status);
    }
    expect(statuses.slice(0, ERROR_BATCHES_PER_MIN).every((s) => s === 200)).toBe(true);
    expect(statuses[ERROR_BATCHES_PER_MIN]).toBe(429);
  });
});

describe('analytics events', () => {
  it('the allowlist rejects unknown events, server-only events from clients and bad props', () => {
    expect(normalizeEvent('made_up', {}, 'client')).toBeNull();
    expect(normalizeEvent('purchase', { pack: 'drachmae_100' }, 'client')).toBeNull();
    expect(normalizeEvent('purchase', { pack: 'drachmae_100', drachmae: 100, stars: 100 }, 'server')).toEqual({ event: 'purchase', strings: ['drachmae_100'], numbers: [100, 100] });
    // A free-text value or a wrong enum is dropped (its column stays, empty).
    expect(normalizeEvent('tutorial_step', { id: 'Hello World!', step: 3.4, extra: 'x' }, 'client')).toEqual({ event: 'tutorial_step', strings: [''], numbers: [3] });
    expect(normalizeEvent('battle_result', { mode: 'offline', result: 'maybe', ticks: 1e12 }, 'client')).toEqual({ event: 'battle_result', strings: ['offline', ''], numbers: [1_000_000] });
    expect(scrubText('see https://x.app/p?tgWebAppData=user%3D123 and pa1.eyJhbGciOiJIUzI1NiJ9abcdefghijklmnop.c2lnbmF0dXJlc2lnbmF0dXJlc2ln')).toBe('see https://x.app/p and <redacted>');
  });

  it('accepts allowlisted client events, records first_battle once, honours opt-out', async () => {
    const { token, playerId } = await devLogin(930010);
    const post = (json: unknown, headers: Record<string, string> = {}) => api('/api/telemetry/events', { method: 'POST', token, json, headers });
    const res = await post({
      app: { version: 'v123', platform: 'ios' },
      events: [
        { e: 'session_start', p: { tg: '8.0', lang: 'ru' } },
        { e: 'tutorial_step', p: { id: 'deploy', step: 2 } },
        { e: 'battle_result', p: { mode: 'offline', result: 'win', ticks: 900 } },
        { e: 'battle_result', p: { mode: 'online', result: 'win' } }, // the server records online results itself
        { e: 'purchase', p: { pack: 'drachmae_100' } }, // server-only
        { e: 'nope' },
      ],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accepted: 3, rejected: ['battle_result', 'purchase', 'nope'] });
    const step = events('tutorial_step')[0];
    expect(step).toEqual({ indexes: [String(playerId)], blobs: ['tutorial_step', 'client', 'ios', 'v123', 'deploy'], doubles: [playerId, -1, 2] });
    expect(events('first_battle')).toHaveLength(1);
    expect(events('first_battle')[0].blobs).toEqual(['first_battle', 'server', 'ios', 'v123', 'offline']);

    await post({ events: [{ e: 'battle_result', p: { mode: 'trial', result: 'loss' } }] });
    expect(events('first_battle')).toHaveLength(1);

    points = [];
    const off = await post({ events: [{ e: 'session_start' }] }, { 'x-pa-analytics': '0' });
    expect(await off.json()).toEqual({ accepted: 0, rejected: [] });
    expect((await post({ optOut: true, events: [{ e: 'session_start' }] })).status).toBe(200);
    expect(events()).toHaveLength(0);
  });

  it('needs a session', async () => {
    expect((await api('/api/telemetry/events', { method: 'POST', json: { events: [{ e: 'session_start' }] } })).status).toBe(401);
  });

  it('server events: install at first login, purchase and first_purchase unless opted out', async () => {
    const tg = 930020;
    await devLogin(tg);
    expect(events('install')).toHaveLength(1);
    const { token, playerId } = await devLogin(tg);
    expect(events('install')).toHaveLength(1); // same day: no marker

    const pay = (charge: string) =>
      webhook({
        update_id: 1,
        message: { message_id: 1, chat: { id: tg, type: 'private' }, from: { id: tg }, successful_payment: { currency: 'XTR', total_amount: 100, invoice_payload: `v1:drachmae_100:${playerId}:abcd1234`, telegram_payment_charge_id: charge } },
      });
    mockTelegram();
    await pay('ops-charge-1');
    await pay('ops-charge-1'); // retry: no second event
    expect(events('purchase').map((p) => p.blobs![4])).toEqual(['drachmae_100']);
    expect(events('purchase')[0].doubles).toEqual([playerId, -1, 100, 100]);
    expect(events('first_purchase')).toHaveLength(1);

    expect((await api('/api/telemetry/consent', { method: 'POST', token, json: { analytics: false } })).status).toBe(200);
    await pay('ops-charge-2');
    expect(events('purchase')).toHaveLength(1);
    const credited = await DB().prepare("SELECT COUNT(*) AS n FROM drachmae_ledger WHERE player_id = ?1 AND kind = 'pack'").bind(playerId).first<{ n: number }>();
    expect(credited!.n).toBe(2); // opting out never changes the purchase itself
  });

  it('retention markers come from the previous last-seen day', () => {
    const day = 86_400_000;
    const t0 = Date.UTC(2026, 0, 10, 12);
    expect(retentionEvents(null, t0)).toEqual(['install']);
    expect(retentionEvents({ created_at: t0, last_seen_at: t0 }, t0 + 3_600_000)).toEqual([]);
    expect(retentionEvents({ created_at: t0, last_seen_at: t0 }, t0 + day)).toEqual(['return_d1']);
    expect(retentionEvents({ created_at: t0, last_seen_at: t0 + day }, t0 + day + 60_000)).toEqual([]);
    expect(retentionEvents({ created_at: t0, last_seen_at: t0 + 3 * day }, t0 + 7 * day)).toEqual(['return_d7']);
    expect(retentionEvents({ created_at: t0, last_seen_at: t0 + 3 * day }, t0 + 8 * day)).toEqual([]);
  });
});

// ------------------------------------------------------------------ admin

describe('admin auth', () => {
  it('rejects players, wrong and short tokens; accepts a named token', async () => {
    const { token } = await devLogin(931001);
    expect((await adminApi('/me', { token })).status).toBe(401); // a game session is never an admin
    expect((await adminApi('/me', { token: 'x'.repeat(40) })).status).toBe(401);
    expect((await adminApi('/me', { token: 'tooshort' })).status).toBe(401); // below the 32-char minimum: ignored
    expect((await api('/api/admin/overview')).status).toBe(401);
    const me = await adminApi('/me');
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual({ actor: 'ops' });
  });

  it('locks an IP out after repeated failures', async () => {
    const ip = freshIp();
    for (let i = 0; i < 10; i++) expect((await adminApi('/me', { token: `wrong-${i}`.padEnd(40, 'x'), ip })).status).toBe(401);
    expect((await adminApi('/me', { token: 'w'.repeat(40), ip })).status).toBe(429);
    expect((await adminApi('/me', { ip })).status).toBe(429); // even the right token, for the window
    expect((await adminApi('/me')).status).toBe(200);
  });

  it('serves the admin page with a strict CSP', async () => {
    const page = await api('/admin');
    expect(page.status).toBe(200);
    expect(page.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(await page.text()).toContain('Pixelarrow admin');
    expect((await api('/admin/app.js')).headers.get('content-type')).toContain('javascript');
  });
});

describe('bans', () => {
  it('a ban blocks existing sessions and sign-in; unban restores both; both audited', async () => {
    const { token, playerId } = await devLogin(931010);
    expect((await api('/api/me', { token })).status).toBe(200);
    const ban = await adminApi(`/players/${playerId}/ban`, { json: { requestId: rid(), reason: 'cheating in duels' } });
    expect(ban.status).toBe(200);
    const me = await api('/api/me', { token });
    expect(me.status).toBe(403);
    expect(((await me.json()) as { error: { code: string } }).error.code).toBe('banned');
    await expect(devLogin(931010)).rejects.toThrow(/403/);
    expect((await api('/api/save', { token })).status).toBe(403);

    expect((await adminApi(`/players/${playerId}/unban`, { json: { requestId: rid(), reason: 'appeal accepted' } })).status).toBe(200);
    expect((await api('/api/me', { token })).status).toBe(200);
    const audit = await DB().prepare('SELECT action, actor FROM admin_audit WHERE player_id = ?1 ORDER BY id').bind(playerId).all<{ action: string; actor: string }>();
    expect(audit.results).toEqual([
      { action: 'ban', actor: 'ops' },
      { action: 'unban', actor: 'ops' },
    ]);
  });

  it('needs a reason', async () => {
    const { playerId } = await devLogin(931011);
    expect((await adminApi(`/players/${playerId}/ban`, { json: { requestId: rid(), reason: '' } })).status).toBe(400);
    expect((await adminApi(`/players/${playerId}/ban`, { json: { reason: 'no request id' } })).status).toBe(400);
  });
});

describe('admin adjust and refund', () => {
  it('adjusts Drachmae once per request id, audited', async () => {
    const { token, playerId } = await devLogin(931020);
    const requestId = rid();
    const body = { requestId, currency: 'drachmae', delta: 250, reason: 'compensation for outage' };
    const first = await adminApi(`/players/${playerId}/adjust`, { json: body });
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ applied: true, balance: 250, replayed: false });
    const second = await adminApi(`/players/${playerId}/adjust`, { json: body });
    expect(await second.json()).toMatchObject({ balance: 250, replayed: true });
    const wallet = await (await api('/api/economy/wallet', { token })).json<{ drachmae: number }>();
    expect(wallet.drachmae).toBe(250);
    const audit = await DB().prepare('SELECT COUNT(*) AS n FROM admin_audit WHERE request_id = ?1').bind(requestId).first<{ n: number }>();
    expect(audit!.n).toBe(1);
    // The same id for another player or action is refused.
    const other = await devLogin(931021);
    expect((await adminApi(`/players/${other.playerId}/adjust`, { json: body })).status).toBe(409);
  });

  it('adjusts season gold (never below zero) and needs a joined profile', async () => {
    const { token, playerId } = await devLogin(931022);
    expect((await adminApi(`/players/${playerId}/adjust`, { json: { requestId: rid(), currency: 'gold', delta: 10, reason: 'test gold' } })).status).toBe(409);
    expect((await api('/api/online/profile', { method: 'POST', token })).status).toBe(200);
    const before = (await DB().prepare('SELECT gold FROM online_profiles WHERE player_id = ?1').bind(playerId).first<{ gold: number }>())!.gold;
    const requestId = rid();
    const r = await adminApi(`/players/${playerId}/adjust`, { json: { requestId, currency: 'gold', delta: 40, reason: 'test gold' } });
    expect(await r.json()).toMatchObject({ balance: before + 40 });
    await adminApi(`/players/${playerId}/adjust`, { json: { requestId, currency: 'gold', delta: 40, reason: 'test gold' } });
    const down = await adminApi(`/players/${playerId}/adjust`, { json: { requestId: rid(), currency: 'gold', delta: -1_000_000, reason: 'test gold' } });
    expect(await down.json()).toMatchObject({ balance: 0 });
    expect(events('online_join')).toHaveLength(1);
  });

  it('refunds a Stars pack through Telegram, debits the Drachmae, and never twice', async () => {
    const tg = 931030;
    const { token, playerId } = await devLogin(tg);
    const charge = 'ops-refund-charge-1';
    const calls = mockTelegram();
    await webhook({
      update_id: 5,
      message: { message_id: 5, chat: { id: tg, type: 'private' }, from: { id: tg }, successful_payment: { currency: 'XTR', total_amount: 250, invoice_payload: `v1:drachmae_275:${playerId}:abcd1234`, telegram_payment_charge_id: charge } },
    });
    expect((await (await api('/api/economy/wallet', { token })).json<{ drachmae: number }>()).drachmae).toBe(275);

    const requestId = rid();
    const res = await adminApi(`/purchases/${charge}/refund`, { json: { requestId, reason: 'player asked via /paysupport' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ refunded: true, alreadyRefunded: false, telegram: 'refunded', drachmae: 0 });
    const refundCalls = () => calls.filter((c) => c.method === 'refundStarPayment');
    expect(refundCalls()).toHaveLength(1);
    expect(refundCalls()[0].params).toEqual({ user_id: tg, telegram_payment_charge_id: charge });

    // Retry of the same request: the stored answer, no second Telegram call.
    expect(await (await adminApi(`/purchases/${charge}/refund`, { json: { requestId, reason: 'player asked via /paysupport' } })).json()).toMatchObject({ replayed: true });
    // A new request on a refunded purchase: nothing sent to Telegram either.
    expect(await (await adminApi(`/purchases/${charge}/refund`, { json: { requestId: rid(), reason: 'double click' } })).json()).toMatchObject({ alreadyRefunded: true });
    // The refunded_payment webhook that Telegram sends afterwards changes nothing.
    await webhook({ update_id: 6, message: { message_id: 6, chat: { id: tg, type: 'private' }, from: { id: tg }, refunded_payment: { currency: 'XTR', total_amount: 250, invoice_payload: `v1:drachmae_275:${playerId}:abcd1234`, telegram_payment_charge_id: charge } } });
    expect(refundCalls()).toHaveLength(1);
    expect((await (await api('/api/economy/wallet', { token })).json<{ drachmae: number }>()).drachmae).toBe(0);
    const audit = await DB().prepare("SELECT COUNT(*) AS n FROM admin_audit WHERE action = 'refund' AND player_id = ?1").bind(playerId).first<{ n: number }>();
    expect(audit!.n).toBe(2);
    expect((await adminApi('/purchases/no-such-charge/refund', { json: { requestId: rid(), reason: 'missing' } })).status).toBe(404);
  });

  it('records a failed Telegram refund in the audit log and leaves the purchase alone', async () => {
    const tg = 931031;
    const { playerId } = await devLogin(tg);
    const charge = 'ops-refund-charge-2';
    mockTelegram();
    await webhook({ update_id: 7, message: { message_id: 7, chat: { id: tg, type: 'private' }, from: { id: tg }, successful_payment: { currency: 'XTR', total_amount: 100, invoice_payload: `v1:drachmae_100:${playerId}:abcd1234`, telegram_payment_charge_id: charge } } });
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ ok: false, description: 'Bad Request: CHARGE_NOT_FOUND' }, { status: 400 }));
    const requestId = rid();
    expect((await adminApi(`/purchases/${charge}/refund`, { json: { requestId, reason: 'try it' } })).status).toBe(502);
    const row = await DB().prepare('SELECT refunded FROM purchases WHERE telegram_payment_charge_id = ?1').bind(charge).first<{ refunded: number }>();
    expect(row!.refunded).toBe(0);
    const audit = await DB().prepare('SELECT result FROM admin_audit WHERE request_id = ?1').bind(requestId).first<{ result: string }>();
    expect(audit!.result).toContain('CHARGE_NOT_FOUND');
    expect((await adminApi(`/purchases/${charge}/refund`, { json: { requestId, reason: 'try it' } })).status).toBe(409);
  });
});

describe('admin reads', () => {
  it('search, player detail, overview, errors, audit, tickets', async () => {
    const { playerId } = await devLogin(931040, 'Findme');
    const found = await (await adminApi('/players?q=Findm')).json<{ players: { id: number }[] }>();
    expect(found.players.map((p) => p.id)).toContain(playerId);
    expect((await (await adminApi(`/players?q=${playerId}`)).json<{ players: { id: number }[] }>()).players[0].id).toBe(playerId);
    const detail = await (await adminApi(`/players/${playerId}`)).json<{ player: { id: number }; wallet: unknown; purchases: unknown[] }>();
    expect(detail.player.id).toBe(playerId);
    expect((await adminApi('/players/999999999')).status).toBe(404);
    const overview = await (await adminApi('/overview')).json<{ players: { total: number } }>();
    expect(overview.players.total).toBeGreaterThan(0);
    expect((await adminApi('/errors')).status).toBe(200);
    expect((await adminApi('/audit')).status).toBe(200);
    const tickets = await (await adminApi('/tickets')).json<{ available: boolean }>();
    expect(typeof tickets.available).toBe('boolean');
  });
});

// Runs last: it moves the database to the next season.
describe('admin season controls', () => {
  it('ends and starts seasons by hand, audited and idempotent', async () => {
    const view = async () => (await adminApi('/season')).json<{ active: { id: number } | null; shards: { live: number | null }[] }>();
    const { token } = await devLogin(931050);
    expect((await api('/api/online/profile', { method: 'POST', token })).status).toBe(200);
    const s1 = (await view()).active!.id;
    expect((await view()).shards.length).toBeGreaterThan(0);

    expect((await adminApi('/season/start', { json: { requestId: rid(), reason: 'too early' } })).status).toBe(409);

    const endId = rid();
    const end = await adminApi('/season/end', { json: { requestId: endId, reason: 'balance reset' } });
    expect(await end.json()).toMatchObject({ ended: s1, started: null, replayed: false });
    expect((await view()).active).toBeNull();
    // Replaying the same request does not end anything else.
    expect(await (await adminApi('/season/end', { json: { requestId: endId, reason: 'balance reset' } })).json()).toMatchObject({ ended: s1, replayed: true });

    const start = await adminApi('/season/start', { json: { requestId: rid(), reason: 'new season' } });
    expect(await start.json()).toMatchObject({ started: s1 + 1 });

    const both = await adminApi('/season/end', { json: { requestId: rid(), reason: 'again', startNext: true } });
    expect(await both.json()).toMatchObject({ ended: s1 + 1, started: s1 + 2 });
    const titles = await DB().prepare('SELECT COUNT(*) AS n FROM season_rewards WHERE season_id = ?1').bind(s1).first<{ n: number }>();
    expect(titles!.n).toBeGreaterThan(0);
    const audit = await DB().prepare("SELECT COUNT(*) AS n FROM admin_audit WHERE action IN ('season_end', 'season_start')").first<{ n: number }>();
    expect(audit!.n).toBe(4); // the refused start (409) is audited too
  });
});
