/**
 * Client side of a live ranked or unranked match (docs/DUELS.md "Ranked
 * live"): the socket to the match's DuelDO (`/ws/duel/<id>`, reconnecting
 * fast) and the BattleSource whose lockstep driver feeds the Lockstep adapter
 * (src/online/lockstep.ts), like a friendly duel (src/online/duelDriver.ts).
 *
 * Reconnects: the socket comes back by itself; the server re-sends the duel
 * and every sealed turn, Lockstep skips what it already ran and the battle
 * scene runs through the backlog fast. The opponent dropping shows a 30 s
 * countdown; if they do not come back the server settles the match and the
 * report arrives mid-battle (the scene ends the battle with a banner).
 */
import type { Battle } from '../sim/battle';
import type { Order } from '../sim/types';
import type { BattleSource, LockstepDriver } from '../online/battleSource';
import { Lockstep } from '../online/lockstep';
import type { ClientMsg, DuelStart, ServerMsg } from '../online/protocol';
import { ShardSocket } from '../online/client';
import type { DuelLiveServerMsg, MatchReport } from './protocol';
import type { DuelMode } from './rating';
import { t } from '../i18n';
import { safeLocalStorage } from '../platform/storage';

/** How long the first duel_start may take before the match counts as unreachable. */
const OPEN_TIMEOUT_MS = 12_000;
/** After the local end, how long to wait for the server's settled report. */
const REPORT_WAIT_MS = 10_000;
/** The match socket pings this often and is replaced after this long without a word (a half-open socket). */
export const MATCH_HEARTBEAT = { everyMs: 4000, deadMs: 12_000 };
/** Nothing from the match for this long: ask the server (GET /match/:id) whether it was settled meanwhile. */
export const STALL_POLL_MS = 20_000;
/** Nothing from the match for this long: give up on it (the hub shows the report, or Rejoin). */
export const STALL_GIVE_UP_MS = 180_000;

export class MatchLink {
  readonly sock: ShardSocket<DuelLiveServerMsg, ClientMsg>;
  start: DuelStart | null = null;
  report: MatchReport | null = null;
  /** The opponent's socket dropped: until when they may come back. */
  foeAwayUntil: number | null = null;
  /** When the match last said anything (a turn, an echo, a peer notice). */
  heardAt = Date.now();
  private listeners = new Set<(m: DuelLiveServerMsg) => void>();

  constructor(readonly id: string) {
    this.sock = new ShardSocket<DuelLiveServerMsg, ClientMsg>(`/ws/duel/${id}`, 2000, MATCH_HEARTBEAT);
    this.sock.on((m) => {
      this.heardAt = Date.now();
      if (m.type === 'duel_start' && !this.start) this.start = m;
      else if (m.type === 'match_result') this.report = m.report;
      else if (m.type === 'peer' && this.start && m.side !== this.start.side) this.foeAwayUntil = m.online ? null : m.until;
      for (const l of [...this.listeners]) l(m);
    });
  }

  /** Connects; resolves with the duel (or the report of a match that is already over). */
  open(): Promise<DuelStart | MatchReport> {
    this.sock.open();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error('timeout'));
      }, OPEN_TIMEOUT_MS);
      const off = this.on((m) => {
        if (m.type !== 'duel_start' && m.type !== 'match_result') return;
        clearTimeout(timer);
        off();
        resolve(m.type === 'duel_start' ? m : m.report);
      });
      if (this.report || this.start) {
        clearTimeout(timer);
        off();
        resolve(this.report ?? this.start!);
      }
    });
  }

  on(l: (m: DuelLiveServerMsg) => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  close(): void {
    this.sock.close();
    this.listeners.clear();
  }
}

export interface MatchOutcome {
  report: MatchReport | null;
  side: 0 | 1;
  names: [string, string];
}

/**
 * The battle scene's source for a live match. `done` gets the settled report (or null if it never came).
 * `poll` asks the server for the settled report (null while the match runs): when the match goes quiet
 * (the report lost with a dead socket, the server unreachable) the battle still ends instead of waiting forever.
 */
export function matchSource(link: MatchLink, start: DuelStart, done: (o: MatchOutcome) => void, poll?: () => Promise<MatchReport | null>): BattleSource {
  let ls: Lockstep | null = null;
  const early: ServerMsg[] = [];
  let finished = false;
  let completed = false;
  /** Nothing from the match for STALL_GIVE_UP_MS: the battle ends without a report. */
  let lost = false;
  let polling = false;
  const opponent = start.names[start.side === 0 ? 1 : 0];
  const watchdog = setInterval(() => {
    const quiet = Date.now() - link.heardAt;
    if (link.report || lost || quiet < STALL_POLL_MS) return;
    if (quiet >= STALL_GIVE_UP_MS) {
      lost = true;
      return;
    }
    if (!poll || polling) return;
    polling = true;
    poll()
      .then((r) => {
        if (r && !link.report) link.report = r;
        if (r && finished) complete();
      })
      .catch(() => undefined)
      .finally(() => (polling = false));
  }, 5000);
  const complete = () => {
    if (completed) return;
    completed = true;
    clearInterval(watchdog);
    off();
    link.close();
    done({ report: link.report, side: start.side, names: start.names });
  };
  const off = link.on((m) => {
    if (m.type === 'match_result') {
      if (finished) complete();
      return;
    }
    if (m.type === 'peer') return;
    if (ls) ls.receive(m);
    else early.push(m);
  });
  const driver: LockstepDriver = {
    attach(sim: Battle) {
      ls = new Lockstep(sim, start.side, start.duel, (m) => link.sock.send(m), { turnTicks: start.turnTicks, delayTurns: start.delayTurns, hashEvery: start.hashEvery });
      for (const m of early.splice(0)) ls.receive(m);
    },
    issue(o: Order) {
      ls?.issue(o);
    },
    ready() {
      ls?.markReady();
    },
    canStep() {
      return !!ls && ls.canStep();
    },
    beforeStep() {
      ls?.beforeStep();
    },
    backlog() {
      return ls?.backlog() ?? 0;
    },
    status() {
      if (!link.sock.connected) return t('duels.live.reconnecting');
      if (link.foeAwayUntil) return t('duels.live.foeAway', { name: opponent, s: Math.max(0, Math.ceil((link.foeAwayUntil - Date.now()) / 1000)) });
      return t('battle.banner.waitingFoe', { name: opponent });
    },
    opponentReady() {
      return !!ls?.opponentReady;
    },
    aborted() {
      if (ls?.desync) return t('battle.duel.desync');
      const r = link.report;
      if (!r && lost && ls?.sim.phase !== 'ended') return t('duels.live.unreachable');
      if (!r || ls?.sim.phase === 'ended') return null;
      if (r.end === 'battle') {
        // the battle ended and the other side reported it first: run on to the end on the sealed turns
        if (ls?.canStep()) return null;
        return r.winner === r.side ? t('battle.banner.victory') : r.winner === -1 ? t('battle.banner.draw') : t('battle.banner.defeat');
      }
      // settled while this client still fights: the opponent left (or the match is void)
      if (r.end === 'void') return t('duels.live.void');
      return r.winner === r.side ? t('battle.duel.left', { name: opponent }) : t('duels.live.lost');
    },
  };
  return {
    setup: start.setup,
    heroes: [...start.heroes[0], ...start.heroes[1]],
    side: start.side,
    label: t('battle.vs', { name: opponent }),
    opponent,
    lockstep: driver,
    onFinish() {
      finished = true;
      if (link.report || !ls || ls.desync) return complete();
      ls.finish();
      setTimeout(complete, REPORT_WAIT_MS);
    },
    onLeave() {
      // Back during the deployment: a surrender (a loss, not an abandon); the report follows
      finished = true;
      link.sock.send({ type: 'leave_duel', duel: start.duel });
      if (link.report) return complete();
      setTimeout(complete, REPORT_WAIT_MS);
    },
  };
}

// ------------------------------------------------------------------ resume after a reload

const ONGOING_KEY = 'pixelarrow.duel.ongoing';
/** A remembered match older than this is over either way (the server voids a match after 12 minutes). */
const ONGOING_MAX_MS = 15 * 60_000;

export interface OngoingMatch {
  id: string;
  mode: DuelMode;
  at: number;
}

/**
 * The live match this device is playing, kept until it ends: Telegram reloads
 * a mini app the system squeezed for memory (or the player reopens it), and
 * the boot then goes back into the match instead of leaving it to be lost by
 * abandonment (src/scenes/BootScene.ts).
 */
export function rememberMatch(id: string, mode: DuelMode, now = Date.now()): void {
  try {
    safeLocalStorage()?.setItem(ONGOING_KEY, JSON.stringify({ id, mode, at: now } satisfies OngoingMatch));
  } catch {
    // storage full or blocked: no resume after a reload
  }
}

export function forgetMatch(id?: string): void {
  try {
    const s = safeLocalStorage();
    if (!s) return;
    if (id && ongoingMatch(Infinity)?.id !== id) return;
    s.removeItem(ONGOING_KEY);
  } catch {
    // blocked
  }
}

/** The match to go back into on boot, if one was being played lately. */
export function ongoingMatch(now = Date.now()): OngoingMatch | null {
  try {
    const raw = safeLocalStorage()?.getItem(ONGOING_KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as Partial<OngoingMatch>;
    if (typeof m.id !== 'string' || (m.mode !== 'ranked' && m.mode !== 'unranked') || typeof m.at !== 'number') return null;
    if (now !== Infinity && (now - m.at > ONGOING_MAX_MS || m.at > now + 60_000)) return null;
    return { id: m.id, mode: m.mode, at: m.at };
  } catch {
    return null;
  }
}
