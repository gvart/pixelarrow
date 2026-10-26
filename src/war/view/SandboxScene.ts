/**
 * The region sandbox in true iso with raised height (W-16) at real scale (W-18: 64 x 32 tiles of
 * 2 m, a 512-tile region is ~33k px wide): PixelLab terrain (./art.ts; ?art=grey: the greybox of
 * ./terrain.ts) baked into 512 px chunks at 1x on demand (an LRU pool, culled to the camera), mountains as procedural
 * peaks (./peaks.ts; ?mountains=massifs: massif sprites, ?mountains=terrace: stacked levels), over a 1/8 overview baked
 * in bands (shown while chunks bake); the camera stops at MIN_ZOOM 1/2 (W-54: the minimap and the full map give the
 * overview); map objects as live sprites sorted with the units (./objects.ts); 10 Hz sim snapshots drawn interpolated as
 * PixelLab soldier sprites (./units.ts); RTS camera and squad controls picking through the height field (./iso.ts).
 *
 *   drag / middle-drag / space+drag pan, WASD/arrows, screen-edge pan; wheel zooms to the cursor
 *   left click / box: select own men (shift adds); double-click: his class on screen; Ctrl+A all, Esc none;
 *   Ctrl+1-9 / 1-9 control groups (./select.ts, W-53)
 *   E or right click: the context action on the hovered target, named by the label at the cursor; hold either for a
 *   radial menu of every action there (./interact.ts: attack, crew / uncrew, raise / push ladder, ignite, extinguish,
 *   fire arrows, build, gather, move)
 *   H hold; Alt+1-4 formation line / column / wedge / loose
 *   B build mode; click a building: its panel (./build/buildMode.ts)
 *   F2-F7 view modes (./mapModes.ts, the HUD's mode bar), M the full map (./hud/fullMap.ts)
 *   siege (./siege/siegeControls.ts): Y deploy / pack, Q fire arrows; the rest is context (E / radial). Engines, fire, rubble
 *   and siege ladders are drawn by ./siege/siegeLayer.ts
 */
import Phaser from 'phaser';
import type { Order, RegionData, SquadId } from '../types';
import { SPOTS } from '../regions/test-ridge.spots';
import { BUILDINGS } from '../sim/economy';
import { SimClient, type DrawUnit } from './simClient';
import { ArtBaker, type WarArt } from './art';
import { HH, HW, IsoMap, LH } from './iso';
import { Massifs } from './massifs';
import { ObjectLayer } from './objects';
import { CHUNK_PX, OVERVIEW_SCALE, TerrainBaker, type BakeOpts } from './terrain';
import type { BakeClient } from './bakeClient';
import type { BakeJob } from './bakeWorker';
import { WaterGlints } from './water';
import { ShotLayer } from './shots';
import { BODY, SPRITE_ZOOM, UnitLayer } from './units';
import { peakAt } from './peaks';
import { NeutralLayer } from './neutral';
import { BuildMode } from './build/buildMode';
import { workClip } from './build/work';
import { SiegeArt } from './siege/siegeArt';
import { SiegeControls } from './siege/siegeControls';
import { SiegeLayer } from './siege/siegeLayer';
import { Interact } from './interact';
import { TradeArt } from './trade/tradeArt';
import { TradeControls } from './trade/tradeControls';
import { TradeLayer } from './trade/tradeLayer';
import { MapData, type Live, type MapMode } from './mapModes';
import { FogLayer } from './fog';
import { anySoldiers } from './hud/cardCiv';
import { GuardianLayer } from './guardians';
import { Selection } from './select';
import { keys as warKeys } from '../input/keys';
import { myTeam } from './side';

const CLIMB = ['climb', 'walk'] as const;
const CARRY = ['carry', 'walk'] as const;
/** Torching, beating out a fire, pushing a ladder off: a work swing. */
const TASK = ['build', 'thrust', 'attack'] as const;
/** The camera's zoom floor (W-54): never far out (the minimap and the full map, M, give the overview), and far less to draw. */
export const MIN_ZOOM = 1 / 2;
/** Pixel-clean zoom ladder (as regionMapView.zoomStep): 1/2, then whole numbers; from MIN_ZOOM. */
const LADDER = [1 / 2, 1, 2, 3];
/**
 * Chunk canvases kept (1 MB each, LRU): a 1440x900 view at MIN_ZOOM shows ~35, the rest keep the ground just panned
 * over. Chunks are baked at 1x without the map objects (live sprites); the overview carries them.
 */
const POOL = 96;
/** See-through holes in the peaks (./peaks.ts): at most this many (the cursor's, then the selected units'), this many screen px across. */
const HOLES = 4;
const HOLE_PX = 200;
/** Terrain baking per frame on the main thread (ms; at least one bake runs), and uploading the bake worker's bitmaps. */
const BAKE_MS = 6;
/** Bake worker jobs in flight: few, so the next asked are always the ones nearest the view's middle. */
const IN_FLIGHT = 3;
/** World px per overview band (one band bakes per frame until the overview is done), and bands per overview strip texture. */
const BAND = 256;
const STRIP = 8;

/** at: the chunk's key (its column and row, and for one the peaks reach, whether they are cut). */
interface Chunk { key: string; tex: Phaser.Textures.CanvasTexture; img: Phaser.GameObjects.Image; at: string; ver: number; used: number }
/** A chunk's (or the overview band's, or a window's) bake back from the worker, to upload. */
interface Arrived { bmp: ImageBitmap; ms: number; apply: (bmp: ImageBitmap) => void }
interface View { x: number; y: number; right: number; bottom: number }

export class SandboxScene extends Phaser.Scene {
  region!: RegionData;
  iso!: IsoMap;
  sim!: SimClient;
  /** Squads with a selected man, the lead first (kept by `sel`). */
  selected = new Set<SquadId>();
  /** W-53: the selected men and the control groups. */
  sel!: Selection;
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
  /** M6k: carts, piles, chests, packs and safe zones on the map; the trade orders. */
  tradeLayer!: TradeLayer;
  trade!: TradeControls;
  /** True once the overview has been baked for the current overlays. */
  overviewReady = false;
  private moved = false; // no edge pan before the first real pointer move
  private filterZoom = 0;
  private frame = 0;
  private baker!: TerrainBaker;
  private art: WarArt | null = null;
  private artBaker: ArtBaker | null = null;
  /** The bake worker (./bakeClient.ts), null where the scene bakes on the main thread. */
  private painter: BakeClient | null = null;
  /** Its bakes back, uploaded within the frame's budget; the chunk keys (with version) asked and not back yet. */
  private arrived: Arrived[] = [];
  private asked = new Set<string>();
  /** The chunks the peaks reach (their ground differs when cut, V): keyed by cut too, so toggling back finds them baked. */
  private peaky = new Set<string>();
  /** Visible chunks missing or stale last frame (0: the view is fully baked; for the perf scripts). */
  viewPending = -1;
  private objects: ObjectLayer | null = null;
  private glints: WaterGlints | null = null;
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
  private chunks: Chunk[] = [];
  /** The see-through holes' windows: the ground behind the peaks (their stubs), baked round a point and faded at the rim. */
  private windows: { tex: Phaser.Textures.CanvasTexture; img: Phaser.GameObjects.Image; at: string; want: string }[] = [];
  private strips: { tex: Phaser.Textures.CanvasTexture; bands: number; done: number }[] = [];
  /** The class sheets warm up once the view is first baked. */
  private warmed = false;
  private band = 0;
  /** Overview bands asked of the worker, and back. */
  private bandsAsked = 0;
  private bandsDone = 0;
  private units!: UnitLayer;
  /** Lairs and claim banners (neutral regions). */
  private neutral!: NeutralLayer;
  private shots!: ShotLayer;
  /** M7d: landmark guardians (perch, clips, their moves' fx, the Warden's mark). */
  guardians!: GuardianLayer;
  /** Fog of war over the player's team's unexplored and explored ground (W-39; the sim client hides what it cannot see). */
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

  init(data: { region: RegionData; art?: WarArt | null; sheets: Map<string, HTMLImageElement>; baker?: BakeClient | null }): void {
    this.region = data.region;
    this.art = data.art ?? null;
    this.sheetImages = data.sheets;
    this.painter = (this.art && data.baker) || null;
  }

  create(): void {
    const r = this.region;
    // mountains as procedural peaks over flat rock (./peaks.ts; ?mountains=massifs: massif sprites, ?mountains=terrace: the
    // stacked cliff levels of the visual layer)
    const mode = new URLSearchParams(location.search).get('mountains');
    const mask = this.art && mode !== 'terrace' ? Massifs.maskOf(r) : null;
    this.iso = new IsoMap(r, mask, mask && Massifs.screeOf(r, mask), mode !== 'massifs');
    this.massifs = mask && this.art && mode === 'massifs' ? new Massifs(r, mask, this.art.massifs) : null;
    this.baker = new TerrainBaker(r, this.iso);
    this.map = new MapData(r);
    this.opts.map = this.map;
    if (this.art) {
      this.objects = new ObjectLayer(this, this.iso, r, this.art, this.massifs);
      this.glints = new WaterGlints(this, this.iso);
    }
    const { W, H } = this.iso;
    this.peaky = this.peakChunks();
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
    this.keys = this.input.keyboard!.addKeys('SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
    // every key goes through the war's bindings (../input): build mode's keys win while it is on
    warKeys.setContexts(() => (this.build?.active ? ['build', 'region', 'camera', 'global'] : ['region', 'camera', 'global']));
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      const a = warKeys.act(e);
      if (a === 'order.hold') this.orderAll((squad) => ({ kind: 'hold', squad }));
      if (a === 'view.bossCam') this.guardians.bossCam = !this.guardians.bossCam; // M7d: the boss camera on or off
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));
    this.siegeLayer = new SiegeLayer(this, this.iso, (x, y) => this.depthAt(x, y));
    void SiegeArt.load(this).then((a) => (this.siegeLayer.art = a));
    this.tradeLayer = new TradeLayer(this, this.iso, r, (x, y) => this.depthAt(x, y), (d) => this.units.feet(d));
    this.tradeLayer.siegeArt = () => this.siegeLayer.art;
    void TradeArt.load(this).then((a) => (this.tradeLayer.art = a));
    this.trade = new TradeControls(this);
    this.build = new BuildMode(this);
    this.build.layer.nodeBase = (n) => (n.obj !== undefined && r.objects?.[n.obj] ? this.objects?.baseOf(r.objects[n.obj].id) : undefined);
    this.siege = new SiegeControls(this);
    this.interact = new Interact(this);
    this.sel = new Selection(this);
    // wall-walks: units drawn up on walks, stairs and ladders; climbers play climb (else walk); ram crews and ladder
    // bearers on their engine's offsets
    const layer = this.build.layer, sl = this.siegeLayer;
    layer.charOf = (b, kit, l) => sl.charOf(b, kit, l);
    sl.working = layer.working; // M5h: workplace working fx (the siege art holds the fx loops)
    // the siege layer draws wall, gate and tower rubble; M7b: a pre-built ruin of anything else is the building layer's
    layer.skip = (b) => (!!sl.art && (b.siege !== undefined || (b.state === 'destroyed' && !!b.rubble && !(b.ruin && !BUILDINGS[b.type].wall)))) || (b.type === 'chest' && !!this.tradeLayer.art && b.state !== 'destroyed');
    const gd = (this.guardians = new GuardianLayer(this, this.iso, (d) => this.units.feet(d), r.guardians ?? []));
    this.units.pose = (id, now) => gd.fx.poseOf(id, now);
    this.units.watch = gd.watch;
    this.units.mark = (id) => gd.mark(id);
    gd.drawn = (id) => this.units.drawnAs.get(id);
    gd.fx.corpse = (cls, x, y, facing) => this.units.addCorpse(cls, x, y, facing, this.time.now);
    this.units.lift = (d) => gd.lift(d) ?? sl.lift(d) ?? layer.lift(d);
    this.units.ground = (d) => layer.groundDepth(d);
    this.shots.lift = (x, y) => layer.lift({ x, y })?.px ?? 0;
    this.units.anim.override = (u) => gd.clip(u) ?? (layer.climbing.has(u.id) ? CLIMB : sl.bearing.has(u.id) ? CARRY : u.task && u.task !== 'crew' ? TASK : workClip(u));
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
    this.band = this.bandsAsked = this.bandsDone = 0;
    for (const st of this.strips) st.done = 0;
    this.overviewReady = false;
    this.painter?.opts(this.opts);
  }

  /** The bake worker while it works (once it fails the scene bakes on the main thread). */
  private get worker(): BakeClient | null {
    return this.painter && !this.painter.failed ? this.painter : null;
  }

  /** Bake the next band of the overview (with the worker: ask for the next ones); upload it once the last band is done. */
  private bakeOverviewBand(): void {
    const { W, H } = this.iso, n = Math.ceil(H / BAND), wk = this.worker;
    if (!wk) {
      const b = this.band, y = b * BAND, st = this.strip(b);
      this.bake(st.tex.context, 0, y, W, BAND, OVERVIEW_SCALE, 0, (b % STRIP) * BAND * OVERVIEW_SCALE);
      if (++st.done === st.bands) st.tex.refresh();
      if (++this.band < n) return;
      this.overviewReady = true;
      return;
    }
    while (wk.busy < IN_FLIGHT && this.bandsAsked < n) {
      const b = this.bandsAsked++, y = b * BAND, ver = this.ver, cw = Math.ceil(W * OVERVIEW_SCALE), ch = Math.ceil(BAND * OVERVIEW_SCALE);
      this.ask({ x0: 0, y0: y, w: W, h: BAND, scale: OVERVIEW_SCALE, cw, ch, cut: false, objects: true }, (bmp) => {
        if (ver !== this.ver) return;
        const st = this.strip(b), cy = (b % STRIP) * ch;
        st.tex.context.clearRect(0, cy, cw, ch);
        st.tex.context.drawImage(bmp, 0, cy);
        if (++st.done === st.bands) st.tex.refresh();
        if (++this.bandsDone === n) this.overviewReady = true;
      });
    }
  }

  /**
   * The overview strip holding band b: STRIP bands of the overview's canvas each (a 512-tile region's is 36 MB), made
   * when its first band is baked and uploaded once all its bands are in, so no frame uploads the whole.
   */
  private strip(b: number): { tex: Phaser.Textures.CanvasTexture; bands: number; done: number } {
    const k = Math.floor(b / STRIP);
    if (this.strips[k]) return this.strips[k];
    const { W, H } = this.iso, n = Math.ceil(H / BAND), bands = Math.min(STRIP, n - k * STRIP), key = `overview-${k}`;
    const tex = this.textures.createCanvas(key, Math.ceil(W * OVERVIEW_SCALE), bands * BAND * OVERVIEW_SCALE)!;
    this.add.image(0, k * STRIP * BAND, key).setOrigin(0).setScale(1 / OVERVIEW_SCALE).setDepth(-1);
    return (this.strips[k] = { tex, bands, done: 0 });
  }

  /** Bake on the main thread (no worker); the art baker is built on first use. */
  private bake(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, scale: number, cx = 0, cy = 0): void {
    const t0 = performance.now();
    if (this.art) (this.artBaker ??= new ArtBaker(this.region, this.iso, this.art, this.massifs)).bake(ctx, x0, y0, w, h, scale, this.opts, cx, cy, scale === OVERVIEW_SCALE);
    else this.baker.bake(ctx, x0, y0, w, h, scale, this.opts, cx, cy);
    this.stat(String(scale), performance.now() - t0);
  }

  /** Ask the worker for a bake; `apply` uploads it in a later frame (within the budget). */
  private ask(job: Omit<BakeJob, 'id'>, apply: (bmp: ImageBitmap) => void): void {
    this.worker!.bake(job, (bmp, ms) => {
      this.stat(String(job.scale), ms);
      this.arrived.push({ bmp, ms, apply });
    });
  }

  /** Bake times per scale (ms: count, mean, max; in the worker with one), and the worker's bitmaps' uploads, for the perf scripts. */
  private stat(key: string, dt: number): void {
    const st = (this.bakeStats[key] ??= { n: 0, mean: 0, max: 0 });
    st.mean = (st.mean * st.n + dt) / ++st.n;
    st.max = Math.max(st.max, dt);
  }

  /** Per bake scale: count, mean and max ms ('upload': the worker's bitmaps drawn into the chunks, on the main thread). */
  readonly bakeStats: Record<string, { n: number; mean: number; max: number }> = {};

  /** Centre the camera on a tile point (at its level), optionally zooming. */
  focus(x: number, y: number, zoom?: number): void {
    const cam = this.cameras.main;
    if (zoom) cam.setZoom(Math.max(zoom, this.minZoom()));
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

  /** The lowest zoom: MIN_ZOOM, or the first ladder step at which the region's shorter side still covers the viewport's shorter side (no void round it). */
  minZoom(): number {
    const cam = this.cameras.main, need = Math.max(MIN_ZOOM, Math.min(cam.width, cam.height) / Math.min(this.iso.W, this.iso.H));
    return LADDER.find((z) => z >= need - 1e-6) ?? LADDER[LADDER.length - 1];
  }

  zoomAt(px: number, py: number, dir: 1 | -1): void {
    const cam = this.cameras.main, z = cam.zoom;
    const nz = dir > 0 ? LADDER.find((v) => v > z + 1e-3) ?? z : [...LADDER].reverse().find((v) => v < z - 1e-3 && v >= this.minZoom() - 1e-6) ?? z;
    if (nz === z) return;
    if (this.guardians) this.guardians.focus = null; // the player zooms: the boss camera lets go
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

  /** The live unit drawn nearest the pointer (screen space, so hills don't skew it), of / not of the player's team. */
  pick(p: { x: number; y: number }, own: boolean): DrawUnit | null {
    const w = this.wpx(p.x, p.y);
    let best: DrawUnit | null = null, bd = Math.max(BODY, 10 / this.cameras.main.zoom);
    for (const d of this.drawn) {
      if (d.u.state === 'dead' || (d.team === myTeam()) !== own) continue;
      const f = this.body(d), dist = Math.hypot(f.x - w.x, f.y - w.y);
      if (dist < bd) { bd = dist; best = d; }
    }
    return best;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    // Ctrl + right click: the selected fighting squads attack-move to the spot
    if (p.rightButtonDown() && (p.event as MouseEvent | undefined)?.ctrlKey && !this.build.tool && anySoldiers(this, this.siege.own())) {
      const t = this.world(p);
      this.moveTo(t, 'attackMove');
      this.mark(t.x, t.y, 0xff4040);
      return;
    }
    if (p.rightButtonDown()) return this.build.tool || this.siege.armed ? this.command(p) : this.interact.press(p, 'mouse');
    const pan = p.middleButtonDown() || warKeys.held('cam.grab');
    if (!pan && this.siege.onDown(this.world(p))) return;
    if (!pan && this.build.onDown(this.world(p), this.keys.SHIFT.isDown)) return;
    if (!pan && this.placing) {
      const t = this.world(p), { team, cls, count } = this.placing;
      if (this.sim.net) this.sim.devSpawn(team, cls, count, t.x, t.y); // the live region's dev spawn (a join brings the roster)
      else this.sim.spawn(team === myTeam() ? 'you' : 'bot', team, cls, count, t.x, t.y);
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
    // M7d: a click on a guardian has the camera follow it (its name plate up); a click elsewhere lets it go
    if (this.guardians) {
      const gu = this.box || hit ? null : this.guardians.at(this.wpx(p.x, p.y));
      this.guardians.focus = gu;
      if (gu !== null) return;
    }
    // M6k: a click on a cart or loot pile picks it for the holder panel (squads stay selected)
    const h = this.box || hit ? null : this.trade.at(this.world(p));
    this.trade.selected = h && h.kind !== 'chest' && h.kind !== 'store' ? h.ref : null;
    if (this.trade.selected) { this.build.selectAt({ x: -1, y: -1 }); return; }
    // a click on a building selects it and keeps the squads selected (the site panel assigns from them)
    if (!this.box && !hit && this.build.selectAt(this.world(p))) return;
    if (this.box) {
      const { x0, y0, x1, y1 } = this.box, ids: number[] = [];
      for (const d of this.drawn) {
        if (d.team !== myTeam() || d.u.state === 'dead') continue;
        const f = this.body(d);
        if (f.x >= Math.min(x0, x1) && f.x <= Math.max(x0, x1) && f.y >= Math.min(y0, y1) && f.y <= Math.max(y0, y1)) ids.push(d.u.id);
      }
      this.box = null;
      this.sel.set(ids, this.keys.SHIFT.isDown);
      return;
    }
    this.sel.click(hit, this.keys.SHIFT.isDown, this.time.now);
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

  /** The selected men move (or attack-move) to tile point (x, y) as one formation (W-53). */
  moveTo({ x, y }: { x: number; y: number }, kind: 'move' | 'attackMove' = 'move'): void {
    for (const squad of this.siege.own()) this.sim.order({ kind, squad, x, y });
    this.markers.push({ x, y, t: this.time.now, c: kind === 'move' ? 0x80ff80 : 0xffa040 });
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
    for (const s of this.siege.own()) this.sim.order(f(s));
  }

  update(_t: number, dt: number): void {
    const cam = this.cameras.main, k = (id: 'cam.up' | 'cam.down' | 'cam.left' | 'cam.right') => warKeys.held(id);
    this.frame++;
    this.guardians?.fx.unshake(cam); // M7d: last frame's boss shake off before the camera moves
    // a resize can leave the zoom below the floor
    if (this.frame % 15 === 0 && cam.zoom < this.minZoom() - 1e-6) cam.setZoom(this.minZoom());
    // keyboard and edge pan
    const sp = (dt * 0.9) / cam.zoom;
    let vx = (k('cam.right') ? 1 : 0) - (k('cam.left') ? 1 : 0);
    let vy = (k('cam.down') ? 1 : 0) - (k('cam.up') ? 1 : 0);
    const p = this.input.activePointer, m = 12;
    if (this.input.isOver && !p.isDown && this.moved) {
      if (p.x < m) vx = -1; else if (p.x > cam.width - m) vx = 1;
      if (p.y < m) vy = -1; else if (p.y > cam.height - m) vy = 1;
    }
    if (this.mapOpen) vx = vy = 0;
    if (vx || vy) cam.setScroll(cam.scrollX + vx * sp, cam.scrollY + vy * sp);
    // M7d: the boss camera frames a guardian followed or in a set piece (the player panning lets go)
    this.guardians?.camera(cam, dt, this.time.now, this.minZoom(), !!(vx || vy || (this.down?.pan && p.isDown)));

    // the visible world rect (zoom is about the camera centre); cam.worldView lags a frame
    const a = this.wpx(0, 0), b = this.wpx(cam.width, cam.height);
    const view: View = { x: a.x, y: a.y, right: b.x, bottom: b.y };
    // net mode: the server's interest rect (the worker drops it for the local sim)
    if (this.frame % 15 === 0) this.sim.camera([{ x: 0, y: 0 }, { x: cam.width, y: 0 }, { x: 0, y: cam.height }, { x: cam.width, y: cam.height }].map((c) => this.world(c)));
    // a live mode follows the sim (influence, nodes, lairs, walls): checked twice a second
    if (this.mode !== 'normal' && this.frame % 30 === 0) this.retint();
    // V: the peaks cut down to stubs too (the chunks they reach bake cut, the uncut ones shown meanwhile; the overview stays)
    if (this.iso.stub && this.build.layer.cutaway !== this.iso.cut) this.iso.cut = this.build.layer.cutaway;
    this.updateChunks(view, cam.zoom);
    this.glints?.draw(view, cam.zoom, this.time.now, this.iso);
    // the ground under the cursor follows the camera too (pan, zoom), not just pointer moves
    if (this.moved && (vx || vy || this.frame % 4 === 0)) this.pointerTile = this.world(p);

    const fog = this.sim.fog;
    if (fog && fog.version !== this.fogVer) (this.fogVer = fog.version), this.fog.set(fog);
    this.fog.update(dt, view);
    this.drawn = this.sim.units();
    this.sel.sync(this.drawn);
    // M7d: guardians perched or flying, and their squads' units not drawn (the Chimera's other heads)
    const bosses = this.sim.cur?.bosses;
    if (bosses) {
      this.guardians.update(bosses, this.sim.cur?.buildings ?? [], this.sim.cur?.units ?? []);
      if (this.guardians.hidden.size) this.drawn = this.drawn.filter((d) => !this.guardians.hidden.has(d.u.id));
    }
    // buildings first: this frame's walks, stairs and ladders lift the units
    this.build.update(this.wpx(p.x, p.y), cam.zoom, view);
    this.updateHoles(cam.zoom, this.moved && this.input.isOver ? this.wpx(p.x, p.y) : null);
    const at = this.sim.time(this.time.now), shots = this.sim.cur?.shots ?? [];
    this.siegeLayer.draw(this.sim.cur?.sieges ?? [], this.sim.cur?.buildings ?? [], this.drawn, at, this.sim.cur?.tick ?? 0, view);
    const cur0 = this.sim.cur, sel = this.trade.selected;
    this.tradeLayer.ring = sel ?? (this.build.selectedBuilding()?.type === 'chest' ? { building: this.build.selectedBuilding()!.id } : null);
    this.tradeLayer.draw(cur0?.sieges ?? [], cur0?.piles ?? [], cur0?.buildings ?? [], this.drawn, cam.zoom, view, this.time.now);
    this.units.settle(this.drawn, this.time.now);
    const occluded = this.objects?.draw(view, cam.zoom, this.drawn, (d) => this.units.feet(d), BODY) ?? new Set<number>();
    if (cam.zoom >= SPRITE_ZOOM) this.build.layer.occluded(this.drawn, occluded);
    this.units.draw(this.drawn, view, cam.zoom, this.sel.units, at, this.sim.squads, shots, occluded);
    const cur = this.sim.cur;
    if (cur?.lairs || cur?.claims) this.neutral.draw(cur.lairs ?? [], cur.claims ?? [], cam.zoom);
    if (bosses || cur?.warden) this.guardians.draw(bosses ?? [], cur?.warden, cam.zoom, this.time.now, this.sim.since(this.time.now), view, this.moved && this.input.isOver ? this.wpx(p.x, p.y) : null);
    this.shots.update(at.snap, shots);
    this.shots.draw(at, cam.zoom, cam.zoom >= SPRITE_ZOOM);
    this.drawUi();
    this.guardians.fx.applyShake(cam, dt, this.time.now);
    this.interact.label(this.moved && this.input.isOver && !this.build.tool && !this.box && !this.siege.armed ? p : null);
  }

  /**
   * Upload the worker's bakes back since the last frame (within the budget, one at least); show the baked chunks over
   * the view and bake the missing / stale ones nearest the view's middle first (the worker: a few in flight, then a ring
   * round the view; the main thread: within the frame's budget), the stale ones shown meanwhile; then the overview.
   */
  private updateChunks(view: View, zoom: number): void {
    const t0 = performance.now(), wk = this.worker;
    for (let k = 0; this.arrived.length && (k === 0 || performance.now() - t0 < BAKE_MS); k++) {
      const a = this.arrived.shift()!, s = performance.now();
      a.apply(a.bmp);
      a.bmp.close();
      this.stat('upload', performance.now() - s);
    }
    if (zoom !== this.filterZoom) {
      this.filterZoom = zoom;
      // crisp tiles (and no seams between chunks) zoomed in, smooth zoomed out
      for (const c of this.chunks) c.tex.setFilter(this.filter());
    }
    for (const c of this.chunks) c.img.setVisible(false);
    const span = CHUNK_PX, { W, H } = this.iso, nx = Math.ceil(W / span), ny = Math.ceil(H / span);
    const cx0 = Math.max(0, Math.floor(view.x / span)), cx1 = Math.min(nx - 1, Math.floor(view.right / span));
    const cy0 = Math.max(0, Math.floor(view.y / span)), cy1 = Math.min(ny - 1, Math.floor(view.bottom / span));
    const mx = (view.x + view.right) / 2 / span - 0.5, my = (view.y + view.bottom) / 2 / span - 0.5;
    const want: [number, number, number][] = [];
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const c = this.chunks.find((q) => q.at === this.chunkAt(cx, cy));
      if (c) (c.used = this.frame), c.img.setVisible(true); // stale shown till rebaked
      if (c?.ver === this.ver) continue;
      if (!c && this.peaky.has(`${cx},${cy}`)) { // V just toggled: the other cut's bake meanwhile
        const o = this.chunks.find((q) => q.at === this.chunkAt(cx, cy, !this.iso.cut));
        if (o) (o.used = this.frame), o.img.setVisible(true);
      }
      want.push([cx, cy, (cx - mx) ** 2 + (cy - my) ** 2]);
    }
    this.viewPending = want.length;
    if (!want.length && !this.warmed) (this.warmed = true), this.units.warm();
    // the view done, the worker bakes a ring round it (what a pan shows next)
    if (wk && !want.length) for (let cy = cy0 - 1; cy <= cy1 + 1; cy++) for (let cx = cx0 - 1; cx <= cx1 + 1; cx++) {
      if (cx < 0 || cy < 0 || cx >= nx || cy >= ny || (cx >= cx0 && cx <= cx1 && cy >= cy0 && cy <= cy1)) continue;
      if (this.chunks.find((q) => q.at === this.chunkAt(cx, cy))?.ver !== this.ver) want.push([cx, cy, (cx - mx) ** 2 + (cy - my) ** 2]);
    }
    want.sort((a, b) => a[2] - b[2]);
    let baked = 0;
    for (const [cx, cy] of want) {
      // 1 px of overlap all round: no seams between neighbours (or the overview showing through)
      const at = this.chunkAt(cx, cy), x0 = cx * span - 1, y0 = cy * span - 1, n = span + 2;
      if (wk) {
        if (wk.busy >= IN_FLIGHT) break;
        const ver = this.ver, key = `${at}|${ver}`;
        if (this.asked.has(key)) continue;
        this.asked.add(key);
        this.ask({ x0, y0, w: n, h: n, scale: 1, cw: n, ch: n, cut: this.iso.cut, objects: false }, (bmp) => {
          this.asked.delete(key);
          const c = this.chunks.find((q) => q.at === at) ?? this.claimChunk(at);
          if (c.ver > ver) return;
          c.tex.context.clearRect(0, 0, n, n);
          c.tex.context.drawImage(bmp, 0, 0);
          c.tex.refresh();
          c.img.setPosition(x0, y0);
          c.ver = ver;
          c.used = this.frame;
        });
        continue;
      }
      if (baked && performance.now() - t0 > BAKE_MS) break;
      baked++;
      const c = this.chunks.find((q) => q.at === at) ?? this.claimChunk(at);
      this.bake(c.tex.context, x0, y0, n, n, 1);
      c.tex.refresh();
      c.img.setPosition(x0, y0).setVisible(true);
      c.ver = this.ver;
      c.used = this.frame;
    }
    if (!this.overviewReady && (!wk || !this.viewPending)) this.bakeOverviewBand();
  }

  /** A chunk's key: its column and row, and where the peaks reach it, whether they are cut (`cut`, default as now). */
  private chunkAt(cx: number, cy: number, cut = this.iso.cut): string {
    const k = `${cx},${cy}`;
    return this.peaky.has(k) ? `${k}|${cut ? 1 : 0}` : k;
  }

  /** The chunks the peaks reach, with the ground under them and the walls down from it (their bakes differ when cut). */
  private peakChunks(): Set<string> {
    const out = new Set<string>(), iso = this.iso, f = iso.peaks;
    if (!f || !iso.stub) return out;
    const { w, h, P, S } = f, W = w + 1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = y * W + x;
      if (P[k] <= 0 && P[k + 1] <= 0 && P[k + W] <= 0 && P[k + W + 1] <= 0) continue;
      let lo = Infinity;
      for (let fy = 2 * y - 1; fy <= 2 * y + 3; fy++) for (let fx = 2 * x - 1; fx <= 2 * x + 3; fx++) lo = Math.min(lo, iso.zf(fx, fy));
      const v = x + y, mx = iso.OX + (x - y) * HW;
      const top = iso.OY + v * HH - (Math.max(S[k], S[k + 1], S[k + W], S[k + W + 1]) + 1) * LH, bottom = iso.OY + (v + 2) * HH - (lo - 2) * LH;
      for (let cy = Math.floor(top / CHUNK_PX); cy <= Math.floor(bottom / CHUNK_PX); cy++) {
        for (let cx = Math.floor((mx - HW - 2) / CHUNK_PX); cx <= Math.floor((mx + HW + 2) / CHUNK_PX); cx++) out.add(`${cx},${cy}`);
      }
    }
    return out;
  }

  /**
   * See-through holes in the peaks: round the cursor when a range stands over walkable ground behind it, and round the
   * selected units a range hides. Each is a window baked with the peaks cut to stubs (one bake a frame, moved in steps of
   * a quarter of its size), faded at its rim, over the chunks and under the sprites; IsoMap.holes makes picking and the
   * units' occlusion see the same ground.
   */
  private updateHoles(zoom: number, wp: { x: number; y: number } | null): void {
    const iso = this.iso, full = iso.peaks, stub = iso.stub;
    const want: { x: number; y: number }[] = [];
    if (full && stub && !iso.cut) {
      const R = HOLE_PX / 2 / zoom;
      if (wp) {
        const a = iso.pick(wp.x, wp.y, full), b = iso.pick(wp.x, wp.y, stub);
        if (peakAt(full, a.x, a.y) > 1 && peakAt(full, b.x, b.y) === 0) want.push(wp);
      }
      for (const d of this.drawn) {
        if (want.length >= HOLES) break;
        if (d.u.state === 'dead' || !this.selected.has(d.u.squad)) continue;
        const f = this.units.feet(d), q = { x: f.x, y: f.y - BODY / 2 };
        if (want.some((h) => (h.x - q.x) ** 2 + (h.y - q.y) ** 2 < (R * 0.7) ** 2)) continue;
        if (iso.hidden(f.x, f.y - BODY, d.x + d.y, iso.zAt(d.x, d.y), full) && !iso.hidden(f.x, f.y - BODY, d.x + d.y, iso.zAt(d.x, d.y), stub)) want.push(q);
      }
    }
    const holes: { x: number; y: number; r: number }[] = [];
    let baked = false;
    want.forEach((q, i) => {
      const R = HOLE_PX / 2 / zoom, step = R / 2;
      const cx = Math.round(q.x / step) * step, cy = Math.round(q.y / step) * step, at = `${cx},${cy},${R},${this.ver}`;
      let w = this.windows[i];
      if (!w) {
        const key = `peak-window-${i}`, n = Math.ceil(4 * HOLE_PX);
        const tex = this.textures.createCanvas(key, n, n)!;
        this.windows.push((w = { tex, img: this.add.image(0, 0, key).setOrigin(0).setDepth(1.5), at: '', want: '' }));
      }
      if (w.at !== at && w.want !== at && !baked) {
        baked = true;
        const win = w, ctx = w.tex.context, n = Math.ceil(2 * R);
        // faded at the rim: opaque to 60% of the radius, gone at its edge
        const fade = () => {
          const g = ctx.createRadialGradient(n / 2, n / 2, n * 0.3, n / 2, n / 2, n / 2);
          g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.save(); ctx.globalCompositeOperation = 'destination-in'; ctx.fillStyle = g; ctx.fillRect(0, 0, win.tex.width, win.tex.height); ctx.restore();
          win.tex.refresh();
          win.img.setPosition(cx - R, cy - R);
          win.at = at;
        };
        win.want = at;
        if (this.worker) this.ask({ x0: cx - R, y0: cy - R, w: 2 * R, h: 2 * R, scale: 1, cw: n, ch: n, cut: true, objects: false }, (bmp) => {
          if (win.want !== at) return;
          ctx.clearRect(0, 0, win.tex.width, win.tex.height);
          ctx.drawImage(bmp, 0, 0);
          fade();
        });
        else {
          ctx.clearRect(0, 0, w.tex.width, w.tex.height);
          iso.cut = true;
          this.bake(ctx, cx - R, cy - R, 2 * R, 2 * R, 1);
          iso.cut = false;
          fade();
        }
      }
      if (w.at) {
        w.img.setVisible(true);
        const [ax, ay] = w.at.split(',').map(Number);
        holes.push({ x: ax, y: ay, r: R * 0.8 });
      }
    });
    for (let i = want.length; i < this.windows.length; i++) { this.windows[i].img.setVisible(false); this.windows[i].at = this.windows[i].want = ''; }
    iso.holes = holes;
  }

  private filter(): Phaser.Textures.FilterMode {
    return this.filterZoom >= 1 ? Phaser.Textures.FilterMode.NEAREST : Phaser.Textures.FilterMode.LINEAR;
  }

  /** A canvas for the chunk at `at`: a new one while the pool has room, else the least recently shown. */
  private claimChunk(at: string): Chunk {
    const pool = this.chunks;
    let c: Chunk | undefined;
    if (pool.length < POOL) {
      const key = `chunk-${pool.length}`;
      const tex = this.textures.createCanvas(key, CHUNK_PX + 2, CHUNK_PX + 2)!;
      tex.setFilter(this.filter());
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
