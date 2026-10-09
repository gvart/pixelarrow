/**
 * /api/notify: the player's bot notification settings (Settings →
 * Notifications in the game; the bot's /settings edits the same row).
 *
 *   GET /api/notify/settings → { types: [{type, on}], quiet, tzOffset, blocked }
 *   PUT /api/notify/settings { on?: {type: bool}, quiet?: bool, tzOffset?: minutes east of UTC }
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { readJson } from '../body';
import type { AppEnv } from '../env';
import { db, requireAuth } from '../middleware';
import { requireRate } from '../rateLimit';
import { disabledSet, getSettings, type NotifySettingsRow } from './outbox';
import { NOTIFY_TYPES, type NotifyType } from './templates';

export const notifyRoutes = new Hono<AppEnv>();
notifyRoutes.use('*', requireAuth);

export function settingsView(s: NotifySettingsRow | null) {
  const off = disabledSet(s);
  return {
    types: NOTIFY_TYPES.map((type) => ({ type, on: !off.has(type) })),
    quiet: s ? s.quiet === 1 : true,
    tzOffset: s?.tz_offset ?? null,
    blocked: !!s?.blocked_at,
  };
}

/** Writes a settings change (missing fields keep their value). */
export async function saveSettings(d: D1Database, pid: number, change: { off?: Set<NotifyType>; quiet?: boolean; tzOffset?: number | null }, now: number): Promise<NotifySettingsRow> {
  const cur = await getSettings(d, pid);
  const off = change.off ?? disabledSet(cur);
  const disabled = NOTIFY_TYPES.filter((t) => off.has(t)).join(',');
  const quiet = change.quiet === undefined ? (cur ? cur.quiet : 1) : change.quiet ? 1 : 0;
  const tz = change.tzOffset === undefined ? cur?.tz_offset ?? null : change.tzOffset;
  await d
    .prepare(
      `INSERT INTO notify_settings (player_id, disabled, quiet, tz_offset, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT (player_id) DO UPDATE SET disabled = excluded.disabled, quiet = excluded.quiet, tz_offset = excluded.tz_offset, updated_at = excluded.updated_at`,
    )
    .bind(pid, disabled, quiet, tz, now)
    .run();
  return (await getSettings(d, pid))!;
}

notifyRoutes.get('/settings', async (c) => c.json(settingsView(await getSettings(db(c.env), c.get('session').pid))));

const Body = z.object({
  on: z.partialRecord(z.enum(NOTIFY_TYPES), z.boolean()).optional(),
  quiet: z.boolean().optional(),
  tzOffset: z.number().int().min(-14 * 60).max(14 * 60).nullable().optional(),
});

notifyRoutes.put('/settings', async (c) => {
  const pid = c.get('session').pid;
  requireRate(`notify:${pid}`, 30, 60_000);
  const body = await readJson(c, Body, 2048);
  const d = db(c.env);
  let off: Set<NotifyType> | undefined;
  if (body.on) {
    off = disabledSet(await getSettings(d, pid));
    for (const [type, on] of Object.entries(body.on) as [NotifyType, boolean][]) {
      if (on) off.delete(type);
      else off.add(type);
    }
  }
  const row = await saveSettings(d, pid, { off, quiet: body.quiet, tzOffset: body.tzOffset }, Date.now());
  return c.json(settingsView(row));
});
