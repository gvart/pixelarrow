/**
 * Golden traces for the Godot port (docs/impl/godot-port.md P1): every catalogue scenario played headless as the
 * scenario tests play it (prebuilds capped, then 50 ticks), with a digest every 10 ticks. The GDScript sim replays the
 * same scenario and compares (within a float tolerance). Run through scripts/godot/traces.mjs.
 */
import { parseRegion } from '../war/region/schema';
import { SCENARIOS, type Scenario } from '../war/scenarios';
import { applyScenario, headlessHost, stepSim } from '../war/scenarios/run';
import { createSim } from '../war/sim';
import { createBots } from '../war/sim/bots';
import type { RegionData, Snapshot, WarBuildSim } from '../war/types';

const files = import.meta.glob('../war/regions/*.json', { eager: true, import: 'default' });
const parsed = new Map<string, RegionData>();
/** The scenario's region with its zones merged in (as tests/war/scenarioCatalogue.ts and ../war/view/main.ts do). */
function regionOf(sc: Scenario): RegionData {
  const id = sc.region ?? 'test-ridge';
  if (!parsed.has(id)) parsed.set(id, parseRegion(files[`../war/regions/${id}.json`]));
  const r = { ...parsed.get(id)! };
  if (sc.zones) for (const k of ['safe', 'yard', 'ambush'] as const) if (sc.zones[k]) r[k] = [...(r[k] ?? []), ...sc.zones[k]!];
  return r;
}

const r4 = (n: number) => +n.toFixed(4);
const digest = (s: Snapshot) => ({
  tick: s.tick,
  units: s.units.map((u) => [u.id, u.squad, r4(u.x), r4(u.y), r4(u.hp), u.state]),
  squads: s.squads.map((q) => [q.id, q.team, q.owner]),
  buildings: (s.buildings ?? []).map((b) => [b.id, b.type, b.team, b.state, r4(b.progress)]),
  stock: s.stock ?? {},
});

export const CAP = 40, TICKS = 50, EVERY = 10;

/** A setup call on the sim: [method, ...args] (trailing undefined args dropped). */
export type SetupOp = [string, ...unknown[]];
export interface Trace { id: string; region: string; seed: number; cap: number; setup: SetupOp[]; frames: ReturnType<typeof digest>[] }

/** The sim calls that change its state while a scenario is applied (snapshot reads are left out). */
const SETUP_CALLS = ['spawnSquad', 'order', 'step', 'claim', 'addStock', 'finishBridges', 'spawnCart', 'spawnMobs', 'spawnRoam', 'spawnSoul', 'setSatiety', 'hurtBoss'] as const;

/**
 * Records the outermost SETUP_CALLS made on `sim` into `ops` (a call the sim makes on itself, such as a mob spawn's
 * spawnSquad, is not recorded), so the Godot sim can replay the setup op for op. Returns the undo.
 */
function record(sim: WarBuildSim, ops: SetupOp[]): () => void {
  const api = sim as unknown as Record<string, (...a: unknown[]) => unknown>;
  const saved = SETUP_CALLS.map((n) => api[n]);
  let depth = 0;
  SETUP_CALLS.forEach((n, i) => {
    api[n] = (...a: unknown[]) => {
      if (!depth) {
        while (a.length && a[a.length - 1] === undefined) a.pop();
        ops.push([n, ...a.map((v) => (v && typeof v === 'object' ? structuredClone(v) : v))]);
      }
      depth++;
      try {
        return saved[i](...a);
      } finally {
        depth--;
      }
    };
  });
  return () => SETUP_CALLS.forEach((n, i) => (api[n] = saved[i]));
}

/** Scenario sc applied (its setup recorded) and played `ticks` ticks, digested by `dig` at the start and every `every` ticks. */
export function play<D>(sc: Scenario, ticks: number, every: number, dig: (s: Snapshot) => D) {
  const seed = sc.seed ?? 1, sim = createSim(regionOf(sc), seed), bots = createBots(sim), setup: SetupOp[] = [];
  const undo = record(sim, setup);
  applyScenario(headlessHost(sim, bots, CAP), sc);
  undo();
  const frames = [dig(sim.snapshot())];
  for (let t = 1; t <= ticks; t++) {
    stepSim(sim, bots);
    if (t % every === 0) frames.push(dig(sim.snapshot()));
  }
  return { id: sc.id, region: sc.region ?? 'test-ridge', seed, cap: CAP, setup, frames };
}

export const trace = (sc: Scenario): Trace => play(sc, TICKS, EVERY, digest);

export const scenarioIds = (): string[] => SCENARIOS.map((s) => s.id);
export const traceById = (id: string): Trace => trace(SCENARIOS.find((s) => s.id === id)!);
