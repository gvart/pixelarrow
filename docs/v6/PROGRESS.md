# v6 progress

- **Line:** branch `v6` in the worktree `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/v6`
- **Phase:** 0 (setup) and 1 (audit), running in parallel
- **Port slots** (V6-002): slot 1 = 6110–6119, slot 2 = 6120–6129, slot 3 = 6130–6139, slot 4 = 6140–6149
- **Chrome and Gemini:** checked 2026-10-13. Signed in and working.

## PAUSED (2026-10-14, at the owner's request)

The run is paused cleanly. **To resume:** start the same `/loop /orchestrate …` prompt. The Director reads this file and `git log` on v6, then:
1. Checks each paused agent's branch below (commits, `wip` commits included). For an unfinished branch, dispatch a fresh agent with the same story prompt, telling it to start FROM that branch (`git merge --ff-only <branch>` or a reset to it) and to finish the remaining steps. For a finished branch, hand it to an integrator.
2. Continues the queue below.

**Paused agents** (branch, state: filled in from their pause reports):
- rscr-02 (V6-RSCR-02, battle HUD and results): see "Pause reports" below
- rscr-05 (V6-RSCR-05, Army and Hero): see below
- rscr-07 (V6-RSCR-07, World and Camp): see below
- plat-05 (V6-PLAT-05, share, invite and deep links): see below

**Queue after them:** PLAT-04 (after PLAT-05) → ACCT-05 → ACCT-06/07, PAY-01 → PAY-02; LINK-05/06/07 (after ACCT-05); RSCR-03, 04, 06, 08, 09, 10, 11 (any order, file-disjoint, at most 4 at a time; RSCR-11 last, since it removes the legacy column and the pending mechanism); INP-06 (after INP-05 and RSCR-02); then the QA-release epic (QA-01..05, Phase 8). QA-final must rewrite the landing FAQ once the web account, linking, rebinding and deletion UIs ship (V6-060).

**Rules learned (keep them):** integrators run one at a time in the v6 worktree, on ports 6190–6199; no Director commits while a merge is open (V6-037); every agent writes logs to its own folder (V6-035); story agents use `layout-check --quick`; integrators run the full matrix only when src/ or the layout scripts changed (V6-057); agents that need a shell or browser are general-purpose agents reading a role file (V6-004).

## Pause reports

(filled in as the agents report)

- **rscr-02** (V6-RSCR-02): branch `worktree-agent-a1c9a07a75e7920bc`, last commit a71c8917 (wip). Done: the battle HUD per size class (portrait unchanged, 3 cards per row on tablet, right thumb rail at 844x390, bottom-centre orders on laptops), the camera framing rect follows and recentres, Results in two panes, Inspect as a side panel, the allowlist file deleted; vitest 1968/1968; replay-hash 13/13; portrait 0 px; 28/28 play checks. Left: the tutorial narrator panel is 376 wide at medium (over 320); 12 undiagnosed violations at 844x390; rerun `layout-check --scenes 'battle*,results*,tutorial*' --verbose`, then regression --all; commit the screenshots and finish the notes.

## Merged

- RSCR-01 (V6-068), INP-05 (V6-069), QA-HARDEN (V6-070), FIX-KIT-WIDE (V6-067). 44 of 64 stories merged; v6 HEAD 803fde39 or later.

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
