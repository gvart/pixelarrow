/**
 * The region sandbox: greybox terrain chunks (culled to the camera), 10 Hz sim snapshots drawn
 * interpolated as team-coloured markers, RTS camera and squad controls.
 *
 *   drag / middle-drag / space+drag pan, WASD/arrows, screen-edge pan; wheel zooms to the cursor
 *   left click / box: select own squads (shift adds); right click: move, or attack an enemy squad
 *   H hold; 1-4 formation line / column / wedge / loose
 */
import Phaser from 'phaser';
import type { Order, RegionData, SquadId } from '../types';
import { SimClient, type DrawUnit } from './simClient';
import { bakeChunk, bakeOverlay, CHUNK, TILE } from './terrain';

export const TEAM_COLOR = [0x4aa3ff, 0xe0503c, 0xe8c040, 0xb070e0];
const SHAPES = ['line', 'column', 'wedge', 'loose'] as const;
const RANGED = /archer|sling|javelin/;
/** Pixel-clean zoom ladder (as regionMapView.zoomStep): 1/n below 1, whole numbers above. */
const LADDER = [1 / 8, 1 / 6, 1 / 5, 1 / 4, 1 / 3, 1 / 2, 1, 2, 3, 4];

export type Overlay = 'height' | 'cost' | 'grid' | 'zones';

export class SandboxScene extends Phaser.Scene {
  region!: RegionData;
  sim!: SimClient;
  selected = new Set<SquadId>();
  /** Set by the dev panel: the next left click spawns this squad there. */
  placing: { team: number; cls: string; count: number } | null = null;
  pointerTile = { x: 0, y: 0 };
  private moved = false; // no edge pan before the first real pointer move
  private filterZoom = 0;
  drawn: DrawUnit[] = [];
  private chunks: Phaser.GameObjects.Image[] = [];
  private overlays = new Map<Overlay, Phaser.GameObjects.GameObject & { setVisible(v: boolean): unknown; visible: boolean }>();
  private gUnits!: Phaser.GameObjects.Graphics;
  private gUi!: Phaser.GameObjects.Graphics;
  private markers: { x: number; y: number; t: number; c: number }[] = [];
  private box: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private down: { x: number; y: number; sx: number; sy: number; pan: boolean } | null = null;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  constructor() {
    super('Sandbox');
  }

  init(data: { region: RegionData }): void {
    this.region = data.region;
  }

  create(): void {
    const r = this.region, W = r.w * TILE, H = r.h * TILE;
    for (let cy = 0; cy * CHUNK < r.h; cy++) {
      for (let cx = 0; cx * CHUNK < r.w; cx++) {
        const key = `chunk-${cx}-${cy}`;
        this.textures.addCanvas(key, bakeChunk(r, cx, cy));
        this.chunks.push(this.add.image(cx * CHUNK * TILE, cy * CHUNK * TILE, key).setOrigin(0));
      }
    }
    for (const k of ['height', 'cost'] as const) {
      const tex = this.textures.addCanvas(`ov-${k}`, bakeOverlay(r, k))!;
      tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
      this.overlays.set(k, this.add.image(0, 0, `ov-${k}`).setOrigin(0).setScale(TILE).setAlpha(0.55).setVisible(false));
    }
    const grid = this.make.graphics({}, false).lineStyle(1, 0x000000, 0.25).strokeRect(0, 0, TILE, TILE);
    grid.generateTexture('grid', TILE, TILE);
    grid.destroy();
    this.overlays.set('grid', this.add.tileSprite(0, 0, W, H, 'grid').setOrigin(0).setVisible(false));
    const zones = this.add.graphics();
    zones.fillStyle(0xffffff, 0.1).lineStyle(2, 0xffffff, 0.6);
    for (const z of r.noBuild) zones.fillRect(z.x * TILE, z.y * TILE, z.w * TILE, z.h * TILE).strokeRect(z.x * TILE, z.y * TILE, z.w * TILE, z.h * TILE);
    zones.fillStyle(0xffe070, 0.25).lineStyle(2, 0xffe070, 0.9);
    for (const e of r.entries) zones.fillRect(e.x * TILE, e.y * TILE, e.w * TILE, e.h * TILE).strokeRect(e.x * TILE, e.y * TILE, e.w * TILE, e.h * TILE);
    this.overlays.set('zones', zones);
    this.gUnits = this.add.graphics().setDepth(10);
    this.gUi = this.add.graphics().setDepth(11);

    const cam = this.cameras.main;
    cam.setBackgroundColor('#1b1e22').setRoundPixels(true);
    cam.setZoom(this.fitZoom()).centerOn(W / 2, H / 2);

    this.sim = new SimClient(r);
    this.input.mouse!.disableContextMenu();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'h' || e.key === 'H') this.orderAll((squad) => ({ kind: 'hold', squad }));
      const n = Number(e.key);
      if (n >= 1 && n <= 4) this.orderAll((squad) => ({ kind: 'formation', squad, shape: SHAPES[n - 1] }));
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => this.zoomAt(p.x, p.y, dy > 0 ? -1 : 1));
  }

  setOverlay(k: Overlay, on: boolean): void {
    this.overlays.get(k)?.setVisible(on);
  }

  private fitZoom(): number {
    const cam = this.cameras.main, fit = Math.min(cam.width / (this.region.w * TILE), cam.height / (this.region.h * TILE));
    return [...LADDER].reverse().find((z) => z <= fit) ?? LADDER[0];
  }

  zoomAt(px: number, py: number, dir: 1 | -1): void {
    const cam = this.cameras.main, z = cam.zoom;
    const nz = dir > 0 ? LADDER.find((v) => v > z + 1e-3) ?? z : [...LADDER].reverse().find((v) => v < z - 1e-3 && v >= this.fitZoom() / 2) ?? z;
    if (nz === z) return;
    const w = cam.width / 2, h = cam.height / 2;
    const wx = cam.scrollX + w + (px - w) / z, wy = cam.scrollY + h + (py - h) / z;
    cam.setZoom(nz);
    cam.setScroll(wx - w - (px - w) / nz, wy - h - (py - h) / nz);
  }

  private world(p: Phaser.Input.Pointer): { x: number; y: number } {
    const v = this.cameras.main.getWorldPoint(p.x, p.y);
    return { x: v.x / TILE, y: v.y / TILE };
  }

  /** The nearest live unit to a tile point within reach, optionally only of / not of team 0. */
  private pick(x: number, y: number, own: boolean): DrawUnit | null {
    let best: DrawUnit | null = null, bd = Math.max(0.8, 6 / TILE / this.cameras.main.zoom);
    for (const d of this.drawn) {
      if (d.u.state === 'dead' || (d.team === 0) !== own) continue;
      const dist = Math.hypot(d.x - x, d.y - y);
      if (dist < bd) { bd = dist; best = d; }
    }
    return best;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    const t = this.world(p);
    if (p.rightButtonDown()) return this.command(t.x, t.y);
    const pan = p.middleButtonDown() || this.keys.SPACE.isDown;
    if (!pan && this.placing) {
      const { team, cls, count } = this.placing;
      this.sim.spawn(team === 0 ? 'you' : 'bot', team, cls, count, t.x, t.y);
      this.placing = null;
      return;
    }
    this.down = { x: p.x, y: p.y, sx: this.cameras.main.scrollX, sy: this.cameras.main.scrollY, pan };
  }

  private onMove(p: Phaser.Input.Pointer): void {
    this.pointerTile = this.world(p);
    this.moved = true;
    if (!this.down || !p.isDown) return;
    const cam = this.cameras.main;
    if (this.down.pan) { cam.setScroll(this.down.sx - (p.x - this.down.x) / cam.zoom, this.down.sy - (p.y - this.down.y) / cam.zoom); return; }
    if (Math.hypot(p.x - this.down.x, p.y - this.down.y) > 5) {
      const a = cam.getWorldPoint(this.down.x, this.down.y), b = cam.getWorldPoint(p.x, p.y);
      this.box = { x0: a.x / TILE, y0: a.y / TILE, x1: b.x / TILE, y1: b.y / TILE };
    }
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (!this.down || this.down.pan) { this.down = null; return; }
    this.down = null;
    const add = this.keys.SHIFT.isDown;
    if (!add) this.selected.clear();
    if (this.box) {
      const { x0, y0, x1, y1 } = this.box;
      for (const d of this.drawn) {
        if (d.team === 0 && d.u.state !== 'dead' && d.x >= Math.min(x0, x1) && d.x <= Math.max(x0, x1) && d.y >= Math.min(y0, y1) && d.y <= Math.max(y0, y1)) this.selected.add(d.u.squad);
      }
      this.box = null;
      return;
    }
    const t = this.world(p), hit = this.pick(t.x, t.y, true);
    if (hit) this.selected.add(hit.u.squad);
  }

  /** Right click: attack the enemy squad under the cursor, else move there (squads side by side). */
  command(x: number, y: number): void {
    if (!this.selected.size) return;
    const foe = this.pick(x, y, false);
    if (foe) {
      this.orderAll((squad) => ({ kind: 'attack', squad, target: foe.u.squad }));
      this.markers.push({ x: foe.x, y: foe.y, t: this.time.now, c: 0xff4040 });
      return;
    }
    const ids = [...this.selected];
    let cx = 0, cy = 0, n = 0;
    for (const d of this.drawn) if (this.selected.has(d.u.squad)) { cx += d.x; cy += d.y; n++; }
    const a = n ? Math.atan2(y - cy / n, x - cx / n) : 0;
    ids.forEach((squad, i) => {
      const off = (i - (ids.length - 1) / 2) * 7;
      this.sim.order({ kind: 'move', squad, x: x - Math.sin(a) * off, y: y + Math.cos(a) * off });
    });
    this.markers.push({ x, y, t: this.time.now, c: 0x80ff80 });
  }

  private orderAll(f: (s: SquadId) => Order): void {
    for (const s of this.selected) this.sim.order(f(s));
  }

  update(_t: number, dt: number): void {
    const cam = this.cameras.main, k = this.keys;
    // keyboard and edge pan
    const sp = (dt * 0.9) / cam.zoom;
    let vx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    let vy = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    const p = this.input.activePointer, m = 12;
    if (this.input.isOver && !p.isDown && this.moved) {
      if (p.x < m) vx = -1; else if (p.x > cam.width - m) vx = 1;
      if (p.y < m) vy = -1; else if (p.y > cam.height - m) vy = 1;
    }
    if (vx || vy) cam.setScroll(cam.scrollX + vx * sp, cam.scrollY + vy * sp);

    // the visible world rect (zoom is about the camera centre); cam.worldView lags a frame
    const vw = cam.width / cam.zoom, vh = cam.height / cam.zoom;
    const view = new Phaser.Geom.Rectangle(cam.scrollX + (cam.width - vw) / 2, cam.scrollY + (cam.height - vh) / 2, vw, vh);
    // crisp tiles (and no seams between chunks) zoomed in, mipmapped zoomed out
    if (cam.zoom !== this.filterZoom) {
      this.filterZoom = cam.zoom;
      const f = cam.zoom >= 1 ? Phaser.Textures.FilterMode.NEAREST : Phaser.Textures.FilterMode.LINEAR;
      for (const c of this.chunks) c.texture.setFilter(f);
    }
    for (const c of this.chunks) c.setVisible(c.x < view.right && c.x + c.width > view.x && c.y < view.bottom && c.y + c.height > view.y);

    for (const s of this.selected) if (this.sim.cur && !this.sim.squads.has(s)) this.selected.delete(s);
    this.drawn = this.sim.units();
    this.drawUnits(view);
    this.drawUi();
  }

  private drawUnits(view: Phaser.Geom.Rectangle): void {
    const g = this.gUnits.clear(), z = this.cameras.main.zoom;
    const r = 5 * Math.max(1, 0.6 / z), bars = z >= 2;
    const pad = r * 2;
    for (const d of this.drawn) {
      const x = d.x * TILE, y = d.y * TILE;
      if (x < view.x - pad || x > view.right + pad || y < view.y - pad || y > view.bottom + pad) continue;
      const u = d.u;
      if (u.state === 'dead') { g.fillStyle(0x2a2a2a, 0.6).fillCircle(x, y, r * 0.6); continue; }
      if (this.selected.has(u.squad)) g.lineStyle(1.5, 0xffffff, 1).strokeCircle(x, y, r + 2.5);
      g.fillStyle(TEAM_COLOR[d.team] ?? 0xcccccc, 1).lineStyle(1, 0x101010, 0.9);
      if (RANGED.test(u.cls)) g.fillRect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7).strokeRect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
      else g.fillCircle(x, y, r).strokeCircle(x, y, r);
      g.lineStyle(Math.max(1.5, r * 0.3), 0x101010, 1).lineBetween(x, y, x + Math.cos(d.facing) * (r + 3), y + Math.sin(d.facing) * (r + 3));
      if (bars) {
        g.fillStyle(0x200000, 0.8).fillRect(x - 6, y - r - 5, 12, 2);
        g.fillStyle(u.hp / u.maxHp > 0.5 ? 0x60e060 : 0xe0a030, 1).fillRect(x - 6, y - r - 5, (12 * u.hp) / u.maxHp, 2);
      }
    }
  }

  private drawUi(): void {
    const g = this.gUi.clear(), z = this.cameras.main.zoom, now = this.time.now;
    this.markers = this.markers.filter((mk) => now - mk.t < 700);
    for (const mk of this.markers) {
      const f = (now - mk.t) / 700;
      g.lineStyle(3 / z, mk.c, 1 - f * 0.7).strokeCircle(mk.x * TILE, mk.y * TILE, (18 * (1 - f) + 4) / z);
    }
    if (this.box) {
      const { x0, y0, x1, y1 } = this.box;
      g.fillStyle(0x80c0ff, 0.15).lineStyle(1 / z, 0x80c0ff, 1);
      g.fillRect(Math.min(x0, x1) * TILE, Math.min(y0, y1) * TILE, Math.abs(x1 - x0) * TILE, Math.abs(y1 - y0) * TILE);
      g.strokeRect(Math.min(x0, x1) * TILE, Math.min(y0, y1) * TILE, Math.abs(x1 - x0) * TILE, Math.abs(y1 - y0) * TILE);
    }
  }
}
