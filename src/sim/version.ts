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
 *    no further bump. FO-01 (face, form keeps order, focus fire) is its first
 *    rule change.
 *
 * Grace window (ADR-0001 step 3): while v2 played exactly like v1 the server
 * kept MIN_SIM_VERSION = 1 and SOCKET_MIN_SIM_VERSION = 1 (V5-033). FO-01
 * raised BOTH floors to 2 with the first rule change, so v1 clients get 426
 * (sockets: close 4426) and a reload message, and live duels pair only
 * clients of the same version. Delete server/src/sims/v1 with its REPLAYERS
 * entry once the longest ticket TTL has passed after that deploy.
 */
export const SIM_VERSION = 2;
