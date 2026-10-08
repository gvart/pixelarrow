/**
 * Live army movement on the region map (docs/DESIGN_V2.md "Online battle rules":
 * other armies inside your vision move live through the shard WebSocket).
 *
 * Shared, pure parts:
 *  - `sightSteps` (server): cuts a march down to the regions one receiver can
 *    see, so nothing outside the fog of war ever leaves the server;
 *  - `LiveArmies` (client): the armies the map shows, fed by the map refresh
 *    and the socket's `army_*` messages, interpolated smoothly along their
 *    routes' waypoints (`poseOf`). No Phaser, no DOM, unit-tested.
 */
import type { WorldGraph } from './world';
import type { LiveArmyMsg } from './protocol';

/** One step of a (possibly cut) march: the army enters `loc` at `at` and leaves at `until` (null: it stops there). */
export interface MarchStep {
  loc: number;
  at: number;
  until: number | null;
}

/** A vision source that sees further than the rest (a camp's watchtower): `hops` routes from `loc`. */
export interface Tower {
  loc: number;
  hops: number;
}

/** Every region within `sight` routes of one of `sources` (and within `hops` of a tower). */
export function sightSet(world: WorldGraph, sources: readonly number[], sight: number, towers: readonly Tower[] = []): Set<number> {
  const out = new Set<number>();
  for (const s of sources) for (const r of world.within(s, sight)) out.add(r);
  for (const t of towers) for (const r of world.within(t.loc, t.hops)) out.add(r);
  return out;
}

/**
 * The part of a march a viewer may see: every region of `path` within `sight`
 * routes of one of the viewer's vision sources, with its entry time and the
 * time the army leaves it (the next region's entry time, or null for the last).
 * Watchtowers (`towers`) see further than the other sources.
 */
export function sightSteps(world: WorldGraph, path: readonly number[], at: readonly number[], sources: readonly number[], sight: number, towers: readonly Tower[] = []): MarchStep[] {
  const seen = sightSet(world, sources, sight, towers);
  const out: MarchStep[] = [];
  for (let i = 0; i < path.length; i++) {
    if (!seen.has(path[i])) continue;
    out.push({ loc: path[i], at: at[i], until: i + 1 < path.length ? at[i + 1] : null });
  }
  return out;
}

/** Whole march (own and clan armies): every step. */
export function allSteps(path: readonly number[], at: readonly number[]): MarchStep[] {
  return path.map((loc, i) => ({ loc, at: at[i], until: i + 1 < path.length ? at[i + 1] : null }));
}

// ------------------------------------------------------------------ client tracker

export interface LiveArmy {
  player: number;
  name: string;
  clan: number | null;
  /** Where it stands when not marching. */
  loc: number;
  /** A march being shown (steps in time order), or null. */
  steps: MarchStep[] | null;
  own: boolean;
}

export interface ArmyPose {
  player: number;
  /** Position in map pixels (along the route's waypoints while marching). */
  x: number;
  y: number;
  /** Region it is in (the step it last entered). */
  loc: number;
  moving: boolean;
  /** Direction of travel in map pixels (0,0 when standing). */
  dx: number;
  dy: number;
  visible: boolean;
}

/** Map refresh input: what /api/online/map returns for armies. */
export interface MapArmy {
  player: number;
  loc: number;
  dest: number | null;
  arriveAt: number | null;
  path: number[] | null;
  at?: number[] | null;
}

/**
 * The armies on the map. Times are server milliseconds; the tracker keeps the
 * offset to the local clock (`now - Date.now()` from the last message) so
 * interpolation runs on local frames.
 */
export class LiveArmies {
  readonly armies = new Map<number, LiveArmy>();
  /** server time - local time. */
  skew = 0;
  /** Bumped on every change (the renderer redraws markers when it moves). */
  version = 0;

  constructor(
    public world: WorldGraph,
    public me: number,
    /** Is a region inside the fog-free area the client knows? (hide armies standing in fog) */
    public known: (loc: number) => boolean = () => true,
  ) {}

  /** Replace everything with a map refresh. Marching armies with a full path (your own) animate along it. */
  load(list: readonly MapArmy[], names: Record<string, string>, serverNow: number, localNow: number): void {
    this.skew = serverNow - localNow;
    this.armies.clear();
    for (const a of list) {
      const own = a.player === this.me;
      let steps: MarchStep[] | null = null;
      if (a.path && a.path.length > 1 && a.at && a.at.length === a.path.length) steps = allSteps(a.path, a.at);
      this.armies.set(a.player, { player: a.player, name: names[String(a.player)] ?? '', clan: null, loc: a.loc, steps, own });
    }
    this.version++;
  }

  /** Your own march, from the /march answer (path + times). */
  ownMarch(path: readonly number[], at: readonly number[], name = ''): void {
    const cur = this.armies.get(this.me);
    const steps = allSteps(path, at);
    this.armies.set(this.me, { player: this.me, name: cur?.name ?? name, clan: cur?.clan ?? null, loc: path[0], steps, own: true });
    this.version++;
  }

  /** Apply a socket message; returns true when something changed. */
  apply(m: LiveArmyMsg, localNow: number): boolean {
    this.skew = m.now - localNow;
    const cur = this.armies.get(m.player);
    switch (m.type) {
      case 'army_march': {
        if (!m.path.length) return false;
        const steps: MarchStep[] = m.path.map((loc, i) => ({ loc, at: m.at[i], until: m.until[i] ?? null }));
        this.armies.set(m.player, { player: m.player, name: m.name, clan: m.clan, loc: steps[0].loc, steps, own: m.player === this.me });
        break;
      }
      case 'army_pos':
        this.armies.set(m.player, { player: m.player, name: m.name, clan: m.clan, loc: m.loc, steps: null, own: m.player === this.me });
        break;
      case 'army_arrive':
        if (!cur) return false;
        cur.loc = m.loc;
        cur.steps = null;
        break;
      case 'army_hide':
        if (!cur || cur.own) return false;
        this.armies.delete(m.player);
        break;
      default:
        return false;
    }
    this.version++;
    return true;
  }

  /** Server time for a local timestamp. */
  serverTime(localNow: number): number {
    return localNow + this.skew;
  }

  /** Where every army is at local time `localNow` (map pixels). */
  poses(localNow: number): ArmyPose[] {
    const t = this.serverTime(localNow);
    const out: ArmyPose[] = [];
    for (const a of this.armies.values()) out.push(poseOf(this.world, a, t, this.known));
    return out;
  }

  /** Marches that finished by server time `t` settle on their last region (no message needed for own / clan armies). */
  settle(localNow: number): boolean {
    const t = this.serverTime(localNow);
    let changed = false;
    for (const a of this.armies.values()) {
      const s = a.steps;
      if (!s || !s.length) continue;
      const last = s[s.length - 1];
      if (last.until === null && t >= last.at) {
        a.loc = last.loc;
        a.steps = null;
        changed = true;
      } else if (last.until !== null && t >= last.until && !a.own) {
        // walked out of sight
        this.armies.delete(a.player);
        changed = true;
      }
    }
    if (changed) this.version++;
    return changed;
  }
}

/** The point `k` (0..1) of the way along a polyline, and the direction of travel there. */
export function alongPolyline(pts: readonly { x: number; y: number }[], k: number): { x: number; y: number; dx: number; dy: number } {
  if (pts.length === 1) return { ...pts[0], dx: 0, dy: 0 };
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    lens.push(l);
    total += l;
  }
  let want = Math.max(0, Math.min(1, k)) * total;
  for (let i = 0; i < lens.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (want <= lens[i] || i === lens.length - 1) {
      const f = lens[i] > 0 ? Math.min(1, want / lens[i]) : 1;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, dx: b.x - a.x, dy: b.y - a.y };
    }
    want -= lens[i];
  }
  const last = pts[pts.length - 1];
  return { ...last, dx: 0, dy: 0 };
}

/** The drawn route from region a to region b: its waypoints (oriented a -> b), else the two labels. */
export function routePoints(world: WorldGraph, a: number, b: number): { x: number; y: number }[] {
  const e = world.edge(a, b);
  const pa = world.pos(a);
  const pb = world.pos(b);
  if (!e || e.waypoints.length < 2) return [pa, pb];
  const pts = e.waypoints.map(([x, y]) => ({ x, y }));
  return e.a === a ? pts : pts.reverse();
}

/** An army's pose at server time t. */
export function poseOf(world: WorldGraph, a: LiveArmy, t: number, known: (loc: number) => boolean = () => true): ArmyPose {
  const stand = (loc: number, visible: boolean): ArmyPose => {
    const p = world.has(loc) ? world.pos(loc) : { x: 0, y: 0 };
    return { player: a.player, x: p.x, y: p.y, loc, moving: false, dx: 0, dy: 0, visible };
  };
  const s = a.steps;
  if (!s || !s.length) return stand(a.loc, a.own || known(a.loc));
  if (t < s[0].at) {
    // not yet in sight (an army marching into view), or about to set out
    return s[0].at - t < 1 || a.own ? stand(s[0].loc, a.own) : stand(s[0].loc, false);
  }
  let i = 0;
  while (i + 1 < s.length && s[i + 1].at <= t) i++;
  const cur = s[i];
  if (cur.until === null) return stand(cur.loc, true);
  if (t >= cur.until) {
    // left the last visible region: out of sight (own armies always have the next step)
    return stand(cur.loc, false);
  }
  const next = s[i + 1];
  const linked = next && next.at === cur.until && world.adjacent(cur.loc, next.loc);
  if (!linked) return { ...stand(cur.loc, true), moving: true };
  const k = Math.max(0, Math.min(1, (t - cur.at) / Math.max(1, cur.until - cur.at)));
  const p = alongPolyline(routePoints(world, cur.loc, next.loc), k);
  return { player: a.player, x: p.x, y: p.y, loc: cur.loc, moving: true, dx: p.dx, dy: p.dy, visible: true };
}
