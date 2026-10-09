/**
 * Telemetry from the game client (docs/OPS.md "Monitoring" and "Analytics"):
 *
 *   POST /api/telemetry/errors   crash reports; signed in or not (a session
 *                                token in the Authorization header or in the
 *                                body, since navigator.sendBeacon cannot set
 *                                headers). Deduplicated into D1 client_errors
 *                                and counted in Analytics Engine.
 *   POST /api/telemetry/events   product analytics (allowlisted client events).
 *   POST /api/telemetry/consent  the Settings analytics toggle.
 *
 * All three are rate limited per client IP and per player (per isolate) and
 * never fail the game: a dropped report answers 202/429 and the client moves on.
 */
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { readJson } from '../body';
import { bytesToHex, utf8 } from '../crypto';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { bearer, clientIp, db, requireAuth, sessionFromToken } from '../middleware';
import { requireRate } from '../rateLimit';
import { scrubText } from '../../../src/platform/analyticsSchema';
import { milestone, optedOut, requestCtx, safeTag, writeEvent, writePoint } from './analytics';

export const ERRORS_MAX_BODY = 48 * 1024;
export const EVENTS_MAX_BODY = 16 * 1024;
/** Error batches per IP / per player per minute (per isolate). */
export const ERROR_BATCHES_PER_MIN = 6;
/** Error rows written per isolate per minute, all clients together (a cap on D1 writes). */
export const ERROR_ROWS_PER_MIN = 300;
export const EVENT_BATCHES_PER_MIN = 20;

const short = (n: number) => z.string().max(n);
const Crumb = z.object({ t: z.number().int().nonnegative(), c: short(16), m: short(120) });
const ErrorItem = z.object({
  kind: z.enum(['error', 'rejection', 'scene', 'console']),
  message: short(2000),
  stack: short(8000).optional(),
  scene: short(40).optional(),
  count: z.number().int().min(1).max(10_000).default(1),
  at: z.number().int().nonnegative().optional(),
  breadcrumbs: z.array(Crumb).max(30).optional(),
});
const AppInfo = z.object({
  version: short(40).optional(),
  platform: short(40).optional(),
  tg: short(16).optional(),
  lang: short(8).optional(),
});
const Device = z.object({
  w: z.number().int().min(0).max(20_000).optional(),
  h: z.number().int().min(0).max(20_000).optional(),
  dpr: z.number().min(0).max(10).optional(),
  ua: short(40).optional(),
  mem: z.number().min(0).max(1024).optional(),
});
export const ErrorsBody = z.object({
  token: short(2048).optional(),
  app: AppInfo.default({}),
  device: Device.default({}),
  errors: z.array(ErrorItem).min(1).max(10),
});

const EventItem = z.object({ e: short(40), p: z.record(z.string(), z.unknown()).optional() });
export const EventsBody = z.object({
  token: short(2048).optional(),
  app: AppInfo.default({}),
  optOut: z.boolean().optional(),
  events: z.array(EventItem).min(1).max(50),
});

export const telemetry = new Hono<AppEnv>();

/** The player id of a valid session (header or body token), else 0. Never throws. */
async function optionalPid(c: Context<AppEnv>, bodyToken?: string): Promise<number> {
  const token = bearer(c) ?? bodyToken ?? null;
  if (!token || !c.env.SESSION_SECRET) return 0;
  try {
    return (await sessionFromToken(c.env, token)).pid;
  } catch {
    return 0;
  }
}

async function sha256Hex(s: string): Promise<string> {
  return bytesToHex(await crypto.subtle.digest('SHA-256', utf8(s)));
}

/** First stack line that points at code (not the message line). */
function topFrame(stack: string | undefined): string {
  const lines = (stack ?? '').split('\n').map((l) => l.trim());
  return lines.find((l) => /^at\s|@|:\d+:\d+/.test(l) && !/^(Error|TypeError|RangeError|ReferenceError)\b/.test(l)) ?? '';
}

/** Message without the parts that vary between occurrences (numbers, quoted values). */
export function normalizeMessage(m: string): string {
  return m.replace(/\d+/g, 'N').replace(/'[^']{0,80}'|"[^"]{0,80}"/g, "'…'").slice(0, 300);
}

export async function errorFingerprint(kind: string, message: string, stack: string | undefined, version: string): Promise<string> {
  const frame = topFrame(stack).replace(/:\d+:\d+\)?$/, '').replace(/[?#].*$/, '');
  return (await sha256Hex(`${kind}|${normalizeMessage(message)}|${frame}|${version}`)).slice(0, 24);
}

let globalWindow = { start: 0, rows: 0 };
export function resetTelemetryLimits(): void {
  globalWindow = { start: 0, rows: 0 };
}

telemetry.post('/errors', async (c) => {
  requireRate(`tel:err:ip:${clientIp(c)}`, ERROR_BATCHES_PER_MIN, 60_000, 'Too many error reports');
  const body = await readJson(c, ErrorsBody, ERRORS_MAX_BODY);
  const pid = await optionalPid(c, body.token);
  if (pid) requireRate(`tel:err:pid:${pid}`, ERROR_BATCHES_PER_MIN, 60_000, 'Too many error reports');

  const now = Date.now();
  if (now - globalWindow.start >= 60_000) globalWindow = { start: now, rows: 0 };
  const room = Math.max(0, ERROR_ROWS_PER_MIN - globalWindow.rows);
  const items = body.errors.slice(0, room);
  globalWindow.rows += items.length;
  if (!items.length) return c.json({ ok: true, stored: 0, dropped: body.errors.length }, 202);

  const version = safeTag(body.app.version) || 'unknown';
  const platform = safeTag(body.app.platform);
  const tg = safeTag(body.app.tg);
  const device = JSON.stringify({ ...body.device, ua: body.device.ua ? scrubText(body.device.ua, 40) : undefined });
  const d = c.env.DB;
  const stmts: D1PreparedStatement[] = [];
  for (const e of items) {
    const message = scrubText(e.message, 500);
    const stack = e.stack ? scrubText(e.stack, 4000) : null;
    const scene = e.scene ? safeTag(e.scene) || null : null;
    const fp = await errorFingerprint(e.kind, message, stack ?? undefined, version);
    const crumbs = JSON.stringify((e.breadcrumbs ?? []).slice(-20).map((b) => ({ t: b.t, c: safeTag(b.c), m: scrubText(b.m, 120) })));
    writePoint(c.env, 'errors', {
      indexes: [fp],
      blobs: [fp, e.kind, message.slice(0, 200), scene ?? '', version, platform, tg],
      doubles: [e.count, pid],
    });
    if (d) {
      stmts.push(
        d
          .prepare(
            `INSERT INTO client_errors (fingerprint, kind, message, stack, scene, app_version, platform, tg_version, breadcrumbs, device, count, last_player, first_seen, last_seen)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13)
             ON CONFLICT (fingerprint) DO UPDATE SET
               count = MIN(count + excluded.count, 1000000000), last_seen = excluded.last_seen,
               breadcrumbs = excluded.breadcrumbs, device = excluded.device, platform = excluded.platform,
               tg_version = excluded.tg_version, scene = COALESCE(excluded.scene, scene),
               last_player = COALESCE(excluded.last_player, last_player)`,
          )
          .bind(fp, e.kind, message, stack, scene, version, platform || null, tg || null, crumbs, device, e.count, pid || null, now),
      );
    }
  }
  if (d && stmts.length) await d.batch(stmts);
  return c.json({ ok: true, stored: items.length, dropped: body.errors.length - items.length });
});

telemetry.post('/events', async (c) => {
  const body = await readJson(c, EventsBody, EVENTS_MAX_BODY);
  const pid = await optionalPid(c, body.token);
  if (!pid) throw new ApiError(401, 'unauthorized', 'Missing or invalid session token');
  requireRate(`tel:ev:${pid}`, EVENT_BATCHES_PER_MIN, 60_000, 'Too many analytics batches');
  if (body.optOut || optedOut(c)) return c.json({ accepted: 0, rejected: [] });
  const ctx = { ...requestCtx(c, pid, 'client'), platform: body.app.platform ?? c.req.header('x-pa-platform'), version: body.app.version ?? c.req.header('x-pa-version') };
  let accepted = 0;
  const rejected: string[] = [];
  let firstBattle: string | null = null;
  for (const ev of body.events) {
    // Online, beast, boss and duel results are recorded by the server itself.
    const clientMode = ev.e !== 'battle_result' || ev.p?.mode === 'offline' || ev.p?.mode === 'trial';
    if (clientMode && writeEvent(c.env, ctx, ev.e, ev.p ?? {})) {
      accepted++;
      if (ev.e === 'battle_result' && !firstBattle) firstBattle = typeof ev.p?.mode === 'string' ? ev.p.mode : 'offline';
    } else rejected.push(ev.e.slice(0, 40));
  }
  if (firstBattle && c.env.DB && (await milestone(c.env.DB, pid, 'first_battle'))) writeEvent(c.env, { ...ctx, source: 'server' }, 'first_battle', { mode: firstBattle });
  return c.json({ accepted, rejected });
});

telemetry.post('/consent', requireAuth, async (c) => {
  const body = await readJson(c, z.object({ analytics: z.boolean() }), 256);
  await db(c.env).prepare('UPDATE players SET analytics_opt_out = ?2 WHERE id = ?1').bind(c.get('session').pid, body.analytics ? 0 : 1).run();
  return c.json({ analytics: body.analytics });
});

/** Daily cron: forget error groups not seen for ERROR_RETENTION_DAYS. */
export const ERROR_RETENTION_DAYS = 30;
export async function pruneClientErrors(d: D1Database, now = Date.now()): Promise<number> {
  const r = await d.prepare('DELETE FROM client_errors WHERE last_seen < ?1').bind(now - ERROR_RETENTION_DAYS * 86_400_000).run();
  return r.meta.changes;
}
