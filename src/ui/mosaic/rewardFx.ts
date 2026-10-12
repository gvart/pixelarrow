/**
 * Reward feedback: a reward flying into the balance it lands on, and the soft
 * endless glow on something ready to claim. Both follow Reduce motion.
 */
import Phaser from 'phaser';
import { addIcon, scaleIcon } from '../kit';
import { motion, pulse } from '../motion';
import { ACCENT, MOTION } from '../tokens';
import type { UiScene } from '../widgets';

/** What a reward flies into: a balance container `h` tall that takes the new value. */
export type FlyTarget = Phaser.GameObjects.Container & { readonly h: number; setValue(v: number): unknown };

/**
 * A reward flies from (x, y) (UI px) into its chip, which then takes `value`.
 * Under reduced motion the chip just takes the value.
 */
export function flyReward(scene: UiScene, icon: string, x: number, y: number, chip: FlyTarget, value: number): void {
  if (motion.reduced || !chip.scene) {
    chip.setValue(value);
    return;
  }
  const m = chip.getWorldTransformMatrix();
  const S = scene.m.S;
  const tx = m.tx / S + 4;
  const ty = m.ty / S + (chip.h - 12) / 2;
  for (let i = 0; i < 5; i++) {
    const img = scaleIcon(addIcon(scene, x, y, icon), 1.4).setOrigin(0.5, 0.5);
    scene.ui.add(img);
    const delay = i * 60;
    scene.tweens.add({ targets: img, x: tx + 6, y: ty + 6, scale: img.scale * 0.6, duration: 520, delay, ease: 'Cubic.easeIn', onComplete: () => img.destroy() });
  }
  scene.time.delayedCall(520 + 4 * 60, () => chip.scene && chip.setValue(value));
}

/** A soft endless glow on a claimable thing (a rounded rect round x, y, w, h). Returns the glow. */
export function addClaimGlow(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, w: number, h: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(ACCENT.goldHi, 0.18);
  g.fillRoundedRect(x - 1, y - 1, w + 2, h + 2, 5);
  g.lineStyle(1, ACCENT.goldHi, 0.9);
  g.strokeRoundedRect(x - 0.5, y - 0.5, w + 1, h + 1, 5);
  parent.add(g);
  pulse(scene, g, 'alpha', 1, 0.35, MOTION.pulse);
  return g;
}
