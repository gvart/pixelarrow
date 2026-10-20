/**
 * M6f market towns (docs/WAR.md "Trade towns", "Stalls, offers and the board"): rented sites, rent and its lock, sell
 * offers and escrowed buy orders, atomic and idempotent fills with the holder's tax, the price board; the room's stow
 * bridge between packs and a site.
 */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { api, devLogin } from '../helpers';
import { setGood } from './goods';
import { goodsOf, putStmt, strongroom, taxBox } from '../../src/war/holders';
import { board, cancelOffer, escrowId, fill, listOffer, rentSite, site, stallId, upgradeStall, warehouseId } from '../../src/war/market';
import { WarRoom } from '../../src/war/room';
import { warRegion } from '../../src/war/regions';
import { NET_VERSION, type ServerMsg } from '../../../src/war/net/protocol';

const DB = () => env.DB!;
const DAY = 86_400_000;
const T = 'kleisoura';
const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code ?? String(e));
const give = (holder: string, res: string, n: number, origin = 'dodona') => DB().batch([putStmt(DB(), holder, res, n, origin)]);
const present = (pid: number, town = T) => DB().prepare("INSERT INTO war_persons (id, player_id, state, region) VALUES (?1, ?2, 'active', ?3)").bind(`pr-${pid}-${town}`, pid, town).run();

async function trader(n: number, coin = 100) {
  const p = await devLogin(n);
  await api('/api/war/roster', { token: p.token });
  await setGood(p.playerId, 'coin', coin);
  return p;
}

describe('sites and rent', () => {
  it('rents one stall and one warehouse a town, rent to the holder; three days unpaid locks; unheld is free', async () => {
    const a = await trader(8101), now = Date.now();
    expect(await rentSite(DB(), a.playerId, T, 'stall', 2, now)).toBe(stallId(T, a.playerId));
    expect(await code(rentSite(DB(), a.playerId, T, 'stall', 2, now))).toBe('rented');
    expect(await code(rentSite(DB(), a.playerId, 'dodona', 'warehouse', 2, now))).toBe('no_warehouse'); // home: the strongroom
    expect(await code(rentSite(DB(), a.playerId, 'saddle', 'stall', 2, now))).toBe('not_market');
    expect((await goodsOf(DB(), strongroom(a.playerId))).coin).toBe(90);
    expect((await goodsOf(DB(), taxBox(T, 2))).coin).toBe(10);
    // two days on (one more day due): paid from the stall's coin first
    await give(stallId(T, a.playerId), 'coin', 10);
    expect((await site(DB(), a.playerId, T, 'stall', 2, now + 2 * DAY)).id).toBe(stallId(T, a.playerId));
    expect((await goodsOf(DB(), stallId(T, a.playerId))).coin ?? 0).toBe(0);
    expect((await goodsOf(DB(), strongroom(a.playerId))).coin).toBe(90);
    expect((await goodsOf(DB(), taxBox(T, 2))).coin).toBe(20);
    // nothing left to pay with: three days on it locks (never confiscated)
    await setGood(a.playerId, 'coin', 0);
    expect(await code(site(DB(), a.playerId, T, 'stall', 2, now + 5 * DAY))).toBe('ok');
    expect(await code(site(DB(), a.playerId, T, 'stall', 2, now + 6 * DAY))).toBe('locked');
    // pays up: open again
    await setGood(a.playerId, 'coin', 100);
    expect(await code(site(DB(), a.playerId, T, 'stall', 2, now + 6 * DAY))).toBe('ok');
    // an unheld town charges nothing
    const b = await trader(8102);
    await rentSite(DB(), b.playerId, 'stymphalia', 'warehouse', -1, now);
    expect((await goodsOf(DB(), strongroom(b.playerId))).coin).toBe(100);
    expect(await code(site(DB(), b.playerId, 'stymphalia', 'warehouse', -1, now + 30 * DAY))).toBe('ok');
    expect((await goodsOf(DB(), strongroom(b.playerId))).coin).toBe(100);
  });

  it('stall levels hold 4, 8, 12 offers; the upgrade is paid from the stall', async () => {
    const a = await trader(8103), now = Date.now();
    await rentSite(DB(), a.playerId, 'achelous', 'stall', -1, now);
    await give(stallId('achelous', a.playerId), 'wood', 100);
    for (let i = 0; i < 4; i++) await listOffer(DB(), a.playerId, 'achelous', { side: 'sell', res: 'wood', n: 1, price: 5 }, -1, now);
    expect(await code(listOffer(DB(), a.playerId, 'achelous', { side: 'sell', res: 'wood', n: 1, price: 5 }, -1, now))).toBe('offers_full');
    expect(await code(listOffer(DB(), a.playerId, 'achelous', { side: 'sell', res: 'wood', n: 1, price: 5, standing: true }, -1, now))).toBe('no_trader');
    expect(await code(upgradeStall(DB(), a.playerId, 'achelous', -1, now))).toBe('no_coin');
    await give(stallId('achelous', a.playerId), 'coin', 200);
    expect(await upgradeStall(DB(), a.playerId, 'achelous', -1, now)).toBe(2);
    expect(await code(listOffer(DB(), a.playerId, 'achelous', { side: 'sell', res: 'wood', n: 1, price: 5 }, -1, now))).toBe('ok');
  });
});

describe('offers and fills', () => {
  it('a sell offer escrows; a fill is atomic and idempotent: goods to the buyer, coin less tax to the seller, tax to the holder', async () => {
    const s = await trader(8111), b = await trader(8112), now = Date.now();
    await rentSite(DB(), s.playerId, T, 'stall', 1, now);
    await rentSite(DB(), b.playerId, T, 'warehouse', 1, now);
    await give(stallId(T, s.playerId), 'iron', 10);
    const id = await listOffer(DB(), s.playerId, T, { side: 'sell', res: 'iron', n: 8, price: 25 }, 1, now);
    expect(await goodsOf(DB(), stallId(T, s.playerId))).toEqual({ iron: 2 });
    expect(await goodsOf(DB(), escrowId(id))).toEqual({ iron: 8 });
    // the buyer must be in town and hold the coin there
    expect(await code(fill(DB(), b.playerId, id, 4, 'k-1', 1, now))).toBe('not_present');
    await present(b.playerId);
    expect(await code(fill(DB(), b.playerId, id, 4, 'k-1', 1, now))).toBe('no_coin');
    expect(await goodsOf(DB(), escrowId(id))).toEqual({ iron: 8 }); // nothing moved
    await give(warehouseId(T, b.playerId), 'coin', 150);
    const f = await fill(DB(), b.playerId, id, 4, 'k-1', 1, now);
    expect(f).toMatchObject({ n: 4, price: 25, tax: 5, seller: s.playerId, buyer: b.playerId });
    expect(await goodsOf(DB(), warehouseId(T, b.playerId))).toEqual({ coin: 50, iron: 4 });
    expect((await goodsOf(DB(), stallId(T, s.playerId))).coin).toBe(95);
    expect((await goodsOf(DB(), taxBox(T, 1))).coin).toBe(10 + 10 + 5); // two rents and the tax
    // the same key again: the first fill, nothing moves twice
    expect(await fill(DB(), b.playerId, id, 4, 'k-1', 1, now)).toEqual(f);
    expect(await goodsOf(DB(), warehouseId(T, b.playerId))).toEqual({ coin: 50, iron: 4 });
    // more than is left is refused; own offers too
    expect(await code(fill(DB(), b.playerId, id, 5, 'k-2', 1, now))).toBe('too_many');
    await present(s.playerId);
    expect(await code(fill(DB(), s.playerId, id, 1, 'k-3', 1, now))).toBe('own_offer');
    // the board reads the offers and fills
    const bd = await board(DB(), T);
    expect(bd.goods.iron).toEqual({ ask: 25, bid: null, askDepth: 4, bidDepth: 0 });
    expect(bd.fills[0]).toMatchObject({ res: 'iron', n: 4, price: 25 });
  });

  it('a buy order escrows coin, is filled by a seller from his stall, and refunds on cancel', async () => {
    const buyer = await trader(8121), seller = await trader(8122), now = Date.now();
    await rentSite(DB(), buyer.playerId, 'ammos', 'stall', -1, now);
    await rentSite(DB(), buyer.playerId, 'ammos', 'warehouse', -1, now);
    await rentSite(DB(), seller.playerId, 'ammos', 'stall', -1, now);
    await give(stallId('ammos', buyer.playerId), 'coin', 100);
    const id = await listOffer(DB(), buyer.playerId, 'ammos', { side: 'buy', res: 'salt', n: 10, price: 6 }, -1, now);
    expect(await goodsOf(DB(), stallId('ammos', buyer.playerId))).toEqual({ coin: 40 });
    await present(seller.playerId, 'ammos');
    expect(await code(fill(DB(), seller.playerId, id, 4, 'b-1', -1, now))).toBe('no_salt');
    await give(stallId('ammos', seller.playerId), 'salt', 4, 'siren');
    await fill(DB(), seller.playerId, id, 4, 'b-1', -1, now);
    expect(await goodsOf(DB(), warehouseId('ammos', buyer.playerId))).toEqual({ salt: 4 });
    expect((await goodsOf(DB(), stallId('ammos', seller.playerId))).coin).toBe(24); // unheld: no tax
    expect(await goodsOf(DB(), escrowId(id))).toEqual({ coin: 36 });
    await cancelOffer(DB(), buyer.playerId, id, now);
    expect(await goodsOf(DB(), stallId('ammos', buyer.playerId))).toEqual({ coin: 76 });
    expect((await goodsOf(DB(), escrowId(id))).coin ?? 0).toBe(0);
    expect(await code(cancelOffer(DB(), buyer.playerId, id, now))).toBe('closed');
  });

  it('the board names every goods offer by id, best first; taking one from the board fills it partly over the API', async () => {
    const s1 = await trader(8141), s2 = await trader(8142), b = await trader(8143), now = Date.now(), town = 'stymphalia';
    for (const p of [s1, s2]) await rentSite(DB(), p.playerId, town, 'stall', -1, now);
    await rentSite(DB(), b.playerId, town, 'stall', -1, now);
    await rentSite(DB(), b.playerId, town, 'warehouse', -1, now);
    await give(stallId(town, s1.playerId), 'tin', 30);
    await give(stallId(town, s2.playerId), 'tin', 30);
    await give(stallId(town, b.playerId), 'coin', 100);
    const dear = await listOffer(DB(), s1.playerId, town, { side: 'sell', res: 'tin', n: 20, price: 12 }, -1, now);
    const cheap = await listOffer(DB(), s2.playerId, town, { side: 'sell', res: 'tin', n: 10, price: 9 }, -1, now);
    const bid = await listOffer(DB(), b.playerId, town, { side: 'buy', res: 'tin', n: 5, price: 7 }, -1, now);
    const bd = await board(DB(), town);
    expect(bd.offers).toEqual([
      { offer: cheap, side: 'sell', res: 'tin', n: 10, price: 9, stall: stallId(town, s2.playerId), player: s2.playerId },
      { offer: dear, side: 'sell', res: 'tin', n: 20, price: 12, stall: stallId(town, s1.playerId), player: s1.playerId },
      { offer: bid, side: 'buy', res: 'tin', n: 5, price: 7, stall: stallId(town, b.playerId), player: b.playerId },
    ]);
    await present(b.playerId, town);
    // the best ask, partly, over the API: goods out of its escrow into the warehouse, coin from the stall to the seller's
    const r = await api(`/api/war/trade/offers/${bd.offers[0].offer}/fill`, { method: 'POST', token: b.token, json: { n: 4, key: 'board-1' } });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ offer: cheap, n: 4, price: 9, tax: 0, seller: s2.playerId, buyer: b.playerId });
    expect(await goodsOf(DB(), escrowId(cheap))).toEqual({ tin: 6 });
    expect(await goodsOf(DB(), warehouseId(town, b.playerId))).toEqual({ tin: 4 });
    expect((await goodsOf(DB(), stallId(town, s2.playerId))).coin).toBe(36);
    expect((await goodsOf(DB(), stallId(town, b.playerId))).coin).toBe(100 - 35 - 36);
    expect((await board(DB(), town)).offers[0]).toMatchObject({ offer: cheap, n: 6 });
    // more than is left, or coin he lacks: refused, nothing moves
    expect((await api(`/api/war/trade/offers/${cheap}/fill`, { method: 'POST', token: b.token, json: { n: 7, key: 'board-2' } })).status).toBe(409);
    expect((await api(`/api/war/trade/offers/${dear}/fill`, { method: 'POST', token: b.token, json: { n: 5, key: 'board-3' } })).status).toBe(409);
    expect(await goodsOf(DB(), escrowId(dear))).toEqual({ tin: 20 });
    expect((await goodsOf(DB(), stallId(town, b.playerId))).coin).toBe(29);
    // the rest of it: done, off the board
    await fill(DB(), b.playerId, cheap, 3, 'board-4', -1, now);
    await give(stallId(town, b.playerId), 'coin', 30);
    await fill(DB(), b.playerId, cheap, 3, 'board-5', -1, now);
    expect((await board(DB(), town)).offers.map((o) => o.offer)).toEqual([dear, bid]);
  });

  it('serves the board over the API', async () => {
    const a = await trader(8131);
    const r = await api('/api/war/trade/kleisoura/board', { token: a.token });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ town: 'kleisoura' });
    expect((await api('/api/war/trade/kleisoura/rent', { method: 'POST', token: a.token, json: { kind: 'stall' } })).status).toBe(200);
  });
});

describe('the stow bridge in the room', () => {
  it('takes goods out of his own packs only, all or nothing, and gives back what fits', () => {
    const r = new WarRoom({ region: warRegion('test-ridge')!, seed: 1, cap: 600 });
    const w = r.join(1, { t: 'join', v: NET_VERSION, region: 'test-ridge', playerId: 1, team: 0, army: [{ cls: 'militia', count: 2 }] }).msg as Extract<ServerMsg, { t: 'welcome' }>;
    const sq = w.squads[0];
    r.tick();
    expect(r.inCourt(1, { squad: sq })).toBe(true); // no court on this map: anywhere
    expect(r.inCourt(2, { squad: sq })).toBe(false);
    const rest = r.giveCargo(1, { squad: sq }, { lots: [{ r: 'iron', n: 25, o: 'dodona' }], items: [] });
    expect(rest.lots).toEqual([{ r: 'iron', n: 5, o: 'dodona' }]); // two packs of one load (CARRY 10)
    expect(r.takeCargo(2, { squad: sq }, { iron: 1 })).toBeNull();
    expect(r.takeCargo(1, { squad: sq }, { iron: 21 })).toBeNull();
    expect(r.takeCargo(1, { squad: sq }, { iron: 15 })).toEqual({ lots: [{ r: 'iron', n: 10, o: 'dodona' }, { r: 'iron', n: 5, o: 'dodona' }], items: [] });
  });
});
