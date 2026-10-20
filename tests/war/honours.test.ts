/** Battle honours at a fight's end (src/war/sim/honours.ts). */
import { describe, expect, it } from 'vitest';
import { honoursOf, type HonourContext } from '../../src/war/sim/honours';
import { makePerson } from '../../src/war/sim/roster';
import type { FightReport, PersonResult } from '../../src/war/types';

const hero = makePerson('h', 'hoplite').hero;
const man = (pid: string, team: number, state: PersonResult['state'] = 'fit'): PersonResult => ({ pid, owner: `p:${team + 1}`, team, state, xp: 0, kills: 0, dmg: 0, levelUps: 0, hero });
const side = (team: number, n: number, fallen = 0) => Array.from({ length: n }, (_, i) => man(`t${team}-${i}`, team, i < fallen ? 'wounded' : 'fit'));
const fight = (...persons: PersonResult[][]): FightReport => ({ tick: 1, persons: persons.flat(), loot: {} });
const ctx = (o: Partial<HonourContext> = {}): HonourContext => ({ region: 'Kleisoura Pass', chokepoint: false, holder: null, stormed: new Set(), ...o });

describe('honours', () => {
  it('Veteran: the fit men of the winning side against N or more foes', () => {
    const h = honoursOf(fight(side(0, 12, 2), side(1, 12, 8)), ctx());
    expect(h.get('t0-5')).toEqual({ name: 'Veteran of Kleisoura Pass', stat: 'hp' });
    expect(h.has('t0-0')).toBe(false); // wounded
    expect([...h.keys()].some((k) => k.startsWith('t1'))).toBe(false); // the losers
    expect(h.size).toBe(10);
  });

  it('no honour for a small fight or a lost one', () => {
    expect(honoursOf(fight(side(0, 12), side(1, 6, 6)), ctx()).size).toBe(0); // only 6 foes
    expect([...honoursOf(fight(side(0, 12, 6), side(1, 12, 2)), ctx()).keys()].some((k) => k.startsWith('t0'))).toBe(false); // lost
    expect(honoursOf(fight(side(0, 12)), ctx()).size).toBe(0); // no foes
  });

  it('Held: the holder of a chokepoint wins against half a squad or more', () => {
    const h = honoursOf(fight(side(0, 12), side(1, 6, 3)), ctx({ chokepoint: true, holder: 0 }));
    expect(h.get('t0-1')).toEqual({ name: 'Held Kleisoura Pass', stat: 'block' });
    expect(honoursOf(fight(side(0, 12), side(1, 6, 3)), ctx({ chokepoint: true, holder: 1 })).size).toBe(0);
  });

  it('Took the fort: every man of the storming side who lived, first of all', () => {
    const h = honoursOf(fight(side(0, 12, 4), side(1, 12, 6), [man('dead', 0, 'dead')]), ctx({ stormed: new Set([0]) }));
    expect(h.get('t0-0')).toEqual({ name: 'Took the fort at Kleisoura Pass', stat: 'dmg' }); // wounded counts
    expect(h.get('t0-9')!.stat).toBe('dmg');
    expect(h.has('dead')).toBe(false);
  });
});
