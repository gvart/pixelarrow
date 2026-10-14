/**
 * The beast sheet: a parchment sheet with the beast on a lit stage, how it fights
 * (mechanic hints), what beats it, its loot and (world bosses) the raid
 * status. Opened from the Codex (the beast sheet, with the Trial fight) and
 * from a lair or world boss hex on the war-table map.
 *
 * Painted beast plates (AS-05, art bible plate family) are files
 * public/ui/beasts/plate_<beast>.jpg, loaded on first use. Only plates that
 * were checked in the game and promoted are listed (SHIPPED_PLATES): a beast
 * without one shows its pixel figure, never a broken image.
 */
import Phaser from 'phaser';
import { ScrollArea, type FontKey } from './kit';
import { Label, addScrollHint, markSurface } from './widgets';
import { MOSAIC, SPACE, TEXT_MIN } from './tokens';
import { MButton, SHEET_ACTION_H, SHEET_TITLE_H, addCover, hasRaster, mosaicImage, mtext, mw, openParchmentSheet, sheetActionsH, sheetWidth, wrapWords, type MButtonOpts } from './mosaic';
import { layoutVariant, type Box } from './mosaic/layout/geometry';
import { BUTTON_MAX, DIALOG_MAX } from './sizeClass';
import { uiId, uiPrimary } from './layout';
import { focusPane } from './focusRing';
import { ensureDoll, dollFrame, dollOrigin } from './sprites';
import { renderStage } from '../art/sheetArt';
import { renderFrame } from '../art/paperdoll';
import { Pix } from '../art/pixels';
import { ENCOUNTERS, MYTHS, WORLD_BOSSES, type EncounterId } from '../data/beasts';
import { beastLevelFor } from '../game/beasts';
import { state } from '../state';
import { t, tOr, type TKey } from '../i18n';
import type { UIMetrics } from './kit';

type UiScene = Phaser.Scene & { m: UIMetrics; ui: Phaser.GameObjects.Container };

/** The beast's level against the field army (Codex rows, the trial list and panel, the trial fight). */
export const beastLevel = (enc: EncounterId): number => beastLevelFor(enc, state.campaign.fitHeroes());

/** Beasts whose painted plate is shipped under public/ui/beasts/ (tests/codex.test.ts checks the files). */
export const SHIPPED_PLATES: ReadonlySet<EncounterId> = new Set<EncounterId>(['hydra', 'cyclops', 'harpies', 'nemean_lion', 'minotaur', 'chimera', 'kraken', 'titan']);
export const plateKey = (enc: EncounterId): string => `plate_${enc}`;
export const plateUrl = (enc: EncounterId): string => `ui/beasts/plate_${enc}.jpg`;

/** Plates already asked for (a file that failed to load is not asked for again). */
const askedPlates = new Set<string>();

/** Load the shipped plates of `encs` not asked for yet; `done` runs once they arrive. False (and no `done`) when none was missing. */
export function ensurePlates(scene: Phaser.Scene, encs: Iterable<EncounterId>, done: () => void): boolean {
  const missing = [...new Set(encs)].filter((e) => SHIPPED_PLATES.has(e) && !askedPlates.has(e) && !hasRaster(scene, plateKey(e)));
  if (!missing.length) return false;
  for (const e of missing) {
    askedPlates.add(e);
    scene.load.image(plateKey(e), plateUrl(e));
  }
  scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
    if (scene.sys.isActive()) done();
  });
  scene.load.start();
  return true;
}

/** The beast's painted plate if it is loaded, else null. */
export function beastPlate(scene: Phaser.Scene, enc: EncounterId): string | null {
  return SHIPPED_PLATES.has(enc) && hasRaster(scene, plateKey(enc)) ? plateKey(enc) : null;
}

/** A size x size thumbnail of the beast (cropped to the figure, scaled down to fit). */
export function beastThumb(scene: Phaser.Scene, enc: EncounterId, size: number): string {
  const key = `myth_thumb_${enc}_${size}`;
  if (scene.textures.exists(key)) return key;
  const fr = renderFrame({ look: { skin: 0, hair: 0, hairStyle: 0, beard: 0, tunic: 'tunicWhite' }, beast: ENCOUNTERS[enc].body }, 0, 2);
  let x0 = fr.w;
  let y0 = fr.h;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < fr.h; y++)
    for (let x = 0; x < fr.w; x++)
      if (fr.alpha(x, y) > 0) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  const bw = Math.max(1, x1 - x0 + 1);
  const bh = Math.max(1, y1 - y0 + 1);
  const k = Math.max(1, Math.max(bw, bh) / size);
  const out = new Pix(size, size);
  const ox = Math.floor((size - bw / k) / 2);
  const oy = Math.floor(size - bh / k);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const sx = Math.floor(x0 + (x - ox) * k);
      const sy = Math.floor(y0 + (y - oy) * k);
      if (sx < x0 || sy < y0 || sx > x1 || sy > y1) continue;
      if (fr.alpha(sx, sy) > 0) out.set(x, y, fr.get(sx, sy));
    }
  scene.textures.addCanvas(key, out.toCanvas());
  return key;
}

export function encounterName(enc: EncounterId): string {
  if (enc === 'harpies') return t('myth.name.harpies');
  return tOr(`class.${enc}.name`, MYTHS[ENCOUNTERS[enc].body].name);
}

/** The beast standing on a small stage (w x h), drawn into a container at (x, y). */
export function beastStage(scene: Phaser.Scene, c: Phaser.GameObjects.Container, enc: EncounterId, x: number, y: number, w: number, h: number): void {
  const key = `myth_stage_${w}x${h}_${enc}`;
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, renderStage(w, h, ENCOUNTERS[enc].color).toCanvas());
  c.add(scene.add.image(x, y, key).setOrigin(0, 0));
  const e = ENCOUNTERS[enc];
  const look = { skin: 0, hair: 0, hairStyle: 0, beard: 0, tunic: 'tunicWhite' };
  const body = ensureDoll(scene, { look, beast: e.body }, [2]);
  const [ox, oy] = dollOrigin(body);
  const foot = y + Math.round(h * 0.86);
  const fig = scene.add.sprite(Math.round(x + w / 2), foot, body, dollFrame(2, 0)).setOrigin(ox, oy);
  // a big beast is shrunk to fit the stage
  const fh = fig.height;
  const k = Math.min(1, (h * 0.9) / fh, (w * 0.95) / fig.width);
  fig.setScale(k >= 1 ? 1 : k > 0.5 ? 0.5 : k);
  c.add(fig);
  if (e.parts) {
    const part = ensureDoll(scene, { look, beast: e.parts.id }, [2]);
    const [px, py] = dollOrigin(part);
    for (const dx of [-0.28, 0, 0.28]) c.add(scene.add.sprite(Math.round(x + w / 2 + dx * w * 0.6), foot + 6, part, dollFrame(2, dx === 0 ? 6 : 0)).setOrigin(px, py).setScale(fig.scaleX));
  }
  if (e.flock) {
    for (const dx of [-0.3, 0.3]) c.add(scene.add.sprite(Math.round(x + w / 2 + dx * w), foot - 14, body, dollFrame(2, 1)).setOrigin(ox, oy).setFlipX(dx < 0));
  }
}

export interface BeastInfoOpts {
  level?: number;
  /** Extra lines under the title (raid status, respawn). */
  extra?: string[];
  /** World bosses: the shared HP bar (and arms alive). */
  hp?: { v: number; max: number; pips?: boolean[] };
  /** Primary action ("Trial fight", "Raid it"); none = info only. */
  action?: { label: string; icon?: string; run: () => void; disabled?: string };
  /** The beast sheet: a line over the action saying what it does (the reason replaces it when the action is off). */
  caption?: string;
  onClose?: () => void;
}

/** Fonts the beast sheet is written in (ink on the parchment sheet). */
const ink: { body: FontKey; dim: FontKey; good: FontKey; bullet: string; heading: (scene: Phaser.Scene, x: number, y: number, str: string, maxW: number) => Phaser.GameObjects.BitmapText } = {
  body: 'pInk',
  dim: 'pSec',
  good: 'pGood',
  /** The mark before each line of How it fights. */
  bullet: '•',
  // a section heading: one space between words (caps() doubles them for the wide-tracked plaques)
  heading: (scene, x, y, str, maxW) => mtext(scene, x, y, str.toUpperCase(), 'rInk', { size: 7, maxW }),
};

/** The narrowest stage the figure keeps beside the plate, UI px. */
const FIGURE_MIN = 24;

/**
 * The height of the beast's stage (and its square plate): a short sheet gives the stage less room so the words
 * show, and beside the plate the figure always keeps some width (a narrow column once asked for a stage of
 * negative width: the 844x390 Telegram crash, V6-RSCR-09).
 */
export function beastStageH(areaH: number, w: number, plate: boolean): number {
  const h = Math.max(44, Math.min(74, Math.round(areaH * 0.4)));
  return plate ? Math.min(h, w - 4 - FIGURE_MIN) : h;
}

/** The scrolled content of a beast panel into the area (width `w`). */
function fillBeastInfo(scene: UiScene, area: ScrollArea, enc: EncounterId, w: number, o: BeastInfoOpts): void {
  const c = area.content;
  const world = WORLD_BOSSES.includes(enc);
  let y = 0;
  // the sheet: the painted plate (what it is) beside the figure on its stage (how it looks in battle)
  const plate = beastPlate(scene, enc);
  const stageH = beastStageH(area.bounds.h, w, !!plate);
  let sx = 0;
  if (plate) {
    c.add(mosaicImage(scene, 0, y, stageH, stageH, 'parchmentWell'));
    c.add(addCover(scene, 1, y + 1, stageH - 2, stageH - 2, plate));
    sx = stageH + 4;
  }
  beastStage(scene, c, enc, sx, y, w - sx, stageH);
  y += stageH + 4;
  const sub = `${world ? t('myth.info.worldBoss') : t('myth.info.lair')}${o.level ? ` · ${t('myth.info.level', { n: o.level })}` : ''}`;
  const subLabel = new Label(scene, 0, y, sub, { maxW: w, maxLines: 2, font: ink.dim, area });
  c.add(subLabel);
  y += subLabel.h + 3;
  if (o.hp) {
    const g = scene.add.graphics();
    const f = o.hp.max > 0 ? Math.max(0, Math.min(1, o.hp.v / o.hp.max)) : 0;
    const pips = o.hp.pips ?? [];
    const bw = w - (pips.length ? pips.length * 6 + 4 : 0);
    g.fillStyle(0x2a1a16, 1);
    g.fillRect(0, y, bw, 6);
    g.fillStyle(0xa83a2c, 1);
    g.fillRect(0, y, Math.round(bw * f), 6);
    g.fillStyle(0xffffff, 0.25);
    g.fillRect(0, y, Math.round(bw * f), 1);
    pips.forEach((alive, i) => {
      g.fillStyle(alive ? 0x7a3a46 : 0x3a2a22, 1);
      g.fillRect(bw + 4 + i * 6, y, 5, 6);
    });
    c.add(g);
    y += 10;
  }
  for (const line of o.extra ?? []) {
    const l = new Label(scene, 0, y, line, { maxW: w, maxLines: 2, font: ink.body, area });
    c.add(l);
    y += l.h + 2;
  }
  y += 3;
  c.add(ink.heading(scene, 0, y, t('myth.info.mechanics'), w));
  y += 11;
  for (let i = 1; i <= ENCOUNTERS[enc].hints; i++) {
    const l = new Label(scene, 0, y, `${ink.bullet} ${t(`myth.${enc}.hint${i}` as TKey)}`, { maxW: w, maxLines: 5, font: ink.body, area });
    c.add(l);
    y += l.h + 2;
  }
  const terror = new Label(scene, 0, y, `${ink.bullet} ${t('myth.info.terror')}`, { maxW: w, maxLines: 4, font: ink.body, area });
  c.add(terror);
  y += terror.h + 5;
  c.add(ink.heading(scene, 0, y, t('myth.info.counters'), w));
  y += 11;
  const ct = new Label(scene, 0, y, t(`myth.${enc}.counter` as TKey), { maxW: w, maxLines: 5, area, font: ink.good });
  c.add(ct);
  y += ct.h + 5;
  const loot = new Label(scene, 0, y, t(world ? 'myth.info.lootWorld' : 'myth.info.lootLair'), { maxW: w, maxLines: 4, area, font: ink.dim });
  c.add(loot);
  y += loot.h + 4;
  area.setContentHeight(y);
}

/**
 * The Codex beast sheet (M-1): a parchment sheet with the X (no footer Close, G5) over the dimmed screen:
 * the beast's plate and figure, how it fights, what beats it and its drops, then the caption and the
 * primary action (Trial fight) across the bottom. Back and the X close it; the screen under it stays.
 */
export function openBeastSheet(scene: UiScene, enc: EncounterId, o: BeastInfoOpts = {}): { close: () => void } {
  const { VW, VH } = scene.m;
  // docked: the full width (a long name keeps its title size beside the X at 320); elsewhere the side panel or
  // tablet sheet it will be (landscape-v6 §3.4), so the words fill the box they get
  const v = layoutVariant(scene.m);
  const w = v === 'compactPortrait' ? VW - 8 : sheetWidth(scene, { dock: 'bottom', w: v === 'medium' ? DIALOG_MAX : undefined });
  // outside compact portrait the Trial fight is one button of at most 240 (§2.3), not the sheet's full-width row
  const own = v !== 'compactPortrait' && !!o.action;
  const actions: MButtonOpts[] = o.action && !own ? [actionOpts(o.action)] : [];
  const ownH = own ? SHEET_ACTION_H + SPACE.sm : 0;
  const bw = w - 16;
  const cap = captionOf(o, bw);
  // as tall as its content (measured once off screen), at most the screen
  const probe = scene.add.container(0, 0);
  const pa = new ScrollArea(scene, probe, 0, 0, bw, 1000, scene.m.S);
  fillBeastInfo(scene, pa, enc, bw - 4, o);
  const contentH = pa.contentHeight;
  pa.destroy();
  probe.destroy();
  const h = Math.min(VH - 12, SHEET_TITLE_H + contentH + 6 + cap.h + sheetActionsH(actions, w) + ownH + 8);
  const s = openParchmentSheet(scene, { title: encounterName(enc), w, h, actions, dock: 'bottom', id: 'beast.sheet', onClose: o.onClose });
  const b = s.body;
  let bottom = b.y + b.h;
  if (own) {
    const aw = Math.min(BUTTON_MAX, b.w);
    bottom -= SHEET_ACTION_H;
    s.c.add(new MButton(scene, b.x + Math.round((b.w - aw) / 2), bottom, aw, SHEET_ACTION_H, actionOpts(o.action!)));
    bottom -= SPACE.sm;
  }
  if (cap.lines.length) s.c.add(mtext(scene, b.x + b.w / 2, bottom - cap.h + 2, cap.lines.join('\n'), cap.font, { size: cap.size, align: 0.5 }).setCenterAlign());
  const area = new ScrollArea(scene, s.c, b.x, b.y, b.w, bottom - cap.h - 2 - b.y, scene.m.S);
  fillBeastInfo(scene, area, enc, b.w - 4, o);
  addScrollHint(scene, s.c, area, MOSAIC.parch);
  s.c.once('destroy', () => area.destroy());
  return { close: s.close };
}

/** The beast's primary action as a button (Trial fight; disabled with its reason). */
function actionOpts(a: NonNullable<BeastInfoOpts['action']>): MButtonOpts {
  return { label: a.label, icon: a.icon ?? 'swords', variant: a.disabled ? 'disabled' : 'primary', disabledReason: a.disabled, onClick: () => a.run(), id: 'beast.sheet.action' };
}

/** The caption over the action: what a Trial fight is, or why it cannot be fought now (up to 3 lines of `w`). */
function captionOf(o: BeastInfoOpts, w: number): { lines: string[]; font: FontKey; size: number; h: number } {
  const caption = o.action?.disabled ?? o.caption;
  const size = Math.max(TEXT_MIN, 7);
  const font: FontKey = o.action?.disabled ? 'pInk' : 'pSec';
  const lines = caption ? wrapWords(caption, w, (str) => mw(str, font, size)).slice(0, 3) : [];
  return { lines, font, size, h: lines.length ? lines.length * 10 + 4 : 0 };
}

/** Padding inside a detail pane, UI px (a sheet's). */
const PANE_PAD = 8;

/** A detail pane's title (as a sheet's, without the X: the pane is not a layer) and its rule; returns where the body starts. */
export function addPaneTitle(scene: Phaser.Scene, c: Phaser.GameObjects.Container, box: Box, title: string): number {
  const room = box.w - PANE_PAD * 2;
  c.add(mtext(scene, box.x + box.w / 2, box.y + 5, title, 'rInk', { size: 9, maxW: room, align: 0.5 }));
  const g = scene.add.graphics();
  g.lineStyle(0.7, MOSAIC.parchEdge, 0.7);
  g.lineBetween(box.x + PANE_PAD, box.y + 21, box.x + box.w - PANE_PAD, box.y + 21);
  c.add(g);
  return box.y + SHEET_TITLE_H;
}

/**
 * The beast as a detail pane beside the Codex list (landscape-v6 §13.2): the same content as the sheet (title,
 * plate and stage, how it fights, what beats it, drops, the caption and the Trial fight at the foot), laid out
 * in `box` of `parent`. It keeps the sheet's ids, so the layout check sees the same elements at every size.
 */
export function addBeastDetail(scene: UiScene, parent: Phaser.GameObjects.Container, box: Box, enc: EncounterId, o: BeastInfoOpts = {}): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  parent.add(c);
  c.add(mosaicImage(scene, box.x, box.y, box.w, box.h, 'sheet'));
  markSurface(c, MOSAIC.parch);
  uiId(c, 'beast.sheet');
  const top = addPaneTitle(scene, c, box, encounterName(enc));
  const iw = box.w - PANE_PAD * 2;
  let bottom = box.y + box.h - PANE_PAD;
  if (o.action) {
    const bw = Math.min(BUTTON_MAX, iw);
    bottom -= SHEET_ACTION_H;
    const b = new MButton(scene, box.x + Math.round((box.w - bw) / 2), bottom, bw, SHEET_ACTION_H, actionOpts(o.action));
    c.add(uiPrimary(b));
    focusPane(b, 1);
    bottom -= SPACE.sm;
  }
  const cap = captionOf(o, iw);
  if (cap.lines.length) c.add(mtext(scene, box.x + box.w / 2, bottom - cap.h + 2, cap.lines.join('\n'), cap.font, { size: cap.size, align: 0.5 }).setCenterAlign());
  const area = new ScrollArea(scene, c, box.x + PANE_PAD, top, iw, bottom - cap.h - 2 - top, scene.m.S);
  fillBeastInfo(scene, area, enc, iw - 4, o);
  addScrollHint(scene, c, area, MOSAIC.parch);
  c.once('destroy', () => area.destroy());
  return c;
}
