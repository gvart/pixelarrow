/**
 * The online battle flows end to end without a browser: the client's own
 * code (Battle, the deployment clock, the Lockstep adapter, attackSubmission)
 * driven frame by frame the way src/scenes/BattleScene.ts drives it, against
 * the real Worker (attack tickets, replay check) and the shard Durable
 * Object's duel relay over WebSockets. Frames carry a virtual delta, so a
 * 15 s deployment or a long battle takes no wall-clock time; only socket
 * delivery is awaited. scripts/online-e2e.mjs covers the same flows in two
 * real browsers.
 */
import { env, runInDurableObject } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { Battle, DT } from '../../src/sim/battle';
import type { BattleSetup, Order, Side } from '../../src/sim/types';
import { createDeployClock, foeIsReady, markStarted, pressReady, tickDeploy, type DeployAction, type DeployClock } from '../../src/online/deployClock';
import { Lockstep } from '../../src/online/lockstep';
import { attackSubmission } from '../../src/online/battle';
import type { DuelStart, ServerMsg } from '../../src/online/protocol';
import { currentSeason } from '../src/online/store';
import { shardStub } from '../src/online/context';
import { RegionDO } from '../src/region';
import type { DuelHub } from '../src/online/duel';
import { DB, fresh, freeNeighbour, join, post, sameShard, wsOnline, type Ticket, type WsClient } from './onlineHelpers';

beforeEach(fresh);

/** The battle scene's online loop (BattleScene.update / updateNet / runDeployActions) without Phaser. */
class HeadlessScene {
  readonly sim: Battle;
  readonly clock: DeployClock;
  deployOrders: number | undefined;
  private acc = 0;

  constructor(
    setup: BattleSetup,
    readonly me: Side,
    readonly ls: Lockstep | null = null,
  ) {
    // the scene works on its own copy of the setup the server sent
    this.sim = ls ? ls.sim : new Battle(JSON.parse(JSON.stringify(setup)) as BattleSetup);
    this.clock = createDeployClock(ls ? 'duel' : 'attack');
  }

  /** One rendered frame of `deltaMs`. */
  frame(deltaMs: number): void {
    const { sim, ls } = this;
    if (ls) {
      if (sim.phase === 'battle' && this.deployOrders === undefined) this.started();
      if (!this.clock.foeReady && ls.opponentReady) foeIsReady(this.clock);
    }
    if (sim.phase === 'deploy') this.run(tickDeploy(this.clock, Math.min(deltaMs, 250)));
    if (sim.phase === 'battle') {
      this.acc += Math.min(0.25, deltaMs / 1000);
      let steps = 0;
      while (this.acc >= DT && steps < 10 && sim.phase === 'battle') {
        if (ls && !ls.canStep()) {
          this.acc = Math.min(this.acc, DT);
          break;
        }
        ls?.beforeStep();
        sim.step();
        sim.drainEvents();
        this.acc -= DT;
        steps++;
      }
    }
  }

  /** The Ready button. */
  ready(): void {
    this.run(pressReady(this.clock));
  }

  order(o: Order): void {
    if (this.ls) this.ls.issue(o);
    else this.sim.issue(this.me, o);
  }

  groups(side = this.me): number[] {
    return this.sim.groups.filter((g) => g.side === side && !g.individual).map((g) => g.id);
  }

  private run(actions: DeployAction[]): void {
    for (const a of actions) {
      if (a === 'start') {
        this.deployOrders = this.sim.orderLog.length;
        this.started();
      } else if (a === 'sendReady') this.ls?.markReady();
    }
  }

  private started(): void {
    this.deployOrders ??= this.sim.orderLog.length;
    if (this.sim.phase === 'deploy') this.sim.startBattle();
    markStarted(this.clock);
  }
}

const tick = () => new Promise((r) => setTimeout(r, 1));

// ------------------------------------------------------------------ attacks

interface AttackResult {
  won: boolean;
  winner: number;
  ticks: number;
  hash: string;
}

/** Deploys (orders logged before the start), fights with orders mid-battle, submits; the server must replay it exactly. */
async function attackRound(id: number, opts: { pressReady: boolean; fps: number; consumable?: string }) {
  const p = await join(id);
  if (opts.consumable) {
    const season = await currentSeason(DB());
    await DB().prepare('INSERT INTO online_consumables (season_id, player_id, consumable_id, qty) VALUES (?1, ?2, ?3, 1)').bind(season.id, p.playerId, opts.consumable).run();
  }
  const h = await freeNeighbour(p);
  const t = await post<Ticket & { consumable: string | null }>('/api/online/attack/start', p.token, { loc: h, consumable: opts.consumable ?? null });
  expect(t.status).toBe(200);
  expect(t.body.consumable ?? null).toBe(opts.consumable ?? null);
  // the ticket travels as JSON, exactly as the client gets it
  const setup = JSON.parse(JSON.stringify(t.body.setup)) as BattleSetup;
  const s = new HeadlessScene(setup, 0);
  const [g0, g1] = s.groups();
  const delta = 1000 / opts.fps;

  // deployment: a few frames, then formation changes (logged before the start)
  for (let i = 0; i < 5; i++) s.frame(delta);
  s.order({ kind: 'preset', group: g0, type: 'wedge' });
  const f = s.sim.groups[g1].formation;
  s.order({ kind: 'form', group: g1, cx: f.cx + 2, cy: f.cy + 1, fx: f.fx, fy: f.fy, frontage: f.frontage });
  s.order({ kind: 'order', group: g0, order: 'advance' });
  if (opts.pressReady) s.ready();
  let frames = 0;
  while (s.sim.phase === 'deploy') {
    s.frame(delta);
    if (++frames > 10_000) throw new Error('deployment never ended');
  }
  // the whole log at the start (the bot's own deployment is logged too)
  expect(s.deployOrders).toBe(s.sim.orderLog.length);
  if (!opts.pressReady) expect(frames * delta).toBeGreaterThanOrEqual(15_000 - 5 * delta - 1);

  // battle: orders between frames at whatever tick they land on
  let charged = false;
  while (s.sim.phase === 'battle') {
    s.frame(delta);
    if (!charged && s.sim.tick >= 37) {
      for (const g of s.groups()) s.order({ kind: 'order', group: g, order: 'charge' });
      charged = true;
    }
    if (++frames > 200_000) throw new Error('battle never ended');
  }
  const sub = attackSubmission(s.sim, s.deployOrders!);
  expect(sub.deployOrders).toBe(3);
  expect(sub.orders.length).toBeGreaterThan(3);
  const res = await post<AttackResult & { error?: { details?: unknown } }>('/api/online/attack/submit', p.token, { ticket: t.body.ticket, ...sub });
  expect(res.body.error, JSON.stringify(res.body)).toBeUndefined();
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ winner: s.sim.winner ?? -1, ticks: s.sim.tick, hash: s.sim.hash() });
  return { sub, res: res.body };
}

describe('online attack flow (client code -> server replay)', () => {
  it('timed deployment runs out (no Ready), deploy orders + mid-battle orders, a consumable: the server verifies', async () => {
    await attackRound(970101, { pressReady: false, fps: 5, consumable: 'sharpening_stone' });
  });

  it('Ready during deployment, smooth frame rate: the server verifies', async () => {
    await attackRound(970102, { pressReady: true, fps: 60 });
  });

  it('a wrong deployment count does not replay (the count matters)', async () => {
    const p = await join(970103);
    const h = await freeNeighbour(p);
    const t = await post<Ticket>('/api/online/attack/start', p.token, { loc: h });
    const s = new HeadlessScene(t.body.setup, 0);
    const f = s.sim.groups[s.groups()[0]].formation;
    s.order({ kind: 'form', group: s.groups()[0], cx: f.cx - 3, cy: f.cy + 1, fx: f.fx, fy: f.fy, frontage: f.frontage });
    s.ready();
    while (s.sim.phase === 'battle') s.frame(50);
    const sub = attackSubmission(s.sim, s.deployOrders!);
    const res = await post<{ error: { code: string } }>('/api/online/attack/submit', p.token, { ticket: t.body.ticket, ...sub, deployOrders: 0 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('replay_mismatch');
  });
});

// ------------------------------------------------------------------ duels

function client(start: DuelStart, c: WsClient) {
  const ls = new Lockstep(new Battle(JSON.parse(JSON.stringify(start.setup)) as BattleSetup), start.side, start.duel, (m) => c.send(m), {
    turnTicks: start.turnTicks,
    delayTurns: start.delayTurns,
    hashEvery: start.hashEvery,
  });
  const seen: ServerMsg[] = [];
  const feed = (m: ServerMsg) => {
    seen.push(m);
    ls.receive(m);
  };
  c.onMessage = (m) => feed(m as unknown as ServerMsg);
  for (const m of c.msgs) feed(m as unknown as ServerMsg);
  return { ls, scene: new HeadlessScene(start.setup, start.side, ls), seen };
}

async function duelPair(ids: [number, number]) {
  const a = await join(ids[0], 'Achilles');
  const b = await join(ids[1], 'Hektor');
  await sameShard(a, b);
  const ca = await wsOnline(a.token);
  const cb = await wsOnline(b.token);
  await ca.next('welcome');
  await cb.next('welcome');
  ca.send({ type: 'challenge', to: b.playerId });
  const challenged = await cb.next('challenged');
  cb.send({ type: 'challenge_reply', id: challenged.id, accept: true });
  const sa = (await ca.next('duel_start')) as unknown as DuelStart;
  const sb = (await cb.next('duel_start')) as unknown as DuelStart;
  return { a, b, ca, cb, A: client(sa, ca), B: client(sb, cb) };
}

describe('live duel flow (two lockstep clients over the shard socket)', () => {
  it('timed deployment with withheld orders -> Ready + countdown -> go -> turns -> retreat -> verified on both', async () => {
    const { ca, cb, A, B } = await duelPair([970201, 970202]);
    const fA = A.scene;
    const fB = B.scene;
    expect(fA.me).toBe(0);
    expect(fB.me).toBe(1);

    // both deploy; each sees only their own orders
    const [a0] = fA.groups();
    const [b0, b1] = fB.groups();
    fA.order({ kind: 'preset', group: a0, type: 'wedge' });
    const fb = fB.sim.groups[b1].formation;
    fB.order({ kind: 'form', group: b1, cx: fb.cx - 2, cy: fb.cy + 1, fx: fb.fx, fy: fb.fy, frontage: fb.frontage });
    fB.order({ kind: 'preset', group: b0, type: 'shieldwall' });
    await ca.next('d_order', (m) => m.side === 0);
    await cb.next('d_order', (m) => m.side === 1);
    await cb.next('d_order', (m) => m.side === 1);
    for (let i = 0; i < 20; i++) await tick();
    expect(A.seen.filter((m) => m.type === 'd_order' && m.side === 1)).toHaveLength(0);
    expect(B.seen.filter((m) => m.type === 'd_order' && m.side === 0)).toHaveLength(0);
    expect(fA.sim.orderLog.map((o) => o.side)).toEqual([0]);
    expect(fB.sim.orderLog.map((o) => o.side)).toEqual([1, 1]);

    // A presses Ready; B never does: B's own countdown (5 fps frames) readies it, and the server says go
    fA.ready();
    await cb.next('d_ready', (m) => m.side === 0);
    let frames = 0;
    while (fA.sim.phase === 'deploy' || fB.sim.phase === 'deploy') {
      fA.frame(200);
      fB.frame(200);
      await tick();
      if (++frames > 400) throw new Error(`no go: ${fA.sim.phase} / ${fB.sim.phase}`);
    }
    expect(fB.clock.foeReady).toBe(true);
    expect(frames * 200).toBeGreaterThanOrEqual(15_000 - 1000);
    // the withheld orders arrived before go: both sims hold the same deployment
    fA.frame(0);
    fB.frame(0);
    expect(fA.deployOrders).toBe(3);
    expect(fB.deployOrders).toBe(3);
    expect(fA.sim.tick).toBe(0);
    expect(fB.sim.tick).toBe(0);
    expect(fA.sim.hash()).toBe(fB.sim.hash());
    for (const f of [fA, fB]) expect([...f.sim.orderLog].map((o) => o.side).sort()).toEqual([0, 1, 1]);
    // A's view: the go came right after B's deployment orders
    const iGo = A.seen.findIndex((m) => m.type === 'go');
    expect(A.seen.slice(0, iGo).filter((m) => m.type === 'd_order' && m.side === 1)).toHaveLength(2);

    // battle at uneven frame rates; orders mid-battle; B sounds the retreat
    let ordered = false;
    let retreated = false;
    // (bounded by wall time, not by a count of yields: round trips slow down under CPU load)
    for (let guard = 0, end = Date.now() + 45_000; Date.now() < end && !(fA.sim.phase === 'ended' && fB.sim.phase === 'ended'); guard++) {
      fA.frame(200);
      fB.frame(guard % 3 === 0 ? 250 : 40);
      if (!ordered && fA.sim.tick >= 7) {
        for (const g of fA.groups()) fA.order({ kind: 'order', group: g, order: 'advance' });
        for (const g of fB.groups()) fB.order({ kind: 'order', group: g, order: 'charge' });
        ordered = true;
      }
      if (!retreated && fB.sim.tick >= 90) {
        fB.order({ kind: 'retreat' });
        retreated = true;
      }
      if (A.ls.desync || B.ls.desync) break;
      await tick();
    }
    expect(A.ls.desync).toBeNull();
    expect(B.ls.desync).toBeNull();
    expect(fA.sim.phase).toBe('ended');
    expect(fB.sim.phase).toBe('ended');
    expect(fA.sim.tick).toBe(fB.sim.tick);
    expect(fA.sim.hash()).toBe(fB.sim.hash());
    expect(fA.sim.retreated).toBe(1);
    A.ls.finish();
    B.ls.finish();
    const ra = await ca.next('duel_result');
    const rb = await cb.next('duel_result');
    expect(ra).toMatchObject({ verified: true, winner: 0, ticks: fA.sim.tick, hash: fA.sim.hash(), mismatches: [] });
    expect(rb).toEqual(ra);
    const log = await DB().prepare("SELECT * FROM battle_log WHERE kind = 'duel' ORDER BY id DESC").first<{ verified: number; winner: number }>();
    expect(log).toMatchObject({ verified: 1, winner: 0 });
    ca.ws.close(1000);
    cb.ws.close(1000);
  }, 60_000);

  it('a deployment survives the shard object waking from hibernation; both Ready: go at once', async () => {
    const { a, ca, cb, A, B } = await duelPair([970301, 970302]);
    const [b0] = B.scene.groups();
    A.scene.ready();
    B.scene.order({ kind: 'preset', group: b0, type: 'column' });
    await cb.next('d_order', (m) => m.side === 1);
    await ca.next('d_ready', (m) => m.side === 0);
    // A fresh RegionDO on the same storage (what an evicted object wakes up as) still knows the duel.
    const stub = shardStub(env as never, { season: a.profile.season.id, id: a.profile.shard.id });
    await runInDurableObject(stub, async (_inst: RegionDO, state) => {
      const keys = [...(await state.storage.list({ prefix: 'hub:' })).keys()];
      expect(keys).toEqual([`hub:d:${A.ls.duel}`]);
      const woken = new RegionDO(state, env as never);
      await state.blockConcurrencyWhile(async () => undefined);
      const d = (woken as unknown as { hub: DuelHub }).hub.duels.get(A.ls.duel)!;
      expect(d.phase).toBe('deploy');
      expect(d.ready).toEqual([true, false]);
      expect(d.log.map((o) => o.side)).toEqual([1]);
    });
    B.scene.ready();
    await ca.next('go');
    await cb.next('go');
    A.scene.frame(16);
    B.scene.frame(16);
    expect(A.scene.sim.phase).toBe('battle');
    expect(A.scene.sim.orderLog).toEqual(B.scene.sim.orderLog);
    expect(A.scene.sim.hash()).toBe(B.scene.sim.hash());
    await runInDurableObject(stub, async (_inst: RegionDO, state) => {
      expect((await state.storage.list({ prefix: 'hub:' })).size).toBe(0);
    });
    // leaving ends the duel for both
    ca.send({ type: 'leave_duel', duel: A.ls.duel });
    await cb.next('duel_abort');
    ca.ws.close(1000);
    cb.ws.close(1000);
  }, 30_000);
});
