/**
 * The Army template's rules as plain functions (no Phaser): slot order, Back,
 * the footer's spacing, when the hero card collapses, the head's rows.
 * tests/armyTemplate.test.ts holds them.
 */
import type { Slot } from '../../data/items';
import { resolveBack, type BackTarget } from '../../platform/nav';

/**
 * One slot order for Army and Hero (ARM-8): the Hero sheet's left column (helmet, armour,
 * trinket) then its right column (weapon, shield), read left to right; the mount last.
 */
export const SLOT_ORDER: readonly Slot[] = ['helmet', 'armor', 'trinket', 'weapon', 'shield'];

/** Where the Army screen was opened from (the callers' `{ from, id }`). */
export interface ArmyOrigin {
  from?: string;
  /** The settlement's id when `from` is 'Settlement'. */
  id?: number;
}

/**
 * Back from the Army screen (BACK_RULES `origin`, fallback World): the screen that opened it,
 * with the data that screen needs to reopen as it was (the town, the field camp).
 */
export function armyBack(o: ArmyOrigin): BackTarget {
  const data = o.from === 'Settlement' ? { id: o.id } : o.from === 'Camp' ? { mode: 'field' } : {};
  return resolveBack('Army', o.from ? { scene: o.from, data } : null) ?? { scene: 'World', data: {} };
}

/** Gap between Dismiss and Sheet in UI px: a destructive action is never next to the primary (P4: >= 16 pt; C-7: 24 pt). */
export const FOOT_GAP = 12;

/**
 * The footer's two buttons in a bar `w` wide (inner padding `pad`): Dismiss on the left, Sheet (primary,
 * thumb side) on the right, each at least its natural width (`dismissW`, `sheetW`) when both fit; the
 * primary takes the rest.
 */
export function footerLayout(w: number, dismissW: number, sheetW: number, pad = 4): { dismiss: { x: number; w: number }; sheet: { x: number; w: number } } {
  const inner = w - pad * 2 - FOOT_GAP;
  const dw = Math.round(Math.max(Math.min(dismissW, inner - sheetW), inner * 0.38));
  return { dismiss: { x: pad, w: dw }, sheet: { x: pad + dw + FOOT_GAP, w: inner - dw } };
}

/** The hero card collapses to its one-line header once the name line has scrolled away (P21). */
export function collapsed(scrollY: number, cardTop: number): boolean {
  return scrollY > cardTop + 12;
}

/** Whether the group's name (`nameW` wide) fits in the `room` the four group buttons leave beside them (else it goes under them). */
export function groupNameBeside(room: number, nameW: number): boolean {
  return nameW <= room;
}

/** Class ids whose painted bust is shipped under public/ui/busts/ (tests/armyTemplate.test.ts checks the files). */
export const SHIPPED_BUSTS: ReadonlySet<string> = new Set(['hoplite', 'militia', 'peltast', 'slinger']);

export const bustKey = (cls: string): string => `bust_${cls}`;
export const bustUrl = (cls: string): string => `ui/busts/bust_${cls}.jpg`;
