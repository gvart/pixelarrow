import { encounterOf } from '../data/beasts';
import { encounterName } from '../ui/beastInfo';
import Phaser from 'phaser';
import { RS, camZoom, zoomUnits } from '../platform/renderScale';
import { BaseScene } from './BaseScene';
import { addIcon, addText } from '../ui/kit';
import { MActionBar, MIconButton, SituationLine, TOPBAR_H, addSubShell, gearAction, mosaicImage, mtext, mw, wrapWords, GAP, TAP, type BarSlot, type SituationChip } from '../ui/mosaic';
import { t, tOr, type TKey } from '../i18n';
import { wrapsWhole } from '../ui/textfit';
import { TEXT_MIN } from '../ui/tokens';
import {
  BAND_COLORS, MAPC, PARTY_FH, PARTY_FOOT, PARTY_FRAMES, PARTY_FW, STRUCT_FRAMES, STRUCT_FX, STRUCT_LIFT, STRUCT_PAD, WTILE, renderBoat, renderCampZone,
  renderDust, renderMarker, renderNamePlate, renderPartyFigure, renderStructure,
} from '../art/worldArt';
import { renderWorldMap, type SiteArt, type WorldMapArt } from '../art/overlandMap';
import { OverlandLife } from '../ui/overlandLife';
import { FOG_CHUNK, FogPainter } from '../art/fogArt';
import { P } from '../art/palette';
import { state, randomSeed } from '../state';
import { haptic, hapticNotify } from '../platform/telegram';
import { CULTURE_LABEL } from '../data/names';
import { addSyncBadge, playerPartyTexture } from '../ui/online';
import { online } from '../platform/cloud';
import type { SyncStatus } from '../platform/online';
import { perkSlots } from '../data/perks';
import { dangerAt, isWater, type SettlementDef, type WorldMap } from '../world/map';
import { siteAt } from '../world/battlefield';
import { STRUCTURES, campEffects, footprint, type StructureId } from '../world/camp';
import { THREAT_COLOR, WORLD_RULES, hasCaptain, partyArmy, threatLevel, type PartyState, type PlayerInfo, type World } from '../world/world';
import { isCaptain } from '../sim/stats';
import { confirmDialog } from '../ui/widgets';
import { CampLife } from '../ui/campLife';
import { uiId } from '../ui/layout';
import { motion } from '../ui/motion';
import { openEventCard, openJournalSheet, type EventCardHandle } from '../ui/sheets/eventCard';
import { openEncounterSheet, worldGlyph, type EncounterChoice, type EncounterHandle } from '../ui/sheets/encounter';

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

/** world/map.ts TERRAIN_NAMES, in words of the current language. */
const TERRAIN_KEYS = ['deepSea', 'sea', 'shore', 'plain', 'scrub', 'forest', 'hills', 'mountains'] as const;

/** Where the army stands, translated (world/map.ts regionName's rule: a road, a ford, else the terrain). */
export function regionLabel(m: WorldMap, x: number, y: number): string {
  const tx = Math.max(0, Math.min(m.w - 1, Math.floor(x)));
  const ty = Math.max(0, Math.min(m.h - 1, Math.floor(y)));
  const i = ty * m.w + tx;
  const k = m.road[i] ? 'road' : m.river[i] ? 'ford' : TERRAIN_KEYS[m.terrain[i]] ?? 'plain';
  return t(`wld.region.${k}` as TKey);
}

/** A band's name (world.ts BAND_NAMES; a lair garrison keeps its lair's proper name). */
const BAND_KEYS: Record<string, TKey> = { Bandits: 'wld.band.bandits', 'Galatae raiders': 'wld.band.raiders', Mercenaries: 'wld.band.mercs', Pirates: 'wld.band.pirates', "The Tyrant's host": 'wld.band.host' };
export const bandName = (name: string): string => (BAND_KEYS[name] ? t(BAND_KEYS[name]) : name);

/** Why the army can't camp (world campBlocker's English reasons), in words of the current language. */
export function campWhy(why: string): string {
  const fixed: Record<string, TKey> = { 'Already camped': 'wld.camp.already', 'Not inside a settlement': 'wld.camp.inside', 'No ground to camp on': 'wld.camp.noGround', 'Too close to their camp': 'wld.camp.tooCloseLair', 'Too cramped to camp here': 'wld.camp.cramped' };
  if (fixed[why]) return t(fixed[why]);
  const near = /^Too close to (.+)$/.exec(why);
  return near ? t('wld.camp.tooClose', { name: near[1] }) : why;
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

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
  private sit: SituationLine | null = null;
  private topC!: Phaser.GameObjects.Container;
  private topKey = '';
  private sitKey = '';
  private strip: MActionBar | null = null;
  private stripKey = '';
  private followBtn!: MIconButton;
  /** The open encounter sheet (the map is paused while it is up). */
  private encounter: EncounterHandle | null = null;
  /** The same sheet once it has risen into place (scripts and the layout check wait for it). */
  dialog: EncounterHandle | null = null;
  /** The open event card (campaign-events.md R4): the map is paused while it is up. */
  private eventCard: EventCardHandle | null = null;
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
  private campAnim: { spr: Phaser.GameObjects.Image; keys: string[]; period: number }[] = [];
  private campZoneKey = '';
  private life: CampLife | null = null;

  constructor() {
    super('World');
  }

  create(data: { encounter?: number }): void {
    this.bands = new Map();
    this.encounter = null;
    this.dialog = null;
    this.eventCard = null;
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
    this.fogAnim = new Set();
    this.settlementObjs = new Map();
    this.sit = null;
    this.strip = null;
    this.sitKey = '';
    this.stripKey = '';
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
    cam.setZoom(camZoom(2));
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
    this.input.on('wheel', (_p: unknown, _o: unknown[], _dx: number, dy: number) => this.setZoom(Math.round(zoomUnits(cam.zoom)) + (dy > 0 ? -1 : 1)));
    this.screen({ back: () => this.leaveToMenu() });
    this.events.once('shutdown', () => void state.save());

    // Discoveries made outside the map (none expected) are not replayed.
    this.w.discoveries = [];
    this.renderWorld(0);
    if (data?.encounter !== undefined && this.w.party(data.encounter)) this.openEncounter(data.encounter, true);
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
    // dark ink on a light plate (WLD-3: the old red-on-pink town label was under 3:1)
    const font = s.kind === 'lair' ? 'pSec' : 'pInk';
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
      if (s.kind === 'lair') this.showBanner(t('wld.spotted', { name: s.name }));
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
    this.showBanner(t('wld.found', { name: s.name }));
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
    // a pending event always has its card (R4.2: no time passes until it is answered); an encounter goes first
    if (!this.eventCard && !this.encounter && this.w.s.pendingEvent) this.openEvent();
    const busy = this.encounter || this.cine || this.eventCard;
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
      if (ev?.type === 'event' && !this.encounter) this.openEvent();
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
    const moving = this.w.moving && !this.encounter && !this.cine && !this.eventCard;
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
      const crest = hasCaptain(p);
      const key = `${p.size}_${lvl}_${crest ? 1 : 0}`;
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
        // the men on the threat colour, with the threat's shape (G13) and the captain's crest (ai-doctrines.md)
        const label = `${p.size}`;
        const tw = label.length * 5 + 3;
        const wdt = tw + 9 + (crest ? 8 : 0);
        const x0 = -Math.round(wdt / 2);
        v.plate.add(this.add.rectangle(0, 0, wdt, 9, P.outline).setOrigin(0.5, 1));
        v.plate.add(this.add.rectangle(0, -1, wdt - 2, 7, THREAT_COLOR[lvl]).setOrigin(0.5, 1));
        v.plate.add(this.add.image(x0 + 2, -8, worldGlyph(this, lvl)).setOrigin(0, 0));
        v.plate.add(addText(this, x0 + 8 + tw / 2, -9, label, 'title', 0.5));
        if (crest) v.plate.add(this.add.image(x0 + wdt - 8, -8, worldGlyph(this, 'crest')).setOrigin(0, 0));
      }
      const bx = p.x * WTILE;
      const by = p.y * WTILE;
      if (p.x < v.lastX - 0.01) v.flip = true;
      else if (p.x > v.lastX + 0.01) v.flip = false;
      const walking = Math.abs(p.x - v.lastX) > 1e-4 && !this.encounter;
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
    for (const b of c.built) {
      const d = STRUCTURES[b.id];
      const look = b.id === 'tent' ? tentN++ : 0;
      const footY = (b.y + d.h) * S - 1;
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

  private drawCampBorder(): void {
    const g = this.campG;
    g.clear();
    for (const p of this.campBorder) {
      if ((p.x + p.y) % 2 !== 0) continue;
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
  }

  private makeCamp(): void {
    const why = this.w.makeCamp();
    if (why) {
      hapticNotify('error');
      this.showBanner(campWhy(why), true);
      return;
    }
    hapticNotify('success');
    this.renderCamp();
    this.puff(this.w.camp!.x * WTILE + 4, this.w.camp!.y * WTILE + 4);
    this.setWaiting(true);
    this.buildHud();
    this.showBanner(t('wld.campPitched'));
    void state.save();
  }

  private strikeCamp(after?: () => void): void {
    const c = this.w.camp;
    if (!c) return;
    const was = this.waiting;
    this.setWaiting(false);
    const back = Math.floor(c.built.reduce((a, b) => a + STRUCTURES[b.id].cost, 0) / 2);
    const lines = [c.built.length ? t('wld.strike.salvage', { n: back }) : t('wld.strike.pack')];
    confirmDialog(this, {
      title: t(after ? 'wld.strike.qMarch' : 'wld.strike.q'),
      lines,
      ok: t('wld.strike.ok'),
      okIcon: 'tent',
      onOk: () => {
        const got = this.w.breakCamp();
        this.renderCamp();
        this.buildHud();
        haptic('light');
        if (got > 0) this.showBanner(t('wld.strike.done', { n: got }));
        void state.save();
        after?.();
      },
      onCancel: () => this.setWaiting(was),
    });
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
    // the top bar (back arrow, day and place), then the situation line and its chips under it
    this.topC = this.add.container(0, 0);
    H.add(this.topC);
    this.topKey = '';
    this.sit = new SituationLine(this, 4, TOPBAR_H + 2, VW - 8, { compact: VH < 240, id: 'world.situation' });
    H.add(this.sit);
    this.buildFollow();
    this.syncBadge(H, 8, this.sit.y + this.sit.h + 8);
    this.strip = new MActionBar(this, VW, VH);
    H.add(this.strip);
    this.strip.set(this.stripSlots());
    this.refreshHud();
  }

  /** The cloud badge under the situation line, only while the cloud save fails (E093; as the Campaign hub's). */
  private syncBadge(parent: Phaser.GameObjects.Container, x: number, y: number): void {
    let badge: Phaser.GameObjects.Image | null = null;
    const apply = (st: SyncStatus) => {
      if (st === 'offline' && !badge?.active) badge = addSyncBadge(this, parent, x, y);
      else if (st !== 'offline' && badge) {
        badge.destroy();
        badge = null;
      }
    };
    apply(online.status);
    const off = online.onStatus(apply);
    this.events.once('shutdown', off);
    parent.once('destroy', off);
  }

  /** The follow-the-party eye under the situation line, at the right. */
  private buildFollow(): void {
    this.followBtn?.destroy();
    const sit = this.sit!;
    this.followBtn = new MIconButton(this, this.m.VW - 4 - 24, sit.y + sit.h + 3, 24, 24, { icon: 'eye', label: t('battle.strip.follow'), variant: this.follow ? 'lit' : 'neutral', tip: t('battle.tip.follow'), id: 'world.follow', onClick: () => this.toggleFollow() });
    this.hud.add(this.followBtn);
  }

  /** The top bar: the back arrow to the Campaign hub (Menu), "Day N · place", the journal and ⚙ (D9). */
  private buildTop(title: string): void {
    this.topC.removeAll(true);
    addSubShell(this, {
      map: true,
      parent: this.topC,
      title,
      id: 'world.topbar',
      // the journal (campaign-events.md "Journal"); WLD-02 moves it into the Arc sheet behind the arc chip
      actions: [{ icon: 'log', label: t('evc.journal'), onClick: () => this.openJournal() }, gearAction(this)],
      back: this.inGameBack ? () => this.leaveToMenu() : undefined,
    });
  }

  /** The command strip: Camp | Rest / Stop | Party. The way back is the top bar's arrow. */
  private stripSlots(): BarSlot[] {
    const camp = state.campaign;
    // the badge counts the men with points or a perk to take (G11)
    const pending = camp.data.heroes.filter((h) => h.points > 0 || h.perks.length < perkSlots(h.level)).length;
    const party: BarSlot = { label: t('world.strip.party'), icon: 'people', badge: pending, tip: t('world.strip.partyTip'), id: 'world.party', onClick: () => this.scene.start('Army', { from: 'World' }) };
    if (this.w.camp) {
      return [
        { label: t('world.strip.camp'), icon: 'tent', primary: true, tip: t('world.strip.enterTip'), id: 'world.camp', onClick: () => this.scene.start('Camp', { mode: 'field' }) },
        this.waiting
          ? { label: t('battle.strip.pause'), icon: 'pause', selected: true, tip: t('world.strip.restTip'), id: 'world.rest', onClick: () => this.setWaiting(false) }
          : { label: t('world.strip.rest'), icon: 'hourglass', tip: t('world.strip.restTip'), id: 'world.rest', onClick: () => this.setWaiting(true) },
        party,
      ];
    }
    return [
      { label: t('world.strip.camp'), icon: 'tent', tip: t('world.strip.campTip'), id: 'world.camp', onClick: () => this.makeCamp() },
      ...(this.w.moving ? [{ label: t('world.strip.stop'), icon: 'hold', id: 'world.stop', onClick: () => this.stopTravel() }] : []),
      party,
    ];
  }

  refreshHud(): void {
    if (!this.sit?.active) return;
    const camp = state.campaign;
    const s = this.w.s;
    const day = Math.floor(s.time / 24) + 1;
    const h = Math.floor(s.time % 24);
    const d = dangerAt(this.w.map, s.x, s.y);
    const region = regionLabel(this.w.map, s.x, s.y);
    const hh = `${String(h).padStart(2, '0')}:00${h >= 21 || h < 5 ? ` ${t('world.night')}` : ''}`;
    // the top bar says the day and the place; the line says the hour, the danger and what to do. On a narrow
    // screen where "Day n · place" would be cut beside the journal and ⚙, the day moves to the line.
    const fullTitle = t('mosaic.cmap.title', { d: day, region });
    const side = 2 * (TAP + GAP) - GAP + 2;
    const dayUp = mw(fullTitle.toUpperCase(), 'rCream', TEXT_MIN) <= this.m.VW - side * 2 - 12;
    const topTitle = dayUp ? fullTitle : region;
    const danger = t(d < 0.3 ? 'world.safe' : d < 0.6 ? 'world.risky' : 'world.wild');
    const where = this.w.camp ? t(dayUp ? 'wld.whereCamp' : 'wld.whereCampDay', { d: day, h: hh }) : t(dayUp ? 'wld.where' : 'wld.whereDay', { d: day, h: hh, danger });
    const wounded = camp.wounded().length;
    const mouths = camp.data.heroes.length;
    const days = this.w.foodDays(mouths);
    let hint = t('world.sit.hint');
    let idle = false;
    let urgent = false;
    const c = this.w.camp;
    if (c) {
      const fx = campEffects(this.w.map, c);
      const net = fx.forage * 24 - mouths;
      hint = t(this.waiting ? 'world.sit.resting' : 'world.sit.camp', { heal: this.w.healRate().toFixed(1), net: `${net >= 0 ? '+' : ''}${net.toFixed(0)}` });
    } else if (this.w.starving) {
      hint = t('world.sit.starving');
      urgent = true;
    } else if (s.destParty >= 0) {
      const p = this.w.party(s.destParty);
      hint = p ? t('world.sit.pursuing', { name: p.name }) : hint;
    } else if (s.destSettlement >= 0) hint = t('world.sit.marchingTo', { name: this.w.settlement(s.destSettlement)?.name ?? '' });
    else if (this.w.moving) hint = t('world.sit.marching');
    else if (days < 1.5) {
      hint = t('world.sit.lowFood');
      urgent = true;
    } else idle = true;
    const chips: SituationChip[] = [
      { icon: 'coin', value: `${camp.data.gold}`, id: 'world.gold' },
      { icon: 'people', value: `${mouths - wounded}/${mouths}`, id: 'world.men' },
      { icon: 'food', short: `${Math.floor(this.w.food)}${this.w.starving ? '!' : ''}`, value: this.w.starving ? `${Math.floor(this.w.food)}!` : `${Math.floor(this.w.food)} (${days < 1 ? '<1' : Math.floor(days)}${t('mosaic.cmap.dayShort')})`, id: 'world.food' },
      { icon: 'wood', value: `${Math.floor(this.w.supplies)}`, id: 'world.supplies' },
    ];
    if (topTitle !== this.topKey) {
      this.topKey = topTitle;
      this.buildTop(topTitle);
    }
    const next = idle ? this.nextTown() : null;
    const sentence = this.situation(where, hint, idle, next);
    const key = `${sentence}|${urgent}|${chips.map((n) => n.value).join(',')}`;
    if (key !== this.sitKey) {
      this.sitKey = key;
      this.sit.set(sentence, urgent, chips);
    }
    const stripKey = `${!!this.w.camp}|${this.waiting}|${this.w.moving}`;
    if (stripKey !== this.stripKey) {
      this.stripKey = stripKey;
      this.strip?.set(this.stripSlots());
    }
  }

  /**
   * The situation sentence, never cut (A11Y-10): the hour and danger, the hint, and when idle the next town
   * (WLD-4). What the line can't hold goes, least needed first: the next town, then the long hint.
   */
  private situation(where: string, hint: string, idle: boolean, next: string | null): string {
    const sit = this.sit!;
    const room = sit.w - 14;
    const lines = this.m.VH < 240 ? 1 : 2;
    const tries = [next ? `${where} ${t('wld.next', { name: next })} ${hint}` : '', `${where} ${hint}`, idle ? `${where} ${t('wld.hintShort')}` : '', hint];
    return tries.find((x) => x && wrapsWhole(x, room, lines)) ?? hint;
  }

  /** The nearest town or village the army has found, other than the one it stands at (the next goal, WLD-4). */
  private nextTown(): string | null {
    const s = this.w.s;
    let best: { name: string; d: number } | null = null;
    for (const id of s.found ?? []) {
      const st = this.w.settlement(id);
      if (!st || st.kind === 'lair') continue;
      const d = Math.hypot(st.x - s.x, st.y - s.y);
      if (d < 3) continue;
      if (!best || d < best.d) best = { name: st.name, d };
    }
    return best?.name ?? null;
  }

  private setWaiting(on: boolean): void {
    this.waiting = on;
    if (on) this.w.stop();
    this.refreshHud();
  }

  private stopTravel(): void {
    this.w.stop();
    this.setWaiting(false);
    haptic('light');
  }

  private toggleFollow(): void {
    this.follow = !this.follow;
    this.buildFollow();
  }

  /** A banner under the situation line for 6 s (C-4), wrapped, never cut (A11Y-10). Red ink only for a refusal (A11Y-05). */
  private showBanner(msg: string, bad = false): void {
    this.banner?.destroy();
    const { VW } = this.m;
    const c = this.add.container(0, 0);
    // under the situation line and its follow button
    const by = (this.sit ? this.sit.y + this.sit.h : TOPBAR_H) + 30;
    const font = bad ? 'pBad' : 'pInk';
    const lines = wrapWords(msg, VW - 32, (q) => mw(q, font, 7));
    const txt = mtext(this, VW / 2, by + 5, lines.join('\n'), font, { align: 0.5 });
    txt.setCenterAlign();
    const wdt = Math.min(VW - 8, Math.max(80, Math.max(...lines.map((l) => mw(l, font, 7))) + 20));
    c.add(mosaicImage(this, Math.round((VW - wdt) / 2), by, wdt, 8 + lines.length * 10, 'parchment'));
    c.add(txt);
    uiId(c, 'world.banner');
    this.ui.add(c);
    this.banner = c;
    this.time.delayedCall(6000, () => {
      if (this.banner === c) {
        c.destroy();
        this.banner = null;
      }
    });
  }

  private leaveToMenu(): void {
    void state.save();
    this.scene.start('Menu', {});
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
    if (over.length > 0 || this.encounter || this.eventCard) {
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
      const z = Phaser.Math.Clamp(this.pinch.z0 * (d / Math.max(1, this.pinch.d0)), camZoom(1), camZoom(4));
      cam.setZoom(z);
      return;
    }
    const g = this.gesture;
    if (!g || p.id !== g.id || !p.isDown) return;
    if (g.mode === 'pending' && Math.abs(p.x - g.sx) + Math.abs(p.y - g.sy) > 12 * RS) g.mode = 'pan';
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
        this.setZoom(Math.round(zoomUnits(this.cameras.main.zoom)));
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
    this.tweens.add({ targets: this.cameras.main, zoom: camZoom(Phaser.Math.Clamp(z, 1, 4)), duration: 120 });
  }

  /** Tap at world pixel (x, y): a band, a settlement, or a spot to march to. */
  tapWorld(x: number, y: number): void {
    if (this.cine) return;
    const tx = Math.floor(x / WTILE);
    const ty = Math.floor(y / WTILE);
    const c = this.w.camp;
    if (c) {
      const m = this.w.map;
      if (c.zone.includes(ty * m.w + tx)) {
        const b = c.built.find((q) => footprint(q.id, q.x, q.y).some(([fx, fy]) => fx === tx && fy === ty));
        // building happens in the field camp: the Camp button on the bar opens it (the old "tap Build" led nowhere)
        this.showBanner(b ? t('wld.structInfo', { name: t(`wld.struct.${b.id}.name` as TKey), desc: t(`wld.struct.${b.id}.desc` as TKey) }) : t('wld.campHere'));
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
      this.showBanner(t('wld.bandTap', { name: bandName(band.name), men: t('wld.enc.men', { n: band.size }), threat: t(`wld.threat.${threatLevel(ratio)}` as TKey).toLowerCase() }));
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
        this.showBanner(t('wld.lairTap', { name: set.name }));
        this.w.setDestination(set.x, set.y + 1);
      } else if (Math.floor(this.w.s.x) === set.x && Math.floor(this.w.s.y) === set.y) {
        this.enterSettlement(set.id);
        return;
      } else this.w.setDestination(set.x, set.y, set.id);
    } else if (!this.w.setDestination(tx, ty)) {
      hapticNotify('error');
      this.noWay(x, y);
      return;
    }
    haptic('light');
    if (!this.follow) this.toggleFollow();
    this.refreshHud();
  }

  /** "No way there" at the tap point (PLAY C7): a cross and the words, fading out. */
  private noWay(wx: number, wy: number): void {
    const cam = this.cameras.main;
    const S = this.m.S;
    const { VW } = this.m;
    const ux = ((wx - cam.worldView.x) * cam.zoom) / S;
    const uy = ((wy - cam.worldView.y) * cam.zoom) / S;
    const c = this.add.container(0, 0);
    const ic = addIcon(this, ux - 6, uy - 6, 'xmark');
    const txt = mtext(this, 0, 0, t('wld.noWay'), 'pBad', { size: 7 });
    const tw = txt.width + 8;
    const bx = Math.round(Math.max(2, Math.min(VW - tw - 2, ux - tw / 2)));
    const by = Math.round(uy + 8);
    c.add(mosaicImage(this, bx, by, tw, 13, 'parchment'));
    txt.setPosition(bx + 4, by + 3);
    c.add([ic, txt]);
    uiId(c, 'world.noWay');
    this.ui.add(c);
    if (motion.reduced) this.time.delayedCall(1300, () => c.destroy());
    else this.tweens.add({ targets: c, alpha: 0, delay: 900, duration: 400, onComplete: () => c.destroy() });
  }

  // ================================================================ events (campaign-events.md R4)

  /** Show the pending event's card. The march (or the rest in camp) carries on once it is answered. */
  openEvent(): void {
    if (this.eventCard) return;
    this.eventCard = openEventCard(this, {
      onDone: () => {
        this.eventCard = null;
        this.info = state.campaign.playerInfo();
        this.stripKey = '';
        this.refreshHud();
      },
    });
  }

  openJournal(): void {
    if (this.eventCard || this.encounter) return;
    openJournalSheet(this);
  }

  // ================================================================ encounters

  private closeDialog(): void {
    this.encounter?.close();
    this.encounter = null;
    this.dialog = null;
  }

  /** The encounter sheet (src/ui/sheets/encounter.ts): the band, its doctrine and captain, and the choices. */
  openEncounter(partyId: number, byPlayer: boolean, failedFlee = false): void {
    const camp = state.campaign;
    const p = this.w.party(partyId);
    if (!p) return;
    this.closeDialog();
    this.info = camp.playerInfo();
    const ratio = p.power / Math.max(1, this.info.power);
    const lvl = threatLevel(ratio);
    const mood = failedFlee ? 'cutOff' : byPlayer ? (ratio < WORLD_RULES.surrenderRatio ? 'surrender' : 'caught') : this.w.camp ? 'camp' : 'bar';
    const advice = ratio > 1.15 ? 'hard' : ratio < 0.85 ? 'win' : 'even';
    // the band's army as the battle will build it (a throwaway id source: nothing in the save moves)
    const army = partyArmy(p, { nextId: 1 }, camp.armyClasses());
    const beast = encounterOf(army.heroes);
    const captain = beast ? undefined : army.heroes.find((h) => isCaptain(h));
    const choices: EncounterChoice[] = [{ key: 'attack', label: t('wld.enc.attack'), icon: 'swords', onPick: () => this.attack(p.id) }];
    if (camp.canSurrender(p.id) && !failedFlee) {
      choices.push({
        key: 'ransom',
        label: t('wld.enc.ransom'),
        icon: 'coin',
        onPick: () => {
          const g = camp.acceptSurrender(p.id);
          hapticNotify('success');
          this.showBanner(t('wld.ransomPaid', { n: g }));
          void state.save();
          this.refreshHud();
        },
      });
    }
    if (!failedFlee) {
      if (byPlayer && ratio < WORLD_RULES.chaseRatio) {
        choices.push({
          key: 'letGo',
          label: t('wld.enc.letGo'),
          icon: 'back',
          onPick: () => {
            p.idle = 1;
            this.w.s.safeUntil = this.w.s.time + 1;
          },
        });
      } else {
        choices.push({
          key: 'flee',
          label: t('wld.enc.flee', { p: Math.round(camp.fleeChance(p.id) * 100) }),
          icon: 'fallback',
          onPick: () => {
            if (camp.tryFlee(p.id)) {
              hapticNotify('warning');
              this.showBanner(t('wld.slipAway'));
              void state.save();
            } else {
              hapticNotify('error');
              this.openEncounter(p.id, byPlayer, true);
            }
          },
        });
      }
    }
    const handle = openEncounterSheet(
      this,
      {
        title: beast ? encounterName(beast) : bandName(p.name),
        tex: p.name === 'Pirates' ? 'wm_band_pirates' : `wm_band_${p.kind}`,
        lvl,
        color: THREAT_COLOR[lvl],
        men: p.size,
        culture: cap(tOr(`culture.${p.culture}`, CULTURE_LABEL[p.culture])),
        level: p.level,
        mood: t(`wld.enc.mood.${mood}` as TKey),
        advice: t(`wld.enc.adv.${advice}` as TKey),
        doctrine: beast ? null : (army.doctrine ?? 'steady'),
        captain: captain ? { name: captain.name, level: captain.level } : null,
        fit: camp.fitHeroes().length,
        wounded: camp.wounded().length,
        choices,
      },
      () => {
        if (this.encounter !== handle) return;
        this.encounter = null;
        this.dialog = null;
      },
    );
    this.encounter = handle;
    // settled once the sheet has risen (sheetMotion: 200 ms, none under Reduce motion)
    this.time.delayedCall(motion.reduced ? 0 : 250, () => {
      if (this.encounter === handle) this.dialog = handle;
    });
  }

  attack(partyId: number): void {
    const camp = state.campaign;
    const p = this.w.party(partyId);
    const enemy = camp.partyEnemy(partyId);
    if (!p || !enemy) return;
    const beast = encounterOf(enemy.heroes);
    state.pending = { enemy, seed: randomSeed(), partyId, label: beast ? encounterName(beast) : p.name, site: siteAt(this.w.map, this.w.s.x, this.w.s.y) };
    void state.save();
    this.scene.start('Battle', {});
  }
}
