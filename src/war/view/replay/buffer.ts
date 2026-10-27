/**
 * W-62 E5 replays: a rolling record of the snapshots this client saw (the fogged ones: only what its team saw), the last
 * REPLAY_TICKS ticks (3 min at 10 Hz) within about REPLAY_BYTES.
 *
 * Memory: a frame keeps its men packed (x, y, facing and hp as floats; swing, ready and the combat tag as 16-bit ints)
 * beside a shared "template" per man (every other field), reused from the frame before while it is unchanged; the
 * rest of the snapshot (squads, buildings, engines, piles, bosses, ...) is interned the same way, element by element and
 * whole arrays, so a building that stands still costs nothing per frame. The fog grid is kept by reference (a new one
 * comes only when it changed). Bytes are an estimate (packed arrays exact, new objects by a rough walk).
 */
import type { FogGrid, Snapshot, UnitSnap } from '../../types';

/** 3 min of 10 Hz ticks. */
export const REPLAY_TICKS = 1800;
/** The memory cap (estimated bytes): the oldest frames go first past it. */
export const REPLAY_BYTES = 30 * 2 ** 20;

/** The fields of a man that change every tick, packed per frame. */
type Packed = 'x' | 'y' | 'facing' | 'hp' | 'swing' | 'ready' | 'tag';
const PACKED = new Set<string>(['x', 'y', 'facing', 'hp', 'swing', 'ready', 'tag'] satisfies Packed[]);
const NONE = 0xffff;
type Tpl = Omit<UnitSnap, Packed>;

export interface Frame {
  tick: number;
  /** Per man: his template (shared across frames while unchanged). */
  tpl: Tpl[];
  /** Per man: x, y, facing, hp. */
  pos: Float32Array;
  /** Per man: swing, ready, tag (NONE: absent). */
  small: Uint16Array;
  /** The snapshot but its men, interned against the frame before. */
  rest: Omit<Snapshot, 'units'>;
  fog: FogGrid | null;
  /** Estimated bytes this frame added. */
  bytes: number;
}

/** What changed into this frame, for ./moments.ts: men fallen, buildings destroyed, guardians slain (their ids). */
export interface FrameNote { tick: number; fell: number; razed: number; slain: string[]; units: number }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Plain JSON-ish deep equality (typed arrays by reference). */
export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!isObj(a) || !isObj(b)) return false;
  if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!same(a[i], b[i])) return false;
    return true;
  }
  if (Array.isArray(b)) return false;
  let n = 0;
  for (const k in a) {
    n++;
    if (!same(a[k], b[k])) return false;
  }
  for (const _ in b) n--;
  return n === 0;
}

/** Rough heap bytes of a value (V8-ish: 8 per slot, headers, strings 1 byte a char). */
export function est(v: unknown): number {
  if (!isObj(v)) return typeof v === 'string' ? 16 + v.length : 8;
  if (ArrayBuffer.isView(v)) return 64 + v.byteLength;
  if (Array.isArray(v)) {
    let n = 16 + 8 * v.length;
    for (const x of v) if (isObj(x) || typeof x === 'string') n += est(x);
    return n;
  }
  let n = 24;
  for (const k in v) {
    const x = v[k];
    n += 8 + (isObj(x) || typeof x === 'string' ? est(x) : 0);
  }
  return n;
}

type Keyed = { id?: unknown; team?: unknown };
const keyOf = (v: unknown, i: number): unknown => (isObj(v) ? ((v as Keyed).id ?? i) : i);

/** `cur` interned against `prev`: unchanged elements (and the whole array) are prev's own; out.bytes: what is new. */
function intern<T>(prev: T, cur: T, out: { bytes: number }): T {
  if (same(prev, cur)) return prev;
  if (!Array.isArray(cur) || !Array.isArray(prev)) {
    out.bytes += est(cur);
    return cur;
  }
  let byKey: Map<unknown, unknown> | null = null;
  const res = cur.map((c, i) => {
    let p = prev[i];
    if (keyOf(p, i) !== keyOf(c, i)) p = (byKey ??= new Map(prev.map((x, j) => [keyOf(x, j), x]))).get(keyOf(c, i));
    if (p !== undefined && same(p, c)) return p;
    out.bytes += est(c);
    return c;
  });
  out.bytes += 16 + 8 * res.length;
  return res as T;
}

export class ReplayBuffer {
  readonly frames: Frame[] = [];
  bytes = 0;
  /** The push cost (ms): the last and the most. */
  pushMs = 0;
  maxPushMs = 0;
  /** Templates by man id as of the newest frame. */
  private tpls = new Map<number, Tpl>();
  private decoded = new Map<number, Snapshot>();

  constructor(readonly maxTicks = REPLAY_TICKS, readonly maxBytes = REPLAY_BYTES) {}

  get first(): number { return this.frames[0]?.tick ?? 0; }
  get last(): number { return this.frames[this.frames.length - 1]?.tick ?? 0; }

  clear(): void {
    this.frames.length = 0;
    this.bytes = 0;
    this.tpls.clear();
    this.decoded.clear();
  }

  /** Record one snapshot as this client saw it (a tick not after the newest one starts over: a new sim or region). */
  push(s: Snapshot, fog: FogGrid | null): FrameNote {
    const t0 = performance.now();
    if (this.frames.length && s.tick <= this.last) this.clear();
    const prev = this.frames[this.frames.length - 1];
    const n = s.units.length, pos = new Float32Array(n * 4), small = new Uint16Array(n * 3), tpl: Tpl[] = new Array(n);
    const out = { bytes: 64 + pos.byteLength + small.byteLength + 16 + 8 * n };
    const tpls = new Map<number, Tpl>();
    let fell = 0;
    for (let i = 0; i < n; i++) {
      const u = s.units[i], p = this.tpls.get(u.id);
      pos[i * 4] = u.x; pos[i * 4 + 1] = u.y; pos[i * 4 + 2] = u.facing; pos[i * 4 + 3] = u.hp;
      small[i * 3] = u.swing === undefined ? NONE : Math.min(NONE - 1, u.swing);
      small[i * 3 + 1] = u.ready === undefined ? NONE : Math.min(NONE - 1, u.ready);
      small[i * 3 + 2] = u.tag === undefined ? NONE : Math.min(NONE - 1, u.tag);
      let t: Tpl;
      if (p && sameTpl(p, u)) t = p;
      else {
        const { x: _x, y: _y, facing: _f, hp: _h, swing: _s, ready: _r, tag: _t, ...rest } = u;
        t = rest;
        out.bytes += est(t);
        if (u.state === 'dead' && p && p.state !== 'dead') fell++;
      }
      tpl[i] = t;
      tpls.set(u.id, t);
    }
    this.tpls = tpls;
    const { units: _u, ...restCur } = s;
    // field by field: an unchanged field (or element of one) is the frame before's own
    const restKv = {} as Record<string, unknown>, was = (prev?.rest ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(restCur)) restKv[k] = k in was ? intern(was[k], v, out) : ((out.bytes += est(v)), v);
    out.bytes += 24 + 8 * Object.keys(restKv).length;
    const rest = restKv as unknown as Frame['rest'];
    let razed = 0;
    const slain: string[] = [];
    if (prev) {
      if (rest.buildings !== prev.rest.buildings && rest.buildings) {
        const was = new Map((prev.rest.buildings ?? []).map((b) => [b.id, b.state]));
        for (const b of rest.buildings) if (b.state === 'destroyed' && was.has(b.id) && was.get(b.id) !== 'destroyed') razed++;
      }
      if (rest.bosses !== prev.rest.bosses && rest.bosses) {
        const was = new Map((prev.rest.bosses ?? []).map((b) => [b.id, b.state]));
        for (const b of rest.bosses) if (b.state === 'slain' && was.has(b.id) && was.get(b.id) !== 'slain') slain.push(b.id);
      }
    }
    if (fog && prev?.fog !== fog) out.bytes += est(fog);
    this.frames.push({ tick: s.tick, tpl, pos, small, rest, fog, bytes: out.bytes });
    this.bytes += out.bytes;
    while (this.frames.length > 1 && (this.last - this.first > this.maxTicks || this.bytes > this.maxBytes)) {
      const old = this.frames.shift()!;
      this.bytes -= old.bytes;
      this.decoded.delete(old.tick);
    }
    this.pushMs = performance.now() - t0;
    this.maxPushMs = Math.max(this.maxPushMs, this.pushMs);
    return { tick: s.tick, fell, razed, slain, units: n };
  }

  /** The index of the newest frame at or before `tick` (0 before the first). */
  indexAt(tick: number): number {
    const f = this.frames;
    let lo = 0, hi = f.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (f[mid].tick <= tick) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** Frame `i` as a snapshot again (the last few decoded are kept). */
  snapshot(i: number): Snapshot | null {
    const f = this.frames[i];
    if (!f) return null;
    const hit = this.decoded.get(f.tick);
    if (hit) return hit;
    const units: UnitSnap[] = new Array(f.tpl.length);
    for (let k = 0; k < f.tpl.length; k++) {
      const u = { ...f.tpl[k], x: f.pos[k * 4], y: f.pos[k * 4 + 1], facing: f.pos[k * 4 + 2], hp: f.pos[k * 4 + 3] } as UnitSnap;
      const sw = f.small[k * 3], rd = f.small[k * 3 + 1], tg = f.small[k * 3 + 2];
      if (sw !== NONE) u.swing = sw;
      if (rd !== NONE) u.ready = rd;
      if (tg !== NONE) u.tag = tg;
      units[k] = u;
    }
    const s = { ...f.rest, tick: f.tick, units } as Snapshot;
    if (this.decoded.size >= 4) this.decoded.delete(this.decoded.keys().next().value!);
    this.decoded.set(f.tick, s);
    return s;
  }
}

/** A man's template still holds: every field but the packed ones the same, none added or gone. */
function sameTpl(t: Tpl, u: UnitSnap): boolean {
  let n = 0;
  for (const k in u) {
    if (PACKED.has(k)) continue;
    n++;
    if ((t as Record<string, unknown>)[k] !== (u as unknown as Record<string, unknown>)[k]) return false;
  }
  for (const _ in t) n--;
  return n === 0;
}
