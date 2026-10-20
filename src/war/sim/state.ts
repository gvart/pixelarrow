/**
 * Sim save and restore (M5e eviction resume): a graph codec for the war sim's live state. The sim (./index.ts
 * exportState / importState) hands over one root object of its closure state (units, squads, works, siege, mobs, fog,
 * rng, tick); this file turns that object graph into plain JSON and back, exactly:
 *
 *  - shared references and cycles are kept (a unit's squad is the squad in `squads`): every object, array, Map, Set and
 *    typed array is one entry of a table, referenced by index; plain objects share key lists (shapes);
 *  - numbers round-trip exactly (JSON for finite doubles; -0, NaN and the infinities tagged);
 *  - constant objects (building and engine defs, the region) are not copied but named (`externals`) and looked up again;
 *  - typed arrays go as a sparse diff against the same array of a fresh sim (`baseline`) when that is smaller (the
 *    terrain grids barely change), else as base64;
 *  - class instances (the Rng) keep their prototype through a small registry.
 *
 * importState decodes into a fresh sim of the same region and seed: objects the fresh sim already has at the same place
 * in the graph (`live`: its arrays, Maps, grids, Rng) are refilled in place, so the closures holding them see the restored
 * state; typed-array diffs apply onto those fresh arrays.
 */
import { Rng } from '../../sim/rng';

export const STATE_VERSION = 1;

/** The encoded graph: JSON-safe. */
export interface SimState { v: number; region: string; seed: number; shapes: string[][]; objs: unknown[]; root: unknown }

type Tag = { $: 'r'; i: number } | { $: 'x'; k: string } | { $: 'n'; v: string } | { $: 'u' };
type Typed = Int8Array | Uint8Array | Uint8ClampedArray | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array | Float64Array;
const TYPED: Record<string, new (n: number) => Typed> = { Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array };
const CLASSES: Record<string, { prototype: object }> = { Rng };

const isTyped = (v: unknown): v is Typed => ArrayBuffer.isView(v) && !(v instanceof DataView);
const plainProto = (v: object) => {
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};

/** Name every object reachable from the named constant roots (defs tables, the region). */
export function externals(roots: Record<string, unknown>): Map<object, string> {
  const out = new Map<object, string>();
  // big arrays of numbers or strings (the region's layers) hold no objects: not walked
  const walk = (v: unknown, k: string) => {
    if (!v || typeof v !== 'object' || out.has(v) || isTyped(v)) return;
    out.set(v, k);
    if (Array.isArray(v)) {
      if (v.length > 256 && typeof v[0] !== 'object') return;
      v.forEach((x, i) => walk(x, `${k}.${i}`));
    }
    else if (plainProto(v)) for (const [kk, x] of Object.entries(v)) walk(x, `${k}.${kk}`);
  };
  for (const [k, v] of Object.entries(roots)) walk(v, k);
  return out;
}

/**
 * Pair each typed array of `cur` with the same-shaped one at the same place in `base` (a fresh sim's graph). Only object
 * properties and Map values are followed (the sim keeps its big arrays there; walking lists of nodes and men costs).
 */
function pairTyped(cur: unknown, base: unknown, out: Map<Typed, Typed>, seen = new Set<object>()): Map<Typed, Typed> {
  if (!cur || !base || typeof cur !== 'object' || typeof base !== 'object' || seen.has(cur)) return out;
  seen.add(cur);
  if (isTyped(cur)) {
    if (isTyped(base) && base.constructor === cur.constructor && base.length === cur.length) out.set(cur, base);
    return out;
  }
  if (cur instanceof Map && base instanceof Map) for (const [k, v] of cur) pairTyped(v, base.get(k), out, seen);
  else if (!(cur instanceof Set) && !(cur instanceof Map) && !Array.isArray(cur)) for (const k of Object.keys(cur)) pairTyped((cur as Record<string, unknown>)[k], (base as Record<string, unknown>)[k], out, seen);
  return out;
}

const b64 = (u: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string): Uint8Array => {
  const bin = atob(s), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
};

/** Encode the graph under `root`. `base`: the same root of a fresh sim (typed-array diffs). */
export function encodeGraph(root: unknown, ext: Map<object, string>, base?: unknown): Pick<SimState, 'shapes' | 'objs' | 'root'> {
  const ids = new Map<object, number>();
  const objs: unknown[] = [];
  const todo: object[] = [];
  const shapes: string[][] = [];
  const shapeIx = new Map<string, number[]>();
  const baseOf = base ? pairTyped(root, base, new Map()) : new Map<Typed, Typed>();
  const val = (v: unknown): unknown => {
    switch (typeof v) {
      case 'number':
        return Number.isFinite(v) && !Object.is(v, -0) ? v : ({ $: 'n', v: String(Object.is(v, -0) ? '-0' : v) } satisfies Tag);
      case 'string':
      case 'boolean':
        return v;
      case 'undefined':
        return { $: 'u' } satisfies Tag;
      case 'object': {
        if (v === null) return null;
        const x = ext.get(v);
        if (x !== undefined) return { $: 'x', k: x } satisfies Tag;
        let i = ids.get(v);
        if (i === undefined) {
          ids.set(v, (i = objs.length));
          objs.push(null);
          todo.push(v);
        }
        return { $: 'r', i } satisfies Tag;
      }
      default:
        throw new Error(`sim state: cannot save a ${typeof v}`);
    }
  };
  const top = val(root);
  for (let k = 0; k < todo.length; k++) {
    const o = todo[k], i = ids.get(o)!;
    if (Array.isArray(o)) objs[i] = ['a', Array.from(o, val)];
    else if (o instanceof Map) objs[i] = ['m', [...o].flatMap(([a, b]) => [val(a), val(b)])];
    else if (o instanceof Set) objs[i] = ['s', [...o].map(val)];
    else if (isTyped(o)) {
      // against the fresh sim's array, or zeros (fog counts, explored maps) when it has none: sparse when that is smaller
      const name = o.constructor.name, b = baseOf.get(o);
      const diff: unknown[] = [];
      // compared byte by byte (one monomorphic loop for every array type; -0 and NaN compare exactly)
      const ob = new Uint8Array(o.buffer, o.byteOffset, o.byteLength), bb = b ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : null;
      const size = o.BYTES_PER_ELEMENT, cap = o.length / 4;
      for (let k = 0; k < ob.length && diff.length < cap; k++) {
        if (ob[k] === (bb ? bb[k] : 0)) continue;
        const j = (k / size) | 0;
        diff.push(j, val(o[j]));
        k = (j + 1) * size - 1;
      }
      objs[i] = diff.length < o.length / 4 ? [b ? 'd' : 'z', name, o.length, diff] : ['t', name, b64(new Uint8Array(o.buffer, o.byteOffset, o.byteLength)), o.length];
    } else {
      const keys = Object.keys(o);
      // shapes: a cheap key (count, first and last key) picks the candidates, compared in full
      const cand = `${keys.length}|${keys[0]}|${keys[keys.length - 1]}`;
      let list = shapeIx.get(cand);
      if (!list) shapeIx.set(cand, (list = []));
      let s = list.find((x) => shapes[x].every((k, j) => k === keys[j]));
      if (s === undefined) list.push((s = shapes.push(keys) - 1));
      const vals = keys.map((kk) => val((o as Record<string, unknown>)[kk]));
      if (plainProto(o)) objs[i] = ['o', s, vals];
      else {
        const name = Object.getPrototypeOf(o).constructor?.name;
        if (!CLASSES[name] || CLASSES[name].prototype !== Object.getPrototypeOf(o)) throw new Error(`sim state: cannot save a ${name}`);
        objs[i] = ['c', s, vals, name];
      }
    }
  }
  return { shapes, objs, root: top };
}

/**
 * Decode a graph. `live`: the importing sim's own root (a fresh sim): any of its objects at the same place in the graph
 * is refilled in place and returned in the result instead of a new one.
 */
export function decodeGraph(st: Pick<SimState, 'shapes' | 'objs' | 'root'>, ext: Map<string, object>, live?: unknown): unknown {
  const { objs, shapes } = st;
  const out: unknown[] = new Array(objs.length);
  const ref = (v: unknown): number => (v && typeof v === 'object' && (v as Tag).$ === 'r' ? (v as { i: number }).i : -1);
  // bind: the live object at the same place stands in for the entry (same kind; typed arrays the same type and length)
  const bound = new Set<number>();
  const bind = (v: unknown, l: unknown) => {
    const i = ref(v);
    if (i < 0 || bound.has(i) || !l || typeof l !== 'object') return;
    const e = objs[i] as unknown[];
    const kind = e[0];
    const ok =
      kind === 'a' ? Array.isArray(l)
      : kind === 'm' ? l instanceof Map
      : kind === 's' ? l instanceof Set
      : kind === 't' || kind === 'd' || kind === 'z' ? isTyped(l) && l.constructor.name === e[1] && l.length === e[kind === 't' ? 3 : 2]
      : kind === 'o' ? plainProto(l) && !Array.isArray(l)
      : kind === 'c' ? Object.getPrototypeOf(l) === CLASSES[e[3] as string]?.prototype
      : false;
    if (!ok) return;
    bound.add(i);
    out[i] = l;
    if (kind === 'a') (e[1] as unknown[]).forEach((x, j) => bind(x, (l as unknown[])[j]));
    else if (kind === 'm') {
      const kv = e[1] as unknown[];
      for (let j = 0; j < kv.length; j += 2) if (typeof kv[j] !== 'object') bind(kv[j + 1], (l as Map<unknown, unknown>).get(kv[j]));
    } else if (kind === 'o' || kind === 'c') shapes[e[1] as number].forEach((k, j) => bind((e[2] as unknown[])[j], (l as Record<string, unknown>)[k]));
  };
  bind(st.root, live);
  // shells: bound ones emptied (typed arrays keep their fresh content for the diffs), the rest new
  objs.forEach((raw, i) => {
    const e = raw as unknown[];
    const l = out[i] as Record<string, unknown> | undefined;
    if (l !== undefined) {
      if (Array.isArray(l)) l.length = 0;
      else if (l instanceof Map || l instanceof Set) l.clear();
      else if (e[0] === 'z') (l as unknown as Typed).fill(0);
      return; // plain objects and class instances: overwritten key by key (no deletes: hidden classes stay fast)
    }
    switch (e[0]) {
      case 'a': out[i] = []; break;
      case 'm': out[i] = new Map(); break;
      case 's': out[i] = new Set(); break;
      case 'o': out[i] = {}; break;
      case 'c': out[i] = Object.create(CLASSES[e[3] as string].prototype); break;
      case 't': {
        out[i] = new TYPED[e[1] as string](e[3] as number);
        break;
      }
      case 'z': out[i] = new TYPED[e[1] as string](e[2] as number); break;
      case 'd': throw new Error('sim state: a typed-array diff with no fresh array to apply to (import into a fresh sim)');
    }
  });
  const val = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v;
    const t = v as Tag;
    if (t.$ === 'r') return out[t.i];
    if (t.$ === 'x') {
      const o = ext.get(t.k);
      if (!o) throw new Error(`sim state: unknown constant ${t.k}`);
      return o;
    }
    if (t.$ === 'n') return t.v === '-0' ? -0 : Number(t.v);
    return undefined;
  };
  objs.forEach((raw, i) => {
    const e = raw as unknown[], o = out[i];
    switch (e[0]) {
      case 'a': for (const x of e[1] as unknown[]) (o as unknown[]).push(val(x)); break;
      case 'm': {
        const kv = e[1] as unknown[];
        for (let j = 0; j < kv.length; j += 2) (o as Map<unknown, unknown>).set(val(kv[j]), val(kv[j + 1]));
        break;
      }
      case 's': for (const x of e[1] as unknown[]) (o as Set<unknown>).add(val(x)); break;
      case 'o':
      case 'c': shapes[e[1] as number].forEach((k, j) => ((o as Record<string, unknown>)[k] = val((e[2] as unknown[])[j]))); break;
      case 't': new Uint8Array((o as Typed).buffer, (o as Typed).byteOffset, (o as Typed).byteLength).set(unb64(e[2] as string)); break;
      case 'd':
      case 'z': {
        const d = e[3] as unknown[];
        for (let j = 0; j < d.length; j += 2) (o as Typed)[d[j] as number] = val(d[j + 1]) as number;
        break;
      }
    }
  });
  return val(st.root);
}

/** FNV-1a over a string (state and snapshot hashes in tests and logs). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}
