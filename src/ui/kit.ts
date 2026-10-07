/** Tiny pixel UI toolkit on top of Phaser: fonts, panels, buttons, meters, scroll lists. */
import Phaser from 'phaser';
import { renderFontAtlas, FONT_LINE_HEIGHT } from '../art/font';
import { ICONS } from '../art/icons';
import { P } from '../art/palette';
import { renderIcon, renderPanel, renderScrollRoll, type PanelStyle } from '../art/uiTextures';
import { hapticSelect } from '../platform/telegram';
import { uiButton } from '../audio/hooks';

export type FontKey = 'ink' | 'light' | 'red' | 'gold' | 'dim' | 'title';

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
  const t = scene.add.bitmapText(Math.round(x), Math.round(y), `font_${font}`, str.toUpperCase(), 7);
  if (maxWidth > 0) t.setMaxWidth(maxWidth);
  t.setOrigin(align, 0);
  return t;
}

export function addIcon(scene: Phaser.Scene, x: number, y: number, name: string, variant: '' | 'L' | 'D' = ''): Phaser.GameObjects.Image {
  return scene.add.image(Math.round(x), Math.round(y), `icon${variant}_${name}`).setOrigin(0, 0);
}

export interface ButtonOpts {
  label?: string;
  icon?: string;
  style?: 'button' | 'buttonSel' | 'buttonOff';
  onClick?: () => void;
  font?: FontKey;
  small?: boolean;
  iconOnly?: boolean;
}

/** Parchment button. Coordinates are in UI pixels inside the scaled UI root. */
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

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, opts: ButtonOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    this.h = Math.round(h);
    this.opts = opts;
    this.bg = scene.add.image(0, 0, panelTexture(scene, this.w, this.h, opts.style ?? 'button')).setOrigin(0, 0);
    this.add(this.bg);
    this.content = scene.add.container(0, 0);
    this.add(this.content);
    this.selected = opts.style === 'buttonSel';
    this.enabled = opts.style !== 'buttonOff';
    this.build();
    this.setSize(this.w, this.h);
    this.setInteractive(new Phaser.Geom.Rectangle(this.w / 2, this.h / 2, this.w, this.h), Phaser.Geom.Rectangle.Contains);
    this.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.enabled) return;
      this.downAt = { x: p.x, y: p.y };
      this.bg.setTexture(panelTexture(scene, this.w, this.h, 'buttonDown'));
      this.content.y = 1;
    });
    const release = () => {
      this.downAt = null;
      this.refreshBg();
      this.content.y = 0;
    };
    this.on('pointerout', release);
    this.on('pointerup', (p: Phaser.Input.Pointer) => {
      const d = this.downAt;
      release();
      if (!d || !this.enabled) return;
      if (Math.abs(p.x - d.x) + Math.abs(p.y - d.y) > 14) return;
      hapticSelect();
      uiButton(this.opts.icon);
      this.opts.onClick?.();
    });
    scene.add.existing(this);
  }

  private build(): void {
    this.content.removeAll(true);
    const scene = this.scene;
    const variant = this.selected ? 'L' : this.enabled ? '' : 'D';
    const font: FontKey = this.selected ? 'light' : this.enabled ? this.opts.font ?? 'ink' : 'dim';
    const hasIcon = !!this.opts.icon;
    const hasLabel = !!this.opts.label;
    if (hasIcon && (!hasLabel || this.opts.iconOnly)) {
      this.iconImg = addIcon(scene, (this.w - 12) / 2, (this.h - 12) / 2 - 1, this.opts.icon!, variant);
      this.content.add(this.iconImg);
    } else if (hasIcon && hasLabel && this.h >= 26) {
      // icon above label
      this.iconImg = addIcon(scene, (this.w - 12) / 2, 3, this.opts.icon!, variant);
      this.labelText = addText(scene, this.w / 2, this.h - 11, this.opts.label!, font, 0.5);
      this.content.add([this.iconImg, this.labelText]);
    } else if (hasIcon && hasLabel) {
      this.labelText = addText(scene, 0, 0, this.opts.label!, font, 0);
      const total = 12 + 3 + this.labelText.width;
      const x0 = Math.round((this.w - total) / 2);
      this.iconImg = addIcon(scene, x0, (this.h - 12) / 2 - 1, this.opts.icon!, variant);
      this.labelText.setPosition(x0 + 15, Math.round((this.h - 8) / 2) - 1);
      this.content.add([this.iconImg, this.labelText]);
    } else if (hasLabel) {
      this.labelText = addText(scene, this.w / 2, Math.round((this.h - 8) / 2) - 1, this.opts.label!, font, 0.5);
      this.content.add(this.labelText);
    }
  }

  private refreshBg(): void {
    const style = !this.enabled ? 'buttonOff' : this.selected ? 'buttonSel' : 'button';
    this.bg.setTexture(panelTexture(this.scene, this.w, this.h, style));
  }

  setSelected(on: boolean): this {
    if (on === this.selected) return this;
    this.selected = on;
    this.refreshBg();
    this.build();
    return this;
  }

  setEnabled(on: boolean): this {
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
      scene.input.off('pointerdown', onDown);
      scene.input.off('pointermove', onMove);
      scene.input.off('pointerup', onUp);
      scene.input.off('wheel', onWheel);
      scene.events.off('update', onUpdate);
    };
    scene.events.once('shutdown', () => this.cleanup());
  }

  private cleanup: () => void = () => {};

  private begin(p: Phaser.Input.Pointer): void {
    if (this.dragging) return;
    this.dragging = true;
    this.moved = false;
    this.lastY = p.y;
    this.startY = p.y;
    this.vel = 0;
  }

  setContentHeight(ch: number): void {
    this.maxScroll = Math.max(0, ch - this.h);
    this.setScroll(this.scroll);
  }

  setScroll(v: number): void {
    this.scroll = Math.max(0, Math.min(this.maxScroll, v));
    this.content.y = Math.round(this.y - this.scroll);
  }

  get scrollY(): number {
    return this.scroll;
  }

  get bounds(): { x: number; y: number; w: number; h: number } {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  destroy(): void {
    this.cleanup();
    this.maskG.destroy();
  }
}

/** A list row that only fires on taps (not drags) inside a ScrollArea. */
export function tappable(obj: Phaser.GameObjects.GameObject, area: ScrollArea | null, onTap: () => void): void {
  let down: { x: number; y: number } | null = null;
  obj.on('pointerdown', (p: Phaser.Input.Pointer) => (down = { x: p.x, y: p.y }));
  obj.on('pointerup', (p: Phaser.Input.Pointer) => {
    if (!down) return;
    const d = Math.abs(p.x - down.x) + Math.abs(p.y - down.y);
    down = null;
    if (d > 14 || (area && area.moved)) return;
    hapticSelect();
    onTap();
  });
}
