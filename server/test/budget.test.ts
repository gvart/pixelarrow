/**
 * EC-04 on the duel server: budget validation prices heroes from the class
 * costs in src/data/classes.ts (classPoints = round(cost / 10)). The re-cost
 * kept every class's points except the Sacred Band (13 -> 12), so a team
 * stored before EC-04 never costs more points than it did: nothing that fit
 * a budget is refused (no migration needed).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { Hero } from '../../src/data/units';
import { CLASSES, type ClassId } from '../../src/data/classes';
import { DUEL_CLASSES, DUEL_RULES, classPoints, heroPoints, teamPoints } from '../../src/duel/rules';
import { DB, fresh, openDuellist, post } from './onlineHelpers';

beforeEach(fresh);

/** Duel points per class before EC-04 (costs militia 60, archer 50, peltast 65, Sacred Band 125...). */
const POINTS_BEFORE: Record<string, number> = {
  militia: 6, hoplite: 10, thureophoros: 9, celt_sword: 8, rhomphaia: 9, archer: 5, slinger: 5, javelineer: 5, horse_archer: 8,
  peltast: 7, falx: 8, gallic: 7, fanatic: 7, companion: 16, thessalian: 12, chariot: 26, royal_guard: 13, sacred_band: 13,
};

interface Profile {
  heroes: Hero[];
  team: string[];
}

const err = (r: { body: unknown }) => (r.body as { error: { code: string } }).error.code;

describe('duel budget after the class re-cost (server)', () => {
  it('prices every duel class from its cost, and no class costs more points than before EC-04', () => {
    for (const { cls } of DUEL_CLASSES) {
      expect(classPoints(cls)).toBe(Math.max(1, Math.round(CLASSES[cls].cost / 10)));
      expect(classPoints(cls), cls).toBeLessThanOrEqual(POINTS_BEFORE[cls]);
    }
    const changed = DUEL_CLASSES.filter(({ cls }) => classPoints(cls) !== POINTS_BEFORE[cls]).map((c) => c.cls);
    expect(changed).toEqual(['sacred_band' as ClassId]);
    expect(classPoints('sacred_band')).toBe(12);
  });

  it('a stored team keeps its points: the starter roster at every level', async () => {
    const { profile } = await openDuellist<Profile>(9501);
    for (let level = 1; level <= 10; level++) {
      const team = profile.heroes.map((h) => ({ ...h, level }));
      const before = team.reduce((a, h) => a + Math.round(POINTS_BEFORE[h.cls!] * (1 + (level - 1) / 9)), 0);
      expect(teamPoints(team)).toBe(before);
    }
  });

  it('the defence check uses the new Sacred Band cost: ten at level 3 fit 150 (160 before), one more level does not', async () => {
    const { token, pid, profile } = await openDuellist<Profile>(9502);
    const proto = profile.heroes[0];
    const ids: string[] = [];
    const now = Date.now();
    for (let i = 0; i < 10; i++) {
      const h: Hero = { ...proto, id: `${proto.id}sb${i}`, cls: 'sacred_band', level: 3, perks: [], equip: {} };
      ids.push(h.id);
      await DB().prepare('INSERT INTO duel_heroes (id, player_id, data, base_attrs, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)').bind(h.id, pid, JSON.stringify(h), JSON.stringify(h.attrs), now).run();
    }
    const sb = { ...proto, cls: 'sacred_band', level: 3, equip: {} } as Hero;
    expect(heroPoints(sb) * 10).toBe(DUEL_RULES.budget);
    expect(Math.round(POINTS_BEFORE.sacred_band * (1 + 2 / 9)) * 10).toBeGreaterThan(DUEL_RULES.budget);
    expect((await post('/api/duel/team', token, { heroIds: ids })).status).toBe(200);
    expect((await post('/api/duel/loadout', token, { slot: 1, use: ['defence'] })).status).toBe(200);
    // one Sacred Band a level higher: 151 points, over the budget
    const up = { ...sb, id: ids[0], level: 4 };
    await DB().prepare('UPDATE duel_heroes SET data = ?2 WHERE id = ?1').bind(up.id, JSON.stringify(up)).run();
    const bad = await post('/api/duel/loadout', token, { slot: 1, use: ['defence'] });
    expect(bad.status).toBe(409);
    expect(err(bad)).toBe('over_budget');
  });
});
