/**
 * The sim core (src/war/sim/index.ts) on the move-* scenarios, the squad fights and the economy and building ones, longer
 * than the P1 traces and unrounded: every unit's position, hp and facing, every building's progress and the stock every
 * 25 ticks over 600, so the C++ Sim is checked bit for bit through the settling, stuck and re-path rules, the whole of a
 * fight (blows, shots, falls) and the works (sites, walls, bridges, gathering, stores, hunger) that 50 ticks never reach
 * (godot/tests/sim/test_traces.gd). The event log (WarEvent, drained at each checkpoint) is compared too.
 */
import { SCENARIOS } from '../../war/scenarios';
import type { Snapshot, WarBuildSim, WarEvent } from '../../war/types';
import { play } from '../godotTraces';

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

export const vectors = () => ({
  runs: RUNS.map((s) =>
    play(s, 600, 25, exact, WORKS.has(s.id) || CIV_SIEGE_TRADE.has(s.id) ? WORKS_CAP : undefined),
  ),
});
