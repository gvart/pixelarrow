/**
 * Map objects (trees, rocks, ruins, towers) as live sprites zoomed in, depth sorted with the
 * soldiers by x + y of the foot point (the same key as ./units.ts). A tree with a man behind it
 * (his body under its canopy's pixels) fades so he shows; a man behind a stone object (tower, wall)
 * is reported as occluded and the unit layer draws his team silhouette through it. Zoomed out the
 * objects are baked into the terrain chunks instead (./art.ts).
 */
import Phaser from 'phaser';
import type { RegionData } from '../types';
import type { ObjDef, WarArt } from './art';
import type { IsoMap } from './iso';
import type { DrawUnit } from './simClient';

/** Objects are live sprites from this zoom up (the unit sprites' zoom). */
export const LIVE_ZOOM = 1 / 3;
const BUCKET = 16; // tiles per bucket side
const MASK = 4; // px per alpha mask cell
const CELL = 64; // px per unit hash cell
const FADE = 0.35;

interface Def extends ObjDef { key: string; mask: Uint8Array; mw: number; mh: number; fades: boolean; hides: boolean }
interface Obj { def: Def; sx: number; sy: number; v: number; alpha: number }

export class ObjectLayer {
  private objs: Obj[] = [];
  private buckets: number[][];
  private bw: number;
  private bh: number;
  private pool: Phaser.GameObjects.Image[] = [];
  private filter = -1;
  private cells = new Map<number, number[]>();

  constructor(private scene: Phaser.Scene, private iso: IsoMap, r: RegionData, art: WarArt, zs: Float32Array) {
    const defs = new Map<string, Def>();
    for (const d of art.defs) {
      const img = art.objImg.get(d.id)!, key = `obj-${d.id}`;
      if (!scene.textures.exists(key)) scene.textures.addImage(key, img);
      // coarse alpha mask: is any pixel of this MASK x MASK cell opaque?
      const c = document.createElement('canvas');
      c.width = d.w; c.height = d.h;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const px = g.getImageData(0, 0, d.w, d.h).data, mw = Math.ceil(d.w / MASK), mh = Math.ceil(d.h / MASK), mask = new Uint8Array(mw * mh);
      for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) if (px[(y * d.w + x) * 4 + 3] > 128) mask[((y / MASK) | 0) * mw + ((x / MASK) | 0)] = 1;
      // only what stands taller than a man's middle can hide him
      defs.set(d.id, { ...d, key, mask, mw, mh, fades: d.kind === 'tree', hides: d.kind === 'stone' && d.metres >= 2 });
    }
    this.bw = Math.ceil(r.w / BUCKET);
    this.bh = Math.ceil(r.h / BUCKET);
    this.buckets = Array.from({ length: this.bw * this.bh }, () => []);
    for (const o of r.objects ?? []) {
      const def = defs.get(o.id), tx = Math.floor(o.x), ty = Math.floor(o.y);
      if (!def || tx < 0 || ty < 0 || tx >= r.w || ty >= r.h) continue;
      this.buckets[((ty / BUCKET) | 0) * this.bw + ((tx / BUCKET) | 0)].push(this.objs.length);
      this.objs.push({ def, sx: Math.round(iso.sx(o.x, o.y)), sy: Math.round(iso.sy(o.x, o.y, zs[ty * r.w + tx])), v: o.x + o.y, alpha: 1 });
    }
  }

  /**
   * Show the objects over the view and fade / report the ones hiding units. Returns the ids of
   * units hidden behind stone objects (empty when zoomed out: the objects are baked then).
   */
  draw(view: { x: number; y: number; right: number; bottom: number }, zoom: number, units: DrawUnit[], feet: (d: DrawUnit) => { x: number; y: number }, body: number): Set<number> {
    const hidden = new Set<number>();
    let n = 0;
    if (zoom >= LIVE_ZOOM) {
      if (zoom !== this.filter) {
        this.filter = zoom;
        const f = zoom >= 1 ? Phaser.Textures.FilterMode.NEAREST : Phaser.Textures.FilterMode.LINEAR;
        for (const o of new Set(this.objs.map((q) => q.def.key))) this.scene.textures.get(o).setFilter(f);
      }
      // units by screen cell of their middle
      this.cells.clear();
      const pts: { x: number; y: number; v: number; id: number }[] = [];
      for (const d of units) {
        if (d.u.state === 'dead') continue;
        const f = feet(d), p = { x: f.x, y: f.y - body, v: d.x + d.y, id: d.u.id };
        const k = Math.floor(p.x / CELL) * 65536 + Math.floor(p.y / CELL);
        let c = this.cells.get(k);
        if (!c) this.cells.set(k, (c = []));
        c.push(pts.length);
        pts.push(p);
      }
      const { iso } = this;
      // tile bounds of the view (objects reach ~400 px above their foot, ground up to 8 levels)
      const u0 = (view.x - iso.OX) / 32 - 6, u1 = (view.right - iso.OX) / 32 + 6;
      const v0 = (view.y - iso.OY) / 16 - 2, v1 = (view.bottom - iso.OY) / 16 + 34;
      const bx0 = Math.max(0, Math.floor((u0 + v0) / 2 / BUCKET)), bx1 = Math.min(this.bw - 1, Math.floor((u1 + v1) / 2 / BUCKET));
      const by0 = Math.max(0, Math.floor((v0 - u1) / 2 / BUCKET)), by1 = Math.min(this.bh - 1, Math.floor((v1 - u0) / 2 / BUCKET));
      for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) {
        for (const oi of this.buckets[by * this.bw + bx]) {
          const o = this.objs[oi], d = o.def, ox = o.sx - d.anchor.x, oy = o.sy - d.anchor.y;
          if (ox > view.right || ox + d.w < view.x || oy > view.bottom || oy + d.h < view.y) continue;
          let covers = false;
          if (d.fades || d.hides) {
            for (let cx = Math.floor(ox / CELL); cx <= Math.floor((ox + d.w) / CELL); cx++) for (let cy = Math.floor(oy / CELL); cy <= Math.floor((oy + d.h) / CELL); cy++) {
              const c = this.cells.get(cx * 65536 + cy);
              if (!c) continue;
              for (const pi of c) {
                const p = pts[pi];
                if (p.v >= o.v) continue; // in front of the object
                const mx = ((p.x - ox) / MASK) | 0, my = ((p.y - oy) / MASK) | 0;
                if (mx < 0 || my < 0 || mx >= d.mw || my >= d.mh || !d.mask[my * d.mw + mx]) continue;
                covers = true;
                if (d.hides) hidden.add(p.id);
              }
            }
          }
          const target = covers && d.fades ? FADE : 1;
          o.alpha += (target - o.alpha) * 0.25;
          if (Math.abs(o.alpha - target) < 0.02) o.alpha = target;
          let img = this.pool[n];
          if (!img) this.pool.push((img = this.scene.add.image(0, 0, d.key)));
          n++;
          img.setTexture(d.key).setOrigin(d.anchor.x / d.w, d.anchor.y / d.h).setPosition(o.sx, o.sy).setAlpha(o.alpha).setVisible(true);
          img.setDepth(10 + o.v / 4096 + 0.25);
        }
      }
    }
    for (let i = n; i < this.pool.length; i++) this.pool[i].setVisible(false);
    return hidden;
  }
}
