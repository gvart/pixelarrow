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
import type { BridgeOrder, BuildingType, Order, RegionData, ResourceKind, WallOrder, WarBuildSim, WarSim } from '../types';

export type ToWorker =
  | { t: 'init'; region: RegionData; seed: number; sim: 'real' | 'fake' }
  | { t: 'spawn'; owner: string; team: number; cls: string; count: number; x: number; y: number; bot?: Behaviour }
  | { t: 'order'; o: Order }
  | { t: 'speed'; scale: number } // 0 pauses
  // economy (M2b, the real sim only): dev claims and stock, placement checks answered by `reply`
  | { t: 'claim'; team: number; x: number; y: number; r?: number }
  | { t: 'stock'; team: number; res: ResourceKind; n: number }
  | { t: 'prebuild'; team: number; max: number } // scenarios: build the team's sites before play (max 0: just step)
  | { t: 'mobs' } // neutral play: spawn the region's lairs
  | { t: 'skip'; ticks: number } // scenarios: step this many ticks at once
  | { t: 'damage'; id: number; dmg: number } // dev: damage a building (scripts: a breach)
  | { t: 'finishBridges'; team: number } // scenarios: standing bridges
  | { t: 'check'; id: number; team: number; type: BuildingType; x: number; y: number; rot: 0 | 1 }
  | { t: 'checkWall'; id: number; team: number; wall: Omit<WallOrder, 'kind' | 'squad'> }
  | { t: 'checkBridge'; id: number; team: number; bridge: Omit<BridgeOrder, 'kind' | 'squad'> };

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
  const b = build(s);
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
      if (p && b && !b.visibleTo(q.team, p.x, p.y)) continue; // fog (W-39): only what the team sees
      if (p && Math.hypot(p.x - me.x, p.y - me.y) < bd) { bd = Math.hypot(p.x - me.x, p.y - me.y); best = e.id; }
    }
    if (best >= 0) s.order({ kind: 'attack', squad: q.id, target: best });
  }
}

/**
 * Step the sim (and bots) up to `max` ticks at once: every 20 ticks each idle squad of `team` (see below) is sent to the
 * unfinished site of the team nearest it; stops when none is left. One snapshot is posted at the end.
 */
function prebuild(s: WarSim, team: number, max: number): void {
  for (let t = 0; t < max; t++) {
    s.step();
    brains!.tick();
    if (t % 20) continue;
    const snap = s.snapshot(), open = (snap.buildings ?? []).filter((b) => b.team === team && (b.state === 'foundation' || b.state === 'scaffold'));
    if (!open.length) break;
    const units = new Map(snap.units.map((u) => [u.id, u]));
    for (const q of snap.squads) {
      const us = q.units.map((id) => units.get(id)!).filter((v) => v && v.state !== 'dead'), u = us[0];
      // idle builders: not on a build order, or on one with nobody labouring, hauling or walking to it
      // (every 400 ticks all of them again: a squad can get stuck on a site it cannot reach)
      if (q.team !== team || !u || (t % 400 && q.order === 'build' && us.some((v) => v.state === 'build' || v.carry || v.state === 'move'))) continue;
      if (q.order === 'build') s.order({ kind: 'stopWork', squad: q.id });
      const site = open.reduce((a, b) => (Math.hypot(b.x - u.x, b.y - u.y) < Math.hypot(a.x - u.x, a.y - u.y) ? b : a));
      s.order({ kind: 'build', squad: q.id, site: site.id });
    }
  }
  tick();
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
  else if (m.t === 'mobs') build(sim)?.spawnMobs();
  else if (m.t === 'damage') build(sim)?.damageBuilding(m.id, m.dmg);
  else if (m.t === 'finishBridges') build(sim)?.finishBridges(m.team);
  else if (m.t === 'prebuild') prebuild(sim, m.team, m.max);
  else if (m.t === 'skip') { for (let i = 0; i < m.ticks; i++) { sim.step(); brains!.tick(); } tick(); }
  else if (m.t === 'check') postMessage({ reply: m.id, place: build(sim)?.checkPlacement(m.team, m.type, m.x, m.y, m.rot) ?? null });
  else if (m.t === 'checkWall') postMessage({ reply: m.id, wall: build(sim)?.checkWall(m.team, m.wall) ?? null });
  else if (m.t === 'checkBridge') postMessage({ reply: m.id, bridge: build(sim)?.checkBridge(m.team, m.bridge) ?? null });
  else if (m.t === 'speed') {
    clearInterval(timer);
    if (m.scale > 0) timer = setInterval(tick, 100 / m.scale) as unknown as number;
  }
};
