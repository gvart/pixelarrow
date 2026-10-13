/**
 * Parchment content of the v4 screens: card, section title, profile card, quest
 * card, fresco banner and list row (V4_SPEC "Visual reference"). Positions are
 * UI px inside the screen's UI root; each is a Container with `w` and `h`.
 */
import Phaser from 'phaser';
import { addIcon, panelK, scaleIcon } from '../kit';
import { uiId } from '../layout';

import { MOSAIC, SPACE, TEXT_MIN, lineHeight } from '../tokens';
import { MBadge, centeredFace, makePressable, midY, mosaicImage, mtext, mw, put, wrapWords } from './base';
import { addCover } from './raster';
import type { Box } from './ScreenFrame';

type Scene = Phaser.Scene;

// ================================================================== card

export interface ParchmentCardOpts {
  /** The picked one: lighter with a bronze rim. */
  selected?: boolean;
  id?: string;
}

/** A parchment card: cream paper with an inked edge. Add content to it (in its own coordinates); `body` is the padded inside. */
export class ParchmentCard extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;
  readonly area: Box;

  constructor(scene: Scene, x: number, y: number, w: number, h: number, o: ParchmentCardOpts = {}) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    this.h = Math.round(h);
    this.area = { x: SPACE.lg, y: SPACE.md, w: this.w - SPACE.lg * 2, h: this.h - SPACE.md * 2 };
    this.add(mosaicImage(scene, 0, 0, this.w, this.h, o.selected ? 'parchmentSel' : 'parchment'));
    if (o.id) uiId(this, o.id);
    scene.add.existing(this);
  }
}

// ================================================================== section title

export const SECTION_TITLE_H = 18;

/** A Cinzel title in ink with a fine rule under it ("Campaign Hub"). */
export class SectionTitle extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h = SECTION_TITLE_H;

  constructor(scene: Scene, x: number, y: number, w: number, text: string, o: { size?: number } = {}) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    const size = o.size ?? 10;
    this.add(mtext(scene, this.w / 2, 0, text, 'rInk', { size, align: 0.5, maxW: this.w - 8, box: { owner: this, w: this.w, h: this.h } }));
    const g = scene.add.graphics();
    g.lineStyle(0.7, MOSAIC.parchEdge, 0.7);
    g.lineBetween(Math.round(this.w * 0.08), this.h - 2, Math.round(this.w * 0.92), this.h - 2);
    this.add(g);
    scene.add.existing(this);
  }
}

// ================================================================== profile card

export interface StatItem {
  icon: string;
  text: string;
}
export interface StatLine extends StatItem {
  /** A second item at the right of the same row (gold left, trophies right). */
  right?: StatItem;
}

export interface ProfileCardOpts {
  /** Texture key of the painted portrait (src/ui/mosaic/raster.ts); plain parchment when missing. */
  portrait?: string;
  name: string;
  subtitle?: string;
  /** Up to 3 lines with small icons. */
  stats?: StatLine[];
  /** Portrait side, UI px (default 40 on a card 160 wide or more, else 32). */
  portraitSize?: number;
  /** The stat lines under the portrait, across the whole card (a pair keeps one row); 'auto': only when beside it a pair would split. */
  statsBelow?: boolean | 'auto';
  id?: string;
}

const STAT_H = 13;
// never under the 13 CSS px floor (A11Y-09): a pair that does not fit goes on two rows
const STAT_SIZES = [7, TEXT_MIN];

/** One row of a profile card: one or two items with the text size that makes them fit whole. */
interface StatRow {
  items: { item: StatItem; w: number }[];
  size: number;
}

/**
 * Rows of stat lines for a text column `tw` wide. Numbers are never cut: a pair that does not fit
 * at any size goes on two rows, and a single item shrinks before it is ever shortened.
 */
export function statRows(stats: StatLine[], tw: number): StatRow[] {
  const need = (it: StatItem, size: number) => 14 + mw(it.text, 'pInk', size);
  const rows: StatRow[] = [];
  for (const s of stats) {
    const fitting = (items: StatItem[]) => STAT_SIZES.find((z) => items.reduce((a, it) => a + need(it, z), 0) + (items.length - 1) * 2 <= tw);
    const pair = s.right ? fitting([s, s.right]) : undefined;
    if (s.right && pair !== undefined) rows.push({ items: [{ item: s, w: need(s, pair) }, { item: s.right, w: need(s.right, pair) }], size: pair });
    else
      for (const it of s.right ? [s, s.right] : [s]) {
        const z = fitting([it]) ?? STAT_SIZES[STAT_SIZES.length - 1];
        rows.push({ items: [{ item: it, w: Math.min(tw, need(it, z)) }], size: z });
      }
  }
  return rows;
}

/** A parchment card: the leader's portrait in a bronze square, the name and up to three stat lines. */
export class ProfileCard extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;

  constructor(scene: Scene, x: number, y: number, w: number, o: ProfileCardOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    const portrait = o.portraitSize ?? (this.w >= 160 ? 40 : 32);
    const px = SPACE.md;
    const tx = px + portrait + SPACE.md + 2;
    const tw = this.w - tx - SPACE.md;
    // stats under the portrait, across the card: the narrow-screen form
    const stats = (o.stats ?? []).slice(0, 3);
    const below = o.statsBelow === 'auto' ? statRows(stats, tw).length > statRows(stats, this.w - px * 2).length : !!o.statsBelow;
    const sx = below ? px : tx;
    const sw = below ? this.w - px * 2 : tw;
    const rows = statRows(stats, sw);
    // the subtitle (a status line): one line at 7 or 6.5, else wrapped at 6.5, never cut (G14)
    const subSize = o.subtitle ? (STAT_SIZES.find((k) => mw(o.subtitle!, 'pInk', k) <= tw) ?? TEXT_MIN) : TEXT_MIN;
    const subLines = o.subtitle ? (mw(o.subtitle, 'pInk', subSize) <= tw ? [o.subtitle] : wrapWords(o.subtitle, tw, (x) => mw(x, 'pInk', TEXT_MIN))) : [];
    const subLH = Math.ceil(lineHeight(TEXT_MIN));
    const subH = subLines.length ? 10 + (subLines.length - 1) * subLH : 0;
    const headH = 11 + subH;
    const statsH = rows.length * STAT_H;
    const textH = below ? Math.max(portrait, headH) + 3 + statsH : headH + statsH;
    this.h = below ? textH + SPACE.md * 2 : Math.max(portrait + SPACE.md * 2, textH + SPACE.md * 2);
    this.add(mosaicImage(scene, 0, 0, this.w, this.h, 'parchment'));
    const py = below ? SPACE.md : Math.round((this.h - portrait) / 2);
    this.add(addCover(scene, px, py, portrait, portrait, o.portrait));
    const g = scene.add.graphics();
    g.lineStyle(1.4, MOSAIC.bronze, 1);
    g.strokeRect(px - 0.5, py - 0.5, portrait + 1, portrait + 1);
    g.lineStyle(0.6, MOSAIC.parchEdge, 1);
    g.strokeRect(px - 1.5, py - 1.5, portrait + 3, portrait + 3);
    this.add(g);
    let ty = below ? SPACE.md + Math.max(0, Math.round((portrait - headH) / 2)) + 1 : Math.round((this.h - textH) / 2) + 1;
    const box = { owner: this as Phaser.GameObjects.Container, w: this.w, h: this.h };
    const nameSize = [8, 7.5, 7, 6.5].find((z) => mw(o.name, 'rInk', z) <= tw) ?? 6.5;
    this.add(mtext(scene, tx, ty, o.name, 'rInk', { size: nameSize, maxW: tw, box }));
    ty += 11;
    subLines.forEach((line, i) => this.add(mtext(scene, tx, ty + i * subLH, line, 'pInk', { size: subSize, maxW: tw, box })));
    ty += subH;
    if (below) ty = SPACE.md + Math.max(portrait, headH) + 3 + 1;
    for (const r of rows) {
      r.items.forEach((it, i) => {
        // a pair: the first at the left, the second at the right edge
        const ix = i === 0 ? sx : sx + sw - it.w;
        this.add(addIcon(scene, ix, ty - 1, it.item.icon));
        this.add(mtext(scene, ix + 14, ty + 1, it.item.text, 'pInk', { size: r.size, maxW: it.w - 14 + 1, box }));
      });
      ty += STAT_H;
    }
    if (o.id) uiId(this, o.id);
    scene.add.existing(this);
  }
}

// ================================================================== quest card

export interface QuestCardOpts {
  title: string;
  total: number;
  done: number;
  /** The next step, centred under the bar. */
  next?: string;
  /** Short screens: the title at the left of a shorter bar, the next step under both. */
  compact?: boolean;
  id?: string;
}

const SEG_H = 13;
const SEG_H_COMPACT = 11;
/** The bar of the one-row form, UI px (four segments of about 9). */
const BAR_COMPACT = 40;

/** A parchment card with a titled, segmented progress bar: done segments gold with a check, open ones dark. */
export class QuestCard extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;

  constructor(scene: Scene, x: number, y: number, w: number, o: QuestCardOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    // the one-row form only when the title fits beside the bar whole (G14: numbers are never cut)
    const room = this.w - SPACE.md * 3 - BAR_COMPACT;
    const compact = !!o.compact && Math.min(mw(o.title, 'rInk', TEXT_MIN), mw(o.title, 'pInk', TEXT_MIN)) <= room;
    const segH = compact ? SEG_H_COMPACT : SEG_H;
    this.h = compact ? SPACE.md + segH + 3 + (o.next ? 10 : 0) + SPACE.md : SPACE.md + 12 + 4 + SEG_H + 6 + (o.next ? 10 : 0) + SPACE.md + 2;
    this.add(mosaicImage(scene, 0, 0, this.w, this.h, 'parchment'));
    const box = { owner: this as Phaser.GameObjects.Container, w: this.w, h: this.h };
    let y0 = SPACE.md + 1;
    let tx: number = SPACE.lg;
    let tw = this.w - SPACE.lg * 2;
    if (compact) {
      // the title at the left, the bar beside it
      y0 = SPACE.md;
      tx = SPACE.md;
      tw = this.w - SPACE.md * 2;
      this.add(mtext(scene, tx, y0 + Math.round((segH - 9) / 2), o.title, 'rInk', { size: 7, maxW: room, box }));
      tx += tw - BAR_COMPACT;
      tw = BAR_COMPACT;
    } else {
      this.add(mtext(scene, this.w / 2, y0, o.title, 'rInk', { size: 8.5, align: 0.5, maxW: this.w - SPACE.lg * 2, box }));
      y0 += 16;
    }
    this.add(mosaicImage(scene, tx, y0, tw, segH, 'questTrack'));
    const n = Math.max(1, o.total);
    const pad = 2;
    const gap = 1;
    const sw = (tw - pad * 2 - gap * (n - 1)) / n;
    const g = scene.add.graphics();
    g.lineStyle(1.5, MOSAIC.ink, 1);
    for (let i = 0; i < n; i++) {
      const done = i < o.done;
      const sx = Math.round(tx + pad + i * (sw + gap));
      const w0 = Math.round(tx + pad + (i + 1) * (sw + gap) - gap) - sx;
      this.add(mosaicImage(scene, sx, y0 + pad, w0, segH - pad * 2, done ? 'segDone' : 'segOpen'));
      if (done) {
        const cx = sx + w0 / 2;
        const cy = y0 + segH / 2;
        g.beginPath();
        g.moveTo(cx - 3, cy);
        g.lineTo(cx - 1, cy + 2.4);
        g.lineTo(cx + 3.4, cy - 2.6);
        g.strokePath();
      }
    }
    this.add(g);
    y0 += segH + (compact ? 3 : 4);
    if (o.next) this.add(mtext(scene, this.w / 2, y0, o.next, 'pInk', { align: 0.5, maxW: this.w - SPACE.lg * 2, box }));
    uiId(this, o.id ?? 'quest');
    scene.add.existing(this);
  }
}

// ================================================================== fresco banner

export interface FrescoBannerOpts {
  /** Texture key of the painted image (src/ui/mosaic/raster.ts). */
  image?: string;
  /** A pixel illustration (a texture of exactly (w - 8) x (h - 8) UI px at panelK density) instead of the painted image. */
  pixelKey?: string;
  /** Art the caller draws into the inside rect (x, y, w, h in the banner's coordinates) instead of the painted image. */
  art?: (parent: Phaser.GameObjects.Container, x: number, y: number, w: number, h: number) => void;
  onClick?: () => void;
  /** Long-press text, and what scripts find it by. */
  label?: string;
  id?: string;
}

/** A painted image (or a pixel illustration, or art the caller draws) in a dark bronze riveted frame; tappable when `onClick` is given. */
export class FrescoBanner extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;
  readonly opts: { label: string };

  constructor(scene: Scene, x: number, y: number, w: number, h: number, o: FrescoBannerOpts = {}) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    this.h = Math.round(h);
    this.opts = { label: o.label ?? o.image ?? 'banner' };
    const face = centeredFace(scene, this.w, this.h);
    this.add(face);
    const t = 4;
    if (o.art) {
      put(face, this.w, this.h, mosaicImage(scene, 0, 0, this.w, this.h, 'parchmentWell'));
      const inner = put(face, this.w, this.h, scene.add.container(0, 0));
      o.art(inner, t, t, this.w - t * 2, this.h - t * 2);
    } else if (o.pixelKey) put(face, this.w, this.h, scene.add.image(t, t, o.pixelKey).setOrigin(0, 0).setScale(1 / panelK(scene)));
    else put(face, this.w, this.h, addCover(scene, t - 0.5, t - 0.5, this.w - t * 2 + 1, this.h - t * 2 + 1, o.image));
    put(face, this.w, this.h, mosaicImage(scene, 0, 0, this.w, this.h, 'fresco'));
    if (o.onClick) makePressable(this, { face, w: this.w, h: this.h, onTap: o.onClick, tip: o.label });
    uiId(this, o.id ?? `banner:${this.opts.label}`);
    scene.add.existing(this);
  }
}

// ================================================================== parchment row

export interface ParchmentRowOpts {
  /** Icon name of the thumbnail, or a raster texture key (`image`). */
  icon?: string;
  image?: string;
  title: string;
  subtitle?: string;
  /** A number or short value at the right. */
  value?: string;
  badge?: number | string;
  selected?: boolean;
  /** Greyed and explained on tap. */
  disabled?: string;
  onClick?: () => void;
  /** Long-press text. */
  tip?: string;
  id?: string;
}

export const ROW_H = 28;

/** A list row on parchment: thumbnail, title with a quieter line under it, a value at the right. */
export class ParchmentRow extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;
  readonly opts: { label: string };

  constructor(scene: Scene, x: number, y: number, w: number, o: ParchmentRowOpts, h = ROW_H) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    this.h = Math.max(22, Math.round(h));
    this.opts = { label: o.title };
    const off = !!o.disabled;
    const face = centeredFace(scene, this.w, this.h);
    this.add(face);
    const P = <T extends Phaser.GameObjects.GameObject & { x: number; y: number }>(obj: T): T => put(face, this.w, this.h, obj);
    P(mosaicImage(scene, 0, 0, this.w, this.h, o.selected ? 'parchmentSel' : 'parchment'));
    let x0 = SPACE.md + 2;
    if (o.icon || o.image) {
      const th = this.h - SPACE.md * 2 + 2;
      const ty0 = Math.round((this.h - th) / 2);
      P(mosaicImage(scene, x0, ty0, th, th, 'parchmentWell'));
      if (o.image) P(addCover(scene, x0 + 1, ty0 + 1, th - 2, th - 2, o.image));
      else {
        const ic = scaleIcon(addIcon(scene, 0, 0, o.icon!, off ? 'D' : ''), Math.min(1.4, (th - 4) / 12));
        ic.setPosition(x0 + Math.round((th - ic.displayWidth) / 2), ty0 + Math.round((th - ic.displayHeight) / 2));
        P(ic);
      }
      x0 += th + SPACE.md;
    }
    const chev = !!o.onClick && !o.value && !off;
    const rightW = o.value ? mw(o.value, 'pInk') + SPACE.md : chev ? 10 : 0;
    const tw = this.w - x0 - SPACE.md - rightW - 2;
    const frame = { owner: this as Phaser.GameObjects.Container, w: this.w, h: this.h };
    const two = !!o.subtitle;
    const ty = two ? Math.round((this.h - 19) / 2) : midY(this.h, 7.5);
    P(mtext(scene, x0, ty, o.title, off ? 'pOff' : 'rInk', { size: 7, maxW: tw, box: frame }));
    if (two) P(mtext(scene, x0, ty + 10, o.subtitle!, off ? 'pOff' : 'pSec', { size: 6, maxW: tw, box: frame }));
    if (o.value) P(mtext(scene, this.w - SPACE.md - 1, midY(this.h), o.value, off ? 'pOff' : 'pInk', { align: 1, maxW: rightW + 6, box: frame }));
    else if (chev) {
      const c = scaleIcon(addIcon(scene, 0, 0, 'chevR'), 0.8);
      c.setPosition(this.w - SPACE.md - 8, Math.round((this.h - c.displayHeight) / 2));
      P(c);
    }
    if (o.badge !== undefined && o.badge !== 0) this.add(new MBadge(scene, this.w - 4, 4, o.badge));
    if (off) P(scene.add.rectangle(0, 0, this.w, this.h, MOSAIC.parchLo, 0.45).setOrigin(0, 0));
    if (o.onClick || off) makePressable(this, { face, w: this.w, h: this.h, onTap: o.onClick ?? (() => undefined), disabled: () => o.disabled, tip: o.tip });
    uiId(this, o.id ?? `row:${o.title}`);
    scene.add.existing(this);
  }
}

// ================================================================== row parts

/** The parchment face of a list row (selected: lighter with a bronze rim). */
export function addRowFace(scene: Phaser.Scene, row: Phaser.GameObjects.Container, w: number, h: number, selected = false): void {
  row.add(mosaicImage(scene, 0, 0, w, h, selected ? 'parchmentSel' : 'parchment'));
}

/** A portrait well: a bronze-rimmed square tinted by `tint` (a role colour) around a pixel portrait added by the caller at (x + 1, y + 1). */
export function addPortraitWell(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, size: number, tint: number): void {
  const g = scene.add.graphics();
  g.fillStyle(MOSAIC.bronzeLo, 1);
  g.fillRect(x - 1, y - 1, size + 2, size + 2);
  g.fillStyle(tint, 1);
  g.fillRect(x, y, size, size);
  g.lineStyle(0.6, MOSAIC.bronzeHi, 0.9);
  g.strokeRect(x - 0.7, y - 0.7, size + 1.4, size + 1.4);
  parent.add(g);
}
