/**
 * Crafting balance of the war (docs/impl/global-war-rebuild.md M5h6, docs/WAR.md "Crafting and professions"). Pure
 * arithmetic over the data, no dice: expected values, so the same data gives the same report.
 *
 *  - kits: time and goods for a home's forge to equip N fresh trained soldiers (T1 common kit) at a T1 / T2 / T3 forge,
 *    and one max squad (N elites in tier-3 legendaries) at a T3 forge;
 *  - legendaries a master smith makes in a play week;
 *  - the rarity mix of crafted items against drops (src/game/heroes.ts rollRarity, beast loot);
 *  - power through warStatsOf: a fresh kit, a max crafted kit and the drop-legendary kit on an L10 soldier.
 */
import { CIV_TOOLS } from '../data/classes';
import { classGearBlocker } from '../data/gearRules';
import { ITEM_LIST, FIXED_RARITY, type Item, type Rarity } from '../data/items';
import { validPicks } from '../data/professions';
import { craftGrade, oddsRow, RECIPES, TIER_CAP, type Good, type Goods } from '../data/recipes';
import { SQUAD_MAX } from '../war/sim/soldiers';
import { crafterRefusal, CRAFT, itemRecipe } from '../war/sim/crafting';
import { CLAMP, CLAMP_BASE, freshHero, kitItem, warStats, warStatsOf, type WarStats } from '../war/sim/classes';
import { freshCivilian, workRate } from '../war/sim/civilians';
import type { Hero } from '../data/units';

/** The assumptions the report is written against. */
export const BAL = {
  N: SQUAD_MAX,
  /** Hours a week a player keeps his forge queued (2 h a day); between sessions the queue (CRAFT.queue orders) runs out once. */
  playHours: 14, sessions: 7,
  /** Verify lines (docs/impl M5h6). */
  kitHours: 2, legendariesPerWeek: [0.7, 1.5] as [number, number],
};

/** The trained classes a home trains (server/src/war/persons.ts TRAINS: barracks, range). */
export const TRAINED = ['hoplite', 'thureophoros', 'celt_sword', 'falx', 'archer', 'slinger', 'javelineer', 'peltast'];
/** The elites of a max squad (docs/WAR.md "Classes"; the missile elite is the archer in Cretan kit). */
export const ELITES = ['royal_guard', 'sacred_band', 'rhomphaia', 'gallic', 'archer'];

/** A smith at a forge of level `wp`: his level, his nodes, his hammer. */
export interface Smith { label: string; wp: number; level: number; perks: string[]; tool: Item }
const hammer = (def: string, rarity: Rarity): Item => ({ uid: def, def, rarity, cond: 100 });
export const SMITHS: Smith[] = [
  { label: 'T1 forge, L4 smith, stone hammer', wp: 1, level: 4, perks: ['armourer', 'bladesmith', 'bowyer'], tool: hammer('stone_hammer', 'common') },
  { label: 'T2 forge, L6 journeyman, bronze hammer (uncommon)', wp: 2, level: 6, perks: ['armourer', 'bladesmith', 'bowyer', 'journeyman', 'heavyArmour'], tool: hammer('bronze_hammer', 'uncommon') },
  { label: 'T3 forge, L10 master, iron hammer (rare)', wp: 3, level: 10, perks: ['armourer', 'bladesmith', 'bowyer', 'journeyman', 'heavyArmour', 'master', 'masterwork', 'alloy'], tool: hammer('iron_hammer', 'rare') },
];

export function smithHero(s: Smith): Hero {
  if (!validPicks('smith', s.level, s.perks)) throw new Error(`invalid smith picks: ${s.label}`);
  return { ...freshCivilian('civ_smith'), level: s.level, perks: s.perks as Hero['perks'], equip: { weapon: s.tool } };
}
export const smithWork = (s: Smith) => workRate(smithHero(s));
export function smithGrade(s: Smith): number {
  return craftGrade({ level: s.level, toolTier: CIV_TOOLS[s.tool.def].tier, toolRarity: s.tool.rarity, wpLevel: s.wp, masterwork: s.perks.includes('masterwork') });
}

/** Rarity odds (fractions) of an item of `tier` at grade g, the tier cap folded in. */
export function craftOdds(g: number, tier: number): number[] {
  const row = oddsRow(g).map((x) => x / 100), cap = TIER_CAP[Math.max(1, Math.min(3, tier))];
  for (let i = cap + 1; i < row.length; i++) (row[cap] += row[i]), (row[i] = 0);
  return row;
}
/** Drop rarity odds (src/game/heroes.ts rollRarity) by tier, and beast loot (rollBeastRarity). */
export const DROP_ODDS: Record<string, number[]> = {
  'drop T1': [0.85, 0.14, 0.01, 0, 0], 'drop T2': [0.55, 0.35, 0.09, 0.01, 0], 'drop T3': [0.3, 0.4, 0.25, 0.05, 0], 'beast loot': [0, 0, 0.5, 0.35, 0.15],
};

// ------------------------------------------------------------------ goods and forge time

const SMELT = RECIPES.smelt;
/** Raw goods one refined good costs, and the forge seconds of making it (bronze is smelted at the forge). */
const REFINE: Partial<Record<Good, { raw: Goods; out: number; forge: boolean; secs: number }>> = {
  bronze: { raw: SMELT.inputs, out: SMELT.out.n, forge: true, secs: SMELT.secs },
  leather: { raw: RECIPES.leather.inputs, out: RECIPES.leather.out.n, forge: false, secs: RECIPES.leather.secs },
  linen: { raw: RECIPES.linen.inputs, out: RECIPES.linen.out.n, forge: false, secs: RECIPES.linen.secs },
  charcoal: { raw: RECIPES.charcoal.inputs, out: RECIPES.charcoal.out.n, forge: false, secs: RECIPES.charcoal.secs },
};

export interface Bill { items: number; refined: Goods; raw: Goods; forgeSecs: number; missing: string[] }
const add = (a: Goods, k: Good, n: number) => (a[k] = (a[k] ?? 0) + n);

/** Goods and forge seconds (at smith s, one crafter slot) for `count` crafts of each item in `defs`. */
export function bill(defs: string[], s: Smith, count = 1, alloy = s.perks.includes('alloy')): Bill {
  const out: Bill = { items: 0, refined: {}, raw: {}, forgeSecs: 0, missing: [] };
  const work = smithWork(s);
  for (const def of defs) {
    const r = itemRecipe(def);
    if (!r || crafterRefusal({ prof: 'smith', perks: s.perks }, r) || r.lv > s.wp) {
      out.missing.push(def);
      continue;
    }
    out.items += count;
    out.forgeSecs += (count * r.secs) / work;
    for (const [k, v] of Object.entries(r.inputs) as [Good, number][]) {
      add(out.refined, k, v * count);
      const ref = REFINE[k];
      if (!ref) {
        add(out.raw, k, v * count);
        continue;
      }
      const yieldN = ref.out * (k === 'bronze' && alloy ? CRAFT.alloy : 1), batches = (v * count) / yieldN;
      for (const [rk, rv] of Object.entries(ref.raw) as [Good, number][]) add(out.raw, rk, rv * batches);
      if (ref.forge) out.forgeSecs += (batches * ref.secs) / work;
    }
  }
  return out;
}

/** The fresh kit (tier 1, common) of a class: its four slots. */
export const freshKit = (cls: string): string[] => Object.values(freshHero(cls).equip).filter((x): x is Item => !!x).map((x) => x.def);
/** The tier-3 kit of a class. */
export const t3Kit = (cls: string): string[] => (['weapon', 'shield', 'helmet', 'armor'] as const).map((s) => kitItem(cls, s, 2)).filter((x): x is string => !!x);

export interface KitRow { cls: string; smith: string; hours: number; bill: Bill }
/** N fresh kits of each trained class at each forge (crafter slots = the forge level: hours over the slots). */
export function freshKits(): KitRow[] {
  const out: KitRow[] = [];
  for (const s of SMITHS)
    for (const cls of TRAINED) {
      const b = bill(freshKit(cls), s, BAL.N);
      out.push({ cls, smith: s.label, hours: b.forgeSecs / 3600 / s.wp, bill: b });
    }
  return out;
}

/** Expected crafts for one legendary of a tier-3 item at grade g. */
export const craftsPerLegendary = (g: number) => 1 / craftOdds(g, 3)[4];

/** One max squad (N elites, every kit slot legendary) at the T3 forge: expected crafts, forge hours (all 3 slots), play weeks. */
export function maxSquad(cls: string) {
  const s = SMITHS[2], g = smithGrade(s), per = craftsPerLegendary(g);
  const b = bill(t3Kit(cls), s, BAL.N * per);
  const hours = b.forgeSecs / 3600 / s.wp;
  return { cls, g, per, crafts: b.items, hours, weeks: hours / weekHours(s), bill: b };
}

/** Forge hours a play week (one slot): the play hours plus one queue run out between sessions. */
export function weekHours(s: Smith): number {
  const kitSecs = (cls: string) => t3Kit(cls).reduce((a, d) => a + (itemRecipe(d)?.secs ?? 0), 0) / t3Kit(cls).length;
  return BAL.playHours + (BAL.sessions * CRAFT.queue * kitSecs('hoplite')) / smithWork(s) / 3600;
}

/** Legendaries one master smith (T3 forge, one slot) makes a play week crafting tier-3 kit pieces. */
export function legendaryRate() {
  const s = SMITHS[2], g = smithGrade(s), work = smithWork(s);
  const kit = t3Kit('hoplite'), avgSecs = kit.reduce((a, d) => a + (itemRecipe(d)?.secs ?? 0), 0) / kit.length;
  const crafts = (weekHours(s) * 3600 * work) / avgSecs;
  const leg = crafts * craftOdds(g, 3)[4];
  const b = bill(kit, s, crafts / kit.length);
  return { g, work, crafts, leg, bill: b };
}

// ------------------------------------------------------------------ power

/** An L10 hero of cls (attributes 15) wearing `equip` over his fresh kit. */
function maxHero(cls: string, equip: Partial<Record<string, Item>>): Hero {
  const h = freshHero(cls);
  return { ...h, level: 10, attrs: { str: 15, agi: 15, end: 15, wil: 15 }, equip: { ...h.equip, ...equip } };
}

/** The best crafted kit: tier 3, legendary, masterwork, every random-stat line at its top step on the cap-relevant stats. */
export function maxCraftedKit(cls: string): Partial<Record<string, Item>> {
  const out: Partial<Record<string, Item>> = {};
  for (const slot of ['weapon', 'shield', 'helmet', 'armor'] as const) {
    const def = kitItem(cls, slot, 2);
    if (def) out[slot] = { uid: `mx-${slot}`, def, rarity: 'legendary', cond: 100, q: 2, mc: 100, aff: 'dmg:3,hp:3,armor:3,block:3' };
  }
  return out;
}

/** The drop-legendary kit: per slot the first named legendary or legendary set piece the class may wear. */
export function dropLegendaryKit(cls: string): Partial<Record<string, Item>> {
  const out: Partial<Record<string, Item>> = {};
  for (const d of ITEM_LIST) {
    const leg = d.named || (d.set && FIXED_RARITY[d.set] === 'legendary');
    if (!leg || d.slot === 'trinket' || out[d.slot] || classGearBlocker(cls, d)) continue;
    out[d.slot] = { uid: `dl-${d.id}`, def: d.id, rarity: 'legendary', cond: 100 };
  }
  return out;
}

/** The cap of a baked soldier of cls (the clamp table on his trained baseline, never below his own fresh value). */
export function capOf(cls: string): WarStats {
  const o = warStats(cls), b = warStats(CLAMP_BASE[cls as keyof typeof CLAMP_BASE] ?? cls);
  return {
    ...o,
    maxHp: Math.round(Math.max(o.maxHp, b.maxHp * CLAMP.hp)), dmg: Math.max(o.dmg, b.dmg * CLAMP.dmg), rangedDmg: Math.max(o.rangedDmg, b.rangedDmg * CLAMP.dmg),
    armor: Math.max(o.armor, b.armor + CLAMP.armor), block: Math.max(o.block, b.block + CLAMP.block), accuracy: Math.max(o.accuracy, b.accuracy + CLAMP.accuracy),
    range: o.range > 0 ? Math.max(o.range, b.range + CLAMP.range) : 0, ammo: Math.round(Math.max(o.ammo, b.ammo * CLAMP.ammo)),
    ap: Math.max(o.ap, b.ap + CLAMP.ap), bp: Math.max(o.bp, b.bp + CLAMP.bp),
  };
}

export const POWER_KEYS = ['maxHp', 'dmg', 'rangedDmg', 'armor', 'block', 'accuracy', 'range', 'ammo', 'ap', 'bp'] as const;
export function powerRows(cls: string) {
  return {
    fresh: warStats(cls),
    crafted: warStatsOf(maxHero(cls, maxCraftedKit(cls))),
    drop: warStatsOf(maxHero(cls, dropLegendaryKit(cls))),
    cap: capOf(cls),
  };
}

// ------------------------------------------------------------------ report

const f1 = (x: number) => (Math.round(x * 10) / 10).toString();
const goodsText = (g: Goods) => (Object.entries(g) as [Good, number][]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(v)}`).join(', ');
const pct = (x: number) => `${(100 * x).toFixed(x < 0.01 && x > 0 ? 2 : 0)}%`;

export function craftBalanceReport(): string {
  const L: string[] = [];
  L.push(`War crafting balance (N = ${BAL.N}; a play week = ${BAL.playHours} h + ${BAL.sessions} unattended queues of ${CRAFT.queue})`);
  L.push('', 'Smiths:');
  for (const s of SMITHS) L.push(`  ${s.label.padEnd(48)} G ${smithGrade(s)}, work x${smithWork(s).toFixed(2)}, ${s.wp} slot(s)`);

  L.push('', `Fresh kits for ${BAL.N} (tier 1 common; hours with every slot of the forge busy; target <= ${BAL.kitHours} h at T1):`);
  const rows = freshKits();
  for (const s of SMITHS) {
    const rs = rows.filter((r) => r.smith === s.label);
    L.push(`  ${s.label}`);
    for (const r of rs) L.push(`    ${r.cls.padEnd(13)} ${f1(r.hours).padStart(5)} h  ${goodsText(r.bill.raw)}${r.bill.missing.length ? `  (cannot make: ${r.bill.missing.join(', ')})` : ''}`);
  }
  const worst = rows.filter((r) => r.smith === SMITHS[0].label).reduce((a, r) => Math.max(a, r.hours), 0);
  L.push(`  worst at T1: ${f1(worst)} h ${worst <= BAL.kitHours ? 'OK' : 'OVER'}`);

  const lr = legendaryRate();
  L.push('', `Legendaries a master smith makes a play week (G ${lr.g}, ${Math.round(lr.crafts)} tier-3 crafts, ${pct(craftOdds(lr.g, 3)[4])} each): ${lr.leg.toFixed(2)} (target ${BAL.legendariesPerWeek.join('-')})`);
  L.push(`  goods that week: ${goodsText(lr.bill.raw)}`);

  L.push('', `One max squad (${BAL.N} elites, 4 legendary tier-3 pieces each) at the T3 forge, 3 master smiths:`);
  for (const cls of ELITES) {
    const m = maxSquad(cls);
    L.push(`  ${cls.padEnd(12)} ${Math.round(m.crafts)} crafts (${Math.round(m.per)} per legendary), ${Math.round(m.hours)} forge h = ${f1(m.weeks)} play weeks; ${goodsText(m.bill.raw)}`);
  }

  L.push('', 'Rarity mix (common / uncommon / rare / epic / legendary):');
  for (const s of SMITHS) for (let t = 1; t <= 3; t++) {
    if (t > s.wp) continue;
    L.push(`  crafted T${t}, ${s.label.split(',')[0]} G ${smithGrade(s)}`.padEnd(40) + craftOdds(smithGrade(s), t).map(pct).join(' / '));
  }
  for (const [k, v] of Object.entries(DROP_ODDS)) L.push(`  ${k}`.padEnd(40) + v.map(pct).join(' / '));

  L.push('', 'Power through warStatsOf (L10, attributes 15): fresh kit / max crafted kit / drop-legendary kit / cap');
  for (const cls of ELITES) {
    const p = powerRows(cls);
    L.push(`  ${cls}`);
    for (const k of POWER_KEYS) {
      if ((k === 'rangedDmg' || k === 'range' || k === 'ammo') && p.fresh.range === 0) continue;
      const over = p.crafted[k] > p.cap[k] + 1e-9 || p.drop[k] > p.cap[k] + 1e-9 ? '  OVER' : '';
      L.push(`    ${k.padEnd(10)} ${[p.fresh[k], p.crafted[k], p.drop[k], p.cap[k]].map((x) => f1(x).padStart(6)).join(' ')}${over}`);
    }
  }
  return L.join('\n');
}

