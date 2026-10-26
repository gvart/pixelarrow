/** Limits: the army cap (W-58, ARMY_MAX men across all regions) and entering a region from the world. */
import type { Scenario } from './types';
import { at, FIELD, hold, you } from './kit';

export const LIMIT_SCENARIOS: Scenario[] = [
  {
    id: 'limit-army',
    name: 'The 12-man army cap',
    group: 'limits',
    goal: 'Your whole army, 12 men, stands in one squad, with two cooks of the household beside it. Try to field more.',
    check: ['Roster (R) head: 12 / 12 men; the cooks do not count', 'Recruiting is refused while the army is full', 'A fallen man frees a place (console: strike down one, then recruit)'],
    squads: [you('hoplite', at(FIELD, 0, 0)), you('civ_cook', at(FIELD, 0, 8), 2)],
    camera: { x: FIELD[0], y: FIELD[1], zoom: 1 },
  },
  {
    id: 'limit-entry',
    name: 'Region entry',
    group: 'limits',
    goal: 'Your squad has just come in at the west entry of the Teeth Foothills and marches in; a bandit squad lurks near the entry.',
    check: ['The squad stands at the entry rect and walks in', 'Shift+W: the world map; a transfer out is refused with a foe within 20 tiles', 'Kill or lose the bandits, then transfer out'],
    region: 'dodona-e',
    squads: [
      you('hoplite', [6, 210], 12, { kind: 'move', x: 40, y: 210 }),
      { team: 1, cls: 'mob_bandit', count: 8, x: 30, y: 226, bot: hold([30, 226], 6) },
    ],
    camera: { x: 22, y: 212, zoom: 1 / 2 },
  },
];
