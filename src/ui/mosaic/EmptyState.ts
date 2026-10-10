/**
 * An empty state on parchment: a faded icon, a Cinzel title, a hint and an
 * optional action.
 */
import type Phaser from 'phaser';
import { addIcon } from '../kit';
import { t } from '../../i18n';
import { wrapText } from '../textfit';
import { TEXT_MIN, lineHeight } from '../tokens';
import { TAP, mtext } from './base';
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
}

/** A centred empty state on parchment: a faded icon, a Cinzel title, a hint and an optional action. */
export function addParchmentEmpty(scene: Phaser.Scene, x: number, y: number, w: number, h: number, o: ParchmentEmptyOpts): C {
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
