/**
 * WebSocket protocol of the online world (presence, duel lobby, lockstep
 * relay), shared by the client and the RegionDO. See server/README.md.
 *
 * Deployment: duel_start opens a DEPLOY_MS deployment (both clients count
 * down). A d_order is echoed to its sender only (applied when it comes back);
 * the opponent's deployment stays on the server. When both sides sent
 * d_ready, or the time plus DEPLOY_GRACE_MS ran out, each client gets the
 * other side's deployment orders as d_order (still before the start), then
 * go. Deployment orders only touch their own side, so "mine, then theirs"
 * gives both clients and the server's replay the same state. Clients send
 * d_ready by themselves when their countdown reaches zero.
 *
 * Lockstep: the battle is cut into turns of TURN_TICKS sim ticks. The server
 * seals turn n (the orders both players sent since the last seal, in arrival
 * order, stamped with tick n * TURN_TICKS) once both clients reported reaching
 * turn n - DELAY_TURNS. A client may only simulate turn n after it holds the
 * sealed turn n, so both run the same orders at the same ticks. At 20 Hz,
 * TURN_TICKS 2 and DELAY_TURNS 2 give an input delay of ~200-300 ms and leave
 * ~200 ms of round trip before anyone stalls.
 */
import type { BattleSetup, Order, Side } from '../sim/types';
import type { Hero } from '../data/units';

export const TURN_TICKS = 2;
export const DELAY_TURNS = 2;
/** Clients attach Battle.hash() to every HASH_EVERY-th turn report. */
export const HASH_EVERY = 10;
/** A challenge nobody answered lapses after this long. */
export const CHALLENGE_TTL_MS = 30_000;
/** Most orders one side may put into a single turn (anti-flood). */
export const MAX_ORDERS_PER_TURN = 16;
export const MAX_DUEL_ORDERS = 6000;
/** Timed deployment of every online battle (src/online/deployClock.ts). */
export { DEPLOY_MS } from './deployClock';
/**
 * The server starts a duel this long after the deployment time is up even if
 * a client never said ready (its clock is behind, or it went quiet): the
 * clients send d_ready themselves when their countdown ends.
 */
export const DEPLOY_GRACE_MS = 3000;

export interface PresencePlayer {
  id: number;
  name: string;
  /** In a duel right now (cannot be challenged). */
  busy?: boolean;
}

export interface SealedOrder {
  side: Side;
  order: Order;
}

export type ClientMsg =
  | { type: 'ping'; t?: unknown }
  | { type: 'who' }
  /** consumable: at most one battle consumable (src/data/consumables.ts), spent when the duel starts. */
  | { type: 'challenge'; to: number; consumable?: string | null }
  | { type: 'challenge_cancel'; id: string }
  | { type: 'challenge_reply'; id: string; accept: boolean; consumable?: string | null }
  /** Deployment order (form, preset, order, shieldwall, loose, assign): echoed to the sender, revealed to the opponent at go. */
  | { type: 'd_order'; duel: string; order: Order }
  | { type: 'd_ready'; duel: string }
  /** Battle order: goes into the next sealed turn. */
  | { type: 'cmd'; duel: string; order: Order }
  /** "I am about to simulate turn n"; hash = Battle.hash() at that point on hash turns. */
  | { type: 'reach'; duel: string; n: number; hash?: string }
  | { type: 'end'; duel: string; winner: Side | -1; ticks: number; hash: string }
  | { type: 'leave_duel'; duel: string };

export interface DuelStart {
  type: 'duel_start';
  duel: string;
  side: Side;
  setup: BattleSetup;
  heroes: [Hero[], Hero[]];
  names: [string, string];
  turnTicks: number;
  delayTurns: number;
  hashEvery: number;
  /** Deployment length: both clients show this countdown; ready from both (or the time) starts the battle. */
  deployMs?: number;
  /** Ranked and unranked matches (src/duel/protocol.ts); absent for a friendly duel. */
  mode?: 'ranked' | 'unranked';
  /** Sent again to a player who reconnected: the sealed turns follow, the client fast-forwards. */
  resume?: boolean;
}

/**
 * Live army movement on the region map (docs/DESIGN_V2.md "Online battle
 * rules"). Locations are region ids (`loc`, src/online/world.ts). The server
 * only tells a player about armies inside their fog of war: a march's path
 * holds just the regions the receiver can see (with their arrival times; a
 * gap between two entries means the army is out of sight in between), except
 * for the receiver's own and clan mates' armies, which are always shown whole.
 */
export type LiveArmyMsg =
  /**
   * An army set out: it enters path[i] at at[i] and leaves it at until[i]
   * (null: it stops there). Times are ms on the server clock; now = server time.
   */
  | { type: 'army_march'; player: number; name: string; clan: number | null; path: number[]; at: number[]; until: (number | null)[]; now: number }
  /** An army stands in a region (halted, moved into a conquered region, or a march ended in sight). */
  | { type: 'army_pos'; player: number; name: string; clan: number | null; loc: number; now: number }
  /** A march reached its last region (pushed by the shard at the arrival time). */
  | { type: 'army_arrive'; player: number; loc: number; now: number }
  /** The army went out of the receiver's sight. */
  | { type: 'army_hide'; player: number; now: number };

export type ServerMsg =
  | LiveArmyMsg
  | { type: 'welcome'; region: string; you: PresencePlayer; players: PresencePlayer[] }
  | { type: 'join'; player: PresencePlayer }
  | { type: 'leave'; player: PresencePlayer }
  | { type: 'presence'; players: PresencePlayer[] }
  | { type: 'pong'; t: unknown; now: number }
  | { type: 'error'; message: string; code?: string }
  | { type: 'challenge_sent'; id: string; to: PresencePlayer }
  | { type: 'challenged'; id: string; from: PresencePlayer }
  | { type: 'challenge_closed'; id: string; reason: 'declined' | 'cancelled' | 'expired' | 'unavailable' }
  | DuelStart
  | { type: 'd_order'; duel: string; seq: number; side: Side; order: Order }
  | { type: 'd_ready'; duel: string; side: Side }
  | { type: 'go'; duel: string }
  | { type: 'turn'; duel: string; n: number; tick: number; orders: SealedOrder[] }
  | { type: 'desync'; duel: string; n: number; hashes: [string, string] }
  | { type: 'duel_result'; duel: string; winner: Side | -1; ticks: number; hash: string; verified: boolean; mismatches: string[] }
  | { type: 'duel_abort'; duel: string; reason: string };
