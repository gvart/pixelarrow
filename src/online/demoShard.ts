/**
 * A local, deterministic stand-in for the online shard: what /api/online
 * would answer for a player some days into a season (own land and army, a
 * clan mate, a rival, a rival army on the march, neutral regions all
 * around). The map scene uses it when started with `{ preview: ... }`
 * (layout check, screenshots, offline art review); it never talks to the
 * server and changes nothing. Works on any bundled map (default: the
 * season map, DEFAULT_MAP_ID).
 */
import { siteName } from '../world/battlefield';
import { defenderFor, neutralDefenders, WINS_TO_CLAIM } from './defenders';
import { regionIncome, CAMP_RULES, ONLINE_RULES, RESOURCE_KEYS, starterOnlineArmy, type CampBuildingId, type Resources } from './rules';
import { campView, checkBuild, checkClaim, effectiveLevel, towerSight, type CampBuildingState, type CampMarker, type CampsView } from './camps';
import { heroPower } from '../sim/stats';
import type { BossView, MapView, MerchantView, ProfileView, RegionDetail, RegionView } from './client';
import { capKey, merchantAt, merchantDay, merchantStock, MERCHANT, nextReset, offerPrice, regionOf, tradingPostAt } from './merchants';
import { ENCOUNTERS, MYTHS, mythHeroes } from '../data/beasts';
import { bossMaxHp, lairAt, worldBossSites } from './lairs';
import { DEFAULT_MAP_ID, getMap, type WorldGraph } from './world';
import { t, type TKey } from '../i18n';

export const DEMO = { seed: 42, me: 101, mate: 102, rival: 201, raider: 202, clan: 7, rivalClan: 9 };

const R = (gold: number, food: number, wood: number, bronze: number, recruits: number): Resources => ({ gold, food, wood, bronze, recruits });

/** The first `n` free passable regions around a home (breadth first, the home first). */
function landAround(world: WorldGraph, home: number, n: number, taken: Set<number>, avoid: Set<number>): number[] {
  const out: number[] = [];
  for (const loc of world.within(home, 2)) {
    if (out.length >= n) break;
    const r = world.info(loc);
    if (taken.has(loc) || !r.passable || (loc !== home && (avoid.has(loc) || r.kind !== 'plot'))) continue;
    out.push(loc);
    taken.add(loc);
  }
  return out;
}

export interface DemoShard {
  now: number;
  world: WorldGraph;
  profile: ProfileView;
  map: MapView;
  owners: Map<number, { owner: number; clan: number | null; home: boolean; garrison?: number }>;
  region(loc: number): RegionDetail;
  /** Interesting regions to stage the panel on. */
  spots: { own: number; neutralNext: number; neutralFar: number; rival: number; town: number | null; lair: number | null; boss: number | null; post: number | null; market: number | null };
  /**
   * A merchant's stock (GET /merchant). `stage` fakes the situation for the
   * layout check: 'held' = in reach with the clan's discount, 'far' = out of
   * reach; otherwise the honest answer for the demo army.
   */
  merchant(loc: number, stage?: 'held' | 'far'): MerchantView | null;
  /** The world bosses in sight (GET /boss). */
  bosses: BossView[];
  /** The camps (GET/POST /camps): answered and changed locally; `now` is the demo's server time. */
  camp: DemoCamps;
}

/** The demo's camps: your home camp, a forward camp and a camp plot still to claim. */
export interface DemoCamps {
  view(now: number): CampsView;
  claim(loc: number, now: number): CampsView;
  build(loc: number, kind: CampBuildingId, slot: number | null, now: number): CampsView & { built: { loc: number; slot: number; kind: CampBuildingId; level: number; doneAt: number } };
  rest(loc: number, now: number): CampsView & { energy: number };
  /** Your home camp, the forward camp and the plot to claim (null when the map has none near). */
  spots: { home: number; forward: number | null; plot: number | null };
}

export function demoShard(now = Date.UTC(2026, 9, 20, 18, 0, 0), mapId = DEFAULT_MAP_ID): DemoShard {
  const world = getMap(mapId);
  const seed = DEMO.seed;
  const spawns = world.spawns();
  const special = new Set<number>(worldBossSites(world, seed).map((b) => b.loc));
  const me = spawns[0];
  const taken = new Set<number>();
  // keep one neutral plot next door (the attack to stage)
  const nextDoor = world.neighbours(me).find((n) => world.info(n).kind === 'plot' && !special.has(n));
  const avoid = new Set([...special, ...(nextDoor !== undefined ? [nextDoor] : [])]);
  const mine = landAround(world, me, 4, taken, avoid);
  // the clan mate on another spawn (preferably on the coast), the rival on another one further off
  const others = spawns.filter((s) => s !== me && !taken.has(s) && !avoid.has(s)).sort((a, b) => world.hops(me, a) - world.hops(me, b) || a - b);
  const mateHome = others.find((s) => world.info(s).coast) ?? others[0] ?? me;
  const mates = mateHome === me ? [] : landAround(world, mateHome, 3, taken, avoid);
  const rivalHome = others.find((s) => s !== mateHome && !taken.has(s) && world.hops(me, s) >= 2) ?? others.find((s) => s !== mateHome && !taken.has(s)) ?? mateHome;
  const rivals = rivalHome === mateHome ? [] : landAround(world, rivalHome, 3, taken, avoid);
  // camp plots near home: the first a forward camp, the next one yours to claim
  const campLocs = world
    .all()
    .filter((r) => r.campPlot && !taken.has(r.id) && !avoid.has(r.id) && world.hops(me, r.id) <= 4)
    .sort((a, b) => world.hops(me, a.id) - world.hops(me, b.id) || a.id - b.id)
    .slice(0, 2)
    .map((r) => r.id);
  for (const l of campLocs) taken.add(l);
  const owners = new Map<number, { owner: number; clan: number | null; home: boolean; garrison?: number }>();
  mine.forEach((l, i) => owners.set(l, { owner: DEMO.me, clan: DEMO.clan, home: i === 0, garrison: i === 0 ? 2 : undefined }));
  for (const l of campLocs) owners.set(l, { owner: DEMO.me, clan: DEMO.clan, home: false });
  mates.forEach((l, i) => owners.set(l, { owner: DEMO.mate, clan: DEMO.clan, home: i === 0, garrison: i === 0 ? 3 : undefined }));
  rivals.forEach((l, i) => owners.set(l, { owner: DEMO.rival, clan: DEMO.rivalClan, home: i === 0 }));

  // Armies: yours at home, the clan mate's beside its land, a raider marching through your sight.
  const mateArmy = mates[mates.length - 1] ?? mateHome;
  const sources = [...mine, ...campLocs, ...mates, me, mateArmy];
  const visible = new Set<number>();
  for (const s of sources) for (const l of world.within(s, ONLINE_RULES.sight)) visible.add(l);

  // Camps: home (granary 2, palisade 1, a forge going up), a forward camp with a watchtower.
  const atMin = (m: number) => now + m * 60_000;
  const camps: { loc: number; home: boolean; restedAt: number | null; buildings: CampBuildingState[] }[] = [
    {
      loc: me,
      home: true,
      restedAt: now - 60 * 60_000,
      buildings: [
        { slot: 0, kind: 'palisade', level: 1, doneAt: atMin(-600) },
        { slot: 1, kind: 'granary', level: 2, doneAt: atMin(-300) },
        { slot: 4, kind: 'forge', level: 1, doneAt: atMin(25) },
      ],
    },
  ];
  if (campLocs[0] !== undefined) camps.push({ loc: campLocs[0], home: false, restedAt: null, buildings: [{ slot: 0, kind: 'watchtower', level: 1, doneAt: atMin(-200) }] });
  for (const c of camps) {
    const hops = ONLINE_RULES.sight + towerSight(c.buildings, now);
    if (hops > ONLINE_RULES.sight) for (const l of world.within(c.loc, hops)) visible.add(l);
  }
  const bossSites = worldBossSites(world, seed);

  const regions: RegionView[] = [...visible].sort((a, b) => a - b).map((loc) => {
    const s = world.info(loc);
    const o = owners.get(loc);
    const boss = bossSites.find((b) => b.loc === loc);
    const lair = !o ? lairAt(world, seed, loc) : null;
    const v: RegionView = {
      loc,
      kind: s.kind,
      tier: s.tier,
      coast: s.coast,
      site: siteName(s.site),
      occupant: boss || lair ? 'beast' : o ? 'player' : s.passable ? 'npc' : 'none',
      owner: o?.owner ?? null,
      clan: o?.clan ?? null,
      home: o?.home ?? false,
    };
    if (o?.garrison && o.clan === DEMO.clan) v.garrison = o.garrison;
    if (v.occupant === 'npc') v.def = defenderFor(seed, s).id;
    if (lair) {
      v.lair = lair.enc;
      v.lairLevel = lair.level;
    }
    if (boss) v.boss = boss.boss;
    const post = tradingPostAt(world, loc);
    if (post) v.post = post;
    return v;
  });

  // A raider marching across your sight: the quickest route between two visible neutral regions.
  const free = regions.filter((r) => r.owner === null && r.occupant === 'npc').map((r) => r.loc);
  let raid: number[] = [];
  for (const a of free)
    for (const b of free) {
      if (a >= b || raid.length >= 3) continue;
      const p = world.path(a, b, (r) => !owners.has(r.id));
      if (p && p.path.length >= 3 && p.path.length > raid.length) raid = p.path;
    }
  const at: number[] = [];
  raid.forEach((loc, i) => at.push(i === 0 ? now - 4 * 60_000 : at[i - 1] + world.minutes(raid[i - 1], loc) * 60_000));

  const armies: MapView['armies'] = [
    { player: DEMO.me, loc: me, dest: null, arriveAt: null, path: null },
    { player: DEMO.mate, loc: mateArmy, dest: null, arriveAt: null, path: null },
  ];
  if (raid.length >= 2) armies.push({ player: DEMO.raider, loc: raid[0], dest: raid[raid.length - 1], arriveAt: at[at.length - 1], path: raid, at });

  const heroes = starterOnlineArmy(seed, { nextId: 1 }, 'demo_');
  const profile: ProfileView = {
    season: { id: 3, startedAt: now - 27 * 86_400_000, endsAt: now + 63 * 86_400_000 },
    shard: { id: 1, map: world.id },
    now,
    resources: R(1240, 386, 212, 64, 3.4),
    energy: 74,
    energyMax: ONLINE_RULES.energyMax,
    home: me,
    army: { loc: me, marching: false, dest: null, arriveAt: null, path: null, at: null },
    formations: ['line', 'skirmish', 'line', 'column'],
    heroes: heroes.map((hero, i) => ({ hero, garrison: i >= heroes.length - 1 ? me : null, woundedUntil: 0, busy: false, reserve: false })),
    stash: [],
    clan: { id: DEMO.clan, name: 'Kites of Pella', tag: 'KIT', role: 'officer' },
    battles: 14,
    wins: 11,
    income: { pending: R(46, 18, 12, 3, 0.4), regions: mine.length },
  };
  const map: MapView = {
    season: { id: 3, endsAt: profile.season.endsAt },
    shard: profile.shard,
    now,
    you: { id: DEMO.me, clan: DEMO.clan, home: me, army: profile.army },
    regions,
    armies,
    players: { [DEMO.me]: 'Ana', [DEMO.mate]: 'Brasidas', [DEMO.rival]: 'Kleon', [DEMO.raider]: 'Phormion' },
    clans: { [DEMO.clan]: { name: 'Kites of Pella', tag: 'KIT' }, [DEMO.rivalClan]: { name: 'Sons of Argos', tag: 'ARG' } },
  };
  const markers = (tNow: number): CampMarker[] =>
    camps
      .filter((c) => visible.has(c.loc))
      .map((c) => ({ loc: c.loc, owner: DEMO.me, home: c.home, buildings: c.buildings.filter((b) => effectiveLevel(b, tNow) > 0).length }));
  // the mate's home camp too
  const mateCamp: CampMarker[] = mates[0] !== undefined && visible.has(mates[0]) ? [{ loc: mates[0], owner: DEMO.mate, home: true, buildings: 2 }] : [];
  map.camps = [...markers(now), ...mateCamp].sort((a, b) => a.loc - b.loc);

  // the world bosses some raids into the season: wounded, an arm cut, a leaderboard
  const bosses: BossView[] = bossSites.map((site) => {
    const boss = site.boss;
    const level = ENCOUNTERS[boss].levels[0];
    const max = bossMaxHp(boss, level);
    return {
      boss,
      loc: site.loc,
      level,
      hp: Math.round(max.body * 0.62),
      maxHp: max.body,
      parts: Array.from({ length: max.parts }, (_, i) => (i === 2 ? 0 : max.part)),
      partMax: max.part,
      status: 'active' as const,
      killedAt: null,
      segment: ENCOUNTERS[boss].segment ?? 120,
      top: [
        { player: DEMO.mate, name: 'Brasidas', clan: 'KIT', damage: 2140, raids: 6 },
        { player: DEMO.rival, name: 'Kleon', clan: 'ARG', damage: 1630, raids: 5 },
        { player: DEMO.me, name: 'Ana', clan: 'KIT', damage: 980, raids: 3 },
        { player: DEMO.raider, name: 'Phormion', clan: null, damage: 410, raids: 2 },
      ],
      clans: [
        { clan: DEMO.clan, tag: 'KIT', name: 'Kites of Pella', damage: 3120 },
        { clan: DEMO.rivalClan, tag: 'ARG', name: 'Sons of Argos', damage: 1630 },
      ],
      you: { damage: 980, raids: 3, loot: null },
    };
  });

  const viewOf = (loc: number): RegionView => {
    const s = world.info(loc);
    return regions.find((x) => x.loc === loc) ?? { loc, kind: s.kind, tier: s.tier, coast: s.coast, site: siteName(s.site), occupant: s.passable ? 'npc' : 'none', owner: null, clan: null, home: false };
  };

  const region = (loc: number): RegionDetail => {
    const s = world.info(loc);
    const view = viewOf(loc);
    const o = owners.get(loc);
    const ours = !!o && o.clan === DEMO.clan;
    const adjacent = world.adjacent(me, loc);
    let defenders: RegionDetail['defenders'] = null;
    let siege: RegionDetail['siege'] = null;
    const lair = view.lair ? lairAt(world, seed, loc) : null;
    if (lair) {
      const beasts = mythHeroes(lair.enc, lair.level);
      defenders = { count: beasts.length, power: Math.round(beasts.reduce((x, b) => x + heroPower(b), 0)), kind: 'beast' };
      siege = { wins: 0, needed: 1, label: MYTHS[ENCOUNTERS[lair.enc].body].name };
    } else if (view.boss) {
      defenders = null;
    } else if (!o && s.passable) {
      const npc = neutralDefenders(seed, s, 0);
      defenders = { count: npc.length, power: Math.round(npc.reduce((a, x) => a + heroPower(x), 0)), kind: 'npc' };
      const needed = WINS_TO_CLAIM[s.tier] ?? 1;
      siege = { wins: needed > 1 ? 1 : 0, needed, label: defenderFor(seed, s).label };
    } else if (o && !ours && adjacent) defenders = { count: 4, power: 212, kind: 'garrison' };
    return {
      region: view,
      ownerName: o ? map.players[String(o.owner)] ?? null : null,
      clan: o?.clan ? { id: o.clan, ...map.clans[String(o.clan)] } : null,
      yields: regionIncome(s),
      marchMinutes: adjacent ? world.minutes(me, loc) : (world.path(me, loc)?.minutes ?? 0),
      mine: o?.owner === DEMO.me,
      ours,
      locked: false,
      garrison: ours ? [] : null,
      formations: null,
      defenders,
      siege,
      income: o?.owner === DEMO.me ? R(12, 6, 4, 0, 0.1) : null,
      canAttack: s.passable && !ours && !o?.home && adjacent && !view.boss,
      canGarrison: ours && me === loc,
      lair: lair ? { enc: lair.enc, level: lair.level, tier: lair.tier, home: true, returnsAt: null } : null,
      boss: view.boss ?? null,
      merchant: merchantAt(world, loc),
    };
  };

  const merchant = (loc: number, stage?: 'held' | 'far'): MerchantView | null => {
    const kind = merchantAt(world, loc);
    if (!kind) return null;
    const o = owners.get(loc);
    const held = stage === 'held';
    const discount = held || (!!o && o.clan === DEMO.clan);
    const reach = stage === 'far' ? false : held || discount || profile.army.loc === loc || world.adjacent(profile.army.loc, loc);
    const holder = held ? DEMO.mate : o?.owner ?? null;
    const day = merchantDay(now);
    // some of today's caps already used: a war horn bought out, a salve bought
    const bought: Record<string, number> = { war_horn: 2, healing_salve: 1 };
    return {
      loc,
      kind,
      region: regionOf(world, loc),
      day,
      now,
      resetsAt: nextReset(now),
      reach,
      discount,
      discountRate: MERCHANT.ownerDiscount,
      holderCutRate: MERCHANT.ownerCut,
      holder: holder ? { id: holder, name: map.players[String(holder)] ?? null, you: holder === DEMO.me } : null,
      earned: 0,
      gold: profile.resources.gold,
      drachmae: 340,
      offers: merchantStock(world, seed, loc, kind, day).map((x) => ({
        ...x,
        price: { gold: offerPrice(x, 'gold', discount), drachmae: offerPrice(x, 'drachmae', discount) },
        bought: bought[capKey(x)] ?? 0,
      })),
    };
  };

  // ---- camps (the same checks as the server, applied to the local copy)
  const campErr = (reason: string): never => {
    throw new Error(t(`ocamp.why.${reason}` as TKey, { max: CAMP_RULES.maxForward }));
  };
  const campsView = (t0: number): CampsView => {
    map.camps = [...markers(t0), ...mateCamp].sort((a, b) => a.loc - b.loc);
    return {
      now: t0,
      camps: camps.map((c) => campView(c, t0)),
      claimable: campLocs.filter((l) => !camps.some((c) => c.loc === l)),
      forward: { n: camps.filter((c) => !c.home).length, max: CAMP_RULES.maxForward },
      resources: { ...profile.resources },
      army: { loc: profile.army.loc, marching: profile.army.marching },
    };
  };
  const spend = (cost: Resources) => {
    for (const k of RESOURCE_KEYS) profile.resources[k] = Math.round((profile.resources[k] - cost[k]) * 100) / 100;
  };
  const camp: DemoCamps = {
    spots: { home: me, forward: campLocs[0] ?? null, plot: campLocs[1] ?? null },
    view: (t0) => campsView(t0),
    claim(loc, t0) {
      const ok = checkClaim({
        campPlot: world.has(loc) && world.info(loc).campPlot,
        mine: owners.get(loc)?.owner === DEMO.me,
        isCamp: camps.some((c) => c.loc === loc),
        forward: camps.filter((c) => !c.home).length,
        // the demo lets you pitch a camp without marching there
        armyHere: true,
        have: profile.resources,
      });
      if (!ok.ok) campErr(ok.reason);
      spend(CAMP_RULES.claimCost);
      camps.push({ loc, home: false, restedAt: null, buildings: [] });
      return campsView(t0);
    },
    build(loc, kind, slot, t0) {
      const c = camps.find((x) => x.loc === loc);
      if (!c) return campErr('notCamp');
      const ok = checkBuild(c, kind, slot, profile.resources, t0);
      if (!ok.ok) return campErr(ok.reason);
      spend(ok.cost);
      const existing = c.buildings.find((b) => b.kind === kind);
      const doneAt = t0 + ok.minutes * 60_000;
      if (existing) Object.assign(existing, { level: ok.level, doneAt });
      else c.buildings.push({ slot: slot!, kind, level: 1, doneAt });
      return { built: { loc, slot: existing?.slot ?? slot!, kind, level: ok.level, doneAt }, ...campsView(t0) };
    },
    rest(loc, t0) {
      const c = camps.find((x) => x.loc === loc);
      if (!c) return campErr('notCamp');
      if (c.restedAt !== null && t0 - c.restedAt < CAMP_RULES.restCooldownMs) return campErr('resting');
      c.restedAt = t0;
      profile.energy = Math.min(ONLINE_RULES.energyMax, profile.energy + CAMP_RULES.restEnergy);
      return { energy: profile.energy, ...campsView(t0) };
    },
  };

  const neutral = regions.filter((x) => x.owner === null && x.occupant === 'npc');
  const plots = [...neutral.filter((x) => x.kind === 'plot'), ...neutral.filter((x) => x.kind !== 'plot')];
  const neutralNext = plots.find((x) => world.adjacent(me, x.loc))?.loc ?? mine[1] ?? me;
  const neutralFar = plots.find((x) => world.hops(me, x.loc) === 2)?.loc ?? neutralNext;
  const town = regions.find((x) => (x.kind === 'town' || x.kind === 'fort') && x.owner === null)?.loc ?? null;
  const rivalSeen = regions.filter((x) => x.owner === DEMO.rival).sort((a, b) => world.hops(me, a.loc) - world.hops(me, b.loc))[0]?.loc;
  const post = regions.find((x) => x.post)?.loc ?? world.all().find((r) => r.kind === 'post')?.id ?? null;
  const market = regions.find((x) => x.kind === 'town' || x.kind === 'capital')?.loc ?? world.all().find((r) => r.town)?.id ?? null;
  const lairSpot = regions.find((x) => x.lair)?.loc ?? world.all().find((r) => r.kind === 'lair')?.id ?? null;
  const bossSpot = bosses.find((b) => visible.has(b.loc))?.loc ?? bosses[0]?.loc ?? null;
  return {
    now,
    world,
    profile,
    map,
    owners,
    region,
    merchant,
    bosses,
    camp,
    spots: { own: mine[1] ?? me, neutralNext, neutralFar, rival: rivalSeen ?? rivals[0] ?? rivalHome, town, lair: lairSpot, boss: bossSpot, post, market },
  };
}
