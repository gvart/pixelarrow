/**
 * Fog of war overlay (W-39) for the player's team: a low-res canvas over the whole iso world (one texel per FOG_PX world
 * px), dark over unexplored cells, dimmed over explored ones, clear where the team sees. Each vision cell is rasterised
 * once at its height (top diamond extruded down to the base plane, back to front, so a plateau's fog covers its cliff
 * face); a texel keeps the point of the surface it shows in cell units and samples the cells' alphas bilinearly there
 * (soft edges along the ground, not cell steps). Per cell the alpha eases to its target every frame (smooth reveals);
 * the canvas is rewritten only while some cell is still easing.
 */
import Phaser from 'phaser';
import type { FogGrid, RegionData } from '../types';
import { HH, HW, LH, type IsoMap } from './iso';

/** World px per fog texel. */
const FOG_PX = 32;
/** Alpha over unexplored and explored cells (visible: 0). */
const DARK = 0.93;
const DIM = 0.55;
/** Seconds a cell takes to ease all the way. */
const EASE = 0.35;
const RGB = [8, 10, 16];
/** Just above the units, sprites and map objects; below the placement ghost and the labels. */
export const FOG_DEPTH = 11.28;

export class FogLayer {
  private tex: Phaser.Textures.CanvasTexture;
  private img: Phaser.GameObjects.Image;
  private data: ImageData;
  private lut: Int32Array; // texel -> vision cell, -1 off the map
  private fu: Float32Array; // texel -> the surface point it shows, in cell units (x, y)
  private fv: Float32Array;
  private cur: Float32Array | null = null;
  private goal: Float32Array | null = null;
  private grid: FogGrid | null = null;
  private easing = false;
  private on = true;

  constructor(scene: Phaser.Scene, private iso: IsoMap, private region: RegionData) {
    const w = Math.ceil(iso.W / FOG_PX), h = Math.ceil(iso.H / FOG_PX);
    this.tex = scene.textures.createCanvas('fog', w, h)!;
    this.tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.img = scene.add.image(0, 0, 'fog').setOrigin(0).setScale(FOG_PX).setDepth(FOG_DEPTH).setVisible(false);
    this.data = this.tex.context.createImageData(w, h);
    for (let i = 0; i < w * h; i++) (this.data.data[i * 4] = RGB[0]), (this.data.data[i * 4 + 1] = RGB[1]), (this.data.data[i * 4 + 2] = RGB[2]);
    this.lut = new Int32Array(w * h).fill(-1);
    this.fu = new Float32Array(w * h);
    this.fv = new Float32Array(w * h);
  }

  /** Dev: fog drawn or not. */
  set enabled(v: boolean) {
    this.on = v;
    this.img.setVisible(v && !!this.grid);
  }

  /** A new fog grid from the sim (a new version): the cells ease towards it. */
  set(g: FogGrid): void {
    if (!this.grid || this.grid.w !== g.w || this.grid.h !== g.h) {
      this.raster(g);
      this.cur = new Float32Array(g.w * g.h).fill(DARK);
      this.goal = new Float32Array(g.w * g.h);
    }
    this.grid = g;
    const goal = this.goal!;
    for (let c = 0; c < goal.length; c++) goal[c] = g.state[c] === 2 ? 0 : g.state[c] === 1 ? DIM : DARK;
    this.easing = true;
    this.img.setVisible(this.on);
  }

  /** Ease the cells and rewrite the canvas while any is still moving. dt: ms since the last frame. */
  update(dt: number): void {
    if (!this.easing || !this.cur || !this.goal || !this.on) return;
    const cur = this.cur, goal = this.goal, step = Math.min(1, dt / 1000 / EASE);
    let moving = false;
    for (let c = 0; c < cur.length; c++) {
      const d = goal[c] - cur[c];
      if (d === 0) continue;
      if (Math.abs(d) <= step) cur[c] = goal[c];
      else (cur[c] += Math.sign(d) * step), (moving = true);
    }
    const px = this.data.data, lut = this.lut, fu = this.fu, fv = this.fv, gw = this.grid!.w, gh = this.grid!.h;
    for (let i = 0; i < lut.length; i++) {
      if (lut[i] < 0) {
        px[i * 4 + 3] = 0;
        continue;
      }
      // bilinear between the four cell centres round the point
      const u = Math.min(gw - 1, Math.max(0, fu[i] - 0.5)), v = Math.min(gh - 1, Math.max(0, fv[i] - 0.5));
      const x0 = Math.floor(u), y0 = Math.floor(v), x1 = Math.min(gw - 1, x0 + 1), y1 = Math.min(gh - 1, y0 + 1), a = u - x0, b = v - y0;
      const top = cur[y0 * gw + x0] * (1 - a) + cur[y0 * gw + x1] * a, bot = cur[y1 * gw + x0] * (1 - a) + cur[y1 * gw + x1] * a;
      px[i * 4 + 3] = (top * (1 - b) + bot * b) * 255;
    }
    this.tex.context.putImageData(this.data, 0, 0);
    this.tex.refresh();
    this.easing = moving;
  }

  /** Each cell's texels: its top diamond at its height extruded down to level 0, painted back to front. */
  private raster(g: FogGrid): void {
    const iso = this.iso, r = this.region, C = g.cell, tw = this.tex.width, th = this.tex.height;
    this.lut.fill(-1);
    for (let s = 0; s <= g.w + g.h - 2; s++)
      for (let cx = Math.max(0, s - g.h + 1); cx <= Math.min(g.w - 1, s); cx++) {
        const cy = s - cx, x0 = cx * C, y0 = cy * C;
        let z = 0;
        for (let y = y0; y < Math.min(r.h, y0 + C); y++) for (let x = x0; x < Math.min(r.w, x0 + C); x++) z = Math.max(z, iso.ztop(x, y));
        const nx = iso.sx(x0, y0), half = C * HW; // the diamond's top corner and half width
        const top = iso.sy(x0, y0, z), bottom = iso.sy(x0 + C, y0 + C, 0);
        const tx0 = Math.max(0, Math.floor((nx - half) / FOG_PX)), tx1 = Math.min(tw - 1, Math.floor((nx + half) / FOG_PX));
        for (let tx = tx0; tx <= tx1; tx++) {
          const wx = (tx + 0.5) * FOG_PX, off = Math.abs(wx - nx) * (HH / HW);
          if (off > C * HH) continue;
          const ya = Math.max(0, Math.floor((top + off) / FOG_PX)), yb = Math.min(th - 1, Math.floor((bottom - off) / FOG_PX));
          for (let ty = ya; ty <= yb; ty++) {
            // the point on the cell's top (a texel on its cliff face: the front edge above it)
            const i = ty * tw + tx, u = (wx - iso.OX) / HW, vy = Math.min((ty + 0.5) * FOG_PX, iso.sy(x0, y0, z) + 2 * C * HH - off);
            const v = (vy - iso.OY + z * LH) / HH, x = Math.min(x0 + C, Math.max(x0, (u + v) / 2)), y = Math.min(y0 + C, Math.max(y0, (v - u) / 2));
            this.lut[i] = cy * g.w + cx;
            this.fu[i] = x / C;
            this.fv[i] = y / C;
          }
        }
      }
  }
}
