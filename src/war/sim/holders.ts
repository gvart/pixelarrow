/**
 * Holders of goods (M6a, docs/WAR.md "Trade", "Goods live in places"): every good sits in one place: a store, a chest,
 * a team's home strongroom, a man's pack, a cart, a loot pile. A holder keeps lots (a good, an amount, its origin: the
 * region it was gathered, made or minted in) and items. Size is in loads: CARRY goods or ITEMS_PER_LOAD items a load.
 * Takes are first in, first out over the lots, so origins travel with the goods; an emptied lot stays at 0.
 */
import type { Item } from '../../data/items';
import type { GoodKind, HoldItem } from '../types';
import { CARRY } from './economy';

/**
 * s (M6g): sealed under carry contract s: unloads only at its destination (the server's bridge), never into a sim holder.
 * s < 0 (W-153): tribute set aside for player -s: no network, craft or plain load draws it (see `Draw`).
 */
export interface Lot { r: GoodKind; n: number; o: string; s?: number }
export interface Hold { lots: Lot[]; items: Item[] }
export type Cost = Partial<Record<GoodKind, number>>;

/** Items a load (docs/WAR.md: 5 items = 1 load). */
export const ITEMS_PER_LOAD = 5;
/** Coin a load (docs/WAR.md "Coin": 200 coin = 1 load); every other good CARRY a load. */
export const COIN_LOAD = 200;
/** W-60: rations a load (half the weight of plain food). */
export const RATION_LOAD = 2 * CARRY;
/** Goods of `r` one load holds. */
export const perLoad = (r: GoodKind | string | undefined) => (r === 'coin' ? COIN_LOAD : r === 'ration' ? RATION_LOAD : CARRY);
const EPS = 1e-9;

/** W-153: a lot set aside as tribute. */
export const isTithe = (l: Lot) => l.s !== undefined && l.s < 0;
/** W-153: the seal of tribute owed to owner `p:<id>` (no other owner can be owed any). */
export const titheSeal = (owner: string | null | undefined): number | undefined => {
  const m = owner ? /^p:(\d+)$/.exec(owner) : null;
  return m ? -Number(m[1]) : undefined;
};
/** W-153: tribute in a hold, as totals. */
export function titheIn(h: Hold): Cost | undefined {
  let out: Cost | undefined;
  for (const l of h.lots) if (isTithe(l) && l.n > EPS) (out ??= {})[l.r] = (out[l.r] ?? 0) + l.n;
  return out;
}
/** W-153: which lots a move draws and the seal they end with (a move without one leaves tribute where it is). */
export interface Draw { ok: (l: Lot) => boolean; to: (l: Lot) => number | undefined; goodsOnly?: true }

export const newHold = (): Hold => ({ lots: [], items: [] });

export function amount(h: Hold, r: GoodKind): number {
  let s = 0;
  for (const l of h.lots) if (l.r === r && !isTithe(l)) s += l.n;
  return s;
}

/** Goods of a hold as totals. */
export function totals(h: Hold, out: Cost = {}): Cost {
  for (const l of h.lots) if (!isTithe(l)) out[l.r] = (out[l.r] ?? 0) + l.n;
  return out;
}

/** Loads a hold fills: goods / CARRY (coin / COIN_LOAD) + items / ITEMS_PER_LOAD. */
export function loads(h: Hold): number {
  let g = 0;
  for (const l of h.lots) g += l.n / perLoad(l.r);
  return g + h.items.length / ITEMS_PER_LOAD;
}

/** Put n of r (origin o; sealed under contract s) into h; merges with a lot of the same good, origin and seal. */
export function put(h: Hold, r: GoodKind, n: number, o: string, s?: number): void {
  if (n <= EPS) return;
  const l = h.lots.find((x) => x.r === r && x.o === o && x.s === s);
  if (l) l.n += n;
  else h.lots.push(s === undefined ? { r, n, o } : { r, n, o, s });
}

export function putLots(h: Hold, lots: readonly Lot[]): void {
  for (const l of lots) put(h, l.r, l.n, l.o, l.s);
}

/** Take up to n of r from h, oldest lot first (tribute stays); the lots taken. */
export function take(h: Hold, r: GoodKind, n: number): Lot[] {
  const out: Lot[] = [];
  for (let i = 0; i < h.lots.length && n > EPS; ) {
    const l = h.lots[i];
    if (l.r !== r || isTithe(l)) {
      i++;
      continue;
    }
    const k = Math.min(l.n, n);
    out.push(l.s === undefined ? { r, n: k, o: l.o } : { r, n: k, o: l.o, s: l.s });
    l.n -= k;
    n -= k;
    if (l.n <= EPS) l.n = 0; // an empty lot stays (its good reads 0)
    i++;
  }
  return out;
}

/** Take up to n out of lot l itself (its origin and seal kept). */
function takeLot(l: Lot, n: number): Lot[] {
  const k = Math.min(l.n, n);
  l.n -= k;
  if (l.n <= EPS) l.n = 0;
  return k > EPS ? [l.s === undefined ? { r: l.r, n: k, o: l.o } : { r: l.r, n: k, o: l.o, s: l.s }] : [];
}

/** Take `cost` from the holds in order (all or nothing); false when together they lack any of it. */
export function takeFrom(holds: readonly Hold[], cost: Cost): boolean {
  for (const [r, v] of Object.entries(cost) as [GoodKind, number][]) {
    if (!(v > 0)) continue;
    let have = 0;
    for (const h of holds) have += amount(h, r);
    if (have < v - EPS) return false;
  }
  for (const [r, v] of Object.entries(cost) as [GoodKind, number][]) {
    let left = v;
    for (const h of holds) {
      if (left <= EPS) break;
      for (const l of take(h, r, left)) left -= l.n;
    }
  }
  return true;
}

/**
 * Move at most `max` loads of goods (good `r`, or the most plentiful first) and items from a to b; the loads moved.
 * `unsealed` (an unload): sealed lots (M6g) stay where they are. Tribute stays too, unless `draw` picks the lots.
 */
export function move(a: Hold, b: Hold, max: number, r?: GoodKind, maxItems = Infinity, unsealed = false, draw?: Draw): number {
  let left = max;
  const ok = (x: Lot) => x.n > EPS && (draw ? draw.ok(x) : !isTithe(x) && (!unsealed || x.s === undefined));
  while (left > EPS) {
    const l = r ? a.lots.find((x) => x.r === r && ok(x)) : [...a.lots].sort((x, y) => y.n - x.n).find(ok);
    if (l) {
      const n = Math.min(l.n, left * perLoad(l.r));
      if (draw) for (const t of takeLot(l, n)) put(b, t.r, t.n, t.o, draw.to(l));
      else putLots(b, unsealed ? takeLot(l, n) : take(a, l.r, n));
      left -= n / perLoad(l.r);
      continue;
    }
    if (r || draw?.goodsOnly || !a.items.length || left < 1 / ITEMS_PER_LOAD - EPS || maxItems-- <= 0) break;
    b.items.push(a.items.shift()!);
    left -= 1 / ITEMS_PER_LOAD;
  }
  return max - left;
}

/** Spoil `share` of every lot (fire: half the goods). */
export function spoil(h: Hold, share: number): void {
  for (const l of h.lots) l.n *= 1 - share;
  h.lots = h.lots.filter((l) => l.n > EPS);
}

/** Snapshot of a hold's first items (the view's hover and salvage pick; at most `max`). */
export const itemList = (h: Hold, max = 8): HoldItem[] => h.items.slice(0, max).map((i) => ({ uid: i.uid, def: i.def, rarity: i.rarity, ...(i.q !== undefined ? { q: i.q } : {}) }));

export const empty = (h: Hold) => !h.items.length && h.lots.every((l) => l.n <= EPS);
