/**
 * Module vectors for the Godot port (docs/impl/godot-port.md P4..P6): inputs and the TS outputs per sim module, so each
 * GDScript module is checked on its own long before whole-scenario traces (./godotTraces.ts) can match.
 * Run through scripts/godot/traces.mjs (written to godot/tests/golden/vectors/<module>.json with exact floats, ./godotJson.ts).
 */
import { hashString, Rng } from '../sim/rng';

const SEEDS = [0, 1, 7, 42, 0x9e3779b9, 0xffffffff, 123456789];

function rng() {
  return {
    seeds: SEEDS.map((seed) => {
      const r = new Rng(seed), next = Array.from({ length: 64 }, () => r.next());
      const ints = Array.from({ length: 32 }, () => r.int(-5, 17));
      const ranges = Array.from({ length: 16 }, () => r.range(-2.5, 9));
      const chances = Array.from({ length: 16 }, () => r.chance(0.3));
      const picks = Array.from({ length: 16 }, () => r.pick(['a', 'b', 'c', 'd', 'e']));
      const weighted = Array.from({ length: 16 }, () => r.weighted([['x', 1], ['y', 3], ['z', 0.5]] as const));
      const shuffled = r.shuffle(Array.from({ length: 20 }, (_, i) => i));
      return { seed, state: r.state, next, ints, ranges, chances, picks, weighted, shuffled };
    }),
    hashes: ['', 'a', 'dodona:1:warlords', 'kyrene-e:42:boar:900:lord', 'Ελαία', 'emoji 🐗 boar'].map((s) => [s, hashString(s)]),
  };
}

export const vectors = (): Record<string, unknown> => ({ rng: rng() });
