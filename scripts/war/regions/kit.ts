/**
 * Region authoring kit: the test-ridge generator (scripts/war/buildTestRidge.ts) made reusable. A region script
 * describes its land with hand-placed features in authoring units of a 256-wide map (one unit = 2 tiles of the
 * 512 x 512 region, 4 m) and the kit turns them into src/war/regions/<id>.json + <id>.spots.ts:
 *
 *   ground: fill, hill (stepped slopes), plateau (cliff rim), basin, ridge (crest + slope, optional cliff side),
 *           mountains / rockMass (impassable rock, foothills, massif sprites over it), paint (terrain patch),
 *           water (sea, lake, pools: deep core, shallow rim, beach), river (deep or shallow, fords, narrows a bridge
 *           can span, a valley cut into higher ground), road (graded: never steeper than one level per `grade`
 *           units, cut into hills and through rock on passes, bridges over deep water where asked), causeway and
 *           island (dry ground through water), square (a flat town square, spot `market`), fields (ploughed strips);
 *   art:    zone (biome library per tile), patch (a biome terrain such as marble, rossa, oasis, redrock), oasis;
 *   things: piece (a set piece on free ground near a point), rows (vines, olive rows), resource (ore and quarry
 *           nodes), lair (W-12 fauna), claim (claim point over the lairs round it), spot (named point).
 *
 * Entries are not authored: one per neighbour (docs/WAR.md adjacency, ./world.ts), on the side facing it, with a
 * no-build band behind it; entry regions also keep a no-build corridor along their roads (W-03). `k.entry(id)` gives
 * the point where a road should leave the map toward that neighbour.
 *
 * The build runs twice, deterministic: at 1 m cells for the visual layer (RegionData.visual: biome terrains,
 * mountains rising far above the sim's levels) and at 2 m tiles for the sim. Noise is in units, so both runs draw
 * the same land. After the features come the generic passes: scattered trees, bushes and crags by biome and
 * terrain, set pieces, massif sprites over the mountains' rock, lairs and claim points; then a reachability check
 * (every entry and spot joined to the first entry by legal steps), the purpose checklist (./checks.ts; results in
 * `meta.mustHave` and `meta.routes`), and the compact write (`cells` and `objs`, see src/war/region/schema.ts
 * `expandRegion`).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blob, curveField, fbm, nearestSample, noise, spline, type Pt, type Sample } from '../shapes.ts';
import { encodeBiomes, encodeVisual, KINDS, ZVIS } from '../../../src/war/regions/visual.ts';
import { footprintTiles, OBJECT_BLOCKS } from '../../../src/war/region/objects.ts';
import { columnSpans, massifBase, placeMassifs, type MassifPiece } from '../../../src/war/region/massifs.ts';
import { encodeCells, encodeObjects, MAX_HEIGHT } from '../../../src/war/region/compact.ts';
import type { BuildingType, GuardianEntry, MobKind, PrebuiltEntry } from '../../../src/war/types.ts';
import { REGION_DEPTH } from '../../../src/war/sim/depth.ts';
import { readImage } from '../../art/lib/png.mjs';
import { BRIEF, byId, sideOf, type Side, type WorldRegion } from './world.ts';
import { TRADE_ZONES } from '../../../src/war/region/zones.ts';
import { runChecks, type Check } from './checks.ts';

export type { Pt, Sample };
export { fbm };
/** A noisy ellipse: centre x, y, radii rx, ry (units), rotation (radians). */
export type Blob = [number, number, number, number, number?];
type Kind = (typeof KINDS)[number];
export interface RegionDef {
  id: string;
  /** A per-biome draft (docs/impl W-41): hand-made later. */
  draft?: boolean;
  /** Tuning of the generic passes. */
  style?: Partial<Style>;
  build(k: Kit): void;
}
export interface Style {
  /** Elaia zones: grass turns dry where fbm > this (and on h2+ when `dryHigh`). */
  dry: number; dryHigh: boolean;
  /** Mountains zones: grass turns meadow where fbm > this. */
  meadow: number;
  /** Kyrene zones: sand turns dune where fbm > this (and on h2+). */
  dune: number;
  /** Scatter density multipliers. */
  trees: number; bushes: number;
}
const STYLE: Style = { dry: 0.05, dryHigh: true, meadow: 0.1, dune: 0.3, trees: 1, bushes: 1 };

/** Biome libraries a region may name (public/war/biomes/<name>; 'global' is the base set). */
export const BIOMES = ['global', 'elaia', 'kyrene', 'mountains', 'dodona'] as const;
export type BiomeName = (typeof BIOMES)[number];

/** Region side, in units. */
export const U = 256;
const ENTRY = 48, DEPTH = 10, BAND = 28, CORRIDOR = 10;
const SIZE = 512;
const r1 = (v: number) => Math.round(v * 10) / 10;
const hsh = (x: number, y: number, k: number) => {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(k, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
const pick = <T>(ids: readonly T[], r: number) => ids[Math.floor(r * ids.length)];
export const M = (ids: string[]) => ids.map((id) => 'mountains/' + id);
export const E = (ids: string[]) => ids.map((id) => 'elaia/' + id);
export const Y = (ids: string[]) => ids.map((id) => 'kyrene/' + id);
/** Resource kinds that have node objects (src/war/sim/economy.ts RESOURCE_NODES); the rest (silver, salt, horses) live in `meta` only. */
const NODE_IDS: Record<string, string[]> = {
  tin: ['mountains/tin-ore'], iron: ['mountains/iron-ore'], copper: ['kyrene/copper-ore'],
  marble: ['elaia/marble-deposit', 'elaia/marble-outcrop-a', 'elaia/marble-outcrop-b'], stone: ['mountains/boulder-field'],
  food: ['elaia/olive-harvest'], dates: ['kyrene/date-palm-fruit'],
};
/** Point at distance k from sample p along its normal (+ = right of travel, y grows down). */
export const off = (p: Sample, k: number): Pt => [p.x - p.ty * k, p.y + p.tx * k];
export const pt = (p: { x: number; y: number }): Pt => [p.x, p.y];

interface Lair { kind: MobKind; x: number; y: number; count?: number; as?: string; captain?: boolean }
interface Req { kind: 'piece'; id: string; at: Pt; r: number; onRock: boolean; n: number; gap: number }
interface RowsReq { kind: 'rows'; ids: string[]; b: Blob; dx: number; dy: number; seed: number; on: Kind[] }
interface LairReq { kind: MobKind; at: Pt; count?: number; as?: string; captain?: boolean }
interface River { c: Sample[]; half: number; narrows: { s: number; half: number }[] }

export class Kit {
  readonly W: number; readonly H: number; readonly N: number;
  readonly height: number[]; readonly terrain: string[]; readonly water: number[];
  readonly biome: Uint8Array; readonly bDepth: Float32Array;
  /** Depth into the mountains' rock (units; negative outside, -Infinity far away). */
  readonly rock: Float32Array;
  /** Distance to the nearest road's centre line (units, Infinity beyond 12). */
  readonly roadDist: Float32Array;
  readonly spots: Record<string, Pt> = {};
  readonly world: WorldRegion;
  readonly sides: { id: string; side: Side; along: number }[];
  style: Style;
  private sd = 100;
  private zoneOverride = new Uint8Array(0);
  readonly reqs: (Req | RowsReq)[] = [];
  readonly lairReqs: LairReq[] = [];
  readonly claimReqs: { at: Pt; r: number; lairs?: number[] }[] = [];
  readonly patches: { biome: BiomeName; kind: Kind; b: Blob; seed: number; on: string[]; maxH?: number; minH?: number }[] = [];
  readonly oases: Pt[] = [];
  readonly rivers: River[] = [];
  readonly roads: Sample[][] = [];
  /** Cells of a landmark's paved streets and plazas: sim terrain road, drawn as flagstones (visual kind 'paving'). */
  readonly paved: Uint8Array;

  readonly def: RegionDef;
  readonly K: number;
  constructor(def: RegionDef, K: number) {
    this.def = def;
    this.K = K;
    this.W = this.H = U * K;
    this.N = this.W * this.H;
    this.height = new Array<number>(this.N).fill(1);
    this.terrain = new Array<string>(this.N).fill('grass');
    this.water = new Array<number>(this.N).fill(0);
    this.biome = new Uint8Array(this.N);
    this.bDepth = new Float32Array(this.N);
    this.rock = new Float32Array(this.N).fill(-Infinity);
    this.roadDist = new Float32Array(this.N).fill(Infinity);
    this.zoneOverride = new Uint8Array(this.N);
    this.paved = new Uint8Array(this.N);
    this.style = { ...STYLE, ...def.style };
    const w = byId.get(def.id);
    if (!w) throw new Error(`unknown region ${def.id} (scripts/war/regions/world.ts)`);
    this.world = w;
    this.sides = w.adjacent.map((id) => ({ id, ...sideOf(w, byId.get(id)!) }));
    // keep entries on one side apart
    for (const s of ['N', 'E', 'S', 'W'] as Side[]) {
      const on = this.sides.filter((e) => e.side === s).sort((a, b) => a.along - b.along);
      for (let k = 1; k < on.length; k++) if (on[k].along - on[k - 1].along < 0.3) on[k].along = Math.min(0.84, on[k - 1].along + 0.3);
    }
  }

  // ---- grid helpers (x, y in units)
  toUnit = (t: number) => (t + 0.5) / this.K - 0.5;
  toTile = (u: number) => (u + 0.5) * this.K - 0.5;
  each(f: (i: number, x: number, y: number) => void) {
    const { W, H } = this;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) f(y * W + x, this.toUnit(x), this.toUnit(y));
  }
  /** Tile index of a unit point (-1 outside). */
  at(p: Pt): number {
    const x = Math.floor(this.toTile(p[0]) + 0.5), y = Math.floor(this.toTile(p[1]) + 0.5);
    return x < 0 || y < 0 || x >= this.W || y >= this.H ? -1 : y * this.W + x;
  }
  seed() { return this.sd++; }
  private e(b: Blob, x: number, y: number, rough: number, seed: number) { return blob(x, y, b[0], b[1], b[2], b[3], b[4] ?? 0, rough, seed); }
  private field(c: Sample[], reach: number) { return curveField(c, this.W, this.H, reach, this.K); }

  /** The edge point (just outside the map) where a road leaves toward neighbour `id`, and the entry centre `inset` units inside. */
  entry(id: string, inset = -4): Pt {
    const s = this.sides.find((e) => e.id === id);
    if (!s) throw new Error(`${this.def.id} has no neighbour ${id}`);
    const c = s.along * U;
    return s.side === 'N' ? [c, inset] : s.side === 'S' ? [c, U - inset] : s.side === 'W' ? [inset, c] : [U - inset, c];
  }

  // ---- ground
  fill(h: number) { this.height.fill(h); }
  /** Rounded hill: one level per `step` units up to `top` over the ground it stands on. */
  hill(b: Blob, top: number, step = 3, rough = 2.5) {
    const s = this.seed();
    this.each((i, x, y) => {
      const e = this.e(b, x, y, rough, s);
      if (e > 0 && this.terrain[i] !== 'rock') this.height[i] = Math.max(this.height[i], Math.min(top, this.height[i] + 1 + Math.floor(e / step)));
    });
  }
  /** Hand-written relief: `f` gives a height for a unit point (its own noise seed passed in; NaN: leave the tile); the ground rises to it (`set`: takes it). */
  lift(f: (x: number, y: number, seed: number) => number, set = false) {
    const s = this.seed();
    this.each((i, x, y) => {
      if (this.water[i] || this.terrain[i] === 'rock') return;
      const h = f(x, y, s);
      if (Number.isNaN(h)) return;
      const v = Math.max(0, Math.min(MAX_HEIGHT, Math.round(h)));
      this.height[i] = set ? v : Math.max(this.height[i], v);
    });
  }
  /** Flat top at `h` ringed by a cliff. */
  plateau(b: Blob, h: number, opts: { rough?: number; terrain?: string } = {}) {
    const s = this.seed();
    this.each((i, x, y) => {
      if (!this.water[i] && this.e(b, x, y, opts.rough ?? 3, s) > 0) {
        this.height[i] = h;
        if (opts.terrain) this.terrain[i] = opts.terrain;
      }
    });
  }
  /** Lower the ground to at most h inside (a gully, a crater floor); `step` > 0 slopes the rim down one level per step units. */
  basin(b: Blob, h: number, step = 0, rough = 2) {
    const s = this.seed();
    this.each((i, x, y) => {
      const e = this.e(b, x, y, rough, s);
      if (e > 0) this.height[i] = Math.min(this.height[i], step > 0 ? h + Math.max(0, Math.floor((this.height[i] - h) - e / step)) : h);
    });
  }
  /** A ridge along pts: crest at `crest` (flat top half-width `top`, widest mid-way), slopes one level per `step` units; `cliff` +1/-1 makes the right/left side (of travel) a cliff. */
  ridge(pts: Pt[], o: { crest: number; reach?: number; step?: number; top?: number; cliff?: -1 | 0 | 1; base?: number }) {
    const c = spline(pts), len = c[c.length - 1].s, s = this.seed(), f = this.field(c, o.reach ?? 30);
    const step = o.step ?? 2.5, top = o.top ?? 1, base = o.base ?? 1;
    this.each((i, x, y) => {
      if (f.d[i] === Infinity) return;
      const w = top + 2 * Math.sin((Math.PI * f.s[i]) / len);
      const e = f.d[i] + fbm(x, y, 9, s);
      const cliffSide = o.cliff && f.side[i] === o.cliff;
      const h = cliffSide ? (e <= w ? o.crest : -1) : o.crest - Math.floor(Math.max(0, e - w) / step);
      if (h >= base && h > this.height[i] && this.terrain[i] !== 'rock') this.height[i] = h;
    });
    return c;
  }
  /**
   * Mountain chain along pts: impassable rock (5 at the rim, 7 in the core, or 2 and 4 over ground already that high) in a
   * noisy band, foothills a level up round it.
   */
  mountains(pts: Pt[], o: { width?: number; wave?: number; spurs?: Blob[]; foot?: number } = {}) {
    const c = spline(pts), s = this.seed(), f = this.field(c, (o.width ?? 13) + 14);
    const spurSeed = this.seed();
    this.each((i, x, y) => {
      let e = f.d[i] === Infinity ? -Infinity : (o.width ?? 13) + (o.wave ?? 4) * Math.sin(f.s[i] / 29) - f.d[i] + 4 * fbm(x, y, 12, s) + 1.5 * fbm(x, y, 4, s + 1);
      for (const b of o.spurs ?? []) e = Math.max(e, this.e(b, x, y, 3, spurSeed));
      this.rockAt(i, e, o.foot);
    });
    return c;
  }
  /** A blob of mountain rock (a massif, a peak, a butte when `biome` stays global). */
  rockMass(b: Blob, o: { foot?: number; rough?: number } = {}) {
    const s = this.seed();
    this.each((i, x, y) => this.rockAt(i, this.e(b, x, y, o.rough ?? 3, s), o.foot));
  }
  private rockAt(i: number, e: number, foot?: number) {
    if (e === -Infinity) return;
    if (e > this.rock[i]) this.rock[i] = e;
    if (e > 0) {
      const v = e < 4 ? 5 : 7;
      this.height[i] = this.terrain[i] === 'rock' || this.height[i] < v ? Math.max(this.height[i], v) : Math.min(MAX_HEIGHT, this.height[i] + v - 3);
      this.terrain[i] = 'rock';
      this.water[i] = 0;
    } else if (e > -5 && this.terrain[i] !== 'rock') this.height[i] = Math.max(this.height[i], foot ?? this.height[i] + 1);
  }
  /** Paint a terrain over a blob (only over `on` terrains, default grass), optionally only within a height band. */
  paint(t: string, b: Blob, o: { on?: string[]; minH?: number; maxH?: number; rough?: number } = {}) {
    const s = this.seed(), on = o.on ?? ['grass'];
    this.each((i, x, y) => {
      if (this.water[i] || !on.includes(this.terrain[i])) return;
      if ((o.minH !== undefined && this.height[i] < o.minH) || (o.maxH !== undefined && this.height[i] > o.maxH)) return;
      if (this.e(b, x, y, o.rough ?? 3.5, s) > 0) this.terrain[i] = t;
    });
  }
  forest(...bs: Blob[]) { for (const b of bs) this.paint('forest', b, { on: ['grass', 'dirt'] }); }
  /**
   * Water body: `deep` core (bed 0) with a shallow rim `shore` units wide, a sand beach `beach` units wide at most a level
   * over the water; or all shallow (pools, lagoons). Over everything but rock.
   */
  waterBody(b: Blob, o: { deep?: boolean; shore?: number; beach?: number; rough?: number; beachTerrain?: string } = {}) {
    const s = this.seed(), shore = o.shore ?? 2, beach = o.beach ?? 3, deep = o.deep ?? true;
    this.each((i, x, y) => {
      if (this.terrain[i] === 'rock') return;
      const e = this.e(b, x, y, o.rough ?? 4, s);
      if (e > (deep ? shore : 0)) (this.water[i] = deep ? 2 : 1), (this.height[i] = 0), (this.terrain[i] = deep ? 'dirt' : 'sand');
      else if (e > 0) (this.water[i] = 1), (this.height[i] = deep ? 0 : this.height[i]), (this.terrain[i] = 'sand');
      else if (e > -beach && !this.water[i]) {
        this.height[i] = Math.min(this.height[i], 1);
        if (this.terrain[i] !== 'road') this.terrain[i] = o.beachTerrain ?? 'sand';
      } else if (e > -beach - 6 && !this.water[i]) this.height[i] = Math.min(this.height[i], 2 + Math.floor((-beach - e) / 3));
    });
  }
  /**
   * A river along pts, `half` units wide each side (noisy). Deep: impassable but at `fords` (shallow, sand) and bridgeable
   * at `narrows` (half-width cut to the given value: <= 3 units is 12 tiles, a wooden bridge; <= 6 is 24, stone, W-33).
   * Shallow (`deep: false`): a brook anyone wades. The bed sits at `bed` (a level or a function of the arc length); the
   * banks climb back to the land one level per `bank` units, so the river runs in its own valley.
   */
  river(pts: Pt[], o: { half?: number; deep?: boolean; bed?: number | ((s: number) => number); bank?: number; fords?: Pt[]; fordHalf?: number; narrows?: [Pt, number][]; name?: string }) {
    const c = spline(pts), s0 = this.seed(), half0 = o.half ?? 4, bank = o.bank ?? 3;
    const fords = (o.fords ?? []).map((p) => nearestSample(c, p[0], p[1]).s);
    const narrows = (o.narrows ?? []).map(([p, h]) => ({ s: nearestSample(c, p[0], p[1]).s, half: h }));
    const f = this.field(c, half0 + 3 + bank * 6);
    const bedAt = typeof o.bed === 'function' ? o.bed : () => (o.bed as number | undefined) ?? 0;
    const halfAt = (i: number, x: number, y: number) => {
      let h = half0 + 1.1 * fbm(x, y, 10, s0) * Math.min(1, half0 / 4) + 0.7 * Math.sin(f.s[i] / 23) * Math.min(1, half0 / 4);
      for (const n of narrows) h = Math.min(h, n.half + Math.max(0, Math.abs(f.s[i] - n.s) - 2) * 0.35);
      return h;
    };
    this.each((i, x, y) => {
      const d = f.d[i];
      if (d === Infinity || this.terrain[i] === 'rock') return;
      const half = halfAt(i, x, y), bed = bedAt(f.s[i]);
      const atFord = fords.some((s) => Math.abs(f.s[i] - s) <= (o.fordHalf ?? 2.5));
      if (d <= half) {
        this.height[i] = bed;
        const shallow = !(o.deep ?? true) || atFord;
        this.water[i] = shallow ? 1 : 2;
        this.terrain[i] = shallow ? 'sand' : 'dirt';
      } else {
        if (this.water[i]) return;
        const lim = bed + 1 + Math.floor((d - half) / bank);
        if (lim < this.height[i]) this.height[i] = lim;
        const nearFord = fords.some((s) => Math.abs(f.s[i] - s) <= 7);
        if (this.terrain[i] !== 'road' && ((nearFord && d <= half + 3) || (d <= half + 2 && fbm(x, y, 6, s0 + 1) > 0.25))) this.terrain[i] = 'sand';
      }
    });
    const r = { c, half: half0, narrows };
    this.rivers.push(r);
    if (o.name) {
      fords.forEach((s, k) => (this.spots[`${o.name}Ford${k || ''}`] = pt(c.find((p) => p.s >= s)!)));
      narrows.forEach((n, k) => {
        const p = c.find((q) => q.s >= n.s)!;
        this.spots[`${o.name}Narrows${k || ''}`] = pt(p);
        this.spots[`${o.name}NarrowsA${k || ''}`] = off(p, n.half + 3);
        this.spots[`${o.name}NarrowsB${k || ''}`] = off(p, -(n.half + 3));
      });
    }
    return c;
  }
  /** A dry cut along pts (wadi, gully, ravine): floor at `h`, `half` units each side, walls a cliff (`bank` 0) or one level per `bank` units; floor terrain `t`. */
  cut(pts: Pt[], o: { h: number; half?: number; bank?: number; t?: string }) {
    const c = spline(pts), s0 = this.seed(), half0 = o.half ?? 3, bank = o.bank ?? 0;
    const f = this.field(c, half0 + 2 + bank * 7);
    this.each((i, x, y) => {
      const d = f.d[i];
      if (d === Infinity || this.water[i] || this.terrain[i] === 'rock') return;
      const half = half0 + 0.8 * fbm(x, y, 7, s0);
      if (d <= half) {
        this.height[i] = Math.min(this.height[i], o.h);
        if (o.t && this.terrain[i] !== 'road') this.terrain[i] = o.t;
      } else if (bank > 0) this.height[i] = Math.min(this.height[i], o.h + 1 + Math.floor((d - half) / bank));
    });
    return c;
  }
  /**
   * A road along pts, `w` units each side of its line. Graded: its level along the line never changes faster than one
   * per `grade` units (it cuts down into the land it climbs). It spans deep water only within `span` units of a
   * `bridges` point (a road bridge deck a level over the bed), crosses rock only with `pass` (the cut is at most that
   * high), and leaves shallow water as a ford. `fill`: a ramp built up from the low ground instead of a cut.
   */
  road(pts: Pt[], o: { w?: number; grade?: number; bridges?: Pt[]; span?: number; pass?: number; fill?: boolean } = {}) {
    const c = spline(pts), w = o.w ?? 1.6, grade = o.grade ?? 4, span = o.span ?? 7;
    // the line's level: the land under it (rock: the pass height; deep water: a deck at the banks' level)
    const raw = c.map((p) => {
      const i = this.at([p.x, p.y]);
      if (i < 0) return Infinity;
      if (this.terrain[i] === 'rock') return o.pass ?? 7;
      if (this.water[i] === 2) return Infinity;
      return this.height[i];
    });
    // deep water: the level of the nearest land on both sides along the line
    for (let k = 0; k < raw.length; k++) if (raw[k] === Infinity) {
      let a = k, b = k;
      while (a > 0 && raw[a] === Infinity) a--;
      while (b < raw.length - 1 && raw[b] === Infinity) b++;
      raw[k] = Math.max(1, Math.min(raw[a] === Infinity ? 9 : raw[a], raw[b] === Infinity ? 9 : raw[b]));
      if (raw[k] === 9) raw[k] = 1;
    }
    const prof = raw.slice(), sgn = o.fill ? -1 : 1, lim = o.fill ? Math.max : Math.min;
    for (let k = 1; k < c.length; k++) prof[k] = lim(prof[k], prof[k - 1] + (sgn * (c[k].s - c[k - 1].s)) / grade);
    for (let k = c.length - 2; k >= 0; k--) prof[k] = lim(prof[k], prof[k + 1] + (sgn * (c[k + 1].s - c[k].s)) / grade);
    const f = this.field(c, 12);
    const near = (i: number) => {
      const s = f.s[i];
      let lo = 0, hi = c.length - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (c[m].s < s) lo = m + 1; else hi = m; }
      return lo;
    };
    const bridgeS = (o.bridges ?? []).map((p) => nearestSample(c, p[0], p[1]).s);
    this.each((i, x, y) => {
      if (f.d[i] < this.roadDist[i]) this.roadDist[i] = f.d[i];
      if (f.d[i] > w || this.inSite(x, y)) return; // a landmark lays its own streets
      const h = Math.max(0, Math.min(MAX_HEIGHT, Math.round(prof[near(i)] - 0.01)));
      if (this.water[i] === 1) return; // a ford stays a sandy shallow
      if (this.water[i] === 2) {
        if (!bridgeS.some((s) => Math.abs(f.s[i] - s) <= span)) return;
        this.water[i] = 0;
      } else if (this.terrain[i] === 'rock' && o.pass === undefined) return;
      this.height[i] = h;
      this.terrain[i] = 'road';
    });
    this.roads.push(c);
    return c;
  }

  /** A causeway: firm ground (h `h`, grass) along pts where they cross water or marsh, `half` units each side; lay a road on it. */
  causeway(pts: Pt[], half = 1.2, h = 1) {
    const c = spline(pts), f = this.field(c, half + 2);
    this.each((i) => {
      if (f.d[i] > half || this.terrain[i] === 'rock' || (!this.water[i] && this.terrain[i] !== 'marsh')) return;
      this.water[i] = 0; this.height[i] = h; this.terrain[i] = 'grass';
    });
    return c;
  }
  /** Dry land at h over a blob (an isle in a lake), over everything but rock. */
  island(b: Blob, h: number, rough = 2) {
    const s = this.seed();
    this.each((i, x, y) => {
      if (this.terrain[i] === 'rock' || this.e(b, x, y, rough, s) <= 0) return;
      this.water[i] = 0; this.height[i] = h; if (this.terrain[i] === 'sand' || this.terrain[i] === 'dirt' || this.terrain[i] === 'marsh') this.terrain[i] = 'grass';
    });
  }
  /** A town square (docs/WAR.md trade hub: >= 24 x 24 tiles): flat dirt `half` units each side of `p` at level `h` (default the ground there), the land round it eased to it; spot `market`. */
  square(p: Pt, half = 7, h?: number) {
    const i0 = this.at(p), h0 = h ?? this.height[i0];
    this.each((i, x, y) => {
      if (this.terrain[i] === 'rock') return;
      const d = Math.max(Math.abs(x - p[0]), Math.abs(y - p[1])) - half;
      if (d <= 0) { this.height[i] = h0; this.water[i] = 0; if (this.terrain[i] !== 'road') this.terrain[i] = 'dirt'; }
      else if (d < 8 && !this.water[i]) this.height[i] = Math.max(h0 - 1 - Math.floor(d / 2), Math.min(h0 + 1 + Math.floor(d / 2), this.height[i]));
    });
    return this.spot('market', p);
  }
  /** Ploughed fields: furrows of dirt every 3 units across a blob (over grass), strips at angle `a`; spot `fields`. */
  fields(b: Blob, a = 0) {
    const s = this.seed(), ca = Math.cos(a), sa = Math.sin(a);
    this.each((i, x, y) => {
      if (this.water[i] || this.terrain[i] !== 'grass' || this.e(b, x, y, 2, s) <= 0) return;
      const u = (x - b[0]) * ca + (y - b[1]) * sa, v = (y - b[1]) * ca - (x - b[0]) * sa;
      if (((u % 3) + 3) % 3 < 1.5 && ((v % 24) + 24) % 24 > 1.5) this.terrain[i] = 'dirt';
    });
    return this.spot('fields', [b[0], b[1]]);
  }

  // ---- art
  /** Biome library over a blob (or a depth function: units inside the zone's edge); later zones win. */
  zone(name: BiomeName, b: Blob | ((i: number, x: number, y: number) => number), rough = 4) {
    const s = this.seed(), k = BIOMES.indexOf(name);
    this.each((i, x, y) => {
      const e = typeof b === 'function' ? b(i, x, y) : this.e(b, x, y, rough, s);
      if (e > 0) (this.biome[i] = k), (this.bDepth[i] = e), (this.zoneOverride[i] = 1);
    });
  }
  /** A biome terrain over a blob, drawn where the tile is of that biome and its sim terrain is in `on` (default grass). */
  patch(biome: BiomeName, kind: Kind, b: Blob, on: string[] = ['grass'], maxH?: number, minH?: number) { this.patches.push({ biome, kind, b, seed: this.seed(), on, maxH, minH }); }
  /** A Kyrene oasis: a shallow spring pool with oasis ground round it (palms, reeds, the spring and a well come with it). */
  oasis(p: Pt, r = 1.8) {
    const s = this.seed();
    this.each((i, x, y) => {
      if (Math.hypot(x - p[0], y - p[1]) + 0.8 * fbm(x, y, 3, s) < r && this.terrain[i] !== 'rock') (this.water[i] = 1), (this.terrain[i] = 'sand');
    });
    this.oases.push(p);
  }

  // ---- things (placed at the sim size, after the land)
  spot(name: string, p: Pt) { this.spots[name] = p; return p; }
  /** `n` copies of a set piece on free ground within `r` units of `at`, `gap` units apart (blocking ones keep their footprint clear). */
  /** W-48: a waterfall where a river falls over a cliff step, its foot at `at`, the foam on its plunge pool at `pool` (units). */
  readonly falls: { at: Pt; pool: Pt }[] = [];
  fall(at: Pt, pool: Pt) { this.falls.push({ at, pool }); }
  piece(id: string, at: Pt, o: { r?: number; onRock?: boolean; n?: number; gap?: number } = {}) {
    this.reqs.push({ kind: 'piece', id, at, r: o.r ?? 12, onRock: o.onRock ?? false, n: o.n ?? 1, gap: o.gap ?? 4 });
  }
  /** Rows of plants (vines, olive rows) every dx x dy tiles inside a blob, on open ground of the given visual kinds. */
  rows(ids: string[], b: Blob, o: { dx?: number; dy?: number; on?: Kind[] } = {}) {
    this.reqs.push({ kind: 'rows', ids, b, dx: o.dx ?? 3, dy: o.dy ?? 2, seed: this.seed(), on: o.on ?? ['grass', 'dry', 'rossa', 'grove'] });
  }
  /** Resource nodes of a kind (tin, iron, copper, marble, stone, food, dates) round a point. */
  resource(kind: keyof typeof NODE_IDS, at: Pt, n = 3, r = 14) {
    const ids = NODE_IDS[kind];
    for (let k = 0; k < n; k++) this.piece(ids[k % ids.length], at, { r, gap: 5 });
  }
  lair(kind: MobKind, at: Pt, o: { count?: number; as?: string; captain?: boolean } = {}) { this.lairReqs.push({ kind, at, ...o }); }
  /** A claim point near `at` whose zone is the lairs within `r` units (or the listed lair indices). */
  claim(at: Pt, r = 70, lairs?: number[]) { this.claimReqs.push({ at, r, lairs }); }

  // ---- town dressing (M7b, docs/WAR.md "Pre-built structures"): every town piece is a pre-built sim building
  // (RegionData.prebuilt) of a town, the group round an agora or a village well, owned through that town's claim point.
  // The sim blocks their footprints (gates open for their owner, neutral ones for all), so the trade court's wall ring
  // leaves its two gates as the only ways in without any RegionData.blocked tiles.
  readonly townReqs: TownReq[] = [];
  /** The towns (unit centres): an agora's (its market spot is the claim point) or a village's (by its well). */
  readonly towns: { at: Pt; kind: 'agora' | 'village' }[] = [];
  /** Sim tiles that were road when agora() paved its square (the slots keep off them). */
  readonly streets = new Set<number>();
  /** Unit x of a sim tile's centre and back (the sim run's grid, whatever this run's K). */
  private simTile = (u: number) => (u + 0.5) * 2 - 0.5;
  private unitOf = (t: number) => (t + 0.5) / 2 - 0.5;
  /** A new town at `at` (`kind` given), else the nearest one within 70 units, else a new village there. */
  private townAt(at: Pt, kind?: 'agora' | 'village'): number {
    if (!kind) {
      let best = -1, bd = 70;
      this.towns.forEach((t, i) => { const d = Math.hypot(t.at[0] - at[0], t.at[1] - at[1]); if (d < bd) (bd = d), (best = i); });
      if (best >= 0) return best;
    }
    return this.towns.push({ at, kind: kind ?? 'village' }) - 1;
  }
  /**
   * One town structure with its footprint's NW corner on sim tile (tx, ty), of `town` (default the nearest); `slot`:
   * skipped where it would land on a street, the court's ground, or water; `court`: a piece of the safe court.
   */
  structure(id: string, tx: number, ty: number, slot = false, town = this.townAt([this.unitOf(tx), this.unitOf(ty)]), court = false) {
    this.townReqs.push({ kind: 'at', id, t: [tx, ty], slot, town, court });
  }
  /** `n` structures (cycling `ids`) on free, flat, dry ground `r0`..`r1` sim tiles from the unit point `at`, `gap` tiles apart; `street` > 0 pulls them to within that many tiles of a road. */
  scatterTown(ids: string[], at: Pt, o: { n: number; r0?: number; r1: number; gap?: number; street?: number; water?: boolean; town?: number }) {
    this.townReqs.push({ kind: 'near', ids, at: [this.simTile(at[0]), this.simTile(at[1])], n: o.n, r0: o.r0 ?? 0, r1: o.r1, gap: o.gap ?? 4, street: o.street ?? 0, water: !!o.water, town: o.town ?? this.townAt(at) });
  }
  /**
   * A home agora or a frontier town's square (docs/WAR.md "Trade towns"), after the square and its roads: the square
   * paved, two stoas facing over it, rows of stalls on its north and south sides, statues, a well and the price board
   * round a clear centre (the market spot, the claim point), a temple off the square.
   */
  agora(p: Pt, half = 6.5) {
    const tx = Math.round(this.simTile(p[0])), ty = Math.round(this.simTile(p[1])), town = this.townAt(p, 'agora');
    if (this.K === 2) for (let i = 0; i < this.N; i++) if (this.terrain[i] === 'road') this.streets.add(i);
    // paved, but for a beaten-earth heart round the market spot (the claim banner stands on open ground)
    this.each((i, x, y) => { if (!this.water[i] && this.terrain[i] !== 'rock' && Math.max(Math.abs(x - p[0]), Math.abs(y - p[1])) <= half && Math.hypot(x - p[0], y - p[1]) > 3.2) this.terrain[i] = 'road'; });
    const S = (id: string, dx: number, dy: number) => this.structure(T(id), tx + dx, ty + dy, true, town);
    S('stoa', -12, -9); S('stoa', 10, 3);
    // stalls in rows on the north and south sides, a second row at the west and east ends (the square check keeps <= 15% closed)
    for (const [k, dx] of [-10, -7, 5, 8].entries()) for (const [n, dy] of [-11, -7, 5, 9].entries()) if (n === 0 || n === 3 || k === 0 || k === 3) S(['stall-a', 'stall-b', 'stall-c'][(k + n) % 3], dx, dy);
    S('statue', -6, -6); S('statue', 5, 5); S('well', 5, -6); S('board', -6, 5); S('goods', -3, -9); S('goods', 2, 10);
    this.scatterTown([T('temple')], p, { n: 1, r0: 16, r1: 30, street: 4, town });
  }
  /**
   * The walled market court of a frontier trade town (src/war/region/zones.ts): its ground levelled to `h` and paved
   * with the caravan yards, a 3 m stone wall (stoneWall) on the court's edge tiles with stone towers on the corners, a
   * stone gate in each gate rect (the only ways in), stalls along the inner walls, the price board and the rented
   * warehouses outside. The court's pieces stay neutral, gates open to all, and take no harm (src/war/sim/works.ts).
   */
  court(h: number) {
    const z = TRADE_ZONES[this.world.id];
    if (!z) throw new Error(`${this.world.id} has no trade court (src/war/region/zones.ts)`);
    const c = z.safe[0], { x, y, w, h: hh } = c, town = this.townAt([this.unitOf(x + w / 2), this.unitOf(y + hh / 2)]);
    const C = (id: string, tx: number, ty: number) => this.structure(T(id), tx, ty, false, town, true);
    this.flatRect(x - 6, y - 2, x + w + 6, y + hh + 2, h, true);
    for (const r of z.yard) this.flatRect(r.x, r.y, r.x + r.w, r.y + r.h, h, true);
    const gate = new Set((c.gates ?? []).flatMap((g) => [...Array(g.w * g.h)].map((_, n) => `${g.x + (n % g.w)},${g.y + Math.floor(n / g.w)}`)));
    for (const [cx, cy] of [[x - 1, y - 1], [x + w - 1, y - 1], [x - 1, y + hh - 1], [x + w - 1, y + hh - 1]]) C('tower', cx, cy);
    // the north and south faces in 2-tile runs between the towers, the gates in their gaps; the west and east faces likewise
    for (const fy of [y, y + hh - 1]) for (let fx = x + 1; fx < x + w - 1; fx += 2) {
      if (gate.has(`${fx},${fy}`)) { C('gate-x', fx, fy); continue; }
      if (fx + 1 < x + w - 1 && !gate.has(`${fx + 1},${fy}`)) C('wall-x', fx, fy);
      else { C('wall-x', fx - 1, fy); }
    }
    for (const fx of [x, x + w - 1]) for (let fy = y + 1; fy < y + hh - 1; fy += 2) C('wall-y', fx, Math.min(fy, y + hh - 3));
    // inside: stalls against the west and east walls, the board and goods by the gate lane; outside: the warehouses
    for (const [dx, dy, id] of [[1, 1, 'stall-c'], [1, hh - 3, 'stall-b'], [w - 3, 1, 'stall-a'], [w - 3, hh - 3, 'stall-c']] as const) C(id, x + dx, y + dy);
    C('board', x + 3, y + 4); C('goods', x + w - 4, y + 5); C('goods', x + 3, y + hh - 3);
    for (const [dx, dy] of [[-5, 1], [-5, 5], [w + 2, 1], [w + 2, 5]]) this.structure(T('warehouse'), x + dx, y + dy, true, town);
  }
  /** Houses and workshops along the streets round a centre (units), `r0`..`r1` sim tiles out. */
  houses(at: Pt, n: number, r0: number, r1: number, ids = ['house-a', 'house-b', 'house-a', 'workshop', 'house-b', 'cottage', 'storehouse']) {
    this.scatterTown(ids.map(T), at, { n, r0, r1, gap: 5, street: 5 });
  }
  /** Farms, olive presses and cottages on the outskirts (of `town`, default the nearest). */
  outskirts(at: Pt, n: number, r0: number, r1: number, ids = ['farm', 'olive-press', 'cottage', 'farm', 'cottage'], town?: number) {
    this.scatterTown(ids.map(T), at, { n, r0, r1, gap: 8, street: 10, town });
  }
  /** A small village: cottages and a house round a well (its claim point beside it), farms beyond. */
  village(at: Pt, n = 5) {
    const town = this.townAt(at, 'village');
    this.scatterTown([T('well')], at, { n: 1, r1: 6, town });
    this.scatterTown(['cottage', 'house-a', 'cottage', 'cottage', 'house-b', 'cottage'].map(T), at, { n, r0: 4, r1: 18, gap: 5, street: 6, town });
    this.outskirts(at, Math.max(2, Math.round(n / 2)), 14, 32, ['farm', 'olive-press', 'farm'], town);
  }
  /** A wooden jetty out over the water near `at`. */
  jetty(at: Pt, r = 24) { this.scatterTown([T('jetty')], at, { n: 1, r1: r, water: true }); }

  // ---- M7d landmarks (docs/WAR.md "Landmarks"; art: public/war/landmarks/landmarks.json), at true scale (W-48)
  readonly sites: Site[] = [];
  /**
   * A landmark (docs/WAR.md "Landmarks") laid out as a real place: a Site whose NW corner is the sim tile under unit
   * point `at`, `size` sim tiles big. Its pieces (Site.put, line, ring, grid, block) become pre-built landmark
   * structures of a town of its own (the mobs' while its guardian lives, gates shut), claimed near `claim` (site tiles,
   * default its centre); its node pieces the rare-good nodes, its guardians posted at site tiles. The script shapes the
   * ground with Site.level and Site.pave (both runs); the pieces are placed in the sim run.
   */
  site(id: string, at: Pt, size: [number, number], o: { guardians: LGuard[]; nodes?: [string, number, number][]; claim?: Pt }): Site {
    const tx = Math.round(this.simTile(at[0])), ty = Math.round(this.simTile(at[1]));
    const c = o.claim ?? [size[0] / 2, size[1] / 2];
    const s = new Site(this, id, tx, ty, size[0], size[1], this.townAt(this.unitAt(tx + c[0], ty + c[1]), 'village'), o.guardians, o.nodes ?? []);
    this.sites.push(s);
    return s;
  }
  /** Ground of sim tiles x0..x1-1, y0..y1-1 to level h0, dried (the land round eased to it unless `ease` is false: cliffs stay); `pave`: road. */
  flatRect(x0: number, y0: number, x1: number, y1: number, h0: number, pave: boolean, ease = true) {
    this.each((i, x, y) => {
      if (this.terrain[i] === 'rock') return;
      const tx = Math.floor(this.simTile(x) + 0.5), ty = Math.floor(this.simTile(y) + 0.5);
      const d = Math.max(x0 - tx, tx - (x1 - 1), y0 - ty, ty - (y1 - 1)) / 2; // units outside the rect
      if (d <= 0) { this.height[i] = h0; this.water[i] = 0; if (pave) this.terrain[i] = 'road'; }
      else if (ease && d < 8 && !this.water[i]) this.height[i] = Math.max(h0 - 1 - Math.floor(d / 2), Math.min(h0 + 1 + Math.floor(d / 2), this.height[i]));
    });
  }
  /** Terrain `t` on the dry, rockless sim tiles x0..x1-1, y0..y1-1 (heights kept). */
  paintRect(x0: number, y0: number, x1: number, y1: number, t: string) {
    this.each((i, x, y) => {
      if (this.terrain[i] === 'rock' || this.water[i]) return;
      const tx = Math.floor(this.simTile(x) + 0.5), ty = Math.floor(this.simTile(y) + 0.5);
      if (tx >= x0 && tx < x1 && ty >= y0 && ty < y1) this.setTerrain(i, t);
    });
  }
  /** Terrain `t` on cell i ('paving': a road drawn as flagstones). */
  private setTerrain(i: number, t: string) {
    this.paved[i] = t === 'paving' ? 1 : 0;
    this.terrain[i] = t === 'paving' ? 'road' : t;
  }
  /** Per sim tile a level (undefined: leave it): dried, no easing (the edges stay cliffs). */
  maskLevel(f: (tx: number, ty: number) => number | undefined) {
    this.each((i, x, y) => {
      if (this.terrain[i] === 'rock') return;
      const h = f(Math.floor(this.simTile(x) + 0.5), Math.floor(this.simTile(y) + 0.5));
      if (h !== undefined) (this.height[i] = h), (this.water[i] = 0);
    });
  }
  /** Per sim tile a terrain (undefined: leave it) on dry, rockless ground. */
  maskPaint(f: (tx: number, ty: number) => string | undefined) {
    this.each((i, x, y) => {
      if (this.terrain[i] === 'rock' || this.water[i]) return;
      const t = f(Math.floor(this.simTile(x) + 0.5), Math.floor(this.simTile(y) + 0.5));
      if (t !== undefined) this.setTerrain(i, t);
    });
  }
  /** Water `depth` (1 shallow, 2 deep) over sim tiles x0..x1-1, y0..y1-1 but rock: its bed at level `bed`, sand. */
  waterRect(x0: number, y0: number, x1: number, y1: number, depth: 1 | 2, bed = 0) {
    this.each((i, x, y) => {
      if (this.terrain[i] === 'rock') return;
      const tx = Math.floor(this.simTile(x) + 0.5), ty = Math.floor(this.simTile(y) + 0.5);
      if (tx >= x0 && tx < x1 && ty >= y0 && ty < y1) (this.water[i] = depth), (this.height[i] = bed), (this.terrain[i] = 'sand');
    });
  }
  /** Sim tile of a unit coordinate. */
  tileOfUnit(u: number) { return Math.floor(this.simTile(u) + 0.5); }
  /** Unit point of sim tile (tx, ty). */
  unitAt(tx: number, ty: number): Pt { return [this.unitOf(tx), this.unitOf(ty)]; }
  /** Whether unit point (x, y) lies inside a landmark site (its bounds). */
  inSite(x: number, y: number) {
    if (!this.sites.length) return false;
    const tx = Math.floor(this.simTile(x) + 0.5), ty = Math.floor(this.simTile(y) + 0.5);
    return this.sites.some((s) => tx >= s.x0 && ty >= s.y0 && tx < s.x0 + s.w && ty < s.y0 + s.h);
  }
}

/** A landmark piece of a site: a landmarks.json piece id, or `@id` (a build-mode piece of LANDMARK_AT, `@town-<id>` one of the town set); its NW sim tile, start hp share, a ruin. */
export interface SitePiece { id: string; x: number; y: number; hp?: number; ruined?: boolean }
/** A wall ring's pieces: `<wall>-x/-y` segments (4 x 2), `<tower>` (3 x 3), `<gate>-x/-y` (6 x 3). */
export interface WallSet { wall: string; tower: string; gate: string }
/** A district's buildings: [piece, weight]; the share lying in ruins, the hp share range of the rest; `alley`: the chance of a 1-tile gap after a building. */
export interface District { ids: [string, number][]; ruin: number; hp: [number, number]; alley?: number; empty?: number }
export type Side4 = 'N' | 'E' | 'S' | 'W';
/**
 * The city kit (W-48): a landmark as a real place, in sim tiles from its NW corner. Streets (grid: avenues and streets
 * paved and kept clear, the blocks between returned), blocks (a row of lots along each street front, a building of the
 * district on each), wall lines and rings (towers at the ends and about every `every` tiles, gates where the roads come
 * in, whole 8 m segments between), single pieces (put). Every piece is a pre-built sim building (W-47); the district and
 * wall options give the place its condition by lore (ruined quarters, breaches).
 */
export class Site {
  readonly pieces: SitePiece[] = [];
  readonly extraNodes: [string, number, number][];
  /** Relief drawn `lift` times as tall above level `base` (visual only, kit.ts visualLayer); vz: smooth ramp levels per site tile. */
  lift = 1;
  base = 0;
  readonly vz = new Map<number, number>();
  /** W-51 visual levels per sim level (sorted [sim, visual] pairs, interpolated; null: `base + (h - base) * lift`): a crag drawn taller than its upper tier. */
  levels: [number, number][] | null = null;
  /** The visual level sim level `h` (fractional on a ramp) is drawn at. */
  vis(h: number): number {
    const L = this.levels;
    if (!L) return this.base + (h - this.base) * this.lift;
    if (h <= L[0][0]) return L[0][1] + (h - L[0][0]);
    for (let n = 1; n < L.length; n++) if (h <= L[n][0]) return L[n - 1][1] + ((L[n][1] - L[n - 1][1]) * (h - L[n - 1][0])) / (L[n][0] - L[n - 1][0]);
    const e = L[L.length - 1];
    return e[1] + (h - e[0]);
  }
  /** The site tiles its `lift` applies to (null: all above `base`): the crag itself, not the hills round it. */
  liftOnly: ((x: number, y: number) => boolean) | null = null;
  /** W-51 crag skirts (Site.skirt): per site tile of its rock, the level its ledge is drawn at (before `lift`). */
  readonly vrock = new Map<number, number>();
  /** The skirt's visual kinds: `a` where the noise is over `cut`, else `b` (a drifted crag: drift over rock). */
  skirtKinds: { a: Kind; b: Kind; cut: number } = { a: 'rock', b: 'rock', cut: 0 };
  /** W-51 a visual ground for the site's tiles where `inside` holds (sim terrain kept): `ground` on open land, `pave` on its streets. */
  look: { ground: Kind; pave: Kind; inside: (x: number, y: number) => boolean; rough?: Kind } | null = null;
  /** Site tiles round a ruin (within 1, most of them): its rubble ground (look.rough). */
  private rubbleAt: Set<number> | null = null;
  roughAt(x: number, y: number): boolean {
    if (!this.rubbleAt) {
      this.rubbleAt = new Set();
      for (const p of this.pieces) if (p.ruined) {
        const [w, h] = this.fp(p.id), px = p.x - this.x0, py = p.y - this.y0;
        for (let j = py - 1; j < py + h + 1; j++) for (let i = px - 1; i < px + w + 1; i++) if (hsh(i, j, 61) < 0.7) this.rubbleAt.add(j * 4096 + i);
      }
    }
    return this.rubbleAt.has(y * 4096 + x);
  }
  /** Dressing (biome objects: palms, stalls, debris, drifts, talus) on its ground, walkable: [id, site x, site y]. */
  readonly props: [string, number, number][] = [];
  /** Keep the wild trees and bushes on its ground (a sacred grove). */
  wild = false;
  private occ = new Set<number>();
  private kept = new Set<number>();
  readonly k: Kit; readonly id: string; readonly x0: number; readonly y0: number; readonly w: number; readonly h: number; readonly town: number; readonly guardians: LGuard[];
  constructor(k: Kit, id: string, x0: number, y0: number, w: number, h: number, town: number, guardians: LGuard[], nodes: [string, number, number][]) {
    this.k = k; this.id = id; this.x0 = x0; this.y0 = y0; this.w = w; this.h = h; this.town = town; this.guardians = guardians;
    this.extraNodes = nodes.slice();
  }
  /** Unit point of site tile (x, y). */
  u(x: number, y: number): Pt { return this.k.unitAt(this.x0 + x, this.y0 + y); }
  /** Level site tiles x0..x1-1, y0..y1-1 to h (the land round eased to it unless `ease` is false); `pave`: a street. */
  level(x0: number, y0: number, x1: number, y1: number, h: number, pave = false, ease = true) { this.k.flatRect(this.x0 + x0, this.y0 + y0, this.x0 + x1, this.y0 + y1, h, pave, ease); }
  /** Keep the road tiles already laid inside the site clear (a road through it stays a street). */
  keepRoads() {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const i = this.k.at(this.u(x, y));
      if (i >= 0 && this.k.terrain[i] === 'road') this.keep(x, y, x + 1, y + 1);
    }
  }
  /** Height of the ground under site tile (x, y). */
  hAt(x: number, y: number) { const i = this.k.at(this.u(x, y)); return i < 0 ? 0 : this.k.height[i]; }
  /** Whether site tile (x, y) is dry open ground (no water, no rock). */
  dry(x: number, y: number) { const i = this.k.at(this.u(x, y)); return i >= 0 && !this.k.water[i] && this.k.terrain[i] !== 'rock'; }
  /** Water over site tiles (1 shallow, 2 deep), its bed at `bed`. */
  flood(x0: number, y0: number, x1: number, y1: number, depth: 1 | 2, bed = 0) { this.k.waterRect(this.x0 + x0, this.y0 + y0, this.x0 + x1, this.y0 + y1, depth, bed); }
  /** Terrain over site tiles (default road: a street; dirt: a yard). */
  pave(x0: number, y0: number, x1: number, y1: number, t = 'paving') { this.k.paintRect(this.x0 + x0, this.y0 + y0, this.x0 + x1, this.y0 + y1, t); }
  /** Footprint of a piece id. */
  fp(id: string): [number, number] {
    if (id.startsWith('@town-')) { const f = TOWN_FP.get(T(id.slice(6))); if (f) return f; }
    else if (id.startsWith('@')) { const t = LANDMARK_AT[id.slice(1)]; if (t) return [t[1], t[2]]; }
    else if (id === LABYRINTH) return [1, 1];
    else { const p = LANDMARK_PIECES.get(id); if (p) return p.footprint; }
    throw new Error(`site ${this.id}: unknown piece ${id}`);
  }
  /** The sim building a piece id is (null: a node or art only). */
  typeOf(id: string): BuildingType | null {
    if (id.startsWith('@town-')) return PRE_TYPE[T(id.slice(6))] ?? null;
    if (id.startsWith('@')) return LANDMARK_AT[id.slice(1)]?.[0] ?? null;
    if (id === LABYRINTH) return 'stoneWall';
    const p = LANDMARK_PIECES.get(id);
    return p ? LANDMARK_TYPE[p.kind] ?? null : null;
  }
  /** Whether site tiles x..x+w-1, y..y+h-1 are inside the site and free of its pieces and kept ground. */
  free(x: number, y: number, w: number, h: number) {
    if (x < 0 || y < 0 || x + w > this.w || y + h > this.h) return false;
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (this.occ.has(j * 4096 + i) || this.kept.has(j * 4096 + i)) return false;
    return true;
  }
  /** Keep site tiles x0..x1-1, y0..y1-1 clear (a street, a yard, a lair's ground): no piece lands there. */
  keep(x0: number, y0: number, x1: number, y1: number) { for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) this.kept.add(j * 4096 + i); }
  /** One piece with its NW corner on site tile (x, y); false where it would overlap another or kept ground. */
  put(id: string, x: number, y: number, o: { hp?: number; ruined?: boolean } = {}): boolean {
    const [w, h] = this.fp(id);
    if (!this.free(x, y, w, h)) return false;
    return this.add(id, x, y, w, h, o);
  }
  /** One piece on kept ground of its own (a stoa on the agora's paving): only other pieces stop it. */
  force(id: string, x: number, y: number, o: { hp?: number; ruined?: boolean } = {}): boolean {
    const [w, h] = this.fp(id);
    if (x < 0 || y < 0 || x + w > this.w || y + h > this.h) return false;
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (this.occ.has(j * 4096 + i)) return false;
    return this.add(id, x, y, w, h, o);
  }
  private add(id: string, x: number, y: number, w: number, h: number, o: { hp?: number; ruined?: boolean }) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.occ.add(j * 4096 + i);
    this.pieces.push({ id, x: this.x0 + x, y: this.y0 + y, ...(o.hp !== undefined ? { hp: o.hp } : {}), ...(o.ruined ? { ruined: true } : {}) });
    return true;
  }
  /**
   * W-51 a crag's (or a butte's) skirt: the dry ground outside the outline `p`, within a ragged `width` tiles of it,
   * turned to rock (impassable) and drawn as `steps` ledges stepping down from `hi` of the height from the foot to `top`
   * (by the edge) to `lo` (at the skirt's rim): sheer faces between narrow ledges (visual only, `vrock`, drawn at the
   * site's `lift`); streets, ramps, kept ground and pieces stay. Returns the tiles taken.
   */
  skirt(p: Pt[], top: number, width: number, o: { seed?: number; steps?: number; foot?: number; open?: Pt[]; openR?: number; lo?: number; hi?: number } = {}): Set<number> {
    const seed = o.seed ?? 9, steps = o.steps ?? 4, foot = o.foot ?? this.base, tiles = new Set<number>(), R = o.openR ?? 8, lo = o.lo ?? 0.2, hi = o.hi ?? 0.8;
    const edge = (x: number, y: number) => {
      let d = Infinity;
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        const [ax, ay] = p[j], [bx, by] = p[i], dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
        d = Math.min(d, Math.hypot(ax + dx * t - x, ay + dy * t - y));
      }
      return d;
    };
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const k = y * 4096 + x;
      if (inPoly(p, x + 0.5, y + 0.5) || this.kept.has(k) || this.occ.has(k) || !this.dry(x, y) || this.hAt(x, y) >= top) continue;
      if ((o.open ?? []).some(([ox, oy]) => Math.hypot(x + 0.5 - ox, y + 0.5 - oy) < R)) continue; // a ramp's foot opens onto the flats
      const wd = width * (0.7 + 0.45 * fbm(this.x0 + x, this.y0 + y, 9, seed)), d = edge(x + 0.5, y + 0.5);
      if (d > wd) continue;
      const lv = Math.max(0, Math.min(steps - 1, Math.floor((1 - d / wd) * steps + 0.6 * fbm(this.x0 + x, this.y0 + y, 4, seed + 1))));
      tiles.add(k);
      this.vrock.set(k, foot + (top - foot) * (lo + ((hi - lo) * lv) / Math.max(1, steps - 1)));
    }
    this.paintSet(tiles, 'rock');
    return tiles;
  }
  /** A dressing object (`<biome>/<id>`) at site point (x, y). */
  prop(id: string, x: number, y: number) { this.props.push([id, x, y]); }
  /**
   * `n` dressing objects (cycling `ids`) on dry, open site tiles where `mask` holds (no piece on them; streets too when
   * `streets`), at least `gap` tiles apart; returns how many stand.
   */
  dress(ids: string[], mask: (x: number, y: number) => boolean, n: number, seed: number, o: { gap?: number; streets?: boolean } = {}): number {
    const gap = o.gap ?? 2, at: Pt[] = [];
    for (let t = 0; t < n * 40 && at.length < n; t++) {
      const x = Math.floor(hsh(t, seed, 1) * this.w), y = Math.floor(hsh(seed, t, 2) * this.h), k = y * 4096 + x;
      if (!mask(x, y) || !this.dry(x, y) || this.occ.has(k) || (!o.streets && this.streets.has(k)) || at.some((q) => Math.abs(q[0] - x) < gap && Math.abs(q[1] - y) < gap)) continue;
      at.push([x, y]);
      this.prop(ids[at.length % ids.length], x + 0.5, y + 0.5);
    }
    return at.length;
  }
  /** Whether a piece stands on site tile (x, y). */
  taken(x: number, y: number) { return this.occ.has(y * 4096 + x); }
  /** An extra node object (a rare-good node) on site tile (x, y). */
  node(id: string, x: number, y: number) { this.extraNodes.push([id, x, y]); this.keep(x - 1, y - 1, x + 2, y + 2); }
  /**
   * A straight wall along `axis` from site tile (x, y), `len` tiles long (towers and gates included): a tower at each end
   * (unless `ends` false), towers about every `every` tiles, gates near the fractions `gates` (0..1) of its length, the
   * runs between in whole segments. `outer`: the side its face is on ('-' north or west, '+' south or east; the segments
   * flush with that side of the towers). `breach`: share of segments lying in ruins. Returns the gates' NW tiles.
   */
  line(set: WallSet, axis: 'x' | 'y', x: number, y: number, len: number, o: { every?: number; gates?: number[]; ends?: boolean; outer?: '-' | '+'; breach?: number; hp?: number; seed?: number } = {}): Pt[] {
    const ends = o.ends ?? true, every = o.every ?? 24, g = o.gates ?? [], outer = o.outer ?? '-', seed = o.seed ?? 7, hp = o.hp ?? 0.6;
    const inner = len - (ends ? 6 : 0);
    // towers so that the walls fill the rest in whole 4-tile segments (3t mod 4 runs through every residue)
    const t0 = Math.max(0, Math.round(inner / every) - 1 - g.length);
    let t = -1;
    for (const d of [0, 1, -1, 2, -2, 3, -3]) {
      const tt = t0 + d, rest = inner - 3 * tt - 6 * g.length;
      if (tt >= 0 && rest >= 0 && rest % 4 === 0) { t = tt; break; }
    }
    if (t < 0) throw new Error(`site ${this.id}: a wall of ${len} tiles cannot close`);
    const posts: { kind: 'tower' | 'gate'; at: number }[] = g.map((f) => ({ kind: 'gate' as const, at: f * inner }));
    for (let n = 0; n < t; n++) posts.push({ kind: 'tower', at: ((n + 1) / (t + 1)) * inner });
    posts.sort((a, b) => a.at - b.at);
    const segs = (inner - 3 * t - 6 * g.length) / 4, runs: number[] = [];
    let used = 0, cur = 0;
    for (const p of posts) {
      const half = p.kind === 'gate' ? 3 : 1.5, r = Math.max(0, Math.min(segs - used, Math.round((p.at - cur - half) / 4)));
      runs.push(r); used += r; cur += r * 4 + 2 * half;
    }
    runs.push(segs - used);
    const out: Pt[] = [];
    let a = 0;
    const at = (along: number, across: number): Pt => (axis === 'x' ? [x + along, y + across] : [x + across, y + along]);
    const tower = () => { const [px, py] = at(a, 0); this.put(set.tower, px, py, { hp }); a += 3; };
    const wall = () => {
      const [px, py] = at(a, outer === '-' ? 0 : 1);
      this.put(`${set.wall}-${axis}`, px, py, hsh(this.x0 + px, this.y0 + py, seed) < (o.breach ?? 0) ? { hp, ruined: true } : { hp });
      a += 4;
    };
    if (ends) tower();
    runs.forEach((r, n) => {
      for (let m = 0; m < r; m++) wall();
      const p = posts[n];
      if (!p) return;
      if (p.kind === 'tower') tower();
      else {
        const [px, py] = at(a, 0);
        this.force(`${set.gate}-${axis}`, px, py, { hp }); // a gate stands on the street it closes
        // the way through: paved under the passage and 8 tiles out either side, kept clear
        const r: [number, number, number, number] = axis === 'x' ? [px + 1, py - 8, px + 5, py + 11] : [px - 8, py + 1, px + 11, py + 5];
        this.pave(...r);
        this.keep(...r);
        out.push([px, py]);
        a += 6;
      }
    });
    if (ends) tower();
    return out;
  }
  /**
   * A rectangular wall ring round site tiles x0..x1-1, y0..y1-1 (3 deep, the towers'), gates on its sides at fractions;
   * returns each gate's passage centre (site tiles) and its side, for the roads in.
   */
  ring(set: WallSet, x0: number, y0: number, x1: number, y1: number, o: { gates?: [Side4, number][]; every?: number; breach?: number; hp?: number; seed?: number } = {}): { side: Side4; at: Pt }[] {
    const W = x1 - x0, H = y1 - y0, gs = o.gates ?? [], on = (s: Side4) => gs.filter((q) => q[0] === s).map((q) => q[1]);
    const c = { every: o.every, breach: o.breach, hp: o.hp, seed: o.seed };
    const gates: { side: Side4; at: Pt }[] = [];
    const add = (side: Side4, ps: Pt[]) => { for (const [px, py] of ps) gates.push({ side, at: side === 'N' || side === 'S' ? [px + 3, py + 1.5] : [px + 1.5, py + 3] }); };
    add('N', this.line(set, 'x', x0, y0, W, { ...c, gates: on('N'), outer: '-' }));
    add('S', this.line(set, 'x', x0, y1 - 3, W, { ...c, gates: on('S'), outer: '+' }));
    add('W', this.line(set, 'y', x0, y0 + 3, H - 6, { ...c, gates: on('W'), outer: '-', ends: false }));
    add('E', this.line(set, 'y', x1 - 3, y0 + 3, H - 6, { ...c, gates: on('E'), outer: '+', ends: false }));
    return gates;
  }
  /**
   * A street grid over site tiles x0..x1-1, y0..y1-1: streets `sw` wide every `bw` (x) and `bh` (y) tiles of block, the
   * avenues (site x of the north-south ones, y of the east-west ones) `aw` wide; paved and kept clear. Returns the blocks.
   */
  grid(x0: number, y0: number, x1: number, y1: number, o: { bw: number; bh: number; sw?: number; aw?: number; avX?: number[]; avY?: number[]; t?: string }): [number, number, number, number][] {
    const sw = o.sw ?? 2, aw = o.aw ?? 4, t = o.t ?? 'paving';
    const cuts = (a0: number, a1: number, step: number, av: number[]) => {
      const out: [number, number][] = av.map((v) => [v - aw / 2, v + aw / 2]);
      for (let v = a0 + step; v < a1 - 3; v += step + sw) if (!out.some(([p, q]) => v + sw > p - 3 && v < q + 3)) out.push([v, v + sw]);
      return out.sort((a, b) => a[0] - b[0]);
    };
    const cx = cuts(x0, x1, o.bw, o.avX ?? []), cy = cuts(y0, y1, o.bh, o.avY ?? []);
    for (const [p, q] of cx) { this.pave(p, y0, q, y1, t); this.keep(p, y0, q, y1); }
    for (const [p, q] of cy) { this.pave(x0, p, x1, q, t); this.keep(x0, p, x1, q); }
    const spans = (a0: number, a1: number, cs: [number, number][]) => {
      const out: [number, number][] = [];
      let a = a0;
      for (const [p, q] of cs) { if (p - a >= 3) out.push([a, p]); a = Math.max(a, q); }
      if (a1 - a >= 3) out.push([a, a1]);
      return out;
    };
    const blocks: [number, number, number, number][] = [];
    for (const [ya, yb] of spans(y0, y1, cy)) for (const [xa, xb] of spans(x0, x1, cx)) blocks.push([xa, ya, xb, yb]);
    return blocks;
  }
  /**
   * Fill a block (site tiles x0..x1-1, y0..y1-1) with a district's buildings: a row of lots along its north front and,
   * where it is deep enough, one along its south front (back to back in a shallow block, a yard between in a deep one),
   * each building by weight, an alley now and then. Returns how many stand on it.
   */
  block(x0: number, y0: number, x1: number, y1: number, d: District, seed = 1): number {
    const tot = d.ids.reduce((a, [, w]) => a + w, 0);
    const choose = (r: number) => { let acc = 0; for (const [id, w] of d.ids) { acc += w / tot; if (r < acc) return id; } return d.ids[d.ids.length - 1][0]; };
    let n = 0;
    const row = (south: boolean) => {
      let x = x0;
      while (x < x1) {
        const id = choose(hsh(this.x0 + x, this.y0 + y0 + (south ? 7 : 0), seed)), [w, h] = this.fp(id), py = south ? y1 - h : y0;
        if (x + w > x1 || py < y0 || (south && py < y0 + 3)) { x++; continue; }
        const r = (k: number) => hsh(this.x0 + x, this.y0 + py, seed + k);
        if (r(4) < (d.empty ?? 0)) { x += w + 1; continue; } // an empty lot: fallen in long ago, a garden
        if (this.put(id, x, py, { hp: Math.round((d.hp[0] + (d.hp[1] - d.hp[0]) * r(2)) * 100) / 100, ruined: r(1) < d.ruin })) {
          n++;
          x += w + (r(3) < (d.alley ?? 0.15) ? 1 : 0);
        } else x++;
      }
    };
    row(false);
    if (y1 - y0 >= 6) row(true);
    return n;
  }

  // ---- W-48/W-49 organic city kit: streets that follow the ground, lots packed along them, walls tracing an outline
  /** Street tiles (paved and kept), for frontage: lots are packed against them. */
  readonly streets = new Set<number>();
  private tilesOf(f: (x: number, y: number) => boolean): Set<number> {
    const out = new Set<number>();
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (f(x, y)) out.add(y * 4096 + x);
    return out;
  }
  /** Terrain over a set of site tiles (keys y * 4096 + x), one pass over the map ('paving': flagstones). */
  paintSet(tiles: Set<number>, t: string) {
    if (tiles.size) this.k.maskPaint((tx, ty) => (tiles.has((ty - this.y0) * 4096 + tx - this.x0) ? t : undefined));
  }
  /** Level per site tile (undefined: leave), cliffs at its edges. */
  levelBy(f: (x: number, y: number) => number | undefined) {
    this.k.maskLevel((tx, ty) => (tx < this.x0 || ty < this.y0 || tx >= this.x0 + this.w || ty >= this.y0 + this.h ? undefined : f(tx - this.x0, ty - this.y0)));
  }
  /** Tiles within w/2 of a curve's samples. */
  private band(c: Sample[], w: number): Set<number> {
    const r = w / 2, R = Math.ceil(r), tiles = new Set<number>();
    for (const p of c) for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const x = Math.floor(p.x + dx), y = Math.floor(p.y + dy);
      if (x < 0 || y < 0 || x >= this.w || y >= this.h || (x + 0.5 - p.x) ** 2 + (y + 0.5 - p.y) ** 2 > r * r) continue;
      tiles.add(y * 4096 + x);
    }
    return tiles;
  }
  private claimStreet(tiles: Set<number>, t: string) {
    for (const k of tiles) if (this.occ.has(k)) tiles.delete(k); // a street goes round what already stands
    this.paintSet(tiles, t);
    for (const k of tiles) { this.kept.add(k); this.streets.add(k); }
  }
  /** A street along a curve through site tiles `pts` (Catmull-Rom), `w` tiles wide: paved (flagstones) and kept clear. */
  street(pts: Pt[], w: number, t = 'paving'): Sample[] {
    const c = spline(pts, 0.5);
    this.claimStreet(this.band(c, w), t);
    return c;
  }
  /** A plaza: an ellipse of paving (kept clear), centre (x, y), radii rx, ry. */
  plaza(x: number, y: number, rx: number, ry: number, t = 'paving') {
    this.claimStreet(this.tilesOf((i, j) => ((i + 0.5 - x) / rx) ** 2 + ((j + 0.5 - y) / ry) ** 2 <= 1), t);
  }
  /**
   * A ramp from pts[0] along the curve `pts` (site tiles), `w` wide: level h0 for `flat` tiles, then a level lower every
   * `run` tiles down to h1; paved, kept. Returns its foot (site tiles).
   */
  ramp(pts: Pt[], w: number, h0: number, h1: number, o: { run?: number; flat?: number; t?: string } = {}): Pt {
    const run = o.run ?? 5, flat = o.flat ?? 0, c = spline(pts, 0.5), r = w / 2, R = Math.ceil(r), lv = new Map<number, number>();
    for (const p of c) {
      const h = Math.max(h1, h0 - Math.max(0, Math.ceil((p.s - flat) / run)));
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const x = Math.floor(p.x + dx), y = Math.floor(p.y + dy), k = y * 4096 + x;
        if (x < 0 || y < 0 || x >= this.w || y >= this.h || (x + 0.5 - p.x) ** 2 + (y + 0.5 - p.y) ** 2 > r * r) continue;
        lv.set(k, Math.max(lv.get(k) ?? -1, h));
        this.vz.set(k, Math.max(this.vz.get(k) ?? -1, Math.max(h1, h0 - Math.max(0, (p.s - flat) / run))));
      }
    }
    this.levelBy((x, y) => lv.get(y * 4096 + x));
    this.claimStreet(new Set(lv.keys()), o.t ?? 'paving');
    const e = c[c.length - 1];
    return [e.x, e.y];
  }
  /**
   * Pack a district's buildings into the free ground where `mask` holds, every lot fronting a street (its footprint
   * within `front` tiles of one); a second pass to `back` fills the backs of the blocks. Empty lots stay as yards, now
   * and then a `garden`; `alley`: chance of a kept 1-tile gap beside a building. Returns how many stand.
   */
  infill(mask: (x: number, y: number) => boolean, d: District, o: { seed?: number; front?: number; back?: number; garden?: string } = {}): number {
    const seed = o.seed ?? 1, W = this.w, H = this.h, dist = new Int16Array(W * H).fill(-1), q: number[] = [];
    for (const k of this.streets) { const x = k % 4096, y = Math.floor(k / 4096); if (x < W && y < H) { dist[y * W + x] = 0; q.push(y * W + x); } }
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % W, y = Math.floor(i / W);
      if (dist[i] >= 12) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, j = ny * W + nx;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || dist[j] >= 0) continue;
        dist[j] = dist[i] + 1;
        q.push(j);
      }
    }
    const tot = d.ids.reduce((a, [, w]) => a + w, 0);
    const choose = (r: number) => { let acc = 0; for (const [id, w] of d.ids) { acc += w / tot; if (r < acc) return id; } return d.ids[d.ids.length - 1][0]; };
    let n = 0;
    const pass = (lim: number) => {
      const cand: number[] = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = dist[y * W + x]; if (v >= 1 && v <= lim && mask(x, y)) cand.push(y * W + x); }
      cand.sort((a, b) => dist[a] - dist[b] || hsh(a, seed, 5) - hsh(b, seed, 5));
      for (const i of cand) {
        const x = i % W, y = Math.floor(i / W), r = (k: number) => hsh(this.x0 + x, this.y0 + y, seed + k);
        const id = choose(r(0)), [w, h] = this.fp(id);
        if (!this.free(x, y, w, h)) continue;
        let near = 99, ok = true;
        const h0 = this.hAt(x, y);
        for (let j = y; j < y + h && ok; j++) for (let k = x; k < x + w && ok; k++) {
          if (!mask(k, j) || !this.dry(k, j) || this.hAt(k, j) !== h0) ok = false;
          const v = dist[j * W + k];
          if (v >= 0) near = Math.min(near, v);
        }
        if (!ok || near > lim) continue;
        if (r(4) < (d.empty ?? 0)) { // an empty lot: a yard, now and then a garden
          if (!(o.garden && r(6) < 0.4 && this.put(o.garden, x, y, { hp: d.hp[1] }))) this.keep(x, y, x + w, y + h);
          continue;
        }
        if (this.put(id, x, y, { hp: Math.round((d.hp[0] + (d.hp[1] - d.hp[0]) * r(2)) * 100) / 100, ruined: r(1) < d.ruin })) {
          n++;
          if (r(3) < (d.alley ?? 0.15)) this.keep(x + w, y, x + w + 1, y + h);
        }
      }
    };
    pass(o.front ?? 1);
    if (o.back) pass(o.back);
    return n;
  }
  /**
   * A wall tracing the closed outline `pts` (site tiles, a smooth ring, resampled every `step` tiles): an orthogonal
   * staircase on a 4-tile lattice (legs >= 12 tiles, corners on the inner side, so the wall stays inside the outline),
   * a tower on every corner and about every `every` tiles, a gate on the leg nearest each point of `gates`. Returns the
   * gates as ring does, and the corners.
   */
  wallTrace(set: WallSet, pts: Pt[], o: { step?: number; gates?: Pt[]; every?: number; breach?: number; hp?: number; seed?: number } = {}): { gates: { side: Side4; at: Pt }[]; corners: Pt[] } {
    const step = o.step ?? 20, L = 4, cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const snap = (v: number) => Math.round(v / L) * L;
    const all = spline([...pts, pts[0]], 1), ring = all.filter((p, i) => i === 0 || Math.floor(p.s / step) !== Math.floor(all[i - 1].s / step));
    let v: Pt[] = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const c1: Pt = [b.x, a.y], c2: Pt = [a.x, b.y], c = Math.hypot(c1[0] - cx, c1[1] - cy) < Math.hypot(c2[0] - cx, c2[1] - cy) ? c1 : c2;
      v.push([snap(a.x), snap(a.y)], [snap(c[0]), snap(c[1])]);
    }
    const clean = (u: Pt[]) => {
      const out = u.filter((p, i) => { const q = u[(i + u.length - 1) % u.length]; return p[0] !== q[0] || p[1] !== q[1]; });
      for (let changed = true; changed && out.length > 4;) {
        changed = false;
        for (let i = 0; i < out.length; i++) {
          const p = out[(i + out.length - 1) % out.length], c = out[i], nx = out[(i + 1) % out.length];
          if ((p[0] === c[0] && c[0] === nx[0]) || (p[1] === c[1] && c[1] === nx[1]) || (c[0] === nx[0] && c[1] === nx[1])) { out.splice(i, 1); changed = true; break; }
        }
      }
      return out;
    };
    v = clean(v);
    // a diagonal pair (both coordinates differ) gets a corner; legs shorter than 12: fold away
    for (let guard = 0; guard < 600; guard++) {
      let fixed = false;
      for (let i = 0; i < v.length; i++) {
        const a = v[i], b = v[(i + 1) % v.length];
        if (a[0] !== b[0] && a[1] !== b[1]) { v.splice(i + 1, 0, [b[0], a[1]]); v = clean(v); fixed = true; break; }
        if (v.length <= 4) continue;
        const len = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
        if (len >= 12) continue;
        const c = v[(i + 2) % v.length];
        if (a[0] === b[0]) c[0] = a[0]; else c[1] = a[1]; // b's successor moves onto a's line, b goes
        v.splice((i + 1) % v.length, 1);
        v = clean(v);
        fixed = true;
        break;
      }
      if (!fixed) break;
    }
    const inside = (x: number, y: number) => inPoly(v, x, y);
    const gates: { side: Side4; at: Pt }[] = [], c = { every: o.every ?? 24, breach: o.breach, hp: o.hp, seed: o.seed, ends: false };
    const want = (o.gates ?? []).map((g) => {
      let best = -1, bd = Infinity;
      v.forEach((a, i) => {
        const b = v[(i + 1) % v.length], len = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
        if (len < 16) return;
        const t = Math.max(0.3, Math.min(0.7, a[0] === b[0] ? (g[1] - a[1]) / (b[1] - a[1]) : (g[0] - a[0]) / (b[0] - a[0])));
        const dd = Math.hypot(a[0] + (b[0] - a[0]) * t - g[0], a[1] + (b[1] - a[1]) * t - g[1]);
        if (dd < bd) (bd = dd), (best = i);
      });
      return best;
    });
    // tune each leg by a tile or two so its run closes with the towers it wants (about one every `every` tiles)
    for (let i = 0; i < v.length; i++) {
      const n = v.length, a = v[i], b = v[(i + 1) % n], nx = v[(i + 2) % n], ax = a[1] === b[1] ? 0 : 1;
      if ((i + 1) % n === 0 || (i + 2) % n === 0) continue;
      const run = Math.abs(b[ax] - a[ax]) - 3, g = want.includes(i) ? 1 : 0, sg = Math.sign(b[ax] - a[ax]);
      for (const d of [0, 1, -1, 2, -2, 3]) {
        const r = run + d, t = Math.max(0, Math.round(r / c.every) - 1 - g), rest = r - 6 * g - 3 * t;
        if (r < 9 || rest < 0 || rest % 4) continue;
        b[ax] += sg * d; nx[ax] += sg * d;
        break;
      }
    }
    for (const p of v) this.put(set.tower, p[0], p[1], { hp: o.hp ?? 0.6 });
    v.forEach((a, i) => {
      const b = v[(i + 1) % v.length], gi = want.indexOf(i), g = gi >= 0 ? o.gates![gi] : undefined;
      if (a[1] === b[1]) {
        const x0 = Math.min(a[0], b[0]) + 3, len = Math.abs(b[0] - a[0]) - 3, outer = inside(x0 + len / 2, a[1] - 0.5) ? '+' : '-';
        const at = this.line(set, 'x', x0, a[1], len, { ...c, outer, gates: g ? [Math.max(0.2, Math.min(0.8, (g[0] - x0) / len))] : [] });
        for (const [px, py] of at) gates.push({ side: outer === '-' ? 'N' : 'S', at: [px + 3, py + 1.5] });
      } else {
        const y0 = Math.min(a[1], b[1]) + 3, len = Math.abs(b[1] - a[1]) - 3, outer = inside(a[0] - 0.5, y0 + len / 2) ? '+' : '-';
        const at = this.line(set, 'y', a[0], y0, len, { ...c, outer, gates: g ? [Math.max(0.2, Math.min(0.8, (g[1] - y0) / len))] : [] });
        for (const [px, py] of at) gates.push({ side: outer === '-' ? 'W' : 'E', at: [px + 1.5, py + 3] });
      }
    });
    return { gates, corners: v };
  }
}
/** Whether (x, y) lies inside polygon `p` (even-odd). */
export function inPoly(p: Pt[], x: number, y: number) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > y) !== (p[j][1] > y) && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
  return c;
}
/** A landmark guardian's posts in its site's tiles (from the NW corner); heads 'shore': six on the land by the water nearest its post. */
interface LGuard { boss: string; at: Pt; perches?: Pt[]; pit?: Pt; postern?: Pt; flats?: Pt | 'water'; heads?: 'shore' | Pt[] }
const LABYRINTH = 'navel-labyrinth';
/** The landmark art (ART-L): its pieces (footprint, kind, hp). */
const LANDMARK_JSON = JSON.parse(readFileSync(fileURLToPath(new URL('../../../public/war/landmarks/landmarks.json', import.meta.url)), 'utf8')) as {
  pieces: { id: string; kind: string; footprint: [number, number]; hp: number; axis?: 'x' | 'y' }[];
};
const LANDMARK_PIECES = new Map(LANDMARK_JSON.pieces.map((p) => [p.id, p]));
/** The sim building each landmark piece kind is (docs/WAR.md "Landmarks"); node pieces are rare-good nodes (src/data/warLandmarks.ts RARE_NODES). */
const LANDMARK_TYPE: Record<string, BuildingType | null> = {
  keep: 'fort', wall: 'stoneWall', tower: 'stoneTower', gate: 'stoneGate', house: 'house', temple: 'temple', shrine: 'shrine', well: 'well',
  jetty: 'jetty', arena: 'barracks', statue: 'statue', forge: 'forge3', workshop: 'workshop', kiln: 'pitchKiln', stair: 'stoneStairs', ford: null, node: null,
  // W-48 architecture: halls and stables quarter men, a cistern is a well, a chapel or a theatre a shrine, a treasury a store, a tomb a statue (honours)
  barracks: 'barracks', stable: 'barracks', forge2: 'forge2', cistern: 'well', chapel: 'shrine', theatre: 'shrine', treasury: 'warehouse', tomb: 'statue',
  // W-51 the dense blocks of the quarters: storerooms (a store each), not homes, so the recruit pools hold
  block: 'storehouse',
};
const LANDMARK_NODE: Record<string, string> = { 'citadel-bone-pit': 'landmark/bone-pit', 'titan-slag': 'landmark/slag-heap', 'obsidian-field': 'landmark/glass-field' };
/** Build-mode and town pieces in a layout (`@id`): their sim type and footprint. */
const LANDMARK_AT: Record<string, [BuildingType, number, number] | null> = {
  barracks: ['barracks', 4, 3], forge2: ['forge2', 3, 3], well: ['well', 1, 1], 'stone-gate-x': ['stoneGate', 2, 1], 'stone-tower-round': ['stoneTower', 2, 2],
  stoa: ['stoa', 2, 6], jetty: ['jetty', 1, 4], oak: null,
};
/** Town structure ids: the elaia library's town set. */
const T = (id: string) => `elaia/town-${id}`;
type TownReq =
  | { kind: 'at'; id: string; t: Pt; slot: boolean; town: number; court: boolean }
  | { kind: 'near'; ids: string[]; at: Pt; n: number; r0: number; r1: number; gap: number; street: number; water: boolean; town: number };
/** Footprints of the town set (public/war/biomes/elaia/objects.json town-*), and the ones that never block. */
const TOWN_FP: Map<string, [number, number]> = new Map(
  (JSON.parse(readFileSync(fileURLToPath(new URL('../../../public/war/biomes/elaia/objects.json', import.meta.url)), 'utf8')) as { objects: { id: string; footprint: [number, number]; town?: boolean }[] }).objects
    .filter((d) => d.town).map((d) => [`elaia/${d.id}`, d.footprint]),
);
/** Pieces the street layout lets stand against a road (the rest keep a tile clear round them). */
const TOWN_OPEN = new Set(['gate-x', 'gate-y', 'farm', 'jetty', 'goods'].map(T));
/** The sim building each town piece is (docs/WAR.md "Pre-built structures"); footprints as the art's (gate-y, wall-y: rot 1). */
const PRE_TYPE: Record<string, BuildingType> = Object.fromEntries(Object.entries({
  'house-a': 'house', 'house-b': 'house', cottage: 'cottage', temple: 'temple', stoa: 'stoa', statue: 'statue', well: 'well', jetty: 'jetty',
  'stall-a': 'stall', 'stall-b': 'stall', 'stall-c': 'stall', warehouse: 'warehouse', workshop: 'workshop', storehouse: 'storehouse',
  forge: 'forge', cookhouse: 'cookhouse', 'olive-press': 'olivePress', farm: 'farm', tower: 'stoneTower',
  'wall-x': 'stoneWall', 'wall-y': 'stoneWall', 'gate-x': 'stoneGate', 'gate-y': 'stoneGate', board: 'board', goods: 'cache',
} satisfies Record<string, BuildingType>).map(([id, t]) => [T(id), t]));
/**
 * A town's condition by its region (docs/WAR.md "Region lore and depth"): share of its houses, workshops and stalls
 * lying in ruins and the hp share range of the rest. By depth (homes and entries whole, the deep regions abandoned),
 * and by the lore where it says more: Stymphalia's causeway town emptied, Achelous's island town fallen to the
 * ferrymen, the salt-cutters' huts of the Lagoon Coast emptied, the Kimmerians swallowed by the mist.
 */
const CONDITION_BY_DEPTH: { ruin: number; hp: [number, number] }[] = [
  { ruin: 0, hp: [1, 1] }, { ruin: 0, hp: [1, 1] }, { ruin: 0.1, hp: [0.75, 1] }, { ruin: 0.35, hp: [0.45, 0.8] }, { ruin: 0.5, hp: [0.3, 0.7] },
];
const CONDITION: Record<string, { ruin: number; hp: [number, number] }> = {
  stymphalia: { ruin: 0.35, hp: [0.5, 0.9] }, achelous: { ruin: 0.2, hp: [0.55, 0.9] }, 'kyrene-e': { ruin: 0.5, hp: [0.5, 0.8] }, kimmeria: { ruin: 0.55, hp: [0.35, 0.7] },
};
/** Pieces that may lie in ruins (a town keeps its temple, well, stalls, board and cache; its share of houses stays under TOWN_RUIN). */
const MAY_RUIN = new Set<BuildingType>(['house', 'cottage', 'tent', 'workshop', 'storehouse', 'forge', 'cookhouse', 'olivePress', 'farm', 'statue', 'warehouse']);
const PREBUILT_POP = new Set<BuildingType>(['house', 'cottage', 'tent']);

// ======================================================================================= the build

interface Out { kind: Uint8Array; z: Uint8Array }

/** Biome libraries with a paving set (scripts/war/art/biomes/*.mjs grass- or sand-paving); elsewhere paved streets draw as roads. */
const PAVED = new Set<string>(['kyrene', 'elaia', 'mountains']);
/** The visual layer of a fine (1 m) run. */
function visualLayer(k: Kit): Out {
  const { W, H, N, height, terrain, water, biome, bDepth, rock, roadDist, style } = k;
  const SLOPE = 6, STEP = 3, PEAK_LO = 18, SNOW_Z = 33;
  const ridged = (x: number, y: number, scale: number, seed: number) => 1 - Math.abs(noise(x / scale, y / scale, seed));
  const kind = new Uint8Array(N), zv = new Uint8Array(N);
  // W-48 landmark relief: a site's levels drawn `lift` times as tall above its base (cliffs, terraces and retaining
  // walls read as metres, not steps; the sim keeps its levels), ramps by their smooth slope (Site.vz)
  const lifted = k.sites.filter((s) => s.lift > 1), crag = new Uint8Array(N);
  k.each((i, x, y) => {
    let z = height[i];
    if (lifted.length && terrain[i] === 'rock' && !water[i]) {
      // a crag's skirt: its ledges (Site.skirt), each cell jittered so the face breaks into crags
      const tx = k.tileOfUnit(x), ty = k.tileOfUnit(y);
      for (const s of lifted) {
        const v = tx < s.x0 || ty < s.y0 || tx >= s.x0 + s.w || ty >= s.y0 + s.h ? undefined : s.vrock.get((ty - s.y0) * 4096 + tx - s.x0);
        if (v !== undefined) { z = Math.max(height[i], Math.min(ZVIS, Math.round(s.vis(v)))); crag[i] = 1; }
      }
    } else if (lifted.length && terrain[i] !== 'rock' && !water[i]) {
      const tx = k.tileOfUnit(x), ty = k.tileOfUnit(y);
      for (const s of lifted) {
        if (tx < s.x0 || ty < s.y0 || tx >= s.x0 + s.w || ty >= s.y0 + s.h || height[i] <= s.base) continue;
        if (s.liftOnly && !s.liftOnly(tx - s.x0, ty - s.y0)) continue;
        const hv = s.vz.get((ty - s.y0) * 4096 + tx - s.x0) ?? height[i];
        z = Math.min(ZVIS, Math.round(s.vis(hv)));
      }
    }
    if (terrain[i] === 'rock' && rock[i] > -Infinity && !crag[i]) {
      const e = rock[i] + 1.2 * fbm(x, y, 5, 41);
      const peak = PEAK_LO + (ZVIS - PEAK_LO) * (0.65 * ridged(x, y, 11, 43) + 0.35 * ridged(x, y, 5, 44)) ** 1.6;
      z = e < 0.6 ? 3 : 3 + STEP * Math.floor(Math.min(SLOPE * (e - 0.6), peak - 3) / STEP);
    }
    zv[i] = z;
  });
  // keep the roads in sight: rock in front of a road (toward the viewer, +x +y) rises at most half a level per cell
  const lim = new Float32Array(N).fill(Infinity);
  for (let v = 0; v < W + H - 1; v++) for (let x = Math.max(0, v - H + 1); x <= Math.min(W - 1, v); x++) {
    const y = v - x, i = y * W + x;
    let l = terrain[i] === 'road' ? zv[i] : Infinity;
    if (x > 0) l = Math.min(l, lim[i - 1] + 0.5);
    if (y > 0) l = Math.min(l, lim[i - W] + 0.5);
    lim[i] = l;
    if (terrain[i] === 'rock' && !crag[i] && zv[i] > l) zv[i] = Math.max(3, 3 + STEP * Math.floor((l - 3) / STEP));
  }
  const inBlob = (x: number, y: number, b: Blob, seed: number) => blob(x, y, b[0], b[1], b[2], b[3], b[4] ?? 0, 1.2, seed) > 0;
  const sandAll = (i: number) => {
    const tx = i % W, ty = Math.floor(i / W), r = 2 * (k.K / 2);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = tx + dx, y = ty + dy;
      if (x >= 0 && y >= 0 && x < W && y < H && terrain[y * W + x] !== 'sand' && terrain[y * W + x] !== 'road') return false;
    }
    return true;
  };
  k.each((i, x, y) => {
    const t0 = water[i] === 2 ? 'deep' : water[i] === 1 ? 'shallow' : terrain[i] === 'rock' && zv[i] >= SNOW_Z ? 'snow' : terrain[i];
    let out = t0 as Kind;
    const b = BIOMES[biome[i]];
    if (b !== 'global' && b !== 'dodona' && bDepth[i] >= 2 && !water[i]) {
      const p = k.patches.find((q) => q.biome === b && q.on.includes(t0) && (q.maxH === undefined || height[i] <= q.maxH) && (q.minH === undefined || height[i] >= q.minH) && inBlob(x, y, q.b, q.seed));
      if (p) out = p.kind;
      else if (b === 'mountains') {
        if (t0 === 'grass' || t0 === 'forest' || t0 === 'dirt') {
          if (rock[i] > -(0.5 + 0.5 * (fbm(x, y, 4, 71) + 1))) out = 'scree';
          else if (t0 === 'grass') out = roadDist[i] < 2.8 && fbm(x, y, 3, 72) > -0.1 ? 'gravel' : fbm(x, y, 7, 73) > style.meadow ? 'meadow' : out;
        }
      } else if (b === 'kyrene') {
        const pool = Math.min(...k.oases.map((o) => Math.hypot(x - o[0], y - o[1]) + 1.5 * fbm(x, y, 3, 74)), Infinity);
        if ((t0 === 'sand' || t0 === 'grass') && pool < 5) out = 'oasis';
        else if (t0 === 'sand' && sandAll(i)) out = height[i] >= 2 || fbm(x, y, 5, 78) > style.dune ? 'dune' : fbm(x, y, 6, 79) > 0.35 ? 'reg' : 'sand';
      } else if (b === 'elaia' && t0 === 'grass') {
        if ((style.dryHigh && height[i] >= 2) || fbm(x, y, 7, 86) > style.dry) out = 'dry';
      }
    }
    kind[i] = KINDS.indexOf(k.paved[i] && t0 === 'road' && PAVED.has(BIOMES[biome[i]]) ? 'paving' : out);
    // W-51 landmark looks: a crag's skirt in its kinds, a site's own ground and paving
    if (k.sites.length && !water[i]) {
      const tx = k.tileOfUnit(x), ty = k.tileOfUnit(y);
      for (const s of k.sites) {
        if (tx < s.x0 || ty < s.y0 || tx >= s.x0 + s.w || ty >= s.y0 + s.h) continue;
        const sx = tx - s.x0, sy = ty - s.y0;
        if (terrain[i] === 'rock' && s.vrock.has(sy * 4096 + sx)) kind[i] = KINDS.indexOf(fbm(x, y, 2.5, 53) > s.skirtKinds.cut ? s.skirtKinds.a : s.skirtKinds.b);
        else if (s.look && terrain[i] !== 'rock' && s.look.inside(sx, sy)) kind[i] = KINDS.indexOf(terrain[i] === 'road' ? s.look.pave : s.look.rough && s.roughAt(sx, sy) ? s.look.rough : s.look.ground);
      }
    }
  });
  return { kind, z: zv };
}

/** The finished region (sim size) and its stats. */
export interface Built { json: Record<string, unknown>; spots: Record<string, Pt>; claims: { x: number; y: number }[]; log: string[]; checks: Check[]; bytes: number }

export function build(def: RegionDef): Built {
  // ---- the fine run: visual layer
  const fk = new Kit(def, 4);
  def.build(fk);
  autoZones(fk);
  const fine = visualLayer(fk);
  // ---- the sim run
  const k = new Kit(def, 2);
  def.build(k);
  autoZones(k);
  const { W, H, N, height, terrain, water, biome, K } = k;
  const FW = 2 * W, FH = 2 * H;
  const log: string[] = [];
  // a biome terrain stays only where every tile round its cell is of that biome
  {
    const OWN: Record<string, string[]> = { mountains: ['scree', 'meadow', 'gravel', 'drift'], elaia: ['dry', 'rossa', 'marble', 'grove', 'ruin'], kyrene: ['dune', 'hardpan', 'redrock', 'reg', 'salt', 'oasis', 'rubble'] };
    const ownerOf = new Map(Object.entries(OWN).flatMap(([b, ks]) => ks.map((kk) => [KINDS.indexOf(kk as Kind), BIOMES.indexOf(b as BiomeName)])));
    for (let fy = 0; fy < FH; fy++) for (let fx = 0; fx < FW; fx++) {
      const j = fy * FW + fx, b = ownerOf.get(fine.kind[j]);
      if (b === undefined) continue;
      const tx = fx >> 1, ty = fy >> 1;
      let ok = true;
      for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1 && ok; dx++) {
        const x = tx + dx, y = ty + dy;
        if (x >= 0 && y >= 0 && x < W && y < H && biome[y * W + x] !== b) ok = false;
      }
      if (!ok) fine.kind[j] = KINDS.indexOf(terrain[ty * W + tx] as Kind);
    }
  }
  const fAt = (fx: number, fy: number) => (fx < 0 || fy < 0 || fx >= FW || fy >= FH ? -1 : fy * FW + fx);
  const fzAt = (fx: number, fy: number) => { const j = fAt(fx, fy); return j < 0 ? 0 : fine.z[j]; };
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : y * W + x);
  const ring = (x: number, y: number, f: (j: number) => boolean) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const j = at(x + dx, y + dy); if (j >= 0 && (dx || dy) && f(j)) return true; }
    return false;
  };
  const tileOf = (p: Pt): Pt => [k.toTile(p[0]), k.toTile(p[1])];
  const spotTiles = new Set(Object.values(k.spots).map((p) => at(Math.floor(k.toTile(p[0]) + 0.5), Math.floor(k.toTile(p[1]) + 0.5))));
  const spotNear = (x: number, y: number, r: number) => Object.values(k.spots).some((p) => Math.hypot(k.toTile(p[0]) + 0.5 - x, k.toTile(p[1]) + 0.5 - y) < r);
  const B = (i: number) => BIOMES[biome[i]];

  // ---- entries and no-build bands
  const entries = k.sides.map((s) => {
    const c = Math.round(s.along * U * K), e = ENTRY * K, d = DEPTH * K, x0 = Math.max(0, Math.min(W - e, c - e / 2));
    const y0 = Math.max(0, Math.min(H - e, c - e / 2));
    return s.side === 'N' ? { side: s.side, x: x0, y: 0, w: e, h: d } : s.side === 'S' ? { side: s.side, x: x0, y: H - d, w: e, h: d }
      : s.side === 'W' ? { side: s.side, x: 0, y: y0, w: d, h: e } : { side: s.side, x: W - d, y: y0, w: d, h: e };
  });
  const noBuild: { x: number; y: number; w: number; h: number }[] = entries.map((e) =>
    e.side === 'N' ? { x: e.x, y: 0, w: e.w, h: BAND * K } : e.side === 'S' ? { x: e.x, y: H - BAND * K, w: e.w, h: BAND * K }
    : e.side === 'W' ? { x: 0, y: e.y, w: BAND * K, h: e.h } : { x: W - BAND * K, y: e.y, w: BAND * K, h: e.h });
  if (k.world.role === 'entry') {
    // W-03: no wall across the through roads: a corridor of 16-tile cells along every road, merged into row runs
    const C = 16;
    for (let cy = 0; cy < H / C; cy++) {
      let run = -1;
      for (let cx = 0; cx <= W / C; cx++) {
        let hit = false;
        if (cx < W / C) for (let y = cy * C; y < cy * C + C && !hit; y += 4) for (let x = cx * C; x < cx * C + C && !hit; x += 4) if (k.roadDist[y * W + x] <= CORRIDOR) hit = true;
        if (hit && run < 0) run = cx;
        if (!hit && run >= 0) { noBuild.push({ x: run * C, y: cy * C, w: (cx - run) * C, h: C }); run = -1; }
      }
    }
  }

  // ---- scattered objects by biome and terrain (as test-ridge)
  const objects: { id: string; x: number; y: number; shade?: number }[] = [];
  const put = (id: string, x: number, y: number) => objects.push({ id, x: r1(x * 10) / 10, y: r1(y * 10) / 10 });
  const cellOf = (x: number, y: number) => fAt(Math.floor(2 * x), Math.floor(2 * y));
  const kindAt = (x: number, y: number) => KINDS[fine.kind[cellOf(x, y)]];
  const footSeen = (x: number, y: number) => {
    const fx = Math.floor(2 * x), fy = Math.floor(2 * y), z = fzAt(fx, fy);
    for (let d = 1; d <= ZVIS; d++) for (let j = -1; j <= 1; j++) if (fzAt(fx + d + Math.max(0, j), fy + d + Math.max(0, -j)) - z > d + Math.abs(j) / 2 - 0.5) return false;
    return true;
  };
  const st = k.style;
  const FIRS = M(['fir', 'fir', 'black-pine', 'fir-snow', 'fir', 'black-pine']), ALPINE = M(['juniper', 'rhododendron', 'alpine-grass', 'alpine-grass']);
  const OLIVES = E(['olive-ancient', 'olive-orchard', 'olive-tall', 'olive-orchard']), MAQUIS = E(['maquis-a', 'maquis-b', 'maquis-c', 'herbs', 'herbs']);
  const PALMS = Y(['date-palm-tall', 'date-palm-mid', 'date-palm-fruit', 'doum-palm', 'date-palm-young', 'date-palm-clump', 'tamarisk']);
  const WOODS = ['pine-a', 'pine-b', 'pine-a', 'oak', 'stone-pine', 'pine-b', 'oak'], NORTH = ['pine-a', 'pine-b', 'oak', 'mountains/fir', 'oak', 'pine-a', 'mountains/black-pine', 'oak'];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, t = terrain[i], b = B(i);
    if (water[i] || t === 'road' || spotTiles.has(i)) continue;
    const p = hsh(x, y, 1), q = hsh(x, y, 2), fx = x + 0.3 + 0.4 * hsh(x, y, 3), fy = y + 0.3 + 0.4 * hsh(x, y, 4);
    const nearWater = ring(x, y, (j) => water[j] > 0), kk = kindAt(fx, fy);
    if (t === 'forest') {
      const edge = ring(x, y, (j) => terrain[j] !== 'forest');
      const trees = b === 'mountains' ? FIRS : b === 'elaia' ? E(['holm-oak', 'stone-pine', 'holm-oak', 'cypress-tall', 'olive-tall']) : b === 'kyrene' ? Y(['acacia', 'acacia-old', 'tamarisk', 'thorn-tree']) : b === 'dodona' ? NORTH : WOODS;
      if (p < (edge ? 0.16 : 0.3) * Math.min(1, st.trees)) put(pick(trees, q), fx, fy);
      else if (p < 0.34) put(pick(b === 'elaia' ? MAQUIS : b === 'mountains' ? ALPINE : b === 'kyrene' ? Y(['saltbush', 'broom']) : ['bush-a', 'bush-b'], q), fx, fy);
    } else if (t === 'marsh') {
      if (p < 0.2) put(pick(b === 'kyrene' ? Y(['reeds', 'reeds', 'saltbush']) : ['reeds', 'reeds', 'reeds', 'bush-b'], q), fx, fy);
      else if (p < 0.212) put('dead-tree', fx, fy);
    } else if (t === 'rock') {
      if (p < 0.12 && ring(x, y, (j) => terrain[j] !== 'rock' && !water[j])) put(pick(b === 'kyrene' ? ['kyrene/boulder-red', 'kyrene/rocks-red'] : ['boulder-a', 'boulder-b'], q), fx, fy);
    } else if (b === 'mountains') {
      const near = k.rock[i] > -5;
      if (t === 'dirt') continue; // courts, ledges, clefts stay bare
      if (kk === 'scree') { if (p < 0.05) put(pick(M(['juniper', 'alpine-grass', 'juniper', 'fir-snow']), q), fx, fy); }
      else if (kk === 'gravel') { if (p < 0.01) put(pick(ALPINE, q), fx, fy); }
      else if (!nearWater && p < (near ? 0.16 : 0.035) * st.trees) put(pick(FIRS, q), fx, fy);
      else if (!nearWater && p < (near ? 0.2 : 0.07) * st.bushes) put(pick(ALPINE, q), fx, fy);
    } else if (b === 'elaia') {
      if (kk === 'dry' && !nearWater) {
        if (p < 0.022 * st.trees) put(pick(OLIVES, q), fx, fy);
        else if (p < 0.06 * st.bushes) put(pick(MAQUIS, q), fx, fy);
        else if (p < 0.066 * st.trees) put(pick(E(['cypress-tall', 'cypress-flame', 'stone-pine']), q), fx, fy);
      } else if (kk === 'grass' && !nearWater && p < 0.012 * st.trees) put(pick(E(['cypress-tall', 'cypress-flame', 'stone-pine', 'holm-oak', 'maquis-a', 'olive-tall']), q), fx, fy);
      else if (t === 'dirt' && p < 0.004) put('elaia/herbs', fx, fy);
    } else if (b === 'kyrene') {
      const oasisD = Math.min(Infinity, ...k.oases.map((o) => Math.hypot(k.toUnit(x) - o[0], k.toUnit(y) - o[1])));
      if (kk === 'oasis') {
        if (nearWater && p < 0.6) put('kyrene/reeds', fx, fy);
        else if (oasisD > 2.6 && (x + 2 * y) % 4 === 0 && p < 0.6) put(pick(PALMS, q), fx, fy);
        else if (p < 0.1) put(pick(Y(['saltbush', 'reeds', 'dry-grass']), q), fx, fy);
      } else if (kk === 'dune') { if (p < 0.012) put(pick(Y(['dry-grass', 'camelthorn']), q), fx, fy); }
      else if (kk === 'redrock') { if (p < 0.04) put(pick(Y(['camelthorn', 'dry-grass', 'saltbush']), q), fx, fy); }
      else if (kk === 'reg') { if (p < 0.035 * st.bushes) put(pick(Y(['saltbush', 'camelthorn', 'dry-grass', 'broom']), q), fx, fy); }
      else if (kk === 'hardpan') { if (p < 0.03) put(pick(Y(['dry-grass', 'thorn-tree']), q), fx, fy); }
      else if (kk === 'salt') { /* bare */ }
      else if (nearWater && t === 'grass' && p < 0.15) put(pick(Y(['reeds', 'tamarisk', 'date-palm-young']), q), fx, fy);
      else if (kk === 'sand' || kk === 'grass') { if (p < 0.03 * st.bushes) put(pick(Y(['acacia', 'acacia-old', 'thorn-tree', 'broom', 'saltbush', 'camelthorn', 'dry-grass', 'dry-grass', 'tamarisk']), q), fx, fy); }
    } else if (t === 'grass' && !nearWater) {
      const dry = height[i] >= 2 && b !== 'dodona';
      if (b === 'dodona') {
        if (p < 0.03 * st.trees) put(pick(NORTH, q), fx, fy);
        else if (p < 0.05 * st.bushes) put(pick(['bush-a', 'bush-b', 'mountains/juniper'], q), fx, fy);
      } else if (dry && p < 0.05 * st.trees) put(pick(['olive-a', 'olive-b', 'olive-a', 'cypress'], q), fx, fy);
      else if (p < (dry ? 0.065 : 0.008) * st.bushes) put(pick(['bush-a', 'bush-b', 'stone-pine', 'olive-b', 'cypress', 'dead-tree'], q), fx, fy);
    } else if (t === 'grass' && nearWater && p < 0.08) put(pick(['reeds', 'bush-b'], q), fx, fy);
    else if (t === 'sand') { if (p < 0.006) put(pick(['bush-a', 'boulder-b'], q), fx, fy); }
    else if (t === 'dirt' && p < 0.004) put('bush-a', fx, fy);
  }
  {
    const open = new Set(['grass', 'sand', 'dirt']);
    for (let n = objects.length - 1; n >= 0; n--) {
      const o = objects[n], t = terrain[at(Math.floor(o.x), Math.floor(o.y))], fk2 = KINDS[fine.kind[cellOf(o.x, o.y)]];
      if ((fk2 !== t && !(KINDS.indexOf(fk2) > KINDS.indexOf('deep') && open.has(t))) || !footSeen(o.x, o.y)) objects.splice(n, 1);
    }
  }
  // crags and spires on the lips of the rock's cliff bands, scree fans under walls
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (water[i] || terrain[i] === 'road' || spotTiles.has(i)) continue;
    const p = hsh(x, y, 5), q = hsh(x, y, 6), ox = x + 0.25 + 0.5 * hsh(x, y, 7), oy = y + 0.25 + 0.5 * hsh(x, y, 8);
    const c = cellOf(ox, oy), kk = KINDS[fine.kind[c]], fx = Math.floor(2 * ox), fy = Math.floor(2 * oy), z = fine.z[c];
    if (terrain[i] === 'rock' && (kk === 'rock' || kk === 'snow')) {
      const lip = Math.max(z - fzAt(fx + 1, fy), z - fzAt(fx, fy + 1), z - fzAt(fx + 1, fy + 1)) >= 3;
      let id = '';
      if (kk === 'snow') id = p < 0.012 ? 'crag-snow' : '';
      else if (lip) id = p < 0.03 ? pick(z >= 18 ? ['spire', 'crag-a', 'crag-b'] : ['crag-b', 'outcrop', 'crag-a'], q) : '';
      else if (p < 0.008) id = pick(['outcrop', 'crag-b', 'boulder-a'], q);
      if (id && footSeen(ox, oy)) put(id, ox, oy);
    } else if (terrain[i] !== 'rock' && height[i] >= 2) {
      const wall = Math.max(fzAt(fx - 1, fy), fzAt(fx, fy - 1), fzAt(fx - 1, fy - 1)) - z >= 3;
      if (wall && p < 0.1 && footSeen(ox, oy)) put('scree', ox, oy);
    }
  }
  for (let n = objects.length - 1; n >= 0; n--) {
    const o = objects[n];
    if ((o.id.startsWith('boulder') || o.id === 'kyrene/rocks-red') && terrain[at(Math.floor(o.x), Math.floor(o.y))] !== 'rock') objects.splice(n, 1);
  }

  // ---- set pieces, rows, resources
  const pinned = new Set<object>();
  const taken = new Set<number>();
  const clear = (x0: number, y0: number, x1: number, y1: number) => {
    for (let n = objects.length - 1; n >= 0; n--) if (!pinned.has(objects[n]) && objects[n].x >= x0 && objects[n].x < x1 && objects[n].y >= y0 && objects[n].y < y1) objects.splice(n, 1);
  };
  const tryPiece = (id: string, tx: number, ty: number, onRock: boolean) => {
    const fp = OBJECT_BLOCKS[id] ?? [1, 1], fx = tx + fp[0] / 2, fy = ty + fp[1] / 2;
    let h0 = -1;
    for (const [x, y] of footprintTiles(fx, fy, fp)) {
      const j = at(x, y);
      if (j < 0 || taken.has(j) || water[j] || terrain[j] === 'road' || (terrain[j] === 'rock') !== onRock || spotNear(x + 0.5, y + 0.5, 3)) return false;
      if (!onRock && (ring(x, y, (n) => terrain[n] === 'road' || water[n] === 2) || (h0 >= 0 && height[j] !== h0))) return false;
      h0 = height[j];
    }
    clear(tx - 1, ty - 1, tx + fp[0] + 1, ty + fp[1] + 1);
    for (const [x, y] of footprintTiles(fx, fy, fp)) taken.add(at(x, y));
    pinned.add(objects[objects.push({ id, x: fx, y: fy }) - 1]);
    return true;
  };
  let missed = 0;
  // ---- town dressing (Kit.structure / scatterTown): before the set pieces, so those keep off it
  // M7b: the town pieces as pre-built buildings (with their town and whether a safe court's), and the tiles the sim closes under them
  const pre: (PrebuiltEntry & { town: number; court: boolean })[] = [];
  const townShut = new Uint8Array(N);
  {
    const inRects = (x: number, y: number, rs: { x: number; y: number; w: number; h: number }[]) => rs.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    const z = TRADE_ZONES[k.world.id], court = z ? [...z.safe, ...z.yard].map((r) => ({ x: r.x - 1, y: r.y - 1, w: r.w + 2, h: r.h + 2 })) : [];
    const reserved = new Set<number>();
    let placed = 0;
    // free: in the map, dry (or all water for a jetty), not rock, one level, off the entries; `slot` / `near` also keep
    // off streets, the court and its yards, and (blocking ones) a tile round every other structure and road
    const free = (id: string, x0: number, y0: number, mode: 'at' | 'slot' | 'near', wet = false) => {
      const fp = TOWN_FP.get(id)!, block = !TOWN_OPEN.has(id);
      let h0 = -1, land = false;
      for (let y = y0; y < y0 + fp[1]; y++) for (let x = x0; x < x0 + fp[0]; x++) {
        const j = at(x, y);
        if (j < 0 || taken.has(j) || terrain[j] === 'rock' || inRects(x, y, entries) || inRects(x, y, noBuild)) return false;
        if (wet) { if (!water[j]) return false; if (ring(x, y, (n) => !water[n] && terrain[n] !== 'rock')) land = true; continue; }
        if (water[j] || (h0 >= 0 && height[j] !== h0)) return false;
        h0 = height[j];
        if (mode === 'at') continue;
        if (reserved.has(j) || k.streets.has(j) || inRects(x, y, court) || (mode === 'near' && terrain[j] === 'road')) return false;
        if (block && ring(x, y, (n) => k.streets.has(n) || (mode === 'near' && terrain[n] === 'road'))) return false;
      }
      return !wet || land;
    };
    const put1 = (id: string, x0: number, y0: number, town: number, inCourt = false) => {
      const fp = TOWN_FP.get(id)!, block = !TOWN_OPEN.has(id), type = PRE_TYPE[id];
      if (!type) throw new Error(`town structure ${id} has no building type`);
      clear(x0 - 1, y0 - 1, x0 + fp[0] + 1, y0 + fp[1] + 1);
      for (let y = y0 - 1; y <= y0 + fp[1]; y++) for (let x = x0 - 1; x <= x0 + fp[0]; x++) {
        const j = at(x, y);
        if (j < 0) continue;
        // the sim closes a building's footprint but a gate's
        if (x >= x0 && y >= y0 && x < x0 + fp[0] && y < y0 + fp[1]) { taken.add(j); if (type !== 'stoneGate') townShut[j] = 1; } else if (block) reserved.add(j);
      }
      const rot = fp[1] > fp[0] && (type === 'stoneGate' || type === 'stoneWall') ? 1 : 0;
      const tiles = type === 'stoneWall' ? footprintTiles(x0 + fp[0] / 2, y0 + fp[1] / 2, fp).flat() : undefined;
      pre.push({ type, x: x0 + fp[0] / 2, y: y0 + fp[1] / 2, ...(rot ? { rot } : {}), ...(tiles ? { tiles } : {}), town, court: inCourt });
      placed++;
    };
    for (const r of k.townReqs) {
      if (r.kind === 'near') continue;
      if (!TOWN_FP.has(r.id)) throw new Error(`unknown town structure ${r.id}`);
      if (!r.slot) {
        if (free(r.id, r.t[0], r.t[1], 'at')) put1(r.id, r.t[0], r.t[1], r.town, r.court);
        else (missed++, log.push(`town ${r.id} at ${r.t}: blocked`));
        continue;
      }
      // a slot slides up to 3 tiles off a street before it gives up
      const off = [0, 1, -1, 2, -2, 3, -3];
      const hit = off.flatMap((dy) => off.map((dx) => [r.t[0] + dx, r.t[1] + dy] as Pt)).sort((a, b) => Math.hypot(a[0] - r.t[0], a[1] - r.t[1]) - Math.hypot(b[0] - r.t[0], b[1] - r.t[1])).find(([x, y]) => free(r.id, x, y, 'slot'));
      if (hit) put1(r.id, hit[0], hit[1], r.town, r.court);
    }
    for (const r of k.townReqs) {
      if (r.kind !== 'near') continue;
      const [cx, cy] = r.at, cand: [number, number, number][] = [];
      for (let y = Math.floor(cy - r.r1); y <= cy + r.r1; y++) for (let x = Math.floor(cx - r.r1); x <= cx + r.r1; x++) {
        const d = Math.hypot(x - cx, y - cy), j = at(x, y);
        if (d < r.r0 || d > r.r1 || j < 0) continue;
        const rd = k.roadDist[j] * K;
        cand.push([x, y, d + (r.street ? Math.max(0, rd - 2) * (rd > r.street ? 6 : 1.5) : 0) + 3 * hsh(x, y, 37)]);
      }
      cand.sort((a, b) => a[2] - b[2]);
      const done: Pt[] = [];
      for (const [x, y] of cand) {
        if (done.length >= r.n) break;
        const id = r.ids[done.length % r.ids.length], fp = TOWN_FP.get(id);
        if (!fp) throw new Error(`unknown town structure ${id}`);
        if (done.some((d) => Math.hypot(d[0] - x, d[1] - y) < r.gap) || spotNear(x + fp[0] / 2, y + fp[1] / 2, 4)) continue;
        if (free(id, x, y, 'near', r.water)) { put1(id, x, y, r.town); done.push([x, y]); }
      }
      if (done.length < r.n) (missed += r.n - done.length), log.push(`town ${r.ids[0]} near ${r.at.map(Math.round)}: ${done.length}/${r.n}`);
    }
    if (placed) log.push(`town ${placed} structures`);
  }
  // ---- M7d landmarks (W-48 sites): their pieces as pre-built landmark structures (art, own max hp, start hp, ruins), nodes, guardian posts
  const guardians: GuardianEntry[] = [];
  for (const L of k.sites) {
    const { x0, y0 } = L;
    let n = 0, ruins = 0, skipped = 0;
    if (!L.wild) clear(x0, y0, x0 + L.w, y0 + L.h); // a lived-in place: no wild trees in its streets and wards
    const place = (type: BuildingType, px: number, py: number, fw: number, fh: number, p: SitePiece, art?: string, maxHp?: number) => {
      const tiles: number[] = [];
      for (let y = py; y < py + fh; y++) for (let x = px; x < px + fw; x++) {
        const j = at(x, y);
        if (j < 0 || taken.has(j) || terrain[j] === 'rock' || water[j] === 2) { skipped++; return; }
        tiles.push(x, y);
      }
      clear(px - 1, py - 1, px + fw + 1, py + fh + 1);
      for (let i = 0; i < tiles.length; i += 2) {
        const j = at(tiles[i], tiles[i + 1]);
        taken.add(j);
        if (type !== 'stoneGate' && !p.ruined) townShut[j] = 1;
      }
      const rot = fh > fw && (type === 'stoneGate' || type === 'stoneWall' || type === 'stoneStairs') ? 1 : 0;
      pre.push({ type, x: px + fw / 2, y: py + fh / 2, ...(rot ? { rot } : {}), tiles, town: L.town, court: false, landmark: true, hp: p.hp ?? 0.6, ...(p.ruined ? { state: 'ruined' as const } : {}), ...(art ? { art } : {}), ...(maxHp ? { maxHp } : {}) });
      n++;
      if (p.ruined) ruins++;
    };
    for (const p of L.pieces) {
      const pid = p.id;
      if (pid === LABYRINTH) { place('stoneWall', p.x, p.y, 1, 1, p, LABYRINTH, 1500); continue; }
      if (pid.startsWith('@town-')) {
        const id = T(pid.slice(6)), fp = TOWN_FP.get(id)!;
        place(PRE_TYPE[id], p.x, p.y, fp[0], fp[1], p);
        continue;
      }
      if (pid.startsWith('@')) {
        const t = LANDMARK_AT[pid.slice(1)];
        if (t) place(t[0], p.x, p.y, t[1], t[2], p);
        continue;
      }
      const pc = LANDMARK_PIECES.get(pid)!, [fw, fh] = pc.footprint;
      if (LANDMARK_NODE[pid]) {
        clear(p.x - 1, p.y - 1, p.x + fw + 1, p.y + fh + 1);
        objects.push({ id: LANDMARK_NODE[pid], x: p.x + fw / 2, y: p.y + fh / 2 });
        continue;
      }
      const type = LANDMARK_TYPE[pc.kind];
      if (!type) continue;
      place(type, p.x, p.y, fw, fh, p, pid, type === 'stoneWall' ? pc.hp * fw * fh : pc.hp);
    }
    for (const [id, dx, dy] of L.props) objects.push({ id, x: x0 + dx, y: y0 + dy });
    for (const [id, dx, dy] of L.extraNodes) {
      clear(x0 + dx - 1, y0 + dy - 1, x0 + dx + 2, y0 + dy + 2);
      objects.push({ id, x: x0 + dx + 0.5, y: y0 + dy + 0.5 });
    }
    // its guardians, at their posts (Scylla's heads on the land by the water)
    const P = (p: Pt): [number, number] => [x0 + p[0], y0 + p[1]];
    for (const g of L.guardians) {
      const e: GuardianEntry = { boss: g.boss, x: x0 + g.at[0], y: y0 + g.at[1] };
      if (g.perches) e.perches = g.perches.map(P);
      if (g.pit) e.pit = P(g.pit);
      if (g.postern) e.postern = P(g.postern);
      const cx = e.x, cy = e.y;
      if (g.flats === 'water') {
        // the nearest water to it: the River-God's channel
        let bd = Infinity;
        for (let y = Math.floor(cy - 60); y <= cy + 60; y++) for (let x = Math.floor(cx - 60); x <= cx + 60; x++) {
          const j = at(x, y), d = Math.hypot(x - cx, y - cy);
          if (j >= 0 && water[j] && d < bd) (bd = d), (e.flats = [x + 0.5, y + 0.5]);
        }
      } else if (g.flats) e.flats = P(g.flats);
      if (g.heads === 'shore') {
        const cand: [number, number, number][] = [];
        for (let y = Math.floor(cy - 60); y <= cy + 60; y++) for (let x = Math.floor(cx - 60); x <= cx + 60; x++) {
          const j = at(x, y);
          if (j < 0 || water[j] || terrain[j] === 'rock' || taken.has(j) || !ring(x, y, (m) => water[m] > 0)) continue;
          cand.push([x + 0.5, y + 0.5, Math.hypot(x - cx, y - cy)]);
        }
        cand.sort((a, b) => a[2] - b[2]);
        const hs: [number, number][] = [];
        for (const [x, y] of cand) if (hs.length < 6 && hs.every((h) => Math.hypot(h[0] - x, h[1] - y) >= 3)) hs.push([x, y]);
        if (hs.length) {
          e.heads = hs;
          e.x = hs.reduce((a, h) => a + h[0], 0) / hs.length;
          e.y = hs.reduce((a, h) => a + h[1], 0) / hs.length;
        }
      } else if (g.heads) e.heads = g.heads.map(P);
      guardians.push(e);
    }
    log.push(`landmark ${L.id}: ${n} pieces (${ruins} ruined${skipped ? `, ${skipped} blocked` : ''}), ${L.guardians.map((g) => g.boss).join(' + ')}`);
  }
  // W-48 waterfalls: the fall at the cliff's foot, the foam of its plunge pool (on the water, as placed)
  for (const f of k.falls) {
    const [x, y] = tileOf(f.at), [fx, fy] = tileOf(f.pool);
    put('elaia/waterfall', x + 0.5, y + 0.5);
    put('elaia/falls-foam', fx + 0.5, fy + 0.5);
  }
  for (const r of k.reqs) {
    if (r.kind === 'piece') {
      const [cx, cy] = tileOf(r.at), R = r.r * K, done: Pt[] = [];
      const cand: [number, number, number][] = [];
      for (let y = Math.floor(cy - R); y <= cy + R; y++) for (let x = Math.floor(cx - R); x <= cx + R; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= R) cand.push([x, y, d + hsh(x, y, 31) * 2]);
      }
      cand.sort((a, b) => a[2] - b[2]);
      for (const [x, y] of cand) {
        if (done.length >= r.n) break;
        if (done.some((d) => Math.hypot(d[0] - x, d[1] - y) < r.gap * K)) continue;
        if (tryPiece(r.id, x, y, r.onRock)) done.push([x, y]);
      }
      if (done.length < r.n) (missed += r.n - done.length), log.push(`piece ${r.id} near ${r.at}: ${done.length}/${r.n}`);
    } else {
      const [cx, cy, rx, ry, rot] = r.b;
      const R = Math.max(rx, ry) * K + 4, [tx0, ty0] = tileOf([cx, cy]);
      for (let y = Math.floor(ty0 - R); y <= ty0 + R; y++) for (let x = Math.floor(tx0 - R); x <= tx0 + R; x++) {
        if (x % r.dx || y % r.dy) continue;
        const i = at(x, y);
        if (i < 0 || water[i] || terrain[i] === 'road' || terrain[i] === 'rock' || spotTiles.has(i) || taken.has(i)) continue;
        if (blob(k.toUnit(x), k.toUnit(y), cx, cy, rx, ry, rot ?? 0, 1.5, r.seed) <= 0 || !r.on.includes(kindAt(x + 0.5, y + 0.5))) continue;
        if (ring(x, y, (j) => terrain[j] === 'road' || water[j] > 0)) continue;
        clear(x - 1, y - 1, x + 2, y + 2);
        pinned.add(objects[objects.push({ id: pick(r.ids, hsh(x, y, r.seed)), x: r1(x + 0.4 + 0.2 * hsh(x, y, 10)), y: y + 0.5 }) - 1]);
      }
    }
  }
  // Kyrene oases: the spring at the pool's edge, a well, a tent and camels
  for (const o of k.oases) {
    const [ox, oy] = tileOf(o);
    const ringTiles = (r0: number, r1x: number) => {
      const out: Pt[] = [];
      for (let y = Math.floor(oy - r1x); y <= oy + r1x; y++) for (let x = Math.floor(ox - r1x); x <= ox + r1x; x++) { const d = Math.hypot(x + 0.5 - ox, y + 0.5 - oy); if (d >= r0 && d < r1x) out.push([x, y]); }
      return out.sort((a, b) => hsh(a[0], a[1], 13) - hsh(b[0], b[1], 13));
    };
    ringTiles(0, 6 * K).some(([x, y]) => ring(x, y, (j) => water[j] === 1) && tryPiece('kyrene/oasis-spring', x, y, false));
    ringTiles(5 * K, 8 * K).some(([x, y]) => tryPiece('kyrene/well', x, y, false));
    ringTiles(9 * K, 12 * K).some(([x, y]) => tryPiece('kyrene/nomad-tent', x, y, false) && (put('kyrene/camels', x + 3, y + 1.5), true));
  }

  // ---- massifs over the mountains' rock
  const blocked: number[] = [];
  {
    const lib = fileURLToPath(new URL('../../../public/war/biomes/mountains/', import.meta.url));
    const json = JSON.parse(readFileSync(join(lib, 'objects.json'), 'utf8')) as { objects: (Omit<MassifPiece, 'top'> & { kind: string; file: string })[] };
    const pieces: MassifPiece[] = json.objects.filter((d) => d.kind === 'massif' && d.footprint).map((d) => ({ ...d, id: `mountains/${d.id}`, ...columnSpans(readImage(join(lib, d.file))) }));
    const MI = BIOMES.indexOf('mountains'), mask = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (biome[i] === MI && terrain[i] === 'rock' && !water[i]) mask[i] = 1;
    // a landmark's crag skirt (Site.skirt) is drawn as its own ledges, not under massif sprites
    for (const L of k.sites) for (const key of L.vrock.keys()) {
      const tx = L.x0 + (key % 4096), ty = L.y0 + Math.floor(key / 4096);
      const j = at(tx, ty);
      if (j >= 0) mask[j] = 0;
    }
    const land = { w: W, h: H, terrain, water }, placed = placeMassifs(land, mask, pieces);
    for (const m of placed) objects.push({ id: m.def.id, x: m.x0 + m.fw, y: m.y0 + m.fh, ...(m.shade < 1 ? { shade: Math.round(m.shade * 100) / 100 } : {}) });
    const base = massifBase(land, placed);
    let open = 0;
    for (let i = 0; i < N; i++) {
      if (!base[i]) continue;
      if (base[i] && terrain[i] !== 'rock' && water[i] !== 2) open++;
      if (blocked.length && blocked.at(-2)! + blocked.at(-1)! === i) blocked[blocked.length - 1]++;
      else blocked.push(i, 1);
    }
    log.push(`massifs ${placed.length}, base closes ${open} open tiles`);
  }

  // ---- walkability (as the sim: open tile, not deep, not rock, not under a blocker; steps of one level)
  const shut = townShut.slice();
  for (let n = 0; n < blocked.length; n += 2) shut.fill(1, blocked[n], blocked[n] + blocked[n + 1]);
  for (const o of objects) {
    const fp = OBJECT_BLOCKS[o.id];
    if (fp) for (const [x, y] of footprintTiles(o.x, o.y, fp)) if (x >= 0 && y >= 0 && x < W && y < H) shut[y * W + x] = 1;
  }
  const walk = (i: number) => !shut[i] && water[i] !== 2 && terrain[i] !== 'rock';
  const ground = (x: number, y: number, r = 3) => {
    const i0 = at(x, y);
    if (i0 < 0) return false;
    const h0 = height[i0];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const j = at(x + dx, y + dy);
      if (j < 0 || !walk(j) || water[j] || Math.abs(height[j] - h0) > 1) return false;
    }
    return terrain[i0] !== 'road';
  };

  // ---- lairs and claim points: each near its authored point on open ground, off roads, 12+ tiles from spots and other lairs
  const lairs: Lair[] = [];
  const near = (p: Pt, ok: (x: number, y: number) => boolean, R = 30 * K): Pt | null => {
    const [cx, cy] = tileOf(p);
    for (let r = 0; r <= R; r += 1) for (let a = 0; a < Math.max(1, 6 * r); a++) {
      const t = (2 * Math.PI * a) / Math.max(1, 6 * r), x = Math.round(cx + r * Math.cos(t)), y = Math.round(cy + r * Math.sin(t));
      if (ok(x, y)) return [x + 0.5, y + 0.5];
    }
    return null;
  };
  for (const l of k.lairReqs) {
    const p = near(l.at, (x, y) => ground(x, y) && k.roadDist[at(x, y)] > 3 && !spotNear(x + 0.5, y + 0.5, 12) && lairs.every((o) => Math.hypot(o.x - x, o.y - y) >= 12));
    if (!p) { log.push(`lair ${l.kind} near ${l.at}: no ground`); continue; }
    lairs.push({ kind: l.kind, x: p[0], y: p[1], ...(l.count ? { count: l.count } : {}), ...(l.as ? { as: l.as } : {}), ...(l.captain ? { captain: true } : {}) });
  }
  // M7b: every town of a region outside the homes has a claim point (docs/WAR.md "Who owns a town"): the authored one
  // on its market spot, else a new one by its centre (a village's well), guarded by the lairs round it
  const townClaim = k.towns.map((t) => {
    if (k.world.role === 'home') return -1;
    const own = k.claimReqs.findIndex((c) => Math.hypot(c.at[0] - t.at[0], c.at[1] - t.at[1]) <= 12);
    return own >= 0 ? own : k.claimReqs.push({ at: t.at, r: 30 }) - 1;
  });
  const claimPoints: { x: number; y: number; lairs: number[] }[] = [];
  const claimOf: number[] = [];
  for (const c of k.claimReqs) {
    claimOf.push(-1);
    const p = near(c.at, (x, y) => ground(x, y) && lairs.every((o) => Math.hypot(o.x - x, o.y - y) >= 25 * (K / 2) * 0.5));
    if (!p) { log.push(`claim near ${c.at}: no ground`); continue; }
    const ids = c.lairs ?? lairs.flatMap((l, i) => (Math.hypot(l.x - p[0], l.y - p[1]) < c.r * K ? [i] : []));
    claimOf[claimOf.length - 1] = claimPoints.push({ x: p[0], y: p[1], lairs: ids }) - 1;
  }
  // the pre-built pieces: their town's claim point, and the town's condition by depth and lore (a court stays whole)
  const prebuilt: PrebuiltEntry[] = [];
  {
    const cond = CONDITION[k.world.id] ?? CONDITION_BY_DEPTH[REGION_DEPTH[k.world.id] ?? 1];
    const homes = new Map<number, number>(), ruins = new Map<number, number>();
    for (const e of pre) if (PREBUILT_POP.has(e.type)) homes.set(e.town, (homes.get(e.town) ?? 0) + 1);
    for (const e of pre) {
      const { town, court, ...entry } = e, out: PrebuiltEntry = entry;
      const cp = townClaim[town] >= 0 ? claimOf[townClaim[town]] : -1;
      if (cp >= 0) out.claim = cp;
      if (e.landmark) { prebuilt.push(out); continue; } // M7d: a landmark keeps its start state (60%, whole)
      const r = hsh(Math.round(e.x * 2), Math.round(e.y * 2), 91), pop = PREBUILT_POP.has(e.type);
      if (!court && cond.ruin > 0 && MAY_RUIN.has(e.type) && r < cond.ruin && (!pop || (ruins.get(town) ?? 0) + 1 < 0.7 * (homes.get(town) ?? 0))) {
        out.state = 'ruined';
        if (pop) ruins.set(town, (ruins.get(town) ?? 0) + 1);
      } else if (!court && cond.hp[0] < 1) out.hp = Math.round(100 * (cond.hp[0] + (cond.hp[1] - cond.hp[0]) * hsh(Math.round(e.x * 2), Math.round(e.y * 2), 92))) / 100;
      prebuilt.push(out);
    }
    const ruined = prebuilt.filter((e) => e.state === 'ruined').length;
    if (prebuilt.length) log.push(`prebuilt ${prebuilt.length} (${ruined} ruined) in ${k.towns.length} towns`);
  }

  // ---- reachability from the first entry
  const seen = new Uint8Array(N);
  {
    const e0 = entries[0], start = nearestWalk(Math.floor(e0.x + e0.w / 2), Math.floor(e0.y + e0.h / 2));
    const queue = new Int32Array(N);
    let qh = 0, qt = 0;
    if (start >= 0) (queue[qt++] = start), (seen[start] = 1);
    while (qh < qt) {
      const i = queue[qh++], x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = at(x + dx, y + dy);
        if (j < 0 || seen[j] || !walk(j) || Math.abs(height[j] - height[i]) >= 2) continue;
        seen[j] = 1;
        queue[qt++] = j;
      }
    }
  }
  function nearestWalk(x: number, y: number): number {
    for (let r = 0; r < 40; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const j = at(x + dx, y + dy);
      if (j >= 0 && walk(j)) return j;
    }
    return -1;
  }
  const reach = (x: number, y: number) => { const j = nearestWalk(Math.floor(x), Math.floor(y)); return j >= 0 && seen[j] === 1; };
  const cut: string[] = [];
  entries.forEach((e, n) => { if (!reach(e.x + e.w / 2, e.y + e.h / 2)) cut.push(`entry ${k.sides[n].id}`); });
  for (const [name, p] of Object.entries(k.spots)) if (!/Narrows[AB]?\d*$/.test(name) && !reach(k.toTile(p[0]) + 0.5, k.toTile(p[1]) + 0.5)) cut.push(`spot ${name}`);
  lairs.forEach((l, n) => { if (!reach(l.x, l.y)) cut.push(`lair ${n} ${l.kind}`); });
  claimPoints.forEach((c, n) => { if (!reach(c.x, c.y)) cut.push(`claim ${n}`); });
  if (cut.length) log.push(`UNREACHABLE from ${k.sides[0].id}: ${cut.join(', ')}`);
  const checks: Check[] = [
    { need: 'reach', ok: !cut.length, why: cut.length ? `unreachable ${cut.join(', ')}` : 'all reachable' },
    ...runChecks({ world: k.world, W, H, height, terrain, water, walk, seen, roadDist: k.roadDist, spots: k.spots, toTile: k.toTile, objects, lairs, entries, sides: k.sides }),
  ];
  let reachable = 0;
  for (let i = 0; i < N; i++) reachable += seen[i];
  log.push(`objects ${objects.length}, lairs ${lairs.length}, claims ${claimPoints.length}, reachable ${Math.round((100 * reachable) / N)}%${missed ? `, ${missed} pieces missed` : ''}`);

  // ---- write
  const w = k.world;
  const meta = {
    role: w.role, family: w.family, ...(def.draft ? { draft: true } : {}),
    adjacent: k.sides.map((s) => ({ id: s.id, side: s.side })), fauna: w.fauna.map((f) => f.as), resources: w.resources,
    ...(BRIEF[w.id].goods ? { goods: BRIEF[w.id].goods } : {}),
    purpose: BRIEF[w.id].purpose,
    mustHave: Object.fromEntries(checks.filter((c) => !c.need.startsWith('road ') && c.need !== 'reach').map((c) => [c.need, c.ok])),
    routes: Object.fromEntries(checks.filter((c) => c.need.startsWith('road ')).map((c) => [c.need.slice(5), c.ok])),
  };
  const json = {
    id: w.id, name: w.name, w: W, h: H, cells: { rle: encodeCells(height, terrain, water) }, entries, noBuild,
    objs: encodeObjects(objects), blocked, visual: { scale: 2 as const, rle: encodeVisual(fine.kind, fine.z) },
    biomes: { names: [...BIOMES], rle: encodeBiomes(biome) }, lairs, claimPoints, ...(prebuilt.length ? { prebuilt } : {}),
    ...(guardians.length ? { guardians } : {}), ...(REGION_DEPTH[w.id] === 4 && w.role === 'neutral' && w.sea?.length ? { rim: w.sea[0] } : {}), meta,
  };
  const spots: Record<string, Pt> = {};
  for (const s of k.sides) spots[`entry_${s.id}`] = k.entry(s.id, 5);
  Object.assign(spots, k.spots);
  return { json, spots, claims: claimPoints, log, checks, bytes: 0 };
}

/** The mountains library over the rock and a band round it (later zones of the script keep theirs). */
function autoZones(k: Kit) {
  const MI = BIOMES.indexOf('mountains');
  for (let i = 0; i < k.N; i++) {
    const em = k.rock[i] + 9;
    if (em > 0 && (k.terrain[i] === 'rock' || k.biome[i] === 0)) (k.biome[i] = MI), (k.bDepth[i] = em);
  }
}

/** Build and write src/war/regions/<id>.json and <id>.spots.ts (outDir default src/war/regions). */
export function writeRegion(def: RegionDef, outDir = fileURLToPath(new URL('../../../src/war/regions/', import.meta.url))): Built {
  const b = build(def);
  mkdirSync(outDir, { recursive: true });
  const text = JSON.stringify(b.json) + '\n';
  writeFileSync(join(outDir, `${def.id}.json`), text);
  const K = SIZE / U, tile = (u: number) => r1((u + 0.5) * K - 0.5);
  const lines = Object.entries(b.spots).map(([n, v]) => `  ${JSON.stringify(n)}: [${tile(v[0])}, ${tile(v[1])}],`);
  writeFileSync(
    join(outDir, `${def.id}.spots.ts`),
    `// Generated by scripts/war/regions/${def.draft ? 'drafts' : def.id}.ts: named tile points of ${def.id} (x, y), for tests and tools.\n` +
      `export const SPOTS = {\n${lines.join('\n')}\n} as const satisfies Record<string, readonly [number, number]>;\n` +
      `/** Claim points (neutral play, src/war/sim/mobs.ts), tiles. */\n` +
      `export const CLAIM_POINTS = ${JSON.stringify(b.claims.map((c) => ({ x: c.x, y: c.y })))} as const;\n`,
  );
  b.bytes = text.length;
  return b;
}
