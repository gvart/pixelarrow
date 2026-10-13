# Epic: Screens 3: army and hero

> **ID**: EP-15
> **Layer**: Presentation
> **GDD**: design/ux/screens-campaign.md C-7, C-8; design/gdd/abilities.md R1, R7
> **Architecture Module**: src/scenes/ArmyScene.ts, src/ui/army/** (new), src/scenes/HeroScene.ts, src/scenes/heroSource.ts
> **Status**: Ready
> **Engine Risk**: LOW
> **Stories**: 2, in `docs/v5/plan/STORIES.md` (section EP-15)

## Overview

One Army template for campaign, duel team and war army (NAV D6), and the Hero screen with the A/B perk sheet and retrain.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0005: UI kit on the procedural mosaic (to write in F-02) | One Army template reused by S07, S13, S19. | LOW |

## GDD Requirements

*No `docs/architecture/tr-registry.yaml` exists in this repo. At `standard` rigor only Foundation ADRs are expected, so the IDs below are GDD rule references and untraced rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-ux-C7 | Army template | No ADR (informational) |
| TR-ux-C8 | Hero, perk sheet, retrain confirm | No ADR (informational) |

## Stories

| # | Story | Type | Status | Est. days (E) | Wave |
|---|-------|------|--------|---------------|------|
| ARM-01 | The one Army template (C-7) and the campaign Army screen. | UI | Ready | 2.5 | W12 |
| HERO-01 | Hero screen (C-8) with the A/B perk sheet and retrain confirm. | UI | Ready | 2.5 | W13 |

## Definition of Done

This epic is complete when:
- All stories are implemented, reviewed, merged into `v5` by an integrator, and closed via `/story-done`
- All acceptance criteria from the GDD(s) above are verified, experiential ones in QA-03
- All Logic and Integration stories have passing test files in `tests/` (and `server/test/` for server code)
- All UI and Visual/Feel stories have screenshots at 390x844 and 360x780 in `docs/v5/shots/<story-id>/`
- Mechanic stories have `npm run balance` before/after recorded in `docs/v5/balance/<story-id>.md`

## Next Step

Dispatch the stories by wave from `docs/v5/plan/SPRINTS.md`. Each story starts with `/story-readiness` against its row in STORIES.md.
