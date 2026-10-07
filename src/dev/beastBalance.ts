/**
 * Beast balance (part of `npm run balance`): every mythical beast against a
 * level-appropriate army of a sensible composition (its counters) and of a
 * naive one (what the beast punishes), both bot-driven, many seeds.
 * Target: sensible ~45-60% wins, naive much lower.
 */
import { armySpec } from '../game/armySpec';
import { makeHero } from '../game/heroes';
import { Battle, TICK_RATE } from '../sim/battle';
import { Rng } from '../sim/rng';
import type { FormationType } from '../sim/formation';
import type { ClassId } from '../data/classes';
import type { Hero } from '../data/units';
import { ENCOUNTERS, LAIR_BEASTS, lairLevel, mythHeroes, type EncounterId } from '../data/beasts';

/** [class, count, group]: group 0 main, 1 skirmish, 2 reserve, 3 flank. */
export type Comp = { units: [ClassId, number, number][]; formations: FormationType[] };

const F = (main: FormationType, skirm: FormationType = 'skirmish', res: FormationType = 'line', flank: FormationType = 'column'): FormationType[] => [main, skirm, res, flank];

/** The armies each beast is tested against (the sensible one follows the beast's counters). */
export const BEAST_COMPS: Record<EncounterId, { good: Comp; naive: Comp }> = {
  // heads in front: a spear line holds them while blades on the flank hit the body and seal the stumps
  hydra: {
    good: { units: [['hoplite', 4, 0], ['archer', 3, 1], ['rhomphaia', 3, 3], ['falx', 2, 2]], formations: F('shieldwall', 'skirmish', 'line', 'line') },
    naive: { units: [['archer', 6, 1], ['slinger', 6, 1]], formations: F('line') },
  },
  // spread out: loose order and missiles; never a packed phalanx
  cyclops: {
    good: { units: [['javelineer', 4, 1], ['archer', 4, 1], ['peltast', 2, 3], ['thureophoros', 2, 0]], formations: F('skirmish', 'skirmish', 'skirmish', 'skirmish') },
    naive: { units: [['hoplite', 12, 0]], formations: F('shieldwall') },
  },
  // massed missiles shoot them down as they dive; spears guard the archers
  harpies: {
    good: { units: [['archer', 4, 1], ['slinger', 3, 1], ['hoplite', 3, 0]], formations: F('line', 'line') },
    naive: { units: [['gallic', 6, 0], ['archer', 2, 1], ['militia', 2, 0]], formations: F('line', 'skirmish') },
  },
  // blades only, in close order: no man alone for it to pounce on
  nemean_lion: {
    good: { units: [['hoplite', 4, 0], ['thureophoros', 3, 0], ['rhomphaia', 3, 0]], formations: F('line') },
    naive: { units: [['archer', 5, 1], ['slinger', 3, 1], ['javelineer', 2, 1]], formations: F('line', 'skirmish') },
  },
  // braced spears stop the charge; blades on its flank
  minotaur: {
    good: { units: [['hoplite', 6, 0], ['falx', 2, 3], ['archer', 2, 1]], formations: F('shieldwall', 'skirmish', 'line', 'line') },
    naive: { units: [['archer', 4, 1], ['peltast', 3, 3], ['gallic', 3, 0]], formations: F('line', 'skirmish', 'line', 'column') },
  },
  // loose ranks against the fire, a shield wall facing it, missiles from the sides
  chimera: {
    good: { units: [['hoplite', 4, 0], ['javelineer', 4, 1], ['archer', 2, 1], ['peltast', 2, 3]], formations: F('shieldwall', 'skirmish', 'line', 'skirmish') },
    naive: { units: [['militia', 6, 0], ['gallic', 6, 0]], formations: F('column') },
  },
  kraken: {
    good: { units: [['hoplite', 6, 0], ['rhomphaia', 4, 3], ['archer', 6, 1], ['falx', 4, 2]], formations: F('shieldwall', 'skirmish', 'line', 'line') },
    naive: { units: [['militia', 20, 0]], formations: F('column') },
  },
  titan: {
    good: { units: [['javelineer', 6, 1], ['archer', 6, 1], ['peltast', 4, 3], ['thureophoros', 4, 0]], formations: F('skirmish', 'skirmish', 'skirmish', 'skirmish') },
    naive: { units: [['hoplite', 20, 0]], formations: F('shieldwall') },
  },
};

export function compHeroes(comp: Comp, level: number, seed: number, tier = 2): Hero[] {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const out: Hero[] = [];
  for (const [cls, n, group] of comp.units) for (let i = 0; i < n; i++) out.push(makeHero(rng, ids, 'greek', cls, level, tier, group, out));
  return out;
}

export interface BeastRun {
  won: boolean;
  seconds: number;
  /** Fraction of the beast's HP taken (all bodies and parts). */
  dealt: number;
  dead: number;
}

/** One beast battle at a tier (both sides bot-driven). */
export function runBeast(enc: EncounterId, kind: 'good' | 'naive', seed: number, tier = 3): BeastRun {
  const level = lairLevel(enc, tier);
  const comp = BEAST_COMPS[enc][kind];
  const heroes = compHeroes(comp, Math.max(1, level - 1), seed ^ 0x3c3c, tier >= 4 ? 3 : 2);
  const beast = mythHeroes(enc, level);
  const b = new Battle({ seed, armies: [armySpec(heroes, true, comp.formations), armySpec(beast, true)] });
  b.startBattle();
  for (let i = 0; i < b.timeLimitTicks + 10 && b.phase !== 'ended'; i++) {
    b.step();
    b.drainEvents();
  }
  let max = 0;
  let left = 0;
  for (const u of b.units) {
    if (u.side !== 1) continue;
    max += u.stats.maxHp;
    left += Math.max(0, u.hp);
  }
  return { won: b.winner === 0, seconds: b.tick / TICK_RATE, dealt: 1 - left / Math.max(1, max), dead: b.units.filter((u) => u.side === 0 && u.state === 'dead').length };
}

export function beastReport(n = 40): string {
  const lines: string[] = [`Beasts (tier 3 lair, ${n} seeds each; army = ${'beast level - 1'}, bot-driven)`];
  lines.push('  beast         sensible win  naive win   sensible median s  dmg dealt (sensible / naive)');
  for (const enc of LAIR_BEASTS) {
    const g = Array.from({ length: n }, (_, i) => runBeast(enc, 'good', 7000 + i));
    const v = Array.from({ length: n }, (_, i) => runBeast(enc, 'naive', 7000 + i));
    const pct = (r: BeastRun[]) => `${Math.round((100 * r.filter((x) => x.won).length) / r.length)}%`.padStart(4);
    const med = (r: BeastRun[]) => [...r.map((x) => x.seconds)].sort((a, c) => a - c)[Math.floor(r.length / 2)].toFixed(0);
    const dmg = (r: BeastRun[]) => `${Math.round((100 * r.reduce((a, x) => a + x.dealt, 0)) / r.length)}%`;
    lines.push(`  ${ENCOUNTERS[enc].id.padEnd(13)} ${pct(g).padEnd(13)} ${pct(v).padEnd(11)} ${med(g).padEnd(18)} ${dmg(g)} / ${dmg(v)}`);
  }
  return lines.join('\n');
}
