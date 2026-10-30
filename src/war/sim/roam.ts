/**
 * W-65 roaming life (docs/WAR.md "Roaming life"): groups that move about a region between its places, on the sim's own
 * orders, deterministic (their own Rng, seeded from the sim's seed). Four kinds:
 *
 *  - pack: beasts (MOB_TEAM) of one of the region's fauna kinds with a territory round a lair of their kind; they idle,
 *    graze (short steps) and roam the territory, now and then move on to another lair of their kind. Foes (any team but
 *    the wild's) by nature: ibex flee, bears go for anything near, boars charge what comes close, wolves and jackals hunt
 *    squads they outnumber (stalk, then attack) and keep away from bigger ones; a hurt pack turns on the nearest foe
 *    (ibex run), a bloodied wolf or jackal pack breaks off; past ROAM.leash from where the chase began it goes back.
 *  - patrol: bandits (MOB_TEAM) walking the road between a bandit camp and a road entry, resting at each end; a weak
 *    squad (no more men than the patrol + 2), a caravan or travellers within ROAM.ambushR is ambushed; a strong one is
 *    let pass unless it hurts them. Past the leash they go back to the road.
 *  - caravan: a wagon (a real cart of NEUTRAL_TEAM, owner ROAM_OWNER, with goods in it) driven by a merchant, guarded by
 *    a squad on the escort order, back and forth on the road between an entry and a town (or two entries). Escort: a
 *    player's squads near the wagon (ROAM.escortR) for a share of the trip earn coin when it arrives whole (a pile beside
 *    his nearest squad, his alone for a while: host.pay). Rob: attack the guards (they and the driver turn on that team)
 *    and take the wagon (the cart capture rule) with its goods; a wagon wrecked spills them in a pile.
 *  - traveller: a few civilians (pilgrims deep in) walking the roads between entries and towns; they run from foes (the
 *    civilian flee) and from any fight within ROAM.fightR. Pure life.
 *
 * Roaming folk (NEUTRAL_TEAM) are meek (Squad.meek): players' men neither see them as foes nor are seen by them unless
 * they attacked them (Squad.angry, by team); beasts and bandits see them as ever. Density by depth (DENSITY); a group is
 * asleep while no player's man stands within ROAM.wake: it looks at no foe, but still drifts (world-fill: packs graze
 * and roam their territory at ROAM.drift times their pace, patrols and travellers walk their roads, a caravan holds), so
 * the land is alive when someone arrives and a dormant region's batches stay cheap.
 * A group wiped out (or a caravan that lost its wagon) comes back after ROAM.respawn at the start of its road; the
 * survivors of a broken caravan walk on as travellers.
 */
import type { GoodKind, MobKind, Order, RegionData, RoamSnap, SquadId } from '../types';
import { Rng } from '../../sim/rng';
import { depthOf, depthRule } from './depth';
import { MOB_OWNER, MOB_TEAM, MOBS, mobClass } from './mobs';
import { NEUTRAL_TEAM } from './economy';

export const ROAM_OWNER = 'roam';
export type RoamKind = RoamSnap['kind'];

export const ROAM = {
  /** Ticks between a group's decisions (staggered by id). */
  think: 10,
  /** A group is awake while a player's man stands this near (tiles). */
  wake: 90,
  /** Waypoints along a road this far apart (tiles). */
  leg: 36,
  /** Rest at a road's end (ticks, range). */
  rest: [300, 900] as const,
  /** A group wiped out comes back this long after (ticks), once no player's man is within `clear` of its start. */
  respawn: 6000, clear: 24,
  /** Escort: a player's squad this near the wagon counts; paid with this share of the trip and at least `escortMin` checks. */
  escortR: 14, escortShare: 0.3, escortMin: 6,
  /** Coin on arrival per escorting player: base + depth x per. */
  pay: { base: 4, per: 2 },
  /** Bandits ambush within this; any chase ends this far from where it began. */
  ambushR: 14, leash: 30,
  /** Wolves and jackals stalk squads they outnumber this near. */
  huntR: 22,
  /** A pack's territory round its home (tiles). */
  territory: 28,
  /** world-fill: asleep (no player near), a group still drifts: packs graze and roam at this times their pace, patrols and travellers walk their roads. */
  drift: 2,
  /** Travellers run from a fight this near, this far. */
  fightR: 18, flee: 20,
  /** A caravan halts while a foe of it stands this near its wagon. */
  halt: 12,
};

/** Groups per depth (0 homes .. 4 rim): beast packs, bandit patrols, caravans, traveller bands. */
export const DENSITY: readonly { packs: number; patrols: number; caravans: number; travellers: number }[] = [
  // world-fill: more of everything; homes now have weak outskirts lairs, so packs roam them too (half size)
  { packs: 2, patrols: 0, caravans: 1, travellers: 3 },
  { packs: 3, patrols: 2, caravans: 1, travellers: 2 },
  { packs: 4, patrols: 3, caravans: 1, travellers: 2 },
  { packs: 4, patrols: 3, caravans: 1, travellers: 2 },
  { packs: 5, patrols: 3, caravans: 0, travellers: 1 },
];

/** How a beast kind meets a foe: flee, attack anything within r, charge only what comes this near, or hunt the weak. */
export const NATURE: Record<MobKind, { react: 'flee' | 'attack' | 'near' | 'weak'; size: number; r: number }> = {
  wolf: { react: 'weak', size: 4, r: 12 },
  jackal: { react: 'weak', size: 4, r: 9 },
  boar: { react: 'near', size: 2, r: 7 },
  bear: { react: 'attack', size: 1, r: 9 },
  ibex: { react: 'flee', size: 5, r: 14 },
  bandit: { react: 'attack', size: 5, r: 14 },
  lion: { react: 'weak', size: 3, r: 11 },
  serpent: { react: 'near', size: 2, r: 6 },
};

export interface RoamUnit { x: number; y: number; hp: number; maxHp: number; alive: boolean }
export interface RoamSquad {
  id: SquadId; owner: string; team: number; alive: number; cx: number; cy: number; units: RoamUnit[]; order: string; target: SquadId;
  civ: boolean; flee: boolean; meek: boolean; angry: number;
}
export interface RoamCart { x: number; y: number; team: number; alive: boolean; moving: boolean }

/** What the controller needs of the sim. */
export interface RoamHost {
  squads: readonly RoamSquad[];
  /** A squad of `cls` (meek for NEUTRAL_TEAM), stats scaled by k; -1 when it cannot stand. */
  spawn(team: number, owner: string, cls: string, count: number, x: number, y: number, k: { hp: number; dmg: number }): SquadId;
  /** Applied at once. */
  order(o: Order): void;
  arrived(id: SquadId): boolean;
  /** A walking (or cart) path as flat corner points, ending at the goal or as near as it gets. */
  route(cart: boolean, x0: number, y0: number, x1: number, y1: number): number[];
  /** The nearest open point. */
  open(x: number, y: number): [number, number];
  /** A wagon of NEUTRAL_TEAM, owner ROAM_OWNER, at (x,y) holding `goods`; its id. */
  cart(x: number, y: number, goods: [GoodKind, number][]): number;
  cartAt(id: number): RoamCart | null;
  /** Coin for `owner` beside his nearest squad (his alone for a while). */
  pay(owner: string, team: number, x: number, y: number, coin: number): void;
  /** A man fighting within r of (x,y): where. */
  fightNear(x: number, y: number, r: number): [number, number] | null;
  note(e: { kind: 'caravanPaid'; owner: string; team: number; coin: number; x: number; y: number } | { kind: 'caravanRobbed'; caravan: number; by: number }): void;
  w: number; h: number;
}

type State = 'idle' | 'graze' | 'roam' | 'hunt' | 'chase' | 'flee' | 'return' | 'walk' | 'rest' | 'ambush' | 'halt';

interface Group {
  id: number; kind: RoamKind; mob: MobKind | null; cls: string; count: number; guards: number;
  /** Main squad (the pack, the patrol, the travellers, the caravan's driver), the caravan's guards and wagon (-1 none). */
  squad: SquadId; guard: SquadId; cart: number;
  /** The road as flat waypoints (a pack: its home first), the waypoint walked to, the way along it. */
  route: number[]; leg: number; dir: 1 | -1;
  /** A pack's home (moves when it migrates to another lair). */
  hx: number; hy: number;
  state: State; until: number; foe: SquadId; fx: number; fy: number; stall: number;
  asleep: boolean; hpSeen: number;
  /** Escort checks by owner (with his team) and checks on the road this trip. */
  escort: Record<string, [number, number]>; road: number;
  dead: boolean; respawnAt: number; once: boolean; pilgrim: boolean;
}

export interface RoamDef {
  kind: RoamKind; mob?: MobKind; cls?: string; count?: number; guards?: number;
  /** The road (a pack: its home, then nothing), tiles; `at`: the waypoint it starts on (default 0). */
  route: [number, number][]; at?: number; pilgrim?: boolean;
}

const LOADS: Record<string, GoodKind> = { food: 'food', wood: 'wood', stone: 'stone', salt: 'salt', oil: 'oil', iron: 'iron', copper: 'copper', hides: 'hides', flax: 'flax', herbs: 'herbs' };
const TRAVELLERS = ['civ_forager', 'civ_merchant', 'civ_cook', 'civ_smith'] as const;

export function createRoam(region: RegionData, seed: number, host: RoamHost) {
  const rng = new Rng((seed * 2654435761 + 0x6f616d) >>> 0);
  const depth = depthOf(region), rule = depthRule(region);
  const groups: Group[] = [];
  let on = false;
  let tick = 0;
  let realAt = -1;
  let real: RoamSquad[] = [];

  const sq = (id: SquadId): RoamSquad | undefined => (id >= 0 ? host.squads[id] : undefined);
  const live = (id: SquadId) => (sq(id)?.alive ?? 0) > 0;
  /** Players' squads (not the wild's, not roaming folk), living; cached per tick. */
  const players = (): RoamSquad[] => {
    if (realAt !== tick) {
      realAt = tick;
      real = host.squads.filter((s) => s.alive > 0 && s.team !== MOB_TEAM && s.team !== NEUTRAL_TEAM);
    }
    return real;
  };
  const near = (s: { cx: number; cy: number }, x: number, y: number, r: number) => (s.cx - x) ** 2 + (s.cy - y) ** 2 <= r * r;
  const anyPlayer = (x: number, y: number, r: number) => players().some((s) => near(s, x, y, r));
  /** The nearest squad foe to s within r (by centre): the wild's foes are every other team; roaming folk's the angry ones. */
  const foeOf = (s: RoamSquad, r: number): RoamSquad | null => {
    let best: RoamSquad | null = null, bd = r * r;
    for (const o of host.squads) {
      if (o.alive === 0 || o.team === s.team) continue;
      if (s.team === MOB_TEAM ? false : o.team !== MOB_TEAM && !((s.angry >> o.team) & 1)) continue;
      const d = (o.cx - s.cx) ** 2 + (o.cy - s.cy) ** 2;
      if (d < bd) (bd = d), (best = o);
    }
    return best;
  };
  const hpOf = (s: RoamSquad) => {
    let hp = 0, max = 0;
    for (const u of s.units) if (u.alive) (hp += u.hp), (max += u.maxHp);
    return [hp, max];
  };
  const clampX = (x: number) => Math.max(2, Math.min(host.w - 3, x));
  const clampY = (y: number) => Math.max(2, Math.min(host.h - 3, y));
  const move = (id: SquadId, x: number, y: number) => {
    const [px, py] = host.open(clampX(x), clampY(y));
    host.order({ kind: 'move', squad: id, x: px, y: py });
  };
  const wp = (g: Group, i = g.leg): [number, number] => [g.route[i * 2], g.route[i * 2 + 1]];
  const legs = (g: Group) => g.route.length / 2;

  // --- the region's places: entries (a little inside), towns, bandit camps, lairs by kind ---
  const IN = 14;
  const entries: [number, number][] = region.entries.map((e) => {
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    const p: [number, number] = e.side === 'N' ? [cx, e.y + e.h + IN] : e.side === 'S' ? [cx, e.y - IN] : e.side === 'W' ? [e.x + e.w + IN, cy] : [e.x - IN, cy];
    return [clampX(p[0]), clampY(p[1])];
  });
  const lairs = region.lairs ?? [];
  const hosted = new Set((region.claimPoints ?? []).flatMap((c, i) => (c.lairs.some((l) => lairs[l]?.captain) ? [i] : [])));
  const towns: [number, number][] = [
    ...(region.safe ?? []).map((r): [number, number] => [r.x + r.w / 2, r.y + r.h / 2]),
    ...(region.claimPoints ?? []).flatMap((c, i): [number, number][] =>
      !hosted.has(i) && (region.prebuilt ?? []).some((p) => !p.landmark && (p.claim === i || (p.claim === undefined && Math.hypot(p.x - c.x, p.y - c.y) < 25))) ? [[c.x, c.y]] : []),
  ];
  const camps: [number, number][] = lairs.filter((l) => l.kind === 'bandit' && !l.captain).map((l) => [l.x, l.y]);
  const beasts = [...new Set(lairs.filter((l) => l.kind !== 'bandit').map((l) => l.kind))];

  /** The road from a to b as waypoints ROAM.leg apart (null: no way there). */
  const roads = new Map<string, number[] | null>();
  const road = (a: [number, number], b: [number, number], cart: boolean): number[] | null => {
    const key = `${cart ? 1 : 0}:${a[0]},${a[1]}:${b[0]},${b[1]}`;
    if (roads.has(key)) return roads.get(key)!;
    const [ax, ay] = host.open(a[0], a[1]), [bx, by] = host.open(b[0], b[1]);
    const pts = host.route(cart, ax, ay, bx, by);
    const n = pts.length;
    let out: number[] | null = null;
    if (n >= 4 && Math.hypot(pts[n - 2] - bx, pts[n - 1] - by) < 6) {
      out = [pts[0], pts[1]];
      let acc = 0;
      for (let i = 2; i < n; i += 2) {
        const x0 = pts[i - 2], y0 = pts[i - 1], x1 = pts[i], y1 = pts[i + 1], d = Math.hypot(x1 - x0, y1 - y0);
        let t = 0;
        while (d - t + acc >= ROAM.leg) {
          t += ROAM.leg - acc;
          acc = 0;
          out.push(x0 + ((x1 - x0) * t) / d, y0 + ((y1 - y0) * t) / d);
        }
        acc += d - t;
      }
      if (acc > ROAM.leg / 3 || out.length < 4) out.push(pts[n - 2], pts[n - 1]);
      else (out[out.length - 2] = pts[n - 2]), (out[out.length - 1] = pts[n - 1]);
    }
    roads.set(key, out);
    return out;
  };

  const blank = (d: RoamDef, route: number[]): Group => ({
    id: groups.length, kind: d.kind, mob: d.mob ?? null, cls: d.cls ?? '', count: d.count ?? 0, guards: d.guards ?? 0, squad: -1, guard: -1, cart: -1,
    route, leg: 0, dir: 1, hx: route[0], hy: route[1], state: 'idle', until: 0, foe: -1, fx: 0, fy: 0, stall: 0, asleep: false, hpSeen: Infinity,
    escort: {}, road: 0, dead: false, respawnAt: 0, once: false, pilgrim: !!d.pilgrim,
  });

  const goods = (): [GoodKind, number][] => {
    const kinds = Object.values(LOADS);
    const a = rng.pick(kinds), b = rng.pick(kinds.filter((k) => k !== a));
    return [[a, 20 + Math.round(rng.range(0, 20))], [b, 10 + Math.round(rng.range(0, 10))], ['coin', 3 + depth]];
  };

  /** Stand the group's men (and wagon) up at waypoint `at` (a pack: at home). */
  const raise = (g: Group, at: number) => {
    const [x, y] = g.kind === 'pack' ? [g.hx, g.hy] : wp(g, at);
    const wild = g.kind === 'pack' || g.kind === 'patrol';
    const k = wild ? { hp: rule.mob, dmg: rule.mob } : { hp: 1, dmg: 1 };
    g.dead = false;
    g.squad = host.spawn(wild ? MOB_TEAM : NEUTRAL_TEAM, wild ? MOB_OWNER : ROAM_OWNER, g.cls, g.count, x, y, k);
    g.guard = -1;
    g.cart = -1;
    if (g.squad < 0) {
      g.dead = true;
      g.respawnAt = tick + ROAM.respawn;
      return;
    }
    if (g.kind === 'pack' || g.kind === 'patrol') host.order({ kind: 'formation', squad: g.squad, shape: 'loose' });
    if (g.kind === 'traveller') host.order({ kind: 'formation', squad: g.squad, shape: 'column' });
    if (g.kind === 'caravan') {
      g.cart = host.cart(x, y, goods());
      host.order({ kind: 'crew', squad: g.squad, siege: g.cart });
      if (g.guards > 0) {
        g.guard = host.spawn(NEUTRAL_TEAM, ROAM_OWNER, depth >= 1 ? 'hoplite' : 'militia', g.guards, x - 2, y - 2, k);
        if (g.guard >= 0) host.order({ kind: 'escort', squad: g.guard, cart: g.cart });
      }
    }
    g.leg = at;
    g.dir = at >= legs(g) - 1 && g.kind !== 'pack' ? -1 : 1;
    g.state = g.kind === 'pack' ? 'idle' : 'walk';
    g.until = tick + 20 + ((g.id * 37) % 60);
    g.foe = -1;
    g.asleep = false;
    g.hpSeen = Infinity;
    g.escort = {};
    g.road = 0;
    if (g.kind !== 'pack') next(g);
  };

  /** On to the next waypoint (the first issue of a leg too). */
  const go = (g: Group) => {
    const [x, y] = wp(g);
    if (g.kind === 'caravan') {
      if (live(g.squad)) host.order({ kind: 'move', squad: g.squad, x, y }); // the driver rolls the wagon there
    } else move(g.squad, x, y);
  };
  /** The waypoint after this one; at the road's end a rest, then back. */
  const next = (g: Group) => {
    const n = legs(g);
    if (n < 2) return;
    let i = g.leg + g.dir;
    if (i < 0 || i >= n) {
      arrive(g);
      g.dir = g.dir === 1 ? -1 : 1;
      g.state = 'rest';
      g.until = tick + Math.round(rng.range(ROAM.rest[0], ROAM.rest[1]));
      if (g.kind === 'caravan' && live(g.squad)) host.order({ kind: 'hold', squad: g.squad });
      return;
    }
    g.leg = i;
    g.state = 'walk';
    go(g);
  };
  /** The nearest waypoint ahead of the group: the walk goes on from there. */
  const rejoin = (g: Group, x: number, y: number) => {
    let best = g.leg, bd = Infinity;
    for (let i = 0; i < legs(g); i++) {
      const d = (g.route[i * 2] - x) ** 2 + (g.route[i * 2 + 1] - y) ** 2;
      if (d < bd) (bd = d), (best = i);
    }
    g.leg = best;
    g.state = 'walk';
    go(g);
  };

  /** A caravan at its road's end: coin to the players who escorted it most of the way. */
  const arrive = (g: Group) => {
    if (g.kind !== 'caravan') return;
    const c = host.cartAt(g.cart);
    if (c && c.alive && c.team === NEUTRAL_TEAM) {
      const need = Math.max(ROAM.escortMin, ROAM.escortShare * g.road);
      for (const owner of Object.keys(g.escort).sort()) {
        const [n, team] = g.escort[owner];
        if (n < need) continue;
        const angry = (sq(g.guard)?.angry ?? 0) | (sq(g.squad)?.angry ?? 0);
        if ((angry >> team) & 1) continue;
        const coin = ROAM.pay.base + ROAM.pay.per * depth;
        host.pay(owner, team, c.x, c.y, coin);
        host.note({ kind: 'caravanPaid', owner, team, coin, x: c.x, y: c.y });
      }
    }
    g.escort = {};
    g.road = 0;
  };

  /** Gone: wiped out, or a caravan without its wagon (its survivors walk on as travellers); back later unless `once`. */
  const fall = (g: Group) => {
    if (g.kind === 'caravan') {
      for (const id of [g.squad, g.guard]) {
        if (!live(id)) continue;
        const t = blank({ kind: 'traveller', route: [] }, g.route);
        Object.assign(t, { squad: id, leg: g.leg, dir: g.dir, once: true, state: 'walk' as State, cls: '' });
        groups.push(t);
        rejoin(t, sq(id)!.cx, sq(id)!.cy);
      }
    }
    g.dead = true;
    g.squad = g.guard = g.cart = -1;
    g.respawnAt = tick + ROAM.respawn;
  };

  const sleep = (g: Group) => {
    g.asleep = true;
    if (g.kind === 'caravan' && live(g.squad)) host.order({ kind: 'hold', squad: g.squad });
  };
  /** world-fill: asleep, a calm group drifts: no foe looked at, the walk or the grazing goes on slowly. */
  const drift = (g: Group, s: RoamSquad | undefined) => {
    if (!s || g.kind === 'caravan') return;
    if (g.kind === 'pack') return calmPack(g, s, ROAM.drift);
    if (g.state === 'rest') {
      if (tick >= g.until) next(g);
    } else if (host.arrived(s.id)) next(g);
  };
  const wake = (g: Group) => {
    g.asleep = false;
    if (g.kind === 'pack') (g.state = 'idle'), (g.until = tick);
    else if (g.state === 'walk') go(g);
  };
  /** Calm states: a group may fall asleep in them. */
  const calm = (g: Group) => g.state === 'idle' || g.state === 'graze' || g.state === 'roam' || g.state === 'walk' || g.state === 'rest';

  const chase = (g: Group, s: RoamSquad, foe: RoamSquad) => {
    if (g.state !== 'chase' && g.state !== 'ambush') (g.fx = s.cx), (g.fy = s.cy);
    g.state = g.kind === 'patrol' ? 'ambush' : 'chase';
    g.foe = foe.id;
    host.order({ kind: 'attack', squad: s.id, target: foe.id });
  };
  const run = (g: Group, s: RoamSquad, fx: number, fy: number, until: number) => {
    const dx = s.cx - fx, dy = s.cy - fy, d = Math.hypot(dx, dy) || 1;
    g.state = 'flee';
    g.until = tick + until;
    move(s.id, s.cx + (dx / d) * ROAM.flee, s.cy + (dy / d) * ROAM.flee);
  };
  const back = (g: Group, s: RoamSquad) => {
    g.state = 'return';
    g.foe = -1;
    if (g.kind === 'pack') move(s.id, g.hx, g.hy);
    else {
      rejoin(g, s.cx, s.cy);
      g.state = 'return';
    }
  };
  /** A chase is over: the foe down or gone, too far from where it began, or (skittish kinds) bloodied. */
  const chaseOver = (g: Group, s: RoamSquad, hp: number, max: number) => {
    const f = sq(g.foe);
    const bloodied = g.mob !== null && !!MOBS[g.mob].skittish && hp < max * 0.5;
    return !f || f.alive === 0 || s.order !== 'attack' || Math.hypot(s.cx - g.fx, s.cy - g.fy) > ROAM.leash || bloodied || (g.mob === 'wolf' && hp < max * 0.35);
  };

  const pack = (g: Group, s: RoamSquad) => {
    const [hp, max] = hpOf(s);
    const hurt = g.hpSeen !== Infinity && hp < g.hpSeen - 1e-6;
    g.hpSeen = hp;
    const nat = NATURE[g.mob ?? 'wolf'];
    if (g.state === 'chase') {
      if (chaseOver(g, s, hp, max)) back(g, s);
      return;
    }
    if (g.state === 'flee') {
      if (tick >= g.until || host.arrived(s.id)) back(g, s);
      return;
    }
    if (g.state === 'return') {
      if (host.arrived(s.id) || near(s, g.hx, g.hy, 4)) (g.state = 'idle'), (g.until = tick + 60);
      else if (hurt && nat.react !== 'flee') {
        const f = foeOf(s, ROAM.leash);
        if (f) chase(g, s, f);
      }
      return;
    }
    // calm or stalking: what is near?
    const f = foeOf(s, Math.max(nat.r, ROAM.huntR));
    const d = f ? Math.hypot(f.cx - s.cx, f.cy - s.cy) : Infinity;
    const weak = !!f && f.alive <= s.alive * 2;
    if (f && nat.react === 'flee' && (d <= nat.r || hurt)) return run(g, s, f.cx, f.cy, 80);
    if (f && hurt) return chase(g, s, f);
    if (f && d <= nat.r) {
      if (nat.react === 'attack' || nat.react === 'near' || weak) return chase(g, s, f);
      return run(g, s, f.cx, f.cy, 60); // a wolf pack outnumbered keeps away
    }
    if (f && nat.react === 'weak' && weak && d <= ROAM.huntR) {
      // stalk: close in at a walk, the attack comes within r
      g.state = 'hunt';
      move(s.id, f.cx + ((s.cx - f.cx) / (d || 1)) * (nat.r - 2), f.cy + ((s.cy - f.cy) / (d || 1)) * (nat.r - 2));
      return;
    }
    if (g.state === 'hunt') (g.state = 'idle'), (g.until = tick); // the quarry got away
    calmPack(g, s, 1);
  };

  /** A calm pack's day (k: its pace stretched, asleep): after a walk a rest; then graze, roam, or move on to another lair of the kind. */
  const calmPack = (g: Group, s: RoamSquad, k: number) => {
    if (tick < g.until) return;
    if (g.state !== 'idle') {
      g.state = 'idle';
      g.until = tick + Math.round(rng.range(120, 360) * k);
      return;
    }
    const r = rng.next();
    if (r < 0.55) {
      g.state = 'graze';
      g.until = tick + Math.round(rng.range(40, 90) * k);
      move(s.id, s.cx + rng.range(-4, 4), s.cy + rng.range(-4, 4));
      return;
    }
    if (r < 0.9 || !g.mob) {
      g.state = 'roam';
      g.until = tick + 400 * k;
      const a = rng.range(0, Math.PI * 2), d = rng.range(0.3, 1) * ROAM.territory;
      move(s.id, g.hx + Math.cos(a) * d, g.hy + Math.sin(a) * d);
      return;
    }
    const others = lairs.filter((l) => l.kind === g.mob && Math.hypot(l.x - g.hx, l.y - g.hy) > 8 && Math.hypot(l.x - g.hx, l.y - g.hy) < 140);
    const o = others.length ? rng.pick(others) : null;
    g.state = 'roam';
    g.until = tick + 1200 * k;
    if (o) (g.hx = o.x), (g.hy = o.y);
    move(s.id, g.hx + rng.range(-6, 6), g.hy + rng.range(-6, 6));
  };

  const patrol = (g: Group, s: RoamSquad) => {
    const [hp, max] = hpOf(s);
    const hurt = g.hpSeen !== Infinity && hp < g.hpSeen - 1e-6;
    g.hpSeen = hp;
    if (g.state === 'ambush') {
      if (chaseOver(g, s, hp, max)) back(g, s);
      return;
    }
    if (g.state === 'return') {
      if (host.arrived(s.id)) {
        g.state = 'walk';
        go(g);
      }
      return;
    }
    const f = foeOf(s, hurt ? ROAM.leash : ROAM.ambushR);
    if (f && (hurt || f.alive <= s.alive + 2 || f.civ || f.meek)) return chase(g, s, f);
    if (g.state === 'rest') {
      if (tick >= g.until) next(g);
      return;
    }
    if (host.arrived(s.id)) next(g);
  };

  const caravan = (g: Group, s: RoamSquad | undefined) => {
    const c = host.cartAt(g.cart), guard = sq(g.guard);
    if (!c || !c.alive || !s || s.alive === 0) {
      // broken up: by a player's men (its grudge says who) it was robbed; by the wild, it was just lost
      const grudge = (s?.angry ?? 0) | (guard?.angry ?? 0);
      if (grudge) host.note({ kind: 'caravanRobbed', caravan: g.id, by: Math.log2(grudge & -grudge) });
      return fall(g);
    }
    if (c.team !== NEUTRAL_TEAM) {
      // robbed: its guards and driver turn on the takers
      for (const q of [s, guard]) if (q && q.alive > 0) q.angry |= 1 << c.team;
      host.note({ kind: 'caravanRobbed', caravan: g.id, by: c.team });
      return fall(g);
    }
    // one grudge for all of it
    const angry = s.angry | (guard?.angry ?? 0);
    s.angry = angry;
    if (guard) guard.angry = angry;
    // a foe of the caravan at the wagon: it halts (the guards fight, the driver may run with it); then on again
    let threat = false;
    for (const o of host.squads) {
      if (o.alive === 0 || o.team === NEUTRAL_TEAM || !near(o, c.x, c.y, ROAM.halt)) continue;
      if (o.team === MOB_TEAM || (angry >> o.team) & 1) threat = true;
    }
    if (threat || s.flee) {
      if (g.state === 'walk') {
        g.state = 'halt';
        if (!s.flee) host.order({ kind: 'hold', squad: s.id });
      }
      return;
    }
    if (g.state === 'halt') return rejoin(g, c.x, c.y);
    if (g.state === 'rest') {
      if (tick >= g.until) next(g);
      return;
    }
    // on the road: who walks beside it
    g.road++;
    for (const p of players()) {
      if (!near(p, c.x, c.y, ROAM.escortR) || (angry >> p.team) & 1) continue;
      const e = (g.escort[p.owner] ??= [0, p.team]);
      e[0]++;
      e[1] = p.team;
    }
    // the wagon done with its leg (there, or as near as carts get): on to the next; the driver held (or he ran): drive on;
    // stuck (the ground ahead closed to carts) a while: on to the next waypoint by a fresh path
    const stuck = c.moving && Math.hypot(c.x - g.fx, c.y - g.fy) < 0.05 ? ++g.stall : (g.stall = 0);
    g.fx = c.x;
    g.fy = c.y;
    if (!c.moving || stuck >= 6) {
      g.stall = 0;
      if (s.order === 'move') next(g);
      else go(g);
    }
  };

  const traveller = (g: Group, s: RoamSquad) => {
    if (s.flee) {
      g.state = 'flee';
      g.until = tick + 30;
      return;
    }
    const fight = host.fightNear(s.cx, s.cy, ROAM.fightR);
    if (fight && g.state !== 'flee') return run(g, s, fight[0], fight[1], 80);
    if (g.state === 'flee') {
      if (tick >= g.until && !fight) rejoin(g, s.cx, s.cy);
      return;
    }
    if (g.state === 'rest') {
      if (tick >= g.until) next(g);
      return;
    }
    if (host.arrived(s.id)) next(g);
  };

  const think = (g: Group) => {
    if (g.dead) {
      if (g.once || tick < g.respawnAt) return;
      const [x, y] = g.kind === 'pack' ? [g.hx, g.hy] : wp(g, 0);
      if (anyPlayer(x, y, ROAM.clear)) {
        g.respawnAt = tick + 100;
        return;
      }
      raise(g, 0);
      return;
    }
    const s = sq(g.squad);
    if (g.kind !== 'caravan' && (!s || s.alive === 0)) {
      g.dead = true;
      g.respawnAt = tick + ROAM.respawn;
      return;
    }
    const c = g.kind === 'caravan' ? host.cartAt(g.cart) : null;
    const [x, y] = c ? [c.x, c.y] : s ? [s.cx, s.cy] : [g.hx, g.hy];
    const awake = anyPlayer(x, y, ROAM.wake);
    if (!awake && calm(g)) {
      if (!g.asleep) sleep(g);
      drift(g, s);
      return;
    }
    if (g.asleep) wake(g);
    if (g.kind === 'pack') pack(g, s!);
    else if (g.kind === 'patrol') patrol(g, s!);
    else if (g.kind === 'caravan') caravan(g, s);
    else traveller(g, s!);
  };

  /** A group from its definition, raised at once. */
  const add = (d: RoamDef): number => {
    const flat = d.route.flatMap(([x, y]) => [x, y]);
    const g = blank(d, flat);
    if (d.kind === 'pack') {
      g.mob = d.mob ?? 'wolf';
      g.cls = mobClass(g.mob);
      g.count = d.count ?? (depth === 0 ? Math.ceil(NATURE[g.mob].size / 2) : NATURE[g.mob].size); // world-fill: a home's packs are half
    } else if (d.kind === 'patrol') {
      g.mob = 'bandit';
      g.cls = mobClass('bandit');
      g.count = d.count ?? Math.min(7, 4 + depth);
    } else if (d.kind === 'caravan') {
      g.cls = 'civ_merchant';
      g.count = 1;
      g.guards = d.guards ?? (depth >= 2 ? 4 : 3);
    } else {
      g.cls = d.cls ?? TRAVELLERS[g.id % TRAVELLERS.length];
      g.count = d.count ?? 2 + (g.id % 2);
    }
    groups.push(g);
    raise(g, Math.max(0, Math.min(legs(g) - 1, d.at ?? 0)));
    return g.id;
  };

  /** The region's roaming life by its depth and places (deterministic: the roam Rng). */
  const populate = () => {
    const n = DENSITY[depth];
    const ends = [...entries, ...towns];
    const pickRoad = (from: [number, number][], to: [number, number][], cart: boolean): number[] | null => {
      for (let k = 0; k < 6; k++) {
        const a = rng.pick(from), b = rng.pick(to.filter((p) => p !== a));
        if (!a || !b || Math.hypot(a[0] - b[0], a[1] - b[1]) < 40) continue;
        const r = road(a, b, cart);
        if (r) return r;
      }
      return null;
    };
    const asDef = (kind: RoamKind, r: number[], extra: Partial<RoamDef> = {}): RoamDef => ({
      kind, route: Array.from({ length: r.length / 2 }, (_, i) => [r[i * 2], r[i * 2 + 1]] as [number, number]), at: Math.floor(rng.range(0, r.length / 2 - 1)), ...extra,
    });
    // beast packs round the lairs of the region's fauna (none where it has none)
    if (beasts.length) {
      const homes = lairs.filter((l) => l.kind !== 'bandit');
      for (let i = 0; i < n.packs; i++) {
        const h = homes[(i * 3 + Math.floor(rng.range(0, homes.length))) % homes.length];
        const a = rng.range(0, Math.PI * 2), k = rng.range(12, ROAM.territory);
        const [x, y] = host.open(clampX(h.x + Math.cos(a) * k), clampY(h.y + Math.sin(a) * k));
        const id = add({ kind: 'pack', mob: h.kind, route: [[x, y]] });
        Object.assign(groups[id], { hx: h.x, hy: h.y });
      }
    }
    // bandit patrols: camp to the nearest road entry (deeper in, any town or entry to an entry)
    const patrols = camps.length ? n.patrols : depth >= 2 ? n.patrols : 0;
    for (let i = 0; i < patrols && entries.length; i++) {
      let r: number[] | null = null;
      if (camps.length) {
        const c = camps[i % camps.length];
        const byDist = [...entries].sort((a, b) => Math.hypot(a[0] - c[0], a[1] - c[1]) - Math.hypot(b[0] - c[0], b[1] - c[1]));
        for (const e of byDist.slice(0, 2)) if ((r = road(c, e, false))) break;
      } else r = pickRoad(ends, entries, false);
      if (r) add(asDef('patrol', r));
    }
    // merchant caravans: an entry to a town, else to another entry
    for (let i = 0; i < n.caravans && entries.length; i++) {
      const r = pickRoad(entries, towns.length ? towns : entries, true);
      if (r) add(asDef('caravan', r));
    }
    // travellers, pilgrims deep in
    for (let i = 0; i < n.travellers && ends.length > 1; i++) {
      const r = pickRoad(ends, ends, false);
      if (r) add(asDef('traveller', r, depth >= 3 ? { cls: 'civ_physician', pilgrim: true } : {}));
    }
  };

  return {
    /** Save and restore (./state.ts). */
    saveRoot: () => ({ groups, rng, on, tick }),
    loadRoot: (o: { on: boolean; tick: number }) => void ((on = o.on), (tick = o.tick)),
    /** Start the region's roaming life (once). */
    spawn() {
      if (on) return;
      on = true;
      populate();
    },
    /** One more group (tests, tools); its id. Turns the controller on without populating the region. */
    add(d: RoamDef): number {
      on = true;
      return add(d);
    },
    any: () => groups.length > 0,
    /** A player's order on a roaming squad or wagon: an attack angers the whole group at his team. */
    provoke(team: number, squad: SquadId | null, cart: number | null) {
      if (team < 0 || team === MOB_TEAM || team === NEUTRAL_TEAM) return;
      for (const g of groups) {
        if (g.dead || g.kind === 'pack' || g.kind === 'patrol') continue;
        if ((squad !== null && (g.squad === squad || g.guard === squad)) || (cart !== null && cart >= 0 && g.cart === cart)) {
          for (const id of [g.squad, g.guard]) {
            const q = sq(id);
            if (q) q.angry |= 1 << team;
          }
        }
      }
    },
    tick(t: number) {
      tick = t;
      if (!on) return;
      for (const g of groups) if ((t + g.id) % ROAM.think === 0) think(g);
    },
    snaps: (): RoamSnap[] =>
      groups.filter((g) => !g.dead).map((g) => ({
        id: g.id, kind: g.kind, squads: g.guard >= 0 ? [g.squad, g.guard] : [g.squad], state: g.state,
        ...(g.mob && g.kind === 'pack' ? { mob: g.mob } : {}), ...(g.cart >= 0 ? { cart: g.cart } : {}), ...(g.pilgrim ? { pilgrim: true as const } : {}), ...(g.asleep ? { asleep: true as const } : {}),
      })),
  };
}
export type Roam = ReturnType<typeof createRoam>;
