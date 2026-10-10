# Epic: UI foundation: design system and kit

> **ID**: EP-01
> **Layer**: Foundation
> **GDD**: design/ux/interaction-patterns.md, design/accessibility-requirements.md, design/art/art-bible.md (S2-ART-BIBLE)
> **Architecture Module**: src/ui (tokens, mosaic kit, overlays), src/art (fonts, icons, mosaicUi), src/scenes/KitScene.ts
> **Status**: Ready
> **Engine Risk**: LOW
> **Stories**: 7, in `docs/v5/plan/STORIES.md` (section EP-01)

## Overview

Gives every later screen one set of tokens, type, components and icons, rendered in `?scene=Kit`. It fixes the shell-wide audit findings at the source (G1 word splitting, G2/G3 colour roles, G5 scrim, G6 close, G9 scroll cue, G10 text size, G11 badges, G14 overflow) and meets the Standard accessibility tier (A11Y-01, 02, 04, 05, 09, 10). It ends by deleting the dead code and, last of all, `src/ui/v3.ts` and `src/ui/inkSkin.ts` once no screen imports them.

## Governing ADRs

| ADR | Decision Summary | Engine Risk |
|-----|-----------------|-------------|
| ADR-0005: UI kit on the procedural mosaic (to write in F-02) | Chrome stays procedural on src/ui/mosaic + src/art/mosaicUi.ts; v3.ts and the inkify shim retire once unused. | LOW |
| ADR-0003: Engine version (Rejected: stay on Phaser 3.90) | Phaser 3.90 APIs only. | LOW |

## GDD Requirements

*No `docs/architecture/tr-registry.yaml` exists in this repo. At `standard` rigor only Foundation ADRs are expected, so the IDs below are GDD rule references and untraced rows are informational (create-epics §4).*

| TR-ID | Requirement | ADR Coverage |
|-------|-------------|--------------|
| TR-ui-001 | Colour roles: grey only for disabled, red only for alerts and count badges (G2, G3, A11Y-05) | ADR-0005 (pending) |
| TR-ui-002 | Text that carries meaning >= 6.5 UI px; Cinzel never splits words (G1, G10, A11Y-09) | ADR-0005 (pending) |
| TR-ui-003 | Contrast pairs 4.5:1 text, 3:1 parts, auto-checked (A11Y-01, 02) | ADR-0005 (pending) |
| TR-ui-004 | Components: frames, buttons, cards, tab bar, dialogs, pills, badges, scroll cue, no ellipsis on must-show facts (G5, G6, G9, G11, G14) | ADR-0005 (pending) |
| TR-ui-005 | Icon atlas pipeline from the art pipeline (scripts/art) into the game atlas, with a Codex book icon | No ADR (informational) |
| TR-ui-006 | `?scene=Kit` shows every component x variant x state (KIT-2) | No ADR (informational) |
| TR-ui-007 | Dead code removed (E103, E209, E270, E331, Campaign.recruit); v3 + inkify retired when unused (KIT-1) | No ADR (informational) |

## Stories

| # | Story | Type | Status | Est. days (E) | Wave |
|---|-------|------|--------|---------------|------|
| F-01 | v5 tokens, colour roles, type scale and the Cinzel word-split fix, from the art bible. | UI | Ready | 1.5 | W1 |
| F-02 | Kit controls: frames, buttons (primary/secondary/disabled), cards, tab bar, pills, badges, scroll cue, overflow policy; ADR-0005. | UI | Ready | 2.5 | W2 |
| F-03 | Kit overlays: sheet, confirm, toast, scrim, close affordance, the one-sheet-plus-one-confirm rule. | UI | Ready | 2 | W3 |
| F-04 | Icon atlas pipeline: art-pipeline icons into the game atlas, Codex book icon, v5 icons slots. | Integration | Ready | 1.5 | W5 |
| F-05 | `?scene=Kit` shows every component x variant x state (KIT-2). | UI | Ready | 1 | W6 |
| F-06 | Remove the dead code the audits found (WorldScene placing path, campPanel, common.ts helpers, Campaign.recruit). | Config/Data | Ready | 0.5 | W9 |
| F-07 | Retire `src/ui/v3.ts` and the inkify shim `src/ui/inkSkin.ts` once no screen imports them. | Config/Data | Ready | 1 | W21 |

## Definition of Done

This epic is complete when:
- All stories are implemented, reviewed, merged into `v5` by an integrator, and closed via `/story-done`
- All acceptance criteria from the GDD(s) above are verified, experiential ones in QA-03
- All Logic and Integration stories have passing test files in `tests/` (and `server/test/` for server code)
- All UI and Visual/Feel stories have screenshots at 390x844 and 360x780 in `docs/v5/shots/<story-id>/`
- Mechanic stories have `npm run balance` before/after recorded in `docs/v5/balance/<story-id>.md`

## Next Step

Dispatch the stories by wave from `docs/v5/plan/SPRINTS.md`. Each story starts with `/story-readiness` against its row in STORIES.md.
