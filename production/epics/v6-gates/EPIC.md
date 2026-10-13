# Epic: Layout-check matrix and gates extension

> **ID**: v6-gates (stories V6-GATE-NN)
> **Layer**: Foundation
> **GDD / spec**: Brief "Hard constraints: screen matrix" and "Verification"; docs/v6/audit/UI.md §5 gap 10
> **Architecture Module**: scripts/layout-check.mjs, scripts/layout-allowlist/, scripts/*-smoke.mjs, scripts/regression/, landing/scripts/, the CI jobs that run them
> **Status**: Ready
> **Engine Risk**: LOW
> **Manifest Version**: N/A (tooling)
> **Stories**: 3, below; schedule in `docs/v6/plan/SPRINTS.md`
> **Estimate**: 4.5 agent-days expected (sum of story expected values; not calibrated, no sprint history)
> **Created**: 2026-10-13 by P3-PLAN (`/create-epics`, `/create-stories`, `/estimate`)

## Overview

Grows every automated gate to the v6 shape: the layout check runs the ten-size screen matrix with size-scoped allowlist entries, the smoke and regression scripts run in both platform modes, and the landing gets its own width and Lighthouse checks wired into CI. The wide-screen content rule lives in V6-RFND-03 (responsive foundation).

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0005: UI kit | The layout registry (`window.__layout`) the check reads. | LOW |
| ADR-0006: The platform layer | Smokes run in Telegram emulation and as plain web. | LOW |
| ADR-0011: Landing stack and budget | The Lighthouse budget and the six landing widths. | MEDIUM |

## Requirements

*There is no `docs/architecture/tr-registry.yaml`; the IDs below are v6 requirement references traced to the brief, the decisions and the specs. At `standard` rigor untraced non-Foundation rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-v6-gate-001 | Layout check covers 390x844, 360x780, 320 wide, 844x390, 768x1024, 820x1180, 1024x768, 1280x800, 1440x900, 1920x1080 | N/A (brief) |
| TR-v6-gate-002 | Smokes run in Telegram emulation and as a plain browser | ADR-0006 |
| TR-v6-gate-003 | Landing passes at 320, 390, 768, 1280, 1440, 1920 and within its Lighthouse budget | ADR-0011 |

## Stories

| # | Story | Type | Status | Sprint | Est. days (E) | Depends on |
|---|-------|------|--------|--------|---------------|------------|
| V6-GATE-01 | Layout-check matrix: ten sizes, size-scoped allowlist, per-size shots and CI sharding | Integration | Ready | S1 | 1.5 | None |
| V6-GATE-02 | Smokes and regression in both platform modes (Telegram emulation and plain web) | Integration | Ready | S6 | 1.5 | V6-PLAT-01 |
| V6-GATE-03 | Landing gates: width check, reduced-motion and no-timeline passes, Lighthouse budget, wired into landing CI | Integration | Ready | S4 | 1.5 | V6-HOST-03, V6-LAND-01 |

## Definition of Done

This epic is complete when:
- every story is implemented, reviewed by the Director against its "Skills applied" section, merged into `v6` by an integrator with every gate green, and closed with `/story-done`;
- every acceptance criterion above is checked with evidence (tests, gate output, screenshots in `docs/v6/shots/<story>/`);
- no story added a platform check to game code or grew the boundary allowlist (brief review gate);
- auth, account, linking, deletion, rate-limit and public-API stories passed `/security-audit` before merge.

## Story details

### V6-GATE-01: Layout-check matrix: ten sizes, size-scoped allowlist, per-size shots and CI sharding

| Field | Value |
| --- | --- |
| Goal | Layout-check matrix: ten sizes, size-scoped allowlist, per-size shots and CI sharding. |
| Type | Integration |
| Sprint and port slot | S1 · slot 2 (ports 6120–6129, V6-002) |
| Estimate | 1.5 d expected (1–2.5); confidence Low |
| Depends on | None |
| Governing ADRs and specs | ADR-0005 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/tools-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- scripts/layout-check.mjs (SIZES, --matrix groups, size-scoped keys, summary)
- scripts/layout-allowlist.json → scripts/layout-allowlist/<owner>.json (split into one file per owner story; the loader merges them)
- scripts/lib/** (only helpers it needs)
- .github/workflows/deploy.yml (layout job matrix only)
- docs/UI_KIT.md (layout-check section)

**Shared files touched** (see SPRINTS.md "Shared files"): `scripts/layout-check.mjs`, `.github/workflows/deploy.yml`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/game-ui-ux/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/regression-suite/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/test-helpers/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] Default sizes are the ten matrix sizes; `--matrix phone|tablet|landscape|all` selects groups; `--sizes` still works.
- [ ] Allowlist keys can carry `@WxH`; the allowlist is split into one file per owner story (`scripts/layout-allowlist/<story>.json`) so parallel stories never edit the same file; today's known findings (including the 266 at 844x390 from UI.md) are seeded into their owner V6-RSCR file so the run is green and the lists can only shrink.
- [ ] A violation not in the allowlist at any size fails the run (proved with a deliberate fixture, then removed).
- [ ] The CI layout job shards across the matrix (YAML reviewed; not run remotely). Run time per size recorded in NOTES.md.
- [ ] Gates: G-CODE, G-MATRIX (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-GATE-02: Smokes and regression in both platform modes (Telegram emulation and plain web)

| Field | Value |
| --- | --- |
| Goal | Smokes and regression in both platform modes (Telegram emulation and plain web). |
| Type | Integration |
| Sprint and port slot | S6 · slot 4 (ports 6140–6149, V6-002) |
| Estimate | 1.5 d expected (1–2.5); confidence Low |
| Depends on | V6-PLAT-01 |
| Governing ADRs and specs | ADR-0006 Testing |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/qa-lead.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- scripts/smoke.mjs
- scripts/tutorial-smoke.mjs
- scripts/duel-smoke.mjs
- scripts/fullscreen-smoke.mjs
- scripts/audio-smoke.mjs
- scripts/online-smoke.mjs
- scripts/regression/**
- scripts/lib/** (platform flag helper)
- .github/workflows/deploy.yml (smoke job only)

**Shared files touched** (see SPRINTS.md "Shared files"): `.github/workflows/deploy.yml`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/smoke-check/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/regression-suite/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/test-flakiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] Every smoke takes `--platform telegram|web|both` (default both in CI); web mode asserts no request to telegram.org.
- [ ] Web mode exercises the offline campaign path and the signed-out states; Telegram mode is unchanged.
- [ ] `npm run regression` runs both modes; a flake is reported with both runs, never hidden with retries.
- [ ] Gates: G-CODE (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-GATE-03: Landing gates: width check, reduced-motion and no-timeline passes, Lighthouse budget, wired into landing CI

| Field | Value |
| --- | --- |
| Goal | Landing gates: width check, reduced-motion and no-timeline passes, Lighthouse budget, wired into landing CI. |
| Type | Integration |
| Sprint and port slot | S4 · slot 4 (ports 6140–6149, V6-002) |
| Estimate | 1.5 d expected (1–2.5); confidence Low |
| Depends on | V6-HOST-03, V6-LAND-01 |
| Governing ADRs and specs | ADR-0011 (budget and amendments, V6-015) |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/performance-analyst.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- landing/scripts/** (layout-widths.mjs, lighthouse.mjs)
- landing/package.json (devDependencies and scripts)
- .github/workflows/deploy.yml (landing-build step)

**Shared files touched** (see SPRINTS.md "Shared files"): `landing/package.json`, `.github/workflows/deploy.yml`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/performance-optimization/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/perf-profile/SKILL.md`
- plugin skill `searchfit-seo:technical-seo` (Skill tool)
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] Width check at 320, 390, 768, 1280, 1440, 1920: no horizontal overflow, CLS ≤ 0.02, every section visible with reduced motion and with `animation-timeline` disabled.
- [ ] Lighthouse mobile and desktop, three runs, 75th percentile, assert every budget row of ADR-0011 plus the V6-015 rule (critical JS ≤ 15 kB, one lazy hero module ≤ 80 kB after LCP).
- [ ] Requests before LCP ≤ 12 and the above-the-fold byte totals are checked.
- [ ] The landing-build CI job runs both scripts against the built site (YAML reviewed; not run remotely).
- [ ] Gates: G-LAND (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").
