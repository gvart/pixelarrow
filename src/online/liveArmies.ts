/**
 * Live army movement on the hex map (docs/DESIGN_V2.md "Online battle rules":
 * other armies inside your vision move live through the shard WebSocket).
 *
 * Shared, pure parts:
 *  - `sightSteps` (server): cuts a march down to the hexes one receiver can
 *    see, so nothing outside the fog of war ever leaves the server;
 *  - `LiveArmies` (client): the armies the map shows, fed by the map refresh
 *    and the socket's `army_*` messages, interpolated smoothly along their
 *    paths (`positionAt`). No Phaser, no DOM, unit-tested.
 */
import { hexDistance, hexToPixel, type Axial } from './hex';
import type { LiveArmyMsg } from './protocol';

/** One step of a (possibly cut) march: the army enters (q, r) at `at` and leaves at `until` (null: it stops there). */
export interface MarchStep {
  q: number;
  r: number;
  at: number;
  until: number | null;
}

/**
 * The part of a march a viewer may see: every hex of `path` within `sight` of
 * one of the viewer's vision sources, with its entry time and the time the
 * army leaves it (the next hex's entry time, or null for the last hex).
 */
export function sightSteps(path: readonly Axial[], at: readonly number[], sources: readonly Axial[], sight: number): MarchStep[] {
  const out: MarchStep[] = [];
  for (let i = 0; i < path.length; i++) {
    const h = path[i];
    if (!sources.some((s) => hexDistance(s, h) <= sight)) continue;
    out.push({ q: h.q, r: h.r, at: at[i], until: i + 1 < path.length ? at[i + 1] : null });
  }
  return out;
}

/** Whole march (own and clan armies): every step. */
export function allSteps(path: readonly Axial[], at: readonly number[]): MarchStep[] {
  return path.map((h, i) => ({ q: h.q, r: h.r, at: at[i], until: i + 1 < path.length ? at[i + 1] : null }));
}

// ------------------------------------------------------------------ client tracker

export interface LiveArmy {
  player: number;
  name: string;
  clan: number | null;
  /** Where it stands when not marching. */
  q: number;
  r: number;
  /** A march being shown (steps in time order), or null. */
  steps: MarchStep[] | null;
  own: boolean;
}

export interface ArmyPose {
  player: number;
  /** Position in board units (hexToPixel with size 1): interpolate, then scale. */
  x: number;
  y: number;
  /** Hex it is on (the step it last entered). */
  q: number;
  r: number;
  moving: boolean;
  /** Direction of travel in board units (0,0 when standing). */
  dx: number;
  dy: number;
  visible: boolean;
}

/** Map refresh input: what /api/online/map returns for armies. */
export interface MapArmy {
  player: number;
  q: number;
  r: number;
  dest: Axial | null;
  arriveAt: number | null;
  path: [number, number][] | null;
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
    public me: number,
    /** Is a hex inside the fog-free area the client knows? (hide armies standing in fog) */
    public known: (q: number, r: number) => boolean = () => true,
  ) {}

  /** Replace everything with a map refresh. Marching armies with a full path (your own) animate along it. */
  load(list: readonly MapArmy[], names: Record<string, string>, serverNow: number, localNow: number): void {
    this.skew = serverNow - localNow;
    this.armies.clear();
    for (const a of list) {
      const own = a.player === this.me;
      let steps: MarchStep[] | null = null;
      if (a.path && a.path.length > 1 && a.at && a.at.length === a.path.length) steps = allSteps(a.path.map(([q, r]) => ({ q, r })), a.at);
      this.armies.set(a.player, { player: a.player, name: names[String(a.player)] ?? '', clan: null, q: a.q, r: a.r, steps, own });
    }
    this.version++;
  }

  /** Your own march, from the /march answer (path + times). */
  ownMarch(path: readonly [number, number][], at: readonly number[], name = ''): void {
    const cur = this.armies.get(this.me);
    const steps = allSteps(path.map(([q, r]) => ({ q, r })), at);
    this.armies.set(this.me, { player: this.me, name: cur?.name ?? name, clan: cur?.clan ?? null, q: path[0][0], r: path[0][1], steps, own: true });
    this.version++;
  }

  /** Apply a socket message; returns true when something changed. */
  apply(m: LiveArmyMsg, localNow: number): boolean {
    this.skew = m.now - localNow;
    const cur = this.armies.get(m.player);
    switch (m.type) {
      case 'army_march': {
        if (!m.path.length) return false;
        const steps: MarchStep[] = m.path.map(([q, r], i) => ({ q, r, at: m.at[i], until: m.until[i] ?? null }));
        this.armies.set(m.player, { player: m.player, name: m.name, clan: m.clan, q: steps[0].q, r: steps[0].r, steps, own: m.player === this.me });
        break;
      }
      case 'army_pos':
        this.armies.set(m.player, { player: m.player, name: m.name, clan: m.clan, q: m.q, r: m.r, steps: null, own: m.player === this.me });
        break;
      case 'army_arrive':
        if (!cur) return false;
        cur.q = m.q;
        cur.r = m.r;
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

  /** Where every army is at local time `localNow` (board units, size 1). */
  poses(localNow: number): ArmyPose[] {
    const t = this.serverTime(localNow);
    const out: ArmyPose[] = [];
    for (const a of this.armies.values()) out.push(poseOf(a, t, this.known));
    return out;
  }

  /** Marches that finished by server time `t` settle on their last hex (no message needed for own / clan armies). */
  settle(localNow: number): boolean {
    const t = this.serverTime(localNow);
    let changed = false;
    for (const a of this.armies.values()) {
      const s = a.steps;
      if (!s || !s.length) continue;
      const last = s[s.length - 1];
      if (last.until === null && t >= last.at) {
        a.q = last.q;
        a.r = last.r;
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

/** An army's pose at server time t. */
export function poseOf(a: LiveArmy, t: number, known: (q: number, r: number) => boolean = () => true): ArmyPose {
  const stand = (q: number, r: number, visible: boolean): ArmyPose => {
    const p = hexToPixel({ q, r }, 1);
    return { player: a.player, x: p.x, y: p.y, q, r, moving: false, dx: 0, dy: 0, visible };
  };
  const s = a.steps;
  if (!s || !s.length) return stand(a.q, a.r, a.own || known(a.q, a.r));
  if (t < s[0].at) {
    // not yet in sight (an army marching into view), or about to set out
    return s[0].at - t < 1 || a.own ? stand(s[0].q, s[0].r, a.own) : stand(s[0].q, s[0].r, false);
  }
  let i = 0;
  while (i + 1 < s.length && s[i + 1].at <= t) i++;
  const cur = s[i];
  if (cur.until === null) return stand(cur.q, cur.r, true);
  if (t >= cur.until) {
    // left the last visible hex: out of sight (own armies always have the next step)
    return stand(cur.q, cur.r, false);
  }
  const next = s[i + 1];
  const linked = next && next.at === cur.until && hexDistance(cur, next) === 1;
  const p0 = hexToPixel(cur, 1);
  if (!linked) return { ...stand(cur.q, cur.r, true), moving: true };
  const p1 = hexToPixel(next, 1);
  const k = Math.max(0, Math.min(1, (t - cur.at) / Math.max(1, cur.until - cur.at)));
  return { player: a.player, x: p0.x + (p1.x - p0.x) * k, y: p0.y + (p1.y - p0.y) * k, q: cur.q, r: cur.r, moving: true, dx: p1.x - p0.x, dy: p1.y - p0.y, visible: true };
}
