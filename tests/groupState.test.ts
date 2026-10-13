/**
 * RD-01: the morale glyph and the group card readout (design/gdd/battle-readability.md
 * R1-R3, F2). groupState() is pure: steady, wavering when at least a third of the
 * group's non-routing men are below half their morale, routing on the routed flag or
 * the army's break; beasts get none. groupReadout() adds the badge markers (the
 * Standard, the captain's crest, disordered) and the card's "Flanked!" window from a
 * real sim. The bar labels read "HP" / "MOR" the first 3 battles, then "H" / "M".
 */
import { describe, expect, it, vi } from 'vitest';
import { armySpec } from '../src/game/armySpec';
import { classSquad } from '../src/dev/classBalance';
import { Battle, TICK_RATE } from '../src/sim/battle';
import { Rng } from '../src/sim/rng';
import { VECTOR_GLYPHS } from '../src/art/vectorIcons';
import { MOSAIC, contrast } from '../src/ui/tokens';
import type { ClassId } from '../src/data/classes';
import type { BattleSetup, SimUnit, UnitState } from '../src/sim/types';

// battleHud.ts draws with Phaser; its HUD rules are pure. Phaser itself needs a browser.
vi.mock('phaser', () => {
  class C {}
  return { default: { GameObjects: { Container: C, Image: C, Text: C, Graphics: C, Rectangle: C }, Scene: C } };
});
const { BAR_LABEL_SEEN, FLANK_CARD_S, MORALE_GLYPH, MORALE_TINT, barLabels, groupReadout, groupState } = await import('../src/ui/battleHud');

/** A man with `m` of 100 morale. */
function man(m: number, state: UnitState = 'ready', extra: { kind?: 'animal'; boss?: string } = {}): Pick<SimUnit, 'state' | 'morale' | 'stats'> {
  return { state, morale: m, stats: { morale: 100, ...extra } as SimUnit['stats'] };
}

describe('groupState (R1, F2)', () => {
  it('a fresh group is steady', () => {
    expect(groupState(false, [man(100), man(90), man(60)])).toBe('steady');
  });

  it('wavering from a third of the non-routing men below 50% (6 men: 2 shaken)', () => {
    const six = (shaken: number) => Array.from({ length: 6 }, (_, i) => man(i < shaken ? 49 : 80));
    expect(groupState(false, six(1))).toBe('steady');
    expect(groupState(false, six(2))).toBe('wavering');
    expect(groupState(false, six(6))).toBe('wavering');
  });

  it('exactly half is not below half: 50 of 100 stays steady', () => {
    expect(groupState(false, [man(50), man(50), man(50)])).toBe('steady');
  });

  it('routing men leave the count: 4 standing, 1 shaken stays steady; 2 shaken of 4 wavers', () => {
    const fled = [man(5, 'routing'), man(5, 'routing')];
    expect(groupState(false, [...fled, man(40), man(90), man(90), man(90)])).toBe('steady');
    expect(groupState(false, [...fled, man(40), man(40), man(90), man(90)])).toBe('wavering');
  });

  it('the dead do not count', () => {
    expect(groupState(false, [man(0, 'dead'), man(0, 'dead'), man(90), man(90), man(90)])).toBe('steady');
  });

  it('a group of one man wavers below 50%', () => {
    expect(groupState(false, [man(51)])).toBe('steady');
    expect(groupState(false, [man(49)])).toBe('wavering');
  });

  it('the routed flag means routing, whatever the morale', () => {
    expect(groupState(true, [man(100), man(100)])).toBe('routing');
  });

  it('a broken army shows routing on every badge', () => {
    expect(groupState(false, [man(100), man(100)], true)).toBe('routing');
  });

  it('beasts get no glyph (they have their own HP and state UI)', () => {
    expect(groupState(false, [man(10, 'ready', { kind: 'animal' })])).toBeNull();
    expect(groupState(false, [man(10, 'ready', { boss: 'hydra' })])).toBeNull();
  });

  it('a group with nobody left has no glyph', () => {
    expect(groupState(false, [])).toBeNull();
    expect(groupState(false, [man(0, 'dead'), man(0, 'fled')])).toBeNull();
  });
});

describe('the glyphs are shapes, not colours (A11Y-04)', () => {
  it('each state has its own vector glyph, never an atlas frame', () => {
    const names = Object.values(MORALE_GLYPH);
    expect(new Set(names).size).toBe(3);
    for (const n of names) expect(VECTOR_GLYPHS).toContain(n);
    // the captain's crest and the Standard are code-drawn too (V5-066)
    expect(VECTOR_GLYPHS).toEqual(expect.arrayContaining(['marker_crest', 'marker_standard', 'marker_disordered']));
  });

  it('wavering and routing tints reach 3:1 on the card parchment and the badge stone (A11Y-02)', () => {
    for (const s of ['wavering', 'routing'] as const) {
      expect(contrast(MORALE_TINT[s], MOSAIC.stone1)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('bar labels (R3: HP / MOR the first 3 times, then H / M)', () => {
  it('long words while seen <= BAR_LABEL_SEEN, then one letter', () => {
    expect(BAR_LABEL_SEEN).toBe(3);
    expect(barLabels(1).long).toBe(true);
    expect(barLabels(3).long).toBe(true);
    expect(barLabels(4).long).toBe(false);
    expect(barLabels(4).hp).not.toBe(barLabels(1).hp);
    expect(barLabels(4).hp.length).toBe(1);
    expect(barLabels(4).mor.length).toBe(1);
  });
});

/** Two human sides; each entry is [class, count, group]. Side 0 has groups 0..3, side 1 has 4..7. */
function battle(seed = 5): Battle {
  const rng = new Rng(seed);
  const ids = { nextId: 1 };
  const side = (spec: [ClassId, number, number][]) => armySpec(spec.flatMap(([c, n, g]) => classSquad(rng, ids, c, n, 3, g)), false);
  const setup: BattleSetup = { seed, armies: [side([['hoplite', 6, 0], ['hoplite', 4, 1]]), side([['hoplite', 6, 0]])] };
  // unit 0 carries side 0's standard
  setup.armies[0].units[0].stats.standard = true;
  return new Battle(setup);
}

describe('groupReadout (R2 badges, R3 card state line)', () => {
  it('the Standard marks the bearer group only, and goes when he falls', () => {
    const b = battle();
    const bearer = b.standardBearer(0)!;
    expect(bearer).toBeTruthy();
    const other = b.groups.find((g) => g.side === 0 && g.id !== bearer.group && b.members(g.id).length)!;
    expect(groupReadout(b, bearer.group).standard).toBe(true);
    expect(groupReadout(b, other.id).standard).toBe(false);
    // no captain flag: a plain bearer has no crest
    expect(groupReadout(b, bearer.group).captain).toBe(false);
    expect(groupReadout(b, bearer.group, (u) => u.id === bearer.id).captain).toBe(true);
    b.startBattle();
    bearer.hp = 0;
    bearer.state = 'dead';
    b.step();
    expect(b.standardBearer(0)).toBeNull();
    expect(groupReadout(b, bearer.group).standard).toBe(false);
  });

  it(`"Flanked!" for ${2} s after a flanked event, then gone`, () => {
    expect(FLANK_CARD_S).toBe(2);
    const b = battle();
    b.startBattle();
    const g = b.groups.find((x) => x.side === 0)!;
    expect(groupReadout(b, g.id).flanked).toBe(false);
    g.lastFlankEvent = b.tick;
    expect(groupReadout(b, g.id).flanked).toBe(true);
    for (let i = 0; i < FLANK_CARD_S * TICK_RATE; i++) b.step();
    expect(groupReadout(b, g.id).flanked).toBe(false);
  });

  it('reads the state from the sim: a shaken group wavers, a routed one routs', () => {
    const b = battle();
    const g = b.groups.find((x) => x.side === 0 && b.members(x.id).length >= 3)!;
    expect(groupReadout(b, g.id).state).toBe('steady');
    for (const u of b.members(g.id)) u.morale = u.stats.morale * 0.3;
    expect(groupReadout(b, g.id).state).toBe('wavering');
    g.routed = true;
    expect(groupReadout(b, g.id).state).toBe('routing');
  });
});
