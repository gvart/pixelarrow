/**
 * Doctrines in the Codex (CDX-01; design/gdd/ai-doctrines.md R7 "Codex", design/ux/screens-modes.md M-1):
 * which doctrines the player has met, and the doctrine sheet (its tell, how it fights, its counter and
 * the bands that fight that way).
 *
 * A doctrine is met the first time the player fights it. There is no save field for that yet (the Codex
 * flags belong to the save story, screens-modes.md open question 1), so the met set is kept per player in
 * local storage: noted from the last battle each time the Codex opens, and by `noteDoctrine` from any
 * screen that shows a band's doctrine.
 */
import Phaser from 'phaser';
import { ScrollArea, addIcon, scaleIcon, type FontKey, type UIMetrics } from '../kit';
import { addScrollHint } from '../widgets';
import { MOSAIC } from '../tokens';
import { LINE_H } from '../textfit';
import { uiId } from '../layout';
import { mtext, mw, openParchmentSheet, SHEET_TITLE_H, wrapWords } from '../mosaic';
import { DOCTRINE_IDS, type DoctrineId } from '../../sim/types';
import { safeLocalStorage } from '../../platform/storage';
import { practiceOf } from '../../game/campaignBattle';
import { state } from '../../state';
import { t, type TKey } from '../../i18n';

type UiScene = Phaser.Scene & { m: UIMetrics; ui: Phaser.GameObjects.Container };

const KEY = 'pixelarrow:codex.doctrines';

const isDoctrine = (id: unknown): id is DoctrineId => typeof id === 'string' && (DOCTRINE_IDS as readonly string[]).includes(id);

/** The doctrines the player has met, in the GDD's order. */
export function metDoctrines(): DoctrineId[] {
  let raw: unknown = [];
  try {
    raw = JSON.parse(safeLocalStorage()?.getItem(KEY) ?? '[]');
  } catch {
    raw = [];
  }
  const got = new Set(Array.isArray(raw) ? raw.filter(isDoctrine) : []);
  return DOCTRINE_IDS.filter((id) => got.has(id));
}

/** Remember that the player met `id` (unknown ids are ignored). True when it is new. */
export function noteDoctrine(id: string | null | undefined): boolean {
  if (!isDoctrine(id)) return false;
  const met = metDoctrines();
  if (met.includes(id)) return false;
  try {
    safeLocalStorage()?.setItem(KEY, JSON.stringify([...met, id]));
  } catch {
    /* quota or private mode: the Codex simply forgets */
  }
  return true;
}

/** Note the doctrine of the last battle fought (a Trial is practice against a beast: no doctrine). */
export function noteLastBattle(): void {
  const last = state.last;
  if (!last || practiceOf(last)) return;
  noteDoctrine(last.enemy?.doctrine);
}

export const doctrineName = (id: DoctrineId): string => t(`doctrine.${id}.name` as TKey);
export const doctrineTell = (id: DoctrineId): string => t(`doctrine.${id}.tell` as TKey);
/** The atlas icon of a doctrine (AS-03, ART-057..061). */
export const doctrineIcon = (id: DoctrineId): string => `doctrine_${id}`;

const PAD = 8;
const HEAD = 7;
const BODY = 7;

/** Lines of `str` wrapped to `w` in `font` at `size`. */
function lines(str: string, font: FontKey, size: number, w: number): string[] {
  return wrapWords(str, w, (s) => mw(s, font, size));
}

/** A paragraph into `c` at (x, y); returns its height. */
function para(scene: Phaser.Scene, c: Phaser.GameObjects.Container, x: number, y: number, str: string, font: FontKey, w: number, size = BODY): number {
  const ls = lines(str, font, size, w);
  const txt = mtext(scene, x, y, ls.join('\n'), font, { size });
  c.add(txt);
  return Math.ceil((ls.length * LINE_H * size) / 7);
}

/** A section heading (Cinzel capitals, no letter gaps) into `c`; returns its height. */
function heading(scene: Phaser.Scene, c: Phaser.GameObjects.Container, x: number, y: number, str: string, w: number): number {
  c.add(mtext(scene, x, y, str.toUpperCase(), 'rInk', { size: HEAD, maxW: w }));
  return 11;
}

/** Build the sheet's content into `c` (width `w`) and return its height. */
function fill(scene: Phaser.Scene, c: Phaser.GameObjects.Container, id: DoctrineId, w: number): number {
  let y = 0;
  // the doctrine's icon beside its tell: what the encounter row and the battle chip show
  const ic = scaleIcon(addIcon(scene, 0, y, doctrineIcon(id)), 2);
  c.add(ic);
  const tx = ic.displayWidth + PAD;
  y += heading(scene, c, tx, y, t('codex.doc.tell'), w - tx);
  const tellH = para(scene, c, tx, y, doctrineTell(id), 'pInk', w - tx);
  y = Math.max(ic.displayHeight, y + tellH) + 6;
  const sections: [TKey, TKey, FontKey][] = [
    ['codex.doc.how', `doctrine.${id}.how` as TKey, 'pInk'],
    ['codex.doc.counter', `doctrine.${id}.counter` as TKey, 'pGood'],
    ['codex.doc.who', `doctrine.${id}.who` as TKey, 'pSec'],
  ];
  for (const [head, body, font] of sections) {
    y += heading(scene, c, 0, y, t(head), w);
    y += para(scene, c, 0, y, t(body), font, w) + 6;
  }
  return y;
}

/**
 * The doctrine sheet (Codex › Doctrines › a row): a parchment sheet with the X. A locked (unmet) doctrine
 * has no sheet: its row says how to learn it.
 */
export function openDoctrineSheet(scene: UiScene, id: DoctrineId, onClose?: () => void): { close: () => void } {
  const { VW, VH } = scene.m;
  const w = VW - 16;
  const iw = w - PAD * 2 - 4;
  // measure first: the sheet is as tall as its words, at most the screen
  const probe = scene.add.container(0, 0);
  const contentH = fill(scene, probe, id, iw);
  probe.destroy();
  const h = Math.min(VH - 12, SHEET_TITLE_H + contentH + PAD * 2 + 4);
  const s = openParchmentSheet(scene, { title: doctrineName(id), w, h, id: 'doctrine.sheet', onClose });
  const area = new ScrollArea(scene, s.c, s.body.x + 2, s.body.y, s.body.w - 2, s.body.h, scene.m.S);
  fill(scene, area.content, id, iw);
  area.setContentHeight(contentH);
  addScrollHint(scene, s.c, area, MOSAIC.parch);
  s.c.once('destroy', () => area.destroy());
  uiId(s.c, `doctrine.${id}`);
  return { close: s.close };
}
