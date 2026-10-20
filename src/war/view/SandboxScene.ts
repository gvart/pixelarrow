/**
 * The region sandbox in true iso with raised height (W-16) at real scale (W-18: 64 x 32 tiles of
 * 2 m, a 512-tile region is ~33k px wide): PixelLab terrain (./art.ts; ?art=grey: the greybox of
 * ./terrain.ts) baked into 512 px chunks on demand (LRU pools, culled to the camera) at 1x zoomed
 * in, 1/2 and 1/4 at mid zoom, mountains as massif sprites (./massifs.ts; ?mountains=terrace: stacked levels), over a 1/8 overview baked in bands that stands alone zoomed out; map
 * objects as live sprites sorted with the units down to 1/3 (./objects.ts), baked in below that; 10 Hz sim snapshots drawn interpolated as PixelLab
 * soldier sprites with dot and banner LOD (./units.ts); RTS camera and squad controls picking
 * through the height field (./iso.ts).
 *
 *   drag / middle-drag / space+drag pan, WASD/arrows, screen-edge pan; wheel zooms to the cursor
 *   left click / box: select own squads (shift adds)
 *   E or right click: the context action on the hovered target, named by the label at the cursor; hold either for a
 *   radial menu of every action there (./interact.ts: attack, crew / uncrew, raise / push ladder, ignite, extinguish,
 *   fire arrows, build, gather, move)
 *   H hold; 1-4 formation line / column / wedge / loose
 *   B build mode; click a building: its panel (./build/buildMode.ts)
 *   F2-F7 view modes (./mapModes.ts, the HUD's mode bar), M the full map (./hud/fullMap.ts)
 *   siege (./siege/siegeControls.ts): Y deploy / pack, Q fire arrows; the rest is context (E / radial). Engines, fire, rubble
 *   and siege ladders are drawn by ./siege/siegeLayer.ts
 */
import Phaser from 'phaser';
import type { Order, RegionData, SquadId } from '../types';
import { SPOTS } from '../regions/test-ridge.spots';
import { SimClient, type DrawUnit } from './simClient';
import { ArtBaker, type WarArt } from './art';
import { IsoMap } from './iso';
import { Massifs } from './massifs';
import { LIVE_ZOOM, ObjectLayer } from './objects';
import { CHUNK_PX, OVERVIEW_SCALE, TerrainBaker, type BakeOpts } from './terrain';
import { ShotLayer } from './shots';
import { BODY, SPRITE_ZOOM, UnitLayer } from './units';
import { NeutralLayer } from './neutral';
import { BuildMode } from './build/buildMode';
import { workClip } from './build/work';
import { SiegeArt } from './siege/siegeArt';
import { SiegeControls } from './siege/siegeControls';
import { SiegeLayer } from './siege/siegeLayer';
import { Interact } from './interact';
import { MapData, type Live, type MapMode } from './mapModes';
import { FogLayer } from './fog';

const SHAPES = ['line', 'column', 'wedge', 'loose'] as const;
const CLIMB = ['climb', 'walk'] as const;
const CARRY = ['carry', 'walk'] as const;
/** Torching, beating out a fire, pushing a ladder off: a work swing. */
const TASK = ['build', 'thrust', 'attack'] as const;
/** Pixel-clean zoom ladder (as regionMapView.zoomStep): 1/n below 1, whole numbers above. */
const LADDER = [1 / 32, 1 / 24, 1 / 16, 1 / 12, 1 / 8, 1 / 6, 1 / 4, 1 / 3, 1 / 2, 1, 2, 3];
/**
 * Chunk levels, finest first: canvas px per world px and the lowest zoom each shows at. Below
 * 1/6 the overview (1/8) stands alone. Each pool keeps 48 canvases (1 MB each): a 1440x900 view
 * at a level's lowest zoom needs ~35. Map objects are baked in where they are not live sprites.
 */
const LEVELS = [{ scale: 1, zoom: 1 / 2 }, { scale: 1 / 2, zoom: 1 / 3 }, { scale: 1 / 4, zoom: 1 / 6 }] as const;
/** Bakes at this scale show below LIVE_ZOOM only (the 1/4 level and the overview), so they carry the objects. */
const baked = (scale: number) => scale < LIVE_ZOOM;
const POOL = 48;
/** Terrain baking per frame (ms); at least one bake runs. */
const BAKE_MS = 6;
/** World px per overview band (one band bakes per frame until the overview is done). */
const BAND = 256;


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
  /** Build mode, buildings and the economy controls. */
  build!: BuildMode;
  /** Siege engines, fire, rubble and siege ladders on the map; the siege orders. */
  siegeLayer!: SiegeLayer;
  siege!: SiegeControls;
  /** The context action of E and right click, its label at the cursor. */
  interact!: Interact;
  /** True once the overview has been baked for the current overlays. */
  overviewReady = false;
  private moved = false; // no edge pan before the first real pointer move
  private filterZoom = 0;
  private frame = 0;
  private baker!: TerrainBaker;
  private art: WarArt | null = null;
  private artBaker: ArtBaker | null = null;
  private objects: ObjectLayer | null = null;
  massifs: Massifs | null = null;
  /** The view mode (./mapModes.ts: F2-F7 or the HUD's mode bar), baked over the ground of the chunks and the overview. */
  mode: MapMode = 'normal';
  /** The region's static map layers and the modes' tints (the minimap and the full map paint from it too). */
  map!: MapData;
  /** The full map (M) is open: no keyboard or edge pan under it. */
  mapOpen = false;
  private modeKey = '';
  private opts: BakeOpts = { tint: null, map: null, grid: false, zones: false };
  private ver = 0; // bumps when opts change: chunks baked earlier are stale
  private chunks: Chunk[][] = LEVELS.map(() => []);
  private overviewTex!: Phaser.Textures.CanvasTexture;
  private band = 0;
  private units!: UnitLayer;
  /** Lairs and claim banners (neutral regions). */
  private neutral!: NeutralLayer;
  private shots!: ShotLayer;
  /** Fog of war over team 0's unexplored and explored ground (W-39; the sim client hides what it cannot see). */
  private fog!: FogLayer;
  private fogVer = -1;
  private sheetImages = new Map<string, HTMLImageElement>();
  private gUi!: Phaser.GameObjects.Graphics;
  private markers: { x: number; y: number; t: number; c: number }[] = [];
  private box: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private down: { x: number; y: number; sx: number; sy: number; pan: boolean } | null = null;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  constructor() {
    super('Sandbox');
  }

  init(data: { region: RegionData; art?: WarArt | null; sheets: Map<string, HTMLImageElement> }): void {
    this.region = data.region;
    this.art = data.art ?? null;
    this.sheetImages = data.sheets;
  }

  create(): void {
    const r = this.region;
    // mountains as massif sprites over flat rock (?mountains=terrace: the stacked cliff levels of the visual layer)
    const mask = this.art && new URLSearchParams(location.search).get('mountains') !== 'terrace' ? Massifs.maskOf(r) : null;
    this.iso = new IsoMap(r, mask, mask && Massifs.screeOf(r, mask));
    this.massifs = mask && this.art ? new Massifs(r, mask, this.art.massifs) : null;
    this.baker = new TerrainBaker(r, this.iso);
    this.map = new MapData(r);
    this.opts.map = this.map;
    if (this.art) {
      this.artBaker = new ArtBaker(r, this.iso, this.art, this.massifs);
      this.objects = new ObjectLayer(this, this.iso, r, this.art, this.massifs);
    }
    const { W, H } = this.iso;
    this.overviewTex = this.textures.createCanvas('overview', Math.ceil(W * OVERVIEW_SCALE), Math.ceil(H * OVERVIEW_SCALE))!;
    this.add.image(0, 0, 'overview').setOrigin(0).setScale(1 / OVERVIEW_SCALE);
    this.units = new UnitLayer(this, this.iso, this.sheetImages);
    this.neutral = new NeutralLayer(this, (p) => this.units.feet(p), (x, y) => this.depthAt(x, y));
    if (this.objects) this.units.depthOf = (x, y) => this.objects!.depth(x, y);
    this.shots = new ShotLayer(this, this.iso);
    this.fog = new FogLayer(this, this.iso, r);
    this.units.anim.override = workClip;
    this.gUi = this.add.graphics().setDepth(11);

    const cam = this.cameras.main;
    cam.setBackgroundColor('#1b1e22').setRoundPixels(true);
    // open on the ford, soldiers about 29 px tall: units and ground both read
    if (r.id === 'test-ridge') this.focus(SPOTS.ford[0], SPOTS.ford[1], 1 / 2);
    else cam.setZoom(this.minZoom()).centerOn(W / 2, H / 2);

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
    this.siegeLayer = new SiegeLayer(this, this.iso, (x, y) => this.depthAt(x, y));
    void SiegeArt.load(this).then((a) => (this.siegeLayer.art = a));
    this.build = new BuildMode(this);
    this.siege = new SiegeControls(this);
    this.interact = new Interact(this);
    // wall-walks: units drawn up on walks, stairs and ladders; climbers play climb (else walk); ram crews and ladder
    // bearers on their engine's offsets
    const layer = this.build.layer, sl = this.siegeLayer;
    layer.charOf = (b, kit, l) => sl.charOf(b, kit, l);
    layer.skip = (b) => !!sl.art && (b.siege !== undefined || (b.state === 'destroyed' && !!b.rubble));
    this.units.lift = (d) => sl.lift(d) ?? layer.lift(d);
    this.units.ground = (d) => layer.groundDepth(d);
    this.shots.lift = (x, y) => layer.lift({ x, y })?.px ?? 0;
    this.units.anim.override = (u) => (layer.climbing.has(u.id) ? CLIMB : sl.bearing.has(u.id) ? CARRY : u.task && u.task !== 'crew' ? TASK : workClip(u));
    this.shots.launch = (id) => sl.launch(id);
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => this.zoomAt(p.x, p.y, dy > 0 ? -1 : 1));
  }

  /** Switch the view mode: the chunks and the overview rebake with its tint. */
  setMode(m: MapMode): void {
    if (m === this.mode) return;
    this.mode = m;
    this.neutral.debug = m === 'resources'; // the lairs' aggro, leash and guard rings, drawn live
    this.retint();
  }

  /** Dev: fog of war on / off (drawn and hiding). */
  setFog(on: boolean): void {
    this.sim.setFog(on);
    this.fog.enabled = on;
  }

  /** Dev: the tile grid. */
  setGrid(on: boolean): void {
    this.opts.grid = on;
    this.rebake();
  }

  /** What the live modes read from the sim. */
  live(): Live {
    const c = this.sim?.cur;
    return { influence: this.sim?.influence ?? null, nodes: this.sim?.nodes ?? [], lairs: c?.lairs ?? [], claims: c?.claims ?? [], buildings: c?.buildings ?? [] };
  }

  /** Rebuild the mode's tint; rebake if it changed. */
  private retint(): void {
    const l = this.live(), key = this.mode + '|' + this.map.key(this.mode, l);
    const tint = this.map.tint(this.mode, l);
    this.opts.zones = this.mode === 'ownership';
    if (key === this.modeKey && tint === this.opts.tint) return;
    this.modeKey = key;
    this.opts.tint = tint;
    this.rebake();
  }

  private rebake(): void {
    this.ver++;
    this.band = 0;
    this.overviewReady = false;
  }

  /** Bake the next band of the overview; upload it once the last band is done. */
  private bakeOverviewBand(): void {
    const { W, H } = this.iso, y = this.band * BAND;
    this.bake(this.overviewTex.context, 0, y, W, BAND, OVERVIEW_SCALE, 0, y * OVERVIEW_SCALE);
    if (++this.band * BAND < H) return;
    this.overviewTex.refresh();
    this.overviewReady = true;
  }

  private bake(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, scale: number, cx = 0, cy = 0): void {
    if (this.artBaker) this.artBaker.bake(ctx, x0, y0, w, h, scale, this.opts, cx, cy, baked(scale));
    else this.baker.bake(ctx, x0, y0, w, h, scale, this.opts, cx, cy);
  }

  /** Centre the camera on a tile point (at its level), optionally zooming. */
  focus(x: number, y: number, zoom?: number): void {
    const cam = this.cameras.main;
    if (zoom) cam.setZoom(zoom);
    cam.centerOn(this.iso.sx(x, y), this.iso.sy(x, y, this.iso.zAt(x, y)));
  }

  /** The world px rect the camera shows. */
  viewRect(): View {
    const cam = this.cameras.main, a = this.wpx(0, 0), b = this.wpx(cam.width, cam.height);
    return { x: a.x, y: a.y, right: b.x, bottom: b.y };
  }

  /** The selected squads take order f (HUD buttons). */
  orderSelected(f: (s: SquadId) => Order): void {
    this.orderAll(f);
  }

  /** A tile point on its level -> canvas px (for scripts). */
  toScreen(x: number, y: number): { x: number; y: number } {
    const cam = this.cameras.main, w = cam.width / 2, h = cam.height / 2;
    const wx = this.iso.sx(x, y), wy = this.iso.sy(x, y, this.iso.zAt(x, y));
    return { x: (wx - cam.scrollX - w) * cam.zoom + w, y: (wy - cam.scrollY - h) * cam.zoom + h };
  }

  /** The lowest zoom: the first ladder step at which the region's shorter side still covers the viewport's shorter side (no void round it). */
  minZoom(): number {
    const cam = this.cameras.main, need = Math.min(cam.width, cam.height) / Math.min(this.iso.W, this.iso.H);
    return LADDER.find((z) => z >= need - 1e-6) ?? LADDER[LADDER.length - 1];
  }

  zoomAt(px: number, py: number, dir: 1 | -1): void {
    const cam = this.cameras.main, z = cam.zoom;
    const nz = dir > 0 ? LADDER.find((v) => v > z + 1e-3) ?? z : [...LADDER].reverse().find((v) => v < z - 1e-3 && v >= this.minZoom() - 1e-6) ?? z;
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
  tileAt(p: { x: number; y: number }): { x: number; y: number } {
    return this.world(p);
  }

  private world(p: { x: number; y: number }): { x: number; y: number } {
    const v = this.wpx(p.x, p.y);
    return this.iso.pick(v.x, v.y);
  }

  /**
   * Where a move order under the pointer goes: the top of a walkway, tower platform or stair drawn there (the sim paths
   * up its stairs and ladders), the ground in front of a wall face, else the ground.
   */
  target(p: { x: number; y: number }): { x: number; y: number; px: number; z: number } {
    const v = this.wpx(p.x, p.y), s = this.cameras.main.zoom >= SPRITE_ZOOM ? this.build.layer.surfaceAt(v.x, v.y) : null;
    if (s) return s;
    const g = this.iso.pick(v.x, v.y);
    return { ...g, px: 0, z: this.iso.zDraw(g.x, g.y) };
  }

  /** World px of a unit's middle as drawn: half a man above the feet for sprites, the feet for dots and banners. */
  private body(d: { x: number; y: number }): { x: number; y: number } {
    const f = this.units.feet(d);
    return this.cameras.main.zoom >= SPRITE_ZOOM ? { x: f.x, y: f.y - BODY } : f;
  }

  /** The live unit drawn nearest the pointer (screen space, so hills don't skew it), of / not of team 0. */
  pick(p: { x: number; y: number }, own: boolean): DrawUnit | null {
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
    if (p.rightButtonDown()) return this.build.tool || this.siege.armed ? this.command(p) : this.interact.press(p, 'mouse');
    const pan = p.middleButtonDown() || this.keys.SPACE.isDown;
    if (!pan && this.siege.onDown(this.world(p))) return;
    if (!pan && this.build.onDown(this.world(p), this.keys.SHIFT.isDown)) return;
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
    if (this.build.onUp(this.world(p))) return;
    if (!this.down || this.down.pan) { this.down = null; return; }
    this.down = null;
    const hit = this.box ? null : this.pick(p, true);
    // a click on a building selects it and keeps the squads selected (the site panel assigns from them)
    if (!this.box && !hit && this.build.selectAt(this.world(p))) return;
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
    if (hit) this.selected.add(hit.u.squad);
    if (hit) this.build.selectAt({ x: -1, y: -1 });
  }

  /** Right click: the build tool's, else drop an armed siege button, else the context action (./interact.ts). */
  command(p: { x: number; y: number }): void {
    if (this.build.command()) return;
    if (this.siege.armed) { this.siege.armed = null; this.siege.status = ''; return; }
    this.interact.at(p)?.run();
  }

  /** The selected squads attack the squad of unit foe. */
  attackSquad(foe: DrawUnit): void {
    this.orderAll((squad) => ({ kind: 'attack', squad, target: foe.u.squad }));
    this.markers.push({ x: foe.x, y: foe.y, t: this.time.now, c: 0xff4040 });
    this.lastCommand = { kind: 'attack', x: foe.x, y: foe.y };
  }

  /** The selected squads move to tile point (x, y), side by side. */
  moveTo({ x, y }: { x: number; y: number }): void {
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

  /** A fading ring on the ground at a tile point. */
  mark(x: number, y: number, c: number): void {
    this.markers.push({ x, y, t: this.time.now, c });
  }

  /** Depth key of a tile point (as the units and objects sort). */
  depthAt(x: number, y: number): number {
    return this.objects ? this.objects.depth(x, y) : x + y;
  }

  private orderAll(f: (s: SquadId) => Order): void {
    for (const s of this.selected) this.sim.order(f(s));
  }

  update(_t: number, dt: number): void {
    const cam = this.cameras.main, k = this.keys;
    this.frame++;
    // a resize can leave the zoom below the floor
    if (this.frame % 15 === 0 && cam.zoom < this.minZoom() - 1e-6) cam.setZoom(this.minZoom());
    // keyboard and edge pan
    const sp = (dt * 0.9) / cam.zoom;
    let vx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    let vy = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    const p = this.input.activePointer, m = 12;
    if (this.input.isOver && !p.isDown && this.moved) {
      if (p.x < m) vx = -1; else if (p.x > cam.width - m) vx = 1;
      if (p.y < m) vy = -1; else if (p.y > cam.height - m) vy = 1;
    }
    if (this.mapOpen) vx = vy = 0;
    if (vx || vy) cam.setScroll(cam.scrollX + vx * sp, cam.scrollY + vy * sp);

    // the visible world rect (zoom is about the camera centre); cam.worldView lags a frame
    const a = this.wpx(0, 0), b = this.wpx(cam.width, cam.height);
    const view: View = { x: a.x, y: a.y, right: b.x, bottom: b.y };
    // a live mode follows the sim (influence, nodes, lairs, walls): checked twice a second
    if (this.mode !== 'normal' && this.frame % 30 === 0) this.retint();
    this.updateChunks(view, cam.zoom);
    // the ground under the cursor follows the camera too (pan, zoom), not just pointer moves
    if (this.moved && (vx || vy || this.frame % 4 === 0)) this.pointerTile = this.world(p);

    for (const s of this.selected) if (this.sim.cur && !this.sim.squads.has(s)) this.selected.delete(s);
    const fog = this.sim.fog;
    if (fog && fog.version !== this.fogVer) (this.fogVer = fog.version), this.fog.set(fog);
    this.fog.update(dt);
    this.drawn = this.sim.units();
    // buildings first: this frame's walks, stairs and ladders lift the units
    this.build.update(this.wpx(p.x, p.y), cam.zoom, view);
    const at = this.sim.time(this.time.now), shots = this.sim.cur?.shots ?? [];
    this.siegeLayer.draw(this.sim.cur?.sieges ?? [], this.sim.cur?.buildings ?? [], this.drawn, at, this.sim.cur?.tick ?? 0, view);
    this.units.settle(this.drawn, this.time.now);
    const occluded = this.objects?.draw(view, cam.zoom, this.drawn, (d) => this.units.feet(d), BODY) ?? new Set<number>();
    if (cam.zoom >= SPRITE_ZOOM) this.build.layer.occluded(this.drawn, occluded);
    this.units.draw(this.drawn, view, cam.zoom, this.selected, at, this.sim.squads, shots, occluded);
    const cur = this.sim.cur;
    if (cur?.lairs || cur?.claims) this.neutral.draw(cur.lairs ?? [], cur.claims ?? [], cam.zoom);
    this.shots.update(at.snap, shots);
    this.shots.draw(at, cam.zoom, cam.zoom >= SPRITE_ZOOM);
    this.drawUi();
    this.interact.label(this.moved && this.input.isOver && !this.build.tool && !this.box && !this.siege.armed ? p : null);
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
            this.bake(c.tex.context, cx * span - m, cy * span - m, span + 2 * m, span + 2 * m, scale);
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
    // with squads selected (no build tool), the surface a right click would send them to: its tile, raised to its top
    if (this.selected.size && !this.build.tool && !this.box && this.moved && this.input.isOver && z >= SPRITE_ZOOM) {
      const t = this.target(this.input.activePointer), tx = Math.floor(t.x), ty = Math.floor(t.y);
      const c = [[tx, ty], [tx + 1, ty], [tx + 1, ty + 1], [tx, ty + 1]].map(([x, y]) => ({ x: this.iso.sx(x, y), y: this.iso.sy(x, y, t.z) - t.px }));
      g.fillStyle(0xffffff, 0.12).fillPoints(c, true).lineStyle(Math.max(1, 1.5 / z), t.px ? 0xffe080 : 0xffffff, 0.85).strokePoints(c, true);
    }
    if (this.box) {
      const { x0, y0, x1, y1 } = this.box;
      g.fillStyle(0x80c0ff, 0.15).lineStyle(1 / z, 0x80c0ff, 1);
      g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      g.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    }
  }
}
