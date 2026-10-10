# S2-UX-IA: /ux-review of design/ux/

Story S2-UX-IA, 2026-10-10. `/ux-review all` was run by an **independent read-only reviewer** (a separate agent following `.claude/skills/ux-review/SKILL.md` and the accessibility-specialist audit checklist, WCAG 2.1 AA as the reference). I fixed the findings in commit `617ad1d`; this file records what was found, what changed and what is left.

## 1. First pass

| File | Checklist | Verdict | Primary issue |
| --- | --- | --- | --- |
| ia.md | 3A (flow) | NEEDS REVISION | the "Back to origin" and "no stacked modal" rules were broken elsewhere |
| screen-flow.md | 3A (flow) | NEEDS REVISION | ambiguous Back targets (S08, S11, S19, S22, S23) |
| screens-campaign.md | 3A | NEEDS REVISION | pinch and drag had no single-pointer path; compact blocks lacked data, events and text limits |
| screens-modes.md | 3A | NEEDS REVISION | Market and Shop Back rules contradicted ia.md; wrong Codex counts |
| hud.md | 3B | NEEDS REVISION | Z1 couldn't fit at 320 wide; Reset all sat next to FIGHT! |
| interaction-patterns.md | 3C | NEEDS REVISION | no text-input pattern; Back rule conflicts; patterns lacked "when not" and states |

**12 blocking, 11 advisory.** The HUD budget arithmetic was checked and correct; 53 ELEMENT_MAP rows were spot-checked against UI.md, with one wrong status (E192).

## 2. Findings and fixes

| # | Gate | Finding | Fix (where) |
| --- | --- | --- | --- |
| 1 | BLOCKING | Z1 top bar overflows at 320 wide | strength row moves to Z2 under 360; a Z1 width budget table; Z2 at 320 sums to 300 pt (hud §C, §I) |
| 2 | BLOCKING | Reset all adjacent to FIGHT! | Reset all moves into the ⋯ battle menu (hud §B, §D, §E; ELEMENT_MAP E195) |
| 3 | BLOCKING | WCAG 2.5.1: pinch-only zoom, knob-drag-only turn, drag-only work placement | **zoom key** on every zoomable map, **facing pips** (tap the knob, tap a direction), **tap-a-cell + ✓** placement (hud §D, §J; screens §0; ELEMENT_MAP N65-N67) |
| 4 | BLOCKING | stacked modals in 5 flows | rule: **one sheet + one confirm**; anything else is a nested page (Encounter doctrine (i), Settings inside the battle menu) (ia §6, screens §0) |
| 5 | BLOCKING | Hero Back from the Drillmaster path contradicted the origin rule | Hero → Army pick → Settlement (screen-flow S08) |
| 6 | BLOCKING | "Back always to origin" stated as absolute but not true | Principle 3 split into single-parent and multi-door screens; War army from War camp Loot returns to War camp (ia §1, screen-flow S05, S19) |
| 7 | BLOCKING | War "Codex ›" door left the tab and X target undefined | the door **switches to the Codex tab** with the sheet open; X lands on the Codex hub (ia §4 L4, screen-flow S11) |
| 8 | BLOCKING | Market deep link had two Back targets | deep link or no origin → Shop hub (screen-flow S22, M-12) |
| 9 | BLOCKING | Shop hub with a back arrow contradicted "hubs are roots" | doors into any hub switch tabs; hubs never show Back (ia §1.2, S23, M-13, P20) |
| 10 | BLOCKING | New campaign "Begin" went to World in M-15 but the hub in S03 | World; S03 entry removed |
| 11 | BLOCKING | HUB_DIRECTIONS A2 invented a Codex fresco; B2 added an unspecified line | both removed; Codex prompts use the real `myth.*.hint1` strings and list every beast by name |
| 12 | BLOCKING | E192 group cards lost portrait, name and men count while marked "Kept" | the 390 card keeps portrait, numeral, name and men (P4); only the < 360 compact card drops portrait and name (hud §D, ELEMENT_MAP E192) |
| 13 | ADVISORY | standard glyph on the card missing; doctrine chip under `realtimeLocked` undefined | both specified (hud §D) |
| 14 | ADVISORY | perk "taken" by colour only; event-card fixture not named | ✓ "Taken" / "Not taken" labels; fixtures named (C-8, C-4) |
| 15 | ADVISORY | Codex counts wrong; "Not met" naming inconsistent | 8 beasts, 5 doctrines; beasts always named; "Not met" dropped (M-1, HUB_DIRECTIONS) |
| 16 | ADVISORY | field heights ignored safe areas; rail too tall at 320x568; soldier panel and chips could collide; budget recount | safe-area table; rail = 2 + more under 420 pt of field; soldier panel on the right of Z6; command controls vs fixed chrome counted separately (hud §C, §G) |
| 17 | ADVISORY | no short-label table for order keys | en/ru short labels with limits (hud §I) |
| 18 | ADVISORY | Flee/Retreat and Withdraw ambiguity; War plaque unnamed | battle "Retreat" everywhere; Market "Cancel listing"; War plaque "PIXELARROW" (ia §5) |
| 19 | ADVISORY | tutorial replay return undefined; Flee in the tutorial | replay returns to where Settings was opened; tutorial ⋯ shows Skip tutorial (S09) |
| 20 | ADVISORY | full Settings over a fight that can't pause | under `realtimeLocked` the ⋯ menu offers only Retreat and Sound, with "The battle continues" (hud §D) |
| 21 | ADVISORY | pattern library gaps | P26 text input; slider declared unused; battle patterns pointer; P18 red-badge rationale; "when not / states / a11y" table (interaction-patterns.md) |
| 22 | ADVISORY | compact blocks without data, events, text limits; no acceptance criteria on flow docs | appendix table for every compact spec; network-hub acceptance; acceptance criteria in ia.md and screen-flow.md; global performance and resolution criteria (screens §0) |
| 23 | ADVISORY | WCAG: 2.1.1 keyboard, 1.4.4 text resize, 1.4.11 overlay contrast, 2.2.1 timing, colour-only hex ownership | overlay outline/backing plate rule; timing rationale; crest glyph on owned hexes; keyboard recorded as an **accepted deviation**; text resize left **open** (hud §J) |

## 3. Result after the fixes

| Dimension | Result |
| --- | --- |
| Completeness | Core screens (Campaign hub, World, Results) have the full 3A template; the HUD has every 3B section; the other screens use compact blocks completed by the appendix table. |
| GDD alignment | **Aligned.** Every "Touch UI needs" item in controls, battle-readability, campaign-arc, campaign-events, abilities, ai-doctrines, formations-orders and field-works has a home (ELEMENT_MAP §2, 68 new elements). |
| Pattern library | **Consistent** (design/ux/interaction-patterns.md now exists and the Back rule matches across P11-P13, P20, ia §6). |
| Accessibility | **NOT ASSESSED** against a committed requirements file: `design/accessibility-requirements.md` does not exist. Checked against V5-013 "Standard" as an assumption: targets, colour independence, single-pointer paths, overlay contrast and long-press alternatives are specified. Two known gaps: keyboard access (accepted deviation, out of v5 scope) and no text-scale option (open). |

**Verdict: NOT ASSESSED** (one dimension has no committed criterion). No known blocking issue remains. The one input that makes it checkable: write `design/accessibility-requirements.md` from V5-013 with `/ux-design accessibility`. The fixes were not re-reviewed by a second independent pass; the next `/ux-review` should run after that file lands.

## 4. Decisions for the Director to log

1. **V5-015 resolved:** the Codex is the one home of beasts and doctrines; the BeastTrial list screen is retired; the **Trial fight** is the primary action of the Codex beast sheet and returns to it. War boss panels link to the Codex (tab switch); the Codex never links into a mode.
2. **Names:** Duels "Shop" → **Armoury**; battle "Flee" → **Retreat**; Market "withdraw" → **Cancel listing**; town tab "Rest" → **Services** (villages keep Rest); camps → **Field camp** / **War camp**; First run → **Three ways to fight**.
3. **Market doors:** a Market card on the Shop hub; Market's default origin is the Shop hub; **no** door from campaign towns (different economy).
4. **Hubs are always roots:** no back arrow on any hub, and a door into a hub switches tabs.
5. **Battle ⋯ menu** holds Settings, Retreat, Leave and Reset all; under `realtimeLocked` only Retreat and Sound.
6. **Stacking rule:** at most one sheet plus one confirm; everything else is a nested page.
7. **Drillmaster flow:** the town Services row → Army pick → Hero › Perks in retrain mode.
8. **Single-pointer alternatives** (zoom key, facing pips, tap-to-place works): presentation-only additions that amend controls.md R2 and field-works.md "Touch UI needs". The GDD owners should fold them in.
9. **Commit the accessibility tier file** (`design/accessibility-requirements.md`) from V5-013, recording the SC 2.1.1 keyboard deviation and the open text-scale question.
10. **Campaign hub status line shows "Lairs n/6"** (display only, from the arc state).
11. **Proposed, needs a yes:** a Codex "Defeated ✓" mark on beasts (a small optional save flag).
12. **Hub direction:** render A, B and C (HUB_DIRECTIONS.md) and let the owner pick; C's muster roll is a new presentation of roster data and needs an owner OK before it is built.
