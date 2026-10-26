/**
 * Admin API (/api/admin/*), used by the /admin page (./page.ts). Every route
 * needs the ADMIN_TOKEN (./auth.ts). Every state-changing action carries a
 * client request id and is written to admin_audit before it runs: a retry
 * with the same id answers the recorded result and changes nothing again.
 *
 * Reads: overview metrics, player search and detail, client errors, the
 * audit log, seasons and shards, /paysupport tickets (when that table exists).
 * Actions: ban / unban, rename (moderation), adjust Drachmae or season gold,
 * refund a Stars purchase, end / start a season.
 */
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { forgetBans } from '../ban';
import { readJson } from '../body';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { db } from '../middleware';
import { forgetSessions } from '../auth/sessions';
import { generateDisplayName } from '../names/generate';
import { nameKey } from '../names/validate';
import { ADMIN_NAME_LOCK_MS, setDisplayName } from '../players';
import { currentSeason, endSeason, forgetSeasonCache, randomToken } from '../war/store';
import { log } from '../telemetry/log';
import { requireAdmin } from './auth';
import { deleteAccount } from '../account/delete';

export const admin = new Hono<AppEnv>();
admin.use('*', requireAdmin);

const RequestId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const Reason = z.string().trim().min(3).max(300);

// ------------------------------------------------------------------ audit

interface AuditRow {
  request_id: string;
  actor: string;
  action: string;
  player_id: number | null;
  result: string | null;
}

/**
 * Runs `run` once per request id: the audit row (with a nonce) is written
 * first; a second call with the same id returns the stored result with
 * `replayed: true`. `run` receives an SQL guard (its two parameters numbered from `first`) that only holds for the
 * request that wrote the row (for statements that must apply exactly once).
 */
async function audited<T extends Record<string, unknown>>(
  c: Context<AppEnv>,
  action: string,
  playerId: number | null,
  requestId: string,
  detail: Record<string, unknown>,
  run: (guard: { sql: (first: number) => string; binds: [string, string] }) => Promise<T>,
): Promise<T & { replayed: boolean }> {
  const d = db(c.env);
  const now = Date.now();
  const nonce = randomToken(8);
  const ins = await d
    .prepare(
      `INSERT INTO admin_audit (request_id, actor, action, player_id, detail, ip, nonce, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) ON CONFLICT (request_id) DO NOTHING`,
    )
    .bind(requestId, c.get('admin'), action, playerId, JSON.stringify(detail), c.req.header('cf-connecting-ip') ?? null, nonce, now)
    .run();
  if (ins.meta.changes !== 1) {
    const prev = await d.prepare('SELECT request_id, actor, action, player_id, result FROM admin_audit WHERE request_id = ?1').bind(requestId).first<AuditRow>();
    if (!prev || prev.action !== action || prev.player_id !== playerId) throw new ApiError(409, 'request_id_reused', 'This request id belongs to another action');
    if (prev.result === null) throw new ApiError(409, 'in_progress', 'This action is still running (or was interrupted; check the audit log)');
    const r = JSON.parse(prev.result) as T & { error?: string };
    if (r.error) throw new ApiError(409, 'failed_before', `This action failed before: ${r.error}`);
    return { ...r, replayed: true };
  }
  const guard = { sql: (i: number) => `EXISTS (SELECT 1 FROM admin_audit WHERE request_id = ?${i} AND nonce = ?${i + 1})`, binds: [requestId, nonce] as [string, string] };
  try {
    const result = await run(guard);
    await d.prepare('UPDATE admin_audit SET result = ?2 WHERE request_id = ?1').bind(requestId, JSON.stringify(result)).run();
    log('info', 'admin_action', { actor: c.get('admin'), action, player: playerId, requestId });
    return { ...result, replayed: false };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await d.prepare('UPDATE admin_audit SET result = ?2 WHERE request_id = ?1').bind(requestId, JSON.stringify({ error: message.slice(0, 300) })).run();
    log('warn', 'admin_action_failed', { actor: c.get('admin'), action, player: playerId, requestId, message });
    throw e;
  }
}

// ------------------------------------------------------------------ helpers

async function playerOr404(d: D1Database, id: number) {
  const p = await d.prepare('SELECT * FROM players WHERE id = ?1').bind(id).first<Record<string, unknown> & { id: number; telegram_id: number }>();
  if (!p) throw new ApiError(404, 'not_found', 'No such player');
  return p;
}

const pidParam = (c: Context<AppEnv>) => {
  const n = Number(c.req.param('id'));
  if (!Number.isSafeInteger(n) || n <= 0) throw new ApiError(400, 'bad_request', 'Bad player id');
  return n;
};

const DAY = 86_400_000;

// ------------------------------------------------------------------ reads

admin.get('/me', (c) => c.json({ actor: c.get('admin') }));

admin.get('/overview', async (c) => {
  const d = db(c.env);
  const now = Date.now();
  const one = async <T>(sql: string, ...binds: unknown[]) => (await d.prepare(sql).bind(...binds).first<T>())!;
  const [players, errors, banned, season] = await Promise.all([
    one<{ total: number; new24h: number; active24h: number; active7d: number }>(
      'SELECT COUNT(*) AS total, SUM(created_at >= ?1) AS new24h, SUM(last_seen_at >= ?1) AS active24h, SUM(last_seen_at >= ?2) AS active7d FROM players',
      now - DAY,
      now - 7 * DAY,
    ),
    one<{ groups: number; events: number }>('SELECT COUNT(*) AS groups, COALESCE(SUM(count), 0) AS events FROM client_errors WHERE last_seen >= ?1', now - DAY),
    one<{ n: number }>('SELECT COUNT(*) AS n FROM players WHERE banned_at IS NOT NULL'),
    d.prepare("SELECT * FROM online_seasons WHERE status = 'active' ORDER BY id DESC LIMIT 1").first(),
  ]);
  return c.json({ now, players, errors, banned: banned.n, season, analyticsEngine: !!c.env.ANALYTICS });
});

admin.get('/players', async (c) => {
  const d = db(c.env);
  const q = (c.req.query('q') ?? '').trim().replace(/^@/, '').slice(0, 64);
  let rows;
  if (!q) {
    rows = await d.prepare('SELECT * FROM players ORDER BY last_seen_at DESC LIMIT 50').all();
  } else if (/^\d+$/.test(q)) {
    rows = await d.prepare('SELECT * FROM players WHERE id = ?1 OR telegram_id = ?1 LIMIT 50').bind(Number(q)).all();
  } else {
    const like = `${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    rows = await d
      .prepare(
        "SELECT * FROM players WHERE username LIKE ?1 ESCAPE '\\' OR first_name LIKE ?1 ESCAPE '\\' OR display_name LIKE ?1 ESCAPE '\\' ORDER BY last_seen_at DESC LIMIT 50",
      )
      .bind(like)
      .all();
  }
  return c.json({ players: rows.results });
});

admin.get('/players/:id', async (c) => {
  const d = db(c.env);
  const id = pidParam(c);
  const player = await playerOr404(d, id);
  const season = await currentSeason(d);
  const all = async (sql: string, ...binds: unknown[]) => (await d.prepare(sql).bind(...binds).all()).results;
  const [clan, milestones, audit] = await Promise.all([    d
      .prepare('SELECT m.role, m.joined_at, c.id, c.name, c.tag FROM clan_members m JOIN clans c ON c.id = m.clan_id WHERE m.season_id = ?1 AND m.player_id = ?2')
      .bind(season.id, id)
      .first(),
    all('SELECT milestone, created_at FROM analytics_milestones WHERE player_id = ?1', id),
    all('SELECT request_id, actor, action, detail, result, created_at FROM admin_audit WHERE player_id = ?1 ORDER BY id DESC LIMIT 50', id),
  ]);
  return c.json({
    player,
    season: season.id,
    clan,
    milestones,
    audit,
  });
});

admin.get('/errors', async (c) => {
  const d = db(c.env);
  const version = c.req.query('version');
  const rows = version
    ? await d.prepare('SELECT * FROM client_errors WHERE app_version = ?1 ORDER BY last_seen DESC LIMIT 100').bind(version).all()
    : await d.prepare('SELECT * FROM client_errors ORDER BY last_seen DESC LIMIT 100').all();
  return c.json({ errors: rows.results });
});

admin.get('/audit', async (c) => {
  const rows = await db(c.env).prepare('SELECT id, request_id, actor, action, player_id, detail, result, ip, created_at FROM admin_audit ORDER BY id DESC LIMIT 200').all();
  return c.json({ audit: rows.results });
});

admin.get('/season', async (c) => {
  const d = db(c.env);
  const seasons = await d.prepare('SELECT * FROM online_seasons ORDER BY id DESC LIMIT 10').all<{ id: number; status: string }>();
  const active = seasons.results.find((s) => s.status === 'active') ?? null;
  return c.json({ active, seasons: seasons.results });
});

// ------------------------------------------------------------------ actions

const BanBody = z.object({ requestId: RequestId, reason: Reason });

admin.post('/players/:id/ban', async (c) => {
  const id = pidParam(c);
  const body = await readJson(c, BanBody, 2048);
  const d = db(c.env);
  await playerOr404(d, id);
  const out = await audited(c, 'ban', id, body.requestId, { reason: body.reason }, async () => {
    const r = await d.prepare('UPDATE players SET banned_at = ?2, ban_reason = ?3 WHERE id = ?1 AND banned_at IS NULL').bind(id, Date.now(), body.reason).run();
    return { banned: true, changed: r.meta.changes === 1 };
  });
  forgetBans();
  return c.json(out);
});

admin.post('/players/:id/unban', async (c) => {
  const id = pidParam(c);
  const body = await readJson(c, BanBody, 2048);
  const d = db(c.env);
  await playerOr404(d, id);
  const out = await audited(c, 'unban', id, body.requestId, { reason: body.reason }, async () => {
    const r = await d.prepare('UPDATE players SET banned_at = NULL, ban_reason = NULL WHERE id = ?1 AND banned_at IS NOT NULL').bind(id).run();
    return { banned: false, changed: r.meta.changes === 1 };
  });
  forgetBans();
  return c.json(out);
});

/**
 * Account deletion by the operator (ADR-0009 §7, reason 'admin'): for players
 * who can't delete in the game or the bot, e.g. a banned email-only player who
 * asked support. `result` is 'busy' while the player is in a battle (retry
 * with a new request id) and 'resumable' when the cron will finish it.
 */
admin.post('/players/:id/delete', async (c) => {
  const id = pidParam(c);
  const body = await readJson(c, BanBody, 2048);
  await playerOr404(db(c.env), id);
  const out = await audited(c, 'delete', id, body.requestId, { reason: body.reason }, async () => ({ result: await deleteAccount(c.env, id, 'admin') }));
  return c.json(out);
});

/**
 * Moderation (ADR-0009 §6): reset the player to a fresh generated name and
 * lock renames for ADMIN_NAME_LOCK_MS. The old name stays held for 30 days
 * through display_name_history.
 */
admin.post('/players/:id/rename', async (c) => {
  const id = pidParam(c);
  const body = await readJson(c, BanBody, 2048);
  const d = db(c.env);
  const p = await playerOr404(d, id);
  if (p.deleted_at !== null) throw new ApiError(409, 'deleted', 'This player was deleted');
  const out = await audited(c, 'rename', id, body.requestId, { reason: body.reason, old: p.display_name }, async () => {
    const now = Date.now();
    const lockedUntil = now + ADMIN_NAME_LOCK_MS;
    for (let attempt = 0; ; attempt++) {
      const name = generateDisplayName();
      try {
        await setDisplayName(d, id, name, nameKey(name), now, { admin: true, lockedUntil });
        return { displayName: name, lockedUntil };
      } catch (e) {
        if (attempt >= 4 || !/UNIQUE/i.test(String((e as Error).message))) throw e;
      }
    }
  });
  forgetSessions(id);
  return c.json(out);
});

const SeasonBody = z.object({ requestId: RequestId, reason: Reason, startNext: z.boolean().optional() });

/**
 * Ends the active season now (final ranks and titles into season_rewards).
 * The next season starts on the next player request, or right away with
 * startNext. Other isolates may keep the old season cached for up to 30 s.
 */
admin.post('/season/end', async (c) => {
  const body = await readJson(c, SeasonBody, 2048);
  const d = db(c.env);
  const out = await audited(c, 'season_end', null, body.requestId, { reason: body.reason, startNext: !!body.startNext }, async () => {
    const active = await d.prepare("SELECT id FROM online_seasons WHERE status = 'active' ORDER BY id DESC LIMIT 1").first<{ id: number }>();
    if (!active) throw new ApiError(409, 'no_active_season', 'No season is active');
    const now = Date.now();
    await endSeason(d, active.id, now);
    forgetSeasonCache();
    const next = body.startNext ? await currentSeason(d, now) : null;
    return { ended: active.id, started: next?.id ?? null };
  });
  return c.json(out);
});

/** Starts a new season when none is active (the same bootstrap a player request would run). */
admin.post('/season/start', async (c) => {
  const body = await readJson(c, SeasonBody, 2048);
  const d = db(c.env);
  const out = await audited(c, 'season_start', null, body.requestId, { reason: body.reason }, async () => {
    const active = await d.prepare("SELECT id FROM online_seasons WHERE status = 'active' ORDER BY id DESC LIMIT 1").first<{ id: number }>();
    if (active) throw new ApiError(409, 'season_active', `Season ${active.id} is still active; end it first`);
    forgetSeasonCache();
    const s = await currentSeason(d);
    return { started: s.id, endsAt: s.endsAt };
  });
  return c.json(out);
});
