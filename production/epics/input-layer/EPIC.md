# Epic: Input layer

> **ID**: EP-02
> **Layer**: Foundation
> **GDD**: design/gdd/controls.md (R1, R2, R11), design/ux/interaction-patterns.md
> **Architecture Module**: src/ui/input/** (new), src/ui/dragFormation.ts, src/ui/hover.ts (new), scripts/layout-check.mjs target rules
> **Status**: Ready
> **Engine Risk**: MEDIUM
> **Stories**: 2, in `docs/v5/plan/STORIES.md` (section EP-02)

## Overview

Pulls battle pointer handling out of the 3,061-line `BattleScene.ts` into `src/ui/input/` with a pure hit-test function, so the controls epic can change behaviour safely and in parallel with HUD work. Adds the menu and map input contract: 44 pt targets checked automatically, hover tooltips on desktop, and the v3 container-origin hit-area quirk fixed.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0004: Battle input layer (to write in IN-01) | Pointer routing, the hit-test priority and gestures live in pure, tested modules outside BattleScene. | MEDIUM |
| ADR-0003: Engine version (Rejected: stay on Phaser 3.90) | Phaser 3.90 input APIs. | LOW |

## GDD Requirements

*No `docs/architecture/tr-registry.yaml` exists in this repo. At `standard` rigor only Foundation ADRs are expected, so the IDs below are GDD rule references and untraced rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-input-001 | Battle pointer router + gesture recogniser (tap, drag, pan, pinch) behaviour-preserving | ADR-0004 (pending) |
| TR-input-002 | Pure hit-test function with the controls R1 priority, unit-tested | ADR-0004 (pending) |
| TR-input-003 | 44x44 pt targets and 4/8 pt spacing enforced by layout-check (A11Y-06, 07) | No ADR (informational) |
| TR-input-004 | Hover shows tooltips on desktop; nothing is long-press only (A11Y-15) | No ADR (informational) |

## Stories

| # | Story | Type | Status | Est. days (E) | Wave |
|---|-------|------|--------|---------------|------|
| IN-01 | Extract battle pointer handling into `src/ui/input/` with a pure hit-test; delete the radial ring; ADR-0004. | Integration | Ready | 2.5 | W1 |
| IN-02 | Menu and map input contract: 44 pt targets and spacing in layout-check, desktop hover tooltips, v3 hit-area quirk. | Integration | Ready | 1.5 | W8 |

## Definition of Done

This epic is complete when:
- All stories are implemented, reviewed, merged into `v5` by an integrator, and closed via `/story-done`
- All acceptance criteria from the GDD(s) above are verified, experiential ones in QA-03
- All Logic and Integration stories have passing test files in `tests/` (and `server/test/` for server code)
- All UI and Visual/Feel stories have screenshots at 390x844 and 360x780 in `docs/v5/shots/<story-id>/`
- Mechanic stories have `npm run balance` before/after recorded in `docs/v5/balance/<story-id>.md`

## Next Step

Dispatch the stories by wave from `docs/v5/plan/SPRINTS.md`. Each story starts with `/story-readiness` against its row in STORIES.md.
