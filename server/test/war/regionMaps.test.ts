/**
 * Every region room on its own map (server/src/war/regions.ts): each id boots its authored region (town pieces, lairs,
 * guardians, claim points, entries on the sides its world borders use); the room's saved state round-trips on a real
 * map; a state or memory of another season or region version is not taken and the region starts as authored.
 */
import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { NET_VERSION, type JoinMsg } from '../../../src/war/net/protocol';
import { WORLD_REGIONS } from '../../../src/war/world/regions';
import { edge } from '../../../src/war/world/graph';
import { WAR_SEASON } from '../../../src/war/world/alliances';
import { WarRoom } from '../../src/war/room';
import { regionVersion, WAR_REGIONS, warRegion } from '../../src/war/regions';
import { edition, storeState, type WarRegionDO } from '../../src/war/regionDO';
import { remembered, storeMemory } from '../../src/war/memory';

const army = (region: string, pid: number, team: number): JoinMsg => ({ t: 'join', v: NET_VERSION, region, playerId: pid, team, army: [{ cls: 'hoplite', count: 12 }] });
type Ensure = { ensure(region: string): Promise<WarRoom | null> };

describe('region maps', () => {
  it('hosts every world region and the test map, each on its own authored map', () => {
    expect(new Set(WAR_REGIONS)).toEqual(new Set([...WORLD_REGIONS.map((r) => r.id), 'test-ridge']));
    const ridge = warRegion('test-ridge')!;
    const vers = new Set<string>();
    for (const id of WAR_REGIONS) {
      const r = warRegion(id)!;
      expect(r.id).toBe(id);
      vers.add(regionVersion(id));
      if (id !== 'test-ridge') expect(r.name).not.toBe(ridge.name);
    }
    expect(vers.size).toBe(WAR_REGIONS.length); // a version per authored map
  });

  it('every world border lands on an authored entry on that side, but the entry-to-entry diagonals (nearest entry)', () => {
    const gaps: string[] = [];
    for (const w of WORLD_REGIONS) {
      const sides = new Set(warRegion(w.id)!.entries.map((e) => e.side));
      for (const b of w.adj) if (!sides.has(edge(w.id, b)!.sideA)) gaps.push(`${w.id}>${b}`);
    }
    // the maps of a home's side entries have no entry towards the neighbouring side entry: WarRoom.entry takes the nearest
    expect(gaps.sort()).toEqual(['dodona-e>dodona-n', 'dodona-w>dodona-n', 'elaia-e>elaia-s', 'elaia-w>elaia-s', 'kyrene-e>kyrene-s', 'kyrene-w>kyrene-s', 'skythia-e>skythia-n', 'skythia-w>skythia-n']);
    // such an arrival comes in on the entry nearest that edge, not just the first one
    const r = new WarRoom({ region: warRegion('dodona-w')!, seed: 1, cap: 600 });
    const e = (r as unknown as { entry(s: string): { y0: number } }).entry('N');
    const north = Math.min(...warRegion('dodona-w')!.entries.map((x) => x.y));
    expect(e.y0).toBe(north);
  });

  it('a fresh room puts up its town, lairs, claim points and guardians from its data', () => {
    for (const id of ['achelous', 'kleisoura', 'krios', 'omphalos']) {
      const data = warRegion(id)!;
      const r = new WarRoom({ region: data, seed: 1, cap: 600, wild: true });
      r.tick();
      const s = r.snapshot();
      expect(s.buildings!.filter((b) => b.pre).length, id).toBe(data.prebuilt!.length);
      expect(s.lairs!.length, id).toBe(data.lairs!.length);
      expect(s.claims!.length, id).toBe(data.claimPoints!.length);
      expect((s.bosses ?? []).length, id).toBe(data.guardians?.length ?? 0);
      expect((s.bosses ?? []).every((b) => b.state !== 'slain' && b.state !== 'away'), id).toBe(true);
    }
  });

  it('a room on a real map round-trips its saved state', () => {
    const region = warRegion('achelous')!;
    const r = new WarRoom({ region, seed: 1, cap: 600, wild: true });
    expect(r.join(1, army('achelous', 1, 0)).msg).toMatchObject({ t: 'welcome' });
    const house = r.snapshot().buildings!.find((b) => b.pre && b.type === 'house')!;
    r.sim.damageBuilding(house.id, house.maxHp / 2);
    for (let i = 0; i < 20; i++) r.tick();
    const st = r.saveState();
    const back = WarRoom.restore({ region, seed: 1, cap: 600, wild: true }, JSON.parse(JSON.stringify(st)), new Map());
    expect(back.currentTick).toBe(r.currentTick);
    expect(back.alive()).toBe(12);
    for (let i = 0; i < 5; i++) {
      r.tick();
      back.tick();
    }
    const a = r.snapshot(), b = back.snapshot();
    expect(b.units.map((u) => [u.x, u.y, u.hp])).toEqual(a.units.map((u) => [u.x, u.y, u.hp]));
    expect(b.buildings!.find((x) => x.id === house.id)!.hp).toBeCloseTo(a.buildings!.find((x) => x.id === house.id)!.hp, 6);
  });
});

describe('WarRegionDO on a region map', () => {
  it('restores a state of this season and version; another version starts the region over', async () => {
    const region = warRegion('achelous')!;
    const saved = new WarRoom({ region, seed: 1, cap: 600, wild: true });
    saved.join(1, army('achelous', 1, 0));
    saved.tick();
    const st = saved.saveState();
    for (const [name, ed, alive] of [['achelous', edition('achelous'), 12], ['achelous', `${WAR_SEASON.id}:old`, 0], ['achelous', `${WAR_SEASON.id - 1}:${regionVersion('achelous')}`, 0]] as const) {
      const stub = env.WAR_REGION.get(env.WAR_REGION.newUniqueId());
      await runInDurableObject(stub, async (o: WarRegionDO, state) => {
        await storeState(state.storage, { ...st, edition: ed });
        const room = (await (o as unknown as Ensure).ensure(name))!;
        expect(room.region.id).toBe('achelous');
        expect(room.alive()).toBe(alive);
        expect(room.snapshot().buildings!.filter((b) => b.pre).length).toBe(region.prebuilt!.length);
      });
    }
  });

  it('a fresh season (or a changed map) finds the guardian alive and the landmark as authored', async () => {
    const region = warRegion('krios')!;
    const r = new WarRoom({ region, seed: 1, cap: 600, wild: true });
    r.tick();
    r.sim.hurtBoss('drakon', 1e9, 'p:1');
    for (let i = 0; i < 3; i++) r.tick();
    expect(r.memory().guardians.some((g) => g.state === 'slain')).toBe(true);
    const slain = r.memory();
    const cases = [
      [remembered(slain, Date.now(), WAR_SEASON.id, regionVersion('krios')), 'slain'],
      [remembered(slain, Date.now(), WAR_SEASON.id - 1, regionVersion('krios')), 'alive'],
      [remembered(slain, Date.now(), WAR_SEASON.id, 'old'), 'alive'],
    ] as const;
    for (const [mem, want] of cases) {
      const stub = env.WAR_REGION.get(env.WAR_REGION.newUniqueId());
      await runInDurableObject(stub, async (o: WarRegionDO, state) => {
        await storeMemory(state.storage, mem);
        const room = (await (o as unknown as Ensure).ensure('krios'))!;
        room.tick();
        expect(room.summary().landmark?.guardian).toBe(want);
      });
    }
  });
});
