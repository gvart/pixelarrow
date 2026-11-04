/** W-221 his men struck are told once a fight, by name; a starving man's own loss is ./foodWatch.ts's to say. */
import { describe, expect, it } from 'vitest';
import { droppedLine, HARM_QUIET, harmMemo, harmNotes } from '../../src/war/view/hud/harmWatch';
import type { Snapshot } from '../../src/war/types';

type Cur = Pick<Snapshot, 'tick' | 'units' | 'squads'>;
const squads = [{ id: 1, team: 0, owner: 'p:1' }, { id: 2, team: 7 }, { id: 3, team: 0, owner: 'p:2' }] as unknown as Snapshot['squads'];
const man = (id: number, squad: number, cls: string, hp: number, x = 0, o: object = {}) => ({ id, squad, cls, hp, x, y: 0, state: 'idle', ...o }) as unknown as Snapshot['units'][number];
const cur = (tick: number, units: Snapshot['units']): Cur => ({ tick, units, squads });
const notes = (m: ReturnType<typeof harmMemo>, c: Cur) => harmNotes(c, 'p:1', m, (t) => t === 0);
const wolves = [man(10, 2, 'mob_wolf', 20, 2), man(11, 2, 'mob_wolf', 20, 3), man(12, 2, 'mob_wolf', 20, 4)];

describe('W-221 harmNotes', () => {
  it('names who struck, says it once a fight, and again after a quiet spell', () => {
    const m = harmMemo();
    expect(notes(m, cur(1, [man(1, 1, 'hoplite', 40), ...wolves]))).toEqual([]);
    expect(notes(m, cur(2, [man(1, 1, 'hoplite', 34), ...wolves]))).toEqual(['Your men are under attack by 3 wolves.']);
    expect(notes(m, cur(3, [man(1, 1, 'hoplite', 30), ...wolves]))).toEqual([]);
    expect(notes(m, cur(4 + 2 * HARM_QUIET, [man(1, 1, 'hoplite', 20), ...wolves]))).toHaveLength(1);
  });

  it('never silent: struck with no foe in sight says that', () => {
    const m = harmMemo();
    notes(m, cur(1, [man(1, 1, 'hoplite', 40)]));
    expect(notes(m, cur(2, [man(1, 1, 'hoplite', 30)]))).toEqual(['Your men are being struck by something you cannot see.']);
  });

  it('hunger, another player\'s men and a man first seen hurt are no attack on him', () => {
    const m = harmMemo();
    notes(m, cur(1, [man(1, 1, 'hoplite', 40, 0, { sat: 0 }), man(2, 3, 'hoplite', 40)]));
    expect(notes(m, cur(2, [man(1, 1, 'hoplite', 39, 0, { sat: 0 }), man(2, 3, 'hoplite', 1), man(3, 1, 'hoplite', 5)]))).toEqual([]);
  });

  it('goods fallen say what and how much', () => {
    expect(droppedLine({ coin: 52, iron: 3.4 })).toMatch(/^52 coin, 3 iron fell with your man/);
  });
});
