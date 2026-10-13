# Epic: Responsive screens: every screen family in landscape and tablet

> **ID**: v6-responsive-screens (stories V6-RSCR-NN)
> **Layer**: Presentation
> **GDD / spec**: design/ux/landscape-v6.md §6–§16 (accepted, V6-020); docs/v6/audit/UI.md §3 and §6
> **Architecture Module**: src/ui/mosaic shells and every scene family under src/scenes/
> **Status**: Ready
> **Engine Risk**: MEDIUM (Battle HUD is XL; camera framing changes)
> **Manifest Version**: design/ux/landscape-v6.md §2.3, §4, §5; ADR-0013 once accepted
> **Stories**: 11, below; schedule in `docs/v6/plan/SPRINTS.md`
> **Estimate**: 28.5 agent-days expected (sum of story expected values; not calibrated, no sprint history)
> **Created**: 2026-10-13 by P3-PLAN (`/create-epics`, `/create-stories`, `/estimate`)

## Overview

One story per screen family, in the order V6-018 sets: the shell and hubs first, then UI.md's effort ranking (Battle HUD, War and online, Duels, Army and Hero, Settlements and economy, World and Camp, First run and tutorial, Codex, Settings and dialogs, Kit and Boot). Each story implements its section of `design/ux/landscape-v6.md` (V6-020), lists the scene's real elements before re-laying it out, removes its pending allowlist file, and must pass the spec's §16 acceptance criteria that apply to it. V6-RSCR-11 ends with the pending mechanism and the legacy column gone.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0013 (to write in V6-RFND-01) | Size classes and the legacy column each family leaves. | MEDIUM |
| ADR-0005: UI kit | Mosaic components and the layout registry. | LOW |
| ADR-0012: Input v6 | Hover, focus ring and keycaps in landscape. | LOW |

## Requirements

*There is no `docs/architecture/tr-registry.yaml`; the IDs below are v6 requirement references traced to the brief, the decisions and the specs. At `standard` rigor untraced non-Foundation rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-v6-rsp-101 | Every game screen passes the ten-size matrix (brief hard constraint) | ADR-0013; design/ux/landscape-v6.md §16 |
| TR-v6-rsp-102 | No silent removal of a feature, information or action (brief) | design/ux/landscape-v6.md §5 element-parity |
| TR-v6-rsp-103 | Order: shell and hubs, then the UI.md effort order (V6-018) | N/A (plan) |

## Stories

| # | Story | Type | Status | Sprint | Est. days (E) | Depends on |
|---|-------|------|--------|--------|---------------|------------|
| V6-RSCR-01 | Shell and hubs: landscape and tablet layouts (AppShell tab bar or rail, hub and sub shells, ScreenFrame, TopBar, sheets as side panels, Menu) | UI | Ready | S9 | 3.5 | V6-RFND-01, V6-RFND-02, V6-RFND-03, V6-RFND-04, V6-INP-04 |
| V6-RSCR-02 | Battle HUD and Results: landscape and tablet layouts (Battle in all states incl. online, duel, beast, assault and works; Results and Inspect) | UI | Ready | S10 | 5 | V6-RSCR-01, V6-RFND-01, V6-RFND-02, V6-RFND-03, V6-RFND-04, V6-INP-04, V6-INP-03 |
| V6-RSCR-03 | War and the online hub: landscape and tablet layouts (Online war map, Online Army, Clan, Merchant) | UI | Ready | S11 | 3.5 | V6-RSCR-01, V6-RFND-01, V6-RFND-02, V6-RFND-03, V6-RFND-04, V6-INP-04 |
| V6-RSCR-04 | Duels: landscape and tablet layouts (Duel hub, Ladder, Arena, Team, duel Shop and their sheets) | UI | Ready | S12 | 4 | V6-RSCR-01, V6-RFND-01, V6-RFND-02, V6-RFND-03, V6-RFND-04, V6-INP-04 |
| V6-RSCR-05 | Army and Hero: landscape and tablet layouts (Army, Hero, stash and compare) | UI | Ready | S10 | 3 | V6-RSCR-01, V6-RFND-01, V6-RFND-02, V6-RFND-03, V6-RFND-04, V6-INP-04 |
| V6-RSCR-06 | Settlements and economy: landscape and tablet layouts (Settlement (all tabs), Market, Shop (layout only; the web wallet card is V6-PAY-02)) | UI | Ready | S11 | 2.5 | V6-RSCR-01, V6-RFND-01, V6-RFND-02, V6-RFND-03, V6-RFND-04, V6-INP-04 |
| V6-RSCR-07 | World and Camp maps: landscape and tablet layouts (World, Camp) | UI | Ready | S12 | 2 | V6-RSCR-01, V6-RFND-01, V6-RFND-02, V6-RFND-03, V6-RFND-04, V6-INP-04 |
| V6-RSCR-08 | First run and tutorial: landscape and tablet layouts (FirstRun, battle tutorial, online coach anchors) | UI | Ready | S14 | 1.5 | V6-RSCR-01, V6-RFND-01, V6-RFND-02, V6-RFND-03, V6-RFND-04, V6-INP-04, V6-INP-06, V6-LINK-07 |
| V6-RSCR-09 | Codex: landscape and tablet layouts (Codex, beast and doctrine sheets) | UI | Ready | S13 | 1 | V6-RSCR-01, V6-RFND-01, V6-RFND-02, V6-RFND-03, V6-RFND-04, V6-INP-04 |
| V6-RSCR-10 | Settings and dialogs: landscape and tablet layouts (Settings, Notifications, About, confirms, Kit overlays) | UI | Ready | S13 | 1 | V6-RSCR-01, V6-RFND-01, V6-RFND-02, V6-RFND-03, V6-RFND-04, V6-INP-04, V6-INP-05, V6-ACCT-07 |
| V6-RSCR-11 | Kit and Boot: landscape and tablet layouts (?scene=Kit pages, Boot, BeastTrial; removal of the legacy column and the pending mechanism) | UI | Ready | S15 | 1.5 | V6-RSCR-01, V6-RFND-01, V6-RFND-02, V6-RFND-03, V6-RFND-04, V6-INP-04, V6-RSCR-02, V6-RSCR-03, V6-RSCR-04, V6-RSCR-05, V6-RSCR-06, V6-RSCR-07, V6-RSCR-08, V6-RSCR-09, V6-RSCR-10 |

## Definition of Done

This epic is complete when:
- every story is implemented, reviewed by the Director against its "Skills applied" section, merged into `v6` by an integrator with every gate green, and closed with `/story-done`;
- every acceptance criterion above is checked with evidence (tests, gate output, screenshots in `docs/v6/shots/<story>/`);
- no story added a platform check to game code or grew the boundary allowlist (brief review gate);
- auth, account, linking, deletion, rate-limit and public-API stories passed `/security-audit` before merge.

## Story details

### V6-RSCR-01: Shell and hubs: landscape and tablet layouts (AppShell tab bar or rail, hub and sub shells, ScreenFrame, TopBar, sheets as side panels, Menu)

| Field | Value |
| --- | --- |
| Goal | Shell and hubs: landscape and tablet layouts (AppShell tab bar or rail, hub and sub shells, ScreenFrame, TopBar, sheets as side panels, Menu). |
| Type | UI |
| Sprint and port slot | S9 · slot 1 (ports 6110–6119, V6-002) |
| Estimate | 3.5 d expected (2.5–5); confidence Medium |
| Depends on | V6-RFND-01, V6-RFND-02, V6-RFND-03, V6-RFND-04, V6-INP-04, design/ux/landscape-v6.md (merged, V6-020) |
| Governing ADRs and specs | ADR-0013, ADR-0005, ADR-0012; spec: design/ux/landscape-v6.md §3.1, §3.4, §6 (6.1–6.5), §16.1–16.3, §16.7, §16.8 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/ui-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- src/ui/mosaic/{hub,subShell,ScreenFrame,TopBar,TabBar,ParchmentSheet}.ts
- src/scenes/MenuScene.ts
- scripts/layout-allowlist/<this story id>.json (its own file; delete it when empty)

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/game-ui-ux/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/ux-review/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/team-ui/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/phaser-core/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] Spec sections: §3.1, §3.4, §6 (6.1–6.5), §16.1–16.3, §16.7, §16.8.
- [ ] Before any change, NOTES.md lists the real elements of each scene from the scene code next to the spec's "Real elements" list for the family (brief: no silent removal); `element-parity` passes (§16.4).
- [ ] The family follows its "What goes where" section of design/ux/landscape-v6.md (named below) in compact portrait, compact landscape, medium and expanded, using the V6-RFND-02 primitives.
- [ ] The family's `scripts/layout-allowlist/<story>.json` (pending flag and 844x390 entries) is deleted: all nine §5 checks pass at every matrix size and layout-check shows 0 new.
- [ ] Phone landscape 844x390 uses the compact layout from the family's "Phone landscape" section (§14: no rotate fallback); the primary action is visible at scroll 0 with 0 touch-size, text-overflow and clipped violations (§16.3).
- [ ] Compact portrait (390x844, 360x780, 320x693) is unchanged from v5 except where the family section says otherwise (§16.9).
- [ ] Mouse at 1280x800: hover lightens, cursors per §4, Tab order follows §4 (top bar, master, detail, footer, nav); touch smoke unchanged.
- [ ] Before and after screenshots of every screen and state in the family at all ten sizes in en and ru, opened and checked.
- [ ] Hubs: bottom tab bar in portrait, left rail with labels in landscape (rail 84 UI at compact landscape, 72 at expanded); `nav-labels` passes at 844x390 with all five labels (§16.3).
- [ ] Task sheets open as right side panels in landscape and bottom sheets in compact portrait; decisions are centred dialogs; Esc and the shade close them and focus returns (§16.7).
- [ ] Gates: G-CODE, G-MATRIX, G-SHOTS (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-RSCR-02: Battle HUD and Results: landscape and tablet layouts (Battle in all states incl. online, duel, beast, assault and works; Results and Inspect)

| Field | Value |
| --- | --- |
| Goal | Battle HUD and Results: landscape and tablet layouts (Battle in all states incl. online, duel, beast, assault and works; Results and Inspect). |
| Type | UI |
| Sprint and port slot | S10 · slot 1 (ports 6110–6119, V6-002) |
| Estimate | 5 d expected (4–7); confidence Medium |
| Depends on | V6-RSCR-01, V6-RFND-01, V6-RFND-02, V6-RFND-03, V6-RFND-04, V6-INP-04, design/ux/landscape-v6.md (merged, V6-020), V6-INP-03 |
| Governing ADRs and specs | ADR-0013, ADR-0005, ADR-0012; spec: design/ux/landscape-v6.md §3.5, §7 (7.1–7.6), §16.5, §16.6 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/ui-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- src/scenes/BattleScene.ts (layout and camera-framing lines)
- src/ui/battleHud.ts
- src/ui/battlePanel.ts
- src/ui/battleCamera.ts
- src/scenes/ResultsScene.ts
- src/ui/results/**
- scripts/layout-allowlist/<this story id>.json (its own file; delete it when empty)

**Shared files touched** (see SPRINTS.md "Shared files"): `src/scenes/BattleScene.ts`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/game-ui-ux/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/ux-review/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/team-ui/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/camera-systems/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/phaser-core/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] Spec sections: §3.5, §7 (7.1–7.6), §16.5, §16.6.
- [ ] Before any change, NOTES.md lists the real elements of each scene from the scene code next to the spec's "Real elements" list for the family (brief: no silent removal); `element-parity` passes (§16.4).
- [ ] The family follows its "What goes where" section of design/ux/landscape-v6.md (named below) in compact portrait, compact landscape, medium and expanded, using the V6-RFND-02 primitives.
- [ ] The family's `scripts/layout-allowlist/<story>.json` (pending flag and 844x390 entries) is deleted: all nine §5 checks pass at every matrix size and layout-check shows 0 new.
- [ ] Phone landscape 844x390 uses the compact layout from the family's "Phone landscape" section (§14: no rotate fallback); the primary action is visible at scroll 0 with 0 touch-size, text-overflow and clipped violations (§16.3).
- [ ] Compact portrait (390x844, 360x780, 320x693) is unchanged from v5 except where the family section says otherwise (§16.9).
- [ ] Mouse at 1280x800: hover lightens, cursors per §4, Tab order follows §4 (top bar, master, detail, footer, nav); touch smoke unchanged.
- [ ] Before and after screenshots of every screen and state in the family at all ten sizes in en and ru, opened and checked.
- [ ] Field fills the screen: group cards in a left column, the five orders in one bottom-centre bar (a right thumb rail at 844x390), abilities on the right; field coverage ≥ 60% at 1280x800 and ≥ 50% at 844x390 (§16.5).
- [ ] The camera frames, follows and recentres inside the framing rect: the scripted 10 s follow at 844x390 and 1280x800 keeps the group centre inside it (§7.3, §16.6). The sim is untouched: replay-hash fixtures match.
- [ ] Results use two panes in landscape (Summary left, Heroes and Spoils right) and keep the Spoils-then-Continue flow (§7.5, §17).
- [ ] Keycap slots sit in each HUD control's top-right corner for V6-INP-06 without taking width (§4).
- [ ] Gates: G-CODE, G-MATRIX, G-SHOTS (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-RSCR-03: War and the online hub: landscape and tablet layouts (Online war map, Online Army, Clan, Merchant)

| Field | Value |
| --- | --- |
| Goal | War and the online hub: landscape and tablet layouts (Online war map, Online Army, Clan, Merchant). |
| Type | UI |
| Sprint and port slot | S11 · slot 1 (ports 6110–6119, V6-002) |
| Estimate | 3.5 d expected (2.5–5); confidence Medium |
| Depends on | V6-RSCR-01, V6-RFND-01, V6-RFND-02, V6-RFND-03, V6-RFND-04, V6-INP-04, design/ux/landscape-v6.md (merged, V6-020) |
| Governing ADRs and specs | ADR-0013, ADR-0005, ADR-0012; spec: design/ux/landscape-v6.md §8 (8.1–8.4), §15 States, §16.4 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/ui-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- src/scenes/online/{OnlineScene,OnlineArmyScene,ClanScene,MerchantScene}.ts
- src/scenes/online/{regionMapView,beastPanel}.ts
- src/ui/tutorial/onlineCoach.ts (anchors only)
- scripts/layout-allowlist/<this story id>.json (its own file; delete it when empty)

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/game-ui-ux/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/ux-review/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/team-ui/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/camera-systems/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/phaser-core/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] Spec sections: §8 (8.1–8.4), §15 States, §16.4.
- [ ] Before any change, NOTES.md lists the real elements of each scene from the scene code next to the spec's "Real elements" list for the family (brief: no silent removal); `element-parity` passes (§16.4).
- [ ] The family follows its "What goes where" section of design/ux/landscape-v6.md (named below) in compact portrait, compact landscape, medium and expanded, using the V6-RFND-02 primitives.
- [ ] The family's `scripts/layout-allowlist/<story>.json` (pending flag and 844x390 entries) is deleted: all nine §5 checks pass at every matrix size and layout-check shows 0 new.
- [ ] Phone landscape 844x390 uses the compact layout from the family's "Phone landscape" section (§14: no rotate fallback); the primary action is visible at scroll 0 with 0 touch-size, text-overflow and clipped violations (§16.3).
- [ ] Compact portrait (390x844, 360x780, 320x693) is unchanged from v5 except where the family section says otherwise (§16.9).
- [ ] Mouse at 1280x800: hover lightens, cursors per §4, Tab order follows §4 (top bar, master, detail, footer, nav); touch smoke unchanged.
- [ ] Before and after screenshots of every screen and state in the family at all ten sizes in en and ru, opened and checked.
- [ ] The map is full bleed with its own framing rect (§8.3); the hex panel is a side panel; the War map's Army, Clan, Lobby, Centre and Zoom are visible at 844x390 (§16.4); coach bubbles re-point to the moved anchors.
- [ ] The server-down card sits in its pane over the stone map backdrop, not a blank page (§15).
- [ ] Gates: G-CODE, G-MATRIX, G-SHOTS (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-RSCR-04: Duels: landscape and tablet layouts (Duel hub, Ladder, Arena, Team, duel Shop and their sheets)

| Field | Value |
| --- | --- |
| Goal | Duels: landscape and tablet layouts (Duel hub, Ladder, Arena, Team, duel Shop and their sheets). |
| Type | UI |
| Sprint and port slot | S12 · slot 1 (ports 6110–6119, V6-002) |
| Estimate | 4 d expected (3–5.5); confidence Medium |
| Depends on | V6-RSCR-01, V6-RFND-01, V6-RFND-02, V6-RFND-03, V6-RFND-04, V6-INP-04, design/ux/landscape-v6.md (merged, V6-020) |
| Governing ADRs and specs | ADR-0013, ADR-0005, ADR-0012; spec: design/ux/landscape-v6.md §9 (9.1–9.3) |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/ui-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- src/scenes/duel/**
- scripts/layout-allowlist/<this story id>.json (its own file; delete it when empty)

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/game-ui-ux/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/ux-review/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/team-ui/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/phaser-core/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] Spec sections: §9 (9.1–9.3).
- [ ] Before any change, NOTES.md lists the real elements of each scene from the scene code next to the spec's "Real elements" list for the family (brief: no silent removal); `element-parity` passes (§16.4).
- [ ] The family follows its "What goes where" section of design/ux/landscape-v6.md (named below) in compact portrait, compact landscape, medium and expanded, using the V6-RFND-02 primitives.
- [ ] The family's `scripts/layout-allowlist/<story>.json` (pending flag and 844x390 entries) is deleted: all nine §5 checks pass at every matrix size and layout-check shows 0 new.
- [ ] Phone landscape 844x390 uses the compact layout from the family's "Phone landscape" section (§14: no rotate fallback); the primary action is visible at scroll 0 with 0 touch-size, text-overflow and clipped violations (§16.3).
- [ ] Compact portrait (390x844, 360x780, 320x693) is unchanged from v5 except where the family section says otherwise (§16.9).
- [ ] Mouse at 1280x800: hover lightens, cursors per §4, Tab order follows §4 (top bar, master, detail, footer, nav); touch smoke unchanged.
- [ ] Before and after screenshots of every screen and state in the family at all ten sizes in en and ru, opened and checked.
- [ ] The profile column frees the height in compact landscape; ladder and leaderboards use the Grid or table columns per §9.2.
- [ ] Gates: G-CODE, G-MATRIX, G-SHOTS (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-RSCR-05: Army and Hero: landscape and tablet layouts (Army, Hero, stash and compare)

| Field | Value |
| --- | --- |
| Goal | Army and Hero: landscape and tablet layouts (Army, Hero, stash and compare). |
| Type | UI |
| Sprint and port slot | S10 · slot 2 (ports 6120–6129, V6-002) |
| Estimate | 3 d expected (2–4); confidence High |
| Depends on | V6-RSCR-01, V6-RFND-01, V6-RFND-02, V6-RFND-03, V6-RFND-04, V6-INP-04, design/ux/landscape-v6.md (merged, V6-020) |
| Governing ADRs and specs | ADR-0013, ADR-0005, ADR-0012; spec: design/ux/landscape-v6.md §10 (10.1–10.3), §16.8 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/ui-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- src/scenes/ArmyScene.ts
- src/scenes/HeroScene.ts
- src/ui/army/**
- stash and compare views under src/ui/
- scripts/layout-allowlist/<this story id>.json (its own file; delete it when empty)

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/game-ui-ux/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/ux-review/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/team-ui/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/phaser-core/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] Spec sections: §10 (10.1–10.3), §16.8.
- [ ] Before any change, NOTES.md lists the real elements of each scene from the scene code next to the spec's "Real elements" list for the family (brief: no silent removal); `element-parity` passes (§16.4).
- [ ] The family follows its "What goes where" section of design/ux/landscape-v6.md (named below) in compact portrait, compact landscape, medium and expanded, using the V6-RFND-02 primitives.
- [ ] The family's `scripts/layout-allowlist/<story>.json` (pending flag and 844x390 entries) is deleted: all nine §5 checks pass at every matrix size and layout-check shows 0 new.
- [ ] Phone landscape 844x390 uses the compact layout from the family's "Phone landscape" section (§14: no rotate fallback); the primary action is visible at scroll 0 with 0 touch-size, text-overflow and clipped violations (§16.3).
- [ ] Compact portrait (390x844, 360x780, 320x693) is unchanged from v5 except where the family section says otherwise (§16.9).
- [ ] Mouse at 1280x800: hover lightens, cursors per §4, Tab order follows §4 (top bar, master, detail, footer, nav); touch smoke unchanged.
- [ ] Before and after screenshots of every screen and state in the family at all ten sizes in en and ru, opened and checked.
- [ ] Master-detail and the paper doll side by side; dragging a stash item onto a hero slot shows valid and invalid targets with the §4 cursors (§16.8).
- [ ] Gates: G-CODE, G-MATRIX, G-SHOTS (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-RSCR-06: Settlements and economy: landscape and tablet layouts (Settlement (all tabs), Market, Shop (layout only; the web wallet card is V6-PAY-02))

| Field | Value |
| --- | --- |
| Goal | Settlements and economy: landscape and tablet layouts (Settlement (all tabs), Market, Shop (layout only; the web wallet card is V6-PAY-02)). |
| Type | UI |
| Sprint and port slot | S11 · slot 2 (ports 6120–6129, V6-002) |
| Estimate | 2.5 d expected (2–3.5); confidence Medium |
| Depends on | V6-RSCR-01, V6-RFND-01, V6-RFND-02, V6-RFND-03, V6-RFND-04, V6-INP-04, design/ux/landscape-v6.md (merged, V6-020) |
| Governing ADRs and specs | ADR-0013, ADR-0005, ADR-0012; spec: design/ux/landscape-v6.md §11 (11.1–11.3) |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/ui-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- src/scenes/SettlementScene.ts
- src/scenes/MarketScene.ts
- src/scenes/ShopScene.ts (layout)
- src/ui/econ/consumablePicker.ts
- scripts/layout-allowlist/<this story id>.json (its own file; delete it when empty)

**Shared files touched** (see SPRINTS.md "Shared files"): `src/scenes/ShopScene.ts`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/game-ui-ux/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/ux-review/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/team-ui/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/phaser-core/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] Spec sections: §11 (11.1–11.3).
- [ ] Before any change, NOTES.md lists the real elements of each scene from the scene code next to the spec's "Real elements" list for the family (brief: no silent removal); `element-parity` passes (§16.4).
- [ ] The family follows its "What goes where" section of design/ux/landscape-v6.md (named below) in compact portrait, compact landscape, medium and expanded, using the V6-RFND-02 primitives.
- [ ] The family's `scripts/layout-allowlist/<story>.json` (pending flag and 844x390 entries) is deleted: all nine §5 checks pass at every matrix size and layout-check shows 0 new.
- [ ] Phone landscape 844x390 uses the compact layout from the family's "Phone landscape" section (§14: no rotate fallback); the primary action is visible at scroll 0 with 0 touch-size, text-overflow and clipped violations (§16.3).
- [ ] Compact portrait (390x844, 360x780, 320x693) is unchanged from v5 except where the family section says otherwise (§16.9).
- [ ] Mouse at 1280x800: hover lightens, cursors per §4, Tab order follows §4 (top bar, master, detail, footer, nav); touch smoke unchanged.
- [ ] Before and after screenshots of every screen and state in the family at all ten sizes in en and ru, opened and checked.
- [ ] Banner pane plus filter sidebar in landscape; Settlement, the worst screen in the audit at 844x390, passes §16.3.
- [ ] Gates: G-CODE, G-MATRIX, G-SHOTS (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-RSCR-07: World and Camp maps: landscape and tablet layouts (World, Camp)

| Field | Value |
| --- | --- |
| Goal | World and Camp maps: landscape and tablet layouts (World, Camp). |
| Type | UI |
| Sprint and port slot | S12 · slot 2 (ports 6120–6129, V6-002) |
| Estimate | 2 d expected (1.5–3); confidence Medium |
| Depends on | V6-RSCR-01, V6-RFND-01, V6-RFND-02, V6-RFND-03, V6-RFND-04, V6-INP-04, design/ux/landscape-v6.md (merged, V6-020) |
| Governing ADRs and specs | ADR-0013, ADR-0005, ADR-0012; spec: design/ux/landscape-v6.md §12 (12.1–12.4) |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/ui-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- src/scenes/WorldScene.ts
- src/scenes/CampScene.ts
- scripts/layout-allowlist/<this story id>.json (its own file; delete it when empty)

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/game-ui-ux/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/ux-review/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/camera-systems/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/phaser-core/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] Spec sections: §12 (12.1–12.4).
- [ ] Before any change, NOTES.md lists the real elements of each scene from the scene code next to the spec's "Real elements" list for the family (brief: no silent removal); `element-parity` passes (§16.4).
- [ ] The family follows its "What goes where" section of design/ux/landscape-v6.md (named below) in compact portrait, compact landscape, medium and expanded, using the V6-RFND-02 primitives.
- [ ] The family's `scripts/layout-allowlist/<story>.json` (pending flag and 844x390 entries) is deleted: all nine §5 checks pass at every matrix size and layout-check shows 0 new.
- [ ] Phone landscape 844x390 uses the compact layout from the family's "Phone landscape" section (§14: no rotate fallback); the primary action is visible at scroll 0 with 0 touch-size, text-overflow and clipped violations (§16.3).
- [ ] Compact portrait (390x844, 360x780, 320x693) is unchanged from v5 except where the family section says otherwise (§16.9).
- [ ] Mouse at 1280x800: hover lightens, cursors per §4, Tab order follows §4 (top bar, master, detail, footer, nav); touch smoke unchanged.
- [ ] Before and after screenshots of every screen and state in the family at all ten sizes in en and ru, opened and checked.
- [ ] Overlays become edge clusters; the cameras frame inside the framing rect (§12.3); field-coverage passes.
- [ ] Gates: G-CODE, G-MATRIX, G-SHOTS (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-RSCR-08: First run and tutorial: landscape and tablet layouts (FirstRun, battle tutorial, online coach anchors)

| Field | Value |
| --- | --- |
| Goal | First run and tutorial: landscape and tablet layouts (FirstRun, battle tutorial, online coach anchors). |
| Type | UI |
| Sprint and port slot | S14 · slot 1 (ports 6110–6119, V6-002) |
| Estimate | 1.5 d expected (1–2.5); confidence Low |
| Depends on | V6-RSCR-01, V6-RFND-01, V6-RFND-02, V6-RFND-03, V6-RFND-04, V6-INP-04, design/ux/landscape-v6.md (merged, V6-020), V6-INP-06, V6-LINK-07 |
| Governing ADRs and specs | ADR-0013, ADR-0005, ADR-0012; spec: design/ux/landscape-v6.md §13.1 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/ui-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- src/scenes/FirstRunScene.ts
- src/ui/tutorial/** (layout and anchors)
- scripts/layout-allowlist/<this story id>.json (its own file; delete it when empty)

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/game-ui-ux/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/ux-review/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/team-ui/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/phaser-core/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] Spec sections: §13.1.
- [ ] Before any change, NOTES.md lists the real elements of each scene from the scene code next to the spec's "Real elements" list for the family (brief: no silent removal); `element-parity` passes (§16.4).
- [ ] The family follows its "What goes where" section of design/ux/landscape-v6.md (named below) in compact portrait, compact landscape, medium and expanded, using the V6-RFND-02 primitives.
- [ ] The family's `scripts/layout-allowlist/<story>.json` (pending flag and 844x390 entries) is deleted: all nine §5 checks pass at every matrix size and layout-check shows 0 new.
- [ ] Phone landscape 844x390 uses the compact layout from the family's "Phone landscape" section (§14: no rotate fallback); the primary action is visible at scroll 0 with 0 touch-size, text-overflow and clipped violations (§16.3).
- [ ] Compact portrait (390x844, 360x780, 320x693) is unchanged from v5 except where the family section says otherwise (§16.9).
- [ ] Mouse at 1280x800: hover lightens, cursors per §4, Tab order follows §4 (top bar, master, detail, footer, nav); touch smoke unchanged.
- [ ] Before and after screenshots of every screen and state in the family at all ten sizes in en and ru, opened and checked.
- [ ] FirstRun's 200-px column no longer fails `empty-column`; tutorial-smoke passes at 390x844, 844x390, 1280x800 and 1920x1080.
- [ ] Gates: G-CODE, G-MATRIX, G-SHOTS (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-RSCR-09: Codex: landscape and tablet layouts (Codex, beast and doctrine sheets)

| Field | Value |
| --- | --- |
| Goal | Codex: landscape and tablet layouts (Codex, beast and doctrine sheets). |
| Type | UI |
| Sprint and port slot | S13 · slot 1 (ports 6110–6119, V6-002) |
| Estimate | 1 d expected (0.5–1.5); confidence Medium |
| Depends on | V6-RSCR-01, V6-RFND-01, V6-RFND-02, V6-RFND-03, V6-RFND-04, V6-INP-04, design/ux/landscape-v6.md (merged, V6-020) |
| Governing ADRs and specs | ADR-0013, ADR-0005, ADR-0012; spec: design/ux/landscape-v6.md §13.2 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/ui-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- src/scenes/CodexScene.ts
- Codex sheet helpers under src/ui/
- scripts/layout-allowlist/<this story id>.json (its own file; delete it when empty)

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/game-ui-ux/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/ux-review/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/team-ui/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/phaser-core/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] Spec sections: §13.2.
- [ ] Before any change, NOTES.md lists the real elements of each scene from the scene code next to the spec's "Real elements" list for the family (brief: no silent removal); `element-parity` passes (§16.4).
- [ ] The family follows its "What goes where" section of design/ux/landscape-v6.md (named below) in compact portrait, compact landscape, medium and expanded, using the V6-RFND-02 primitives.
- [ ] The family's `scripts/layout-allowlist/<story>.json` (pending flag and 844x390 entries) is deleted: all nine §5 checks pass at every matrix size and layout-check shows 0 new.
- [ ] Phone landscape 844x390 uses the compact layout from the family's "Phone landscape" section (§14: no rotate fallback); the primary action is visible at scroll 0 with 0 touch-size, text-overflow and clipped violations (§16.3).
- [ ] Compact portrait (390x844, 360x780, 320x693) is unchanged from v5 except where the family section says otherwise (§16.9).
- [ ] Mouse at 1280x800: hover lightens, cursors per §4, Tab order follows §4 (top bar, master, detail, footer, nav); touch smoke unchanged.
- [ ] Before and after screenshots of every screen and state in the family at all ten sizes in en and ru, opened and checked.
- [ ] Card grid via Grid and a detail pane (§13.2).
- [ ] Gates: G-CODE, G-MATRIX, G-SHOTS (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-RSCR-10: Settings and dialogs: landscape and tablet layouts (Settings, Notifications, About, confirms, Kit overlays)

| Field | Value |
| --- | --- |
| Goal | Settings and dialogs: landscape and tablet layouts (Settings, Notifications, About, confirms, Kit overlays). |
| Type | UI |
| Sprint and port slot | S13 · slot 2 (ports 6120–6129, V6-002) |
| Estimate | 1 d expected (0.5–1.5); confidence Medium |
| Depends on | V6-RSCR-01, V6-RFND-01, V6-RFND-02, V6-RFND-03, V6-RFND-04, V6-INP-04, design/ux/landscape-v6.md (merged, V6-020), V6-INP-05, V6-ACCT-07 |
| Governing ADRs and specs | ADR-0013, ADR-0005, ADR-0012; spec: design/ux/landscape-v6.md §13.3, §16.7 |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/ui-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- src/ui/settings.ts (layout)
- src/ui/notifySettings.ts
- src/ui/legal.ts
- confirm and dialog helpers in src/ui/
- scripts/layout-allowlist/<this story id>.json (its own file; delete it when empty)

**Shared files touched** (see SPRINTS.md "Shared files"): `src/ui/settings.ts`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/game-ui-ux/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/ux-review/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/team-ui/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/phaser-core/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] Spec sections: §13.3, §16.7.
- [ ] Before any change, NOTES.md lists the real elements of each scene from the scene code next to the spec's "Real elements" list for the family (brief: no silent removal); `element-parity` passes (§16.4).
- [ ] The family follows its "What goes where" section of design/ux/landscape-v6.md (named below) in compact portrait, compact landscape, medium and expanded, using the V6-RFND-02 primitives.
- [ ] The family's `scripts/layout-allowlist/<story>.json` (pending flag and 844x390 entries) is deleted: all nine §5 checks pass at every matrix size and layout-check shows 0 new.
- [ ] Phone landscape 844x390 uses the compact layout from the family's "Phone landscape" section (§14: no rotate fallback); the primary action is visible at scroll 0 with 0 touch-size, text-overflow and clipped violations (§16.3).
- [ ] Compact portrait (390x844, 360x780, 320x693) is unchanged from v5 except where the family section says otherwise (§16.9).
- [ ] Mouse at 1280x800: hover lightens, cursors per §4, Tab order follows §4 (top bar, master, detail, footer, nav); touch smoke unchanged.
- [ ] Before and after screenshots of every screen and state in the family at all ten sizes in en and ru, opened and checked.
- [ ] Settings stays one column, max 320 UI (§17); dialogs ≤ 320 UI.
- [ ] Gates: G-CODE, G-MATRIX, G-SHOTS (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").

### V6-RSCR-11: Kit and Boot: landscape and tablet layouts (?scene=Kit pages, Boot, BeastTrial; removal of the legacy column and the pending mechanism)

| Field | Value |
| --- | --- |
| Goal | Kit and Boot: landscape and tablet layouts (?scene=Kit pages, Boot, BeastTrial; removal of the legacy column and the pending mechanism). |
| Type | UI |
| Sprint and port slot | S15 · slot 1 (ports 6110–6119, V6-002) |
| Estimate | 1.5 d expected (1–2); confidence High |
| Depends on | V6-RSCR-01, V6-RFND-01, V6-RFND-02, V6-RFND-03, V6-RFND-04, V6-INP-04, design/ux/landscape-v6.md (merged, V6-020), V6-RSCR-02, V6-RSCR-03, V6-RSCR-04, V6-RSCR-05, V6-RSCR-06, V6-RSCR-07, V6-RSCR-08, V6-RSCR-09, V6-RSCR-10 |
| Governing ADRs and specs | ADR-0013, ADR-0005, ADR-0012; spec: design/ux/landscape-v6.md §13.4, §16 (all) |
| Agent role file | `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/agents/ui-programmer.md` (run as `general-purpose` reading this file, V6-004) |

**Files owned:**
- src/scenes/KitScene.ts
- src/scenes/kit/** (except layoutsPage.ts, formsPage.ts)
- src/scenes/BootScene.ts (layout only)
- src/ui/kit.ts (legacy-column removal only)
- scripts/layout-check.mjs (delete the pending table)

**Shared files touched** (see SPRINTS.md "Shared files"): `src/ui/kit.ts`, `src/scenes/BootScene.ts`, `scripts/layout-check.mjs`

**Skills** (read each SKILL.md first and follow it; report a "Skills applied" section):
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/game-ui-ux/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/ux-review/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/team-ui/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/phaser-core/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-readiness/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/dev-story/SKILL.md`
- `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/skills/story-done/SKILL.md`

**Acceptance criteria:**
- [ ] Spec sections: §13.4, §16 (all).
- [ ] Before any change, NOTES.md lists the real elements of each scene from the scene code next to the spec's "Real elements" list for the family (brief: no silent removal); `element-parity` passes (§16.4).
- [ ] The family follows its "What goes where" section of design/ux/landscape-v6.md (named below) in compact portrait, compact landscape, medium and expanded, using the V6-RFND-02 primitives.
- [ ] The family's `scripts/layout-allowlist/<story>.json` (pending flag and 844x390 entries) is deleted: all nine §5 checks pass at every matrix size and layout-check shows 0 new.
- [ ] Phone landscape 844x390 uses the compact layout from the family's "Phone landscape" section (§14: no rotate fallback); the primary action is visible at scroll 0 with 0 touch-size, text-overflow and clipped violations (§16.3).
- [ ] Compact portrait (390x844, 360x780, 320x693) is unchanged from v5 except where the family section says otherwise (§16.9).
- [ ] Mouse at 1280x800: hover lightens, cursors per §4, Tab order follows §4 (top bar, master, detail, footer, nav); touch smoke unchanged.
- [ ] Before and after screenshots of every screen and state in the family at all ten sizes in en and ru, opened and checked.
- [ ] The legacy column and the pending mechanism are deleted; all nine §5 checks are enforced on every screen; every §16 criterion passes across the matrix (results table in NOTES.md).
- [ ] Gates: G-CODE, G-MATRIX, G-SHOTS (defined in `docs/v6/plan/SPRINTS.md` "Gate sets").
