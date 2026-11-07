/**
 * Sim saves (src/war/sim/state.ts, the sim's exportState / importState) for the C++ port: a spread of scenarios (moves,
 * fights, works, siege, civilians and trade, the wild, guardians, landmarks, towns) and host runs, each played to tick
 * `at` (AT, or its own, after its setup), where the TS save is taken; then a fresh TS sim imports that save and plays on, digested
 * exactly every EVERY ticks up to MORE ticks past `at` (godot/tests/sim/test_state.gd checks the C++ save at `at` against
 * the TS one byte for byte, a C++ sim loaded from the TS save against the digests, and a C++ save and load round trip).
 * Bots are not saved: the loaded run plays on without them, on both sides. The saves go gzipped (base64): a save is
 * mostly its grid's sectors, about 1.5 MB as text.
 */
import { SCENARIOS } from '../../war/scenarios';
import { createSim } from '../../war/sim';
import type { WarBuildSim } from '../../war/types';
import { play, type HostOps } from '../godotTraces';
import { exact, HOST } from './sim';

const AT = 150, MORE = 150, EVERY = 25, CAP = 1500;

/** The runs: scenario ids, or host run ids (./sim.ts HOST, SAVE_HOST below). */
const RUNS = [
  'move-woods', 'combat-flank', 'brawl-600', 'eco-wood', 'build-wall-gate', 'siege', 'siege-defend', 'civ-household', 'crafting',
  'eco-trade', 'world-fill', 'boss-griffin', 'landmark-temple', 'trailer-elaia-raid', 'warlord-hall', 'peace-town-level', 'host-chief',
  'host-named-soul', 'host-down', 'host-raids', 'host-craft',
];

/**
 * Host runs for saves only, each saved at `at` (default AT) with `cap` ticks of prebuild (default CAP): a man knocked
 * down by the wolves of test-ridge at the save (he gets up after it); a camp site felled (raid `fallen`) and the done
 * camp raided just before the save (its cooldown); forge orders (a craft under way, a repair, a salvage) and a bandage.
 */
const SAVE_HOST: { id: string; of: string; at?: number; cap?: number; host: HostOps }[] = [
  { id: 'host-down', of: 'neutral-clear', host: { post: [(sim) => {
    const l = sim.snapshot().lairs!.find((x) => x.kind === 'wolf')!;
    return [['spawnSquad', 'lone', 0, 'archer', 1, l.x, l.y + 6]];
  }] } },
  { id: 'host-raids', of: 'civ-flee', at: 250, host: { post: [
    ['order', { kind: 'placeBuilding', squad: 0, type: 'camp', x: 330.5, y: 346.5 }], ['step'],
    ['order', { kind: 'move', squad: 0, x: 320, y: 320 }], ['spawnSquad', 'foe', 1, 'hoplite', 12, 330, 356],
    (sim) => {
      const s = sim.snapshot();
      return [['order', { kind: 'attackBuilding', squad: s.squads.length - 1, building: s.buildings!.find((b) => b.type === 'camp' && b.state !== 'done')!.id }]];
    },
  ] } },
  { id: 'host-craft', of: 'crafting', cap: 12000, host: { post: [
    ['order', { kind: 'craft', team: 0, building: 1, recipe: 'item:xiphos' }],
    ['order', { kind: 'repair', team: 0, building: 1, owner: 'you', item: { uid: 'w1', def: 'xiphos', rarity: 'common', cond: 30 } }],
    ['order', { kind: 'salvage', team: 0, building: 1, owner: 'you', item: { uid: 'w2', def: 'xiphos', rarity: 'common', cond: 60 } }],
    ['order', { kind: 'craft', team: 0, building: 3, recipe: 'bandage' }],
  ] } },
];

/** Gzip and base64 through Node's zlib (these vectors are made under Node only; the app has no Node types). */
type Zlib = { gzipSync(b: Uint8Array, o: { level: number }): { toString(enc: 'base64'): string } };
const zlib = () => (globalThis as unknown as { process: { getBuiltinModule(id: 'node:zlib'): Zlib } }).process.getBuiltinModule('node:zlib');
const gz = (s: string) => zlib().gzipSync(new TextEncoder().encode(s), { level: 9 }).toString('base64');

export function run(id: string) {
  const h: { of: string; at?: number; cap?: number; host: HostOps } | undefined = HOST.find((x) => x.id === id) ?? SAVE_HOST.find((x) => x.id === id);
  const sc = SCENARIOS.find((s) => s.id === (h ? h.of : id))!, at = h?.at ?? AT;
  let save = '', frames: unknown[] = [], same = true, calls = 0, tick = 0;
  const trace = play(sc, at, at, (s, sim) => {
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
  }, h?.cap ?? CAP, h?.host);
  if (!same) throw new Error(`state vectors: ${id} loaded from its save does not play on as the original`);
  const { frames: _f, ...rest } = trace;
  return { ...rest, id, tick, save: gz(save), size: save.length, frames };
}

export const vectors = () => ({ runs: RUNS.map(run) });
