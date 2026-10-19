/**
 * Mountains drawn as massif sprites (public/war/biomes/mountains, kind 'massif') instead of stacked
 * cliff levels. The impassable rock of the mountains biome is drawn flat at its foot height (./iso.ts)
 * and covered by massifs from every massif piece in objects.json (none hardcoded), placed by role
 * over a distance-to-rock-edge field. The crest is the deepest rock across the chain; on it stand
 * the cores (role 'core', largest first, footprints apart), then the long composite ridges along the
 * chain's axis. The flanks follow in rows ROW tiles apart along lines of equal depth, inner rows
 * first, each piece as tall as its place between rim (foothills, crags) and crest asks; last a sweep
 * from the front of the range to the back gives a piece to every mountain tile no sprite hides yet.
 * Flank pieces are drawn darker towards the rim (`shade`), so the crest and its peaks stand out.
 * Pieces are picked least used first (then by position hash), never the same image next to itself. A massif covers footprint
 * [fw, fh] tiles at (x0, y0); its sprite's anchor sits on the footprint's south vertex (x0 + fw,
 * y0 + fh). A piece may not hide a road behind it. Depth: a thing is behind a massif when
 * x < x0 + fw and y < y0 + fh, else in front; `depth()` gives the x + y key that sorts things that way.
 * `screeOf` gives the scree ring the ground draws round the rock.
 */
import type { RegionData } from '../types';
import type { ObjDef } from './art';
import { decodeBiomes } from '../regions/visual';
import { hash } from './autotile';
import { HH, HW } from './iso';

export interface MassifDef extends ObjDef {
  footprint: [number, number];
  /** Per sprite column: its first opaque row (h where the column is empty). */
  top: Int16Array;
}
export interface Massif { def: MassifDef; x0: number; y0: number; fw: number; fh: number; v: number; /** Brightness 0..1: lower on the flanks, full on the crest. */ shade: number }
/** Tiles a sprite hides: offsets from its south vertex, as a list and a bitmap from (dx0, dy0). */
interface Hid { dx0: number; dy0: number; bw: number; bh: number; at: Uint8Array; list: number[] }

/** Tiles from the rock's edge closer than this are its rim (foothills and crags). */
const RIM = 3;
/** Rows of the flanks stand this many tiles apart. */
const ROW = 5;
/** Brightness of a piece on the rim (rising to 1 on the crest): the flanks fall back, the peaks stand out. */
const SHADE = 0.5;
/** A core's middle stands at least this deep in the rock. */
const CORE_D = 7;
/** Tiles between two cores' footprints. */
const CORE_GAP = 2;
/** Tiles within this much of a line's deepest depth are on the crest. */
const CREST = 3;
/** Tiles between two pieces of one image. */
const NEAR = 4;
/** Long ridges stand at least this deep in the rock. */
const LONG_D = 4;
/** The height (m) a filling piece aims at, `f` of the way from the rim (0) to the crest (1): 3 m foothills to 9 m peaks. */
const aim = (f: number) => 3 + 6 * f * f;
const area = (d: MassifDef) => d.footprint[0] * d.footprint[1];

/** A well-mixed position hash. */
const mix = (x: number, y: number, k: number) => {
  let h = hash(x, y, k);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
};
/** The image a piece is drawn from (a mirror `-x` is the same image). */
const base = (d: MassifDef) => d.id.replace(/-x$/, '');
const roleOf = (d: MassifDef) => d.role ?? (d.massif === 'composite' ? 'core' : 'ridge');
const CORES = '#cores';
interface Road { x: number; y: number; v: number }

export class Massifs {
  readonly list: Massif[] = [];
  /** Per tile: 1 = mountain drawn flat under massifs. */
  readonly mask: Uint8Array;
  /** Per tile: 1 = inside a massif's footprint. */
  readonly foot: Uint8Array;
  /** Per tile: the least depth a thing standing there sorts at (past the massifs it stands in front of). */
  private front: Float32Array;
  /** Per tile: 1 = hidden under a massif's sprite. */
  private cov: Uint8Array;
  /** Per tile: distance to the nearest tile that is not mountain (tiles). */
  private dist: Float32Array;
  private uses = new Map<string, number>();
  private hid = new Map<MassifDef, Hid>();
  /** Placed massifs by image, and the cores under CORES. */
  private groups = new Map<string, Massif[]>();

  /** The tiles drawn as massifs: rock of the mountains biome. Null when the region has none. */
  static maskOf(r: RegionData): Uint8Array | null {
    const k = r.biomes?.names.indexOf('mountains') ?? -1;
    if (!r.biomes || k < 0) return null;
    const b = decodeBiomes(r.biomes.rle, r.w * r.h), m = new Uint8Array(r.w * r.h);
    let any = false;
    for (let i = 0; i < m.length; i++) if (b[i] === k && r.terrain[i] === 'rock' && !r.water[i]) { m[i] = 1; any = true; }
    return any ? m : null;
  }

  /** Per tile: 1 = scree round the rock (1-3 tiles wide, ragged), on dry ground of the mountains biome. */
  static screeOf(r: RegionData, mask: Uint8Array): Uint8Array {
    const k = r.biomes?.names.indexOf('mountains') ?? -1, b = r.biomes ? decodeBiomes(r.biomes.rle, r.w * r.h) : null;
    const out = new Uint8Array(mask.length), d = edgeDistance(mask.map((v) => 1 - v), r.w, r.h, 4);
    for (let i = 0; i < out.length; i++) {
      if (mask[i] || !b || b[i] !== k || r.water[i] || r.terrain[i] === 'road') continue;
      const x = i % r.w, y = (i / r.w) | 0;
      if (d[i] <= 1 + (mix(x >> 1, y >> 1, 13) % 3) * 0.75) out[i] = 1;
    }
    return out;
  }

  constructor(readonly r: RegionData, mask: Uint8Array, defs: MassifDef[]) {
    const n = r.w * r.h;
    this.mask = mask;
    this.foot = new Uint8Array(n);
    this.front = new Float32Array(n);
    this.cov = new Uint8Array(n);
    this.dist = edgeDistance(mask, r.w, r.h, 1e9);
    if (!defs.length) return;
    const prot = this.roads();
    for (const comp of this.components()) this.pack(comp, defs, prot);
    for (const m of this.list) this.sortRule(m);
  }

  /** Is an object (`metres` tall) standing at (x, y) left out: inside a footprint, or a crag over 4 m on the mountain (the massifs stand for it)? */
  covers(x: number, y: number, metres: number): boolean {
    const t = Math.floor(y) * this.r.w + Math.floor(x);
    return this.foot[t] === 1 || (this.mask[t] === 1 && metres > 4);
  }

  /** Depth key (x + y, pushed past the massifs the point stands in front of). */
  depth(x: number, y: number): number {
    const tx = Math.floor(x), ty = Math.floor(y), { w, h } = this.r;
    return tx < 0 || ty < 0 || tx >= w || ty >= h ? x + y : Math.max(x + y, this.front[ty * w + tx]);
  }

  private inM(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.r.w && y < this.r.h && this.mask[y * this.r.w + x] === 1;
  }

  /** Road tiles near the mountains (a massif may not hide them), by their row v = x + y + 1. */
  private roads(): Road[][] {
    const { r } = this, out: Road[][] = Array.from({ length: r.w + r.h + 1 }, () => []);
    let x0 = r.w, y0 = r.h, x1 = 0, y1 = 0;
    for (let i = 0; i < this.mask.length; i++) if (this.mask[i]) {
      const x = i % r.w, y = (i / r.w) | 0;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    for (let y = Math.max(0, y0 - 48); y <= Math.min(r.h - 1, y1 + 4); y++) for (let x = Math.max(0, x0 - 48); x <= Math.min(r.w - 1, x1 + 4); x++) {
      if (r.terrain[y * r.w + x] === 'road') out[x + y + 1].push({ x: x + 0.5, y: y + 0.5, v: x + y + 1 });
    }
    return out;
  }

  /** 4-connected parts of the mask, each with its long axis. */
  private components(): { tiles: number[]; alongX: boolean }[] {
    const { w } = this.r, seen = new Uint8Array(this.mask.length), out: { tiles: number[]; alongX: boolean }[] = [];
    for (let s = 0; s < this.mask.length; s++) {
      if (!this.mask[s] || seen[s]) continue;
      const tiles = [s];
      seen[s] = 1;
      let sx = 0, sy = 0, sxx = 0, syy = 0;
      for (let k = 0; k < tiles.length; k++) {
        const i = tiles[k], x = i % w, y = (i / w) | 0;
        sx += x; sy += y; sxx += x * x; syy += y * y;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (!this.inM(x + dx, y + dy)) continue;
          const j = (y + dy) * w + x + dx;
          if (!seen[j]) { seen[j] = 1; tiles.push(j); }
        }
      }
      const c = tiles.length;
      tiles.sort((a, b) => a - b);
      out.push({ tiles, alongX: sxx / c - (sx / c) ** 2 >= syy / c - (sy / c) ** 2 });
    }
    return out;
  }

  private pack(comp: { tiles: number[]; alongX: boolean }, defs: MassifDef[], prot: Road[][]): void {
    const { w } = this.r, ax = comp.alongX, D = this.dist;
    // pieces lying along the chain: along x the wide (fw >= fh) ones, along y the deep ones
    const fit = defs.filter((d) => (ax ? d.footprint[0] >= d.footprint[1] : d.footprint[1] >= d.footprint[0]));
    const cores = fit.filter((d) => roleOf(d) === 'core'), ridges = fit.filter((d) => roleOf(d) === 'ridge');
    const hills = fit.filter((d) => roleOf(d) === 'foothill'), rest = [...ridges.filter((d) => d.massif !== 'composite'), ...hills];
    const xy = (i: number) => [i % w, (i / w) | 0] as const;
    // the crest: per line across the chain (a column along x, a row along y), each run of rock's deepest
    // depth; a tile is on the crest when it is that deep
    const crest = new Float32Array(D.length);
    const runs = new Map<number, number[]>();
    for (const i of comp.tiles) { const [x, y] = xy(i), k = ax ? x : y; (runs.get(k) ?? runs.set(k, []).get(k)!).push(i); }
    for (const line of runs.values()) {
      line.sort((a, b) => (ax ? a - b : (a % w) - (b % w)));
      for (let s = 0; s < line.length;) {
        let e = s + 1;
        while (e < line.length && (ax ? line[e] - line[e - 1] === w : line[e] - line[e - 1] === 1)) e++;
        let top = 0;
        for (let q = s; q < e; q++) top = Math.max(top, D[line[q]]);
        for (let q = s; q < e; q++) crest[line[q]] = top;
        s = e;
      }
    }
    const onCrest = (i: number, min: number) => D[i] >= min && D[i] >= crest[i] - CREST;

    // 1. cores on the crest: the deepest first, the largest least used core that fits there, footprints CORE_GAP apart
    const deep = comp.tiles.filter((i) => onCrest(i, CORE_D)).sort((a, b) => D[b] - D[a] || mix(...xy(a), 1) - mix(...xy(b), 1));
    for (const i of deep) {
      if (this.cov[i]) continue;
      const [x, y] = xy(i);
      for (const d of this.rank(cores, x, y, (a, b) => area(b) - area(a), true)) {
        const [fw, fh] = d.footprint, x0 = x - (fw >> 1), y0 = y - (fh >> 1);
        if (this.near(x0, y0, fw, fh, CORE_GAP, CORES) || this.near(x0, y0, fw, fh, NEAR, base(d))) continue;
        if (this.fits(d, x0, y0, x, y, 0.5, prot)) { this.place(d, x0, y0); break; }
      }
    }

    // 2. long ridges (the composite ridge pieces) along the crest between the cores
    const longs = ridges.filter((d) => d.massif === 'composite');
    for (const i of comp.tiles.filter((t) => onCrest(t, LONG_D)).sort((a, b) => D[b] - D[a] || mix(...xy(a), 2) - mix(...xy(b), 2))) {
      if (this.cov[i]) continue;
      const [x, y] = xy(i);
      for (const d of this.rank(longs, x, y)) {
        const [fw, fh] = d.footprint, x0 = x - (fw >> 1), y0 = y - (fh >> 1);
        if (this.near(x0, y0, fw, fh, NEAR, base(d))) continue;
        if (this.fits(d, x0, y0, x, y, 0.5, prot)) { this.place(d, x0, y0); break; }
      }
    }

    const flank = (i: number) => Math.min(1, (D[i] + 1) / Math.max(crest[i], RIM)), aimAt = (i: number) => aim(flank(i)), shade = (i: number) => SHADE + (1 - SHADE) * flank(i);
    const byAim = (m: number) => (a: MassifDef, b: MassifDef) => Math.round(Math.abs(a.metres - m) / 2) - Math.round(Math.abs(b.metres - m) / 2);

    // 3. the flanks in rows ROW tiles apart following the rock's edge (lines of equal depth), inner rows first:
    // pieces along each row overlapping, as tall as the row's place between rim and crest asks
    const claim = new Uint8Array(D.length);
    const rows = new Map<number, number[]>();
    for (const i of comp.tiles) {
      const k = Math.round((D[i] - RIM) / ROW);
      if (k >= 0 && Math.abs(D[i] - RIM - k * ROW) < 0.75) (rows.get(k) ?? rows.set(k, []).get(k)!).push(i);
    }
    for (const k of [...rows.keys()].sort((a, b) => b - a)) {
      for (const i of rows.get(k)!.sort((a, b) => (ax ? (a % w) - (b % w) : ((a / w) | 0) - ((b / w) | 0)) || a - b)) {
        if (claim[i] || this.cov[i]) continue;
        const [x, y] = xy(i), list = D[i] < RIM + 1 ? [...hills, ...ridges.filter((d) => d.metres < 9)] : [...rest];
        found: for (const c of this.rank(list, x, y, byAim(aimAt(i)), true)) {
          const [fw, fh] = c.footprint;
          if (this.near(x - fw, y - fh, 2 * fw, 2 * fh, NEAR, base(c))) continue; // no piece of this image round the tile
          for (const b of [0, 1, -1, 2, -2]) {
            const x0 = x - (fw >> 1) + (ax ? 0 : b), y0 = y - (fh >> 1) + (ax ? b : 0);
            if (this.near(x0, y0, fw, fh, NEAR, base(c)) || !this.fits(c, x0, y0, x, y, 0.25, prot)) continue;
            this.place(c, x0, y0, shade(i));
            // the next piece of the row starts 0.6-0.75 of this one further on, its foot under this one
            const span = Math.round((ax ? fw : fh) * (0.6 + 0.15 * ((mix(x, y, 5) % 100) / 100)));
            for (let a = -span >> 1; a <= span >> 1; a++) for (let q = -2; q <= 2; q++) {
              const cx = x + (ax ? a : q), cy = y + (ax ? q : a);
              if (cx >= 0 && cy >= 0 && cx < w && cy < this.r.h) claim[cy * w + cx] = 1;
            }
            break found;
          }
        }
      }
    }

    // 4. front to back: each tile still seen gets the piece that hides it, its footprint's front edge on the tile
    const order = [...comp.tiles].sort((a, b) => {
      const [ax_, ay] = xy(a), [bx, by] = xy(b);
      return bx + by - (ax_ + ay) || (ax ? bx - ax_ : by - ay);
    });
    for (const minNew of [0.3, 0.1]) {
      for (const i of order) {
        if (this.cov[i]) continue;
        const [x, y] = xy(i);
        found: for (const c of this.rank(rest, x, y, byAim(aimAt(i)), true)) {
          const [fw, fh] = c.footprint, span = ax ? fw : fh;
          if (this.near(x - fw, y - fh, 2 * fw, 2 * fh, NEAR, base(c))) continue; // no piece of this image round the tile
          for (let k = 0; k < span; k++) {
            const s = (span >> 1) + (k & 1 ? -(k + 1) / 2 : k / 2);
            for (const b of [0, 1, -1, 2, -2, 3]) { // the tile on the footprint's front row, or a few rows off it
              const x0 = ax ? x - s : x - fw + 1 + b, y0 = ax ? y - fh + 1 + b : y - s;
              if (!this.near(x0, y0, fw, fh, NEAR, base(c)) && this.fits(c, x0, y0, x, y, minNew, prot)) { this.place(c, x0, y0, shade(i)); break found; }
            }
          }
        }
      }
    }
  }

  /** Pieces least used first, then by `by`, then by a position hash (`first`: `by` before use). */
  private rank(list: MassifDef[], x: number, y: number, by: (a: MassifDef, b: MassifDef) => number = () => 0, first = false): MassifDef[] {
    const u = (d: MassifDef) => this.uses.get(base(d)) ?? 0;
    return list.map((d, k) => ({ d, h: mix(x, y, 31 + k) }))
      .sort((a, b) => (first ? by(a.d, b.d) || u(a.d) - u(b.d) : u(a.d) - u(b.d) || by(a.d, b.d)) || a.h - b.h).map((e) => e.d);
  }

  /** Is a placed massif of group `key` (an image, or CORES) within `gap` tiles of the footprint (x0, y0, fw, fh)? */
  private near(x0: number, y0: number, fw: number, fh: number, gap: number, key: string): boolean {
    return (this.groups.get(key) ?? []).some((m) => m.x0 < x0 + fw + gap && x0 < m.x0 + m.fw + gap && m.y0 < y0 + fh + gap && y0 < m.y0 + m.fh + gap);
  }

  /**
   * The tiles a piece's sprite hides, as offsets from its footprint's south vertex: those whose
   * diamond lies under the sprite's opaque columns (a tile's centre is u = x - y, v = x + y + 1).
   */
  private hidden(d: MassifDef): Hid {
    let h = this.hid.get(d);
    if (h) return h;
    const uL = Math.floor(-d.anchor.x / HW) - 1, uR = Math.ceil((d.w - d.anchor.x) / HW) + 1, vT = Math.floor(-d.anchor.y / HH) - 1;
    const dx0 = Math.floor((uL + vT - 1) / 2), dy0 = Math.floor((vT - 1 - uR) / 2), bw = Math.ceil((uR - 1) / 2) - dx0 + 1, bh = Math.ceil(-uL / 2) - dy0 + 1;
    const op = (px: number, py: number) => px >= 0 && px < d.w && py >= d.top[px] + 4;
    const at = new Uint8Array(bw * bh), list: number[] = [];
    for (let j = 0; j < bh; j++) for (let k = 0; k < bw; k++) {
      const dx = dx0 + k, dy = dy0 + j, v = dx + dy + 1;
      if (v >= 0) continue;
      const px = Math.round(d.anchor.x + (dx - dy) * HW), py = d.anchor.y + v * HH;
      if (op(px, py - HH) && op(px - HW + 4, py) && op(px + HW - 4, py)) { at[j * bw + k] = 1; list.push(dx, dy); }
    }
    this.hid.set(d, (h = { dx0, dy0, bw, bh, at, list }));
    return h;
  }

  /**
   * Mostly mountain (no road or water under it), hides the tile (tx, ty), hides enough mountain still
   * seen (minNew of its footprint's area), and hides no road behind it.
   */
  private fits(d: MassifDef, x0: number, y0: number, tx: number, ty: number, minNew: number, prot: Road[][]): boolean {
    const { r } = this, [fw, fh] = d.footprint, area = fw * fh, xs = x0 + fw, ys = y0 + fh;
    if (x0 < 0 || y0 < 0 || xs > r.w || ys > r.h) return false;
    const H = this.hidden(d), k = tx - xs - H.dx0, j = ty - ys - H.dy0;
    if (k < 0 || j < 0 || k >= H.bw || j >= H.bh || !H.at[j * H.bw + k]) return false;
    let inside = 0;
    for (let y = y0; y < ys; y++) for (let x = x0; x < xs; x++) {
      const i = y * r.w + x;
      if (this.mask[i]) inside++; else if (r.terrain[i] === 'road' || r.water[i]) return false;
    }
    if (inside < 0.9 * area) return false;
    let fresh = 0;
    for (let q = 0; q < H.list.length; q += 2) {
      const x = xs + H.list[q], y = ys + H.list[q + 1];
      if (this.inM(x, y) && !this.cov[y * r.w + x]) fresh++;
    }
    if (fresh < minNew * area) return false;
    const vs = xs + ys;
    for (let v = Math.max(0, vs - Math.floor((d.anchor.y + 8) / HH)); v < Math.min(vs, prot.length); v++) {
      for (const p of prot[v]) {
        const px = Math.round(d.anchor.x + (p.x - p.y - (xs - ys)) * HW);
        if (px < 0 || px >= d.w) continue;
        if (d.anchor.y + (p.v - vs) * HH >= d.top[px] - 6) return false;
      }
    }
    return true;
  }

  /** Place a massif: its footprint is out of bounds for objects, the tiles its sprite hides are covered. */
  private place(d: MassifDef, x0: number, y0: number, shade = 1): void {
    const { w } = this.r, [fw, fh] = d.footprint, xs = x0 + fw, ys = y0 + fh, H = this.hidden(d);
    const m = { def: d, x0, y0, fw, fh, v: xs + ys, shade };
    this.list.push(m);
    this.uses.set(base(d), (this.uses.get(base(d)) ?? 0) + 1);
    for (const key of roleOf(d) === 'core' ? [base(d), CORES] : [base(d)]) (this.groups.get(key) ?? this.groups.set(key, []).get(key)!).push(m);
    for (let y = y0; y < ys; y++) for (let x = x0; x < xs; x++) this.foot[y * w + x] = 1;
    for (let q = 0; q < H.list.length; q += 2) {
      const x = xs + H.list[q], y = ys + H.list[q + 1];
      if (x >= 0 && y >= 0 && x < w && y < this.r.h) this.cov[y * w + x] = 1;
    }
  }

  /** Tiles out of the massif's back quadrant whose point (or a man's body on it) its sprite would draw over sort in front of it. */
  private sortRule(m: Massif): void {
    const { r } = this, d = m.def, xs = m.x0 + m.fw, ys = m.y0 + m.fh, us = xs - ys;
    const up = Math.ceil(d.anchor.y / HH) + 1, uL = Math.floor(us - d.anchor.x / HW) - 1, uR = Math.ceil(us + (d.w - d.anchor.x) / HW) + 1;
    for (let v = m.v - up - 1; v < m.v - 1; v++) for (let u = uL; u <= uR; u++) {
      if ((u + v) & 1) continue;
      const x = (u + v) / 2, y = (v - u) / 2;
      if (x < 0 || y < 0 || x >= r.w || y >= r.h || (x < xs && y < ys)) continue;
      const px = Math.round(d.anchor.x + (x - y - us) * HW), py = d.anchor.y + (x + y + 1 - m.v) * HH;
      if (px < 0 || px >= d.w || py < d.top[px] - 48) continue;
      const i = y * r.w + x;
      this.front[i] = Math.max(this.front[i], m.v + 0.01);
    }
  }
}

/** Per tile: chamfer distance (1, 1.4) to the nearest tile where `inside` is 0, capped at `cap`; off the map counts as inside. */
function edgeDistance(inside: ArrayLike<number>, w: number, h: number, cap: number): Float32Array {
  const d = new Float32Array(w * h), S = Math.SQRT2;
  for (let i = 0; i < d.length; i++) d[i] = inside[i] ? cap : 0;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? cap : d[y * w + x]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (d[i]) d[i] = Math.min(d[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + S, at(x + 1, y - 1) + S);
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    if (d[i]) d[i] = Math.min(d[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + S, at(x - 1, y + 1) + S);
  }
  return d;
}

/** First opaque row of each column of an image. */
export function columnTops(img: CanvasImageSource & { width: number; height: number }): Int16Array {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, img.width, img.height).data, top = new Int16Array(img.width).fill(img.height);
  for (let x = 0; x < img.width; x++) for (let y = 0; y < img.height; y++) if (px[(y * img.width + x) * 4 + 3] > 128) { top[x] = y; break; }
  return top;
}
