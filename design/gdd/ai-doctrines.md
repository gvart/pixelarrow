# AI Doctrines and Band Captains

> **Type**: Addition (quick-design) to systems #10 Bot AI and #11 Enemy army generation
> **Status**: Draft (S2-VISION, 2026-10-10)
> **Vision rank**: 1 of 6
> **Pillars**: P1 The line decides, P2 Read it at a glance, P5 One sim
> **Fixes**: MECH A1, A2, A3 (partly), PLAY P1, BASELINE "Ridge 74%"
> **Legacy reference**: docs/GAMEPLAY.md "Bot AI"; docs/v5/audit/MECHANICS.md §1.7, §2.4

## Overview

Today every bot fights one doctrine on fixed timers: flank at 14 s, press after 25 s, reserve at 70 s. This change moves those timers and thresholds out of `src/sim/ai.ts` into a **Doctrine** data record, and adds four doctrines beside today's behaviour, which becomes the default `steady`. Each army chooses its doctrine from its band kind, its culture or its ladder chapter, and the doctrine travels in `BattleSetup`.

Bands of tier 2 and above also get a **captain**. He is a named hero who carries the band's standard, and he is the obvious target: kill him and his line wavers. Doctrines are shown before the fight and on the field, so reading the enemy is a skill the player can learn.

## Player Fantasy

"These Gauls always come early and hard. Lock shields, brace, and let them break on us. Then send the peltasts round to kill their chief."

The aesthetics are Challenge (mastery) and Discovery.

## Detailed Rules

### R1. The Doctrine record

The record lives in `src/data/doctrines.ts`, which is shared data that both the client and the server import:

```ts
type DoctrineId = 'steady' | 'rush' | 'hammer' | 'swarm' | 'zealot';
interface Doctrine {
  id: DoctrineId;
  lineWaitS: number;      // main line holds before advancing (today 5, ai.ts `t >= 5`)
  flankAtS: number;       // flank group starts its swing
  pressAfterS: number;    // idle-breaker earliest start (today 25)
  pressIdleS: number;     // seconds of no combat before pressing (today PRESS_IDLE_S = 8)
  reserveAtS: number;     // reserve commit time if no other trigger (today 70)
  reserveWaver: number;   // commit reserve when own line morale share < this (0..1)
  holdHillS: number;      // today HOLD_HILL_S = 50
  fordWaitS: number;      // today FORD_WAIT_S = 55
  hillFlank: boolean;     // attacker sends flank group round a held hill instead of waiting
  skirmishRetire: number; // paces of threat at which skirmishers retire (today 5)
  shieldwallWhenShot: boolean;
  preferShape: FormationType; // main line shape at deploy
  feint: boolean;         // light groups may use the 'feint' order (formations-orders.md)
  focusMissiles: boolean; // missile groups focus enemy missile groups first (formations-orders.md 'focus')
  retreatAt: number;      // fraction of own men lost (dead+routed+fled) at which the bot retreats; 0 = never
  jitter: number;         // ± fraction applied to every timer, seeded
}
```

### R2. The five doctrines

The `steady` values reproduce today's constants exactly.

| Field | steady (today) | rush | hammer | swarm | zealot |
| --- | --- | --- | --- | --- | --- |
| lineWaitS | 5 | 0 | 8 | 3 | 0 |
| flankAtS | 14 | 6 | 18 | 10 | 8 |
| pressAfterS | 25 | 8 | 30 | 20 | 6 |
| pressIdleS | 8 | 4 | 8 | 10 | 3 |
| reserveAtS | 70 | 30 | 45 (cavalry hammer) | 60 | 25 |
| reserveWaver | 0.5 | 0.35 | 0.6 | 0.5 | 0.3 |
| holdHillS | 50 | 10 | 60 | 30 | 0 |
| fordWaitS | 55 | 15 | 60 | 40 | 0 |
| hillFlank | false | true | true | true | false |
| skirmishRetire | 5 | 3 | 6 | 7 | 2 |
| shieldwallWhenShot | true | false | true | false | false |
| preferShape | line | wedge | line | loose (line for its spears) | wedge |
| feint | false | false | true | true | false |
| focusMissiles | false | false | true | true | false |
| retreatAt | 0 | 0 | 0.6 | 0.45 | 0 |
| jitter | 0 | 0.15 | 0.15 | 0.2 | 0.1 |

In plain words:

- **steady**: holds, advances in order, commits the reserve late.
- **rush**: charges at once in a wedge, flanks early, never retreats.
- **hammer** (the Punic school): holds and skirmishes, then sends a cavalry hammer onto your flank at about 45 s, and retreats at 60% losses.
- **swarm**: skirmishes and feints, and retreats when it is losing.
- **zealot**: an all-in frenzy that never retreats and doesn't brace.

### R3. Small-army opening (fixes PLAY P1)

The press time a bot actually uses scales with its army size:

```
pressAfter = min(doctrine.pressAfterS, PRESS_BASE_S + PRESS_PER_MAN_S × menOnSide)
```

The variables and worked examples are in Formulas, F1.

### R4. Which doctrine an army gets

The army builder chooses, in `src/game/enemy.ts` (`buildArmy` gets a `doctrine` argument; a missing one means `steady`):

| Source | Doctrine |
| --- | --- |
| Campaign bandits, pirates, hill tribes | swarm |
| Campaign raiders (Galatae) | rush |
| Campaign mercenaries | by culture: greek → steady, phoenician → hammer, celtic → rush |
| Cultists (neutral mix) | zealot |
| Outlaws, deserters | steady |
| Lair garrisons and the final host | campaign-arc.md R4 |
| Duel ladder floor `f` | chapter `c = ceil(f/10)`: 1 steady, 2 swarm, 3 rush, 4 hammer, 5 zealot; boss floors use the culture rule |
| War-map neutral defenders | the same mapping by mix (server-built setups) |
| Async raid defence (ranked) | the defender's chosen doctrine for their defence preset; default steady (optional, Alpha tier, see Online impact) |
| A player-side bot (balance harness, auto-battle) | steady |

### R5. Bot behaviour per doctrine

`ai.ts` reads every timer and threshold from `this.doctrine` instead of from module constants. The constants stay, exported, as the `steady` defaults. Each doctrine field changes behaviour in one place:

- `hillFlank`: an attacking bot facing a held hill sends its flank group round the hill once `flankAtS` has passed, instead of waiting up to `holdHillS`. This fixes the ridge outlier.
- `retreatAt`: when the losses reach it **and** the bot is not winning (its strength share is below 0.45), the bot issues `{ kind: 'retreat' }`. That ends the battle as a bot defeat with an **enemy-retreated** flag (R8). It fixes A3.
- `feint` and `focusMissiles` issue the new orders from formations-orders.md (`feint`, `focus`).
- Every bot turn of a group uses `face` (formations-orders.md R1), not `form`, so turning no longer stops a charge. This fixes MECH B2 for the bot.

### R6. Captains

1. A band of tier 2 or more, and every lair garrison, has one captain.
   - He is chosen deterministically from the band's army seed: the highest-level line hero.
   - He gets **level +2** (capped at 10) and a gear rarity floor of **uncommon** (rare from tier 3).
   - `UnitSpec.captain = true` marks him.
2. A captain is a **standard bearer** for his army, and abilities.md R5 applies in full: the standard aura, Raise the standard, and banner loss when he falls. This is the one shared "standard" rule, so there are no captain-specific morale numbers.
3. A captain carries his class signature active (abilities.md R3) as well as Raise the standard. The bot uses both under the abilities.md bot rules.
4. **Bounty.** If the captain is dead or knocked out when the player wins (or when the bot retreats), the player gets:
   - `bounty = BOUNTY_BASE + BOUNTY_PER_LV × captainLevel` gold;
   - one extra loot pick, which is guaranteed to be the captain's weapon.

### R7. Readability (P2)

- **Encounter dialog.** The band name, the doctrine name and a one-line *tell* (for example "Rush: charges at once, flanks early, never retreats."), plus a captain line with name, level and crest icon.
- **Band plate on the map.** A crest glyph when the band has a captain. The colour of the threat plate is unchanged (G13 is fixed by battle-readability.md).
- **Battle.** A doctrine chip in the top bar (icon plus name), and the captain's crest over his head (a 10 px glyph; the badge is drawn by battle-readability.md R2).
- **Codex.** Each doctrine gets an entry, unlocked the first time you fight it: its tells and its counters.

### R8. The outcome when the enemy retreats

`report.ts` gains `enemyRetreated: boolean`. In the campaign the outcome counts as a victory (win gold, loot picks under the victory rules from killed men), but the band is **weakened**, not destroyed:

- it calls `weakenParty`, with the C4 fix: it keeps its seed and removes the dead;
- it flees, with `idle` set to 6 h;
- if its captain survived, he stays with the band. The band is marked as having escaped (`PartyState.escaped += 1`), which campaign-events.md reads for the "rival returns" event.

## Formulas

### F1. Press time for small armies

```
pressAfter = min(D.pressAfterS, PRESS_BASE_S + PRESS_PER_MAN_S × n)
```

| Symbol | Type | Range | Description |
| --- | --- | --- | --- |
| D.pressAfterS | float s | 6–30 | the doctrine's idle-breaker start |
| PRESS_BASE_S | float s | 2–8 (default 4) | knob |
| PRESS_PER_MAN_S | float s | 0.5–2 (default 1.5) | knob |
| n | int | 1–64 | the bot side's active men at battle start |
| pressAfter | float s | 5.5–30 | the result, bounded by D.pressAfterS |

**Output range.** At least 5.5 s (n = 1). At most `D.pressAfterS`: for `steady`, 25 s from n ≥ 14.

**Worked examples** (`steady`):

| Men | Calculation | pressAfter |
| --- | --- | --- |
| 5 | min(25, 4 + 7.5) | **11.5 s**, against 25 s today |
| 10 | min(25, 19) | 19 s |
| 20 | — | 25 s (unchanged) |

### F2. Timer jitter

```
t = base × (1 + J × (2 × r − 1))
```

| Symbol | Type | Range | Description |
| --- | --- | --- | --- |
| base | float s | doctrine field | the timer |
| J | float | 0–0.25 | `D.jitter` |
| r | float | [0, 1) | the bot's own seeded RNG (`seed ^ 0x5bd1e995·(side+1)`), drawn once per timer at battle start |
| t | float s | base × [1−J, 1+J] | the jittered timer |

**Example.** rush `flankAtS` = 6 with J = 0.15 lands in 5.1–6.9 s.

Every timer is drawn once, in a fixed field order, at `BotAI` construction, so the result is deterministic.

### F3. Bounty

```
bounty = BOUNTY_BASE + BOUNTY_PER_LV × L
```

The defaults are 40 + 15·L, with L in 3–10. That gives **85–190 gold**, about one battle's pay, so it's worth a target choice without breaking the economy (E1).

## Edge Cases

- **No doctrine in the setup** (old setups, tests, harness): use `steady`, whose values are exactly today's constants. The `steady` replay hashes must match `SIM_VERSION` 1 for battles without other train-2 features (test).
- **Retreat on the last tick, or when the player has already won**: the end check runs first, so retreat is ignored once the battle has ended.
- **The captain is detached or alone in a group**: the aura and banner-loss rules still apply by distance (abilities.md R5).
- **The captain is the band's only man**: he can still be captured or killed, and the bounty applies.
- **Doctrine `zealot` with cavalry**: `feint` is false, so the cavalry uses the plain charge loop.
- **Both sides are bots with different doctrines** (harness, war neutrals vs neutrals): each `BotAI` reads its own army's doctrine.
- **Live PvP**: humans have no doctrine, and the field is ignored for non-bot armies.
- **A band beaten by retreat repeatedly**: `escaped` is capped at 3. At 3, the band's `retreatAt` is treated as 0 (it fights to the end).

## Dependencies

| System / GDD | Direction | Contract |
| --- | --- | --- |
| formations-orders.md | uses | `face`, `focus`, `feint` orders and the `orb` shape for bot play |
| abilities.md | uses | standard rules (R5), signature actives, bot ability use |
| battle-readability.md | is used by | the doctrine chip and the captain crest are drawn there |
| controls.md | is used by | encounter and deployment info surfaces (doctrine tell) |
| campaign-arc.md | is used by | lair-garrison and final-host doctrine assignment; captains in garrisons |
| campaign-events.md | is used by | reads `PartyState.escaped` for "rival returns"; the "rival challenge" event spawns a captain band |
| field-works.md | is used by | bots attacking works obey `hillFlank`-style detours; zealot ignores stakes |
| #11 Enemy army generation (`src/game/enemy.ts`) | modifies | `buildArmy({doctrine, captain})` |
| #32 Verification / #34 Lockstep | constrains | sim train 2, zod schema |

### Cross-References

| Target GDD | Specific Element Referenced | Nature |
| --- | --- | --- |
| formations-orders.md | R1 `face`, R4 `focus`, R3 `feint`, R2 `orb` | uses |
| abilities.md | R5 Standard bearer, R3 signature actives, R6 bot use | uses |
| battle-readability.md | R2 badges (captain crest) | rendered by |
| campaign-arc.md | R4 garrison doctrines | provides data to |
| campaign-events.md | "rival returns", `escaped` | provides data to |

## Tuning Knobs

All knobs live in `src/data/doctrines.ts`. There is no `assets/data/`, so data lives in `src/data` like the rest of the game.

| Knob | Default | Range | Category | Rationale |
| --- | --- | --- | --- | --- |
| Per-doctrine fields (R2) | table | see R2 | feel | the identity of each doctrine |
| PRESS_BASE_S | 4 | 2–8 | feel | small fights start fast (P1) |
| PRESS_PER_MAN_S | 1.5 | 0.5–2 | feel | big armies keep their manoeuvre time |
| CAPTAIN_LEVEL_BONUS | 2 | 1–3 | curve | a captain should be the best man on the field |
| CAPTAIN_MIN_TIER | 2 | 2–3 | gate | the first bands stay simple |
| BOUNTY_BASE / BOUNTY_PER_LV | 40 / 15 | 20–60 / 5–20 | curve | about one battle's pay |
| ESCAPE_CAP | 3 | 1–5 | gate | stops endless retreats |

## Touch UI needs

- **Encounter dialog** (the Mosaic BottomPanel that replaces the legacy dialog, UI WLD-2) gets one doctrine row (icon, name, tell) and one captain row. Both are text, at least 6.5 UI px, and nothing is hidden behind long-press (G15).
- **Battle top bar**: a doctrine chip (44 pt hit target; a tap shows the tell and the counters while paused).
- **Captain crest** over the captain on the field, which is also his badge. Tapping the captain with a group selected issues the normal attack, or `focus` for missile groups.
- **Codex**: a doctrine list.
- **Strings**: every new string goes through i18n, in en and ru (G12).

## Online and server impact

- **Sim train 2 (V5-012).** The AI runs inside the server replay (`server/src/battle.ts` re-derives bot orders), so every doctrine, the jitter and the captains are sim changes. They ship only in the `SIM_VERSION` 2 train.
- **zod** (`server/src/battle.ts`):
  - `ArmySpec.doctrine`: an optional `z.enum([...DoctrineId])`;
  - `UnitSpec.captain`: an optional `z.boolean()`.
  - A missing field means `steady` / false.
- **Server-built setups.** The duel ladder (`src/duel/ladder.ts`, shared) and the war-map neutrals (`server/src/online/*`) set the doctrine through the shared builder.
- **Async defence doctrine** (optional, Alpha):
  - a nullable `doctrine` column on the defence preset (a D1 migration);
  - a picker in the Duel Team view;
  - the server validates the enum.
  - It touches `server/src/duel/async.ts`, `src/duel/*` and DuelScene.
- **Live duels**: no impact (no bots).

## Save impact

- `PartyState.escaped?: number` (default 0) and `PartyState.captainDead?: boolean` (default false), both read with defaults.
- They're included in the **one v5 campaign save bump** (the SAVE_VERSION after S4-FIX-SAVES). Validation allows the optional fields. No data is rewritten.
- The doctrine itself is **derived** (band kind plus culture) and never saved.

## Balance targets (`npm run balance`)

New harness rows go in `src/dev/balance.ts` (`doctrineMatrix`), at 400 seeds.

| Test | Target |
| --- | --- |
| Reference army (steady) vs each doctrine | the reference wins **40–60%** against each |
| Doctrine median battle length | 60–150 s; rush ≤ 90 s; hammer and swarm ≥ 80 s |
| Counter script vs doctrine (rush ← brace and hold; hammer ← reserve faced to the flank or orb; swarm ← fast advance and cavalry; zealot ← missile focus and feint) | the counter beats the doctrine by **≥ 8 points** more than the naive script does |
| 5v5 level-1 armies, first contact | **≤ 15 s** (from 33 s) |
| Ridge defender vs attacker (attacker doctrine with hillFlank) | **62–68%** (from 74%) |
| Captain present vs absent (same band) | the captain adds **+5 to +10 points** to the band |
| Kill-captain script vs ignore-captain script | killing the captain gains **≥ 6 points** |

## Acceptance Criteria

- [ ] With `doctrine` missing or `steady`, a fixed set of v1 battle logs replays to identical hashes (except where other train-2 features are present).
- [ ] Every doctrine field is read from `src/data/doctrines.ts`, and no timer literal remains in `ai.ts` outside the `steady` defaults.
- [ ] The doctrine and captain fields round-trip through the server zod and the replay (a server test).
- [ ] A 5v5 campaign battle reaches contact in 15 s or less (a balance row plus a playtest).
- [ ] The encounter dialog shows the doctrine, its tell and the captain at 390, 360 and 320 widths with no truncation (layout check).
- [ ] A swarm band retreats, then reappears weakened with the same captain (campaign test).
- [ ] *Experiential*: in a playtest, players can name an enemy band's doctrine after two fights against it.

## Files touched

- **Sim**: `src/sim/ai.ts`, `src/sim/types.ts`, new `src/data/doctrines.ts`.
- **Game**: `src/game/enemy.ts`, `src/game/report.ts`, `src/game/campaign.ts`.
- **World**: `src/world/world.ts` (`spawnParty`, `weakenParty` C4 fix, `PartyState`).
- **Duels**: `src/duel/ladder.ts`.
- **Scenes**: `src/scenes/WorldScene.ts` (encounter), `src/scenes/BattleScene.ts`, `src/ui/battleHud.ts`, the Codex scene (`src/scenes/CodexScene.ts`), `src/i18n/*`.
- **Server**: `server/src/battle.ts`, `server/src/online/*` (neutrals); optionally `server/src/duel/async.ts` plus a migration.
- **Dev and tests**: `src/dev/balance.ts`, `tests/ai*.test.ts`.
