# Epic: Sim train 2 (SIM_VERSION 2) and the v5 save bump

> **ID**: EP-04
> **Layer**: Core
> **GDD**: docs/v5/VISION.md (Release shape), design/gdd/campaign-arc.md (Save impact), every [SERVER] GDD
> **Architecture Module**: src/sim/version.ts, src/sim/types.ts, server/src/battle.ts, server/src/sims/v1/** (new), src/game/save.ts, src/dev/balance.ts
> **Status**: Ready
> **Engine Risk**: MEDIUM
> **Stories**: 4, in `docs/v5/plan/STORIES.md` (section EP-04)

## Overview

The plumbing that lets every sim rule change ship together (V5-019) and every campaign save field land once. It freezes the v1 sim for the server, pre-declares all train-2 types and zod entries so the feature stories can run in parallel, declares every v5 save field in one migration, and closes the train with an all-features replay fixture and a full balance run.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0001: Determinism and replay contract | Freeze v1 into server/src/sims/v1, bump SIM_VERSION to 2, REPLAYERS by version, never branch inside the sim. | MEDIUM |
| ADR-0002: Save migration (to write in ST-02) | One campaign save bump: SAVE_VERSION 6, every v5 field optional with defaults, fixture-tested migration. | MEDIUM |

## GDD Requirements

*No `docs/architecture/tr-registry.yaml` exists in this repo. At `standard` rigor only Foundation ADRs are expected, so the IDs below are GDD rule references and untraced rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-train-001 | v1 sim frozen and hash-identical; SIM_VERSION 2 registered; MIN_SIM_VERSION 1 grace window | ADR-0001 |
| TR-train-002 | All train-2 Order kinds, enums, ArmySpec/UnitSpec fields and SimEvents declared in types and zod, backward compatible | ADR-0001 |
| TR-train-003 | SAVE_VERSION 6 with lairs, arc, flags, eventCd, eventsToday, pendingEvent, journal, escaped, captainDead, host kind, reborn, settings fields | ADR-0002 (pending) |
| TR-train-004 | Train close: server replays one log using every new rule to the same hash; balance recorded | ADR-0001 |

## Stories

| # | Story | Type | Status | Est. days (E) | Wave |
|---|-------|------|--------|---------------|------|
| ST-01 | Freeze the v1 sim into `server/src/sims/v1/` and bump SIM_VERSION to 2 (ADR-0001 cutover steps 1-2). | Integration | Ready | 1.5 | W1 |
| ST-02 | The one v5 campaign save bump: SAVE_VERSION 6 declaring every v5 field with defaults; ADR-0002. | Integration | Ready | 1.5 | W4 |
| ST-03 | Train scaffold: declare every train-2 type, zod entry and harness module up front so sim stories run in parallel. | Integration | Ready | 1 | W2 |
| ST-04 | Close the train: all-features replay fixture, full balance run, online smoke, ops note. | Integration | Ready | 2 | W14 |

## Definition of Done

This epic is complete when:
- All stories are implemented, reviewed, merged into `v5` by an integrator, and closed via `/story-done`
- All acceptance criteria from the GDD(s) above are verified, experiential ones in QA-03
- All Logic and Integration stories have passing test files in `tests/` (and `server/test/` for server code)
- All UI and Visual/Feel stories have screenshots at 390x844 and 360x780 in `docs/v5/shots/<story-id>/`
- Mechanic stories have `npm run balance` before/after recorded in `docs/v5/balance/<story-id>.md`

## Next Step

Dispatch the stories by wave from `docs/v5/plan/SPRINTS.md`. Each story starts with `/story-readiness` against its row in STORIES.md.
