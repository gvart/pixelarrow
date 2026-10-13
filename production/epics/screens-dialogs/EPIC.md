# Epic: Screens 9: remaining dialogs

> **ID**: EP-21
> **Layer**: Presentation
> **GDD**: design/ux/screens-modes.md M-15, design/ux/screen-flow.md sheets register
> **Architecture Module**: src/ui/settings.ts, src/ui/notifySettings.ts, src/ui/legal.ts, src/ui/lang.ts, src/ui/duelInvites.ts, src/ui/online.ts
> **Status**: Ready
> **Engine Risk**: LOW
> **Stories**: 2, in `docs/v5/plan/STORIES.md` (section EP-21)

## Overview

The Settings sheet with the accessibility toggles, and every remaining sheet on the kit, with the i18n gaps closed (G12).

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0005: UI kit on the procedural mosaic (to write in F-02) | Kit overlays only. | LOW |

## GDD Requirements

*No `docs/architecture/tr-registry.yaml` exists in this repo. At `standard` rigor only Foundation ADRs are expected, so the IDs below are GDD rule references and untraced rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-ux-M15 | Settings sheet | No ADR (informational) |
| TR-ux-sheets | All 68 sheets on kit overlays; one sheet + one confirm | No ADR (informational) |

## Stories

| # | Story | Type | Status | Est. days (E) | Wave |
|---|-------|------|--------|---------------|------|
| DLG-01 | Settings sheet with accessibility toggles, Notifications, About, New-campaign confirm (M-15). | UI | Ready | 2 | W15 |
| DLG-02 | Every remaining sheet on kit overlays and the i18n gaps (G12). | UI | Ready | 2 | W20 |

## Definition of Done

This epic is complete when:
- All stories are implemented, reviewed, merged into `v5` by an integrator, and closed via `/story-done`
- All acceptance criteria from the GDD(s) above are verified, experiential ones in QA-03
- All Logic and Integration stories have passing test files in `tests/` (and `server/test/` for server code)
- All UI and Visual/Feel stories have screenshots at 390x844 and 360x780 in `docs/v5/shots/<story-id>/`
- Mechanic stories have `npm run balance` before/after recorded in `docs/v5/balance/<story-id>.md`

## Next Step

Dispatch the stories by wave from `docs/v5/plan/SPRINTS.md`. Each story starts with `/story-readiness` against its row in STORIES.md.
