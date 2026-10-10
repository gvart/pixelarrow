/**
 * Campaign arc balance (headless): the rows of design/gdd/campaign-arc.md
 * "Balance targets". `npm run balance` prints them.
 *
 * AR-01 (the opening, R1): an army against a bandit band, both sides
 * bot-driven on a campaign battlefield, the way a campaign battle is set up
 * (src/game/campaignBattle.ts campaignSetup). Two kinds of band:
 *  - start: the bandit bands a new world really has (World.fresh). Bandits
 *    spawn at their lair, where danger is 0.66-1.0 on real maps.
 *  - gdd: the GDD's scenario, a band of danger 0.1-0.3 (which no lair has).
 * Armies: the 8-man opening, the old three-man start, and the five
 * volunteers of a destroyed army. Bands that are a beast (src/game/beasts.ts
 * bandBeast) are left out: the rows measure men against men.
 * Lair assaults and the host come with AR-02 and AR-04.
 */
import type { BalanceRow } from './balance';
import { armySpec } from '../game/armySpec';
import { bandBeast } from '../game/beasts';
import { Campaign } from '../game/campaign';
import { makeHero, openingParty, starterParty, type IdSource } from '../game/heroes';
import type { Hero } from '../data/units';
import { Battle } from '../sim/battle';
import { Rng } from '../sim/rng';
import { heroPower } from '../sim/stats';
import { generateBattlefield, randomSite } from '../world/battlefield';
import { BANDIT_MIN, VOLUNTEER_RULES, partyArmy, threatLevel, type PartyState } from '../world/world';

/** The GDD's "even" scenario: a band of danger 0.1-0.3, on the day of the first fights. */
export const GDD_DANGER = { min: 0.1, max: 0.3, day: 2 };

export type OpeningArmy = 'opening' | 'old3' | 'volunteers';

export interface OpeningFight {
  won: boolean;
  /** Band power over the army's (heroPower sums, as the map's plate). */
  ratio: number;
  bandSize: number;
}

/** A bandit band of danger 0.1-0.3, sized like World.spawnParty. */
export function gddBand(seed: number): PartyState {
  const r = new Rng(seed ^ 0x2545f491);
  const danger = r.range(GDD_DANGER.min, GDD_DANGER.max);
  let bandSeed = (r.next() * 4294967296) >>> 0 || 1;
  while (bandBeast(bandSeed)) bandSeed = (bandSeed * 2654435761 + 1) >>> 0 || 1;
  return {
    id: 1, kind: 'bandits', name: 'Bandits', culture: r.pick(['greek', 'phoenician', 'celtic'] as const), x: 0, y: 0,
    size: Math.min(18, BANDIT_MIN + Math.round(danger * 5) + r.int(0, 2)), power: 0,
    level: Math.min(8, 1 + Math.round(danger * 2 + GDD_DANGER.day * 0.04)), tier: 1,
    seed: bandSeed, home: 0, mode: 'wander', tx: 0, ty: 0, idle: 0,
  };
}

/** The bandit bands (not beasts) of a new campaign's world. */
export function startBands(seed: number): PartyState[] {
  return Campaign.fresh(seed).world.s.parties.filter((p) => p.kind === 'bandits' && !bandBeast(p.seed));
}

function army(kind: OpeningArmy, rng: Rng, ids: IdSource): Hero[] {
  if (kind === 'opening') return openingParty(rng, ids);
  if (kind === 'old3') return starterParty(rng, ids);
  const out: Hero[] = [];
  for (let i = 0; i < VOLUNTEER_RULES.destroyed; i++) out.push(makeHero(rng, ids, 'greek', 'raw', 1, 1, i < 3 ? 0 : 1, out));
  return out;
}

/** One battle: the `kind` army (bot-driven) against `band` on a campaign battlefield. */
export function runOpening(seed: number, band: PartyState, kind: OpeningArmy = 'opening'): OpeningFight {
  const ids = { nextId: 1 };
  const mine = army(kind, new Rng(seed), ids);
  const foe = partyArmy(band, ids);
  const terrain = generateBattlefield(seed, randomSite(new Rng(seed ^ 0x51735c1)));
  const b = new Battle({ seed, armies: [armySpec(mine, true), { ...armySpec(foe.heroes, true), doctrine: foe.doctrine }], terrain });
  b.startBattle();
  for (let i = 0; i < b.timeLimitTicks + 10 && b.phase !== 'ended'; i++) b.step();
  const power = (hs: Hero[]) => hs.reduce((a, h) => a + heroPower(h), 0);
  return { won: b.winner === 0, ratio: power(foe.heroes) / power(mine), bandSize: foe.heroes.length };
}

const pct = (k: number, n: number) => `${Math.round((100 * k) / Math.max(1, n))}%`;

function rowOf(label: string, r: OpeningFight[], target: string): BalanceRow {
  const n = r.length;
  const ratio = r.reduce((a, x) => a + x.ratio, 0) / Math.max(1, n);
  const size = r.reduce((a, x) => a + x.bandSize, 0) / Math.max(1, n);
  return { label: `${label} (${n} fights, band ${size.toFixed(1)} men, x${ratio.toFixed(2)})`, measured: pct(r.filter((x) => x.won).length, n), target };
}

/**
 * `n` sets the sample: n/4 new worlds (about two bandit bands each) and n GDD
 * bands. The GDD target is the 8-man opening against an Even plate
 * (threatLevel 2, power x0.85-1.15).
 */
export function arcRows(n: number): BalanceRow[] {
  const worlds = Math.max(4, Math.round(n / 4));
  const start: { seed: number; band: PartyState }[] = [];
  for (let s = 1; s <= worlds; s++) for (const band of startBands(s)) start.push({ seed: (band.seed ^ s) >>> 0 || 1, band });
  const gdd = Array.from({ length: n }, (_, i) => ({ seed: 7000 + i, band: gddBand(7000 + i) }));
  const run = (set: typeof start, kind: OpeningArmy) => set.map((x) => runOpening(x.seed, x.band, kind));
  const openStart = run(start, 'opening');
  const even = (r: OpeningFight[]) => r.filter((x) => threatLevel(x.ratio) === 2);
  return [
    rowOf('8-man opening vs start bandits', openStart, '55-70% (R1)'),
    rowOf('8-man opening vs start bandits, Even plate', even(openStart), '55-70% (R1)'),
    rowOf('8-man opening vs GDD bandits (danger 0.1-0.3)', run(gdd, 'opening'), 'none (no lair is this safe)'),
    rowOf('before: 3-man start vs start bandits', run(start, 'old3'), 'none (reference)'),
    rowOf('5 volunteers (destroyed army) vs start bandits', run(start, 'volunteers'), 'none stated'),
  ];
}
