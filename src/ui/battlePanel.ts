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
import { RS } from '../platform/renderScale';
import { mosaicImage, mw } from './mosaic/base';
import { caps } from './mosaic/KeyButton';
import { ROMAN, barLabels, markerGlyph, moraleGlyph, type MoraleState } from './battleHud';
import { safeLocalStorage } from '../platform/storage';
import { GROUP_COLOR } from '../art/sheetArt';
import { MOSAIC } from './tokens';
import Phaser from 'phaser';
import { addIcon, addText, holdTimer, longPress, type HoldTimer, panelK, panelTexture, SHADOW_FONTS, type FontKey } from './kit';
import { uiFrame, uiId } from './layout';
import { addPortrait } from './sprites';
import { dollKey, type DollSpec } from '../art/paperdoll';
import { ellipsize, measureText } from './textfit';
import { CATEGORY_COLOR, CATEGORY_DARK, type BattleCategory } from './theme';
import { Pix } from '../art/pixels';
import { lighten, P } from '../art/palette';
import { haptic, hapticNotify, hapticSelect } from '../platform/telegram';
import { uiButton, uiError } from '../audio/hooks';
import { t } from '../i18n';

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
    this.bg = scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setScale(1 / panelK(scene));
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
      if (this.downAt && p.isDown && Math.abs(p.x - this.downAt.x) + Math.abs(p.y - this.downAt.y) > 14 * RS) this.release();
    });
    this.on('pointerup', (p: Phaser.Input.Pointer) => {
      const d = this.downAt;
      const long = this.long;
      this.release();
      if (!d || long || Math.abs(p.x - d.x) + Math.abs(p.y - d.y) > 14 * RS) return;
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
    if (this.sel) return panelTexture(s, this.w, this.h, down ? 'buttonOnDown' : 'buttonOn');
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
    const label = this.o.label && show !== 'icon' ? this.o.label : '';
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
    this.badgeText.setText(text);
    return this;
  }
}

// ================================================================== group card

/**
 * The selected card's gold frame: a double gold line with a stepped key at
 * each corner (the meander of the screen frame in miniature).
 */
function goldFrame(scene: Phaser.Scene, w: number, h: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.lineStyle(1.4, MOSAIC.meanderHi, 1);
  g.strokeRoundedRect(0.7, 0.7, w - 1.4, h - 1.4, 2);
  g.lineStyle(0.6, MOSAIC.meanderLo, 0.9);
  g.strokeRect(2.4, 2.4, w - 4.8, h - 4.8);
  g.fillStyle(MOSAIC.meanderHi, 1);
  for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]] as const) {
    // an L-shaped step at the corner
    g.fillRect(Math.min(cx, cx + sx * 4.5), Math.min(cy + sy * 0.5, cy + sy * 2), 4.5, 1.5);
    g.fillRect(Math.min(cx + sx * 0.5, cx + sx * 2), Math.min(cy, cy + sy * 4.5), 1.5, 4.5);
  }
  return g;
}

/** The first candidate (upper-cased) whose width fits `maxW`; else the last one. */
export function firstFit(cands: (string | undefined | false | null)[], maxW: number, shadow = false, face: 'body' | 'roman' = 'body'): string {
  const list = cands.filter((c): c is string => !!c).map((c) => (face === 'roman' ? caps(c) : c));
  return list.find((c) => measureText(c, shadow, 7, face) <= maxW) ?? list[list.length - 1] ?? '';
}

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
  /** Wide cards: the group's name and its order in words, with short forms for narrow cards. */
  name?: string;
  shortName?: string;
  orderWord?: string;
  orderShort?: string;
  /** The group's leading man (his living portrait, src/ui/sprites.ts addPortrait). */
  portrait: DollSpec | null;
  selected: boolean;
  routed: boolean;
  /** Its missiles focus on an enemy group: a reticle on the card (controls.md R3.2; A11Y-04). */
  focus?: boolean;
  /** Shoot on and out of range (controls.md R3.4): a compact card with no room for the words keeps "→". */
  far?: boolean;
  /** The morale glyph (battle-readability.md R1); null or missing: none (beasts, nobody left). */
  state?: MoraleState | null;
  /** Its man carries the Standard: the banner marker (R2; abilities.md R5). */
  standard?: boolean;
  /** "Flanked!" on the state line, for 2 s after a `flanked` event (R3). */
  flanked?: boolean;
}

/** How many battles have shown group cards, this one included (R3: the bars' long labels the first 3). */
const SEEN_KEY = 'pixelarrow:barLabelSeen';
let seenScene: Phaser.Scene | null = null;
let seenN = 1;

/** The battle count for `scene`'s run: read and bumped once per run (a per-player convenience, kept in localStorage). */
export function barsSeen(scene: Phaser.Scene): number {
  if (seenScene === scene) return seenN;
  seenScene = scene;
  const ls = safeLocalStorage();
  try {
    seenN = (Number(ls?.getItem(SEEN_KEY)) || 0) + 1;
    ls?.setItem(SEEN_KEY, String(seenN));
  } catch {
    seenN = 1;
  }
  scene.events.once('shutdown', () => {
    if (seenScene === scene) seenScene = null;
  });
  return seenN;
}

/** Card text size (UI px): the readability floor (A11Y-09; battle-readability.md R3). */
const CARD_TEXT = 6.5;
/** The bars' height (R3: at least 5 UI px). */
const BAR_H = 5;
/** The morale glyph on a card (UI px). */
const CARD_GLYPH = 9;

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

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, onTap: () => void, baseTip: () => string) {
    super(scene, Math.round(x), Math.round(y));
    // the long-press explains the glyph and the bars too (R3: no "teal bar?")
    const tip = () => [baseTip(), ...this.legend()].join('\n');
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
      if (!d || long || Math.abs(p.x - d.x) + Math.abs(p.y - d.y) > 14 * RS) return;
      hapticSelect();
      uiButton();
      onTap();
    });
    this.once('destroy', stop);
    scene.add.existing(this);
  }

  setInfo(i: GroupCardInfo): this {
    this.info = i;
    const key = [i.numeral, i.men, i.orderIcon, i.portrait ? dollKey(i.portrait) : '', i.selected, i.routed, i.name, i.shortName, i.orderWord, i.orderShort, !!i.focus, !!i.far, i.state ?? '', !!i.standard, !!i.flanked].join('|');
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
    if (this.w >= 56 && this.h < 40) {
      this.rebuildWide(i);
      return;
    }
    this.add(mosaicImage(s, 0, 0, this.w, this.h, i.selected ? 'parchmentSel' : 'parchment'));
    if (i.men === 0) this.add(s.add.rectangle(0, 0, this.w, this.h, MOSAIC.parchLo, 0.5).setOrigin(0, 0));
    // a gold frame: the selected group stands out at a glance
    if (i.selected) this.add(goldFrame(s, this.w, this.h));
    const light = false;
    const fontA: FontKey = i.men === 0 || i.routed ? 'pOff' : 'rInk';
    const fontB: FontKey = i.men === 0 ? 'pOff' : 'pInk';
    const ph = this.h - BAR_H - 4;
    const text = (x: number, y: number, str: string, font: FontKey, align: 0 | 0.5 | 1, maxW: number) => {
      const roman = font === 'rInk';
      const tx = addText(s, x, y, roman ? ellipsize(caps(str), maxW, false, 7, 'roman') : ellipsize(str, maxW, SHADOW_FONTS.has(font)), font, align);
      uiFrame(tx, this, this.w, this.h);
      this.add(tx);
      return tx;
    };
    let x = 3;
    if (this.h >= 40 && this.w >= 44) {
      // tall (the Strategos column): "I" and "4 men" on the first line, the group's name, its order in words
      const tw = this.w - 6;
      text(3, 3, i.numeral, fontA, 0, 16);
      text(this.w - 3, 3, firstFit([t('strat.men', { n: i.men }), `${i.men}`], tw - 14, SHADOW_FONTS.has(fontB)), fontB, 1, tw - 14);
      text(3, 13, firstFit([i.name, i.shortName, ''], tw, SHADOW_FONTS.has(fontB)), fontB, 0, tw);
      const order = firstFit([i.orderWord, i.orderShort, ''], tw, false);
      const ot = addText(s, 3, 23, order, 'pSec', 0);
      uiFrame(ot, this, this.w, this.h);
      this.add(ot);
      this.addBarRow(3, this.w - 3, this.h - BAR_H - 2.5, true);
      this.add(this.bars);
      return;
    }
    if (this.h >= 28 && this.h < 40 && this.w >= 28 && this.w < 44) {
      // short cards (compact screens): numeral and men on one line, the order under them
      const tw = this.w - 6;
      text(3, 3, firstFit([`${i.numeral} ${i.men}`, i.numeral], tw, false, 'roman'), fontA, 0, tw);
      const ot = addText(s, 3, 13, ellipsize(i.orderShort ?? '', tw, light), 'pSec', 0);
      uiFrame(ot, this, this.w, this.h);
      this.add(ot);
      this.addBarRow(3, this.w - 3, this.h - BAR_H - 2.5, true);
      this.add(this.bars);
      return;
    }
    if (i.portrait && i.men > 0 && this.w >= 34) {
      // the leading man's living portrait, head and shoulders
      const ps = Math.min(20, ph);
      this.add(addPortrait(s, i.portrait, x - 2, 2, { size: ps }));
      x += ps - 1;
    }
    const room = this.w - x - 3;
    if (room >= 30 && i.name) {
      // wide: the order icon in the top right corner; beside it "II SKIRMISH"
      // over "7 ADVANCING", each line the longest form that fits whole
      // ("II SKIRM." / "7 ADV" / "II" / "7"): never an ellipsis
      const tw = room - (i.orderIcon ? 13 : 0);
      // a focus shows its reticle where the order icon goes (the order is in words on the line below)
      if (i.focus) this.add(reticle(s, this.w - 8, 7, 4.5));
      else if (i.orderIcon) this.add(addIcon(s, this.w - 14, 1, i.orderIcon, light ? 'L' : i.routed || i.men === 0 ? 'D' : ''));
      text(x, 2, firstFit([`${i.numeral} ${i.name}`, i.shortName && `${i.numeral} ${i.shortName}`, i.numeral], tw, false, 'roman'), fontA, 0, tw);
      text(x, 11, firstFit([i.orderWord && `${i.men} ${i.orderWord}`, i.orderShort && `${i.men} ${i.orderShort}`, i.far && `${i.men} →`, `${i.men}`], tw, SHADOW_FONTS.has(fontB)), fontB, 0, tw);
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
    this.addBarRow(3, this.w - 3, this.h - BAR_H - 2.5, true);
    this.add(this.bars);
  }

  /**
   * The bottom sheet's card (Bronze & Stone; battle-readability.md R3): the
   * leading man's portrait with the numeral plate on its corner, the morale
   * glyph and the group's name beside it, "7 men · Advancing" (or "Flanked!")
   * under them, and the labelled health and morale bars across the foot.
   * Markers (focus reticle, the Standard) in the top right corner.
   */
  private rebuildWide(i: GroupCardInfo): void {
    const s = this.scene;
    this.add(mosaicImage(s, 0, 0, this.w, this.h, i.selected ? 'parchmentSel' : 'parchment'));
    if (i.men === 0) this.add(s.add.rectangle(0, 0, this.w, this.h, MOSAIC.parchLo, 0.5).setOrigin(0, 0));
    if (i.selected) this.add(goldFrame(s, this.w, this.h));
    const barTop = this.h - BAR_H - 2.5;
    // the leading man's portrait (room permitting) above the bars, the numeral plate on its corner
    let x = 3;
    let plateX = 1;
    if (i.portrait && i.men > 0) {
      const ps = Math.floor(barTop) - 3;
      this.add(addPortrait(s, i.portrait, 2, 2, { size: ps }));
      x = 2 + ps + 3;
    } else plateX = 3;
    const plate = numeralPlate(s, plateX, 1, i.numeral, i.selected);
    this.add(plate);
    if (x === 3) x = plateX + plate.width + 2;
    const off = i.men === 0 || i.routed;
    // the markers, right to left: the focus reticle, the Standard
    let right = this.w - 3;
    if (i.focus) {
      this.add(reticle(s, this.w - 8, 7, 4.5));
      right -= 11;
    }
    if (i.standard) {
      this.add(markerGlyph(s, right - 4.5, 6, 10, 'standard'));
      right -= 11;
    }
    // the morale glyph leads the name (R1, R3)
    let nx = x;
    if (i.state) {
      this.add(moraleGlyph(s, x + CARD_GLYPH / 2, 6, CARD_GLYPH, i.state));
      nx += CARD_GLYPH + 2;
    }
    const nameW = right - nx;
    const name = addText(s, nx, 1, firstFit([i.name, i.shortName, ''], nameW, false, 'roman'), off ? 'pOff' : 'rInk', 0).setFontSize(CARD_TEXT);
    uiFrame(name, this, this.w, this.h);
    // the state line: "Flanked!" for 2 s after a flank (R3), else the men and their order
    const tw = this.w - x - 3;
    const men = t('strat.men', { n: i.men });
    const flank = !!i.flanked && !i.routed && i.men > 0;
    const sub = flank
      ? firstFit([`${men} · ${t('readout.flanked')}`, `${i.men} · ${t('readout.flanked')}`, t('readout.flanked')], tw, false)
      : firstFit([i.orderWord && `${men} · ${i.orderWord}`, i.orderShort && `${i.men} · ${i.orderShort}`, i.far && `${i.men} →`, `${i.men}`], tw, false);
    const st = addText(s, x, 9.5, sub, flank ? 'pBad' : off ? 'pOff' : 'pSec', 0).setFontSize(CARD_TEXT);
    uiFrame(st, this, this.w, this.h);
    this.add([name, st]);
    this.addBarRow(3, this.w - 3, barTop);
    this.add(this.bars);
  }

  /** Where drawBars fills the two bars: [x0, x1] each, and the row's top. */
  private barGeom = { hp: [0, 0], mor: [0, 0], y: 0 };

  /**
   * The bars' row (R3): "HP [bar] MOR [bar]" the first 3 battles, then
   * "H [bar] M [bar]": a word, never a colour alone, says which is which.
   * `glyph`: the morale glyph leads the row (cards with no room by the numeral).
   */
  private addBarRow(x0: number, x1: number, y: number, glyph = false): void {
    const s = this.scene;
    const i = this.info!;
    if (glyph && i.state) {
      this.add(moraleGlyph(s, x0 + CARD_GLYPH / 2, y + BAR_H / 2, CARD_GLYPH, i.state));
      x0 += CARD_GLYPH + 2;
    }
    const lab = barLabels(barsSeen(s));
    const font: FontKey = i.men === 0 ? 'pOff' : 'pSec';
    const gap = 4;
    const half = (x1 - x0 - gap) / 2;
    const put = (x: number, word: string): number => {
      // the caps sit 1.8 below the line's top: centred on the 5-tall bar
      const tx = addText(s, x, y - 1.8, word, font, 0).setFontSize(CARD_TEXT);
      uiFrame(tx, this, this.w, this.h);
      this.add(tx);
      return x + Math.ceil(measureText(word, false, CARD_TEXT)) + 1.5;
    };
    this.barGeom = { hp: [put(x0, lab.hp), x0 + half], mor: [put(x0 + half + gap, lab.mor), x1], y };
  }

  private drawBars(): void {
    const i = this.info!;
    const g = this.bars;
    g.clear();
    const { y } = this.barGeom;
    const bar = ([x0, x1]: number[], f: number, c: number) => {
      const w = Math.max(4, x1 - x0);
      g.fillStyle(MOSAIC.parchEdge, 1);
      g.fillRoundedRect(x0, y, w, BAR_H, 1.2);
      g.fillStyle(MOSAIC.wellLo, 1);
      g.fillRoundedRect(x0 + 0.7, y + 0.7, w - 1.4, BAR_H - 1.4, 0.9);
      const fw = (w - 1.4) * Math.max(0, Math.min(1, f));
      if (fw > 0.3) {
        g.fillStyle(c, 1);
        g.fillRoundedRect(x0 + 0.7, y + 0.7, fw, BAR_H - 1.4, 0.9);
      }
    };
    bar(this.barGeom.hp, i.hp, MOSAIC.terra);
    bar(this.barGeom.mor, i.morale, i.routed ? MOSAIC.inkDisabled : MOSAIC.teal);
  }

  /** The long-press legend (R3): what the glyph and the bars mean, and the Standard. */
  private legend(): string[] {
    const i = this.info;
    if (!i) return [];
    const lab = barLabels(barsSeen(this.scene));
    const out: string[] = [];
    if (i.state) out.push(t(`readout.tip.${i.state}`));
    if (i.standard) out.push(t('readout.tip.standard'));
    out.push(t('readout.tip.bars', { hp: lab.hp, mor: lab.mor }));
    return out;
  }
}

/**
 * A group's numeral on a small stone plate with a bronze rim (gold when its
 * card is selected), 6.5 UI px caps: the card's numeral (R3), on the
 * portrait's corner.
 */
function numeralPlate(scene: Phaser.Scene, x: number, y: number, numeral: string, selected: boolean): Phaser.GameObjects.Container {
  const c = scene.add.container(Math.round(x), Math.round(y));
  const w = Math.max(10, Math.ceil(mw(numeral, 'rGold', CARD_TEXT)) + 5);
  const h = 9;
  const g = scene.add.graphics();
  g.fillStyle(MOSAIC.ink, 1);
  g.fillRoundedRect(0, 0, w, h, 2);
  g.fillStyle(selected ? MOSAIC.meanderHi : MOSAIC.bronzeHi, 1);
  g.fillRoundedRect(0.6, 0.6, w - 1.2, h - 1.2, 1.8);
  g.fillStyle(MOSAIC.stone1, 1);
  g.fillRoundedRect(1.6, 1.6, w - 3.2, h - 3.2, 1.2);
  const num = addText(scene, w / 2, h / 2 - 3.6, numeral, 'rGold', 0.5).setFontSize(CARD_TEXT);
  // the line box (9.3 tall at 6.5) runs past the 9-tall plate; the caps sit inside it
  uiFrame(num, c, w, h + 4, 0, -2);
  c.add([g, num]);
  c.setSize(w, h);
  return c;
}

/**
 * The focus reticle (controls.md R3.2): a ring with four ticks across it, in
 * cream over a dark ink outline (the range ring's look), so it reads on parchment and on the lightest
 * and darkest ground alike (A11Y-03), and as a shape, not a colour (A11Y-04).
 * `w`: the gold line's width.
 */
export function strokeReticle(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, w = 1): void {
  const pass = (lw: number, color: number) => {
    g.lineStyle(lw, color, 1);
    g.strokeCircle(cx, cy, r);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.lineBetween(cx + dx * r * 0.45, cy + dy * r * 0.45, cx + dx * r * 1.45, cy + dy * r * 1.45);
  };
  pass(w * 2.4, MOSAIC.ink);
  pass(w, MOSAIC.cream);
}

/** The focus reticle as its own object (a group card's corner). */
export function reticle(scene: Phaser.Scene, cx: number, cy: number, r: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  strokeReticle(g, cx, cy, r * 0.8, 0.9);
  return g;
}

/** The colour of a man fighting alone ('*'), who has no group colour: neutral stone. */
export const NO_GROUP_COLOR = 0x8a7a6a;

/** A group's battle colour from its numeral (I red, II green, III blue, IV bronze: the army sheet's). */
export function numeralColour(numeral: string): number {
  return GROUP_COLOR[ROMAN.indexOf(numeral)] ?? NO_GROUP_COLOR;
}

/** Width (UI px) of a group's numeral badge (numeralBadge). */
export function orderBadgeW(numeral: string): number {
  return Math.max(16, Math.ceil(mw(numeral, 'rGold', 6.5)) + 8);
}

/**
 * The order bar's plate (controls.md R1.3, PLAY C3): the selected group's
 * colour round and between the keys, inside an ink rim. Drawn under the keys
 * (`w` x `h` is their row); numeralBadge names the group beside it, so the
 * colour is never the only sign (A11Y-04).
 */
export function orderBarPlate(scene: Phaser.Scene, x: number, y: number, w: number, h: number, numeral: string): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics({ x: Math.round(x), y: Math.round(y) });
  g.fillStyle(MOSAIC.ink, 1);
  g.fillRoundedRect(-2.5, -2.5, w + 5, h + 5, 3);
  g.fillStyle(numeralColour(numeral), 1);
  g.fillRoundedRect(-1.5, -1.5, w + 3, h + 3, 2.5);
  return g;
}

/** A group's numeral on a stone plate framed in its colour (the order bar's badge), `h` tall. */
export function numeralBadge(scene: Phaser.Scene, x: number, y: number, h: number, numeral: string): Phaser.GameObjects.Container {
  const c = scene.add.container(Math.round(x), Math.round(y));
  const w = orderBadgeW(numeral);
  const g = scene.add.graphics();
  g.fillStyle(MOSAIC.ink, 1);
  g.fillRoundedRect(0, 0, w, h, 2.5);
  g.fillStyle(numeralColour(numeral), 1);
  g.fillRoundedRect(1, 1, w - 2, h - 2, 2);
  g.fillStyle(MOSAIC.stone1, 1);
  g.fillRoundedRect(3, 3, w - 6, h - 6, 1.5);
  c.add(g);
  const num = addText(scene, w / 2, h / 2 - 3.6, numeral, 'rGold', 0.5).setFontSize(6.5);
  uiFrame(num, c, w, h);
  c.add(num);
  c.setSize(w, h);
  uiId(c, 'battle.orders.group');
  return c;
}
