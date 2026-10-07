import { describe, expect, it } from 'vitest';
import {
  RANKED, canPair, divisionRoman, expectedScore, glicko2, leagueOf, leagueRank, matchPay, matchWindow, pairQueue, placed, recordAbandon, scoreOf,
  type AbandonState, type Rating,
} from '../src/duel/rating';

const fresh = (): Rating => ({ ...RANKED.start });

describe('Glicko-2', () => {
  it('starts at 1500 / 350 / 0.06 and moves a new player a lot', () => {
    expect(RANKED.start).toEqual({ rating: 1500, rd: 350, vol: 0.06 });
    const won = glicko2(fresh(), fresh(), 1);
    const lost = glicko2(fresh(), fresh(), 0);
    expect(won.rating).toBeGreaterThan(1650);
    expect(won.rating).toBeLessThan(1700);
    // symmetric around 1500 between equal players
    expect(won.rating - 1500).toBeCloseTo(1500 - lost.rating, 6);
    expect(won.rd).toBeLessThan(350);
    expect(glicko2(fresh(), fresh(), 0.5).rating).toBeCloseTo(1500, 6);
  });

  it('matches the paper’s single-game step (1500/200 vs 1400/30, a win)', () => {
    // Glickman's example opponent 1: E = 0.639, g = 0.9955; a win from 1500/200/0.06.
    const r = glicko2({ rating: 1500, rd: 200, vol: 0.06 }, { rating: 1400, rd: 30, vol: 0.06 }, 1);
    expect(r.rating).toBeGreaterThan(1550);
    expect(r.rating).toBeLessThan(1580);
    expect(r.vol).toBeCloseTo(0.06, 3);
    expect(expectedScore({ rating: 1500, rd: 200, vol: 0.06 }, { rating: 1400, rd: 30, vol: 0.06 })).toBeCloseTo(0.639, 2);
  });

  it('settles: many games shrink RD to the floor and an upset moves more than an expected win', () => {
    let a = fresh();
    for (let i = 0; i < 60; i++) a = glicko2(a, { rating: a.rating, rd: 60, vol: 0.06 }, (i % 2) as 0 | 1);
    expect(a.rd).toBeLessThan(80);
    expect(a.rd).toBeGreaterThanOrEqual(RANKED.minRd);
    const strong = { rating: 1800, rd: 60, vol: 0.06 };
    const weak = { rating: 1400, rd: 60, vol: 0.06 };
    const upset = glicko2(weak, strong, 1).rating - weak.rating;
    const expected = glicko2(strong, weak, 1).rating - strong.rating;
    expect(upset).toBeGreaterThan(expected * 3);
  });
});

describe('leagues', () => {
  it('maps ratings to leagues and divisions (III lowest), Legend has none', () => {
    expect(leagueOf(800)).toEqual({ id: 'bronze', division: 3 });
    expect(leagueOf(1199)).toEqual({ id: 'bronze', division: 1 });
    expect(leagueOf(1200)).toEqual({ id: 'silver', division: 3 });
    expect(leagueOf(1300)).toEqual({ id: 'silver', division: 2 });
    expect(leagueOf(1499)).toEqual({ id: 'gold', division: 2 });
    expect(leagueOf(1599)).toEqual({ id: 'gold', division: 1 });
    expect(leagueOf(1700)).toEqual({ id: 'hoplite', division: 2 });
    expect(leagueOf(1999)).toEqual({ id: 'strategos', division: 1 });
    expect(leagueOf(2000)).toEqual({ id: 'legend', division: null });
    expect(leagueOf(2600)).toEqual({ id: 'legend', division: null });
    expect(divisionRoman(3)).toBe('III');
    expect(divisionRoman(null)).toBe('');
  });

  it('ranks leagues in order and needs 10 placement matches', () => {
    const ranks = [900, 1150, 1250, 1450, 1550, 1650, 1850, 2100].map((r) => leagueRank(leagueOf(r)));
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    expect(new Set(ranks).size).toBe(ranks.length);
    expect(placed(9)).toBe(false);
    expect(placed(RANKED.placements)).toBe(true);
  });
});

describe('matchmaking window', () => {
  it('widens with the wait and opens fully after a while', () => {
    expect(matchWindow('ranked', 0)).toBe(100);
    expect(matchWindow('ranked', 10_000)).toBe(200);
    expect(matchWindow('ranked', 80_000)).toBe(400);
    expect(matchWindow('ranked', 90_000)).toBe(Infinity);
    expect(matchWindow('unranked', 0)).toBeGreaterThan(matchWindow('ranked', 0));
  });

  it('pairs only within both windows, closest first, never across queues', () => {
    const now = 100_000;
    const a = { pid: 1, mode: 'ranked' as const, rating: 1500, since: now };
    const b = { pid: 2, mode: 'ranked' as const, rating: 1750, since: now };
    expect(canPair('ranked', a, b, now)).toBe(false);
    expect(pairQueue([a, b], now)).toEqual([]);
    // 15 s later both windows are 250 wide
    expect(pairQueue([a, b], now + 15_000).map(([x, y]) => [x.pid, y.pid])).toEqual([[1, 2]]);
    const c = { pid: 3, mode: 'ranked' as const, rating: 1520, since: now + 1 };
    const d = { pid: 4, mode: 'unranked' as const, rating: 1500, since: now - 5000 };
    const pairs = pairQueue([a, b, c, d], now + 2);
    expect(pairs.map(([x, y]) => [x.pid, y.pid])).toEqual([[1, 3]]);
  });
});

describe('rewards and abandons', () => {
  it('pays Glory and XP by result; unranked pays half the Glory', () => {
    expect(scoreOf(0, 0)).toBe(1);
    expect(scoreOf(1, 0)).toBe(0);
    expect(scoreOf(-1, 1)).toBe(0.5);
    expect(matchPay('ranked', 1)).toEqual({ glory: 30, accountXp: 40 });
    expect(matchPay('unranked', 1).glory).toBe(15);
    expect(matchPay('ranked', 0)).toEqual({ glory: 10, accountXp: 15 });
  });

  it('3 abandons in 24 h give a 15-minute cooldown that doubles on repeats', () => {
    let s: AbandonState = { abandons: [], cooldownUntil: 0, strikes: 0, strikeAt: 0 };
    const t0 = 1_000_000_000;
    s = recordAbandon(s, t0);
    s = recordAbandon(s, t0 + 1000);
    expect(s.cooldownUntil).toBe(0);
    s = recordAbandon(s, t0 + 2000);
    expect(s.cooldownUntil).toBe(t0 + 2000 + 15 * 60_000);
    expect(s.abandons).toEqual([]);
    for (let i = 0; i < 3; i++) s = recordAbandon(s, t0 + 3_600_000 + i);
    expect(s.cooldownUntil).toBe(t0 + 3_600_002 + 30 * 60_000);
    // old abandons fall out of the window
    let q: AbandonState = { abandons: [t0, t0 + 1], cooldownUntil: 0, strikes: 0, strikeAt: 0 };
    q = recordAbandon(q, t0 + RANKED.abandonWindowMs + 10);
    expect(q.abandons).toHaveLength(1);
    expect(q.cooldownUntil).toBe(0);
  });
});
