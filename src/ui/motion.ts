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

/** A claimable thing hops (a chest ready to open): up `dy` and back, then a rest. Off under reduced motion. */
export function hop(scene: Phaser.Scene, target: { y: number }, dy = 2, every = 1400): Phaser.Tweens.Tween | null {
  if (motion.reduced) return null;
  const y0 = target.y;
  return scene.tweens.add({ targets: target, y: { from: y0, to: y0 - dy }, duration: 160, yoyo: true, repeat: -1, repeatDelay: every, ease: 'Quad.easeOut' });
}

/**
 * Idle animation of a pixel sprite (a torch flickers, a pennant flutters):
 * steps through `frames` of its texture on one timer (no object per frame),
 * at slightly uneven intervals so several never tick together. Frame 0 and
 * still under reduced motion. Stops with the sprite.
 */
export function idleFrames(scene: Phaser.Scene, img: Phaser.GameObjects.Image, frames: number, ms = 180, seed = 0): void {
  img.setFrame(0);
  if (motion.reduced || frames < 2) return;
  let i = 0;
  let k = seed;
  const ev = scene.time.addEvent({
    delay: ms,
    loop: true,
    callback: () => {
      if (!img.active) return void ev.remove();
      k = (k * 1103515245 + 12345) & 0x7fffffff;
      i = (i + 1 + (k % 7 === 0 ? 1 : 0)) % frames;
      img.setFrame(i);
    },
  });
  img.once('destroy', () => ev.remove());
}
