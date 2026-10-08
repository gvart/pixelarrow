/**
 * Bot notifications (docs/ROADMAP.md "Launch blockers" 1; server/README.md
 * "Bot notifications").
 *
 * Game code never sends a message itself: it hands events to `notify()`
 * (through `later()`, i.e. ctx.waitUntil, after the response is decided), which
 *  1. writes them to `notify_outbox`, unique per (player, dedupe key), so a
 *     retried request or a replayed webhook never notifies twice;
 *  2. tries to deliver the player's pending events at once (`flushPlayer`).
 *
 * Delivery respects, in order: the player's opt-outs (per type), a bot that
 * is blocked or was never started (403 → `blocked_at`, nothing is sent until
 * the player sends /start again), stale events (per-type TTL), quiet hours
 * (23:00-08:00 in the player's time zone, when the Mini App reported one),
 * the hourly budget (NOTIFY_RULES.maxPerHour messages) and the coalescing
 * window per type: an event arriving soon after a message of the same type
 * waits, and the cron job (every 5 minutes, `flushDue`) later folds
 * everything waiting into one message ("3 attacks on your land in the last
 * hour"). A failed send (429, 5xx, network) leaves the rows pending for the
 * next run.
 */
import type { Context } from 'hono';
import type { AppEnv, Env } from '../env';
import { isUnreachable, tryBot } from '../telegramApi';
import { buttonUrl, EVENT_TYPE, langOf, NOTIFY_TYPES, render, type EventData, type EventId, type NotifyType, type PendingEvent } from './templates';

const MIN = 60_000;
const HOUR = 60 * MIN;

export const NOTIFY_RULES = {
  /** Messages per player per rolling hour. */
  maxPerHour: 4,
  /** After a message of a type, newer events of that type wait this long and are then sent together. */
  coalesceMs: { attack: 15 * MIN, march: 5 * MIN, income: 0, duel: 15 * MIN, clan: 10 * MIN, boss: 0, season: 0, market: 20 * MIN } as Record<NotifyType, number>,
  /** Events older than this are dropped instead of sent late. */
  ttlMs: { attack: 6 * HOUR, march: 3 * HOUR, income: 24 * HOUR, duel: 1 * HOUR, clan: 24 * HOUR, boss: 24 * HOUR, season: 24 * HOUR, market: 24 * HOUR } as Record<NotifyType, number>,
  /** Local quiet hours [from, to) when the player's time zone is known. */
  quiet: { from: 23, to: 8 },
  /** Players flushed per cron run (Telegram allows ~30 messages a second overall). */
  flushPlayers: 200,
} as const;

export interface NotifyEvent {
  pid: number;
  event: EventId;
  /** Unique per player: the same key twice is one notification. */
  dedupe: string;
  data: Record<string, unknown>;
}

/** A typed event. */
export function ev<E extends EventId>(pid: number, event: E, dedupe: string, data: EventData[E]): NotifyEvent {
  return { pid, event, dedupe: dedupe.slice(0, 200), data: data as Record<string, unknown> };
}

export interface NotifySettingsRow {
  player_id: number;
  disabled: string;
  quiet: number;
  tz_offset: number | null;
  blocked_at: number | null;
  updated_at: number;
}

export const disabledSet = (s: Pick<NotifySettingsRow, 'disabled'> | null | undefined): Set<NotifyType> =>
  new Set((s?.disabled ?? '').split(',').filter((x): x is NotifyType => (NOTIFY_TYPES as readonly string[]).includes(x)));

export async function getSettings(db: D1Database, pid: number): Promise<NotifySettingsRow | null> {
  return db.prepare('SELECT * FROM notify_settings WHERE player_id = ?1').bind(pid).first<NotifySettingsRow>();
}

/** Quiet hours right now for this player (never when the time zone is unknown). */
export function isQuiet(s: Pick<NotifySettingsRow, 'quiet' | 'tz_offset'> | null | undefined, now: number): boolean {
  if (!s || !s.quiet || s.tz_offset === null || s.tz_offset === undefined) return false;
  const minutes = (((Math.floor(now / MIN) + s.tz_offset) % 1440) + 1440) % 1440;
  const h = Math.floor(minutes / 60);
  const { from, to } = NOTIFY_RULES.quiet;
  return from > to ? h >= from || h < to : h >= from && h < to;
}

/** Runs a promise after the response (ctx.waitUntil); never throws into the request. */
export function later(c: Context<AppEnv>, p: Promise<unknown>): void {
  const safe = p.catch((e) => console.warn('background task failed', e));
  try {
    c.executionCtx.waitUntil(safe);
  } catch {
    // no execution context (unit tests): let it run detached
  }
}

/** Stores events and tries to deliver them. `shard`: skip players who have the game open in that shard. Never throws. */
export async function notify(env: Env, events: readonly NotifyEvent[], opts: { now?: number; shard?: { season: number; id: number } } = {}): Promise<void> {
  const db = env.DB;
  if (!db || !events.length) return;
  const now = opts.now ?? Date.now();
  try {
    let list = events;
    if (opts.shard) {
      const online = new Set(await onlineIn(env, opts.shard).catch(() => [] as number[]));
      list = events.filter((e) => !online.has(e.pid));
      if (!list.length) return;
    }
    await enqueue(db, list, now);
    for (const pid of new Set(list.map((e) => e.pid))) await flushPlayer(env, pid, now);
  } catch (e) {
    console.warn('notify failed', e);
  }
}

async function onlineIn(env: Env, shard: { season: number; id: number }): Promise<number[]> {
  const stub = env.REGION.get(env.REGION.idFromName(`shard-${shard.season}-${shard.id}`));
  return stub.livePlayers();
}

export async function enqueue(db: D1Database, events: readonly NotifyEvent[], now: number): Promise<void> {
  const stmts = events.map((e) =>
    db
      .prepare('INSERT OR IGNORE INTO notify_outbox (player_id, type, event, dedupe, data, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
      .bind(e.pid, EVENT_TYPE[e.event], e.event, e.dedupe, JSON.stringify(e.data), now),
  );
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
}

interface OutboxRow {
  id: number;
  player_id: number;
  type: NotifyType;
  event: EventId;
  data: string;
  created_at: number;
}

const ids = (rows: { id: number }[]) => rows.map((r) => r.id | 0).join(',');

/** Marks a player unreachable (blocked the bot / never started it) and drops what was waiting. */
export async function markBlocked(db: D1Database, pid: number, now: number): Promise<void> {
  await db.batch([
    db
      .prepare(
        `INSERT INTO notify_settings (player_id, blocked_at, updated_at) VALUES (?1, ?2, ?2)
         ON CONFLICT (player_id) DO UPDATE SET blocked_at = excluded.blocked_at, updated_at = excluded.updated_at`,
      )
      .bind(pid, now),
    db.prepare("UPDATE notify_outbox SET status = 'skipped' WHERE player_id = ?1 AND status = 'pending'").bind(pid),
  ]);
}

/** The player can be reached again (/start, or any message to the bot). */
export async function clearBlocked(db: D1Database, telegramId: number, now: number): Promise<void> {
  await db
    .prepare('UPDATE notify_settings SET blocked_at = NULL, updated_at = ?2 WHERE blocked_at IS NOT NULL AND player_id = (SELECT id FROM players WHERE telegram_id = ?1)')
    .bind(telegramId, now)
    .run();
}

export type FlushResult = { sent: number; waiting: number; skipped: number; blocked?: boolean };

/** Delivers what a player has waiting, as far as the rules allow right now. */
export async function flushPlayer(env: Env, pid: number, now = Date.now()): Promise<FlushResult> {
  const db = env.DB;
  const token = env.TELEGRAM_BOT_TOKEN;
  const out: FlushResult = { sent: 0, waiting: 0, skipped: 0 };
  if (!db || !token) return out;
  const rows = (await db.prepare("SELECT id, player_id, type, event, data, created_at FROM notify_outbox WHERE player_id = ?1 AND status = 'pending' ORDER BY id LIMIT 200").bind(pid).all<OutboxRow>()).results;
  if (!rows.length) return out;
  const [player, st] = await Promise.all([
    db.prepare('SELECT telegram_id, language_code FROM players WHERE id = ?1').bind(pid).first<{ telegram_id: number; language_code: string | null }>(),
    getSettings(db, pid),
  ]);
  const off = disabledSet(st);
  const drop = rows.filter((r) => !player || st?.blocked_at || off.has(r.type) || now - r.created_at > (NOTIFY_RULES.ttlMs[r.type] ?? HOUR) || !(r.type in NOTIFY_RULES.ttlMs));
  if (drop.length) await db.prepare(`UPDATE notify_outbox SET status = 'skipped' WHERE id IN (${ids(drop)}) AND status = 'pending'`).run();
  out.skipped = drop.length;
  const dropped = new Set(drop.map((r) => r.id));
  const live = rows.filter((r) => !dropped.has(r.id));
  out.waiting = live.length;
  if (!live.length || !player || isQuiet(st, now)) return out;

  const log = (await db.prepare('SELECT type, sent_at FROM notify_log WHERE player_id = ?1 AND sent_at > ?2').bind(pid, now - HOUR).all<{ type: NotifyType; sent_at: number }>()).results;
  let budget = NOTIFY_RULES.maxPerHour - log.length;
  const groups = new Map<NotifyType, OutboxRow[]>();
  for (const r of live) groups.set(r.type, [...(groups.get(r.type) ?? []), r]);
  const lang = langOf(player.language_code);
  const gameUrl = env.GAME_URL || 'https://pixelarrow.app';

  for (const [type, group] of groups) {
    if (budget <= 0) break;
    const last = Math.max(0, ...log.filter((l) => l.type === type).map((l) => l.sent_at));
    if (last && now - last < NOTIFY_RULES.coalesceMs[type]) continue;
    // Claim the rows (a concurrent flush of the same player gets nothing).
    const claim = await db.prepare(`UPDATE notify_outbox SET status = 'sending', sent_at = ?1 WHERE id IN (${ids(group)}) AND status = 'pending'`).bind(now).run();
    if (claim.meta.changes !== group.length) {
      await db.prepare(`UPDATE notify_outbox SET status = 'pending', sent_at = NULL WHERE id IN (${ids(group)}) AND status = 'sending' AND sent_at = ?1`).bind(now).run();
      continue;
    }
    const events: PendingEvent[] = group.map((r) => ({ event: r.event, data: safeJson(r.data) }));
    const msg = render(lang, type, events);
    const res = await tryBot(token, 'sendMessage', {
      chat_id: player.telegram_id,
      text: msg.text,
      link_preview_options: { is_disabled: true },
      reply_markup: { inline_keyboard: [[{ text: msg.button, web_app: { url: buttonUrl(gameUrl, msg.route) } }]] },
    });
    if (res.ok) {
      await db.batch([
        db.prepare(`UPDATE notify_outbox SET status = 'sent' WHERE id IN (${ids(group)}) AND status = 'sending'`),
        db.prepare('INSERT INTO notify_log (player_id, type, events, sent_at) VALUES (?1, ?2, ?3, ?4)').bind(pid, type, group.length, now),
      ]);
      budget--;
      out.sent++;
      out.waiting -= group.length;
      continue;
    }
    await db.prepare(`UPDATE notify_outbox SET status = 'pending', sent_at = NULL WHERE id IN (${ids(group)}) AND status = 'sending'`).run();
    if (isUnreachable(res)) {
      await markBlocked(db, pid, now);
      out.blocked = true;
      out.skipped += out.waiting;
      out.waiting = 0;
    } else console.warn('notification not sent', res.status, res.description);
    break; // 429 / 5xx / network: try again on the next run
  }
  return out;
}

function safeJson(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s) as unknown;
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Cron: deliver everything that waited (coalescing windows, quiet hours, rate limits, failed sends). */
export async function flushDue(env: Env, now = Date.now()): Promise<number> {
  const db = env.DB;
  if (!db) return 0;
  // Rows stuck in 'sending' (the isolate died mid-send) go back to the queue.
  await db.prepare("UPDATE notify_outbox SET status = 'pending', sent_at = NULL WHERE status = 'sending' AND sent_at < ?1").bind(now - 10 * MIN).run();
  const players = (await db.prepare("SELECT DISTINCT player_id FROM notify_outbox WHERE status = 'pending' LIMIT ?1").bind(NOTIFY_RULES.flushPlayers).all<{ player_id: number }>()).results;
  let sent = 0;
  for (const p of players) {
    try {
      sent += (await flushPlayer(env, p.player_id, now)).sent;
    } catch (e) {
      console.warn('flush failed', p.player_id, e);
    }
  }
  return sent;
}

/** Cron: forget old outbox rows, logs and bot conversation states. */
export async function cleanup(db: D1Database, now = Date.now()): Promise<void> {
  await db.batch([
    // every event's TTL is at most a day: older rows are history (dedupe keys of the season and income jobs live in bot_meta / accrued_at)
    db.prepare('DELETE FROM notify_outbox WHERE created_at < ?1').bind(now - 3 * 24 * HOUR),
    db.prepare('DELETE FROM notify_log WHERE sent_at < ?1').bind(now - 2 * 24 * HOUR),
    db.prepare('DELETE FROM bot_state WHERE until < ?1').bind(now),
  ]);
}
