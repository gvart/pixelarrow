# Interaction Pattern Library (v5)

> **Status**: In Review (S2-UX-IA)
> **Author**: ux-designer (autonomous)
> **Last Updated**: 2026-10-10
> **Platform Target**: touch first, mouse second; keyboard/gamepad out of scope for v5. **v6:** mouse and keyboard are specified in [input-v6.md](input-v6.md) (focus, hotkeys, keycaps, rebinding); gamepad stays out of scope.
> **Accessibility tier**: Standard (V5-013)
> **Template**: Interaction Pattern Library
> **Implements with**: `src/ui/mosaic/*` (V4_SPEC "Code layout"); the Kit gallery shows every pattern in every state

Each pattern: when to use, when not, states, accessibility, implementation note. Screens reference these by name instead of re-specifying them.

## Catalog

| # | Pattern | Component (`src/ui/mosaic`) |
| --- | --- | --- |
| P1 | Primary button | MButton `primary` |
| P2 | Secondary button | MButton `secondary` |
| P3 | Disabled button + reason | MButton `disabled` + reason line |
| P4 | Destructive action + confirm | MButton `danger` + confirm sheet |
| P5 | Toggle | Toggle |
| P6 | Stepper | Stepper |
| P7 | Segmented switch / tabs | Segmented, TabStrip |
| P8 | Option sheet (replaces cycle buttons) | new: OptionSheet |
| P9 | List row | ParchmentRow |
| P10 | Grid (stash) | ItemGrid |
| P11 | Optional sheet | BottomPanel / ParchmentSheet |
| P12 | Decision sheet | BottomPanel `decision` |
| P13 | Nested page in a sheet | sheet page stack |
| P14 | Toast and Undo toast | Toast |
| P15 | Tooltip / info | (i) + long-press + hover |
| P16 | Progress bar (labelled) | Bar |
| P17 | Chip (resource, cost, state) | Chip |
| P18 | Badge | Badge |
| P19 | Tab bar (hubs) | TabBar |
| P20 | Top bar and Back | TopBar / screen({back}) |
| P21 | Scroll area with collapsing head | ScrollArea + head |
| P22 | Skeleton / error / offline / outside states | StateCard |
| P23 | Numeric entry | new: NumberSheet (presets + keypad) |
| P24 | Coach mark | online coach system |
| P25 | Scrim | Scrim (45% basalt) |
| P26 | Text input | the HTML prompt (`textInput.ts`) restyled |
| — | Slider | **not used**: steppers (P6) and numeric entry (P23) replace sliders on touch |
| — | Battle controls (order key, medallion, group card, Undo/Then chip, facing pips) | specified in [hud.md](hud.md) §D, not repeated here |

## Patterns

**P1 Primary.** One per screen, terracotta, bottom third. *Not* for navigation-only links. States: default, pressed (inset 1 px), disabled (→ P3), busy (spinner, label kept). A11y: 44 pt min, label ≥ 6.5 UI px.

**P2 Secondary.** Aged bronze for every live non-primary action (G2). *Not* grey, ever. Same states as P1.

**P3 Disabled + reason.** Grey stone, faded icon, and a one-line reason under it or a toast on tap ("Need 40 g"). Never red. Never without a reason (DESIGN_V2 UX, controls.md R4.4).

**P4 Destructive.** Bronze with a warning glyph (skull, flag) and **always** a confirm sheet (P12) whose confirm is the danger style. Used for Retreat, Leave deployment, Reset all, Dismiss, New campaign, Strike camp, Cancel listing, Kick, Leave clan, Skip tutorial. Hiring uses P14 Undo instead (controls.md R4.3). Never adjacent to the primary (≥ 16 pt).

**P5 Toggle.** Track + knob + "On/Off" text (not colour only). 44 pt row.

**P6 Stepper.** Bronze − and + (both bronze, G2), value between, long-press repeats, the value is tappable to open P23 when the range is wide (> 20 steps).

**P7 Segmented / tabs.** Selected = lighter fill **plus** a bronze rim and ✓ or underline (G13). Count badges only for actionable states. Labels abbreviate via the i18n short form, never by switching case (MENU-3).

**P8 Option sheet.** For a filter or sort with hidden options (MKT-2, ARM-5): the button shows "Kind: All ▾"; tap opens a sheet listing every option with ✓.

**P9 List row.** ≥ 52 pt (60 with art). Title (Cinzel, one size per list), sub-line up to 2 lines (never ellipsize must-show text, G14), value at the right, chevron when it opens something. First tap selects, second opens, only where a selection matters (Army).

**P10 Grid.** One component for every stash (Army › Stash, Hero › Gear, Settlement › Sell, War army › Stash, Armoury › Sell). Cell 44 pt min: icon, rarity frame + **gem letter**, condition bar, upgrade arrow; the sell context shows the price on the cell. Equip by drag **or** tap item → tap slot.

**P11 Optional sheet.** Rises over a scrim; title, **X top right**; a footer CLOSE only when the sheet has no other action (G5). Back, X and tap outside close it. Max height 85%; sticky title; content scrolls.

**P12 Decision sheet.** For choices the game needs answered (Encounter, Event card) and for confirms. No X; tap outside does nothing; Back = the least committal choice (screen-flow.md §4). One primary, the rest bronze; cost chips (P17) on choices; a choice that can't be paid is P3.

**P13 Nested page.** A page inside a sheet (Notifications, About, New campaign, Preset tools) replaces the content with a back chevron; never a second stacked modal (G6, MENU-8).

**P14 Toast / Undo toast.** Bottom, above the action bar; 2 s; one at a time (newer replaces). Undo toast: 4 s with an "Undo" button (hiring).

**P15 Tooltip.** Every tip has three doors: a visible (i) or chevron, long-press, and mouse hover (G15). Tips are text, ≤ 140 chars.

**P16 Labelled bar.** ≥ 5 UI px tall, with a text label or value (H/M, "63%", "XP 120/240"); an empty bar shows a notch and "0%" (HRO-5).

**P17 Chip.** Icon + number (Inter, tabular). Compact numbers (1.2K, 34M) instead of ellipsis (WAR-1). The same chip order everywhere: gold, men, food, supplies (campaign); war gold, food, wood, bronze, recruits, energy (war).

**P18 Badge.** A count, red, only for actionable states (unspent points, claimable rewards, pending invites). Red is allowed here because an actionable badge is an alert (V4_SPEC "Red badges allowed"; G3). No "!" badges (G11). One per destination.

**P19 Tab bar.** Five tabs, icon + Cinzel label ≥ 6.5 UI px; the selected tab is the parchment block; War is the raised medallion with a glyph and its label in the bar (MENU-2). Hubs only.

**P20 Top bar and Back.** Back arrow left on sub-screens only, never on hubs (doors into a hub switch tabs); hidden during Duels search, where Cancel is the exit. It pops to the parent or the origin (ia.md §1.3). Plaque title centre. ⚙ right on every screen except Battle (⋯ there). Inside Telegram the arrow hides and the BackButton does the same thing.

**P21 Collapsing head.** A sub-screen's fixed head (hero card, Hero niche, Duels chips) collapses to a 1-line header after 24 pt of scroll; a fade + chevron marks clipped content (G9).

**P22 State cards.** Loading = a skeleton of the real cards; error = one line + Retry; offline = one line + Retry; outside Telegram = one line + "Open in Telegram" (opens the bot). Never a blank card with a grey line.

**P23 Numeric entry.** A sheet with presets (×1 / ×2 / ×5 of worth, or min/max) and a keypad, showing the bounds and the result ("you get 940"). For prices and quantities over 20 steps (MKT-3).

**P24 Coach mark.** One card at a time, placed opposite the controls it explains, never covering them (WAR-6); "Got it" dismisses; shown once.

**P25 Scrim.** 45% basalt under every sheet and confirm (G6).

**P26 Text input.** For Clan name and tag, Market "Find…". A sheet with a labelled field, the character limit shown ("12/24"), the keyboard's own Done, and two 44 pt buttons (Cancel bronze, OK primary), localized (CLN-3). Validation errors in text under the field, never colour only.

## When not to use, and states (patterns not covered above)

| Pattern | Not for | States | Accessibility |
| --- | --- | --- | --- |
| P5 Toggle | choices with more than 2 values (use P7) | off, on, disabled + reason | "On/Off" text beside the track |
| P7 Segmented | more than 4 options (use P8) | default, selected (rim + ✓), disabled | selection not by fill alone |
| P9 List row | actions that change state on one tap without a confirm or undo | default, selected (rim), pressed, disabled + reason | 52 pt min; 2-line sub-line |
| P17 Chip | anything tappable without a tip (a chip is read-only unless it has an (i)) | default, warning (icon + text, e.g. low food) | icon + number, never number alone |
| P18 Badge | information that needs no action | count 1-99, "99+" | count, not colour |
| P19 Tab bar | sub-screens | default, selected (parchment block), badge | label always visible |

## Animation Standards

| Motion | Duration | Easing | Reduce motion |
| --- | --- | --- | --- |
| Screen change | 180 ms parchment fade | ease-in-out | instant cut |
| Sheet in / out | 200 / 150 ms | ease-out / ease-in | instant |
| Button press | 60 ms inset | linear | same |
| Badge pop | 200 ms scale 1.15 | back-out | static |
| Banner | 150 ms slide | ease-out | instant |
| Card flip (spoils) | 250 ms | ease-in-out | instant reveal |

## Sound Standards

| Event | Sound | Note |
| --- | --- | --- |
| Primary press | the existing UI confirm | — |
| Secondary press | the existing UI tap | — |
| Disabled tap | soft thud | with the reason toast |
| Destructive confirm | low drum | — |
| Undo | reverse swish | medium haptic |
| Claim / reward | the existing coin chime | — |

## Accessibility (applies to every pattern)

- Targets ≥ 44 pt, gaps ≥ 8 pt (4 pt in the battle order bar).
- Text ≥ 6.5 UI px for meaning; contrast from `tokens.ts` CONTRAST_PAIRS (4.5:1 text, 3:1 UI).
- No state by colour alone (✓, gem, icon, glyph, label).
- No info only by long-press (P15).
- Back behaviour is the same in every pattern that has it (P11, P12, P13, P20).
