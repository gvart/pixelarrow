import { describe, expect, it } from 'vitest';
import { RANKED, glicko2, type Rating } from '../src/duel/rating';
import {
  ASYNC, SEASON, attackPay, bestLeague, defencePay, defenceRating, idleRating, pickCandidates, seasonEnd, seasonId, seasonMonth, seasonReward, seasonStart, softReset,
} from '../src/duel/season';
import { DemoDuelSource } from '../src/duel/client';

const r = (rating: number, rd = 60): Rating => ({ rating, rd, vol: 0.06 });

describe('season calendar', () => {
  it('numbers UTC calendar months and knows their bounds', () => {
    const oct = Date.UTC(2026, 9, 7, 12);
    const id = seasonId(oct);
    expect(seasonMonth(id)).toEqual({ year: 2026, month: 9 });
    expect(seasonStart(id)).toBe(Date.UTC(2026, 9, 1));
    expect(seasonEnd(id)).toBe(Date.UTC(2026, 10, 1));
    // the last millisecond of a month is still that season; midnight UTC starts the next
    expect(seasonId(Date.UTC(2026, 10, 1) - 1)).toBe(id);
    expect(seasonId(Date.UTC(2026, 10, 1))).toBe(id + 1);
    // across a year
    expect(seasonMonth(seasonId(Date.UTC(2027, 0, 1)))).toEqual({ year: 2027, month: 0 });
    expect(seasonEnd(seasonId(Date.UTC(2026, 11, 31)))).toBe(Date.UTC(2027, 0, 1));
  });
});

describe('soft reset and inactivity', () => {
  it('moves a rating half way to the mean per season and widens the RD', () => {
    expect(softReset(r(1900)).rating).toBe(1700);
    expect(softReset(r(1100)).rating).toBe(1300);
    expect(softReset(r(1900)).rd).toBe(SEASON.resetRd);
    expect(softReset(r(1900, 300)).rd).toBe(300);
    expect(softReset(r(2100), 3).rating).toBeCloseTo(1500 + 600 / 8, 9);
    expect(softReset(r(1500)).rating).toBe(1500);
    expect(softReset(r(1800), 0)).toEqual(r(1800));
  });

  it('grows the RD by the volatility per idle day, up to the start RD', () => {
    const day = SEASON.periodMs;
    expect(idleRating(r(1600, 50), 0, day - 1)).toEqual(r(1600, 50));
    const month = idleRating(r(1600, 50), 0, 30 * day);
    expect(month.rating).toBe(1600);
    expect(month.rd).toBeGreaterThan(70);
    expect(month.rd).toBeLessThan(90);
    expect(idleRating(r(1600, 50), 0, 10_000 * day).rd).toBe(RANKED.start.rd);
  });
});

describe('season rewards', () => {
  it('pays by the peak league: Glory (async half), the league cosmetic; nothing without a peak', () => {
    expect(seasonReward(null, 'live')).toBeNull();
    expect(seasonReward(1150, 'live')).toEqual({ league: 'bronze', glory: SEASON.rewards.bronze.glory, cosmetic: 'duel_emblem_bronze' });
    expect(seasonReward(1450, 'live')).toEqual({ league: 'gold', glory: 180, cosmetic: 'duel_emblem_gold' });
    expect(seasonReward(1450, 'async')).toEqual({ league: 'gold', glory: 90, cosmetic: 'duel_emblem_gold' });
    expect(seasonReward(2300, 'live')).toEqual({ league: 'legend', glory: 600, cosmetic: 'duel_banner_legend' });
    // every league pays more than the one below, and every reward is a whole number on both ladders
    const g = RANKED.leagues.map((l) => SEASON.rewards[l.id].glory);
    expect([...g].sort((a, b) => a - b)).toEqual(g);
    for (const x of g) expect(Number.isInteger(x * SEASON.asyncShare)).toBe(true);
    expect(new Set(Object.values(SEASON.rewards).map((x) => x.cosmetic)).size).toBe(6);
  });

  it('titles take the better league', () => {
    expect(bestLeague('gold', 'silver')).toBe('gold');
    expect(bestLeague(null, 'bronze')).toBe('bronze');
    expect(bestLeague('legend', 'strategos')).toBe('legend');
  });
});

describe('async ladder', () => {
  const pool = (ratings: number[]) => ratings.map((rating, i) => ({ pid: i + 1, rating }));

  it('offers the whole pool when it is small, best first', () => {
    expect(pickCandidates(1500, pool([1400, 1600]), 1).map((d) => d.pid)).toEqual([2, 1]);
    expect(pickCandidates(1500, [], 1)).toEqual([]);
  });

  it('picks one below, the closest and one above from the nearest defenders, fixed by the seed', () => {
    const p = pool([900, 1200, 1350, 1420, 1480, 1490, 1510, 1530, 1560, 1640, 1700, 1800, 2400, 2500]);
    const a = pickCandidates(1500, p, 42);
    expect(a).toHaveLength(ASYNC.candidates);
    expect(new Set(a.map((d) => d.pid)).size).toBe(3);
    expect(a.some((d) => d.rating < 1500)).toBe(true);
    expect(a.some((d) => d.rating >= 1500)).toBe(true);
    // never the far ends of the pool (only the ASYNC.pool nearest count)
    for (const d of a) expect(Math.abs(d.rating - 1500)).toBeLessThan(400);
    expect(pickCandidates(1500, p, 42)).toEqual(a);
    // the seed changes after each attack: the offer may change
    const seen = new Set<string>();
    for (let s = 1; s < 30; s++) seen.add(pickCandidates(1500, p, s).map((d) => d.pid).join());
    expect(seen.size).toBeGreaterThan(1);
  });

  it('moves the defender at half rate, both ways', () => {
    const me = r(1500, 100);
    const att = r(1500, 100);
    for (const s of [0, 1] as const) {
      const full = glicko2(me, att, s);
      const half = defenceRating(me, att, s);
      expect(half.rating - 1500).toBeCloseTo((full.rating - 1500) * 0.5, 9);
      expect(half.rd).toBeCloseTo(full.rd, 9);
    }
  });

  it('pays the attacker by result and the defender only for held defences, within the daily cap', () => {
    expect(attackPay(1)).toEqual({ glory: ASYNC.glory.win, accountXp: ASYNC.accountXp.win });
    expect(attackPay(0)).toEqual({ glory: ASYNC.glory.loss, accountXp: ASYNC.accountXp.loss });
    expect(defencePay(1, 0)).toBe(ASYNC.defence.glory.win);
    expect(defencePay(0.5, 0)).toBe(ASYNC.defence.glory.draw);
    expect(defencePay(0, 0)).toBe(0);
    expect(defencePay(1, ASYNC.defence.gloryPerDay - 2)).toBe(2);
    expect(defencePay(1, ASYNC.defence.gloryPerDay)).toBe(0);
  });
});

describe('demo duel source (slice 4)', () => {
  it('keeps its presets, uses and the defence; raids cap at 10 a day', async () => {
    const src = new DemoDuelSource({ now: () => Date.UTC(2026, 9, 7, 12) });
    src.setXp(560);
    const p = await src.profile();
    expect(p.loadouts.map((l) => l.slot)).toEqual([1, 2]);
    expect(p.use).toEqual({ ladder: 1, arena: 1, defence: 2 });
    expect(p.defence?.heroes).toBe(3);
    const two = await src.loadout({ slot: 3, edit: true });
    expect(two.profile.loadout).toBe(3);
    expect(two.profile.loadouts.map((l) => l.slot)).toEqual([1, 2, 3]);
    expect(two.profile.team).toEqual(p.loadouts[0].team);
    const v = await src.asyncView();
    expect(v.unlocked).toBe(true);
    expect(v.candidates).toHaveLength(3);
    for (let i = v.attacks.used; i < ASYNC.attacksPerDay; i++) {
      const c = (await src.asyncView()).candidates[0];
      await src.asyncStart(c.pid);
    }
    await expect(src.asyncStart(900)).rejects.toMatchObject({ code: 'attack_cap' });
    const s = await src.season();
    expect(s.season.end).toBe(Date.UTC(2026, 10, 1));
    expect((await src.leaderboard('legend')).rows.every((x) => x.rating !== null)).toBe(true);
  });
});
