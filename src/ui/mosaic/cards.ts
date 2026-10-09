/**
 * Parchment content of the v4 screens: card, section title, profile card, quest
 * card, fresco banner and list row (V4_SPEC "Visual reference"). Positions are
 * UI px inside the screen's UI root; each is a Container with `w` and `h`.
 */
import Phaser from 'phaser';
import { addIcon, scaleIcon } from '../kit';
import { uiId } from '../layout';

import { MOSAIC, SPACE } from '../tokens';
import { MBadge, centeredFace, makePressable, midY, mosaicImage, mtext, mw, put } from './base';
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
  id?: string;
}

const STAT_H = 13;
const STAT_SIZES = [7, 6.5, 6, 5.5];

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
    const portrait = this.w >= 160 ? 40 : 32;
    const px = SPACE.md;
    const tx = px + portrait + SPACE.md + 2;
    const tw = this.w - tx - SPACE.md;
    const rows = statRows((o.stats ?? []).slice(0, 3), tw);
    const textH = 11 + (o.subtitle ? 10 : 0) + rows.length * STAT_H;
    this.h = Math.max(portrait + SPACE.md * 2, textH + SPACE.md * 2);
    this.add(mosaicImage(scene, 0, 0, this.w, this.h, 'parchment'));
    const py = Math.round((this.h - portrait) / 2);
    this.add(addCover(scene, px, py, portrait, portrait, o.portrait));
    const g = scene.add.graphics();
    g.lineStyle(1.4, MOSAIC.bronze, 1);
    g.strokeRect(px - 0.5, py - 0.5, portrait + 1, portrait + 1);
    g.lineStyle(0.6, MOSAIC.parchEdge, 1);
    g.strokeRect(px - 1.5, py - 1.5, portrait + 3, portrait + 3);
    this.add(g);
    let ty = Math.round((this.h - textH) / 2) + 1;
    const box = { owner: this as Phaser.GameObjects.Container, w: this.w, h: this.h };
    const nameSize = [8, 7.5, 7, 6.5].find((z) => mw(o.name, 'rInk', z) <= tw) ?? 6.5;
    this.add(mtext(scene, tx, ty, o.name, 'rInk', { size: nameSize, maxW: tw, box }));
    ty += 11;
    if (o.subtitle) {
      const z = STAT_SIZES.find((k) => mw(o.subtitle!, 'pInk', k) <= tw) ?? 5.5;
      this.add(mtext(scene, tx, ty, o.subtitle, 'pInk', { size: z, maxW: tw, box }));
      ty += 10;
    }
    for (const r of rows) {
      r.items.forEach((it, i) => {
        // a pair: the first at the left, the second at the right edge
        const ix = i === 0 ? tx : tx + tw - it.w;
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
  id?: string;
}

const SEG_H = 13;

/** A parchment card with a titled, segmented progress bar: done segments gold with a check, open ones dark. */
export class QuestCard extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;

  constructor(scene: Scene, x: number, y: number, w: number, o: QuestCardOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    this.h = SPACE.md + 12 + 4 + SEG_H + 6 + (o.next ? 10 : 0) + SPACE.md + 2;
    this.add(mosaicImage(scene, 0, 0, this.w, this.h, 'parchment'));
    let y0 = SPACE.md + 1;
    this.add(mtext(scene, this.w / 2, y0, o.title, 'rInk', { size: 8.5, align: 0.5, maxW: this.w - SPACE.lg * 2, box: { owner: this, w: this.w, h: this.h } }));
    y0 += 16;
    const tx = SPACE.lg;
    const tw = this.w - SPACE.lg * 2;
    this.add(mosaicImage(scene, tx, y0, tw, SEG_H, 'questTrack'));
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
      this.add(mosaicImage(scene, sx, y0 + pad, w0, SEG_H - pad * 2, done ? 'segDone' : 'segOpen'));
      if (done) {
        const cx = sx + w0 / 2;
        const cy = y0 + SEG_H / 2;
        g.beginPath();
        g.moveTo(cx - 3, cy);
        g.lineTo(cx - 1, cy + 2.4);
        g.lineTo(cx + 3.4, cy - 2.6);
        g.strokePath();
      }
    }
    this.add(g);
    y0 += SEG_H + 4;
    if (o.next) this.add(mtext(scene, this.w / 2, y0, o.next, 'pInk', { align: 0.5, maxW: this.w - SPACE.lg * 2, box: { owner: this, w: this.w, h: this.h } }));
    uiId(this, o.id ?? 'quest');
    scene.add.existing(this);
  }
}

// ================================================================== fresco banner

export interface FrescoBannerOpts {
  /** Texture key of the painted image (src/ui/mosaic/raster.ts). */
  image?: string;
  onClick?: () => void;
  /** Long-press text, and what scripts find it by. */
  label?: string;
  id?: string;
}

/** A painted image in a dark bronze riveted frame; tappable when `onClick` is given. */
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
    put(face, this.w, this.h, addCover(scene, t - 0.5, t - 0.5, this.w - t * 2 + 1, this.h - t * 2 + 1, o.image));
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
    if (o.onClick || off) makePressable(this, { face, w: this.w, h: this.h, onTap: o.onClick ?? (() => undefined), disabled: () => o.disabled });
    uiId(this, o.id ?? `row:${o.title}`);
    scene.add.existing(this);
  }
}

