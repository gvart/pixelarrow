/**
 * M6i anti-abuse (docs/WAR.md "Season score and anti-abuse"), each block with two seeded accounts: linked accounts
 * (a shared IP or device within 7 days) cannot hand off, fill, contract or capture carts from each other; one-sided
 * hand-offs only within an alliance, at most 300 coin a day to a receiver whose account is 48 h old and has fought.
 */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { devLogin } from '../helpers';
import { ABUSE, contractRefusal, handoffDone, handoffRefusal, linked, linkedCaptures, noteSeen } from '../../src/war/abuse';
import { fillHook } from '../../src/war/tradeScore';
import type { HandoffWindow } from '../../src/war/room';
import type { Env } from '../../src/env';

const DB = () => env.DB!;
const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code ?? String(e));
const ally = (pid: number, a: number) => DB().prepare('INSERT OR REPLACE INTO war_alliance_members (season, player_id, alliance, joined_at) VALUES (1, ?1, ?2, 0)').bind(pid, a).run();
const win = (a: number, b: number, ga: Record<string, number>, gb: Record<string, number>): HandoffWindow =>
  ({ a, b, halves: { [a]: { from: { squad: 0 }, goods: ga, uids: [] }, [b]: { from: { squad: 1 }, goods: gb, uids: [] } }, ok: [a, b], until: 0 });

describe('linked accounts', () => {
  it('a shared address or device blocks hand-offs, fills, contracts and cart captures between them', async () => {
    const a = await devLogin(8401), b = await devLogin(8402), c = await devLogin(8403), now = Date.now();
    await noteSeen(DB(), a.playerId, '10.0.0.1', null, now);
    await noteSeen(DB(), b.playerId, '10.0.0.1', null, now - 3 * 86_400_000);
    await noteSeen(DB(), c.playerId, '10.0.0.2', 'dev-c', now);
    expect(await linked(DB(), a.playerId, b.playerId, now)).toBe(true);
    expect(await linked(DB(), a.playerId, c.playerId, now)).toBe(false);
    expect(await linked(DB(), a.playerId, b.playerId, now + ABUSE.linkMs)).toBe(false); // seven days on
    // a shared device links too
    await noteSeen(DB(), a.playerId, null, 'dev-c', now);
    expect(await linked(DB(), a.playerId, c.playerId, now)).toBe(true);
    // each block
    expect(await handoffRefusal(DB(), win(a.playerId, b.playerId, { iron: 1 }, { coin: 5 }), now)).toBe('linked accounts');
    expect(await code(contractRefusal(DB(), a.playerId, b.playerId, now))).toBe('linked');
    expect(await code(fillHook(env as unknown as Env)({ town: 'kleisoura', seller: a.playerId, buyer: b.playerId, lots: [], coin: 10, now }))).toBe('linked');
    const caps = [{ cart: 3, from: `p:${a.playerId}`, team: 0, to: `p:${b.playerId}` }, { cart: 4, from: `p:${b.playerId}`, team: 1, to: 'bot:1' }];
    expect(await linkedCaptures(DB(), caps, now)).toEqual([caps[0]]);
  });
});

describe('one-sided hand-offs', () => {
  it('only within an alliance, to a 48 h old account that fought, at most 300 coin a day', async () => {
    const g = await devLogin(8411), r = await devLogin(8412), now = Date.now();
    const gift = (coin: number) => win(g.playerId, r.playerId, { coin }, {});
    await ally(g.playerId, 0);
    await ally(r.playerId, 1);
    expect(await handoffRefusal(DB(), gift(50), now)).toMatch(/within an alliance/);
    expect(await handoffRefusal(DB(), win(g.playerId, r.playerId, { coin: 50 }, { iron: 1 }), now)).toBeNull(); // a trade, not a gift
    await ally(r.playerId, 0);
    expect(await handoffRefusal(DB(), gift(50), now)).toMatch(/too new/);
    await DB().prepare('UPDATE players SET created_at = ?2 WHERE id = ?1').bind(r.playerId, now - ABUSE.ageMs - 1).run();
    expect(await handoffRefusal(DB(), gift(50), now)).toMatch(/not fought/);
    await DB().prepare('INSERT INTO war_player_stats (season, player_id, fights) VALUES (1, ?1, 1)').bind(r.playerId).run();
    expect(await handoffRefusal(DB(), gift(250), now)).toBeNull();
    await handoffDone(DB(), gift(250), { [g.playerId]: { lots: [{ r: 'coin', n: 250, o: 'home' }], items: [] } }, now);
    expect(await handoffRefusal(DB(), gift(51), now)).toMatch(/300 coin/);
    expect(await handoffRefusal(DB(), gift(50), now)).toBeNull();
  });
});
