/**
 * Holders of goods (M6a, docs/WAR.md "Trade", "Goods live in places"): every good sits in one place: a store, a chest,
 * a team's home strongroom, a man's pack, a cart, a loot pile. A holder keeps lots (a good, an amount, its origin: the
 * region it was gathered, made or minted in) and items. Size is in loads: CARRY goods or ITEMS_PER_LOAD items a load.
 * Takes are first in, first out over the lots, so origins travel with the goods; an emptied lot stays at 0.
 */
import type { Item } from '../../data/items';
import type { ResourceKind } from '../types';
import { CARRY } from './economy';

export interface Lot { r: ResourceKind; n: number; o: string }
export interface Hold { lots: Lot[]; items: Item[] }
export type Cost = Partial<Record<ResourceKind, number>>;

/** Items a load (docs/WAR.md: 5 items = 1 load). */
export const ITEMS_PER_LOAD = 5;
const EPS = 1e-9;

export const newHold = (): Hold => ({ lots: [], items: [] });

export function amount(h: Hold, r: ResourceKind): number {
  let s = 0;
  for (const l of h.lots) if (l.r === r) s += l.n;
  return s;
}

/** Goods of a hold as totals. */
export function totals(h: Hold, out: Cost = {}): Cost {
  for (const l of h.lots) out[l.r] = (out[l.r] ?? 0) + l.n;
  return out;
}

/** Loads a hold fills: goods / CARRY + items / ITEMS_PER_LOAD. */
export function loads(h: Hold): number {
  let g = 0;
  for (const l of h.lots) g += l.n;
  return g / CARRY + h.items.length / ITEMS_PER_LOAD;
}

/** Put n of r (origin o) into h; merges with a lot of the same good and origin. */
export function put(h: Hold, r: ResourceKind, n: number, o: string): void {
  if (n <= EPS) return;
  const l = h.lots.find((x) => x.r === r && x.o === o);
  if (l) l.n += n;
  else h.lots.push({ r, n, o });
}

export function putLots(h: Hold, lots: readonly Lot[]): void {
  for (const l of lots) put(h, l.r, l.n, l.o);
}

/** Take up to n of r from h, oldest lot first; the lots taken. */
export function take(h: Hold, r: ResourceKind, n: number): Lot[] {
  const out: Lot[] = [];
  for (let i = 0; i < h.lots.length && n > EPS; ) {
    const l = h.lots[i];
    if (l.r !== r) {
      i++;
      continue;
    }
    const k = Math.min(l.n, n);
    out.push({ r, n: k, o: l.o });
    l.n -= k;
    n -= k;
    if (l.n <= EPS) l.n = 0; // an empty lot stays (its good reads 0)
    i++;
  }
  return out;
}

/** Take `cost` from the holds in order (all or nothing); false when together they lack any of it. */
export function takeFrom(holds: readonly Hold[], cost: Cost): boolean {
  for (const [r, v] of Object.entries(cost) as [ResourceKind, number][]) {
    if (!(v > 0)) continue;
    let have = 0;
    for (const h of holds) have += amount(h, r);
    if (have < v - EPS) return false;
  }
  for (const [r, v] of Object.entries(cost) as [ResourceKind, number][]) {
    let left = v;
    for (const h of holds) {
      if (left <= EPS) break;
      for (const l of take(h, r, left)) left -= l.n;
    }
  }
  return true;
}

/** Move at most `max` loads of goods (good `r`, or the most plentiful first) and items from a to b; the loads moved. */
export function move(a: Hold, b: Hold, max: number, r?: ResourceKind, maxItems = Infinity): number {
  let left = max;
  while (left > EPS) {
    const l = r ? a.lots.find((x) => x.r === r && x.n > EPS) : [...a.lots].sort((x, y) => y.n - x.n).find((x) => x.n > EPS);
    if (l) {
      const n = Math.min(l.n, left * CARRY);
      putLots(b, take(a, l.r, n));
      left -= n / CARRY;
      continue;
    }
    if (r || !a.items.length || left < 1 / ITEMS_PER_LOAD - EPS || maxItems-- <= 0) break;
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

export const empty = (h: Hold) => !h.items.length && h.lots.every((l) => l.n <= EPS);
