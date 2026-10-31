/**
 * W-79 follow-up: the low-food warning (a playtest starved with no word of it). Each of the player's squads gets one
 * toast when its packs run low (FOOD.low bites a man or fewer, src/war/types.ts SquadSnap.meals) and one when a man of
 * it goes hungry (src/war/sim/food.ts hungerStage); each warns again only once the squad has recovered (FOOD.ok bites a
 * man, every man fed past HUNGER.eatAt). Packs already low when a squad is first seen warn only once refilled and run
 * low again. The squad card's fed % and its food mark (`mealsMark`) carry the same colours.
 */
import { HUNGER, hungerStage } from '../../sim/food';
import type { Snapshot } from '../../types';
import { glyph } from './glyph';
import { chip } from './qcard';
import type { Note } from './roster/state';

export const FOOD = { low: 2, ok: 4 } as const;

/** 'ok', 'low' (FOOD.low bites a man or fewer) or 'out' (none) for `meals` bites among `men` men. */
export const packLevel = (meals: number, men: number): 'ok' | 'low' | 'out' => (meals <= 0 ? 'out' : meals <= FOOD.low * men ? 'low' : 'ok');

/** The squad card's food mark: the ration icon and the bites left in their packs, amber when low, red when out. */
export function mealsMark(meals: number | undefined, men: number): string {
  if (meals === undefined || men <= 0) return '';
  const lv = packLevel(meals, men);
  return `<span class="hud-fed ${lv === 'ok' ? 'good' : lv === 'low' ? 'warn' : 'bad'}" title="food left in their packs" style="display:inline-flex;align-items:center;gap:2px;vertical-align:-3px">${glyph('goods:march_rations', 14)}${meals}</span>`;
}

export interface FoodWarn { squad: number; kind: 'pack' | 'hungry' | 'starving'; meals?: number }
/** Per squad: which warnings it has had and not yet recovered from. */
export type FoodMemo = Map<number, { pack: boolean; hungry: boolean }>;

/** The warnings due now for squads owned by `owner`; `memo` remembers what was told. */
export function foodWarnings(cur: Snapshot, owner: string, memo: FoodMemo): FoodWarn[] {
  const out: FoodWarn[] = [];
  const byId = new Map(cur.units.map((u) => [u.id, u]));
  for (const q of cur.squads) {
    if (q.owner !== owner || q.civ) continue;
    const men = q.units.map((id) => byId.get(id)).filter((u) => u && u.state !== 'dead' && u.sat !== undefined);
    if (!men.length) continue;
    let m = memo.get(q.id);
    // first seen: packs already low say nothing (a scenario's or a returning player's men; hunger still warns)
    if (!m) memo.set(q.id, (m = { pack: q.meals !== undefined && packLevel(q.meals, men.length) !== 'ok', hungry: false }));
    if (q.meals !== undefined) {
      if (!m.pack && packLevel(q.meals, men.length) !== 'ok') { m.pack = true; out.push({ squad: q.id, kind: 'pack', meals: q.meals }); }
      else if (m.pack && q.meals >= FOOD.ok * men.length) m.pack = false;
    }
    const worst = Math.min(...men.map((u) => u!.sat!)), st = hungerStage(worst);
    if (!m.hungry && st > 0) { m.hungry = true; out.push({ squad: q.id, kind: st === 2 ? 'starving' : 'hungry' }); }
    else if (m.hungry && worst >= HUNGER.eatAt) m.hungry = false;
  }
  return out;
}

/** The toast of a warning (W-70: an icon, a few plain words, the count in a chip). */
export function foodNote(w: FoodWarn): Note {
  if (w.kind === 'pack') return { kind: 'info', icon: glyph('goods:march_rations', 18), text: w.meals ? 'Food low: restock in town' : 'Packs empty: restock in town', chips: chip.any(glyph('goods:march_rations', 16), String(w.meals ?? 0), 'bad', 'Food left in their packs') };
  return { kind: 'info', icon: glyph('power:hunger', 18), text: w.kind === 'starving' ? 'Men starving: get food in town' : 'Men hungry: get food in town' };
}
