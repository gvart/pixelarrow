# v6 progress

- **Line:** branch `v6` in the worktree `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/v6`
- **Phase:** 0 (setup) and 1 (audit), running in parallel
- **Port slots** (V6-002): slot 1 = 6110–6119, slot 2 = 6120–6129, slot 3 = 6130–6139, slot 4 = 6140–6149
- **Chrome and Gemini:** checked 2026-10-13. Signed in and working.

## Running

| Agent | Story | Slot | Skills |
| --- | --- | --- | --- |
| plat-01 | V6-PLAT-01: platform core | 1 (6110–6119) | dev-story, phaser-core, tdd, improve-codebase-architecture |
| gate-01 | V6-GATE-01: ten-size layout matrix (long matrix run) | 5 (6150–6159) | dev-story, regression-suite, game-ui-ux, tdd |
| land-03 | V6-LAND-03: features, classes and modes sections, clips M1–M4 moved to landing/public/video | 4 (6140–6149) | frontend-design, design-principles, game-feel, performance-optimization |
| stats-01 | V6-STATS-01: public stats snapshot, migration, cron | 6 (6160–6169) | dev-story, security-audit, tdd |

Integrators run one at a time and use slot 9 (6190–6199). Director merges check `git merge` succeeded (V6-028).

**Waiting on PLAT-01/GATE-01:** RFND-01, INP-01 and every sprint 3+ story that touches src/.
**Queued landing work:** LAND-02b (phone hero animation and line stagger, V6-029), LAND-04 (needs STATS-02), LAND-05, LAND-06.

## Merged

- Landing: LAND-01 (V6-025/026), LAND-02 (V6-029), P5-VIDEO (V6-027/028)

- Sprint 2: V6-HOST-02 (V6-024, 05b7d86)
- Sprint 1: V6-ACCT-01 (V6-022, ac5eb98), V6-HOST-01 (V6-023, 49515b1)

- Phase 0–3 is complete: S0-ADOPT, A1-PLAT, A1-UI, P2 ×7 (V6-012..020), P5-LAND-ART (V6-019), P3-PLAN (V6-021)

## Housekeeping

- The worktree agent-a37963953686eb60b was locked at merge time; remove it and its branch later.
- `.claude/worktrees/v6-shots/` holds about 850 MB of audit screenshots. Prune after sprint 2.

## Queue

1. Code merges go through an `integrator` agent (general-purpose, devops-engineer role). It merges `--no-ff` into v6 in /Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/v6, runs every gate (tsc, vitest, vite build, server tests, the layout matrix on its own port slot, smoke scripts; the landing build and dry-run once HOST-01 is in), fixes or reports, then removes the worktree.
2. Sprint 2 and later follow docs/v6/plan/SPRINTS.md.
3. Combine docs/v6/audit/* into AUDIT.md (small; can ride along with an integrator).

## Next tick

As each sprint 1 story reports: review it (2–3 screenshots, its Skills applied section), then hand it to an integrator. When video reports, merge its assets (V6-019 rule). When a slot frees up, dispatch the next sprint 2 story from SPRINTS.md if its dependencies are merged.
