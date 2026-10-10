# Epic: Screens 2: tutorial and first run

> **ID**: EP-14
> **Layer**: Presentation
> **GDD**: design/ux/screens-campaign.md C-1, C-2; design/gdd/controls.md; design/gdd/battle-readability.md
> **Architecture Module**: src/scenes/FirstRunScene.ts, src/scenes/BootScene.ts, src/ui/tutorial/** (not onlineCoach.ts), src/game/tutorial.ts
> **Status**: Ready
> **Engine Risk**: LOW
> **Stories**: 2, in `docs/v5/plan/STORIES.md` (section EP-14)

## Overview

First run with real key art and an honest mode choice, and a tutorial that teaches the v5 controls and readouts. Fixes FR-1, FR-3, O2-O5, TUT-1, TUT-2.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0005: UI kit on the procedural mosaic (to write in F-02) | Kit only. | LOW |

## GDD Requirements

*No `docs/architecture/tr-registry.yaml` exists in this repo. At `standard` rigor only Foundation ADRs are expected, so the IDs below are GDD rule references and untraced rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-ux-C1-C2 | Boot error + Retry, First run | No ADR (informational) |
| TR-tutorial | Tutorial teaches knob face, focus, undo, Then, morale glyph, flank arcs | No ADR (informational) |

## Stories

| # | Story | Type | Status | Est. days (E) | Wave |
|---|-------|------|--------|---------------|------|
| TUT-01 | First run and Boot (S01, S02): key art, honest mode choice, Boot error + Retry. | UI | Ready | 1.5 | W11 |
| TUT-02 | Tutorial teaches the v5 controls and readouts; narrator dock; skip confirm; flank step fixed. | UI | Ready | 3 | W17 |

## Definition of Done

This epic is complete when:
- All stories are implemented, reviewed, merged into `v5` by an integrator, and closed via `/story-done`
- All acceptance criteria from the GDD(s) above are verified, experiential ones in QA-03
- All Logic and Integration stories have passing test files in `tests/` (and `server/test/` for server code)
- All UI and Visual/Feel stories have screenshots at 390x844 and 360x780 in `docs/v5/shots/<story-id>/`
- Mechanic stories have `npm run balance` before/after recorded in `docs/v5/balance/<story-id>.md`

## Next Step

Dispatch the stories by wave from `docs/v5/plan/SPRINTS.md`. Each story starts with `/story-readiness` against its row in STORIES.md.
