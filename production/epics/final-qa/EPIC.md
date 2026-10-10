# Epic: Final QA

> **ID**: EP-25
> **Layer**: Polish
> **GDD**: docs/v5 brief Phase 8
> **Architecture Module**: production/qa/**, scripts/regression/**, docs/v5/qa/**, docs/v5/REPORT.md
> **Status**: Ready
> **Engine Risk**: LOW
> **Stories**: 6, in `docs/v5/plan/STORIES.md` (section EP-25)

## Overview

QA plan, regression suite, full-game playthrough, whole-branch code review and simplify, performance profile, gate check, milestone review and the final REPORT.md.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0001: Determinism and replay contract | Replay and online gates included. | LOW |

## GDD Requirements

*No `docs/architecture/tr-registry.yaml` exists in this repo. At `standard` rigor only Foundation ADRs are expected, so the IDs below are GDD rule references and untraced rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-qa | Every gate green; every screen verified at 390x844 and 360x780; every expansion has a GDD, tests and balance numbers; REPORT.md | No ADR (informational) |

## Stories

| # | Story | Type | Status | Est. days (E) | Wave |
|---|-------|------|--------|---------------|------|
| QA-01 | /qa-plan for v5: test cases per epic, the screen x size x language matrix. | Config/Data | Ready | 1 | W6 |
| QA-02 | /regression-suite and /smoke-check: scripted regression of every rebuilt screen and mechanic. | Integration | Ready | 2 | W20 |
| QA-03 | /team-qa: full-game Playwright playthrough and /playtest-report with every experiential AC. | Integration | Ready | 2 | W22 |
| QA-04 | /code-review on the whole branch, /simplify and /tech-debt; fix the findings. | Integration | Ready | 3 | W23 |
| QA-05 | /perf-profile: first sheet open, battle FPS at 20 men under 4x/6x CPU throttle, bundle size; fix regressions. | Integration | Ready | 2 | W24 |
| QA-06 | /gate-check, /milestone-review, /retrospective and docs/v5/REPORT.md. | Config/Data | Ready | 1.5 | W25 |

## Definition of Done

This epic is complete when:
- All stories are implemented, reviewed, merged into `v5` by an integrator, and closed via `/story-done`
- All acceptance criteria from the GDD(s) above are verified, experiential ones in QA-03
- All Logic and Integration stories have passing test files in `tests/` (and `server/test/` for server code)
- All UI and Visual/Feel stories have screenshots at 390x844 and 360x780 in `docs/v5/shots/<story-id>/`
- Mechanic stories have `npm run balance` before/after recorded in `docs/v5/balance/<story-id>.md`

## Next Step

Dispatch the stories by wave from `docs/v5/plan/SPRINTS.md`. Each story starts with `/story-readiness` against its row in STORIES.md.
