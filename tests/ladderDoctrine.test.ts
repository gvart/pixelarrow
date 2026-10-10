import { describe, expect, it } from 'vitest';
import { CHAPTER_DOCTRINE, LADDER, chapterOf, floorDoctrine, ladderFloor, ladderSetup } from '../src/duel/ladder';
import { DOCTRINES } from '../src/data/doctrines';
import { Battle } from '../src/sim/battle';
import { DEFAULT_DOCTRINE, DOCTRINE_IDS } from '../src/sim/types';

// AI-03: ladder floors fight under a doctrine (design/gdd/ai-doctrines.md R4).
describe('ladder doctrines (AI-03)', () => {
  it('a chapter floor fights the chapter doctrine: 1 steady, 2 swarm, 3 rush, 4 hammer, 5 fury', () => {
    expect(CHAPTER_DOCTRINE).toEqual(['steady', 'swarm', 'rush', 'hammer', 'fury']);
    for (let f = 1; f <= LADDER.floors; f++) {
      if (f % LADDER.bossEvery === 0) continue;
      expect(ladderFloor(f).doctrine, `floor ${f}`).toBe(CHAPTER_DOCTRINE[chapterOf(f) - 1]);
    }
  });

  it('a boss floor uses the culture rule (greek steady, phoenician hammer, celtic rush)', () => {
    expect(floorDoctrine(10, 'greek')).toBe('steady');
    expect(floorDoctrine(20, 'phoenician')).toBe('hammer');
    expect(floorDoctrine(30, 'celtic')).toBe('rush');
    // a chapter floor ignores the culture
    expect(floorDoctrine(11, 'celtic')).toBe('swarm');
    for (let f = LADDER.bossEvery; f <= LADDER.floors; f += LADDER.bossEvery) {
      expect(['steady', 'hammer', 'rush']).toContain(ladderFloor(f).doctrine);
    }
  });

  it('a floor, doctrine included, is a pure function of its number', () => {
    const a = ladderFloor(17);
    const b = ladderFloor(17);
    expect(b).toEqual(a);
    expect(a.doctrine).toBe('swarm');
  });

  it('the setup carries the doctrine on the bot side only (client and server build it with the same function)', () => {
    const floor = ladderFloor(34);
    const setup = ladderSetup(1234, ladderFloor(1).heroes, floor.formations, floor);
    expect(setup.armies[1].bot).toBe(true);
    expect(setup.armies[1].doctrine).toBe('hammer');
    expect(setup.armies[0].doctrine).toBeUndefined();
    // deterministic: same inputs, same setup
    expect(ladderSetup(1234, ladderFloor(1).heroes, floor.formations, floor)).toEqual(setup);
  });

  it('a floor without a doctrine (old data) plays steady', () => {
    const floor = { ...ladderFloor(41) } as Partial<ReturnType<typeof ladderFloor>>;
    delete floor.doctrine;
    const setup = ladderSetup(7, ladderFloor(1).heroes, floor.formations!, floor as ReturnType<typeof ladderFloor>);
    expect(setup.armies[1].doctrine).toBe(DEFAULT_DOCTRINE);
  });

  it('every ladder doctrine is a known one and never picks the orb (V5-041)', () => {
    for (let f = 1; f <= LADDER.floors; f++) {
      const d = ladderFloor(f).doctrine;
      expect(DOCTRINE_IDS).toContain(d);
      expect(DOCTRINES[d].preferShape).not.toBe('orb');
    }
  });

  it('a ladder battle under its doctrine is deterministic (same seed, same hash)', () => {
    const floor = ladderFloor(25);
    const team = ladderFloor(3).heroes;
    const run = () => {
      const b = new Battle(ladderSetup(99, JSON.parse(JSON.stringify(team)), floor.formations, floor));
      b.startBattle();
      while (b.phase !== 'ended' && b.tick < 20 * 200) b.step();
      return b.hash();
    };
    expect(run()).toBe(run());
  });
});
