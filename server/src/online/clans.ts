/**
 * Clans (POST/GET /api/online/clans/*): one shard, one season. Roles leader /
 * officer / member; leader and officers invite (Telegram deep link
 * t.me/<bot>/<app>?startapp=clan_<code>) and kick lower ranks; only the leader
 * promotes, demotes or hands over leadership. Members' hexes are clan land:
 * any member can garrison them.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { readJson } from '../body';
import type { AppEnv, Env } from '../env';
import { ApiError } from '../errors';
import { requireAuth } from '../middleware';
import { callBot } from '../telegramApi';
import { canInvite, canKick, canPromote, clanInviteLink, ONLINE_RULES, type ClanRole } from '../../../src/online/rules';
import { base, limit, player, type PlayerCtx } from './context';
import { ensureProfile, getProfile, membership, playerNames, randomCode } from './store';
import { ev, later, notify } from '../notify/outbox';

export const clans = new Hono<AppEnv>();
clans.use('*', requireAuth);

let botUsername: { name: string | null; at: number } | null = null;

/** Bot username for invite links: TELEGRAM_BOT_USERNAME, else getMe (cached per isolate). */
async function resolveBot(env: Env): Promise<string | null> {
  if (env.TELEGRAM_BOT_USERNAME) return env.TELEGRAM_BOT_USERNAME.replace(/^@/, '');
  if (botUsername && Date.now() - botUsername.at < 3_600_000) return botUsername.name;
  let name: string | null = null;
  if (env.TELEGRAM_BOT_TOKEN) {
    try {
      name = (await callBot<{ username?: string }>(env.TELEGRAM_BOT_TOKEN, 'getMe', {})).username ?? null;
    } catch {
      name = null;
    }
  }
  botUsername = { name, at: Date.now() };
  return name;
}

interface ClanRow {
  id: number;
  season_id: number;
  shard_id: number;
  name: string;
  tag: string;
  created_by: number;
  created_at: number;
}

async function clanView(pc: { db: D1Database; season: { id: number } }, clanId: number) {
  const clan = await pc.db.prepare('SELECT * FROM clans WHERE id = ?1').bind(clanId).first<ClanRow>();
  if (!clan) return null;
  const members = await pc.db
    .prepare('SELECT player_id, role, joined_at FROM clan_members WHERE clan_id = ?1 ORDER BY joined_at')
    .bind(clanId)
    .all<{ player_id: number; role: ClanRole; joined_at: number }>();
  const hexes = await pc.db
    .prepare('SELECT owner_id, COUNT(*) AS n FROM online_hexes WHERE season_id = ?1 AND clan_id = ?2 GROUP BY owner_id')
    .bind(pc.season.id, clanId)
    .all<{ owner_id: number; n: number }>();
  const held = new Map(hexes.results.map((h) => [h.owner_id, h.n]));
  const names = await playerNames(pc.db, members.results.map((m) => m.player_id));
  const rank = { leader: 0, officer: 1, member: 2 } as const;
  return {
    id: clan.id,
    name: clan.name,
    tag: clan.tag,
    shard: clan.shard_id,
    createdAt: clan.created_at,
    hexes: hexes.results.reduce((a, h) => a + h.n, 0),
    members: members.results
      .map((m) => ({ id: m.player_id, name: names.get(m.player_id) ?? '?', role: m.role, joinedAt: m.joined_at, hexes: held.get(m.player_id) ?? 0 }))
      .sort((a, b) => rank[a.role] - rank[b.role] || a.joinedAt - b.joinedAt),
  };
}

/** Statements that move a player's land in or out of a clan and send away garrisons that no longer belong. */
function landStatements(d: D1Database, season: number, pid: number, clanId: number | null): D1PreparedStatement[] {
  return [
    d.prepare('UPDATE online_hexes SET clan_id = ?3 WHERE season_id = ?1 AND owner_id = ?2').bind(season, pid, clanId),
    // My heroes guarding other people's hexes, and other people's heroes guarding mine, go home.
    d
      .prepare(
        `DELETE FROM online_garrisons WHERE season_id = ?1 AND hero_id IN (
           SELECT g.hero_id FROM online_garrisons g JOIN online_hexes x ON x.season_id = g.season_id AND x.shard_id = g.shard_id AND x.q = g.q AND x.r = g.r
           WHERE g.season_id = ?1 AND ((g.player_id = ?2 AND x.owner_id != ?2) OR (x.owner_id = ?2 AND g.player_id != ?2)))`,
      )
      .bind(season, pid),
  ];
}

const CreateBody = z.object({
  name: z.string().trim().min(3).max(24).regex(/^[\p{L}\p{N} '\-]+$/u),
  tag: z.string().trim().min(2).max(5).regex(/^[A-Za-z0-9]+$/),
});

clans.post('/', async (c) => {
  limit(c, 'clan', 10);
  const pc = await player(c);
  const body = await readJson(c, CreateBody, 1024);
  if (pc.clan) throw new ApiError(409, 'in_clan', 'Leave your clan first');
  let id: number;
  try {
    const r = await pc.db
      .prepare('INSERT INTO clans (season_id, shard_id, name, tag, created_by, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) RETURNING id')
      .bind(pc.season.id, pc.shard.id, body.name, body.tag.toUpperCase(), pc.pid, pc.now)
      .first<{ id: number }>();
    id = r!.id;
  } catch {
    throw new ApiError(409, 'name_taken', 'That clan name or tag is taken');
  }
  const res = await pc.db.batch([
    pc.db.prepare('INSERT OR IGNORE INTO clan_members (season_id, player_id, clan_id, role, joined_at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(pc.season.id, pc.pid, id, 'leader', pc.now),
    ...landStatements(pc.db, pc.season.id, pc.pid, id),
  ]);
  if (res[0].meta.changes !== 1) {
    await pc.db.prepare('DELETE FROM clans WHERE id = ?1').bind(id).run();
    throw new ApiError(409, 'in_clan', 'Leave your clan first');
  }
  return c.json({ clan: await clanView(pc, id), role: 'leader' });
});

clans.get('/mine', async (c) => {
  const b = await base(c);
  const m = await membership(b.db, b.season.id, b.pid);
  if (!m) return c.json({ clan: null, role: null });
  return c.json({ clan: await clanView(b, m.clanId), role: m.role });
});

clans.post('/invite', async (c) => {
  limit(c, 'invite', 20);
  const pc = await player(c);
  if (!pc.clan || !canInvite(pc.clan.role)) throw new ApiError(403, 'forbidden', 'Only the leader and officers invite');
  const code = randomCode(10);
  const expiresAt = pc.now + ONLINE_RULES.inviteTtlMs;
  await pc.db
    .prepare('INSERT INTO clan_invites (code, clan_id, created_by, created_at, expires_at, max_uses) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
    .bind(code, pc.clan.clanId, pc.pid, pc.now, expiresAt, ONLINE_RULES.inviteMaxUses)
    .run();
  const bot = await resolveBot(c.env);
  const link = clanInviteLink(bot, code, c.env.TELEGRAM_APP_NAME || 'play', `${(c.env.GAME_URL || 'https://pixelarrow.app').replace(/\/+$/, '')}/`);
  return c.json({ code, link, expiresAt, maxUses: ONLINE_RULES.inviteMaxUses });
});

interface InviteRow {
  code: string;
  clan_id: number;
  created_by: number;
  expires_at: number;
  max_uses: number;
  uses: number;
}

async function validInvite(d: D1Database, code: string, now: number): Promise<InviteRow & { clan: ClanRow }> {
  if (!/^[A-Za-z0-9]{4,32}$/.test(code)) throw new ApiError(404, 'invalid_invite', 'This invite link is not valid');
  const inv = await d.prepare('SELECT * FROM clan_invites WHERE code = ?1').bind(code).first<InviteRow>();
  if (!inv) throw new ApiError(404, 'invalid_invite', 'This invite link is not valid');
  if (inv.expires_at < now || inv.uses >= inv.max_uses) throw new ApiError(410, 'invite_expired', 'This invite link has expired');
  const clan = await d.prepare('SELECT * FROM clans WHERE id = ?1').bind(inv.clan_id).first<ClanRow>();
  if (!clan) throw new ApiError(410, 'invite_expired', 'That clan no longer exists');
  return { ...inv, clan };
}

clans.get('/invite/:code', async (c) => {
  const b = await base(c);
  const inv = await validInvite(b.db, c.req.param('code'), b.now);
  const view = await clanView(b, inv.clan_id);
  const mine = await membership(b.db, b.season.id, b.pid);
  return c.json({ clan: view && { id: view.id, name: view.name, tag: view.tag, members: view.members.length, hexes: view.hexes }, current: mine?.clanId ?? null, sameSeason: inv.clan.season_id === b.season.id });
});

clans.post('/join', async (c) => {
  limit(c, 'join', 10);
  const b = await base(c);
  const body = await readJson(c, z.object({ code: z.string().max(40) }), 1024);
  const inv = await validInvite(b.db, body.code, b.now);
  if (inv.clan.season_id !== b.season.id) throw new ApiError(410, 'invite_expired', 'That clan belongs to a past season');
  // Newcomers are placed in the clan's shard.
  const prof = (await getProfile(b.db, b.season.id, b.pid)) ?? (await ensureProfile(b.db, b.season, b.pid, b.now, inv.clan.shard_id));
  if (prof.shard_id !== inv.clan.shard_id) throw new ApiError(409, 'other_shard', 'That clan fights on another map shard');
  const mine = await membership(b.db, b.season.id, b.pid);
  if (mine?.clanId === inv.clan_id) return c.json({ clan: await clanView(b, inv.clan_id), role: mine.role });
  if (mine) throw new ApiError(409, 'in_clan', 'Leave your clan first');
  const res = await b.db.batch([
    b.db
      .prepare(
        `INSERT OR IGNORE INTO clan_members (season_id, player_id, clan_id, role, joined_at)
         SELECT ?1, ?2, ?3, 'member', ?4
         WHERE (SELECT COUNT(*) FROM clan_members WHERE clan_id = ?3) < ?5
           AND EXISTS (SELECT 1 FROM clan_invites WHERE code = ?6 AND uses < max_uses AND expires_at >= ?4)`,
      )
      .bind(b.season.id, b.pid, inv.clan_id, b.now, ONLINE_RULES.clanMaxMembers, inv.code),
    b.db
      .prepare('UPDATE clan_invites SET uses = uses + 1 WHERE code = ?1 AND EXISTS (SELECT 1 FROM clan_members WHERE season_id = ?2 AND player_id = ?3 AND clan_id = ?4 AND joined_at = ?5)')
      .bind(inv.code, b.season.id, b.pid, inv.clan_id, b.now),
    b.db
      .prepare('UPDATE online_hexes SET clan_id = ?3 WHERE season_id = ?1 AND owner_id = ?2 AND EXISTS (SELECT 1 FROM clan_members WHERE season_id = ?1 AND player_id = ?2 AND clan_id = ?3)')
      .bind(b.season.id, b.pid, inv.clan_id),
  ]);
  if (res[0].meta.changes !== 1) throw new ApiError(409, 'clan_full', 'The clan is full or you already joined one');
  if (inv.created_by !== b.pid) {
    later(c, notify(c.env, [ev(inv.created_by, 'clan_joined', `clan_join:${inv.clan_id}:${b.pid}`, { name: b.name, clan: `[${inv.clan.tag}] ${inv.clan.name}` })], { shard: { season: b.season.id, id: inv.clan.shard_id } }));
  }
  return c.json({ clan: await clanView(b, inv.clan_id), role: 'member' });
});

async function clanName(d: D1Database, id: number): Promise<string> {
  const r = await d.prepare('SELECT name, tag FROM clans WHERE id = ?1').bind(id).first<{ name: string; tag: string }>();
  return r ? `[${r.tag}] ${r.name}` : '?';
}

async function target(pc: PlayerCtx, playerId: number) {
  if (!pc.clan) throw new ApiError(409, 'no_clan', 'You are not in a clan');
  const t = await membership(pc.db, pc.season.id, playerId);
  if (!t || t.clanId !== pc.clan.clanId) throw new ApiError(404, 'not_found', 'Not a member of your clan');
  return { me: pc.clan, them: t };
}

clans.post('/kick', async (c) => {
  limit(c, 'clanadmin', 30);
  const pc = await player(c);
  const body = await readJson(c, z.object({ playerId: z.number().int().positive() }), 1024);
  const { me, them } = await target(pc, body.playerId);
  if (body.playerId === pc.pid || !canKick(me.role, them.role)) throw new ApiError(403, 'forbidden', 'You cannot kick that member');
  await pc.db.batch([
    pc.db.prepare('DELETE FROM clan_members WHERE season_id = ?1 AND player_id = ?2 AND clan_id = ?3').bind(pc.season.id, body.playerId, me.clanId),
    ...landStatements(pc.db, pc.season.id, body.playerId, null),
  ]);
  const name = await clanName(pc.db, me.clanId);
  later(c, notify(c.env, [ev(body.playerId, 'clan_kicked', `clan_kick:${me.clanId}:${body.playerId}:${pc.now}`, { clan: name })], { shard: pc.shard }));
  return c.json({ clan: await clanView(pc, me.clanId), role: me.role });
});

const PromoteBody = z.object({ playerId: z.number().int().positive(), role: z.enum(['leader', 'officer', 'member']) });

clans.post('/promote', async (c) => {
  limit(c, 'clanadmin', 30);
  const pc = await player(c);
  const body = await readJson(c, PromoteBody, 1024);
  const { me, them } = await target(pc, body.playerId);
  if (body.playerId === pc.pid || !canPromote(me.role, them.role, body.role)) throw new ApiError(403, 'forbidden', 'Only the leader changes ranks');
  const stmts = [pc.db.prepare('UPDATE clan_members SET role = ?3 WHERE season_id = ?1 AND player_id = ?2').bind(pc.season.id, body.playerId, body.role)];
  // Handing over leadership: the old leader becomes an officer.
  if (body.role === 'leader') stmts.push(pc.db.prepare("UPDATE clan_members SET role = 'officer' WHERE season_id = ?1 AND player_id = ?2").bind(pc.season.id, pc.pid));
  await pc.db.batch(stmts);
  if (body.role !== them.role) {
    const name = await clanName(pc.db, me.clanId);
    later(c, notify(c.env, [ev(body.playerId, 'clan_role', `clan_role:${me.clanId}:${body.playerId}:${pc.now}`, { clan: name, role: body.role })], { shard: pc.shard }));
  }
  return c.json({ clan: await clanView(pc, me.clanId), role: body.role === 'leader' ? 'officer' : me.role });
});

clans.post('/leave', async (c) => {
  const pc = await player(c);
  if (!pc.clan) throw new ApiError(409, 'no_clan', 'You are not in a clan');
  const clanId = pc.clan.clanId;
  const stmts = [pc.db.prepare('DELETE FROM clan_members WHERE season_id = ?1 AND player_id = ?2').bind(pc.season.id, pc.pid), ...landStatements(pc.db, pc.season.id, pc.pid, null)];
  if (pc.clan.role === 'leader') {
    // The longest-serving officer (else member) takes over; an empty clan dissolves.
    stmts.push(
      pc.db
        .prepare(
          `UPDATE clan_members SET role = 'leader' WHERE season_id = ?1 AND player_id = (
             SELECT player_id FROM clan_members WHERE clan_id = ?2 ORDER BY CASE role WHEN 'officer' THEN 0 ELSE 1 END, joined_at LIMIT 1)`,
        )
        .bind(pc.season.id, clanId),
      pc.db.prepare('DELETE FROM clans WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM clan_members WHERE clan_id = ?1)').bind(clanId),
    );
  }
  await pc.db.batch(stmts);
  return c.json({ clan: null, role: null });
});
