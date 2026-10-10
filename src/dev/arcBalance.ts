/**
 * Campaign arc balance (headless): the rows of design/gdd/campaign-arc.md
 * "Balance targets". `npm run balance` prints them.
 *
 * AR-01 (the opening, R1): the 8-man starter army against a bandit band of
 * the start's danger (0.1-0.3), both sides bot-driven on a campaign
 * battlefield, the way a first campaign battle is set up
 * (src/game/campaignBattle.ts campaignSetup). For comparison, the old
 * three-man start against the old bandit size (3 + ...), and the five
 * volunteers a destroyed army gets. Bands that are a beast (src/game/beasts.ts
 * bandBeast) are left out: the rows measure men against men.
 * Lair assaults and the host come with AR-02 and AR-04.
 */
import type { BalanceRow } from './balance';
import { armySpec } from '../game/armySpec';
import { bandBeast } from '../game/beasts';
import { makeHero, openingParty, starterParty, type IdSource } from '../game/heroes';
import type { Hero } from '../data/units';
import { Battle } from '../sim/battle';
import { Rng } from '../sim/rng';
import { heroPower } from '../sim/stats';
import { generateBattlefield, randomSite } from '../world/battlefield';
import { BANDIT_MIN, VOLUNTEER_RULES, partyArmy, threatLevel, type PartyState } from '../world/world';

/** The start's danger band (the "even" plate of the GDD target) and the day of the first fights. */
export const OPENING_DANGER = { min: 0.1, max: 0.3, day: 2 };

export type OpeningArmy = 'opening' | 'old3' | 'volunteers';

export interface OpeningFight {
  won: boolean;
  lost: boolean;
  /** Band power over the army's (heroPower sums). */
  ratio: number;
  bandSize: number;
}

/** A bandit band of the start, sized like World.spawnParty with `min` as the smallest band (BANDIT_MIN; 3 before AR-01). */
export function openingBand(seed: number, min = BANDIT_MIN): PartyState {
  const r = new Rng(seed ^ 0x2545f491);
  const danger = r.range(OPENING_DANGER.min, OPENING_DANGER.max);
  let bandSeed = (r.next() * 4294967296) >>> 0 || 1;
  while (bandBeast(bandSeed)) bandSeed = (bandSeed * 2654435761 + 1) >>> 0 || 1;
  return {
    id: 1, kind: 'bandits', name: 'Bandits', culture: r.pick(['greek', 'phoenician', 'celtic'] as const), x: 0, y: 0,
    size: Math.min(18, min + Math.round(danger * 5) + r.int(0, 2)), power: 0,
    level: Math.min(8, 1 + Math.round(danger * 2 + OPENING_DANGER.day * 0.04)), tier: danger > 0.7 ? 2 : 1,
    seed: bandSeed, home: 0, mode: 'wander', tx: 0, ty: 0, idle: 0,
  };
}

function army(kind: OpeningArmy, rng: Rng, ids: IdSource): Hero[] {
  if (kind === 'opening') return openingParty(rng, ids);
  if (kind === 'old3') return starterParty(rng, ids);
  const out: Hero[] = [];
  for (let i = 0; i < VOLUNTEER_RULES.destroyed; i++) out.push(makeHero(rng, ids, 'greek', 'raw', 1, 1, i < 3 ? 0 : 1, out));
  return out;
}

/** One opening battle: `kind` army (bot-driven) against a start bandit band (smallest `min` men) on a campaign battlefield. */
export function runOpening(seed: number, kind: OpeningArmy = 'opening', min = kind === 'old3' ? 3 : BANDIT_MIN): OpeningFight {
  const ids = { nextId: 1 };
  const mine = army(kind, new Rng(seed), ids);
  const band = partyArmy(openingBand(seed, min), ids);
  const terrain = generateBattlefield(seed, randomSite(new Rng(seed ^ 0x51735c1)));
  const b = new Battle({ seed, armies: [armySpec(mine, true), { ...armySpec(band.heroes, true), doctrine: band.doctrine }], terrain });
  b.startBattle();
  for (let i = 0; i < b.timeLimitTicks + 10 && b.phase !== 'ended'; i++) b.step();
  const power = (hs: Hero[]) => hs.reduce((a, h) => a + heroPower(h), 0);
  return { won: b.winner === 0, lost: b.winner === 1, ratio: power(band.heroes) / power(mine), bandSize: band.heroes.length };
}

const pct = (k: number, n: number) => `${Math.round((100 * k) / Math.max(1, n))}%`;

/** The fights, the band's mean size and power ratio, and the win rate, as a row. */
function rowOf(label: string, r: OpeningFight[], target: string): BalanceRow {
  const n = r.length;
  const ratio = r.reduce((a, x) => a + x.ratio, 0) / Math.max(1, n);
  const size = r.reduce((a, x) => a + x.bandSize, 0) / Math.max(1, n);
  return { label: `${label} (${n} fights, band ${size.toFixed(1)} men, x${ratio.toFixed(2)})`, measured: pct(r.filter((x) => x.won).length, n), target };
}

/**
 * `n` = seeds per row. The GDD target row is the opening against the bands
 * of the start's danger whose plate reads Even (threatLevel 2, power x0.85-1.15);
 * the next row is every band of that danger (mostly the Weaker plate).
 */
export function arcRows(n: number): BalanceRow[] {
  const seeds = (k: number) => Array.from({ length: k }, (_, i) => 7000 + i);
  const opening = seeds(n * 2).map((s) => runOpening(s, 'opening'));
  return [
    rowOf('8-man opening vs Even-plate bandits, danger 0.1-0.3', opening.filter((x) => threatLevel(x.ratio) === 2), '55-70% (R1)'),
    rowOf('8-man opening vs any bandits, danger 0.1-0.3', opening, 'none (Weaker plate mostly)'),
    rowOf('before: 3-man start vs 3+ bandits', seeds(n).map((s) => runOpening(s, 'old3')), 'none (reference)'),
    rowOf('5 volunteers (destroyed army) vs bandits', seeds(n).map((s) => runOpening(s, 'volunteers')), 'none stated'),
  ];
}
