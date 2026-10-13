# Epic: Formations and orders

> **ID**: EP-06
> **Layer**: Feature
> **GDD**: design/gdd/formations-orders.md
> **Architecture Module**: src/sim/battle.ts, src/sim/formation.ts
> **Status**: Ready
> **Engine Risk**: MEDIUM
> **Stories**: 3, in `docs/v5/plan/STORIES.md` (section EP-06)

## Overview

Adds counter-play to flanks and missile priority: `face` that keeps the order (MECH B2), the orb, the feint, focus fire, group cohesion and the army-break rule that ends dead fights.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0001: Determinism and replay contract | face, focus, feint, orb, cohesion and army break change Battle.hash(): train 2. | MEDIUM |

## GDD Requirements

*No `docs/architecture/tr-registry.yaml` exists in this repo. At `standard` rigor only Foundation ADRs are expected, so the IDs below are GDD rule references and untraced rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-formations-orders-R1 | face and the order-reset fix | ADR-0001: Determinism and replay contract |
| TR-formations-orders-R2 | orb | ADR-0001: Determinism and replay contract |
| TR-formations-orders-R3 | feint and disordered | ADR-0001: Determinism and replay contract |
| TR-formations-orders-R4 | focus fire, focusOutOfRange | ADR-0001: Determinism and replay contract |
| TR-formations-orders-R5-R7 | cohesion, army break, events | ADR-0001: Determinism and replay contract |

## Stories

| # | Story | Type | Status | Est. days (E) | Wave |
|---|-------|------|--------|---------------|------|
| FO-01 | `face` that keeps the order (MECH B2) and focus fire with `focusOutOfRange` (R1, R4). | Logic | Ready | 2.5 | W3 |
| FO-02 | The orb and the feint with the disordered state (R2, R3, F1). | Logic | Ready | 2.5 | W4 |
| FO-03 | Group cohesion and the army-break rule with their events (R5-R7, F2, F3). | Logic | Ready | 2 | W6 |

## Definition of Done

This epic is complete when:
- All stories are implemented, reviewed, merged into `v5` by an integrator, and closed via `/story-done`
- All acceptance criteria from the GDD(s) above are verified, experiential ones in QA-03
- All Logic and Integration stories have passing test files in `tests/` (and `server/test/` for server code)
- All UI and Visual/Feel stories have screenshots at 390x844 and 360x780 in `docs/v5/shots/<story-id>/`
- Mechanic stories have `npm run balance` before/after recorded in `docs/v5/balance/<story-id>.md`

## Next Step

Dispatch the stories by wave from `docs/v5/plan/SPRINTS.md`. Each story starts with `/story-readiness` against its row in STORIES.md.
