/**
 * The parchment war map (docs/ART_STYLE.md §12 "World map", docs/DESIGN_V2.md
 * "Rendering"), drawn procedurally with the Pix pipeline. Independent of
 * Phaser: src/scenes/online/regionMapView.ts uploads what this bakes.
 *
 * - `MapFields`: smooth fields derived once from a season map (signed coast
 *   distance, blurred sand / forest / hills / mountain / marsh, region boxes,
 *   settlement sprites and harbours).
 * - `bakeChunk`: one square of the map at a level of detail (`s` map px per
 *   texel): lavender sea with depth bands, shelves, a dotted coastline, sand,
 *   a patchwork of tufted grass tiles, painted ridges and mounds, blob
 *   forests, marsh, dotted roads, settlements, subtle dotted borders,
 *   owner-tinted land, and the fog of war as stair-stepped parchment clouds
 *   with hatching and a lavender shadow.
 * - Sprites for armies, ships, label plates, camp plots and the selection.
 */
import { mix } from './palette';
import type { WorldGraph } from '../online/world';
import { decodeTerrain } from '../online/mapSchema';
import { Pix, hash2, valueNoise } from './pixels';
import { clamp01 } from '../util/math';
import { MP, archOf, drawCypress, drawTree, harbourProp, rng, settlementProp, shipPix, type PropSprite, type Pt } from './mapProps';

export { MP, drawTree, shipPix };

// ------------------------------------------------------------------ fields

/** Terrain indices (mapSchema TERRAINS). */
const T = { Sea: 0, Shelf: 1, Sand: 2, Land: 3, Forest: 4, Hills: 5, Mountain: 6, Marsh: 7 } as const;

export interface Placed {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  sprite: PropSprite;
}

export interface Harbour {
  /** Coast point (map px) and the way out to sea. */
  x: number;
  y: number;
  dx: number;
  dy: number;
  pix: Pix;
  ox: number;
  oy: number;
  fires: Pt[];
}

interface River {
  pts: [number, number][];
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A cultivated patch around a settlement (map px). */
interface FieldPatch {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: number;
}

/** Smooth terrain fields and settlement placements of one season map. */
export class MapFields {
  readonly world: WorldGraph;
  readonly cw: number;
  readonly ch: number;
  readonly cell: number;
  readonly W: number;
  readonly H: number;
  readonly mask: Int32Array;
  readonly ter: Uint8Array;
  /** Signed distance to the coast in cells (+ land, - sea). */
  readonly sd: Float32Array;
  readonly sand: Float32Array;
  readonly forest: Float32Array;
  readonly hills: Float32Array;
  readonly mount: Float32Array;
  readonly marsh: Float32Array;
  /** Per cell: which blurred fields are non-zero around it (FLAG_*). */
  readonly flags: Uint8Array;
  /** Region id is a sea area. */
  readonly seaId: Set<number>;
  private placed = new Map<number, Placed | null>();
  private buckets = new Map<number, number[]>();
  private harbours = new Map<number, Harbour | null>();
  private fieldCache = new Map<number, FieldPatch[]>();
  private rivers: River[] | null = null;
  private edgeBoxes: { x0: number; y0: number; x1: number; y1: number; i: number }[] = [];

  constructor(world: WorldGraph) {
    this.world = world;
    const m = world.map;
    this.cw = m.w;
    this.ch = m.h;
    this.cell = m.cell;
    this.W = world.width;
    this.H = world.height;
    this.mask = world.mask();
    this.ter = decodeTerrain(m);
    this.seaId = new Set(m.regions.filter((r) => r.kind === 'sea').map((r) => r.id));
    const N = this.cw * this.ch;
    const land = new Uint8Array(N);
    for (let i = 0; i < N; i++) land[i] = this.ter[i] >= T.Sand ? 1 : 0;
    this.sd = signedDistance(land, this.cw, this.ch);
    const pick = (fn: (t: number) => boolean) => {
      const a = new Float32Array(N);
      for (let i = 0; i < N; i++) a[i] = fn(this.ter[i]) ? 1 : 0;
      return blur(a, this.cw, this.ch);
    };
    this.sand = pick((t) => t === T.Sand);
    this.forest = pick((t) => t === T.Forest);
    this.hills = pick((t) => t === T.Hills || t === T.Mountain);
    this.mount = pick((t) => t === T.Mountain);
    this.marsh = pick((t) => t === T.Marsh);
    this.flags = new Uint8Array(N);
    const fl = [this.sand, this.marsh, this.mount, this.forest, this.hills];
    for (let y = 0; y < this.ch; y++)
      for (let x = 0; x < this.cw; x++) {
        let b = 0;
        for (let q = 0; q < fl.length; q++) {
          const a = fl[q];
          for (let dy = -1; dy <= 1 && !(b & (1 << q)); dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx;
              const yy = y + dy;
              if (xx >= 0 && yy >= 0 && xx < this.cw && yy < this.ch && a[yy * this.cw + xx] > 0) {
                b |= 1 << q;
                break;
              }
            }
        }
        this.flags[y * this.cw + x] = b;
      }
    // settlement buckets (by label, 256 px)
    for (const r of world.all()) {
      if (r.kind === 'sea') continue;
      const k = bucketKey(r.label[0] >> 8, r.label[1] >> 8);
      const l = this.buckets.get(k);
      if (l) l.push(r.id);
      else this.buckets.set(k, [r.id]);
    }
    world.map.edges.forEach((e, i) => {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const [x, y] of e.waypoints) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y));
      this.edgeBoxes.push({ x0, y0, x1, y1, i });
    });
  }

  /** Bilinear sample of a cell field at map px. */
  bil(a: Float32Array | Uint8Array, mx: number, my: number): number {
    const fx = mx / this.cell - 0.5;
    const fy = my / this.cell - 0.5;
    let ix = Math.floor(fx);
    let iy = Math.floor(fy);
    const ax = fx - ix;
    const ay = fy - iy;
    const w = this.cw;
    let ix1 = ix + 1;
    let iy1 = iy + 1;
    if (ix < 0) ix = 0;
    if (iy < 0) iy = 0;
    if (ix1 > w - 1) ix1 = w - 1;
    if (iy1 > this.ch - 1) iy1 = this.ch - 1;
    if (ix > w - 1) ix = w - 1;
    if (iy > this.ch - 1) iy = this.ch - 1;
    const a00 = a[iy * w + ix];
    const a10 = a[iy * w + ix1];
    const a01 = a[iy1 * w + ix];
    const a11 = a[iy1 * w + ix1];
    return (a00 + (a10 - a00) * ax) * (1 - ay) + (a01 + (a11 - a01) * ax) * ay;
  }

  cellIndex(mx: number, my: number): number {
    let cx = Math.floor(mx / this.cell);
    let cy = Math.floor(my / this.cell);
    if (cx < 0) cx = 0;
    if (cy < 0) cy = 0;
    if (cx >= this.cw) cx = this.cw - 1;
    if (cy >= this.ch) cy = this.ch - 1;
    return cy * this.cw + cx;
  }

  /** Signed coast value at map px (cells; > 0 land), with a wobble. */
  coast(mx: number, my: number): number {
    // domain-warped so the chamfer facets of the cell grid never show: broad bays, then coves, then a fine fringe
    const wx = mx + (valueNoise(mx, my, 61, 3) - 0.5) * 22;
    const wy = my + (valueNoise(mx + 311, my + 97, 61, 4) - 0.5) * 22;
    return this.bil(this.sd, wx, wy) + (valueNoise(mx, my, 26, 1) - 0.5) * 0.55 + (valueNoise(mx, my, 11, 2) - 0.5) * 0.3 + (valueNoise(mx, my, 4.5, 5) - 0.5) * 0.12;
  }

  /** Land region at map px with wavy borders (0: sea / none). */
  regionAt(mx: number, my: number): number {
    const c = this.cell * 0.55;
    const a = this.mask[this.cellIndex(mx - c, my - c)];
    if (
      a === this.mask[this.cellIndex(mx + c, my - c)] &&
      a === this.mask[this.cellIndex(mx - c, my + c)] &&
      a === this.mask[this.cellIndex(mx + c, my + c)]
    )
      return this.seaId.has(a) ? 0 : a;
    const wx = mx + (valueNoise(mx, my, 23, 5) - 0.5) * 18;
    const wy = my + (valueNoise(mx, my, 23, 6) - 0.5) * 18;
    const id = this.mask[this.cellIndex(wx, wy)];
    return this.seaId.has(id) ? 0 : id;
  }

  /** Settlement of a region (sprite + rect in map px), cached. */
  placedOf(id: number): Placed | null {
    let p = this.placed.get(id);
    if (p !== undefined) return p;
    const r = this.world.info(id);
    const sp = settlementProp(r.kind, r.name, archOf(r.name, r.label[0], r.label[1], r.coast), id);
    p = null;
    if (sp) {
      // slide the sprite (label point kept inside) so it stands on land rather than in the sea
      const pts: [number, number][] = [];
      for (let j = 2; j < sp.pix.h; j += 8) for (let i = 2; i < sp.pix.w; i += 8) if (sp.pix.alpha(i, j) > 0) pts.push([i, j]);
      let best = -Infinity;
      let bx = r.label[0] - sp.ax;
      let by = r.label[1] - sp.ay;
      const reach = Math.min(70, Math.floor(Math.min(sp.pix.w, sp.pix.h) / 2) - 6);
      // keep clear of the capitals nearby
      const big: Placed[] = [];
      if (r.kind !== 'capital')
        for (const o of this.world.capitals()) {
          const l = this.world.info(o).label;
          if (Math.abs(l[0] - r.label[0]) < 260 && Math.abs(l[1] - r.label[1]) < 240) {
            const q = this.placedOf(o);
            if (q) big.push(q);
          }
        }
      for (let dy = -reach; dy <= reach; dy += 10)
        for (let dx = -reach; dx <= reach; dx += 10) {
          const x = r.label[0] - sp.ax + dx;
          const y = r.label[1] - sp.ay + dy;
          let land = 0;
          for (const [i, j] of pts) if (this.coast(x + i, y + j) > 0.1 && !big.some((b) => x + i > b.x - 4 && x + i < b.x + b.w + 4 && y + j > b.y - 4 && y + j < b.y + b.h + 4)) land++;
          const score = land / Math.max(1, pts.length) - Math.hypot(dx, dy) * 0.0015;
          if (score > best) (best = score), (bx = x), (by = y);
        }
      p = { id, x: bx, y: by, w: sp.pix.w, h: sp.pix.h, sprite: sp };
    }
    this.placed.set(id, p);
    return p;
  }

  /** Settlements whose label lies near a map px box. */
  settlementsNear(x0: number, y0: number, x1: number, y1: number): Placed[] {
    const out: Placed[] = [];
    for (let by = (y0 - 110) >> 8; by <= (y1 + 110) >> 8; by++)
      for (let bx = (x0 - 110) >> 8; bx <= (x1 + 110) >> 8; bx++) {
        const l = this.buckets.get(bucketKey(bx, by));
        if (!l) continue;
        for (const id of l) {
          const p = this.placedOf(id);
          if (p && p.x < x1 && p.y < y1 && p.x + p.w > x0 && p.y + p.h > y0) out.push(p);
        }
      }
    return out;
  }

  /** Harbour (pier + moored ship) of a coastal town, capital or post. */
  harbourOf(id: number): Harbour | null {
    let h = this.harbours.get(id);
    if (h !== undefined) return h;
    h = null;
    const r = this.world.info(id);
    if (r.coast && (r.kind === 'capital' || r.kind === 'town' || r.kind === 'post')) {
      const [lx, ly] = r.label;
      const c0x = Math.floor(lx / this.cell);
      const c0y = Math.floor(ly / this.cell);
      let best = Infinity;
      let bx = 0;
      let by = 0;
      for (let dy = -9; dy <= 9; dy++)
        for (let dx = -9; dx <= 9; dx++) {
          const cx = c0x + dx;
          const cy = c0y + dy;
          if (cx < 0 || cy < 0 || cx >= this.cw || cy >= this.ch) continue;
          if (this.sd[cy * this.cw + cx] > -1.2) continue;
          const d = dx * dx + dy * dy;
          if (d < best) (best = d), (bx = (cx + 0.5) * this.cell), (by = (cy + 0.5) * this.cell);
        }
      if (best < Infinity) {
        const len = Math.hypot(bx - lx, by - ly);
        const ux = (bx - lx) / len;
        const uy = (by - ly) / len;
        for (let k = 0; k < len + 40; k += 1) {
          const x = lx + ux * k;
          const y = ly + uy * k;
          if (this.coast(x, y) < 0.05) {
            const hp = harbourProp(r.kind, ux, uy, archOf(r.name, lx, ly, true), id);
            h = { x: Math.round(x - ux * 2), y: Math.round(y - uy * 2), dx: ux, dy: uy, pix: hp.pix, ox: hp.ox, oy: hp.oy, fires: hp.fires };
            break;
          }
        }
      }
    }
    this.harbours.set(id, h);
    return h;
  }

  /** Field patchworks around a town / capital / fort (deterministic; on open grass only). */
  fieldsOf(id: number): FieldPatch[] {
    let l = this.fieldCache.get(id);
    if (l) return l;
    l = [];
    const pl = this.placedOf(id);
    const r = this.world.info(id);
    const blocks = r.kind === 'capital' ? 7 : r.kind === 'town' ? 3 : r.kind === 'fort' ? 1 : 0;
    if (pl && blocks) {
      const R = rng(id * 7919 + 3);
      const cx = r.label[0];
      const cy = r.label[1];
      const base = Math.max(pl.w, pl.h) / 2 + 10;
      const ok = (x: number, y: number, w: number, h: number) => {
        if (x < pl.x + pl.w + 4 && x + w > pl.x - 4 && y < pl.y + pl.h + 4 && y + h > pl.y - 4) return false;
        if (l!.some((o) => x < o.x + o.w + 1 && x + w > o.x - 1 && y < o.y + o.h + 1 && y + h > o.y - 1)) return false;
        for (const [px, py] of [
          [x, y],
          [x + w, y],
          [x, y + h],
          [x + w, y + h],
          [x + w / 2, y + h / 2],
        ])
          if (this.coast(px, py) < 0.6 || this.bil(this.mount, px, py) > 0.25 || this.bil(this.forest, px, py) > 0.35 || this.bil(this.marsh, px, py) > 0.3 || this.world.regionAt(px, py) !== id) return false;
        return true;
      };
      let made = 0;
      for (let tries = 0; tries < blocks * 6 && made < blocks; tries++) {
        const a = R() * Math.PI * 2;
        const d = base + R() * (r.kind === 'capital' ? 70 : 40);
        const W = 34 + Math.floor(R() * 26);
        const H = 22 + Math.floor(R() * 16);
        const x = Math.round(cx + Math.cos(a) * d - W / 2);
        const y = Math.round(cy + Math.sin(a) * d * 0.8 - H / 2);
        if (!ok(x, y, W, H)) continue;
        made++;
        // split the block into strips of different crops
        const vertical = R() < 0.5;
        const n = 2 + Math.floor(R() * 3);
        let at = 0;
        for (let k = 0; k < n; k++) {
          const total = vertical ? W : H;
          const size = k === n - 1 ? total - at : Math.max(6, Math.floor((total / n) * (0.7 + R() * 0.6)));
          if (size < 5) break;
          if (vertical) l.push({ x: x + at, y, w: size - 1, h: H, kind: Math.floor(R() * 5) });
          else l.push({ x, y: y + at, w: W, h: size - 1, kind: Math.floor(R() * 5) });
          at += size;
          if (at >= total) break;
        }
      }
    }
    this.fieldCache.set(id, l);
    return l;
  }

  /** Rivers: from the hills of each region whose battlefield has one, meandering downhill to the sea. */
  riversIn(x0: number, y0: number, x1: number, y1: number): River[] {
    if (!this.rivers) {
      this.rivers = [];
      for (const r of this.world.all()) {
        if (r.kind === 'sea' || !r.site.river) continue;
        const R = rng(r.id * 31 + 7);
        // start upstream: away from the coast, beside the settlement
        let x = r.label[0] + (R() - 0.5) * 120;
        let y = r.label[1] - 40 - R() * 60;
        const pts: [number, number][] = [[x, y]];
        let ang = 0;
        for (let k = 0; k < 400; k++) {
          const e = 6;
          const gx = this.bil(this.sd, x + e, y) - this.bil(this.sd, x - e, y);
          const gy = this.bil(this.sd, x, y + e) - this.bil(this.sd, x, y - e);
          const gl = Math.hypot(gx, gy) || 1;
          ang += (R() - 0.5) * 0.7;
          ang *= 0.85;
          const dx = -gx / gl;
          const dy = -gy / gl;
          const c = Math.cos(ang);
          const sn = Math.sin(ang);
          x += (dx * c - dy * sn) * 6;
          y += (dx * sn + dy * c) * 6;
          pts.push([x, y]);
          if (this.coast(x, y) < -0.3) break;
        }
        if (pts.length < 6) continue;
        let bx0 = Infinity;
        let by0 = Infinity;
        let bx1 = -Infinity;
        let by1 = -Infinity;
        for (const [px, py] of pts) (bx0 = Math.min(bx0, px)), (by0 = Math.min(by0, py)), (bx1 = Math.max(bx1, px)), (by1 = Math.max(by1, py));
        this.rivers.push({ pts, x0: bx0 - 4, y0: by0 - 4, x1: bx1 + 4, y1: by1 + 4 });
      }
    }
    return this.rivers.filter((v) => v.x0 <= x1 && v.x1 >= x0 && v.y0 <= y1 && v.y1 >= y0);
  }

  edgesIn(x0: number, y0: number, x1: number, y1: number): number[] {
    const out: number[] = [];
    for (const b of this.edgeBoxes) if (b.x0 <= x1 && b.x1 >= x0 && b.y0 <= y1 && b.y1 >= y0) out.push(b.i);
    return out;
  }
}

const bucketKey = (bx: number, by: number) => (by + 64) * 4096 + bx + 64;

/** Chamfer signed distance (cells): land cells > 0, sea < 0, the coast at 0. */
function signedDistance(land: Uint8Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  const run = (inside: (i: number) => boolean) => {
    const d = new Float32Array(w * h);
    const BIG = 1e6;
    for (let i = 0; i < w * h; i++) d[i] = inside(i) ? BIG : 0;
    const D = Math.SQRT2;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!d[i]) continue;
        let v = d[i];
        if (x > 0) v = Math.min(v, d[i - 1] + 1);
        if (y > 0) {
          v = Math.min(v, d[i - w] + 1);
          if (x > 0) v = Math.min(v, d[i - w - 1] + D);
          if (x < w - 1) v = Math.min(v, d[i - w + 1] + D);
        }
        d[i] = v;
      }
    for (let y = h - 1; y >= 0; y--)
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        if (!d[i]) continue;
        let v = d[i];
        if (x < w - 1) v = Math.min(v, d[i + 1] + 1);
        if (y < h - 1) {
          v = Math.min(v, d[i + w] + 1);
          if (x < w - 1) v = Math.min(v, d[i + w + 1] + D);
          if (x > 0) v = Math.min(v, d[i + w - 1] + D);
        }
        d[i] = v;
      }
    return d;
  };
  const dl = run((i) => land[i] === 1);
  const ds = run((i) => land[i] === 0);
  for (let i = 0; i < w * h; i++) out[i] = land[i] ? Math.min(dl[i], 40) - 0.5 : -(Math.min(ds[i], 40) - 0.5);
  return out;
}

/** 3x3 [1 2 1] blur. */
function blur(a: Float32Array, w: number, h: number): Float32Array {
  const t = new Float32Array(w * h);
  const o = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      t[i] = (a[x > 0 ? i - 1 : i] + 2 * a[i] + a[x < w - 1 ? i + 1 : i]) / 4;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      o[i] = (t[y > 0 ? i - w : i] + 2 * t[i] + t[y < h - 1 ? i + w : i]) / 4;
    }
  return o;
}

// ------------------------------------------------------------------ fog cells

/**
 * Fog of every mask cell (1 = under the clouds): land of regions out of
 * sight, and the sea further than `seaReach` cells from known land (naval
 * routes between two known regions stay clear).
 */
export function fogCells(f: MapFields, known: ReadonlySet<number>, seaReach = 12): Uint8Array {
  const N = f.cw * f.ch;
  const fog = new Uint8Array(N).fill(1);
  const dist = new Uint8Array(N).fill(255);
  const queue: number[] = [];
  for (let i = 0; i < N; i++) {
    const id = f.mask[i];
    if (!known.has(id)) continue;
    fog[i] = 0;
    if (!f.seaId.has(id)) (dist[i] = 0), queue.push(i);
  }
  const w = f.cw;
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi];
    const d = dist[i];
    if (d >= seaReach) continue;
    const x = i % w;
    const y = (i - x) / w;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= f.ch) continue;
        const j = ny * w + nx;
        if (dist[j] !== 255) continue;
        if (f.ter[j] >= T.Sand && !f.seaId.has(f.mask[j])) continue; // fog stays on unknown land
        dist[j] = d + 1;
        fog[j] = 0;
        queue.push(j);
      }
  }
  // the world ends in clouds
  for (let y = 0; y < f.ch; y++)
    for (let x = 0; x < f.cw; x++) if (x < 2 || y < 2 || x >= f.cw - 2 || y >= f.ch - 2) fog[y * w + x] = 1;
  for (const e of f.world.map.edges) {
    if (!e.naval || !known.has(e.a) || !known.has(e.b)) continue;
    const pts: [number, number][] = [];
    for (let i = 1; i < e.waypoints.length; i++) {
      const [ax, ay] = e.waypoints[i - 1];
      const [bx, by] = e.waypoints[i];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / f.cell));
      for (let k = 0; k <= n; k++) pts.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
    }
    for (const [x, y] of pts) {
      const cx = Math.floor(x / f.cell);
      const cy = Math.floor(y / f.cell);
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++) {
          if (dx * dx + dy * dy > 10) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= f.ch) continue;
          const j = ny * w + nx;
          if (f.ter[j] < T.Sand || f.seaId.has(f.mask[j])) fog[j] = 0;
        }
    }
  }
  return fog;
}

// ------------------------------------------------------------------ chunk bake

export interface MapState {
  /** Fog per mask cell (fogCells). */
  fog: Uint8Array;
  /** Owner colour of claimed known regions. */
  owner: ReadonlyMap<number, number>;
}

/** A stable signature of what a cell box of the map shows (fog + owners): rebake when it changes. */
export function stateSignature(f: MapFields, st: MapState, cx0: number, cy0: number, cx1: number, cy1: number): number {
  let h = 0x811c9dc5;
  for (let cy = Math.max(0, cy0); cy <= Math.min(f.ch - 1, cy1); cy++)
    for (let cx = Math.max(0, cx0); cx <= Math.min(f.cw - 1, cx1); cx++) {
      const i = cy * f.cw + cx;
      const v = st.fog[i] ? 1 : (st.owner.get(f.mask[i]) ?? 0) + 2;
      h = Math.imul(h ^ v, 16777619);
      h = Math.imul(h ^ (cx + cy), 2246822519) >>> 0;
    }
  return h >>> 0;
}

/**
 * Bakes a block of the map: texels (gx0..gx0+tw, gy0..gy0+th) where a texel
 * covers `s` x `s` map px. s = 1 is the full painting, s = 4 a simplified
 * one (mini settlements and peaks), s >= 8 colours only.
 */
export function bakeChunk(f: MapFields, st: MapState, s: number, gx0: number, gy0: number, tw: number, th: number): Pix {
  const p = new Pix(tw, th);
  const d32 = new Uint32Array(p.data.buffer);
  const P = 7;
  const W2 = tw + 2 * P;
  const H2 = th + 2 * P;
  const N2 = W2 * H2;
  const F = new Float32Array(N2);
  const R = new Int32Array(N2);
  const FG = new Uint8Array(N2);
  const half = s * 0.5;
  const OFF = [1, -1, W2, -W2, 2, -2, 2 * W2, -2 * W2];
  // fog shortcut: all clear / all fogged in the block (+ margin)?
  const mcx0 = Math.floor(((gx0 - P - 16) * s) / f.cell) - 1;
  const mcy0 = Math.floor(((gy0 - P - 16) * s) / f.cell) - 1;
  const mcx1 = Math.floor(((gx0 + tw + P + 16) * s) / f.cell) + 1;
  const mcy1 = Math.floor(((gy0 + th + P + 16) * s) / f.cell) + 1;
  let anyFog = false;
  let anyClear = false;
  for (let cy = Math.max(0, mcy0); cy <= Math.min(f.ch - 1, mcy1); cy++)
    for (let cx = Math.max(0, mcx0); cx <= Math.min(f.cw - 1, mcx1); cx++) {
      if (st.fog[cy * f.cw + cx]) anyFog = true;
      else anyClear = true;
    }
  const allFog = anyFog && !anyClear;
  const fogScale = s >= 8 ? 0.3 : 1;
  // the cloud edge is torn in long horizontal rags: two-texel rows shift together (stair steps)
  const rowOff = new Float32Array(H2);
  for (let j = 0; j < H2; j++) {
    const gq = (gy0 + j - P) & ~1;
    rowOff[j] = ((hash2(gq >> 1, 7, 31) - 0.5) * 12 + (valueNoise(0, gq, 5, 32) - 0.5) * 24 + (valueNoise(0, gq, 23, 37) - 0.5) * 30) * fogScale;
  }
  const fogAt = (gx: number, gy: number): number => {
    if (!anyFog) return 0;
    if (allFog) return 1;
    const j = Math.max(0, Math.min(H2 - 1, gy - gy0 + P));
    const gq = gy & ~1;
    const off = rowOff[j];
    const colOff = ((hash2(gx >> 3, 9, 34) - 0.5) * 6 + (valueNoise(gx, 0, 19, 35) - 0.5) * 14) * fogScale;
    const mx = (gx + off) * s + half;
    const my = (gq + colOff) * s + half;
    let v = f.bil(st.fog, mx, my);
    if (v > 0 && v < 1) v += (valueNoise(gx * 0.3, gq, 6, 33) - 0.5) * 0.5 + (valueNoise(gx * 0.5, gq, 2.5, 36) - 0.5) * 0.2;
    return v > 0.5 ? 1 : 0;
  };
  for (let j = 0; j < H2; j++) {
    const gy = gy0 + j - P;
    const my = gy * s + half;
    for (let i = 0; i < W2; i++) {
      const gx = gx0 + i - P;
      const mx = gx * s + half;
      const k = j * W2 + i;
      FG[k] = fogAt(gx, gy);
      if (allFog) continue;
      const c = f.coast(mx, my);
      F[k] = c;
      R[k] = c > 0 ? f.regionAt(mx, my) : 0;
    }
  }
  if (!allFog) {
    for (let j = 0; j < th; j++) {
      const gy = gy0 + j;
      const my = gy * s + half;
      for (let i = 0; i < tw; i++) {
        const gx = gx0 + i;
        const mx = gx * s + half;
        const k = (j + P) * W2 + i + P;
        const fv = F[k];
        let c: number;
        if (fv <= 0) c = seaColour(f, gx, gy, mx, my, -fv, s);
        else {
          c = landColour(f, gx, gy, mx, my, fv, s);
          // dotted coastline on the sand edge
          if (F[k - 1] <= 0 || F[k + 1] <= 0 || F[k - W2] <= 0 || F[k + W2] <= 0) {
            if (((gx + gy) & 1) === 0 || s > 1) c = MP.coastInk;
          } else {
            const rid = R[k];
            const own = st.owner.get(rid);
            const rr = R[k + 1];
            const rd = R[k + W2];
            if (own !== undefined) {
              c = mix(c, own, 0.1);
              let edge = 0;
              for (let q = 0; q < 8 && !edge; q++) {
                const n = R[k + OFF[q]];
                if (n !== rid && n !== 0 && st.owner.get(n) !== own) edge = q < 4 ? 1 : 2;
              }
              if (edge === 1) c = mix(c, own, ((gx + gy) & 1) === 0 ? 0.85 : 0.3);
              else if (edge === 2 && s === 1) c = mix(c, own, 0.3);
            } else if (((rr !== rid && rr !== 0) || (rd !== rid && rd !== 0)) && ((gx + gy) & 1) === 0) {
              c = mix(c, MP.border, s > 1 ? 0.3 : 0.45);
            }
          }
        }
        d32[j * tw + i] = abgr(c);
      }
    }
    const mx0 = gx0 * s;
    const my0 = gy0 * s;
    const mx1 = (gx0 + tw) * s;
    const my1 = (gy0 + th) * s;
    if (s <= 4) drawRivers(p, f, s, gx0, gy0, mx0, my0, mx1, my1, F, W2, P);
    if (s <= 4) drawRoads(p, f, s, gx0, gy0, mx0, my0, mx1, my1, F, W2, P);
    if (s === 1) drawFeatures(p, f, gx0, gy0, tw, th, F, W2, P);
    else if (s <= 4) drawMiniFeatures(p, f, s, gx0, gy0, tw, th, F, W2, P);
  }
  // fog of war: cream parchment with a handwritten scribble texture, torn ragged edges, layered puffs, a
  // lavender shadow cast down and right onto what lies below, and loose puffs drifting off the boundary
  if (anyFog) {
    // puff layers inside the clouds: elongated, stair-stepped (shifted per row band)
    const puff = (gx: number, gy: number) => valueNoise((gx + rowOff[Math.max(0, Math.min(H2 - 1, gy - gy0 + P))] * 2) / 3, gy & ~1, 11, 74) > 0.56;
    // short wavy dashes: a slot of 14 texels per row holds one dash now and then, its middle lifted a row
    const dashAt = (gx: number, r: number, lift: boolean): boolean => {
      const q = gx + Math.floor(hash2(r, 3, 71) * 40);
      const slot = Math.floor(q / 14);
      const pos = q - slot * 14;
      const h = hash2(slot, r, 72);
      if (h > 0.09) return false;
      const len = 4 + Math.floor(h * 70);
      if (pos < 1 || pos >= 1 + len) return false;
      const mid = pos >= 3 && pos < len - 1;
      return lift ? mid : !mid;
    };
    for (let j = 0; j < th; j++) {
      const gy = gy0 + j;
      for (let i = 0; i < tw; i++) {
        const gx = gx0 + i;
        const k = (j + P) * W2 + i + P;
        const o = j * tw + i;
        if (FG[k]) {
          let c = MP.parch;
          if (s <= 4) {
            if (dashAt(gx, gy, false) || dashAt(gx, gy + 1, true)) c = hash2(gx >> 3, gy, 73) < 0.3 ? MP.parchDot : MP.parchLo;
            else if (hash2(gx, gy, 76) < 0.012) c = MP.parchHi;
            const pu = puff(gx, gy);
            if (pu && !puff(gx, gy + 1)) c = MP.parchRim;
            else if (!pu && (puff(gx, gy - 1) || puff(gx, gy - 2))) c = ((gx + gy) & 1) === 0 ? MP.parchDot : MP.parchLo;
            else if (pu && !puff(gx, gy - 1)) c = MP.parchHi;
          } else {
            const streak = hash2(Math.floor((gx + hash2(gy, 3, 71) * 40) / 11), gy >> 1, 72);
            if (streak < 0.12) c = MP.parchLo;
            else if (streak > 0.93) c = MP.parchHi;
          }
          if (!FG[k + W2]) c = MP.parchRim;
          else if (!FG[k - W2] || !FG[k - 1]) c = MP.parchHi;
          else if ((!FG[k + 2 * W2] || !FG[k + 1]) && ((gx + gy) & 1) === 0) c = MP.parchDot;
          d32[o] = abgr(c);
        } else {
          // the shadow band: solid for three rows under the rag, dithered out over three more; cast a little right
          let sh = 0;
          if (FG[k - W2] || FG[k - 2 * W2 - 1] || FG[k - 3 * W2 - 2] || FG[k - 1] || FG[k - 2]) sh = 2;
          else if (FG[k - 4 * W2 - 2] || FG[k - 5 * W2 - 3] || FG[k - 6 * W2 - 3] || FG[k - 3]) sh = 1;
          if (sh) {
            const c0 = fromAbgr(d32[o]);
            const sea = F[k] <= 0;
            const chk = ((gx + gy) & 1) === 0;
            d32[o] = abgr(sh === 2 ? mix(c0, MP.fogShadow, sea ? 0.62 : 0.42) : chk ? mix(c0, MP.fogShadow, sea ? 0.5 : 0.32) : mix(c0, MP.fogShadow2, sea ? 0.3 : 0.18));
          }
        }
      }
    }
    // loose puffs just off the torn edge, with their own little shadows
    if (s <= 4 && !allFog) {
      const fg = (i: number, j: number) => (i >= -P && j >= -P && i < tw + P && j < th + P ? FG[(j + P) * W2 + i + P] : fogAt(gx0 + i, gy0 + j));
      const GX = 11;
      const GY = 5;
      for (let cy = Math.floor((gy0 - 8) / GY); cy <= Math.floor((gy0 + th + 4) / GY); cy++)
        for (let cx = Math.floor((gx0 - 12) / GX); cx <= Math.floor((gx0 + tw + 12) / GX); cx++) {
          const h = hash2(cx, cy, 77);
          if (h > 0.42) continue;
          const px = cx * GX + Math.floor(hash2(cx, cy, 78) * GX) - gx0;
          const py = cy * GY + Math.floor(hash2(cx, cy, 79) * GY) - gy0;
          if (!fg(px, py - 4) || fg(px, py + 2) || fg(px - 6, py + 1) || fg(px + 6, py + 1)) continue;
          const rx = 3 + Math.floor(h * 14);
          const ry = 1 + Math.floor(hash2(cx, cy, 80) * 2);
          for (let j = -ry; j <= ry + 3; j++)
            for (let i = -rx; i <= rx + 2; i++) {
              const x = px + i;
              const y = py + j;
              if (x < 0 || y < 0 || x >= tw || y >= th || fg(x, y)) continue;
              const inside = (i / (rx + 0.5)) ** 2 + (j / (ry + 0.5)) ** 2 <= 1;
              const o = y * tw + x;
              if (inside) d32[o] = abgr(j === -ry ? MP.parchHi : j >= ry ? MP.parchRim : MP.parch);
              else if (((i - 2) / (rx + 0.5)) ** 2 + ((j - 3) / (ry + 0.5)) ** 2 <= 1) d32[o] = abgr(mix(fromAbgr(d32[o]), MP.fogShadow, ((x + y) & 1) === 0 ? 0.5 : 0.3));
            }
        }
    }
  }
  return p;
}

function abgr(c: number): number {
  return (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;
}

function fromAbgr(v: number): number {
  return ((v & 0xff) << 16) | (v & 0xff00) | ((v >> 16) & 0xff);
}

function seaColour(f: MapFields, gx: number, gy: number, mx: number, my: number, d: number, s: number): number {
  if (d < 0.14) return hash2(gx, gy, 81) < 0.12 ? MP.foam : MP.shelfLight;
  if (d < 0.42) return s === 1 && hash2(gx, gy, 82) < 0.03 ? MP.shelfLight : MP.shelf;
  if (d < 0.5) return ((gx + gy) & 1) === 0 || s > 1 ? MP.ring : MP.shelf;
  const dd = -f.bil(f.sd, mx, my) + (valueNoise(mx, my, 60, 83) - 0.5) * 1.6;
  const steps = [1.6, 4.5, 9, 15];
  const cols = [MP.seaNear, MP.sea1, MP.sea2, MP.sea3, MP.sea4];
  let b = 0;
  while (b < steps.length && dd > steps[b]) b++;
  let c = cols[b];
  // checker dither on the band edges
  if (b > 0 && dd - steps[b - 1] < 0.35 && ((gx + gy) & 1) === 0) c = cols[b - 1];
  if (s <= 4) {
    const st = hash2(Math.floor((gx + hash2(gy, 1, 84) * 30) / 6), gy, 85);
    if (st < 0.05) c = mix(c, MP.seaHi, 0.6);
    else if (st > 0.965) c = mix(c, MP.seaLo, 0.6);
    if (hash2(gx, gy, 86) < 0.0012) c = MP.sparkle;
  }
  return c;
}

function landColour(f: MapFields, gx: number, gy: number, mx: number, my: number, d: number, s: number): number {
  const n1 = valueNoise(mx, my, 13, 91) - 0.5;
  const fl = f.flags[f.cellIndex(mx, my)];
  const sandV = fl & 1 ? f.bil(f.sand, mx, my) + n1 * 0.4 : 0;
  if (d < 0.32 && fl & 16 && f.bil(f.hills, mx, my) + n1 * 0.3 > 0.5) {
    // rocky cliffs where the hills meet the sea
    const h = hash2(gx, gy >> 1, 92);
    if (d < 0.12) return h < 0.3 ? MP.peakRim : MP.cliffLo;
    return h < 0.12 ? MP.cliffLo : h > 0.85 ? MP.peakHi : MP.cliff;
  }
  if (d < 0.2 + n1 * 0.16 || sandV > 0.5) {
    const h = hash2(gx, gy, 92);
    return h < 0.07 ? MP.sandDot : h > 0.93 ? MP.sandHi : MP.sand;
  }
  const marshV = fl & 2 ? f.bil(f.marsh, mx, my) + n1 * 0.4 : 0;
  if (marshV > 0.45) {
    const w = valueNoise(gx * 0.5, gy * 1.4, 5, 93);
    if (w > 0.62) return w > 0.7 && hash2(gx, gy, 94) < 0.2 ? MP.marshHi : MP.marshWater;
    if (hash2(gx, gy, 95) < 0.08 || hash2(gx, gy - 1, 95) < 0.08) return MP.reed;
    return MP.marsh;
  }
  const mountV = fl & 4 ? f.bil(f.mount, mx, my) + n1 * 0.35 : 0;
  if (mountV > 0.32) {
    if (s > 4) return MP.rock;
    // the massif: rock shaded by the slope of the ridge field (lit from the upper left), scree flecks
    const h = hash2(gx >> 1, gy, 96);
    const ridgeAt = (x: number, y: number) => 1 - Math.abs(2 * valueNoise(x, y * 1.3, 64, 206) - 1);
    const ridge = ridgeAt(mx, my);
    const e = 4 * s;
    const lit = ridgeAt(mx - e, my) - ridgeAt(mx + e, my) + ridgeAt(mx, my - e) - ridgeAt(mx, my + e);
    let base = ridge > 0.62 ? mix(MP.rock, MP.peak, 0.45) : ridge < 0.3 ? mix(MP.rock, MP.hill, 0.3) : MP.rock;
    if (lit > 0.05) base = mix(base, MP.peakHi, 0.55);
    else if (lit < -0.05) base = mix(base, MP.peakShade, lit < -0.12 ? 0.6 : 0.35);
    else if (lit < -0.02 && ((gx + gy) & 1) === 0) base = mix(base, MP.peakShade, 0.35);
    if (h < 0.1) return mix(base, MP.rockDot, 0.7);
    if (hash2(gx, gy, 97) < 0.05) return MP.peakShade;
    return base;
  }
  const forestV = fl & 8 ? f.bil(f.forest, mx, my) + n1 * 0.4 : 0;
  if (forestV > 0.42) {
    if (s === 1) return hash2(gx, gy, 97) < 0.2 ? MP.leafDk : MP.forestFloor;
    const h = hash2(gx, gy, 98);
    return h < 0.3 ? MP.leafDk : h < 0.55 ? MP.leafMid : MP.leaf;
  }
  const hillV = fl & 16 ? f.bil(f.hills, mx, my) + n1 * 0.35 : 0;
  // organic patches of dry pale ground and lusher meadow (no grid anywhere), with a dithered fringe
  const patch = valueNoise(mx, my, 46, 105) * 0.62 + valueNoise(mx, my, 15, 106) * 0.38 + clamp01(1.2 - d) * 0.22;
  const drift = valueNoise(mx * 0.35, my, 40, 102);
  let base = MP.grass;
  let lo = MP.grassLo;
  let dk = MP.grassDk;
  let hi = MP.grassHi;
  let dens = 0.07;
  const paleAt = s > 1 ? 0.7 : 0.64;
  if (hillV > 0.5) {
    base = MP.hill;
    lo = MP.hillLo;
    dk = MP.moundRim;
    hi = MP.moundHi;
    dens = 0.08;
  } else if (patch > paleAt && !(patch < paleAt + 0.03 && ((gx + gy) & 1))) {
    if (s > 1) return mix(base, MP.pale, 0.55);
    const h = hash2(gx, gy, 103);
    return h < 0.05 ? MP.paleDot : h > 0.97 ? MP.grassLo : MP.pale;
  } else if (patch < 0.36 || (patch < 0.39 && ((gx + gy) & 1))) {
    base = MP.lush;
    lo = MP.grassDk;
    dens = 0.09;
  }
  if (drift > 0.62) base = mix(base, hi, 0.35);
  else if (drift < 0.35) base = mix(base, lo, 0.45);
  if (s > 2) return hash2(gx, gy, 104) < 0.12 ? lo : base;
  // tufts: little 'v' strokes (dark root, two blades, a light tip between)
  const dn = dens * 0.7;
  if (hash2(gx, gy, 104) < dn) return dk;
  if (hash2(gx + 1, gy + 1, 104) < dn || hash2(gx - 1, gy + 1, 104) < dn) return lo;
  if (hash2(gx, gy + 1, 104) < dn) return drift > 0.5 ? MP.grassTop : hi;
  return base;
}

function drawRivers(p: Pix, f: MapFields, s: number, gx0: number, gy0: number, mx0: number, my0: number, mx1: number, my1: number, F: Float32Array, W2: number, P: number): void {
  for (const rv of f.riversIn(mx0 - 4, my0 - 4, mx1 + 4, my1 + 4)) {
    const pts = rv.pts;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1];
      const [bx, by] = pts[i];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / Math.max(1, s * 0.5)));
      const wdt = s === 1 ? (i / pts.length > 0.5 ? 2 : 1) : 1;
      for (let k = 0; k <= n; k++) {
        const x = ax + ((bx - ax) * k) / n;
        const y = ay + ((by - ay) * k) / n;
        const tx = Math.floor(x / s) - gx0;
        const ty = Math.floor(y / s) - gy0;
        for (let dy = -1; dy <= wdt; dy++)
          for (let dx = -1; dx <= wdt; dx++) {
            const xx = tx + dx;
            const yy = ty + dy;
            if (xx < 0 || yy < 0 || xx >= p.w || yy >= p.h) continue;
            if (F[(yy + P) * W2 + xx + P] <= 0) continue;
            const edge = dx < 0 || dy < 0 || dx === wdt || dy === wdt;
            if (edge) {
              if (s === 1 && p.get(xx, yy) !== MP.water && p.get(xx, yy) !== MP.waterHi) p.set(xx, yy, dy === wdt ? MP.cliffLo : MP.sandDot);
            } else p.set(xx, yy, hash2(xx + gx0, yy + gy0, 61) < 0.15 ? MP.waterHi : MP.water);
          }
      }
    }
  }
}

function drawRoads(p: Pix, f: MapFields, s: number, gx0: number, gy0: number, mx0: number, my0: number, mx1: number, my1: number, F: Float32Array, W2: number, P: number): void {
  const edges = f.world.map.edges;
  for (const ei of f.edgesIn(mx0 - 4, my0 - 4, mx1 + 4, my1 + 4)) {
    const e = edges[ei];
    if (e.naval && s > 1) continue;
    const spacing = e.naval ? 5 : 3 * s;
    let acc = 0;
    let next = 0;
    const wp = e.waypoints;
    for (let i = 1; i < wp.length; i++) {
      const [ax, ay] = wp[i - 1];
      const [bx, by] = wp[i];
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 0.01) continue;
      while (next <= acc + len) {
        const t = (next - acc) / len;
        const x = ax + (bx - ax) * t;
        const y = ay + (by - ay) * t;
        next += spacing;
        if (x < mx0 - 1 || y < my0 - 1 || x >= mx1 + 1 || y >= my1 + 1) continue;
        const tx = Math.floor(x / s) - gx0;
        const ty = Math.floor(y / s) - gy0;
        if (tx < 0 || ty < 0 || tx >= p.w || ty >= p.h) continue;
        const fv = F[(ty + P) * W2 + tx + P];
        if (e.naval) {
          if (fv < -0.5) p.set(tx, ty, MP.naval);
        } else if (fv > 0.15) {
          p.set(tx, ty, MP.road);
          if (s === 1) p.set(tx, ty + 1, MP.roadDk, 120);
        }
      }
      acc += len;
    }
  }
}

/** Is a map px point inside (or near) a settlement / harbour? */
function blockedBy(list: Placed[], hs: Harbour[], x: number, y: number, pad: number): boolean {
  for (const b of list) if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) return true;
  for (const h of hs) if (Math.abs(x - (h.x + h.dx * 10)) < 22 + pad && Math.abs(y - (h.y + h.dy * 10)) < 22 + pad) return true;
  return false;
}

interface Feat {
  y: number;
  draw: () => void;
}

/** Trees, mounds, peaks, settlements and harbours of a full-detail block. */
function drawFeatures(p: Pix, f: MapFields, gx0: number, gy0: number, tw: number, th: number, F: Float32Array, W2: number, P: number): void {
  const x0 = gx0;
  const y0 = gy0;
  const x1 = gx0 + tw;
  const y1 = gy0 + th;
  const sets = f.settlementsNear(x0 - 40, y0 - 40, x1 + 40, y1 + 40);
  const hs: Harbour[] = [];
  const fields: { x: number; y: number; w: number; h: number; kind: number }[] = [];
  for (const b of f.settlementsNear(x0 - 200, y0 - 200, x1 + 200, y1 + 200)) {
    const h = f.harbourOf(b.id);
    if (h && h.x > x0 - 60 && h.x < x1 + 60 && h.y > y0 - 60 && h.y < y1 + 60) hs.push(h);
    for (const fp of f.fieldsOf(b.id)) if (fp.x < x1 + 2 && fp.y < y1 + 2 && fp.x + fp.w > x0 - 2 && fp.y + fp.h > y0 - 2) fields.push(fp);
  }
  const feats: Feat[] = [];
  // fields first, flat on the ground
  const FK = [
    [0xe4cc84, 0xcbae68],
    [0xc8c27a, 0xadaa64],
    [0xc4a07c, 0xa8845e],
    [0xdccca0, 0x8a9a58],
    [0xd8cc98, 0xc0b47c],
  ];
  for (const fp of fields) {
    const K = FK[fp.kind];
    for (let j = -1; j <= fp.h; j++)
      for (let i = -1; i <= fp.w; i++) {
        const x = fp.x + i - gx0;
        const y = fp.y + j - gy0;
        if (x < 0 || y < 0 || x >= tw || y >= th) continue;
        let c: number;
        if (i < 0 || j < 0 || i === fp.w || j === fp.h) {
          if (i < 0 || j < 0) continue;
          c = ((fp.x + i + fp.y + j) & 1) === 0 ? mix(K[1], MP.grassDk, 0.5) : K[1];
        }
        else if (fp.kind === 3) c = j % 3 === 1 && i % 2 === 0 ? K[1] : K[0];
        else if (fp.kind === 4) c = (i % 4 === 1 && j % 4 === 1) || (i % 4 === 2 && j % 4 === 1) ? MP.oliveDk : K[0];
        else c = j % 2 === 0 ? K[0] : K[1];
        p.set(x, y, c);
      }
    sets.push({ id: -1, x: fp.x - 1, y: fp.y - 1, w: fp.w + 2, h: fp.h + 2, sprite: null as unknown as PropSprite });
  }
  const coastAt = (x: number, y: number) => {
    const tx = Math.floor(x) - gx0;
    const ty = Math.floor(y) - gy0;
    if (tx >= -P && ty >= -P && tx < tw + P && ty < th + P) return F[(ty + P) * W2 + tx + P];
    return f.coast(x, y);
  };
  const lx = (x: number) => x - gx0;
  const ly = (y: number) => y - gy0;
  // mountain ranges: peaks strung along ridge lines, boulders between
  const PGX = 13;
  const PGY = 9;
  for (let gy = Math.floor((y0 - 10) / PGY); gy <= Math.floor((y1 + 40) / PGY); gy++)
    for (let gx = Math.floor((x0 - 34) / PGX); gx <= Math.floor((x1 + 34) / PGX); gx++) {
      const x = gx * PGX + hash2(gx, gy, 201) * PGX;
      const y = gy * PGY + hash2(gx, gy, 202) * PGY;
      const n = valueNoise(x, y, 13, 91) - 0.5;
      const mv = f.bil(f.mount, x, y) + n * 0.35;
      const hv = f.bil(f.hills, x, y) + n * 0.35;
      const ridge = 1 - Math.abs(2 * valueNoise(x, y * 1.3, 64, 206) - 1);
      const big = mv > 0.42 && ridge > 0.7 + clamp01(0.7 - mv) * 0.3;
      const rock = !big && mv > 0.4 && hash2(gx, gy, 207) < 0.22;
      const small = !big && !rock && hv > 0.6 && mv < 0.3 && hash2(gx, gy, 203) < 0.015;
      if (!big && !small && !rock) continue;
      if (coastAt(x, y) < 0.5 || blockedBy(sets, hs, x, y, 6)) continue;
      if (rock) {
        const rr = 1 + Math.floor(hash2(gx, gy, 208) * 2);
        feats.push({ y, draw: () => drawBoulder(p, Math.round(lx(x)), Math.round(ly(y)), rr) });
        continue;
      }
      const hw = big ? 7 + Math.floor(hash2(gx, gy, 204) * 4 + ridge * 5 + clamp01(mv - 0.5) * 6) : 4 + Math.floor(hash2(gx, gy, 204) * 3);
      const h = Math.round(hw * (1.0 + hash2(gx, gy, 205) * 0.45));
      const snow = big && mv > 0.62 && h > 12;
      feats.push({ y, draw: () => drawPeak(p, Math.round(lx(x)), Math.round(ly(y)), hw, h, snow, gx * 31 + gy) });
    }
  // rolling mounds on the hills
  for (let gy = Math.floor((y0 - 10) / 12); gy <= Math.floor((y1 + 16) / 12); gy++)
    for (let gx = Math.floor((x0 - 20) / 18); gx <= Math.floor((x1 + 20) / 18); gx++) {
      const x = gx * 18 + hash2(gx, gy, 211) * 18;
      const y = gy * 12 + hash2(gx, gy, 212) * 12;
      const n = valueNoise(x, y, 13, 91) - 0.5;
      const hv = f.bil(f.hills, x, y) + n * 0.35;
      const mv = f.bil(f.mount, x, y) + n * 0.35;
      if (hv < 0.5 || mv > 0.3 || hash2(gx, gy, 213) < 0.55) continue;
      if (coastAt(x, y) < 0.5 || blockedBy(sets, hs, x, y, 4)) continue;
      const w = 7 + Math.floor(hash2(gx, gy, 214) * 6);
      feats.push({ y, draw: () => drawMound(p, Math.round(lx(x)), Math.round(ly(y)), w, Math.round(w * 0.5)) });
    }
  // forests: clustered blob trees; groves and single trees on the plains
  const TG = 6;
  for (let gy = Math.floor((y0 - 8) / TG); gy <= Math.floor((y1 + 12) / TG); gy++)
    for (let gx = Math.floor((x0 - 10) / TG); gx <= Math.floor((x1 + 10) / TG); gx++) {
      const x = gx * TG + hash2(gx, gy, 221) * TG;
      const y = gy * TG + hash2(gx, gy, 222) * TG;
      const n = valueNoise(x, y, 13, 91) - 0.5;
      const fv = f.bil(f.forest, x, y) + n * 0.4;
      const mv = f.bil(f.mount, x, y) + n * 0.35;
      let tree = fv > 0.48;
      if (!tree && mv < 0.3) {
        const grove = valueNoise(x, y, 90, 223);
        tree = (grove > 0.78 && hash2(gx, gy, 224) < 0.75) || hash2(gx, gy, 225) < 0.012;
        if (tree && f.bil(f.marsh, x, y) > 0.4) tree = false;
      }
      if (!tree) continue;
      if (coastAt(x, y) < 0.45 || blockedBy(sets, hs, x, y, 3)) continue;
      const hv = f.bil(f.hills, x, y);
      if (fv > 0.48 && hv > 0.45 && hash2(gx, gy, 227) < 0.4) {
        // pines on the high woods
        feats.push({ y, draw: () => drawCypress(p, Math.round(lx(x)), Math.round(ly(y)) + 3, 7 + Math.floor(hash2(gx, gy, 228) * 4)) });
        continue;
      }
      const r = (fv > 0.48 ? 4 : 3) + Math.floor(hash2(gx, gy, 226) * 3);
      feats.push({ y, draw: () => drawTree(p, Math.round(lx(x)), Math.round(ly(y)), r, gx * 7 + gy * 13) });
    }
  for (const b of sets) {
    if (b.id < 0) continue;
    feats.push({
      y: b.y + b.h - 6,
      draw: () => {
        // built to the shore: no houses over the sea
        const sp = b.sprite.pix;
        for (let j = 0; j < sp.h; j++) {
          const ty = b.y + j - gy0;
          if (ty < 0 || ty >= th) continue;
          for (let i = 0; i < sp.w; i++) {
            const tx = b.x + i - gx0;
            if (tx < 0 || tx >= tw) continue;
            const a = sp.alpha(i, j);
            if (!a) continue;
            const fv = F[(ty + P) * W2 + tx + P];
            if (fv < -0.12) continue;
            p.set(tx, ty, fv < 0.02 && a > 200 ? MP.stoneLo : sp.get(i, j), a);
          }
        }
      },
    });
  }
  for (const h of hs) feats.push({ y: h.y + 200, draw: () => p.blit(h.pix, h.x - h.ox - gx0, h.y - h.oy - gy0) });
  feats.sort((a, b) => a.y - b.y);
  for (const ft of feats) ft.draw();
}

/** Simplified peaks and settlements of a zoomed-out block. */
function drawMiniFeatures(p: Pix, f: MapFields, s: number, gx0: number, gy0: number, tw: number, th: number, F: Float32Array, W2: number, P: number): void {
  const mx0 = gx0 * s;
  const my0 = gy0 * s;
  const mx1 = (gx0 + tw) * s;
  const my1 = (gy0 + th) * s;
  const feats: Feat[] = [];
  const G = 5 * s;
  for (let gy = Math.floor((my0 - 2 * G) / G); gy <= Math.floor((my1 + 2 * G) / G); gy++)
    for (let gx = Math.floor((mx0 - 2 * G) / G); gx <= Math.floor((mx1 + 2 * G) / G); gx++) {
      const x = gx * G + hash2(gx, gy, 301) * G;
      const y = gy * G + hash2(gx, gy, 302) * G;
      const mv = f.bil(f.mount, x, y) + (valueNoise(x, y, 13, 91) - 0.5) * 0.35;
      const ridge = 1 - Math.abs(2 * valueNoise(x, y * 1.3, 64, 206) - 1);
      if (mv < 0.42 || ridge < 0.74 - clamp01(0.7 - mv) * 0.3 || f.coast(x, y) < 0.5) continue;
      const hw = 3 + Math.floor(hash2(gx, gy, 303) * 2);
      feats.push({ y, draw: () => drawPeak(p, Math.round(x / s - gx0), Math.round(y / s - gy0), hw, hw + 1, mv > 0.75, gx + gy * 7) });
    }
  for (const b of f.settlementsNear(mx0 - 40, my0 - 40, mx1 + 40, my1 + 40)) {
    const sp = b.sprite.pix;
    const kind = f.world.info(b.id).kind;
    if (kind === 'plot' && s > 2) {
      feats.push({
        y: b.y + b.h,
        draw: () => {
          const tx = Math.round((b.x + b.sprite.ax) / s - gx0);
          const ty = Math.round((b.y + b.sprite.ay) / s - gy0);
          p.set(tx, ty, 0xc06a50);
          p.set(tx, ty + 1, MP.stoneLo);
        },
      });
      continue;
    }
    feats.push({
      y: b.y + b.h,
      draw: () => {
        const ox = Math.round(b.x / s) - gx0;
        const oy = Math.round(b.y / s) - gy0;
        const sw = Math.ceil(sp.w / s);
        const sh = Math.ceil(sp.h / s);
        for (let j = 0; j < sh; j++)
          for (let i = 0; i < sw; i++) {
            // the most opaque, darkest-but-not-shadow sample of the texel
            const sx = Math.min(sp.w - 1, i * s + (s >> 1));
            const sy = Math.min(sp.h - 1, j * s + (s >> 1));
            if (sp.alpha(sx, sy) < 200) continue;
            p.set(ox + i, oy + j, sp.get(sx, sy));
          }
      },
    });
  }
  void F;
  void W2;
  void P;
  feats.sort((a, b) => a.y - b.y);
  for (const ft of feats) ft.draw();
}

/** A painted mountain peak (lit west face, lavender shade east, snow cap, SE shadow). */
export function drawPeak(p: Pix, cx: number, by: number, hw: number, h: number, snow: boolean, seed: number): void {
  const top = by - h;
  const halfAt = (y: number) => {
    const t = (y - top) / h;
    return Math.max(0, Math.round(hw * t + (hash2(y, seed, 401) - 0.5) * 1.4 * t));
  };
  // ground shadow to the south-east
  for (let y = top + Math.floor(h * 0.4); y <= by + 1; y++) {
    const hx = halfAt(Math.min(y, by));
    const len = Math.round((y - top) * 0.55);
    for (let x = cx + hx + 1; x <= cx + hx + len; x++) p.set(x, y + 1, MP.shadow, 70);
  }
  for (let y = top; y <= by; y++) {
    const t = (y - top) / h;
    const hx = halfAt(y);
    const ridge = cx + Math.round((hash2(y >> 1, seed, 402) - 0.5) * 2 * t);
    for (let x = cx - hx; x <= cx + hx; x++) {
      const lit = x < ridge;
      const cap = snow && t < 0.32 + (hash2(x, seed, 403) - 0.5) * 0.12;
      let c = lit ? (cap ? MP.snow : t < 0.5 ? MP.peakHi : MP.peak) : cap ? MP.snowShade : MP.peakShade;
      if (!cap && lit && hash2(x, y, seed) < 0.1) c = MP.peak;
      if (!cap && !lit && (hash2(x, y, seed + 3) < 0.14 || x > ridge + hx * 0.6)) c = MP.peakDeep;
      if (x === ridge && !cap) c = lit ? MP.peakHi : MP.peakShade;
      if (x === cx - hx || x === cx + hx || y === by) c = x === cx + hx ? MP.peakRim : y === by ? MP.peakDeep : MP.peakRim;
      p.set(x, y, c);
    }
  }
  p.set(cx, top - 1, MP.peakRim);
}

/** A small rock lump (mauve-grey, light top, soft shadow). */
export function drawBoulder(p: Pix, cx: number, cy: number, r: number): void {
  for (let i = 0; i <= r + 2; i++) p.set(cx + i, cy + r + 1, MP.shadow, 60);
  for (let j = -r; j <= r; j++)
    for (let i = -r - 1; i <= r + 1; i++) {
      if ((i * i) / ((r + 1.5) * (r + 1.5)) + (j * j) / ((r + 0.5) * (r + 0.5)) > 1) continue;
      const edge = (i * i) / ((r + 0.5) * (r + 0.5)) + (j * j) / ((r - 0.2 + 0.5) * (r - 0.2 + 0.5)) > 1;
      p.set(cx + i, cy + j, edge ? MP.peakRim : i + j < 0 ? MP.peakHi : MP.peakShade);
    }
}

/** A rolling grass mound. */
export function drawMound(p: Pix, cx: number, by: number, hw: number, h: number): void {
  for (let i = 0; i <= hw + 2; i++) p.set(cx + i + 1, by + 1, MP.shadow, 60);
  for (let y = by - h; y <= by; y++) {
    const v = (by - y) / h;
    const half = Math.round(hw * Math.sqrt(Math.max(0, 1 - v * v)));
    for (let x = cx - half; x <= cx + half; x++) {
      const u = (x - cx) / Math.max(1, hw);
      let c = u - v * 0.6 < -0.45 ? MP.moundHi : u > 0.35 ? MP.moundLo : MP.mound;
      if (y === by || x === cx - half || x === cx + half) c = ((x + y) & 1) === 0 ? MP.moundRim : MP.moundLo;
      else if (y === by - h && x !== cx) c = MP.moundHi;
      p.set(x, y, c);
    }
  }
}

// ------------------------------------------------------------------ sprites

/** An army miniature: a standard with the team colour over three soldiers with team shields. */
export function armyPix(team: number): Pix {
  const p = new Pix(16, 17);
  // shadow
  for (let i = 1; i < 15; i++) for (let j = 14; j < 17; j++) if (((i - 8) / 7) ** 2 + ((j - 15) / 1.6) ** 2 <= 1) p.set(i, j, MP.shadow, 90);
  const dark = mix(team, 0x000000, 0.45);
  const lite = mix(team, 0xffffff, 0.35);
  const soldier = (x: number, y: number) => {
    // helmet, face, tunic, legs, shield
    p.rect(x + 1, y, 3, 2, 0xd2b68e);
    p.set(x + 2, y, 0xa12735);
    p.rect(x + 1, y + 2, 3, 1, 0xdbac99);
    p.rect(x + 1, y + 3, 3, 3, 0xd6c0a8);
    p.set(x + 1, y + 6, 0xa87464), p.set(x + 3, y + 6, 0xa87464);
    p.rect(x - 1, y + 3, 3, 3, team);
    p.set(x - 1, y + 3, lite);
    p.set(x + 1, y + 5, dark);
    p.vline(x + 4, y - 3, y + 5, 0x95593e);
  };
  soldier(3, 7);
  soldier(9, 6);
  soldier(6, 9);
  // standard
  p.vline(2, 0, 10, MP.woodDk);
  p.rect(3, 0, 5, 4, team);
  p.hline(3, 7, 0, lite);
  p.hline(3, 7, 3, dark);
  p.outline(0x442618);
  return p;
}

/** A parchment scroll for a name label: (w x h) of paper with a teal inner frame between two rolled ends. */
export function platePix(w: number, h: number, accent: number | null): Pix {
  const p = new Pix(w + 8, h + 2);
  const x0 = 4;
  for (let i = 0; i < w + 6; i++) p.set(i + 2, h + 1, MP.shadow, 70);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) p.set(x0 + i, j, j === 0 ? MP.plateHi : j === h - 1 ? MP.plateLo : MP.plate);
  p.hline(x0, x0 + w - 1, 0, MP.plateRim);
  p.hline(x0, x0 + w - 1, h - 1, MP.plateRim);
  p.hline(x0 + 1, x0 + w - 2, 1, MP.tealHi);
  p.hline(x0 + 1, x0 + w - 2, h - 2, MP.teal);
  // rolled ends: little cylinders a row taller than the paper, lit on their left
  for (const cx of [0, w + 4]) {
    for (let j = 0; j <= h; j++) {
      p.set(cx, j, MP.plateRim);
      p.set(cx + 1, j, j === 0 || j === h ? MP.plateRim : MP.plateCap);
      p.set(cx + 2, j, j === 0 || j === h ? MP.plateRim : MP.plateHi);
      p.set(cx + 3, j, j === 0 || j === h ? MP.plateRim : MP.plateCap);
    }
    p.set(cx + 1, Math.floor(h / 2), MP.plateRim);
    p.set(cx + 3, Math.floor(h / 2), MP.plateRim);
  }
  if (accent !== null) {
    p.rect(x0 + 2, 2, 3, h - 4, accent);
    p.vline(x0 + 4, 2, h - 3, mix(accent, 0, 0.35));
  }
  return p;
}

/** Cells of a camp zone: the region's cells within ~4 cells of its label (tile-snapped, irregular). */
export function campZone(f: MapFields, loc: number): number[] {
  const r = f.world.info(loc);
  const c0x = Math.floor(r.label[0] / f.cell);
  const c0y = Math.floor(r.label[1] / f.cell);
  const out: number[] = [];
  for (let dy = -5; dy <= 5; dy++)
    for (let dx = -5; dx <= 5; dx++) {
      const cx = c0x + dx;
      const cy = c0y + dy;
      if (cx < 0 || cy < 0 || cx >= f.cw || cy >= f.ch) continue;
      const i = cy * f.cw + cx;
      if (f.mask[i] !== loc || f.sd[i] < 0) continue;
      const rr = 2.2 + hash2(cx, cy, loc) * 1.4;
      if (dx * dx + dy * dy * 1.3 <= rr * rr) out.push(i);
    }
  return out;
}

/** The camp plot overlay (dotted orange-brown outline, 2x2 checker fill). `phase` shifts the dots (marching ants). */
export function campPlotPix(f: MapFields, cells: number[], active: boolean, phase: number): { pix: Pix; x: number; y: number } {
  let cx0 = Infinity;
  let cy0 = Infinity;
  let cx1 = -Infinity;
  let cy1 = -Infinity;
  const set = new Set(cells);
  for (const i of cells) {
    const cx = i % f.cw;
    const cy = (i - cx) / f.cw;
    cx0 = Math.min(cx0, cx);
    cy0 = Math.min(cy0, cy);
    cx1 = Math.max(cx1, cx);
    cy1 = Math.max(cy1, cy);
  }
  if (!cells.length) return { pix: new Pix(1, 1), x: 0, y: 0 };
  const C = f.cell;
  const W = (cx1 - cx0 + 1) * C + 2;
  const H = (cy1 - cy0 + 1) * C + 2;
  const p = new Pix(W, H);
  const inside = (x: number, y: number) => {
    if (x < 0 || y < 0) return false;
    const cx = cx0 + Math.floor(x / C);
    const cy = cy0 + Math.floor(y / C);
    return set.has(cy * f.cw + cx);
  };
  const A = active ? MP.campActive : MP.campA;
  for (let y = 0; y < H - 2; y++)
    for (let x = 0; x < W - 2; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      if (edge) {
        if (((x + y + phase) & 1) === 0) p.set(x + 1, y + 1, MP.campBorder);
        continue;
      }
      const chk = ((x >> 1) + (y >> 1)) & 1;
      p.set(x + 1, y + 1, chk ? A : MP.campB, active ? 130 : 95);
    }
  return { pix: p, x: cx0 * C - 1, y: cy0 * C - 1 };
}

/** A dotted outline of a region (selection), at `s` map px per texel. */
export function regionOutlinePix(f: MapFields, loc: number, s: number, col: number): { pix: Pix; x: number; y: number } | null {
  let cx0 = Infinity;
  let cy0 = Infinity;
  let cx1 = -Infinity;
  let cy1 = -Infinity;
  for (let i = 0; i < f.mask.length; i++) {
    if (f.mask[i] !== loc) continue;
    const cx = i % f.cw;
    const cy = (i - cx) / f.cw;
    if (cx < cx0) cx0 = cx;
    if (cx > cx1) cx1 = cx;
    if (cy < cy0) cy0 = cy;
    if (cy > cy1) cy1 = cy;
  }
  if (cx0 === Infinity) return null;
  const mx0 = (cx0 - 1) * f.cell;
  const my0 = (cy0 - 1) * f.cell;
  const W = Math.ceil(((cx1 - cx0 + 3) * f.cell) / s);
  const H = Math.ceil(((cy1 - cy0 + 3) * f.cell) / s);
  const inside = new Uint8Array(W * H);
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const mx = mx0 + i * s + s / 2;
      const my = my0 + j * s + s / 2;
      inside[j * W + i] = f.regionAt(mx, my) === loc && f.coast(mx, my) > 0 ? 1 : 0;
    }
  const p = new Pix(W, H);
  for (let j = 1; j < H - 1; j++)
    for (let i = 1; i < W - 1; i++) {
      const k = j * W + i;
      if (!inside[k]) continue;
      if (!inside[k - 1] || !inside[k + 1] || !inside[k - W] || !inside[k + W]) {
        if (((i + j) & 1) === 0) p.set(i, j, col);
        else p.set(i, j, MP.ink, 140);
      }
    }
  return { pix: p, x: mx0, y: my0 };
}
