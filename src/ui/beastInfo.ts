/**
 * The beast info panel: a modal with the beast on a lit stage, how it fights
 * (mechanic hints), what beats it, its loot and (world bosses) the raid
 * status. Opened from the Beast trial list and from a lair or world boss hex
 * on the war-table map.
 */
import Phaser from 'phaser';
import { Button, ScrollArea, addPanel, addText, type FontKey } from './kit';
import { Label, addScrollHint, openModal, type Modal } from './widgets';
import { SIZE } from './theme';
import { FRAME_T } from '../art/mosaicUi';
import { MOSAIC, MOTION, SPACE } from './tokens';
import { uiBlocker } from './layout';
import { BottomPanel, TOPBAR_H, caps, mosaicImage, mtext, type MButtonOpts } from './mosaic';
import { actionRows } from './mosaic/BottomPanel';
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

/** A size x size thumbnail of the beast (cropped to the figure, scaled down to fit). */
/** The beast's level against the field army (Codex rows, the trial list and panel, the trial fight). */
export const beastLevel = (enc: EncounterId): number => beastLevelFor(enc, state.campaign.fitHeroes());

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
  /** Primary action ("Fight it", "Raid it"); none = info only. */
  action?: { label: string; icon?: string; run: () => void; disabled?: string };
  onClose?: () => void;
}

/** Fonts a beast panel is written in (a dark v3 modal or the parchment sheet). */
interface BeastInk {
  body: FontKey;
  dim: FontKey;
  good: FontKey;
  /** A section heading. */
  heading: (scene: Phaser.Scene, x: number, y: number, str: string, maxW: number) => Phaser.GameObjects.BitmapText;
}

const V3_INK: BeastInk = {
  body: 'ink',
  dim: 'dim',
  good: 'good',
  heading: (scene, x, y, str, maxW) => addText(scene, x, y, ellipsize(str, maxW, false, 7, 'head'), 'head'),
};

const PARCHMENT_INK: BeastInk = {
  body: 'pInk',
  dim: 'pSec',
  good: 'pGood',
  heading: (scene, x, y, str, maxW) => mtext(scene, x, y, caps(str), 'rInk', { size: 7, maxW }),
};

/** The scrolled content of a beast panel into the area (width `w`). */
function fillBeastInfo(scene: UiScene, area: ScrollArea, enc: EncounterId, w: number, o: BeastInfoOpts, ink: BeastInk, wellStyle: 'inset' | 'parchmentWell'): void {
  const c = area.content;
  const world = WORLD_BOSSES.includes(enc);
  let y = 0;
  // a short sheet gives the stage less room so the words show
  const stageH = ink === PARCHMENT_INK ? Math.max(44, Math.min(74, Math.round(area.bounds.h * 0.45))) : 74;
  beastStage(scene, c, enc, 0, y, w, stageH);
  y += stageH + 4;
  const sub = `${world ? t('myth.info.worldBoss') : t('myth.info.lair')}${o.level ? ` - ${t('myth.info.level', { n: o.level })}` : ''}`;
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
    const l = new Label(scene, 0, y, `- ${t(`myth.${enc}.hint${i}` as TKey)}`, { maxW: w, maxLines: 3, font: ink.body, area });
    c.add(l);
    y += l.h + 2;
  }
  const terror = new Label(scene, 0, y, `- ${t('myth.info.terror')}`, { maxW: w, maxLines: 2, font: ink.body, area });
  c.add(terror);
  y += terror.h + 5;
  c.add(ink.heading(scene, 0, y, t('myth.info.counters'), w));
  y += 11;
  const ct = new Label(scene, 0, y, t(`myth.${enc}.counter` as TKey), { maxW: w, maxLines: 3, area, font: ink.good });
  c.add(ct);
  y += ct.h + 5;
  const loot = new Label(scene, 0, y, t('myth.info.loot'), { maxW: w, maxLines: 2, area, font: ink.dim });
  c.add(loot);
  y += loot.h + 4;
  // a backdrop under the scrolled content: the text's own box for the layout check
  c.addAt(wellStyle === 'inset' ? addPanel(scene, -2, -2, w + 4, y + 2, 'inset') : mosaicImage(scene, -2, -2, w + 4, y + 2, 'parchmentWell'), 0);
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
 * The v4 beast panel (Beast trial): a parchment sheet over the dimmed screen with the beast on its
 * stage, how it fights, what beats it and its drops, and Close / the primary action (Fight).
 */
export function openBeastSheet(scene: UiScene, enc: EncounterId, o: BeastInfoOpts = {}): { close: () => void } {
  const { VW, VH } = scene.m;
  const root = scene.add.container(0, 0);
  scene.ui.add(root);
  const shade = uiBlocker(scene.add.rectangle(0, 0, VW, VH, 0x000000, 0.45).setOrigin(0, 0).setInteractive());
  root.add(shade);
  const w = VW - (FRAME_T + 2) * 2;
  const top = FRAME_T + TOPBAR_H + 4;
  const bottom = VH - FRAME_T - 2;
  let panel: BottomPanel | null = null;
  let area: ScrollArea | null = null;
  const close = () => panel?.close();
  const actions: MButtonOpts[] = [{ label: t('common.close'), icon: 'back', variant: 'secondary', onClick: close }];
  if (o.action) actions.push({ label: o.action.label, icon: o.action.icon ?? 'swords', variant: o.action.disabled ? 'disabled' : 'primary', disabledReason: o.action.disabled, onClick: () => o.action!.run() });
  const rows = actionRows(actions, w - SPACE.md * 2).length;
  const chrome = SPACE.md + 20 + rows * 27 + SPACE.md * 2;
  const bodyH = Math.max(60, Math.min(bottom - top - chrome, 300));
  panel = new BottomPanel(scene, VW, bottom, {
    title: encounterName(enc),
    w,
    bodyH,
    actions,
    animate: false,
    id: 'beast.sheet',
    onClose: () => {
      area?.destroy();
      o.onClose?.();
      // after the panel's fade-out
      scene.time.delayedCall(MOTION.fade + 40, () => root.scene && root.destroy());
    },
  });
  root.add(panel);
  shade.on('pointerup', close);
  area = new ScrollArea(scene, root, panel.x + panel.area.x, panel.y + panel.area.y, panel.area.w, panel.area.h, scene.m.S);
  fillBeastInfo(scene, area, enc, panel.area.w - 4, o, PARCHMENT_INK, 'parchmentWell');
  addScrollHint(scene, root, area, MOSAIC.well);
  return { close };
}
