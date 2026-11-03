/**
 * W-88..W-91 on the server (docs/WAR.md "Buildings need people"): the room enforces who may use a building and who may
 * change its terms, the owner's share comes off an ally's work, offline staff keep working (W-97), a household goes by
 * the settlement ties, and a door under attack reaches the room's output.
 */
import { describe, expect, it } from 'vitest';
import { heldNodes } from '../../../src/data/professions';
import { RECIPES } from '../../../src/data/recipes';
import { NET_VERSION, orderSchema, type ServerMsg } from '../../../src/war/net/protocol';
import { makePerson } from '../../../src/war/sim/roster';
import type { ResourceKind } from '../../../src/war/types';
import { warRegion } from '../../src/war/regions';
import { WarRoom, type LockEvent } from '../../src/war/room';
import { householdOf } from '../../src/war/roomSettlements';
import { spot } from './spot';

const region = warRegion('test-ridge')!;
const run = (r: WarRoom, n: number, until?: () => boolean) => {
  for (let t = 0; t < n; t++) {
    r.tick();
    if (until?.()) return;
  }
};
const smelt = Object.values(RECIPES).find((x) => x.at === 'forge' && x.kind === 'smelt' && x.lv === 1 && !!x.out.good && heldNodes('smith', []).has(x.node))!;
const made = smelt.out.good as ResourceKind;

/** A room with p:1 (the owner) and p:2 (his ally), both online, and p:1's finished forge on team 0's ground. */
function room() {
  const r = new WarRoom({ region, seed: 1, cap: 600 }), sim = r.sim;
  const [x, y] = spot(r, 60, 40);
  sim.claim(0, x, y, 30);
  const join = (pid: number) => (r.join(pid, { t: 'join', v: NET_VERSION, region: 'test-ridge', playerId: pid, team: 0, army: [{ cls: 'militia', count: 2 }] }).msg as Extract<ServerMsg, { t: 'welcome' }>).squads[0];
  const own = join(1);
  join(2);
  expect(r.order(1, { kind: 'placeBuilding', squad: own, type: 'forge', x, y })).toBeNull();
  run(r, 2);
  const forge = r.snapshot().buildings!.find((b) => b.type === 'forge')!.id;
  sim.finishSite(forge);
  for (const [k, v] of Object.entries(smelt.inputs)) sim.addStock(0, k as never, (v as number) * 4);
  sim.claim(0, x + 8, y, 20);
  run(r, 2);
  const smith = (pid: number) => sim.spawnSquad(`p:${pid}`, 0, 'civ_smith', 1, x, y + 4, [makePerson(`s${pid}`, 'civ_smith', { level: 3 })]);
  return { r, sim, forge, smith, x, y, own };
}

describe('W-89 on the wire', () => {
  it('the order parses; its name comes from the room, not the wire', () => {
    expect(orderSchema.safeParse({ kind: 'setAccess', building: 1, access: 'household', share: 0.2 }).success).toBe(true);
    expect(orderSchema.safeParse({ kind: 'setAccess', building: 1, access: 'friends' }).success).toBe(false);
  });

  it('only the owner sets its terms; a closed building refuses a stranger at the door and the queue', () => {
    const { r, forge, smith } = room();
    expect(r.order(2, { kind: 'setAccess', building: forge, access: 'anyone' })).toBe('notOwner');
    expect(r.order(1, { kind: 'setAccess', building: forge, access: 'private' })).toBeNull();
    run(r, 2);
    expect(r.snapshot().buildings!.find((b) => b.id === forge)!.access).toBe('private');
    const s = smith(2);
    run(r, 1);
    expect(r.order(2, { kind: 'civWork', squad: s, building: forge })).toBe('notAllowed');
    expect(r.order(2, { kind: 'craft', building: forge, recipe: smelt.id })).toBe('notAllowed');
    expect(r.order(2, { kind: 'demolish', building: forge })).toBe('notOwner');
    expect(r.order(1, { kind: 'craft', building: forge, recipe: smelt.id })).toBeNull();
  });

  it('a permitted ally runs it, the owner keeps his share, and it goes on while the ally is offline (W-97)', () => {
    const { r, sim, forge, smith, x, y } = room();
    expect(r.order(1, { kind: 'setAccess', building: forge, share: 0.25 })).toBeNull();
    const s = smith(2);
    run(r, 1);
    expect(r.order(2, { kind: 'civWork', squad: s, building: forge })).toBeNull();
    run(r, 40);
    expect(r.order(2, { kind: 'craft', building: forge, recipe: smelt.id })).toBeNull();
    run(r, 20);
    r.leave(2); // gone: his man is still at the forge, on his last order
    const b0 = () => r.snapshot().buildings!.find((b) => b.id === forge)!;
    run(r, 5000, () => !b0().queue);
    expect(b0().queue).toBeUndefined();
    expect(b0().goods?.[made]).toBeCloseTo(smelt.out.n * 0.25);
    expect(sim.goodsAt(0, x, y)[made]).toBeCloseTo(smelt.out.n * 0.75);
  });

  it('the room writes what was broken into for its owner to hear', () => {
    const { r, sim, x, y, own } = room();
    expect(r.order(1, { kind: 'placeBuilding', squad: own, type: 'privateHouse', x: x + 6, y: y + 6 })).toBeNull();
    run(r, 2);
    const house = r.snapshot().buildings!.find((b) => b.type === 'privateHouse')!;
    expect(house.owner).toBe('p:1');
    sim.finishSite(house.id);
    sim.dropSquad(own);
    const raider = sim.spawnSquad('p:9', 1, 'militia', 12, house.x, house.y + 3);
    sim.order({ kind: 'move', squad: raider, x: house.x, y: house.y + 3 });
    run(r, 2);
    sim.cargo({ building: house.id })!.slots[0].hold.lots.push({ r: 'coin', n: 100, o: 't' });
    for (const u of r.snapshot().units) if (u.squad !== raider && Math.hypot(u.x - house.x, u.y - house.y) < 12) sim.dropSquad(u.squad);
    sim.order({ kind: 'load', squad: raider, from: { building: house.id } });
    const heard: LockEvent[] = [];
    for (let t = 0; t < 1000 && !heard.some((e) => e.kind === 'lockBroken'); t++) heard.push(...r.tick().locks);
    expect(heard[0]).toMatchObject({ kind: 'lockAttacked', owner: 'p:1', team: 0, by: 1, type: 'privateHouse' });
    expect(heard.at(-1)).toMatchObject({ kind: 'lockBroken', owner: 'p:1' });
  });
});

describe('W-89 household', () => {
  const s = (id: number, lord: number, pids: number[], over: number[] = []) => ({ id, lord, members: pids.map((pid) => ({ pid })), overlordLords: over }) as never;
  it('his citizens and those sworn to him; nobody else, and no reach upwards', () => {
    const tied = householdOf([s(1, 10, [10, 11]), s(2, 20, [20, 21], [10])], [{ vassal: 20, lord: 10, pct: 10 }]);
    expect(tied('p:10', 'p:11')).toBe(true);
    expect(tied('p:10', 'p:20')).toBe(true);
    expect(tied('p:10', 'p:21')).toBe(false);
    expect(tied('p:20', 'p:10')).toBe(false);
    expect(tied('p:11', 'p:10')).toBe(false);
    expect(tied('bot', 'p:10')).toBe(false);
  });
});
