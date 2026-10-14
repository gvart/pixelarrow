# v6 progress

- **Line:** branch `v6` in the worktree `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/v6`
- **Phase:** 0 (setup) and 1 (audit), running in parallel
- **Port slots** (V6-002): slot 1 = 6110–6119, slot 2 = 6120–6129, slot 3 = 6130–6139, slot 4 = 6140–6149
- **Chrome and Gemini:** checked 2026-10-13. Signed in and working.

## Running

| Agent | Story | Slot | Skills |
| --- | --- | --- | --- |
| fix-kit-wide | FIX-KIT-WIDE: panel-aware wide rules and realistic Kit demos (V6-063); gets v6 green | 3 (6130–6139) | game-ui-ux, regression-suite, tdd |
| plat-05 | V6-PLAT-05: share, invite and deep links through the platform | 2 (6120–6129) | dev-story, improve-codebase-architecture, tdd |
| rscr-01 | V6-RSCR-01: shell and hubs, landscape and tablet (first per-screen story) | 1 (6110–6119) | game-ui-ux, ux-review, frontend-design, design-principles, tdd |
| inp-05 | V6-INP-05: Settings → Keyboard shortcuts page | 5 (6150–6159) | input-systems, game-ui-ux, ux-review, tdd |

**v6 status:** red only on kit-layouts* wide findings (V6-062), until FIX-KIT-WIDE merges.
**Default layout command:** story agents use `--quick`; integrators use the full matrix only when src/ or the layout scripts changed (V6-057).
**Next ready:** PLAT-04 (after PLAT-05), then ACCT-05 and PAY-01; RSCR-02..11 after RSCR-01; LINK-05/06/07 after ACCT-05; INP-06 after INP-05 and RSCR-02; a QA hardening story for the load-sensitive smoke flakes (FLAKY F1, F3, F4).

## Merged

- STATS-03 (V6-050/051), INP-02 (V6-052), LINK-03 (V6-054, with the V6-053 security fix), RFND-01 (V6-055), LAND-04 (V6-056), GATE-01b (V6-057), RFND-04 (V6-058), RFND-02 (V6-059), LAND-06 (V6-060), PLAT-03 (V6-061), RFND-03 (V6-062), INP-03 (V6-064), INP-04 (V6-065), LINK-02 (V6-049)

- ACCT-04 (V6-045), FIX-SHOP-01 (V6-046), STATS-02 (V6-047), LINK-04 (V6-048)

- INP-01 (V6-038), GATE-01 (V6-039), PLAT-02 (V6-040), LINK-01 (V6-041), ACCT-03 (V6-042), HOST-03 (V6-043), GATE-02 (V6-044) + CI wiring 8c48f356

- ACCT-02 (V6-034, 46c654fe)

- PLAT-01 (V6-033, ea62934e)

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
