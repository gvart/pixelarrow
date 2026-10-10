import { describe, expect, inject, it } from 'vitest';
import { VerifyBody, replayBattle } from '../src/battle';
import { Battle } from '../../src/sim/battle';
import { DOCTRINE_IDS, type BattleSetup, type DoctrineId } from '../../src/sim/types';

const fx = inject('battleFixture');
const SIM_V2 = 2;

/** The fixture's battle with the bot side fighting under `doctrine`. */
function withDoctrine(doctrine?: DoctrineId): BattleSetup {
  const setup = JSON.parse(JSON.stringify(fx.setup)) as BattleSetup;
  if (doctrine) setup.armies[1].doctrine = doctrine;
  else delete setup.armies[1].doctrine;
  return setup;
}

/** A client's run: today's sim stepped by hand, the fixture's human orders issued on their ticks. */
function play(setup: BattleSetup): Battle {
  const b = new Battle(JSON.parse(JSON.stringify(setup)));
  const nDeploy = fx.deployOrders ?? 0;
  for (const o of fx.orders.slice(0, nDeploy)) if (o.side === 0) b.issue(0, o.order);
  b.startBattle();
  const later = fx.orders.slice(nDeploy).filter((o) => o.side === 0);
  let i = 0;
  while (b.phase !== 'ended' && b.tick <= b.timeLimitTicks) {
    while (i < later.length && later[i].tick === b.tick) b.issue(0, later[i++].order);
    b.step();
  }
  return b;
}

describe('doctrines on the server (ai-doctrines.md, AI-01)', () => {
  it('keeps the doctrine and the captain through validation', () => {
    const setup = withDoctrine('hammer');
    setup.armies[1].units[0].captain = true;
    const parsed = VerifyBody.parse({ setup, orders: [], claim: { winner: 0, ticks: 1 } });
    expect(parsed.setup.armies[1].doctrine).toBe('hammer');
    expect(parsed.setup.armies[1].units[0].captain).toBe(true);
    // missing = steady / false
    const plain = VerifyBody.parse({ setup: withDoctrine(), orders: [], claim: { winner: 0, ticks: 1 } });
    expect(plain.setup.armies[1].doctrine).toBe('steady');
    expect(plain.setup.armies[1].units[0].captain).toBe(false);
  });

  it('refuses an unknown doctrine', () => {
    const bad = withDoctrine() as unknown as { armies: { doctrine?: string }[] };
    bad.armies[1].doctrine = 'berserker';
    expect(VerifyBody.safeParse({ setup: bad, orders: [], claim: { winner: 0, ticks: 1 } }).success).toBe(false);
  });

  it('replays every doctrine on v2 to the hash of a local run, after validation', () => {
    const hashes = new Set<string>();
    for (const id of DOCTRINE_IDS) {
      const setup = withDoctrine(id);
      const local = play(setup);
      const parsed = VerifyBody.parse({ setup, orders: fx.orders, claim: { winner: local.winner ?? -1, ticks: local.tick } });
      const server = replayBattle(parsed.setup as unknown as BattleSetup, fx.orders, fx.deployOrders, SIM_V2).summary;
      expect(server).toMatchObject({ winner: local.winner, ticks: local.tick, hash: local.hash() });
      hashes.add(server.hash);
    }
    // the doctrine is part of the rules: different doctrines, different battles
    expect(hashes.size).toBeGreaterThan(1);
  });

  it('a setup without a doctrine replays like steady on v2', () => {
    const a = replayBattle(withDoctrine(), fx.orders, fx.deployOrders, SIM_V2).summary.hash;
    const b = replayBattle(withDoctrine('steady'), fx.orders, fx.deployOrders, SIM_V2).summary.hash;
    expect(b).toBe(a);
  });

  it('the v1 fixture still replays on the frozen v1 sim, doctrine or not', () => {
    expect(replayBattle(fx.setup, fx.orders, fx.deployOrders, 1).summary).toMatchObject({ winner: fx.winner, ticks: fx.ticks, hash: fx.hash });
    // v1 has no doctrines: the field is ignored there
    expect(replayBattle(withDoctrine('fury'), fx.orders, fx.deployOrders, 1).summary.hash).toBe(fx.hash);
  });
});
