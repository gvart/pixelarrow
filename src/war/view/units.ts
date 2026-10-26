/**
 * Soldiers on the iso map at real scale (W-18): the shipped PixelLab sheets (src/assets/sheets/,
 * v2: one image, rows are facings) drawn 1:1, a 58 px man on a 64 x 32 tile at zoom 1. A sheet
 * has four facings (the iso diagonals); a unit shows the one nearest its heading on screen and
 * the clip ./anim.ts picks. Sprites sample NEAREST at every zoom: no blur, small motions stay
 * visible at 1/2.
 * Units are depth sorted by x + y (with the map objects, ./objects.ts); the player's own men hidden
 * behind higher ground, a wall or a stone object show as a team-coloured outline over it; hidden
 * foes are simply hidden.
 * The sheets wear red; team 0 (blue) draws through TEAM_SWAP, a shader that turns the red cloth blue.
 * A man walking with a load (./anim.ts loadOf) carries its sprite (src/assets/loads) at his sheet's per-frame
 * `loads` anchor: on the shoulder over him, held at the chest under him in the north facings (his back to us).
 */
import Phaser from 'phaser';
import type { SheetManifest } from '../../art/sheetManifest';
import type { ShotSnap, SquadSnap } from '../types';
import { Animator, loadOf, type AnimTime, type ClipDef } from './anim';
import loadsManifest from '../../assets/loads/manifest.json';
import loadsUrl from '../../assets/loads/loads.png?url';
import type { DrawUnit } from './simClient';
import { LH, type IsoMap } from './iso';
import type { Lift } from './build/buildingLayer';

export const TEAM_COLOR = [0x4aa3ff, 0xe0503c, 0xe8c040, 0xb070e0];
/** A light multiply per team on the sprites (team 0 is also hue-swapped, see TEAM_SWAP). */
const TEAM_TINT = [0xd0e4ff, 0xffd4c8, 0xfff0c0, 0xecd8ff];
/** Sprites show from this zoom up: always, now the camera stops at 1/2 (SandboxScene MIN_ZOOM); other layers still ask. */
export const SPRITE_ZOOM = 1 / 3;
/** World px from the feet to a man's middle (a sprite is ~58 px tall). */
export const BODY = 28;
const FALLBACK_CLASS = 'militia';
const TEAM_SWAP = 'WarTeamBlue';

/**
 * Phaser's single-texture sprite shader plus a red -> blue swap of saturated red pixels (cloaks,
 * crests, shield paint); skin, bronze and leather (green well above blue) keep their colours.
 * Textures are premultiplied, so the swap runs on un-premultiplied colour.
 */
const SWAP_FRAG = `
precision mediump float;
uniform sampler2D uMainSampler;
varying vec2 outTexCoord;
varying float outTintEffect;
varying vec4 outTint;
void main() {
  vec4 t = texture2D(uMainSampler, outTexCoord);
  vec3 c = t.a > 0.0 ? t.rgb / t.a : t.rgb;
  float r = max(c.r, 0.001);
  float w = smoothstep(0.3, 0.55, (c.r - max(c.g, c.b)) / r) * (1.0 - smoothstep(0.1, 0.25, (c.g - c.b) / r));
  c = mix(c, vec3(c.b * 0.6, c.g * 0.8 + c.r * 0.3, c.r * 1.2 + 0.06), w);
  t.rgb = c * t.a;
  vec4 texel = vec4(outTint.bgr * outTint.a, outTint.a);
  vec4 color = t * texel;
  if (outTintEffect == 1.0) color.rgb = mix(t.rgb, outTint.bgr * outTint.a, t.a);
  else if (outTintEffect == 2.0) color = texel;
  gl_FragColor = color;
}`;

function addSwapPipeline(scene: Phaser.Scene): boolean {
  const r = scene.renderer;
  if (!(r instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return false;
  if (!r.pipelines.has(TEAM_SWAP)) r.pipelines.add(TEAM_SWAP, new Phaser.Renderer.WebGL.Pipelines.SinglePipeline({ game: scene.game, fragShader: SWAP_FRAG }));
  return true;
}

const OUTLINE = 'WarOutline';
/**
 * A hidden man's outline: the tint colour on each transparent pixel next to an opaque one, one screen px out (the
 * neighbour step is the screen-px derivative of the texture coordinate). Batched like any sprite: no framebuffer pass.
 */
const OUTLINE_FRAG = `
#extension GL_OES_standard_derivatives : enable
precision mediump float;
uniform sampler2D uMainSampler;
varying vec2 outTexCoord;
varying float outTintEffect;
varying vec4 outTint;
void main() {
  vec2 dx = vec2(dFdx(outTexCoord.x), 0.0), dy = vec2(0.0, dFdy(outTexCoord.y));
  float a = texture2D(uMainSampler, outTexCoord).a;
  float n = max(max(texture2D(uMainSampler, outTexCoord + dx).a, texture2D(uMainSampler, outTexCoord - dx).a),
                max(texture2D(uMainSampler, outTexCoord + dy).a, texture2D(uMainSampler, outTexCoord - dy).a));
  float edge = step(0.5, n) * (1.0 - step(0.5, a));
  gl_FragColor = vec4(outTint.bgr, 1.0) * outTint.a * edge;
}`;

function addOutlinePipeline(scene: Phaser.Scene): boolean {
  const r = scene.renderer;
  if (!(r instanceof Phaser.Renderer.WebGL.WebGLRenderer) || !r.gl.getExtension('OES_standard_derivatives')) return false;
  if (!r.pipelines.has(OUTLINE)) r.pipelines.add(OUTLINE, new Phaser.Renderer.WebGL.Pipelines.SinglePipeline({ game: scene.game, fragShader: OUTLINE_FRAG }));
  return true;
}

const manifests = import.meta.glob<SheetManifest>('../../assets/sheets/*/manifest.json', { eager: true, import: 'default' });
const images = import.meta.glob<string>(
  ['../../assets/sheets/militia/*.png', '../../assets/sheets/hoplite/*.png', '../../assets/sheets/celt_sword/*.png', '../../assets/sheets/archer/*.png', '../../assets/sheets/slinger/*.png', '../../assets/sheets/javelineer/*.png', '../../assets/sheets/mob_*/*.png', '../../assets/sheets/civ_*/*.png'],
  { eager: true, query: '?url', import: 'default' },
);
/** Texture side every GPU takes: a taller sheet is split into pieces of whole bands. */
const MAX_TEX = 4096;
/** Screen quadrant (x right, y down) -> sheet row name. */
const QUADRANT = ['south-east', 'south-west', 'north-east', 'north-west'] as const;

/** A sheet's load anchors (scripts/art/pixellab/anim3/anchors.mjs): per point, per row name, per frame of `clip`, [dx, dy] from the feet. */
interface SheetLoads { clip: string; shoulder: Record<string, [number, number][]>; chest: Record<string, [number, number][]> }
const LOADS_KEY = 'war-loads';

interface Sheet {
  /** Per quadrant: the image row, and the sprite origin (the feet). */
  rows: { row: number; ox: number; oy: number }[];
  clips: Map<string, ClipDef>;
  /** Per clip, per image row, per frame: [texture key, frame name]. */
  frames: Map<string, [string, string][][]>;
  /** Image row names, top to bottom, and the load anchors (none: no loads drawn). */
  rowNames: string[];
  loads?: SheetLoads;
  /** M7d: draw scale over a soldier's (manifest scale / 0.55: giants 1.8x, Drakon 2.7x), so every guardian stands at true size. */
  scale: number;
  /** Frame size (px). */
  fw: number; fh: number;
}
/** How a watched unit (a guardian) was drawn this frame: its clip and frame, row, feet (world px), origin and scale. */
export interface DrawnAs { clip: string; frame: number; row: string; x: number; y: number; ox: number; oy: number; scale: number; fw: number; fh: number }
/** The manifest scale of a soldier sheet: 33 px/m (public/war/guardians.json). */
const SOLDIER_SCALE = 0.55;

/** Fetch and decode the class sheets (before the game starts: big ones are split, see buildSheet). */
export async function loadSheetImages(): Promise<Map<string, HTMLImageElement>> {
  const out = new Map<string, HTMLImageElement>();
  await Promise.all(Object.entries(images).map(async ([path, url]) => {
    const im = new Image();
    await new Promise((ok, fail) => { im.onload = ok; im.onerror = () => fail(new Error(`sheet ${url} failed to load`)); im.src = url; });
    out.set(path.split('/').at(-2)!, im);
  }));
  const im = new Image();
  await new Promise((ok, fail) => { im.onload = ok; im.onerror = () => fail(new Error(`loads ${loadsUrl} failed to load`)); im.src = loadsUrl; });
  out.set(LOADS_KEY, im);
  return out;
}

/**
 * Cut every clip of the manifest (all of them, so new clips are there by name) into frames. A sheet
 * over MAX_TEX tall goes up as several textures of whole bands (`wrap`), each under the limit.
 */
function buildSheet(scene: Phaser.Scene, cls: string, m: SheetManifest, img: HTMLImageElement): Sheet {
  const { w: fw, h: fh } = m.frame, wrap = m.wrap ?? 1e9, bandH = m.rows.length * fh;
  const per = img.height > MAX_TEX ? Math.max(1, Math.floor(MAX_TEX / bandH)) : Infinity; // bands per texture
  const nTex = per === Infinity ? 1 : Math.ceil(img.height / (per * bandH));
  const keys: string[] = [];
  for (let t = 0; t < nTex; t++) {
    const key = nTex === 1 ? `war-${cls}` : `war-${cls}-${t}`;
    keys.push(key);
    if (scene.textures.exists(key)) continue;
    if (nTex === 1) { scene.textures.addImage(key, img); continue; }
    const y0 = t * per * bandH, h = Math.min(per * bandH, img.height - y0), c = document.createElement('canvas');
    c.width = img.width; c.height = h;
    c.getContext('2d')!.drawImage(img, 0, y0, img.width, h, 0, 0, img.width, h);
    scene.textures.addCanvas(key, c);
  }
  for (const k of keys) scene.textures.get(k).setFilter(Phaser.Textures.FilterMode.NEAREST);
  const rows = QUADRANT.map((name) => {
    const a = m.anchors?.[name] ?? m.anchor;
    return { row: Math.max(0, m.rows.indexOf(name)), ox: a.x / fw, oy: a.y / fh };
  });
  const clips = new Map<string, ClipDef>(), frames = new Map<string, [string, string][][]>();
  for (const [name, def] of Object.entries(m.anims)) {
    if (!def) continue;
    clips.set(name, { n: def.frames, fps: def.fps, strike: def.strike ?? Math.floor(def.frames / 2), hold: Math.min(def.hold ?? 0, def.frames - 1) });
    const byRow: [string, string][][] = [];
    for (let row = 0; row < m.rows.length; row++) {
      const fr: [string, string][] = [];
      for (let i = 0; i < def.frames; i++) {
        const c = def.col + i, band = Math.floor(c / wrap), t = nTex === 1 ? 0 : Math.floor(band / per);
        const key = keys[t], fname = `${name}${row}_${i}`, tex = scene.textures.get(key);
        if (!tex.has(fname)) tex.add(fname, 0, (c % wrap) * fw, ((band - t * (nTex === 1 ? 0 : per)) * m.rows.length + row) * fh, fw, fh);
        fr.push([key, fname]);
      }
      byRow.push(fr);
    }
    frames.set(name, byRow);
  }
  const ms = (m as SheetManifest & { scale?: number }).scale ?? SOLDIER_SCALE;
  return { rows, clips, frames, rowNames: m.rows, loads: (m as SheetManifest & { loads?: SheetLoads }).loads, scale: ms / SOLDIER_SCALE, fw, fh };
}

/** The load sprites as frames of one texture, named as in src/assets/loads/manifest.json. */
function buildLoads(scene: Phaser.Scene, img: HTMLImageElement): void {
  if (scene.textures.exists(LOADS_KEY)) return;
  const tex = scene.textures.addImage(LOADS_KEY, img)!;
  for (const [name, f] of Object.entries(loadsManifest.frames)) tex.add(name, 0, f.x, f.y, f.w, f.h);
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

export class UnitLayer {
  /** Clip selection; set `anim.override` for work clips (build, carry). */
  readonly anim = new Animator();
  private sheets = new Map<string, Sheet>();
  /** The class sheets not uploaded yet (manifest and image): built on first use, or one per idle moment (warm()). */
  private pending = new Map<string, [SheetManifest, HTMLImageElement]>();
  private pool: Phaser.GameObjects.Image[] = [];
  private loadPool: Phaser.GameObjects.Image[] = [];
  private nLoad = 0;
  private ghosts: Phaser.GameObjects.Image[] = [];
  /** Shadow and ring of each raised unit, drawn in its layer slot (gUnder lies under every wall). */
  private rings: Phaser.GameObjects.Graphics[] = [];
  private gUnder: Phaser.GameObjects.Graphics;
  private swap: boolean;
  private outline: boolean;
  private ids = 0;

  constructor(private scene: Phaser.Scene, private iso: IsoMap, sheetImages: Map<string, HTMLImageElement>) {
    this.swap = addSwapPipeline(scene);
    this.outline = addOutlinePipeline(scene);
    for (const [path, m] of Object.entries(manifests)) {
      const cls = path.split('/').at(-2)!, img = sheetImages.get(cls);
      if (img) this.pending.set(cls, [m, img]);
    }
    const loadsImg = sheetImages.get(LOADS_KEY);
    if (loadsImg) buildLoads(scene, loadsImg);
    this.gUnder = scene.add.graphics().setDepth(9);
  }

  /**
   * A class's sheet, uploaded now if it was not yet and no other was this frame (`now`: the frame's time; omitted: build
   * regardless). undefined: no such class, or waiting for a later frame.
   */
  private sheet(cls: string, now?: number): Sheet | undefined {
    let sh = this.sheets.get(cls);
    if (sh) return sh;
    const p = this.pending.get(cls);
    if (!p || (now !== undefined && now === this.builtAt)) return undefined;
    if (now !== undefined) this.builtAt = now;
    this.pending.delete(cls);
    this.sheets.set(cls, (sh = buildSheet(this.scene, cls, p[0], p[1])));
    return sh;
  }

  /** The frame time a sheet was last built at (one a frame: a soldier's is up to ~0.1 s of texture upload). */
  private builtAt = -1;

  /**
   * The class sheets are uploaded on first use, at most one a frame (they held up the first frame by most of a second
   * when all were made at load); the small ones (mobs, townsfolk) also in the browser's idle time once the view is up.
   */
  warm(): void {
    const ric = (globalThis as { requestIdleCallback?: (f: (d: { timeRemaining(): number }) => void) => number }).requestIdleCallback;
    if (!ric) return;
    const small = [...this.pending].filter(([, [, img]]) => img.width * img.height < 1.2e6).map(([cls]) => cls);
    const next = (d: { timeRemaining(): number }) => {
      while (small.length && !this.pending.has(small[0])) small.shift();
      if (!small.length || !this.scene.sys.isActive()) return;
      if (d.timeRemaining() >= 10) this.sheet(small.shift()!);
      ric(next);
    };
    ric(next);
  }

  /**
   * Units up on a wall-walk, tower, stair or ladder (./build/buildingLayer.ts lift): where they are drawn instead of the
   * ground, and their depth between the layers of the tile they stand on. null: on the ground.
   */
  lift: ((d: { x: number; y: number }) => Lift | null) | null = null;
  /**
   * M7d boss feel (./bossFx.ts poseOf): a unit's squash and stretch (scale over its sheet's), a white hit flash, and its
   * frame held through a hit-stop. undefined: as drawn.
   */
  pose: ((id: number, now: number) => { sx: number; sy: number; flash: boolean; hold: boolean } | undefined) | null = null;
  private held = new Map<number, readonly [string, string]>();
  /** Units on the ground: the least depth to draw over the wall faces they stand in front of (./build/buildingLayer.ts). */
  ground: ((d: { x: number; y: number }) => number) | null = null;
  /** Units whose drawn frame is kept in `drawnAs` (the guardians: their mouths and silhouettes for ./bossFx.ts). */
  watch: ReadonlySet<number> = new Set();
  readonly drawnAs = new Map<number, DrawnAs>();
  /** A unit drawn with an outline over everything in this colour (the man-sized guardians: the King, a queen), or undefined. */
  mark: ((id: number) => number | undefined) | null = null;

  /** Per unit: its drawn lift eased towards this frame's (offset from its sim point, px), so steps never snap. */
  private eased = new Map<number, { ox: number; oy: number; px: number; z: number }>();
  private settled = 0;

  /**
   * Ease every unit's lift (call once a frame before drawing): a man walking a stair or a ladder rises with his sim
   * position, and jostling at a stair foot or a step from a ladder onto the walk glides over ~60 ms instead of jumping.
   */
  settle(units: readonly DrawUnit[], now: number): void {
    const k = this.settled ? 1 - Math.exp(-Math.min(200, now - this.settled) / 60) : 1;
    this.settled = now;
    const seen = new Set<number>();
    for (const d of units) {
      const id = d.u.id, l = this.lift?.(d) ?? null, e = this.eased.get(id);
      seen.add(id);
      if (!l && (!e || e.px < 0.5)) { this.eased.delete(id); continue; }
      const t = l ? { ox: l.x - d.x, oy: l.y - d.y, px: l.px, z: l.z } : { ox: 0, oy: 0, px: 0, z: e!.z };
      if (!e || Math.abs(t.px - e.px) > 120) { this.eased.set(id, t); continue; }
      e.ox += (t.ox - e.ox) * k; e.oy += (t.oy - e.oy) * k; e.px += (t.px - e.px) * k; e.z = t.z;
    }
    for (const id of this.eased.keys()) if (!seen.has(id)) this.eased.delete(id);
  }

  /** A unit's lift as drawn: eased (settle()) for units, this frame's for other points. */
  liftOf(d: { x: number; y: number; u?: { id: number } }): Lift | null {
    const l = this.lift?.(d) ?? null, e = d.u && this.eased.get(d.u.id);
    if (!e) return l;
    return { ...(l ?? {}), x: d.x + e.ox, y: d.y + e.oy, z: e.z, px: e.px };
  }

  /** World px of a unit's feet, at its eased level (raised on a wall-walk, stair or ladder). */
  feet(d: { x: number; y: number; u?: { id: number } }): { x: number; y: number } {
    const l = this.liftOf(d);
    if (l) return { x: this.iso.sx(l.x, l.y), y: this.iso.sy(l.x, l.y, l.z) - l.px };
    return { x: this.iso.sx(d.x, d.y), y: this.iso.sy(d.x, d.y, this.iso.zDraw(d.x, d.y)) };
  }

  /** `occluded`: ids of units hidden behind map objects (drawn again as a silhouette over them). */
  draw(units: DrawUnit[], view: { x: number; y: number; right: number; bottom: number }, zoom: number, selected: Set<number>, at: AnimTime, squads: ReadonlyMap<number, SquadSnap>, shots: readonly ShotSnap[], occluded: Set<number> = new Set()): void {
    const under = this.gUnder.clear();
    let used = 0;
    this.drawnAs.clear();
    this.nGhost = 0;
    this.nRing = 0;
    this.nLoad = 0;
    this.nUnder[0] = this.nUnder[1] = 0;
    this.anim.frame(units, squads, at.now);
    if (this.ids !== units.length) { this.ids = units.length; this.anim.prune(new Set(units.map((d) => d.u.id))); }
    used = this.sprites(units, view, zoom, selected, at, shots, under, occluded);
    used = this.drawCorpses(used, at.now);
    for (let i = used; i < this.pool.length; i++) this.pool[i].setVisible(false);
    for (let i = this.nGhost; i < this.ghosts.length; i++) this.ghosts[i].setVisible(false);
    for (let i = this.nLoad; i < this.loadPool.length; i++) this.loadPool[i].setVisible(false);
    for (let i = this.nRing; i < this.rings.length; i++) this.rings[i].setVisible(false);
    this.unders.forEach((pool, k) => { for (let i = this.nUnder[k]; i < pool.length; i++) pool[i].setVisible(false); });
  }

  /** M7d: slain guardians the sim no longer holds: their die clip played where they fell, held, then faded. */
  private corpses: { cls: string; x: number; y: number; facing: number; t0: number }[] = [];
  addCorpse(cls: string, x: number, y: number, facing: number, now: number): void {
    if (this.sheet(cls)?.frames.has('die')) this.corpses.push({ cls, x, y, facing, t0: now });
  }
  private drawCorpses(n: number, now: number): number {
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i], sheet = this.sheet(c.cls)!, def = sheet.clips.get('die'), el = now - c.t0;
      if (el > 12000) { this.corpses.splice(i, 1); continue; }
      const fx = Math.cos(c.facing), fy = Math.sin(c.facing), sx = fx - fy, sy = fx + fy;
      const q = sheet.rows[(sx < 0 ? 1 : 0) + (sy < 0 ? 2 : 0)], frames = sheet.frames.get('die')![q.row];
      const [key, frame] = frames[Math.min(frames.length - 1, Math.floor((el / 1000) * (def?.fps ?? 10)))];
      const f = this.feet({ x: c.x, y: c.y });
      let img = this.pool[n];
      if (!img) this.pool.push((img = this.scene.add.image(0, 0, key)));
      n++;
      img.setTexture(key, frame).setOrigin(q.ox, q.oy).setPosition(Math.round(f.x), Math.round(f.y)).setScale(sheet.scale).setVisible(true)
        .setDepth(Math.max(10 + this.depthOf(c.x, c.y) / 4096 + 0.24, this.ground?.(c) || 0)).setTint(0xffffff).setAlpha(el > 10000 ? (12000 - el) / 2000 : 1);
      if (this.swap) img.resetPipeline();
    }
    return n;
  }

  private nGhost = 0;
  private nRing = 0;
  /** Shadows (0) and rings (1) of the men on the ground as pooled images under every wall (gUnder's depth), and how many are shown. */
  private unders: Phaser.GameObjects.Image[][] = [[], []];
  private nUnder = [0, 0];

  /** The next pooled shadow (0) or ring (1) image, `key` centred on world px (x, y). */
  private under(key: string, kind: 0 | 1, x: number, y: number): Phaser.GameObjects.Image {
    const pool = this.unders[kind];
    let im = pool[this.nUnder[kind]];
    if (!im) pool.push((im = this.scene.add.image(0, 0, key).setDepth(9)));
    this.nUnder[kind]++;
    if (im.texture.key !== key) im.setTexture(key);
    return im.setPosition(x, y).setVisible(true);
  }

  /** A white ring texture (30 x 14 world px, `lw` wide) as the Graphics ring drew it, made on first use; and the shadow's. */
  private ringTex(lw: number): string {
    const key = `war-ring-${lw}`;
    if (this.scene.textures.exists(key)) return key;
    const m = Math.ceil(lw / 2) + 1, t = this.scene.textures.createCanvas(key, 30 + 2 * m, 14 + 2 * m)!, c = t.context;
    c.strokeStyle = '#fff'; c.lineWidth = lw;
    c.beginPath(); c.ellipse(15 + m, 7 + m, 15, 7, 0, 0, Math.PI * 2); c.stroke();
    t.refresh();
    if (!this.scene.textures.exists('war-shadow')) {
      const sh = this.scene.textures.createCanvas('war-shadow', 28, 14)!;
      sh.context.fillStyle = '#fff';
      sh.context.beginPath(); sh.context.ellipse(14, 7, 13, 6, 0, 0, Math.PI * 2); sh.context.fill();
      sh.refresh();
    }
    return key;
  }
  /** Depth key of a tile point (x + y; the scene sorts past massifs with ./massifs.ts). */
  depthOf: (x: number, y: number) => number = (x, y) => x + y;

  private sprites(units: DrawUnit[], view: { x: number; y: number; right: number; bottom: number }, zoom: number, selected: Set<number>, at: AnimTime, shots: readonly ShotSnap[], g: Phaser.GameObjects.Graphics, occluded: Set<number>): number {
    const iso = this.iso, padX = 420, padTop = 720, padBot = 60; // M7d: a guardian sprite is up to 2.7x a man
    let n = 0;
    for (const d of units) {
      const u = d.u, l = this.liftOf(d);
      if (l?.hide) continue; // inside a tower
      const f = this.feet(d);
      if (f.x < view.x - padX || f.x > view.right + padX || f.y < view.y - padBot || f.y > view.bottom + padTop) continue;
      // a class whose sheet waits for a later frame is not drawn this one (an unknown class draws as militia)
      const sheet = this.sheet(u.cls, at.now) ?? (this.pending.has(u.cls) ? undefined : this.sheet(FALLBACK_CLASS, at.now));
      if (!sheet) continue;
      // facing, projected: a tile-space direction (dx, dy) runs (dx - dy, (dx + dy) / 2) on screen
      const facing = l?.facing ?? d.facing, fx = Math.cos(facing), fy = Math.sin(facing), sx = fx - fy, sy = fx + fy;
      const qi = (sx < 0 ? 1 : 0) + (sy < 0 ? 2 : 0), q = sheet.rows[qi];
      const p = this.anim.pick(d, sheet.clips, at, units, shots);
      if (this.watch.has(u.id)) this.drawnAs.set(u.id, { clip: p.clip, frame: p.frame, row: QUADRANT[qi], x: f.x, y: f.y, ox: q.ox, oy: q.oy, scale: sheet.scale, fw: sheet.fw, fh: sheet.fh });
      let [key, frame] = sheet.frames.get(p.clip)![q.row][p.frame];
      const po = this.pose?.(u.id, at.now);
      if (po?.hold && this.held.has(u.id)) [key, frame] = this.held.get(u.id)!;
      else if (po) this.held.set(u.id, [key, frame]);
      else this.held.delete(u.id);
      const team = TEAM_COLOR[d.team] ?? 0xcccccc;
      const hidden = u.state !== 'dead' && iso.hidden(f.x, f.y - BODY, d.x + d.y, l ? l.z + l.px / LH : iso.zAt(d.x, d.y));
      const depth = l?.depth ?? Math.max(10 + this.depthOf(d.x, d.y) / 4096 + (u.state === 'dead' ? 0 : 0.25), (u.state === 'dead' ? 0 : this.ground?.(d)) || 0);
      if (!hidden && u.state !== 'dead') {
        // a raised man's shadow and ring go in his own layer slot, just under him (over the walk floor, under the parapets)
        let r = g;
        if (l?.depth !== undefined) {
          r = this.rings[this.nRing] ?? this.rings[this.rings.push(this.scene.add.graphics()) - 1];
          this.nRing++;
          r.clear().setDepth(l.depth - 1e-7).setVisible(true);
        }
        const k = sheet.scale; // a guardian's shadow and ring at its size
        const sel = selected.has(u.squad), w = Math.max(1.5, 1.5 / zoom); // a ring at least 1.5 screen px wide
        if (r === g && k === 1) { // a man on the ground: pooled images, batched (a Graphics ellipse is re-triangulated every frame)
          if (!l?.climb) this.under('war-shadow', 0, f.x, f.y).setTint(0x000000).setAlpha(0.28);
          this.under(this.ringTex(sel ? w + 0.5 : w), 1, f.x, f.y).setTint(sel ? 0xffffff : team).setAlpha(sel ? 1 : 0.85);
        } else {
          if (!l?.climb) r.fillStyle(0x000000, 0.28).fillEllipse(f.x, f.y, 26 * k, 12 * k); // no shadow in mid-air on a ladder
          r.lineStyle(sel ? w + 0.5 : w, sel ? 0xffffff : team, sel ? 1 : 0.85).strokeEllipse(f.x, f.y, 30 * k, 14 * k);
        }
      }
      let img = this.pool[n];
      if (!img) this.pool.push((img = this.scene.add.image(0, 0, key)));
      n++;
      img.setTexture(key, frame).setOrigin(q.ox, q.oy).setPosition(Math.round(f.x), Math.round(f.y)).setScale(sheet.scale * (po?.sx ?? 1), sheet.scale * (po?.sy ?? 1)).setVisible(true);
      img.setDepth(depth);
      if (this.swap && d.team === 0) img.setPipeline(TEAM_SWAP);
      else if (this.swap) img.resetPipeline();
      img.setTint(TEAM_TINT[d.team] ?? 0xffffff).setAlpha(1);
      if (po?.flash) img.setTintFill(0xfff4e0);
      // hidden behind higher ground (the sprite would draw over the baked terrain: not drawn) or behind a wall or object
      // (drawn under it): the player's own men (and the selected) get a thin team-coloured outline over everything, no
      // fill; a hidden foe is simply hidden
      if (hidden) img.setVisible(false);
      else this.load(d, sheet, q.row, p.clip, p.frame, img);
      const mk = u.state !== 'dead' ? this.mark?.(u.id) : undefined;
      if (mk !== undefined || ((hidden || occluded.has(u.id)) && (d.team === 0 || selected.has(u.squad)))) {
        let gh = this.ghosts[this.nGhost];
        if (!gh) {
          this.ghosts.push((gh = this.scene.add.image(0, 0, key).setDepth(10.8)));
          if (this.outline) gh.setPipeline(OUTLINE);
        }
        this.nGhost++;
        gh.setTexture(key, frame).setOrigin(q.ox, q.oy).setPosition(img.x, img.y).setScale(sheet.scale).setVisible(true);
        if (mk !== undefined) gh.setScale(sheet.scale * (po?.sx ?? 1), sheet.scale * (po?.sy ?? 1));
        if (this.outline) gh.setTint(mk ?? team).setAlpha(mk !== undefined ? (hidden || occluded.has(u.id) ? 1 : 0.9) : 0.55);
        else gh.setTintFill(mk ?? team).setAlpha(0.25); // no shader: a faint silhouette
      }
    }
    return n;
  }

  /** The load a walking carrier holds, on his frame's anchor (shoulder: over him; chest: under him when his back is to us). */
  private load(d: DrawUnit, sheet: Sheet, row: number, clip: string, frame: number, body: Phaser.GameObjects.Image): void {
    const name = loadOf(d.u), L = sheet.loads;
    if (!name || !L || clip !== L.clip || !this.scene.textures.exists(LOADS_KEY)) return;
    const f = loadsManifest.frames[name as keyof typeof loadsManifest.frames], rowName = sheet.rowNames[row];
    const at = f && (f.at === 'shoulder' ? L.shoulder : L.chest)[rowName]?.[frame];
    if (!at) return;
    let im = this.loadPool[this.nLoad];
    if (!im) this.loadPool.push((im = this.scene.add.image(0, 0, LOADS_KEY, name)));
    this.nLoad++;
    const behind = f.at === 'chest' && rowName.startsWith('north');
    im.setTexture(LOADS_KEY, name).setOrigin(f.ox / f.w, f.oy / f.h).setPosition(body.x + at[0], body.y + at[1]).setVisible(true);
    im.setDepth(body.depth + (behind ? -1e-6 : 1e-6)).setTint(body.tintTopLeft);
  }
}

