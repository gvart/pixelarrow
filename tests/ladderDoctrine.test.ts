import { describe, expect, it } from 'vitest';
import { CHAPTER_DOCTRINE, LADDER, chapterOf, floorDoctrine, ladderFloor, ladderSetup } from '../src/duel/ladder';
import { DOCTRINES } from '../src/data/doctrines';
import { Battle } from '../src/sim/battle';
import { DEFAULT_DOCTRINE, DOCTRINE_IDS } from '../src/sim/types';

// AI-03: ladder floors fight under a doctrine (design/gdd/ai-doctrines.md R4).
describe('ladder doctrines (AI-03)', () => {
  it('chapter floors mostly fight the chapter doctrine (1 steady, 2 swarm, 3 rush, 4 hammer, 5 fury), a few tuned per floor (V5-052)', () => {
    expect(CHAPTER_DOCTRINE).toEqual(['steady', 'swarm', 'rush', 'hammer', 'fury']);
    const got = Array.from({ length: LADDER.floors }, (_, i) => ladderFloor(i + 1).doctrine);
    // chapter 1 is all steady; every later chapter keeps its doctrine on some floors
    expect(got.slice(0, 10).every((d) => d === 'steady')).toBe(true);
    for (let c = 2; c <= 5; c++) expect(got.slice((c - 1) * 10, c * 10 - 1), `chapter ${c}`).toContain(CHAPTER_DOCTRINE[c - 1]);
    // the table as measured (docs/v5/balance/AI-03.md)
    expect(got.join(' ')).toBe(
      'steady steady steady steady steady steady steady steady steady steady ' +
        'fury fury swarm steady fury swarm swarm fury rush steady ' +
        'rush rush rush swarm hammer swarm rush rush swarm steady ' +
        'steady hammer hammer hammer hammer hammer hammer fury rush steady ' +
        'swarm steady fury hammer hammer steady fury steady hammer steady',
    );
    expect(chapterOf(25)).toBe(3);
  });

  it('a boss floor fights steady (V5-052: the culture rule made floor 10 too easy)', () => {
    for (let f = LADDER.bossEvery; f <= LADDER.floors; f += LADDER.bossEvery) {
      expect(floorDoctrine(f)).toBe('steady');
      expect(ladderFloor(f).doctrine).toBe('steady');
    }
    expect(floorDoctrine(13)).toBe('swarm');
  });

  it('a ladder bot never retreats (V5-052): holdField on the bot side only', () => {
    const floor = ladderFloor(13); // swarm: retreatAt 0.45 elsewhere
    const setup = ladderSetup(5, ladderFloor(1).heroes, floor.formations, floor);
    expect(setup.armies[1].holdField).toBe(true);
    expect(setup.armies[0].holdField).toBeUndefined();
  });

  it('a retreating doctrine fights to the end under holdField (deterministic)', () => {
    // a swarm bot mirror that retreats on some seed without holdField, never with it
    const floor = ladderFloor(16);
    const fight = (seed: number, hold: boolean) => {
      const s = ladderSetup(seed, JSON.parse(JSON.stringify(floor.heroes)), [...floor.formations], floor);
      s.armies[0].bot = true;
      s.armies[1].holdField = hold;
      const b = new Battle(s);
      b.startBattle();
      while (b.phase !== 'ended' && b.tick < 20 * 400) b.step();
      return { retreated: b.retreated, hash: b.hash() };
    };
    let sawRetreat = false;
    for (let seed = 1; seed <= 12; seed++) {
      if (fight(seed, false).retreated === 1) sawRetreat = true;
      const held = fight(seed, true);
      expect(held.retreated).not.toBe(1);
      expect(fight(seed, true).hash).toBe(held.hash);
    }
    expect(sawRetreat).toBe(true);
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
