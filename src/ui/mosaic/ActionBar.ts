/**
 * MActionBar: the bottom command strip of a screen in the v4 style, one
 * component for every screen that has actions at its foot.
 *  - surface 'stone' (map screens: World, Camp): a dark stone bar with a gold
 *    rim, one row of buttons (a square icon-only button when the labels do not
 *    all fit), optionally an info line above them.
 *  - surface 'parchment' (party sub-screens: Army, Hero, Settlement): a
 *    parchment bar inside the frame; buttons side by side in proportion to
 *    their labels, wrapping onto rows (the primary alone on its own row) when
 *    they do not fit.
 * Slots are MButtonOpts plus the shorthands primary / selected / off / iconOnly.
 */
import Phaser from 'phaser';
import { uiId } from '../layout';
import { GAP, TAP, mosaicImage, mtext, mw } from './base';
import { MButton, type MButtonOpts, type MButtonVariant } from './controls';
import { MIconButton } from './iconButton';
import { actionRows } from './BottomPanel';

export interface BarSlot extends MButtonOpts {
  /** Cannot right now, and why (grey stone; a tap says why). */
  off?: string;
  /** The one terracotta primary of the state. */
  primary?: boolean;
  /** A toggle that is on (stone instead of bronze). */
  selected?: boolean;
  /** A square icon-only button (the label is its tip); stone surface only. */
  iconOnly?: boolean;
}

export interface MActionBarOpts {
  /** 'stone': the map screens' strip (default); 'parchment': the party screens' bar inside the frame. */
  surface?: 'stone' | 'parchment';
  /** Left edge in UI px (parchment bars sit inside the frame; the strip spans the screen). */
  x?: number;
  /** Room for one line of info text above the buttons (stone only). */
  info?: boolean;
  id?: string;
}

const BTN_H = 26;
const BAR_PAD = 4;
const ROW_H = 34;
const SHEET_BTN_H = 24;

/** The stone strip's height in UI px: the buttons, and the info line when asked. */
export const actionBarH = (info: boolean): number => (info ? 46 : ROW_H);

/** The variant a slot is drawn in. */
function variantOf(s: BarSlot): MButtonVariant {
  return s.variant ?? (s.off ? 'disabled' : s.primary ? 'primary' : s.selected ? 'neutral' : 'secondary');
}

export class MActionBar extends Phaser.GameObjects.Container {
  readonly w: number;
  h: number;
  readonly buttons: (MButton | MIconButton)[] = [];
  private slots: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Image;
  private infoText: Phaser.GameObjects.BitmapText | null = null;
  private readonly withInfo: boolean;
  private readonly parch: boolean;
  private readonly bottom: number;

  /** @param bottom Y of the bar's lower edge (the screen's bottom, or the frame's lower edge, UI px). */
  constructor(scene: Phaser.Scene, w: number, bottom: number, o: MActionBarOpts = {}) {
    const parch = o.surface === 'parchment';
    const h = parch ? SHEET_BTN_H + BAR_PAD * 2 : actionBarH(!!o.info);
    super(scene, o.x ?? 0, bottom - h);
    this.w = Math.round(w);
    this.h = h;
    this.bottom = bottom;
    this.parch = parch;
    this.withInfo = !!o.info && !parch;
    this.bg = mosaicImage(scene, 0, 0, this.w, h, parch ? 'sheet' : 'tabBar');
    this.add(this.bg);
    this.slots = scene.add.container(0, 0);
    this.add(this.slots);
    uiId(this, o.id ?? 'strip');
    scene.add.existing(this);
  }

  /** Top edge in screen UI px (content must end above it). */
  get top(): number {
    return this.visible ? this.y : this.y + this.h;
  }

  /** One line on the stone above the buttons (needs `info`). */
  setInfo(text: string): this {
    if (!this.withInfo) return this;
    this.infoText?.destroy();
    this.infoText = mtext(this.scene, BAR_PAD + 2, 5, text, 'ink', { maxW: this.w - BAR_PAD * 2 - 4, box: { owner: this, w: this.w, h: this.h } });
    this.add(this.infoText);
    return this;
  }

  /** Swap the actions. An empty list hides the bar. */
  set(slots: BarSlot[]): this {
    this.slots.removeAll(true);
    this.buttons.length = 0;
    this.setVisible(slots.length > 0);
    if (this.parch) this.layoutSheet(slots);
    else this.layoutStrip(slots);
    return this;
  }

  private add1(b: MButton | MIconButton): void {
    this.slots.add(b);
    this.buttons.push(b);
  }

  /** Parchment: rows of buttons in proportion to their labels (the primary alone on its own row when they do not fit). */
  private layoutSheet(slots: BarSlot[]): void {
    const scene = this.scene;
    const inner = this.w - BAR_PAD * 2;
    const rows = actionRows(slots.map((s) => ({ ...s, variant: variantOf(s) })), inner) as BarSlot[][];
    const h = BAR_PAD * 2 + Math.max(1, rows.length) * SHEET_BTN_H + Math.max(0, rows.length - 1) * GAP;
    this.h = h;
    this.y = this.bottom - h;
    this.bg.destroy();
    this.bg = mosaicImage(scene, 0, 0, this.w, h, 'sheet');
    this.addAt(this.bg, 0);
    rows.forEach((row, ri) => {
      const nat = row.map((a) => mw(a.label.toUpperCase(), variantOf(a) === 'disabled' ? 'rOff' : 'rCream', 7) + 16);
      const free = inner - GAP * (row.length - 1);
      const sum = nat.reduce((a, b) => a + b, 0);
      let x = BAR_PAD;
      row.forEach((a, i) => {
        const bw = i === row.length - 1 ? BAR_PAD + inner - x : Math.round((nat[i] / sum) * free);
        this.add1(new MButton(scene, x, BAR_PAD + ri * (SHEET_BTN_H + GAP), bw, SHEET_BTN_H, { ...a, variant: variantOf(a), disabledReason: a.off ?? a.disabledReason }));
        x += bw + GAP;
      });
    });
  }

  /** Stone strip: icon-only slots are square, the rest share the width. */
  private layoutStrip(slots: BarSlot[]): void {
    // a label needs its natural width (the button shrinks the text down to size 5.5); when they do not all fit,
    // the secondary actions with an icon give up their label (a square button, the label is its tip), and squares get small
    const natural = (sl: BarSlot) => mw(sl.label.toUpperCase(), sl.off ? 'rOff' : 'rCream', 7) + 14;
    const least = (sl: BarSlot) => Math.ceil(mw(sl.label.toUpperCase(), sl.off ? 'rOff' : 'rCream', 5.5)) + 14;
    slots = slots.map((sl) => ({ ...sl }));
    let side: number = BTN_H;
    const roomOf = () => this.w - BAR_PAD * 2 - slots.filter((sl) => sl.iconOnly).length * side - GAP * (slots.length - 1);
    const sum = (f: (sl: BarSlot) => number) => slots.filter((sl) => !sl.iconOnly).reduce((acc, sl) => acc + f(sl), 0);
    for (let i = slots.length - 1; i >= 0 && sum(natural) > roomOf(); i--) {
      if (!slots[i].iconOnly && !slots[i].primary && slots[i].icon) slots[i].iconOnly = true;
    }
    if (sum(least) > roomOf()) side = TAP;
    const room = roomOf();
    const flex = slots.filter((sl) => !sl.iconOnly);
    const share = flex.length ? Math.max(0, Math.floor((room - sum(natural)) / flex.length)) : 0;
    // equal widths while every label fits in its share, else natural widths plus an equal share of what is left (or what there is)
    const equal = flex.length ? Math.floor(room / flex.length) : 0;
    const equalFits = flex.every((sl) => natural(sl) <= equal);
    const squeeze = sum(natural) > room ? room / sum(natural) : 1;
    const by = this.h - BTN_H - Math.round((ROW_H - BTN_H) / 2);
    let x = BAR_PAD;
    for (const s of slots) {
      if (s.iconOnly) {
        this.add1(
          new MIconButton(this.scene, x, by + Math.round((BTN_H - side) / 2), side, side, {
            icon: s.icon ?? 'fallback',
            label: s.label,
            off: s.off,
            onClick: s.onClick,
            tip: s.tip,
            badge: s.badge,
            id: s.id,
            variant: s.off ? 'disabled' : s.selected ? 'lit' : 'neutral',
          }),
        );
        x += side + GAP;
        continue;
      }
      const fw = equalFits ? equal : squeeze < 1 ? Math.floor(natural(s) * squeeze) : natural(s) + share;
      this.add1(new MButton(this.scene, x, by, fw, BTN_H, { label: s.label, icon: s.icon, variant: variantOf(s), onClick: s.onClick, disabledReason: s.off, tip: s.tip, badge: s.badge, id: s.id }));
      x += fw + GAP;
    }
  }
}
