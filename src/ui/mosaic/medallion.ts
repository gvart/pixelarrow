/**
 * A skill medallion: an ability or aura as the battle HUD shows it, its icon
 * in colour on a round bronze medallion `d` UI px across. States: `learned`
 * (lit, a gold halo), `available` (bronze, a pulsing ring: it can be learned
 * now), `locked` (dark stone, the icon faded but in colour, a lock badge).
 */
import Phaser from 'phaser';
import { addIcon, panelK, scaleIcon, uiMetrics } from '../kit';
import { RS } from '../../platform/renderScale';
import { renderMedallion } from '../../art/smoothUi';
import { pulse } from '../motion';
import { ACCENT, MOTION } from '../tokens';

export function addMedallion(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, d: number, icon: string, state: 'learned' | 'available' | 'locked'): void {
  const K = panelK(scene);
  const css = (K * RS) / uiMetrics(scene).S;
  const look = state === 'learned' ? 'ready' : state === 'available' ? 'idle' : 'cool';
  const halo = 3;
  const key = `medal_${d}_${look}@${K}`;
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, renderMedallion(d, halo, look, K, css))!.setFilter(Phaser.Textures.FilterMode.LINEAR);
  const disc = scene.add.image(Math.round(x - halo), Math.round(y - halo), key).setOrigin(0, 0).setScale(1 / K);
  parent.add(disc);
  const k = (d * 0.6) / 12;
  const ic = scaleIcon(addIcon(scene, x + d / 2, y + d / 2, icon), k).setOrigin(0.5, 0.5);
  if (state === 'locked') ic.setAlpha(0.5);
  parent.add(ic);
  if (state === 'available') {
    const g = scene.add.graphics();
    g.lineStyle(1.2, ACCENT.goldHi, 1);
    g.strokeCircle(x + d / 2, y + d / 2, d / 2 + 1.5);
    parent.add(g);
    pulse(scene, g, 'alpha', 1, 0.3, MOTION.pulse);
  }
  if (state === 'locked') parent.add(scaleIcon(addIcon(scene, x + d - 9, y + d - 9, 'lock', 'D'), 0.75));
}
