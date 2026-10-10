# S2-UX-IA: answers to the skills' questions

Story S2-UX-IA, 2026-10-10. The user is asleep, so I answered every question the skills ask as the UX lead (`project.yaml`: `automation: autonomous`, `rigor: standard`, so workflow `standard` and docs density `balanced`). Each answer names its source. The Director can overturn any of them; the ones that change scope or the approved look are copied to the "Decisions for the Director" list in [REVIEW.md](REVIEW.md).

## Skill set-up questions

| # | Skill / question | Answer | Source |
| --- | --- | --- | --- |
| Q1 | `/ux-design`: "What are we designing today?" (no argument) | Four modes in one pass: the **flow and IA** (`design/ux/ia.md`, `screen-flow.md`), a **UX spec per screen** (`screens-campaign.md`, `screens-modes.md`), the **HUD** (`hud.md`) and the **pattern library** (`interaction-patterns.md`). | The story brief. |
| Q2 | `/ux-design` Phase 2: "Ready to start, or need more context?" | Ready. Context read: NAV.md, UI.md, AUDIT.md, VISION.md, DECISIONS.md (to V5-024), the 8 GDDs, GDD_REVIEW.md, V4_SPEC.md, GEMINI_BRIEF.md, ART_STYLE.md and the scene code (`src/scenes/**`, `src/ui/mosaic/hub.ts`, `src/online/deeplink.ts`). | |
| Q3 | `/ux-design` Phase 3: "May I create the skeleton?" / "May I write to …?" | Yes. The orchestrator named the destinations (`design/ux/`, `docs/v5/ux/`), which is the bounded exception in `ux-designer.md`. | Brief. |
| Q4 | `workflow` tier: which screens need a full UX spec? | `standard`: core screens get the full template (Campaign hub, World map, Battle HUD, Results). Every other screen gets the **compact spec block** (purpose, primary action, entries and exits, inventory, states, touch rules, acceptance). That satisfies the brief's "per screen" list without 25 full templates. | `project.yaml`, V5-010. |
| Q5 | `docs.density` | `balanced`: wireframes plus short paragraphs for flows. | V5-010. |
| Q6 | Player journey map (`design/player-journey.md`) | Absent. I used VISION.md "Core loop" (30 s / 5 min / session / weeks) as the journey. Arrival context in each spec comes from it. | VISION.md. |

## Platform and accessibility (accessibility-specialist, game-ui-ux, ux-review)

| # | Question | Answer | Source |
| --- | --- | --- | --- |
| Q7 | Which compliance target applies? | **Standard** (V5-013): text contrast 4.5:1, UI contrast 3:1, no state by colour alone, touch targets ≥ 44 pt, meaningful text ≥ 6.5 UI px (13 CSS px). WCAG 2.1 AA is the reference for criteria. | V5-013, UI.md G10. |
| Q8 | `design/accessibility-requirements.md` does not exist. Commit the tier there? | **Not in this story** (scope is `design/ux/` and `docs/v5/ux/`). The specs cite V5-013 as the committed tier. I flag the missing file to the Director: it should be written by `/ux-design accessibility` from V5-013 plus the rules in `interaction-patterns.md` §A11y. | Scope. |
| Q9 | Input methods in scope? | **Touch first** (Telegram, portrait). **Mouse** on Telegram Desktop second: hover shows the same tips, wheel zooms. **Keyboard and gamepad focus navigation are out of scope for v5**, but no information may be reachable only by long-press. | UI.md CD answers, controls.md R11. |
| Q10 | Platform sizes and aspect policy? | Designed at **390x844**. Must be clean at **360x780**. Must be usable at **320x640 and 320x568**: nothing that matters hidden, no must-show text ellipsized. Portrait only. Extra height goes to the scroll area; extra width is centred (the kit's scale-to-fit). | Brief, V5-014. |
| Q11 | Safe area? | Telegram supplies the insets (`--tg-safe-area-*`). The top bar sits under the Telegram header inset; the tab bar and the battle order bar sit above the bottom inset. Nothing interactive in the outer 8 pt. | game-ui-ux "Respect the safe area". |
| Q12 | Screen model? | A **stack**: hub (root) → sub-screen → sheet. Hubs are roots (Telegram shows Close). Sub-screens and sheets pop. Every push carries a `back` target, so Back is never a guess. | game-ui-ux "Model screens as a stack", NAV D12. |
| Q13 | HUD update model? | Event-driven. Readouts listen to sim events (`flanked`, `rout`, `cohesion`, `disordered`, `armyBreak`, `standardLost`, `stakesBreak`, `impact`, `ability`) and per-tick read-only state; nothing in the UI owns game state. | game-ui-ux pattern 5, battle-readability.md. |

## Design questions (ux-designer)

| # | Question | Answer | Source |
| --- | --- | --- | --- |
| Q14 | Core player goal? | Get from "open the app" to "a battle with a real decision" in ≤ 2 taps from any hub, and always know how to get back. | VISION P3, core loop. |
| Q15 | Constraints? | No new features: the IA only places what is in the code or a merged GDD. Keep the v4 shell and the five tabs (locked with the owner). One terracotta primary per screen. | V4_SPEC, memory "verify mockups". |
| Q16 | Reference games? | Navigation: Clash Royale / Marvel Snap (mode tabs as roots, one CTA per hub). Battle: Total War's unit cards, Pixel Formation's paper HUD (ART_STYLE §11). | V4_SPEC, ART_STYLE. |
| Q17 | Pillars that drive the IA? | P3 (one hand, ≤ 2 taps to the action), P2 (every state readable, never colour only), P4 (the company is always one tap away). | V5-017. |

## IA decisions (each became a rule in `design/ux/ia.md`)

| # | Question | Answer | Why |
| --- | --- | --- | --- |
| Q18 | Keep five tabs (Campaign · Duels · War · Codex · Shop)? | **Yes, unchanged.** | Locked with the owner in v4; the audit found the shell right and its content wrong. |
| Q19 | **V5-015: Codex vs Beast Trial.** | **Codex is the one home of beast and doctrine knowledge. The Trial is an action inside a Codex beast entry ("Trial fight", practice), not a screen.** The BeastTrial list screen is retired: its list was a duplicate of Codex's. The beast sheet moves to Codex intact (stage art, how it fights, counter, loot) and gains the Trial button. A Trial fight returns to the same beast sheet. The War boss panel links to the Codex entry ("Codex ›"); the Codex never links into War. | NAV D3, N1; CDX-1, TRL-1; V5-015 ("Codex stays the encyclopedia; the Trial stays the action"). |
| Q20 | What goes in the Codex? | Two sections: **Beasts** (exists) and **Doctrines** (ai-doctrines.md: unlocked the first time you fight one). "Units" and "Lore" from the old Gemini brief are **not** added: no code or GDD has them. | Honesty rule; ai-doctrines.md "Codex". |
| Q21 | Trial button label and rule copy? | "Trial fight", with the sub-line "Practice: no spoils" (VISION: "The Beast Trial becomes Practice: no loot, no gold, no pity"). If the fix story chooses a cooldown instead (V5-011 allows either), the sub-line shows the cooldown. | VISION, V5-011. |
| Q22 | The Campaign hub Stash tile duplicates Army › Stash (NAV D4). Remove it? | **Keep it.** It is a second door to the same home, not a second home, and it is in the approved mockup A1. The rule is "one home per thing, as many doors as help". | V4_SPEC "mockup wins"; removal only when truly redundant. |
| Q23 | Five "shops" (NAV D2). | One home each, named by role: **Shop** (Shop tab: cosmetics, Pass, Wallet), **Armoury** (Duels' Glory shop, renamed from "Shop"), **Market** (player trade), **Merchant** (map merchants on the war map), **Buy** (town stalls, a Settlement tab). Only the Duels "Shop" is renamed, because it is the only one that collides with a tab name. | Minimal change; DUE-8. |
| Q24 | Where does the Market live (D5, MKT-4)? | Its home stays a War sub-screen (it trades war gold and the war stash). **New doors:** a "Market" card on the Shop hub's Shop page, plus the existing War Army button and the bot deep link. **Not** from campaign towns: the campaign stash is offline and can't be listed, so a door there would lead to a screen that can't use it. | MKT-4 asked for towns; the economies differ. |
| Q25 | Hubs show a back arrow (Duels, War)? | **No.** Hubs are roots (D12). War "unavailable" offers "Open in Telegram" instead of "Back to menu" (N7, WAR-5); Duels "outside" gets the same button (DUE-9). | NAV D12, N7. |
| Q26 | Army's footer back says "Map" but goes to the Menu (N3). | The footer back is **removed**; the top-bar back (or Telegram's) is the only back, and it goes to the origin carried in `back`. | NAV N3, D8. |
| Q27 | Where do battles return to? | **Always to the origin**: every battle start carries `back`. Band fight and lair assault → World (centred where the fight was); Trial → the Codex beast sheet; tutorial → First run; duel → Duels view; war → War hub focused on the hex. Leave-in-deployment returns to the same origin (N2). | NAV N1, N2. |
| Q28 | Drillmaster (abilities.md R7): a Settlement row, but retraining is about one hero. Where? | **Door** in the town's services list ("Drillmaster · 40 g × tier"), **home** on Hero › Perks in a *retrain* mode. The row opens the Army roster in a pick mode ("Retrain whom?"); picking a hero opens Hero › Perks with Retrain buttons on taken tiers. Towns only (villages have none). The town's "Rest" tab is renamed **"Services"** to hold Rest, provisions, the physician and the drillmaster. Villages keep "Rest". | abilities.md R7 and Touch UI needs. |
| Q29 | Arc tracker and the event journal (campaign-arc.md, campaign-events.md): two sheets or one? | **One sheet** opened from the World top bar's "Lairs n/6" chip, with two segments: **Lairs** (the list, tap = centre the map) and **Journal** (the last 20 event lines). Both GDDs name that chip as the door. | campaign-arc.md, campaign-events.md Touch UI needs. |
| Q30 | Show the arc progress on the Campaign hub too? | **Yes, as text on the profile card's status line** ("Day 14 · Lairs 2/6"), display only. It answers the playtest goal "say what the campaign's goal is after 10 minutes" and adds no control. | campaign-arc.md acceptance; display of existing state. |
| Q31 | Encounter sheet: no close (N6). | The encounter is a **decision sheet**: no X, because it must be answered. System Back = the least committal choice the band allows ("Let them go"); if the band hunts you, Back shakes the sheet and highlights Flee with the line "They won't let you go". The rule is stated on the sheet. The Assault sheet is optional, so it has an X (= Leave). The event card follows the encounter rule (Back = its free choice; campaign-events.md R4.5 guarantees one). | NAV N6, G5. |
| Q32 | Results system Back takes the spoils silently (N8). | Back on Summary/Heroes with unseen spoils goes to the **Spoils** tab first; on Spoils, Back = Onward with a toast "Spoils taken: n". | NAV N8, RES-6. |
| Q33 | Cloud-sync adopt jumps to the Menu silently (N9). | It still lands on the Campaign hub (the safest root), but with a notice sheet: "A newer save from another device was loaded (day n)". | NAV N9. |
| Q34 | FirstRun "Two ways to fight" vs three tabs (FR-3). | Three mode cards in tab order: Campaign, Duels, War. | FR-3, D10. |
| Q35 | Duels search shows a fake back (N5). | The back arrow is hidden while searching; Cancel is the exit. | NAV N5. |
| Q36 | Duels Team: Dismiss has no path (N10, DUE-13). | A Dismiss action on each bench row (the existing `openDismiss` confirm). Hero's Dismiss stays. | NAV N10. |
| Q37 | Duels Team ↔ Shop loop (D11). | Views open from the hub only; each view's Back returns to the hub view it came from. The Team and Armoury headers lose the cross-link buttons. | NAV D11. |
| Q38 | Camp has two meanings (D7). | Titles **"Field camp"** (campaign) and **"War camp"** (home or forward; the War camp keeps its kind in the sub-title). The Campaign hub's Camp tile only ever opens the field camp. | NAV D7. |
| Q39 | "Back" means three things (D8). | Navigation Back is only the top-left arrow (or Telegram's). The order key is **Withdraw** (controls.md R9, V5-024). The Army footer back is gone (Q26). | D8, GDD review. |
| Q40 | Settings door missing on map scenes and battle (D9). | The gear sits in every top bar, including World, Camp and sub-screens. In battle it lives in the **battle menu** (the top bar's ⋯ key: Settings, Retreat, and in deployment Leave and Reset all; opening it pauses an offline battle), so Retreat is no longer one stray tap from Pause. Under `realtimeLocked` it offers only Retreat and Sound. The Telegram ⋯ menu stays a second door. | NAV D9. |
| Q41 | Dead code (radial ring, `openCampPanel`, `placing`, `common.ts` helpers). | Not UI elements a player can reach; listed in ELEMENT_MAP as "dead code, not mapped" so the map is complete. Cleanup belongs to an engineering story. | NAV §5. |
| Q42 | Kit (`?scene=Kit`)? | Stays debug-only and unlinked. Its legacy V3 tab is out of the player IA. | KIT-1. |

## HUD questions (`/ux-design hud`)

| # | Question | Answer |
| --- | --- | --- |
| Q43 | HUD philosophy | **Adaptive and field-first**: the field carries the state (badges, glyphs, arcs, rings); the chrome carries only the controls the thumb needs right now. Deployment, live fight, paused and the end beat have different densities. |
| Q44 | Categorisation of every GDD HUD item (Must Show / Contextual / On Demand / Hidden) | See `hud.md` §B. Must Show: group cards with glyph and H/M bars, the order bar, the clock or men, the strength row, Pause/Play (offline). Contextual: Undo, Then…, out-of-range chip, boss bar, banners, flank arcs, reticle, range ring, medallions (only for a selection with abilities), staged ghosts, ladder ticket timer. On Demand: doctrine tell (tap the chip), terrain info (Inspect), the "more" medallion sheet, the shape sheet, Assign groups, Works tray. Hidden (audio and field only): routine hits, block sparks. |
| Q45 | Layout zones: which of the 3 arrangements? | **B: "Command at the thumb"**: everything you touch in the bottom 40%; readouts at the top; medallions on the right edge at thumb height (left with Left-hand). Rejected: A (cards on top, orders on bottom: two far reach zones) and C (a side rail for orders: too narrow at 320). |
| Q46 | Visual budget | At most 4 kinds of interactive control at once in a live fight (controls.md R10b); chrome covers at most 30% of the screen at 390x844 and 34% at 320x568. |

## Hub mockup questions

| # | Question | Answer |
| --- | --- | --- |
| Q47 | How many directions? | Three: **A Fresco Hall** (the approved A1, finished), **B War Table** (the region map first), **C Muster Roll** (the company first). Each lists only real elements. |
| Q48 | Art bible? | `design/art/art-bible.md` is **not merged** in this worktree. The briefs use V4_SPEC.md (locked look), ART_STYLE.md §11 and the A1-A3 references, with a TODO to re-align when the art bible lands. |
| Q49 | Which screens per direction? | The Campaign hub (the main prompt) and the Codex hub (the new IA piece), so the assets agent can judge each direction on a hub with content and one that is mostly a list. |

## ux-review questions

| # | Question | Answer |
| --- | --- | --- |
| Q50 | Which spec to validate? | `all` files under `design/ux/`. |
| Q51 | Tier for the review? | V5-013 Standard, cited as a committed Director decision; the absent `design/accessibility-requirements.md` is reported as a gap (see REVIEW.md). |
