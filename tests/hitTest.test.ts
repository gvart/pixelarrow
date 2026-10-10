/**
 * CT-01: the press hit-test priority of controls.md R1.1 (PLAY C1).
 * A press over a soldier of another own group selects that group, even inside
 * the selected group's knob radius; the knob still turns from its outer edge.
 */
import { describe, expect, it } from 'vitest';
import { hitTest, type HitState } from '../src/ui/input/hitTest';

/**
 * Group 0 is selected; its knob stands at (200, 140), right on top of a man of
 * group 1 at (200, 146). An enemy (group 2) stands at (300, 140).
 */
function field(over: Partial<HitState> = {}): HitState {
  return {
    me: 0,
    sel: 0,
    grabbable: true,
    body: [
      { x: 100, y: 200 },
      { x: 120, y: 200 },
    ],
    knob: { x: 200, y: 140 },
    tags: [],
    units: [
      { id: 1, side: 0, group: 0, x: 100, y: 195, big: false },
      { id: 2, side: 0, group: 0, x: 120, y: 195, big: false },
      { id: 3, side: 0, group: 1, x: 200, y: 146, big: false },
      { id: 4, side: 1, group: 2, x: 300, y: 140, big: false },
    ],
    grabR: 60,
    tagR: 40,
    unitR: 44,
    ...over,
  };
}

describe('hit-test priority (controls.md R1.1)', () => {
  it('a press over a non-selected soldier inside the knob radius selects his group: no turn', () => {
    const h = hitTest(field(), { x: 201, y: 145 });
    expect(h.grab).toBeNull(); // a drag from here pans, it never turns group 0
    expect(h.tap).toEqual({ kind: 'own', unit: 3, group: 1 });
  });

  it('the soldier wins over the knob even when the knob is nearer the finger', () => {
    // 2 px from the knob, 4 px from the man: still the man (his sprite is under the finger)
    const h = hitTest(field(), { x: 200, y: 142 });
    expect(h.grab).toBeNull();
    expect(h.tap).toMatchObject({ kind: 'own', group: 1 });
  });

  it('the knob still turns from its outer edge, beyond the soldier', () => {
    // 50 px above the knob: inside the 60 px grab radius, outside the man's 44 px reach
    const h = hitTest(field(), { x: 200, y: 90 });
    expect(h.grab).toBe('turn');
    expect(h.tap).toEqual({ kind: 'ground' });
  });

  it('with nobody under it the knob turns, as before', () => {
    const h = hitTest(field({ units: field().units.filter((u) => u.group !== 1) }), { x: 201, y: 145 });
    expect(h.grab).toBe('turn');
  });

  it('an enemy under the knob does not take it (targets rank below the knob)', () => {
    const h = hitTest(field({ knob: { x: 300, y: 140 } }), { x: 300, y: 142 });
    expect(h.grab).toBe('turn');
    expect(h.tap).toMatchObject({ kind: 'enemy', group: 2 });
  });

  it("the selected group's own man under the finger still moves it", () => {
    expect(hitTest(field(), { x: 101, y: 198 }).grab).toBe('move');
  });

  it('overlapping groups: the man nearest the finger decides', () => {
    // a man of group 1 stands 12 px right of group 0's man 2
    const units = [...field().units, { id: 5, side: 0, group: 1, x: 132, y: 195, big: false }];
    expect(hitTest(field({ units }), { x: 122, y: 196 })).toMatchObject({ grab: 'move', tap: { kind: 'own', unit: 2, group: 0 } });
    expect(hitTest(field({ units }), { x: 131, y: 196 })).toMatchObject({ grab: null, tap: { kind: 'own', unit: 5, group: 1 } });
  });

  it("in Solo, another man of the selected group is not another group: the knob turns", () => {
    const units = [...field().units.filter((u) => u.id !== 3), { id: 3, side: 0, group: 0, x: 200, y: 146, big: false }];
    expect(hitTest(field({ units }), { x: 201, y: 145 }).grab).toBe('turn');
  });
});
