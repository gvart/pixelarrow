# v6 progress

- **Line:** branch `v6` in the worktree `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/v6`
- **Phase:** 0 (setup) and 1 (audit), running in parallel
- **Port slots** (V6-002): slot 1 = 6110–6119, slot 2 = 6120–6129, slot 3 = 6130–6139, slot 4 = 6140–6149
- **Chrome and Gemini:** checked 2026-10-13. Signed in and working.

## Running

| Agent | Story | Slot | Skills |
| --- | --- | --- | --- |
| rfnd-01 | V6-RFND-01: scale policy, ADR-0013, size classes, legacy column | 1 (6110–6119) | game-ui-ux, architecture-decision, phaser-core, tdd |
| fix-shop | FIX-SHOP-01: the signed-out web Shop stuck (GATE02-B1) | 5 (6150–6159) | tdd, phaser-core |
| link-04 | V6-LINK-04: account deletion engine | (none) | security-audit, save-systems, tdd |

**Integration queue:** ACCT-04 (branch v6-acct-04; raise the regression CI timeout-minutes from 20 to 45; add owner actions for the Turnstile secret and the ratelimit namespace ids 6001/6002) → RFND-01 → FIX-SHOP-01 → LINK-04.
Integrators run one at a time in slot 9. No Director commits while a merge is open (V6-037).

**Next ready after merges:** STATS-02 (after ACCT-04), RFND-02 and RFND-03 (after RFND-01), ACCT-05 (needs PLAT-04), PLAT-03, INP-02, LINK-02 (after LINK-04), GATE-01b (fast layout mode, V6-030).

## Merged

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
