# Epic: QA and release (Phase 8)

> **ID**: v6-qa-release (stories V6-QA-NN)
> **Layer**: Release
> **GDD / spec**: Brief Phase 8 and "Done means"
> **Architecture Module**: docs/v6/qa/**, docs/v6/REPORT.md, docs/playbook/**; fixes go to fixer agents by area
> **Status**: Ready
> **Engine Risk**: MEDIUM (Telegram Desktop key handling and Email Service can only be checked partly)
> **Manifest Version**: All manifests
> **Stories**: 5, below; schedule in `docs/v6/plan/SPRINTS.md`
> **Estimate**: 8 agent-days expected (sum of story expected values; not calibrated, no sprint history)
> **Created**: 2026-10-13 by P3-PLAN (`/create-epics`, `/create-stories`, `/estimate`)

## Overview

Final verification against "Done means": QA plan and regression map, real playthroughs on phone (Telegram emulation), tablet and laptop with mouse and keyboard, the account flows end to end locally, Lighthouse and the game perf profile, whole-branch code review and security audit, then the release checklist, gate check, milestone review, REPORT.md and the full owner go-live checklist.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0006..0013 | Every v6 decision is verified end to end. | MEDIUM |

## Requirements

*There is no `docs/architecture/tr-registry.yaml`; the IDs below are v6 requirement references traced to the brief, the decisions and the specs. At `standard` rigor untraced non-Foundation rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-v6-qa-001 | Every gate green; every screen verified across the matrix with mouse, keyboard and touch | N/A |
| TR-v6-qa-002 | Accounts, linking, payments interface, Turnstile, privacy and deletion work end to end with tests and a security audit | ADR-0008/0009 |
| TR-v6-qa-003 | REPORT.md and OWNER_ACTIONS.md written; V5-074 re-check noted | N/A |

## Stories

| # | Story | Type | Status | Sprint | Est. days (E) | Depends on |
|---|-------|------|--------|--------|---------------|------------|
| V6-QA-01 | QA plan and regression map for v6 | Config/Data | Ready | S16 | 1 | V6-RSCR-11, V6-LINK-07, V6-PAY-02, V6-INP-06, V6-PLAT-07 |
| V6-QA-02 | Playthroughs and account flows end to end | Integration | Ready | S17 | 2 | V6-QA-01 |
| V6-QA-03 | Performance: final Lighthouse on the landing and /perf-profile on the game in landscape | Integration | Ready | S17 | 1 | V6-QA-01, V6-LAND-06 |
| V6-QA-04 | Whole-branch code review, simplify and security audit | Integration | Ready | S17 | 2 | V6-QA-01 |
| V6-QA-05 | Release: checklists, gate check, milestone review, changelog, REPORT.md, owner go-live checklist, playbook and retrospective | Config/Data | Ready | S18 | 2 | V6-QA-02, V6-QA-03, V6-QA-04 |

## Definition of Done

This epic is complete when:
- every story is implemented, reviewed by the Director against its "Skills applied" section, merged into `v6` by an integrator with every gate green, and closed with `/story-done`;
- every acceptance criterion above is checked with evidence (tests, gate output, screenshots in `docs/v6/shots/<story>/`);
- no story added a platform check to game code or grew the boundary allowlist (brief review gate);
- auth, account, linking, deletion, rate-limit and public-API stories passed `/security-audit` before merge.

## Story details

### V6-QA-01: QA plan and regression map for v6

| Field | Value |
| --- | --- |
| Goal | QA plan and regression map for v6. |
| Type | Config/Data |
| Sprint and port slot | S16 · no server (no port slot) |
| Estimate | 1 d expected (0.5–1.5); confidence Medium |
| Depends on | V6-RSCR-11, V6-LINK-07, V6-PAY-02, V6-INP-06, V6-PLAT-07 |
| Governing ADRs and specs | all |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/qa-lead.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- docs/v6/qa/QA_PLAN.md (new)
- docs/v6/qa/REGRESSION_MAP.md (new)

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/qa-plan/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/regression-suite/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/test-evidence-review/SKILL.md`

**Acceptance criteria:**
- [ ] The plan covers the ten-size matrix × touch, mouse and keyboard × Telegram emulation and web, every account flow, the Telegram Desktop manual checks, Lighthouse and the perf profile.
- [ ] Every critical path maps to a test; paths with no regression test become fixer stories in the report.
- [ ] Gates: G-DOCS (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-QA-02: Playthroughs and account flows end to end

| Field | Value |
| --- | --- |
| Goal | Playthroughs and account flows end to end. |
| Type | Integration |
| Sprint and port slot | S17 · slot 1 (ports 6110–6119, V6-002) |
| Estimate | 2 d expected (1.5–3); confidence Medium |
| Depends on | V6-QA-01 |
| Governing ADRs and specs | all |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/qa-tester.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- docs/v6/qa/PLAYTHROUGH.md (new)
- docs/v6/qa/shots/**

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/team-qa/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/playtest-report/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/smoke-check/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] Phone in Telegram emulation (390x844, 320 wide), tablet (820x1180, 1024x768) and laptop (1440x900) with mouse and keyboard, from a fresh save, scored against the QA plan with evidence.
- [ ] Sign-up, verify, reset, both link directions, a conflict and delete run end to end locally (dev_outbox).
- [ ] Findings ranked S1–S4 with repro steps; verdict NOT APPROVED while any S1 or S2 is open. No fixes in this story.
- [ ] Gates: G-DOCS (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-QA-03: Performance: final Lighthouse on the landing and /perf-profile on the game in landscape

| Field | Value |
| --- | --- |
| Goal | Performance: final Lighthouse on the landing and /perf-profile on the game in landscape. |
| Type | Integration |
| Sprint and port slot | S17 · slot 2 (ports 6120–6129, V6-002) |
| Estimate | 1 d expected (0.5–1.5); confidence Medium |
| Depends on | V6-QA-01, V6-LAND-06 |
| Governing ADRs and specs | ADR-0011 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/performance-analyst.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- docs/v6/qa/PERF.md (new)

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/perf-profile/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/performance-optimization/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] Landing p75 numbers for both presets against the budget.
- [ ] Game frame time, FPS and memory at 1920x1080 and 1280x800 in battle and on the war map, compared with 390x844, with ranked fixes.
- [ ] Gates: G-DOCS (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-QA-04: Whole-branch code review, simplify and security audit

| Field | Value |
| --- | --- |
| Goal | Whole-branch code review, simplify and security audit. |
| Type | Integration |
| Sprint and port slot | S17 · no server (no port slot) |
| Estimate | 2 d expected (1.5–3); confidence Medium |
| Depends on | V6-QA-01 |
| Governing ADRs and specs | all |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/lead-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- docs/v6/qa/CODE_REVIEW.md (new)
- docs/v6/qa/SECURITY_AUDIT.md (new)

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/code-review/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/security-audit/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/tech-debt/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] /code-review over `main..v6`, the /simplify pass (or /code-review per V6-007), /tech-debt; the platform rule checked by hand on top of the boundary test.
- [ ] /security-audit across auth, sessions, cookies, CORS, CSP, Turnstile, rate limits, linking, deletion and the public API: no open HIGH.
- [ ] Findings grouped by area for fixer agents; nothing fixed in this story.
- [ ] Gates: G-DOCS (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

*Note:* Read the security-engineer role file as well.

### V6-QA-05: Release: checklists, gate check, milestone review, changelog, REPORT.md, owner go-live checklist, playbook and retrospective

| Field | Value |
| --- | --- |
| Goal | Release: checklists, gate check, milestone review, changelog, REPORT.md, owner go-live checklist, playbook and retrospective. |
| Type | Config/Data |
| Sprint and port slot | S18 · no server (no port slot) |
| Estimate | 2 d expected (1.5–3); confidence Medium |
| Depends on | V6-QA-02, V6-QA-03, V6-QA-04, the fixer stories they produce |
| Governing ADRs and specs | all |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/producer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- docs/v6/REPORT.md (new)
- docs/v6/OWNER_ACTIONS.md (final ordered checklist)
- docs/v6/qa/RELEASE_CHECKLIST.md (new)
- docs/playbook/** (PROMPTS_AGENTS v6 templates and lessons, PROMPTS_ART)
- CHANGELOG or docs/v6/CHANGELOG.md

**Shared files touched** (see SPRINTS.md "Shared files"): `docs/v6/OWNER_ACTIONS.md`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/release-checklist/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/launch-checklist/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/gate-check/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/milestone-review/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/changelog/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/retrospective/SKILL.md`

**Acceptance criteria:**
- [ ] /release-checklist, /gate-check and /milestone-review verdicts recorded; every gate green on v6 HEAD.
- [ ] REPORT.md has before and after per device, the landing, the architecture, the skills-log summary, open issues, proposals, the full go-live checklist (DNS, routes, secrets, Turnstile, email service, BotFather URL, deploy order) and the V5-074 re-check note.
- [ ] The playbook gains every new prompt, template and lesson; /retrospective written.
- [ ] Gates: G-DOCS (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

*Note:* Read the release-manager role file as well.
