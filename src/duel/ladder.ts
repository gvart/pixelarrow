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
import { ITEM_LIST, type Item, type Rarity } from '../data/items';
import type { Hero } from '../data/units';
import { TRAITS } from '../data/traits';
import { itemDef } from '../data/items';
import { buildArmy, type ArmyMix } from '../game/enemy';
import { grantXp, makeItem, rollBeastRarity, rollRarity, setBotLevel, type IdSource } from '../game/heroes';
import { randomSite, type BattleSite } from '../world/battlefield';
import { DEFAULT_FORMATIONS, scopeHero } from '../online/rules';
import { onlineBattleSetup } from '../online/battle';
import type { BattleSetup } from '../sim/types';
import { DUEL_RULES, teamPoints } from './rules';

export const LADDER = {
  floors: 50,
  /** Every tenth floor is a boss floor: a tougher army, double Glory, an epic or better first-clear drop. */
  bossEvery: 10,
  /** Chance of an item drop on a won replay. */
  farmDropChance: 0.25,
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
}

/** XP of each hero of side 0 for a duel battle: like the campaign, without wounds, deaths or wear. */
export function duelHeroXp(result: BattleResult, team: Hero[], won: boolean, rng: Rng): { heroes: Hero[]; xp: HeroXp[] } {
  const heroes = JSON.parse(JSON.stringify(team)) as Hero[];
  const xp: HeroXp[] = [];
  for (const h of heroes) {
    const u = result.units.find((x) => x.heroId === h.id && x.side === 0);
    const kills = u?.kills ?? 0;
    const bonus = (h.equip.trinket ? itemDef(h.equip.trinket.def).mods.xpBonus ?? 0 : 0) + h.traits.reduce((a, t) => a + (TRAITS[t].mods.xpBonus ?? 0), 0);
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

/**
 * What a verified ladder battle pays: hero XP always; on a win Glory (first
 * clear, or farm Glory up to `farmLeft`), account XP and maybe an item.
 */
export function ladderPayout(floor: Floor, result: BattleResult, team: Hero[], cleared: number, farmLeft: number, seed: number, ids: IdSource, prefix: string): LadderPayout {
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
  if (firstClear || (won && rng.chance(LADDER.farmDropChance))) {
    const rarity: Rarity = firstClear && floor.boss ? rollBeastRarity(rng) : firstClear ? atLeast(rollRarity(rng, floor.tier), 'uncommon') : rollRarity(rng, floor.tier);
    const def = rng.pick(ITEM_LIST);
    drop = makeItem(rng, ids, def.id, rarity, 100, rng.pick(['greek', 'phoenician', 'celtic'] as const));
    drop.uid = `${prefix}${drop.uid}`;
  }
  return { won, firstClear, glory, capped, accountXp, heroes, xp, drop };
}

function atLeast(r: Rarity, min: Rarity): Rarity {
  const order: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  return order.indexOf(r) < order.indexOf(min) ? min : r;
}
