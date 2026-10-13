# HUD Design: Battle

> **Status**: In Review (S2-UX-IA)
> **Author**: ux-designer (autonomous; answers in docs/v5/ux/ANSWERS.md Q43-Q46)
> **Last Updated**: 2026-10-10
> **Platform Target**: Telegram Mini App, portrait; touch first, mouse second (hover tips, wheel zoom). 390x844 design, 360x780 clean, 320x640 and 320x568 usable.
> **Accessibility tier**: Standard (V5-013)
> **Template**: HUD Design
> **GDDs referenced**: controls.md (R1-R11), battle-readability.md (R1-R6), formations-orders.md (Touch UI), abilities.md (R4, R5), ai-doctrines.md (Touch UI), field-works.md (Touch UI)
> **Replaces**: the dark v3 battle HUD (UI.md §13, G7); visual restyle to Mosaic follows V4_SPEC "Battle HUD restyle"

## A. HUD Philosophy

**Adaptive and field-first.** The field carries the battle's state (badges, morale glyphs, flank arcs, range rings, reticles, ghosts); the chrome carries only what the thumb needs now. Density changes with the phase: deployment is a workshop, the live fight is lean, paused is a planning table, the end is one beat. Anything on screen is readable in under a second on a 390-wide phone and never by colour alone (P2), and every touch control sits in the bottom 40% (P3).

## B. Information Architecture

Every item the GDDs and the current HUD put on screen, categorised.

| # | Item | Source | Category |
| --- | --- | --- | --- |
| 1 | Group cards (numeral, glyph, H/M bars, state line, reticle chip, queued step) | BTL group cards; br R1, R3; controls R1.4, R6 | **Must Show** |
| 2 | Order bar (Advance, Charge, Hold, Shoot, Withdraw/Feint) in the selected group's colour + numeral | BTL bottom; controls R1.3, R9; fo Touch UI | **Must Show** (fight) |
| 3 | Clock / men count / deploy countdown | BTL top bar | **Must Show** |
| 4 | Strength row "You n% vs n% Foe" | BTL top bar | **Must Show** |
| 5 | Pause/Play + speed (0.5×/1×/2×/3×) | BTL top bar; controls R10, R11 | **Must Show** offline; absent when `realtimeLocked` |
| 6 | Battle menu ⋯ (Settings, Retreat / Leave, Reset all in deployment, Skip tutorial in the tutorial) | BTL Flee, Leave, Reset; NAV D9 | **Must Show** (one key) |
| 7 | Field badges (numeral + morale glyph + markers: reticle, disordered, feinting, standard, captain crest, queued step) | br R2 | **Must Show** (on the field) |
| 8 | Doctrine chip (icon + name; tap = tell + counters) | ai-doctrines Touch UI | **Contextual** (enemy has a doctrine) |
| 9 | Boss HP bar (own row) | BTL-1; br R4 | **Contextual** (beast battles) |
| 10 | Ladder ticket time left (from 5 min) | controls R10 | **Contextual** (ladder) |
| 11 | Banners (contact, flanked, routing, army break, standard lost, victory…) and auto-pause reasons | BTL banners; br R4; controls R6.3 | **Contextual** (6 s TTL) |
| 12 | Paused pill (hourglass) and hint pill (info glyph) | BTL hint; br R4, BTL-4 | **Contextual** |
| 13 | Undo chip (3 s) | controls R4 | **Contextual** |
| 14 | Then… chip (3 s after a move; offline and not `realtimeLocked`) | controls R6, R10b | **Contextual** |
| 15 | "Out of range" + "Advance to range" chip on the card | controls R3.4 | **Contextual** |
| 16 | Ability medallions (≤ 3 + "more" chevron), cooldown sweep, use pips | BTL medallions; abilities R4, R5 | **Contextual** (selection with abilities) |
| 17 | Range ring (dashed) | controls R3.3 | **Contextual** (missile group selected) |
| 18 | Flank-threat dashed arc / flanked red arc with chevrons | br R4 | **Contextual** |
| 19 | Charge arrow, feint path, tap-move path + ghost, move/turn ghosts with files×ranks | controls R2, R5 | **Contextual** (during the gesture or paused) |
| 20 | Staged-order ghosts with ✕, "Clear plan" | controls R6.1 | **Contextual** (paused, offline) |
| 21 | Edge pointer to an off-screen selected group; edge arrow to the enemy zone (deployment) | controls R7, R8 | **Contextual** |
| 22 | Follow (eye) | BTL; controls R8 | **Must Show** (small) |
| 22b | Zoom key (magnifier; each tap steps to the next whole zoom, wrapping) | single-pointer alternative to pinch (WCAG 2.5.1) | **Must Show** (small) |
| 23 | Selected-soldier panel (HP/MOR/STA) + Alone/Rejoin | BTL | **Contextual** (a soldier selected) |
| 24 | Deployment panel: Shape chip → Shape sheet (+Orb), **Works** → tray, **Groups** → Assign groups, Undo (10-step), FIGHT!/READY. **Reset all lives in the ⋯ menu** (destructive, kept away from FIGHT!) | BTL deploy; controls R7; field-works Touch UI | **Must Show** (deployment) |
| 25 | Inspect (i) toggle: terrain tooltip on tap | controls R11; G15 | **On Demand** |
| 26 | "More" medallion sheet | abilities R4 | **On Demand** |
| 27 | Damage numbers (only charge impact and kill) | br R4 | **Contextual** (setting) |
| 28 | Army-break banner and fleeing-flag on every badge | br R1, R4 | **Contextual** |
| 29 | Routine hits, block sparks, decals | br R4 | **Hidden** (field + audio only) |
| 30 | Tutorial overlay (narrator, spotlight, ghost hand, flag marker, praise pill) | TUT | **Contextual** (tutorial) |
| 31 | Coach cards for Feint, Orb (after battle 3) and Works (first camp) | controls R10b | **Contextual** (once each) |
| 32 | Gesture hint | BTL | **Contextual** (first battles) |

## C. Layout Zones

**Arrangement B "Command at the thumb"** (chosen; A and C rejected in ANSWERS Q45).

```
390x844 (live fight, a missile group selected)
┌──────────────────────────────────────┐ ── safe-area top (Telegram header)
│[⋯]  1:12  You 54% ▰▰▰▱ 46% Foe [⏸][2×]│ Z1 top bar 44 pt
│[⚑ Rush ›]  [⌛ ticket 4:12]  [🔍][👁]│ Z2 status row 44 pt (doctrine chip, ladder timer, zoom, eye)
│ ▓▓▓▓▓▓▓▓ Cyclops ▓▓▓▓▓▓▓▱▱ 63%       │ Z2b boss row 20 pt (beasts only)
│      ┌ Paused · ⌛ ┐ ┌ ⚠ II flanked ┐ │ Z3 banners & pills (top-centre, under Z2/Z2b)
│                                      │
│   [II ◐]⌒⌒        [⊕ III]            │ Z4 FIELD: badges, arcs, rings, ghosts,
│      ▓▓▓▓▓▓        ▒▒▒▒              │    edge pointers
│   ( range ring )                (◉)  │ Z5 medallion rail (right edge, thumb
│                                 (◉)  │    height; left with Left-hand)
│                                 (›)  │
│ [↶ Undo] [Then… ▸]  [soldier HP·MOR·STA]│ Z6 chip row 44 pt (chips left, soldier panel right)
│┌☺I ▣ Phalanx 4┐┌☺II ◐ Sling 2┐┌IV …┐│ Z7 group cards 64 pt (only groups with men):
││H▰▰▰ M▰▰▱    ││H▰▰ M▰▱       ││    ││  portrait, numeral, glyph, group name, men,
││Holding      ││Out of range ▸│    ││  bars, state line
│└─────────────┘└─────────────┘└──────┘│
│[II]▶Advance ⚔Charge ⛨Hold ➶Shoot ↩Withdraw│ Z8 order bar 52 pt, group colour bg
└──────────────────────────────────────┘ ── safe-area bottom
```

| Zone | Contents | Anchor | Height at 390x844 / 320x568 |
| --- | --- | --- | --- |
| Z1 top bar | ⋯ menu (left), clock/men/countdown, strength row (≥ 360 wide), Pause/Play, speed (right) | top, inside safe area | 44 / 44 pt |
| Z2 status row | doctrine chip (left), ladder timer, **strength row below 360 wide**, zoom key and Follow eye (right) | under Z1 | 44 / 44 pt (it holds 44 pt keys) |
| Z2b boss row | boss HP bar with name and % | under Z2 (beasts) | 20 / 20 pt |
| Z3 banners | banners, Paused pill, hint pill, army-break banner | top-centre under Z2/Z2b (never over the boss bar, BTL-1) | overlays the field |
| Z4 field | all field readouts | — | the remainder: ≈ 600 pt / ≈ 360 pt |
| Z5 medallion rail | ≤ 3 medallions + more chevron; **2 + more when the field is under 420 pt tall** | right edge (left with Left-hand), bottom of the field | overlays the field, 44 pt discs, 4 pt gaps |
| Z6 chip row | Undo, Then…, Clear plan (left); selected-soldier panel (right) | above Z7 | 44 pt, overlays the field |
| Z7 group cards | ≤ 4 cards | above Z8 | 64 / 48 pt (compact under 360 wide: numeral, glyph, men, bars; portrait and name drop) |
| Z8 order bar | numeral badge + 5 keys (fight) · Shape, Works, Groups, Undo, Reset, FIGHT (deployment) | bottom, inside safe area | 52 / 48 pt |

**Chrome share and the field, with safe areas** (typical insets: 0 pt top inside the Telegram header and a 34 pt home indicator at 390x844; 0 / 0 at 320x568):

| Size | Z1 | Z2 | Z2b | Z7 | Z8 | Safe bottom | Chrome total | Field |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 390x844 | 44 | 44 | (20) | 64 | 52 | 34 | 238 (258 with boss) = 28% (31%) | 606 (586) |
| 320x568 | 44 | 44 | (20) | 48 | 48 | 0 | 184 (204) = 32% (36%) | 384 (364) |

At 320x568 the medallion rail holds 2 discs + chevron (3 × 44 + 8 = 140 pt, 37% of the field height, at the edge), per Z5.

**Width budget for Z1** (the only crowded row):

| Width | ⋯ | clock | strength row | Pause | speed | margins + gaps | total |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 390 | 44 | 48 | 166 ("You 54% ▰▰▱ 46% Foe") | 44 | 44 | 16 + 16 | 378 ✓ |
| 360 | 44 | 48 | 136 (icons for You/Foe: shield ▰▰▱ crossed swords) | 44 | 44 | 16 + 16 | 348 ✓ |
| 320 | 44 | 48 | moves to Z2 | 44 | 44 | 16 + 12 | 208 ✓ |


## D. HUD Element Specifications

| Element | Category | Content | Form | Update | Trigger | Animation |
| --- | --- | --- | --- | --- | --- | --- |
| ⋯ battle menu | Must | Deployment: Leave, Reset all, Settings · Fight: Retreat, Settings · Tutorial: Skip tutorial, Settings · `realtimeLocked`: Retreat, Sound on/off and the line "The battle continues" (no full Settings while the fight runs) | 44 pt key → sheet; Settings opens as a nested page in the same sheet | — | always | sheet rises 200 ms; opening pauses offline |
| Clock / men / countdown | Must | m:ss · men n/n · deploy 0:20 | Inter tabular | per second | phase | — |
| Strength row | Must | "You n% ▰▰▱ n% Foe" | text + split bar with labels | per second | fight | — |
| Pause/Play, speed | Must (offline) | ⏸/▶, 0.5×/1×/2×/3× (ladder: up to 2×) | 44 pt keys | on tap | not `realtimeLocked` | — |
| Doctrine chip | Contextual | doctrine icon + name; tap → popover with the tell and counters (pauses offline; under `realtimeLocked` it does not pause and closes after 4 s or on tap) | chip, 44 pt hit | battle start | enemy has a doctrine | — |
| Zoom key | Must | magnifier + current zoom ("1×") | 44 pt key | on tap | always | — |
| Ladder ticket timer | Contextual | "Ticket 4:12" | chip | per second | ladder, ≤ 5 min left | 1 Hz pulse in the last 60 s (static with reduce motion) |
| Boss bar | Contextual | name + bar + % | bar ≥ 5 UI px with text | on HP change | beast battle | — |
| Banners | Contextual | text + icon (horn, chevron, flag, banner) | top-centre plate | on event | br R4 table | slide in 150 ms, TTL 6 s or condition false |
| Paused pill | Contextual | ⌛ "Paused" + merged auto-pause reasons | pill | on pause | paused | — |
| Hint pill | Contextual | (i) + hint | pill | on state | first battles / quiet | — |
| Undo chip | Contextual | ↶ Undo | 44 pt chip | on order | 3 s after an order (not ability/retreat/horn) | fades at 2.5 s |
| Then… chip | Contextual | "Then… ▸"; tap → arms the next key "on arrival" | 44 pt chip | on move order | offline or not `realtimeLocked` | fades at 2.5 s |
| Group card | Must | leader portrait (24 pt), numeral (group colour), glyph, group name, men count, **standard banner glyph when the bearer is in the group**, H/M bars (labelled first 3 times), state line ("Holding", "→ Charge", "Out of range", "Flanked!"), reticle chip, Advance-to-range chip; compact (< 360 wide) keeps numeral, glyph, men, bars and a state icon | card | on sim events + 4 Hz state | group has men | selected = gold rim + raised; glyph pulse 1 Hz on wavering |
| Order bar | Must | numeral badge + 5 icon keys with labels | bar | on selection/order | fight | badge pulse 300 ms after an order; haptic |
| 5th key | Must | Withdraw, or Feint (curved arrow + cooldown sweep) for eligible groups | key | on selection | — | sweep |
| Medallions | Contextual | ability icon, cooldown sweep, use pips; "more" chevron → sheet (paused) | 48 pt discs | on cooldown | selection has abilities | ready glint (static with reduce motion) |
| Field badge | Must | numeral + glyph + markers | ~30 pt plate above the front rank | sim events | group exists | fades to 60% at zoom ≥ 2× |
| Flank arcs | Contextual | dashed (threat), red + chevrons (flanked) | arcs on the badge | events | br R4 | 2 s |
| Range ring | Contextual | dashed ring at median range | ring | selection | missile group selected | flashes when an `aimed` medallion is refused |
| Previews and ghosts | Contextual | ghost boxes, files×ranks, facing arrow, path line, charge arrow, feint path; staged ghosts with ✕ | outlines | gesture/paused | controls R5 | 600 ms for tap-move |
| Facing pips (single-pointer turn) | Contextual | tap the knob → 8 direction pips (44 pt each) around the group; a tap on a pip sends the same `form`/`face` as a knob drag; a tap elsewhere closes them | pips | on tap | a group selected | — |
| Edge pointers | Contextual | numeral at the edge; deployment: arrow to the enemy zone | 44 pt chip | camera | off-screen | — |
| Selected-soldier panel | Contextual | HP/MOR/STA + Alone/Rejoin | small card above Z7 | 4 Hz | soldier selected | — |
| Inspect (i) | On demand | terrain tooltip on ground tap | toggle key in deployment | — | toggled | — |
| Deployment panel | Must (deploy) | Shape chip, Works, Groups, Undo, Reset all, FIGHT!/READY | Z8 layout | — | deployment | — |
| Works tray | On demand | 3 items: icon, name, cost, remaining allowance; supplies left in the header. Placing: drag the ghost, **or** tap a cell to drop it there and tap ✓ to commit; facing pips rotate it | tray over Z7 | on change | Works tapped | rises 150 ms |

## E. HUD States by Gameplay Context

| State | Trigger | What changes |
| --- | --- | --- |
| **Deployment** | battle start | Z8 = deployment panel (Shape, Works, Groups, Undo, FIGHT!; Reset all in ⋯); cards for groups with men; edge arrow to the enemy zone (or both zones framed, controls F2); narrator docks **above** Z8 in the tutorial (TUT-1); no medallions; Inspect (i) available |
| **Live fight, offline** | FIGHT! | Z8 = order bar; Undo/Then chips after orders; medallions for the selection |
| **Live fight, `realtimeLocked`** (live duels, raids, war) | online source | no Pause, speed 1×; **no Then… and no Advance-to-range chips** (R10b); Undo stays |
| **Paused / staging** (offline) | ⏸, auto-pause, ⋯ | Paused pill with reasons; staged orders drawn as dashed ghosts with ✕; "Clear plan" chip in Z6; "more" medallion sheet allowed; Play issues the plan |
| **Exploration-equivalent: camera pan/zoom** | pinch, pan | readouts stay; badges fade at ≥ 2× |
| **Dialogue / cutscene: tutorial** | tutorial source | narrator panel, spotlight, ghost hand; the generic hint pill hidden; ✕ on the narrator only dismisses the bubble, "Skip" is a text link (TUT-2) |
| **Beast battle** | beast source | Z2b boss row; no morale glyphs on beasts (br edge case) |
| **Army break** | `armyBreak` | army-wide banner; fleeing flags on every badge of that side |
| **Low readability: 320x568** | small screens | compact cards (numeral, glyph, bars); order keys icon + short label; status row merges into Z1 when it only holds the eye |
| **End** | victory/defeat/retreat | HUD fades 180 ms; Results |
| **Error: online desync / connection lost** | lockstep | banner "Reconnecting…" (existing); after timeout the source's onLeave (existing) |

## F. Information Hierarchy

| Element | Tier | Reason | When hidden, carried by |
| --- | --- | --- | --- |
| Group cards, order bar, field badges + glyphs | MUST KEEP | the 30 s loop | — |
| Clock/men, strength row, Pause | MUST KEEP | tempo and who's winning | — |
| Boss bar, flank arcs, banners for flanked/rout/army break | MUST KEEP (when active) | decide the next order | audio horn |
| Undo, Then…, medallions, range ring, out-of-range | SHOULD KEEP | the safety net and missile play | card state line |
| Doctrine chip, ladder timer, Follow eye | CAN HIDE | rarely needed mid-fight | doctrine on the encounter sheet; timer banner at 60 s |
| Hint pill, gesture hint, damage numbers | CAN HIDE | first battles only / setting | — |
| Routine hits, sparks | ALWAYS HIDE (as HUD) | field + audio | sprites |

## G. Visual Budget

- **Command controls at once (live fight):** ≤ 4 kinds — order bar, cards, medallions, Undo/Then (controls R10b). **Chrome** is counted separately and is fixed: ⋯, Pause, speed (Z1); doctrine chip, zoom, eye (Z2); edge pointers (field). No other control may appear during a live fight. Deployment: the deployment panel, cards, Inspect.
- **Screen share:** ≤ 31% at 390x844 including the bottom safe area (28% without the boss row); ≤ 36% at 320x568 (see the §C table).
- **Simultaneous banners:** 1 + the Paused pill. **Field markers per badge:** numeral + glyph + at most 2 markers (priority: flanked arc, reticle, standard, captain, disordered, feinting, queued step).
- **Drop order when over budget:** hint pill → damage numbers → doctrine chip label (icon stays) → ladder timer (to a 60 s banner) → selected-soldier panel.

## H. Feedback & Notification

| Notification | Trigger | Position | Duration | Max | Priority | Queue |
| --- | --- | --- | --- | --- | --- | --- |
| Army break | `armyBreak` | Z3 full width | 6 s | 1 | 1 | replaces any banner |
| Standard lost | `standardLost` | Z3 | 6 s | 1 | 2 | replaces lower |
| Group routs | `rout` | Z3 | 6 s | 1 | 3 | newer of equal priority replaces |
| Flanked | `flanked` | Z3 + card state + badge arc | 6 s / 2 s | 1 | 3 | merged per group |
| Contact soon / contact | distance < 6 paces | Z3 | until contact / 6 s | 1 | 5 | dropped if a higher one shows |
| Auto-pause reasons | settings | Paused pill | while paused | 1 pill, reasons merged within 5 s | — | merged (R6.3) |
| Undo / Then chips | order | Z6 | 3 s | 2 | — | a new order replaces them |
| Medallion refusal | tap an unusable one | toast above Z7 + requirement pulse | 2 s | 1 | — | replaced |
| Damage number | impact, kill | field | 600 ms | 6 | — | oldest dropped |
| Ladder ticket | ≤ 5 min | Z2 chip; banner at 60 s | — | 1 | 4 | — |
| Coach card | first time (battle 3, first camp) | above Z8 | until dismissed | 1 | — | queued after the battle starts; never during contact |

Held during contact: coach cards and hints. Never queued: army break, flanked.

## I. Platform Adaptation

- **Safe areas:** Z1 below the Telegram top inset; Z8 above the bottom inset; nothing interactive in the outer 8 pt.
- **320 widths:** order keys = icon + short label (no ellipsis; the layout check enforces it); 4 cards at 69 pt; the strength row moves into Z2, where the doctrine chip shows its icon only and the ladder timer becomes a banner at 60 s, so Z2 holds chip 44 + strength 150 + zoom 44 + eye 44 + gaps = 300 pt.

| Key | Full label en / ru | Short label (< 360 wide) en / ru | Max chars (short) |
| --- | --- | --- | --- |
| Advance | Advance / Вперёд | Adv. / Впер. | 5 |
| Charge | Charge / Натиск | Charge / Натиск | 6 |
| Hold | Hold / Стоять | Hold / Стоять | 6 |
| Shoot | Shoot (Loose/Throw) / Стрелять | Shoot / Огонь | 6 |
| Withdraw | Withdraw / Отступить | Back off / Отход | 8 |
| Feint | Feint / Ложный отход | Feint / Финт | 5 |

The ru strings are proposals for the localization owner; the layout check enforces the limits.
- **Left-hand:** mirrors Z5 and the Follow eye to the left; the ⋯ moves right, Pause left.
- **Mouse (Telegram Desktop):** hover = tips; wheel zoom; right-click is not used.
- **Haptics:** light on select/snap/order, medium on Undo (setting).

## J. Accessibility (Standard, V5-013)

- **Targets:** every control ≥ 44 pt; the knob art 20 pt with a 44 pt hit area; 4 pt gaps in the order bar.
- **Text:** ≥ 6.5 UI px for meaningful text; the why line and banners wrap, never ellipsize.
- **Single-pointer alternatives (WCAG SC 2.5.1):** the zoom key for pinch; facing pips for the knob drag; tap-a-cell + ✓ for work placement; tap-move for the move drag.
- **Field overlay contrast (SC 1.4.11):** every overlay on the painted field (range ring, flank arcs, ghosts, pointers, badges, chips) has a 1 pt dark ink outline or a backing plate so it reaches 3:1 against the lightest and the darkest terrain.
- **Timing (SC 2.2.1):** the 3 s Undo and Then chips are shortcuts, not the only path (any order can be re-issued, and offline the player can pause); banners repeat what the card state line and the badge glyph already show, so a missed banner loses no information.
- **Colour independence:** group colour + numeral; morale glyph shapes (shield, cracked shield, fleeing flag); flank arcs with chevrons; focus = reticle; ghost validity ✓/✗; bars labelled H/M; paused = hourglass, hints = (i), red only for alerts.
- **Motion:** Reduce motion (pulses static, fades cut), Reduce shake (×0), Reduce flash (no rings). Hit-stop stays (not motion).
- **Time:** 0.5× offline; pause anywhere offline and on the ladder.
- **No long-press-only info:** Inspect toggle for terrain; tooltips on hover.
- **Keyboard/gamepad:** out of scope for v5 (ANSWERS Q9). This is an **accepted deviation from WCAG SC 2.1.1** for Telegram Desktop; the specs do not claim full AA.
- **Text size (SC 1.4.4):** no in-game text-scale option in v5; an open question for the accessibility requirements file.

## K. Tuning Knobs (player-adjustable)

| Setting | Range | Default |
| --- | --- | --- |
| Damage numbers | on/off | on |
| Auto-pause: first contact / flanked / rout / hero death | on/off each | as today |
| Reduce motion / shake / flash | on/off | shake and flash follow motion |
| Left-hand | on/off | off |
| Battle speed (offline) | 0.5× / 1× / 2× / 3× | last used |
| Haptics | on/off | on |

Design knobs (UNDO_S, THEN_CHIP_S, BANNER_TTL_S, MAX_MEDALLIONS…) live in the GDDs.

## L. Acceptance Criteria

- [ ] At 390x844, 360x780, 320x640 and 320x568 no HUD control is under 44 pt, and no label in Z1, Z7 or Z8 is ellipsized (layout check fixtures `battle-undo`, `battle-then`, `battle-focus`, `battle-out-of-range`, `battle-staged`, `battle-works`, `battle-lefthand`, `battle-wavering`, `battle-flanked`, `battle-beast-paused`).
- [ ] In a beast battle, pausing never covers the boss bar.
- [ ] In a live duel there is no Pause, no Then… chip and no Advance-to-range chip; Undo appears.
- [ ] The order bar's background is the selected group's colour and shows its numeral; the 5th key reads "Withdraw" (or "Feint").
- [ ] Chrome covers ≤ 25% of the screen at 390x844 in a beast battle.
- [ ] Two banners never show at once; army break replaces any other banner.
- [ ] With Left-hand on, the medallion rail and the eye sit on the left edge.
- [ ] The ⋯ menu offers Settings and Retreat (Leave and Reset all in deployment); opening it pauses an offline battle; in a live duel it shows only Retreat and Sound.
- [ ] Every pinch, knob-drag and placement-drag action can be done with single taps (zoom key, facing pips, tap-to-place).
- [ ] At 320 width the Z1 row shows no ellipsis and the strength row sits in Z2.

## Open Questions
1. The Mosaic look of the HUD (paper panels vs stone bars) is an art decision (V4_SPEC phase "Battle HUD restyle", ART_STYLE §11); this spec fixes zones and behaviour only.
