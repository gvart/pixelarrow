/**
 * The rules version of the deterministic battle sim (design/adr/ADR-0001-determinism-replay.md).
 *
 * The server replays every online battle, so client and server must run the
 * same rules. Anything that can change a replay's outcome or `Battle.hash()`
 * (sim code, the AI, the data the sim reads, stat derivation, order kinds)
 * ships only behind a bump of this number.
 *
 * The server runs only today's sim and takes only this version: a client on
 * another one gets 426 (sockets: close 4426) and a "please reload" message.
 * Battles in flight across a bump are void (V5-074: no older sim is kept).
 *
 * 2: sim train 2 (V5-019), the baseline: every v5 rule change ships under
 *    this number, with no further bump.
 */
export const SIM_VERSION = 2;
