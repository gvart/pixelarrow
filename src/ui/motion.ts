/**
 * Motion switch of the UI (docs/UI_KIT.md "Motion"): Settings → Reduce motion,
 * by default the system's `prefers-reduced-motion`. Every UI tween goes through
 * `tweenTo` / `pulse` here, so one flag turns slides, pulses and count-ups into
 * instant changes. Pure of game state (the settings set it at boot).
 */
import type Phaser from 'phaser';

export const motion = { reduced: false };

/** The system asks for less motion. */
export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Apply the player's setting (undefined: follow the system). */
export function setReducedMotion(setting: boolean | undefined): void {
  motion.reduced = setting ?? prefersReducedMotion();
}

type Props = Record<string, number>;

/**
 * Tween `targets` to `props` over `duration` ms (ease-out). Under reduced
 * motion the values are set at once and `onComplete` runs on the next tick.
 */
export function tweenTo(scene: Phaser.Scene, targets: object | object[], props: Props, duration: number, o: { ease?: string; delay?: number; onComplete?: () => void; onUpdate?: () => void } = {}): Phaser.Tweens.Tween | null {
  if (motion.reduced || duration <= 0) {
    for (const t of Array.isArray(targets) ? targets : [targets]) Object.assign(t, props);
    o.onUpdate?.();
    if (o.onComplete) scene.time.delayedCall(0, o.onComplete);
    return null;
  }
  return scene.tweens.add({ targets, ...props, duration, delay: o.delay ?? 0, ease: o.ease ?? 'Cubic.easeOut', onComplete: o.onComplete, onUpdate: o.onUpdate });
}

/** A page that just replaced another (a tab switch) fades in: a crossfade, 180 ms. */
export function fadeIn(scene: Phaser.Scene, target: { alpha: number }, duration = 180): void {
  if (motion.reduced) return;
  target.alpha = 0;
  scene.tweens.add({ targets: target, alpha: 1, duration, ease: 'Cubic.easeOut' });
}

/** A gentle endless pulse of `prop` between `from` and `to` (claimable rewards, the current floor). Off under reduced motion. */
export function pulse(scene: Phaser.Scene, target: object, prop: string, from: number, to: number, duration = 900): Phaser.Tweens.Tween | null {
  if (motion.reduced) return null;
  return scene.tweens.add({ targets: target, [prop]: { from, to }, duration, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
}
