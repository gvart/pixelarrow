/**
 * Client side of the lockstep duel (pure: no Phaser, no sockets). Wraps a
 * Battle that both players simulate; local orders are sent to the server and
 * only applied when they come back (deployment) or inside a sealed turn
 * (battle), so both clients apply identical orders at identical ticks.
 * See src/online/protocol.ts.
 */
import type { Battle } from '../sim/battle';
import type { Order, Side } from '../sim/types';
import { DELAY_TURNS, HASH_EVERY, TURN_TICKS, type ClientMsg, type SealedOrder, type ServerMsg } from './protocol';

export interface LockstepOptions {
  turnTicks?: number;
  hashEvery?: number;
  delayTurns?: number;
}

export class Lockstep {
  readonly turnTicks: number;
  readonly hashEvery: number;
  readonly delayTurns: number;
  private sealed = new Map<number, SealedOrder[]>();
  private reported = -1;
  /** Deployment orders applied before the start (for the server's replay bookkeeping). */
  deployOrders = 0;
  ready = false;
  opponentReady = false;
  ended = false;
  desync: { n: number; hashes: [string, string] } | null = null;
  aborted: string | null = null;
  result: Extract<ServerMsg, { type: 'duel_result' }> | null = null;
  /** Orders applied from the server (for UI refresh). */
  onApplied: (side: Side, order: Order) => void = () => {};

  constructor(
    readonly sim: Battle,
    readonly side: Side,
    readonly duel: string,
    private readonly send: (m: ClientMsg) => void,
    opts: LockstepOptions = {},
  ) {
    this.turnTicks = opts.turnTicks ?? TURN_TICKS;
    this.hashEvery = opts.hashEvery ?? HASH_EVERY;
    this.delayTurns = opts.delayTurns ?? DELAY_TURNS;
  }

  /** A local order: deployment orders go through the server, battle orders into the next turn. */
  issue(order: Order): void {
    if (this.ended || this.sim.phase === 'ended') return;
    this.send({ type: this.sim.phase === 'deploy' ? 'd_order' : 'cmd', duel: this.duel, order });
  }

  markReady(): void {
    if (this.ready || this.sim.phase !== 'deploy') return;
    this.ready = true;
    this.send({ type: 'd_ready', duel: this.duel });
  }

  /** Feed a server message for this duel. Returns true if it was consumed. */
  receive(m: ServerMsg): boolean {
    if (!('duel' in m) || m.duel !== this.duel) return false;
    switch (m.type) {
      case 'd_order':
        if (this.sim.phase === 'deploy') {
          this.sim.issue(m.side, m.order);
          this.deployOrders = this.sim.orderLog.length;
          this.onApplied(m.side, m.order);
        }
        return true;
      case 'd_ready':
        if (m.side !== this.side) this.opponentReady = true;
        return true;
      case 'go':
        this.deployOrders = this.sim.orderLog.length;
        this.sim.startBattle();
        return true;
      case 'turn':
        this.sealed.set(m.n, m.orders);
        return true;
      case 'desync':
        this.desync = { n: m.n, hashes: m.hashes };
        this.ended = true;
        return true;
      case 'duel_result':
        this.result = m;
        return true;
      case 'duel_abort':
        this.aborted = m.reason;
        this.ended = true;
        return true;
      default:
        return true;
    }
  }

  /** Whether the next sim step may run (the current turn is sealed). */
  canStep(): boolean {
    if (this.ended || this.sim.phase !== 'battle') return false;
    const t = this.sim.tick;
    if (t % this.turnTicks !== 0) return true;
    return this.sealed.has(t / this.turnTicks);
  }

  /**
   * Call right before every sim.step(): at a turn boundary reports the turn
   * (with a hash on hash turns) and applies its sealed orders.
   */
  beforeStep(): void {
    const t = this.sim.tick;
    if (t % this.turnTicks !== 0) return;
    const n = t / this.turnTicks;
    const orders = this.sealed.get(n);
    if (!orders) return;
    if (n > this.reported) {
      this.reported = n;
      const msg: ClientMsg = { type: 'reach', duel: this.duel, n };
      if (n % this.hashEvery === 0) msg.hash = this.sim.hash();
      this.send(msg);
    }
    for (const o of orders) {
      this.sim.issue(o.side, o.order);
      this.onApplied(o.side, o.order);
    }
    this.sealed.delete(n);
  }

  /** Tell the server how the battle ended (it replays the log and answers with duel_result). */
  finish(): void {
    if (this.ended) return;
    this.ended = true;
    this.send({ type: 'end', duel: this.duel, winner: (this.sim.winner ?? -1) as Side | -1, ticks: this.sim.tick, hash: this.sim.hash() });
  }

  /** Steps the battle as far as the sealed turns allow (headless use, tests). */
  pump(maxSteps = 1_000_000): number {
    let n = 0;
    while (n < maxSteps && this.canStep()) {
      this.beforeStep();
      this.sim.step();
      n++;
    }
    return n;
  }

  /** Waiting for the opponent (the next turn is not sealed yet). */
  get stalled(): boolean {
    return this.sim.phase === 'battle' && !this.ended && !this.canStep();
  }
}
