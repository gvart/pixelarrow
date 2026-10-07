/**
 * Live duel lobby and lockstep relay (no Durable Object APIs here, so it can
 * be unit-tested; RegionDO feeds it messages and delivers what it returns).
 * Protocol: src/online/protocol.ts.
 *
 * - Challenges: challenge -> challenged / challenge_sent; reply accept ->
 *   both armies are loaded from D1 (server-owned), the server fixes the seed
 *   and sends duel_start to both.
 * - Deployment (timed, DEPLOY_MS): a d_order is echoed to its sender only;
 *   the opponent's deployment stays secret until go. When both sent d_ready,
 *   or the deployment time plus DEPLOY_GRACE_MS is over (tick(), driven by
 *   the RegionDO's alarm, and checked on every message), each player gets the
 *   other side's deployment orders (as d_order, still in the deploy phase),
 *   then go, then turns 0..DELAY_TURNS-1 pre-sealed. Deployment orders only
 *   touch their own side (DEPLOY_KINDS), so applying "mine, then theirs" on
 *   both clients and the log's order on the server give the same state.
 * - Battle: cmd orders queue for the next sealed turn; turn n + DELAY_TURNS is
 *   sealed when both players reported reaching turn n. Every order is logged
 *   with tick = turn * TURN_TICKS, exactly as the clients apply it.
 * - Hashes ride on reach messages every HASH_EVERY turns; differing hashes for
 *   the same turn end the duel with `desync`.
 * - end: the server replays the log (src/sim) and sends duel_result to both.
 */
import { OrderSchema, replayBattle } from '../battle';
import { BATTLE_CONSUMABLES, type ConsumableId } from '../../../src/data/consumables';
import type { Hero } from '../../../src/data/units';
import type { BattleSetup, LoggedOrder, Order, Side } from '../../../src/sim/types';
import {
  CHALLENGE_TTL_MS,
  DELAY_TURNS,
  DEPLOY_GRACE_MS,
  DEPLOY_MS,
  HASH_EVERY,
  MAX_DUEL_ORDERS,
  MAX_ORDERS_PER_TURN,
  TURN_TICKS,
  type ClientMsg,
  type PresencePlayer,
  type SealedOrder,
  type ServerMsg,
} from '../../../src/online/protocol';

/** Storage key prefix of the hub's persisted challenges and deployments (DuelHub.persistence). */
export const HUB_PREFIX = 'hub:';

export interface Out {
  to: number;
  msg: ServerMsg;
}

export interface DuelArmy {
  heroes: Hero[];
  name: string;
}

export interface Challenge {
  id: string;
  from: PresencePlayer;
  to: PresencePlayer;
  at: number;
  accepting?: boolean;
  /** The challenger's battle consumable. */
  consumable?: ConsumableId | null;
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

export interface DuelDeps {
  now(): number;
  randomId(): string;
  randomSeed(): number;
  /**
   * The duel setup from both players' server-side armies (null if either
   * cannot fight). Spends the chosen battle consumables (null if one is gone).
   */
  buildDuel(a: PresencePlayer, b: PresencePlayer, seed: number, consumables: [ConsumableId | null, ConsumableId | null]): Promise<{ setup: BattleSetup; heroes: [Hero[], Hero[]] } | null>;
  /** Gives back consumables spent by a buildDuel whose duel could not start after all. */
  release?(a: PresencePlayer, b: PresencePlayer, consumables: [ConsumableId | null, ConsumableId | null]): Promise<void> | void;
  /** Persist a finished duel (battle_log). */
  record?(d: DuelState, result: Extract<ServerMsg, { type: 'duel_result' }>): Promise<void> | void;
  online(pid: number): boolean;
}

export class DuelHub {
  challenges = new Map<string, Challenge>();
  duels = new Map<string, DuelState>();
  private byPlayer = new Map<number, string>();

  constructor(private readonly deps: DuelDeps) {}

  /** JSON of each storage record as last saved (persistence()). */
  private saved = new Map<string, string>();

  /**
   * Storage changes since the last call, for the RegionDO to write (keys
   * under HUB_PREFIX). A Durable Object using WebSocket hibernation is
   * evicted after ~10 s without events, and memory goes with it: an open
   * challenge or a 15 s deployment is often that quiet. Both are kept in
   * storage until the battle starts; from go on, lockstep traffic arrives
   * every few ticks and keeps the object awake (a battle both players left
   * silent ends as "gone", like a disconnect).
   */
  persistence(): { put: Record<string, unknown>; del: string[] } {
    const cur = new Map<string, string>();
    for (const c of this.challenges.values()) if (!c.accepting) cur.set(`${HUB_PREFIX}c:${c.id}`, JSON.stringify(c));
    for (const d of this.duels.values()) if (d.phase === 'deploy') cur.set(`${HUB_PREFIX}d:${d.id}`, JSON.stringify({ ...d, hashes: [] }));
    const put: Record<string, unknown> = {};
    for (const [k, v] of cur) if (this.saved.get(k) !== v) put[k] = JSON.parse(v);
    const del = [...this.saved.keys()].filter((k) => !cur.has(k));
    this.saved = cur;
    return { put, del };
  }

  /** Brings back what persistence() saved (a Durable Object woken from hibernation). */
  restore(records: Map<string, unknown>): void {
    for (const [k, v] of records) {
      if (k.startsWith(`${HUB_PREFIX}c:`)) {
        const c = v as Challenge;
        this.challenges.set(c.id, c);
      } else if (k.startsWith(`${HUB_PREFIX}d:`)) {
        const d = { ...(v as DuelState), hashes: new Map() } as DuelState;
        // (a stale record is remembered as saved, so the next persistence() deletes it)
        if (d.phase === 'deploy' && !this.byPlayer.has(d.players[0]) && !this.byPlayer.has(d.players[1])) {
          this.duels.set(d.id, d);
          this.byPlayer.set(d.players[0], d.id);
          this.byPlayer.set(d.players[1], d.id);
        }
      } else continue;
      this.saved.set(k, JSON.stringify(v));
    }
  }

  busy(pid: number): boolean {
    return this.byPlayer.has(pid);
  }

  duelOf(pid: number): DuelState | undefined {
    const id = this.byPlayer.get(pid);
    return id ? this.duels.get(id) : undefined;
  }

  private expire(): Out[] {
    const out: Out[] = [];
    const now = this.deps.now();
    for (const c of [...this.challenges.values()]) {
      if (!c.accepting && now - c.at > CHALLENGE_TTL_MS) {
        this.challenges.delete(c.id);
        out.push({ to: c.from.id, msg: { type: 'challenge_closed', id: c.id, reason: 'expired' } }, { to: c.to.id, msg: { type: 'challenge_closed', id: c.id, reason: 'expired' } });
      }
    }
    return out;
  }

  /** Starts every duel whose deployment time is over (call from an alarm; messages call it too). */
  tick(): Out[] {
    const out: Out[] = [];
    const now = this.deps.now();
    for (const d of this.duels.values()) if (d.phase === 'deploy' && now >= d.deployUntil) out.push(...this.start(d));
    return out;
  }

  /** When tick() next has work to do (the earliest deployment deadline), or null. */
  nextDeadline(): number | null {
    let t: number | null = null;
    for (const d of this.duels.values()) if (d.phase === 'deploy' && (t === null || d.deployUntil < t)) t = d.deployUntil;
    return t;
  }

  /**
   * Deployment over: each player now gets the opponent's (withheld)
   * deployment orders, then go, and the first DELAY_TURNS turns sealed empty.
   */
  private start(d: DuelState): Out[] {
    d.phase = 'battle';
    d.deployOrders = d.log.length;
    const out: Out[] = [];
    for (const side of [0, 1] as Side[]) {
      const other = d.players[1 - side];
      d.log.forEach((o, seq) => {
        if (o.side === side) out.push({ to: other, msg: { type: 'd_order', duel: d.id, seq, side, order: o.order } });
      });
    }
    out.push(...this.both(d, { type: 'go', duel: d.id }));
    for (let i = 0; i < DELAY_TURNS; i++) out.push(...this.seal(d));
    return out;
  }

  /** Handles one client message. `me` is the authenticated sender. */
  async handle(me: PresencePlayer, msg: ClientMsg, lookup: (pid: number) => PresencePlayer | null): Promise<Out[]> {
    const out = [...this.expire(), ...this.tick()];
    const err = (message: string, code = 'bad_request') => [...out, { to: me.id, msg: { type: 'error', message, code } as ServerMsg }];
    switch (msg.type) {
      case 'challenge': {
        const pick = duelConsumable(msg.consumable);
        if (pick === undefined) return err('At most one battle consumable per duel', 'bad_consumable');
        const to = lookup(Number(msg.to));
        if (!to || !this.deps.online(to.id)) return err('That player is not online', 'unavailable');
        if (to.id === me.id) return err('You cannot challenge yourself');
        if (this.busy(me.id) || this.busy(to.id)) return err('Someone is already in a duel', 'busy');
        for (const c of this.challenges.values()) if (c.from.id === me.id) return err('You already have an open challenge', 'busy');
        const c: Challenge = { id: this.deps.randomId(), from: me, to, at: this.deps.now(), consumable: pick };
        this.challenges.set(c.id, c);
        out.push({ to: me.id, msg: { type: 'challenge_sent', id: c.id, to } }, { to: to.id, msg: { type: 'challenged', id: c.id, from: me } });
        return out;
      }
      case 'challenge_cancel': {
        const c = this.challenges.get(String(msg.id));
        if (!c || c.from.id !== me.id || c.accepting) return out;
        this.challenges.delete(c.id);
        out.push({ to: c.to.id, msg: { type: 'challenge_closed', id: c.id, reason: 'cancelled' } }, { to: me.id, msg: { type: 'challenge_closed', id: c.id, reason: 'cancelled' } });
        return out;
      }
      case 'challenge_reply': {
        const c = this.challenges.get(String(msg.id));
        if (!c || c.to.id !== me.id || c.accepting) return err('That challenge is gone', 'unavailable');
        if (!msg.accept) {
          this.challenges.delete(c.id);
          out.push({ to: c.from.id, msg: { type: 'challenge_closed', id: c.id, reason: 'declined' } }, { to: me.id, msg: { type: 'challenge_closed', id: c.id, reason: 'declined' } });
          return out;
        }
        const mine = duelConsumable(msg.consumable);
        if (mine === undefined) return err('At most one battle consumable per duel', 'bad_consumable');
        if (!this.deps.online(c.from.id) || this.busy(c.from.id) || this.busy(me.id)) {
          this.challenges.delete(c.id);
          out.push({ to: me.id, msg: { type: 'challenge_closed', id: c.id, reason: 'unavailable' } }, { to: c.from.id, msg: { type: 'challenge_closed', id: c.id, reason: 'unavailable' } });
          return out;
        }
        c.accepting = true;
        const seed = this.deps.randomSeed();
        const picks: [ConsumableId | null, ConsumableId | null] = [c.consumable ?? null, mine];
        const built = await this.deps.buildDuel(c.from, c.to, seed, picks).catch(() => null);
        this.challenges.delete(c.id);
        if (!built || this.busy(c.from.id) || this.busy(me.id)) {
          if (built) await this.deps.release?.(c.from, c.to, picks);
          out.push({ to: me.id, msg: { type: 'challenge_closed', id: c.id, reason: 'unavailable' } }, { to: c.from.id, msg: { type: 'challenge_closed', id: c.id, reason: 'unavailable' } });
          return out;
        }
        const d: DuelState = {
          id: this.deps.randomId(),
          players: [c.from.id, c.to.id],
          names: [c.from.name, c.to.name],
          setup: built.setup,
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
          createdAt: this.deps.now(),
          deployUntil: this.deps.now() + DEPLOY_MS + DEPLOY_GRACE_MS,
          result: null,
        };
        this.duels.set(d.id, d);
        this.byPlayer.set(d.players[0], d.id);
        this.byPlayer.set(d.players[1], d.id);
        for (const side of [0, 1] as Side[]) {
          out.push({
            to: d.players[side],
            msg: { type: 'duel_start', duel: d.id, side, setup: d.setup, heroes: built.heroes, names: d.names, turnTicks: TURN_TICKS, delayTurns: DELAY_TURNS, hashEvery: HASH_EVERY, deployMs: DEPLOY_MS },
          });
        }
        return out;
      }
      case 'd_order':
      case 'cmd':
      case 'd_ready':
      case 'reach':
      case 'end':
      case 'leave_duel':
        return [...out, ...(await this.duelMsg(me, msg))];
      default:
        return out;
    }
  }

  private both(d: DuelState, msg: ServerMsg): Out[] {
    return [{ to: d.players[0], msg }, { to: d.players[1], msg }];
  }

  private finish(d: DuelState): void {
    d.phase = 'ended';
    this.byPlayer.delete(d.players[0]);
    this.byPlayer.delete(d.players[1]);
    this.duels.delete(d.id);
  }

  private seal(d: DuelState): Out[] {
    const n = d.next++;
    const tick = n * TURN_TICKS;
    const orders = d.pending;
    d.pending = [];
    d.pendingBySide = [0, 0];
    for (const o of orders) d.log.push({ tick, side: o.side, order: o.order });
    return this.both(d, { type: 'turn', duel: d.id, n, tick, orders });
  }

  private async duelMsg(me: PresencePlayer, msg: Extract<ClientMsg, { duel: string }>): Promise<Out[]> {
    const d = this.duels.get(String(msg.duel));
    if (!d) return [{ to: me.id, msg: { type: 'duel_abort', duel: String(msg.duel), reason: 'gone' } }];
    const side = d.players.indexOf(me.id) as Side | -1;
    if (side === -1) return [{ to: me.id, msg: { type: 'error', message: 'Not your duel', code: 'forbidden' } }];
    const other = d.players[1 - side];
    switch (msg.type) {
      case 'leave_duel': {
        this.finish(d);
        return [{ to: other, msg: { type: 'duel_abort', duel: d.id, reason: 'left' } }, { to: me.id, msg: { type: 'duel_abort', duel: d.id, reason: 'left' } }];
      }
      case 'd_order': {
        if (d.phase !== 'deploy') return [];
        const o = parseOrder(msg.order);
        if (!o || !DEPLOY_KINDS.has(o.kind) || d.log.length >= MAX_DUEL_ORDERS) return [{ to: me.id, msg: { type: 'error', message: 'Bad order', code: 'bad_order' } }];
        const seq = d.log.length;
        d.log.push({ tick: 0, side, order: o });
        d.deployOrders = d.log.length;
        d.seq = d.log.length;
        // Only the sender sees it now; the opponent gets it at go (start()).
        return [{ to: me.id, msg: { type: 'd_order', duel: d.id, seq, side, order: o } }];
      }
      case 'd_ready': {
        if (d.phase !== 'deploy') return [];
        d.ready[side] = true;
        const out = this.both(d, { type: 'd_ready', duel: d.id, side });
        if (d.ready[0] && d.ready[1]) out.push(...this.start(d));
        return out;
      }
      case 'cmd': {
        if (d.phase !== 'battle') return [{ to: me.id, msg: { type: 'error', message: 'The battle has not started', code: 'bad_order' } }];
        const o = parseOrder(msg.order);
        if (!o || d.pendingBySide[side] >= MAX_ORDERS_PER_TURN || d.log.length >= MAX_DUEL_ORDERS) return [{ to: me.id, msg: { type: 'error', message: 'Bad or too many orders', code: 'bad_order' } }];
        d.pending.push({ side, order: o });
        d.pendingBySide[side]++;
        return [];
      }
      case 'reach': {
        if (d.phase !== 'battle') return [];
        const n = Math.floor(Number(msg.n));
        if (!Number.isFinite(n) || n < 0 || n >= d.next) return [];
        d.reached[side] = Math.max(d.reached[side], n);
        if (typeof msg.hash === 'string') {
          const h = d.hashes.get(n) ?? [undefined, undefined];
          h[side] = msg.hash.slice(0, 16);
          if (h[0] !== undefined && h[1] !== undefined) {
            d.hashes.delete(n);
            if (h[0] !== h[1]) {
              this.finish(d);
              return this.both(d, { type: 'desync', duel: d.id, n, hashes: [h[0], h[1]] });
            }
          } else d.hashes.set(n, h);
        }
        const out: Out[] = [];
        while (Math.min(d.reached[0], d.reached[1]) + DELAY_TURNS >= d.next) out.push(...this.seal(d));
        return out;
      }
      case 'end': {
        if (d.phase !== 'battle') return [];
        const r = replayBattle(d.setup, d.log, d.deployOrders).summary;
        const mismatches: string[] = [];
        if (msg.winner !== r.winner) mismatches.push(`winner: claimed ${msg.winner}, server ${r.winner}`);
        if (msg.ticks !== r.ticks) mismatches.push(`ticks: claimed ${msg.ticks}, server ${r.ticks}`);
        if (msg.hash !== r.hash) mismatches.push(`hash: claimed ${msg.hash}, server ${r.hash}`);
        const result: Extract<ServerMsg, { type: 'duel_result' }> = { type: 'duel_result', duel: d.id, winner: r.winner, ticks: r.ticks, hash: r.hash, verified: mismatches.length === 0, mismatches };
        d.result = result;
        this.finish(d);
        await this.deps.record?.(d, result);
        return this.both(d, result);
      }
    }
  }

  /** A player's last socket closed: their duel ends, their challenges lapse. */
  disconnect(pid: number): Out[] {
    const out: Out[] = [];
    const d = this.duelOf(pid);
    if (d) {
      this.finish(d);
      const other = d.players[0] === pid ? d.players[1] : d.players[0];
      out.push({ to: other, msg: { type: 'duel_abort', duel: d.id, reason: 'opponent_left' } });
    }
    for (const c of [...this.challenges.values()]) {
      if (c.from.id === pid || c.to.id === pid) {
        this.challenges.delete(c.id);
        const other = c.from.id === pid ? c.to.id : c.from.id;
        out.push({ to: other, msg: { type: 'challenge_closed', id: c.id, reason: 'unavailable' } });
      }
    }
    return out;
  }
}

/**
 * Orders allowed during a duel's deployment: each changes only its own side's
 * groups and men (no new groups, no randomness), so the two sides' deployment
 * orders commute and can be revealed at go without changing the outcome.
 */
export const DEPLOY_KINDS: ReadonlySet<Order['kind']> = new Set(['form', 'preset', 'order', 'shieldwall', 'loose', 'assign']);

/** A duel message's consumable: null for none, undefined when invalid (not ONE battle consumable id). */
export function duelConsumable(v: unknown): ConsumableId | null | undefined {
  if (v === undefined || v === null) return null;
  return typeof v === 'string' && (BATTLE_CONSUMABLES as string[]).includes(v) ? (v as ConsumableId) : undefined;
}

function parseOrder(o: unknown): Order | null {
  const r = OrderSchema.safeParse(o);
  return r.success ? (r.data as Order) : null;
}
