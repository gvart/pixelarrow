/**
 * Soldiers on the iso map at real scale (W-18): the shipped PixelLab sheets (src/assets/sheets/,
 * v2: one image, rows are facings) drawn 1:1, a 58 px man on a 64 x 32 tile at zoom 1. A sheet
 * has four facings (the iso diagonals); a unit shows the one nearest its heading on screen and
 * the clip ./anim.ts picks. Sprites sample NEAREST at every zoom: no blur, small motions stay
 * visible at 1/2.
 * Units are depth sorted by x + y (with the map objects, ./objects.ts); behind higher ground they
 * show as a team-coloured silhouette, behind a stone object a silhouette is drawn over it.
 * The sheets wear red; team 0 (blue) draws through TEAM_SWAP, a shader that turns the red cloth blue.
 *
 * LOD by zoom: sprites from SPRITE_ZOOM up, team-coloured dots down to BANNER_ZOOM, below that
 * one banner per squad with its unit count.
 */
import Phaser from 'phaser';
import type { SheetManifest } from '../../art/sheetManifest';
import type { ShotSnap, SquadSnap } from '../types';
import { Animator, type AnimTime, type ClipDef } from './anim';
import type { DrawUnit } from './simClient';
import { LH, type IsoMap } from './iso';
import type { Lift } from './build/buildingLayer';

export const TEAM_COLOR = [0x4aa3ff, 0xe0503c, 0xe8c040, 0xb070e0];
/** A light multiply per team on the sprites (team 0 is also hue-swapped, see TEAM_SWAP). */
const TEAM_TINT = [0xd0e4ff, 0xffd4c8, 0xfff0c0, 0xecd8ff];
export const SPRITE_ZOOM = 1 / 3;
export const BANNER_ZOOM = 1 / 12;
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
  ['../../assets/sheets/militia/*.png', '../../assets/sheets/hoplite/*.png', '../../assets/sheets/celt_sword/*.png', '../../assets/sheets/archer/*.png', '../../assets/sheets/slinger/*.png', '../../assets/sheets/javelineer/*.png'],
  { eager: true, query: '?url', import: 'default' },
);
/** Texture side every GPU takes: a taller sheet is split into pieces of whole bands. */
const MAX_TEX = 4096;
/** Screen quadrant (x right, y down) -> sheet row name. */
const QUADRANT = ['south-east', 'south-west', 'north-east', 'north-west'] as const;

interface Sheet {
  /** Per quadrant: the image row, and the sprite origin (the feet). */
  rows: { row: number; ox: number; oy: number }[];
  clips: Map<string, ClipDef>;
  /** Per clip, per image row, per frame: [texture key, frame name]. */
  frames: Map<string, [string, string][][]>;
}

/** Fetch and decode the class sheets (before the game starts: big ones are split, see buildSheet). */
export async function loadSheetImages(): Promise<Map<string, HTMLImageElement>> {
  const out = new Map<string, HTMLImageElement>();
  await Promise.all(Object.entries(images).map(async ([path, url]) => {
    const im = new Image();
    await new Promise((ok, fail) => { im.onload = ok; im.onerror = () => fail(new Error(`sheet ${url} failed to load`)); im.src = url; });
    out.set(path.split('/').at(-2)!, im);
  }));
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
  return { rows, clips, frames };
}

export class UnitLayer {
  /** Clip selection; set `anim.override` for work clips (build, carry). */
  readonly anim = new Animator();
  private sheets = new Map<string, Sheet>();
  private pool: Phaser.GameObjects.Image[] = [];
  private ghosts: Phaser.GameObjects.Image[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  /** Shadow and ring of each raised unit, drawn in its layer slot (gUnder lies under every wall). */
  private rings: Phaser.GameObjects.Graphics[] = [];
  private gUnder: Phaser.GameObjects.Graphics;
  private gOver: Phaser.GameObjects.Graphics;
  private swap: boolean;
  private outline: boolean;
  private ids = 0;

  constructor(private scene: Phaser.Scene, private iso: IsoMap, sheetImages: Map<string, HTMLImageElement>) {
    this.swap = addSwapPipeline(scene);
    this.outline = addOutlinePipeline(scene);
    for (const [path, m] of Object.entries(manifests)) {
      const cls = path.split('/').at(-2)!, img = sheetImages.get(cls);
      if (img) this.sheets.set(cls, buildSheet(scene, cls, m, img));
    }
    this.gUnder = scene.add.graphics().setDepth(9);
    this.gOver = scene.add.graphics().setDepth(10.9);
  }

  /**
   * Units up on a wall-walk, tower, stair or ladder (./build/buildingLayer.ts lift): where they are drawn instead of the
   * ground, and their depth between the layers of the tile they stand on. null: on the ground.
   */
  lift: ((d: { x: number; y: number }) => Lift | null) | null = null;
  /** Units on the ground: the least depth to draw over the wall faces they stand in front of (./build/buildingLayer.ts). */
  ground: ((d: { x: number; y: number }) => number) | null = null;

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
    const under = this.gUnder.clear(), over = this.gOver.clear();
    let used = 0, labels = 0;
    this.nGhost = 0;
    this.nRing = 0;
    this.anim.frame(units, squads, at.now);
    if (this.ids !== units.length) { this.ids = units.length; this.anim.prune(new Set(units.map((d) => d.u.id))); }
    if (zoom >= SPRITE_ZOOM) used = this.sprites(units, view, zoom, selected, at, shots, under, occluded);
    else if (zoom >= BANNER_ZOOM) this.dots(units, view, zoom, selected, under);
    else labels = this.banners(units, zoom, selected, over);
    for (let i = used; i < this.pool.length; i++) this.pool[i].setVisible(false);
    for (let i = this.nGhost; i < this.ghosts.length; i++) this.ghosts[i].setVisible(false);
    for (let i = this.nRing; i < this.rings.length; i++) this.rings[i].setVisible(false);
    for (let i = labels; i < this.labels.length; i++) this.labels[i].setVisible(false);
  }

  private nGhost = 0;
  private nRing = 0;
  /** Depth key of a tile point (x + y; the scene sorts past massifs with ./massifs.ts). */
  depthOf: (x: number, y: number) => number = (x, y) => x + y;

  private sprites(units: DrawUnit[], view: { x: number; y: number; right: number; bottom: number }, zoom: number, selected: Set<number>, at: AnimTime, shots: readonly ShotSnap[], g: Phaser.GameObjects.Graphics, occluded: Set<number>): number {
    const iso = this.iso, padX = 80, padTop = 120, padBot = 40;
    let n = 0;
    for (const d of units) {
      const u = d.u, l = this.liftOf(d);
      if (l?.hide) continue; // inside a tower
      const f = this.feet(d);
      if (f.x < view.x - padX || f.x > view.right + padX || f.y < view.y - padBot || f.y > view.bottom + padTop) continue;
      const sheet = this.sheets.get(u.cls) ?? this.sheets.get(FALLBACK_CLASS);
      if (!sheet) continue;
      // facing, projected: a tile-space direction (dx, dy) runs (dx - dy, (dx + dy) / 2) on screen
      const facing = l?.facing ?? d.facing, fx = Math.cos(facing), fy = Math.sin(facing), sx = fx - fy, sy = fx + fy;
      const q = sheet.rows[(sx < 0 ? 1 : 0) + (sy < 0 ? 2 : 0)];
      const p = this.anim.pick(d, sheet.clips, at, units, shots);
      const [key, frame] = sheet.frames.get(p.clip)![q.row][p.frame];
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
        if (!l?.climb) r.fillStyle(0x000000, 0.28).fillEllipse(f.x, f.y, 26, 12); // no shadow in mid-air on a ladder
        const sel = selected.has(u.squad), w = Math.max(1.5, 1.5 / zoom); // a ring at least 1.5 screen px wide
        r.lineStyle(sel ? w + 0.5 : w, sel ? 0xffffff : team, sel ? 1 : 0.85).strokeEllipse(f.x, f.y, 30, 14);
      }
      let img = this.pool[n];
      if (!img) this.pool.push((img = this.scene.add.image(0, 0, key)));
      n++;
      img.setTexture(key, frame).setOrigin(q.ox, q.oy).setPosition(Math.round(f.x), Math.round(f.y)).setVisible(true);
      img.setDepth(depth);
      if (this.swap && d.team === 0) img.setPipeline(TEAM_SWAP);
      else if (this.swap) img.resetPipeline();
      img.setTint(TEAM_TINT[d.team] ?? 0xffffff).setAlpha(1);
      // hidden behind higher ground (the sprite would draw over the baked terrain: not drawn) or behind a wall or object
      // (drawn under it): a thin team-coloured outline over everything, no fill
      if (hidden) img.setVisible(false);
      if (hidden || occluded.has(u.id)) {
        let gh = this.ghosts[this.nGhost];
        if (!gh) {
          this.ghosts.push((gh = this.scene.add.image(0, 0, key).setDepth(10.8)));
          if (this.outline) gh.setPipeline(OUTLINE);
        }
        this.nGhost++;
        gh.setTexture(key, frame).setOrigin(q.ox, q.oy).setPosition(img.x, img.y).setVisible(true);
        if (this.outline) gh.setTint(team).setAlpha(0.55);
        else gh.setTintFill(team).setAlpha(0.25); // no shader: a faint silhouette
      }
    }
    return n;
  }

  private dots(units: DrawUnit[], view: { x: number; y: number; right: number; bottom: number }, zoom: number, selected: Set<number>, g: Phaser.GameObjects.Graphics): void {
    const s = 3 / zoom, half = s / 2;
    for (const d of units) {
      const f = this.feet(d);
      if (f.x < view.x || f.x > view.right || f.y < view.y || f.y > view.bottom + 40) continue;
      if (d.u.state === 'dead') { g.fillStyle(0x222222, 0.5).fillRect(f.x - half, f.y - half, s, s); continue; }
      g.fillStyle(selected.has(d.u.squad) ? 0xffffff : (TEAM_COLOR[d.team] ?? 0xcccccc), 1).fillRect(f.x - half, f.y - s, s, s);
    }
  }

  /**
   * One flag per squad at its centre: pole, team-coloured cloth, live unit count. Same-team flags
   * closer than a flag's width on screen merge into one (summed count), so a massed army stays legible.
   */
  private banners(units: DrawUnit[], zoom: number, selected: Set<number>, g: Phaser.GameObjects.Graphics): number {
    const sq = new Map<number, { x: number; y: number; n: number; team: number; sel: boolean }>();
    for (const d of units) {
      if (d.u.state === 'dead') continue;
      const e = sq.get(d.u.squad) ?? { x: 0, y: 0, n: 0, team: d.team, sel: selected.has(d.u.squad) };
      e.x += d.x; e.y += d.y; e.n++;
      sq.set(d.u.squad, e);
    }
    const k = 1 / zoom, flags: { x: number; y: number; n: number; team: number; sel: boolean }[] = [];
    for (const e of sq.values()) {
      const f = this.feet({ x: e.x / e.n, y: e.y / e.n });
      const near = flags.find((o) => o.team === e.team && Math.hypot(o.x - f.x, o.y - f.y) < 26 * k);
      if (near) { near.n += e.n; near.sel ||= e.sel; } else flags.push({ x: f.x, y: f.y, n: e.n, team: e.team, sel: e.sel });
    }
    let n = 0;
    for (const f of flags) {
      const col = TEAM_COLOR[f.team] ?? 0xcccccc, top = f.y - 26 * k;
      g.lineStyle(2 * k, 0x101010, 1).lineBetween(f.x, f.y, f.x, top);
      g.fillStyle(col, 1).fillRect(f.x, top, 30 * k, 14 * k);
      g.lineStyle((f.sel ? 2 : 1) * k, f.sel ? 0xffffff : 0x101010, 1).strokeRect(f.x, top, 30 * k, 14 * k);
      let t = this.labels[n];
      if (!t) this.labels.push((t = this.scene.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '11px', color: '#ffffff', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setDepth(11)));
      n++;
      const s = String(f.n);
      if (t.text !== s) t.setText(s);
      t.setScale(k).setPosition(f.x + 15 * k, top + 7 * k).setVisible(true);
    }
    return n;
  }
}

