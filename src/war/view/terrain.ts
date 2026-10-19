/**
 * Greybox iso terrain baked into canvases. Any world-px rectangle can be baked at any scale (only
 * that rectangle of the canvas is cleared and painted): the scene bakes 512 px chunks on demand at
 * 1x (zoomed in) and 1/4 (mid zoom), and a whole-map overview at 1/8 in bands over several frames. Tiles are painted back to front (x + y ascending); each draws its own
 * front walls down to the lower neighbour (or the slab base at the map edge), so cliffs, plateau
 * edges and riverbanks stand as vertical faces. Light from the NW: tops shade by slope and
 * altitude, back rims catch light, front rims and the SE faces fall in shadow; tall walls carry a
 * line per level.
 */
import type { RegionData, TerrainKind } from '../types';
import { HH, HW, IsoMap, LH, ZBASE } from './iso';
import type { MapData, Tint } from './mapModes';

export const CHUNK_PX = 512;
export const OVERVIEW_SCALE = 1 / 8;

type RGB = [number, number, number];
const TINT: Record<TerrainKind, RGB> = {
  grass: [118, 140, 84], forest: [62, 96, 58], sand: [196, 180, 128], marsh: [98, 112, 84],
  rock: [128, 122, 116], road: [168, 146, 108], snow: [226, 228, 232], dirt: [140, 118, 86],
};
const SHALLOW: RGB = [98, 150, 170];
const DEEP: RGB = [40, 74, 112];
const CLIFF: RGB = [118, 108, 98];
const ZONE_NOBUILD: RGB = [255, 255, 255];
const ZONE_ENTRY: RGB = [255, 224, 112];

/** tint: the view mode's (./mapModes.ts), baked over the ground by `map`; grid: the dev tile grid; zones: no-build and entry borders. */
export interface BakeOpts { tint: Tint | null; map: MapData | null; grid: boolean; zones: boolean }

/** Per-region data shared by every bake. */
export class TerrainBaker {
  private zone: Uint8Array; // 0 none, 1 no-build, 2 entry

  constructor(readonly r: RegionData, readonly iso: IsoMap) {
    this.zone = new Uint8Array(r.w * r.h);
    const mark = (b: { x: number; y: number; w: number; h: number }, k: number) => {
      for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) this.zone[y * r.w + x] = k;
    };
    r.noBuild.forEach((b) => mark(b, 1));
    r.entries.forEach((b) => mark(b, 2));
  }

  /**
   * Paint the world rect (x0, y0, w, h) at `scale` canvas px per world px, its top-left at canvas
   * (cx, cy); only that canvas rect is cleared and painted.
   */
  bake(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, scale: number, o: BakeOpts, cx = 0, cy = 0): void {
    const { r, iso } = this;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath();
    ctx.rect(cx, cy, Math.ceil(w * scale), Math.ceil(h * scale));
    ctx.clip();
    ctx.clearRect(cx, cy, Math.ceil(w * scale), Math.ceil(h * scale));
    ctx.setTransform(scale, 0, 0, scale, cx - x0 * scale, cy - y0 * scale);
    const fine = scale >= 0.5; // rims, canopy blobs and strata lines only show close up
    ctx.lineJoin = 'round';
    const seam = 1 / scale; // a 1 canvas-px stroke in the fill colour closes antialias seams
    const umin = Math.floor((x0 - iso.OX) / HW) - 1, umax = Math.ceil((x0 + w - iso.OX) / HW) + 1;
    const vmin = Math.floor((y0 - iso.OY - 2 * HH + ZBASE * LH) / HH) - 1;
    const vmax = Math.ceil((y0 + h - iso.OY + 8 * LH) / HH) + 2;
    const sx = (x: number, y: number) => iso.OX + (x - y) * HW;
    const sy = (x: number, y: number, z: number) => iso.OY + (x + y) * HH - z * LH;
    const fill = (c: RGB, k: number) => `rgb(${Math.min(255, c[0] * k) | 0},${Math.min(255, c[1] * k) | 0},${Math.min(255, c[2] * k) | 0})`;
    const H = (x: number, y: number) => r.height[Math.max(0, Math.min(r.h - 1, y)) * r.w + Math.max(0, Math.min(r.w - 1, x))];

    for (let v = Math.max(0, vmin); v <= Math.min(r.w + r.h - 2, vmax); v++) {
      let u = Math.max(umin, -v, v - 2 * (r.h - 1));
      if ((u + v) & 1) u++;
      for (; u <= Math.min(umax, v, 2 * (r.w - 1) - v); u += 2) {
        const x = (u + v) / 2, y = (v - u) / 2;
        if (x < 0 || y < 0 || x >= r.w || y >= r.h) continue;
        const i = y * r.w + x, z = iso.z[i], wtr = r.water[i];
        const base: RGB = wtr === 2 ? DEEP : wtr === 1 ? SHALLOW : TINT[r.terrain[i]];
        const tx = sx(x, y), ty = sy(x, y, z);
        const zE = iso.zt(x + 1, y), zS = iso.zt(x, y + 1);
        // top: terrain colour, shaded by slope toward the NW light and by altitude
        let c = base, k = 1;
        if (!wtr) {
          // hillsides: the gradient over +-3 tiles (each step clamped to 1, so a cliff foot or top is
          // not a slope) shades a whole slope, not just its risers. Light from the NW (-x): ground
          // rising toward +x / +y faces it
          const d = (nx: number, ny: number) => Math.max(-1, Math.min(1, H(nx, ny) - r.height[i]));
          const gx = (d(x + 3, y) - d(x - 3, y)) / 6, gy = (d(x, y + 3) - d(x, y - 3)) / 6;
          k = 0.8 + r.height[i] * 0.035 + gx * 0.9 + gy * 0.45;
        }
        const zk = o.zones ? this.zone[i] : 0;
        if (zk) {
          const t = zk === 2 ? 0.3 : 0.14, zc = zk === 2 ? ZONE_ENTRY : ZONE_NOBUILD;
          c = [c[0] * k * (1 - t) + zc[0] * t, c[1] * k * (1 - t) + zc[1] * t, c[2] * k * (1 - t) + zc[2] * t];
          k = 1;
        }
        const col = fill(c, k);
        // front walls: SE face toward (x+1, y), SW face toward (x, y+1). A one-level step between
        // land tiles (a walkable slope) is a soft riser in the top's own colour, so a hillside reads
        // as one slope; cliffs, banks and the map edge are dark walls with rims
        const soft = (n: number) => !wtr && z - n <= 1 && n % 1 === 0;
        const wall = (n: number, shade: number) => (soft(n) ? fill(c, k * (shade + 0.32)) : fill(z - n >= 2 && !wtr ? CLIFF : base, shade));
        if (zE < z) this.face(ctx, tx + HW, ty + HH, tx, ty + 2 * HH, z - zE, wall(zE, 0.52), seam);
        if (zS < z) this.face(ctx, tx, ty + 2 * HH, tx - HW, ty + HH, z - zS, wall(zS, 0.62), seam);
        ctx.beginPath();
        ctx.moveTo(tx, ty); ctx.lineTo(tx + HW, ty + HH); ctx.lineTo(tx, ty + 2 * HH); ctx.lineTo(tx - HW, ty + HH); ctx.closePath();
        ctx.fillStyle = col; ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = seam; ctx.stroke();

        if (!fine) continue;
        if (r.terrain[i] === 'forest' && !wtr && !o.tint && ((x * 7 + y * 13) % 3 === 0)) {
          ctx.fillStyle = fill(base, 0.62 * k); // a canopy blob
          ctx.beginPath(); ctx.ellipse(tx, ty + HH - 2, HW * 0.42, HH * 0.6, 0, 0, Math.PI * 2); ctx.fill();
        }
        // rims: back edges toward lower ground catch the light, front edges over a drop go dark
        ctx.lineWidth = Math.max(seam, 1);
        const rim = (ax: number, ay: number, bx: number, by: number, s: string) => {
          ctx.strokeStyle = s; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        };
        const drop = (n: number) => n < z - 0.5 && !soft(n);
        if (drop(iso.zt(x - 1, y))) rim(tx - HW, ty + HH, tx, ty, 'rgba(255,250,230,0.35)');
        if (drop(iso.zt(x, y - 1))) rim(tx, ty, tx + HW, ty + HH, 'rgba(255,250,230,0.35)');
        if (drop(zE)) rim(tx + HW, ty + HH, tx, ty + 2 * HH, 'rgba(20,16,10,0.45)');
        if (drop(zS)) rim(tx, ty + 2 * HH, tx - HW, ty + HH, 'rgba(20,16,10,0.45)');
        if (zk) {
          const ec = zk === 2 ? 'rgba(255,224,112,0.9)' : 'rgba(255,255,255,0.6)';
          const zn = (nx: number, ny: number) => (nx < 0 || ny < 0 || nx >= r.w || ny >= r.h ? 0 : this.zone[ny * r.w + nx]);
          if (zn(x - 1, y) !== zk) rim(tx - HW, ty + HH, tx, ty, ec);
          if (zn(x, y - 1) !== zk) rim(tx, ty, tx + HW, ty + HH, ec);
          if (zn(x + 1, y) !== zk) rim(tx + HW, ty + HH, tx, ty + 2 * HH, ec);
          if (zn(x, y + 1) !== zk) rim(tx, ty + 2 * HH, tx - HW, ty + HH, ec);
        }
        if (o.grid) {
          ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = seam;
          ctx.beginPath();
          ctx.moveTo(tx, ty); ctx.lineTo(tx + HW, ty + HH); ctx.lineTo(tx, ty + 2 * HH); ctx.lineTo(tx - HW, ty + HH); ctx.closePath();
          ctx.stroke();
        }
      }
    }
    if (o.tint && o.map) o.map.drawTint(ctx, iso, o.tint, x0, y0, w, h, scale);
    ctx.restore();
  }

  /** A vertical wall under the top edge a -> b, dz levels tall, with a strata line per level. */
  private face(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, dz: number, col: string, seam: number): void {
    const d = dz * LH;
    ctx.beginPath();
    ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(bx, by + d); ctx.lineTo(ax, ay + d); ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = seam; ctx.stroke();
    if (dz < 1.5) return;
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = Math.max(seam, 1);
    ctx.beginPath();
    for (let l = 1; l < dz; l++) { ctx.moveTo(ax, ay + l * LH); ctx.lineTo(bx, by + l * LH); }
    ctx.stroke();
  }
}
