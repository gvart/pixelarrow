/**
 * PixelLab region art (W-20) baked into the same chunk canvases as the greybox (./terrain.ts):
 * autotiled terrain (./autotile.ts) stacked by height, cliff strips under drops of more than one
 * level, and, for the zoomed-out levels, the map objects baked in depth order. Zoomed in, objects
 * are live sprites (./objects.ts) so units sort and fade with them.
 *
 * The ground is the visual layer's 1 m cells (IsoMap.fk / fz), autotiled on their own grid and drawn
 * as 32 x 32 frames (a 32 x 16 diamond over a 16 px side) cut from the 2 m tiles (./fineArt.ts),
 * anchored at the top vertex. Painted back to front (x + y ascending), each cell's own side covers a
 * one-level step; a deeper drop gets cliff strips (earth, crag rock under rock and snow) every 16 px
 * below it, their columns and shades varied so tall mountain walls do not band. Any overflow below
 * the wall's foot lands on cells in front, which are painted later. Water lies flush with its banks.
 * Scaled-down bakes paint at 1:1 into a scratch canvas and downscale it, so no seams open.
 */
import { autotile, hash, VARIANT, type TilesMeta } from './autotile';
import type { RegionData, TerrainKind } from '../types';
import { KINDS } from '../regions/visual';
import { buildFineArt, OFFS, SmoothFrames, type FineArt } from './fineArt';
import { HH, HW, IsoMap, LH, ZBASE } from './iso';
import type { BakeOpts, TerrainBaker } from './terrain';

export interface ObjDef { id: string; kind: string; file: string; w: number; h: number; metres: number; anchor: { x: number; y: number } }
export interface WarArt {
  tiles: TilesMeta;
  sheets: HTMLImageElement[];
  variants: HTMLImageElement[];
  cliffs: Record<string, HTMLImageElement>;
  defs: ObjDef[];
  objImg: Map<string, HTMLImageElement>;
}

const PIECE = 2048;

/** Fetch tiles.json, objects.json and every image they name (relative to the page: public/war/). */
export async function loadArt(base = 'war/'): Promise<WarArt> {
  const json = (p: string) => fetch(base + p).then((r) => r.json());
  const img = (p: string) => { const im = new Image(); im.src = base + p; return im.decode().then(() => im); };
  const [tiles, objs] = await Promise.all([json('tiles/tiles.json'), json('objects/objects.json')]);
  const T = tiles as TilesMeta;
  const defs = objs.objects as ObjDef[];
  const [sheets, variants, cliffs, oi] = await Promise.all([
    Promise.all(T.sheets.map((s) => img('tiles/' + s.file))),
    Promise.all((T.variants ?? []).map((v) => img('tiles/' + v.file))),
    Promise.all((T.cliffs ?? []).map((c) => img('tiles/' + c.file))),
    Promise.all(defs.map((d) => img('objects/' + d.file))),
  ]);
  return {
    tiles: T, sheets, variants, defs,
    cliffs: Object.fromEntries((T.cliffs ?? []).map((c, i) => [c.id, cliffs[i]])),
    objImg: new Map(defs.map((d, i) => [d.id, oi[i]])),
  };
}

interface Placed { def: ObjDef; img: HTMLImageElement; sx: number; sy: number }

const FW = 16, FH = 8; // half the 1 m cell diamond
const ROCKY = new Set([KINDS.indexOf('rock'), KINDS.indexOf('snow')]);

export class ArtBaker {
  /** Per visual cell: atlas frame (sheet * 64 + mask * 4 + quadrant, or VARIANT + variant * 64 + frame * 4 + quadrant), -1 none. */
  private code: Int32Array;
  private fine: FineArt;
  private smooth: SmoothFrames;
  /** Per transition cell: its corner values in eighths, 4 bits each (NW, NE, SW, SE); 0xffff = draw the mask frame. */
  private corners: Uint16Array;
  private zone: Uint8Array;
  /** Objects by the x + y row of the visual cell under their foot. */
  private rows: Placed[][];
  private tmp: HTMLCanvasElement | null = null;

  constructor(readonly r: RegionData, readonly iso: IsoMap, readonly art: WarArt, private grey: TerrainBaker) {
    this.fine = buildFineArt(art);
    this.smooth = new SmoothFrames(art);
    this.code = this.fineCodes();
    this.corners = this.cornerValues();
    this.zone = new Uint8Array(r.w * r.h);
    const mark = (b: { x: number; y: number; w: number; h: number }, k: number) => {
      for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) this.zone[y * r.w + x] = k;
    };
    r.noBuild.forEach((b) => mark(b, 1));
    r.entries.forEach((b) => mark(b, 2));
    this.rows = Array.from({ length: iso.fw + iso.fh - 1 }, () => []);
    const defs = new Map(art.defs.map((d) => [d.id, d]));
    for (const o of r.objects ?? []) {
      const def = defs.get(o.id), tx = Math.floor(o.x), ty = Math.floor(o.y);
      if (!def || tx < 0 || ty < 0 || tx >= r.w || ty >= r.h) continue;
      this.rows[Math.floor(2 * o.x) + Math.floor(2 * o.y)].push({ def, img: art.objImg.get(o.id)!, sx: Math.round(iso.sx(o.x, o.y)), sy: Math.round(iso.sy(o.x, o.y, iso.zAt(o.x, o.y))) });
    }
  }

  /** Autotile the visual cells; full cells of one 2 m tile share a variant frame (variants keep only the tile's outer band). */
  private fineCodes(): Int32Array {
    const { iso, art } = this, { fw, fh, fk } = iso, n = fw * fh;
    const terrain: TerrainKind[] = new Array(n), water: (0 | 1 | 2)[] = new Array(n);
    for (let j = 0; j < n; j++) {
      const k = KINDS[fk[j]];
      water[j] = k === 'deep' ? 2 : k === 'shallow' ? 1 : 0;
      terrain[j] = water[j] ? 'dirt' : (k as TerrainKind);
    }
    const cells: RegionData = { id: 'cells', name: 'cells', w: fw, h: fh, height: [], terrain, water, entries: [], noBuild: [] };
    const raw = autotile(cells, iso.fz, art.tiles).code, code = new Int32Array(n);
    const vars = art.tiles.variants ?? [];
    for (let fy = 0; fy < fh; fy++) for (let fx = 0; fx < fw; fx++) {
      const j = fy * fw + fx, c = raw[j], q = (fy & 1) * 2 + (fx & 1);
      if (c < 0) { code[j] = -1; continue; }
      if (c < VARIANT) { code[j] = (c >> 4) * 64 + (c & 15) * 4 + q; continue; }
      const v = (c - VARIANT) >> 4, x0 = fx & ~1, y0 = fy & ~1;
      let whole = true;
      for (let k = 0; k < 4; k++) { const r = raw[(y0 + (k >> 1)) * fw + x0 + (k & 1)]; if (r < VARIANT || (r - VARIANT) >> 4 !== v) whole = false; }
      const f = whole ? hash(fx >> 1, fy >> 1) % vars[v].frames : 0;
      code[j] = VARIANT * 64 + v * 64 * 16 + f * 4 + q;
    }
    return code;
  }

  /** As TerrainBaker.bake; `objects` bakes the map objects in too (the zoomed-out levels). */
  bake(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, scale: number, o: BakeOpts, cx = 0, cy = 0, objects = false): void {
    if (o.ov !== 'none') return this.grey.bake(ctx, x0, y0, w, h, scale, o, cx, cy);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const cw = Math.ceil(w * scale), ch = Math.ceil(h * scale);
    ctx.clearRect(cx, cy, cw, ch);
    if (scale === 1) {
      ctx.beginPath(); ctx.rect(cx, cy, cw, ch); ctx.clip();
      ctx.translate(cx - x0, cy - y0);
      this.paint(ctx, x0, y0, w, h, o, objects);
    } else {
      const t = (this.tmp ??= document.createElement('canvas'));
      if (t.width !== PIECE) { t.width = PIECE; t.height = PIECE; }
      const tc = t.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      for (let py = 0; py < h; py += PIECE) for (let px = 0; px < w; px += PIECE) {
        const pw = Math.min(PIECE, w - px), ph = Math.min(PIECE, h - py);
        tc.setTransform(1, 0, 0, 1, 0, 0);
        tc.clearRect(0, 0, PIECE, PIECE);
        tc.save();
        tc.beginPath(); tc.rect(0, 0, Math.ceil(pw), Math.ceil(ph)); tc.clip();
        tc.translate(-(x0 + px), -(y0 + py));
        this.paint(tc, x0 + px, y0 + py, pw, ph, o, objects);
        tc.restore();
        ctx.drawImage(t, 0, 0, Math.ceil(pw), Math.ceil(ph), cx + px * scale, cy + py * scale, Math.ceil(pw) * scale, Math.ceil(ph) * scale);
      }
    }
    ctx.restore();
  }

  /**
   * Corner values of the transition cells: the Gaussian-weighted share of the sheet's first terrain
   * among the same-level cells round each corner (radius 2 cells), held on the mask's side of 0.5.
   * The shallow band the autotiler lays along every shore is not in the cells: against land all water
   * counts as shallow; between shallow and deep, land counts as shallow and weighs SHORE times, which
   * moves that edge out into the water by about a cell.
   */
  private cornerValues(): Uint16Array {
    const { iso, art, code } = this, { fw, fh, fk, fz } = iso, out = new Uint16Array(fw * fh).fill(0xffff);
    const SH = KINDS.indexOf('shallow'), DP = KINDS.indexOf('deep'), SHORE = 3;
    // per sheet: the weight of each cell kind toward its first terrain (+) or its second (-)
    const kw = art.tiles.sheets.map((s) => {
      const A = KINDS.indexOf(s.first as never), B = KINDS.indexOf(s.second as never), w = new Float32Array(KINDS.length);
      w[A] = 1; w[B] = -1;
      if (A === SH && B === DP) { for (let t = 0; t < KINDS.length; t++) if (t !== SH && t !== DP) w[t] = SHORE; }
      else if (B === SH) w[DP] = -1;
      else if (A === SH) w[DP] = 1;
      return w;
    });
    const W: number[] = [];
    for (let j = -2; j <= 1; j++) for (let i = -2; i <= 1; i++) W.push(Math.exp(-((i + 0.5) ** 2 + (j + 0.5) ** 2) / (2 * 1.3 * 1.3)));
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const c = code[y * fw + x];
      if (c < 0 || c >= VARIANT * 64) continue;
      const s = c >> 6, m = (c & 63) >> 2;
      if (m === 0 || m === 15) continue;
      const kws = kw[s], z = fz[y * fw + x];
      let packed = 0;
      for (let k = 0; k < 4; k++) {
        const vx = x + (k & 1), vy = y + (k >> 1);
        let wa = 0, wb = 0, n = 0;
        for (let j = -2; j <= 1; j++) for (let i = -2; i <= 1; i++, n++) {
          const cx = vx + i, cy = vy + j;
          if (cx < 0 || cy < 0 || cx >= fw || cy >= fh || Math.abs(fz[cy * fw + cx] - z) > 0.5) continue;
          const q = kws[fk[cy * fw + cx]];
          if (q > 0) wa += q * W[n]; else if (q < 0) wb -= q * W[n];
        }
        let g = wa + wb > 0 ? Math.round((8 * wa) / (wa + wb)) : 4;
        g = m & (8 >> k) ? Math.max(5, g) : Math.min(3, g);
        packed |= g << (4 * k);
      }
      out[y * fw + x] = packed;
    }
    return out;
  }

  /** Paint the world rect at 1:1 (ctx is translated so world px are canvas px). */
  private paint(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, o: BakeOpts, objects: boolean): void {
    const { iso, code, fine } = this, { fw, fh, fz, fk } = iso;
    ctx.imageSmoothingEnabled = false;
    const umin = Math.floor((x0 - iso.OX) / FW) - 1, umax = Math.ceil((x0 + w - iso.OX) / FW) + 1;
    const vmin = Math.floor((y0 - iso.OY - 4 * FH + ZBASE * LH) / FH) - 1;
    const vmax = Math.ceil((y0 + h - iso.OY + iso.top * LH) / FH) + 2;
    const vmaxO = objects ? vmax + 52 : vmax; // the tallest object stands ~400 px over its foot
    const zt = (x: number, y: number) => (x < 0 || y < 0 || x >= fw || y >= fh ? ZBASE : fz[y * fw + x]);
    const cl = fine.cliffs, earth = cl.earth, crag = cl.crag ?? cl.rock ?? earth, NO = OFFS.length;
    for (let v = Math.max(0, vmin); v <= Math.min(fw + fh - 2, vmaxO); v++) {
      if (v <= vmax) {
        let u = Math.max(umin, -v, v - 2 * (fh - 1));
        if ((u + v) & 1) u++;
        for (; u <= Math.min(umax, v, 2 * (fw - 1) - v); u += 2) {
          const x = (u + v) / 2, y = (v - u) / 2, i = y * fw + x, c = code[i];
          if (c < 0) continue;
          const z = fz[i], ty = Math.round(iso.OY + v * FH - z * LH);
          if (ty > y0 + h) continue;
          const drop = z - Math.min(zt(x + 1, y), zt(x, y + 1));
          if (ty + 2 * LH + Math.max(0, drop - 1) * LH < y0) continue;
          const tx = iso.OX + u * FW - FW;
          if (drop > 1) {
            const img = ROCKY.has(fk[i]) ? crag : earth, n = Math.ceil(drop) - 1;
            for (let k = n; k >= 1; k--) {
              const h = hash(x, y, k), t = k / n + ((h >> 8) % 100) / 400; // darker toward the foot, dithered so no band line shows
              const f = (t < 0.4 ? 0 : t < 0.75 ? 1 : 2) * NO + (h % NO);
              ctx.drawImage(img, f * 32, 0, 32, 24, tx, ty + FH + LH * k, 32, 24);
            }
          }
          if (c >= VARIANT * 64) {
            const r = c - VARIANT * 64, vi = Math.floor(r / 1024);
            ctx.drawImage(fine.variants[vi], (r % 1024) * 32, 0, 32, 32, tx, ty, 32, 32);
          } else if (this.corners[i] !== 0xffff) {
            const g = this.corners[i], [img, sx, sy] = this.smooth.frame(c >> 6, (c & 63) >> 2, c & 3, [g & 15, (g >> 4) & 15, (g >> 8) & 15, g >> 12]);
            ctx.drawImage(img, sx, sy, 32, 32, tx, ty, 32, 32);
          } else ctx.drawImage(fine.sheets[c >> 6], (c & 63) * 32, 0, 32, 32, tx, ty, 32, 32);
        }
      }
      if (!objects) continue;
      for (const p of this.rows[v] ?? []) {
        const d = p.def, ox = p.sx - d.anchor.x, oy = p.sy - d.anchor.y;
        if (ox > x0 + w || ox + d.w < x0 || oy > y0 + h || oy + d.h < y0) continue;
        ctx.drawImage(p.img, ox, oy);
      }
    }
    if (o.zones || o.grid) this.lines(ctx, Math.floor(umin / 2) - 1, Math.ceil(umax / 2) + 1, Math.floor(vmin / 2) - 1, Math.ceil(vmax / 2) + 1, o);
  }

  /** Zone borders and the tile grid over the art. */
  private lines(ctx: CanvasRenderingContext2D, umin: number, umax: number, vmin: number, vmax: number, o: BakeOpts): void {
    const { r, iso, zone } = this;
    ctx.lineWidth = 1;
    const zn = (x: number, y: number) => (x < 0 || y < 0 || x >= r.w || y >= r.h ? 0 : zone[y * r.w + x]);
    const seg = (ax: number, ay: number, bx: number, by: number) => { ctx.moveTo(ax, ay); ctx.lineTo(bx, by); };
    for (const pass of [0, 1, 2]) {
      if (pass === 0 && !o.grid) continue;
      if (pass > 0 && !o.zones) continue;
      ctx.beginPath();
      ctx.strokeStyle = pass === 0 ? 'rgba(0,0,0,0.28)' : pass === 2 ? 'rgba(255,224,112,0.8)' : 'rgba(255,255,255,0.45)';
      for (let v = Math.max(0, vmin); v <= Math.min(r.w + r.h - 2, vmax); v++) {
        let u = Math.max(umin, -v, v - 2 * (r.h - 1));
        if ((u + v) & 1) u++;
        for (; u <= Math.min(umax, v, 2 * (r.w - 1) - v); u += 2) {
          const x = (u + v) / 2, y = (v - u) / 2, i = y * r.w + x;
          const tx = iso.OX + u * HW, ty = Math.round(iso.OY + v * HH - iso.zf(2 * x, 2 * y) * LH) + 0.5;
          if (pass === 0) { seg(tx - HW, ty + HH, tx, ty); seg(tx, ty, tx + HW, ty + HH); continue; }
          const k = zone[i];
          if (k !== pass) continue;
          if (zn(x - 1, y) !== k) seg(tx - HW, ty + HH, tx, ty);
          if (zn(x, y - 1) !== k) seg(tx, ty, tx + HW, ty + HH);
          if (zn(x + 1, y) !== k) seg(tx + HW, ty + HH, tx, ty + 2 * HH);
          if (zn(x, y + 1) !== k) seg(tx, ty + 2 * HH, tx - HW, ty + HH);
        }
      }
      ctx.stroke();
    }
  }
}
