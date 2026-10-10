# v5 Progress (the Director's single source of truth)

Brief: `.claude/prompts/redesign-v5-director.md`. This is an untracked copy in this worktree; the original lives in worktree `local-install-skills-agents-5e5955`.
Main line: local branch `v5`, checked out in `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/sd-69ad2c`. Never push, never touch `main`, never deploy.
Framework paths for agent prompts: `F=/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/sd-69ad2c` → `$F/.claude/skills/<name>/SKILL.md` and `$F/.claude/agents/<name>.md`.
Chrome and Gemini were checked on 2026-10-10: the user is logged in. Downloads into `docs/v5/gemini/` are approved for the whole run. Only the `assets` agent may use Chrome.

## Phase: 4–6 build, waves W1–W5 in progress (F-*/AS-* blocked on the art bible)

## Running agents

| Name | Story | Skills | Agents | Branch | Status |
| --- | --- | --- | --- | --- | --- |
| fo-02 | W4 FO-02: orb + feint | per card | per card | worktree-agent | running |
| ct-01 | W5 CT-01: soldier beats knob, knob sends face | per card | per card | worktree-agent | running |
| ai-02 | W5 AI-02: band captains, bounty | per card | per card | worktree-agent | running |
| art-bible | S2-ART-BIBLE: design/art/art-bible.md, docs/v5/art/ASSET_PIPELINE.md + scripts/art/, ASSET_LIST.md, Gemini templates in ASSET_LOG | art-bible, create-game-assets, asset-spec, asset-audit | art-director, technical-artist | worktree-agent | running |

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

## Blockers

none

## Cleanup pending

none (the a58dc3e9 worktree was unlocked and removed by the Director)

## Next tick

Heartbeat about 30 min after 2026-10-10 tick 1. Agent completion notifications are the real wake signal.
