/**
 * ST-04: sim train 2 closes. Every battle of the v2 replay fixtures
 * (tests/fixtures/replay-v2*.json, recorded in Node by tests/trainReplay.test.ts)
 * replays inside workerd to the client's hash, through zod and REPLAYERS[2],
 * and the hash agrees with the recorded one at every checkpoint (every 100
 * ticks), so a cross-engine drift would show where it starts.
 *
 * Covered: face, focus, orb, feint, every signature active, the Standard
 * (raised and lost), cohesion, army break, each doctrine on the ladder
 * (holdField) and on the war map, a war retreat, and offline field works with
 * a band captain. The all-features log also goes through POST /api/battle/verify.
 */
import { describe, expect, it } from 'vitest';
import { replayBattle, VerifyBody } from '../src/battle';
import { MIN_SIM_VERSION } from '../src/simVersion';
import { Battle } from '../../src/sim/battle';
import { SIM_VERSION } from '../../src/sim/version';
import type { BattleSetup, LoggedOrder } from '../../src/sim/types';
import online from '../../tests/fixtures/replay-v2.json';
import offline from '../../tests/fixtures/replay-v2-offline.json';
import { api, devLogin } from './helpers';

interface RecordedBattle {
  name: string;
  kind: 'ladder' | 'war' | 'offline';
  setup: BattleSetup;
  orders: LoggedOrder[];
  deployOrders: number;
  winner: 0 | 1 | -1;
  retreated: 0 | 1 | null;
  ticks: number;
  hash: string;
  checkpoints: [number, string][];
  coverage: { orders: string[]; abilities: string[]; events: string[]; doctrine: string; holdField: boolean; captain: boolean; works: number };
}

const CHECKPOINT = 100;
const ONLINE = (online as unknown as { simVersion: number; battles: RecordedBattle[] });
const OFFLINE = (offline as unknown as { simVersion: number; battles: RecordedBattle[] });
const ALL = [...ONLINE.battles, ...OFFLINE.battles];

function claimOf(rec: RecordedBattle) {
  return { simVersion: SIM_VERSION, setup: rec.setup, orders: rec.orders, deployOrders: rec.deployOrders, claim: { winner: rec.winner, ticks: rec.ticks, retreated: rec.retreated, hash: rec.hash } };
}

/** The hash every CHECKPOINT ticks, replayed the way replayBattle feeds orders (deploy orders first, then each at its tick). */
function checkpoints(rec: RecordedBattle): [number, string][] {
  const b = new Battle(JSON.parse(JSON.stringify(rec.setup)) as BattleSetup);
  const orders = rec.orders.map((o, i) => ({ ...o, i }));
  for (const o of orders.slice(0, rec.deployOrders)) b.issue(o.side, o.order);
  const battle = orders.slice(rec.deployOrders).sort((x, y) => x.tick - y.tick || x.i - y.i);
  b.startBattle();
  const out: [number, string][] = [];
  let next = 0;
  while (b.phase !== 'ended' && b.tick <= b.timeLimitTicks + 1) {
    while (next < battle.length && battle[next].tick === b.tick) b.issue(battle[next].side, battle[next++].order);
    if (b.phase === 'ended') break;
    b.step();
    b.drainEvents();
    if (b.tick % CHECKPOINT === 0) out.push([b.tick, b.hash()]);
  }
  return out;
}

describe('sim train 2 replay fixtures in workerd (ST-04)', () => {
  it('the fixtures are SIM_VERSION 2, the version this server takes for new tickets', () => {
    expect(ONLINE.simVersion).toBe(SIM_VERSION);
    expect(OFFLINE.simVersion).toBe(SIM_VERSION);
    expect(MIN_SIM_VERSION).toBe(SIM_VERSION);
    expect(ALL.length).toBeGreaterThanOrEqual(13);
  });

  it.each(ALL.map((b) => [b.name, b] as const))('%s replays through zod to the client hash', (_n, rec) => {
    const parsed = VerifyBody.parse(claimOf(rec));
    const out = replayBattle(parsed.setup as unknown as BattleSetup, parsed.orders as LoggedOrder[], parsed.deployOrders, parsed.simVersion ?? 1).summary;
    expect(out).toMatchObject({ winner: rec.winner, ticks: rec.ticks, retreated: rec.retreated, hash: rec.hash });
  });

  it.each(ALL.map((b) => [b.name, b] as const))('%s matches the Node hash at every checkpoint', (_n, rec) => {
    expect(checkpoints(rec)).toEqual(rec.checkpoints);
  });

  it('the logs carry every train-2 feature (order kinds, actives, the Standard, events, doctrines)', () => {
    const has = (f: (b: RecordedBattle) => string[], x: string) => ALL.some((b) => f(b).includes(x));
    for (const k of ['face', 'focus', 'feint', 'orb', 'work', 'unwork']) expect(has((b) => b.coverage.orders, k), k).toBe(true);
    for (const a of ['push', 'bond', 'warcry', 'sunder', 'aimed', 'recharge', 'scythe', 'standard']) expect(has((b) => b.coverage.abilities, a), a).toBe(true);
    for (const e of ['cohesion', 'disordered', 'armyBreak', 'standardLost', 'stakesBreak', 'retreat']) expect(has((b) => b.coverage.events, e), e).toBe(true);
    for (const d of ['steady', 'rush', 'hammer', 'swarm', 'fury']) {
      expect(ALL.some((b) => b.kind === 'ladder' && b.setup.armies[1].doctrine === d && b.setup.armies[1].holdField === true), `ladder ${d}`).toBe(true);
      expect(ALL.some((b) => b.kind === 'war' && b.setup.armies[1].doctrine === d && !b.setup.armies[1].holdField), `war ${d}`).toBe(true);
    }
    expect(ALL.some((b) => b.setup.armies.some((a) => a.units.some((u) => u.captain === true)))).toBe(true);
  });

  it('a tampered all-features log does not replay to the claim', () => {
    const rec = ONLINE.battles[0];
    const orders = rec.orders.filter((o) => !(o.order.kind === 'order' && o.order.order === 'feint'));
    const out = replayBattle(rec.setup, orders, rec.deployOrders, SIM_VERSION).summary;
    expect(out.hash).not.toBe(rec.hash);
  });

  it.each([ONLINE.battles[0], OFFLINE.battles[0]].map((b) => [b.name, b] as const))('POST /api/battle/verify accepts %s', async (_n, rec) => {
    const { token } = await devLogin(4404 + rec.orders.length);
    const res = await api('/api/battle/verify', { method: 'POST', token, json: claimOf(rec) });
    expect(res.status).toBe(200);
    const body = await res.json<{ match: boolean; simVersion: number; mismatches: string[]; server: { hash: string } }>();
    expect(body.mismatches).toEqual([]);
    expect(body).toMatchObject({ match: true, simVersion: SIM_VERSION, server: { hash: rec.hash } });
  });
});
