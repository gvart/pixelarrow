/**
 * The sim core (src/war/sim/index.ts) on the move-* scenarios, longer than the P1 traces and unrounded: every unit's
 * position, hp and facing every 25 ticks over 600, so the C++ Sim is checked bit for bit through the settling, stuck
 * and re-path rules that 50 ticks never reach (godot/tests/sim/test_traces.gd).
 */
import { SCENARIOS } from '../../war/scenarios';
import type { Snapshot } from '../../war/types';
import { play } from '../godotTraces';

const exact = (s: Snapshot) => ({
  tick: s.tick,
  units: s.units.map((u) => [u.id, u.squad, u.x, u.y, u.hp, u.state, u.facing]),
  squads: s.squads.map((q) => [q.id, q.team, q.owner]),
});

export const vectors = () => ({ runs: SCENARIOS.filter((s) => s.id.startsWith('move-')).map((s) => play(s, 600, 25, exact)) });
