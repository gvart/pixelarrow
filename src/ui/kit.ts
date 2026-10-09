/**
 * Tiny pixel UI toolkit on top of Phaser: fonts, panels, buttons, meters,
 * scroll areas. Higher-level components (tabs, lists, cards, item icons,
 * tooltips, toasts, dialogs...) are in widgets.ts; the rules for using them in
 * docs/UI_KIT.md. Everything here registers with the layout check
 * (src/ui/layout.ts) automatically.
 */
import Phaser from 'phaser';
import { renderVectorAtlas, type Face } from '../art/vectorFont';
import { ICONS } from '../art/icons';
import { VECTOR_CAMP_ICONS, VECTOR_ICONS } from '../art/vectorIcons';
import { UI_ICONS } from '../art/uiIcons';
import { paintIcon, type IconLook, type IconPart } from '../art/iconStyle';
import { renderIcon } from '../art/uiTextures';
import { BRONZE_D2, STATUS_D2, TEXT_D2, renderSmoothPanel, type SmoothStyle } from '../art/smoothUi';
import { haptic, hapticNotify } from '../platform/telegram';
import { uiButton, uiError } from '../audio/hooks';
import { breadcrumb } from '../platform/telemetry';
import { t } from '../i18n';
import { ellipsize, measureText } from './textfit';
import { uiClip, uiFrame, uiIgnore, uiMaxWidth } from './layout';
import { RS } from '../platform/renderScale';
import { ACCENT, RESOURCES, TEXT } from './tokens';
import { motion } from './motion';

export type FontKey =
  | 'ink' | 'light' | 'red' | 'gold' | 'dim' | 'title' | 'good' | 'head'
  // v3 (src/ui/tokens.ts): secondary and muted text, text on accents, the resource colours, errors
  | 'sec' | 'muted' | 'onAccent' | 'reward' | 'glory' | 'premium' | 'bad' | 'xp' | 'power' | 'stars' | 'headL';

export interface UIMetrics {
  S: number;
  VW: number;
  VH: number;
}

export function uiMetrics(scene: Phaser.Scene): UIMetrics {
  const W = scene.scale.width;
  const H = scene.scale.height;
  // whole UI px per CSS px, chosen on the CSS size; the canvas is RS x denser (src/platform/renderScale.ts)
  const S = Math.max(2, Math.min(4, Math.floor(Math.min(W / RS / 190, H / RS / 400)))) * RS;
  return { S, VW: Math.floor(W / S), VH: Math.floor(H / S) };
}

/** Text colours on the Bronze & Stone surfaces (src/art/smoothUi.ts): light ink on dark stone. */
const FONT_COLORS: Record<FontKey, [number, number | undefined]> = {
  ink: [TEXT_D2.tx, undefined],
  light: [TEXT_D2.onBtn, 0x1a0d06],
  red: [0xe08a6e, undefined],
  gold: [BRONZE_D2.hi, 0x120e0b],
  dim: [0x9d8f78, undefined],
  title: [TEXT_D2.tx, 0x120e0b],
  good: [STATUS_D2.good, undefined],
  // section headings and names: Cormorant SC in bronze (measure with face 'head')
  head: [BRONZE_D2.hi, undefined],
  sec: [TEXT.secondary, undefined],
  muted: [TEXT.muted, undefined],
  onAccent: [TEXT.onAccent, 0x2a0f08],
  reward: [ACCENT.gold, undefined],
  glory: [RESOURCES.glory.color, undefined],
  premium: [RESOURCES.drachmae.color, undefined],
  bad: [ACCENT.danger, undefined],
  xp: [RESOURCES.xp.color, undefined],
  power: [RESOURCES.power.color, undefined],
  stars: [RESOURCES.stars.color, undefined],
  // titles: Cormorant SC in the primary text colour
  headL: [TEXT.primary, undefined],
};
const FONT_FACE: Partial<Record<FontKey, Face>> = { head: 'head', headL: 'head' };

/**
 * Register a bitmap font `key` drawn from a vector face (src/art/vectorFont.ts)
 * at this screen's density. Glyphs are smooth, so the atlas samples linearly.
 */
export function registerVectorFont(scene: Phaser.Scene, key: string, color: number, shadow?: number, face: Face = 'body'): void {
  if (scene.textures.exists(key)) return;
  const K = Math.max(2, Math.ceil(uiMetrics(scene).S));
  const { canvas, glyphs, lineH, size } = renderVectorAtlas(color, shadow, K, face);
  scene.textures.addCanvas(key, canvas)!.setFilter(Phaser.Textures.FilterMode.LINEAR);
  const tw = canvas.width;
  const th = canvas.height;
  const chars: Record<number, unknown> = {};
  for (const g of glyphs) {
    chars[g.ch.charCodeAt(0)] = {
      x: g.x, y: g.y, width: g.w, height: g.h, centerX: Math.floor(g.w / 2), centerY: Math.floor(g.h / 2),
      xOffset: g.xOffset, yOffset: g.yOffset, xAdvance: g.xAdvance, data: {}, kerning: {},
      u0: g.x / tw, v0: g.y / th, u1: (g.x + g.w) / tw, v1: (g.y + g.h) / th,
    };
  }
  scene.cache.bitmapFont.add(key, { data: { retroFont: true, font: key, size, lineHeight: lineH, chars }, texture: key, frame: null });
}

/** Register fonts and icon textures once per game. */
export function registerUiAssets(scene: Phaser.Scene): void {
  if (scene.textures.exists('font_ink')) return;
  for (const key of Object.keys(FONT_COLORS) as FontKey[]) {
    const [color, shadow] = FONT_COLORS[key];
    registerVectorFont(scene, `font_${key}`, color, shadow, FONT_FACE[key]);
  }
  // smooth icons first (src/art/vectorIcons.ts); a name with no vector form keeps its pixel icon
  const K = panelK(scene);
  const vec: [string, IconPart[]][] = [...Object.entries(VECTOR_ICONS), ...Object.entries(UI_ICONS), ...Object.entries(VECTOR_CAMP_ICONS).map(([k, d]): [string, IconPart[]] => [`camp_${k}`, d])];
  for (const [name, d] of vec) {
    registerVectorIcon(scene, `icon_${name}`, name, d, 'full', K);
    registerVectorIcon(scene, `iconL_${name}`, name, d, 'light', K);
    registerVectorIcon(scene, `iconD_${name}`, name, d, 'dim', K);
  }
  for (const [name, rows] of Object.entries(ICONS)) {
    if (scene.textures.exists(`icon_${name}`)) continue;
    scene.textures.addCanvas(`icon_${name}`, renderIcon(rows, BRONZE_D2.hi, BRONZE_D2.mid).toCanvas());
    scene.textures.addCanvas(`iconL_${name}`, renderIcon(rows, TEXT_D2.onBtn, 0xd8b88a).toCanvas());
    scene.textures.addCanvas(`iconD_${name}`, renderIcon(rows, TEXT_D2.tx3, BRONZE_D2.lo).toCanvas());
  }
}

/**
 * Atlas px per UI px of panel textures: they are drawn at the screen's
 * density (src/art/smoothUi.ts), so an image showing one is scaled by
 * 1 / panelK (use `panelImage`, or keep that scale when calling setTexture).
 */
export function panelK(scene: Phaser.Scene): number {
  return Math.max(2, Math.ceil(uiMetrics(scene).S));
}

export function panelTexture(scene: Phaser.Scene, w: number, h: number, style: SmoothStyle): string {
  w = Math.max(6, Math.round(w));
  h = Math.max(6, Math.round(h));
  const K = panelK(scene);
  const key = `panel_${style}_${w}x${h}@${K}`;
  if (!scene.textures.exists(key)) {
    const css = (K * RS) / uiMetrics(scene).S;
    scene.textures.addCanvas(key, renderSmoothPanel(w, h, style, K, css))!.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
  return key;
}

/** Panel textures at least this big (atlas px) are dropped once nothing shows them (full-screen and modal backs). */
const SWEEP_MIN_PX = 512 * 512;

/**
 * Frees the big panel textures no game object shows any more. Panels are cached
 * by size, and a full-screen one is ~10 MB at 3x: every screen height the
 * WebView reported (Telegram expanding, full screen, a rotation) and every
 * modal size would otherwise stay in memory for the whole session. Each use
 * goes through panelTexture(), which draws a dropped panel again.
 */
export function sweepPanels(game: Phaser.Game): number {
  const used = new Set<string>();
  const walk = (list: Phaser.GameObjects.GameObject[]) => {
    for (const o of list) {
      const key = (o as { texture?: Phaser.Textures.Texture }).texture?.key;
      if (key) used.add(key);
      const kids = (o as { list?: Phaser.GameObjects.GameObject[] }).list;
      if (Array.isArray(kids)) walk(kids);
    }
  };
  for (const sc of game.scene.scenes) if (sc.sys.displayList) walk(sc.sys.displayList.list);
  let freed = 0;
  for (const key of game.textures.getTextureKeys()) {
    if (!key.startsWith('panel_') || used.has(key)) continue;
    const src = game.textures.get(key).source[0];
    if (!src || src.width * src.height < SWEEP_MIN_PX) continue;
    game.textures.remove(key);
    freed++;
  }
  return freed;
}

/** An image of a panel texture, scaled to UI px (origin top-left). */
export function panelImage(scene: Phaser.Scene, x: number, y: number, w: number, h: number, style: SmoothStyle): Phaser.GameObjects.Image {
  return scene.add.image(x, y, panelTexture(scene, w, h, style)).setOrigin(0, 0).setScale(1 / panelK(scene));
}

export function addPanel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, style: SmoothStyle = 'parch'): Phaser.GameObjects.Image {
  return panelImage(scene, Math.round(x), Math.round(y), w, h, style);
}

/** A title plaque (it was a parchment scroll): a stone panel with a fine bronze rule inside. */
export function addScroll(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, w: number, h: number): void {
  parent.add(addPanel(scene, x, y, w, h, 'parch'));
  const g = scene.add.graphics();
  g.lineStyle(0.5, BRONZE_D2.lo, 1);
  g.strokeRoundedRect(x + 2.5, y + 2.5, w - 5, h - 5, 2.5);
  parent.add(g);
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
  const txt = scene.add.bitmapText(Math.round(x), Math.round(y), `font_${font}`, str, 7);
  if (maxWidth > 0) {
    txt.setMaxWidth(maxWidth);
    uiMaxWidth(txt, maxWidth);
  }
  txt.setOrigin(align, 0);
  return txt;
}

/** Fonts drawn with a 1 px drop shadow (one pixel wider). */
export const SHADOW_FONTS: ReadonlySet<FontKey> = new Set<FontKey>(['light', 'gold', 'title', 'onAccent']);

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

/** Icon edge in UI px (the pixel icons' size; smooth icons are drawn denser and scaled down to it). */
export const ICON_PX = 12;

/** Paint an icon from its parts (24 x 24 box) at K atlas px per UI px (src/art/iconStyle.ts). */
function registerVectorIcon(scene: Phaser.Scene, key: string, name: string, d: IconPart[], look: IconLook, K: number): void {
  if (scene.textures.exists(key)) return;
  scene.textures.addCanvas(key, paintIcon(name, d, look, ICON_PX * K))!.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

export function addIcon(scene: Phaser.Scene, x: number, y: number, name: string, variant: '' | 'L' | 'D' = ''): Phaser.GameObjects.Image {
  const img = scene.add.image(Math.round(x), Math.round(y), `icon${variant}_${name}`).setOrigin(0, 0);
  // smooth icons are denser than their 12 UI px: show them at that size
  if (img.width > ICON_PX) img.setScale(ICON_PX / img.width);
  return img;
}

/** Scale an icon `n` times its standard size (works for smooth and pixel icons alike). */
export function scaleIcon(img: Phaser.GameObjects.Image, n: number): Phaser.GameObjects.Image {
  return img.setScale((n * ICON_PX) / Math.max(1, img.width));
}

/** 'ghost': a quiet outlined action; 'purchase': real money (Telegram Stars), its own blue. */
export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost' | 'purchase';

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
  /** Icon beside the label even on tall buttons (default: above it from 26 tall). */
  inline?: boolean;
  /** A second, quieter line under the label (buttons 26 tall and up with an icon: icon at the left, two lines beside it). */
  sub?: string;
}

/** Long-press and feedback hooks; widgets.ts installs the tooltip and toast. */
export const longPress = {
  ms: 450,
  show: null as null | ((scene: Phaser.Scene, text: string, anchor: Phaser.GameObjects.GameObject) => void),
  toast: null as null | ((scene: Phaser.Scene, text: string) => void),
};

/** A pending long-press: `remove()` cancels it. */
export interface HoldTimer {
  remove(): void;
}

/** Longest frame that counts in full towards a long-press (longer ones are stalls). */
export const HOLD_FRAME_CAP = 100;

/**
 * Calls `cb` once the finger has been held for `ms` of *smooth* frame time.
 * A stalled frame (a slow phone, a texture upload, software WebGL) counts as
 * at most HOLD_FRAME_CAP ms, so a quick tap that happens to straddle a long
 * frame is still a tap, never a long-press (the same rule as the slingshot's
 * dwell in BattleScene.checkDwell).
 */
export function holdTimer(scene: Phaser.Scene, ms: number, cb: () => void): HoldTimer {
  let held = 0;
  let live = true;
  const onUpdate = (_t: number, delta: number) => {
    held += Math.min(delta, HOLD_FRAME_CAP);
    if (held < ms) return;
    stop();
    cb();
  };
  const stop = () => {
    if (!live) return;
    live = false;
    scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, stop);
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, stop);
  return { remove: stop };
}

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
  /** Background and content, centred on the button so a press scales it about its middle. */
  private face: Phaser.GameObjects.Container;
  private content: Phaser.GameObjects.Container;
  private labelText?: Phaser.GameObjects.BitmapText;
  private iconImg?: Phaser.GameObjects.Image;
  private opts: ButtonOpts;
  private selected = false;
  private enabled = true;
  private downAt: { x: number; y: number } | null = null;
  private pressTimer: HoldTimer | null = null;
  private longPressed = false;
  private truncated = false;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, opts: ButtonOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    this.h = Math.round(h);
    this.opts = opts;
    this.selected = opts.style === 'buttonSel';
    this.enabled = opts.style !== 'buttonOff';
    this.face = scene.add.container(this.w / 2, this.h / 2);
    this.add(this.face);
    this.bg = panelImage(scene, -this.w / 2, -this.h / 2, this.w, this.h, this.baseStyle());
    this.face.add(this.bg);
    this.content = scene.add.container(-this.w / 2, -this.h / 2);
    this.face.add(this.content);
    this.build();
    this.setSize(this.w, this.h);
    this.setInteractive(new Phaser.Geom.Rectangle(this.w / 2, this.h / 2, this.w, this.h), Phaser.Geom.Rectangle.Contains);
    if (opts.id) (this as unknown as { __uiId?: string }).__uiId = opts.id;
    this.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.downAt = { x: p.x, y: p.y };
      this.longPressed = false;
      this.pressTimer?.remove();
      this.pressTimer = holdTimer(scene, longPress.ms, () => {
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
      // the face sinks onto its lip and gives a little under the finger
      this.content.y = -this.h / 2 + 2;
      if (!motion.reduced) this.face.setScale(0.97);
    });
    this.on('pointerout', () => this.release());
    this.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.downAt && p.isDown && Math.abs(p.x - this.downAt.x) + Math.abs(p.y - this.downAt.y) > 14 * RS) this.release();
    });
    this.on('pointerup', (p: Phaser.Input.Pointer) => {
      const d = this.downAt;
      const long = this.longPressed;
      this.release();
      if (!d || long) return;
      if (Math.abs(p.x - d.x) + Math.abs(p.y - d.y) > 14 * RS) return;
      if (!this.enabled) {
        uiError();
        hapticNotify('warning');
        longPress.toast?.(scene, this.opts.disabledReason ?? t('kit.disabled'));
        return;
      }
      haptic('light');
      uiButton(this.opts.icon);
      // Crash-report breadcrumb: the button's id or icon only (labels may hold player names).
      breadcrumb('ui', `tap ${this.opts.id ?? this.opts.icon ?? '?'}`);
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
    this.content.y = -this.h / 2;
    this.face.setScale(1);
  }

  private tipText(): string | undefined {
    if (this.opts.tip) return this.opts.tip;
    if (!this.enabled && this.opts.disabledReason) return this.opts.disabledReason;
    if (this.opts.label && (this.truncated || this.opts.iconOnly)) return this.opts.label;
    return undefined;
  }

  /** Primary = terracotta, selected = lit bronze, destructive = stone, else bronze. */
  private baseStyle(): SmoothStyle {
    if (!this.enabled) return 'buttonOff';
    if (this.opts.variant === 'purchase') return 'buttonBuy';
    if (this.opts.variant === 'primary') return 'buttonSel';
    if (this.opts.variant === 'ghost' && !this.selected) return 'buttonGhost';
    if (this.selected) return 'buttonOn';
    if (this.opts.variant === 'destructive') return 'buttonDanger';
    return 'button';
  }

  private downStyle(): SmoothStyle {
    const b = this.baseStyle();
    return b === 'buttonSel' ? 'buttonSelDown' : b === 'buttonOn' ? 'buttonOnDown' : b === 'buttonDanger' ? 'buttonDangerDown' : b === 'buttonBuy' ? 'buttonBuyDown' : b === 'buttonGhost' ? 'buttonGhostDown' : 'buttonDown';
  }

  private isLight(): boolean {
    const b = this.baseStyle();
    return b === 'buttonSel' || b === 'buttonDanger' || b === 'buttonOn' || b === 'buttonBuy';
  }

  private build(): void {
    this.content.removeAll(true);
    this.labelText = undefined;
    this.iconImg = undefined;
    const scene = this.scene;
    const light = this.isLight();
    // the Telegram star keeps its own colours on the purchase blue
    const variant = this.opts.variant === 'purchase' && this.enabled ? '' : light ? 'L' : this.enabled ? '' : 'D';
    const font: FontKey = !this.enabled ? 'dim' : light ? 'light' : this.opts.font ?? 'ink';
    const shadow = SHADOW_FONTS.has(font);
    const hasIcon = !!this.opts.icon;
    const hasLabel = !!this.opts.label;
    const stacked = hasIcon && hasLabel && this.h >= 26 && !this.opts.inline && !this.opts.iconOnly;
    // words under an icon, and small buttons, use the smaller text size
    const size = stacked || this.opts.small ? 6 : 7;
    const lh = (8 * size) / 7;
    this.truncated = false;
    const fit = (maxW: number) => {
      const full = this.opts.label!;
      const out = ellipsize(full, maxW, shadow, size);
      this.truncated = out !== full;
      return out;
    };
    const iconCentered = () => {
      this.iconImg = addIcon(scene, (this.w - 12) / 2, (this.h - 12) / 2 - 1, this.opts.icon!, variant);
      this.content.add(this.iconImg);
    };
    if (hasIcon && (!hasLabel || this.opts.iconOnly)) {
      iconCentered();
    } else if (hasIcon && hasLabel && this.opts.sub && this.h >= 26) {
      // the icon at the left, the label over its quieter second line
      const x0 = 5;
      const tx = x0 + 15;
      const room = this.w - tx - 4;
      this.iconImg = addIcon(scene, x0, (this.h - 12) / 2 - 1, this.opts.icon!, variant);
      this.labelText = addText(scene, tx, Math.round((this.h - 16) / 2) - 1, fit(room), font, 0).setFontSize(7);
      const subFont: FontKey = !this.enabled ? 'dim' : light ? 'light' : 'dim';
      const sub = addText(scene, tx, Math.round((this.h - 16) / 2) + 8, ellipsize(this.opts.sub, room, SHADOW_FONTS.has(subFont), 5), subFont, 0).setFontSize(5);
      uiFrame(sub, this, this.w, this.h);
      this.content.add([this.iconImg, this.labelText, sub]);
    } else if (hasIcon && hasLabel && this.h >= 26 && !this.opts.inline) {
      // icon above label
      this.iconImg = addIcon(scene, (this.w - 12) / 2, 3, this.opts.icon!, variant);
      this.labelText = addText(scene, this.w / 2, this.h - 11, fit(this.w - 4), font, 0.5).setFontSize(size);
      this.content.add([this.iconImg, this.labelText]);
    } else if (hasIcon && hasLabel) {
      const room = this.w - 6 - 15;
      const label = fit(room);
      if (this.truncated && room < 20) {
        // no room for words: icon only, the label becomes the long-press tip
        iconCentered();
      } else {
        this.labelText = addText(scene, 0, 0, label, font, 0).setFontSize(size);
        const total = 12 + 3 + measureText(label, shadow, size);
        const x0 = Math.round((this.w - total) / 2);
        this.iconImg = addIcon(scene, x0, (this.h - 12) / 2 - 1, this.opts.icon!, variant);
        this.labelText.setPosition(x0 + 15, (this.h - lh) / 2 - 1);
        this.content.add([this.iconImg, this.labelText]);
      }
    } else if (hasLabel) {
      this.labelText = addText(scene, this.w / 2, (this.h - lh) / 2 - 1, fit(this.w - 6), font, 0.5).setFontSize(size);
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
    this.fillStyle(BRONZE_D2.lo, 1);
    this.fillRect(0, 0, this.w, this.h);
    this.fillStyle(0x0d0a08, 1);
    this.fillRect(0.5, 0.5, this.w - 1, this.h - 1);
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
      if (Math.abs(p.y - this.startY) > 10 * RS) this.moved = true;
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
    const onShutdown = () => this.cleanup();
    this.cleanup = () => {
      liveAreas.delete(this);
      scene.input.off('pointerdown', onDown);
      scene.input.off('pointermove', onMove);
      scene.input.off('pointerup', onUp);
      scene.input.off('wheel', onWheel);
      scene.events.off('update', onUpdate);
      // a list rebuilt on every tab switch must not pile up shutdown listeners
      scene.events.off('shutdown', onShutdown);
    };
    scene.events.once('shutdown', onShutdown);
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

  /** Stop following the finger (a drag-and-drop took over the gesture). */
  cancelDrag(): void {
    this.dragging = false;
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
  let timer: HoldTimer | null = null;
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
      timer = holdTimer(scene, longPress.ms, () => {
        timer = null;
        const text = typeof tip === 'function' ? tip() : tip;
        if (!down || (area && area.moved) || !text || !obj.scene) return;
        long = true;
        haptic('light');
        longPress.show!(scene, text, obj);
      });
  });
  obj.on('pointermove', (p: Phaser.Input.Pointer) => {
    if (down && Math.abs(p.x - down.x) + Math.abs(p.y - down.y) > 14 * RS) stop();
  });
  obj.on('pointerout', stop);
  obj.on('pointerup', (p: Phaser.Input.Pointer) => {
    stop();
    if (!down || long) return;
    const d = Math.abs(p.x - down.x) + Math.abs(p.y - down.y);
    down = null;
    if (d > 14 * RS || (area && area.moved)) return;
    haptic('light');
    uiButton();
    onTap();
  });
  obj.once('destroy', stop);
}
