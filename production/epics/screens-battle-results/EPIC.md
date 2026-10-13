# Epic: Screens 4: battle HUD chrome and Results

> **ID**: EP-16
> **Layer**: Presentation
> **GDD**: design/ux/hud.md, design/ux/screens-campaign.md C-9, C-10
> **Architecture Module**: src/ui/battleHud.ts, src/ui/battlePanel.ts, src/scenes/BattleScene.ts, src/ui/sheets/battleMenu.ts (new), src/scenes/ResultsScene.ts, src/ui/results/** (new)
> **Status**: Ready
> **Engine Risk**: LOW
> **Stories**: 2, in `docs/v5/plan/STORIES.md` (section EP-16)

## Overview

The Battle HUD moves to the v5 kit and the hud.md zones with the battle menu (IA), and Results is rebuilt with the Victory variant and the why-line.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0005: UI kit on the procedural mosaic (to write in F-02) | Kit only; HUD zones per hud.md. | LOW |

## GDD Requirements

*No `docs/architecture/tr-registry.yaml` exists in this repo. At `standard` rigor only Foundation ADRs are expected, so the IDs below are GDD rule references and untraced rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-hud-A-L | HUD zones, states, budget, a11y | No ADR (informational) |
| TR-ux-C10 | Results | No ADR (informational) |

## Stories

| # | Story | Type | Status | Est. days (E) | Wave |
|---|-------|------|--------|---------------|------|
| BTL-01 | Battle HUD on the v5 kit per hud.md: zones, the battle menu, paused pill vs boss bar, Retreat rename. | UI | Ready | 3 | W16 |
| RES-01 | Results rebuilt (C-10): Victory variant, why-line hierarchy, honest losses, hero rule, spoils empty state. | UI | Ready | 2.5 | W17 |

## Definition of Done

This epic is complete when:
- All stories are implemented, reviewed, merged into `v5` by an integrator, and closed via `/story-done`
- All acceptance criteria from the GDD(s) above are verified, experiential ones in QA-03
- All Logic and Integration stories have passing test files in `tests/` (and `server/test/` for server code)
- All UI and Visual/Feel stories have screenshots at 390x844 and 360x780 in `docs/v5/shots/<story-id>/`
- Mechanic stories have `npm run balance` before/after recorded in `docs/v5/balance/<story-id>.md`

## Next Step

Dispatch the stories by wave from `docs/v5/plan/SPRINTS.md`. Each story starts with `/story-readiness` against its row in STORIES.md.
