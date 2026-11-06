/**
 * Loot piles and safe zones (src/war/sim/trade.ts) for the Godot port, on a real region with a market court (ammos):
 * a seeded script of drops round the court (claimed kit, fire-spoilt goods, empty drops), opens, decay ticks and a
 * save/load of the id counter, with the piles after every step.
 */
import { Rng } from '../../sim/rng';
import type { Item } from '../../data/items';
import type { GoodKind, RegionData } from '../../war/types';
import { parseRegion } from '../../war/region/schema';
import { createPiles, inRect, inRects, PILE, type Pile } from '../../war/sim/trade';
import type { Lot } from '../../war/sim/holders';

const regionFiles = import.meta.glob('../../war/regions/*.json', { eager: true, import: 'default' });
const GOODS: GoodKind[] = ['food', 'wood', 'coin', 'iron', 'ration'];
const OWNERS = ['p:1', 'p:2', 'mob'];
const GOT = [0, 3, 50];

const pileOut = (p: Pile) => ({
  id: p.id, x: p.x, y: p.y, until: p.until, salv: p.salv, by: p.by, ...(p.claim ? { claim: [p.claim.owner, p.claim.name, p.claim.until] } : {}),
  lots: p.hold.lots.map((l) => (l.s === undefined ? [l.r, l.n, l.o] : [l.r, l.n, l.o, l.s])), items: p.hold.items.map((i) => i.uid),
});

export const vectors = () => {
  const region: RegionData = parseRegion(regionFiles['../../war/regions/ammos.json']), safe = region.safe!;
  const r = new Rng(9001), piles = createPiles(region), s0 = safe[0];
  let uid = 0, tick = 0;
  const steps: unknown[] = [];
  for (let k = 0; k < 700; k++) {
    const op = r.int(0, 9);
    let step: Record<string, unknown>;
    tick += r.int(0, 400);
    if (op <= 5) {
      // round the court: inside, on its edge, or a few tiles off
      const x = s0.x - 4 + r.int(0, s0.w + 8) + r.pick([0, 0.5, 0.3]), y = s0.y - 4 + r.int(0, s0.h + 8) + r.pick([0, 0.5, 0.7]);
      const lots: Lot[] = Array.from({ length: r.int(0, 3) }, () => ({ r: r.pick(GOODS), n: r.chance(0.1) ? 0 : r.range(0, 25), o: r.pick(['ammos', 'dodona']), ...(r.chance(0.2) ? { s: 4 } : {}) }));
      const items: Item[] = Array.from({ length: r.chance(0.5) ? r.int(0, 6) : 0 }, () => ({ uid: `i${uid++}`, def: 'xiphos', rarity: 'common', cond: 50 }));
      const spoilt = r.pick([0, 0, PILE.spoil, 1]);
      const claim = r.chance(0.3) ? { owner: r.pick(OWNERS), name: `man ${k}`, until: tick + r.int(0, 6000) } : undefined;
      const p = piles.drop(x, y, lots, items, tick, spoilt, claim);
      step = { op: 'drop', x, y, lots: lots.map((l) => (l.s === undefined ? [l.r, l.n, l.o] : [l.r, l.n, l.o, l.s])), items: items.map((i) => i.uid), tick, spoilt, ...(claim ? { claim: [claim.owner, claim.name, claim.until] } : {}), out: p ? p.id : null };
    } else if (op <= 7) {
      const opens = piles.piles.map((p) => OWNERS.map((o) => piles.open(p, o, tick)));
      step = { op: 'open', tick, opens, got: GOT.map((id) => piles.get(id)?.id ?? null) };
    } else if (op === 8) {
      piles.tick(tick);
      step = { op: 'tick', tick };
    } else {
      const root = piles.saveRoot() as { nextId: number };
      const nextId = root.nextId + r.int(0, 2);
      piles.loadRoot({ nextId });
      step = { op: 'load', nextId };
    }
    step.piles = piles.piles.map(pileOut);
    steps.push(step);
  }
  const pts = Array.from({ length: 300 }, () => [s0.x - 3 + r.range(0, s0.w + 6), s0.y - 3 + r.range(0, s0.h + 6)]);
  return {
    region: region.id, owners: OWNERS, got: GOT,
    steps,
    rects: pts.map(([x, y]) => [x, y, inRect(s0, x, y), inRects(safe, x, y), inRects(undefined, x, y), inRects(s0.gates, x, y)]),
  };
};
