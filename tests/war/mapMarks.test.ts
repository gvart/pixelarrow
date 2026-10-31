import { describe, expect, it } from 'vitest';
import { chiefMarks, guideMark, setGuideMark } from '../../src/war/view/mapMarks';
import { WAR_CHIEFS } from '../../src/data/warWild';
import type { LairSnap, MobKind, SquadId, UnitId } from '../../src/war/types';

const lair = (id: number, kind: string, extra: Partial<LairSnap> = {}): LairSnap => ({
  id, kind: kind as MobKind, x: 10 + id, y: 20 + id, squad: id as unknown as SquadId, alive: 3, count: 3,
  state: 'home', aggro: 10, leash: 20, guard: 0, nodes: 0, ...extra,
});
const led = (id: number, c: (typeof WAR_CHIEFS)[number], alive = true): LairSnap =>
  lair(id, c.kind, { chief: { id: c.id, name: c.name, title: c.title, unit: id as unknown as UnitId, alive, scale: 1.6, tint: 0xffffff } });

describe('chiefMarks (chiefs on the region map and minimap)', () => {
  it('marks every live chief at his lair, and no plain lair', () => {
    const lairs = [lair(0, 'wolf'), ...WAR_CHIEFS.map((c, i) => led(i + 1, c)), lair(99, 'bandit')];
    const ms = chiefMarks(lairs);
    expect(ms.map((m) => m.name)).toEqual(WAR_CHIEFS.map((c) => c.name));
    expect(ms[0]).toMatchObject({ x: 11, y: 21, kind: WAR_CHIEFS[0].kind, title: WAR_CHIEFS[0].title });
  });
  it('drops a slain chief and a cleared lair', () => {
    const [a, b] = WAR_CHIEFS;
    expect(chiefMarks([led(1, a, false), { ...led(2, b), state: 'cleared' }])).toEqual([]);
    expect(chiefMarks(undefined)).toEqual([]);
  });
});

describe('guideMark', () => {
  it('holds the guide target until cleared', () => {
    setGuideMark({ x: 3, y: 4 });
    expect(guideMark()).toEqual({ x: 3, y: 4 });
    setGuideMark(null);
    expect(guideMark()).toBeNull();
  });
});
