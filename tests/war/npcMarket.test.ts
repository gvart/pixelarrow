/**
 * W-140..W-143 NPC towns, the pure rules (src/war/net/npcMarket.ts): every world region is a town his men can walk to;
 * each deals in its role's goods and its land's; selling lowers and buying raises the price, which recovers slowly;
 * distant towns pay better; a purse pays only what it holds and grows only by the mint.
 */
import { describe, expect, it } from 'vitest';
import { NPC, NPC_BASE, NPC_ROLE_GOODS, type NpcGood } from '../../src/data/warNpcTowns';
import { buyable, costOf, midPrice, NPC_MINT, npcGood, npcGoods, npcOffer, npcSpot, payFor, purseAfter, sellable, stockAfter } from '../../src/war/net/npcMarket';
import { parseRegion } from '../../src/war/region/schema';
import { buildGrid, findPath, tileAt } from '../../src/war/sim/grid';
import { hops } from '../../src/war/world/graph';
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

  it('stock drifts slowly back to par: not much in an hour, most of it in two days', () => {
    const par = 100, after = (h: number) => stockAfter(160, par, h * 3_600_000);
    expect(after(1)).toBeGreaterThan(150);
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
    expect(payFor(g, g.par, n)).toBeLessThanOrEqual(50);
    expect(n).toBeGreaterThan(0);
    expect(sellable(g, g.par, 10_000, 0)).toBeLessThan(1);
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
