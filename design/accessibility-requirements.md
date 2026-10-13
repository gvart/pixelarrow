# Accessibility requirements (Standard tier)

> **Tier**: Standard (decision V5-013). Reference: WCAG 2.1 AA, applied to a portrait Telegram Mini App (390x844, down to 320x568).
> **Sources**: design/ux/hud.md §J, design/ux/interaction-patterns.md "Accessibility", design/gdd/controls.md R10-R11, design/gdd/battle-readability.md, docs/v5/ux/REVIEW.md.
> **Units**: 1 pt = 1 CSS px. 1 UI px = 2 CSS px (the game's logical pixel).

Every requirement has an ID and a binary check. "Auto" means a script or test in the repo fails when the requirement is broken; "Manual" means a person checks it on the named screens.

## 1. Contrast

| ID | Requirement | How to verify |
| --- | --- | --- |
| A11Y-01 | Text (and icons that carry meaning on their own) reaches **4.5:1** against its background. | Auto: every text pair is listed in `CONTRAST_PAIRS` (`src/ui/tokens.ts`) with `min: 4.5`, and `npx vitest run tests/tokens.test.ts` passes. A new text colour on a new background without a pair fails review. |
| A11Y-02 | UI parts (button edges, toggle tracks, focus rims, badges, bars) reach **3:1** against what is next to them. | Auto: the pair is in `CONTRAST_PAIRS` with `min: 3`; tokens test passes. |
| A11Y-03 | Every overlay drawn on the painted battle field or war map (range ring, flank arcs, ghosts, pointers, badges, chips) has a 1 pt dark ink outline or a backing plate, so it reaches 3:1 on both the lightest and the darkest terrain. | Manual: screenshot the overlay on the lightest and the darkest terrain tile; sample both sides of the edge; both ratios ≥ 3:1. |

## 2. No colour-only state

| ID | Requirement | How to verify |
| --- | --- | --- |
| A11Y-04 | No state is shown by colour alone. Each one also has a shape, glyph, number or word: group colour + numeral; morale shield / cracked shield / fleeing flag; flank arcs with chevrons; focus reticle; ghost ✓/✗; bars labelled H/M; paused = hourglass; rarity frame + gem letter; perk "Taken" / "Not taken"; owned hexes carry the clan crest; toggles say On/Off; form errors are text. | Manual: view each listed screen in greyscale (DevTools "Emulate vision deficiency: achromatopsia"); every state is still told apart. |
| A11Y-05 | Red is used only for alerts and count badges, never as the only sign of a state. | Manual: same greyscale pass; no red-only element remains unexplained. |

## 3. Touch targets

| ID | Requirement | How to verify |
| --- | --- | --- |
| A11Y-06 | Every interactive element has a hit area of at least **44x44 pt** (art may be smaller: the turn knob is 20 pt art in a 44 pt hit area). | Auto: `node scripts/layout-check.mjs <url>` reports no target under 44 pt that is not in `scripts/layout-allowlist/<story>.json`. |
| A11Y-07 | Neighbouring targets are at least **8 pt** apart; **4 pt** in the battle order bar and the tab bar. | Auto: layout-check fails below 4 pt. Manual: the 8 pt rule outside the battle order bar and tab bar is checked in UI review. |
| A11Y-08 | A destructive action is never next to the screen's primary action and always confirms (e.g. Reset all lives in the ⋯ battle menu, away from FIGHT!). | Manual: on deployment, Settlement Sell, Clan Leave and Army Dismiss, the destructive control is not adjacent to the primary and opens a confirm. |

## 4. Text size

| ID | Requirement | How to verify |
| --- | --- | --- |
| A11Y-09 | Text that carries meaning is at least **6.5 UI px (13 CSS px)** tall. Decorative text (plaques, flourishes) is exempt. | Manual: in the layout registry (`window.__layout`) or a 390x844 screenshot, no meaningful label is under 13 CSS px. No automated check exists yet. |
| A11Y-10 | Text that may run long (the battle report "why" line, banners, event bodies) wraps; it never ellipsizes. | Auto: layout-check finds no text overflow in en and ru. Manual: the why line at 320x568 in ru is complete. |
| A11Y-11 | **Open:** no in-game text-scale option in v5 (WCAG SC 1.4.4). Recorded as a known gap, not a pass. | Decision needed before v5 ships: add a text-scale setting, or log an accepted deviation in docs/v5/DECISIONS.md. |

## 5. Motion and flashing

| ID | Requirement | How to verify |
| --- | --- | --- |
| A11Y-12 | **Reduce motion** makes pulses static, turns fades and sheet slides into instant cuts, and reveals spoils cards without the flip. Hit-stop is kept. Its default follows the OS `prefers-reduced-motion`. | Manual: with Reduce motion on, open a sheet, change screen and finish a battle; nothing slides, fades or pulses. Repeat with the OS setting on and a fresh save; the toggle starts On. |
| A11Y-13 | **Reduce shake** scales every camera and banner shake to ×0. **Reduce flash** turns off flash rings. Both default to the Reduce motion value. | Manual: with Reduce shake on, a hit or a charge impact leaves `cameras.main` scroll unchanged; with Reduce flash on, no ring is drawn. |

## 6. Input: one pointer, no long-press only

| ID | Requirement | How to verify |
| --- | --- | --- |
| A11Y-14 | Every drag or pinch has a single-tap alternative (WCAG SC 2.5.1): the zoom key for pinch zoom; facing pips (tap the knob, tap a direction) for the knob drag; tap-a-cell + ✓ for works placement; tap-move for the move drag; tap item → tap slot for gear and stash. | Manual: complete zoom, facing, works placement, a move and an equip using only single taps. |
| A11Y-15 | No information is reachable only by long-press: terrain has an Inspect toggle ((i) in deployment); tooltips also show on hover. | Manual: with Inspect on, a single tap on terrain shows its tooltip; on desktop, hover shows the same tooltip. |
| A11Y-16 | **Left-hand mode** mirrors the medallion rail and the Follow eye to the left edge. | Manual: with Left-hand on, at 390x844 and 320x568, the rail and the eye sit on the left and layout-check reports no new violation. |

## 7. Timing and pause

| ID | Requirement | How to verify |
| --- | --- | --- |
| A11Y-17 | Campaign, tutorial, practice and Duel PvE ladder battles can be paused at any moment; event cards and encounters pause the world map. | Manual: pause opens in each of the four battle kinds; the sim tick does not advance while paused. |
| A11Y-18 | Battles that cannot pause (live duels, ranked raids, war-map attacks; `realtimeLocked`) show that before they start, and their ⋯ menu offers only Retreat and Sound with "The battle continues". | Manual: start each kind; the pre-battle sheet says it cannot pause; ⋯ shows only those two items. |
| A11Y-19 | A timed shortcut (the 3 s Undo and "Then…" chips) is never the only way to do something: any order can be re-issued, and offline the player can pause. Banners repeat what the card state line and badge glyphs already show. | Manual: let the Undo chip expire, then reach the same result by issuing the order again. |
| A11Y-20 | The Duel ladder ticket lasts **30 min**; from 5 min left the client shows the remaining time. | Auto (to add with the R10 story): a server test asserts a ladder ticket is accepted at 29 min and refused after 30. Manual: the countdown appears at 5:00. |
| A11Y-21 | **Battle speed 0.5×** is offered wherever pause is (campaign, tutorial, practice, ladder). It changes the client stepping rate only; the sim tick is unchanged. The last speed is saved (`battleSpeed`). | Manual: select 0.5×, reload; the speed is still 0.5×. Auto (to add with the R11 story): a replay of the same seed and order log at 0.5× and 1× gives the same result. |

## 8. Recorded deviations

| ID | Requirement | How to verify |
| --- | --- | --- |
| A11Y-22 | Keyboard and gamepad access (WCAG SC 2.1.1) is **out of scope for v5** (accepted deviation, docs/v5/ux/ANSWERS.md Q9). The specs do not claim full AA. Mouse on Telegram Desktop works: hover shows tooltips and the wheel zooms. | Manual: on desktop, hover and wheel work on the battle field and the war map. |
