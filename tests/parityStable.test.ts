/**
 * PARITY-STABLE (V6-076, FLAKY F8): element-parity compares like with like. A control that is transient by
 * design (`uiTransient`, e.g. the battle Undo chip, shown for 3 s after an order) is left out of parity while
 * its registration holds; a truly removed element still fails.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => {
  class C {}
  return { default: { GameObjects: { Container: C, Image: C, Text: C, Graphics: C, Rectangle: C, Zone: C, BitmapText: C, Sprite: C }, Scene: C, Loader: { Events: {} }, Geom: { Rectangle: C }, Math: { Clamp: (v: number) => v } } };
});
const { uiTransient, transientIds } = await import('../src/ui/layout');
// @ts-expect-error plain .mjs module without types
const { checkParity } = await import('../scripts/lib/layoutMatrix.mjs');

type Scene = Parameters<typeof uiTransient>[0];
const scene = () => ({}) as unknown as Scene;
const missing = (v: { ids: string[] }[]) => v.map((x) => x.ids[0]);

/** The fight's HUD at 390x844 (Undo still in its 3 s window) and at 320x693 (the window ran out first). */
const fightBase = ['battle.menu', 'battle.pause', 'battle.undo', 'battle.then'];
const fightHere = new Set(['battle.menu', 'battle.pause']);

describe('uiTransient', () => {
  it('lists an id while its condition holds, and not after', () => {
    const s = scene();
    let fight = true;
    uiTransient(s, 'battle.undo', () => fight);
    uiTransient(s, 'battle.then');
    expect(transientIds(s)).toEqual(['battle.undo', 'battle.then']);
    fight = false;
    expect(transientIds(s)).toEqual(['battle.then']);
  });

  it('a scene without registrations has none', () => {
    expect(transientIds(scene())).toEqual([]);
  });
});

describe('element-parity with transient controls', () => {
  it('battle.undo shown at one size and timed out at another is not a finding (F8, RSCR-02)', () => {
    expect(checkParity(fightBase, fightHere, {}, ['battle.undo', 'battle.then'])).toEqual([]);
  });

  it('it holds whichever size registered it', () => {
    const s = scene();
    uiTransient(s, 'battle.undo');
    uiTransient(s, 'battle.then');
    expect(checkParity(fightBase, fightHere, {}, transientIds(s))).toEqual([]);
  });

  it('without the registration the same capture still fails', () => {
    expect(missing(checkParity(fightBase, fightHere, {}))).toEqual(['battle.undo', 'battle.then']);
  });

  it('in deployment Undo is always there: its registration does not hold, so a dropped Undo fails', () => {
    const s = scene();
    const phase: string = 'deploy';
    uiTransient(s, 'battle.undo', () => phase === 'battle');
    expect(missing(checkParity(['battle.fight', 'battle.undo'], new Set(['battle.fight']), {}, transientIds(s)))).toEqual(['battle.undo']);
  });

  it('a truly removed element still fails beside transient ones', () => {
    const here = new Set(['battle.menu']); // battle.pause is gone at this size
    expect(missing(checkParity(fightBase, here, {}, ['battle.undo', 'battle.then']))).toEqual(['battle.pause']);
  });

  it('a transient id does not excuse a collapsed element whose control is gone', () => {
    expect(missing(checkParity(['a', 'b'], new Set(['a']), { b: 'menu' }, ['battle.undo']))).toEqual(['b']);
  });
});
