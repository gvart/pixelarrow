/**
 * The camp: a full isometric scene (docs/ART_STYLE.md, art in
 * src/art/campIso.ts, layout in src/world/campLayout.ts) for both the
 * offline field camp (src/world/camp.ts) and the online camps
 * (src/online/camps.ts). The clearing with its pavilion, tents, sheds, stall
 * and forge is a pannable world container: the ground is baked into one
 * texture, every structure is a cached sprite sorted by its feet, and the
 * life (src/ui/campIsoLife.ts) is a dozen figures, some animals, smoke and
 * sparks. Around it the UI of the reference: a resource strip on top, the
 * column toolbar of structures on the right (a placement ghost with its
 * valid / invalid footprint, construction stages and dust), and a parchment
 * strip below with the day clock, End day (field) / Rest (online), the
 * muster (who marches in the formation, who stays as the reserve) and the
 * loot. Portrait-first: everything fits 320 x 568 at scale 2.
 */
import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { scaleIcon, Button, addIcon, addPanel, addText } from '../ui/kit';
import { confirmDialog, openModal, toast, ScrollList, type Modal } from '../ui/widgets';
import { SIZE } from '../ui/theme';
import { ensureFonts } from '../ui/fonts';
import { ellipsize } from '../ui/textfit';
import { uiIgnore } from '../ui/layout';
import { haptic, hapticNotify } from '../platform/telegram';
import { state } from '../state';
import { t, tOr, type TKey } from '../i18n';
import { Pix } from '../art/pixels';
import * as Iso from '../art/campIso';
import { fieldLayout, onlineLayout, type IsoLayout, type IsoThing } from '../world/campLayout';
import { STRUCTURES, STRUCTURE_LIST, campEffects, countBuilt, freeSpot, placeCheck, type StructureId } from '../world/camp';
import { regionName } from '../world/map';
import { CAMP_BUILDING_IDS, CAMP_RULES as OCAMP, RESOURCE_KEYS, campLevelCost, canAfford, type CampBuildingId, type Resources } from '../online/rules';
import { checkBuild, checkClaim, statesOf, type CampReason, type CampView, type CampsView } from '../online/camps';
import { errorText } from '../online/client';
import type { CampSource } from './online/campPanel';
import { effectText } from './online/campPanel';
import { registerCampTextures } from '../art/campArt';
import { dollFromHero, type DollSpec } from '../art/paperdoll';
import { flushDolls, pumpDolls, releaseBattleRows } from '../ui/sprites';
import { CampIsoLife, facingOf } from '../ui/campIsoLife';
import type { Hero } from '../data/units';
import { itemDef, type Item } from '../data/items';
import { MUSTER, classRows, fieldIds, musterOf, reserveChanges, shiftClass, toggleReserve, type MusterHero, type MusterWhy } from '../game/muster';
import { CLASSES, type ClassId } from '../data/classes';
import { frameScrollTexts } from '../ui/sheet';
import { fmtDuration, fmtNum } from '../util/format';
import type { OwnedHeroView } from '../online/client';

export interface CampSceneData {
  mode: 'field' | 'online';
  /** Online: the region. */
  loc?: number;
  name?: string;
  source?: CampSource;
  demo?: boolean;
  coast?: boolean;
  /** Online: the army's heroes (for the figures and the muster). */
  heroes?: OwnedHeroView[];
  /** Online: stores the reserve flags. */
  setReserve?: (flags: Record<string, boolean>) => Promise<void>;
  /** Where Back goes (online). */
  back?: { scene: string; data?: object };
}

const RES_ICON: Record<keyof Resources, string> = { gold: 'wargold', food: 'food', wood: 'wood', bronze: 'bronze', recruits: 'people' };
const FIELD_ICON: Record<StructureId, string> = { tent: 'tent', fire: 'fire', palisade: 'wall', forge: 'anvil', training: 'swords' };
const TOP_H = 36;
const BOT_H = 50;
const COL_W = 28;
/** Sprites rendered once per game (textures are shared by every scene). */
const sprites = new Map<string, { ox: number; oy: number; w: number; h: number }>();

interface Placed {
  thing: IsoThing;
  img: Phaser.GameObjects.Image;
}

export class CampScene extends BaseScene {
  private d!: CampSceneData;
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
  private infoText!: Phaser.GameObjects.BitmapText;
  private clockText!: Phaser.GameObjects.BitmapText;
  private zoom = 1;
  private gesture: { id: number; sx: number; sy: number; wx: number; wy: number; moved: boolean } | null = null;
  // field
  private placing: { id: StructureId; x: number; y: number } | null = null;
  private construct: { id: StructureId; x: number; y: number; t0: number; stage: number } | null = null;
  private selected: string | null = null;
  // online
  private cv: CampsView | null = null;
  private skew = 0;
  private slot: number | null = null;
  private kind: CampBuildingId | null = null;
  private busy = false;
  private timer: Phaser.Time.TimerEvent | null = null;
  private modal: Modal | null = null;
  private musterList: MusterHero[] = [];

  constructor() {
    super('Camp');
  }

  create(data: CampSceneData): void {
    this.d = data?.mode ? data : { mode: 'field' };
    this.placing = null;
    this.construct = null;
    this.selected = null;
    this.cv = null;
    this.slot = null;
    this.kind = null;
    this.busy = false;
    this.modal = null;
    this.placed = [];
    this.ghostObjs = [];
    this.layout = null;
    this.ground = null;
    this.life = null;
    this.gesture = null;
    this.animTimer = null;
    this.lastStages = '';
    this.initUi();
    ensureFonts(this);
    registerCampTextures(this, 30);
    const { VW, VH } = this.m;
    this.cameras.main.setBackgroundColor(0x2b1d1a);
    this.view = { x: 0, y: TOP_H, w: VW, h: VH - TOP_H - BOT_H };
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
    const zone = this.add.zone(this.view.x, this.view.y, this.view.w - COL_W, this.view.h).setOrigin(0, 0).setInteractive();
    uiIgnore(zone);
    this.ui.add(zone);
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('pointerupoutside', this.onUp, this);
    this.hud = this.add.container(0, 0);
    this.ui.add(this.hud);
    this.screen({ back: () => this.goBack() });
    this.events.once('shutdown', () => {
      this.input.off('pointermove', this.onMove, this);
      this.input.off('pointerup', this.onUp, this);
      this.input.off('pointerupoutside', this.onUp, this);
      this.life?.destroy();
      this.life = null;
      this.timer?.remove();
      releaseBattleRows(this);
    });
    if (this.d.mode === 'online') {
      this.buildHud();
      this.infoText.setText(t('hex.scouting'));
      this.timer = this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tick() });
      void this.fetch();
    } else {
      if (!state.campaign.world.camp) {
        this.scene.start('World');
        return;
      }
      this.rebuild();
      this.buildHud();
      this.centerCamp();
    }
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
    if (this.d.mode === 'online') this.scene.start(this.d.back?.scene ?? 'Online', this.d.back?.data ?? { focus: this.d.loc });
    else this.scene.start('World');
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
    const now = this.nowServer();
    if (this.d.mode === 'field') {
      const w = state.campaign.world;
      return fieldLayout(w.map, w.camp!, state.campaign.data.heroes.length, this.placing);
    }
    const camp = this.camp();
    const ghost = camp && this.slot !== null && this.kind && !camp.buildings.some((b) => b.slot === this.slot) ? { slot: this.slot, kind: this.kind } : null;
    return onlineLayout(camp, { coast: !!this.d.coast, seed: (this.d.loc ?? 0) * 7919 + 13, home: !!camp?.home, rosterSize: this.heroes().length, ghost, now });
  }

  /** Rebuild the ground (when its signature changed) and every sprite; the life is re-populated. */
  private rebuild(): void {
    const L = this.currentLayout();
    this.layout = L;
    const sig = `${this.d.mode}_${this.d.loc ?? 0}_${L.w}x${L.h}_${hashKinds(L.kinds)}`;
    const key = `ci_ground_${sig}`;
    if (this.groundKey !== key || !this.ground) {
      if (!this.textures.exists(key)) this.textures.addCanvas(key, Iso.renderIsoGround({ w: L.w, h: L.h, kinds: L.kinds, seed: this.d.loc ?? 5, clearing: L.clearing }).toCanvas());
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
    if (th.key === 'plot') {
      const sel = this.d.mode === 'online' && th.sel !== null && th.sel !== undefined && Number(th.sel) === this.slot;
      const key = sel ? 'ci_plot_on' : 'ci_plot';
      if (!this.textures.exists(key)) this.textures.addCanvas(key, Iso.renderPlot(sel).toCanvas());
      const o = Iso.tileScreen(th.x, th.y);
      const img = this.add.image(o.x - Iso.TILE_W - 1, o.y - 1, key).setOrigin(0, 0).setDepth(this.depthOf(th));
      this.world.add(img);
      this.placed.push({ thing: th, img });
      return;
    }
    const cons = this.d.mode === 'field' && this.construct && th.sel !== undefined && this.constructIndex() === Number(th.sel);
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
    if (th.sel !== undefined && this.selected === th.sel && this.d.mode === 'field') img.setTint(0xd8f4ff);
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
    if (this.d.mode === 'field' && this.placing) {
      const w = state.campaign.world;
      const chk = placeCheck(w.map, w.camp!, this.placing.id, this.placing.x, this.placing.y);
      okAll = chk.ok;
      for (const tl of chk.tiles) {
        const at = L.toIso(tl.x, tl.y);
        for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) tiles.push({ x: at.x + i, y: at.y + j, ok: tl.ok });
      }
    } else if (this.d.mode === 'online' && this.camp() && this.kind && this.slot !== null) {
      okAll = checkBuild({ home: this.camp()!.home, buildings: statesOf(this.camp()!) }, this.kind, this.slot, this.cv!.resources, this.nowServer()).ok;
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) tiles.push({ x: th.x + i, y: th.y + j, ok: okAll });
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
  }

  // ================================================================ life

  private heroes(): Hero[] {
    return this.d.mode === 'field' ? state.campaign.data.heroes : (this.d.heroes ?? []).map((h) => h.hero);
  }

  private muster(): MusterHero[] {
    if (this.d.mode === 'field') return musterOf(state.campaign.data.heroes);
    const views = this.d.heroes ?? [];
    const now = this.nowServer();
    const byId = new Map(views.map((v) => [v.hero.id, v]));
    return musterOf(
      views.map((v) => v.hero),
      (h) => {
        const v = byId.get(h.id);
        return !!v && (v.woundedUntil > now || v.busy || v.garrison !== null);
      },
      (h) => !!byId.get(h.id)?.reserve,
    );
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
      const yw = this.d.mode === 'field' ? 4 : 2;
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
    if (this.d.mode === 'field') return Math.floor(state.campaign.world.s.time % 24);
    return new Date().getHours();
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
    this.world.setPosition(Math.round(this.view.x + (this.view.w - COL_W) / 2 - c.x * this.zoom), Math.round(this.view.y + this.view.h / 2 - c.y * this.zoom + 10));
    this.clampPan();
  }

  private clampPan(): void {
    const L = this.layout;
    if (!L) return;
    const g = Iso.groundLayout(L.w, L.h);
    const z = this.zoom;
    const minX = this.view.x + this.view.w - (g.pw - g.ox) * z - 20;
    const maxX = this.view.x + g.ox * z + 20;
    const minY = this.view.y + this.view.h - (g.ph - g.oy) * z - 20;
    const maxY = this.view.y + g.oy * z + 60;
    this.world.x = Math.round(Phaser.Math.Clamp(this.world.x, Math.min(minX, maxX), Math.max(minX, maxX)));
    this.world.y = Math.round(Phaser.Math.Clamp(this.world.y, Math.min(minY, maxY), Math.max(minY, maxY)));
  }

  private toggleZoom(): void {
    const L = this.layout;
    if (!L) return;
    const cx = this.view.x + (this.view.w - COL_W) / 2;
    const cy = this.view.y + this.view.h / 2;
    const wx = (cx - this.world.x) / this.zoom;
    const wy = (cy - this.world.y) / this.zoom;
    this.zoom = this.zoom === 1 ? 2 : 1;
    this.world.setScale(this.zoom);
    this.world.setPosition(Math.round(cx - wx * this.zoom), Math.round(cy - wy * this.zoom));
    this.clampPan();
    haptic('light');
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.modal) return;
    this.gesture = { id: p.id, sx: p.x, sy: p.y, wx: this.world.x, wy: this.world.y, moved: false };
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
    if (ux < this.view.x || ux > this.view.x + this.view.w - COL_W || uy < this.view.y || uy > this.view.y + this.view.h) return;
    const wx = (ux - this.world.x) / this.zoom;
    const wy = (uy - this.world.y) / this.zoom;
    const tl = Iso.screenTile(wx, wy);
    this.tapTile(Math.floor(tl.x), Math.floor(tl.y));
  }

  private tapTile(tx: number, ty: number): void {
    const L = this.layout;
    if (!L) return;
    if (this.d.mode === 'field') {
      if (this.placing) {
        const mt = L.toMap(tx, ty);
        const d = STRUCTURES[this.placing.id];
        const nx = mt.x - Math.floor((d.w - 1) / 2);
        const ny = mt.y - Math.floor((d.h - 1) / 2);
        if (nx === this.placing.x && ny === this.placing.y) return;
        this.placing.x = nx;
        this.placing.y = ny;
        this.refreshGhost();
        haptic('light');
        return;
      }
      const hit = L.things.find((th) => th.sel !== undefined && tx >= th.x && tx < th.x + th.w && ty >= th.y && ty < th.y + th.h);
      this.selected = hit?.sel ?? null;
      this.rebuild();
      this.buildHud();
      const b = hit ? state.campaign.world.camp?.built[Number(hit.sel)] : null;
      if (b?.id === 'forge') this.openTemper();
      return;
    }
    const camp = this.camp();
    if (!camp) return;
    const slot = L.slotAt(tx, ty);
    if (slot < 0 || slot >= camp.slots) return;
    this.slot = slot;
    const bd = camp.buildings.find((b) => b.slot === slot);
    if (bd) this.kind = null;
    else if (!this.kind) this.kind = CAMP_BUILDING_IDS.find((k) => !camp.buildings.some((x) => x.kind === k)) ?? null;
    haptic('light');
    this.rebuild();
    this.buildHud();
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

  private buildHud(): void {
    const H = this.hud;
    H.removeAll(true);
    const { VW, VH } = this.m;
    const S = this.m.S;
    // top strip
    const topKey = `ci_strip_${VW}x${TOP_H}`;
    if (!this.textures.exists(topKey)) this.textures.addCanvas(topKey, Iso.renderStrip(VW, TOP_H).toCanvas());
    H.add(this.add.image(0, 0, topKey).setOrigin(0, 0));
    let x = 5;
    if (this.inGameBack) {
      H.add(new Button(this, 3, 4, 24, 24, { icon: 'back', iconOnly: true, label: t('common.back'), onClick: () => this.goBack(), id: 'camp.back' }));
      x = 31;
    }
    const field = this.d.mode === 'field';
    const title = field ? `${t('cs.title')} - ${this.regionName()}` : (this.d.name ?? t('cs.title'));
    this.clockText = addText(this, x, 5, '', 'red');
    H.add(this.clockText);
    H.add(addText(this, x, 18, ellipsize(title, Math.min(84, VW - x - 100)), 'dim'));
    // zoom (eye) top right
    H.add(new Button(this, VW - 27, 4, 24, 24, { icon: 'eye', iconOnly: true, label: t('cs.zoom'), style: this.zoom > 1 ? 'buttonSel' : 'button', onClick: () => this.toggleZoom(), id: 'camp.zoom' }));
    // resources: to the right of the clock, two rows
    const rx = x + 66;
    this.purseRow(H, rx, 5, VW - rx - 30, 18);
    // the column toolbar
    const colX = VW - COL_W + 1;
    const colY = TOP_H + 2;
    const colH = VH - TOP_H - BOT_H - 4;
    const colKey = `ci_col_${colH}`;
    if (!this.textures.exists(colKey)) this.textures.addCanvas(colKey, Iso.renderColumn(COL_W - 2, colH).toCanvas());
    H.add(this.add.image(colX, colY, colKey).setOrigin(0, 0));
    const bw = 22;
    const bx = colX + Math.floor((COL_W - 2 - bw) / 2);
    // five structures down the shaft: under the capital when there is room, tight on short screens (4 pt between targets)
    const top = colH >= 5 * bw + 4 * SIZE.gap + 24 ? 14 : 3;
    const gap = Math.max(2, Math.min(6, Math.floor((colH - top - 8 - 5 * bw) / 4)));
    let by = colY + top;
    if (field) {
      const w = state.campaign.world;
      const c = w.camp!;
      for (const d of STRUCTURE_LIST) {
        const n = countBuilt(c, d.id);
        const why = n >= d.max ? t('cs.built') : w.supplies < d.cost ? t('cs.needSupplies', { n: d.cost }) : !freeSpot(w.map, c, d.id) ? t('cs.noRoom') : undefined;
        const on = this.placing?.id === d.id;
        const btn = new Button(this, bx, by, bw, bw, {
          icon: FIELD_ICON[d.id],
          iconOnly: true,
          label: `${d.name} (${d.cost})`,
          tip: `${d.name}: ${d.desc}. ${d.cost} ${t('cs.suppliesWord')}, ${d.hours}h`,
          style: on ? 'buttonSel' : 'button',
          disabledReason: why,
          onClick: () => (on ? this.cancelPlacing() : this.startPlacing(d.id)),
          id: `camp.build.${d.id}`,
        });
        if (why && !on) btn.setEnabled(false, why);
        H.add(btn);
        if (d.max > 1 || n) H.add(addText(this, bx + bw - 2, by + bw - 10, `${n}`, 'red', 1));
        by += bw + gap;
      }
    } else {
      const camp = this.camp();
      const v = this.cv;
      for (const k of CAMP_BUILDING_IDS) {
        const built = camp?.buildings.find((b) => b.kind === k);
        const on = camp ? (built ? this.slot === built.slot && !this.kind : this.kind === k) : false;
        const afford = v ? canAfford(v.resources, campLevelCost(k, 1).cost) : false;
        const btn = new Button(this, bx, by, bw, bw, {
          icon: `camp_${k}`,
          iconOnly: true,
          label: t(`ocamp.b.${k}` as TKey),
          tip: `${t(`ocamp.b.${k}` as TKey)}: ${t(`ocamp.d.${k}` as TKey)}`,
          style: on ? 'buttonSel' : 'button',
          onClick: () => this.pickKind(k),
          id: `camp.pick.${k}`,
        });
        if (!camp) btn.setEnabled(false, t('ocamp.why.notCamp'));
        H.add(btn);
        if (built) H.add(addText(this, bx + bw - 2, by + bw - 10, `${built.building ?? built.level}`, on ? 'light' : 'red', 1));
        else if (camp && !afford) H.add(scaleIcon(addIcon(this, bx + bw - 9, by + bw - 9, 'coin', 'D'), 0.5));
        by += bw + gap;
      }
    }
    // bottom strip: the info line and the actions
    const botY = VH - BOT_H;
    const botKey = `ci_strip_${VW}x${BOT_H}`;
    if (!this.textures.exists(botKey)) this.textures.addCanvas(botKey, Iso.renderStrip(VW, BOT_H).toCanvas());
    H.add(this.add.image(0, botY, botKey).setOrigin(0, 0));
    this.infoText = addText(this, 6, botY + 5, '', 'ink', 0, VW - 12);
    H.add(this.infoText);
    const row = this.actions();
    const ry = botY + 19;
    // icon-only buttons take 26 px; the rest share what is left
    const fixed = row.filter((b) => b.iconOnly).length * (26 + SIZE.gap);
    const flex = row.length - row.filter((b) => b.iconOnly).length;
    const fw = Math.floor((VW - 8 - fixed - SIZE.gap * Math.max(0, flex - 1)) / Math.max(1, flex));
    let bx0 = 4;
    for (const b of row) {
      const bw = b.iconOnly ? 26 : fw;
      const btn = new Button(this, bx0, ry, bw, SIZE.btnH, { label: b.label, icon: b.icon, iconOnly: b.iconOnly, variant: b.primary ? 'primary' : undefined, onClick: b.onClick, disabledReason: b.why, tip: b.tip ?? b.label, id: b.id });
      if (b.why) btn.setEnabled(false, b.why);
      H.add(btn);
      bx0 += bw + SIZE.gap;
    }
    void S;
    this.refreshHud();
  }

  /** "[coin] 120 [food] 33 ..." as far as it fits. */
  private purseRow(H: Phaser.GameObjects.Container, x: number, y: number, w: number, y2?: number): void {
    let cx = x;
    let cy = y;
    const put = (icon: string, txt: string, font: 'ink' | 'red' = 'ink') => {
      const tw = 13 + txt.length * 6 + 5;
      if (cx + tw > x + w) {
        if (y2 === undefined || cy === y2) return;
        cy = y2;
        cx = x;
      }
      H.add(addIcon(this, cx, cy - 2, icon));
      H.add(addText(this, cx + 13, cy, txt, font));
      cx += tw;
    };
    if (this.d.mode === 'field') {
      const c = state.campaign;
      const w = c.world;
      put('coin', `${c.data.gold}`);
      put('food', `${Math.floor(w.food)}`, w.starving ? 'red' : 'ink');
      put('wood', `${Math.floor(w.supplies)}`);
      const men = `${c.fitHeroes().length}/${c.data.heroes.length}`;
      put('people', men);
      // second row: nothing (the clock sits under the title)
    } else if (this.cv) {
      const r = this.cv.resources;
      for (const k of RESOURCE_KEYS) {
        if (k === 'recruits' && w < 120) continue;
        put(RES_ICON[k], k === 'recruits' ? `${Math.floor(r[k] * 10) / 10}` : fmtNum(r[k]));
      }
    }
  }

  private regionName(): string {
    const w = state.campaign.world;
    return regionName(w.map, w.s.x, w.s.y);
  }

  private actions(): { label: string; icon: string; onClick: () => void; primary?: boolean; why?: string; tip?: string; id: string; iconOnly?: boolean }[] {
    if (this.d.mode === 'field') {
      if (this.placing) {
        return [
          { label: t('common.cancel'), icon: 'close', onClick: () => this.cancelPlacing(), id: 'camp.cancel' },
          { label: t('cs.place'), icon: 'check', onClick: () => this.confirmPlacing(), primary: true, id: 'camp.place' },
        ];
      }
      return [
        { label: t('cs.muster'), icon: 'people', iconOnly: true, onClick: () => this.openMuster(), id: 'camp.muster', tip: t('cs.musterTip') },
        { label: t('cs.loot'), icon: 'amphora', iconOnly: true, onClick: () => this.openLoot(), id: 'camp.loot', tip: t('cs.lootTip') },
        { label: t('cs.endDay'), icon: 'hourglass', onClick: () => this.endDay(), primary: true, id: 'camp.endDay', tip: t('cs.endDayTip') },
        { label: t('cs.strike'), icon: 'tent', onClick: () => this.strike(), id: 'camp.strike' },
      ];
    }
    const v = this.cv;
    const camp = this.camp();
    if (!v) return [{ label: t('common.back'), icon: 'back', onClick: () => this.goBack(), id: 'camp.back2' }];
    if (!camp) {
      const check = checkClaim({ campPlot: true, mine: true, isCamp: false, forward: v.forward.n, armyHere: !v.army.marching && v.army.loc === this.d.loc, have: v.resources });
      return [
        { label: t('cs.muster'), icon: 'people', iconOnly: true, onClick: () => this.openMuster(), id: 'camp.muster' },
        { label: t('ocamp.claim'), icon: 'tent', primary: true, why: check.ok ? undefined : this.why(check.reason), onClick: () => void this.run(() => this.d.source!.claim(this.d.loc!), t('ocamp.claimed')), id: 'camp.claim' },
      ];
    }
    const sel = camp.buildings.find((b) => b.slot === this.slot) ?? null;
    const kind = sel ? sel.kind : this.kind;
    const states = statesOf(camp);
    let check: ReturnType<typeof checkBuild> | null = null;
    if (sel && sel.level < OCAMP.maxLevel && sel.building === null) check = checkBuild({ home: camp.home, buildings: states }, sel.kind, null, v.resources, this.nowServer());
    else if (!sel && kind) check = checkBuild({ home: camp.home, buildings: states }, kind, this.slot, v.resources, this.nowServer());
    const upgrade = !!sel;
    const label = upgrade ? (sel!.level >= OCAMP.maxLevel ? t('ocamp.maxed') : t('ocamp.upgrade')) : t('ocamp.build');
    const why = !kind ? t('ocamp.empty') : check && !check.ok ? this.why(check.reason) : !check ? (sel?.building !== null ? this.why('busy') : this.why('maxLevel')) : undefined;
    const restWhy = v.army.marching || v.army.loc !== this.d.loc ? this.why('notHere') : camp.restAt ? t('ocamp.restIn', { t: fmtDuration(camp.restAt - this.nowServer()) }) : undefined;
    return [
      { label: t('cs.muster'), icon: 'people', iconOnly: true, onClick: () => this.openMuster(), id: 'camp.muster', tip: t('cs.musterTip') },
      { label: t('cs.loot'), icon: 'amphora', iconOnly: true, onClick: () => this.openLoot(), id: 'camp.loot', tip: t('cs.lootTip') },
      { label: t('ocamp.rest'), icon: 'hourglass', why: restWhy, tip: t('ocamp.restTip', { e: OCAMP.restEnergy }), onClick: () => void this.run(() => this.d.source!.rest(this.d.loc!), (r) => t('ocamp.rested', { e: Math.floor((r as CampsView & { energy?: number }).energy ?? 0) })), id: 'camp.rest' },
      { label, icon: upgrade ? 'plus' : 'anvil', primary: true, why, onClick: () => void this.build(kind!, upgrade ? null : this.slot), id: 'camp.build' },
    ];
  }

  refreshHud(): void {
    if (!this.clockText?.active) return;
    const { VW } = this.m;
    if (this.d.mode === 'field') {
      const w = state.campaign.world;
      const s = w.s;
      const day = Math.floor(s.time / 24) + 1;
      const h = Math.floor(s.time % 24);
      this.clockText.setText(ellipsize(t('cs.day', { d: day, h: String(h).padStart(2, '0') }), 90));
      const c = w.camp;
      let info = t('cs.hint');
      if (this.placing) info = t('cs.placeHint', { name: STRUCTURES[this.placing.id].name });
      else if (this.selected !== null && c?.built[Number(this.selected)]) {
        const b = c.built[Number(this.selected)];
        info = `${STRUCTURES[b.id].name}: ${STRUCTURES[b.id].desc}`;
      } else if (c) {
        const fx = campEffects(w.map, c);
        const mouths = state.campaign.data.heroes.length;
        const net = fx.forage * 24 - mouths;
        info = t('cs.campLine', { heal: w.healRate().toFixed(1), food: `${net >= 0 ? '+' : ''}${net.toFixed(0)}` });
      }
      this.infoText.setText(ellipsize(info, VW - 12));
      this.applyTint();
      return;
    }
    const v = this.cv;
    const camp = this.camp();
    this.clockText.setText(camp ? (camp.home ? t('ocamp.kind.home') : t('ocamp.kind.forward')) : t('ocamp.kind.plot'));
    if (!v) return;
    let info = '';
    if (!camp) info = t('ocamp.claimInfo', { n: v.forward.n, max: v.forward.max });
    else {
      const sel = camp.buildings.find((b) => b.slot === this.slot) ?? null;
      if (sel) {
        info = `${t('ocamp.level', { name: t(`ocamp.b.${sel.kind}` as TKey), n: sel.level })}: ${sel.level > 0 ? effectText(sel.kind, sel.level, 0) : t(`ocamp.d.${sel.kind}` as TKey)}`;
        if (sel.building !== null && sel.doneAt !== null) info = `${t(`ocamp.b.${sel.kind}` as TKey)} ${t('ocamp.building', { t: fmtDuration(Math.max(0, sel.doneAt - this.nowServer())) })}`;
        else if (sel.level < OCAMP.maxLevel) info += ` · ${costLine(sel.kind, sel.level + 1)}`;
      } else if (this.kind) info = `${t(`ocamp.b.${this.kind}` as TKey)}: ${effectText(this.kind, 1, 0)} · ${costLine(this.kind, 1)}`;
      else info = t('ocamp.empty');
    }
    this.infoText.setText(ellipsize(info, VW - 12));
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
    const why = w.build(p.id, p.x, p.y);
    if (why) {
      hapticNotify('error');
      toast(this, why, 'bad');
      return;
    }
    const d = STRUCTURES[p.id];
    this.placing = null;
    this.construct = { id: p.id, x: p.x, y: p.y, t0: this.time.now, stage: 0 };
    this.rebuild();
    this.puffAt(p.x, p.y, d.w, d.h);
    hapticNotify('success');
    this.passTime(d.hours);
    this.buildHud();
    toast(this, t('cs.builtIn', { name: d.name, h: d.hours }), 'good');
    void state.save();
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
    const at = this.d.mode === 'field' ? L.toIso(mx, my) : { x: mx, y: my };
    const ww = this.d.mode === 'field' ? w * 2 : w;
    const hh = this.d.mode === 'field' ? h * 2 : h;
    const c = Iso.groundScreen(at.x + ww / 2, at.y + hh / 2);
    for (let i = 0; i < 2; i++) {
      const img = this.add.image(c.x - 10 + (i ? 8 : -8), c.y - 6 + (i ? 3 : -2), 'ci_dust0').setOrigin(0, 0).setDepth(1e5 + c.y);
      this.world.add(img);
      [1, 2].forEach((f) => this.time.delayedCall(f * 110 + i * 60, () => img.active && img.setTexture(`ci_dust${f}`)));
      this.time.delayedCall(360 + i * 60, () => img.destroy());
    }
    haptic('medium');
  }

  /** Let `hours` pass in camp (building, the night); an encounter sends the party back to the map. */
  private passTime(hours: number): boolean {
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
    return true;
  }

  /** End the day: the camp rests until dawn (06:00), hour by hour, healing and foraging. */
  private endDay(): void {
    const w = state.campaign.world;
    const h = Math.floor(w.s.time % 24);
    const hours = h < 6 ? 6 - h : 30 - h;
    this.hud.setVisible(false);
    const veil = this.add.rectangle(0, 0, this.m.VW, this.m.VH, 0x100c1c, 0).setOrigin(0, 0).setDepth(9e6);
    this.ui.add(veil);
    this.tweens.add({
      targets: veil,
      fillAlpha: 0.85,
      duration: 350,
      onComplete: () => {
        let ok = true;
        for (let i = 0; i < hours && ok; i++) ok = this.passTime(1);
        if (!ok) return;
        void state.save();
        this.rebuild();
        this.buildHud();
        this.hud.setVisible(true);
        toast(this, t('cs.dawn', { d: Math.floor(w.s.time / 24) + 1 }), 'info');
        this.tweens.add({ targets: veil, fillAlpha: 0, duration: 500, onComplete: () => veil.destroy() });
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
        this.scene.start('World');
      },
    });
  }

  /** The forge: temper an equipped item one rarity step finer for supplies and gold. */
  private openTemper(): void {
    const camp = state.campaign;
    const w = camp.world;
    const items: { item: Item; who: string; cost: { supplies: number; gold: number } }[] = [];
    for (const h of camp.data.heroes) {
      for (const it of Object.values(h.equip)) {
        const cost = it ? camp.temperCost(it) : null;
        if (it && cost) items.push({ item: it, who: h.name, cost });
      }
    }
    items.sort((a, b) => itemDef(b.item.def).value - itemDef(a.item.def).value);
    const { VW, VH } = this.m;
    const rowH = 28;
    // as many rows as the screen holds (the finest gear first)
    const list = items.slice(0, Math.max(1, Math.min(6, Math.floor((VH - 16 - 40) / (rowH + 2)))));
    const h = 30 + Math.max(1, list.length) * (rowH + 2) + 10;
    const md = openModal(this, { title: t('cs.temper'), w: Math.min(VW - 12, 220), h, onClose: () => (this.modal = null) });
    this.modal = md;
    const { x, w: mw } = md;
    let y = md.body.y;
    if (!list.length) md.c.add(addText(this, VW / 2, y + 8, t('cs.temperNone'), 'dim', 0.5));
    for (const e of list) {
      const def = itemDef(e.item.def);
      md.c.add(addPanel(this, x + 6, y, mw - 12, rowH, 'inset'));
      md.c.add(addText(this, x + 10, y + 4, ellipsize(`${def.name} (${e.item.rarity})`, mw - 80), 'ink'));
      md.c.add(addText(this, x + 10, y + 15, ellipsize(`${e.who} - ${e.cost.supplies} ${t('cs.suppliesWord')}`, mw - 80), 'dim'));
      const can = w.supplies >= e.cost.supplies && camp.data.gold >= e.cost.gold;
      const b = new Button(this, x + mw - 62, y + 3, 54, rowH - 6, {
        label: `${e.cost.gold}`,
        icon: 'coin',
        variant: can ? 'primary' : 'secondary',
        id: 'camp.temper',
        onClick: () => {
          if (!camp.temper(e.item)) return;
          hapticNotify('success');
          md.close();
          toast(this, t('cs.tempered', { name: def.name }), 'good');
          this.buildHud();
          void state.save();
        },
      });
      b.setEnabled(can, w.supplies < e.cost.supplies ? t('cs.needSupplies', { n: e.cost.supplies }) : t('stash.noGold'));
      md.c.add(b);
      y += rowH + 2;
    }
  }

  // ================================================================ management

  private openLoot(): void {
    if (this.d.mode === 'field') this.scene.start('Army', { from: 'Camp', tab: 'stash' });
    else this.scene.start('OnlineArmy', { tab: 'stash' });
  }

  /** The muster: who marches in the formation, who stays in camp; +/- per unit type. */
  private openMuster(): void {
    this.musterList = this.muster();
    const before = this.musterList.map((h) => ({ ...h }));
    const { VW, VH } = this.m;
    const w = Math.min(VW - 12, 230);
    const h = Math.min(VH - 12, 300);
    const m = openModal(this, {
      title: t('cs.musterTitle'),
      w,
      h,
      onClose: () => {
        this.modal = null;
        const changes = reserveChanges(before, this.musterList);
        if (Object.keys(changes).length) void this.saveReserve(changes);
      },
    });
    this.modal = m;
    const b = m.body;
    const content = this.add.container(0, 0);
    m.c.add(content);
    const render = () => {
      content.removeAll(true);
      const mm = this.musterList;
      const field = fieldIds(mm);
      let y = b.y;
      content.add(addText(this, b.x, y, t('cs.formation', { n: field.length, max: MUSTER.fieldCap }), 'red'));
      content.add(addText(this, b.x + b.w, y, t('cs.inCamp', { n: mm.length - field.length }), 'dim', 1));
      y += 12;
      // per unit type: name, field / total, - +
      const rows = classRows(mm);
      const rowH = 24;
      const listH = Math.max(30, Math.min(rows.length * (rowH + 2), Math.floor(h * 0.42)));
      const typeList = new ScrollList(this, content, b.x, y, b.w, listH, {
        count: rows.length,
        rowH,
        render: (i, row, rw) => {
          const r = rows[i];
          row.add(addText(this, 2, 7, ellipsize(clsName(r.cls), rw - 110), 'ink'));
          row.add(addText(this, rw - 58, 7, `${r.field}/${r.total}${r.wounded ? ` (${r.wounded})` : ''}`, 'dim', 1));
          const minus = new Button(this, rw - 54, 0, 24, rowH, { label: '-', small: true, tip: t('cs.reserve'), id: `camp.muster.minus.${r.cls}`, onClick: () => this.shift(r.cls, -1, render) });
          const plus = new Button(this, rw - 26, 0, 24, rowH, { label: '+', small: true, tip: t('cs.field'), id: `camp.muster.plus.${r.cls}`, onClick: () => this.shift(r.cls, 1, render) });
          if (r.field <= 0) minus.setEnabled(false, t('cs.why.none'));
          if (r.field >= r.total - r.wounded) plus.setEnabled(false, t('cs.why.wounded'));
          row.add([minus, plus]);
        },
        id: (i) => `camp.muster.type.${i}`,
      });
      frameScrollTexts(typeList.area, b.w);
      y += listH + 4;
      content.add(addText(this, b.x, y, ellipsize(t('cs.menHint'), b.w), 'dim'));
      y += 11;
      // every man: tap to flip between the formation and the camp
      const fieldSet = new Set(field);
      const listH2 = Math.max(26, b.y + b.h - y - 2);
      const men = new ScrollList(this, content, b.x, y, b.w, listH2, {
        count: mm.length,
        rowH: 22,
        render: (i, row, rw) => {
          const hh = mm[i];
          const st = hh.wounded ? t('cs.wounded') : fieldSet.has(hh.id) ? t('cs.field') : t('cs.reserve');
          const font = hh.wounded ? 'red' : fieldSet.has(hh.id) ? 'good' : 'dim';
          row.add(addText(this, 2, 6, ellipsize(`${hh.name} · ${clsName(hh.cls)} ${hh.level}`, rw - 66), 'ink'));
          row.add(addText(this, rw - 3, 6, st, font, 1));
        },
        onTap: (i) => {
          const r = toggleReserve(this.musterList, mm[i].id);
          if (!r.ok) {
            toast(this, this.musterWhy(r.why), 'bad');
            hapticNotify('error');
            return;
          }
          haptic('light');
          render();
        },
        id: (i) => `camp.muster.man.${i}`,
      });
      frameScrollTexts(men.area, b.w);
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

  private async saveReserve(changes: Record<string, boolean>): Promise<void> {
    if (this.d.mode === 'field') {
      for (const [id, on] of Object.entries(changes)) state.campaign.setReserve(id, on);
      void state.save();
      this.rebuild();
      this.buildHud();
      return;
    }
    try {
      await this.d.setReserve?.(changes);
      for (const v of this.d.heroes ?? []) if (v.hero.id in changes) v.reserve = changes[v.hero.id];
      if (!this.sys.isActive()) return;
      this.rebuild();
      this.buildHud();
    } catch (e) {
      if (this.sys.isActive()) toast(this, errorText(e), 'bad');
    }
  }

  // ================================================================ online

  private camp(): CampView | null {
    return this.cv?.camps.find((c) => c.loc === this.d.loc) ?? null;
  }

  private nowServer(): number {
    return Date.now() + this.skew;
  }

  private async fetch(): Promise<void> {
    try {
      this.apply(await this.d.source!.camps());
    } catch (e) {
      if (this.sys.isActive()) toast(this, errorText(e), 'bad');
    }
  }

  private apply(v: CampsView): void {
    if (!this.sys.isActive()) return;
    this.cv = v;
    this.skew = v.now - Date.now();
    const camp = this.camp();
    if (camp && this.slot === null) {
      const used = new Set(camp.buildings.map((b) => b.slot));
      const free = Array.from({ length: camp.slots }, (_, i) => i).find((i) => !used.has(i));
      this.slot = free ?? camp.buildings[0]?.slot ?? 0;
      if (free !== undefined) this.kind = CAMP_BUILDING_IDS.find((k) => !camp.buildings.some((x) => x.kind === k)) ?? null;
    }
    const first = !this.layout;
    this.rebuild();
    this.buildHud();
    if (first) this.centerCamp();
  }

  private lastStages = '';

  /** Every second: construction countdowns and stages. */
  private tick(): void {
    if (!this.sys.isActive() || !this.cv) return;
    const camp = this.camp();
    if (!camp) return;
    const busy = camp.buildings.filter((b) => b.building !== null && b.doneAt !== null);
    if (!busy.length) return;
    if (busy.some((b) => b.doneAt! <= this.nowServer())) {
      void this.fetch();
      return;
    }
    const L = this.currentLayout();
    const stages = L.things.map((th) => th.stage ?? '-').join('');
    if (stages !== this.lastStages) {
      this.lastStages = stages;
      this.rebuild();
    }
    this.refreshHud();
  }

  private pickKind(k: CampBuildingId): void {
    const camp = this.camp();
    if (!camp) return;
    haptic('light');
    const built = camp.buildings.find((x) => x.kind === k);
    if (built) {
      this.slot = built.slot;
      this.kind = null;
    } else {
      this.kind = k;
      const used = new Set(camp.buildings.map((x) => x.slot));
      if (this.slot === null || used.has(this.slot)) {
        const free = Array.from({ length: camp.slots }, (_, j) => j).find((j) => !used.has(j));
        if (free !== undefined) this.slot = free;
      }
    }
    this.rebuild();
    this.buildHud();
  }

  private why(reason: CampReason): string {
    return t(`ocamp.why.${reason}` as TKey, { max: OCAMP.maxForward });
  }

  private async build(kind: CampBuildingId, slot: number | null): Promise<void> {
    const target = slot ?? this.camp()?.buildings.find((b) => b.kind === kind)?.slot ?? null;
    await this.run(() => this.d.source!.build(this.d.loc!, kind, slot), t('ocamp.built', { name: t(`ocamp.b.${kind}` as TKey) }), target);
    this.kind = null;
    if (this.sys.isActive()) {
      this.rebuild();
      this.buildHud();
    }
  }

  private async run(fn: () => Promise<CampsView>, ok: string | ((r: CampsView) => string), puffSlot: number | null = null): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const r = await fn();
      if (!this.sys.isActive()) return;
      hapticNotify('success');
      toast(this, typeof ok === 'string' ? ok : ok(r), 'good');
      this.apply(r);
      if (puffSlot !== null && this.layout) {
        const tl = this.layout.slotTile(puffSlot);
        this.puffAt(tl.x, tl.y, 2, 2);
      }
    } catch (e) {
      if (this.sys.isActive()) {
        toast(this, errorText(e), 'bad');
        hapticNotify('error');
      }
    } finally {
      this.busy = false;
    }
  }
}

// ------------------------------------------------------------------ helpers

function costLine(kind: CampBuildingId, level: number): string {
  const c = campLevelCost(kind, level);
  const parts: string[] = [];
  for (const k of RESOURCE_KEYS) if (c.cost[k] > 0) parts.push(`${fmtNum(c.cost[k])} ${tOr(`res.${k}`, k)}`);
  return `${parts.join(', ')} · ${fmtDuration(c.minutes * 60_000)}`;
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
    case 'granary':
      return Iso.renderGranary(Math.max(1, n));
    case 'barracks':
      return Iso.renderBarracks(Math.max(1, n));
    case 'tower':
      return Iso.renderWatchtower(Math.max(1, n));
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
