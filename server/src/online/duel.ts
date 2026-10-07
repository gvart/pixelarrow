/**
 * Live duel lobby and lockstep relay (no Durable Object APIs here, so it can
 * be unit-tested; RegionDO feeds it messages and delivers what it returns).
 * Protocol: src/online/protocol.ts.
 *
 * - Challenges: challenge -> challenged / challenge_sent; reply accept ->
 *   both armies are loaded from D1 (server-owned), the server fixes the seed
 *   and sends duel_start to both.
 * - Deployment, lockstep turns, hash checks and the final replay are the
 *   shared relay (server/src/online/relay.ts, also used by the ranked DuelDO);
 *   tick() (driven by the RegionDO's alarm, and checked on every message)
 *   starts deployments whose time is over.
 * - A player leaving or disconnecting ends a friendly duel at once.
 */
import { BATTLE_CONSUMABLES, type ConsumableId } from '../../../src/data/consumables';
import type { Hero } from '../../../src/data/units';
import type { BattleSetup, Side } from '../../../src/sim/types';
import { CHALLENGE_TTL_MS, type ClientMsg, type PresencePlayer, type ServerMsg } from '../../../src/online/protocol';
import { newRelay, relayMessage, relayTick, startMsg, type DuelState, type Out } from './relay';

export { DEPLOY_KINDS, type DuelState, type Out } from './relay';

/** Storage key prefix of the hub's persisted challenges and deployments (DuelHub.persistence). */
export const HUB_PREFIX = 'hub:';

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
    for (const d of this.duels.values()) out.push(...relayTick(d, now));
    return out;
  }

  /** When tick() next has work to do (the earliest deployment deadline), or null. */
  nextDeadline(): number | null {
    let t: number | null = null;
    for (const d of this.duels.values()) if (d.phase === 'deploy' && (t === null || d.deployUntil < t)) t = d.deployUntil;
    return t;
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
        const d = newRelay(this.deps.randomId(), [c.from.id, c.to.id], [c.from.name, c.to.name], built.setup, this.deps.now());
        this.duels.set(d.id, d);
        this.byPlayer.set(d.players[0], d.id);
        this.byPlayer.set(d.players[1], d.id);
        for (const side of [0, 1] as Side[]) {
          out.push({ to: d.players[side], msg: startMsg(d, side, built.heroes, this.deps.now()) });
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

  private finish(d: DuelState): void {
    d.phase = 'ended';
    this.byPlayer.delete(d.players[0]);
    this.byPlayer.delete(d.players[1]);
    this.duels.delete(d.id);
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
      default: {
        const step = relayMessage(d, side, msg);
        if (step.ended) {
          this.finish(d);
          if (step.ended === 'result') await this.deps.record?.(d, d.result!);
        }
        return step.out;
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

/** A duel message's consumable: null for none, undefined when invalid (not ONE battle consumable id). */
export function duelConsumable(v: unknown): ConsumableId | null | undefined {
  if (v === undefined || v === null) return null;
  return typeof v === 'string' && (BATTLE_CONSUMABLES as string[]).includes(v) ? (v as ConsumableId) : undefined;
}
