/**
 * W-140..W-143 NPC towns (docs/WAR.md "NPC towns"; numbers: src/data/warNpcTowns.ts): the rules shared by the server
 * (server/src/war/npcMarket.ts, D1), the HUD and tests. Pure: all state comes in, time is the caller's clock.
 *
 *  - A town: every world region. It deals with his men and carts standing within NPC.reach of its spot (W-87, W-88).
 *  - Prices are physical: selling to a town raises its stock and lowers its price, buying does the reverse, and stock
 *    drifts back to par. A land's own good is cheap; far from any land that yields it a good is dear, so carrying pays.
 *  - Coin is physical: a town pays only out of its purse, which holds what buyers paid it and a small daily mint of
 *    silver under the cap (silver 1 = coin 20, docs/WAR.md "Coin"). Nothing else makes coin: an empty town buys no more.
 */
import { NPC, NPC_BASE, NPC_ROLE_GOODS, type NpcGood } from '../../data/warNpcTowns';
import { hops } from '../world/graph';
import { WORLD_REGIONS } from '../world/regions';
import type { RegionData } from '../types';

const DAY = 86_400_000;
const EPS = 1e-6;
/** Silver into coin at the mint (docs/WAR.md "Coin"). */
export const COIN_PER_SILVER = 20;
/** The coin a town mints a day (W-142). */
export const NPC_MINT = NPC.purse.mintSilver * COIN_PER_SILVER;

const regionOf = (id: string) => WORLD_REGIONS.find((r) => r.id === id);
/** The land goods, by the name a region's `res` gives them. */
const LAND_GOODS: Partial<Record<NpcGood, string>> = { food: 'food', wood: 'wood', stone: 'stone', iron: 'iron', copper: 'copper', tin: 'tin', marble: 'marble', salt: 'salt', hides: 'horses' };
const landPoints = (region: string, g: NpcGood): number => {
  const key = LAND_GOODS[g];
  return key ? ((regionOf(region)?.res as Record<string, number | undefined> | undefined)?.[key] ?? 0) : 0;
};

/** Hops from `town` to the nearest land yielding `g` (null: no land yields it, a made good). */
function hopsToLand(town: string, g: NpcGood): number | null {
  if (!LAND_GOODS[g]) return null;
  let best = Infinity;
  for (const r of WORLD_REGIONS) if (landPoints(r.id, g) > 0) best = Math.min(best, hops(town, r.id));
  return best;
}

export interface NpcGoodRule { res: NpcGood; base: number; par: number }
const rules = new Map<string, readonly NpcGoodRule[]>();

/** What a town deals in, its local base price and par stock; [] for a place that is no town. */
export function npcGoods(town: string): readonly NpcGoodRule[] {
  let out = rules.get(town);
  if (out) return out;
  const r = regionOf(town);
  if (!r) return [];
  const list = new Set<NpcGood>(NPC_ROLE_GOODS[r.role]);
  for (const g of Object.keys(LAND_GOODS) as NpcGood[]) if (landPoints(town, g) > 0) list.add(g);
  const { at, per, far, made } = NPC.distance;
  out = [...list].map((res) => {
    const h = hopsToLand(town, res), f = h === null ? made : at + per * Math.min(h, far), pts = landPoints(town, res);
    return { res, base: NPC_BASE[res] * f, par: pts > 0 ? NPC.par.land * pts : NPC.par.made };
  });
  rules.set(town, out);
  return out;
}

export const npcGood = (town: string, res: string): NpcGoodRule | null => npcGoods(town).find((g) => g.res === res) ?? null;

/** Is this region a town the NPC market knows? */
export const isNpcTown = (town: string): boolean => !!regionOf(town);

/** Stock `ms` after it stood at `stock`: slowly back to par. */
export const stockAfter = (stock: number, par: number, ms: number): number => (ms <= 0 ? stock : par + (stock - par) * Math.exp(-ms / (NPC.price.recoverHours * 3_600_000)));

/** The price multiplier at this stock. */
const mult = (stock: number, par: number) => Math.max(NPC.price.min, Math.min(NPC.price.max, 1 + NPC.price.slope * (1 - stock / par)));
/** The town's mid price at this stock (no edge). */
export const midPrice = (g: NpcGoodRule, stock: number): number => g.base * mult(stock, g.par);

/** The mean multiplier from stock a to b: the clamped line's integral, flat, sloped, flat. */
function meanMult(a: number, b: number, par: number): number {
  if (Math.abs(a - b) < EPS) return mult(a, par);
  const lo = Math.min(a, b), hi = Math.max(a, b), { slope, min, max } = NPC.price;
  const sMax = par * (1 - (max - 1) / slope), sMin = par * (1 + (1 - min) / slope);
  const line = (x: number) => 1 + slope * (1 - x / par);
  const seg = (x0: number, x1: number, f: (x: number) => number) => (x1 > x0 ? ((f(x0) + f(x1)) / 2) * (x1 - x0) : 0);
  return (seg(lo, Math.min(hi, sMax), () => max) + seg(Math.max(lo, sMax), Math.min(hi, sMin), line) + seg(Math.max(lo, sMin), hi, () => min)) / (hi - lo);
}

/** Whole coin the town pays for n sold to it at this stock (rounded down). */
export const payFor = (g: NpcGoodRule, stock: number, n: number): number => Math.floor(n * g.base * meanMult(stock, stock + n, g.par) * (1 - NPC.price.edge) + EPS);
/** Whole coin n cost from the town at this stock (rounded up). */
export const costOf = (g: NpcGoodRule, stock: number, n: number): number => Math.ceil(n * g.base * meanMult(stock, stock - n, g.par) * (1 + NPC.price.edge) - EPS);

/** The most of `want`, to 0.01 of a unit, for which `fits` holds (it holds less as n grows). */
function most(want: number, fits: (n: number) => boolean): number {
  if (fits(want)) return want;
  let lo = 0, hi = want;
  for (let i = 0; i < 24; i++) {
    const m = (lo + hi) / 2;
    if (fits(m)) lo = m;
    else hi = m;
  }
  return Math.floor(lo * 100) / 100;
}
/** The most of `want` this purse pays for. */
export const sellable = (g: NpcGoodRule, stock: number, want: number, purse: number): number => most(want, (n) => payFor(g, stock, n) <= purse);
/** The most of `want` this stock lets go for `coin`. */
export const buyable = (g: NpcGoodRule, stock: number, want: number, coin: number): number => most(Math.min(want, stock), (n) => costOf(g, stock, n) <= coin);

/** The UTC day of a clock. */
export const npcDay = (now: number) => Math.floor(now / DAY);

/** A purse `days` of mint later: NPC_MINT a day while under the cap; what buyers paid over the cap stays. */
export const purseAfter = (coin: number, days: number): number => (days <= 0 || coin >= NPC.purse.cap ? coin : Math.min(NPC.purse.cap, coin + days * NPC_MINT));

/** What a town shows: its purse, and per good what it pays and asks for a unit now, and how much it holds. */
export interface NpcOffer { res: NpcGood; pay: number; ask: number; stock: number; par: number }
export interface NpcView { town: string; purse: number; goods: NpcOffer[] }

/** A good's line on the board at this stock: one unit's pay and ask. */
export const npcOffer = (g: NpcGoodRule, stock: number): NpcOffer => ({
  res: g.res, stock, par: g.par,
  pay: Math.round(midPrice(g, stock) * (1 - NPC.price.edge) * 100) / 100,
  ask: Math.round(midPrice(g, stock) * (1 + NPC.price.edge) * 100) / 100,
});

/** Where his men deal with a region's town: its market court, else the middle of its stalls, else its well, board, storehouse or cottages. */
export function npcSpot(r: RegionData): { x: number; y: number } {
  const c = r.safe?.[0];
  if (c) return { x: c.x + c.w / 2, y: c.y + c.h / 2 };
  for (const type of ['stall', 'well', 'board', 'storehouse', 'cottage']) {
    const ps = (r.prebuilt ?? []).filter((p) => p.type === type);
    if (ps.length) return { x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: ps.reduce((a, p) => a + p.y, 0) / ps.length };
  }
  const p = r.prebuilt?.[0];
  return p ? { x: p.x, y: p.y } : { x: r.w / 2, y: r.h / 2 };
}
