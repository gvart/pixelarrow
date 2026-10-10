# Campaign Arc: the Opening, Lair Assaults and the Final Host

> **Type**: New system on top of #19 Overland campaign world. Classified **too large for quick-design** (`[F]`), but kept at quick-design depth per the brief. **Run `/design-system campaign-arc` before its epic starts.**
> **Status**: Draft (S2-VISION, 2026-10-10)
> **Vision rank**: 4 of 6
> **Pillars**: P4 Every man has a name, P1 The line decides
> **Fixes**: PLAY O1 (structural), O4; MECH C2, C3, C6 (partly), I2; BASELINE "Unreachable sets offline"
> **Legacy reference**: docs/GAMEPLAY.md "Campaign and the overland map"; MECHANICS.md §1.8, §2.5.2, §2.6.1

## Overview

The campaign gets a beginning, a middle and an end.

- **Opening.** The company starts with **8 men**, at the scale the tutorial teaches, and the first bands are sized to match.
- **Middle.** The six lairs, today eternal spawners, become **assault targets**. Each is a defended battle behind a palisade, with a captain and a doctrine. Destroying lairs raises the world to tier 3.
- **End.** When every lair has fallen, **the Tyrant's host** marches. Beating it wins the campaign and drops a legendary set piece. The world then continues as an endless post-game.

## Player Fantasy

"We burned the pirate cove. Two lairs left, and the bands out here wear real bronze now. Then the Tyrant comes."

The aesthetics are Fantasy (a company saga) and Challenge (a goal).

## Detailed Rules

### R1. Opening (PLAY O1)

1. `starterParty` (`src/game/heroes.ts`) creates **8 heroes**:

   | Heroes | Group |
   | --- | --- |
   | Hoplites, one a level-2 veteran | 4, group I |
   | Peltasts | 2, group IV |
   | Slingers | 2, group II |

   That's the tutorial's composition, minus 2 hoplites. They keep the shared lambda shield paint. The starting stash (a pilos and an owl amulet) is unchanged.
2. `START_GOLD` stays 60. `FOOD_RULES.startFood` goes from 24 to **40**, which is 5 days for 8 men.
3. **Bands near the start are resized.** Bandits are `size = BANDIT_MIN + round(danger × 5) + int(0..2)` with `BANDIT_MIN` = **5** (today 3). Raiders and mercenaries are unchanged.
4. **A destroyed army** gets **5 volunteers** (today 3) at the starting town: 3 raw spearmen and 2 raw skirmishers (`campaign.ts` about L406).
5. **Catch-up floor**: whenever the army has fewer than `VOLUNTEER_FLOOR` (5) men, the starting town and every village offer up to 3 raw volunteers at `VOLUNTEER_FLOOR_COST` (20 g) each, on top of their normal stock.
6. **First world-map visit**: 2 coach marks, reusing the online coach system (`src/ui/tutorial/onlineCoach.ts`):
   - "Weaker bands (green plates) are safe fights. Grow before you hunt lairs."
   - "Towns hire and heal. Camp to rest."
7. **Empty groups**: only groups with men show cards (controls.md R1). With 8 men, groups I, II and IV are filled and III Reserve is empty, so it's hidden until it's assigned.

### R2. Lairs become targets

1. Each lair settlement (`SettlementKind 'lair'`, 6 per map) gets a **garrison**: `buildArmy` with the lair's culture and band kind, and:

   | Field | Value |
   | --- | --- |
   | size | `GARRISON_BASE + round(danger × 6)` (default 10 + 0..6) |
   | level | `2 + round(danger × 3 + days × 0.04)` |
   | tier | `lairTier` (R3) |

   It has a captain (ai-doctrines.md R6) and a doctrine (R4).
2. **Tapping a lair** on the map opens the **Assault** sheet: garrison size, power plate, doctrine and tell, captain, and the reward preview (a hoard chest icon). The choices are Assault or Leave. A lair can't be ransomed or fled from: you choose to attack it.
3. **The assault battle.** `generateBattlefield(seed, site, { assault: true })`:
   - places a **palisade** line (the field-works.md cell kind `palisade`) across the defender's deployment front, with **2 gate gaps** of 3 cells each at seeded positions;
   - the garrison gets **2 stakes** segments in front of its gates (field-works.md R4.4, `GARRISON_STAKES`), whatever its doctrine;
   - the defender deploys behind it;
   - the attacker's deployment zone is normal.
4. **Victory** destroys the lair:
   - `lairs[id].fallen = true`;
   - its spawns stop;
   - its bands still on the map remain, but no longer get new members;
   - it drops a **lair hoard** (R6);
   - the map shows a burnt-lair icon.
5. **Defeat, or the player's retreat**: the lair stays, `lost += killed`, and it regrows 1 man per 24 h up to full. A garrison never retreats itself (R4). If the garrison's captain died, the next-highest hero is promoted to captain on regrowth.
6. A lair can be assaulted at any time. The power plate is the warning.

### R3. Tier 3 and late scaling (MECH C3)

- `lairTier = 2`. It becomes **3** once `lairsFallen ≥ 2` or `days ≥ TIER3_DAY` (**50**; about 60 battles at 1.2 per day, inside the arc's 60–90).
- Band tier: today's rule, plus **tier 3** when `danger > 0.85`, or when `lairsFallen ≥ 2` and the band is raiders or mercenaries.
- The band caps rise: size 18 → **22**, level 8 → **10** (`src/world/world.ts:681` and `:683`).
- Tier 3 makes the existing rare set pieces (Agoge, Peltast, Cretan) reachable offline through `bandSetPieces` (I2).

### R4. Arc doctrines

| Army | Doctrine | Captain |
| --- | --- | --- |
| Bandit camp garrison | swarm | yes |
| Pirate cove garrison | swarm | yes |
| Galatae war camp garrison | rush | yes |
| The Tyrant's host | hammer | "the Tyrant", level 10, legendary weapon |

Garrisons and the host have `retreatAt` forced to 0. They fight to the end, so a lair falls and the arc is won only by a real victory. They never get the enemy-retreated outcome (ai-doctrines.md R8).

The map has 6 lairs, each one of the three kinds above, so this table covers all six.

### R5. The Tyrant's host (the end state, MECH C2)

1. When `lairsFallen = ARC_LAIRS` (6), the arc calls `setFlag('host_musters')`. That makes the campaign-events.md card `host_musters` (trigger `flag`) due, and it shows as a narrative card.
2. A unique band, `kind: 'host'`, spawns at the town farthest from the start, and **marches toward the starting town**, 1.2× normal band speed. It's always visible on the map (no fog for it).
   - Size: `min(32, ceil(1.25 × R))`, where R is the player's **fit roster** (all heroes who aren't wounded), counted once when `host_musters` fires. It isn't recomputed from deployed men, so fielding fewer men doesn't shrink it.
   - Level: 8–10 (seeded).
   - Tier 3, culture mixed (the hammer doctrine with Phoenician cavalry).
3. If the host reaches the starting town, the campaign isn't lost. The town is **sacked**: its recruits and market close for 5 days, and the host turns back toward its own town and marches again.
4. **Beating the host**:
   - the arc stage becomes `'won'`;
   - the **Victory** screen (a Results variant) names the company's survivors;
   - it drops one **legendary set piece** (R6), and the captain's legendary weapon goes into the loot picks;
   - **post-game**: the world continues, and danger gets `+0.2` (capped at 1). Lairs stay burnt and their bands stop. Bands keep spawning from towns (mercenaries) and from 2 **reborn lairs** at seeded spots after 10 days, so the endless game still has prey.
5. **Losing to the host**: the host survives, weakened by its dead. It keeps marching, and you can fight it again.

### R6. Offline item sources (MECH I2)

| Source | Drop |
| --- | --- |
| Tier-3 bands | the existing `bandSetPieces` (4% of rare pieces become rare set pieces) |
| Lair hoard | a chest of 3 picks: `rollRarity(tier 3)` with **one guaranteed epic**; 25% chance the epic is an epic set piece (Brennus, Immortals or Sacred Band, by lair culture); it counts on the campaign pity counter |
| The Tyrant's host | one **legendary set piece**: Arms of Achilles (Greek-leaning host) or Panoply of Alexander (otherwise), seeded per campaign. |
| Post-game reborn lair (victory) | **only** one missing piece of the campaign's legendary set, until all 5 are owned. After that, nothing. It drops no hoard and doesn't touch pity. Reborn lairs reappear every 10 days, which is the cooldown. There are no reborn hosts. |
| Ladder named items | stay duel-only (unchanged) |

### R7. Level pacing (MECH C6)

The arc gives levels 6–10 content: tier-3 bands, assaults and the host. The XP curve itself (`40·L`) belongs to #16. This GDD **requests** a tuning pass: try `XP_CURVE_L6PLUS = 32·L`, and adopt it if the arc-length target (Balance) fails.

## Formulas

### F1. Garrison size

```
G = GARRISON_BASE + round(danger × GARRISON_DANGER)
```

`GARRISON_BASE` = 10 and `GARRISON_DANGER` = 6, with `danger` in 0.05–1. G = **10–16**.

**Example**: danger 0.7 gives 10 + 4 = 14 men.

### F2. Host size

```
H = min(32, ceil(1.25 × R))
```

R is the fit roster when `host_musters` fires (1–20). H = **2–25**, and 32 is the sim's safe cap (64 per side).

**Example**: R = 16 gives H = 20.

### F3. Garrison regrowth

```
G_now = min(G, G − lost + floor(hoursSince / 24))
```

## Edge Cases

- **An old save** (no `lairs` state): the migration adds `lairs` with every lair `fallen: false` and `lost: 0`, and arc stage `'lairs'`. In an old save the army may have 3 heroes: the 8-man opening applies **only to new campaigns**. An old save keeps its army.
- **A lair whose garrison has 0 men** (all killed and you retreated): the lair falls on the next contact without a battle.
- **The host spawns while the player is inside the start town**: the host is placed at least 30 tiles away, and the player has time.
- **All towns sacked**: impossible. Only the starting town can be sacked, and it reopens after 5 days.
- **The player assaults with 1 man**: allowed. The power plate warns "deadly".
- **The post-game reborn lairs**: they're `kind 'lair'` with `reborn: true`. They can be assaulted, but they don't count toward the arc.
- **Pity**: the hoard counts on the campaign pity counter, so pity can't be farmed (lairs are finite).

## Dependencies

| System / GDD | Direction | Contract |
| --- | --- | --- |
| ai-doctrines.md | uses | garrison and host doctrines, captains, bounty |
| field-works.md | uses | the `palisade` cell kind for assault terrain |
| campaign-events.md | uses / is used by | sets the `host_musters` flag. Event effects can weaken a garrison (the "deserter's map"). |
| abilities.md | uses | the Tyrant is a standard bearer (R5) |
| controls.md | uses | the Assault sheet follows the encounter-sheet pattern |
| battle-readability.md | uses | the Results "why" line, and the Victory variant |
| #19 Overland world, #20 Settlements, #22 Save | modifies | world state, sacking, migration |
| #17 Items, #18 Loot | uses | `rollRarity`, `hoardItem`, `bandSetPieces`, pity |

### Cross-References

| Target GDD | Specific Element Referenced | Nature |
| --- | --- | --- |
| ai-doctrines.md | R4 doctrine mapping, R6 captains | uses |
| field-works.md | R1 `palisade` cell | uses |
| campaign-events.md | R2 world flags, R6 `host_musters` | provides events to / reads flags from |
| abilities.md | R5 standard | uses |

## Tuning Knobs

| Knob | Default | Range | Category | Where |
| --- | --- | --- | --- | --- |
| STARTER_SIZE (composition R1) | 8 | 6–10 | gate | `src/game/heroes.ts` |
| FOOD_RULES.startFood | 40 | 24–60 | gate | `src/world/camp.ts` |
| BANDIT_MIN | 5 | 3–6 | curve | `src/world/world.ts` |
| VOLUNTEERS | 5 | 3–6 | gate | `src/game/campaign.ts` |
| GARRISON_BASE / DANGER | 10 / 6 | 8–14 / 4–8 | curve | new `src/data/arc.ts` |
| TIER3_DAY / TIER3_LAIRS | 50 / 2 | 35–70 / 1–3 | gate | `src/data/arc.ts` |
| VOLUNTEER_FLOOR / COST | 5 / 20 g | 3–6 / 10–40 | gate | `src/game/campaign.ts` |
| Band caps (size / level) | 22 / 10 | 18–24 / 8–10 | curve | `src/world/world.ts` |
| ARC_LAIRS | 6 | 4–6 | gate | `src/data/arc.ts` |
| HOST_MULT / HOST_SPEED | 1.25 / 1.2 | 1.0–1.5 / 1–1.5 | curve | `src/data/arc.ts` |
| SACK_DAYS | 5 | 2–7 | gate | `src/data/arc.ts` |
| Hoard picks / guaranteed epic | 3 / 1 | 2–5 / 0–1 | curve | `src/data/arc.ts` |

## Touch UI needs

- **Map**: a lair shows its garrison plate (size and threat colour plus a **threat icon**, G13) and a burnt state. The host shows a unique banner plate and a dotted march line to the starting town.
- **Assault sheet**: a Mosaic BottomPanel, the same pattern as the new encounter sheet. Garrison art in a niche, threat chip, doctrine row, captain row, reward chest. Primary **Assault**, secondary **Leave**. It must fit at 320x640.
- **Arc tracker**: a small "Lairs 2/6" chip in the World top bar. A tap opens a list of lairs with their state (and centres the map on one).
- **Victory variant** of Results: the company roll (the survivors' names), the set-piece reveal, then "Continue the campaign".
- **Coach marks** on the first map visit (R1.5).
- **Strings**: all new copy in i18n, en and ru.

## Online and server impact

- **Overland: none.** The overland is offline only. The arc doesn't exist on the war map.
- **Sim train 2**: the assault battles use the `palisade` cell kind. Its sim rules and its zod enum entry belong to field-works.md and ship in the train. Campaign battles post to `/api/battle/verify` for logging only, so a mismatch is logged, not enforced.
- **Captains and doctrines** in garrisons: covered by ai-doctrines.md (the same train).

## Save impact

**The v5 campaign save bump.** This is the one definition, and the other GDDs reference it: `SAVE_VERSION = (S4-FIX-SAVES version) + 1`. The shipped code has `SAVE_VERSION = 5`.

- `WorldSave.lairs: Record<number, { fallen: boolean; lost: number; lostAt: number }>`.
- `WorldSave.arc: { stage: 'lairs' | 'host' | 'won' | 'post'; hostParty?: number; sackedUntil?: number }`.
- `PartyState.kind` gains `'host'`, and `SettlementState` gains `reborn?: boolean`.

**Migration**: fill the defaults (above). New campaigns get the R1 opening. Migration is covered by a fixture test on a real save at the S4-FIX-SAVES version.

## Balance targets (`npm run balance`)

There are new harness rows (`arcBalance`), plus a playtest.

| Test | Target |
| --- | --- |
| The 8-man starter army vs a bandit band at danger 0.1–0.3 (the "even" plate) | the player wins **55–70%** |
| Real decisions in the first campaign battle (PLAY method) | **≥ 8** |
| Lair assault: an army at 1.0× garrison power vs palisade + rampart + `GARRISON_STAKES` (2) | the attacker wins **38–48%**. Re-derived after the stakes fix: a held ridge is worth +12 to +18 pts today and is retuned to 62–68%. Two gates funnel the attack like a ford, which is about even (46/54). The rampart's cover adds a few points against missiles. Stakes mostly cost cavalry, and garrison attackers are mostly foot. That's a net defender edge of +5 to +12. If it's measured below 38%, lower `GARRISON_STAKES` first. |
| Lair assault: an army at 1.3× | **≥ 60%** |
| Host vs a "prepared" army (16 men, average level 7, rare kit) | **40–55%** |
| Arc length (a scripted campaign sim, if built; otherwise a playtest estimate) | **60–90 battles** to the host |
| Gold per even win | 225–305 g (the BASELINE band), **+10 to +20%** on wins against a captained band (bounty). Hoards add a one-time 6 chests. Endgame sink: retrain and works only, so **the forge reroll stays a known gap** (deferred). |

## Acceptance Criteria

- [ ] A new campaign starts with 8 heroes in groups I, II and IV, and 40 food. An old save keeps its heroes.
- [ ] Lairs can be assaulted. Victory marks them fallen and stops their spawns. Defeat lets them regrow.
- [ ] Tier-3 bands appear after 2 lairs or day 50, and rare set pieces drop offline.
- [ ] The host spawns after the 6th lair, marches, can sack the start town, and can be beaten. Victory sets `'won'` and drops a legendary set piece.
- [ ] Migration from the S4-FIX-SAVES version to `(S4-FIX-SAVES version) + 1` keeps every field (a fixture test).
- [ ] *Experiential*: a playtester can say what the campaign's goal is after 10 minutes.

## Files touched

- **Game**: `src/game/heroes.ts` (`starterParty`), `src/game/campaign.ts` (volunteers, outcomes, hoards), `src/game/sources.ts`, `src/game/save.ts` (bump plus migration).
- **World**: `src/world/world.ts` (`spawnParty`, caps, lairs, host), `src/world/map.ts`, `src/world/camp.ts` (`startFood`), `src/world/battlefield.ts` (`assault` profile).
- **Data**: new `src/data/arc.ts`.
- **Scenes**: `src/scenes/WorldScene.ts` (lair plates, Assault sheet, host line, arc chip, coach marks), `src/scenes/ResultsScene.ts` (Victory variant), `src/scenes/SettlementScene.ts` (sacked state), `src/i18n/*`.
- **Tests**: `tests/*`.
