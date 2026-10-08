/**
 * The scheduled job (wrangler.jsonc triggers.crons, every 5 minutes):
 *  - registers the bot's commands once per COMMANDS_VERSION (and makes sure
 *    the webhook receives callback_query for the /settings buttons);
 *  - "the season ends in 3 days / 1 day" for every player of the season;
 *  - "your treasury is full" (hourly) for players whose oldest uncollected
 *    hex reached the 24 h income cap;
 *  - delivers waiting notifications (flushDue) and cleans up.
 *
 * Cost: 288 runs a day, each a handful of D1 queries (the free plan allows
 * 100k requests and 5M D1 row reads a day; cron triggers are free).
 */
import type { Env } from '../env';
import { ONLINE_RULES } from '../../../src/online/rules';
import { tryBot } from '../telegramApi';
import { ALLOWED_UPDATES, BOT_COMMANDS, COMMANDS_VERSION } from '../bot/commands';
import { cleanup, flushDue } from './outbox';

const DAY = 24 * 3_600_000;

export async function metaGet(db: D1Database, key: string): Promise<string | null> {
  const r = await db.prepare('SELECT value FROM bot_meta WHERE key = ?1').bind(key).first<{ value: string }>();
  return r?.value ?? null;
}

export async function metaSet(db: D1Database, key: string, value: string, now: number): Promise<void> {
  await db
    .prepare('INSERT INTO bot_meta (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
    .bind(key, value, now)
    .run();
}

/** setMyCommands (EN default + RU) once per version; adds callback_query to the webhook's allowed updates if it is missing. */
export async function ensureBotSetup(env: Env, now = Date.now()): Promise<boolean> {
  const db = env.DB;
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!db || !token) return false;
  if ((await metaGet(db, 'commands_version')) === String(COMMANDS_VERSION)) return false;
  const en = await tryBot(token, 'setMyCommands', { commands: BOT_COMMANDS.en });
  const ru = await tryBot(token, 'setMyCommands', { commands: BOT_COMMANDS.ru, language_code: 'ru' });
  if (!en.ok || !ru.ok) return false;
  const info = await tryBot<{ url?: string; allowed_updates?: string[] }>(token, 'getWebhookInfo', {});
  const hook = info.ok && info.result && typeof info.result === 'object' ? info.result : null;
  if (hook?.url && env.TELEGRAM_WEBHOOK_SECRET && Array.isArray(hook.allowed_updates) && hook.allowed_updates.length && !hook.allowed_updates.includes('callback_query')) {
    await tryBot(token, 'setWebhook', { url: hook.url, secret_token: env.TELEGRAM_WEBHOOK_SECRET, allowed_updates: [...new Set([...hook.allowed_updates, ...ALLOWED_UPDATES])] });
  }
  await metaSet(db, 'commands_version', String(COMMANDS_VERSION), now);
  return true;
}

/** "The season ends in 3 days / 1 day": one outbox row per player of the season (opted-out and blocked players excluded). */
export async function seasonNotices(db: D1Database, now = Date.now()): Promise<number> {
  const s = await db.prepare("SELECT id, ends_at FROM online_seasons WHERE status = 'active' ORDER BY id DESC LIMIT 1").first<{ id: number; ends_at: number }>();
  if (!s || s.ends_at <= now) return 0;
  const left = s.ends_at - now;
  const days = left <= DAY ? 1 : left <= 3 * DAY ? 3 : 0;
  if (!days) return 0;
  const key = `season:${s.id}:${days}d`;
  if (await metaGet(db, key)) return 0;
  const res = await db
    .prepare(
      `INSERT OR IGNORE INTO notify_outbox (player_id, type, event, dedupe, data, created_at)
       SELECT p.player_id, 'season', 'season_ending', ?2, ?3, ?4 FROM online_profiles p
       WHERE p.season_id = ?1 AND NOT EXISTS (
         SELECT 1 FROM notify_settings n WHERE n.player_id = p.player_id AND (n.blocked_at IS NOT NULL OR (',' || n.disabled || ',') LIKE '%,season,%'))`,
    )
    .bind(s.id, key, JSON.stringify({ days }), now)
    .run();
  await metaSet(db, key, String(now), now);
  // the 1-day notice makes a 3-day one that never went out pointless
  if (days === 1) await metaSet(db, `season:${s.id}:3d`, String(now), now);
  return res.meta.changes;
}

/**
 * "Your treasury is full": players whose oldest uncollected region has reached
 * the income cap. Keyed by that region's accrual clock, so it is sent once per
 * full treasury (collecting resets the clock).
 */
export async function incomeNotices(db: D1Database, now = Date.now()): Promise<number> {
  const s = await db.prepare("SELECT id FROM online_seasons WHERE status = 'active' ORDER BY id DESC LIMIT 1").first<{ id: number }>();
  if (!s) return 0;
  const res = await db
    .prepare(
      `INSERT OR IGNORE INTO notify_outbox (player_id, type, event, dedupe, data, created_at)
       SELECT owner_id, 'income', 'income_full', 'income:' || ?1 || ':' || MIN(accrued_at), '{}', ?3
       FROM online_regions WHERE season_id = ?1 AND owner_id IS NOT NULL AND accrued_at IS NOT NULL
       GROUP BY owner_id HAVING MIN(accrued_at) <= ?2`,
    )
    .bind(s.id, now - ONLINE_RULES.incomeCapHours * 3_600_000, now)
    .run();
  return res.meta.changes;
}

/** Everything the cron does; each step fails alone. */
export async function runScheduled(env: Env, now = Date.now()): Promise<void> {
  const db = env.DB;
  if (!db) return;
  const hourly = Math.floor(now / 60_000) % 60 < 5;
  const steps: [string, () => Promise<unknown>][] = [
    ['bot setup', () => ensureBotSetup(env, now)],
    ['season notices', () => seasonNotices(db, now)],
    ['income notices', () => (hourly ? incomeNotices(db, now) : Promise.resolve(0))],
    ['flush', () => flushDue(env, now)],
    ['cleanup', () => cleanup(db, now)],
  ];
  for (const [name, step] of steps) {
    try {
      await step();
    } catch (e) {
      console.warn(`scheduled ${name} failed`, e);
    }
  }
}
