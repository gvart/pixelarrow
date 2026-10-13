# v6 progress

- **Line:** branch `v6` in the worktree `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/v6`
- **Phase:** 0 (setup) and 1 (audit), running in parallel
- **Port slots** (V6-002): slot 1 = 6110–6119, slot 2 = 6120–6129, slot 3 = 6130–6139, slot 4 = 6140–6149
- **Chrome and Gemini:** checked 2026-10-13. Signed in and working.

## Running

| Agent | Story | Slot | Skills |
| --- | --- | --- | --- |
| integrator-plat-01 | merges PLAT-01, full gates, recheck ru 375x667 | 9 (6190–6199) | n/a |

**Integration queue (in order):** PLAT-01 (running) → ACCT-02 (worktree-agent-ae2ee72c9e3552df0; check whether the online-e2e duel-step failure was already there on base) → LAND-02b (worktree-agent-a53d46dde96001b69) → LAND-05 (worktree-agent-a468db3ae96ea6c1e; mobile LCP has a cliff at about 14.2 kB of gzipped HTML, so below-the-fold CSS is lazy; three FAQ answers describe unmerged v6 features, rechecked in LAND-06) → GATE-01 (worktree-agent-aa79f1267b9ef0092; rerun the full vitest; matrix: phone sizes plus 1280x800 only, per V6-030; CI covers the rest).
Integrators run one at a time in slot 9. Director merges check the exit code (V6-028).

**Unblocked once PLAT-01 merges:** INP-01 (action map), PLAT-02 (haptics codemod and Back), PAY-01 needs PLAT-04. RFND-01 waits for GATE-01.
**Queued landing work:** LAND-04 (needs STATS-02, which needs ACCT-04), LAND-05, LAND-06.
**Tech debt:** a flaky root vitest test (seen once in 1540); the integrator records it in docs/v6/qa/FLAKY.md. Migrate @cloudflare/vitest-pool-workers to @cloudflare/vitest-plugin.

## Merged

- STATS-01 (V6-031), LAND-03 (V6-032)

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
