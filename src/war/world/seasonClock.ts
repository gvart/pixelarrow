/**
 * The season clock of the offline game (P7; docs/WAR.md "Season score and victory"): the season parts of the server's
 * WarWorld (server/src/war/world/world.ts advance, checkHegemony and report's owner rule), line for line, without the
 * Durable Object, transfers, hauls, world events, landmarks and prestige (the room layer, P8/P11). A region room's report
 * sets its owner (strictly the most claim points; on a tie the owner stays; a home is always its alliance's), the score
 * accrues at each region's hourly rate (./season.ts) and the season ends at its time, or when hegemony held
 * HEGEMONY.ms.
 */
import { ALLIANCES } from './alliances';
import { worldRegion } from './graph';
import { WORLD_REGIONS } from './regions';
import { allianceRates, hegemon, HEGEMONY, HOUR_MS, type ScoredRegion } from './season';
import type { AllianceId } from './types';

const N = ALLIANCES.length;
const zeros = () => Array<number>(N).fill(0);

export interface ClockRegion extends ScoredRegion { claims: number[] }
export interface SeasonEnd { at: number; reason: 'time' | 'hegemony'; winner: AllianceId | null; scores: number[] }
export interface SeasonClockState {
  startAt: number; endAt: number; scores: number[]; accruedAt: number;
  hegemony: { alliance: AllianceId; since: number } | null; ended: SeasonEnd | null;
  regions: ClockRegion[];
}
/** What a region room reports (WarRoom.summary): claim points held and living fighting men, per alliance. */
export interface ClockReport { claims: number[]; live: number[] }

export interface SeasonClock {
  readonly state: SeasonClockState;
  endsAt(): number;
  /** Score up to `now`; the end when it ended on this call. */
  advance(now: number): SeasonEnd | null;
  report(id: string, rep: ClockReport, now: number): void;
}

export function createSeasonClock(startAt: number, lengthMs: number): SeasonClock {
  const regions: ClockRegion[] = WORLD_REGIONS.map((r) => ({ id: r.id, owner: r.role === 'home' ? r.alliance! : -1, claims: zeros(), live: zeros() }));
  const s: SeasonClockState = { startAt, endAt: startAt + lengthMs, scores: zeros(), accruedAt: startAt, hegemony: null, ended: null, regions };
  const endsAt = () => (s.hegemony ? Math.min(s.endAt, s.hegemony.since + HEGEMONY.ms) : s.endAt);
  const advance = (now: number): SeasonEnd | null => {
    if (s.ended) return null;
    const end = endsAt(), to = Math.min(now, end);
    if (to > s.accruedAt) {
      const rates = allianceRates(s.regions), h = (to - s.accruedAt) / HOUR_MS;
      s.scores = s.scores.map((x, i) => x + rates[i] * h);
      s.accruedAt = to;
    }
    if (now < end) return null;
    const hegemony = s.hegemony && s.hegemony.since + HEGEMONY.ms <= s.endAt ? s.hegemony.alliance : null;
    const best = Math.max(...s.scores), top = s.scores.flatMap((x, i) => (x === best ? [i as AllianceId] : []));
    s.ended = { at: end, reason: hegemony !== null ? 'hegemony' : 'time', winner: hegemony ?? (top.length === 1 ? top[0] : null), scores: s.scores.map(Math.floor) };
    return s.ended;
  };
  const checkHegemony = (now: number) => {
    if (s.ended) return;
    const h = hegemon(s.regions);
    if (h === null) s.hegemony = null;
    else if (s.hegemony?.alliance !== h) s.hegemony = { alliance: h, since: now };
  };
  return {
    state: s,
    endsAt,
    advance,
    report(id, rep, now) {
      const w = worldRegion(id), i = s.regions.findIndex((r) => r.id === id);
      if (!w || i < 0) return;
      const cur = s.regions[i];
      advance(now);
      const claims = Array.from({ length: N }, (_, k) => rep.claims[k] ?? 0), live = Array.from({ length: N }, (_, k) => rep.live[k] ?? 0);
      const best = Math.max(...claims), leaders = claims.flatMap((n, k) => (n === best && n > 0 ? [k] : []));
      const leader = leaders.length === 1 ? leaders[0] : null;
      let owner = cur.owner;
      if (w.role === 'home') owner = w.alliance!;
      else if (leader !== null) owner = leader;
      s.regions[i] = { id, owner, claims, live };
      // hegemony reads the owners only: WarWorld's check on any change comes to the same
      if (owner !== cur.owner) checkHegemony(now);
    },
  };
}
