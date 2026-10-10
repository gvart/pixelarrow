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
 *
 * Grace window (ADR-0001 step 3): the server keeps MIN_SIM_VERSION = 1, so
 * v1 tickets issued before the v2 deploy still verify (replayed by the frozen
 * sim) and v1 clients still get tickets over HTTP. Sockets keep
 * SOCKET_MIN_SIM_VERSION = 1 too (V5-033), and live duels pair only clients
 * of the same version. The first rule-changing train-2 story raises BOTH
 * floors (MIN_SIM_VERSION and SOCKET_MIN_SIM_VERSION) to 2 in the same commit
 * as the rule change. Delete server/src/sims/v1 with its REPLAYERS entry once
 * the longest ticket TTL has passed after that.
 */
export const SIM_VERSION = 2;
