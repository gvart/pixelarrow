/**
 * M5c power curve (docs/WAR.md "Anti-oversaturation"): a max squad (L10 elite, legendary tier-3 kit, two skills, its
 * active used by its bot) of N beats N fresh trained soldiers of the family, and wins at most 35% against 2N.
 * WAR_BALANCE_SEEDS=200 npx vitest run tests/war/balance.test.ts for the full run (default 16 seeds).
 */
import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/war/sim';
import { createBots } from '../../src/war/sim/bots';
import { makePerson } from '../../src/war/sim/roster';
import { SQUAD_MAX } from '../../src/war/sim/soldiers';
import { flat } from './flatRegion';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const SEEDS = Number(env.WAR_BALANCE_SEEDS ?? 16);
const N = SQUAD_MAX;

/** Does the max squad of `elite` win against `foes` squads of N fresh `cls`? */
function fight(seed: number, elite: string, cls: string, foes: number): boolean {
  const sim = createSim(flat(64), seed);
  const bots = createBots(sim);
  const vets = Array.from({ length: N }, (_, k) => makePerson(`m${k}`, elite, { level: 10, tier: 2, rarity: 'legendary' }));
  const me = sim.spawnSquad('max', 0, elite, N, 32, 18, vets);
  bots.set(me, { kind: 'attackMove', x: 32, y: 46 });
  const them: number[] = [];
  for (let k = 0; k < foes; k++) {
    const x = foes === 1 ? 32 : 26 + 12 * k;
    const id = sim.spawnSquad('fresh', 1, cls, N, x, 46);
    bots.set(id, { kind: 'attackMove', x: 32, y: 18 });
    them.push(id);
  }
  const alive = (ids: number[]) => {
    const snap = sim.snapshot();
    let n = 0;
    for (const id of ids) for (const u of snap.squads[id].units) if (snap.units[u].state !== 'dead') n++;
    return n;
  };
  for (let t = 0; t < 4000; t++) {
    sim.step();
    bots.tick();
    if (t % 25 === 0 && (!alive([me]) || !alive(them))) break;
  }
  return alive([me]) > 0 && alive(them) === 0;
}

describe.each([
  ['line', 'royal_guard', 'hoplite'],
  ['shock', 'rhomphaia', 'celt_sword'],
  ['missile', 'archer', 'archer'],
])('M5c balance: %s', (_family, elite, cls) => {
  it(`a max squad of N beats N fresh, and wins <= 35% vs 2N (${SEEDS} seeds)`, () => {
    let vsN = 0, vs2N = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      if (fight(seed, elite, cls, 1)) vsN++;
      if (fight(seed, elite, cls, 2)) vs2N++;
    }
    console.log(`balance ${elite} vs ${cls}: vs N ${vsN}/${SEEDS}, vs 2N ${vs2N}/${SEEDS}`);
    expect(vsN / SEEDS).toBeGreaterThanOrEqual(0.8);
    expect(vs2N / SEEDS).toBeLessThanOrEqual(0.35);
  });
});
