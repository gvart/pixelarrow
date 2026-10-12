/**
 * The encounter sheet (WLD-01; design/ux/screens-campaign.md C-4, ia.md §6 L5, screen-flow.md §4,
 * design/gdd/ai-doctrines.md "Encounter dialog"). It replaces the legacy dark v3 dialog (UI WLD-2).
 *
 * A decision sheet docked at the bottom over a dim scrim: the band in a niche, a threat chip (colour,
 * a shape and a word: G13), its people and level, the mood; the doctrine row (icon, name, tell and an
 * (i) that opens the doctrine's Codex text as a page inside the sheet, with a back chevron); the captain
 * row (crest, name, level); the army; the advice; and the choices: Attack (primary), Take ransom, Let
 * them go or Flee n%.
 *
 * Back and the X take the least committal way out (screen-flow.md §4): "Let them go" when the band lets
 * you; otherwise the sheet shakes, the Flee button is ringed and "They won't let you go" is on the sheet.
 * A tap on the shade does nothing (a decision).
 *
 * The sheet owns no state: the World scene builds the model and each choice's action.
 */
import Phaser from 'phaser';
import { ScrollArea, addIcon, scaleIcon, type FontKey, type UIMetrics } from '../kit';
import { addScrollHint } from '../widgets';
import { MOSAIC } from '../tokens';
import { LINE_H } from '../textfit';
import { uiId } from '../layout';
import { motion } from '../motion';
import { MIconButton, addNiche, mtext, mw, openParchmentSheet, sheetActionsH, wrapWords, SHEET_TITLE_H, type ParchmentSheetHandle } from '../mosaic';
import { navLayer } from '../../platform/nav';
import { hapticNotify } from '../../platform/telegram';
import { doctrineIcon, doctrineName, doctrineTell, noteDoctrine } from './doctrine';
import { renderCrest, renderThreatGlyph } from '../../art/worldArt';
import { P } from '../../art/palette';
import type { DoctrineId } from '../../sim/types';
import { t, type TKey } from '../../i18n';
import { heroName } from '../../i18n/names';

type UiScene = Phaser.Scene & { m: UIMetrics; ui: Phaser.GameObjects.Container };

export type EncounterChoiceKey = 'attack' | 'ransom' | 'letGo' | 'flee';

export interface EncounterChoice {
  key: EncounterChoiceKey;
  label: string;
  icon: string;
  /** Runs after the sheet has closed (it may open the sheet again, as a failed flight does). */
  onPick: () => void;
}

export interface EncounterModel {
  title: string;
  /** The band's map figure (texture key, frame 0). */
  tex: string;
  /** world.ts threatLevel (0 weak .. 4 deadly) and its colour. */
  lvl: number;
  color: number;
  men: number;
  culture: string;
  level: number;
  mood: string;
  advice: string;
  /** Null for a beast (no doctrine, no captain). */
  doctrine: DoctrineId | null;
  captain: { name: string; level: number } | null;
  fit: number;
  wounded: number;
  /** No man is fit to fight (src/game/encounter.ts armyLine); missing = false. */
  noneFit?: boolean;
  choices: EncounterChoice[];
}

export interface EncounterHandle {
  /** Take a choice as a tap on it does (scripts); false when the sheet is gone or the choice isn't offered. */
  pick(key: EncounterChoiceKey): boolean;
  /** What Back does (scripts). */
  back(): void;
  /** Open the doctrine page (scripts). */
  doctrinePage(): void;
  /** Close without a choice (a scene teardown). */
  close(): void;
  readonly closed: boolean;
}

const PAD = 8;
const BODY = 7;
const SMALL = 6.5;
const NICHE_W = 32;
const NICHE_H = 40;
const CHIP = 11;
const ROW_ICON = 14;
const INFO = 22;

const lh = (size: number): number => (LINE_H * size) / 7;

/** The map glyphs as textures (threat shapes, the crest): made once per game. */
export function worldGlyph(scene: Phaser.Scene, what: number | 'crest'): string {
  const key = what === 'crest' ? 'wm_crest' : `wm_threat_${what}`;
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, (what === 'crest' ? renderCrest() : renderThreatGlyph(what)).toCanvas());
  return key;
}

/** Wrapped text into `c` (null = measure only); returns its height. */
function para(scene: Phaser.Scene, c: Phaser.GameObjects.Container | null, x: number, y: number, str: string, font: FontKey, w: number, size = BODY): number {
  const ls = wrapWords(str, w, (s) => mw(s, font, size));
  if (c) c.add(mtext(scene, x, y, ls.join('\n'), font, { size }));
  return Math.ceil(ls.length * lh(size));
}

/** The main page (everything above the choices) into `c` at (x0, y0), `w` wide; returns its height and the (i) spot. */
function mainPage(scene: UiScene, c: Phaser.GameObjects.Container | null, m: EncounterModel, x0: number, y0: number, w: number, onInfo: () => void): number {
  // the band in its niche, and beside it the threat chip, its people and level, the mood
  if (c) {
    addNiche(scene, c, x0, y0, NICHE_W, NICHE_H);
    c.add(scene.add.image(x0 + NICHE_W / 2, y0 + NICHE_H - 3, m.tex, 0).setOrigin(0.5, 1).setScale(1.25));
  }
  const rx = x0 + NICHE_W + 6;
  const rw = w - NICHE_W - 6;
  let ry = y0;
  if (c) {
    c.add(scene.add.rectangle(rx, ry, CHIP, CHIP, m.color).setOrigin(0, 0).setStrokeStyle(1, P.outline));
    c.add(scene.add.image(rx + 3, ry + 2, worldGlyph(scene, m.lvl)).setOrigin(0, 0));
  }
  const threat = t('wld.enc.threat', { threat: t(`wld.threat.${m.lvl}` as TKey), men: t('wld.enc.men', { n: m.men }) });
  ry += Math.max(CHIP + 1, para(scene, c, rx + CHIP + 4, ry + 1.5, threat, 'pInk', rw - CHIP - 4));
  ry += para(scene, c, rx, ry + 1, t('wld.enc.culture', { culture: m.culture, lv: m.level }), 'pSec', rw, SMALL) + 2;
  ry += para(scene, c, rx, ry, m.mood, 'pInk', rw);
  let y = Math.max(y0 + NICHE_H, ry) + 5;

  const rule = (yy: number) => {
    if (!c) return;
    const g = scene.add.graphics();
    g.lineStyle(0.7, MOSAIC.parchEdge, 0.6);
    g.lineBetween(x0, yy, x0 + w, yy);
    c.add(g);
  };

  // the doctrine row: icon, name, tell, (i)
  if (m.doctrine) {
    rule(y);
    y += 4;
    const d = m.doctrine;
    if (c) c.add(scaleIcon(addIcon(scene, x0, y, doctrineIcon(d)), ROW_ICON / 12));
    const tx = x0 + ROW_ICON + 5;
    const tw = w - ROW_ICON - 5 - INFO - 4;
    let ty = y;
    ty += para(scene, c, tx, ty, t('wld.enc.doctrine', { name: doctrineName(d) }), 'rInk', tw);
    ty += para(scene, c, tx, ty + 1, doctrineTell(d), 'pInk', tw, SMALL) + 1;
    if (c) {
      const info = new MIconButton(scene, x0 + w - INFO, y, INFO, INFO, { icon: 'info', label: t('wld.enc.doctrineInfo'), variant: 'secondary', id: 'encounter.doctrine.info', onClick: onInfo });
      c.add(info);
    }
    y = Math.max(ty, y + INFO) + 3;
  }
  // the captain row: crest, name, level
  if (m.captain) {
    if (!m.doctrine) rule(y);
    y += m.doctrine ? 0 : 4;
    if (c) c.add(scene.add.image(x0 + 3, y + 1, worldGlyph(scene, 'crest')).setOrigin(0, 0).setScale(1.2));
    y += para(scene, c, x0 + ROW_ICON + 5, y, t('wld.enc.captain', { name: heroName(m.captain.name), lv: m.captain.level }), 'pInk', w - ROW_ICON - 5) + 3;
  }
  rule(y);
  y += 4;
  // the army and the advice (ink, never red text: WLD-2, WLD-3)
  const army = t(m.noneFit ? 'wld.enc.armyNoneFit' : m.wounded ? 'wld.enc.armyWounded' : 'wld.enc.army', { fit: m.fit, w: m.wounded });
  y += para(scene, c, x0, y, army, 'pSec', w, SMALL) + 1;
  y += para(scene, c, x0, y, m.advice, 'pInk', w);
  if (!m.choices.some((ch) => ch.key === 'letGo')) y += 2 + para(scene, c, x0, y + 2, t('wld.enc.noLetGo'), 'pBad', w, SMALL);
  return y - y0;
}

/** The doctrine's Codex text (as the Codex sheet has it) into `c`, `w` wide; returns its height. */
function doctrineText(scene: Phaser.Scene, c: Phaser.GameObjects.Container | null, d: DoctrineId, w: number): number {
  let y = 0;
  const parts: [TKey, TKey, FontKey][] = [
    ['codex.doc.tell', `doctrine.${d}.tell` as TKey, 'pInk'],
    ['codex.doc.how', `doctrine.${d}.how` as TKey, 'pInk'],
    ['codex.doc.counter', `doctrine.${d}.counter` as TKey, 'pGood'],
    ['codex.doc.who', `doctrine.${d}.who` as TKey, 'pSec'],
  ];
  for (const [head, body, font] of parts) {
    y += para(scene, c, 0, y, t(head).toUpperCase(), 'rInk', w, SMALL) + 1;
    y += para(scene, c, 0, y, t(body), font, w) + 6;
  }
  return y;
}

export function openEncounterSheet(scene: UiScene, m: EncounterModel, onClosed?: () => void): EncounterHandle {
  const { VW, VH } = scene.m;
  const w = VW - 8;
  const iw = w - PAD * 2;
  if (m.doctrine) noteDoctrine(m.doctrine);
  let picked: EncounterChoice | null = null;
  let closed = false;
  let page: Phaser.GameObjects.Container | null = null;
  let ring: Phaser.GameObjects.Graphics | null = null;

  const actions = m.choices.map((ch) => ({ label: ch.label, icon: ch.icon, variant: ch.key === 'attack' ? ('primary' as const) : ('secondary' as const), id: `encounter.${ch.key}`, onClick: () => void pick(ch.key) }));
  const contentH = mainPage(scene, null, m, 0, 0, iw, () => undefined);
  const h = Math.min(VH - 12, SHEET_TITLE_H + contentH + PAD * 2 + sheetActionsH(actions, w));
  // the title is drawn here, not by the sheet: the sheet leaves no room for an X it doesn't draw itself
  const s: ParchmentSheetHandle = openParchmentSheet(scene, {
    w,
    h,
    dock: 'bottom',
    shadeCloses: false,
    closeButton: false,
    actions,
    id: 'encounter.sheet',
    onClose: () => {
      if (closed) return;
      closed = true;
      onClosed?.();
      picked?.onPick();
    },
  });

  const pick = (key: EncounterChoiceKey): boolean => {
    const ch = m.choices.find((c) => c.key === key);
    if (closed || picked || !ch) return false;
    picked = ch;
    s.close();
    return true;
  };

  /** Back / X: back from the doctrine page; else let them go; else shake and ring Flee. */
  const back = (): void => {
    if (closed) return;
    if (page?.visible) {
      showMain();
      return;
    }
    if (pick('letGo')) return;
    hapticNotify('warning');
    if (!motion.reduced) scene.tweens.add({ targets: s.c, x: { from: -4, to: 0 }, duration: 260, ease: 'Elastic.easeOut' });
    const flee = s.buttons.find((b) => b.opts.label === m.choices.find((c) => c.key === 'flee')?.label);
    if (flee && !ring) {
      ring = scene.add.graphics();
      ring.lineStyle(1.5, MOSAIC.inkBad, 1);
      ring.strokeRoundedRect(flee.x - 2, flee.y - 2, flee.w + 4, flee.h + 4, 4);
      s.c.add(ring);
      if (!motion.reduced) scene.tweens.add({ targets: ring, alpha: 0.35, duration: 450, yoyo: true, repeat: 3 });
    }
  };

  // the title (band names may be long: Cinzel shrinks to 6.5, then Inter; room is left for the X) over its rule
  const room = w - 60;
  s.c.add(mtext(scene, s.x + w / 2, s.y + 6, m.title, 'rInk', { size: 9, align: 0.5, maxW: room }));
  const tr = scene.add.graphics();
  tr.lineStyle(0.7, MOSAIC.parchEdge, 0.7);
  tr.lineBetween(s.x + 26, s.y + 21, s.x + w - 26, s.y + 21);
  s.c.add(tr);
  // the X (one close affordance: it does what Back does)
  s.c.add(new MIconButton(scene, s.x + s.w - 25, s.y + 1, 22, 22, { icon: 'xmark', label: t('mosaic.close'), variant: 'secondary', id: 'encounter.sheet.close', onClick: back }));
  const guard = scene.add.container(0, 0);
  s.c.add(guard);
  navLayer(guard, () => (back(), false), scene);

  // the main page; it scrolls when a short screen can't hold it (the choices stay put under it)
  const main = scene.add.container(0, 0);
  s.c.add(main);
  const body = { x: s.body.x, y: s.y + SHEET_TITLE_H, w: s.body.w, h: s.body.h - (SHEET_TITLE_H - PAD) };
  if (contentH <= body.h) mainPage(scene, main, m, body.x, body.y, iw, () => showPage());
  else {
    const area = new ScrollArea(scene, main, body.x, body.y, iw, body.h, scene.m.S);
    mainPage(scene, area.content, m, 0, 0, iw, () => showPage());
    area.setContentHeight(contentH + 2);
    addScrollHint(scene, main, area, MOSAIC.parch);
    s.c.once('destroy', () => area.destroy());
  }

  const showMain = () => {
    page?.setVisible(false);
    main.setVisible(true);
  };
  /** The doctrine's page inside the sheet (ia.md L5): a back chevron, the name, the Codex text. */
  const showPage = () => {
    const d = m.doctrine;
    if (!d || closed) return;
    main.setVisible(false);
    if (page) {
      page.setVisible(true);
      return;
    }
    page = scene.add.container(0, 0);
    s.c.add(page);
    page.add(new MIconButton(scene, body.x, body.y - 2, 22, 22, { icon: 'back', label: t('wld.enc.backToBand'), variant: 'secondary', id: 'encounter.doctrine.back', onClick: showMain }));
    page.add(scaleIcon(addIcon(scene, body.x + 27, body.y + 3, doctrineIcon(d)), 1));
    page.add(mtext(scene, body.x + 43, body.y + 5, doctrineName(d).toUpperCase(), 'rInk', { size: BODY, maxW: iw - 43 }));
    const top = body.y + 24;
    const area = new ScrollArea(scene, page, body.x, top, iw, body.h - 24, scene.m.S);
    const th = doctrineText(scene, area.content, d, iw - 2);
    area.setContentHeight(th);
    if (th > body.h - 24) addScrollHint(scene, page, area, MOSAIC.parch);
    s.c.once('destroy', () => area.destroy());
    uiId(page, 'encounter.doctrine');
  };

  // the scene's own teardown (a restart, a resize) ends the sheet; the band is still there
  scene.events.once('shutdown', () => (closed = true));
  return {
    pick,
    back,
    doctrinePage: () => showPage(),
    close: () => s.close(),
    get closed() {
      return closed;
    },
  };
}
