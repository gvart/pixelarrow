/**
 * W-80 food at home online (server/src/war/room.ts larders; rule: src/war/sim/food.ts, docs/WAR.md "Food and hunger"):
 * the playtest's home strongroom held 280 food while men starved by the storehouse. At the alliance's home a man by a
 * store of his tops his pack up from his own strongroom (the DO loads it into the room); the tick tells the DO what
 * was drawn, and nothing is drawn for another alliance or past what the strongroom holds.
 */
import { describe, expect, it } from 'vitest';
import { HUNGER, hungerStage } from '../../../src/war/sim/food';
import { amount } from '../../../src/war/sim/holders';
import { WarRoom } from '../../src/war/room';
import { warRegion } from '../../src/war/regions';

const region = warRegion('dodona')!;
const STORES = new Set(['camp', 'storehouse', 'fort', 'stoa', 'warehouse', 'sortingFloor', 'sortingFloor2']);

function setup(team: number) {
  const room = new WarRoom({ region, seed: 3, cap: 600, home: 0 });
  const st = room.snapshot().buildings!.find((b) => b.team === team && STORES.has(b.type) && b.state === 'done');
  return { room, st };
}

describe('W-80 food at home online', () => {
  it('starving men by a home store eat from his strongroom; the tick books what they drew', () => {
    const { room, st } = setup(0);
    expect(st).toBeDefined();
    for (const h of room.sim.cargo({ building: st!.id })?.slots ?? []) for (const l of h.hold.lots) l.n = 0; // the playtest: the stoa held no food
    room.setLarder(1, { food: 280, coin: 20 });
    const s = room.sim.spawnSquad('p:1', 0, 'hoplite', 4, st!.x + 1, st!.y + 1);
    const ids = room.sim.snapshot().squads[s].units;
    room.sim.setSatiety(ids, 0);
    const drawn: Record<string, number> = {};
    for (let t = 0; t < HUNGER.every * 3; t++) for (const x of room.tick().larder) if (x.pid === 1) for (const [r, n] of Object.entries(x.goods)) drawn[r] = (drawn[r] ?? 0) + n;
    const snap = room.snapshot();
    for (const id of ids) expect(hungerStage(snap.units[id].sat!)).toBe(0);
    for (const sl of room.sim.cargo({ squad: s })!.slots) expect(amount(sl.hold, 'ration')).toBe(HUNGER.kit);
    expect(drawn.food).toBeGreaterThanOrEqual(4 * HUNGER.kit * HUNGER.packFood);
    expect(drawn.food).toBeLessThanOrEqual(280);
  }, 60_000);

  it('an empty strongroom gives nothing; a stranger of another alliance gets nothing from it', () => {
    const { room, st } = setup(0);
    for (const h of room.sim.cargo({ building: st!.id })?.slots ?? []) for (const l of h.hold.lots) l.n = 0;
    room.setLarder(1, { food: 1 });
    room.setLarder(2, { food: 280 });
    const s = room.sim.spawnSquad('p:1', 0, 'hoplite', 1, st!.x + 1, st!.y + 1);
    const f = room.sim.spawnSquad('p:2', 1, 'hoplite', 1, st!.x + 1, st!.y + 2);
    let books = 0;
    for (let t = 0; t < HUNGER.every * 2; t++) books += room.tick().larder.length;
    expect(books).toBe(0);
    expect(amount(room.sim.cargo({ squad: s })!.slots[0].hold, 'ration')).toBe(0);
    expect(amount(room.sim.cargo({ squad: f })!.slots[0].hold, 'ration')).toBe(0);
  }, 60_000);
});
