/**
 * W-153 through the region room: the orders behind the Oaths tab's holder options. Only the receiver's men standing at the
 * building collect; a sealed send rides a cart and lands only in the receiver's store; what the room reports names only real
 * buildings of the payer; nothing is made or lost on the way.
 */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { heldNodes } from '../../../src/data/professions';
import { RECIPES } from '../../../src/data/recipes';
import { NET_VERSION, orderSchema, type ServerMsg } from '../../../src/war/net/protocol';
import { makePerson } from '../../../src/war/sim/roster';
import type { ResourceKind } from '../../../src/war/types';
import { devLogin } from '../helpers';
import { owedBy, reportHeld } from '../../src/war/oaths';
import { warRegion } from '../../src/war/regions';
import { WarRoom } from '../../src/war/room';
import { spot } from './spot';

const region = warRegion('test-ridge')!;
const smelt = Object.values(RECIPES).find((x) => x.at === 'forge' && x.kind === 'smelt' && x.lv === 1 && !!x.out.good && heldNodes('smith', []).has(x.node))!;
const made = smelt.out.good as ResourceKind;
const PAYER = 1, LORD = 2, STRANGER = 3;
const run = (r: WarRoom, n: number, until?: () => boolean) => {
  for (let t = 0; t < n; t++) {
    r.tick();
    if (until?.()) return;
  }
};

/** The payer's forge with a part set aside for his lord, the lord's camp, and the payer's second, empty forge. */
function field() {
  const r = new WarRoom({ region, seed: 1, cap: 600 }), sim = r.sim;
  const [x, y] = spot(r, 60, 40);
  sim.claim(0, x, y, 40);
  const join = (pid: number) => (r.join(pid, { t: 'join', v: NET_VERSION, region: 'test-ridge', playerId: pid, team: 0, army: [{ cls: 'militia', count: 2 }] }).msg as Extract<ServerMsg, { t: 'welcome' }>).squads[0];
  const own = join(PAYER), lord = join(LORD);
  join(STRANGER);
  const build = (pid: number, squad: number, type: 'forge' | 'camp') => {
    let at: [number, number] | null = null;
    for (let d = 0; d < 40 && !at; d += 2) for (const [bx, by] of [[x + d, y], [x - d, y], [x, y + d], [x, y - d]] as const) if (sim.checkPlacement(0, type, bx, by).ok) { at = [bx, by]; break; }
    expect(at).not.toBeNull();
    expect(r.order(pid, { kind: 'placeBuilding', squad, type, x: at![0], y: at![1] })).toBeNull();
    const count = r.snapshot().buildings!.length;
    run(r, 2);
    expect(r.snapshot().buildings!.length).toBe(count + 1); // it stands: no later check reads the wrong one
    const id = r.snapshot().buildings!.at(-1)!.id;
    sim.finishSite(id);
    return id;
  };
  const forge = build(PAYER, own, 'forge'), camp = build(LORD, lord, 'camp'), idle = build(PAYER, own, 'forge');
  run(r, 2);
  r.setOaths([{ vassal: PAYER, lord: LORD, pct: 20 }]);
  expect(r.order(PAYER, { kind: 'setAccess', building: forge, share: 0.5 })).toBeNull();
  for (const [k, v] of Object.entries(smelt.inputs)) sim.addStock(0, k as never, v as number);
  const smith = sim.spawnSquad(`p:${STRANGER}`, 0, 'civ_smith', 1, x, y + 4, [makePerson('s', 'civ_smith', { level: 3 })]);
  run(r, 1);
  expect(r.order(STRANGER, { kind: 'civWork', squad: smith, building: forge })).toBeNull();
  run(r, 60);
  expect(r.order(STRANGER, { kind: 'craft', building: forge, recipe: smelt.id })).toBeNull();
  const at = () => r.snapshot().buildings!.find((b) => b.id === forge)!;
  run(r, 5000, () => !at().queue && !!at().tithe);
  expect(at().tithe?.[made]).toBeCloseTo(smelt.out.n * 0.5 * 0.2);
  return { r, sim, forge, camp, idle, x, y, at };
}
type F = ReturnType<typeof field>;
const carried = (f: F, ref: { squad: number } | { cart: number }) => f.sim.cargo(ref)!.slots.flatMap((s) => s.hold.lots).filter((l) => l.r === made && l.n > 1e-9);
const sum = (lots: { n: number }[]) => lots.reduce((a, l) => a + l.n, 0);
const held = (f: F, id: number) => { const b = f.r.snapshot().buildings!.find((x) => x.id === id)!; return (b.goods?.[made] ?? 0) + (b.tithe?.[made] ?? 0); };
const idle = (f: F, squad: number) => f.r.snapshot().squads[squad].order === 'hold';

describe('W-153 collecting from a building', () => {
  it('only the receiver\'s men, and only once they stand there; the coin of it adds up', () => {
    const f = field(), { r, sim, forge, x, y, at } = f, part = at().tithe![made]!, before = held(f, forge);
    // the payer's plain load and a stranger leave it alone
    const own = sim.spawnSquad(`p:${PAYER}`, 0, 'militia', 4, x, y + 3), other = sim.spawnSquad(`p:${STRANGER}`, 0, 'militia', 2, x, y + 3);
    run(r, 1);
    r.order(PAYER, { kind: 'load', squad: own, from: { building: forge } });
    r.order(STRANGER, { kind: 'load', squad: other, from: { building: forge } });
    run(r, 200, () => idle(f, own) && idle(f, other));
    expect(at().tithe?.[made]).toBeCloseTo(part);
    expect(sum(carried(f, { squad: other }))).toBe(0);
    expect(sum(carried(f, { squad: own }))).toBeCloseTo(before - part);
    // the receiver's men far off: nothing has moved yet
    const far = sim.spawnSquad(`p:${LORD}`, 0, 'militia', 2, x + 24, y + 3);
    run(r, 1);
    expect(r.order(LORD, { kind: 'load', squad: far, from: { building: forge } })).toBeNull();
    run(r, 3);
    expect(at().tithe?.[made]).toBeCloseTo(part);
    expect(sum(carried(f, { squad: far }))).toBe(0);
    // there: it is on their backs, unsealed, his
    run(r, 1500, () => idle(f, far));
    expect(at().tithe).toBeUndefined();
    const got = carried(f, { squad: far });
    expect(sum(got)).toBeCloseTo(part);
    expect(got.every((l) => l.s === undefined)).toBe(true);
    expect(held(f, forge) + sum(carried(f, { squad: own })) + sum(got)).toBeCloseTo(before);
  });
});

describe('W-153 a sealed send', () => {
  it('parses on the wire, travels with a cart, and lands only in the receiver\'s store, conserved', () => {
    expect(orderSchema.safeParse({ kind: 'load', squad: 1, from: { building: 1 }, send: true }).success).toBe(true);
    const f = field(), { r, sim, forge, camp, x, y, at } = f, part = at().tithe![made]!, inCamp = held(f, camp), before = held(f, forge) + inCamp;
    const crew = sim.spawnSquad(`p:${PAYER}`, 0, 'militia', 2, x, y + 5), cart = sim.spawnCart(0, `p:${PAYER}`, 'handcart', x, y + 4);
    run(r, 1);
    expect(r.order(PAYER, { kind: 'crew', squad: crew, siege: cart })).toBeNull();
    run(r, 20);
    expect(r.order(PAYER, { kind: 'load', squad: crew, from: { building: forge }, send: true })).toBeNull();
    run(r, 1500, () => idle(f, crew));
    expect(at().tithe).toBeUndefined();
    const load = carried(f, { cart });
    expect(sum(load)).toBeCloseTo(part);
    expect(load.every((l) => l.s === -LORD)).toBe(true);
    // the seal rides along: on the move it stays what it was
    const x0 = sim.cargo({ cart })!.slots[0].x;
    expect(r.order(PAYER, { kind: 'move', squad: crew, x: x + 4, y: y + 4 })).toBeNull();
    run(r, 200);
    expect(sim.cargo({ cart })!.slots[0].x).not.toBe(x0);
    expect(carried(f, { cart }).every((l) => l.s === -LORD)).toBe(true);
    // not back into his own forge
    expect(r.order(PAYER, { kind: 'unload', squad: crew, to: { building: forge } })).toBeNull();
    run(r, 1500, () => idle(f, crew));
    expect(sum(carried(f, { cart }))).toBeCloseTo(part);
    // the lord's camp takes it, plain goods there
    expect(r.order(PAYER, { kind: 'unload', squad: crew, to: { building: camp } })).toBeNull();
    run(r, 3000, () => idle(f, crew));
    expect(sum(carried(f, { cart }))).toBeCloseTo(0);
    const c = r.snapshot().buildings!.find((b) => b.id === camp)!;
    expect(c.goods?.[made]).toBeCloseTo(inCamp + part);
    expect(c.tithe).toBeUndefined();
    expect(held(f, forge) + held(f, camp)).toBeCloseTo(before);
  });
});

describe('W-153 what the room reports', () => {
  it('names only real buildings of the payer; both sides read it; a collected part leaves the list', async () => {
    const f = field(), { r, forge, camp, idle: empty, x, y } = f;
    const rows = r.titheReports();
    expect(rows.map((o) => o.building)).toEqual([forge]);
    expect(rows[0]).toMatchObject({ type: 'forge', payer: PAYER, receiver: LORD });
    const standing = r.snapshot().buildings!;
    for (const id of [forge, camp, empty]) expect(standing.some((b) => b.id === id && b.state !== 'destroyed')).toBe(true);
    expect(standing.find((b) => b.id === forge)!.owner).toBe(`p:${PAYER}`);
    expect(standing.find((b) => b.id === camp)!.tithe).toBeUndefined();
    expect(standing.find((b) => b.id === empty)!.tithe).toBeUndefined();

    // the view over D1: real players stand in for the room's ids
    const payer = (await devLogin(75_001)).playerId, lord = (await devLogin(75_002)).playerId, DB = env.DB!;
    await reportHeld(DB, 'test-ridge', rows.map((o) => ({ ...o, payer, receiver: lord })));
    expect(await owedBy(DB, payer)).toEqual([{ region: 'test-ridge', what: 'forge', goods: rows[0].goods }]);
    expect(await owedBy(DB, lord)).toEqual([]);

    const men = f.sim.spawnSquad(`p:${LORD}`, 0, 'militia', 2, x, y + 3);
    run(r, 1);
    r.order(LORD, { kind: 'load', squad: men, from: { building: forge } });
    run(r, 1500, () => r.titheReports().length === 0);
    expect(r.titheReports()).toEqual([]);
    await reportHeld(DB, 'test-ridge', []);
    expect(await owedBy(DB, payer)).toEqual([]);
  });
});
