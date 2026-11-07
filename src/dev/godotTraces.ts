/**
 * Golden traces for the Godot port (docs/impl/godot-port.md P1): every catalogue scenario played headless as the
 * scenario tests play it (prebuilds capped, then 50 ticks), with a digest every 10 ticks. The GDScript sim replays the
 * same scenario and compares (within a float tolerance). Run through scripts/godot/traces.mjs.
 */
import { parseRegion } from '../war/region/schema';
import { SCENARIOS, type Scenario } from '../war/scenarios';
import { applyScenario, headlessHost, stepSim } from '../war/scenarios/run';
import { createSim } from '../war/sim';
import { createBots, type Bots } from '../war/sim/bots';
import type { RegionData, Snapshot, TeamBonus, WarBuildSim, WarPerson } from '../war/types';
import { NO_PATH, type PlayerPath } from '../war/world/start';
import { createWarlords, type WarlordNote, type Warlords } from '../war/sim/warlords';

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

/**
 * A setup call on the sim: [method, ...args] (trailing undefined args dropped); ['bot', squad, behaviour] a bot set on a
 * squad; ['feed', team, squad | null, res, n] the scenario's food put in packs or a store (../war/scenarios/run.ts feedSim).
 */
export type SetupOp = [string, ...unknown[]];
export interface Trace { id: string; region: string; seed: number; cap: number; zones?: Scenario['zones']; setup: SetupOp[]; frames: ReturnType<typeof digest>[] }

/** The sim calls that change its state while a scenario is applied (snapshot reads are left out). */
const SETUP_CALLS = ['spawnSquad', 'order', 'step', 'claim', 'addStock', 'finishBridges', 'spawnCart', 'spawnMobs', 'spawnRoam', 'spawnSoul', 'setSatiety', 'hurtBoss'] as const;

/**
 * Records the outermost SETUP_CALLS made on `sim` into `ops` (a call the sim makes on itself, such as a mob spawn's
 * spawnSquad, is not recorded), and each bot set on a squad, so the Godot sim can replay the setup op for op. Returns the undo.
 */
function record(sim: WarBuildSim, bots: Bots, ops: SetupOp[]): () => void {
  const api = sim as unknown as Record<string, (...a: unknown[]) => unknown>;
  const saved = SETUP_CALLS.map((n) => api[n]);
  const set = bots.set;
  bots.set = (squad, b) => {
    ops.push(['bot', squad, structuredClone(b)]);
    set(squad, b);
  };
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
  return () => {
    SETUP_CALLS.forEach((n, i) => (api[n] = saved[i]));
    bots.set = set;
  };
}

/**
 * A host call the scenarios never make, played on the sim and recorded as its setup op: ['setPaths', {owner: PlayerPath}]
 * (any other owner: NO_PATH), ['setBonus', team, bonus], ['spawnNamedSoul', person, life, bar?]; any other op is a
 * recorded sim call made as is (spawnSquad with persons, order...).
 */
export function hostOp(sim: WarBuildSim, setup: SetupOp[], op: SetupOp): void {
  const [n, ...a] = op;
  if (n === 'setPaths') {
    const paths = a[0] as Record<string, PlayerPath>;
    setup.push(['setPaths', structuredClone(paths)]);
    sim.setPaths((owner) => paths[owner] ?? NO_PATH);
  } else if (n === 'setBonus') {
    setup.push(['setBonus', a[0], structuredClone(a[1])]);
    sim.setBonus(a[0] as number, a[1] as TeamBonus);
  } else if (n === 'spawnNamedSoul') {
    setup.push(['spawnNamedSoul', ...a.filter((v) => v !== undefined).map((v) => (v && typeof v === 'object' ? structuredClone(v) : v))]);
    sim.spawnNamedSoul(a[0] as WarPerson, a[1] as number, a[2] as { owner: string; ticks: number } | undefined);
  } else (sim as unknown as Record<string, (...x: unknown[]) => unknown>)[n](...a);
}

/**
 * Host calls around a scenario: `pre` before it is applied, `post` after (both recorded in its setup); a post entry may be
 * a function of the sim as it stands then (a squad or soul id read off it), giving the ops to make.
 */
export interface HostOps { pre?: SetupOp[]; post?: (SetupOp | ((sim: WarBuildSim) => SetupOp[]))[] }

/**
 * Scenario sc applied (its setup recorded; at most `cap` ticks a prebuild or skip) and played `ticks` ticks, digested by
 * `dig` at the start and every `every` ticks. `lords`: the scenario's warlords run as the sandbox runs them
 * (../war/view/worker.ts: created with seed 1 on 'warlords', recorded as ['warlords', age, players, raid | null]; each
 * tick after the sim and its bots on that tick's snapshot), each frame with their notes since the last and their snaps.
 */
export function play<D>(sc: Scenario, ticks: number, every: number, dig: (s: Snapshot, sim: WarBuildSim) => D, cap = CAP, host: HostOps = {}, lords = false) {
  const seed = sc.seed ?? 1, sim = createSim(regionOf(sc), seed), bots = createBots(sim), setup: SetupOp[] = [];
  const undo = record(sim, bots, setup);
  for (const op of host.pre ?? []) hostOp(sim, setup, op);
  // W-60 food goes into packs and stores straight through sim.cargo (feedSim): recorded as one ['feed', team, squad, res, n]
  const h = headlessHost(sim, bots, cap), feed = h.feed;
  h.feed = (team, squad, res, n) => {
    setup.push(['feed', team, squad, res, n]);
    feed(team, squad, res, n);
  };
  let L: Warlords | null = null;
  const notes: WarlordNote[] = [];
  if (lords) h.startWarlords = (age, players, raid) => {
    setup.push(['warlords', age, players, raid ?? null]);
    L = createWarlords(sim.region, sim, bots, 1);
    L?.setAge(age);
    L?.setPlayers(players);
    if (raid !== undefined) L?.raidNow(raid * 10);
  };
  applyScenario(h, sc);
  for (const op of host.post ?? []) for (const o of typeof op === 'function' ? op(sim) : [op]) hostOp(sim, setup, o);
  undo();
  const frame = (s: Snapshot) => (lords ? { ...dig(s, sim), lords: { notes: notes.splice(0), snaps: L ? (L as Warlords).snaps() : [], men: L ? (L as Warlords).men() : 0 } } : dig(s, sim));
  const frames = [frame(sim.snapshot())];
  for (let t = 1; t <= ticks; t++) {
    stepSim(sim, bots);
    if (L) notes.push(...(L as Warlords).tick(sim.snapshot()));
    if (t % every === 0) frames.push(frame(sim.snapshot()));
  }
  // zones: merged into the region's meta by the replay, as regionOf merges them
  return { id: sc.id, region: sc.region ?? 'test-ridge', seed, cap, ...(sc.zones ? { zones: sc.zones } : {}), setup, frames };
}

export const trace = (sc: Scenario): Trace => play(sc, TICKS, EVERY, digest);

export const scenarioIds = (): string[] => SCENARIOS.map((s) => s.id);
export const traceById = (id: string): Trace => trace(SCENARIOS.find((s) => s.id === id)!);
