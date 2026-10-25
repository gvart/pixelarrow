/**
 * PixelLab region art (W-20) baked into the same chunk canvases as the greybox (./terrain.ts):
 * autotiled terrain (./autotile.ts) stacked by height, cliff strips under drops of more than one
 * level, and, for the zoomed-out levels, the map objects baked in depth order. Zoomed in, objects
 * are live sprites (./objects.ts) so units sort and fade with them.
 *
 * The ground is the visual layer's 1 m cells (IsoMap.fk / fz), autotiled on their own grid and drawn
 * as 32 x 32 frames (a 32 x 16 diamond over a 16 px side) cut from the 2 m tiles (./fineArt.ts),
 * anchored at the top vertex. Painted back to front (x + y ascending), each cell's own side covers a
 * SIDE (16 px) of a riser; the rest of it (a level is LH = 32 px) gets cliff strips (earth, crag rock under rock and
 * snow) every 16 px below it, their columns and shades varied so tall mountain walls do not band. Any overflow below
 * the wall's foot lands on cells in front, which are painted later. Water lies flush with its banks. One-level steps
 * are ramps (IsoMap.fc): a ramp cell's frame is drawn in two affine halves (above and below its W-E diagonal, the side
 * sheared with the lower one) through its corner levels, so the ground and its light run on across the slope unbroken.
 * Scaled-down bakes paint at 1:1 into a scratch canvas and downscale it, so no seams open.
 */
import { autotile, hash, VARIANT, type TilesMeta } from './autotile';
import type { RegionData, TerrainKind } from '../types';
import { decodeBiomes, KINDS } from '../regions/visual';
import { columnTops, type MassifDef, type Massifs } from './massifs';
import { buildFineArt, SmoothFrames, type CliffRoles, type FineArt } from './fineArt';
import { HH, HW, IsoMap, LH, SIDE, ZBASE } from './iso';
import type { BakeOpts } from './terrain';
import { FOAM_H, FOAM_NX, FOAM_NY, FOAM_PX, FOAM_PY, FOAM_W, foamSprite, relief, RELIEF_FILL, SHADOW_H, SHADOW_W, treeShadow } from './relief';
import { relightTree } from './treeLight';
import { PeakPainter } from './peaks';
import { wallTexture, type Stone } from './rockFace';

export interface ObjDef { id: string; kind: string; file: string; w: number; h: number; metres: number; anchor: { x: number; y: number }; footprint?: [number, number]; massif?: string; role?: string }
/** A tile set: the global sheets plus one biome's (its variants replace the global ones per terrain), as indices into WarArt's merged lists. */
export interface TileSet { name: string; tiles: TilesMeta; sheetIx: number[]; varIx: number[]; earth: string; crag: string; snow?: string; ice?: string }
export interface WarArt {
  /** Every sheet and variant of every set (fallback: the global one). */
  tiles: TilesMeta;
  sheets: HTMLImageElement[];
  variants: HTMLImageElement[];
  cliffs: Record<string, HTMLImageElement>;
  /** W-51 multi-frame cliffs: frames of 64 px in a row and their roles. */
  cliffMeta?: Record<string, { frames?: number; roles?: CliffRoles }>;
  /** Global objects, then each biome's as `<biome>/<id>`. */
  defs: ObjDef[];
  objImg: Map<string, HTMLImageElement>;
  /** [0] the global set, then one per biome. */
  sets: TileSet[];
  /** The mountains' massif pieces (./massifs.ts). */
  massifs: MassifDef[];
}

/** The biome libraries under public/war/biomes/. */
export const BIOMES = ['elaia', 'kyrene', 'mountains', 'dodona'] as const;
const PIECE = 2048;

interface TilesJson extends TilesMeta { cliffs?: { id: string; file: string; frames?: number; roles?: CliffRoles }[] }

/** Fetch the global and every biome's tiles.json and objects.json and every image they name (relative to the page: public/war/). */
export async function loadArt(base = 'war/'): Promise<WarArt> {
  const json = (p: string) => fetch(base + p).then((r) => r.json());
  // load events, not decode(): decoding hundreds of images at once rejects spuriously ("The source image cannot be
  // decoded"), always so in Playwright's bundled headless Chromium
  const img = (p: string) => new Promise<HTMLImageElement>((ok, fail) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = () => fail(new Error(`${p} failed to load`));
    im.src = base + p;
  });
  const libs = [{ name: 'global', tiles: 'tiles/', objs: 'objects/' }, ...BIOMES.map((b) => ({ name: b as string, tiles: `biomes/${b}/`, objs: `biomes/${b}/` }))];
  const metas = await Promise.all(libs.map((l) => Promise.all([json(l.tiles + 'tiles.json') as Promise<TilesJson>, json(l.objs + 'objects.json') as Promise<{ objects: ObjDef[] }>])));
  const sheets: TilesMeta['sheets'] = [], variants: NonNullable<TilesMeta['variants']> = [], cliffs: { id: string; file: string; frames?: number; roles?: CliffRoles }[] = [], defs: ObjDef[] = [];
  const sets: TileSet[] = [];
  libs.forEach((l, k) => {
    const [T, O] = metas[k], s0 = sheets.length, v0 = variants.length;
    sheets.push(...T.sheets.map((s) => ({ ...s, file: l.tiles + s.file })));
    variants.push(...(T.variants ?? []).map((v) => ({ ...v, file: l.tiles + v.file })));
    cliffs.push(...(T.cliffs ?? []).map((c) => ({ ...c, file: l.tiles + c.file })));
    defs.push(...O.objects.map((d) => ({ ...d, id: k ? `${l.name}/${d.id}` : d.id, file: l.objs + d.file })));
    const own = new Set((T.variants ?? []).map((v) => v.terrain)), g = sets[0];
    const sheetIx = k ? [...g.sheetIx, ...T.sheets.map((_, i) => s0 + i)] : T.sheets.map((_, i) => i);
    const varIx = k ? [...g.varIx.filter((i) => !own.has(variants[i].terrain)), ...(T.variants ?? []).map((_, i) => v0 + i)] : (T.variants ?? []).map((_, i) => i);
    const tiles = { sheets: sheetIx.map((i) => sheets[i]), variants: varIx.map((i) => variants[i]), fallback: T.fallback };
    // W-51: the biome's own cliff material (granite, sandstone, limestone: its first cliff) under every drop, snow-ledged
    // granite under snow and drifts, ice-glazed at the foot over the glacier; the global set: crag under rock, earth else
    const has = (id: string) => (T.cliffs ?? []).some((c) => c.id === id);
    const mine = k && T.cliffs?.length ? T.cliffs[0].id : null;
    sets.push({ name: l.name, tiles, sheetIx, varIx, earth: mine ?? 'earth', crag: mine && (T.cliffs![0].frames ?? 0) > 1 ? mine : 'crag', snow: has('granite-snow') ? 'granite-snow' : undefined, ice: has('granite-ice') ? 'granite-ice' : undefined });
  });
  const [si0, vi0, ci, oi] = await Promise.all([
    Promise.all(sheets.map((s) => img(s.file))),
    Promise.all(variants.map((v) => img(v.file))),
    Promise.all(cliffs.map((c) => img(c.file))),
    Promise.all(defs.map((d) => img(d.file))),
  ]);
  // the desert's red rock warmed from mud brown to the red and ochre of its walls (./rockFace.ts sandstone)
  const warm = (file: string, im: HTMLImageElement) => (file.startsWith('biomes/kyrene/') && file.includes('redrock') ? reimage(redden(im)) : im);
  const [si, vi] = await Promise.all([Promise.all(si0.map((im, i) => warm(sheets[i].file, im))), Promise.all(vi0.map((im, i) => warm(variants[i].file, im)))]);
  // trees relit for the NW light (./treeLight.ts), back as images so every user keeps one kind of source
  const lit = await Promise.all(defs.map((d, i) => (d.kind === 'tree' ? reimage(relightTree(oi[i])) : oi[i])));
  const objImg = new Map(defs.map((d, i) => [d.id, lit[i]]));
  return {
    tiles: { sheets, variants, fallback: metas[0][0].fallback }, sheets: si, variants: vi, defs, objImg, sets,
    cliffs: Object.fromEntries(cliffs.map((c, i) => [c.id, ci[i]])),
    cliffMeta: Object.fromEntries(cliffs.filter((c) => c.frames).map((c) => [c.id, { frames: c.frames, roles: c.roles }])),
    massifs: defs.filter((d) => d.kind === 'massif' && d.footprint).map((d) => ({ ...d, footprint: d.footprint!, top: columnTops(objImg.get(d.id)!) })),
  };
}
/** Red-brown pixels pushed toward terracotta red, their light ones toward ochre; sand, scrub and shade kept. */
function redden(im: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = im.width; c.height = im.height;
  const g = c.getContext('2d')!;
  g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
  for (let o = 0; o < p.length; o += 4) {
    const r = p[o], gr = p[o + 1], b = p[o + 2];
    if (!p[o + 3] || r < gr * 1.18 || r < b * 1.15 || r < 40) continue;
    const l = (r + gr + b) / 3, t = Math.min(1, l / 150);
    p[o] = Math.min(255, r * 1.32 + 14);
    p[o + 1] = Math.min(255, gr * (1.0 + 0.25 * t) + 4);
    p[o + 2] = Math.min(255, b * 0.9);
  }
  g.putImageData(d, 0, 0);
  return c;
}
/** A canvas as a decoded image. */
function reimage(c: HTMLCanvasElement): Promise<HTMLImageElement> {
  const im = new Image();
  im.src = c.toDataURL('image/png');
  return im.decode().then(() => im);
}
interface Placed { def: ObjDef; img: HTMLImageElement; sx: number; sy: number; shade?: number }

const FW = 16, FH = 8; // half the 1 m cell diamond
/** The wall stone per tile set (./rockFace.ts). */
const STONES: Record<string, Stone> = { kyrene: 'sandstone', elaia: 'limestone', mountains: 'granite' };
/** One repeating pattern per wall stone (patterns are not tied to the context that made them). */
const WALL_PAT: Partial<Record<Stone, CanvasPattern>> = {};
const ROCKY = new Set([KINDS.indexOf('rock'), KINDS.indexOf('snow'), KINDS.indexOf('drift')]);
const SNOWY = new Set([KINDS.indexOf('snow'), KINDS.indexOf('drift')]);
const WET = new Set([KINDS.indexOf('shallow'), KINDS.indexOf('deep')]);
/** Zoomed out (the baked levels) objects shorter than this (m) are left out, but crops (a sown plot reads as a field). */
export const LOD_METRES = 2;

export class ArtBaker {
  /** Per visual cell: atlas frame (sheet * 64 + mask * 4 + quadrant, or VARIANT + variant * 64 + frame * 4 + quadrant), -1 none. */
  private code: Int32Array;
  private fine: FineArt;
  private smooth: SmoothFrames;
  /** Per transition cell: its corner values in eighths, 4 bits each (NW, NE, SW, SE); 0xffff = draw the mask frame. */
  private corners: Uint16Array;
  private zone: Uint8Array;
  /** Per tile: its tile set (art.sets index). */
  private setOf: Uint8Array;
  /** Objects and massifs by the x + y row of the visual cell they are drawn after. */
  private rows: Placed[][];
  /** Rows of cells an object may reach above its foot. */
  private reach: number;
  private tmp: HTMLCanvasElement | null = null;
  /** Canvas px per world px of the bake in progress (the tint's line width). */
  private scale = 1;
  /** The paint's own transform (a translation), restored after each warped frame. */
  private base: DOMMatrix | null = null;
  /** Per visual cell: its baked light (./relief.ts RELIEF_FILL code, 0 none). */
  private shade: Uint8Array;
  /** Per visual cell: the sides a shore water cell meets land on (./relief.ts FOAM_*). */
  private foam: Uint8Array;
  /** Tree shadows by the row they are drawn after (world px rects of ./relief.ts treeShadow). */
  private shadows: { x: number; y: number; w: number; h: number }[][];
  /** The procedural peaks over the flat mountain (./peaks.ts), painted with the rows. */
  private peaks: PeakPainter | null;

  constructor(readonly r: RegionData, readonly iso: IsoMap, readonly art: WarArt, massifs: Massifs | null = null) {
    this.fine = buildFineArt(art);
    this.peaks = iso.peaks ? new PeakPainter(iso.peaks, iso.OX, iso.OY) : null;
    this.smooth = new SmoothFrames(art);
    this.setOf = new Uint8Array(r.w * r.h);
    if (r.biomes) {
      const b = decodeBiomes(r.biomes.rle, r.w * r.h), map = r.biomes.names.map((nm) => Math.max(0, art.sets.findIndex((s) => s.name === nm)));
      for (let i = 0; i < b.length; i++) this.setOf[i] = map[b[i]];
    }
    this.code = this.fineCodes();
    this.corners = this.cornerValues();
    this.zone = new Uint8Array(r.w * r.h);
    const mark = (b: { x: number; y: number; w: number; h: number }, k: number) => {
      for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) this.zone[y * r.w + x] = k;
    };
    r.noBuild.forEach((b) => mark(b, 1));
    r.entries.forEach((b) => mark(b, 2));
    const nRows = iso.fw + iso.fh - 1;
    this.rows = Array.from({ length: nRows }, () => []);
    let maxH = 0;
    const defs = new Map(art.defs.map((d) => [d.id, d]));
    for (const o of r.objects ?? []) {
      const def = defs.get(o.id), tx = Math.floor(o.x), ty = Math.floor(o.y);
      if (!def || def.kind === 'massif' || (def.metres < LOD_METRES && def.kind !== 'crop') || tx < 0 || ty < 0 || tx >= r.w || ty >= r.h || massifs?.covers(o.x, o.y, def.metres) || iso.peakAt(o.x, o.y) > 0.3) continue;
      // past the massifs it stands in front of
      const v = massifs ? Math.max(Math.floor(2 * o.x) + Math.floor(2 * o.y), Math.floor(2 * massifs.depth(o.x, o.y))) : Math.floor(2 * o.x) + Math.floor(2 * o.y);
      this.rows[Math.min(nRows - 1, v)].push({ def, img: art.objImg.get(o.id)!, sx: Math.round(iso.sx(o.x, o.y)), sy: Math.round(iso.sy(o.x, o.y, iso.zAt(o.x, o.y))) });
      maxH = Math.max(maxH, def.h);
    }
    // a massif after the last cell of its footprint (the one at its south vertex)
    for (const m of massifs?.list ?? []) {
      const xs = m.x0 + m.fw, ys = m.y0 + m.fh, z = iso.zf(2 * xs - 1, 2 * ys - 1);
      this.rows[2 * m.v - 2].push({ def: m.def, img: art.objImg.get(m.def.id)!, shade: m.shade, sx: Math.round(iso.sx(xs, ys)), sy: Math.round(iso.sy(xs, ys, z)) });
      maxH = Math.max(maxH, m.def.h);
    }
    this.reach = Math.ceil(maxH / FH) + 2;
    // tree shadows on the ground at every zoom (the live tree sprites stand over the baked ground), drawn after the row
    // of their front edge so the ground in front does not cut them
    this.shadows = Array.from({ length: nRows }, () => []);
    for (const o of r.objects ?? []) {
      const def = defs.get(o.id);
      if (!def || (def.kind !== 'tree' && def.kind !== 'bush') || def.metres < 1 || massifs?.covers(o.x, o.y, def.metres) || iso.peakAt(o.x, o.y) > 0.3) continue;
      const cw = def.w * (def.kind === 'tree' ? 0.85 : 0.7), L = (cw / 64) * 0.5, w = cw * 1.5, h = (w * SHADOW_H) / SHADOW_W;
      const sx = iso.sx(o.x + L, o.y), sy = iso.sy(o.x + L, o.y, iso.zAt(o.x, o.y));
      const v = Math.min(nRows - 1, Math.floor(2 * (o.x + o.y + L) + w / 40));
      this.shadows[v].push({ x: Math.round(sx - w / 2), y: Math.round(sy - h / 2), w: Math.round(w), h: Math.round(h) });
    }
    ({ code: this.shade, foam: this.foam } = relief(iso.fw, iso.fh, iso.fk, iso.fz));
  }

  /**
   * Autotile the visual cells, each with its tile's set (a biome's set over the cells of that biome,
   * autotiled over their bounding box); full cells of one 2 m tile share a variant frame (variants
   * keep only the tile's outer band).
   */
  private fineCodes(): Int32Array {
    const { iso, art, r, setOf } = this, { fw, fh, fk } = iso, n = fw * fh, M = 6;
    const raw = new Int32Array(n).fill(-1), code = new Int32Array(n);
    art.sets.forEach((set, si) => {
      let x0 = r.w, y0 = r.h, x1 = -1, y1 = -1;
      for (let i = 0; i < setOf.length; i++) if (setOf[i] === si) {
        const x = i % r.w, y = (i / r.w) | 0;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      if (x1 < 0) return;
      const fx0 = Math.max(0, 2 * x0 - M), fy0 = Math.max(0, 2 * y0 - M), cw = Math.min(fw, 2 * x1 + 2 + M) - fx0, ch = Math.min(fh, 2 * y1 + 2 + M) - fy0;
      const terrain: TerrainKind[] = new Array(cw * ch), water: (0 | 1 | 2)[] = new Array(cw * ch), z = new Float32Array(cw * ch);
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        const j = (fy0 + y) * fw + fx0 + x, k = KINDS[fk[j]], c = y * cw + x;
        water[c] = k === 'deep' ? 2 : k === 'shallow' ? 1 : 0;
        terrain[c] = water[c] ? 'dirt' : (k as TerrainKind);
        z[c] = iso.fz[j];
      }
      const cells: RegionData = { id: 'cells', name: 'cells', w: cw, h: ch, height: [], terrain, water, entries: [], noBuild: [] };
      // corners on the ramps' surface (NW, NE, SW, SE: IsoMap.fc's N, E, W, S)
      const Q = [0, 1, 3, 2], zc = (c: number, k: number) => iso.fc[4 * ((fy0 + ((c / cw) | 0)) * fw + fx0 + (c % cw)) + Q[k]];
      const sub = autotile(cells, z, set.tiles, zc).code;
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        const fx = fx0 + x, fy = fy0 + y;
        if (setOf[(fy >> 1) * r.w + (fx >> 1)] !== si) continue;
        const c = sub[y * cw + x];
        raw[fy * fw + fx] = c < 0 ? -1 : c < VARIANT ? set.sheetIx[c >> 4] * 16 + (c & 15) : VARIANT + set.varIx[(c - VARIANT) >> 4] * 16 + ((c - VARIANT) & 15);
      }
    });
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
    this.scale = scale;
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
    const { iso, code, fine } = this, { fw, fh, fz, fk, fc, ramp } = iso;
    ctx.imageSmoothingEnabled = false;
    this.base = ctx.getTransform();
    // corner q (N, E, S, W) of cell (x, y); ZBASE off the map
    const cn = (x: number, y: number, q: number) => (x < 0 || y < 0 || x >= fw || y >= fh ? ZBASE : fc[4 * (y * fw + x) + q]);
    const umin = Math.floor((x0 - iso.OX) / FW) - 1, umax = Math.ceil((x0 + w - iso.OX) / FW) + 1;
    const vmin = Math.floor((y0 - iso.OY - 4 * FH + ZBASE * LH) / FH) - 1;
    const vmax = Math.ceil((y0 + h - iso.OY + iso.top * LH) / FH) + 2;
    const vmaxO = objects ? vmax + this.reach : vmax; // the tallest object or massif stands this many rows over its foot
    const zt = (x: number, y: number) => (x < 0 || y < 0 || x >= fw || y >= fh ? ZBASE : fz[y * fw + x]);
    const cl = fine.cliffs, info = fine.cliffInfo;
    const pick = (...ids: (string | undefined)[]) => ids.find((id) => id && cl[id]) ?? 'earth';
    // per set: [rock, earth, snow, ice] cliff ids
    const sets = this.art.sets.map((s) => { const crag = pick(s.crag, 'rock', 'earth'), snow = pick(s.snow, crag); return [crag, pick(s.earth), snow, pick(s.ice, snow)]; });
    // per set: the stone of its walls (null: the global set's crag under rock only, strips else)
    const stones = this.art.sets.map((s): Stone | null => STONES[s.name] ?? null);
    // with a view mode's tint: the ground, the tint over it, then the objects over both
    const split = !!o.tint && objects;
    const sprite = treeShadow();
    const faces = new Faces();
    const drawObjects = (v: number) => {
      for (const p of this.rows[v] ?? []) {
        const d = p.def, ox = p.sx - d.anchor.x, oy = p.sy - d.anchor.y;
        if (ox > x0 + w || ox + d.w < x0 || oy > y0 + h || oy + d.h < y0) continue;
        if (p.shade !== undefined && p.shade < 1) { ctx.filter = `brightness(${p.shade})`; ctx.drawImage(p.img, ox, oy); ctx.filter = 'none'; } else ctx.drawImage(p.img, ox, oy);
      }
    };
    for (let v = Math.max(0, vmin); v <= Math.min(fw + fh - 2, split ? vmax : vmaxO); v++) {
      if (v <= vmax) {
        let u = Math.max(umin, -v, v - 2 * (fh - 1));
        if ((u + v) & 1) u++;
        for (; u <= Math.min(umax, v, 2 * (fw - 1) - v); u += 2) {
          const x = (u + v) / 2, y = (v - u) / 2, i = y * fw + x, c = code[i];
          if (c < 0 || this.peaks?.covers(x >> 1, y >> 1)) continue; // under the peaks
          const z = fz[i], ty = Math.round(iso.OY + v * FH - z * LH);
          if (ty - 2 * LH > y0 + h) continue;
          const drop = z - Math.min(zt(x + 1, y), zt(x, y + 1));
          if (ty + 3 * LH + Math.max(0, drop - 1) * LH < y0) continue;
          const tx = iso.OX + u * FW - FW;
          const kd = fk[i], si = this.setOf[(y >> 1) * this.r.w + (x >> 1)];
          // a rock wall: painted with its stone's face texture after the row (./rockFace.ts), over the cell's own side
          const stone = drop > 1 && !SNOWY.has(kd) ? stones[si] ?? (ROCKY.has(kd) ? 'granite' : null) : null;
          if (stone) faces.stone(stone, x, y, tx, ty, drop, iso.OX, iso.OY);
          else if (drop > 1) { // a cliff: the cell's own side covers SIDE px of the riser, strips tile the rest (never stretched)
            const m = sets[si], n = Math.ceil((drop * LH) / SIDE) - 1;
            const foot = Math.min(zt(x + 1, y), zt(x, y + 1)) === zt(x + 1, y) ? fk[Math.min(fw * fh - 1, i + 1)] : fk[Math.min(fw * fh - 1, i + fw)];
            const id = SNOWY.has(kd) ? m[2] : ROCKY.has(kd) ? m[0] : m[1], low = SNOWY.has(kd) && (WET.has(foot) || SNOWY.has(foot)) ? m[3] : id;
            for (let k = n; k >= 1; k--) {
              // darker toward the foot, dithered so no band line shows; W-51 multi-frame cliffs shade in buttresses (a few
              // cells wide, drifting down the face) so a tall crag does not read as a grid of blocks
              const h = hash(x, y, k), R0 = info[id].roles, b = R0 ? Math.sin((x - y) * 0.9 + k * 0.35 + (hash(x - y, 0, 7) % 7)) * 0.22 : 0;
              const t = Math.max(0, k / n * (R0 ? 0.6 : 1) + ((h >> 8) % 100) / 400 + b);
              const bottom = n >= 3 && k >= n - (n >= 8 ? 1 : 0), c = bottom ? low : id, ci = info[c], R = ci.roles;
              // W-51 multi-frame cliffs: the lip under the edge, faces down the wall, the low frames at its foot
              const fr = R ? (k === 1 ? R.lip : bottom ? R.low : R.face) : null;
              const f = (t < 0.4 ? 0 : t < 0.75 ? 1 : 2) * ci.n + (fr ? fr[(h >>> 3) % fr.length] : h % ci.n);
              ctx.drawImage(cl[c], f * 32, 0, 32, 24, tx, ty + FH + SIDE * k, 32, 24);
            }
          }
          let img: CanvasImageSource, sx: number, sy = 0;
          if (c >= VARIANT * 64) {
            const r = c - VARIANT * 64;
            img = fine.variants[Math.floor(r / 1024)]; sx = (r % 1024) * 32;
          } else if (this.corners[i] !== 0xffff) {
            const g = this.corners[i];
            [img, sx, sy] = this.smooth.frame(c >> 6, (c & 63) >> 2, c & 3, [g & 15, (g >> 4) & 15, (g >> 8) & 15, g >> 12]);
          } else { img = fine.sheets[c >> 6]; sx = (c & 63) * 32; }
          // a step under the front edges the ramps do not close (a bank over water, two cliff cells a level apart): the
          // cell's own side tiled down it (its frame redrawn SIDE px lower, its top hidden under the side above)
          const k4 = 4 * i, rise = drop > 1 ? 0 : Math.max(fc[k4 + 1] - cn(x + 1, y, 0), fc[k4 + 2] - cn(x + 1, y, 3), fc[k4 + 3] - cn(x, y + 1, 0), fc[k4 + 2] - cn(x, y + 1, 1));
          const nr = rise > 0.01 ? Math.ceil((rise * LH) / SIDE) - 1 : 0;
          if (ramp[i]) this.warp(ctx, img, sx, sy, tx, ty, z, k4, nr);
          else {
            for (let k = nr; k >= 1; k--) ctx.drawImage(img, sx, sy, 32, 32, tx, ty + SIDE * k, 32, 32);
            ctx.drawImage(img, sx, sy, 32, 32, tx, ty, 32, 32);
          }
          const dE = z - zt(x + 1, y), dS = z - zt(x, y + 1);
          if (dE >= 2 || dS >= 2) faces.add(x, y, tx, ty, dE, dS, z, !!stone);
        }
        faces.fill(ctx);
      }
      this.shadeRow(ctx, v, umin, umax, y0, h);
      for (const t of this.shadows[v] ?? []) if (t.x < x0 + w && t.x + t.w > x0 && t.y < y0 + h && t.y + t.h > y0) ctx.drawImage(sprite, t.x, t.y, t.w, t.h);
      // a tile row's peaks after the cells of its front corner
      if (this.peaks && v >= 2 && !(v & 1) && v <= vmax) this.peaks.paintRow(ctx, (v - 2) / 2, Math.floor(umin / 2) - 1, Math.ceil(umax / 2) + 1, y0, h, this.scale);
      if (objects && !split) drawObjects(v);
    }
    if (o.tint && o.map) o.map.drawTint(ctx, iso, o.tint, x0, y0, w, h, this.scale);
    if (split) for (let v = Math.max(0, vmin); v <= Math.min(fw + fh - 2, vmaxO); v++) drawObjects(v);
    if (o.zones || o.grid) this.lines(ctx, Math.floor(umin / 2) - 1, Math.ceil(umax / 2) + 1, Math.floor(vmin / 2) - 1, Math.ceil(vmax / 2) + 1, o);
  }

  /**
   * A ramp cell's 32 x 32 frame at (tx, ty) (drawn for level z) warped through its corner levels (IsoMap.fc at k): the
   * half above the W-E diagonal by the affine map through N, W and E, the half below and the side under it by the one
   * through W, E and S (x kept, so only columns shift), with `nr` copies of the lower half SIDE px apart under it.
   */
  private warp(ctx: CanvasRenderingContext2D, img: CanvasImageSource, sx: number, sy: number, tx: number, ty: number, z: number, k: number, nr: number): void {
    const c = this.iso.fc, m = this.base!, X = m.e + tx, Y = m.f + ty;
    const dN = (z - c[k]) * LH, dE = (z - c[k + 1]) * LH, dS = (z - c[k + 2]) * LH, dW = (z - c[k + 3]) * LH;
    const B = (dE - dW) / (2 * FW), A1 = dN - FW * B, C1 = (dW - A1) / FH, C2 = (dS - dW - FW * B) / FH, A2 = dW - FH * C2;
    // a half folded over (ground rising toward the viewer steeper than the view ray) faces away: the ground in front,
    // painted later, covers where it lies, but its side would stick up past that ground's rim, so it is left out
    if (C2 > -1) for (let r = nr; r >= 1; r--) { ctx.setTransform(1, B, 0, 1 + C2, X, Y + A2 + SIDE * r); ctx.drawImage(img, sx, sy + FH, 32, 32 - FH, 0, FH, 32, 32 - FH); }
    if (C1 > -1) {
      ctx.setTransform(1, B, 0, 1 + C1, X, Y + A1);
      ctx.drawImage(img, sx, sy, 32, FH + 1, 0, 0, 32, FH + 1); // a row past the diagonal, under the lower half
    }
    if (C2 > -1) {
      ctx.setTransform(1, B, 0, 1 + C2, X, Y + A2);
      ctx.drawImage(img, sx, sy + FH, 32, 32 - FH, 0, FH, 32, 32 - FH);
    }
    ctx.setTransform(m);
  }

  /** The baked light over row v's cells (./relief.ts), one fill per code. */
  private shadeRow(ctx: CanvasRenderingContext2D, v: number, umin: number, umax: number, y0: number, h: number): void {
    const { iso, shade, code } = this, { fw, fh, fz } = iso;
    let u = Math.max(umin, -v, v - 2 * (fh - 1));
    if ((u + v) & 1) u++;
    const paths = new Map<number, Path2D>();
    let foam: Path2D | null = null, wave: Path2D | null = null;
    const blobs: number[] = [];
    for (; u <= Math.min(umax, v, 2 * (fw - 1) - v); u += 2) {
      const x = (u + v) / 2, y = (v - u) / 2, i = y * fw + x, s = shade[i];
      if ((!s && !this.foam[i]) || code[i] < 0 || this.peaks?.covers(x >> 1, y >> 1)) continue;
      const ty = Math.round(iso.OY + v * FH - fz[i] * LH);
      if (ty - 2 * LH > y0 + h || ty + 2 * FH + 2 * LH < y0) continue;
      const tx = iso.OX + u * FW - FW;
      const fb = this.foam[i];
      if (fb) {
        foam ??= new Path2D(); wave ??= new Path2D();
        const T = [tx + FW, ty], R = [tx + 2 * FW, ty + FH], B = [tx + FW, ty + 2 * FH], L = [tx, ty + FH], C = [tx + FW, ty + FH];
        const edge = (a: number[], b: number[], k: number) => {
          // jittered a pixel off the edge into the water; the wave line about a third of the way to the cell's middle
          const j = ((hash(x, y, k) & 7) - 3.5) * 0.3, ox = (C[0] - (a[0] + b[0]) / 2) * 0.12, oy = (C[1] - (a[1] + b[1]) / 2) * 0.12;
          foam!.moveTo(a[0] + ox, a[1] + oy + j); foam!.lineTo(b[0] + ox, b[1] + oy - j);
          blobs.push((a[0] + b[0]) / 2 + ox * 1.5 + j * 3, (a[1] + b[1]) / 2 + oy * 1.5);
          if (hash(x, y, k + 4) % 3) { const q = 3.2; wave!.moveTo(a[0] + ox * q + (b[0] - a[0]) * 0.15, a[1] + oy * q + (b[1] - a[1]) * 0.15); wave!.lineTo(b[0] + ox * q - (b[0] - a[0]) * 0.2, b[1] + oy * q - (b[1] - a[1]) * 0.2); }
        };
        if (fb & FOAM_PX) edge(R, B, 1);
        if (fb & FOAM_NX) edge(T, L, 2);
        if (fb & FOAM_PY) edge(B, L, 3);
        if (fb & FOAM_NY) edge(T, R, 4);
      }
      if (!s) continue;
      let p = paths.get(s);
      if (!p) paths.set(s, (p = new Path2D()));
      if (iso.ramp[i]) { // through the ramp's corners
        const c = iso.fc, k = 4 * i, z = fz[i];
        p.moveTo(tx + FW, ty + (z - c[k]) * LH); p.lineTo(tx + 2 * FW, ty + FH + (z - c[k + 1]) * LH); p.lineTo(tx + FW, ty + 2 * FH + (z - c[k + 2]) * LH); p.lineTo(tx, ty + FH + (z - c[k + 3]) * LH); p.closePath();
      } else { p.moveTo(tx + FW, ty); p.lineTo(tx + 2 * FW, ty + FH); p.lineTo(tx + FW, ty + 2 * FH); p.lineTo(tx, ty + FH); p.closePath(); }
    }
    for (const [s, p] of paths) {
      ctx.fillStyle = RELIEF_FILL[s];
      ctx.fill(p);
    }
    // surf: a foam line along each shore edge and a broken wave line a little out in the water
    if (!foam) return;
    ctx.lineCap = 'round';
    // soft spray blobs over the edge midpoints hide the cell staircase of the shore; a thin line keeps its edge
    const fs = foamSprite();
    for (let k = 0; k < blobs.length; k += 2) ctx.drawImage(fs, blobs[k] - FOAM_W / 2, blobs[k + 1] - FOAM_H / 2);
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(236,244,236,0.4)'; ctx.stroke(foam);
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(220,236,236,0.3)'; ctx.stroke(wave!);
    ctx.lineCap = 'butt';
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
          // the tile's corners on the ground (a hair inside the tile, so a ramp corner takes this tile's level)
          const tx = iso.OX + u * HW, e = 1e-3, at = (dx: number, dy: number) => Math.round(iso.OY + (v + dx + dy) * HH - iso.zAt(x + (dx ? 1 - e : e), y + (dy ? 1 - e : e)) * LH) + 0.5;
          const tN = at(0, 0), tE = at(1, 0), tW = at(0, 1);
          if (pass === 0) { seg(tx - HW, tW, tx, tN); seg(tx, tN, tx + HW, tE); continue; }
          const k = zone[i];
          if (k !== pass) continue;
          const tS = at(1, 1);
          if (zn(x - 1, y) !== k) seg(tx - HW, tW, tx, tN);
          if (zn(x, y - 1) !== k) seg(tx, tN, tx + HW, tE);
          if (zn(x + 1, y) !== k) seg(tx + HW, tE, tx, tS);
          if (zn(x, y + 1) !== k) seg(tx, tS, tx - HW, tW);
        }
      }
      ctx.stroke();
    }
  }
}

/**
 * Light on the walls of one row of cells, filled after the row (the cells of a row never overlap each other's walls; the
 * rows in front, painted later, cover what they should). Light from the NW: the SE faces (toward +x) in shadow, the SW
 * faces (toward +y) catch a little light; tall walls darker toward the foot, with cracks down them and broken ledges
 * along levels shared by the whole wall, so a long cliff does not read as one repeated strip.
 */
class Faces {
  private se = new Path2D(); private sw = new Path2D(); private foot = new Path2D();
  private dark = new Path2D(); private lit = new Path2D(); private rim = new Path2D();
  private streakLit = new Path2D(); private streakDark = new Path2D(); private upper = new Path2D(); private lip = new Path2D();
  private any = false;
  /** Rock walls of the row: [stone, x, y, tx, ty, drop, OX, OY]. */
  private walls: [Stone, number, number, number, number, number, number, number][] = [];

  /** A rock wall under cell (x, y) (frame at tx, ty), `drop` levels down both its faces, painted first in fill(). */
  stone(st: Stone, x: number, y: number, tx: number, ty: number, drop: number, OX: number, OY: number): void {
    this.any = true;
    this.walls.push([st, x, y, tx, ty, drop, OX, OY]);
  }

  add(x: number, y: number, tx: number, ty: number, dE: number, dS: number, z: number, stone = false): void {
    this.any = true;
    const rx = tx + 2 * FW, ry = ty + FH, bx = tx + FW, by = ty + 2 * FH, lx = tx, ly = ty + FH;
    const quad = (p: Path2D, ax: number, ay: number, bx2: number, by2: number, d0: number, d1: number) => {
      p.moveTo(ax, ay + d0); p.lineTo(bx2, by2 + d0); p.lineTo(bx2, by2 + d1); p.lineTo(ax, ay + d1); p.closePath();
    };
    if (dE >= 2) {
      const d = dE * LH;
      quad(this.se, rx, ry, bx, by, 0, d);
      this.rimOf(x, y, rx, ry, bx, by, stone, 0);
      if (dE >= 3) { quad(this.foot, rx, ry, bx, by, d * 0.6, d); quad(this.upper, rx, ry, bx, by, 0, d * 0.25); }
      if (dE >= 3) this.detail(x, y, rx, ry, bx, by, dE, z, 0, stone);
    }
    if (dS >= 2) {
      const d = dS * LH;
      quad(this.sw, bx, by, lx, ly, 0, d);
      this.rimOf(x, y, bx, by, lx, ly, stone, 1);
      if (dS >= 3) { quad(this.foot, bx, by, lx, ly, d * 0.6, d); quad(this.upper, bx, by, lx, ly, 0, d * 0.25); }
      if (dS >= 3) this.detail(x, y, bx, by, lx, ly, dS, z, 1, stone);
    }
  }

  /**
   * The lit rim along the edge a -> b; on a rock wall broken (chipped in places) with the overhang's jagged shadow under
   * it, so the top of a long wall is not one ruled line.
   */
  private rimOf(x: number, y: number, ax: number, ay: number, bx: number, by: number, stone: boolean, side: number): void {
    if (!stone) { this.rim.moveTo(ax, ay + 0.5); this.rim.lineTo(bx, by + 0.5); return; }
    const h = hash(x * 3 + side, y * 5 - side, 57), dx = (bx - ax) / 4, dy = (by - ay) / 4;
    for (let q = 0; q < 4; q++) if ((h >>> q) & 1 || (h >>> (q + 8)) & 1) { this.rim.moveTo(ax + dx * q, ay + dy * q + 0.5); this.rim.lineTo(ax + dx * (q + 1), ay + dy * (q + 1) + 0.5); }
    this.lip.moveTo(ax, ay);
    for (let q = 0; q <= 4; q++) this.lip.lineTo(Math.round(ax + dx * q), Math.round(ay + dy * q) + 2 + ((h >>> (12 + 3 * q)) & 7) * ((h >>> 28) & 1 ? 0.9 : 0.6));
    this.lip.lineTo(bx, by); this.lip.closePath();
  }

  /** Cracks and ledges on the face under the edge a -> b, d levels tall. */
  private detail(x: number, y: number, ax: number, ay: number, bx: number, by: number, d: number, z: number, side: number, stone: boolean): void {
    const h = hash(x, y, 11 + side);
    // weathering streaks: thin vertical runs of light or shade from the lip down, across the strip seams
    for (let q = 0; q < 2; q++) {
      const hq = hash(x, y, 31 + side * 2 + q), t = ((hq & 255) / 255) * 0.85 + 0.05, sx = ax + (bx - ax) * t, sy = ay + (by - ay) * t;
      const sw = 2 + (hq >>> 8) % 4, len = d * LH * (0.3 + ((hq >>> 12) % 70) / 100), p = (hq >>> 20) & 1 ? this.streakLit : this.streakDark;
      p.rect(Math.round(sx), sy + 2, sw, len);
    }
    if (h % 2 === 0) { // a crack from near the top most of the way down, wandering a pixel or two
      const t = 0.2 + ((h >>> 4) % 60) / 100, cx = ax + (bx - ax) * t, cy = ay + (by - ay) * t, len = d * LH * (0.45 + ((h >>> 10) % 40) / 100);
      let px = cx, py = cy + 3;
      this.dark.moveTo(px, py); this.lit.moveTo(px - 1, py);
      for (let s = 6; s < len; s += 6) {
        px += (((h >>> (s % 24)) & 3) - 1.5) * 0.9;
        py = cy + s;
        this.dark.lineTo(px, py); this.lit.lineTo(px - 1, py);
      }
    }
    // ledges at the levels the whole wall shares (phase by wall section), broken per cell (a rock wall's are in its texture)
    if (stone) return;
    const ph = hash(x >> 3, y >> 3, 13) % 5;
    for (let lv = Math.floor(z) - 2; lv > z - d + 1; lv--) {
      if ((lv + ph) % 5 !== 0 || hash(x, y, lv) % 10 < 3) continue;
      const o = (z - lv) * LH;
      this.lit.moveTo(ax, ay + o); this.lit.lineTo(bx, by + o);
      this.dark.moveTo(ax, ay + o + 1.5); this.dark.lineTo(bx, by + o + 1.5);
    }
  }

  fill(ctx: CanvasRenderingContext2D): void {
    if (!this.any) return;
    for (const [st, x, y, tx, ty, drop, OX, OY] of this.walls) {
      // both faces mapped from the world (16 px per cell along the wall, LH per level down it), so strata stay level
      const p = (WALL_PAT[st] ??= ctx.createPattern(wallTexture(st), 'repeat')!), d = drop * LH;
      const rx = tx + 2 * FW, ry = ty + FH, bx = tx + FW, by = ty + 2 * FH, lx = tx, ly = ty + FH;
      p.setTransform(new DOMMatrix([-1, 0.5, 0, 1, OX + (x + 1) * FW, OY + (x + 1) * FH]));
      ctx.fillStyle = p;
      ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(bx, by); ctx.lineTo(bx, by + d); ctx.lineTo(rx, ry + d); ctx.closePath(); ctx.fill();
      p.setTransform(new DOMMatrix([1, 0.5, 0, 1, OX - (y + 1) * FW, OY + (y + 1) * FH]));
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(lx, ly); ctx.lineTo(lx, ly + d); ctx.lineTo(bx, by + d); ctx.closePath(); ctx.fill();
    }
    this.walls.length = 0;
    ctx.fillStyle = 'rgba(14,16,30,0.17)'; ctx.fill(this.se);
    ctx.fillStyle = 'rgba(255,238,200,0.08)'; ctx.fill(this.sw);
    ctx.fillStyle = 'rgba(10,10,20,0.15)'; ctx.fill(this.foot);
    ctx.fillStyle = 'rgba(16,8,6,0.42)'; ctx.fill(this.lip);
    ctx.strokeStyle = 'rgba(255,242,214,0.3)'; ctx.lineWidth = 1.5; ctx.stroke(this.rim);
    ctx.fillStyle = 'rgba(255,238,200,0.07)'; ctx.fill(this.upper);
    ctx.fillStyle = 'rgba(255,240,214,0.09)'; ctx.fill(this.streakLit);
    ctx.fillStyle = 'rgba(10,10,18,0.14)'; ctx.fill(this.streakDark);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(12,10,8,0.55)'; ctx.stroke(this.dark);
    ctx.strokeStyle = 'rgba(255,240,210,0.22)'; ctx.stroke(this.lit);
    this.se = new Path2D(); this.sw = new Path2D(); this.foot = new Path2D(); this.dark = new Path2D(); this.lit = new Path2D(); this.rim = new Path2D();
    this.streakLit = new Path2D(); this.streakDark = new Path2D(); this.upper = new Path2D(); this.lip = new Path2D();
    this.any = false;
  }
}
