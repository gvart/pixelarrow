import { encounterOf } from '../data/beasts';
import { encounterName } from '../ui/beastInfo';
import Phaser from 'phaser';
import { RS, camZoom, zoomUnits } from '../platform/renderScale';
import { BaseScene } from './BaseScene';
import { addIcon, addText, scaleIcon } from '../ui/kit';
import { MActionBar, MButton, MChip, MIconButton, SituationLine, TOPBAR_H, addSubShell, gearAction, mosaicImage, mtext, mw, wrapWords, TAP, type BarSlot, type SituationChip } from '../ui/mosaic';
import { t, tOr, type TKey } from '../i18n';
import { LINE_H, wrapText, wrapsWhole } from '../ui/textfit';
import { MOSAIC, TEXT_MIN } from '../ui/tokens';
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
import { confirmDialog, hintStore } from '../ui/widgets';
import { CampLife } from '../ui/campLife';
import { uiBlocker, uiId } from '../ui/layout';
import { motion } from '../ui/motion';
import { openEventCard, type EventCardHandle } from '../ui/sheets/eventCard';
import { openAssaultSheet, type AssaultChoiceKey, type AssaultHandle } from '../ui/sheets/assault';
import { openArcSheet, type ArcHandle, type ArcLairRow, type ArcTab } from '../ui/sheets/arcSheet';
import { Spotlight, type Rect } from '../ui/tutorial/spotlight';
import { SIZE } from '../ui/theme';
import { ARC_LAIRS } from '../data/arc';
import { LAIR_HOARD } from '../game/sources';
import { startLairAssault } from '../game/campaignBattle';
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

/** A lair's name (world/map.ts names lairs in English), in words of the current language. */
export const lairName = (name: string): string => tOr(`arc.lairName.${name}`, name);

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
/** The Tyrant's host on the map: a plum tunic under a gold banner (worldArt's BAND_COLORS has no host). */
const HOST_TUNIC = 0x5a2d6a;
/** Tiles from a lair within which the army can strike it; farther, the Assault sheet marches there first. */
const ASSAULT_REACH = 2.5;
/** What the arc news has told on this map (lairs burnt, stage, sack), so a return from battle tells only what changed. */
let arcSeen: { seed: number; fallen: number; stage: string; sacked: boolean } | null = null;
/** The first-visit coach marks (campaign-arc.md R1.6), in order; seen once (settings.seenHints). */
const COACH = ['goal', 'bands', 'towns'] as const;
const COACH_HINT = 'coach.world';
/** The Arc sheet's lair rows, in this order. */
const ROW_ORDER: Record<ArcLairRow['state'], number> = { standing: 0, reborn: 1, burnt: 2, unknown: 3 };

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
  /** The open Assault sheet (campaign-arc.md R2.2) and Arc sheet: the map is paused under both. */
  assaultSheet: AssaultHandle | null = null;
  arcSheet: ArcHandle | null = null;
  /** The lair the army marches on to assault: its Assault sheet opens again on arrival (-1: none). */
  assaultTarget = -1;
  /** Lair plates on the map (garrison, burnt, reborn) by lair id, with what they were drawn for. */
  private lairViews = new Map<number, { c: Phaser.GameObjects.Container; key: string; ash?: Phaser.GameObjects.Ellipse }>();
  private lairHour = -1;
  private hostG!: Phaser.GameObjects.Graphics;
  private arcChip: MChip | null = null;
  private arcKey = '';
  /** Arc news waiting for the banner (one at a time). */
  private news: string[] = [];
  private newsAt = 0;
  /** The first-visit coach marks while they run. */
  private coach: { step: number; spot: Spotlight; layer: Phaser.GameObjects.Container; bubble: Phaser.GameObjects.Container } | null = null;
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
    this.assaultSheet = null;
    this.arcSheet = null;
    this.assaultTarget = -1;
    this.lairViews = new Map();
    this.lairHour = -1;
    this.arcChip = null;
    this.arcKey = '';
    this.news = [];
    this.newsAt = 0;
    this.coach = null;
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
    if (!this.textures.exists('wm_band_host')) {
      const tex = this.textures.addCanvas('wm_band_host', renderPartyFigure(HOST_TUNIC, P.gold).toCanvas())!;
      for (let f = 0; f < PARTY_FRAMES; f++) tex.add(f, 0, f * PARTY_FW, 0, PARTY_FW, PARTY_FH);
    }
    for (const s of m.settlements) this.addSettlement(s);
    this.refreshLairs();
    // the host's march line, over the fog like the host itself
    this.hostG = this.add.graphics().setDepth(D_FOG + 1);
    this.layer.add(this.hostG);
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
    // back from an assault's deployment without fighting: the lair's sheet again (a garrison's id is -1 - lair id)
    else if (data?.encounter !== undefined && data.encounter < 0) this.openAssault(-1 - data.encounter);
    this.arcNews();
    if (this.coachDue()) this.startCoach();
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
    const label = addText(this, Math.round(x), y + 2, s.kind === 'lair' ? lairName(s.name) : s.name, font, 0.5);
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
    if (!this.eventCard && !this.encounter && !this.assaultSheet && this.w.s.pendingEvent) this.openEvent();
    const busy = this.encounter || this.cine || this.eventCard || this.assaultSheet || this.arcSheet || this.coach;
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
      this.arrivedAtLair();
      if (Math.floor(this.w.s.time) !== this.lairHour) {
        this.refreshLairs();
        this.arcNews();
      }
      this.refreshHud();
    }
    this.drainNews();
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
      if (v.key !== key && p.kind === 'host') {
        v.key = key;
        v.plate.removeAll(true);
        this.drawPlate(v.plate, `${p.size}`, lvl, true, 'host');
      } else if (v.key !== key) {
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
      // the host is always on the map, over the fog (R5.2)
      const host = p.kind === 'host';
      const vis = host || this.explored(p.x, p.y);
      const lift = host ? D_FOG + 2 - by : 0;
      v.spr.setVisible(vis).setPosition(Math.round(bx), Math.round(by) + 2).setDepth(by + 3 + lift).setFlipX(v.flip).setFrame(walking ? Math.floor(now / 160 + p.id) % PARTY_FRAMES : 0);
      v.shadow.setVisible(vis).setPosition(Math.round(bx), Math.round(by) + 2).setDepth(by + 2 + lift);
      v.plate.setVisible(vis).setPosition(Math.round(bx), Math.round(by) - 20).setDepth(by + 4 + lift);
      v.spr.setAlpha(p.idle > 0 ? 0.75 : 1);
    }
    for (const [id, v] of this.bands) {
      if (seen.has(id)) continue;
      v.spr.destroy();
      v.shadow.destroy();
      v.plate.destroy();
      this.bands.delete(id);
    }
    this.drawHostLine(now);
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
    this.arcKey = '';
    this.refreshArcChip();
    this.syncBadge(H, 8 + (this.arcChip ? this.arcChip.w + 4 : 0), this.sit.y + this.sit.h + 8);
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

  /** The top bar: the back arrow to the Campaign hub (Menu), "Day N · place" and ⚙ (D9). The journal is the Arc sheet's second tab. */
  private buildTop(title: string): void {
    this.topC.removeAll(true);
    addSubShell(this, {
      map: true,
      parent: this.topC,
      title,
      id: 'world.topbar',
      actions: [gearAction(this)],
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
    const side = TAP + 2;
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
    this.refreshArcChip();
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
    if (over.length > 0 || this.encounter || this.eventCard || this.assaultSheet || this.arcSheet || this.coach) {
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
    if (this.cine || this.coach) return;
    this.assaultTarget = -1;
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
      if (!this.explored(p.x, p.y) && p.kind !== 'host') continue;
      const d = Math.hypot(p.x * WTILE - x, p.y * WTILE - 4 - y);
      if (d < bd) {
        bd = d;
        band = p;
      }
    }
    // bands gather at their lair: a tap on a standing lair's picture or its garrison plate is the lair,
    // unless it is right on a band's figure
    const lair = this.lairAt(x, y);
    if (lair >= 0 && (!band || bd > 4)) {
      this.setWaiting(false);
      haptic('light');
      this.openAssault(lair);
      return;
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
      if (set.kind === 'lair' && !this.w.lairFallen(set.id)) {
        // a standing lair is a target (R2.2): its Assault sheet
        haptic('light');
        this.openAssault(set.id);
        return;
      } else if (set.kind === 'lair') {
        this.showBanner(t('arc.bn.ashes', { name: lairName(set.name) }));
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

  /** The journal: the Arc sheet on its Journal tab (scripts and the layout check call this). */
  openJournal(): void {
    this.openArc('journal');
  }

  // ================================================================ the campaign arc (campaign-arc.md; WLD-02)

  /**
   * A plate on the map (as a band's): the men on the threat colour with the threat's shape (G13), and at the
   * right the captain's crest; a reborn lair adds a skull, the host a gold-rimmed plum plate with its banner.
   */
  private drawPlate(c: Phaser.GameObjects.Container, label: string, lvl: number, crest: boolean, mark?: 'host' | 'reborn'): void {
    const tw = label.length * 5 + 3;
    const lead = mark ? 8 : 0;
    const wdt = tw + 9 + lead + (crest ? 8 : 0);
    const x0 = -Math.round(wdt / 2);
    if (mark === 'host') {
      c.add(this.add.rectangle(0, 1, wdt + 4, 13, P.gold).setOrigin(0.5, 1));
      c.add(this.add.rectangle(0, 0, wdt + 2, 11, HOST_TUNIC).setOrigin(0.5, 1));
    }
    c.add(this.add.rectangle(0, 0, wdt, 9, P.outline).setOrigin(0.5, 1));
    c.add(this.add.rectangle(0, -1, wdt - 2, 7, THREAT_COLOR[lvl]).setOrigin(0.5, 1));
    if (mark) c.add(scaleIcon(addIcon(this, x0 + 1, -9, mark === 'host' ? 'standard' : 'skull'), 7 / 12));
    c.add(this.add.image(x0 + 2 + lead, -8, worldGlyph(this, lvl)).setOrigin(0, 0));
    c.add(addText(this, x0 + lead + 8 + tw / 2, -9, label, 'title', 0.5));
    if (crest) c.add(this.add.image(x0 + wdt - 8, -8, worldGlyph(this, 'crest')).setOrigin(0, 0));
  }

  /**
   * The lairs on the map ("Touch UI needs"): a standing lair shows its garrison plate (men, threat colour and
   * shape, the captain's crest; a skull on a reborn lair), a burnt lair its ashes and a flame. Redrawn only
   * when a garrison, its threat or a lair's state changes (checked every game hour and on each visit).
   */
  refreshLairs(): void {
    this.lairHour = Math.floor(this.w.s.time);
    const power = Math.max(1, state.campaign.playerInfo().power);
    for (const st of this.w.map.settlements) {
      if (st.kind !== 'lair') continue;
      const burnt = this.w.lairFallen(st.id);
      const g = burnt ? null : this.w.garrison(st.id);
      const lvl = g ? threatLevel(g.power / power) : 0;
      const reborn = this.w.isReborn(st.id);
      const key = burnt ? 'burnt' : g ? `${g.size}_${lvl}_${reborn ? 1 : 0}` : 'empty';
      let v = this.lairViews.get(st.id);
      if (v?.key === key) continue;
      if (!v) {
        v = { c: this.add.container(0, 0), key: '' };
        this.layer.add(v.c);
        this.lairViews.set(st.id, v);
      }
      v.key = key;
      v.c.removeAll(true);
      v.ash?.destroy();
      v.ash = undefined;
      // under the lair's name plate: its bands gather on the lair itself, their plates above it
      const site = this.siteOf(st.id);
      const lx = Math.round(site ? site.lx : st.x * WTILE + WTILE / 2);
      const ly = Math.round(site ? site.ly + 2 : st.y * WTILE + WTILE / 2 + 6) + 22;
      v.c.setPosition(lx, ly).setDepth(ly + 3);
      if (burnt) {
        // ashes over the lair's picture, and a flame on a dark plate
        const cx = site ? site.x + site.w / 2 : st.x * WTILE + WTILE / 2;
        const cy = site ? site.y + site.h * 0.55 : st.y * WTILE;
        // (on the ground: under the bands that still gather there)
        v.ash = this.add.ellipse(Math.round(cx), Math.round(cy), Math.round((site?.w ?? 16) * 0.85), Math.round((site?.h ?? 12) * 0.6), 0x2a2018, 0.5).setDepth(Math.round(cy) - 8);
        this.layer.add(v.ash);
        v.c.add(this.add.rectangle(0, 0, 12, 11, P.outline).setOrigin(0.5, 1));
        v.c.add(scaleIcon(addIcon(this, -4, -10, 'fire'), 8 / 12));
      } else if (g) this.drawPlate(v.c, `${g.size}`, lvl, true, reborn ? 'reborn' : undefined);
    }
  }

  /** The standing, found lair whose picture, name or garrison plate holds world pixel (x, y); -1 for none. */
  private lairAt(x: number, y: number): number {
    for (const st of this.w.map.settlements) {
      if (st.kind !== 'lair' || this.w.lairFallen(st.id) || !this.w.isExplored(st.x, st.y)) continue;
      const site = this.siteOf(st.id);
      // the picture down to the garrison plate under the name plate (refreshLairs)
      const box = site ? { x: site.x, y: site.y, w: site.w, h: Math.max(site.h, site.ly + 26 - site.y) } : { x: st.x * WTILE - 6, y: st.y * WTILE - 8, w: 20, h: 40 };
      if (x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h) return st.id;
    }
    return -1;
  }

  /** The host's dotted march line to its goal (R5.2: "a dotted march line to the starting town"), over the fog. */
  private drawHostLine(now: number): void {
    const g = this.hostG;
    g.clear();
    const h = this.w.s.arc.stage === 'host' ? this.w.host : null;
    if (!h) return;
    const ax = h.x * WTILE;
    const ay = h.y * WTILE;
    const bx = (h.tx + 0.5) * WTILE;
    const by = (h.ty + 0.5) * WTILE;
    const n = Math.round(Math.hypot(bx - ax, by - ay));
    const phase = Math.floor(now / 200) % 5;
    for (let i = 8; i < n; i++) {
      if ((i + 5 - phase) % 5 !== 0) continue;
      const x = Math.round(ax + ((bx - ax) * i) / n);
      const y = Math.round(ay + ((by - ay) * i) / n);
      g.fillStyle(MAPC.shade, 0.4);
      g.fillRect(x, y + 1, 2, 2);
      g.fillStyle(0x7a1c18, 1);
      g.fillRect(x - 1, y, 2, 2);
    }
    g.fillStyle(0x7a1c18, 1);
    g.fillRect(Math.round(bx) - 3, Math.round(by) - 3, 6, 1);
    g.fillRect(Math.round(bx) - 3, Math.round(by) + 2, 6, 1);
  }

  /** The arc chip's face for the arc stage: the lairs burnt, then the host to stop, then the win. */
  private arcChipFace(): { icon: string; value: string } {
    if (this.w.s.arc.stage === 'host') return { icon: 'standard', value: t('arc.chip.host') };
    if (this.w.postGame) return { icon: 'laurel', value: t('arc.chip.won') };
    return { icon: 'fire', value: t('arc.chip.lairs', { n: Math.min(ARC_LAIRS, this.w.lairsFallen), total: ARC_LAIRS }) };
  }

  /** The arc chip under the situation line, at the left (the eye is at the right): it states the goal and opens the Arc sheet. */
  private refreshArcChip(): void {
    const f = this.arcChipFace();
    const key = `${f.icon}|${f.value}`;
    if (key === this.arcKey && this.arcChip?.active) return;
    this.arcKey = key;
    this.arcChip?.destroy();
    const sit = this.sit!;
    const chip = new MChip(this, 4, sit.y + sit.h + 3, { icon: f.icon, value: f.value, surface: 'stone', onClick: () => this.openArc() });
    uiId(chip, 'world.arc');
    this.hud.add(chip);
    this.arcChip = chip;
  }

  /** The Arc sheet (Lairs and Journal tabs). */
  openArc(tab: ArcTab = 'lairs'): void {
    if (this.eventCard || this.encounter || this.assaultSheet || this.arcSheet || this.coach) return;
    const w = this.w;
    const m = w.map;
    const start = m.settlements[m.start];
    const towns = m.settlements.filter((st) => st.kind === 'town');
    const near = (st: SettlementDef) => towns.reduce((b, q) => (Math.hypot(q.x - st.x, q.y - st.y) < Math.hypot(b.x - st.x, b.y - st.y) ? q : b), towns[0])?.name ?? null;
    const rows: ArcLairRow[] = m.settlements
      .filter((st) => st.kind === 'lair')
      .map((st): ArcLairRow => {
        const burnt = w.lairFallen(st.id);
        const found = burnt || w.isExplored(st.x, st.y);
        const state = burnt ? 'burnt' : !found ? 'unknown' : w.isReborn(st.id) ? 'reborn' : 'standing';
        return { id: st.id, name: lairName(st.name), near: found ? near(st) : null, state, men: w.garrisonSize(st.id) };
      })
      // the targets first, then what is done, then what is still to find
      .sort((a, b) => ROW_ORDER[a.state] - ROW_ORDER[b.state] || a.id - b.id);
    const host = w.s.arc.stage === 'host' ? w.host : null;
    const goal = w.postGame ? t('arc.goal.won') : host ? t('arc.goal.host', { town: start.name }) : t('arc.goal.lairs', { total: ARC_LAIRS });
    const sackDays = w.isSacked(m.start) ? Math.ceil(((w.s.arc.sackedUntil ?? 0) - w.s.time) / 24) : 0;
    const handle = openArcSheet(
      this,
      { goal, sacked: sackDays > 0 ? t('arc.sacked', { town: start.name, n: sackDays }) : null, host: host ? { men: host.size, town: start.name } : null, rows, journal: w.s.journal, onFocus: (id) => this.focusOn(id) },
      tab,
      () => {
        if (this.arcSheet === handle) this.arcSheet = null;
      },
    );
    this.arcSheet = handle;
  }

  /** Centre the map on lair `id` (or the host, -1): the camera stops following the army. */
  focusOn(id: number): void {
    const h = id === -1 ? this.w.host : null;
    const st = id >= 0 ? this.w.map.settlements[id] : null;
    const x = h ? h.x * WTILE : st ? st.x * WTILE + WTILE / 2 : null;
    const y = h ? h.y * WTILE : st ? st.y * WTILE + WTILE / 2 : null;
    if (x === null || y === null) return;
    if (this.follow) this.toggleFollow();
    this.cameras.main.pan(x, y, motion.reduced ? 0 : 500, 'Sine.easeInOut', true);
  }

  /** The Assault sheet of lair `lairId` (R2.2): its garrison, doctrine, captain and hoard; Assault or Leave. */
  openAssault(lairId: number): void {
    if (this.eventCard || this.encounter || this.assaultSheet || this.coach) return;
    const camp = state.campaign;
    const w = this.w;
    const st = w.map.settlements[lairId];
    if (!st || st.kind !== 'lair' || w.lairFallen(lairId)) return;
    this.arcSheet?.close();
    this.info = camp.playerInfo();
    const g = w.garrison(lairId);
    const lvl = g ? threatLevel(g.power / Math.max(1, this.info.power)) : 0;
    // the garrison as the battle will build it (a throwaway id source: nothing in the save moves)
    const army = g ? partyArmy(g, { nextId: 1 }, camp.armyClasses()) : null;
    const captain = army?.heroes.find((h) => isCaptain(h));
    const handle = openAssaultSheet(
      this,
      {
        title: lairName(st.name),
        tex: st.name === 'Pirate cove' ? 'wm_band_pirates' : `wm_band_${st.band ?? 'bandits'}`,
        lvl,
        color: THREAT_COLOR[lvl],
        men: g?.size ?? 0,
        culture: cap(tOr(`culture.${st.culture}`, CULTURE_LABEL[st.culture])),
        level: g?.level ?? 0,
        doctrine: army ? (army.doctrine ?? 'steady') : null,
        captain: captain ? { name: captain.name, level: captain.level } : null,
        reborn: w.isReborn(lairId),
        burnt: Math.min(ARC_LAIRS, w.lairsFallen),
        total: ARC_LAIRS,
        picks: LAIR_HOARD.picks,
        inReach: Math.hypot(w.s.x - (st.x + 0.5), w.s.y - (st.y + 0.5)) <= ASSAULT_REACH,
        fit: camp.fitHeroes().length,
        wounded: camp.wounded().length,
        onPick: (k) => this.assaultChoice(lairId, k),
      },
      () => {
        if (this.assaultSheet === handle) this.assaultSheet = null;
      },
    );
    this.assaultSheet = handle;
  }

  private assaultChoice(lairId: number, k: AssaultChoiceKey): void {
    const camp = state.campaign;
    const st = this.w.map.settlements[lairId];
    if (k === 'leave') return;
    if (k === 'march') {
      if (this.w.camp) {
        this.strikeCamp(() => this.assaultChoice(lairId, 'march'));
        return;
      }
      this.setWaiting(false);
      if (!this.w.setDestination(st.x, st.y + 1)) {
        hapticNotify('error');
        this.showBanner(t('wld.noWay'), true);
        return;
      }
      this.assaultTarget = lairId;
      haptic('light');
      if (!this.follow) this.toggleFollow();
      this.refreshHud();
      return;
    }
    const pending = k === 'assault' ? startLairAssault(camp, lairId, randomSeed()) : null;
    if (!pending) {
      // no garrison left (R2 Edge Cases): the lair falls on contact, without a battle; its hoard goes to the stash
      const items = camp.razeLair(lairId);
      camp.data.stash.push(...items);
      hapticNotify('success');
      this.refreshLairs();
      this.arcNews();
      void state.save();
      this.refreshHud();
      return;
    }
    // the garrison's id (-1 - lair id) as the band: the battle comes back to the map, never to a band on it
    state.pending = { ...pending, partyId: -1 - lairId };
    void state.save();
    this.scene.start('Battle', {});
  }

  /** The army has reached the lair it marched on: its Assault sheet again. */
  private arrivedAtLair(): void {
    const id = this.assaultTarget;
    if (id < 0 || this.w.moving || this.encounter || this.eventCard) return;
    const st = this.w.map.settlements[id];
    this.assaultTarget = -1;
    if (st && Math.hypot(this.w.s.x - (st.x + 0.5), this.w.s.y - (st.y + 0.5)) <= ASSAULT_REACH) this.openAssault(id);
  }

  /**
   * The arc's news as banners (C-4 states): a lair burnt since the last look, the host on the march, the
   * start town sacked, and once the world reaches tier 3 (AR-03's optional notice) that the bands wear bronze.
   */
  private arcNews(): void {
    const w = this.w;
    const m = w.map;
    const now = { seed: m.seed, fallen: w.lairsFallen, stage: w.s.arc.stage, sacked: w.isSacked(m.start) };
    const was = arcSeen?.seed === m.seed ? arcSeen : null;
    arcSeen = now;
    const start = m.settlements[m.start];
    if (was && now.fallen > was.fallen) {
      const last = m.settlements.filter((st) => st.kind === 'lair' && w.lairFallen(st.id)).sort((a, b) => (w.s.lairs[b.id]?.lostAt ?? 0) - (w.s.lairs[a.id]?.lostAt ?? 0))[0];
      if (last) this.news.push(t('arc.bn.burnt', { name: lairName(last.name), n: Math.min(ARC_LAIRS, now.fallen), total: ARC_LAIRS }));
    }
    if (now.stage === 'host' && was?.stage !== 'host') this.news.push(t('arc.bn.host', { town: start.name }));
    if (now.sacked && !was?.sacked) this.news.push(t('arc.sacked', { town: start.name, n: Math.ceil(((w.s.arc.sackedUntil ?? 0) - w.s.time) / 24) }));
    if (w.lairTier === 3 && !w.hasFlag('arc_tier3') && w.setFlag('arc_tier3')) this.news.push(t('arc.bn.tier3'));
  }

  /** One piece of news at a time, each for 3.5 s (the banner keeps the last for its 6 s). */
  private drainNews(): void {
    if (!this.news.length || this.cine || this.coach || this.encounter || this.eventCard || this.assaultSheet || this.arcSheet || this.time.now < this.newsAt) return;
    this.newsAt = this.time.now + 3500;
    this.showBanner(this.news.shift()!);
  }

  // ---------------------------------------------------------------- first-visit coach marks (R1.6, O4)

  private coachDue(): boolean {
    const seen = hintStore.seen();
    return !seen.includes('*') && !seen.includes(COACH_HINT) && !(window as { __noFirstRun?: boolean }).__noFirstRun;
  }

  /** The coach mark now on screen (scripts): 'goal', 'bands', 'towns' or null. */
  get coachStep(): (typeof COACH)[number] | null {
    return this.coach ? COACH[this.coach.step] : null;
  }

  /** Run the coach marks from `step` (scripts and screenshots force one). */
  startCoach(step = 0): void {
    this.coach?.layer.destroy();
    const layer = this.add.container(0, 0);
    this.ui.add(layer);
    const spot = new Spotlight(this, layer);
    const bubble = this.add.container(0, 0);
    layer.add(bubble);
    this.coach = { step, spot, layer, bubble };
    this.showCoach();
  }

  private showCoach(): void {
    const c = this.coach!;
    const id = COACH[c.step];
    const chip = this.arcChip;
    const at: Rect | null = id === 'goal' && chip ? { x: chip.x - 2, y: chip.y - 2, w: chip.w + 4, h: chip.h + 4 } : null;
    c.spot.show({ hole: at, dim: 0.45, ring: !!at, block: true });
    c.bubble.removeAll(true);
    const { VW, VH } = this.m;
    const w = Math.min(VW - 16, 176);
    const lines = wrapText(t(`arc.coach.${id}` as TKey), w - 14, 6).lines;
    const h = 7 + lines.length * LINE_H + SIZE.btnH + 6;
    // under the chip for the goal, else in the middle of the map: never on the action bar
    const y = Math.round(at ? at.y + at.h + 8 : (VH - h) / 2);
    const x = Math.round((VW - w) / 2);
    const zone = this.add.zone(x, y, w, h).setOrigin(0, 0).setInteractive();
    uiBlocker(uiId(zone, 'world.coach'));
    c.bubble.add(zone);
    c.bubble.add(mosaicImage(this, x, y, w, h, 'parchment'));
    c.bubble.add(addText(this, x + 7, y + 5, lines.join('\n'), 'pInk'));
    if (at) {
      const ax = Math.round(Math.max(x + 8, Math.min(x + w - 8, at.x + at.w / 2)));
      const g = this.add.graphics();
      g.fillStyle(MOSAIC.parch, 1);
      g.fillTriangle(ax - 5, y + 1, ax + 5, y + 1, ax, y - 6);
      c.bubble.add(g);
    }
    const last = c.step === COACH.length - 1;
    const bw = 64;
    c.bubble.add(new MButton(this, x + w - bw - 4, y + h - SIZE.btnH - 4, bw, SIZE.btnH, { label: t(last ? 'coach.done' : 'coach.next'), icon: 'check', variant: 'primary', id: 'coach.next', onClick: () => this.nextCoach() }));
    c.bubble.add(addText(this, x + 7, y + h - 17, `${c.step + 1} / ${COACH.length}`, 'pSec'));
  }

  /** Next coach mark; after the last, they are seen for good. */
  nextCoach(): void {
    const c = this.coach;
    if (!c) return;
    haptic('light');
    if (c.step < COACH.length - 1) {
      c.step++;
      this.showCoach();
      return;
    }
    c.layer.destroy();
    this.coach = null;
    hintStore.mark(COACH_HINT);
    void state.save();
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
