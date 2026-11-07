/**
 * The headless AI-vs-AI season (src/war/sim/aiSeason.ts: the alliance AI, the warlords and the season clock round one
 * region room) for the Godot port, played to its end: every EVERY ticks the unrounded digest and event log
 * (./sim.ts exact), the claim points, the engines, each alliance AI's stats and men, the warlords' notes since the last
 * frame and the clock (scores, owners, the end). godot/tests/sim/test_ai.gd plays the same season on the C++ WarHost.
 */
import { parseRegion } from '../../war/region/schema';
import { createAiSeason, type AiSeasonOpts } from '../../war/sim/aiSeason';
import { ALLY_AI } from '../../war/sim/allianceAi';
import { exact } from './sim';

const files = import.meta.glob('../../war/regions/*.json', { eager: true, import: 'default' });
const EVERY = 100;

const RUNS: { id: string; region: string; seed: number; ticks: number; opts: Omit<AiSeasonOpts, 'lengthMs'> }[] = [
  // every alliance free at Achelous (a frontier town; Skiron's march): claims, camps, storehouses, the tunnel
  { id: 'season-achelous', region: 'achelous', seed: 1, ticks: 6000, opts: { age: 4 } },
  // the Saddle's walled point held by Elaia from the start: rams built, crewed and battering, assaults
  { id: 'season-saddle', region: 'saddle', seed: 1, ticks: 4000, opts: { held: [-1, 3] } },
];

function run(r: (typeof RUNS)[number]) {
  const s = createAiSeason(parseRegion(files[`../../war/regions/${r.region}.json`]), r.seed, { lengthMs: r.ticks * ALLY_AI.tickMs, ...r.opts });
  const frame = () => {
    const snap = s.sim.snapshot(), c = s.clock.state;
    return {
      ...exact(snap, s.sim),
      claims: (snap.claims ?? []).map((x) => [x.id, x.team, x.state, x.squad, x.progress, x.taking ?? null]),
      sieges: (snap.sieges ?? []).map((e) => [e.id, e.type, e.team, e.x, e.y, e.state, e.hp]),
      ai: s.ais.map((a) => ({ ...a.stats(), men: a.men(), present: a.present() })),
      lords: { notes: s.notes(), men: s.lords?.men() ?? 0 },
      clock: { scores: c.scores, accruedAt: c.accruedAt, hegemony: c.hegemony, ended: c.ended, owners: c.regions.map((x) => x.owner), claims: c.regions.find((x) => x.id === r.region)!.claims },
    };
  };
  const frames = [frame()];
  let ended = false;
  while (!ended) {
    ended = s.step();
    const t = s.sim.snapshot().tick;
    if (t % EVERY === 0 || ended) frames.push(frame());
  }
  return { ...r, frames };
}

export const vectors = () => ({ every: EVERY, runs: RUNS.map(run) });
