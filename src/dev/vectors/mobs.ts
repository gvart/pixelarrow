/**
 * Mob vectors (src/war/sim/mobs.ts) for the Godot port: the lair controller run on four real regions inside a small
 * fake world. The world (squads walking at their order's goal, blows traded in reach, players hunting lairs and
 * channelling claim points) lives only here: per tick the vectors carry the squads it changed (`d`, the full squad), the
 * controller calls made (`c`, with their results), every host call the controller made (`e`) and the units' hp after
 * the tick; every 50 ticks the lair and claim snapshots. The Godot side replays the squads and calls and checks the rest.
 * The host's own reactions (order sets the squad's order, target and arrived; spawn lays the men out; influence is the
 * claimed circles) are mirrored in godot/native/src/wild_probe.cpp.
 */
import { createMobs, foesWord, MOB_TEAM, mobClass, mobKindOf, MOB_KINDS, type MobHost, type MobSquad, type MobUnit, type SpawnScale } from '../../war/sim/mobs';
import { hashString, Rng } from '../../sim/rng';
import { parseRegion } from '../../war/region/schema';
import type { MobKind, NodeSnap, Order, RegionData } from '../../war/types';

const regionFiles = import.meta.glob('../../war/regions/*.json', { eager: true, import: 'default' });

type Unit = MobUnit & { id: number };
interface Sq extends MobSquad { units: Unit[]; arrived: boolean; dest: [number, number] | null; ranged?: boolean; plan?: [number, Action][] }
type Action = { goal: [number, number]; flee?: true } | { claim: number };
interface Player { at: number; owner: string; team: number; x: number; y: number; n: number; ranged?: boolean; plan: [number, Action][] }
type Call = [string, ...unknown[]];
interface Scenario {
  region: string; ranges: [number, number][]; players: Player[]; calls: [number, Call][];
  nodes?: [number, number, boolean][]; towers?: [number, number][]; carts?: [number, number, number][];
}

const q = (v: number) => Math.round(v * 64) / 64;
const ser = (s: Sq) => [s.id, s.owner, s.team, s.alive, s.civ ? 1 : 0, s.cx, s.cy, s.order, s.target, s.claimPt, s.arrived ? 1 : 0, s.units.flatMap((u) => [u.id, u.x, u.y, u.hp, u.maxHp, u.alive ? 1 : 0])];

function run(sc: Scenario) {
  const region: RegionData = parseRegion(regionFiles[`../../war/regions/${sc.region}.json`]);
  const rng = new Rng(hashString(sc.region) + 3), world = new Rng(hashString(sc.region) + 77);
  const squads: Sq[] = [], circles: [number, number, number, number][] = [];
  let ev: unknown[] = [];
  const nodes: NodeSnap[] = (sc.nodes ?? []).map(([x, y, obj], id) => ({ id, res: 'wood', x, y, amount: 10, max: 10, ...(obj ? { obj: id } : {}) }) as NodeSnap);
  const towers = (sc.towers ?? []).map(([x, y], i) => ({ id: 900 + i, x, y }));
  const carts = (sc.carts ?? []).map(([x, y, team], i) => ({ id: 800 + i, x, y, team }));
  const centre = (s: Sq) => {
    let x = 0, y = 0, n = 0;
    for (const u of s.units) if (u.alive) (x += u.x), (y += u.y), n++;
    if (n) (s.cx = q(x / n)), (s.cy = q(y / n));
    s.alive = n;
  };
  const host: MobHost = {
    squads, w: region.w, h: region.h,
    spawn(kind: MobKind, count: number, x: number, y: number, k: SpawnScale) {
      const id = squads.length;
      const units = Array.from({ length: count }, (_, i) => {
        const hp = 10 * k.hp * (i === 0 && k.lead ? k.lead.hp : 1);
        return { id: id * 100 + i, x: x + ((i % 3) - 1) * 0.5, y: y + ((Math.floor(i / 3) % 3) - 1) * 0.5, hp, maxHp: hp, alive: true };
      });
      squads.push({ id, owner: 'mob', team: MOB_TEAM, alive: count, cx: x, cy: y, units, order: 'hold', target: -1, claimPt: -1, arrived: true, dest: null });
      ev.push(['spawn', kind, count, x, y, k.hp, k.dmg, k.lead?.hp ?? null, k.lead?.dmg ?? null, k.lead?.armor ?? null]);
      return id;
    },
    order(o: Order) {
      const a = o as { x?: number; y?: number; target?: number; siege?: number; shape?: string };
      ev.push(['order', o.kind, o.squad, a.x ?? null, a.y ?? null, a.target ?? null, a.siege ?? null, a.shape ?? null]);
      const s = squads[o.squad!];
      if (o.kind === 'formation') return;
      s.order = o.kind;
      if (o.kind === 'attack') s.target = a.target!;
      s.arrived = o.kind === 'hold';
      s.dest = o.kind === 'move' ? [a.x!, a.y!] : o.kind === 'attackBuilding' ? (([c]) => (c ? [c.x, c.y] as [number, number] : null))(carts.filter((c) => c.id === a.siege)) : null;
    },
    arrived(id) {
      const r = squads[id].arrived;
      ev.push(['arr', id, r]);
      return r;
    },
    nodes() { ev.push(['nodes']); return nodes; },
    lockNodes(ids, on) { ev.push(['lock', [...ids], on]); },
    claim(team, x, y, r, from) { ev.push(['claim', team, x, y, r, from ?? null]); circles.push([team, x, y, r]); },
    influenced(x, y) {
      const r = circles.some(([, cx, cy, cr]) => (x - cx) ** 2 + (y - cy) ** 2 <= cr * cr);
      ev.push(['inf', x, y, r]);
      return r;
    },
    range: (lo, hi) => rng.range(lo, hi),
    held(on) { ev.push(['held', on]); },
    captainDown(lair, by) { ev.push(['capDown', lair, by]); },
    towers() { ev.push(['towers']); return towers; },
    ...(sc.carts ? { carts() { ev.push(['carts']); return carts; } } : {}),
    chiefDown(lair, chief, x, y, by) { ev.push(['chiefDown', lair, chief.id, x, y, by]); },
    note(e) { ev.push(['note', e.kind, e.lair, e.mob, e.x, e.y]); },
  };
  const mobs = createMobs(region, host);
  const call = ([name, ...a]: Call): unknown => {
    switch (name) {
      case 'spawn': return mobs.spawn() ?? null;
      case 'add': return mobs.add(a[0] as Parameters<typeof mobs.add>[0]);
      case 'setBoss': return mobs.setBoss(a[0] as string | null) ?? null;
      case 'bossDown': return mobs.bossDown((a[0] as string | null) ?? undefined) ?? null;
      case 'grant': return mobs.grant(a[0] as number, a[1] as number) ?? null;
      case 'claim': {
        const ok = mobs.startClaim(a[0] as number, a[1] as number), s = squads[a[0] as number];
        if (ok) Object.assign(s, { order: 'claimRegion', claimPt: a[1], arrived: false, dest: [mobs.claimPoint(a[1] as number).x, mobs.claimPoint(a[1] as number).y] });
        return ok;
      }
      default: throw new Error(name);
    }
  };

  /** The world between ticks: players' choices, then everyone walks and trades blows. */
  const step = (t: number, calls: Call[]) => {
    for (const p of sc.players) if (p.at === t) {
      const id = squads.length;
      const units = Array.from({ length: p.n }, (_, i) => ({ id: id * 100 + i, x: q(p.x + ((i % 4) - 1.5) * 0.75), y: q(p.y + (Math.floor(i / 4) - 1) * 0.75), hp: 40, maxHp: 40, alive: true }));
      squads.push({ id, owner: p.owner, team: p.team, alive: p.n, cx: p.x, cy: p.y, units, order: 'hold', target: -1, claimPt: -1, arrived: true, dest: null, ranged: p.ranged, plan: p.plan });
    }
    if (t % 10 === 0) for (const s of squads) {
      if (!s.plan || s.alive === 0 || s.order === 'claimRegion') continue;
      const act = s.plan.filter(([at]) => at <= t).pop()?.[1];
      let foe: Sq | null = null, fd = act && 'flee' in act ? -1 : 40;
      for (const o of squads) if (o.team === MOB_TEAM && o.alive > 0 && Math.hypot(o.cx - s.cx, o.cy - s.cy) <= fd) (fd = Math.hypot(o.cx - s.cx, o.cy - s.cy)), (foe = o);
      if (foe) {
        Object.assign(s, { order: 'attack', target: foe.id, arrived: false, dest: null });
        continue;
      }
      if (act && 'goal' in act) {
        if (Math.hypot(act.goal[0] - s.cx, act.goal[1] - s.cy) > 1) Object.assign(s, { order: 'move', dest: act.goal, arrived: false });
        else Object.assign(s, { order: 'hold', dest: null, arrived: true });
      } else if (act && mobs.claimPoint(act.claim).team !== s.team) calls.push(['claim', s.id, act.claim]);
    }
    for (const s of squads) {
      if (s.alive === 0) continue;
      const tg = s.order === 'attack' ? squads[s.target] : undefined;
      const dest = tg ? (tg.alive > 0 ? [tg.cx, tg.cy] : null) : s.dest;
      const reach = s.ranged ? 11 : 1.5;
      if (dest) {
        const dx = dest[0] - s.cx, dy = dest[1] - s.cy, d = Math.hypot(dx, dy), pace = s.team === MOB_TEAM ? 0.5 : 0.4;
        const stop = tg ? reach - 0.5 : 0;
        if (d > stop + 0.01) {
          const k = Math.min(pace, d - stop) / d;
          for (const u of s.units) if (u.alive) (u.x = q(u.x + dx * k)), (u.y = q(u.y + dy * k));
          centre(s);
        }
        if (!tg && (s.order === 'move' || s.order === 'claimRegion' || s.order === 'attackBuilding')) s.arrived = Math.hypot(dest[0] - s.cx, dest[1] - s.cy) <= pace;
      }
      if (tg && tg.alive > 0 && Math.hypot(tg.cx - s.cx, tg.cy - s.cy) <= reach + 1) {
        const dmg = s.team === MOB_TEAM ? 1.5 : 1, p = s.team === MOB_TEAM ? 0.25 : 0.2;
        for (const u of s.units) {
          if (!u.alive || !world.chance(p)) continue;
          const live = tg.units.filter((v) => v.alive);
          if (!live.length) break;
          const v = world.pick(live);
          v.hp = Math.max(0, v.hp - dmg);
          if (v.hp === 0) v.alive = false;
        }
        centre(tg);
      }
    }
  };

  const prev = new Map<number, string>(), ticks: unknown[] = [];
  for (const [a, b] of sc.ranges) for (let t = a; t <= b; t++) {
    const calls: Call[] = [];
    step(t, calls);
    const d = squads.filter((s) => prev.get(s.id) !== JSON.stringify(ser(s))).map(ser);
    ev = [];
    const c = [...sc.calls.filter(([at]) => at === t).map(([, k]) => k), ...calls].map((k) => [...k, call(k)]);
    mobs.tick(t);
    for (const s of squads) prev.set(s.id, JSON.stringify(ser(s)));
    let hp = 0;
    for (const s of squads) for (const u of s.units) hp += u.hp;
    const rec: Record<string, unknown> = { t, hp };
    if (d.length) rec.d = d;
    if (c.length) rec.c = c;
    if (ev.length) rec.e = ev;
    if (t % 50 === 0) {
      rec.s = { lairs: mobs.lairSnaps(), claims: mobs.claimSnaps(), held: mobs.held(), claimed: mobs.claimed(), added: mobs.added(),
        bosses: mobs.bosses().map((g) => [g.id, g.alive]), hps: squads.flatMap((s) => s.units.map((u) => u.hp)) };
    }
    ticks.push(rec);
  }
  return { region: sc.region, w: region.w, h: region.h, seed: hashString(sc.region) + 3, nodes: sc.nodes ?? [], towers, carts: sc.carts ? carts : null, ticks };
}

const SCENARIOS: Scenario[] = [
  // depth 1: an added lair before and after spawn, a boss gate for a while, team 0 claims the open point, team 1 comes
  // to take it (contested, defended, then taken once team 0 leaves), a chief bear and wolves cleared, a wolf lair back
  // after its respawn time, a point granted
  {
    region: 'dodona-n', ranges: [[0, 2400], [6280, 6700]],
    players: [
      { at: 0, owner: 'a', team: 0, x: 184.5, y: 440.5, n: 6, plan: [[0, { claim: 1 }], [1500, { goal: [184.5, 380.5] }]] },
      { at: 0, owner: 'b', team: 0, x: 190.5, y: 445.5, n: 5, plan: [[0, { claim: 1 }], [1500, { goal: [200.5, 380.5] }]] },
      { at: 0, owner: 'a', team: 0, x: 94.5, y: 290.5, n: 12, plan: [[0, { goal: [70.5, 230.5] }], [700, { goal: [140.5, 150.5] }], [2300, { goal: [75.5, 205.5] }], [6500, { goal: [75.5, 150.5], flee: true }]] },
      { at: 900, owner: 'c', team: 1, x: 184.5, y: 400.5, n: 8, plan: [[900, { claim: 1 }]] },
    ],
    calls: [[0, ['add', { kind: 'wolf', x: 120.5, y: 300.5, count: 3 }]], [0, ['spawn']], [5, ['add', { kind: 'boar', x: 90.5, y: 260.5, lead: true }]],
      [5, ['claim', 0, 0]], [50, ['setBoss', 'moor_bear']], [60, ['setBoss', 'moor_bear']], [150, ['bossDown', null]], [6400, ['grant', 0, 1]], [6401, ['grant', 0, 1]], [2002, ['grant', 1, -1]], [2003, ['grant', 9, 1]], [6300, ['spawn']]],
    nodes: [[213.5, 240.5, true], [216.5, 237.5, false], [281.5, 135.5, true], [94.5, 310.5, true], [300.5, 300.5, true]],
  },
  // lions and jackals break off once bloodied (not the chief's), an archer squad hurts a pack from outside its aggro
  {
    region: 'kyrene-n', ranges: [[0, 1800]],
    players: [
      { at: 0, owner: 'a', team: 0, x: 309.5, y: 356.5, n: 12, plan: [[0, { goal: [309.5, 336.5] }]] },
      { at: 0, owner: 'r', team: 0, x: 350.5, y: 75.5, n: 8, ranged: true, plan: [[0, { goal: [350.5, 75.5] }]] },
      { at: 0, owner: 'd', team: 2, x: 158.5, y: 410.5, n: 12, plan: [[0, { goal: [158.5, 430.5] }]] },
      { at: 300, owner: 'e', team: 2, x: 117.5, y: 150.5, n: 12, plan: [[300, { goal: [117.5, 131.5] }], [320, { goal: [117.5, 200.5], flee: true }], [500, { goal: [117.5, 131.5] }]] },
    ],
    calls: [[0, ['spawn']], [1, ['spawn']], [400, ['claim', 0, 1]], [401, ['claim', 3, 0]], [402, ['claim', 99, 0]]],
  },
  // a herd that bolts, bandit lairs (no loose formation) guarding nodes, chiefs among bandits
  {
    region: 'kimmeria', ranges: [[0, 1500]],
    players: [
      { at: 0, owner: 'a', team: 0, x: 61.5, y: 445.5, n: 6, plan: [[0, { goal: [61.5, 432.5] }], [400, { goal: [100.5, 400.5] }]] },
      { at: 0, owner: 'b', team: 0, x: 185.5, y: 365.5, n: 12, plan: [[0, { goal: [185.5, 345.5] }]] },
      { at: 0, owner: 'c', team: 1, x: 438.5, y: 385.5, n: 12, plan: [[0, { goal: [438.5, 365.5] }]] },
    ],
    calls: [[0, ['spawn']]],
    nodes: [[185.5, 345.5, true], [190.5, 341.5, true], [195.5, 350.5, true], [61.5, 425.5, true], [438.5, 370.5, false], [438.5, 371.5, true]],
  },
  // a bandit host: the captain's guard posted on towers, the boss holding the region, the captain killed, a raid on a
  // cart once HOST.raid.every comes round, the boss falls and the zone opens
  {
    region: 'ammon', ranges: [[0, 500], [17950, 18400]],
    players: [
      { at: 0, owner: 'a', team: 0, x: 205.5, y: 310.5, n: 12, plan: [[0, { goal: [205.5, 325.5] }]] },
      { at: 0, owner: 'b', team: 0, x: 180.5, y: 300.5, n: 12, plan: [[0, { goal: [185.5, 320.5] }]] },
    ],
    calls: [[0, ['setBoss', 'bandit_king']], [0, ['spawn']], [18200, ['bossDown', 'bandit_king']], [18250, ['claim', 0, 0]]],
    towers: [[230.5, 268.5], [262.5, 365.5], [360.5, 380.5], [480.5, 20.5]],
    carts: [[250.5, 300.5, 0], [100.5, 100.5, 0]],
  },
];

export const vectors = () => ({
  scenarios: SCENARIOS.map(run),
  words: [...MOB_KINDS.map(mobClass), 'militia', 'mob_', 'mob_dragon', 'hoplite'].flatMap((c) => [1, 2, 6].map((n) => [c, n, foesWord(c, n), mobKindOf(c)])),
});
