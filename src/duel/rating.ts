/**
 * Live ranked duels (docs/DUELS.md "Matchmaking and rating"), shared by the
 * client and the Worker (pure TS: no Phaser, DOM, clocks or Math.random).
 *
 * - Glicko-2 rating (rating, RD, volatility), one rating period per match.
 * - Leagues from the rating: Bronze, Silver, Gold, Hoplite, Strategos (three
 *   divisions each, III lowest) and Legend (the exact rating is shown). The
 *   first RANKED.placements matches are placements: no league shows yet.
 * - The matchmaking window: the rating gap the queue accepts, widening with
 *   the wait.
 * - What a match pays (Glory, account XP) and the abandon cooldown.
 *
 * The rating is season independent; monthly seasons (slice 4) will soft-reset
 * it towards the mean and pay by peak league.
 */

export type LeagueId = 'bronze' | 'silver' | 'gold' | 'hoplite' | 'strategos' | 'legend';
export type DuelMode = 'ranked' | 'unranked';

export const RANKED = {
  /** Glicko-2 starting values. */
  start: { rating: 1500, rd: 350, vol: 0.06 },
  /** System constant (how fast volatility moves); Glickman suggests 0.3..1.2. */
  tau: 0.5,
  /** RD never drops below this (a settled player still moves a little). */
  minRd: 40,
  /** Matches before a league shows. */
  placements: 10,
  /** League floors (rating). Each league is `leagueSpan` wide; Bronze takes everything below Silver. */
  leagues: [
    { id: 'bronze', min: 0 },
    { id: 'silver', min: 1200 },
    { id: 'gold', min: 1400 },
    { id: 'hoplite', min: 1600 },
    { id: 'strategos', min: 1800 },
    { id: 'legend', min: 2000 },
  ] as { id: LeagueId; min: number }[],
  leagueSpan: 200,
  /** Divisions per league below Legend (III, II, I). */
  divisions: 3,
  /** Matchmaking window per queue: start, growth per second of wait, cap, and the wait after which anyone will do. */
  window: {
    ranked: { base: 100, perSec: 10, max: 400, openAfterMs: 90_000 },
    unranked: { base: 250, perSec: 25, max: 800, openAfterMs: 30_000 },
  },
  /** Glory per match; unranked pays a half. */
  glory: {
    ranked: { win: 30, draw: 20, loss: 10 },
    unranked: { win: 15, draw: 10, loss: 5 },
  },
  /** Duel account XP per match (both queues). */
  accountXp: { win: 40, draw: 25, loss: 15 },
  /** A dropped player has this long to come back before the match is lost. */
  reconnectMs: 30_000,
  /** Abandons that trigger a queue cooldown, inside this window. */
  abandonLimit: 3,
  abandonWindowMs: 24 * 3_600_000,
  /** First cooldown; each repeat inside abandonWindowMs doubles it, up to cooldownMaxMs. */
  cooldownMs: 15 * 60_000,
  cooldownMaxMs: 4 * 3_600_000,
};

// ------------------------------------------------------------------ Glicko-2

export interface Rating {
  rating: number;
  rd: number;
  vol: number;
}

/** Score of a match for the player: 1 win, 0.5 draw, 0 loss. */
export type Score = 0 | 0.5 | 1;

const SCALE = 173.7178;

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

/**
 * One Glicko-2 rating period with a single game against `opp` (Glickman,
 * "Example of the Glicko-2 system", steps 2-8). Returns the new rating.
 */
export function glicko2(me: Rating, opp: Rating, score: Score): Rating {
  const mu = (me.rating - 1500) / SCALE;
  const phi = me.rd / SCALE;
  const muJ = (opp.rating - 1500) / SCALE;
  const phiJ = opp.rd / SCALE;
  const gJ = g(phiJ);
  const e = 1 / (1 + Math.exp(-gJ * (mu - muJ)));
  const v = 1 / (gJ * gJ * e * (1 - e));
  const delta = v * gJ * (score - e);
  // new volatility (Illinois algorithm)
  const a = Math.log(me.vol * me.vol);
  const tau = RANKED.tau;
  const f = (x: number) => {
    const ex = Math.exp(x);
    return (ex * (delta * delta - phi * phi - v - ex)) / (2 * (phi * phi + v + ex) ** 2) - (x - a) / (tau * tau);
  };
  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
  else {
    let k = 1;
    while (f(a - k * tau) < 0 && k < 100) k++;
    B = a - k * tau;
  }
  let fA = f(A);
  let fB = f(B);
  for (let i = 0; i < 100 && Math.abs(B - A) > 1e-6; i++) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else fA /= 2;
    B = C;
    fB = fC;
  }
  const vol = Math.exp(A / 2);
  const phiStar = Math.sqrt(phi * phi + vol * vol);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNew = mu + phiNew * phiNew * gJ * (score - e);
  return {
    rating: muNew * SCALE + 1500,
    rd: Math.min(RANKED.start.rd, Math.max(RANKED.minRd, phiNew * SCALE)),
    vol,
  };
}

/** Expected score of `me` against `opp` (for display and tests). */
export function expectedScore(me: Rating, opp: Rating): number {
  return 1 / (1 + Math.exp(-g(opp.rd / SCALE) * ((me.rating - opp.rating) / SCALE)));
}

// ------------------------------------------------------------------ leagues

export interface League {
  id: LeagueId;
  /** 3 = III (lowest) .. 1 = I; null for Legend. */
  division: number | null;
}

/** The league and division of a rating. */
export function leagueOf(rating: number): League {
  const ls = RANKED.leagues;
  let i = ls.length - 1;
  while (i > 0 && rating < ls[i].min) i--;
  const l = ls[i];
  if (l.id === 'legend') return { id: 'legend', division: null };
  const top = i + 1 < ls.length ? ls[i + 1].min : l.min + RANKED.leagueSpan;
  const floor = top - RANKED.leagueSpan;
  const step = RANKED.leagueSpan / RANKED.divisions;
  const k = Math.max(0, Math.min(RANKED.divisions - 1, Math.floor((rating - floor) / step)));
  return { id: l.id, division: RANKED.divisions - k };
}

/** Comparable rank of a league (higher is better): for "league up" notes. */
export function leagueRank(l: League): number {
  const i = RANKED.leagues.findIndex((x) => x.id === l.id);
  return i * (RANKED.divisions + 1) + (l.division === null ? RANKED.divisions + 1 : RANKED.divisions + 1 - l.division);
}

/** "III", "II", "I" for a division. */
export function divisionRoman(d: number | null): string {
  return d === null ? '' : ['I', 'II', 'III', 'IV', 'V'][d - 1] ?? String(d);
}

export function placed(games: number): boolean {
  return games >= RANKED.placements;
}

// ------------------------------------------------------------------ matchmaking

/** The rating gap a queue accepts after waiting `waitMs` (Infinity: anyone). */
export function matchWindow(mode: DuelMode, waitMs: number): number {
  const w = RANKED.window[mode];
  if (waitMs >= w.openAfterMs) return Infinity;
  return Math.min(w.max, w.base + (w.perSec * Math.max(0, waitMs)) / 1000);
}

/** Two queued players may meet when the gap fits both their windows. */
export function canPair(mode: DuelMode, a: { rating: number; since: number }, b: { rating: number; since: number }, now: number): boolean {
  const gap = Math.abs(a.rating - b.rating);
  return gap <= Math.min(matchWindow(mode, now - a.since), matchWindow(mode, now - b.since));
}

export interface QueueEntry {
  pid: number;
  mode: DuelMode;
  rating: number;
  since: number;
}

/**
 * Greedy pairing of a queue: the longest waiting player first, each with the
 * closest rating that fits both windows. Players of different queues never meet.
 */
export function pairQueue<T extends QueueEntry>(entries: readonly T[], now: number): [T, T][] {
  const order = [...entries].sort((a, b) => a.since - b.since || a.pid - b.pid);
  const used = new Set<number>();
  const out: [T, T][] = [];
  for (const a of order) {
    if (used.has(a.pid)) continue;
    let best: T | null = null;
    for (const b of order) {
      if (b.pid === a.pid || used.has(b.pid) || b.mode !== a.mode || !canPair(a.mode, a, b, now)) continue;
      if (!best || Math.abs(b.rating - a.rating) < Math.abs(best.rating - a.rating)) best = b;
    }
    if (best) {
      used.add(a.pid);
      used.add(best.pid);
      out.push([a, best]);
    }
  }
  return out;
}

// ------------------------------------------------------------------ rewards and abandons

export function scoreOf(winner: number, side: number): Score {
  return winner === -1 ? 0.5 : winner === side ? 1 : 0;
}

/** Glory and account XP of a finished match for one player. */
export function matchPay(mode: DuelMode, score: Score): { glory: number; accountXp: number } {
  const k = score === 1 ? 'win' : score === 0.5 ? 'draw' : 'loss';
  return { glory: RANKED.glory[mode][k], accountXp: RANKED.accountXp[k] };
}

export interface AbandonState {
  /** Times of recent abandons (inside the window). */
  abandons: number[];
  cooldownUntil: number;
  /** Cooldowns given; a repeat inside the window doubles the next. */
  strikes: number;
  strikeAt: number;
}

/** A player abandoned a match at `now`: the new abandon state (maybe with a queue cooldown). */
export function recordAbandon(s: AbandonState, now: number): AbandonState {
  const abandons = [...s.abandons.filter((t) => now - t < RANKED.abandonWindowMs), now];
  if (abandons.length < RANKED.abandonLimit) return { ...s, abandons };
  const strikes = now - s.strikeAt < RANKED.abandonWindowMs ? s.strikes + 1 : 1;
  const ms = Math.min(RANKED.cooldownMaxMs, RANKED.cooldownMs * 2 ** (strikes - 1));
  return { abandons: [], cooldownUntil: now + ms, strikes, strikeAt: now };
}
