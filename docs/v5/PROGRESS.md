# v5 Progress (the Director's single source of truth)

Brief: `.claude/prompts/redesign-v5-director.md`. This is an untracked copy in this worktree; the original lives in worktree `local-install-skills-agents-5e5955`.
Main line: local branch `v5`, checked out in `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/sd-69ad2c`. Never push, never touch `main`, never deploy.
Framework paths for agent prompts: `F=/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/sd-69ad2c` → `$F/.claude/skills/<name>/SKILL.md` and `$F/.claude/agents/<name>.md`.
Chrome and Gemini were checked on 2026-10-10: the user is logged in. Downloads into `docs/v5/gemini/` are approved for the whole run. Only the `assets` agent may use Chrome.

## Phase: 1 done → 2 Vision and direction (started 2026-10-10)

## Running agents

| Name | Story | Skills | Agents | Branch | Status |
| --- | --- | --- | --- | --- | --- |
| vision | S1-AUDIT-SYNTH + S2-VISION: AUDIT.md, VISION.md, game-concept.md, a GDD per expansion + controls.md, review-all-gdds + consistency-check | brainstorm, quick-design, review-all-gdds, consistency-check | creative-director, game-designer, systems-designer | worktree-agent | running |
| fix-saves | S4-FIX-SAVES: no silent overwrite on failed migration (backup), persist the pending battle so killing the app can't escape permadeath, + B1/B2 scene.start data reuse (tutorial or duel replays on campaign attack), B4 Losses 0; TDD + all gates | save-systems, tdd, dev-story | gameplay-programmer | worktree-agent | running |
| p4-spike | S2-P4-SPIKE: attempt Phaser 4 upgrade in its worktree, measure, write docs/v5/spike/P4.md + design/adr/ADR-0003 | phaser-core, architecture-decision, performance-optimization | technical-director, engine-programmer | worktree-agent (see report) | running (merge docs always; code only on UPGRADE) |

## Merged into v5

- 7510360 docs(v5): director state files and initial decisions
- f9b8929 merge: S0-SETUP: 39 systems in design/gdd/systems-index.md, stage Production (CONCERNS: no GDDs or ADRs). Gates: tsc ok, vitest 525/525.
- b829290 merge: S1-AUDIT-MECH: MECHANICS.md and balance BASELINE (104/306 class pairings lopsided, elites lose to cheap shock, loot resale beats battle pay). Gates: tsc ok, vitest 525/525.
- 17d080e merge: S1-AUDIT-UI: UI.md (20 scenes, 143 issues: 1 blocker, 58 major, 84 minor), NAV.md, 209 shots. Gates: tsc ok, vitest 525/525.
- 9ab9ad6 merge: S1-AUDIT-PLAY: PLAY.md + 42 shots (3-man start kills formations, morale and flanks unreadable, no undo, no impact feel, slow pacing; bugs B1–B6). Gates: tsc ok, vitest 525/525.

## Queue (next)

1. Merge each finished audit and setup branch through an `integrator` agent (docs-only, so the gates are a quick tsc plus a test sanity run).
2. Remaining Phase 4 fix stories (B3 duel/battle group numbering, B5 stale 'Contact soon' banner, B6 Shoot no-feedback go to the controls and HUD stories): Beast Trial farm (needs a /quick-design first) and sim versioning (V5-012, client+server).
4. Phase 2 in parallel:
   - ART+UX: /art-bible and /ux-design IA and screen-flow map, with art-director and ux-designer.
   - P4-SPIKE: technical-director on the Phaser 4 decision (V5-005).
   - The `assets` agent then produces 2–3 Gemini hub mockup directions, picked with /ux-review.

## Blockers

none

## Cleanup pending

none (the a58dc3e9 worktree was unlocked and removed by the Director)

## Next tick

Heartbeat about 30 min after 2026-10-10 tick 1. Agent completion notifications are the real wake signal.
