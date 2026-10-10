# Epic: Field works

> **ID**: EP-10
> **Layer**: Feature
> **GDD**: design/gdd/field-works.md
> **Architecture Module**: src/data/terrain.ts, src/sim/terrain.ts, src/sim/battle.ts, src/sim/ai.ts, src/game/campaign.ts, src/ui/battlePanel.ts
> **Status**: Ready
> **Engine Risk**: MEDIUM
> **Stories**: 3, in `docs/v5/plan/STORIES.md` (section EP-10)

## Overview

Stakes, ditch and wagon laager bought from camp supplies and placed at deployment: a deployment decision that answers cavalry and flanks. Offline only in v5 (V5-022).

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0001: Determinism and replay contract | New terrain codes and work/unwork orders: train 2. | MEDIUM |

## GDD Requirements

*No `docs/architecture/tr-registry.yaml` exists in this repo. At `standard` rigor only Foundation ADRs are expected, so the IDs below are GDD rule references and untraced rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-field-works-R1-R3 | Cell kinds, special rules, work order | ADR-0001: Determinism and replay contract |
| TR-field-works-R4-R6 | Allowance, cost, readability, bot placement | ADR-0001: Determinism and replay contract |
| TR-field-works-UI | Works tray, tap-a-cell + check, undo refunds (controls R7) | ADR-0004 (pending) |

## Stories

| # | Story | Type | Status | Est. days (E) | Wave |
|---|-------|------|--------|---------------|------|
| FW-01 | Works cell kinds, special rules and the work/unwork order (R1-R3, F1, F2). | Logic | Ready | 2.5 | W10 |
| FW-02 | Works allowance and supplies, garrison allowance and bot placement (R4, R6, F3). | Logic | Ready | 2 | W11 |
| FW-03 | Works tray and placement in deployment: tap-a-cell + check, undo refunds, Inspect tooltip; works art wired. | UI | Ready | 2.5 | W14 |

## Definition of Done

This epic is complete when:
- All stories are implemented, reviewed, merged into `v5` by an integrator, and closed via `/story-done`
- All acceptance criteria from the GDD(s) above are verified, experiential ones in QA-03
- All Logic and Integration stories have passing test files in `tests/` (and `server/test/` for server code)
- All UI and Visual/Feel stories have screenshots at 390x844 and 360x780 in `docs/v5/shots/<story-id>/`
- Mechanic stories have `npm run balance` before/after recorded in `docs/v5/balance/<story-id>.md`

## Next Step

Dispatch the stories by wave from `docs/v5/plan/SPRINTS.md`. Each story starts with `/story-readiness` against its row in STORIES.md.
