/**
 * A new player's start (/api/war/start/*; docs/WAR.md "Starting a game"; rules in src/war/world/start.ts). Three steps,
 * once per player and season: an alliance, a free home region of it, a squad of up to SQUAD_MAX men of the classes with
 * war sprites. The squad is his first men (active, in slot order) and comes out of his home recruit pool, so it replaces
 * recruiting militia for a new player. Kept in D1 on war_alliance_members (migrations/0037_war_start.sql).
 *
 *   GET  /                     the step (alliance | home | squad | done), the alliances with their players, the home
 *                              choices of his alliance (players, men there, quota, why not free), the classes
 *   POST /alliance { alliance }  join 0..3 (Dodona, Skythia, Kyrene, Elaia); again before the squad changes it (home reset)
 *   POST /home     { region }    a free home of his alliance
 *   POST /squad    { classes }   1..SQUAD_MAX men of START_CLASSES: the start is done
 *
 * Refusals (409): started (the start is done), no_alliance, no_home, home_refused, bad_squad; 400 for a bad body.
 * Players who came in by the dev routes (DEV_AUTH: /world/dev/alliance and /dev/seed) count as started once they have men.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { readJson } from '../body';
import type { AppEnv, Env } from '../env';
import { ApiError } from '../errors';
import { db, requirePlayable } from '../middleware';
import { makePerson } from '../../../src/war/sim/roster';
import { SQUAD_MAX } from '../../../src/war/sim/soldiers';
import { DEFAULT_CAP, splitQuota } from '../../../src/war/net/protocol';
import { ALLIANCES, WAR_SEASON } from '../../../src/war/world/alliances';
import { homeChoices, homeRefusal, squadRefusal, START_CLASSES } from '../../../src/war/world/start';
import type { AllianceId, RegionRole } from '../../../src/war/world/types';
import { ensureStart, insertPerson, nameFor, newId } from './persons';
import { allianceCounts, joinAlliance } from './world/members';
import { worldStub } from './world/routes';

export type StartStep = 'alliance' | 'home' | 'squad' | 'done';

export interface StartView {
  step: StartStep;
  alliance: AllianceId | null;
  home: string | null;
  alliances: { id: AllianceId; name: string; members: number }[];
  homes: { id: string; name: string; role: RegionRole; players: number; men: number; quota: number; refusal: string | null }[];
  classes: readonly string[];
  squadMax: number;
}

interface StartRow { alliance: number; home: string | null; started_at: number | null }

const quotaOf = (env: Env, a: AllianceId) => splitQuota(Number(env.WAR_CAP) || DEFAULT_CAP)[a];

async function startRow(d: D1Database, pid: number): Promise<StartRow | null> {
  return d.prepare('SELECT alliance, home, started_at FROM war_alliance_members WHERE season = ?1 AND player_id = ?2').bind(WAR_SEASON.id, pid).first<StartRow>();
}

/** Has he men (any not dead)? A dev-seeded player is started without the menu's steps. */
async function hasMen(d: D1Database, pid: number): Promise<boolean> {
  return !!(await d.prepare("SELECT 1 FROM war_persons WHERE player_id = ?1 AND state NOT IN ('dead', 'retired') LIMIT 1").bind(pid).first());
}

async function stepOf(d: D1Database, pid: number, r: StartRow | null): Promise<StartStep> {
  if (!r) return 'alliance';
  if (r.started_at !== null || (await hasMen(d, pid))) return 'done';
  return r.home ? 'squad' : 'home';
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
  return { step, alliance, home, alliances: ALLIANCES.map((a) => ({ id: a.id, name: a.name, members: counts.members[a.id] })), homes, classes: START_CLASSES, squadMax: SQUAD_MAX };
}

const started = () => new ApiError(409, 'started', 'Your start is made: your men are in the war');

/** Join an alliance (again before the squad: another alliance resets the home). */
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

/** His first squad, in slot order: fresh L1 men of the classes picked, out of the home pool. Ends the start. Returns their ids. */
export async function pickSquad(d: D1Database, pid: number, classes: string[], now: number): Promise<string[]> {
  const r = await startRow(d, pid);
  if (!r) throw new ApiError(409, 'no_alliance', 'Choose an alliance first');
  if ((await stepOf(d, pid, r)) === 'done') throw started();
  if (!r.home) throw new ApiError(409, 'no_home', 'Choose a home region first');
  const why = squadRefusal(classes);
  if (why) throw new ApiError(409, 'bad_squad', why);
  await ensureStart(d, pid, now);
  // the start is claimed first, so two racing picks make one squad
  const claim = await d.prepare('UPDATE war_alliance_members SET started_at = ?3 WHERE season = ?1 AND player_id = ?2 AND started_at IS NULL').bind(WAR_SEASON.id, pid, now).run();
  if (!claim.meta.changes) throw started();
  const taken = new Set<string>();
  const men = classes.map((cls, k) => {
    const p = makePerson(newId(pid), cls);
    return { ...p, hero: { ...p.hero, name: nameFor(cls, taken, k) } };
  });
  try {
    await d.batch([
      ...men.map((p, slot) => insertPerson(d, pid, p, 'active', slot, now)),
      // the men came from the home pool (ensureStart filled it with START.pool)
      d.prepare("UPDATE war_pools SET stored = MAX(0, stored - ?2) WHERE player_id = ?1 AND town = 'home'").bind(pid, men.length),
    ]);
  } catch (e) {
    await d.prepare('UPDATE war_alliance_members SET started_at = NULL WHERE season = ?1 AND player_id = ?2').bind(WAR_SEASON.id, pid).run();
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

start.post('/squad', requirePlayable, async (c) => {
  const b = await readJson(c, z.object({ classes: z.array(z.string().regex(/^[a-z_]{1,24}$/)).max(32) }), MAX_BODY);
  const ids = await pickSquad(db(c.env), c.get('session').pid, b.classes, Date.now());
  return c.json({ ids, ...(await startView(c.env, c.get('session').pid)) });
});
