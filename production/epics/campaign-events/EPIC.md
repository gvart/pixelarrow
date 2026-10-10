# Epic: Overland event deck

> **ID**: EP-09
> **Layer**: Feature
> **GDD**: design/gdd/campaign-events.md
> **Architecture Module**: src/data/events.ts (new), src/data/eventDeck.ts (new), src/world/world.ts, src/game/campaign.ts, src/ui/sheets/eventCard.ts (new)
> **Status**: Ready
> **Engine Risk**: LOW
> **Stories**: 3, in `docs/v5/plan/STORIES.md` (section EP-09)

## Overview

Adds deterministic overland events with 2-3 real choices, lasting flags and a journal. Offline only.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0002: Save migration (to write in ST-02) | Event state rides the v5 save bump; offline only, no sim. | LOW |

## GDD Requirements

*No `docs/architecture/tr-registry.yaml` exists in this repo. At `standard` rigor only Foundation ADRs are expected, so the IDs below are GDD rule references and untraced rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-campaign-events-R1-R3 | Definition, effect vocabulary, triggers, F1 frequency | ADR-0002 (pending) |
| TR-campaign-events-R4 | Event card and pendingEvent persistence | ADR-0002 (pending) |
| TR-campaign-events-R5-R6 | Content bar, starter deck, F2 EV check | No ADR (informational) |

## Stories

| # | Story | Type | Status | Est. days (E) | Wave |
|---|-------|------|--------|---------------|------|
| EV-01 | Event engine: definition, effects, triggers, deterministic draw, pendingEvent, flags and journal (R1-R4 logic, F1). | Logic | Ready | 2.5 | W10 |
| EV-02 | Starter deck content and the EV check (R5, R6, F2). | Config/Data | Ready | 2 | W11 |
| EV-03 | Event card sheet and journal page, with the world, settlement and camp hooks (R4 display). | UI | Ready | 1.5 | W14 |

## Definition of Done

This epic is complete when:
- All stories are implemented, reviewed, merged into `v5` by an integrator, and closed via `/story-done`
- All acceptance criteria from the GDD(s) above are verified, experiential ones in QA-03
- All Logic and Integration stories have passing test files in `tests/` (and `server/test/` for server code)
- All UI and Visual/Feel stories have screenshots at 390x844 and 360x780 in `docs/v5/shots/<story-id>/`
- Mechanic stories have `npm run balance` before/after recorded in `docs/v5/balance/<story-id>.md`

## Next Step

Dispatch the stories by wave from `docs/v5/plan/SPRINTS.md`. Each story starts with `/story-readiness` against its row in STORIES.md.
