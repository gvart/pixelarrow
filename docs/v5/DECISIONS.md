# v5 Decisions

Every decision that matters, made by the Director instead of asking. Append only; never rewrite old entries.

| ID | Date | Decision | Alternatives | Why |
| --- | --- | --- | --- | --- |
| V5-001 | 2026-10-10 | The main line is the local branch `v5`, cut from `main` @ bd61069 and checked out in worktree `.claude/worktrees/sd-69ad2c`. Integrators merge into it there. | A separate long feature branch per epic | The brief requires it; one worktree keeps every merge in a single place. |
| V5-002 | 2026-10-10 | The CCGS framework (`.claude/` skills, agents, rules, prompts and `project.yaml`) was copied from worktree `local-install-skills-agents-5e5955` into this worktree and left **untracked**. Subagents get absolute paths under `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/sd-69ad2c/.claude/`. | Commit the framework to `v5` | The brief says `.claude/` stays untracked. One stable copy keeps the paths valid even if the sibling worktree is removed. |
| V5-003 | 2026-10-10 | Phase 0 (setup) and Phase 1 (audit) run in parallel on the first tick: a docs-only setup agent plus three audit agents. | Run them in sequence | They touch disjoint files (`design/` and `docs/v5/setup/` versus `docs/v5/audit/`). The audit doesn't depend on the `/adopt` output. |
| V5-004 | 2026-10-10 | Browser agents drive their own headless Playwright through node scripts (`scripts/lib`, as `scripts/*.mjs` already do) on distinct ports. The Playwright MCP is not shared between parallel agents, and Chrome belongs to the `assets` agent alone. | One shared Playwright MCP | Parallel agents would fight over one MCP browser. |
| V5-005 | 2026-10-10 | The Phaser 4 upgrade decision is deferred to Phase 2 and is informed by the audit plus a `technical-director` spike. | Decide now | A decision without evidence is hard to undo. |
| V5-006 | 2026-10-10 | Retrofit GDDs only for the systems v5 touches, MVP first. | Retrofit GDDs for all 39 systems | Effort goes where change happens. Untouched systems stay documented by `systems-index.md`. |
| V5-007 | 2026-10-10 | The game concept (`design/gdd/game-concept.md`) is written by the Phase 2 `/brainstorm`, not as a stand-in now. | Write a placeholder concept now | A placeholder would be rewritten anyway. |
| V5-008 | 2026-10-10 | Write three Foundation ADRs in Phase 3/4: the determinism and replay contract (the server replays the battle sim), save migration, and the engine version (after the V5-005 spike). | Skip ADRs | These three are the load-bearing constraints that every later story must respect. |
| V5-009 | 2026-10-10 | v5 tracking stays in `docs/v5/PROGRESS.md`, not the CCGS `production/` tree. | Adopt `production/` sprint files | The brief mandates `PROGRESS.md` as the single resume point. |
| V5-010 | 2026-10-10 | `project.yaml` modes are `rigor: standard` and `automation: autonomous` (resolving to workflow standard, review lean, docs balanced). `engine.*` is left unset until V5-005. | rigor: full | Standard fits an overnight autonomous run; lean review keeps the desk moving. |
