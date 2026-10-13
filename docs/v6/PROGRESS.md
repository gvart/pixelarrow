# v6 progress

- **Line:** branch `v6` in the worktree `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/v6`
- **Phase:** 0 (setup) and 1 (audit), running in parallel
- **Port slots** (V6-002): slot 1 = 6110–6119, slot 2 = 6120–6129, slot 3 = 6130–6139, slot 4 = 6140–6149
- **Chrome and Gemini:** checked 2026-10-13. Signed in and working.

## Running

| Agent | Story | Slot | Skills |
| --- | --- | --- | --- |
| setup-adopt | S0-ADOPT: /adopt and /project-stage-detect, written to docs/v6/ADOPT.md | none | adopt, project-stage-detect, router |
| audit-ui (respawned as general-purpose, V6-004) | A1-UI: screenshots of every scene and the Kit across the screen matrix, written to docs/v6/audit/UI.md | 1 | game-ui-ux, ux-review |
| audit-platform | A1-PLAT: Telegram touchpoints, server map, public stats data and hosting, written to docs/v6/audit/PLATFORM.md, SERVER.md and HOSTING.md | 2 | improve-codebase-architecture, security-audit, router |

## Merged

(none)

## Queue

1. Combine the audit files into docs/v6/AUDIT.md.
2. Phase 2 ADRs (platform layer, hosting, auth, linking, stats API, landing stack and budget).
3. UX specs (landscape rules, input scheme, account flows).
4. Landing direction: art bible addendum and 2–3 Gemini mockups (`assets` agent).
5. Phase 3 plan: epics, stories, sprints.

## Next tick

Collect the 3 reports, merge them through an integrator, combine AUDIT.md, then dispatch the Phase 2 ADR, UX and landing-direction agents (at most 4).
