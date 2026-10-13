# Battle Readability and Feel

> **Type**: Addition (quick-design) to system #24 Battle presentation and #27 Audio. Presentation only, so it needs **no sim version**.
> **Status**: Implemented
> **Pillars**: P2 Read it at a glance, P4 Every man has a name (explained losses)
> **Fixes**: PLAY R1, R2, R3, R4/B5, F1, F3, O5; UI BTL-1, BTL-4, BTL-11, G3, G13
> **Legacy reference**: docs/UI_KIT.md "Battle HUD"; PLAY.md "Battle readability", "Game feel"

## Overview

The sim already computes everything that decides a battle: per-man morale, `flanked` and `rout` events, ranges. The screen shows almost none of it. This GDD puts the battle's state **on the field**:

- morale glyphs;
- flank arcs;
- labelled bars;
- state badges for the v5 mechanics.

It gives the big three moments **weight**: the charge impact, the rout and the ability. And it explains every defeat with **one "why" line**. It reads sim state and events, and changes no sim rule.

The new events it reads are `cohesion`, `disordered` and `armyBreak` (formations-orders.md R7), `standardLost` (abilities.md R5) and `stakesBreak` (field-works.md R2). They're emitted by the train-2 sim changes in those GDDs. Events are outputs and don't enter `Battle.hash()`.

## Player Fantasy

"I can see group II wavering, and red arcs on its left: they're flanked. Pull the reserve over. Thud, shake, a horn: their line breaks."

The aesthetics are Sensation and Competence.

## Detailed Rules

### R1. Morale state glyph

Each group badge on the field and each group card shows one glyph:

| State | Rule (from read-only sim state) | Glyph | Extra |
| --- | --- | --- | --- |
| **Steady** | otherwise | a whole shield | |
| **Wavering** | at least 1/3 of the group's non-routing men are below **50%** of their max morale | a cracked shield | a slow 1 Hz pulse; the reduce-motion setting turns it static |
| **Routing** | the group's `routed` flag is set | a fleeing-flag glyph | |
| **Broken army** | after the side's `armyBreak` event | an army-wide banner, plus a fleeing-flag on every badge | |

Glyphs are shapes, readable without colour (V5-013). Their tint follows the state: ink, amber, red. Red is allowed here because routing is an alert (G3).

### R2. Badges

The field badge over each group shows:

- its **numeral**, in the group colour;
- the **morale glyph** (R1).

It can also carry these markers:

| Marker | Shape | Shown when |
| --- | --- | --- |
| Focus reticle | crosshair | focus is set, on the target group's badge and the shooter's card (formations-orders.md R4) |
| Disordered | ragged line | for its 3 s (formations-orders.md R3) |
| Feinting | curved arrow | while any group, ours or the enemy's, is feinting (formations-orders.md R3.5) |
| Standard | banner | over the bearer, and on his card (abilities.md R5) |
| Captain crest | crest | over an enemy captain (ai-doctrines.md R6) |
| Queued step | an arrow plus the order icon | while a "Then…" step is queued (controls.md R6) |

- **Badge size**: about 30 pt, as today, on top of the men.
- **The badge never hides the men**: it is drawn above the group's front rank and fades to 60% when the camera zoom is at 2× or more.

### R3. Group card readout (fixes R1, BTL-11)

- **Two bars**, each at least **5 UI px** tall, labelled **HP** and **MOR** in small caps (6.5 UI px) the first 3 times they're seen. After that a 1-letter label stays (H / M).
- **The state line**:
  - the order ("Advancing", "Holding", "→ Charge" when queued);
  - **"Out of range"** under the controls.md R3.4 condition, which reads `focusOutOfRange` and `noTargetS` (formations-orders.md R4);
  - **"Flanked!"** for 2 s after a `flanked` event.
- **The glyph** (R1) at the left, by the numeral.

### R4. Field events and juice tiers (fixes F1, R2, R3, R4)

| Event | Visual | Shake (trauma) | Hit-stop | Audio (existing hooks, plus new ones) |
| --- | --- | --- | --- | --- |
| Routine hit | the existing spark, block and blood decals | — | — | the existing clash and block |
| **Damage number** | **only** on a charge impact and a kill, at 9 UI px, for 600 ms | — | — | — |
| **Flank threat** (presentation only) | a **dashed** arc on the side an enemy group is entering, when it heads into our flank sector within 8 paces | — | — | — |
| **Flanked** (`flanked`) | a **red arc with chevrons** on the threatened side of the badge (±60° around the attack direction), for 2 s | — | — | a short low horn (exists) |
| **Charge impact** (`impact`) | a dust puff at the contact line | **0.2** | **60 ms**, on the sprites of the two groups only, not the whole scene | a heavy thud layered on the clash |
| **Group rout** (`rout`, group edge) | a dust burst, and fleeing-flag glyphs | **0.4** | — | the rout horn (exists), plus a crowd groan |
| **Cohesion shock** (`cohesion`, formations-orders.md R5) | a ripple ring from the routed group to the shaken neighbours | 0.1 | — | — |
| **Ability use** (`ability`) | a flash ring in the ability's colour, plus its icon popping over the holder | 0.15 | 40 ms on the holder only | the ability sting |
| **Standard lost** (`standardLost`, abilities.md R5) | a banner falling, and a ripple | 0.3 | — | a broken-horn sting |
| **Army break** (`armyBreak`, formations-orders.md R6) | an army-wide banner, "Their army breaks!" or "Our army breaks!" | 0.3 | — | a horn chord |
| **Broken on the stakes** (`stakesBreak`, field-works.md R2) | a splinter burst | 0.2 | 60 ms | a wood crack |

- **Trauma model**: the standard trauma² shake, decaying 1.5/s, with a maximum offset of 6 px at 390 width. **Reduce shake** scales it ×0 and **Reduce flash** turns off the flash rings (controls.md R11).
- **Banners** (top-centre) expire after **6 s**, or earlier when their condition is false (fixes R4/B5). "Contact soon" is recomputed every second from the real distance under 6 paces.
- **The Paused pill and boss bar** (fixes BTL-1): the boss HP bar gets its own row under the top bar, and the hint and paused pill move below it. Paused uses an **hourglass** glyph, not a red "!" (fixes BTL-4).

### R5. "Why" line (fixes O5)

`src/game/report.ts` builds **one cause line** for the Results summary from the battle's events and end state. The first matching rule, in this priority:

| # | Condition | Line |
| --- | --- | --- |
| 1 | Our `standardLost` before our first rout | "We lost the standard, and the line wavered." |
| 2 | Our first routed group had a `flanked` event within 10 s before its rout | "{Group} was flanked and broke." |
| 3 | At first contact we had fewer active men, with ratio r ≤ 0.75 | "Outnumbered {a} to {b} at the clash." |
| 4 | Our missile groups spent more than 30% of the battle out of range (`focusOutOfRange`, or `noTargetS` > 3; formations-orders.md R4) | "Our missiles were out of range most of the fight." |
| 5 | The enemy doctrine was `rush`, and our main line wasn't braced at contact | "They charged before our spears were set." |
| 6 | Our side's `armyBreak`, only when no earlier rule matched | "Our army broke after {n} groups routed." |
| 7 | Otherwise | "Their line held longer than ours." |

- A **victory** gets the mirror lines ("We broke their flank at 0:42."). A victory by enemy retreat (ai-doctrines.md R8) gets "They withdrew at {t}."
- Army break is the last real rule because it ends most defeats. The line reports the cause that came before it.
- The line goes under the Results banner, and into the duel and war reports through the shared `report.ts`.

### R6. Scene transitions (fixes F3)

- Map → deployment and battle → Results: a **180 ms** fade through parchment.
- Reduce motion: an instant cut.

## Formulas

### F1. Shake

```
offset = MAX_OFFSET × trauma² × noise(t)
trauma ← max(0, trauma − 1.5 × dt)
```

- Trauma is clamped to [0, 1], and each event adds its trauma (R4) up to 1.
- `MAX_OFFSET` = 6 px at 390 width, scaled with the width.
- `noise(t)` is a seeded value noise in presentation code only, **never** the sim RNG.

**Example**: a rout (0.4) gives 6 × 0.16 = about 1 px. Rout plus army break (0.7) gives about 2.9 px.

### F2. Wavering share

```
wavering = count(m ∈ G, ¬routing(m), morale(m) < 0.5 × maxMorale(m)) ≥ ceil(|G_nonrouting| / 3)
```

## Edge Cases

- **A group of 1 man**: wavering when he's below 50%.
- **Several flanked events on one group**: the arc refreshes and doesn't stack. Two sides threatened draws two arcs.
- **Beasts**: no morale glyph, because animals and myth bosses have their own HP and state UI (as today).
- **Online, no pause**: everything here works live. Hit-stop applies only to presentation sprites and never stalls the sim tick, which is critical in lockstep.
- **A defeat by retreat**: the why line uses the state at the moment of retreat, and adds "We withdrew".
- **Reduce motion on**: pulses become static, shakes become 0, hit-stop is kept (it's not motion), and fades become cuts.

## Dependencies

| System / GDD | Direction | Contract |
| --- | --- | --- |
| formations-orders.md | uses | the `cohesion`, `armyBreak` and `disordered` events; `focusOutOfRange` and `noTargetS` |
| abilities.md | uses | the `standardLost` event, the bearer flag, `ability` events |
| ai-doctrines.md | uses | the captain flag, the doctrine for why-line rule 5 |
| controls.md | uses / is used by | shared glyphs; settings (Reduce shake and flash); the queued-step marker |
| field-works.md | uses | the `stakesBreak` event ("broken on the stakes") |
| campaign-arc.md | is used by | the Victory variant of Results uses the why line |
| #18 Loot and battle report (`src/game/report.ts`) | modifies | adds `why` to the report model |
| #27 Audio (`src/audio/hooks.ts`) | modifies | new hooks for the new events |

### Cross-References

| Target GDD | Specific Element Referenced | Nature |
| --- | --- | --- |
| formations-orders.md | R5 cohesion, R6 army break, R3 disorder, R4 focus | renders |
| abilities.md | R5 standard | renders |
| ai-doctrines.md | R6 captain, R2 doctrines | renders |
| controls.md | R11 accessibility settings | shares |
| field-works.md | R2 `stakesBreak` | renders |
| campaign-arc.md | R5 Victory variant | is used by |

## Tuning Knobs

The knobs live in `src/ui/battleFx.ts` and `src/ui/battleHud.ts` constants.

| Knob | Default | Range | Category |
| --- | --- | --- | --- |
| WAVER_SHARE / WAVER_MORALE | 1/3 / 0.5 | 0.25–0.5 / 0.4–0.6 | feel |
| Trauma per event (R4) | table | 0–0.5 | feel |
| MAX_OFFSET | 6 px | 3–10 | feel |
| HITSTOP_MS (impact / ability) | 60 / 40 | 0–100 | feel |
| FLANK_ARC_S | 2 | 1–4 | feel |
| BANNER_TTL_S | 6 | 3–10 | feel |
| FADE_MS | 180 | 120–250 | feel |
| BAR_LABEL_SEEN | 3 | 1–5 | feel |

## Touch UI needs

- No new controls. Everything is readout.
- **Sizes**: glyphs are 10–12 pt on badges and cards. The bars are at least 5 UI px. The why line is at least 6.5 UI px and may wrap to 2 lines, never ellipsized.
- The layout check gets new fixtures: `battle-wavering`, `battle-flanked`, `battle-beast-paused` (BTL-1), and `results-why`.
- New strings: the why lines and banners, in i18n en and ru.

## Online and server impact

- **None for the sim.** The new events come from the GDDs that add the rules (train 2). Events aren't part of the hash.
- **`report.ts` is shared** by the duel and war reports. The server builds reports from replays, so the `why` field is computed client-side from the replayed events and isn't trusted for rewards. That means no server change. If the server builds the report text, `why` is an optional field.

## Save impact

None. The settings are owned by controls.md.

## Balance targets

This is presentation, so `npm run balance` is unaffected. The check is that **the balance harness numbers don't move** (a regression guard: run `npm run balance` before and after, with differences within noise).

**Playtest targets** (the PLAY method):

| Measure | Target |
| --- | --- |
| Testers who can say who is winning, and why, at a random pause | **≥ 4 of 5** |
| Defeats with an explaining why-line | **100%** |
| "Teal bar?"-style confusion reports | **0** |
| Real decisions per battle at **20 men** (attention-budget check) | **≥ 10**, with no tester reporting overload |

## Acceptance Criteria

- [ ] The glyph states follow F2 and the routed flag (unit test on a pure `groupState()` function).
- [ ] The flank arc is drawn on the correct side for front, side and rear events (a geometry unit test).
- [ ] The juice tiers respect the settings: with Reduce shake, the offset is always 0.
- [ ] Hit-stop never pauses the sim tick (a test: the tick count during a hit-stop equals the tick count without one).
- [ ] The why-line rules select correctly on recorded event fixtures, one per rule.
- [ ] Banners expire at 6 s or on a false condition.
- [ ] The beast battle's paused state doesn't cover the boss bar (layout check).
- [ ] *Experiential*: a playtester describes the battle's turning point without prompting.

## Files touched

- **Battle presentation**: `src/ui/battleHud.ts`, `src/ui/battlePanel.ts`, `src/ui/battleFx.ts`, `src/scenes/BattleScene.ts`.
- **Results**: `src/scenes/ResultsScene.ts`, `src/game/report.ts`.
- **Audio and motion**: `src/audio/hooks.ts`, `src/ui/motion.ts`.
- **Art and copy**: `src/art/icons*` (glyphs), `src/i18n/*`.
- **Tests**: `scripts/layout-check.mjs`.
