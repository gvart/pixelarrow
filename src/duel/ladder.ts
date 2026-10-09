/**
 * The duel PvE ladder (pure, shared by client and server): floors of bot
 * armies with rising budgets, first-clear and farm rewards, item drops, and
 * how a verified ladder battle pays out. Duels cost nothing: no deaths, no
 * wounds, no wear (docs/DUELS.md "Losses").
 *
 * A floor's army is a pure function of the floor number, so players can learn
 * and counter it; only the battle seed comes from the server ticket.
 */
import { Rng } from '../sim/rng';
import type { BattleResult } from '../sim/types';
import type { FormationType } from '../sim/formation';
import { BASE_ITEMS, type Item, type Rarity } from '../data/items';
import type { Hero } from '../data/units';
import { TRAITS } from '../data/traits';
import { gearTotal } from '../game/gear';
import { buildArmy, type ArmyMix } from '../game/enemy';
import { grantXp, makeItem, rollBeastRarity, rollRarity, setBotLevel, type IdSource } from '../game/heroes';
import { randomSite, type BattleSite } from '../world/battlefield';
import { DEFAULT_FORMATIONS, scopeHero } from '../online/rules';
import { onlineBattleSetup } from '../online/battle';
import type { BattleSetup } from '../sim/types';
import { DUEL_RULES, heroPoints, teamPoints } from './rules';
import { SETS } from '../data/sets';
import { CHAPTER_SET, LADDER_NAMED, SOURCES, armyPick, legendaryHoard, pieceDefs, pityChest } from '../game/sources';

export const LADDER = {
  floors: 50,
  /** Every tenth floor is a boss floor: a tougher army, double Glory, an epic or better first-clear drop. */
  bossEvery: 10,
  /** Chance of an item drop on a won replay. */
  farmDropChance: 0.25,
  /** Floors per chapter (the boss is the last floor of each). */
  chapterSize: 10,
  /**
   * Stars of a won floor by the share of the team's points lost (dead or
   * fled heroes, weighted by heroPoints): 3 at most `stars3` lost, 2 at most
   * `stars2`, else 1. A lost battle earns none. Stars only go up.
   */
  stars3: 0.2,
  stars2: 0.5,
  /** Chapter chests: claimable once each at these chapter star totals (tier 1..3). */
  chestStars: [10, 20, 30] as readonly number[],
  /** Chest Glory: base + perChapter × (chapter − 1), by tier. */
  chestGlory: [
    { base: 60, perChapter: 40 },
    { base: 120, perChapter: 80 },
    { base: 200, perChapter: 120 },
  ] as readonly { base: number; perChapter: number }[],
  /** The tier whose chest also holds a piece of the chapter's set (src/game/sources.ts CHAPTER_SET). */
  chestItemTier: 3,
};

const MIXES: ArmyMix[] = ['bandits', 'line', 'raiders', 'hill_tribe', 'mercs', 'pirates', 'deserters', 'cultists', 'line', 'garrison'];

export interface Floor {
  floor: number;
  boss: boolean;
  /** Points the player's team may bring. */
  budget: number;
  /** Gear tier of drops and of the enemy (1..3). */
  tier: number;
  heroes: Hero[];
  formations: FormationType[];
  site: BattleSite;
  /** Points of the enemy army (shown to the player). */
  points: number;
  reward: { firstGlory: number; farmGlory: number; xp: number };
}

export function isBoss(floor: number): boolean {
  return floor % LADDER.bossEvery === 0;
}

/** The player's budget on a floor: 60 at floor 1, the ranked budget (150) from floor 23 on. */
export function floorBudget(floor: number): number {
  return Math.min(DUEL_RULES.budget, 56 + 4 * floor);
}

/** The enemy's share of the player's budget: from 70% on floor 1 to 115% on floor 50; bosses +15%. */
export function floorDifficulty(floor: number): number {
  const f = Math.max(1, Math.min(LADDER.floors, floor));
  return 0.7 + (0.45 * (f - 1)) / (LADDER.floors - 1) + (isBoss(f) ? 0.15 : 0);
}

export function floorReward(floor: number): Floor['reward'] {
  const k = isBoss(floor) ? 2 : 1;
  return { firstGlory: (40 + 8 * floor) * k, farmGlory: (10 + floor) * k, xp: 20 + 2 * floor };
}

/** A ladder floor (deterministic). */
export function ladderFloor(floor: number): Floor {
  const f = Math.max(1, Math.min(LADDER.floors, Math.floor(floor)));
  const rng = new Rng((f * 0x9e3779b1) >>> 0 || 1);
  const budget = floorBudget(f);
  const target = Math.round(budget * floorDifficulty(f));
  const tier = Math.min(3, 1 + Math.floor((f - 1) / 17));
  const level = 1 + Math.floor(((f - 1) * 9) / (LADDER.floors - 1));
  const ids: IdSource = { nextId: 1 };
  const mix = isBoss(f) ? 'garrison' : MIXES[(f - 1) % MIXES.length];
  // A full army at the floor's level, fitted to its point target: men leave
  // first (flankers and reserves go before the line), then levels; levels
  // rise (at most two above the floor's) only while under the target.
  const heroes = buildArmy(rng, ids, { count: DUEL_RULES.teamMax, level, tier, targetPower: 0, mix, tune: false }).heroes;
  for (const h of heroes) setBotLevel(h, level);
  const minMen = Math.min(DUEL_RULES.teamMax, 3 + Math.floor(f / 6));
  for (let guard = 0; guard < 200; guard++) {
    const pts = teamPoints(heroes);
    if (pts > target) {
      if (heroes.length > minMen) heroes.pop();
      else {
        const h = heroes.reduce((x, y) => (y.level > x.level ? y : x));
        if (h.level <= 1) break;
        setBotLevel(h, h.level - 1);
      }
    } else if (pts < target - 3) {
      const h = heroes.reduce((x, y) => (y.level < x.level ? y : x));
      if (h.level >= Math.min(10, level + 2)) break;
      setBotLevel(h, h.level + 1);
    } else break;
  }
  for (const h of heroes) {
    for (const it of Object.values(h.equip)) if (it) it.cond = 100;
    scopeHero(h, `lad${f}_`);
  }
  return {
    floor: f,
    boss: isBoss(f),
    budget,
    tier,
    heroes,
    formations: [...DEFAULT_FORMATIONS],
    site: randomSite(rng),
    points: teamPoints(heroes),
    reward: floorReward(f),
  };
}

/** The battle of a ladder ticket: the player's team (side 0) against the floor's bots (side 1) on its field. */
export function ladderSetup(seed: number, team: Hero[], formations: FormationType[], floor: Floor): BattleSetup {
  return onlineBattleSetup(seed, { heroes: team, formations, bot: false }, { heroes: floor.heroes, formations: floor.formations, bot: true }, floor.site);
}

/** The floors a player may fight: every cleared floor and the next one. */
export function canFight(floor: number, cleared: number): boolean {
  return Number.isInteger(floor) && floor >= 1 && floor <= Math.min(LADDER.floors, cleared + 1);
}

// ------------------------------------------------------------------ payout

export interface HeroXp {
  heroId: string;
  name: string;
  kills: number;
  xp: number;
  levelsGained: number;
  levelBefore: number;
  xpBefore: number;
}

export interface LadderPayout {
  won: boolean;
  firstClear: boolean;
  glory: number;
  /** Farm Glory withheld by the daily cap. */
  capped: number;
  accountXp: number;
  /** The team after XP (gear untouched: no wear in duels). */
  heroes: Hero[];
  xp: HeroXp[];
  drop: Item | null;
  /** The duel bad-luck counter after this battle (boss floors' first-clear drops count, src/game/sources.ts pityChest). */
  pity: number;
  /** Stars this battle earned (0 for a loss) and the share of team points lost. */
  stars: number;
  lost: number;
}

/** XP of each hero of `side` (0 on the ladder) for a duel battle: like the campaign, without wounds, deaths or wear. */
export function duelHeroXp(result: Pick<BattleResult, 'units'>, team: Hero[], won: boolean, rng: Rng, side = 0): { heroes: Hero[]; xp: HeroXp[] } {
  const heroes = JSON.parse(JSON.stringify(team)) as Hero[];
  const xp: HeroXp[] = [];
  for (const h of heroes) {
    const u = result.units.find((x) => x.heroId === h.id && x.side === side);
    const kills = u?.kills ?? 0;
    const bonus = gearTotal(h, 'xpBonus') + h.traits.reduce((a, t) => a + (TRAITS[t].mods.xpBonus ?? 0), 0);
    const gain = Math.round((12 + kills * 10 + (won ? 12 : 0)) * (1 + bonus));
    const levelBefore = h.level;
    const xpBefore = h.xp;
    const levelsGained = grantXp(h, gain, rng);
    h.battles++;
    h.kills += kills;
    h.wound = 0;
    xp.push({ heroId: h.id, name: h.name, kills, xp: gain, levelsGained, levelBefore, xpBefore });
  }
  return { heroes, xp };
}

/** What the army a ladder drop follows is, and the duel bad-luck counter (both optional: none and 0). */
export interface DropContext {
  classes?: readonly string[];
  pity?: number;
}

/**
 * What a verified ladder battle pays: hero XP always; on a win Glory (first
 * clear, or farm Glory up to `farmLeft`), account XP and maybe an item. The
 * boss floors 30, 40 and 50 may drop their named item (LADDER_NAMED); a boss
 * floor's first-clear drop is a beast chest for the bad-luck counter. Drops
 * follow the army (`ctx.classes`).
 */
export function ladderPayout(floor: Floor, result: BattleResult, team: Hero[], cleared: number, farmLeft: number, seed: number, ids: IdSource, prefix: string, ctx: DropContext = {}): LadderPayout {
  const rng = new Rng((seed ^ 0x2c1b3c6d) >>> 0 || 1);
  const won = result.winner === 0;
  const firstClear = won && floor.floor > cleared;
  const { heroes, xp } = duelHeroXp(result, team, won, rng);
  let glory = 0;
  let capped = 0;
  if (firstClear) glory = floor.reward.firstGlory;
  else if (won) {
    glory = Math.min(floor.reward.farmGlory, Math.max(0, farmLeft));
    capped = floor.reward.farmGlory - glory;
  }
  const accountXp = won ? floor.reward.xp : Math.round(floor.reward.xp / 3);
  let drop: Item | null = null;
  const named = LADDER_NAMED[floor.floor];
  if (won && named && rng.chance(firstClear ? SOURCES.ladderNamed.first : SOURCES.ladderNamed.replay)) {
    drop = makeItem(rng, ids, named, 'legendary', 100);
  } else if (firstClear || (won && rng.chance(LADDER.farmDropChance))) {
    const rarity: Rarity = firstClear && floor.boss ? rollBeastRarity(rng) : firstClear ? atLeast(rollRarity(rng, floor.tier), 'uncommon') : rollRarity(rng, floor.tier);
    const def = armyPick(rng, BASE_ITEMS, ctx.classes ?? []);
    drop = makeItem(rng, ids, def.id, rarity, 100, rng.pick(['greek', 'phoenician', 'celtic'] as const));
  }
  let pity = ctx.pity ?? 0;
  if (drop && firstClear && floor.boss) {
    const chest = pityChest([drop], pity, (it) => legendaryHoard(it, named ? [named] : [], `${seed}`));
    drop = chest.items[0];
    pity = chest.count;
  }
  if (drop) drop.uid = `${prefix}${drop.uid}`;
  const lost = lostShare(result, team);
  return { won, firstClear, glory, capped, accountXp, heroes, xp, drop, pity, stars: ladderStars(won, lost), lost };
}

// ------------------------------------------------------------------ stars and chapters

/** Share (0..1) of the team's points lost in a battle: dead or fled heroes of `side`, weighted by heroPoints. */
export function lostShare(result: Pick<BattleResult, 'units'>, team: readonly Hero[], side = 0): number {
  const total = teamPoints(team);
  if (total <= 0) return 0;
  let lost = 0;
  for (const h of team) {
    const u = result.units.find((x) => x.heroId === h.id && x.side === side);
    if (!u || u.state === 'dead' || u.state === 'fled') lost += heroPoints(h);
  }
  return Math.min(1, lost / total);
}

/** Stars of a ladder battle (0 for a loss): ★ a win, ★★ at most 50% of the team's points lost, ★★★ at most 20%. */
export function ladderStars(won: boolean, lost: number): 0 | 1 | 2 | 3 {
  if (!won) return 0;
  if (lost <= LADDER.stars3 + 1e-9) return 3;
  if (lost <= LADDER.stars2 + 1e-9) return 2;
  return 1;
}

export const CHAPTERS = Math.ceil(LADDER.floors / LADDER.chapterSize);
export const CHEST_TIERS = LADDER.chestStars.length;

/** The chapter (1..5) of a floor. */
export function chapterOf(floor: number): number {
  return Math.floor((Math.max(1, floor) - 1) / LADDER.chapterSize) + 1;
}

/** First and last floor of a chapter. */
export function chapterFloors(chapter: number): [number, number] {
  const first = (chapter - 1) * LADDER.chapterSize + 1;
  return [first, Math.min(LADDER.floors, first + LADDER.chapterSize - 1)];
}

/**
 * Best stars per floor (index floor − 1, length LADDER.floors) from the stored
 * bests; a floor cleared before stars existed (no row, floor ≤ cleared) has 1.
 */
export function starsByFloor(cleared: number, best: ReadonlyMap<number, number> | Record<number, number>): number[] {
  const get = (f: number) => (best instanceof Map ? best.get(f) : (best as Record<number, number>)[f]);
  const out: number[] = [];
  for (let f = 1; f <= LADDER.floors; f++) out.push(Math.max(get(f) ?? 0, f <= cleared ? 1 : 0));
  return out;
}

/** Stars collected in a chapter (from a starsByFloor array). */
export function chapterStars(stars: readonly number[], chapter: number): number {
  const [a, b] = chapterFloors(chapter);
  let n = 0;
  for (let f = a; f <= b; f++) n += stars[f - 1] ?? 0;
  return n;
}

/** The most stars a chapter holds (3 per floor). */
export function chapterMaxStars(chapter: number): number {
  const [a, b] = chapterFloors(chapter);
  return 3 * (b - a + 1);
}

export interface ChestReward {
  glory: number;
  /** The rarity of the item it holds, a piece of the chapter's set (only the top tier). */
  item: Rarity | null;
}

/** What a chapter chest holds (tier 1..3). */
export function chestReward(chapter: number, tier: number): ChestReward {
  const g = LADDER.chestGlory[tier - 1];
  const set = CHAPTER_SET[Math.max(1, Math.min(CHAPTERS, chapter))];
  return { glory: g.base + g.perChapter * (chapter - 1), item: tier === LADDER.chestItemTier ? SETS[set].rarity : null };
}

export type ChestState = 'locked' | 'ready' | 'claimed';

/** A chest's state from the chapter's stars and the claimed list. */
export function chestState(stars: readonly number[], claimed: readonly { chapter: number; tier: number }[], chapter: number, tier: number): ChestState {
  if (claimed.some((c) => c.chapter === chapter && c.tier === tier)) return 'claimed';
  return chapterStars(stars, chapter) >= LADDER.chestStars[tier - 1] ? 'ready' : 'locked';
}

export function validChest(chapter: number, tier: number): boolean {
  return Number.isInteger(chapter) && Number.isInteger(tier) && chapter >= 1 && chapter <= CHAPTERS && tier >= 1 && tier <= CHEST_TIERS;
}

/**
 * The top-tier chest's item: a piece of the chapter's set (CHAPTER_SET: the
 * rare sets in chapters 1-3, the epic ones in 4-5), following the army's
 * `classes` (deterministic by seed).
 */
export function chestItem(seed: number, ids: IdSource, prefix: string, chapter: number, classes: readonly string[] = []): Item {
  const rng = new Rng((seed ^ 0x5bd1e995) >>> 0 || 1);
  const set = CHAPTER_SET[Math.max(1, Math.min(CHAPTERS, chapter))];
  const def = armyPick(rng, pieceDefs(set), classes);
  const it = makeItem(rng, ids, def.id, SETS[set].rarity, 100, rng.pick(['greek', 'phoenician', 'celtic'] as const));
  it.uid = `${prefix}${it.uid}`;
  return it;
}

function atLeast(r: Rarity, min: Rarity): Rarity {
  const order: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  return order.indexOf(r) < order.indexOf(min) ? min : r;
}
