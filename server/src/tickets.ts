/**
 * Shared plumbing of battle tickets (war-map attacks and world-boss raids in
 * `battle_tickets`, duel ladder floors in `duel_tickets`, async duel raids in
 * `duel_attacks`): the server fixes the seed and both armies, the client
 * submits its order log, and a ticket is settled once.
 */
import { ApiError } from './errors';
import type { Hero } from '../../src/data/units';
import type { BattleSetup } from '../../src/sim/types';

export type TicketStatus = 'open' | 'used' | 'rejected' | 'abandoned';

/** The columns every ticket table shares for the submit preamble. */
export interface TicketState {
  status: TicketStatus;
  claim: string | null;
  result: string | null;
  expires_at: number;
}

/** A `battle_tickets` row as far as the shared view needs it. */
export interface BattleTicketLike {
  id: string;
  expires_at: number;
  setup: string;
  attackers: string;
  defenders: string;
  consumable: string | null;
}

/**
 * The client's view of a `battle_tickets` row. `head` carries what differs per
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
  table: 'battle_tickets' | 'duel_tickets',
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
  table: 'battle_tickets' | 'duel_tickets',
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

/** Closes an open `battle_tickets` row and frees its heroes. */
export async function closeBattleTicket(d: D1Database, id: string, status: 'rejected' | 'abandoned', now: number, extra: { claim?: string; result?: string } = {}): Promise<void> {
  await d.batch([closeTicketStmt(d, 'battle_tickets', id, status, now, extra.claim, extra.result), d.prepare('UPDATE online_heroes SET busy_ticket = NULL, busy_until = 0 WHERE busy_ticket = ?1').bind(id)]);
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
 * settled.
 */
export async function ticketPreamble(t: TicketState, claimJson: string, now: number, noun: string, expire: () => Promise<void>, usedNoun = noun): Promise<string | null> {
  if (t.status === 'used') {
    if (t.claim === claimJson && t.result) return t.result;
    throw new ApiError(409, 'ticket_used', `This ${usedNoun} was already reported`);
  }
  requireOpenTicket(t, noun);
  if (t.expires_at < now) {
    await expire();
    throw new ApiError(410, 'ticket_expired', `Too late: the ${noun} ticket expired`);
  }
  return null;
}
