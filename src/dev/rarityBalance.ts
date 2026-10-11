/**
 * Rarity balance (docs/ITEMS.md "Balance targets"): mirror battles of one
 * army, side 0 with every item at a rarity, side 1 all common. The win rate
 * per rarity is what the targets are written against.
 */
import { armySpec } from '../game/armySpec';
import { setBotLevel, standardArmy } from '../game/heroes';
import { ITEM_LIST, RARITIES, SLOTS, itemDef, normalizeItem, type ItemDef, type Rarity, type Slot } from '../data/items';
import { SETS, setPieces } from '../data/sets';
import { classesFor, classGearBlocker } from '../data/gearRules';
import { heroClass } from '../sim/stats';
import type { ClassId } from '../data/classes';
import { classSquad } from './classBalance';
import { Battle } from '../sim/battle';
import { Rng } from '../sim/rng';
import type { Hero } from '../data/units';
import { POWERS, POWER_IDS, type ItemPower } from '../data/affixes';

function army(seed: number, rarity: Rarity, level: number): Hero[] {
  const heroes = standardArmy(new Rng(seed), { nextId: 1 });
  for (const h of heroes) {
    // gear first, so the bot spends its points on what the gear asks for
    for (const it of Object.values(h.equip)) if (it) { it.rarity = rarity; it.cond = 100; }
    setBotLevel(h, level);
    h.perks = [];
  }
  return heroes;
}

/** Side 0 in `rarity` gear against the same army in common gear: 1 win, 0 loss, 0.5 draw. */
export function runRarity(seed: number, rarity: Rarity, level = 5, keep?: (p: ItemPower) => boolean): number {
  const a = army(seed, rarity, level);
  const b = army(seed, 'common', level);
  b.forEach((h, i) => (h.id = `m${i}`));
  const flip = seed % 2 === 1;
  const sa = armySpec(a, true);
  // `keep` filters the powers side 0 carries (ablation: which power is worth what)
  if (keep) for (const u of sa.units) u.stats.powers = u.stats.powers?.filter(keep);
  const armies = flip ? [armySpec(b, true), sa] : [sa, armySpec(b, true)];
  const battle = new Battle({ seed, armies: armies as [ReturnType<typeof armySpec>, ReturnType<typeof armySpec>] });
  battle.startBattle();
  for (let i = 0; i < battle.timeLimitTicks + 10 && battle.phase !== 'ended'; i++) battle.step();
  const w = battle.winner ?? -1;
  if (w === -1) return 0.5;
  return (flip ? w === 1 : w === 0) ? 1 : 0;
}

export function rarityReport(n = 60, levels = [5, 10]): string {
  const rows = RARITIES.slice(1).map((r) => {
    const cells = levels.map((lv) => {
      let s = 0;
      for (let i = 0; i < n; i++) s += runRarity(7000 + i, r, lv);
      return `L${lv} ${(100 * s / n).toFixed(0).padStart(3)}%`;
    });
    return `  ${r.padEnd(10)} ${cells.join('  ')}`;
  });
  // the item power cap rows (EC-02) ride with the rarity mirror, so `npm run balance` prints both
  return [`Rarity mirror (full kit at a rarity vs the same army all common), ${n} seeds; targets 58 / 66 / 76 / 85%`, ...rows, itemCapReport(n, levels)].join('\n');
}

/**
 * What each power adds (docs/ITEMS.md "Balance targets"): the rarity mirror
 * with side 0's powers stripped, with all of them, and with only one kind
 * kept. A power whose "only" row stands far above "none" is too strong.
 * Slow (18 rows of n battles): not part of `npm run balance`.
 */
export function powerReport(n = 100, rarity: Rarity = 'legendary', level = 5): string {
  const rate = (keep?: (p: ItemPower) => boolean) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += runRarity(7000 + i, rarity, level, keep);
    return `${(100 * s / n).toFixed(0).padStart(3)}%`;
  };
  const lines = [`Powers in the ${rarity} mirror, level ${level}, ${n} seeds`];
  lines.push(`  ${'all powers'.padEnd(16)} ${rate()}`);
  lines.push(`  ${'no powers'.padEnd(16)} ${rate(() => false)}`);
  for (const id of POWER_IDS) lines.push(`  ${POWERS[id].name.padEnd(16)} ${rate((p) => p.id === id)}`);
  return lines.join('\n');
}

// ------------------------------------------------------------------ item power cap (EC-02, GDD_REVIEW N16)

/** The most one item may add, in win-rate points over 50%, in the item mirror (docs/ITEMS.md "Item power cap"). */
export const ITEM_DELTA_CAP = 10;

/** One item (or a set's bonus lines) under the cap check. */
export interface ItemCapCase {
  label: string;
  /** Items fitted to every hero whose class may use them. `slot` alone: that hero's own item, at legendary. */
  defs?: string[];
  slot?: Slot;
  /** Side 1 wears the same pieces with the set bonus lines switched off: what the bonus alone adds. */
  bonusOnly?: string;
}

const STANDARD_CLASSES = new Set(['hoplite', 'thureophoros', 'peltast', 'slinger']);

/** The class that can wear the most of `defs` (ties: the standard army's classes first). */
function bestClass(defs: ItemDef[]): ClassId {
  const score = new Map<string, number>();
  for (const d of defs) for (const c of classesFor(d)) score.set(c, (score.get(c) ?? 0) + 1);
  return [...score].sort((a, b) => b[1] - a[1] || Number(STANDARD_CLASSES.has(b[0])) - Number(STANDARD_CLASSES.has(a[0])))[0][0] as ClassId;
}

function capArmy(seed: number, c: ItemCapCase, level: number, fitted: boolean): Hero[] {
  const defs = (c.defs ?? []).map(itemDef);
  const cls = defs.length ? bestClass(defs) : undefined;
  const ids = { nextId: 1 };
  const heroes = standardArmy(new Rng(seed), ids);
  // an item the standard army cannot use: its last four men (swordsman, peltasts, slinger) become the class that can,
  // so the wearers stay a part of a mixed army (a ten-man mirror of one class turns any edge into a rout)
  if (cls && !STANDARD_CLASSES.has(cls)) heroes.splice(6, 4, ...classSquad(new Rng(seed ^ 0x5eed), ids, cls, 4, level, 1));
  heroes.forEach((h, i) => {
    for (const it of Object.values(h.equip)) if (it) { it.rarity = 'common'; it.cond = 100; delete it.aff; delete it.pow; }
    if (fitted) {
      const own = c.slot ? h.equip[c.slot] : undefined;
      if (own) h.equip[c.slot!] = { uid: `cap${seed}-${i}`, def: own.def, rarity: 'legendary', cond: 100 };
      const id = heroClass(h).id;
      for (const d of defs) {
        if (classGearBlocker(id, d)) continue;
        h.equip[d.slot] = normalizeItem({ uid: `cap${seed}-${i}-${d.id}`, def: d.id, rarity: 'legendary', cond: 100 });
      }
    }
    setBotLevel(h, level);
    h.perks = [];
  });
  return heroes;
}

/** One item mirror: side 0 fitted, side 1 the same army without it (or with the set's bonus lines off). 1 win, 0 loss, 0.5 draw. */
export function runItemCap(seed: number, c: ItemCapCase, level = 5): number {
  const a = armySpec(capArmy(seed, c, level, true), true);
  let b: ReturnType<typeof armySpec>;
  if (c.bonusOnly) {
    const set = SETS[c.bonusOnly];
    const saved = set.bonuses;
    set.bonuses = [];
    try { b = armySpec(capArmy(seed, c, level, true), true); } finally { set.bonuses = saved; }
  } else b = armySpec(capArmy(seed, c, level, false), true);
  b.units.forEach((u, i) => (u.heroId = `m${i}`));
  const flip = seed % 2 === 1;
  const battle = new Battle({ seed, armies: flip ? [b, a] : [a, b] });
  battle.startBattle();
  for (let i = 0; i < battle.timeLimitTicks + 10 && battle.phase !== 'ended'; i++) battle.step();
  const w = battle.winner ?? -1;
  if (w === -1) return 0.5;
  return (flip ? w === 1 : w === 0) ? 1 : 0;
}

/** Every case the cap covers: a plain legendary in each slot, each named legendary, each set's bonus lines. */
export function itemCapCases(): ItemCapCase[] {
  const out: ItemCapCase[] = SLOTS.map((slot) => ({ label: `legendary ${slot}`, slot }));
  for (const d of ITEM_LIST) if (d.named) out.push({ label: d.id, defs: [d.id] });
  for (const id of Object.keys(SETS)) out.push({ label: `${id} set bonus`, defs: setPieces(id), bonusOnly: id });
  return out;
}

/** Win-rate points over 50% each case adds, at each level. */
export function itemDeltas(n = 60, levels = [5, 10], cases = itemCapCases()): { label: string; deltas: number[] }[] {
  return cases.map((c) => ({
    label: c.label,
    deltas: levels.map((lv) => {
      let s = 0;
      for (let i = 0; i < n; i++) s += runItemCap(7000 + i, c, lv);
      return 100 * s / n - 50;
    }),
  }));
}

export function itemCapReport(n = 60, levels = [5, 10]): string {
  const rows = itemDeltas(n, levels).map((r) => {
    const cells = r.deltas.map((d, i) => `L${levels[i]} ${(d >= 0 ? '+' : '') + d.toFixed(0)}`.padEnd(8));
    // one standard error (50/sqrt(n) points) of tolerance: a point estimate inside it is noise, not a miss
    const over = r.deltas.some((d) => d > ITEM_DELTA_CAP + 50 / Math.sqrt(n)) ? '  OVER' : '';
    return `  ${r.label.padEnd(22)} ${cells.join('  ')}${over}`;
  });
  return [`Item power cap (the item on every man of the reference army who can use it vs the same army without it), ${n} seeds; cap +${ITEM_DELTA_CAP} pts (OVER beyond 1 SE, ${(50 / Math.sqrt(n)).toFixed(1)})`, ...rows].join('\n');
}
