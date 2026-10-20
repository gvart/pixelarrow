/**
 * Cargo between a region room's live holders and the server (M6e-M6h; docs/WAR.md "Trade"): the room's bridges move
 * bundles (lots and items) out of and into the sim's holds (WarBuildSim.cargo: packs, carts, chests, stores, the team's
 * home strongroom) for stalls and warehouses, hand-offs, world transits and crafted items. Pure: tests drive it on
 * plain holds.
 */
import { CARRY } from '../../../src/war/sim/economy';
import { ITEMS_PER_LOAD, loads, put, type Hold, type Lot } from '../../../src/war/sim/holders';
import type { Item } from '../../../src/data/items';

export interface Slot { hold: Hold; cap: number }
/** Goods and items in flight. */
export interface Bundle { lots: Lot[]; items: Item[] }

const EPS = 1e-6;
export const emptyBundle = (): Bundle => ({ lots: [], items: [] });

export function bundleLoads(b: Bundle): number {
  return b.lots.reduce((a, l) => a + l.n, 0) / CARRY + b.items.length / ITEMS_PER_LOAD;
}

/** Goods of a bundle by good. */
export function bundleGoods(b: Bundle): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of b.lots) out[l.r] = (out[l.r] ?? 0) + l.n;
  return out;
}

/** What the slots hold, by good (sealed lots too) and item uids. */
export function contents(slots: readonly Slot[]): { goods: Record<string, number>; items: Item[] } {
  const goods: Record<string, number> = {}, items: Item[] = [];
  for (const s of slots) {
    for (const l of s.hold.lots) if (l.n > EPS) goods[l.r] = (goods[l.r] ?? 0) + l.n;
    items.push(...s.hold.items);
  }
  return { goods, items };
}

/** Put a bundle into the slots as far as they have room (first slot first); what did not fit comes back. */
export function fill(slots: readonly Slot[], b: Bundle): Bundle {
  const rest = emptyBundle();
  const lots = b.lots.map((l) => ({ ...l }));
  for (const s of slots) {
    for (const l of lots) {
      const room = (s.cap - loads(s.hold)) * CARRY;
      if (room <= EPS || l.n <= EPS) continue;
      const k = Math.min(room, l.n);
      put(s.hold, l.r, k, l.o, l.s);
      l.n -= k;
    }
  }
  for (const l of lots) if (l.n > EPS) rest.lots.push(l);
  const items = [...b.items];
  for (const s of slots) while (items.length && s.cap - loads(s.hold) >= 1 / ITEMS_PER_LOAD - EPS) s.hold.items.push(items.shift()!);
  rest.items = items;
  return rest;
}

/** Free loads in the slots. */
export const room = (slots: readonly Slot[]) => slots.reduce((a, s) => a + Math.max(0, s.cap - loads(s.hold)), 0);

/**
 * Take `goods` and items `uids` out of the slots, all or nothing (null: they lack some). Sealed lots are taken only
 * under their own seal (`seal`), never as plain goods.
 */
export function takeOut(slots: readonly Slot[], goods: Record<string, number>, uids: readonly string[] = [], seal?: number): Bundle | null {
  for (const [r, n] of Object.entries(goods)) {
    let have = 0;
    for (const s of slots) for (const l of s.hold.lots) if (l.r === r && l.s === seal) have += l.n;
    if (have < n - EPS) return null;
  }
  const all = slots.flatMap((s) => s.hold.items.map((it) => it.uid));
  if (uids.some((u) => !all.includes(u))) return null;
  const out = emptyBundle();
  for (const [r, n] of Object.entries(goods)) {
    let left = n;
    for (const s of slots)
      for (const l of s.hold.lots) {
        if (l.r !== r || l.s !== seal || left <= EPS) continue;
        const k = Math.min(l.n, left);
        l.n -= k;
        left -= k;
        out.lots.push(seal === undefined ? { r: l.r, n: k, o: l.o } : { r: l.r, n: k, o: l.o, s: seal });
      }
  }
  for (const s of slots) {
    const keep: Item[] = [];
    for (const it of s.hold.items) (uids.includes(it.uid) ? out.items : keep).push(it);
    s.hold.items = keep;
  }
  for (const s of slots) s.hold.lots = s.hold.lots.filter((l) => l.n > EPS);
  return out;
}

/** Everything out of the slots (a world transit). */
export function takeAll(slots: readonly Slot[]): Bundle {
  const out = emptyBundle();
  for (const s of slots) {
    for (const l of s.hold.lots) if (l.n > EPS) out.lots.push({ ...l });
    out.items.push(...s.hold.items);
    s.hold.lots = [];
    s.hold.items = [];
  }
  return out;
}

/** Lots under seal `seal` in the slots, taken out (a carry contract delivered). */
export function takeSealed(slots: readonly Slot[], seal: number): Bundle {
  const out = emptyBundle();
  for (const s of slots) {
    for (const l of s.hold.lots) if (l.s === seal && l.n > EPS) out.lots.push({ ...l });
    s.hold.lots = s.hold.lots.filter((l) => l.s !== seal);
  }
  return out;
}
