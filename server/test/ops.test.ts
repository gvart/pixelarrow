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
import { currentSeason, forgetSeasonCache } from '../src/war/store';
import { api, devLogin } from './helpers';

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
    expect(scrubText('see https://x.app/p?tgWebAppData=user%3D123 and pa2_Qm9vdHN0cmFwVG9rZW5PbmVUd29UaHJlZUZvdXJGaXZlU2l4')).toBe('see https://x.app/p and <redacted>');
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

  it('server events: install at first login, once a day', async () => {
    const tg = 930020;
    await devLogin(tg);
    expect(events('install')).toHaveLength(1);
    await devLogin(tg);
    expect(events('install')).toHaveLength(1); // same day: no marker
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
    expect((await api('/api/war/roster', { token })).status).toBe(403);

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

describe('admin reads', () => {
  it('search, player detail, overview, errors, audit', async () => {
    const { playerId } = await devLogin(931040, 'Findme');
    const found = await (await adminApi('/players?q=Findm')).json<{ players: { id: number }[] }>();
    expect(found.players.map((p) => p.id)).toContain(playerId);
    expect((await (await adminApi(`/players?q=${playerId}`)).json<{ players: { id: number }[] }>()).players[0].id).toBe(playerId);
    const detail = await (await adminApi(`/players/${playerId}`)).json<{ player: { id: number } }>();
    expect(detail.player.id).toBe(playerId);
    expect((await adminApi('/players/999999999')).status).toBe(404);
    const overview = await (await adminApi('/overview')).json<{ players: { total: number } }>();
    expect(overview.players.total).toBeGreaterThan(0);
    expect((await adminApi('/errors')).status).toBe(200);
    expect((await adminApi('/audit')).status).toBe(200);
  });
});

// Runs last: it moves the database to the next season.
describe('admin season controls', () => {
  it('ends and starts seasons by hand, audited and idempotent', async () => {
    const view = async () => (await adminApi('/season')).json<{ active: { id: number } | null }>();
    await devLogin(931050);
    forgetSeasonCache();
    await currentSeason(DB());
    const s1 = (await view()).active!.id;

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
    const audit = await DB().prepare("SELECT COUNT(*) AS n FROM admin_audit WHERE action IN ('season_end', 'season_start')").first<{ n: number }>();
    expect(audit!.n).toBe(4); // the refused start (409) is audited too
  });
});
