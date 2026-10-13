# QA-04: code review of the v5 branch

- **Date:** 2026-10-13
- **Scope:** `git diff main...v5` at 005ebef (453 code files, about +53.6k / −8.1k lines in `src/`, `server/`, `scripts/` and `tests/`). Each area was reviewed separately: server and online, sim and game logic, the battle screen, the UI kit and the other scenes, and i18n/audio/scripts/tests.
- **Branch:** `worktree-agent-abf78fb4ad17ee8d4` (cut from v5 005ebef)
- **Skills:** code-review (`$F/.claude/skills/code-review/SKILL.md`), the built-in /simplify, and tech-debt (`$F/.claude/skills/tech-debt/SKILL.md`). Agents: lead-programmer and qa-lead (definitions read).

## Verdict

**APPROVED WITH SUGGESTIONS.** No S1 or S2 finding is open. One S1 and one S2 were found and fixed, each with a test or a stated reason. The open S3 and S4 items are listed below with the reason each one stays open.

| Severity | Found | Fixed | Open |
| --- | --- | --- | --- |
| S1 security or data loss | 1 | 1 | 0 |
| S2 bug | 1 | 1 | 0 |
| S3 maintainability (bugs of low reach included) | 16 | 9 | 7 |
| S4 nit | 21 | 4 | 17 |

**How the review ran.**
- Five reviewers worked in parallel, read-only, one per area. I checked every finding I fixed against the code myself (**VERIFIED**).
- Open items I did not re-trace are marked **reviewer** (the reviewer traced them in the code; I didn't repeat it). One open item is marked **UNVERIFIED**.
- Anything I couldn't point to in code was dropped.

**Sections not assessed** (per the skill-authoring rule):
- **Engine specialist review: NOT ASSESSED.** `project.yaml` has no `engine.name` (V5-010), so no engine specialist was spawned.
- **ADR compliance:** only ADR-0001, against its stated rule (no Math.random or Date in the sim, no Math.sin/cos in sim paths, a single SIM_VERSION check). It is **COMPLIANT** (see "Determinism").

## Findings

### S1

**S1-1. A damaged `px_meta` lost the whole campaign. FIXED (c3bd5a9), VERIFIED.**
- **Where:** `src/game/save.ts` `readSaveResult`, then `src/state.ts` `load()`.
- **Evidence:** `if (!meta) return { kind: 'bad', reason: 'corrupt', raw: metaText };` so the corrupt-save backup kept only the meta text. Then:
  1. With no mirror or cloud copy, `load()` starts a fresh campaign and saves it.
  2. `writeSave` sees no meta and writes slot 0 over the parts.
  3. Slot 1 is overwritten on the next save.
  4. Both slots end up gone, and the backup holds no save data.
- **Fix:** when the meta can't be parsed, the backup keeps `{meta, slots: [slot 0 text, slot 1 text]}`. Each slot is read part by part until the first missing part.
- **Test:** `tests/saveRecovery.test.ts` "a damaged meta keeps both slots in the raw text for the backup".

### S2

**S2-1. The world map resumed a camp rest the player had paused. FIXED (e4574be), VERIFIED.**
- **Where:** `src/scenes/WorldScene.ts` `create()`: `if (this.w.camp && !halted) this.waiting = true;`.
- **Evidence:** `waiting` is not saved. Pausing the rest, then opening Army or Hero and coming back (or a resize restart), set it again. Time, healing and camp events then ran without the player choosing it. This is the same family as QA-03 S2-1.
- **Fix:** a module-level `restPaused` flag. It is set by the Pause key, cleared whenever the rest starts (the Rest key, or pitching a camp), and checked in `create()`.
- **No unit test.** The rule lives in the Phaser scene, which has no test seam: `tests/campScene.test.ts` mocks Phaser and tests only pure helpers. Covered by the smoke and regression runs below, which drive the world map.

### S3

| ID | Finding | Where and evidence | Status |
| --- | --- | --- | --- |
| S3-1 | A ⋯ menu opened during an online deployment stayed open when the deploy clock started the fight. Its Leave then opened a dead "Leave the deployment?" dialog, whose OK does nothing. | `BattleScene.onBattleStarted` closed `leaveDialog` but not `menu`. `confirmLeaveDeploy` had no phase guard. VERIFIED. | **FIXED** cd608a5: the menu closes on start, and the confirm returns outside the deployment. Reason, not test: scene code (Phaser), covered by the battle-kinds regression. |
| S3-2 | A hit-stop running when the battle ended never expired: those men froze, with no death frame or victory pose. | `juice.frame(delta, phase === 'battle' && !paused)` stops the Juice clock at `ended`, while `renderUnits` still honoured `juice.holds(u)`. VERIFIED. | **FIXED** cd608a5: holds apply only while `phase === 'battle'`. Same reason as S3-1. |
| S3-3 | Hero and Army leaked an interactive zone, a content container, two images, a graphics object and a looping 250 ms timer on every refresh (about 12 call sites each). | `ScrollArea.destroy()` (src/ui/kit.ts) did not destroy `zone` or `content`. The hint from `addScrollHint` (src/ui/widgets.ts) was tied only to its returned graphics, which both scenes discard. VERIFIED. | **FIXED** 7d13523: `destroy()` takes the zone and content; the hint goes with `area.content`. Reason, not test: there is no Phaser test harness. Covered by the layout check, controls regression and smoke runs. |
| S3-4 | The online camp re-fetched every second with no in-flight guard, and toasted every failure. | `CampScene.tick` called `fetch()` each second once any `doneAt <= now`. VERIFIED. | **FIXED** 2e0e076: one request at a time, and a repeated error is toasted once. Test: `tests/campFetch.test.ts`. |
| S3-5 | The battle gold formula was written twice. `campaign.ts` re-derived `20 + 12 × kills` to cut a retreating band's win bonus. | src/game/loot.ts and src/game/campaign.ts (`afterPartyBattle`). VERIFIED. | **FIXED** f84c1e2: `FIELD_GOLD`, `KILL_GOLD` and `WIN_GOLD` live in loot.ts. Tests: captains and forge (unchanged and passing). |
| S3-6 | `PanelButton`, `PanelButtonOpts`, `categoryTexture` and `CATEGORY_DARK` (about 300 lines) were unused after the order bar replaced the category buttons. | The only references were inside `src/ui/battlePanel.ts` and a stale ROADMAP note. VERIFIED. | **FIXED** 811c25e (/simplify). |
| S3-7 | Three one-off screenshot scripts (479 lines) are used by no npm script, CI job or code. | `scripts/dev/wld02-play.mjs`, `btl01-shots.mjs` and `tut02-shots.mjs`; only their stories' NOTES name them. VERIFIED. | **FIXED** a9d7926 (removed; git history keeps them). |
| S3-8 | `para()` is copied into 6 sheets, and `doctrineText()` is byte-identical in assault.ts and encounter.ts. `openAssaultSheet` and `openEncounterSheet` share most of their body. | src/ui/sheets/{assault,encounter,arcSheet,doctrine,recruit,forge}.ts. VERIFIED (diffed). | **PARTLY FIXED** ee46e4f: assault uses encounter's `para` and `doctrineText` (−25 lines). The other four `para` copies use different line heights and sizes. A shared `openChoiceSheet` (about −100 lines) is a layout change that needs the layout check per sheet, so it goes to a UI story rather than a review fix. |
| S3-9 | `sim_version` is written on every ticket but never read at submit. Only the client's `body.simVersion` is checked. | server/src/online/attack.ts, bosses.ts, duel/routes.ts, async.ts, live.ts; `duel/verify.ts`. Reviewer; I confirmed by grep that no submit path reads it. | **OPEN.** With one SIM_VERSION, a ticket can go stale only when a deploy bumps the version within its ≤30 min life. That ticket is then rejected as `replay_mismatch`, not "reload". There are no users (V5-074). Before the next sim bump, either compare `t.sim_version` in `verifyBattle` or drop the column. |
| S3-10 | `GET /api/duel/async/replay/:id` has no client consumer. | server/src/duel/async.ts:418-436; only server/test/async.test.ts uses it. Reviewer. | **OPEN.** Removing a server route is a product call (a replay viewer may use it). Listed for the v6 API pass. |
| S3-11 | The bot standard-bearer plumbing is dead. `PerkDef.standard` is never set, so `DevelopContext`, the `ctx` of `autoDevelop`/`setBotLevel` and makeHero's roster check change nothing. | src/game/heroes.ts:160 and :241, src/data/perks.ts:338 (no `standard: true`), src/sim/stats.ts:309 (keys on the id). VERIFIED by grep. | **OPEN.** The fix touches `src/data/perks.ts` and `tests/perkPaths.test.ts`, which EC-03 owns in this wave. Setting the flag would change bot builds and need a ladder and lair re-measure (V5-052). Hand to the next balance story. |
| S3-12 | A legacy random-enemy path in BattleScene (`data?.fresh \|\| !state.pending`) settles through a 3-man refill, which disagrees with `VOLUNTEER_RULES.destroyed` (5 men). | src/scenes/BattleScene.ts (create), src/game/campaignBattle.ts. UNVERIFIED whether any route still reaches it: no caller passes `fresh`. | **OPEN.** Needs a reachability check (Kit and dev scenes) before deleting. |
| S3-13 | The "frozen" pre-EC-05 ladder AI imports live code (formation, stats, doctrines), so its reference arm drifts with any change to them. | src/dev/ladderParity/ai.frozen.ts:13-19. VERIFIED. | **OPEN.** It is a dev-only instrument (`npm run balance:ladder`, not bundled), and it is the reference for the V5-077 numbers. After v5 merges, delete it (about 1450 lines plus 267 KB of JSON) with a DECISIONS row, or re-anchor it on v5. |
| S3-14 | About 263 of 2828 EN keys look unreferenced. Confirmed dead by grep: `kit.more/less/tapForMore/scrollHint`, `common.yes/no`, `legend.*.title`, `hex.<terrain>`, `ocamp.kind.*`. | src/i18n/*. Reviewer. The scan is heuristic: dynamic keys give false positives. | **OPEN.** A key deletion pass needs a "never referenced" test first, so it can't drop a dynamic key silently. Not cheap to do safely here. |
| S3-15 | The server replay-test helper (play the client battle, `VerifyBody.parse`, `replayBattle`) is copied into 9 test files, 15–25 lines each. | server/test/{actives,cohesion,ec05,orbFeint,orders,standard,works}Replay, captains and doctrine tests. Reviewer. | **OPEN.** Tests only; about −130 lines. Logged as tech debt. |
| S3-16 | Director item: three `INTENDED_COUNTERS` entries contradicted the class GDD (see "Counter list"). | src/dev/classBalance.ts. VERIFIED. | **FIXED** bcafb8a. |

### S4

| ID | Finding | Status |
| --- | --- | --- |
| S4-1 | `BattleScene.create()` did not reset `bannerTimer` and `groupList` (harmless today). | **FIXED** cd608a5 |
| S4-2 | Save repair threw on a `null` band entry, so the whole save was reported corrupt. Places were already guarded. | **FIXED** 64471f1. Test: `tests/saveRecovery.test.ts` "drops a null party" |
| S4-3 | The zoom key wrote `0.6×` in Russian (`0,6×`). | **FIXED** 7094937. Test: `tests/camera.test.ts` |
| S4-4 | Stale comments: the server order schema says face/focus/works are "logged and ignored"; `verify.ts` says only unexpired tickets reach it; i18n points to a non-existent `tests/i18n.test.ts`. | **FIXED** 9ce9c90 |
| S4-5 | Compatibility leftovers after V5-074. | **OPEN.** Harmless; for the S4-NOCOMPAT follow-up. |
| S4-6 | Expired ladder tickets stay `open`, because `/ladder/start` abandons only unexpired ones. | **OPEN.** Row hygiene only: a late run pays nothing. |
| S4-7 | `writeSave` can leave orphan part keys if killed between the meta flip and the cleanup. | **OPEN.** Reads are bounded by `n`; this only matters if the CloudStorage key quota does. |
| S4-8 | `@retrain` and `@next:*` go through `setFlag`, which refuses new keys past `FLAGS_CAP` = 64 without a note. | **OPEN.** UNVERIFIED whether a real campaign reaches 64 flags. |
| S4-9 | `world.ts` uses Math.cos/sin/hypot for event band placement. | **OPEN.** Client-only and floored, not a sim path. |
| S4-10 | `barsSeen` counts a battle twice after a scene restart. | **OPEN.** Only makes the long bar labels drop out a little early. |
| S4-11 | Encounter, assault, arc and event sheets each add a `scene.events.once('shutdown')` closure per open, never removed. | **OPEN.** One small closure per sheet until the scene shuts down. |
| S4-12 | `ArmyScene.src: ArmySource` has a single implementation. | **OPEN.** Kept as the seam for an online army. |
| S4-13 | Game rules return English reason strings that the UI matches by text (`'No perk point'`, `'Path chosen'`, camp blockers). | **OPEN.** Not user-facing (they go through `t()`); return codes in a later pass. |
| S4-14 | ScrollArea starts a drag from both the zone and a scene-level handler. | **OPEN.** `begin()` is idempotent. |
| S4-15 | The i18n parity test checks RU params only on the `other` plural form. | **OPEN.** All forms are correct today. |
| S4-16 | The save-fixture `import.meta.glob` lookup is copied into 8 test files. | **OPEN.** Tests only. |
| S4-17 | Fixed sleeps in smokes: `scripts/fullscreen-smoke.mjs:28` (3 s, followed by a real `ready('Menu')` wait) and `scripts/tutorial-smoke.mjs` (800 ms before reload). | **OPEN.** Hasn't flaked in the batch gates; take it with the next smoke change. |
| S4-18 | `tutorial-smoke.mjs` pastes its Skip-button lookup twice, and the lookup matches the English label. | **OPEN.** |
| S4-19 | Debug surfaces ship: `window.__audio`, the preview/store/audio pages and KitScene (`?scene=Kit`). | **ACCEPTED.** Deliberate, for the layout check and art review. |
| S4-20 | `src/online/defenders.ts` English labels duplicate the `def.*` keys. | **OPEN.** The UI uses `tOr('def.*')`. |
| S4-21 | GAMEPLAY.md:489 says "Horse archers vs hoplites 52%"; FINAL.md measures 40%. | **OPEN.** Doc drift, for the next balance doc pass. |

## Counter list (Director item 1, BAL-02 D14)

**I fixed the harness list, not the GDD** (bcafb8a).

The intended counters in `docs/GAMEPLAY.md` are:
- spears over riders;
- riders over missile men;
- peltasts over archers;
- horse archers "bleed slow heavy foot (Celts 100%, thureophoroi 92%)".

The GDD never says missiles beat the hoplite. Its hoplon and shield wall are the hoplite's identity (the class table reads "braced spear wall"). The sim agrees and has done since BASELINE (FINAL.md: archer > hoplite 0%, slinger 16%, horse archer 40%). Making the harness entries true would mean changing the missile-versus-shield rules for every battle.

`INTENDED_COUNTERS` now drops the three entries and lists the counters the GDD does state instead:
- archer and slinger > rhomphaia (the GDD's "weak to missiles");
- horse archer > Celt and > thureophoros.

The list only labels the "(counter)" tags in the `npm run balance` report. No sim number moves.

## Determinism (ADR-0001)

**Clean.**
- **Sim paths** (`src/sim/*`, the data modules the sim imports, `src/util/math`, `src/world/battlefield`) have no `Math.random`, no `Date`, no `performance.now`, no locale call, and no sin, cos, atan2, pow, exp or hypot.
- **Math.sqrt** is the only transcendental, and IEEE requires it to be exactly rounded.
- **Trig** goes through the fixed Taylor series (`turnCosSin`, `smallTurn`), and the orb uses `pseudoAngle`.
- **Maps and Sets** in the sim are keyed in a deterministic insertion order.
- **Sorts:** every comparator breaks ties by id.
- **Bot RNGs** are seeded from the battle seed.
- **Battle scene:** every `Math.random` in BattleScene, battleFx and ResultsScene is cosmetic. Player orders reach the sim only through `order()`.

## Leaks and interactivity

**Fixed:** S3-3 (scroll areas and hints) and S3-2 (a hit-stop at the battle end).

**Checked and clean:**
- **Input listeners:** `this.input.on` listeners are cleared by `InputPlugin.shutdown`.
- **Resize:** `BaseScene`'s `scale.on('resize')` is removed on shutdown.
- **Tutorial and audio:** the tutorial's `scene.events` listeners are paired, and the audio pause gate resets on the Battle scene's start and shutdown.
- **Online scenes:** they drop their socket subscription and timers on shutdown, and the match-report retry is bounded.
- **Hidden objects:** hidden and masked objects take no taps (the patched `hitTest` scroll clip, Phaser's `willRender` check).
- **Hit areas:** `makePressable`, `MToggle`, `GearSlot`, the meters, `Medallion`, `FacingPip`, `GroupCard` and the edge pointers all have hit areas.
- **i18n:** EN and RU have the same 2828 keys and the same placeholders. They are guarded by the `Table` type and by `tests/ui.test.ts`. No hard-coded English in player-facing scenes.

## Server and online (checked clean)

- **Dev auth:** `DEV_AUTH` is checked on the server only. The client dev user needs `DEV && VITE_DEV_AUTH`.
- **initData:** validation is unchanged, and sockets authenticate before the sim check.
- **Replay:** every paying submit replays the setup stored on the ticket; the client can't supply the seed or the armies.
- **Double claims:** blocked by `status = 'open'` guards plus nonce or rev guards.
- **Ladder:** the TTL is 30 min (V5-021), and a late run is verified but pays nothing.
- **D1:** every query uses placeholders.
- **Save PUT:** optimistic revision with a 512 KB cap.

## /simplify

**Net −801 lines** (+21 / −822) in four behaviour-preserving commits:

| Commit | What | Lines |
| --- | --- | --- |
| 811c25e | dead PanelButton block | −303 |
| a9d7926 | one-off dev scripts | −479 |
| ee46e4f | assault reuses encounter's helpers | −25 |
| f84c1e2 | one source for the gold constants | +6 |

Not applied, each with a reason in the tables above: the `openChoiceSheet` merge (S3-8), the replay-test helper (S3-15), the dead i18n keys (S3-14) and ai.frozen (S3-13).

## Tech debt (from /tech-debt scan, for the register)

The brief names this file as the only deliverable, so the debt rows are here rather than in a new `docs/tech-debt-register.md`.

| ID | Category | Description | Effort | Impact |
| --- | --- | --- | --- | --- |
| TD-001 | Architecture | `src/platform/telegram.ts` is used directly by 36 game files (see v6 prep) | M | High (blocks v6) |
| TD-002 | Code Quality | Shared choice-sheet builder for encounter and assault, and one `para` (S3-8) | S | Low |
| TD-003 | Test | Server replay-test helper copied 9× (S3-15); save-fixture lookup copied 8× (S4-16) | S | Low |
| TD-004 | Code Quality | About 263 likely dead i18n keys; needs a "referenced" test first (S3-14) | S | Low |
| TD-005 | Architecture | Ticket `sim_version` written but not checked (S3-9) | S | Med (at the next sim bump) |
| TD-006 | Code Quality | Dead bot standard-bearer plumbing (S3-11) | S | Low |
| TD-007 | Code Quality | ai.frozen.ts imports live code; delete after the merge (S3-13) | S | Low |
| TD-008 | Code Quality | `BattleScene.create()` resets about 80 fields by hand. A per-run state object would end the "field not reset" class (S4-1) | M | Med |

## v6 prep (V5-076): what `src/platform/` would need

No refactor now. V5-076 wants neutral core interfaces, one adapter folder per platform (telegram, web; later steam and mobile), runtime detection in one place, and no platform checks in game code.

1. **Split `src/platform/telegram.ts` (358 lines).**
   - It mixes the Telegram adapter with what should be neutral services: haptics, the back and settings buttons, closing confirmation, insets and fullscreen, language and theme, the start param, links, the invoice, CloudStorage and initData.
   - Target: a neutral `Platform` interface, with `platform/telegram/` and `platform/web/` adapters (no-ops or localStorage versions) and one runtime detection point.
2. **Direct game-code imports of `platform/telegram`: 36 files.**
   - Mostly haptics: `haptic` 22, `hapticNotify` 20, `hapticSelect` 3–4, `setHaptics` 2 (src/state.ts, src/ui/settings.ts).
   - `openExternalLink`: src/ui/notifySettings.ts and src/scenes/ShopScene.ts.
   - `telegramLanguage`: src/ui/lang.ts.
   - `initTelegram` and `startParam`: src/scenes/BootScene.ts.
   - `onAppActive`: src/audio/index.ts.
   - src/audio/haptics.ts is already a second haptics wrapper and should become the neutral one.
3. **Platform checks in game code.**
   - `src/scenes/online/ClanScene.ts` branches on `inTelegram()` and calls `openTelegramLink` for the share, choosing between "sent" and "copied" copy. This needs a `share()` port.
   - `src/ui/econ/source.ts` imports `openInvoice` dynamically for Stars. This needs a `payments.buy()` port: Stars in the Telegram adapter, and the "coming soon" placeholder on web.
   - `src/scenes/online/textInput.ts` reads `--tg-safe-area-inset-*`. It should read the neutral `--pa-safe-*` variables that `safeArea.ts` already writes.
4. **Inside `src/platform`.**
   - `storage.ts` makes `telegramKV` (CloudStorage) the primary store.
   - `cloud.ts` injects `telegramInitData` and `openInvoice` into `Online`. This injection is already the right seam.
   - `online.ts`: `available` means "has initData", sign-in branches between `authTelegram` and `authDev`, and `InvoiceStatus` is a Telegram type.
   - `api.ts` has `telegramId` and `/api/auth/telegram`.
   - `nav.ts` uses the native BackButton, SettingsButton and closing confirmation. Its injected driver is already the seam.
   - `safeArea.ts` and `monitoring.ts` report `x-pa-platform` from `telegramClient()`.
   - Comments in `src/game/save.ts` assume CloudStorage.
5. **Server.**
   - Auth is Telegram-only (`/api/auth/telegram`, `validateInitData`; `players` is keyed by `telegram_id`). Web accounts need a second identity provider and a neutral player key.
   - The shop and webhook are Stars-specific.

## Gates

Run on this branch after the fixes, against `vite preview` on port 8279.

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | pass |
| `npx vitest run` | 128 files, 1529 tests pass. The baseline on v5 was 127 / 1524; this branch adds campFetch, plus save, camera and repair cases. |
| `npx vite build` | pass |
| server `tsc --noEmit` and `vitest run` | pass; 38 files, 303 tests |
| `node scripts/replay-hash.mjs` | 13/13 (chromium; webkit is not installed on this machine) |
| `node scripts/smoke.mjs` | ALL PASS |
| `npm run regression` | PASS: hub-flows, battle-kinds, sheet-layout, controls and replay-hash (274 s) |
| `npm run balance` (200 seeds) | unchanged: matched player win 53%, the same as every batch gate in PROGRESS. No sim or data file changed; loot.ts only names its constants. The class matrix now labels only the GDD counters. |
| `node scripts/layout-check.mjs --no-shots` (full) | PASSED: 24 configs × 196 screens, 48 distinct allowlisted violations, **0 new** (2823 s) |

A scratch Playwright check (not committed) confirmed two fixes in the real game:
- **S2-1:** a camped, paused rest stays paused after a World restart, and the camp is kept.
- **S3-3:** Army's `ui` holds 14 children before and after 6 refreshes; it used to gain 5 per refresh.
