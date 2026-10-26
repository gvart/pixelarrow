/** Fog and vision (W-39): the player on a team other than 0, to check that the view takes the player's side everywhere. */
import type { Scenario } from './types';
import { at, FIELD, hold, S, you } from './kit';

export const FOG_SCENARIOS: Scenario[] = [
  {
    id: 'fog-team2',
    name: 'Playing as team 2',
    group: 'fog',
    goal: 'You are team 2 (gold). Your squads stand by the east road; a team-1 force waits out of sight to the north, a team-0 squad to the west. Scout.',
    check: ['Your men draw in your colour (slot 0) and are selectable; team 0 draws in another', 'Foes show only within your sight; the shroud keeps what you explored', 'Fog off (console Overlays) shows everyone; on again hides them', 'Stock and build go to team 2'],
    team: 2,
    squads: [
      you('hoplite', at(FIELD, -4, 6), 12, undefined, 2), you('archer', at(FIELD, 4, 8), 12, undefined, 2),
      { team: 1, cls: 'celt_sword', count: 12, x: FIELD[0], y: FIELD[1] - 40, bot: hold(at(FIELD, 0, -40), 8) },
      { team: 1, cls: 'archer', count: 12, x: FIELD[0] + 8, y: FIELD[1] - 44, bot: hold(at(FIELD, 8, -44), 8) },
      { team: 0, cls: 'militia', count: 12, x: FIELD[0] - 36, y: FIELD[1], owner: 'ally' },
    ],
    camera: { x: FIELD[0], y: FIELD[1] - 10, zoom: 1 / 2 },
    economy: { claims: [{ team: 2, x: FIELD[0], y: FIELD[1] + 6, r: 12 }], stock: { wood: 200 } },
  },
  {
    id: 'fog-ambush',
    name: 'Vision: woods and high ground',
    group: 'fog',
    goal: 'An enemy squad waits in the forest, another on the ridge crest. March your scouts toward them and see when they show.',
    check: ['Foes in the woods show late (sight blocked)', 'High ground sees farther', 'Bots see only what their team sees (they do not chase unseen men)'],
    squads: [
      you('javelineer', at(S.ridgeFoot, 0, 14)), you('hoplite', at(S.ridgeFoot, -8, 18)),
      { team: 1, cls: 'archer', count: 12, x: S.ridgeCrest[0], y: S.ridgeCrest[1], bot: hold(S.ridgeCrest, 6) },
    ],
    camera: { x: S.ridgeFoot[0], y: S.ridgeFoot[1], zoom: 1 / 2 },
  },
];
