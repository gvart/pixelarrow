/**
 * Beast lairs and world bosses on the season map (pure and deterministic,
 * used by the Worker and the client's demo shard).
 *
 * - Lairs: every region of kind 'lair' (src/online/maps) is held by a mythical
 *   beast picked from the shard seed and the region (no storage). A lair
 *   fights with its beast instead of the usual neutrals until the beast is
 *   slain; then it can be claimed like any region, and the beast comes back
 *   after BEAST_RULES.respawnMs if the region is left to the neutrals.
 * - World bosses: a Kraken on a coastal plot and a Titan in the hills per shard, with
 *   shared HP stored by the server (server/src/online/bosses.ts): every raid is
 *   a verified battle segment against the boss's current wounds.
 */
import { ENCOUNTERS, LAIR_BEASTS, MYTHS, lairLevel, type EncounterId } from '../data/beasts';
import { hash3 } from '../world/noise';
import type { RegionInfo, WorldGraph } from './world';
import { Rng, hashString } from '../sim/rng';
import { beastArmy } from '../game/beasts';
import type { Hero } from '../data/units';
import type { BattleResult, BattleSetup } from '../sim/types';
import type { Item } from '../data/items';
import { makeItem, rollBeastRarity } from '../game/heroes';
import { BASE_ITEMS } from '../data/items';

export const BEAST_RULES = {
  /** A slain lair beast returns after this long (if the region fell back to the neutrals). */
  respawnMs: 48 * 3_600_000,
  /** Pieces of hoard by lair tier (index = tier 1..5). */
  hoard: [0, 1, 2, 2, 3, 4],
  /** World bosses: energy per raid, hoard pieces shared by damage, the smallest share that earns a piece. */
  raidEnergy: 25,
  bossItems: 24,
  minShare: 0.02,
  /** Raid tickets live this long. */
  ticketMs: 10 * 60_000,
};

export interface Lair {
  enc: EncounterId;
  level: number;
  tier: number;
}

const lairCache = new Map<string, Lair | null>();

/** The landscape a beast may favour (ENCOUNTERS[...].terrain) for a region's ground. */
export function landTag(r: Pick<RegionInfo, 'site'>): EncounterTerrain {
  switch (r.site.base) {
    case 'forest':
      return 'forest';
    case 'hills':
      return r.site.rocky ? 'mine' : 'hills';
    case 'scrub':
      return 'ruins';
    case 'beach':
      return 'water';
    default:
      return r.site.river ? 'farmland' : 'plains';
  }
}
type EncounterTerrain = (typeof ENCOUNTERS)[EncounterId]['terrain'][number];

/** The beast of a lair region, or null for any other region (deterministic per shard seed). */
export function lairAt(world: WorldGraph, seed: number, loc: number): Lair | null {
  const key = `${world.id}:${seed}:${loc}`;
  const c = lairCache.get(key);
  if (c !== undefined) return c;
  let out: Lair | null = null;
  const r = world.has(loc) ? world.info(loc) : null;
  if (r && r.kind === 'lair') {
    // every beast can lair anywhere; its favourite ground is three times as likely
    const tag = landTag(r);
    const w = LAIR_BEASTS.map((e) => ((ENCOUNTERS[e].terrain as string[]).includes(tag) ? 3 : 1));
    let pick = hash3(loc, 0, seed + 37) * w.reduce((a, x) => a + x, 0);
    let enc = LAIR_BEASTS[0];
    for (let i = 0; i < w.length; i++) {
      pick -= w[i];
      if (pick < 0) {
        enc = LAIR_BEASTS[i];
        break;
      }
    }
    const tier = Math.min(5, r.tier + (r.depth > 0.6 ? 1 : 0));
    out = { enc, tier, level: lairLevel(enc, tier) };
  }
  if (lairCache.size > 50_000) lairCache.clear();
  lairCache.set(key, out);
  return out;
}

/** The beast army of a lair for a respawn epoch: the beast and its hoard. */
export function lairBeasts(seed: number, h: Pick<RegionInfo, 'id'>, lair: Lair, epoch: number): Hero[] {
  const rng = new Rng((seed ^ hashString(`${h.id}:lair`) ^ Math.imul(epoch + 1, 0x9e3779b1)) >>> 0 || 1);
  const heroes = beastArmy(lair.enc, lair.level, rng, { nextId: 1 }, BEAST_RULES.hoard[lair.tier] ?? 2, `b${h.id}e${epoch}_`);
  for (const hero of heroes) for (const it of Object.values(hero.equip)) if (it) it.uid = `b${h.id}e${epoch}_${it.uid}`;
  return heroes;
}

// ------------------------------------------------------------------ world bosses

export interface BossSite {
  loc: number;
  boss: EncounterId;
  level: number;
}

const bossCache = new Map<string, BossSite[]>();

/**
 * The shard's world bosses: a Kraken on a coastal plot and a Titan on a hill
 * plot, away from the spawn plots and their neighbours (when the map allows),
 * picked by the shard seed.
 */
export function worldBossSites(world: WorldGraph, seed: number): BossSite[] {
  const key = `${world.id}:${seed}`;
  const c = bossCache.get(key);
  if (c) return c;
  const nearSpawn = new Set<number>();
  for (const s of world.spawns()) for (const n of world.within(s, 1)) nearSpawn.add(n);
  const plots = world.all().filter((r) => r.kind === 'plot' && !r.spawn);
  const far = plots.filter((r) => !nearSpawn.has(r.id));
  const best = (list: RegionInfo[], salt: number, not?: number) => {
    let out: RegionInfo | null = null;
    let bs = Infinity;
    for (const r of list) {
      if (r.id === not) continue;
      const s = hash3(r.id, salt, seed + 41);
      if (s < bs) (bs = s), (out = r);
    }
    return out;
  };
  const pick = (want: (r: RegionInfo) => boolean, salt: number, not?: number) =>
    best(far.filter(want), salt, not) ?? best(plots.filter(want), salt, not) ?? best(far, salt, not) ?? best(plots, salt, not);
  const out: BossSite[] = [];
  const kraken = pick((r) => r.coast, 1);
  if (kraken) out.push({ loc: kraken.id, boss: 'kraken', level: ENCOUNTERS.kraken.levels[0] });
  const titan = pick((r) => r.site.base === 'hills' && !r.coast, 2, kraken?.id) ?? null;
  if (titan && titan.id !== kraken?.id) out.push({ loc: titan.id, boss: 'titan', level: ENCOUNTERS.titan.levels[0] });
  bossCache.set(key, out);
  return out;
}

export function bossAt(world: WorldGraph, seed: number, loc: number): BossSite | null {
  return worldBossSites(world, seed).find((b) => b.loc === loc) ?? null;
}

/** Is a region reserved for a lair or a world boss (no homes there)? */
export function beastLoc(world: WorldGraph, seed: number, loc: number): boolean {
  return !!bossAt(world, seed, loc) || !!lairAt(world, seed, loc);
}

/** Full HP of a world boss's body and of each of its parts at its level. */
export function bossMaxHp(boss: EncounterId, level: number): { body: number; part: number; parts: number } {
  const e = ENCOUNTERS[boss];
  const k = 1 + 0.08 * (level - 1);
  return { body: Math.round(MYTHS[e.body].hp * k), part: e.parts ? Math.round(MYTHS[e.parts.id].hp * k) : 0, parts: e.parts?.count ?? 0 };
}

/** Stored state of a world boss -> the heroes and their starting HP for a raid segment. */
export function bossDefenders(boss: EncounterId, level: number, hp: number, parts: number[], shardKey: string): { heroes: Hero[]; hp0: Map<string, number> } {
  const heroes = beastArmy(boss, level, new Rng(hashString(`${shardKey}:${boss}`)), { nextId: 1 }, 0, `wb_${boss}_`);
  const hp0 = new Map<string, number>();
  const e = ENCOUNTERS[boss];
  heroes.forEach((h) => {
    if (h.cls === e.body) hp0.set(h.id, Math.max(1, hp));
  });
  heroes.filter((h) => h.cls !== e.body).forEach((h, i) => hp0.set(h.id, Math.max(0, parts[i] ?? 0)));
  return { heroes, hp0 };
}

/** Puts the boss's stored wounds into a setup (side 1 units) and fixes the segment length. */
export function applyBossState(setup: BattleSetup, hp0: Map<string, number>, segment: number): BattleSetup {
  for (const u of setup.armies[1].units) {
    const v = hp0.get(u.heroId);
    if (v !== undefined && v < u.stats.maxHp) u.hp0 = Math.round(v);
  }
  setup.timeLimit = segment;
  return setup;
}

/** What a raid segment did to the boss: body and part HP at the end, damage dealt. */
export function segmentOutcome(setup: BattleSetup, result: BattleResult): { body: number; parts: number[]; dealt: number; killed: boolean } {
  const start = new Map(setup.armies[1].units.map((u) => [u.heroId, u.hp0 ?? u.stats.maxHp]));
  let dealt = 0;
  let body = 0;
  const parts: number[] = [];
  let killed = false;
  const bodyCls = new Set(setup.armies[1].units.filter((u) => ENCOUNTERS[u.stats.boss as EncounterId]?.body === u.stats.boss).map((u) => u.heroId));
  for (const r of result.units) {
    if (r.side !== 1) continue;
    const s = start.get(r.heroId) ?? r.maxHp;
    const end = r.state === 'dead' ? 0 : Math.max(0, Math.round(r.hp));
    dealt += Math.max(0, s - end);
    if (bodyCls.has(r.heroId)) {
      body = end;
      if (end <= 0) killed = true;
    } else parts.push(end);
  }
  return { body, parts, dealt: Math.round(dealt), killed };
}

/** What a world boss's hoard holds: every finer weapon, shield, helmet and armour. */
export function bossLootPool(): string[] {
  return BASE_ITEMS.filter((d) => d.tier >= 2 && d.slot !== 'trinket').map((d) => d.id);
}

/**
 * A player's share of a slain world boss's hoard: pieces by damage share,
 * rarity from rollBeastRarity, all seeded by the boss and the player so the
 * split is the same however often it runs (idempotent).
 */
export function bossLoot(boss: EncounterId, shardKey: string, pid: number, share: number, uidPrefix: string): Item[] {
  if (share < BEAST_RULES.minShare) return [];
  const n = Math.max(1, Math.round(share * BEAST_RULES.bossItems));
  const rng = new Rng(hashString(`${shardKey}:${boss}:loot:${pid}`));
  const pool = bossLootPool();
  const ids = { nextId: 1 };
  const out: Item[] = [];
  for (let i = 0; i < n; i++) {
    const it = makeItem(rng, ids, rng.pick(pool), rollBeastRarity(rng), 100);
    it.uid = `${uidPrefix}${i}`;
    out.push(it);
  }
  return out;
}

