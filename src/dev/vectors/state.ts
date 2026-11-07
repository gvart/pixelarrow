/**
 * Sim saves (src/war/sim/state.ts, the sim's exportState / importState) for the C++ port: a spread of scenarios (moves,
 * fights, works, siege, civilians and trade, the wild, guardians, landmarks, towns) and host runs, each played to tick
 * `at` (after its setup), where the TS save is taken; then a fresh TS sim imports that save and plays on, digested
 * exactly every EVERY ticks up to MORE ticks past `at` (godot/tests/sim/test_state.gd checks the C++ save at `at` against
 * the TS one byte for byte, a C++ sim loaded from the TS save against the digests, and a C++ save and load round trip).
 * Bots are not saved: the loaded run plays on without them, on both sides. The saves go gzipped (base64): a save is
 * mostly its grid's sectors, about 1.5 MB as text.
 */
import { SCENARIOS } from '../../war/scenarios';
import { createSim } from '../../war/sim';
import type { WarBuildSim } from '../../war/types';
import { play } from '../godotTraces';
import { exact, HOST } from './sim';

const AT = 150, MORE = 150, EVERY = 25, CAP = 1500;

/** The runs: scenario ids, or host run ids (./sim.ts HOST). */
const RUNS = [
  'move-woods', 'combat-flank', 'brawl-600', 'eco-wood', 'build-wall-gate', 'siege', 'siege-defend', 'civ-household', 'crafting',
  'eco-trade', 'world-fill', 'boss-griffin', 'landmark-temple', 'trailer-elaia-raid', 'warlord-hall', 'peace-town-level', 'host-chief',
  'host-named-soul',
];

/** Gzip and base64 through Node's zlib (these vectors are made under Node only; the app has no Node types). */
type Zlib = { gzipSync(b: Uint8Array, o: { level: number }): { toString(enc: 'base64'): string } };
const zlib = () => (globalThis as unknown as { process: { getBuiltinModule(id: 'node:zlib'): Zlib } }).process.getBuiltinModule('node:zlib');
const gz = (s: string) => zlib().gzipSync(new TextEncoder().encode(s), { level: 9 }).toString('base64');

export function run(id: string) {
  const h = HOST.find((x) => x.id === id);
  const sc = SCENARIOS.find((s) => s.id === (h ? h.of : id))!;
  let save = '', frames: unknown[] = [], same = true, calls = 0, tick = 0;
  const trace = play(sc, AT, AT, (s, sim) => {
    if (calls++ === 0) return 0; // the frame after the setup
    tick = s.tick;
    save = JSON.stringify(sim.exportState());
    // the loaded copy plays on (no bots); so does the original, which it must match step for step
    const b: WarBuildSim = createSim(sim.region, (JSON.parse(save) as { seed: number }).seed);
    b.importState(JSON.parse(save));
    frames = [];
    for (let t = 0; t <= MORE; t++) {
      if (t) (sim.step(), b.step());
      if (t % EVERY) continue;
      const d = exact(b.snapshot(), b), o = exact(sim.snapshot(), sim);
      if (JSON.stringify(d) !== JSON.stringify(o)) same = false;
      frames.push(d);
    }
    return 0;
  }, CAP, h?.host);
  if (!same) throw new Error(`state vectors: ${id} loaded from its save does not play on as the original`);
  const { frames: _f, ...rest } = trace;
  return { ...rest, id, tick, save: gz(save), size: save.length, frames };
}

export const vectors = () => ({ runs: RUNS.map(run) });
