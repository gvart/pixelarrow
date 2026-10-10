# Epic: Screens 7: shop and market

> **ID**: EP-19
> **Layer**: Presentation
> **GDD**: design/ux/screens-modes.md M-12, M-13
> **Architecture Module**: src/scenes/ShopScene.ts, src/ui/econ/**, src/scenes/MarketScene.ts
> **Status**: Ready
> **Engine Risk**: LOW
> **Stories**: 2, in `docs/v5/plan/STORIES.md` (section EP-19)

## Overview

Shop hub (Shop, Pass, Wallet) and Market rebuilt; the Market becomes reachable from the Shop hub.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0005: UI kit on the procedural mosaic (to write in F-02) | Kit only. No price or payment change (PROPOSALS.md). | LOW |

## GDD Requirements

*No `docs/architecture/tr-registry.yaml` exists in this repo. At `standard` rigor only Foundation ADRs are expected, so the IDs below are GDD rule references and untraced rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-ux-M12 | Market | No ADR (informational) |
| TR-ux-M13 | Shop hub | No ADR (informational) |

## Stories

| # | Story | Type | Status | Est. days (E) | Wave |
|---|-------|------|--------|---------------|------|
| SHP-01 | Shop hub (Shop, Pass, Wallet) on the kit; Pass opens on the season card; no price change. | UI | Ready | 2.5 | W16 |
| MKT-01 | Market on the kit: listing card, buy confirm, cancel confirm, sell form, town picker. | UI | Ready | 2 | W18 |

## Definition of Done

This epic is complete when:
- All stories are implemented, reviewed, merged into `v5` by an integrator, and closed via `/story-done`
- All acceptance criteria from the GDD(s) above are verified, experiential ones in QA-03
- All Logic and Integration stories have passing test files in `tests/` (and `server/test/` for server code)
- All UI and Visual/Feel stories have screenshots at 390x844 and 360x780 in `docs/v5/shots/<story-id>/`
- Mechanic stories have `npm run balance` before/after recorded in `docs/v5/balance/<story-id>.md`

## Next Step

Dispatch the stories by wave from `docs/v5/plan/SPRINTS.md`. Each story starts with `/story-readiness` against its row in STORIES.md.
