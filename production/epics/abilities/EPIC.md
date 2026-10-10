# Epic: Perk paths, signature actives and the Standard

> **ID**: EP-07
> **Layer**: Feature
> **GDD**: design/gdd/abilities.md
> **Architecture Module**: src/data/perks.ts, src/data/classes.ts, src/sim/battle.ts, src/sim/stats.ts, src/sim/ai.ts, src/game/heroes.ts, src/duel/rules.ts, server/src/duel/*
> **Status**: Ready
> **Engine Risk**: MEDIUM
> **Stories**: 3, in `docs/v5/plan/STORIES.md` (section EP-07)

## Overview

Turns linear perk chains into A/B choices per tier, adds seven signature actives, re-tunes the four old ones to +5..+10 pts, and adds the Standard as a morale lever. Fixes MECH H1-H3 and M2.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0001: Determinism and replay contract | Actives, re-tuned magnitudes, B passives and the standard are replayed: train 2. | MEDIUM |
| ADR-0002: Save migration (to write in ST-02) | New perk ids ride the v5 save bump. | LOW |

## GDD Requirements

*No `docs/architecture/tr-registry.yaml` exists in this repo. At `standard` rigor only Foundation ADRs are expected, so the IDs below are GDD rule references and untraced rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-abilities-R1-R7 | Perk paths A/B, perkBlocker, retrain F3 | ADR-0001: Determinism and replay contract |
| TR-abilities-R2-R4 | Re-tuned and signature actives, medallion budget <= 3 | ADR-0001: Determinism and replay contract |
| TR-abilities-R5 | The Standard, banner loss, bond split F1/F2 | ADR-0001: Determinism and replay contract |
| TR-abilities-R6 | Bot development and ability use | ADR-0001: Determinism and replay contract |

## Stories

| # | Story | Type | Status | Est. days (E) | Wave |
|---|-------|------|--------|---------------|------|
| AB-01 | Perk paths A/B per tier, perkBlocker, autoDevelop, duel/war validation, retrain cost (R1, R7, F3). | Logic | Ready | 3 | W7 |
| AB-02 | Seven signature actives, the re-tuned four, medallion budget data and bot use (R2-R4, R6). | Logic | Ready | 3 | W8 |
| AB-03 | The Standard: aura, bond split, banner loss (bearer and captain), Raise vs army break (R5, F1, F2). | Logic | Ready | 2 | W9 |

## Definition of Done

This epic is complete when:
- All stories are implemented, reviewed, merged into `v5` by an integrator, and closed via `/story-done`
- All acceptance criteria from the GDD(s) above are verified, experiential ones in QA-03
- All Logic and Integration stories have passing test files in `tests/` (and `server/test/` for server code)
- All UI and Visual/Feel stories have screenshots at 390x844 and 360x780 in `docs/v5/shots/<story-id>/`
- Mechanic stories have `npm run balance` before/after recorded in `docs/v5/balance/<story-id>.md`

## Next Step

Dispatch the stories by wave from `docs/v5/plan/SPRINTS.md`. Each story starts with `/story-readiness` against its row in STORIES.md.
