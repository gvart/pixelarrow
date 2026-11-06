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
import type { RegionData, Snapshot } from '../war/types';

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

export interface Trace { id: string; region: string; seed: number; cap: number; frames: ReturnType<typeof digest>[] }

export function trace(sc: Scenario): Trace {
  const seed = sc.seed ?? 1, sim = createSim(regionOf(sc), seed), bots = createBots(sim);
  applyScenario(headlessHost(sim, bots, CAP), sc);
  const frames = [digest(sim.snapshot())];
  for (let t = 1; t <= TICKS; t++) {
    stepSim(sim, bots);
    if (t % EVERY === 0) frames.push(digest(sim.snapshot()));
  }
  return { id: sc.id, region: sc.region ?? 'test-ridge', seed, cap: CAP, frames };
}

export const scenarioIds = (): string[] => SCENARIOS.map((s) => s.id);
export const traceById = (id: string): Trace => trace(SCENARIOS.find((s) => s.id === id)!);
