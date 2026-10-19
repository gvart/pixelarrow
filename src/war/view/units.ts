/**
 * Soldiers on the iso map at real scale (W-18): the shipped PixelLab sheets (src/assets/sheets/,
 * v2: one image, rows are facings) drawn 1:1, a 58 px man on a 64 x 32 tile at zoom 1. A sheet
 * has four facings (the iso diagonals); a unit shows the one nearest its heading on screen, and
 * plays idle, walk, its class's attack and, once fallen, its death clip held on the last frame.
 * Units are depth sorted by x + y; behind higher ground they show as a team-coloured silhouette.
 *
 * LOD by zoom: sprites from SPRITE_ZOOM up, team-coloured dots down to BANNER_ZOOM, below that
 * one banner per squad with its unit count.
 */
import Phaser from 'phaser';
import { resolveAnim, type SheetAnim, type SheetManifest } from '../../art/sheetManifest';
import type { DrawUnit } from './simClient';
import type { IsoMap } from './iso';

export const TEAM_COLOR = [0x4aa3ff, 0xe0503c, 0xe8c040, 0xb070e0];
/** A light multiply per team on the sprites: the sheets are one army's colours. */
const TEAM_TINT = [0xd0e4ff, 0xffd4c8, 0xfff0c0, 0xecd8ff];
export const SPRITE_ZOOM = 1 / 3;
export const BANNER_ZOOM = 1 / 12;
/** World px from the feet to a man's middle (a sprite is ~58 px tall). */
export const BODY = 28;
const RANGED_ANIMS: Record<string, SheetAnim> = { archer: 'shoot', slinger: 'sling', javelineer: 'throw' };
const FALLBACK_CLASS = 'militia';

const manifests = import.meta.glob<SheetManifest>('../../assets/sheets/*/manifest.json', { eager: true, import: 'default' });
const images = import.meta.glob<string>(
  ['../../assets/sheets/militia/*.png', '../../assets/sheets/hoplite/*.png', '../../assets/sheets/celt_sword/*.png', '../../assets/sheets/archer/*.png', '../../assets/sheets/slinger/*.png', '../../assets/sheets/javelineer/*.png'],
  { eager: true, query: '?url', import: 'default' },
);
const CLIPS = ['idle', 'walk', 'attack', 'die'] as const;
type Clip = (typeof CLIPS)[number];
/** Screen quadrant (x right, y down) -> sheet row name. */
const QUADRANT = ['south-east', 'south-west', 'north-east', 'north-west'] as const;

interface Sheet {
  key: string;
  /** Per quadrant: the image row, and the sprite origin (the feet). */
  rows: { row: number; ox: number; oy: number }[];
  clips: Record<Clip, { n: number; fps: number }>;
}

/** Queue the class sheets on the scene's loader (call from preload). */
export function loadSheets(scene: Phaser.Scene): void {
  for (const [path, url] of Object.entries(images)) scene.load.image(`war-${path.split('/').at(-2)}`, url);
}

function buildSheet(scene: Phaser.Scene, cls: string, m: SheetManifest): Sheet {
  const key = `war-${cls}`, tex = scene.textures.get(key), { w: fw, h: fh } = m.frame, wrap = m.wrap ?? 1e9;
  const has = (a: SheetAnim) => !!m.anims[a];
  const pick: Record<Clip, SheetAnim> = {
    idle: 'idle',
    walk: resolveAnim('walk', has),
    attack: RANGED_ANIMS[cls] && has(RANGED_ANIMS[cls]) ? RANGED_ANIMS[cls] : resolveAnim('attack', has),
    die: resolveAnim('fallFwd', has),
  };
  const rows = QUADRANT.map((name) => {
    const a = m.anchors?.[name] ?? m.anchor;
    return { row: Math.max(0, m.rows.indexOf(name)), ox: a.x / fw, oy: a.y / fh };
  });
  const clips = {} as Sheet['clips'];
  for (const clip of CLIPS) {
    const def = m.anims[pick[clip]]!;
    clips[clip] = { n: def.frames, fps: def.fps };
    for (const { row } of rows) {
      for (let i = 0; i < def.frames; i++) {
        const c = def.col + i, band = Math.floor(c / wrap);
        const name = `${clip}${row}_${i}`;
        if (!tex.has(name)) tex.add(name, 0, (c % wrap) * fw, (band * m.rows.length + row) * fh, fw, fh);
      }
    }
  }
  return { key, rows, clips };
}

export class UnitLayer {
  private sheets = new Map<string, Sheet>();
  private pool: Phaser.GameObjects.Image[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private gUnder: Phaser.GameObjects.Graphics;
  private gOver: Phaser.GameObjects.Graphics;
  private fell = new Map<number, number>(); // unit id -> time it was first seen dead
  private filter = -1;

  constructor(private scene: Phaser.Scene, private iso: IsoMap) {
    for (const [path, m] of Object.entries(manifests)) {
      const cls = path.split('/').at(-2)!;
      if (scene.textures.exists(`war-${cls}`)) this.sheets.set(cls, buildSheet(scene, cls, m));
    }
    this.gUnder = scene.add.graphics().setDepth(9);
    this.gOver = scene.add.graphics().setDepth(10.9);
  }

  /** World px of a unit's feet, at its eased level. */
  feet(d: { x: number; y: number }): { x: number; y: number } {
    return { x: this.iso.sx(d.x, d.y), y: this.iso.sy(d.x, d.y, this.iso.zDraw(d.x, d.y)) };
  }

  draw(units: DrawUnit[], view: { x: number; y: number; right: number; bottom: number }, zoom: number, selected: Set<number>, now: number): void {
    const under = this.gUnder.clear(), over = this.gOver.clear();
    let used = 0, labels = 0;
    if (zoom >= SPRITE_ZOOM) used = this.sprites(units, view, zoom, selected, now, under);
    else if (zoom >= BANNER_ZOOM) this.dots(units, view, zoom, selected, under);
    else labels = this.banners(units, zoom, selected, over);
    for (let i = used; i < this.pool.length; i++) this.pool[i].setVisible(false);
    for (let i = labels; i < this.labels.length; i++) this.labels[i].setVisible(false);
  }

  private sprites(units: DrawUnit[], view: { x: number; y: number; right: number; bottom: number }, zoom: number, selected: Set<number>, now: number, g: Phaser.GameObjects.Graphics): number {
    if (zoom !== this.filter) {
      this.filter = zoom;
      const f = zoom >= 1 ? Phaser.Textures.FilterMode.NEAREST : Phaser.Textures.FilterMode.LINEAR;
      for (const s of this.sheets.values()) this.scene.textures.get(s.key).setFilter(f);
    }
    const iso = this.iso, padX = 80, padTop = 120, padBot = 40;
    let n = 0;
    for (const d of units) {
      const u = d.u, f = this.feet(d);
      if (f.x < view.x - padX || f.x > view.right + padX || f.y < view.y - padBot || f.y > view.bottom + padTop) continue;
      const sheet = this.sheets.get(u.cls) ?? this.sheets.get(FALLBACK_CLASS);
      if (!sheet) continue;
      // facing, projected: a tile-space direction (dx, dy) runs (dx - dy, (dx + dy) / 2) on screen
      const fx = Math.cos(d.facing), fy = Math.sin(d.facing), sx = fx - fy, sy = fx + fy;
      const q = sheet.rows[(sx < 0 ? 1 : 0) + (sy < 0 ? 2 : 0)];
      const clip: Clip = u.state === 'move' ? 'walk' : u.state === 'attack' ? 'attack' : u.state === 'dead' ? 'die' : 'idle';
      const c = sheet.clips[clip];
      let i: number;
      if (clip === 'die') {
        let t0 = this.fell.get(u.id);
        if (t0 === undefined) this.fell.set(u.id, (t0 = now));
        i = Math.min(c.n - 1, Math.floor(((now - t0) * c.fps) / 1000));
      } else i = Math.floor((now * c.fps) / 1000 + u.id * 5) % c.n;
      const team = TEAM_COLOR[d.team] ?? 0xcccccc;
      const hidden = u.state !== 'dead' && iso.hidden(f.x, f.y - BODY, d.x + d.y, iso.zAt(d.x, d.y));
      if (!hidden && u.state !== 'dead') {
        g.fillStyle(0x000000, 0.28).fillEllipse(f.x, f.y, 26, 12);
        const sel = selected.has(u.squad), w = Math.max(1.5, 1.5 / zoom); // a ring at least 1.5 screen px wide
        g.lineStyle(sel ? w + 0.5 : w, sel ? 0xffffff : team, sel ? 1 : 0.85).strokeEllipse(f.x, f.y, 30, 14);
      }
      let img = this.pool[n];
      if (!img) this.pool.push((img = this.scene.add.image(0, 0, sheet.key)));
      n++;
      img.setTexture(sheet.key, `${clip}${q.row}_${i}`).setOrigin(q.ox, q.oy).setPosition(Math.round(f.x), Math.round(f.y)).setVisible(true);
      img.setDepth(10 + (d.x + d.y) / 4096 + (u.state === 'dead' ? 0 : 0.25));
      if (hidden) img.setTintFill(team).setAlpha(0.45);
      else img.setTint(TEAM_TINT[d.team] ?? 0xffffff).setAlpha(1);
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

