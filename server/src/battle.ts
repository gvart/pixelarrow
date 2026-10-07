/**
 * Adapter between the HTTP API and the deterministic battle simulation in
 * ../../src/sim (imported read-only and bundled into the Worker). Keep every
 * sim-specific detail in this file so it is easy to follow sim API changes.
 *
 * A battle is fully determined by its BattleSetup (seed + both armies with
 * derived CombatStats) and the orders the non-bot side(s) issued, with ticks.
 * Bot sides re-derive their orders from the same seed, so their logged orders
 * are ignored on replay.
 *
 * Replay protocol (mirrors the client's BattleScene and tests/sim.test.ts):
 *   1. new Battle(setup)
 *   2. issue the first `deployOrders` log entries (issued during deployment,
 *      before startBattle(); default: the leading entries with tick 0)
 *   3. startBattle(), then before every step() issue the remaining entries whose
 *      tick equals battle.tick, until the battle ends or the time limit.
 */
import { z } from 'zod';
import { Battle, TICK_RATE } from '../../src/sim/battle';
import { FORMATION_TYPES } from '../../src/sim/formation';
import type { BattleResult, BattleSetup, LoggedOrder, Side } from '../../src/sim/types';

export const LIMITS = {
  maxUnitsPerSide: 64,
  maxGroupsPerSide: 16,
  maxOrders: 20_000,
  /** Seconds of battle time (the sim's default limit is 300 s). */
  maxTimeLimit: 600,
  maxBodyBytes: 1024 * 1024,
};

const num = z.number().finite().min(-1e7).max(1e7);
const int = z.number().int().min(-1).max(1e6);
const formationType = z.enum(FORMATION_TYPES as [string, ...string[]]);

/** CombatStats: required numeric core; extra/new fields pass through untouched. */
const CombatStats = z.looseObject({
  maxHp: num.positive(),
  dmg: num,
  reach: num,
  atkTime: num,
  rangedDmg: num,
  range: num,
  ammo: num,
  shotTime: num,
  accuracy: num,
  block: num,
  blockPierce: num,
  armor: num,
  morale: num,
  stamina: num,
  speed: num,
  chargeBonus: num,
  moraleShock: num,
  moraleLoss: num,
  weapon: z.string().max(32),
  shield: z.string().max(32),
  canShieldWall: z.boolean(),
  role: z.enum(['melee', 'ranged', 'hybrid']),
  abilities: z.array(z.string().max(32)).max(8).optional(),
  auras: z.array(z.string().max(32)).max(8).optional(),
});

const Army = z.object({
  units: z
    .array(
      z.looseObject({
        heroId: z.string().max(64),
        name: z.string().max(64),
        level: z.number().int().min(0).max(1000),
        group: z.number().int().min(0).max(LIMITS.maxGroupsPerSide),
        stats: CombatStats,
      }),
    )
    .min(1)
    .max(LIMITS.maxUnitsPerSide),
  groups: z
    .array(z.looseObject({ name: z.string().max(64), role: z.enum(['main', 'skirmish', 'reserve', 'flank']), formation: formationType }))
    .min(1)
    .max(LIMITS.maxGroupsPerSide),
  bot: z.boolean(),
});

const Setup = z.object({
  seed: z.number().int().min(0).max(0xffffffff),
  armies: z.tuple([Army, Army]),
  width: z.number().min(8).max(200).optional(),
  height: z.number().min(8).max(200).optional(),
  timeLimit: z.number().min(1).max(LIMITS.maxTimeLimit).optional(),
  /** Battlefield terrain grid (src/sim/terrain.ts); absent = open, flat plain. */
  terrain: z
    .object({
      w: z.number().int().min(1).max(200),
      h: z.number().int().min(1).max(200),
      cells: z.string().max(40_000),
      height: z.string().max(40_000).optional(),
      name: z.string().max(64).optional(),
    })
    .optional(),
});

export const OrderSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('form'), group: int, cx: num, cy: num, fx: num, fy: num, frontage: num, type: formationType.optional() }),
  z.object({ kind: z.literal('preset'), group: int, type: formationType }),
  z.object({ kind: z.literal('order'), group: int, order: z.enum(['hold', 'advance', 'charge', 'fallback']) }),
  z.object({ kind: z.literal('shieldwall'), group: int, on: z.boolean().optional() }),
  z.object({ kind: z.literal('loose'), group: int, on: z.boolean().optional() }),
  z.object({ kind: z.literal('detach'), unit: int }),
  z.object({ kind: z.literal('rejoin'), unit: int }),
  z.object({ kind: z.literal('assign'), unit: int, group: int }),
  z.object({ kind: z.literal('ability'), unit: int, ability: z.string().max(32) }),
  z.object({ kind: z.literal('retreat') }),
]);

export const LoggedOrderSchema = z.object({
  tick: z.number().int().min(0).max(LIMITS.maxTimeLimit * TICK_RATE),
  side: z.union([z.literal(0), z.literal(1)]),
  order: OrderSchema,
});

export const VerifyBody = z.object({
  setup: Setup,
  orders: z.array(LoggedOrderSchema).max(LIMITS.maxOrders),
  /** How many leading log entries were issued during deployment (before startBattle). */
  deployOrders: z.number().int().min(0).max(LIMITS.maxOrders).optional(),
  claim: z.object({
    winner: z.union([z.literal(0), z.literal(1), z.literal(-1)]),
    ticks: z.number().int().min(0),
    retreated: z.union([z.literal(0), z.literal(1), z.null()]).optional(),
    /** Battle.hash() at the end, if the client sends it. */
    hash: z.string().max(16).optional(),
  }),
});
export type VerifyRequest = z.infer<typeof VerifyBody>;

export interface BattleSummary {
  winner: Side | -1;
  retreated: Side | null;
  ticks: number;
  seconds: number;
  hash: string;
  sides: { alive: number; dead: number; routedOrFled: number; ko: number; kills: number }[];
}

export interface ReplayOutcome {
  summary: BattleSummary;
  result: BattleResult;
}

function summarize(b: Battle): ReplayOutcome {
  const result = b.result();
  const sides = [0, 1].map((side) => {
    const us = result.units.filter((u) => u.side === side);
    return {
      alive: us.filter((u) => u.state === 'ready').length,
      dead: us.filter((u) => u.state === 'dead').length,
      routedOrFled: us.filter((u) => u.state === 'routing' || u.state === 'fled').length,
      ko: us.filter((u) => u.ko).length,
      kills: us.reduce((n, u) => n + u.kills, 0),
    };
  });
  return {
    result,
    summary: {
      winner: result.winner,
      retreated: result.retreated ?? null,
      ticks: result.ticks,
      seconds: result.ticks / TICK_RATE,
      hash: b.hash(),
      sides,
    },
  };
}

/** Re-runs a battle headless. Throws if the sim rejects the setup. */
export function replayBattle(setup: BattleSetup, log: LoggedOrder[], deployOrders?: number): ReplayOutcome {
  const b = new Battle(setup);
  const human = (side: Side) => !setup.armies[side].bot;
  const orders = log.map((o, i) => ({ ...o, i })).filter((o) => human(o.side));
  const nDeploy = deployOrders ?? leadingTickZero(log);

  const deploy = orders.filter((o) => o.i < nDeploy);
  const battle = orders.filter((o) => o.i >= nDeploy).sort((a, b) => a.tick - b.tick || a.i - b.i);
  for (const o of deploy) b.issue(o.side, o.order);
  b.startBattle();

  const maxTicks = b.timeLimitTicks + 1;
  const ended = () => b.phase === 'ended';
  let next = 0;
  while (!ended() && b.tick <= maxTicks) {
    while (next < battle.length && battle[next].tick < b.tick) next++; // stale (should not happen)
    while (next < battle.length && battle[next].tick === b.tick) {
      b.issue(battle[next].side, battle[next].order);
      next++;
    }
    if (ended()) break;
    b.step();
    b.drainEvents(); // keep memory flat
  }
  return summarize(b);
}

function leadingTickZero(log: LoggedOrder[]): number {
  let n = 0;
  while (n < log.length && log[n].tick === 0) n++;
  return n;
}

export interface VerifyResponse {
  match: boolean;
  mismatches: string[];
  server: BattleSummary;
  /** Simulation steps run. */
  ticksSimulated: number;
  /**
   * Elapsed time of the replay. Workers only advance clocks across I/O, so in
   * production this usually reads 0; use the Worker's CPU-time metrics instead.
   */
  elapsedMs: number;
}

export function verifyBattle(req: VerifyRequest): VerifyResponse {
  const t0 = performance.now();
  // The schema checks shape and ranges; the sim's own types are the source of truth.
  const out = replayBattle(req.setup as unknown as BattleSetup, req.orders as LoggedOrder[], req.deployOrders);
  const elapsedMs = performance.now() - t0;
  const s = out.summary;
  const mismatches: string[] = [];
  if (s.winner !== req.claim.winner) mismatches.push(`winner: claimed ${req.claim.winner}, server ${s.winner}`);
  if (s.ticks !== req.claim.ticks) mismatches.push(`ticks: claimed ${req.claim.ticks}, server ${s.ticks}`);
  if (req.claim.retreated !== undefined && req.claim.retreated !== s.retreated) {
    mismatches.push(`retreated: claimed ${req.claim.retreated}, server ${s.retreated}`);
  }
  if (req.claim.hash !== undefined && req.claim.hash !== s.hash) mismatches.push(`hash: claimed ${req.claim.hash}, server ${s.hash}`);
  return { match: mismatches.length === 0, mismatches, server: s, ticksSimulated: s.ticks, elapsedMs };
}
