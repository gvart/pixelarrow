/**
 * The camp: a full isometric scene (docs/ART_STYLE.md, art in
 * src/art/campIso.ts, layout in src/world/campLayout.ts) for the offline
 * Field camp (src/world/camp.ts). The clearing with its pavilion, tents, sheds, stall
 * and forge is a pannable world container: the ground is baked into one
 * texture, every structure is a cached sprite sorted by its feet, and the
 * life (src/ui/campIsoLife.ts) is a dozen figures, some animals, smoke and
 * sparks. The chrome is the v5 map shell (design/ux/screens-campaign.md C-5,
 * CMP-01), the same as the World map's: the top bar (back, "Field camp",
 * gear), the parchment situation line (where and when, what the
 * camp does, the purse as chips), a zoom key, and a two-row stone strip of
 * labelled actions. Build opens the labelled Build drawer (name, cost, time,
 * count, why not), which leads to the supplies and field-works page
 * (field-works.md R4); the muster, the forge and the strike confirm are kit
 * sheets. Portrait-first: everything fits 320 x 568 at scale 2.
 */
import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { ScrollArea, scaleIcon, addIcon } from '../ui/kit';
import { confirmDialog, toast, ScrollList } from '../ui/widgets';
import { openEventCard, type EventCardHandle } from '../ui/sheets/eventCard';
import { wrapsWhole } from '../ui/textfit';
import { anchorOffset, mapWheel } from '../ui/input/zoomAt';
import { mapCursor } from '../ui/input/cursorApply';
import { MButton, MIconButton, SituationLine, TOPBAR_H, addSubShell, gearAction, mosaicImage, mtext, mw, openParchmentSheet, situationLineH, wrapWords, type MButtonVariant, type ParchmentSheetHandle, type ParchmentSheetOpts, type SituationChip } from '../ui/mosaic';
import { openPanel, EDGE_PAD } from '../ui/mosaic/layout';
import { SHEET_ACTION_H } from '../ui/mosaic/ParchmentSheet';
import { BUTTON_MAX } from '../ui/sizeClass';
import { mapHudLayout, stackKeys, type MapHudLayout } from '../ui/mapHud';
import { ensureFonts } from '../ui/fonts';
import { uiCollapsed, uiId, uiIgnore, uiLayout, uiOpaque, uiPrimary } from '../ui/layout';
import { TEXT_MIN, lineHeight } from '../ui/tokens';
import { motion } from '../ui/motion';
import { haptic, hapticNotify } from '../platform/haptics';
import { state } from '../state';
import { t, tOr, type TKey } from '../i18n';
import { fmtSigned, localDecimals } from '../i18n/numbers';
import { heroName } from '../i18n/names';
import { Pix } from '../art/pixels';
import * as Iso from '../art/campIso';
import { fieldLayout, type IsoLayout, type IsoThing } from '../world/campLayout';
import { STRUCTURES, STRUCTURE_LIST, campEffects, countBuilt, freeSpot, placeCheck, type StructureId } from '../world/camp';
import type { WorldMap } from '../world/map';
import type { World } from '../world/world';
import { dollFromHero, type DollSpec } from '../art/paperdoll';
import { flushDolls, pumpDolls, releaseBattleRows } from '../ui/sprites';
import { CampIsoLife, facingOf } from '../ui/campIsoLife';
import type { Hero } from '../data/units';
import { RARITIES, itemDef, normalizeRarity, type Item } from '../data/items';
import { MUSTER, classRows, fieldIds, musterOf, reserveChanges, shiftClass, toggleReserve, type MusterHero, type MusterWhy } from '../game/muster';
import { worksAllowance } from '../game/campaign';
import { WORKS } from '../data/terrain';
import { WORK_TYPES } from '../sim/types';
import { CLASSES, type ClassId } from '../data/classes';
import { frameScrollTexts, itemName } from '../ui/sheet';

export interface CampSceneData {
  mode: 'field';
}

const FIELD_ICON: Record<StructureId, string> = { tent: 'tent', fire: 'fire', palisade: 'wall', forge: 'anvil', training: 'swords' };
/** The action strip: two rows of 48 pt buttons, 8 pt apart (C-5 Touch). */
const BTN_H = 24;
const BAR_PAD = 4;
const ROW_GAP = 4;
/** Drawer rows are 52 pt (C-5 Touch). */
const ROW_H = 26;
const ROW_GAP_LIST = 2;
/** Line pitch of 6.5 UI px text (A11Y-09), with a pixel to spare so stacked lines never touch. */
const LH = Math.ceil(lineHeight(TEXT_MIN)) + 1;
/** Sprites rendered once per game (textures are shared by every scene). */
const sprites = new Map<string, { ox: number; oy: number; w: number; h: number }>();

interface Placed {
  thing: IsoThing;
  img: Phaser.GameObjects.Image;
}

export class CampScene extends BaseScene {
  /** Opted in to the size classes (ADR-0013): the clearing fills the safe area, the tools sit on its edges (landscape-v6 §12). */
  protected override readonly responsive = true;
  /** Where the HUD goes in this size class, and the framing rect the clearing is framed in (§12.2, §12.3). */
  private hudL!: MapHudLayout;
  /** An open inspector panel's box and id (landscape): the framing rect ends at its left edge while it is open. */
  private panelR: { x: number; y: number; w: number; h: number; id: string } | null = null;
  /** Landscape: the top of what sits along the foot (the key row); VH when nothing does. */
  private footTop = 0;
  private world!: Phaser.GameObjects.Container;
  private view = { x: 0, y: 0, w: 0, h: 0 };
  private maskG: Phaser.GameObjects.Graphics | null = null;
  private layout: IsoLayout | null = null;
  private ground: Phaser.GameObjects.Image | null = null;
  private groundKey = '';
  private placed: Placed[] = [];
  private ghostObjs: Phaser.GameObjects.GameObject[] = [];
  private life: CampIsoLife | null = null;
  private tint!: Phaser.GameObjects.Rectangle;
  private hud!: Phaser.GameObjects.Container;
  /** The action strip (two rows of labelled buttons). */
  private bar: Phaser.GameObjects.Container | null = null;
  private sit: SituationLine | null = null;
  private sitKey = '';
  /** Top of the open map under the situation line, UI px. */
  private visTop = 0;
  private topC!: Phaser.GameObjects.Container;
  private topKey = '';
  private zoom = 1;
  private gesture: { id: number; sx: number; sy: number; wx: number; wy: number; moved: boolean } | null = null;
  // field
  private placing: { id: StructureId; x: number; y: number } | null = null;
  private construct: { id: StructureId; x: number; y: number; t0: number; stage: number } | null = null;
  private selected: string | null = null;
  private modal: ParchmentSheetHandle | null = null;
  /** The open sheet is an inspector panel: the clearing stays live beside it (§3.4, §12.2). */
  private inspector = false;
  private eventCard: EventCardHandle | null = null;
  private musterList: MusterHero[] = [];

  constructor() {
    super('Camp');
  }

  create(_data?: CampSceneData): void {
    this.placing = null;
    this.construct = null;
    this.selected = null;
    this.modal = null;
    this.inspector = false;
    this.panelR = null;
    this.eventCard = null;
    this.placed = [];
    this.ghostObjs = [];
    this.layout = null;
    this.ground = null;
    this.life = null;
    this.gesture = null;
    this.animTimer = null;
    this.bar = null;
    this.sit = null;
    this.initUi();
    ensureFonts(this);
    const { VW, VH } = this.m;
    this.hudL = this.layoutHud();
    uiLayout(this, this.m.cls, this.m.land, 'field');
    this.cameras.main.setBackgroundColor(0x2b1d1a);
    // the map fills the screen between the top bar and the action strip; the situation line floats over its top.
    // In landscape it is full bleed under the top bar: the card and the tool rail float over it (§12.2).
    this.view = { x: 0, y: TOPBAR_H, w: VW, h: VH - TOPBAR_H - (this.hudL.commands.mode === 'bar' ? this.barH() : 0) };
    this.visTop = TOPBAR_H;
    // the pannable world under a mask of the viewport
    this.world = this.add.container(0, 0);
    this.ui.add(this.world);
    this.maskG = this.make.graphics({}, false);
    this.maskG.fillStyle(0xffffff);
    this.maskG.fillRect(this.view.x * this.m.S, this.view.y * this.m.S, this.view.w * this.m.S, this.view.h * this.m.S);
    this.world.setMask(this.maskG.createGeometryMask());
    // day / night tint over the viewport
    this.tint = this.add.rectangle(this.view.x, this.view.y, this.view.w, this.view.h, 0x1a1c48, 0).setOrigin(0, 0);
    this.ui.add(this.tint);
    const zone = this.add.zone(this.view.x, this.view.y, this.view.w, this.view.h).setOrigin(0, 0).setInteractive();
    uiIgnore(zone);
    this.ui.add(zone);
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    // a mouse: the wheel zooms 1x/2x at the cursor (accumulated for trackpads), shift or deltaX pans; a drag pans as a finger does
    mapWheel(this, {
      blocked: (p, over) => !this.layout || !this.overMap(p) || over.some((o) => o !== zone),
      zoom: (dir, sx, sy) => {
        const z = Phaser.Math.Clamp(this.zoom + dir, 1, 2);
        if (z !== this.zoom) this.zoomAround(z, sx / this.m.S, sy / this.m.S);
      },
      pan: (dx) => {
        this.world.x -= dx / this.m.S;
        this.clampPan();
      },
    });
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('pointerupoutside', this.onUp, this);
    // a mouse: the right button does nothing on the camp (no browser menu), the middle one pans; cursors (input-v6.md §2.2, §2.4)
    mapCursor(this, () => !!this.gesture?.moved);
    this.hud = this.add.container(0, 0);
    this.ui.add(this.hud);
    this.screen({ back: () => this.goBack() });
    this.events.once('shutdown', () => {
      this.input.off('pointermove', this.onMove, this);
      this.input.off('pointerup', this.onUp, this);
      this.input.off('pointerupoutside', this.onUp, this);
      this.life?.destroy();
      this.life = null;
      releaseBattleRows(this);
    });
    if (!state.campaign.world.camp) {
      this.scene.start('World', {});
      return;
    }
    this.rebuild();
    this.buildHud();
    this.centerCamp();
    this.openEvent();
  }

  /** The pending event's card over the camp (a camp night, campaign-events.md R3); it comes back until answered. */
  private openEvent(): void {
    if (this.eventCard) return;
    this.eventCard = openEventCard(this, {
      onDone: () => {
        this.eventCard = null;
        if (!this.scene.isActive()) return;
        this.refreshHud();
        if (state.campaign.world.s.pendingEvent) this.time.delayedCall(0, () => this.openEvent());
      },
    });
  }

  update(time: number, delta: number): void {
    pumpDolls(4);
    this.life?.update(time, delta);
    flushDolls(this);
    // containers draw in insertion order: keep the feet-line order (ground, flat yards, structures and men by y)
    this.world.sort('depth');
    if (this.construct) this.tickConstruct(time);
  }

  private goBack(): void {
    this.scene.start('World', {});
  }

  // ================================================================ sprites

  /** The texture of a camp sprite (rendered on first use, shared by every scene). */
  private spriteOf(key: string): { tex: string; ox: number; oy: number; w: number; h: number } {
    const tex = `ci_${key}`;
    let s = sprites.get(key);
    if (!s || !this.textures.exists(tex)) {
      const r = renderKey(key);
      const px = r.px;
      if (this.textures.exists(tex)) this.textures.remove(tex);
      this.textures.addCanvas(tex, px.toCanvas());
      s = { ox: r.ox, oy: r.oy, w: px.w, h: px.h };
      sprites.set(key, s);
    }
    return { tex, ...s };
  }

  /** The feet-line depth of a thing (its bottom corner), or its top for flat ground things. */
  private depthOf(th: IsoThing): number {
    if (th.flat) return Iso.tileScreen(th.x, th.y).y + 1;
    return Iso.tileScreen(th.x + th.w, th.y + th.h).y;
  }

  // ================================================================ build the camp

  private currentLayout(): IsoLayout {
    const w = state.campaign.world;
    return fieldLayout(w.map, w.camp!, state.campaign.data.heroes.length, this.placing);
  }

  /** Rebuild the ground (when its signature changed) and every sprite; the life is re-populated. */
  private rebuild(): void {
    const L = this.currentLayout();
    this.layout = L;
    const sig = `field_${L.w}x${L.h}_${hashKinds(L.kinds)}`;
    const key = `ci_ground_${sig}`;
    if (this.groundKey !== key || !this.ground) {
      if (!this.textures.exists(key)) this.textures.addCanvas(key, Iso.renderIsoGround({ w: L.w, h: L.h, kinds: L.kinds, seed: 5, clearing: L.clearing }).toCanvas());
      this.ground?.destroy();
      const g = Iso.groundLayout(L.w, L.h);
      this.ground = this.add.image(-g.ox, -g.oy, key).setOrigin(0, 0).setDepth(-1e6);
      this.world.add(this.ground);
      this.groundKey = key;
    }
    for (const p of this.placed) p.img.destroy();
    this.placed = [];
    for (const o of this.ghostObjs) o.destroy();
    this.ghostObjs = [];
    this.life?.destroy();
    this.life = null;
    for (const th of L.things) this.place(th);
    this.populate(L);
    this.clampPan();
  }

  private place(th: IsoThing): void {
    if (th.key.startsWith('ghost:')) {
      this.drawGhost(th);
      return;
    }
    const cons = this.construct && th.sel !== undefined && this.constructIndex() === Number(th.sel);
    let key = th.key;
    let alpha = 1;
    if (cons) key = this.construct!.stage < 2 ? `site${th.w}x${th.h}_${this.construct!.stage}` : `half:${th.key}`;
    else if (th.stage !== undefined) {
      key = th.stage < 2 ? `site${th.w}x${th.h}_${th.stage}` : `half:${th.key}`;
      alpha = 1;
    }
    const s = this.spriteOf(key);
    const o = Iso.tileScreen(th.x, th.y);
    const img = this.add.image(o.x - s.ox, o.y - s.oy, s.tex).setOrigin(0, 0).setDepth(this.depthOf(th)).setAlpha(alpha);
    if (th.sel !== undefined && this.selected === th.sel) img.setTint(0xd8f4ff);
    this.world.add(img);
    this.placed.push({ thing: th, img });
    if (th.anim) {
      const frames = th.anim.frames;
      const period = th.anim.period;
      const phase = Math.random() * period * frames.length;
      const pre = frames.map((f) => this.spriteOf(f));
      img.setData('anim', { frames: pre, period, phase, base: { x: o.x, y: o.y } });
      if (!this.animTimer) this.animTimer = this.time.addEvent({ delay: 110, loop: true, callback: () => this.stepAnims() });
    }
  }

  private animTimer: Phaser.Time.TimerEvent | null = null;

  private stepAnims(): void {
    const now = this.time.now;
    for (const p of this.placed) {
      const a = p.img.getData('anim') as { frames: { tex: string; ox: number; oy: number }[]; period: number; phase: number; base: { x: number; y: number } } | undefined;
      if (!a || !p.img.active) continue;
      const f = a.frames[Math.floor((now + a.phase) / a.period) % a.frames.length];
      if (p.img.texture.key !== f.tex) p.img.setTexture(f.tex).setPosition(a.base.x - f.ox, a.base.y - f.oy);
    }
  }

  /** The placement ghost: the team-cyan structure over its footprint, every tile tinted valid or not. */
  private drawGhost(th: IsoThing): void {
    const key = th.key.slice(6);
    const s = this.spriteOf(key);
    const L = this.layout!;
    let okAll = true;
    const tiles: { x: number; y: number; ok: boolean }[] = [];
    if (this.placing) {
      const w = state.campaign.world;
      const chk = placeCheck(w.map, w.camp!, this.placing.id, this.placing.x, this.placing.y);
      okAll = chk.ok;
      for (const tl of chk.tiles) {
        const at = L.toIso(tl.x, tl.y);
        for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) tiles.push({ x: at.x + i, y: at.y + j, ok: tl.ok });
      }
    }
    for (const ok of [true, false]) if (!this.textures.exists(`ci_tile_${ok}`)) this.textures.addCanvas(`ci_tile_${ok}`, Iso.renderTileTint(ok).toCanvas());
    for (const tl of tiles) {
      const o = Iso.tileScreen(tl.x, tl.y);
      const img = this.add.image(o.x - Iso.TILE_W / 2 - 1, o.y - 1, `ci_tile_${tl.ok}`).setOrigin(0, 0).setDepth(-1e5);
      this.world.add(img);
      this.ghostObjs.push(img);
    }
    const o = Iso.tileScreen(th.x, th.y);
    const img = this.add.image(o.x - s.ox, o.y - s.oy, s.tex).setOrigin(0, 0).setDepth(this.depthOf(th)).setAlpha(0.62).setTint(okAll ? 0x7fd0e0 : 0xe08088);
    this.world.add(img);
    this.ghostObjs.push(img);
    // valid or not is also a glyph over the ghost, never the tint alone (CMP-5, G13)
    const mark = scaleIcon(addIcon(this, 0, 0, okAll ? 'check' : 'xmark'), 1.2).setOrigin(0.5, 1);
    mark.setPosition(Math.round(o.x - s.ox + s.w / 2), Math.round(o.y - s.oy - 2)).setDepth(1e5);
    this.world.add(mark);
    this.ghostObjs.push(mark);
  }

  // ================================================================ life

  private heroes(): Hero[] {
    return state.campaign.data.heroes;
  }

  private muster(): MusterHero[] {
    return musterOf(state.campaign.data.heroes);
  }

  /** The men, animals, birds, smoke and sparks of the camp. */
  private populate(L: IsoLayout): void {
    const g = Iso.groundLayout(L.w, L.h);
    const life = new CampIsoLife(this, {
      add: (o) => this.world.add(o),
      depthAt: (y) => y,
      sky: { x0: -g.ox + 10, x1: -g.ox + g.pw - 10, y0: -g.oy - 20, y1: -g.oy + 40 },
    });
    this.life = life;
    const at = (tx: number, ty: number): [number, number] => {
      const o = Iso.groundScreen(tx, ty);
      return [o.x, o.y];
    };
    const routes = L.routes.map(([x, y]) => at(x, y));
    const m = this.muster();
    const heroes = this.heroes();
    const specs = new Map(heroes.map((h) => [h.id, dollFromHero(h)]));
    const field = new Set(fieldIds(m));
    const wounded = m.filter((h) => h.wounded);
    const reserves = m.filter((h) => !h.wounded && !field.has(h.id));
    const fielded = m.filter((h) => field.has(h.id));
    const s = L.spots;
    let used = 0;
    const MAX = 11;
    const take = (list: MusterHero[]): DollSpec | null => {
      const h = list.shift();
      if (!h || used >= MAX) return null;
      used++;
      return specs.get(h.id) ?? null;
    };
    // the wounded rest at the tents
    for (const bed of s.beds) {
      const spec = take(wounded);
      if (!spec) break;
      life.figure(spec, 'rest', ...at(bed.x, bed.y), { face: 2 });
    }
    for (const tent of s.tents) {
      if (!wounded.length) break;
      const spec = take(wounded);
      if (!spec) break;
      life.figure(spec, 'rest', ...at(tent.x, tent.y), { face: 0 });
    }
    // the smith, the sparring pair, the guard, the men at the fire
    if (s.forge) {
      const spec = take(fielded) ?? take(reserves);
      const [fx, fy] = at(s.forge.x + 1.6, s.forge.y + 1.5);
      if (spec) life.figure(spec, 'smith', fx, fy, { face: 3 });
      const chimney = at(s.forge.x + 0.5, s.forge.y + 0.5);
      life.fx.smoke(chimney[0], chimney[1] - 42, 1.2);
      const anvil = at(s.forge.x + 1.35, s.forge.y + 1.2);
      life.fx.sparks(anvil[0], anvil[1] - 7, 9, () => life.striking(fx, fy));
    }
    if (s.yard) {
      const a = take(fielded) ?? take(reserves);
      const b = take(fielded) ?? take(reserves);
      const yw = 4;
      if (a) life.figure(a, 'spar', ...at(s.yard.x + 1.2, s.yard.y + yw - 0.8), { face: 0, phase: 0 });
      if (b) life.figure(b, 'spar', ...at(s.yard.x + 2.0, s.yard.y + yw - 0.2), { face: 3, phase: 900 });
    }
    if (s.gate) {
      const spec = take(fielded) ?? take(reserves);
      if (spec) life.figure(spec, 'guard', ...at(s.gate.x - 0.4, s.gate.y + 0.9), { face: 0 });
    }
    if (s.fire) {
      for (let i = 0; i < 2; i++) {
        const spec = take(reserves) ?? take(fielded);
        if (!spec) break;
        life.figure(spec, 'sit', ...at(s.fire.x + (i ? 1.2 : -0.3), s.fire.y + (i ? -0.2 : 1.2)), { face: i ? 3 : 0 });
      }
      const [fx, fy] = at(s.fire.x, s.fire.y);
      for (let f = 0; f < 4; f++) if (!this.textures.exists(`ci_flame${f}`)) this.textures.addCanvas(`ci_flame${f}`, Iso.renderFlames(f).toCanvas());
      if (!this.textures.exists('ci_glow')) this.textures.addCanvas('ci_glow', Iso.renderGlow(26).toCanvas());
      const glow = this.add.image(fx, fy + 2, 'ci_glow').setOrigin(0.5, 0.5).setDepth(fy - 20).setAlpha(this.isNight() ? 0.9 : 0.35);
      this.world.add(glow);
      life.fx.loop(fx - 5, fy + 2, ['ci_flame0', 'ci_flame1', 'ci_flame2', 'ci_flame3'], 130).setDepth(fy + 1);
      life.fx.smoke(fx, fy - 12, 1.5);
      life.fx.sparks(fx, fy - 8, 1.5);
    }
    if (s.stall) {
      const keeper: DollSpec = { look: { skin: 1, hair: 1, hairStyle: 0, beard: 2, tunic: 'tunicOchre' }, seed: 7 };
      life.figure(keeper, 'keep', ...at(s.stall.x - 0.2, s.stall.y - 1.1), { face: 0 });
    }
    // everyone else strolls the paths
    let strollers = 0;
    while (used < MAX && strollers < 5) {
      const spec = take(fielded) ?? take(reserves);
      if (!spec) break;
      const [x, y] = routes[strollers % routes.length] ?? at(s.pavilion.x + 2.5, s.pavilion.y + 2.5);
      life.figure(spec, 'stroll', x, y, { route: routes });
      strollers++;
    }
    // animals on the pasture and hens by the stall
    const pasture = L.pasture.map(([x, y]) => at(x + 0.5, y + 0.6));
    if (pasture.length >= 2) {
      life.animal('goat', pasture);
      if (pasture.length >= 4) life.animal('goat', pasture);
    }
    const yardSpots: [number, number][] = [];
    for (const [x, y] of L.routes.slice(0, 6)) yardSpots.push(at(x + 0.3, y + 0.4), at(x - 0.4, y + 0.1));
    if (yardSpots.length >= 2) {
      life.animal('hen', yardSpots);
      life.animal('hen', yardSpots);
    }
    life.bird();
    if (L.coastal) life.bird();
    if (L.coastal && s.ship) {
      // gulls and the surf's foam at the waterline
      for (let f = 0; f < 2; f++) if (!this.textures.exists(`ci_foam${f}`)) this.textures.addCanvas(`ci_foam${f}`, Iso.renderFoam(f).toCanvas());
      for (let i = 0; i < 6; i++) {
        const spot = this.shoreSpot(L, i);
        if (spot) life.fx.loop(spot[0], spot[1], ['ci_foam0', 'ci_foam1'], 700 + i * 90, i * 300).setDepth(-1e6 + 1);
      }
    }
    this.applyTint();
  }

  /** A pixel on the waterline (a sea tile beside sand), for foam. */
  private shoreSpot(L: IsoLayout, i: number): [number, number] | null {
    const found: [number, number][] = [];
    for (let y = 0; y < L.h; y++)
      for (let x = 0; x < L.w; x++) {
        if (L.kinds[y * L.w + x] !== Iso.G.sea) continue;
        const sandL = x > 0 && L.kinds[y * L.w + x - 1] === Iso.G.sand;
        const sandU = y > 0 && L.kinds[(y - 1) * L.w + x] === Iso.G.sand;
        if (sandL || sandU) {
          const o = Iso.groundScreen(x + (sandL ? 0.15 : 0.5), y + (sandU ? 0.15 : 0.5));
          found.push([o.x, o.y]);
        }
      }
    if (!found.length) return null;
    return found[Math.floor((i * 7919) % found.length)];
  }

  private hour(): number {
    return Math.floor(state.campaign.world.s.time % 24);
  }

  private isNight(): boolean {
    const h = this.hour();
    return h >= 21 || h < 5;
  }

  /** The day / night tint over the camp: deep blue at night, warm at dusk and dawn. */
  private applyTint(): void {
    const h = this.hour();
    let color = 0x1a1c48;
    let alpha = 0;
    if (h >= 21 || h < 5) alpha = 0.42;
    else if (h >= 19) {
      color = 0xd07040;
      alpha = 0.2;
    } else if (h < 7) {
      color = 0xe0a060;
      alpha = 0.16;
    }
    this.tint.setFillStyle(color, alpha);
  }

  // ================================================================ camera

  private centerCamp(): void {
    const L = this.layout;
    if (!L) return;
    // the middle of the clearing
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let y = 0; y < L.h; y++)
      for (let x = 0; x < L.w; x++)
        if (L.clearing[y * L.w + x]) {
          sx += x + 0.5;
          sy += y + 0.5;
          n++;
        }
    const p = L.spots.pavilion;
    const c = n ? Iso.groundScreen(sx / n, sy / n) : Iso.groundScreen(p.x + 1.5, p.y + 2.5);
    this.world.setScale(this.zoom);
    this.lookAt(c.x, c.y + 10);
  }

  /**
   * The framing rect, UI px: the open map under the situation line and above the strip (v5), or in landscape the
   * clear map the card, the tool rail and an open inspector panel leave (§12.3).
   */
  private frame(): { x: number; y: number; w: number; h: number } {
    const v = this.view;
    if (this.hudL.commands.mode === 'bar') return { x: v.x, y: this.visTop, w: v.w, h: v.y + v.h - this.visTop };
    const f = this.hudL.framing;
    const p = this.panelR;
    if (!p) return f;
    // an open panel: the clear map left of it (the card's own rect, when it lies under the panel, is hidden)
    if (p.x - EDGE_PAD - f.x >= 40) return { ...f, w: Math.min(f.w, p.x - EDGE_PAD - f.x) };
    return { x: 0, y: TOPBAR_H, w: Math.max(40, p.x - EDGE_PAD), h: Math.max(40, this.footTop - EDGE_PAD - TOPBAR_H) };
  }

  /** The middle of the framing rect, UI px. */
  private visCentre(): { x: number; y: number } {
    const f = this.frame();
    return { x: f.x + f.w / 2, y: Math.round((f.y + f.y + f.h) / 2) };
  }

  /** Pan so the world point (wx, wy) sits in the middle of the open map. */
  private lookAt(wx: number, wy: number): void {
    const c = this.visCentre();
    this.world.setScale(this.zoom);
    this.world.setPosition(Math.round(c.x - wx * this.zoom), Math.round(c.y - wy * this.zoom));
    this.clampPan();
  }

  private clampPan(): void {
    const L = this.layout;
    if (!L) return;
    const g = Iso.groundLayout(L.w, L.h);
    const z = this.zoom;
    // the clearing's edges stop at the framing rect's (v5: the open map between the situation line and the strip)
    const f = this.frame();
    const minX = f.x + f.w - (g.pw - g.ox) * z - 20;
    const maxX = f.x + g.ox * z + 20;
    const minY = f.y + f.h - (g.ph - g.oy) * z - 20;
    const maxY = f.y + g.oy * z + 60;
    this.world.x = Math.round(Phaser.Math.Clamp(this.world.x, Math.min(minX, maxX), Math.max(minX, maxX)));
    this.world.y = Math.round(Phaser.Math.Clamp(this.world.y, Math.min(minY, maxY), Math.max(minY, maxY)));
  }

  private toggleZoom(): void {
    if (!this.layout) return;
    const c = this.visCentre();
    this.zoomAround(this.zoom === 1 ? 2 : 1, c.x, c.y);
    haptic('light');
  }

  /** Zoom to z (1 or 2) keeping the map point under UI (ux, uy) in place: the zoom key about the middle, the wheel about the cursor. */
  private zoomAround(z: number, ux: number, uy: number): void {
    const z0 = this.zoom;
    this.zoom = z;
    this.world.setScale(z);
    this.world.setPosition(Math.round(anchorOffset(this.world.x, ux, z0, z)), Math.round(anchorOffset(this.world.y, uy, z0, z)));
    this.clampPan();
  }

  /** Over the open map (not the top bar, the situation line or the strip), and no sheet open. */
  private overMap(p: Phaser.Input.Pointer): boolean {
    const ux = p.x / this.m.S;
    const uy = p.y / this.m.S;
    return (!this.modal || this.inspector) && !this.eventCard && ux >= this.view.x && ux <= this.view.x + this.view.w && uy >= this.visTop && uy <= this.view.y + this.view.h;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if ((this.modal && !this.inspector) || (!p.wasTouch && p.button === 2)) return;
    // the middle button pans from the first move, and is never a tap
    this.gesture = { id: p.id, sx: p.x, sy: p.y, wx: this.world.x, wy: this.world.y, moved: !p.wasTouch && p.button === 1 };
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const g = this.gesture;
    if (!g || p.id !== g.id || !p.isDown) return;
    const dx = (p.x - g.sx) / this.m.S;
    const dy = (p.y - g.sy) / this.m.S;
    if (!g.moved && Math.hypot(dx, dy) < 4) return;
    g.moved = true;
    this.world.setPosition(Math.round(g.wx + dx), Math.round(g.wy + dy));
    this.clampPan();
  }

  private onUp(p: Phaser.Input.Pointer): void {
    const g = this.gesture;
    this.gesture = null;
    if (!g || p.id !== g.id || g.moved) return;
    const ux = p.x / this.m.S;
    const uy = p.y / this.m.S;
    if (ux < this.view.x || ux > this.view.x + this.view.w || uy < this.visTop || uy > this.view.y + this.view.h) return;
    const wx = (ux - this.world.x) / this.zoom;
    const wy = (uy - this.world.y) / this.zoom;
    const tl = Iso.screenTile(wx, wy);
    this.tapTile(Math.floor(tl.x), Math.floor(tl.y));
  }

  private tapTile(tx: number, ty: number): void {
    const L = this.layout;
    if (!L) return;
    if (this.placing) {
      const mt = L.toMap(tx, ty);
      const d = STRUCTURES[this.placing.id];
      const nx = mt.x - Math.floor((d.w - 1) / 2);
      const ny = mt.y - Math.floor((d.h - 1) / 2);
      if (nx === this.placing.x && ny === this.placing.y) return;
      this.placing.x = nx;
      this.placing.y = ny;
      this.refreshGhost();
      this.refreshHud();
      haptic('light');
      return;
    }
    const hit = L.things.find((th) => th.sel !== undefined && tx >= th.x && tx < th.x + th.w && ty >= th.y && ty < th.y + th.h);
    this.selected = hit?.sel ?? null;
    this.rebuild();
    this.buildHud();
    const b = hit ? state.campaign.world.camp?.built[Number(hit.sel)] : null;
    if (b?.id === 'forge') this.openTemper();
  }

  /** Field: move the ghost without re-rendering the whole camp. */
  private refreshGhost(): void {
    for (const o of this.ghostObjs) o.destroy();
    this.ghostObjs = [];
    const L = this.currentLayout();
    this.layout = L;
    const gh = L.things.find((th) => th.key.startsWith('ghost:'));
    if (gh) this.drawGhost(gh);
  }

  // ================================================================ HUD

  /** The HUD's layout for this size: the widest tool key (label and icon) sets the rail's width in compact landscape. */
  private layoutHud(): MapHudLayout {
    const labels = [t('cmp.strike'), t('cmp.muster'), t('cmp.loot'), t('cmp.build'), t('cs.endDay'), t('common.cancel'), t('cs.place')];
    const keyW = Math.max(...labels.map((l) => mw(l.toUpperCase(), 'rCream', 7))) + 14 + 12;
    return mapHudLayout(this.m, { top: TOPBAR_H, cardH: situationLineH, under: TAP_KEY + 4, keys: RAIL_KEYS, keyW, kind: 'camp' });
  }

  /**
   * A camp sheet (build, buildings, supplies, muster, forge): v5's sheet in compact portrait, a bottom sheet ≤ 320 at
   * medium, and in landscape an inspector side panel: no shade, the clearing stays live beside it (§3.4, §12.2).
   */
  private openSheet(o: ParchmentSheetOpts & { title: string; id: string }): ParchmentSheetHandle {
    this.modal?.close();
    if (this.hudL.commands.mode === 'bar') {
      this.inspector = false;
      return openParchmentSheet(this, o);
    }
    const { VW, VH } = this.m;
    // the panel docks left of the tool rail: the tools stay live beside it. Short
    // landscape has no room above the key row: the panel takes the full height, and the keys it covers step aside.
    const cmd = this.hudL.commands;
    const right = cmd.mode === 'stack' ? cmd.rect.x - EDGE_PAD : VW;
    const bottom = cmd.mode === 'stack' && this.footTop < VH ? this.footTop - EDGE_PAD : VH;
    const p = openPanel(this, {
      kind: 'task',
      inspector: true,
      title: o.title,
      h: o.h,
      area: { x: 0, y: TOPBAR_H, w: right, h: bottom - TOPBAR_H },
      id: o.id,
      onClose: () => {
        this.inspector = false;
        this.panelR = null;
        this.coverHud();
        this.clampPan();
        o.onClose?.();
      },
    });
    // the footer action, centred and ≤ 240 wide (a button, not a banner: §2.3)
    const acts = o.actions ?? [];
    const bw = Math.min(BUTTON_MAX, p.w - 16);
    acts.forEach((a, i) => {
      const by = p.y + p.h - 8 - (acts.length - i) * (SHEET_ACTION_H + 4) + 4;
      const b = new MButton(this, p.x + Math.round((p.w - bw) / 2), by, bw, SHEET_ACTION_H, { variant: 'neutral', ...a });
      p.c.add(b);
      p.buttons.push(b);
    });
    this.inspector = true;
    this.panelR = { x: p.x, y: p.y, w: p.w, h: p.h, id: o.id };
    this.coverHud();
    this.clampPan();
    return acts.length ? { ...p, body: { ...p.body, h: p.body.h - acts.length * (SHEET_ACTION_H + 4) - 4 } } : p;
  }

  /** Height of the action strip: two rows of buttons. */
  private barH(): number {
    return this.barPad() * 2 + BTN_H * 2 + this.rowGap();
  }

  /** The strip's padding and row gap: tighter on a short portrait (Telegram at 320x568), so the field keeps 40% of the box. */
  private barPad(): number {
    return this.m.short ? 1 : BAR_PAD;
  }

  private rowGap(): number {
    return this.m.short ? 2 : ROW_GAP;
  }

  private buildHud(): void {
    const H = this.hud;
    H.removeAll(true);
    const card = this.hudL.card;
    const v5 = this.hudL.commands.mode === 'bar';
    // the top bar (back, the camp's name, gear), then the situation line with the purse, floating over the map
    this.topC = uiOpaque(this.add.container(0, 0));
    H.add(this.topC);
    this.topKey = '';
    this.sit = uiOpaque(new SituationLine(this, card.x, card.y, card.w, { compact: card.lines === 1, id: 'camp.situation' }));
    H.add(this.sit);
    this.sitKey = '';
    // v5: the open map starts under the card; in landscape it runs under the top bar and the card floats over it
    this.visTop = v5 ? this.sit.y + this.sit.h : this.view.y;
    const under = this.sit.y + this.sit.h;
    // a tap on the card is not a tap on the camp under it
    const block = uiIgnore(this.add.zone(this.sit.x, this.sit.y, this.sit.w, under - this.sit.y).setOrigin(0, 0).setInteractive());
    H.add(block);
    // the zoom key (WCAG 2.5.1: pinch is never the only way), under the card at its right
    H.add(new MIconButton(this, this.sit.x + this.sit.w - TAP_KEY, under + 4, TAP_KEY, TAP_KEY, { icon: 'eye', label: t('cmp.zoom'), tip: t('cmp.zoomTip'), variant: this.zoom > 1 ? 'lit' : 'neutral', onClick: () => this.toggleZoom(), id: 'camp.zoom' }));
    this.buildBar();
    this.refreshHud();
    this.coverHud();
  }

  /** The stone strip: rows of labelled buttons. */
  private buildBar(): void {
    const { VW, VH } = this.m;
    const cmd = this.hudL.commands;
    this.footTop = VH;
    if (cmd.mode === 'stack') {
      this.buildRail(cmd);
      return;
    }
    if (cmd.mode === 'row') {
      this.buildKeyRow(cmd);
      return;
    }
    const h = this.barH();
    const c = this.add.container(0, VH - h);
    this.bar = c;
    this.hud.add(uiOpaque(c));
    c.add(mosaicImage(this, 0, 0, VW, h, 'tabBar'));
    uiId(c, 'camp.strip');
    const rows = this.actionRows();
    // one row sits in the middle of the strip; two fill it
    const inner = h - this.barPad() * 2;
    const used = rows.length * BTN_H + (rows.length - 1) * this.rowGap();
    let y = this.barPad() + Math.round((inner - used) / 2);
    for (const row of rows) {
      this.layoutRow(c, row, y, cmd.x, cmd.w);
      y += BTN_H + this.rowGap();
    }
  }

  /**
   * Landscape: the tools stacked at the right edge, top to bottom in the strip's reading order, the primary (End day,
   * Place) at the foot (§12.2).
   */
  private buildRail(cmd: Extract<MapHudLayout['commands'], { mode: 'stack' }>): void {
    const bar = this.add.container(0, 0);
    this.bar = bar;
    this.hud.add(bar);
    const c = uiOpaque(this.add.container(0, 0));
    bar.add(c);
    uiId(c, 'camp.strip');
    const slots = this.actionRows().flat();
    const keys = stackKeys(cmd, RAIL_KEYS).slice(Math.max(0, RAIL_KEYS - slots.length));
    slots.forEach((sl, i) => {
      const k = keys[i];
      const variant: MButtonVariant = sl.off ? 'disabled' : sl.primary ? 'primary' : 'secondary';
      const b = new MButton(this, k.x, k.y, k.w, k.h, { label: sl.label, icon: sl.icon, variant, onClick: sl.onClick, disabledReason: sl.off, tip: sl.tip ?? sl.label, id: sl.id });
      c.add(sl.primary ? uiPrimary(b) : b);
    });
  }

  /**
   * Short landscape (the stack would run off the screen): the tools in one row along the foot at their natural widths,
   * right-aligned so the primary sits at the right end (the thumb), each key its own opaque cluster so the map shows
   * between them.
   */
  private buildKeyRow(cmd: Extract<MapHudLayout['commands'], { mode: 'row' }>): void {
    const bar = this.add.container(0, 0);
    this.bar = bar;
    this.hud.add(bar);
    const c = this.add.container(0, 0);
    bar.add(c);
    uiId(c, 'camp.strip');
    const slots = this.actionRows().flat();
    const r = cmd.rect;
    const room = r.w - cmd.gap * (slots.length - 1);
    const label = (sl: CampSlot) => Math.max(TAP_KEY, mw(sl.label.toUpperCase(), sl.off ? 'rOff' : 'rCream', 7) + 14);
    const withIcon = (sl: CampSlot) => label(sl) + (sl.icon ? 12 : 0);
    const icons = slots.reduce((a, sl) => a + withIcon(sl), 0) <= room;
    const nat = slots.map((sl) => (icons ? withIcon(sl) : label(sl)));
    const sum = nat.reduce((a, n) => a + n, 0);
    const ws = nat.map((n) => (sum <= room ? Math.ceil(n) : Math.max(TAP_KEY, Math.floor((n * room) / sum))));
    let x = r.x + r.w - (ws.reduce((a, n) => a + n, 0) + cmd.gap * (slots.length - 1));
    slots.forEach((sl, i) => {
      const variant: MButtonVariant = sl.off ? 'disabled' : sl.primary ? 'primary' : 'secondary';
      const b = new MButton(this, x, r.y, ws[i], cmd.keyH, { label: sl.label, icon: icons ? sl.icon : undefined, variant, onClick: sl.onClick, disabledReason: sl.off, tip: sl.tip ?? sl.label, id: sl.id });
      c.add(uiOpaque(sl.primary ? uiPrimary(b) : b));
      x += ws[i] + cmd.gap;
    });
    this.footTop = r.y;
  }

  /**
   * An inspector panel lies over the map: what of the HUD it covers (at 844x390 the card and the zoom key; in short
   * landscape the keys of the row under it) steps aside until it closes, so nothing is drawn or tapped under it; the
   * tool rail stays live beside it. What
   * steps aside is registered as collapsed into the panel's close key (element-parity: closing brings it back).
   */
  private coverHud(): void {
    const p = this.panelR;
    const S = this.m.S;
    const ids: string[] = [];
    const collect = (o: Phaser.GameObjects.GameObject) => {
      const id = (o as unknown as { __uiId?: string }).__uiId;
      if (id) ids.push(id);
      for (const k of (o as unknown as { list?: Phaser.GameObjects.GameObject[] }).list ?? []) collect(k);
    };
    type Part = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible & { list?: Part[]; __uiId?: string };
    // the strip's keys step aside one by one (a row along the foot is partly under the panel)
    const parts = (o: Part): Part[] => (o === (this.bar as unknown) ? (o.list ?? []).flatMap((k) => (k.__uiId === 'camp.strip' ? (k.list ?? []) : [k])) : [o]);
    for (const o of (this.hud.list as Part[]).flatMap(parts)) {
      const b = (o as unknown as { getBounds?: () => Phaser.Geom.Rectangle }).getBounds?.();
      if (!b) continue;
      const under = !!p && b.right > p.x * S + 0.5 && b.x < (p.x + p.w) * S - 0.5 && b.bottom > p.y * S + 0.5 && b.y < (p.y + p.h) * S - 0.5;
      o.setVisible(!under);
      if (under) collect(o);
    }
    if (p) for (const id of ids) uiCollapsed(this, id, `${p.id}.close`);
  }

  /** A row of buttons across the strip (`w` wide from `x0`): natural widths plus an equal share of what is left; icons go first when it is tight. */
  private layoutRow(c: Phaser.GameObjects.Container, row: CampSlot[], y: number, x0: number, w0: number): void {
    const room = w0 - BAR_PAD * 2 - GAP_BTN * (row.length - 1);
    const label = (sl: CampSlot) => mw(sl.label.toUpperCase(), sl.off ? 'rOff' : 'rCream', 7) + 14;
    const withIcon = (sl: CampSlot) => label(sl) + (sl.icon ? 12 : 0);
    const icons = row.reduce((a, sl) => a + withIcon(sl), 0) <= room;
    const nat = row.map((sl) => (icons ? withIcon(sl) : label(sl)));
    const sum = nat.reduce((a, n) => a + n, 0);
    const share = Math.floor((room - sum) / row.length);
    let x = x0 + BAR_PAD;
    row.forEach((sl, i) => {
      const w = i === row.length - 1 ? x0 + w0 - BAR_PAD - x : Math.max(TAP_KEY, sum <= room ? nat[i] + share : Math.floor((nat[i] * room) / sum));
      const variant: MButtonVariant = sl.off ? 'disabled' : sl.primary ? 'primary' : 'secondary';
      const b = new MButton(this, x, y, w, BTN_H, { label: sl.label, icon: icons ? sl.icon : undefined, variant, onClick: sl.onClick, disabledReason: sl.off, tip: sl.tip ?? sl.label, id: sl.id });
      c.add(sl.primary ? uiPrimary(b) : b);
      x += w + GAP_BTN;
    });
  }

  /** The top bar: the way back, "Field camp" and the gear (D9). */
  private setTop(title: string): void {
    if (title === this.topKey) return;
    this.topKey = title;
    this.topC.removeAll(true);
    addSubShell(this, { map: true, parent: this.topC, title, id: 'camp.topbar', actions: [gearAction(this)], back: this.inGameBack ? () => this.goBack() : undefined });
  }

  /** The situation line: a sentence that is never cut (A11Y-10), and the purse as chips in one order (P17). */
  private setSituation(tries: string[], chips: SituationChip[]): void {
    const sit = this.sit;
    if (!sit?.active) return;
    const lines = this.m.VH < 240 ? 1 : 2;
    const room = sit.w - 14;
    const sentence = tries.find((x) => x && wrapsWhole(x, room, lines)) ?? tries[tries.length - 1];
    const key = `${sentence}|${chips.map((c) => `${c.icon}${c.value}`).join(',')}`;
    if (key === this.sitKey) return;
    this.sitKey = key;
    sit.set(sentence, false, chips);
  }

  /** The actions, row by row. Field: Strike apart from End day (C-5: never next to the primary). */
  private actionRows(): CampSlot[][] {
    if (this.placing) {
      const why = this.placeWhy();
      return [
        [
          { label: t('common.cancel'), icon: 'close', onClick: () => this.cancelPlacing(), id: 'camp.cancel' },
          { label: t('cs.place'), icon: 'check', onClick: () => this.confirmPlacing(), primary: true, off: why ?? undefined, id: 'camp.place' },
        ],
      ];
    }
    return [
      [
        { label: t('cmp.strike'), icon: 'tent', onClick: () => this.strike(), tip: t('cmp.strikeTip'), id: 'camp.strike' },
        { label: t('cmp.muster'), icon: 'people', onClick: () => this.openMuster(), id: 'camp.muster', tip: t('cs.musterTip') },
        { label: t('cmp.loot'), icon: 'amphora', onClick: () => this.openLoot(), id: 'camp.loot', tip: t('cs.lootTip') },
      ],
      [
        { label: t('cmp.build'), icon: 'anvil', onClick: () => this.openBuild(), id: 'camp.build', tip: t('cmp.buildTip') },
        { label: t('cs.endDay'), icon: 'hourglass', onClick: () => this.endDay(), primary: true, id: 'camp.endDay', tip: t('cs.endDayTip') },
      ],
    ];
  }

  /** The strip again, when what it offers changed (a timer, a reason). */
  private refreshBar(): void {
    const key = JSON.stringify(this.actionRows().map((r) => r.map((sl) => [sl.label, sl.off ?? ''])));
    if (key === this.barKey && this.bar?.active) return;
    this.barKey = key;
    this.bar?.destroy();
    this.buildBar();
    this.coverHud();
  }

  private barKey = '';

  refreshHud(): void {
    if (!this.sit?.active) return;
    const w = state.campaign.world;
    const s = w.s;
    const day = Math.floor(s.time / 24) + 1;
    const h = Math.floor(s.time % 24);
    const hh = `${String(h).padStart(2, '0')}:00`;
    this.setTop(t('cmp.field.title'));
    const where = t('cmp.where', { d: day, h: this.isNight() ? t('cmp.night', { h: hh }) : hh, place: regionLabel(w.map, s.x, s.y) });
    const c = w.camp;
    const tries: string[] = [];
    if (this.placing) {
      const hint = t('cmp.place.hint', { name: structName(this.placing.id) });
      const bad = this.placeWhy() ? ` ${t('cmp.place.bad')}` : '';
      tries.push(`${hint}${bad}`, hint);
    } else if (this.selected !== null && c?.built[Number(this.selected)]) {
      const b = c.built[Number(this.selected)];
      const line = t('cmp.selected', { name: structName(b.id), desc: structDesc(b.id) });
      if (b.id === 'forge') tries.push(`${line} ${t('cmp.forgeHint')}`);
      tries.push(`${where} ${line}`, line);
    } else if (c) {
      const fx = campEffects(w.map, c);
      const net = fx.forage * 24 - state.campaign.data.heroes.length;
      const p = { heal: localDecimals(w.healRate().toFixed(1)), food: fmtSigned(net) };
      tries.push(`${where} ${t('cmp.line', p)} ${t('cmp.hint')}`, `${where} ${t('cmp.line', p)}`, `${where} ${t('cmp.lineShort', p)}`, t('cmp.lineShort', p));
    }
    this.setSituation(tries, this.fieldChips());
    this.refreshBar();
    this.applyTint();
  }

  /** Gold, men, food, supplies: the World's order (WLD-5, P17). */
  private fieldChips(): SituationChip[] {
    const c = state.campaign;
    const w = c.world;
    const mouths = c.data.heroes.length;
    const days = w.foodDays(mouths);
    const food = Math.floor(w.food);
    return [
      { icon: 'coin', value: `${c.data.gold}`, id: 'camp.gold' },
      { icon: 'people', value: `${c.fitHeroes().length}/${mouths}`, id: 'camp.men' },
      { icon: 'food', short: `${food}${w.starving ? '!' : ''}`, value: w.starving ? `${food}!` : `${food} (${days < 1 ? '<1' : Math.floor(days)}${t('mosaic.cmap.dayShort')})`, id: 'camp.food' },
      { icon: 'wood', value: `${Math.floor(w.supplies)}`, id: 'camp.supplies' },
    ];
  }

  /** Why the placement ghost cannot go down where it stands (localized), or null. */
  private placeWhy(): string | null {
    const p = this.placing;
    const w = state.campaign.world;
    if (!p || !w.camp) return null;
    const why = fieldBuildWhy(w, p.id);
    if (why) return why;
    return placeCheck(w.map, w.camp, p.id, p.x, p.y).ok ? null : t('cmp.place.bad');
  }

  // ================================================================ the Build drawer

  /** Build: a labelled list of what the camp can build (CMP-1); a row starts its placement. */
  openBuild(): void {
    const w = state.campaign.world;
    const c = w.camp;
    if (!c) return;
    const rows = STRUCTURE_LIST.map((d) => {
      const n = countBuilt(c, d.id);
      const why = fieldBuildWhy(w, d.id);
      return {
        icon: FIELD_ICON[d.id],
        title: structName(d.id),
        meta: t('cmp.drawer.meta', { cost: d.cost, time: hoursText(d.hours) }),
        more: why ? [why] : undefined,
        right: t('cmp.drawer.count', { n, max: d.max }),
        off: !!why,
        why,
        id: d.id,
      };
    });
    const supplies = Math.floor(w.supplies);
    const all = [...rows, { icon: 'works', title: t('cmp.drawer.works'), meta: t('cmp.drawer.worksMeta', { n: supplies }), right: '', off: false, why: null as string | null, id: 'works' as const }];
    this.openList(t('cmp.drawer.title'), 'camp.drawer', all, (i, md) => {
      const r = all[i];
      if (r.id === 'works') {
        md.close();
        this.openSupplies();
        return;
      }
      if (r.why) {
        hapticNotify('error');
        toast(this, r.why, 'bad');
        return;
      }
      md.close();
      this.startPlacing(r.id);
    });
  }

  /** A sheet with a scrolling list of labelled rows (icon, name, a line or two of detail, a count at the right). */
  private openList(title: string, id: string, rows: ListRow[], onTap: (i: number, md: ParchmentSheetHandle) => void): void {
    const { VW, VH } = this.m;
    const extra = Math.max(0, ...rows.map((r) => r.more?.length ?? 0));
    const rowH = ROW_H + extra * LH - (extra ? 2 : 0);
    const w = Math.min(VW - 12, 240);
    const h = Math.min(VH - 12, 26 + rows.length * (rowH + ROW_GAP_LIST) + 14);
    const md = this.openSheet({ title, w, h, id, onClose: () => (this.modal = null) });
    this.modal = md;
    const b = md.body;
    const list = new ScrollList(this, md.c, b.x, b.y, b.w, b.h, {
      count: rows.length,
      rowH,
      gap: ROW_GAP_LIST,
      render: (i, row, rw) => this.drawRow(row, rw, rowH, rows[i]),
      onTap: (i) => onTap(i, md),
      id: (i) => `${id}.row.${rows[i].id}`,
    });
    frameScrollTexts(list.area, b.w);
  }

  /** One list row on parchment: an icon well, the name (Inter, never Cinzel-then-Inter per row, CMP-3), the detail, a count. */
  private drawRow(row: Phaser.GameObjects.Container, rw: number, rh: number, r: ListRow): void {
    row.add(mosaicImage(this, 0, 0, rw, rh, 'parchment'));
    const th = ROW_H - 6;
    let x0 = 4;
    if (r.icon) {
      row.add(mosaicImage(this, 3, Math.round((rh - th) / 2), th, th, 'parchmentWell'));
      const ic = scaleIcon(addIcon(this, 0, 0, r.icon, r.off ? 'D' : ''), Math.min(1.4, (th - 4) / 12));
      ic.setPosition(3 + Math.round((th - ic.displayWidth) / 2), Math.round((rh - th) / 2) + Math.round((th - ic.displayHeight) / 2));
      row.add(ic);
      x0 = th + 8;
    }
    const box = { owner: row, w: rw, h: rh };
    const rightW = r.right ? mw(r.right, 'pInk', 7) + 6 : 0;
    const y0 = Math.round((rh - (10 + LH * (1 + (r.more?.length ?? 0)))) / 2);
    row.add(mtext(this, x0, y0, r.title, r.off ? 'pOff' : 'pInk', { maxW: rw - x0 - 4 - rightW, box }));
    if (r.right) row.add(mtext(this, rw - 4, y0, r.right, 'pInk', { align: 1, box }));
    if (r.cost) {
      // icon and number per currency; tighter when four of them must share a narrow row
      const room = rw - x0 - 4;
      const natural = r.cost.reduce((a, c) => a + 10 + Math.ceil(mw(c.n, 'pInk', TEXT_MIN)) + 5, 0) - 5;
      const tight = natural > room;
      let x = x0;
      for (const c of r.cost) {
        row.add(scaleIcon(addIcon(this, x, y0 + 10 + (tight ? 1 : 0), c.icon), tight ? 0.6 : 0.7));
        x += tight ? 8 : 10;
        row.add(mtext(this, x, y0 + 10, c.n, 'pInk', { size: TEXT_MIN, box }));
        x += Math.ceil(mw(c.n, 'pInk', TEXT_MIN)) + (tight ? 3 : 5);
      }
    } else row.add(mtext(this, x0, y0 + 10, r.meta, 'pSec', { size: TEXT_MIN, maxW: rw - x0 - 4, box }));
    (r.more ?? []).forEach((l, i) => row.add(mtext(this, x0, y0 + 10 + LH * (i + 1), l, 'pSec', { size: TEXT_MIN, maxW: rw - x0 - 4, box })));
  }

  /** Supplies and field works (field-works.md R4): what the supplies buy for the next battle, and what each work costs. */
  openSupplies(): void {
    const w = state.campaign.world;
    const { VW, VH } = this.m;
    const sw = Math.min(VW - 12, 240);
    const pad = 8;
    // the scroll area's width, less a margin (the bitmap face runs a little wider than its measure)
    const tw = sw - pad * 2 - 12;
    const wrap = (w: number) => [wrapWords(t('cmp.sup.body', { max: WORKS.max }), w, (q) => mw(q, 'pSec', TEXT_MIN)), wrapWords(t('cmp.sup.more'), w, (q) => mw(q, 'pSec', TEXT_MIN))];
    let [body, more] = wrap(tw);
    const allow = worksAllowance(w.supplies);
    const contentH = 12 + body.length * LH + 4 + WORK_TYPES.length * (ROW_H + ROW_GAP_LIST) + 2 + more.length * LH;
    const h = Math.min(VH - 12, 26 + contentH + 8 + 24 + 10);
    const md = this.openSheet({
      title: t('cmp.sup.title'),
      w: sw,
      h,
      id: 'camp.supplies.sheet',
      actions: [{ label: t('cmp.sup.back'), icon: 'anvil', variant: 'secondary', id: 'camp.supplies.build', onClick: () => (md.close(), this.openBuild()) }],
      onClose: () => (this.modal = null),
    });
    this.modal = md;
    const b = md.body;
    // a side panel can be narrower than the sheet asked for: the words wrap to its box (v5's sheet keeps v5's lines)
    if (this.inspector) [body, more] = wrap(b.w - 12);
    const area = new ScrollArea(this, md.c, b.x, b.y, b.w, b.h, this.m.S);
    const C = area.content;
    let y = 0;
    C.add(mtext(this, 0, y, t('cmp.sup.have', { n: Math.floor(w.supplies) }), 'pInk', { maxW: b.w }));
    y += 12;
    body.forEach((l) => {
      C.add(mtext(this, 0, y, l, 'pSec', { size: TEXT_MIN }));
      y += LH;
    });
    y += 4;
    for (const k of WORK_TYPES) {
      const row = this.add.container(0, y);
      C.add(row);
      const n = allow[k];
      this.drawRow(row, b.w, ROW_H, { icon: '', title: t(`works.${k}.name` as TKey), meta: t('cmp.sup.row', { cost: WORKS.cost[k] }), right: n > 0 ? t('cmp.sup.can', { n }) : t('cmp.sup.none'), off: false, why: null, id: k });
      uiId(row, `camp.supplies.${k}`);
      y += ROW_H + ROW_GAP_LIST;
    }
    y += 2;
    more.forEach((l) => {
      C.add(mtext(this, 0, y, l, 'pSec', { size: TEXT_MIN }));
      y += LH;
    });
    area.setContentHeight(y);
    frameScrollTexts(area, b.w);
  }

  // ================================================================ field actions

  private startPlacing(id: StructureId): void {
    const w = state.campaign.world;
    const c = w.camp;
    if (!c) return;
    const at = freeSpot(w.map, c, id) ?? { x: c.x, y: c.y };
    this.placing = { id, x: at.x, y: at.y };
    this.selected = null;
    this.rebuild();
    this.buildHud();
    // the ghost in the middle of the view, never off screen (CMP-5)
    const gh = this.layout?.things.find((th) => th.key.startsWith('ghost:'));
    if (gh) {
      const g = Iso.groundScreen(gh.x + gh.w / 2, gh.y + gh.h / 2);
      this.lookAt(g.x, g.y);
    }
    haptic('light');
  }

  private cancelPlacing(): void {
    this.placing = null;
    this.rebuild();
    this.buildHud();
  }

  private confirmPlacing(): void {
    const p = this.placing;
    if (!p) return;
    const w = state.campaign.world;
    const why = this.placeWhy();
    if (why || w.build(p.id, p.x, p.y)) {
      hapticNotify('error');
      toast(this, why ?? t('cmp.place.bad'), 'bad');
      return;
    }
    const d = STRUCTURES[p.id];
    this.placing = null;
    this.construct = { id: p.id, x: p.x, y: p.y, t0: this.time.now, stage: 0 };
    this.rebuild();
    this.puffAt(p.x, p.y, d.w, d.h);
    hapticNotify('success');
    const passed = this.passTime(d.hours);
    this.buildHud();
    toast(this, t('cs.builtIn', { name: structName(p.id), h: d.hours }), 'good');
    void state.save();
    if (passed === 'event') this.openEvent();
  }

  private constructIndex(): number {
    const c = state.campaign.world.camp;
    const k = this.construct;
    if (!c || !k) return -1;
    return c.built.findIndex((b) => b.id === k.id && b.x === k.x && b.y === k.y);
  }

  /** Construction stages: pegs, the frame, the half-built structure, then the finished one (dust at each step). */
  private tickConstruct(now: number): void {
    const k = this.construct!;
    const stage = Math.min(3, Math.floor((now - k.t0) / 450));
    if (stage === k.stage) return;
    k.stage = stage;
    if (stage >= 3) this.construct = null;
    this.rebuild();
    this.puffAt(k.x, k.y, STRUCTURES[k.id].w, STRUCTURES[k.id].h);
  }

  private puffAt(mx: number, my: number, w: number, h: number): void {
    const L = this.layout;
    if (!L) return;
    for (let f = 0; f < 3; f++) if (!this.textures.exists(`ci_dust${f}`)) this.textures.addCanvas(`ci_dust${f}`, Iso.renderDust(f).toCanvas());
    const at = L.toIso(mx, my);
    const ww = w * 2;
    const hh = h * 2;
    const c = Iso.groundScreen(at.x + ww / 2, at.y + hh / 2);
    for (let i = 0; i < 2; i++) {
      const img = this.add.image(c.x - 10 + (i ? 8 : -8), c.y - 6 + (i ? 3 : -2), 'ci_dust0').setOrigin(0, 0).setDepth(1e5 + c.y);
      this.world.add(img);
      [1, 2].forEach((f) => this.time.delayedCall(f * 110 + i * 60, () => img.active && img.setTexture(`ci_dust${f}`)));
      this.time.delayedCall(360 + i * 60, () => img.destroy());
    }
    haptic('medium');
  }

  /**
   * Let `hours` pass in camp (building, the night); an encounter sends the party back to the map. An
   * event stops the clock (R4.2): the night ends there and its card opens over the camp.
   */
  private passTime(hours: number): boolean | 'event' {
    const c = state.campaign;
    const w = c.world;
    const r = w.advance(hours, c.playerInfo(), true);
    c.tickWorld(r.hours);
    const ev = r.events.find((e) => e.type === 'encounter');
    if (ev && ev.type === 'encounter') {
      void state.save();
      this.scene.start('World', { encounter: ev.party });
      return false;
    }
    this.refreshHud();
    return w.s.pendingEvent ? 'event' : true;
  }

  /** End the day: the camp rests until dawn (06:00), hour by hour, healing and foraging. */
  private endDay(): void {
    const w = state.campaign.world;
    const h = Math.floor(w.s.time % 24);
    const hours = h < 6 ? 6 - h : 30 - h;
    // an open inspector shows the camp as it was: the night closes it
    this.modal?.close();
    this.hud.setVisible(false);
    const veil = this.add.rectangle(0, 0, this.m.VW, this.m.VH, 0x100c1c, 0).setOrigin(0, 0).setDepth(9e6);
    this.ui.add(veil);
    this.tweens.add({
      targets: veil,
      fillAlpha: 0.85,
      duration: motion.reduced ? 0 : 350,
      onComplete: () => {
        let ok: boolean | 'event' = true;
        for (let i = 0; i < hours && ok === true; i++) ok = this.passTime(1);
        if (!ok) return;
        void state.save();
        this.rebuild();
        this.buildHud();
        this.hud.setVisible(true);
        // an event in the night: its card, and no dawn yet (End day again rests on to dawn)
        if (ok === 'event') this.openEvent();
        else toast(this, t('cs.dawn', { d: Math.floor(w.s.time / 24) + 1 }), 'info');
        this.tweens.add({ targets: veil, fillAlpha: 0, duration: motion.reduced ? 0 : 500, onComplete: () => veil.destroy() });
      },
    });
  }

  private strike(): void {
    const w = state.campaign.world;
    const c = w.camp;
    if (!c) return;
    confirmDialog(this, {
      title: t('cs.strikeQ'),
      body: t('cs.strikeBody', { n: Math.floor(c.built.reduce((a, b) => a + STRUCTURES[b.id].cost, 0) / 2) }),
      ok: t('cs.strike'),
      destructive: true,
      onOk: () => {
        const got = w.breakCamp();
        void state.save();
        if (got > 0) toast(this, t('cs.struck', { n: got }), 'good');
        this.scene.start('World', {});
      },
    });
  }

  /** The forge: temper an equipped item one rarity step finer, for supplies and gold; one cost line per row, the rarity in words (CMP-4). */
  private openTemper(): void {
    const camp = state.campaign;
    const w = camp.world;
    const items: { item: Item; who: string; cost: { supplies: number; gold: number } }[] = [];
    for (const h of camp.data.heroes) {
      for (const it of Object.values(h.equip)) {
        const cost = it ? camp.temperCost(it) : null;
        if (it && cost) items.push({ item: it, who: heroName(h.name), cost });
      }
    }
    items.sort((a, b) => itemDef(b.item.def).value - itemDef(a.item.def).value);
    const { VW, VH } = this.m;
    // name, the rarity step and whose it is across the row (one line when it fits); under them the cost line beside
    // the Temper button. The rows share one height, so a narrow screen gives every row the owner's own line.
    const tw0 = Math.min(VW - 12, 240) - 16 - 8 - 4;
    const ownLine = items.some((e) => {
      const r = normalizeRarity(e.item.rarity);
      const next = RARITIES[Math.min(RARITIES.length - 1, RARITIES.indexOf(r) + 1)];
      return mw(`${t('cmp.temper.step', { from: t(`rarity.${r}` as TKey), to: t(`rarity.${next}` as TKey) })} · ${e.who}`, 'pSec', TEXT_MIN) > tw0 - 4;
    });
    const rowH = 3 + 10 + LH * (ownLine ? 2 : 1) + BTN_H + 4;
    const sw = Math.min(VW - 12, 240);
    const h = Math.min(VH - 12, 26 + Math.max(1, items.length) * (rowH + ROW_GAP_LIST) + 14);
    const md = this.openSheet({ title: t('cmp.temper.title'), w: sw, h, id: 'camp.temper.sheet', onClose: () => (this.modal = null) });
    this.modal = md;
    const b = md.body;
    if (!items.length) {
      md.c.add(mtext(this, b.x, b.y + 4, t('cmp.temper.none'), 'pSec', { maxW: b.w }));
      return;
    }
    const btnW = Math.max(44, Math.ceil(mw(t('cmp.temper.do').toUpperCase(), 'rCream', 7)) + 14);
    const list = new ScrollList(this, md.c, b.x, b.y, b.w, b.h, {
      count: items.length,
      rowH,
      gap: ROW_GAP_LIST,
      render: (i, row, rw) => {
        const e = items[i];
        const r = normalizeRarity(e.item.rarity);
        const next = RARITIES[Math.min(RARITIES.length - 1, RARITIES.indexOf(r) + 1)];
        const box = { owner: row, w: rw, h: rowH };
        const tw = rw - 8;
        row.add(mosaicImage(this, 0, 0, rw, rowH, 'parchment'));
        row.add(mtext(this, 4, 3, itemName(e.item), 'pInk', { maxW: tw, box }));
        // whose it is goes on the step line when it fits there, else on the cost line
        const step = t('cmp.temper.step', { from: t(`rarity.${r}` as TKey), to: t(`rarity.${next}` as TKey) });
        row.add(mtext(this, 4, 13, ownLine ? step : `${step} · ${e.who}`, 'pSec', { size: TEXT_MIN, maxW: tw, box }));
        if (ownLine) row.add(mtext(this, 4, 13 + LH, e.who, 'pSec', { size: TEXT_MIN, maxW: tw, box }));
        // the one cost line: supplies and gold, each with its icon
        let x = 4;
        const by = 13 + LH * (ownLine ? 2 : 1) + 1;
        const cy = by + Math.round((BTN_H - 9) / 2);
        for (const [icon, n, short] of [['wood', e.cost.supplies, w.supplies < e.cost.supplies], ['coin', e.cost.gold, camp.data.gold < e.cost.gold]] as const) {
          row.add(scaleIcon(addIcon(this, x, cy, icon), 0.7));
          x += 10;
          const txt = mtext(this, x, cy + 1, `${n}`, short ? 'pBad' : 'pInk', { size: TEXT_MIN, box });
          row.add(txt);
          x += Math.ceil(mw(`${n}`, 'pInk', TEXT_MIN)) + 6;
        }
        const why = w.supplies < e.cost.supplies ? t('cs.needSupplies', { n: e.cost.supplies }) : camp.data.gold < e.cost.gold ? t('cmp.temper.noGold', { n: e.cost.gold }) : undefined;
        row.add(
          // on the narrowest screens the button gives way to the cost line (its label shrinks, never the numbers)
          new MButton(this, rw - Math.min(btnW, rw - x - 5) - 3, by, Math.min(btnW, rw - x - 5), BTN_H, {
            label: t('cmp.temper.do'),
            variant: why ? 'disabled' : 'secondary',
            disabledReason: why,
            id: `camp.temper.do.${i}`,
            onClick: () => {
              if (!camp.temper(e.item)) return;
              hapticNotify('success');
              md.close();
              toast(this, t('cs.tempered', { name: itemName(e.item) }), 'good');
              this.buildHud();
              void state.save();
            },
          }),
        );
      },
      id: (i) => `camp.temper.row.${i}`,
      // every row's Temper key, built or scrolled out of the panel (element-parity, V6-066)
      ids: (i) => [`camp.temper.do.${i}`],
    });
    frameScrollTexts(list.area, b.w);
  }

  // ================================================================ management

  private openLoot(): void {
    this.scene.start('Army', { from: 'Camp', tab: 'stash' });
  }

  /**
   * The muster (CMP-3): per kind of man, how many march (bronze steppers), with a legend for the counts; then
   * every man in two columns, Formation and Reserve; a tap moves him across. Ink on parchment, one face per row.
   */
  private openMuster(): void {
    this.musterList = this.muster();
    const before = this.musterList.map((h) => ({ ...h }));
    const { VW, VH } = this.m;
    const w = Math.min(VW - 12, 250);
    const h = Math.min(VH - 12, 330);
    const m = this.openSheet({
      title: t('cmp.muster.title'),
      w,
      h,
      id: 'camp.muster.sheet',
      onClose: () => {
        this.modal = null;
        const changes = reserveChanges(before, this.musterList);
        if (Object.keys(changes).length) this.saveReserve(changes);
      },
    });
    this.modal = m;
    const b = m.body;
    const content = this.add.container(0, 0);
    m.c.add(content);
    const legend = wrapWords(t('cmp.muster.legend'), b.w, (q) => mw(q, 'pSec', TEXT_MIN));
    const tap = wrapWords(t('cmp.muster.tap'), b.w, (q) => mw(q, 'pSec', TEXT_MIN));
    const render = () => {
      content.removeAll(true);
      const mm = this.musterList;
      const field = fieldIds(mm);
      const fieldSet = new Set(field);
      let y = b.y;
      legend.forEach((l) => {
        content.add(mtext(this, b.x, y, l, 'pSec', { size: TEXT_MIN }));
        y += LH;
      });
      y += 2;
      // per kind: name, marching / all (resting), then - and + (bronze; grey only when they cannot act, with the reason)
      const rows = classRows(mm);
      const rowH = 24;
      const listH = Math.max(rowH, Math.min(rows.length * (rowH + ROW_GAP_LIST), Math.floor(b.h * 0.36)));
      const kinds = new ScrollList(this, content, b.x, y, b.w, listH, {
        count: rows.length,
        rowH,
        gap: ROW_GAP_LIST,
        render: (i, row, rw) => {
          const r = rows[i];
          const sw = 24;
          const face = rw - sw * 2 - 8;
          row.add(mosaicImage(this, 0, 0, face, rowH, 'parchment'));
          const box = { owner: row, w: face, h: rowH };
          // the name over its count, so neither is cut at 320 (CMP-3)
          const name = clsName(r.cls);
          const size = mw(name, 'pInk', 7) <= face - 8 ? 7 : TEXT_MIN;
          row.add(mtext(this, 4, 2, name, 'pInk', { size, maxW: face - 8, box }));
          row.add(mtext(this, 4, 12, `${r.field}/${r.total}${r.wounded ? ` (${r.wounded})` : ''}`, 'pSec', { size: TEXT_MIN, box }));
          const minus = new MButton(this, rw - sw * 2 - 4, 0, sw, rowH, { label: '-', variant: 'secondary', tip: t('cs.reserve'), id: `camp.muster.minus.${r.cls}`, onClick: () => this.shift(r.cls, -1, render) });
          const plus = new MButton(this, rw - sw, 0, sw, rowH, { label: '+', variant: 'secondary', tip: t('cs.field'), id: `camp.muster.plus.${r.cls}`, onClick: () => this.shift(r.cls, 1, render) });
          if (r.field <= 0) minus.setEnabled(false, t('cs.why.none'));
          if (r.field >= r.total - r.wounded) plus.setEnabled(false, t('cs.why.wounded'));
          row.add([minus, plus]);
        },
        id: (i) => `camp.muster.type.${i}`,
      });
      frameScrollTexts(kinds.area, b.w);
      y += listH + 4;
      tap.forEach((l) => {
        content.add(mtext(this, b.x, y, l, 'pSec', { size: TEXT_MIN }));
        y += LH;
      });
      y += 2;
      // two columns: who marches, who stays
      const colW = Math.floor((b.w - 4) / 2);
      const cols: { x: number; title: string; men: MusterHero[]; id: string }[] = [
        { x: b.x, title: t('cmp.muster.formation', { n: field.length, max: MUSTER.fieldCap }), men: mm.filter((x) => fieldSet.has(x.id) && !x.wounded), id: 'formation' },
        { x: b.x + colW + 4, title: t('cmp.muster.reserve', { n: mm.length - field.length }), men: mm.filter((x) => !fieldSet.has(x.id) || x.wounded), id: 'reserve' },
      ];
      const listY = y + 11;
      const colH = Math.max(rowH, b.y + b.h - listY - 2);
      for (const col of cols) {
        content.add(mtext(this, col.x, y, col.title, 'pInk', { maxW: colW }));
        if (!col.men.length) {
          content.add(mtext(this, col.x + 2, listY + 4, t('cmp.muster.empty'), 'pSec', { size: TEXT_MIN, maxW: colW - 4 }));
          continue;
        }
        const men = new ScrollList(this, content, col.x, listY, colW, colH, {
          count: col.men.length,
          rowH: 10 + LH + 6,
          gap: ROW_GAP_LIST,
          render: (i, row, rw, rh) => {
            const man = col.men[i];
            row.add(mosaicImage(this, 0, 0, rw, rh, col.id === 'formation' ? 'parchmentSel' : 'parchment'));
            const box = { owner: row, w: rw, h: rh };
            row.add(mtext(this, 3, 3, heroName(man.name), 'pInk', { maxW: rw - 6, box }));
            const sub = man.wounded ? t('cmp.muster.resting') : t('cmp.muster.man', { cls: clsName(man.cls), n: man.level });
            row.add(mtext(this, 3, 13, sub, 'pSec', { size: TEXT_MIN, maxW: rw - 6, box }));
          },
          onTap: (i) => {
            const r = toggleReserve(this.musterList, col.men[i].id);
            if (!r.ok) {
              toast(this, this.musterWhy(r.why), 'bad');
              hapticNotify('error');
              return;
            }
            haptic('light');
            render();
          },
          id: (i) => `camp.muster.${col.id}.${i}`,
        });
        frameScrollTexts(men.area, colW);
      }
    };
    render();
  }

  private shift(cls: MusterHero['cls'], dir: 1 | -1, render: () => void): void {
    const r = shiftClass(this.musterList, cls, dir);
    if (!r.ok) {
      toast(this, this.musterWhy(r.why), 'bad');
      hapticNotify('error');
      return;
    }
    haptic('light');
    render();
  }

  private musterWhy(why: MusterWhy): string {
    return t(`cs.why.${why}` as TKey, { max: why === 'group' ? MUSTER.groupCap : MUSTER.fieldCap });
  }

  private saveReserve(changes: Record<string, boolean>): void {
    for (const [id, on] of Object.entries(changes)) state.campaign.setReserve(id, on);
    void state.save();
    this.rebuild();
    this.buildHud();
  }
}

// ------------------------------------------------------------------ helpers

/** UI px of a square key (48 pt). */
const TAP_KEY = 24;
/** Keys the landscape tool rail holds (the field camp's five tools; fewer sit at its foot). */
const RAIL_KEYS = 5;
/** Between two buttons of a row (8 pt). */
const GAP_BTN = 4;

/** A button of the action strip. */
interface CampSlot {
  label: string;
  icon?: string;
  onClick: () => void;
  primary?: boolean;
  /** Cannot right now, and why (grey; a tap says it). */
  off?: string;
  tip?: string;
  id: string;
}

/** A row of the Build drawer or the supplies page. */
interface ListRow {
  icon: string;
  title: string;
  meta: string;
  /** More lines of detail under `meta` (time, why not). */
  more?: string[];
  /** The cost as icons and numbers, in place of `meta`. */
  cost?: { icon: string; n: string }[];
  right: string;
  off: boolean;
  why: string | null;
  id: string;
}

export const structName = (id: StructureId): string => t(`wld.struct.${id}.name` as TKey);
const structDesc = (id: StructureId): string => t(`wld.struct.${id}.desc` as TKey);

/** Hours of work as "3 h" or "30 min". */
export function hoursText(h: number): string {
  return h < 1 ? t('cmp.minutes', { m: Math.round(h * 60) }) : t('cmp.hours', { h });
}

/** Why a structure cannot be built in the field camp right now (count, supplies, room), in the player's language; null when it can. */
export function fieldBuildWhy(w: World, id: StructureId): string | null {
  const c = w.camp;
  if (!c) return t('ocamp.why.notCamp');
  const d = STRUCTURES[id];
  if (countBuilt(c, id) >= d.max) return t('cmp.drawer.why.full');
  if (w.supplies < d.cost) return t('cmp.drawer.why.supplies', { n: d.cost });
  if (!freeSpot(w.map, c, id)) return t('cmp.drawer.why.room');
  return null;
}

/** world/map.ts TERRAIN_NAMES, in words of the current language (as the World map's top bar, WLD-01). */
const TERRAIN_KEYS = ['deepSea', 'sea', 'shore', 'plain', 'scrub', 'forest', 'hills', 'mountains'] as const;

/** Where the camp stands: a road, a ford, else the terrain. */
function regionLabel(m: WorldMap, x: number, y: number): string {
  const tx = Math.max(0, Math.min(m.w - 1, Math.floor(x)));
  const ty = Math.max(0, Math.min(m.h - 1, Math.floor(y)));
  const i = ty * m.w + tx;
  const k = m.road[i] ? 'road' : m.river[i] ? 'ford' : TERRAIN_KEYS[m.terrain[i]] ?? 'plain';
  return t(`wld.region.${k}` as TKey);
}

const clsName = (c: ClassId): string => tOr(`class.${c}.name`, CLASSES[c].name);

function hashKinds(k: Uint8Array): number {
  let h = 2166136261;
  for (let i = 0; i < k.length; i++) h = Math.imul(h ^ k[i], 16777619);
  return h >>> 0;
}

/** Renders a camp sprite by key (see src/world/campLayout.ts for the keys). */
function renderKey(key: string): Iso.IsoSprite {
  if (key.startsWith('half:')) {
    // the half-built structure inside its scaffold frame
    const cut = Iso.cutSprite(renderKey(key.slice(5)), 0.48);
    const fp = /^[a-z]+(\d)?/.exec(key.slice(5));
    const size = fp && (key.slice(5).startsWith('pavilion3') ? 3 : key.slice(5).startsWith('ridge') || key.slice(5).startsWith('tower') ? 1 : 2);
    const frame = Iso.renderSite(size || 2, size || 2, 1);
    const px = new Pix(Math.max(cut.px.w, frame.px.w + Math.abs(cut.ox - frame.ox)), Math.max(cut.px.h, frame.px.h + Math.abs(cut.oy - frame.oy)));
    const ox = Math.max(cut.ox, frame.ox);
    const oy = Math.max(cut.oy, frame.oy);
    px.blit(cut.px, ox - cut.ox, oy - cut.oy);
    px.blit(frame.px, ox - frame.ox, oy - frame.oy);
    return { px, ox, oy };
  }
  const site = /^site(\d+)x(\d+)_(\d)$/.exec(key);
  if (site) return Iso.renderSite(Number(site[1]), Number(site[2]), site[3] === '1' ? 1 : 0);
  const m = /^([a-zA-Z]+)(\d*)(?:_(\d+))?(b?)$/.exec(key);
  const name = m?.[1] ?? key;
  const n = m?.[2] ? Number(m[2]) : 0;
  const seed = m?.[3] ? Number(m[3]) : 0;
  const alt = m?.[4] === 'b';
  switch (name) {
    case 'pavilion':
      return Iso.renderPavilion(n === 3 ? 3 : 2);
    case 'bell':
      return Iso.renderBellTent(n);
    case 'ridge':
      return Iso.renderRidgeTent(n);
    case 'shed':
      return Iso.renderShed(n);
    case 'stall':
      return Iso.renderStall();
    case 'forge':
      return Iso.renderForge(Math.max(1, n));
    case 'stakesX':
      return Iso.renderStakes(0, seed);
    case 'stakesY':
      return Iso.renderStakes(1, seed);
    case 'gate':
      return Iso.renderGate(n === 1 ? 1 : 0);
    case 'dummy':
      return Iso.renderDummy(n);
    case 'target':
      return Iso.renderTarget();
    case 'rack':
      return Iso.renderRack();
    case 'banner':
      return Iso.renderBanner(n);
    case 'firepit':
      return Iso.renderFirePit();
    case 'props':
      return Iso.renderProps(n);
    case 'tree':
      return Iso.renderTree(n, seed, alt ? 1 : 0);
    case 'rocks':
      return Iso.renderRocks(n, seed);
    case 'ruin':
      return Iso.renderRuin();
    case 'shipX':
      return Iso.renderShip(false);
    case 'shipY':
      return Iso.renderShip(true);
    case 'yard':
      return Iso.renderYard(4, 4);
    default: {
      const px = new Pix(4, 4);
      px.rect(0, 0, 4, 4, 0xff00ff);
      return { px, ox: 2, oy: 2 };
    }
  }
}

export { facingOf };
