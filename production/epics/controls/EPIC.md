# Epic: Battle controls (touch first)

> **ID**: EP-11
> **Layer**: Feature
> **GDD**: design/gdd/controls.md
> **Architecture Module**: src/ui/input/**, src/ui/dragFormation.ts, src/ui/battlePanel.ts, src/ui/battleHud.ts, src/ui/orderQueue.ts (new), src/ui/battleCamera.ts (new), src/scenes/BattleScene.ts, src/duel/ladder.ts, server/src/duel/*
> **Status**: Ready
> **Engine Risk**: MEDIUM
> **Stories**: 7, in `docs/v5/plan/STORIES.md` (section EP-11)

## Overview

Fast, clear, forgiving orders on a phone: selection priority, the knob sends face, targeting and focus, undo, previews, paused staging and one queued Then step, a camera that keeps the enemy and your groups in view, pause and speed rules (ladder pause, 30-minute ticket), the attention budget and accessibility. Fixes PLAY C1-C8, K1, K2, MECH B2 on the input side, P2.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0004: Battle input layer (to write in IN-01) | Input via src/ui/input; orders are ordinary Orders, no sim change of its own. | MEDIUM |
| ADR-0001: Determinism and replay contract | Uses train-2 orders (face, focus). | LOW |

## GDD Requirements

*No `docs/architecture/tr-registry.yaml` exists in this repo. At `standard` rigor only Foundation ADRs are expected, so the IDs below are GDD rule references and untraced rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-controls-R1-R2-R9 | Selection, drag to order, order bar | ADR-0004 (pending) |
| TR-controls-R3 | Targeting and focus | ADR-0004 (pending) |
| TR-controls-R4 | Undo and confirm | ADR-0004 (pending) |
| TR-controls-R5-R6 | Previews, paused staging, Then queue | ADR-0004 (pending) |
| TR-controls-R7 | Deployment tools (with FW-03) | ADR-0004 (pending) |
| TR-controls-R8 | Camera | No ADR (informational) |
| TR-controls-R10 | Who may pause, speeds, ticket TTL | ADR-0001: Determinism and replay contract |
| TR-controls-R10b-R11 | Attention budget, accessibility | No ADR (informational) |

## Stories

| # | Story | Type | Status | Est. days (E) | Wave |
|---|-------|------|--------|---------------|------|
| CT-01 | Selection priority, the knob sends face, order bar in the group's colour and numeral, no empty group cards (R1, R2, R9). | Logic | Ready | 2 | W5 |
| CT-02 | Targeting: tap enemy to attack, focus reticle, range ring, out-of-range card state, Advance-to-range chip (R3). | UI | Ready | 2 | W7 |
| CT-03 | Undo: a 3 s chip after every order and a 10-step deployment stack; confirm only global or irreversible actions (R4). | Logic | Ready | 2 | W8 |
| CT-04 | Previews, paused staging and the one-step Then queue (R5, R6, F1). | Logic | Ready | 3 | W10 |
| CT-05 | Battle camera: opening zoom shows the enemy, follow keeps the selected group, edge pointers (R8, F2). | Logic | Ready | 1.5 | W9 |
| CT-06 | Who may pause: realtimeLocked split, ladder pause and 2x, 0.5x speed, ticket TTL 30 min with countdown (R10, V5-021). | Integration | Ready | 2 | W15 |
| CT-07 | Orb and Feint buttons, the attention budget, left-hand mirror and single-tap alternatives (R10b, R11). | UI | Ready | 2.5 | W13 |

## Definition of Done

This epic is complete when:
- All stories are implemented, reviewed, merged into `v5` by an integrator, and closed via `/story-done`
- All acceptance criteria from the GDD(s) above are verified, experiential ones in QA-03
- All Logic and Integration stories have passing test files in `tests/` (and `server/test/` for server code)
- All UI and Visual/Feel stories have screenshots at 390x844 and 360x780 in `docs/v5/shots/<story-id>/`
- Mechanic stories have `npm run balance` before/after recorded in `docs/v5/balance/<story-id>.md`

## Next Step

Dispatch the stories by wave from `docs/v5/plan/SPRINTS.md`. Each story starts with `/story-readiness` against its row in STORIES.md.
