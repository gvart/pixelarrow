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
import type { Order, RegionData, WarSim } from '../types';

export type ToWorker =
  | { t: 'init'; region: RegionData; seed: number; sim: 'real' | 'fake' }
  | { t: 'spawn'; owner: string; team: number; cls: string; count: number; x: number; y: number; bot?: Behaviour }
  | { t: 'order'; o: Order }
  | { t: 'speed'; scale: number }; // 0 pauses

let sim: WarSim | null = null;
let brains: Bots | null = null;
const scripted = new Set<number>();
let timer = 0;

function tick(): void {
  if (!sim) return;
  sim.step();
  brains!.tick();
  const snap = sim.snapshot();
  if (snap.tick % 20 === 0) bots(sim, snap);
  postMessage({ snap, stats: sim.stats() });
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
  else if (m.t === 'speed') {
    clearInterval(timer);
    if (m.scale > 0) timer = setInterval(tick, 100 / m.scale) as unknown as number;
  }
};
