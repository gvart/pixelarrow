# Epic: Screens 6: duels and war

> **ID**: EP-18
> **Layer**: Presentation
> **GDD**: design/ux/screens-modes.md M-2 .. M-11
> **Architecture Module**: src/scenes/duel/**, src/scenes/online/**
> **Status**: Ready
> **Engine Risk**: LOW
> **Stories**: 4, in `docs/v5/plan/STORIES.md` (section EP-18)

## Overview

Duels hub and its sub-screens, and the War hub, war army, clan and merchant on the v5 kit.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0005: UI kit on the procedural mosaic (to write in F-02) | Kit only. | LOW |
| ADR-0001: Determinism and replay contract | No rule change; UI only. | LOW |

## GDD Requirements

*No `docs/architecture/tr-registry.yaml` exists in this repo. At `standard` rigor only Foundation ADRs are expected, so the IDs below are GDD rule references and untraced rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-ux-M2-M7 | Duels | No ADR (informational) |
| TR-ux-M8-M11 | War, clan, merchant | No ADR (informational) |

## Stories

| # | Story | Type | Status | Est. days (E) | Wave |
|---|-------|------|--------|---------------|------|
| DUE-01 | Duels hub (Ladder, Arena), Team on the Army template, Armoury rename, ladder countdown. | UI | Ready | 3.5 | W18 |
| DUE-02 | Duels Leaderboard, Raid picks, Search/Found (S15-S17) and the medal colours (DUE-3). | UI | Ready | 2 | W19 |
| WAR-01 | War hub and War army on the Army template, garrison picker, hex panel and lobby sheets, coach marks. | UI | Ready | 3.5 | W18 |
| WAR-02 | Clan and Merchant on the kit, ClanScene fully in i18n (G12). | UI | Ready | 2 | W19 |

## Definition of Done

This epic is complete when:
- All stories are implemented, reviewed, merged into `v5` by an integrator, and closed via `/story-done`
- All acceptance criteria from the GDD(s) above are verified, experiential ones in QA-03
- All Logic and Integration stories have passing test files in `tests/` (and `server/test/` for server code)
- All UI and Visual/Feel stories have screenshots at 390x844 and 360x780 in `docs/v5/shots/<story-id>/`
- Mechanic stories have `npm run balance` before/after recorded in `docs/v5/balance/<story-id>.md`

## Next Step

Dispatch the stories by wave from `docs/v5/plan/SPRINTS.md`. Each story starts with `/story-readiness` against its row in STORIES.md.
