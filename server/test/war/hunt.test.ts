/**
 * W-146 the hunt contract (docs/WAR.md "Hand-offs, contracts, letters"): posted at a town his men stand in, the reward out
 * of his home strongroom in escrow; open to a warrior of his alliance; paid when the named lair or chief falls to the
 * taker's men; back to the poster at the deadline.
 */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { api, devLogin } from '../helpers';
import { good, setGood } from './goods';
import { huntDeeds, postContract, settleContract, takeContract } from '../../src/war/contracts';
import { joinAlliance } from '../../src/war/world/members';
import { WAR_SEASON } from '../../../src/war/world/alliances';
import type { PathId } from '../../../src/war/world/start';

const DB = () => env.DB!;
const TOWN = 'dodona', HOUR = 3_600_000;
const NOW = Date.UTC(2031, 0, 6, 12);
const code = (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code ?? String(e));

async function who(id: number, path: PathId, alliance = 0) {
  const me = await devLogin(id);
  await joinAlliance(DB(), me.playerId, alliance as never, NOW, WAR_SEASON.id);
  await DB().prepare('UPDATE war_alliance_members SET path = ?1 WHERE player_id = ?2').bind(path, me.playerId).run();
  await api('/api/war/roster', { token: me.token });
  return me.playerId;
}
const stand = (pid: number, town: string) => DB().prepare("INSERT INTO war_persons (id, player_id, state, region) VALUES (?1, ?2, 'active', ?3)").bind(`hunt-${pid}-${town}`, pid, town).run();
const hunt = (pid: number, target: string, reward = 120, deadline = NOW + 48 * HOUR) => postContract(DB(), pid, TOWN, { kind: 'hunt', toTown: TOWN, reward, target, deadline }, -1, NOW);

describe('posting a hunt', () => {
  it('needs his men at the town, a named target and the coin; the reward leaves his strongroom', async () => {
    const b = await who(9701, 'builder');
    await setGood(b, 'coin', 200);
    expect(await code(hunt(b, 'lair:3'))).toBe('not_present');
    await stand(b, TOWN);
    expect(await code(hunt(b, 'nobody'))).toBe('bad_request');
    expect(await code(hunt(b, 'lair:3', 500))).not.toBe('ok');
    const id = await hunt(b, 'lair:3');
    expect(await good(b, 'coin')).toBe(80);
    expect(await settleContract(DB(), id, NOW)).toMatchObject({ kind: 'hunt', state: 'open', target: 'lair:3', region: TOWN, reward: 120 });
  });
});

describe('taking and paying a hunt', () => {
  it('only a warrior of his alliance, not himself', async () => {
    const b = await who(9711, 'builder'), w = await who(9712, 'warrior'), t = await who(9713, 'trader'), far = await who(9714, 'warrior', 1);
    await setGood(b, 'coin', 200);
    await stand(b, TOWN);
    const id = await hunt(b, 'chief:boar');
    expect(await code(takeContract(DB(), b, id, NOW))).toBe('own_contract');
    expect(await code(takeContract(DB(), t, id, NOW))).toBe('not_warrior');
    expect(await code(takeContract(DB(), far, id, NOW))).toBe('not_ally');
    expect(await code(takeContract(DB(), w, id, NOW))).toBe('ok');
  });

  it('the named lair falling to the taker pays him; another deed or another man\'s pays nothing', async () => {
    const b = await who(9721, 'builder'), w = await who(9722, 'warrior'), other = await who(9723, 'warrior');
    await setGood(b, 'coin', 200);
    await setGood(w, 'coin', 0);
    await stand(b, TOWN);
    const id = await hunt(b, 'lair:3');
    await takeContract(DB(), w, id, NOW);
    expect(await huntDeeds(env, w, TOWN, [{ kind: 'lair', key: '4' }, { kind: 'chief', key: '3' }], NOW)).toBe(0);
    expect(await huntDeeds(env, other, TOWN, [{ kind: 'lair', key: '3' }], NOW)).toBe(0);
    expect(await huntDeeds(env, w, 'dodona-e', [{ kind: 'lair', key: '3' }], NOW)).toBe(0);
    expect((await settleContract(DB(), id, NOW)).state).toBe('taken');
    expect(await huntDeeds(env, w, TOWN, [{ kind: 'lair', key: '3' }], NOW)).toBe(120);
    expect(await good(w, 'coin')).toBe(120);
    expect((await settleContract(DB(), id, NOW)).state).toBe('done');
    expect(await huntDeeds(env, w, TOWN, [{ kind: 'lair', key: '3' }], NOW)).toBe(0);
  });

  it('the deadline passing: the reward back to the poster\'s strongroom, taken or not', async () => {
    const b = await who(9731, 'builder'), w = await who(9732, 'warrior');
    await setGood(b, 'coin', 200);
    await stand(b, TOWN);
    const open = await hunt(b, 'lair:1'), taken = await hunt(b, 'lair:2', 60);
    await takeContract(DB(), w, taken, NOW);
    const after = NOW + 49 * HOUR;
    expect((await settleContract(DB(), open, after)).state).not.toBe('open');
    expect((await settleContract(DB(), taken, after)).state).not.toBe('taken');
    expect(await good(b, 'coin')).toBe(200);
    expect(await huntDeeds(env, w, TOWN, [{ kind: 'lair', key: '2' }], after)).toBe(0);
  });
});
