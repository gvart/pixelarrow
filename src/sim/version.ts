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
 * sim) and v1 clients still get tickets over HTTP. Live sockets take only v2.
 * Raise MIN_SIM_VERSION to 2, and delete server/src/sims/v1 with its REPLAYERS
 * entry, once the longest ticket TTL has passed after the deploy and clients
 * have reloaded; at the latest, in the same change as the first train-2 rule
 * that alters how the server builds setups.
 */
export const SIM_VERSION = 2;
