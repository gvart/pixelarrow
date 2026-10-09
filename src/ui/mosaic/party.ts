/**
 * Pieces of the v4 party screens (Settlement, Army, Hero sheet): the sub-screen
 * shell, the bottom action bar, gear slots, role pills, the arched niche for a
 * pixel figure, the stash grid, attribute rows with steppers, stat meters, the
 * hero pager and an empty state on parchment. Built on the mosaic base only
 * (tokens, mosaicImage, mtext, MButton); the pixel sprites stay as they are.
 */
import Phaser from 'phaser';
import { addIcon, panelK, registerVectorFont, tappable, type FontKey, type ScrollArea, type UIMetrics } from '../kit';
import { uiFrame, uiId } from '../layout';
import { Grid, ItemIcon, showTooltip } from '../widgets';
import { SLOT_ICON, defaultStashState, type StashGridOpts } from '../sheet';
import { wrapText } from '../textfit';
import { showInGameBack } from '../../platform/nav';
import { cycle, isUpgrade, queryStash, RARITY_FILTERS, SLOT_FILTERS, STASH_SORTS } from '../../game/gear';
import { normalizeRarity, type Item, type Slot } from '../../data/items';
import { t, tOr, type TKey } from '../../i18n';
import { heroClass } from '../../sim/stats';
import type { Hero } from '../../data/units';
import { ACCENT, MOSAIC, RARITY_INK } from '../tokens';
import { GAP, TAP, MBadge, centeredFace, makePressable, midY, mosaicImage, mosaicTexture, mtext, mw, fit, put } from './base';
import { ScreenFrame, type Box } from './ScreenFrame';
import { TopBar } from './TopBar';
import { MButton, type MButtonOpts } from './controls';
import { actionRows } from './BottomPanel';

type C = Phaser.GameObjects.Container;
type UiScene = Phaser.Scene & { m: UIMetrics; ui: C };

// ================================================================== shell

export interface PartyShell {
  frame: ScreenFrame;
  top: TopBar;
  /** The parchment area under the top bar. */
  body: Box;
}

/** The framed page of a sub-screen: the screen's name on the plaque and a back arrow (outside Telegram), no tab bar. */
export function addPartyShell(scene: UiScene, o: { title: string; back: () => void; id?: string }): PartyShell {
  const { VW, VH } = scene.m;
  const frame = new ScreenFrame(scene, VW, VH, {});
  scene.ui.add(frame);
  const top = new TopBar(scene, frame.topBar, { title: o.title, back: showInGameBack() ? o.back : undefined, id: o.id ?? 'party.topbar' });
  scene.ui.add(top);
  return { frame, top, body: frame.content };
}

/** Replace the top bar's plaque text (a screen that pages through heroes). */
export function retitlePartyShell(scene: UiScene, shell: PartyShell, o: { title: string; back: () => void; id?: string }): void {
  shell.top.destroy();
  shell.top = new TopBar(scene, shell.frame.topBar, { title: o.title, back: showInGameBack() ? o.back : undefined, id: o.id ?? 'party.topbar' });
  scene.ui.add(shell.top);
}

// ================================================================== action bar

const BAR_PAD = 4;
const BAR_BTN_H = 24;

/**
 * The row of actions at the foot of a sub-screen: buttons side by side in
 * proportion to their labels (the primary alone on a row of its own when they
 * do not fit). `top` is where the content above must end.
 */
export class ActionBar extends Phaser.GameObjects.Container {
  readonly h: number;
  /** Top edge in UI px (the scene's UI root). */
  readonly top: number;
  readonly buttons: MButton[] = [];

  constructor(scene: Phaser.Scene, box: Box, actions: MButtonOpts[]) {
    const inner = box.w - BAR_PAD * 2;
    const rows = actionRows(actions, inner);
    const h = BAR_PAD * 2 + rows.length * BAR_BTN_H + (rows.length - 1) * GAP;
    super(scene, box.x, box.y + box.h - h);
    this.h = h;
    this.top = box.y + box.h - h;
    this.add(mosaicImage(scene, 0, 0, box.w, h, 'sheet'));
    rows.forEach((row, ri) => {
      const nat = row.map((a) => mw(a.label.toUpperCase(), a.variant === 'disabled' ? 'rOff' : 'rCream', 7) + 16);
      const free = inner - GAP * (row.length - 1);
      const sum = nat.reduce((a, b) => a + b, 0);
      let x = BAR_PAD;
      row.forEach((a, i) => {
        const bw = i === row.length - 1 ? BAR_PAD + inner - x : Math.round((nat[i] / sum) * free);
        const b = new MButton(scene, x, BAR_PAD + ri * (BAR_BTN_H + GAP), bw, BAR_BTN_H, a);
        this.add(b);
        this.buttons.push(b);
        x += bw + GAP;
      });
    });
    scene.add.existing(this);
  }
}

// ================================================================== small button

export interface SmallButtonOpts {
  /** A short label (a roman numeral) or an icon, or both. */
  label?: string;
  icon?: string;
  variant?: 'secondary' | 'neutral';
  tip?: string;
  /** Not available: greyed, and a tap says this instead of acting. */
  disabled?: string;
  id?: string;
  onClick: () => void;
}

/** A compact bronze or stone button for a numeral or an icon alone (group I to IV, stash filters): the label is never cut. */
export class SmallButton extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;
  readonly opts: { label: string; icon?: string };

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, o: SmallButtonOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    this.h = Math.max(TAP, Math.round(h));
    this.opts = { label: o.label ?? o.tip ?? '', icon: o.icon };
    const bronze = (o.variant ?? 'neutral') === 'secondary';
    const face = centeredFace(scene, this.w, this.h);
    this.add(face);
    const off = !!o.disabled;
    const bg = put(face, this.w, this.h, mosaicImage(scene, 0, 0, this.w, this.h, off ? 'btnStone' : bronze ? 'btnBronze' : 'btnNeutral'));
    const content = scene.add.container(0, 0);
    face.add(content);
    const label = o.label ?? '';
    const iconW = o.icon ? 12 : 0;
    const lw = label ? mw(label, 'rCream', 7) : 0;
    const x0 = Math.round((this.w - (iconW + (label && o.icon ? 3 : 0) + lw)) / 2);
    if (o.icon) put(content, this.w, this.h, addIcon(scene, x0, Math.round((this.h - 12) / 2) - 1, o.icon, off ? 'D' : 'L'));
    if (label) put(content, this.w, this.h, mtext(scene, x0 + iconW + (o.icon ? 3 : 0), midY(this.h - 1, 7), label, off ? 'rOff' : 'rCream', { size: 7, box: { owner: this, w: this.w, h: this.h } }));
    makePressable(this, {
      face,
      disabled: () => o.disabled,
      w: this.w,
      h: this.h,
      onTap: o.onClick,
      down: () => {
        if (off) return;
        bg.setTexture(mosaicTexture(scene, this.w, this.h, bronze ? 'btnBronzeDown' : 'btnNeutralDown'));
        content.y = 1;
      },
      up: () => {
        if (off) return;
        bg.setTexture(mosaicTexture(scene, this.w, this.h, bronze ? 'btnBronze' : 'btnNeutral'));
        content.y = 0;
      },
      tip: o.tip,
    });
    uiId(this, o.id ?? `sbtn:${label || o.icon}`);
    scene.add.existing(this);
  }
}

// ================================================================== pills

/** A small coloured pill with cream text (role, level). Returns its width. */
export function addPill(scene: Phaser.Scene, parent: C, x: number, y: number, text: string, color: number, maxW = 200): number {
  const s = fit(text, 'onAccent', 6, maxW - 8);
  const w = Math.ceil(mw(s, 'onAccent', 6)) + 8;
  const g = scene.add.graphics();
  g.fillStyle(0x1a0d06, 1);
  g.fillRoundedRect(Math.round(x), Math.round(y), w, 12, 3);
  g.fillStyle(color, 1);
  g.fillRoundedRect(Math.round(x) + 0.7, Math.round(y) + 0.7, w - 1.4, 10.6, 2.6);
  parent.add(g);
  const txt = mtext(scene, Math.round(x) + 4, Math.round(y) + 2, s, 'onAccent', { size: 6 });
  uiFrame(txt, g, w, 12, Math.round(x), Math.round(y));
  parent.add(txt);
  return w;
}

/** Width of a pill with `text`. */
export function pillWidth(text: string): number {
  return Math.ceil(mw(text, 'onAccent', 6)) + 8;
}

// ================================================================== arched niche

/**
 * An arched stone niche round a pixel figure: the figure (a Stage) sits at
 * (x, y) w x h; the stone beyond the arch and a bronze rim are drawn over its
 * corners. Add the niche after the figure.
 */
export function addNiche(scene: Phaser.Scene, parent: C, x: number, y: number, w: number, h: number): void {
  const g = scene.add.graphics();
  const ry = Math.min(w * 0.4, 24);
  // the arch: a half ellipse rising `ry` above the straight sides, inset by `d`
  const arch = (d: number) => {
    const pts: { x: number; y: number }[] = [{ x: x + d, y: y + h - d }];
    const rx = w / 2 - d;
    for (let i = 0; i <= 20; i++) {
      const a = Math.PI + (i / 20) * Math.PI;
      pts.push({ x: x + w / 2 + rx * Math.cos(a), y: y + ry + (ry - d) * Math.sin(a) });
    }
    pts.push({ x: x + w - d, y: y + h - d });
    return pts;
  };
  // the stone beyond the arch: a wedge in each upper corner
  g.fillStyle(MOSAIC.stone2, 1);
  const a0 = arch(0);
  const top = a0.slice(1, -1);
  g.fillPoints([{ x, y }, { x: x + w / 2, y }, ...top.slice(0, 11).reverse()], true);
  g.fillPoints([{ x: x + w, y }, { x: x + w / 2, y }, ...top.slice(10)], true);
  g.fillRect(x, y, w, 1);
  g.fillStyle(MOSAIC.stone2, 1);
  g.fillRect(x - 1, y - 1, w + 2, 1);
  g.lineStyle(2.4, MOSAIC.bronzeLo, 1);
  g.strokePoints(arch(-0.6), false);
  g.lineStyle(1.2, MOSAIC.bronzeHi, 1);
  g.strokePoints(arch(-0.2), false);
  g.lineStyle(0.8, MOSAIC.stone0, 0.9);
  g.strokePoints(arch(1), false);
  parent.add(g);
}

// ================================================================== gear slot

export interface GearSlotOpts {
  slot: Slot | 'mount';
  item?: Item;
  size: number;
  onTap: () => void;
  selected?: boolean;
  /** Long-press / empty-slot text. */
  tip?: string;
  /** The icon of an empty slot (default the slot's). */
  icon?: string;
  area?: Phaser.GameObjects.Zone | null;
}

/** An equipment slot as a carved stone socket: the item in its rarity frame with a condition pip, or the slot's engraved icon. `w` / `h` serve the drop-target bounds. */
export class GearSlot extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;

  constructor(scene: Phaser.Scene, x: number, y: number, o: GearSlotOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.w = o.size;
    this.h = o.size;
    const s = o.size;
    const g = scene.add.graphics();
    g.fillStyle(0x0e0b08, 1);
    g.fillRoundedRect(-0.5, -0.5, s + 1, s + 1, 2.4);
    g.fillStyle(o.selected ? MOSAIC.goldHi : MOSAIC.bronze, 1);
    g.fillRoundedRect(0, 0, s, s, 2);
    g.fillStyle(MOSAIC.stone1, 1);
    g.fillRoundedRect(1.2, 1.2, s - 2.4, s - 2.4, 1.4);
    g.fillStyle(0x000000, 0.35);
    g.fillRect(1.2, 1.2, s - 2.4, 1.6);
    this.add(g);
    if (o.item) {
      const ic = new ItemIcon(scene, 2, 2, { item: o.item }, { size: s - 4, tip: false, glow: false });
      this.add(ic);
      const it = o.item;
      const pc = it.cond > 66 ? MOSAIC.inkGood : it.cond > 33 ? MOSAIC.segDone : ACCENT.dangerFill;
      const pw = s - 8;
      const pip = scene.add.graphics();
      pip.fillStyle(0x000000, 0.7);
      pip.fillRect(4, s - 5, pw, 2);
      pip.fillStyle(pc === MOSAIC.inkGood ? 0x7fd05a : pc, 1);
      pip.fillRect(4, s - 5, Math.max(1, Math.round((pw * Math.max(0, Math.min(100, it.cond))) / 100)), 2);
      this.add(pip);
    } else {
      const ic = addIcon(scene, Math.round((s - 12) / 2), Math.round((s - 12) / 2), o.icon ?? (o.slot === 'mount' ? 'advance' : SLOT_ICON[o.slot]), o.selected ? 'L' : 'D');
      this.add(ic);
    }
    this.setSize(s, s);
    this.setInteractive(new Phaser.Geom.Rectangle(s / 2, s / 2, s, s), Phaser.Geom.Rectangle.Contains);
    tappable(this, null, o.onTap, o.tip ?? (o.slot !== 'mount' ? t(`slot.${o.slot}` as TKey) : undefined));
    uiId(this, `slot:${o.slot}`);
    scene.add.existing(this);
  }
}

/** The mount of a riding class: a socket like a slot (not an item: the class rides it). */
export function mountSlot(scene: Phaser.Scene, x: number, y: number, hero: Hero, size: number): GearSlot | null {
  const cls = heroClass(hero);
  if (!cls.mount) return null;
  const name = tOr(`mount.${cls.mount}`, cls.mount);
  const g: GearSlot = new GearSlot(scene, x, y, { slot: 'mount', size, icon: cls.mount === 'chariot' ? 'f_wedge' : 'advance', tip: name, onTap: () => showTooltip(scene, `${name}\n${t('hero.mountTip')}`, g) });
  return g;
}

export interface SlotGrid {
  /** Edge of a slot. */
  ss: number;
  /** Top-left of slot `i` inside a box `inner` wide. */
  pos: (i: number) => { x: number; y: number };
  /** Height of the whole block. */
  h: number;
}

/** Lay `count` slots of at most `max` in rows inside `inner` px: one row when they stay 22 or wider (a touch target), else two or three rows. */
export function slotGrid(inner: number, count: number, max: number, gap = 2): SlotGrid {
  let rows = 1;
  let cols = count;
  let ss = 0;
  for (rows = 1; rows <= 3; rows++) {
    cols = Math.ceil(count / rows);
    ss = Math.min(max, Math.floor((inner - (cols - 1) * gap) / cols));
    if (ss >= TAP) break;
  }
  ss = Math.max(TAP, ss);
  const step = cols > 1 ? Math.min(ss + 8, Math.floor((inner - ss) / (cols - 1))) : 0;
  return {
    ss,
    h: rows * ss + (rows - 1) * 3,
    pos: (i) => {
      const r = Math.floor(i / cols);
      const k = Math.min(cols, count - r * cols);
      return { x: Math.round((inner - (ss + step * (k - 1))) / 2) + (i % cols) * step, y: r * (ss + 3) };
    },
  };
}

// ================================================================== hero pager

export interface PagerOpts {
  index: number;
  count: number;
  onPrev: () => void;
  onNext: () => void;
  prevTip: string;
  nextTip: string;
}

/** The two arrows and "3 / 9" between them, for walking through the heroes. 22 tall; `PAGER_W` wide. */
export const PAGER_W = TAP * 2 + 34 + GAP * 2;
export class PartyPager extends Phaser.GameObjects.Container {
  readonly w = PAGER_W;
  readonly h = TAP;

  constructor(scene: Phaser.Scene, x: number, y: number, o: PagerOpts) {
    super(scene, Math.round(x), Math.round(y));
    const mk = (bx: number, icon: string, tip: string, id: string, fn: () => void) => {
      const b = new SmallButton(scene, bx, 0, TAP, TAP, { icon, variant: 'neutral', tip, id, onClick: fn });
      this.add(b);
    };
    mk(0, 'chevL', o.prevTip, 'hero.prev', o.onPrev);
    const label = `${o.index + 1} / ${o.count}`;
    const txt = mtext(scene, TAP + GAP + 17, midY(TAP, 7), label, 'rGold', { align: 0.5, maxW: 34, box: { owner: this, w: PAGER_W, h: TAP } });
    this.add(txt);
    mk(PAGER_W - TAP, 'chevR', o.nextTip, 'hero.next', o.onNext);
    scene.add.existing(this);
  }
}

// ================================================================== progress bar

export interface MeterOpts {
  value: number;
  max: number;
  h?: number;
  color?: number;
  label?: string;
  right?: string;
  /** Text colour family: parchment (default) or stone. */
  on?: 'parchment' | 'stone';
}

/** A bar on a sunken track, with an optional label above-left and value above-right. Height: `h` plus 9 when labelled. */
export class PartyMeter extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, o: MeterOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    const bh = o.h ?? 5;
    const labelled = !!(o.label || o.right);
    this.h = bh + (labelled ? 9 : 0);
    const font = o.on === 'stone' ? 'rGold' : 'pSec';
    let ty = 0;
    if (labelled) {
      const rw = o.right ? mw(o.right, font, 6) : 0;
      if (o.label) this.add(mtext(scene, 0, 0, o.label, font, { size: 6, maxW: this.w - rw - 4, box: { owner: this, w: this.w, h: this.h } }));
      if (o.right) this.add(mtext(scene, this.w, 0, o.right, font, { size: 6, align: 1, maxW: this.w, box: { owner: this, w: this.w, h: this.h } }));
      ty = 9;
    }
    const g = scene.add.graphics();
    g.fillStyle(MOSAIC.parchEdge, 0.9);
    g.fillRoundedRect(0, ty, this.w, bh, bh / 2.2);
    g.fillStyle(MOSAIC.well, 1);
    g.fillRoundedRect(0.7, ty + 0.7, this.w - 1.4, bh - 1.4, Math.max(1, bh / 2.6));
    const f = o.max > 0 ? Math.max(0, Math.min(1, o.value / o.max)) : 0;
    if (f > 0) {
      g.fillStyle(o.color ?? MOSAIC.segDone, 1);
      g.fillRoundedRect(0.7, ty + 0.7, Math.max(2, (this.w - 1.4) * f), bh - 1.4, Math.max(1, bh / 2.6));
    }
    this.add(g);
    scene.add.existing(this);
  }
}

// ================================================================== stat meter

export interface PartyStatOpts {
  label: string;
  max: number;
  color: number;
  tip?: string;
  format?: (v: number) => string;
  lowerIsBetter?: boolean;
}

/** One derived stat: its name and value above a bar on a sunken track; a preview of pending points shows as a green gain or a red loss ("a > b"). 22 tall (a touch target with a tip). */
export class PartyStat extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h = 22;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, o: PartyStatOpts, value: number, preview?: number) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    const fmt = o.format ?? ((v: number) => `${Math.round(v)}`);
    const f = (v: number) => Math.max(0, Math.min(1, o.max > 0 ? v / o.max : 0));
    const box = { owner: this as Phaser.GameObjects.Container, w: this.w, h: this.h };
    const has = preview !== undefined && Math.abs(preview - value) > 1e-6;
    const better = has && (preview! > value) !== !!o.lowerIsBetter;
    const valText = has ? `${fmt(value)} > ${fmt(preview!)}` : fmt(value);
    const vw = mw(valText, 'pInk', 6.5);
    this.add(mtext(scene, 0, 2, o.label, 'pInk', { size: 6.5, maxW: this.w - vw - 6, box }));
    this.add(mtext(scene, this.w, 2, valText, has ? (better ? 'pGood' : 'pBad') : 'pInk', { size: 6.5, align: 1, box }));
    const by = 13;
    const g = scene.add.graphics();
    g.fillStyle(MOSAIC.parchEdge, 0.9);
    g.fillRoundedRect(0, by, this.w, 6, 2);
    g.fillStyle(MOSAIC.well, 1);
    g.fillRoundedRect(0.7, by + 0.7, this.w - 1.4, 4.6, 1.4);
    const lo = has ? Math.min(value, preview!) : value;
    const fw = Math.round((this.w - 1.4) * f(lo));
    if (fw > 0) {
      g.fillStyle(o.color, 1);
      g.fillRoundedRect(0.7, by + 0.7, Math.max(2, fw), 4.6, 1.4);
    }
    if (has) {
      const hi = Math.round((this.w - 1.4) * f(Math.max(value, preview!)));
      g.fillStyle(better ? 0x5fae3c : ACCENT.dangerFill, 1);
      g.fillRect(0.7 + fw, by + 0.7, Math.max(1, hi - fw), 4.6);
    }
    this.add(g);
    if (o.tip) {
      this.setSize(this.w, this.h);
      this.setInteractive(new Phaser.Geom.Rectangle(this.w / 2, this.h / 2, this.w, this.h), Phaser.Geom.Rectangle.Contains);
      tappable(this, null, () => showTooltip(scene, o.tip!, this), o.tip);
    }
    uiId(this, `stat:${o.label}`);
    scene.add.existing(this);
  }
}

// ================================================================== stash grid

const FILTER_H = TAP;

/**
 * The stash as an inventory grid on parchment: filter chips (slot, rarity, sort), then the items in
 * their rarity frames with condition pips and green upgrade arrows. Same options as the v3 `StashGrid`.
 */
export interface MStashGridOpts extends StashGridOpts {
  /** Lay every item out in the page instead of scrolling inside: the page's own scroll area (taps ignore its drags). */
  inline?: ScrollArea;
}

export class MStashGrid {
  readonly c: C;
  /** Height used from `y` (inline mode: the whole grid; else the box it was given). */
  height = 0;
  private grid: Grid | null = null;
  private list: Item[] = [];

  constructor(private scene: UiScene, parent: C, private x: number, private y: number, private w: number, private h: number, private o: MStashGridOpts) {
    this.c = scene.add.container(0, 0);
    parent.add(this.c);
    this.build();
  }

  get scroll(): number {
    return this.grid?.list.area.scrollY ?? 0;
  }

  rebuild(keepScroll = true): void {
    const s = keepScroll ? this.scroll : 0;
    this.build();
    this.grid?.list.area.setScroll(s);
  }

  destroy(): void {
    this.grid?.destroy();
    this.grid = null;
    this.c.destroy();
  }

  private buildInline(cy: number, area: ScrollArea): void {
    const scene = this.scene;
    const { x, w } = this;
    const cell = this.o.cell ?? 28;
    const hero = this.o.hero?.();
    const cols = Math.max(1, Math.floor((w - 3 + GAP) / (cell + GAP)));
    const pad = Math.floor((w - 3 - (cols * (cell + GAP) - GAP)) / 2);
    const rows = Math.max(1, Math.ceil(this.list.length / cols));
    const gh = Math.max(40, rows * (cell + GAP) - GAP + 8);
    this.c.add(mosaicImage(scene, x, cy, w, gh, 'parchmentWell'));
    if (!this.list.length) this.c.add(addPartyEmpty(scene, x + 2, cy + 2, w - 4, gh - 4, { icon: 'shield', title: t('stash.noMatch'), hint: t('stash.noMatchHint') }));
    this.list.forEach((it, i) => {
      const cc = scene.add.container(x + 3 + pad + (i % cols) * (cell + GAP), cy + 4 + Math.floor(i / cols) * (cell + GAP));
      this.c.add(cc);
      stashCell(scene, this.o, it, cc, cell, area, hero);
    });
    this.height = cy + gh - this.y;
  }

  private set(s: Partial<ReturnType<typeof defaultStashState>>): void {
    Object.assign(this.o.state, s);
    this.o.onState?.(this.o.state);
    this.rebuild(false);
  }

  private build(): void {
    const scene = this.scene;
    this.grid?.destroy();
    this.grid = null;
    this.c.removeAll(true);
    const { x, y, w, h } = this;
    const st = this.o.state;
    let cy = y;
    const chipW = Math.floor((w - 5 * GAP) / 6);
    const twoRows = h >= 140 && chipW >= TAP;
    if (twoRows) {
      SLOT_FILTERS.forEach((f, i) => {
        const bw = i === 5 ? w - 5 * (chipW + GAP) : chipW;
        this.c.add(new SmallButton(scene, x + i * (chipW + GAP), cy, bw, FILTER_H, { icon: f === 'all' ? 'people' : SLOT_ICON[f], variant: st.slot === f ? 'secondary' : 'neutral', tip: f === 'all' ? t('stash.all') : t(`slot.${f}` as TKey), id: `filter:${f}`, onClick: () => this.set({ slot: f }) }));
      });
      cy += FILTER_H + GAP;
    }
    const n = twoRows ? 2 : 3;
    const bw = Math.floor((w - (n - 1) * GAP) / n);
    let bx = x;
    if (!twoRows) {
      this.c.add(
        new MButton(scene, bx, cy, bw, FILTER_H, {
          label: st.slot === 'all' ? t('stash.all') : t(`slot.${st.slot}` as TKey),
          icon: st.slot === 'all' ? undefined : SLOT_ICON[st.slot],
          variant: st.slot === 'all' ? 'neutral' : 'secondary',
          id: 'filter:slot',
          tip: t('stash.slotTip'),
          onClick: () => this.set({ slot: cycle(SLOT_FILTERS, st.slot) }),
        }),
      );
      bx += bw + GAP;
    }
    this.c.add(
      new MButton(scene, bx, cy, bw, FILTER_H, {
        label: st.rarity === 'all' ? t('stash.anyRarity') : t(`rarity.${st.rarity}` as TKey),
        variant: st.rarity === 'all' ? 'neutral' : 'secondary',
        id: 'filter:rarity',
        tip: t('stash.rarityTip'),
        onClick: () => this.set({ rarity: cycle(RARITY_FILTERS, st.rarity) }),
      }),
    );
    bx += bw + GAP;
    this.c.add(new MButton(scene, bx, cy, x + w - bx, FILTER_H, { label: t(`stash.sort.${st.sort}` as TKey), icon: 'scales', variant: 'neutral', id: 'filter:sort', tip: t('stash.sortTip'), onClick: () => this.set({ sort: cycle(STASH_SORTS, st.sort) }) }));
    cy += FILTER_H + GAP + 1;
    const inline = this.o.inline;
    const gh = inline ? 0 : y + h - cy;
    const all = this.o.items();
    this.list = queryStash(all, st);
    if (inline) {
      this.buildInline(cy, inline);
      return;
    }
    this.height = h;
    this.c.add(mosaicImage(scene, x, cy, w, gh, 'parchmentWell'));
    if (!this.list.length) {
      const filtered = all.length > 0;
      this.c.add(
        addPartyEmpty(scene, x + 2, cy + 2, w - 4, gh - 4, {
          icon: 'shield',
          title: filtered ? t('stash.noMatch') : this.o.empty?.title ?? t('stash.emptyTitle'),
          hint: filtered ? t('stash.noMatchHint') : this.o.empty?.hint ?? t('stash.emptyHint'),
          action: filtered ? { label: t('stash.clearFilters'), onClick: () => this.set({ slot: 'all', rarity: 'all' }) } : undefined,
        }),
      );
      return;
    }
    const cell = this.o.cell ?? 28;
    const hero = this.o.hero?.();
    this.grid = new Grid(scene, this.c, x + 3, cy + 3, w - 4, gh - 6, {
      count: this.list.length,
      cell,
      render: (i, cc, size, area) => stashCell(scene, this.o, this.list[i], cc, size, area, hero),
    });
  }
}

/** One stash cell: the item in its rarity frame, a condition pip, an optional price tag and the upgrade arrow. */
function stashCell(scene: UiScene, o: MStashGridOpts, it: Item, cc: C, size: number, area: ScrollArea | null, hero: Hero | undefined): void {
  const sel = o.selected?.() === it.uid;
  const ic = new ItemIcon(scene, 0, 0, { item: it }, { size, area, selected: sel, tip: false, onTap: () => o.drag?.dragging || o.onTap(it) });
  cc.add(ic);
  cc.add(condPip(scene, 3, size - 4, size - 6, it.cond));
  const pr = o.price?.(it);
  if (pr) {
    const pt = mtext(scene, size - 2, 1, pr.text, 'light', { size: 5.5, align: 1 });
    const bg = scene.add.rectangle(size - 3 - pt.width, 1, pt.width + 2, 7, 0x000000, 0.65).setOrigin(0, 0);
    cc.add([bg, pt]);
  }
  if (hero && isUpgrade(hero, it)) {
    const g = scene.add.graphics();
    g.fillStyle(0x1d140f, 1);
    g.fillTriangle(size - 9, 7, size - 5, 2, size - 1, 7);
    g.fillStyle(0x7fd05a, 1);
    g.fillTriangle(size - 8, 6, size - 5, 3, size - 2, 6);
    g.fillRect(size - 6, 6, 2, 3);
    cc.add(g);
  }
  o.drag?.attach(ic, it, area);
}

/** A thin condition bar (green, then amber, then red). */
function condPip(scene: Phaser.Scene, x: number, y: number, w: number, cond: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.7);
  g.fillRect(x, y, w, 2);
  g.fillStyle(cond > 66 ? 0x7fd05a : cond > 33 ? MOSAIC.segDone : ACCENT.dangerFill, 1);
  g.fillRect(x, y, Math.max(1, Math.round((w * Math.max(0, Math.min(100, cond))) / 100)), 2);
  return g;
}

// ================================================================== empty state

export interface PartyEmptyOpts {
  icon?: string;
  title: string;
  hint: string;
  action?: { label: string; onClick: () => void };
}

/** A centred empty state on parchment: a faded icon, a Cinzel title, a hint and an optional action. */
export function addPartyEmpty(scene: Phaser.Scene, x: number, y: number, w: number, h: number, o: PartyEmptyOpts): C {
  const c = scene.add.container(Math.round(x), Math.round(y));
  let lines = 4;
  let hint = wrapText(o.hint, w - 12, lines, false, 6);
  const actionH = o.action ? TAP + 6 : 0;
  let showIcon = !!o.icon;
  const total = () => (showIcon ? 24 : 0) + 12 + hint.lines.length * 8 + actionH;
  if (total() > h) showIcon = false;
  while (total() > h && lines > 1) hint = wrapText(o.hint, w - 12, --lines, false, 6);
  let cy = Math.max(0, Math.round((h - total()) / 2));
  if (showIcon && o.icon) {
    const ic = addIcon(scene, Math.round(w / 2 - 6), cy + 4, o.icon, 'D');
    c.add(ic);
    cy += 24;
  }
  c.add(mtext(scene, w / 2, cy, o.title, 'rInk', { size: 7.5, align: 0.5, maxW: w - 8, box: { owner: c, w, h } }));
  cy += 12;
  hint.lines.forEach((l, i) => c.add(mtext(scene, w / 2, cy + i * 8, l, 'pSec', { size: 6, align: 0.5, box: { owner: c, w, h } })));
  cy += hint.lines.length * 8;
  if (o.action) c.add(new MButton(scene, Math.round((w - Math.min(w - 8, 90)) / 2), cy + 4, Math.min(w - 8, 90), TAP, { label: o.action.label, variant: 'secondary', onClick: o.action.onClick }));
  return c;
}

// ================================================================== list helpers

/** The parchment face of a list row (selected: lighter with a bronze rim). */
export function addRowFace(scene: Phaser.Scene, row: C, w: number, h: number, selected = false): void {
  row.add(mosaicImage(scene, 0, 0, w, h, selected ? 'parchmentSel' : 'parchment'));
}

/** A portrait well: a bronze-rimmed square tinted by `tint` (a role colour) around a pixel portrait added by the caller at (x + 1, y + 1). */
export function addPortraitWell(scene: Phaser.Scene, parent: C, x: number, y: number, size: number, tint: number): void {
  const g = scene.add.graphics();
  g.fillStyle(MOSAIC.bronzeLo, 1);
  g.fillRect(x - 1, y - 1, size + 2, size + 2);
  g.fillStyle(tint, 1);
  g.fillRect(x, y, size, size);
  g.lineStyle(0.6, MOSAIC.bronzeHi, 0.9);
  g.strokeRect(x - 0.7, y - 0.7, size + 1.4, size + 1.4);
  parent.add(g);
}

/** A round count badge on a tab of a SegmentedSwitch (`i` of `n` segments across `w`). */
export function addSwitchBadge(scene: Phaser.Scene, parent: C, x: number, y: number, w: number, n: number, i: number, count: number | string): void {
  const segW = Math.floor((w - 2) / n);
  parent.add(new MBadge(scene, x + 1 + (i + 1) * segW - 5, y + 1, count));
}

/** Item names in their rarity ink on parchment (registered once per game). */
export function rarityInk(scene: Phaser.Scene, rarity: string): FontKey {
  if (!scene.textures.exists('font_rarP_common')) for (const [r, c] of Object.entries(RARITY_INK)) registerVectorFont(scene, `font_rarP_${r}`, c);
  return `rarP_${normalizeRarity(rarity)}` as FontKey;
}

// ================================================================== framed art

/** A pixel illustration (a texture `key` of exactly (w - 8) x (h - 8) UI px at panelK density) in the riveted fresco frame. */
export function addFramedArt(scene: Phaser.Scene, parent: C, x: number, y: number, w: number, h: number, key: string): C {
  const c = scene.add.container(Math.round(x), Math.round(y));
  const K = panelK(scene);
  c.add(scene.add.image(4, 4, key).setOrigin(0, 0).setScale(1 / K));
  c.add(mosaicImage(scene, 0, 0, w, h, 'fresco'));
  parent.add(c);
  return c;
}
