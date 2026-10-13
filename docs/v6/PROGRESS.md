# v6 progress

- **Line:** branch `v6` in the worktree `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/v6`
- **Phase:** 0 (setup) and 1 (audit), running in parallel
- **Port slots** (V6-002): slot 1 = 6110–6119, slot 2 = 6120–6129, slot 3 = 6130–6139, slot 4 = 6140–6149
- **Chrome and Gemini:** checked 2026-10-13. Signed in and working.

## Running

| Agent | Story | Slot | Skills |
| --- | --- | --- | --- |
| assets | P5-LAND-ART: hero parallax layers, OG image, favicon, ASSET_SPEC, into landing/assets-staging. Owns Chrome. | none | create-game-assets, asset-spec, asset-audit, chrome-browser |
| video | P5-VIDEO: 11 landing clips, landing/assets-staging/video | 2 (6120–6129) | create-game-assets, performance-optimization |
| planner | P3-PLAN: epics, stories, ARCH_REVIEW, SPRINTS (told to fill the responsive epics after A1-UI) | none | create-epics, create-stories, sprint-plan, architecture-review, estimate |
| ux-landscape | P2-UX-LAND: design/ux/landscape-v6.md | none | game-ui-ux, ux-design, camera-systems, ux-review, design-principles |

## Merged

- S0-ADOPT, A1-PLAT, A1-UI (V6-018)
- P2-ARCH-PLAT (V6-012), P2-DOCS (V6-013), P2-ARCH-ACCT (V6-014), P2-LAND (V6-015), P2-UX-INPUT (V6-016), P2-UX-ACCT (V6-017)

## Housekeeping

- The worktree agent-a37963953686eb60b was locked by the harness at merge time; remove it and its branch later.
- `.claude/worktrees/v6-shots/` holds 850 MB of audit screenshots. Keep them until ux-landscape is merged, then prune.

## Queue

1. Merge ux-landscape and planner. Make sure the sprint plan's sprint 1 is file-disjoint.
2. Sprint 1 (code begins; every code merge goes through an integrator with all the gates): platform core, layout-check matrix and responsive foundation, the landing scaffold (moving assets-staging in), the PBKDF2 spike.
3. Combine docs/v6/audit/* into AUDIT.md (small docs task; can ride along with the integrator).

## Next tick

Collect the reports from planner, ux-landscape, assets and video. Merge the docs. Then dispatch sprint 1 from docs/v6/plan/SPRINTS.md (at most 4 agents, each with its port slot and skill paths, asking for concrete "Skills applied" guidance).
