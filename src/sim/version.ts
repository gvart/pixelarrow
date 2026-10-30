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
 * 3: world-fill: the war sim's chiefs, hidden quests, drifting roaming life and
 *    per-region seeds (clients on 2 reload).
 * 4: new-creatures: scorpion, harpy, cyclops and drake mob kinds, Drakon calls
 *    drakes, sturdier chiefs (clients on 3 reload).
 * 5: solo-loop: chiefs tuned for a solo army of 12, solo tasks, legendary
 *    gear only as guardian trophies, region mastery (clients on 4 reload).
 * 6: warlords (W-72 proposal): rival warlords hold, grow and raid (src/war/sim/warlords.ts), wild squads for any
 *    owner (spawnWild), the wild's bots see without fog (clients on 5 reload).
 */
export const SIM_VERSION = 6;
