// W-83, W-85, W-86, W-95: what each path starts with (src/war/world/start.ts), read from the table.
import { describe, expect, it } from 'vitest';
import { isCivClass, isClassId } from '../../src/data/classes';
import { warStats } from '../../src/war/sim/classes';
import { makePerson } from '../../src/war/sim/roster';
import { FAMILY_OF } from '../../src/war/sim/skills';
import { FAMILIES, FAMILY_IDS, PATH_IDS, PATHS, pathRefusal, pathStart, START_CLASSES } from '../../src/war/world/start';

const soldiers = (men: readonly string[]) => men.filter((c) => !isCivClass(c));

describe('path starts', () => {
  it('offers every family of the skills but the riders, who return with mounts', () => {
    expect([...FAMILY_IDS].sort()).toEqual([...new Set(Object.values(FAMILY_OF))].filter((f) => f !== 'rider').sort());
  });

  it('a warrior starts about 6 men, all of his one family, under his cap', () => {
    for (const f of FAMILY_IDS) {
      const men = pathStart('warrior', f);
      expect(men.length, f).toBeGreaterThanOrEqual(6);
      expect(men.length, f).toBeLessThanOrEqual(7); // W-112: the skirmishers' screen is one man more
      expect(men.length, f).toBeLessThanOrEqual(PATHS.warrior.cap);
      for (const c of men) expect(FAMILY_OF[c as keyof typeof FAMILY_OF], `${f}: ${c}`).toBe(f);
    }
  });

  it('a builder and a trader start 2 guards of one start class plus workers, under their cap', () => {
    for (const p of ['builder', 'trader'] as const) {
      const men = pathStart(p), guards = soldiers(men);
      expect(guards, p).toHaveLength(2);
      expect(new Set(guards).size, p).toBe(1);
      expect(START_CLASSES as readonly string[], p).toContain(guards[0]);
      expect(guards.length, p).toBeLessThanOrEqual(PATHS[p].cap);
      expect(men.filter(isCivClass).length, p).toBeGreaterThan(0);
    }
  });

  it('every man in the table is a real class the roster can make', () => {
    const all = [...PATH_IDS.flatMap((p) => (p === 'warrior' ? [] : [...pathStart(p)])), ...FAMILY_IDS.flatMap((f) => [...FAMILIES[f].start])];
    for (const c of all) {
      expect(isClassId(c) || isCivClass(c), c).toBe(true);
      const man = makePerson(`t-${c}`, c);
      expect(man.hero.cls, c).toBe(c);
      expect(warStats(c).maxHp, c).toBeGreaterThan(0);
    }
  });

  it('the caps are W-85\'s', () => {
    expect(PATH_IDS.map((p) => PATHS[p].cap)).toEqual([12, 4, 4]);
  });
});

describe('pathRefusal', () => {
  it('takes a warrior with a family, a builder or a trader without one', () => {
    for (const f of FAMILY_IDS) expect(pathRefusal('warrior', f)).toBeNull();
    expect(pathRefusal('builder')).toBeNull();
    expect(pathRefusal('trader', null)).toBeNull();
  });

  it('refuses the rest', () => {
    expect(pathRefusal('hero')).toMatch(/not a path/);
    expect(pathRefusal('warrior')).toMatch(/family/);
    expect(pathRefusal('warrior', 'navy')).toMatch(/not a family/);
    expect(pathRefusal('warrior', 'rider')).toMatch(/not a family/);
    expect(pathRefusal('builder', 'line')).toMatch(/no family/);
  });
});
