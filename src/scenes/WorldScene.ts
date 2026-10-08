import { encounterOf } from '../data/beasts';
import { encounterName } from '../ui/beastInfo';
import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { Button, addIcon, addPanel, addText } from '../ui/kit';
import { ellipsize, wrapText, LINE_H } from '../ui/textfit';
import {
  BAND_COLORS, MAPC, PARTY_FH, PARTY_FOOT, PARTY_FRAMES, PARTY_FW, STRUCT_FRAMES, STRUCT_FX, STRUCT_LIFT, STRUCT_PAD, WTILE, renderBoat, renderCampZone,
  renderDust, renderMarker, renderNamePlate, renderPartyFigure, renderPlaceTile, renderStructure,
} from '../art/worldArt';
import { renderWorldMap, type SiteArt, type WorldMapArt } from '../art/overlandMap';
import { OverlandLife } from '../ui/overlandLife';
import { FOG_CHUNK, FogPainter } from '../art/fogArt';
import { P } from '../art/palette';
import { state, randomSeed } from '../state';
import { haptic, hapticNotify } from '../platform/telegram';
import { CULTURE_LABEL } from '../data/names';
import { addSyncBadge, playerPartyTexture } from '../ui/online';
import { perkSlots } from '../data/perks';
import { itemDef, type Item } from '../data/items';
import { dangerAt, isWater, regionName, type SettlementDef } from '../world/map';
import { siteAt } from '../world/battlefield';
import { STRUCTURES, STRUCTURE_LIST, campEffects, countBuilt, footprint, freeSpot, placeCheck, type StructureId } from '../world/camp';
import { THREAT_COLOR, THREAT_LABEL, WORLD_RULES, threatLevel, type PartyState, type PlayerInfo, type World } from '../world/world';
import { openModal, confirmDialog } from '../ui/widgets';
import { CampLife } from '../ui/campLife';
import { renderScaffold } from '../art/campArt';

/** Game hours per real second while travelling / waiting. */
const TRAVEL_SPEED = 1.6;
const WAIT_SPEED = 4;
/** Depth bands inside the world layer. */
const D_FOG = 100000;
const D_ROUTE = D_FOG + 1;
const D_PARTY = D_FOG + 3;
const D_GHOST = D_FOG + 5;
/** Where each cached camp-zone texture sits on the map (its key encodes the camp). */
const campZoneAt = new Map<string, { x: number; y: number }>();
/** Fog dissolve duration per tile (ms). */
const FOG_FADE = 650;

interface BandView {
  p: PartyState;
  spr: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  plate: Phaser.GameObjects.Container;
  key: string;
  lastX: number;
  flip: boolean;
}

type Gesture = { mode: 'pending' | 'pan'; id: number; sx: number; sy: number; lx: number; ly: number } | null;

/** Fog painters are costly to set up (per-pixel noise): keep one per map seed across scene restarts. */
let fogCache: { seed: number; painter: FogPainter; vis: Float32Array } | null = null;
/** The painted map, its sea mask, sites and sea lanes, per seed. */
let mapCache: { seed: number; art: WorldMapArt } | null = null;

export class WorldScene extends BaseScene {
  private w!: World;
  private layer!: Phaser.GameObjects.Layer;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private party!: Phaser.GameObjects.Sprite;
  private partyShadow!: Phaser.GameObjects.Ellipse;
  private bands = new Map<number, BandView>();
  private routeG!: Phaser.GameObjects.Graphics;
  private marker!: Phaser.GameObjects.Image;
  private night!: Phaser.GameObjects.Rectangle;
  private hud!: Phaser.GameObjects.Container;
  private clockText!: Phaser.GameObjects.BitmapText;
  private goldText!: Phaser.GameObjects.BitmapText;
  private armyText!: Phaser.GameObjects.BitmapText;
  private regionText!: Phaser.GameObjects.BitmapText;
  private foodText!: Phaser.GameObjects.BitmapText;
  private supplyText!: Phaser.GameObjects.BitmapText;
  private hintText!: Phaser.GameObjects.BitmapText;
  private waitBtn: Button | null = null;
  private followBtn!: Button;
  private dialog: Phaser.GameObjects.Container | null = null;
  private banner: Phaser.GameObjects.Container | null = null;
  private waiting = false;
  private follow = true;
  private gesture: Gesture = null;
  private pinch: { d0: number; z0: number; cx: number; cy: number } | null = null;
  private info!: PlayerInfo;
  private saveTimer = 0;
  private flip = false;
  // fog of war
  private fog!: FogPainter;
  private fogVis!: Float32Array;
  private fogTex: Phaser.Textures.CanvasTexture[] = [];
  private fogImg: ImageData | null = null;
  private fogAnim = new Set<number>();
  private fogFrame = 0;
  private sites: SiteArt[] = [];
  private mapLife: OverlandLife | null = null;
  private settlementObjs = new Map<number, Phaser.GameObjects.GameObject[]>();
  // discovery pans (toast + camera glide to the new town and back)
  private panQueue: number[] = [];
  private cine = false;
  // ambience
  private dust: { r: Phaser.GameObjects.Rectangle; born: number }[] = [];
  private lastDust = 0;
  // camp
  private campObjs: Phaser.GameObjects.GameObject[] = [];
  private campBorder: { x: number; y: number }[] = [];
  private campG!: Phaser.GameObjects.Graphics;
  private antPhase = 0;
  private antTimer = 0;
  private campAnim: { spr: Phaser.GameObjects.Image; keys: string[]; period: number }[] = [];
  private campZoneKey = '';
  private life: CampLife | null = null;
  /** A structure going up: scaffold stages, then the built art. */
  private construct: { id: StructureId; x: number; y: number; t0: number; stage?: number; spr?: Phaser.GameObjects.Image } | null = null;
  private placing: { id: StructureId; x: number; y: number } | null = null;
  private ghost: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('World');
  }

  create(data: { encounter?: number }): void {
    this.bands = new Map();
    this.dialog = null;
    this.banner = null;
    this.waiting = false;
    this.follow = true;
    this.gesture = null;
    this.pinch = null;
    this.panQueue = [];
    this.cine = false;
    this.mapLife = null;
    this.dust = [];
    this.campObjs = [];
    this.campAnim = [];
    this.campZoneKey = '';
    this.life = null;
    this.construct = null;
    this.placing = null;
    this.ghost = [];
    this.fogAnim = new Set();
    this.settlementObjs = new Map();
    this.waitBtn = null;
    this.initUi();
    const camp = state.campaign;
    this.w = camp.world;
    this.w.s.inside = -1;
    this.info = camp.playerInfo();
    const m = this.w.map;

    // ---- world layer
    this.layer = this.add.layer();
    const key = `worldmap3_${m.seed}`;
    if (!this.textures.exists(key) || mapCache?.seed !== m.seed) {
      if (this.textures.exists(key)) this.textures.remove(key);
      const art = renderWorldMap(m);
      this.textures.addCanvas(key, art.pix.toCanvas());
      mapCache = { seed: m.seed, art };
    }
    const art = mapCache!.art;
    this.sites = art.sites;
    this.layer.add(this.add.image(0, 0, key).setOrigin(0, 0).setDepth(-100000));
    if (!this.textures.exists('wm_marker2')) {
      this.textures.addCanvas('wm_marker2', renderMarker().toCanvas());
      this.textures.addCanvas('wm_boat', renderBoat().toCanvas());
      const dust = this.textures.addCanvas('wm_dust', renderDust().toCanvas())!;
      for (let f = 0; f < 3; f++) dust.add(f, 0, f * 16, 0, 16, 12);
      this.textures.addCanvas('wm_tile_ok', renderPlaceTile(true).toCanvas());
      this.textures.addCanvas('wm_tile_bad', renderPlaceTile(false).toCanvas());
    }
    if (!this.textures.exists('wm_band_player')) {
      for (const [k, c] of Object.entries(BAND_COLORS)) {
        const flag = k === 'player' ? P.cream : k === 'pirates' ? 0xe8e0cc : P.red;
        const tex = this.textures.addCanvas(`wm_band_${k}`, renderPartyFigure(c, flag).toCanvas())!;
        for (let f = 0; f < PARTY_FRAMES; f++) tex.add(f, 0, f * PARTY_FW, 0, PARTY_FW, PARTY_FH);
      }
    }
    for (const s of m.settlements) this.addSettlement(s);
    this.campG = this.add.graphics().setDepth(-59000);
    this.layer.add(this.campG);
    this.renderCamp();
    this.routeG = this.add.graphics().setDepth(D_ROUTE);
    this.layer.add(this.routeG);
    this.marker = this.add.image(0, 0, 'wm_marker2').setVisible(false).setDepth(D_ROUTE);
    this.layer.add(this.marker);
    this.partyShadow = this.add.ellipse(0, 0, 16, 5, MAPC.shade, 0.4).setDepth(D_PARTY - 1);
    this.party = this.add.sprite(0, 0, playerPartyTexture(this), 0).setOrigin(PARTY_FOOT.x / PARTY_FW, PARTY_FOOT.y / PARTY_FH).setDepth(D_PARTY);
    this.layer.add([this.partyShadow, this.party]);
    this.initFog();
    this.mapLife = new OverlandLife(this, art.sites, art.lanes, art.water, m.w * WTILE, m.h * WTILE, (x, y) => this.explored(x / WTILE, y / WTILE), (o) => this.layer.add(o), -55000, art.fields);

    // ---- cameras
    const cam = this.cameras.main;
    cam.setBounds(-60, -60, m.w * WTILE + 120, m.h * WTILE + 120);
    cam.setBackgroundColor(MAPC.parch[0]);
    cam.setZoom(2);
    cam.centerOn(this.w.s.x * WTILE, this.w.s.y * WTILE);
    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.uiCam.ignore(this.layer);
    cam.ignore(this.ui);

    this.night = this.add.rectangle(0, 0, this.m.VW, this.m.VH, 0x1c1030, 0).setOrigin(0, 0);
    this.ui.add(this.night);
    this.hud = this.add.container(0, 0);
    this.ui.add(this.hud);
    if (this.w.camp) this.waiting = true;
    this.buildHud();

    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('pointerupoutside', this.onUp, this);
    this.input.on('wheel', (_p: unknown, _o: unknown[], _dx: number, dy: number) => this.setZoom(Math.round(cam.zoom) + (dy > 0 ? -1 : 1)));
    this.screen({ back: () => (this.placing ? this.cancelPlacing() : this.leaveToMenu()) });
    this.events.once('shutdown', () => void state.save());

    // Discoveries made outside the map (none expected) are not replayed.
    this.w.discoveries = [];
    this.renderWorld(0);
    if (data?.encounter !== undefined && this.w.party(data.encounter)) this.openEncounter(data.encounter, true);
    else if (this.w.s.time < 9 && camp.data.fought === 0) this.showBanner('Tap the map to march', 2600);
  }

  protected onResized(): void {
    this.scene.restart({});
  }

  private addSettlement(s: SettlementDef): void {
    // the settlement itself is baked into the map (src/art/overlandMap.ts); its name plate sits under it
    const site = this.siteOf(s.id);
    const x = site ? site.lx : s.x * WTILE + WTILE / 2;
    const y = site ? site.ly + 2 : s.y * WTILE + WTILE / 2 + 6;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const font = s.kind === 'town' ? 'red' : s.kind === 'village' ? 'ink' : 'dim';
    const label = addText(this, Math.round(x), y + 2, s.name, font, 0.5);
    const pw = Math.ceil(label.width) + 6;
    const pkey = `wm_plate_${s.kind}_${pw}`;
    if (!this.textures.exists(pkey)) this.textures.addCanvas(pkey, renderNamePlate(pw, s.kind).toCanvas());
    const plate = this.add.image(Math.round(x), y, pkey).setOrigin(0.5, 0).setDepth(y + 1);
    label.setDepth(y + 2);
    objs.push(plate, label);
    this.layer.add(objs);
    this.settlementObjs.set(s.id, objs);
  }

  private siteOf(id: number): SiteArt | undefined {
    return this.sites.find((q) => q.id === id && q.kind !== 'landmark');
  }

  // ================================================================ fog of war

  private initFog(): void {
    const m = this.w.map;
    if (!fogCache || fogCache.seed !== m.seed) {
      const vis = new Float32Array(m.w * m.h);
      fogCache = { seed: m.seed, vis, painter: new FogPainter(m.w, m.h, WTILE, vis, m.seed & 0xffff) };
    }
    this.fog = fogCache.painter;
    this.fogVis = fogCache.vis;
    for (let i = 0; i < this.fogVis.length; i++) this.fogVis[i] = this.w.explored[i];
    this.w.revealLog = [];
    this.fog.soften(0, 0, m.w - 1, m.h - 1);
    const cw = Math.ceil(this.fog.W / FOG_CHUNK);
    const ch = Math.ceil(this.fog.H / FOG_CHUNK);
    this.fogTex = [];
    for (let cy = 0; cy < ch; cy++) {
      for (let cx = 0; cx < cw; cx++) {
        const key = `wm_fog_${cx}_${cy}`;
        const tex = (this.textures.exists(key) ? this.textures.get(key) : this.textures.createCanvas(key, FOG_CHUNK, FOG_CHUNK)) as Phaser.Textures.CanvasTexture;
        this.fogTex.push(tex);
        this.paintFogChunk(cx, cy);
        this.layer.add(this.add.image(cx * FOG_CHUNK, cy * FOG_CHUNK, key).setOrigin(0, 0).setDepth(D_FOG));
      }
    }
  }

  private paintFogChunk(cx: number, cy: number): void {
    const cw = Math.ceil(this.fog.W / FOG_CHUNK);
    const tex = this.fogTex[cy * cw + cx];
    if (!tex) return;
    const ctx = tex.getContext();
    if (!this.fogImg) this.fogImg = ctx.createImageData(FOG_CHUNK, FOG_CHUNK);
    this.fog.paint(cx, cy, this.fogImg.data);
    ctx.putImageData(this.fogImg, 0, 0);
    tex.refresh();
  }

  /** Fade newly revealed tiles in (a noisy dissolve), repainting only the chunks that change. */
  private updateFog(delta: number): void {
    const log = this.w.revealLog;
    if (log.length) {
      for (const i of log) this.fogAnim.add(i);
      this.w.revealLog = [];
    }
    if (this.fogAnim.size === 0) return;
    // repaint at ~30 fps
    this.fogFrame++;
    if (this.fogFrame % 2) return;
    const m = this.w.map;
    const dv = Math.max(16, delta) * 2 / FOG_FADE;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const i of this.fogAnim) {
      const v = Math.min(1, this.fogVis[i] + dv);
      this.fogVis[i] = v;
      if (v >= 1) this.fogAnim.delete(i);
      const x = i % m.w;
      const y = (i - x) / m.w;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    this.fog.soften(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
    const C = FOG_CHUNK / WTILE;
    const cw = Math.ceil(this.fog.W / FOG_CHUNK);
    const ch = Math.ceil(this.fog.H / FOG_CHUNK);
    for (let cy = Math.max(0, Math.floor((y0 - 3) / C)); cy <= Math.min(ch - 1, Math.floor((y1 + 3) / C)); cy++) {
      for (let cx = Math.max(0, Math.floor((x0 - 3) / C)); cx <= Math.min(cw - 1, Math.floor((x1 + 3) / C)); cx++) this.paintFogChunk(cx, cy);
    }
  }

  private explored(x: number, y: number): boolean {
    return this.w.isExplored(Math.floor(x), Math.floor(y));
  }

  // ================================================================ discoveries

  private drainDiscoveries(): void {
    const ds = this.w.discoveries;
    if (!ds.length) return;
    this.w.discoveries = [];
    for (const id of ds) {
      const s = this.w.settlement(id);
      if (!s) continue;
      if (s.kind === 'lair') this.showBanner(`Spotted: ${s.name}`, 1800);
      else this.panQueue.push(id);
    }
    if (!this.cine) this.nextPan();
  }

  /** "WE FOUND X.": glide the camera to the discovered settlement, hold, and glide back. */
  private nextPan(): void {
    const id = this.panQueue.shift();
    if (id === undefined) return;
    const s = this.w.settlement(id)!;
    this.cine = true;
    hapticNotify('success');
    this.showBanner(`We found ${s.name}.`.toUpperCase(), 2400);
    const cam = this.cameras.main;
    cam.pan(s.x * WTILE + 4, s.y * WTILE, 900, 'Sine.easeInOut', true);
    this.time.delayedCall(1900, () => {
      if (!this.scene.isActive()) return;
      cam.pan(Math.round(this.w.s.x * WTILE), Math.round(this.w.s.y * WTILE), 700, 'Sine.easeInOut', true, (_c: Phaser.Cameras.Scene2D.Camera, prog: number) => {
        if (prog < 1) return;
        this.cine = false;
        if (this.panQueue.length) this.nextPan();
      });
    });
  }

  // ================================================================ loop

  update(_t: number, delta: number): void {
    const camp = state.campaign;
    const busy = this.dialog || this.cine || this.placing;
    if (!busy && (this.w.moving || this.waiting || this.w.s.destParty >= 0)) {
      const rate = this.waiting ? WAIT_SPEED : TRAVEL_SPEED;
      const hours = Math.min(0.25, delta / 1000) * rate;
      const r = this.w.advance(hours, this.info, this.waiting);
      camp.tickWorld(r.hours);
      this.saveTimer += delta;
      if (this.saveTimer > 8000) {
        this.saveTimer = 0;
        void state.save();
      }
      const ev = r.events[0];
      if (ev?.type === 'arrive') {
        this.enterSettlement(ev.settlement);
        return;
      }
      if (ev?.type === 'encounter') {
        this.setWaiting(false);
        this.openEncounter(ev.party, ev.byPlayer);
      }
      this.refreshHud();
    }
    this.drainDiscoveries();
    this.updateFog(delta);
    this.renderWorld(delta);
  }

  renderWorld(_delta: number): void {
    const now = this.time.now;
    const s = this.w.s;
    const px = s.x * WTILE;
    const py = s.y * WTILE;
    const moving = this.w.moving && !this.dialog && !this.cine;
    if (moving && this.w.route.length) {
      const dx = this.w.route[0].x - s.x;
      if (dx < -0.05) this.flip = true;
      else if (dx > 0.05) this.flip = false;
    }
    // sub-pixel positions: at zoom 2-4 the march glides instead of stepping a whole map pixel
    const zq = Math.max(1, Math.round(this.cameras.main.zoom));
    const sx = Math.round(px * zq) / zq;
    const sy = Math.round(py * zq) / zq;
    this.party.setPosition(sx, sy + 2).setFlipX(this.flip);
    this.party.setFrame(moving ? Math.floor(now / 140) % PARTY_FRAMES : 0);
    this.partyShadow.setPosition(sx + (this.flip ? -1 : 1), sy + 2);
    // dust trail: pale fading dots behind the marching party
    if (moving && now - this.lastDust > 140) {
      this.lastDust = now;
      const r = this.add.rectangle(Math.round(px) + (this.flip ? 3 : -3), Math.round(py) + 2, 2, 1, MAPC.parch[3], 0.9).setDepth(D_PARTY - 2);
      this.layer.add(r);
      this.dust.push({ r, born: now });
    }
    this.dust = this.dust.filter((d) => {
      const a = 1 - (now - d.born) / 1100;
      if (a <= 0) {
        d.r.destroy();
        return false;
      }
      d.r.setAlpha(a * 0.9);
      return true;
    });
    // route: dotted cyan-grey line and a dashed square at the target
    this.routeG.clear();
    if (this.w.route.length) {
      // dotted route: 2 px beads every 4 px, marching towards the goal, with a soft shadow
      const step = 4;
      const phase = Math.floor(now / 180) % step;
      let ax = px;
      let ay = py;
      let k = 0;
      for (const wp of this.w.route) {
        const bx = wp.x * WTILE;
        const by = wp.y * WTILE;
        const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay)));
        for (let i = 0; i < n; i++, k++) {
          if (k < 6 || (k + step - phase) % step !== 0) continue;
          const x = Math.round(ax + ((bx - ax) * i) / n);
          const y = Math.round(ay + ((by - ay) * i) / n);
          this.routeG.fillStyle(MAPC.shade, 0.4);
          this.routeG.fillRect(x, y + 1, 2, 2);
          this.routeG.fillStyle(0x3e5e60, 1);
          this.routeG.fillRect(x - 1, y, 2, 2);
          this.routeG.fillStyle(MAPC.route, 1);
          this.routeG.fillRect(x - 1, y, 1, 1);
        }
        ax = bx;
        ay = by;
      }
      const last = this.w.route[this.w.route.length - 1];
      this.marker.setVisible(this.w.s.destParty < 0).setPosition(Math.round(last.x * WTILE), Math.round(last.y * WTILE));
    } else this.marker.setVisible(false);
    // bands (hidden under the fog)
    const seen = new Set<number>();
    for (const p of this.w.s.parties) {
      seen.add(p.id);
      let v = this.bands.get(p.id);
      const ratio = p.power / Math.max(1, this.info.power);
      const lvl = threatLevel(ratio);
      const key = `${p.size}_${lvl}`;
      if (!v) {
        const tex = p.name === 'Pirates' ? 'wm_band_pirates' : `wm_band_${p.kind}`;
        const shadow = this.add.ellipse(0, 0, 16, 5, MAPC.shade, 0.4);
        const spr = this.add.sprite(0, 0, tex, 0).setOrigin(PARTY_FOOT.x / PARTY_FW, PARTY_FOOT.y / PARTY_FH);
        const plate = this.add.container(0, 0);
        this.layer.add([shadow, spr, plate]);
        v = { p, spr, shadow, plate, key: '', lastX: p.x, flip: false };
        this.bands.set(p.id, v);
      }
      v.p = p;
      if (v.key !== key) {
        v.key = key;
        v.plate.removeAll(true);
        const label = `${p.size}`;
        const wdt = label.length * 5 + 9;
        v.plate.add(this.add.rectangle(0, 0, wdt, 9, P.outline).setOrigin(0.5, 1));
        v.plate.add(this.add.rectangle(0, -1, wdt - 2, 7, THREAT_COLOR[lvl]).setOrigin(0.5, 1));
        v.plate.add(addText(this, 0, -9, label, 'title', 0.5));
      }
      const bx = p.x * WTILE;
      const by = p.y * WTILE;
      if (p.x < v.lastX - 0.01) v.flip = true;
      else if (p.x > v.lastX + 0.01) v.flip = false;
      const walking = Math.abs(p.x - v.lastX) > 1e-4 && !this.dialog;
      v.lastX = p.x;
      const vis = this.explored(p.x, p.y);
      v.spr.setVisible(vis).setPosition(Math.round(bx), Math.round(by) + 2).setDepth(by + 3).setFlipX(v.flip).setFrame(walking ? Math.floor(now / 160 + p.id) % PARTY_FRAMES : 0);
      v.shadow.setVisible(vis).setPosition(Math.round(bx), Math.round(by) + 2).setDepth(by + 2);
      v.plate.setVisible(vis).setPosition(Math.round(bx), Math.round(by) - 20).setDepth(by + 4);
      v.spr.setAlpha(p.idle > 0 ? 0.75 : 1);
    }
    for (const [id, v] of this.bands) {
      if (seen.has(id)) continue;
      v.spr.destroy();
      v.shadow.destroy();
      v.plate.destroy();
      this.bands.delete(id);
    }
    this.mapLife?.update(now, this.cameras.main.worldView, this.cameras.main.zoom);
    this.renderCampAnim(now, _delta);
    // camera follow (eased, snapped to whole pixels)
    const cam = this.cameras.main;
    if (this.follow && !this.pinch && !this.cine) {
      const k = 1 - Math.exp((-Math.max(16, _delta) / 1000) * 4);
      const cx = cam.midPoint.x + (px - cam.midPoint.x) * k;
      const cy = cam.midPoint.y + (py - cam.midPoint.y) * k;
      cam.centerOn(cx, cy);
    }
    // night: stepped plum dusk by the hour
    const h = this.w.hour;
    const a = h >= 21 || h < 5 ? 0.34 : h >= 19 || h < 7 ? 0.17 : 0;
    this.night.setFillStyle(0x1c1030, a);
  }

  // ================================================================ camp

  private renderCamp(): void {
    for (const o of this.campObjs) o.destroy();
    this.campObjs = [];
    this.campAnim = [];
    this.campBorder = [];
    this.campG.clear();
    this.life?.destroy();
    this.life = null;
    const c = this.w.camp;
    if (!c) return;
    const m = this.w.map;
    const S = WTILE;
    const pal = c.built.some((b) => b.id === 'palisade');
    const built = c.built.map((b) => ({ id: b.id, x: b.x, y: b.y, w: STRUCTURES[b.id].w, h: STRUCTURES[b.id].h }));
    const sig = c.built.map((b) => `${b.id[0]}${b.x}.${b.y}`).join('');
    const zkey = `wm_campzone_${c.x}_${c.y}_${c.zone.length}_${pal ? 1 : 0}_${sig}`;
    if (this.campZoneKey && this.campZoneKey !== zkey && this.textures.exists(this.campZoneKey)) {
      this.textures.remove(this.campZoneKey);
      campZoneAt.delete(this.campZoneKey);
    }
    this.campZoneKey = zkey;
    if (!this.textures.exists(zkey) || !campZoneAt.has(zkey)) {
      const z = renderCampZone(m, c.zone, pal, built, { x: c.x, y: c.y });
      if (this.textures.exists(zkey)) this.textures.remove(zkey);
      this.textures.addCanvas(zkey, z.pix.toCanvas());
      campZoneAt.set(zkey, { x: z.x, y: z.y });
    }
    const { x: zx, y: zy } = campZoneAt.get(zkey)!;
    const img = this.add.image(zx, zy, zkey).setOrigin(0, 0).setDepth(-60000);
    this.layer.add(img);
    this.campObjs.push(img);
    // the dotted border, tile-snapped (drawn by the graphics so it can march)
    const set = new Set(c.zone);
    const inZ = (x: number, y: number) => set.has(y * m.w + x);
    for (const i of c.zone) {
      const tx = i % m.w;
      const ty = Math.floor(i / m.w);
      for (let k = 0; k < S; k++) {
        if (!inZ(tx, ty - 1)) this.campBorder.push({ x: tx * S + k, y: ty * S });
        if (!inZ(tx, ty + 1)) this.campBorder.push({ x: tx * S + k, y: ty * S + S - 1 });
        if (!inZ(tx - 1, ty)) this.campBorder.push({ x: tx * S, y: ty * S + k });
        if (!inZ(tx + 1, ty)) this.campBorder.push({ x: tx * S + S - 1, y: ty * S + k });
      }
    }
    this.drawCampBorder();
    // the living camp: structures, standard, smoke, sparks and the men
    const life = new CampLife(this, { add: (o) => this.layer.add(o), depth: 0, pool: 20 });
    this.life = life;
    let tentN = 0;
    const doors: [number, number][] = [];
    let fire: { x: number; y: number } | null = null;
    let forge: { x: number; y: number } | null = null;
    let yard: { x: number; y: number } | null = null;
    const tents: { x: number; y: number }[] = [];
    const cons = this.construct;
    for (const b of c.built) {
      const d = STRUCTURES[b.id];
      const look = b.id === 'tent' ? tentN++ : 0;
      const footY = (b.y + d.h) * S - 1;
      if (cons && cons.id === b.id && cons.x === b.x && cons.y === b.y) {
        const spr = this.add.image(b.x * S - 1, b.y * S - STRUCT_LIFT[b.id], this.scaffoldKey(b.id, 0)).setOrigin(0, 0).setDepth(footY);
        this.layer.add(spr);
        this.campObjs.push(spr);
        cons.spr = spr;
        life.figure(1, b.x * S - 3, footY + 1, 'smith', false);
        life.sparks(b.x * S + 1, footY - 3, 6, () => life.striking(b.x * S - 3, footY + 1));
        continue;
      }
      const keys = Array.from({ length: STRUCT_FRAMES[b.id] }, (_, f) => this.structKey(b.id, f, look));
      // the drill yard is ground: the men drill on it, so it sorts by its top edge
      const spr = this.add.image(b.x * S - STRUCT_PAD[b.id], b.y * S - STRUCT_LIFT[b.id], keys[0]).setOrigin(0, 0).setDepth(b.id === 'training' ? b.y * S + 2 : footY);
      this.layer.add(spr);
      this.campObjs.push(spr);
      if (keys.length > 1) this.campAnim.push({ spr, keys, period: b.id === 'fire' ? 130 : 420 });
      const fx = STRUCT_FX[b.id];
      if (fx.smoke) life.smoke(b.x * S + fx.smoke[0], b.y * S + fx.smoke[1], b.id === 'fire' ? 1.8 : 1.1);
      if (b.id === 'fire') {
        fire = { x: b.x * S, y: b.y * S };
        life.sparks(b.x * S + 4, b.y * S + 1, 2.2);
      } else if (b.id === 'forge') forge = { x: b.x * S, y: b.y * S };
      else if (b.id === 'training') yard = { x: b.x * S, y: b.y * S };
      else if (b.id === 'tent') {
        tents.push({ x: b.x * S, y: b.y * S });
        doors.push([b.x * S + 4, b.y * S + 10]);
      }
    }
    // the camp standard beside the party's spot
    const hx = c.x * S + 4;
    const hy = c.y * S + 7;
    // (on the free tile nearest the zone's north edge above the heart)
    const taken = (x: number, y: number) => (x === c.x && y === c.y) || built.some((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
    const north = c.zone
      .map((i) => ({ x: i % m.w, y: Math.floor(i / m.w) }))
      .filter((t) => !taken(t.x, t.y) && !taken(t.x, t.y + 1))
      .sort((a, b) => a.y - b.y + Math.abs(a.x - c.x) * 0.6 - Math.abs(b.x - c.x) * 0.6)[0];
    if (north) life.loop(north.x * S + 3, north.y * S + 7, ['ck_std_0', 'ck_std_1', 'ck_std_2', 'ck_std_3'], 190, 0, [1 / 13, 19 / 20]);
    // a boat drawn up on the shore when the camp touches the sea
    const boatAt = c.zone.map((i) => [i % m.w, Math.floor(i / m.w)]).flatMap(([x, y]) => [[x + 1, y], [x, y + 1], [x - 1, y], [x, y - 1]]).find(([x, y]) => x >= 0 && y >= 0 && x < m.w && y < m.h && isWater(m.terrain[y * m.w + x]));
    if (boatAt) {
      const boat = this.add.image(boatAt[0] * S + 4, boatAt[1] * S + 5, 'wm_boat').setOrigin(0.5, 0.75).setDepth(boatAt[1] * S + 5);
      this.layer.add(boat);
      this.campObjs.push(boat);
    }
    // the men: the smith, the fire, a sparring pair, the wounded at the tents, the rest strolling
    const camp = state.campaign;
    const heroes = camp.data.heroes;
    const wounded = new Set(camp.wounded().map((h) => h.id));
    const n = Math.max(3, Math.min(7, heroes.length + 2));
    const looks = Array.from({ length: n }, (_, i) => (i + c.x + c.y) % 6);
    const hurt = heroes.filter((h) => wounded.has(h.id)).length;
    const jobs: (() => number)[] = [];
    if (forge) {
      const f = forge;
      jobs.push(() => (life.figure(looks[0], f.x + 10, f.y + 8, 'smith'), 1));
      life.sparks(f.x + 13, f.y + 4, 9, () => life.striking(f.x + 10, f.y + 8));
    }
    if (fire) {
      const f = fire;
      jobs.push(() => (life.figure(looks[1 % n], f.x - 1, f.y + 8, 'sit', false), 1));
    }
    if (yard) {
      const y = yard;
      jobs.push(() => {
        life.figure(looks[2 % n], y.x + 5, y.y + 11, 'spar', false, 360);
        life.figure(looks[3 % n], y.x + 12, y.y + 11, 'spar', true, 410);
        return 2;
      });
    }
    if (fire) {
      const f = fire;
      jobs.push(() => (life.figure(looks[4 % n], f.x + 10, f.y + 8, 'sit', true), 1));
    }
    let used = 0;
    for (const j of jobs) if (used < n - 1) used += j();
    // the wounded rest at the tent doors
    for (let i = 0; i < Math.min(hurt, tents.length); i++) {
      life.figure(looks[(i + 5) % n], tents[i].x + 3, tents[i].y + 11, 'sit', i % 2 === 1);
      used++;
    }
    // everyone else strolls between the doors, the fire and the standard
    const route: [number, number][] = [[hx - 4, hy + 4], [hx + 6, hy + 5], ...doors];
    if (fire) route.push([fire.x + 4, fire.y + 12]);
    if (forge) route.push([forge.x + 6, forge.y + 11]);
    for (const i of c.zone) {
      if (route.length > 9) break;
      const x = i % m.w;
      const y = Math.floor(i / m.w);
      if ((x * 7 + y * 13) % 5 === 0 && !built.some((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h)) route.push([x * S + 4, y * S + 6]);
    }
    for (let i = used; i < n; i++) life.walker(looks[i % n], route, 6 + (i % 3));
  }

  /** The texture of a structure frame (made on first use). */
  private structKey(id: StructureId, f: number, look = 0): string {
    const key = `wm_struct_${id}_${id === 'tent' ? look % 4 : 0}_${f}`;
    if (!this.textures.exists(key)) this.textures.addCanvas(key, renderStructure(id, f, look).toCanvas());
    return key;
  }

  /** The construction scaffold of a structure at a stage (0..2). */
  private scaffoldKey(id: StructureId, stage: number): string {
    const key = `wm_scaf_${id}_${stage}`;
    const d = STRUCTURES[id];
    if (!this.textures.exists(key)) this.textures.addCanvas(key, renderScaffold(d.w * WTILE, d.h * WTILE, STRUCT_LIFT[id], stage).toCanvas());
    return key;
  }

  private drawCampBorder(): void {
    const g = this.campG;
    g.clear();
    const ph = this.antPhase;
    for (const p of this.campBorder) {
      if ((p.x + p.y + ph) % 2 !== 0) continue;
      g.fillStyle(MAPC.plotDot, 1);
      g.fillRect(p.x, p.y, 1, 1);
    }
  }

  private renderCampAnim(now: number, delta: number): void {
    for (const a of this.campAnim) {
      const k = a.keys[Math.floor(now / a.period) % a.keys.length];
      if (a.spr.texture.key !== k) a.spr.setTexture(k);
    }
    this.life?.update(now, delta);
    // construction: pegs -> frame -> planks -> built (with dust at each step)
    const cons = this.construct;
    if (cons) {
      const t = now - cons.t0;
      const stage = t < 380 ? 0 : t < 820 ? 1 : 2;
      if (t >= 1250) {
        this.construct = null;
        this.renderCamp();
        for (const [x, y] of footprint(cons.id, cons.x, cons.y)) this.puff(x * WTILE + 4, y * WTILE + 4);
      } else if (cons.spr?.active && stage !== cons.stage) {
        cons.stage = stage;
        cons.spr.setTexture(this.scaffoldKey(cons.id, stage));
        const d = STRUCTURES[cons.id];
        this.puff(cons.x * WTILE + (d.w * WTILE) / 2, (cons.y + d.h) * WTILE - 2);
      }
    }
    // marching ants while building
    if (this.placing && this.campBorder.length) {
      this.antTimer += delta;
      if (this.antTimer >= 120) {
        this.antTimer = 0;
        this.antPhase = (this.antPhase + 1) % 2;
        this.drawCampBorder();
      }
    }
  }

  private makeCamp(): void {
    const why = this.w.makeCamp();
    if (why) {
      hapticNotify('error');
      this.showBanner(why, 1600);
      return;
    }
    hapticNotify('success');
    this.renderCamp();
    this.puff(this.w.camp!.x * WTILE + 4, this.w.camp!.y * WTILE + 4);
    this.setWaiting(true);
    this.buildHud();
    this.showBanner('Camp pitched: build to rest better', 2200);
    void state.save();
  }

  private strikeCamp(after?: () => void): void {
    const c = this.w.camp;
    if (!c) return;
    const was = this.waiting;
    this.setWaiting(false);
    const back = Math.floor(c.built.reduce((a, b) => a + STRUCTURES[b.id].cost, 0) / 2);
    const lines = c.built.length ? [`The structures stay behind. ${back} supplies are salvaged.`] : ['Pack up and move on?'];
    confirmDialog(this, {
      title: after ? 'Strike camp and march?' : 'Strike camp?',
      lines,
      ok: 'Strike',
      okIcon: 'tent',
      onOk: () => {
        const got = this.w.breakCamp();
        this.renderCamp();
        this.buildHud();
        haptic('light');
        if (got > 0) this.showBanner(`Camp struck: +${got} supplies`, 1600);
        void state.save();
        after?.();
      },
      onCancel: () => this.setWaiting(was),
    });
  }

  private openBuildMenu(): void {
    const c = this.w.camp;
    if (!c) return;
    this.setWaiting(false);
    const { VW } = this.m;
    const rowH = 30;
    const forge = c.built.some((b) => b.id === 'forge');
    const h = 30 + STRUCTURE_LIST.length * (rowH + 2) + (forge ? 32 : 0) + 36;
    const md = openModal(this, { title: `Build  (${Math.floor(this.w.supplies)} supplies)`, w: Math.min(VW - 12, 220), h, onClose: () => (this.dialog = null) });
    this.dialog = md.c;
    const { x, w } = md;
    let y = md.body.y;
    for (const d of STRUCTURE_LIST) {
      const n = countBuilt(c, d.id);
      const spot = freeSpot(this.w.map, c, d.id);
      const why = n >= d.max ? 'Built' : this.w.supplies < d.cost ? `Needs ${d.cost} supplies` : !spot ? 'No room left' : null;
      md.c.add(addPanel(this, x + 6, y, w - 12, rowH, 'inset'));
      md.c.add(addIcon(this, x + 10, y + 9, d.icon));
      md.c.add(addText(this, x + 26, y + 4, ellipsize(`${d.name}${d.max > 1 ? ` ${n}/${d.max}` : n ? ' (built)' : ''}`, w - 90), 'ink'));
      md.c.add(addText(this, x + 26, y + 15, ellipsize(d.desc, w - 90), 'dim'));
      const b = new Button(this, x + w - 56, y + 3, 48, rowH - 6, {
        label: `${d.cost}`,
        icon: 'wood',
        variant: why ? 'secondary' : 'primary',
        tip: `${d.cost} supplies, ${d.hours}h of work`,
        onClick: () => {
          md.close();
          this.startPlacing(d.id);
        },
      });
      b.setEnabled(!why, why ?? undefined);
      md.c.add(b);
      y += rowH + 2;
    }
    if (forge) {
      md.c.add(new Button(this, x + 6, y + 2, w - 12, 26, { label: 'Temper gear at the forge', icon: 'anvil', onClick: () => (md.close(), this.openTemper()) }));
      y += 32;
    }
    md.c.add(new Button(this, x + 6, y + 4, w - 12, 26, { label: 'Close', icon: 'back', onClick: () => md.close() }));
  }

  /** The forge: temper an equipped item one rarity step finer for supplies and gold. */
  private openTemper(): void {
    const camp = state.campaign;
    const items: { item: Item; who: string; cost: { supplies: number; gold: number } }[] = [];
    for (const h of camp.data.heroes) {
      for (const it of Object.values(h.equip)) {
        const cost = it ? camp.temperCost(it) : null;
        if (it && cost) items.push({ item: it, who: h.name, cost });
      }
    }
    items.sort((a, b) => itemDef(b.item.def).value - itemDef(a.item.def).value);
    const list = items.slice(0, 6);
    const { VW } = this.m;
    const rowH = 28;
    const h = 30 + Math.max(1, list.length) * (rowH + 2) + 36;
    const md = openModal(this, { title: 'Temper gear', w: Math.min(VW - 12, 220), h, onClose: () => (this.dialog = null) });
    this.dialog = md.c;
    const { x, w } = md;
    let y = md.body.y;
    if (!list.length) {
      md.c.add(addText(this, VW / 2, y + 8, 'Nothing left to temper', 'dim', 0.5));
      y += rowH + 2;
    }
    for (const e of list) {
      const def = itemDef(e.item.def);
      md.c.add(addPanel(this, x + 6, y, w - 12, rowH, 'inset'));
      md.c.add(addText(this, x + 10, y + 4, ellipsize(`${def.name} (${e.item.rarity})`, w - 80), 'ink'));
      md.c.add(addText(this, x + 10, y + 15, ellipsize(`${e.who} - ${e.cost.supplies} supplies`, w - 80), 'dim'));
      const can = this.w.supplies >= e.cost.supplies && camp.data.gold >= e.cost.gold;
      const b = new Button(this, x + w - 62, y + 3, 54, rowH - 6, {
        label: `${e.cost.gold}`,
        icon: 'coin',
        variant: can ? 'primary' : 'secondary',
        onClick: () => {
          if (!camp.temper(e.item)) return;
          hapticNotify('success');
          md.close();
          this.showBanner(`${def.name} tempered`, 1600);
          this.refreshHud();
          void state.save();
        },
      });
      b.setEnabled(can, this.w.supplies < e.cost.supplies ? `Needs ${e.cost.supplies} supplies` : 'Not enough gold');
      md.c.add(b);
      y += rowH + 2;
    }
    md.c.add(new Button(this, x + 6, y + 4, w - 12, 26, { label: 'Close', icon: 'back', onClick: () => md.close() }));
  }

  private startPlacing(id: StructureId): void {
    const c = this.w.camp;
    if (!c) return;
    const at = freeSpot(this.w.map, c, id) ?? { x: c.x, y: c.y };
    this.placing = { id, x: at.x, y: at.y };
    this.setWaiting(false);
    this.drawGhost();
    this.buildHud();
  }

  private cancelPlacing(): void {
    this.placing = null;
    this.drawGhost();
    this.antPhase = 0;
    this.drawCampBorder();
    this.buildHud();
  }

  private drawGhost(): void {
    for (const o of this.ghost) o.destroy();
    this.ghost = [];
    const p = this.placing;
    const c = this.w.camp;
    if (!p || !c) return;
    const chk = placeCheck(this.w.map, c, p.id, p.x, p.y);
    for (const t of chk.tiles) {
      const img = this.add.image(t.x * WTILE, t.y * WTILE, t.ok ? 'wm_tile_ok' : 'wm_tile_bad').setOrigin(0, 0).setDepth(D_GHOST);
      this.layer.add(img);
      this.ghost.push(img);
    }
    const key = this.structKey(p.id, 0);
    const spr = this.add.image(p.x * WTILE - STRUCT_PAD[p.id], p.y * WTILE - STRUCT_LIFT[p.id], key).setOrigin(0, 0).setDepth(D_GHOST + 1).setAlpha(0.6).setTint(chk.ok ? 0x7fd0e0 : 0xe08088);
    this.layer.add(spr);
    this.ghost.push(spr);
  }

  /** Move the placement ghost so the footprint centres on tile (tx, ty). */
  private moveGhost(tx: number, ty: number): void {
    const p = this.placing;
    if (!p) return;
    const d = STRUCTURES[p.id];
    const nx = tx - Math.floor((d.w - 1) / 2);
    const ny = ty - Math.floor((d.h - 1) / 2);
    if (nx === p.x && ny === p.y) return;
    p.x = nx;
    p.y = ny;
    this.drawGhost();
  }

  private confirmPlacing(): void {
    const p = this.placing;
    if (!p) return;
    const why = this.w.build(p.id, p.x, p.y);
    if (why) {
      hapticNotify('error');
      this.showBanner(why, 1400);
      return;
    }
    const d = STRUCTURES[p.id];
    this.placing = null;
    this.drawGhost();
    this.construct = { id: p.id, x: p.x, y: p.y, t0: this.time.now };
    this.renderCamp();
    for (const [x, y] of footprint(p.id, p.x, p.y)) this.puff(x * WTILE + 4, y * WTILE + 4);
    hapticNotify('success');
    this.passTime(d.hours);
    this.buildHud();
    this.showBanner(`${d.name} built (${d.hours}h)`, 1600);
    void state.save();
  }

  /** Let `hours` pass at once (building work); a band may turn up meanwhile. */
  private passTime(hours: number): void {
    const r = this.w.advance(hours, this.info, true);
    state.campaign.tickWorld(r.hours);
    const ev = r.events[0];
    if (ev?.type === 'encounter') this.openEncounter(ev.party, ev.byPlayer);
    this.refreshHud();
  }

  /** Build dust: a three-frame cream puff. */
  private puff(x: number, y: number): void {
    const s = this.add.sprite(x, y, 'wm_dust', 0).setOrigin(0.5, 0.6).setDepth(D_GHOST + 2);
    this.layer.add(s);
    let f = 0;
    this.time.addEvent({
      delay: 110,
      repeat: 3,
      callback: () => {
        f++;
        if (f >= 3) s.destroy();
        else s.setFrame(f);
      },
    });
  }

  // ================================================================ HUD

  buildHud(): void {
    const H = this.hud;
    H.removeAll(true);
    const { VW, VH } = this.m;
    const top = 42;
    H.add(addPanel(this, 0, 0, VW, top, 'parch'));
    if (this.inGameBack) H.add(new Button(this, 3, 3, 24, 24, { icon: 'back', onClick: () => this.leaveToMenu() }));
    const tx = this.inGameBack ? 31 : 6;
    this.clockText = addText(this, tx, 5, '', 'red');
    this.regionText = addText(this, tx, 16, '', 'dim');
    H.add([this.clockText, this.regionText]);
    H.add(addIcon(this, VW - 72, 3, 'coin'));
    this.goldText = addText(this, VW - 58, 5, '', 'ink');
    H.add(addIcon(this, VW - 72, 15, 'people'));
    this.armyText = addText(this, VW - 58, 17, '', 'ink');
    H.add([this.goldText, this.armyText]);
    // provisions row
    H.add(addIcon(this, 6, 27, 'food'));
    this.foodText = addText(this, 20, 29, '', 'ink');
    H.add(addIcon(this, VW - 72, 27, 'wood'));
    this.supplyText = addText(this, VW - 58, 29, '', 'ink');
    H.add([this.foodText, this.supplyText]);
    this.followBtn = new Button(this, VW - 28, 3, 25, 24, { icon: 'eye', style: this.follow ? 'buttonSel' : 'button', onClick: () => this.toggleFollow() });
    H.add(this.followBtn);

    const by = VH - 34;
    H.add(addPanel(this, 0, by - 16, VW, VH - by + 16, 'parch'));
    this.hintText = addText(this, VW / 2, by - 12, '', 'ink', 0.5);
    H.add(this.hintText);
    addSyncBadge(this, H, VW - 15, top + 3);
    const camp = state.campaign;
    const pending = camp.data.heroes.some((h) => h.points > 0 || h.perks.length < perkSlots(h.level));
    const party = { label: pending ? 'Party !' : 'Party', icon: 'people', onClick: () => this.scene.start('Army', { from: 'World' }) };
    type B = { label: string; icon: string; sel?: boolean; onClick: () => void };
    let row: B[];
    this.waitBtn = null;
    if (this.placing) {
      row = [
        { label: 'Cancel', icon: 'close', onClick: () => this.cancelPlacing() },
        { label: 'Place', icon: 'check', sel: true, onClick: () => this.confirmPlacing() },
      ];
    } else if (this.w.camp) {
      row = [
        party,
        { label: 'Build', icon: 'plus', onClick: () => this.openBuildMenu() },
        { label: this.waiting ? 'Pause' : 'Rest', icon: this.waiting ? 'pause' : 'hourglass', sel: this.waiting, onClick: () => this.setWaiting(!this.waiting) },
        { label: 'Strike', icon: 'tent', onClick: () => this.strikeCamp() },
      ];
    } else {
      row = [party, { label: 'Camp', icon: 'tent', onClick: () => this.makeCamp() }, { label: 'Stop', icon: 'hold', onClick: () => this.stopTravel() }];
    }
    const gap = 3;
    const bw = Math.floor((VW - 8 - gap * (row.length - 1)) / row.length);
    row.forEach((b, i) => {
      const btn = new Button(this, 4 + i * (bw + gap), by, bw, 28, { label: b.label, icon: b.icon, style: b.sel ? 'buttonSel' : 'button', onClick: b.onClick });
      if (b.icon === 'pause' || b.icon === 'hourglass') this.waitBtn = btn;
      H.add(btn);
    });
    this.refreshHud();
  }

  refreshHud(): void {
    if (!this.clockText) return;
    const camp = state.campaign;
    const s = this.w.s;
    const day = Math.floor(s.time / 24) + 1;
    const h = Math.floor(s.time % 24);
    const room = this.m.VW - 76 - this.clockText.x;
    this.clockText.setText(ellipsize(`Day ${day}  ${String(h).padStart(2, '0')}:00${h >= 21 || h < 5 ? ' night' : ''}`, room));
    const d = dangerAt(this.w.map, s.x, s.y);
    this.regionText.setText(ellipsize(this.w.camp ? `Camp - ${regionName(this.w.map, s.x, s.y)}` : `${regionName(this.w.map, s.x, s.y)} - ${d < 0.3 ? 'safe' : d < 0.6 ? 'risky' : 'wild'}`, room));
    this.goldText.setText(`${camp.data.gold}`);
    const wounded = camp.wounded().length;
    this.armyText.setText(`${camp.data.heroes.length - wounded}/${camp.data.heroes.length}`);
    const mouths = camp.data.heroes.length;
    const days = this.w.foodDays(mouths);
    this.foodText.setFont(this.w.starving ? 'font_red' : 'font_ink');
    this.foodText.setText(ellipsize(this.w.starving ? 'Starving!' : `${Math.floor(this.w.food)} food (${days < 1 ? '<1' : Math.floor(days)}d)`, this.m.VW - 96));
    this.supplyText.setText(`${Math.floor(this.w.supplies)}`);
    let hint = 'Tap the map to march, a town to enter';
    const c = this.w.camp;
    if (this.placing) hint = 'Tap inside the camp to move it';
    else if (c) {
      const fx = campEffects(this.w.map, c);
      const net = fx.forage * 24 - mouths;
      hint = `${this.waiting ? 'Resting' : 'Camp'}: heal x${this.w.healRate().toFixed(1)}, food ${net >= 0 ? '+' : ''}${net.toFixed(0)}/day`;
    } else if (this.w.starving) hint = 'No food! Slow march, wounds barely heal';
    else if (s.destParty >= 0) {
      const p = this.w.party(s.destParty);
      hint = p ? `Pursuing ${p.name}` : hint;
    } else if (s.destSettlement >= 0) hint = `Marching to ${this.w.settlement(s.destSettlement)?.name ?? ''}`;
    else if (this.w.moving) hint = 'On the march';
    else if (days < 1.5) hint = 'Food runs low: buy rations in a village';
    this.hintText.setText(ellipsize(hint, this.m.VW - 10));
  }

  private setWaiting(on: boolean): void {
    this.waiting = on;
    if (on) this.w.stop();
    if (this.waitBtn) {
      this.waitBtn.setSelected(on).setLabel(on ? 'Pause' : 'Rest');
    }
    this.refreshHud();
  }

  private stopTravel(): void {
    this.w.stop();
    this.setWaiting(false);
    haptic('light');
  }

  private toggleFollow(): void {
    this.follow = !this.follow;
    this.followBtn.setSelected(this.follow);
  }

  private showBanner(msg: string, ms: number): void {
    this.banner?.destroy();
    const { VW } = this.m;
    const c = this.add.container(0, 0);
    const t = addText(this, VW / 2, 50, ellipsize(msg, VW - 30), 'red', 0.5);
    const wdt = Math.min(VW - 8, Math.max(80, t.width + 20));
    c.add(addPanel(this, Math.round((VW - wdt) / 2), 45, wdt, 18, 'parch'));
    c.add(t);
    this.ui.add(c);
    this.banner = c;
    this.time.delayedCall(ms, () => {
      if (this.banner === c) {
        c.destroy();
        this.banner = null;
      }
    });
  }

  private leaveToMenu(): void {
    void state.save();
    this.scene.start('Menu');
  }

  private enterSettlement(id: number): void {
    this.w.stop();
    this.w.s.inside = id;
    void state.save();
    hapticNotify('success');
    this.scene.start('Settlement', { id });
  }

  // ================================================================ input

  private onDown(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    const down = this.input.manager.pointers.filter((q) => q.isDown);
    if (down.length >= 2) {
      this.gesture = null;
      const [a, b] = down;
      this.pinch = { d0: Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y), z0: this.cameras.main.zoom, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      return;
    }
    if (over.length > 0 || this.dialog) {
      this.gesture = null;
      return;
    }
    this.gesture = { mode: 'pending', id: p.id, sx: p.x, sy: p.y, lx: p.x, ly: p.y };
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const cam = this.cameras.main;
    if (this.pinch) {
      const down = this.input.manager.pointers.filter((q) => q.isDown);
      if (down.length < 2) return;
      const [a, b] = down;
      const d = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
      const z = Phaser.Math.Clamp(this.pinch.z0 * (d / Math.max(1, this.pinch.d0)), 1, 4);
      cam.setZoom(z);
      return;
    }
    // hover (mouse): the placement ghost follows the pointer
    if (this.placing && !p.isDown && !p.wasTouch) {
      const wp = cam.getWorldPoint(p.x, p.y);
      this.moveGhost(Math.floor(wp.x / WTILE), Math.floor(wp.y / WTILE));
    }
    const g = this.gesture;
    if (!g || p.id !== g.id || !p.isDown) return;
    if (g.mode === 'pending' && Math.abs(p.x - g.sx) + Math.abs(p.y - g.sy) > 12) g.mode = 'pan';
    if (g.mode === 'pan') {
      if (this.follow) this.toggleFollow();
      cam.scrollX -= (p.x - g.lx) / cam.zoom;
      cam.scrollY -= (p.y - g.ly) / cam.zoom;
    }
    g.lx = p.x;
    g.ly = p.y;
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (this.pinch) {
      if (this.input.manager.pointers.filter((q) => q.isDown).length < 2) {
        this.pinch = null;
        this.setZoom(Math.round(this.cameras.main.zoom));
      }
      this.gesture = null;
      return;
    }
    const g = this.gesture;
    this.gesture = null;
    if (!g || p.id !== g.id || g.mode !== 'pending') return;
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    this.tapWorld(wp.x, wp.y);
  }

  private setZoom(z: number): void {
    this.tweens.add({ targets: this.cameras.main, zoom: Phaser.Math.Clamp(z, 1, 4), duration: 120 });
  }

  /** Tap at world pixel (x, y): a band, a settlement, or a spot to march to. */
  tapWorld(x: number, y: number): void {
    if (this.cine) return;
    const tx = Math.floor(x / WTILE);
    const ty = Math.floor(y / WTILE);
    if (this.placing) {
      this.moveGhost(tx, ty);
      haptic('light');
      return;
    }
    const c = this.w.camp;
    if (c) {
      const m = this.w.map;
      if (c.zone.includes(ty * m.w + tx)) {
        const b = c.built.find((q) => footprint(q.id, q.x, q.y).some(([fx, fy]) => fx === tx && fy === ty));
        this.showBanner(b ? `${STRUCTURES[b.id].name}: ${STRUCTURES[b.id].desc}` : 'Your camp: tap Build to add to it', 1800);
        return;
      }
      this.strikeCamp(() => this.tapWorld(x, y));
      return;
    }
    // bands first (they stand on top)
    let band: PartyState | null = null;
    let bd = 9;
    for (const p of this.w.s.parties) {
      if (!this.explored(p.x, p.y)) continue;
      const d = Math.hypot(p.x * WTILE - x, p.y * WTILE - 4 - y);
      if (d < bd) {
        bd = d;
        band = p;
      }
    }
    if (band) {
      const ratio = band.power / Math.max(1, this.info.power);
      this.showBanner(`${band.name}: ${band.size} men, ${THREAT_LABEL[threatLevel(ratio)]}`, 1800);
      this.setWaiting(false);
      this.w.setDestination(Math.floor(band.x), Math.floor(band.y), -1, band.id);
      haptic('light');
      this.refreshHud();
      return;
    }
    let set: SettlementDef | null = null;
    let sd = 11;
    for (const s of this.w.map.settlements) {
      if (!this.w.isExplored(s.x, s.y)) continue;
      let d = Math.hypot(s.x * WTILE + 4 - x, s.y * WTILE - y);
      // anywhere on the town's (or village's) picture counts too
      const site = this.siteOf(s.id);
      if (site && x > site.x + 4 && x < site.x + site.w - 4 && y > site.y + 4 && y < site.y + site.h - 2) d = Math.min(d, 10);
      if (d < sd) {
        sd = d;
        set = s;
      }
    }
    this.setWaiting(false);
    if (set) {
      if (set.kind === 'lair') {
        this.showBanner(`${set.name}: bands gather here`, 1600);
        this.w.setDestination(set.x, set.y + 1);
      } else if (Math.floor(this.w.s.x) === set.x && Math.floor(this.w.s.y) === set.y) {
        this.enterSettlement(set.id);
        return;
      } else this.w.setDestination(set.x, set.y, set.id);
    } else if (!this.w.setDestination(tx, ty)) {
      hapticNotify('error');
      this.showBanner('No way there', 1200);
      return;
    }
    haptic('light');
    if (!this.follow) this.toggleFollow();
    this.refreshHud();
  }

  // ================================================================ encounters

  private closeDialog(): void {
    this.dialog?.destroy();
    this.dialog = null;
  }

  openEncounter(partyId: number, byPlayer: boolean, failedFlee = false): void {
    const camp = state.campaign;
    const p = this.w.party(partyId);
    if (!p) return;
    this.closeDialog();
    this.info = camp.playerInfo();
    const { VW, VH } = this.m;
    const c = this.add.container(0, 0);
    this.ui.add(c);
    this.dialog = c;
    c.add(this.add.rectangle(0, 0, VW, VH, 0x000000, 0.5).setOrigin(0, 0).setInteractive());
    const w = VW - 20;
    const x = 10;
    const ratio = p.power / Math.max(1, this.info.power);
    const lvl = threatLevel(ratio);
    const mood = failedFlee
      ? 'They cut off your escape!'
      : byPlayer
        ? ratio < WORLD_RULES.surrenderRatio
          ? 'Cornered, they throw down their arms.'
          : 'You have caught up with them.'
        : this.w.camp
          ? 'They fall upon your camp!'
          : 'They bar your way, weapons drawn!';
    const advice = ratio > 1.15 ? 'A hard fight. Consider fleeing or resting.' : ratio < 0.85 ? 'You should win this one.' : 'An even match.';
    // Lay the text out first (wrapped and fitted), then size the dialog around it.
    const moodL = wrapText(mood, w - 56, 2).lines;
    const adviceL = wrapText(advice, w - 12, 2).lines;
    const armyY = Math.max(64, 46 + moodL.length * LINE_H + 4);
    const adviceY = armyY + 14;
    const h = adviceY + adviceL.length * LINE_H + 8 + 34;
    const y = Math.max(4, Math.round(VH / 2 - h / 2 - 10));
    c.add(addPanel(this, x, y, w, h, 'parch'));
    c.add(addText(this, VW / 2, y + 7, ellipsize(p.name, w - 12), 'red', 0.5));
    // the band's standard, large
    const tex = p.name === 'Pirates' ? 'wm_band_pirates' : `wm_band_${p.kind}`;
    c.add(this.add.image(x + 26, y + 58, tex, 0).setScale(3).setOrigin(0.5, 1));
    c.add(this.add.rectangle(x + 50, y + 22, 8, 8, THREAT_COLOR[lvl]).setOrigin(0, 0).setStrokeStyle(1, P.outline));
    c.add(addText(this, x + 62, y + 22, ellipsize(`${THREAT_LABEL[lvl]} - ${p.size} men`, w - 68), 'ink'));
    c.add(addText(this, x + 50, y + 33, ellipsize(`${CULTURE_LABEL[p.culture]}, about Lv ${p.level}`, w - 56), 'dim'));
    c.add(addText(this, x + 50, y + 46, moodL.join('\n'), 'ink'));
    const fit = camp.fitHeroes().length;
    const wounded = camp.wounded().length;
    c.add(addText(this, x + 8, y + armyY, ellipsize(`Your army: ${fit} fit${wounded ? `, ${wounded} wounded` : ''}`, w - 16), 'dim'));
    const adviceT = addText(this, VW / 2, y + adviceY, adviceL.join('\n'), ratio > 1.15 ? 'red' : 'ink', 0.5);
    adviceT.setCenterAlign();
    c.add(adviceT);
    const buttons: { label: string; icon: string; sel?: boolean; cb: () => void }[] = [];
    buttons.push({ label: 'Attack', icon: 'swords', sel: true, cb: () => this.attack(p.id) });
    if (camp.canSurrender(p.id) && !failedFlee) {
      buttons.push({
        label: 'Take ransom',
        icon: 'coin',
        cb: () => {
          const g = camp.acceptSurrender(p.id);
          this.closeDialog();
          hapticNotify('success');
          this.showBanner(`They pay ${g} gold and scatter`, 2200);
          void state.save();
          this.refreshHud();
        },
      });
    }
    if (!failedFlee) {
      if (byPlayer && ratio < WORLD_RULES.chaseRatio) {
        buttons.push({
          label: 'Let them go',
          icon: 'back',
          cb: () => {
            p.idle = 1;
            this.w.s.safeUntil = this.w.s.time + 1;
            this.closeDialog();
          },
        });
      } else {
        const chance = Math.round(camp.fleeChance(p.id) * 100);
        buttons.push({
          label: `Flee ${chance}%`,
          icon: 'fallback',
          cb: () => {
            if (camp.tryFlee(p.id)) {
              this.closeDialog();
              hapticNotify('warning');
              this.showBanner('You slip away!', 1800);
              void state.save();
            } else {
              hapticNotify('error');
              this.openEncounter(p.id, byPlayer, true);
            }
          },
        });
      }
    }
    // Back may only take the peaceful way out ("Let them go"); a band barring the road can't be dodged by it.
    const out = buttons.find((b) => b.icon === 'back');
    this.modalLayer(c, () => (out ? out.cb() : (hapticNotify('warning'), false)));
    const bw = Math.floor((w - 12 - (buttons.length - 1) * 4) / buttons.length);
    buttons.forEach((b, i) => c.add(new Button(this, x + 6 + i * (bw + 4), y + h - 34, bw, 28, { label: b.label, icon: b.icon, style: b.sel ? 'buttonSel' : 'button', onClick: b.cb })));
  }

  attack(partyId: number): void {
    const camp = state.campaign;
    const p = this.w.party(partyId);
    const enemy = camp.partyEnemy(partyId);
    if (!p || !enemy) return;
    const beast = encounterOf(enemy.heroes);
    state.pending = { enemy, seed: randomSeed(), partyId, label: beast ? encounterName(beast) : p.name, site: siteAt(this.w.map, this.w.s.x, this.w.s.y) };
    void state.save();
    this.scene.start('Battle');
  }
}
