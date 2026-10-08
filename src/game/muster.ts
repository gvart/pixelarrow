/**
 * The muster (pure TS, unit-tested in tests/muster.test.ts): the roster can
 * be larger than the battle formation. In camp the player picks who marches
 * into the formation and who stays behind as the reserve; the wounded rest
 * in camp whatever they are told. The formation is capped (MUSTER.fieldCap)
 * and so is every battle group (MUSTER.groupCap, the formation slots).
 *
 * Shared by the campaign (Hero.reserve, Campaign.fitHeroes) and the online
 * army (OwnedHero.reserve, server/src/online/store.ts fieldReady).
 */
import { classOfHero, type ClassId } from '../data/classes';
import type { Hero } from '../data/units';
import { powerRating } from './gear';

export const MUSTER = {
  /** Most men in the battle formation. */
  fieldCap: 12,
  /** Most men in one battle group (a formation slot). */
  groupCap: 6,
} as const;

export interface MusterHero {
  id: string;
  name: string;
  cls: ClassId;
  level: number;
  power: number;
  group: number;
  /** Resting a wound (or busy elsewhere): cannot be fielded. */
  wounded: boolean;
  reserve: boolean;
}

export type MusterWhy = 'cap' | 'group' | 'wounded' | 'last';

/** The muster view of heroes; `wounded(h)` may add online states (busy, garrisoned). */
export function musterOf(heroes: readonly Hero[], wounded: (h: Hero) => boolean = (h) => (h.wound ?? 0) > 0, reserve: (h: Hero) => boolean = (h) => !!h.reserve): MusterHero[] {
  return heroes.map((h) => ({ id: h.id, name: h.name, cls: classOfHero(h), level: h.level, power: powerRating(h), group: Math.max(0, Math.min(3, h.group)), wounded: wounded(h), reserve: reserve(h) }));
}

/**
 * Who stands in the formation: the fit men not in the reserve, in roster
 * order, up to the cap. The group cap (MUSTER.groupCap) guards the men
 * joining a group in the muster (canField), never the standing formation, so
 * an army from before the muster keeps marching as it did.
 */
export function fieldIds(m: readonly MusterHero[]): string[] {
  const out: string[] = [];
  for (const h of m) {
    if (h.wounded || h.reserve) continue;
    if (out.length >= MUSTER.fieldCap) break;
    out.push(h.id);
  }
  return out;
}

/** The heroes that march into battle (see fieldIds). Older saves have no reserve flag: everyone fit goes, up to the cap. */
export function fieldHeroes(heroes: readonly Hero[]): Hero[] {
  const ids = new Set(fieldIds(musterOf(heroes)));
  return heroes.filter((h) => ids.has(h.id));
}

export interface ClassRow {
  cls: ClassId;
  /** In the formation now. */
  field: number;
  total: number;
  wounded: number;
}

/** Per unit type: how many are fielded, how many there are. */
export function classRows(m: readonly MusterHero[]): ClassRow[] {
  const field = new Set(fieldIds(m));
  const rows = new Map<ClassId, ClassRow>();
  for (const h of m) {
    const r = rows.get(h.cls) ?? { cls: h.cls, field: 0, total: 0, wounded: 0 };
    r.total++;
    if (field.has(h.id)) r.field++;
    if (h.wounded) r.wounded++;
    rows.set(h.cls, r);
  }
  return [...rows.values()].sort((a, b) => b.total - a.total || a.cls.localeCompare(b.cls));
}

/** Why a reserve hero cannot join the formation now, or null. */
export function canField(m: readonly MusterHero[], id: string): MusterWhy | null {
  const h = m.find((x) => x.id === id);
  if (!h) return 'wounded';
  if (h.wounded) return 'wounded';
  const field = new Set(fieldIds(m));
  if (field.has(id)) return null;
  if (field.size >= MUSTER.fieldCap) return 'cap';
  const inGroup = m.filter((x) => field.has(x.id) && x.group === h.group).length;
  if (inGroup >= MUSTER.groupCap) return 'group';
  return null;
}

/** Why a fielded hero cannot be sent to the reserve, or null (someone must stay in the formation). */
export function canReserve(m: readonly MusterHero[], id: string): MusterWhy | null {
  const field = fieldIds(m);
  if (field.length <= 1 && field.includes(id)) return 'last';
  return null;
}

/** Flip a hero between the formation and the reserve (mutates `m`). */
export function toggleReserve(m: MusterHero[], id: string): { ok: true; reserve: boolean } | { ok: false; why: MusterWhy } {
  const h = m.find((x) => x.id === id);
  if (!h) return { ok: false, why: 'wounded' };
  // a man beyond the caps stands in camp whatever his flag says
  if (!fieldIds(m).includes(id)) {
    const why = canField(m, id);
    if (why) return { ok: false, why };
    h.reserve = false;
    return { ok: true, reserve: false };
  }
  const why = canReserve(m, id);
  if (why) return { ok: false, why };
  h.reserve = true;
  return { ok: true, reserve: true };
}

/**
 * The +/- of a unit type: +1 fields the strongest fit reserve of that class,
 * -1 sends the weakest fielded one back to camp. Returns the hero changed.
 */
export function shiftClass(m: MusterHero[], cls: ClassId, dir: 1 | -1): { ok: true; id: string; reserve: boolean } | { ok: false; why: MusterWhy } {
  const field = new Set(fieldIds(m));
  if (dir > 0) {
    const cands = m.filter((h) => h.cls === cls && !h.wounded && !field.has(h.id)).sort((a, b) => b.power - a.power);
    let why: MusterWhy = 'wounded';
    for (const h of cands) {
      // a man already marked for the field but over the cap counts as reserve here
      h.reserve = true;
      const w = canField(m, h.id);
      if (!w) {
        h.reserve = false;
        return { ok: true, id: h.id, reserve: false };
      }
      why = w;
    }
    return { ok: false, why };
  }
  const cands = m.filter((h) => h.cls === cls && field.has(h.id)).sort((a, b) => a.power - b.power);
  if (!cands.length) return { ok: false, why: 'wounded' };
  const why = canReserve(m, cands[0].id);
  if (why) return { ok: false, why };
  cands[0].reserve = true;
  return { ok: true, id: cands[0].id, reserve: true };
}

/** The reserve flags to store (only the heroes whose flag differs from `before`). */
export function reserveChanges(before: readonly MusterHero[], after: readonly MusterHero[]): Record<string, boolean> {
  const was = new Map(before.map((h) => [h.id, h.reserve]));
  const out: Record<string, boolean> = {};
  for (const h of after) if (was.get(h.id) !== h.reserve) out[h.id] = h.reserve;
  return out;
}
