/**
 * The post-battle report (docs/DESIGN_V2.md "Post-battle report"): one model
 * for offline battles, verified online attacks and live duels, built from the
 * finished sim (kills, damage, duration) and the outcome the rules applied
 * (XP, level-ups, wounds, deaths, gold, loot). Pure: the results screen only
 * draws it, and tests check the numbers.
 */
import type { Battle } from '../sim/battle';
import { TICK_RATE } from '../sim/battle';
import type { Side } from '../sim/types';
import type { Hero } from '../data/units';
import type { Item } from '../data/items';

export type ReportResult = 'victory' | 'defeat' | 'draw' | 'retreat';

/** One soldier's battle, read off the sim. */
export interface UnitStat {
  heroId: string;
  side: Side;
  kills: number;
  /** Damage dealt (melee, missiles, abilities). */
  dmg: number;
  dead: boolean;
  ko: boolean;
  /** Side that killed him (-1: not killed). */
  killedBy: number;
}

/** What the rules decided for one of the player's heroes (game/loot.ts HeroOutcome or the server's). */
export interface HeroResult {
  heroId?: string;
  name: string;
  died: boolean;
  wounded?: boolean;
  fled?: boolean;
  xp: number;
  levelsGained: number;
  levelBefore?: number;
  xpBefore?: number;
}

export interface HeroLine {
  heroId: string;
  name: string;
  /** For the portrait (paper doll) and the class. */
  hero: Hero | null;
  kills: number;
  dmg: number;
  died: boolean;
  wounded: boolean;
  xp: number;
  levelBefore: number;
  xpBefore: number;
  levelsGained: number;
}

export interface BattleReport {
  result: ReportResult;
  /** "vs Galatae raiders". */
  vs: string;
  /** Seconds of battle. */
  duration: number;
  kills: number;
  enemyTotal: number;
  losses: number;
  gold: number;
  /** Duels: Glory earned (shown instead of gold). */
  glory?: number;
  xp: number;
  mvp: HeroLine | null;
  heroes: HeroLine[];
  loot: Item[];
  /** How many loot items the player may pick (0: none, or already in the stash). */
  picks: number;
  /** Online: the loot was already put into the stash by the server. */
  lootInStash: boolean;
  /** Online battles: the server's replay check (null offline). */
  verified: boolean | null;
  online: 'attack' | 'duel' | null;
  /** Extra lines (siege progress, "hex taken", friendly duel). */
  notes: string[];
}

/** Per-unit numbers of a finished battle. */
export function unitStats(sim: Battle): UnitStat[] {
  return sim.units.map((u) => ({
    heroId: u.heroId,
    side: u.side,
    kills: u.kills,
    dmg: Math.round(u.dmgDealt),
    dead: u.state === 'dead',
    ko: u.ko,
    killedBy: u.killedBy,
  }));
}

/** The hero of the battle: most kills, then most damage; nobody if no one struck a blow. */
export function pickMvp(lines: readonly HeroLine[]): HeroLine | null {
  let best: HeroLine | null = null;
  for (const l of lines) {
    if (l.kills <= 0 && l.dmg <= 0) continue;
    if (!best || l.kills > best.kills || (l.kills === best.kills && l.dmg > best.dmg)) best = l;
  }
  return best;
}

/** "1:05" (minutes and seconds). */
export interface ReportInput {
  result: ReportResult;
  vs: string;
  ticks: number;
  side: Side;
  stats: readonly UnitStat[];
  /** The player's heroes as they went into battle (portraits, level before). */
  heroes: readonly Hero[];
  /** What the rules applied to them (absent for a friendly duel). */
  outcomes?: readonly HeroResult[];
  gold?: number;
  /** Duels pay Glory instead of gold: the report shows a Glory tile. */
  glory?: number;
  loot?: Item[];
  picks?: number;
  lootInStash?: boolean;
  verified?: boolean | null;
  online?: 'attack' | 'duel' | null;
  notes?: string[];
}

export function buildReport(i: ReportInput): BattleReport {
  const mine = i.stats.filter((s) => s.side === i.side);
  const foes = i.stats.filter((s) => s.side !== i.side);
  const byId = new Map(i.heroes.map((h) => [h.id, h]));
  const outById = new Map<string, HeroResult>();
  const outByName = new Map<string, HeroResult>();
  for (const o of i.outcomes ?? []) {
    if (o.heroId) outById.set(o.heroId, o);
    else outByName.set(o.name, o);
  }
  const heroes: HeroLine[] = mine.map((s) => {
    const h = byId.get(s.heroId) ?? null;
    const name = h?.name ?? s.heroId;
    const o = outById.get(s.heroId) ?? outByName.get(name);
    const died = o ? o.died : !!i.outcomes && s.dead && !s.ko;
    return {
      heroId: s.heroId,
      name,
      hero: h,
      kills: s.kills,
      dmg: s.dmg,
      died,
      wounded: !died && (o ? !!o.wounded : !!i.outcomes && s.ko),
      xp: died ? 0 : o?.xp ?? 0,
      levelBefore: o?.levelBefore ?? h?.level ?? 1,
      xpBefore: o?.xpBefore ?? h?.xp ?? 0,
      levelsGained: died ? 0 : o?.levelsGained ?? 0,
    };
  });
  // Order: the fallen last, otherwise by kills then damage.
  heroes.sort((a, b) => Number(a.died) - Number(b.died) || b.kills - a.kills || b.dmg - a.dmg);
  const kills = foes.filter((s) => s.dead && s.killedBy === i.side).length;
  const losses = heroes.filter((h) => h.died).length;
  return {
    result: i.result,
    vs: i.vs,
    duration: Math.round(i.ticks / TICK_RATE),
    kills,
    enemyTotal: foes.length,
    losses,
    gold: i.gold ?? 0,
    ...(i.glory !== undefined ? { glory: i.glory } : {}),
    xp: heroes.reduce((a, h) => a + h.xp, 0),
    mvp: pickMvp(heroes),
    heroes,
    loot: i.loot ?? [],
    picks: Math.min(i.picks ?? 0, (i.loot ?? []).length),
    lootInStash: !!i.lootInStash,
    verified: i.verified ?? null,
    online: i.online ?? null,
    notes: i.notes ?? [],
  };
}

/** The result word for a winner seen from `side` (a retreat ordered by `side` is its own result). */
export function resultFor(winner: number, side: Side, retreated?: number | null): ReportResult {
  if (retreated === side) return 'retreat';
  return winner === side ? 'victory' : winner === -1 ? 'draw' : 'defeat';
}

/** Stats of the last battle the scene fought (online sources build their report from it). */
export const lastBattle: { stats: UnitStat[]; ticks: number; side: Side; heroes: Hero[] } = { stats: [], ticks: 0, side: 0, heroes: [] };
