/**
 * Crafting queues of the war sim (M5h2, docs/WAR.md "Crafting and professions", "How it stays light"). One queue per
 * workplace (BUILDINGS workplace), at most CRAFT.queue orders; it runs on the civilian loop only (every CIV.every
 * ticks). Each workplace level is a crafter slot: the first `level` civilians at work there take the oldest waiting
 * order they may make (their class, its node and needs), the inputs leave the store network where the workplace stands
 * (M6a, works.takeAt) as it starts, and it takes recipe secs / the crafter's work rate. One roll at completion
 * (`craftRoll`, seeded by the sim seed, building and order) for items; the item leaves in a `crafted` event for the
 * server to mint. Goods go to the nearest store of that network, dishes, remedies and kits to the team supplies; a cart
 * (M6b) rolls out beside the workshop for the crafter's player.
 */
import { CIV_TOOLS } from '../../data/classes';
import { itemDef, ITEMS, type Item } from '../../data/items';
import { heldNodes, type ProfId } from '../../data/professions';
import { BATCH_NODES, DISHES, FED_CAP, craftGrade, craftRoll, materialGoods, materialOf, RECIPES, recipeFor, toolRecipe, type Goods, type Product, type Recipe } from '../../data/recipes';
import type { CraftOrder, QueueSnap, ResourceKind, WarEvent } from '../types';
import type { BuildingDef } from './economy';

export const CRAFT = {
  /** Orders a queue holds. */
  queue: 5,
  /** Batch x1.5 with Big Pot / Anatomist / Steward; Steward refines on 80% of the input; Alloy: bronze x1.2 a smelt. */
  batch: 1.5, steward: 0.8, alloy: 1.2,
  /** Repair: per `step` condition, `share` of the recipe's main material (at least 1) and of its time; masterwork x`mw` time. */
  step: 10, share: 0.1, mw: 0.75,
  /** A repair started below `worn` takes `loss` off max condition; at max `floor` the item can only be salvaged. */
  worn: 50, loss: 5, floor: 50,
  /** Salvage: share of the recipe's inputs back (Goldsmith 60%), in `share` of its time. */
  salvage: 0.3, goldsmith: 0.6,
};

/** A civilian at work at a workplace, as the queue sees him. */
export interface Crafter {
  id: number; prof: ProfId | null; level: number; perks: readonly string[]; tool?: Item; work: number; bountiful: number;
  owner: string; name: string; pid?: string;
}
interface Placed { id: number; team: number; def: BuildingDef; x: number; y: number }
interface QOrder { id: number; kind: 'craft' | 'repair' | 'salvage'; recipe: Recipe; item?: Item; owner?: string; by: number; left: number; total: number; taken: Goods | null }

export interface CraftDeps {
  seed: number;
  /** Pay from the store network of `team` at (x,y) (M6a); false (nothing taken) when it lacks any of it. */
  takeAt(team: number, x: number, y: number, cost: Partial<Record<ResourceKind, number>>): boolean;
  addAt(team: number, x: number, y: number, res: ResourceKind, n: number): void;
  emit(ev: WarEvent): void;
  /** M6b: a cart of `owner` rolls out of workshop b (false: no room, his cap or the quota; the order waits). */
  cart?(b: Placed, owner: string, type: string, check: boolean): boolean;
}

/** The recipe an item is made by (items and tools; null: a drop-only item). */
export const itemRecipe = (def: string): Recipe | null => (CIV_TOOLS[def] ? toolRecipe(def) : recipeFor(itemDef(def)));

/** Why `c` may not make `r` (null: he may): his class, node and needs. Repairs and salvage need only the class (the root). */
export function crafterRefusal(c: Pick<Crafter, 'prof' | 'perks'>, r: Recipe): 'class' | 'node' | null {
  if (c.prof !== r.prof) return 'class';
  const held = heldNodes(r.prof, c.perks);
  return held.has(r.node) && (r.needs ?? []).every((n) => held.has(n)) ? null : 'node';
}

/** Repair cost and seconds of an item (null: whole, or worn past mending). */
export function repairCost(item: Item, r: Recipe): { inputs: Goods; secs: number } | null {
  const mc = item.mc ?? 100;
  if (mc <= CRAFT.floor || item.cond >= mc) return null;
  const steps = Math.ceil((mc - item.cond) / CRAFT.step);
  const main = (Object.keys(CIV_TOOLS[item.def] ? r.inputs : materialGoods(materialOf(itemDef(item.def)), 1))[0] ?? Object.keys(r.inputs)[0]) as keyof Goods;
  const n = Math.max(1, Math.round((r.inputs[main] ?? 1) * CRAFT.share * steps));
  return { inputs: { [main]: n }, secs: r.secs * CRAFT.share * steps * (item.q === 2 ? CRAFT.mw : 1) };
}

export function createCrafting(deps: CraftDeps) {
  const queues = new Map<number, QOrder[]>();
  const supplies = new Map<number, Partial<Record<Product, number>>>();
  let nextId = 1;

  const supply = (team: number) => {
    let s = supplies.get(team);
    if (!s) supplies.set(team, (s = {}));
    return s;
  };

  /** Queue an order at workplace b (done, of the order's team); false: refused (kind, level, queue full, nothing to mend). */
  const order = (o: CraftOrder, b: Placed): boolean => {
    const wp = b.def.workplace;
    if (!wp || b.team !== o.team) return false;
    const q = queues.get(b.id) ?? [];
    if (o.kind === 'cancelCraft') {
      const i = q.findIndex((x) => x.id === o.order);
      if (i < 0) return false;
      const [x] = q.splice(i, 1);
      if (x.taken) for (const [k, v] of Object.entries(x.taken) as [ResourceKind, number][]) deps.addAt(b.team, b.x, b.y, k, v);
      return true;
    }
    if (q.length >= CRAFT.queue) return false;
    let r: Recipe | null, left: number;
    if (o.kind === 'craft') {
      r = RECIPES[o.recipe] ?? null;
      if (!r || r.kind === 'engine' || r.kind === 'fort') return false; // engines and forts: built on site (M5h3)
      left = r.secs;
    } else {
      r = CIV_TOOLS[o.item.def] || ITEMS[o.item.def] ? itemRecipe(o.item.def) : null;
      if (!r) return false;
      const rc = o.kind === 'repair' ? repairCost(o.item, r) : { secs: r.secs * CRAFT.share };
      if (!rc) return false;
      left = rc.secs;
    }
    if (r.at !== wp.kind || (o.kind === 'craft' && r.lv > wp.level)) return false; // any level of the chain mends and salvages
    q.push({ id: nextId++, kind: o.kind === 'craft' ? 'craft' : o.kind, recipe: r, ...(o.kind !== 'craft' ? { item: { ...o.item }, owner: o.owner } : {}), by: -1, left, total: left, taken: null });
    queues.set(b.id, q);
    return true;
  };

  /** Inputs of an order as it starts. */
  const inputsOf = (x: QOrder, c: Crafter): Goods => {
    if (x.kind === 'salvage') return {};
    if (x.kind === 'repair') return repairCost(x.item!, x.recipe)!.inputs;
    const st = x.recipe.kind === 'good' && heldNodes(x.recipe.prof, c.perks).has('steward');
    if (!st) return x.recipe.inputs;
    const out: Goods = {};
    for (const [k, v] of Object.entries(x.recipe.inputs) as [keyof Goods, number][]) out[k] = Math.ceil(v * CRAFT.steward);
    return out;
  };

  /** An order is done: its output. Returns the XP of the job. */
  const finish = (b: Placed, x: QOrder, c: Crafter, tick: number): number => {
    const r = x.recipe, team = b.team, held = heldNodes(r.prof, c.perks);
    const ev = (what: 'craft' | 'repair' | 'salvage', item: Item, owner: string) =>
      deps.emit({ t: tick, kind: 'crafted', order: x.id, building: b.id, team, owner, ...(c.pid ? { pid: c.pid } : {}), recipe: r.id, what, item });
    if (x.kind === 'repair') {
      const it = x.item!, mc = (it.mc ?? 100) - (it.cond < CRAFT.worn ? CRAFT.loss : 0);
      ev('repair', { ...it, cond: mc, ...(mc < 100 || it.mc !== undefined ? { mc } : {}) }, x.owner!);
      return 1;
    }
    if (x.kind === 'salvage') {
      const share = held.has('goldsmith') ? CRAFT.goldsmith : CRAFT.salvage;
      for (const [k, v] of Object.entries(r.inputs) as [ResourceKind, number][]) if (Math.floor(v * share) > 0) deps.addAt(team, b.x, b.y, k, Math.floor(v * share));
      ev('salvage', x.item!, x.owner!);
      return 1;
    }
    if (r.out.item || r.out.tool) {
      const tool = c.tool, ttier = tool ? (CIV_TOOLS[tool.def]?.tier ?? 1) : 1;
      const g = craftGrade({ level: c.level, toolTier: ttier, toolRarity: tool?.rarity, wpLevel: b.def.workplace!.level, masterwork: held.has('masterwork') });
      ev('craft', craftRoll(r.out.item ?? r.out.tool!, g, `${deps.seed}|${b.id}|${x.id}`, { masterwork: held.has('masterwork'), maker: c.name }), c.owner);
      return r.xp;
    }
    if (r.kind === 'cart') {
      deps.cart?.(b, c.owner, r.out.engine!, false);
      return r.xp;
    }
    const node = BATCH_NODES[r.kind];
    // M6a: coin is exact (1 silver : 20 coin), no batch bonus
    const n = r.kind === 'coin' ? r.out.n : r.out.n * (node && held.has(node) ? CRAFT.batch : 1) * (r.kind === 'smelt' && held.has('alloy') ? CRAFT.alloy : 1) * (1 + c.bountiful);
    if (r.out.good) deps.addAt(team, b.x, b.y, r.out.good, n);
    else if (r.out.product) supply(team)[r.out.product] = (supply(team)[r.out.product] ?? 0) + n;
    return r.xp;
  };

  /**
   * One civilian-loop batch at workplace b with the civilians at work there (in id order): the first `level` take and
   * work orders. Returns the crafters busy on an order this batch, with the XP each earned.
   */
  const work = (b: Placed, crafters: readonly Crafter[], sec: number, tick: number): Map<number, number> => {
    const busy = new Map<number, number>();
    const q = queues.get(b.id);
    if (!q?.length) return busy;
    const slots = crafters.slice(0, b.def.workplace!.level);
    const here = new Set(slots.map((c) => c.id));
    for (const x of q) if (x.by >= 0 && !here.has(x.by)) x.by = -1; // he left: the order waits for another
    for (const c of slots) {
      let x = q.find((o) => o.by === c.id);
      if (!x) {
        x = q.find((o) => o.by < 0 && (o.kind === 'craft' ? !crafterRefusal(c, o.recipe) : c.prof === o.recipe.prof) && (o.recipe.kind !== 'cart' || !!deps.cart?.(b, c.owner, o.recipe.out.engine!, true))
          && (o.taken || deps.takeAt(b.team, b.x, b.y, (o.taken = inputsOf(o, c))) || ((o.taken = null), false)));
        if (!x) continue;
        x.by = c.id;
      }
      busy.set(c.id, 0);
      x.left -= sec * c.work;
      if (x.left > 1e-9) continue;
      q.splice(q.indexOf(x), 1);
      busy.set(c.id, finish(b, x, c, tick));
    }
    return busy;
  };

  return {
    order,
    work,
    /** Save and restore (./state.ts): the queues and supplies are refilled in place, the order counter set. */
    saveRoot: () => ({ queues, supplies, nextId }),
    loadRoot(r: { nextId: number }) {
      nextId = r.nextId;
    },
    /** A workplace gone (destroyed, cancelled): its queue goes with it (inputs taken are lost). */
    drop: (id: number) => queues.delete(id),
    has: (id: number) => (queues.get(id)?.length ?? 0) > 0,
    snaps: (id: number): QueueSnap[] | undefined => {
      const q = queues.get(id);
      return q?.length ? q.map((x) => ({ id: x.id, recipe: x.kind === 'craft' ? x.recipe.id : x.item!.def, kind: x.kind, by: x.by, progress: x.total > 0 ? Math.min(1, 1 - x.left / x.total) : 1 })) : undefined;
    },
    supplies,
    supply,
    /** Take n of a product from the team's supplies; false (nothing taken) when it has fewer. */
    use(team: number, p: Product, n: number): boolean {
      const s = supply(team);
      if ((s[p] ?? 0) < n) return false;
      s[p]! -= n;
      return true;
    },
    suppliesSnap: () => (supplies.size ? Object.fromEntries([...supplies].map(([t, s]) => [t, { ...s }])) : undefined),
  };
}

export type Crafting = ReturnType<typeof createCrafting>;

/** The fed record a dish gives (clamped to FED_CAP a combat stat) and how many ticks it lasts (Head Cook: x1.5). */
export function fedOf(d: Product, headCook = false) {
  const f = DISHES[d]!;
  return {
    inn: Math.max(f.inn, 1 / (1 + FED_CAP)), melee: Math.min(f.melee, FED_CAP), missile: Math.min(f.missile, FED_CAP), acc: Math.min(f.acc, FED_CAP),
    heal: f.heal, ticks: Math.round(f.mins * 600 * (headCook ? 1.5 : 1)),
  };
}
