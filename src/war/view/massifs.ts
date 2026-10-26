/**
 * Mountains drawn as massif sprites (public/war/biomes/mountains, kind 'massif') instead of stacked
 * cliff levels. The impassable rock of the mountains biome is drawn flat at its foot height (./iso.ts)
 * under the massifs the region generator placed (src/war/region/massifs.ts): the region's objects of
 * kind 'massif', foot point = the footprint's south vertex. This draws exactly that list, in that
 * order, live and baked alike; nothing is picked here.
 *
 * Depth: a massif sorts at its south vertex (x + y = v), as units, corpses and objects sort at their
 * foot. A tile whose line of sight crosses the footprint is behind it (sorts before; a man there whose
 * body the sprite's pixels cover shows as a silhouette); any other tile the sprite reaches over sorts
 * just past the massif (`depth()`), so a man or a corpse in front of the mountain's foot is never drawn
 * under it. The base the sprite paints round its footprint is closed to movement (RegionData.blocked).
 * `screeOf` gives the scree ring the ground draws round the rock.
 */
import type { RegionData } from '../types';
import type { ObjDef } from './art';
import { decodeBiomes } from '../regions/visual';
import { behindFootprint, edgeDistance, spriteTiles, type PlacedMassif } from '../region/massifs';
import { hash } from './autotile';
import { canvas } from './canvas';

export interface MassifDef extends ObjDef {
  footprint: [number, number];
  /** Per sprite column: its first opaque row (h where the column is empty). */
  top: Int16Array;
}
export type Massif = PlacedMassif<MassifDef>;

/** World px a man's (or a lying corpse's) sprite reaches left and right of his foot. */
const REACH = 32;

/** A well-mixed position hash. */
const mix = (x: number, y: number, k: number) => {
  let h = hash(x, y, k);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
};

export class Massifs {
  /** The region's massifs, in its order (the draw order among massifs of one depth). */
  readonly list: Massif[] = [];
  /** Per tile: 1 = mountain drawn flat under massifs. */
  readonly mask: Uint8Array;
  /** Per tile: 1 = inside a massif's footprint. */
  readonly foot: Uint8Array;
  /** Per tile: the least depth a thing standing there sorts at (past the massifs it stands in front of). */
  private front: Float32Array;

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
    const n = r.w * r.h, byId = new Map(defs.map((d) => [d.id, d]));
    this.mask = mask;
    this.foot = new Uint8Array(n);
    this.front = new Float32Array(n);
    for (const o of r.objects ?? []) {
      const def = byId.get(o.id);
      if (!def) continue;
      const [fw, fh] = def.footprint;
      this.list.push({ def, x0: o.x - fw, y0: o.y - fh, fw, fh, v: o.x + o.y, shade: o.shade ?? 1 });
    }
    const reach = new Map<MassifDef, Int16Array>();
    for (const m of this.list) {
      for (let y = Math.max(0, m.y0); y < Math.min(r.h, m.y0 + m.fh); y++) for (let x = Math.max(0, m.x0); x < Math.min(r.w, m.x0 + m.fw); x++) this.foot[y * r.w + x] = 1;
      let top = reach.get(m.def);
      if (!top) reach.set(m.def, (top = reachTop(m.def.top)));
      this.sortRule(m, top);
    }
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

  /** Tiles not behind the footprint where a man's sprite would overlap the massif's pixels sort just past it. */
  private sortRule(m: Massif, top: Int16Array): void {
    const { w, h } = this.r;
    spriteTiles(m, w, h, REACH, (x, y, px, py) => {
      if (behindFootprint(m, x + 0.5, y + 0.5)) return;
      const c = Math.max(0, Math.min(m.def.w - 1, px));
      if (px + REACH < 0 || px - REACH >= m.def.w || top[c] > py) return;
      const i = y * w + x;
      this.front[i] = Math.max(this.front[i], m.v + 0.01);
    });
  }
}

/** Per sprite column: the highest first opaque row within REACH px of it. */
function reachTop(top: Int16Array): Int16Array {
  const out = new Int16Array(top.length);
  for (let c = 0; c < top.length; c++) {
    let t = 32767;
    for (let k = Math.max(0, c - REACH); k <= Math.min(top.length - 1, c + REACH); k++) t = Math.min(t, top[k]);
    out[c] = t;
  }
  return out;
}

/** First opaque row of each column of an image. */
export function columnTops(img: CanvasImageSource & { width: number; height: number }): Int16Array {
  const c = canvas(img.width, img.height);
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, img.width, img.height).data, top = new Int16Array(img.width).fill(img.height);
  for (let x = 0; x < img.width; x++) for (let y = 0; y < img.height; y++) if (px[(y * img.width + x) * 4 + 3] > 128) { top[x] = y; break; }
  return top;
}
