# Epic: Battle readability

> **ID**: EP-12
> **Layer**: Presentation
> **GDD**: design/gdd/battle-readability.md, design/ux/hud.md
> **Architecture Module**: src/ui/battleHud.ts, src/ui/battlePanel.ts, src/ui/battleFx.ts, src/game/report.ts
> **Status**: Ready
> **Engine Risk**: LOW
> **Stories**: 3, in `docs/v5/plan/STORIES.md` (section EP-12)

## Overview

Makes morale, flanks and the turning point readable at a glance: the morale glyph, badges, labelled card bars, flank arcs before and after contact, banners that expire, merged auto-pauses, and a why-line on Results. Fixes PLAY R1-R4, O5, UI BTL-11, G13.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0001: Determinism and replay contract | Presentation only; reads sim events, never part of the hash. | LOW |

## GDD Requirements

*No `docs/architecture/tr-registry.yaml` exists in this repo. At `standard` rigor only Foundation ADRs are expected, so the IDs below are GDD rule references and untraced rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-battle-readability-R1-R3 | Glyph, badges, card readout, F2 | No ADR (informational) |
| TR-battle-readability-R4 | Field events (non-juice part) | No ADR (informational) |
| TR-battle-readability-R5 | Why line | No ADR (informational) |

## Stories

| # | Story | Type | Status | Est. days (E) | Wave |
|---|-------|------|--------|---------------|------|
| RD-01 | Morale glyph, badges and the group card readout with labelled bars (R1-R3, F2). | UI | Ready | 2 | W11 |
| RD-02 | Field events: flank arcs before and after contact, banner expiry, auto-pause merge, damage numbers on charges and kills only (R4). | UI | Ready | 2 | W12 |
| RD-03 | The why-line: report rules and the Results line (R5). | Logic | Ready | 1.5 | W14 |

## Definition of Done

This epic is complete when:
- All stories are implemented, reviewed, merged into `v5` by an integrator, and closed via `/story-done`
- All acceptance criteria from the GDD(s) above are verified, experiential ones in QA-03
- All Logic and Integration stories have passing test files in `tests/` (and `server/test/` for server code)
- All UI and Visual/Feel stories have screenshots at 390x844 and 360x780 in `docs/v5/shots/<story-id>/`
- Mechanic stories have `npm run balance` before/after recorded in `docs/v5/balance/<story-id>.md`

## Next Step

Dispatch the stories by wave from `docs/v5/plan/SPRINTS.md`. Each story starts with `/story-readiness` against its row in STORIES.md.
