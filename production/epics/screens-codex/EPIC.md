# Epic: Screens 8: Codex

> **ID**: EP-20
> **Layer**: Presentation
> **GDD**: design/ux/screens-modes.md M-1, design/ux/ia.md §4
> **Architecture Module**: src/scenes/CodexScene.ts, src/scenes/BeastTrialScene.ts, src/ui/beastInfo.ts
> **Status**: Ready
> **Engine Risk**: LOW
> **Stories**: 1, in `docs/v5/plan/STORIES.md` (section EP-20)

## Overview

Codex becomes the one home of beasts and doctrines; Trial fight is an action on the beast sheet (V5-029).

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0005: UI kit on the procedural mosaic (to write in F-02) | Kit only. | LOW |

## GDD Requirements

*No `docs/architecture/tr-registry.yaml` exists in this repo. At `standard` rigor only Foundation ADRs are expected, so the IDs below are GDD rule references and untraced rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-ux-M1 | Codex hub, beast sheet, doctrine sheet | No ADR (informational) |

## Stories

| # | Story | Type | Status | Est. days (E) | Wave |
|---|-------|------|--------|---------------|------|
| CDX-01 | Codex hub (Beasts, Doctrines), beast sheet with Trial fight (Practice), doctrine sheet; BeastTrial list retired. | UI | Ready | 2.5 | W15 |

## Definition of Done

This epic is complete when:
- All stories are implemented, reviewed, merged into `v5` by an integrator, and closed via `/story-done`
- All acceptance criteria from the GDD(s) above are verified, experiential ones in QA-03
- All Logic and Integration stories have passing test files in `tests/` (and `server/test/` for server code)
- All UI and Visual/Feel stories have screenshots at 390x844 and 360x780 in `docs/v5/shots/<story-id>/`
- Mechanic stories have `npm run balance` before/after recorded in `docs/v5/balance/<story-id>.md`

## Next Step

Dispatch the stories by wave from `docs/v5/plan/SPRINTS.md`. Each story starts with `/story-readiness` against its row in STORIES.md.
