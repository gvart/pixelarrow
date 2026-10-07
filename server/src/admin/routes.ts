/**
 * Admin API (/api/admin/*), used by the /admin page (./page.ts). Every route
 * needs the ADMIN_TOKEN (./auth.ts). Every state-changing action carries a
 * client request id and is written to admin_audit before it runs: a retry
 * with the same id answers the recorded result and changes nothing again.
 *
 * Reads: overview metrics, player search and detail, client errors, the
 * audit log, seasons and shards, /paysupport tickets (when that table exists).
 * Actions: ban / unban, adjust Drachmae or season gold, refund a Stars
 * purchase, end / start a season.
 */
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { forgetBans } from '../ban';
import { readJson } from '../body';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { db, secret } from '../middleware';
import { recordRefund } from '../payments';
import { callBot } from '../telegramApi';
import { creditOnce } from '../economy/wallet';
import { currentSeason, endSeason, forgetSeasonCache, randomToken, shardDoName } from '../online/store';
import { log } from '../telemetry/log';
import { requireAdmin } from './auth';

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
export async function audited<T extends Record<string, unknown>>(
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

async function tableExists(d: D1Database, name: string): Promise<boolean> {
  return !!(await d.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1").bind(name).first());
}

const DAY = 86_400_000;

// ------------------------------------------------------------------ reads

admin.get('/me', (c) => c.json({ actor: c.get('admin') }));

admin.get('/overview', async (c) => {
  const d = db(c.env);
  const now = Date.now();
  const one = async <T>(sql: string, ...binds: unknown[]) => (await d.prepare(sql).bind(...binds).first<T>())!;
  const [players, purchases, drachmae, errors, banned, season] = await Promise.all([
    one<{ total: number; new24h: number; active24h: number; active7d: number }>(
      'SELECT COUNT(*) AS total, SUM(created_at >= ?1) AS new24h, SUM(last_seen_at >= ?1) AS active24h, SUM(last_seen_at >= ?2) AS active7d FROM players',
      now - DAY,
      now - 7 * DAY,
    ),
    one<{ n24h: number; stars24h: number; n7d: number; stars7d: number; refunds7d: number }>(
      `SELECT SUM(created_at >= ?1) AS n24h, COALESCE(SUM(CASE WHEN created_at >= ?1 AND refunded = 0 THEN stars_amount END), 0) AS stars24h,
              SUM(created_at >= ?2) AS n7d, COALESCE(SUM(CASE WHEN created_at >= ?2 AND refunded = 0 THEN stars_amount END), 0) AS stars7d,
              SUM(refunded = 1 AND refunded_at >= ?2) AS refunds7d
       FROM purchases WHERE created_at >= ?2 OR refunded_at >= ?2`,
      now - DAY,
      now - 7 * DAY,
    ),
    one<{ circulating: number; negative: number }>('SELECT COALESCE(SUM(drachmae), 0) AS circulating, SUM(drachmae < 0) AS negative FROM wallets'),
    one<{ groups: number; events: number }>('SELECT COUNT(*) AS groups, COALESCE(SUM(count), 0) AS events FROM client_errors WHERE last_seen >= ?1', now - DAY),
    one<{ n: number }>('SELECT COUNT(*) AS n FROM players WHERE banned_at IS NOT NULL'),
    d.prepare("SELECT * FROM online_seasons WHERE status = 'active' ORDER BY id DESC LIMIT 1").first(),
  ]);
  return c.json({ now, players, purchases, drachmae, errors, banned: banned.n, season, analyticsEngine: !!c.env.ANALYTICS });
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
      .prepare("SELECT * FROM players WHERE username LIKE ?1 ESCAPE '\\' OR first_name LIKE ?1 ESCAPE '\\' ORDER BY last_seen_at DESC LIMIT 50")
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
  const [wallet, ledger, purchases, entitlements, profile, heroes, items, clan, save, milestones, audit, pass] = await Promise.all([
    d.prepare('SELECT drachmae, updated_at FROM wallets WHERE player_id = ?1').bind(id).first(),
    all('SELECT delta, kind, ref, created_at FROM drachmae_ledger WHERE player_id = ?1 ORDER BY id DESC LIMIT 50', id),
    all('SELECT id, telegram_payment_charge_id, product_id, currency, stars_amount, created_at, refunded, refunded_at FROM purchases WHERE player_id = ?1 ORDER BY id DESC', id),
    all('SELECT product_id, purchase_id, granted_at, revoked_at FROM entitlements WHERE player_id = ?1 ORDER BY id', id),
    d.prepare('SELECT * FROM online_profiles WHERE season_id = ?1 AND player_id = ?2').bind(season.id, id).first(),
    all('SELECT id, data, wounded_until, busy_ticket FROM online_heroes WHERE season_id = ?1 AND player_id = ?2', season.id, id),
    all('SELECT uid, data FROM online_items WHERE season_id = ?1 AND player_id = ?2 LIMIT 200', season.id, id),
    d
      .prepare('SELECT m.role, m.joined_at, c.id, c.name, c.tag FROM clan_members m JOIN clans c ON c.id = m.clan_id WHERE m.season_id = ?1 AND m.player_id = ?2')
      .bind(season.id, id)
      .first(),
    d.prepare('SELECT revision, version, size, updated_at, data FROM saves WHERE player_id = ?1').bind(id).first<{ revision: number; version: number; size: number; updated_at: number; data: string }>(),
    all('SELECT milestone, created_at FROM analytics_milestones WHERE player_id = ?1', id),
    all('SELECT request_id, actor, action, detail, result, created_at FROM admin_audit WHERE player_id = ?1 ORDER BY id DESC LIMIT 50', id),
    d.prepare('SELECT xp, premium FROM pass_progress WHERE season_id = ?1 AND player_id = ?2').bind(season.id, id).first(),
  ]);
  const brief = (json: unknown) => {
    try {
      return JSON.parse(String(json)) as Record<string, unknown>;
    } catch {
      return null;
    }
  };
  let campaign: Record<string, unknown> | null = null;
  if (save) {
    const s = brief(save.data);
    campaign = {
      revision: save.revision,
      version: save.version,
      size: save.size,
      updatedAt: save.updated_at,
      gold: s?.gold ?? null,
      heroes: Array.isArray(s?.heroes) ? (s!.heroes as unknown[]).length : null,
      stash: Array.isArray(s?.stash) ? (s!.stash as unknown[]).length : null,
      won: s?.won ?? null,
      fought: s?.fought ?? null,
    };
  }
  const hero = (h: { id: unknown; data: unknown; wounded_until: unknown; busy_ticket: unknown }) => {
    const x = brief(h.data) ?? {};
    return { id: h.id, name: x.name ?? null, arch: x.arch ?? x.archetype ?? null, level: x.level ?? null, woundedUntil: h.wounded_until, busy: !!h.busy_ticket };
  };
  const item = (i: { uid: unknown; data: unknown }) => {
    const x = brief(i.data) ?? {};
    return { uid: i.uid, def: x.def ?? x.id ?? null, rarity: x.rarity ?? null };
  };
  return c.json({
    player,
    season: season.id,
    wallet: wallet ?? { drachmae: 0 },
    ledger,
    purchases,
    entitlements,
    online: profile,
    pass,
    clan,
    heroes: (heroes as Parameters<typeof hero>[0][]).map(hero),
    stash: (items as Parameters<typeof item>[0][]).map(item),
    campaign,
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

/** Candidate names for the /paysupport tickets table (added by the payment-compliance work). */
const TICKET_TABLES = ['support_requests', 'support_tickets', 'paysupport_tickets', 'payment_support', 'paysupport'];

admin.get('/tickets', async (c) => {
  const d = db(c.env);
  for (const name of TICKET_TABLES) {
    if (await tableExists(d, name)) {
      const rows = await d.prepare(`SELECT * FROM ${name} ORDER BY rowid DESC LIMIT 200`).all();
      return c.json({ available: true, table: name, tickets: rows.results });
    }
  }
  return c.json({ available: false, table: null, tickets: [] });
});

admin.get('/season', async (c) => {
  const d = db(c.env);
  const seasons = await d.prepare('SELECT * FROM online_seasons ORDER BY id DESC LIMIT 10').all<{ id: number; status: string }>();
  const active = seasons.results.find((s) => s.status === 'active') ?? null;
  const shards = active
    ? (
        await d
          .prepare(
            `SELECT s.id, s.players, s.map_id, s.created_at,
               (SELECT COUNT(*) FROM online_regions h WHERE h.season_id = s.season_id AND h.shard_id = s.id AND h.owner_id IS NOT NULL) AS owned_regions,
               (SELECT COUNT(*) FROM clans k WHERE k.season_id = s.season_id AND k.shard_id = s.id) AS clans,
               (SELECT COUNT(*) FROM market_listings m WHERE m.season_id = s.season_id AND m.shard_id = s.id AND m.status = 'open') AS open_listings,
               (SELECT group_concat(b.boss || ':' || b.status || ':' || b.hp || '/' || b.max_hp, ' ') FROM world_bosses b WHERE b.season_id = s.season_id AND b.shard_id = s.id) AS bosses
             FROM online_shards s WHERE s.season_id = ?1 ORDER BY s.id`,
          )
          .bind(active.id)
          .all<{ id: number } & Record<string, unknown>>()
      ).results
    : [];
  // Live sockets per shard from its Durable Object (best effort).
  const live = await Promise.all(
    shards.map(async (s) => {
      try {
        const stub = c.env.REGION.get(c.env.REGION.idFromName(shardDoName({ season: active!.id, id: s.id })));
        return (await stub.livePlayers()).length;
      } catch {
        return null;
      }
    }),
  );
  return c.json({ active, seasons: seasons.results, shards: shards.map((s, i) => ({ ...s, live: live[i] })) });
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

export const MAX_ADJUST = 1_000_000;
const AdjustBody = z.object({
  requestId: RequestId,
  currency: z.enum(['drachmae', 'gold']),
  delta: z
    .number()
    .int()
    .min(-MAX_ADJUST)
    .max(MAX_ADJUST)
    .refine((n) => n !== 0, 'delta must not be 0'),
  reason: Reason,
});

/**
 * Drachmae: a ledger row of kind 'admin' (ref = request id), which may take
 * the balance below zero (spending is then blocked, as after a refund).
 * Gold: the player's purse in the current online season (never below 0).
 * The offline campaign's gold lives in the player's save and is not edited.
 */
admin.post('/players/:id/adjust', async (c) => {
  const id = pidParam(c);
  const body = await readJson(c, AdjustBody, 2048);
  const d = db(c.env);
  await playerOr404(d, id);
  const out = await audited(c, 'adjust', id, body.requestId, { currency: body.currency, delta: body.delta, reason: body.reason }, async (g) => {
    const now = Date.now();
    if (body.currency === 'drachmae') {
      const applied = await creditOnce(d, id, body.delta, 'admin', body.requestId, now);
      const w = await d.prepare('SELECT drachmae FROM wallets WHERE player_id = ?1').bind(id).first<{ drachmae: number }>();
      return { currency: 'drachmae', delta: body.delta, applied, balance: w?.drachmae ?? 0 };
    }
    const season = await currentSeason(d, now);
    const r = await d
      .prepare(`UPDATE online_profiles SET gold = MAX(0, gold + ?3), rev = rev + 1, updated_at = ?4 WHERE season_id = ?1 AND player_id = ?2 AND ${g.sql(5)}`)
      .bind(season.id, id, body.delta, now, ...g.binds)
      .run();
    if (r.meta.changes !== 1) throw new ApiError(409, 'no_profile', 'The player has not joined the current online season');
    const p = await d.prepare('SELECT gold FROM online_profiles WHERE season_id = ?1 AND player_id = ?2').bind(season.id, id).first<{ gold: number }>();
    return { currency: 'gold', delta: body.delta, applied: true, season: season.id, balance: p?.gold ?? 0 };
  });
  return c.json(out);
});

const RefundBody = z.object({ requestId: RequestId, reason: Reason });

/**
 * Refunds a Telegram Stars payment (refundStarPayment), then records it the
 * way the refunded_payment webhook does (recordRefund: revokes the
 * entitlement or debits the pack's Drachmae; idempotent). A purchase already
 * marked refunded is not sent to Telegram again.
 */
admin.post('/purchases/:charge/refund', async (c) => {
  const charge = c.req.param('charge');
  if (!/^[A-Za-z0-9_:.-]{1,200}$/.test(charge)) throw new ApiError(400, 'bad_request', 'Bad charge id');
  const body = await readJson(c, RefundBody, 2048);
  const d = db(c.env);
  const p = await d
    .prepare(
      `SELECT pu.player_id, pu.product_id, pu.currency, pu.stars_amount, pu.payload, pu.refunded, pl.telegram_id
       FROM purchases pu JOIN players pl ON pl.id = pu.player_id WHERE pu.telegram_payment_charge_id = ?1`,
    )
    .bind(charge)
    .first<{ player_id: number; product_id: string; currency: string; stars_amount: number; payload: string; refunded: number; telegram_id: number }>();
  if (!p) throw new ApiError(404, 'not_found', 'No purchase with that charge id');
  const out = await audited(c, 'refund', p.player_id, body.requestId, { charge, product: p.product_id, stars: p.stars_amount, reason: body.reason }, async () => {
    if (p.refunded) return { charge, refunded: true, alreadyRefunded: true, telegram: 'skipped' };
    let telegram = 'refunded';
    try {
      await callBot(secret(c.env, 'TELEGRAM_BOT_TOKEN'), 'refundStarPayment', { user_id: p.telegram_id, telegram_payment_charge_id: charge });
    } catch (e) {
      // Already refunded on Telegram's side (e.g. by hand): record it here too.
      if (!/CHARGE_ALREADY_REFUNDED/i.test((e as Error).message)) throw e;
      telegram = 'already_refunded';
    }
    await recordRefund(d, { currency: p.currency, total_amount: p.stars_amount, invoice_payload: p.payload, telegram_payment_charge_id: charge });
    const w = await d.prepare('SELECT drachmae FROM wallets WHERE player_id = ?1').bind(p.player_id).first<{ drachmae: number }>();
    return { charge, refunded: true, alreadyRefunded: false, telegram, drachmae: w?.drachmae ?? 0 };
  });
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
