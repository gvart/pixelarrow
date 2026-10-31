/**
 * W-61 peaceful play scenarios (docs/WAR.md "Peaceful play"): one per mechanic, on the flat open stretch of the
 * south-west (FLAT, the wall-defense ring's ground). The town level, the walls and the build labour play out in the sim;
 * works, contracts, the peace score and titles are the server's, so their checklists say what to look at online
 * (`?net=`) and what the offline panels show.
 */
import { SQUAD_MAX } from '../sim/soldiers';
import type { Scenario } from './types';
import { at, FLAT, you } from './kit';

/** The ring (as wall-defense): line x 119..135, y 425..440, its centre. */
const RING = { x0: 119.5, y0: 425.5, x1: 135.5, y1: 440.5 } as const;
const RC = [127.5, 433] as const;
type Eco = NonNullable<Scenario['economy']>;
/** Four stone lines (north and south take the corners), a stone gate in the south. */
const stoneRing = (a: number, b: number, phase = 1): NonNullable<Eco['walls']> => [
  { squad: a, material: 'stone', points: [RING.x0, RING.y0, RING.x1, RING.y0], inside: [RC[0], RC[1]], phase },
  { squad: a, material: 'stone', points: [RING.x0, RING.y1, RING.x1, RING.y1], gates: [127.5, RING.y1], inside: [RC[0], RC[1]], phase },
  { squad: b, material: 'stone', points: [RING.x0, RING.y0 + 2, RING.x0, RING.y1 - 2], inside: [RC[0], RC[1]], phase: phase + 1 },
  { squad: b, material: 'stone', points: [RING.x1, RING.y0 + 2, RING.x1, RING.y1 - 2], inside: [RC[0], RC[1]], phase: phase + 1 },
];
/** A village's six kinds inside the ring: camp, store, olive press, forge, cookhouse, kiln (phase 1, after the camp). */
const village = (a: number, b: number): NonNullable<Eco['sites']> => [
  { squad: a, type: 'camp', x: 127, y: 434 },
  { squad: a, type: 'storehouse', x: 123, y: 430, phase: 1 },
  { squad: b, type: 'olivePress', x: 131.5, y: 430.5, phase: 1 },
  { squad: a, type: 'forge', x: 123, y: 437, phase: 1 },
  { squad: b, type: 'cookhouse', x: 132, y: 437, phase: 1 },
  { squad: a, type: 'pitchKiln', x: 127, y: 429, phase: 1 },
];
const STOCK = { wood: 4000, stone: 5000, iron: 50, pitch: 20 };

export const PEACE_SCENARIOS: Scenario[] = [
  {
    id: 'peace-town-level',
    name: 'Town level: a village walls itself in',
    group: 'building',
    goal: 'A village of six kinds stands round your camp (level 3). The militia then raise a stone ring with a gate round it: once it closes, the town is level 4.',
    check: [
      'Top centre: the town badge reads Village with 3 pips; click it: kinds, stone share, walls closed: no',
      'Perks listed: chests +2 loads, hunger 10% slower, souls 25% more often, repairs 10% faster',
      'The ring goes up (watch the sites); once all four sides and the gate stand: walls closed yes, badge Town (4 pips)',
      'A man inside the ring: his hunger falls slower than one outside (the chest\'s hunger marks)',
    ],
    squads: [you('militia', at(FLAT, -4, 2)), you('militia', at(FLAT, 4, 2)), you('militia', at(FLAT, -2, -2)), you('militia', at(FLAT, 2, -2))],
    camera: { x: RC[0], y: RC[1], zoom: 1 },
    economy: { claims: [{ team: 0, x: RC[0], y: RC[1], r: 26 }], stock: STOCK, sites: village(0, 1), prebuild: 6000 },
    // a squad a line (a squad's last order is the one it works)
    after: { orders: [], squads: [], then: stoneRing(0, 1, 0).map(({ phase: _p, ...w }, i) => ({ kind: 'placeWall' as const, ...w, squad: i })) },
  },
  {
    id: 'peace-works',
    name: 'Alliance works: feed the temple',
    group: 'economy',
    goal: 'Your men stand at the town. Open Works (top right): the temple, the road and bridge and the beacon line with their needs. Online, give goods from your strongroom and send men to the site to labour.',
    check: [
      'Works lists three works, each with goods bars (stone, marble, coin, ...) and a men bar in man-hours',
      'Offline: needs only and the Give button is off ("online only")',
      'Online (?net=, your home region): Give 50 stone takes it from your strongroom; the bar and your name under it grow',
      'Men of your alliance standing within 10 tiles of the site add labour every 10 s; a finished work says "stands"',
    ],
    squads: [you('militia', at(RC, 0, 0)), you('civ_engineer', at(RC, 3, 0), 1)],
    camera: { x: RC[0], y: RC[1], zoom: 1 },
    economy: { claims: [{ team: 0, x: RC[0], y: RC[1], r: 26 }], stock: { wood: 600, stone: 600, marble: 120, coin: 300 }, sites: [{ squad: 0, type: 'camp', x: 127, y: 434 }], prebuild: 3000 },
  },
  {
    id: 'peace-build-contract',
    name: 'Build contract: an ally raises your storehouse',
    group: 'economy',
    goal: 'Your camp stands; an ally of your alliance (a second player\'s militia) lays out a storehouse beside it and builds it. Post a build contract for one of your open sites in the market\'s Contracts tab.',
    check: [
      'K, Contracts: kind build lists your open sites here (#id type), man-hours and the reward; Post escrows the reward',
      'The ally\'s men work the site; online each 10 s of their labour releases its share of the reward to him',
      'The row shows labour done / asked in man-hours and the coin paid so far',
      'A man of another alliance cannot take it ("Only a man of the same alliance")',
    ],
    squads: [you('militia', at(RC, -3, 2)), { team: 0, cls: 'militia', count: 6, x: RC[0] + 4, y: RC[1] + 2, owner: 'p:2' }],
    camera: { x: RC[0], y: RC[1], zoom: 1 },
    economy: { claims: [{ team: 0, x: RC[0], y: RC[1], r: 26 }], stock: { wood: 800, stone: 400, coin: 300 }, sites: [{ squad: 0, type: 'camp', x: 127, y: 434 }], prebuild: 3000 },
    after: { orders: [], squads: [], then: [{ kind: 'placeBuilding', squad: 1, type: 'storehouse', x: 122, y: 430 }] },
  },
  {
    id: 'peace-guard',
    name: 'Guard contract: hold my town',
    group: 'siege',
    goal: 'Your village stands; an ally\'s hoplites (another player of your alliance) stand guard inside its ground while a raid of 8 comes up from the south. Post a guard contract: hold your town with n men for h hours.',
    check: [
      'The town card says how far its ground reaches (48 m round the camp); the guards stand inside it',
      'K, Contracts: kind guard takes the region, the men and the hours; the reward is escrowed',
      'Online: every 10 s the room checks the guard\'s men inside; each whole hour pays reward / hours',
      'Walk the guards out (or let them fall) for 2 minutes: the contract breaks and the rest goes back to you',
    ],
    squads: [you('militia', at(RC, -2, 0)), { team: 0, cls: 'hoplite', count: 8, x: RC[0] + 3, y: RC[1] + 5, owner: 'p:2' }],
    camera: { x: RC[0], y: RC[1] + 6, zoom: 1 },
    economy: { claims: [{ team: 0, x: RC[0], y: RC[1], r: 26 }], stock: STOCK, sites: village(0, 0).slice(0, 4), prebuild: 5000 },
    after: { orders: [], squads: [{ team: 1, cls: 'celt_sword', count: 8, x: RC[0], y: RC[1] + 24, bot: { kind: 'attackMove', x: RC[0], y: RC[1] } }] },
  },
  {
    id: 'peace-walls',
    name: 'Walls that matter: a raid at a stone gate',
    group: 'siege',
    goal: 'A closed stone ring with a stone gate stands. Eleven swordsmen with no ram come at it: the stone gate barely marks under their blows.',
    check: [
      'The raiders come up to the ring (if they stand off, select them in the console and attack the gate)', 'Select the stone gate: its hp falls under 5% a minute (blows on stone count a quarter)',
      'Console: give the raiders a ram (Siege tab, team 1): a crewed ram breaks the stone gate in a few minutes',
      'Ladders still raise against the stone wall (siege ladder): the walls stop raids, not sieges',
      'tests/war/wallsMatter.test.ts: no break in 20 min without a ram; under 5 min with one',
    ],
    squads: [you('militia', at(RC, -3, -3)), you('militia', at(RC, 3, -3))],
    camera: { x: RC[0], y: RING.y1, zoom: 1 },
    economy: {
      claims: [{ team: 0, x: RC[0], y: RC[1], r: 26 }], stock: STOCK,
      sites: [{ squad: 0, type: 'camp', x: 127, y: 434 }],
      walls: stoneRing(0, 1),
      prebuild: 28000,
    },
    after: {
      orders: [], squads: [{ team: 1, cls: 'celt_sword', count: 11, x: 127.5, y: RING.y1 + 8, bot: { kind: 'attackMove', x: RC[0], y: RC[1] } }],
    },
  },
  {
    id: 'peace-score',
    name: 'Peace score: what builders and traders add',
    group: 'economy',
    goal: 'A levelled village of yours stands. Its level scores your alliance an hour; trade volume, filled contracts and raised works score too. Check the world map\'s season panel.',
    check: [
      'World (Shift+W): the season panel lists Peace score per alliance: volume · contracts · works',
      'Offline (mock world): sample numbers; online they grow with fills, filled contracts and works',
      'Town levels score an hour: Hamlet 0.25, Village 0.5, Town 1, City 1.5, at most 3 an hour an alliance',
      'docs/WAR.md "Season score and victory": the weights and daily caps',
    ],
    squads: [you('militia', at(RC, 0, 0)), you('militia', at(RC, 4, 0))],
    camera: { x: RC[0], y: RC[1], zoom: 1 },
    economy: { claims: [{ team: 0, x: RC[0], y: RC[1], r: 26 }], stock: STOCK, sites: village(0, 1), prebuild: 6000 },
  },
  {
    id: 'peace-titles',
    name: 'Titles of the season',
    group: 'economy',
    goal: 'A squad of yours. The season\'s titles (Merchant Prince, Master Builder, Warden, Ares-born) show under the roster\'s tabs, in the Works panel and on the world map.',
    check: [
      'R: the roster shows a strip of the titles and their holders (yours in gold) online',
      'Works panel: Titles this season with the value each leads by, and your own line (coin sold, contracts, man-hours, hours held)',
      'World map: the season panel lists the titles with the holder\'s alliance and home',
      'Offline: the world map shows the mock\'s titles; the roster strip stays empty',
    ],
    squads: [you('hoplite', at(RC, 0, 0), SQUAD_MAX)],
    camera: { x: RC[0], y: RC[1], zoom: 1 },
  },
];
