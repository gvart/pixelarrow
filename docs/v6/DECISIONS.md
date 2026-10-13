# v6 decisions

The owner's answers (2026-10-13) are in the brief (`docs/playbook/director-brief-v6.md`): landing page on pixelarrow.app, game on play.pixelarrow.app, full scope with no cuts, landing page in English only with live stats, gameplay videos, Gemini art and calls to action, never deploy.

| ID | Date | Decision | Alternatives | Why |
| --- | --- | --- | --- | --- |
| V6-001 | 2026-10-13 | The v6 line is the local branch `v6` in its own worktree, `{ROOT}/.claude/worktrees/v6`, created from `main` at 6201095. Story agents start with `git merge --ff-only v6` in their worktree. Integrators merge into it with `--no-ff`. | Branch `v6` in the main checkout | The main checkout stays on `main`, and another loop runs on this machine. |
| V6-002 | 2026-10-13 | Owner rule: another loop shares this machine. v6 processes use ports 6100–6199, 10 per story slot (slot n uses 61n0–61n9). Check each port with lsof before using it, start with `--strictPort`, and kill only PIDs you started. | Default ports 5173 and 4173 | The two loops would otherwise collide or kill each other's servers. |
| V6-003 | 2026-10-13 | The brief lives in the repo at `docs/playbook/director-brief-v6.md`. `.claude/prompts/v6-director.md` is the same text if the owner copies it there. | Untracked only | Follows the playbook rule. A hook blocked writing to the shared `.claude/`. |
| V6-004 | 2026-10-13 | Work that needs a shell, a browser or git (audits with screenshots, implementation, integrators) runs as a `general-purpose` agent that reads the role file `{F}/agents/<role>.md`. Studio role agent types are used only when their tool list covers the work: ux-designer, art-director, game-designer and writer have no Bash. | Always use the role type | The first audit-ui run was blocked because it had no Bash or Playwright. |
