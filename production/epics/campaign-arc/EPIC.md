# Epic: Campaign arc

> **ID**: EP-08
> **Layer**: Feature
> **GDD**: design/gdd/campaign-arc.md
> **Architecture Module**: src/game/heroes.ts, src/game/campaign.ts, src/world/world.ts, src/world/battlefield.ts, src/world/map.ts, src/data/arc.ts (new), src/game/sources.ts
> **Status**: Ready
> **Engine Risk**: LOW
> **Stories**: 4, in `docs/v5/plan/STORIES.md` (section EP-08)

## Overview

Gives the campaign a start that sells formations (8 men), lairs to assault, tier-3 bands, offline set sources, and an end state: the Tyrant's host. Fixes PLAY O1, MECH C2, C3, C6, I2.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0002: Save migration (to write in ST-02) | Arc fields ride the one v5 save bump. | LOW |
| ADR-0001: Determinism and replay contract | Assault terrain cells come from field works (train 2). | LOW |

## GDD Requirements

*No `docs/architecture/tr-registry.yaml` exists in this repo. At `standard` rigor only Foundation ADRs are expected, so the IDs below are GDD rule references and untraced rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-campaign-arc-R1 | Opening: 8 men, band resize, volunteers | ADR-0002 (pending) |
| TR-campaign-arc-R2 | Lairs as assault targets, garrisons, regrowth | ADR-0002 (pending) |
| TR-campaign-arc-R3-R7 | Tier 3, offline item sources, level pacing | ADR-0002 (pending) |
| TR-campaign-arc-R4-R5 | Arc doctrines and the host | ADR-0002 (pending) |

## Stories

| # | Story | Type | Status | Est. days (E) | Wave |
|---|-------|------|--------|---------------|------|
| AR-01 | The 8-man opening, band resize, volunteers and the volunteer floor, start food (R1). | Logic | Ready | 1.5 | W8 |
| AR-02 | Lairs as assault targets: garrisons, GARRISON_STAKES, regrowth and the assault battlefield (R2, F1, F3). | Logic | Ready | 3 | W13 |
| AR-03 | Tier 3 and late scaling, offline set sources, level pacing (R3, R6, R7). | Logic | Ready | 2 | W12 |
| AR-04 | The Tyrant's host and the end state, arc doctrines, post-game reborn lairs (R4, R5, F2, H3). | Logic | Ready | 2.5 | W15 |

## Definition of Done

This epic is complete when:
- All stories are implemented, reviewed, merged into `v5` by an integrator, and closed via `/story-done`
- All acceptance criteria from the GDD(s) above are verified, experiential ones in QA-03
- All Logic and Integration stories have passing test files in `tests/` (and `server/test/` for server code)
- All UI and Visual/Feel stories have screenshots at 390x844 and 360x780 in `docs/v5/shots/<story-id>/`
- Mechanic stories have `npm run balance` before/after recorded in `docs/v5/balance/<story-id>.md`

## Next Step

Dispatch the stories by wave from `docs/v5/plan/SPRINTS.md`. Each story starts with `/story-readiness` against its row in STORIES.md.
