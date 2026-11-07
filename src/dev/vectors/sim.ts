/**
 * The sim core (src/war/sim/index.ts) on the move-* scenarios, the squad fights and the economy and building ones, longer
 * than the P1 traces and unrounded: every unit's position, hp and facing, every building's progress and the stock every
 * 25 ticks over 600, so the C++ Sim is checked bit for bit through the settling, stuck and re-path rules, the whole of a
 * fight (blows, shots, falls) and the works (sites, walls, bridges, gathering, stores, hunger) that 50 ticks never reach
 * (godot/tests/sim/test_traces.gd). The event log (WarEvent, drained at each checkpoint) is compared too.
 */
import { SCENARIOS } from '../../war/scenarios';
import type { Snapshot, WarBuildSim, WarEvent } from '../../war/types';
import { play, type HostOps, type SetupOp } from '../godotTraces';
import { makePerson } from '../../war/sim/roster';

/** A WarEvent as the C++ log keeps it: a soul's claimer named by his id, name, class and level (not his whole record). */
export const eventOf = (e: WarEvent) =>
  e.kind === 'soulClaimed' ? { ...e, person: { id: e.person.id, name: e.person.hero.name, ...(e.person.hero.cls ? { cls: e.person.hero.cls } : {}), level: e.person.hero.level } } : e;

/** The snapshot unrounded, and the event log since the last checkpoint. */
export const exact = (s: Snapshot, sim: WarBuildSim) => ({
  tick: s.tick,
  units: s.units.map((u) => [u.id, u.squad, u.x, u.y, u.hp, u.state, u.facing]),
  squads: s.squads.map((q) => [q.id, q.team, q.owner]),
  buildings: (s.buildings ?? []).map((b) => [b.id, b.type, b.team, b.state, b.progress]),
  stock: s.stock ?? {},
  events: sim.events().map(eventOf),
});

/** The squad fights: no buildings, works, siege, trade, lairs or civilians. */
const FIGHTS = new Set([
  'pass-ambush', 'ford-crossing', 'hill-assault', 'bridge-vs-ford', 'brawl-600', 'combat-lines', 'combat-high-ground', 'combat-skirmish',
  'combat-flank', 'clip-battle', 'fog-high-ground', 'peace-titles',
]);

/**
 * Works without siege, carts, lairs or civilians: sites, walls, bridges, gathering, stores, hunger, pre-built pieces. Their
 * prebuilds run up to WORKS_CAP ticks (the P1 traces stop at 40), so the camps stand and the men gather into them.
 */
const WORKS = new Set([
  'eco-wood', 'eco-stone', 'eco-stores', 'eco-ore', 'build-access', 'build-no-workers', 'build-stalled', 'build-wall-gate', 'build-wall-rock',
  'build-wall-tower', 'build-test', 'bridge-test', 'clip-build', 'peace-build-contract', 'peace-guard', 'peace-town-level', 'peace-walls',
  'food-hunger', 'fog-team2', 'siege-fire', 'wall-defense', 'limit-entry', 'veterans', 'warlord-hall', 'warlord-raid',
]);
const WORKS_CAP = 1500;

/**
 * Civilians, siege engines and trade: flight, civilian work and crafting queues, carts and their loads, escorts, safe
 * zones, engines built, crewed and fought over. Prebuilt as WORKS (the camps and workshops stand before the run).
 */
const CIV_SIEGE_TRADE = new Set([
  'combat-wounded', 'limit-army', 'civ-flee', 'civ-household', 'crafting', 'eco-farm', 'village', 'build-each', 'peace-works', 'trailer-elaia',
  'trailer-elaia-raid', 'siege-ram-gate', 'siege-thrower', 'market', 'loot', 'eco-trade', 'eco-handcart', 'clip-caravan', 'siege', 'siege-defend',
  'siege-ladders', 'caravan',
]);

/** The wild: lairs and their mobs, guardians and their landmarks, roaming folk, souls (the P1 traces' cap). */
const WILD = new Set(['limit-soul', 'neutral-clear', 'eco-hunt', 'trailer-hunt', 'world-fill']);
const wild = (id: string) => WILD.has(id) || id.startsWith('boss-') || id.startsWith('landmark-');

/** The scenarios run exactly. */
export const RUNS = SCENARIOS.filter((s) => s.id.startsWith('move-') || s.id.startsWith('mob-') || FIGHTS.has(s.id) || WORKS.has(s.id) || CIV_SIEGE_TRADE.has(s.id) || wild(s.id));

/** A host run's digest: exact, each team's fog (a sight bonus shows there) and the loot piles (a chief's loot). */
const withFog = (s: Snapshot, sim: WarBuildSim) => ({
  ...exact(s, sim),
  fog: Object.fromEntries([0, 1].map((t) => [t, sim.teamGrid(t).state.reduce((a, v) => a + v, 0)])),
  piles: (s.piles ?? []).map((p) => [p.id, p.x, p.y, p.goods, (p.list ?? []).map((i) => [i.uid, i.def, i.rarity]), p.items]),
});

/** Men of record: kit of a tier and rarity, stored affixes and a power, honours, skills. */
const men = (prefix: string, cls: string, n: number, level: number) =>
  Array.from({ length: n }, (_, i) => {
    const p = makePerson(`${prefix}-${i}`, cls, { level, tier: 2, rarity: (['rare', 'epic', 'legendary'] as const)[i % 3], name: `${prefix} ${i}` });
    const w = p.hero.equip.weapon;
    if (w && i % 2) (w.aff = 'dmg:3,atkSpeed:2'), (w.pow = 'executioner'), (w.q = 2);
    if (i % 3 === 0) p.honours = [{ name: 'Of the ford', stat: 'dmg' }, { name: 'Of the hill', stat: 'hp' }];
    return p;
  });

/**
 * The host calls no scenario makes (godotTraces.ts hostOp): each owner's path (limits, perks on men, sites and work), a
 * team bonus (sight, repairs), persons of record spawned and fighting, a named soul claimed, a chief hunted down.
 */
export const HOST: { id: string; of: string; ticks: number; cap?: number; host: HostOps }[] = [
  // the builder's men work faster, his sites cost less and stand stronger; his worker cap; repairs and sight of team 0
  { id: 'host-builder', of: 'build-each', ticks: 600, cap: WORKS_CAP, host: {
    pre: [['setPaths', { you: { path: 'builder', family: null, level: 12 } }], ['setBonus', 0, { repairCost: 0.5, sight: 3 }]],
    post: [
      ['order', { kind: 'placeBuilding', squad: 0, type: 'storehouse', x: 120, y: 440 }],
      ['order', { kind: 'placeBuilding', squad: 1, type: 'workshop', x: 134, y: 440 }],
    ],
  } },
  // a builder's army is full at 4: the soul is refused; then the path is lifted (NO_PATH) and the claim goes through
  { id: 'host-souls', of: 'limit-soul', ticks: 600, host: {
    pre: [['setPaths', { you: { path: 'builder', family: null, level: 3 } }]],
    post: [['order', { kind: 'claimSoul', squad: 0, soul: 0 }], ['order', { kind: 'claimSoul', squad: 1, soul: 1 }]],
  } },
  // a released man wakes at Elaia's temple as himself and joins a pilgrim's three men of record walking there (yours are
  // full squads: a join needs room)
  { id: 'host-named-soul', of: 'trailer-elaia', ticks: 600, cap: WORKS_CAP, host: {
    pre: [['setPaths', { you: { path: 'warrior', family: 'line', level: 6 }, pilgrim: { path: 'trader', family: null, level: 8 } }]],
    post: [
      ['spawnNamedSoul', men('named', 'hoplite', 1, 7)[0], 9000],
      ['spawnSquad', 'pilgrim', 0, 'hoplite', 0, 262, 330, men('pil', 'hoplite', 3, 4)],
      (sim) => {
        const s = sim.snapshot(), soul = s.souls!.find((x) => x.name)!;
        const sq = s.squads.find((q) => q.owner === 'pilgrim')!;
        return [['order', { kind: 'claimSoul', squad: sq.id, soul: soul.id }]];
      },
    ],
  } },
  // a trader of level 12: his handcart holds more loads, rolls faster and is tougher
  { id: 'host-carts', of: 'eco-handcart', ticks: 600, cap: WORKS_CAP, host: {
    pre: [['setPaths', { you: { path: 'trader', family: null, level: 12 } }]],
  } },
  // the town folk of Bacchae mend a worn cottage (building 2) at a quarter of the cost (no scenario repairs)
  { id: 'host-repair', of: 'boss-maenad-queen', ticks: 600, cap: WORKS_CAP, host: {
    pre: [['setBonus', 7, { repairCost: 0.25, sight: 1 }]],
    post: [(sim) => {
      const b = sim.snapshot().buildings!.find((x) => x.id === 2)!;
      return [['addStock', 7, 'wood', 3000], ['addStock', 7, 'stone', 3000], ['spawnSquad', 'town', 7, 'militia', 6, b.x + 3, b.y + 3]];
    }, (sim) => [['order', { kind: 'repairBuilding', squad: Math.max(...sim.snapshot().squads.filter((q) => q.owner === 'town').map((q) => q.id)), building: 2 }]]],
  } },
  // a warrior of level 11 (health, blows, armour, the wounded) with men of record against the chief of the Grey Moors
  { id: 'host-chief', of: 'world-fill', ticks: 600, host: {
    pre: [['setPaths', { you: { path: 'warrior', family: 'line', level: 11 } }], ['setBonus', 0, { sight: 2 }]],
    post: [(sim) => {
      const s = sim.snapshot(), lair = s.lairs!.find((l) => l.chief)!;
      return [
        ['spawnSquad', 'you', 0, 'hoplite', 0, lair.x + 6, lair.y + 6, men('vet', 'royal_guard', 6, 12)],
        ['spawnSquad', 'you', 0, 'archer', 0, lair.x + 8, lair.y + 9, men('bow', 'archer', 6, 10)],
      ];
    }, (sim) => {
      const s = sim.snapshot(), lair = s.lairs!.find((l) => l.chief)!, mine = s.squads.filter((q) => q.owner === 'you').slice(-2);
      return mine.map((q) => ['order', { kind: 'attack', squad: q.id, target: lair.squad }] as SetupOp);
    }],
  } },
];

export const vectors = () => ({
  runs: [
    ...RUNS.map((s) => play(s, 600, 25, exact, WORKS.has(s.id) || CIV_SIEGE_TRADE.has(s.id) ? WORKS_CAP : undefined)),
    ...HOST.map((h) => ({ ...play(SCENARIOS.find((s) => s.id === h.of)!, h.ticks, 25, withFog, h.cap, h.host), id: h.id })),
  ],
});
