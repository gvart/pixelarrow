/**
 * Shared plumbing of battle tickets (duel ladder floors in `duel_tickets`,
 * async duel raids in `duel_attacks`): the server fixes the seed and both armies, the client
 * submits its order log, and a ticket is settled once.
 */
import { ApiError } from './errors';
import type { Hero } from '../../src/data/units';
import type { BattleSetup } from '../../src/sim/types';

export type TicketStatus = 'open' | 'used' | 'rejected' | 'abandoned';

/** The columns every ticket table shares for the submit preamble. */
interface TicketState {
  status: TicketStatus;
  claim: string | null;
  result: string | null;
  expires_at: number;
}

/** A ticket row as far as the shared view needs it. */
interface BattleTicketLike {
  id: string;
  expires_at: number;
  setup: string;
  attackers: string;
  defenders: string;
  consumable: string | null;
}

/**
 * The client's view of a ticket row. `head` carries what differs per
 * mode (the boss or the region, the defender kind) and sits between
 * `expiresAt` and `consumable`.
 */
export function battleTicketView(t: BattleTicketLike, head: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    ticket: t.id,
    expiresAt: t.expires_at,
    ...head,
    consumable: t.consumable ?? null,
    setup: JSON.parse(t.setup) as BattleSetup,
    attackers: JSON.parse(t.attackers) as Hero[],
    defenders: JSON.parse(t.defenders) as Hero[],
    ...extra,
  };
}

/**
 * Loads a ticket of `table` owned by `pid` (`filter` adds SQL conditions);
 * 404 `not_found` with `notFound` otherwise.
 */
export async function loadOwnTicket<T>(
  d: D1Database,
  table: 'duel_tickets',
  id: string,
  pid: number,
  notFound = 'No such ticket',
  filter = '',
): Promise<T> {
  const t = await d.prepare(`SELECT * FROM ${table} WHERE id = ?1 AND player_id = ?2${filter}`).bind(id, pid).first<T>();
  if (!t) throw new ApiError(404, 'not_found', notFound);
  return t;
}

/** Closes an open ticket of `table` as rejected or abandoned (won = 0), keeping a claim / result when given. */
export function closeTicketStmt(
  d: D1Database,
  table: 'duel_tickets',
  id: string,
  status: 'rejected' | 'abandoned',
  now: number,
  claim?: string,
  result?: string,
): D1PreparedStatement {
  return d
    .prepare(`UPDATE ${table} SET status = ?2, finished_at = ?3, claim = COALESCE(?4, claim), result = COALESCE(?5, result), won = 0 WHERE id = ?1 AND status = 'open'`)
    .bind(id, status, now, claim ?? null, result ?? null);
}

/** 409 `ticket_closed` ("This <noun> was <status>") unless the ticket is open. */
export function requireOpenTicket(t: { status: TicketStatus }, noun: string): void {
  if (t.status !== 'open') throw new ApiError(409, 'ticket_closed', `This ${noun} was ${t.status}`);
}

/**
 * The submit preamble shared by every ticket kind. A ticket already used with
 * the same claim returns its stored result (JSON) for an idempotent replay;
 * otherwise 409 `ticket_used` ("This <usedNoun> was already reported"), 409
 * `ticket_closed`, or, past its expiry, `expire()` then 410 `ticket_expired`
 * ("Too late: the <noun> ticket expired"). Returns null when the ticket may be
 * settled. With `lateOk` an expired open ticket may be settled too (the ladder:
 * a late run is verified but pays nothing, controls.md R10); the caller checks
 * `ticketExpired` itself.
 */
export async function ticketPreamble(t: TicketState, claimJson: string, now: number, noun: string, expire: () => Promise<void>, usedNoun = noun, lateOk = false): Promise<string | null> {
  if (t.status === 'used') {
    if (t.claim === claimJson && t.result) return t.result;
    throw new ApiError(409, 'ticket_used', `This ${usedNoun} was already reported`);
  }
  requireOpenTicket(t, noun);
  if (!lateOk && ticketExpired(t, now)) {
    await expire();
    throw new ApiError(410, 'ticket_expired', `Too late: the ${noun} ticket expired`);
  }
  return null;
}

/** The ticket's time is up (a submission exactly at `expires_at` is still in time). */
export function ticketExpired(t: { expires_at: number }, now: number): boolean {
  return t.expires_at < now;
}
