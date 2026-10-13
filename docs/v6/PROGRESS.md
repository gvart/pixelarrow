# v6 progress

- **Line:** branch `v6` in the worktree `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/v6`
- **Phase:** 0 (setup) and 1 (audit), running in parallel
- **Port slots** (V6-002): slot 1 = 6110–6119, slot 2 = 6120–6129, slot 3 = 6130–6139, slot 4 = 6140–6149
- **Chrome and Gemini:** checked 2026-10-13. Signed in and working.

## Running

| Agent | Story | Slot | Skills |
| --- | --- | --- | --- |
| audit-ui | A1-UI: screenshots across the screen matrix, written to docs/v6/audit/UI.md | 1 | game-ui-ux, ux-review |
| arch-platform | P2-ARCH-PLAT: ADR-0006 (platform layer), ADR-0007 (hosting), CONTROL_MANIFEST_PLATFORM | none | architecture-decision, create-control-manifest, improve-codebase-architecture |
| arch-accounts | P2-ARCH-ACCT: ADR-0008 (accounts and sessions), ADR-0009 (linking, nicknames, deletion), ADR-0010 (public stats API), CONTROL_MANIFEST_ACCOUNTS | none | architecture-decision, security-audit, save-systems |
| landing-direction | P2-LAND: ADR-0011 (landing stack and budget), landing ART_DIRECTION and STRUCTURE, 2–3 Gemini mockups and a pick. Owns Chrome. | none | art-bible, create-game-assets, ux-review, design-principles, frontend-design |
| docs-refresh | P2-DOCS: systems index and GDD statuses, v6 systems, ROADMAP v6 section | none | map-systems, reverse-document, consistency-check |

Five agents are running, one more than the cap, because audit-ui is close to finishing.

## Merged

- S0-ADOPT (81bc945)
- A1-PLAT (e6725f3)

## Queue

1. Merge A1-UI, then write UX specs: landscape layout rules per screen family, the input scheme and default hotkeys, the account and linking flows (`/ux-design`).
2. Combine docs/v6/audit/* into AUDIT.md.
3. Phase 3: /create-epics, /create-stories, /sprint-plan after the ADRs and UX specs, then /architecture-review.
4. Phase 4 foundation, once the plan exists.

## Next tick

Collect the reports. Docs-only merges are done by the Director (V6-010). After A1-UI lands, start the UX specs agent. When all of Phase 2 is merged, start Phase 3 planning.
