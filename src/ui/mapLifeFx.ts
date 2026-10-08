/**
 * Shared ambient-life drawing for the parchment maps: the online war map
 * (src/scenes/online/mapLife.ts) and the offline overland map
 * (src/ui/overlandLife.ts). Everything is a pure function of time, drawn as
 * a few pixels into one Graphics or as pooled images, so the cost stays
 * proportional to what is on screen.
 */
import Phaser from 'phaser';
import { Pix, hash2 } from '../art/pixels';
import { MP, gullPix, merchantPix, mix, shipPix } from '../art/mapProps';
import { alongPolyline } from '../online/liveArmies';

export const SMOKE = [0xf0e6e2, 0xe2d6d6, 0xcfc2c8];

/** A ship route: a polyline with its bounds, sailed back and forth. */
export interface LifeLane {
  pts: { x: number; y: number }[];
  len: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  kind: 'merchant' | 'galley';
  speed: number;
  phase: number;
}

/** Textures of the sailing things, registered once per prefix. */
export function lifeTextures(scene: Phaser.Scene, prefix: string): { merchant: string; galley: string; gull: [string, string] } {
  const add = (k: string, make: () => { toCanvas(): HTMLCanvasElement }) => {
    if (!scene.textures.exists(k)) scene.textures.addCanvas(k, make().toCanvas());
    return k;
  };
  return {
    merchant: add(`${prefix}life_merchant`, () => merchantPix()),
    galley: add(`${prefix}life_galley`, () => shipPix(0x8a6a48)),
    gull: [add(`${prefix}life_gull0`, () => gullPix(0)), add(`${prefix}life_gull1`, () => gullPix(1))],
  };
}

/** A small pool of images in one container, reused frame to frame. */
export class ImagePool {
  private pool: Phaser.GameObjects.Image[] = [];
  private used = 0;

  constructor(
    private scene: Phaser.Scene,
    private c: Phaser.GameObjects.Container,
  ) {}

  begin(): void {
    this.used = 0;
  }

  img(key: string): Phaser.GameObjects.Image {
    let im = this.pool[this.used];
    if (!im) {
      im = this.scene.add.image(0, 0, key).setOrigin(0.5, 1);
      this.c.add(im);
      this.pool.push(im);
    } else if (im.texture.key !== key) im.setTexture(key);
    this.used++;
    return im.setVisible(true).setAlpha(1);
  }

  end(): void {
    for (let i = this.used; i < this.pool.length; i++) this.pool[i].setVisible(false);
  }
}

/**
 * Glints that blink and wave crests drifting east on a coarse grid over the
 * open sea (`open(x, y)`: deep enough and not fogged).
 */
export function seaShimmer(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, k: number, T: number, open: (x: number, y: number) => boolean, cellBase = 40): void {
  const cell = cellBase * k;
  for (let gy = Math.floor(y0 / cell); gy <= Math.floor(y1 / cell); gy++)
    for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++) {
      const h = hash2(gx, gy, 511);
      const x = (gx + hash2(gx, gy, 512)) * cell;
      const y = (gy + hash2(gx, gy, 513)) * cell;
      if (!open(x, y)) continue;
      const ph = (T * 0.35 + h * 7) % 3;
      if (h < 0.5) {
        if (ph < 0.5) {
          const a = ph < 0.25 ? ph * 4 : (0.5 - ph) * 4;
          g.fillStyle(MP.sparkle, a);
          g.fillRect(Math.round(x), Math.round(y), 2 * k, k);
          g.fillRect(Math.round(x) + k, Math.round(y) - k, k, k);
        }
      } else {
        const t = ph / 3;
        const a = Math.sin(t * Math.PI) * 0.55;
        g.fillStyle(MP.seaHi, a);
        g.fillRect(Math.round(x + t * 10 * k), Math.round(y), 4 * k, k);
        g.fillStyle(MP.sparkle, a * 0.8);
        g.fillRect(Math.round(x + t * 10 * k) + k, Math.round(y) - k, 2 * k, k);
      }
    }
}

/** Where a lane's ship is at time T (s): position, heading and how far along. */
export function shipOnLane(l: LifeLane, T: number): { x: number; y: number; dir: number; kk: number; fwd: boolean } {
  const period = (l.len / l.speed) * 2;
  const u = ((T / period + l.phase) % 1) * 2;
  const fwd = u < 1;
  const kk = fwd ? u : 2 - u;
  const p = alongPolyline(l.pts, kk);
  return { x: p.x, y: p.y, dir: fwd ? p.dx : -p.dx, kk, fwd };
}

/** A ship's wake: pale pixels where it was. */
export function wake(g: Phaser.GameObjects.Graphics, l: LifeLane, kk: number, fwd: boolean, k: number): void {
  for (let w = 1; w <= 6; w++) {
    const q = alongPolyline(l.pts, Math.max(0, Math.min(1, kk - ((fwd ? 1 : -1) * w * 3) / l.len)));
    const a = 0.5 * (1 - w / 7);
    g.fillStyle(MP.sparkle, a);
    g.fillRect(Math.round(q.x) - k, Math.round(q.y) - 1 + (w % 2) * k, k, k);
    g.fillRect(Math.round(q.x) + k, Math.round(q.y) - 1 - (w % 2) * k, k, k);
  }
}

/** Smoke puffs rising and drifting east from (sx, sy); `big` for a volcano. */
export function smokePuffs(g: Phaser.GameObjects.Graphics, sx: number, sy: number, T: number, seed: number, i: number, big = false): void {
  const n = big ? 10 : 4;
  for (let q = 0; q < n; q++) {
    const ph = (T / (big ? 6 : 3.2) + q / n + hash2(seed, i, 521)) % 1;
    const sz = big ? 1 + Math.floor(ph * 4) : 1 + Math.floor(ph * 2);
    g.fillStyle(SMOKE[Math.min(2, Math.floor(ph * 3))], 0.75 * (1 - ph));
    g.fillRect(Math.round(sx + Math.sin(ph * 5 + i) * 1.5 + ph * (big ? 22 : 6)), Math.round(sy - 2 - ph * (big ? 40 : 14)), sz, sz);
  }
}

/** A flag waving on a short pole (x, y = top of the pole). */
export function wavingFlag(g: Phaser.GameObjects.Graphics, x: number, y: number, c: number, T: number): void {
  const fr = Math.floor(T * 4 + x) % 2;
  g.fillStyle(MP.woodDk, 1).fillRect(x, y, 1, 7);
  g.fillStyle(c, 1).fillRect(x + 1, y, 4, 3);
  g.fillStyle(c, 1).fillRect(x + 4, y + fr, 2, 2);
  g.fillStyle(0x000000, 0.25).fillRect(x + 1, y + 2, 4 - fr, 1);
}

/** A flickering fire (beacon, campfire, crater). */
export function flicker(g: Phaser.GameObjects.Graphics, x: number, y: number, T: number, seed: number): void {
  const fl = Math.floor(T * 8 + seed) % 3;
  g.fillStyle(0xf8d070, 0.35).fillRect(x - 2, y - 2, 5, 5);
  g.fillStyle(fl === 0 ? 0xf8e090 : MP.ember, 1).fillRect(x, y - (fl === 2 ? 1 : 0), 2, 2);
  g.fillStyle(0xf8f0c0, 1).fillRect(x + (fl % 2), y, 1, 1);
}

/** Gull q of a flock wheeling over (cx, cy). */
export function gullAt(T: number, q: number, seed: number, cx: number, cy: number): { x: number; y: number } {
  const a = T * (0.5 + q * 0.13) + q * 2.1 + seed;
  return { x: Math.round(cx + Math.cos(a) * (18 + q * 6)), y: Math.round(cy + Math.sin(a) * (9 + q * 3) - 14) };
}

// ------------------------------------------------------------------ clouds

/** A cloud wisp: a few overlapping parchment puffs, lit on top, rimmed below; `shade` draws its shadow instead. */
function cloudPix(w: number, h: number, seed: number, shade: boolean): Pix {
  const p = new Pix(w, h);
  const n = 3 + Math.floor(hash2(seed, 1, 541) * 3);
  const puffs: [number, number, number, number][] = [];
  for (let k = 0; k < n; k++) {
    const rx = (w / 2) * (0.35 + hash2(seed, k, 542) * 0.4);
    const ry = (h / 2) * (0.45 + hash2(seed, k, 543) * 0.5);
    puffs.push([rx + hash2(seed, k, 544) * (w - 2 * rx), h / 2 + (hash2(seed, k, 545) - 0.5) * (h - 2 * ry), rx, ry]);
  }
  const inside = (x: number, y: number) => puffs.some(([cx, cy, rx, ry]) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      if (shade) {
        if (((x + y) & 1) === 0 || !inside(x, y + 1)) p.set(x, y, MP.fogShadow);
        continue;
      }
      const below = !inside(x, y + 1);
      const above = !inside(x, y - 1) || !inside(x - 1, y);
      p.set(x, y, below ? MP.parchRim : above ? MP.parchHi : (x + y) % 7 === 0 ? MP.parchLo : MP.parch);
    }
  return p;
}

/** Textures of three cloud wisps and their shadows, registered once per prefix. */
export function cloudTextures(scene: Phaser.Scene, prefix: string): { cloud: string[]; shade: string[] } {
  const sizes: [number, number][] = [
    [16, 6],
    [26, 8],
    [38, 10],
  ];
  const add = (k: string, make: () => Pix) => {
    if (!scene.textures.exists(k)) scene.textures.addCanvas(k, make().toCanvas());
    return k;
  };
  return {
    cloud: sizes.map(([w, h], i) => add(`${prefix}cloud${i}`, () => cloudPix(w, h, i, false))),
    shade: sizes.map(([w, h], i) => add(`${prefix}cloudsh${i}`, () => cloudPix(w, h, i, true))),
  };
}

/**
 * Cloud wisps drifting east over the revealed map on a coarse grid, each with
 * its shadow on the ground a little down and right (`open(x, y)`: not fogged).
 */
export function drawClouds(pool: ImagePool, tex: { cloud: string[]; shade: string[] }, x0: number, y0: number, x1: number, y1: number, k: number, T: number, open: (x: number, y: number) => boolean, cellBase = 150): void {
  const cell = cellBase * k;
  for (let gy = Math.floor(y0 / cell); gy <= Math.floor(y1 / cell); gy++)
    for (let gx = Math.floor(x0 / cell) - 1; gx <= Math.floor(x1 / cell); gx++) {
      const h = hash2(gx, gy, 551);
      if (h > 0.34) continue;
      const i = Math.floor(h * 30) % 3;
      const speed = 2 + h * 4;
      const x = gx * cell + ((hash2(gx, gy, 552) * cell + T * speed) % cell);
      const y = gy * cell + hash2(gx, gy, 553) * cell;
      if (x < x0 - 40 * k || x > x1 + 40 * k || !open(x, y)) continue;
      pool.img(tex.shade[i]).setScale(k).setAlpha(0.3).setFlipX(false).setPosition(Math.round(x + 7 * k), Math.round(y + 12 * k));
      pool.img(tex.cloud[i]).setScale(k).setAlpha(0.92).setFlipX(false).setPosition(Math.round(x), Math.round(y));
    }
}

// ------------------------------------------------------------------ shore, fields, roads

/** Foam dashes breaking along the shore (`shore(x, y)`: shallow water by the coast, in sight). */
export function surf(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, k: number, T: number, shore: (x: number, y: number) => boolean, cellBase = 11): void {
  const cell = cellBase * k;
  for (let gy = Math.floor(y0 / cell); gy <= Math.floor(y1 / cell); gy++)
    for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++) {
      const h = hash2(gx, gy, 561);
      const x = (gx + hash2(gx, gy, 562)) * cell;
      const y = (gy + hash2(gx, gy, 563)) * cell;
      if (!shore(x, y)) continue;
      const ph = (T * 0.45 + h * 9) % 1;
      if (ph > 0.5) continue;
      const a = Math.sin((ph / 0.5) * Math.PI) * 0.85;
      g.fillStyle(MP.foam, a);
      g.fillRect(Math.round(x), Math.round(y), (2 + Math.floor(h * 4)) * k, k);
      if (h > 0.5) g.fillRect(Math.round(x) + k, Math.round(y) - k, 2 * k, k);
    }
}

/** A few sheep grazing about a field (cx, cy) +- (rx, ry), drifting slowly. */
export function herd(g: Phaser.GameObjects.Graphics, cx: number, cy: number, rx: number, ry: number, T: number, seed: number, n = 3): void {
  for (let q = 0; q < n; q++) {
    const a = T * 0.05 + q * 2.1 + seed;
    const x = Math.round(cx + Math.cos(a) * rx * 0.7 + Math.cos(a * 3.1) * 2);
    const y = Math.round(cy + Math.sin(a * 0.7) * ry * 0.6);
    const dir = Math.cos(a) < 0 ? -1 : 1;
    g.fillStyle(MP.shadow, 0.35).fillRect(x, y + 1, 3, 1);
    g.fillStyle(0xf6eee2, 1).fillRect(x, y - 1, 2, 2);
    g.fillStyle(0x6a5450, 1).fillRect(dir > 0 ? x + 2 : x - 1, y - 1, 1, 1);
    if (Math.floor(T * 2 + q) % 5 === 0) g.fillStyle(0x6a5450, 1).fillRect(dir > 0 ? x + 2 : x - 1, y, 1, 1); // head down, grazing
  }
}

/** An ox cart on the road at (x, y), heading dir (+1 east). */
export function cart(g: Phaser.GameObjects.Graphics, x: number, y: number, dir: number, k: number, T: number): void {
  const bob = Math.floor(T * 6) % 2;
  g.fillStyle(MP.shadow, 0.4).fillRect(x - 3 * k, y + k, 8 * k, k);
  // the ox ahead, the cart behind
  const ox = x + dir * 3 * k;
  g.fillStyle(0xc8a078, 1).fillRect(ox - k, y - 2 * k, 2 * k, 2 * k);
  g.fillStyle(0x6a4a3a, 1).fillRect(ox + (dir > 0 ? k : -k), y - 2 * k - bob * k, k, k);
  g.fillStyle(MP.wood, 1).fillRect(x - 2 * k, y - 3 * k + bob * k, 4 * k, 2 * k);
  g.fillStyle(0xe8d8b8, 1).fillRect(x - 2 * k, y - 4 * k + bob * k, 4 * k, k);
  g.fillStyle(0x3a2a28, 1).fillRect(x - 2 * k, y - k, k, k);
  g.fillStyle(0x3a2a28, 1).fillRect(x + k, y - k, k, k);
}

/** A slow day cycle: a warm tint that comes and goes over the view (very light). */
export function dayTint(g: Phaser.GameObjects.Graphics, view: Phaser.Geom.Rectangle, T: number): void {
  g.clear();
  const ph = (T / 300) % 1;
  const warm = Math.max(0, Math.sin(ph * Math.PI * 2));
  const cool = Math.max(0, -Math.sin(ph * Math.PI * 2));
  if (warm > 0.02) g.fillStyle(0xffb870, warm * 0.07).fillRect(view.x - 4, view.y - 4, view.width + 8, view.height + 8);
  if (cool > 0.02) g.fillStyle(mix(MP.fogShadow, 0x6080c0, 0.4), cool * 0.06).fillRect(view.x - 4, view.y - 4, view.width + 8, view.height + 8);
}
