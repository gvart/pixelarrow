# Epic: Screens 1: hubs and navigation

> **ID**: EP-13
> **Layer**: Presentation
> **GDD**: design/ux/ia.md, design/ux/screen-flow.md, design/ux/screens-campaign.md C-3, docs/v5/ux/HUB_DIRECTIONS.md
> **Architecture Module**: src/scenes/MenuScene.ts, src/scenes/BaseScene.ts, src/platform/nav.ts, src/ui/mosaic/TabBar.ts, tabLayout.ts, subShell.ts, hub.ts
> **Status**: Ready
> **Engine Risk**: LOW
> **Stories**: 2, in `docs/v5/plan/STORIES.md` (section EP-13)

## Overview

The five tabs as roots, one Back and modal contract, and the Campaign hub rebuilt in the direction the Director picks after AS-01.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0005: UI kit on the procedural mosaic (to write in F-02) | Built from the v5 kit only. | LOW |

## GDD Requirements

*No `docs/architecture/tr-registry.yaml` exists in this repo. At `standard` rigor only Foundation ADRs are expected, so the IDs below are GDD rule references and untraced rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-ia-1-6 | Tabs, homes, names, Back and modal contract | No ADR (informational) |
| TR-ux-C3 | Campaign hub spec C-3 | No ADR (informational) |

## Stories

| # | Story | Type | Status | Est. days (E) | Wave |
|---|-------|------|--------|---------------|------|
| HUB-01 | Tab bar, hub roots and the Back and modal contract (ia.md §2, §6). | UI | Ready | 2 | W9 |
| HUB-02 | Campaign hub (S03, C-3) in the direction picked after AS-01. | UI | Ready | 2 | W10 |

## Definition of Done

This epic is complete when:
- All stories are implemented, reviewed, merged into `v5` by an integrator, and closed via `/story-done`
- All acceptance criteria from the GDD(s) above are verified, experiential ones in QA-03
- All Logic and Integration stories have passing test files in `tests/` (and `server/test/` for server code)
- All UI and Visual/Feel stories have screenshots at 390x844 and 360x780 in `docs/v5/shots/<story-id>/`
- Mechanic stories have `npm run balance` before/after recorded in `docs/v5/balance/<story-id>.md`

## Next Step

Dispatch the stories by wave from `docs/v5/plan/SPRINTS.md`. Each story starts with `/story-readiness` against its row in STORIES.md.
