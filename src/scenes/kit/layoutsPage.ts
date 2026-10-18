/**
 * The Kit's Layouts page (V6-RFND-02, design/ux/landscape-v6.md §3, §13.4): every layout primitive
 * in the variant of the window it runs in. The page is opted in to the size classes (ADR-0013), so
 * the four variants are the matrix sizes: 390x844 compact portrait, 844x390 compact landscape,
 * 768x1024 medium, 1280x800 expanded. A switch picks one of four demos:
 *
 * - Panes: `columns` with three panes (a roster, a `grid` of spoils, campaign notes); a folded pane
 *   is one tap away (it opens as a panel), never dropped.
 * - List: `masterDetail`; the first item shows on arrival, a row selects (or opens the detail as a
 *   bottom sheet in compact portrait). The detail is a real unit card: text, a stat grid, traits.
 * - Panels: a stash screen (its actions, then a `grid` of items) under `openPanel` for a task sheet,
 *   a decision, an inspector and settings, and the rotate card.
 *
 * The demos hold real-length content (V6-063): the Kit is the reference the screens copy, and the
 * layout check judges them as screens, so a sparse demo fails wasted-width and empty-column.
 * - Field: `edgeClusters` over a field with the framing rect drawn on it.
 */
import Phaser from 'phaser';
import { ScrollArea, addText } from '../../ui/kit';
import { uiCollapsed, uiId, uiLayout } from '../../ui/layout';
import { motion, tweenTo } from '../../ui/motion';
import { BUTTON_MAX, ROW_MAX, READING_MAX } from '../../ui/sizeClass';
import { MOSAIC } from '../../ui/tokens';
import { addIcon, scaleIcon } from '../../ui/kit';
import { renderGround } from '../../art/ground';
import { GAP, MButton, MChip, MIconButton, ParchmentCard, ParchmentRow, SECTION_TITLE_H, SWITCH_H, ScreenFrame, SectionTitle, SegmentedSwitch, TopBar, mtext, mw } from '../../ui/mosaic';
import { makePressable } from '../../ui/mosaic/base';
import { columns, edgeClusters, grid, gridColumns, layoutVariant, masterDetail, mountRotateCard, openPanel, panelLayout, type Box, type ClusterId, type LayoutVariant, type PanelKind } from '../../ui/mosaic/layout';
import type { C, KitScene } from './common';

export type LayoutDemo = 'panes' | 'list' | 'panels' | 'field';
/** The samples scripts open (`s.layoutsSample(id)`, the kit-layouts-* checks). */
export type LayoutSample = 'task' | 'decision' | 'inspector' | 'settings' | 'rotate' | 'folded' | 'detail';

interface LayoutsOpts {
  /** Top of the page (under the Kit's pager). */
  top: number;
  demo: LayoutDemo;
  /** The selected row of the List demo. */
  sel: number;
  leftHand: boolean;
  /** Rebuild the page with these (a restart: the state survives a resize). */
  go: (o: { demo?: LayoutDemo; sel?: number }) => void;
  cleanup: (f: () => void) => void;
}

export interface LayoutsPage {
  sample(id: LayoutSample): void;
}

const VARIANT_NAME: Record<LayoutVariant, string> = { compactPortrait: 'Compact portrait', compactLandscape: 'Compact landscape', medium: 'Medium', expanded: 'Expanded' };

interface Unit {
  name: string;
  role: string;
  icon: string;
  text: string;
  /** Attack, defence, range, speed, morale, upkeep (the unit card's stat grid). */
  stats: readonly [number, number, number, number, number, number];
  traits: readonly string[];
}

const UNITS: readonly Unit[] = [
  { name: 'Hoplites', role: 'Heavy infantry', icon: 'shield', text: 'Bronze-shod spearmen in a deep file. They hold a line against a charge and push when it breaks.', stats: [6, 9, 1, 3, 8, 4], traits: ['Shield wall', 'Push of pike'] },
  { name: 'Peltasts', role: 'Skirmishers', icon: 'throw', text: 'Light javelin troops. They harry the flanks and fall back before heavy foot can close.', stats: [5, 3, 4, 7, 5, 2], traits: ['Javelins', 'Fall back'] },
  { name: 'Archers', role: 'Missile troops', icon: 'volley', text: 'Cretan bowmen. Volleys thin a charge before it lands; keep them behind the line.', stats: [4, 2, 8, 5, 5, 3], traits: ['Volley', 'Fire arrows'] },
  { name: 'Companions', role: 'Heavy cavalry', icon: 'charge', text: "The king's horse. A wedge that breaks a wavering line from the flank.", stats: [9, 6, 1, 9, 9, 6], traits: ['Wedge', 'Charge'] },
  { name: 'Slingers', role: 'Missile troops', icon: 'push', text: 'Rhodian slingers. Their lead bullets outrange the bow and dent bronze.', stats: [5, 2, 9, 5, 4, 2], traits: ['Lead shot', 'Skirmish'] },
  { name: 'Thureophoroi', role: 'Medium infantry', icon: 'helmet', text: 'Oval shields and long spears; quick enough to plug a gap anywhere in the line.', stats: [6, 6, 2, 5, 6, 3], traits: ['Plug the gap', 'Javelins'] },
  { name: 'Militia', role: 'Levy', icon: 'people', text: 'Farmers called to the colours. Cheap, many, and quick to waver.', stats: [3, 4, 1, 4, 2, 1], traits: ['Many hands'] },
  { name: 'Royal guard', role: 'Elite infantry', icon: 'laurel', text: 'Picked men round the standard. They do not rout while the general stands.', stats: [8, 9, 1, 4, 10, 7], traits: ['Unbreakable', 'Shield wall'] },
  { name: 'Hypaspists', role: 'Elite infantry', icon: 'shield', text: 'Shield-bearers of the king. Lighter than the phalanx and quicker to turn a flank.', stats: [7, 7, 1, 6, 8, 5], traits: ['Shield wall', 'Night march'] },
  { name: 'Prodromoi', role: 'Light cavalry', icon: 'charge', text: 'Scouts on fast horses with lances. They find the enemy and run down his skirmishers.', stats: [6, 3, 1, 10, 6, 4], traits: ['Scout', 'Run down'] },
  { name: 'Toxotai', role: 'Missile troops', icon: 'volley', text: 'Hired Scythian archers. Shorter range than the Cretans, but they shoot from the saddle.', stats: [4, 3, 6, 8, 5, 3], traits: ['Mounted volley'] },
  { name: 'Agrianes', role: 'Skirmishers', icon: 'throw', text: 'Hill javelin men from the north. They climb where no phalanx can follow.', stats: [5, 3, 4, 8, 7, 3], traits: ['Javelins', 'Hill fighters'] },
];

const STAT_NAMES = ['Attack', 'Defence', 'Range', 'Speed', 'Morale', 'Upkeep'] as const;

/** The spoils of a battle: the item grid of the Panes demo and the stash of the Panels demo. */
const SPOILS: readonly { icon: string; name: string; n: number }[] = [
  { icon: 'coin', name: 'Silver drachmae', n: 240 },
  { icon: 'chest', name: 'Strongbox', n: 1 },
  { icon: 'sword', name: 'Kopis', n: 2 },
  { icon: 'shield', name: 'Aspis', n: 3 },
  { icon: 'helmet', name: 'Corinthian helm', n: 1 },
  { icon: 'armor', name: 'Linothorax', n: 2 },
  { icon: 'spear', name: 'Dory', n: 6 },
  { icon: 'food', name: 'Grain', n: 40 },
  { icon: 'wood', name: 'Timber', n: 12 },
  { icon: 'amphora', name: 'Wine', n: 8 },
  { icon: 'ring', name: 'Signet ring', n: 1 },
  { icon: 'scales', name: 'Bronze scales', n: 1 },
];

const NOTES = [
  'Day 3 of the march. The Persian camp lies two days east, past the ford. Scouts count forty files of horse on the far bank and slingers in the reeds.',
  'Hold the hoplites in a deep file at the ford with the archers behind them. The Companions wait on the right until the line wavers.',
  'Grain for six days, wine for four. Pay falls due at the next town: 240 drachmae, and the militia will not march unpaid.',
];

export function buildLayouts(scene: KitScene, p: C, o: LayoutsOpts): LayoutsPage {
  const { VW, VH } = scene.m;
  const variant = layoutVariant(scene.m);
  // the variant this page built, for the layout check's class-match (a field is judged by field-coverage)
  uiLayout(scene, scene.m.cls, scene.m.land, o.demo === 'field' ? 'field' : 'menu');
  const demoSwitch = (x: number, y: number, w: number) =>
    new SegmentedSwitch(scene, x, y, w, {
      options: [
        { id: 'panes', label: 'Panes' },
        { id: 'list', label: 'List' },
        { id: 'panels', label: 'Panels' },
        { id: 'field', label: 'Field' },
      ],
      selected: o.demo,
      onChange: (id) => o.go({ demo: id as LayoutDemo }),
    });
  // a field is full bleed (§0 principle 3): no frame, the demo switch is its top strip
  if (o.demo === 'field') return fieldDemo({ scene, p, o, area: { x: 0, y: o.top, w: VW, h: VH - o.top }, variant }, demoSwitch);
  const frame = new ScreenFrame(scene, VW, VH, { y: o.top });
  p.add(frame);
  p.add(new TopBar(scene, frame.topBar, { title: VARIANT_NAME[variant] }));
  const c0 = frame.content;
  // a segmented control spans its pane (§2.3) where the height is short; elsewhere it keeps to 320
  p.add(demoSwitch(c0.x + 4, c0.y + 4, variant === 'compactLandscape' ? c0.w - 8 : Math.min(c0.w - 8, 320)));
  const area: Box = { x: c0.x + 4, y: c0.y + 4 + SWITCH_H + 6, w: c0.w - 8, h: c0.y + c0.h - (c0.y + 4 + SWITCH_H + 6) - 4 };
  const ctx = { scene, p, o, area, variant };
  if (o.demo === 'list') return listDemo(ctx);
  if (o.demo === 'panels') return panelsDemo(ctx);
  return panesDemo(ctx);
}

interface Ctx {
  scene: KitScene;
  p: C;
  o: LayoutsOpts;
  area: Box;
  variant: LayoutVariant;
}

/** A pane: a parchment card with a title naming it (`id`) and its width, and a scroll area for its content. */
function pane(ctx: Ctx, b: Box, title: string, id: string): { area: ScrollArea; w: number } {
  const { scene, p } = ctx;
  p.add(new ParchmentCard(scene, b.x, b.y, b.w, b.h));
  p.add(titled(new SectionTitle(scene, b.x + 4, b.y + 4, b.w - 8, `${title} ${b.w}`.toUpperCase(), { size: 8 }), id));
  const top = b.y + 4 + SECTION_TITLE_H + 2;
  const area = new ScrollArea(scene, p, b.x + 4, top, b.w - 8, b.y + b.h - 4 - top, scene.m.S);
  ctx.o.cleanup(() => area.destroy());
  return { area, w: b.w - 8 - 4 };
}

/** Names a section title by its text (the id `element-parity` and `uiCollapsed` read). */
function titled(t: SectionTitle, id: string): SectionTitle {
  const txt = t.list.find((o) => o instanceof Phaser.GameObjects.BitmapText);
  if (txt) uiId(txt, id);
  return t;
}

function rows(ctx: Ctx, area: ScrollArea, w: number, sel: number, onPick: (i: number) => void): number {
  let y = 0;
  UNITS.forEach((u, i) => {
    const row = new ParchmentRow(ctx.scene, 0, y, Math.min(w, ROW_MAX), { icon: u.icon, title: u.name, selected: i === sel, onClick: () => onPick(i), id: `kit.layouts.row${i}` }, 26);
    if (row.input) row.input.cursor = 'pointer';
    area.content.add(row);
    y += 26 + GAP + 1;
  });
  return y;
}

/** The item grid from `y`: a slot per item with its count; a tap opens the item (`onPick`). Returns its bottom. */
function spoils(ctx: Ctx, area: ScrollArea, w: number, o: { x?: number; y?: number; minCell?: number; maxCols?: number; onPick?: (i: number) => void } = {}): number {
  const g = grid({ x: o.x ?? 0, y: o.y ?? 0, w, h: 0 }, SPOILS.length, { minCell: o.minCell ?? 40, maxCols: o.maxCols ?? 6 });
  g.cells.forEach((cell, i) => {
    const it = SPOILS[i];
    const card = new ParchmentCard(ctx.scene, cell.x, cell.y, cell.w, cell.h, { id: `kit.layouts.item${i}` });
    const ic = scaleIcon(addIcon(ctx.scene, 0, 0, it.icon), Math.min(2, (cell.w - 16) / 12));
    ic.setPosition(Math.round((cell.w - ic.displayWidth) / 2), Math.round((cell.h - ic.displayHeight) / 2) - 3);
    card.add(ic);
    const count = mtext(ctx.scene, 0, 0, String(it.n), 'pInk', { size: 6.5 });
    count.setPosition(cell.w - 4 - Math.ceil(count.width), cell.h - 3 - Math.ceil(count.height));
    card.add(count);
    makePressable(card, { w: cell.w, h: cell.h, onTap: () => o.onPick?.(i), tip: it.name });
    if (card.input) card.input.cursor = 'pointer';
    area.content.add(card);
  });
  return (o.y ?? 0) + g.h;
}

function note(ctx: Ctx, area: ScrollArea, y: number, w: number, text: string, font: 'pInk' | 'pSec' = 'pSec'): number {
  const t = mtext(ctx.scene, 0, y, text, font, { size: font === 'pInk' ? 7 : 6.5, maxW: Math.min(w, READING_MAX), wrap: true });
  area.content.add(t);
  return y + Math.ceil(t.height) + 6;
}

/** The Notes pane: the campaign's notes, then what this width shows. Returns its height. */
function notes(ctx: Ctx, area: ScrollArea, w: number, shown: number): number {
  let y = 0;
  for (const para of NOTES) y = note(ctx, area, y, w, para, 'pInk');
  return note(ctx, area, y, w, notesText(shown));
}

/** An item of the grid, opened as a task panel. */
function openItem(ctx: Ctx, i: number): void {
  const it = SPOILS[i];
  const h = openPanel(ctx.scene, { kind: 'task', title: it.name, h: 150, area: panelArea(ctx), leftHand: ctx.o.leftHand, id: 'kit.layouts.itemCard' });
  h.c.add(mtext(ctx.scene, h.body.x, h.body.y, `${it.n} in the baggage train. Sell at the market, or keep for the army.`, 'pInk', { size: 7, maxW: Math.min(h.body.w, READING_MAX), wrap: true }));
}

/** The side-panel area of this page: the frame's content (a sub-screen draws no nav rail). */
function panelArea(ctx: Ctx): Box {
  return { x: ctx.area.x - 4, y: ctx.area.y - SWITCH_H - 10, w: ctx.area.w + 8, h: ctx.area.h + SWITCH_H + 14 };
}

function panesDemo(ctx: Ctx): LayoutsPage {
  const { scene, p, area } = ctx;
  const specs = [{ min: 150, max: 300 }, { min: 150 }, { min: 120, max: 200 }];
  const names = ['Roster', 'Spoils', 'Notes'];
  const lay = columns(area, specs);
  let top = area.y;
  // a folded pane stays one tap away (rearrange, never drop: §0, the element-parity rule)
  const openFolded = (i: number) => {
    const h = openPanel(scene, { kind: 'task', title: names[i], h: 200, area: panelArea(ctx), leftHand: ctx.o.leftHand, id: `kit.layouts.pane${i}` });
    const a = new ScrollArea(scene, h.c, h.body.x, h.body.y, h.body.w, h.body.h, scene.m.S);
    h.c.once('destroy', () => a.destroy());
    a.setContentHeight(i === 1 ? spoils(ctx, a, h.body.w - 4) : notes(ctx, a, h.body.w - 4, lay.shown.length));
  };
  if (lay.hidden.length) {
    const bw = Math.min(BUTTON_MAX, Math.floor((area.w - GAP * (lay.hidden.length - 1)) / lay.hidden.length));
    lay.hidden.forEach((i, k) => p.add(new MButton(scene, area.x + k * (bw + GAP), area.y, bw, 22, { label: names[i], icon: 'more', variant: 'secondary', id: `kit.layouts.fold${i}`, onClick: () => openFolded(i) })));
    top += 22 + 6;
  }
  for (const i of lay.shown) {
    const b = { ...lay.panes[i]!, y: top, h: area.y + area.h - top };
    const { area: a, w } = pane(ctx, b, names[i], `kit.layouts.pane${i}`);
    // a pane shown in place needs no fold button, nor the panel it opens (element-parity)
    uiCollapsed(scene, `kit.layouts.fold${i}`, `kit.layouts.pane${i}`);
    uiCollapsed(scene, `kit.layouts.pane${i}.close`, `kit.layouts.pane${i}`);
    if (i === 0) a.setContentHeight(rows(ctx, a, w, -1, () => {}));
    else if (i === 1) a.setContentHeight(spoils(ctx, a, w, { onPick: (k) => openItem(ctx, k) }));
    else a.setContentHeight(notes(ctx, a, w, lay.shown.length));
  }
  return {
    sample: (id) => {
      if (id === 'folded' && lay.hidden.length) openFolded(lay.hidden[0]);
    },
  };
}

function notesText(n: number): string {
  return `${n} of 3 panes fit this width. Under 300 UI px one pane shows (the v5 stack), from 300 two, from 560 three. Panes keep an 8 px gutter; each scrolls on its own.`;
}

function listDemo(ctx: Ctx): LayoutsPage {
  const { scene, p, area, o } = ctx;
  const md = masterDetail(area, scene.m);
  const sel = Math.max(0, Math.min(UNITS.length - 1, o.sel));
  /** The detail, top down from (x, y), `w` wide: the unit card (text, a stat grid, traits, its action); returns its height. */
  const fillDetail = (parent: C, x: number, y: number, w: number, u: Unit): number => {
    parent.add(titled(new SectionTitle(scene, x, y, w, u.name.toUpperCase(), { size: 8 }), 'kit.layouts.detail.title'));
    let yy = y + SECTION_TITLE_H + 4;
    const t = mtext(scene, x, yy, u.text, 'pInk', { size: 7, maxW: Math.min(w, READING_MAX), wrap: true });
    parent.add(t);
    yy += Math.ceil(t.height) + 4;
    const r = mtext(scene, x, yy, u.role, 'pSec', { size: 6.5, maxW: w });
    parent.add(r);
    yy += Math.ceil(r.height) + 6;
    // the stats reflow by width (a Grid, §3.7): three columns in a wide pane, fewer in a narrow one
    const sg = grid({ x, y: yy, w, h: 0 }, STAT_NAMES.length, { minCell: 64, maxCols: 3, cellH: 30 });
    sg.cells.forEach((cell, i) => {
      const card = new ParchmentCard(scene, cell.x, cell.y, cell.w, cell.h);
      card.add(mtext(scene, 6, 4, STAT_NAMES[i], 'pSec', { size: 6.5, maxW: cell.w - 12 }));
      card.add(mtext(scene, 6, 15, String(u.stats[i]), 'pInk', { size: 8, maxW: cell.w - 12 }));
      parent.add(card);
    });
    yy += sg.h + 6;
    parent.add(new SectionTitle(scene, x, yy, w, 'TRAITS', { size: 7 }));
    yy += SECTION_TITLE_H + 2;
    const tg = grid({ x, y: yy, w, h: 0 }, u.traits.length, { minCell: 96, maxCols: 3, cellH: 22 });
    tg.cells.forEach((cell, i) => {
      const card = new ParchmentCard(scene, cell.x, cell.y, cell.w, cell.h);
      card.add(mtext(scene, 6, 7, u.traits[i], 'pInk', { size: 7, maxW: cell.w - 12 }));
      parent.add(card);
    });
    yy += tg.h + 8;
    parent.add(new MButton(scene, x, yy, Math.min(w, BUTTON_MAX), 24, { label: 'Equip', icon: 'helmet', variant: 'primary', id: 'kit.layouts.equip', onClick: () => {} }));
    return yy + 24 - y;
  };
  const openDetail = (i: number) => {
    const h = openPanel(scene, { kind: 'task', title: UNITS[i].role, h: 260, area: panelArea(ctx), leftHand: o.leftHand, id: 'kit.layouts.detail' });
    const a = new ScrollArea(scene, h.c, h.body.x, h.body.y, h.body.w, h.body.h, scene.m.S);
    h.c.once('destroy', () => a.destroy());
    a.setContentHeight(fillDetail(a.content, 0, 0, h.body.w - 4, UNITS[i]) + 4);
  };
  const m = pane(ctx, md.master, 'Units', 'kit.layouts.units');
  m.area.setContentHeight(rows(ctx, m.area, m.w, md.split ? sel : -1, (i) => (md.split ? o.go({ sel: i }) : openDetail(i))));
  if (md.detail) {
    const d = md.detail;
    // the detail is a pane here, not a sheet: no sheet to close (element-parity)
    uiCollapsed(scene, 'kit.layouts.detail.close', 'kit.layouts.detail.title');
    p.add(new ParchmentCard(scene, d.x, d.y, d.w, d.h, { selected: false }));
    // the detail pane scrolls on its own (§3.2)
    const a = new ScrollArea(scene, p, d.x + 6, d.y + 6, d.w - 12, d.h - 12, scene.m.S);
    o.cleanup(() => a.destroy());
    const box = a.content;
    a.setContentHeight(fillDetail(box, 0, 0, d.w - 12 - 4, UNITS[sel]) + 4);
    // a 120 ms cross-fade on a new selection; none under Reduce motion (§3.3)
    if (!motion.reduced && o.sel !== 0) {
      box.alpha = 0;
      tweenTo(scene, box, { alpha: 1 }, 120);
    }
  }
  return { sample: (id) => id === 'detail' && !md.split && openDetail(sel) };
}

/** What each sample panel says (real-length text, as the screens' sheets hold). */
const PANEL_TEXT: Record<PanelKind | 'inspector', string> = {
  task: 'An ash spear eight feet long with a bronze butt-spike. Two more attack in a deep file; a broken shaft still fights on its spike.',
  decision: 'Turn back now and the army keeps its spoils, but the ford is lost and the march starts again from camp.',
  inspector: 'The screen stays live beside this panel: pick another item in the stash and the inspector follows it.',
  settings: 'Sound, language, motion and controls. In expanded this is a centred panel, 80% of the height.',
};

function panelsDemo(ctx: Ctx): LayoutsPage {
  const { scene, p, area, o } = ctx;
  const m = scene.m;
  const pa = panelArea(ctx);
  const open = (kind: PanelKind, inspector = false) => {
    const title = inspector ? 'Inspector' : kind === 'decision' ? 'Abandon the march?' : kind === 'settings' ? 'Settings' : 'Bronze-shod dory';
    const h = openPanel(scene, {
      kind,
      title,
      h: kind === 'decision' ? 130 : 170,
      // an inspector docks beside the demo's controls, under its switch; the stash reflows beside it
      area: inspector ? { ...pa, y: area.y, h: pa.y + pa.h - area.y } : pa,
      inspector,
      onClose: () => inspector && sa.content.scene && fill(0, area.w),
      leftHand: o.leftHand,
      id: `kit.layouts.${inspector ? 'inspector' : kind}`,
      actions: kind === 'decision' ? [{ label: 'Stay', variant: 'neutral', onClick: () => h.close() }, { label: 'Abandon', variant: 'primary', onClick: () => h.close() }] : undefined,
    });
    if (inspector && h.presentation === 'side') {
      // the screen stays live beside the inspector: it reflows into the room the panel leaves (rearrange, never drop)
      const x0 = o.leftHand ? h.x + h.w + 8 : area.x;
      const x1 = o.leftHand ? area.x + area.w : h.x - 8;
      fill(x0 - area.x, x1 - x0);
    }
    const lay = panelLayout(m, kind, pa, 170);
    const line = `${h.presentation === 'side' ? (inspector ? 'Inspector side panel, no shade' : 'Modal side panel') : h.presentation === 'dialog' ? 'Centred dialog' : 'Bottom sheet'}, ${lay.rect.w} UI px wide.`;
    // the body scrolls where the panel is short (a side panel at 844x390)
    const ba = new ScrollArea(scene, h.c, h.body.x, h.body.y, h.body.w, h.body.h, m.S);
    h.c.once('destroy', () => ba.destroy());
    const maxW = Math.min(h.body.w - 4, READING_MAX);
    const body = mtext(scene, 0, 0, PANEL_TEXT[inspector ? 'inspector' : kind], 'pInk', { size: 7, maxW, wrap: true });
    const meta = mtext(scene, 0, Math.ceil(body.height) + 6, line, 'pSec', { size: 6.5, maxW, wrap: true });
    ba.content.add([body, meta]);
    ba.setContentHeight(meta.y + Math.ceil(meta.height) + 4);
  };
  const items: [string, string, () => void][] = [
    ['Task sheet', 'task', () => open('task')],
    ['Decision', 'decision', () => open('decision')],
    ['Inspector', 'inspector', () => open('task', true)],
    ['Settings', 'settings', () => open('settings')],
    ['Rotate card', 'rotate', () => o.cleanup(mountRotateCard(scene, { force: true }))],
  ];
  const sa = new ScrollArea(scene, p, area.x, area.y, area.w, area.h, m.S);
  o.cleanup(() => sa.destroy());
  const where = (k: PanelKind) => panelLayout(m, k, pa, 170).presentation;
  /** The screen in the `w` wide column from `x` (the whole area, or beside an inspector). */
  const fill = (x: number, w: number) => {
    sa.content.removeAll(true);
    sa.setScroll(0);
    // the buttons reflow by width (a Grid of two columns where they fit) and scroll when the height runs out
    const cols = gridColumns(w, { minCell: 140, maxCols: 2, gap: 8 });
    const bw = Math.min(BUTTON_MAX, Math.floor((w - 8 * (cols - 1)) / cols));
    items.forEach(([label, id, fn], i) => {
      sa.content.add(new MButton(scene, x + (i % cols) * (bw + 8), Math.floor(i / cols) * (24 + 6), bw, 24, { label, variant: i === 0 ? 'primary' : 'secondary', id: `kit.layouts.open.${id}`, onClick: fn }));
    });
    const y0 = Math.ceil(items.length / cols) * 30 + 4;
    const cw = cols * bw + (cols - 1) * 8;
    const t = mtext(scene, 6, 6, `${m.VW}x${m.VH} UI, S ${m.S}. Task: ${where('task')}. Decision: ${where('decision')}. Settings: ${where('settings')}.`, 'pInk', { size: 7, maxW: Math.min(cw - 12, READING_MAX), wrap: true });
    const card = new ParchmentCard(scene, x, y0, cw, Math.ceil(t.height) + 12);
    card.add(t);
    sa.content.add(card);
    // the screen under the panels: a stash, its items in a grid across the pane; an item opens as a task panel
    const y1 = y0 + card.h + 6;
    sa.content.add(new SectionTitle(scene, x, y1, w - 4, `STASH ${SPOILS.length}`, { size: 8 }));
    sa.setContentHeight(spoils(ctx, sa, w - 4, { x, y: y1 + SECTION_TITLE_H + 4, minCell: 52, maxCols: 10, onPick: (i) => openItem(ctx, i) }) + 4);
  };
  fill(0, area.w);
  return {
    sample: (id) => {
      if (id === 'task' || id === 'decision' || id === 'settings') open(id);
      else if (id === 'inspector') open('task', true);
      else if (id === 'rotate') o.cleanup(mountRotateCard(scene, { force: true }));
    },
  };
}

function fieldDemo(ctx: Ctx, demoSwitch: (x: number, y: number, w: number) => SegmentedSwitch): LayoutsPage {
  const { scene, p, area, o, variant } = ctx;
  const key = `kit_field_${area.w}x${area.h}`;
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, renderGround(area.w, area.h, { originX: 0, originY: area.w, fieldW: 1e6, fieldH: 1e6, seed: 5 }).toCanvas());
  p.add(scene.add.image(area.x, area.y, key).setOrigin(0, 0));
  const narrow = variant === 'compactPortrait';
  const cardW = narrow ? 58 : 76;
  const switchW = Math.min(area.w - 12, 240);
  const order = ['charge', 'hold', 'volley', 'f_line', 'rally'];
  const sizes: Record<ClusterId, { w: number; h: number }> = {
    tl: { w: 64, h: 18 },
    tr: { w: 22, h: 22 },
    top: { w: switchW, h: SWITCH_H },
    left: { w: cardW, h: 3 * 24 + 2 * GAP },
    right: { w: 22, h: 3 * 22 + 2 * 4 },
    bottom: { w: order.length * 22 + (order.length - 1) * 4, h: 22 },
    bl: { w: 22, h: 22 },
    br: { w: 22, h: 22 },
  };
  let lay = edgeClusters(area, sizes, { leftHand: o.leftHand });
  // where the band between the top and bottom rows is too short for the ability column, it turns into a row
  // (rearrange, never drop: §0, element-parity)
  const abilityRow = lay.rects.right!.h < sizes.right.h;
  if (abilityRow) lay = edgeClusters(area, { ...sizes, right: { w: 3 * 22 + 2 * 4, h: 22 } }, { leftHand: o.leftHand });
  const r = lay.rects;
  // the clusters are opaque (stone): the field shows between them
  for (const b of Object.values(r)) p.add(scene.add.rectangle(b.x - 2, b.y - 2, b.w + 4, b.h + 4, MOSAIC.stone1, 0.92).setOrigin(0, 0));
  drawFraming(scene, p, lay.framing);
  p.add(new MChip(scene, r.tl!.x, r.tl!.y, { icon: 'hourglass', value: 'Day 3', surface: 'stone', w: r.tl!.w }));
  p.add(new MIconButton(scene, r.tr!.x, r.tr!.y, 22, 22, { icon: 'menu', label: 'Menu', variant: 'neutral', id: 'kit.layouts.menu', onClick: () => {} }));
  p.add(demoSwitch(r.top!.x, r.top!.y, r.top!.w));
  ['I Hoplites', 'II Archers', 'III Horse'].forEach((label, i) => {
    const y = r.left!.y + i * (24 + GAP);
    if (y + 24 > r.left!.y + r.left!.h) return;
    const card = new ParchmentCard(scene, r.left!.x, y, r.left!.w, 24);
    card.add(mtext(scene, 5, 8, label, 'pInk', { size: 7, maxW: r.left!.w - 10 }));
    p.add(card);
  });
  ['shield', 'bolt', 'horn'].forEach((icon, i) => {
    const x = r.right!.x + (abilityRow ? i * 26 : 0);
    const y = r.right!.y + (abilityRow ? 0 : i * 26);
    if (y + 22 > r.right!.y + r.right!.h) return;
    p.add(new MIconButton(scene, x, y, 22, 22, { icon, label: icon, variant: 'secondary', id: `kit.layouts.ability${i}`, onClick: () => {} }));
  });
  order.forEach((icon, i) => p.add(new MIconButton(scene, r.bottom!.x + i * 26, r.bottom!.y, 22, 22, { icon, label: icon, variant: 'neutral', id: `kit.layouts.order${i}`, onClick: () => {} })));
  p.add(new MIconButton(scene, r.bl!.x, r.bl!.y, 22, 22, { icon: 'zoom', label: 'Zoom', variant: 'secondary', id: 'kit.layouts.zoom', onClick: () => {} }));
  p.add(new MIconButton(scene, r.br!.x, r.br!.y, 22, 22, { icon: 'eye', label: 'Follow', variant: 'neutral', id: 'kit.layouts.follow', onClick: () => {} }));
  return { sample: () => {} };
}

/** The framing rect: a dashed gold outline over a faint wash and its size, drawn over the field (§3.5, §7.3). */
function drawFraming(scene: KitScene, p: C, f: Box): void {
  const g = scene.add.graphics();
  g.fillStyle(MOSAIC.gold, 0.1);
  g.fillRect(f.x, f.y, f.w, f.h);
  g.lineStyle(1.5, MOSAIC.goldHi, 1);
  const dash = (x0: number, y0: number, x1: number, y1: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    for (let d = 0; d < len; d += 6) {
      const a = d / len;
      const b = Math.min(1, (d + 3) / len);
      g.lineBetween(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a, x0 + (x1 - x0) * b, y0 + (y1 - y0) * b);
    }
  };
  const { x, y, w, h } = { x: f.x + 0.5, y: f.y + 0.5, w: f.w - 1, h: f.h - 1 };
  dash(x, y, x + w, y);
  dash(x + w, y, x + w, y + h);
  dash(x + w, y + h, x, y + h);
  dash(x, y + h, x, y);
  p.add(g);
  // the size alone where the framing is too narrow for the word
  const long = `Framing ${f.w}x${f.h}`;
  const label = mw(long, 'light', 6.5) + 8 <= f.w - 4 ? long : `${f.w}x${f.h}`;
  const lw = mw(label, 'light', 6.5) + 8;
  if (lw > f.w - 4 || f.h < 16) return;
  const cx = f.x + Math.round((f.w - lw) / 2);
  const cy = f.y + Math.round(f.h / 2) - 6;
  p.add(scene.add.rectangle(cx, cy, lw, 12, MOSAIC.stone1, 0.85).setOrigin(0, 0));
  p.add(uiId(addText(scene, cx + 4, cy + 2, label, 'light').setFontSize(6.5), 'kit.layouts.framing'));
}
