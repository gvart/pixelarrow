/**
 * An empty state on parchment: a faded icon, a Cinzel title, a hint and an
 * optional action.
 */
import type Phaser from 'phaser';
import { addIcon } from '../kit';
import { t } from '../../i18n';
import { wrapText } from '../textfit';
import { TEXT_MIN, lineHeight } from '../tokens';
import { TAP, mtext, mw } from './base';
import { wrapWords } from './policy';
import { MButton } from './controls';

type C = Phaser.GameObjects.Container;

/** Line pitch of the hint, UI px (TEXT_MIN, A11Y-09). */
const LH = Math.ceil(lineHeight(TEXT_MIN));

export interface ParchmentEmptyOpts {
  icon?: string;
  /** Default: the generic "Nothing here". */
  title?: string;
  /** What to do next (wrapped, at most 4 lines). */
  hint: string;
  action?: { label: string; icon?: string; onClick: () => void };
  /**
   * One band across `w` instead of a stack (landscape panes, landscape-v6 §15): the icon, title and hint on the
   * left (lines at most 300 UI px), the action at the right end, centred in `h`.
   */
  row?: boolean;
}

/** The longest line of a wrapped text in a band (the `stretched` rule's 300 UI px). */
const ROW_TEXT_MAX = 300;

/** A centred empty state on parchment: a faded icon, a Cinzel title, a hint and an optional action. */
export function addParchmentEmpty(scene: Phaser.Scene, x: number, y: number, w: number, h: number, o: ParchmentEmptyOpts): C {
  if (o.row) return addParchmentEmptyRow(scene, x, y, w, h, o);
  const c = scene.add.container(Math.round(x), Math.round(y));
  let lines = 4;
  let hint = wrapText(o.hint, w - 12, lines, false, TEXT_MIN);
  const actionH = o.action ? TAP + 6 : 0;
  let showIcon = !!o.icon;
  const total = () => (showIcon ? 24 : 0) + 12 + hint.lines.length * LH + actionH;
  if (total() > h) showIcon = false;
  while (total() > h && lines > 1) hint = wrapText(o.hint, w - 12, --lines, false, TEXT_MIN);
  let cy = Math.max(0, Math.round((h - total()) / 2));
  if (showIcon && o.icon) {
    const ic = addIcon(scene, Math.round(w / 2 - 6), cy + 4, o.icon, 'D');
    c.add(ic);
    cy += 24;
  }
  c.add(mtext(scene, w / 2, cy, o.title ?? t('kit.empty.title'), 'rInk', { size: 7.5, align: 0.5, maxW: w - 8, box: { owner: c, w, h } }));
  cy += 12;
  hint.lines.forEach((l, i) => c.add(mtext(scene, w / 2, cy + i * LH, l, 'pSec', { size: TEXT_MIN, align: 0.5, box: { owner: c, w, h } })));
  cy += hint.lines.length * LH;
  if (o.action) c.add(new MButton(scene, Math.round((w - Math.min(w - 8, 90)) / 2), cy + 4, Math.min(w - 8, 90), TAP, { label: o.action.label, icon: o.action.icon, variant: 'secondary', onClick: o.action.onClick }));
  return c;
}

function addParchmentEmptyRow(scene: Phaser.Scene, x: number, y: number, w: number, h: number, o: ParchmentEmptyOpts): C {
  // three zones across the band: the icon and title at the left, the hint centred in the middle, the action at
  // the right end (so the words and the action spread over the band instead of leaving a hole in it)
  const c = scene.add.container(Math.round(x), Math.round(y));
  const box = { owner: c, w, h };
  const iconW = o.icon ? 22 : 0;
  const actW = o.action ? 90 : 0;
  const left = 6 + iconW;
  const right = w - 6 - (actW ? actW + 8 : 0);
  const title = o.title ?? t('kit.empty.title');
  const mid = h / 2;
  const tlh = 12;
  if (o.icon) c.add(addIcon(scene, 6, Math.round(mid - 6), o.icon, 'D'));
  const titleW = Math.ceil(mw(title, 'rInk', 7.5));
  if (titleW <= (right - left) * 0.36) {
    const zone0 = left + titleW + 10;
    const hint = wrapText(o.hint, Math.min(ROW_TEXT_MAX, right - zone0), 3, false, TEXT_MIN);
    c.add(mtext(scene, left, Math.round(mid - tlh / 2), title, 'rInk', { size: 7.5, box }));
    const hx = zone0 + (right - zone0) / 2;
    hint.lines.forEach((l, i) => c.add(mtext(scene, hx, Math.round(mid - (hint.lines.length * LH) / 2) + i * LH, l, 'pSec', { size: TEXT_MIN, align: 0.5, box })));
  } else {
    // a narrow band: the title over the hint at the left, the action still at the right end
    const tw = Math.min(ROW_TEXT_MAX, right - left);
    const titleLines = wrapWords(title, tw, (s) => mw(s, 'rInk', 7.5));
    const hint = wrapText(o.hint, tw, 3, false, TEXT_MIN);
    let ty = Math.round(mid - (titleLines.length * tlh + hint.lines.length * LH) / 2);
    titleLines.forEach((l) => (c.add(mtext(scene, left, ty, l, 'rInk', { size: 7.5, box })), (ty += tlh)));
    hint.lines.forEach((l) => (c.add(mtext(scene, left, ty, l, 'pSec', { size: TEXT_MIN, box })), (ty += LH)));
  }
  if (o.action) c.add(new MButton(scene, w - 6 - actW, Math.round(mid - TAP / 2), actW, TAP, { label: o.action.label, icon: o.action.icon, variant: 'secondary', onClick: o.action.onClick }));
  return c;
}
