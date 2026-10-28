import { describe, expect, it } from 'vitest';
import { barOf, blockAt, setAllyOf } from '../../src/war/view/microRules';
import type { DrawUnit } from '../../src/war/view/simClient';
import { NEUTRAL_TEAM } from '../../src/war/sim/economy';

// micro view rules (src/war/view/microRules.ts): who shows a health bar, and the block a click in its gaps selects.

const man = (id: number, team: number, squad: number, x: number, y: number, hp = 100): DrawUnit => ({
  u: { id, squad, x, y, facing: 0, hp, maxHp: 100, cls: 'hoplite', state: hp > 0 ? 'idle' : 'dead' }, x, y, facing: 0, team,
});

describe('micro: health bars', () => {
  it('own men show green while hurt or while their squad is selected; foes red while hurt', () => {
    const none = new Set<number>(), sel = new Set([3]);
    expect(barOf(man(1, 0, 3, 0, 0), 0, none, false)).toBeNull();
    expect(barOf(man(1, 0, 3, 0, 0, 60), 0, none, false)).toBe('own');
    expect(barOf(man(1, 0, 3, 0, 0), 0, sel, false)).toBe('own');
    expect(barOf(man(2, 1, 3, 0, 0), 0, sel, false)).toBeNull(); // a foe's squad id selected means nothing
    expect(barOf(man(2, 1, 4, 0, 0, 10), 0, none, false)).toBe('foe');
    expect(barOf(man(2, 1, 4, 0, 0, 0), 0, none, true)).toBeNull(); // the fallen: none
  });

  it('Alt shows every bar; roaming folk and pact partners are yellow', () => {
    const none = new Set<number>();
    expect(barOf(man(1, 0, 3, 0, 0), 0, none, true)).toBe('own');
    expect(barOf(man(2, 2, 4, 0, 0), 0, none, true)).toBe('foe');
    expect(barOf(man(3, NEUTRAL_TEAM, 5, 0, 0, 50), 0, none, false)).toBe('ally');
    setAllyOf((t) => t === 2);
    expect(barOf(man(2, 2, 4, 0, 0), 0, none, true)).toBe('ally');
    setAllyOf(() => false);
  });
});

describe('micro: a click in a block', () => {
  const block = [man(1, 0, 7, 10, 10), man(2, 0, 7, 11, 10), man(3, 0, 7, 10, 11), man(4, 0, 7, 11, 11)];
  it('selects the block whose gaps it falls in', () => {
    expect(blockAt([...block, man(9, 1, 8, 10.5, 10.5)], 0, { x: 10.5, y: 10.5 })?.sort()).toEqual([1, 2, 3, 4]);
  });
  it('not open ground, a lone man or a foe block', () => {
    expect(blockAt(block, 0, { x: 20, y: 20 })).toBeNull();
    expect(blockAt([man(5, 0, 9, 10, 10)], 0, { x: 10.3, y: 10.3 })).toBeNull();
    expect(blockAt(block, 1, { x: 10.5, y: 10.5 })).toBeNull();
  });
});
