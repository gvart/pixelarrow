# v5 Progress (the Director's single source of truth)

Brief: `.claude/prompts/redesign-v5-director.md`. This is an untracked copy in this worktree; the original lives in worktree `local-install-skills-agents-5e5955`.
Main line: local branch `v5`, checked out in `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/sd-69ad2c`. Never push, never touch `main`, never deploy.
Framework paths for agent prompts: `F=/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/sd-69ad2c` → `$F/.claude/skills/<name>/SKILL.md` and `$F/.claude/agents/<name>.md`.
Chrome and Gemini were checked on 2026-10-10: the user is logged in. Downloads into `docs/v5/gemini/` are approved for the whole run. Only the `assets` agent may use Chrome.

## Phase: 0 Setup + 1 Audit (started 2026-10-10)

## Running agents

| Name | Story | Skills | Agents | Branch | Status |
| --- | --- | --- | --- | --- | --- |
| audit-ui | S1-AUDIT-UI: every scene shot at 390/360/320 → docs/v5/audit/UI.md, NAV.md, shots/ | ux-review, game-ui-ux | ux-designer, accessibility-specialist | worktree-agent | running |
| audit-play | S1-AUDIT-PLAY: tutorial, campaign battle, duel and war played through → docs/v5/audit/PLAY.md, play/ | playtest-report, input-systems, game-feel | qa-tester, game-designer | worktree-agent | running |
| fix-saves | S4-FIX-SAVES: no silent overwrite on failed migration (backup), persist the pending battle so killing the app can't escape permadeath; TDD + all gates | save-systems, tdd, dev-story | gameplay-programmer | worktree-agent | running |
| p4-spike | S2-P4-SPIKE: attempt Phaser 4 upgrade in its worktree, measure, write docs/v5/spike/P4.md + design/adr/ADR-0003 | phaser-core, architecture-decision, performance-optimization | technical-director, engine-programmer | worktree-agent (see report) | running (merge docs always; code only on UPGRADE) |

## Merged into v5

- 7510360 docs(v5): director state files and initial decisions
- f9b8929 merge: S0-SETUP: 39 systems in design/gdd/systems-index.md, stage Production (CONCERNS: no GDDs or ADRs). Gates: tsc ok, vitest 525/525.
- b829290 merge: S1-AUDIT-MECH: MECHANICS.md and balance BASELINE (104/306 class pairings lopsided, elites lose to cheap shock, loot resale beats battle pay). Gates: tsc ok, vitest 525/525.

## Queue (next)

1. Merge each finished audit and setup branch through an `integrator` agent (docs-only, so the gates are a quick tsc plus a test sanity run).
2. S1-AUDIT-SYNTH: one agent merges UI, PLAY and MECHANICS into `docs/v5/AUDIT.md`, area by area with severity.
3. Remaining Phase 4 fix stories: Beast Trial farm (needs a /quick-design first) and sim versioning (V5-012, client+server).
4. Phase 2 in parallel:
   - VISION: /brainstorm with creative-director and game-designer → VISION.md, then a /quick-design GDD per expansion.
   - ART+UX: /art-bible and /ux-design IA and screen-flow map, with art-director and ux-designer.
   - P4-SPIKE: technical-director on the Phaser 4 decision (V5-005).
   - The `assets` agent then produces 2–3 Gemini hub mockup directions, picked with /ux-review.

## Blockers

none

## Cleanup pending

- Worktree `agent-a58dc3e9cd4628579` and branch `worktree-agent-a58dc3e9cd4628579` (already merged in b829290) are still locked by the harness. Retry `git worktree remove` + `git branch -d` next tick.

## Next tick

Heartbeat about 30 min after 2026-10-10 tick 1. Agent completion notifications are the real wake signal.
