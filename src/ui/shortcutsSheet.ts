/**
 * The Keyboard shortcuts sheet (design/ux/input-v6.md §6.4, story V6-INP-06): `?` (or F1) opens a
 * read-only list of the **current** bindings, grouped as in §1.1 (the Controls page's sections), with
 * "Edit in Settings". Labels come from glyphs.ts (the player's layout, Cmd or Ctrl by platform).
 * The battle opens it through its own help.keys handler so an offline fight pauses while it is open.
 */
import Phaser from 'phaser';
import { Button, addText, mosaicPanelImage, type UIMetrics } from './kit';
import { SIZE } from './theme';
import { BUTTON_MAX } from './sizeClass';
import { ScrollList } from './widgets';
import { openParchmentSheet } from './mosaic/ParchmentSheet';
import { ellipsize, measureText, wrapText } from './textfit';
import { SURFACE, TEXT_MIN } from './tokens';
import { settingsSheetOpts } from './notifySettings';
import { ACTIONS, type ActionId } from './input/actions';
import type { Binding } from './input/bindings';
import { keys } from './input/keys';
import { bindingLabel, loadGlyphs } from './input/glyphs';
import { SECTIONS, openControls } from './settings/controls';
import { platform } from '../platform';
import { t, type TKey } from '../i18n';

interface UiScene extends Phaser.Scene {
  ui: Phaser.GameObjects.Container;
  m: UIMetrics;
}

type SheetRow = { kind: 'section'; label: TKey } | { kind: 'action'; id: ActionId };

/** The sheet's rows: every section of §1.1 with its actions (the unbound confirm flows included, "no key"). */
export const SHEET_ROWS: readonly SheetRow[] = SECTIONS.flatMap((s): SheetRow[] => [{ kind: 'section', label: s.label }, ...s.actions.map((id): SheetRow => ({ kind: 'action', id }))]);

/** An action's keys as the sheet lists them: "W", "U · Ctrl+Z", or "no key". */
export function keysText(id: ActionId): string {
  const list = keys.bindings[id].filter((b): b is Binding => !!b).map(bindingLabel);
  return list.length ? list.join(' · ') : t('controls.none');
}

const open = new WeakMap<Phaser.Scene, Phaser.GameObjects.Container>();

/** The sheet is open on `scene`. */
export function shortcutsOpen(scene: Phaser.Scene): boolean {
  return !!open.get(scene)?.active;
}

/** Opens the shortcuts sheet on `scene` (once: a second ? while it is open does nothing). `onClose` runs when it closes. */
export function openShortcuts(scene: UiScene, onClose?: () => void): Phaser.GameObjects.Container {
  const was = open.get(scene);
  if (was?.active) return was;
  const { VH } = scene.m;
  const rowH = 16;
  const gap = 2;
  const want = 26 + 12 + SHEET_ROWS.length * (rowH + gap) + SIZE.btnH + 16;
  let list: ScrollList | null = null;
  const m = openParchmentSheet(scene, {
    ...settingsSheetOpts(scene),
    title: t('controls.title'),
    h: Math.min(want, VH - 12),
    id: 'shortcuts',
    onClose: () => {
      list?.destroy();
      list = null;
      onClose?.();
    },
  });
  const { c, body } = m;
  open.set(scene, c);
  // Edit in Settings under the list, at most a button's width (§2.3), centred
  const bw = Math.min(BUTTON_MAX, body.w);
  const footY = body.y + body.h - SIZE.btnH;
  c.add(
    new Button(scene, body.x + (body.w - bw) / 2, footY, bw, SIZE.btnH, {
      label: t('controls.edit'),
      variant: 'secondary',
      small: true,
      id: 'shortcuts.edit',
      onClick: () => {
        m.close();
        openControls(scene);
      },
    }),
  );
  // where the sheet comes from, under the title
  const tip = wrapText(t('controls.sheetTip'), body.w - 4, 2, false, TEXT_MIN).lines;
  c.add(addText(scene, body.x + 2, body.y, tip.join('\n'), 'pSec').setFontSize(TEXT_MIN));
  const top = body.y + tip.length * 8 + 4;
  list = new ScrollList(scene, c, body.x, top, body.w, footY - SIZE.gap - top, {
    count: SHEET_ROWS.length,
    rowH,
    gap,
    render: (i, row, rw) => {
      const r = SHEET_ROWS[i];
      if (r.kind === 'section') {
        row.add(addText(scene, 2, 5, ellipsize(t(r.label), rw - 4, false, 7, 'head'), 'hInk'));
        row.add(scene.add.rectangle(0, rowH - 1, rw - 4, 1, SURFACE.line).setOrigin(0, 0));
        return;
      }
      row.add(mosaicPanelImage(scene, 0, 0, rw - 4, rowH - 1, 'parchmentWell'));
      const k = keysText(r.id);
      const kw = Math.min(measureText(k), (rw - 4) * 0.45);
      row.add(addText(scene, rw - 8, 4, ellipsize(k, kw), keys.bindings[r.id].some(Boolean) ? 'pInk' : 'pMuted', 1));
      row.add(addText(scene, 6, 4, ellipsize(t(ACTIONS[r.id].label), rw - 4 - kw - 16), 'pInk'));
    },
  });
  // the layout's labels, once the browser answers
  void loadGlyphs(platform.input).then(() => c.active && list?.refresh());
  return c;
}
