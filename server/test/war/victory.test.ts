/**
 * W-92, W-160..W-164: land decides the one alliance win. Regions and towns come from the data, so the test holds when the
 * map changes.
 */
import { describe, expect, it } from 'vitest';
import { ALLIANCES } from '../../../src/war/world/alliances';
import { worldRegion } from '../../../src/war/world/graph';
import { WORLD_REGIONS } from '../../../src/war/world/regions';
import { FRONTIER_TOWNS, GATES, HEGEMONY, HOUR_MS, OMPHALOS, allianceRates, scoreRate } from '../../../src/war/world/season';
import { warRegion } from '../../src/war/regions';
import { WarRoom } from '../../src/war/room';
import { freshWorld, World } from '../../src/war/world/world';

const T0 = 1_700_000_000_000, H = HOUR_MS, N = ALLIANCES.length;
const none = () => Array<number>(N).fill(0);
const of = (a: number, n = 1) => none().map((_, i) => (i === a ? n : 0));
/** Alliance `a` holds the region; `men` of its own stand there. */
const hold = (w: World, id: string, a: number, at: number, men = 12) => w.report(id, { live: of(a, men), claims: of(a), channel: none() }, at);
/** Plain neutral land: not the centre, a town or a gate. */
const OTHER_LAND = WORLD_REGIONS.filter((r) => r.role === 'neutral' && r.id !== OMPHALOS && !FRONTIER_TOWNS.includes(r.id) && !GATES.includes(r.id)).map((r) => r.id);
const seasonEnd = (w: World) => T0 + w.season.lengthMs;

describe('hegemony (W-92)', () => {
  it('Omphalos and 3 of the frontier towns for 24 h win early, whoever has more land-hours', () => {
    const w = new World(freshWorld(T0));
    // alliance 1 has held every gate and all the plain land since the first hour
    for (const id of [...GATES, ...OTHER_LAND]) hold(w, id, 1, T0);
    const late = T0 + 500 * H;
    hold(w, OMPHALOS, 0, late);
    const [kept, ...rest] = FRONTIER_TOWNS.slice(0, HEGEMONY.towns);
    hold(w, kept, 0, late);
    for (const id of rest) hold(w, id, 0, late);
    expect(w.st.season.hegemony).toEqual({ alliance: 0, since: late });
    const r = w.advance(late + HEGEMONY.ms);
    expect(r).toMatchObject({ reason: 'hegemony', winner: 0, at: late + HEGEMONY.ms });
    expect(r!.scores[1]).toBeGreaterThan(r!.scores[0]);
  });

  it('a clock that would outrun the season does not win it: land-hours do', () => {
    const w = new World(freshWorld(T0));
    for (const id of [...GATES, ...OTHER_LAND]) hold(w, id, 1, T0);
    const late = seasonEnd(w) - H;
    hold(w, OMPHALOS, 0, late);
    for (const id of FRONTIER_TOWNS.slice(0, HEGEMONY.towns)) hold(w, id, 0, late);
    expect(w.advance(seasonEnd(w))).toMatchObject({ reason: 'time', winner: 1 });
  });
});

describe('no hegemony by day 28: the most land-hours (W-160)', () => {
  it('the alliance that held more land for longer wins', () => {
    const w = new World(freshWorld(T0));
    hold(w, GATES[0], 2, T0); // from the start
    hold(w, FRONTIER_TOWNS[0], 3, seasonEnd(w) - 24 * H); // a richer town, but late
    const r = w.advance(seasonEnd(w))!;
    expect(r).toMatchObject({ reason: 'time', winner: 2 });
    const hours = w.season.lengthMs / H;
    expect(r.scores[2]).toBe(hours * scoreRate({ id: GATES[0], owner: 2, live: none() }));
  });

  it('nobody holding land, or an exact tie, has no winner', () => {
    const empty = new World(freshWorld(T0));
    expect(empty.advance(seasonEnd(empty))).toMatchObject({ reason: 'time', winner: null, scores: none() });
    const tied = new World(freshWorld(T0));
    hold(tied, GATES[0], 0, T0);
    hold(tied, GATES[1], 1, T0);
    expect(tied.advance(seasonEnd(tied))).toMatchObject({ reason: 'time', winner: null });
  });
});

describe('only land moves the race (W-161..W-163)', () => {
  it('trade, peace and town level have no way in', () => {
    const w = new World(freshWorld(T0)) as unknown as Record<string, unknown>;
    expect(w.addTrade).toBeUndefined();
    expect(w.addPeace).toBeUndefined();
    const town = OTHER_LAND[0];
    const noMen = { id: town, owner: -1, live: none(), town: [5, 5, 5, 5] };
    expect(allianceRates([noMen])).toEqual(none());
    expect(worldRegion(town)?.role).toBe('neutral');
  });

  it('a region report of town levels adds nothing and is not kept', () => {
    const w = new World(freshWorld(T0));
    w.report(GATES[0], { live: none(), claims: none(), channel: none(), town: of(0, 5) } as Parameters<World['report']>[1], T0);
    w.advance(T0 + 24 * H);
    expect(w.st.season.scores).toEqual(none());
    expect(w.st.regions[GATES[0]]).not.toHaveProperty('town');
  });

  it('event points are a record: they do not count toward the win', () => {
    const w = new World(freshWorld(T0));
    hold(w, GATES[0], 1, T0);
    w.eventScore(0, 10_000, T0 + H);
    expect(w.st.season.event).toEqual(of(0, 10_000));
    const r = w.advance(seasonEnd(w))!;
    expect(r.winner).toBe(1);
    expect(r.scores[0]).toBe(0);
    expect(w.seasonSnap(seasonEnd(w)).event).toEqual(of(0, 10_000));
  });

  it('razing a temple still costs land-hours', () => {
    const w = new World(freshWorld(T0));
    hold(w, GATES[0], 0, T0);
    hold(w, GATES[1], 1, T0);
    w.sacrilege(0, T0 + H);
    expect(w.advance(seasonEnd(w))!.winner).toBe(1);
  });
});

describe('empty land keeps scoring (W-164)', () => {
  it('held with nobody on it, for the rest of the season, until someone takes it', () => {
    const w = new World(freshWorld(T0));
    hold(w, GATES[0], 0, T0);
    // everyone leaves; the points stay his, then the room stops counting them at all: the land is still his
    w.report(GATES[0], { live: none(), claims: of(0), channel: none() }, T0 + H);
    w.report(GATES[0], { live: none(), claims: none(), channel: none() }, T0 + 2 * H);
    expect(w.region(GATES[0])!.owner).toBe(0);
    const rate = scoreRate({ id: GATES[0], owner: 0, live: none() });
    expect(w.seasonSnap(T0 + 100 * H).scores[0]).toBe(100 * rate);
    // someone takes it: it stops being his from that hour
    w.report(GATES[0], { live: of(1), claims: of(1), channel: none() }, T0 + 100 * H);
    expect(w.seasonSnap(T0 + 110 * H).scores).toEqual(none().map((_, i) => (i === 0 ? 100 * rate : i === 1 ? 10 * rate : 0)));
  });

  it('an empty Omphalos scores; foes on the plateau stop it', () => {
    const w = new World(freshWorld(T0));
    hold(w, OMPHALOS, 0, T0, 0);
    expect(w.seasonSnap(T0).rates[0]).toBeGreaterThan(0);
    w.report(OMPHALOS, { live: of(1), claims: of(0), channel: none() }, T0);
    expect(w.seasonSnap(T0).rates[0]).toBe(0);
  });

  it('the hegemony clock runs on empty land', () => {
    const w = new World(freshWorld(T0));
    hold(w, OMPHALOS, 0, T0, 0);
    for (const id of FRONTIER_TOWNS.slice(0, HEGEMONY.towns)) hold(w, id, 0, T0, 0);
    expect(w.advance(T0 + HEGEMONY.ms)).toMatchObject({ reason: 'hegemony', winner: 0 });
  });

  it('a region room with no men left still reports its claim points', () => {
    const made = new WarRoom({ region: warRegion('krios')!, seed: 1, cap: 600, wild: true });
    const mem = made.memory();
    mem.claims = mem.claims.map(() => 0);
    const room = new WarRoom({ region: warRegion('krios')!, seed: 1, cap: 600, wild: true });
    room.recall(mem, 0);
    for (let i = 0; i < 600; i++) room.tick(); // a minute with nobody there
    const s = room.summary();
    expect(s.live[0]).toBe(0);
    expect(s.claims[0]).toBe(mem.claims.length);
    expect(mem.claims.length).toBeGreaterThan(0);
  });
});
