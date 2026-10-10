# Epic: Economy and balance deferred items

> **ID**: EP-24
> **Layer**: Feature
> **GDD**: docs/v5/vision/GDD_REVIEW.md (Deferred 1-3), docs/v5/balance/BASELINE.md (R1, R3, J1), new design/gdd/forge-reroll.md
> **Architecture Module**: src/game/gear.ts, src/game/economy.ts, src/data/items.ts, src/data/sets.ts, src/data/affixes.ts, src/data/classes.ts, src/data/units.ts
> **Status**: Ready
> **Engine Risk**: MEDIUM
> **Stories**: 4, in `docs/v5/plan/STORIES.md` (section EP-24)

## Overview

The three items deferred by the GDD review (endgame gold sink, item power cap, retrain cost) plus the class re-cost tuning kept out of the expansions (R1 elite trap, R3 militia vs cavalry, J1 missiles).

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0001: Determinism and replay contract | Item and class stat changes are replayed: they ride train 2. | MEDIUM |

## GDD Requirements

*No `docs/architecture/tr-registry.yaml` exists in this repo. At `standard` rigor only Foundation ADRs are expected, so the IDs below are GDD rule references and untraced rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-econ-001 | Forge reroll as the endgame gold sink (W6, MECH E2) | No ADR (informational) |
| TR-econ-002 | Item deltas <= 10 pts (N16) | ADR-0001: Determinism and replay contract |
| TR-econ-003 | Retrain cost revisited after the perk playtest (N17) | No ADR (informational) |
| TR-econ-004 | Class re-cost R1, R3, J1 | ADR-0001: Determinism and replay contract |

## Stories

| # | Story | Type | Status | Est. days (E) | Wave |
|---|-------|------|--------|---------------|------|
| EC-01 | Forge reroll: the endgame gold sink (GDD first), campaign only. | Logic | Ready | 3 | W19 |
| EC-02 | Item power cap check: item deltas <= 10 pts (N16). | Config/Data | Ready | 2 | W13 |
| EC-03 | Retrain cost scaling after the perk playtest (N17). | Config/Data | Ready | 0.5 | W23 |
| EC-04 | Class re-cost and missile tuning: elite trap (R1), militia vs cavalry (R3), archers/slingers (J1). | Config/Data | Ready | 2 | W12 |

## Definition of Done

This epic is complete when:
- All stories are implemented, reviewed, merged into `v5` by an integrator, and closed via `/story-done`
- All acceptance criteria from the GDD(s) above are verified, experiential ones in QA-03
- All Logic and Integration stories have passing test files in `tests/` (and `server/test/` for server code)
- All UI and Visual/Feel stories have screenshots at 390x844 and 360x780 in `docs/v5/shots/<story-id>/`
- Mechanic stories have `npm run balance` before/after recorded in `docs/v5/balance/<story-id>.md`

## Next Step

Dispatch the stories by wave from `docs/v5/plan/SPRINTS.md`. Each story starts with `/story-readiness` against its row in STORIES.md.
