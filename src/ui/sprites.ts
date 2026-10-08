/**
 * Registers procedurally generated textures with Phaser on demand.
 *
 * Soldier sheets (src/art/paperdoll.ts) are rendered lazily so a battle opens
 * quickly and stays light on a phone:
 *
 *  - UI screens (ensureDoll) get one texture per figure with all four facing
 *    rows; a row is drawn when asked for, the rest in idle time (pumpDolls).
 *    Wide sheets (a 2x man is 112 x 40 columns) wrap their columns so no
 *    texture is wider than a phone GPU allows.
 *  - The battle (battleRow / battleFrame) draws its figures at BATTLE_RES
 *    (twice the pixels each way, shown at the same size) into shared atlases:
 *    a frame gets a cell the first time it is shown (about 1-3 ms to draw),
 *    the breathing frames ahead of time; so an atlas holds only frames that
 *    were seen. Cells are trimmed to the frame's opaque bounds (Phaser trim
 *    data keeps the feet line and the effect overlays aligned), and a frame
 *    nobody has shown for a few seconds is dropped and its cell reused (a
 *    dead man keeps only his last frame). Atlases drawn into during a frame
 *    are uploaded once (flushDolls).
 *  - Figures with rare+ gear get matching effect frames in the same atlas
 *    (the 1 px outline ring and the glint mask, see renderFrameFx).
 *  - Portraits (ensurePortrait, addPortrait) are busts rendered at
 *    PORTRAIT_RES with an idle loop (breathing, blinks, glances, a glint),
 *    seeded per hero so a roster is never in step.
 *
 * Every sheet is keyed by the full loadout (dollKey: gear, rarity, paint,
 * cosmetics, look), so identical men share one texture and a changed item
 * shows at once.
 */
import Phaser from 'phaser';
import {
  ANIM, ANIM_FRAMES, NDIRS, NFRAMES, PORTRAIT_FPS, PORTRAIT_FRAMES, PORTRAIT_PX, PORTRAIT_RES, dollFx, dollGeom, dollKey, drawnFrames, portraitLoop, renderFrame, renderFrameFx, renderPortrait, sheetColumn, sheetFrames,
  type DollFx, type DollSpec, type SheetGeom,
} from '../art/paperdoll';
import { itemIconKey, renderItemIcon } from '../art/itemIcons';
import { renderItemIconHD } from '../art/itemIconsHD';
import { panelK } from './kit';
import { renderBasePlate, renderBlood, renderPlateRing, renderRing, renderShadow } from '../art/ground';
import { Pix } from '../art/pixels';
import { P } from '../art/palette';
import type { Item } from '../data/items';

/** Widest texture we create (safe on every phone GPU). */
const MAX_TEX_W = 4096;

interface DollTex {
  spec: DollSpec;
  geom: SheetGeom;
  /** Columns actually drawn in the sheet (men 40, other figures 16). */
  cols: number;
  /** Columns per texture row (the sheet wraps when a row would be too wide). */
  perRow: number;
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
    const geom = dollGeom(spec);
    const cols = sheetFrames(spec);
    d = { spec, geom, cols, perRow: Math.max(1, Math.min(cols, Math.floor(MAX_TEX_W / geom.fw))), rows: [false, false, false, false], fx, fxKey: hasFx(fx) && !spec.beast ? `${key}#fx` : null };
    dolls.set(key, d);
  }
  return d;
}

function put(ctx: CanvasRenderingContext2D, px: Pix, x: number, y: number): void {
  const img = ctx.createImageData(px.w, px.h);
  img.data.set(px.data);
  ctx.putImageData(img, x, y);
}

/** Where a column of a facing row sits on a (possibly wrapped) sheet: band = facing * bandsPerDir + wrap row. */
function cell(d: DollTex, col: number, dir: number, bands = 1): [number, number] {
  const wraps = Math.ceil(d.cols / d.perRow);
  return [(col % d.perRow) * d.geom.fw, ((dir * bands) * wraps + Math.floor(col / d.perRow)) * d.geom.fh];
}

function sheetHeight(d: DollTex, bands = 1): number {
  return Math.ceil(d.cols / d.perRow) * NDIRS * bands * d.geom.fh;
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
    const tex = scene.textures.createCanvas(key, fw * d.perRow, sheetHeight(d))!;
    for (let dir = 0; dir < NDIRS; dir++)
      for (let f = 0; f < NFRAMES; f++) {
        const [x, y] = cell(d, sheetColumn(f, d.cols), dir);
        tex.add(dir * NFRAMES + f, 0, x, y, fw, fh);
      }
    if (d.fxKey) {
      if (scene.textures.exists(d.fxKey)) scene.textures.remove(d.fxKey);
      const fxt = scene.textures.createCanvas(d.fxKey, fw * d.perRow, sheetHeight(d, 2))!;
      for (let dir = 0; dir < NDIRS; dir++)
        for (let f = 0; f < NFRAMES; f++) {
          const [x, y] = cell(d, sheetColumn(f, d.cols), dir, 2);
          fxt.add(`r${dir * NFRAMES + f}`, 0, x, y, fw, fh);
          fxt.add(`g${dir * NFRAMES + f}`, 0, x, y + Math.ceil(d.cols / d.perRow) * fh, fw, fh);
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
  const wrapH = Math.ceil(d.cols / d.perRow) * d.geom.fh;
  for (let f = 0; f < d.cols; f++) {
    const [x, y] = cell(d, f, dir);
    if (fctx) {
      const r = renderFrameFx(d.spec, f, dir);
      put(ctx, r.px, x, y);
      const [fx, fy] = cell(d, f, dir, 2);
      put(fctx, r.ring, fx, fy);
      put(fctx, r.glint, fx, fy + wrapH);
    } else put(ctx, renderFrame(d.spec, f, dir), x, y);
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

// ------------------------------------------------------------------ battle: shared atlases, frames on demand

/** Atlas canvas size: 1024 x 512 (2 MB) keeps a dirty atlas cheap to re-upload and the last, part-filled one small. */
const ATLAS_W = 1024;
const ATLAS_H = 512;
/** Shelf heights are rounded up to a multiple of this, so a freed slot fits frames of about the same height. */
const SHELF_STEP = 8;
/** A frame nobody asked for this long is dropped from its atlas (every sprite asks for its frame every update, so a shown frame never expires). */
const FRAME_TTL_MS = 6000;
/** How often the expiry sweep runs. */
const SWEEP_MS = 1000;

interface Shelf {
  y: number;
  h: number;
  /** End of the packed part; freed slots before it are listed in `free`. */
  x: number;
  free: { x: number; w: number }[];
}

interface Atlas {
  key: string;
  scene: Phaser.Scene;
  /** Shelves of equal-height slots, packed left to right. */
  shelves: Shelf[];
  nextY: number;
  /** Live slots (an atlas with none is removed, unless it is the scene's only one). */
  used: number;
}

/** A run of `n` frame-sized cells (a frame and its effect frames) on one shelf. */
interface Slot {
  atlas: Atlas;
  shelf: Shelf;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A frame as shown by a sprite: the atlas texture key and the frame name in it. */
export interface FrameRef {
  key: string;
  frame: string;
}

interface DrawnFrame extends FrameRef {
  ring?: string;
  glint?: string;
  slot: Slot;
  /** When a sprite last asked for it (performance.now()). */
  last: number;
}

interface RowTex {
  scene: Phaser.Scene;
  doll: DollTex;
  dir: number;
  /** Drawn columns: the frame to show, plus the ring / glint frames of rare+ gear. */
  frames: Map<number, DrawnFrame>;
  /** Columns still to draw in idle time. */
  pending: number[];
  /** Bumped per draw so a redrawn column gets a fresh frame name (a sprite then re-reads it instead of keeping a stale Frame). */
  gen: number;
}

const atlases = new Map<Phaser.Scene, Atlas[]>();
const rowTex = new Map<string, RowTex>();
const dirty = new Set<string>();
const rowQueue: string[] = [];
let atlasN = 0;
let sweptAt = 0;

/**
 * Columns drawn ahead in idle time: a figure's breathing (what it shows
 * most); a chariot's idle and gait. Everything else is drawn the moment it
 * first shows (~1-3 ms), so an atlas only ever holds frames that were seen:
 * men turn through facings they use for a moment, and most never play every
 * attack, death or run column.
 */
const COMMON_COLS: readonly number[] = [...ANIM.idle];
const COMMON_COLS_LEGACY: readonly number[] = [...ANIM_FRAMES.idle, ...ANIM_FRAMES.gallop];

const shelfH = (h: number) => Math.ceil(Math.max(1, h) / SHELF_STEP) * SHELF_STEP;

/** `n` cells of w x h side by side on one shelf (so a frame and its effect frames share a texture), reusing freed space first. */
function allocSlots(scene: Phaser.Scene, w: number, h: number, n: number): Slot {
  let list = atlases.get(scene);
  if (!list) atlases.set(scene, (list = []));
  const need = w * n;
  const hh = shelfH(h);
  // a freed run on a shelf of this height
  for (const a of list)
    for (const sh of a.shelves) {
      if (sh.h !== hh) continue;
      for (let i = 0; i < sh.free.length; i++) {
        const f = sh.free[i];
        if (f.w < need) continue;
        const slot: Slot = { atlas: a, shelf: sh, x: f.x, y: sh.y, w: need, h };
        if (f.w === need) sh.free.splice(i, 1);
        else {
          f.x += need;
          f.w -= need;
        }
        a.used++;
        return slot;
      }
    }
  // the end of a shelf of this height, or a new shelf
  for (const a of list) {
    for (const sh of a.shelves) if (sh.h === hh && sh.x + need <= ATLAS_W) return take(a, sh, need, h);
    if (a.nextY + hh <= ATLAS_H) {
      const sh: Shelf = { y: a.nextY, h: hh, x: 0, free: [] };
      a.shelves.push(sh);
      a.nextY += hh;
      return take(a, sh, need, h);
    }
  }
  const key = `dollatlas_${atlasN++}`;
  scene.textures.createCanvas(key, Math.max(ATLAS_W, need), Math.max(ATLAS_H, hh));
  const a: Atlas = { key, scene, shelves: [{ y: 0, h: hh, x: 0, free: [] }], nextY: hh, used: 0 };
  list.push(a);
  return take(a, a.shelves[0], need, h);
}

function take(a: Atlas, sh: Shelf, need: number, h: number): Slot {
  const slot: Slot = { atlas: a, shelf: sh, x: sh.x, y: sh.y, w: need, h };
  sh.x += need;
  a.used++;
  return slot;
}

/** Give a slot back: its run joins the shelf's free list (merged with neighbours); an emptied atlas goes, unless it is the last. */
function freeSlot(s: Slot): void {
  const sh = s.shelf;
  const a = s.atlas;
  if (s.x + s.w === sh.x) sh.x -= s.w; // the last run on the shelf: just shrink it
  else {
    sh.free.push({ x: s.x, w: s.w });
    sh.free.sort((p, q) => p.x - q.x);
    for (let i = 0; i + 1 < sh.free.length; ) {
      const p = sh.free[i];
      const q = sh.free[i + 1];
      if (p.x + p.w === q.x) {
        p.w += q.w;
        sh.free.splice(i + 1, 1);
      } else i++;
    }
    // a free run that reaches the shelf's end shrinks it instead
    const tail = sh.free[sh.free.length - 1];
    if (tail && tail.x + tail.w === sh.x) {
      sh.x = tail.x;
      sh.free.pop();
    }
  }
  a.used--;
  const list = atlases.get(a.scene);
  if (a.used === 0 && list && list.length > 1) {
    list.splice(list.indexOf(a), 1);
    dirty.delete(a.key);
    if (a.scene.textures.exists(a.key)) a.scene.textures.remove(a.key);
  }
}

/** Opaque bounding box of some frames together (x0, y0, x1, y1 exclusive); at least one pixel. */
function bounds(pix: Pix[]): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  for (const p of pix) {
    const d = p.data;
    for (let y = 0; y < p.h; y++) {
      const row = y * p.w;
      for (let x = 0; x < p.w; x++)
        if (d[(row + x) * 4 + 3] > 0) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    }
  }
  if (x1 < 0) return [0, 0, 1, 1];
  return [x0, y0, x1 + 1, y1 + 1];
}

/** Copy the part of a frame inside the bounds to an atlas cell. */
function putTrimmed(ctx: CanvasRenderingContext2D, px: Pix, b: [number, number, number, number], x: number, y: number): void {
  const img = ctx.createImageData(px.w, px.h);
  img.data.set(px.data);
  ctx.putImageData(img, x - b[0], y - b[1], b[0], b[1], b[2] - b[0], b[3] - b[1]);
}

/** Register a figure for the battle; returns its base key (pass it to battleRow). */
export function battleDoll(spec: DollSpec): string {
  const key = dollKey(spec);
  info(spec, key);
  return key;
}

/**
 * One facing row of a battle figure: returns its row key. Frames are drawn
 * into the scene's atlases on demand (battleFrame); the common ones are
 * queued for idle time. The sprite shows whatever battleFrame returns.
 */
export function battleRow(scene: Phaser.Scene, key: string, dir: number): string {
  const rk = `${key}|${dir}`;
  const r = rowTex.get(rk);
  if (r && r.scene === scene) return rk;
  const d = dolls.get(key);
  if (!d) throw new Error(`battleRow: unknown figure ${key}`);
  const common = drawnFrames(d.spec) >= NFRAMES ? COMMON_COLS : COMMON_COLS_LEGACY;
  rowTex.set(rk, { scene, doll: d, dir, frames: new Map(), pending: common.filter((c) => c !== 0), gen: 0 });
  rowQueue.push(rk);
  battleFrame(rk, 0);
  return rk;
}

/** Whether a battle row carries effect frames (rare+ gear): ring and glint names come with battleFrame. */
export function battleRowFx(rk: string): boolean {
  return !!rowTex.get(rk)?.doll.fxKey;
}

/**
 * The frame of a battle row to show (drawn now if it is not yet; uploaded at
 * the next flushDolls). With rare+ gear, `ring` and `glint` name the effect
 * frames in the same texture. Frames are trimmed to their opaque bounds in
 * the atlas and carry the full frame size and offset as Phaser trim data, so
 * a sprite's origin (the feet line) and its effect overlays line up as if
 * the frame were whole.
 */
export function battleFrame(rk: string, frame: number): FrameRef & { ring?: string; glint?: string } {
  const r = rowTex.get(rk);
  if (!r) return { key: '__MISSING', frame: '__BASE' };
  const col = sheetColumn(frame, drawnFrames(r.doll.spec));
  const have = r.frames.get(col);
  const now = performance.now();
  if (have) {
    have.last = now;
    return have;
  }
  const { fw, fh } = r.doll.geom;
  const fx = !!r.doll.fxKey;
  const f = fx ? renderFrameFx(r.doll.spec, col, r.dir) : { px: renderFrame(r.doll.spec, col, r.dir), ring: null, glint: null };
  // the ring sits one pixel outside the figure: one box holds the frame and both effect frames
  const b = bounds(f.ring ? [f.px, f.ring] : [f.px]);
  const w = b[2] - b[0];
  const h = b[3] - b[1];
  const slot = allocSlots(r.scene, w, h, fx ? 3 : 1);
  const tex = r.scene.textures.get(slot.atlas.key) as Phaser.Textures.CanvasTexture;
  const ctx = tex.getContext();
  const gen = ++r.gen;
  const name = `${rk}/${col}.${gen}`;
  const ref: DrawnFrame = { key: slot.atlas.key, frame: name, slot, last: now };
  const add = (nm: string, px: Pix, i: number) => {
    putTrimmed(ctx, px, b, slot.x + i * w, slot.y);
    tex.add(nm, 0, slot.x + i * w, slot.y, w, h)?.setTrim(fw, fh, b[0], b[1], w, h);
  };
  add(name, f.px, 0);
  if (f.ring && f.glint) {
    ref.ring = `${rk}/r${col}.${gen}`;
    add(ref.ring, f.ring, 1);
    ref.glint = `${rk}/g${col}.${gen}`;
    add(ref.glint, f.glint, 2);
  }
  r.frames.set(col, ref);
  const pi = r.pending.indexOf(col);
  if (pi >= 0) r.pending.splice(pi, 1);
  dirty.add(slot.atlas.key);
  return ref;
}

function dropFrame(r: RowTex, col: number, f: DrawnFrame): void {
  const tex = r.scene.textures.exists(f.key) ? (r.scene.textures.get(f.key) as Phaser.Textures.CanvasTexture) : null;
  if (tex) {
    tex.remove(f.frame);
    if (f.ring) tex.remove(f.ring);
    if (f.glint) tex.remove(f.glint);
  }
  r.frames.delete(col);
  freeSlot(f.slot);
}

/**
 * Drop the frames nobody has shown for a while (a dead man's standing frames,
 * the facings a rider turned away from), so their atlas space is reused.
 * Safe because every sprite asks for its frame each update (BattleScene,
 * MenuBattle), which keeps that frame alive, and a redrawn frame gets a new
 * name, so a sprite never keeps a frame object whose cell was reassigned.
 */
function sweepFrames(now: number): void {
  if (now - sweptAt < SWEEP_MS) return;
  sweptAt = now;
  for (const r of rowTex.values()) {
    if (!r.scene.sys.isActive() || !r.frames.size) continue;
    for (const [col, f] of r.frames) if (now - f.last > FRAME_TTL_MS) dropFrame(r, col, f);
  }
}

/** Upload every atlas drawn into since the last call (once per game frame, before rendering). */
export function flushDolls(scene: Phaser.Scene): void {
  for (const k of dirty) if (scene.textures.exists(k)) (scene.textures.get(k) as Phaser.Textures.CanvasTexture).refresh();
  dirty.clear();
}

/** Forget a scene's battle rows and atlases (a scene restarting). */
export function releaseBattleRows(scene: Phaser.Scene): void {
  for (const [k, r] of rowTex) if (r.scene === scene) rowTex.delete(k);
  for (const a of atlases.get(scene) ?? []) {
    dirty.delete(a.key);
    if (scene.textures.exists(a.key)) scene.textures.remove(a.key);
  }
  atlases.delete(scene);
  rowQueue.length = 0;
}

/** Texture memory held by a scene's battle atlases (bytes), for the perf overlay. */
export function battleAtlasBytes(scene: Phaser.Scene): number {
  return (atlases.get(scene)?.length ?? 0) * ATLAS_W * ATLAS_H * 4;
}

/** Frames held in a scene's battle atlases and the cells they take (bytes), for tests and the perf overlay. */
export function battleAtlasStats(scene: Phaser.Scene): { atlases: number; frames: number; cellBytes: number } {
  let frames = 0;
  let cellBytes = 0;
  for (const r of rowTex.values()) {
    if (r.scene !== scene) continue;
    for (const f of r.frames.values()) {
      frames++;
      cellBytes += f.slot.w * f.slot.h * 4;
    }
  }
  return { atlases: atlases.get(scene)?.length ?? 0, frames, cellBytes };
}

/** Draw queued rows / frames for at most `budgetMs` (call once per frame); expire frames not shown lately. */
export function pumpDolls(budgetMs = 6): void {
  const t0 = performance.now();
  sweepFrames(t0);
  while (queue.length && performance.now() - t0 < budgetMs) {
    const q = queue.shift()!;
    if (!q.scene.sys.isActive() || !q.scene.textures.exists(q.key)) continue;
    ensureDollRow(q.scene, q.key, q.dir);
  }
  // battle rows in use: fill in the common frames not shown yet, a few at a time
  while (rowQueue.length && performance.now() - t0 < budgetMs) {
    const rk = rowQueue[0];
    const r = rowTex.get(rk);
    if (!r || !r.pending.length || !r.scene.sys.isActive()) {
      rowQueue.shift();
      continue;
    }
    battleFrame(rk, r.pending[0]);
  }
}

/** Sheet geometry of a registered figure (frame size and feet line, in rendered pixels). */
export function dollGeomOf(key: string): SheetGeom {
  return dolls.get(key)?.geom ?? { fw: 56, fh: 72, footY: 64 };
}

/** Sprite origin that puts the feet on the sprite's position. */
export function dollOrigin(key: string): [number, number] {
  const g = dollGeomOf(key);
  return [0.5, g.footY / g.fh];
}

/** The scale a sprite of a registered figure needs to show at its world size (1 / its render resolution). */
export function dollDisplayScale(key: string): number {
  return 1 / (dolls.get(key)?.spec.res ?? 1);
}

// ------------------------------------------------------------------ portraits

/**
 * A still head-and-shoulders portrait (PORTRAIT_PX square, drawn at 1x) of a
 * figure: the class icon in lists for callers that want a plain image.
 */
export function ensurePortrait(scene: Phaser.Scene, spec: DollSpec): string {
  const key = `portrait_${dollKey(spec)}`;
  if (scene.textures.exists(key)) return key;
  scene.textures.addCanvas(key, renderPortrait(spec, 0, 1).toCanvas());
  return key;
}

/**
 * The animated portrait of a figure: a sheet of idle variants at PORTRAIT_RES
 * and a seeded idle loop. Returns the texture key, the animation key and the
 * scale that shows it at PORTRAIT_PX.
 */
export function ensurePortraitAnim(scene: Phaser.Scene, spec: DollSpec): { key: string; anim: string; scale: number } {
  const key = `portraitHD_${dollKey(spec)}`;
  const anim = `${key}#idle`;
  const size = PORTRAIT_PX * PORTRAIT_RES;
  if (!scene.textures.exists(key)) {
    const tex = scene.textures.createCanvas(key, size * PORTRAIT_FRAMES.length, size)!;
    const ctx = tex.getContext();
    for (let f = 0; f < PORTRAIT_FRAMES.length; f++) {
      put(ctx, renderPortrait(spec, f), f * size, 0);
      tex.add(f, 0, f * size, 0, size, size);
    }
    tex.refresh();
  }
  if (!scene.anims.exists(anim)) {
    const loop = portraitLoop(spec.seed ?? 0);
    scene.anims.create({ key: anim, frames: loop.map((f) => ({ key, frame: f })), frameRate: PORTRAIT_FPS, repeat: -1 });
  }
  return { key, anim, scale: 1 / PORTRAIT_RES };
}

/**
 * A portrait sprite at (x, y) (top-left), PORTRAIT_PX square on screen and
 * alive: breathing, blinking and glancing on its own rhythm. `still` for a
 * frozen one; `crop` (display px) trims it like Image.setCrop would.
 */
export function addPortrait(scene: Phaser.Scene, spec: DollSpec, x: number, y: number, opts: { still?: boolean; crop?: [number, number, number, number] } = {}): Phaser.GameObjects.Sprite {
  const p = ensurePortraitAnim(scene, spec);
  const spr = scene.add.sprite(x, y, p.key, 0).setOrigin(0, 0).setScale(p.scale);
  if (opts.crop) spr.setCrop(opts.crop[0] * PORTRAIT_RES, opts.crop[1] * PORTRAIT_RES, opts.crop[2] * PORTRAIT_RES, opts.crop[3] * PORTRAIT_RES);
  if (!opts.still) {
    // a random point of the loop, so a roster breathes out of step
    const n = scene.anims.get(p.anim)?.frames.length ?? 1;
    spr.play({ key: p.anim, startFrame: Math.floor(Math.random() * n) });
  }
  return spr;
}

/**
 * The texture of an item's icon at `size` UI px: a smooth icon drawn at the
 * screen's density (src/art/itemIconsHD.ts, K atlas px per UI px), so an
 * image showing it is scaled by `size / image.width` (see addItemIcon /
 * fitItemIcon). Falls back on the pixel icon where there is no DOM.
 */
export function ensureItemIcon(scene: Phaser.Scene, item: Item, size = 16): string {
  if (typeof document === 'undefined') {
    const key = itemIconKey(item);
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, renderItemIcon(item).toCanvas());
    return key;
  }
  const px = Math.round(size * panelK(scene));
  const key = itemIconKey(item, px);
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, renderItemIconHD(item, px))!.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return key;
}

/** Scale an image of an item icon texture to `size` UI px. */
export function fitItemIcon(img: Phaser.GameObjects.Image, size = 16): Phaser.GameObjects.Image {
  return img.setScale(size / Math.max(1, img.width));
}

/** An item icon image at (x, y), origin top left, `size` UI px on a side. */
export function addItemIcon(scene: Phaser.Scene, x: number, y: number, item: Item, size = 16): Phaser.GameObjects.Image {
  return fitItemIcon(scene.add.image(x, y, ensureItemIcon(scene, item, size)).setOrigin(0, 0), size);
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
