# Formations and Orders

> **Type**: Addition (quick-design) to systems #4 Formations, #6 Battle simulation core and #7 Orders and abilities
> **Status**: Draft (S2-VISION, 2026-10-10)
> **Vision rank**: 2 of 6
> **Pillars**: P1 The line decides, P2 Read it at a glance, P5 One sim
> **Fixes**: MECH B2, B3, F1, J2; PLAY P2 (dead endings), C4 (with controls.md)
> **Legacy reference**: docs/GAMEPLAY.md "Rules", "Controls"; MECHANICS.md §1.1–1.4, §2.2

## Overview

There are five changes to the order set, plus two morale rules. Together they turn flanking from one-way into a contest:

1. **Face** turns a group without stopping its order.
2. **Orb**: a formation with no flanks.
3. **Feint**: a feigned retreat for light troops.
4. **Focus**: aimed missile fire at a chosen enemy group.
5. **Group cohesion**: a routing group shakes its own survivors and its neighbours.
6. **Army break**: a beaten army collapses instead of leaving one man walking about.

All of it is deterministic sim, shipped in **sim train 2** (`SIM_VERSION` 2).

## Player Fantasy

"They're swinging horse round our left. Turn the reserve to face them without breaking its advance, and pull the archers onto their slingers. Once their first group breaks, the rest will follow."

The aesthetic is Challenge.

## Detailed Rules

### R1. `face` and the order-reset fix (MECH B2)

1. New order: `{ kind: 'face'; group: number; fx: number; fy: number }`.
   - It sets the group's facing (normalised; a zero vector is ignored) and re-slots the group around its current centre.
   - It **keeps** `g.order`, `fallbackLeft` and `shieldWall`.
2. `form` no longer forces `order = 'hold'` when the order is `advance`, `charge` or `fallback`. Instead:
   - a `form` whose centre moves by **≥ FORM_RESET_DIST** (2 paces) sets `hold`, because a big move is a new position;
   - a smaller move keeps the order.
   - `fallbackLeft` resets only when the order changes.
3. The knob drag in battle (controls.md R2) sends `face`. In deployment it sends `form` as today: there is no order to keep there.
4. **Wheel** is not a separate order: it is `face` applied while advancing. The group pivots on its centre at the turn rate below and keeps advancing along the new facing.

**Turn rate.** A group's facing changes at most `TURN_RATE_DEG` per second while it moves. That's 90°/s for infantry and 60°/s for cavalry; the `orb` shape and a group in melee don't turn. So a wheel takes real time and can be punished.

### R2. The orb (`FormationType 'orb'`)

1. Men stand in a ring 1–2 deep, facing outward. Each slot faces away from the centre.
2. **No flanks**:
   - for a unit in `orb`, `hitDirection` returns **front** whenever the attacker is outside the ring;
   - an attacker inside the ring (a breach) uses the normal rule.
3. **Costs**:
   - speed ×0.4;
   - melee damage ×0.85;
   - missile men in an orb shoot at ×0.7 accuracy;
   - it can't charge: `charge` changes the shape to `line` first, at the group's facing;
   - no shield-wall bonus.
4. Bracing works. Riders cannot form an orb: the button is disabled with a reason.
5. Slot layout: ring radius `r = max(1.2, n × 0.32)` paces (Formulas, F1).

### R3. Feint (`order: 'feint'`)

1. **Eligible**: a group whose men are **all** light infantry, missile men or riders. In code that's `ClassDef.role` `'light'` or `'ranged'`, or a class with a `mount`, in `src/data/classes.ts`. No new tag is needed.
   - In the UI, the order key "Fall back" becomes "Feint" for an eligible group.
   - The server rejects a `feint` sent for an ineligible group: the order is ignored and logged.
2. **Behaviour**:
   - The group falls back at full speed for `FEINT_S` (4 s), without the fallback order's morale cost: it's planned, not panicked.
   - It then **halts, turns about and gets `charge`** with a +0.3 charge bonus for its first blow.
3. **The bait.** An enemy group that pursues a feinting group, meaning it moved more than 3 paces toward it during the feint, ends up **disordered** for 3 s: −15% block and its slots scatter by ±0.3. It is drawn as a ragged line (battle-readability.md).
4. **Cooldown**: per group, `FEINT_CD_S` (30 s).

### R4. Focus fire (`{ kind: 'focus'; group: number; target: number }`) (MECH J2)

1. It sets `g.focus = target`, an enemy group id; −1 clears it.
2. Missile and hybrid men in the group pick targets **within range** from the focused group first. A target is in the focused group if the target man's group id equals `focus`, and the closest such man is chosen. If no member of the focused group is in range, they fall back to the nearest target, which is today's rule.
3. Focus clears automatically when the focused group is gone: all dead, routed or fled.
4. Melee men ignore focus. A tap on an enemy with a melee group selected keeps today's attack behaviour.
5. The `out of range` flag (`g.focusOutOfRange`, read-only state for the HUD) is true when `focus` is set and no man of the group has a focused target in range. controls.md and battle-readability.md show it (fixes C4).

### R5. Group cohesion (MECH B3)

When a group's `routed` flag sets, which is the existing rule at `battle.ts` about L2087 (half the group gone and some routing):

- every **non-routing** member of that group takes **COHESION_SELF** (−10) morale;
- every unit of the same side whose group centre is within **COHESION_RADIUS** (6 paces) of the routed group's centre takes **COHESION_NEAR** (−5) morale;
- both are **halved** for a unit under Steady Presence or a standard aura (abilities.md R5);
- the shock fires once per group per routed-flag rising edge. A group that rallies and routs again triggers it again, at most once every 10 s.

### R6. Army break (PLAY P2)

Each second (every 20 ticks), for each side, take the counts of active men: alive, not routing, not fled, not knocked out.

- A side **breaks** when `active ≤ ARMY_BREAK_SHARE × startMen` **and** `active × ARMY_BREAK_RATIO ≤ enemyActive`. The defaults are 25%, and the enemy having at least 3× the active men.
- A broken side's active men lose **ARMY_BREAK_DRAIN** (4) morale per second, and cannot rally while the condition holds.
- The rule never applies before the first contact, and never to beasts (`kind === 'animal'` units and myth bosses keep their own rules).
- An `armyBreak` event `{ side }` is emitted once, for the HUD (battle-readability.md R4) and the "why we lost" line.

## Formulas

### F1. Orb ring radius

```
r = max(R_MIN, n × R_PER_MAN)
```

| Symbol | Type | Range | Description |
| --- | --- | --- | --- |
| n | int | 1–64 | active men in the group |
| R_MIN | float | 1.2 | the minimum radius in paces |
| R_PER_MAN | float | 0.25–0.4 (0.32) | knob |
| r | float | 1.2–20.5 | the ring radius |

Above 24 men the ring doubles its depth: the radius is computed for `ceil(n/2)`. With that, r is at most 10.2 at n = 64.

**Examples**: n = 8 → 2.56; n = 16 → 5.12; n = 40 → 6.4 (2-deep).

### F2. Army break test

```
broken = contact ∧ (A ≤ s × S0) ∧ (A × k ≤ E)
```

| Symbol | Type | Range | Description |
| --- | --- | --- | --- |
| A | int | 0–64 | own active men |
| S0 | int | 1–64 | own men at the start |
| E | int | 0–64 | enemy active men |
| s | float | 0.15–0.35 (0.25) | `ARMY_BREAK_SHARE` |
| k | float | 2–4 (3) | `ARMY_BREAK_RATIO` |

**Example.** 10 men start; 2 are left active against 7 enemies. 2 ≤ 2.5 and 6 ≤ 7, so the side is broken: −4 morale/s, which routs a fresh man (about 50–70 morale) in roughly 10 s. With 3 left against 7 it is not broken (3 > 2.5), so a real last stand still happens.

### F3. Cohesion shock

```
ΔM = base × (aura ? 0.5 : 1)
```

`base` is −10 (own group) or −5 (a near group). The result is −2.5 to −10 per event. Against a routAt of 25% of about 60 morale (15), one shock alone never routs a healthy man. It tips the wavering ones, which is the intent: a cascade, not a wipe.

## Edge Cases

- **`face` during a charge into contact**: men in melee keep facing their foe (the existing rule). `face` changes only the formation facing for the men who aren't engaged.
- **`face` on a routed group**: ignored, like other orders to routed men.
- **An orb breached by cavalry inside the ring**: the normal direction rule applies, so a breach is punished. That gives cavalry a reason to charge.
- **An orb of 1–2 men**: the radius is R_MIN, and it behaves as a knot.
- **Feint ends inside the enemy deployment edge**: the fall-back clamps to the field bounds, then the turn-about happens.
- **Feint by a group in melee**: allowed. Men disengage as with fallback, and the pursuing enemies count as pursuit for the bait.
- **Focus on a group hidden in a wood**: the forest cover rule still applies, so focus doesn't bypass cover.
- **Army break against beasts**: humans can still break when only beasts remain on the other side (E counts beasts). Beasts never break.
- **Draw at the time limit**: unchanged.
- **Old replays (SIM_VERSION 1)**: rejected by version (V5-012). No compatibility shim is needed.

## Dependencies

| System / GDD | Direction | Contract |
| --- | --- | --- |
| controls.md | is used by | the knob sends `face`; enemy tap → `focus`; the Feint key; the Orb button |
| battle-readability.md | is used by | renders `focusOutOfRange`, the disordered state, the cohesion and armyBreak events |
| ai-doctrines.md | is used by | bots use face, orb, feint, focus |
| abilities.md | uses | standard / Steady Presence halving (R5); the `wheel` active builds on R1 |
| field-works.md | is used by | an orb inside a laager; stakes vs the feint bait |
| #6 Battle simulation core | modifies | `applyOrder`, `hitDirection`, target selection, `updateGroups`, end check |
| #32 / #34 server and lockstep | constrains | zod: the new `kind`s `face`, `focus`; the `order` enum adds `feint`; the `FormationType` enum adds `orb` |

### Cross-References

| Target GDD | Specific Element Referenced | Nature |
| --- | --- | --- |
| controls.md | R2 drag to order, R3 targeting | rendered by |
| battle-readability.md | R2 badges, R4 events | rendered by |
| abilities.md | R5 Standard aura | uses |
| ai-doctrines.md | R2 `feint` / `focusMissiles` fields | is used by |

## Tuning Knobs

The knobs live in `RULES` in `src/sim/battle.ts`, moved to `src/data/rules.ts` if the sim-train story does that.

| Knob | Default | Range | Category | Rationale |
| --- | --- | --- | --- | --- |
| FORM_RESET_DIST | 2 paces | 1–4 | feel | small nudges keep the order |
| TURN_RATE_DEG (foot / horse) | 90 / 60 °/s | 45–180 | feel | a wheel is a commitment |
| ORB speed / dmg / acc | 0.4 / 0.85 / 0.7 | 0.3–0.6 / 0.7–0.95 / 0.5–0.9 | curve | a hard defence with a real cost |
| R_PER_MAN | 0.32 | 0.25–0.4 | feel | ring density |
| FEINT_S / FEINT_CD_S | 4 / 30 s | 2–6 / 20–60 | gate | bait timing |
| FEINT charge bonus | +0.3 | 0–0.5 | curve | the payoff |
| DISORDER_S / block | 3 s / −15% | 2–5 / −5 to −25% | curve | the cost of pursuing |
| COHESION_SELF / NEAR / RADIUS | −10 / −5 / 6 | −5 to −15 / −2 to −8 / 4–8 | curve | cascade strength |
| ARMY_BREAK_SHARE / RATIO / DRAIN | 0.25 / 3 / 4 | 0.15–0.35 / 2–4 / 2–6 | gate | ends dead fights |

## Touch UI needs

- **The knob in battle sends `face`.** A ghost of the old facing stays until release (C1).
- **The Shape sheet** gains **Orb**: an icon of a ring of shields plus a label. It's disabled for riders, with a reason on tap.
- **Order bar**: "Fall back" is renamed "Withdraw" (BTL-5, D8). It becomes **Feint** for eligible groups, with a distinct icon (a curved arrow), plus the cooldown sweep.
- **Focus**: with a missile group selected, tapping an enemy group shows a target reticle on that group's badge. Tapping it again or tapping empty ground clears it (controls.md R3).
- **Range ring** for a selected missile group, and an "out of range" line on its card (controls.md R5, battle-readability.md R3).

## Online and server impact

- **Sim train 2.** Every rule here changes `Battle.hash()` sequences.
- **zod** in `server/src/battle.ts`:
  - add `face` and `focus` to the `Order` discriminated union;
  - add `'feint'` to the `GroupOrder` enum and `'orb'` to the `FormationType` enum.
  - Server-side eligibility (feint) runs inside the sim, which ignores ineligible orders, so it needs no extra code.
- **Lockstep** (`src/online/protocol.ts`): the new orders are plain `Order`s and need no protocol change. The order-count limit (20,000) is unaffected.
- **Duels and war**: all of it applies equally. Duel budget costs are unchanged (no new unit or item).

## Save impact

None. These are sim rules and transient battle state only. Settings are unchanged.

## Balance targets (`npm run balance`)

| Test | Target |
| --- | --- |
| Matched reference vs bot (both may use the new orders) | 45–55% (from 55%) |
| 6 hoplites + 2 Companions flanking vs equal-cost hoplites, defender answers with `face` | the flanker still wins **≥ 52%**: face slows a flank, it doesn't erase it |
| Same, defender in orb | the defender wins **55–65%**, but takes ≥ 30% longer to finish the fight |
| Orb vs an equal army in line, open field | the orb **loses 35–45%**: it's a defence, not a dominant shape |
| Feint bait: 4 peltasts feint vs 6 swordsmen pursuing | the peltasts' side gains **≥ 8 pts** over a plain Withdraw |
| Focus on enemy slingers (6 archers vs 6 slingers + 6 hoplites) | slingers silenced **≥ 30% sooner** than nearest-target fire |
| Cohesion on vs off: first-rout to second-rout gap (median) | shrinks by **20–40%** |
| Battles with one side having ≤ 2 men for > 30 s | **≤ 2%** (from today's long tails); mean length within ±10% of the baseline |
| Archer and slinger round-robin mean | ≥ 40% (from 36 / 34%) with focus fire |

## Acceptance Criteria

- [ ] `face` during `charge` keeps `charge`. A `form` move under 2 paces keeps the order. Unit tests in `tests/orders.test.ts`.
- [ ] Orb: a flank or rear attacker outside the ring scores a **front** hit (direction test). Riders can't form an orb.
- [ ] Feint: an ineligible group's `feint` is a no-op and is logged. An eligible group retreats, turns and charges, and pursuers become disordered.
- [ ] Focus: shooters pick focused targets in range, and fall back to nearest otherwise. `focusOutOfRange` is exposed.
- [ ] Cohesion and army-break events fire once per edge, and replays with them are deterministic (hash test).
- [ ] The server zod accepts the new kinds and enums, and the server replays a client log that uses all of them to the same hash.
- [ ] *Experiential*: a playtester counters a flank with `face` or an orb without being told how, and calls it fair.

## Files touched

- **Sim**: `src/sim/types.ts`, `src/sim/battle.ts` (`applyOrder`, `hitDirection`, target selection L1129–1178 and L1420–1463, the `updateGroups` routed edge about L2087, the end check), `src/sim/formation.ts` (`orb` slots). `src/data/classes.ts` is read only (`role`, `mount`).
- **Server**: `server/src/battle.ts`.
- **UI**: `src/ui/dragFormation.ts`, `src/ui/battlePanel.ts`, `src/ui/battleHud.ts`, `src/scenes/BattleScene.ts`, `src/i18n/*`.
- **Dev and tests**: `src/dev/balance.ts`, `tests/*`.
