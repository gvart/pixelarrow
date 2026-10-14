/**
 * The Kit's Layouts page (V6-RFND-02, design/ux/landscape-v6.md §3, §13.4): every layout primitive
 * in the variant of the window it runs in. The page is opted in to the size classes (ADR-0013), so
 * the four variants are the matrix sizes: 390x844 compact portrait, 844x390 compact landscape,
 * 768x1024 medium, 1280x800 expanded. A switch picks one of four demos:
 *
 * - Panes: `columns` with three panes (a roster, a `grid` of spoils, notes); a folded pane is one
 *   tap away (it opens as a panel), never dropped.
 * - List: `masterDetail`; the first item shows on arrival, a row selects (or opens the detail as a
 *   bottom sheet in compact portrait).
 * - Panels: `openPanel` for a task sheet, a decision, an inspector and settings, and the rotate card.
 * - Field: `edgeClusters` over a field with the framing rect drawn on it.
 */
import Phaser from 'phaser';
import { ScrollArea, addText } from '../../ui/kit';
import { uiId, uiLayout } from '../../ui/layout';
import { motion, tweenTo } from '../../ui/motion';
import { BUTTON_MAX, ROW_MAX, READING_MAX } from '../../ui/sizeClass';
import { MOSAIC } from '../../ui/tokens';
import { addIcon, scaleIcon } from '../../ui/kit';
import { renderGround } from '../../art/ground';
import { GAP, MButton, MChip, MIconButton, ParchmentCard, ParchmentRow, SECTION_TITLE_H, SWITCH_H, ScreenFrame, SectionTitle, SegmentedSwitch, TopBar, mtext, mw } from '../../ui/mosaic';
import { columns, edgeClusters, grid, gridColumns, layoutVariant, masterDetail, mountRotateCard, openPanel, panelLayout, type Box, type ClusterId, type LayoutVariant, type PanelKind } from '../../ui/mosaic/layout';
import type { C, KitScene } from './common';

export type LayoutDemo = 'panes' | 'list' | 'panels' | 'field';
export const LAYOUT_DEMOS: readonly LayoutDemo[] = ['panes', 'list', 'panels', 'field'];
/** The samples scripts open (`s.layoutsSample(id)`, the kit-layouts-* checks). */
export type LayoutSample = 'task' | 'decision' | 'inspector' | 'settings' | 'rotate' | 'folded' | 'detail';

export interface LayoutsOpts {
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

const UNITS: readonly { name: string; role: string; icon: string; text: string }[] = [
  { name: 'Hoplites', role: 'Heavy infantry', icon: 'shield', text: 'Bronze-shod spearmen in a deep file. They hold a line against a charge and push when it breaks.' },
  { name: 'Peltasts', role: 'Skirmishers', icon: 'throw', text: 'Light javelin troops. They harry the flanks and fall back before heavy foot can close.' },
  { name: 'Archers', role: 'Missile troops', icon: 'volley', text: 'Cretan bowmen. Volleys thin a charge before it lands; keep them behind the line.' },
  { name: 'Companions', role: 'Heavy cavalry', icon: 'charge', text: 'The king\'s horse. A wedge that breaks a wavering line from the flank.' },
  { name: 'Slingers', role: 'Missile troops', icon: 'push', text: 'Rhodian slingers. Their lead bullets outrange the bow and dent bronze.' },
  { name: 'Thureophoroi', role: 'Medium infantry', icon: 'helmet', text: 'Oval shields and long spears; quick enough to plug a gap anywhere in the line.' },
  { name: 'Militia', role: 'Levy', icon: 'people', text: 'Farmers called to the colours. Cheap, many, and quick to waver.' },
  { name: 'Royal guard', role: 'Elite infantry', icon: 'laurel', text: 'Picked men round the standard. They do not rout while the general stands.' },
];

const SPOILS = ['coin', 'chest', 'sword', 'shield', 'helmet', 'armor', 'spear', 'food', 'wood', 'amphora', 'ring', 'scales'];

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
  p.add(demoSwitch(c0.x + 4, c0.y + 4, Math.min(c0.w - 8, 320)));
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

/** A pane: a parchment card with a title naming it and its width, and a scroll area for its content. */
function pane(ctx: Ctx, b: Box, title: string): { area: ScrollArea; w: number } {
  const { scene, p } = ctx;
  p.add(new ParchmentCard(scene, b.x, b.y, b.w, b.h));
  p.add(new SectionTitle(scene, b.x + 4, b.y + 4, b.w - 8, `${title} ${b.w}`.toUpperCase(), { size: 8 }));
  const top = b.y + 4 + SECTION_TITLE_H + 2;
  const area = new ScrollArea(scene, p, b.x + 4, top, b.w - 8, b.y + b.h - 4 - top, scene.m.S);
  ctx.o.cleanup(() => area.destroy());
  return { area, w: b.w - 8 - 4 };
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

function spoils(ctx: Ctx, area: ScrollArea, w: number): number {
  const g = grid({ x: 0, y: 0, w, h: 0 }, SPOILS.length, { minCell: 40, maxCols: 6 });
  g.cells.forEach((cell, i) => {
    const card = new ParchmentCard(ctx.scene, cell.x, cell.y, cell.w, cell.h);
    const ic = scaleIcon(addIcon(ctx.scene, 0, 0, SPOILS[i]), Math.min(2, (cell.w - 12) / 12));
    ic.setPosition(Math.round((cell.w - ic.displayWidth) / 2), Math.round((cell.h - ic.displayHeight) / 2));
    card.add(ic);
    area.content.add(card);
  });
  return g.h;
}

function note(ctx: Ctx, area: ScrollArea, y: number, w: number, text: string): number {
  const t = mtext(ctx.scene, 0, y, text, 'pSec', { size: 6.5, maxW: Math.min(w, READING_MAX), wrap: true });
  area.content.add(t);
  return y + Math.ceil(t.height) + 4;
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
    a.setContentHeight(i === 1 ? spoils(ctx, a, h.body.w - 4) : note(ctx, a, 0, h.body.w - 4, notesText(lay.shown.length)));
  };
  if (lay.hidden.length) {
    const bw = Math.min(BUTTON_MAX, Math.floor((area.w - GAP * (lay.hidden.length - 1)) / lay.hidden.length));
    lay.hidden.forEach((i, k) => p.add(new MButton(scene, area.x + k * (bw + GAP), area.y, bw, 22, { label: names[i], icon: 'more', variant: 'secondary', id: `kit.layouts.fold${i}`, onClick: () => openFolded(i) })));
    top += 22 + 6;
  }
  for (const i of lay.shown) {
    const b = { ...lay.panes[i]!, y: top, h: area.y + area.h - top };
    const { area: a, w } = pane(ctx, b, names[i]);
    if (i === 0) a.setContentHeight(rows(ctx, a, w, -1, () => {}));
    else if (i === 1) a.setContentHeight(spoils(ctx, a, w));
    else a.setContentHeight(note(ctx, a, 0, w, notesText(lay.shown.length)));
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
  /** The detail, top down from (x, y), `w` wide; returns its height. */
  const fillDetail = (parent: C, x: number, y: number, w: number, u: (typeof UNITS)[number]): number => {
    parent.add(new SectionTitle(scene, x, y, w, u.name.toUpperCase(), { size: 8 }));
    let yy = y + SECTION_TITLE_H + 4;
    const t = mtext(scene, x, yy, u.text, 'pInk', { size: 7, maxW: Math.min(w, READING_MAX), wrap: true });
    parent.add(t);
    yy += Math.ceil(t.height) + 4;
    const r = mtext(scene, x, yy, u.role, 'pSec', { size: 6.5, maxW: w });
    parent.add(r);
    yy += Math.ceil(r.height) + 6;
    parent.add(new MButton(scene, x, yy, Math.min(w, BUTTON_MAX), 24, { label: 'Equip', icon: 'helmet', variant: 'primary', id: 'kit.layouts.equip', onClick: () => {} }));
    return yy + 24 - y;
  };
  const openDetail = (i: number) => {
    const h = openPanel(scene, { kind: 'task', title: UNITS[i].role, h: 150, area: panelArea(ctx), leftHand: o.leftHand, id: 'kit.layouts.detail' });
    const a = new ScrollArea(scene, h.c, h.body.x, h.body.y, h.body.w, h.body.h, scene.m.S);
    h.c.once('destroy', () => a.destroy());
    a.setContentHeight(fillDetail(a.content, 0, 0, h.body.w - 4, UNITS[i]) + 4);
  };
  const m = pane(ctx, md.master, 'Units');
  m.area.setContentHeight(rows(ctx, m.area, m.w, md.split ? sel : -1, (i) => (md.split ? o.go({ sel: i }) : openDetail(i))));
  if (md.detail) {
    const d = md.detail;
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

function panelsDemo(ctx: Ctx): LayoutsPage {
  const { scene, p, area, o } = ctx;
  const m = scene.m;
  const pa = panelArea(ctx);
  let covered: Phaser.GameObjects.Container[] = [];
  const open = (kind: PanelKind, inspector = false) => {
    const title = inspector ? 'Inspector' : kind === 'decision' ? 'Abandon the march?' : kind === 'settings' ? 'Settings' : 'Bronze-shod dory';
    const h = openPanel(scene, {
      kind,
      title,
      h: kind === 'decision' ? 110 : 170,
      // an inspector docks beside the demo's controls, under its switch, and hides what it covers
      area: inspector ? { ...pa, y: area.y, h: pa.y + pa.h - area.y } : pa,
      inspector,
      onClose: () => covered.forEach((c) => c.scene && c.setVisible(true)),
      leftHand: o.leftHand,
      id: `kit.layouts.${inspector ? 'inspector' : kind}`,
      actions: kind === 'decision' ? [{ label: 'Stay', variant: 'neutral', onClick: () => h.close() }, { label: 'Abandon', variant: 'primary', onClick: () => h.close() }] : undefined,
    });
    if (inspector && h.presentation === 'side') {
      covered = (sa.content.list as Phaser.GameObjects.Container[]).filter((c) => sa.content.x + c.x < h.x + h.w && sa.content.x + c.x + (c as unknown as { w: number }).w > h.x && c.visible);
      covered.forEach((c) => c.setVisible(false));
    }
    const lay = panelLayout(m, kind, pa, 170);
    const line = `${h.presentation === 'side' ? (inspector ? 'Inspector side panel, no shade' : 'Modal side panel') : h.presentation === 'dialog' ? 'Centred dialog' : 'Bottom sheet'}, ${lay.rect.w} UI px wide.`;
    h.c.add(mtext(scene, h.body.x, h.body.y, line, 'pInk', { size: 7, maxW: Math.min(h.body.w, READING_MAX), wrap: true }));
  };
  const items: [string, string, () => void][] = [
    ['Task sheet', 'task', () => open('task')],
    ['Decision', 'decision', () => open('decision')],
    ['Inspector', 'inspector', () => open('task', true)],
    ['Settings', 'settings', () => open('settings')],
    ['Rotate card', 'rotate', () => o.cleanup(mountRotateCard(scene, { force: true }))],
  ];
  // the buttons reflow by width (a Grid of two columns where they fit) and scroll when the height runs out
  const cols = gridColumns(area.w, { minCell: 140, maxCols: 2, gap: 8 });
  const bw = Math.min(BUTTON_MAX, Math.floor((area.w - 8 * (cols - 1)) / cols));
  const sa = new ScrollArea(scene, p, area.x, area.y, area.w, area.h, m.S);
  o.cleanup(() => sa.destroy());
  items.forEach(([label, id, fn], i) => {
    sa.content.add(new MButton(scene, (i % cols) * (bw + 8), Math.floor(i / cols) * (24 + 6), bw, 24, { label, variant: i === 0 ? 'primary' : 'secondary', id: `kit.layouts.open.${id}`, onClick: fn }));
  });
  const y0 = Math.ceil(items.length / cols) * 30 + 4;
  const where = (k: PanelKind) => panelLayout(m, k, pa, 170).presentation;
  const cw = cols * bw + (cols - 1) * 8;
  const t = mtext(scene, 6, 6, `${m.VW}x${m.VH} UI, S ${m.S}. Task: ${where('task')}. Decision: ${where('decision')}. Settings: ${where('settings')}.`, 'pInk', { size: 7, maxW: Math.min(cw - 12, READING_MAX), wrap: true });
  const card = new ParchmentCard(scene, 0, y0, cw, Math.ceil(t.height) + 12);
  card.add(t);
  sa.content.add(card);
  sa.setContentHeight(y0 + card.h + 4);
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
  const lay = edgeClusters(area, sizes, { leftHand: o.leftHand });
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
    const y = r.right!.y + i * 26;
    if (y + 22 > r.right!.y + r.right!.h) return;
    p.add(new MIconButton(scene, r.right!.x, y, 22, 22, { icon, label: icon, variant: 'secondary', id: `kit.layouts.ability${i}`, onClick: () => {} }));
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
  const label = `Framing ${f.w}x${f.h}`;
  const lw = mw(label, 'light', 6.5) + 8;
  if (lw > f.w - 4 || f.h < 16) return;
  const cx = f.x + Math.round((f.w - lw) / 2);
  const cy = f.y + Math.round(f.h / 2) - 6;
  p.add(scene.add.rectangle(cx, cy, lw, 12, MOSAIC.stone1, 0.85).setOrigin(0, 0));
  p.add(uiId(addText(scene, cx + 4, cy + 2, label, 'light').setFontSize(6.5), 'kit.layouts.framing'));
}
