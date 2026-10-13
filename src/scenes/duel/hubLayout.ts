/**
 * The Duels hub's rules as plain functions (no Phaser; tests/duelHub.test.ts):
 * when the fresco and the chest tip give way on a
 * short screen, how the header row lays its chips and buttons out, and the
 * notes of a ladder floor's report (design/ux/screens-modes.md M-2 .. M-4,
 * story DUE-01).
 */
import { t } from '../../i18n';
import { fmtCount } from '../../i18n/numbers';
import { LADDER } from '../../duel/ladder';
import type { LadderReport } from '../../duel/client';

/** Below this canvas height (UI px; 700 CSS px at 2x) the hub's fresco is hidden (M-2: "hidden < VH 700"). */
export const FRESCO_MIN_VH = 350;
/** The fresco's height on the hub, UI px (it shrank from 36: the floors come first, DUE-1). */
export const FRESCO_H = 28;

/** The hub shows its fresco on this canvas height. */
export const showFresco = (vh: number): boolean => vh >= FRESCO_MIN_VH;

/**
 * The ladder's chest tip ("a chest is ready: tap the glowing chest") only
 * where it leaves the first floor row in view (M-2 acceptance at 320x640):
 * on a short screen the glowing chest says it alone. A team problem always
 * shows: it is why Fight is off.
 */
export const showChestTip = (vh: number): boolean => vh >= FRESCO_MIN_VH;

/** One box of the header row: its natural width and whether it may grow into what is left. */
export interface HeaderBox {
  w: number;
  grow: boolean;
}

/**
 * The header row (M-2, DUE-4): the Glory and level chips at their natural
 * widths, then the Team and Armoury buttons sharing the rest, all on ONE row.
 * A button keeps its label when `labelFits(i, width)` says so at the width it
 * gets; else both are icon-only (their names in their tips), at least
 * `minButton` wide (a touch target). The chips may trim up to `squeeze` px of
 * padding each (`tight`) to keep one row; narrower still (320x568 in
 * Telegram), the buttons take a second row. Returns the rows, each box's x and
 * width and whether the buttons are labelled.
 */
export function headerLayout(w: number, chips: number[], buttons: number, labelFits: (i: number, bw: number) => boolean, gap = 2, minButton = 22, squeeze = 5): { rows: 1 | 2; tight: boolean; chips: { x: number; w: number }[]; buttons: { x: number; w: number; label: boolean }[] } {
  const chipGaps = gap * Math.max(0, chips.length - 1);
  const natural = chips.reduce((a, b) => a + b, 0);
  const share = (room: number, n: number, lead: number) => (n ? Math.floor((room - gap * (n - 1) - lead) / n) : 0);
  /** Boxes of `widths` from x = 0, the last one taking what is left of the row. */
  const lay = (widths: number[]): { x: number; w: number }[] => {
    let x = 0;
    return widths.map((cw, i) => {
      const box = { x, w: i === widths.length - 1 ? w - x : cw };
      x += cw + gap;
      return box;
    });
  };
  const allFit = (bw: number) => Array.from({ length: buttons }, (_, i) => labelFits(i, bw)).every(Boolean);
  const need = buttons * (minButton + gap);
  // too narrow even with the chips' padding trimmed (320x568 in Telegram): two rows, the buttons labelled if they can be
  if (buttons && natural - squeeze * chips.length + chipGaps + need > w) {
    const bw = share(w, buttons, 0);
    const label = allFit(bw);
    return { rows: 2, tight: false, chips: lay(chips.map(() => share(w, chips.length, 0))), buttons: lay(Array(buttons).fill(bw)).map((b) => ({ ...b, label })) };
  }
  // the chips give up to `squeeze` px of padding each so the buttons stay touch-sized
  const over = Math.max(0, natural + chipGaps + need - w);
  const widths = over ? chips.map((cw) => cw - Math.ceil(over / chips.length)) : chips;
  let bw = share(w - widths.reduce((a, b) => a + b, 0) - chipGaps, buttons, gap);
  const labelled = buttons > 0 && bw >= minButton && allFit(bw);
  if (buttons && !labelled) bw = Math.max(minButton, bw);
  const boxes = lay([...widths, ...Array(buttons).fill(bw)]);
  return { rows: 1, tight: over > 0, chips: boxes.slice(0, chips.length), buttons: boxes.slice(chips.length).map((b) => ({ ...b, label: labelled })) };
}

/**
 * The notes under a ladder floor's report: the first clear, the stars, the
 * daily farm cap, duel XP; a run reported after the ticket ran out says so
 * first (it was verified but paid nothing: controls.md R10, CT-06).
 */
export function ladderNotes(r: Pick<LadderReport, 'firstClear' | 'won' | 'stars' | 'newBest' | 'capped' | 'accountXp' | 'floor' | 'expired'>, demo = false): string[] {
  const notes: string[] = [];
  if (r.expired) notes.push(t('d5.note.expired', { m: LADDER.ticketMin }));
  if (r.firstClear) notes.push(t('duels.note.first', { n: r.floor }));
  if (r.won && r.stars) notes.push(r.newBest && !r.firstClear ? t('duels.note.starsBest', { s: r.stars }) : t('duels.note.stars', { s: r.stars }));
  if (r.capped > 0) notes.push(t('duels.note.capped'));
  if (!r.expired) notes.push(t('duels.note.xp', { n: r.accountXp }));
  if (demo) notes.push(t('duels.note.demo'));
  return notes;
}

/** The toast back on the ladder after a floor: what it paid, or that the ticket ran out and it paid nothing. */
export function ladderArrival(a: { floor: number; won: boolean; first?: boolean; glory: number; stars?: number; newBest?: boolean; expired?: boolean }): string {
  if (a.expired) return t('d5.backExpired', { n: a.floor, m: LADDER.ticketMin });
  let text = !a.won ? t('duels.backLost', { n: a.floor }) : a.first ? t('duels.backWon', { n: a.floor, g: fmtCount(a.glory) }) : t('duels.backReplay', { n: a.floor, g: fmtCount(a.glory) });
  if (a.won && a.stars) text += ` · ${a.newBest && !a.first ? t('duels.backBest', { s: a.stars }) : t('duels.backStars', { s: a.stars })}`;
  return text;
}
