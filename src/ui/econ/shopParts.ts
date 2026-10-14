/**
 * The Shop hub's own parts on the v5 kit (SHP-01, design/ux/screens-modes.md
 * M-13): the look card (whole name, one state; a locked look in ink with a
 * lock chip, SHP-5), the Market door card (D5, MKT-4), the Drachmae pack card
 * (two lines, one label size for every pack, the "Best value" tag inside the
 * card: SHP-3) and the loading skeleton (SHP-4). Every text is 6.5 UI px or
 * more (A11Y-09). Positions are UI px.
 */
import Phaser from 'phaser';
import { addIcon, scaleIcon, type FontKey } from '../kit';
import { uiFrame, uiId } from '../layout';
import { MOSAIC, TEXT_MIN, lineHeight } from '../tokens';
import { motion } from '../motion';
import { GAP, MButton, buttonLabelSizes, mosaicImage, mtext, mw, type MButtonOpts } from '../mosaic';
import { centeredFace, makePressable, put, wrapWords } from '../mosaic/base';

type C = Phaser.GameObjects.Container;

// ================================================================== look card

export type LookState =
  | { kind: 'price'; text: string; short: boolean }
  | { kind: 'equipped'; text: string }
  | { kind: 'owned'; text: string }
  | { kind: 'locked'; text: string };

export interface LookCardOpts {
  name: string;
  state: LookState;
  art: (card: C, cx: number, cy: number, size: number) => void;
  onClick: () => void;
  id: string;
}

const ART = 32;
const NAME = TEXT_MIN;
const NAME_LH = Math.ceil(lineHeight(NAME));
const STATE_H = 14;

/** Lines of a look's name in a card `w` wide (never cut inside a word; at most three). */
function nameLines(name: string, w: number): string[] {
  return wrapWords(name, w - 6, (s) => mw(s, 'pInk', NAME)).slice(0, 3);
}

/** A look: its art in a well, its whole name, then one state: Equipped, Owned, a price, or where it is earned (ink and a lock chip). */
export class LookCard extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;

  /** Height of a row of cards `w` wide holding `names`. */
  /** Height of a row of cards `w` wide holding `names` and, for locked looks, their `locks` texts. */
  static height(names: string[], w: number, locks: string[] = []): number {
    const lines = Math.max(1, ...names.map((n) => nameLines(n, w).length));
    const stateH = Math.max(STATE_H, ...locks.map((s) => lockChipH(s, w - 8)));
    return 4 + ART + 3 + lines * NAME_LH + 3 + stateH + 3;
  }

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, o: LookCardOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    this.h = Math.round(h);
    const st = o.state;
    const face = centeredFace(scene, this.w, this.h);
    this.add(face);
    const P = <T extends Phaser.GameObjects.GameObject & { x: number; y: number }>(obj: T): T => put(face, this.w, this.h, obj);
    P(mosaicImage(scene, 0, 0, this.w, this.h, st.kind === 'equipped' ? 'parchmentSel' : 'parchment'));
    const wx = Math.round((this.w - ART) / 2);
    P(mosaicImage(scene, wx, 4, ART, ART, 'parchmentWell'));
    const art = scene.add.container(0, 0);
    o.art(art, this.w / 2, 4 + ART / 2, ART - 4);
    P(art);
    if (st.kind === 'equipped' || st.kind === 'owned') {
      // a seal on the well's corner: gold check (equipped), green tick (owned)
      const g = scene.add.graphics();
      const cx = wx + ART - 2;
      const cy = 6;
      g.fillStyle(MOSAIC.stone0, 1);
      g.fillCircle(cx, cy, 5);
      g.fillStyle(st.kind === 'equipped' ? MOSAIC.gold : MOSAIC.inkGood, 1);
      g.fillCircle(cx, cy, 4.2);
      g.lineStyle(1.2, st.kind === 'equipped' ? MOSAIC.ink : MOSAIC.cream, 1);
      g.beginPath();
      g.moveTo(cx - 2, cy);
      g.lineTo(cx - 0.5, cy + 1.6);
      g.lineTo(cx + 2.2, cy - 1.6);
      g.strokePath();
      P(g);
    }
    // the name in ink, whole (a locked look too: SHP-5)
    const lines = nameLines(o.name, this.w);
    let ty = 4 + ART + 3;
    for (const line of lines) {
      const tx = mtext(scene, this.w / 2, ty, line, 'pInk', { size: NAME, align: 0.5, box: { owner: this, w: this.w, h: this.h } });
      P(tx);
      ty += NAME_LH;
    }
    // the state at the bottom: a price (grey when short, a tap shows the way to the wallet), a check, or a lock chip
    const sy = this.h - STATE_H - 3;
    if (st.kind === 'locked') {
      const ch = lockChipH(st.text, this.w - 8);
      P(lockChip(scene, this, 4, this.h - ch - 3, this.w - 8, st.text, this.w, this.h));
    } else {
      const font: FontKey = st.kind === 'price' ? (st.short ? 'pOff' : 'pInk') : 'pGood';
      const icon = st.kind === 'price' ? 'drachma' : undefined;
      const size = st.kind === 'price' ? 7.5 : 7;
      const maxW = this.w - 8 - (icon ? 12 : 0);
      const tx = mtext(scene, 0, sy + Math.round((STATE_H - lineHeight(size)) / 2), st.text, font, { size, maxW });
      const both = (icon ? 12 : 0) + tx.width;
      const sx = Math.round(this.w / 2 - both / 2);
      if (icon) P(scaleIcon(addIcon(scene, sx, sy + 1, icon, st.kind === 'price' && st.short ? 'D' : ''), 10 / 12));
      tx.setX(sx + (icon ? 12 : 0));
      uiFrame(tx, this, this.w, this.h);
      P(tx);
    }
    makePressable(this, { face, w: this.w, h: this.h, onTap: o.onClick });
    uiId(this, o.id);
    scene.add.existing(this);
  }
}

/** A quiet ink chip with a lock: where a look is earned ("Season pass", "Duel season", "Not for sale"). */
/** The text of a lock chip `maxW` wide, on one line or two (never cut). */
function lockLines(text: string, maxW: number): string[] {
  return wrapWords(text, maxW - 18, (s) => mw(s, 'pInk', TEXT_MIN));
}

function lockChipH(text: string, maxW: number): number {
  return Math.max(STATE_H, lockLines(text, maxW).length * NAME_LH + 4);
}

/** A quiet ink chip with a lock: where a locked look is earned ("Season pass", "Duel seasons", "Not for sale"). */
function lockChip(scene: Phaser.Scene, owner: C, x: number, y: number, maxW: number, text: string, ownerW: number, ownerH: number): C {
  const c = scene.add.container(x, y);
  const lines = lockLines(text, maxW);
  const h = lockChipH(text, maxW);
  const tw = Math.max(...lines.map((l) => mw(l, 'pInk', TEXT_MIN)));
  const w = Math.min(maxW, tw + 18);
  const x0 = Math.round((maxW - w) / 2);
  c.add(mosaicImage(scene, x0, 0, w, h, 'parchmentWell'));
  c.add(scaleIcon(addIcon(scene, x0 + 3, Math.round((h - 10) / 2), 'lock', 'D'), 10 / 12));
  const ty = Math.round((h - lines.length * NAME_LH) / 2);
  lines.forEach((l, i) => {
    const tx = mtext(scene, x0 + 15, ty + i * NAME_LH, l, 'pInk', { size: TEXT_MIN, maxW: maxW - 18 });
    uiFrame(tx, owner, ownerW, ownerH);
    c.add(tx);
  });
  return c;
}

// ================================================================== the Market door

/** The Market door on the Shop page (D5): scales in a well, "Market", what it is, a chevron. */
export class MarketCard extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;
  readonly opts: { label: string };

  static height(sub: string, w: number): number {
    const lines = wrapWords(sub, w - 50, (s) => mw(s, 'pSec', TEXT_MIN)).length;
    return Math.max(34, 7 + 11 + lines * Math.ceil(lineHeight(TEXT_MIN)) + 6);
  }

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, title: string, sub: string, onClick: () => void) {
    super(scene, Math.round(x), Math.round(y));
    this.w = Math.round(w);
    this.h = MarketCard.height(sub, w);
    this.opts = { label: title };
    const face = centeredFace(scene, this.w, this.h);
    this.add(face);
    const P = <T extends Phaser.GameObjects.GameObject & { x: number; y: number }>(obj: T): T => put(face, this.w, this.h, obj);
    P(mosaicImage(scene, 0, 0, this.w, this.h, 'parchment'));
    const well = 26;
    const wy = Math.round((this.h - well) / 2);
    P(mosaicImage(scene, 5, wy, well, well, 'parchmentWell'));
    const ic = scaleIcon(addIcon(scene, 0, 0, 'scales'), 1.5);
    ic.setPosition(5 + Math.round((well - ic.displayWidth) / 2), wy + Math.round((well - ic.displayHeight) / 2));
    P(ic);
    const tx = 5 + well + 6;
    const tw = this.w - tx - 14;
    const frame = { owner: this as C, w: this.w, h: this.h };
    P(mtext(scene, tx, 6, title.toUpperCase(), 'rInk', { size: 7.5, maxW: tw, box: frame }));
    P(mtext(scene, tx, 18, sub, 'pSec', { size: TEXT_MIN, maxW: tw, wrap: true, box: frame }));
    const chev = scaleIcon(addIcon(scene, 0, 0, 'chevR'), 0.8);
    chev.setPosition(this.w - 12, Math.round((this.h - chev.displayHeight) / 2));
    P(chev);
    makePressable(this, { face, w: this.w, h: this.h, onTap: onClick, tip: sub });
    uiId(this, 'shop.market');
    scene.add.existing(this);
  }
}

// ================================================================== Drachmae packs (real money: pixel-perfect)

export interface PackCardData {
  id: string;
  stars: number;
  drachmae: number;
  bonus: number;
  best: boolean;
}

export interface PackLayout {
  cols: 1 | 2;
  /** Card width. */
  pw: number;
  /** Height of a card (one a row: the best one is taller by its tag band). */
  cardH: (best: boolean) => number;
  /** Height of the Stars buttons: every label fits at the first size of this height, so all render at one size. */
  btnH: number;
  /** The Stars icon on every button, or on none. */
  icon: boolean;
  /** The bonus as "+30% bonus" when every card has room for it, else "+30%". */
  longBonus: boolean;
}

const BAND_H = 12;
/** MButton's label room: 7 UI px of padding each side; the icon takes 12 more and a 3 px gap. */
const PAD_X = 14;
const ICON_W = 15;

/** Every label fits a button `bw` wide and `h` high at that height's first label size (so none shrinks). */
function fitsAll(labels: string[], bw: number, h: number, icon: boolean): boolean {
  const size = buttonLabelSizes(h)[0];
  return labels.every((l) => mw(l.toUpperCase(), 'rCream', size) <= bw - PAD_X - (icon ? ICON_W : 0));
}

/**
 * The pack grid for a column `w` wide: two cards a row when every Stars label fits a half-width button
 * at its first size, else one card a row with full-width buttons. Either way every label renders at the
 * same size, with the Stars icon on all buttons or on none (SHP-3: "1000 STARS" never shrinks below its
 * siblings).
 */
export function packLayout(packs: readonly PackCardData[], w: number, o: { label: (stars: number) => string; noun: string; bonusLong: (n: number) => string }): PackLayout {
  const labels = packs.map((p) => o.label(p.stars));
  const two = Math.floor((w - GAP) / 2);
  const nounW = mw(o.noun, 'pSec', TEXT_MIN);
  if (fitsAll(labels, two - 12, 24, false)) {
    const longBonus = packs.every((p) => !p.bonus || nounW + 4 + mw(o.bonusLong(p.bonus), 'pGood', 7) <= two - 12);
    return { cols: 2, pw: two, cardH: () => BAND_H + 4 + 13 + 11 + 4 + 24 + 5, btnH: 24, icon: fitsAll(labels, two - 12, 24, true), longBonus };
  }
  const longBonus = packs.every((p) => !p.bonus || 21 + mw(`${p.drachmae}`, 'pInk', 9) + 4 + nounW + 6 + mw(o.bonusLong(p.bonus), 'pGood', 7) <= w - 6);
  return { cols: 1, pw: w, cardH: (best) => (best ? BAND_H + 3 : 0) + 4 + 13 + 4 + 26 + 5, btnH: 26, icon: fitsAll(labels, w - 12, 26, true), longBonus };
}

/**
 * A pack: a "Best value" band inside the top of the card (best only), the Drachmae amount with its coin,
 * "Drachmae" and the bonus, and the blue Stars button (Telegram's payment: a confirmation follows).
 * Returns the card's height.
 */
export function addPackCard(
  scene: Phaser.Scene,
  parent: C,
  x: number,
  y: number,
  L: PackLayout,
  p: PackCardData,
  o: { noun: string; bestTag: string; bonusText: string; label: string; tip: string; onClick: () => void; offReason?: string },
): number {
  const pw = L.pw;
  const ph = L.cardH(p.best);
  const card = scene.add.container(x, y);
  parent.add(card);
  card.setSize(pw, ph);
  card.add(mosaicImage(scene, 0, 0, pw, ph, p.best ? 'parchmentSel' : 'parchment'));
  const frame = { owner: card, w: pw, h: ph };
  if (p.best) {
    // the tag inside the card, across its top (never over the edge: SHP-3)
    const g = scene.add.graphics();
    g.fillStyle(MOSAIC.bronze, 1);
    g.fillRoundedRect(3, 3, pw - 6, BAND_H, 2);
    card.add(g);
    card.add(mtext(scene, pw / 2, 3 + Math.round((BAND_H - lineHeight(7)) / 2), o.bestTag.toUpperCase(), 'rCream', { size: 7, align: 0.5, maxW: pw - 10, box: frame }));
  }
  // two a row: the band's room on every card (so the grid stays even); one a row: only on the best
  let ly = L.cols === 2 || p.best ? BAND_H + 4 : 4;
  card.add(addIcon(scene, 6, ly + 1, 'drachma'));
  const amt = mtext(scene, 21, ly, `${p.drachmae}`, 'pInk', { size: 9, box: frame });
  card.add(amt);
  const bonusW = p.bonus > 0 ? mw(o.bonusText, 'pGood', 7) : 0;
  if (L.cols === 1) {
    // one line: the amount, "Drachmae", the bonus at the right
    card.add(mtext(scene, 21 + amt.width + 4, ly + 2.5, o.noun, 'pSec', { size: TEXT_MIN, maxW: pw - 31 - amt.width - (bonusW ? bonusW + 6 : 0), box: frame }));
    if (p.bonus > 0) card.add(uiIdOf(mtext(scene, pw - 6, ly + 1.5, o.bonusText, 'pGood', { size: 7, align: 1, box: frame }), `wallet.bonus.${p.id}`));
  } else {
    ly += 13;
    card.add(mtext(scene, 6, ly, o.noun, 'pSec', { size: TEXT_MIN, maxW: pw - 12 - (bonusW ? bonusW + 4 : 0), box: frame }));
    if (p.bonus > 0) card.add(uiIdOf(mtext(scene, pw - 6, ly - 0.5, o.bonusText, 'pGood', { size: 7, align: 1, box: frame }), `wallet.bonus.${p.id}`));
  }
  // no provider here yet (the web): off, no Stars, the reason on tap (AU-20)
  const btn: MButtonOpts = o.offReason
    ? { label: o.label, variant: 'disabled', disabledReason: o.offReason, id: `wallet.pack.${p.id}` }
    : { label: o.label, icon: L.icon ? 'tgstar' : undefined, variant: 'purchase', tip: o.tip, id: `wallet.pack.${p.id}`, onClick: o.onClick };
  card.add(new MButton(scene, 6, ph - L.btnH - 5, pw - 12, L.btnH, btn));
  return ph;
}

function uiIdOf<T extends Phaser.GameObjects.GameObject>(o: T, id: string): T {
  uiId(o, id);
  return o;
}

// ================================================================== loading skeleton (SHP-4)

/** Card-shaped placeholders that breathe while the shop loads (still under Reduce motion), with the loading line over them. */
export function addShopSkeleton(scene: Phaser.Scene, parent: C, x: number, y: number, w: number, h: number, text: string): void {
  const c = scene.add.container(x, y);
  parent.add(c);
  const cw = Math.floor((w - GAP) / 2);
  const ch = 66;
  const shapes: Phaser.GameObjects.Image[] = [];
  shapes.push(mosaicImage(scene, 0, 0, w, 14, 'parchmentWell'));
  for (let r = 0; 22 + r * (ch + GAP) + ch <= h; r++)
    for (let k = 0; k < 2; k++) shapes.push(mosaicImage(scene, k * (cw + GAP), 22 + r * (ch + GAP), cw, ch, 'parchmentWell'));
  shapes.forEach((s) => c.add(s));
  const tx = mtext(scene, w / 2, 3, text, 'pSec', { size: TEXT_MIN, align: 0.5, maxW: w - 8 });
  c.add(tx);
  uiId(tx, 'shop.loading');
  if (!motion.reduced) scene.tweens.add({ targets: shapes, alpha: { from: 1, to: 0.45 }, duration: 650, yoyo: true, repeat: -1 });
}
