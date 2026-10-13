# pixelarrow v5: the report

For the owner. Written by QA-06 on 2026-10-13, on the local branch `v5` at `8f46243` (the AS-08 merge, where the final gates ran). Nothing was pushed, merged to `main` or deployed.

**In one paragraph.** v5 set out to make pixelarrow a polished, deeper game without losing what was already fun. It rebuilt every screen on a new design system, made battle orders work by thumb, added six mechanic expansions (each with a design doc, tests and balance numbers), painted the art, added sound, polished the Russian, and closed with a full playthrough, a code review and a performance pass. **Verdict: done, and ready for your release decision.** Every planned story is merged with no cuts, every gate is green, and the playthrough's blockers are fixed. What stays open is small, and listed in section 14: software-GL frame rate, boot still waiting for the second chunk, a sound check on a real phone, and a few things only you can do (section 15). The rest of this page says what changed, how it was checked, what is still open, and what only you can do.

Contents: [Goal and verdict](#1-what-v5-set-out-to-do-and-the-verdict) · [Before and after](#2-before-and-after) · [Mechanics](#3-mechanics-added-and-changed) · [Controls](#4-controls) · [UI system](#5-the-ui-system) · [Audio and feel](#6-audio-and-feel) · [Russian](#7-russian-localization) · [Balance](#8-balance) · [Performance](#9-performance) · [QA](#10-qa-results) · [Skills](#11-skills-log-summary) · [Art](#12-art) · [Decisions](#13-decisions) · [Open issues](#14-open-issues-and-risks) · [**What you must do**](#15-what-the-owner-must-do) · [Next](#16-whats-next) · [Retrospective](#17-retrospective)

## 1. What v5 set out to do, and the verdict

The brief (`.claude/prompts/redesign-v5-director.md`, copied to [docs/playbook/director-brief-v5.md](../playbook/director-brief-v5.md)) asked for:

| Goal | Done? | Where |
| --- | --- | --- |
| UI and art that look finished; menus that are intuitive and correct | Yes. Every screen rebuilt on one kit; 21 busts, frescoes, vignettes, beast plates, icons and the Nikias portraits painted | sections 2, 5, 12 |
| Deeper mechanics that keep the heart (formations, morale breaks, flanks, javelins) | Yes. Six expansions, each with a GDD, tests and balance numbers | sections 3, 8; [GATE.md](qa/GATE.md) |
| Fast, clear, forgiving orders on a phone | Yes. Tap-first input layer, previews, Then queue, undo, paused planning, left-hand mirror | section 4 |
| Progression, onboarding, feel, audio | Yes. 8-man start, campaign arc, events, a new tutorial, juice tiers, transitions, a mixer | sections 3, 6 |
| Every screen at 390x844 and 360x780 (and 320) | Yes, by the layout check at 24 configurations x 196 screens | [GATE.md](qa/GATE.md) |
| Final QA: playthrough, code review, performance, gate check, report | Yes. This file closes it | section 10 |

**Size of the work.** 866 commits on `v5` since `main` (131 merges), about 95 stories and fixers, over four days (2026-10-10 to 2026-10-13). `src/` and `server/src/`: +33.5k / −8.0k lines (it would be more, but 11.5k lines of compatibility code were deleted once we learned there are no users yet, V5-074). Tests went from **525 to 1,538** in the client, and the server has **303**.

**The gates.** Every gate is green, first try: tsc 0 errors, vitest 1,538/1,538, build OK, server typecheck clean and 303/303, balance with no drift, ladder 49/50, art check 0 FAIL, layout check 24 configs × 196 screens with 0 new violations, all six smokes, the regression suite (5/5 scripts), online end to end 34/34, and replay hashes 13/13 in Chromium and WebKit. Full table: [docs/v5/qa/GATE.md](qa/GATE.md).

Gate check (Polish → Release; a recommendation, you decide): **CONCERNS**. Milestone review, go/no-go: **CONDITIONAL GO**, on the conditions in section 15.

## 2. Before and after

"Before" is v4 (`main`), taken in the audit or by the story that rebuilt the screen. "After" is v5. All images are JPEGs already in the repo; click to open.

| Screen | Before (v4) | After (v5) |
| --- | --- | --- |
| Campaign hub | [HUB-02 before](stories/HUB-02/before-390x844-en-new.jpg) | [HUB-02 after](stories/HUB-02/after-390x844-en-new.jpg), [in play](qa/shots/37-campaign-hub-390-en.jpg) |
| First run, mode choice | [audit 20](audit/play/20-first-run-modes.jpg) | [QA 13](qa/shots/13-firstrun-modes-390-en.jpg), [first run with Nikias](qa/shots/01-firstrun-390-en.jpg) |
| Tutorial | [audit 03](audit/play/03-tut-select.jpg) | [QA 06](qa/shots/06-tut-loose-390-en.jpg), [flank step](qa/shots/10-tut-flank-390-en.jpg) |
| World map and encounter | [WLD-01 before](shots/WLD-01/before-world-ru-390x844.jpg), [audit 28](audit/play/28-encounter.jpg) | [WLD-01 after](shots/WLD-01/after-world-ru-360x780.jpg), [encounter](shots/WLD-01/after-encounter-en-390x844.jpg) |
| Deployment | [audit 38](audit/play/38-deploy.jpg) | [QA 19](qa/shots/19-deploy-ready-390-en.jpg) |
| Battle | [audit 54](audit/play/54-fight-1.jpg) | [QA 22, paused planning](qa/shots/22-battle-midpause-390-en.jpg), [QA 23, flank](qa/shots/23-battle-flank-390-en.jpg), [BTL-01 HUD](stories/BTL-01/390-en-hud.jpg) |
| Results | [RES-01 before](shots/RES-01/before-win-en-390x844.jpg) | [RES-01 after](shots/RES-01/after-win-en-390x844.jpg) |
| Army | [ARM-01 before](shots/ARM-01/before-en-390-8men.jpg) | [ARM-01 after](shots/ARM-01/after-en-390-8men.jpg) |
| Hero and perks | [HERO-01 before](shots/HERO-01/before-en-390-perks.jpg) | [HERO-01 after](shots/HERO-01/after-en-390-perks.jpg), [A/B perk sheet](qa/shots/33-hero-perk-sheet-390-en.jpg) |
| Field camp | [CMP-01 before](stories/CMP-01/before-en-390-day.jpg) | [CMP-01 after](stories/CMP-01/after-en-390-day.jpg) |
| Settlement | [audit 22](audit/play/22-town.jpg) | [QA 28, services](qa/shots/28-settlement-services-390-en.jpg) |
| Codex | [CDX-01 before](shots/CDX-01/before-codex-en-390x844.jpg) | [CDX-01 after](shots/CDX-01/after-codex-en-390x844.jpg) |
| Duels, ladder | [DUE-01 before](stories/DUE-01/before-320x640-ru-ladder.jpg) | [DUE-01 after](stories/DUE-01/after-320x640-ru-ladder.jpg) |
| War map | [audit 69](audit/play/69-war-map.jpg) | [QA 80, hex panel](qa/shots/80-war-hex-panel-390-en.jpg) |
| Shop | [SHP-01 before](shots/SHP-01/before-shop-en-390x844.jpg) | [SHP-01 after](shots/SHP-01/after-shop-en-390x844.jpg) |

The playthrough fixes have their own before/after pairs in [qa/fixes/](qa/fixes/) (battle, ui, world). The full v4 audit set (209 shots, PNG) is in [audit/shots/](audit/shots/).

## 3. Mechanics added and changed

The core loop is kept: formation tactics, morale breaks, flanking, javelins. Everything below ships in one sim version (`SIM_VERSION` 2), which the server replays, so online results stay verified.

| Expansion | What the player gets | GDD |
| --- | --- | --- |
| **AI doctrines and band captains** (AI-01..03) | Enemy bands fight in one of five styles (steady, rush, hammer, swarm, fury), shown on the encounter sheet. Named captains lead bands, carry a bounty, and can withdraw and come back weaker. The ladder and the war map's neutrals use doctrines too. | [ai-doctrines.md](../../design/gdd/ai-doctrines.md) |
| **Formations and orders** (FO-01..03) | Face (turn without losing the order), focus fire for missile groups, the orb (all-round defence), the feint, group cohesion and the army-break rule (routs now cascade believably). | [formations-orders.md](../../design/gdd/formations-orders.md) |
| **Perk paths, signature actives, the Standard** (AB-01..03, EC-03) | Each perk tier is an A/B choice, with a retrain at the Drillmaster (40 g × tier). Seven signature actives (Push of Pike, Sacred Bond, War Cry, Sunder, Aimed Volley, Re-charge, Scythe Run). The Standard: a bearer whose banner steadies the line, and whose loss hurts. | [abilities.md](../../design/gdd/abilities.md) |
| **Campaign arc** (AR-01..04) | Start with 8 men (not 3), so formations matter from the first fight. Six lairs to assault behind their works, tier-3 bands late, and the Tyrant's host as the end of the campaign, with reborn lairs after it. | [campaign-arc.md](../../design/gdd/campaign-arc.md) |
| **Overland events** (EV-01..03) | A deck of event cards on the map and in towns, with choices and lasting consequences, plus a journal. | [campaign-events.md](../../design/gdd/campaign-events.md) |
| **Field works** (FW-01..03) | Stakes, ditch, wagon laager, palisade and rampart, placed in deployment from a supply allowance (campaign only). | [field-works.md](../../design/gdd/field-works.md) |
| **Forge** (EC-01) | Reroll an item's affixes: the endgame gold sink. | [forge-reroll.md](../../design/gdd/forge-reroll.md) |
| **Practice** (LF-02) | The Beast Trial is now practice, started from the Codex: no spoils, no deaths. Before, it was a free, repeatable legendary farm. | [practice-fight.md](../../design/gdd/practice-fight.md) |

Also changed: the item power cap (EC-02: no item adds more than 10 win-rate points; 8 legendaries and 3 sets trimmed), class costs and missile tuning (EC-04, EC-05), a why-line on every defeat (RD-03), and ladder pause with 0.5× and 2× speed (CT-06, 30-minute ladder tickets). Removed, each with a reason: the radial order ring (the order bar replaces it, V5-034) and the BeastTrial list (the Codex is the one home, V5-029).

Each expansion's GDD, tests and balance doc: [GATE.md › Expansions](qa/GATE.md#every-expansion-has-a-gdd-tests-and-balance-numbers).

## 4. Controls

Touch first, mouse and keyboard second. Design: [controls.md](../../design/gdd/controls.md); the input layer is ADR-0004.

- **Input layer** (IN-01, IN-02): battle pointer handling lives in `src/ui/input/` with a pure, tested hit-test. Menus and maps keep 44 pt targets and spacing, which the layout check enforces.
- **Selection and orders** (CT-01, CT-02): tapping a soldier beats the facing knob; the knob sends `face` and keeps the order; the order bar takes the group's colour and numeral; tap an enemy to attack; a focus reticle, a range ring and an out-of-range card state.
- **Forgiving** (CT-03, CT-04): a 3 s Undo chip after every order and a 10-step deployment undo; previews; one "Then…" queued step per group; planning while paused. Confirms only where a mistake is costly.
- **Camera** (CT-05): the opening zoom shows the enemy, follow keeps the selected group in view, and edge pointers show what's off screen.
- **Pace** (CT-06): who may pause is explicit, and the ladder can now pause and run at 0.5× or 2×.
- **Accessibility** (CT-07, DLG-01): orb and feint buttons, an attention budget, a left-hand mirror, a single-tap alternative to every gesture, reduce motion, reduce shake and flash, and haptics. Text scale (A11Y-11) is an accepted deviation (V5-072).
- **Proxy-player results** (QA-03): 0 wrong-group orders in about 9 battles, 0 mistaken knob grabs, and 9 real decisions in the first battle (target 8).

## 5. The UI system

- **Tokens** (F-01): colour roles, a type scale and two bundled fonts, Cinzel 700 caps for display and Inter for body and numbers (V5-046). This also fixed the "Strat egos" split-word bug. Contrast pairs are tested (38/38).
- **Kit** (F-02, F-03): frames, buttons, cards, the tab bar, pills, badges, sheets, confirms, toasts and the scrim, with a rule of at most one sheet plus one confirm on screen.
- **Kit scene** (F-05): `?scene=Kit` shows every component in every state. Shots: [tokens](stories/F-05/kit-tokens-en-390x844.jpg), [states](stories/F-05/kit-states-en-390x844.jpg), [icons](stories/F-05/kit-icons-en-390x844.jpg).
- **Navigation** (HUB-01, V5-029): five tabs (Campaign, Duels, War, Codex, Shop), hubs are roots, and each thing has one home. Hub direction A, "Fresco Hall", was picked from three Gemini mockups (V5-047).
- **Clean-up**: the v3 UI and the inkify shim were retired (F-07), dead code was removed (F-06), and the 1,770 text-size violations allowlisted at the start were cleared screen by screen to under 50.

## 6. Audio and feel

- **Juice** (FL-01): kills puff, charges land with hit-stop and shake, routs and army breaks shake the field, and abilities flash a ring. Reduce shake and flash is honoured.
- **Transitions** (FL-02): field transitions fade through parchment, UI slides, and every press answers on the same frame. Entry fades no longer eat taps (V5-067).
- **Sound** (FL-03, SND-02): the audio is procedural (synthesised in WebAudio). A mixer in dB with world, music, SFX and UI buses; ducking under the horns and the army-break chord; a pause gate that fades the field out while the battle is paused; a sound for each juice tier; a haptics map; and UI sounds for disabled taps, destructive confirms and Undo.
- **Not yet heard on a phone.** Every sound was checked by tests and offline renders, never through a phone speaker. See section 15.

## 7. Russian localization

LOC-01 polished the Russian end to end: Cyrillic hero, captain and place names, spaces between thousands and a decimal comma (`fmtCount`, `fmtDecimal`), units, and no English left on any screen. The layout check covers every screen in Russian at all six sizes, and the playthrough found the Russian "reads natively". Shots at 320: [battle HUD](stories/LOC-01/ru-320-battle-hud.jpg), [hero sheet](stories/LOC-01/ru-320-hero-sheet.jpg), [world towns](stories/LOC-01/ru-320-world-towns.jpg).

## 8. Balance

Sources: [balance/FINAL.md](balance/FINAL.md) (FL-04 and BAL-02), one file per mechanic story in [balance/](balance/), and this run's `npm run balance` and `npm run balance:ladder` (200 seeds, 716 s, identical to the anchors; the ladder at 300 paired seeds).

| Axis | Now (this run, 200 seeds unless noted) | Target | Status |
| --- | --- | --- | --- |
| Matched fights, player win | **53%** (54% at 400 seeds), median 72.5 s | 45–55% | met |
| First contact | 11.0 s | ≤ 15 s | met |
| 8-man opening vs starter bands | 69% (66% at 400 seeds) | 55–70% | met (BAL-02) |
| Lairs: hydra / cyclops / lion | 43 / 58 / 53% | about 45–60% | hydra within noise |
| Lair assault at 1.0× / 1.3× | 45% / 93% | 38–48% / ≥ 60% | met |
| The Tyrant's host | 49% | 40–55% | met |
| War-map minotaur / chimera | 58 / 60% (40 seeds; 54 / 55% at 400) | 45–60% | met (BAL-02) |
| Ladder floors within ±5 | **49 of 50** | all 50 | floor 28: +7 at 300 seeds, +4 at 1,000 (noise) |
| Archer / slinger class means | 47 / 48% | ≥ 40% | met |
| Rarity mirror at L10 (uncommon to legendary) | 60 / 68 / 75 / 84% | 58 / 66 / 76 / 85% | met within noise |
| Retrain cost | 40 g × tier | between one early win and one tier-3 win | kept (EC-03) |

**Accepted deviations** (each has an owner and a reason in DECISIONS):

- The orb against a frontal equal line wins 0% (only 5 of 8 men can reach). The orb is a defensive choice, and bots never pick it against a line (V5-041).
- Battles are 15% shorter with cohesion on (target: within 10%). Welcome, given the audit's slow-pacing finding (V5-048, FINAL D13).
- 22–23 shock-infantry-vs-elite cells over 85%, and 99 of 306 lopsided single-class cells. Structural: equal cost means fewer elite men. Mixed armies are in band (V5-069, V5-073, D14).
- Kill-captain −9 pts, the Standard +4 (target +5..+8), flanker vs face 36%, swarm 39%, Bond / Aimed / Recharge about 0 in bot mirrors (the bot rarely fires them at the right moment), bounty +3%. Routed to a post-v5 balance and AI pass (V5-073, D13).
- Three `INTENDED_COUNTERS` entries (archer, slinger and horse archer beat hoplites) contradict the class GDD; the systems designer should drop or reword them (D14).
- There is no Glory or offline-gold target yet: the economy is computed, not judged (FINAL, open risk 1).

## 9. Performance

Source: [qa/PERF.md](qa/PERF.md) (QA-05). "Before v5" is the P4 baseline build (v5 @ b829290, the same game code as `main`), on the phone proxy: Chromium on the GPU with CPU throttling, 390x844 at DPR 2, 20 men.

| Metric | Before v5 | v5 before QA-05 | v5 now |
| --- | --- | --- | --- |
| Hub open, GPU 4x | 2,304 ms | 2,483 ms | **1,948 ms** (−15%) |
| First sheet open, GPU 4x / 6x | 333 / 353 ms | 288 ms / — | **264 / 269 ms** |
| Battle FPS, GPU 4x / 6x | 59.9 / 57.7 | 58.4 / 41–51 | **59.9 / 60.0** |
| Battle FPS, software GL 4x | 23.8 | — | **18.0** (worse; section 14) |
| Main JS chunk | 3,102 kB | 3,541 kB | **2,743 kB**, plus a 808 kB second chunk |
| Icon atlases loaded at boot | — | 1,765 kB | 1,149 kB (WebP twins) |
| Heap growth over 10 battles | +2.8 MB | +2.2 MB | +1.9 MB (no new leak) |
| WebGL context loss in 4 places | — | pass | pass |

The battle FPS fix is a Phaser 3.90 patch that draws arcs with only as many chords as the radius needs (earcut had taken 56% of the main thread). The boot fix skips Phaser's canvas read-back for static canvases.

## 10. QA results

**Final gate run (this story):** Every gate is green, first try: tsc 0 errors, vitest 1,538/1,538, build OK, server typecheck clean and 303/303, balance with no drift, ladder 49/50, art check 0 FAIL, layout check 24 configs × 196 screens with 0 new violations, all six smokes, the regression suite (5/5 scripts), online end to end 34/34, and replay hashes 13/13 in Chromium and WebKit. Details: [GATE.md](qa/GATE.md).

**Playthrough** ([qa/PLAYTHROUGH.md](qa/PLAYTHROUGH.md), QA-03: about 3 h of proxy play at 390, 360 and 320, in en and ru). The verdict at the time was **NOT APPROVED**, for 1 S1 and 2 S2:

- S1: on the online Shop, hidden cosmetic rows took every tab-bar tap (a dead end).
- S2: after a camp defeat, the band attacked again within a second, until no man was fit.
- S2: the encounter sheet miscounted the army and called a lost fight "an even match".

QAFIX-UI, QAFIX-WORLD and QAFIX-BATTLE fixed all three and all 12 S3s, with before/after shots in [qa/fixes/](qa/fixes/), and the regression suite now covers them. AC scorecard: 45 pass, 8 partial, 6 fail, 6 not assessed (they need real people). The two playtest FAILs (telling who is winning at a random pause; 10 decisions in a 24-man lair assault) are design findings, partly addressed by the auto-pause message and the assault fixes.

**Code review** ([qa/CODE_REVIEW.md](qa/CODE_REVIEW.md), QA-04): **APPROVED WITH SUGGESTIONS.** S1: 1 found, 1 fixed (a damaged save index lost the campaign). S2: 1 found, 1 fixed (a paused camp rest resumed by itself). S3: 16 found, 9 fixed, 7 open. S4: 21 found, 4 fixed, 17 open. −840 / +396 lines.

**Flakes found at the root**, not retried away ([LESSONS.md](../playbook/LESSONS.md)):

- "battle-kinds fails under load" was a real freeze: a hit-stop pose kept a frame the atlas sweep had dropped (FIXER-7, f9063cd). The same bug caused the `glTexture` null errors in the layout check.
- online-smoke "aborted duel" waited a fixed 5 s; it now waits for the real hand-over (FIXER-8).
- The smoke's "shield basher in contact" waited up to 90 s for the AI to make contact, and failed 37 of 120 times off the browser; the contact is now staged (QA-05, d5c6961).
- The facing knob took taps meant for a soldier, the tutorial Replay tap failed 4 of 6 because a settings list was still gliding, and the first launch raced its own save write (FIXER-7).
- A refactor dropped the hit box from every Settings toggle. Layout checks can't see that, so every control type now has a tap check in the regression suite (7575ce6).

## 11. Skills log summary

The brief made the `.claude/skills` the way work is done: every story named its skills and agents on its dispatch card ([plan/SPRINTS.md](plan/SPRINTS.md)), and every agent report ended with "Skills applied".

- [SKILLS_LOG.md](SKILLS_LOG.md) has the Director's check for the first **34 stories** (setup through AI-03). Typical entries: `save-systems` (atomic writes, refuse newer saves), `input-systems` (soldier beats knob, 44 pt targets), `balance-check` (every value against its GDD target, misses named), `game-ai` (decision separate from motion), `architecture-decision` (ADR-0001..0004) and `tdd` (a failing test first for each bug).
- Work sent back for skipping or misreading its skills: S2-VISION (an incomplete GDD review), ST-01 (backward compatibility) and AI-03 (ladder parity, V5-052).
- **Gap:** the log was not kept up after AI-03. Later stories put "Skills applied" in their agent reports and in some NOTES and balance files (EC-01, F-07, EC-05, TRAIN2, FINAL, PLAYTHROUGH, HUB_PICK), but they have no Director check row. This report does not invent those rows.
- QA-06 itself followed `gate-check` (the Polish → Release checklist, PASS / CONCERNS / FAIL), `milestone-review` (go/no-go with conditions) and `retrospective` (section 17), with the `producer` and `qa-lead` definitions. Their usual outputs (`production/gate-checks/`, `production/milestones/`, `production/retrospectives/`) are folded into GATE.md and this report, because v5 keeps its state in `docs/v5/` (V5-009).

## 12. Art

All painted art came from Gemini in Claude in Chrome, one asset agent at a time. Every prompt and verdict is in [ASSET_LOG.md](ASSET_LOG.md), and the reusable templates (T-STYLE, T-FRESCO, T-BUST, T-ICON, T-MARK and others) are in [docs/playbook/PROMPTS_ART.md](../playbook/PROMPTS_ART.md), the prompt library.

| Batch | What | Renders → accepted |
| --- | --- | --- |
| AS-01 | Hub mockups A, B, C (no invented features) | 8 → 6 |
| AS-02 | 21 class busts | 23 → 21 |
| AS-03 | 23 icons, including the Codex book, doctrines, actives, the Standard and Works | 6 sheets (24 cells) → 23 |
| AS-04 | 5 frescoes, 6 settlement vignettes, the splash key art | 14 → 12 |
| AS-05 | 8 beast plates, 3 reward chests, the laurel | 12 → 12 |
| AS-06 | Field-works pixel sprites (the captain crest and Standard banner are drawn in code) | 14 → 5 |
| AS-07 | Promoted the 14 staged icons and the 17 remaining busts after in-game checks; no new prompts | — |
| AS-08 | Nikias narrator portraits (3 frames); the app mark as favicon, apple-touch and PWA icons with `manifest.webmanifest`; Telegram bot images | 5 → 4 |

`node scripts/art/check.mjs --shipped`: **78 assets, 50 PASS, 0 FAIL, 28 not assessed**. "Not assessed" means atlas frames and code-drawn art that have no file of their own.

**What's left:** the 101 legacy 64 px UI icons and 189 item icons have not been repainted at 160 px (OI-3); the event card portrait is still a placeholder; the Telegram Mini App splash (loading-screen) icon was not made; and the art bible's §5.2 helmet table and §8.5 cell size need the corrections from V5-050 and V5-066.

## 13. Decisions

78 decisions, V5-001 to V5-079 (there is no V5-054). One line each; the reasons and alternatives are in [DECISIONS.md](DECISIONS.md).

**How the run worked**
- V5-001 The main line is the local branch `v5`, in one worktree.
- V5-002 The `.claude/` framework stays untracked and is found by absolute path.
- V5-003 Setup and audit ran in parallel.
- V5-004 Browser agents drive their own headless Playwright; Chrome belongs to the asset agent.
- V5-009 State lives in `docs/v5/PROGRESS.md`, not `production/`.
- V5-010 Modes: rigor standard, automation autonomous.
- V5-031 The plan was adopted: 25 epics, 86 stories, 25 waves.
- V5-032 The estimate exceeded one night, so the run went wave by wave.
- V5-053 Flaky gates get a fixer story, not bigger retries.
- V5-055 Owner: full scope, no cuts.
- V5-057 Disk guard: symlinked node_modules, no npm ci, delete dist and shots.
- V5-058 Gates run the layout check with `--no-shots`.
- V5-062 Smoke worlds are deterministic, and dependent steps abort by name.

**Engine and architecture**
- V5-005 The Phaser 4 decision was deferred to a spike.
- V5-008 Three foundation ADRs: determinism and replay, save migration, engine.
- V5-025 Phaser 4.2.1 allowed only behind a measured gate.
- V5-028 Stay on Phaser 3.90: the first sheet opened 1.43× slower on Phaser 4 (ADR-0003 Rejected).

**Saves, online and compatibility** (most compatibility parts were superseded by V5-074)
- V5-011 Three live-player bugs became early fix stories.
- V5-012 Version online battles before any rule change.
- V5-019 All sim rule changes ship as one train, `SIM_VERSION` 2.
- V5-021 Ladder fights may pause; the ticket lasts 30 min.
- V5-022 Field works are offline only.
- V5-026 Rollback caveat: v4 reads slot 0 only.
- V5-027 Sim versioning rules (426, 409, socket close 4426).
- V5-033 Sockets accept v1 and v2 until the first rule change.
- V5-035 One save bump (v6) for every train-2 field.
- V5-036 A cloud downgrade guard.
- V5-038 Saves carry a `campaignId`; the cloud copy wins on a mismatch.
- V5-040 In-flight tickets survive the floor raise.
- V5-043 Release item: v4 clients get 426 after the deploy.
- V5-074 Owner: no users yet, so no backward compatibility; 11.5k lines removed.

**Vision and design**
- V5-006 GDDs only for the systems v5 touches.
- V5-007 The game concept comes from the brainstorm.
- V5-017 Five pillars (the line decides; read it at a glance; command from the thumb; every man has a name; one sim, everywhere) and five anti-pillars.
- V5-018 Six expansions, ranked; weather, utility AI and others deferred; the commander unit, naval battles and siege engines cut.
- V5-020 New campaigns start with 8 men.
- V5-023 The control scheme: soldier beats knob, face, focus, one Then, undo, paused staging.
- V5-024 GDD review rulings (cohesion from the standard aura, garrison stakes, `recharge`).
- V5-029 IA: five tabs, hubs are roots, one home per thing; the Codex owns beasts.
- V5-034 The radial order ring is removed.
- V5-039 The Beast Trial becomes practice.
- V5-044 The group numeral sits beside the name, not in the order bar.
- V5-064 The event card UI must merge before the deck.
- V5-070 The deck ships disabled until the card UI merges; the forge becomes required.
- V5-072 Text scale is an accepted deviation; no dead toggles.

**UI, accessibility and art**
- V5-013 Accessibility target: Standard.
- V5-014 Add 320x640 to the layout check.
- V5-015 Codex vs Trial left to the IA plan.
- V5-016 Fix the OnlineArmy layout fixture with the war UI.
- V5-030 Mockup direction C included.
- V5-045 The art bible adopted; heroes keep their own portraits.
- V5-046 Cinzel caps for display, Inter for body; grey means disabled only.
- V5-047 Hub direction A, "Fresco Hall"; C's company row is optional.
- V5-049 Raw Gemini downloads are not committed.
- V5-050 Busts follow the game kit, not the art bible's helmet table.
- V5-059 AS-03 icons stay staged until they have a slot and an in-game check.
- V5-060 A 13 px text floor, with existing violations allowlisted per screen.
- V5-063 A tab keeps one name at every width.
- V5-066 The iso cell is 36x18; tiny sprites are drawn in code.
- V5-067 Entry fades ate fast taps (fixed in FL-02).
- V5-068 Narrow tab bar: the active label always shows; the others go icon-only when they don't fit.
- V5-079 AS-07 reused approved renders; Nikias waited for Chrome (done in AS-08).

**Balance**
- V5-037 FO-01 misses accepted for later tuning; Taylor-series sin/cos for determinism.
- V5-041 The orb is all-round defence; 0% against a frontal line accepted.
- V5-042 Captain misses accepted until single-man targeting exists.
- V5-048 Cohesion accepted; myth beasts are exempt from cohesion shock.
- V5-051 AB-01 accepted with the mirror target missed.
- V5-052 Ladder doctrines must not change difficulty; re-measure after any sim change.
- V5-056 AB-02: bots take path A; Volley stays at 2 shots.
- V5-061 The Standard accepted; the captain level bonus set to 0.
- V5-065 The ditch tuned below the GDD range.
- V5-069 EC-04 accepted; the structural misses go to EC-05.
- V5-071 The item power cap: no item over 10 pts.
- V5-073 EC-05 accepted with named residuals.
- V5-077 Final balance (FL-04, BAL-02): beasts, starter danger, stakes, the scythe, floor 21.
- V5-078 The retrain cost stays 40 × tier.

**Owner direction for v6**
- V5-075 After v5: a web and desktop release (v6).
- V5-076 v6 architecture: a platform layer, payments kept, one domain, Turnstile, a privacy notice and account deletion.

## 14. Open issues and risks

| # | Issue | Impact | Next step |
| --- | --- | --- | --- |
| 1 | **Software-GL battle FPS** is 18, against 23.8 before v5, with more long frames. It is a GPU-side cost (atlas re-uploads, more painted pixels). | Only phones that fall back to software rendering. No real-phone measurement exists yet. | Pre-draw the doll atlases or upload only dirty rectangles (about 1 d), then measure on a mid-range Android inside Telegram. |
| 2 | **Boot still waits for the lazy chunk.** The second chunk (11 scenes) is awaited before the first screen, so the split cuts parse time, not bytes. | First paint is not faster yet. | Placeholder scenes so the chunk loads on demand (a larger change). |
| 3 | **The Telegram image sizes come from third-party guides** (the 640x360 cover, the 640x640 userpic), not from an official Telegram page. | An upload might be refused or cropped. | BotFather's own prompt wins; re-export with `scripts/art/appicons.mjs` if it asks for something else. |
| 4 | **The Mini App splash (loading-screen) icon was not made.** BotFather may want a vector; the painted mark is raster. | Telegram's default loading screen stays. | Optional; needs a vector trace of the mark. |
| 5 | **`zod` is missing from the shared `node_modules` in agent worktrees.** They symlink the main checkout's modules, which lack it, so server code that imports zod can fail there. | Tooling only; the `v5` checkout has it. | Install zod once in the main checkout (root or `server/`). |
| 6 | **Nobody has heard the sound on a real phone.** All audio is procedural and was checked by tests and offline renders only. | Levels, ducking or harshness could be off on a phone speaker. | You, on a phone (section 15). |
| 7 | **Open code-review items:** 7 S3 and 17 S4. For example `sim_version` is written but never read at submit (fix it before the next sim bump), an async-replay route has no client, the bot standard-bearer plumbing is dead, and about 263 i18n keys may be unused. | Maintainability; nothing a player sees today. | Listed with reasons in CODE_REVIEW.md. |
| 8 | **Balance residuals** (section 8) and no economy targets. | Small edges, none degenerate. | A post-v5 balance and AI pass. |
| 9 | **Playtest ACs that need people** (6 not assessed), and two proxy FAILs: reading the battle at a random pause, and decisions in big battles. | Design risk, not a bug. | A small human playtest after release. |
| 10 | **SKILLS_LOG stops at AI-03.** | The per-story skills record is incomplete. | Section 17. |
| 11 | **The `.claude/` framework is untracked** and lives only in this worktree. | Removing this worktree breaks every agent prompt's paths. | Copy `.claude/` somewhere stable before cleaning up worktrees. |

No gate is red: see [GATE.md](qa/GATE.md). The gate check's CONCERNS are missing release artifacts (a full-scope security audit, a `/localize qa` report, a release checklist), not defects.

## 15. What the owner must do

1. **Decide on merging `v5` into `main` and releasing it.** Nothing was pushed. `main` deploys to pixelarrow.app through `.github/workflows/deploy.yml`, so the merge is the release; apply the server migrations with the deploy (`docs/OPS.md`). There are no users yet (V5-074), so no compatibility work is needed.
2. **Upload the BotFather images:** follow [docs/telegram/README.md](../telegram/README.md) (`/setuserpic` with `bot_userpic_640.png`, then Edit Description Picture with `miniapp_cover_640x360.jpg`). If BotFather asks for a different size, its prompt wins.
3. **Listen to the sound on a real phone**, inside Telegram: the tutorial battle, a charge (the horn and the ducking), a rout, a pause (the field should fade out) and the Settings sliders. Note anything harsh or too quiet.
4. **Set up the Cloudflare email service before v6.** v6 accounts need it for email verification and password reset (V5-075, ROADMAP).

Worth a look before release: the open risks in section 14 (software-GL FPS, the boot chunk) and the six playtest ACs that need real players.

## 16. What's next

**v6, web and desktop** ([docs/ROADMAP.md › Next: v6](../ROADMAP.md)), started fresh from the released v5: true landscape layouts for tablets and laptops; mouse and keyboard with rebindable keys; email and password accounts with verification and reset; Telegram and web accounts linked to one player; a platform layer (a neutral core, one adapter folder per platform, no `if (telegram)` in game code); payments kept (Stars on Telegram, "coming soon" on the web); one domain; Cloudflare Turnstile and rate limits; a privacy notice and in-app account deletion.

**Build it with the playbook** ([docs/playbook/README.md](../playbook/README.md)): NEW_FEATURE.md for each feature (idea → GDD → decision → story card → agent → review → merge → balance → regression → localization), LESSONS.md before dispatching anything, PROMPTS_AGENTS.md for agent prompts, ART.md and PROMPTS_ART.md for any art, SCENARIOS.md for content, and director-brief-v5.md as the starting point for a v6 brief.

## 17. Retrospective

Run with the `retrospective` skill as a milestone retrospective of v5 (2026-10-10 to 2026-10-13). Inputs: PROGRESS.md (merges and gates), DECISIONS.md, SKILLS_LOG.md, the QA docs and `git log`. There are no sprint files in `production/sprints/`, so the planned-vs-actual velocity and estimate-accuracy tables are **NOT ASSESSED — NO DATA**: the plan estimated 122.5 / 175 / 279 agent-days, but actual effort per story was never recorded.

| Metric | Value |
| --- | --- |
| Commits / merges on `v5` | 866 / 131 |
| Planned stories | 86 in 25 waves, all done, plus EC-05, BAL-02, AS-07, AS-08, LOC-01, SND-02, the S4 fixers and the QA fix stories |
| Cut | none (V5-055) |
| Bugs found in QA-03 / QA-04 | 1 S1, 2 S2, 12 S3 and 15 S4 / 1 S1, 1 S2, 16 S3 and 21 S4 |
| Bugs fixed | every S1, S2 and playthrough S3; 9 of the 16 review S3s |
| Client tests | 525 → 1,538 |
| TODO / FIXME / HACK in `src` and `server/src` | 0 / 0 / 0 (0 on `main` too) |

**What worked**

- **Design before code.** Every mechanic had a GDD, a balance target and a measured before and after. A miss got an owner and a decision instead of blocking or slipping through, and later stories (EC-04, EC-05, BAL-02) closed most of them.
- **One sim, verified.** One rules train under `SIM_VERSION` 2, with replay fixtures checked in Chromium and WebKit. The hashes never broke.
- **A measured engine decision.** The Phaser 4 spike was gated on numbers and rejected on them, which saved a renderer port.
- **Independent QA at the end found real bugs**: a dead-end Shop (S1), a camp death spiral, a save that could be lost, a paused rest that resumed by itself. All were fixed, with tests or regression checks.
- **Flakes were chased to the root.** Three "flakes" were real game bugs or harness waits on the wrong thing.
- **State in files.** PROGRESS.md and DECISIONS.md let sessions resume after a crash and after compaction.

**What didn't**

- **The machine was the bottleneck.** Under 1 GB of free disk and load averages of 27–50 stretched the layout check to about 50 minutes and turned timing into flakes; parallelism had to drop to 3 code agents.
- **Agents left servers running** (15 stale vite and vitest processes at one point), and worktrees sometimes branched from `main` instead of `v5`.
- **The skills log stopped after AI-03**, so the brief's "check every report against its skills" is on record only for the first 34 stories.
- **The queue in PROGRESS.md grew into 43 follow-up items**, many already done, which made it a weaker resume point by the end.
- **Compatibility work was built and then thrown away** (11.5k lines), because the brief's "live players exist" turned out to be wrong. One question at the start would have saved several stories.
- **Chrome availability blocked art**: the Nikias portraits waited a day.

**What to change next time** (owner: the next Director; deadline: before the v6 dispatch)

1. Confirm the facts that shape scope with the owner before planning: users, compatibility, the release path. One question at the start beats a clean-up story.
2. Make the skills-log row part of the integrator's merge step, so it can't fall behind.
3. Keep the PROGRESS.md queue short: move done items out on every tick, and keep follow-ups in one table with an owner.
4. Check disk and load before each wave and size the parallelism to them; keep the stale-server and `reset --hard v5` rules in every prompt.
5. Record actual effort per story, so the next plan's estimates can be checked.

**Summary.** v5 delivered the whole plan with no cuts, and its QA found and fixed the bugs that mattered. The most important change for v6: settle the scope-shaping facts with the owner at the start, and record each story's skills and effort as it merges.
