/**
 * Registers procedurally generated textures with Phaser on demand.
 *
 * Soldier sheets (src/art/paperdoll.ts) are rendered lazily, one facing row at
 * a time: a battle first draws the row each man faces at the start, and the
 * other rows either when he turns or in idle time (pumpDolls), so a battle
 * opens quickly even on a phone.
 */
import Phaser from 'phaser';
import { NDIRS, NFRAMES, dollGeom, dollKey, renderFrame, type DollSpec, type SheetGeom } from '../art/paperdoll';
import { itemIconKey, renderItemIcon } from '../art/itemIcons';
import { renderBasePlate, renderBlood, renderPlateRing, renderRing, renderShadow } from '../art/ground';
import { Pix } from '../art/pixels';
import { P } from '../art/palette';
import type { Item } from '../data/items';

interface DollTex {
  spec: DollSpec;
  geom: SheetGeom;
  rows: boolean[];
}

const dolls = new Map<string, DollTex>();
const queue: { scene: Phaser.Scene; key: string; dir: number }[] = [];

/**
 * The texture key of a figure's sheet; renders the given facing rows now
 * (default: all four). Frames are numbered dir * NFRAMES + frame.
 */
export function ensureDoll(scene: Phaser.Scene, spec: DollSpec, rows: number[] = [0, 1, 2, 3]): string {
  const key = dollKey(spec);
  let d = dolls.get(key);
  if (!scene.textures.exists(key) || !d) {
    const geom = dollGeom(spec);
    const tex = scene.textures.createCanvas(key, geom.fw * NFRAMES, geom.fh * NDIRS)!;
    for (let dir = 0; dir < NDIRS; dir++) {
      for (let f = 0; f < NFRAMES; f++) tex.add(dir * NFRAMES + f, 0, f * geom.fw, dir * geom.fh, geom.fw, geom.fh);
    }
    d = { spec, geom, rows: [false, false, false, false] };
    dolls.set(key, d);
  }
  let drew = false;
  for (const r of rows) drew = drawRow(scene, key, d, r) || drew;
  if (drew) (scene.textures.get(key) as Phaser.Textures.CanvasTexture).refresh();
  return key;
}

function drawRow(scene: Phaser.Scene, key: string, d: DollTex, dir: number): boolean {
  if (d.rows[dir]) return false;
  const tex = scene.textures.get(key) as Phaser.Textures.CanvasTexture;
  const ctx = tex.getContext();
  for (let f = 0; f < NFRAMES; f++) {
    const px = renderFrame(d.spec, f, dir);
    const img = ctx.createImageData(px.w, px.h);
    img.data.set(px.data);
    ctx.putImageData(img, f * d.geom.fw, dir * d.geom.fh);
  }
  d.rows[dir] = true;
  return true;
}

/** Make sure a row is drawn before a sprite shows it (a man turning to a new facing). */
export function ensureDollRow(scene: Phaser.Scene, key: string, dir: number): void {
  const d = dolls.get(key);
  if (!d || d.rows[dir]) return;
  if (drawRow(scene, key, d, dir)) (scene.textures.get(key) as Phaser.Textures.CanvasTexture).refresh();
}

/** Queue the remaining rows of a sheet for idle time. */
export function queueDollRows(scene: Phaser.Scene, key: string): void {
  const d = dolls.get(key);
  if (!d) return;
  for (let r = 0; r < NDIRS; r++) if (!d.rows[r]) queue.push({ scene, key, dir: r });
}

/** Draw queued rows for at most `budgetMs` (call once per frame). */
export function pumpDolls(budgetMs = 6): void {
  const t0 = performance.now();
  while (queue.length && performance.now() - t0 < budgetMs) {
    const q = queue.shift()!;
    if (!q.scene.sys.isActive() || !q.scene.textures.exists(q.key)) continue;
    ensureDollRow(q.scene, q.key, q.dir);
  }
}

export function dollFrame(dir: number, f: number): number {
  return dir * NFRAMES + f;
}

/** Sheet geometry of a registered figure (frame size and feet line). */
export function dollGeomOf(key: string): SheetGeom {
  return dolls.get(key)?.geom ?? { fw: 48, fh: 56, footY: 50 };
}

/** Sprite origin that puts the feet on the sprite's position. */
export function dollOrigin(key: string): [number, number] {
  const g = dollGeomOf(key);
  return [0.5, g.footY / g.fh];
}

/**
 * A head-and-shoulders portrait (24 x 24) of a figure, facing the viewer: the
 * class icon in lists (recruits, roster rows, group lists).
 */
export function ensurePortrait(scene: Phaser.Scene, spec: DollSpec): string {
  const key = `portrait_${dollKey(spec)}`;
  if (scene.textures.exists(key)) return key;
  const g = dollGeom(spec);
  const fr = renderFrame(spec, 0, 2);
  const out = new Pix(24, 24);
  let x0: number;
  let y0: number;
  if (spec.beast) {
    // the whole animal, scaled into the box
    const s = Math.max(fr.w, fr.h) / 24;
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
      const sx = Math.floor(x * s);
      const sy = Math.floor(y * s + (fr.h - 24 * s) * 0.6);
      if (fr.alpha(sx, sy) > 0) out.set(x, y, fr.get(sx, sy));
    }
    scene.textures.addCanvas(key, out.toCanvas());
    return key;
  }
  if (spec.mount) {
    x0 = Math.floor(g.fw / 2) - 12;
    y0 = g.footY - (spec.mount === 'chariot' ? 52 : 60);
  } else {
    x0 = Math.floor(g.fw / 2) - 12;
    y0 = g.footY - 41;
  }
  out.blit(fr, 0, 0, false, x0, y0, 24, 24);
  scene.textures.addCanvas(key, out.toCanvas());
  return key;
}

export function ensureItemIcon(scene: Phaser.Scene, item: Item): string {
  const key = itemIconKey(item);
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, renderItemIcon(item).toCanvas());
  return key;
}

/** Base plate widths (px) for a man and for a rider / chariot. */
export const PLATE_W = 20;
export const PLATE_W_BIG = 36;

export function registerMisc(scene: Phaser.Scene): void {
  if (scene.textures.exists('shadow')) return;
  scene.textures.addCanvas('shadow', renderShadow(18, 7).toCanvas());
  scene.textures.addCanvas('shadow_big', renderShadow(40, 14).toCanvas());
  for (let i = 0; i < 4; i++) scene.textures.addCanvas(`blood${i}`, renderBlood(i).toCanvas());
  scene.textures.addCanvas('ring_sel', renderRing(0xf6ecd8).toCanvas());
  scene.textures.addCanvas('ring_one', renderRing(P.gold).toCanvas());
  scene.textures.addCanvas('ring_enemy', renderRing(0xc04a3a).toCanvas());
  scene.textures.addCanvas('ring_sel_big', renderRing(0xf6ecd8, 40, 18).toCanvas());
  scene.textures.addCanvas('ring_one_big', renderRing(P.gold, 40, 18).toCanvas());
  // miniature-style base plates and the selection outlines that hug them
  scene.textures.addCanvas('base_plate', renderBasePlate(PLATE_W).toCanvas());
  scene.textures.addCanvas('base_plate_big', renderBasePlate(PLATE_W_BIG).toCanvas());
  scene.textures.addCanvas('plate_sel', renderPlateRing(0x7fd0e0, PLATE_W).toCanvas());
  scene.textures.addCanvas('plate_one', renderPlateRing(0xf0d070, PLATE_W).toCanvas());
  scene.textures.addCanvas('plate_sel_big', renderPlateRing(0x7fd0e0, PLATE_W_BIG).toCanvas());
  scene.textures.addCanvas('plate_one_big', renderPlateRing(0xf0d070, PLATE_W_BIG).toCanvas());
  // routing flag
  const flag = new Pix(5, 7);
  flag.vline(0, 0, 6, P.wood[2]);
  flag.rect(1, 0, 4, 3, 0xf6ecd8);
  flag.set(4, 2, 0xd8ccb4);
  scene.textures.addCanvas('flag_white', flag.toCanvas());
  // block spark
  const sp = new Pix(5, 5);
  sp.set(2, 0, 0xfff4c0);
  sp.set(2, 4, 0xfff4c0);
  sp.set(0, 2, 0xfff4c0);
  sp.set(4, 2, 0xfff4c0);
  sp.set(2, 2, 0xffffff);
  scene.textures.addCanvas('spark', sp.toCanvas());
  // 1x1 white pixel
  const w = new Pix(1, 1);
  w.set(0, 0, 0xffffff);
  scene.textures.addCanvas('px', w.toCanvas());
}
