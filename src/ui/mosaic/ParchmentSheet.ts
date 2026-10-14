/**
 * The parchment sheet: the one modal of the v4 UI (V4_SPEC "Bottom panel"). A
 * parchment sheet on a scrim that blocks the screen below (45% basalt, P25),
 * with a Cinzel title over a fine rule, one close affordance (an X, or the
 * content's own footer Close: G5), a body area to fill and, optionally, an
 * action row of MButtons (laid out by `actionRows`: one row when the labels fit,
 * the primary alone on a row of its own, else one per row). It is a navigation
 * layer (Telegram Back closes it); a tap on the shade outside closes it too
 * unless `shadeCloses: false` (decisions, forced choices), which also drops the
 * X. `dock: 'center'` rises and fades in; `dock: 'bottom'` slides up from the
 * lower edge; both are instant under Reduce motion (A11Y-12).
 *
 * At most one sheet plus one confirm are on screen (V5-029, story F-03): a sheet
 * opened over another hides it until it closes (a page that replaces the first,
 * P13); a confirm sits over the sheet that asked, and a second confirm replaces
 * the first. Back and close always take the top one off and bring back what it
 * covered, so nothing is lost (rules: `visibleOverlays` in overlays.ts).
 *
 * What goes in the sheet is drawn for parchment by its caller (ink fonts, the
 * parchment surfaces). The returned container is marked as parchment, so a
 * scroll hint inside it fades into the paper (`surfaceUnder`, widgets.ts).
 */
import Phaser from 'phaser';
import { addText, type UIMetrics } from '../kit';
import { navLayer } from '../../platform/nav';
import { uiBlocker, uiFrame, uiId, uiPanel } from '../layout';
import { motion, tweenTo } from '../motion';
import { ellipsize, measureText } from '../textfit';
import { MOSAIC, SPACE } from '../tokens';
import { markSurface, shadeTap, type Modal } from '../widgets';
import { t } from '../../i18n';
import { GAP, mosaicImage } from './base';
import { actionRows } from './BottomPanel';
import { MButton, type MButtonOpts } from './controls';
import { MIconButton } from './iconButton';
import { SCRIM_ALPHA, closeAffordance, sheetMotion, visibleOverlays, type OverlayKind } from './overlays';
import type { Box } from './ScreenFrame';
import { panelLayout, type PanelKind, type PanelPresentation } from './layout/panels';
import { layoutVariant } from './layout/variant';
import { DIALOG_MAX, SIDE_PANEL_MAX } from '../sizeClass';

type UiScene = Phaser.Scene & { m: UIMetrics; ui: Phaser.GameObjects.Container };

export interface ParchmentSheetOpts {
  title?: string;
  /** Width (default 200 centred, 260 docked; clamped to the screen). */
  w?: number;
  /** Total height of the sheet (clamped to the screen); the action row (when there is one) is part of it. */
  h: number;
  /** One row of buttons across the bottom (equal widths; wraps when a label would not fit). */
  actions?: MButtonOpts[];
  /** Where the sheet sits: centred (default) or on the lower edge of the screen. */
  dock?: 'center' | 'bottom';
  /**
   * A tap on the shade outside closes the sheet, like Back (default true). Pass false where an outside tap
   * would skip a decision or lose progress: yes/no confirms, tutorial steps, forced choices, forms.
   */
  shadeCloses?: boolean;
  /** Draw the X (default: when the shade closes it). */
  closeButton?: boolean;
  /** A sheet (default) or a yes/no confirm: a confirm stays over the sheet under it, a sheet replaces it (V5-029). */
  kind?: OverlayKind;
  /**
   * Where the sheet goes outside compact portrait (design/ux/landscape-v6.md §3.4). `auto` (default) picks by
   * the size class and `panel`: a task sheet becomes a right side panel in landscape, a decision a centred
   * dialog. Compact portrait (every phone, every unmigrated scene) always keeps `dock`, as v5.
   */
  presentation?: 'auto' | PanelPresentation;
  /** The sheet's kind for `auto` (default: `decision` for a confirm or a sheet the shade cannot close, else `task`). */
  panel?: PanelKind;
  onClose?: () => void;
  id?: string;
}

/** The content area a side panel docks in, per scene: under the top bar, beside the nav rail (the shells set it). */
const sheetAreas = new WeakMap<Phaser.Scene, Box>();

/** Where side panels of `scene` dock (buildPage sets it to the page under its top bar; default the whole screen). */
export function setSheetArea(scene: Phaser.Scene, area: Box): void {
  // one shutdown listener per scene run: a hub rebuilds its page on every view switch
  if (!sheetAreas.has(scene)) scene.events.once('shutdown', () => sheetAreas.delete(scene));
  sheetAreas.set(scene, area);
}

/** The shade of a side panel: the screen stays readable beside it (§3.4: 20%). */
const SIDE_SHADE = 0.2;
/** A side panel slides this far in from its edge, in this time (§3.4). */
const SIDE_SLIDE = 12;
const SIDE_MS = 160;

/** Where a sheet goes and its box: v5's in compact portrait, else the §3.4 presentation. */
function placeSheet(scene: UiScene, o: ParchmentSheetOpts): { presentation: PanelPresentation; x: number; y: number; w: number; h: number } {
  const { VW, VH } = scene.m;
  const docked = o.dock === 'bottom';
  const v5 = () => {
    const w = Math.min(o.w ?? (docked ? 260 : 200), VW - (docked ? 8 : 16));
    const h = Math.min(o.h, VH - 12);
    return { presentation: (docked ? 'bottom' : 'dialog') as PanelPresentation, x: Math.round((VW - w) / 2), y: docked ? VH - h : Math.round((VH - h) / 2), w, h };
  };
  const pres = o.presentation ?? 'auto';
  if (pres === 'auto' && layoutVariant(scene.m) === 'compactPortrait') return v5();
  const kind: PanelKind = o.panel ?? (o.kind === 'confirm' || o.shadeCloses === false ? 'decision' : 'task');
  const area = sheetAreas.get(scene) ?? { x: 0, y: 0, w: VW, h: VH };
  const lay = pres === 'auto' ? panelLayout(scene.m, kind, area, o.h) : null;
  const p = lay?.presentation ?? (pres as PanelPresentation);
  if (p === 'side') {
    const r = lay?.rect ?? panelLayout({ ...scene.m, cls: 'expanded', land: true }, 'task', area, o.h).rect;
    // never narrower than the sheet the caller laid its content for (up to the side-panel cap and the area)
    const w = Math.min(Math.max(r.w, o.w ?? 0), SIDE_PANEL_MAX, area.w);
    // and never shorter than the content it holds (v5's clamp): a tall page rises over the top bar on a short screen
    const y = Math.min(r.y, VH - Math.min(o.h, VH - 12));
    return { presentation: 'side', x: r.x + r.w - w, y, w, h: r.y + r.h - y };
  }
  // a dialog or a bottom sheet keeps the width it asked for, up to the §2.3 caps
  const cap = p === 'dialog' ? DIALOG_MAX : lay?.rect.w ?? DIALOG_MAX;
  const w = Math.min(o.w ?? (p === 'bottom' ? 260 : 200), cap, VW - (p === 'bottom' ? 8 : 16));
  const h = Math.min(o.h, VH - (p === 'dialog' ? 16 : 12));
  return { presentation: p, x: Math.round((VW - w) / 2), y: p === 'bottom' ? VH - h : Math.round((VH - h) / 2), w, h };
}

/**
 * The box a sheet opened with `o` would get (V6-RSCR-05): a caller that lays out its own content measures it
 * from this width, so a side panel's content fills the panel it is given. Compact portrait returns v5's box.
 */
export function sheetBox(scene: UiScene, o: ParchmentSheetOpts): { presentation: PanelPresentation; x: number; y: number; w: number; h: number } {
  return placeSheet(scene, o);
}

export interface ParchmentSheetHandle extends Modal {
  buttons: MButton[];
}

/** Height the title takes inside the sheet (title, rule and the gap under it), UI px. */
export const SHEET_TITLE_H = 26;
export const SHEET_ACTION_H = 24;
/** Padding at the sheet's edges, UI px. */
const PAD = 8;

/** Height of the action rows of a sheet `w` wide (0 without actions). */
export function sheetActionsH(actions: MButtonOpts[] | undefined, w: number): number {
  if (!actions?.length) return 0;
  const rows = actionRows(actions, w - SPACE.md * 2).length;
  return rows * (SHEET_ACTION_H + GAP) + SPACE.sm;
}

// ------------------------------------------------------------------ overlay stack (V5-029)

interface Overlay {
  kind: OverlayKind;
  c: Phaser.GameObjects.Container;
}

/** The open sheets and confirms of each scene, oldest first. */
const overlays = new WeakMap<Phaser.Scene, Overlay[]>();

/** Show the overlays the rule keeps on screen, hide the rest (hidden ones take no input). */
function restack(scene: Phaser.Scene): void {
  const list = overlays.get(scene) ?? [];
  const vis = visibleOverlays(list.map((o) => o.kind));
  list.forEach((o, i) => o.c.scene && o.c.setVisible(vis[i]));
}

function dropOverlay(scene: Phaser.Scene, o: Overlay): void {
  const list = overlays.get(scene);
  const i = list?.indexOf(o) ?? -1;
  if (!list || i < 0) return;
  list.splice(i, 1);
  restack(scene);
}

/** The kinds of the overlays open on `scene`, oldest first (for scripts and the Kit). */
export function openOverlays(scene: Phaser.Scene): OverlayKind[] {
  return (overlays.get(scene) ?? []).map((o) => o.kind);
}

/** A live control in `c` labelled Close other than `except` (a screen's own footer Close). */
function hasFooterClose(c: Phaser.GameObjects.Container, except: Phaser.GameObjects.GameObject | null): boolean {
  const names = new Set([t('common.close'), t('mosaic.close')]);
  const walk = (list: Phaser.GameObjects.GameObject[]): boolean =>
    list.some((o) => {
      if (o === except || !(o as { visible?: boolean }).visible) return false;
      const label = (o as { opts?: { label?: unknown } }).opts?.label;
      if (typeof label === 'string' && names.has(label)) return true;
      const sub = (o as { list?: Phaser.GameObjects.GameObject[] }).list;
      return !!sub && walk(sub);
    });
  return walk(c.list);
}

/** No more input on a sheet that is leaving (its out-motion must not catch a second tap). */
function freeze(o: Phaser.GameObjects.GameObject): void {
  if (o.input) o.disableInteractive();
  for (const ch of (o as { list?: Phaser.GameObjects.GameObject[] }).list ?? []) freeze(ch);
}

/** The title over its rule, centred on the sheet, with the X at the right. Returns the y where the body starts and the X. */
function addTitle(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, w: number, title: string, close: (() => void) | undefined, id: string): { top: number; x: MIconButton | null } {
  const side = close ? 26 : PAD;
  const room = w - side * 2;
  const size = [9, 8.5, 8, 7.5, 7, 6.5, 6].find((z) => measureText(title, false, z, 'roman') <= room) ?? 6;
  const txt = addText(scene, x + w / 2, y + 9, ellipsize(title, room, false, size, 'roman'), 'rInk', 0.5).setFontSize(size);
  uiFrame(txt, parent as unknown as Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, w, 24, x, y);
  parent.add(txt);
  const g = scene.add.graphics();
  g.lineStyle(0.7, MOSAIC.parchEdge, 0.7);
  g.lineBetween(x + side, y + 21, x + w - side, y + 21);
  parent.add(g);
  const xb = close ? new MIconButton(scene, x + w - 25, y + 1, 22, 22, { icon: 'xmark', label: t('mosaic.close'), variant: 'secondary', id: `${id}.close`, onClick: close }) : null;
  if (xb) parent.add(xb);
  return { top: y + SHEET_TITLE_H, x: xb };
}

export function openParchmentSheet(scene: UiScene, o: ParchmentSheetOpts): ParchmentSheetHandle {
  const { VW, VH } = scene.m;
  const { presentation, x, y, w, h } = placeSheet(scene, o);
  const docked = presentation === 'bottom';
  const side = presentation === 'side';
  const id = o.id ?? 'sheet';
  const c = scene.add.container(0, 0);
  scene.ui.add(c);
  const shade = scene.add.rectangle(0, 0, VW, VH, MOSAIC.page, side ? SIDE_SHADE : SCRIM_ALPHA).setOrigin(0, 0).setInteractive(side ? { cursor: 'default' } : undefined);
  uiBlocker(shade);
  c.add(shade);
  const box = scene.add.container(0, 0);
  c.add(box);
  // a docked sheet reaches under the screen's lower edge (it slides up from there)
  box.add(mosaicImage(scene, x, y, w, docked ? h + 10 : h, 'sheet'));
  // a docked side panel: the layout check judges the screen beside it, and the panel by the §3.4 widths (V6-063)
  if (side) uiPanel(box, x, y, w, h, true);
  const sm = side ? { in: motion.reduced ? 0 : SIDE_MS, out: 0, rise: 0 } : sheetMotion(motion.reduced);
  const entry: Overlay = { kind: o.kind ?? 'sheet', c };
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    dropOverlay(scene, entry);
    if (docked && sm.out) {
      freeze(c);
      tweenTo(scene, box, { y: h + 12 }, sm.out, { ease: 'Cubic.easeIn' });
      tweenTo(scene, shade, { alpha: 0 }, sm.out, { onComplete: () => c.destroy() });
    } else c.destroy();
    o.onClose?.();
  };
  const shadeCloses = o.shadeCloses !== false;
  const withX = o.closeButton ?? shadeCloses;
  const head = o.title ? addTitle(scene, box, x, y, w, o.title, withX ? close : undefined, id) : { top: y + PAD, x: null };
  const top = head.top;
  const rows = o.actions?.length ? actionRows(o.actions, w - SPACE.md * 2) : [];
  const actionsH = rows.length ? rows.length * (SHEET_ACTION_H + GAP) + SPACE.sm : 0;
  const buttons: MButton[] = [];
  rows.forEach((row, ri) => {
    const aw = Math.floor((w - SPACE.md * 2 - GAP * (row.length - 1)) / row.length);
    row.forEach((a, i) => {
      const by = y + h - SPACE.md - (rows.length - ri) * SHEET_ACTION_H - (rows.length - ri - 1) * GAP;
      const b = new MButton(scene, x + SPACE.md + i * (aw + GAP), by, aw, SHEET_ACTION_H, { variant: 'neutral', ...a });
      box.add(b);
      buttons.push(b);
    });
  });
  if (shadeCloses) shadeTap(shade, { x, y, w, h }, close);
  navLayer(c, close, scene);
  markSurface(box, MOSAIC.parch);
  // one close affordance (G5): once the caller has filled the sheet, a footer Close of its own makes the X redundant
  const xb = head.x;
  if (xb) scene.events.once('prerender', () => xb.scene && !closeAffordance({ closable: true, footerClose: hasFooterClose(box, xb) }).x && xb.destroy());
  if (sm.in && side) {
    // a side panel slides in from its edge with a fade (§3.4)
    box.x = SIDE_SLIDE;
    box.alpha = 0;
    tweenTo(scene, box, { x: 0, alpha: 1 }, sm.in, { ease: 'Cubic.easeOut' });
    shade.alpha = 0;
    tweenTo(scene, shade, { alpha: 1 }, sm.in);
  } else if (sm.in) {
    if (docked) box.y = h + 12;
    else {
      box.y = sm.rise;
      box.alpha = 0;
    }
    tweenTo(scene, box, { y: 0, alpha: 1 }, sm.in);
    shade.alpha = 0;
    tweenTo(scene, shade, { alpha: 1 }, sm.in);
  }
  const list = overlays.get(scene) ?? [];
  overlays.set(scene, list);
  list.push(entry);
  c.once('destroy', () => dropOverlay(scene, entry));
  restack(scene);
  uiId(c, id);
  return { c: box, x, y, w, h, body: { x: x + PAD, y: top, w: w - PAD * 2, h: y + h - PAD - top - actionsH }, buttons, close };
}
