/**
 * Works vectors (src/war/sim/works.ts) for the Godot port: the works run on real regions inside a small scripted fake
 * world. The world (squads of workers that walk straight at what work() asks, a fixed home each, a cart for one squad)
 * lives only here and in godot/native/src/works_probe.cpp, which mirrors it. Per tick the vectors carry:
 *  - `c`: the scripted calls (placement, walls, bridges, stores and the network, upgrades, stairs and ladders, fire,
 *    siege ladders, damage, demolish, cancel, repair, pre-built pieces, staffing, locks, queries) with their results;
 *  - `e`: every host call the works made, in order, with what the host answered (paths, chance rolls, hooks), and the
 *    grid tiles they marked dirty (logged and flushed before each path search and at the end of the tick);
 *  - `a`: what work() answered each worker; every 5 ticks `w`, the workers' state;
 *  - every `snapEvery` ticks and after any call but a staff scan, `s`: building and node snapshots, stocks, the cart, influence and sha256 digests
 *    of the grid layers the works edit.
 * The Godot side replays the calls and the host's answers and checks all the rest bit for bit.
 */
import { parseRegion } from '../../war/region/schema';
import { buildGrid, findPath, flushSectors, tileAt, type Grid } from '../../war/sim/grid';
import { createWorks, type CartDrop, type Piece, type Worker, type WorkSquad } from '../../war/sim/works';
import { loads, newHold, type Hold } from '../../war/sim/holders';
import { hashString, Rng } from '../../sim/rng';
import type { BuildingType, RegionData } from '../../war/types';

type Sha = (b: Uint8Array) => string;
type Call = [string, ...unknown[]];

const regionFiles = import.meta.glob('../../war/regions/*.json', { eager: true, import: 'default' });

const SPEED = 0.35; // tiles a tick a worker walks
const MOB = 7;

interface SquadDef { team: number; owner: string; node?: [number, number, string]; home: [number, number]; cart?: [number, number, number] }
interface WorkerDef { squad: number; at: [number, number]; wrate?: number; brate?: number; herbs?: boolean; flax?: boolean; gmul?: Record<string, number> }
/** A scripted step: the calls to make at tick `t` (built from the live state; `lab` holds named results). */
type Step = [number, (x: Ctx) => Call[]];
interface Ctx { lab: Record<string, unknown>; spot: (team: number, type: BuildingType, x: number, y: number, rot?: 0 | 1) => [number, number]; works: ReturnType<typeof createWorks>; region: RegionData; grid: Grid; ids: (k: string) => number[] }
interface Scenario { region: string; ticks: number; snapEvery: number; squads: SquadDef[]; workers: WorkerDef[]; men?: [number, number, number][]; immune?: number[]; steps: Step[] }

const holdSer = (h: Hold | null | undefined) => (h ? { lots: h.lots.map((l) => [l.r, l.n, l.o, l.s ?? null]), items: h.items.map((i) => i.uid) } : null);
const actSer = (a: [number, number] | null | 'here') => (a === null ? null : a === 'here' ? 'here' : [a[0], a[1]]);
const workerSer = (u: Worker) => [u.id, u.job, u.carry, u.load, u.wnode, u.wsite, u.wslot, u.wfor, u.working, u.wgx, u.wgy, u.wpi, u.wreq, u.facing, u.x, u.y, u.wpath.length, u.alive];
const lineSer = (b: NonNullable<Piece['bridge']>) => [b.axis, b.dir, b.width, b.part, b.deck, b.rows];

function run(sc: Scenario, sha: Sha) {
  const region: RegionData = parseRegion(regionFiles[`../../war/regions/${sc.region}.json`]);
  const grid = buildGrid(region), w = grid.w;
  const rng = new Rng(hashString(sc.region) + 11);
  let ev: unknown[] = [];
  const dirty = () => {
    if (!grid.dirty.length) return;
    ev.push(['dirty', [...grid.dirty]]);
    flushSectors(grid);
  };
  const squads: (WorkSquad & { home: [number, number]; cart: (CartDrop & { cap: number }) | null })[] = sc.squads.map((s) => ({
    team: s.team, owner: s.owner, sites: [], node: -1, home: s.home, cart: s.cart ? { x: s.cart[0], y: s.cart[1], hold: newHold(), room: 0, cap: s.cart[2] } : null,
  }));
  const workers: Worker[] = sc.workers.map((d, i) => ({
    id: 10 + i, x: d.at[0], y: d.at[1], facing: 0, alive: true, squad: squads[d.squad], job: null, carry: null, load: 0, wnode: -1, wsite: -1, wslot: -1, wfor: -1,
    working: false, wgx: -1, wgy: -1, wpath: [], wpi: 0, wreq: false,
    ...(d.gmul ? { gmul: d.gmul } : {}), ...(d.herbs ? { herbs: true } : {}), ...(d.flax ? { flax: true } : {}), ...(d.wrate ? { wrate: d.wrate } : {}), ...(d.brate ? { brate: d.brate } : {}),
  }));
  const immune = new Set(sc.immune ?? []);
  const works = createWorks(
    grid,
    region,
    (team, x0, y0, x1, y1) => {
      dirty();
      grid.team = team;
      const a = tileAt(grid, x0, y0), b = tileAt(grid, x1, y1);
      const tiles = a >= 0 && b >= 0 && grid.cost[a] > 0 && grid.cost[b] > 0 ? findPath(grid, a, b) : [];
      const pts: number[] = [];
      for (const t of tiles) pts.push((t % w) + 0.5, ((t / w) | 0) + 0.5);
      if (pts.length) (pts[pts.length - 2] = x1), (pts[pts.length - 1] = y1);
      ev.push(['path', team, x0, y0, x1, y1, pts]);
      return pts;
    },
    (tiles) => void ev.push(['evict', [...tiles]]),
    (p) => {
      const r = rng.chance(p);
      ev.push(['chance', p, r]);
      return r;
    },
    (tiles) => void ev.push(['fall', [...tiles]]),
    {
      spill: (x, y, hold, burnt) => void ev.push(['spill', x, y, holdSer(hold), burnt]),
      razed: (b, by) => void ev.push(['razed', b.id, by]),
      immune: (b) => {
        const r = immune.has(b.id);
        ev.push(['immune', b.id, r]);
        return r;
      },
      douse: (b) => {
        const r = b.id % 2 ? 1.5 : 1;
        ev.push(['douse', b.id, r]);
        return r;
      },
      laboured: (u, b, secs) => void ev.push(['lab', u.id, b.id, secs]),
      repairK: (b) => {
        const r = b.pre ? { speed: 1.25, cost: 0.8 } : { speed: 1, cost: 1 };
        ev.push(['repairK', b.id, r.speed, r.cost]);
        return r;
      },
      cartDrop: (s) => {
        const q = squads.indexOf(s as (typeof squads)[number]), c = squads[q].cart;
        if (!c) {
          ev.push(['cart', q, null]);
          return null;
        }
        c.room = c.cap - loads(c.hold);
        ev.push(['cart', q, c.x, c.y, c.room]);
        return c;
      },
    },
  );
  works.setTies((owner, other) => owner === 'b' && other === 'c');

  const lab: Record<string, unknown> = {};
  const ids = (k: string) => (Array.isArray(lab[k]) ? (lab[k] as number[]) : [lab[k] as number]);
  /** The nearest spot (integer centre, spiralling out) where `type` can go: the search itself has no visible effect. */
  const spot = (team: number, type: BuildingType, x: number, y: number, rot: 0 | 1 = 0): [number, number] => {
    for (let r = 0; r < 20; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (works.checkPlacement(team, type, x + dx, y + dy, rot).ok) return [x + dx, y + dy];
        }
    return [x, y];
  };
  const ctx: Ctx = { lab, spot, works, region, grid, ids };

  const call = ([name, ...a]: Call): unknown => {
    const n = (i: number) => a[i] as number;
    switch (name) {
      case 'label': return null;
      case 'prebuild': return void works.prebuild(n(0)), null;
      case 'claim': return void works.claim(n(0), n(1), n(2), n(3), a[4] as boolean), null;
      case 'addStock': return void works.addStock(n(0), a[1] as never, n(2), a[3] ? { x: (a[3] as number[])[0], y: (a[3] as number[])[1] } : undefined), null;
      case 'place': return works.place(n(0), a[1] as BuildingType, n(2), n(3), n(4) as 0 | 1, a[5] as string);
      case 'placeWall': return works.placeWall(n(0), a[1] as never);
      case 'placeBridge': return works.placeBridge(n(0), a[1] as never);
      case 'checkPlacement': { const r = works.checkPlacement(n(0), a[1] as BuildingType, n(2), n(3), n(4) as 0 | 1); return [r.ok, r.reason ?? null, r.tiles]; }
      case 'checkWall': { const r = works.checkWall(n(0), a[1] as never); return [r.ok, r.reason ?? null, r.pieces.map((p) => [p.type, p.tiles, p.ok, p.reason ?? null])]; }
      case 'checkBridge': { const r = works.checkBridge(n(0), a[1] as never); return [r.ok, r.reason ?? null, r.axis, r.dir, r.width, r.span, r.maxSpan, r.pieces.map((q) => [q.type, q.part, q.tiles, q.rows, q.ok])]; }
      case 'finishSite': return works.finishSite(n(0));
      case 'finishBridges': return void works.finishBridges(n(0)), null;
      case 'setJob': return void works.setJob(workers[n(0)], a[1] as 'gather' | 'build' | null), null;
      case 'release': return void works.release(workers[n(0)]), null;
      case 'sites': return void (squads[n(0)].sites = [...(a[1] as number[])]), null;
      case 'node': return void (squads[n(0)].node = n(1)), null;
      case 'kill': return void (workers[n(0)].alive = false), null;
      case 'cancel': return works.cancel(n(0));
      case 'demolish': return works.demolish(n(0), n(1));
      case 'upgrade': return works.upgrade(n(0), n(1));
      case 'mend': return works.mend(n(0), n(1));
      case 'rebuild': return works.rebuild(n(0), n(1), n(2));
      case 'damage': return void works.damage(n(0), n(1), n(2)), null;
      case 'kindle': return works.kindle(n(0), n(1));
      case 'fireHit': return void works.fireHit(n(0), n(1)), null;
      case 'douse': return works.douse(n(0), n(1));
      case 'fortify': return works.fortify(n(0), n(1), a[2] as 'ironGate' | 'wetHides');
      case 'raiseLadder': return works.raiseLadder(n(0), n(1), n(2), n(3), a[4] as 'ladder' | 'towerBridge');
      case 'ladderFoot': return works.ladderFoot(n(0), n(1), n(2));
      case 'push': return works.push(n(0), n(1));
      case 'setTeams': return void works.setTeams(a[0] as number[], n(1)), null;
      case 'setAccess': return works.setAccess(n(0), a[1] as string, (a[2] ?? undefined) as never, (a[3] ?? undefined) as number | undefined, (a[4] ?? undefined) as number | undefined);
      case 'liege': return void works.lieges.set(a[0] as string, { to: a[1] as string, pct: n(2) }), null;
      case 'payTill': return void works.payTill(n(0), a[1] as never, n(2), a[3] as string), null;
      case 'tillOf': return holdSer(works.tillOf(n(0)));
      case 'ownedHolds': return works.ownedHolds(a[0] as string).map(holdSer);
      case 'staffScan': return void works.staffScan([...workers.map((u) => ({ alive: u.alive, x: u.x, y: u.y, squad: { team: u.squad.team } })), ...(sc.men ?? []).map(([x, y, team]) => ({ alive: true, x, y, squad: { team } }))], n(0)), null;
      case 'breakLock': { const r = works.breakLock(n(0), n(1), n(2)); return [r.left, r.tell]; }
      case 'storeNet': return works.storeNet(n(0));
      case 'holdOf': return holdSer(works.holdOf(n(0)));
      case 'storeNear': return holdSer(works.storeNear(n(0), n(1), n(2), n(3)));
      case 'netAt': return works.netAt(n(0), n(1), n(2));
      case 'haveAt': return works.haveAt(n(0), n(1), n(2));
      case 'takeAt': return works.takeAt(n(0), n(1), n(2), a[3] as never);
      case 'addAt': return void works.addAt(n(0), n(1), n(2), a[3] as never, n(4)), null;
      case 'sourcesAt': return works.sourcesAt(n(0), n(1), n(2)).map(holdSer);
      case 'mayUse': { const b = works.piece(n(0))!; return works.mayUse(b, a[1] as string, n(2)); }
      case 'nodeOk': return works.nodeOk(n(0), n(1), a[2] as string);
      case 'lockNodes': return void works.lockNodes(a[0] as number[], a[1] as boolean), null;
      case 'siteOk': return works.siteOk(n(0), n(1));
      case 'perkSite': return void works.perkSite(n(0), n(1), n(2)), null;
      case 'dist2': return works.dist2(n(0), n(1), n(2));
      case 'nearestTile': return works.nearestTile(n(0), n(1), n(2));
      case 'workSpots': return works.workSpots(n(0));
      case 'ringPoints': return works.ringPoints(n(0), n(1), n(2), n(3));
      case 'fieldAt': return works.fieldAt(n(0))?.id ?? null;
      case 'onBuilding': return works.onBuilding(n(0));
      case 'bridgeAt': { const b = works.bridgeAt(n(0)); return b ? lineSer(b) : null; }
      case 'deckPoints': return works.deckPoints(n(0), n(1));
      case 'litNear': return works.litNear(n(0), n(1), n(2), n(3), (a[4] ?? undefined) as number | undefined);
      case 'pitch': return works.pitch(n(0), n(1), n(2));
      case 'platCap': return works.platCap(n(0));
      case 'near': return works.near(n(0), n(1), n(2));
      case 'setFallback': return void works.setFallback(n(0)), null;
      case 'fallback': return works.fallback();
      case 'resetLandmark': return void works.resetLandmark(), null;
      case 'landmarkCapture': return void works.landmarkCapture(n(0)), null;
      case 'landmarkRestore': return works.landmarkRestore(n(0), a[1] as never, n(2), n(3));
      case 'preRows': return works.preRows().map((r) => [r.i, r.hp, r.ruin, r.gone, r.team]);
      case 'loadPreRows': return void works.loadPreRows((a[0] as [number, number, boolean, boolean][]).map(([i, hp, ruin, gone]) => ({ i, hp, ruin, gone }))), null;
      case 'vanish': return void works.vanish(n(0)), null;
      case 'foul': return void works.foul(n(0), n(1), (a[2] ?? undefined) as number | undefined), null;
      case 'addItem': return void works.holdOf(n(0))!.items.push({ uid: a[1] as string, def: 'dory', rarity: 'common', cond: 100 }), null;
      case 'influence': return works.influence().version;
      default: throw new Error(`works vectors: no call ${name}`);
    }
  };

  const snap = () => ({
    b: works.buildingSnaps(),
    n: works.resourceNodes(),
    st: works.stockSnap(),
    cart: squads.map((s) => (s.cart ? holdSer(s.cart.hold) : null)),
    inf: [works.influence().version, sha(works.influence().mask)],
    g: Object.fromEntries((['cost', 'height', 'deck', 'gate', 'span', 'trench', 'narrow', 'plat', 'cartMul'] as const).map((k) => [k, sha(new Uint8Array(grid[k].buffer, grid[k].byteOffset, grid[k].byteLength))])),
  });

  const ticks: unknown[] = [];
  const steps = new Map<number, Step[1][]>();
  for (const [t, f] of sc.steps) steps.set(t, [...(steps.get(t) ?? []), f]);
  for (let t = 0; t < sc.ticks; t++) {
    ev = [];
    const c: unknown[] = [];
    for (const f of steps.get(t) ?? [])
      for (const k of f(ctx)) {
        const r = call(k);
        if (k[0] === 'label') lab[k[1] as string] = lab[k[2] as string];
        c.push([...k, r]);
        if (k[0] === 'place' || k[0] === 'placeWall' || k[0] === 'placeBridge' || k[0] === 'raiseLadder') lab.last = r;
      }
    works.tick();
    const acts: unknown[] = [];
    for (const u of workers) {
      if (!u.alive) {
        acts.push(null);
        continue;
      }
      const act = works.work(u);
      acts.push(actSer(act));
      if (act === 'here') continue;
      const [tx, ty] = act ?? (u.squad as (typeof squads)[number]).home;
      const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy);
      if (d <= SPEED) (u.x = tx), (u.y = ty);
      else (u.x += (dx / d) * SPEED), (u.y += (dy / d) * SPEED);
    }
    dirty();
    const rec: Record<string, unknown> = { t, a: acts };
    if (c.length) rec.c = c;
    if (ev.length) rec.e = ev;
    if (t % 5 === 0) rec.w = workers.map(workerSer);
    if (t % sc.snapEvery === 0 || c.some((k) => (k as Call)[0] !== 'staffScan') || t === sc.ticks - 1) rec.s = snap();
    ticks.push(rec);
  }
  return {
    region: sc.region, squads: sc.squads, men: sc.men ?? [], immune: sc.immune ?? [],
    workers: sc.workers.map((d) => ({ squad: d.squad, at: d.at, wrate: d.wrate ?? null, brate: d.brate ?? null, herbs: !!d.herbs, flax: !!d.flax, gmul: d.gmul ?? null })),
    ticks,
  };
}

const wallSegs = (x: Ctx, k: string, type: string) => x.ids(k).filter((id) => x.works.piece(id)?.type === type);
const tileOf = (x: Ctx, id: number, i = 0) => { const b = x.works.piece(id)!; return b.ti[i]; };
const nodeNear = (x: Ctx, res: string, px: number, py: number) => {
  let best = -1, bd = Infinity;
  for (const n of x.works.resourceNodes()) if (n.res === res && n.amount >= 1 && (n.x - px) ** 2 + (n.y - py) ** 2 < bd) (bd = (n.x - px) ** 2 + (n.y - py) ** 2), (best = n.id);
  return best;
};

/** Kimmeria: a west-bank base with a store network, gatherers (one squad on a cart), builders on walls, a bridge, field works, a kiln. */
const KIMMERIA: Scenario = {
  region: 'kimmeria', ticks: 1700, snapEvery: 40,
  squads: [
    { team: 0, owner: 'a', home: [90.5, 31.5], cart: [91.5, 33.5, 2] }, // 0: gatherers (wood), on a cart
    { team: 0, owner: 'a', home: [92.5, 28.5] }, // 1: builders
    { team: 0, owner: 'c', home: [86.5, 26.5] }, // 2: a stranger's foragers (the farm)
    { team: 1, owner: 'z', home: [400.5, 220.5] }, // 3: team 1 builders at the village
    { team: 0, owner: 'a', home: [90.5, 24.5] }, // 4: stone gatherers
  ],
  workers: [
    { squad: 0, at: [90.5, 31.5], wrate: 4 }, { squad: 0, at: [91.5, 31.5], wrate: 4, herbs: true }, { squad: 0, at: [89.5, 32.5], wrate: 3, gmul: { wood: 1.5 } },
    { squad: 1, at: [92.5, 28.5], brate: 6 }, { squad: 1, at: [93.5, 28.5], brate: 6 }, { squad: 1, at: [92.5, 29.5], brate: 5 }, { squad: 1, at: [93.5, 29.5], brate: 5 },
    { squad: 1, at: [94.5, 28.5], brate: 6 }, { squad: 1, at: [94.5, 29.5], brate: 4 },
    { squad: 2, at: [86.5, 26.5], wrate: 5, flax: true }, { squad: 2, at: [87.5, 26.5], wrate: 5 },
    { squad: 3, at: [400.5, 220.5], brate: 8 }, { squad: 3, at: [401.5, 220.5], brate: 8 },
    { squad: 4, at: [90.5, 24.5], wrate: 6 },
  ],
  men: [[412.5, 228.5, 1], [430.5, 253.5, 1], [96.5, 36.5, 0]],
  steps: [
    [0, (x) => [
      ['prebuild', 6], ['claim', 0, 92.5, 30.5, 26, false],
      ['addStock', 0, 'wood', 500, null], ['addStock', 0, 'stone', 300, null], ['addStock', 0, 'hides', 30, null], ['addStock', 0, 'iron', 20, null], ['addStock', 0, 'charcoal', 20, null],
      ['addStock', 1, 'wood', 300, null], ['addStock', 1, 'stone', 200, null], ['addStock', 0, 'food', -5, null],
      ['place', 0, 'camp', ...x.spot(0, 'camp', 92, 31), 0, ''], ['label', 'camp', 'last'],
    ]],
    [0, (x) => [
      ['finishSite', x.lab.camp], ['place', 0, 'storehouse', ...x.spot(0, 'storehouse', 84, 22), 0, ''], ['label', 'store', 'last'],
      ['checkBridge', 0, { material: 'wood', points: [106.5, 30.5, 121.5, 30.5], width: 2 }],
      ['placeBridge', 0, { material: 'wood', points: [106.5, 30.5, 121.5, 30.5], width: 2 }], ['label', 'bridge', 'last'],
      ['checkWall', 0, { material: 'wood', points: [78.5, 42.5, 104.5, 42.5], towers: [84.5, 42.5], gates: [95.5, 42.5] }],
      ['placeWall', 0, { material: 'wood', points: [78.5, 42.5, 104.5, 42.5], towers: [84.5, 42.5], gates: [95.5, 42.5] }], ['label', 'wall', 'last'],
      ['place', 0, 'stakes', ...x.spot(0, 'stakes', 100, 20), 0, ''], ['label', 'stakes', 'last'],
      ['place', 0, 'ditch', ...x.spot(0, 'ditch', 101, 20), 0, ''], ['label', 'ditch', 'last'],
      ['place', 0, 'pitchKiln', ...x.spot(0, 'pitchKiln', 86, 16), 0, ''], ['label', 'kiln', 'last'],
    ]],
    [0, (x) => [
      ['sites', 1, [x.lab.store, ...x.ids('bridge'), ...x.ids('wall'), x.lab.stakes, x.lab.ditch, x.lab.kiln]],
      ['node', 0, nodeNear(x, 'wood', 90, 31)], ['node', 4, nodeNear(x, 'stone', 90, 25)], ['node', 2, nodeNear(x, 'wood', 86, 26)],
      ...[0, 1, 2, 13].map((i): Call => ['setJob', i, 'gather']), ...[3, 4, 5, 6, 7, 8].map((i): Call => ['setJob', i, 'build']),
      // why sites cannot go: water, influence, a pre-built type, a lone wall piece, stairs with no wall, a brazier with no stock, slope or nodes
      ['checkPlacement', 0, 'camp', 113, 30, 0], ['checkPlacement', 0, 'camp', 250, 250, 0], ['checkPlacement', 0, 'house', 92, 31, 0],
      ['checkPlacement', 0, 'palisade', 92, 31, 0], ['checkPlacement', 0, 'woodStairs', 70, 30, 0], ['checkPlacement', 0, 'ladder', 70, 30, 0],
      ['checkPlacement', 3, 'brazier', 70, 30, 0], ['checkPlacement', 0, 'brazier', 70, 30, 0], ['checkPlacement', 0, 'farm', 0, 0, 1], ['checkPlacement', 0, 'storehouse', 92, 31, 1],
      ['checkBridge', 0, { material: 'wood', points: [106.5, 30.5, 112.5, 30.5] }], ['checkBridge', 0, { material: 'stone', points: [104.5, 31.5, 124.5, 33.5], width: 3 }],
      ['checkBridge', 0, { material: 'wood', points: [106.5, 30.5, 106.5, 31.5] }], ['checkBridge', 0, { material: 'wood', points: [100.5, 20.5, 125.5, 45.5], width: 1 }],
      ['checkBridge', 1, { material: 'wood', points: [106.5, 36.5, 121.5, 36.5] }], ['checkWall', 0, { material: 'stone', points: [60.5, 20.5] }],
      ['checkWall', 0, { material: 'timber', points: [70.5, 10.5, 70.5, 40.5], gates: [70.5, 40.5, 70.5, 39.5], towers: [70.5, 20.5, 70.5, 20.5], inside: [90, 25] }],
      ['netAt', 0, 92.5, 30.5], ['netAt', 1, 92.5, 30.5], ['haveAt', 0, 92.5, 30.5], ['storeNet', x.lab.camp], ['holdOf', x.lab.camp],
    ]],
    ...[...Array(85)].map((_, k): Step => [k * 20 + 1, () => [['staffScan', MOB]]]),
    [60, (x) => [['finishSite', x.lab.store], ['sourcesAt', 0, 84, 22], ['storeNear', 0, 84, 22, 10], ['addAt', 0, 84, 22, 'linen', 7]]],
    [200, (x) => [['finishSite', wallSegs(x, 'wall', 'woodTower')[0]], ['finishSite', wallSegs(x, 'wall', 'palisade')[0]], ['finishSite', wallSegs(x, 'wall', 'palisade')[1]]]],
    [260, (x) => {
      const seg = wallSegs(x, 'wall', 'palisade')[0], tw = wallSegs(x, 'wall', 'woodTower')[0];
      return [['upgrade', seg, 0], ['label', 'up', 'last'], ['siteOk', seg, 0], ['platCap', tw], ['deckPoints', tileOf(x, tw), 4], ['onBuilding', tileOf(x, tw)], ['litNear', 0, 85, 42, 3, null]];
    }],
    [261, (x) => [['sites', 1, [...(x.works.piece(x.lab.store as number)!.state === 'done' ? [] : [x.lab.store]), wallSegs(x, 'wall', 'palisade')[0], ...x.ids('bridge'), ...x.ids('wall'), x.lab.stakes, x.lab.ditch, x.lab.kiln]], ['perkSite', wallSegs(x, 'wall', 'palisade')[0], 0.2, 0.1]]],
    [300, (x) => {
      const tw = wallSegs(x, 'wall', 'woodTower')[0], b = x.works.piece(tw)!;
      return [['place', 0, 'ladder', b.tiles[0], b.tiles[1] - 1, 0, ''], ['label', 'ladder', 'last'], ['place', 0, 'brazier', b.tiles[0], b.tiles[1], 0, ''], ['label', 'brazier', 'last'],
        ['place', 0, 'brazier', b.tiles[0], b.tiles[1], 0, ''], ['ladderFoot', 1, b.tiles[0], b.tiles[1]], ['ladderFoot', 1, b.tiles[4], b.tiles[5]], ['ladderFoot', 0, b.tiles[4], b.tiles[5]]];
    }],
    [301, (x) => [['finishSite', x.lab.ladder], ['litNear', 0, 85, 42, x.grid.height[tileOf(x, x.lab.brazier as number)], null], ['litNear', 1, 85, 42, x.grid.height[tileOf(x, x.lab.brazier as number)], 9], ['pitch', 0, 92, 30]]],
    [330, (x) => {
      const seg = wallSegs(x, 'wall', 'rampart')[0] ?? wallSegs(x, 'wall', 'palisade')[0], b = x.works.piece(seg)!;
      return [['finishSite', seg], ['place', 0, 'woodStairs', ...x.spot(0, 'woodStairs', b.tiles[0], b.tiles[1] - 3), 0, ''], ['label', 'stairs', 'last']];
    }],
    [331, (x) => [['finishSite', x.lab.stairs], ['deckPoints', tileOf(x, wallSegs(x, 'wall', 'rampart')[0] ?? 0), 6]]],
    [400, (x) => [['kindle', wallSegs(x, 'wall', 'palisade')[1], 2], ['kindle', wallSegs(x, 'wall', 'palisade')[1], 2], ['fireHit', x.lab.stakes, 1]]],
    [520, (x) => [['douse', wallSegs(x, 'wall', 'palisade')[1], 30], ['douse', x.lab.camp, 1]]],
    [560, (x) => {
      const tw = wallSegs(x, 'wall', 'woodTower')[0], b = x.works.piece(tw)!;
      return [['raiseLadder', 1, b.tiles[4], b.tiles[5], 99, 'ladder'], ['label', 'siege', 'last'], ['raiseLadder', 1, 5, 5, 98, 'towerBridge'], ['raiseLadder', 1, b.tiles[6], b.tiles[7], 97, 'towerBridge']];
    }],
    [570, (x) => [['push', x.lab.siege, 2], ['push', x.lab.siege, 2.5], ['push', x.lab.siege, 1]]],
    [600, (x) => [['finishBridges', 0], ['bridgeAt', tileOf(x, x.ids('bridge')[1])], ['onBuilding', tileOf(x, x.ids('bridge')[1])], ['ringPoints', x.ids('bridge')[0], 5, 100, 30]]],
    [640, (x) => [['damage', wallSegs(x, 'wall', 'woodGate')[0] ?? x.lab.ditch, 99999, 1], ['damage', x.ids('bridge')[2], 99999, 1], ['damage', x.lab.camp, 150, 2]]],
    [660, (x) => [['mend', x.lab.camp, 0], ['mend', x.lab.camp, 1], ['sites', 1, [x.lab.camp]], ['addItem', x.lab.store, 'it1'], ['addItem', x.lab.store, 'it2']]],
    [700, (x) => [['demolish', x.lab.store, 0], ['demolish', x.lab.store, 0], ['demolish', x.lab.camp, 1]]],
    [760, (x) => [['place', 0, 'farm', ...x.spot(0, 'farm', 80, 30), 0, 'b'], ['label', 'farm', 'last'], ['place', 0, 'olivePress', ...x.spot(0, 'olivePress', 98, 24), 0, ''], ['label', 'press', 'last']]],
    [761, (x) => [['finishSite', x.lab.farm], ['finishSite', x.lab.press], ['workSpots', x.lab.press], ['setAccess', x.lab.farm, 'b', 'alliance', 0.3, 2.4], ['setAccess', x.lab.farm, 'a', 'private', null, null],
      ['liege', 'b', 'p:5', 20], ['mayUse', x.lab.farm, 'c', 0], ['mayUse', x.lab.farm, 'c', 1]]],
    [762, (x) => {
      const fn = x.works.resourceNodes().find((n) => n.building === x.lab.farm)!.id;
      return [['node', 2, fn], ['setJob', 9, 'gather'], ['setJob', 10, 'gather'], ['nodeOk', fn, 0, 'c'], ['nodeOk', fn, 1, 'd']];
    }],
    [800, (x) => [['place', 0, 'farm', ...x.spot(0, 'farm', 75, 20), 0, ''], ['label', 'farm2', 'last'], ['place', 0, 'chest', ...x.spot(0, 'chest', 88, 34), 0, 'a'], ['label', 'chest', 'last'],
      ['place', 0, 'chest', ...x.spot(0, 'chest', 89, 36), 0, ''], ['place', 0, 'privateHouse', ...x.spot(0, 'privateHouse', 80, 36), 0, 'a'], ['label', 'house', 'last']]],
    [801, (x) => [['sites', 1, [x.lab.farm2, x.lab.house, x.lab.chest, x.lab.kiln, x.lab.stakes, x.lab.ditch]], ['setAccess', x.lab.house, 'a', 'household', null, null], ['mayUse', x.lab.house, 'c', 0]]],
    [950, (x) => [['cancel', x.lab.farm2], ['cancel', x.lab.farm2], ['finishSite', x.lab.house], ['breakLock', x.lab.house, 3, 2], ['breakLock', x.lab.house, 3, 2], ['tillOf', x.lab.farm], ['ownedHolds', 'b'], ['payTill', x.lab.farm, 'coin', 10, 'kimmeria']]],
    [1000, () => [['placeWall', 0, { material: 'wood', points: [76.5, 18.5, 76.5, 30.5], gates: [76.5, 24.5], inside: [90, 25] }], ['label', 'wall2', 'last']]],
    [1001, (x) => [...x.ids('wall2').map((id): Call => ['finishSite', id])]],
    [1002, (x) => [['fortify', 0, wallSegs(x, 'wall2', 'woodGate')[0], 'ironGate'], ['fortify', 0, wallSegs(x, 'wall2', 'woodGate')[0], 'ironGate'], ['fortify', 0, wallSegs(x, 'wall2', 'palisade')[0], 'wetHides'],
      ['fortify', 1, wallSegs(x, 'wall2', 'palisade')[0], 'wetHides'], ['kindle', wallSegs(x, 'wall2', 'palisade')[0], 4], ['upgrade', wallSegs(x, 'wall2', 'palisade')[1] ?? -1, 0], ['siteOk', wallSegs(x, 'wall2', 'palisade')[1] ?? -1, 0]]],
    [1003, (x) => [['cancel', wallSegs(x, 'wall2', 'rampart')[0] ?? -1], ['place', 0, 'woodTower', 76.5, 29.5, 0, ''], ['place', 0, 'woodGate', 76.5, 19, 1, '']]],
    [1050, (x) => [['setTeams', [x.lab.kiln, x.lab.press], 1], ['influence'], ['lockNodes', [nodeNear(x, 'wood', 90, 31)], true], ['nodeOk', nodeNear(x, 'wood', 90, 31), 0, 'a']]],
    [1100, (x) => {
      const cp = x.region.claimPoints![2];
      return [['claim', 1, cp.x, cp.y, 20, true], ['preRows'], ['place', 1, 'camp', ...x.spot(1, 'camp', 400, 222), 0, ''], ['label', 'camp1', 'last']];
    }],
    [1101, (x) => {
      const ruins = x.works.prebuilt().filter((b) => b.pre?.ruin).map((b) => b.id), well = x.works.prebuilt().find((b) => b.type === 'well')!.id;
      return [['finishSite', x.lab.camp1], ['rebuild', ruins[0], 1, MOB], ['rebuild', ruins[0], 1, MOB], ['rebuild', well, 1, MOB], ['sites', 3, ruins], ['setJob', 11, 'build'], ['setJob', 12, 'build'],
        ['foul', well, 30, 1500], ['near', 412, 220, 6], ['mend', x.works.prebuilt().find((b) => b.type === 'house')!.id, 1]];
    }],
    [1200, (x) => [['setJob', 3, null], ['release', 4], ['kill', 5], ['setJob', 0, 'build'], ['fieldAt', tileOf(x, x.lab.stakes as number)], ['fieldAt', 0], ['dist2', x.lab.farm, 0, 0], ['nearestTile', x.lab.farm, 0, 0]]],
    [1300, (x) => {
      const ruins = x.works.prebuilt().filter((b) => b.pre?.ruin).map((b) => b.id);
      return [['cancel', ruins[0]], ['vanish', x.works.prebuilt().find((b) => b.type === 'well')!.id], ['preRows'], ['takeAt', 0, 92, 30, { wood: 5, stone: 5 }], ['takeAt', 0, 92, 30, { gold: 1 }], ['addStock', 0, 'wood', -20, [92, 30]], ['addStock', 0, 'wood', 20, [92, 30]]];
    }],
    [1400, (x) => [['setFallback', MOB], ['fallback'], ['setFallback', 6], ['damage', x.works.prebuilt().find((b) => b.type === 'house')!.id, 99999, 0], ['lockNodes', [nodeNear(x, 'wood', 90, 31)], false]]],
  ],
};

/** Canyons: a landmark fortress, pre-built for the mobs, captured, battered, restored and remembered. */
const CANYONS: Scenario = {
  region: 'canyons', ticks: 420, snapEvery: 100,
  squads: [{ team: 0, owner: 'a', home: [120.5, 112.5] }],
  workers: [{ squad: 0, at: [118.5, 112.5], brate: 6 }, { squad: 0, at: [121.5, 113.5], brate: 6 }, { squad: 0, at: [122.5, 112.5], brate: 6 }],
  immune: [3],
  steps: [
    [0, () => [['prebuild', MOB], ['preRows'], ['near', 110, 109, 3]]],
    [1, (x) => {
      const cp = x.region.claimPoints![1], tw = x.works.prebuilt().find((b) => b.type === 'stoneTower')!;
      return [['setFallback', 6], ['claim', 0, cp.x, cp.y, 30, false], ['landmarkCapture', 0.3], ['preRows'], ['deckPoints', tw.ti[0], 9], ['deckPoints', tw.ti[0], 3], ['platCap', tw.id], ['onBuilding', tw.ti[0]],
        ['ringPoints', tw.id, 6, 100, 100]];
    }],
    [2, (x) => {
      const wall = x.works.prebuilt().filter((b) => b.type === 'stoneWall');
      return [['label', 'rows', 'none'], ['damage', wall[0].id, 1e6, 2], ['damage', wall[1].id, 400, 2], ['damage', 3, 1e6, 2], ['mend', wall[1].id, 0], ['sites', 0, [wall[1].id, wall[2].id]],
        ['damage', wall[2].id, 2000, 1], ['mend', wall[2].id, 0], ['setJob', 0, 'build'], ['setJob', 1, 'build'], ['setJob', 2, 'build'], ['addStock', 0, 'stone', 400, null], ['addStock', 0, 'wood', 100, null],
        ['rebuild', wall[0].id, 0, MOB], ['vanish', wall[5].id]];
    }],
    ...[...Array(20)].map((_, k): Step => [k * 20 + 3, () => [['staffScan', MOB]]]),
    [200, () => [['landmarkRestore', 0, { stone: 1e5 }, 120, 112], ['landmarkRestore', 0, { stone: 50 }, 120, 112], ['preRows']]],
    [250, () => [['landmarkCapture', 0.5], ['resetLandmark'], ['preRows']]],
    [300, (x) => {
      const p = x.works.prebuilt();
      return [['loadPreRows', p.slice(0, 12).map((b, i) => [b.pre!.i, i % 3 ? 300 : 9000, i % 4 === 0, i === 7])], ['preRows'], ['setTeams', [p[0].id], 1], ['demolish', p[1].id, 0]];
    }],
  ],
};

export const vectors = (sha: Sha) => ({ scenarios: [KIMMERIA, CANYONS].map((s) => run(s, sha)) });
