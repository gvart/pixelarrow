/**
 * Holders of goods (src/war/sim/holders.ts) for the Godot port: a seeded script of puts, takes, moves (by good, most
 * plentiful first, unsealed, with tribute draws), spoils and pays over four holds, with every result and the holds after
 * each step. Draws are named so the C++ side builds the same ones (`DRAWS`).
 */
import { Rng } from '../../sim/rng';
import type { Item } from '../../data/items';
import type { GoodKind } from '../../war/types';
import {
  amount, empty, isTithe, itemList, loads, move, newHold, perLoad, put, putLots, spoil, take, takeFrom, titheIn, titheSeal, totals,
  type Draw, type Hold,
} from '../../war/sim/holders';

const GOODS: GoodKind[] = ['food', 'wood', 'stone', 'coin', 'ration', 'iron', 'hides', 'dragonbone'];
const ORIGINS = ['dodona', 'elaia', 'kyrene-e', 'home:1'];
const SEALS = [undefined, undefined, undefined, 3, 9, -2, -5];

/** Draws by name (the C++ side builds the same): pay out tribute of p:2, set aside plain goods for p:5, any lot keeping its seal. */
export const DRAWS: Record<string, Draw> = {
  payTithe: { ok: (l) => isTithe(l) && l.s === -2, to: () => undefined, goodsOnly: true },
  setTithe: { ok: (l) => !isTithe(l) && l.s === undefined, to: () => -5 },
  keep: { ok: () => true, to: (l) => l.s },
};

const state = (hs: Hold[]) => hs.map((h) => ({ lots: h.lots.map((l) => (l.s === undefined ? [l.r, l.n, l.o] : [l.r, l.n, l.o, l.s])), items: h.items.map((i) => i.uid) }));

export const vectors = () => {
  const r = new Rng(4242), holds: Hold[] = [newHold(), newHold(), newHold(), newHold()];
  let uid = 0;
  const item = (): Item => ({ uid: `u${uid++}`, def: r.pick(['xiphos', 'kopis', 'hoplon', 'ladle']), rarity: r.pick(['common', 'rare']), cond: r.int(10, 100), ...(r.chance(0.3) ? { q: r.int(0, 2) as 0 | 1 | 2 } : {}) });
  const amt = () => (r.chance(0.2) ? r.int(0, 3) * 1e-10 : r.chance(0.5) ? r.int(1, 40) : r.range(0, 30));
  const steps: unknown[] = [];
  for (let k = 0; k < 900; k++) {
    const a = r.int(0, 3), b = (a + r.int(1, 3)) % 4, g = r.pick(GOODS), op = r.int(0, 9);
    let step: Record<string, unknown>;
    if (op <= 2) {
      const n = amt(), o = r.pick(ORIGINS), s = r.pick(SEALS);
      put(holds[a], g, n, o, s);
      step = { op: 'put', a, g, n, o, ...(s !== undefined ? { s } : {}) };
    } else if (op === 3) {
      const lots = Array.from({ length: r.int(0, 3) }, () => ({ r: r.pick(GOODS), n: amt(), o: r.pick(ORIGINS), ...(r.chance(0.3) ? { s: r.pick([3, -2]) } : {}) }));
      putLots(holds[a], lots);
      step = { op: 'putLots', a, lots: lots.map((l) => (l.s === undefined ? [l.r, l.n, l.o] : [l.r, l.n, l.o, l.s])) };
    } else if (op === 4) {
      const n = amt();
      const out = take(holds[a], g, n);
      step = { op: 'take', a, g, n, out: out.map((l) => (l.s === undefined ? [l.r, l.n, l.o] : [l.r, l.n, l.o, l.s])) };
    } else if (op === 5) {
      const cost: Partial<Record<GoodKind, number>> = {};
      for (let i = r.int(0, 3); i > 0; i--) cost[r.pick(GOODS)] = r.chance(0.1) ? 0 : r.int(1, 30);
      const hs = [a, b], out = takeFrom(hs.map((i) => holds[i]), cost);
      step = { op: 'takeFrom', hs, cost: Object.entries(cost), out };
    } else if (op <= 7) {
      const max = r.pick([0, 0.2, 0.5, 1, 1.7, 3, 10]), byGood = r.chance(0.3) ? g : undefined;
      const maxItems = r.chance(0.3) ? r.int(0, 2) : undefined, unsealed = r.chance(0.3), draw = r.chance(0.3) ? r.pick(Object.keys(DRAWS)) : undefined;
      const out = move(holds[a], holds[b], max, byGood, maxItems ?? Infinity, unsealed, draw ? DRAWS[draw] : undefined);
      step = { op: 'move', a, b, max, ...(byGood ? { r: byGood } : {}), ...(maxItems !== undefined ? { maxItems } : {}), unsealed, ...(draw ? { draw } : {}), out };
    } else if (op === 8) {
      const items = Array.from({ length: r.int(0, 3) }, item);
      holds[a].items.push(...items);
      step = { op: 'items', a, items };
    } else {
      const share = r.pick([0, 0.5, 1, 0.25]);
      spoil(holds[a], share);
      step = { op: 'spoil', a, share };
    }
    // every query of the hold just touched
    const h = holds[a];
    step.a = a;
    step.q = {
      amount: GOODS.map((x) => amount(h, x)), totals: Object.entries(totals(h)), loads: loads(h), empty: empty(h),
      tithe: Object.entries(titheIn(h) ?? {}), list: itemList(h, 3),
    };
    step.holds = state(holds);
    steps.push(step);
  }
  return {
    goods: GOODS,
    steps,
    perLoad: [...GOODS, undefined, 'x'].map((g) => [g ?? null, perLoad(g)]),
    seals: ['p:7', 'p:0', 'p:12345678901', 'p:', 'q:7', 'p:7x', '', null].map((o) => [o, titheSeal(o) ?? null]),
  };
};
