import { describe, expect, it } from 'vitest';
import { clickPick } from '../../src/war/view/select';
import type { UnitId } from '../../src/war/types';

const ids = (...n: number[]) => n as unknown as UnitId[];
const squad = ids(1, 2, 3), other = ids(7, 8), man = 2 as unknown as UnitId;

describe('clickPick (a click on own man)', () => {
  it('a single click selects his whole squad', () => {
    expect(clickPick([], [], squad, man, false, false)).toEqual(squad);
    expect(clickPick(other, [], squad, man, false, false)).toEqual(squad);
  });
  it('shift adds his squad, or drops it when all of it is selected', () => {
    expect(clickPick(other, [], squad, man, true, false)).toEqual(ids(7, 8, 1, 2, 3));
    expect(clickPick(ids(7, 8, 1, 2, 3), [], squad, man, true, false)).toEqual(other);
    expect(clickPick(ids(7, 2), [], squad, man, true, false)).toEqual(ids(7, 2, 1, 3));
  });
  it('a double-click narrows to the man alone', () => {
    expect(clickPick(squad, other, squad, man, false, true)).toEqual(ids(2));
  });
  it('a shift double-click adds only him to what was selected before', () => {
    expect(clickPick(ids(7, 8, 1, 2, 3), other, squad, man, true, true)).toEqual(ids(7, 8, 2));
  });
});
