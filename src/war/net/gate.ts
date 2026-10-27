/**
 * The war's door (the online cap): a live region view holds one gate socket to the world (/ws/war/world?gate=1,
 * server/src/war/world/gate.ts). The world lets at most WAR_MAX_ONLINE players in at once (admins exempt); the rest
 * wait in line, first come first in, and are let in when a place frees. One player counts once, however many tabs.
 *
 *   server -> { t: 'gate', s: 'in' }                         in: open the region socket
 *             { t: 'gate', s: 'queue', place, of, eta }      waiting: place 1 is next, `eta` ms a rough guess
 *   client -> 'ping' every GATE_BEAT_MS (the world's auto-response, it does not wake the object); a tab silent for
 *             GATE_EXPIRE_MS is dropped (a crashed tab frees its place). Leaving: close code GATE_LEAVE.
 *
 * A gate socket lost by accident (not GATE_LEAVE) keeps its player's place GATE_HOLD_MS, so a short drop does not
 * send him to the back of the line. The page's end: ./gateLink.ts.
 */
export const GATE_BEAT_MS = 20_000;
export const GATE_EXPIRE_MS = 90_000;
export const GATE_HOLD_MS = 30_000;
/** Close code of a tab that leaves on purpose (idle kick, page left): its place frees at once. */
export const GATE_LEAVE = 4001;
export const MAX_ONLINE_DEFAULT = 50;

export type GateMsg = { t: 'gate'; s: 'in' } | { t: 'gate'; s: 'queue'; place: number; of: number; eta: number };
