import { describe, expect, it } from 'vitest';
import { POINTS_PER_LEVEL } from '../../src/data/perks';
import { xpToNext } from '../../src/data/units';
import { createSim } from '../../src/war/sim';
import { warStatsOf } from '../../src/war/sim/classes';
import { applyOffer, createRoster, grantXp, levelOffers, makePerson } from '../../src/war/sim/roster';
import { SKILLS } from '../../src/war/sim/skills';
import { flat } from './flatRegion';

describe('M5g level-up choice', () => {
  it('a fresh recruit has nothing pending; a level-up offers his points into one attribute', () => {
    const p = makePerson('a', 'hoplite');
    expect(levelOffers(p)).toEqual([]);
    const up = grantXp(p, xpToNext(1));
    expect(up.hero.level).toBe(2);
    const o = levelOffers(up);
    expect(o).toHaveLength(4);
    expect(o.every((x) => x.kind === 'attr' && x.n === POINTS_PER_LEVEL)).toBe(true);
    const after = applyOffer(up, o[0]);
    expect(after.hero.points).toBe(0);
    expect(levelOffers(after)).toEqual([]);
  });

  it('at level 3 an open slot offers two skills of his family he does not hold; the pick fills it', () => {
    const p = makePerson('b', 'archer', { level: 3, skills: [] });
    const o = levelOffers(p);
    expect(o).toHaveLength(2);
    for (const x of o) expect(x.kind === 'skill' && SKILLS[x.skill].family === 'missile').toBe(true);
    const after = applyOffer(p, o[1]);
    expect(after.skills).toEqual([o[1].kind === 'skill' && o[1].skill]);
    expect(levelOffers(after).some((x) => x.kind === 'skill')).toBe(false);
  });

  it('a skill pick changes the baked stats (preview) and the live unit takes it (setPerson)', () => {
    const p = makePerson('c', 'hoplite', { level: 3, skills: [] });
    const drill = applyOffer(p, { kind: 'skill', skill: 'shieldDrill' });
    expect(warStatsOf(drill).armor).toBeGreaterThan(warStatsOf(p).armor);
    const sim = createSim(flat(), 1);
    sim.spawnSquad('you', 0, 'hoplite', 1, 20, 20, [p]);
    expect(sim.setPerson(drill)).toBe(true);
    expect(sim.setPerson(makePerson('nobody', 'hoplite'))).toBe(false);
  });

  it('roster.update replaces a known person only', () => {
    const r = createRoster();
    const [p] = r.recruit('r', 'militia', 1);
    r.update(grantXp(p, 500));
    expect(r.get(p.id)!.hero.level).toBeGreaterThan(1);
    r.update(makePerson('ghost', 'militia'));
    expect(r.get('ghost')).toBeUndefined();
  });
});
