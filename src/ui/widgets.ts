/**
 * Higher-level UI kit components (docs/UI_KIT.md): tooltips, toasts, badges,
 * stat bars, count-up tiles, tabs, virtualised scroll lists, expandable
 * cards, inventory grids, item icons, modals, confirm dialogs, empty states
 * and fitted labels. All sizes are UI pixels inside the scaled UI root; every
 * component meets the touch rules (src/ui/theme.ts SIZE) and is picked up by
 * the layout check (src/ui/layout.ts) without extra work.
 *
 * Call `installWidgets()` once (main.ts) to route long-presses and disabled
 * button taps to the tooltip and toast here.
 */
import Phaser from 'phaser';
import { Button, ScrollArea, addIcon, addPanel, addScroll, addText, longPress, panelTexture, tappable, SHADOW_FONTS, type ButtonVariant, type FontKey, type UIMetrics } from './kit';
import { uiBlocker, uiFrame, uiId, worldRect } from './layout';
import { ellipsize, measureText, wrapText, LINE_H } from './textfit';
import { RARITY_COLOR, RARITY_GLOW, SIZE, COLOR, glows } from './theme';
import { renderGlow, renderRarityFrame } from '../art/uiTextures';
import { renderGoodsIcon, goodsIconKey, type GoodsKind } from '../art/goodsIcons';
import { itemDef, normalizeRarity, type Item, type Rarity } from '../data/items';
import { ensureItemIcon } from './sprites';
import { navLayer } from '../platform/nav';
import { haptic } from '../platform/telegram';
import { sfx } from '../audio';
import { t, tOr } from '../i18n';

/** A scene with a scaled UI root (BaseScene and friends). */
export interface UiScene extends Phaser.Scene {
  ui: Phaser.GameObjects.Container;
  m: UIMetrics;
}

const metrics = (scene: Phaser.Scene): UIMetrics => (scene as UiScene).m ?? { S: 2, VW: Math.floor(scene.scale.width / 2), VH: Math.floor(scene.scale.height / 2) };

/** The container overlays go into: the scene's UI root, or a scaled root made on demand. */
function overlayRoot(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const s = scene as UiScene;
  if (s.ui) return s.ui;
  const key = '__overlayRoot';
  let root = scene.data?.get(key) as Phaser.GameObjects.Container | undefined;
  if (!root || !root.scene) {
    root = scene.add.container(0, 0).setScale(metrics(scene).S).setDepth(1000);
    scene.data?.set(key, root);
  }
  return root;
}

/** An object's bounds in UI pixels. */
function uiBounds(scene: Phaser.Scene, obj: Phaser.GameObjects.GameObject): { x: number; y: number; w: number; h: number } {
  const S = metrics(scene).S;
  const o = obj as unknown as { w?: number; h?: number; getBounds?: () => Phaser.Geom.Rectangle; getWorldTransformMatrix?: unknown };
  let r: { x: number; y: number; w: number; h: number };
  if (typeof o.w === 'number' && typeof o.h === 'number' && o.getWorldTransformMatrix) r = worldRect(obj as unknown as Phaser.GameObjects.Components.Transform, 0, 0, o.w, o.h);
  else if (o.getBounds) {
    const b = o.getBounds();
    r = { x: b.x, y: b.y, w: b.width, h: b.height };
  } else r = { x: 0, y: 0, w: 0, h: 0 };
  return { x: r.x / S, y: r.y / S, w: r.w / S, h: r.h / S };
}

// ================================================================== tooltip

const tooltips = new WeakMap<Phaser.Scene, Phaser.GameObjects.Container>();

/** Hide the scene's tooltip, if any. */
export function hideTooltip(scene: Phaser.Scene): void {
  tooltips.get(scene)?.destroy();
  tooltips.delete(scene);
}

/**
 * A dark tooltip next to `anchor` (above it, or below when there is no room),
 * clamped to the screen. Closes on the next tap anywhere or after a while.
 */
export function showTooltip(scene: Phaser.Scene, text: string, anchor: Phaser.GameObjects.GameObject | { x: number; y: number; w: number; h: number }): Phaser.GameObjects.Container {
  hideTooltip(scene);
  const { VW, VH } = metrics(scene);
  const a = anchor instanceof Phaser.GameObjects.GameObject ? uiBounds(scene, anchor) : anchor;
  const maxW = Math.min(VW - 16, 168);
  const wrap = wrapText(text, maxW - 12, 8, true);
  const tw = Math.max(...wrap.lines.map((l) => measureText(l, true)), 10);
  const w = Math.min(maxW, tw + 12);
  const h = wrap.lines.length * LINE_H + 9;
  let x = Math.round(a.x + a.w / 2 - w / 2);
  x = Math.max(4, Math.min(VW - 4 - w, x));
  let y = Math.round(a.y - h - 3);
  if (y < 4) y = Math.round(Math.min(VH - 4 - h, a.y + a.h + 3));
  const c = scene.add.container(x, y);
  overlayRoot(scene).add(c);
  c.add(addPanel(scene, 0, 0, w, h, 'tooltip'));
  const txt = addText(scene, w / 2, 5, wrap.lines.join('\n'), 'light', 0.5);
  txt.setCenterAlign();
  uiFrame(txt, c as unknown as Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, w, h);
  c.add(txt);
  c.setAlpha(0);
  scene.tweens.add({ targets: c, alpha: 1, duration: 90 });
  tooltips.set(scene, c);
  const close = () => {
    if (tooltips.get(scene) === c) hideTooltip(scene);
  };
  // the long-press finger lifts first; close on the next tap
  scene.time.delayedCall(120, () => scene.input.once('pointerdown', close));
  scene.time.delayedCall(Math.max(2500, 900 + text.length * 45), close);
  return c;
}

// ================================================================== toast

const toasts = new WeakMap<Phaser.Scene, Phaser.GameObjects.Container>();

export type ToastKind = 'info' | 'good' | 'bad';

/** A short message at the top of the screen that fades away (one at a time). */
export function toast(scene: Phaser.Scene, text: string, kind: ToastKind = 'info', ms = 2200): Phaser.GameObjects.Container {
  toasts.get(scene)?.destroy();
  const { VW } = metrics(scene);
  const maxW = Math.min(VW - 16, 200);
  const wrap = wrapText(text, maxW - 14, 3, true);
  const tw = Math.max(...wrap.lines.map((l) => measureText(l, true)), 10);
  const w = Math.min(maxW, tw + 14);
  const h = wrap.lines.length * LINE_H + 10;
  const c = scene.add.container(Math.round((VW - w) / 2), 6);
  overlayRoot(scene).add(c);
  c.add(addPanel(scene, 0, 0, w, h, 'tooltip'));
  if (kind !== 'info') c.add(scene.add.rectangle(2, 2, 2, h - 4, kind === 'good' ? COLOR.good : COLOR.bad).setOrigin(0, 0));
  const txt = addText(scene, w / 2, 5, wrap.lines.join('\n'), 'light', 0.5);
  txt.setCenterAlign();
  c.add(txt);
  c.setAlpha(0);
  c.y = 0;
  scene.tweens.add({ targets: c, alpha: 1, y: 6, duration: 140, ease: 'Quad.easeOut' });
  scene.time.delayedCall(ms, () => {
    if (!c.scene) return;
    scene.tweens.add({ targets: c, alpha: 0, duration: 220, onComplete: () => c.destroy() });
  });
  toasts.set(scene, c);
  c.once('destroy', () => toasts.get(scene) === c && toasts.delete(scene));
  return c;
}

// ================================================================== first-time hint

/** Persisted list of hints already shown (settings.seenHints); set by the game state at boot. */
export const hintStore: { seen: () => string[]; mark: (id: string) => void } = {
  seen: () => [],
  mark: () => {},
};

/** Show `text` once per screen id (first visit), as a longer toast. Returns whether it showed. */
export function firstTimeHint(scene: Phaser.Scene, id: string, text: string): boolean {
  const seen = hintStore.seen();
  if (seen.includes(id) || seen.includes('*')) return false;
  hintStore.mark(id);
  toast(scene, text, 'info', 4500);
  return true;
}

// ================================================================== badge

/** A small red count bubble (notifications, new items). Hidden at 0. */
export class Badge extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  private txt: Phaser.GameObjects.BitmapText;

  constructor(scene: Phaser.Scene, x: number, y: number, count: number | string = 0) {
    super(scene, Math.round(x), Math.round(y));
    this.bg = scene.add.graphics();
    this.txt = addText(scene, 0, -4, '', 'light', 0.5);
    this.add([this.bg, this.txt]);
    uiFrame(this.txt, this, 40, 12, -20, -6);
    scene.add.existing(this);
    this.setCount(count);
  }

  /** Number (0 hides it; > 99 shows 99+) or a short mark like "!". */
  setCount(n: number | string): this {
    const s = typeof n === 'number' ? (n > 99 ? '99+' : `${n}`) : n;
    this.setVisible(!(n === 0 || s === ''));
    this.txt.setText(s);
    const w = Math.max(9, measureText(s, true) + 5);
    this.bg.clear();
    this.bg.fillStyle(0x2a1a16, 1);
    this.bg.fillRoundedRect(-w / 2 - 1, -6, w + 2, 12, 5);
    this.bg.fillStyle(0xb8382a, 1);
    this.bg.fillRoundedRect(-w / 2, -5, w, 10, 4);
    return this;
  }
}

// ================================================================== stat bar

export interface StatBarOpts {
  label: string;
  max: number;
  color?: number;
  /** Long-press explanation. */
  tip?: string;
  /** Value formatting (default: rounded). */
  format?: (v: number) => string;
  /** Lower is better (e.g. attack time): swaps the delta colours. */
  lowerIsBetter?: boolean;
}

/**
 * Label, value and a bar; `set(value, preview)` shows the change an equip
 * would make: green extension for a gain, red for a loss, and "a > b".
 * Height 22 (a touch target when it has a tip).
 */
export class StatBar extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h = 22;
  private g: Phaser.GameObjects.Graphics;
  private lab: Phaser.GameObjects.BitmapText;
  private val: Phaser.GameObjects.BitmapText;
  private pre: Phaser.GameObjects.BitmapText;
  private o: StatBarOpts;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, o: StatBarOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    this.o = o;
    this.g = scene.add.graphics();
    this.lab = addText(scene, 0, 2, '', 'ink');
    this.val = addText(scene, this.w, 2, '', 'ink', 1);
    this.pre = addText(scene, this.w, 2, '', 'good', 1);
    this.add([this.g, this.lab, this.val, this.pre]);
    if (o.tip) {
      this.setSize(this.w, this.h);
      this.setInteractive(new Phaser.Geom.Rectangle(this.w / 2, this.h / 2, this.w, this.h), Phaser.Geom.Rectangle.Contains);
      tappable(this, null, () => showTooltip(scene, o.tip!, this), o.tip);
    }
    uiId(this, `stat:${o.label}`);
    scene.add.existing(this);
    this.set(0);
  }

  set(value: number, preview?: number): this {
    const { max, color = COLOR.xp } = this.o;
    const fmt = this.o.format ?? ((v: number) => `${Math.round(v)}`);
    const f = (v: number) => Math.max(0, Math.min(1, max > 0 ? v / max : 0));
    const bw = this.w;
    const by = 14;
    const g = this.g;
    g.clear();
    g.fillStyle(0x2a1a16, 1);
    g.fillRect(0, by, bw, 6);
    g.fillStyle(0x6b4a40, 1);
    g.fillRect(1, by + 1, bw - 2, 4);
    const has = preview !== undefined && Math.abs(preview - value) > 1e-6;
    const lo = has ? Math.min(value, preview!) : value;
    const fw = Math.round((bw - 2) * f(lo));
    if (fw > 0) {
      g.fillStyle(color, 1);
      g.fillRect(1, by + 1, fw, 4);
      g.fillStyle(0xffffff, 0.25);
      g.fillRect(1, by + 1, fw, 1);
    }
    if (has) {
      const better = (preview! > value) !== !!this.o.lowerIsBetter;
      const hi = Math.round((bw - 2) * f(Math.max(value, preview!)));
      g.fillStyle(better ? COLOR.good : COLOR.bad, 1);
      g.fillRect(1 + fw, by + 1, Math.max(1, hi - fw), 4);
      this.pre.setFont(better ? 'font_good' : 'font_red');
      this.pre.setText(fmt(preview!));
      this.val.setText(`${fmt(value)} >`);
      this.val.x = this.w - this.pre.width - 3;
    } else {
      this.pre.setText('');
      this.val.setText(fmt(value));
      this.val.x = this.w;
    }
    this.lab.setText(ellipsize(this.o.label, Math.max(10, this.val.x - this.val.width - 4)));
    return this;
  }
}

// ================================================================== count-up tile

export interface CountUpOpts {
  icon?: string;
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  delay?: number;
  /** Tick sound while counting (default true). */
  sound?: boolean;
  font?: FontKey;
}

/** An icon tile whose number counts up from 0 (results screens). */
export class CountUp extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;
  private num: Phaser.GameObjects.BitmapText;
  private o: CountUpOpts;
  private big: boolean;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, o: CountUpOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    this.h = Math.round(h);
    this.o = o;
    this.add(addPanel(scene, 0, 0, this.w, this.h, 'inset'));
    let top = 3;
    if (o.icon && this.h >= 34) {
      this.add(addIcon(scene, (this.w - 12) / 2, 2, o.icon));
      top = 14;
    }
    const final = `${o.prefix ?? ''}${o.value}${o.suffix ?? ''}`;
    this.big = measureText(final, false, 14) <= this.w - 6 && this.h - 10 - top >= 20;
    this.num = addText(scene, this.w / 2, top, `${o.prefix ?? ''}0${o.suffix ?? ''}`, o.font ?? 'ink', 0.5);
    if (this.big) this.num.setFontSize(14);
    uiFrame(this.num, this, this.w, this.h);
    this.add(this.num);
    const lab = addText(scene, this.w / 2, this.h - 10, ellipsize(o.label, this.w - 4), 'dim', 0.5);
    uiFrame(lab, this, this.w, this.h);
    this.add(lab);
    uiId(this, `countup:${o.label}`);
    scene.add.existing(this);
  }

  /** Start counting (returns the tween). */
  start(): Phaser.Tweens.Tween {
    const o = this.o;
    let lastTick = 0;
    return this.scene.tweens.addCounter({
      from: 0,
      to: o.value,
      duration: o.duration ?? 900,
      delay: o.delay ?? 0,
      ease: 'Cubic.easeOut',
      onUpdate: (tw) => {
        const v = Math.round(tw.getValue() ?? 0);
        this.num.setText(`${o.prefix ?? ''}${v}${o.suffix ?? ''}`);
        const now = this.scene?.time.now ?? 0;
        if (o.sound !== false && now - lastTick > 70 && v > 0) {
          lastTick = now;
          sfx.play('tap');
        }
      },
      onComplete: () => {
        this.num.setText(`${o.prefix ?? ''}${o.value}${o.suffix ?? ''}`);
        if (o.value > 0) haptic('light');
      },
    });
  }
}

// ================================================================== tabs

export interface TabsOpts {
  selected?: number;
  onChange?: (i: number) => void;
  icons?: (string | undefined)[];
  /** Show only the icons (the label becomes the tip): many tabs on a narrow screen. */
  iconOnly?: boolean;
  /** Ids for the layout check (default: the labels). */
  ids?: string[];
}

/**
 * A row of equal tabs for separate sections of one screen (Stats | Gear |
 * Perks). The selected tab is red; labels that do not fit end in "…" (full
 * label on long-press). Height SIZE.tabH.
 */
export class Tabs extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h = SIZE.tabH;
  private buttons: Button[] = [];
  private sel: number;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, labels: string[], private o: TabsOpts = {}) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    this.sel = o.selected ?? 0;
    const n = labels.length;
    const gap = SIZE.gap;
    const tw = Math.floor((this.w - gap * (n - 1)) / n);
    labels.forEach((label, i) => {
      const b = new Button(scene, i * (tw + gap), 0, i === n - 1 ? this.w - i * (tw + gap) : tw, this.h, {
        label,
        icon: o.icons?.[i],
        iconOnly: !!o.iconOnly && !!o.icons?.[i],
        style: i === this.sel ? 'buttonSel' : 'button',
        id: o.ids?.[i],
        onClick: () => this.select(i),
      });
      this.buttons.push(b);
      this.add(b);
    });
    // underline joining the tabs to their page
    this.add(scene.add.rectangle(0, this.h, this.w, 1, 0x8c2f25).setOrigin(0, 0));
    scene.add.existing(this);
  }

  get selected(): number {
    return this.sel;
  }

  select(i: number, notify = true): void {
    if (i === this.sel) return;
    this.sel = i;
    this.buttons.forEach((b, k) => b.setSelected(k === i));
    if (notify) this.o.onChange?.(i);
  }

  /** Badge on a tab (e.g. new items). */
  badge(i: number, count: number | string): Badge {
    const b = this.buttons[i];
    const badge = new Badge(this.scene, b.x + b.w - 4, 3, count);
    this.add(badge);
    return badge;
  }
}

// ================================================================== scroll hint

/**
 * A scrollbar thumb along the right edge and a bobbing chevron while there is
 * more below (and above): the "visible scroll hint" of long lists.
 */
export function addScrollHint(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, area: ScrollArea): Phaser.GameObjects.Graphics {
  const { x, y, w, h } = area.bounds;
  const g = scene.add.graphics();
  parent.add(g);
  let bob = 0;
  const draw = () => {
    g.clear();
    const max = area.maxScrollY;
    if (max <= 0) return;
    const s = area.scrollY;
    const total = area.contentHeight;
    const th = Math.max(10, Math.round((h * h) / total));
    const ty = Math.round(y + (h - th) * (s / max));
    g.fillStyle(0x2a1a16, 0.35);
    g.fillRect(x + w - 2, y + 1, 2, h - 2);
    g.fillStyle(0x8c2f25, 0.9);
    g.fillRect(x + w - 2, ty, 2, th);
    const cx = Math.round(x + w / 2);
    const chev = (cy: number, down: boolean) => {
      g.fillStyle(0x2a1a16, 0.55);
      g.fillRoundedRect(cx - 7, cy - 3, 14, 7, 3);
      g.fillStyle(0xf6ecd8, 1);
      for (let i = 0; i < 4; i++) g.fillRect(cx - 4 + i, cy + (down ? i - 1 : 2 - i), 1, 1), g.fillRect(cx + 3 - i, cy + (down ? i - 1 : 2 - i), 1, 1);
    };
    const b = Math.round(Math.sin(bob) * 1.5);
    if (s < max - 1) chev(y + h - 5 + b, true);
    if (s > 1) chev(y + 4 - b, false);
  };
  area.onScroll(draw);
  const tick = () => {
    bob += 0.12;
    if (area.maxScrollY > 0) draw();
  };
  scene.events.on('update', tick);
  g.once('destroy', () => scene.events.off('update', tick));
  scene.events.once('shutdown', () => scene.events.off('update', tick));
  draw();
  return g;
}

// ================================================================== scroll list (virtualised)

export interface ScrollListOpts {
  count: number;
  rowH: number;
  /** Space between rows (default SIZE.gap: keeps the 4 pt touch spacing). */
  gap?: number;
  /** Fill a row container (w x rowH, origin top-left). Rows are built only while near the viewport. */
  render: (i: number, row: Phaser.GameObjects.Container, w: number, h: number, area: ScrollArea) => void;
  /** Tap on a row (not a drag). Rows without it are not interactive. */
  onTap?: (i: number) => void;
  /** Long-press text of a row. */
  tip?: (i: number) => string | undefined;
  /** Layout-check id of a row. */
  id?: (i: number) => string;
  /** Rows built beyond the viewport on each side (default 2). */
  overscan?: number;
  /** Draw the scrollbar / chevron hint (default true). */
  hint?: boolean;
}

/**
 * A vertical list with momentum scrolling, a visible scroll hint and
 * virtualisation (only rows near the viewport exist), for long collections
 * (roster, inventory, marketplace).
 */
export class ScrollList {
  readonly area: ScrollArea;
  private rows = new Map<number, Phaser.GameObjects.Container>();
  private o: ScrollListOpts;
  private hint?: Phaser.GameObjects.Graphics;

  constructor(
    private scene: Phaser.Scene,
    parent: Phaser.GameObjects.Container,
    readonly x: number,
    readonly y: number,
    readonly w: number,
    readonly h: number,
    o: ScrollListOpts,
  ) {
    this.o = { gap: SIZE.gap, overscan: 2, hint: true, ...o };
    this.area = new ScrollArea(scene, parent, x, y, w, h, metrics(scene).S);
    this.area.onScroll(() => this.sync());
    if (this.o.hint) this.hint = addScrollHint(scene, parent, this.area);
    this.setCount(o.count);
  }

  private get step(): number {
    return this.o.rowH + (this.o.gap ?? 0);
  }

  get count(): number {
    return this.o.count;
  }

  /** Change the number of rows (rebuilds the visible rows). */
  setCount(n: number): void {
    this.o.count = n;
    this.refresh();
  }

  /** Rebuild the visible rows (data changed). */
  refresh(): void {
    for (const r of this.rows.values()) r.destroy();
    this.rows.clear();
    this.area.setContentHeight(Math.max(0, this.o.count * this.step - (this.o.gap ?? 0)));
    this.sync();
  }

  /** Rebuild one row if it exists. */
  refreshRow(i: number): void {
    const r = this.rows.get(i);
    if (!r) return;
    r.destroy();
    this.rows.delete(i);
    this.sync();
  }

  scrollToIndex(i: number): void {
    this.area.setScroll(i * this.step - (this.h - this.o.rowH) / 2);
  }

  private sync(): void {
    const s = this.area.scrollY;
    const ov = this.o.overscan ?? 2;
    const first = Math.max(0, Math.floor(s / this.step) - ov);
    const last = Math.min(this.o.count - 1, Math.ceil((s + this.h) / this.step) + ov);
    for (const [i, r] of this.rows) {
      if (i < first || i > last) {
        r.destroy();
        this.rows.delete(i);
      }
    }
    for (let i = first; i <= last; i++) {
      if (this.rows.has(i)) continue;
      const row = this.scene.add.container(0, i * this.step);
      this.area.content.add(row);
      if (this.o.onTap) {
        const z = this.scene.add.zone(0, 0, this.w - 3, this.o.rowH).setOrigin(0, 0).setInteractive();
        row.add(z);
        uiId(z, this.o.id?.(i) ?? 'row');
        tappable(z, this.area, () => this.o.onTap!(i), this.o.tip ? () => this.o.tip!(i) : undefined);
      }
      this.o.render(i, row, this.w - 3, this.o.rowH, this.area);
      this.rows.set(i, row);
    }
  }

  destroy(): void {
    for (const r of this.rows.values()) r.destroy();
    this.rows.clear();
    this.hint?.destroy();
    this.area.destroy();
  }
}

// ================================================================== grid (inventory)

export interface GridOpts {
  count: number;
  /** Cell edge (default SIZE.cell). */
  cell?: number;
  gap?: number;
  /** Fill a cell container (cell x cell); `area` is the scroll area (pass it to ItemIcon / tappable). */
  render: (i: number, c: Phaser.GameObjects.Container, size: number, area: ScrollArea) => void;
  /** Tap on a cell: adds a tap zone per cell. Leave out when the cell content is itself interactive (ItemIcon with onTap). */
  onTap?: (i: number) => void;
  tip?: (i: number) => string | undefined;
}

/** An inventory grid on a virtualised ScrollList: as many columns as fit, rows built near the viewport. */
export class Grid {
  readonly list: ScrollList;
  readonly cols: number;
  private o: GridOpts;

  constructor(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, w: number, h: number, o: GridOpts) {
    this.o = { cell: SIZE.cell, gap: SIZE.gap, ...o };
    const cell = this.o.cell!;
    const gap = this.o.gap!;
    this.cols = Math.max(1, Math.floor((w - 3 + gap) / (cell + gap)));
    const pad = Math.floor((w - 3 - (this.cols * (cell + gap) - gap)) / 2);
    this.list = new ScrollList(scene, parent, x, y, w, h, {
      count: Math.ceil(o.count / this.cols),
      rowH: cell,
      gap,
      render: (r, row, _w, _h, area) => {
        for (let c = 0; c < this.cols; c++) {
          const i = r * this.cols + c;
          if (i >= this.o.count) break;
          const cc = scene.add.container(pad + c * (cell + gap), 0);
          row.add(cc);
          if (this.o.onTap) {
            const z = scene.add.zone(0, 0, cell, cell).setOrigin(0, 0).setInteractive();
            cc.add(z);
            uiId(z, 'cell');
            tappable(z, area, () => this.o.onTap!(i), this.o.tip ? () => this.o.tip!(i) : undefined);
          }
          this.o.render(i, cc, cell, area);
        }
      },
    });
  }

  setCount(n: number): void {
    this.o.count = n;
    this.list.setCount(Math.ceil(n / this.cols));
  }

  refresh(): void {
    this.list.refresh();
  }

  destroy(): void {
    this.list.destroy();
  }
}

// ================================================================== item icon

export type IconSubject = { item: Item } | { consumable: string } | { resource: string };

export interface ItemIconOpts {
  /** Frame edge in UI px (default SIZE.cell = 24: a 44 pt target at the smallest scale). */
  size?: number;
  /** Frame colour for goods (items use their own rarity). */
  rarity?: Rarity;
  onTap?: () => void;
  /** Long-press text; default: name, rarity and slot. false: none. */
  tip?: string | false;
  /** Inside a scroll list: taps ignore drags. */
  area?: ScrollArea | null;
  /** Stack count in the corner. */
  qty?: number;
  selected?: boolean;
  /** Pulsing glow for Rare+ (default true); Legendary also sparkles. */
  glow?: boolean;
}

/** Display name of an item / good in the current language (English data name as fallback). */
export function subjectName(s: IconSubject): string {
  if ('item' in s) {
    const d = itemDef(s.item.def);
    return tOr(`item.${d.id}.name`, d.name);
  }
  if ('consumable' in s) return tOr(`consumable.${s.consumable}.name`, s.consumable.replace(/_/g, ' '));
  return tOr(`res.${s.resource}`, s.resource);
}

function iconTexture(scene: Phaser.Scene, s: IconSubject): string {
  if ('item' in s) return ensureItemIcon(scene, s.item);
  const kind: GoodsKind = 'consumable' in s ? 'consumable' : 'resource';
  const id = 'consumable' in s ? s.consumable : s.resource;
  const key = goodsIconKey(kind, id);
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, renderGoodsIcon(kind, id).toCanvas());
  return key;
}

/**
 * A distinct pixel icon in a rarity frame (grey, green, blue, purple, gold).
 * Rare and above pulse with a soft glow; Legendary adds sparkles. Tap to act,
 * long-press for the name.
 */
export class ItemIcon extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;
  readonly rarity: Rarity;
  private sel?: Phaser.GameObjects.Graphics;
  private sparkTimer?: Phaser.Time.TimerEvent;
  private glowImg?: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number, readonly subject: IconSubject, o: ItemIconOpts = {}) {
    super(scene, Math.round(x), Math.round(y));
    const size = o.size ?? SIZE.cell;
    this.w = size;
    this.h = size;
    const rarity = 'item' in subject ? normalizeRarity(subject.item.rarity) : o.rarity ?? 'common';
    this.rarity = rarity;
    if (o.glow !== false && glows(rarity)) {
      const gk = `rglow_${rarity}_${size}`;
      if (!scene.textures.exists(gk)) scene.textures.addCanvas(gk, renderGlow(size, RARITY_GLOW[rarity], 4).toCanvas());
      this.glowImg = scene.add.image(-4, -4, gk).setOrigin(0, 0).setAlpha(0.45);
      this.add(this.glowImg);
      scene.tweens.add({ targets: this.glowImg, alpha: { from: 0.3, to: 0.95 }, duration: rarity === 'legendary' ? 700 : 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    const fk = `rframe_${rarity}_${size}`;
    if (!scene.textures.exists(fk)) scene.textures.addCanvas(fk, renderRarityFrame(size, RARITY_COLOR[rarity], RARITY_GLOW[rarity]).toCanvas());
    this.add(scene.add.image(0, 0, fk).setOrigin(0, 0));
    const icon = scene.add.image(Math.floor((size - 16) / 2), Math.floor((size - 16) / 2), iconTexture(scene, subject)).setOrigin(0, 0);
    this.add(icon);
    if (o.qty !== undefined && o.qty > 1) {
      const q = addText(scene, size - 1, size - 9, `${o.qty > 999 ? '999+' : o.qty}`, 'light', 1);
      this.add(q);
    }
    if (o.glow !== false && rarity === 'legendary') {
      this.sparkTimer = scene.time.addEvent({
        delay: 260,
        loop: true,
        callback: () => {
          if (!this.scene || !this.visible) return;
          const edge = Math.floor(Math.random() * 4);
          const p = Math.random() * size;
          const sx = edge === 0 ? p : edge === 1 ? size : edge === 2 ? p : 0;
          const sy = edge === 0 ? 0 : edge === 1 ? p : edge === 2 ? size : p;
          const sp = scene.add.rectangle(Math.round(sx), Math.round(sy), 1, 1, Math.random() < 0.5 ? 0xfff6c0 : 0xffffff).setOrigin(0.5);
          this.add(sp);
          scene.tweens.add({ targets: sp, alpha: 0, scale: 2, y: sp.y - 3, duration: 600, onComplete: () => sp.destroy() });
        },
      });
    }
    this.setSelected(!!o.selected);
    if (o.onTap || o.tip !== false) {
      this.setSize(size, size);
      this.setInteractive(new Phaser.Geom.Rectangle(size / 2, size / 2, size, size), Phaser.Geom.Rectangle.Contains);
      const tip = o.tip === false ? undefined : o.tip ?? this.defaultTip();
      tappable(this, o.area ?? null, () => (o.onTap ? o.onTap() : tip && showTooltip(scene, tip, this)), tip);
    }
    uiId(this, `item:${'item' in subject ? subject.item.def : 'consumable' in subject ? subject.consumable : subject.resource}`);
    this.once('destroy', () => {
      this.sparkTimer?.remove();
      if (this.glowImg) scene.tweens.killTweensOf(this.glowImg);
    });
    scene.add.existing(this);
  }

  private defaultTip(): string {
    const s = this.subject;
    const name = subjectName(s);
    if (!('item' in s)) return name;
    return `${name}\n${t(`rarity.${this.rarity}`)} ${t(`slot.${itemDef(s.item.def).slot}`)}`;
  }

  setSelected(on: boolean): this {
    this.sel?.destroy();
    this.sel = undefined;
    if (on) {
      this.sel = this.scene.add.graphics();
      this.sel.lineStyle(2, 0xf6ecd8, 1);
      this.sel.strokeRect(-1, -1, this.w + 2, this.h + 2);
      this.add(this.sel);
    }
    return this;
  }
}

// ================================================================== expandable card

export interface CardOpts {
  title: string;
  subtitle?: string;
  /** A kit icon name, or an item to show as an ItemIcon. */
  icon?: string | IconSubject;
  /** Text shown when expanded (wrapped), or a renderer returning the body height. */
  body?: string;
  renderBody?: (c: Phaser.GameObjects.Container, w: number) => number;
  /** Right-aligned short value in the header (price, level...). */
  right?: string;
  expanded?: boolean;
  /** Called after a toggle (re-stack the cards, e.g. with stackCards). */
  onToggle?: (card: Card) => void;
  area?: ScrollArea | null;
  id?: string;
}

/** A compact card (one 28 px header row) that expands on tap to show details. */
export class Card extends Phaser.GameObjects.Container {
  readonly w: number;
  h = 28;
  expanded: boolean;
  private o: CardOpts;

  static readonly HEAD = 28;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, o: CardOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    this.o = o;
    this.expanded = !!o.expanded;
    scene.add.existing(this);
    this.build();
  }

  setExpanded(on: boolean): void {
    if (on === this.expanded) return;
    this.expanded = on;
    this.build();
    this.o.onToggle?.(this);
  }

  private build(): void {
    this.removeAll(true);
    const scene = this.scene;
    const o = this.o;
    const H = Card.HEAD;
    let bodyH = 0;
    const body = scene.add.container(6, H);
    if (this.expanded) {
      if (o.renderBody) bodyH = o.renderBody(body, this.w - 12);
      else if (o.body) {
        const wr = wrapText(o.body, this.w - 12);
        body.add(addText(scene, 0, 0, wr.lines.join('\n'), 'ink'));
        bodyH = wr.lines.length * LINE_H;
      }
      bodyH += 6;
    }
    this.h = H + bodyH;
    this.add(addPanel(scene, 0, 0, this.w, this.h, this.expanded ? 'parch' : 'inset'));
    let tx = 6;
    if (o.icon) {
      if (typeof o.icon === 'string') this.add(addIcon(scene, 6, 8, o.icon));
      else this.add(new ItemIcon(scene, 3, 3, o.icon, { size: 22, tip: false }));
      tx = typeof o.icon === 'string' ? 22 : 29;
    }
    const chevW = 10;
    let rightW = 0;
    if (o.right) {
      const r = addText(scene, this.w - chevW - 4, o.subtitle ? 5 : 10, o.right, 'ink', 1);
      rightW = r.width + 4;
      this.add(r);
    }
    const tw = this.w - tx - chevW - 6 - rightW;
    this.add(addText(scene, tx, o.subtitle ? 5 : 10, ellipsize(o.title, tw), 'red'));
    if (o.subtitle) this.add(addText(scene, tx, 16, ellipsize(o.subtitle, tw), 'dim'));
    this.add(addText(scene, this.w - 9, 10, this.expanded ? '-' : '+', 'ink', 0));
    if (this.expanded) this.add(body);
    else body.destroy();
    const z = scene.add.zone(0, 0, this.w, H).setOrigin(0, 0).setInteractive();
    this.add(z);
    uiId(z, o.id ?? `card:${o.title}`);
    tappable(z, o.area ?? null, () => this.setExpanded(!this.expanded));
  }
}

/** Lay cards out top to bottom; returns the total height (for ScrollArea.setContentHeight). */
export function stackCards(cards: readonly Card[], y0 = 0, gap: number = SIZE.gap): number {
  let y = y0;
  for (const c of cards) {
    c.y = Math.round(y);
    y += c.h + gap;
  }
  return Math.max(0, y - y0 - gap);
}

// ================================================================== fitted label

export interface LabelOpts {
  font?: FontKey;
  align?: 0 | 0.5 | 1;
  /** Line width in UI px. */
  maxW: number;
  /** Lines before "…" (default 1). */
  maxLines?: number;
  /** When shortened, a tap shows the full text (default true). */
  expandable?: boolean;
  area?: ScrollArea | null;
}

/**
 * Text that never overflows: wrapped to `maxW`, at most `maxLines` lines,
 * ending in "…" when cut; tap (and long-press) then shows the whole text.
 */
export class Label extends Phaser.GameObjects.Container {
  readonly text: Phaser.GameObjects.BitmapText;
  readonly truncated: boolean;
  readonly w: number;
  readonly h: number;

  constructor(scene: Phaser.Scene, x: number, y: number, str: string, o: LabelOpts) {
    super(scene, Math.round(x), Math.round(y));
    const font = o.font ?? 'ink';
    const wr = wrapText(str, o.maxW, o.maxLines ?? 1, SHADOW_FONTS.has(font));
    this.truncated = wr.truncated;
    const align = o.align ?? 0;
    this.text = addText(scene, 0, 0, wr.lines.join('\n'), font, align);
    if (align === 0.5) this.text.setCenterAlign();
    else if (align === 1) this.text.setRightAlign();
    this.w = o.maxW;
    this.h = wr.lines.length * LINE_H;
    this.add(this.text);
    if (wr.truncated && o.expandable !== false) {
      // a tap target at least 22 px tall around the text
      const th = Math.max(this.h, SIZE.btnH);
      const zx = align === 0 ? 0 : align === 0.5 ? -o.maxW / 2 : -o.maxW;
      const z = scene.add.zone(zx, (this.h - th) / 2, o.maxW, th).setOrigin(0, 0).setInteractive();
      this.add(z);
      uiId(z, 'label-expand');
      tappable(z, o.area ?? null, () => showTooltip(scene, str, this.text), str);
    }
    scene.add.existing(this);
  }
}

/** Shorthand: a one-line label that ends in "…" (full text on tap). */
export function addLabel(scene: Phaser.Scene, x: number, y: number, str: string, o: LabelOpts): Label {
  return new Label(scene, x, y, str, o);
}

// ================================================================== modal

export interface ModalOpts {
  title?: string;
  /** Width (default: min(VW - 16, 200)). */
  w?: number;
  /** Height; clamped to the screen (put long content in a ScrollList inside `body`). */
  h: number;
  onClose?: () => void;
  /** Tapping the shade closes (default false: only Back / buttons close). */
  shadeCloses?: boolean;
}

export interface Modal {
  c: Phaser.GameObjects.Container;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Content area below the title. */
  body: { x: number; y: number; w: number; h: number };
  close: () => void;
}

/**
 * A parchment modal on a shade that blocks the screen below, registered as a
 * navigation layer (Telegram Back closes it) and as a layout-check layer.
 */
export function openModal(scene: UiScene, o: ModalOpts): Modal {
  const { VW, VH } = scene.m;
  const c = scene.add.container(0, 0);
  scene.ui.add(c);
  const shade = scene.add.rectangle(0, 0, VW, VH, 0x000000, 0.55).setOrigin(0, 0).setInteractive();
  uiBlocker(shade);
  c.add(shade);
  const w = Math.min(o.w ?? 200, VW - 16);
  const h = Math.min(o.h, VH - 16);
  const x = Math.round((VW - w) / 2);
  const y = Math.round((VH - h) / 2);
  addScroll(scene, c, x, y, w, h);
  let top = y + 8;
  if (o.title) {
    c.add(addText(scene, VW / 2, y + 12, ellipsize(o.title, w - 16), 'red', 0.5));
    top = y + 26;
  }
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    c.destroy();
    o.onClose?.();
  };
  if (o.shadeCloses) shade.on('pointerup', close);
  navLayer(c, close, scene);
  return { c, x, y, w, h, body: { x: x + 8, y: top, w: w - 16, h: y + h - 8 - top }, close };
}

// ================================================================== confirm dialog

export interface ConfirmDialogOpts {
  title?: string;
  /** Body text (wrapped, at most 6 lines). */
  body?: string;
  /** Legacy: separate body lines. */
  lines?: string[];
  ok?: string;
  okIcon?: string;
  cancel?: string;
  /** The action destroys something: dark-red OK button. */
  destructive?: boolean;
  onOk: () => void;
  onCancel?: () => void;
}

/**
 * Yes / no modal (Back = cancel). Cancel is secondary on the left; OK is the
 * primary (or destructive) action on the right, under the thumb.
 */
export function confirmDialog(scene: UiScene, o: ConfirmDialogOpts): Phaser.GameObjects.Container {
  const { VW } = scene.m;
  const w = Math.min(VW - 24, 200);
  const text = o.body ?? (o.lines ?? []).join(' ');
  const wr = text ? wrapText(text, w - 20, 6) : { lines: [] as string[] };
  const h = 26 + wr.lines.length * LINE_H + (wr.lines.length ? 8 : 0) + SIZE.btnH + 12;
  let done = false;
  const m = openModal(scene, { title: o.title ?? t('kit.confirm.title'), w, h, onClose: () => !done && o.onCancel?.() });
  const { c, x, y } = m;
  if (wr.lines.length) {
    const body = addText(scene, VW / 2, y + 26, wr.lines.join('\n'), 'ink', 0.5);
    body.setCenterAlign();
    c.add(body);
  }
  const bw = Math.floor((w - 12 - 6 - SIZE.gap) / 2);
  const by = y + h - SIZE.btnH - 9;
  c.add(new Button(scene, x + 6, by, bw, SIZE.btnH, { label: o.cancel ?? t('common.stay'), variant: 'secondary', onClick: () => m.close() }));
  const variant: ButtonVariant = o.destructive ? 'destructive' : 'primary';
  c.add(
    new Button(scene, x + w - 6 - bw, by, bw, SIZE.btnH, {
      label: o.ok ?? t('common.ok'),
      icon: o.okIcon,
      variant,
      style: o.destructive ? undefined : 'buttonSel',
      onClick: () => {
        done = true;
        m.close();
        o.onOk();
      },
    }),
  );
  return c;
}

// ================================================================== empty state

export interface EmptyStateOpts {
  icon?: string;
  title?: string;
  /** What to do next (wrapped, at most 4 lines). */
  hint: string;
  action?: { label: string; onClick: () => void; icon?: string };
}

/** Centered explanation for an empty list: icon, title, what to do next, an optional action. */
export function addEmptyState(scene: Phaser.Scene, x: number, y: number, w: number, h: number, o: EmptyStateOpts): Phaser.GameObjects.Container {
  const c = scene.add.container(Math.round(x), Math.round(y));
  const titleH = 12;
  const actionH = o.action ? SIZE.btnH + 8 : 0;
  // Fit the height: drop the icon first, then hint lines (never the action).
  let showIcon = !!o.icon;
  let lines = 4;
  let wr = wrapText(o.hint, w - 12, lines);
  const total = () => (showIcon ? 28 : 0) + titleH + wr.lines.length * LINE_H + actionH;
  if (total() > h) showIcon = false;
  while (total() > h && lines > 1) wr = wrapText(o.hint, w - 12, --lines);
  let cy = Math.max(0, Math.round((h - total()) / 2));
  if (showIcon && o.icon) {
    const ic = addIcon(scene, w / 2 - 12, cy, o.icon, 'D').setScale(2);
    c.add(ic);
    cy += 28;
  }
  c.add(addText(scene, w / 2, cy, ellipsize((o.title ?? t('kit.empty.title')), w - 8), 'red', 0.5));
  cy += titleH;
  const hint = addText(scene, w / 2, cy, wr.lines.join('\n'), 'dim', 0.5);
  hint.setCenterAlign();
  c.add(hint);
  cy += wr.lines.length * LINE_H + 8;
  if (o.action) {
    const bw = Math.min(w - 12, Math.max(90, measureText(o.action.label) + 30));
    c.add(new Button(scene, (w - bw) / 2, cy, bw, SIZE.btnH, { label: o.action.label, icon: o.action.icon, variant: 'primary', onClick: o.action.onClick }));
  }
  scene.add.existing(c);
  return c;
}

// ================================================================== install

let installed = false;

/** Route the kit's long-press and disabled-tap feedback here. Idempotent. */
export function installWidgets(): void {
  if (installed) return;
  installed = true;
  longPress.show = (scene, text, anchor) => showTooltip(scene, text, anchor);
  longPress.toast = (scene, text) => toast(scene, text, 'bad');
}

/** Panel texture helper re-exported for screens building custom tiles. */
export { panelTexture };
