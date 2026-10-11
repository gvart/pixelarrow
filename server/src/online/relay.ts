/**
 * The lockstep relay of one live duel (no Durable Object APIs here, so it can
 * be unit-tested). Shared by the friendly duels of a shard (DuelHub in
 * server/src/online/duel.ts, inside the RegionDO) and the ranked and unranked
 * matches (DuelDO, server/src/duel/duelDO.ts). Protocol: src/online/protocol.ts.
 *
 * - Deployment (timed): a d_order is echoed to its sender only; the opponent's
 *   deployment stays secret until go. When both sent d_ready, or the
 *   deployment time plus grace is over (relayTick), each player gets the
 *   other side's deployment orders (as d_order, still in the deploy phase),
 *   then go, then turns 0..DELAY_TURNS-1 pre-sealed. Deployment orders only
 *   touch their own side (DEPLOY_KINDS), so applying "mine, then theirs" on
 *   both clients and the log's order on the server give the same state.
 * - Battle: cmd orders queue for the next sealed turn; turn n + DELAY_TURNS is
 *   sealed when both players reported reaching turn n. Every order is logged
 *   with tick = turn * TURN_TICKS, exactly as the clients apply it.
 * - Hashes ride on reach messages every HASH_EVERY turns; differing hashes for
 *   the same turn end the duel with `desync`.
 * - end: the server replays the whole log (src/sim) and answers duel_result.
 *   An end whose replay runs past the sealed turns is refused: a client may
 *   not cut a battle short.
 * - Reconnect: relayResume() is everything a player who comes back needs to
 *   rebuild the battle (duel_start, the deployment, go, every sealed turn).
 */
import { OrderSchema, replayBattle, type ReplayOutcome } from '../battle';
import type { Hero } from '../../../src/data/units';
import type { BattleSetup, LoggedOrder, Order, Side } from '../../../src/sim/types';
import {
  DELAY_TURNS,
  DEPLOY_GRACE_MS,
  DEPLOY_MS,
  HASH_EVERY,
  MAX_DUEL_ORDERS,
  MAX_ORDERS_PER_TURN,
  TURN_TICKS,
  type ClientMsg,
  type DuelStart,
  type SealedOrder,
  type ServerMsg,
} from '../../../src/online/protocol';

export interface Out {
  to: number;
  msg: ServerMsg;
}

export interface DuelState {
  id: string;
  players: [number, number];
  names: [string, string];
  setup: BattleSetup;
  phase: 'deploy' | 'battle' | 'ended';
  log: LoggedOrder[];
  deployOrders: number;
  ready: [boolean, boolean];
  seq: number;
  /** Next turn to seal. */
  next: number;
  reached: [number, number];
  pending: SealedOrder[];
  pendingBySide: [number, number];
  hashes: Map<number, [string | undefined, string | undefined]>;
  createdAt: number;
  /** The battle starts by itself at this time (deployment time plus grace). */
  deployUntil: number;
  result: Extract<ServerMsg, { type: 'duel_result' }> | null;
}

export type RelayMsg = Extract<ClientMsg, { type: 'd_order' | 'd_ready' | 'cmd' | 'reach' | 'end' }>;

export interface RelayStep {
  out: Out[];
  /** The duel is over: a desync, or the verified result (in d.result, with the server's replay). */
  ended?: 'desync' | 'result';
  replay?: ReplayOutcome;
}

/**
 * Orders allowed during a duel's deployment: each changes only its own side's
 * groups and men (no new groups, no randomness), so the two sides' deployment
 * orders commute and can be revealed at go without changing the outcome.
 */
export const DEPLOY_KINDS: ReadonlySet<Order['kind']> = new Set(['form', 'preset', 'order', 'shieldwall', 'loose', 'assign']);

export function newRelay(id: string, players: [number, number], names: [string, string], setup: BattleSetup, now: number, deployMs = DEPLOY_MS): DuelState {
  return {
    id,
    players,
    names,
    setup,
    phase: 'deploy',
    log: [],
    deployOrders: 0,
    ready: [false, false],
    seq: 0,
    next: 0,
    reached: [-1, -1],
    pending: [],
    pendingBySide: [0, 0],
    hashes: new Map(),
    createdAt: now,
    deployUntil: now + deployMs + DEPLOY_GRACE_MS,
    result: null,
  };
}

export function both(d: DuelState, msg: ServerMsg): Out[] {
  return [{ to: d.players[0], msg }, { to: d.players[1], msg }];
}

/** The duel_start a side gets (the deployment countdown is what is left of it at `now`). */
export function startMsg(d: DuelState, side: Side, heroes: [Hero[], Hero[]], now: number, extra: Partial<DuelStart> = {}): DuelStart {
  const deployMs = d.phase === 'deploy' ? Math.max(0, d.deployUntil - DEPLOY_GRACE_MS - now) : 0;
  return { type: 'duel_start', duel: d.id, side, setup: d.setup, heroes, names: d.names, turnTicks: TURN_TICKS, delayTurns: DELAY_TURNS, hashEvery: HASH_EVERY, deployMs, ...extra };
}

/** Seals the next turn with the orders that came in since the last one. */
export function relaySeal(d: DuelState): Out[] {
  const n = d.next++;
  const tick = n * TURN_TICKS;
  const orders = d.pending;
  d.pending = [];
  d.pendingBySide = [0, 0];
  for (const o of orders) d.log.push({ tick, side: o.side, order: o.order });
  return both(d, { type: 'turn', duel: d.id, n, tick, orders });
}

/**
 * Deployment over: each player now gets the opponent's (withheld)
 * deployment orders, then go, and the first DELAY_TURNS turns sealed empty.
 */
export function relayStart(d: DuelState): Out[] {
  d.phase = 'battle';
  d.deployOrders = d.log.length;
  const out: Out[] = [];
  for (const side of [0, 1] as Side[]) {
    const other = d.players[1 - side];
    d.log.forEach((o, seq) => {
      if (o.side === side) out.push({ to: other, msg: { type: 'd_order', duel: d.id, seq, side, order: o.order } });
    });
  }
  out.push(...both(d, { type: 'go', duel: d.id }));
  for (let i = 0; i < DELAY_TURNS; i++) out.push(...relaySeal(d));
  return out;
}

/** Starts the duel if its deployment time is over (call from an alarm; messages call it too). */
export function relayTick(d: DuelState, now: number): Out[] {
  return d.phase === 'deploy' && now >= d.deployUntil ? relayStart(d) : [];
}

/** One duel message from `side`. */
export function relayMessage(d: DuelState, side: Side, msg: RelayMsg): RelayStep {
  const me = d.players[side];
  const error = (message: string, code = 'bad_order'): RelayStep => ({ out: [{ to: me, msg: { type: 'error', message, code } }] });
  switch (msg.type) {
    case 'd_order': {
      if (d.phase !== 'deploy') return { out: [] };
      const o = parseOrder(msg.order);
      if (!o || !DEPLOY_KINDS.has(o.kind) || d.log.length >= MAX_DUEL_ORDERS) return error('Bad order');
      const seq = d.log.length;
      d.log.push({ tick: 0, side, order: o });
      d.deployOrders = d.log.length;
      d.seq = d.log.length;
      // Only the sender sees it now; the opponent gets it at go (relayStart()).
      return { out: [{ to: me, msg: { type: 'd_order', duel: d.id, seq, side, order: o } }] };
    }
    case 'd_ready': {
      if (d.phase !== 'deploy') return { out: [] };
      d.ready[side] = true;
      const out = both(d, { type: 'd_ready', duel: d.id, side });
      if (d.ready[0] && d.ready[1]) out.push(...relayStart(d));
      return { out };
    }
    case 'cmd': {
      if (d.phase !== 'battle') return error('The battle has not started');
      const o = parseOrder(msg.order);
      if (!o || d.pendingBySide[side] >= MAX_ORDERS_PER_TURN || d.log.length >= MAX_DUEL_ORDERS) return error('Bad or too many orders');
      d.pending.push({ side, order: o });
      d.pendingBySide[side]++;
      return { out: [] };
    }
    case 'reach': {
      if (d.phase !== 'battle') return { out: [] };
      const n = Math.floor(Number(msg.n));
      if (!Number.isFinite(n) || n < 0 || n >= d.next) return { out: [] };
      // (a player catching up after a reconnect reports old turns again: their hashes are not compared twice)
      const fresh = n > d.reached[side];
      d.reached[side] = Math.max(d.reached[side], n);
      if (fresh && typeof msg.hash === 'string') {
        const h = d.hashes.get(n) ?? [undefined, undefined];
        h[side] = msg.hash.slice(0, 16);
        if (h[0] !== undefined && h[1] !== undefined) {
          d.hashes.delete(n);
          if (h[0] !== h[1]) {
            d.phase = 'ended';
            return { out: both(d, { type: 'desync', duel: d.id, n, hashes: [h[0], h[1]] }), ended: 'desync' };
          }
        } else d.hashes.set(n, h);
      }
      const out: Out[] = [];
      while (Math.min(d.reached[0], d.reached[1]) + DELAY_TURNS >= d.next) out.push(...relaySeal(d));
      return { out };
    }
    case 'end': {
      if (d.phase !== 'battle') return { out: [] };
      const replay = replayBattle(d.setup, d.log, d.deployOrders);
      const r = replay.summary;
      if (r.ticks > d.next * TURN_TICKS) return error('The battle is not over yet', 'too_early');
      const mismatches: string[] = [];
      if (msg.winner !== r.winner) mismatches.push(`winner: claimed ${msg.winner}, server ${r.winner}`);
      if (msg.ticks !== r.ticks) mismatches.push(`ticks: claimed ${msg.ticks}, server ${r.ticks}`);
      if (msg.hash !== r.hash) mismatches.push(`hash: claimed ${msg.hash}, server ${r.hash}`);
      const result: Extract<ServerMsg, { type: 'duel_result' }> = { type: 'duel_result', duel: d.id, winner: r.winner, ticks: r.ticks, hash: r.hash, verified: mismatches.length === 0, mismatches };
      d.result = result;
      d.phase = 'ended';
      return { out: both(d, result), ended: 'result', replay };
    }
  }
}

/**
 * What a player who (re)connects needs to rebuild the duel: duel_start, then
 * in the deployment their own deployment orders and who is ready; in the
 * battle every deployment order of both sides, go and every sealed turn (the
 * client fast-forwards through them).
 */
export function relayResume(d: DuelState, side: Side, start: DuelStart): ServerMsg[] {
  const out: ServerMsg[] = [start];
  const deploy = d.phase === 'deploy' ? d.log.length : d.deployOrders;
  d.log.slice(0, deploy).forEach((o, seq) => {
    if (d.phase !== 'deploy' || o.side === side) out.push({ type: 'd_order', duel: d.id, seq, side: o.side, order: o.order });
  });
  if (d.phase === 'deploy') {
    for (const s of [0, 1] as Side[]) if (d.ready[s]) out.push({ type: 'd_ready', duel: d.id, side: s });
    return out;
  }
  out.push({ type: 'go', duel: d.id });
  let i = d.deployOrders;
  for (let n = 0; n < d.next; n++) {
    const tick = n * TURN_TICKS;
    const orders: SealedOrder[] = [];
    while (i < d.log.length && d.log[i].tick === tick) {
      orders.push({ side: d.log[i].side, order: d.log[i].order });
      i++;
    }
    out.push({ type: 'turn', duel: d.id, n, tick, orders });
  }
  return out;
}

function parseOrder(o: unknown): Order | null {
  const r = OrderSchema.safeParse(o);
  return r.success ? (r.data as Order) : null;
}
