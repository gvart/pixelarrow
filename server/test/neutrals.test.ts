// AI-03: server-built bot setups pick a doctrine (design/gdd/ai-doctrines.md R4):
// duel ladder floors and war-map neutrals; world bosses and other defenders stay steady.
import { beforeEach, describe, expect, it } from 'vitest';
import type { BattleSetup, LoggedOrder } from '../../src/sim/types';
import { ladderFloor, ladderSetup } from '../../src/duel/ladder';
import { neutralDoctrine, NEUTRAL_MIX } from '../../src/online/neutralDoctrine';
import { DEFENDERS } from '../../src/online/defenders';
import { worldBossSites } from '../../src/online/lairs';
import { replayBattle, VerifyBody } from '../src/battle';
import { SIM_VERSION } from '../../src/sim/version';
import { DB, fresh, freeNeighbour, join, must, openDuellist, placeArmy, play, post, shardRow, type Ticket } from './onlineHelpers';

type Site = Parameters<typeof neutralDoctrine>[1]['site'];
const plain = { base: 'plain' } as Site;

describe('neutral doctrines (shared mapping)', () => {
  it('maps every defender kind to a campaign mix', () => {
    expect(Object.keys(NEUTRAL_MIX).sort()).toEqual(Object.keys(DEFENDERS).sort());
  });

  it('hill tribes and pirates swarm, cultists fury, the others steady', () => {
    expect(neutralDoctrine(1, { id: 1, kind: 'lair', site: plain, coast: false })).toBe('fury'); // cultists
    expect(neutralDoctrine(1, { id: 2, kind: 'post', site: plain, coast: true })).toBe('swarm'); // pirates
    expect(neutralDoctrine(1, { id: 3, kind: 'post', site: plain, coast: false })).toBe('steady'); // outlaws
    expect(neutralDoctrine(1, { id: 4, kind: 'town', site: plain, coast: false })).toBe('steady'); // city garrison
    expect(neutralDoctrine(1, { id: 5, kind: 'fort', site: plain, coast: false })).toBe('steady'); // deserters
    expect(neutralDoctrine(1, { id: 6, kind: 'plain' as never, site: { base: 'hills', rocky: false } as Site, coast: false })).toBe('swarm'); // tribes
  });
});

describe('war attacks carry the neutrals’ doctrine (AI-03)', () => {
  beforeEach(fresh);

  it('a neutral region’s setup has its doctrine, and the battle verifies', async () => {
    const p = await join(97301);
    const shard = await shardRow(p);
    // prefer a region whose neutrals do not play steady, so the field is visibly set
    let loc: number;
    try {
      loc = await freeNeighbour(p, (l) => neutralDoctrine(shard.seed, shard.world.info(l)) !== 'steady');
    } catch {
      loc = await freeNeighbour(p);
    }
    const t = await post<Ticket>('/api/online/attack/start', p.token, { loc, simVersion: SIM_VERSION });
    expect(t.status).toBe(200);
    expect(t.body.defenderKind).toBe('npc');
    expect(t.body.setup.armies[1].doctrine).toBe(neutralDoctrine(shard.seed, shard.world.info(loc)));
    expect(t.body.setup.armies[0].doctrine).toBeUndefined();
    const sub = await post<{ won: boolean }>('/api/online/attack/submit', p.token, { ticket: t.body.ticket, simVersion: SIM_VERSION, ...play(t.body.setup) });
    expect(sub.status).toBe(200);
  });

  it('a world boss raid plays the default doctrine', async () => {
    const p = await join(97302);
    const shard = await shardRow(p);
    const site = must(worldBossSites(shard.world, shard.seed)[0], 'a world boss');
    await placeArmy(p, must(shard.world.neighbours(site.loc).find((n) => shard.world.info(n).passable), 'boss neighbour'), shard.id);
    const t = await post<Ticket>('/api/online/boss/start', p.token, { boss: site.boss, simVersion: SIM_VERSION });
    expect(t.status).toBe(200);
    expect(t.body.setup.armies[1].doctrine).toBe('steady');
  });
});

describe('ladder tickets carry the floor doctrine (AI-03)', () => {
  beforeEach(fresh);

  it('a chapter-2 floor (13) is fought under swarm, built the same as the client builds it, and verifies', async () => {
    const { token, pid } = await openDuellist(97311);
    await DB().prepare('UPDATE duel_profiles SET ladder_cleared = 12 WHERE player_id = ?1').bind(pid).run();
    const t = await post<{ ticket: string; setup: BattleSetup; team: Parameters<typeof ladderSetup>[1] }>('/api/duel/ladder/start', token, { floor: 13, simVersion: SIM_VERSION });
    expect(t.status).toBe(200);
    expect(t.body.setup.armies[1].doctrine).toBe('swarm');
    expect(t.body.setup.armies[1].holdField).toBe(true); // V5-052: a ladder floor never retreats
    // the shared builder on the client gives the very same setup from the same seed and team
    const floor = ladderFloor(13);
    const mine = ladderSetup(t.body.setup.seed, t.body.team, t.body.setup.armies[0].groups.map((g) => g.formation), floor);
    expect(mine.armies[1]).toEqual(t.body.setup.armies[1]);
    expect(mine.terrain).toEqual(t.body.setup.terrain);
    const r = await post('/api/duel/ladder/submit', token, { ticket: t.body.ticket, simVersion: SIM_VERSION, ...play(t.body.setup) });
    expect(r.status).toBe(200);
  });

  it('an old v1 ticket stored without a doctrine still verifies (in-flight rule, V5-040)', async () => {
    const { token, pid } = await openDuellist(97312);
    await DB().prepare('UPDATE duel_profiles SET ladder_cleared = 10 WHERE player_id = ?1').bind(pid).run();
    const t = await post<{ ticket: string; setup: BattleSetup }>('/api/duel/ladder/start', token, { floor: 11, simVersion: SIM_VERSION });
    expect(t.status).toBe(200);
    // as if issued by the pre-AI-03 server to a v1 client: no doctrine field, sim_version 1
    const old = structuredClone(t.body.setup);
    delete old.armies[1].doctrine;
    delete old.armies[1].holdField;
    await DB().prepare('UPDATE duel_tickets SET sim_version = 1, setup = ?2 WHERE id = ?1').bind(t.body.ticket, JSON.stringify(old)).run();
    const p = play(old);
    const s = replayBattle(structuredClone(old), p.orders as LoggedOrder[], p.deployOrders, 1).summary;
    const r = await post('/api/duel/ladder/submit', token, { ticket: t.body.ticket, simVersion: undefined, ...p, claim: { winner: s.winner, ticks: s.ticks, hash: s.hash } });
    expect(r.status).toBe(200);
    const row = await DB().prepare('SELECT status, sim_version FROM duel_tickets WHERE id = ?1').bind(t.body.ticket).first<{ status: string; sim_version: number }>();
    expect(row).toMatchObject({ status: 'used', sim_version: 1 });
  });

  it('validation keeps holdField (missing = absent, plays like false)', () => {
    const floor = ladderFloor(15);
    const setup = ladderSetup(77, ladderFloor(1).heroes, floor.formations, floor);
    expect(VerifyBody.parse({ setup, orders: [], claim: { winner: 0, ticks: 1 } }).setup.armies[1].holdField).toBe(true);
    const bad = structuredClone(setup) as unknown as { armies: { holdField?: unknown }[] };
    bad.armies[1].holdField = 'yes';
    expect(VerifyBody.safeParse({ setup: bad, orders: [], claim: { winner: 0, ticks: 1 } }).success).toBe(false);
  });

  it('v2 replays a holdField ladder setup to the hash of a local run', () => {
    const floor = ladderFloor(35); // hammer
    const setup = ladderSetup(4243, ladderFloor(1).heroes, floor.formations, floor);
    const p = play(setup);
    expect(replayBattle(structuredClone(setup), p.orders as LoggedOrder[], p.deployOrders, SIM_VERSION).summary.hash).toBe(p.claim.hash);
  });

  it('the frozen v1 sim replays a ladder setup the same with or without the doctrine', () => {
    const floor = ladderFloor(43); // fury
    const setup = ladderSetup(4242, ladderFloor(1).heroes, floor.formations, floor);
    expect(setup.armies[1].doctrine).toBe('fury');
    const bare = structuredClone(setup);
    delete bare.armies[1].doctrine;
    delete bare.armies[1].holdField;
    const p = play(bare);
    const a = replayBattle(structuredClone(setup), p.orders as LoggedOrder[], p.deployOrders, 1).summary;
    const b = replayBattle(structuredClone(bare), p.orders as LoggedOrder[], p.deployOrders, 1).summary;
    expect(a).toEqual(b);
  });
});
