/**
 * Work clips for gathering and building units (the Animator override, ../anim.ts): labour plays `build` (militia has
 * it; others swing their weapon), walking with a load plays `carry`. Without these clips the usual pick shows.
 */
import type { UnitSnap } from '../../types';

const LABOUR = ['build', 'thrust', 'attack'] as const;
const CARRY = ['carry'] as const;

export function workClip(u: UnitSnap): readonly string[] | undefined {
  if (u.state === 'build' || u.state === 'gather') return LABOUR;
  if (u.carry && u.state === 'move') return CARRY;
  return undefined;
}
