# Epic: Feel and audio

> **ID**: EP-23
> **Layer**: Polish
> **GDD**: design/gdd/battle-readability.md R4, R6; design/ux/interaction-patterns.md (Animation, Sound)
> **Architecture Module**: src/ui/battleFx.ts, src/ui/motion.ts, src/scenes/BaseScene.ts, src/audio/**
> **Status**: Ready
> **Engine Risk**: LOW
> **Stories**: 4, in `docs/v5/plan/STORIES.md` (section EP-23)

## Overview

Juice tiers on impact, rout and ability, scene transitions and button responses, the sound mix, and a final balance re-run. Fixes PLAY F1, F3.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0001: Determinism and replay contract | Hit-stop never pauses the sim tick. | LOW |

## GDD Requirements

*No `docs/architecture/tr-registry.yaml` exists in this repo. At `standard` rigor only Foundation ADRs are expected, so the IDs below are GDD rule references and untraced rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-battle-readability-R4-juice | Juice tiers, F1 shake, Reduce shake/flash | No ADR (informational) |
| TR-battle-readability-R6 | Scene transitions | No ADR (informational) |
| TR-audio | Buses, ducking, horn, rout, ability, UI sounds | No ADR (informational) |

## Stories

| # | Story | Type | Status | Est. days (E) | Wave |
|---|-------|------|--------|---------------|------|
| FL-01 | Juice tiers: charge hit-stop and shake, rout shake and dust, ability flash ring; Reduce shake and flash (R4, F1). | Visual/Feel | Ready | 2 | W18 |
| FL-02 | Scene transitions, button press responses, sheet slides; reduced motion cuts (R6, A11Y-12). | Visual/Feel | Ready | 2 | W20 |
| FL-03 | Audio: buses and ducking, horn, rout, ability, works and UI sounds, haptics map. | Visual/Feel | Ready | 2.5 | W19 |
| FL-04 | Feel pass check: balance re-run (Phase 7) and the regression guard for presentation-only work. | Config/Data | Ready | 1 | W21 |

## Definition of Done

This epic is complete when:
- All stories are implemented, reviewed, merged into `v5` by an integrator, and closed via `/story-done`
- All acceptance criteria from the GDD(s) above are verified, experiential ones in QA-03
- All Logic and Integration stories have passing test files in `tests/` (and `server/test/` for server code)
- All UI and Visual/Feel stories have screenshots at 390x844 and 360x780 in `docs/v5/shots/<story-id>/`
- Mechanic stories have `npm run balance` before/after recorded in `docs/v5/balance/<story-id>.md`

## Next Step

Dispatch the stories by wave from `docs/v5/plan/SPRINTS.md`. Each story starts with `/story-readiness` against its row in STORIES.md.
