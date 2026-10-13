# Epic: Input layer: action map, keyboard, mouse, focus and rebinding (ADR-0012)

> **ID**: v6-input (stories V6-INP-NN)
> **Layer**: Foundation
> **GDD / spec**: design/ux/input-v6.md; design/gdd/systems-index.md #44; design/gdd/controls.md
> **Architecture Module**: src/ui/input/** (actions, bindings, keySource, keys, focus, gestures, cursor, glyphs), src/ui/focusRing.ts, kit and Mosaic focus registration, Settings → Controls
> **Status**: Ready
> **Engine Risk**: MEDIUM (Telegram Desktop key handling unverified; Keyboard Layout Map is Chromium only)
> **Manifest Version**: ADR-0012 Implementation guidelines (no separate manifest)
> **Stories**: 6, below; schedule in `docs/v6/plan/SPRINTS.md`
> **Estimate**: 14 agent-days expected (sum of story expected values; not calibrated, no sprint history)
> **Created**: 2026-10-13 by P3-PLAN (`/create-epics`, `/create-stories`, `/estimate`)

## Overview

Adds mouse and keyboard play: named actions with default hotkeys (input-v6.md §1.1), rebinding with conflict detection saved per device, one keyboard router that replaces Phaser's KeyboardPlugin, a focus manager with a visible ring for every kit control, hover states, right-click and middle-drag on the field, cursors, keycaps and the Settings Controls page offered only when `platform.input.keyboard()` is true. Steps I1–I6 of ADR-0012; the wheel part of I3 lives in V6-RFND-04. Every hotkey calls the same method as its button, so replays and lockstep are unaffected.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0012: Input v6 | Device-free action map, per-device bindings by KeyboardEvent.code, one key router, a focus manager tied to NavStack, mouse buttons in the recogniser. | MEDIUM |
| ADR-0004: Battle input layer (amended by ADR-0012) | Pure gesture recogniser and hit-test; touch unchanged. | LOW |
| ADR-0006: The platform layer | InputHints and Storage.device(). | LOW |

## Requirements

*There is no `docs/architecture/tr-registry.yaml`; the IDs below are v6 requirement references traced to the brief, the decisions and the specs. At `standard` rigor untraced non-Foundation rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-v6-inp-001 | Hover states, right-click and wheel zoom on the field | ADR-0012 D5 |
| TR-v6-inp-002 | Keyboard focus navigation through menus and sheets | ADR-0012 D4 |
| TR-v6-inp-003 | Battle hotkeys: orders, groups, pause, speed, Undo, Then | ADR-0012 D1–D3 |
| TR-v6-inp-004 | Rebindable keys with conflict detection, saved per device, only where a keyboard is present | ADR-0012 D2, D6 |
| TR-v6-inp-005 | Tutorial mentions keyboard controls on keyboard devices | input-v6.md §10 |

## Stories

| # | Story | Type | Status | Sprint | Est. days (E) | Depends on |
|---|-------|------|--------|--------|---------------|------------|
| V6-INP-01 | I1: the action map and pure bindings with per-device storage | Logic | Ready | S2 | 1.5 | V6-PLAT-01 |
| V6-INP-02 | I2: one key source, the KeyRouter, Esc and the battle hotkeys | Integration | Ready | S6 | 2.5 | V6-INP-01, V6-PLAT-02 |
| V6-INP-03 | I3: mouse buttons, right-click and right-drag orders, middle-drag pan, context menu, cursors and hover previews | Integration | Ready | S7 | 2.5 | V6-INP-02, V6-RFND-04 |
| V6-INP-04 | I4: focus manager, focus ring and hover states for every kit and Mosaic control | UI | Ready | S8 | 3 | V6-INP-02, V6-RFND-02 |
| V6-INP-05 | I5: Settings → Keyboard shortcuts page with capture, conflicts, reset and per-device save | UI | Ready | S11 | 2 | V6-INP-04 |
| V6-INP-06 | I6: key labels and glyphs, keycaps, the shortcuts sheet, keyboard tutorial lines, keyboard-smoke and the doc follow-ups | UI | Ready | S12 | 2.5 | V6-INP-03, V6-INP-05, V6-RSCR-02 |

## Definition of Done

This epic is complete when:
- every story is implemented, reviewed by the Director against its "Skills applied" section, merged into `v6` by an integrator with every gate green, and closed with `/story-done`;
- every acceptance criterion above is checked with evidence (tests, gate output, screenshots in `docs/v6/shots/<story>/`);
- no story added a platform check to game code or grew the boundary allowlist (brief review gate);
- auth, account, linking, deletion, rate-limit and public-API stories passed `/security-audit` before merge.

## Story details

### V6-INP-01: I1: the action map and pure bindings with per-device storage

| Field | Value |
| --- | --- |
| Goal | I1: the action map and pure bindings with per-device storage. |
| Type | Logic |
| Sprint and port slot | S2 · no server (no port slot) |
| Estimate | 1.5 d expected (1–2); confidence High |
| Depends on | V6-PLAT-01 |
| Governing ADRs and specs | ADR-0012 Decisions 1–2 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/gameplay-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- src/ui/input/actions.ts (new)
- src/ui/input/bindings.ts (new)
- src/ui/input/bindingStore.ts (new: platform.storage.device() key input.bindings)
- src/i18n/input.en.ts / input.ru.ts (new) and one line in src/i18n/index.ts
- tests/inputActions.test.ts, tests/bindings.test.ts (new)

**Shared files touched** (see SPRINTS.md "Shared files"): `src/i18n/index.ts`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/input-systems/SKILL.md`
- `/Users/v.gladis/.claude/skills/tdd/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/save-systems/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] `ACTIONS` matches input-v6.md §1.1; every action has a label in EN and RU, a valid context and at most two defaults.
- [ ] No two defaults conflict in overlapping contexts; no default is a chord, refused or modifier-only key.
- [ ] `resolve`, `conflictsWith`, `assign` (swap and replace), `refused`, `resetAction`, `resetAll`, `serialize` (overrides only) and `parse` (drops invalid, unknown, refused and newly conflicting entries without throwing) are covered by tests.
- [ ] Gates: G-CODE (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-INP-02: I2: one key source, the KeyRouter, Esc and the battle hotkeys

| Field | Value |
| --- | --- |
| Goal | I2: one key source, the KeyRouter, Esc and the battle hotkeys. |
| Type | Integration |
| Sprint and port slot | S6 · slot 1 (ports 6110–6119, V6-002) |
| Estimate | 2.5 d expected (2–3.5); confidence Medium |
| Depends on | V6-INP-01, V6-PLAT-02 |
| Governing ADRs and specs | ADR-0012 Decision 3 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/gameplay-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- src/ui/input/keySource.ts, keys.ts (new)
- src/main.ts (input.keyboard: false and the listener install)
- src/platform/nav.ts (subscribe)
- src/scenes/BattleScene.ts (handler registration next to the buttons)
- tests/keys.test.ts, tests/hotkeyReplay.test.ts (new)

**Shared files touched** (see SPRINTS.md "Shared files"): `src/main.ts`, `src/platform/*`, `src/scenes/BattleScene.ts`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/input-systems/SKILL.md`
- `/Users/v.gladis/.claude/skills/tdd/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/phaser-core/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/game-ui-ux/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] `tests/keys.test.ts`: press ignores auto-repeat, hold tracks down and up and clears on blur, editable and composing events are ignored, only handled keys report true, handlers unregister on shutdown, capture suspends everything.
- [ ] `tests/hotkeyReplay.test.ts`: a scripted battle driven by actions gives the same order log and replay hash as the button path (ADR-0001).
- [ ] Typing a clan name in the DOM prompt never fires a hotkey (Playwright).
- [ ] Esc closes the top layer, then goes back; in battle field mode it opens the ⋯ menu.
- [ ] A disabled button's hotkey shows its off reason and flashes the button.
- [ ] Gates: G-CODE, G-REPLAY (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-INP-03: I3: mouse buttons, right-click and right-drag orders, middle-drag pan, context menu, cursors and hover previews

| Field | Value |
| --- | --- |
| Goal | I3: mouse buttons, right-click and right-drag orders, middle-drag pan, context menu, cursors and hover previews. |
| Type | Integration |
| Sprint and port slot | S7 · slot 1 (ports 6110–6119, V6-002) |
| Estimate | 2.5 d expected (2–3.5); confidence Medium |
| Depends on | V6-INP-02, V6-RFND-04 |
| Governing ADRs and specs | ADR-0012 Decision 5, ADR-0004 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/gameplay-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- src/ui/input/gestures.ts
- src/ui/input/cursor.ts (new)
- src/ui/input/cursorApply.ts (new)
- src/scenes/BattleScene.ts (routing)
- src/scenes/WorldScene.ts, CampScene.ts, online/OnlineScene.ts (disableContextMenu and cursor lines)
- tests/input.test.ts (extended), tests/cursor.test.ts (new)
- public/cursors/ (optional pixel cursors; queue them in docs/v6/ASSET_LOG.md)

**Shared files touched** (see SPRINTS.md "Shared files"): `src/scenes/BattleScene.ts`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/input-systems/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/camera-systems/SKILL.md`
- `/Users/v.gladis/.claude/skills/tdd/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/phaser-core/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] The existing left-button and touch gesture tests pass unchanged; new cases cover right click, right-drag facing snapped to 8 directions within 8°, a sub-threshold right-drag as a click, cancel by Esc or a left press, and middle pan.
- [ ] The canvas never shows the browser context menu in field and map scenes; DOM fields keep theirs.
- [ ] `cursorFor` table test; touch never sets a cursor.
- [ ] Playwright at 1280x800: right click moves, right-drag moves and faces, middle-drag pans; replay-hash fixtures match.
- [ ] Gates: G-CODE, G-REPLAY (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-INP-04: I4: focus manager, focus ring and hover states for every kit and Mosaic control

| Field | Value |
| --- | --- |
| Goal | I4: focus manager, focus ring and hover states for every kit and Mosaic control. |
| Type | UI |
| Sprint and port slot | S8 · slot 1 (ports 6110–6119, V6-002) |
| Estimate | 3 d expected (2–4); confidence High |
| Depends on | V6-INP-02, V6-RFND-02 |
| Governing ADRs and specs | ADR-0012 Decision 4 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/ui-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- src/ui/input/focus.ts (new)
- src/ui/focusRing.ts (new)
- src/ui/kit.ts (tappable, Button, ScrollArea scroll-into-view)
- src/ui/hover.ts
- src/ui/mosaic/{MButton,KeyButton,Toggle,Stepper,Segmented,TabBar,TabStrip,ParchmentRow,StashGrid}.ts (registration lines)
- src/platform/nav.ts (navLayer scope hook)
- src/scenes/kit/statesPage.ts
- tests/focus.test.ts (new)

**Shared files touched** (see SPRINTS.md "Shared files"): `src/ui/kit.ts`, `src/platform/*`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/input-systems/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/game-ui-ux/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/ux-review/SKILL.md`
- `/Users/v.gladis/.claude/skills/tdd/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] `tests/focus.test.ts` per ADR-0012 (reading order, wrap, spatial moves, groups, trap, restore, destructive confirm defaults to Cancel, visible on key vs pointer).
- [ ] A Kit test opens every overlay kind and asserts Tab stays inside it.
- [ ] Playwright at 1280x800 and 1920x1080: Tab through the Menu hub, a sheet and a destructive confirm, Esc back, focus restored; the ring is visible on every background (screenshots).
- [ ] Hover shows a highlight and the hand cursor on fine pointers only (input-v6.md §2.1); touch shows no ring and no hover.
- [ ] Reduce motion: no ring slide.
- [ ] Gates: G-CODE, G-MATRIX, G-SHOTS (Kit states page, Menu) (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-INP-05: I5: Settings → Keyboard shortcuts page with capture, conflicts, reset and per-device save

| Field | Value |
| --- | --- |
| Goal | I5: Settings → Keyboard shortcuts page with capture, conflicts, reset and per-device save. |
| Type | UI |
| Sprint and port slot | S11 · slot 3 (ports 6130–6139, V6-002) |
| Estimate | 2 d expected (1.5–3); confidence Medium |
| Depends on | V6-INP-04 |
| Governing ADRs and specs | ADR-0012 Decisions 2 and 6 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/ui-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- src/ui/settings.ts (the Controls row only)
- src/ui/settings/controls.ts (new)
- src/i18n/controls.en.ts / controls.ru.ts (new) and one line in src/i18n/index.ts
- tests/settingsControls.test.ts (new)

**Shared files touched** (see SPRINTS.md "Shared files"): `src/ui/settings.ts`, `src/i18n/index.ts`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/input-systems/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/game-ui-ux/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/save-systems/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] The Controls section appears only when `InputHints.keyboard()` is true and appears live on `onChange` (test with a fake).
- [ ] Capture, refused key message, conflict Swap and Replace, row reset and Reset all work per input-v6.md §5; Esc and Tab are fixed.
- [ ] Playwright: rebind W for Advance with Swap, reload, the binding persists; another browser profile has defaults.
- [ ] With touch emulation at 390x844 there is no Controls section.
- [ ] Gates: G-CODE, G-MATRIX, G-SHOTS (Controls page, en and ru) (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-INP-06: I6: key labels and glyphs, keycaps, the shortcuts sheet, keyboard tutorial lines, keyboard-smoke and the doc follow-ups

| Field | Value |
| --- | --- |
| Goal | I6: key labels and glyphs, keycaps, the shortcuts sheet, keyboard tutorial lines, keyboard-smoke and the doc follow-ups. |
| Type | UI |
| Sprint and port slot | S12 · slot 3 (ports 6130–6139, V6-002) |
| Estimate | 2.5 d expected (2–3.5); confidence Medium |
| Depends on | V6-INP-03, V6-INP-05, V6-RSCR-02 |
| Governing ADRs and specs | ADR-0012 Decision 6 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/ui-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- src/ui/input/glyphs.ts (new)
- src/ui/keycap.ts (new)
- src/ui/shortcutsSheet.ts (new)
- src/ui/battleHud.ts (keycap lines)
- src/ui/tutorial/battleTutorial.ts (lines)
- scripts/keyboard-smoke.mjs (new)
- scripts/layout-check.mjs (battle-keys and kit-focus fixtures, append only)
- design/accessibility-requirements.md (A11Y-22)
- design/ux/* ("out of scope" headers)
- design/gdd/controls.md (Mouse row)
- tests/glyphs.test.ts (new)

**Shared files touched** (see SPRINTS.md "Shared files"): `scripts/layout-check.mjs`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/input-systems/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/game-ui-ux/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/localize/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] Labels come from `keyLabels()` or the US table; Ctrl vs ⌘ comes from a platform capability, not from game code reading the client platform (ARCH_REVIEW C-08).
- [ ] Keycaps appear after the first non-editable key and never on touch; they overlap the rim and never take width at landscape sizes (layout fixtures).
- [ ] The tutorial completes with mouse and keys only, and its lines show the current bindings.
- [ ] `scripts/keyboard-smoke.mjs` passes at 1280x800 and 1920x1080 (ADR-0012 browser list), including the hybrid run.
- [ ] The manual checks for Telegram Desktop (Windows, macOS) and Telegram Web (Esc, Tab, Space, right click) are written to docs/v6/qa/INPUT_MANUAL.md for QA.
- [ ] Gates: G-CODE, G-MATRIX, G-SHOTS (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").
