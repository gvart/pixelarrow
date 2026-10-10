# Perk Paths, Signature Actives and the Standard

> **Type**: Addition (quick-design) to systems #7 Orders and abilities, #16 Heroes and progression and #3 Unit stat derivation
> **Status**: Draft (S2-VISION, 2026-10-10)
> **Vision rank**: 3 of 6
> **Pillars**: P4 Every man has a name, P1 The line decides, P3 Command from the thumb (medallion budget)
> **Fixes**: MECH H1, H2, H3, H4 (partly), M2; BASELINE "Abilities worth 0–5 points", R1 and R3 (partly)
> **Legacy reference**: docs/GAMEPLAY.md "Hero progression"; MECHANICS.md §1.6, §2.1

## Overview

There are four parts:

1. Each class's linear five-perk chain becomes **five tiers of two options (A/B)**, so every perk level-up is a decision. A is today's perk, so existing heroes keep their path.
2. Tier 2's B option is the class family's new **signature active**: seven new actives, which give the elites, cavalry, chariots and shock troops an identity.
3. The four existing actives and three auras are **re-tuned** to be worth 5–10 points each.
4. A **Standard** gives the army a morale lever that lives in one hero: a strong aura, one rally per battle, and a real cost if he falls. Enemy captains carry the same standard (ai-doctrines.md R6).

## Player Fantasy

"Kleon reached level 4. Shield Bash or Push of Pike? He holds the centre, so Push. And at level 8 he takes the Standard, because the men fight better under it."

The aesthetics are Expression and Fantasy, with Challenge.

## Detailed Rules

### R1. Perk paths

1. `ClassDef.tree` changes from `PerkId[5]` to `[PerkId, PerkId][5]`, meaning `[A, B]` per tier. A is today's perk at that tier.
2. At a perk level (2, 4, 6, 8, 10; `PERK_LEVELS` is unchanged) the hero takes **one** of A or B for that tier.
   - Prerequisite: **any** perk of the previous tier, not a specific one.
   - `perkBlocker` checks the tier, the level and the free slot. A second pick in the same tier is refused ("Path chosen").
3. The choice is permanent, except through a retrain (R7).
4. **B options by family.** A is always today's perk:

| Family (classes) | T1 (Lv2) B | T2 (Lv4) B: signature active | T3 (Lv6) B | T4 (Lv8) B | T5 (Lv10) B |
| --- | --- | --- | --- | --- | --- |
| Line (militia, hoplite, thureophoros) | `drilled` / `shield_drill` (the other one) | **`push`** Push of Pike | `iron_discipline` | **`standard_bearer`** | `warlord` |
| Elite (royal guard, Sacred Band) | `drilled` | **`bond`** Sacred Bond | `phalangite` | **`standard_bearer`** | `unbreakable` / `warlord` (the other one) |
| Shock (Celt, Gaul, fanatic) | `zealot` / `brawler` (the other one) | **`warcry`** War-cry | `reaping_blow` | **`standard_bearer`** | `unbreakable` |
| Breakers (falx, rhomphaia) | `brawler` | **`sunder`** Sunder | `bloodlust` | `rally_cry` | `unbreakable` |
| Missile (archer, slinger, javelineer, peltast) | `fleet` / `longshot` (the other one) | **`aimed`** Aimed Volley | `parthian_shot` (rider) / `lead_bullets` (foot) | `steady_presence` | `warlord` |
| Horse (Companion, Thessalian, horse archer) | `fleet` | **`wheel`** Wheel and Re-charge (horse archer: `aimed`) | `lance_charge` / `ride_down` (the other one) | `standard_bearer` | `skirmish_master` / `warlord` (the other one) |
| Chariot | `fleet` | **`scythe`** Scythe Run | `lance_charge` | `rally_cry` | `skirmish_master` |

   - "(the other one)" means the B option is whichever of the two listed perks the class's A is not.
   - Where a B would equal the A of that class, the class implementation picks the nearest unused perk from the same family column. The full per-class table goes in `src/data/classes.ts`, and the story checks that every class has 10 distinct perks.
   - Only `standard_bearer` and the seven actives are new **ids**. Every other B reuses an existing perk, so the art and copy cost stays small.

### R2. Existing actives and auras, re-tuned (H2)

Today every perk is worth 0–5 points. Target: **5–10 points each**.

| Perk | Today | v5 |
| --- | --- | --- |
| Shield Bash | daze 2 s, +20% damage taken | daze **2.5 s**, **+25%** |
| Volley | 2 free shots | **3** free shots |
| Berserk | 8 s | unchanged (+5 pts already) |
| Rally Cry | +35% morale, radius 4 | **+40%**, radius 4 |
| Steady Presence | −20% morale damage, +1/s | unchanged (+4) |
| Eagle Eye | +12% acc, +15% missile damage, radius 5 | **+15% acc, +30% damage, radius 6** (dead today at 0 points) |
| Warlord | +12% melee damage | **+15%** |

### R3. The seven signature actives

These are new `AbilityId`s. Each is a `{kind:'ability'}` order, validated by the sim, with its cooldown shortened by WIL as today.

| Id | Name | Holder | Cooldown | Effect | Needs |
| --- | --- | --- | --- | --- | --- |
| `push` | Push of Pike | line | 16 s | Every holder in the group who is in frontal melee shoves his foe back 0.8 pace. The foe is staggered 1 s (no attack, block ×0.5) and takes −4 morale. **No effect on a braced shield wall.** | frontal melee contact |
| `bond` | Sacred Bond | elite | 40 s | For 10 s, morale damage to any bonded man within 4 paces is split equally among all bonded men in range. Bonded men can't rout while the average bonded morale is above routAt. | at least 2 holders within 4 |
| `warcry` | War-cry | shock | 30 s | Enemies within 5 paces in front lose 8 morale (×1.5 if they are not in a shield wall). Allies within 4 get +0.2 charge shock for 6 s. `groupMode: 'one'`. | an enemy within 5 |
| `sunder` | Sunder | breakers | 18 s | The target in front loses **all block** and −3 armour for 6 s. | an enemy within reach, in front |
| `aimed` | Aimed Volley | missile | 20 s | Every shooter in the group within range of the **focused** group (formations-orders.md R4) looses one shot at it with +25% accuracy and +20% damage. `groupMode: 'one'`. | `focus` set, and at least 1 shooter in range |
| `wheel` | Wheel and Re-charge | horse | 25 s | The riders disengage at once with no free hits against them, regroup for 2 s, and their next charge has **+0.4 charge bonus**. | riders in melee, or within 6 of an enemy |
| `scythe` | Scythe Run | chariot | 30 s | The chariot drives 6 paces along its facing. Every enemy within 0.8 of the path takes a hit (base damage ×0.8) and −8 morale. Braced spears in the path stop the run (a braced bounce). | the path is clear of rocks or sea |

### R4. The medallion budget (P3 anti-pillar)

- At most **3 ability medallions** are visible for a selection. They're ranked by: ready first, then the most holders, then the shortest cooldown. Extra abilities are reached with a "more" chevron, which opens a 2-row sheet while paused.
- The war **Horn** (an army consumable) is pinned in the top bar, not on the rail.

### R5. The Standard (MECH M2)

This is the shared rule, and ai-doctrines.md R6 uses it for captains.

1. **Bearer.**
   - The player's army: the highest-level hero with `standard_bearer` among the fielded heroes carries the standard. Ties go to the lower hero id. **One standard per army.**
   - An enemy army: its captain (`UnitSpec.captain`), who needs no perk.
2. **Standard aura.**
   - Radius `STD_RADIUS` (4 paces), plus the WIL radius bonus.
   - Allies inside take **−15% morale damage**. This does **not** stack with Steady Presence: the larger reduction applies.
   - They also regain +0.5 morale/s while not in melee.
   - Cohesion shocks are halved (formations-orders.md R5).
3. **Raise the standard** (the active `standard`, **once per battle**): allies within 6 paces regain 20% of max morale, and routing men within 6 turn back if their morale is at or above 30%.
4. **Banner loss.** When the bearer dies or is knocked out:
   - own units within `BANNER_LOSS_RADIUS` (6) lose `BANNER_LOSS_SELF` (12) morale;
   - enemy units within 6 gain `BANNER_LOSS_ENEMY` (+5);
   - a `standardLost` event is emitted.

   **The standard does not pass to another hero**: losing it is the cost.
5. The bearer is drawn with a banner sprite. This is the readability requirement (battle-readability.md R2).

### R6. Bot development and ability use

- **`autoDevelop`** (`src/game/heroes.ts`) picks B where B is the family's signature active (tier 2), or `standard_bearer` when the army doesn't already have one. Otherwise it picks A. The choice is deterministic (no RNG), so ladder floors stay pure functions.
- **Bot use**, checked every think (10 ticks):

| Ability | The bot uses it when |
| --- | --- |
| `push` | in frontal melee and the foe isn't braced |
| `bond` | the group's morale share is below 0.6 in melee |
| `warcry` | at first contact, or the enemy within 5 is wavering |
| `sunder` | under the same condition as bash |
| `aimed` | focus is set and ≥ 2 shooters are in range (a doctrine with `focusMissiles` sets focus) |
| `wheel` | riders have been locked in melee longer than `CAV_MELEE_S` |
| `scythe` | ≥ 3 enemies lie in the path |
| `standard` | ≥ 3 allies within 6 are routing |

### R7. Retrain

- **Campaign**: a **town drillmaster** retrains one tier's choice for `RETRAIN_COST × tier` gold (default 40 × tier). This is also a gold sink (E2).
- **Duels**: the existing online respec route (`src/duel/heroSource.ts`) covers it.

## Formulas

### F1. Bond morale split

```
ΔM_i = ΔM_hit / k
```

`k` is the number of bonded men within 4 paces of the man hit, including him (k ≥ 1). For example, 12 morale damage over 4 bonded men is −3 each. The total is conserved: bond spreads damage, it doesn't reduce it. It delays the rout. It never prevents it.

### F2. Standard morale damage reduction

```
mult = 1 − max(R_steady, R_std)
```

`R_std` = 0.15 and `R_steady` = 0.2 (or 0 without the aura). The output range is 0.8–1.0.

### F3. Retrain cost

```
cost = RETRAIN_COST × tier
```

With tiers 1–5 that's **40–200 gold**.

## Edge Cases

- **Old saves.** Every saved perk id is an A option, so the saved path is the A path. Nothing is lost. A hero holding two perks of one tier is impossible today: the linear chain allowed one per tier.
- **Old duel heroes in D1.** The same applies: perks are validated by the shared `perkBlocker`, which now accepts A or B.
- **No `standard_bearer` in the army**: no standard. That's fine, the horn and Rally Cry remain.
- **The bearer detached (Solo)**: the aura follows him.
- **The bearer in a routing state**: the aura is suspended while he routes, and the standard isn't lost.
- **`aimed` with focus out of range**: unusable. The medallion says "Out of range" (controls.md R3).
- **`scythe` on a beast**: hits apply, but the morale effect doesn't (beasts have their own rules).
- **`bond` with one holder in range**: unusable, with the reason "Needs a second bonded man".
- **`push` against an orb**: works. An orb isn't braced unless it's ordered to brace.

## Dependencies

| System / GDD | Direction | Contract |
| --- | --- | --- |
| formations-orders.md | uses | `focus` for `aimed`; cohesion halving reads the standard aura; `wheel` builds on R1 face/turn |
| ai-doctrines.md | is used by | captains are standard bearers; bot ability rules (R6) |
| controls.md | is used by | the medallion budget, "more" sheet, reasons on tap |
| battle-readability.md | is used by | the banner sprite, the `standardLost` event, the ability flash ring |
| campaign-events.md | is used by | the "Oracle" event grants one free retrain |
| campaign-arc.md | is used by | the final host's captain is a standard bearer; level pacing |
| #3 Unit stat derivation (`src/sim/stats.ts`) | modifies | B passives and auras feed stats |
| #36 Duels | constrains | `perkBlocker` is shared with `src/duel/rules.ts` and server validation |

### Cross-References

| Target GDD | Specific Element Referenced | Nature |
| --- | --- | --- |
| formations-orders.md | R4 `focus`, R5 cohesion | uses / is used by |
| ai-doctrines.md | R6 captains | is used by |
| controls.md | R4 medallions | rendered by |
| battle-readability.md | R2 badges, R4 events | rendered by |
| campaign-events.md | "Oracle" | is used by |

## Tuning Knobs

The knobs live in `src/data/perks.ts` (`ABILITIES`, perk magnitudes) and `RULES`.

| Knob | Default | Range | Category | Rationale |
| --- | --- | --- | --- | --- |
| Active cooldowns (R3) | table | 12–60 s | gate | never below 12 s (anti-pillar) |
| Effect magnitudes (R2, R3) | tables | ±30% | curve | 5–10 pts each |
| MAX_MEDALLIONS | 3 | 2–4 | feel | HUD budget |
| STD_RADIUS | 4 | 3–6 | curve | the aura's reach |
| STD morale reduction | 0.15 | 0.1–0.25 | curve | below Steady Presence |
| Raise uses per battle | 1 | 1–2 | gate | a commitment |
| BANNER_LOSS_SELF / ENEMY / RADIUS | 12 / 5 / 6 | 8–20 / 0–10 / 4–8 | curve | the cost of a falling standard |
| RETRAIN_COST | 40 | 20–80 | curve | gold sink |

## Touch UI needs

- **Hero screen, Perks tab** (`src/scenes/HeroScene.ts`): tiers become rows of two cards, A and B. A free point pulses on the tier's two cards. A tap shows the details and a confirm ("Take Push of Pike?"). The taken card is filled and the other is dimmed. The row must fit at 320 (two cards at 44 pt or more; the description goes in the sheet).
- **Medallions**: at most 3, with a "more" chevron. An unusable medallion says why on tap.
- **Standard**: a banner glyph on the bearer's card and over his head. "Raise the standard" is a medallion with a "1" use pip.
- **Town**: a "Drillmaster" row in SettlementScene's services, with its cost.
- **Copy**: every new perk and ability name and description goes in i18n, en and ru.
- **Art**: 8 new icons (7 actives plus the standard) in the icon atlas.

## Online and server impact

- **Sim train 2.** The new actives, the re-tuned magnitudes, B passives in `stats.ts` and the standard rules are all replayed by the server.
- **zod** (`server/src/battle.ts`): the `ability` field is already `z.string().max(32)`. The sim validates the id against `ABILITY_IDS`.
- **Duel server**:
  - `src/duel/rules.ts` validates perks through the shared `perkBlocker`, and `server/src/duel/*` uses it.
  - Duel budget costs are unchanged: a perk choice is free, and both branches cost the same.
  - Ladder floors change, because their armies auto-develop. That ships in the same train.
- **War**: online heroes use the same perk data and server validation.

## Save impact

- **Campaign.** `hero.perks` stays a `PerkId[]`, and the new ids are valid. The save validation's `filter(p in PERKS)` keeps them. Old saves need no data change. There's no new save field: the standard bearer is derived.
- **The save bump**: the new perk ids **must** ride the v5 campaign save bump. An older client that drops unknown perk ids would lose B choices, and the version gate (S4-FIX-SAVES) prevents an old client from loading the save.
- **D1 (duels, war)**: no migration. Perks are stored in the existing hero JSON, and validation is shared code.

## Balance targets (`npm run balance`)

| Test | Target |
| --- | --- |
| Each re-tuned or new active, mirror (`perkImpact`, 320 seeds) | **+5 to +10 pts** |
| A vs B per tier, same class, mirror | **\|A − B\| ≤ 6 pts** (both viable) |
| Standard vs none (reference army) | **+5 to +8 pts** |
| Bearer killed at 30 s vs not | the losing side's rout comes **≥ 15% sooner** |
| Royal guard / Sacred Band round-robin mean (with bond) | **≥ 46%**, and no cell against shock infantry above 85% (with the R1 re-cost story) |
| Companion flank test (6 hoplites + 2 Companions) with `wheel` | **≥ 58%** (from 54%) |
| Chariot vs militia with `scythe` | **≥ 30%** (from 0%) |
| Archer and slinger mean with `aimed` + focus | **≥ 40%** |

## Acceptance Criteria

- [ ] Each class has 5 tiers × 2 distinct perks. `perkBlocker` accepts A or B per tier and refuses a second pick in a tier.
- [ ] Old saves and old D1 heroes load with their A path intact (migration test with real v5 fixtures).
- [ ] Each new active has a unit test, a bot-use test and a replay-determinism test. The server replays a log containing all of them.
- [ ] The medallion rail never shows more than 3.
- [ ] Banner loss fires once. Captains apply it (shared rule).
- [ ] The Hero Perks tab fits at 320x640 (layout check).
- [ ] *Experiential*: in a playtest, players hesitate at a level-up and can explain their choice.

## Files touched

- **Data**: `src/data/perks.ts` (`AbilityId`, `ABILITIES`, `PERKS`, `perkBlocker`), `src/data/classes.ts` (`tree`).
- **Sim**: `src/sim/battle.ts` (`useAbility`, the standard aura, banner loss), `src/sim/stats.ts`, `src/sim/ai.ts` (bot use).
- **Game**: `src/game/heroes.ts` (`autoDevelop`), `src/game/campaign.ts` (retrain), `src/duel/rules.ts`, `src/duel/heroSource.ts`.
- **Scenes and UI**: `src/scenes/HeroScene.ts`, `src/scenes/SettlementScene.ts`, `src/ui/battleHud.ts`, `src/art/icons*`, `src/i18n/*`.
- **Server**: `server/src/duel/*` (shared validation).
- **Dev and tests**: `src/dev/balance.ts` (`perkImpact` rows for every new perk), `tests/abilities.test.ts`.
