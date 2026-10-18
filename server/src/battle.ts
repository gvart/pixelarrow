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
 * The replay itself (and its protocol) lives zod-free in src/sim/replay.ts,
 * re-exported here, so the client and root tests can run it too.
 */
import { z } from 'zod';
import { TICK_RATE } from '../../src/sim/battle';
import { FORMATION_TYPES } from '../../src/sim/formation';
import { DEFAULT_DOCTRINE, DOCTRINE_IDS, GROUP_ORDERS, WORK_TYPES, WORKS_MAX } from '../../src/sim/types';
import type { BattleSetup, LoggedOrder } from '../../src/sim/types';
import { replayBattle, type BattleSummary } from '../../src/sim/replay';
import { checkSimVersion, SIM_VERSION, SimVersionField } from './simVersion';

export { replayBattle } from '../../src/sim/replay';
export type { ReplayOutcome } from '../../src/sim/replay';

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
/**
 * The sim's own list, so a shape enters the schema only with its rules: `orb`
 * (formations-orders.md R2) arrived with FO-02.
 */
const formationType = z.enum(FORMATION_TYPES as [string, ...string[]]);
const groupOrder = z.enum(GROUP_ORDERS);
const workType = z.enum(WORK_TYPES);
const worksCount = z.number().int().min(0).max(WORKS_MAX);

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
  // Unit classes (src/data/classes.ts): riders, chariots and animals. Optional; absent = a man on foot.
  cls: z.string().max(32).optional(),
  mount: z.enum(['horse', 'chariot']).optional(),
  kind: z.enum(['animal']).optional(),
  beast: z.string().max(16).optional(),
  radius: num.min(0.05).max(2).optional(),
  routAt: num.min(0).max(1).optional(),
  pursuit: num.min(0).max(5).optional(),
  scythe: num.min(0).max(5).optional(),
  armorPierce: num.min(0).max(1).optional(),
  // Mythical beasts and world bosses (src/data/beasts.ts): src/sim/myth.ts runs them.
  boss: z.string().max(16).optional(),
  // Item powers, set specials and named extras (src/sim/powers.ts; unknown ids are ignored there).
  powers: z.array(z.object({ id: z.string().max(32), grade: z.number().int().min(0).max(1) })).max(16).optional(),
  setSpecials: z.array(z.string().max(32)).max(8).optional(),
  missileWard: num.min(0).max(0.9).optional(),
  shroud: num.min(0).max(0.9).optional(),
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
        /** World bosses carry their wounds between clan attacks (absent = full HP). */
        hp0: num.min(0).optional(),
        /** The band's captain, a standard bearer (ai-doctrines.md R6). */
        captain: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(LIMITS.maxUnitsPerSide),
  groups: z
    .array(z.looseObject({ name: z.string().max(64), role: z.enum(['main', 'skirmish', 'reserve', 'flank']), formation: formationType }))
    .min(1)
    .max(LIMITS.maxGroupsPerSide),
  bot: z.boolean(),
  /** War horns carried (a battle consumable): each is one army-wide rally (the `horn` order). */
  horn: z.number().int().min(0).max(3).optional(),
  /** The bot's doctrine (ai-doctrines.md); absent = steady, today's AI. */
  doctrine: z.enum(DOCTRINE_IDS).default(DEFAULT_DOCTRINE),
  /** The bot never retreats (ladder floors, V5-052); absent = false. */
  holdField: z.boolean().optional(),
  /** Field works allowance in segments (field-works.md R3); absent = none. */
  works: z.object({ stakes: worksCount, ditch: worksCount, laager: worksCount }).optional(),
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
  z.object({ kind: z.literal('order'), group: int, order: groupOrder }),
  z.object({ kind: z.literal('shieldwall'), group: int, on: z.boolean().optional() }),
  z.object({ kind: z.literal('loose'), group: int, on: z.boolean().optional() }),
  z.object({ kind: z.literal('detach'), unit: int }),
  z.object({ kind: z.literal('rejoin'), unit: int }),
  z.object({ kind: z.literal('assign'), unit: int, group: int }),
  z.object({ kind: z.literal('ability'), unit: int, ability: z.string().max(32) }),
  z.object({ kind: z.literal('retreat') }),
  z.object({ kind: z.literal('horn') }),
  // Sim train 2 (src/sim/types.ts Order): facing, focus fire and field works.
  z.object({ kind: z.literal('face'), group: int, fx: num, fy: num }),
  z.object({ kind: z.literal('focus'), group: int, target: int }),
  z.object({ kind: z.literal('work'), type: workType, x: num, y: num, fx: num, fy: num }),
  z.object({ kind: z.literal('unwork'), x: num, y: num }),
]);

export const LoggedOrderSchema = z.object({
  tick: z.number().int().min(0).max(LIMITS.maxTimeLimit * TICK_RATE),
  side: z.union([z.literal(0), z.literal(1)]),
  order: OrderSchema,
});

export const VerifyBody = z.object({
  /** The client's src/sim/version.ts SIM_VERSION; anything else is 426. */
  simVersion: SimVersionField,
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
type VerifyRequest = z.infer<typeof VerifyBody>;

interface VerifyResponse {
  match: boolean;
  /** The sim version the server replayed with. */
  simVersion: number;
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

/** Throws 426 `sim_version_unsupported` unless the client runs SIM_VERSION (before any replay). */
export function verifyBattle(req: VerifyRequest): VerifyResponse {
  checkSimVersion(req.simVersion);
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
  return { match: mismatches.length === 0, simVersion: SIM_VERSION, mismatches, server: s, ticksSimulated: s.ticks, elapsedMs };
}
