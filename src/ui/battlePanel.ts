/**
 * Pieces of the battle command panel (docs/DESIGN_V2.md "UI": a grouped,
 * colour-coded bar): category buttons tinted Movement bronze, Attack red,
 * Formation blue, Abilities gold (src/ui/theme.ts), with big icons, short
 * labels, long-press explanations, disabled-with-reason and cooldown sweeps;
 * and the group cards (class portrait, men, health and morale, current order).
 *
 * They behave like the kit's Button (press state, click sound, haptic, tip on
 * long-press, a tap on a disabled one says why) and register with the layout
 * check the same way (a container with w / h, texts framed by it).
 */
import Phaser from 'phaser';
import { addIcon, addText, holdTimer, longPress, type HoldTimer, panelTexture, SHADOW_FONTS, type FontKey } from './kit';
import { uiFrame, uiId } from './layout';
import { ellipsize, measureText } from './textfit';
import { CATEGORY_COLOR, CATEGORY_DARK, type BattleCategory } from './theme';
import { Pix } from '../art/pixels';
import { P } from '../art/palette';
import { haptic, hapticNotify, hapticSelect } from '../platform/telegram';
import { uiButton, uiError } from '../audio/hooks';
import { t } from '../i18n';

const lighten = (c: number, k: number): number => {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  const f = (v: number) => Math.round(v + (255 - v) * k);
  return (f(r) << 16) | (f(g) << 8) | f(b);
};

/** A bevelled panel filled with a category colour (selected command / tab), cached per size. */
export function categoryTexture(scene: Phaser.Scene, w: number, h: number, cat: BattleCategory, down = false): string {
  w = Math.max(6, Math.round(w));
  h = Math.max(6, Math.round(h));
  const key = `catpanel_${cat}_${w}x${h}${down ? 'd' : ''}`;
  if (scene.textures.exists(key)) return key;
  const fill = CATEGORY_COLOR[cat];
  const dark = CATEGORY_DARK[cat];
  const light = lighten(fill, 0.3);
  const px = new Pix(w, h);
  px.rect(0, 0, w, h, fill);
  px.hline(1, w - 2, 1, down ? dark : light);
  px.vline(1, 1, h - 2, down ? dark : light);
  px.hline(1, w - 2, h - 2, down ? light : dark);
  px.vline(w - 2, 1, h - 2, down ? light : dark);
  if (!down) px.hline(1, w - 2, h - 3, dark);
  px.hline(1, w - 2, 0, P.ink);
  px.hline(1, w - 2, h - 1, P.ink);
  px.vline(0, 1, h - 2, P.ink);
  px.vline(w - 1, 1, h - 2, P.ink);
  for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) px.clear(x, y);
  scene.textures.addCanvas(key, px.toCanvas());
  return key;
}

export interface PanelButtonOpts {
  icon?: string;
  /** Full label (scripts find buttons by it); shortened with "…" when it does not fit. */
  label?: string;
  /** Category colour (accent band, tinted icon, filled when selected). None: plain parchment. */
  cat?: BattleCategory;
  selected?: boolean;
  /** The primary action of the screen (filled red, like the kit's primary Button). */
  primary?: boolean;
  /** Long-press explanation. */
  tip?: string;
  disabledReason?: string;
  onClick?: () => void;
  /** Layout-check id. */
  id?: string;
  /** What to draw (default both; scripts and tips still know the label and icon). */
  show?: 'both' | 'label' | 'icon';
}

/**
 * A command button of the battle panel. Icon above the label when it is at
 * least 28 tall, else side by side; icon only when the label has no room
 * (the label then leads the long-press tip).
 */
export class PanelButton extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;
  private bg: Phaser.GameObjects.Image;
  private content: Phaser.GameObjects.Container;
  private sweep: Phaser.GameObjects.Graphics;
  private badgeText: Phaser.GameObjects.BitmapText;
  private enabled = true;
  private sel: boolean;
  private o: PanelButtonOpts;
  private downAt: { x: number; y: number } | null = null;
  private timer: HoldTimer | null = null;
  private long = false;
  private iconBox = { x: 0, y: 0 };
  private shortened = false;
  /** Usable later (an ability recovering, no target yet): keeps its colours, a tap says why. */
  private blocked: string | null = null;
  private iconImg: Phaser.GameObjects.Image | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, o: PanelButtonOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    this.h = Math.round(h);
    this.o = o;
    this.sel = !!o.selected;
    this.bg = scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0);
    this.content = scene.add.container(0, 0);
    this.sweep = scene.add.graphics();
    // top right, clear of the label (bottom or centre) and the icon
    this.badgeText = addText(scene, this.w - 3, 2, '', 'gold', 1);
    this.add([this.bg, this.content, this.sweep, this.badgeText]);
    uiFrame(this.badgeText, this, this.w, this.h);
    this.setSize(this.w, this.h);
    this.setInteractive(new Phaser.Geom.Rectangle(this.w / 2, this.h / 2, this.w, this.h), Phaser.Geom.Rectangle.Contains);
    uiId(this, o.id ?? (o.label ? o.label : `icon:${o.icon}`));
    this.build();
    this.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.downAt = { x: p.x, y: p.y };
      this.long = false;
      this.timer?.remove();
      this.timer = holdTimer(scene, longPress.ms, () => {
        this.timer = null;
        const tip = this.tipText();
        if (!this.downAt || !tip || !longPress.show || !this.scene) return;
        this.long = true;
        haptic('light');
        longPress.show(scene, tip, this);
        this.release();
      });
      if (this.enabled) {
        this.bg.setTexture(this.texture(true));
        this.content.y = 1;
      }
    });
    this.on('pointerout', () => this.release());
    this.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.downAt && p.isDown && Math.abs(p.x - this.downAt.x) + Math.abs(p.y - this.downAt.y) > 14) this.release();
    });
    this.on('pointerup', (p: Phaser.Input.Pointer) => {
      const d = this.downAt;
      const long = this.long;
      this.release();
      if (!d || long || Math.abs(p.x - d.x) + Math.abs(p.y - d.y) > 14) return;
      if (!this.enabled || this.blocked) {
        uiError();
        hapticNotify('warning');
        longPress.toast?.(scene, this.blocked ?? this.o.disabledReason ?? t('kit.disabled'));
        return;
      }
      hapticSelect();
      uiButton(this.o.icon);
      this.o.onClick?.();
    });
    this.once('destroy', () => this.timer?.remove());
    scene.add.existing(this);
  }

  get label(): string | undefined {
    return this.o.label;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  get isSelected(): boolean {
    return this.sel;
  }

  /** Same shape as the kit Button's options (smoke scripts read `opts.label`). */
  get opts(): PanelButtonOpts {
    return this.o;
  }

  private tipText(): string | undefined {
    const parts: string[] = [];
    if (this.shortened && this.o.label) parts.push(this.o.label);
    if (this.o.tip) parts.push(this.o.tip);
    if (!this.enabled && this.o.disabledReason) parts.push(this.o.disabledReason);
    if (this.enabled && this.blocked) parts.push(this.blocked);
    return parts.length ? parts.join('\n') : this.o.label;
  }

  private release(): void {
    this.downAt = null;
    this.timer?.remove();
    this.timer = null;
    if (!this.scene) return;
    this.bg.setTexture(this.texture(false));
    this.content.y = 0;
  }

  private texture(down: boolean): string {
    const s = this.scene;
    if (!this.enabled) return panelTexture(s, this.w, this.h, 'buttonOff');
    if (this.o.primary) return panelTexture(s, this.w, this.h, down ? 'buttonSelDown' : 'buttonSel');
    if (this.sel && this.o.cat) return categoryTexture(s, this.w, this.h, this.o.cat, down);
    if (this.sel) return panelTexture(s, this.w, this.h, down ? 'buttonSelDown' : 'buttonSel');
    return panelTexture(s, this.w, this.h, down ? 'buttonDown' : 'button');
  }

  private build(): void {
    const s = this.scene;
    this.content.removeAll(true);
    this.bg.setTexture(this.texture(false));
    const filled = this.enabled && (this.sel || !!this.o.primary);
    const cat = this.o.cat;
    if (cat && this.enabled && !filled) {
      // the category's colour band along the top edge
      this.content.add(s.add.rectangle(2, 2, this.w - 4, 2, CATEGORY_COLOR[cat]).setOrigin(0, 0));
    }
    const font: FontKey = !this.enabled ? 'dim' : filled ? 'light' : 'ink';
    this.badgeText.setFont(filled ? 'font_light' : 'font_gold');
    const shadow = SHADOW_FONTS.has(font);
    const icon = (x: number, y: number) => {
      if (!this.o.icon) return;
      let img: Phaser.GameObjects.Image;
      if (!this.enabled) img = addIcon(s, x, y, this.o.icon, 'D');
      else if (filled) img = addIcon(s, x, y, this.o.icon, 'L');
      else if (cat) img = addIcon(s, x, y, this.o.icon, 'L').setTint(CATEGORY_DARK[cat]);
      else img = addIcon(s, x, y, this.o.icon);
      this.iconBox = { x, y };
      this.iconImg = img;
      img.setAlpha(this.blocked ? 0.55 : 1);
      this.content.add(img);
    };
    this.shortened = false;
    const show = this.o.show ?? 'both';
    const label = this.o.label && show !== 'icon' ? this.o.label.toUpperCase() : '';
    const hasIcon = !!this.o.icon && show !== 'label';
    if (show === 'icon') this.shortened = !!this.o.label;
    const tall = this.h >= 28;
    const tallFit = ellipsize(label, this.w - 4, shadow);
    if (hasIcon && label && tall && (tallFit === label || tallFit.length >= 5)) {
      icon(Math.round((this.w - 12) / 2), 4);
      this.shortened = tallFit !== label;
      const txt = addText(s, this.w / 2, this.h - 11, tallFit, font, 0.5);
      uiFrame(txt, this, this.w, this.h);
      this.content.add(txt);
    } else if (hasIcon && label && tall) {
      // no room for a word: the icon alone, the label leads the long-press tip
      this.shortened = true;
      icon(Math.round((this.w - 12) / 2), Math.round((this.h - 12) / 2));
    } else if (hasIcon && label) {
      const room = this.w - 6 - 14;
      const fit = ellipsize(label, room, shadow);
      if (fit !== label && (room < 18 || fit.length < 4)) {
        this.shortened = true;
        icon(Math.round((this.w - 12) / 2), Math.round((this.h - 12) / 2));
      } else {
        this.shortened = fit !== label;
        const tw = measureText(fit, shadow);
        const x0 = Math.round((this.w - (12 + 2 + tw)) / 2);
        icon(x0, Math.round((this.h - 12) / 2));
        const txt = addText(s, x0 + 14, Math.round((this.h - 8) / 2), fit, font, 0);
        uiFrame(txt, this, this.w, this.h);
        this.content.add(txt);
      }
    } else if (hasIcon) {
      icon(Math.round((this.w - 12) / 2), Math.round((this.h - 12) / 2));
    } else if (label) {
      const fit = ellipsize(label, this.w - 6, shadow);
      this.shortened = fit !== label;
      const txt = addText(s, this.w / 2, Math.round((this.h - 8) / 2), fit, font, 0.5);
      uiFrame(txt, this, this.w, this.h);
      this.content.add(txt);
    }
  }

  setSelected(on: boolean): this {
    if (on === this.sel) return this;
    this.sel = on;
    this.build();
    return this;
  }

  /** Enable or disable; `reason` is what a tap (or long-press) on the disabled button says. */
  setEnabled(on: boolean, reason?: string): this {
    if (reason !== undefined) this.o.disabledReason = reason;
    if (on === this.enabled) return this;
    this.enabled = on;
    this.build();
    return this;
  }

  /**
   * Keep the look but refuse taps with `reason` (null: usable again): for
   * commands that will be usable soon, like an ability on cooldown.
   */
  setBlocked(reason: string | null): this {
    this.blocked = reason;
    this.iconImg?.setAlpha(reason ? 0.55 : 1);
    return this;
  }

  setTip(tip: string): this {
    this.o.tip = tip;
    return this;
  }

  /**
   * Cooldown sweep over the icon: a dark wedge shrinking clockwise in 16
   * steps (frac 1 = just used, 0 = ready).
   */
  setCooldown(frac: number): this {
    const g = this.sweep;
    g.clear();
    if (frac <= 0) return this;
    const steps = Math.ceil(Math.min(1, frac) * 16) / 16;
    const cx = this.iconBox.x + 6;
    const cy = this.iconBox.y + 6;
    g.fillStyle(0x2a1a16, 0.6);
    g.slice(cx, cy, 9, -Math.PI / 2, -Math.PI / 2 + steps * Math.PI * 2, false);
    g.fillPath();
    return this;
  }

  /** A short gold mark in the corner (e.g. how many men can use an ability). */
  setBadge(text: string): this {
    this.badgeText.setText(text.toUpperCase());
    return this;
  }
}

// ================================================================== group card

export interface GroupCardInfo {
  /** "I", "II"... or "*" for a detached hero. */
  numeral: string;
  men: number;
  /** 0..1 */
  hp: number;
  /** 0..1 */
  morale: number;
  /** Icon of the current order (hold, advance, charge, fallback, wall, throw). */
  orderIcon: string;
  /** Wide cards: the group's name and its order in words. */
  name?: string;
  orderWord?: string;
  /** Portrait texture key of the group's leading class. */
  portrait: string | null;
  selected: boolean;
  routed: boolean;
}

/**
 * One group in the panel's strip: class portrait, numeral, men, current order,
 * health (red) and morale (blue) bars. Tap selects; long-press explains.
 */
export class GroupCard extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;
  private bars: Phaser.GameObjects.Graphics;
  private key = '';
  private info: GroupCardInfo | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, onTap: () => void, tip: () => string) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    this.h = Math.round(h);
    this.bars = scene.add.graphics();
    this.setSize(this.w, this.h);
    this.setInteractive(new Phaser.Geom.Rectangle(this.w / 2, this.h / 2, this.w, this.h), Phaser.Geom.Rectangle.Contains);
    let down: { x: number; y: number } | null = null;
    let timer: HoldTimer | null = null;
    let long = false;
    this.on('pointerdown', (p: Phaser.Input.Pointer) => {
      down = { x: p.x, y: p.y };
      long = false;
      timer?.remove();
      timer = holdTimer(scene, longPress.ms, () => {
        timer = null;
        if (!down || !this.scene) return;
        long = true;
        haptic('light');
        longPress.show?.(scene, tip(), this);
      });
    });
    const stop = () => {
      timer?.remove();
      timer = null;
    };
    this.on('pointerout', () => {
      stop();
      down = null;
    });
    this.on('pointerup', (p: Phaser.Input.Pointer) => {
      stop();
      const d = down;
      down = null;
      if (!d || long || Math.abs(p.x - d.x) + Math.abs(p.y - d.y) > 14) return;
      hapticSelect();
      uiButton();
      onTap();
    });
    this.once('destroy', stop);
    scene.add.existing(this);
  }

  setInfo(i: GroupCardInfo): this {
    this.info = i;
    const key = [i.numeral, i.men, i.orderIcon, i.portrait, i.selected, i.routed, i.name, i.orderWord].join('|');
    if (key !== this.key) {
      this.key = key;
      this.rebuild();
    }
    this.drawBars();
    return this;
  }

  private rebuild(): void {
    const i = this.info!;
    const s = this.scene;
    this.removeAll(true);
    this.bars = s.add.graphics();
    const style = i.selected ? 'buttonSel' : i.men === 0 ? 'buttonOff' : 'button';
    this.add(s.add.image(0, 0, panelTexture(s, this.w, this.h, style)).setOrigin(0, 0));
    if (i.selected) {
      // a gold rim: the selected group stands out at a glance
      const g = s.add.graphics();
      g.lineStyle(1, 0xf0c860, 1);
      g.strokeRect(1.5, 1.5, this.w - 3, this.h - 3);
      this.add(g);
    }
    const light = i.selected;
    const fontA: FontKey = light ? 'light' : i.men === 0 || i.routed ? 'dim' : 'red';
    const fontB: FontKey = light ? 'light' : i.men === 0 ? 'dim' : 'ink';
    const ph = this.h - 11;
    const text = (x: number, y: number, str: string, font: FontKey, align: 0 | 0.5 | 1, maxW: number) => {
      const tx = addText(s, x, y, ellipsize(str.toUpperCase(), maxW, SHADOW_FONTS.has(font)), font, align);
      uiFrame(tx, this, this.w, this.h);
      this.add(tx);
      return tx;
    };
    let x = 3;
    if (i.portrait && i.men > 0 && this.w >= 34) {
      // the class portrait, head and shoulders
      const img = s.add.image(x - 3, 3, i.portrait).setOrigin(0, 0).setCrop(3, 0, 18, ph);
      this.add(img);
      x += 19;
    }
    const room = this.w - x - 3;
    if (room >= 34 && i.name) {
      // wide: "II SKIRMISH" over "7 · ADVANCING"
      text(x, 2, `${i.numeral} ${i.name}`, fontA, 0, room);
      text(x, 11, `${i.men} ${i.orderWord ?? ''}`.trim(), fontB, 0, room);
      if (i.orderIcon && room >= 48) this.add(addIcon(s, this.w - 15, 7, i.orderIcon, light ? 'L' : 'D').setAlpha(0.9));
    } else if (x > 3) {
      // narrow: the numeral over the portrait's corner, the order icon and the men beside it
      text(3, ph - 6, i.numeral, fontA, 0, 18);
      if (room >= 12) this.add(addIcon(s, x, 1, i.orderIcon, light ? 'L' : i.routed ? 'D' : ''));
      text(x + Math.min(12, room) / 2, ph - 6, `${i.men}`, fontB, 0.5, room);
    } else {
      // no one left (or nobody assigned yet): the numeral and the count
      text(this.w / 2, 2, i.numeral, fontA, 0.5, this.w - 6);
      text(this.w / 2, 11, `${i.men}`, fontB, 0.5, this.w - 6);
    }
    this.add(this.bars);
  }

  private drawBars(): void {
    const i = this.info!;
    const g = this.bars;
    g.clear();
    const bw = this.w - 6;
    const bar = (y: number, f: number, c: number) => {
      g.fillStyle(0x2a1a16, 1);
      g.fillRect(3, y, bw, 3);
      const fw = Math.round((bw - 2) * Math.max(0, Math.min(1, f)));
      if (fw > 0) {
        g.fillStyle(c, 1);
        g.fillRect(4, y + 1, fw, 1);
      }
    };
    bar(this.h - 8, i.hp, 0xd0503c);
    bar(this.h - 5, i.morale, i.routed ? 0x9a948a : 0x6d8fd0);
  }
}
