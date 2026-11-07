/**
 * P7 headless AI-vs-AI season (docs/impl/godot-port.md P7): one region room with every alliance on AI, its rival
 * warlords and its wild, played to the end of a season. The host loop is the room's (server/src/war/room.ts tick): the
 * sim steps, its bots, then the warlords (pressure: the AI commanders with men here) and each alliance's AI on that
 * tick's snapshot; every AI_SEASON.report ticks the room's summary (claim points held, living fighting men) goes to the
 * season clock (../world/seasonClock.ts), which ends the season at its time. A tick is ALLY_AI.tickMs of season time.
 * The world beyond this region stays as the season found it (homes their alliance's, the rest nobody's): transfers,
 * the other rooms and the world events are the room layer's (P8, P11).
 */
import { createSim } from '.';
import { createBots, type Bots } from './bots';
import { createWarlords, type WarlordNote, type Warlords } from './warlords';
import { ALLY_AI, createAllianceAi, type AllianceAi } from './allianceAi';
import { createSeasonClock, type ClockReport, type SeasonClock } from '../world/seasonClock';
import { ALLIANCES } from '../world/alliances';
import type { RegionData, Snapshot, WarBuildSim } from '../types';

export const AI_SEASON = { report: 100 } as const;

export interface AiSeasonOpts {
  /** Season length (ms of season time). */
  lengthMs: number;
  /** The warlords' age (days) at the start. */
  age?: number;
  /** Claim points held at the start, by point (-1: nobody), as a room recalls them (sim.recall with its own memory). */
  held?: number[];
}

export interface AiSeason {
  readonly sim: WarBuildSim;
  readonly bots: Bots;
  readonly lords: Warlords | null;
  readonly ais: AllianceAi[];
  readonly clock: SeasonClock;
  /** One host tick; true once the season has ended. */
  step(): boolean;
  /** The warlords' notes since the last call. */
  notes(): WarlordNote[];
}

/** The room's summary of a snapshot (room.ts summary: claim points held; this.live: living fighting men per alliance). */
export function summary(snap: Snapshot): ClockReport {
  const claims = ALLIANCES.map(() => 0), live = ALLIANCES.map(() => 0);
  for (const c of snap.claims ?? []) if (c.state === 'claimed' && c.team >= 0 && c.team < claims.length) claims[c.team]++;
  for (const u of snap.units) {
    const t = snap.squads[u.squad]?.team ?? -1;
    if (u.state !== 'dead' && !u.cls.startsWith('civ_') && t >= 0 && t < live.length) live[t]++;
  }
  return { claims, live };
}

export function createAiSeason(region: RegionData, seed: number, o: AiSeasonOpts): AiSeason {
  const sim = createSim(region, seed) as WarBuildSim, bots = createBots(sim);
  sim.spawnMobs();
  if (o.held) sim.recall({ ...sim.memory(), claims: o.held }, 0);
  const lords = createWarlords(region, sim, bots, seed);
  lords?.setAge(o.age ?? 0);
  const ais = ALLIANCES.map((a) => createAllianceAi(sim, bots, a.id));
  const clock = createSeasonClock(0, o.lengthMs);
  const out: WarlordNote[] = [];
  return {
    sim, bots, lords, ais, clock,
    step() {
      if (clock.state.ended) return true;
      sim.step();
      bots.tick();
      const snap = sim.snapshot(), now = snap.tick * ALLY_AI.tickMs;
      if (lords) {
        lords.setPlayers(ais.reduce((a, ai) => a + ai.present(), 0));
        out.push(...lords.tick(snap));
      }
      for (const ai of ais) ai.tick(snap);
      if (snap.tick % AI_SEASON.report === 0) clock.report(region.id, summary(snap), now);
      return clock.advance(now) !== null || !!clock.state.ended;
    },
    notes: () => out.splice(0),
  };
}
