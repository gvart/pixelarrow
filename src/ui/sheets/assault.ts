/**
 * The Assault sheet (WLD-02; design/gdd/campaign-arc.md R2.2, design/ux/screens-campaign.md C-4): tapping a
 * standing lair opens it. The same decision-sheet pattern as the encounter sheet (encounter.ts): the garrison
 * in a niche, a threat chip (colour, a shape and a word: G13) with its men, its level and the palisade; the
 * doctrine row (icon, name, tell and an (i) that opens the doctrine's Codex text as a page inside the sheet);
 * the captain row; the reward (the hoard chest); how it counts toward the campaign; the army. The choices:
 * Assault (primary; "March there" when the army is too far, "Burn it" when no garrison is left) and Leave.
 *
 * Back, the X and Leave are the same way out (the least committal, screen-flow.md §4). A tap on the shade
 * does nothing (a decision). The sheet owns no state: the World scene builds the model and the actions.
 */
import Phaser from 'phaser';
import { ScrollArea, addIcon, scaleIcon, type FontKey, type UIMetrics } from '../kit';
import { addScrollHint } from '../widgets';
import { MOSAIC } from '../tokens';
import { LINE_H } from '../textfit';
import { uiId } from '../layout';
import { MIconButton, addNiche, mtext, mw, openParchmentSheet, sheetActionsH, wrapWords, SHEET_TITLE_H, type ParchmentSheetHandle } from '../mosaic';
import { navLayer } from '../../platform/nav';
import { doctrineIcon, doctrineName, doctrineTell, noteDoctrine } from './doctrine';
import { worldGlyph } from './encounter';
import { P } from '../../art/palette';
import type { DoctrineId } from '../../sim/types';
import { t, type TKey } from '../../i18n';
import { heroName } from '../../i18n/names';

type UiScene = Phaser.Scene & { m: UIMetrics; ui: Phaser.GameObjects.Container };

/** 'assault' fights; 'march' goes there first; 'burn' razes a lair with no garrison left. */
export type AssaultChoiceKey = 'assault' | 'march' | 'burn' | 'leave';

export interface AssaultModel {
  title: string;
  /** The garrison's map figure (texture key, frame 0). */
  tex: string;
  /** world.ts threatLevel of the garrison against the army, and its colour. */
  lvl: number;
  color: number;
  men: number;
  culture: string;
  level: number;
  doctrine: DoctrineId | null;
  captain: { name: string; level: number } | null;
  /** A reborn lair of the post-game (R6): no hoard, it doesn't count toward the arc. */
  reborn: boolean;
  /** Lairs burnt so far, and how many the arc needs. */
  burnt: number;
  total: number;
  /** Hoard picks (LAIR_HOARD.picks). */
  picks: number;
  /** The army is close enough to strike now. */
  inReach: boolean;
  fit: number;
  wounded: number;
  /** No man is fit to fight (src/game/encounter.ts armyLine); missing = false. */
  noneFit?: boolean;
  onPick: (key: AssaultChoiceKey) => void;
}

export interface AssaultHandle {
  /** Take a choice as a tap on it does (scripts); false when the sheet is gone or the choice isn't offered. */
  pick(key: AssaultChoiceKey): boolean;
  /** What Back does (scripts): back from the doctrine page, else Leave. */
  back(): void;
  /** Open the doctrine page (scripts). */
  doctrinePage(): void;
  close(): void;
  readonly closed: boolean;
  /** The primary choice on offer. */
  readonly primary: AssaultChoiceKey;
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

function para(scene: Phaser.Scene, c: Phaser.GameObjects.Container | null, x: number, y: number, str: string, font: FontKey, w: number, size = BODY): number {
  const ls = wrapWords(str, w, (s) => mw(s, font, size));
  if (c) c.add(mtext(scene, x, y, ls.join('\n'), font, { size }));
  return Math.ceil(ls.length * lh(size));
}

/** The primary choice: burn an empty lair, strike one in reach, else march there. */
export function assaultPrimary(m: Pick<AssaultModel, 'men' | 'inReach'>): AssaultChoiceKey {
  return m.men <= 0 ? 'burn' : m.inReach ? 'assault' : 'march';
}

function mainPage(scene: UiScene, c: Phaser.GameObjects.Container | null, m: AssaultModel, x0: number, y0: number, w: number, onInfo: () => void): number {
  const rule = (yy: number) => {
    if (!c) return;
    const g = scene.add.graphics();
    g.lineStyle(0.7, MOSAIC.parchEdge, 0.6);
    g.lineBetween(x0, yy, x0 + w, yy);
    c.add(g);
  };
  // the garrison in its niche; beside it the threat chip and its men, its level, the palisade
  if (c) {
    addNiche(scene, c, x0, y0, NICHE_W, NICHE_H);
    c.add(scene.add.image(x0 + NICHE_W / 2, y0 + NICHE_H - 3, m.tex, 0).setOrigin(0.5, 1).setScale(1.25));
  }
  const rx = x0 + NICHE_W + 6;
  const rw = w - NICHE_W - 6;
  let ry = y0;
  if (m.men > 0) {
    if (c) {
      c.add(scene.add.rectangle(rx, ry, CHIP, CHIP, m.color).setOrigin(0, 0).setStrokeStyle(1, P.outline));
      c.add(scene.add.image(rx + 3, ry + 2, worldGlyph(scene, m.lvl)).setOrigin(0, 0));
    }
    const threat = t('wld.enc.threat', { threat: t(`wld.threat.${m.lvl}` as TKey), men: t('wld.enc.men', { n: m.men }) });
    ry += Math.max(CHIP + 1, para(scene, c, rx + CHIP + 4, ry + 1.5, threat, 'pInk', rw - CHIP - 4));
    ry += para(scene, c, rx, ry + 1, t('arc.as.level', { culture: m.culture, lv: m.level }), 'pSec', rw, SMALL) + 2;
    ry += para(scene, c, rx, ry, t('arc.as.walls'), 'pInk', rw);
  } else ry += para(scene, c, rx, ry, t('arc.as.empty'), 'pInk', rw);
  let y = Math.max(y0 + NICHE_H, ry) + 5;

  // the doctrine row: icon, name, tell, (i)
  if (m.doctrine && m.men > 0) {
    rule(y);
    y += 4;
    const d = m.doctrine;
    if (c) c.add(scaleIcon(addIcon(scene, x0, y, doctrineIcon(d)), ROW_ICON / 12));
    const tx = x0 + ROW_ICON + 5;
    const tw = w - ROW_ICON - 5 - INFO - 4;
    let ty = y;
    ty += para(scene, c, tx, ty, t('wld.enc.doctrine', { name: doctrineName(d) }), 'rInk', tw);
    // a garrison holds its walls until the army closes in (EC-05, V5-073): only then does its doctrine show (QAFIX-WORLD S3-4)
    const tell = doctrineTell(d);
    ty += para(scene, c, tx, ty + 1, t('arc.as.tell', { tell: tell.charAt(0).toLowerCase() + tell.slice(1) }), 'pInk', tw, SMALL) + 1;
    if (c) c.add(new MIconButton(scene, x0 + w - INFO, y, INFO, INFO, { icon: 'info', label: t('wld.enc.doctrineInfo'), variant: 'secondary', id: 'assault.doctrine.info', onClick: onInfo }));
    y = Math.max(ty, y + INFO) + 3;
  }
  // the captain row: crest, name, level
  if (m.captain && m.men > 0) {
    if (c) c.add(scene.add.image(x0 + 3, y + 1, worldGlyph(scene, 'crest')).setOrigin(0, 0).setScale(1.2));
    y += para(scene, c, x0 + ROW_ICON + 5, y, t('wld.enc.captain', { name: heroName(m.captain.name), lv: m.captain.level }), 'pInk', w - ROW_ICON - 5) + 3;
  }
  // the reward: the hoard chest (R6), and how the lair counts toward the campaign
  rule(y);
  y += 4;
  if (c) c.add(scaleIcon(addIcon(scene, x0, y, 'chest'), ROW_ICON / 12));
  const reward = m.reborn ? t('arc.as.rewardReborn') : t('arc.as.reward', { n: m.picks });
  const rh = para(scene, c, x0 + ROW_ICON + 5, y + 1, reward, 'pInk', w - ROW_ICON - 5);
  y += Math.max(ROW_ICON, rh) + 2;
  y += para(scene, c, x0, y, m.reborn ? t('arc.as.rebornNote') : t('arc.as.counts', { n: m.burnt, total: m.total }), 'pSec', w, SMALL) + 3;
  rule(y);
  y += 4;
  // the army, and why the primary choice is "March there"
  const army = t(m.noneFit ? 'wld.enc.armyNoneFit' : m.wounded ? 'wld.enc.armyWounded' : 'wld.enc.army', { fit: m.fit, w: m.wounded });
  y += para(scene, c, x0, y, army, 'pSec', w, SMALL) + 1;
  if (m.men > 0 && !m.inReach) y += para(scene, c, x0, y + 1, t('arc.as.far'), 'pInk', w) + 1;
  return y - y0;
}

/** The doctrine's Codex text (as the Codex sheet and the encounter sheet have it) into `c`; returns its height. */
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

export function openAssaultSheet(scene: UiScene, m: AssaultModel, onClosed?: () => void): AssaultHandle {
  const { VW, VH } = scene.m;
  const w = VW - 8;
  const iw = w - PAD * 2;
  if (m.doctrine && m.men > 0) noteDoctrine(m.doctrine);
  const primary = assaultPrimary(m);
  let picked: AssaultChoiceKey | null = null;
  let closed = false;
  let page: Phaser.GameObjects.Container | null = null;

  const PRIMARY: Record<'assault' | 'march' | 'burn', { label: string; icon: string }> = {
    assault: { label: t('arc.as.assault'), icon: 'swords' },
    march: { label: t('arc.as.march'), icon: 'march' },
    burn: { label: t('arc.as.burn'), icon: 'fire' },
  };
  const p = PRIMARY[primary as 'assault' | 'march' | 'burn'];
  const actions = [
    { label: p.label, icon: p.icon, variant: 'primary' as const, id: `assault.${primary}`, onClick: () => void pick(primary) },
    { label: t('arc.as.leave'), icon: 'back', variant: 'secondary' as const, id: 'assault.leave', onClick: () => void pick('leave') },
  ];
  const contentH = mainPage(scene, null, m, 0, 0, iw, () => undefined);
  const h = Math.min(VH - 12, SHEET_TITLE_H + contentH + PAD * 2 + sheetActionsH(actions, w));
  const s: ParchmentSheetHandle = openParchmentSheet(scene, {
    w,
    h,
    dock: 'bottom',
    shadeCloses: false,
    closeButton: false,
    actions,
    id: 'assault.sheet',
    onClose: () => {
      if (closed) return;
      closed = true;
      onClosed?.();
      m.onPick(picked ?? 'leave');
    },
  });

  const pick = (key: AssaultChoiceKey): boolean => {
    if (closed || picked || (key !== primary && key !== 'leave')) return false;
    picked = key;
    s.close();
    return true;
  };
  const back = (): void => {
    if (closed) return;
    if (page?.visible) {
      showMain();
      return;
    }
    pick('leave');
  };

  // the title (the lair's name) over its rule, and the X (it does what Back does)
  s.c.add(mtext(scene, s.x + w / 2, s.y + 6, m.title, 'rInk', { size: 9, align: 0.5, maxW: w - 60 }));
  const tr = scene.add.graphics();
  tr.lineStyle(0.7, MOSAIC.parchEdge, 0.7);
  tr.lineBetween(s.x + 26, s.y + 21, s.x + w - 26, s.y + 21);
  s.c.add(tr);
  s.c.add(new MIconButton(scene, s.x + s.w - 25, s.y + 1, 22, 22, { icon: 'xmark', label: t('mosaic.close'), variant: 'secondary', id: 'assault.sheet.close', onClick: back }));
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
    page.add(new MIconButton(scene, body.x, body.y - 2, 22, 22, { icon: 'back', label: t('wld.enc.backToBand'), variant: 'secondary', id: 'assault.doctrine.back', onClick: showMain }));
    page.add(scaleIcon(addIcon(scene, body.x + 27, body.y + 3, doctrineIcon(d)), 1));
    page.add(mtext(scene, body.x + 43, body.y + 5, doctrineName(d).toUpperCase(), 'rInk', { size: BODY, maxW: iw - 43 }));
    const top = body.y + 24;
    const area = new ScrollArea(scene, page, body.x, top, iw, body.h - 24, scene.m.S);
    const th = doctrineText(scene, area.content, d, iw - 2);
    area.setContentHeight(th);
    if (th > body.h - 24) addScrollHint(scene, page, area, MOSAIC.parch);
    s.c.once('destroy', () => area.destroy());
    uiId(page, 'assault.doctrine');
  };

  // the scene's own teardown (a restart, a resize) ends the sheet; the lair is still there
  scene.events.once('shutdown', () => (closed = true));
  return {
    pick,
    back,
    doctrinePage: () => showPage(),
    close: () => s.close(),
    get closed() {
      return closed;
    },
    primary,
  };
}
