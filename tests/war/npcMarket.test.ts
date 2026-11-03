/**
 * W-140..W-143 NPC towns, the pure rules (src/war/net/npcMarket.ts): every world region is a town his men can walk to;
 * each deals in its role's goods and its land's; selling lowers and buying raises the price, which recovers slowly;
 * distant towns pay better; a purse pays only what it holds and grows only by the mint.
 */
import { describe, expect, it } from 'vitest';
import { NPC, NPC_BASE, NPC_ROLE_GOODS, type NpcGood } from '../../src/data/warNpcTowns';
import { buyable, costOf, midPrice, NPC_MINT, npcGood, npcGoods, npcOffer, npcSpot, payFor, purseAfter, sellable, stockAfter, type NpcGoodRule } from '../../src/war/net/npcMarket';
import { parseRegion } from '../../src/war/region/schema';
import { buildGrid, findPath, tileAt } from '../../src/war/sim/grid';
import { edge, hops } from '../../src/war/world/graph';
import { WORLD_REGIONS } from '../../src/war/world/regions';
import type { RegionData } from '../../src/war/types';

const jsons = import.meta.glob<unknown>('../../src/war/regions/*.json', { eager: true, import: 'default' });
const region = (id: string) => parseRegion(jsons[`../../src/war/regions/${id}.json`]) as RegionData;

describe('W-140 every region has a town to deal with', () => {
  it('each deals in its role\'s goods and what its land yields, all priced', () => {
    for (const r of WORLD_REGIONS) {
      const list = npcGoods(r.id).map((g) => g.res);
      for (const g of NPC_ROLE_GOODS[r.role]) expect(list, `${r.id} ${g}`).toContain(g);
      for (const g of list) expect(NPC_BASE[g], g).toBeGreaterThan(0);
      if ((r.res.wood ?? 0) > 0) expect(list, r.id).toContain('wood');
      expect(list, 'silver is the mint\'s').not.toContain('silver');
    }
  });

  it('its spot stands where a man can walk to from the region\'s first entry', () => {
    for (const w of WORLD_REGIONS) {
      const r = region(w.id), g = buildGrid(r), p = npcSpot(r), e = r.entries[0];
      const from = tileAt(g, e.x + e.w / 2, e.y + e.h / 2);
      let open = -1;
      for (let d = 0; d <= NPC.reach - 2 && open < 0; d++)
        for (let a = 0; a < 16 && open < 0; a++) {
          const x = p.x + Math.cos((a * Math.PI) / 8) * d, y = p.y + Math.sin((a * Math.PI) / 8) * d;
          if (x < 0 || y < 0 || x >= r.w || y >= r.h) continue;
          const t = tileAt(g, x, y);
          if (g.cost[t] > 0 && findPath(g, from, t).at(-1) === t) open = t;
        }
      expect(open, `${w.id} town at ${p.x},${p.y}`).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('W-141 prices', () => {
  const town = WORLD_REGIONS.find((r) => r.role === 'home')!.id, g = npcGood(town, 'wood')!;

  it('selling lowers the price, buying raises it, each unit dearer or cheaper than the last', () => {
    expect(midPrice(g, g.par + 40)).toBeLessThan(midPrice(g, g.par));
    expect(midPrice(g, g.par - 40)).toBeGreaterThan(midPrice(g, g.par));
    expect(payFor(g, g.par, 400)).toBeLessThan(2 * payFor(g, g.par, 200));
    expect(costOf(g, g.par, 400)).toBeGreaterThan(2 * costOf(g, g.par, 200));
  });

  it('prices stay inside their floor and ceiling', () => {
    expect(midPrice(g, g.par * 100)).toBeCloseTo(g.base * NPC.price.min);
    expect(midPrice(g, 0)).toBeCloseTo(g.base * (1 + NPC.price.slope));
    expect(payFor(g, g.par * 100, 100)).toBe(Math.floor(100 * g.base * NPC.price.min * (1 - NPC.price.edge)));
  });

  it('buying back what you just sold loses coin, at every amount and good of every town', () => {
    for (const r of WORLD_REGIONS) for (const x of npcGoods(r.id)) for (const n of [1, 10, 60, 200]) {
      const paid = payFor(x, x.par, n);
      expect(costOf(x, x.par + n, n), `${r.id} ${x.res} ${n}`).toBeGreaterThan(paid - 1e-9);
    }
  });

  it('stock drifts back to par: a little in an hour, most of it in two days', () => {
    const par = 100, after = (h: number) => stockAfter(160, par, h * 3_600_000), rate = 1 - Math.exp(-1 / NPC.price.recoverHours);
    expect(after(1)).toBeCloseTo(160 - 60 * rate, 6);
    expect(after(48)).toBeLessThan(par + 2);
    expect(stockAfter(40, par, 48 * 3_600_000)).toBeGreaterThan(par - 2);
  });

  it('distant towns pay better: for every land good, its land pays less than a town farther off', () => {
    const lands: Partial<Record<NpcGood, string>> = { wood: 'wood', iron: 'iron', copper: 'copper', tin: 'tin', stone: 'stone', salt: 'salt', marble: 'marble' };
    for (const [good, key] of Object.entries(lands)) {
      const land = WORLD_REGIONS.find((r) => ((r.res as Record<string, number>)[key!] ?? 0) > 0)!, here = npcGood(land.id, good)!;
      const far = WORLD_REGIONS.filter((r) => npcGood(r.id, good) && !((r.res as Record<string, number>)[key!] ?? 0)).sort((a, b) => hops(land.id, b.id) - hops(land.id, a.id))[0];
      expect(npcGood(far.id, good)!.base, `${good}: ${land.id} against ${far.id}`).toBeGreaterThan(here.base);
    }
  });

  it('carrying pays: a cartload bought at a land sells for more two hops off, not at the next door by much', () => {
    let some = 0;
    for (const r of WORLD_REGIONS) {
      for (const x of npcGoods(r.id)) {
        if (!((r.res as Record<string, number>)[x.res] ?? 0)) continue;
        const cost = costOf(x, x.par, 60);
        for (const o of WORLD_REGIONS) {
          const y = npcGood(o.id, x.res);
          if (!y || hops(r.id, o.id) !== 2 || ((o.res as Record<string, number>)[x.res] ?? 0) > 0 || y.base <= x.base * 1.6) continue;
          expect(payFor(y, y.par, 60), `${x.res} ${r.id} to ${o.id}`).toBeGreaterThan(cost);
          some++;
        }
      }
    }
    expect(some).toBeGreaterThan(10);
  });

  it('the board line brackets a sale and a purchase of one unit', () => {
    const o = npcOffer(g, g.par);
    expect(o.pay).toBeLessThan(o.ask);
    expect(payFor(g, g.par, 100)).toBeLessThanOrEqual(100 * o.pay);
    expect(costOf(g, g.par, 100)).toBeGreaterThanOrEqual(100 * o.ask - 1);
  });
});

describe('W-142 purses', () => {
  const g = npcGoods(WORLD_REGIONS[0].id)[0];

  it('a town pays only what its purse holds', () => {
    const n = sellable(g, g.par, 10_000, 50);
    expect(payFor(g, g.par, n, 50)).toBeLessThanOrEqual(50);
    expect(n).toBeGreaterThan(0);
    expect(payFor(g, g.par, sellable(g, g.par, 10_000, 0), 0), 'an empty purse pays nothing').toBe(0);
  });

  it('a town lets go only what it holds, for what you have', () => {
    expect(buyable(g, 5, 100, 1e6)).toBe(5);
    const n = buyable(g, g.par, 100, 20);
    expect(costOf(g, g.par, n)).toBeLessThanOrEqual(20);
  });

  it('the mint is the silver rule, small, and stops at the cap', () => {
    expect(NPC_MINT).toBe(NPC.purse.mintSilver * 20);
    expect(purseAfter(0, 1)).toBe(NPC_MINT);
    expect(purseAfter(0, 1000)).toBe(NPC.purse.cap);
    expect(purseAfter(NPC.purse.cap + 500, 30), 'what buyers paid over the cap stays, no more is minted').toBe(NPC.purse.cap + 500);
    expect(purseAfter(100, 0)).toBe(100);
  });
});

describe('W-180 a thin purse pays less', () => {
  const g = npcGoods(WORLD_REGIONS[0].id)[0], full = NPC.purse.start;

  it('a full purse pays the whole price; a thin one less, smoothly, down to its floor', () => {
    expect(payFor(g, g.par, 100, full * 2)).toBe(payFor(g, g.par, 100));
    const at = [1, 0.75, 0.5, 0.25, 0].map((f) => payFor(g, g.par, 100, full * f));
    for (let i = 1; i < at.length; i++) expect(at[i], `${i}`).toBeLessThan(at[i - 1]);
    expect(payFor(g, g.par, 1, 0)).toBeCloseTo(payFor(g, g.par, 1) * NPC.purse.thin, 0);
    expect(npcOffer(g, g.par, full / 2).pay).toBeLessThan(npcOffer(g, g.par, full).pay);
  });

  it('a big sale pays less than the same goods sold at a full purse, and never more than the purse', () => {
    const n = sellable(g, g.par, 100_000, full);
    expect(payFor(g, g.par, n, full)).toBeLessThanOrEqual(full);
    expect(payFor(g, g.par, n, full)).toBeLessThan(payFor(g, g.par, n));
  });
});

/** A trader shuttling two towns with the room of two handcarts and his men: the coin he clears each hour, and the purses after. */
function shuttle(a: string, b: string, hours: number) {
  const TRIP = edge(a, b)!.ms + 10 * 60_000, ROOM = 160;
  type Book = { purse: number; stock: Map<string, number> };
  const open = (t: string): Book => ({ purse: NPC.purse.start, stock: new Map(npcGoods(t).map((g) => [g.res as string, g.par])) });
  const books: Record<string, Book> = { [a]: open(a), [b]: open(b) };
  const drift = () => {
    for (const t of [a, b]) for (const g of npcGoods(t)) books[t].stock.set(g.res, stockAfter(books[t].stock.get(g.res)!, g.par, TRIP));
  };
  const rows: number[] = [];
  let here = a, there = b, now = 0, net = 0, low: number = NPC.purse.start;
  while (now < hours * 3_600_000) {
    const A = books[here], B = books[there];
    let room = ROOM;
    const load: { h: NpcGoodRule; n: number }[] = [];
    for (;;) {
      let best: { g: NpcGoodRule; h: NpcGoodRule; n: number; net: number; cost: number } | null = null;
      for (const g of npcGoods(here)) {
        const h = npcGood(there, g.res);
        if (!h || load.some((l) => l.h.res === g.res)) continue;
        const sa = A.stock.get(g.res)!, sb = B.stock.get(g.res)!;
        for (let n = 10; n <= room && n <= sa; n += 10) {
          const cost = costOf(g, sa, n), pay = Math.min(payFor(h, sb, n, B.purse), B.purse);
          if (pay - cost > 0 && (!best || pay - cost > best.net)) best = { g, h, n, net: pay - cost, cost };
        }
      }
      if (!best) break;
      A.stock.set(best.g.res, A.stock.get(best.g.res)! - best.n);
      A.purse += best.cost;
      net -= best.cost;
      room -= best.n;
      load.push({ h: best.h, n: best.n });
    }
    drift();
    for (const { h, n } of load) {
      const st = B.stock.get(h.res)!, pay = Math.min(payFor(h, st, n, B.purse), B.purse);
      B.stock.set(h.res, st + n);
      B.purse -= pay;
      net += pay;
    }
    low = Math.min(low, B.purse);
    now += TRIP;
    if (now >= (rows.length + 1) * 3_600_000) rows.push(net), (net = 0);
    [here, there] = [there, here];
  }
  return { rows, low };
}

describe('W-181 a route fades, a longer one pays better', () => {
  // pairs with goods to carry both ways; derived from the world so a retune or a new region moves the numbers, not the test
  const pairs = WORLD_REGIONS.flatMap((r) => r.adj.filter((o) => r.id < o).map((o) => [r.id, o] as const));

  it('two towns: the coin an hour falls over hours and does not stop, and no purse is emptied', () => {
    let fades = 0, faded = 0;
    for (const [a, b] of pairs) {
      const { rows, low } = shuttle(a, b, 6);
      expect(low, `${a} ${b}`).toBeGreaterThan(NPC.purse.start * 0.25);
      if (rows[0] < 200) continue; // a pair with little to carry between them
      fades++;
      expect(Math.max(...rows.slice(1)), `${a} ${b} ${rows}`).toBeLessThan(rows[0]);
      if (rows[1] > rows[0] * 0.08 && rows[2] > 0) faded++;
    }
    expect(fades).toBeGreaterThan(pairs.length / 3);
    expect(faded / fades, `${faded} of ${fades}`).toBeGreaterThan(0.7);
  });

  it('per road walked, the best cartload two or three hops off clears more than the best next door', () => {
    const best = (from: string, h: number) => {
      let top = 0;
      for (const w of WORLD_REGIONS) {
        if (hops(from, w.id) !== h) continue;
        for (const g of npcGoods(from)) {
          const y = npcGood(w.id, g.res);
          if (!y) continue;
          top = Math.max(top, (payFor(y, y.par, 120, NPC.purse.start) - costOf(g, g.par, 120)) / h);
        }
      }
      return top;
    };
    for (const r of WORLD_REGIONS.filter((x) => x.role === 'home')) {
      expect(Math.max(best(r.id, 2), best(r.id, 3)), r.id).toBeGreaterThan(best(r.id, 1));
    }
  });
});
