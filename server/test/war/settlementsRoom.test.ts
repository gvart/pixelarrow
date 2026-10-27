/**
 * W-63 shared settlements in the region room (server/src/war/room.ts, ./roomSettlements.ts): the banner by ground at
 * join, building on a settlement's ground, presence for terms, a rebellion turning the garrison, a lord's change
 * rebannering the town, finished camps reported for founding, attacks seen, and what persists laid down again.
 */
import { describe, expect, it } from 'vitest';
import { NET_VERSION, type JoinMsg } from '../../../src/war/net/protocol';
import { WarRoom } from '../../src/war/room';
import { warRegion } from '../../src/war/regions';
import type { RoomSettlement } from '../../src/war/roomSettlements';
import { spot } from './spot';

const region = warRegion('test-ridge')!;
const join = (pid: number, team: number, count = 12, cls = 'hoplite'): JoinMsg => ({ t: 'join', v: NET_VERSION, region: 'test-ridge', playerId: pid, team, army: [{ cls, count }] });
const room = () => new WarRoom({ region, seed: 1, cap: 600 });
const steps = (r: WarRoom, n: number) => {
  let last: ReturnType<WarRoom['tick']> | null = null;
  for (let i = 0; i < n; i++) last = r.tick();
  return last!;
};
const at = { x: 60, y: 60 };
const town = (o: Partial<RoomSettlement> = {}): RoomSettlement => ({
  id: 1, centre: -1, ...at, r: 24, name: 'Akra', lord: 10, lordName: 'Lykos', team: 1, level: 1, overlord: null, tribute: 0, leviedAt: 0, overlordLords: [],
  members: [{ pid: 10, role: 'lord', plot: null }, { pid: 20, role: 'citizen', plot: { x0: 50, y0: 50, x1: 55, y1: 55 } }], ...o,
});
const hp = (r: WarRoom, squads: number[]) => r.snapshot().units.filter((u) => squads.includes(u.squad) && u.state !== 'dead').reduce((a, u) => a + u.hp, 0);

describe('W-63 banner by ground', () => {
  it('a citizen of a foreign-led settlement fights under its lord\'s alliance; the quota counts him there', () => {
    const r = room();
    r.setSettlements([town()]);
    const w = r.join(20, join(20, 0)).msg;
    expect(w).toMatchObject({ t: 'welcome', you: { id: 20, team: 1 } });
    expect(r.join(30, join(30, 0)).msg).toMatchObject({ t: 'welcome', you: { team: 0 } }); // no tie: his own
    steps(r, 1);
    expect(r.quota().live).toEqual([12, 12, 0, 0]);
    expect(r.snapshot().squads[r.squadsOf(20)[0]].team).toBe(1);
    expect(r.settlementsFor(20)).toEqual([expect.objectContaining({ id: 1, role: 'citizen', team: 1, plots: [{ pid: 20, x0: 50, y0: 50, x1: 55, y1: 55 }] })]);
    expect(r.settlementsFor(30)[0].role).toBeNull();
  });
});

describe('W-63 building on a settlement\'s ground', () => {
  it('citizens on their own plot only, the lord off citizens\' plots, others not at all', () => {
    const r = room();
    r.setSettlements([town()]);
    for (const p of [10, 20, 30]) r.join(p, join(p, p === 30 ? 2 : 1, 4, 'militia'));
    steps(r, 1);
    const put = (pid: number, x: number, y: number) => r.order(pid, { kind: 'placeBuilding', type: 'storehouse', x, y });
    expect(put(20, 66, 66)).toBe('notYourGround');
    expect(r.refusal).toMatch(/own plot in Akra/);
    expect(put(20, 52.5, 52.5)).toBeNull();
    expect(put(30, 66, 66)).toBe('notYourGround');
    expect(r.refusal).toMatch(/Lykos's ground/);
    expect(put(10, 52.5, 52.5)).toBe('notYourGround');
    expect(r.refusal).toMatch(/citizen's plot/);
    expect(put(10, 66, 66)).toBeNull();
    expect(put(30, 120, 120)).toBeNull(); // off its ground: the usual rules
    expect(r.order(30, { kind: 'placeWall', squad: r.squadsOf(30)[0], material: 'wood', points: [62, 62, 70, 62] })).toBe('notYourGround');
  });
});

describe('W-63 presence for terms', () => {
  it('six of his fighters on its ground', () => {
    const r = room();
    r.setSettlements([town()]);
    r.join(30, join(30, 2, 1, 'militia'));
    steps(r, 1);
    expect(r.presence(30, 1)).toBe(false);
    expect(r.dev(30, { t: 'dev', op: 'spawn', cls: 'hoplite', count: 5, team: 2, x: at.x, y: at.y })).toBeNull();
    steps(r, 1);
    expect(r.presence(30, 1)).toBe(false);
    r.dev(30, { t: 'dev', op: 'spawn', cls: 'hoplite', count: 1, team: 2, x: at.x + 2, y: at.y });
    steps(r, 1);
    expect(r.presence(30, 1)).toBe(true);
    expect(r.presence(30, 2)).toBe(false); // no such settlement here
  });
});

describe('W-63 a rebellion turns the garrison', () => {
  it('the overlord\'s garrison flies the vassal\'s banner; the tie ends: it turns and the fight starts', () => {
    const r = room();
    const vassal = town({ members: [{ pid: 10, role: 'lord', plot: null }, { pid: 40, role: 'garrison', plot: null }], overlord: 2, overlordLords: [40] });
    r.setSettlements([vassal]);
    r.join(10, join(10, 1, 8));
    r.join(40, join(40, 0, 8)); // alliance 0, garrison of an alliance-1 lord's town
    steps(r, 1);
    const [g] = r.squadsOf(40), [l] = r.squadsOf(10);
    expect(r.snapshot().squads[g].team).toBe(1);
    // both stand in the town
    r.order(10, { kind: 'move', squad: l, x: at.x, y: at.y });
    r.order(40, { kind: 'move', squad: g, x: at.x + 3, y: at.y });
    steps(r, 400);
    const h0 = hp(r, [g]) + hp(r, [l]);
    r.setSettlements([{ ...vassal, overlord: null, overlordLords: [], members: vassal.members.filter((m) => m.role !== 'garrison') }]);
    expect(r.log.filter((x) => x.o.kind === 'turnSquad')).toEqual([expect.objectContaining({ o: { kind: 'turnSquad', squad: g, team: 0 } })]);
    const t = r.tick();
    expect(t.msgs.get(40)).toContainEqual(expect.objectContaining({ t: 'welcome', you: { id: 40, team: 0 } }));
    expect(r.snapshot().squads[g].team).toBe(0);
    steps(r, 300);
    expect(hp(r, [g]) + hp(r, [l])).toBeLessThan(h0 - 10);
  });
});

/** A camp of team 0 finished at once by player `pid`'s placement; its building id and spot. */
function campOf(r: WarRoom, pid: number) {
  const me = r.snapshot().units.filter((u) => r.squadsOf(pid).includes(u.squad));
  const [x, y] = spot(r, Math.round(me[0].x), Math.round(me[0].y));
  const before = r.snapshot().buildings?.length ?? 0;
  expect(r.order(pid, { kind: 'placeBuilding', type: 'camp', x, y })).toBeNull();
  steps(r, 1);
  const camp = r.snapshot().buildings!.slice(before).find((b) => b.type === 'camp')!;
  r.sim.finishSite(camp.id);
  return { id: camp.id, x: camp.x, y: camp.y };
}

describe('W-63 founding, rebanner and attacks', () => {
  it('a finished camp is reported once with its placer as lord; outside a home only', () => {
    const r = room();
    r.join(1, join(1, 0, 4, 'militia'));
    steps(r, 1);
    const c = campOf(r, 1);
    let found: unknown[] = [];
    for (let i = 0; i < 12; i++) found = [...found, ...(r.tick().settle?.found ?? [])];
    expect(found).toEqual([{ centre: c.id, x: c.x, y: c.y, lord: 1 }]);
    // a home's room never founds
    const h = new WarRoom({ region, seed: 1, cap: 600, home: 0 });
    h.join(1, join(1, 0, 4, 'militia'));
    steps(h, 1);
    campOf(h, 1);
    let none = 0;
    for (let i = 0; i < 12; i++) none += h.tick().settle?.found.length ?? 0;
    expect(none).toBe(0);
  });

  it('a new lord of another alliance: the town rebanners and its people turn', () => {
    const r = room();
    r.join(1, join(1, 0, 4, 'militia'));
    steps(r, 1);
    const c = campOf(r, 1);
    steps(r, 60); // town levels measured
    const s = town({ id: 7, centre: c.id, x: c.x, y: c.y, lord: 1, lordName: 'One', team: 0, members: [{ pid: 1, role: 'lord', plot: null }] });
    r.setSettlements([s]);
    expect(r.snapshot().townLevels!.find((t) => t.id === c.id)!.team).toBe(0);
    r.setSettlements([{ ...s, lord: 2, team: 2, members: [{ pid: 2, role: 'lord', plot: null }, { pid: 1, role: 'citizen', plot: null }] }]);
    steps(r, 60);
    expect(r.snapshot().buildings!.find((b) => b.id === c.id)!.team).toBe(2);
    expect(r.snapshot().townLevels!.find((t) => t.id === c.id)!.team).toBe(2);
    expect(r.snapshot().squads[r.squadsOf(1)[0]].team).toBe(2);
  });

  it('a foe player striking its people on its ground is an attack, logged once a cooldown', () => {
    const r = room();
    r.join(10, join(10, 1, 8));
    r.join(3, join(3, 2, 1, 'militia'));
    steps(r, 1);
    const men = r.snapshot().units.filter((u) => r.squadsOf(10).includes(u.squad));
    const cx = men.reduce((a, u) => a + u.x, 0) / men.length, cy = men.reduce((a, u) => a + u.y, 0) / men.length;
    r.setSettlements([town({ x: cx, y: cy, members: [{ pid: 10, role: 'lord', plot: null }] })]);
    r.dev(3, { t: 'dev', op: 'spawn', cls: 'hoplite', count: 8, team: 2, x: cx - 3, y: cy });
    const attacks: unknown[] = [];
    for (let i = 0; i < 600; i++) attacks.push(...(r.tick().settle?.attacks ?? []));
    expect(attacks).toEqual([{ by: 3, victim: 1 }]);
  });
});

describe('W-63 what persists', () => {
  it('pieces and store goods laid down again on a fresh field', () => {
    const r = room();
    r.join(1, join(1, 0, 4, 'militia'));
    steps(r, 1);
    const c = campOf(r, 1);
    const s = town({ id: 3, centre: c.id, x: c.x, y: c.y, lord: 1, team: 0, members: [{ pid: 1, role: 'lord', plot: null }] });
    r.setSettlements([s]);
    expect(r.takeStore(3, {})).toBe(true);
    r.order(1, { kind: 'move', squad: r.squadsOf(1)[0], x: c.x + 4, y: c.y + 4 });
    steps(r, 300);
    const [rep] = r.settlementReports();
    expect(rep).toMatchObject({ id: 3, tended: true });
    const pieces = rep.persist.pieces!;
    expect(pieces[0]).toMatchObject({ type: 'camp', x: c.x, y: c.y, hp: 1 });
    // a fresh room: the camp stands again, its goods in it
    const f = room();
    const centre = f.restorePieces(0, s, [{ ...pieces[0], hp: 0.5, goods: { wood: 25 } }]);
    const b = f.snapshot().buildings!.find((x) => x.id === centre)!;
    expect(b).toMatchObject({ type: 'camp', team: 0, state: expect.stringMatching(/done|damaged/) });
    expect(b.hp).toBeCloseTo(b.maxHp / 2, 0);
    f.setSettlements([{ ...s, centre: centre! }]);
    expect(f.storeGoods(3).wood).toBeCloseTo(25);
    expect(f.takeStore(3, { wood: 30 })).toBe(false);
    expect(f.takeStore(3, { wood: 20 })).toBe(true);
    expect(f.storeGoods(3).wood).toBeCloseTo(5);
    // blocked tiles: dropped
    expect(room().restorePieces(0, s, [{ ...pieces[0], x: -50, y: -50 }])).toBeNull();
  });

  it('saved and restored, the room keeps who placed camps and its players\' own alliances', () => {
    const r = room();
    r.setSettlements([town()]);
    r.join(20, join(20, 0));
    const st = JSON.parse(JSON.stringify(r.saveState()));
    const back = WarRoom.restore({ region, seed: 1, cap: 600 }, st, new Map());
    back.setSettlements([]); // the tie gone: back to his own
    expect(back.log.filter((x) => x.o.kind === 'turnSquad').map((x) => (x.o as { team: number }).team)).toEqual([0]);
  });
});
