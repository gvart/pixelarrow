/**
 * Registers procedurally generated textures with Phaser on demand.
 *
 * Soldier sheets (src/art/paperdoll.ts) are rendered lazily so a battle opens
 * quickly and stays light on a phone:
 *
 *  - UI screens (ensureDoll) get one texture per figure with all four facing
 *    rows; a row is drawn when asked for, the rest in idle time (pumpDolls).
 *  - The battle (battleRow / battleFrame) gets one texture per figure *and
 *    facing row*, created only when a man first faces that way (most men only
 *    ever face one or two ways), and each frame is drawn the first time it is
 *    shown; the remaining frames of the rows in use are filled in idle time.
 *    Textures drawn into during a frame are uploaded once (flushDolls).
 *  - Figures with rare+ gear get a matching effect texture per row (the 1 px
 *    outline ring and the glint mask, see renderFrameFx), drawn with the frame.
 *
 * Every sheet is keyed by the full loadout (dollKey: gear, rarity, paint,
 * cosmetics, look), so identical men share one texture and a changed item
 * shows at once.
 */
import Phaser from 'phaser';
import { NDIRS, NFRAMES, dollFx, dollGeom, dollKey, renderFrame, renderFrameFx, sheetColumn, sheetFrames, type DollFx, type DollSpec, type SheetGeom } from '../art/paperdoll';
import { itemIconKey, renderItemIcon } from '../art/itemIcons';
import { renderBasePlate, renderBlood, renderPlateRing, renderRing, renderShadow } from '../art/ground';
import { Pix } from '../art/pixels';
import { P } from '../art/palette';
import type { Item } from '../data/items';

interface DollTex {
  spec: DollSpec;
  geom: SheetGeom;
  /** Columns actually drawn in the sheet (men 40, other figures 16). */
  cols: number;
  rows: boolean[];
  fx: DollFx;
  /** Effect sheet key (rare+ gear only). */
  fxKey: string | null;
}

const dolls = new Map<string, DollTex>();
const queue: { scene: Phaser.Scene; key: string; dir: number }[] = [];

const hasFx = (fx: DollFx) => fx.glint || fx.outline !== null;

function info(spec: DollSpec, key: string): DollTex {
  let d = dolls.get(key);
  if (!d) {
    const fx = dollFx(spec);
    d = { spec, geom: dollGeom(spec), cols: sheetFrames(spec), rows: [false, false, false, false], fx, fxKey: hasFx(fx) && !spec.beast ? `${key}#fx` : null };
    dolls.set(key, d);
  }
  return d;
}

function put(ctx: CanvasRenderingContext2D, px: Pix, x: number, y: number): void {
  const img = ctx.createImageData(px.w, px.h);
  img.data.set(px.data);
  ctx.putImageData(img, x, y);
}

/**
 * The texture key of a figure's sheet; renders the given facing rows now
 * (default: all four). Frames are numbered dir * NFRAMES + frame on every
 * sheet (frames a 16-column figure lacks alias its nearest legacy column).
 */
export function ensureDoll(scene: Phaser.Scene, spec: DollSpec, rows: number[] = [0, 1, 2, 3]): string {
  const key = dollKey(spec);
  const d = info(spec, key);
  if (!scene.textures.exists(key)) {
    d.rows = [false, false, false, false];
    const { fw, fh } = d.geom;
    const tex = scene.textures.createCanvas(key, fw * d.cols, fh * NDIRS)!;
    for (let dir = 0; dir < NDIRS; dir++) for (let f = 0; f < NFRAMES; f++) tex.add(dir * NFRAMES + f, 0, sheetColumn(f, d.cols) * fw, dir * fh, fw, fh);
    if (d.fxKey) {
      if (scene.textures.exists(d.fxKey)) scene.textures.remove(d.fxKey);
      const fxt = scene.textures.createCanvas(d.fxKey, fw * d.cols, fh * NDIRS * 2)!;
      for (let dir = 0; dir < NDIRS; dir++)
        for (let f = 0; f < NFRAMES; f++) {
          fxt.add(`r${dir * NFRAMES + f}`, 0, sheetColumn(f, d.cols) * fw, dir * fh, fw, fh);
          fxt.add(`g${dir * NFRAMES + f}`, 0, sheetColumn(f, d.cols) * fw, (NDIRS + dir) * fh, fw, fh);
        }
    }
  }
  let drew = false;
  for (const r of rows) drew = drawRow(scene, key, d, r) || drew;
  if (drew) refresh(scene, key, d.fxKey);
  return key;
}

function refresh(scene: Phaser.Scene, key: string, fxKey: string | null): void {
  (scene.textures.get(key) as Phaser.Textures.CanvasTexture).refresh();
  if (fxKey && scene.textures.exists(fxKey)) (scene.textures.get(fxKey) as Phaser.Textures.CanvasTexture).refresh();
}

function drawRow(scene: Phaser.Scene, key: string, d: DollTex, dir: number): boolean {
  if (d.rows[dir]) return false;
  const ctx = (scene.textures.get(key) as Phaser.Textures.CanvasTexture).getContext();
  const fctx = d.fxKey ? (scene.textures.get(d.fxKey) as Phaser.Textures.CanvasTexture).getContext() : null;
  for (let f = 0; f < d.cols; f++) {
    if (fctx) {
      const r = renderFrameFx(d.spec, f, dir);
      put(ctx, r.px, f * d.geom.fw, dir * d.geom.fh);
      put(fctx, r.ring, f * d.geom.fw, dir * d.geom.fh);
      put(fctx, r.glint, f * d.geom.fw, (NDIRS + dir) * d.geom.fh);
    } else put(ctx, renderFrame(d.spec, f, dir), f * d.geom.fw, dir * d.geom.fh);
  }
  d.rows[dir] = true;
  return true;
}

/** Make sure a row is drawn before a sprite shows it (a man turning to a new facing). */
export function ensureDollRow(scene: Phaser.Scene, key: string, dir: number): void {
  const d = dolls.get(key);
  if (!d || d.rows[dir] || !scene.textures.exists(key)) return;
  if (drawRow(scene, key, d, dir)) refresh(scene, key, d.fxKey);
}

/** Queue the remaining rows of a sheet for idle time. */
export function queueDollRows(scene: Phaser.Scene, key: string): void {
  const d = dolls.get(key);
  if (!d) return;
  for (let r = 0; r < NDIRS; r++) if (!d.rows[r]) queue.push({ scene, key, dir: r });
}

export function dollFrame(dir: number, f: number): number {
  return dir * NFRAMES + f;
}

/** The effect sheet of a figure drawn with ensureDoll (null: no rare+ gear). */
export function dollFxKey(key: string): string | null {
  return dolls.get(key)?.fxKey ?? null;
}

/** The rarity effects of a registered figure. */
export function dollFxOf(key: string): DollFx | null {
  return dolls.get(key)?.fx ?? null;
}

// ------------------------------------------------------------------ battle: one texture per facing, frames on demand

interface RowTex {
  scene: Phaser.Scene;
  doll: DollTex;
  dir: number;
  drawn: boolean[];
  left: number;
  fxKey: string | null;
}

const rowTex = new Map<string, RowTex>();
const dirty = new Set<string>();
const rowQueue: string[] = [];

/** Register a figure for the battle; returns its base key (pass it to battleRow). */
export function battleDoll(spec: DollSpec): string {
  const key = dollKey(spec);
  info(spec, key);
  return key;
}

/**
 * The texture of one facing row of a battle figure (created on first use).
 * Its frames are named by column (0..NFRAMES-1, aliased on 16-column
 * figures); call battleFrame before showing one.
 */
export function battleRow(scene: Phaser.Scene, key: string, dir: number): string {
  const rk = `${key}|${dir}`;
  const r = rowTex.get(rk);
  if (r && r.scene === scene && scene.textures.exists(rk)) return rk;
  const d = dolls.get(key);
  if (!d) throw new Error(`battleRow: unknown figure ${key}`);
  if (scene.textures.exists(rk)) scene.textures.remove(rk);
  const { fw, fh } = d.geom;
  const tex = scene.textures.createCanvas(rk, fw * d.cols, fh)!;
  for (let f = 0; f < NFRAMES; f++) tex.add(f, 0, sheetColumn(f, d.cols) * fw, 0, fw, fh);
  let fxKey: string | null = null;
  if (d.fxKey) {
    fxKey = `${rk}#fx`;
    if (scene.textures.exists(fxKey)) scene.textures.remove(fxKey);
    const fxt = scene.textures.createCanvas(fxKey, fw * d.cols, fh * 2)!;
    for (let f = 0; f < NFRAMES; f++) {
      fxt.add(`r${f}`, 0, sheetColumn(f, d.cols) * fw, 0, fw, fh);
      fxt.add(`g${f}`, 0, sheetColumn(f, d.cols) * fw, fh, fw, fh);
    }
  }
  rowTex.set(rk, { scene, doll: d, dir, drawn: new Array(d.cols).fill(false), left: d.cols, fxKey });
  rowQueue.push(rk);
  battleFrame(rk, 0);
  return rk;
}

/** The effect texture of a battle row (null when the figure has no rare+ gear). */
export function battleRowFx(rk: string): string | null {
  return rowTex.get(rk)?.fxKey ?? null;
}

/** Draw a frame of a battle row if it is not drawn yet (uploaded at the next flushDolls). */
export function battleFrame(rk: string, frame: number): void {
  const r = rowTex.get(rk);
  if (!r) return;
  const col = sheetColumn(frame, r.doll.cols);
  if (r.drawn[col]) return;
  if (!r.scene.sys.isActive() || !r.scene.textures.exists(rk)) return;
  const { fw } = r.doll.geom;
  const ctx = (r.scene.textures.get(rk) as Phaser.Textures.CanvasTexture).getContext();
  if (r.fxKey && r.scene.textures.exists(r.fxKey)) {
    const fx = renderFrameFx(r.doll.spec, col, r.dir);
    put(ctx, fx.px, col * fw, 0);
    const fctx = (r.scene.textures.get(r.fxKey) as Phaser.Textures.CanvasTexture).getContext();
    put(fctx, fx.ring, col * fw, 0);
    put(fctx, fx.glint, col * fw, r.doll.geom.fh);
    dirty.add(r.fxKey);
  } else put(ctx, renderFrame(r.doll.spec, col, r.dir), col * fw, 0);
  r.drawn[col] = true;
  r.left--;
  dirty.add(rk);
}

/** Upload every texture drawn into since the last call (once per game frame, before rendering). */
export function flushDolls(scene: Phaser.Scene): void {
  for (const k of dirty) if (scene.textures.exists(k)) (scene.textures.get(k) as Phaser.Textures.CanvasTexture).refresh();
  dirty.clear();
}

/** Forget a scene's battle rows (their textures go with the scene's texture manager entries). */
export function releaseBattleRows(scene: Phaser.Scene): void {
  for (const [k, r] of rowTex) {
    if (r.scene !== scene) continue;
    if (scene.textures.exists(k)) scene.textures.remove(k);
    if (r.fxKey && scene.textures.exists(r.fxKey)) scene.textures.remove(r.fxKey);
    rowTex.delete(k);
  }
  rowQueue.length = 0;
}

/** Draw queued rows / frames for at most `budgetMs` (call once per frame). */
export function pumpDolls(budgetMs = 6): void {
  const t0 = performance.now();
  while (queue.length && performance.now() - t0 < budgetMs) {
    const q = queue.shift()!;
    if (!q.scene.sys.isActive() || !q.scene.textures.exists(q.key)) continue;
    ensureDollRow(q.scene, q.key, q.dir);
  }
  // battle rows in use: fill in the frames not shown yet, a few at a time
  while (rowQueue.length && performance.now() - t0 < budgetMs) {
    const rk = rowQueue[0];
    const r = rowTex.get(rk);
    if (!r || r.left <= 0 || !r.scene.sys.isActive()) {
      rowQueue.shift();
      continue;
    }
    const col = r.drawn.indexOf(false);
    if (col < 0) {
      rowQueue.shift();
      continue;
    }
    battleFrame(rk, col);
  }
}

/** Sheet geometry of a registered figure (frame size and feet line). */
export function dollGeomOf(key: string): SheetGeom {
  return dolls.get(key)?.geom ?? { fw: 56, fh: 72, footY: 64 };
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
