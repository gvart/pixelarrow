/**
 * The battle clock: the sim is owed the real time since the last frame (capped),
 * not Phaser's smoothed delta. Below 5 fps Phaser hands update() 16.7 ms a frame,
 * and the guided battle's first scripted run (1.2 s of battle after Fight, counted
 * in sim steps) took 72 frames on CI's software-GL Chromium instead of a handful.
 */
import { describe, expect, it, vi } from 'vitest';
import { DT } from '../src/sim/battle';

vi.mock('phaser', () => {
  class C {}
  return { default: { GameObjects: { Container: C, Image: C, Text: C, Graphics: C, Rectangle: C }, Scene: C } };
});
const { MAX_FRAME_S, frameBattleSeconds } = await import('../src/ui/battleHud');

/** Frames of `frameMs` until `ticks` sim steps went by, stepping as BattleScene does (at most 10 a frame). */
function framesFor(ticks: number, frameMs: number, clock: (ms: number) => number): number {
  let acc = 0;
  let done = 0;
  let frames = 0;
  while (done < ticks && frames < 10000) {
    frames++;
    acc += clock(frameMs);
    for (let s = 0; acc >= DT && s < 10 && done < ticks; s++, done++) acc -= DT;
  }
  return frames;
}

describe('frameBattleSeconds', () => {
  it('is the real time since the last frame, times the speed', () => {
    expect(frameBattleSeconds(16, 1)).toBeCloseTo(0.016);
    expect(frameBattleSeconds(230, 1)).toBeCloseTo(0.23);
    expect(frameBattleSeconds(100, 2)).toBeCloseTo(0.2);
  });

  it('a stalled frame owes at most MAX_FRAME_S; a negative delta owes nothing', () => {
    expect(frameBattleSeconds(5000, 1)).toBe(MAX_FRAME_S);
    expect(frameBattleSeconds(-30, 1)).toBe(0);
  });

  it('the tutorial run after Fight (1.2 s of battle) goes by in a handful of 4 fps frames', () => {
    const ticks = Math.round(1.2 / DT);
    expect(framesFor(ticks, 230, (ms) => frameBattleSeconds(ms, 1))).toBeLessThanOrEqual(6);
    // Phaser's smoothed delta at that frame rate (16.7 ms a frame): the crawl CI hit
    expect(framesFor(ticks, 230, () => 1 / 60)).toBeGreaterThanOrEqual(70);
  });
});
