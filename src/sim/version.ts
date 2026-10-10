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
 *    version run these). Frozen in server/src/sims/v1 for replays.
 * 2: sim train 2 (V5-019): every v5 rule change ships under this number, with
 *    no further bump. Until its first rule lands it plays exactly like 1.
 */
export const SIM_VERSION = 2;
