/**
 * What a man of the roster is doing now, in one or two words (the roster rows and the soldier card): his live unit's
 * state first (striking, walking, building, gathering), then his squad's order, else where he stands. Local to the
 * roster; to be merged with the squad card's activityText (../activity.ts) later.
 */
import type { Order, UnitSnap } from '../../../types';

export interface Doing { where: 'field' | 'away' | 'wounded' | 'captive' | 'dead'; unit?: UnitSnap; order?: Order['kind']; region: string }

const ORDER_WORD: Partial<Record<Order['kind'], string>> = {
  move: 'Marching', attackMove: 'Marching', attack: 'Fighting', build: 'Building', placeBuilding: 'Building', gather: 'Gathering', hold: 'Holding',
};

export function doingText(d: Doing): string {
  if (d.where === 'wounded') return 'Wounded';
  if (d.where === 'captive') return 'Captive';
  if (d.where === 'dead') return 'Fallen';
  const u = d.unit;
  if (d.where === 'field' && u) {
    if (u.state === 'attack') return 'Fighting';
    if (u.state === 'build') return 'Building';
    if (u.state === 'gather') return 'Gathering';
    const w = d.order && ORDER_WORD[d.order];
    if (w) return w;
    if (u.state === 'move') return 'Marching';
  }
  return `In ${d.region}`;
}
