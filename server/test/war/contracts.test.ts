/**
 * M6g (docs/WAR.md "Hand-offs, contracts, letters"): the live hand-off window swaps at once and fails when a unit
 * walks off; the Broker's escrowed hand-off; carry contracts with sealed loads delivered only at B; supply and expiry
 * refunds; letters of credit redeemed once, by their buyer, at B.
 */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { api, devLogin } from '../helpers';
import { setGood } from './goods';
import { goodsOf, putStmt } from '../../src/war/holders';
import { rentSite, stallId, warehouseId } from '../../src/war/market';
import { buyLetter, deliver, dropHalf, offerLetter, postContract, postDeal, redeemLetter, sealedFor, settleContract, settleDeal, takeContract, DEAL } from '../../src/war/contracts';
import { HANDOFF, WarRoom } from '../../src/war/room';
import { warRegion } from '../../src/war/regions';
import { NET_VERSION, type ServerMsg } from '../../../src/war/net/protocol';
const CARRY = 10;

const DB = () => env.DB!;
const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code ?? String(e));
const give = (holder: string, res: string, n: number, origin = 'dodona') => DB().batch([putStmt(DB(), holder, res, n, origin)]);
const present = (pid: number, town: string) => DB().prepare("INSERT OR REPLACE INTO war_persons (id, player_id, state, region) VALUES (?1, ?2, 'active', ?3)").bind(`pr-${pid}-${town}`, pid, town).run();
const merchant = (pid: number, perks: string[]) =>
  DB().prepare("INSERT INTO war_persons (id, player_id, cls, state, perks) VALUES (?1, ?2, 'merchant', 'active', ?3)").bind(`m-${pid}`, pid, JSON.stringify(perks)).run();
const MASTER = ['trader', 'packer', 'contracts', 'broker', 'banker'];

async function trader(n: number) {
  const p = await devLogin(n);
  await api('/api/war/roster', { token: p.token });
  await setGood(p.playerId, 'coin', 500);
  return p;
}

describe('the hand-off window', () => {
  it('both confirm within the window, near each other: swapped at once; walking off fails it', () => {
    const r = new WarRoom({ region: warRegion('test-ridge')!, seed: 1, cap: 600 });
    const j = (pid: number, team: number) => (r.join(pid, { t: 'join', v: NET_VERSION, region: 'test-ridge', playerId: pid, team, army: [{ cls: 'militia', count: 2 }] }).msg as Extract<ServerMsg, { t: 'welcome' }>).squads[0];
    const a = j(1, 0), b = j(2, 0);
    r.tick();
    // stand them side by side
    const ua = r.sim.cargo({ squad: a })!, ub = r.sim.cargo({ squad: b })!;
    r.giveCargo(1, { squad: a }, { lots: [{ r: 'iron', n: 10, o: 'dodona' }], items: [] });
    r.giveCargo(2, { squad: b }, { lots: [{ r: 'coin', n: 100, o: 'siren' }], items: [] });
    const far = Math.hypot(ua.slots[0].x - ub.slots[0].x, ua.slots[0].y - ub.slots[0].y) > HANDOFF.reach;
    if (far) {
      r.sim.order({ kind: 'move', squad: b, x: ua.slots[0].x + 1, y: ua.slots[0].y });
      for (let t = 0; t < 400; t++) r.tick();
    }
    expect(r.handoff(1, 2, 'offer', { from: { squad: a }, goods: { iron: 10 }, uids: [] })).toMatchObject({ ready: false });
    expect(r.handoff(1, 2, 'confirm')).toMatchObject({ error: 'bad' }); // both halves first
    expect(r.handoff(2, 1, 'offer', { from: { squad: b }, goods: { coin: 100 }, uids: [] })).toMatchObject({ ready: false });
    expect(r.handoff(1, 2, 'confirm')).toMatchObject({ ready: false });
    expect(r.handoff(2, 1, 'confirm')).toMatchObject({ ready: true });
    const s = r.swapHandoff(1, 2);
    expect(s).toMatchObject({ ok: true });
    expect(r.takeCargo(1, { squad: a }, { coin: 100 })).not.toBeNull();
    expect(r.takeCargo(2, { squad: b }, { iron: 10 })).not.toBeNull();
    // again; then b walks off before the swap: nothing moves
    r.giveCargo(1, { squad: a }, { lots: [{ r: 'iron', n: 5, o: 'dodona' }], items: [] });
    r.handoff(1, 2, 'offer', { from: { squad: a }, goods: { iron: 5 }, uids: [] });
    r.handoff(2, 1, 'offer', { from: { squad: b }, goods: {}, uids: [] });
    r.handoff(1, 2, 'confirm');
    r.handoff(2, 1, 'confirm');
    r.sim.order({ kind: 'move', squad: b, x: ua.slots[0].x + 40, y: ua.slots[0].y });
    for (let t = 0; t < 300; t++) r.tick();
    expect(r.swapHandoff(1, 2)).toEqual({ error: 'walked off' });
    expect(r.takeCargo(1, { squad: a }, { iron: 5 })).not.toBeNull(); // still his
    // a window lapses after HANDOFF.ticks
    r.handoff(1, 2, 'offer', { from: { squad: a }, goods: {}, uids: [] });
    for (let t = 0; t <= HANDOFF.ticks; t++) r.tick();
    expect(r.openHandoffs()).toEqual([]);
  });
});

describe('escrowed hand-off (Broker)', () => {
  it('each drops its half when it can; both in: swapped; otherwise refunded after 48 h', async () => {
    const br = await trader(8201), a = await trader(8202), b = await trader(8203), now = Date.now(), T = 'kleisoura';
    expect(await code(postDeal(DB(), a.playerId, T, br.playerId, b.playerId, { iron: 5 }, { coin: 50 }, now))).toBe('no_broker');
    await merchant(br.playerId, MASTER);
    await rentSite(DB(), br.playerId, T, 'stall', -1, now);
    for (const p of [a, b]) await rentSite(DB(), p.playerId, T, 'warehouse', -1, now);
    await give(warehouseId(T, a.playerId), 'iron', 5);
    await give(warehouseId(T, b.playerId), 'coin', 50);
    const id = await postDeal(DB(), a.playerId, T, br.playerId, b.playerId, { iron: 5 }, { coin: 50 }, now);
    expect(await dropHalf(DB(), a.playerId, id, now)).toBe('open');
    expect(await goodsOf(DB(), `dl:${id}:a`)).toEqual({ iron: 5 });
    expect(await code(dropHalf(DB(), a.playerId, id, now))).toBe('in_already');
    expect(await dropHalf(DB(), b.playerId, id, now)).toBe('done');
    expect(await goodsOf(DB(), warehouseId(T, a.playerId))).toEqual({ coin: 50 });
    expect(await goodsOf(DB(), warehouseId(T, b.playerId))).toEqual({ iron: 5 });
    // a second: only one side drops; 48 h on it is refunded
    await give(warehouseId(T, a.playerId), 'iron', 3);
    const id2 = await postDeal(DB(), a.playerId, T, br.playerId, b.playerId, { iron: 3 }, { coin: 30 }, now);
    await dropHalf(DB(), a.playerId, id2, now);
    expect(await settleDeal(DB(), id2, now + DEAL.ms)).toBe('refunded');
    expect((await goodsOf(DB(), warehouseId(T, a.playerId))).iron).toBe(3);
  });
});

describe('contracts', () => {
  it('a carry seals its loads: they unload only at B; delivered, reward and deposit go to the carrier', async () => {
    const po = await trader(8211), ca = await trader(8212), now = Date.now(), A = 'kleisoura', B = 'ammos';
    await rentSite(DB(), po.playerId, A, 'stall', -1, now);
    await rentSite(DB(), po.playerId, B, 'warehouse', -1, now);
    await rentSite(DB(), ca.playerId, A, 'warehouse', -1, now);
    await give(stallId(A, po.playerId), 'coin', 100);
    await give(stallId(A, po.playerId), 'iron', 10);
    const c = { kind: 'carry' as const, toTown: B, reward: 40, res: 'iron', n: 10, value: 200, deadline: now + 3_600_000 };
    expect(await code(postContract(DB(), po.playerId, A, c, -1, now))).toBe('no_contracts');
    await merchant(po.playerId, MASTER);
    const id = await postContract(DB(), po.playerId, A, c, -1, now);
    expect(await goodsOf(DB(), stallId(A, po.playerId))).toEqual({ coin: 60 });
    // the carrier escrows half the declared value
    expect(await code(takeContract(DB(), ca.playerId, id, now))).toBe('no_coin');
    await give(warehouseId(A, ca.playerId), 'coin', 100);
    await takeContract(DB(), ca.playerId, id, now);
    expect(await goodsOf(DB(), `ct:${id}:d`)).toEqual({ coin: 100 });
    // he loads the sealed goods at A (not elsewhere)
    expect(await code(sealedFor(DB(), ca.playerId, id, B, now))).toBe('wrong_town');
    const s = await sealedFor(DB(), ca.playerId, id, A, now);
    expect(s.lots).toEqual([{ res: 'iron', origin: 'dodona', seal: id, amount: 10 }]);
    // in the room the sealed lots never unload into a holder and are taken out only under their seal
    const r = new WarRoom({ region: warRegion('test-ridge')!, seed: 1, cap: 600 });
    const sq = (r.join(ca.playerId, { t: 'join', v: NET_VERSION, region: 'test-ridge', playerId: ca.playerId, team: 0, army: [{ cls: 'militia', count: 1 }] }).msg as Extract<ServerMsg, { t: 'welcome' }>).squads[0];
    r.tick();
    r.giveCargo(ca.playerId, { squad: sq }, { lots: [{ r: 'iron', n: CARRY, o: 'dodona', s: id }], items: [] });
    expect(r.takeCargo(ca.playerId, { squad: sq }, { iron: 1 })).toBeNull();
    const taken = r.takeCargo(ca.playerId, { squad: sq }, { iron: CARRY }, [], id)!;
    expect(taken.lots[0]).toMatchObject({ s: id });
    // delivered at A: refused; at B: into the poster's warehouse, then paid
    expect((await deliver(DB(), ca.playerId, id, A, [{ res: 'iron', origin: 'dodona', seal: 0, amount: 10 }], now)).refused).toMatch(/ammos/);
    const d = await deliver(DB(), ca.playerId, id, B, [{ res: 'iron', origin: 'dodona', seal: 0, amount: 10 }], now);
    expect(d.done).toBe(true);
    await DB().batch(d.stmts);
    expect(await goodsOf(DB(), warehouseId(B, po.playerId))).toEqual({ iron: 10 });
    expect((await goodsOf(DB(), `sr:${ca.playerId}`)).coin).toBe(500 + 40 + 100); // no warehouse at B: his strongroom
  });

  it('an expired contract refunds its reward (and a carry\'s deposit) to the poster', async () => {
    const po = await trader(8221), tk = await trader(8222), now = Date.now(), A = 'stymphalia';
    await merchant(po.playerId, MASTER);
    await rentSite(DB(), po.playerId, A, 'stall', -1, now);
    await rentSite(DB(), po.playerId, A, 'warehouse', -1, now);
    await give(stallId(A, po.playerId), 'coin', 30);
    const id = await postContract(DB(), po.playerId, A, { kind: 'supply', toTown: A, reward: 30, res: 'wood', n: 50, deadline: now + 1000 }, -1, now);
    await takeContract(DB(), tk.playerId, id, now);
    expect((await settleContract(DB(), id, now + 1000)).state).toBe('expired');
    expect((await goodsOf(DB(), warehouseId(A, po.playerId))).coin).toBe(30);
    expect((await deliver(DB(), tk.playerId, id, A, [{ res: 'wood', origin: 'x', seal: 0, amount: 50 }], now + 2000)).refused).toBeTruthy();
  });
});

describe('letters of credit', () => {
  it('a letter is named to its buyer and redeems once, only by him, only at B', async () => {
    const bk = await trader(8231), by = await trader(8232), thief = await trader(8233), now = Date.now(), A = 'achelous', B = 'kleisoura';
    await merchant(bk.playerId, MASTER);
    await rentSite(DB(), bk.playerId, A, 'stall', -1, now);
    await rentSite(DB(), bk.playerId, B, 'warehouse', -1, now);
    await give(warehouseId(B, bk.playerId), 'coin', 300);
    expect(await code(offerLetter(DB(), bk.playerId, A, B, 300, 15, -1, now))).toBe('stall_level');
    await DB().prepare('UPDATE war_holders SET level = 3 WHERE id = ?1').bind(stallId(A, bk.playerId)).run();
    expect(await code(offerLetter(DB(), bk.playerId, A, B, 600, 15, -1, now))).toBe('letter_max');
    const id = await offerLetter(DB(), bk.playerId, A, B, 300, 15, -1, now);
    expect(await goodsOf(DB(), `lc:${id}`)).toEqual({ coin: 300 });
    await rentSite(DB(), by.playerId, A, 'warehouse', -1, now);
    await rentSite(DB(), by.playerId, B, 'warehouse', -1, now);
    await give(warehouseId(A, by.playerId), 'coin', 315);
    await present(by.playerId, A);
    await buyLetter(DB(), by.playerId, id, now);
    expect((await goodsOf(DB(), stallId(A, bk.playerId))).coin).toBe(315);
    // only its buyer, only at B
    await present(thief.playerId, B);
    expect(await code(redeemLetter(DB(), thief.playerId, id, now))).toBe('not_yours');
    expect(await code(redeemLetter(DB(), by.playerId, id, now))).toBe('not_present');
    await present(by.playerId, B);
    expect(await redeemLetter(DB(), by.playerId, id, now)).toBe(300);
    expect((await goodsOf(DB(), warehouseId(B, by.playerId))).coin).toBe(300);
    expect(await code(redeemLetter(DB(), by.playerId, id, now))).toBe('closed');
  });
});
