/**
 * Siege vectors (src/war/sim/siege.ts) for the Godot port: real works (walls, gates, towers, a camp) on a real region and
 * the siege engines inside a small scripted fake world. The world (squads of men that walk straight to their engine's
 * crew points or to a set goal, foes, a cart raider) lives only here and in godot/native/src/siege_probe.cpp, which
 * mirrors it. Per tick the vectors carry:
 *  - `c`: the scripted calls (works set-up, engine builds and labour, crews, orders, fire, cover and roof queries, carts
 *    and their cargo, captures, stowing, shots at engines and buildings) with their results;
 *  - `e`: the host calls that leave the siege or works (paths and what they answered, splashes, bolts, wrecks, captures,
 *    the works' chance rolls, evictions, falls, the grid tiles marked dirty);
 *  - every 5 ticks `g`, every engine's whole state, and `m`, the men;
 *  - every `snapEvery` ticks and after any call, `s`: the engine snapshots, the shots, the buildings and sha256 digests
 *    of the grid layers the works edit.
 * The Godot side replays the calls and the paths and chance rolls, computes the other host answers from its mirror of the
 * world and the grid, and checks all the rest bit for bit.
 */
import { parseRegion } from '../../war/region/schema';
import { buildGrid, findPath, flushSectors, tileAt, walkClear, type Grid } from '../../war/sim/grid';
import { createWorks } from '../../war/sim/works';
import { createSiege } from '../../war/sim/siege';
import { CART } from '../../war/sim/trade';
import { put, type Hold } from '../../war/sim/holders';
import { hashString, Rng } from '../../sim/rng';
import type { RegionData, SiegeType } from '../../war/types';

type Sha = (b: Uint8Array) => string;
type Call = [string, ...unknown[]];

const regionFiles = import.meta.glob('../../war/regions/*.json', { eager: true, import: 'default' });

const SPEED = 0.15; // tiles a tick a man walks

interface SquadDef { team: number; owner: string; nodes?: string[]; men: [number, number][] }
interface Man { x: number; y: number; alive: boolean }
interface WSquad { team: number; owner: string; nodes: string[]; men: Man[]; goal: [number, number] | null; hit: boolean }
type Step = [number, (x: Ctx) => Call[]];
interface Ctx { lab: Record<string, unknown>; works: ReturnType<typeof createWorks>; siege: ReturnType<typeof createSiege>; region: RegionData; grid: Grid; ids: (k: string) => number[]; of: (k: string, type: string) => number[] }
interface Scenario { region: string; ticks: number; snapEvery: number; teamNodes: string[][]; squads: SquadDef[]; steps: Step[] }

const holdSer = (h: Hold | null | undefined) => (h ? { lots: h.lots.map((l) => [l.r, l.n, l.o, l.s ?? null]), items: h.items.map((i) => i.uid) } : null);

function run(sc: Scenario, sha: Sha) {
  const region: RegionData = parseRegion(regionFiles[`../../war/regions/${sc.region}.json`]);
  const grid = buildGrid(region), w = grid.w;
  const rng = new Rng(hashString(sc.region) + 5), wrng = new Rng(hashString(sc.region) + 11);
  let ev: unknown[] = [];
  const dirty = () => {
    if (!grid.dirty.length) return;
    ev.push(['dirty', [...grid.dirty]]);
    flushSectors(grid);
  };
  const findPts = (x0: number, y0: number, x1: number, y1: number) => {
    const a = tileAt(grid, x0, y0), b = tileAt(grid, x1, y1);
    const tiles = a >= 0 && b >= 0 && grid.cost[a] > 0 && grid.cost[b] > 0 ? findPath(grid, a, b) : [];
    const pts: number[] = [];
    for (const t of tiles) pts.push((t % w) + 0.5, ((t / w) | 0) + 0.5);
    if (pts.length) (pts[pts.length - 2] = x1), (pts[pts.length - 1] = y1);
    return pts;
  };
  const squads: WSquad[] = sc.squads.map((s) => ({ team: s.team, owner: s.owner, nodes: s.nodes ?? [], men: s.men.map(([x, y]) => ({ x, y, alive: true })), goal: null, hit: false }));
  const nodeSets = sc.teamNodes.map((n) => new Set(n));
  const none: ReadonlySet<string> = new Set();
  const works = createWorks(
    grid,
    region,
    (team, x0, y0, x1, y1) => {
      dirty();
      grid.team = team;
      const pts = findPts(x0, y0, x1, y1);
      ev.push(['wpath', team, x0, y0, x1, y1, pts]);
      return pts;
    },
    (tiles) => void ev.push(['evict', [...tiles]]),
    (p) => {
      const r = wrng.chance(p);
      ev.push(['chance', p, r]);
      return r;
    },
    (tiles) => void ev.push(['fall', [...tiles]]),
  );
  const near2 = (m: Man, x: number, y: number) => (m.x - x) ** 2 + (m.y - y) ** 2;
  const siege = createSiege(works, rng, {
    path(team, x0, y0, x1, y1) {
      dirty();
      grid.team = team;
      grid.engine = true;
      const pts = findPts(x0, y0, x1, y1);
      grid.engine = false;
      ev.push(['path', team, x0, y0, x1, y1, pts]);
      return pts;
    },
    cartPath(team, x0, y0, x1, y1) {
      dirty();
      grid.team = team;
      grid.cart = true;
      const pts = findPts(x0, y0, x1, y1);
      grid.cart = false;
      ev.push(['cpath', team, x0, y0, x1, y1, pts]);
      return pts;
    },
    crewNear(crew, x, y, r) {
      let n = 0;
      for (const m of squads[crew]?.men ?? []) if (m.alive && near2(m, x, y) <= r * r) n++;
      return n;
    },
    splash: (x, y, r, dmg, ap) => void ev.push(['splash', x, y, r, dmg, ap]),
    open(x, y) {
      const t = tileAt(grid, x, y);
      return t >= 0 && grid.cost[t] > 0 && grid.deck[t] === 0;
    },
    walkable: (x0, y0, x1, y1) => walkClear(grid, x0, y0, x1, y1),
    cost(x, y) {
      const t = tileAt(grid, x, y);
      return t >= 0 && grid.cost[t] > 0 ? grid.cost[t] : 1;
    },
    nodes: (team) => nodeSets[team] ?? none,
    foe(team, x, y, r) {
      let best: Man | null = null, bd = r * r;
      for (const s of squads) {
        if (s.team === team) continue;
        for (const m of s.men) {
          if (!m.alive) continue;
          const d = near2(m, x, y);
          if (d < bd) (bd = d), (best = m);
        }
      }
      return best ? [best.x, best.y] : null;
    },
    pierce: (team, x0, y0, x1, y1, wd, dmg, ap, n) => void ev.push(['pierce', team, x0, y0, x1, y1, wd, dmg, ap, n]),
    stoneTower(team, x, y) {
      const id = works.onBuilding(tileAt(grid, x, y)), b = works.piece(id);
      return !!b && b.type === 'stoneTower' && b.team === team;
    },
    cartCost(x, y, dx, dy) {
      const t = tileAt(grid, x + dx * 0.5, y + dy * 0.5);
      return t >= 0 && grid.cost[t] > 0 && region.water[t] === 0 ? grid.cost[t] : 0;
    },
    foeNear(team, x, y, r) {
      for (const s of squads) if (s.team !== team) for (const m of s.men) if (m.alive && near2(m, x, y) <= r * r) return true;
      return false;
    },
    crewHit: (crew) => !!squads[crew]?.hit,
    taker(e) {
      for (const s of squads) if (s.team === e.team) for (const m of s.men) if (m.alive && near2(m, e.x, e.y) <= CART.guard * CART.guard) return null;
      for (const s of squads) if (s.team !== e.team) for (const m of s.men) if (m.alive && near2(m, e.x, e.y) <= CART.beside * CART.beside) return [s.team, s.owner];
      return null;
    },
    captured: (e, by) => void ev.push(['captured', e.id, by]),
    wreck: (e, burnt) => void ev.push(['wreck', e.id, burnt, holdSer(e.hold)]),
    crewNode: (crew, node) => !!squads[crew]?.nodes.includes(node),
    cartFx: (owner) => (owner === 'p' ? { cartLoads: 2, cartSpeed: 0.15, cartHp: 0.25 } : {}),
  });

  const lab: Record<string, unknown> = {};
  const ids = (k: string) => (Array.isArray(lab[k]) ? (lab[k] as number[]) : [lab[k] as number]);
  const of = (k: string, type: string) => ids(k).filter((id) => works.piece(id)?.type === type);
  const ctx: Ctx = { lab, works, siege, region, grid, ids, of };

  const engineCount = () => {
    let n = 0;
    while (siege.get(n)) n++;
    return n;
  };

  const call = ([name, ...a]: Call): unknown => {
    const n = (i: number) => a[i] as number;
    switch (name) {
      case 'label': return null;
      // works and world set-up
      case 'claim': return void works.claim(n(0), n(1), n(2), n(3), false), null;
      case 'addStock': return void works.addStock(n(0), a[1] as never, n(2)), null;
      case 'place': return works.place(n(0), a[1] as never, n(2), n(3), 0, '');
      case 'placeWall': return works.placeWall(n(0), a[1] as never);
      case 'finishSite': return works.finishSite(n(0));
      case 'wdamage': return void works.damage(n(0), n(1), n(2)), null;
      case 'push': return works.push(n(0), n(1));
      case 'goal': return void (squads[n(0)].goal = a[1] ? [(a[1] as number[])[0], (a[1] as number[])[1]] : null), null;
      case 'hit': return void (squads[n(0)].hit = a[1] as boolean), null;
      case 'killMan': return void (squads[n(0)].men[n(1)].alive = false), null;
      case 'cargo': return void put(siege.get(n(0))!.hold!, a[1] as never, n(2), a[3] as string, (a[4] ?? undefined) as number | undefined), null;
      case 'item': return void siege.get(n(0))!.hold!.items.push({ uid: a[1] as string, def: 'dory', rarity: 'common', cond: 100, ...(a[2] != null ? { q: a[2] as 0 | 1 | 2 } : {}) }), null;
      // the siege API
      case 'build': return siege.build(n(0), a[1] as SiegeType, n(2), n(3));
      case 'cart': return siege.cart(n(0), a[1] as string, a[2] as SiegeType, n(3), n(4));
      case 'carts': return siege.carts({ ...(a[0] != null ? { owner: a[0] as string } : {}), ...(a[1] != null ? { team: n(1) } : {}) });
      case 'isCart': return siege.isCart(n(0));
      case 'cartCap': return siege.cartCap(n(0));
      case 'labour': return siege.labour(n(0), n(1));
      case 'stow': { const r = siege.stow(n(0)); return r ? [r.type, holdSer(r.hold)] : null; }
      case 'cartHolds': return siege.cartHolds(a[0] as string).map(holdSer);
      case 'setOwner': return void siege.setOwner(n(0), n(1), a[2] as string), null;
      case 'alive': return siege.alive(n(0));
      case 'built': return siege.built(n(0));
      case 'crew': return siege.crew(n(0), n(1), n(2));
      case 'uncrew': return void siege.uncrew(n(0)), null;
      case 'move': return void siege.move(n(0), n(1), n(2)), null;
      case 'hold': return void siege.hold(n(0)), null;
      case 'attack': return siege.attack(n(0), n(1));
      case 'deploy': return void siege.deploy(n(0), a[1] as boolean), null;
      case 'raise': return siege.raise(n(0), n(1), n(2));
      case 'busy': return siege.busy(n(0));
      case 'kindle': return siege.kindle(n(0), n(1));
      case 'fireK': return siege.fireK(n(0));
      case 'roof': return siege.roof(n(0), n(1), n(2), n(3));
      case 'cover': return siege.cover(n(0), n(1), n(2), n(3), n(4));
      case 'douse': return siege.douse(n(0), n(1));
      case 'damage': return void siege.damage(n(0), n(1)), null;
      case 'crewPoints': return siege.crewPoints(n(0), n(1));
      default: throw new Error(`siege vectors: no call ${name}`);
    }
  };

  /** Men walk straight: a crew to its engine's crew points (its first crewed engine), else to the squad's goal. */
  const walk = () => {
    const ne = engineCount();
    squads.forEach((s, i) => {
      let eng = -1;
      for (let id = 0; id < ne; id++) {
        const e = siege.get(id)!;
        if (e.crew === i && e.state !== 'destroyed') {
          eng = id;
          break;
        }
      }
      const live = s.men.filter((m) => m.alive);
      const pts = eng >= 0 ? siege.crewPoints(eng, live.length) : null;
      live.forEach((m, k) => {
        const tx = pts ? pts[k * 2] : s.goal ? s.goal[0] + (k % 4) * 0.6 : m.x, ty = pts ? pts[k * 2 + 1] : s.goal ? s.goal[1] + Math.floor(k / 4) * 0.6 : m.y;
        const dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy);
        if (d <= SPEED) (m.x = tx), (m.y = ty);
        else (m.x += (dx / d) * SPEED), (m.y += (dy / d) * SPEED);
      });
    });
  };

  const engineSer = (id: number) => {
    const e = siege.get(id)!;
    return [e.id, e.type, e.team, e.x, e.y, e.facing, e.hp, e.maxHp, e.state, e.labour, e.crew, e.mode, e.goal, e.path.length, e.pi, e.target, e.wall, e.ladder, e.cd, e.swingAt, e.prog,
      e.burn, e.kindle, e.tower, e.owner, holdSer(e.hold), e.halt, e.cap, e.capT, e.capO, e.stop, e.lag, e.stowed];
  };
  const snap = (t: number) => ({
    e: siege.snaps(t),
    sh: siege.shots().map((x) => ({ ...x })),
    b: works.buildingSnaps().map((b) => [b.id, b.type, b.team, b.state, b.hp, b.burning ?? null, b.siege ?? null]),
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
        if (k[0] === 'build' || k[0] === 'cart' || k[0] === 'place' || k[0] === 'placeWall') lab.last = r;
      }
    walk();
    works.tick();
    siege.tick(t);
    dirty();
    const rec: Record<string, unknown> = { t };
    if (c.length) rec.c = c;
    if (ev.length) rec.e = ev;
    if (t % 5 === 0) {
      rec.g = [...Array(engineCount()).keys()].map(engineSer);
      rec.m = squads.map((s) => s.men.map((m) => [m.x, m.y, m.alive]));
    }
    if (t % sc.snapEvery === 0 || c.length || t === sc.ticks - 1) rec.s = snap(t);
    ticks.push(rec);
  }
  return { region: sc.region, teamNodes: sc.teamNodes, squads: sc.squads.map((s) => ({ team: s.team, owner: s.owner, nodes: s.nodes ?? [], men: s.men })), ticks };
}

const line = (x: number, y: number, n: number, dx = 0.6): [number, number][] => [...Array(n)].map((_, k) => [x + (k % 4) * dx, y + Math.floor(k / 4) * dx]);
/** The tile centre of a piece's i-th tile. */
const tileXY = (x: Ctx, id: number, i = 0): [number, number] => { const b = x.works.piece(id)!; return [b.tiles[i * 2] + 0.5, b.tiles[i * 2 + 1] + 0.5]; };
/** The centre of the k-th tile of pieces `ids` a ladder of `team` can go up (a search with no visible effect). */
const footAt = (x: Ctx, team: number, ids: number[], k = 0): [number, number] => {
  for (const id of ids) {
    const b = x.works.piece(id)!;
    for (let i = 0; i < b.tiles.length; i += 2) if (x.works.ladderFoot(team, b.tiles[i], b.tiles[i + 1]) >= 0 && k-- === 0) return [b.tiles[i] + 0.5, b.tiles[i + 1] + 0.5];
  }
  return [0.5, 0.5];
};
/** The one of pieces `ids` with tile (tx,ty). */
const pieceAt = (x: Ctx, ids: number[], tx: number, ty: number) => ids.find((id) => { const t = x.works.piece(id)!.tiles; for (let i = 0; i < t.length; i += 2) if (t[i] === tx && t[i + 1] === ty) return true; return false; }) ?? -1;

// Engine ids, in build order (the failed builds come after them and take no id).
const RAM = 0, COV = 1, THR = 2, LAD = 3, TWR = 4, MAN = 5, OXY = 6, HC = 7, WAG = 8, OXY1 = 9, THR1 = 10, LAD2 = 11;

/**
 * Kimmeria, east bank: team 1 holds a wood wall (palisades, a tower, a gate) on the flats with a stone wall and stone tower
 * on its west flank; team 0 builds every engine north of it and assaults: rams on the gate and the stone wall, a stone
 * thrower on the tower, a ladder and a siege tower on the walkway, a mantlet, an oxybeles; team 1 answers with an oxybeles
 * and a stone thrower on its stone tower (Archimedes); two carts roll, halt, get taken, wreck and are stowed.
 */
const KIMMERIA: Scenario = {
  region: 'kimmeria', ticks: 1400, snapEvery: 25,
  teamNodes: [['carpenter', 'rams', 'artillerist', 'poliorcetes', 'builder', 'sapper'], ['archimedes', 'artillerist', 'builder']],
  squads: [
    { team: 0, owner: 'a', men: line(150.5, 35.5, 6) }, // 0 ram crew
    { team: 0, owner: 'a', men: line(126.5, 58.5, 6) }, // 1 covered ram crew
    { team: 0, owner: 'a', men: line(154.5, 30.5, 3) }, // 2 stone thrower crew (Artillerist: 3 do)
    { team: 0, owner: 'a', men: line(140.5, 35.5, 4) }, // 3 ladder crew
    { team: 0, owner: 'a', men: line(127.5, 53.5, 8) }, // 4 siege tower crew
    { team: 0, owner: 'a', men: line(148.5, 38.5, 2) }, // 5 mantlet crew
    { team: 0, owner: 'a', men: line(152.5, 33.5, 2) }, // 6 oxybeles crew
    { team: 0, owner: 'p', men: line(130.5, 34.5, 2) }, // 7 handcart pullers
    { team: 0, owner: 'a', nodes: ['packMules'], men: line(134.5, 34.5, 1) }, // 8 wagon driver (Pack Mules)
    { team: 1, owner: 'z', men: line(150.5, 52.5, 4) }, // 9 defenders inside the wall
    { team: 1, owner: 'z', men: line(170.5, 60.5, 3) }, // 10 cart raiders
    { team: 1, owner: 'z', men: line(137.5, 62.5, 2) }, // 11 the tower oxybeles' crew
    { team: 1, owner: 'z', men: line(137.5, 64.5, 3) }, // 12 the tower stone thrower's crew
  ],
  steps: [
    [0, () => [
      ['claim', 0, 150.5, 14.5, 12], ['claim', 1, 150.5, 60.5, 22],
      ...(['wood', 'stone', 'hides', 'iron', 'bronze', 'linen', 'food'] as const).flatMap((r): Call[] => [['addStock', 0, r, 3000], ['addStock', 1, r, 3000]]),
      ['placeWall', 1, { material: 'wood', points: [138.5, 46.5, 164.5, 46.5], towers: [143.5, 46.5], gates: [151.5, 46.5], inside: [150, 60] }], ['label', 'wall', 'last'],
      ['placeWall', 1, { material: 'stone', points: [134.5, 50.5, 134.5, 70.5], towers: [134.5, 62.5], inside: [150, 60] }], ['label', 'stone', 'last'],
      ['place', 0, 'camp', 150, 14], ['label', 'camp', 'last'],
    ]],
    [1, (x) => [...x.ids('wall'), ...x.ids('stone'), x.lab.camp as number].map((id): Call => ['finishSite', id])],
    [2, () => [
      ['build', 0, 'ram', 151.5, 38.5], ['build', 0, 'coveredRam', 128.5, 60.5], ['build', 0, 'stoneThrower', 155.5, 31.5], ['build', 0, 'siegeLadder', 141.5, 38.5],
      ['build', 0, 'siegeTower', 129.5, 56.5], ['build', 0, 'mantlet', 148.5, 40.5], ['build', 0, 'oxybeles', 152.5, 35.5],
      ['cart', 0, 'p', 'handcart', 131.5, 36.5], ['cart', 0, 'a', 'wagon', 135.5, 36.5],
      // refused: no engineer with the design, closed ground, no stock
      ['build', 1, 'mantlet', 150.5, 55.5], ['build', 0, 'ram', 145.5, 46.5], ['build', 2, 'ram', 150.5, 30.5],
      ['isCart', HC], ['isCart', RAM], ['cartCap', HC], ['cartCap', WAG], ['cartCap', 99], ['carts', null, null], ['carts', 'p', null], ['carts', null, 1],
    ]],
    [3, (x) => {
      const tw = x.of('stone', 'stoneTower')[0], [tx, ty] = tileXY(x, tw);
      return [['build', 1, 'oxybeles', tx, ty], ['build', 1, 'stoneThrower', tx + 1, ty], ['build', 0, 'siegeLadder', 139.5, 40.5]];
    }],
    ...[...Array(118)].map((_, k): Step => [k + 3, () => [RAM, COV, THR, LAD, TWR, MAN, OXY, OXY1, THR1, LAD2].map((id): Call => ['labour', id, 10])]),
    [4, () => [['built', RAM], ['alive', RAM], ['crew', RAM, 0, 0], ['busy', RAM], ['labour', HC, 5], ['labour', 99, 5], ['kindle', TWR, 1], ['fireK', COV], ['fireK', 99]]],
    [125, (x) => {
      const gate = x.of('wall', 'woodGate')[0], seg = pieceAt(x, x.of('stone', 'stoneWall'), 134, 60), tw = x.of('wall', 'woodTower')[0];
      const [lx, ly] = footAt(x, 0, [tw]), [sx, sy] = footAt(x, 0, x.of('stone', 'stoneWall'), 3);
      return [
        ['crew', RAM, 0, 0], ['crew', COV, 1, 0], ['crew', THR, 2, 0], ['crew', LAD, 3, 0], ['crew', TWR, 4, 0], ['crew', MAN, 5, 0], ['crew', OXY, 6, 0], ['crew', HC, 7, 0], ['crew', WAG, 8, 0],
        ['crew', OXY1, 11, 1], ['crew', THR1, 12, 1], ['crew', LAD2, 1, 1],
        ['attack', RAM, gate], ['attack', COV, seg], ['attack', THR, tw], ['raise', LAD, lx, ly], ['raise', TWR, sx, sy], ['move', MAN, 150.5, 43.5],
        // refused: own building, not a ram or thrower, a ladder at no wall, a ram raised
        ['attack', RAM, x.lab.camp], ['attack', MAN, gate], ['raise', LAD2, 150.5, 20.5], ['raise', RAM, lx, ly], ['attack', 99, gate],
        ['attack', THR1, x.lab.camp], ['move', HC, 150.5, 24.5], ['move', WAG, 160.5, 24.5], ['move', OXY1, 140, 60],
        ['busy', RAM], ['busy', OXY], ['busy', HC], ['cartCap', WAG], ['crewPoints', MAN, 3], ['crewPoints', TWR, 8],
      ];
    }],
    [126, () => [['uncrew', OXY1], ['busy', OXY1], ['crew', OXY1, 11, 1], ['busy', OXY1], ['busy', THR1]]],
    [160, () => [['cargo', HC, 'wood', 7, 'kimmeria', null], ['cargo', HC, 'coin', 120, 'kimmeria', -3], ['item', HC, 'h1', null], ['item', HC, 'h2', 2],
      ['cargo', WAG, 'stone', 30, 'kimmeria', null], ['cartHolds', 'p'], ['carts', 'a', 0], ['roof', RAM, 145.5, 37.5, 2.5], ['roof', MAN, 148.5, 40.5, 3],
      ['cover', 0, 150.5, 42.5, 150.5, 60.5], ['cover', 0, 150.5, 42.5, 150.5, 20.5], ['cover', 1, 150.5, 42.5, 150.5, 60.5], ['crewPoints', RAM, 6], ['deploy', OXY, false]]],
    [200, (x) => {
      const m = x.siege.get(MAN)!, c = Math.cos(m.facing), s = Math.sin(m.facing);
      return [['cover', 0, m.x - c * 1.5, m.y - s * 1.5, m.x + c * 10, m.y + s * 10], ['cover', 0, m.x - c * 1.5 - s * 2, m.y - s * 1.5 + c * 2, m.x + c * 10, m.y + s * 10],
        ['cover', 0, m.x + c * 1, m.y + s * 1, m.x + c * 10, m.y + s * 10], ['cover', 0, m.x - c * 1.5, m.y - s * 1.5, m.x - c * 10, m.y - s * 10],
        ['roof', COV, x.siege.get(COV)!.x, x.siege.get(COV)!.y, 2.5], ['move', HC, 112.5, 40.5], ['goal', 10, [131.5, 36.5]]];
    }],
    [260, () => [['kindle', RAM, 2], ['kindle', RAM, 2], ['kindle', COV, 4], ['kindle', COV, 4], ['busy', THR], ['hit', 8, true]]],
    [300, () => [['douse', RAM, 5], ['douse', RAM, 30], ['douse', RAM, 1], ['douse', COV, 2], ['hit', 8, false], ['move', WAG, 170.5, 22.5]]],
    [340, (x) => {
      const out: Call[] = [];
      for (const b of x.works.buildingSnaps()) if (b.type === 'ladder' && b.siege === LAD) out.push(['push', b.id, 2], ['push', b.id, 2.5]);
      return [...out, ['busy', LAD], ['damage', THR, 50]];
    }],
    [341, (x) => {
      const out: Call[] = [];
      for (const b of x.works.buildingSnaps()) if (b.type === 'ladder' && b.siege === LAD) out.push(['wdamage', b.id, 99999, 1]);
      return out;
    }],
    [420, () => [['deploy', THR, true], ['goal', 9, [149.5, 41.5]]]],
    [430, () => [['move', THR, 140.5, 30.5], ['deploy', THR1, false], ['busy', THR]]],
    [520, () => [['deploy', THR, false], ['setOwner', HC, 0, 'p'], ['cartHolds', 'z'], ['carts', 'z', null]]],
    [560, (x) => [['attack', THR, x.of('wall', 'palisade')[2]], ['goal', 10, [175.5, 60.5]], ['killMan', 6, 1]]],
    [600, () => [['damage', TWR, 99999], ['damage', TWR, 5], ['alive', TWR], ['hold', COV], ['uncrew', RAM]]],
    [640, (x) => [['crew', RAM, 0, 0], ['attack', RAM, x.of('wall', 'palisade')[1]], ['crew', LAD, 3, 0], ['raise', LAD, ...footAt(x, 0, x.of('wall', 'woodTower'), 1)], ['attack', COV, x.of('stone', 'stoneTower')[0]]]],
    [700, () => [['stow', WAG], ['stow', WAG], ['stow', RAM], ['carts', null, 0], ['kindle', HC, 4], ['kindle', MAN, 4], ['setOwner', HC, 1, 'z']]],
    [900, () => [['damage', HC, 99999], ['cartHolds', 'z'], ['damage', OXY1, 100], ['wdamage', 0, 10, 0]]],
    [1100, (x) => [['hold', THR], ['damage', MAN, 99999], ['cover', 0, 150.5, 42.5, 150.5, 60.5], ['damage', THR, 1e9], ['move', LAD2, 150.5, 30.5], ['crew', LAD2, 1, 1], ['wdamage', x.of('wall', 'woodGate')[0], 99999, 0]]],
  ],
};

export const vectors = (sha: Sha) => ({ scenarios: [KIMMERIA].map((s) => run(s, sha)) });
