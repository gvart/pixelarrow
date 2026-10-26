/**
 * Siege scenarios, one engine or tactic each, against a small fort of team 1 on the flat south-west stretch (FLAT): its
 * garrison (squad 0) raises a wall line across y 440.5 before play; your squads come from the south (ids from 1). The
 * full fort, the defence and the walled camp are in ./index.ts (siege, siege-defend, wall-defense).
 */
import type { Scenario } from './types';
import { bot, FLAT, you } from './kit';

type Wall = NonNullable<NonNullable<Scenario['economy']>['walls']>[number];
const LINE = [119.5, 440.5, 135.5, 440.5];
/** The garrison's fort: a claim, a camp to haul from, the wall line (and more sites), prebuilt. */
const fort = (walls: Wall[], sites: NonNullable<Scenario['economy']>['sites'] = [], stock: NonNullable<Scenario['economy']>['stock'] = {}): NonNullable<Scenario['economy']> => ({
  claims: [{ team: 1, x: FLAT[0], y: FLAT[1], r: 22 }],
  stock,
  foeStock: { wood: 1500, stone: 500 },
  walls,
  sites: [{ squad: 0, type: 'camp', x: 127, y: 432 }, ...sites],
  prebuild: 12000,
});
const garrison = { team: 1, cls: 'militia', count: 12, x: FLAT[0], y: FLAT[1], owner: 'garrison' };

export const SIEGE_SCENARIOS: Scenario[] = [
  {
    id: 'siege-ram-gate',
    name: 'Ram vs a gate',
    group: 'siege',
    goal: 'A palisade with a wood gate. Your militia build a ram south of it and crew it; send the ram at the gate (E on the gate).',
    check: ['The ram is built (Siege tab site) and crewed (E on the ram)', 'E on the gate: the ram rolls up and batters it; the gate hp drops', 'The roof covers half the arrows; the gate breaks open'],
    squads: [garrison],
    camera: { x: 127.5, y: 448, zoom: 1 / 2 },
    economy: fort([{ squad: 0, material: 'wood', points: LINE, gates: [127.5, 440.5] }], [], { wood: 300 }),
    after: {
      orders: [{ kind: 'move', squad: 0, x: FLAT[0], y: FLAT[1] - 4 }],
      squads: [you('militia', [127.5, 461]), you('hoplite', [122, 464])],
      then: [{ kind: 'buildSiege', squad: 1, type: 'ram', x: 127.5, y: 457.5 }],
      later: { settle: 1300, orders: [{ kind: 'crew', squad: 1, siege: 0 }] },
    },
  },
  {
    id: 'siege-ladders',
    name: 'Ladders on a wall',
    group: 'siege',
    goal: 'A timber rampart with a walkway, two archer squads on it. Your militia carry a siege ladder to its foot and raise it; climb.',
    check: ['The ladder is carried slowly to the outer foot of the wall', 'E on the wall face raises it; men climb to the walk', 'Defenders push it off (they try; P is the defenders\' key)'],
    squads: [garrison],
    camera: { x: 127.5, y: 446, zoom: 1 / 2 },
    economy: fort([{ squad: 0, material: 'timber', points: LINE, inside: [FLAT[0], FLAT[1]] }], [], { wood: 300 }),
    after: {
      orders: [{ kind: 'move', squad: 0, x: FLAT[0], y: FLAT[1] - 4 }],
      squads: [
        you('militia', [124.5, 458], 8), you('hoplite', [131, 460]),
        bot('archer', [127, 436], { kind: 'defendWalls', x: FLAT[0], y: FLAT[1], radius: 9 }, 8),
      ],
      then: [{ kind: 'buildSiege', squad: 1, type: 'siegeLadder', x: 124.5, y: 455.5 }],
      later: { settle: 900, orders: [{ kind: 'crew', squad: 1, siege: 0 }] },
    },
  },
  {
    id: 'siege-fire',
    name: 'Fire vs a palisade',
    group: 'siege',
    goal: 'A palisade and a wood tower. A lit brazier stands by your archers and you have pitch: toggle fire arrows (Q) and burn them; or E with torches.',
    check: ['Q toggles fire arrows (the squad card says why when it cannot)', 'Struck wood catches fire and burns down over time', 'Stone does not burn; the defenders beat out fires (O)'],
    squads: [garrison],
    camera: { x: 127.5, y: 448, zoom: 1 / 2 },
    economy: fort([{ squad: 0, material: 'wood', points: LINE }], [{ squad: 0, type: 'woodTower', x: 127, y: 438 }], { wood: 100, pitch: 60 }),
    after: {
      orders: [{ kind: 'move', squad: 0, x: FLAT[0], y: FLAT[1] - 4 }],
      squads: [you('archer', [124, 452]), you('archer', [131, 452]), you('militia', [127.5, 458], 8)],
      then: [{ kind: 'placeBuilding', team: 0, type: 'brazier', x: 127.5, y: 454.5 }],
    },
  },
  {
    id: 'siege-thrower',
    name: 'Stone thrower',
    group: 'siege',
    goal: 'A palisade with a wood tower behind it. Your crew builds a stone thrower out of bowshot and shells the tower.',
    check: ['Built and crewed, Y deploys it (and packs it)', 'Boulders arc in and splash; the tower hp drops', 'It cannot hit inside its least range'],
    squads: [garrison],
    camera: { x: 127.5, y: 450, zoom: 1 / 2 },
    economy: fort([{ squad: 0, material: 'wood', points: LINE }], [{ squad: 0, type: 'woodTower', x: 127, y: 437 }], { wood: 400, stone: 100 }),
    after: {
      orders: [{ kind: 'move', squad: 0, x: FLAT[0], y: FLAT[1] - 4 }],
      squads: [you('militia', [127.5, 470], 10)],
      then: [{ kind: 'buildSiege', squad: 1, type: 'stoneThrower', x: 127.5, y: 466.5 }],
      later: { settle: 1600, orders: [{ kind: 'crew', squad: 1, siege: 0 }] },
    },
  },
];
