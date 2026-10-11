/**
 * The beast info panel: a modal with the beast on a lit stage, how it fights
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
import { Button, ScrollArea, addPanel, addText, type FontKey } from './kit';
import { Label, addScrollHint, openModal, type Modal } from './widgets';
import { SIZE } from './theme';
import { MOSAIC, TEXT_MIN } from './tokens';
import { SHEET_TITLE_H, addCover, hasRaster, mosaicImage, mtext, mw, openParchmentSheet, sheetActionsH, wrapWords, type MButtonOpts } from './mosaic';
import { ellipsize } from './textfit';
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

/** Fonts a beast panel is written in (a dark v3 modal or the parchment sheet). */
interface BeastInk {
  body: FontKey;
  dim: FontKey;
  good: FontKey;
  /** The mark before each line of How it fights. */
  bullet: string;
  /** A section heading. */
  heading: (scene: Phaser.Scene, x: number, y: number, str: string, maxW: number) => Phaser.GameObjects.BitmapText;
}

const V3_INK: BeastInk = {
  body: 'ink',
  dim: 'dim',
  good: 'good',
  bullet: '-',
  heading: (scene, x, y, str, maxW) => addText(scene, x, y, ellipsize(str, maxW, false, 7, 'head'), 'head'),
};

const PARCHMENT_INK: BeastInk = {
  body: 'pInk',
  dim: 'pSec',
  good: 'pGood',
  bullet: '•',
  // one space between words (caps() doubles them for the wide-tracked plaques)
  heading: (scene, x, y, str, maxW) => mtext(scene, x, y, str.toUpperCase(), 'rInk', { size: 7, maxW }),
};

/** The scrolled content of a beast panel into the area (width `w`). */
function fillBeastInfo(scene: UiScene, area: ScrollArea, enc: EncounterId, w: number, o: BeastInfoOpts, ink: BeastInk, wellStyle: 'inset' | 'flat'): void {
  const c = area.content;
  const world = WORLD_BOSSES.includes(enc);
  const sheet = ink === PARCHMENT_INK;
  let y = 0;
  // a short sheet gives the stage less room so the words show
  const stageH = sheet ? Math.max(44, Math.min(74, Math.round(area.bounds.h * 0.4))) : 74;
  // the sheet: the painted plate (what it is) beside the figure on its stage (how it looks in battle)
  const plate = sheet ? beastPlate(scene, enc) : null;
  let sx = 0;
  if (plate) {
    c.add(mosaicImage(scene, 0, y, stageH, stageH, 'parchmentWell'));
    c.add(addCover(scene, 1, y + 1, stageH - 2, stageH - 2, plate));
    sx = stageH + 4;
  }
  beastStage(scene, c, enc, sx, y, w - sx, stageH);
  y += stageH + 4;
  const sub = `${world ? t('myth.info.worldBoss') : t('myth.info.lair')}${o.level ? `${sheet ? ' · ' : ' - '}${t('myth.info.level', { n: o.level })}` : ''}`;
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
    const l = new Label(scene, 0, y, `${ink.bullet} ${t(`myth.${enc}.hint${i}` as TKey)}`, { maxW: w, maxLines: sheet ? 5 : 3, font: ink.body, area });
    c.add(l);
    y += l.h + 2;
  }
  const terror = new Label(scene, 0, y, `${ink.bullet} ${t('myth.info.terror')}`, { maxW: w, maxLines: sheet ? 4 : 2, font: ink.body, area });
  c.add(terror);
  y += terror.h + 5;
  c.add(ink.heading(scene, 0, y, t('myth.info.counters'), w));
  y += 11;
  const ct = new Label(scene, 0, y, t(`myth.${enc}.counter` as TKey), { maxW: w, maxLines: sheet ? 5 : 3, area, font: ink.good });
  c.add(ct);
  y += ct.h + 5;
  const loot = new Label(scene, 0, y, t('myth.info.loot'), { maxW: w, maxLines: sheet ? 4 : 2, area, font: ink.dim });
  c.add(loot);
  y += loot.h + 4;
  // a backdrop under the scrolled content (the War panel's dark inset); the parchment sheet stays flat (TRL-2)
  if (wellStyle === 'inset') c.addAt(addPanel(scene, -2, -2, w + 4, y + 2, 'inset'), 0);
  area.setContentHeight(y);
}

export function openBeastInfo(scene: UiScene, enc: EncounterId, o: BeastInfoOpts = {}): Modal {
  const { VH } = scene.m;
  const modal = openModal(scene, { title: encounterName(enc), w: 220, h: Math.min(VH - 16, 330), onClose: o.onClose });
  const b = modal.body;
  const btnY = b.y + b.h - SIZE.btnH;
  const area = new ScrollArea(scene, modal.c, b.x, b.y, b.w, btnY - 6 - b.y, scene.m.S);
  fillBeastInfo(scene, area, enc, b.w - 4, o, V3_INK, 'inset');
  addScrollHint(scene, modal.c, area);
  const half = Math.floor((b.w - SIZE.gap) / 2);
  modal.c.add(new Button(scene, b.x, btnY, o.action ? half : b.w, SIZE.btnH, { label: t('common.close'), icon: 'back', onClick: () => modal.close() }));
  if (o.action) {
    const a = o.action;
    const btn = new Button(scene, b.x + half + SIZE.gap, btnY, b.w - half - SIZE.gap, SIZE.btnH, { label: a.label, icon: a.icon ?? 'swords', variant: 'primary', disabledReason: a.disabled, onClick: () => a.run() });
    if (a.disabled) btn.setEnabled(false, a.disabled);
    modal.c.add(btn);
  }
  modal.c.once('destroy', () => area.destroy());
  return modal;
}

/**
 * The Codex beast sheet (M-1): a parchment sheet with the X (no footer Close, G5) over the dimmed screen:
 * the beast's plate and figure, how it fights, what beats it and its drops, then the caption and the
 * primary action (Trial fight) across the bottom. Back and the X close it; the screen under it stays.
 */
export function openBeastSheet(scene: UiScene, enc: EncounterId, o: BeastInfoOpts = {}): { close: () => void } {
  const { VW, VH } = scene.m;
  // docked: the full width (a long name keeps its title size beside the X at 320)
  const w = VW - 8;
  const actions: MButtonOpts[] = o.action
    ? [{ label: o.action.label, icon: o.action.icon ?? 'swords', variant: o.action.disabled ? 'disabled' : 'primary', disabledReason: o.action.disabled, onClick: () => o.action!.run(), id: 'beast.sheet.action' }]
    : [];
  // the caption over the action: what a Trial fight is, or why it cannot be fought now
  const caption = o.action?.disabled ?? o.caption;
  const bw = w - 16;
  const capSize = Math.max(TEXT_MIN, 7);
  const capFont: FontKey = o.action?.disabled ? 'pInk' : 'pSec';
  const capLines = caption ? wrapWords(caption, bw, (str) => mw(str, capFont, capSize)).slice(0, 3) : [];
  const capH = capLines.length ? capLines.length * 10 + 4 : 0;
  // as tall as its content (measured once off screen), at most the screen
  const probe = scene.add.container(0, 0);
  const pa = new ScrollArea(scene, probe, 0, 0, bw, 1000, scene.m.S);
  fillBeastInfo(scene, pa, enc, bw - 4, o, PARCHMENT_INK, 'flat');
  const contentH = pa.contentHeight;
  pa.destroy();
  probe.destroy();
  const h = Math.min(VH - 12, SHEET_TITLE_H + contentH + 6 + capH + sheetActionsH(actions, w) + 8);
  const s = openParchmentSheet(scene, { title: encounterName(enc), w, h, actions, dock: 'bottom', id: 'beast.sheet', onClose: o.onClose });
  const b = s.body;
  if (capLines.length) s.c.add(mtext(scene, b.x + b.w / 2, b.y + b.h - capH + 2, capLines.join('\n'), capFont, { size: capSize, align: 0.5 }).setCenterAlign());
  const area = new ScrollArea(scene, s.c, b.x, b.y, b.w, b.h - capH - 2, scene.m.S);
  fillBeastInfo(scene, area, enc, b.w - 4, o, PARCHMENT_INK, 'flat');
  addScrollHint(scene, s.c, area, MOSAIC.parch);
  s.c.once('destroy', () => area.destroy());
  return { close: s.close };
}
