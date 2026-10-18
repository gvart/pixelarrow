/**
 * The Victory variant of Results (campaign-arc.md R5.4, design/ux/
 * screens-campaign.md C-10): the Tyrant's host is beaten. A full-height page
 * with the company roll (every survivor by name, then the fallen), the
 * legendary set piece turned over, and "Continue the campaign"; the normal
 * Spoils follow. Drawn into a scroll area's content; returns its height.
 */
import Phaser from 'phaser';
import { tappable, type ScrollArea } from '../kit';
import { ItemIcon, Label, subjectName } from '../widgets';
import { mosaicImage, mtext, rarityInk } from '../mosaic';
import { RARITY_INK } from '../tokens';
import { RARITY_GLOW } from '../theme';
import { uiFrame, uiId } from '../layout';
import { motion } from '../motion';
import { LINE_H, wrapText } from '../textfit';
import { itemDef, type Item } from '../../data/items';
import { SETS } from '../../data/sets';
import { t, tOr } from '../../i18n';
import { sfx } from '../../audio';
import { haptic } from '../../platform/haptics';

interface ArcVictoryOpts {
  survivors: string[];
  fallen: string[];
  piece: Item | null;
  /** Tap on the set piece: inspect it. */
  onPiece: () => void;
}

export function buildArcVictory(scene: Phaser.Scene, c: Phaser.GameObjects.Container, area: ScrollArea, w: number, o: ArcVictoryOpts): number {
  let y = 2;
  const title = mtext(scene, w / 2, y, t('results.arc.title').toUpperCase(), 'rInk', { size: 9, align: 0.5, maxW: w - 4, box: { owner: c, w, h: 1e4 } });
  uiId(title, 'results.arc.title');
  c.add(title);
  y += 16;
  const lead = new Label(scene, w / 2, y, t('results.arc.won'), { maxW: w - 8, maxLines: 3, font: 'pSec', align: 0.5, area });
  c.add(lead);
  y += lead.h + 4;
  // the company roll: on a well, every name (P4 "every man has a name")
  const roll = new Label(scene, w / 2, y + 5, o.survivors.join(' · '), { maxW: w - 16, maxLines: 40, font: 'pInk', align: 0.5, area });
  const rollH = roll.h + 10;
  c.add(mosaicImage(scene, 0, y, w, rollH, 'parchmentWell'));
  c.add(roll);
  uiId(roll, 'results.arc.roll');
  y += rollH + 4;
  if (o.fallen.length) {
    const fallen = new Label(scene, w / 2, y, t('results.arc.fallen', { names: o.fallen.join(', ') }), { maxW: w - 8, maxLines: 6, font: 'pSec', align: 0.5, area });
    c.add(fallen);
    y += fallen.h + 6;
  }
  if (!o.piece) {
    const none = new Label(scene, w / 2, y, t('results.arc.noPiece'), { maxW: w - 8, maxLines: 3, font: 'pSec', align: 0.5, area });
    c.add(none);
    return y + none.h + 4;
  }
  // the set piece, turned over
  const it = o.piece;
  const cw = Math.min(w, 170);
  const tx = 36;
  const tw = cw - tx - 6;
  const def = itemDef(it.def);
  const set = def.set ? tOr(`set.${def.set}.name`, SETS[def.set]?.name ?? def.set) : '';
  const lines = wrapText(subjectName({ item: it }), tw, 3).lines;
  const subLines = wrapText(t('results.arc.piece', { set }), tw, 4).lines.length;
  const textH = (lines.length + subLines) * LINE_H + 1;
  const ch = Math.max(36, textH + 12);
  const card = scene.add.container(Math.round((w - cw) / 2) + cw / 2, y);
  c.add(card);
  const face = scene.add.container(-cw / 2, 0);
  card.add(face);
  face.add(mosaicImage(scene, 0, 0, cw, ch, 'parchment'));
  const fr = scene.add.graphics();
  fr.lineStyle(1.6, RARITY_INK.legendary, 1);
  fr.strokeRect(1.5, 1.5, cw - 3, ch - 3);
  face.add(fr);
  face.add(new ItemIcon(scene, 6, Math.round((ch - 24) / 2), { item: it }, { tip: false }));
  const ty = Math.round((ch - textH) / 2);
  const name = mtext(scene, tx, ty, lines.join('\n'), rarityInk(scene, 'legendary'), { box: { owner: face, w: cw, h: ch } });
  face.add(name);
  const sub = new Label(scene, tx, ty + lines.length * LINE_H + 1, t('results.arc.piece', { set }), { maxW: tw, maxLines: 4, font: 'pSec', area });
  face.add(sub);
  uiFrame(sub, face, cw, ch);
  const z = scene.add.zone(0, 0, cw, ch).setOrigin(0, 0).setInteractive();
  uiId(z, 'results.arc.piece');
  tappable(z, area, o.onPiece, t('results.tip.card'));
  face.add(z);
  if (!motion.reduced) {
    card.setScale(0, 1);
    scene.tweens.add({
      targets: card,
      scaleX: 1,
      duration: 250,
      delay: 600,
      ease: 'Sine.easeOut',
      onComplete: () => {
        if (!card.active) return;
        const glow = scene.add.rectangle(0, ch / 2, cw + 6, ch + 6, RARITY_GLOW.legendary, 0.8).setOrigin(0.5);
        card.addAt(glow, 0);
        scene.tweens.add({ targets: glow, alpha: 0, scaleX: 1.25, scaleY: 1.25, duration: 600, onComplete: () => glow.destroy() });
        sfx.play('coin');
        haptic('heavy');
      },
    });
  }
  return y + ch + 6;
}
