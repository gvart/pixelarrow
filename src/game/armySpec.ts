/** Converts campaign heroes into simulation army specs. */
import { GROUP_NAMES, type Hero } from '../data/units';
import { computeStats } from '../sim/stats';
import type { ArmySpec, GroupRole } from '../sim/types';
import type { FormationType } from '../sim/formation';

export const GROUP_ROLES: GroupRole[] = ['main', 'skirmish', 'reserve', 'flank'];
const DEFAULT_FORMATION: FormationType[] = ['line', 'skirmish', 'line', 'column'];

export function armySpec(heroes: Hero[], bot: boolean, formations?: FormationType[]): ArmySpec {
  return {
    bot,
    groups: GROUP_NAMES.map((name, i) => ({ name, role: GROUP_ROLES[i], formation: formations?.[i] ?? DEFAULT_FORMATION[i] })),
    units: heroes.map((h) => ({ heroId: h.id, name: h.name, level: h.level, group: Math.max(0, Math.min(3, h.group)), stats: computeStats(h) })),
  };
}
