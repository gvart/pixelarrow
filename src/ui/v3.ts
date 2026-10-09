/**
 * The v3 component layer (docs/UI_KIT.md "v3 components"):
 * the pieces the redesigned screens are built from, on top of the kit
 * (src/ui/kit.ts) and its widgets. Everything is a Phaser Container (or adds
 * plain objects to one), sizes are UI px, every tap target is at least 22 UI px
 * (44 pt) and every animation goes through src/ui/motion.ts (off under
 * Settings → Reduce motion).
 *
 * - `ScreenHeader`: title, one back arrow (only outside Telegram, whose header
 *   BackButton does the job), labelled icon actions on the right.
 * - `InfoChip` / `resourceChip`: an icon and a number (tabular, counts up), tap
 *   for what it is; one icon and colour per resource (tokens RESOURCES).
 * - `addTipLine`: a compact contextual tip (dismissible) instead of a banner.
 * - `ProgressBar`, `Toggle`, `Stepper`, `Pager` (+ `addSwipe`), `addLocked`,
 *   `openSheet` (bottom sheet), `purchaseButton` + `confirmPurchase` (real
 *   money: Telegram blue, "Stars", always confirmed), `flyReward`.
 */
import Phaser from 'phaser';
import { Button, addIcon, addText, mosaicPanelImage, panelImage, panelK, panelTexture, scaleIcon, tappable, uiMetrics, SHADOW_FONTS, type FontKey } from './kit';
import { RS } from '../platform/renderScale';
import { renderMedallion } from '../art/smoothUi';
import { hintStore, showTooltip, shadeTap, addSheetTitle, type Modal, type UiScene } from './widgets';
import { inkify, ownSkin } from './inkSkin';
import { uiBlocker, uiFrame, uiId } from './layout';
import { ellipsize, measureText, wrapText, LINE_H } from './textfit';
import { ACCENT, MOSAIC, MOTION, RESOURCES, SURFACE, type ResourceId } from './tokens';
import { motion, pulse, tweenTo } from './motion';
import { navLayer, showInGameBack } from '../platform/nav';
import { haptic } from '../platform/telegram';
import type { SmoothStyle } from '../art/smoothUi';
import { t, type TKey } from '../i18n';

type C = Phaser.GameObjects.Container;

// ================================================================== surfaces

/** A material surface (riveted card, raised card, selected, locked, well) added to `parent`. */
export function addCard(scene: Phaser.Scene, parent: C, x: number, y: number, w: number, h: number, style: SmoothStyle = 'card'): Phaser.GameObjects.Image {
  const img = panelImage(scene, Math.round(x), Math.round(y), w, h, style);
  parent.add(img);
  return img;
}

/** A section heading: the title in Cormorant SC, an optional right-hand note, a bronze hairline under it. Returns the y below. */
export function addSection(scene: Phaser.Scene, parent: C, x: number, y: number, w: number, title: string, right?: { text: string; font?: FontKey }): number {
  let rw = 0;
  if (right) {
    const r = addText(scene, x + w, y + 1, right.text, right.font ?? 'sec', 1);
    parent.add(r);
    rw = r.width + 8;
  }
  parent.add(addText(scene, x, y, ellipsize(title, w - rw, false, 7, 'head'), 'head'));
  parent.add(scene.add.rectangle(x, y + 11, w, 1, SURFACE.line).setOrigin(0, 0));
  return y + 15;
}

// ================================================================== header

export const HEADER_H = 30;

export interface HeaderAction {
  icon: string;
  /** Always shown under the icon (no unlabelled icon buttons). */
  label: string;
  onClick: () => void;
  badge?: number | string;
  id?: string;
  tip?: string;
  /** "You are here": the view this action opened is the one on screen (lit bronze, a bar under it). */
  active?: boolean;
}

export interface HeaderOpts {
  title: string;
  /** Back one level. Drawn only outside Telegram (its BackButton runs the same handler through nav.ts). */
  back?: (() => void) | null;
  actions?: HeaderAction[];
  /**
   * Resource chips on the right of the band (before the actions), laid right
   * to left. Where they do not fit whole their words drop first (the number
   * never does); chips that still do not fit are left in `overflow` for the
   * screen to lay under the header.
   */
  chips?: InfoChipOpts[];
  /** A small muted line under the title (the demo marker); a tap shows `noteTip`. */
  note?: string;
  noteTip?: string;
  id?: string;
}

/**
 * The one header of every redesigned screen: a dark bronze band, the title,
 * a back arrow outside Telegram, labelled actions on the right. Full width,
 * HEADER_H tall at y = 0.
 */
export class ScreenHeader extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h = HEADER_H;
  readonly buttons: Button[] = [];
  /** The chips laid in the band, in the order given. */
  readonly chips: InfoChip[] = [];
  /** Chips that did not fit in the band (their options; lay them under the header). */
  readonly overflow: InfoChipOpts[] = [];

  constructor(scene: Phaser.Scene, w: number, o: HeaderOpts) {
    super(scene, 0, 0);
    this.w = Math.round(w);
    this.add(mosaicPanelImage(scene, 0, 0, this.w, this.h, 'topBar'));
    let x = 6;
    if (o.back && showInGameBack()) {
      const b = new Button(scene, 3, 3, 26, 24, { icon: 'chevL', label: t('v3.back'), iconOnly: true, variant: 'secondary', id: `${o.id ?? 'header'}.back`, onClick: o.back });
      this.add(b);
      this.buttons.push(b);
      x = 33;
    }
    // actions from the right: icon over its word
    let right = this.w - 3;
    const withChips = !!o.chips?.length;
    for (const a of [...(o.actions ?? [])].reverse()) {
      const bw = Math.max(withChips ? 28 : 30, Math.min(48, measureText(a.label, false, 6) + 8));
      right -= bw;
      const b = new Button(scene, right, 2, bw, 26, { icon: a.icon, label: a.label, variant: 'secondary', style: a.active ? 'buttonSel' : undefined, id: a.id, tip: a.tip, onClick: a.onClick });
      this.add(b);
      this.buttons.push(b);
      if (a.active) this.add(scene.add.rectangle(right + 4, this.h - 3, bw - 8, 2, ACCENT.goldHi).setOrigin(0, 0));
      if (a.badge !== undefined && a.badge !== 0) this.add(new BadgeDot(scene, right + bw - 5, 5, a.badge));
      right -= withChips ? 2 : 3;
    }
    // chips: whole where they fit, else without their words, else left for the screen (the title keeps ~ 56 UI px)
    const chipOpts = o.chips ?? [];
    if (chipOpts.length) {
      const minTitle = Math.min(56, measureText(o.title, true, 8, 'roman') + 4);
      const room = right - x - minTitle - 4;
      const gap = 3;
      const widthOf = (c: InfoChipOpts, words: boolean) => InfoChip.measure(words ? c : { ...c, word: undefined, lead: undefined });
      let words = true;
      let n = chipOpts.length;
      const total = (k: number, wds: boolean) => chipOpts.slice(0, k).reduce((a, c) => a + widthOf(c, wds) + gap, 0);
      if (total(n, true) > room) words = false;
      while (n > 0 && total(n, words) > room) n--;
      let cx = right;
      for (let i = n - 1; i >= 0; i--) {
        const c = chipOpts[i];
        const chip = new InfoChip(scene, 0, 0, { ...(words ? c : { ...c, word: undefined, lead: undefined }), h: 22 });
        cx -= chip.w;
        chip.x = Math.round(cx);
        chip.y = Math.round((this.h - 22) / 2);
        this.add(chip);
        this.chips.unshift(chip);
        cx -= gap;
      }
      this.overflow.push(...chipOpts.slice(n));
      right = cx;
    }
    const tw = right - x - 4;
        // Cinzel gold on the stone band
    const tsize = withChips ? 8 : 9;
    const title = addText(scene, x, o.note ? 4 : withChips ? 8 : 8, ellipsize(o.title, tw, true, tsize, 'roman'), 'rGold').setFontSize(tsize);
    uiFrame(title, this, this.w, this.h);
    this.add(title);
    if (o.note) {
      const nt = addText(scene, x, 20, ellipsize(o.note, tw, false, 5.5), 'muted').setFontSize(5.5);
      uiFrame(nt, this, this.w, this.h);
      this.add(nt);
      if (o.noteTip) {
        const z = scene.add.zone(x, 0, Math.min(tw, Math.max(nt.width, title.width)) + 4, this.h).setOrigin(0, 0).setInteractive();
        uiId(z, `${o.id ?? 'header'}.note`);
        tappable(z, null, () => showTooltip(scene, o.noteTip!, z));
        this.add(z);
      }
    }
    uiId(this, o.id ?? 'header');
    scene.add.existing(this);
  }

  get bottom(): number {
    return this.h;
  }
}

/** A small red count bubble (kept here so the header has no import cycle with widgets' Badge). */
class BadgeDot extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, y: number, n: number | string) {
    super(scene, Math.round(x), Math.round(y));
    const s = typeof n === 'number' ? (n > 99 ? '99+' : `${n}`) : n;
    const w = Math.max(9, measureText(s, true) + 5);
    const g = scene.add.graphics();
    g.fillStyle(0x1a0d06, 1);
    g.fillRoundedRect(-w / 2 - 1, -6, w + 2, 12, 5);
    g.fillStyle(ACCENT.dangerFill, 1);
    g.fillRoundedRect(-w / 2, -5, w, 10, 4);
    const txt = addText(scene, 0, -4, s, 'onAccent', 0.5);
    uiFrame(txt, this, 40, 12, -20, -6);
    this.add([g, txt]);
    scene.add.existing(this);
  }
}

// ================================================================== chips

export interface InfoChipOpts {
  icon?: string;
  value: number | string;
  /** A word after the number ("Glory", "Stars"). */
  word?: string;
  /** A label before the number, to say whose it is ("Warband 9 men"). */
  lead?: string;
  font?: FontKey;
  /** A thin progress line along the chip's bottom (0..1), e.g. XP to the next level. */
  progress?: number;
  /** Tap: this explanation (default), or `onTap`. */
  tip?: string;
  onTap?: () => void;
  id?: string;
  /** Height (default 22: a touch target). */
  h?: number;
}

/**
 * A pill with an icon, a number and an optional word; tap for what it is.
 * `setValue` counts the number up or down.
 */
export class InfoChip extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;
  readonly opts: { label: string };
  private valueText: Phaser.GameObjects.BitmapText;
  private shown: number;
  private counter: Phaser.Tweens.Tween | null = null;
  private listenedDestroy = false;

  /** The width a chip with these options takes (layout before building). */
  static measure(o: InfoChipOpts): number {
    const iw = (o.icon ? 14 : 4) + (o.lead ? measureText(o.lead) + 4 : 0);
    return Math.round(iw + measureText(`${o.value}`) + (o.word ? measureText(o.word) + 4 : 0) + 6);
  }

  constructor(scene: Phaser.Scene, x: number, y: number, o: InfoChipOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.h = o.h ?? 22;
    const valueStr = `${o.value}`;
    this.shown = typeof o.value === 'number' ? o.value : 0;
    const iw0 = o.icon ? 14 : 4;
    const lw = o.lead ? measureText(o.lead) + 4 : 0;
    const iw = iw0 + lw;
    const vw = measureText(valueStr);
    const ww = o.word ? measureText(o.word) + 4 : 0;
    this.w = Math.round(iw + vw + ww + 6);
    this.opts = { label: [o.lead, valueStr, o.word].filter(Boolean).join(' ') };
    this.add(mosaicPanelImage(scene, 0, 0, this.w, this.h, 'chipStone'));
    if (o.icon) this.add(addIcon(scene, 3, Math.round((this.h - 12) / 2), o.icon));
    const ty = Math.round((this.h - 9) / 2) + 1;
    if (o.lead) {
      const lt = addText(scene, iw0 + 1, ty, o.lead, 'sec');
      uiFrame(lt, this, this.w, this.h);
      this.add(lt);
    }
    this.valueText = addText(scene, iw + 1, ty, valueStr, o.font ?? 'ink');
    uiFrame(this.valueText, this, this.w, this.h);
    this.add(this.valueText);
    if (o.word) {
      const wt = addText(scene, iw + 1 + vw + 3, ty, o.word, 'sec');
      uiFrame(wt, this, this.w, this.h);
      this.add(wt);
    }
    if (o.progress !== undefined) {
      const g = scene.add.graphics();
      const pw = this.w - 8;
      g.fillStyle(0x000000, 0.6);
      g.fillRoundedRect(4, this.h - 4, pw, 2, 1);
      g.fillStyle(RESOURCES.xp.color, 1);
      g.fillRoundedRect(4, this.h - 4, Math.max(1, Math.round(pw * Math.max(0, Math.min(1, o.progress)))), 2, 1);
      this.add(g);
    }
    if (o.tip || o.onTap) {
      this.setSize(this.w, this.h);
      this.setInteractive(new Phaser.Geom.Rectangle(this.w / 2, this.h / 2, this.w, this.h), Phaser.Geom.Rectangle.Contains);
      if (o.id) uiId(this, o.id);
      tappable(this, null, () => (o.onTap ? o.onTap() : showTooltip(scene, o.tip!, this)));
    }
    ownSkin(this);
    scene.add.existing(this);
  }

  /** Change the number: it counts there (instantly under reduced motion) and the chip gives a small bump. */
  setValue(n: number): this {
    this.counter?.stop();
    const from = this.shown;
    this.shown = n;
    if (motion.reduced || from === n) {
      this.valueText.setText(`${n}`);
      return this;
    }
    const p = { v: from };
    // the screen may rebuild (and destroy this chip) while it counts: never write into a destroyed text
    const set = (v: number) => this.active && this.valueText.active && this.valueText.setText(`${v}`);
    this.counter = this.scene.tweens.add({
      targets: p,
      v: n,
      duration: MOTION.countUp,
      ease: 'Cubic.easeOut',
      onUpdate: () => set(Math.round(p.v)),
      onComplete: () => set(n),
    });
    this.scene.tweens.add({ targets: this, scale: { from: 1.08, to: 1 }, duration: 220, ease: 'Back.easeOut' });
    if (!this.listenedDestroy) {
      this.listenedDestroy = true;
      this.once('destroy', () => {
        this.counter?.stop();
        this.scene?.tweens.killTweensOf(this);
      });
    }
    return this;
  }
}

/** The options of a resource's chip (for `ScreenHeader.chips`): its icon, its word, its explanation on tap. */
export function resourceChipOpts(res: ResourceId, value: number | string, o: { word?: boolean | string; tipKey?: TKey; id?: string; onTap?: () => void } = {}): InfoChipOpts {
  const word = o.word === true ? t(`res.${res}` as TKey) : typeof o.word === 'string' ? o.word : undefined;
  return { icon: RESOURCES[res].icon, value, word, tip: t(o.tipKey ?? (`res.tip.${res}` as TKey)), id: o.id ?? `chip.${res}`, onTap: o.onTap };
}

/** The chip of a resource: its own icon and colour, its explanation on tap. `tipKey` overrides the explanation (campaign vs war gold). */
export function resourceChip(scene: Phaser.Scene, x: number, y: number, res: ResourceId, value: number | string, o: { word?: boolean | string; tipKey?: TKey; id?: string; onTap?: () => void } = {}): InfoChip {
  const word = o.word === true ? t(`res.${res}` as TKey) : typeof o.word === 'string' ? o.word : undefined;
  return new InfoChip(scene, x, y, { icon: RESOURCES[res].icon, value, word, tip: t(o.tipKey ?? (`res.tip.${res}` as TKey)), id: o.id ?? `chip.${res}`, onTap: o.onTap });
}

/**
 * Chips that fit `w` together: whole where they can; else the words drop,
 * from the last chip to the first (a `lead` label stays: it says whose the
 * number is); chips go only when even the bare numbers do not fit.
 */
export function fitChips(scene: Phaser.Scene, opts: InfoChipOpts[], w: number, gap = 4): InfoChip[] {
  const cur = opts.map((o) => ({ ...o }));
  const total = () => cur.reduce((a, o) => a + InfoChip.measure(o), 0) + gap * Math.max(0, cur.length - 1);
  for (let i = cur.length - 1; i >= 0 && total() > w; i--) if (cur[i].word) cur[i] = { ...cur[i], word: undefined };
  while (cur.length && total() > w) cur.pop();
  return cur.map((o) => new InfoChip(scene, 0, 0, o));
}

/** Lay chips left to right from x; chips that do not fit in w are dropped from the end. Returns the chips placed. */
export function layChips(parent: C, chips: InfoChip[], x: number, y: number, w: number, gap = 4): InfoChip[] {
  const out: InfoChip[] = [];
  let cx = x;
  for (const c of chips) {
    if (cx + c.w > x + w) {
      c.destroy();
      continue;
    }
    // (not setPosition: Phaser's setPosition(x, y, z, w) would zero the chip's `w`)
    c.x = Math.round(cx);
    c.y = Math.round(y);
    parent.add(c);
    out.push(c);
    cx += c.w + gap;
  }
  return out;
}

// ================================================================== tip line

export interface TipLineOpts {
  text: string;
  icon?: string;
  /** info (default, neutral), reward (gold: something to claim), warn (a real problem: red). */
  tone?: 'info' | 'reward' | 'warn';
  /** Dismissible, remembered under this id. */
  dismissId?: string;
  maxLines?: number;
}

/** Whether a dismissible tip was hidden for good. */
export function tipHidden(id: string): boolean {
  const seen = hintStore.seen();
  return seen.includes(`tip:${id}`) || seen.includes('*');
}

/**
 * A compact contextual tip (not a banner): a sunken pill with an icon and at
 * most two lines, an × to hide it for good when `dismissId` is given. Returns
 * its height (0 when hidden).
 */
export function addTipLine(scene: Phaser.Scene, parent: C, x: number, y: number, w: number, o: TipLineOpts): number {
  if (o.dismissId && tipHidden(o.dismissId)) return 0;
  const tone = o.tone ?? 'info';
  const font: FontKey = tone === 'reward' ? 'reward' : tone === 'warn' ? 'bad' : 'sec';
  const xw = o.dismissId ? 22 : 0;
  const wr = wrapText(o.text, w - 22 - xw - 4, o.maxLines ?? 2);
  const h = Math.max(o.dismissId ? 22 : 16, wr.lines.length * LINE_H + 7);
  const c = scene.add.container(Math.round(x), Math.round(y));
  parent.add(c);
  c.add(panelImage(scene, 0, 0, w, h, 'well'));
  c.add(addIcon(scene, 5, Math.round((h - 12) / 2), o.icon ?? (tone === 'reward' ? 'chest' : 'info'), tone === 'info' ? 'D' : ''));
  const txt = addText(scene, 20, Math.round((h - wr.lines.length * LINE_H) / 2) + 1, wr.lines.join('\n'), font);
  uiFrame(txt, c, w, h);
  c.add(txt);
  if (o.dismissId) {
    const id = o.dismissId;
    const b = new Button(scene, w - 22, Math.round((h - 22) / 2), 22, 22, { icon: 'xmark', label: t('v3.dismiss'), iconOnly: true, variant: 'ghost', id: `tip.${id}.close`, onClick: () => {
      hintStore.mark(`tip:${id}`);
      tweenTo(scene, c, { alpha: 0 }, MOTION.fade, { onComplete: () => c.destroy() });
    } });
    c.add(b);
  }
  return h;
}

// ================================================================== progress bar

export interface ProgressOpts {
  value: number;
  max: number;
  color?: number;
  /** Bar thickness (default 5). */
  h?: number;
  /** Words over the bar: on the left (what it measures) and right (where it stands: "35 / 100 XP"). */
  label?: string;
  right?: string;
  labelFont?: FontKey;
}

/** A labelled progress bar that fills smoothly. Height: 11 + h with words, else h. */
export class ProgressBar extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;
  private g: Phaser.GameObjects.Graphics;
  private frac: number;
  private barY: number;
  private barH: number;
  private color: number;
  private rightText: Phaser.GameObjects.BitmapText | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, o: ProgressOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    this.barH = o.h ?? 5;
    this.color = o.color ?? ACCENT.gold;
    const words = !!(o.label || o.right);
    this.barY = words ? 11 : 0;
    this.h = this.barY + this.barH;
    if (o.right) {
      this.rightText = addText(scene, this.w, 0, o.right, 'ink', 1);
      uiFrame(this.rightText, this, this.w, this.h);
      this.add(this.rightText);
    }
    if (o.label) {
      const lt = addText(scene, 0, 0, ellipsize(o.label, this.w - (this.rightText ? this.rightText.width + 6 : 0)), o.labelFont ?? 'sec');
      uiFrame(lt, this, this.w, this.h);
      this.add(lt);
    }
    this.g = scene.add.graphics();
    this.add(this.g);
    this.frac = o.max > 0 ? Math.max(0, Math.min(1, o.value / o.max)) : 0;
    this.draw(this.frac);
    scene.add.existing(this);
  }

  private draw(f: number): void {
    const g = this.g;
    if (!g.active) return;
    const y = this.barY;
    const h = this.barH;
    const r = Math.min(2, h / 2);
    g.clear();
    g.fillStyle(MOSAIC.stone0, 0.85);
    g.fillRoundedRect(0, y, this.w, h, r);
    g.lineStyle(0.6, MOSAIC.parchEdge, 0.9);
    g.strokeRoundedRect(0, y, this.w, h, r);
    const fw = Math.round((this.w - 2) * f);
    if (fw > 0) {
      g.fillStyle(this.color, 1);
      g.fillRoundedRect(1, y + 1, fw, h - 2, Math.max(0, r - 1));
      if (h > 3) {
        g.fillStyle(0xffffff, 0.3);
        g.fillRect(2, y + 1, Math.max(0, fw - 2), 1);
      }
    }
  }

  /** Fill to value / max (smoothly unless reduced motion); `right` updates the words on the right. */
  set(value: number, max: number, right?: string): this {
    const to = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
    if (right !== undefined) this.rightText?.setText(right);
    const p = { f: this.frac };
    this.frac = to;
    tweenTo(this.scene, p, { f: to }, MOTION.countUp, { onUpdate: () => this.draw(p.f) });
    return this;
  }
}

// ================================================================== toggle

export interface ToggleOpts {
  on: boolean;
  onChange: (on: boolean) => void;
  /** What it switches (scripts and the long-press tip). */
  label: string;
  id?: string;
  /** Cannot be switched now, and why (dimmed; a tap says why). */
  disabled?: string;
}

/** A switch (34 x 22 target): a knob that slides over a lit track when on. */
export class Toggle extends Phaser.GameObjects.Container {
  readonly w = 34;
  readonly h = 22;
  readonly opts: { label: string };
  private g: Phaser.GameObjects.Graphics;
  private isOn: boolean;
  private k: { x: number };

  constructor(scene: Phaser.Scene, x: number, y: number, o: ToggleOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.opts = { label: o.label };
    this.isOn = o.on;
    this.k = { x: o.on ? 1 : 0 };
    this.g = scene.add.graphics();
    this.add(this.g);
    this.draw();
    this.setSize(this.w, this.h);
    this.setInteractive(new Phaser.Geom.Rectangle(this.w / 2, this.h / 2, this.w, this.h), Phaser.Geom.Rectangle.Contains);
    uiId(this, o.id ?? `toggle:${o.label}`);
    if (o.disabled) this.setAlpha(0.45);
    tappable(this, null, () => {
      if (o.disabled) {
        showTooltip(scene, o.disabled, this);
        return;
      }
      this.isOn = !this.isOn;
      tweenTo(scene, this.k, { x: this.isOn ? 1 : 0 }, 140, { onUpdate: () => this.draw() });
      this.draw();
      o.onChange(this.isOn);
    });
    scene.add.existing(this);
  }

  get value(): boolean {
    return this.isOn;
  }

  private draw(): void {
    const g = this.g;
    if (!g.active) return;
    const tx = 2;
    const ty = 4;
    const tw = 30;
    const th = 14;
    g.clear();
    g.fillStyle(0x000000, 0.5);
    g.fillRoundedRect(tx, ty + 1, tw, th, 7);
    g.fillStyle(this.isOn ? MOSAIC.bronze : MOSAIC.stone1, 1);
    g.fillRoundedRect(tx, ty, tw, th, 7);
    g.lineStyle(1, this.isOn ? MOSAIC.goldHi : MOSAIC.meanderLo, this.isOn ? 0.95 : 0.9);
    g.strokeRoundedRect(tx + 0.5, ty + 0.5, tw - 1, th - 1, 6.5);
    const kx = tx + 7 + this.k.x * (tw - 14);
    g.fillStyle(0x000000, 0.5);
    g.fillCircle(kx + 0.5, ty + 7.8, 5.6);
    g.fillStyle(this.isOn ? MOSAIC.cream : MOSAIC.slabHi, 1);
    g.fillCircle(kx, ty + 7, 5.4);
    g.fillStyle(0xffffff, 0.35);
    g.fillCircle(kx - 1.5, ty + 5.2, 1.8);
  }
}

// ================================================================== stepper

export interface StepperOpts {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  /** What it sets (tips and ids). */
  label: string;
  id?: string;
  /** Text of the value (default the number). */
  format?: (v: number) => string;
}

/** − value + (70 x 22): the ends switch off at the limits and say so. */
export class Stepper extends Phaser.GameObjects.Container {
  readonly w = 70;
  readonly h = 22;
  private v: number;
  private txt: Phaser.GameObjects.BitmapText;
  private minus: Button;
  private plus: Button;

  constructor(scene: Phaser.Scene, x: number, y: number, private o: StepperOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.v = o.value;
    this.add(mosaicPanelImage(scene, 22, 2, 26, 18, 'parchmentWell'));
    this.txt = addText(scene, 35, 7, '', 'pInk', 0.5);
    uiFrame(this.txt, this, this.w, this.h);
    this.add(this.txt);
    const id = o.id ?? o.label;
    this.minus = new Button(scene, 0, 0, 22, 22, { label: '-', tip: o.label, id: `${id}.down`, onClick: () => this.step(-1) });
    this.plus = new Button(scene, 48, 0, 22, 22, { label: '+', tip: o.label, id: `${id}.up`, onClick: () => this.step(1) });
    this.add([this.minus, this.plus]);
    this.refresh();
    scene.add.existing(this);
  }

  private step(d: number): void {
    const n = Math.max(this.o.min, Math.min(this.o.max, this.v + d));
    if (n === this.v) return;
    this.v = n;
    this.refresh();
    this.o.onChange(n);
  }

  private refresh(): void {
    this.txt.setText(this.o.format ? this.o.format(this.v) : `${this.v}`);
    this.minus.setEnabled(this.v > this.o.min, `${this.o.label}: ${this.o.format ? this.o.format(this.o.min) : this.o.min}`);
    this.plus.setEnabled(this.v < this.o.max, `${this.o.label}: ${this.o.format ? this.o.format(this.o.max) : this.o.max}`);
  }
}

// ================================================================== locked state

export interface LockedOpts {
  title: string;
  icon?: string;
  /** Why it is closed ("Unlocks at duel level 5"). Neutral, never red. */
  reason: string;
  /** How far along the unlock path the player is. */
  progress?: { value: number; max: number; label: string };
  /** What to do to get there (wrapped, two lines). */
  how?: string;
}

/**
 * A locked feature as a card of its own: the lock, the name (muted), why it
 * is closed and the way there (a progress bar and what to do), never live
 * stats of a mode that cannot be played. Returns its height.
 */
export function addLocked(scene: Phaser.Scene, parent: C, x: number, y: number, w: number, o: LockedOpts): number {
  const c = scene.add.container(Math.round(x), Math.round(y));
  parent.add(c);
  const pad = 8;
  let cy = 7;
  if (o.icon) c.add(addIcon(scene, pad, cy, o.icon, 'D'));
  const tx = o.icon ? pad + 16 : pad;
  c.add(addText(scene, tx, cy + 2, ellipsize(o.title, w - tx - 24, false, 7, 'head'), 'muted'));
  c.add(addIcon(scene, w - pad - 12, cy, 'lock', 'D'));
  cy += 17;
  const rw = wrapText(o.reason, w - pad * 2, 2);
  const rt = addText(scene, pad, cy, rw.lines.join('\n'), 'sec');
  uiFrame(rt, c, w, 999);
  c.add(rt);
  cy += rw.lines.length * LINE_H + 4;
  if (o.progress) {
    const pb = new ProgressBar(scene, pad, cy, w - pad * 2, { value: o.progress.value, max: o.progress.max, label: o.progress.label, right: `${o.progress.value} / ${o.progress.max}`, color: ACCENT.gold });
    c.add(pb);
    cy += pb.h + 5;
  }
  if (o.how) {
    const hw = wrapText(o.how, w - pad * 2, 2);
    const ht = addText(scene, pad, cy, hw.lines.join('\n'), 'muted');
    c.add(ht);
    cy += hw.lines.length * LINE_H + 3;
  }
  const h = cy + 4;
  c.addAt(panelImage(scene, 0, 0, w, h, 'cardLocked'), 0);
  for (const o2 of c.list) if (o2 instanceof Phaser.GameObjects.BitmapText) uiFrame(o2, c, w, h);
  return h;
}

// ================================================================== bottom sheet

export interface SheetOpts {
  title?: string;
  /** Height (clamped to the screen). */
  h: number;
  w?: number;
  onClose?: () => void;
  /** A tap on the backdrop closes it (default true; false for decisions). */
  shadeCloses?: boolean;
}

/**
 * A bottom sheet: slides up over a fading backdrop (details, confirmations),
 * closes with Back, a backdrop tap or `close()`, sliding down again. Same
 * shape as `openModal`'s answer, so screens can use either.
 */
export function openSheet(scene: UiScene, o: SheetOpts): Modal {
  const { VW, VH } = scene.m;
  const c = scene.add.container(0, 0);
  scene.ui.add(c);
  const shade = scene.add.rectangle(0, 0, VW, VH, 0x000000, 0.6).setOrigin(0, 0).setInteractive();
  uiBlocker(shade);
  c.add(shade);
  const w = Math.min(o.w ?? 260, VW - 8);
  const h = Math.min(o.h, VH - 12);
  const x = Math.round((VW - w) / 2);
  const y = VH - h;
  const box = scene.add.container(0, 0);
  c.add(box);
  box.add(mosaicPanelImage(scene, x, y, w, h + 10, 'sheet'));
  let top = y + 10;
  if (o.title) top = addSheetTitle(scene, box, x, y, w, o.title, o.shadeCloses !== false ? () => close() : undefined);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    tweenTo(scene, box, { y: h + 12 }, MOTION.sheet * 0.8, { ease: 'Cubic.easeIn' });
    tweenTo(scene, shade, { alpha: 0 }, MOTION.sheet * 0.8, { onComplete: () => c.destroy() });
    o.onClose?.();
  };
  if (o.shadeCloses !== false) shadeTap(shade, { x, y, w, h }, close);
  navLayer(c, close, scene);
  // the content is built for dark surfaces: skin it for the parchment as it arrives
  inkify(box);
  // slide in
  if (!motion.reduced) {
    box.y = h + 12;
    shade.alpha = 0;
    tweenTo(scene, box, { y: 0 }, MOTION.sheet);
    tweenTo(scene, shade, { alpha: 0.6 }, MOTION.sheet);
  }
  return { c: box, x, y, w, h, body: { x: x + 10, y: top, w: w - 20, h: y + h - 8 - top }, close };
}

// ================================================================== pager

export interface PagerOpts {
  index: number;
  count: number;
  onPrev: () => void;
  onNext: () => void;
  /** Words for the arrows (long-press). */
  prevTip?: string;
  nextTip?: string;
}

/** ‹ 2 / 8 ›: chevrons either side of the position (wraps round). Width 80. */
export class Pager extends Phaser.GameObjects.Container {
  readonly w = 80;
  readonly h = 24;

  constructor(scene: Phaser.Scene, x: number, y: number, o: PagerOpts) {
    super(scene, Math.round(x), Math.round(y));
    const one = o.count <= 1;
    const prev = new Button(scene, 0, 0, 26, 24, { icon: 'chevL', label: o.prevTip ?? t('v3.prev'), iconOnly: true, variant: 'ghost', id: 'pager.prev', onClick: o.onPrev });
    const next = new Button(scene, this.w - 26, 0, 26, 24, { icon: 'chevR', label: o.nextTip ?? t('v3.next'), iconOnly: true, variant: 'ghost', id: 'pager.next', onClick: o.onNext });
    if (one) {
      prev.setEnabled(false, o.prevTip ?? t('v3.prev'));
      next.setEnabled(false, o.nextTip ?? t('v3.next'));
    }
    const txt = addText(scene, this.w / 2, 8, t('v3.pager', { i: o.index + 1, n: o.count }), 'ink', 0.5);
    uiFrame(txt, this, this.w, this.h);
    this.add([prev, txt, next]);
    scene.add.existing(this);
  }
}

/** Horizontal swipes on `zone` (an interactive object): left = next, right = previous. */
export function addSwipe(zone: Phaser.GameObjects.GameObject, onLeft: () => void, onRight: () => void, minPx = 40): void {
  let start: { x: number; y: number; t: number } | null = null;
  zone.on('pointerdown', (p: Phaser.Input.Pointer) => (start = { x: p.x, y: p.y, t: p.downTime }));
  zone.on('pointerup', (p: Phaser.Input.Pointer) => {
    const s = start;
    start = null;
    if (!s) return;
    const dx = p.x - s.x;
    const dy = p.y - s.y;
    const scale = (zone.scene?.game.scale.width ?? 1) / Math.max(1, window.innerWidth || 1);
    if (Math.abs(dx) < minPx * scale || Math.abs(dx) < Math.abs(dy) * 1.5 || p.upTime - s.t > 700) return;
    haptic('light');
    if (dx < 0) onLeft();
    else onRight();
  });
}

// ================================================================== real money

/** The real-money button: Telegram blue, the Telegram star and the word "Stars" (never terracotta, never a bare number). */
export function purchaseButton(scene: Phaser.Scene, x: number, y: number, w: number, h: number, o: { stars: number; onClick: () => void; id?: string; tip?: string }): Button {
  return new Button(scene, x, y, w, h, { label: t('res.starsPrice', { n: o.stars }), icon: 'tgstar', inline: true, variant: 'purchase', id: o.id, tip: o.tip ?? t('res.tip.stars'), onClick: o.onClick });
}

/** Every real-money purchase asks first, in a sheet that says it is real money. */
export function confirmPurchase(scene: UiScene, o: { what: string; stars: number; onOk: () => void }): Modal {
  const w = Math.min(scene.m.VW - 8, 240);
  const body = wrapText(t('v3.buyConfirmBody', { what: o.what, n: o.stars }), w - 44, 5);
  const m = openSheet(scene, { title: t('v3.buyConfirmTitle'), h: 30 + body.lines.length * LINE_H + 16 + 26 + 6 + 24 + 16, w, shadeCloses: false });
  const { c, body: b } = m;
  c.add(scaleIcon(addIcon(scene, b.x, b.y + 1, 'tgstar'), 2));
  c.add(addText(scene, b.x + 30, b.y + 2, body.lines.join('\n'), 'ink'));
  let y = b.y + Math.max(26, body.lines.length * LINE_H + 6) + 8;
  c.add(purchaseButton(scene, b.x, y, b.w, 26, { stars: o.stars, id: 'purchase.confirm', onClick: () => (m.close(), o.onOk()) }).setLabel(t('v3.payStars', { n: o.stars })));
  y += 26 + 6;
  c.add(new Button(scene, b.x, y, b.w, 24, { label: t('common.cancel'), variant: 'ghost', id: 'purchase.cancel', onClick: () => m.close() }));
  return m;
}

// ================================================================== reward fly-in

/**
 * A reward flies from (x, y) (UI px) into its chip, which then counts to
 * `value`. Under reduced motion the chip just takes the value.
 */
export function flyReward(scene: UiScene, icon: string, x: number, y: number, chip: InfoChip, value: number): void {
  if (motion.reduced || !chip.scene) {
    chip.setValue(value);
    return;
  }
  const m = chip.getWorldTransformMatrix();
  const S = scene.m.S;
  const tx = m.tx / S + 4;
  const ty = m.ty / S + (chip.h - 12) / 2;
  for (let i = 0; i < 5; i++) {
    const img = scaleIcon(addIcon(scene, x, y, icon), 1.4).setOrigin(0.5, 0.5);
    scene.ui.add(img);
    const delay = i * 60;
    scene.tweens.add({ targets: img, x: tx + 6, y: ty + 6, scale: img.scale * 0.6, duration: 520, delay, ease: 'Cubic.easeIn', onComplete: () => img.destroy() });
  }
  scene.time.delayedCall(520 + 4 * 60, () => chip.scene && chip.setValue(value));
}

/** A soft endless glow on a claimable thing (a rounded rect round x, y, w, h). Returns the glow. */
export function addClaimGlow(scene: Phaser.Scene, parent: C, x: number, y: number, w: number, h: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(ACCENT.goldHi, 0.18);
  g.fillRoundedRect(x - 1, y - 1, w + 2, h + 2, 5);
  g.lineStyle(1, ACCENT.goldHi, 0.9);
  g.strokeRoundedRect(x - 0.5, y - 0.5, w + 1, h + 1, 5);
  parent.add(g);
  pulse(scene, g, 'alpha', 1, 0.35, MOTION.pulse);
  return g;
}

/** Measure a label in a font (shadow fonts are wider). */
export function textW(s: string, font: FontKey = 'ink', size = 7): number {
  return measureText(s, SHADOW_FONTS.has(font), size);
}

// ================================================================== tile

export interface TileOpts {
  icon: string;
  label: string;
  /** A quieter line under the label (dropped when there is no room; the full text is the long-press tip). */
  sub?: string;
  onClick: () => void;
  id?: string;
  badge?: number | string;
  /** Locked, and why: dimmed, a lock, the reason on tap. */
  locked?: string;
  tip?: string;
  /** Raised (the main modes) or a plain card. */
  raised?: boolean;
  /** Icon size in multiples of 12 UI px (default 2). */
  iconScale?: number;
}

/**
 * A big tap target for a destination: a material card, a large icon, the
 * label under it (and a line of context where there is room). Presses like a
 * button (scale, face drop, haptic); carries `opts.label` for scripts.
 */
export class Tile extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;
  readonly opts: { label: string; icon: string };
  private face: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, o: TileOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    this.h = Math.round(h);
    this.opts = { label: o.label, icon: o.icon };
    const style: SmoothStyle = o.locked ? 'cardLocked' : o.raised ? 'cardRaised' : 'card';
    this.face = scene.add.container(this.w / 2, this.h / 2);
    this.add(this.face);
    const L = (obj: Phaser.GameObjects.GameObject & { x: number; y: number }) => {
      obj.x -= this.w / 2;
      obj.y -= this.h / 2;
      this.face.add(obj);
      return obj;
    };
    this.bg = panelImage(scene, 0, 0, this.w, this.h, style);
    L(this.bg);
    const k = o.iconScale ?? 2;
    const isz = 12 * k;
    const showSub = !!o.sub && this.h >= isz + 8 + 11 + 9 + 4;
    const block = isz + 3 + 9 + (showSub ? 9 : 0);
    let cy = Math.round((this.h - block) / 2);
    const icon = scaleIcon(addIcon(scene, Math.round((this.w - isz) / 2), cy, o.icon, o.locked ? 'D' : ''), k);
    L(icon);
    cy += isz + 3;
    const label = ellipsize(o.label, this.w - 8);
    const lt = addText(scene, this.w / 2, cy, label, o.locked ? 'muted' : 'ink', 0.5);
    uiFrame(lt, this, this.w, this.h);
    L(lt);
    let truncated = label !== o.label;
    if (showSub) {
      const sub = ellipsize(o.sub!, this.w - 8, false, 6);
      truncated ||= sub !== o.sub;
      const st = addText(scene, this.w / 2, cy + 10, sub, o.locked ? 'muted' : 'sec', 0.5).setFontSize(6);
      uiFrame(st, this, this.w, this.h);
      L(st);
    }
    if (o.locked) L(addIcon(scene, this.w - 15, 3, 'lock', 'D'));
    if (o.badge !== undefined && o.badge !== 0) this.add(new BadgeDot(scene, this.w - 6, 6, o.badge));
    this.setSize(this.w, this.h);
    this.setInteractive(new Phaser.Geom.Rectangle(this.w / 2, this.h / 2, this.w, this.h), Phaser.Geom.Rectangle.Contains);
    uiId(this, o.id ?? `tile:${o.label}`);
    const press = (on: boolean) => {
      if (!this.scene || o.locked) return;
      this.bg.setTexture(panelTexture(scene, this.w, this.h, on ? 'cardSel' : style));
      this.face.setScale(on && !motion.reduced ? 0.97 : 1);
    };
    this.on('pointerdown', () => press(true));
    this.on('pointerup', () => press(false));
    this.on('pointerout', () => press(false));
    const tip = o.tip ?? (truncated ? [o.label, o.sub].filter(Boolean).join(': ') : undefined);
    tappable(this, null, () => (o.locked ? showTooltip(scene, o.locked, this) : o.onClick()), tip);
    scene.add.existing(this);
  }
}

// ================================================================== legend

export interface LegendItem {
  /** Draws the symbol into `c` with its top-left at (x, y), in a 24 x 14 box. */
  draw: (c: C, x: number, y: number) => void;
  title: string;
  text: string;
}

/** "What do these symbols mean": a sheet with each symbol, its name and a line or two about it. */
export function openLegend(scene: UiScene, title: string, items: LegendItem[]): Modal {
  const w = Math.min(scene.m.VW - 8, 260);
  const inner = w - 20;
  const wraps = items.map((it) => wrapText(it.text, inner - 32, 3));
  const rowsH = wraps.reduce((a, wr) => a + 12 + wr.lines.length * LINE_H + 8, 0);
  const m = openSheet(scene, { title, w, h: 26 + rowsH + 10 + 24 + 16 });
  const { c, body: b } = m;
  let y = b.y;
  items.forEach((it, i) => {
    c.add(panelImage(scene, b.x, y, 26, 18, 'well'));
    it.draw(c, b.x + 1, y + 2);
    c.add(addText(scene, b.x + 32, y, ellipsize(it.title, inner - 32), 'ink'));
    c.add(addText(scene, b.x + 32, y + 11, wraps[i].lines.join('\n'), 'sec'));
    y += 12 + wraps[i].lines.length * LINE_H + 8;
  });
  c.add(new Button(scene, b.x, m.y + m.h - 8 - 24, b.w, 24, { label: t('common.close'), variant: 'ghost', id: 'legend.close', onClick: () => m.close() }));
  return m;
}

// ================================================================== toggle chip

export interface ToggleChipOpts {
  label: string;
  /** The thing it switches on (a mode's icon). */
  icon: string;
  on: boolean;
  onClick: () => void;
  id?: string;
  tip?: string;
  /** Cannot switch now, and why (dimmed; a tap says why). */
  off?: string;
}

/**
 * An on/off choice readable at a glance (Team "Use for"): ON is a filled,
 * lit bronze chip, the mode's icon in colour with a gold check badge and a
 * light label; OFF is an outline only, the icon and label dimmed.
 * At least 22 UI px tall; presses like a button.
 */
export class ToggleChip extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;
  readonly opts: { label: string; icon: string };

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, o: ToggleChipOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    this.h = Math.max(22, Math.round(h));
    this.opts = { label: o.label, icon: o.icon };
    const face = scene.add.container(this.w / 2, this.h / 2);
    this.add(face);
    const L = (obj: Phaser.GameObjects.GameObject & { x: number; y: number }) => {
      obj.x -= this.w / 2;
      obj.y -= this.h / 2;
      face.add(obj);
      return obj;
    };
    const g = scene.add.graphics();
    if (o.on) {
      L(mosaicPanelImage(scene, 0, 0, this.w, this.h, 'btnBronzeOn'));
    } else {
      // outline only: a dark stone track and a muted rim, so ON (the lit bronze) and OFF never look alike
      L(mosaicPanelImage(scene, 0, 0, this.w, this.h, 'track'));
    }
    L(g);
    // the mode's icon (in colour when on), with a gold check badge on its corner when on
    const ix = 5;
    const iy = Math.round((this.h - 12) / 2);
    L(addIcon(scene, ix, iy, o.icon, o.on ? '' : 'D'));
    const mark = scene.add.graphics();
    if (o.on) {
      const cx = ix + 11;
      const cy = iy + 10;
      mark.fillStyle(0x1a0f08, 1);
      mark.fillCircle(cx, cy, 4.6);
      mark.fillStyle(ACCENT.goldHi, 1);
      mark.fillCircle(cx, cy, 3.8);
      mark.lineStyle(1.2, 0x2a1a08, 1);
      mark.beginPath();
      mark.moveTo(cx - 1.9, cy + 0.1);
      mark.lineTo(cx - 0.5, cy + 1.5);
      mark.lineTo(cx + 2, cy - 1.6);
      mark.strokePath();
    }
    L(mark);
    const tx = ix + 12 + 6;
    const lt = addText(scene, tx, Math.round((this.h - 9) / 2) + 1, ellipsize(o.label, this.w - tx - 4), o.on ? 'pInk' : 'muted');
    uiFrame(lt, this, this.w, this.h);
    L(lt);
    ownSkin(this);
    if (o.off) this.setAlpha(0.55);
    this.setSize(this.w, this.h);
    this.setInteractive(new Phaser.Geom.Rectangle(this.w / 2, this.h / 2, this.w, this.h), Phaser.Geom.Rectangle.Contains);
    uiId(this, o.id ?? `togglechip:${o.label}`);
    const press = (down: boolean) => face.setScale(down && !motion.reduced && !o.off ? 0.96 : 1);
    this.on('pointerdown', () => press(true));
    this.on('pointerup', () => press(false));
    this.on('pointerout', () => press(false));
    tappable(this, null, () => (o.off ? showTooltip(scene, o.off, this) : o.onClick()), o.tip);
    scene.add.existing(this);
  }
}

// ================================================================== skill medallion

/**
 * An ability or aura as the battle HUD shows it: its icon in colour on a
 * round bronze medallion, `d` UI px across. States: `learned` (lit, a gold
 * halo), `available` (bronze, a pulsing ring: it can be learned now),
 * `locked` (dark stone, the icon faded but in colour, a lock badge).
 */
export function addMedallion(scene: Phaser.Scene, parent: C, x: number, y: number, d: number, icon: string, state: 'learned' | 'available' | 'locked'): void {
  const K = panelK(scene);
  const css = (K * RS) / uiMetrics(scene).S;
  const look = state === 'learned' ? 'ready' : state === 'available' ? 'idle' : 'cool';
  const halo = 3;
  const key = `medal_${d}_${look}@${K}`;
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, renderMedallion(d, halo, look, K, css))!.setFilter(Phaser.Textures.FilterMode.LINEAR);
  const disc = scene.add.image(Math.round(x - halo), Math.round(y - halo), key).setOrigin(0, 0).setScale(1 / K);
  parent.add(disc);
  const k = (d * 0.6) / 12;
  const ic = scaleIcon(addIcon(scene, x + d / 2, y + d / 2, icon), k).setOrigin(0.5, 0.5);
  if (state === 'locked') ic.setAlpha(0.5);
  parent.add(ic);
  if (state === 'available') {
    const g = scene.add.graphics();
    g.lineStyle(1.2, ACCENT.goldHi, 1);
    g.strokeCircle(x + d / 2, y + d / 2, d / 2 + 1.5);
    parent.add(g);
    pulse(scene, g, 'alpha', 1, 0.3, MOTION.pulse);
  }
  if (state === 'locked') parent.add(scaleIcon(addIcon(scene, x + d - 9, y + d - 9, 'lock', 'D'), 0.75));
}
