import { describe, expect, inject, it } from 'vitest';
import { VerifyBody, replayBattle } from '../src/battle';
import { Battle } from '../../src/sim/battle';
import { generateBattlefield } from '../../src/world/battlefield';
import { api, devLogin } from './helpers';

const fx = inject('battleFixture');

describe('battle verification', () => {
  it('the fixture is a real, finished battle with human orders', () => {
    expect(fx.ticks).toBeGreaterThan(100);
    expect(fx.orders.some((o) => o.side === 0)).toBe(true);
  });

  it('replays identically inside workerd (adapter)', () => {
    const out = replayBattle(fx.setup, fx.orders, fx.deployOrders);
    expect(out.summary).toMatchObject({ winner: fx.winner, ticks: fx.ticks, hash: fx.hash });
    // Deterministic across runs in the same isolate too.
    expect(replayBattle(fx.setup, fx.orders, fx.deployOrders).summary.hash).toBe(fx.hash);
  });

  it('keeps the terrain grid through validation and replays a battle on it', () => {
    const setup = { ...fx.setup, terrain: generateBattlefield(9, { base: 'hills', river: true, coast: false, rocky: true, woods: 0.3 }) };
    const b = new Battle(JSON.parse(JSON.stringify(setup)));
    b.startBattle();
    for (let t = 0; t < 20 * 400 && b.phase !== 'ended'; t++) b.step();
    const parsed = VerifyBody.parse({ setup, orders: [], claim: { winner: b.winner ?? -1, ticks: b.tick } });
    expect(parsed.setup.terrain?.cells).toBe(setup.terrain.cells);
    const out = replayBattle(parsed.setup as unknown as typeof fx.setup, []);
    expect(out.summary).toMatchObject({ ticks: b.tick, hash: b.hash() });
    // without the grid it is a different battle
    expect(replayBattle(fx.setup, []).summary.hash).not.toBe(b.hash());
  });

  it('POST /api/battle/verify accepts the honest claim', async () => {
    const { token } = await devLogin(4001);
    const res = await api('/api/battle/verify', {
      method: 'POST',
      token,
      json: { setup: fx.setup, orders: fx.orders, deployOrders: fx.deployOrders, claim: { winner: fx.winner, ticks: fx.ticks, hash: fx.hash } },
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ match: boolean; mismatches: string[]; server: { ticks: number; hash: string }; ticksSimulated: number; elapsedMs: number }>();
    expect(body.mismatches).toEqual([]);
    expect(body.match).toBe(true);
    expect(body.server).toMatchObject({ ticks: fx.ticks, hash: fx.hash });
    expect(typeof body.elapsedMs).toBe('number');
  });

  it('flags a forged claim and a tampered order log', async () => {
    const { token } = await devLogin(4002);
    const forgedWinner = fx.winner === 0 ? 1 : 0;
    const forged = await api('/api/battle/verify', {
      method: 'POST',
      token,
      json: { setup: fx.setup, orders: fx.orders, deployOrders: fx.deployOrders, claim: { winner: forgedWinner, ticks: fx.ticks } },
    });
    const fb = await forged.json<{ match: boolean; mismatches: string[] }>();
    expect(fb.match).toBe(false);
    expect(fb.mismatches.join()).toContain('winner');

    const tampered = await api('/api/battle/verify', {
      method: 'POST',
      token,
      json: { setup: fx.setup, orders: [], claim: { winner: fx.winner, ticks: fx.ticks, hash: fx.hash } },
    });
    expect((await tampered.json<{ match: boolean }>()).match).toBe(false);
  });

  it('validates the request', async () => {
    const { token } = await devLogin(4003);
    const bad = await api('/api/battle/verify', { method: 'POST', token, json: { setup: { seed: 1 }, orders: [], claim: { winner: 0, ticks: 1 } } });
    expect(bad.status).toBe(400);
    expect((await api('/api/battle/verify', { method: 'POST', json: {} })).status).toBe(401);
  });
});
