# Lessons from v5

The rules that cost the most to learn. Each is one or two lines with a pointer to where it happened.

## Running many agents on one machine

| Lesson | Pointer |
| --- | --- |
| **Disk guard.** The Mac had about 0.7 GB free and ENOSPC broke gates. Agents symlink `node_modules` (root and `server/`) instead of `npm ci`; layout-check runs with `--no-shots`; integrators `rm -rf dist shots` after gates; worktrees are removed as soon as they merge. Pause new code agents under 2 GB free. | V5-057, V5-058, PROGRESS "Blockers" |
| **Load guard.** Load averages of 27–50 made everything slow and flaky: cap at 3 code agents plus 1 integrator; the layout check took about 50 min and `npm run balance -- 400` 74 min. Stagger heavy runs; never run layout-check, regression and online-e2e at the same time. | PROGRESS items 16, 17, 24; batch 68 |
| **Stale servers.** Finished agents left 15 vite/vitest processes running, and port 5173 was held by a foreign long-running vite. Every agent stops its own servers and uses its own port. | PROGRESS items 32, 35 |
| **Serve with `vite preview`, not the dev server.** With a symlinked `node_modules`, the dev server returns 403 for the bundled fonts, so text renders in a fallback face. | PROGRESS item 36 |
| **Worktrees can branch from `main`.** Agent isolation sometimes cut the worktree from `main`, not `v5`. Every prompt starts with `git merge-base --is-ancestor v5 HEAD || git reset --hard v5`. | PROGRESS item 8 |
| **Crash recovery.** The desktop app crashed mid-gates once; the integrator re-ran the gates from the start. State lives in files (PROGRESS.md, DECISIONS.md, `git log`), never in a session's context, so a fresh session can resume. Before every tick ends, PROGRESS.md must name running agents, branches, the queue and the next step. | PROGRESS batch 77; [director-brief-v5.md](director-brief-v5.md) "Keeping the main context clean" |
| **Never disable hooks** (`core.hooksPath`, `--no-verify`), even when a merge is urgent. | PROGRESS item 32 |
| **`.claude/` is untracked.** Skills and agents are found by absolute path into one worktree; removing that worktree would break every prompt. | V5-002 |

## Flakes: find the root cause

| Lesson | Pointer |
| --- | --- |
| **A flake can be a real game bug.** "battle-kinds fails at the report under load" was a freeze: a hit-stop pose kept a frame the atlas sweep had dropped, so render threw every frame. It also showed as `glTexture` null page errors in the layout check. | f9063cd (FIXER-7); PROGRESS item 39 |
| **No fixed waits.** `online-smoke` "aborted duel leaves the battle" flaked 2 of 3 on a fixed 5 s wait; the fix waits for the real abort hand-over. | 1857f4f (FIXER-8) |
| **Wait on real conditions:** `settled()` scenes and `steadyBtn` (two equal reads two frames apart, inside the list's window) in `scripts/regression/lib.mjs`. A settings list glides for seconds at low fps; a tap read mid-glide or under the clip misses. | 60696ff (FIXER-7) |
| **Tap where the game resolves taps.** A 2-pace move pushed a man next to the facing knob, and he took the press. Pick points from the scene's own hit state, and tap in the page: a raw CDP touch read as a long press. | f19f50d (FIXER-7) |
| **Load the page once in a test context.** Load, clear storage, reload raced the first launch's save write under load, so the menu showed Continue, not Begin the march. | 7c44902 (FIXER-7) |
| **Make smoke worlds deterministic** where a random band could interfere (other bands held idle during a staged ambush), and name every check so a failure says which one. | V5-062, f8401ef |
| **Don't raise timeouts to hide load.** Heavy balance-row tests got their own timeouts once, by a fixer story with a reason, not by retries everywhere. | V5-053, S4-FIXER-3 |
| **Report both runs.** A check that fails under load and passes alone is reported twice (both results) and handed to a fixer; it is never retried away silently. | integrator template, [PROMPTS_AGENTS.md](PROMPTS_AGENTS.md) |

## Taps and controls

| Lesson | Pointer |
| --- | --- |
| **A refactor dropped a hit box.** F-07 moved the Settings Toggle out of `v3.ts`, kept `setSize`, dropped `setInteractive`: every switch drew and none took a tap. Layout checks and pixel diffs can't see it. Every control type now has a tap check in `scripts/regression/controls.mjs`. | 7575ce6, 96baec0; PROGRESS item 41 |
| **The entry fade ate taps.** Screens ignored input while their container was at alpha 0, so a fast tap right after a screen opened was lost. The smoke first waited for "menu entered"; FL-02 fixed the game, and `hub-flows.mjs` taps on the first frame of the fade. | V5-067, 38a3aa9 (S4-FIXER-5), FL-02 |
| **ScrollArea hit-clip.** On the online Shop, the masked rows of the cosmetics grid below the viewport stayed interactive under the tab bar and won every tab tap: a dead end with no Back. The scroll area's mask and tap window now follow their parent's world position. | S1-1 in [PLAYTHROUGH.md](../v5/qa/PLAYTHROUGH.md); 5af02ba |
| **Tiny tap radii fight the knob.** A man's tap radius and the facing knob overlapped; tapping a soldier now beats the knob. | V5-023, V5-034 |

## Text and fonts

| Lesson | Pointer |
| --- | --- |
| **No NBSP.** The UI bitmap fonts have no glyph for U+00A0; "12 450" drew as "12450". `fmtCount` uses a plain space, and a test checks it writes only characters the fonts carry. | F-07 NOTES; `src/i18n/numbers.ts` |
| **Only characters in `UI_CHARS` exist.** The atlas is built from `src/art/fontMetrics.ts`; arrows (→) are in it at a fixed advance, anything else draws as nothing. Check new symbols in a screenshot at 320. | `src/art/vectorFont.ts` |
| **Mixed-case Cinzel split words** ("Strat egos") in the bitmap path; caps-only Cinzel hid it until F-01 fixed the atlas. A missing bundled face fell back to a wider font; glyphs wider than their advance are now squeezed. | art bible §7.2, V5-046, 51d6973 |
| **Russian numbers and names.** Russian uses spaces between thousands and a decimal comma (`fmtCount`, `fmtDecimal`); names and places go through `heroName` and `placeName`. Untranslated Latin names and "ROAD" were found late; test at 320 in ru from the start. | LOC-01, PROGRESS items 30–34 |
| **A label keeps its name at every width.** No "MARCH" for "Campaign" on small screens; on 274 px the inactive tabs go icon-only with a long-press tip. | V5-063, V5-068 |

## Design, balance and content

| Lesson | Pointer |
| --- | --- |
| **Ship the UI that closes a state before the engine that opens it.** An event pauses the map; the deck shipped behind a flag until the card merged. | V5-064, V5-070 |
| **A balance miss gets an owner**, a number and a decision, not a block and not a silent pass. Then a later story (EC-04, EC-05, BAL-02) closes it. | V5-037, V5-069, V5-073 |
| **Re-measure the ladder after any sim change.** Doctrines, perks and terrain all moved floors; `npm run balance:ladder` makes it a one-line check. | V5-052, FINAL.md |
| **Measure before an engine upgrade.** Phaser 4 ran, but the first sheet opened 1.43× slower on low-end renderers; the gate said stay on 3.90. | V5-025, V5-028, ADR-0003 |
| **No dead controls.** Settings shows only toggles the code honours; a card never sells a feature that doesn't exist. | V5-072; EV-02 decision 2 |
| **Compatibility you don't need is cost.** With no users, the frozen v1 sim, version floors and legacy migrations were removed (−11.5k lines). Recheck before v6 ships. | V5-074, S4-NOCOMPAT |

## Art

| Lesson | Pointer |
| --- | --- |
| **Mockups invent features.** An early hub mockup invented a "Quests" tile; prompts are allowlists and renders are checked tile by tile. | memory note; [ART.md](ART.md) §3 |
| **Gemini letters shields and frames banners** unless told not to by name ("plain bronze shields, NO lambda", "no frame, full-bleed"). | AS-04 #1 |
| **Gemini can't hold a pixel grid.** It overshot cell counts 1.4–2.6x; tiny sprites (10x10, 16x44) were drawn in code. | V5-066, AS-06 |
| **The kit beats the art bible** when they disagree: the busts match the battle sprites. | V5-050 |
| **Dark-outlined icons vanish on dark stone.** The chrome gives them a light ground; repainting would break the family. | AS-03 "Legibility at 24 px" |
| **Chrome may block repeated downloads** from one site. Don't change browser settings; log it and ask the owner. | AS-02 "Limit hit" |
| **Generating is not shipping.** Assets stay staged until the story that wires their slot previews them in the real game and promotes them. | D-9, ASSET_PIPELINE |
