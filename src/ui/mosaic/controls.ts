/**
 * Controls of the v4 UI: MButton (the one terracotta primary, bronze secondary,
 * dark bronze neutral, lit bronze for the toggle in force, flat grey disabled,
 * blue purchase), StoneTile, MChip and SegmentedSwitch. Positions are UI px;
 * every control is >= 22 UI px (44 pt) in its touch area, scales on press
 * unless motion is reduced and says why it is disabled on tap. Grey means
 * disabled only (art bible 4.2, ADR-0005): a disabled button is flat and shows
 * a lock, never just a colour.
 */
import Phaser from 'phaser';
import type { MosaicStyle } from '../../art/mosaicUi';
import { addIcon, fitCinzel, scaleIcon, ICON_PX } from '../kit';
import { uiId } from '../layout';
import { motion, tweenTo } from '../motion';
import { MOSAIC, MOTION, TEXT_MIN, lineHeight } from '../tokens';
import { buttonLabelSizes, chipText, switchLabelStyle } from './policy';
import { MBadge, TAP, centeredFace, fit, wrapWords, makePressable, midY, mosaicImage, mosaicTexture, mtext, mw, put } from './base';

type Scene = Phaser.Scene;
type FontKey = import('../kit').FontKey;

export { buttonLabelSizes, chipText, switchLabelStyle };

// ================================================================== MButton

/**
 * primary: the one terracotta action of a screen; primaryHero: its chevron form; secondary: bronze, any
 * other action; neutral: dark bronze, a quiet action (Close, Flee, Dismiss, Undo; never grey: audit G2);
 * lit: the toggle in force (lit bronze, ink label); disabled: flat grey with a lock; purchase: Telegram Stars.
 */
export type MButtonVariant = 'primary' | 'primaryHero' | 'secondary' | 'neutral' | 'lit' | 'disabled' | 'purchase';

export interface MButtonOpts {
  label: string;
  icon?: string;
  variant?: MButtonVariant;
  onClick?: () => void;
  /** Why it cannot be used: shown on tap (a disabled button always says why). */
  disabledReason?: string;
  badge?: number | string;
  tip?: string;
  id?: string;
}

const BTN_STYLE: Record<MButtonVariant, [MosaicStyle, MosaicStyle]> = {
  primary: ['btnPrimary', 'btnPrimaryDown'],
  primaryHero: ['btnHero', 'btnHeroDown'],
  secondary: ['btnBronze', 'btnBronzeDown'],
  neutral: ['btnNeutral', 'btnNeutralDown'],
  lit: ['btnBronzeOn', 'btnLitDown'],
  disabled: ['btnStone', 'btnStone'],
  purchase: ['btnBuy', 'btnBuyDown'],
};

/** A Cinzel button on carved stone or bronze. Heights: >= 22 (44 pt); the hero chevron is meant for 28+. */
export class MButton extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;
  /** The label and icon (scripts and the layout check find buttons by them). */
  readonly opts: { label: string; icon?: string };
  private variant: MButtonVariant;
  private enabled: boolean;
  private face: Phaser.GameObjects.Container;
  private bg!: Phaser.GameObjects.Image;
  private content!: Phaser.GameObjects.Container;
  private reason: string | undefined;
  private truncated = false;

  constructor(scene: Scene, x: number, y: number, w: number, h: number, private o: MButtonOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.max(TAP, Math.round(w));
    this.h = Math.max(TAP, Math.round(h));
    this.variant = o.variant ?? 'primary';
    this.enabled = this.variant !== 'disabled';
    this.reason = o.disabledReason;
    this.opts = { label: o.label, icon: o.icon };
    this.face = centeredFace(scene, this.w, this.h);
    this.add(this.face);
    this.build();
    makePressable(this, {
      face: this.face,
      w: this.w,
      h: this.h,
      onTap: () => o.onClick?.(),
      down: () => this.setSurface(true),
      up: () => this.setSurface(false),
      tip: o.tip ?? (this.truncated ? o.label : undefined),
      disabled: () => (this.enabled ? undefined : this.reason ?? o.disabledReason),
    });
    uiId(this, o.id ?? `mbtn:${o.label}`);
    scene.add.existing(this);
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Enable or disable; `reason` is what a tap on the disabled button says. */
  setEnabled(on: boolean, reason?: string): this {
    if (reason !== undefined) this.reason = reason;
    if (on === this.enabled) return this;
    this.enabled = on;
    this.variant = on ? this.o.variant && this.o.variant !== 'disabled' ? this.o.variant : 'primary' : 'disabled';
    this.build();
    return this;
  }

  setLabel(label: string): this {
    this.o.label = label;
    this.opts.label = label;
    this.build();
    return this;
  }

  setIcon(icon?: string): this {
    this.o.icon = icon;
    this.opts.icon = icon;
    this.build();
    return this;
  }

  private setSurface(down: boolean): void {
    if (!this.enabled) return;
    const [up, dn] = BTN_STYLE[this.variant];
    this.bg.setTexture(mosaicTexture(this.scene, this.w, this.h, down ? dn : up));
    this.content.y = down ? 1 : 0;
  }

  private build(): void {
    const scene = this.scene;
    this.face.removeAll(true);
    const v = this.variant;
    const hero = v === 'primaryHero';
    this.bg = put(this.face, this.w, this.h, mosaicImage(scene, 0, 0, this.w, this.h, BTN_STYLE[v][0]));
    this.content = scene.add.container(0, 0);
    this.face.add(this.content);
    const off = v === 'disabled';
    const font: FontKey = off ? 'rOff' : v === 'lit' ? 'rInk' : 'rCream';
    const padX = hero ? Math.round(this.h * 0.62) + 2 : 7;
    const room = this.w - padX * 2;
    const label = this.o.label.toUpperCase();
    // the largest size that fits (down to 6.5), then the word in Inter, then cut; an icon that would cost the label
    // its size goes. A disabled button shows a lock in the icon's place, so its state is not colour alone (G13).
    const sizes = buttonLabelSizes(this.h);
    const icon = off ? 'lock' : this.o.icon;
    const hasIcon = !!icon && sizes.some((s) => mw(label, font, s) <= room - ICON_PX - 3);
    const iconW = hasIcon ? ICON_PX + 3 : 0;
    const fl = fitCinzel(this.o.label, font, room - iconW, sizes);
    const { size, text } = fl;
    this.truncated = fl.truncated;
    const tw = mw(text, fl.font, size);
    const x0 = Math.round((this.w - (iconW + tw)) / 2);
    const t = mtext(scene, x0 + iconW, midY(this.h - 1, size) - 0, text, fl.font, { size, box: { owner: this, w: this.w, h: this.h } });
    put(this.content, this.w, this.h, t);
    if (hasIcon) {
      const ic = addIcon(scene, x0, Math.round((this.h - ICON_PX) / 2) - 1, icon!, off ? 'D' : v === 'purchase' || v === 'lit' ? '' : 'L');
      put(this.content, this.w, this.h, ic);
    }
    const b = this.o.badge;
    if (b !== undefined && b !== 0 && this.enabled) this.face.add(new MBadge(scene, this.w / 2 - 3, -this.h / 2 + 3, b));
  }
}

// ================================================================== StoneTile

export type StoneTileVariant = 'stone' | 'terracotta' | 'glaze' | 'bronze';

export interface StoneTileOpts {
  icon: string;
  label: string;
  variant?: StoneTileVariant;
  badge?: number | string;
  /** Not available, and why: flat grey with a faded icon and this caption under the tile. */
  disabled?: string;
  onClick?: () => void;
  tip?: string;
  id?: string;
}

const TILE_STYLE: Record<StoneTileVariant, MosaicStyle> = { stone: 'tileStone', terracotta: 'tileTerra', glaze: 'tileGlaze', bronze: 'tileBronze' };

/** A square of carved stone with an engraved icon and a Cinzel label; the caption of a disabled tile sits under it. */
export class StoneTile extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;
  /** Height including the caption of a disabled tile. */
  readonly totalH: number;
  readonly opts: { label: string; icon: string };

  constructor(scene: Scene, x: number, y: number, w: number, h: number, o: StoneTileOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    this.h = Math.max(TAP, Math.round(h));
    this.opts = { label: o.label, icon: o.icon };
    const off = !!o.disabled;
    const v = o.variant ?? 'stone';
    const face = centeredFace(scene, this.w, this.h);
    this.add(face);
    const P = <T extends Phaser.GameObjects.GameObject & { x: number; y: number }>(obj: T): T => put(face, this.w, this.h, obj);
    P(mosaicImage(scene, 0, 0, this.w, this.h, off ? 'tileOff' : TILE_STYLE[v]));
    const k = this.h >= 54 ? 2.2 : this.h >= 44 ? 1.8 : 1.4;
    const isz = ICON_PX * k;
    const font: FontKey = off ? 'rOff' : 'rCream';
    const fl = fitCinzel(o.label, font, this.w - 6, [7, TEXT_MIN]);
    const { size, text } = fl;
    const block = isz + 3 + 8;
    const top = Math.round((this.h - 1 - block) / 2);
    const ic = scaleIcon(addIcon(scene, 0, 0, o.icon, off ? 'D' : v === 'terracotta' || v === 'glaze' ? 'L' : ''), k);
    ic.setPosition(Math.round((this.w - ic.displayWidth) / 2), top);
    if (off) ic.setAlpha(0.7);
    P(ic);
    P(mtext(scene, this.w / 2, top + isz + 3, text, fl.font, { size, align: 0.5, box: { owner: this, w: this.w, h: this.h } }));
    if (o.badge !== undefined && o.badge !== 0) this.add(new MBadge(scene, this.w - 5, 5, o.badge));
    let cap = 0;
    if (off) {
      // the reason, at the smallest meaningful size (A11Y-09), wrapped, never cut (G14)
      const lh = Math.ceil(lineHeight(TEXT_MIN));
      const lines = wrapWords(o.disabled!, this.w, (x) => mw(x, 'pSec', TEXT_MIN));
      lines.forEach((l, i) => this.add(mtext(scene, this.w / 2, this.h + 2 + i * lh, l, 'pSec', { size: TEXT_MIN, align: 0.5 })));
      cap = 2 + lines.length * lh;
    }
    this.totalH = this.h + cap;
    makePressable(this, {
      face,
      w: this.w,
      h: this.h,
      onTap: () => o.onClick?.(),
      tip: o.tip ?? (fl.truncated ? o.label : undefined),
      disabled: () => o.disabled,
    });
    uiId(this, o.id ?? `tile:${o.label}`);
    scene.add.existing(this);
  }
}

// ================================================================== MChip

export interface MChipOpts {
  icon?: string;
  value: string | number;
  /** parchment (on a card) or stone (on the dark bar). */
  surface?: 'parchment' | 'stone';
  /** A fixed width; else as wide as its content. */
  w?: number;
  /** Side padding in total, UI px (default 10; a tight row of chips takes less). */
  pad?: number;
  /** A plate 22 tall with a bigger number (size 8): Glory, the duel level. */
  tall?: boolean;
  /** 0..1: a thin bar under the number (the duel level's XP). */
  progress?: number;
  /** Fill colour of that bar (a token). */
  progressColor?: number;
  onClick?: () => void;
  tip?: string;
  id?: string;
}

const CHIP_H = 18;

/** A small pill: an icon and a number (Inter, tabular). 22 tall when tappable or `tall`; the number can count to a new value (`setValue`). */
export class MChip extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;
  readonly opts: { label: string; icon?: string };
  private num: Phaser.GameObjects.BitmapText;
  private counter = { v: 0 };

  constructor(scene: Scene, x: number, y: number, o: MChipOpts) {
    super(scene, Math.round(x), Math.round(y));
    const tapable = !!o.onClick;
    this.h = tapable || o.tall ? TAP : CHIP_H;
    // a chip that acts is a touch target: >= 22 UI px (44 pt) both ways (A11Y-06)
    this.w = tapable ? Math.max(TAP, o.w ?? MChip.width(o)) : o.w ?? MChip.width(o);
    const stone = o.surface === 'stone';
    const val = String(o.value);
    this.opts = { label: val, icon: o.icon };
    const face = centeredFace(scene, this.w, this.h);
    this.add(face);
    put(face, this.w, this.h, mosaicImage(scene, 0, 0, this.w, this.h, stone ? 'chipStone' : 'chipParch'));
    const iconW = o.icon ? ICON_PX + 3 : 0;
    const font: FontKey = stone ? 'ink' : 'pInk';
    // the number keeps its size while it fits, then shrinks (to 6.5), then is written short (12K); a number is
    // never cut (G14): only a word that does not fit even then ends in "…"
    const room = this.w - (o.pad ?? 10) - iconW;
    const big = o.tall ? 8 : 7;
    const { text, size } = chipText(val, room, big, (str, z) => mw(str, font, z));
    const bar = o.progress !== undefined;
    const x0 = Math.round((this.w - (iconW + mw(text, font, size))) / 2);
    if (o.icon) put(face, this.w, this.h, addIcon(scene, x0, bar ? 2 : Math.round((this.h - ICON_PX) / 2) - 1, o.icon));
    this.num = put(face, this.w, this.h, mtext(scene, x0 + iconW, bar ? 3 : midY(this.h - 1, size), text, font, { size, box: { owner: this, w: this.w, h: this.h } }));
    if (bar) {
      const bw = this.w - 12;
      const g = scene.add.graphics();
      g.fillStyle(MOSAIC.stone0, 1);
      g.fillRoundedRect(6, this.h - 7, bw, 3, 1);
      g.fillStyle(o.progressColor ?? MOSAIC.gold, 1);
      g.fillRoundedRect(6, this.h - 7, Math.max(2, Math.round(bw * Math.max(0, Math.min(1, o.progress!)))), 3, 1);
      put(face, this.w, this.h, g);
    }
    if (tapable) makePressable(this, { face, w: this.w, h: this.h, onTap: o.onClick!, tip: o.tip });
    uiId(this, o.id ?? `chip:${o.icon ?? ''}:${val}`);
    scene.add.existing(this);
  }

  /** The number counts to `v` (at once under Reduce motion); the chip keeps its width. */
  setValue(v: number): this {
    const from = Number(this.num.text.replace(/\D/g, '')) || 0;
    if (motion.reduced || from === v) {
      this.num.setText(`${v}`);
      return this;
    }
    this.counter.v = from;
    this.scene.tweens.add({ targets: this.counter, v, duration: MOTION.countUp, ease: 'Cubic.easeOut', onUpdate: () => this.num.active && this.num.setText(`${Math.round(this.counter.v)}`) });
    return this;
  }

  /** Natural width of a chip. */
  static width(o: Pick<MChipOpts, 'icon' | 'value' | 'surface' | 'tall'>, min = 0): number {
    const size = o.tall ? 8 : 7;
    return Math.max(min, Math.ceil(mw(String(o.value), o.surface === 'stone' || (o.tall && o.surface !== 'parchment') ? 'ink' : 'pInk', size) + (o.icon ? ICON_PX + 3 : 0) + (o.tall ? 11 : 12)));
  }
}

// ================================================================== SegmentedSwitch

export interface SwitchOption {
  id: string;
  label: string;
  icon?: string;
  /** Not available, and why: a faded label with a lock; a tap says why (art bible 7.3). */
  off?: string;
}

export interface SegmentedSwitchOpts {
  options: SwitchOption[];
  selected: string;
  onChange: (id: string) => void;
  id?: string;
}

export const SWITCH_H = 24;

/** 2 to 4 segments on a dark stone track; the picked one is a lit parchment block with a bronze rim. */
export class SegmentedSwitch extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h = SWITCH_H;
  private sel: string;
  private thumb: Phaser.GameObjects.Image;
  private segs: Phaser.GameObjects.Container[] = [];
  private segW: number;

  constructor(scene: Scene, x: number, y: number, w: number, private o: SegmentedSwitchOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    const n = Math.min(4, Math.max(2, o.options.length));
    this.sel = o.selected;
    const pad = 1;
    this.segW = Math.floor((this.w - pad * 2) / n);
    this.add(mosaicImage(scene, 0, 0, this.w, this.h, 'track'));
    this.thumb = mosaicImage(scene, pad, pad, this.segW, this.h - pad * 2, 'trackSel');
    this.add(this.thumb);
    const opts = o.options.slice(0, n);
    // one face, case and size for every segment (as the tab bar): Cinzel capitals while all fit, else Inter
    const style = switchLabelStyle(
      opts.map((opt) => ({ label: opt.label, room: this.segW - (opt.icon || opt.off ? ICON_PX + 2 : 0) - 6, bare: this.segW - (opt.off ? ICON_PX + 2 : 0) - 6 })),
      (str, face, z) => mw(str, face === 'roman' ? 'rGold' : 'gold', z),
    );
    // the lock of an unavailable segment always stays; other icons go when the labels need their room
    const iconOf = (opt: SwitchOption) => (opt.off ? 'lock' : style.icons ? opt.icon : undefined);
    const room = (opt: SwitchOption) => this.segW - (iconOf(opt) ? ICON_PX + 2 : 0) - 6;
    opts.forEach((opt, i) => {
      const sx = pad + i * this.segW;
      const seg = scene.add.container(sx, 0);
      const picked = () => this.sel === opt.id;
      const icon = iconOf(opt);
      const iconW = icon ? ICON_PX + 2 : 0;
      const inter = style.face === 'body';
      const font: FontKey = inter ? (picked() ? 'pInk' : 'gold') : picked() ? 'rInk' : 'rGold';
      const size = style.size;
      const str = inter ? opt.label : opt.label.toUpperCase();
      const text = mw(str, font, size) <= room(opt) ? str : fit(str, font, size, room(opt));
      const x0 = Math.round((this.segW - (iconW + mw(text, font, size))) / 2);
      // 1 UI px under the middle: a count badge on the track's top corner keeps clear of a label that spans the segment
      const t = mtext(scene, x0 + iconW, midY(this.h - 1, size) + 1, text, font, { size, box: { owner: this, w: this.w, h: this.h } });
      seg.add(t);
      if (icon) seg.add(addIcon(scene, x0, Math.round((this.h - ICON_PX) / 2) - 1, icon, picked() ? '' : 'D'));
      // a segment that is not available is faded with a lock (its state is not colour alone)
      if (opt.off) seg.setAlpha(0.6);
      Object.assign(seg, { tx: t, inter });
      this.add(seg);
      this.segs.push(seg);
      const hit = scene.add.container(sx, 0);
      makePressable(hit, {
        w: this.segW,
        h: this.h,
        inset: 1,
        onTap: () => this.pick(opt.id, true),
        // pressed: the segment dims while held
        down: () => seg.setAlpha(0.7),
        up: () => seg.setAlpha(opt.off ? 0.6 : 1),
        disabled: () => opt.off,
        tip: text !== str ? opt.label : undefined,
      });
      uiId(hit, `${o.id ?? 'switch'}.${opt.id}`);
      Object.assign(hit, { opts: { label: opt.label } });
      hit.add(scene.add.rectangle(0, 0, this.segW, this.h, 0, 0).setOrigin(0, 0));
      this.add(hit);
    });
    this.pick(this.sel, false);
    uiId(this, o.id ?? 'switch');
    scene.add.existing(this);
  }

  get value(): string {
    return this.sel;
  }

  /** Move the thumb to `id` (no callback unless `notify`). */
  pick(id: string, notify = false): this {
    const i = Math.max(0, this.o.options.findIndex((p) => p.id === id));
    const changed = this.sel !== id;
    this.sel = this.o.options[i].id;
    this.segs.forEach((seg, k) => {
      const { tx: t, inter } = seg as unknown as { tx: Phaser.GameObjects.BitmapText; inter: boolean };
      t.setFont(`font_${inter ? (k === i ? 'pInk' : 'gold') : k === i ? 'rInk' : 'rGold'}`);
      seg.getAll().forEach((o) => {
        if (o instanceof Phaser.GameObjects.Image) o.setTexture(`icon${k === i ? '' : 'D'}_${this.o.options[k].off ? 'lock' : this.o.options[k].icon}`);
      });
    });
    const tx = 1 + i * this.segW;
    if (this.thumb.x !== tx) tweenTo(this.scene, this.thumb, { x: tx }, MOTION.tab);
    if (notify && changed) this.o.onChange(this.sel);
    return this;
  }
}

/** A round count badge on a tab of a SegmentedSwitch (`i` of `n` segments across `w`). */
export function addSwitchBadge(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, w: number, n: number, i: number, count: number | string): void {
  const segW = Math.floor((w - 2) / n);
  // on the track's top edge, clear of the segment's label (a label can now span the whole segment)
  parent.add(new MBadge(scene, x + 1 + (i + 1) * segW - 5, y - 2, count));
}
