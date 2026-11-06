/**
 * The sim core (src/war/sim/index.ts) on the move-* scenarios and the squad fights, longer than the P1 traces and
 * unrounded: every unit's position, hp and facing every 25 ticks over 600, so the C++ Sim is checked bit for bit through
 * the settling, stuck and re-path rules and the whole of a fight (blows, shots, falls) that 50 ticks never reach
 * (godot/tests/sim/test_traces.gd).
 */
import { SCENARIOS } from '../../war/scenarios';
import type { Snapshot } from '../../war/types';
import { play } from '../godotTraces';

const exact = (s: Snapshot) => ({
  tick: s.tick,
  units: s.units.map((u) => [u.id, u.squad, u.x, u.y, u.hp, u.state, u.facing]),
  squads: s.squads.map((q) => [q.id, q.team, q.owner]),
});

/** The squad fights: no buildings, works, siege, trade, lairs or civilians. */
const FIGHTS = new Set([
  'pass-ambush', 'ford-crossing', 'hill-assault', 'bridge-vs-ford', 'brawl-600', 'combat-lines', 'combat-high-ground', 'combat-skirmish',
  'combat-flank', 'clip-battle', 'fog-high-ground', 'peace-titles',
]);

export const vectors = () => ({
  runs: SCENARIOS.filter((s) => s.id.startsWith('move-') || s.id.startsWith('mob-') || FIGHTS.has(s.id)).map((s) => play(s, 600, 25, exact)),
});
