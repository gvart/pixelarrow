/**
 * Half-size (1 m) frames cut from the PixelLab 2 m tiles (W-20) for the visual cells (./iso.ts):
 * a 32 x 32 frame = a 32 x 16 diamond over a 16 px side, one per sheet mask and quadrant of the 2 m
 * tile the cell lies in.
 *
 * The built sheets are two terrain fills plus a 1 px drawn edge (scripts/war/art/build.mjs), so a
 * cell frame takes the transition's shape from the 2 m frame of its mask scaled to half size, and
 * its colours from the fills at full size at the cell's place in its tile: texture density stays
 * the soldiers', and cells line up with each other and with the variant fills. Sides come from the
 * 2 m frame's side band. Cliff strips (one level of side, 32 x 24) come in a few column offsets and
 * shades, so a tall wall does not repeat one band.
 */
import type { WarArt } from './art';

const TW = 64, CW = 32, CH = 32;
/** Cliff strip choices per material: OFFS column offsets x SHADES shades. */
export const OFFS = [-8, 0, 8] as const;
export const SHADES = [1, 0.84, 0.7] as const;

export interface FineArt {
  /** Per sheet: frame (mask * 4 + quadrant) at x = index * 32. */
  sheets: HTMLCanvasElement[];
  /** Per variant: (frame * 4 + quadrant) * 32. */
  variants: HTMLCanvasElement[];
  /**
   * Per cliff id: 32 x 24 strips at (shade * n + k) * 32; k a column offset (n = OFFS.length) or, for a W-51 multi-frame
   * cliff (public/war/biomes/<b>/tiles.json cliffs[].frames), a frame (n = frames).
   */
  cliffs: Record<string, HTMLCanvasElement>;
  /** Per cliff id: strips per shade, and the frame roles (lip: under the edge, face, low: at the foot) when it has them. */
  cliffInfo: Record<string, { n: number; roles?: CliffRoles }>;
}
export interface CliffRoles { lip: number[]; face: number[]; low: number[] }

const inTop = (x: number, y: number, hw: number, hh: number) => Math.abs(x + 0.5 - hw) / hw + Math.abs(y + 0.5 - hh) / hh <= 1;
/** Last top-diamond row of each column. */
const tops = (w: number, hw: number, hh: number) => Array.from({ length: w }, (_, x) => {
  const c = Math.min(w - 2, Math.max(1, x)); // the outermost columns hold no diamond pixel: use their neighbour's
  let y = 2 * hh - 1;
  while (y > 0 && !inTop(c, y, hw, hh)) y--;
  return y;
});
const TOP_C = tops(TW, 32, 16), TOP_F = tops(CW, 16, 8);

function pixels(img: HTMLImageElement): ImageData {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  return g.getImageData(0, 0, img.width, img.height);
}

/** The side-band source pixel (2 m frame coords) of fine frame pixel (x, y) below its diamond, or -1. */
function sideSrc(x: number, y: number, off = 0): [number, number] | null {
  const d = y - TOP_F[x] - 1;
  if (d < 0 || d >= 16) return null;
  const X = x < 16 ? x + 8 + off : x + 24 + off;
  return [X, TOP_C[X] + 1 + d];
}

export function buildFineArt(art: WarArt): FineArt {
  const out = (n: number, h = CH) => { const c = document.createElement('canvas'); c.width = n * CW; c.height = h; return c; };
  const sheets = art.tiles.sheets.map((s, si) => {
    const src = pixels(art.sheets[si]), d = src.data, W = src.width;
    const at = (f: number, x: number, y: number) => (y * W + f * TW + x) * 4;
    const same = (a: number, b: number) => d[a] === d[b] && d[a + 1] === d[b + 1] && d[a + 2] === d[b + 2] && d[a + 3] === d[b + 3];
    const F1 = s.maskToFrame[15], F0 = s.maskToFrame[0];
    const c = out(64), g = c.getContext('2d')!, im = g.createImageData(64 * CW, CH), o = im.data;
    for (let m = 0; m < 16; m++) {
      const f = s.maskToFrame[m];
      for (let q = 0; q < 4; q++) {
        const qx = q & 1, qy = q >> 1, ox = (qx - qy) * 16 + 16, oy = (qx + qy) * 8, base = (m * 4 + q) * CW;
        for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
          const t = (y * im.width + base + x) * 4;
          let from = -1;
          if (inTop(x, y, 16, 8)) {
            // the transition's shape: the 2 x 2 block of the 2 m frame under this pixel, scaled
            let n1 = 0, n0 = 0, edge = -1;
            for (let by = 0; by < 2; by++) for (let bx = 0; bx < 2; bx++) {
              const X = 2 * x + bx, Y = 2 * y + by;
              if (!inTop(X, Y, 32, 16)) continue;
              const p = at(f, X, Y);
              if (same(p, at(F1, X, Y))) n1++;
              else if (same(p, at(F0, X, Y))) n0++;
              else if (edge < 0) edge = p;
            }
            // its colours: the fill at full size at this cell's place in the tile
            const X = x + ox, Y = y + oy;
            from = edge >= 0 && n0 + n1 < 4 ? edge : at(n1 >= n0 ? F1 : F0, X, Y);
          } else {
            const sp = sideSrc(x, y);
            if (sp) from = at(f, sp[0], sp[1]);
          }
          if (from >= 0) for (let k = 0; k < 4; k++) o[t + k] = d[from + k];
        }
      }
    }
    g.putImageData(im, 0, 0);
    return c;
  });
  const variants = (art.tiles.variants ?? []).map((v, vi) => {
    const src = pixels(art.variants[vi]), d = src.data, W = src.width;
    const c = out(v.frames * 4), g = c.getContext('2d')!, im = g.createImageData(v.frames * 4 * CW, CH), o = im.data;
    for (let f = 0; f < v.frames; f++) for (let q = 0; q < 4; q++) {
      const qx = q & 1, qy = q >> 1, ox = (qx - qy) * 16 + 16, oy = (qx + qy) * 8, base = (f * 4 + q) * CW;
      for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
        const sp: [number, number] | null = inTop(x, y, 16, 8) ? [x + ox, y + oy] : sideSrc(x, y);
        if (!sp) continue;
        const from = (sp[1] * W + f * TW + sp[0]) * 4, t = (y * im.width + base + x) * 4;
        for (let k = 0; k < 4; k++) o[t + k] = d[from + k];
      }
    }
    g.putImageData(im, 0, 0);
    return c;
  });
  const cliffs: Record<string, HTMLCanvasElement> = {}, cliffInfo: FineArt['cliffInfo'] = {};
  for (const [id, img] of Object.entries(art.cliffs)) {
    const meta = art.cliffMeta?.[id], frames = meta?.frames && meta.frames > 1 ? meta.frames : 0;
    const per = frames || OFFS.length, n = SHADES.length * per;
    cliffInfo[id] = { n: per, roles: frames ? meta!.roles : undefined };
    const src = pixels(img), d = src.data, W = src.width;
    const c = out(n, 24), g = c.getContext('2d')!, im = g.createImageData(n * CW, 24), o = im.data;
    SHADES.forEach((sh, si) => { for (let oi = 0; oi < per; oi++) {
      const base = (si * per + oi) * CW, off = frames ? 0 : OFFS[oi], fx = frames ? oi * TW : 0;
      for (let y = 0; y < 24; y++) for (let x = 0; x < CW; x++) {
        const sp = sideSrc(x, y + 8, off);
        if (!sp) continue;
        const Y = sp[1] - 16; // the strip is the 2 m frame from row 16 down
        if (Y < 0 || Y >= src.height) continue;
        const from = (Y * W + fx + sp[0]) * 4, t = (y * im.width + base + x) * 4;
        if (!d[from + 3]) continue;
        for (let k = 0; k < 3; k++) o[t + k] = Math.round(d[from + k] * sh);
        o[t + 3] = 255;
      }
    } });
    g.putImageData(im, 0, 0);
    cliffs[id] = c;
  }
  return { sheets, variants, cliffs, cliffInfo };
}

/**
 * Transition cells with curved edges: the corner values g (0..1, the share of the sheet's first
 * terrain round each corner, >= 0.5 where the corner mask has it) are interpolated bilinearly over
 * the cell and the edge drawn where they cross 0.5, so a coast is a smooth contour, not a row of
 * corner-mask teeth. Neighbours share corner values, so edges meet. Frames are built on first use
 * (corner values quantized to eighths) into 1024 px atlas pages.
 */
export class SmoothFrames {
  private src: { d: Uint8ClampedArray; W: number; F1: number; F0: number; edge: number[]; m2f: number[] }[];
  private cache = new Map<number, number>();
  private pages: HTMLCanvasElement[] = [];
  private n = 0;
  constructor(art: WarArt) {
    this.src = art.tiles.sheets.map((s, si) => {
      const im = pixels(art.sheets[si]), d = im.data, W = im.width, F1 = s.maskToFrame[15], F0 = s.maskToFrame[0], edge: number[] = [];
      const at = (f: number, x: number, y: number) => (y * W + f * TW + x) * 4;
      const same = (a: number, b: number) => d[a] === d[b] && d[a + 1] === d[b + 1] && d[a + 2] === d[b + 2];
      // the drawn edge (bank) colours of the set: top pixels of the mixed frames that are neither fill
      for (let m = 1; m < 15; m++) for (let y = 0; y < 32; y++) for (let x = 0; x < TW; x++) {
        if (!inTop(x, y, 32, 16)) continue;
        const p = at(s.maskToFrame[m], x, y);
        if (!same(p, at(F1, x, y)) && !same(p, at(F0, x, y))) edge.push(p);
      }
      return { d, W, F1, F0, edge, m2f: s.maskToFrame };
    });
  }

  /** Atlas page and slot of the frame for sheet s, mask m, quadrant q, corner values in eighths (NW, NE, SW, SE). */
  frame(s: number, m: number, q: number, g: number[]): [HTMLCanvasElement, number, number] {
    const key = ((((s * 16 + m) * 4 + q) * 9 + g[0]) * 9 + g[1]) * 81 + g[2] * 9 + g[3];
    let slot = this.cache.get(key);
    if (slot === undefined) this.cache.set(key, (slot = this.build(s, m, q, g)));
    return [this.pages[slot >> 10], (slot & 31) * CW, ((slot >> 5) & 31) * CH];
  }

  private build(s: number, m: number, q: number, g: number[]): number {
    const slot = this.n++;
    if ((slot & 1023) === 0) { const c = document.createElement('canvas'); c.width = c.height = 1024; this.pages.push(c); }
    const { d, W, F1, F0, edge, m2f } = this.src[s], f = m2f[m];
    const qx = q & 1, qy = q >> 1, ox = (qx - qy) * 16 + 16, oy = (qx + qy) * 8;
    const v = g.map((k) => k / 8);
    const first = (x: number, y: number) => {
      const dx = (x + 0.5 - 16) / 16, dy = (y + 0.5) / 8, a = (dx + dy) / 2, b = (dy - dx) / 2;
      return v[0] * (1 - a) * (1 - b) + v[1] * a * (1 - b) + v[2] * (1 - a) * b + v[3] * a * b >= 0.5;
    };
    const g2 = this.pages[slot >> 10].getContext('2d')!, im = g2.createImageData(CW, CH), o = im.data;
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      let from = -1;
      if (inTop(x, y, 16, 8)) {
        const c = first(x, y);
        const isEdge = c !== first(x + 1, y) || c !== first(x - 1, y) || c !== first(x, y + 1) || c !== first(x, y - 1);
        if (isEdge && edge.length && !c) from = edge[((((x + ox) * 73856093) ^ ((y + oy) * 19349663)) >>> 0) % edge.length];
        else from = ((y + oy) * W + (c ? F1 : F0) * TW + x + ox) * 4;
      } else {
        const sp = sideSrc(x, y);
        if (sp) from = (sp[1] * W + f * TW + sp[0]) * 4;
      }
      if (from >= 0) for (let k = 0; k < 4; k++) o[(y * CW + x) * 4 + k] = d[from + k];
    }
    g2.putImageData(im, (slot & 31) * CW, ((slot >> 5) & 31) * CH);
    return slot;
  }
}
