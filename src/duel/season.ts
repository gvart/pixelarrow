/**
 * Monthly ranked seasons and the async defence ladder (docs/DUELS.md "Ranked
 * async" and "Matchmaking and rating"), shared by the client and the Worker
 * (pure TS: no Phaser, DOM, clocks or Math.random; times come in as numbers).
 *
 * - Seasons are UTC calendar months. When one ends, every rating (live and
 *   async) moves part way to the mean and its RD grows (`softReset`); the
 *   season pays by the peak league reached in it (`seasonReward`): Glory, a
 *   league cosmetic (account-wide, not for sale) and a profile title.
 * - Glicko-2 rating periods of a day: a player who has not played for a while
 *   gets a wider RD (`idleRating`), so a comeback moves the rating faster.
 * - The async ladder: a server bot plays each player's saved defence team.
 *   The attacker picks one of a few candidates near their async rating
 *   (`pickCandidates`); 10 rated attacks a UTC day, never the same defender
 *   twice within 24 h. Defenders move at half rate (`defenceRating`).
 */
import { SEASON_SET } from '../game/sources';
import { Rng } from '../sim/rng';
import type { BattleSetup } from '../sim/types';
import type { FormationType } from '../sim/formation';
import type { Hero } from '../data/units';
import { onlineBattleSetup } from '../online/battle';
import { randomSite } from '../world/battlefield';
import { RANKED, glicko2, leagueOf, type LeagueId, type Rating, type Score } from './rating';

export type Ladder = 'live' | 'async';

export const SEASON = {
  /** Ratings move towards this at a reset. */
  mean: 1500,
  /** Share of the distance to the mean a rating keeps at each season reset. */
  keep: 0.5,
  /** RD after a reset is at least this (the new season settles everyone again). */
  resetRd: 150,
  /** One Glicko-2 rating period without games (RD growth with inactivity). */
  periodMs: 24 * 3_600_000,
  /** What a season pays by peak league (live; async pays `asyncShare` of the Glory). The cosmetic and the title are the league's. */
  rewards: {
    bronze: { glory: 50, cosmetic: 'duel_emblem_bronze' },
    silver: { glory: 100, cosmetic: 'duel_emblem_silver' },
    gold: { glory: 180, cosmetic: 'duel_emblem_gold' },
    hoplite: { glory: 280, cosmetic: 'duel_banner_hoplite' },
    strategos: { glory: 400, cosmetic: 'duel_banner_strategos' },
    legend: { glory: 600, cosmetic: 'duel_banner_legend' },
  } as Record<LeagueId, { glory: number; cosmetic: string }>,
  asyncShare: 0.5,
};

export const ASYNC = {
  /** Rated attacks a player may start per UTC day. */
  attacksPerDay: 10,
  /** The same defender cannot be attacked again within this time. */
  repeatMs: 24 * 3_600_000,
  /** Candidates offered to choose from. */
  candidates: 3,
  /** Nearest defenders (by rating) the candidates are drawn from. */
  pool: 12,
  /** Attacker pay per verified battle (less than live: the defence is a bot). */
  glory: { win: 20, draw: 12, loss: 6 },
  accountXp: { win: 30, draw: 20, loss: 10 },
  /** Defender pay for a held defence (a draw pays `draw`), at most `gloryPerDay` a UTC day. */
  defence: { glory: { win: 5, draw: 2 }, gloryPerDay: 50 },
  /** Defenders' rating changes are scaled: being offline is never punishing. */
  defenceGainScale: 0.5,
  defenceLossScale: 0.5,
  /** An attack ticket must be submitted within this time. */
  ticketTtlMs: 10 * 60_000,
};

// ------------------------------------------------------------------ calendar

const MONTH0 = 1970;

/** The season (a UTC calendar month) of a time: months since January 1970. */
export function seasonId(ms: number): number {
  const d = new Date(ms);
  return (d.getUTCFullYear() - MONTH0) * 12 + d.getUTCMonth();
}

export function seasonStart(id: number): number {
  return Date.UTC(MONTH0 + Math.floor(id / 12), id % 12, 1);
}

/** The first moment of the next season. */
export function seasonEnd(id: number): number {
  return seasonStart(id + 1);
}

/** Year and month (0..11) of a season. */
export function seasonMonth(id: number): { year: number; month: number } {
  return { year: MONTH0 + Math.floor(id / 12), month: id % 12 };
}

// ------------------------------------------------------------------ resets and inactivity

/** A rating after `seasons` season resets: part way to the mean each time, RD at least SEASON.resetRd. */
export function softReset(r: Rating, seasons = 1): Rating {
  if (seasons <= 0) return { ...r };
  const k = SEASON.keep ** seasons;
  return { rating: SEASON.mean + (r.rating - SEASON.mean) * k, rd: Math.min(RANKED.start.rd, Math.max(r.rd, SEASON.resetRd)), vol: r.vol };
}

/** The rating as of `now` after the rating periods (days) without games since `playedAt`: RD grows by the volatility per period. */
export function idleRating(r: Rating, playedAt: number, now: number): Rating {
  const periods = Math.floor(Math.max(0, now - playedAt) / SEASON.periodMs);
  if (periods <= 0) return { ...r };
  const SCALE = 173.7178;
  const phi = r.rd / SCALE;
  const rd = Math.sqrt(phi * phi + periods * r.vol * r.vol) * SCALE;
  return { ...r, rd: Math.min(RANKED.start.rd, rd) };
}

export interface SeasonReward {
  league: LeagueId;
  glory: number;
  cosmetic: string;
  /** A set the player picks one piece of (live Strategos and Legend: the Sacred Band), or null. */
  pick: string | null;
}

/** Leagues whose live season reward includes a piece of SEASON_SET of the player's choice. */
export const PICK_LEAGUES: LeagueId[] = ['strategos', 'legend'];

/** What a season pays on a ladder by its peak rating (null: never placed in it, nothing to pay). */
export function seasonReward(peak: number | null, ladder: Ladder): SeasonReward | null {
  if (peak === null || !Number.isFinite(peak)) return null;
  const league = leagueOf(peak).id;
  const r = SEASON.rewards[league];
  const pick = ladder === 'live' && PICK_LEAGUES.includes(league) ? SEASON_SET : null;
  return { league, glory: ladder === 'async' ? Math.round(r.glory * SEASON.asyncShare) : r.glory, cosmetic: r.cosmetic, pick };
}

/** The better of two leagues (titles take the best peak of the season). */
export function bestLeague(a: LeagueId | null, b: LeagueId | null): LeagueId | null {
  const i = (l: LeagueId | null) => (l ? RANKED.leagues.findIndex((x) => x.id === l) : -1);
  return i(a) >= i(b) ? a : b;
}

// ------------------------------------------------------------------ async ladder

export interface Defender {
  pid: number;
  rating: number;
}

/**
 * The candidates an attacker may choose from: among the `ASYNC.pool` defenders
 * nearest to their rating, one a little below, the closest and one a little
 * above where the pool allows (filled with the next closest otherwise). The
 * `seed` (player, day, attacks so far) keeps the offer fixed until the next
 * attack, so there is no fishing for a weak target. `pool` must not hold the
 * attacker or defenders they may not attack now.
 */
export function pickCandidates<T extends Defender>(rating: number, pool: readonly T[], seed: number, n = ASYNC.candidates): T[] {
  const near = [...pool].sort((a, b) => Math.abs(a.rating - rating) - Math.abs(b.rating - rating) || a.pid - b.pid).slice(0, ASYNC.pool);
  if (near.length <= n) return near.sort((a, b) => b.rating - a.rating || a.pid - b.pid);
  const rng = new Rng(seed >>> 0 || 1);
  const below = near.filter((d) => d.rating < rating);
  const above = near.filter((d) => d.rating >= rating);
  const out: T[] = [];
  const take = (list: T[]) => {
    const left = list.filter((d) => !out.includes(d));
    if (left.length) out.push(left[rng.int(0, Math.min(left.length, 4) - 1)]);
  };
  take(below);
  take([...near]);
  take(above);
  for (const d of near) if (out.length < n && !out.includes(d)) out.push(d);
  return out.slice(0, n).sort((a, b) => b.rating - a.rating || a.pid - b.pid);
}

/** The defender's new rating after an attack (score from the defender's side): Glicko-2, the change scaled by ASYNC.defence*Scale. */
export function defenceRating(me: Rating, attacker: Rating, score: Score): Rating {
  const next = glicko2(me, attacker, score);
  const d = next.rating - me.rating;
  return { ...next, rating: me.rating + d * (d >= 0 ? ASYNC.defenceGainScale : ASYNC.defenceLossScale) };
}

/** Attacker pay for a verified async battle. */
export function attackPay(score: Score): { glory: number; accountXp: number } {
  const k = score === 1 ? 'win' : score === 0.5 ? 'draw' : 'loss';
  return { glory: ASYNC.glory[k], accountXp: ASYNC.accountXp[k] };
}

/** Defender Glory for an attack (score from the defender's side), within what is left of today's cap. */
export function defencePay(score: Score, earnedToday: number): number {
  const g = score === 1 ? ASYNC.defence.glory.win : score === 0.5 ? ASYNC.defence.glory.draw : 0;
  return Math.max(0, Math.min(g, ASYNC.defence.gloryPerDay - earnedToday));
}

/** The battle of an async attack: the attacker (side 0) against the defence team played by the bot (side 1), on a field from the seed. */
export function asyncSetup(seed: number, team: Hero[], formations: FormationType[], defence: Hero[], defenceFormations: FormationType[]): BattleSetup {
  return onlineBattleSetup(seed, { heroes: team, formations, bot: false }, { heroes: defence, formations: defenceFormations, bot: true }, randomSite(new Rng((seed ^ 0x5a17c0de) >>> 0 || 1)));
}
