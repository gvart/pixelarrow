/**
 * Controls of the v4 UI: MButton (the one terracotta primary, bronze secondary,
 * stone neutral, grey disabled, blue purchase), StoneTile, MChip and
 * SegmentedSwitch. Positions are UI px; every control is >= 22 UI px (44 pt)
 * in its touch area, scales on press unless motion is reduced and says why it
 * is disabled on tap.
 */
import Phaser from 'phaser';
import type { MosaicStyle } from '../../art/mosaicUi';
import { addIcon, scaleIcon, ICON_PX } from '../kit';
import { uiId } from '../layout';
import { tweenTo } from '../motion';
import { MOTION } from '../tokens';
import { wrapText } from '../textfit';
import { MBadge, TAP, centeredFace, fit, makePressable, midY, mosaicImage, mosaicTexture, mtext, mw, put } from './base';

type Scene = Phaser.Scene;
type FontKey = import('../kit').FontKey;

// ================================================================== MButton

export type MButtonVariant = 'primary' | 'primaryHero' | 'secondary' | 'neutral' | 'disabled' | 'purchase';

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
    this.w = Math.round(w);
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
    const font: FontKey = v === 'disabled' ? 'rOff' : 'rCream';
    const padX = hero ? Math.round(this.h * 0.62) + 2 : 7;
    const room = this.w - padX * 2;
    const label = this.o.label.toUpperCase();
    // the largest size that fits (down to 6); with an icon that costs the label its size (< 6.5) the icon goes
    const start = this.h >= 30 ? 9 : this.h >= 26 ? 8 : 7;
    const sizes = [start, start - 0.5, start - 1, start - 1.5, start - 2, 5.5].filter((s) => s >= 5.5);
    const withIcon = !!this.o.icon && (sizes.find((s) => mw(label, font, s) <= room - ICON_PX - 3) ?? 0) >= 6.5;
    const hasIcon = withIcon;
    const iconW = hasIcon ? ICON_PX + 3 : 0;
    const size = sizes.find((s) => mw(label, font, s) <= room - iconW) ?? 5.5;
    const text = fit(label, font, size, room - iconW);
    this.truncated = text !== label;
    const tw = mw(text, font, size);
    const x0 = Math.round((this.w - (iconW + tw)) / 2);
    const t = mtext(scene, x0 + iconW, midY(this.h - 1, size) - 0, text, font, { size, box: { owner: this, w: this.w, h: this.h } });
    put(this.content, this.w, this.h, t);
    if (hasIcon) {
      const ic = addIcon(scene, x0, Math.round((this.h - ICON_PX) / 2) - 1, this.o.icon!, v === 'disabled' ? 'D' : v === 'purchase' ? '' : 'L');
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
    const label = o.label.toUpperCase();
    const size = [7, 6.5, 6, 5.5, 5].find((s) => mw(label, font, s) <= this.w - 6) ?? 5;
    const text = fit(label, font, size, this.w - 6);
    const block = isz + 3 + 8;
    const top = Math.round((this.h - 1 - block) / 2);
    const ic = scaleIcon(addIcon(scene, 0, 0, o.icon, off ? 'D' : v === 'terracotta' || v === 'glaze' ? 'L' : ''), k);
    ic.setPosition(Math.round((this.w - ic.displayWidth) / 2), top);
    if (off) ic.setAlpha(0.7);
    P(ic);
    P(mtext(scene, this.w / 2, top + isz + 3, text, font, { size, align: 0.5, box: { owner: this, w: this.w, h: this.h } }));
    if (o.badge !== undefined && o.badge !== 0) this.add(new MBadge(scene, this.w - 5, 5, o.badge));
    let cap = 0;
    if (off) {
      const lines = wrapText(o.disabled!, this.w, 3, false, 6).lines;
      lines.forEach((l, i) => this.add(mtext(scene, this.w / 2, this.h + 2 + i * 8, l, 'pSec', { size: 6, align: 0.5 })));
      cap = 2 + lines.length * 8;
    }
    this.totalH = this.h + cap;
    makePressable(this, {
      face,
      w: this.w,
      h: this.h,
      onTap: () => o.onClick?.(),
      tip: o.tip ?? (text !== label ? o.label : undefined),
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
  onClick?: () => void;
  tip?: string;
  id?: string;
}

const CHIP_H = 18;

/** A small pill: an icon and a number (Inter, tabular). 22 tall when tappable. */
export class MChip extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;
  readonly opts: { label: string; icon?: string };

  constructor(scene: Scene, x: number, y: number, o: MChipOpts) {
    super(scene, Math.round(x), Math.round(y));
    const tapable = !!o.onClick;
    this.h = tapable ? TAP : CHIP_H;
    this.w = o.w ?? MChip.width(o);
    const stone = o.surface === 'stone';
    const val = String(o.value);
    this.opts = { label: val, icon: o.icon };
    const face = centeredFace(scene, this.w, this.h);
    this.add(face);
    put(face, this.w, this.h, mosaicImage(scene, 0, 0, this.w, this.h, stone ? 'chipStone' : 'chipParch'));
    const iconW = o.icon ? ICON_PX + 3 : 0;
    const font: FontKey = stone ? 'ink' : 'pInk';
    // the number keeps its size while it fits, then shrinks (to 6) before it is cut
    const room = this.w - (o.pad ?? 10) - iconW;
    const size = [7, 6.5, 6].find((z) => mw(val, font, z) <= room) ?? 6;
    const text = fit(val, font, size, room);
    const x0 = Math.round((this.w - (iconW + mw(text, font, size))) / 2);
    if (o.icon) put(face, this.w, this.h, addIcon(scene, x0, Math.round((this.h - ICON_PX) / 2) - 1, o.icon));
    put(face, this.w, this.h, mtext(scene, x0 + iconW, midY(this.h - 1, size), text, font, { size, box: { owner: this, w: this.w, h: this.h } }));
    if (tapable) makePressable(this, { face, w: this.w, h: this.h, onTap: o.onClick!, tip: o.tip });
    uiId(this, o.id ?? `chip:${o.icon ?? ''}:${val}`);
    scene.add.existing(this);
  }

  /** Natural width of a chip. */
  static width(o: MChipOpts): number {
    return Math.ceil(mw(String(o.value), o.surface === 'stone' ? 'ink' : 'pInk') + (o.icon ? ICON_PX + 3 : 0) + 12);
  }
}

// ================================================================== SegmentedSwitch

export interface SwitchOption {
  id: string;
  label: string;
  icon?: string;
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
    o.options.slice(0, n).forEach((opt, i) => {
      const sx = pad + i * this.segW;
      const seg = scene.add.container(sx, 0);
      const picked = () => this.sel === opt.id;
      const font: FontKey = picked() ? 'rInk' : 'rGold';
      const label = opt.label.toUpperCase();
      const iconW = opt.icon ? ICON_PX + 2 : 0;
      const size = [7, 6, 5.5].find((s) => mw(label, 'rGold', s) <= this.segW - iconW - 6) ?? 5.5;
      const text = fit(label, font, size, this.segW - iconW - 6);
      const x0 = Math.round((this.segW - (iconW + mw(text, font, size))) / 2);
      const t = mtext(scene, x0 + iconW, midY(this.h - 1, size), text, font, { size, box: { owner: this, w: this.w, h: this.h } });
      seg.add(t);
      if (opt.icon) seg.add(addIcon(scene, x0, Math.round((this.h - ICON_PX) / 2) - 1, opt.icon, picked() ? '' : 'D'));
      (seg as Phaser.GameObjects.Container & { tx?: Phaser.GameObjects.BitmapText; ic?: string }).tx = t;
      this.add(seg);
      this.segs.push(seg);
      const hit = scene.add.container(sx, 0);
      makePressable(hit, { w: this.segW, h: this.h, inset: 1, onTap: () => this.pick(opt.id, true) });
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
      const t = (seg as unknown as { tx: Phaser.GameObjects.BitmapText }).tx;
      t.setFont(`font_${k === i ? 'rInk' : 'rGold'}`);
      seg.getAll().forEach((o) => {
        if (o instanceof Phaser.GameObjects.Image) o.setTexture(`icon${k === i ? '' : 'D'}_${this.o.options[k].icon}`);
      });
    });
    const tx = 1 + i * this.segW;
    if (this.thumb.x !== tx) tweenTo(this.scene, this.thumb, { x: tx }, MOTION.tab);
    if (notify && changed) this.o.onChange(this.sel);
    return this;
  }
}

