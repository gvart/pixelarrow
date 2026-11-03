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
 * 7: early-survival (W-79 proposal): the wild only knocks men down at depth 0-1, home mobs x0.8, march rations
 *    weigh nothing, a softer warlord lord and hall, lieutenant-led raids (clients on 6 reload).
 * 8: food-home (W-80 proposal): by a store of his team a man's pack refills to 8 rations (2 food a ration) from the
 *    store, the team's strongroom and, online at home, his own strongroom (clients on 7 reload).
 * 9: tuning-mastery (W-81 proposal): chiefs on firm ground (moors, siren, delta rebuilt), warlord halls hold 60-80 s,
 *    raids hit lightly guarded buildings, a lairCleared event (clients on 8 reload).
 * 10: paths-limits (W-85, W-101..W-104): a soul's gate and the cart cap read the owner's path, Emporos no longer adds a
 *    cart (clients on 9 reload).
 * 11: paths-perks (W-110..W-114): perks through men, sites and carts, classes by level, the shield-bearer in the
 *    skirmishers, souls of every family at every site (clients on 10 reload).
 * 12: paths-staffed (W-88..W-91, W-120..W-135): buildings work and see only with a man at them, access and terms, private
 *    houses, locks, raids limited by carry (clients on 11 reload).
 */
export const SIM_VERSION = 12;
