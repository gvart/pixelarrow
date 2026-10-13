# v6 progress

- **Line:** branch `v6` in the worktree `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/v6`
- **Phase:** 0 (setup) and 1 (audit), running in parallel
- **Port slots** (V6-002): slot 1 = 6110–6119, slot 2 = 6120–6129, slot 3 = 6130–6139, slot 4 = 6140–6149
- **Chrome and Gemini:** checked 2026-10-13. Signed in and working.

## Running

| Agent | Story | Slot | Skills |
| --- | --- | --- | --- |
| audit-ui | A1-UI: screenshots across the screen matrix, written to docs/v6/audit/UI.md | 1 | game-ui-ux, ux-review |
| ux-input | P2-UX-INPUT: design/ux/input-v6.md, ADR-0012 (input) | none | input-systems, ux-design, game-ui-ux, camera-systems |
| ux-accounts | P2-UX-ACCT: design/ux/accounts-v6.md | none | ux-design, game-ui-ux, ux-review |
| assets | P5-LAND-ART: hero parallax layers, OG image, favicon, ASSET_SPEC, into landing/assets-staging. Owns Chrome. | none | create-game-assets, asset-spec, asset-audit, chrome-browser |

## Merged

- S0-ADOPT (81bc945)
- A1-PLAT (e6725f3)
- P2-ARCH-PLAT (ac39d51): ADR-0006 and ADR-0007, accepted (V6-012)
- P2-DOCS: systems index and ROADMAP (V6-013)
- P2-ARCH-ACCT: ADR-0008, 0009 and 0010, accepted with the PBKDF2 spike condition (V6-014)
- P2-LAND: direction B and ADR-0011, accepted with the wow amendments (V6-015)

## Queue

1. Merge A1-UI, then write the landscape layout-rules UX spec per screen family (`/ux-design`, needs UI.md), and combine docs/v6/audit/* into AUDIT.md.
2. `video` agent: the 11 clips from docs/v6/landing/STRUCTURE.md (port slot 2). It can start once a slot is free.
3. Phase 3: /create-epics, /create-stories, /sprint-plan once the UX specs are in, then /architecture-review across ADR-0006..0012.
4. Phase 4 foundation: the platform layer migration (ADR-0006), the layout primitives and Kit, the input layer, the layout-check matrix, the hosting split and the landing package scaffold.

## Next tick

Collect the reports. Docs-only merges are done by the Director (V6-010). After A1-UI lands, start the UX specs agent. When all of Phase 2 is merged, start Phase 3 planning.
