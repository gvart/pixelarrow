/** M5e promotion to elite (docs/WAR.md "Promote"; src/war/sim/roster.ts). */
import { describe, expect, it } from 'vitest';
import { warStatsOf } from '../../src/war/sim/classes';
import { createRoster, ELITE_KIT, isElite, makePerson, PROMOTE, promoteBlocker, promotePerson, promotesTo } from '../../src/war/sim/roster';
import type { WarPerson } from '../../src/war/types';

const honoured = (p: WarPerson): WarPerson => ({ ...p, honours: [{ name: 'Held the Ford', stat: 'armor' }] });

describe('promotion to elite', () => {
  it('a trained man goes to an elite of his family; militia, elites and missile men have none', () => {
    expect(promotesTo('hoplite')).toEqual(expect.arrayContaining(['royal_guard', 'sacred_band']));
    expect(promotesTo('falx')).toEqual(expect.arrayContaining(['rhomphaia', 'gallic']));
    expect(promotesTo('militia')).toEqual([]);
    expect(promotesTo('royal_guard')).toEqual([]);
    expect(promotesTo('archer')).toEqual([]);
    expect(isElite('sacred_band') && !isElite('hoplite')).toBe(true);
  });

  it('asks the level and an honour', () => {
    const p = makePerson('h', 'hoplite', { level: PROMOTE.level });
    expect(promoteBlocker(p, 'royal_guard')).toMatch(/honour/);
    expect(promoteBlocker(honoured(makePerson('h', 'hoplite', { level: PROMOTE.level - 1 })), 'royal_guard')).toMatch(/level/);
    expect(promoteBlocker(honoured(p), 'gallic')).toMatch(/not promoted/);
    expect(promoteBlocker(honoured(p), 'royal_guard')).toBeNull();
  });

  it('the elite class with its rare kit is what warStatsOf bakes; level, attributes and honours stay', () => {
    const p = honoured(makePerson('h', 'hoplite', { level: 7 }));
    const e = promotePerson(p, 'royal_guard');
    expect(e.hero).toMatchObject({ cls: 'royal_guard', level: 7, attrs: p.hero.attrs });
    expect(e.honours).toEqual(p.honours);
    expect(Object.values(e.hero.equip).every((it) => it!.rarity === ELITE_KIT.rarity)).toBe(true);
    expect(warStatsOf(e)).not.toEqual(warStatsOf(p));
  });

  it('the local roster promotes a fit person, and refuses with the reason', () => {
    const r = createRoster();
    const [a] = r.recruit('t', 'hoplite', 1, { level: 6 });
    expect(r.promote(a.id, 'royal_guard')).toMatch(/honour/);
    r.update(honoured(a));
    expect(r.promote(a.id, 'royal_guard')).toBeNull();
    expect(r.get(a.id)!.hero.cls).toBe('royal_guard');
  });
});
