/**
 * Online mode HTTP API (/api/online/*): season and profile, fog-of-war map,
 * hex detail, marches, garrisons, income, recruiting and equipment. Attacks
 * live in attack.ts, clans in clans.ts. Every economy change happens here,
 * validated against server state; the client never sends amounts.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { readJson } from '../body';
import type { AppEnv } from '../env';
import { ApiError, badRequest } from '../errors';
import { requireAuth } from '../middleware';
import { itemDef, SLOTS, type Item, type Slot } from '../../../src/data/items';
import { FORMATION_TYPES, type FormationType } from '../../../src/sim/formation';
import { findHexPath, hexDistance, hexesWithin, hexId, inShard, MARCH_MINUTES, siteLabel, type Axial, type HexInfo } from '../../../src/online/hex';
import {
  hexIncome,
  ONLINE_RULES,
  RECRUIT_ARCHETYPES,
  recruitHero,
  RESOURCE_KEYS,
  type Resources,
} from '../../../src/online/rules';
import { heroPower } from '../../../src/sim/stats';
import { defenderFor, WINS_TO_CLAIM } from '../../../src/online/defenders';
import type { Archetype } from '../../../src/game/heroes';
import { attack, currentNeutrals, siegeWins } from './attack';
import { pendingIncome } from './income';
import { clans } from './clans';
import { consumableInventory, consumables } from './consumables';
import { market, resolveExpired } from './market';
import { pushArmyMove } from './live';
import { base, hexKey, limit, player, shardStub, type PlayerCtx } from './context';
import {
  armyState,
  clanTags,
  energyNow,
  ensureProfile,
  formationsOf,
  getProfile,
  heroPrefix,
  hexRow,
  hexRowsIn,
  loadGarrison,
  loadHeroes,
  loadItems,
  playerNames,
  randomU32,
  reserveIds,
  revBatch,
  revGuard,
  staticHex,
  type HexRow,
  type ProfileRow,
  type Shard,
} from './store';

export const online = new Hono<AppEnv>();
online.use('*', requireAuth);

const Formations = z.array(z.enum(FORMATION_TYPES as [string, ...string[]])).length(4);
const HeroId = z.string().min(1).max(80);
const coord = z.number().int().min(-200).max(200);

// ------------------------------------------------------------------ views

function resources(p: ProfileRow): Resources {
  return { gold: p.gold, food: p.food, wood: p.wood, bronze: p.bronze, recruits: Math.round(p.recruits * 100) / 100 };
}

async function profileView(c: PlayerCtx) {
  const { db: d, now, season, shard } = c;
  // Expired marketplace listings give their goods back before the stash is read.
  const p = (await resolveExpired(d, season.id, c.pid, now)) ? ((await getProfile(d, season.id, c.pid)) ?? c.profile) : c.profile;
  const [heroes, stash, income, clanInfo, inventory] = await Promise.all([
    loadHeroes(d, season.id, c.pid),
    loadItems(d, season.id, c.pid),
    pendingIncome(d, shard, c.pid, c.clan?.clanId ?? null, now),
    c.clan ? d.prepare('SELECT id, name, tag FROM clans WHERE id = ?1').bind(c.clan.clanId).first<{ id: number; name: string; tag: string }>() : null,
    consumableInventory(d, season.id, c.pid),
  ]);
  const army = armyState(p, now);
  return {
    season: { id: season.id, startedAt: season.startedAt, endsAt: season.endsAt },
    shard: { id: shard.id, radius: shard.radius },
    now,
    resources: resources(p),
    energy: Math.floor(energyNow(p, now) * 10) / 10,
    energyMax: ONLINE_RULES.energyMax,
    home: { q: p.home_q, r: p.home_r },
    army: { q: army.pos.q, r: army.pos.r, marching: army.marching, dest: army.dest, arriveAt: army.arriveAt, path: army.march?.path ?? null, at: army.march?.at ?? null },
    formations: formationsOf(p.formations),
    heroes: heroes.map((h) => ({ hero: h.hero, garrison: h.garrison, woundedUntil: h.woundedUntil, busy: h.busyUntil > now })),
    stash,
    consumables: inventory,
    clan: clanInfo && c.clan ? { ...clanInfo, role: c.clan.role } : null,
    battles: p.battles,
    wins: p.wins,
    income: { pending: income.total, hexes: income.hexes.length },
  };
}

interface HexView {
  q: number;
  r: number;
  type: HexInfo['type'];
  tier: number;
  fort: boolean;
  capital: boolean;
  coast: boolean;
  site: string;
  occupant: string;
  owner: number | null;
  clan: number | null;
  home: boolean;
  garrison?: number;
  /** Who holds a neutral hex (src/online/defenders.ts id): the map shows them as miniatures. */
  def?: string;
}

/**
 * Hexes the player may see: within ONLINE_RULES.sight of their own and their
 * clan's hexes and of their own and clan mates' armies. Nothing else is sent.
 */
export async function visibility(c: PlayerCtx): Promise<{ visible: Map<string, Axial>; armies: { pid: number; pos: Axial; dest: Axial | null; arriveAt: number | null; path: [number, number][] | null }[] }> {
  const { db: d, shard, now } = c;
  const clanId = c.clan?.clanId ?? null;
  const held = await d
    .prepare('SELECT q, r FROM online_hexes WHERE season_id = ?1 AND shard_id = ?2 AND (owner_id = ?3 OR (?4 IS NOT NULL AND clan_id = ?4))')
    .bind(shard.season, shard.id, c.pid, clanId)
    .all<{ q: number; r: number }>();
  const profs = await d
    .prepare(
      `SELECT p.player_id, p.army_q, p.army_r, p.march, m.clan_id FROM online_profiles p
       LEFT JOIN clan_members m ON m.season_id = p.season_id AND m.player_id = p.player_id
       WHERE p.season_id = ?1 AND p.shard_id = ?2`,
    )
    .bind(shard.season, shard.id)
    .all<{ player_id: number; army_q: number; army_r: number; march: string | null; clan_id: number | null }>();
  const armies = profs.results.map((p) => {
    const a = armyState(p, now);
    return { pid: p.player_id, clan: p.clan_id, pos: a.pos, dest: a.dest, arriveAt: a.arriveAt, path: a.march?.path ?? null };
  });
  const sources: Axial[] = [...held.results];
  for (const a of armies) if (a.pid === c.pid || (clanId !== null && a.clan === clanId)) sources.push(a.pos);
  const visible = new Map<string, Axial>();
  for (const s of sources) for (const h of hexesWithin(s, ONLINE_RULES.sight, shard.radius)) visible.set(hexId(h.q, h.r), h);
  return { visible, armies: armies.filter((a) => visible.has(hexId(a.pos.q, a.pos.r))).map(({ clan: _c, ...a }) => a) };
}

function hexView(shard: Shard, h: Axial, row: HexRow | undefined): HexView {
  const s = staticHex(shard, h);
  const occupant = row?.occupant ?? (s.passable ? 'npc' : 'none');
  const v: HexView = {
    q: h.q,
    r: h.r,
    type: s.type,
    tier: s.tier,
    fort: s.fort,
    capital: s.capital,
    coast: s.coast,
    site: siteLabel(s.site),
    occupant,
    owner: row?.owner_id ?? null,
    clan: row?.clan_id ?? null,
    home: row?.home === 1,
  };
  if (occupant === 'npc' && !row?.owner_id) v.def = defenderFor(shard.seed, s).id;
  return v;
}

// ------------------------------------------------------------------ season & profile

online.get('/status', async (c) => {
  const b = await base(c);
  const p = await getProfile(b.db, b.season.id, b.pid);
  return c.json({ season: b.season, joined: !!p, shard: p?.shard_id ?? null, now: b.now });
});

/** Joins the current season (idempotent): shard, home hex and starting army. */
online.post('/profile', async (c) => {
  limit(c, 'profile', 10);
  const b = await base(c);
  await ensureProfile(b.db, b.season, b.pid, b.now);
  return c.json(await profileView(await player(c)));
});

online.get('/profile', async (c) => c.json(await profileView(await player(c))));

online.get('/season', async (c) => {
  const b = await base(c);
  const rewards = await b.db
    .prepare('SELECT season_id AS season, rank, score, title, clan_name AS clan FROM season_rewards WHERE player_id = ?1 ORDER BY season_id DESC LIMIT 20')
    .bind(b.pid)
    .all();
  return c.json({ season: b.season, now: b.now, rewards: rewards.results });
});

// ------------------------------------------------------------------ map

online.get('/map', async (c) => {
  const pc = await player(c);
  const { visible, armies } = await visibility(pc);
  const all = [...visible.values()];
  const rows = all.length
    ? await hexRowsIn(pc.db, pc.shard, Math.min(...all.map((h) => h.q)), Math.max(...all.map((h) => h.q)), Math.min(...all.map((h) => h.r)), Math.max(...all.map((h) => h.r)))
    : [];
  const byId = new Map(rows.map((r) => [hexId(r.q, r.r), r]));
  const hexes = all.map((h) => hexView(pc.shard, h, byId.get(hexId(h.q, h.r))));
  // Garrison sizes of own and clan hexes only.
  const counts = await pc.db
    .prepare(
      `SELECT g.q, g.r, COUNT(*) AS n FROM online_garrisons g JOIN online_hexes x
         ON x.season_id = g.season_id AND x.shard_id = g.shard_id AND x.q = g.q AND x.r = g.r
       WHERE g.season_id = ?1 AND g.shard_id = ?2 AND (x.owner_id = ?3 OR (?4 IS NOT NULL AND x.clan_id = ?4)) GROUP BY g.q, g.r`,
    )
    .bind(pc.shard.season, pc.shard.id, pc.pid, pc.clan?.clanId ?? null)
    .all<{ q: number; r: number; n: number }>();
  const cnt = new Map(counts.results.map((x) => [hexId(x.q, x.r), x.n]));
  for (const h of hexes) {
    const n = cnt.get(hexId(h.q, h.r));
    if (n !== undefined) h.garrison = n;
  }
  const owners = hexes.map((h) => h.owner).filter((x): x is number => x !== null);
  const names = await playerNames(pc.db, [...owners, ...armies.map((a) => a.pid)]);
  const tags = await clanTags(pc.db, hexes.map((h) => h.clan).filter((x): x is number => x !== null));
  const army = armyState(pc.profile, pc.now);
  return c.json({
    season: { id: pc.season.id, endsAt: pc.season.endsAt },
    shard: { id: pc.shard.id, radius: pc.shard.radius },
    now: pc.now,
    you: { id: pc.pid, clan: pc.clan?.clanId ?? null, home: { q: pc.profile.home_q, r: pc.profile.home_r }, army: { q: army.pos.q, r: army.pos.r, marching: army.marching, dest: army.dest, arriveAt: army.arriveAt } },
    hexes,
    armies: armies.map((a) => ({ player: a.pid, q: a.pos.q, r: a.pos.r, dest: a.dest, arriveAt: a.arriveAt, path: a.pid === pc.pid ? a.path : null })),
    players: Object.fromEntries(names),
    clans: Object.fromEntries(tags),
  });
});

function parseHex(c: { req: { param: (k: string) => string } }, shard: Shard): Axial {
  const q = Number(c.req.param('q'));
  const r = Number(c.req.param('r'));
  if (!Number.isInteger(q) || !Number.isInteger(r) || !inShard({ q, r }, shard.radius)) throw badRequest('Bad hex');
  return { q, r };
}

online.get('/hex/:q/:r', async (c) => {
  const pc = await player(c);
  const h = parseHex(c, pc.shard);
  const { visible } = await visibility(pc);
  if (!visible.has(hexId(h.q, h.r))) throw new ApiError(404, 'fogged', 'That hex is hidden by the fog of war');
  const row = (await hexRow(pc.db, pc.shard, h)) ?? undefined;
  const view = hexView(pc.shard, h, row);
  const s = staticHex(pc.shard, h);
  const mine = row?.owner_id === pc.pid;
  const ours = mine || (pc.clan !== null && row?.clan_id === pc.clan.clanId);
  const army = armyState(pc.profile, pc.now);
  const locked = await shardStub(pc.env, pc.shard).hexLock(hexKey(h.q, h.r), pc.now);
  let garrison: unknown = null;
  let defenders: { count: number; power: number; kind: string } | null = null;
  let siege: { wins: number; needed: number; label: string } | null = null;
  if (row?.owner_id) {
    const g = await loadGarrison(pc.db, pc.shard, h);
    if (ours) garrison = g.map((x) => ({ hero: x.hero, playerId: x.playerId, woundedUntil: x.woundedUntil, busy: x.busyUntil > pc.now }));
    // Scouting: the size of a foreign garrison is visible from next door.
    if (!ours && hexDistance(army.pos, h) <= 1) defenders = { count: g.length, power: Math.round(g.reduce((a, x) => a + heroPower(x.hero), 0)), kind: g.length ? 'garrison' : 'militia' };
  } else if (s.passable) {
    const npc = currentNeutrals(pc.shard, s, row, pc.now);
    defenders = { count: npc.length, power: Math.round(npc.reduce((a, x) => a + heroPower(x), 0)), kind: 'npc' };
    siege = { wins: siegeWins(row, pc.pid, pc.now), needed: WINS_TO_CLAIM[s.tier] ?? 1, label: defenderFor(pc.shard.seed, s).label };
  }
  let income: Resources | null = null;
  if (mine) {
    const inc = await pendingIncome(pc.db, pc.shard, pc.pid, pc.clan?.clanId ?? null, pc.now);
    income = inc.hexes.find((x) => x.q === h.q && x.r === h.r)?.income ?? null;
  }
  const names = await playerNames(pc.db, row?.owner_id ? [row.owner_id] : []);
  const tags = await clanTags(pc.db, row?.clan_id ? [row.clan_id] : []);
  const adjacent = hexDistance(army.pos, h) === 1;
  return c.json({
    hex: view,
    ownerName: row?.owner_id ? names.get(row.owner_id) ?? null : null,
    clan: row?.clan_id ? { id: row.clan_id, ...tags.get(row.clan_id) } : null,
    yields: hexIncome(s),
    marchMinutes: MARCH_MINUTES[s.type],
    siege,
    mine,
    ours,
    locked: !!locked,
    garrison,
    formations: ours ? formationsOf(row?.formations ?? null) : null,
    defenders,
    income,
    canAttack: s.passable && !ours && !(row?.home === 1) && adjacent && !army.marching,
    canGarrison: ours && !army.marching && army.pos.q === h.q && army.pos.r === h.r,
  });
});

// ------------------------------------------------------------------ marches

const MarchBody = z.object({ q: coord, r: coord });

/** Marches the field army to a hex through land that is not held by a rival. Arrival is resolved lazily. */
online.post('/march', async (c) => {
  limit(c, 'march', 30);
  const pc = await player(c);
  const body = await readJson(c, MarchBody, 1024);
  const to = { q: body.q, r: body.r };
  if (!inShard(to, pc.shard.radius)) throw badRequest('Outside the map');
  const army = armyState(pc.profile, pc.now);
  const heroes = await loadHeroes(pc.db, pc.season.id, pc.pid);
  if (heroes.some((h) => !h.garrison && h.busyUntil > pc.now)) throw new ApiError(409, 'in_battle', 'Your army is in a battle');
  if (!heroes.some((h) => !h.garrison)) throw new ApiError(409, 'no_army', 'Your field army is empty');
  const clanId = pc.clan?.clanId ?? null;
  const all = [army.pos, to];
  const margin = ONLINE_RULES.maxMarch;
  const rows = await hexRowsIn(
    pc.db,
    pc.shard,
    Math.min(...all.map((x) => x.q)) - margin,
    Math.max(...all.map((x) => x.q)) + margin,
    Math.min(...all.map((x) => x.r)) - margin,
    Math.max(...all.map((x) => x.r)) + margin,
  );
  const rival = new Set(rows.filter((x) => x.owner_id !== null && x.owner_id !== pc.pid && (clanId === null || x.clan_id !== clanId)).map((x) => hexId(x.q, x.r)));
  const path = findHexPath(pc.shard.seed, army.pos, to, (h) => !rival.has(h.id), 8000, pc.shard.radius);
  if (!path) throw new ApiError(422, 'no_path', 'No way there (water, mountains or rival land in between)');
  if (path.length - 1 > ONLINE_RULES.maxMarch) throw new ApiError(422, 'too_far', `At most ${ONLINE_RULES.maxMarch} hexes per march`);
  const cost = (path.length - 1) * ONLINE_RULES.energyPerHex;
  const energy = energyNow(pc.profile, pc.now);
  if (energy < cost) throw new ApiError(409, 'no_energy', `Not enough energy (${Math.floor(energy)}/${cost})`);
  const at = [pc.now];
  for (let i = 1; i < path.length; i++) at.push(at[i - 1] + MARCH_MINUTES[staticHex(pc.shard, path[i]).type] * 60_000);
  const march = path.length > 1 ? JSON.stringify({ path: path.map((h) => [h.q, h.r]), at }) : null;
  await revBatch(pc.db, [
    pc.db
      .prepare(
        `UPDATE online_profiles SET army_q = ?3, army_r = ?4, march = ?5, energy = ?6, energy_at = ?7, rev = rev + 1, updated_at = ?7
         WHERE season_id = ?1 AND player_id = ?2 AND rev = ?8`,
      )
      .bind(pc.season.id, pc.pid, army.pos.q, army.pos.r, march, energy - cost, pc.now, pc.profile.rev),
  ]);
  await pushArmyMove(pc, path.length > 1 ? { kind: 'march', path, at } : { kind: 'pos', pos: army.pos });
  return c.json({ path: path.map((h) => [h.q, h.r]), at, energy: energy - cost, arriveAt: at[at.length - 1] });
});

/** Halts a march on the last hex reached. */
online.post('/march/stop', async (c) => {
  const pc = await player(c);
  const army = armyState(pc.profile, pc.now);
  await revBatch(pc.db, [
    pc.db
      .prepare('UPDATE online_profiles SET army_q = ?3, army_r = ?4, march = NULL, rev = rev + 1, updated_at = ?5 WHERE season_id = ?1 AND player_id = ?2 AND rev = ?6')
      .bind(pc.season.id, pc.pid, army.pos.q, army.pos.r, pc.now, pc.profile.rev),
  ]);
  if (army.marching) await pushArmyMove(pc, { kind: 'pos', pos: army.pos });
  return c.json({ q: army.pos.q, r: army.pos.r });
});

// ------------------------------------------------------------------ garrisons

const GarrisonBody = z.object({ heroIds: z.array(HeroId).max(ONLINE_RULES.maxGarrison), formations: Formations.optional() });

/**
 * Sets which of YOUR heroes hold a hex you or your clan own. The army must
 * stand on the hex. Only the owner (or clan leader/officers) changes formations.
 */
online.post('/hex/:q/:r/garrison', async (c) => {
  limit(c, 'garrison', 30);
  const pc = await player(c);
  const h = parseHex(c, pc.shard);
  const body = await readJson(c, GarrisonBody, 8 * 1024);
  const row = await hexRow(pc.db, pc.shard, h);
  const mine = row?.owner_id === pc.pid;
  const ours = mine || (!!row && pc.clan !== null && row.clan_id === pc.clan.clanId);
  if (!row || !ours) throw new ApiError(403, 'forbidden', 'You can only garrison your own or your clan’s hexes');
  const army = armyState(pc.profile, pc.now);
  if (army.marching || army.pos.q !== h.q || army.pos.r !== h.r) throw new ApiError(409, 'not_here', 'Your army must stand on the hex');
  if (body.formations && !(mine || pc.clan?.role === 'leader' || pc.clan?.role === 'officer')) throw new ApiError(403, 'forbidden', 'Only the owner or clan officers set the garrison formation');
  if (await shardStub(pc.env, pc.shard).hexLock(hexKey(h.q, h.r), pc.now)) throw new ApiError(409, 'under_attack', 'The hex is under attack right now');
  const heroes = await loadHeroes(pc.db, pc.season.id, pc.pid);
  const byId = new Map(heroes.map((x) => [x.hero.id, x]));
  const want = [...new Set(body.heroIds)];
  for (const id of want) {
    const x = byId.get(id);
    if (!x) throw new ApiError(404, 'not_found', `No hero ${id}`);
    if (x.busyUntil > pc.now) throw new ApiError(409, 'busy', `${x.hero.name} is in a battle`);
    if (x.garrison && (x.garrison.q !== h.q || x.garrison.r !== h.r)) throw new ApiError(409, 'elsewhere', `${x.hero.name} holds another hex`);
  }
  const others = (await loadGarrison(pc.db, pc.shard, h)).filter((x) => x.playerId !== pc.pid).length;
  if (others + want.length > ONLINE_RULES.maxGarrison) throw new ApiError(409, 'garrison_full', `At most ${ONLINE_RULES.maxGarrison} heroes per hex`);
  const newRev = pc.profile.rev + 1;
  const g = revGuard(pc.season.id, pc.pid, newRev);
  const here = heroes.filter((x) => x.garrison && x.garrison.q === h.q && x.garrison.r === h.r).map((x) => x.hero.id);
  const stmts = [
    pc.db.prepare('UPDATE online_profiles SET rev = rev + 1, updated_at = ?3 WHERE season_id = ?1 AND player_id = ?2 AND rev = ?4').bind(pc.season.id, pc.pid, pc.now, pc.profile.rev),
    ...here
      .filter((id) => !want.includes(id))
      .map((id) => pc.db.prepare(`DELETE FROM online_garrisons WHERE hero_id = ?1 AND ${g}`).bind(id)),
    ...want
      .filter((id) => !here.includes(id))
      .map((id) =>
        pc.db
          .prepare(`INSERT INTO online_garrisons (hero_id, season_id, shard_id, q, r, player_id, placed_at) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7 WHERE ${g}`)
          .bind(id, pc.season.id, pc.shard.id, h.q, h.r, pc.pid, pc.now),
      ),
  ];
  if (body.formations) {
    stmts.push(pc.db.prepare(`UPDATE online_hexes SET formations = ?5 WHERE season_id = ?1 AND shard_id = ?2 AND q = ?3 AND r = ?4 AND ${g}`).bind(pc.season.id, pc.shard.id, h.q, h.r, JSON.stringify(body.formations)));
  }
  await revBatch(pc.db, stmts);
  const after = await loadGarrison(pc.db, pc.shard, h);
  return c.json({ garrison: after.map((x) => ({ hero: x.hero, playerId: x.playerId })) });
});

// ------------------------------------------------------------------ income

/** Collects the income of every hex the player holds (computed from server time). */
online.post('/collect', async (c) => {
  limit(c, 'collect', 20);
  const pc = await player(c);
  const inc = await pendingIncome(pc.db, pc.shard, pc.pid, pc.clan?.clanId ?? null, pc.now);
  const t = inc.total;
  const g = revGuard(pc.season.id, pc.pid, pc.profile.rev + 1);
  await revBatch(pc.db, [
    pc.db
      .prepare(
        `UPDATE online_profiles SET gold = gold + ?3, food = food + ?4, wood = wood + ?5, bronze = bronze + ?6, recruits = recruits + ?7,
           rev = rev + 1, updated_at = ?8 WHERE season_id = ?1 AND player_id = ?2 AND rev = ?9`,
      )
      .bind(pc.season.id, pc.pid, t.gold, t.food, t.wood, t.bronze, t.recruits, pc.now, pc.profile.rev),
    pc.db
      .prepare(`UPDATE online_hexes SET accrued_at = ?4 WHERE season_id = ?1 AND shard_id = ?2 AND owner_id = ?3 AND ${g}`)
      .bind(pc.season.id, pc.shard.id, pc.pid, pc.now),
  ]);
  const after = (await getProfile(pc.db, pc.season.id, pc.pid))!;
  return c.json({ collected: t, hexes: inc.hexes.length, resources: resources(after) });
});

// ------------------------------------------------------------------ recruiting & equipment

const RecruitBody = z.object({ archetype: z.enum(RECRUIT_ARCHETYPES as [Archetype, ...Archetype[]]) });

online.post('/recruit', async (c) => {
  limit(c, 'recruit', 30);
  const pc = await player(c);
  const body = await readJson(c, RecruitBody, 1024);
  const cost = ONLINE_RULES.recruitCost;
  const p = pc.profile;
  for (const k of RESOURCE_KEYS) if (p[k] < cost[k]) throw new ApiError(409, 'cannot_afford', `Not enough ${k}`);
  const heroes = await loadHeroes(pc.db, pc.season.id, pc.pid);
  if (heroes.length >= ONLINE_RULES.maxArmy) throw new ApiError(409, 'army_full', `At most ${ONLINE_RULES.maxArmy} heroes`);
  const start = await reserveIds(pc.db, pc.season.id, pc.pid, 40);
  const ids = { nextId: start };
  const hero = recruitHero(randomU32(), ids, heroPrefix(pc.season.id, pc.pid), body.archetype, heroes.map((x) => x.hero));
  const fresh = (await getProfile(pc.db, pc.season.id, pc.pid))!;
  const g = revGuard(pc.season.id, pc.pid, fresh.rev + 1);
  await revBatch(pc.db, [
    pc.db
      .prepare(
        `UPDATE online_profiles SET gold = gold - ?3, food = food - ?4, recruits = recruits - ?5, rev = rev + 1, updated_at = ?6
         WHERE season_id = ?1 AND player_id = ?2 AND rev = ?7 AND gold >= ?3 AND food >= ?4 AND recruits >= ?5`,
      )
      .bind(pc.season.id, pc.pid, cost.gold, cost.food, cost.recruits, pc.now, fresh.rev),
    pc.db
      .prepare(`INSERT INTO online_heroes (id, season_id, player_id, data, created_at, updated_at) SELECT ?1, ?2, ?3, ?4, ?5, ?5 WHERE ${g}`)
      .bind(hero.id, pc.season.id, pc.pid, JSON.stringify(hero), pc.now),
  ]);
  return c.json({ hero });
});

const EquipBody = z.object({ heroId: HeroId, slot: z.enum(SLOTS as [Slot, ...Slot[]]), itemUid: z.string().max(80).nullable() });

/** Moves an item between the stash and a hero (two-handed weapons and shields exclude each other). */
online.post('/equip', async (c) => {
  limit(c, 'equip', 120);
  const pc = await player(c);
  const body = await readJson(c, EquipBody, 1024);
  const heroes = await loadHeroes(pc.db, pc.season.id, pc.pid);
  const owned = heroes.find((x) => x.hero.id === body.heroId);
  if (!owned) throw new ApiError(404, 'not_found', 'No such hero');
  if (owned.busyUntil > pc.now) throw new ApiError(409, 'busy', 'That hero is in a battle');
  const hero = owned.hero;
  const stash = await loadItems(pc.db, pc.season.id, pc.pid);
  const toStash: Item[] = [];
  let taken: Item | null = null;
  if (body.itemUid) {
    taken = stash.find((i) => i.uid === body.itemUid) ?? null;
    if (!taken) throw new ApiError(404, 'not_found', 'No such item in your stash');
    const def = itemDef(taken.def);
    if (def.slot !== body.slot) throw badRequest(`${def.name} does not go in the ${body.slot} slot`);
    const prev = hero.equip[body.slot];
    if (prev) toStash.push(prev);
    hero.equip[body.slot] = taken;
    if (body.slot === 'weapon' && def.twoHanded && hero.equip.shield) {
      toStash.push(hero.equip.shield);
      delete hero.equip.shield;
    }
    if (body.slot === 'shield' && hero.equip.weapon && itemDef(hero.equip.weapon.def).twoHanded) {
      toStash.push(hero.equip.weapon);
      delete hero.equip.weapon;
    }
  } else {
    const prev = hero.equip[body.slot];
    if (!prev) return c.json({ hero, stash });
    toStash.push(prev);
    delete hero.equip[body.slot];
  }
  const g = revGuard(pc.season.id, pc.pid, pc.profile.rev + 1);
  await revBatch(pc.db, [
    pc.db.prepare('UPDATE online_profiles SET rev = rev + 1, updated_at = ?3 WHERE season_id = ?1 AND player_id = ?2 AND rev = ?4').bind(pc.season.id, pc.pid, pc.now, pc.profile.rev),
    pc.db.prepare(`UPDATE online_heroes SET data = ?2, updated_at = ?3 WHERE id = ?1 AND busy_until <= ?3 AND ${g}`).bind(hero.id, JSON.stringify(hero), pc.now),
    ...(taken ? [pc.db.prepare(`DELETE FROM online_items WHERE uid = ?1 AND player_id = ?2 AND ${g}`).bind(taken.uid, pc.pid)] : []),
    ...toStash.map((it) =>
      pc.db
        .prepare(`INSERT INTO online_items (uid, season_id, player_id, data, created_at) SELECT ?1, ?2, ?3, ?4, ?5 WHERE ${g}`)
        .bind(it.uid, pc.season.id, pc.pid, JSON.stringify(it), pc.now),
    ),
  ]);
  return c.json({ hero, stash: await loadItems(pc.db, pc.season.id, pc.pid) });
});

const ArmyBody = z.object({ groups: z.record(HeroId, z.number().int().min(0).max(3)).optional(), formations: Formations.optional() });

/** Battle groups of heroes and the field army's formations. */
online.post('/army', async (c) => {
  limit(c, 'army', 60);
  const pc = await player(c);
  const body = await readJson(c, ArmyBody, 16 * 1024);
  const heroes = await loadHeroes(pc.db, pc.season.id, pc.pid);
  const g = revGuard(pc.season.id, pc.pid, pc.profile.rev + 1);
  const stmts = [
    pc.db
      .prepare('UPDATE online_profiles SET formations = ?3, rev = rev + 1, updated_at = ?4 WHERE season_id = ?1 AND player_id = ?2 AND rev = ?5')
      .bind(pc.season.id, pc.pid, JSON.stringify((body.formations as FormationType[] | undefined) ?? formationsOf(pc.profile.formations)), pc.now, pc.profile.rev),
  ];
  for (const [id, group] of Object.entries(body.groups ?? {})) {
    const x = heroes.find((h) => h.hero.id === id);
    if (!x) throw new ApiError(404, 'not_found', `No hero ${id}`);
    if (x.busyUntil > pc.now || x.hero.group === group) continue;
    x.hero.group = group;
    stmts.push(pc.db.prepare(`UPDATE online_heroes SET data = ?2, updated_at = ?3 WHERE id = ?1 AND busy_until <= ?3 AND ${g}`).bind(id, JSON.stringify(x.hero), pc.now));
  }
  await revBatch(pc.db, stmts);
  return c.json({ ok: true });
});

online.route('/attack', attack);
online.route('/clans', clans);
online.route('/consumables', consumables);
online.route('/market', market);

