/**
 * Map objects (trees, rocks, ruins, towers) as live sprites zoomed in, depth sorted with the
 * soldiers by x + y of the foot point (the same key as ./units.ts). A tree with a man behind it
 * (his body under its canopy's pixels) fades so he shows; a man behind a stone object (tower, wall)
 * or a massif is reported as occluded and the unit layer draws his team silhouette through it.
 * Massifs (./massifs.ts) are live sprites too (half-size textures below 1:1); their depth rule
 * comes from Massifs.depth, and objects standing inside a footprint are not drawn. Zoomed out the
 * objects are baked into the terrain chunks instead (./art.ts).
 * Animals (objects.json `idle`: a strip of frames, frame 0 = the static sprite) play their idle
 * loop while live, each one at its own phase and speed; the baked far levels keep the still frame.
 */
import Phaser from 'phaser';
import type { RegionData } from '../types';
import type { ObjDef, WarArt } from './art';
import { HH, LH, type IsoMap } from './iso';
import type { Massifs } from './massifs';
import { peakHorizon } from './peaks';
import { baseOffset } from './objBase';
import type { DrawUnit } from './simClient';

/** Objects are live sprites from this zoom up (the unit sprites' zoom). */
export const LIVE_ZOOM = 1 / 3;
const BUCKET = 16; // tiles per bucket side
const MASK = 4; // px per alpha mask cell
const CELL = 64; // px per unit hash cell
const FADE = 0.35;
/** Depth step between objects of one depth key, by list index (well under a key step of 1/4096 for 10^5 objects). */
const TIE = 1e-8;

/** An idle strip (objects.json `idle`): `frames` frames of w x h in a row, its own foot anchor, `fps` (default 5). */
interface Idle { file: string; frames: number; w: number; h: number; anchor: { x: number; y: number }; fps?: number }
interface Anim { key: string; n: number; ox: number; oy: number; fps: number; ready: boolean }
interface Def extends ObjDef { key: string; mask: Uint8Array; mw: number; mh: number; fades: boolean; hides: boolean; anim?: Anim }
/** ph, sp: an animal's loop phase (frames) and speed factor, so a herd does not move in step. */
interface Obj { def: Def; sx: number; sy: number; v: number; alpha: number; tint?: number; ph: number; sp: number; /** Wholly behind the peaks: shown only while they are cut or in a hole. */ behind?: boolean }

/** 0..1 from a point (an animal's phase and speed). */
const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export class ObjectLayer {
  private objs: Obj[] = [];
  private big: Obj[] = [];
  private buckets: number[][];
  private bw: number;
  private bh: number;
  private pool: Phaser.GameObjects.Image[] = [];
  private filter = -1;
  private cells = new Map<number, number[]>();
  /** Per object def id: its base's centre from the anchor, sprite px (./objBase.ts). */
  private bases = new Map<string, { dx: number; dy: number }>();

  constructor(private scene: Phaser.Scene, private iso: IsoMap, r: RegionData, art: WarArt, private massifs: Massifs | null = null) {
    const defs = new Map<string, Def>(), used = new Set([...(r.objects ?? []).map((o) => o.id), ...(massifs?.list ?? []).map((m) => m.def.id)]);
    for (const d of art.defs) {
      if (!used.has(d.id)) continue;
      const img = art.objImg.get(d.id)!, key = `obj-${d.id}`;
      if (!scene.textures.exists(key)) scene.textures.addImage(key, img);
      // coarse alpha mask: is any pixel of this MASK x MASK cell opaque?
      const c = document.createElement('canvas');
      c.width = d.w; c.height = d.h;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const px = g.getImageData(0, 0, d.w, d.h).data, mw = Math.ceil(d.w / MASK), mh = Math.ceil(d.h / MASK), mask = new Uint8Array(mw * mh);
      for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) if (px[(y * d.w + x) * 4 + 3] > 128) mask[((y / MASK) | 0) * mw + ((x / MASK) | 0)] = 1;
      this.bases.set(d.id, baseOffset(px, d.w, d.h, d.anchor.x, d.anchor.y));
      if (d.kind === 'massif' && !scene.textures.exists(key + '-half')) {
        const h = document.createElement('canvas');
        h.width = Math.ceil(d.w / 2); h.height = Math.ceil(d.h / 2);
        const hg = h.getContext('2d')!;
        hg.imageSmoothingQuality = 'high';
        hg.drawImage(img, 0, 0, h.width, h.height);
        scene.textures.addCanvas(key + '-half', h);
      }
      // only what stands taller than a man's middle can hide him
      defs.set(d.id, { ...d, key, mask, mw, mh, fades: d.kind === 'tree', hides: (d.kind === 'stone' && d.metres >= 2) || d.kind === 'massif', anim: this.idle(d, img, key) });
    }
    this.bw = Math.ceil(r.w / BUCKET);
    this.bh = Math.ceil(r.h / BUCKET);
    this.buckets = Array.from({ length: this.bw * this.bh }, () => []);
    // with peaks (./peaks.ts): none on the mountain; those wholly behind it only while the peaks are cut or holed there (the baked ground does not sort with sprites)
    const horizon = iso.peaks && peakHorizon(iso.peaks, iso.OY);
    for (const o of r.objects ?? []) {
      const def = defs.get(o.id), tx = Math.floor(o.x), ty = Math.floor(o.y);
      if (!def || def.kind === 'massif' || tx < 0 || ty < 0 || tx >= r.w || ty >= r.h || massifs?.covers(o.x, o.y, def.metres)) continue;
      if (horizon && iso.peakAt(o.x, o.y) > 0.3) continue;
      const behind = !!horizon && horizon[ty * r.w + tx] < iso.sy(o.x, o.y, iso.zAt(o.x, o.y)) - def.anchor.y;
      this.buckets[((ty / BUCKET) | 0) * this.bw + ((tx / BUCKET) | 0)].push(this.objs.length);
      // ties (one depth) break by list order, never by which pooled image a sprite got
      const h = hash(o.x, o.y);
      this.objs.push({ def, sx: Math.round(iso.sx(o.x, o.y)), sy: Math.round(iso.sy(o.x, o.y, iso.zAt(o.x, o.y))), v: (massifs ? massifs.depth(o.x, o.y) : o.x + o.y) + this.objs.length * TIE, alpha: 1, ph: h * 64, sp: 0.8 + 0.4 * hash(o.y, o.x), ...(behind ? { behind } : {}) });
    }
    // massifs just before their south vertex row, in the region's order (as the baked levels draw them)
    massifs?.list.forEach((m, k) => {
      const xs = m.x0 + m.fw, ys = m.y0 + m.fh;
      this.big.push({ def: defs.get(m.def.id)!, sx: Math.round(iso.sx(xs, ys)), sy: Math.round(iso.sy(xs, ys, iso.zf(2 * xs - 1, 2 * ys - 1))), v: m.v - 0.001 + k * TIE, alpha: 1, tint: Math.round(255 * m.shade) * 0x010101, ph: 0, sp: 1 });
    });
  }

  /** Load an object's idle strip next to its PNG; until it is in, the object shows its still frame. */
  private idle(d: ObjDef, img: HTMLImageElement, key: string): Anim | undefined {
    const idle = (d as ObjDef & { idle?: Idle }).idle;
    if (!idle) return undefined;
    const a: Anim = { key: key + '-idle', n: idle.frames, ox: idle.anchor.x / idle.w, oy: idle.anchor.y / idle.h, fps: idle.fps ?? 5, ready: this.scene.textures.exists(key + '-idle') };
    if (!a.ready) {
      const im = new Image();
      im.onload = () => {
        if (!this.scene.textures.exists(a.key)) this.scene.textures.addSpriteSheet(a.key, im, { frameWidth: idle.w, frameHeight: idle.h });
        this.scene.textures.get(a.key).setFilter(this.filter >= 1 ? Phaser.Textures.FilterMode.NEAREST : Phaser.Textures.FilterMode.LINEAR);
        a.ready = true;
      };
      im.src = img.src.replace(/[^/]*$/, idle.file);
    }
    return a;
  }

  /** Where object def `id`'s sprite meets the ground, from its anchor (sprite px); undefined for an unknown def. */
  baseOf(id: string): { dx: number; dy: number } | undefined {
    return this.bases.get(id);
  }

  /** Depth key of a point: x + y, past the massifs it stands in front of. */
  depth(x: number, y: number): number {
    return this.massifs ? this.massifs.depth(x, y) : x + y;
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
        for (const o of new Set([...this.objs, ...this.big].flatMap((q) => (q.def.anim?.ready ? [q.def.key, q.def.anim.key] : [q.def.key])))) this.scene.textures.get(o).setFilter(f);
      }
      // units by screen cell of their middle
      this.cells.clear();
      const pts: { x: number; y: number; v: number; id: number }[] = [];
      for (const d of units) {
        if (d.u.state === 'dead') continue;
        const f = feet(d), p = { x: f.x, y: f.y - body, v: this.depth(d.x, d.y), id: d.u.id };
        const k = Math.floor(p.x / CELL) * 65536 + Math.floor(p.y / CELL);
        let c = this.cells.get(k);
        if (!c) this.cells.set(k, (c = []));
        c.push(pts.length);
        pts.push(p);
      }
      const show = (o: Obj) => {
        const d = o.def, ox = o.sx - d.anchor.x, oy = o.sy - d.anchor.y;
        if (o.behind && this.iso.drawnPeaks(o.sx, o.sy) === this.iso.peaks) return;
        if (ox > view.right || ox + d.w < view.x || oy > view.bottom || oy + d.h < view.y) return;
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
        const half = d.kind === 'massif' && zoom < 1, a = d.anim;
        if (a?.ready) img.setTexture(a.key, Math.floor(o.ph + t * a.fps * o.sp) % a.n).setScale(1).setOrigin(a.ox, a.oy);
        else img.setTexture(half ? d.key + '-half' : d.key).setScale(half ? 2 : 1).setOrigin(d.anchor.x / d.w, d.anchor.y / d.h);
        img.setPosition(o.sx, o.sy).setAlpha(o.alpha).setTint(o.tint ?? 0xffffff).setVisible(true);
        img.setDepth(10 + o.v / 4096 + 0.25);
      };
      const { iso } = this, t = this.scene.time.now / 1000;
      // tile bounds of the view (objects reach ~400 px above their foot, ground up to iso.top levels)
      const u0 = (view.x - iso.OX) / 32 - 6, u1 = (view.right - iso.OX) / 32 + 6;
      const v0 = (view.y - iso.OY) / HH - 2, v1 = (view.bottom - iso.OY) / HH + (iso.top * LH) / HH + 26;
      const bx0 = Math.max(0, Math.floor((u0 + v0) / 2 / BUCKET)), bx1 = Math.min(this.bw - 1, Math.floor((u1 + v1) / 2 / BUCKET));
      const by0 = Math.max(0, Math.floor((v0 - u1) / 2 / BUCKET)), by1 = Math.min(this.bh - 1, Math.floor((v1 - u0) / 2 / BUCKET));
      for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) for (const oi of this.buckets[by * this.bw + bx]) show(this.objs[oi]);
      for (const o of this.big) show(o);
    }
    for (let i = n; i < this.pool.length; i++) this.pool[i].setVisible(false);
    return hidden;
  }
}
