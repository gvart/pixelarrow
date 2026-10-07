/**
 * The live ranked and unranked duels' sockets (docs/DUELS.md "Ranked live"),
 * shared by the client and the Worker. server/README.md "Ranked duels" has
 * the flow.
 *
 * - `/ws/duel` (the global MatchmakerDO): `queue {mode}` / `cancel`; the
 *   server answers `queued`, then `match_found` (or `unqueued` with a reason).
 * - `/ws/duel/<match>` (one DuelDO per match): the friendly duel's lockstep
 *   protocol (src/online/protocol.ts: duel_start, d_order, d_ready, go, turn,
 *   reach, end ...) plus `peer` (the opponent dropped or came back) and
 *   `match_result` (the settled report, also re-sent to a player who connects
 *   after the end). A player who reconnects gets duel_start with
 *   `resume: true` and every sealed turn again; the client fast-forwards.
 */
import type { ServerMsg } from '../online/protocol';
import type { HeroXp } from './ladder';
import type { DuelMode, League } from './rating';

export type MatchmakerClientMsg = { type: 'queue'; mode: DuelMode } | { type: 'cancel' } | { type: 'ping'; t?: unknown };

export interface LiveMatchRef {
  id: string;
  mode: DuelMode;
}

export type MatchmakerServerMsg =
  /** On connect: a live match to rejoin, and the queue cooldown (0: none). */
  | { type: 'mm_welcome'; now: number; match: LiveMatchRef | null; cooldownUntil: number }
  | { type: 'queued'; mode: DuelMode; since: number; now: number }
  | { type: 'unqueued'; reason: 'cancelled' | 'cooldown' | 'locked' | 'no_team' | 'over_budget' | 'too_many' | 'busy' | 'error' }
  | { type: 'match_found'; match: string; mode: DuelMode; side: 0 | 1; opponent: { name: string; league: League | null } }
  | { type: 'pong'; t: unknown; now: number }
  | { type: 'error'; message: string; code?: string };

/** How a match ended: the verified battle, one side gone past the reconnect window, or void (desync, both gone). */
export type MatchEnd = 'battle' | 'forfeit' | 'void';

/** The settled match as one player sees it (match_result, GET /api/duel/match/:id). */
export interface MatchReport {
  match: string;
  mode: DuelMode;
  side: 0 | 1;
  names: [string, string];
  winner: 0 | 1 | -1;
  end: MatchEnd;
  /** The server replayed the battle and the clients' claim matched. */
  verified: boolean;
  ticks: number;
  /** This player abandoned it (counts towards the queue cooldown). */
  abandoned: boolean;
  glory: number;
  accountXp: number;
  /** Ranked only: the rating before and after (the client shows only the change unless Legend). */
  rating: { before: number; after: number } | null;
  league: { before: League | null; after: League | null } | null;
  placements: { played: number; of: number } | null;
  xp: HeroXp[];
}

export type DuelLiveServerMsg =
  | ServerMsg
  | { type: 'peer'; duel: string; side: 0 | 1; online: boolean; until: number | null }
  | { type: 'match_result'; duel: string; report: MatchReport };
