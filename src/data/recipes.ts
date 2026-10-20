/**
 * Recipes and crafted item rolls (docs/WAR.md "Crafting and professions", W-40).
 *
 * Every base item (`BASE_ITEMS`; set pieces and named legendaries stay drops) has a smith recipe built from its slot,
 * tier and material (`recipeFor`); the 18 civilian tools have engineer recipes; dishes, remedies, engines,
 * fortifications, refined goods and caravan goods are data rows. A recipe runs at a workplace of at least its level, by
 * a crafter holding its node (and `needs`); inputs leave the team stock when the order starts, time is divided by the
 * crafter's work rate.
 *
 * Crafted weapons, armour and tools roll rarity from the craft grade G (`RARITY_ODDS`, capped by tier), quality (crude,
 * fine, masterwork) and random stats from the war pool (`craftRoll`), seeded by the order: the same seed, the same item.
 */
import { hashString, Rng } from '../sim/rng';
import { AFFIX_STEPS, AFFIXES, encodeAffixes, powerPool, warAffixPool, WAR_POWER_IGNORED, type AffixId } from './affixes';
import { CIV_TOOLS, CLASSES, type ClassId } from './classes';
import { armorWeight, weaponFamily } from './gearRules';
import { BASE_ITEMS, ITEMS, RARITIES, type Item, type ItemDef, type ItemMaterial, type Rarity } from './items';
import type { ProfId } from './professions';

/** Stock kinds of the war (src/war/types.ts ResourceKind): the M2a ones and the 7 crafting goods (raw hides, flax, herbs; refined charcoal, leather, linen, oil). */
export const CRAFT_GOODS = ['hides', 'flax', 'herbs', 'charcoal', 'leather', 'linen', 'oil'] as const;
export type CraftGood = (typeof CRAFT_GOODS)[number];
export type Good = 'food' | 'wood' | 'stone' | 'marble' | 'copper' | 'tin' | 'iron' | 'bronze' | 'silver' | 'salt' | 'pitch' | 'coin' | CraftGood;
export type Goods = Partial<Record<Good, number>>;

/** Where a recipe runs: a workplace chain, a store building (camp, storehouse, fort), an olive press, or on site (engines, forts: M5h3). */
export type Workplace = 'forge' | 'cookhouse' | 'infirmary' | 'workshop' | 'stall' | 'sorting' | 'press' | 'store' | 'site';
export type RecipeKind = 'item' | 'tool' | 'smelt' | 'dish' | 'remedy' | 'good' | 'caravan' | 'engine' | 'fort' | 'coin' | 'cart';
/** Products that are neither stock goods nor items: dishes, remedies, kits, caravan goods (a team's supplies). */
export type Product = 'ration' | 'bread' | 'salt_pork' | 'lentil_soup' | 'fish_stew' | 'kykeon' | 'black_broth' | 'march_stores' | 'feast'
  | 'bandage' | 'salve' | 'theriac' | 'tent_kit' | 'amphora' | 'fish_jar' | 'linen_bale' | 'ingot_crate';

export interface Recipe {
  id: string;
  kind: RecipeKind;
  prof: ProfId;
  /** The node the crafter needs, and any others (tier 2: journeyman, tier 3: master). */
  node: string;
  needs?: string[];
  at: Workplace;
  /** Least workplace level. */
  lv: number;
  inputs: Goods;
  secs: number;
  out: { item?: string; tool?: string; good?: Good; product?: Product; engine?: string; fort?: string; n: number };
  /** Item tier (1-3); XP per job = tier (dishes, remedies and refining 1). */
  tier: number;
  xp: number;
  /** Fortifications: inputs are per tile of line. */
  perTile?: boolean;
}

// ------------------------------------------------------------------ smith template

type SlotRow = { main: [number, number, number]; extra: (tier: number) => Goods; secs: [number, number, number] };
const W_MELEE: SlotRow = { main: [3, 5, 8], extra: (t) => (t >= 2 ? { wood: 2, leather: 1 } : { wood: 2 }), secs: [60, 120, 240] };
const W_BOW: SlotRow = { main: [3, 5, 8], extra: () => ({ hides: 1 }), secs: [60, 120, 240] };
const W_SLING: SlotRow = { main: [3, 5, 8], extra: () => ({ linen: 1 }), secs: [60, 120, 240] };
const SHIELD: SlotRow = { main: [4, 6, 9], extra: () => ({ wood: 3, leather: 1 }), secs: [90, 180, 360] };
const HELMET: SlotRow = { main: [2, 4, 6], extra: () => ({ leather: 1 }), secs: [60, 120, 240] };
const ARMOUR: SlotRow = { main: [4, 6, 9], extra: () => ({}), secs: [90, 180, 360] };
const HEAVY: SlotRow = { main: [10, 10, 14], extra: () => ({ leather: 2, linen: 2 }), secs: [300, 300, 600] };
const TRINKET: SlotRow = { main: [1, 2, 3], extra: () => ({}), secs: [40, 80, 160] };

/** Open helmets (Armourer); the rest are closed (Heavy Armour). */
const OPEN_HELMET = new Set(['cap', 'pilos', 'hood']);
const SPEAR_FAMILIES = new Set(['spear', 'short_spear', 'lance', 'javelins', 'club']);
const BOW_FAMILIES = new Set(['bow', 'short_bow', 'sling']);

/** The material an item is made of (items with none: bows wood, slings leather, light armour and open helmets leather, linothorax linen, else bronze). */
export function materialOf(def: ItemDef): ItemMaterial {
  if (def.material) return def.material;
  const fam = weaponFamily(def);
  if (fam === 'bow' || fam === 'short_bow') return 'wood';
  if (fam === 'sling') return 'leather';
  if (def.art === 'linothorax') return 'linen';
  if (def.art === 'leather' || OPEN_HELMET.has(def.art)) return 'leather';
  return 'bronze';
}

/** Goods for n units of a material: felt counts as linen, horn and bone as hides, gold as silver x2, faience as stone + copper, wicker as wood; iron adds charcoal equal to it (steel twice). */
export function materialGoods(m: ItemMaterial, n: number): Goods {
  switch (m) {
    case 'iron': return { iron: n, charcoal: n };
    case 'steel': return { iron: n, charcoal: 2 * n };
    case 'gold': return { silver: 2 * n };
    case 'felt': case 'linen': return { linen: n };
    case 'horn': case 'bone': case 'leather': return m === 'leather' ? { leather: n } : { hides: n };
    case 'faience': return { stone: n, copper: Math.ceil(n / 2) };
    case 'wicker': case 'wood': return { wood: n };
    default: return { [m]: n } as Goods;
  }
}

function addGoods(a: Goods, b: Goods): Goods {
  const out: Goods = { ...a };
  for (const [k, v] of Object.entries(b) as [Good, number][]) out[k] = (out[k] ?? 0) + v;
  return out;
}

/** The smith node an item is made under. */
export function smithNode(def: ItemDef): string {
  if (def.slot === 'trinket') return 'goldsmith';
  if (def.slot === 'shield') return 'smelter';
  if (def.slot === 'helmet') return OPEN_HELMET.has(def.art) ? 'armourer' : 'heavyArmour';
  if (def.slot === 'armor') return armorWeight(def) === 'heavy' ? 'heavyArmour' : 'armourer';
  const fam = weaponFamily(def) ?? '';
  return SPEAR_FAMILIES.has(fam) ? 'smelter' : BOW_FAMILIES.has(fam) ? 'bowyer' : 'bladesmith';
}

function slotRow(def: ItemDef): SlotRow {
  if (def.slot === 'trinket') return TRINKET;
  if (def.slot === 'shield') return SHIELD;
  if (def.slot === 'helmet') return HELMET;
  if (def.slot === 'armor') return armorWeight(def) === 'heavy' ? HEAVY : ARMOUR;
  const fam = weaponFamily(def);
  return fam === 'sling' ? W_SLING : fam === 'bow' || fam === 'short_bow' ? W_BOW : W_MELEE;
}

/**
 * M5h6: the fresh kit of every class a home trains (its first tier-1 option a slot, `freshHero` in src/war/sim/classes.ts,
 * the kit training hands out) crafts as tier 1 whatever the item's own tier: a T1 forge and an Armourer, Bladesmith or
 * Bowyer make it, at the tier-1 cost and time. Its rolls keep the item's tier cap.
 */
const TRAINED: ClassId[] = ['militia', 'hoplite', 'thureophoros', 'celt_sword', 'falx', 'archer', 'slinger', 'javelineer', 'peltast', 'companion', 'thessalian', 'horse_archer'];
export const FRESH_KIT: ReadonlySet<string> = new Set(
  TRAINED.flatMap((c) => (['weapon', 'shield', 'helmet', 'armor'] as const).map((s) => CLASSES[c].kit[s]?.[0]?.find((x) => x)).filter((x): x is string => !!x)),
);

const recipeCache = new Map<string, Recipe | null>();

/** The smith recipe of an item (null: a set piece or named legendary, which stay drops). */
export function recipeFor(def: ItemDef): Recipe | null {
  const hit = recipeCache.get(def.id);
  if (hit !== undefined) return hit;
  let r: Recipe | null = null;
  if (!def.set && !def.named) {
    const kit = FRESH_KIT.has(def.id), t = kit ? 1 : Math.max(1, Math.min(3, def.tier)), i = t - 1, row = slotRow(def);
    const node = kit && smithNode(def) === 'heavyArmour' ? 'armourer' : smithNode(def);
    let inputs = addGoods(materialGoods(materialOf(def), row.main[i]), row.extra(t));
    const heavy = row === HEAVY || (def.slot === 'helmet' && node === 'heavyArmour');
    if (t === 3 && (def.slot === 'weapon' || def.slot === 'shield' || def.slot === 'helmet' || heavy)) inputs = addGoods(inputs, { silver: 1 });
    const needs = def.slot === 'trinket' ? undefined : t === 3 ? ['master'] : t === 2 ? ['journeyman'] : undefined;
    r = { id: `item:${def.id}`, kind: 'item', prof: 'smith', node, ...(needs ? { needs } : {}), at: 'forge', lv: t, inputs, secs: row.secs[i], out: { item: def.id, n: 1 }, tier: Math.max(1, Math.min(3, def.tier)), xp: t };
  }
  recipeCache.set(def.id, r);
  return r;
}

/** Tool recipes (engineer, workshop): T1 Builder, T2 Toolmaker, T3 Instrument Maker. */
const TOOL_ROW: [Goods, number, string][] = [[{ wood: 3, stone: 1 }, 40, 'builder'], [{ bronze: 3, wood: 2 }, 90, 'toolmaker'], [{ iron: 4, charcoal: 4, wood: 2 }, 180, 'instrumentMaker']];
const SILVER_TOOLS = new Set(['scales', 'signet', 'dioptra']);
export function toolRecipe(id: string): Recipe | null {
  const t = CIV_TOOLS[id];
  if (!t) return null;
  const [inputs, secs, node] = TOOL_ROW[t.tier - 1];
  return { id: `tool:${id}`, kind: 'tool', prof: 'engineer', node, at: 'workshop', lv: t.tier, inputs: SILVER_TOOLS.has(id) ? { ...inputs, silver: 1 } : inputs, secs, out: { tool: id, n: 1 }, tier: t.tier, xp: t.tier };
}

// ------------------------------------------------------------------ other recipes

const R = (id: string, kind: RecipeKind, prof: ProfId, node: string, at: Workplace, lv: number, inputs: Goods, secs: number, out: Recipe['out'], extra: Partial<Recipe> = {}): Recipe =>
  ({ id, kind, prof, node, at, lv, inputs, secs, out, tier: 1, xp: 1, ...extra });

const ROWS: Recipe[] = [
  R('smelt', 'smelt', 'smith', 'smelter', 'forge', 1, { copper: 1, tin: 1 }, 15, { good: 'bronze', n: 2 }),
  // M6a coin (docs/WAR.md "Coin"): any smith at a forge L2 mints silver into coin and melts coin back, 1 : 20
  R('mint', 'coin', 'smith', 'smelter', 'forge', 2, { silver: 1 }, 30, { good: 'coin', n: 20 }),
  R('melt', 'coin', 'smith', 'smelter', 'forge', 2, { coin: 20 }, 30, { good: 'silver', n: 1 }),
  // cook (the ration also runs at camps and stores on the M5f loop)
  R('ration', 'dish', 'cook', 'campCook', 'cookhouse', 1, { food: 4 }, 10, { product: 'ration', n: 4 }),
  R('bread', 'dish', 'cook', 'baker', 'cookhouse', 2, { food: 6 }, 20, { product: 'bread', n: 6 }),
  R('salt_pork', 'dish', 'cook', 'saltPork', 'cookhouse', 1, { food: 4, salt: 2 }, 30, { product: 'salt_pork', n: 4 }),
  R('lentil_soup', 'dish', 'cook', 'stewPot', 'cookhouse', 2, { food: 6, herbs: 1 }, 30, { product: 'lentil_soup', n: 6 }),
  R('fish_stew', 'dish', 'cook', 'stewPot', 'cookhouse', 2, { food: 6, herbs: 1, salt: 1, oil: 1 }, 40, { product: 'fish_stew', n: 6 }),
  R('kykeon', 'dish', 'cook', 'herbCook', 'cookhouse', 2, { food: 4, herbs: 2 }, 30, { product: 'kykeon', n: 6 }),
  R('black_broth', 'dish', 'cook', 'spartanMess', 'cookhouse', 2, { food: 6, salt: 1 }, 40, { product: 'black_broth', n: 6 }),
  R('march_stores', 'dish', 'cook', 'quartermaster', 'cookhouse', 1, { food: 8, salt: 2 }, 60, { product: 'march_stores', n: 4 }),
  R('feast', 'dish', 'cook', 'feast', 'cookhouse', 3, { food: 30, salt: 4, oil: 4 }, 120, { product: 'feast', n: 12 }),
  // physician
  R('bandage', 'remedy', 'physician', 'healer', 'infirmary', 1, { linen: 1 }, 15, { product: 'bandage', n: 3 }),
  R('salve', 'remedy', 'physician', 'herbalist', 'infirmary', 2, { herbs: 2, oil: 1 }, 30, { product: 'salve', n: 2 }),
  R('theriac', 'remedy', 'physician', 'rhizotomist', 'infirmary', 2, { herbs: 3, salt: 1, food: 2 }, 60, { product: 'theriac', n: 2 }),
  R('tent_kit', 'remedy', 'physician', 'fieldTent', 'infirmary', 1, { linen: 6, wood: 4 }, 90, { product: 'tent_kit', n: 1 }),
  // engineer: engines and fortifications (built on site in M5h3)
  R('mantlet', 'engine', 'engineer', 'carpenter', 'workshop', 1, { wood: 12, hides: 2 }, 60, { engine: 'mantlet', n: 1 }),
  R('covered_ram', 'engine', 'engineer', 'rams', 'site', 1, { wood: 100, hides: 6, iron: 4 }, 300, { engine: 'coveredRam', n: 1 }),
  R('oxybeles', 'engine', 'engineer', 'artillerist', 'workshop', 3, { wood: 60, bronze: 6, linen: 4 }, 240, { engine: 'oxybeles', n: 1 }),
  R('siege_tower', 'engine', 'engineer', 'poliorcetes', 'site', 1, { wood: 240, hides: 20, iron: 10 }, 900, { engine: 'siegeTower', n: 1 }),
  // M6b carts (docs/WAR.md "Carts"): made at a workshop, rolled out for the crafter's player; the wagon's food feeds its draught mules
  R('handcart', 'cart', 'engineer', 'builder', 'workshop', 1, { wood: 30, hides: 2 }, 60, { engine: 'handcart', n: 1 }),
  R('wagon', 'cart', 'engineer', 'builder', 'workshop', 2, { wood: 80, bronze: 4, hides: 6, food: 40 }, 180, { engine: 'wagon', n: 1 }),
  R('iron_gate', 'fort', 'engineer', 'fortifier', 'site', 1, { iron: 10, charcoal: 10 }, 0, { fort: 'ironGate', n: 1 }),
  R('wet_hides', 'fort', 'engineer', 'fortifier', 'site', 1, { hides: 1 }, 0, { fort: 'wetHides', n: 1 }, { perTile: true }),
  R('stakes', 'fort', 'engineer', 'fortifier', 'site', 1, { wood: 3 }, 0, { fort: 'stakes', n: 1 }, { perTile: true }),
  R('ditch', 'fort', 'engineer', 'fortifier', 'site', 1, {}, 120, { fort: 'ditch', n: 1 }, { perTile: true }),
  // merchant: caravan goods (M6)
  R('amphora', 'caravan', 'merchant', 'packer', 'stall', 2, { oil: 4, wood: 1 }, 20, { product: 'amphora', n: 1 }),
  R('fish_jar', 'caravan', 'merchant', 'packer', 'stall', 2, { food: 4, salt: 2 }, 20, { product: 'fish_jar', n: 1 }),
  R('linen_bale', 'caravan', 'merchant', 'packer', 'stall', 2, { linen: 6 }, 20, { product: 'linen_bale', n: 1 }),
  R('ingot_crate', 'caravan', 'merchant', 'packer', 'stall', 2, { bronze: 5 }, 20, { product: 'ingot_crate', n: 1 }),
  // forager refining
  R('charcoal', 'good', 'forager', 'charcoalBurner', 'sorting', 1, { wood: 4 }, 30, { good: 'charcoal', n: 2 }),
  R('leather', 'good', 'forager', 'tanner', 'sorting', 2, { hides: 2, salt: 1 }, 60, { good: 'leather', n: 2 }),
  R('linen', 'good', 'forager', 'weaver', 'sorting', 1, { flax: 3 }, 45, { good: 'linen', n: 2 }),
  R('oil', 'good', 'forager', 'presser', 'press', 1, { food: 4 }, 30, { good: 'oil', n: 1 }),
];

/** Every recipe by id: the rows above, `item:<def>` for each base item and `tool:<id>` for each civilian tool. */
export const RECIPES: Record<string, Recipe> = Object.fromEntries([
  ...ROWS,
  ...BASE_ITEMS.map(recipeFor).filter((r): r is Recipe => !!r),
  ...Object.keys(CIV_TOOLS).map(toolRecipe).filter((r): r is Recipe => !!r),
].map((r) => [r.id, r]));

/** A recipe's batch grows x1.5 with these nodes (Big Pot: dishes; Anatomist: remedies; Steward: refining, which also takes 20% less input). */
export const BATCH_NODES: Partial<Record<RecipeKind, string>> = { dish: 'bigPot', remedy: 'anatomist', good: 'steward' };

/**
 * Dishes (one fed record per squad, the last eaten): inn = damage taken multiplier, melee / missile = damage bonus, acc =
 * accuracy, heal = physician heal multiplier, xp = XP per fight, mins = how long it lasts. No dish gives more than
 * FED_CAP to a combat stat (the sim clamps).
 */
export interface Dish { inn: number; melee: number; missile: number; acc: number; heal: number; xp: number; mins: number }
const D = (mins: number, d: Partial<Dish>): Dish => ({ inn: 0.95, melee: 0, missile: 0, acc: 0, heal: 1.25, xp: 0, mins, ...d });
export const DISHES: Partial<Record<Product, Dish>> = {
  ration: D(10, {}), bread: D(20, {}), salt_pork: D(10, {}),
  lentil_soup: D(15, { inn: 0.94, heal: 1.4 }), fish_stew: D(20, { inn: 0.93, heal: 1.4 }),
  kykeon: D(15, { inn: 1, heal: 1, missile: 0.04, acc: 0.02 }), black_broth: D(15, { melee: 0.04 }),
  feast: D(30, { xp: 1 }),
};
/** The most a dish adds to a combat stat (docs/WAR.md: no dish gives more than +5%). */
export const FED_CAP = 0.05;

// ------------------------------------------------------------------ crafted item rolls

/** Craft grade G (1-19): crafter level + tool tier - 1 + floor(tool rarity rank / 2) + workplace level - 1 + 2 (Masterwork) + 1 (home specialty). */
export function craftGrade(o: { level: number; toolTier?: number; toolRarity?: Rarity; wpLevel?: number; masterwork?: boolean; specialty?: boolean }): number {
  const g = o.level + (o.toolTier ?? 1) - 1 + Math.floor(Math.max(0, RARITIES.indexOf(o.toolRarity ?? 'common')) / 2) + (o.wpLevel ?? 1) - 1 + (o.masterwork ? 2 : 0) + (o.specialty ? 1 : 0);
  return Math.max(1, Math.min(19, g));
}

/**
 * Rarity odds (common .. legendary, percent) by G band: 1-3, 4-6, 7-9, 10-12, 13-15, 16+. M5h6: legendary 0.05 / 0.15 /
 * 0.3% (was 1 / 2 / 4%), so a master smith (G 17) makes about one a play week (scripts/war/balance.mjs); the rest went
 * to epic.
 */
export const RARITY_ODDS: readonly (readonly [number, number, number, number, number])[] = [
  [80, 18, 2, 0, 0],
  [60, 30, 9, 1, 0],
  [42, 36, 18, 4, 0],
  [30, 36, 24, 9.95, 0.05],
  [20, 34, 30, 15.85, 0.15],
  [12, 30, 34, 23.7, 0.3],
];
export const oddsRow = (g: number) => RARITY_ODDS[Math.min(5, Math.floor((Math.max(1, g) - 1) / 3))];
/** Highest rarity rank a tier may roll (T1 rare, T2 epic, T3 any). */
export const TIER_CAP = [2, 2, 3, 4];

/** Quality chances (fractions): crude max(0, 30 - 3G)%, masterwork (Masterwork node) 5% + 1% per G above 8, at most 15%. */
export const crudeChance = (g: number) => Math.max(0, 30 - 3 * g) / 100;
export const masterworkChance = (g: number) => Math.min(15, 5 + Math.max(0, g - 8)) / 100;
/** Max condition by quality, and wear multiplier. */
export const QUALITY_MC = [80, 100, 100];
export const QUALITY_WEAR = [1.25, 1, 0.75];

/**
 * Roll a crafted item of `def` (an item id or a CIV_TOOLS id) at grade G from `seed` (the order: same seed, same item).
 * Rarity by RARITY_ODDS capped by tier; quality crude / fine / masterwork (masterwork only with the node); random stats
 * from the war pool (crude: 1 step each, fine 1-2, masterwork: its first line 2), an epic/legendary power from the war
 * powers. Explicit `aff` / `pow` are stored on the item.
 */
export function craftRoll(defId: string, g: number, seed: string | number, o: { masterwork?: boolean; maker?: string } = {}): Item {
  const tool = CIV_TOOLS[defId];
  const def = tool ? null : ITEMS[defId];
  if (!tool && !def) throw new Error(`Unknown craft ${defId}`);
  const tier = tool ? tool.tier : def!.tier;
  const h = typeof seed === 'number' ? seed >>> 0 : hashString(seed);
  const rng = new Rng(hashString(`craft|${h}|${defId}`));
  const row = oddsRow(g);
  let r = RARITIES.indexOf(rng.weighted(RARITIES.map((x, i) => [x, row[i]] as const)));
  r = Math.min(r, TIER_CAP[Math.max(1, Math.min(3, tier))]);
  const u = rng.next();
  const q: 0 | 1 | 2 = u < crudeChance(g) ? 0 : o.masterwork && u < crudeChance(g) + masterworkChance(g) ? 2 : 1;
  const item: Item = { uid: `c${h.toString(36)}`, def: defId, rarity: RARITIES[r], cond: QUALITY_MC[q], q, mc: QUALITY_MC[q], ...(o.maker ? { mk: o.maker } : {}) };
  const n = [0, 1, 2, 3, 4][r];
  if (n) {
    const pool = warAffixPool(tool ? 'tool' : def!);
    const out: [AffixId, number][] = [];
    const [lo, hi] = AFFIX_STEPS[r];
    for (let i = 0; i < n && pool.length; i++) {
      const id = rng.weighted(pool);
      pool.splice(pool.findIndex(([k]) => k === id), 1);
      out.push([id, q === 0 ? 1 : q === 2 && i === 0 ? 2 : rng.int(lo, hi)]);
    }
    out.sort((a, b) => b[1] - a[1]);
    if (out.length) item.aff = encodeAffixes(out);
  }
  if (r >= 3 && def) {
    const pool = powerPool(def).filter((p) => !WAR_POWER_IGNORED.has(p));
    if (pool.length) item.pow = rng.pick(pool);
  }
  return item;
}

/** A tool's war stats from its stored random stats (tools are not ItemDefs): Deft (work rate), Bountiful (output), Sturdy, Wise. */
export function toolMods(item: Pick<Item, 'aff'> | undefined): { deft: number; bountiful: number } {
  let deft = 0, bountiful = 0;
  for (const part of item?.aff?.split(',') ?? []) {
    const [k, v] = part.split(':');
    if (k === 'deft') deft += AFFIXES.deft.step * Number(v);
    if (k === 'bountiful') bountiful += AFFIXES.bountiful.step * Number(v);
  }
  return { deft, bountiful };
}
