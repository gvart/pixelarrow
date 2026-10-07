/**
 * Product analytics into Workers Analytics Engine (dataset pixelarrow_events;
 * column layout in src/platform/analyticsSchema.ts, queries in docs/OPS.md).
 *
 * writeDataPoint is fire-and-forget and costs nothing on the request path.
 * Without the ANALYTICS binding (local dev, or a deploy that dropped it)
 * every call is a no-op. Players who switched analytics off send
 * `x-pa-analytics: 0` with every request (and have players.analytics_opt_out
 * = 1 for events with no request, like a Stars payment).
 */
import type { Context } from 'hono';
import type { AppEnv, Env } from '../env';
import { normalizeEvent, type AnalyticsEvent, type EventProps } from '../../../src/platform/analyticsSchema';
import { log } from './log';

export interface EmitCtx {
  pid: number;
  source: 'client' | 'server';
  platform?: string | null;
  version?: string | null;
  /** Days since the player's first sign-in (-1 when not known here). */
  days?: number;
}

export type DatasetName = 'events' | 'errors';
type Sink = (dataset: DatasetName, point: AnalyticsEngineDataPoint) => void;
let extraSink: Sink | null = null;

/** Tests: observe every data point written (null to stop). */
export function setAnalyticsSink(sink: Sink | null): void {
  extraSink = sink;
}

export function writePoint(env: Env, dataset: DatasetName, point: AnalyticsEngineDataPoint): void {
  try {
    extraSink?.(dataset, point);
    (dataset === 'events' ? env.ANALYTICS : env.CLIENT_ERRORS)?.writeDataPoint(point);
  } catch (e) {
    log('warn', 'analytics_write_failed', { dataset, message: (e as Error)?.message ?? String(e) });
  }
}

const SAFE = /^[A-Za-z0-9_.-]{1,40}$/;
export const safeTag = (s: string | null | undefined): string => (s && SAFE.test(s) ? s : '');

/** Validates against the allowlist and writes one data point. False when rejected. */
export function writeEvent(env: Env, ctx: EmitCtx, event: string, props: unknown): boolean {
  const n = normalizeEvent(event, props, ctx.source);
  if (!n) return false;
  writePoint(env, 'events', {
    indexes: [String(ctx.pid || 0)],
    blobs: [n.event, ctx.source, safeTag(ctx.platform), safeTag(ctx.version), ...n.strings],
    doubles: [ctx.pid || 0, ctx.days ?? -1, ...n.numbers],
  });
  return true;
}

/** True when the request says the player opted out of analytics. */
export function optedOut(c: Context<AppEnv>): boolean {
  return c.req.header('x-pa-analytics') === '0';
}

/** Request-scoped context: platform and app version from the client's headers. */
export function requestCtx(c: Context<AppEnv>, pid: number, source: 'client' | 'server' = 'server', days = -1): EmitCtx {
  return { pid, source, platform: c.req.header('x-pa-platform'), version: c.req.header('x-pa-version'), days };
}

/** A server-side event for the signed-in player of this request (skipped when they opted out). */
export function emit<E extends AnalyticsEvent>(c: Context<AppEnv>, event: E, props: EventProps<E> = {} as EventProps<E>, pid?: number): void {
  if (optedOut(c)) return;
  const id = pid ?? c.get('session')?.pid;
  if (!id) return;
  writeEvent(c.env, requestCtx(c, id), event, props);
}

/** Records a once-per-player milestone; true when this call recorded it (the first time). */
export async function milestone(db: D1Database, pid: number, name: string, now = Date.now()): Promise<boolean> {
  const r = await db.prepare('INSERT OR IGNORE INTO analytics_milestones (player_id, milestone, created_at) VALUES (?1, ?2, ?3)').bind(pid, name, now).run();
  return r.meta.changes === 1;
}

/** Side 0 (the player) won / lost / drew. */
export const outcomeOf = (winner: number): 'win' | 'loss' | 'draw' => (winner === 0 ? 'win' : winner === 1 ? 'loss' : 'draw');

/** Runs work after the response when the runtime allows it (else awaits it). */
export async function background(c: Context<AppEnv>, work: Promise<unknown>): Promise<void> {
  const safe = work.catch((e) => log('warn', 'background_failed', { message: (e as Error)?.message ?? String(e) }));
  try {
    c.executionCtx.waitUntil(safe);
  } catch {
    await safe;
  }
}

/**
 * `event` (always) plus a "first_*" milestone event the first time for this
 * player. The milestone is written even when the player opted out (it only
 * guards uniqueness), but nothing is sent then.
 */
export async function emitWithFirst<E extends AnalyticsEvent, F extends AnalyticsEvent>(
  c: Context<AppEnv>,
  event: E | null,
  props: EventProps<E>,
  first: F,
  firstProps: EventProps<F>,
  pid?: number,
): Promise<void> {
  const id = pid ?? c.get('session')?.pid;
  if (!id || !c.env.DB) return;
  if (event) emit(c, event, props, id);
  const db = c.env.DB;
  await background(
    c,
    milestone(db, id, first).then((fresh) => {
      if (fresh) emit(c, first, firstProps, id);
    }),
  );
}

/** Server-side event for a player outside any request (webhook, Durable Object): checks the stored opt-out. */
export async function emitForPlayer<E extends AnalyticsEvent>(env: Env, pid: number, event: E, props: EventProps<E>, firstOf?: { name: AnalyticsEvent; props: Record<string, unknown> }): Promise<void> {
  if (!env.DB) return;
  try {
    const row = await env.DB.prepare('SELECT analytics_opt_out AS o FROM players WHERE id = ?1').bind(pid).first<{ o: number }>();
    const out = !row || row.o === 1;
    if (!out) writeEvent(env, { pid, source: 'server' }, event, props);
    if (firstOf && (await milestone(env.DB, pid, firstOf.name)) && !out) writeEvent(env, { pid, source: 'server' }, firstOf.name, firstOf.props);
  } catch (e) {
    log('warn', 'analytics_emit_failed', { event, message: (e as Error)?.message ?? String(e) });
  }
}
