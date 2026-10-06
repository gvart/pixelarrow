/** Post-battle outcome: loot from enemies you actually killed, gold, XP, permadeath. */
import { itemDef, SLOTS, type Item, type Slot } from '../data/items';
import { TRAITS } from '../data/traits';
import type { Hero } from '../data/units';
import { Rng } from '../sim/rng';
import type { BattleResult, UnitResult, Wear } from '../sim/types';
import { grantXp } from './heroes';

export interface HeroOutcome {
  heroId: string;
  name: string;
  died: boolean;
  fled: boolean;
  kills: number;
  xp: number;
  levelsGained: number;
  /** Knocked out: survived, but wounded. */
  wounded?: boolean;
  /** Level and XP before this battle (for the results screen's XP bar animation). */
  levelBefore?: number;
  xpBefore?: number;
}

/** Hours of rest a knocked-out hero needs (see src/world for healing rates). */
export const WOUND_HOURS = 36;

export interface Outcome {
  victory: boolean;
  draw: boolean;
  /** The player ordered a retreat: a defeat, survivors saved, no loot. */
  retreated?: boolean;
  gold: number;
  picks: number;
  loot: Item[];
  heroes: HeroOutcome[];
  enemyKilled: number;
  enemyTotal: number;
  lost: number;
}

/** How many loot items the player may take. Better victories give more picks. */
export function lootPicks(winner: number, playerTotal: number, playerDead: number): number {
  if (winner === -1) return 1;
  if (winner !== 0) return 0;
  if (playerDead === 0) return 5;
  if (playerDead / Math.max(1, playerTotal) <= 0.2) return 4;
  return 3;
}

const WEAR_SLOT: Partial<Record<Slot, keyof Wear>> = { weapon: 'weapon', shield: 'shield', helmet: 'helmet', armor: 'armor' };

export function applyWear(item: Item, slot: Slot, wear: Wear): void {
  const k = WEAR_SLOT[slot];
  if (!k) return;
  item.cond = Math.max(0, Math.round(item.cond - wear[k]));
}

/** Items carried by enemies that the player's side killed, with battle wear applied. */
export function lootPool(result: BattleResult, enemies: Hero[]): Item[] {
  const byId = new Map(enemies.map((h) => [h.id, h]));
  const pool: Item[] = [];
  for (const u of result.units) {
    if (u.side !== 1 || u.state !== 'dead' || u.killedBy !== 0) continue;
    const h = byId.get(u.heroId);
    if (!h) continue;
    for (const slot of SLOTS) {
      const it = h.equip[slot];
      if (!it) continue;
      const copy: Item = { ...it, paint: it.paint ? { ...it.paint } : undefined };
      if (!copy.paint) delete copy.paint;
      applyWear(copy, slot, u.wear);
      // Gear on a corpse took a beating.
      copy.cond = Math.max(5, copy.cond - 5);
      pool.push(copy);
    }
  }
  // Best items first (tier, rarity), stable by uid.
  const rank = { common: 0, fine: 1, rare: 2, heroic: 3 } as const;
  pool.sort((a, b) => itemDef(b.def).tier + rank[b.rarity] - (itemDef(a.def).tier + rank[a.rarity]) || (a.uid < b.uid ? -1 : 1));
  return pool;
}

/**
 * Apply a finished battle to the player's roster (mutates heroes):
 * dead heroes are removed (permadeath), survivors gain XP, and their gear wears.
 */
export function resolveBattle(result: BattleResult, player: Hero[], enemies: Hero[], rng: Rng): { outcome: Outcome; survivors: Hero[] } {
  const units = new Map<string, UnitResult>();
  for (const u of result.units) if (u.side === 0) units.set(u.heroId, u);
  const enemyUnits = result.units.filter((u) => u.side === 1);
  const enemyKilled = enemyUnits.filter((u) => u.state === 'dead' && u.killedBy === 0).length;
  const victory = result.winner === 0;
  const draw = result.winner === -1;
  const retreated = result.retreated === 0;
  const outcomes: HeroOutcome[] = [];
  const survivors: Hero[] = [];
  let lost = 0;
  for (const h of player) {
    const u = units.get(h.id);
    if (!u) {
      survivors.push(h);
      continue;
    }
    const died = u.state === 'dead' && !u.ko;
    if (died) {
      lost++;
      outcomes.push({ heroId: h.id, name: h.name, died: true, fled: false, kills: u.kills, xp: 0, levelsGained: 0 });
      continue;
    }
    for (const slot of SLOTS) {
      const it = h.equip[slot];
      if (it) applyWear(it, slot, u.wear);
    }
    const xpBonus = (h.equip.trinket ? itemDef(h.equip.trinket.def).mods.xpBonus ?? 0 : 0) + h.traits.reduce((a, t) => a + (TRAITS[t].mods.xpBonus ?? 0), 0);
    // Men who ran off the field lose a little XP; an ordered retreat is no disgrace.
    const wounded = u.state === 'dead' && u.ko;
    const xp = Math.round((12 + u.kills * 10 + (victory ? 12 : 0) + (u.state === 'fled' && !retreated ? -6 : 0)) * (1 + xpBonus) * (wounded ? 0.5 : 1));
    h.kills += u.kills;
    h.battles++;
    const levelBefore = h.level;
    const xpBefore = h.xp;
    const levels = grantXp(h, xp, rng);
    if (wounded) h.wound = Math.max(h.wound ?? 0, WOUND_HOURS);
    outcomes.push({ heroId: h.id, name: h.name, died: false, fled: u.state === 'fled', kills: u.kills, xp, levelsGained: levels, wounded, levelBefore, xpBefore });
    survivors.push(h);
  }
  // A retreat earns only the bounty for enemies already slain: no field to strip.
  const gold = (retreated ? 0 : 20) + enemyKilled * 12 + (victory ? 60 : draw ? 20 : 0);
  const picks = retreated ? 0 : lootPicks(result.winner, player.length, lost);
  const loot = picks > 0 ? lootPool(result, enemies) : [];
  return {
    outcome: { victory, draw, retreated, gold, picks: Math.min(picks, loot.length), loot, heroes: outcomes, enemyKilled, enemyTotal: enemyUnits.length, lost },
    survivors,
  };
}

/** Validate and apply a loot selection. Returns the chosen items (at most `picks`). */
export function takeLoot(outcome: Outcome, chosenUids: string[]): Item[] {
  const set = new Set(chosenUids);
  const chosen = outcome.loot.filter((i) => set.has(i.uid));
  return chosen.slice(0, outcome.picks);
}
