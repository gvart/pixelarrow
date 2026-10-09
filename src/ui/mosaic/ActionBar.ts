/**
 * MActionBar: the bottom command strip of a map screen in the v4 style: a dark
 * stone bar with a gold rim holding a row of MButtons (one terracotta primary,
 * bronze secondaries, grey disabled with a reason) and, optionally, an info
 * line above them. MIconButton is the square icon-only button (the camp's
 * muster / loot and its build rail).
 */
import Phaser from 'phaser';
import { addIcon, scaleIcon, ICON_PX } from '../kit';
import { uiId } from '../layout';
import { MOSAIC } from '../tokens';
import { MBadge, GAP, TAP, centeredFace, makePressable, mosaicImage, mosaicTexture, mtext, mw, put } from './base';
import { MButton, type MButtonVariant } from './controls';

// ================================================================== MIconButton

export interface MIconButtonOpts {
  icon: string;
  /** Accessible name: the long-press text and what scripts find it by. */
  label: string;
  /** Lit (bronze with a gold rim): the toggle that is on, the structure being placed. */
  selected?: boolean;
  /** Primary look (terracotta). */
  primary?: boolean;
  /** Not available, and why (a tap says it). */
  off?: string;
  onClick?: () => void;
  tip?: string;
  badge?: number | string;
  /** A small count in the lower right corner (built structures). */
  count?: string;
  id?: string;
}

/** A square stone button with an icon only (>= 22 UI px). */
export class MIconButton extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;
  readonly opts: { label: string; icon: string };

  constructor(scene: Phaser.Scene, x: number, y: number, size: number, o: MIconButtonOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.w = this.h = Math.max(TAP, Math.round(size));
    this.opts = { label: o.label, icon: o.icon };
    const off = !!o.off;
    const style = off ? 'btnStone' : o.primary ? 'btnPrimary' : o.selected ? 'btnBronze' : 'btnNeutral';
    const down = off ? 'btnStone' : o.primary ? 'btnPrimaryDown' : o.selected ? 'btnBronzeDown' : 'btnNeutralDown';
    const face = centeredFace(scene, this.w, this.h);
    this.add(face);
    const bg = put(face, this.w, this.h, mosaicImage(scene, 0, 0, this.w, this.h, style));
    const ic = scaleIcon(addIcon(scene, 0, 0, o.icon, off ? 'D' : 'L'), Math.min(1.6, (this.h - 8) / ICON_PX));
    ic.setPosition(Math.round((this.w - ic.displayWidth) / 2), Math.round((this.h - ic.displayHeight) / 2) - 0.5);
    put(face, this.w, this.h, ic);
    if (o.selected && !off) {
      const g = scene.add.graphics();
      g.lineStyle(1, MOSAIC.goldHi, 1);
      g.strokeRect(1.5, 1.5, this.w - 3, this.h - 3);
      put(face, this.w, this.h, g);
    }
    if (o.count) put(face, this.w, this.h, mtext(scene, this.w - 3, this.h - 9, o.count, 'rCream', { size: 5.5, align: 1, box: { owner: this, w: this.w, h: this.h } }));
    if (o.badge !== undefined && o.badge !== 0 && !off) this.add(new MBadge(scene, this.w - 3, 3, o.badge));
    makePressable(this, {
      face,
      w: this.w,
      h: this.h,
      onTap: () => o.onClick?.(),
      down: () => bg.setTexture(mosaicTexture(scene, this.w, this.h, down)),
      up: () => bg.setTexture(mosaicTexture(scene, this.w, this.h, style)),
      tip: o.tip ?? o.label,
      disabled: () => o.off,
    });
    uiId(this, o.id ?? `icon:${o.icon}`);
    scene.add.existing(this);
  }
}

// ================================================================== MActionBar

export interface BarSlot {
  label: string;
  icon?: string;
  onClick?: () => void;
  /** Cannot right now, and why (grey stone; a tap says why). */
  off?: string;
  tip?: string;
  badge?: number | string;
  id?: string;
  /** The one terracotta primary of the state. */
  primary?: boolean;
  /** A toggle that is on (stone instead of bronze). */
  selected?: boolean;
  /** A square icon-only button (the label is its tip). */
  iconOnly?: boolean;
}

export interface MActionBarOpts {
  /** Room for one line of info text above the buttons. */
  info?: boolean;
  id?: string;
}

const BTN_H = 26;
const BAR_PAD = 4;
const ROW_H = 34;

/** The bar's height in UI px: the buttons, and the info line when asked. */
export const actionBarH = (info: boolean): number => (info ? 46 : ROW_H);

export class MActionBar extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;
  readonly buttons: (MButton | MIconButton)[] = [];
  private slots: Phaser.GameObjects.Container;
  private infoText: Phaser.GameObjects.BitmapText | null = null;
  private readonly withInfo: boolean;

  /** @param bottom Y of the bar's lower edge (the screen's bottom, UI px). */
  constructor(scene: Phaser.Scene, w: number, bottom: number, o: MActionBarOpts = {}) {
    const h = actionBarH(!!o.info);
    super(scene, 0, bottom - h);
    this.w = Math.round(w);
    this.h = h;
    this.withInfo = !!o.info;
    this.add(mosaicImage(scene, 0, 0, this.w, h, 'tabBar'));
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

  /** Swap the actions: icon-only slots are square, the rest share the width. An empty list hides the bar. */
  set(slots: BarSlot[]): this {
    this.slots.removeAll(true);
    this.buttons.length = 0;
    this.setVisible(slots.length > 0);
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
        const b = new MIconButton(this.scene, x, by + Math.round((BTN_H - side) / 2), side, { icon: s.icon ?? 'fallback', label: s.label, off: s.off, onClick: s.onClick, tip: s.tip, badge: s.badge, id: s.id, selected: s.selected });
        this.slots.add(b);
        this.buttons.push(b);
        x += side + GAP;
        continue;
      }
      const variant: MButtonVariant = s.off ? 'disabled' : s.primary ? 'primary' : s.selected ? 'neutral' : 'secondary';
      const fw = equalFits ? equal : squeeze < 1 ? Math.floor(natural(s) * squeeze) : natural(s) + share;
      const b = new MButton(this.scene, x, by, fw, BTN_H, { label: s.label, icon: s.icon, variant, onClick: s.onClick, disabledReason: s.off, tip: s.tip, badge: s.badge, id: s.id });
      this.slots.add(b);
      this.buttons.push(b);
      x += fw + GAP;
    }
    return this;
  }
}
