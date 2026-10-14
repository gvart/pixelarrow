/**
 * The Arc sheet (WLD-02; design/ux/screens-campaign.md C-4 "Arc sheet", design/gdd/campaign-arc.md "Touch UI
 * needs"): the arc chip on the world map opens it. Two tabs on a segmented switch:
 * - Lairs: the goal in one sentence (which changes with the arc stage), the sacked town when there is one, the
 *   host when it marches, and every lair with its state as an icon and words (standing n men, burnt, reborn,
 *   not found yet) and the town it lies near. A tap on a found lair (or the host) centres the map on it.
 * - Journal: the last 20 events, newest first (campaign-events.md "Journal"; it moved here from the top bar).
 * An optional sheet: the X, Back and the shade close it.
 */
import Phaser from 'phaser';
import { ScrollArea, addIcon, scaleIcon, type FontKey, type UIMetrics } from '../kit';
import { addScrollHint } from '../widgets';
import { MOSAIC } from '../tokens';
import { LINE_H } from '../textfit';
import { uiId } from '../layout';
import { SegmentedSwitch, SWITCH_H, mosaicImage, mtext, mw, openParchmentSheet, sheetWidth, wrapWords, SHEET_TITLE_H, type ParchmentSheetHandle } from '../mosaic';
import { centeredFace, makePressable, put } from '../mosaic/base';
import { journalEntry } from './eventCard';
import { t } from '../../i18n';

type UiScene = Phaser.Scene & { m: UIMetrics; ui: Phaser.GameObjects.Container };

export type ArcTab = 'lairs' | 'journal';
export type LairRowState = 'standing' | 'reborn' | 'burnt' | 'unknown';

export interface ArcLairRow {
  id: number;
  name: string;
  /** The nearest town's name (orientation); null when the lair isn't found yet. */
  near: string | null;
  state: LairRowState;
  men: number;
}

export interface ArcModel {
  /** The goal sentence for the arc stage. */
  goal: string;
  /** "{town} is sacked..." while the start town burns. */
  sacked: string | null;
  /** The host's row while it marches. */
  host: { men: number; town: string } | null;
  rows: ArcLairRow[];
  /** Journal lines (world.ts logJournal), oldest first. */
  journal: readonly string[];
  /** A found lair (id >= 0) or the host (-1) was tapped: centre the map on it (the sheet closes first). */
  onFocus: (id: number) => void;
}

export interface ArcHandle {
  /** Show a tab (scripts). */
  tab(id: ArcTab): void;
  /** Tap a lair row (scripts): false when the lair isn't found or the sheet is gone. */
  focus(id: number): boolean;
  close(): void;
  readonly closed: boolean;
  readonly current: ArcTab;
}

const PAD = 8;
const BODY = 7;
const SMALL = 6.5;
const ROW_ICON = 14;

const lh = (size: number): number => (LINE_H * size) / 7;

function para(scene: Phaser.Scene, c: Phaser.GameObjects.Container | null, x: number, y: number, str: string, font: FontKey, w: number, size = BODY): number {
  const ls = wrapWords(str, w, (s) => mw(s, font, size));
  if (c) c.add(mtext(scene, x, y, ls.join('\n'), font, { size }));
  return Math.ceil(ls.length * lh(size));
}

const STATE_ICON: Record<LairRowState, string> = { standing: 'flag', reborn: 'skull', burnt: 'fire', unknown: 'lock' };

function stateLine(r: ArcLairRow): string {
  if (r.state === 'standing') return t('arc.lair.standing', { n: r.men });
  if (r.state === 'reborn') return t('arc.lair.reborn', { n: r.men });
  return t(r.state === 'burnt' ? 'arc.lair.burnt' : 'arc.lair.unknown');
}

/** A tappable row: icon, name, state (and where), wrapped, never cut. Returns its height. */
function row(scene: UiScene, c: Phaser.GameObjects.Container | null, y: number, w: number, icon: string, title: string, sub: string, id: string, onTap: (() => void) | null): number {
  const tx = PAD + ROW_ICON + 6;
  const tw = w - tx - PAD;
  const tl = wrapWords(title, tw, (q) => mw(q, 'rInk', BODY));
  const sl = wrapWords(sub, tw, (q) => mw(q, 'pSec', SMALL));
  const h = Math.max(26, 6 + tl.length * lh(BODY) + sl.length * lh(SMALL) + 4);
  if (!c) return h;
  const r = scene.add.container(0, Math.round(y));
  const face = centeredFace(scene, w, h);
  r.add(face);
  put(face, w, h, mosaicImage(scene, 0, 0, w, h, 'parchment'));
  const ic = scaleIcon(addIcon(scene, PAD, Math.round((h - ROW_ICON) / 2), icon, onTap ? '' : 'D'), ROW_ICON / 12);
  put(face, w, h, ic);
  put(face, w, h, mtext(scene, tx, 4, tl.join('\n'), onTap ? 'rInk' : 'pOff', { size: BODY }));
  put(face, w, h, mtext(scene, tx, 4 + tl.length * lh(BODY), sl.join('\n'), onTap ? 'pSec' : 'pOff', { size: SMALL }));
  if (onTap) makePressable(r, { face, w, h, onTap });
  uiId(r, id);
  Object.assign(r, { opts: { label: title } });
  c.add(r);
  return h;
}

function lairsPage(scene: UiScene, c: Phaser.GameObjects.Container | null, m: ArcModel, w: number, focus: (id: number) => void): number {
  let y = 0;
  y += para(scene, c, 0, y, m.goal, 'pInk', w) + 3;
  if (m.sacked) y += para(scene, c, 0, y, m.sacked, 'pBad', w, SMALL) + 3;
  y += para(scene, c, 0, y, t('arc.lair.tapHint'), 'pSec', w, SMALL) + 4;
  if (m.host) y += row(scene, c, y, w, 'standard', t('wld.band.host'), t('arc.host.row', { n: m.host.men, town: m.host.town }), 'arc.host', () => focus(-1)) + 3;
  for (const r of m.rows) {
    const sub = r.near ? `${stateLine(r)} · ${t('arc.lair.near', { town: r.near })}` : stateLine(r);
    y += row(scene, c, y, w, STATE_ICON[r.state], r.name, sub, `arc.lair.${r.id}`, r.state === 'unknown' ? null : () => focus(r.id)) + 3;
  }
  return y;
}

function journalPage(scene: UiScene, c: Phaser.GameObjects.Container | null, m: ArcModel, w: number): number {
  const entries = [...m.journal].reverse().map(journalEntry).filter((e): e is NonNullable<typeof e> => !!e);
  if (!entries.length) return para(scene, c, 0, 0, t('evc.journalEmpty'), 'pInk', w);
  let y = 0;
  entries.forEach((e, i) => {
    if (i > 0) {
      if (c) {
        const g = scene.add.graphics();
        g.lineStyle(0.7, MOSAIC.parchEdge, 0.6);
        g.lineBetween(0, y + 3, w, y + 3);
        c.add(g);
      }
      y += 7;
    }
    y += para(scene, c, 0, y, e.title.toUpperCase(), 'rInk', w) + 1;
    y += para(scene, c, 0, y, `${e.choice}${e.ok ? '' : ` · ${t('evc.failed')}`}`, 'pSec', w, SMALL);
    if (e.result) y += para(scene, c, 0, y, e.result, 'pInk', w);
  });
  return y + 2;
}

export function openArcSheet(scene: UiScene, m: ArcModel, first: ArcTab = 'lairs', onClosed?: () => void): ArcHandle {
  const { VW, VH } = scene.m;
  // the box the sheet gets: v5's in compact portrait, a side panel ≤ 320 in landscape (landscape-v6 §3.4)
  // (compact landscape: the side panel's own width; asking for more would stretch it past its 280 cap)
  const w = sheetWidth(scene, { w: scene.m.cls === 'compact' && scene.m.land ? 1 : VW - 16 });
  const iw = w - PAD * 2 - 4;
  let current: ArcTab = first;
  let closed = false;
  let focusId: number | null = null;
  const focus = (id: number) => {
    if (closed) return;
    focusId = id;
    s.close();
  };
  const lairsH = lairsPage(scene, null, m, iw, focus);
  const journalH = journalPage(scene, null, m, iw);
  // one height for both tabs, so the sheet doesn't jump when the tab changes
  const h = Math.min(VH - 12, SHEET_TITLE_H + SWITCH_H + 6 + Math.max(lairsH, journalH) + PAD * 2 + 4);
  const s: ParchmentSheetHandle = openParchmentSheet(scene, {
    title: t('arc.title'),
    w,
    h,
    id: 'arc.sheet',
    onClose: () => {
      if (closed) return;
      closed = true;
      onClosed?.();
      if (focusId !== null) m.onFocus(focusId);
    },
  });
  const top = s.body.y + SWITCH_H + 6;
  const room = s.body.h - SWITCH_H - 6;
  let area: ScrollArea | null = null;
  let hint: Phaser.GameObjects.GameObject | null = null;
  const pages = scene.add.container(0, 0);
  s.c.add(pages);
  const show = (tab: ArcTab) => {
    current = tab;
    area?.destroy();
    hint?.destroy();
    pages.removeAll(true);
    area = new ScrollArea(scene, pages, s.body.x + 2, top, iw, room, scene.m.S);
    const ch = tab === 'lairs' ? lairsPage(scene, area.content, m, iw, focus) : journalPage(scene, area.content, m, iw);
    area.setContentHeight(ch);
    hint = ch > room ? addScrollHint(scene, pages, area, MOSAIC.parch) : null;
    uiId(pages, `arc.${tab}`);
  };
  const sw = new SegmentedSwitch(scene, s.body.x + 2, s.body.y, iw, {
    options: [
      { id: 'lairs', label: t('arc.tab.lairs'), icon: 'fire' },
      { id: 'journal', label: t('arc.tab.journal'), icon: 'log' },
    ],
    selected: first,
    onChange: (id) => show(id as ArcTab),
    id: 'arc.tabs',
  });
  s.c.add(sw);
  show(first);
  s.c.once('destroy', () => area?.destroy());
  scene.events.once('shutdown', () => (closed = true));
  return {
    tab: (id) => {
      if (closed) return;
      sw.pick(id);
      show(id);
    },
    focus: (id) => {
      const r = id === -1 ? m.host : m.rows.find((q) => q.id === id && q.state !== 'unknown');
      if (!r || closed) return false;
      focus(id);
      return true;
    },
    close: () => s.close(),
    get closed() {
      return closed;
    },
    get current() {
      return current;
    },
  };
}
