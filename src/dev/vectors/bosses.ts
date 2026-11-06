/**
 * Guardian vectors (src/war/sim/bosses.ts, bossLoot.ts) for the Godot port: every guardian run on its real region inside
 * a small fake world. The world (players walking to goals or hunting the nearest mob squad, mob squads walking at their
 * order's goal, blows traded in reach every 10 ticks) lives only here: per tick the vectors carry what it changed (`nu`/`nq`
 * new men and squads, `du`/`dq` men and squads moved or hurt), the controller calls made (`c`: the world's hit and struck,
 * and the scripted ones), every host call (`e`), and the men and squads the calls and the tick changed (`a`, `aq`); every
 * 25 ticks and on each tick with a host call the snapshots. The host's own reactions (spawn lays men out over a bear's stats, hurt and vanish kill, place
 * moves, order sets order and target; water, open and level from the scenario's rects; claimed from its spans) are
 * mirrored in godot/native/src/boss_probe.cpp. Then the loot: bossLoot for many seeds, bossPile for many kills.
 */
import { createBosses, type BossHost, type BSquad, type BUnit } from '../../war/sim/bosses';
import { bossPile, type BossSlain } from '../../war/sim/bossLoot';
import { bossLoot, WAR_BOSSES } from '../../data/warBosses';
import { warStats, type WarStats } from '../../war/sim/classes';
import { hashString, Rng } from '../../sim/rng';
import { parseRegion } from '../../war/region/schema';
import { MOB_TEAM } from '../../war/sim/mobs';
import { NEUTRAL_TEAM } from '../../war/sim/economy';
import type { Order, RegionData, WarEvent } from '../../war/types';

const regionFiles = import.meta.glob('../../war/regions/*.json', { eager: true, import: 'default' });

type Rect = [number, number, number, number, number];
type Act = { goal: [number, number] } | { hunt: number };
interface Player { at: number; owner: string; team: number; cls: string; x: number; y: number; n: number; plan: [number, Act][] }
type Call = [string, ...unknown[]];
interface Scenario {
  region: string; ranges: [number, number][]; players: Player[]; calls: [number, Call][];
  water?: Rect[]; walls?: Rect[]; levels?: Rect[]; claimed?: [number, number][];
}
interface Sq extends BSquad { dest: [number, number] | null; plan?: [number, Act][] }

const q = (v: number) => Math.round(v * 64) / 64;
const inRect = (rs: Rect[] | undefined, x: number, y: number) => (rs ?? []).find(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1);
const ST = ['maxHp', 'dmg', 'armor', 'reach', 'atkTicks', 'speed', 'block', 'range', 'ammo', 'rangedDmg', 'knock'] as const;
const serU = (u: BUnit) => [u.id, u.squad.id, u.cls, u.x, u.y, u.hp, u.maxHp, u.alive ? 1 : 0, u.facing, u.pin ? 1 : 0, u.aloft, u.immune ? 1 : 0, u.venom ? 1 : 0, u.boss,
  ...ST.map((k) => u.st[k] ?? 0)];
const serS = (s: Sq) => [s.id, s.owner, s.team, s.alive, s.cx, s.cy, s.order, s.target, s.units.map((u) => u.id)];
const notePlain = (e: WarEvent) => JSON.parse(JSON.stringify(e)) as Record<string, unknown>;

function run(sc: Scenario) {
  const region: RegionData = parseRegion(regionFiles[`../../war/regions/${sc.region}.json`]);
  const seed = hashString(sc.region) + 5, rng = new Rng(seed), world = new Rng(hashString(sc.region) + 91);
  const units: BUnit[] = [], squads: Sq[] = [], base = warStats('mob_bear');
  const slain: BossSlain[] = [];
  let ev: unknown[] = [], tick = 0;
  const centre = (s: Sq) => {
    let x = 0, y = 0, n = 0;
    for (const u of s.units) if (u.alive) (x += u.x), (y += u.y), n++;
    if (n) (s.cx = q(x / n)), (s.cy = q(y / n));
    s.alive = n;
  };
  const kill = (u: BUnit) => {
    if (!u.alive) return;
    u.alive = false;
    u.squad.alive--;
  };
  const host: BossHost = {
    units, squads, w: region.w, h: region.h, mobTeam: MOB_TEAM, neutralTeam: NEUTRAL_TEAM,
    spawn(cls, count, x, y, st, boss) {
      const id = squads.length, s: Sq = { id, team: MOB_TEAM, owner: 'mob', alive: count, cx: x, cy: y, units: [], order: 'hold', target: -1, dest: null };
      const full = { ...base, ...st } as WarStats;
      for (let i = 0; i < count; i++) {
        const u: BUnit = { id: units.length, x: x + ((i % 4) - 1.5) * 0.75, y: y + (Math.floor(i / 4) - 1) * 0.75, hp: full.maxHp, maxHp: full.maxHp, alive: true, cls, st: { ...full },
          facing: 0, pin: false, aloft: 0, immune: false, venom: false, boss, squad: s };
        units.push(u);
        s.units.push(u);
      }
      squads.push(s);
      ev.push(['spawn', cls, count, x, y, ST.map((k) => st[k] ?? null), boss]);
      return id;
    },
    order(o: Order) {
      const a = o as { x?: number; y?: number; target?: number };
      ev.push(['order', o.kind, o.squad, a.x ?? null, a.y ?? null, a.target ?? null]);
      const s = squads[o.squad!];
      s.order = o.kind;
      if (o.kind === 'attack') s.target = a.target!;
      s.dest = o.kind === 'move' ? [a.x!, a.y!] : null;
    },
    hurt(u, dmg, venom) {
      ev.push(['hurt', u.id, dmg, venom ? 1 : 0]);
      u.hp = Math.max(0, u.hp - dmg);
      if (u.hp === 0) kill(u);
    },
    knock(u, fx, fy, tiles) { ev.push(['knock', u.id, fx, fy, tiles]); },
    slow(u, ticks) { ev.push(['slow', u.id, ticks]); },
    place(u, x, y) {
      ev.push(['place', u.id, x, y]);
      u.x = x;
      u.y = y;
    },
    vanish(u) {
      ev.push(['vanish', u.id]);
      kill(u);
    },
    burn(x, y, r) { ev.push(['burn', x, y, r]); },
    smash(x, y, r, dmg, what) { ev.push(['smash', x, y, r, dmg, what]); },
    water: (x, y) => inRect(sc.water, x, y)?.[4] ?? 0,
    open: (x, y) => x >= 0 && y >= 0 && x < region.w && y < region.h && !inRect(sc.walls, x, y),
    level: (x, y) => inRect(sc.levels, x, y)?.[4] ?? 0,
    claimed() {
      const r = (sc.claimed ?? []).some(([a, b]) => tick >= a && tick <= b);
      ev.push(['claimed', r]);
      return r;
    },
    gate(id, alive) { ev.push(['gate', id, alive]); },
    resetLandmark() { ev.push(['reset']); },
    note(e) {
      ev.push(['note', notePlain(e)]);
      if (e.kind === 'bossSlain') slain.push(e);
    },
    range(lo, hi) {
      const r = rng.range(lo, hi);
      ev.push(['range', lo, hi, r]);
      return r;
    },
  };
  const bosses = createBosses(region, host);
  const call = ([name, ...a]: Call): unknown => {
    switch (name) {
      case 'spawn': return bosses.spawn() ?? null;
      case 'hit': return bosses.hit(a[0] as number, a[1] as string, a[2] as number) ?? null;
      case 'struck': return bosses.struck(a[0] as number) ?? null;
      case 'hurtBoss': return bosses.hurtBoss(a[0] as string, a[1] as number, (a[2] as string | undefined) ?? undefined, (a[3] as number | undefined) ?? undefined) ?? null;
      case 'down': return bosses.down(a[0] as string, a[1] as number, (a[2] as boolean | undefined) ?? undefined) ?? null;
      case 'wake': return bosses.wake(a[0] as number) ?? null;
      default: throw new Error(name);
    }
  };

  /** The world between ticks: players' choices, then everyone walks; blows every 10 ticks (the calls they make). */
  const step = (t: number, calls: Call[]) => {
    for (const p of sc.players) if (p.at === t) {
      const id = squads.length, s: Sq = { id, owner: p.owner, team: p.team, alive: p.n, cx: p.x, cy: p.y, units: [], order: 'hold', target: -1, dest: null, plan: p.plan };
      const st = warStats(p.cls);
      for (let i = 0; i < p.n; i++) {
        const u: BUnit = { id: units.length, x: q(p.x + ((i % 4) - 1.5) * 0.75), y: q(p.y + (Math.floor(i / 4) - 1) * 0.75), hp: st.maxHp, maxHp: st.maxHp, alive: true, cls: p.cls, st: { ...st },
          facing: 0, pin: false, aloft: 0, immune: false, venom: false, boss: -1, squad: s };
        units.push(u);
        s.units.push(u);
      }
      squads.push(s);
    }
    if (t % 10 === 0) for (const s of squads) {
      if (!s.plan || s.alive === 0) continue;
      const act = s.plan.filter(([at]) => at <= t).pop()?.[1];
      if (!act) continue;
      if ('goal' in act) {
        if (Math.hypot(act.goal[0] - s.cx, act.goal[1] - s.cy) > 1) Object.assign(s, { order: 'move', dest: act.goal });
        else Object.assign(s, { order: 'hold', dest: null });
        continue;
      }
      let foe: Sq | null = null, fd = act.hunt;
      for (const o of squads) if (o.team === MOB_TEAM && o.alive > 0 && Math.hypot(o.cx - s.cx, o.cy - s.cy) <= fd) (fd = Math.hypot(o.cx - s.cx, o.cy - s.cy)), (foe = o);
      if (foe) Object.assign(s, { order: 'attack', target: foe.id, dest: null });
      else Object.assign(s, { order: 'hold', dest: null });
    }
    for (const s of squads) {
      if (s.alive === 0) continue;
      const tg = s.order === 'attack' ? squads[s.target] : undefined;
      const dest = tg ? (tg.alive > 0 ? [tg.cx, tg.cy] : null) : s.order === 'move' ? s.dest : null;
      if (!dest) continue;
      const dx = dest[0] - s.cx, dy = dest[1] - s.cy, d = Math.hypot(dx, dy), pace = s.team === MOB_TEAM ? 0.5 : 0.4;
      const stop = tg ? (s.units.some((u) => u.st.range > 0) ? 9 : 1.2) : 0;
      if (d > stop + 0.01) {
        const k = Math.min(pace, d - stop) / d;
        for (const u of s.units) if (u.alive && !u.pin) (u.x = q(u.x + dx * k)), (u.y = q(u.y + dy * k));
        centre(s);
      }
      if (!tg && Math.hypot(dest[0] - s.cx, dest[1] - s.cy) <= pace) Object.assign(s, { order: 'hold', dest: null });
    }
    if (t % 10 !== 5) return;
    for (const s of squads) {
      const tg = s.order === 'attack' ? squads[s.target] : undefined;
      if (s.alive === 0 || !tg || tg.alive === 0) continue;
      for (const u of s.units) {
        if (!u.alive) continue;
        const ranged = u.st.range > 0, reach = ranged ? 12 : 2.2;
        let v: BUnit | null = null, vd = reach;
        for (const o of tg.units) {
          const d = Math.hypot(o.x - u.x, o.y - u.y);
          if (o.alive && d <= vd && !o.immune && !(o.aloft && !ranged && s.team !== MOB_TEAM)) (vd = d), (v = o);
        }
        if (!v || !world.chance(0.5)) continue;
        const dmg = s.team === MOB_TEAM ? Math.max(1, Math.round(u.st.dmg * 0.5)) : ranged ? 4 : 6, d = Math.min(dmg, v.hp);
        v.hp = v.hp - d;
        if (v.hp === 0) kill(v);
        if (s.team === MOB_TEAM && u.boss >= 0) calls.push(['struck', u.boss]);
        if (s.team !== MOB_TEAM && v.boss >= 0) calls.push(['hit', v.boss, s.owner, d]);
      }
      centre(tg);
    }
  };

  const prevU = new Map<number, string>(), prevS = new Map<number, string>(), ticks: unknown[] = [];
  const changed = (before: Map<number, string>) => {
    const us = units.filter((u) => before.get(u.id) !== JSON.stringify(serU(u))).map(serU);
    const ss = squads.filter((s) => before.get(s.id) !== JSON.stringify(serS(s))).map(serS);
    return [us, ss] as const;
  };
  const remember = (mu: Map<number, string>, ms: Map<number, string>) => {
    for (const u of units) mu.set(u.id, JSON.stringify(serU(u)));
    for (const s of squads) ms.set(s.id, JSON.stringify(serS(s)));
  };
  for (const [a, b] of sc.ranges) for (let t = a; t <= b; t++) {
    tick = t;
    const calls: Call[] = [];
    step(t, calls);
    const rec: Record<string, unknown> = { t };
    const [wu, ws] = changed(prevU);
    const wsq = squads.filter((s) => prevS.get(s.id) !== JSON.stringify(serS(s)));
    // the world only changes what du and dq carry (the rest is the controller's, never replayed over it)
    const only = (a: unknown[], b: unknown[], keep: number[]) => a.every((v, i) => keep.includes(i) || JSON.stringify(v) === JSON.stringify(b[i]));
    for (const u of wu) if (prevU.has(u[0] as number) && !only(u, JSON.parse(prevU.get(u[0] as number)!), [3, 4, 5, 7])) throw new Error(`world changed man ${u[0]}`);
    for (const s of ws) if (prevS.has(s[0] as number) && !only(s, JSON.parse(prevS.get(s[0] as number)!), [3, 4, 5, 6, 7])) throw new Error(`world changed squad ${s[0]}`);
    const nu = wu.filter((u) => !prevU.has(u[0] as number)), du = wu.filter((u) => prevU.has(u[0] as number)).map((u) => [u[0], u[3], u[4], u[5], u[7]]);
    const nq = ws.filter((s) => !prevS.has(s[0] as number)), dq = wsq.filter((s) => prevS.has(s.id)).map((s) => [s.id, s.alive, s.cx, s.cy, s.order, s.target]);
    if (nu.length) rec.nu = nu;
    if (nq.length) rec.nq = nq;
    if (du.length) rec.du = du;
    if (dq.length) rec.dq = dq;
    const preU = new Map<number, string>(), preS = new Map<number, string>();
    remember(preU, preS);
    ev = [];
    const c = [...calls, ...sc.calls.filter(([at]) => at === t).map(([, k]) => k)].map((k) => [...k, call(k)]);
    bosses.tick(t);
    const [au, as] = changed(preU);
    const aq = as.filter((s) => preS.get(s[0] as number) !== JSON.stringify(s));
    if (c.length) rec.c = c;
    if (ev.length) rec.e = ev;
    if (au.length) rec.a = au;
    if (aq.length) rec.aq = aq;
    if (t % 25 === 0 || t === b || ev.length) rec.s = { bosses: bosses.snaps(), memo: bosses.memo(), warden: bosses.warden() ?? null, any: bosses.any() };
    remember(prevU, prevS);
    ticks.push(rec);
  }
  return {
    region: sc.region, w: region.w, h: region.h, seed, water: sc.water ?? [], walls: sc.walls ?? [], levels: sc.levels ?? [], claimed: sc.claimed ?? [], ticks,
    piles: slain.map((e) => [notePlain(e), pileOut(sc.region, 'vec', e)]),
  };
}

const pileOut = (region: string, runId: string, e: BossSlain) => {
  const p = bossPile(region, runId, e);
  return { x: p.x, y: p.y, lots: p.lots, items: p.items.map((it) => JSON.parse(JSON.stringify(it))) };
};

const hoplites = (owner: string, team: number, x: number, y: number, n: number, plan: [number, Act][], at = 0, cls = 'hoplite'): Player => ({ at, owner, team, cls, x, y, n, plan });
const archers = (owner: string, team: number, x: number, y: number, n: number, plan: [number, Act][], at = 0) => hoplites(owner, team, x, y, n, plan, at, 'archer');

const SCENARIOS: Scenario[] = [
  // Drakon (rim N): yard sweep, P2 up to the keep roof breathing fire, perch to perch, P3 crash and drake packs; the Rim
  // Warden on a crowded patch then on an empty band (a roll); slain, kept down while claimed, back after the retry
  {
    region: 'krios', ranges: [[0, 900], [8990, 9110], [17990, 18110], [882049, 882052], [888049, 888060]],
    players: [
      hoplites('a', 0, 290.5, 350.5, 8, [[0, { hunt: 30 }]]),
      archers('b', 0, 272.5, 344.5, 8, [[0, { hunt: 20 }], [140, { goal: [272.5, 300.5] }], [690, { hunt: 60 }]]),
      hoplites('c', 1, 260.5, 360.5, 6, [[0, { hunt: 30 }], [140, { goal: [275.5, 362.5] }]]),
      hoplites('w', 2, 100.5, 6.5, 8, [[0, { goal: [100.5, 6.5] }], [9200, { goal: [100.5, 40.5] }]]),
    ],
    calls: [[0, ['spawn']], [3, ['spawn']], [150, ['hurtBoss', 'drakon', 6900]], [160, ['hurtBoss', 'drakon', 10, 'x']], [161, ['hurtBoss', 'nobody', 10]], [700, ['hurtBoss', 'drakon', 700, 'a']],
      [18050, ['hurtBoss', 'drakon', 99999, 'b']], [18060, ['hurtBoss', 'drakon', 5]]],
    claimed: [[882000, 882100]],
  },
  // Scylla (rim W): six heads strike and snatch a man by the water, the body shut while 3+ heads live, a head felled by
  // part, at half hp she drags herself onto the flats; slain, the heads go with her
  {
    region: 'siren', ranges: [[0, 700], [8995, 9105]],
    players: [
      hoplites('a', 0, 53.5, 292.5, 8, [[0, { hunt: 15 }]]),
      archers('b', 0, 58.5, 290.5, 6, [[0, { hunt: 14 }]]),
      hoplites('c', 1, 45.5, 300.5, 6, [[0, { goal: [45.5, 300.5] }], [400, { goal: [75.5, 303.5] }]]),
    ],
    calls: [[0, ['spawn']], [100, ['hurtBoss', 'scylla', 3000]], [110, ['hurtBoss', 'scylla', 1300, 'a', 0]], [120, ['hurtBoss', 'scylla', 1300, 'a', 1]],
      [130, ['hurtBoss', 'scylla', 1300, 'b', 2]], [140, ['hurtBoss', 'scylla', 1300, 'b', 3]], [150, ['hurtBoss', 'scylla', 5200, 'c']], [151, ['hurtBoss', 'scylla', 1, 'c', 9]],
      [600, ['hurtBoss', 'scylla', 20000, 'a']]],
    water: [[0, 270, 44, 320, 2], [44, 296, 50, 300, 1]],
  },
  // Brontes: rocks from the gate top at the densest, P2 lands and smashes buildings; a squad up on a wall walk out of his
  // tier, the stall sends him home
  {
    region: 'saddle', ranges: [[0, 900]],
    players: [
      hoplites('a', 0, 257.5, 292.5, 8, [[0, { goal: [257.5, 290.5] }], [300, { hunt: 30 }], [600, { goal: [257.5, 310.5] }]]),
      hoplites('b', 0, 250.5, 286.5, 8, [[0, { hunt: 30 }]]),
      archers('c', 1, 268.5, 282.5, 6, [[0, { goal: [268.5, 282.5] }]]),
    ],
    calls: [[0, ['spawn']], [280, ['hurtBoss', 'brontes', 1300, 'b']], [800, ['wake', 1.5]]],
    levels: [[264, 278, 274, 288, 3]],
  },
  // Gyges: chained, three blows at three men; idle when none are near; P2 breaks his chains
  {
    region: 'gorge', ranges: [[0, 600]],
    players: [
      hoplites('a', 0, 262.5, 159.5, 8, [[0, { goal: [262.5, 159.5] }], [150, { goal: [262.5, 185.5] }], [300, { hunt: 40 }]]),
      archers('b', 0, 252.5, 150.5, 4, [[0, { goal: [252.5, 150.5] }]]),
    ],
    calls: [[0, ['spawn']], [350, ['hurtBoss', 'gyges', 5100, 'a']]],
  },
  // The Chimera: the goat breathes fire, the serpent bites venom; the goat felled by part, then each head; the bar is the three
  {
    region: 'canyons', ranges: [[0, 500]],
    players: [
      hoplites('a', 0, 166.5, 151.5, 8, [[0, { hunt: 20 }]]),
      archers('b', 0, 155.5, 145.5, 6, [[0, { hunt: 15 }]]),
    ],
    calls: [[0, ['spawn']], [200, ['hurtBoss', 'chimera', 2200, 'b', 1]], [300, ['hurtBoss', 'chimera', 3000, 'a']], [350, ['hurtBoss', 'chimera', 2200, 'a', 7]],
      [400, ['hurtBoss', 'chimera', 2300, 'b']], [450, ['hurtBoss', 'chimera', 2300, 'a']]],
  },
  // The Bandit King (rim E): his guard, P2 wider aggro, P3 runs for the postern: held 60 s there, escapes; back in an
  // hour with half his guard; downed as away by the room, woken with x2 hp; slain while held stays down
  {
    region: 'ammon', ranges: [[0, 1300], [8995, 9105], [37000, 37200], [40000, 40010], [40100, 40130]],
    players: [
      hoplites('a', 0, 368.5, 252.5, 12, [[0, { hunt: 20 }], [400, { goal: [368.5, 300.5] }]]),
      hoplites('b', 0, 352.5, 246.5, 8, [[0, { hunt: 20 }], [400, { goal: [340.5, 300.5] }]]),
      hoplites('c', 1, 470.5, 250.5, 8, [[0, { goal: [505.5, 250.5] }]]),
    ],
    calls: [[0, ['spawn']], [100, ['hurtBoss', 'bandit_king', 2500, 'a']], [200, ['hurtBoss', 'bandit_king', 1700, 'b']],
      [37010, ['hurtBoss', 'bandit_king', 100, 'a']], [37050, ['down', 'bandit_king', 900.4, true]], [37060, ['down', 'bandit_king', 5]], [40005, ['wake', 2]],
      [40110, ['hurtBoss', 'bandit_king', 99999, 'c']], [40115, ['wake', 1]], [40120, ['down', 'bandit_king', 10]]],
    claimed: [[40100, 40130]],
  },
  // The Maenad Queen of the Bacchae (one phase) and the Grove's (P2 frenzied, two maenad packs that hold home ground)
  {
    region: 'bacchae', ranges: [[0, 400]],
    players: [hoplites('a', 0, 75.5, 52.5, 10, [[0, { hunt: 20 }]]), hoplites('b', 0, 60.5, 45.5, 6, [[0, { goal: [60.5, 45.5] }], [200, { goal: [120.5, 45.5] }]])],
    calls: [[0, ['spawn']], [300, ['hurtBoss', 'maenad_queen', 99999, 'a']], [301, ['hurtBoss', 'maenad_queen', 5]]],
  },
  // Erymanthos: the Grove Queen's frenzy and packs; the Erymanthian Boar gores through the ranks, P2 the sounder
  {
    region: 'erymanthos', ranges: [[0, 800]],
    players: [
      hoplites('a', 0, 165.5, 357.5, 10, [[0, { hunt: 20 }]]),
      hoplites('b', 0, 253.5, 401.5, 10, [[0, { hunt: 20 }]]),
      archers('c', 0, 240.5, 392.5, 6, [[0, { hunt: 15 }]]),
    ],
    calls: [[0, ['spawn']], [150, ['hurtBoss', 'grove_queen', 2500, 'a']], [400, ['hurtBoss', 'erymanthian_boar', 3600, 'b']]],
    walls: [[258, 380, 262, 420, 0]],
  },
  // Omphalos: the Titan's boulders from the arena (not at his feet), P2 stomps and tears gates; the Minotaur's charge,
  // stopped by a wall (stunned), and a free one
  {
    region: 'omphalos', ranges: [[0, 900]],
    players: [
      hoplites('a', 0, 384.5, 290.5, 8, [[0, { goal: [384.5, 290.5] }], [450, { hunt: 30 }]]),
      archers('b', 0, 370.5, 280.5, 6, [[0, { goal: [370.5, 280.5] }]]),
      hoplites('c', 0, 404.5, 193.5, 8, [[0, { hunt: 20 }]]),
      hoplites('d', 1, 405.5, 199.5, 8, [[0, { hunt: 20 }]]),
    ],
    calls: [[0, ['spawn']], [400, ['hurtBoss', 'titan', 8500, 'a']], [880, ['hurtBoss', 'titan', 99999, 'a']], [881, ['hurtBoss', 'minotaur', 99999, 'd']]],
    walls: [[409, 185, 412, 200, 0]],
  },
  // Achelous (rim S): P2 into the channels (aloft 2, venom bite), the surge; P3 out as the bull, the surge again, gores
  {
    region: 'delta', ranges: [[0, 900], [8995, 9105]],
    players: [
      hoplites('a', 0, 240.5, 356.5, 10, [[0, { hunt: 25 }]]),
      hoplites('b', 0, 214.5, 343.5, 8, [[0, { goal: [214.5, 343.5] }], [500, { hunt: 25 }]]),
      archers('c', 0, 226.5, 360.5, 6, [[0, { hunt: 20 }]]),
      hoplites('w', 1, 200.5, 505.5, 6, [[0, { goal: [200.5, 505.5] }]]),
    ],
    calls: [[0, ['spawn']], [150, ['hurtBoss', 'river_god', 10500, 'a']], [450, ['hurtBoss', 'river_god', 10000, 'c']]],
  },
  // The Griffin dives on the archers behind
  {
    region: 'kimmeria', ranges: [[0, 600]],
    players: [hoplites('a', 0, 240.5, 199.5, 8, [[0, { hunt: 20 }]]), archers('b', 0, 230.5, 189.5, 8, [[0, { hunt: 15 }]]), hoplites('c', 0, 247.5, 205.5, 4, [[0, { hunt: 20 }]])],
    calls: [[0, ['spawn']]],
  },
  // The Lion roars at the press round it and pounces on a man a few strides off
  {
    region: 'savanna', ranges: [[0, 700]],
    players: [hoplites('a', 0, 192.5, 211.5, 12, [[0, { hunt: 20 }]]), hoplites('b', 0, 181.5, 204.5, 4, [[0, { goal: [183.5, 205.5] }]]), archers('c', 0, 196.5, 200.5, 4, [[0, { hunt: 15 }]])],
    calls: [[0, ['spawn']]],
  },
  // The Great Bear mauls; a raid of five squads makes it tougher; woken at x1.5
  {
    region: 'moors', ranges: [[0, 600]],
    players: [
      hoplites('a', 0, 172.5, 95.5, 8, [[0, { hunt: 20 }]]), hoplites('b', 0, 165.5, 90.5, 6, [[0, { hunt: 20 }]]),
      hoplites('c', 1, 175.5, 85.5, 4, [[0, { goal: [175.5, 85.5] }]]), hoplites('d', 1, 160.5, 100.5, 4, [[0, { goal: [160.5, 100.5] }]]),
      archers('e', 2, 180.5, 105.5, 4, [[0, { goal: [180.5, 105.5] }]]),
    ],
    calls: [[0, ['spawn']], [500, ['wake', 1.5]]],
  },
];

export const vectors = () => {
  const loot = WAR_BOSSES.map((b) => b.id).concat(['nobody']).flatMap((id) => Array.from({ length: 24 }, (_, k) => [id, `seed${k}`, bossLoot(id, `seed${k}`)]));
  const piles = WAR_BOSSES.map((b) => b.id).concat(['nobody']).flatMap((id) => [1, 77, 1234, 98765, 4e5, 864321, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233].map((t, k) => {
    const e: BossSlain = { t, kind: 'bossSlain', region: 'r', boss: id, killers: ['a'], ...(k % 3 === 2 ? {} : { x: 10.5 + k, y: 20.25 }) } as BossSlain;
    return [`reg${k % 2}`, `run${k}`, notePlain(e), pileOut(`reg${k % 2}`, `run${k}`, e)];
  }));
  return { scenarios: SCENARIOS.map(run), loot, piles };
};
