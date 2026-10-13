# v6 progress

- **Line:** branch `v6` in the worktree `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/v6`
- **Phase:** 0 (setup) and 1 (audit), running in parallel
- **Port slots** (V6-002): slot 1 = 6110–6119, slot 2 = 6120–6129, slot 3 = 6130–6139, slot 4 = 6140–6149
- **Chrome and Gemini:** checked 2026-10-13. Signed in and working.

## Running (Phase 4, sprint 1: code)

| Agent | Story | Slot | Skills |
| --- | --- | --- | --- |
| plat-01 | V6-PLAT-01: platform core (ADR-0006 M1) | 1 (6110–6119) | dev-story, phaser-core, tdd, improve-codebase-architecture |
| gate-01 | V6-GATE-01: ten-size layout matrix, allowlist split per owner | 5 (6150–6159) | dev-story, regression-suite, game-ui-ux, tdd |
| host-01 | V6-HOST-01: landing scaffold, its Worker, dry-run | 3 (6130–6139) | dev-story, tdd, performance-optimization |
| acct-01 | V6-ACCT-01: PBKDF2 spike | 4 (6140–6149) | security-audit, perf-profile, tdd |
| video | P5-VIDEO: 11 landing clips | 2 (6120–6129) | create-game-assets, performance-optimization |

Five agents are running, one over the cap, because video is asset work and shares no files.

## Merged

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
