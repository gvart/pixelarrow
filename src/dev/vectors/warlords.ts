/**
 * Rival warlords vectors (src/war/sim/warlords.ts) for the Godot port: the director run on real regions inside a small
 * fake world. The world (squads walking to their bot's or order's goal, blows traded at contact, buildings battered and
 * emptied, players on a script) lives only here: every think tick the vectors carry what of it changed (squads `q`,
 * units `u` and `ux`, buildings `b`, carts `g`, claim teams `cl`), the director calls made (`c`, with their results),
 * every host call it made (`e`: spawns with their ids, orders, piles, squads dropped, bots set and cleared) and its
 * notes (`n`); now and then its snapshots (`s`). The Godot side replays the world and checks the rest. What the probe
 * derives itself (godot/native/src/warlords_probe.cpp): a man stands at his squad's centre plus OFF[his index in it % 9];
 * the influence mask is the scenario's rectangles.
 */
import { createWarlords, type Warlords } from '../../war/sim/warlords';
import { MOB_TEAM } from '../../war/sim/mobs';
import { hashString, Rng } from '../../sim/rng';
import { parseRegion } from '../../war/region/schema';
import type { Bots } from '../../war/sim/bots';
import type { RegionData, Snapshot, WarBuildSim } from '../../war/types';

const regionFiles = import.meta.glob('../../war/regions/*.json', { eager: true, import: 'default' });

export const OFF: [number, number][] = [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5], [0.5, 0.5], [-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5]];

type Action = { goal: [number, number] } | { place: string } | { chase: number } | { stay: true };
interface Player { at: number; owner: string; team: number; n: number; x: number; y: number; hp?: number; dmg?: number; civ?: boolean; plan: [number, Action][] }
interface Bld { id: number; type: string; team: number; x: number; y: number; hp: number; state?: string; ruin?: boolean; goods?: Record<string, number> }
interface Cart { id: number; type: string; team: number; x: number; y: number; hp: number }
type Call = [string, ...unknown[]];
type World = ['claim', number, number] | ['wreck', number] | ['leave', string] | ['mobs', number, number, number];
interface Scenario {
  region: string; seed: number; cap?: number; rot?: number; ranges: [number, number][];
  /** Influence: [x0, y0, x1, y1, bits] (tiles x0..x1-1, y0..y1-1). */
  inf?: [number, number, number, number, number][];
  players: Player[]; blds?: Bld[]; carts?: Cart[]; calls: [number, Call][]; world?: [number, World][];
}

interface Sq {
  id: number; owner: string; team: number; units: number[]; order: string; cx: number; cy: number; civ: boolean; dmg: number;
  bot: { kind: string; x: number; y: number; radius?: number } | null;
  act: { kind: 'move'; x: number; y: number } | { kind: 'attackBuilding'; building?: number; siege?: number } | { kind: 'load'; building: number; since?: number } | null;
  plan?: [number, Action][];
}
interface Unit { id: number; squad: number; cls: string; hp: number; dead: boolean; deadAt: number; gone: boolean }
interface B { id: number; type: string; team: number; x: number; y: number; hp: number; maxHp: number; state: string; ruin: boolean; goods: Record<string, number> }
interface C { id: number; type: string; team: number; x: number; y: number; hp: number; state: string }

const q = (v: number) => Math.round(v * 64) / 64;
const PACE = 4;

function run(sc: Scenario) {
  const region: RegionData = parseRegion(regionFiles[`../../war/regions/${sc.region}.json`]);
  const world = new Rng(hashString(sc.region) + 17);
  const cap = sc.cap ?? 999, rot = sc.rot ?? 30;
  const squads: Sq[] = [], units: Unit[] = [];
  const blds: B[] = (sc.blds ?? []).map((b) => ({ ...b, maxHp: b.hp, state: b.state ?? 'done', ruin: b.ruin ?? false, goods: b.goods ?? {} }));
  const carts: C[] = (sc.carts ?? []).map((c) => ({ ...c, state: 'idle' }));
  const claims: number[] = (region.claimPoints ?? []).map(() => -1);
  const mask = new Uint8Array(region.w * region.h);
  for (const [x0, y0, x1, y1, bits] of sc.inf ?? []) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) mask[y * region.w + x] |= bits;
  let ev: unknown[] = [];

  const newSquad = (owner: string, team: number, n: number, x: number, y: number, cls: string, hp: number, dmg: number, lead = 1, plan?: [number, Action][]) => {
    const id = squads.length, ids: number[] = [];
    for (let i = 0; i < n; i++) {
      ids.push(units.length);
      units.push({ id: units.length, squad: id, cls, hp: i === 0 ? hp * lead : hp, dead: false, deadAt: 0, gone: false });
    }
    squads.push({ id, owner, team, units: ids, order: 'hold', cx: x, cy: y, civ: cls.startsWith('civ_'), dmg, bot: null, act: null, plan });
    return id;
  };
  const sim = {
    influence: () => ({ w: region.w, mask }),
    spawnWild(owner: string, kind: string, n: number, x: number, y: number, k: { hp: number; dmg: number; lead?: { hp: number; dmg: number; armor?: number } }) {
      const id = squads.length >= cap ? -1 : newSquad(owner, MOB_TEAM, n, x, y, `mob_${kind}`, 10 * k.hp, 1.5 * k.dmg, k.lead?.hp ?? 1);
      ev.push(['spawn', owner, kind, n, x, y, k.hp, k.dmg, k.lead?.hp ?? null, k.lead?.dmg ?? null, k.lead?.armor ?? null, id]);
      return id;
    },
    dropPile(x: number, y: number, lots: { r: string; n: number; o: string }[], items: { uid: string; def: string; rarity: string; cond: number; paint?: { emblem?: string; field?: string; ink?: string } }[]) {
      ev.push(['pile', x, y, lots.flatMap((l) => [l.r, l.n, l.o]), items.map((i) => [i.uid, i.def, i.rarity, i.cond, i.paint?.emblem ?? null, i.paint?.field ?? null, i.paint?.ink ?? null])]);
      return 0;
    },
    order(o: { kind: string; squad: number; x?: number; y?: number; building?: number; siege?: number; into?: number; from?: { building: number } }) {
      const b = o.building ?? o.from?.building;
      ev.push(['order', o.kind, o.squad, o.x ?? null, o.y ?? null, b ?? null, o.siege ?? null, o.into ?? null]);
      const s = squads[o.squad];
      if (o.kind === 'move') s.act = { kind: 'move', x: o.x!, y: o.y! };
      else if (o.kind === 'attackBuilding') s.act = { kind: 'attackBuilding', building: o.building, siege: o.siege };
      else if (o.kind === 'load') s.act = { kind: 'load', building: b! };
      else if (o.kind === 'merge') {
        const into = squads[o.into!], moved = s.units.filter((u) => !units[u].dead);
        for (const u of moved) units[u].squad = into.id;
        into.units.push(...moved);
        s.units = s.units.filter((u) => units[u].dead);
      }
    },
    dropSquad(id: number) {
      ev.push(['drop', id]);
      for (const u of squads[id].units) units[u].gone = true;
      squads[id].units = [];
    },
  };
  const bots = {
    set(id: number, b: { kind: string; x: number; y: number; radius?: number }) {
      ev.push(['bset', id, b.kind, b.x, b.y, b.radius ?? null]);
      squads[id].bot = { ...b };
      squads[id].act = null;
    },
    clear(id: number) {
      ev.push(['bclr', id]);
      squads[id].bot = null;
    },
  };
  const lords = createWarlords(region, sim as unknown as WarBuildSim, bots as unknown as Bots, sc.seed);
  if (!lords) return { region: sc.region, seed: sc.seed, none: true };
  const L: Warlords = lords;

  const alive = (s: Sq) => s.units.filter((u) => !units[u].dead);
  const hostile = (a: Sq, b: Sq) => !a.civ && !b.civ && ((a.team < 4 && b.team === MOB_TEAM) || (a.team === MOB_TEAM && b.team < 4));
  const d2 = (s: Sq, x: number, y: number) => (s.cx - x) ** 2 + (s.cy - y) ** 2;
  const nearFoe = (s: Sq, x: number, y: number, r: number) => {
    let best: Sq | null = null;
    for (const o of squads) if (hostile(s, o) && alive(o).length && d2(o, x, y) <= r * r && (!best || d2(o, s.cx, s.cy) < d2(best, s.cx, s.cy))) best = o;
    return best;
  };
  const toward = (s: Sq, x: number, y: number) => {
    const dx = x - s.cx, dy = y - s.cy, d = Math.hypot(dx, dy);
    if (d <= 1) return true;
    const k = Math.min(PACE, d - 1) / d;
    s.cx = q(s.cx + dx * k);
    s.cy = q(s.cy + dy * k);
    return Math.hypot(x - s.cx, y - s.cy) <= 1.01;
  };
  const holdAt = (place: string) => L.snaps().flatMap((w) => w.holds).find((h) => h.place === place);

  const step = (t: number) => {
    for (const p of sc.players) if (p.at === t) newSquad(p.owner, p.team, p.n, p.x, p.y, p.civ ? 'civ_farmer' : 'hoplite', p.hp ?? 30, p.dmg ?? 4, 1, p.plan);
    for (const [at, w] of sc.world ?? []) {
      if (at !== t) continue;
      if (w[0] === 'claim') claims[w[1]] = w[2];
      else if (w[0] === 'wreck') { const b = blds.find((x) => x.id === w[1])!; Object.assign(b, { hp: 0, state: 'destroyed', ruin: true }); }
      else if (w[0] === 'leave') {
        for (const s of squads) if (s.owner === w[1]) { for (const u of s.units) units[u].gone = true; s.units = []; }
      } else newSquad('mobs', MOB_TEAM, w[1], w[2], w[3], 'mob_wolf', 10, 1);
    }
    for (const s of squads) {
      if (!alive(s).length) continue;
      if (s.plan) {
        const act = s.plan.filter(([at]) => at <= t).pop()?.[1];
        if (!act || 'stay' in act) continue;
        if ('goal' in act) toward(s, ...act.goal);
        else if ('place' in act) { const h = holdAt(act.place); if (h) toward(s, h.x, h.y); }
        else {
          let best: Sq | null = null;
          for (const o of squads) if (o.owner.startsWith('warlord:') && alive(o).length && d2(o, s.cx, s.cy) <= act.chase ** 2 && (!best || d2(o, s.cx, s.cy) < d2(best, s.cx, s.cy))) best = o;
          if (best) toward(s, best.cx, best.cy);
        }
        continue;
      }
      if (s.act) {
        const a = s.act;
        if (a.kind === 'move') toward(s, a.x, a.y);
        else {
          const tg = a.kind === 'load' || a.building !== undefined ? blds.find((b) => b.id === (a.kind === 'load' ? a.building : a.building)) : carts.find((c) => c.id === a.siege);
          if (tg && toward(s, tg.x, tg.y)) {
            if (a.kind === 'load') {
              a.since ??= t;
              if (t - a.since >= 40) { (tg as B).goods = {}; s.act = null; }
            } else if (tg.state !== 'destroyed') {
              tg.hp = Math.max(0, tg.hp - alive(s).length * 2);
              tg.state = tg.hp <= 0 ? 'destroyed' : 'damaged';
              if ('ruin' in tg) tg.ruin = tg.hp <= 0;
            }
          }
        }
      } else if (s.bot) {
        const b = s.bot, foe = nearFoe(s, b.kind === 'hold' ? b.x : s.cx, b.kind === 'hold' ? b.y : s.cy, b.kind === 'hold' ? (b.radius ?? 10) : 12);
        if (foe) toward(s, foe.cx, foe.cy);
        else toward(s, b.x, b.y);
      }
      s.order = s.act ? s.act.kind : s.bot ? (s.bot.kind === 'hold' ? 'hold' : 'move') : 'hold';
    }
    // blows at contact
    for (const s of squads) {
      const mine = alive(s);
      if (!mine.length) continue;
      const foe = squads.find((o) => hostile(s, o) && alive(o).length && d2(o, s.cx, s.cy) <= 9);
      if (!foe) continue;
      for (const u of mine) {
        if (!world.chance(0.35)) continue;
        const live = alive(foe);
        if (!live.length) break;
        const v = units[world.pick(live)];
        v.hp = q(v.hp - s.dmg);
        if (v.hp <= 0) Object.assign(v, { dead: true, deadAt: t });
        void u;
      }
    }
    for (const u of units) if (u.dead && !u.gone && t - u.deadAt >= rot) {
      u.gone = true;
      const s = squads[u.squad];
      s.units = s.units.filter((x) => x !== u.id);
    }
  };

  const snapshot = (t: number): Snapshot => ({
    tick: t,
    units: units.filter((u) => !u.gone).map((u) => {
      const s = squads[u.squad], k = s.units.indexOf(u.id), o = OFF[k % 9];
      return { id: u.id, squad: u.squad, x: s.cx + o[0], y: s.cy + o[1], cls: u.cls, state: u.dead ? 'dead' : 'idle' };
    }),
    squads: squads.map((s) => ({ id: s.id, owner: s.owner, team: s.team, units: [...s.units], order: s.order })),
    buildings: blds.map((b) => ({ id: b.id, type: b.type, team: b.team, x: b.x, y: b.y, state: b.state, ruin: b.ruin || undefined, goods: b.goods })),
    sieges: carts.map((c) => ({ id: c.id, type: c.type, team: c.team, x: c.x, y: c.y, state: c.state })),
    claims: claims.map((team, id) => ({ id, team })),
  }) as unknown as Snapshot;

  const call = ([name, ...a]: Call): unknown => {
    switch (name) {
      case 'age': return L.setAge(a[0] as number) ?? null;
      case 'players': return L.setPlayers(a[0] as number) ?? null;
      case 'raidNow': return (a[0] === null ? L.raidNow() : L.raidNow(a[0] as number)) ?? null;
      case 'men': return L.men();
      case 'memory': { const m = L.memory(); return [Object.entries(m.fallen), Object.entries(m.freed).map(([k, v]) => [k, Object.entries(v)])]; }
      case 'recall': return L.recall(a[0] as never) ?? null;
      case 'fell': return L.fell(a[0] as string, a[1] as number) ?? null;
      case 'snaps': return L.snaps();
      default: throw new Error(name);
    }
  };

  const serSq = (s: Sq) => [s.id, s.owner, s.team, s.cx, s.cy, s.order, [...s.units]];
  const serU = (u: Unit) => [u.id, u.squad, u.cls, u.dead ? 1 : 0];
  const prevSq = new Map<number, string>(), prevU = new Map<number, string>();
  let prevB = '', prevG = '', prevCl = '', last = -2;
  const ticks: unknown[] = [];
  for (const [a, b] of sc.ranges) for (let t = a; t <= b; t++) {
    const think = t % 10 === 0, here = sc.calls.filter(([at]) => at === t);
    const rec: Record<string, unknown> = { t };
    if (t !== last + 1) rec.j = 1;
    last = t;
    if (think) {
      step(t);
      const qd = squads.filter((s) => prevSq.get(s.id) !== JSON.stringify(serSq(s))).map(serSq);
      const ud = units.filter((u) => !u.gone && prevU.get(u.id) !== JSON.stringify(serU(u))).map(serU);
      const ux = units.filter((u) => u.gone && prevU.has(u.id)).map((u) => u.id);
      for (const s of squads) prevSq.set(s.id, JSON.stringify(serSq(s)));
      for (const u of units) if (u.gone) prevU.delete(u.id); else prevU.set(u.id, JSON.stringify(serU(u)));
      if (qd.length) rec.q = qd;
      if (ud.length) rec.u = ud;
      if (ux.length) rec.ux = ux;
      const bs = JSON.stringify(blds), gs = JSON.stringify(carts), cs = JSON.stringify(claims);
      if (bs !== prevB) rec.b = blds.map((x) => [x.id, x.type, x.team, x.x, x.y, x.state, x.ruin ? 1 : 0, Object.entries(x.goods).flat()]);
      if (gs !== prevG) rec.g = carts.map((x) => [x.id, x.type, x.team, x.x, x.y, x.state]);
      if (cs !== prevCl) rec.cl = [...claims];
      [prevB, prevG, prevCl] = [bs, gs, cs];
    }
    ev = [];
    if (here.length) rec.c = here.map(([, x]) => [...x, call(x)]);
    const notes = L.tick(think ? snapshot(t) : ({ tick: t } as Snapshot));
    if (ev.length) rec.e = ev;
    if (notes.length) rec.n = notes.map((n) => [n.t, n.what, n.warlord, n.name, n.text, n.x, n.y, n.place ?? null, n.team ?? null, n.in ?? null]);
    if (think && (t % 200 === 0 || notes.length)) rec.s = { snaps: L.snaps(), men: L.men() };
    if (think || here.length || rec.j) ticks.push(rec);
  }
  return { region: sc.region, seed: sc.seed, cap, inf: sc.inf ?? [], ticks };
}

const SCENARIOS: Scenario[] = [
  // his seat, depth 2: a fresh room lays his hall and a camp; with players he takes a third; a raid on a granary loads
  // its goods, batters it down and comes home to a full garrison (it holds beside it); two players free a camp, then
  // cut down the lord in his hall while a second raid (on a guarded house) is out; his bands walk off; he comes back
  {
    region: 'kleisoura', seed: 3, ranges: [[0, 9500], [30000, 30600]],
    blds: [
      { id: 40, type: 'granary', team: 0, x: 390.5, y: 232.5, hp: 300, goods: { grain: 6, wood: 0 } },
      { id: 41, type: 'house2', team: 0, x: 300.5, y: 270.5, hp: 5000 },
      { id: 42, type: 'brazier', team: 0, x: 330.5, y: 200.5, hp: 50 },
    ],
    players: [
      { at: 10, owner: 'g', team: 0, n: 3, x: 302.5, y: 272.5, plan: [[10, { stay: true }]] },
      { at: 1400, owner: 'p', team: 0, n: 12, x: 380.5, y: 170.5, hp: 60, dmg: 6, plan: [[1400, { place: 'l1' }], [7400, { place: 'c0' }]] },
      { at: 1400, owner: 'p2', team: 1, n: 12, x: 385.5, y: 160.5, hp: 60, dmg: 6, plan: [[1400, { place: 'l1' }], [7400, { place: 'c0' }], [9000, { goal: [500.5, 500.5] }]] },
    ],
    calls: [[0, ['age', 4]], [0, ['players', 0]], [0, ['snaps']], [50, ['players', 2]], [60, ['raidNow', 0]], [61, ['men']], [2000, ['memory']],
      [9400, ['memory']], [30000, ['age', 7.5]], [30010, ['snaps']], [30500, ['memory']]],
  },
  // over the border, depth 1: nothing before day 1, then a band from the border to a camp (a place under foreign ground
  // bits only still his, a claimed point and alliance ground skipped); a raid on an empty house (its civilians no
  // guard), home into the garrison; a raid on a handcart cut down by a player; the claimed point freed to him; a
  // reinforcement skipped while a foe stands near, then sent; he falls in another room and his men walk off
  {
    region: 'dodona-e', seed: 9, ranges: [[0, 7000], [11900, 14200]],
    inf: [[310, 280, 330, 300, 16], [80, 348, 92, 360, 2]],
    blds: [
      { id: 50, type: 'house', team: 0, x: 360.5, y: 330.5, hp: 400 },
      { id: 51, type: 'woodTower', team: 0, x: 330.5, y: 300.5, hp: 400 },
      { id: 52, type: 'house', team: 6, x: 325.5, y: 295.5, hp: 400 },
      { id: 53, type: 'barracks', team: 1, x: 330.5, y: 320.5, hp: 400, state: 'building' },
      { id: 54, type: 'farm', team: 2, x: 335.5, y: 285.5, hp: 400, state: 'damaged', ruin: true },
    ],
    carts: [{ id: 60, type: 'handcart', team: 3, x: 300.5, y: 340.5, hp: 200 }, { id: 61, type: 'ram', team: 3, x: 305.5, y: 300.5, hp: 200 }, { id: 62, type: 'wagon', team: 7, x: 310.5, y: 330.5, hp: 200 }],
    players: [
      { at: 10, owner: 'c', team: 0, n: 8, x: 361.5, y: 331.5, civ: true, plan: [[10, { stay: true }]] },
      { at: 3000, owner: 'k', team: 1, n: 12, x: 280.5, y: 345.5, hp: 50, dmg: 6, plan: [[3000, { chase: 60 }], [4500, { goal: [100.5, 480.5] }]] },
      { at: 11990, owner: 'w', team: 0, n: 2, x: 319.5, y: 306.5, plan: [[11990, { stay: true }]] },
    ],
    world: [[0, ['claim', 0, 2]], [0, ['mobs', 3, 330.5, 280.5]], [5200, ['claim', 0, 7]], [12100, ['leave', 'w']]],
    calls: [[0, ['age', 0.5]], [0, ['players', 1]], [20, ['age', 1.5]], [900, ['raidNow', 0]], [2600, ['players', 2]], [2600, ['raidNow', 0]],
      [4000, ['raidNow', 0]], [5000, ['age', 7.5]], [5000, ['players', 3]], [11900, ['snaps']], [11900, ['age', 10]], [13000, ['fell', 'harpalos', 10.1]], [14100, ['memory']], [14100, ['men']]],
  },
  // her seat, the squad cap reached: what cannot stand is not sent (a raid warned but never ridden, reinforcements); the
  // dead leave the field at once (her fall is marked at her hall); falls from other rooms that change nothing
  {
    region: 'stymphalia', seed: 1, cap: 3, rot: 0, ranges: [[0, 7700]],
    blds: [{ id: 70, type: 'house', team: 1, x: 320.5, y: 300.5, hp: 400 }],
    players: [
      { at: 10, owner: 'a', team: 2, n: 12, x: 400.5, y: 400.5, hp: 80, dmg: 8, plan: [[10, { stay: true }], [6100, { place: 'c0' }]] },
    ],
    calls: [[0, ['age', 6]], [0, ['players', 1]], [20, ['raidNow', 0]], [5900, ['age', 8.2]], [5950, ['players', 3]], [7000, ['fell', 'kelaino', 1]], [7010, ['fell', 'nobody', 8.2]],
      [7020, ['memory']], [7030, ['fell', 'kelaino', 8]], [7040, ['memory']]],
  },
  // over the border into the dunes: a fresh room with nobody here lays a den (one player assumed) and only holds; a
  // place freed in another room kept free; with players a band walks to a claim point; a raid on a wagon
  {
    region: 'kyrene-n', seed: 4, ranges: [[0, 2500]],
    carts: [{ id: 80, type: 'wagon', team: 1, x: 400.5, y: 170.5, hp: 200 }],
    players: [],
    calls: [[0, ['age', 2.5]], [0, ['players', 0]], [5, ['recall', { fallen: {}, freed: { auge: { l0: 4.45 } } }]], [30, ['age', 4.5]], [30, ['players', 2]],
      [40, ['raidNow', 300]], [2490, ['memory']], [2490, ['snaps']]],
  },
  // no warlord's domain
  { region: 'dodona', seed: 1, ranges: [[0, 0]], players: [], calls: [] },
];

export const vectors = () => ({ off: OFF, scenarios: SCENARIOS.map(run) });
export const debugRun = (i: number) => run(SCENARIOS[i]);
