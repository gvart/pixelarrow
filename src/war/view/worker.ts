/// <reference lib="webworker" />
/**
 * Runs the WarSim off the main thread at 10 Hz (times the dev time scale) and posts a Snapshot
 * every tick. A spawn may carry a bot Behaviour (../sim/bots.ts, scenarios); other squads spawned
 * with owner `bot` get a trivial brain: attack the nearest enemy squad.
 * `sim: 'fake'` (sandbox.html?sim=fake) runs the straight-line stand-in for comparison.
 */
import { createSim as createFakeSim } from '../fake/sim';
import { createSim } from '../sim';
import { createBots, type Behaviour, type Bots } from '../sim/bots';
import type { BuildingType, Order, RegionData, ResourceKind, WallOrder, WarBuildSim, WarSim } from '../types';

export type ToWorker =
  | { t: 'init'; region: RegionData; seed: number; sim: 'real' | 'fake' }
  | { t: 'spawn'; owner: string; team: number; cls: string; count: number; x: number; y: number; bot?: Behaviour }
  | { t: 'order'; o: Order }
  | { t: 'speed'; scale: number } // 0 pauses
  // economy (M2b, the real sim only): dev claims and stock, placement checks answered by `reply`
  | { t: 'claim'; team: number; x: number; y: number; r?: number }
  | { t: 'stock'; team: number; res: ResourceKind; n: number }
  | { t: 'check'; id: number; team: number; type: BuildingType; x: number; y: number; rot: 0 | 1 }
  | { t: 'checkWall'; id: number; team: number; wall: Omit<WallOrder, 'kind' | 'squad'> };

/** Ticks between resource node posts (amounts change slowly). */
const NODES_EVERY = 10;

let sim: WarSim | null = null;
let brains: Bots | null = null;
const scripted = new Set<number>();
let timer = 0;
let inflSent = -1;
const build = (s: WarSim | null): WarBuildSim | null => (s && 'checkPlacement' in s ? (s as WarBuildSim) : null);

function tick(): void {
  if (!sim) return;
  sim.step();
  brains!.tick();
  const snap = sim.snapshot();
  if (snap.tick % 20 === 0) bots(sim, snap);
  // the influence mask when it changed, the resource nodes now and then (the economy view, ./build)
  const b = build(sim), infl = b && snap.influenceVersion !== inflSent ? b.influence() : null;
  if (infl) inflSent = infl.version;
  const nodes = b && snap.tick % NODES_EVERY === 0 ? b.resourceNodes() : undefined;
  postMessage({ snap, stats: sim.stats(), nodes, influence: infl ? { ...infl, mask: infl.mask.slice() } : undefined });
}

function bots(s: WarSim, snap: ReturnType<WarSim['snapshot']>): void {
  const units = new Map(snap.units.map((u) => [u.id, u]));
  const at = (ids: number[]) => {
    const u = units.get(ids[0]);
    return u ? { x: u.x, y: u.y } : null;
  };
  for (const q of snap.squads) {
    if (q.owner !== 'bot' || q.order === 'attack' || scripted.has(q.id)) continue;
    const me = at(q.units);
    if (!me) continue;
    let best = -1, bd = Infinity; // squad ids start at 0
    for (const e of snap.squads) {
      const p = e.team !== q.team && at(e.units);
      if (p && Math.hypot(p.x - me.x, p.y - me.y) < bd) { bd = Math.hypot(p.x - me.x, p.y - me.y); best = e.id; }
    }
    if (best >= 0) s.order({ kind: 'attack', squad: q.id, target: best });
  }
}

onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if (m.t === 'init') {
    sim = (m.sim === 'fake' ? createFakeSim : createSim)(m.region, m.seed);
    brains = createBots(sim);
    tick();
  } else if (!sim) return;
  else if (m.t === 'spawn') {
    const id = sim.spawnSquad(m.owner, m.team, m.cls, m.count, m.x, m.y);
    if (m.bot) { brains!.set(id, m.bot); scripted.add(id); }
  }
  else if (m.t === 'order') sim.order(m.o);
  else if (m.t === 'claim') { build(sim)?.claim(m.team, m.x, m.y, m.r); }
  else if (m.t === 'stock') build(sim)?.addStock(m.team, m.res, m.n);
  else if (m.t === 'check') postMessage({ reply: m.id, place: build(sim)?.checkPlacement(m.team, m.type, m.x, m.y, m.rot) ?? null });
  else if (m.t === 'checkWall') postMessage({ reply: m.id, wall: build(sim)?.checkWall(m.team, m.wall) ?? null });
  else if (m.t === 'speed') {
    clearInterval(timer);
    if (m.scale > 0) timer = setInterval(tick, 100 / m.scale) as unknown as number;
  }
};
