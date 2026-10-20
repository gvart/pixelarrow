import { describe, expect, it } from 'vitest';
import { failed, LocalMarket, RENT, type Mine } from '../../src/war/view/trade/market';
import type { SandboxScene } from '../../src/war/view/SandboxScene';

/** The scene bits the offline market reads: the region id and team 0's stock (the strongroom offline). */
function scene(stock: Record<string, number>) {
  const s = { region: { id: 'kleisoura' }, sim: { cur: { tick: 0, stock: [stock] }, addStock: (_t: number, r: string, n: number) => { stock[r] = Math.max(0, (stock[r] ?? 0) + n); } } };
  return { s: s as unknown as SandboxScene, stock };
}
const ok = <T>(r: T | { error: string }): T => { if (failed(r)) throw new Error(r.error); return r; };
const stallOf = (m: Mine) => m.sites.find((x) => x.kind === 'stall')!;

describe('offline market stub', () => {
  it('rents from the strongroom, escrows offers out of the stall and refunds on cancel', async () => {
    const { s, stock } = scene({ coin: 300, iron: 50 });
    const M = new LocalMarket(s);
    ok(await M.rent('kleisoura', 'stall'));
    expect(stock.coin).toBe(300 - RENT);
    expect(failed(await M.rent('kleisoura', 'stall'))).toBe(true);
    await new Promise<void>((done) => M.stow('in', 'stall', 0, { iron: 30, coin: 100 }, (r) => { ok(r); done(); }));
    expect(stock.iron).toBe(20);
    const sell = ok(await M.list('kleisoura', { side: 'sell', res: 'iron', n: 20, price: 9 }));
    expect(stallOf(ok(await M.mine('kleisoura'))).goods.iron).toBe(10);
    ok(await M.list('kleisoura', { side: 'buy', res: 'tin', n: 5, price: 10 }));
    expect(stallOf(ok(await M.mine('kleisoura'))).goods.coin).toBe(50);
    // escrow too big for the stall: refused, nothing moves
    expect(failed(await M.list('kleisoura', { side: 'buy', res: 'tin', n: 50, price: 10 }))).toBe(true);
    ok(await M.cancel(sell.offer));
    expect(stallOf(ok(await M.mine('kleisoura'))).goods.iron).toBe(30);
  });

  it('fills a trader\'s offer from the board, tax off a sale', async () => {
    const { s } = scene({ coin: 500, tin: 10 });
    const M = new LocalMarket(s);
    ok(await M.rent('kleisoura', 'stall'));
    await new Promise<void>((done) => M.stow('in', 'stall', 0, { coin: 200, tin: 10 }, () => done()));
    const b = ok(await M.board('kleisoura'));
    expect(b.goods.tin.ask).toBe(11);
    const f = ok(await M.fill(b.goods.tin.askId!, 5));
    expect(f).toMatchObject({ n: 5, price: 11 });
    const st = stallOf(ok(await M.mine('kleisoura')));
    expect(st.goods.tin).toBe(15);
    expect(st.goods.coin).toBe(145);
    const sale = ok(await M.fill(b.goods.tin.bidId!, 10));
    expect(sale.tax).toBeCloseTo(4.5);
    expect(stallOf(ok(await M.mine('kleisoura'))).goods.coin).toBeCloseTo(145 + 90 - 4.5);
  });

  it('escrows a posted contract\'s reward, refuses taking one\'s own, redeems a letter once by its buyer', async () => {
    const { s, stock } = scene({ coin: 1000 });
    const M = new LocalMarket(s);
    const c = ok(await M.post('kleisoura', { kind: 'supply', toTown: 'ammos', reward: 80, res: 'iron', n: 20, deadline: Date.now() + 3_600_000 }));
    expect(stock.coin).toBe(920);
    expect(failed(await M.take(c.contract))).toBe(true);
    const open = ok(await M.contracts('kleisoura')).contracts.find((x) => x.state === 'open' && x.kind === 'carry')!;
    ok(await M.take(open.id));
    expect(stock.coin).toBe(920 - open.deposit);
    const l = M.letters().find((x) => x.mine === 'buyer')!;
    ok(await M.buyLetter(l.id));
    const before = stock.coin;
    expect(ok(await M.redeem(l.id)).coin).toBe(l.amount);
    expect(stock.coin).toBe(before + l.amount);
    expect(failed(await M.redeem(l.id))).toBe(true);
  });
});
