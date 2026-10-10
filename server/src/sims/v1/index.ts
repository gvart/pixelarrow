/**
 * The frozen SIM_VERSION 1 rules (design/adr/ADR-0001-determinism-replay.md,
 * "Adding a version"): a byte-for-byte copy of src/sim/battle.ts and every
 * module it imports (src/sim, src/data, src/util) as of the v2 bump.
 *
 * READ-ONLY. Never edit, format or refactor anything under this folder: the
 * server replays v1 tickets and duels with it, and tests/fixtures/replay-v1.json
 * pins its hashes (tests/simVersion.test.ts, server/test/simVersion.test.ts).
 * Only server/src/battle.ts REPLAYERS and those tests import it. Delete the
 * whole folder, with its REPLAYERS entry, no sooner than one ticket TTL after
 * MIN_SIM_VERSION rose past 1 (in-flight v1 tickets still replay with it).
 */
export { Battle as BattleV1 } from './sim/battle';
