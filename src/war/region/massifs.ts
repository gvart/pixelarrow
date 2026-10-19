/**
 * Placement of the mountains' massif sprites (public/war/biomes/mountains, kind 'massif'), run once by
 * the region generator (scripts/war/buildTestRidge.ts): the result is stored in the region's objects
 * list and the renderer draws exactly that list at every zoom (src/war/view/massifs.ts). Pure, no DOM
 * and no extensionless imports (node runs the generator's TypeScript as is).
 *
 * The impassable rock of the mountains biome (the mask) is covered by massifs from every massif piece
 * (none hardcoded), placed by role over a distance-to-rock-edge field. The crest is the deepest rock
 * across the chain; on it stand the cores (role 'core', largest first, footprints apart), then the long
 * composite ridges along the chain's axis. The flanks follow in rows ROW tiles apart along lines of
 * equal depth, inner rows first, each piece as tall as its place between rim (foothills, crags) and
 * crest asks; last a sweep from the front of the range to the back gives a piece to every mountain tile
 * no sprite hides yet. Flank pieces are drawn darker towards the rim (`shade`), so the crest and its
 * peaks stand out. Pieces are picked least used first (then by position hash), never the same image
 * next to itself. A massif covers footprint [fw, fh] tiles at (x0, y0); its sprite's anchor sits on the
 * footprint's south vertex (x0 + fw, y0 + fh). A piece may not hide a road behind it.
 *
 * `massifBase` gives the ground a placed massif stands on: its footprint and every tile its painted
 * base covers that is not behind the footprint, plus a 1-tile margin. The sim keeps it closed
 * (RegionData.blocked), so soldiers stop at the mountain's foot.
 */

/** A massif piece with its sprite's first opaque row per column (h where the column is empty). */
export interface MassifPiece {
  id: string;
  w: number;
  h: number;
  metres: number;
  anchor: { x: number; y: number };
  footprint: [number, number];
  massif?: string;
  role?: string;
  top: Int16Array;
  /** Per sprite column: its last opaque row (-1 where the column is empty); without it a column reaches the sprite's bottom. */
  bottom?: Int16Array;
}
/** A placed massif: footprint (x0, y0, fw, fh), its south vertex row v = x0 + fw + y0 + fh, brightness 0..1. */
export interface PlacedMassif<D extends MassifPiece = MassifPiece> { def: D; x0: number; y0: number; fw: number; fh: number; v: number; shade: number }
/** The land the placement reads. */
export interface MassifLand { w: number; h: number; terrain: ArrayLike<string>; water: ArrayLike<number> }
/** Tiles a sprite hides: offsets from its south vertex, as a list and a bitmap from (dx0, dy0). */
interface Hid { dx0: number; dy0: number; bw: number; bh: number; at: Uint8Array; list: number[] }

/** Half a tile's diamond in world px (src/war/view/iso.ts HW, HH). */
const HW = 32;
const HH = 16;
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
const area = (d: MassifPiece) => d.footprint[0] * d.footprint[1];

/** A well-mixed position hash (src/war/view/autotile.ts `hash`, then mixed). */
const mix = (x: number, y: number, k: number) => {
  let h = ((x * 73856093) ^ (y * 19349663) ^ (k * 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
};
/** The image a piece is drawn from (a mirror `-x` is the same image). */
const base = (d: MassifPiece) => d.id.replace(/-x$/, '');
const roleOf = (d: MassifPiece) => d.role ?? (d.massif === 'composite' ? 'core' : 'ridge');
const CORES = '#cores';
interface Road { x: number; y: number; v: number }

/** Per column of an RGBA image: its first and last opaque row (top: h, bottom: -1 where the column is empty). */
export function columnSpans(img: { w: number; h: number; data: ArrayLike<number> }): { top: Int16Array; bottom: Int16Array } {
  const top = new Int16Array(img.w).fill(img.h), bottom = new Int16Array(img.w).fill(-1);
  for (let x = 0; x < img.w; x++) for (let y = 0; y < img.h; y++) {
    if (img.data[(y * img.w + x) * 4 + 3] <= 128) continue;
    if (top[x] === img.h) top[x] = y;
    bottom[x] = y;
  }
  return { top, bottom };
}

/** Place massifs over the mask (per tile 1 = mountain rock), in placement order. Deterministic: same land, mask and pieces, same list. */
export function placeMassifs<D extends MassifPiece>(land: MassifLand, mask: Uint8Array, defs: D[]): PlacedMassif<D>[] {
  return defs.length ? new Packer(land, mask, defs).list : [];
}

class Packer<D extends MassifPiece> {
  readonly list: PlacedMassif<D>[] = [];
  /** Per tile: 1 = hidden under a massif's sprite. */
  private cov: Uint8Array;
  /** Per tile: distance to the nearest tile that is not mountain (tiles). */
  private dist: Float32Array;
  private uses = new Map<string, number>();
  private hid = new Map<D, Hid>();
  /** Placed massifs by image, and the cores under CORES. */
  private groups = new Map<string, PlacedMassif<D>[]>();

  private r: MassifLand;
  private mask: Uint8Array;

  constructor(r: MassifLand, mask: Uint8Array, defs: D[]) {
    this.r = r;
    this.mask = mask;
    this.cov = new Uint8Array(r.w * r.h);
    this.dist = edgeDistance(mask, r.w, r.h, 1e9);
    const prot = this.roads();
    for (const comp of this.components()) this.pack(comp, defs, prot);
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

  private pack(comp: { tiles: number[]; alongX: boolean }, defs: D[], prot: Road[][]): void {
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
    const byAim = (m: number) => (a: MassifPiece, b: MassifPiece) => Math.round(Math.abs(a.metres - m) / 2) - Math.round(Math.abs(b.metres - m) / 2);

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
  private rank(list: D[], x: number, y: number, by: (a: D, b: D) => number = () => 0, first = false): D[] {
    const u = (d: D) => this.uses.get(base(d)) ?? 0;
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
  private hidden(d: D): Hid {
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
  private fits(d: D, x0: number, y0: number, tx: number, ty: number, minNew: number, prot: Road[][]): boolean {
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

  /** Place a massif: the tiles its sprite hides are covered. */
  private place(d: D, x0: number, y0: number, shade = 1): void {
    const { w } = this.r, [fw, fh] = d.footprint, xs = x0 + fw, ys = y0 + fh, H = this.hidden(d);
    const m = { def: d, x0, y0, fw, fh, v: xs + ys, shade };
    this.list.push(m);
    this.uses.set(base(d), (this.uses.get(base(d)) ?? 0) + 1);
    for (const key of roleOf(d) === 'core' ? [base(d), CORES] : [base(d)]) (this.groups.get(key) ?? this.groups.set(key, []).get(key)!).push(m);
    for (let q = 0; q < H.list.length; q += 2) {
      const x = xs + H.list[q], y = ys + H.list[q + 1];
      if (x >= 0 && y >= 0 && x < w && y < this.r.h) this.cov[y * w + x] = 1;
    }
  }
}

/** Is the point (cx, cy) behind the footprint: does its line of sight to the viewer (+x, +y) cross it? */
export function behindFootprint(m: { x0: number; y0: number; fw: number; fh: number }, cx: number, cy: number): boolean {
  const lo = Math.max(0, m.x0 - cx, m.y0 - cy), hi = Math.min(m.x0 + m.fw - cx, m.y0 + m.fh - cy);
  return lo < hi;
}

/** Calls f for every tile (x, y) whose centre lies within the massif's sprite (`pad` px wider each side; its rows from the top down to the south vertex), with the centre's sprite px. */
export function spriteTiles(m: PlacedMassif, w: number, h: number, pad: number, f: (x: number, y: number, px: number, py: number) => void): void {
  const d = m.def, us = m.x0 + m.fw - (m.y0 + m.fh);
  const uL = Math.floor(us - (d.anchor.x + pad) / HW) - 1, uR = Math.ceil(us + (d.w - d.anchor.x + pad) / HW) + 1;
  for (let v = m.v - Math.ceil(d.anchor.y / HH) - 1; v <= m.v; v++) for (let u = uL; u <= uR; u++) {
    // a tile's centre sits at u = x - y, v = x + y + 1
    if ((u + v + 1) & 1) continue;
    const x = (u + v - 1) / 2, y = (v - 1 - u) / 2;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    f(x, y, Math.round(d.anchor.x + (u - us) * HW), d.anchor.y + (v - m.v) * HH);
  }
}

/** Is the sprite painted at (px, py) (its columns solid from their first opaque row to their last)? */
const painted = (d: MassifPiece, px: number, py: number) => px >= 0 && px < d.w && py >= d.top[px] + 2 && py <= (d.bottom ? d.bottom[px] : d.h) - 2;

/**
 * Per tile: 1 = a massif stands there (closed to movement). Each massif's footprint, and every tile
 * outside it whose centre its sprite paints over (the base spreading round the footprint) unless that
 * tile is behind the footprint (out of sight behind the mountain), grown by `margin` tiles. Roads and
 * water stay open (placement keeps the sprites off the roads).
 */
export function massifBase(land: MassifLand, list: PlacedMassif[], margin = 1): Uint8Array {
  const { w, h } = land, core = new Uint8Array(w * h);
  for (const m of list) {
    for (let y = m.y0; y < m.y0 + m.fh; y++) for (let x = m.x0; x < m.x0 + m.fw; x++) core[y * w + x] = 1;
    spriteTiles(m, w, h, 0, (x, y, px, py) => {
      if (painted(m.def, px, py) && !behindFootprint(m, x + 0.5, y + 0.5)) core[y * w + x] = 1;
    });
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) {
    if (!core[i]) continue;
    const x = i % w, y = (i / w) | 0;
    for (let dy = -margin; dy <= margin; dy++) for (let dx = -margin; dx <= margin; dx++) {
      const tx = x + dx, ty = y + dy, j = ty * w + tx;
      if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
      if (land.terrain[j] === 'road' || land.water[j]) continue;
      out[j] = 1;
    }
  }
  return out;
}

/** Per tile: chamfer distance (1, 1.4) to the nearest tile where `inside` is 0, capped at `cap`; off the map counts as inside. */
export function edgeDistance(inside: ArrayLike<number>, w: number, h: number, cap: number): Float32Array {
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
