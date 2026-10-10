/**
 * The rules version of the deterministic battle sim (design/adr/ADR-0001-determinism-replay.md).
 *
 * The server replays every online battle, so client and server must run the
 * same rules. Anything that can change a replay's outcome or `Battle.hash()`
 * (sim code, the AI, the data the sim reads, stat derivation, order kinds)
 * ships only behind a bump of this number, together with a server that can
 * still replay the versions it accepts.
 *
 * 1: the rules as of v4 (the first versioned sim; clients that send no
 *    version run these).
 */
export const SIM_VERSION = 1;
