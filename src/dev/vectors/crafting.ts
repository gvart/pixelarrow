/**
 * Crafting (src/war/sim/crafting.ts, with the rolls of src/data/recipes.ts) for the Godot port:
 *  - pure rules: craftRoll of every item and tool at several grades and seeds, craftGrade, itemRecipe, repairCost,
 *    crafterRefusal and fedOf;
 *  - queues: a seeded script of orders (crafts, cancels, repairs, salvage), work batches and supply uses over a dozen real
 *    workplaces (owners with terms, other teams, a building with no workplace), with logging deps (`fakeDeps`, mirrored
 *    in C++), run once with every dep and once with only the required ones. Each step records its result, the deps'
 *    calls, the queues, supplies and stocks.
 */
import { Rng } from '../../sim/rng';
import { CIV_TOOLS } from '../../data/classes';
import { ITEMS, RARITIES, type Item } from '../../data/items';
import { PROF_IDS, PROF_TREES, type ProfId } from '../../data/professions';
import { craftGrade, craftRoll, DISHES, RECIPES, type Goods, type Product } from '../../data/recipes';
import type { CraftOrder, GoodKind, WarEvent } from '../../war/types';
import { BUILDINGS } from '../../war/sim/economy';
import type { BuildingType } from '../../war/types';
import { createCrafting, crafterRefusal, fedOf, itemRecipe, repairCost, type CraftDeps, type Crafter } from '../../war/sim/crafting';

type Placed = Parameters<NonNullable<CraftDeps['till']>>[0];
const entries = (c: object) => Object.entries(c);

/** A team's first stock and a stranger's pack (the C++ fake reads them from the vectors). */
const STOCK0 = { food: 200, wood: 300, stone: 100, copper: 20, tin: 20, iron: 15, bronze: 30, silver: 6, salt: 20, herbs: 15, linen: 12, hides: 12, oil: 6, flax: 9, charcoal: 10, coin: 60, leather: 4 };
const PACK0 = { coin: 300, wood: 80, food: 40, bronze: 12, linen: 6, herbs: 6, copper: 6, tin: 6 };

/** Logging deps over per-team stocks and per-owner packs; carts: at most 2 rolled out a player. */
function fakeDeps(seed: number, full: boolean, log: unknown[]) {
  const stocks = new Map<number, Record<string, number>>(), packs = new Map<string, Record<string, number>>(), carts = new Map<string, number>();
  const stock = (t: number) => { let s = stocks.get(t); if (!s) stocks.set(t, (s = { ...STOCK0 })); return s; };
  const pack = (o: string) => { let s = packs.get(o); if (!s) packs.set(o, (s = { ...PACK0 })); return s; };
  const pay = (s: Record<string, number>, cost: Goods) => {
    for (const [k, v] of Object.entries(cost)) if ((s[k] ?? 0) < v!) return false;
    for (const [k, v] of Object.entries(cost)) s[k] = (s[k] ?? 0) - v!;
    return true;
  };
  const deps: CraftDeps = {
    seed,
    takeAt(team, x, y, cost) { const ok = pay(stock(team), cost); log.push(['takeAt', team, x, y, entries(cost), ok]); return ok; },
    addAt(team, x, y, res, n) { stock(team)[res] = (stock(team)[res] ?? 0) + n; log.push(['addAt', team, x, y, res, n]); },
    emit(ev: WarEvent) { log.push(['emit', ev]); },
  };
  if (full) {
    deps.pay = (b: Placed, c: Crafter, cost: Goods) => { const ok = pay(c.team === b.team ? stock(c.team) : pack(c.owner), cost); log.push(['pay', b.id, c.id, entries(cost), ok]); return ok; };
    deps.till = (b: Placed, res: GoodKind, n: number) => void log.push(['till', b.id, res, n]);
    deps.out = (b: Placed, payer, res: GoodKind, n: number) => void log.push(['out', b.id, payer.team, payer.owner, res, n]);
    deps.cart = (b: Placed, owner: string, type: string, check: boolean) => {
      const n = carts.get(owner) ?? 0, ok = n < 2;
      if (ok && !check) carts.set(owner, n + 1);
      log.push(['cart', b.id, b.team, owner, type, check, ok]);
      return ok;
    };
  }
  return { deps, stocks: () => [...stocks].map(([t, s]) => [t, entries(s)]), packs: () => [...packs].map(([o, s]) => [o, entries(s)]) };
}

/** The workplaces of the script: [id, team, type, owner, share, fee]. */
const PLACED: [number, number, BuildingType, string?, number?, number?][] = [
  [1, 0, 'forge'], [2, 0, 'forge2', 'p:1', 0.2, 10], [3, 1, 'forge3'], [4, 0, 'cookhouse2'], [5, 1, 'infirmary2', 'p:3', 0.5, 0],
  [6, 0, 'workshop2'], [7, 0, 'sortingFloor2', 'p:2', 0.1], [8, 2, 'olivePress'], [9, 1, 'stall2'], [10, 0, 'camp'], [11, 2, 'cookhouse3', 'p:4', 0, 5],
  [12, 1, 'workshop3', 'p:9', 0.25, 3], [13, 0, 'forge3', 'p:2'],
];

function queueRun(full: boolean) {
  const r = new Rng(full ? 515 : 616), log: unknown[] = [], fake = fakeDeps(full ? 77 : 0xabcdef, full, log);
  const crafting = createCrafting(fake.deps);
  const placed: Placed[] = PLACED.map(([id, team, type, owner, share, fee], i) => ({
    id, team, def: BUILDINGS[type], x: 10 + i * 3.5, y: 20 - i, ...(owner ? { owner } : {}), ...(share !== undefined ? { share } : {}), ...(fee !== undefined ? { fee } : {}),
  }));
  const toolIds = Object.keys(CIV_TOOLS), itemIds = Object.keys(ITEMS), recipeIds = Object.keys(RECIPES);
  const crafters: Crafter[] = Array.from({ length: 30 }, (_, id) => {
    const prof: ProfId | null = r.chance(0.08) ? null : r.pick(PROF_IDS), tree = prof ? PROF_TREES[prof].map((n) => n.id) : [];
    const perks = tree.length ? tree.filter(() => r.chance(0.6)) : [];
    if (r.chance(0.2)) perks.push(r.pick(PROF_TREES[r.pick(PROF_IDS)]).id); // a node of another tree: ignored
    const tool = r.chance(0.7) ? { uid: `t${id}`, def: r.pick(toolIds), rarity: r.pick(RARITIES), cond: 100 } : undefined;
    return {
      id: id + 100, prof, level: r.int(1, 10), perks, ...(tool ? { tool } : {}), work: r.pick([0.5, 1, 1.25, 2, 0.8]), bountiful: r.pick([0, 0, 0.1, 0.25]),
      owner: r.pick(['p:1', 'p:2', 'p:3', 'p:9', 'p:4']), name: `Civ ${id}`, ...(r.chance(0.5) ? { pid: `pid${id}` } : {}), team: r.pick([0, 0, 1, 2]),
    };
  });
  const atOf = (b: Placed) => b.def.workplace?.kind;
  const PROF_AT: Record<string, ProfId> = { forge: 'smith', cookhouse: 'cook', infirmary: 'physician', workshop: 'engineer', stall: 'merchant', sorting: 'forager', press: 'forager' };
  let tick = 0;
  const steps: unknown[] = [];
  for (let k = 0; k < 1600; k++) {
    const b = r.pick(placed), op = r.int(0, 11);
    let step: Record<string, unknown>;
    log.length = 0;
    if (op <= 2) {
      const own = recipeIds.filter((id) => RECIPES[id].at === atOf(b));
      const recipe = r.chance(0.85) && own.length ? r.pick(own) : r.chance(0.9) ? r.pick(recipeIds) : 'nope';
      const o: CraftOrder = { kind: 'craft', team: b.team, building: b.id, recipe };
      step = { op: 'order', b: b.id, o, out: crafting.order(o, b) };
    } else if (op === 3) {
      const o: CraftOrder = { kind: 'cancelCraft', team: b.team, building: b.id, order: r.int(1, 40) };
      step = { op: 'order', b: b.id, o, out: crafting.order(o, b) };
    } else if (op === 4) {
      const def = r.chance(0.3) ? r.pick(toolIds) : r.chance(0.95) ? r.pick(itemIds) : 'nothing';
      const item: Item = { uid: `r${k}`, def, rarity: r.pick(RARITIES), cond: r.pick([0, 20, 49, 50, 70, 95, 100]), ...(r.chance(0.4) ? { mc: r.pick([50, 60, 90, 100]) } : {}), ...(r.chance(0.3) ? { q: r.pick([0, 1, 2] as const) } : {}) };
      const o: CraftOrder = { kind: r.chance(0.6) ? 'repair' : 'salvage', team: b.team, building: b.id, owner: r.pick(['p:1', 'p:5']), item };
      step = { op: 'order', b: b.id, o, out: crafting.order(o, b) };
    } else if (op <= 10) {
      tick += r.int(1, 60);
      const at = crafters.filter((c) => r.chance(c.prof === PROF_AT[atOf(b) ?? ''] ? 0.6 : 0.1)), sec = r.pick([1, 5, 10, 30, 60, 120]);
      step = { op: 'work', b: b.id, crafters: at.map((c) => c.id), sec, tick, out: [...crafting.work(b, at, sec, tick)] };
    } else if (r.chance(0.5)) {
      const team = r.pick([0, 1, 2]), p = r.pick(Object.keys(DISHES).concat('bandage', 'amphora')) as Product, n = r.int(1, 8);
      step = { op: 'use', team, p, n, out: crafting.use(team, p, n) };
    } else {
      step = { op: 'drop', b: b.id, out: crafting.drop(b.id) };
    }
    step.b = b.id;
    step.log = [...log];
    step.has = placed.map((p) => crafting.has(p.id));
    step.snaps = crafting.snaps(b.id) ?? null;
    step.supplies = [...crafting.supplies].map(([t, s]) => [t, entries(s)]);
    step.stocks = fake.stocks();
    step.packs = fake.packs();
    steps.push(step);
  }
  return { full, seed: fake.deps.seed, stock0: entries(STOCK0), pack0: entries(PACK0), placed: placed.map((p, i) => ({ ...p, def: PLACED[i][2] })), crafters, steps, nextId: (crafting.saveRoot() as { nextId: number }).nextId };
}

function rules() {
  const r = new Rng(3131), defs = [...Object.keys(ITEMS), ...Object.keys(CIV_TOOLS)];
  const rolls = defs.flatMap((def, i) => [1, 5, 9, 13, 17, 19].filter((_, k) => (i + k) % 2 === 0).map((g) => {
    const seed: string | number = i % 3 === 0 ? `${i}|${g}|${def}` : (i % 3 === 1 ? r.int(0, 2 ** 31) * 2 : -r.int(1, 1000));
    const o = { ...(i % 4 !== 0 ? { masterwork: true } : {}), ...(i % 5 !== 0 ? { maker: `Maker ${i}` } : {}) };
    return [def, g, seed, o, craftRoll(def, g, seed, o)];
  }));
  const grades = Array.from({ length: 300 }, () => {
    const o = { level: r.int(0, 12), ...(r.chance(0.7) ? { toolTier: r.int(1, 3) } : {}), ...(r.chance(0.6) ? { toolRarity: r.pick([...RARITIES, 'junk']) as never } : {}), ...(r.chance(0.7) ? { wpLevel: r.int(1, 3) } : {}), ...(r.chance(0.3) ? { masterwork: true } : {}), ...(r.chance(0.2) ? { specialty: true } : {}) };
    return [o, craftGrade(o)];
  });
  const recipes = defs.map((d) => [d, itemRecipe(d)?.id ?? null]);
  const repairs = defs.flatMap((def) => {
    const rc = itemRecipe(def);
    if (!rc) return [];
    const item: Item = { uid: 'x', def, rarity: 'common', cond: r.pick([0, 10, 33, 49, 55, 99, 100]), ...(r.chance(0.5) ? { mc: r.pick([50, 51, 80, 100]) } : {}), ...(r.chance(0.3) ? { q: 2 as const } : {}) };
    return [[item, rc.id, repairCost(item, rc)]];
  });
  const refusals = Object.keys(RECIPES).flatMap((id) => Array.from({ length: 3 }, () => {
    const prof = r.pick(PROF_IDS), perks = PROF_TREES[prof].map((n) => n.id).filter(() => r.chance(0.4));
    return [prof, perks, id, crafterRefusal({ prof, perks }, RECIPES[id])];
  }));
  const fed = Object.keys(DISHES).flatMap((d) => [false, true].map((hc) => [d, hc, fedOf(d as Product, hc)]));
  return { rolls, grades, recipes, repairs, refusals, fed };
}

export const vectors = () => ({ rules: rules(), runs: [queueRun(true), queueRun(false)] });
