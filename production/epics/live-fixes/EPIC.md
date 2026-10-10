# Epic: Live fixes left over

> **ID**: EP-03
> **Layer**: Core
> **GDD**: docs/v5/AUDIT.md (Live-player bugs), docs/v5/audit/PLAY.md (B3, B5, B6), new design/gdd/practice-fight.md
> **Architecture Module**: src/ui/battlePanel.ts, src/ui/battleHud.ts, src/scenes/BeastTrialScene.ts, src/scenes/ResultsScene.ts, src/scenes/online/*, scripts/layout-check.mjs
> **Status**: Ready
> **Engine Risk**: LOW
> **Stories**: 3, in `docs/v5/plan/STORIES.md` (section EP-03)

## Overview

Closes the bugs that still hurt players on the shipped build: B3 (duel group numerals renumber), B5 (stale Contact-soon banner), B6 (Shoot lit with nothing in range), the Beast Trial legendary farm (I1, V5-011), the black square on the beast field (BTL-2), the Results abandoned-battle notice over the header, and the small-screen war blockers (WAR-1, OnlineArmy group IV at 320x640, the V5-016 fixture) with 320x640 added to the layout check (V5-014).

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0001: Determinism and replay contract | Practice fights stay offline; no sim change. | LOW |

## GDD Requirements

*No `docs/architecture/tr-registry.yaml` exists in this repo. At `standard` rigor only Foundation ADRs are expected, so the IDs below are GDD rule references and untraced rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-live-001 | B3, B5, B6 fixed with tests | No ADR (informational) |
| TR-live-002 | Beast Trial becomes Practice: no loot, gold or pity (V5-011, VISION stakes fix) | No ADR (informational) |
| TR-live-003 | Results notice no longer overlaps the header; BTL-2 gone | No ADR (informational) |
| TR-live-004 | 320x640 in the layout check; WAR-1 and OnlineArmy IV fixed; fixture fixed (V5-014, V5-016) | No ADR (informational) |

## Stories

| # | Story | Type | Status | Est. days (E) | Wave |
|---|-------|------|--------|---------------|------|
| LF-01 | Battle live bugs: B3 duel numerals renumber, B5 stale Contact-soon banner, B6 Shoot lit with nothing in range. | Logic | Ready | 1 | W2 |
| LF-02 | Beast fights: Beast Trial becomes Practice (no loot, gold or pity), BTL-2 black square, Results abandoned notice overlap. | Logic | Ready | 2 | W4 |
| LF-03 | Small-screen war blockers and 320x640 in the layout check (WAR-1, OnlineArmy IV, V5-014, V5-016). | UI | Ready | 1.5 | W7 |

## Definition of Done

This epic is complete when:
- All stories are implemented, reviewed, merged into `v5` by an integrator, and closed via `/story-done`
- All acceptance criteria from the GDD(s) above are verified, experiential ones in QA-03
- All Logic and Integration stories have passing test files in `tests/` (and `server/test/` for server code)
- All UI and Visual/Feel stories have screenshots at 390x844 and 360x780 in `docs/v5/shots/<story-id>/`
- Mechanic stories have `npm run balance` before/after recorded in `docs/v5/balance/<story-id>.md`

## Next Step

Dispatch the stories by wave from `docs/v5/plan/SPRINTS.md`. Each story starts with `/story-readiness` against its row in STORIES.md.
