/** M5h3 through the room (server/src/war/room.ts): fortify orders, the engineer engines and field works over the wire, and their resume. */
import { describe, expect, it } from 'vitest';
import { NET_VERSION, parseClientMsg, type JoinMsg, type NetOrder } from '../../../src/war/net/protocol';
import { makePerson } from '../../../src/war/sim/roster';
import { FORT } from '../../../src/war/sim/works';
import type { RegionData, WarPerson } from '../../../src/war/types';
import { ownerOf, WarRoom } from '../../src/war/room';

/** As tests/war/forts.test.ts: flat 40 x 40 grass cut by a rock band on row 20, open at x 14..25; team 0 holds the south. */
function region(): RegionData {
  const n = 40;
  const r: RegionData = {
    id: 'fx', name: 'fx', w: n, h: n, height: Array(n * n).fill(1), terrain: Array(n * n).fill('grass'), water: Array(n * n).fill(0),
    // team 0 enters on side N (here the south), team 1 on side E (the north)
    entries: [{ side: 'N', x: 30, y: 34, w: 8, h: 5 }, { side: 'E', x: 30, y: 1, w: 8, h: 5 }], noBuild: [],
  };
  for (let x = 0; x < n; x++) if (x < 14 || x > 25) r.terrain[20 * n + x] = 'rock';
  return r;
}

const join = (pid: number, team: number): JoinMsg => ({ t: 'join', v: NET_VERSION, region: 'fx', playerId: pid, team, army: [{ cls: 'militia', count: 1 }] });
/** An order as a client sends it: JSON through the wire schema, then the room. */
const wire = (r: WarRoom, pid: number, o: object) => {
  const m = parseClientMsg(JSON.stringify({ t: 'order', o }));
  expect(m).toMatchObject({ t: 'order' });
  return r.order(pid, (m as { o: NetOrder }).o);
};
const run = (r: WarRoom, n: number, until?: () => boolean) => {
  for (let i = 0; i < n; i++) {
    r.tick();
    if (until?.()) return;
  }
};
const bs = (r: WarRoom) => r.snapshot().buildings ?? [];
const piece = (r: WarRoom, id: number) => bs(r).find((b) => b.id === id)!;
const engineOf = (r: WarRoom, type: string) => r.snapshot().sieges?.find((e) => e.type === type);

function setup(seed: number) {
  const r = new WarRoom({ region: region(), seed, cap: 600, epoch: 'e' });
  expect(r.join(1, join(1, 0)).msg).toMatchObject({ t: 'welcome' });
  expect(r.join(2, join(2, 1)).msg).toMatchObject({ t: 'welcome' });
  r.sim.claim(0, 20, 32, 25);
  for (const t of [0, 1]) for (const k of ['wood', 'stone', 'hides', 'iron', 'charcoal'] as const) r.sim.addStock(t, k, 5000);
  const persons: WarPerson[] = [];
  const engineer = (team: number, perks: string[], x: number, y: number) => {
    const p = makePerson(`eng-${team}`, 'civ_engineer', { level: 10 });
    p.hero.perks = perks as never;
    persons.push(p);
    r.sim.spawnSquad('x', team, 'civ_engineer', 1, x, y, [p]);
  };
  engineer(0, ['masterBuilder', 'fortifier'], 2, 38);
  const s = r.sim.spawnSquad(ownerOf(1), 0, 'militia', 24, 20, 27);
  r.tick();
  expect(wire(r, 1, { kind: 'placeBuilding', squad: s, type: 'camp', x: 20, y: 33 })).toBeNull();
  run(r, 2000, () => bs(r)[0]?.state === 'done');
  expect(bs(r)[0].state).toBe('done');
  /** Places by order and runs until every new piece stands. */
  const build = (o: object): number[] => {
    const before = bs(r).length;
    expect(wire(r, 1, o)).toBeNull();
    r.tick();
    const ids = bs(r).filter((b) => b.id >= before).map((b) => b.id);
    expect(ids.length).toBeGreaterThan(0);
    run(r, 9000, () => ids.every((id) => piece(r, id).state === 'done'));
    expect(ids.every((id) => piece(r, id).state === 'done')).toBe(true);
    return ids;
  };
  return { r, s, build, engineer, persons };
}

describe('M5h3 in the room', () => {
  it('fortify goes to the player own team buildings only; stakes and ditch place over the wire', () => {
    const { r, s, build } = setup(4);
    const [gate] = build({ kind: 'placeBuilding', squad: s, type: 'woodGate', x: 30, y: 30 });
    const g0 = piece(r, gate);
    // the foe, a building that is not there, and a stranger cannot fortify it
    expect(wire(r, 2, { kind: 'fortify', building: gate, fort: 'ironGate' })).toBe('badTarget');
    expect(wire(r, 1, { kind: 'fortify', building: 999, fort: 'ironGate' })).toBe('badTarget');
    expect(r.order(9, { kind: 'fortify', building: gate, fort: 'ironGate' } as NetOrder)).toBe('notJoined');
    r.tick();
    expect(piece(r, gate).iron).toBeUndefined();
    // a team named by the client is not taken: the room fills in the player's
    expect(wire(r, 1, { kind: 'fortify', building: gate, fort: 'ironGate', team: 1 })).toBeNull();
    expect(wire(r, 1, { kind: 'fortify', building: gate, fort: 'wetHides' })).toBeNull();
    r.tick();
    expect(piece(r, gate)).toMatchObject({ iron: true, wet: true });
    expect(piece(r, gate).maxHp).toBeCloseTo(g0.maxHp * FORT.iron);
    expect(r.log.filter((l) => l.o.kind === 'fortify').every((l) => (l.o as { team: number }).team === 0)).toBe(true);
    // field tiles: placed with a squad of the player's, or as a planned site of his team
    const before = bs(r).length;
    expect(wire(r, 1, { kind: 'placeBuilding', squad: s, type: 'stakes', x: 17.5, y: 24.5 })).toBeNull();
    expect(wire(r, 1, { kind: 'placeBuilding', type: 'ditch', x: 18.5, y: 25.5 })).toBeNull();
    expect(wire(r, 2, { kind: 'placeBuilding', squad: s, type: 'stakes', x: 19.5, y: 24.5 })).toBe('notOwner');
    r.tick();
    expect(bs(r).slice(before).map((b) => [b.type, b.team])).toEqual([['stakes', 0], ['ditch', 0]]);
  });

  it('a siege tower docks over the wire beside a mantlet and a covered ram, and the region resumes exactly', () => {
    const { r, s, build, engineer, persons } = setup(6);
    build({ kind: 'placeWall', squad: s, material: 'timber', points: [14.5, 20.5, 25.5, 20.5], gates: [20, 20.5] });
    const [gate] = bs(r).filter((b) => b.type === 'woodGate' || b.type === 'stoneGate').map((b) => b.id);
    if (gate !== undefined) expect(wire(r, 1, { kind: 'fortify', building: gate, fort: 'ironGate' })).toBeNull();
    expect(wire(r, 1, { kind: 'move', squad: s, x: 20, y: 37 })).toBeNull();
    run(r, 150);
    engineer(1, ['carpenter', 'rams', 'artillerist', 'poliorcetes'], 37, 2);
    const q = r.sim.spawnSquad(ownerOf(2), 1, 'militia', 10, 17, 10);
    const m = r.sim.spawnSquad(ownerOf(2), 1, 'militia', 4, 23, 8);
    const c = r.sim.spawnSquad(ownerOf(2), 1, 'militia', 8, 10, 8);
    r.tick();
    expect(wire(r, 1, { kind: 'buildSiege', squad: q, type: 'siegeTower', x: 17, y: 12 })).toBe('notOwner');
    expect(wire(r, 2, { kind: 'buildSiege', squad: q, type: 'siegeTower', x: 17, y: 12 })).toBeNull();
    expect(wire(r, 2, { kind: 'buildSiege', squad: m, type: 'mantlet', x: 23, y: 10 })).toBeNull();
    expect(wire(r, 2, { kind: 'buildSiege', squad: c, type: 'coveredRam', x: 10, y: 10 })).toBeNull();
    run(r, 6000, () => ['siegeTower', 'mantlet', 'coveredRam'].every((t) => engineOf(r, t)?.state === 'idle'));
    const tower = engineOf(r, 'siegeTower')!;
    expect(tower.state).toBe('idle');
    expect(engineOf(r, 'mantlet')?.state).toBe('idle');
    expect(engineOf(r, 'coveredRam')?.state).toBe('idle');
    expect(wire(r, 2, { kind: 'crew', squad: q, siege: tower.id })).toBeNull();
    expect(wire(r, 2, { kind: 'crew', squad: c, siege: engineOf(r, 'coveredRam')!.id })).toBeNull();
    run(r, 30);
    expect(wire(r, 1, { kind: 'raiseLadder', squad: q, wallTile: [17, 20] })).toBe('notOwner');
    expect(wire(r, 2, { kind: 'raiseLadder', squad: q, wallTile: [17, 20] })).toBeNull();
    run(r, 3000, () => engineOf(r, 'siegeTower')!.state === 'raised');
    const docked = engineOf(r, 'siegeTower')!;
    expect(docked.state).toBe('raised');
    expect(piece(r, docked.ladder!)).toMatchObject({ type: 'towerBridge', team: 1, siege: docked.id });
    // his men cross onto the walk
    expect(wire(r, 2, { kind: 'move', squad: q, x: 17.5, y: 20.5 })).toBeNull();
    run(r, 200);
    // save and resume: the docked tower, its bridge, the engines and the iron-bound gate come back exactly
    const opts = { region: region(), seed: 6, cap: 600, epoch: 'e' };
    const st = JSON.parse(JSON.stringify(r.saveState()));
    const back = WarRoom.restore(opts, st, new Map(persons.map((p) => [p.id, p])));
    const strip = (x: ReturnType<WarRoom['snapshot']>) => JSON.stringify({ ...x, shots: undefined });
    expect(strip(back.snapshot())).toBe(strip(r.snapshot()));
    r.leave(1);
    r.leave(2);
    for (let i = 0; i < 300; i++) (r.tick(), back.tick());
    expect(strip(back.snapshot())).toBe(strip(r.snapshot()));
    expect(back.snapshot().buildings!.some((b) => b.type === 'towerBridge')).toBe(true);
  });
});
