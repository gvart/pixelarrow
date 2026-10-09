/**
 * Strategos chrome (docs/UI_KIT.md "Screen chrome"): the pieces every screen shares.
 *
 * - `SituationBar`: one plain sentence ("what is happening / what to do
 *   next") over a row of labelled numbers ("344 gold", "9 men"), at the top.
 * - `CommandStrip`: the fixed bottom strip: Back-or-Map | one wide context
 *   action | Army-or-More (a fourth slot for screens that need it). Back is
 *   always bottom-left; the one red primary is the middle slot.
 * - `addTip`: a persistent onboarding tip (dark panel with a chevron) that
 *   stays until tapped, remembered per id, with `showTipAgain` for debugging.
 * - `addChecklist`: "First steps · 2 of 4" card.
 * - `addFocusRing`: the bronze glow round the next thing to tap.
 * - `addChip`: a small parchment chip (icon, word, optional count) that
 *   behaves like a Button (used for shapes, abilities, counts under icons).
 *
 * Sizes are UI pixels (src/ui/theme.ts STRAT); every target is at least
 * 22 UI px (44 pt at the smallest scale). Everything registers with the
 * layout check through the kit's Button / addText.
 */
import Phaser from 'phaser';
import { Button, addIcon, addPanel, addText, longPress, panelImage, panelTexture as panelTextureOf, tappable, type ButtonOpts, type FontKey } from './kit';
import { Badge, hintStore } from './widgets';
import { uiFrame, uiId } from './layout';
import { ellipsize, measureText, wrapText, LINE_H } from './textfit';
import { BRONZE, SIZE, STRAT } from './theme';
import { addGoodsIcon } from './econ/textures';
import { ICONS } from '../art/icons';
import { t } from '../i18n';
import { hasNativeBack } from '../platform/telegram';

// ================================================================== labelled numbers

/** A number with its word: icon (a kit icon or a goods / resource id), value, word. */
export interface SitNumber {
  icon: string;
  value: string;
  /** The word after the number ("gold", "men, 1 hurt"); may be empty. */
  word?: string;
  /** Explanation (the screen may show it in its own tooltip; the row itself is not a tap target). */
  tip?: string;
  font?: FontKey;
}

/** Icon texture for a situation number: a kit icon, else a resource goods icon. */
function numberIcon(scene: Phaser.Scene, x: number, y: number, icon: string): Phaser.GameObjects.Image {
  if (ICONS[icon] || scene.textures.exists(`icon_${icon}`)) return addIcon(scene, x, y, icon);
  // goods icons are 16 px: centred on the 12 px icon box
  return addGoodsIcon(scene, Math.round(x) - 2, Math.round(y) - 2, 'resource', icon);
}

/**
 * Lay a row of labelled numbers from `x` to `x + w` at `y`. Numbers that do not
 * fit lose their word first, then are dropped (never cut mid-word). Returns the
 * objects added.
 */
export function addNumbers(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, w: number, nums: SitNumber[], frame?: { ref: Phaser.GameObjects.Container; w: number; h: number }): void {
  // every number keeps its word while the row fits; else words go from the right, one at a time
  const keep = nums.map(() => true);
  const widths = () => nums.map((n, i) => 15 + measureText(n.value) + (keep[i] && n.word ? 3 + measureText(n.word) : 0));
  let ws = widths();
  const total = () => ws.reduce((a, b) => a + b, 0) + 8 * (nums.length - 1);
  for (let i = nums.length - 1; i >= 0 && total() > w; i--) {
    keep[i] = false;
    ws = widths();
  }
  let cx = x;
  nums.forEach((n, i) => {
    if (cx + ws[i] > x + w + 1) return;
    const icon = numberIcon(scene, cx, y - 2, n.icon);
    parent.add(icon);
    const val = addText(scene, cx + 15, y, n.value, n.font ?? 'ink');
    parent.add(val);
    if (frame) uiFrame(val, frame.ref, frame.w, frame.h);
    let word: Phaser.GameObjects.BitmapText | null = null;
    if (keep[i] && n.word) {
      word = addText(scene, cx + 15 + measureText(n.value) + 3, y, n.word, 'dim');
      parent.add(word);
      if (frame) uiFrame(word, frame.ref, frame.w, frame.h);
    }
    cx += ws[i] + 8;
  });
}

// ================================================================== situation bar

export interface SituationOpts {
  /** The sentence (wrapped to two lines; one on compact bars). */
  sentence: string;
  numbers?: SitNumber[];
  /** Red sentence: something needs doing now. */
  urgent?: boolean;
  /** One line of sentence (short screens). */
  compact?: boolean;
  /** Left inset (room for a back button drawn by the screen). */
  left?: number;
  /** Right inset (room for a button on the bar's right). */
  right?: number;
  id?: string;
}

/**
 * The situation bar at the top of a screen: parchment, a bronze rule under it,
 * the sentence and the labelled numbers. `height` is STRAT.sitH, or
 * STRAT.sitHCompact for `compact`.
 */
export class SituationBar extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;
  private sentenceTexts: Phaser.GameObjects.BitmapText[] = [];
  private numbersC: Phaser.GameObjects.Container;
  private o: SituationOpts;

  constructor(scene: Phaser.Scene, w: number, o: SituationOpts) {
    super(scene, 0, 0);
    this.w = Math.round(w);
    this.h = o.compact ? STRAT.sitHCompact : STRAT.sitH;
    this.o = o;
    this.add(addPanel(scene, 0, 0, this.w, this.h, 'parch'));
    this.add(scene.add.rectangle(0, this.h - 1, this.w, 1, BRONZE.dark).setOrigin(0, 0));
    this.numbersC = scene.add.container(0, 0);
    this.add(this.numbersC);
    uiId(this, o.id ?? 'situation');
    scene.add.existing(this);
    this.setSentence(o.sentence, o.urgent);
    this.setNumbers(o.numbers ?? []);
  }

  /** Y of the first row below the bar. */
  get bottom(): number {
    return this.h;
  }

  private get textLeft(): number {
    return 6 + (this.o.left ?? 0);
  }

  private get textW(): number {
    return this.w - this.textLeft - 6 - (this.o.right ?? 0);
  }

  setSentence(sentence: string, urgent = !!this.o.urgent): this {
    for (const s of this.sentenceTexts) s.destroy();
    this.sentenceTexts = [];
    const lines = this.o.compact ? 1 : 2;
    const wr = wrapText(sentence, this.textW, lines);
    wr.lines.forEach((l, i) => {
      const txt = addText(this.scene, this.textLeft, 4 + i * LINE_H, l, urgent ? 'red' : 'ink');
      uiFrame(txt, this, this.w, this.h);
      this.add(txt);
      this.sentenceTexts.push(txt);
    });
    return this;
  }

  setNumbers(nums: SitNumber[]): this {
    this.numbersC.removeAll(true);
    if (!nums.length) return this;
    const y = this.o.compact ? 17 : 27;
    addNumbers(this.scene, this.numbersC, this.textLeft, y, this.textW, nums, { ref: this, w: this.w, h: this.h });
    return this;
  }
}

// ================================================================== command strip

export interface StripSlot {
  label: string;
  icon?: string;
  onClick?: () => void;
  /** Cannot right now, and why (grey dither; a tap says why). */
  off?: string;
  /** Long-press explanation. */
  tip?: string;
  /** Count bubble in the corner (0 hides it). */
  badge?: number | string;
  /** Layout-check / script id. */
  id?: string;
  /** Selected look for a toggle (bronze-rimmed parchment), e.g. Pause while paused. */
  selected?: boolean;
  /** Middle slot only: not the red primary (a toggle or a secondary wide action). */
  secondary?: boolean;
  /** Destructive (dark wine): confirm first in `onClick`. */
  destructive?: boolean;
}

export interface CommandStripOpts {
  /** Bottom-left: Back, Map, Menu, Pause... (icon over label). */
  left?: StripSlot | null;
  /** The wide middle slot: the one primary action of the screen (red), or a secondary wide action. */
  main?: StripSlot | null;
  /** Bottom-right: Army, More, Flee... (icon over label). */
  right?: StripSlot | null;
  /** A second narrow slot left of `right` (screens with four destinations). */
  extra?: StripSlot | null;
  /** Reason line above the strip when `main` is off (default: main.off). */
  why?: string;
}

/**
 * The fixed three-slot command strip at the bottom of every screen. The
 * screen keeps a reference and calls `set()` to swap the actions (e.g. Play
 * for Pause); the strip never moves.
 */
export class CommandStrip extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h = STRAT.stripH;
  readonly buttons: { left?: Button; main?: Button; right?: Button; extra?: Button } = {};
  private slots: Phaser.GameObjects.Container;
  private whyText: Phaser.GameObjects.BitmapText | null = null;

  constructor(scene: Phaser.Scene, w: number, vh: number, o: CommandStripOpts) {
    super(scene, 0, vh - STRAT.stripH);
    this.w = Math.round(w);
    this.add(addPanel(scene, 0, 0, this.w, this.h, 'bar'));
    this.add(scene.add.rectangle(0, 0, this.w, 1, BRONZE.dark).setOrigin(0, 0));
    this.slots = scene.add.container(0, 0);
    this.add(this.slots);
    uiId(this, 'strip');
    scene.add.existing(this);
    this.set(o);
  }

  /** Top edge of the strip in screen UI px (content must end above it); the bottom of the screen while the strip is empty and hidden. */
  get top(): number {
    return this.visible ? this.y : this.y + this.h;
  }

  set(o: CommandStripOpts): this {
    // inside Telegram its header BackButton is the one Back (nav.ts runs the same handler): no second one here
    if (o.left?.icon === 'back' && hasNativeBack()) o = { ...o, left: null };
    this.slots.removeAll(true);
    this.whyText?.destroy();
    this.whyText = null;
    this.buttons.left = this.buttons.main = this.buttons.right = this.buttons.extra = undefined;
    const scene = this.scene;
    // four slots on a narrow screen: the side slots give way so the middle one stays a target
    const side = o.extra ? Math.min(STRAT.stripSide, Math.floor((this.w - 8 - 44 - 3 * (SIZE.gap + 1)) / 3)) : STRAT.stripSide;
    const bh = STRAT.stripBtnH;
    const by = Math.round((this.h - bh) / 2);
    const extra = o.extra ? side + SIZE.gap : 0;
    const mk = (x: number, w: number, s: StripSlot, stacked: boolean, kind: 'left' | 'main' | 'right' | 'extra') => {
      const opts: ButtonOpts = {
        label: s.label,
        icon: s.icon,
        onClick: s.onClick,
        tip: s.tip,
        disabledReason: s.off,
        id: s.id,
        variant: s.destructive ? 'destructive' : kind === 'main' && !s.secondary && !s.selected ? 'primary' : 'secondary',
        style: s.selected ? 'buttonSel' : undefined,
        // the wide middle action reads best with its icon beside the words
        inline: kind === 'main' ? true : undefined,
      };
      const b = stacked ? new StackButton(scene, x, by, w, bh, opts) : new Button(scene, x, by, w, bh, opts);
      if (s.off) b.setEnabled(false, s.off);
      this.slots.add(b);
      if (s.badge !== undefined && s.badge !== 0) this.slots.add(new Badge(scene, x + w - 4, by + 1, s.badge));
      this.buttons[kind] = b;
    };
    if (o.left) mk(4, side, o.left, true, 'left');
    const mainX = o.left ? 4 + side + SIZE.gap + 1 : 4;
    const mainEnd = o.right ? this.w - 4 - side - SIZE.gap - 1 - extra : this.w - 4;
    if (o.main) mk(mainX, mainEnd - mainX, o.main, false, 'main');
    if (o.extra) mk(this.w - 4 - side - SIZE.gap - side, side, o.extra, true, 'extra');
    if (o.right) mk(this.w - 4 - side, side, o.right, true, 'right');
    // nothing to offer: no empty bar at the bottom (the page gets the room)
    this.setVisible(!!(o.left || o.main || o.right || o.extra));
    const why = o.why ?? o.main?.off;
    if (why && o.main) {
      // the reason sits just above the strip, on the field / page
      this.whyText = addText(scene, this.w / 2, -10, ellipsize(why, this.w - 12, true), 'light', 0.5);
      this.add(this.whyText);
    }
    return this;
  }
}

/** A side-slot button: the icon over the word (both always shown; the word may end in "…"). */
class StackButton extends Button {
  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, opts: ButtonOpts) {
    // the kit Button stacks icon over label from 26 tall: the strip's buttons are 26
    super(scene, x, y, w, Math.max(26, h), opts);
  }
}

// ================================================================== chips

export interface ChipOpts {
  icon?: string;
  label: string;
  /** Bronze-rimmed: the current shape, an order in force. */
  selected?: boolean;
  /** Grey with a reason (a tap says why). */
  off?: string;
  /** Small text in the corner (a cooldown "39s", a count). */
  corner?: string;
  tip?: string;
  id?: string;
  onClick?: () => void;
  /** A chevron on the right: opens something. */
  chevron?: boolean;
}

/**
 * A chip: a 22-tall parchment button with an icon and a word, bronze-rimmed
 * when selected. Shapes, abilities and filters are chips; the one primary
 * action of a screen never is (that is the strip).
 */
export class Chip extends Button {
  private cornerText: Phaser.GameObjects.BitmapText;
  private blocked: string | null = null;
  private run?: () => void;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, o: ChipOpts) {
    super(scene, x, y, w, 22, { label: o.chevron ? `${o.label} >` : o.label, icon: o.icon, onClick: undefined, tip: o.tip, disabledReason: o.off, id: o.id ?? o.label });
    this.run = o.onClick;
    this.setOnClick(() => {
      if (this.blocked) {
        longPress.toast?.(scene, this.blocked);
        return;
      }
      this.run?.();
    });
    if (o.off) this.setEnabled(false, o.off);
    if (o.selected) {
      const g = scene.add.graphics();
      g.lineStyle(1, BRONZE.main, 1);
      g.strokeRect(1.5, 1.5, this.w - 3, this.h - 3);
      this.add(g);
    }
    this.cornerText = addText(scene, this.w - 3, 1, o.corner ?? '', 'gold', 1);
    uiFrame(this.cornerText, this, this.w, this.h);
    this.add(this.cornerText);
  }

  /** Small gold text in the top-right corner (a cooldown, a count); '' clears it. */
  setCorner(text: string): this {
    if (this.cornerText.text !== text) this.cornerText.setText(text);
    return this;
  }

  /** Keep the look but refuse taps with `reason` (null: usable again), e.g. an ability recovering. */
  setBlocked(reason: string | null): this {
    this.blocked = reason;
    this.setAlpha(reason ? 0.8 : 1);
    return this;
  }
}

// ================================================================== list row

export interface ListRowOpts {
  label: string;
  /** One line of context under the label ("online · 63 days left"). */
  sub?: string;
  icon?: string;
  onClick?: () => void;
  badge?: number | string;
  off?: string;
  tip?: string;
  id?: string;
  /** Bronze-rimmed row (the selected one). */
  selected?: boolean;
  /** Primary look (red): the row is the one thing to do. */
  primary?: boolean;
}

/**
 * A destination row: icon, label, a line of context, a chevron. 26 tall.
 * Presses like a Button and carries `opts` so scripts find it by label.
 */
export class ListRow extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;
  readonly opts: { label: string; icon?: string };
  private bg: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, o: ListRowOpts, h = 26) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    this.h = h;
    this.opts = { label: o.label, icon: o.icon };
    const style = o.off ? 'buttonOff' : o.primary ? 'buttonSel' : 'button';
    this.bg = panelImage(scene, 0, 0, this.w, this.h, style);
    this.add(this.bg);
    const light = !!o.primary && !o.off;
    const font: FontKey = o.off ? 'dim' : light ? 'light' : 'ink';
    let tx = 6;
    if (o.icon) {
      this.add(addIcon(scene, 6, Math.round((this.h - 12) / 2), o.icon, o.off ? 'D' : light ? 'L' : ''));
      tx = 22;
    }
    const chev = addText(scene, this.w - 6, Math.round((this.h - 8) / 2), '>', light ? 'light' : 'dim', 1);
    this.add(chev);
    uiFrame(chev, this, this.w, this.h);
    const badgeW = o.badge ? 16 : 0;
    const tw = this.w - tx - 14 - badgeW;
    if (o.sub) {
      const a = addText(scene, tx, 4, ellipsize(o.label, tw, light), font);
      const b = addText(scene, tx, 14, ellipsize(o.sub, tw), light ? 'light' : 'dim');
      uiFrame(a, this, this.w, this.h);
      uiFrame(b, this, this.w, this.h);
      this.add([a, b]);
    } else {
      const a = addText(scene, tx, Math.round((this.h - 8) / 2), ellipsize(o.label, tw, light), font);
      uiFrame(a, this, this.w, this.h);
      this.add(a);
    }
    if (o.badge) this.add(new Badge(scene, this.w - 18, this.h / 2, o.badge));
    if (o.selected) {
      const g = scene.add.graphics();
      g.lineStyle(1, BRONZE.main, 1);
      g.strokeRect(1.5, 1.5, this.w - 3, this.h - 3);
      this.add(g);
    }
    this.setSize(this.w, this.h);
    this.setInteractive(new Phaser.Geom.Rectangle(this.w / 2, this.h / 2, this.w, this.h), Phaser.Geom.Rectangle.Contains);
    uiId(this, o.id ?? `row:${o.label}`);
    this.on('pointerdown', () => !o.off && this.bg.setTexture(panelTextureOf(scene, this.w, this.h, o.primary ? 'buttonSelDown' : 'buttonDown')));
    const up = () => this.scene && this.bg.setTexture(panelTextureOf(scene, this.w, this.h, style));
    this.on('pointerup', up);
    this.on('pointerout', up);
    tappable(this, null, () => {
      if (o.off) {
        longPress.toast?.(scene, o.off);
        return;
      }
      o.onClick?.();
    }, o.tip ?? o.off);
    scene.add.existing(this);
  }
}

// ================================================================== focus ring

/** The bronze glow round the next thing to tap (onboarding): three nested rims that pulse. */
export function addFocusRing(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, w: number, h: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.lineStyle(1, BRONZE.hi, 1);
  g.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
  g.lineStyle(1, BRONZE.main, 1);
  g.strokeRect(x - 2.5, y - 2.5, w + 5, h + 5);
  g.lineStyle(1, BRONZE.dark, 1);
  g.strokeRect(x - 3.5, y - 3.5, w + 7, h + 7);
  parent.add(g);
  scene.tweens.add({ targets: g, alpha: { from: 1, to: 0.45 }, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  return g;
}

// ================================================================== tips

export interface TipOpts {
  /** Width (default 120, clamped to the screen). */
  w?: number;
  /** A chevron pointing at the thing: which edge, and where along it (UI px from the panel's left / top). */
  arrow?: 'up' | 'down' | 'left';
  ax?: number;
  ay?: number;
  /** Tapping the tip hides it for good (default true; remembered by id). */
  dismiss?: boolean;
  /** Screen width, to clamp the tip inside. */
  vw?: number;
}

/** Tips already dismissed this session (the persisted list is the kit's hintStore). */
export function tipSeen(id: string): boolean {
  const seen = hintStore.seen();
  return seen.includes(id) || seen.includes('*');
}

/**
 * A persistent onboarding tip: a dark panel with cream text and a chevron
 * toward what it explains. It stays on the screen (part of the layout, never a
 * toast) until the player taps it; the tap is remembered per `id`. Returns
 * null when already dismissed.
 */
export function addTip(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, id: string, x: number, y: number, text: string, o: TipOpts = {}): Phaser.GameObjects.Container | null {
  if (tipSeen(id)) return null;
  const vw = o.vw ?? Infinity;
  const w = Math.min(o.w ?? 120, vw - 12);
  const wr = wrapText(text, w - 10, 4, true);
  const h = wr.lines.length * LINE_H + 7;
  x = Math.max(4, Math.min(x, vw - 4 - w));
  const c = scene.add.container(Math.round(x), Math.round(y));
  parent.add(c);
  c.add(addPanel(scene, 0, 0, w, h, 'tooltip'));
  const txt = addText(scene, 5, 4, wr.lines.join('\n'), 'light');
  uiFrame(txt, c, w, h);
  c.add(txt);
  const g = scene.add.graphics();
  g.fillStyle(0x1d140f, 1);
  if (o.arrow === 'down') for (let i = 0; i < 4; i++) g.fillRect((o.ax ?? w / 2) - (3 - i), h + i, (3 - i) * 2 + 1, 1);
  if (o.arrow === 'up') for (let i = 0; i < 4; i++) g.fillRect((o.ax ?? w / 2) - i, -1 - i, i * 2 + 1, 1);
  if (o.arrow === 'left') for (let i = 0; i < 4; i++) g.fillRect(-1 - i, (o.ay ?? h / 2) - i, 1, i * 2 + 1);
  c.add(g);
  if (o.dismiss !== false) {
    const z = scene.add.zone(0, 0, w, Math.max(h, SIZE.btnH)).setOrigin(0, 0).setInteractive();
    uiId(z, `tip:${id}`);
    tappable(z, null, () => {
      hintStore.mark(id);
      scene.tweens.add({ targets: c, alpha: 0, duration: 160, onComplete: () => c.destroy() });
    });
    c.add(z);
  }
  return c;
}

// ================================================================== checklist

export interface ChecklistItem {
  text: string;
  done: boolean;
}

/** "First steps · 2 of 4": a dark card with a tick per done item and an eye per open one. Returns its height. */
export function addChecklist(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, w: number, title: string, items: ChecklistItem[]): number {
  const h = 14 + items.length * 10 + 2;
  const c = scene.add.container(Math.round(x), Math.round(y));
  parent.add(c);
  c.add(addPanel(scene, 0, 0, w, h, 'tooltip'));
  const tt = addText(scene, 5, 3, ellipsize(title, w - 10, true), 'light');
  uiFrame(tt, c, w, h);
  c.add(tt);
  items.forEach((it, i) => {
    const ic = addIcon(scene, 5, 12 + i * 10, it.done ? 'check' : 'eye', 'L');
    if (it.done) ic.setTint(0xa8e088);
    c.add(ic);
    const txt = addText(scene, 19, 14 + i * 10, ellipsize(it.text, w - 24, true), it.done ? 'dim' : 'light');
    uiFrame(txt, c, w, h);
    c.add(txt);
  });
  uiId(c, 'checklist');
  return h;
}

/** "x of y" in the current language. */
export function ofCount(done: number, total: number): string {
  return t('strat.ofCount', { a: done, b: total });
}
