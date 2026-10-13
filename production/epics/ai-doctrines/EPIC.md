# Epic: AI doctrines and band captains

> **ID**: EP-05
> **Layer**: Feature
> **GDD**: design/gdd/ai-doctrines.md
> **Architecture Module**: src/sim/ai.ts, src/data/doctrines.ts (new), src/game/enemy.ts, src/world/world.ts, src/duel/ladder.ts, server/src/online/*
> **Status**: Ready
> **Engine Risk**: MEDIUM
> **Stories**: 3, in `docs/v5/plan/STORIES.md` (section EP-05)

## Overview

Every enemy band fights to one of five doctrines with a readable tell, and named captains become targets worth a bounty. Steady reproduces today's timers. Fixes MECH A1-A3, PLAY P1 (idle opening) and C4 (weakenParty reroll).

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0001: Determinism and replay contract | Doctrines and captains are sim rules: train 2 only. | MEDIUM |

## GDD Requirements

*No `docs/architecture/tr-registry.yaml` exists in this repo. At `standard` rigor only Foundation ADRs are expected, so the IDs below are GDD rule references and untraced rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-ai-doctrines-R1-R3 | Doctrine record, five doctrines, small-army opening | ADR-0001: Determinism and replay contract |
| TR-ai-doctrines-R4-R5 | Doctrine assignment and bot behaviour per doctrine; F1 press, F2 jitter | ADR-0001: Determinism and replay contract |
| TR-ai-doctrines-R6-R8 | Captains, bounty F3, enemy retreat outcome | ADR-0001: Determinism and replay contract |
| TR-ai-doctrines-R7 | Readability: doctrine, tell and captain in the encounter sheet (built in WLD-01, CDX-01) | No ADR (informational) |

## Stories

| # | Story | Type | Status | Est. days (E) | Wave |
|---|-------|------|--------|---------------|------|
| AI-01 | Doctrine record, the five doctrines, small-army opening, jitter and assignment (R1-R5, F1, F2). | Logic | Ready | 3 | W3 |
| AI-02 | Captains, bounty, enemy-retreat outcome and the weakenParty identity fix (R6, R8, F3, MECH C4). | Logic | Ready | 2.5 | W5 |
| AI-03 | Server-built setups pick doctrines: duel ladder floors and war-map neutrals. | Integration | Ready | 1.5 | W7 |

## Definition of Done

This epic is complete when:
- All stories are implemented, reviewed, merged into `v5` by an integrator, and closed via `/story-done`
- All acceptance criteria from the GDD(s) above are verified, experiential ones in QA-03
- All Logic and Integration stories have passing test files in `tests/` (and `server/test/` for server code)
- All UI and Visual/Feel stories have screenshots at 390x844 and 360x780 in `docs/v5/shots/<story-id>/`
- Mechanic stories have `npm run balance` before/after recorded in `docs/v5/balance/<story-id>.md`

## Next Step

Dispatch the stories by wave from `docs/v5/plan/SPRINTS.md`. Each story starts with `/story-readiness` against its row in STORIES.md.
