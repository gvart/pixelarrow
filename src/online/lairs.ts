/**
 * Beast lairs and world bosses on the hex shard (pure and deterministic, used
 * by the Worker and the client's demo shard).
 *
 * - Lairs: mythical beasts hold some valuable hexes, mostly near forts, picked
 *   from the shard seed and the hex (no storage). A lair hex fights with its
 *   beast instead of the usual neutrals until the beast is slain; then it can
 *   be claimed like any hex, and the beast comes back after BEAST_RULES.respawnMs
 *   if the hex is left to the neutrals.
 * - World bosses: a Kraken on a coast hex and a Titan inland per shard, with
 *   shared HP stored by the server (server/src/online/bosses.ts): every raid is
 *   a verified battle segment against the boss's current wounds.
 */
import { ENCOUNTERS, LAIR_BEASTS, MYTHS, lairLevel, type EncounterId } from '../data/beasts';
import { hash3 } from '../world/noise';
import { capitals, hexDistance, hexId, hexInfo, hexesWithin, SHARD_RADIUS, type Axial, type HexInfo } from './hex';
import { Rng, hashString } from '../sim/rng';
import { beastArmy } from '../game/beasts';
import type { Hero } from '../data/units';
import type { BattleResult, BattleSetup } from '../sim/types';
import type { Item } from '../data/items';
import { makeItem, rollBeastRarity } from '../game/heroes';
import { ITEM_LIST } from '../data/items';

export const BEAST_RULES = {
  /** A slain lair beast returns after this long (if the hex fell back to the neutrals). */
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

/** Is there a fort within `d` of h (cheap: the fort roll first)? */
function fortNear(seed: number, h: Axial, d: number, radius: number): boolean {
  for (const n of hexesWithin(h, d, radius)) {
    if (n.q === h.q && n.r === h.r) continue;
    if (hash3(n.q, n.r, seed + 11) >= 0.014) continue;
    if (hexInfo(seed, n.q, n.r, radius).fort) return true;
  }
  return false;
}

/** The beast whose lair a hex is, or null (deterministic per shard seed). */
export function lairAt(seed: number, h: Pick<HexInfo, 'q' | 'r' | 'type' | 'passable' | 'fort' | 'capital' | 'tier'>, radius = SHARD_RADIUS): Lair | null {
  const key = `${seed}:${radius}:${h.q}_${h.r}`;
  const c = lairCache.get(key);
  if (c !== undefined) return c;
  let out: Lair | null = null;
  const roll = hash3(h.q, h.r, seed + 31);
  if (h.passable && !h.fort && !h.capital && h.type !== 'town' && roll < 0.14) {
    const fromCentre = hexDistance(h, { q: 0, r: 0 });
    const caps = capitals(radius);
    if (fromCentre <= radius - 3 && !caps.some((cp) => hexDistance(cp, h) <= 3)) {
      const nearFort = roll < 0.07 && fortNear(seed, h, 2, radius);
      if (nearFort || roll < 0.003 + 0.0015 * h.tier) {
        // every beast can lair anywhere; its favourite ground is three times as likely
        const w = LAIR_BEASTS.map((e) => ((ENCOUNTERS[e].terrain as string[]).includes(h.type) ? 3 : 1));
        let pick = hash3(h.q, h.r, seed + 37) * w.reduce((a, x) => a + x, 0);
        let enc = LAIR_BEASTS[0];
        for (let i = 0; i < w.length; i++) {
          pick -= w[i];
          if (pick < 0) {
            enc = LAIR_BEASTS[i];
            break;
          }
        }
        const tier = Math.min(5, h.tier + (nearFort ? 1 : 0) + (fromCentre < radius * 0.4 ? 1 : 0));
        out = { enc, tier, level: lairLevel(enc, tier) };
      }
    }
  }
  if (lairCache.size > 50_000) lairCache.clear();
  lairCache.set(key, out);
  return out;
}

/** The beast army of a lair for a respawn epoch: the beast and its hoard. */
export function lairBeasts(seed: number, h: Pick<HexInfo, 'id'>, lair: Lair, epoch: number): Hero[] {
  const rng = new Rng((seed ^ hashString(`${h.id}:lair`) ^ Math.imul(epoch + 1, 0x9e3779b1)) >>> 0 || 1);
  const heroes = beastArmy(lair.enc, lair.level, rng, { nextId: 1 }, BEAST_RULES.hoard[lair.tier] ?? 2, `b${h.id}e${epoch}_`);
  for (const hero of heroes) for (const it of Object.values(hero.equip)) if (it) it.uid = `b${h.id}e${epoch}_${it.uid}`;
  return heroes;
}

// ------------------------------------------------------------------ world bosses

export interface BossSite extends Axial {
  boss: EncounterId;
  level: number;
}

const bossCache = new Map<string, BossSite[]>();

/** The shard's world bosses: a Kraken on the coast, a Titan in the hills inland. */
export function worldBossSites(seed: number, radius = SHARD_RADIUS): BossSite[] {
  const key = `${seed}:${radius}`;
  const c = bossCache.get(key);
  if (c) return c;
  const caps = capitals(radius);
  let kraken: { h: Axial; s: number } | null = null;
  let titan: { h: Axial; s: number } | null = null;
  for (const h of hexesWithin({ q: 0, r: 0 }, radius, radius)) {
    const d = hexDistance(h, { q: 0, r: 0 }) / radius;
    if (caps.some((cp) => hexDistance(cp, h) <= 3)) continue;
    const want = (d >= 0.4 && d <= 0.92) || (d >= 0.18 && d <= 0.5);
    if (!want) continue;
    const s = hash3(h.q, h.r, seed + 41);
    if (kraken && titan && s > kraken.s && s > titan.s) continue;
    const info = hexInfo(seed, h.q, h.r, radius);
    if (!info.passable || info.fort || info.type === 'town') continue;
    if (d >= 0.4 && d <= 0.92 && info.coast && info.type !== 'mine' && (!kraken || s < kraken.s)) kraken = { h, s };
    if (d >= 0.18 && d <= 0.5 && (info.type === 'hills' || info.type === 'mine') && (!titan || s < titan.s)) titan = { h, s };
  }
  const out: BossSite[] = [];
  if (kraken) out.push({ ...kraken.h, boss: 'kraken', level: ENCOUNTERS.kraken.levels[0] });
  if (titan) out.push({ ...titan.h, boss: 'titan', level: ENCOUNTERS.titan.levels[0] });
  bossCache.set(key, out);
  return out;
}

export function bossAt(seed: number, h: Axial, radius = SHARD_RADIUS): BossSite | null {
  return worldBossSites(seed, radius).find((b) => b.q === h.q && b.r === h.r) ?? null;
}

/** Is a hex reserved for a lair or a world boss (no homes there)? */
export function beastHex(seed: number, info: HexInfo, radius = SHARD_RADIUS): boolean {
  return !!bossAt(seed, info, radius) || !!lairAt(seed, info, radius);
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

/**
 * A player's share of a slain world boss's hoard: pieces by damage share,
 * rarity from rollBeastRarity, all seeded by the boss and the player so the
 * split is the same however often it runs (idempotent).
 */
export function bossLoot(boss: EncounterId, shardKey: string, pid: number, share: number, uidPrefix: string): Item[] {
  if (share < BEAST_RULES.minShare) return [];
  const n = Math.max(1, Math.round(share * BEAST_RULES.bossItems));
  const rng = new Rng(hashString(`${shardKey}:${boss}:loot:${pid}`));
  const pool = ITEM_LIST.filter((d) => d.tier >= 2 && d.slot !== 'trinket');
  const ids = { nextId: 1 };
  const out: Item[] = [];
  for (let i = 0; i < n; i++) {
    const it = makeItem(rng, ids, rng.pick(pool).id, rollBeastRarity(rng), 100);
    it.uid = `${uidPrefix}${i}`;
    out.push(it);
  }
  return out;
}

export { hexId };
