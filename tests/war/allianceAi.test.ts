/**
 * P7 AI (docs/impl/godot-port.md): the alliance AI (src/war/sim/allianceAi.ts), the season clock
 * (src/war/world/seasonClock.ts) and a headless AI-vs-AI season (src/war/sim/aiSeason.ts) played to its end on real
 * regions. Every expectation derives from ALLY_AI, TUNNEL, SCORE and HEGEMONY.
 */
import { describe, expect, it } from 'vitest';
import { parseRegion } from '../../src/war/region/schema';
import { AI_SEASON, createAiSeason, summary } from '../../src/war/sim/aiSeason';
import { ALLY_AI, entryOf } from '../../src/war/sim/allianceAi';
import { TUNNEL } from '../../src/war/sim/tunnel';
import { createSeasonClock } from '../../src/war/world/seasonClock';
import { FRONTIER_TOWNS, HEGEMONY, HOUR_MS, OMPHALOS, SCORE } from '../../src/war/world/season';
import { ALLIANCES } from '../../src/war/world/alliances';
import type { RegionData } from '../../src/war/types';

const files = import.meta.glob('../../src/war/regions/*.json', { eager: true, import: 'default' });
const region = (id: string): RegionData => parseRegion(files[`../../src/war/regions/${id}.json`]);
const none = [0, 0, 0, 0];

describe('season clock', () => {
  it('gives a region to strictly the most claim points; a tie keeps the owner; a home stays its alliance', () => {
    const c = createSeasonClock(0, 10 * HOUR_MS), owner = (id: string) => c.state.regions.find((r) => r.id === id)!.owner;
    c.report('achelous', { claims: [0, 1, 0, 0], live: none }, 0);
    expect(owner('achelous')).toBe(1);
    c.report('achelous', { claims: [1, 1, 0, 0], live: none }, 0);
    expect(owner('achelous')).toBe(1);
    c.report('achelous', { claims: [2, 1, 0, 0], live: none }, 0);
    expect(owner('achelous')).toBe(0);
    c.report(ALLIANCES[2].home, { claims: [3, 0, 0, 0], live: none }, 0);
    expect(owner(ALLIANCES[2].home)).toBe(2);
  });

  it('accrues each owner its region rate and ends at its time with the best score the winner', () => {
    const c = createSeasonClock(0, 2 * HOUR_MS);
    c.report(FRONTIER_TOWNS[0], { claims: [0, 0, 1, 0], live: none }, 0);
    expect(c.advance(HOUR_MS)).toBeNull();
    expect(c.state.scores[2]).toBeCloseTo(SCORE.town);
    const end = c.advance(3 * HOUR_MS)!;
    expect(end).toEqual({ at: 2 * HOUR_MS, reason: 'time', winner: 2, scores: [0, 0, 2 * SCORE.town, 0] });
    expect(c.advance(4 * HOUR_MS)).toBeNull();
  });

  it('ends early once one alliance held Omphalos and HEGEMONY.towns frontier towns for HEGEMONY.ms', () => {
    const c = createSeasonClock(0, 10 * HEGEMONY.ms), at = 1000;
    for (const id of [OMPHALOS, ...FRONTIER_TOWNS.slice(0, HEGEMONY.towns)]) c.report(id, { claims: [0, 0, 0, 1], live: none }, at);
    expect(c.state.hegemony).toEqual({ alliance: 3, since: at });
    expect(c.endsAt()).toBe(at + HEGEMONY.ms);
    expect(c.advance(at + HEGEMONY.ms)).toMatchObject({ reason: 'hegemony', winner: 3, at: at + HEGEMONY.ms });
  });
});

describe('alliance AI', () => {
  it('each alliance enters by its own side, its commanders with the tunnel floor each', () => {
    const r = region('achelous'), s = createAiSeason(r, 1, { lengthMs: 1e9 });
    const at = ALLIANCES.map((a) => entryOf(r, a.id));
    expect(new Set(at.map((p) => p.join())).size).toBe(ALLIANCES.length);
    for (let t = 0; t < 2 * ALLY_AI.think; t++) s.step();
    for (const ai of s.ais) expect(ai.men()).toBe(ALLY_AI.players * TUNNEL.floor);
    expect(s.ais.every((ai) => ai.present() === ALLY_AI.players)).toBe(true);
  });

  it('plays the same season twice from one seed', () => {
    const run = () => {
      const s = createAiSeason(region('achelous'), 5, { lengthMs: 1e9, age: 4 });
      for (let t = 0; t < 1500; t++) s.step();
      return JSON.stringify([s.sim.snapshot().units, s.ais.map((a) => a.stats()), s.clock.state]);
    };
    expect(run()).toBe(run());
  });
});

/**
 * A season to its end: every EVERY ticks the world has moved on (men, claims, buildings) and the clock with it; at the
 * end the season is over by its time. `look` sees each snapshot.
 */
function season(id: string, ticks: number, o: { held?: number[]; age?: number }, look: (s: ReturnType<typeof createAiSeason>) => void) {
  const EVERY = 1000, s = createAiSeason(region(id), 1, { lengthMs: ticks * ALLY_AI.tickMs, ...o });
  let last = '', t = 0, ended = false;
  while (!ended) {
    ended = s.step();
    t++;
    expect(t).toBeLessThanOrEqual(ticks);
    look(s);
    if (t % EVERY && !ended) continue;
    const snap = s.sim.snapshot(), now = JSON.stringify([snap.units.map((u) => [u.x, u.y, u.hp, u.state]), snap.claims, snap.buildings?.map((b) => [b.state, b.progress, b.hp])]);
    expect(now, `tick ${t}: the world stood still`).not.toBe(last);
    expect(s.clock.state.accruedAt).toBe(t * ALLY_AI.tickMs);
    last = now;
  }
  expect(t).toBe(ticks);
  expect(s.clock.state.ended).toMatchObject({ reason: 'time', at: ticks * ALLY_AI.tickMs });
  return s;
}

describe('a headless AI-vs-AI season', () => {
  it('runs to its end at Achelous: claims taken and held, camps and storehouses built, men raised, the warlord there', () => {
    const owners = new Set<number>(), doing = new Set<string>();
    const s = season('achelous', 12000, { age: 4 }, (x) => {
      const snap = x.sim.snapshot();
      if (snap.tick % AI_SEASON.report === 0) for (const c of snap.claims ?? []) if (c.state === 'claimed') owners.add(c.team);
      for (const ai of x.ais) doing.add(ai.stats().doing);
    });
    expect(owners.size).toBeGreaterThanOrEqual(2);
    for (const d of ['march', 'claim', 'hold', 'muster']) expect(doing).toContain(d);
    const snap = s.sim.snapshot(), done = (type: string) => (snap.buildings ?? []).some((b) => b.team < ALLIANCES.length && b.type === type && b.state === 'done');
    expect(done(ALLY_AI.camp)).toBe(true);
    expect(done(ALLY_AI.store)).toBe(true);
    expect(s.ais.reduce((a, ai) => a + ai.stats().raised, 0)).toBeGreaterThan(0);
    expect(s.lords).not.toBeNull();
    // the owner the clock gave the region: strictly the most claim points, as the room last reported them
    const rep = summary(snap), best = Math.max(...rep.claims);
    const owner = s.clock.state.regions.find((r) => r.id === 'achelous')!.owner;
    if (rep.claims.filter((n) => n === best).length === 1 && best > 0) expect(owner).toBe(rep.claims.indexOf(best));
    expect(s.clock.state.ended!.winner).toBe(s.clock.state.scores.indexOf(Math.max(...s.clock.state.scores)));
  });

  it('runs to its end at the Saddle with its walled point held: the others storm it with rams', () => {
    let rams = 0;
    const sieging = new Set<number>();
    season('saddle', 6000, { held: [-1, 3] }, (x) => {
      for (const ai of x.ais) if (ai.stats().doing === 'siege') sieging.add(ai.team);
      rams = Math.max(rams, (x.sim.snapshot().sieges ?? []).filter((e) => e.type === 'ram' && e.team !== 3).length);
    });
    expect(sieging.size).toBeGreaterThanOrEqual(2);
    expect(sieging.has(3)).toBe(false);
    expect(rams).toBeGreaterThan(0);
  });
});
