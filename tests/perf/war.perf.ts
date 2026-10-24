// War sim time budgets (npm run perf:war, vitest.perf.config.ts). Kept out of `npm test`: wall-clock
// numbers depend on the machine and its load, so the correctness suite never asserts them. Each budget
// is the median of REPEATS fresh, seeded runs, each measured after a warm-up, so one slow sample (GC,
// a busy core) does not fail it. Run on a quiet machine.
import { describe, expect, it } from 'vitest';
import type { ClassId } from '../../src/data/classes';
import { CIV_CLASS_IDS } from '../../src/data/classes';
import ridgeJson from '../../src/war/regions/test-ridge.json';
import { parseRegion } from '../../src/war/region/schema';
import { createSim } from '../../src/war/sim';
import { warStatsOf } from '../../src/war/sim/classes';
import { makePerson } from '../../src/war/sim/roster';
import { FAMILY_OF } from '../../src/war/sim/skills';
import type { RegionData, WarBuildSim } from '../../src/war/types';
import { flat } from '../war/flatRegion';

const REPEATS = 5;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Median over REPEATS of `sample()`, after one discarded warm-up sample (JIT); logs every sample. */
function measure(name: string, sample: () => number): number {
  sample();
  const xs = Array.from({ length: REPEATS }, sample);
  const m = median(xs);
  console.log(`${name}: median ${m.toFixed(2)} ms  [${xs.map((x) => x.toFixed(2)).join(', ')}]`);
  return m;
}

/** Mean sim step time over `ticks` steps, after `warm` unmeasured ones. */
function stepMs(sim: WarBuildSim, ticks: number, warm: number): number {
  for (let t = 0; t < warm; t++) sim.step();
  const ms: number[] = [];
  for (let t = 0; t < ticks; t++) (sim.step(), ms.push(sim.stats().stepMs));
  return mean(ms);
}

function run(sim: WarBuildSim, n: number, until?: () => boolean): void {
  for (let t = 0; t < n; t++) {
    sim.step();
    if (until?.()) return;
  }
}

describe('war sim budgets', () => {
  it('baking 600 persons stays well inside one region join (< 200 ms)', () => {
    const classes = Object.keys(FAMILY_OF) as ClassId[];
    const ps = classes.flatMap((cls, i) => Array.from({ length: 34 }, (_, k) => makePerson(`${i}-${k}`, cls, { level: 1 + (k % 10), tier: k % 3, rarity: 'epic' }))).slice(0, 600);
    expect(measure('bake 600 persons', () => {
      const t0 = performance.now();
      for (const p of ps) warStatsOf(p);
      return performance.now() - t0;
    })).toBeLessThan(200);
  });

  it('60 civilians at work beside 540 soldiers: step < 8 ms', () => {
    const setup = () => {
      const sim = createSim(flat(160), 3);
      sim.claim(0, 40, 40, 40);
      sim.claim(1, 120, 120, 40);
      const s0 = sim.spawnSquad('a', 0, 'militia', 12, 44, 44);
      sim.order({ kind: 'placeBuilding', squad: s0, type: 'camp', x: 40, y: 40 });
      run(sim, 1500, () => sim.snapshot().buildings!.find((b) => b.id === 0)?.state === 'done');
      sim.addStock(0, 'food', 1e5);
      sim.addStock(0, 'wood', 1e5);
      for (let k = 0; k < 5; k++) {
        const c = sim.spawnSquad('a', 0, CIV_CLASS_IDS[k % 4 === 3 ? 4 : k % 4], 12, 34 + k * 3, 48);
        sim.order({ kind: 'civWork', squad: c, building: 0 });
      }
      for (let k = 0; k < 44; k++) {
        const side = k % 2, x = 100 + (k % 11) * 4, y = side ? 60 : 30;
        const id = sim.spawnSquad(`p${k}`, side, ['militia', 'hoplite', 'archer'][k % 3], 12, x, y);
        sim.order({ kind: 'attackMove', squad: id, x, y: side ? 30 : 60 });
      }
      return sim;
    };
    expect(measure('civilians + 540 soldiers step', () => stepMs(setup(), 350, 50))).toBeLessThan(8);
  });

  it('test-ridge mobs against four squads: step < 8 ms', () => {
    const ridge = parseRegion(ridgeJson);
    const setup = () => {
      const sim = createSim(ridge, 1);
      sim.spawnMobs();
      const cp = ridge.claimPoints![0];
      for (let k = 0; k < 4; k++) {
        const s = sim.spawnSquad('you', 0, k % 2 ? 'archer' : 'hoplite', 20, cp.x + k * 3, cp.y + 4);
        const l = ridge.lairs![cp.lairs[k % cp.lairs.length]];
        sim.order({ kind: 'move', squad: s, x: l.x, y: l.y });
      }
      return sim;
    };
    expect(measure('test-ridge mobs step', () => stepMs(setup(), 550, 50))).toBeLessThan(8);
  });

  it('20 builders on two wooden bridges: step < 2 ms', () => {
    const river = (): RegionData => {
      const w = 40, h = 32, n = w * h;
      const r: RegionData = { id: 'r', name: 'r', w, h, height: Array(n).fill(1), terrain: Array(n).fill('grass'), water: Array(n).fill(0), entries: [], noBuild: [] };
      for (let y = 0; y < h; y++) for (let x = 15; x < 23; x++) (r.water[y * w + x] = 2, r.height[y * w + x] = 0);
      return r;
    };
    const setup = () => {
      const sim = createSim(river(), 7);
      sim.claim(0, 8, 16, 14);
      sim.addStock(0, 'wood', 400);
      sim.addStock(0, 'stone', 600);
      const s = sim.spawnSquad('a', 0, 'militia', 20, 9, 22);
      sim.order({ kind: 'placeBuilding', squad: s, type: 'camp', x: 6, y: 16 });
      run(sim, 1500, () => sim.snapshot().buildings![0].state === 'done');
      sim.order({ kind: 'placeBridge', squad: s, material: 'wood', points: [12.5, 6.5, 26.5, 6.5] });
      sim.order({ kind: 'placeBridge', team: 0, material: 'wood', points: [12.5, 24.5, 26.5, 24.5] });
      return sim;
    };
    expect(measure('bridge builders step', () => stepMs(setup(), 2500, 0))).toBeLessThan(2);
  });
});
