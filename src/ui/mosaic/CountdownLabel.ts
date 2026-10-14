/**
 * CountdownLabel (design/ux/accounts-v6.md §12): counts down m:ss and calls back at zero. Used by
 * Resend on the check-your-email card (60 s), and later by the link code timer (AU-13). It ticks on
 * the wall clock, not on frame time, so a backgrounded tab is right when it comes back; under Reduce
 * motion it changes the same way (it never tweens).
 */
import Phaser from 'phaser';
import type { FontKey } from '../kit';
import { mtext, mw } from './base';
import { wrapWords } from './policy';

/** 42_000 → "0:42", 61_000 → "1:01"; partial seconds round up, so 0:00 shows only at the end. */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * The timer alone: `onTick(time, msLeft)` now and every second, `onDone` once at zero. Returns a stop
 * function; the timer also stops when the scene shuts down.
 */
export function runCountdown(scene: Phaser.Scene, ms: number, onTick: (time: string, left: number) => void, onDone?: () => void, now: () => number = Date.now): () => void {
  const end = now() + ms;
  let ev: Phaser.Time.TimerEvent | null = null;
  const stop = () => {
    ev?.remove(false);
    ev = null;
  };
  const tick = () => {
    const left = Math.max(0, end - now());
    onTick(formatCountdown(left), left);
    if (left <= 0) {
      stop();
      onDone?.();
    }
  };
  tick();
  if (end > now()) ev = scene.time.addEvent({ delay: 250, loop: true, callback: tick });
  scene.events.once('shutdown', stop);
  return stop;
}

/** A text label running a countdown: `template` wraps the m:ss (e.g. "Resend in {time}"); with `maxW` it wraps onto more lines, never cut. */
export class CountdownLabel extends Phaser.GameObjects.Container {
  private readonly label: Phaser.GameObjects.BitmapText;
  private readonly stop: () => void;

  constructor(scene: Phaser.Scene, x: number, y: number, o: { ms: number; template?: (time: string) => string; font?: FontKey; size?: number; maxW?: number; onDone?: () => void }) {
    super(scene, x, y);
    const font = o.font ?? 'pInk';
    const size = o.size ?? 7;
    this.label = mtext(scene, 0, 0, '', font, { size });
    this.add(this.label);
    const text = (time: string): string => {
      const s = o.template ? o.template(time) : time;
      return o.maxW ? wrapWords(s, o.maxW, (x) => mw(x, font, size)).join('\n') : s;
    };
    this.stop = runCountdown(scene, o.ms, (time) => this.label.setText(text(time)), o.onDone);
    this.once('destroy', () => this.stop());
  }

  /** The label's height now (more than one line when it wrapped at `maxW`). */
  get textHeight(): number {
    return this.label.height;
  }
}
