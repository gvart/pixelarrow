# QA-06: the final v5 gate run

- **Date:** 2026-10-13
- **Commit:** `v5` @ `8f46243fb73fcc18a31ed41a38eeb98235d5b142` (the AS-08 merge, the last code merge of v5). The gates ran once on this tree; only docs were committed after it.
- **Machine:** the owner's Mac, load average 10–16 during the run (other sessions active). Full outputs are in the session scratchpad as `qa06-*.txt` (not committed).
- **Skills:** gate-check (Polish → Release, `references/gate-release.md`, at `workflow: standard`), milestone-review, retrospective; agents producer and qa-lead (definitions read).

## Verdict

**Every gate is green, first try. No gate was re-run, because none failed.**

Gate check, Polish → Release: **CONCERNS** (a recommendation; the owner decides). Every item the `standard` tier *requires* passes: all features built, the smokes PASS, no open S1. The CONCERNS are items the skill checks that v5 has no artifact for, listed under "Release checklist" below; none is a known defect.

Milestone review, go/no-go: **CONDITIONAL GO** for merging `v5` to `main` and releasing, on the conditions in [REPORT.md › What the owner must do](../REPORT.md#15-what-the-owner-must-do). Producer view (PR-MILESTONE, lean review mode, so not spawned): the plan's 86 stories are merged with no cuts, so schedule risk is nil; the remaining risks are device ones (software GL, a real-phone sound check) that no more local work can close.

## Gates

| # | Gate | Command | Result | Count |
| --- | --- | --- | --- | --- |
| 1 | Typecheck | `npx tsc --noEmit` | **PASS** | 0 errors |
| 2 | Unit tests | `npx vitest run` | **PASS** | 129 files, **1,538 / 1,538** |
| 3 | Build | `npx vite build` | **PASS** | main 2,743.26 kB (831.01 kB gzip); lazyScenes 807.79 kB (261.64 kB gzip); paperdoll 176.15 kB; parchmentWorker 476.67 kB. Vite warns that main is over 2,000 kB (known, PERF.md). |
| 4 | Server typecheck | `cd server && npm run typecheck` | **PASS** | 0 errors |
| 5 | Server tests | `cd server && npm test` | **PASS** | 38 files, **303 / 303** |
| 6 | Balance | `npm run balance` (200 seeds) | **PASS** (no drift) | matched 53% (median 72.5 s, first contact 11.0 s); lairs hydra / cyclops / lion 43 / 58 / 53%; war beasts minotaur / chimera 58 / 60%; 8-man opening 69%; assault 1.0× 45%, 1.3× 93%; host 49%; rarity L10 60 / 68 / 75 / 84%. Identical to the PROGRESS anchors (716 s). |
| 7 | Ladder parity | `npm run balance:ladder` (300 paired seeds) | **PASS** | **49 / 50** floors within ±5; floor 28 +7 (as in BAL-02: +4 at 1,000 seeds, accepted as noise, V5-077) |
| 8 | Art | `node scripts/art/check.mjs --shipped` | **PASS** | 78 assets: **50 PASS, 0 FAIL**, 28 NOT ASSESSED (atlas cells ART-044..051 and 057..071, two chest states and a fresco that ship inside an atlas or as another file, and the code-drawn crests ART-077/078: no file of their own) |
| 9 | Layout | `node scripts/layout-check.mjs http://localhost:4173/ --no-shots` | **PASS** | 24 configs × 196 screens, **48 known (allowlisted) distinct violations, 0 new** (2,594 s). 43 timing-only items were seen once and cleared on the script's own second look, all at 320x568 in Telegram insets. |
| 10 | Smoke | `node scripts/smoke.mjs` | **PASS** | 48 checks |
| 11 | Tutorial smoke | `scripts/tutorial-smoke.mjs` | **PASS** | 135 checks |
| 12 | Duel smoke | `scripts/duel-smoke.mjs` | **PASS** | 53 checks |
| 13 | Online smoke | `scripts/online-smoke.mjs` | **PASS** | 25 checks (2 expected network-failure log lines) |
| 14 | Fullscreen smoke | `scripts/fullscreen-smoke.mjs` | **PASS** | 57 checks |
| 15 | Audio smoke | `scripts/audio-smoke.mjs` | **PASS** | 50 checks |
| 16 | Regression | `npm run regression -- http://localhost:4173/` | **PASS** | hub-flows 50 s, battle-kinds 110 s, sheet-layout 25 s, controls 47 s, replay-hash 1 s; 383 PASS lines, 0 failures; 234 s |
| 17 | Online end to end | `node scripts/online-e2e.mjs http://localhost:5211/` (vite dev :5211 with `VITE_DEV_AUTH=1`, `API_PROXY=http://localhost:8797`; wrangler dev :8797 with `.dev.vars` from the example, `DEV_AUTH=1`, after `npm run migrate:local` on a fresh D1) | **PASS** | **34 / 34** (84 s) |
| 18 | Replay determinism | `node scripts/replay-hash.mjs` | **PASS** | Chromium 141 **13/13**, WebKit 26.0 **13/13** |

Smokes, regression and the layout check ran against `vite preview` on :4173, one at a time after the layout check (never in parallel, LESSONS "Load guard").

## Every screen at 390x844 and 360x780

**Yes.** The layout check visits every default screen (196, `DEFAULT_SCREENS` in `scripts/layout-check.mjs:1122`) at six sizes, `SIZES` at `scripts/layout-check.mjs:94`: 320x568, 375x667, **390x844**, 430x932, **360x780** and 320x640; in both languages (`LANGS`, line 95: en, ru) and both inset modes (`INSETS`, line 96: plain, Telegram), so 24 configurations. It checks text overflow and overlap, the 13 px text floor, touch-target size and spacing, off-screen controls and page errors. 0 new violations; the 48 known ones are allowlisted with an owner in `scripts/layout-allowlist.json`. The 21 opt-in `army-bust-<class>` screens were run by QA-05 at all 24 configurations (0 violations).

Screenshots of each rebuilt screen at 390x844 and 360x780 (plus 320) were taken by the screen stories (`docs/v5/stories/*/`, `docs/v5/shots/*/`) and by the playthrough (`docs/v5/qa/shots/`). This run used `--no-shots` (disk guard, V5-058).

## Every expansion has a GDD, tests and balance numbers

**Yes.** Test files are in `tests/` (client) and `server/test/` (server replay of the same rules); balance docs are in `docs/v5/balance/`. Every one of these test files passed in gates 2 and 5.

| Story | Mechanic | GDD (`design/gdd/`) | Tests | Balance |
| --- | --- | --- | --- | --- |
| AI-01 | Doctrines | ai-doctrines.md | aiDoctrines (17); server doctrine | AI-01.md |
| AI-02 | Captains, bounty, enemy retreat | ai-doctrines.md | captains (15); server captains | AI-02.md |
| AI-03 | Doctrines on ladder floors and war neutrals | ai-doctrines.md | ladderDoctrine (10); server neutrals, doctrine | AI-03.md; ladder parity (gate 7) |
| FO-01 | Face, focus fire | formations-orders.md | orders (17), knobFace (3), targeting (9); server ordersReplay | FO-01.md |
| FO-02 | Orb, feint, disordered | formations-orders.md | orb (13), feint (21); server orbFeintReplay | FO-02.md |
| FO-03 | Cohesion, army break | formations-orders.md | cohesion (14); server cohesionReplay | FO-03.md |
| AB-01 | Perk paths A/B, retrain | abilities.md | perkPaths (21); server perks | AB-01.md |
| AB-02 | Seven signature actives | abilities.md | actives (27), abilities; server activesReplay | AB-02.md |
| AB-03 | The Standard | abilities.md | standard (17); server standardReplay | AB-03.md |
| AR-01 | 8-man opening, volunteers | campaign-arc.md | opening (14) | AR-01.md |
| AR-02 | Lair assaults, garrisons | campaign-arc.md | lairs (18) | AR-02.md |
| AR-03 | Tier 3, offline set sources, level pacing | campaign-arc.md | sources (35), itemSources | AR-03.md |
| AR-04 | The Tyrant's host, end state | campaign-arc.md | host (18) | AR-04.md |
| EV-01 | Event engine | campaign-events.md | events (29) | EV-01.md |
| EV-02 | Event deck | campaign-events.md | eventDeck (14) | EV-02.md; event rows in `npm run balance` (gate 6) |
| EV-03 | Event card and journal (UI) | campaign-events.md | eventCard (7) | uses EV-02's rows |
| FW-01 | Works kinds and rules | field-works.md | works (21); server worksReplay | FW-01.md |
| FW-02 | Works allowance, supplies, bot placement | field-works.md | worksAllowance (17) | FW-02.md |
| FW-03 | Works tray (UI) | field-works.md | worksTray (19) | FW-02.md rows (gate 6: assault with and without stakes) |
| EC-01 | Forge reroll | forge-reroll.md | forge (15) | EC-01.md |
| LF-02 | Practice fight | practice-fight.md | practice (6) | LF-02.md |
| EC-02 | Item power cap | docs/ITEMS.md | itemCap (5); server itemCap | EC-02.md |
| EC-03 | Retrain cost | abilities.md (R7, F3) | perkPaths (guard test), heroSheet | EC-03.md |
| EC-04 / EC-05 | Class re-cost, missiles, structural balance | abilities.md, ai-doctrines.md | classes (14), balance, ec05Ai (8); server ec05Replay | EC-04.md, EC-05.md, TRAIN2.md |
| CT-01..07 | Controls | controls.md | knobFace, targeting, undo (10), orderQueue (12), camera (21), ladderPause (10), attention (23), input, hitTest | balance guard (G-GUARD): no change to battle outcomes; replay hashes (gate 18) |
| RD-01..03 | Readability, why-line | battle-readability.md | groupState (16), flankArc (22), fieldBanner (15), battleReport (27) | presentation only (G-GUARD) |

The whole set is summed up in `docs/v5/balance/FINAL.md` (FL-04, BAL-02), with each accepted deviation and its decision.

## Release checklist (gate-check, Polish → Release, `standard` tier)

| Item | Status | Evidence |
| --- | --- | --- |
| All features from the plan implemented | PASS | 86 planned stories merged, none cut (PROGRESS.md, V5-055) |
| Smoke check on the release candidate | PASS | gates 10–15 |
| No open S1 | PASS | QA-03's S1 fixed (5af02ba); QA-04's S1 fixed (c3bd5a9) |
| All tests pass, no regressions | PASS | gates 2, 5, 16 |
| Balance reviewed | PASS | gates 6, 7; FINAL.md |
| QA plan | PASS | `production/qa/qa-plan-v5.md` |
| QA sign-off | PASS WITH CONDITIONS | PLAYTHROUGH.md was NOT APPROVED for 1 S1 and 2 S2, all since fixed with regression cover; no re-play by a QA agent after the fixes (the regression suite and smokes stand in) |
| No open S2 / S3 (recommended at `standard`) | CONCERNS | 0 open S2; 7 open code-review S3s (maintainability, CODE_REVIEW.md) |
| Performance targets on target platforms | CONCERNS | No budget is set in `project.yaml`; phone proxy at or above the pre-v5 baseline; software GL 18 vs 23.8 fps; no real-phone measurement (PERF.md) |
| Localization verified | NOT ASSESSED | Russian is covered by LOC-01 and the layout check in ru at every size, but no `/localize qa` report exists |
| Security audit, full scope | NOT ASSESSED | No `production/security/` report. Story-level `security-audit` runs were done (S4-SIM-VERSION, ST-01, ST-03, AI-03; SKILLS_LOG.md) |
| Accessibility basics | PASS WITH CONDITIONS | Standard tier (V5-013); text scale is an accepted deviation (V5-072); rebinding is v6 |
| Legal | PASS | `public/privacy.html`, `terms.html`, `refunds.html` exist (unchanged by v5) |
| Release checklist, changelog | NOT ASSESSED | `/release-checklist` not run; REPORT.md stands in as the change summary |
| Build packages cleanly | PASS | gate 3 |

## Re-runs

None. Every gate passed on its first run in this story.
