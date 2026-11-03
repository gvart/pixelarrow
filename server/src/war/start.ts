/**
 * A new player's start (/api/war/start/*; docs/WAR.md "Starting a game"; rules in src/war/world/start.ts). Three steps,
 * once per player and season: an alliance, a free home region of it, a path (W-83), locked for the season. The path
 * gives his first men (W-95; active, in slot order); after it, soldiers join only by claiming souls in a region (W-60).
 * Kept in D1 on war_alliance_members (migrations/0037_war_start.sql, 0053_war_paths.sql).
 *
 *   GET  /                     the step (alliance | home | path | done), the alliances with their players, the home
 *                              choices of his alliance (players, men there, quota, why not free), his path and family
 *   POST /alliance { alliance }  join 0..3 (Dodona, Skythia, Kyrene, Elaia); again before the path changes it (home reset)
 *   POST /home     { region }    a free home of his alliance
 *   POST /path     { path, family? }  warrior (with a family), builder or trader: the start is done
 *
 * Refusals (409): started (the start is done), no_alliance, no_home, home_refused, bad_path; 400 for a bad body.
 * Players who came in by the dev routes (DEV_AUTH: /world/dev/alliance and /dev/seed) count as started once they have men.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { readJson } from '../body';
import type { AppEnv, Env } from '../env';
import { ApiError } from '../errors';
import { db, requirePlayable } from '../middleware';
import { makePerson } from '../../../src/war/sim/roster';
import { DEFAULT_CAP, splitQuota } from '../../../src/war/net/protocol';
import { ALLIANCES, WAR_SEASON } from '../../../src/war/world/alliances';
import { homeChoices, homeRefusal, menRefusal, NO_PATH, pathRefusal, PATHS, pathStart, type PathId, type PlayerPath, type StartFamily } from '../../../src/war/world/start';
import type { AllianceId, RegionRole } from '../../../src/war/world/types';
import { ensureStart, insertPerson, nameFor, newId } from './persons';
import { allianceCounts, joinAlliance } from './world/members';
import { worldStub } from './world/routes';

export type StartStep = 'alliance' | 'home' | 'path' | 'done';

export interface StartView {
  step: StartStep;
  alliance: AllianceId | null;
  home: string | null;
  alliances: { id: AllianceId; name: string; members: number }[];
  homes: { id: string; name: string; role: RegionRole; players: number; men: number; quota: number; refusal: string | null }[];
  /** His path and, for a warrior, family (null: not chosen, or a dev player). */
  path: PathId | null;
  family: StartFamily | null;
}

interface StartRow { alliance: number; home: string | null; started_at: number | null; path: PathId | null; family: StartFamily | null; level: number | null }

const quotaOf = (env: Env, a: AllianceId) => splitQuota(Number(env.WAR_CAP) || DEFAULT_CAP)[a];

async function startRow(d: D1Database, pid: number): Promise<StartRow | null> {
  return d.prepare('SELECT alliance, home, started_at, path, family, (SELECT level FROM war_favour WHERE player_id = ?2) AS level FROM war_alliance_members WHERE season = ?1 AND player_id = ?2').bind(WAR_SEASON.id, pid).first<StartRow>();
}

/** W-68: his home region this season (his alliance's home when he picked none; null: no alliance yet). */
export async function homeRegion(d: D1Database, pid: number): Promise<string | null> {
  const r = await startRow(d, pid);
  return r ? (r.home ?? ALLIANCES[r.alliance as AllianceId]?.home ?? null) : null;
}

/** W-85, W-101: his path as the limits read it (NO_PATH: no alliance yet, or a dev player). */
export async function pathOf(d: D1Database, pid: number): Promise<PlayerPath> {
  const r = await startRow(d, pid);
  return r?.path ? { path: r.path, family: r.family, level: r.level ?? 1 } : NO_PATH;
}

/** W-145: his first cart, if one is still owed him (a trader's first join): owed once. */
export async function takeStartCart(d: D1Database, pid: number): Promise<boolean> {
  const r = await d.prepare('UPDATE war_alliance_members SET start_cart = 0 WHERE season = ?1 AND player_id = ?2 AND start_cart = 1').bind(WAR_SEASON.id, pid).run();
  return r.meta.changes > 0;
}

/** Has he men (any not dead)? A dev-seeded player is started without the menu's steps. */
async function hasMen(d: D1Database, pid: number): Promise<boolean> {
  return !!(await d.prepare("SELECT 1 FROM war_persons WHERE player_id = ?1 AND state NOT IN ('dead', 'retired') LIMIT 1").bind(pid).first());
}

async function stepOf(d: D1Database, pid: number, r: StartRow | null): Promise<StartStep> {
  if (!r) return 'alliance';
  if (r.started_at !== null || (await hasMen(d, pid))) return 'done';
  return r.home ? 'path' : 'home';
}

export async function startView(env: Env, pid: number): Promise<StartView> {
  const d = db(env), r = await startRow(d, pid), step = await stepOf(d, pid, r);
  const counts = await allianceCounts(d);
  const alliance = r ? (r.alliance as AllianceId) : null;
  let homes: StartView['homes'] = [];
  if (alliance !== null) {
    const players = new Map((await d.prepare('SELECT home, COUNT(*) AS n FROM war_alliance_members WHERE season = ?1 AND alliance = ?2 AND home IS NOT NULL GROUP BY home').bind(WAR_SEASON.id, alliance).all<{ home: string; n: number }>()).results.map((x) => [x.home, x.n]));
    const world = worldStub(env), quota = quotaOf(env, alliance);
    homes = await Promise.all(homeChoices(alliance).map(async (h) => {
      const st = await world.regionState(h.id).catch(() => null);
      return { id: h.id, name: h.name, role: h.role, players: players.get(h.id) ?? 0, men: st?.live[alliance] ?? 0, quota, refusal: homeRefusal(h.id, alliance, st, quota) };
    }));
  }
  const home = r?.home ?? (step === 'done' && alliance !== null ? ALLIANCES[alliance].home : null);
  return { step, alliance, home, alliances: ALLIANCES.map((a) => ({ id: a.id, name: a.name, members: counts.members[a.id] })), homes, path: r?.path ?? null, family: r?.family ?? null };
}

const started = () => new ApiError(409, 'started', 'Your start is made: your men are in the war');

/** Join an alliance (again before the path: another alliance resets the home). */
export async function chooseAlliance(d: D1Database, pid: number, alliance: AllianceId, now: number): Promise<void> {
  const r = await startRow(d, pid);
  if ((await stepOf(d, pid, r)) === 'done') throw started();
  await joinAlliance(d, pid, alliance, now);
  if (r && r.alliance !== alliance) await d.prepare('UPDATE war_alliance_members SET home = NULL WHERE season = ?1 AND player_id = ?2').bind(WAR_SEASON.id, pid).run();
}

/** Make `region` his home: one of his alliance's, free now (src/war/world/start.ts homeRefusal). */
export async function claimHome(env: Env, pid: number, region: string): Promise<void> {
  const d = db(env), r = await startRow(d, pid);
  if (!r) throw new ApiError(409, 'no_alliance', 'Choose an alliance first');
  if ((await stepOf(d, pid, r)) === 'done') throw started();
  const a = r.alliance as AllianceId;
  const st = await worldStub(env).regionState(region).catch(() => null);
  const why = homeRefusal(region, a, st, quotaOf(env, a));
  if (why) throw new ApiError(409, 'home_refused', why);
  await d.prepare('UPDATE war_alliance_members SET home = ?3 WHERE season = ?1 AND player_id = ?2').bind(WAR_SEASON.id, pid, region).run();
}

/** His path, locked for the season, and its first men in slot order (W-95): fresh L1. Ends the start. Returns their ids. */
export async function pickPath(d: D1Database, pid: number, path: string, family: string | null, now: number): Promise<string[]> {
  const r = await startRow(d, pid);
  if (!r) throw new ApiError(409, 'no_alliance', 'Choose an alliance first');
  if ((await stepOf(d, pid, r)) === 'done') throw started();
  if (!r.home) throw new ApiError(409, 'no_home', 'Choose a home region first');
  const why = pathRefusal(path, family);
  if (why) throw new ApiError(409, 'bad_path', why);
  const first = pathStart(path as PathId, family as StartFamily | null);
  if (menRefusal({ path: path as PathId, family: family as StartFamily | null }, first)) throw new ApiError(409, 'bad_path', `${path} cannot hold his own first men`);
  await ensureStart(d, pid, now);
  // the start is claimed first, so two racing picks make one path
  const claim = await d.prepare('UPDATE war_alliance_members SET started_at = ?3, path = ?4, family = ?5, start_cart = ?6 WHERE season = ?1 AND player_id = ?2 AND started_at IS NULL').bind(WAR_SEASON.id, pid, now, path, family, PATHS[path as PathId].startCart ? 1 : 0).run();
  if (!claim.meta.changes) throw started();
  const taken = new Set<string>();
  const men = first.map((cls, k) => {
    const p = makePerson(newId(pid), cls);
    return { ...p, hero: { ...p.hero, name: nameFor(cls, taken, k) } };
  });
  try {
    await d.batch(men.map((p, slot) => insertPerson(d, pid, p, 'active', slot, now)));
  } catch (e) {
    await d.prepare('UPDATE war_alliance_members SET started_at = NULL, path = NULL, family = NULL WHERE season = ?1 AND player_id = ?2').bind(WAR_SEASON.id, pid).run();
    throw e;
  }
  return men.map((p) => p.id);
}

export const start = new Hono<AppEnv>();
const MAX_BODY = 1024;

start.get('/', requirePlayable, async (c) => c.json(await startView(c.env, c.get('session').pid)));

start.post('/alliance', requirePlayable, async (c) => {
  const b = await readJson(c, z.object({ alliance: z.number().int().min(0).max(ALLIANCES.length - 1) }), MAX_BODY);
  await chooseAlliance(db(c.env), c.get('session').pid, b.alliance as AllianceId, Date.now());
  return c.json(await startView(c.env, c.get('session').pid));
});

start.post('/home', requirePlayable, async (c) => {
  const b = await readJson(c, z.object({ region: z.string().regex(/^[a-z0-9_-]{1,40}$/) }), MAX_BODY);
  await claimHome(c.env, c.get('session').pid, b.region);
  return c.json(await startView(c.env, c.get('session').pid));
});

start.post('/path', requirePlayable, async (c) => {
  const b = await readJson(c, z.object({ path: z.string().regex(/^[a-z_]{1,24}$/), family: z.string().regex(/^[a-z_]{1,24}$/).optional() }), MAX_BODY);
  const ids = await pickPath(db(c.env), c.get('session').pid, b.path, b.family ?? null, Date.now());
  return c.json({ ids, ...(await startView(c.env, c.get('session').pid)) });
});
