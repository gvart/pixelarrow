/**
 * The rival warlords (src/war/sim/warlords.ts) wired to the real sim and its bots, as the sandbox runs them
 * (src/war/view/worker.ts: each tick the sim, its bots, then the warlords on that tick's snapshot; the room does the
 * same, server/src/war/room.ts tick). The warlord scenarios played exactly (../godotTraces.ts play with `lords`):
 * every 25 ticks the unrounded digest and event log, the warlords' notes since the last frame, their snaps and men.
 * The Godot side (godot/tests/sim/test_warlords.gd) replays the setup, starts the C++ warlords on the C++ Sim and
 * steps both.
 */
import { SCENARIOS } from '../../war/scenarios';
import { play, type HostOps } from '../godotTraces';
import { exact } from './sim';

const WORKS_CAP = 1500;

/** The runs: a scenario, ticks, and host calls round it (../godotTraces.ts HostOps). */
const RUNS: { id: string; of: string; ticks: number; host?: HostOps }[] = [
  // his hall laid at once on Kleisoura's claim point (one player); your hoplites and archers stand near it
  { id: 'lords-hall', of: 'warlord-hall', ticks: 1500 },
  // your men go for the hall: his garrison fights, the lord may fall (his loot), his places are freed
  { id: 'lords-hall-fight', of: 'warlord-hall', ticks: 2500, host: {
    post: [
      ['spawnSquad', 'you', 0, 'hoplite', 12, 296, 214], ['spawnSquad', 'you', 0, 'royal_guard', 12, 298, 222],
      (sim) => sim.snapshot().squads.filter((q) => q.owner === 'you').map((q) => ['order', { kind: 'attackMove', squad: q.id, x: 300, y: 219 }]),
    ],
  } },
  // a raid on your camp in the Teeth Foothills: warned, marched, battered, home
  { id: 'lords-raid', of: 'warlord-raid', ticks: 3000 },
];

export const vectors = () => ({
  runs: RUNS.map((r) => ({ ...play(SCENARIOS.find((s) => s.id === r.of)!, r.ticks, 25, exact, WORKS_CAP, r.host, true), id: r.id })),
});
