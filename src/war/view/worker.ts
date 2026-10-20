/// <reference lib="webworker" />
/**
 * Runs the WarSim off the main thread at 10 Hz (times the dev time scale) and posts a Snapshot
 * every tick. A spawn may carry a bot Behaviour (../sim/bots.ts, scenarios); other squads spawned
 * with owner `bot` get a trivial brain: attack the nearest enemy squad.
 * `sim: 'fake'` (sandbox.html?sim=fake) runs the straight-line stand-in for comparison.
 * `net` (sandbox.html?net=ws://localhost:8787/ws/war/test-ridge, or /ws/war/test-ridge through the vite proxy; M3): no
 * local sim, the worker plays on the live region (WarRegionDO) through ../net/client.ts and posts its decoded snapshots instead.
 * Spawns join with the dev player's persisted soldiers (M5e; `seed=1` in the net URL re-seeds his roster).
 */
import { createSim as createFakeSim } from '../fake/sim';
import { createSim } from '../sim';
import { bossPile } from '../sim/bossLoot';
import { createBots, type Behaviour, type Bots } from '../sim/bots';
import { createNet, type Net } from '../net/client';
import { MAX_SQUAD, type HandoffMsg, type StowMsg } from '../net/protocol';
import { decodeInfluence, unpackNode } from '../net/economy';
import type { BridgeOrder, BuildingType, InfluenceMap, NodeSnap, Order, RegionData, Snapshot, ResourceKind, WallOrder, WarBuildSim, WarPerson, WarSim } from '../types';

export type ToWorker =
  | { t: 'init'; region: RegionData; seed: number; sim: 'real' | 'fake'; net?: string; dev?: number }
  | { t: 'view'; x0: number; y0: number; x1: number; y1: number } // camera rect in tiles (net mode: interest management)
  | { t: 'spawn'; owner: string; team: number; cls: string; count: number; x: number; y: number; bot?: Behaviour; persons?: WarPerson[] }
  | { t: 'devSpawn'; team: number; cls: string; count: number; x: number; y: number } // dev panel: a squad at a point (net mode: the server's dev spawn)
  | { t: 'order'; o: Order }
  | { t: 'speed'; scale: number } // 0 pauses
  // economy (M2b, the real sim only): dev claims and stock, placement checks answered by `reply`
  | { t: 'claim'; team: number; x: number; y: number; r?: number }
  | { t: 'stock'; team: number; res: ResourceKind; n: number }
  | { t: 'prebuild'; team: number; max: number } // scenarios: build the team's sites before play (max 0: just step)
  | { t: 'mobs' } // neutral play: spawn the region's lairs
  | { t: 'hurtBoss'; boss: string; to: number; part?: number } // M7d dev and scenarios: a guardian (or its part: a head) down to a share of its hp
  | { t: 'takeRegion'; team: number } // M7g dev and scripts: every claim point to the team (a landmark takes its capture damage)
  | { t: 'skip'; ticks: number } // scenarios: step this many ticks at once
  | { t: 'damage'; id: number; dmg: number } // dev: damage a building (scripts: a breach)
  | { t: 'finishBridges'; team: number } // scenarios: standing bridges
  | { t: 'cart'; team: number; owner: string; type: 'handcart' | 'wagon'; x: number; y: number } // scenarios (M6k): a ready cart
  | { t: 'check'; id: number; team: number; type: BuildingType; x: number; y: number; rot: 0 | 1 }
  | { t: 'checkWall'; id: number; team: number; wall: Omit<WallOrder, 'kind' | 'squad'> }
  | { t: 'checkBridge'; id: number; team: number; bridge: Omit<BridgeOrder, 'kind' | 'squad'> }
  // M5g persons (the sandbox roster, ./hud/roster): end the fight (report by `reply`), a person changed off the field
  | { t: 'endFight'; id: number }
  | { t: 'person'; p: WarPerson }
  // M5h crafting, net mode only: a mend over the region socket, a war API call (answered by `reply` with `api`)
  | { t: 'mend'; kind: 'repair' | 'salvage'; building: number; uid: string }
  | { t: 'api'; id: number; method: 'GET' | 'POST'; path: string; body?: unknown }
  // M6f-g, net mode only: stow and the hand-off window over the region socket (answers come back as `server`)
  | { t: 'stow'; m: Omit<StowMsg, 't'> }
  | { t: 'handoff'; m: Omit<HandoffMsg, 't'> };

/** Ticks between resource node posts (amounts change slowly). */
const NODES_EVERY = 10;

let sim: WarSim | null = null;
let net: Net | null = null;
let brains: Bots | null = null;
const scripted = new Set<number>();
let timer = 0;
let inflSent = -1;
let fogSent = -1;
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
  // fog of war (W-39) of the player's team (0) when it changed: the grid and the foe buildings as last seen
  const g = b?.teamGrid(0), fog = g && g.version !== fogSent ? { ...g, state: g.state.slice() } : undefined;
  if (g) fogSent = g.version;
  // M5d event log (falls, captures, level-ups) when there is any
  const ev = b?.events();
  // M7d: a slain guardian's loot falls as a pile where it fell (the region room does this for the live game)
  for (const e of ev ?? []) if (e.kind === 'bossSlain' && b) {
    const p = bossPile(b.region.id, 'sandbox', e);
    b.dropPile(p.x, p.y, p.lots, p.items);
  }
  postMessage({ snap, stats: sim.stats(), events: ev?.length ? ev : undefined, nodes, influence: infl ? { ...infl, mask: infl.mask.slice() } : undefined, fog, seen: fog ? b!.lastSeen(0) : undefined });
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
  if (m.t === 'init' && m.net) {
    // M5e: `?net=/ws/war/test-ridge?seed=1` re-seeds the dev roster before joining (the server seeds one anyway when
    // fewer than a squad of soldiers are at home)
    const seed = /[?&]seed=1\b/.test(m.net), url = m.net.replace(/[?&]seed=1\b/, '');
    // the economy view (nodes, influence) rides on the next snapshot post, as the local sim's does
    const nodes = new Map<number, NodeSnap>();
    let nodesNew = false, infl: InfluenceMap | undefined, stock: Snapshot['stock'];
    net = createNet(url, m.region.id, m.dev, (snap, stats) => {
      postMessage({ snap: stock ? { ...snap, stock } : snap, stats, nodes: nodesNew ? [...nodes.values()] : undefined, influence: infl });
      nodesNew = false;
      infl = undefined;
    }, seed, (server) => {
      if (server.t === 'nodes') {
        for (const r of server.rows) nodes.set(r[0], unpackNode(r));
        for (const id of server.gone ?? []) nodes.delete(id);
        nodesNew = true;
      } else if (server.t === 'influence') infl = decodeInfluence(server.w, server.h, server.team, server.runs, server.v);
      else if (server.t === 'stock') stock = { [server.team]: server.goods };
      else postMessage({ server });
    });
    return;
  }
  if (net) return netMessage(net, m);
  if (m.t === 'init') {
    sim = (m.sim === 'fake' ? createFakeSim : createSim)(m.region, m.seed);
    brains = createBots(sim);
    tick();
  } else if (!sim) return;
  else if (m.t === 'devSpawn') sim.spawnSquad(m.team === 0 ? 'you' : 'bot', m.team, m.cls, m.count, m.x, m.y);
  else if (m.t === 'spawn') {
    const id = sim.spawnSquad(m.owner, m.team, m.cls, m.count, m.x, m.y, m.persons);
    if (m.bot) { brains!.set(id, m.bot); scripted.add(id); }
  }
  else if (m.t === 'order') sim.order(m.o);
  else if (m.t === 'claim') { build(sim)?.claim(m.team, m.x, m.y, m.r); }
  else if (m.t === 'stock') build(sim)?.addStock(m.team, m.res, m.n);
  else if (m.t === 'mobs') build(sim)?.spawnMobs();
  else if (m.t === 'hurtBoss') {
    const b = build(sim), g = b?.snapshot().bosses?.find((x) => x.id === m.boss);
    if (b && g && m.part !== undefined) b.hurtBoss(m.boss, 1e9, 'you', m.part);
    else if (b && g && g.hp > g.maxHp * m.to) b.hurtBoss(m.boss, g.hp - g.maxHp * m.to, 'you');
  }
  else if (m.t === 'takeRegion') {
    const b = build(sim);
    if (b) { const mem = b.memory(); mem.claims = mem.claims.map(() => m.team); b.recall(mem, 0); }
  }
  else if (m.t === 'damage') build(sim)?.damageBuilding(m.id, m.dmg);
  else if (m.t === 'finishBridges') build(sim)?.finishBridges(m.team);
  else if (m.t === 'cart') build(sim)?.spawnCart(m.team, m.owner, m.type, m.x, m.y);
  else if (m.t === 'prebuild') prebuild(sim, m.team, m.max);
  else if (m.t === 'skip') { for (let i = 0; i < m.ticks; i++) { sim.step(); brains!.tick(); } tick(); }
  else if (m.t === 'check') postMessage({ reply: m.id, place: build(sim)?.checkPlacement(m.team, m.type, m.x, m.y, m.rot) ?? null });
  else if (m.t === 'checkWall') postMessage({ reply: m.id, wall: build(sim)?.checkWall(m.team, m.wall) ?? null });
  else if (m.t === 'checkBridge') postMessage({ reply: m.id, bridge: build(sim)?.checkBridge(m.team, m.bridge) ?? null });
  else if (m.t === 'endFight') postMessage({ reply: m.id, report: build(sim)?.endFight() ?? null });
  else if (m.t === 'person') build(sim)?.setPerson(m.p);
  else if (m.t === 'speed') {
    clearInterval(timer);
    if (m.scale > 0) timer = setInterval(tick, 100 / m.scale) as unknown as number;
  }
};

/** Net mode: spawns become joins (the server places the squad on the alliance entry), every order (squad control,
 * work, building, walls, bridges, siege, actives) and the camera go up; placement checks are asked of the server for
 * our team (the server's answer comes back as the reply). The dev panel's claim, stock, squad and skip go up as dev
 * messages (DEV_AUTH servers only); the rest of the dev asks (damage, bosses, scenarios) have no live counterpart. */
function netMessage(n: Net, m: ToWorker): void {
  if (m.t === 'spawn') n.join(m.team, m.cls, m.count);
  else if (m.t === 'devSpawn') n.dev({ op: 'spawn', team: m.team, cls: m.cls, count: Math.min(m.count, MAX_SQUAD), x: m.x, y: m.y });
  else if (m.t === 'claim') n.dev({ op: 'claim', x: m.x, y: m.y, ...(m.r ? { r: m.r } : {}) });
  else if (m.t === 'stock' && m.n > 0) n.dev({ op: 'stock', res: m.res, n: m.n });
  else if (m.t === 'skip') for (let t = m.ticks; t > 0; t -= 600) n.dev({ op: 'skip', ticks: Math.min(600, t) });
  else if (m.t === 'order') n.order(m.o);
  else if (m.t === 'view') n.view(m.x0, m.y0, m.x1, m.y1);
  else if (m.t === 'check') n.check({ kind: 'building', type: m.type, x: m.x, y: m.y, rot: m.rot }, (r) => postMessage({ reply: m.id, place: r }));
  else if (m.t === 'checkWall') n.check({ kind: 'wall', ...m.wall }, (r) => postMessage({ reply: m.id, wall: r }));
  else if (m.t === 'checkBridge') n.check({ kind: 'bridge', ...m.bridge }, (r) => postMessage({ reply: m.id, bridge: r }));
  else if (m.t === 'endFight') postMessage({ reply: m.id, report: null });
  else if (m.t === 'mend') n.mend(m.kind, m.building, m.uid);
  else if (m.t === 'api') void n.api(m.method, m.path, m.body).then((api) => postMessage({ reply: m.id, api }));
  else if (m.t === 'stow') n.stow(m.m);
  else if (m.t === 'handoff') n.handoff(m.m);
}
