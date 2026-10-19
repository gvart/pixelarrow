/**
 * PixelLab region art (W-20) baked into the same chunk canvases as the greybox (./terrain.ts):
 * autotiled terrain (./autotile.ts) stacked by height, cliff strips under drops of more than one
 * level, and, for the zoomed-out levels, the map objects baked in depth order. Zoomed in, objects
 * are live sprites (./objects.ts) so units sort and fade with them.
 *
 * Tiles are 64 x 48 frames (a 64 x 32 diamond over a 16 px earth side) anchored at the top vertex.
 * Painted back to front (x + y ascending), each tile's own side covers a one-level step; a deeper
 * drop gets cliff strips (earth, or rock under rock) every 16 px below it. Any overflow below the
 * wall's foot lands on tiles in front, which are painted later. Water lies flush with its banks
 * (IsoMap.z). Scaled-down bakes paint at 1:1 into a scratch canvas and downscale it, so
 * no seams open between tiles.
 */
import { autotile, VARIANT, type TilesMeta } from './autotile';
import type { RegionData } from '../types';
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

export class ArtBaker {
  /** Surface level per tile (IsoMap.z). */
  readonly zs: Float32Array;
  private code: Int16Array;
  private zone: Uint8Array;
  /** Objects by the x + y row of their foot tile. */
  private rows: Placed[][];
  private tmp: HTMLCanvasElement | null = null;

  constructor(readonly r: RegionData, readonly iso: IsoMap, readonly art: WarArt, private grey: TerrainBaker) {
    this.zs = iso.z;
    this.code = autotile(r, this.zs, art.tiles).code;
    this.zone = new Uint8Array(r.w * r.h);
    const mark = (b: { x: number; y: number; w: number; h: number }, k: number) => {
      for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) this.zone[y * r.w + x] = k;
    };
    r.noBuild.forEach((b) => mark(b, 1));
    r.entries.forEach((b) => mark(b, 2));
    this.rows = Array.from({ length: r.w + r.h - 1 }, () => []);
    const defs = new Map(art.defs.map((d) => [d.id, d]));
    for (const o of r.objects ?? []) {
      const def = defs.get(o.id), tx = Math.floor(o.x), ty = Math.floor(o.y);
      if (!def || tx < 0 || ty < 0 || tx >= r.w || ty >= r.h) continue;
      this.rows[tx + ty].push({ def, img: art.objImg.get(o.id)!, sx: Math.round(iso.sx(o.x, o.y)), sy: Math.round(iso.sy(o.x, o.y, this.zs[ty * r.w + tx])) });
    }
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

  /** Paint the world rect at 1:1 (ctx is translated so world px are canvas px). */
  private paint(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, o: BakeOpts, objects: boolean): void {
    const { r, iso, art, zs, code } = this;
    ctx.imageSmoothingEnabled = false;
    const umin = Math.floor((x0 - iso.OX) / HW) - 1, umax = Math.ceil((x0 + w - iso.OX) / HW) + 1;
    const vmin = Math.floor((y0 - iso.OY - 2 * HH + ZBASE * LH) / HH) - 1;
    const vmax = Math.ceil((y0 + h - iso.OY + 8 * LH) / HH) + 2;
    const vmaxO = objects ? vmax + 26 : vmax; // the tallest object stands ~400 px over its foot
    const zt = (x: number, y: number) => (x < 0 || y < 0 || x >= r.w || y >= r.h ? ZBASE : zs[y * r.w + x]);
    const sheets = art.sheets, variants = art.variants;
    for (let v = Math.max(0, vmin); v <= Math.min(r.w + r.h - 2, vmaxO); v++) {
      if (v <= vmax) {
        let u = Math.max(umin, -v, v - 2 * (r.h - 1));
        if ((u + v) & 1) u++;
        for (; u <= Math.min(umax, v, 2 * (r.w - 1) - v); u += 2) {
          const x = (u + v) / 2, y = (v - u) / 2, i = y * r.w + x, c = code[i];
          if (c < 0) continue;
          const z = zs[i], tx = iso.OX + u * HW - HW, ty = Math.round(iso.OY + v * HH - z * LH);
          const drop = z - Math.min(zt(x + 1, y), zt(x, y + 1));
          if (drop > 1) {
            const cl = r.terrain[i] === 'rock' ? art.cliffs.rock : art.cliffs.earth;
            for (let k = Math.ceil(drop) - 1; k >= 1; k--) ctx.drawImage(cl, tx, ty + 16 + 16 * k);
          }
          if (c >= VARIANT) ctx.drawImage(variants[(c - VARIANT) >> 4], ((c - VARIANT) & 15) * 64, 0, 64, 48, tx, ty, 64, 48);
          else ctx.drawImage(sheets[c >> 4], (c & 15) * 64, 0, 64, 48, tx, ty, 64, 48);
        }
      }
      if (!objects) continue;
      for (const p of this.rows[v]) {
        const d = p.def, ox = p.sx - d.anchor.x, oy = p.sy - d.anchor.y;
        if (ox > x0 + w || ox + d.w < x0 || oy > y0 + h || oy + d.h < y0) continue;
        ctx.drawImage(p.img, ox, oy);
      }
    }
    if (o.zones || o.grid) this.lines(ctx, umin, umax, vmin, vmax, o);
  }

  /** Zone borders and the tile grid over the art. */
  private lines(ctx: CanvasRenderingContext2D, umin: number, umax: number, vmin: number, vmax: number, o: BakeOpts): void {
    const { r, iso, zs, zone } = this;
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
          const tx = iso.OX + u * HW, ty = Math.round(iso.OY + v * HH - zs[i] * LH) + 0.5;
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
