# Epic: Responsive foundation: scale policy, size classes, layout primitives, layout-check rules, wheel

> **ID**: v6-responsive-foundation (stories V6-RFND-NN)
> **Layer**: Foundation
> **GDD / spec**: design/ux/landscape-v6.md §1–§5, §14, §16 (accepted, V6-020); design/gdd/systems-index.md #43; docs/v6/audit/UI.md §1, §5; V6-018
> **Architecture Module**: index.html, src/ui/kit.ts (uiMetrics, ScrollArea), src/ui/sizeClass.ts, src/ui/mosaic/layout/, src/ui/layoutCheck.ts, src/ui/layout.ts, src/ui/input/{wheel,zoomAt}.ts
> **Status**: Ready
> **Engine Risk**: MEDIUM (the scale policy is accepted as a UX spec, V6-020; V6-RFND-01 records it as ADR-0013 because it amends ADR-0005)
> **Manifest Version**: design/ux/landscape-v6.md §1.2 (UIMetrics contract), §2.3 (maximum widths), §5 (checks); ADR-0005 and ADR-0012 rules
> **Stories**: 4, below; schedule in `docs/v6/plan/SPRINTS.md`
> **Estimate**: 10.5 agent-days expected (sum of story expected values; not calibrated, no sprint history)
> **Created**: 2026-10-13 by P3-PLAN (`/create-epics`, `/create-stories`, `/estimate`)

## Overview

The UI audit (V6-018) found the root cause of the letterbox: a 0.64 aspect cap in `index.html` and a UI scale picked from height alone. `design/ux/landscape-v6.md` (V6-020) fixes the model: size classes compact, medium and expanded measured on the safe-area short side, a whole-number scale per class (S = 3 at 1920x1080), content capped at 640, rows at 360 and dialogs at 320 UI px, new Kit primitives, and nine new layout-check rules. Phone landscape uses compact layouts everywhere; `RotateCard` is only the global floor under 320 CSS px tall (§14). This epic lands that foundation; the screens epic then migrates scene families one by one. Until a family migrates it renders in a legacy column inside the full-size canvas, so nothing stretches in between (a migration aid, removed by V6-RSCR-11).

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0005: UI kit | Every layout is written against VW × VH from uiMetrics; ADR-0013 amends it. | LOW |
| ADR-0013: Responsive scale policy and size classes (to write in V6-RFND-01, from landscape-v6.md §1–§2) | Classes on the safe-area short side, whole-number S per class up to 3 at 1080p, the UIMetrics contract, content caps. | MEDIUM |
| ADR-0012: Input v6 | WheelAccumulator and cursor-anchored zoom (Decision 5). | LOW |

## Requirements

*There is no `docs/architecture/tr-registry.yaml`; the IDs below are v6 requirement references traced to the brief, the decisions and the specs. At `standard` rigor untraced non-Foundation rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-v6-rsp-001 | True landscape layouts for tablets and laptops, not a letterboxed column (brief Goal 3, V5-075) | ADR-0013 (to write); design/ux/landscape-v6.md §0 |
| TR-v6-rsp-002 | UI scale from width and height; size classes compact, medium, expanded; whole S | design/ux/landscape-v6.md §1, §2.1 |
| TR-v6-rsp-003 | Kit primitives (AppShell switch, Columns, MasterDetail, side panels, edge clusters with a framing rect, RotateCard, Grid) on a Kit Layouts page in four variants | design/ux/landscape-v6.md §3, §16.10 |
| TR-v6-rsp-004 | Layout-check fails on letterbox and wasted space: the nine checks | design/ux/landscape-v6.md §5 |
| TR-v6-rsp-005 | Wheel scrolls only the area under the pointer; zoom at the cursor in Battle, World, War and Camp | ADR-0012 Decision 5 |
| TR-v6-rsp-006 | Phone landscape 844x390 uses compact layouts; RotateCard only below the floor | design/ux/landscape-v6.md §1, §3.6, §14 |

## Stories

| # | Story | Type | Status | Sprint | Est. days (E) | Depends on |
|---|-------|------|--------|--------|---------------|------------|
| V6-RFND-01 | Scale policy: ADR-0013, no 0.64 cap, the UIMetrics contract with size classes and whole-number S, content caps, legacy column for unmigrated scenes | Logic | Ready | S2 | 2.5 | V6-GATE-01 |
| V6-RFND-02 | Kit layout primitives (Columns, MasterDetail, SidePanel, edge clusters with a framing rect, RotateCard, Grid) and the Kit Layouts page in four variants | UI | Ready | S4 | 3 | V6-RFND-01 |
| V6-RFND-03 | The nine landscape layout-check rules and their registry hooks, enforced per migrated family | Logic | Ready | S3 | 3 | V6-GATE-01, V6-RFND-01 |
| V6-RFND-04 | Wheel: scroll only the area under the pointer, WheelAccumulator, and one zoomAt anchored at the cursor in Battle, World, War and Camp | Integration | Ready | S5 | 2 | V6-RFND-01, V6-INP-01 |

## Definition of Done

This epic is complete when:
- every story is implemented, reviewed by the Director against its "Skills applied" section, merged into `v6` by an integrator with every gate green, and closed with `/story-done`;
- every acceptance criterion above is checked with evidence (tests, gate output, screenshots in `docs/v6/shots/<story>/`);
- no story added a platform check to game code or grew the boundary allowlist (brief review gate);
- auth, account, linking, deletion, rate-limit and public-API stories passed `/security-audit` before merge.

## Story details

### V6-RFND-01: Scale policy: ADR-0013, no 0.64 cap, the UIMetrics contract with size classes and whole-number S, content caps, legacy column for unmigrated scenes

| Field | Value |
| --- | --- |
| Goal | Scale policy: ADR-0013, no 0.64 cap, the UIMetrics contract with size classes and whole-number S, content caps, legacy column for unmigrated scenes. |
| Type | Logic |
| Sprint and port slot | S2 · slot 1 (ports 6110–6119, V6-002) |
| Estimate | 2.5 d expected (2–4); confidence Low |
| Depends on | V6-GATE-01, design/ux/landscape-v6.md (merged, V6-020) |
| Governing ADRs and specs | ADR-0013 (written first with /architecture-decision from design/ux/landscape-v6.md §1–§2; amends ADR-0005), ADR-0005 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/lead-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- design/adr/ADR-0013-responsive-scale.md (new)
- index.html (the #game sizing rule)
- src/ui/kit.ts (uiMetrics block only)
- src/ui/sizeClass.ts (new: classes, thresholds, CONTENT_MAX and the §2.3 maxima)
- tests/uiMetrics.test.ts (new)

**Shared files touched** (see SPRINTS.md "Shared files"): `src/ui/kit.ts`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/architecture-decision/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/game-ui-ux/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/phaser-core/SKILL.md`
- `/Users/v.gladis/.claude/skills/tdd/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] `uiMetrics` returns `cls`, `land`, `short`, `navW` and `contentW` as design/ux/landscape-v6.md §1.2 defines; classes are measured on the safe-area CSS box with the §1 rules.
- [ ] S follows the §2.1 formula per class (whole numbers; 2–3, 4 only when short ≥ 1800); a table test reproduces every row of the §1.1 matrix (class, S, VW × VH, nav).
- [ ] `index.html` drops the `* 0.64` cap: `#game` fills the safe area at every matrix size (§16.1).
- [ ] A scene that has not migrated renders in the legacy column at its v5 width inside the full canvas, so layout-check shows 0 new violations across the matrix against the V6-GATE-01 baseline; a scene that opts in gets the full width.
- [ ] Crossing a class threshold rebuilds the scene within one frame of the resize settling and keeps its state; within a class it reflows (§1.2, §16.11 for the opted-in Kit page).
- [ ] 390x844, 360x780 and 320x693 are unchanged (§16.9, screenshot compare of Menu and Battle). ADR-0013 is logged for acceptance in DECISIONS.md.
- [ ] Gates: G-CODE, G-MATRIX, G-SHOTS (Menu, Battle, Kit at all sizes) (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-RFND-02: Kit layout primitives (Columns, MasterDetail, SidePanel, edge clusters with a framing rect, RotateCard, Grid) and the Kit Layouts page in four variants

| Field | Value |
| --- | --- |
| Goal | Kit layout primitives (Columns, MasterDetail, SidePanel, edge clusters with a framing rect, RotateCard, Grid) and the Kit Layouts page in four variants. |
| Type | UI |
| Sprint and port slot | S4 · slot 1 (ports 6110–6119, V6-002) |
| Estimate | 3 d expected (2–4); confidence High |
| Depends on | V6-RFND-01 |
| Governing ADRs and specs | ADR-0013, ADR-0005; design/ux/landscape-v6.md §3, §4 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/ui-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- src/ui/mosaic/layout/** (new: Columns, MasterDetail, SidePanel, EdgeClusters with framingRect(), RotateCard, Grid)
- src/scenes/kit/layoutsPage.ts (new)
- src/scenes/KitScene.ts (page registration)
- scripts/layout-check.mjs (own kit-layouts-* fixtures, append only)
- tests/layoutPrimitives.test.ts (new)

**Shared files touched** (see SPRINTS.md "Shared files"): `scripts/layout-check.mjs`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/game-ui-ux/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/design-system/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/team-ui/SKILL.md`
- `/Users/v.gladis/.claude/skills/tdd/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] Pure geometry tests per primitive in all four variants (compact portrait, compact landscape, medium, expanded): Columns by width (§3.2), MasterDetail (§3.3), SidePanel 240–320 UI docking right in landscape and a bottom sheet in compact portrait (§3.4), the Grid column formula (§3.7).
- [ ] EdgeClusters anchor TL, TR, left column, right rail, bottom-centre bar and corners inside the safe area, mirror in left-hand mode, and publish the framing rect (§3.5).
- [ ] RotateCard appears only below the §1 floors (landscape under 320 CSS px tall) with EN and RU text, and the scene behind keeps running (§3.6).
- [ ] Hover, pressed, focused, selected and cursor states of the new primitives match §4 (focus registration lands with V6-INP-04).
- [ ] The Kit Layouts page shows every primitive in all four variants and passes every layout-check rule at all ten sizes (§16.10). The `AppShell` tab-bar/rail switch itself is V6-RSCR-01 (§3.1 lives in the shells).
- [ ] Gates: G-CODE, G-MATRIX, G-SHOTS (Kit Layouts page, four variants) (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-RFND-03: The nine landscape layout-check rules and their registry hooks, enforced per migrated family

| Field | Value |
| --- | --- |
| Goal | The nine landscape layout-check rules and their registry hooks, enforced per migrated family. |
| Type | Logic |
| Sprint and port slot | S3 · slot 2 (ports 6120–6129, V6-002) |
| Estimate | 3 d expected (2–4); confidence High |
| Depends on | V6-GATE-01, V6-RFND-01 |
| Governing ADRs and specs | ADR-0005 (layout registry); design/ux/landscape-v6.md §5 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/tools-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- src/ui/layoutCheck.ts (the nine checks)
- src/ui/layout.ts (uiLayout, uiStretch, uiOpaque, uiPrimary, uiCollapsed registry hooks)
- scripts/layout-check.mjs (thresholds table, per-class summary column, pending support)
- scripts/layout-allowlist/** (pending flags per family file)
- tests/layoutWide.test.ts (new)

**Shared files touched** (see SPRINTS.md "Shared files"): `scripts/layout-check.mjs`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/game-ui-ux/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/regression-suite/SKILL.md`
- `/Users/v.gladis/.claude/skills/tdd/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] Unit tests for each check in §5: `letterbox`, `class-match`, `wasted-width` (80% medium, 70% expanded of contentW), `empty-column`, `stretched` (row 360, button 240 / CTA 300, line 300, dialog or panel 320), `field-coverage` (60/50/40%), `above-fold`, `element-parity` (with `uiCollapsed`), `nav-labels`.
- [ ] Thresholds sit in one table next to the sizes; the summary gets a per-class column.
- [ ] Families not yet migrated are marked `"pending": true` in their own `scripts/layout-allowlist/V6-RSCR-NN.json`: their new-check findings are reported, not failed. A family's story removes its file when it migrates, so the pending set only shrinks; V6-RSCR-11 deletes the mechanism. Migrated screens are enforced; foundation screens (Menu, Settings, Kit) can never be allowlisted for the new checks once migrated (§5).
- [ ] `letterbox` passes everywhere after V6-RFND-01; the Kit Layouts page passes all nine checks.
- [ ] Gates: G-CODE, G-MATRIX (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-RFND-04: Wheel: scroll only the area under the pointer, WheelAccumulator, and one zoomAt anchored at the cursor in Battle, World, War and Camp

| Field | Value |
| --- | --- |
| Goal | Wheel: scroll only the area under the pointer, WheelAccumulator, and one zoomAt anchored at the cursor in Battle, World, War and Camp. |
| Type | Integration |
| Sprint and port slot | S5 · slot 1 (ports 6110–6119, V6-002) |
| Estimate | 2 d expected (1.5–3); confidence Medium |
| Depends on | V6-RFND-01, V6-INP-01 |
| Governing ADRs and specs | ADR-0012 Decision 5 (primary), ADR-0004 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/gameplay-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- src/ui/kit.ts (ScrollArea onWheel)
- src/ui/input/wheel.ts (new)
- src/ui/input/zoomAt.ts (new)
- src/scenes/BattleScene.ts (wheel handler lines)
- src/scenes/WorldScene.ts
- src/scenes/CampScene.ts (gains wheel zoom and mouse pan)
- src/scenes/online/OnlineScene.ts
- src/scenes/online/regionMapView.ts (its zoomAt becomes the shared one)
- tests/wheel.test.ts, tests/scrollAreaWheel.test.ts (new)

**Shared files touched** (see SPRINTS.md "Shared files"): `src/ui/kit.ts`, `src/scenes/BattleScene.ts`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/input-systems/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/camera-systems/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/phaser-core/SKILL.md`
- `/Users/v.gladis/.claude/skills/tdd/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] `tests/wheel.test.ts` per ADR-0012: one mouse notch is one step, ten 10 px trackpad deltas are one step, line mode, the 120 ms limit, ctrl zooms, shift and deltaX pan.
- [ ] With two scroll areas on screen only the one under the pointer scrolls (innermost wins), checked on the Kit Layouts two-pane fixture with Playwright.
- [ ] Zoom stays anchored at the cursor within 1 px in Battle, World, War and Camp (Playwright reads the camera); a trackpad pinch never zooms the page.
- [ ] Touch pinch and drag are unchanged (existing input tests and the touch smoke).
- [ ] Gates: G-CODE, G-REPLAY (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").
