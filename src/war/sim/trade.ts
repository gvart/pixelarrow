/**
 * M6 trade in the region sim (docs/WAR.md "Trade"; docs/impl/global-war-rebuild.md M6a-M6d): porters' packs, carts,
 * loot piles and safe zones. Holders and their lots are in ./holders.ts, store networks and chests in ./works.ts, carts
 * (siege-style engines) in ./siege.ts; ./index.ts drives the orders.
 *
 *  - porter: any man carries one load in his pack (PORTER.loads; CARRY goods or 5 items), PORTER.slow pace loaded.
 *    `load` takes from a holder (own store, own chest, own cart, any pile; an enemy chest with no unit of its owner
 *    within CHEST.guard, an enemy store once its influence is gone), `unload` puts into one (own store, own chest, own
 *    cart). One load per man every PORTER.every ticks once beside it. A squad crewing a cart loads the cart instead.
 *  - piles (W-46, every fight): a sim object on a tile, not a unit or a building. Everything a fallen man carried goes to
 *    a pile; the killed also leave their worn kit (PILE.wear condition off each piece), the captured leave it at the
 *    capture tile; a wrecked cart leaves its cargo, a burnt store or chest its contents (fire spoils PILE.spoil of the
 *    goods). Piles within PILE.merge tiles merge up to PILE.max loads. Any side picks them up (first hands win), a smith
 *    salvages an item in place (PILE.salvage ticks), and after PILE.decay ticks a pile is gone.
 *  - safe zones (M6d): region `safe` rects (a trade town's market court): no attack, fire, capture or looting inside, no
 *    falls so no piles; entry is refused for SAFE.tag ticks after a man hit or was hit; at most SAFE.units units of a
 *    player inside (his carts aside); a fighter inside SAFE.fighter ticks is walked out to the yard.
 */
import type { Item } from '../../data/items';
import type { RegionData } from '../types';
import { loads, newHold, putLots, spoil, type Hold, type Lot } from './holders';

export const PORTER = { loads: 1, slow: 0.9, every: 20 };
export const PILE = { merge: 1, max: 8, reach: 1.6, decay: 9000, wear: 25, spoil: 0.5, salvage: 300 };
/** M6b carts (docs/WAR.md "Carts"): loads, per-player cap; halt while a foe is within `halt` tiles and `resume` ticks after; capture: a foe beside it `capture` ticks with no unit of its owner's team within `guard`. */
export const CART = { cap: 2, emporos: 3, halt: 8, resume: 100, capture: 50, beside: 2, guard: 8, reach: 3, driver: 2, captureXp: 5 };
export const CART_LOADS: Record<'handcart' | 'wagon', number> = { handcart: 6, wagon: 12 };
/** Pack Mules (merchant node): a wagon carries 18. */
export const PACK_MULES = 18;
/** escort: the squad keeps round its cart, engages foes within `engage` tiles of it, comes back past `leash`. */
export const ESCORT = { engage: 12, leash: 20, ring: 3 };
/** M6d safe zones: combat tag ticks, units a player inside, ticks a fighter may stay. */
export const SAFE = { tag: 200, units: 6, fighter: 9000 };

export type Rect = { x: number; y: number; w: number; h: number };
export const inRect = (r: Rect, x: number, y: number) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
export const inRects = (rs: readonly Rect[] | undefined, x: number, y: number) => !!rs?.some((r) => inRect(r, x, y));

export interface Pile { id: number; x: number; y: number; hold: Hold; until: number; salv: number; by: number }

/** Loot piles of a region (saved through saveRoot; `nextId` set back by loadRoot). */
export function createPiles(region: RegionData) {
  const piles: Pile[] = [];
  let nextId = 0;
  return {
    piles,
    saveRoot: () => ({ piles, nextId }),
    loadRoot: (o: { nextId: number }) => void (nextId = o.nextId),
    /**
     * Goods and items fall at (x,y): into a pile within PILE.merge tiles with room (up to PILE.max loads), else a new
     * one; `spoilt`: fire spoils that share of the goods first. Nothing in a safe zone (no falls there).
     */
    drop(x: number, y: number, lots: readonly Lot[], items: readonly Item[], tick: number, spoilt = 0): Pile | null {
      const h = newHold();
      putLots(h, lots);
      if (spoilt > 0) spoil(h, spoilt);
      h.items.push(...items);
      if (!h.items.length && !h.lots.length) return null;
      if (inRects(region.safe, x, y)) return null;
      const add = loads(h);
      let p = piles.find((q) => (q.x - x) ** 2 + (q.y - y) ** 2 <= PILE.merge * PILE.merge && loads(q.hold) + add <= PILE.max);
      if (!p) piles.push((p = { id: nextId++, x, y, hold: newHold(), until: 0, salv: 0, by: -1 }));
      putLots(p.hold, h.lots);
      p.hold.items.push(...h.items);
      p.until = tick + PILE.decay;
      return p;
    },
    get: (id: number) => piles.find((p) => p.id === id),
    /** Piles past their time are gone (items scrapped, goods spoilt); emptied ones too. */
    tick(tick: number) {
      for (let i = piles.length - 1; i >= 0; i--) {
        const p = piles[i];
        if (tick >= p.until || (!p.hold.items.length && p.hold.lots.every((l) => l.n <= 1e-9))) piles.splice(i, 1);
      }
    },
  };
}
export type Piles = ReturnType<typeof createPiles>;
