/**
 * FL-01: juice tiers (design/gdd/battle-readability.md R4, F1; A11Y-13).
 * The feel state is pure presentation: hit-stop never holds the sim tick,
 * Reduce shake keeps the offset at 0, Reduce flash removes flash rings, the
 * tiers scale with the event, and a pause or a fast speed never strobes.
 */
import { describe, expect, it, vi } from 'vitest';
import sceneSrc from '../src/scenes/BattleScene.ts?raw';
import { Battle, TICK_RATE } from '../src/sim/battle';
import { drainLogged } from '../src/game/report';
import { standardSetup } from './helpers';

// battleFx draws with Phaser; the rules tested here are pure. Phaser itself needs a browser.
vi.mock('phaser', () => {
  class C {}
  return { default: { GameObjects: { Container: C, Image: C, Text: C, Graphics: C, BitmapText: C, Layer: C }, Scene: C, Textures: { FilterMode: {} } } };
});
const { FLASH_GAP_MS, HITSTOP_GAP_MS, JUICE_TIERS, Juice, MAX_OFFSET, valueNoise } = await import('../src/ui/battleFx');
const { motion, fadeIn, ENTRY_ALPHA, flashReduced, shakeReduced } = await import('../src/ui/motion');

const code = sceneSrc.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

/** Run a battle as the scene does (frames of `frameMs`, the accumulator at `speed`), feeding `juice` its events if given. */
function play(seed: number, juice: InstanceType<typeof Juice> | null, frames: number, frameMs = 16, speed = 1): { tick: number; hash: string; stops: number } {
  const b = new Battle(standardSetup(seed, true).setup);
  b.startBattle();
  const DT = 1 / TICK_RATE;
  let acc = 0;
  let stops = 0;
  for (let f = 0; f < frames && b.phase === 'battle'; f++) {
    acc += Math.min(0.25, frameMs / 1000) * speed;
    while (acc >= DT && b.phase === 'battle') {
      b.step();
      for (const e of drainLogged(b)) {
        if (!juice) continue;
        if (e.type === 'impact') juice.hit('impact', [b.units[e.unit].group, b.units[e.by].group]);
        else if (e.type === 'rout') juice.hit('rout');
        else if (e.type === 'armyBreak') juice.hit('armyBreak');
      }
      acc -= DT;
    }
    juice?.frame(frameMs, true);
    if (juice && b.groups.some((g) => juice.frozen(g.id))) stops++;
  }
  return { tick: b.tick, hash: b.hash(), stops };
}

describe('hit-stop never pauses the sim tick (AC 1)', () => {
  it('the tick count and the state with hit-stops equal those without', () => {
    const juice = new Juice();
    const withJuice = play(41, juice, 60 * 40);
    const without = play(41, null, 60 * 40);
    // the run had real hit-stops, and the sim did not notice them
    expect(withJuice.stops).toBeGreaterThan(0);
    expect(withJuice.tick).toBe(without.tick);
    expect(withJuice.hash).toBe(without.hash);
  }, 30_000);

  it('the scene steps the sim on its own clock: nothing of the juice gates the step loop', () => {
    const loop = code.slice(code.indexOf('this.acc += '), code.indexOf('this.fireThen();'));
    expect(loop).toContain('this.sim.step()');
    expect(loop).not.toMatch(/juice|frozen|timeScale/);
    expect(code).not.toMatch(/time\.timeScale|tweens\.timeScale/);
  });
});

describe('Reduce shake and Reduce flash (AC 2, A11Y-13)', () => {
  it('with Reduce shake the offset is always 0, whatever lands', () => {
    const j = new Juice();
    j.shakeOff = true;
    for (let f = 0; f < 200; f++) {
      if (f % 7 === 0) j.hit('armyBreak');
      if (f % 3 === 0) j.hit('rout');
      j.hit('impact', [1, 2]);
      j.frame(16, true);
      expect(j.offset()).toEqual({ x: 0, y: 0 });
    }
  });

  it('Reduce shake keeps the hit-stop (it is not motion, A11Y-12)', () => {
    const j = new Juice();
    j.shakeOff = true;
    j.frame(1000, true);
    j.hit('impact', [3, 4]);
    expect(j.frozen(3)).toBe(true);
    expect(j.frozen(4)).toBe(true);
    expect(j.frozen(5)).toBe(false);
  });

  it('with Reduce flash no flash ring is allowed', () => {
    const j = new Juice();
    j.flashOff = true;
    for (let f = 0; f < 100; f++) {
      expect(j.flash()).toBe(false);
      j.frame(50, true);
    }
  });

  it('both default to Reduce motion, and an explicit choice wins', () => {
    const was = motion.reduced;
    motion.reduced = true;
    expect(shakeReduced({})).toBe(true);
    expect(flashReduced({})).toBe(true);
    expect(shakeReduced({ reduceShake: false })).toBe(false);
    motion.reduced = false;
    expect(shakeReduced({})).toBe(false);
    expect(flashReduced({ reduceFlash: true })).toBe(true);
    motion.reduced = was;
  });
});

describe('the tiers scale with the event (AC 3, R4)', () => {
  it('a kill < an ability < a charge impact < a rout < an army break', () => {
    const order = ['kill', 'ability', 'impact', 'rout', 'armyBreak'] as const;
    for (let i = 1; i < order.length; i++) expect(Juice.peak(order[i])).toBeGreaterThan(Juice.peak(order[i - 1]));
  });

  it('only impacts, abilities and the big field events shake: a kill does not', () => {
    const j = new Juice();
    expect(j.hit('kill', [1])).toBe(false);
    j.frame(16, true);
    expect(j.offset()).toEqual({ x: 0, y: 0 });
    expect(JUICE_TIERS.kill.trauma).toBe(0);
  });

  it('a rout and an army break together stay under the F1 maximum', () => {
    const j = new Juice();
    j.hit('rout');
    j.hit('armyBreak');
    expect(j.trauma).toBeCloseTo(0.9);
    for (let f = 0; f < 100; f++) {
      j.frame(16, true);
      const o = j.offset();
      expect(Math.abs(o.x)).toBeLessThanOrEqual(MAX_OFFSET);
      expect(Math.abs(o.y)).toBeLessThanOrEqual(MAX_OFFSET);
    }
  });

  it('a 20-man charge is one impact, not twenty', () => {
    const j = new Juice();
    for (let i = 0; i < 20; i++) j.hit('impact', [1, 2]);
    expect(j.trauma).toBeCloseTo(JUICE_TIERS.impact.trauma);
  });

  it('the shake decays back to rest (F1: 1.5 a second)', () => {
    const j = new Juice();
    j.hit('rout');
    j.frame(100, true);
    expect(j.trauma).toBeCloseTo(0.25);
    for (let f = 0; f < 20; f++) j.frame(16, true);
    expect(j.trauma).toBe(0);
    expect(j.offset()).toEqual({ x: 0, y: 0 });
  });

  it('the noise is smooth and bounded, not a per-frame buzz', () => {
    let prev = valueNoise(0, 7);
    for (let t = 0.01; t < 20; t += 0.01) {
      const v = valueNoise(t, 7);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
      expect(Math.abs(v - prev)).toBeLessThan(0.1);
      prev = v;
    }
  });
});

describe('pause and speed (director: no effect while paused, no strobe at 4×)', () => {
  it('paused, the offset is 0 and nothing decays or ends; play resumes it', () => {
    const j = new Juice();
    j.frame(1000, true);
    j.hit('rout');
    j.hit('impact', [1, 2]);
    j.frame(16, false);
    expect(j.offset()).toEqual({ x: 0, y: 0 });
    const tr = j.trauma;
    for (let f = 0; f < 100; f++) j.frame(16, false);
    expect(j.trauma).toBe(tr);
    expect(j.frozen(1)).toBe(true);
    j.frame(16, true);
    expect(j.offset()).not.toEqual({ x: 0, y: 0 });
  });

  it('at 4× a hit-stop is a quarter as long, and stops start at most every HITSTOP_GAP_MS', () => {
    const j = new Juice();
    j.speed = 4;
    j.frame(1000, true);
    j.hit('impact', [1, 2]);
    j.frame(JUICE_TIERS.impact.stopMs / 4 + 1, true);
    expect(j.frozen(1)).toBe(false);
    let starts = 0;
    let was = false;
    for (let f = 0; f < 600; f++) {
      j.hit('impact', [1, 2]);
      const now = j.frozen(1);
      if (now && !was) starts++;
      was = now;
      j.frame(10, true);
    }
    expect(starts).toBeLessThanOrEqual(Math.ceil(6000 / HITSTOP_GAP_MS));
  });

  it('a fast fight never flashes more than 3 times a second (WCAG 2.3.1)', () => {
    const j = new Juice();
    j.speed = 4;
    let rings = 0;
    for (let f = 0; f < 100; f++) {
      if (j.flash()) rings++;
      j.frame(10, true);
    }
    expect(rings).toBeLessThanOrEqual(3);
    expect(FLASH_GAP_MS).toBeGreaterThanOrEqual(1000 / 3);
  });

  it('a shake lasts the same real time at 1× and 4× (decay is real time)', () => {
    const a = new Juice();
    const b = new Juice();
    b.speed = 4;
    a.hit('rout');
    b.hit('rout');
    a.frame(160, true);
    b.frame(160, true);
    expect(b.trauma).toBe(a.trauma);
  });
});

describe('V5-067: a page fading in still takes taps', () => {
  it('fadeIn starts above alpha 0, where Phaser skips input', () => {
    expect(ENTRY_ALPHA).toBeGreaterThan(0);
    const was = motion.reduced;
    motion.reduced = false;
    const target = { alpha: 1 };
    const scene = { tweens: { add: () => null } } as unknown as Parameters<typeof fadeIn>[0];
    fadeIn(scene, target);
    expect(target.alpha).toBe(ENTRY_ALPHA);
    motion.reduced = was;
  });
});
