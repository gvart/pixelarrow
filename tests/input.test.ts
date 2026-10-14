import { describe, expect, it } from 'vitest';
import { grabAt, hitTest, tapAt, tapSelect, type HitState } from '../src/ui/input/hitTest';
import { GestureRecognizer, type GestureEvent, type PressProbe, type Ptr } from '../src/ui/input/gestures';

// ---------------------------------------------------------------- hit-test

/** Group 0 (selected) stands round (100, 200); its knob is 60 px ahead at (100, 140). Group 1 is at (200, 200); the enemy at (100, 40). */
function state(over: Partial<HitState> = {}): HitState {
  return {
    me: 0,
    sel: 0,
    grabbable: true,
    body: [
      { x: 90, y: 200 },
      { x: 110, y: 200 },
    ],
    knob: { x: 100, y: 140 },
    tags: [{ gid: 1, x: 200, y: 160 }],
    units: [
      { id: 1, side: 0, group: 0, x: 90, y: 195, big: false },
      { id: 2, side: 0, group: 0, x: 110, y: 195, big: false },
      { id: 3, side: 0, group: 1, x: 200, y: 195, big: false },
      { id: 4, side: 1, group: 2, x: 100, y: 40, big: false },
      { id: 5, side: 1, group: 3, x: 300, y: 40, big: true },
    ],
    grabR: 30,
    tagR: 20,
    unitR: 30,
    ...over,
  };
}

describe('hitTest: what a drag grabs', () => {
  it('the knob turns the group', () => {
    expect(grabAt(state(), { x: 100, y: 145 })).toBe('turn');
  });

  it('a soldier, slot or the marker of the selected group moves it', () => {
    expect(grabAt(state(), { x: 95, y: 205 })).toBe('move');
  });

  it('when both are in reach the closer one wins, a tie goes to the knob', () => {
    const s = state({ knob: { x: 100, y: 180 } });
    expect(grabAt(s, { x: 100, y: 186 })).toBe('turn');
    expect(grabAt(s, { x: 100, y: 195 })).toBe('move');
    expect(grabAt(state({ knob: { x: 100, y: 220 } }), { x: 100, y: 210 })).toBe('turn'); // equal distance
  });

  it('beyond the grab radius nothing is grabbed (a drag pans)', () => {
    expect(grabAt(state(), { x: 100, y: 100 })).toBeNull();
    expect(grabAt(state(), { x: 150, y: 200 })).toBeNull();
  });

  it('no selection that can take orders: nothing is grabbed', () => {
    expect(grabAt(state({ grabbable: false }), { x: 100, y: 140 })).toBeNull();
    expect(grabAt(state({ knob: null, body: [] }), { x: 100, y: 140 })).toBeNull();
  });

  // CT-01 changed IN-01's "the knob wins" to controls.md R1.1: another group's man under the finger
  // beats the knob (PLAY C1). The full priority is in tests/hitTest.test.ts.
  it('another group standing under the knob wins: the press selects it and never turns', () => {
    const s = state({ knob: { x: 200, y: 195 } });
    const h = hitTest(s, { x: 200, y: 196 });
    expect(h.grab).toBeNull();
    expect(h.tap).toEqual({ kind: 'own', unit: 3, group: 1 });
  });
});

describe('hitTest: what a tap means', () => {
  it('a group tag selects its group, before any man under it', () => {
    expect(tapAt(state(), { x: 205, y: 170 })).toEqual({ kind: 'tag', gid: 1 });
  });

  it('the nearest own man within reach', () => {
    expect(tapAt(state(), { x: 108, y: 195 })).toEqual({ kind: 'own', unit: 2, group: 0 });
  });

  it('an enemy man', () => {
    expect(tapAt(state(), { x: 104, y: 50 })).toEqual({ kind: 'enemy', unit: 4, group: 2 });
  });

  it('a horse is a long target: wider across, shorter up and down', () => {
    expect(tapAt(state(), { x: 300 + 40, y: 40 })).toEqual({ kind: 'enemy', unit: 5, group: 3 }); // 40 px aside: 28 < 30
    expect(tapAt(state(), { x: 300, y: 40 + 28 })).toEqual({ kind: 'ground' }); // 28 px below: 31.4 > 30
  });

  it('empty ground', () => {
    expect(tapAt(state(), { x: 300, y: 300 })).toEqual({ kind: 'ground' });
  });

  it('is pure: the same state and point give the same answer and the state is untouched', () => {
    const s = state();
    const copy = JSON.parse(JSON.stringify(s));
    expect(hitTest(s, { x: 100, y: 145 })).toEqual(hitTest(s, { x: 100, y: 145 }));
    expect(s).toEqual(copy);
  });
});

describe('tapSelect', () => {
  const whole = { group: 0, unit: -1 };
  it('another group: select it', () => {
    expect(tapSelect(whole, { id: 3, group: 1 }, false)).toEqual({ group: 1, unit: -1 });
  });
  it('a man of the selected group: pick him out (Solo)', () => {
    expect(tapSelect(whole, { id: 2, group: 0 }, false)).toEqual({ group: 0, unit: 2 });
  });
  it('the picked-out man again: back to the whole group', () => {
    expect(tapSelect({ group: 0, unit: 2 }, { id: 2, group: 0 }, false)).toEqual({ group: 0, unit: -1 });
  });
  it('a hero who fights alone: select him', () => {
    expect(tapSelect(whole, { id: 9, group: 4 }, true)).toEqual({ group: 4, unit: 9 });
  });
});

// ---------------------------------------------------------------- gestures

const P = (id: number, x: number, y: number, isDown = true): Ptr => ({ id, x, y, isDown });
const probe =
  (over: Partial<PressProbe> = {}) =>
  (): PressProbe => ({ blocked: false, grab: null, at: { x: 7, y: 8 }, ...over });
const types = (e: GestureEvent[]) => e.map((x) => x.type);

describe('gestures: one finger', () => {
  it('a press lifted in place is a tap', () => {
    const g = new GestureRecognizer(10);
    expect(types(g.down(P(1, 50, 50), [P(1, 50, 50)], 1, probe()))).toEqual(['press']);
    g.move(P(1, 54, 53), [P(1, 54, 53)], () => true); // 7 px: still a press
    expect(g.up(P(1, 54, 53, false), [])).toEqual([{ type: 'release' }, { type: 'tap', x: 54, y: 53 }]);
  });

  it('on empty ground a drag pans, from the press point on', () => {
    const g = new GestureRecognizer(10);
    g.down(P(1, 50, 50), [P(1, 50, 50)], 1, probe());
    expect(g.move(P(1, 58, 53), [], () => true)).toEqual([{ type: 'pan', dx: 8, dy: 3 }]); // 11 > 10
    expect(g.move(P(1, 60, 60), [], () => true)).toEqual([{ type: 'pan', dx: 2, dy: 7 }]);
    expect(types(g.up(P(1, 60, 60, false), []))).toEqual(['release']); // no order
  });

  it('a drag from the grabbed group is a formation drag', () => {
    const g = new GestureRecognizer(10);
    g.down(P(1, 50, 50), [P(1, 50, 50)], 1, probe({ grab: 'move' }));
    expect(g.move(P(1, 50, 62), [], () => true)).toEqual([
      { type: 'drag-start', kind: 'move', at: { x: 7, y: 8 } },
      { type: 'drag-move', x: 50, y: 62 },
    ]);
    expect(g.move(P(1, 50, 70), [], () => true)).toEqual([{ type: 'drag-move', x: 50, y: 70 }]);
    expect(types(g.up(P(1, 50, 70, false), []))).toEqual(['release', 'drag-end']);
  });

  it('the knob is a turn drag', () => {
    const g = new GestureRecognizer(10);
    g.down(P(1, 50, 50), [P(1, 50, 50)], 1, probe({ grab: 'turn' }));
    expect(g.move(P(1, 70, 50), [], () => true)[0]).toMatchObject({ type: 'drag-start', kind: 'turn' });
  });

  it('a grabbed group that can no longer take orders pans instead', () => {
    const g = new GestureRecognizer(10);
    g.down(P(1, 50, 50), [P(1, 50, 50)], 1, probe({ grab: 'move' }));
    expect(types(g.move(P(1, 50, 70), [], () => false))).toEqual(['pan']);
  });

  it('a press on a HUD control is not a field gesture', () => {
    const g = new GestureRecognizer(10);
    expect(g.down(P(1, 50, 50), [P(1, 50, 50)], 1, probe({ blocked: true }))).toEqual([]);
    expect(g.move(P(1, 50, 90), [], () => true)).toEqual([]);
    expect(types(g.up(P(1, 50, 90, false), []))).toEqual(['release']);
  });

  it('a long press becomes info, and its lift does nothing', () => {
    const g = new GestureRecognizer(10);
    const press = (g.down(P(1, 50, 50), [P(1, 50, 50)], 1, probe())[0] as { press: Parameters<GestureRecognizer['hold']>[0] }).press;
    expect(g.hold(press)).toBe(true);
    expect(g.move(P(1, 70, 70), [], () => true)).toEqual([]);
    expect(types(g.up(P(1, 70, 70, false), []))).toEqual(['release']);
  });

  it('a long press that already moved does not fire', () => {
    const g = new GestureRecognizer(10);
    const press = (g.down(P(1, 50, 50), [P(1, 50, 50)], 1, probe())[0] as { press: Parameters<GestureRecognizer['hold']>[0] }).press;
    g.move(P(1, 80, 50), [], () => true);
    expect(g.hold(press)).toBe(false);
  });

  it('events of another finger are ignored', () => {
    const g = new GestureRecognizer(10);
    g.down(P(1, 50, 50), [P(1, 50, 50)], 1, probe());
    expect(g.move(P(2, 90, 90), [], () => true)).toEqual([]);
    expect(types(g.up(P(2, 90, 90, false), []))).toEqual(['release']);
  });
});

describe('gestures: two fingers', () => {
  it('a second finger cancels a half-done formation drag: no order on lift', () => {
    const g = new GestureRecognizer(10);
    g.down(P(1, 50, 50), [P(1, 50, 50)], 1, probe({ grab: 'move' }));
    g.move(P(1, 50, 80), [], () => true);
    expect(g.down(P(2, 150, 80), [P(1, 50, 80), P(2, 150, 80)], 2, probe())).toEqual([{ type: 'pinch-start' }]);
    expect(g.up(P(2, 150, 80, false), [P(1, 50, 80)])).toEqual([{ type: 'pinch-end', z0: 2 }]);
    expect(types(g.up(P(1, 50, 80, false), []))).toEqual(['release']); // no drag-end
  });

  it('pinch zooms by the finger spread and pans by the midpoint', () => {
    const g = new GestureRecognizer(10);
    g.down(P(1, 100, 100), [P(1, 100, 100)], 2, probe());
    g.down(P(2, 200, 100), [P(1, 100, 100), P(2, 200, 100)], 2, probe());
    expect(g.move(P(2, 300, 110), [P(1, 100, 110), P(2, 300, 110)], () => true)).toEqual([{ type: 'pinch', zoom: 4, dx: 50, dy: 10 }]);
    expect(g.move(P(2, 300, 120), [P(1, 100, 120), P(2, 300, 120)], () => true)).toEqual([{ type: 'pinch', zoom: 4, dx: 0, dy: 10 }]);
  });

  it('two fingers never order, even when the first one grabbed a group', () => {
    const g = new GestureRecognizer(10);
    g.down(P(1, 50, 50), [P(1, 50, 50)], 1, probe({ grab: 'turn' }));
    g.down(P(2, 90, 50), [P(1, 50, 50), P(2, 90, 50)], 1, probe());
    const all = [...g.move(P(1, 10, 90), [P(1, 10, 90), P(2, 90, 50)], () => true), ...g.up(P(1, 10, 90, false), [P(2, 90, 50)]), ...g.up(P(2, 90, 50, false), [])];
    expect(all.some((e) => e.type === 'drag-start' || e.type === 'drag-end' || e.type === 'tap')).toBe(false);
  });
});

// ---------------------------------------------------------------- mouse buttons (ADR-0012 Decision 5, input-v6.md §2.2)

/** A mouse pointer with `button` (0 left, 1 middle, 2 right). */
const M = (button: number, x: number, y: number, isDown = true): Ptr => ({ id: 0, x, y, isDown, button, wasTouch: false });
/** Screen px to field: 10 px a pace, so facings read off the screen directly. */
const field = (x: number, y: number) => ({ x: x / 10, y: y / 10 });

describe('gestures: the right button orders', () => {
  it('a right click is an order click at the cursor, never a tap', () => {
    const g = new GestureRecognizer(10, field);
    expect(g.down(M(2, 50, 50), [M(2, 50, 50)], 1, probe())).toEqual([]);
    expect(g.move(M(2, 54, 53), [M(2, 54, 53)], () => true)).toEqual([]); // 7 px: still a click
    expect(g.up(M(2, 54, 53, false), [])).toEqual([{ type: 'release' }, { type: 'order-click', x: 54, y: 53 }]);
  });

  it('a right press on a HUD control is not a field order', () => {
    const g = new GestureRecognizer(10, field);
    g.down(M(2, 50, 50), [M(2, 50, 50)], 1, probe({ blocked: true }));
    expect(g.move(M(2, 90, 50), [], () => true)).toEqual([]);
    expect(g.up(M(2, 90, 50, false), [])).toEqual([]);
  });

  it('a right-drag sets the ghost at the press point and faces from it toward the cursor', () => {
    const g = new GestureRecognizer(10, field);
    g.down(M(2, 100, 100), [M(2, 100, 100)], 1, probe());
    const evs = g.move(M(2, 100, 140), [], () => true);
    expect(evs[0]).toEqual({ type: 'order-drag-start', at: { x: 10, y: 10 } });
    expect(evs[1]).toMatchObject({ type: 'order-drag-move', at: { x: 10, y: 10 }, fx: 0, fy: 1, snapped: true });
    expect(g.active()).toBe('order');
    expect(g.up(M(2, 100, 140, false), [])).toEqual([{ type: 'release' }, { type: 'order-drag-end', at: { x: 10, y: 10 }, fx: 0, fy: 1 }]);
    expect(g.active()).toBeNull();
  });

  it('the facing snaps to the eight directions within 8°, and is free beyond', () => {
    const drag = (dx: number, dy: number) => {
      const g = new GestureRecognizer(10, field);
      g.down(M(2, 0, 0), [M(2, 0, 0)], 1, probe());
      g.move(M(2, dx, dy), [], () => true);
      return g.up(M(2, dx, dy, false), [])[1] as Extract<GestureEvent, { type: 'order-drag-end' }>;
    };
    const deg = (d: number): [number, number] => [Math.cos((d * Math.PI) / 180) * 100, Math.sin((d * Math.PI) / 180) * 100];
    // 7° off east snaps to east; 7° off the south-east diagonal snaps to it
    expect(drag(...deg(7))).toMatchObject({ fx: 1, fy: 0 });
    const se = drag(...deg(45 - 7));
    expect(se.fx).toBeCloseTo(Math.SQRT1_2, 9);
    expect(se.fy).toBeCloseTo(Math.SQRT1_2, 9);
    // 9° off east is not snapped: the facing points at the cursor
    const free = drag(...deg(9));
    expect(free.fx).toBeCloseTo(Math.cos((9 * Math.PI) / 180), 9);
    expect(free.fy).toBeCloseTo(Math.sin((9 * Math.PI) / 180), 9);
  });

  it('a right-drag under the drag threshold is a plain right click', () => {
    const g = new GestureRecognizer(10, field);
    g.down(M(2, 50, 50), [M(2, 50, 50)], 1, probe());
    g.move(M(2, 55, 55), [], () => true); // exactly 10: not over it
    expect(g.up(M(2, 55, 55, false), [])).toEqual([{ type: 'release' }, { type: 'order-click', x: 55, y: 55 }]);
  });

  it('Esc during a right-drag cancels it: nothing is sent', () => {
    const g = new GestureRecognizer(10, field);
    g.down(M(2, 50, 50), [M(2, 50, 50)], 1, probe());
    g.move(M(2, 50, 90), [], () => true);
    expect(g.cancelOrder()).toEqual([{ type: 'order-cancel' }]);
    expect(g.move(M(2, 50, 120), [], () => true)).toEqual([]);
    expect(g.up(M(2, 50, 120, false), [])).toEqual([]); // no order
    expect(g.cancelOrder()).toEqual([]); // nothing to cancel any more: Esc is free for its menu
  });

  it('a left press during a right-drag cancels it, and that left press does nothing else', () => {
    const g = new GestureRecognizer(10, field);
    g.down(M(2, 50, 50), [M(2, 50, 50)], 1, probe());
    g.move(M(2, 50, 90), [], () => true);
    expect(g.down(M(0, 50, 90), [M(0, 50, 90)], 1, probe())).toEqual([{ type: 'order-cancel' }]);
    expect(types(g.up(M(0, 50, 90), []))).toEqual(['release']); // no tap
    expect(g.up(M(2, 50, 90, false), [])).toEqual([]); // no order
  });

  it('a right click while the left button holds a drag leaves that drag alone', () => {
    const g = new GestureRecognizer(10, field);
    g.down(M(0, 50, 50), [M(0, 50, 50)], 1, probe({ grab: 'move' }));
    g.move(M(0, 50, 80), [], () => true);
    expect(g.down(M(2, 50, 80), [M(2, 50, 80)], 1, probe())).toEqual([]);
    expect(g.up(M(2, 50, 80), [])).toEqual([]);
    expect(g.active()).toBe('move');
    expect(types(g.up(M(0, 50, 80, false), []))).toEqual(['release', 'drag-end']);
  });

  it('a finger is always the left button, whatever the event says', () => {
    const g = new GestureRecognizer(10, field);
    const f: Ptr = { id: 1, x: 50, y: 50, isDown: true, button: 2, wasTouch: true };
    expect(types(g.down(f, [f], 1, probe()))).toEqual(['press']);
    expect(types(g.up({ ...f, isDown: false }, []))).toEqual(['release', 'tap']);
  });
});

describe('gestures: the middle button pans', () => {
  it('a middle drag pans 1:1 from the first move, and never orders', () => {
    const g = new GestureRecognizer(10, field);
    expect(g.down(M(1, 50, 50), [M(1, 50, 50)], 1, probe({ grab: 'move' }))).toEqual([]);
    expect(g.move(M(1, 53, 51), [], () => true)).toEqual([{ type: 'pan', dx: 3, dy: 1 }]);
    expect(g.active()).toBe('pan');
    expect(g.move(M(1, 60, 60), [], () => true)).toEqual([{ type: 'pan', dx: 7, dy: 9 }]);
    expect(types(g.up(M(1, 60, 60, false), []))).toEqual(['release']);
    expect(g.active()).toBeNull();
  });

  it('a middle press over the HUD does nothing', () => {
    const g = new GestureRecognizer(10, field);
    g.down(M(1, 50, 50), [M(1, 50, 50)], 1, probe({ blocked: true }));
    expect(g.move(M(1, 70, 50), [], () => true)).toEqual([]);
  });
});
