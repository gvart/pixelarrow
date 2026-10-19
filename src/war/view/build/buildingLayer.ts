/**
 * Buildings, sites and the build-mode overlays on the iso map (M2b, W-26). Each building is drawn with its ART-B sprite
 * (./buildArt.ts; under construction the stage its labour reached) when there is one, fitted inside its sim footprint
 * (art drawn for a bigger footprint is scaled down and centred, with a dev warning), else a placeholder iso box over its
 * footprint tinted by state: foundation (marked out ground, stakes), scaffold (poles and hatching, risen with progress),
 * done (solid, team band), damaged (dark, cracked), destroyed (rubble). Each one sits at the depth of its footprint's
 * south side, sorted with the units and map objects (10 + v / 4096 + 0.25, as ./units.ts). Gates draw open while a unit
 * of their team is near.
 * Ground overlays (under every object): footprint grids in build mode and on a hovered or selected site, a ring round a
 * selected finished building, the ghost's footprint. Over them: progress bars, the own influence area (a canvas baked per
 * influence version), the placement ghost (the real done sprite, or wall kit pieces, tinted green / red, with the sim's
 * reason) and the hovered resource node.
 */
import Phaser from 'phaser';
import type { BuildingSnap, BuildingType, InfluenceMap, NodeSnap } from '../../types';
import { BUILDINGS } from '../../sim/economy';
import { HH, HW, type IsoMap } from '../iso';
import type { DrawUnit } from '../simClient';
import { TEAM_COLOR } from '../units';
import type { BuildArt, BuildSprite, KitSprite } from './buildArt';

/** Ground overlays: over the terrain chunks (1) and the influence area (2), under objects and units (10+). */
const GROUND = 2.5;
const OK = 0x50e060, BAD = 0xff4040;
/** Placeholder heights in world px (~33 px a metre). */
const HEIGHT: Partial<Record<BuildingType, number>> = {
  camp: 36, storehouse: 52, outpost: 80, fort: 120, barracks: 60, farm: 8, olivePress: 48,
  palisade: 56, stoneWall: 84, woodTower: 120, stoneTower: 150, woodGate: 70, stoneGate: 100,
};
const MAT = { wood: 0x8a6a44, stone: 0xa8a294 };
const GATE_NEAR = 3; // tiles: a gate opens while one of its team stands this near
const view = (o: { x: number; y: number; right: number; bottom: number }, x: number, y: number, m: number) => x > o.x - m && x < o.right + m && y > o.y - m && y < o.bottom + m * 2;

/** Multiply a colour's channels by k. */
const shade = (c: number, k: number) => (Math.min(255, ((c >> 16) & 255) * k) << 16) | (Math.min(255, ((c >> 8) & 255) * k) << 8) | Math.min(255, (c & 255) * k);

type P = { x: number; y: number };

export class BuildingLayer {
  art: BuildArt | null = null;
  /** The HUD's selected building (ground ring when finished, footprint grid while a site), -1 none. */
  selected = -1;
  /** Site under the pointer (footprint grid), -1 none. */
  hovered = -1;
  /** Build mode: every footprint shows its grid. */
  grids = false;
  private gfx: Phaser.GameObjects.Graphics[] = [];
  private imgs: Phaser.GameObjects.Image[] = [];
  private ghostImgs: Phaser.GameObjects.Image[] = [];
  private gBars: Phaser.GameObjects.Graphics;
  private gGhost: Phaser.GameObjects.Graphics;
  private gGround: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private nodeLabel: Phaser.GameObjects.Text;
  private inflImg: Phaser.GameObjects.Image | null = null;
  private inflVer = -1;
  private inflShown = false;
  private warned = new Set<string>();

  constructor(private scene: Phaser.Scene, private iso: IsoMap, private depthOf: (x: number, y: number) => number) {
    this.gBars = scene.add.graphics().setDepth(11.5);
    this.gGhost = scene.add.graphics().setDepth(11.4);
    this.gGround = scene.add.graphics().setDepth(GROUND);
    const style = { fontFamily: 'monospace', fontSize: '12px', color: '#ffffff', stroke: '#000000', strokeThickness: 3 };
    this.label = scene.add.text(0, 0, '', style).setOrigin(0.5, 1).setDepth(12).setVisible(false);
    this.nodeLabel = scene.add.text(0, 0, '', style).setOrigin(0.5, 1).setDepth(12).setVisible(false);
  }

  /** World px of a tile corner point on the ground at level z. */
  private pt(x: number, y: number, z: number): P {
    return { x: this.iso.sx(x, y), y: this.iso.sy(x, y, z) };
  }

  /** Ground level under a footprint: its centre's. */
  private z(b: { x: number; y: number }): number {
    return this.iso.zAt(b.x, b.y);
  }

  /** Buildings and their ground overlays; clears the ghost's ground (draw the ghost after this). */
  draw(buildings: readonly BuildingSnap[], units: readonly DrawUnit[], v: { x: number; y: number; right: number; bottom: number }, zoom: number): void {
    let ng = 0, ni = 0;
    const bars = this.gBars.clear(), ground = this.gGround.clear(), lw = Math.max(1, 1.25 / zoom);
    const walls = this.wallTiles(buildings);
    for (const b of buildings) {
      const c = this.pt(b.x, b.y, this.z(b));
      if (!view(v, c.x, c.y, Math.max(b.w, b.h) * HW + 200)) continue;
      const x1 = b.x + b.w / 2, y1 = b.y + b.h / 2, depth = 10 + this.depthOf(x1 - 0.5, y1 - 0.5) / 4096 + 0.25;
      const axis = b.w >= b.h ? 'x' : 'y', stage = this.art?.stage(b.state, b.progress) ?? b.state;
      const kit = BUILDINGS[b.type].wall === 'segment' ? this.art?.kit(b.type, stage) : undefined;
      const spr = kit ? undefined : this.art?.sprite(b.type, stage, axis);
      if (kit) {
        for (let i = 0; i < b.tiles.length; i += 2) {
          const tx = b.tiles[i], ty = b.tiles[i + 1];
          this.kitPiece(this.img(ni++, kit.key), kit, tx, ty, walls).setDepth(10 + this.depthOf(tx + 0.5, ty + 0.5) / 4096 + 0.25);
        }
      } else if (spr) {
        this.fit(this.img(ni++, spr.key), spr, b.type, b.x, b.y, b.w, b.h, this.z(b)).setDepth(depth);
      } else {
        let g = this.gfx[ng];
        if (!g) this.gfx.push((g = this.scene.add.graphics()));
        ng++;
        g.clear().setVisible(true).setDepth(depth);
        this.placeholder(g, b, units, zoom);
      }
      const site = b.state === 'foundation' || b.state === 'scaffold';
      if (b.id === this.selected && !site) this.ring(ground, b, zoom);
      else if (b.id === this.selected || b.id === this.hovered) this.grid(ground, b.tiles, 0xffffff, 0.9, lw);
      else if (this.grids && b.state !== 'destroyed') this.grid(ground, b.tiles, TEAM_COLOR[b.team] ?? 0xcccccc, 0.45, lw);
      this.bar(bars, b, c, zoom);
    }
    for (let i = ng; i < this.gfx.length; i++) this.gfx[i].setVisible(false);
    for (let i = ni; i < this.imgs.length; i++) this.imgs[i].setVisible(false);
  }

  /**
   * Place a building sprite on a w x h footprint centred on (x, y): art drawn for a bigger footprint is scaled down to
   * fit inside it (a dev warning names the type), smaller art stays 1:1; either way centred on the footprint.
   */
  private fit(img: Phaser.GameObjects.Image, spr: BuildSprite, type: BuildingType, x: number, y: number, w: number, h: number, z: number): Phaser.GameObjects.Image {
    const k = Math.min(1, w / spr.fw, h / spr.fh), tag = `${type}${w}x${h}`;
    if ((spr.fw !== w || spr.fh !== h) && !this.warned.has(tag) && import.meta.env?.DEV) {
      this.warned.add(tag);
      console.warn(`[build art] ${type}: art footprint ${spr.fw}x${spr.fh} != sim ${w}x${h}; drawn at ${k.toFixed(2)}x`);
    }
    const top = this.pt(x - (spr.fw * k) / 2, y - (spr.fh * k) / 2, z);
    return img.setScale(k).setPosition(Math.round(top.x - spr.tileOrigin.x * k), Math.round(top.y - spr.tileOrigin.y * k));
  }

  /** A wall kit piece on tile (tx, ty), its frame by the wall neighbours in `walls`. */
  private kitPiece(img: Phaser.GameObjects.Image, kit: KitSprite, tx: number, ty: number, walls: Set<number>): Phaser.GameObjects.Image {
    const top = this.pt(tx, ty, this.iso.zAt(tx + 0.5, ty + 0.5));
    const mask = (walls.has(key(tx + 1, ty)) ? 1 : 0) | (walls.has(key(tx, ty + 1)) ? 2 : 0) | (walls.has(key(tx - 1, ty)) ? 4 : 0) | (walls.has(key(tx, ty - 1)) ? 8 : 0);
    return img.setFrame(mask).setPosition(Math.round(top.x - kit.tileOrigin.x), Math.round(top.y - kit.tileOrigin.y));
  }

  /** Each footprint tile outlined on the ground (under the art). */
  private grid(g: Phaser.GameObjects.Graphics, tiles: readonly number[], col: number, a: number, lw: number): void {
    g.lineStyle(lw, col, a);
    for (const [x, y] of pairs(tiles)) g.strokePoints(this.corners(x, y, x + 1, y + 1, this.iso.zAt(x + 0.5, y + 0.5), 0), true);
  }

  /** A subtle ellipse on the ground round a finished building's footprint. */
  private ring(g: Phaser.GameObjects.Graphics, b: BuildingSnap, zoom: number): void {
    const c = this.pt(b.x, b.y, this.z(b)), rw = (b.w + b.h) * HW * 0.6;
    g.lineStyle(Math.max(1.5, 2 / zoom), 0xffffff, 0.5).strokeEllipse(c.x, c.y, rw * 2, rw);
    g.lineStyle(Math.max(1, 1 / zoom), TEAM_COLOR[b.team] ?? 0xcccccc, 0.8).strokeEllipse(c.x, c.y, rw * 2 + 8 / zoom, rw + 4 / zoom);
  }

  private img(i: number, texture: string, frame?: number): Phaser.GameObjects.Image {
    let img = this.imgs[i];
    if (!img) this.imgs.push((img = this.scene.add.image(0, 0, texture).setOrigin(0)));
    return img.setTexture(texture, frame).setScale(1).setVisible(true);
  }

  /** Tiles of standing wall pieces per team (the kit's neighbour mask joins to walls, gates and towers). */
  private wallTiles(buildings: readonly BuildingSnap[]): Set<number> {
    const s = new Set<number>();
    for (const b of buildings) if (BUILDINGS[b.type].wall && b.state !== 'destroyed') for (let i = 0; i < b.tiles.length; i += 2) s.add(key(b.tiles[i], b.tiles[i + 1]));
    return s;
  }

  private placeholder(g: Phaser.GameObjects.Graphics, b: BuildingSnap, units: readonly DrawUnit[], zoom: number): void {
    const def = BUILDINGS[b.type], team = TEAM_COLOR[b.team] ?? 0xcccccc, z = this.z(b), lw = Math.max(1, 1 / zoom);
    const col = b.state === 'damaged' ? shade(MAT[def.material], 0.62) : MAT[def.material];
    const H = HEIGHT[b.type] ?? 60;
    // wall segments: one box per tile; others: the footprint rect
    const rects: [number, number, number, number][] = def.wall === 'segment'
      ? pairs(b.tiles).sort((p, q) => p[0] + p[1] - q[0] - q[1]).map(([x, y]) => [x + 0.15, y + 0.15, x + 0.85, y + 0.85])
      : [[b.x - b.w / 2, b.y - b.h / 2, b.x + b.w / 2, b.y + b.h / 2]];
    if (b.state === 'foundation') {
      for (const [x0, y0, x1, y1] of rects) {
        const c = this.corners(x0, y0, x1, y1, z, 0);
        g.fillStyle(0x6b5a40, 0.55).fillPoints(c, true);
        g.lineStyle(lw * 1.5, team, 0.9).strokePoints(c, true);
        for (const p of c) g.lineStyle(lw * 2, 0xd8c8a0, 1).lineBetween(p.x, p.y, p.x, p.y - 10);
      }
      return;
    }
    if (b.state === 'destroyed') {
      for (const [x0, y0, x1, y1] of rects) {
        g.fillStyle(0x3a3530, 0.8).fillPoints(this.corners(x0 + 0.1, y0 + 0.1, x1 - 0.1, y1 - 0.1, z, 0), true);
        const c = this.pt((x0 + x1) / 2, (y0 + y1) / 2, z);
        for (let i = 0; i < 6; i++) g.fillStyle(shade(col, 0.5 + (i % 3) * 0.15), 1).fillRect(c.x - 14 + ((i * 11) % 28), c.y - 4 - ((i * 7) % 8), 6, 4);
      }
      return;
    }
    if (def.wall === 'gate' && b.state !== 'scaffold') return this.gate(g, b, units, col, team, H, z, lw);
    const scaffold = b.state === 'scaffold', h = scaffold ? H * Math.max(0.12, b.progress) : H;
    for (const [x0, y0, x1, y1] of rects) {
      this.box(g, x0, y0, x1, y1, z, h, col, lw);
      if (scaffold) this.scaffold(g, x0, y0, x1, y1, z, H, lw);
      else {
        // team band along the front top edges
        const t = this.corners(x0, y0, x1, y1, z, h);
        g.lineStyle(lw * 2, team, 1).beginPath().moveTo(t[3].x, t[3].y).lineTo(t[2].x, t[2].y).lineTo(t[1].x, t[1].y).strokePath();
        if (b.state === 'damaged') {
          const s = t[2];
          g.lineStyle(lw * 1.5, 0x1a1410, 0.9).beginPath().moveTo(s.x - 8, s.y + 4).lineTo(s.x - 3, s.y + h * 0.35).lineTo(s.x - 9, s.y + h * 0.6).strokePath();
          g.beginPath().moveTo(s.x + 10, s.y + 2).lineTo(s.x + 6, s.y + h * 0.3).strokePath();
        }
      }
    }
  }

  /** N, E, S, W corners of a tile rect at level z, raised h px. */
  private corners(x0: number, y0: number, x1: number, y1: number, z: number, h: number): P[] {
    return [this.pt(x0, y0, z), this.pt(x1, y0, z), this.pt(x1, y1, z), this.pt(x0, y1, z)].map((p) => ({ x: p.x, y: p.y - h }));
  }

  /** A solid iso box: the two front faces and the top. */
  private box(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, z: number, h: number, col: number, lw: number): void {
    const [, e, s, w] = this.corners(x0, y0, x1, y1, z, 0), top = this.corners(x0, y0, x1, y1, z, h);
    const up = (p: P) => ({ x: p.x, y: p.y - h });
    g.fillStyle(shade(col, 0.7), 1).fillPoints([w, s, up(s), up(w)], true);
    g.fillStyle(shade(col, 0.88), 1).fillPoints([s, e, up(e), up(s)], true);
    g.fillStyle(shade(col, 1.12), 1).fillPoints(top, true);
    g.lineStyle(lw, 0x1a1612, 0.8).strokePoints([w, s, e, up(e), top[0], up(w)], true).lineBetween(s.x, s.y, s.x, s.y - h);
  }

  /** Scaffold poles to the full height with diagonal braces on the front faces. */
  private scaffold(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, z: number, H: number, lw: number): void {
    const c = this.corners(x0, y0, x1, y1, z, 0);
    g.lineStyle(lw * 1.5, 0xc8a870, 0.95);
    for (const p of [c[1], c[2], c[3]]) g.lineBetween(p.x, p.y, p.x, p.y - H);
    for (const [a, b] of [[c[3], c[2]], [c[2], c[1]]]) {
      for (let k = 0; k <= 3; k++) g.lineBetween(a.x, a.y - (H * k) / 3, b.x, b.y - (H * k) / 3);
      for (let k = 0; k < 3; k++) {
        g.lineBetween(a.x, a.y - (H * k) / 3, b.x, b.y - (H * (k + 1)) / 3);
      }
    }
  }

  /** A gate: two posts and, closed, a door between them; open while one of its team is near. */
  private gate(g: Phaser.GameObjects.Graphics, b: BuildingSnap, units: readonly DrawUnit[], col: number, team: number, H: number, z: number, lw: number): void {
    const open = units.some((d) => d.team === b.team && d.u.state !== 'dead' && Math.abs(d.x - b.x) < GATE_NEAR && Math.abs(d.y - b.y) < GATE_NEAR);
    const x0 = b.x - b.w / 2, y0 = b.y - b.h / 2, x1 = b.x + b.w / 2, y1 = b.y + b.h / 2, alongX = b.w >= b.h, k = 0.28;
    const post = (f0: number, f1: number) => alongX ? [x0 + (x1 - x0) * f0, y0 + 0.1, x0 + (x1 - x0) * f1, y1 - 0.1] : [x0 + 0.1, y0 + (y1 - y0) * f0, x1 - 0.1, y0 + (y1 - y0) * f1];
    const [a0, a1, a2, a3] = post(0, k), [c0, c1, c2, c3] = post(1 - k, 1);
    // back post first
    this.box(g, a0, a1, a2, a3, z, H, col, lw);
    if (!open) {
      const [d0, d1, d2, d3] = post(k, 1 - k);
      const m = alongX ? [d0, (d1 + d3) / 2 - 0.08, d2, (d1 + d3) / 2 + 0.08] : [(d0 + d2) / 2 - 0.08, d1, (d0 + d2) / 2 + 0.08, d3];
      this.box(g, m[0], m[1], m[2], m[3], z, H * 0.7, shade(MAT.wood, 0.8), lw);
    }
    this.box(g, c0, c1, c2, c3, z, H, col, lw);
    const t = this.corners(c0, c1, c2, c3, z, H);
    g.lineStyle(lw * 2, team, 1).lineBetween(t[3].x, t[3].y, t[1].x, t[1].y);
  }

  /** Progress (green) over materials delivered (amber) while building; hp while damaged. */
  private bar(g: Phaser.GameObjects.Graphics, b: BuildingSnap, c: P, zoom: number): void {
    const building = b.state === 'foundation' || b.state === 'scaffold';
    if (!building && b.state !== 'damaged') return;
    if (building && BUILDINGS[b.type].wall === 'segment' && b.delivered === 0) return; // a wall line of empty bars is noise
    const k = 1 / Math.max(zoom, 1 / 4), w = 44 * k, h = 4 * k, x = c.x - w / 2, y = c.y - (HEIGHT[b.type] ?? 60) - 14 * k;
    g.fillStyle(0x000000, 0.7).fillRect(x - k, y - k, w + 2 * k, (building ? 2 * h + 1 * k : h) + 2 * k);
    if (building) {
      g.fillStyle(0xe0a030, 1).fillRect(x, y, w * b.delivered, h);
      g.fillStyle(0x60d060, 1).fillRect(x, y + h + k, w * b.progress, h);
    } else g.fillStyle(0xd04030, 1).fillRect(x, y, (w * b.hp) / b.maxHp, h);
  }

  /**
   * The placement ghost: each piece's footprint on the ground (green / red; wall gates blue, towers gold), its art (the
   * done sprite; wall segments as kit pieces joined along the plan and the standing walls) over it, semi-transparent and
   * tinted, and a label (reason, cost) above. A piece without art gets a wire box of its type's height. null hides it.
   */
  ghost(pieces: { tiles: readonly number[]; ok: boolean; type?: BuildingType }[] | null, text: string, zoom: number, standing: readonly BuildingSnap[] = []): void {
    const g = this.gGhost.clear();
    let ni = 0;
    if (pieces?.length) {
      const lw = Math.max(1, 1.5 / zoom), walls = this.wallTiles(standing);
      for (const p of pieces) if (p.type && BUILDINGS[p.type].wall) for (const [x, y] of pairs(p.tiles)) walls.add(key(x, y));
      let top = Infinity, cx = 0, n = 0;
      for (const p of pieces) {
        const wall = p.type && BUILDINGS[p.type].wall, col = !p.ok ? BAD : wall === 'gate' ? 0x60b0ff : wall === 'tower' ? 0xffc040 : OK;
        const ts = pairs(p.tiles), xs = ts.map((q) => q[0]), ys = ts.map((q) => q[1]);
        const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs) + 1, y1 = Math.max(...ys) + 1, z = this.iso.zAt((x0 + x1) / 2, (y0 + y1) / 2);
        for (const [x, y] of ts) {
          const c = this.corners(x, y, x + 1, y + 1, this.iso.zAt(x + 0.5, y + 0.5), 0);
          this.gGround.fillStyle(col, 0.3).fillPoints(c, true).lineStyle(lw, col, 0.9).strokePoints(c, true);
          top = Math.min(top, c[0].y);
          cx += c[0].x; n++;
        }
        const tint = p.ok ? 0x90ff90 : 0xff7070;
        const kit = wall === 'segment' && p.type ? this.art?.kit(p.type, 'done') : undefined;
        const spr = !kit && p.type ? this.art?.sprite(p.type, 'done', x1 - x0 >= y1 - y0 ? 'x' : 'y') : undefined;
        if (kit) {
          for (const [x, y] of ts) {
            const img = this.kitPiece(this.ghostImg(ni++, kit.key), kit, x, y, walls);
            img.setDepth(11.3 + (x + y) / 1e6).setTint(tint);
          }
        } else if (spr && p.type) {
          const img = this.fit(this.ghostImg(ni++, spr.key), spr, p.type, (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0, z);
          img.setDepth(11.3 + (x1 + y1) / 1e6).setTint(tint);
          top = Math.min(top, img.y + 8);
        } else if (p.type && !wall) {
          const h = HEIGHT[p.type] ?? 60, b = this.corners(x0, y0, x1, y1, z, 0), u = this.corners(x0, y0, x1, y1, z, h);
          g.lineStyle(lw, col, 0.6).strokePoints(u, true);
          for (const i of [1, 2, 3]) g.lineBetween(b[i].x, b[i].y, u[i].x, u[i].y);
          top = Math.min(top, u[0].y);
        }
      }
      this.label.setText(text).setScale(1 / zoom).setPosition(cx / n, top - 6 / zoom).setVisible(!!text);
    } else this.label.setVisible(false);
    for (let i = ni; i < this.ghostImgs.length; i++) this.ghostImgs[i].setVisible(false);
  }

  private ghostImg(i: number, texture: string): Phaser.GameObjects.Image {
    let img = this.ghostImgs[i];
    if (!img) this.ghostImgs.push((img = this.scene.add.image(0, 0, texture).setOrigin(0).setAlpha(0.65)));
    return img.setTexture(texture).setScale(1).clearTint().setVisible(true);
  }

  /** Ring and amount label on a hovered resource node; null hides them. */
  node(n: NodeSnap | null, zoom: number): void {
    if (!n) { this.nodeLabel.setVisible(false); return; }
    const p = this.pt(n.x, n.y, this.iso.zAt(n.x, n.y)), g = this.gGhost;
    g.lineStyle(Math.max(1.5, 2 / zoom), n.amount >= 1 ? 0xffe070 : 0x808080, 1).strokeEllipse(p.x, p.y, 44, 22);
    this.nodeLabel.setText(`${n.res} ${Math.floor(n.amount)}/${n.max}`).setScale(1 / zoom).setPosition(p.x, p.y - 14 / zoom).setVisible(true);
  }

  /** Show / hide the influence area of `team`, rebaking it when the map's version changed. */
  influence(m: InfluenceMap | null, team: number, show: boolean): void {
    if (this.inflShown !== show) { this.inflShown = show; this.inflImg?.setVisible(show); }
    if (!show || !m || m.version === this.inflVer) return;
    this.inflVer = m.version;
    const { w, mask } = m, bit = 1 << team, iso = this.iso, has = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < m.h && (mask[y * w + x] & bit) !== 0;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const tiles: number[] = [];
    for (let y = 0; y < m.h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x] & bit) {
      tiles.push(x, y);
      const cx = iso.sx(x, y), cy = iso.sy(x, y, iso.zt(x, y));
      x0 = Math.min(x0, cx - HW); x1 = Math.max(x1, cx + HW); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy + 2 * HH);
    }
    this.inflImg?.destroy();
    this.inflImg = null;
    if (this.scene.textures.exists('influence')) this.scene.textures.remove('influence');
    if (!tiles.length) return;
    const s = Math.min(0.5, 4096 / (x1 - x0), 4096 / (y1 - y0));
    const tex = this.scene.textures.createCanvas('influence', Math.ceil((x1 - x0) * s) + 2, Math.ceil((y1 - y0) * s) + 2)!;
    const ctx = tex.context, col = TEAM_COLOR[team] ?? 0xcccccc, rgb = `${(col >> 16) & 255},${(col >> 8) & 255},${col & 255}`;
    ctx.lineWidth = 1.5;
    for (const [x, y] of pairs(tiles)) {
      const px = (iso.sx(x, y) - x0) * s, py = (iso.sy(x, y, iso.zt(x, y)) - y0) * s, hw = HW * s, hh = HH * s;
      const N = [px, py], E = [px + hw, py + hh], S = [px, py + 2 * hh], W = [px - hw, py + hh];
      ctx.fillStyle = `rgba(${rgb},0.18)`;
      ctx.beginPath(); ctx.moveTo(N[0], N[1]); ctx.lineTo(E[0], E[1]); ctx.lineTo(S[0], S[1]); ctx.lineTo(W[0], W[1]); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = `rgba(${rgb},0.95)`;
      const edge = (a: number[], b: number[]) => { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); };
      if (!has(x, y - 1)) edge(N, E);
      if (!has(x + 1, y)) edge(E, S);
      if (!has(x, y + 1)) edge(S, W);
      if (!has(x - 1, y)) edge(W, N);
    }
    tex.refresh();
    this.inflImg = this.scene.add.image(x0, y0, 'influence').setOrigin(0).setScale(1 / s).setDepth(2);
  }

  /** The standing building whose footprint holds tile point (x, y), if any. */
  at(buildings: readonly BuildingSnap[], x: number, y: number): BuildingSnap | undefined {
    const tx = Math.floor(x), ty = Math.floor(y);
    return buildings.find((b) => b.state !== 'destroyed' && pairs(b.tiles).some(([a, c]) => a === tx && c === ty));
  }
}

const key = (x: number, y: number) => y * 65536 + x;

function pairs(t: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < t.length; i += 2) out.push([t[i], t[i + 1]]);
  return out;
}
