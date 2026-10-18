/**
 * The Kit's "Overlays" page (story F-05 AC2): every overlay of the kit opens from here with a sample.
 * Sheets and confirms follow F-03's rules (one sheet plus one confirm, one close affordance, the
 * destructive action apart from the primary); toasts sit under the top bar, never over a primary.
 * `openOverlaySample` is also what the layout check calls (`kit-overlay-<id>`).
 */
import { t } from '../../i18n';
import { confirmDialog, openModal, showTooltip, toast } from '../../ui/widgets';
import { openItemCard } from '../../ui/sheet';
import { MButton, ParchmentRow, ROW_H, confirmPurchase, mtext, openParchmentSheet, type ParchmentSheetHandle } from '../../ui/mosaic';
import { columns } from '../../ui/mosaic/layout';
import { BUTTON_MAX } from '../../ui/sizeClass';
import { Cursor, G, type KitScene } from './common';

/** Body text in a sheet's body area, wrapped. */
function body(scene: KitScene, m: ParchmentSheetHandle | ReturnType<typeof openModal>, text: string): void {
  m.c.add(mtext(scene, m.body.x, m.body.y + 2, text, 'pInk', { size: 7, maxW: m.body.w, wrap: true }));
}

function sheet(scene: KitScene, title: string, text: string, h = 110): ParchmentSheetHandle {
  const m = openParchmentSheet(scene, { title, h, id: 'kit.sheet' });
  body(scene, m, text);
  return m;
}

/** A full-width button at the foot of a sheet's body. */
function sheetButton(scene: KitScene, m: ParchmentSheetHandle, label: string, variant: 'primary' | 'secondary' | 'neutral', onClick: () => void, id: string): MButton {
  // at most a button's width (§2.3), centred
  const bw = Math.min(m.body.w, BUTTON_MAX);
  const b = new MButton(scene, m.body.x + (m.body.w - bw) / 2, m.body.y + m.body.h - 24, bw, 24, { label, variant, onClick, id });
  m.c.add(b);
  return b;
}

const SAMPLE_ITEM = { uid: 'kit-item', def: 'bronze_dory', rarity: 'epic' as const, cond: 90 };

export interface OverlaySample {
  id: string;
  label: string;
  /** What it shows, under the label. */
  what: string;
  icon: string;
  open: (s: KitScene) => void;
}

/** The samples, in the page's order. */
export const OVERLAY_SAMPLES: readonly OverlaySample[] = [
  { id: 'sheet', label: 'Sheet', what: 'An X, Back or a tap outside closes it', icon: 'log', open: (s) => void sheet(s, 'Optional sheet', 'A sheet over a 45% basalt scrim. Close it with the X, Back or a tap outside.') },
  {
    id: 'sheet-actions',
    label: 'Docked sheet',
    what: 'Slides up; the primary on the right',
    icon: 'march',
    open: (s) => {
      const m = openParchmentSheet(s, { title: 'Helvian Pastures', h: 120, dock: 'bottom', id: 'kit.sheet', actions: [{ label: 'Later', variant: 'neutral', onClick: () => m.close() }, { label: 'March', variant: 'primary', onClick: () => (m.close(), toast(s, 'March', 'good')) }] });
      body(s, m, 'Docked to the lower edge; it slides up. The one primary sits on the right, under the thumb.');
    },
  },
  {
    id: 'decision',
    label: 'Decision sheet',
    what: 'No X; the shade does not close it',
    icon: 'map',
    open: (s) => {
      const m = openParchmentSheet(s, { title: 'Choose a road', h: 120, shadeCloses: false, id: 'kit.sheet', actions: [{ label: 'Coast', variant: 'secondary', onClick: () => m.close() }, { label: 'Hills', variant: 'primary', onClick: () => m.close() }] });
      body(s, m, 'A forced choice: no X, and a tap outside does nothing. The choices are the way out.');
    },
  },
  {
    id: 'footer-close',
    label: 'Footer Close',
    what: 'Its own Close drops the X (G5)',
    icon: 'cross',
    open: (s) => {
      const m = sheet(s, 'Footer close', 'This sheet has its own Close at the foot, so the X is dropped: one close affordance.', 120);
      sheetButton(s, m, t('common.close'), 'neutral', () => m.close(), 'kit.sheet.close');
    },
  },
  {
    id: 'replace',
    label: 'Sheet over a sheet',
    what: 'The second replaces the first; Back returns',
    icon: 'pass',
    open: (s) => {
      const m = sheet(s, 'First sheet', 'Open a second sheet: it replaces this one. Back brings this one back.', 120);
      sheetButton(s, m, 'Open the second', 'secondary', () => void sheet(s, 'Second sheet', 'The first is hidden, not lost. Close this one to return to it.'), 'kit.sheet.next');
    },
  },
  {
    id: 'confirm-over',
    label: 'Confirm over a sheet',
    what: 'The sheet stays in view under it',
    icon: 'bin',
    open: (s) => {
      const m = sheet(s, 'Bronze-shod dory', 'Scrapping asks first. The confirm sits over this sheet, which stays in view.', 120);
      sheetButton(s, m, 'Scrap…', 'secondary', () => confirmDialog(s, { title: 'Scrap it?', body: 'You get 12 bronze. The spear is gone for good.', ok: 'Scrap', destructive: true, onOk: () => (m.close(), toast(s, 'Scrapped', 'bad')) }), 'kit.sheet.scrap');    },
  },
  { id: 'confirm', label: 'Confirm', what: 'Yes or no; Cancel on the left', icon: 'check', open: (s) => void confirmDialog(s, { title: 'Leave the battle?', body: 'The fight goes on without your orders.', ok: 'Leave', onOk: () => toast(s, 'Left') }) },
  { id: 'destructive', label: 'Destructive confirm', what: 'Wine OK, never beside a primary', icon: 'skull', open: (s) => void confirmDialog(s, { title: 'Dismiss Lykon?', body: 'He leaves the warband with his gear. This cannot be undone.', ok: 'Dismiss', destructive: true, onOk: () => toast(s, 'Dismissed', 'bad') }) },
  { id: 'purchase', label: 'Purchase confirm', what: 'Telegram Stars: the blue button', icon: 'tgstar', open: (s) => void confirmPurchase(s, { what: '275 Drachmae', stars: 250, onOk: () => toast(s, 'Paid', 'good') }) },
  {
    id: 'item',
    label: 'Item card',
    what: 'Destructive left, primary right (P4)',
    icon: 'sword',
    open: (s) =>
      void openItemCard(s, {
        item: SAMPLE_ITEM,
        actions: [
          { label: 'Equip', variant: 'primary', onClick: () => toast(s, 'Equip') },
          { label: 'Sell', onClick: () => toast(s, 'Sell') },
          { label: 'Scrap', variant: 'destructive', onClick: () => toast(s, 'Scrap', 'bad') },
        ],
      }),
  },
  {
    id: 'modal',
    label: 'Legacy modal',
    what: 'openModal: the same parchment sheet',
    icon: 'info',
    open: (s) => {
      const m = openModal(s, { title: 'openModal', h: 100 });
      body(s, m, 'The same parchment sheet, for screens built from the widgets.');
    },
  },
  { id: 'toast', label: 'Toast', what: 'Under the top bar, never over a primary', icon: 'info', open: (s) => void toast(s, 'Saved: the toast sits under the top bar.') },
  { id: 'toast-good', label: 'Toast: a gain', what: 'Gain colour', icon: 'coin', open: (s) => void toast(s, '+40 gold', 'good') },
  { id: 'toast-bad', label: 'Toast: a loss', what: 'Loss colour', icon: 'cross', open: (s) => void toast(s, 'Lykon is wounded', 'bad') },
  { id: 'toast-bottom', label: 'Toast at the bottom', what: 'Above the bottom bar', icon: 'info', open: (s) => void toast(s, 'Above the bottom bar.', 'info', 2200, 'bottom') },
];

/** Opens sample `id` (scripts and the layout check). */
export function openOverlaySample(scene: KitScene, id: string): void {
  OVERLAY_SAMPLES.find((o) => o.id === id)?.open(scene);
}

/** The samples of each group: sheets, then confirms (the toasts and the tooltip go under the confirms). */
const SHEET_IDS = ['sheet', 'sheet-actions', 'decision', 'footer-close', 'replace', 'item', 'modal'];
const isToast = (o: OverlaySample) => o.id.startsWith('toast');

export function buildOverlays(cur: Cursor): void {
  const { scene } = cur;
  const rows = (into: Cursor, list: readonly OverlaySample[]) => {
    for (const o of list) {
      into.add(new ParchmentRow(scene, 0, into.y, into.w, { icon: o.icon, title: o.label, tip: o.what, onClick: () => o.open(scene), id: `kit.overlay.${o.id}` }));
      into.y += ROW_H + G;
    }
  };
  const toasts = (into: Cursor) => {
    into.title('Toasts and tips');
    rows(into, OVERLAY_SAMPLES.filter(isToast));
    const tipBtn: MButton = into.add(new MButton(scene, 0, into.y, into.w, 24, { label: 'Tooltip', variant: 'neutral', onClick: () => showTooltip(scene, 'A long press (or a resting mouse) shows the tip.', tipBtn), id: 'kit.overlay.tip' }));
    into.y += 24 + 2;
    into.note('Long-press any control for its tip; a disabled one says why.');
  };
  const note = 'One sheet plus one confirm on screen at most; Back closes the top one (F-03). Tap a row to open it.';
  // a phone upright: the v5 single column
  const lay = columns({ x: 0, y: 0, w: cur.w, h: 1 }, [ROW_PANE, ROW_PANE]);
  if (lay.shown.length < 2) {
    cur.title('Sheets and confirms');
    cur.note(note);
    rows(cur, OVERLAY_SAMPLES.filter((o) => !isToast(o)));
    toasts(cur);
    return;
  }
  // wider (V6-RSCR-10): sheets in the left pane, confirms, toasts and tips in the right, each row at most 360 (§2.3)
  const pane = (i: number): Cursor => {
    const b = lay.panes[i]!;
    const into = scene.add.container(b.x, 0);
    cur.add(into);
    const c = new Cursor(scene, cur.area, b.w, into);
    c.y = cur.y;
    return c;
  };
  const left = pane(0);
  left.title('Sheets');
  left.note(note);
  rows(left, OVERLAY_SAMPLES.filter((o) => SHEET_IDS.includes(o.id)));
  const right = pane(1);
  right.title('Confirms');
  rows(right, OVERLAY_SAMPLES.filter((o) => !isToast(o) && !SHEET_IDS.includes(o.id)));
  toasts(right);
  cur.y = Math.max(left.y, right.y);
}

/** A pane of rows: wide enough for a row's title and tip, never a stretched row (§2.3). */
const ROW_PANE = { min: 150, max: 360 };
