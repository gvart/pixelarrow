# v5 Progress (the Director's single source of truth)

Brief: `.claude/prompts/redesign-v5-director.md`. This is an untracked copy in this worktree; the original lives in worktree `local-install-skills-agents-5e5955`.
Main line: local branch `v5`, checked out in `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/sd-69ad2c`. Never push, never touch `main`, never deploy.
Framework paths for agent prompts: `F=/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/sd-69ad2c` → `$F/.claude/skills/<name>/SKILL.md` and `$F/.claude/agents/<name>.md`.
Chrome and Gemini were checked on 2026-10-10: the user is logged in. Downloads into `docs/v5/gemini/` are approved for the whole run. Only the `assets` agent may use Chrome.

## Phase: 1 done → 2 Vision and direction (started 2026-10-10)

## Running agents

| Name | Story | Skills | Agents | Branch | Status |
| --- | --- | --- | --- | --- | --- |
| art-bible | S2-ART-BIBLE: design/art/art-bible.md, docs/v5/art/ASSET_PIPELINE.md + scripts/art/, ASSET_LIST.md, Gemini templates in ASSET_LOG | art-bible, create-game-assets, asset-spec, asset-audit | art-director, technical-artist | worktree-agent | running |
| ux-ia | S2-UX-IA (done, awaiting merge): design/ux/, docs/v5/ux/ (24 screens, ELEMENT_MAP 331 old elements: 12 removed with reasons, 68 new; hub directions A Fresco Hall, B War Table, C Muster Roll) | ux-design, game-ui-ux, ux-review | ux-designer, accessibility-specialist | worktree-agent-af44c43de8953248d | merging |
| sim-version | S4-SIM-VERSION (done, awaiting merge): SIM_VERSION=1, client+server, migration 0016, ADR-0001 | architecture-decision, tdd, dev-story, security-audit | network-programmer, lead-programmer | s4-sim-version | merging |
| p4-spike | S4-P4-UPGRADE (V5-025 gated; was S2-P4-SPIKE): attempt Phaser 4 upgrade in its worktree, measure, write docs/v5/spike/P4.md + design/adr/ADR-0003 | phaser-core, architecture-decision, performance-optimization | technical-director, engine-programmer | worktree-agent (see report) | running (merge docs always; code only on UPGRADE) |

## Merged into v5

- 7510360 docs(v5): director state files and initial decisions
- f9b8929 merge: S0-SETUP: 39 systems in design/gdd/systems-index.md, stage Production (CONCERNS: no GDDs or ADRs). Gates: tsc ok, vitest 525/525.
- b829290 merge: S1-AUDIT-MECH: MECHANICS.md and balance BASELINE (104/306 class pairings lopsided, elites lose to cheap shock, loot resale beats battle pay). Gates: tsc ok, vitest 525/525.
- 17d080e merge: S1-AUDIT-UI: UI.md (20 scenes, 143 issues: 1 blocker, 58 major, 84 minor), NAV.md, 209 shots. Gates: tsc ok, vitest 525/525.
- 9ab9ad6 merge: S1-AUDIT-PLAY: PLAY.md + 42 shots (3-man start kills formations, morale and flanks unreadable, no undo, no impact feel, slow pacing; bugs B1–B6). Gates: tsc ok, vitest 525/525.
- 94c0472 merge: S2-VISION (part 1): AUDIT.md, VISION.md, game-concept.md, 8 GDDs (ai-doctrines, formations-orders, abilities, campaign-arc, campaign-events, field-works, controls, battle-readability), entities registry, PROPOSALS P-1..P-3. Gates: tsc ok, vitest 525/525.
- 5bf6ae2 merge: S2-VISION part 2: GDD review fixes + GDD_REVIEW.md (consistency-check CONCERNS: balance targets not yet measured). Gates: tsc ok, vitest 525/525.
- 81aa8e0 merge: S4-FIX-SAVES: two-slot atomic saves, no silent wipe (px_corrupt), battle stands once begun, scene.start data (B1/B2, 26 call sites), Losses (B4). Plus 2f55742, a legacy main-layout save test. Gates: tsc, vitest 557, build, layout 0 new, smoke, tutorial-smoke, duel-smoke all pass.

## Queue (next)

1. Merge each finished audit and setup branch through an `integrator` agent (docs-only, so the gates are a quick tsc plus a test sanity run).
2. Remaining Phase 4 fix stories (B3 duel/battle group numbering, B5 stale 'Contact soon' banner, B6 Shoot no-feedback go to the controls and HUD stories): Beast Trial farm (needs a /quick-design first) and sim versioning (V5-012, client+server).
4. Phase 2 in parallel:
   - P4-SPIKE: technical-director on the Phaser 4 decision (V5-005).
   - After ART-BIBLE and UX-IA merge: the `assets` agent (the only one using Chrome) produces 2–3 Gemini hub mockup directions, picked with /ux-review.

4. Phase 3 plan: /create-epics, /create-stories, /sprint-plan (producer) once UX-IA merges. Deferred balance items from GDD_REVIEW (endgame gold sink, item power cap, retrain cost) go into the economy epic.

5. Small fixer: update scripts/online-e2e.mjs (it looks for an 'Online' button that is now 'War'). The Results abandoned-battle notice overlaps the header (fold into the Results rebuild). Write design/accessibility-requirements.md (Standard tier, from the ux-ia review). B3, B5, B6 go to the controls/HUD stories. 'Hero of the battle with 0 kills' is a design call for the Results rebuild.

## Blockers

none

## Cleanup pending

none (the a58dc3e9 worktree was unlocked and removed by the Director)

## Next tick

Heartbeat about 30 min after 2026-10-10 tick 1. Agent completion notifications are the real wake signal.
