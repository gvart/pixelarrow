import { describe, expect, it } from 'vitest';
import { CURSOR_CSS, cursorFor, type CursorState } from '../src/ui/input/cursor';
import { cursorUpdate } from '../src/ui/input/cursorApply';

const s = (over: Partial<CursorState> = {}): CursorState => ({ hit: 'none', drag: null, disabled: false, busy: false, ...over });

describe('cursorFor: the cursor states of input-v6.md §2.4', () => {
  const table: [string, Partial<CursorState>, string][] = [
    ['anywhere else', {}, 'default'],
    ['ground', { hit: 'none' }, 'default'],
    ['an enabled control', { hit: 'control' }, 'pointer'],
    ['a disabled control', { hit: 'control', disabled: true }, 'not-allowed'],
    ['the selected group body', { hit: 'body' }, 'grab'],
    ['the knob', { hit: 'knob' }, 'turn'],
    ['an enemy, with a group selected', { hit: 'enemy' }, 'target'],
    ['a move drag', { drag: 'move', hit: 'body' }, 'grabbing'],
    ['a turn drag', { drag: 'turn' }, 'turn'],
    ['a pan (left on ground, or middle)', { drag: 'pan', hit: 'enemy' }, 'pan'],
    ['busy over a control', { busy: true, hit: 'control' }, 'wait'],
    ['busy during a drag', { busy: true, drag: 'move' }, 'wait'],
  ];
  for (const [what, st, want] of table) it(`${what}: ${want}`, () => expect(cursorFor(s(st))).toBe(want));

  it('a drag wins over what is under the cursor', () => {
    expect(cursorFor(s({ drag: 'turn', hit: 'control' }))).toBe('turn');
  });

  it('every kind has a CSS keyword fallback', () => {
    expect(CURSOR_CSS).toEqual({
      default: 'default',
      pointer: 'pointer',
      'not-allowed': 'not-allowed',
      grab: 'grab',
      grabbing: 'grabbing',
      turn: 'alias',
      target: 'crosshair',
      pan: 'all-scroll',
      wait: 'progress',
    });
  });
});

describe('cursorUpdate: only a mouse sets the cursor', () => {
  it('a mouse gets the CSS for its state', () => {
    expect(cursorUpdate('default', { wasTouch: false }, 'target')).toBe('crosshair');
  });

  it('touch never sets a cursor', () => {
    expect(cursorUpdate('default', { wasTouch: true }, 'target')).toBeNull();
  });

  it('no write when the cursor is already right', () => {
    expect(cursorUpdate('crosshair', { wasTouch: false }, 'target')).toBeNull();
  });
});
