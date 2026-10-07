/**
 * Tiny pixel UI toolkit on top of Phaser: fonts, panels, buttons, meters,
 * scroll areas. Higher-level components (tabs, lists, cards, item icons,
 * tooltips, toasts, dialogs...) are in widgets.ts; the rules for using them in
 * docs/UI_KIT.md. Everything here registers with the layout check
 * (src/ui/layout.ts) automatically.
 */
import Phaser from 'phaser';
import { renderFontAtlas, FONT_LINE_HEIGHT } from '../art/font';
import { ICONS } from '../art/icons';
import { P } from '../art/palette';
import { renderIcon, renderPanel, renderScrollRoll, type PanelStyle } from '../art/uiTextures';
import { haptic, hapticNotify, hapticSelect } from '../platform/telegram';
import { uiButton, uiError } from '../audio/hooks';
import { t } from '../i18n';
import { ellipsize, measureText } from './textfit';
import { uiClip, uiFrame, uiIgnore, uiMaxWidth } from './layout';

export type FontKey = 'ink' | 'light' | 'red' | 'gold' | 'dim' | 'title' | 'good';

export interface UIMetrics {
  S: number;
  VW: number;
  VH: number;
}

export function uiMetrics(scene: Phaser.Scene): UIMetrics {
  const W = scene.scale.width;
  const H = scene.scale.height;
  const S = Math.max(2, Math.min(4, Math.floor(Math.min(W / 190, H / 400))));
  return { S, VW: Math.floor(W / S), VH: Math.floor(H / S) };
}

const FONT_COLORS: Record<FontKey, [number, number | undefined]> = {
  ink: [P.ink, undefined],
  light: [P.cream, P.redDark],
  red: [P.inkRed, undefined],
  gold: [P.gold, 0x3a2410],
  dim: [0x8a6a5c, undefined],
  title: [P.cream, P.ink],
  good: [0x3f7a2e, undefined],
};

/** Register fonts and icon textures once per game. */
export function registerUiAssets(scene: Phaser.Scene): void {
  if (scene.textures.exists('font_ink')) return;
  for (const key of Object.keys(FONT_COLORS) as FontKey[]) {
    const [color, shadow] = FONT_COLORS[key];
    const { canvas, glyphs } = renderFontAtlas(color, shadow);
    const tkey = `font_${key}`;
    scene.textures.addCanvas(tkey, canvas);
    const frame = scene.textures.getFrame(tkey);
    const tw = frame.source.width;
    const th = frame.source.height;
    const chars: Record<number, unknown> = {};
    const h = FONT_LINE_HEIGHT;
    for (const g of glyphs) {
      chars[g.ch.charCodeAt(0)] = {
        x: g.x,
        y: g.y,
        width: g.w,
        height: h,
        centerX: Math.floor(g.w / 2),
        centerY: Math.floor(h / 2),
        xOffset: 0,
        yOffset: 0,
        xAdvance: g.w + 1 - (shadow !== undefined ? 1 : 0),
        data: {},
        kerning: {},
        u0: g.x / tw,
        v0: g.y / th,
        u1: (g.x + g.w) / tw,
        v1: (g.y + h) / th,
      };
    }
    // Lowercase letters render with the uppercase glyphs.
    for (let cc = 97; cc <= 122; cc++) if (!chars[cc] && chars[cc - 32]) chars[cc] = chars[cc - 32];
    // ... and so do Cyrillic ones (а..я -> А..Я, ё -> Ё).
    for (let cc = 0x430; cc <= 0x44f; cc++) if (!chars[cc] && chars[cc - 0x20]) chars[cc] = chars[cc - 0x20];
    if (chars[0x401]) chars[0x451] = chars[0x401];
    const data = { retroFont: true, font: tkey, size: 7, lineHeight: h + 1, chars };
    scene.cache.bitmapFont.add(tkey, { data, texture: tkey, frame: null });
  }
  for (const [name, rows] of Object.entries(ICONS)) {
    scene.textures.addCanvas(`icon_${name}`, renderIcon(rows, P.inkRed, P.parchShade).toCanvas());
    scene.textures.addCanvas(`iconL_${name}`, renderIcon(rows, P.cream, 0xd08070).toCanvas());
    scene.textures.addCanvas(`iconD_${name}`, renderIcon(rows, 0x9a8070, 0xc8b0a0).toCanvas());
  }
}

export function panelTexture(scene: Phaser.Scene, w: number, h: number, style: PanelStyle): string {
  w = Math.max(6, Math.round(w));
  h = Math.max(6, Math.round(h));
  const key = `panel_${style}_${w}x${h}`;
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, renderPanel(w, h, style).toCanvas());
  return key;
}

export function addPanel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, style: PanelStyle = 'parch'): Phaser.GameObjects.Image {
  return scene.add.image(Math.round(x), Math.round(y), panelTexture(scene, w, h, style)).setOrigin(0, 0);
}

export function addScroll(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, w: number, h: number): void {
  parent.add(addPanel(scene, x, y + 3, w, h - 6, 'parch'));
  const key = `roll_${w + 8}`;
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, renderScrollRoll(w + 8).toCanvas());
  parent.add(scene.add.image(x - 4, y - 2, key).setOrigin(0, 0));
  parent.add(scene.add.image(x - 4, y + h - 6, key).setOrigin(0, 0));
}

export function addText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  str: string,
  font: FontKey = 'ink',
  align: 0 | 0.5 | 1 = 0,
  maxWidth = 0,
): Phaser.GameObjects.BitmapText {
  const txt = scene.add.bitmapText(Math.round(x), Math.round(y), `font_${font}`, str.toUpperCase(), 7);
  if (maxWidth > 0) {
    txt.setMaxWidth(maxWidth);
    uiMaxWidth(txt, maxWidth);
  }
  txt.setOrigin(align, 0);
  return txt;
}

/** Fonts drawn with a 1 px drop shadow (one pixel wider). */
export const SHADOW_FONTS: ReadonlySet<FontKey> = new Set<FontKey>(['light', 'gold', 'title']);

/**
 * Shortens a one-line text until it fits the width, ending it with "…". The
 * full text stays in the object's data (`fullText`) for a tooltip.
 */
export function fitText(txt: Phaser.GameObjects.BitmapText, w: number): Phaser.GameObjects.BitmapText {
  if (txt.width <= w) return txt;
  txt.setData('fullText', txt.text);
  let str = txt.text;
  while (str.length > 1 && txt.width > w) {
    str = str.slice(0, -1).trimEnd();
    txt.setText(str + '…');
  }
  return txt;
}

export function addIcon(scene: Phaser.Scene, x: number, y: number, name: string, variant: '' | 'L' | 'D' = ''): Phaser.GameObjects.Image {
  return scene.add.image(Math.round(x), Math.round(y), `icon${variant}_${name}`).setOrigin(0, 0);
}

export type ButtonVariant = 'primary' | 'secondary' | 'destructive';

export interface ButtonOpts {
  label?: string;
  icon?: string;
  /** Legacy look: 'buttonSel' = selected / primary, 'buttonOff' = disabled. */
  style?: 'button' | 'buttonSel' | 'buttonOff';
  /**
   * One primary action per screen (filled red); secondary actions are
   * outlined parchment (the default); destructive actions are dark wine and
   * confirm first (see `confirmDialog` in widgets.ts).
   */
  variant?: ButtonVariant;
  onClick?: () => void;
  font?: FontKey;
  small?: boolean;
  iconOnly?: boolean;
  /** Long-press text. Defaults to the full label when it was shortened, or to the disabled reason. */
  tip?: string;
  /** Why the button is disabled: shown on tap (a disabled button always says why). */
  disabledReason?: string;
  /** Element id for the layout check (defaults to the label's i18n key / icon). */
  id?: string;
}

/** Long-press and feedback hooks; widgets.ts installs the tooltip and toast. */
export const longPress = {
  ms: 450,
  show: null as null | ((scene: Phaser.Scene, text: string, anchor: Phaser.GameObjects.GameObject) => void),
  toast: null as null | ((scene: Phaser.Scene, text: string) => void),
};

/**
 * Parchment button. Coordinates are in UI pixels inside the scaled UI root.
 * Press state, click sound and haptic on every tap; long-press shows the tip;
 * a disabled button explains why on tap. Labels that do not fit end in "…"
 * (the full label becomes the long-press tip). `opts.label` keeps the full,
 * unshortened label (scripts find buttons by it).
 */
export class Button extends Phaser.GameObjects.Container {
  w: number;
  h: number;
  private bg: Phaser.GameObjects.Image;
  private content: Phaser.GameObjects.Container;
  private labelText?: Phaser.GameObjects.BitmapText;
  private iconImg?: Phaser.GameObjects.Image;
  private opts: ButtonOpts;
  private selected = false;
  private enabled = true;
  private downAt: { x: number; y: number } | null = null;
  private pressTimer: Phaser.Time.TimerEvent | null = null;
  private longPressed = false;
  private truncated = false;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, opts: ButtonOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    this.h = Math.round(h);
    this.opts = opts;
    this.selected = opts.style === 'buttonSel';
    this.enabled = opts.style !== 'buttonOff';
    this.bg = scene.add.image(0, 0, panelTexture(scene, this.w, this.h, this.baseStyle())).setOrigin(0, 0);
    this.add(this.bg);
    this.content = scene.add.container(0, 0);
    this.add(this.content);
    this.build();
    this.setSize(this.w, this.h);
    this.setInteractive(new Phaser.Geom.Rectangle(this.w / 2, this.h / 2, this.w, this.h), Phaser.Geom.Rectangle.Contains);
    if (opts.id) (this as unknown as { __uiId?: string }).__uiId = opts.id;
    this.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.downAt = { x: p.x, y: p.y };
      this.longPressed = false;
      this.pressTimer?.remove();
      this.pressTimer = scene.time.delayedCall(longPress.ms, () => {
        this.pressTimer = null;
        if (!this.downAt || !this.scene) return;
        const tip = this.tipText();
        if (!tip || !longPress.show) return;
        this.longPressed = true;
        haptic('light');
        longPress.show(scene, tip, this);
        this.release(true);
      });
      if (!this.enabled) return;
      this.bg.setTexture(panelTexture(scene, this.w, this.h, this.downStyle()));
      this.content.y = 1;
    });
    this.on('pointerout', () => this.release());
    this.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.downAt && p.isDown && Math.abs(p.x - this.downAt.x) + Math.abs(p.y - this.downAt.y) > 14) this.release();
    });
    this.on('pointerup', (p: Phaser.Input.Pointer) => {
      const d = this.downAt;
      const long = this.longPressed;
      this.release();
      if (!d || long) return;
      if (Math.abs(p.x - d.x) + Math.abs(p.y - d.y) > 14) return;
      if (!this.enabled) {
        uiError();
        hapticNotify('warning');
        longPress.toast?.(scene, this.opts.disabledReason ?? t('kit.disabled'));
        return;
      }
      hapticSelect();
      uiButton(this.opts.icon);
      this.opts.onClick?.();
    });
    this.once('destroy', () => this.pressTimer?.remove());
    scene.add.existing(this);
  }

  private release(keepLong = false): void {
    this.downAt = null;
    this.pressTimer?.remove();
    this.pressTimer = null;
    if (!keepLong) this.longPressed = false;
    if (!this.scene) return;
    this.refreshBg();
    this.content.y = 0;
  }

  private tipText(): string | undefined {
    if (this.opts.tip) return this.opts.tip;
    if (!this.enabled && this.opts.disabledReason) return this.opts.disabledReason;
    if (this.opts.label && (this.truncated || this.opts.iconOnly)) return this.opts.label;
    return undefined;
  }

  private baseStyle(): PanelStyle {
    if (!this.enabled) return 'buttonOff';
    if (this.selected || this.opts.variant === 'primary') return 'buttonSel';
    if (this.opts.variant === 'destructive') return 'buttonDanger';
    return 'button';
  }

  private downStyle(): PanelStyle {
    const b = this.baseStyle();
    return b === 'buttonSel' ? 'buttonSelDown' : b === 'buttonDanger' ? 'buttonDangerDown' : 'buttonDown';
  }

  private isLight(): boolean {
    const b = this.baseStyle();
    return b === 'buttonSel' || b === 'buttonDanger';
  }

  private build(): void {
    this.content.removeAll(true);
    this.labelText = undefined;
    this.iconImg = undefined;
    const scene = this.scene;
    const light = this.isLight();
    const variant = light ? 'L' : this.enabled ? '' : 'D';
    const font: FontKey = !this.enabled ? 'dim' : light ? 'light' : this.opts.font ?? 'ink';
    const shadow = SHADOW_FONTS.has(font);
    const hasIcon = !!this.opts.icon;
    const hasLabel = !!this.opts.label;
    this.truncated = false;
    const fit = (maxW: number) => {
      const full = this.opts.label!.toUpperCase();
      const out = ellipsize(full, maxW, shadow);
      this.truncated = out !== full;
      return out;
    };
    const iconCentered = () => {
      this.iconImg = addIcon(scene, (this.w - 12) / 2, (this.h - 12) / 2 - 1, this.opts.icon!, variant);
      this.content.add(this.iconImg);
    };
    if (hasIcon && (!hasLabel || this.opts.iconOnly)) {
      iconCentered();
    } else if (hasIcon && hasLabel && this.h >= 26) {
      // icon above label
      this.iconImg = addIcon(scene, (this.w - 12) / 2, 3, this.opts.icon!, variant);
      this.labelText = addText(scene, this.w / 2, this.h - 11, fit(this.w - 6), font, 0.5);
      this.content.add([this.iconImg, this.labelText]);
    } else if (hasIcon && hasLabel) {
      const room = this.w - 6 - 15;
      const label = fit(room);
      if (this.truncated && room < 20) {
        // no room for words: icon only, the label becomes the long-press tip
        iconCentered();
      } else {
        this.labelText = addText(scene, 0, 0, label, font, 0);
        const total = 12 + 3 + measureText(label, shadow);
        const x0 = Math.round((this.w - total) / 2);
        this.iconImg = addIcon(scene, x0, (this.h - 12) / 2 - 1, this.opts.icon!, variant);
        this.labelText.setPosition(x0 + 15, Math.round((this.h - 8) / 2) - 1);
        this.content.add([this.iconImg, this.labelText]);
      }
    } else if (hasLabel) {
      this.labelText = addText(scene, this.w / 2, Math.round((this.h - 8) / 2) - 1, fit(this.w - 6), font, 0.5);
      this.content.add(this.labelText);
    }
    if (this.labelText) uiFrame(this.labelText, this, this.w, this.h);
  }

  private refreshBg(): void {
    this.bg.setTexture(panelTexture(this.scene, this.w, this.h, this.baseStyle()));
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  get label(): string | undefined {
    return this.opts.label;
  }

  setSelected(on: boolean): this {
    if (on === this.selected) return this;
    this.selected = on;
    this.refreshBg();
    this.build();
    return this;
  }

  /** Enable or disable; `reason` is what a tap on the disabled button says. */
  setEnabled(on: boolean, reason?: string): this {
    if (reason !== undefined) this.opts.disabledReason = reason;
    if (on === this.enabled) return this;
    this.enabled = on;
    this.refreshBg();
    this.build();
    return this;
  }

  setLabel(label: string): this {
    this.opts.label = label;
    this.build();
    return this;
  }

  setIcon(icon: string): this {
    this.opts.icon = icon;
    this.build();
    return this;
  }

  setTip(tip: string | undefined): this {
    this.opts.tip = tip;
    return this;
  }

  setOnClick(cb: () => void): this {
    this.opts.onClick = cb;
    return this;
  }
}

/** Horizontal meter drawn with a Graphics object (UI pixels). */
export class Meter extends Phaser.GameObjects.Graphics {
  w: number;
  h: number;
  color: number;
  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, color: number) {
    super(scene, { x: Math.round(x), y: Math.round(y) });
    this.w = w;
    this.h = h;
    this.color = color;
    scene.add.existing(this);
  }

  setValue(v: number, max: number, color = this.color): this {
    const f = max > 0 ? Math.max(0, Math.min(1, v / max)) : 0;
    this.clear();
    this.fillStyle(P.ink, 1);
    this.fillRect(0, 0, this.w, this.h);
    this.fillStyle(0x6b4a40, 1);
    this.fillRect(1, 1, this.w - 2, this.h - 2);
    const fw = Math.round((this.w - 2) * f);
    if (fw > 0) {
      this.fillStyle(color, 1);
      this.fillRect(1, 1, fw, this.h - 2);
      if (this.h > 3) {
        this.fillStyle(0xffffff, 0.25);
        this.fillRect(1, 1, fw, 1);
      }
    }
    return this;
  }
}

/**
 * Vertically scrolling list region. Children are added to `content`. Uses a
 * geometry mask in screen space; drag to scroll with a little inertia.
 */
/** Live scroll areas (the layout check scrolls them to the end to check the rest). */
const liveAreas = new Set<ScrollArea>();

/** Scroll every live scroll area of active scenes to `v` (clamped); returns how many can scroll. */
export function scrollAllAreas(v: number): number {
  let n = 0;
  for (const a of liveAreas) {
    if (!a.isActive()) continue;
    if (a.maxScrollY > 0) n++;
    a.setScroll(v);
  }
  return n;
}

export class ScrollArea {
  readonly content: Phaser.GameObjects.Container;
  private maskG: Phaser.GameObjects.Graphics;
  private scroll = 0;
  private maxScroll = 0;
  private vel = 0;
  private dragging = false;
  private lastY = 0;
  private startY = 0;
  moved = false;
  private zone: Phaser.GameObjects.Zone;

  constructor(
    scene: Phaser.Scene,
    parent: Phaser.GameObjects.Container,
    private x: number,
    private y: number,
    private w: number,
    private h: number,
    S: number,
  ) {
    this.content = scene.add.container(x, y);
    parent.add(this.content);
    this.maskG = scene.make.graphics({}, false);
    this.maskG.fillStyle(0xffffff);
    this.maskG.fillRect(x * S, y * S, w * S, h * S);
    this.content.setMask(this.maskG.createGeometryMask());
    this.zone = scene.add.zone(x, y, w, h).setOrigin(0, 0).setInteractive();
    parent.addAt(this.zone, 0);
    // The layout check clips rows to the viewport and ignores the drag zone itself.
    uiClip(this.content, this.zone);
    uiIgnore(this.zone);
    this.zone.on('pointerdown', (p: Phaser.Input.Pointer) => this.begin(p));
    const onDown = (p: Phaser.Input.Pointer) => {
      const lx = p.x / S;
      const ly = p.y / S;
      if (lx >= x && lx <= x + w && ly >= y && ly <= y + h) this.begin(p);
    };
    const onMove = (p: Phaser.Input.Pointer) => {
      if (!this.dragging || !p.isDown) return;
      const dy = (p.y - this.lastY) / S;
      this.lastY = p.y;
      if (Math.abs(p.y - this.startY) > 10) this.moved = true;
      this.vel = dy;
      this.setScroll(this.scroll - dy);
    };
    const onUp = () => {
      this.dragging = false;
    };
    const onWheel = (_p: unknown, _o: unknown, _dx: number, dy: number) => this.setScroll(this.scroll + dy * 0.3);
    const onUpdate = () => {
      if (!this.dragging && Math.abs(this.vel) > 0.1) {
        this.setScroll(this.scroll - this.vel);
        this.vel *= 0.9;
      }
    };
    scene.input.on('pointerdown', onDown);
    scene.input.on('pointermove', onMove);
    scene.input.on('pointerup', onUp);
    scene.input.on('wheel', onWheel);
    scene.events.on('update', onUpdate);
    this.cleanup = () => {
      liveAreas.delete(this);
      scene.input.off('pointerdown', onDown);
      scene.input.off('pointermove', onMove);
      scene.input.off('pointerup', onUp);
      scene.input.off('wheel', onWheel);
      scene.events.off('update', onUpdate);
    };
    scene.events.once('shutdown', () => this.cleanup());
    liveAreas.add(this);
  }

  private cleanup: () => void = () => {};

  /** Still on screen (its scene runs and its content is visible). */
  isActive(): boolean {
    const s = this.content.scene;
    if (!s || !s.sys.isActive()) return false;
    let o: Phaser.GameObjects.Container | null = this.content;
    while (o) {
      if (!o.visible) return false;
      o = o.parentContainer;
    }
    return true;
  }

  private begin(p: Phaser.Input.Pointer): void {
    if (this.dragging) return;
    this.dragging = true;
    this.moved = false;
    this.lastY = p.y;
    this.startY = p.y;
    this.vel = 0;
  }

  private listeners: ((scroll: number, max: number) => void)[] = [];
  private contentH = 0;

  /** Called after every scroll change (and content height change). */
  onScroll(cb: (scroll: number, max: number) => void): void {
    this.listeners.push(cb);
  }

  setContentHeight(ch: number): void {
    this.contentH = ch;
    this.maxScroll = Math.max(0, ch - this.h);
    this.setScroll(this.scroll, true);
  }

  get contentHeight(): number {
    return this.contentH;
  }

  get maxScrollY(): number {
    return this.maxScroll;
  }

  get viewHeight(): number {
    return this.h;
  }

  setScroll(v: number, force = false): void {
    const next = Math.max(0, Math.min(this.maxScroll, v));
    if (next === this.scroll && !force) return;
    this.scroll = next;
    this.content.y = Math.round(this.y - this.scroll);
    for (const cb of this.listeners) cb(this.scroll, this.maxScroll);
  }

  get scrollY(): number {
    return this.scroll;
  }

  get bounds(): { x: number; y: number; w: number; h: number } {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  destroy(): void {
    liveAreas.delete(this);
    this.cleanup();
    this.maskG.destroy();
  }
}

/**
 * A list row that only fires on taps (not drags) inside a ScrollArea, with
 * the click sound and a haptic. `tip`: long-press text (tooltip).
 */
export function tappable(obj: Phaser.GameObjects.GameObject, area: ScrollArea | null, onTap: () => void, tip?: string | (() => string | undefined)): void {
  let down: { x: number; y: number } | null = null;
  let timer: Phaser.Time.TimerEvent | null = null;
  let long = false;
  const scene = obj.scene;
  const stop = () => {
    timer?.remove();
    timer = null;
  };
  obj.on('pointerdown', (p: Phaser.Input.Pointer) => {
    down = { x: p.x, y: p.y };
    long = false;
    stop();
    if (tip && longPress.show)
      timer = scene.time.delayedCall(longPress.ms, () => {
        timer = null;
        const text = typeof tip === 'function' ? tip() : tip;
        if (!down || (area && area.moved) || !text || !obj.scene) return;
        long = true;
        haptic('light');
        longPress.show!(scene, text, obj);
      });
  });
  obj.on('pointermove', (p: Phaser.Input.Pointer) => {
    if (down && Math.abs(p.x - down.x) + Math.abs(p.y - down.y) > 14) stop();
  });
  obj.on('pointerout', stop);
  obj.on('pointerup', (p: Phaser.Input.Pointer) => {
    stop();
    if (!down || long) return;
    const d = Math.abs(p.x - down.x) + Math.abs(p.y - down.y);
    down = null;
    if (d > 14 || (area && area.moved)) return;
    hapticSelect();
    uiButton();
    onTap();
  });
  obj.once('destroy', stop);
}
