/**
 * The region sandbox in true iso with raised height (W-16) at real scale (W-18: 64 x 32 tiles of
 * 2 m, a 512-tile region is ~33k px wide): greybox terrain baked into 512 px chunks on demand
 * (LRU pools, culled to the camera) at 1x zoomed in and 1/4 at mid zoom, over a 1/8 overview baked
 * in bands that stands alone zoomed out; 10 Hz sim snapshots drawn interpolated as PixelLab
 * soldier sprites with dot and banner LOD (./units.ts); RTS camera and squad controls picking
 * through the height field (./iso.ts).
 *
 *   drag / middle-drag / space+drag pan, WASD/arrows, screen-edge pan; wheel zooms to the cursor
 *   left click / box: select own squads (shift adds); right click: move, or attack an enemy squad
 *   H hold; 1-4 formation line / column / wedge / loose
 */
import Phaser from 'phaser';
import type { Order, RegionData, SquadId } from '../types';
import { SPOTS } from '../regions/test-ridge.spots';
import { SimClient, type DrawUnit } from './simClient';
import { IsoMap } from './iso';
import { CHUNK_PX, OVERVIEW_SCALE, TerrainBaker, type BakeOpts } from './terrain';
import { BODY, SPRITE_ZOOM, UnitLayer, loadSheets } from './units';

const SHAPES = ['line', 'column', 'wedge', 'loose'] as const;
/** Pixel-clean zoom ladder (as regionMapView.zoomStep): 1/n below 1, whole numbers above. */
const LADDER = [1 / 32, 1 / 24, 1 / 16, 1 / 12, 1 / 8, 1 / 6, 1 / 4, 1 / 3, 1 / 2, 1, 2, 3];
/**
 * Chunk levels, finest first: canvas px per world px and the lowest zoom each shows at. Below
 * 1/6 the overview (1/8) stands alone. Each pool keeps 48 canvases (1 MB each): a 1440x900 view
 * at a level's lowest zoom needs ~35.
 */
const LEVELS = [{ scale: 1, zoom: 1 / 2 }, { scale: 1 / 4, zoom: 1 / 6 }] as const;
const POOL = 48;
/** Terrain baking per frame (ms); at least one bake runs. */
const BAKE_MS = 6;
/** World px per overview band (one band bakes per frame until the overview is done). */
const BAND = 256;

export type Overlay = 'height' | 'cost' | 'grid' | 'zones';

interface Chunk { key: string; tex: Phaser.Textures.CanvasTexture; img: Phaser.GameObjects.Image; at: string; ver: number; used: number }
interface View { x: number; y: number; right: number; bottom: number }

export class SandboxScene extends Phaser.Scene {
  region!: RegionData;
  iso!: IsoMap;
  sim!: SimClient;
  selected = new Set<SquadId>();
  /** Set by the dev panel: the next left click spawns this squad there. */
  placing: { team: number; cls: string; count: number } | null = null;
  pointerTile = { x: 0, y: 0 };
  /** The last right-click order, in tiles (for scripts). */
  lastCommand: { kind: 'move' | 'attack'; x: number; y: number } | null = null;
  drawn: DrawUnit[] = [];
  readonly spots = SPOTS;
  /** True once the overview has been baked for the current overlays. */
  overviewReady = false;
  private moved = false; // no edge pan before the first real pointer move
  private filterZoom = 0;
  private frame = 0;
  private baker!: TerrainBaker;
  private opts: BakeOpts = { ov: 'none', grid: false, zones: true };
  private ver = 0; // bumps when opts change: chunks baked earlier are stale
  private chunks: Chunk[][] = LEVELS.map(() => []);
  private overviewTex!: Phaser.Textures.CanvasTexture;
  private band = 0;
  private units!: UnitLayer;
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

  preload(): void {
    loadSheets(this);
  }

  create(): void {
    const r = this.region;
    this.iso = new IsoMap(r);
    this.baker = new TerrainBaker(r, this.iso);
    const { W, H } = this.iso;
    this.overviewTex = this.textures.createCanvas('overview', Math.ceil(W * OVERVIEW_SCALE), Math.ceil(H * OVERVIEW_SCALE))!;
    this.add.image(0, 0, 'overview').setOrigin(0).setScale(1 / OVERVIEW_SCALE);
    this.units = new UnitLayer(this, this.iso);
    this.gUi = this.add.graphics().setDepth(11);

    const cam = this.cameras.main;
    cam.setBackgroundColor('#1b1e22').setRoundPixels(true);
    // open on the ford, soldiers about 29 px tall: units and ground both read
    if (r.id === 'test-ridge') this.focus(SPOTS.ford[0], SPOTS.ford[1], 1 / 2);
    else cam.setZoom(this.fitZoom()).centerOn(W / 2, H / 2);

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
    if (k === 'height' || k === 'cost') this.opts.ov = on ? k : this.opts.ov === k ? 'none' : this.opts.ov;
    else this.opts[k] = on;
    this.ver++;
    this.band = 0;
    this.overviewReady = false;
  }

  /** Bake the next band of the overview; upload it once the last band is done. */
  private bakeOverviewBand(): void {
    const { W, H } = this.iso, y = this.band * BAND;
    this.baker.bake(this.overviewTex.context, 0, y, W, BAND, OVERVIEW_SCALE, this.opts, 0, y * OVERVIEW_SCALE);
    if (++this.band * BAND < H) return;
    this.overviewTex.refresh();
    this.overviewReady = true;
  }

  /** Centre the camera on a tile point (at its level), optionally zooming. */
  focus(x: number, y: number, zoom?: number): void {
    const cam = this.cameras.main;
    if (zoom) cam.setZoom(zoom);
    cam.centerOn(this.iso.sx(x, y), this.iso.sy(x, y, this.iso.zAt(x, y)));
  }

  /** A tile point on its level -> canvas px (for scripts). */
  toScreen(x: number, y: number): { x: number; y: number } {
    const cam = this.cameras.main, w = cam.width / 2, h = cam.height / 2;
    const wx = this.iso.sx(x, y), wy = this.iso.sy(x, y, this.iso.zAt(x, y));
    return { x: (wx - cam.scrollX - w) * cam.zoom + w, y: (wy - cam.scrollY - h) * cam.zoom + h };
  }

  private fitZoom(): number {
    const cam = this.cameras.main, fit = Math.min(cam.width / this.iso.W, cam.height / this.iso.H);
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

  /** Canvas px -> world px (zoom is about the camera centre; getWorldPoint lags a frame after a zoom). */
  private wpx(px: number, py: number): { x: number; y: number } {
    const cam = this.cameras.main, w = cam.width / 2, h = cam.height / 2;
    return { x: cam.scrollX + w + (px - w) / cam.zoom, y: cam.scrollY + h + (py - h) / cam.zoom };
  }

  /** The tile point on the ground under a pointer. */
  private world(p: { x: number; y: number }): { x: number; y: number } {
    const v = this.wpx(p.x, p.y);
    return this.iso.pick(v.x, v.y);
  }

  /** World px of a unit's middle as drawn: half a man above the feet for sprites, the feet for dots and banners. */
  private body(d: { x: number; y: number }): { x: number; y: number } {
    const f = this.units.feet(d);
    return this.cameras.main.zoom >= SPRITE_ZOOM ? { x: f.x, y: f.y - BODY } : f;
  }

  /** The live unit drawn nearest the pointer (screen space, so hills don't skew it), of / not of team 0. */
  private pick(p: { x: number; y: number }, own: boolean): DrawUnit | null {
    const w = this.wpx(p.x, p.y);
    let best: DrawUnit | null = null, bd = Math.max(BODY, 10 / this.cameras.main.zoom);
    for (const d of this.drawn) {
      if (d.u.state === 'dead' || (d.team === 0) !== own) continue;
      const f = this.body(d), dist = Math.hypot(f.x - w.x, f.y - w.y);
      if (dist < bd) { bd = dist; best = d; }
    }
    return best;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (p.rightButtonDown()) return this.command(p);
    const pan = p.middleButtonDown() || this.keys.SPACE.isDown;
    if (!pan && this.placing) {
      const t = this.world(p), { team, cls, count } = this.placing;
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
      const a = this.wpx(this.down.x, this.down.y), b = this.wpx(p.x, p.y);
      this.box = { x0: a.x, y0: a.y, x1: b.x, y1: b.y }; // world px: what you see is what you get on hills
    }
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (!this.down || this.down.pan) { this.down = null; return; }
    this.down = null;
    if (!this.keys.SHIFT.isDown) this.selected.clear();
    if (this.box) {
      const { x0, y0, x1, y1 } = this.box;
      for (const d of this.drawn) {
        if (d.team !== 0 || d.u.state === 'dead') continue;
        const f = this.body(d);
        if (f.x >= Math.min(x0, x1) && f.x <= Math.max(x0, x1) && f.y >= Math.min(y0, y1) && f.y <= Math.max(y0, y1)) this.selected.add(d.u.squad);
      }
      this.box = null;
      return;
    }
    const hit = this.pick(p, true);
    if (hit) this.selected.add(hit.u.squad);
  }

  /** Right click: attack the enemy squad under the cursor, else move to the ground there (squads side by side). */
  command(p: { x: number; y: number }): void {
    if (!this.selected.size) return;
    const foe = this.pick(p, false);
    if (foe) {
      this.orderAll((squad) => ({ kind: 'attack', squad, target: foe.u.squad }));
      this.markers.push({ x: foe.x, y: foe.y, t: this.time.now, c: 0xff4040 });
      this.lastCommand = { kind: 'attack', x: foe.x, y: foe.y };
      return;
    }
    const { x, y } = this.world(p);
    const ids = [...this.selected];
    let cx = 0, cy = 0, n = 0;
    for (const d of this.drawn) if (this.selected.has(d.u.squad)) { cx += d.x; cy += d.y; n++; }
    const a = n ? Math.atan2(y - cy / n, x - cx / n) : 0;
    ids.forEach((squad, i) => {
      const off = (i - (ids.length - 1) / 2) * 7;
      this.sim.order({ kind: 'move', squad, x: x - Math.sin(a) * off, y: y + Math.cos(a) * off });
    });
    this.markers.push({ x, y, t: this.time.now, c: 0x80ff80 });
    this.lastCommand = { kind: 'move', x, y };
  }

  private orderAll(f: (s: SquadId) => Order): void {
    for (const s of this.selected) this.sim.order(f(s));
  }

  update(_t: number, dt: number): void {
    const cam = this.cameras.main, k = this.keys;
    this.frame++;
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
    const a = this.wpx(0, 0), b = this.wpx(cam.width, cam.height);
    const view: View = { x: a.x, y: a.y, right: b.x, bottom: b.y };
    this.updateChunks(view, cam.zoom);

    for (const s of this.selected) if (this.sim.cur && !this.sim.squads.has(s)) this.selected.delete(s);
    this.drawn = this.sim.units();
    this.units.draw(this.drawn, view, cam.zoom, this.selected, this.time.now);
    this.drawUi();
  }

  /**
   * Show baked chunks of the level for this zoom over the view; bake missing / stale ones within
   * the frame's budget (the overview fills in meanwhile), then one overview band if it is not done.
   */
  private updateChunks(view: View, zoom: number): void {
    const t0 = performance.now();
    if (zoom !== this.filterZoom) {
      this.filterZoom = zoom;
      // crisp tiles (and no seams between chunks) zoomed in, smooth zoomed out
      for (const [l, pool] of this.chunks.entries()) for (const c of pool) c.tex.setFilter(this.filterFor(l));
      this.overviewTex.setFilter(zoom >= 1 / OVERVIEW_SCALE ? Phaser.Textures.FilterMode.NEAREST : Phaser.Textures.FilterMode.LINEAR);
    }
    for (const pool of this.chunks) for (const c of pool) c.img.setVisible(false);
    const l = LEVELS.findIndex((v) => zoom >= v.zoom);
    if (l >= 0) {
      const { scale } = LEVELS[l], span = CHUNK_PX / scale, { W, H } = this.iso;
      const cx0 = Math.max(0, Math.floor(view.x / span)), cx1 = Math.min(Math.ceil(W / span) - 1, Math.floor(view.right / span));
      const cy0 = Math.max(0, Math.floor(view.y / span)), cy1 = Math.min(Math.ceil(H / span) - 1, Math.floor(view.bottom / span));
      let baked = 0;
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const at = `${cx},${cy}`;
          let c = this.chunks[l].find((q) => q.at === at);
          if (!c || c.ver !== this.ver) {
            if (baked && performance.now() - t0 > BAKE_MS) continue;
            baked++;
            c ??= this.claimChunk(l, at);
            // 1 canvas px of overlap all round: no seams between neighbours (or the overview showing through)
            const m = 1 / scale;
            this.baker.bake(c.tex.context, cx * span - m, cy * span - m, span + 2 * m, span + 2 * m, scale, this.opts);
            c.tex.refresh();
            c.img.setPosition(cx * span - m, cy * span - m).setScale(1 / scale);
            c.ver = this.ver;
          }
          c.used = this.frame;
          c.img.setVisible(true);
        }
      }
    }
    if (!this.overviewReady) this.bakeOverviewBand();
  }

  private filterFor(level: number): Phaser.Textures.FilterMode {
    return this.filterZoom / LEVELS[level].scale >= 1 ? Phaser.Textures.FilterMode.NEAREST : Phaser.Textures.FilterMode.LINEAR;
  }

  /** A canvas for the chunk at `at` of a level: a new one while the pool has room, else the least recently shown. */
  private claimChunk(level: number, at: string): Chunk {
    const pool = this.chunks[level];
    let c: Chunk | undefined;
    if (pool.length < POOL) {
      const key = `chunk-${level}-${pool.length}`;
      const tex = this.textures.createCanvas(key, CHUNK_PX + 2, CHUNK_PX + 2)!;
      tex.setFilter(this.filterFor(level));
      c = { key, tex, img: this.add.image(0, 0, key).setOrigin(0).setDepth(1), at, ver: -1, used: 0 };
      pool.push(c);
    } else {
      c = pool.reduce((o, q) => (q.used < o.used ? q : o));
      c.at = at;
      c.ver = -1;
    }
    return c;
  }

  private drawUi(): void {
    const g = this.gUi.clear(), z = this.cameras.main.zoom, now = this.time.now;
    this.markers = this.markers.filter((mk) => now - mk.t < 700);
    for (const mk of this.markers) {
      const f = (now - mk.t) / 700, s = (18 * (1 - f) + 4) / z, p = this.units.feet(mk);
      g.lineStyle(3 / z, mk.c, 1 - f * 0.7).strokeEllipse(p.x, p.y, s * 2, s);
    }
    if (this.box) {
      const { x0, y0, x1, y1 } = this.box;
      g.fillStyle(0x80c0ff, 0.15).lineStyle(1 / z, 0x80c0ff, 1);
      g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      g.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    }
  }
}
