/// <reference lib="webworker" />
/**
 * Runs the WarSim off the main thread at 10 Hz (times the dev time scale) and posts a Snapshot
 * every tick. Squads spawned with `bot` get a trivial brain: attack the nearest enemy squad.
 */
import { createSim } from '../fake/sim'; // swap for '../sim' once M1a lands
import type { Order, RegionData, WarSim } from '../types';

export type ToWorker =
  | { t: 'init'; region: RegionData; seed: number }
  | { t: 'spawn'; owner: string; team: number; cls: string; count: number; x: number; y: number }
  | { t: 'order'; o: Order }
  | { t: 'speed'; scale: number }; // 0 pauses

let sim: WarSim | null = null;
let timer = 0;

function tick(): void {
  if (!sim) return;
  sim.step();
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
    if (q.owner !== 'bot' || q.order === 'attack') continue;
    const me = at(q.units);
    if (!me) continue;
    let best = 0, bd = Infinity;
    for (const e of snap.squads) {
      const p = e.team !== q.team && at(e.units);
      if (p && Math.hypot(p.x - me.x, p.y - me.y) < bd) { bd = Math.hypot(p.x - me.x, p.y - me.y); best = e.id; }
    }
    if (best) s.order({ kind: 'attack', squad: q.id, target: best });
  }
}

onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if (m.t === 'init') { sim = createSim(m.region, m.seed); tick(); }
  else if (!sim) return;
  else if (m.t === 'spawn') sim.spawnSquad(m.owner, m.team, m.cls, m.count, m.x, m.y);
  else if (m.t === 'order') sim.order(m.o);
  else if (m.t === 'speed') {
    clearInterval(timer);
    if (m.scale > 0) timer = setInterval(tick, 100 / m.scale) as unknown as number;
  }
};
