# v5 Progress (the Director's single source of truth)

Brief: `.claude/prompts/redesign-v5-director.md`. This is an untracked copy in this worktree; the original lives in worktree `local-install-skills-agents-5e5955`.
Main line: local branch `v5`, checked out in `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/sd-69ad2c`. Never push, never touch `main`, never deploy.
Framework paths for agent prompts: `F=/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/sd-69ad2c` → `$F/.claude/skills/<name>/SKILL.md` and `$F/.claude/agents/<name>.md`.
Chrome and Gemini were checked on 2026-10-10: the user is logged in. Downloads into `docs/v5/gemini/` are approved for the whole run. Only the `assets` agent may use Chrome.

## Phase: 4–6 build, waves W1–W5 in progress (F-*/AS-* blocked on the art bible)

## Running agents

| Name | Story | Skills | Agents | Branch | Status |
| --- | --- | --- | --- | --- | --- |
| (merge) | FL-02 worktree-agent-ac118c5f280108e7e, FL-03 worktree-agent-ac3b5cceea3305e5d | — | integrator | — | merging |
| loc-01 | LOC-01: RU polish (names, units, decimal comma, arrows) | i18n, numbers.ts, name display | — | worktree-agent | running |
| f-04 | W5 F-04: icon atlas pipeline (AS-03 icons, light disc on stone) | per card | per card | worktree-agent | running |

## Merged into v5

- 7510360 docs(v5): director state files and initial decisions
- f9b8929 merge: S0-SETUP: 39 systems in design/gdd/systems-index.md, stage Production (CONCERNS: no GDDs or ADRs). Gates: tsc ok, vitest 525/525.
- b829290 merge: S1-AUDIT-MECH: MECHANICS.md and balance BASELINE (104/306 class pairings lopsided, elites lose to cheap shock, loot resale beats battle pay). Gates: tsc ok, vitest 525/525.
- 17d080e merge: S1-AUDIT-UI: UI.md (20 scenes, 143 issues: 1 blocker, 58 major, 84 minor), NAV.md, 209 shots. Gates: tsc ok, vitest 525/525.
- 9ab9ad6 merge: S1-AUDIT-PLAY: PLAY.md + 42 shots (3-man start kills formations, morale and flanks unreadable, no undo, no impact feel, slow pacing; bugs B1–B6). Gates: tsc ok, vitest 525/525.
- 94c0472 merge: S2-VISION (part 1): AUDIT.md, VISION.md, game-concept.md, 8 GDDs (ai-doctrines, formations-orders, abilities, campaign-arc, campaign-events, field-works, controls, battle-readability), entities registry, PROPOSALS P-1..P-3. Gates: tsc ok, vitest 525/525.
- 5bf6ae2 merge: S2-VISION part 2: GDD review fixes + GDD_REVIEW.md (consistency-check CONCERNS: balance targets not yet measured). Gates: tsc ok, vitest 525/525.
- 81aa8e0 merge: S4-FIX-SAVES: two-slot atomic saves, no silent wipe (px_corrupt), battle stands once begun, scene.start data (B1/B2, 26 call sites), Losses (B4). Plus 2f55742, a legacy main-layout save test. Gates: tsc, vitest 557, build, layout 0 new, smoke, tutorial-smoke, duel-smoke all pass.
- 06b6841 merge: S2-UX-IA (design/ux/, docs/v5/ux/). abd8e1a merge: S4-SIM-VERSION (client+server, migration 0016, ADR-0001). Gates: tsc, vitest 564, server 196, build, layout 0 new, smoke 43, duel 54, online 26.
- 05d8382 merge: S4-FIXER-1 (online-e2e fixed, A11Y-01..22). e31108c, c0a90ad, a92ab8f, 5145a6c: P4 spike docs, layout tween wait, bench, ADR-0003 Rejected (abandoned Phaser 4 code tip is 37577bc258dcdbe2f3085ec48806aff87067b332). Gates: tsc, vitest 564, build, layout 0, smoke, online-e2e 34 all pass.
- 9033e07 merge: Phase 3 plan (docs/v5/plan/, production/epics/). Gates: tsc, vitest 564.
- dda6caf merge: IN-01 battle input layer (src/ui/input hitTest + gestures; radial ring removed; ADR-0004). e67b2ee shrinks the IN-01 shots (8.5 MB → 2.5 MB). Gates: tsc, vitest 592, build, layout 0, smoke, tutorial-smoke, duel-smoke pass.
- 4f0f172 merge: ST-01 (frozen v1 sim, SIM_VERSION 2, REPLAYERS, version-paired matches). Gates: tsc, vitest 602, server 215, build, layout 0, smoke 42, duel 53, online 25, online-e2e 34; balance identical to baseline (200 seeds: 54/46, median 85 s).
- 87df59b merge: LF-01 (B3 numerals, B5 Contact soon, B6 Out of range). Gates: tsc, vitest 611, build, layout 0, smoke 42, tutorial 48, duel 53.
- 3f89673 merge: ST-03 (train-2 types and zod; balance identical). Gates: tsc, vitest 620, server 243, build, online-smoke 25, duel 53.
- 94a1b59 merge: ST-02 save v6 + ADR-0002. Gates: tsc, vitest 645, build, layout 0, smoke 42, tutorial 48.
- ddc7927 merge: FO-01; 6f34a10 raises sim floors to 2; 5fde11c merge: ST-02b cloud downgrade guard. Gates: vitest 663, server 251, layout 0, online-e2e 34, balance as in FO-01.md.
- d7ddceb merge: AI-01 doctrines; 6108bbd merge: ST-02c campaignId; 4854c12 merge: LF-02 Trial is practice + beast texture fix + Results notice. Gates: vitest 708, server 256, layout 0, smoke/tutorial/duel/online pass (smoke flaked once, 1 check). Balance matched 54%.
- 45be15b merge: S4-FIXER-2 in-flight tickets (V5-040). Gates: vitest 708, server 266, online 25, duel 53, online-e2e 34.
- 93ad712 merge: AI-02 captains. Gates: vitest 720, server 268, layout 0, smokes pass; balance 54%.
- e25819c FO-02, 1c882d5 QA-01, f8401ef smoke harness names failing checks, aefbd1f CT-01. Gates: vitest 768, server 277, layout 0, all smokes pass; balance 54%.
- 44048f9 merge: S2-ART-BIBLE; 8760935 merge: LF-03 (24 layout configs incl. 320x640). Gates: vitest 771, layout 0 new (6 allowlisted), smoke 41, online 25, contrast 38/38.
- 04768e2 merge: AS-01 hub mockups (pick A); 9e67140 merge: FO-03 cohesion and army break. Gates: vitest 790, server 281, smokes pass; balance 55%, mean 81 s. c786115 untracks raw Gemini images (V5-049).
- 830a365 merge: AS-02 partial (12/21 busts staged). Gates: vitest 790.
- d07282b merge: F-01 tokens + font-load fix. Gates: vitest 800/801 (a load timeout, passes alone), layout 0 new, smoke flaked once then 42/42, tutorial pass.
- b988138 CT-02, 9f9e594 AB-01, b874988 AI-03. Gates: vitest 845, server 294, layout 0 new, all smokes pass; balance 55%.
- 6abf00a merge: S4-FIXER-3 (load-robust smoke, heavy-test timeouts). smoke 3/3 in a row, vitest 845.
- 5821511 F-02; 884d5c1 AR-01; c1b0241 AS-02 (21 busts); 5209dbd CT-03; 73a2d33 AB-02; 332b516 F-03. Gates: vitest 926, server 296, layout 0 new, smokes pass (smoke flaked once at 'battle against the band'); balance 54%, lairs 43/58/53.
- 48b60d7 merge: F-06 dead code (−780 lines). Gates: vitest 926, layout 0 new, smokes pass.
- fb8a4da AS-03 icons staged; 8cd866f IN-02 menu input contract. Gates: vitest 941, layout 0 new, smokes pass.
- 244be6c fixer-4 smoke determinism; 94f7c4d AB-03 the Standard; 9065e2c captain levelBonus 0 (captain +8). Gates: vitest 958, server 298, layout 0 new, smoke 2/2, all smokes pass; balance 54%, lairs 43/58/53.
- 322b6d0 CT-05 battle camera; 9716188 AS-04 frescoes (campaign fresco promoted). Gates: vitest 975, layout 0 new, smokes pass.
- 38a7c16 HUB-01; 89525bd AS-05; 489c63a EV-01. Gates: vitest 1012, layout 0 new, smokes pass (smoke flaked at 'Begin the march' under load); balance 54%.
- c26021e FW-01 field works; 331331c AS-06 works art. Gates: vitest 1030, server 301, layout 0 new, smokes pass; balance 54%, lairs 43/58/53, ditch +9.
- 38a3aa9 fixer-5 smoke menu fade; 69d43da CT-04 previews + Then queue + paused plan. Gates: vitest 1042, layout 0 new, all smokes pass.
- c3db469 F-04 icon atlas; 762b363 FW-02 works allowance. Gates: vitest 1067, server 301, layout 0 new, smokes pass; balance 54%, lairs 43/58/53.
- 12a0d21 HUB-02 Campaign hub; 67c0220 TUT-01 first run; 6327f10 drop 22 clean allowlist entries. Gates: vitest 1084, layout 0 new, all 5 smokes pass.
- 2d205b1 EC-04; 9b954e6 AR-03; e8dc83a ARM-01. Gates: vitest 1105, server 304, layout 0 new, smokes pass (main smoke flaked once at load ~42); balance 54%, lairs 43/58/53.
- 7fddc2f EV-02 deck (OFF); ea8321c AR-02 lair assault rules. Gates: vitest 1132, server 304, smokes pass; layout: 1 world-encounter text-overlap flake at ru 320x568 (passes alone 3/3); balance 54%, lairs 43/58/53, assault 39%.
- aa8af63 RD-01 readability; 0963bf5 HERO-01 Hero screen. Gates: vitest 1155, layout 0 new (known violations down to 1063 from 1776), smokes pass.
- 78c81fe EC-02 item power cap; 299313b DLG-01 Settings. Gates: vitest 1166, server 306, layout 0 new (1037 known), smokes pass; balance 54%, lairs 43/58/53.
- 9570d6f EC-05 structural balance. Gates: vitest 1175, server 309, layout 0 new, smokes pass; matched 53%, lairs 43/58/53, assault 45%.
- 5070ff7 CDX-01 Codex; 5a17ad9 CT-07 orb/feint/Raise Standard. Gates: vitest 1209, layout 0 new (822 known), all smokes pass.
- 5fc127f RD-03 why-line; 8075b8f AR-04 host + end state; 2b7bf4a ST-04 train 2 closed (13 v2 fixtures; Chromium hash parity 13/13). Gates: vitest 1276, server 340, layout 0 new (812 known), smokes pass; balance 53%, lairs 43/58/53, assault 45%, host 49%.
- b4bda4a V5-074: no live users, backward compatibility dropped.
- f752a6f EV-03 event card + journal, deck ON. Gates: vitest 1283/1284 (simTypes load timeout), layout 0 new (812 known), smokes pass.
- 77f5d29 S4-NOCOMPAT (−11.5k lines); 109ae4f SHP-01; a6b5963 MKT-01; 31e6023 simTypes timeout. Gates: vitest 1221, server 299, layout 0 new (686 known), smokes pass (battle checks flake only under load); balance 53%, lairs 43/58/53; replay-hash Chromium 13/13.
- 1b62f48 WAR-02 Clan + Merchant; b323361 WLD-01 World map; 9c8c6c6 FW-03 works tray + assault wiring. Gates: vitest 1255, server 299, layout 0 new (752 known), 5 smokes, online-e2e 34/34; balance 53%, lairs 43/58/53, assault 45%.
- 0aa9776 CMP-01 Camp; 3f82725 RES-01 Results. Gates: vitest 1276, server 299, layout 0 new (671 known), smokes pass (fullscreen flaked once under load); balance 53%, lairs 43/58/53, assault 45%.
- 7605ad7 SET-01; 4cadcf1 CT-06; c475df9 WLD-02; 56031f9 allowlist hygiene. Gates: vitest 1300, server 303, layout 0 new (524 distinct), all 5 smokes first-try, replay 13/13 chromium (webkit not installed); balance 53%, lairs 43/58/53. Load avg 27-50: balance 74 min.
- 676cd87 F-05 Kit; 8f31f7c RD-02 flank arcs/banners; 2e41700 WAR-01 War hub. Gates: vitest 1353, server 303, layout 0 new (493 distinct, 184 screens), smokes pass (main smoke flaked once under load), online-e2e 35 PASS, replay 13/13 chromium; balance 53%, lairs 43/58/53, assault 45%.
- 6848e5a DUE-01 Duels hub; dfb61e4 allowlist hygiene. Gates: vitest 1366, server 303, layout 0 new (382), smokes all pass, online-e2e 34/34 alone (timed out once under load), replay 13/13; balance 53%.
- 06894bc EC-01 forge; e0b79df BTL-01 battle HUD; 22a4dfb forge price moved to gear.ts (server typecheck); ac91a5d allowlist hygiene (tutorial text-size). Gates: vitest 1396, server 303, layout 0 new, smokes all pass, online-e2e 34/34 on rerun (first run timed out at the name prompt, the 3rd batch in a row: fixer-6), replay 13/13; balance 53%.
- 74995a2 DUE-02 duel sub-screens. Gates: vitest 1402, server 303, layout 0 new (47 known), all smokes and online-e2e first try, replay 13/13; balance 53%.
- f763d20 TUT-02 tutorial; e5b45ac FIXER-6 clan fresco slot. Gates: vitest 1403, server 303, layout 0 new (46 known, 197 screens), online-e2e first-try PASS, replay 13/13; balance 53%, host 49%. fullscreen-smoke flaked (facing knob, tap-to-move shape), passed on rerun.
- 637175b DLG-02 dialogs and G12 errors; b7099d2 QA-02 regression suite and tutorial exit; b993953 regression sheet-layout waits 2 frames after a World restart. Gates: vitest 1422, server 303, layout 0 new (45 known), smokes all pass, regression 164 s PASS, online-e2e 34/34, replay 13/13; balance 53%.
- 58dbd77 FL-01 juice tiers. Gates: vitest 1439, server 303, layout 0 new (45 known; run 1 had glTexture-null page errors on 4 en-tg configs at load ~115, clean alone), smokes and regression pass, online-e2e 35, replay 13/13; balance 53%.
- c87bb5e F-07 retire v3 and inkify (+622/-1587), one fmtCount. Gates: vitest 1439, server 303, layout 0 new (45 known), regression 193 s PASS, online-e2e 35, replay 13/13; balance 53%. smoke (no 'Begin the march') and fullscreen-smoke (facing knob, tap-to-move) flaked at load 38, passed alone.

## Queue (next)

1. Merge each finished audit and setup branch through an `integrator` agent (docs-only, so the gates are a quick tsc plus a test sanity run).
2. Remaining Phase 4 fix stories (B3 duel/battle group numbering, B5 stale 'Contact soon' banner, B6 Shoot no-feedback go to the controls and HUD stories): Beast Trial farm (needs a /quick-design first) and sim versioning (V5-012, client+server).
4. Phase 2 in parallel:
   - P4-SPIKE: technical-director on the Phaser 4 decision (V5-005).
   - After ART-BIBLE and UX-IA merge: the `assets` agent (the only one using Chrome) produces 2–3 Gemini hub mockup directions, picked with /ux-review.

4. Phase 3 plan: /create-epics, /create-stories, /sprint-plan (producer) once UX-IA merges. Deferred balance items from GDD_REVIEW (endgame gold sink, item power cap, retrain cost) go into the economy epic.

5. Small fixer: update scripts/online-e2e.mjs (it looks for an 'Online' button that is now 'War'). The Results abandoned-battle notice overlaps the header (fold into the Results rebuild). Write design/accessibility-requirements.md (Standard tier, from the ux-ia review). B3, B5, B6 go to the controls/HUD stories. 'Hero of the battle with 0 kills' is a design call for the Results rebuild.

6. TUT story: remove the no-op `showRing()` from src/ui/tutorial and any ring copy (V5-034). Orphaned i18n key `battle.sit.quiet` in strat.* to clean up.
7. online-e2e setup: API_PROXY must be a full URL (http://localhost:8797), and .dev.vars comes from server/.dev.vars.example with DEV_AUTH=1 (delete it afterwards).
8. CT-02: RU Shoot label truncates to 'Стрел…' at 360 px (pre-existing). Worktree isolation often branches from main: every prompt keeps the 'reset --hard v5 if not based on v5' step.
9. Agent prompts: screenshots are JPEG ≤150 KB each. The machine is heavily loaded, so stagger heavy layout-check runs.

10. RULE: the integrator of the FIRST rule-changing merge (AI-01 or FO-01) raises MIN_SIM_VERSION and SOCKET_MIN_SIM_VERSION to 2 in that merge (V5-033).
11. Next after these: FO-02 (orb + feint, after FO-01), LF-02 (Beast Trial farm), then W5+ per SPRINTS. F-01, F-02, F-03 and AS-01..04 are blocked on the art-bible merge (asked art-bible for status).

12. ST-02c (PRE-RELEASE): the v6 client prefers the cloud copy when cloud.v ≥ local.v and the campaigns differ (V5-036).

14. smoke.mjs flaked once (1 unnamed check) under load. If it repeats, a QA story makes smoke print the failing check name.
15. docs/ITEMS.md:461 still lists the Trial as a hoard source (docs owner). 'Leave during deployment goes to Army' goes to CT-01/BTL-01.

16. After the art merge: F-01 (tokens and type, fix OI-1 split words) and AS-01 (assets agent, Chrome/Gemini hub mockups A/B/C, then AS-02 busts). Earlier note: FO-03 (cohesion, army break; after FO-02), CT-02 (targeting; after CT-01; also fixes the RU 'Стрел…' truncation), AB-01 (perk paths), AI-03 (ladder/war doctrines). Machine load is about 39: keep at most 3 code agents plus 1 integrator.

17. Layout check now takes about 50 min under load (24 configs); integrators should allow for it.

18. Follow-ups: RU pause banner truncates at 320 (BTL/RD story); duel ladder 'Team pts · cap' truncates and floors hidden at 320 (DUE); tab-bar 'Campaign' casing inconsistent (F-02).

19. smoke.mjs still flakes at 'battle against the band' (seen after AR-01 starter bands); a QA fixer is queued. World: the 'Your camp: tap Build' banner points to a removed Build button (WLD story).

20. ORDER: the event card UI (World/Settlement) must merge BEFORE EV-02 (V5-064). HUB-02 starts once HUB-01 merges.

21. ui.png atlas grew 205→462 KB and loads at boot (F-04): per-screen loading goes to the perf story (OI-4).

22. TUT-02 handoff (from TUT-01): remove showRing (battleTutorial.ts:81-82, :343, :409; BattleScene.ts:3661), tutorial army 4/2/2 with group IV, add focus/undo/Then/pause-planning steps, delete stale firstrun.* keys in tutorial.*. HERO-01: the commander name truncates on a 274 px canvas.

23. EC-05 (new, V5-069): structural balance after the W13–W14 sim stories, before ST-04.

24. AR-02 handoffs: campaignBattle.ts must pass garrison works + holdField, the pending battle gets a lairId, settling calls afterLairAssault (FW-03 or WLD-02); WLD-02 builds the assault sheet, burnt lair and the 'Lairs n/6' chip. Walls make garrisons weaker (bots sally out), so the bot fix goes to EC-05. Load average ~42, so parallelism is capped at 3 code agents plus 1 integrator.

25. CT-07 must add the player's Raise-Standard key (RD-01 finding: only bots can raise it). The world-encounter text-overlap at ru 320x568 is a load-only flake, so watch it in WLD-01.

26. Follow-ups: the RU string setsp.bond_of_the_band still says +4%/+3% (localization fix); settings.newCampaign string unused.

27. Next after EC-05 merges: ST-04 (close sim train 2). FW-03 waits for CT-07 (shared battle files).

28. Follow-up: met doctrines are kept in localStorage (CDX-01), so move them to the save (cloud sync) in a later save-touching story. After CT-07 merges: FW-03, CT-06, BTL-01.

29. Handoffs: RD-03 wraps Battle.prototype.drainEvents (BTL-01 should replace it with an explicit call); the RU enemy culture name is untranslated on Results; offline bounty dropped by settleBattle (RES-01); AR-04 host + AR-02 assaults need campaignSetup holdField/works plus WLD-02 map wiring; RES-01 Victory variant for arc 'won'.

30. WLD-01 handoffs: RU 'ROAD' terrain untranslated in the World header and status; status line truncated; event card portrait placeholder. eventBalance rows aren't in `npm run balance` (src/dev/balance.ts).

31. Follow-ups: works tray subtitles at 6 px (BTL-01 text floor); captain names in Latin letters in RU (localization pass); event card portrait placeholder (eventCard.ts); pinch-zoom key A11Y-14 and the fog-edge next-town marker on World not built; unused strat strings world.sit.placing and world.strip.place.

32. Integrator rule: never disable git hooks (core.hooksPath). The repo has none today, so nothing was skipped. Port 5173 is held by a foreign long-running vite, so e2e uses another port. Next: WLD-02 (assault sheet, host, burnt lairs; startLairAssault exists), CT-06 (ladder pause), BTL-01, DUE-01/02, WAR-01, FL-01..04, EC-01, DLG-02, QA-02, F-05, F-07, RD-02, TUT-02, QA-03..06, EC-03.

33. Follow-ups: the swarm doctrine tell says it retreats (contradicts garrisons holding): fix the doctrine text; hero and captain names in Latin letters in RU; DUE-01 should replace CT-06's ladder lookup with an explicit field and show 'expired' on the ladder report; DUEL_RULES.ticketTtlMs unused; wld.lairTap unused.

34. Follow-ups: RU numbers use commas (WAR-01 boss sheet: 12,202), use spaces; ' - ' should be an en dash in RU boss copy; RU item card cuts 'Темп атаки'/'Прочность' at 320; Camp should pass `back` when opening the War army; feint and queued-step badge markers go to BTL-01; shake and hit-stop go to FL-01; webkit replay leg not runnable locally.

35. Process: agents must stop their own dev servers (15 stale vite/vitest processes from finished agents killed 2026-10-12). Copy: the DUE-01 expired note sits next to the battle clock (1:04); say 'real time' or 'the ladder ticket ran out'. Use fmtCount (DUE-01) for RU numbers everywhere (WAR-01 boss sheet).

36. Follow-ups: unify fmtCount (DUE-01) and groupDigits (EC-01) into one RU-aware formatter; use it in MChip gold and the item card; BTL-01 left compact group cards under 360 and the doctrine/ladder chips; 'ФАЛ.' abbreviation on the RU group card; an icon peeks behind the eye key on the RU battle HUD; the dev server returns 403 for fonts when node_modules is a symlink (agents use preview).

37. Follow-ups: battleHud medallion text under 6.5 (tutorial-move allowlist; owner FL/polish); Telegram Back during a duel search goes to the Menu (DUE-02 note).

38. Follow-ups: fullscreen-smoke flakes on the facing knob and tap-to-move shape under load (2nd time); openJournalSheet in eventCard.ts is dead code (F-07); the duel challenge has no X, and Back sends a decline (DLG-02 decision).

39. Watch: 'Cannot read properties of null (reading glTexture)' page errors under extreme load (a WebGL context loss?); QA-05 perf should check context-loss handling.

40. Flakes for fixer-7 (after FL-02 merges): fullscreen-smoke facing knob and tap-to-move shape (3rd time); smoke 'Begin the march' missing once; regression battle-kinds [tutorial] Settings → Replay tutorial tap fails 4/6 even on v5. Audio follow-ups: disabled-tap, destructive and undo UI sounds (callers outside src/audio); a real-phone listen (user).

## Blockers

- DISK: only a few GB free on the Mac (the user's other data fills about 434 GB). v5 follows the V5-057 disk guard. If free space drops under 2 GB, pause new code agents and tell the user.

- (resolved 2026-10-10: the user allowed automatic downloads for gemini.google.com; the assets queue resumed with assets-3)

## Cleanup pending

none (the a58dc3e9 worktree was unlocked and removed by the Director)

## Next tick

Heartbeat about 30 min after 2026-10-10 tick 1. Agent completion notifications are the real wake signal.
