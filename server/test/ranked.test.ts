/**
 * Live ranked and unranked duels (docs/DUELS.md "Ranked live"): the global
 * queue (MatchmakerDO over /ws/duel), a match on its DuelDO (/ws/duel/<id>)
 * played by two headless lockstep clients, the settlement (rating, Glory,
 * XP, idempotent), reconnects within 30 s, abandons and the queue cooldown.
 */
import { env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Battle } from '../../src/sim/battle';
import type { BattleSetup } from '../../src/sim/types';
import { Lockstep } from '../../src/online/lockstep';
import type { DuelStart, ServerMsg } from '../../src/online/protocol';
import { DUEL_RULES } from '../../src/duel/rules';
import { RANKED, matchWindow } from '../../src/duel/rating';
import { seasonId } from '../../src/duel/season';
import type { MatchReport } from '../../src/duel/protocol';
import type { DuelDO } from '../src/duel/duelDO';
import type { MatchmakerDO } from '../src/duel/matchmaker';
import { settleMatch, type MatchInit, type MatchOutcome } from '../src/duel/live';
import { devLogin } from './helpers';
import { DB, fresh, getJson, post, wsPath, type WsClient } from './onlineHelpers';

beforeEach(fresh);

const tick = () => new Promise((r) => setTimeout(r, 1));

interface Duellist {
  token: string;
  pid: number;
}

/** A player with a duel profile; `level5` gives the XP of duel level 5 (ranked). */
async function duellist(tg: number, opts: { level5?: boolean; rating?: number } = {}): Promise<Duellist> {
  const { token, playerId } = await devLogin(tg, `D${tg}`);
  expect((await post('/api/duel/profile', token)).status).toBe(200);
  if (opts.level5) await DB().prepare('UPDATE duel_profiles SET xp = 500 WHERE player_id = ?1').bind(playerId).run();
  if (opts.rating !== undefined) {
    await DB()
      .prepare("INSERT INTO duel_ratings (player_id, ladder, rating, rd, vol, games, updated_at, season, played_at) VALUES (?1, 'live', ?2, 80, 0.06, 20, 0, ?3, ?4)")
      .bind(playerId, opts.rating, seasonId(Date.now()), Date.now())
      .run();
  }
  return { token, pid: playerId };
}

const queueSocket = async (p: Duellist) => {
  const c = await wsPath(p.token, '/ws/duel');
  await c.next('mm_welcome');
  return c;
};

const mm = () => env.MATCHMAKER.get(env.MATCHMAKER.idFromName('global'));
const duelStub = (id: string) => env.DUEL.get(env.DUEL.idFromName(id));

/** Both players queue; returns the match id and who got which side. */
async function matched(a: Duellist, b: Duellist, mode: 'ranked' | 'unranked' = 'ranked') {
  const qa = await queueSocket(a);
  const qb = await queueSocket(b);
  qa.send({ type: 'queue', mode });
  await qa.next('queued');
  qb.send({ type: 'queue', mode });
  const fa = await qa.next('match_found');
  const fb = await qb.next('match_found');
  expect(fa.match).toBe(fb.match);
  expect([fa.side, fb.side].sort()).toEqual([0, 1]);
  qa.ws.close(1000);
  qb.ws.close(1000);
  return String(fa.match);
}

/** A headless lockstep client on the match socket (the scene's loop without Phaser). */
async function joinMatch(p: Duellist, match: string) {
  const c = await wsPath(p.token, `/ws/duel/${match}`);
  const start = (await c.next('duel_start')) as unknown as DuelStart;
  const ls = new Lockstep(new Battle(JSON.parse(JSON.stringify(start.setup)) as BattleSetup), start.side, start.duel, (m) => c.send(m), start);
  const feed = (m: Record<string, unknown>) => ls.receive(m as unknown as ServerMsg);
  c.onMessage = feed;
  for (const m of c.msgs) feed(m);
  return { c, ls, start };
}

type Client = Awaited<ReturnType<typeof joinMatch>>;

/** Both ready, side 0 sounds the retreat at once: the battle runs to its end on both clients, then both report. */
async function fight(A: Client, B: Client): Promise<void> {
  A.ls.markReady();
  B.ls.markReady();
  for (let i = 0; i < 200 && (A.ls.sim.phase === 'deploy' || B.ls.sim.phase === 'deploy'); i++) await tick();
  expect(A.ls.sim.phase).toBe('battle');
  const s0 = A.start.side === 0 ? A : B;
  s0.ls.issue({ kind: 'retreat' });
  for (let guard = 0; guard < 50_000 && !(A.ls.sim.phase === 'ended' && B.ls.sim.phase === 'ended'); guard++) {
    A.ls.pump(40);
    B.ls.pump(40);
    await tick();
  }
  expect(A.ls.sim.phase).toBe('ended');
  expect(B.ls.sim.hash()).toBe(A.ls.sim.hash());
  A.ls.finish();
  B.ls.finish();
}

const report = async (c: WsClient) => (await c.next('match_result')).report as MatchReport;

describe('duel queue (MatchmakerDO)', () => {
  it('ranked needs duel level 5; unranked does not; the team must fit the budget', async () => {
    const low = await duellist(980101);
    const q = await queueSocket(low);
    q.send({ type: 'queue', mode: 'ranked' });
    expect(await q.next('unqueued')).toMatchObject({ reason: 'locked' });
    q.send({ type: 'queue', mode: 'unranked' });
    expect(await q.next('queued')).toMatchObject({ mode: 'unranked' });
    q.send({ type: 'cancel' });
    expect(await q.next('unqueued')).toMatchObject({ reason: 'cancelled' });
    expect((await runInDurableObject(mm(), (i: MatchmakerDO) => i.waiting())).find((w) => w.pid === low.pid)).toBeUndefined();
    // over the 150-point budget: refused
    const heroes = await DB().prepare('SELECT id, data FROM duel_heroes WHERE player_id = ?1').bind(low.pid).all<{ id: string; data: string }>();
    for (const h of heroes.results) {
      const hero = JSON.parse(h.data);
      hero.level = 10;
      for (const it of Object.values(hero.equip) as { rarity: string }[]) it.rarity = 'legendary';
      await DB().prepare('UPDATE duel_heroes SET data = ?2 WHERE id = ?1').bind(h.id, JSON.stringify(hero)).run();
    }
    q.send({ type: 'queue', mode: 'unranked' });
    expect(await q.next('unqueued')).toMatchObject({ reason: 'over_budget' });
    q.ws.close(1000);
    const card = await getJson<{ unlocked: boolean; unlockLevel: number; league: unknown; placements: { played: number; of: number } }>('/api/duel/ranked', low.token);
    expect(card.body).toMatchObject({ unlocked: false, unlockLevel: DUEL_RULES.rankedLevel, league: null, placements: { played: 0, of: 10 } });
  });

  it('pairs close ratings at once; far ones wait for the window to widen', async () => {
    const a = await duellist(980111, { level5: true, rating: 2400 });
    const b = await duellist(980112, { level5: true, rating: 1500 });
    const qa = await queueSocket(a);
    const qb = await queueSocket(b);
    qa.send({ type: 'queue', mode: 'ranked' });
    await qa.next('queued');
    qb.send({ type: 'queue', mode: 'ranked' });
    await qb.next('queued');
    await runDurableObjectAlarm(mm());
    const waiting = await runInDurableObject(mm(), (i: MatchmakerDO) => i.waiting());
    expect(waiting.map((w) => w.pid).sort()).toEqual([a.pid, b.pid].sort());
    expect(matchWindow('ranked', 0)).toBeLessThan(900);
    // after the open-window wait anyone will do: back-date both entries, the next pairing matches them
    await runInDurableObject(mm(), (i: MatchmakerDO) => {
      for (const w of (i as unknown as { queue: { since: number }[] }).queue) w.since -= RANKED.window.ranked.openAfterMs;
    });
    await runDurableObjectAlarm(mm());
    const fa = await qa.next('match_found');
    expect(fa).toMatchObject({ mode: 'ranked', opponent: { name: `D980112`, league: { id: 'gold' } } });
    await qb.next('match_found');
    expect(await runInDurableObject(mm(), (i: MatchmakerDO) => i.waiting())).toEqual([]);
    // a player in a live match cannot queue again
    qa.send({ type: 'queue', mode: 'unranked' });
    expect(await qa.next('unqueued')).toMatchObject({ reason: 'busy' });
    qa.ws.close(1000);
    qb.ws.close(1000);
  });
});

describe('a ranked match (DuelDO)', () => {
  it('lockstep battle -> server replay -> ratings, Glory and XP for both, written once', async () => {
    const a = await duellist(980201, { level5: true });
    const b = await duellist(980202, { level5: true });
    const match = await matched(a, b);
    const card = await getJson<{ match: { id: string } | null }>('/api/duel/ranked', a.token);
    expect(card.body.match).toMatchObject({ id: match, mode: 'ranked' });
    const A = await joinMatch(a, match);
    const B = await joinMatch(b, match);
    expect(A.start.mode).toBe('ranked');
    expect(A.start.resume).toBeUndefined();
    await fight(A, B);
    const ra = await report(A.c);
    const rb = await report(B.c);
    const winner = A.ls.sim.winner;
    expect(ra).toMatchObject({ match, end: 'battle', verified: true, winner, abandoned: false, placements: { played: 1, of: 10 } });
    const mine = ra.side === winner ? ra : rb;
    const theirs = ra.side === winner ? rb : ra;
    expect(mine.rating!.after).toBeGreaterThan(mine.rating!.before);
    expect(theirs.rating!.after).toBeLessThan(theirs.rating!.before);
    expect(mine.glory).toBe(RANKED.glory.ranked.win);
    expect(theirs.glory).toBe(RANKED.glory.ranked.loss);
    expect(mine.xp.length).toBeGreaterThan(0);
    expect(mine.league).toEqual({ before: null, after: null }); // placements
    const row = await DB().prepare('SELECT status, verified, ending, delta_a, orders FROM duel_matches WHERE id = ?1').bind(match).first<{ status: string; verified: number; ending: string; delta_a: number; orders: string }>();
    expect(row).toMatchObject({ status: 'done', verified: 1, ending: 'battle' });
    expect(JSON.parse(row!.orders).length).toBeGreaterThan(0);
    const glory = async (p: Duellist) => (await DB().prepare('SELECT glory, battles FROM duel_profiles WHERE player_id = ?1').bind(p.pid).first<{ glory: number; battles: number }>())!;
    const before = [await glory(a), await glory(b)];
    expect(before[0].battles).toBe(1);
    // settling again (a retry, a second end) pays nothing more and returns the same reports
    const init = await runInDurableObject(duelStub(match), (_i: DuelDO, state) => state.storage.get<MatchInit>('match'));
    const again = await settleMatch(DB(), init!, { end: 'battle', winner: 0, verified: true, ticks: 1, hash: 'x', log: [], deployOrders: 0, abandoned: [false, false] } as MatchOutcome, Date.now());
    expect(again[ra.side]).toEqual(ra);
    expect([await glory(a), await glory(b)]).toEqual(before);
    const rating = await DB().prepare("SELECT games, rating FROM duel_ratings WHERE player_id = ?1 AND ladder = 'live'").bind(a.pid).first<{ games: number; rating: number }>();
    expect(rating!.games).toBe(1);
    // a socket opened after the end gets the report again
    const late = await wsPath(a.token, `/ws/duel/${match}`);
    expect((await report(late)).match).toBe(match);
    expect((await getJson<{ report: MatchReport }>(`/api/duel/match/${match}`, b.token)).body.report.side).toBe(rb.side);
    for (const c of [A.c, B.c, late]) c.ws.close(1000);
  }, 60_000);

  it('unranked: no rating, half the Glory', async () => {
    const a = await duellist(980211);
    const b = await duellist(980212);
    const match = await matched(a, b, 'unranked');
    const A = await joinMatch(a, match);
    const B = await joinMatch(b, match);
    await fight(A, B);
    const ra = await report(A.c);
    expect(ra.rating).toBeNull();
    expect(ra.glory).toBe(ra.winner === ra.side ? RANKED.glory.unranked.win : RANKED.glory.unranked.loss);
    expect(await DB().prepare('SELECT 1 FROM duel_ratings WHERE player_id = ?1').bind(a.pid).first()).toBeNull();
    A.c.ws.close(1000);
    B.c.ws.close(1000);
  }, 60_000);

  it('reconnect within 30 s resumes with the sealed log; gone for 30 s is a loss and an abandon; 3 abandons: a cooldown', async () => {
    const a = await duellist(980301, { level5: true });
    const b = await duellist(980302, { level5: true });
    // b already left two matches today
    const now = Date.now();
    await DB().prepare('INSERT INTO duel_queue_state (player_id, abandons, updated_at) VALUES (?1, ?2, ?3)').bind(b.pid, JSON.stringify([now - 3_600_000, now - 60_000]), now).run();
    const match = await matched(a, b);
    const A = await joinMatch(a, match);
    const B = await joinMatch(b, match);
    A.ls.markReady();
    B.ls.markReady();
    for (let i = 0; i < 200 && A.ls.sim.phase === 'deploy'; i++) await tick();
    // Turns are sealed by socket round trips, not by wall time: step until both
    // sides are past tick 10 (a fixed number of 1 ms waits is too few under load).
    for (let guard = 0; guard < 50_000 && (A.ls.sim.tick <= 10 || B.ls.sim.tick <= 10); guard++) {
      A.ls.pump(10);
      B.ls.pump(10);
      await tick();
    }
    expect(A.ls.sim.tick).toBeGreaterThan(10);
    // A drops: B hears of it, A comes back and gets every sealed turn again
    A.c.ws.close(1000);
    await B.c.next('peer', (m) => m.online === false);
    const A2 = await joinMatch(a, match);
    expect(A2.start.resume).toBe(true);
    await B.c.next('peer', (m) => m.online === true);
    await A2.c.next('go');
    await A2.c.next('turn', (m) => Number(m.n) >= A.ls.sim.tick / 2 - 1);
    A2.ls.pump();
    expect(A2.ls.sim.phase).toBe('battle');
    expect(A2.ls.sim.tick).toBeGreaterThanOrEqual(A.ls.sim.tick);
    // B goes and does not come back: past the window the alarm settles it
    B.c.ws.close(1000);
    await A2.c.next('peer', (m) => m.online === false);
    await runInDurableObject(duelStub(match), (i: DuelDO) => {
      const away = (i as unknown as { away: (number | null)[] }).away;
      const side = B.start.side;
      away[side] = Date.now() - RANKED.reconnectMs - 1;
    });
    await runDurableObjectAlarm(duelStub(match));
    const r = await report(A2.c);
    expect(r).toMatchObject({ end: 'forfeit', winner: A.start.side, abandoned: false, glory: RANKED.glory.ranked.win });
    expect(r.rating!.after).toBeGreaterThan(r.rating!.before);
    const q = await DB().prepare('SELECT cooldown_until, strikes FROM duel_queue_state WHERE player_id = ?1').bind(b.pid).first<{ cooldown_until: number; strikes: number }>();
    expect(q!.strikes).toBe(1);
    expect(q!.cooldown_until).toBeGreaterThan(Date.now() + RANKED.cooldownMs - 60_000);
    const qb = await queueSocket(b);
    qb.send({ type: 'queue', mode: 'unranked' });
    expect(await qb.next('unqueued')).toMatchObject({ reason: 'cooldown' });
    const card = await getJson<{ cooldownUntil: number; games: number }>('/api/duel/ranked', b.token);
    expect(card.body.cooldownUntil).toBe(q!.cooldown_until);
    expect(card.body.games).toBe(1);
    qb.ws.close(1000);
    A2.c.ws.close(1000);
  }, 60_000);

  it('only the two players may open the match socket; nobody joining in time voids nothing but loses for both', async () => {
    const a = await duellist(980401, { level5: true });
    const b = await duellist(980402, { level5: true });
    const c = await duellist(980403);
    const match = await matched(a, b);
    const res = await (await import('cloudflare:test')).SELF.fetch(`https://test.pixelarrow.local/ws/duel/${match}`, { headers: { upgrade: 'websocket', 'sec-websocket-protocol': `pixelarrow.v1, ${c.token}` } });
    expect(res.status).toBe(403);
    // neither connects: past the join window the match is void, both abandoned, nobody rated
    await runInDurableObject(duelStub(match), (i: DuelDO) => {
      const away = (i as unknown as { away: number[] }).away;
      away[0] = away[1] = Date.now() - RANKED.reconnectMs - 1;
    });
    await runDurableObjectAlarm(duelStub(match));
    await vi.waitFor(async () => expect((await DB().prepare('SELECT status FROM duel_matches WHERE id = ?1').bind(match).first<{ status: string }>())!.status).toBe('void'));
    expect(await DB().prepare('SELECT 1 FROM duel_ratings WHERE player_id IN (?1, ?2)').bind(a.pid, b.pid).first()).toBeNull();
    const q = await DB().prepare('SELECT abandons FROM duel_queue_state WHERE player_id = ?1').bind(a.pid).first<{ abandons: string }>();
    expect(JSON.parse(q!.abandons)).toHaveLength(1);
  }, 60_000);
});
