/**
 * Mountains drawn as massif sprites (public/war/biomes/mountains, kind 'massif') instead of stacked
 * cliff levels. The impassable rock of the mountains biome is drawn flat at its foot height (./iso.ts)
 * and covered by massifs packed from every massif piece in objects.json (none hardcoded), chosen by
 * a position hash. A massif covers footprint [fw, fh] tiles at (x0, y0); its sprite's anchor sits
 * on the footprint's south vertex (x0 + fw, y0 + fh). Chains along x use the wide (fw > fh, `-x`)
 * pieces, chains along y the deep ones; rows stand 6-8 tiles apart, the tallest at the back edge.
 * A piece may not hide a road behind it. Depth: a thing is behind a massif when x < x0 + fw and
 * y < y0 + fh, else in front; `depth()` gives the x + y key that sorts things that way.
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
export interface Massif { def: MassifDef; x0: number; y0: number; fw: number; fh: number; v: number }

/** Rows of a chain stand this many tiles apart (plus 0..2 by hash). */
const ROW = 6;

export class Massifs {
  readonly list: Massif[] = [];
  /** Per tile: 1 = mountain drawn flat under massifs. */
  readonly mask: Uint8Array;
  /** Per tile: 1 = inside a massif's footprint. */
  readonly foot: Uint8Array;
  /** Per tile: the least depth a thing standing there sorts at (past the massifs it stands in front of). */
  private front: Float32Array;
  private cov: Uint8Array;

  /** The tiles drawn as massifs: rock of the mountains biome. Null when the region has none. */
  static maskOf(r: RegionData): Uint8Array | null {
    const k = r.biomes?.names.indexOf('mountains') ?? -1;
    if (!r.biomes || k < 0) return null;
    const b = decodeBiomes(r.biomes.rle, r.w * r.h), m = new Uint8Array(r.w * r.h);
    let any = false;
    for (let i = 0; i < m.length; i++) if (b[i] === k && r.terrain[i] === 'rock' && !r.water[i]) { m[i] = 1; any = true; }
    return any ? m : null;
  }

  constructor(readonly r: RegionData, mask: Uint8Array, defs: MassifDef[]) {
    const n = r.w * r.h;
    this.mask = mask;
    this.foot = new Uint8Array(n);
    this.front = new Float32Array(n);
    this.cov = new Uint8Array(n);
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

  /** Road tiles near the mountains (a massif may not hide them). */
  private roads(): { x: number; y: number; v: number }[] {
    const { r } = this, out: { x: number; y: number; v: number }[] = [];
    let x0 = r.w, y0 = r.h, x1 = 0, y1 = 0;
    for (let i = 0; i < this.mask.length; i++) if (this.mask[i]) {
      const x = i % r.w, y = (i / r.w) | 0;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    for (let y = Math.max(0, y0 - 48); y <= Math.min(r.h - 1, y1 + 4); y++) for (let x = Math.max(0, x0 - 48); x <= Math.min(r.w - 1, x1 + 4); x++) {
      if (r.terrain[y * r.w + x] === 'road') out.push({ x: x + 0.5, y: y + 0.5, v: x + y + 1 });
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

  private pack(comp: { tiles: number[]; alongX: boolean }, defs: MassifDef[], prot: { x: number; y: number; v: number }[]): void {
    const { w } = this.r, ax = comp.alongX;
    // along x: wide pieces, scanned row by row (y, then x); along y: deep pieces, column by column
    const fit = defs.filter((d) => (ax ? d.footprint[0] >= d.footprint[1] : d.footprint[1] >= d.footprint[0]));
    const big = fit.filter((d) => d.massif === 'composite'), small = fit.filter((d) => d.massif !== 'composite');
    const order = comp.alongX ? comp.tiles : [...comp.tiles].sort((a, b) => (a % w) - (b % w) || a - b);
    const byHash = (list: MassifDef[], h: number) => list.map((d, k) => ({ d, k: hash(h, k, 5) })).sort((a, b) => a.k - b.k).map((e) => e.d);
    for (const [pass, minNew] of [[0, 0.4], [1, 0.3]] as const) {
      for (const i of order) {
        if (this.cov[i]) continue;
        const x = i % w, y = (i / w) | 0, h = hash(x, y, 3);
        const back = ax ? !this.inM(x, y - 1) : !this.inM(x - 1, y);
        // the back edge takes the tallest composite first; other rows mix composites and single pieces by hash
        const cands = pass === 1 ? byHash(small, h).sort((a, b) => a.footprint[0] * a.footprint[1] - b.footprint[0] * b.footprint[1])
          : back ? [...[...big].sort((a, b) => b.metres - a.metres), ...byHash(small, h)] : byHash(fit, h);
        found: for (const d of cands) {
          const [fw, fh] = d.footprint, span = ax ? fw : fh;
          for (let s = 0; s < Math.min(span, 7); s++) {
            const x0 = ax ? x - s : x, y0 = ax ? y : y - s;
            if (this.fits(d, x0, y0, minNew, prot)) { this.place(d, x0, y0, ax); break found; }
          }
        }
      }
    }
  }

  /** Mostly mountain (no road or water under it), enough of it not covered yet, and no road hidden behind the sprite. */
  private fits(d: MassifDef, x0: number, y0: number, minNew: number, prot: { x: number; y: number; v: number }[]): boolean {
    const { r } = this, [fw, fh] = d.footprint, area = fw * fh;
    if (x0 < 0 || y0 < 0 || x0 + fw > r.w || y0 + fh > r.h) return false;
    let inside = 0, fresh = 0;
    for (let y = y0; y < y0 + fh; y++) for (let x = x0; x < x0 + fw; x++) {
      const i = y * r.w + x;
      if (this.mask[i]) { inside++; if (!this.cov[i]) fresh++; } else if (r.terrain[i] === 'road' || r.water[i]) return false;
    }
    if (inside < 0.9 * area || fresh < minNew * area) return false;
    const xs = x0 + fw, ys = y0 + fh, vs = xs + ys;
    for (const p of prot) {
      if (p.v >= vs || (vs - p.v) * HH > d.anchor.y + 8) continue;
      const px = Math.round(d.anchor.x + (p.x - p.y - (xs - ys)) * HW);
      if (px < 0 || px >= d.w) continue;
      if (d.anchor.y + (p.v - vs) * HH >= d.top[px] - 6) return false;
    }
    return true;
  }

  private place(d: MassifDef, x0: number, y0: number, ax: boolean): void {
    const { w } = this.r, [fw, fh] = d.footprint;
    this.list.push({ def: d, x0, y0, fw, fh, v: x0 + fw + y0 + fh });
    for (let y = y0; y < y0 + fh; y++) for (let x = x0; x < x0 + fw; x++) { this.cov[y * w + x] = 1; this.foot[y * w + x] = 1; }
    // the gap to the next row in front is left to that row's sprite, if there is mountain beyond it
    const gap = Math.max(0, ROW + (hash(x0, y0, 7) % 3) - (ax ? fh : fw));
    if (!gap) return;
    let more = false;
    for (let k = 0; k < (ax ? fw : fh) && !more; k++) more = ax ? this.inM(x0 + k, y0 + fh + gap) : this.inM(x0 + fw + gap, y0 + k);
    if (!more) return;
    for (let g = 0; g < gap; g++) for (let k = 0; k < (ax ? fw : fh); k++) {
      const x = ax ? x0 + k : x0 + fw + g, y = ax ? y0 + fh + g : y0 + k;
      if (this.inM(x, y)) this.cov[y * w + x] = 1;
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
