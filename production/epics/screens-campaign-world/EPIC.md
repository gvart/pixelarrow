# Epic: Screens 5: settlements, camp and world

> **ID**: EP-17
> **Layer**: Presentation
> **GDD**: design/ux/screens-campaign.md C-4, C-5, C-6
> **Architecture Module**: src/scenes/WorldScene.ts, src/scenes/CampScene.ts, src/scenes/SettlementScene.ts, src/ui/sheets/* (new)
> **Status**: Ready
> **Engine Risk**: LOW
> **Stories**: 4, in `docs/v5/plan/STORIES.md` (section EP-17)

## Overview

World map, camp and settlement rebuilt on the v5 kit, carrying the new encounter, assault, arc, works and Services/Drillmaster surfaces.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0005: UI kit on the procedural mosaic (to write in F-02) | Kit only; ends the dark v3 chrome family (G7, WLD-2). | LOW |

## GDD Requirements

*No `docs/architecture/tr-registry.yaml` exists in this repo. At `standard` rigor only Foundation ADRs are expected, so the IDs below are GDD rule references and untraced rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-ux-C4 | World map | No ADR (informational) |
| TR-ux-C5 | Camp | No ADR (informational) |
| TR-ux-C6 | Settlement | No ADR (informational) |

## Stories

| # | Story | Type | Status | Est. days (E) | Wave |
|---|-------|------|--------|---------------|------|
| WLD-01 | World map on the v5 chrome with the encounter sheet (doctrine, tell, captain, (i) page). | UI | Ready | 2.5 | W16 |
| WLD-02 | Arc surfaces on the world map: lair plates, Assault sheet, arc chip, host line, Arc sheet, coach marks (O4). | UI | Ready | 2.5 | W17 |
| CMP-01 | Field and war camp on the v5 chrome; supplies for works. | UI | Ready | 2.5 | W17 |
| SET-01 | Settlement: Services with the Drillmaster (retrain), recruit card with hire Undo, vignettes, sacked state. | UI | Ready | 2.5 | W16 |

## Definition of Done

This epic is complete when:
- All stories are implemented, reviewed, merged into `v5` by an integrator, and closed via `/story-done`
- All acceptance criteria from the GDD(s) above are verified, experiential ones in QA-03
- All Logic and Integration stories have passing test files in `tests/` (and `server/test/` for server code)
- All UI and Visual/Feel stories have screenshots at 390x844 and 360x780 in `docs/v5/shots/<story-id>/`
- Mechanic stories have `npm run balance` before/after recorded in `docs/v5/balance/<story-id>.md`

## Next Step

Dispatch the stories by wave from `docs/v5/plan/SPRINTS.md`. Each story starts with `/story-readiness` against its row in STORIES.md.
