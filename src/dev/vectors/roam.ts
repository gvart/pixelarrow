/**
 * Roaming life vectors (src/war/sim/roam.ts) for the Godot port: the controller run on real regions inside a small fake
 * world. The world (squads walking to their order's goal, blows traded in reach, escorts at their wagon, civilians
 * running from foes, players following, hunting and robbing groups) lives only here: per tick the vectors carry the
 * squads (`d`) and wagons (`k`) it changed, the controller calls made (`c`, with their results), every host call the
 * controller made (`e`) and the squads' grudges after the tick (`an`); every 25 ticks the roam snapshots. The Godot side
 * replays the squads, wagons and calls and checks the rest. The host's own reactions (spawn, order, route, open, cart)
 * are mirrored in godot/native/src/roam_probe.cpp.
 */
import { createRoam, type RoamDef, type RoamHost, type RoamSquad } from '../../war/sim/roam';
import { MOB_TEAM } from '../../war/sim/mobs';
import { NEUTRAL_TEAM } from '../../war/sim/economy';
import { hashString, Rng } from '../../sim/rng';
import { parseRegion } from '../../war/region/schema';
import type { Order, RegionData, RoamSnap } from '../../war/types';

const regionFiles = import.meta.glob('../../war/regions/*.json', { eager: true, import: 'default' });

type Kind = RoamSnap['kind'];
type Action =
  | { goal: [number, number] }
  | { seek: Kind; n: number; off?: number }
  | { hunt: Kind; n: number }
  | { follow: number }
  | { rob: number };
interface Player { at: number; owner: string; team: number; n: number; near: [Kind, number, number] | [number, number]; plan: [number, Action][] }
type Call = [string, ...unknown[]];
interface Scenario { region: string; seed: number; cap?: number; ranges: [number, number][]; players: Player[]; calls: [number, Call][]; stuck?: [number, number] }

interface Sq extends RoamSquad { arrived: boolean; dest: [number, number] | null; crew: number; guarding: number; fighting: boolean; calmT: number; plan?: [number, Action][] }
interface Cart { id: number; x: number; y: number; team: number; alive: boolean; moving: boolean }

const q = (v: number) => Math.round(v * 64) / 64;
const ser = (s: Sq) => [s.id, s.owner, s.team, s.alive, s.civ ? 1 : 0, s.flee ? 1 : 0, s.meek ? 1 : 0, s.angry, s.cx, s.cy, s.order, s.target, s.arrived ? 1 : 0, s.fighting ? 1 : 0,
  s.units.flatMap((u) => [u.hp, u.maxHp, u.alive ? 1 : 0])];
const serCart = (c: Cart) => [c.id, c.x, c.y, c.team, c.alive ? 1 : 0, c.moving ? 1 : 0];

/** The fake world's paths (mirrored in C++): a bent line, cut short for carts at some goals, a stub when too short. */
export function fakeRoute(cart: boolean, x0: number, y0: number, x1: number, y1: number): number[] {
  if (Math.hypot(x1 - x0, y1 - y0) < 1) return [x0, y0];
  const mx = q((x0 + x1) / 2 + (y1 - y0) * 0.2), my = q((y0 + y1) / 2 - (x1 - x0) * 0.2);
  if (cart && (Math.floor(x1) + Math.floor(y1)) % 5 === 0) return [x0, y0, mx, my];
  return [x0, y0, mx, my, x1, y1];
}

function run(sc: Scenario) {
  const region: RegionData = parseRegion(regionFiles[`../../war/regions/${sc.region}.json`]);
  const world = new Rng(hashString(sc.region) + 91);
  const squads: Sq[] = [], carts: Cart[] = [];
  const cap = sc.cap ?? 999;
  let ev: unknown[] = [];
  const host: RoamHost = {
    squads, w: region.w, h: region.h,
    spawn(team, owner, cls, count, x, y, k) {
      ev.push(['spawn', team, owner, cls, count, x, y, k.hp, k.dmg]);
      if (squads.length >= cap) return -1;
      const id = squads.length, hp = 10 * k.hp;
      squads.push({ id, owner, team, alive: count, cx: x, cy: y, units: Array.from({ length: count }, () => ({ x, y, hp, maxHp: hp, alive: true })), order: 'hold', target: -1,
        civ: cls.startsWith('civ_'), flee: false, meek: team === NEUTRAL_TEAM, angry: 0, arrived: true, dest: null, crew: -1, guarding: -1, fighting: false, calmT: 0 });
      return id;
    },
    order(o: Order) {
      const a = o as { x?: number; y?: number; target?: number; siege?: number; cart?: number; shape?: string };
      ev.push(['order', o.kind, o.squad, a.x ?? null, a.y ?? null, a.target ?? null, a.siege ?? null, a.cart ?? null, a.shape ?? null]);
      if (o.kind === 'formation') return;
      const s = squads[o.squad!];
      s.order = o.kind;
      if (o.kind === 'attack') s.target = a.target!;
      s.arrived = o.kind === 'hold';
      s.dest = o.kind === 'move' ? [a.x!, a.y!] : null;
      if (o.kind === 'crew') s.crew = a.siege!;
      if (o.kind === 'escort') s.guarding = a.cart!;
    },
    arrived(id) {
      ev.push(['arr', id, squads[id].arrived]);
      return squads[id].arrived;
    },
    route(cart, x0, y0, x1, y1) {
      ev.push(['route', cart, x0, y0, x1, y1]);
      return fakeRoute(cart, x0, y0, x1, y1);
    },
    open: (x, y) => [Math.floor(x) + 0.5, Math.floor(y) + 0.5],
    cart(x, y, goods) {
      const id = 500 + carts.length;
      ev.push(['cart', id, x, y, goods.flat()]);
      carts.push({ id, x, y, team: NEUTRAL_TEAM, alive: true, moving: false });
      return id;
    },
    cartAt: (id) => carts.find((c) => c.id === id) ?? null,
    pay(owner, team, x, y, coin) { ev.push(['pay', owner, team, x, y, coin]); },
    fightNear(x, y, r) {
      let out: [number, number] | null = null;
      for (const s of squads) if (s.alive > 0 && s.fighting && (s.cx - x) ** 2 + (s.cy - y) ** 2 <= r * r) { out = [s.cx, s.cy]; break; }
      ev.push(['fight', x, y, r, out]);
      return out;
    },
    note(e) { ev.push(e.kind === 'caravanPaid' ? ['note', e.kind, e.owner, e.team, e.coin, e.x, e.y] : ['note', e.kind, e.caravan, e.by]); },
  };
  const roam = createRoam(region, sc.seed, host);
  const call = ([name, ...a]: Call): unknown => {
    switch (name) {
      case 'spawn': return roam.spawn() ?? null;
      case 'add': return roam.add(a[0] as RoamDef);
      case 'provoke': return roam.provoke(a[0] as number, a[1] as number | null, a[2] as number | null) ?? null;
      case 'any': return roam.any();
      default: throw new Error(name);
    }
  };
  const groupOf = (kind: Kind, n: number) => roam.snaps().filter((g) => g.kind === kind)[n];
  const d2 = (a: { cx: number; cy: number }, x: number, y: number) => (a.cx - x) ** 2 + (a.cy - y) ** 2;
  const hit = (s: Sq, tg: Sq, dmg: number, p: number) => {
    for (const u of s.units) {
      if (!u.alive || !world.chance(p)) continue;
      const live = tg.units.filter((v) => v.alive);
      if (!live.length) break;
      const v = world.pick(live);
      v.hp = Math.max(0, q(v.hp - dmg));
      if (v.hp === 0) v.alive = false;
    }
    tg.alive = tg.units.filter((v) => v.alive).length;
    s.fighting = tg.fighting = true;
  };
  const toward = (s: Sq, x: number, y: number, stop: number, pace: number) => {
    const dx = x - s.cx, dy = y - s.cy, d = Math.hypot(dx, dy);
    if (d <= stop + 0.01) return true;
    const k = Math.min(pace, d - stop) / d;
    s.cx = q(s.cx + dx * k);
    s.cy = q(s.cy + dy * k);
    return Math.hypot(x - s.cx, y - s.cy) <= stop + 0.01;
  };

  /** The world between ticks: players' choices every 10 ticks, then every 5 ticks everyone walks, runs and trades blows. */
  const step = (t: number, calls: Call[]) => {
    for (const p of sc.players) if (p.at === t) {
      let [x, y] = [0, 0];
      if (typeof p.near[0] === 'string') {
        const g = groupOf(p.near[0], p.near[1] as number), s = g ? squads[g.squads[0]] : null;
        [x, y] = s ? [q(s.cx + p.near[2]), q(s.cy + p.near[2])] : [region.w / 2, region.h / 2];
      } else [x, y] = p.near as [number, number];
      const id = squads.length;
      squads.push({ id, owner: p.owner, team: p.team, alive: p.n, cx: x, cy: y, units: Array.from({ length: p.n }, () => ({ x, y, hp: 30, maxHp: 30, alive: true })), order: 'hold', target: -1,
        civ: false, flee: false, meek: false, angry: 0, arrived: true, dest: null, crew: -1, guarding: -1, fighting: false, calmT: 0, plan: p.plan });
    }
    if (t % 10 === 0) for (const s of squads) {
      if (!s.plan || s.alive === 0) continue;
      const act = s.plan.filter(([at]) => at <= t).pop()?.[1];
      if (!act) continue;
      const goTo = (x: number, y: number) => {
        if (Math.hypot(x - s.cx, y - s.cy) > 1.5) Object.assign(s, { order: 'move', dest: [q(x), q(y)], arrived: false });
        else Object.assign(s, { order: 'hold', dest: null, arrived: true });
      };
      const attack = (tg: Sq) => {
        if (s.order === 'attack' && s.target === tg.id) return;
        Object.assign(s, { order: 'attack', target: tg.id, dest: null, arrived: false });
        if (tg.team === NEUTRAL_TEAM) calls.push(['provoke', s.team, tg.id, null]);
      };
      if ('goal' in act) goTo(...act.goal);
      else if ('seek' in act) {
        const g = groupOf(act.seek, act.n), m = g && squads[g.squads[0]];
        if (m && m.alive > 0) goTo(m.cx + (act.off ?? 6), m.cy + (act.off ?? 6));
      } else if ('hunt' in act) {
        const g = groupOf(act.hunt, act.n), m = g && g.squads.map((id) => squads[id]).find((o) => o.alive > 0);
        if (m) attack(m);
        else goTo(s.cx, s.cy);
      } else if ('follow' in act) {
        const c = carts[act.follow];
        if (c && c.alive) goTo(c.x + 4, c.y + 3);
      } else {
        const c = carts[act.rob];
        if (!c || !c.alive || c.team !== NEUTRAL_TEAM) { goTo(s.cx, s.cy); continue; }
        let foe: Sq | null = null;
        for (const o of squads) if (o.team === NEUTRAL_TEAM && o.alive > 0 && !o.civ && d2(o, c.x, c.y) <= 100 && (!foe || d2(o, s.cx, s.cy) < d2(foe, s.cx, s.cy))) foe = o;
        if (foe) attack(foe);
        else if (Math.hypot(c.x - s.cx, c.y - s.cy) <= 2) {
          c.team = s.team;
          calls.push(['provoke', s.team, null, c.id]);
        } else {
          if (s.order !== 'move') calls.push(['provoke', s.team, null, c.id]);
          goTo(c.x, c.y);
        }
      }
    }
    if (t % 5) return;
    for (const s of squads) s.fighting = false;
    for (const s of squads) {
      if (s.alive === 0) continue;
      const pace = (s.team === NEUTRAL_TEAM ? 0.35 : 0.45) * 5;
      // civilians run from what threatens them, and calm down
      if (s.civ) {
        let th: Sq | null = null;
        for (const o of squads) if (o.alive > 0 && !o.civ && o.team !== s.team && (o.team === MOB_TEAM || ((s.angry >> o.team) & 1)) && (!th || d2(o, s.cx, s.cy) < d2(th, s.cx, s.cy))) th = o;
        const dd = th ? Math.sqrt(d2(th, s.cx, s.cy)) : Infinity;
        if (th && dd <= 10) {
          const l = dd || 1;
          Object.assign(s, { flee: true, calmT: 0, order: 'move', arrived: false, dest: [q(s.cx + ((s.cx - th.cx) / l) * 16), q(s.cy + ((s.cy - th.cy) / l) * 16)] });
        } else if (s.flee && dd > 14 && (s.calmT += 5) >= 30) s.flee = false;
      }
      if (s.order === 'attack') {
        const tg = squads[s.target];
        if (tg && tg.alive > 0 && toward(s, tg.cx, tg.cy, 1.2, pace)) hit(s, tg, s.team === MOB_TEAM ? 2 : 1.5, 0.3);
      } else if (s.order === 'move' && s.dest) {
        const c = s.crew >= 0 ? carts.find((k) => k.id === s.crew) : undefined;
        const held = !!c && sc.stuck && t >= sc.stuck[0] && t < sc.stuck[1];
        if (!held) s.arrived = toward(s, s.dest[0], s.dest[1], 0, c ? pace * 0.8 : pace);
        if (c && c.alive && c.team === NEUTRAL_TEAM && !s.flee) Object.assign(c, { x: s.cx, y: s.cy });
      } else if (s.order === 'escort') {
        const c = carts.find((k) => k.id === s.guarding);
        let foe: Sq | null = null;
        for (const o of squads) if (o.alive > 0 && o.team !== s.team && (o.team === MOB_TEAM || ((s.angry >> o.team) & 1)) && d2(o, s.cx, s.cy) <= 36) foe = o;
        if (foe) {
          if (toward(s, foe.cx, foe.cy, 1.2, pace)) hit(s, foe, 1.5, 0.3);
        } else if (c) toward(s, c.x - 2, c.y - 2, 0, pace);
      }
      // struck men hit back
      if (s.order !== 'attack') for (const o of squads) if (o.alive > 0 && o.order === 'attack' && o.target === s.id && d2(o, s.cx, s.cy) <= 4) { hit(s, o, 1.5, 0.25); break; }
    }
    for (const c of carts) {
      const dr = squads.find((s) => s.crew === c.id && s.alive > 0);
      c.moving = c.alive && c.team === NEUTRAL_TEAM && !!dr && dr.order === 'move' && !dr.arrived;
    }
  };

  const prev = new Map<number, string>(), prevCart = new Map<number, string>(), ticks: unknown[] = [];
  for (const [a, b] of sc.ranges) for (let t = a; t <= b; t++) {
    const calls: Call[] = [];
    for (const [at, k] of sc.calls) if (at === t && k[0] === 'wreck') { const c = carts[k[1] as number]; if (c) c.alive = false; }
    step(t, calls);
    const d = squads.filter((s) => prev.get(s.id) !== JSON.stringify(ser(s))).map(ser);
    const k = carts.filter((c) => prevCart.get(c.id) !== JSON.stringify(serCart(c))).map(serCart);
    ev = [];
    const c = [...sc.calls.filter(([at, x]) => at === t && x[0] !== 'wreck').map(([, x]) => x), ...calls].map((x) => [...x, call(x)]);
    roam.tick(t);
    for (const s of squads) prev.set(s.id, JSON.stringify(ser(s)));
    for (const x of carts) prevCart.set(x.id, JSON.stringify(serCart(x)));
    const rec: Record<string, unknown> = { t };
    if (d.length) rec.d = d;
    if (k.length) rec.k = k;
    if (c.length) rec.c = c;
    if (ev.length) rec.e = ev;
    const an = squads.flatMap((s) => (s.angry ? [s.id, s.angry] : []));
    if (an.length) rec.an = an;
    if (t % 25 === 0) rec.s = { any: roam.any(), snaps: roam.snaps() };
    ticks.push(rec);
  }
  return { region: sc.region, w: region.w, h: region.h, seed: sc.seed, cap: sc.cap ?? 999, ticks };
}

const SCENARIOS: Scenario[] = [
  // depth 1, bandit camps: patrols ambush a weak squad and let a strong one pass until it hurts them; a player walks
  // beside the caravan and is paid; boars charge, travellers run from a fight; then the land falls asleep and drifts
  {
    region: 'elaia-s', seed: 11, ranges: [[0, 2600]],
    players: [
      { at: 20, owner: 'w', team: 0, n: 3, near: ['patrol', 0, 8], plan: [[20, { seek: 'patrol', n: 0, off: 3 }], [600, { goal: [256.5, 256.5] }]] },
      { at: 20, owner: 's', team: 1, n: 12, near: ['patrol', 1, 9], plan: [[20, { seek: 'patrol', n: 1, off: 4 }], [300, { hunt: 'patrol', n: 1 }], [900, { goal: [30.5, 30.5] }]] },
      { at: 1, owner: 'f', team: 0, n: 4, near: ['caravan', 0, 5], plan: [[1, { follow: 0 }], [2400, { goal: [500.5, 500.5] }]] },
      { at: 30, owner: 'h', team: 2, n: 6, near: ['pack', 0, 6], plan: [[30, { seek: 'pack', n: 0, off: 2 }], [700, { goal: [480.5, 20.5] }]] },
      { at: 40, owner: 't', team: 2, n: 8, near: ['traveller', 0, 10], plan: [[40, { hunt: 'pack', n: 1 }], [800, { goal: [20.5, 480.5] }]] },
    ],
    calls: [[0, ['any']], [0, ['spawn']], [1, ['spawn']], [2, ['any']], [500, ['provoke', 6, 0, null]], [501, ['provoke', -1, 0, null]], [502, ['provoke', 7, 0, null]]],
  },
  // depth 2: ibex herds bolt; a player robs the caravan (its guards turn on him, the wagon is taken, the driver walks on
  // as a traveller); an added caravan without guards is wrecked by nobody; an added traveller band, an added pack
  {
    region: 'kimmeria', seed: 5, ranges: [[0, 2200]],
    players: [
      { at: 30, owner: 'i', team: 1, n: 6, near: ['pack', 0, 9], plan: [[30, { seek: 'pack', n: 0, off: 1 }], [400, { hunt: 'pack', n: 1 }]] },
      { at: 50, owner: 'r', team: 3, n: 12, near: ['caravan', 0, 12], plan: [[50, { rob: 0 }]] },
      { at: 60, owner: 'g', team: 0, n: 5, near: ['caravan', 0, 14], plan: [[60, { follow: 0 }]] },
    ],
    calls: [[0, ['spawn']], [100, ['add', { kind: 'caravan', route: [[100.5, 100.5], [140.5, 100.5], [180.5, 140.5]], guards: 0, at: 1 }]], [900, ['wreck', 1]],
      [120, ['add', { kind: 'traveller', route: [[300.5, 300.5], [330.5, 330.5]], cls: 'civ_cook', count: 3, pilgrim: true, at: 7 }]],
      [130, ['add', { kind: 'pack', mob: 'bear', route: [[200.5, 200.5]] }]], [131, ['add', { kind: 'patrol', route: [[220.5, 260.5], [260.5, 260.5]], count: 2 }]]],
  },
  // depth 4, no camps: patrols on the roads between ends, pilgrims; wolves hunt the weak and break off bloodied, a
  // cyclops goes for anything near; a traveller band wiped out comes back after ROAM.respawn
  {
    region: 'krios', seed: 3, ranges: [[0, 1800], [6100, 6700]],
    players: [
      { at: 20, owner: 'a', team: 0, n: 2, near: ['pack', 3, 12], plan: [[20, { seek: 'pack', n: 3, off: 12 }], [900, { goal: [256.5, 256.5] }]] },
      { at: 20, owner: 'b', team: 1, n: 12, near: ['pack', 1, 8], plan: [[20, { hunt: 'pack', n: 1 }], [1000, { goal: [20.5, 256.5] }]] },
      { at: 30, owner: 'c', team: 2, n: 12, near: ['traveller', 0, 4], plan: [[30, { hunt: 'traveller', n: 0 }], [1200, { goal: [256.5, 20.5] }]] },
      { at: 40, owner: 'd', team: 3, n: 3, near: ['patrol', 0, 10], plan: [[40, { seek: 'patrol', n: 0, off: 5 }], [1300, { goal: [256.5, 500.5] }]] },
      { at: 50, owner: 'e', team: 0, n: 10, near: ['pack', 2, 10], plan: [[50, { seek: 'pack', n: 2, off: 3 }], [300, { seek: 'pack', n: 3, off: 3 }], [500, { hunt: 'pack', n: 3 }]] },
    ],
    calls: [[0, ['spawn']]],
  },
  // depth 0, a home: half-size packs, travellers and a caravan entry to entry, a wagon stuck a while, the squad cap
  // reached (groups that cannot stand wait for their respawn), the region asleep and drifting until a player comes
  {
    region: 'dodona', seed: 8, cap: 6, ranges: [[0, 1500], [6000, 6800]], stuck: [300, 420],
    players: [
      { at: 600, owner: 'p', team: 0, n: 6, near: ['caravan', 0, 6], plan: [[600, { follow: 0 }], [1000, { hunt: 'pack', n: 0 }]] },
      { at: 610, owner: 'q', team: 1, n: 3, near: ['pack', 1, 10], plan: [[610, { seek: 'pack', n: 1, off: 8 }]] },
    ],
    calls: [[0, ['spawn']], [700, ['add', { kind: 'traveller', route: [[60.5, 60.5]] }]]],
  },
];

export const vectors = () => ({ scenarios: SCENARIOS.map(run) });
