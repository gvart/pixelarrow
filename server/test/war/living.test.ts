/**
 * M7f living regions on the server (docs/WAR.md "Living regions", "Season score and victory"): the season score rows and
 * caps, the landmark on the world map, a guardian kill on the bosses board, and the region memory that keeps a
 * half-razed town, a restored landmark and a slain guardian across DO restarts (DO storage and D1), reset by the season.
 */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { devLogin } from '../helpers';
import { allianceRates, LIVING, SCORE, type ScoredRegion } from '../../../src/war/world/season';
import { World, freshWorld } from '../../src/war/world/world';
import { WarRoom } from '../../src/war/room';
import { applyBossKill } from '../../src/war/bosses';
import { elapsedTicks, loadMemory, remembered, writeMemory } from '../../src/war/memory';
import { restoreCost } from '../../../src/data/warLandmarks';
import { makePerson } from '../../../src/war/sim/roster';
import { BOSS } from '../../../src/war/sim/bosses';
import { WAR_SEASON } from '../../../src/war/world/alliances';
import type { RegionData, ResourceKind } from '../../../src/war/types';
import { warRegion } from '../../src/war/regions';

const DB = () => env.DB!;
const krios = (): RegionData => warRegion('krios')!;
const kleisoura = (): RegionData => warRegion('kleisoura')!;
const room = (region: RegionData) => new WarRoom({ region, seed: 1, cap: 600, wild: true });
const ticks = (r: WarRoom, n: number) => {
  const out = { bosses: [] as ReturnType<WarRoom['tick']>['bosses'], sacrilege: [] as number[] };
  for (let i = 0; i < n; i++) {
    const t = r.tick();
    out.bosses.push(...t.bosses);
    out.sacrilege.push(...t.sacrilege);
  }
  return out;
};
const reg = (id: string, owner: number, extra: Partial<ScoredRegion> = {}): ScoredRegion => ({ id, owner, live: [0, 0, 0, 0], ...extra });

/** Drakon slain by player `pid` and the citadel's claim point held by alliance 0. */
function citadelTaken(pid: number): { r: WarRoom; slain: ReturnType<WarRoom['tick']>['bosses'] } {
  const region = krios();
  const r = room(region);
  ticks(r, 2);
  r.sim.hurtBoss('drakon', 1e9, `p:${pid}`);
  const slain = ticks(r, 2).bosses;
  const m = r.memory();
  m.claims[region.prebuilt!.find((e) => e.art === 'citadel-keep')!.claim!] = 0;
  r.recall(m, 0);
  ticks(r, 20);
  return { r, slain };
}

describe('M7f season score rows', () => {
  it('a garrisoned landmark scores +2 to its holder, at most 6 an alliance; a damaged one nothing', () => {
    const lm = (holder: number, garrisoned: boolean) => ({ landmark: { holder, garrisoned } });
    expect(allianceRates([reg('saddle', 1, lm(1, true))])[1]).toBe(SCORE.gate + LIVING.landmark);
    expect(allianceRates([reg('saddle', 1, lm(1, false))])[1]).toBe(SCORE.gate);
    const four = ['saddle', 'gorge', 'krios', 'siren'].map((id) => reg(id, 2, lm(2, true)));
    expect(allianceRates(four)[2]).toBe(SCORE.gate * 2 + SCORE.neutral * 2 + LIVING.landmarkCap);
    // a single landmark region never gives more than 4 an hour
    expect(allianceRates([reg('gorge', 0, lm(0, true))])[0]).toBeLessThanOrEqual(4);
  });

  it('temples, shrines and statues at most 2 an hour an alliance; a ruined frontier town 1 instead of 3', () => {
    const rates = allianceRates([reg('kleisoura', 0, { prestige: [1.5, 0.3, 0, 0] }), reg('dodona', 0, { prestige: [1.2, 0, 0, 0] })]);
    expect(rates[0]).toBe(SCORE.town + LIVING.prestigeCap);
    expect(rates[1]).toBeCloseTo(0.3, 9);
    expect(allianceRates([reg('kleisoura', 3, { ruined: true })])[3]).toBe(SCORE.ruinedTown);
  });

  it('sacrilege costs the razer 10; the world map carries the landmark with its holder, guardian and when he is back', () => {
    const now = 1_000_000;
    const w = new World(freshWorld(now));
    w.sacrilege(1, now);
    expect(w.st.season.scores[1]).toBe(-LIVING.sacrilege);
    w.report('krios', { live: [0, 0, 0, 0], claims: [1, 0, 0, 0], channel: [0, 0, 0, 0], landmark: { id: 'drakons_citadel', holder: 0, guardian: 'slain', back: 60, state: 'damaged', hp: 0.37, garrisoned: false } }, now);
    expect(w.region('krios')!.landmark).toEqual({ id: 'drakons_citadel', holder: 0, guardian: 'slain', backAt: now + 3600_000, state: 'damaged', hp: 0.37, garrisoned: false });
    expect(w.snapshot(1, 0, { members: [], clans: [] }, now).regions.find((r) => r.id === 'krios')!.landmark!.holder).toBe(0);
  });
});

describe('M7f landmark in the room', () => {
  it('Drakon falls to a player: the bosses board counts it; the summary shows the citadel taken and damaged', async () => {
    const a = await devLogin(7471);
    const { r, slain } = citadelTaken(a.playerId);
    expect(slain.map((e) => e.boss)).toEqual(['drakon']);
    expect(await applyBossKill(DB(), 'krios', r.run, slain[0], Date.now())).toBe(true);
    const row = await DB().prepare('SELECT bosses FROM war_player_stats WHERE season = ?1 AND player_id = ?2').bind(WAR_SEASON.id, a.playerId).first<{ bosses: number }>();
    expect(row!.bosses).toBe(1);
    const s = r.summary();
    expect(s.claims[0]).toBe(1);
    expect(s.landmark).toMatchObject({ id: 'drakons_citadel', holder: 0, guardian: 'slain', state: 'damaged', garrisoned: false });
    expect(s.landmark!.hp).toBeLessThanOrEqual(0.4);
    expect(s.landmark!.back).toBeGreaterThan(0);
  });

  it('a restart keeps a restored landmark (memory through D1); another season finds it as authored', async () => {
    const { r } = citadelTaken(7472);
    const p = makePerson('eng-m7f', 'civ_engineer', { level: 10 });
    p.hero.perks = ['masterBuilder', 'fortifier', 'poliorcetes'] as never;
    const keep = r.snapshot().buildings!.find((b) => b.art === 'citadel-keep')!;
    const eng = r.sim.spawnSquad('p:7472', 0, 'civ_engineer', 1, keep.x, keep.y + 6, [p]);
    for (const [k, n] of Object.entries(restoreCost('drakons_citadel'))) r.sim.addStock(0, k as ResourceKind, n!);
    r.sim.order({ kind: 'restoreLandmark', squad: eng });
    ticks(r, 20);
    expect(r.summary().landmark!.state).toBe('restored');
    const now = Date.now();
    await writeMemory(DB(), 'krios', remembered(r.memory(), now - 60_000));
    const none = { get: async () => undefined } as unknown as DurableObjectStorage;
    const m = await loadMemory(none, DB(), 'krios');
    expect(m).not.toBeNull();
    expect(elapsedTicks(m!, now)).toBe(600);
    const again = room(krios());
    again.recall(m!.mem, elapsedTicks(m!, now));
    ticks(again, 20);
    expect(again.summary().landmark).toMatchObject({ holder: 0, guardian: 'slain', state: 'restored' });
    for (const b of again.snapshot().buildings!.filter((b) => b.landmark)) expect(b.hp).toBeCloseTo(b.maxHp, 5);
    // the next season: the memory is not this season's, the citadel is Drakon's at 60% again
    expect(await loadMemory(none, DB(), 'krios', WAR_SEASON.id + 1)).toBeNull();
    const fresh = room(krios());
    ticks(fresh, 20);
    expect(fresh.summary().landmark).toMatchObject({ holder: -1, guardian: 'alive', state: 'guarded' });
  });

  it('a restart keeps a half-razed town; a slain guardian left unheld for 24 h is back', async () => {
    const region = kleisoura();
    const r = room(region);
    ticks(r, 2);
    const houses = r.snapshot().buildings!.filter((b) => b.pre && b.type === 'house');
    const half = houses.slice(0, Math.ceil(houses.length / 2));
    for (const b of half) r.sim.damageBuilding(b.id, 1e9);
    ticks(r, 2);
    const storage = new Map<string, unknown>();
    const fake = { get: async (k: string) => storage.get(k), put: async (k: string, v: unknown) => void storage.set(k, v) } as unknown as DurableObjectStorage;
    await fake.put('memory', remembered(r.memory(), Date.now()));
    const m = await loadMemory(fake, undefined, 'kleisoura');
    const again = room(region);
    again.recall(m!.mem, elapsedTicks(m!, Date.now()));
    again.tick();
    const by = new Map(again.snapshot().buildings!.map((b) => [b.id, b]));
    for (const b of half) expect(by.get(b.id)!.ruin).toBe(true);
    expect(houses.slice(half.length).every((b) => !by.get(b.id)!.ruin)).toBe(true);

    const k = room(krios());
    ticks(k, 2);
    k.sim.hurtBoss('drakon', 1e9, 'p:9');
    ticks(k, 2);
    const late = room(krios());
    late.recall(k.memory(), BOSS.respawn + 1);
    ticks(late, 20);
    expect(late.summary().landmark).toMatchObject({ guardian: 'alive', state: 'guarded' });
  });
});
