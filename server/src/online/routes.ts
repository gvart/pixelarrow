/**
 * Online mode HTTP API (/api/online/*): season and profile, fog-of-war map,
 * region detail, marches, garrisons, income, recruiting and equipment.
 * Locations are region ids (`loc`) of the shard's map (src/online/world.ts). Attacks
 * live in attack.ts, clans in clans.ts. Every economy change happens here,
 * validated against server state; the client never sends amounts.
 */
import { emit } from '../telemetry/analytics';
import { Hono } from 'hono';
import { z } from 'zod';
import { readJson } from '../body';
import type { AppEnv } from '../env';
import { ApiError, badRequest } from '../errors';
import { requireAuth } from '../middleware';
import { itemDef, SLOTS, type Item, type Slot } from '../../../src/data/items';
import { FORMATION_TYPES, type FormationType } from '../../../src/sim/formation';
import { siteName } from '../../../src/world/battlefield';
import type { RegionKind } from '../../../src/online/mapSchema';
import {
  regionIncome,
  ONLINE_RULES,
  PALISADE,
  RECRUIT_ARCHETYPES,
  recruitHero,
  RESOURCE_KEYS,
  type Resources,
} from '../../../src/online/rules';
import { heroPower } from '../../../src/sim/stats';
import { defenderFor, WINS_TO_CLAIM } from '../../../src/online/defenders';
import type { Archetype } from '../../../src/game/heroes';
import { attack, currentNeutrals, lairBeast, siegeWins } from './attack';
import { BEAST_RULES, bossAt, lairAt } from '../../../src/online/lairs';
import { sightSet } from '../../../src/online/liveArmies';
import { ENCOUNTERS, MYTHS } from '../../../src/data/beasts';
import { bosses } from './bosses';
import { pendingIncome } from './income';
import { clans } from './clans';
import { campAt, campMarkers, camps, shardTowers, towerVision } from './camps';
import { campView, garrisonCap } from '../../../src/online/camps';
import { consumableInventory, consumables } from './consumables';
import { market, resolveExpired } from './market';
import { merchant } from './merchant';
import { merchantAt, tradingPostAt, type PostKind } from '../../../src/online/merchants';
import { pushArmyMove } from './live';
import { base, limit, player, regionKey, shardStub, type PlayerCtx } from './context';
import {
  armyState,
  clanTags,
  energyNow,
  ensureProfile,
  formationsOf,
  getProfile,
  heroPrefix,
  loadGarrison,
  loadHeroes,
  loadItems,
  playerNames,
  randomU32,
  regionRow,
  regionRows,
  reserveIds,
  revBatch,
  revGuard,
  staticRegion,
  type ProfileRow,
  type RegionRow,
  type Shard,
} from './store';

export const online = new Hono<AppEnv>();
online.use('*', requireAuth);

const Formations = z.array(z.enum(FORMATION_TYPES as [string, ...string[]])).length(4);
const HeroId = z.string().min(1).max(80);
const Loc = z.number().int().min(1).max(1_000_000);

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
    shard: { id: shard.id, map: shard.mapId },
    now,
    resources: resources(p),
    energy: Math.floor(energyNow(p, now) * 10) / 10,
    energyMax: ONLINE_RULES.energyMax,
    home: p.home_loc,
    army: { loc: army.pos, marching: army.marching, dest: army.dest, arriveAt: army.arriveAt, path: army.march?.path ?? null, at: army.march?.at ?? null },
    formations: formationsOf(p.formations),
    heroes: heroes.map((h) => ({ hero: h.hero, garrison: h.garrison, woundedUntil: h.woundedUntil, busy: h.busyUntil > now, reserve: h.reserve })),
    stash,
    consumables: inventory,
    clan: clanInfo && c.clan ? { ...clanInfo, role: c.clan.role } : null,
    battles: p.battles,
    wins: p.wins,
    income: { pending: income.total, regions: income.regions.length },
  };
}

interface RegionView {
  loc: number;
  kind: RegionKind;
  tier: number;
  coast: boolean;
  site: string;
  occupant: string;
  owner: number | null;
  clan: number | null;
  home: boolean;
  garrison?: number;
  /** Who holds a neutral region (src/online/defenders.ts id): the map shows them as miniatures. */
  def?: string;
  /** A mythical beast's lair (src/online/lairs.ts): which beast and its level. */
  lair?: string;
  lairLevel?: number;
  /** A world boss stands here. */
  boss?: string;
  /** A trading post (src/online/merchants.ts): a merchant with rarer stock. */
  post?: PostKind;
}

/**
 * Regions the player may see: within ONLINE_RULES.sight routes of their own
 * and their clan's regions and of their own and clan mates' armies, plus
 * what the watchtowers of their and their clan's camps see. Nothing else is sent.
 */
export async function visibility(c: PlayerCtx): Promise<{ visible: Set<number>; armies: { pid: number; pos: number; dest: number | null; arriveAt: number | null; path: number[] | null }[] }> {
  const { db: d, shard, now } = c;
  const clanId = c.clan?.clanId ?? null;
  const held = await d
    .prepare('SELECT loc FROM online_regions WHERE season_id = ?1 AND shard_id = ?2 AND (owner_id = ?3 OR (?4 IS NOT NULL AND clan_id = ?4))')
    .bind(shard.season, shard.id, c.pid, clanId)
    .all<{ loc: number }>();
  const profs = await d
    .prepare(
      `SELECT p.player_id, p.army_loc, p.march, m.clan_id FROM online_profiles p
       LEFT JOIN clan_members m ON m.season_id = p.season_id AND m.player_id = p.player_id
       WHERE p.season_id = ?1 AND p.shard_id = ?2`,
    )
    .bind(shard.season, shard.id)
    .all<{ player_id: number; army_loc: number; march: string | null; clan_id: number | null }>();
  const armies = profs.results.map((p) => {
    const a = armyState(p, now);
    return { pid: p.player_id, clan: p.clan_id, pos: a.pos, dest: a.dest, arriveAt: a.arriveAt, path: a.march?.path ?? null };
  });
  const sources: number[] = held.results.map((x) => x.loc);
  for (const a of armies) if (a.pid === c.pid || (clanId !== null && a.clan === clanId)) sources.push(a.pos);
  const visible = sightSet(shard.world, sources, ONLINE_RULES.sight);
  // watchtowers of your and your clan's camps see further
  const towers = (await shardTowers(d, shard, now)).filter((t) => t.pid === c.pid || (clanId !== null && t.clan === clanId));
  for (const r of towerVision(shard.world, towers)) visible.add(r);
  return { visible, armies: armies.filter((a) => visible.has(a.pos)).map(({ clan: _c, ...a }) => a) };
}

function regionView(shard: Shard, loc: number, row: RegionRow | undefined, now = Date.now()): RegionView {
  const s = staticRegion(shard, loc);
  const boss = bossAt(shard.world, shard.seed, loc);
  const lair = !row?.owner_id ? lairBeast(shard, loc, row, now) : null;
  const occupant = boss || lair ? 'beast' : row?.occupant ?? (s.passable ? 'npc' : 'none');
  const v: RegionView = {
    loc,
    kind: s.kind,
    tier: s.tier,
    coast: s.coast,
    site: siteName(s.site),
    occupant,
    owner: row?.owner_id ?? null,
    clan: row?.clan_id ?? null,
    home: row?.home === 1,
  };
  if (occupant === 'npc' && !row?.owner_id) v.def = defenderFor(shard.seed, s).id;
  if (lair) {
    v.lair = lair.enc;
    v.lairLevel = lair.level;
  }
  if (boss) v.boss = boss.boss;
  const post = tradingPostAt(shard.world, loc);
  if (post) v.post = post;
  return v;
}

// ------------------------------------------------------------------ season & profile

online.get('/status', async (c) => {
  const b = await base(c);
  const p = await getProfile(b.db, b.season.id, b.pid);
  return c.json({ season: b.season, joined: !!p, shard: p?.shard_id ?? null, now: b.now });
});

/** Joins the current season (idempotent): shard, home region and starting army. */
online.post('/profile', async (c) => {
  limit(c, 'profile', 10);
  const b = await base(c);
  const had = await getProfile(b.db, b.season.id, b.pid);
  const prof = had ?? (await ensureProfile(b.db, b.season, b.pid, b.now, undefined, b.env.ONLINE_MAP));
  if (!had) emit(c, 'online_join', { shard: prof.shard_id, season: b.season.id });
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
  const rows = await regionRows(pc.db, pc.shard, visible);
  const byLoc = new Map(rows.map((r) => [r.loc, r]));
  const regions = [...visible].sort((a, b) => a - b).map((loc) => regionView(pc.shard, loc, byLoc.get(loc), pc.now));
  // Garrison sizes of own and clan regions only.
  const counts = await pc.db
    .prepare(
      `SELECT g.loc, COUNT(*) AS n FROM online_garrisons g JOIN online_regions x
         ON x.season_id = g.season_id AND x.shard_id = g.shard_id AND x.loc = g.loc
       WHERE g.season_id = ?1 AND g.shard_id = ?2 AND (x.owner_id = ?3 OR (?4 IS NOT NULL AND x.clan_id = ?4)) GROUP BY g.loc`,
    )
    .bind(pc.shard.season, pc.shard.id, pc.pid, pc.clan?.clanId ?? null)
    .all<{ loc: number; n: number }>();
  const cnt = new Map(counts.results.map((x) => [x.loc, x.n]));
  for (const r of regions) {
    const n = cnt.get(r.loc);
    if (n !== undefined) r.garrison = n;
  }
  const owners = regions.map((r) => r.owner).filter((x): x is number => x !== null);
  const names = await playerNames(pc.db, [...owners, ...armies.map((a) => a.pid)]);
  const tags = await clanTags(pc.db, regions.map((r) => r.clan).filter((x): x is number => x !== null));
  const army = armyState(pc.profile, pc.now);
  const campList = await campMarkers(pc.db, pc.shard, visible, pc.now);
  return c.json({
    season: { id: pc.season.id, endsAt: pc.season.endsAt },
    shard: { id: pc.shard.id, map: pc.shard.mapId },
    now: pc.now,
    you: { id: pc.pid, clan: pc.clan?.clanId ?? null, home: pc.profile.home_loc, army: { loc: army.pos, marching: army.marching, dest: army.dest, arriveAt: army.arriveAt } },
    regions,
    armies: armies.map((a) => ({ player: a.pid, loc: a.pos, dest: a.dest, arriveAt: a.arriveAt, path: a.pid === pc.pid ? a.path : null })),
    /** Camps in sight (src/online/camps.ts CampMarker). */
    camps: campList,
    players: Object.fromEntries(names),
    clans: Object.fromEntries(tags),
  });
});

/** The :loc route parameter: a region of the shard's map (400 otherwise). */
export function parseLoc(c: { req: { param: (k: string) => string } }, shard: Shard): number {
  const raw = c.req.param('loc');
  const loc = /^\d{1,7}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(loc) || !shard.world.has(loc)) throw badRequest('No such region');
  return loc;
}

online.get('/region/:loc', async (c) => {
  const pc = await player(c);
  const h = parseLoc(c, pc.shard);
  const { visible } = await visibility(pc);
  if (!visible.has(h)) throw new ApiError(404, 'fogged', 'That region is hidden by the fog of war');
  const row = (await regionRow(pc.db, pc.shard, h)) ?? undefined;
  const view = regionView(pc.shard, h, row, pc.now);
  const s = staticRegion(pc.shard, h);
  const w = pc.shard.world;
  const mine = row?.owner_id === pc.pid;
  const ours = mine || (pc.clan !== null && row?.clan_id === pc.clan.clanId);
  const army = armyState(pc.profile, pc.now);
  const adjacent = w.adjacent(army.pos, h);
  const locked = await shardStub(pc.env, pc.shard).regionLock(regionKey(h), pc.now);
  let garrison: unknown = null;
  let defenders: { count: number; power: number; kind: string } | null = null;
  let siege: { wins: number; needed: number; label: string } | null = null;
  if (row?.owner_id) {
    const g = await loadGarrison(pc.db, pc.shard, h);
    if (ours) garrison = g.map((x) => ({ hero: x.hero, playerId: x.playerId, woundedUntil: x.woundedUntil, busy: x.busyUntil > pc.now }));
    // Scouting: the size of a foreign garrison is visible from next door.
    if (!ours && (army.pos === h || adjacent)) defenders = { count: g.length, power: Math.round(g.reduce((a, x) => a + heroPower(x.hero), 0)), kind: g.length ? 'garrison' : 'militia' };
  } else if (s.passable) {
    const npc = currentNeutrals(pc.shard, h, row, pc.now);
    defenders = { count: npc.length, power: Math.round(npc.reduce((a, x) => a + heroPower(x), 0)), kind: 'npc' };
    const lair = lairBeast(pc.shard, h, row, pc.now);
    if (lair) {
      defenders.kind = 'beast';
      siege = { wins: 0, needed: 1, label: MYTHS[ENCOUNTERS[lair.enc].body].name };
    } else siege = { wins: siegeWins(row, pc.pid, pc.now), needed: WINS_TO_CLAIM[s.tier] ?? 1, label: defenderFor(pc.shard.seed, s).label };
  }
  const boss = bossAt(w, pc.shard.seed, h);
  const slain = row?.beast_slain_at ?? null;
  const lairInfo = lairAt(w, pc.shard.seed, h);
  let income: Resources | null = null;
  if (mine) {
    const inc = await pendingIncome(pc.db, pc.shard, pc.pid, pc.clan?.clanId ?? null, pc.now);
    income = inc.regions.find((x) => x.loc === h)?.income ?? null;
  }
  const names = await playerNames(pc.db, row?.owner_id ? [row.owner_id] : []);
  const tags = await clanTags(pc.db, row?.clan_id ? [row.clan_id] : []);
  const campRow = await campAt(pc.db, pc.shard, h);
  return c.json({
    region: view,
    ownerName: row?.owner_id ? names.get(row.owner_id) ?? null : null,
    clan: row?.clan_id ? { id: row.clan_id, ...tags.get(row.clan_id) } : null,
    yields: regionIncome(s),
    /** Minutes of the route from the army (0 when not next door). */
    marchMinutes: adjacent ? w.minutes(army.pos, h) : 0,
    siege,
    mine,
    ours,
    locked: !!locked,
    garrison,
    formations: ours ? formationsOf(row?.formations ?? null) : null,
    defenders,
    income,
    canAttack: s.passable && !ours && !(row?.home === 1) && adjacent && !army.marching && !boss,
    /** A lair: its beast, level, and when it returns if slain. World boss regions: raid them (GET /boss). */
    lair: lairInfo ? { enc: lairInfo.enc, level: lairInfo.level, tier: lairInfo.tier, home: !!lairBeast(pc.shard, h, row, pc.now), returnsAt: slain !== null && pc.now - slain < BEAST_RULES.respawnMs ? slain + BEAST_RULES.respawnMs : null } : null,
    boss: boss ? boss.boss : null,
    canGarrison: ours && !army.marching && army.pos === h,
    /** A town or a trading post: its merchant (GET /merchant/:loc). */
    merchant: merchantAt(w, h),
    /** A camp plot (forward camps may be made here). */
    campPlot: s.campPlot,
    /** The camp here: whose, and (yours) its buildings (src/online/camps.ts CampView). */
    camp: campRow ? { owner: campRow.player_id, home: campRow.home === 1, view: campRow.player_id === pc.pid ? campView({ loc: h, home: campRow.home === 1, restedAt: campRow.rested_at, buildings: campRow.buildings }, pc.now) : null } : null,
  });
});

// ------------------------------------------------------------------ marches

const MarchBody = z.object({ loc: Loc });

/** Marches the field army to a region along routes that do not cross a rival's land. Arrival is resolved lazily. */
online.post('/march', async (c) => {
  limit(c, 'march', 30);
  const pc = await player(c);
  const body = await readJson(c, MarchBody, 1024);
  const to = body.loc;
  const w = pc.shard.world;
  if (!w.has(to)) throw badRequest('No such region');
  const army = armyState(pc.profile, pc.now);
  const heroes = await loadHeroes(pc.db, pc.season.id, pc.pid);
  if (heroes.some((h) => !h.garrison && h.busyUntil > pc.now)) throw new ApiError(409, 'in_battle', 'Your army is in a battle');
  if (!heroes.some((h) => !h.garrison)) throw new ApiError(409, 'no_army', 'Your field army is empty');
  const clanId = pc.clan?.clanId ?? null;
  const held = await pc.db
    .prepare('SELECT loc FROM online_regions WHERE season_id = ?1 AND shard_id = ?2 AND owner_id IS NOT NULL AND owner_id != ?3 AND (?4 IS NULL OR clan_id IS NULL OR clan_id != ?4)')
    .bind(pc.shard.season, pc.shard.id, pc.pid, clanId)
    .all<{ loc: number }>();
  const rival = new Set(held.results.map((x) => x.loc));
  const route = w.path(army.pos, to, (r) => !rival.has(r.id));
  if (!route) throw new ApiError(422, 'no_path', 'No way there (the sea or rival land in between)');
  const path = route.path;
  if (path.length - 1 > ONLINE_RULES.maxMarch) throw new ApiError(422, 'too_far', `At most ${ONLINE_RULES.maxMarch} routes per march`);
  const cost = (path.length - 1) * ONLINE_RULES.energyPerStep;
  const energy = energyNow(pc.profile, pc.now);
  if (energy < cost) throw new ApiError(409, 'no_energy', `Not enough energy (${Math.floor(energy)}/${cost})`);
  const at = [pc.now];
  for (let i = 1; i < path.length; i++) at.push(at[i - 1] + w.minutes(path[i - 1], path[i]) * 60_000);
  const march = path.length > 1 ? JSON.stringify({ path, at }) : null;
  await revBatch(pc.db, [
    pc.db
      .prepare(
        `UPDATE online_profiles SET army_loc = ?3, march = ?4, energy = ?5, energy_at = ?6, rev = rev + 1, updated_at = ?6
         WHERE season_id = ?1 AND player_id = ?2 AND rev = ?7`,
      )
      .bind(pc.season.id, pc.pid, army.pos, march, energy - cost, pc.now, pc.profile.rev),
  ]);
  await pushArmyMove(pc, path.length > 1 ? { kind: 'march', path, at } : { kind: 'pos', pos: army.pos });
  return c.json({ path, at, energy: energy - cost, arriveAt: at[at.length - 1] });
});

/** Halts a march in the last region reached. */
online.post('/march/stop', async (c) => {
  const pc = await player(c);
  const army = armyState(pc.profile, pc.now);
  await revBatch(pc.db, [
    pc.db
      .prepare('UPDATE online_profiles SET army_loc = ?3, march = NULL, rev = rev + 1, updated_at = ?4 WHERE season_id = ?1 AND player_id = ?2 AND rev = ?5')
      .bind(pc.season.id, pc.pid, army.pos, pc.now, pc.profile.rev),
  ]);
  if (army.marching) await pushArmyMove(pc, { kind: 'pos', pos: army.pos });
  return c.json({ loc: army.pos });
});

// ------------------------------------------------------------------ garrisons

const GarrisonBody = z.object({ heroIds: z.array(HeroId).max(ONLINE_RULES.maxGarrison + PALISADE.garrison[3]), formations: Formations.optional() });

/**
 * Sets which of YOUR heroes hold a region you or your clan own. The army must
 * stand in it. Only the owner (or clan leader/officers) changes formations.
 */
online.post('/region/:loc/garrison', async (c) => {
  limit(c, 'garrison', 30);
  const pc = await player(c);
  const h = parseLoc(c, pc.shard);
  const body = await readJson(c, GarrisonBody, 8 * 1024);
  const row = await regionRow(pc.db, pc.shard, h);
  const mine = row?.owner_id === pc.pid;
  const ours = mine || (!!row && pc.clan !== null && row.clan_id === pc.clan.clanId);
  if (!row || !ours) throw new ApiError(403, 'forbidden', 'You can only garrison your own or your clan’s regions');
  const army = armyState(pc.profile, pc.now);
  if (army.marching || army.pos !== h) throw new ApiError(409, 'not_here', 'Your army must stand in the region');
  if (body.formations && !(mine || pc.clan?.role === 'leader' || pc.clan?.role === 'officer')) throw new ApiError(403, 'forbidden', 'Only the owner or clan officers set the garrison formation');
  if (await shardStub(pc.env, pc.shard).regionLock(regionKey(h), pc.now)) throw new ApiError(409, 'under_attack', 'The region is under attack right now');
  const heroes = await loadHeroes(pc.db, pc.season.id, pc.pid);
  const byId = new Map(heroes.map((x) => [x.hero.id, x]));
  const want = [...new Set(body.heroIds)];
  for (const id of want) {
    const x = byId.get(id);
    if (!x) throw new ApiError(404, 'not_found', `No hero ${id}`);
    if (x.busyUntil > pc.now) throw new ApiError(409, 'busy', `${x.hero.name} is in a battle`);
    if (x.garrison !== null && x.garrison !== h) throw new ApiError(409, 'elsewhere', `${x.hero.name} holds another region`);
  }
  const others = (await loadGarrison(pc.db, pc.shard, h)).filter((x) => x.playerId !== pc.pid).length;
  // a camp's palisade makes room for more
  const camp = await campAt(pc.db, pc.shard, h);
  const cap = camp ? garrisonCap(camp.buildings, pc.now) : ONLINE_RULES.maxGarrison;
  if (others + want.length > cap) throw new ApiError(409, 'garrison_full', `At most ${cap} heroes in this region`);
  const newRev = pc.profile.rev + 1;
  const g = revGuard(pc.season.id, pc.pid, newRev);
  const here = heroes.filter((x) => x.garrison === h).map((x) => x.hero.id);
  const stmts = [
    pc.db.prepare('UPDATE online_profiles SET rev = rev + 1, updated_at = ?3 WHERE season_id = ?1 AND player_id = ?2 AND rev = ?4').bind(pc.season.id, pc.pid, pc.now, pc.profile.rev),
    ...here
      .filter((id) => !want.includes(id))
      .map((id) => pc.db.prepare(`DELETE FROM online_garrisons WHERE hero_id = ?1 AND ${g}`).bind(id)),
    ...want
      .filter((id) => !here.includes(id))
      .map((id) =>
        pc.db
          .prepare(`INSERT INTO online_garrisons (hero_id, season_id, shard_id, loc, player_id, placed_at) SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE ${g}`)
          .bind(id, pc.season.id, pc.shard.id, h, pc.pid, pc.now),
      ),
  ];
  if (body.formations) {
    stmts.push(pc.db.prepare(`UPDATE online_regions SET formations = ?4 WHERE season_id = ?1 AND shard_id = ?2 AND loc = ?3 AND ${g}`).bind(pc.season.id, pc.shard.id, h, JSON.stringify(body.formations)));
  }
  await revBatch(pc.db, stmts);
  const after = await loadGarrison(pc.db, pc.shard, h);
  return c.json({ garrison: after.map((x) => ({ hero: x.hero, playerId: x.playerId })) });
});

// ------------------------------------------------------------------ income

/** Collects the income of every region the player holds (computed from server time). */
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
      .prepare(`UPDATE online_regions SET accrued_at = ?4 WHERE season_id = ?1 AND shard_id = ?2 AND owner_id = ?3 AND ${g}`)
      .bind(pc.season.id, pc.shard.id, pc.pid, pc.now),
  ]);
  const after = (await getProfile(pc.db, pc.season.id, pc.pid))!;
  return c.json({ collected: t, regions: inc.regions.length, resources: resources(after) });
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

const ArmyBody = z.object({ groups: z.record(HeroId, z.number().int().min(0).max(3)).optional(), formations: Formations.optional(), reserve: z.record(HeroId, z.boolean()).optional() });

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
  // the muster: who stays in camp; someone must still march (a garrisoned man cannot be fielded anyway)
  for (const [id, reserve] of Object.entries(body.reserve ?? {})) {
    const x = heroes.find((h) => h.hero.id === id);
    if (!x) throw new ApiError(404, 'not_found', `No hero ${id}`);
    if (x.busyUntil > pc.now || x.reserve === reserve) continue;
    x.reserve = reserve;
    stmts.push(pc.db.prepare(`UPDATE online_heroes SET reserve = ?2, updated_at = ?3 WHERE id = ?1 AND busy_until <= ?3 AND ${g}`).bind(id, reserve ? 1 : 0, pc.now));
  }
  if (body.reserve && !heroes.some((h) => !h.reserve && !h.garrison)) throw new ApiError(400, 'bad_request', 'Someone must march with the army');
  await revBatch(pc.db, stmts);
  return c.json({ ok: true });
});

online.route('/attack', attack);
online.route('/clans', clans);
online.route('/camps', camps);
online.route('/consumables', consumables);
online.route('/market', market);
online.route('/merchant', merchant);
online.route('/boss', bosses);

