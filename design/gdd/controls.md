# Battle Controls (touch-first)

> **Type**: Rework of system #23 Battle input and controls. Classified **too large for quick-design** (`[F]`), but kept at quick-design depth per the brief. **Run `/design-system controls` (with `/ux-design`) before its epic.**
> **Status**: Implemented
> **Pillars**: P3 Command from the thumb, P2 Read it at a glance
> **Fixes**: PLAY C1–C8, K1, K2, P2 (ladder pause); UI BTL-3, BTL-5, BTL-8, G10, G13, G15; MECH B2 (with formations-orders.md)
> **Legacy reference**: docs/GAMEPLAY.md "Controls", DESIGN_V2.md "Controls" and "Online battle rules"

## Overview

The playtest found that the gestures are right: drag to move, drag the knob to face, take shapes only from buttons, pan on empty ground. What's missing is the safety net and the readout around them. This GDD keeps every gesture and adds:

- an unambiguous **hit-test priority**;
- **previews** for every order (ghosts, range rings, charge arrows);
- a one-step **"Then…" queue**;
- a 3-second **Undo** after every order;
- **paused staging**;
- camera framing and pointers;
- an **accessibility** layer at the Standard tier (V5-013).

Almost all of it is **presentation and input**, with no sim change. The exceptions are the new orders it sends (`face`, `focus`, `feint`, `work`), which are specified in their own GDDs.

## Player Fantasy

"I flick the line round, the arrow shows me where it'll stand, I queue a charge for when they arrive, and if I fat-finger it I just tap Undo."

The aesthetic is Competence: the controls disappear.

## Detailed Rules

### R1. Selection

1. **Hit-test priority** for a press. The first match wins (fixes C1):
   1. a soldier of a **non-selected** own group (sprite rect, padded to a 44 pt minimum): select that group;
   2. the selected group's **knob** (44 pt hit radius around the 20 pt knob art): a turn drag;
   3. the selected group's soldiers or placement marker (30 px grab radius, as today): a move drag;
   4. an enemy soldier or enemy badge: a target (R3);
   5. a group card or field badge: select;
   6. empty ground: a tap moves the selected group; a drag pans.
2. **Tap the same soldier again**: Solo (detach), as today.
3. **Showing the selection** (fixes C3):
   - the order bar's background takes the selected group's **group colour**, with its **numeral** in a badge at the bar's left;
   - after any order, the group's field badge pulses for 300 ms (a scale of 1.15, then back), and a light haptic plays.
4. **Cards.** Only groups with at least one man get a card. Empty groups are hidden. "Men" is renamed **"Groups"** (BTL-8), and it opens Assign groups.
5. **Card numbering** is stable for the whole battle: a card's numeral equals its field badge's numeral, from deploy to the end (fixes PLAY B3).

### R2. Drag to order

1. **Move drag**: the same as today (keeps the grab offset, facing and shape). A ghost of the old position stays until release.
2. **Knob drag**: the same gesture as today. It sends:
   - in **deployment**: `form`;
   - in **battle**: `face` (formations-orders.md R1), which **keeps the current order**.
   A ghost of the old facing arrow stays until release. The knob snaps to the 8 directions within 8°.
3. **Cancel**: lift within 0.5 pace of the start (a move) or under 4° (a turn), as today.
4. **Tap on ground**: move, keeping the shape, and face the nearest enemy group from the destination (as today). It shows a straight path line and a ghost at the destination for 600 ms.
5. **Pan vs order**: unchanged. Two fingers never order.

### R3. Targeting

1. **Tap an enemy with a melee group selected**: attack (as today). A short red arrow from the group to the target is shown for 600 ms. The arrow also has a chevron glyph, so it isn't colour only.
2. **Tap an enemy with a missile or hybrid group selected**: `focus` on that enemy group (formations-orders.md R4).
   - A **reticle** appears on the target's badge, and on the selected card.
   - Tap the same enemy again, or tap the reticle chip on the card, to clear it.
3. **Range ring.** While a missile group is selected, a dashed ring at its median weapon range is drawn around the group's centre (with the +0.8 range per height level shooting downhill).
4. **Out of range** (fixes C4):
   - the group has *Shoot* on, and either `focusOutOfRange` is true or `noTargetS` > 3. Both sim states are defined in formations-orders.md R4. This GDD owns the HUD condition.
   - its card shows **"Out of range"** with an arrow glyph;
   - the *Shoot* key shows a hollow state;
   - a one-tap **"Advance to range"** chip appears on the card, which issues a `form` to the nearest point that puts the focus (or the nearest enemy) at 90% of range.
5. **Medallions**: at most 3 (abilities.md R4). A tap on an unusable one shows the reason as a toast (it already exists) **and** pulses the requirement, for example by flashing the range ring for `aimed`.

### R4. Undo and confirm

1. **Undo chip.** For **3 s** after any order except an ability, a retreat or a horn, an Undo chip shows above the order bar. Tapping it issues the inverse:
   - **form or face**: the previous formation (cx, cy, fx, fy, frontage, type), plus the previous `order` if it changed;
   - **order key**: the previous order;
   - **focus**: the previous focus;
   - **"Then…" queue**: it clears the queued step.

   Only the **last** order is undoable in battle. Online, Undo is allowed: it's just another logged order.
2. **Deployment undo**: a stack of **10 steps** per deployment covering form, preset, assign and work. **Reset** stays as "reset all", and asks for confirmation (fixes C2).
3. **Confirm** only global or irreversible actions: Flee/Retreat, Leave deployment, Reset all, and dismissing a hero. Hiring a recruit gets a **4 s Undo toast** instead of a confirm (fixes C5).
4. A disabled control always says why on tap (DESIGN_V2 UX).

### R5. Previews

| Preview | When shown | What it shows |
| --- | --- | --- |
| Move or turn | during a drag | ghost boxes, the files×ranks label, the facing arrow (as today) |
| Tap-move | for 600 ms | the path line plus a destination ghost |
| Range ring | while a missile group is selected | its effective range (R3.3) |
| Charge arrow | while **paused**, after Charge is pressed (staged) | an arrow to the enemy group the charge will hit (the sim's nearest target from the group's centre) |
| Feint | when Feint is pressed while paused | the fall-back path (4 s at its speed) and the turn point |

### R6. Paused staging and the "Then…" queue

1. **Staging (offline, paused).** While paused, orders are held in a client buffer and drawn as ghosts with a dashed outline.
   - **Play** issues them in order at the resume tick. That's the same tick as today, so it's deterministic.
   - Staged orders can be removed one by one (a ✕ on each ghost), or all at once ("Clear plan").
2. **The "Then…" queue** (offline and online):
   - After a **move** order (a drag, or a tap on the ground), a **Then…** chip shows next to Undo for 3 s.
   - Tapping it arms the next order key (Advance, Charge, Hold, Shoot or Withdraw/Feint) as **on arrival**. The card shows "→ Charge".
   - The queued step fires when:
     - the group's centre is within `ARRIVE_DIST` (1 pace) of the move target, **or**
     - the group has been still for 1.5 s, **or**
     - any man of the group makes contact.
   - **Depth: one step per group.** A new move order clears the queue.
   - The queue lives on the client (`src/ui/orderQueue.ts`). When it fires it issues a normal order, so the sim and server see only ordinary orders at real ticks.
3. **Auto-pause** (offline): auto-pauses within **5 s** of each other merge into one pause. The banner lists both reasons.

### R7. Deployment tools

- **The panel**: group cards (only those with men), Shape, **Works** (field-works.md), Groups, Undo, Reset all, FIGHT/READY.
- **The narrator**: during deployment it docks **above** the panel, so the tutorial no longer covers Shape or FIGHT (fixes O2 and TUT-1). This is a tutorial-overlay layout rule in `src/ui/tutorial/*`.
- **The opening frame** (fixes K1):
  - Deployment opens with a camera that frames **both deployment zones** if that fits at zoom ≥ 0.75×.
  - Otherwise it opens at 1× on the player's zone, with an **edge arrow** pointing at the enemy zone. Tapping the arrow pans to it.

### R8. Camera in battle (fixes K2)

1. **Follow mode** (the eye) frames the bounding box of the **melee plus the selected group**, not the melee alone.
2. When the selected group is off screen, an **edge pointer** shows its numeral at the screen edge, toward it. Tapping the pointer, or **double-tapping** the group's card, centres the camera on the group.
3. Pinch, pan and the eye are unchanged. Zoom snaps to whole multiples (as today).

### R9. Order bar

- **Keys**: Advance, Charge, Hold, Shoot (*Loose/Throw*), and the 5th key.
- **The 5th key**: **Withdraw**, renamed from "Back" (BTL-5, D8). For a feint-eligible group it's **Feint**, with its cooldown sweep (formations-orders.md R3).
- **Icon-first**: every key has an icon plus a label of at least 6.5 UI px, and at 320 it shows the icon plus a short label. Labels are never ellipsized (G14).
- Each key is at least 44 pt, with 4 pt gaps.
- The **Shape sheet** adds **Orb**. Disabled shapes give their reasons.

### R10. Who may pause

The `online` getter in `BattleScene.ts` splits into `realtimeLocked`:

| Battle | Pause and auto-pause | Speed |
| --- | --- | --- |
| Campaign, tutorial, practice | yes | 0.5×, 1×, 2×, 3× |
| **Duel PvE ladder** | **yes** (new, fixes P2) | 0.5×, 1×, 2× |
| Live duels (ranked, unranked, friendly) | no | 1× |
| Ranked async raids | no (leaderboard integrity) | 1× |
| War-map attacks (neutrals, garrisons, beasts, bosses) | no (DESIGN_V2, unchanged) | 1× |

Ladder verification replays the seed and the order log by tick, so pausing doesn't change the replay. **A server change is needed** for the **ticket TTL**: ladder tickets become valid for `LADDER_TICKET_MIN` (30 min, from 10). If the ticket expires mid-battle, the client shows the remaining time from 5 min out, and an expired run is still verified but grants no rewards. It is not refreshed per order.

### R10b. Attention budget (holism review W4)

- **Progressive unlock in the campaign.** Feint and Orb appear after the player's **3rd battle**, each introduced once by a coach card. Works appear after the first camp is pitched. Duels and war show everything from the start, because those players already finished the campaign tutorial.
- **Live online** (`realtimeLocked`): there is no "Then…" chip and no "Advance to range" chip. Undo stays. Fewer simultaneous controls when you can't pause.
- **The budget**: at most 4 kinds of interactive control on screen at once. In battle those are the order bar, the cards, at most 3 medallions and Undo/Then. Readouts (glyphs, arcs, chips) don't count, but they follow battle-readability.md sizing.

### R11. Accessibility (Standard tier, V5-013)

| Need | Rule |
| --- | --- |
| Targets | Every battle control is at least 44 pt. The knob art is 20 pt, with a 44 pt hit area. |
| Text | At least 6.5 UI px (13 CSS px) for any battle text that carries meaning (G10). |
| No colour-only state | Group colour is always paired with its numeral. Morale is a glyph (battle-readability.md). Flank arcs have chevrons. Focus is a reticle shape. Ghost validity uses ✓/✗. |
| No long-press-only info | Terrain info gets an **Inspect** toggle (an (i) key in deployment): a tap on the ground shows the tooltip. Long-press stays as a shortcut (G15). |
| Motion | New settings: **Reduce shake** and **Reduce flash**. Both follow `reduceMotion` by default (`src/ui/motion.ts`). |
| Handedness | A **Left-hand** setting mirrors the medallion rail and the Follow eye to the left edge. |
| Speed | **0.5×** offline, for players who need more time. It's a client stepping rate, and the sim's tick is unchanged. |
| Haptics | A light tick on snap, select and order; a medium one on Undo. |
| Mouse (v6: every desktop client) | Hover shows the same tooltips, naming the key ("Charge (W)"). The wheel zooms at the cursor. Right click on the ground moves, on an enemy attacks; right-drag moves and faces; middle-drag pans. Left press means exactly what a finger press means. See **Keyboard and mouse** below. |
| Keyboard (v6) | Every order, group, ability, time and camera control has a rebindable single-key default; HUD controls show keycaps on keyboard devices (Show key hints); ? or F1 lists the current keys. See **Keyboard and mouse** below. |

### Keyboard and mouse (v6)

The touch rules above are unchanged. Mouse buttons, the wheel, cursors, hotkeys, HUD focus, keycaps, the shortcuts sheet and rebinding are specified in [design/ux/input-v6.md](../ux/input-v6.md) (architecture: ADR-0012). A hotkey presses the same control a tap does, so orders, the order log and replays are identical (ADR-0001). The remaining pointer-only inputs (pointing at a field position or an enemy, Solo, works placement) are A11Y-22's accepted deviation.

## Formulas

### F1. The arrival test for the queue

```
fire = dist(groupCentre, target) ≤ ARRIVE_DIST ∨ stillFor ≥ STILL_S ∨ contact
```

`ARRIVE_DIST` = 1 pace and `STILL_S` = 1.5 s. It's evaluated each rendered frame from read-only sim state. It's issued as an order at the current tick, so it's deterministic in replay because the order is logged.

### F2. Opening zoom

```
z = clamp(min(W_view / W_zones, H_view / H_zones), 0.75, 1) snapped to 0.25
```

If the unsnapped value is below 0.75, use z = 1 plus the edge arrow.

## Edge Cases

- **Undo after the group has died or routed**: the chip disappears, and the order would be ignored anyway.
- **Undo during lockstep (live duel)**: the inverse order goes through lockstep like any order. The 3 s window is local.
- **A "Then…" armed and then the group is selected away**: the queue stays armed for that group, and its card shows it.
- **A staged plan when the battle auto-resumes**: there's no auto-resume offline. Auto-pause never discards a plan.
- **A press on the knob exactly over a non-selected soldier**: the soldier wins (R1.1). To turn there, the player drags the knob from its outer edge (the 44 pt hit area extends past the soldier).
- **Every group is empty except one**: one card, and the bar always targets it.
- **Ladder pause abuse**: none is possible against a deterministic bot, so it's acceptable. The ladder isn't ranked.
- **A 320x568 screen**: the order bar shows icons plus short labels, cards compact to numeral, glyph and bars, and the layout check enforces no ellipsis.

## Dependencies

| System / GDD | Direction | Contract |
| --- | --- | --- |
| formations-orders.md | uses | sends `face`, `focus`, `feint`; Orb in the Shape sheet; reads `focusOutOfRange` |
| abilities.md | uses | the medallion budget (R4), reasons |
| field-works.md | uses | the Works tray, the placement gesture, deployment undo |
| battle-readability.md | uses / is used by | glyphs and badges shared with the readout; settings shared (Reduce shake) |
| ai-doctrines.md | uses | the doctrine chip tap (shows the tell) |
| campaign-events.md, campaign-arc.md | are used by | the BottomPanel sheet pattern for event and assault cards (one primary, 44 pt or more) |
| #36 Duels (`src/duel/ladder.ts`, server tickets) | modifies | the ladder pause and the ticket TTL |
| #29 Settings | modifies | the new settings fields |

### Cross-References

| Target GDD | Specific Element Referenced | Nature |
| --- | --- | --- |
| formations-orders.md | R1 face, R3 feint, R4 focus | uses |
| abilities.md | R4 medallions | uses |
| field-works.md | R3 `work` order | uses |
| battle-readability.md | R1 morale glyphs, R2 badges | uses |
| ai-doctrines.md | R7 doctrine chip | uses |
| campaign-arc.md | R2 Assault sheet | is used by |
| campaign-events.md | R4 event card | is used by |

## Tuning Knobs

The knobs live in `src/ui/dragFormation.ts` and the new `src/ui/orderQueue.ts` constants.

| Knob | Default | Range | Category |
| --- | --- | --- | --- |
| UNDO_S | 3 | 2–5 | feel |
| DEPLOY_UNDO_DEPTH | 10 | 5–20 | feel |
| THEN_CHIP_S | 3 | 2–5 | feel |
| ARRIVE_DIST / STILL_S | 1 pace / 1.5 s | 0.5–2 / 1–3 | feel |
| AUTO_PAUSE_MERGE_S | 5 | 3–8 | feel |
| KNOB_ART_PT / KNOB_HIT_PT | 20 / 44 | 16–24 / 44–56 | feel |
| SELECT_PULSE_MS | 300 | 200–500 | feel |
| OPEN_ZOOM_MIN | 0.75 | 0.5–1 | feel |
| LADDER_TICKET_MIN | 30 | 15–60 | gate (server) |

## Touch UI needs

This GDD *is* the touch UI. The layout check gets new fixtures: `battle-undo`, `battle-then`, `battle-focus`, `battle-out-of-range`, `battle-staged`, `battle-works`, `battle-lefthand`, each at 390, 360, 320x640 and 320x568.

## Online and server impact

- **Sim: none of its own.** The orders it sends are specified, and versioned, in formations-orders.md and field-works.md. Undo and the queue issue ordinary orders.
- **Server**:
  - the ladder ticket TTL goes from 10 to 30 min (`server/src/duel/*` ticket issuance);
  - the ladder client no longer sets `realtimeLocked`.

  This is shippable **before** sim train 2: it doesn't touch the sim.
- **Lockstep**: unchanged. Undo and the queue are ordinary orders.

## Save impact

`Settings` gains `reduceShake?`, `reduceFlash?`, `leftHand?` (all optional booleans) and `battleSpeed?` (the last offline speed). They're optional, read with defaults, and they carry over in `carrySettings`. No migration is needed, and they ride the v5 campaign save bump for validation.

## Balance targets (`npm run balance` and playtest)

The harness can't measure touch, so these are playtest targets (the PLAY method), plus one harness row.

| Measure | Target |
| --- | --- |
| Wrong-group orders per battle (playtest) | **≤ 0.2** (from about 1 in 6 orders) |
| Mistaken knob grabs (playtest) | **0** in a 5-battle session |
| Real decisions per first campaign battle | **≥ 8** (shared with campaign-arc.md) |
| Missile groups idle while out of range for more than 10 s (playtest) | **0** |
| Ladder fight length with 2× (harness: the ladder floor 5 battle length, unchanged sim; the real-time duration halves at 2×) | median real time **≤ 90 s** |

## Acceptance Criteria

- [ ] The hit-test priority is implemented and unit-tested on `dragFormation`'s pure hit-test function (a press over a non-selected soldier inside the knob radius selects the soldier's group).
- [ ] The knob in battle sends `face`, and the charge continues (an integration test with the sim).
- [ ] The Undo chip restores the previous formation and order. Deployment undo goes back 10 steps.
- [ ] A "Then… Charge" fires on arrival, and appears in the order log at the arrival tick.
- [ ] Paused staging issues the orders on Play at the same tick (a replay-equal test against immediate issue).
- [ ] Ladder battles can pause and run at 2×, and the server verifies a paused ladder run (ticket TTL test).
- [ ] The layout check passes the new fixtures at all four sizes with no ellipsis.
- [ ] *Experiential*: in a 5-person playtest, nobody reports "it did something I didn't mean" more than once.

## Files touched

- **Input**: `src/ui/dragFormation.ts` (hit-test, face), new `src/ui/orderQueue.ts`.
- **HUD**: `src/ui/battlePanel.ts` (bar, cards, Works, Undo, Then), `src/ui/battleHud.ts` (reticle, range ring, pointers), `src/ui/tutorial/*` (narrator dock).
- **Scene**: `src/scenes/BattleScene.ts` (`realtimeLocked`, staging, camera, auto-pause merge).
- **Settings and copy**: `src/ui/motion.ts`, `src/ui/settings.ts`, `src/game/save.ts` (Settings), `src/i18n/*`.
- **Duels**: `src/duel/ladder.ts`.
- **Server**: `server/src/duel/*` (ticket TTL).
- **Tests**: `scripts/layout-check.mjs` fixtures.
