/**
 * The camp panel of the war-table map (docs/DESIGN_V2.md "Camp", art in
 * docs/ART_STYLE.md §13): a parchment scroll over the map with the camp zone
 * (a grid of building slots: tan / pink checker tiles inside a dotted
 * orange-brown border, marching ants on hover), the buildings standing in it,
 * the build row of the five structures with their costs, Build / Upgrade and
 * Rest. Picking a building for an empty slot shows its team-cyan ghost over
 * the slot (cyan dotted marker when it can go there, red when not); placing it
 * plays a cream dust puff. A camp plot of yours that is no camp yet offers
 * "Make camp" instead.
 *
 * Data comes from a CampSource: the server (/api/online/camps) or the demo
 * shard (nothing is sent). The checks shown are the shared ones of
 * src/online/camps.ts; the server decides.
 */
import type Phaser from 'phaser';
import { scaleIcon, Button, addIcon, addText, tappable } from '../../ui/kit';
import { openModal, toast, type Modal, type UiScene } from '../../ui/widgets';
import { SIZE } from '../../ui/theme';
import { measureText, wrapText } from '../../ui/textfit';
import { uiId } from '../../ui/layout';
import { haptic, hapticNotify } from '../../platform/telegram';
import { online } from '../../platform/cloud';
import { t, type TKey } from '../../i18n';
import { CAMP_BUILDING_IDS, CAMP_RULES, ONLINE_RULES, PALISADE, RESOURCE_KEYS, WATCHTOWER_SIGHT, campBuildingIncome, campLevelCost, canAfford, type CampBuildingId, type Resources } from '../../online/rules';
import { checkBuild, checkClaim, statesOf, type CampReason, type CampView, type CampsView } from '../../online/camps';
import { errorText } from '../../online/client';
import type { DemoShard } from '../../online/demoShard';
import { CAMP_FX, registerCampTextures, renderCampGround, renderCampGroundBorder, renderScaffold } from '../../art/campArt';
import { CampLife } from '../../ui/campLife';
import { fmtDuration, fmtNum } from '../../util/format';

/** Where the panel's data comes from. */
export interface CampSource {
  camps(): Promise<CampsView>;
  claim(loc: number): Promise<CampsView>;
  build(loc: number, kind: CampBuildingId, slot: number | null): Promise<CampsView>;
  rest(loc: number): Promise<CampsView & { energy: number }>;
}

export const liveCampSource: CampSource = {
  camps: () => online.api.camps(),
  claim: (loc) => online.api.campClaim(loc),
  build: (loc, kind, slot) => online.api.campBuild(loc, kind, slot),
  rest: (loc) => online.api.campRest(loc),
};

/** The demo shard's camps; its clock runs on from the demo's "now". */
export function demoCampSource(d: DemoShard): CampSource {
  const t0 = Date.now();
  const now = () => d.now + (Date.now() - t0);
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  return {
    camps: async () => clone(d.camp.view(now())),
    claim: async (loc) => clone(d.camp.claim(loc, now())),
    build: async (loc, kind, slot) => clone(d.camp.build(loc, kind, slot, now())),
    rest: async (loc) => clone(d.camp.rest(loc, now())),
  };
}

export interface CampPanelOpts {
  loc: number;
  /** Region name. */
  name: string;
  source: CampSource;
  /** After a change (claim, build, rest): the map may refresh its markers and purse. */
  onChange?: (v: CampsView) => void;
  onClose?: () => void;
}

const RES_ICON: Record<keyof Resources, string> = { gold: 'wargold', food: 'food', wood: 'wood', bronze: 'bronze', recruits: 'people' };
/** Tile edge of the camp zone grid (UI px). */
const TILE = 30;
/** Ground above and below the plot grid (UI px). */
const ZONE_PAD = 3;

const name = (k: CampBuildingId) => t(`ocamp.b.${k}` as TKey);

/** The effect line of a building at a level ("+8 food / h", "Garrison 14 · militia +1"). */
export function effectText(kind: CampBuildingId, level: number, garrisonBase: number): string {
  const inc = campBuildingIncome(kind, level);
  switch (kind) {
    case 'palisade':
      return t('ocamp.e.palisade', { g: garrisonBase + (PALISADE.garrison[level] ?? 0), m: PALISADE.militia[level] ?? 0 });
    case 'granary':
      return t('ocamp.e.granary', { n: inc.food });
    case 'forge':
      return t('ocamp.e.forge', { n: inc.bronze });
    case 'barracks':
      return t('ocamp.e.barracks', { n: inc.recruits });
    case 'watchtower':
      return t('ocamp.e.watchtower', { n: WATCHTOWER_SIGHT[level] ?? 0 });
  }
}

/**
 * Opens the camp panel of a region (your camp, or your camp plot to claim).
 * Returns the modal (Back / close closes it).
 */
export function openCampPanel(scene: UiScene, o: CampPanelOpts): Modal {
  return new CampPanel(scene, o).modal;
}

class CampPanel {
  modal: Modal;
  private content: Phaser.GameObjects.Container;
  private data: CampsView | null = null;
  /** Server time - local time of the last answer. */
  private skew = 0;
  private slot: number | null = null;
  private kind: CampBuildingId | null = null;
  private hover: { img: Phaser.GameObjects.Image; slot: number } | null = null;
  private ants: Phaser.GameObjects.Image | null = null;
  private zoneSize = { w: 0, h: 0, seed: 0 };
  /** The living camp (fire, men, smoke) of the current render. */
  private life: CampLife | null = null;
  private pendingLife: ((life: CampLife) => void)[] = [];
  private onUpdate = (now: number, dt: number) => {
    if (!this.closed) this.life?.update(now, dt);
  };
  private phase: 0 | 1 = 0;
  private timer: Phaser.Time.TimerEvent;
  private ticker: { text: Phaser.GameObjects.BitmapText; doneAt: number } | null = null;
  private busy = false;
  private closed = false;

  constructor(
    private scene: UiScene,
    private o: CampPanelOpts,
  ) {
    registerCampTextures(scene, TILE);
    const { VW } = scene.m;
    const w = Math.min(VW - 16, 228);
    this.modal = openModal(scene, {
      title: o.name,
      w,
      h: 236,
      onClose: () => {
        this.closed = true;
        this.timer.remove();
        this.scene.events.off('update', this.onUpdate);
        this.life?.destroy();
        this.life = null;
        o.onClose?.();
      },
    });
    this.content = scene.add.container(0, 0);
    this.modal.c.add(this.content);
    // close button (top right of the scroll)
    const m = this.modal;
    this.modal.c.add(new Button(scene, m.x + m.w - SIZE.btnMinW - 4, m.y + 4, SIZE.btnMinW, SIZE.btnH, { icon: 'close', iconOnly: true, label: t('common.close'), onClick: () => m.close(), id: 'camp.close' }));
    this.body([addText(scene, m.body.x, m.body.y + 4, t('hex.scouting'), 'dim')]);
    // marching ants (1 gp per 120 ms) and the construction countdown
    this.timer = scene.time.addEvent({ delay: 120, loop: true, callback: () => this.tick() });
    scene.events.on('update', this.onUpdate);
    void this.load();
  }

  private body(objs: Phaser.GameObjects.GameObject[]): void {
    this.life?.destroy();
    this.life = null;
    this.content.removeAll(true);
    this.hover = null;
    this.ticker = null;
    this.content.add(objs);
    const live = this.pendingLife;
    this.pendingLife = [];
    if (live.length) {
      const life = new CampLife(this.scene, { add: (o) => this.content.add(o), depth: null, pool: 16 });
      for (const fn of live) fn(life);
      this.life = life;
    }
  }

  private borderKey(): string {
    const { w, h, seed } = this.zoneSize;
    const key = `camp_gborder_${w}x${h}_${seed}_${this.phase}`;
    if (!this.scene.textures.exists(key)) this.scene.textures.addCanvas(key, renderCampGroundBorder(w, h, seed, this.phase).toCanvas());
    return key;
  }

  private scaffoldKey(stage: number): string {
    const key = `camp_scaf_${stage}`;
    if (!this.scene.textures.exists(key)) this.scene.textures.addCanvas(key, renderScaffold(18, 10, 10, stage).toCanvas());
    return key;
  }

  private nowServer(): number {
    return Date.now() + this.skew;
  }

  private async load(): Promise<void> {
    try {
      this.apply(await this.o.source.camps());
    } catch (e) {
      if (!this.closed) toast(this.scene, errorText(e), 'bad');
    }
  }

  private apply(v: CampsView): void {
    if (this.closed) return;
    this.data = v;
    this.skew = v.now - Date.now();
    const camp = this.camp();
    if (camp && this.slot === null) {
      // first empty slot, else the first building
      const used = new Set(camp.buildings.map((b) => b.slot));
      const free = Array.from({ length: camp.slots }, (_, i) => i).find((i) => !used.has(i));
      this.slot = free ?? camp.buildings[0]?.slot ?? 0;
      // an empty slot comes with the first structure not built yet (its ghost shows at once)
      if (free !== undefined) this.kind = CAMP_BUILDING_IDS.find((k) => !camp.buildings.some((x) => x.kind === k)) ?? null;
    }
    this.render();
  }

  private camp(): CampView | null {
    return this.data?.camps.find((c) => c.loc === this.o.loc) ?? null;
  }

  private tick(): void {
    if (this.closed) return;
    this.phase = this.phase ? 0 : 1;
    if (this.ants?.active) this.ants.setTexture(this.borderKey());
    if (this.hover) this.hover.img.setTexture(`camp_hover_${TILE}_${this.phase}`);
    if (this.ticker) {
      const left = this.ticker.doneAt - this.nowServer();
      if (left <= 0) {
        this.ticker = null;
        void this.load();
      } else this.ticker.text.setText(t('ocamp.building', { t: fmtDuration(left) }));
    }
  }

  // ------------------------------------------------------------------ render

  private render(): void {
    const v = this.data;
    if (!v) return;
    const camp = this.camp();
    if (!camp) return this.renderClaim(v);
    this.renderCamp(v, camp);
  }

  /** "[coin] 1.2K [food] 386 ..." as far as it fits. */
  private purse(objs: Phaser.GameObjects.GameObject[], x: number, y: number, w: number, r: Resources, need?: Resources): number {
    const s = this.scene;
    let cx = x;
    for (const k of RESOURCE_KEYS) {
      if (need && need[k] <= 0) continue;
      const val = need ? need[k] : r[k];
      const txt = k === 'recruits' ? `${Math.floor(val * 10) / 10}` : fmtNum(val);
      const tw = 13 + measureText(txt) + 5;
      if (cx + tw > x + w) break;
      objs.push(addIcon(s, cx, y - 3, RES_ICON[k]));
      objs.push(addText(s, cx + 13, y, txt, need && r[k] + 1e-9 < need[k] ? 'red' : 'ink'));
      cx += tw;
    }
    return cx - x;
  }

  private renderClaim(v: CampsView): void {
    const s = this.scene;
    const b = this.modal.body;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const head = addText(s, b.x, b.y, t('ocamp.kind.plot'), 'red');
    objs.push(head);
    let y = b.y + 14;
    for (const line of wrapText(t('ocamp.claimInfo', { n: v.forward.n, max: v.forward.max }), b.w, 5).lines) {
      objs.push(addText(s, b.x, y, line, 'ink'));
      y += 11;
    }
    y += 4;
    objs.push(addText(s, b.x, y, t('ocamp.claimCost'), 'dim'));
    y += 12;
    this.purse(objs, b.x, y, b.w, v.resources, CAMP_RULES.claimCost);
    y += 16;
    // a zone preview: the empty plot
    y = this.zone(objs, null, b.x + Math.floor((b.w - CAMP_RULES.cols * TILE) / 2), y, CAMP_RULES.forwardSlots);
    const check = checkClaim({
      campPlot: true,
      mine: true,
      isCamp: false,
      forward: v.forward.n,
      armyHere: !v.army.marching && v.army.loc === this.o.loc,
      have: v.resources,
    });
    const by = this.modal.y + this.modal.h - 8 - SIZE.btnH;
    const btn = new Button(s, b.x, by, b.w, SIZE.btnH, {
      label: t('ocamp.claim'),
      icon: 'tent',
      variant: 'primary',
      onClick: () => void this.run(() => this.o.source.claim(this.o.loc), t('ocamp.claimed')),
      disabledReason: check.ok ? undefined : this.why(check.reason),
      id: 'camp.claim',
    });
    if (!check.ok) btn.setEnabled(false);
    objs.push(btn);
    this.body(objs);
  }

  private renderCamp(v: CampsView, camp: CampView): void {
    const s = this.scene;
    const m = this.modal;
    const b = m.body;
    const objs: Phaser.GameObjects.GameObject[] = [];
    // subtitle and the purse
    objs.push(addText(s, b.x, b.y, camp.home ? t('ocamp.kind.home') : t('ocamp.kind.forward'), 'dim'));
    let y = b.y + 12;
    this.purse(objs, b.x, y, b.w, v.resources);
    y += 14;
    // the zone
    const zx = b.x + Math.floor((b.w - CAMP_RULES.cols * TILE) / 2);
    y = this.zone(objs, camp, zx, y, camp.slots) + 4;
    // the selected slot
    const states = statesOf(camp);
    const sel = camp.buildings.find((x) => x.slot === this.slot) ?? null;
    const kind: CampBuildingId | null = sel ? sel.kind : this.kind;
    let check: ReturnType<typeof checkBuild> | null = null;
    if (sel) {
      const lvl = sel.level;
      objs.push(addText(s, b.x, y, t('ocamp.level', { name: name(sel.kind), n: lvl }), 'red'));
      if (sel.building !== null && sel.doneAt !== null) {
        const tx = addText(s, b.x + b.w, y, t('ocamp.building', { t: fmtDuration(sel.doneAt - this.nowServer()) }), 'dim', 1);
        objs.push(tx);
        this.ticker = { text: tx, doneAt: sel.doneAt };
      }
      y += 11;
      objs.push(addText(s, b.x, y, lvl > 0 ? effectText(sel.kind, lvl, ONLINE_RULES.maxGarrison) : t(`ocamp.d.${sel.kind}` as TKey), 'good', 0, b.w));
      y += 11;
      if (sel.level < CAMP_RULES.maxLevel && sel.building === null) {
        check = checkBuild({ home: camp.home, buildings: states }, sel.kind, null, v.resources, this.nowServer());
        objs.push(addText(s, b.x, y, t('ocamp.levelNext', { e: effectText(sel.kind, sel.level + 1, ONLINE_RULES.maxGarrison) }), 'dim'));
      } else if (sel.level >= CAMP_RULES.maxLevel) objs.push(addText(s, b.x, y, t('ocamp.maxed'), 'dim'));
      y += 11;
      if (sel.level < CAMP_RULES.maxLevel) this.costRow(objs, b.x, y, b.w, v.resources, sel.kind, (sel.building ?? sel.level) + 1);
    } else if (kind) {
      check = checkBuild({ home: camp.home, buildings: states }, kind, this.slot, v.resources, this.nowServer());
      objs.push(addText(s, b.x, y, `${name(kind)}`, 'red'));
      y += 11;
      for (const line of wrapText(t(`ocamp.d.${kind}` as TKey), b.w, 1).lines) objs.push(addText(s, b.x, y, line, 'ink'));
      y += 11;
      objs.push(addText(s, b.x, y, effectText(kind, 1, ONLINE_RULES.maxGarrison), 'good'));
      y += 11;
      this.costRow(objs, b.x, y, b.w, v.resources, kind, 1);
    } else {
      objs.push(addText(s, b.x, y, t('ocamp.empty'), 'dim'));
      y += 33;
    }
    y += 14;
    // the build row: the five structures
    const n = CAMP_BUILDING_IDS.length;
    const cw = Math.min(30, Math.floor((b.w - (n - 1) * SIZE.gap) / n));
    const rowW = n * cw + (n - 1) * SIZE.gap;
    const rx = b.x + Math.floor((b.w - rowW) / 2);
    CAMP_BUILDING_IDS.forEach((k, i) => {
      const bx = rx + i * (cw + SIZE.gap);
      const built = camp.buildings.find((x) => x.kind === k);
      const on = (sel ? sel.kind : this.kind) === k;
      const afford = canAfford(v.resources, campLevelCost(k, 1).cost);
      const btn = new Button(s, bx, y, cw, SIZE.btnH, {
        icon: `camp_${k}`,
        iconOnly: true,
        label: name(k),
        variant: on ? 'primary' : 'secondary',
        tip: `${name(k)}: ${t(`ocamp.d.${k}` as TKey)}`,
        onClick: () => {
          haptic('light');
          if (built) this.slot = built.slot;
          else {
            this.kind = k;
            if (sel) {
              // jump to the first empty slot
              const used = new Set(camp.buildings.map((x) => x.slot));
              const free = Array.from({ length: camp.slots }, (_, j) => j).find((j) => !used.has(j));
              if (free !== undefined) this.slot = free;
            }
          }
          this.render();
        },
        id: `camp.pick.${k}`,
      });
      objs.push(btn);
      if (built) objs.push(addText(s, bx + cw - 3, y + SIZE.btnH - 8, `${built.building ?? built.level}`, on ? 'light' : 'red', 1));
      else if (!afford) objs.push(scaleIcon(addIcon(s, bx + cw - 9, y + SIZE.btnH - 9, 'coin', 'D'), 0.5));
    });
    // actions: Rest (secondary, left) and Build / Upgrade (primary, right)
    const by = m.y + m.h - 8 - SIZE.btnH;
    const half = Math.floor((b.w - SIZE.gap) / 2);
    const restWhy = v.army.marching || v.army.loc !== this.o.loc ? this.why('notHere') : camp.restAt ? t('ocamp.restIn', { t: fmtDuration(camp.restAt - this.nowServer()) }) : undefined;
    const rest = new Button(s, b.x, by, half, SIZE.btnH, {
      label: t('ocamp.rest'),
      icon: 'tent',
      tip: t('ocamp.restTip', { e: CAMP_RULES.restEnergy }),
      onClick: () => void this.run(() => this.o.source.rest(this.o.loc), (r) => t('ocamp.rested', { e: Math.floor((r as CampsView & { energy?: number }).energy ?? 0) })),
      disabledReason: restWhy,
      id: 'camp.rest',
    });
    if (restWhy) rest.setEnabled(false);
    objs.push(rest);
    const upgrade = !!sel;
    const label = upgrade ? (sel!.level >= CAMP_RULES.maxLevel ? t('ocamp.maxed') : t('ocamp.upgrade')) : t('ocamp.build');
    const why = !kind ? t('ocamp.empty') : check && !check.ok ? this.why(check.reason) : !check ? (sel?.building !== null ? this.why('busy') : this.why('maxLevel')) : undefined;
    const go = new Button(s, b.x + half + SIZE.gap, by, b.w - half - SIZE.gap, SIZE.btnH, {
      label,
      icon: upgrade ? 'plus' : 'anvil',
      variant: 'primary',
      onClick: () => void this.build(kind!, upgrade ? null : this.slot),
      disabledReason: why,
      id: 'camp.build',
    });
    if (why) go.setEnabled(false);
    objs.push(go);
    this.body(objs);
  }

  /** "COST [coin]80 [wood]40 · 15m" in red where you are short. */
  private costRow(objs: Phaser.GameObjects.GameObject[], x: number, y: number, w: number, have: Resources, kind: CampBuildingId, level: number): void {
    const c = campLevelCost(kind, level);
    const used = this.purse(objs, x, y, w - 40, have, c.cost);
    objs.push(addIcon(this.scene, x + used + 2, y - 3, 'hourglass'));
    objs.push(addText(this.scene, x + used + 15, y, fmtDuration(c.minutes * 60_000), 'dim'));
  }

  /**
   * The camp zone at (x, y): the trodden ground blob with its dotted border
   * (marching ants), the pegged plots, the buildings, the selection, the hover
   * outline and the placement ghost, and around them the living camp (the
   * fire and the men about it, the drill ground, supplies, smoke and sparks).
   * Returns the y below.
   */
  private zone(objs: Phaser.GameObjects.GameObject[], camp: CampView | null, x: number, y: number, slots: number): number {
    const s = this.scene;
    const cols = CAMP_RULES.cols;
    const rows = CAMP_RULES.rows;
    const b = this.modal.body;
    // the ground spans the body; the plot grid sits in its middle
    const gw = b.w;
    const gh = rows * TILE + 4 + 2 * ZONE_PAD;
    const gx = b.x;
    const seed = (this.o.loc * 31 + 7) % 997;
    const gkey = `camp_ground_${gw}x${gh}_${seed}`;
    if (!s.textures.exists(gkey)) s.textures.addCanvas(gkey, renderCampGround(gw, gh, seed).toCanvas());
    objs.push(s.add.image(gx, y, gkey).setOrigin(0, 0));
    this.zoneSize = { w: gw, h: gh, seed };
    this.ants = s.add.image(gx, y, this.borderKey()).setOrigin(0, 0);
    objs.push(this.ants);
    const ox = x;
    const oy = y + 2 + ZONE_PAD;
    const states = camp ? statesOf(camp) : [];
    const have = this.data?.resources;
    const live: ((life: CampLife) => void)[] = [];
    for (let i = 0; i < cols * rows; i++) {
      const tx = ox + (i % cols) * TILE;
      const ty = oy + Math.floor(i / cols) * TILE;
      const usable = i < slots;
      const selected = camp !== null && i === this.slot;
      if (usable) objs.push(s.add.image(tx, ty, `camp_tile_${TILE}${selected ? '_on' : ''}`).setOrigin(0, 0));
      else {
        // outside this camp's footprint: a stack of cut timber, nothing pegged out
        if (i % 2) objs.push(s.add.image(tx + 9, ty + 12, 'ck_prop_logs').setOrigin(0, 0));
        continue;
      }
      const bd = camp?.buildings.find((x2) => x2.slot === i);
      const bx = tx + (TILE - 24) / 2;
      const by = ty + (TILE - 24) / 2 - 1;
      if (bd) {
        const shown = bd.building !== null ? bd.building - 1 : bd.level;
        objs.push(s.add.image(bx, by, `campb_${bd.kind}_${Math.max(0, shown)}`).setOrigin(0, 0));
        // level pips (gold) bottom-left; construction: an hourglass top-right
        for (let p = 0; p < bd.level; p++) objs.push(s.add.rectangle(tx + 2 + p * 3, ty + TILE - 4, 2, 2, 0xe0b860).setOrigin(0, 0));
        if (bd.building !== null) {
          // going up: a scaffold over it and a man at work
          objs.push(s.add.image(bx + 2, by + 4, this.scaffoldKey(shown <= 0 ? 1 : 2)).setOrigin(0, 0).setAlpha(shown <= 0 ? 1 : 0.9));
          objs.push(scaleIcon(addIcon(s, tx + TILE - 11, ty + 1, 'hourglass'), 0.75));
          live.push((l) => {
            l.figure(i, bx + 22, by + 23, 'smith', true);
            l.sparks(bx + 18, by + 19, 6, () => l.striking(bx + 22, by + 23));
          });
        } else if (shown > 0) {
          const fx = CAMP_FX[bd.kind];
          live.push((l) => {
            if (fx?.coals) l.loop(bx + fx.coals[0], by + fx.coals[1] + 2, ['ck_coal_0', 'ck_coal_1'], 260);
            if (fx?.smoke) l.smoke(bx + fx.smoke[0], by + fx.smoke[1], 1.3);
            if (fx?.work) {
              l.figure(i + 2, bx + fx.work[0], by + fx.work[1], 'smith');
              if (fx.sparks) l.sparks(bx + fx.sparks[0], by + fx.sparks[1], 9, () => l.striking(bx + fx.work![0], by + fx.work![1]));
            }
          });
        }
      } else if (selected && this.kind && camp) {
        // the placement ghost and its slot marker
        const ok = checkBuild({ home: camp.home, buildings: states }, this.kind, i, have!, this.nowServer()).ok;
        objs.push(s.add.image(tx, ty, `camp_slot_${ok ? 'ok' : 'bad'}_${TILE}`).setOrigin(0, 0));
        objs.push(s.add.image(bx, by, `campghost_${this.kind}`).setOrigin(0, 0));
      }
      if (!camp) continue;
      // tap target with the hover outline
      const z = s.add.zone(tx, ty, TILE, TILE).setOrigin(0, 0).setInteractive();
      uiId(z, `camp.slot.${i}`);
      z.on('pointerover', () => {
        this.hover?.img.destroy();
        const img = s.add.image(tx, ty, `camp_hover_${TILE}_${this.phase}`).setOrigin(0, 0);
        this.content.add(img);
        this.hover = { img, slot: i };
      });
      z.on('pointerout', () => {
        if (this.hover?.slot !== i) return;
        this.hover.img.destroy();
        this.hover = null;
      });
      tappable(z, null, () => {
        this.slot = i;
        if (bd) this.kind = null;
        this.render();
      });
      objs.push(z);
    }
    // the living camp around the plots: the fire (west), the drill ground and supplies (east)
    const left = { x0: gx + 3, x1: ox - 3 };
    const right = { x0: ox + cols * TILE + 3, x1: gx + gw - 3 };
    const lane = oy + TILE + 1; // the walk between the plot rows
    const built = camp?.buildings.filter((q) => q.level > 0) ?? [];
    const has = (k: CampBuildingId) => built.some((q) => q.kind === k);
    if (!camp) {
      // the empty plot: a man with the standard, pegs where the camp would start
      objs.push(s.add.image(ox + TILE + 3, oy + 3, 'campb_barracks_0').setOrigin(0, 0).setAlpha(0.7));
      live.push((l) => {
        const cx = ox + Math.floor((cols * TILE) / 2);
        l.loop(cx - 9, oy + TILE + 12, ['ck_std_0', 'ck_std_1', 'ck_std_2', 'ck_std_3'], 190, 0, [1 / 13, 19 / 20]);
        l.figure(0, cx + 2, oy + TILE + 12, 'idle');
      });
    } else {
      live.push((l) => {
        const fw = left.x1 - left.x0;
        const fx = left.x0 + Math.floor(fw / 2) - 6;
        const fy = lane + 14;
        // a tent and the standard up north, the fire with its circle below
        l.still(left.x0 - 1, oy + 15, 'ck_tent_1');
        l.loop(left.x1 - 8, oy + 20, ['ck_std_0', 'ck_std_1', 'ck_std_2', 'ck_std_3'], 190, 300, [1 / 13, 19 / 20]);
        l.still(fx - 2, fy + 4, 'ck_prop_logs');
        l.loop(fx, fy + 2, ['ck_fire_0', 'ck_fire_1', 'ck_fire_2', 'ck_fire_3'], 130);
        l.smoke(fx + 6, fy - 9, 1.7);
        l.sparks(fx + 6, fy - 4, 2);
        l.figure(1, fx - 3, fy - 1, 'sit', false);
        l.figure(3, fx + 15, fy - 1, 'sit', true);
        if (has('granary')) l.still(fx + 13, fy + 6, 'ck_prop_pot');
        // east: supplies, the drill ground once there are barracks
        const ex = right.x0;
        l.still(ex, oy + 12, 'ck_prop_amphorae');
        l.still(ex + 11, oy + 14, 'ck_prop_crates');
        if (has('barracks')) {
          l.still(right.x1 - 9, lane + 4, 'ck_prop_dummy');
          l.figure(4, ex + 6, lane + 12, 'spar', false, 360);
          l.figure(5, ex + 15, lane + 12, 'spar', true, 410);
        } else {
          l.still(ex + 2, lane + 12, 'ck_prop_sacks');
          l.still(right.x1 - 9, lane + 9, 'ck_prop_target');
        }
        // the men strolling the lane between the rows
        const n = Math.min(3, 1 + Math.floor(built.length / 2));
        const route: [number, number][] = [
          [left.x1 - 2, lane],
          [ox + 6, lane],
          [ox + TILE + 14, lane],
          [ox + 2 * TILE + 20, lane],
          [right.x0 + 4, lane],
        ];
        for (let k = 0; k < n; k++) l.walker(k + 2, route, 6 + k);
      });
    }
    this.pendingLife = live;
    return y + gh;
  }

  private why(reason: CampReason): string {
    return t(`ocamp.why.${reason}` as TKey, { max: CAMP_RULES.maxForward });
  }

  // ------------------------------------------------------------------ actions

  private async build(kind: CampBuildingId, slot: number | null): Promise<void> {
    const target = slot ?? this.camp()?.buildings.find((b) => b.kind === kind)?.slot ?? null;
    await this.run(
      () => this.o.source.build(this.o.loc, kind, slot),
      t('ocamp.built', { name: name(kind) }),
      target,
    );
    this.kind = null;
  }

  /** Runs a change; on success a toast, the dust puff on `puffSlot`, then the new state. */
  private async run(fn: () => Promise<CampsView>, ok: string | ((r: CampsView) => string), puffSlot: number | null = null): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const r = await fn();
      if (this.closed) return;
      hapticNotify('success');
      toast(this.scene, typeof ok === 'string' ? ok : ok(r), 'good');
      this.o.onChange?.(r);
      if (puffSlot !== null) {
        this.apply(r);
        this.puff(puffSlot);
      } else this.apply(r);
    } catch (e) {
      if (!this.closed) {
        toast(this.scene, errorText(e), 'bad');
        hapticNotify('error');
      }
    } finally {
      this.busy = false;
    }
  }

  /** The 3-frame cream dust puff over a slot (ART_STYLE §13). */
  private puff(slot: number): void {
    const s = this.scene;
    const b = this.modal.body;
    // the zone sits under the subtitle and the purse (see renderCamp)
    const zx = b.x + Math.floor((b.w - CAMP_RULES.cols * TILE) / 2);
    const zy = b.y + 26 + 2 + ZONE_PAD;
    const cx = zx + (slot % CAMP_RULES.cols) * TILE + TILE / 2;
    const cy = zy + Math.floor(slot / CAMP_RULES.cols) * TILE + TILE / 2 + 2;
    const img = s.add.image(Math.round(cx - 14), Math.round(cy - 10), 'camp_dust_0').setOrigin(0, 0);
    this.modal.c.add(img);
    [1, 2].forEach((f) => s.time.delayedCall(f * 110, () => img.active && img.setTexture(`camp_dust_${f}`)));
    s.time.delayedCall(360, () => img.destroy());
    haptic('medium');
  }
}

