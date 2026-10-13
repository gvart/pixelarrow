# IN-02: the menu input contract, notes

The ADRs are [ADR-0004](../../../../design/adr/ADR-0004-input-layer.md) (input layer) and [ADR-0005](../../../../design/adr/ADR-0005-ui-kit.md) (the kit's control contract). This file records what changed and the calls made while the user was asleep.

## What changed

- **AC1: 44 pt, 4 pt and the text floor in layout-check.** The touch-size (44x44 pt, A11Y-06) and spacing (4 pt, A11Y-07) rules were already in `src/ui/layoutCheck.ts`. They are now pinned by tests, and no screen breaks them outside the existing allowlist. New rule `text-size`: text that carries meaning under 13 CSS px (6.5 UI px, A11Y-09) fails. The registry (`src/ui/layout.ts`) records each bitmap text's font size, including its parents' scale and the camera zoom. This is the layout-check half of F-01's AC4, deferred by F-01 and F-02.
- **AC3: the tap probe.** For every interactive element, the registry presses its drawn box at the centre and at 25 % in from each corner, using Phaser's own `InputManager.hitTest`. Rule `tap` fails any element where a press misses its hit area. v3's four `Geom.Rectangle(w/2, h/2, ...)` call sites (InfoChip, Toggle, Tile, ToggleChip) now go through `hitBox()` in `src/ui/v3.ts`. It places the rectangle at the container's reported display origin, so the w/2 offset is no longer assumed. A sanity run with the old origin bug put back (a `Rectangle(0, 0, w, h)` hit area) made the probe flag every v3 chip and tile on `kit-v3` ("a tap at top-right ... misses it"). With the fix, no screen has a `tap` violation.
- **AC2: hover tips.** `src/ui/hover.ts` (new) waits until the mouse has rested on a control for 500 ms, then shows the same tip as the long-press. The tip closes when the mouse leaves, and a press cancels a tip that has not shown yet. A finger never hovers (`wasTouch`), so touch behaviour is unchanged. It is wired at the kit's two long-press entry points in `src/ui/kit.ts`, `tappable()` and `Button`. That covers every v3, v4 (mosaic `makePressable`) and kit control that has a tip, a disabled reason or a cut label.
- v3's last small texts (the Tile sub line at 6 and the header note at 5.5) are now `TEXT_MIN`.

## Decisions

1. **Edited files outside the story's list, minimally.** `src/ui/layout.ts` (the registry) collects the font size and runs the probe, because F-01's and F-02's notes name it as part of this rule. `src/ui/kit.ts` needed one call in `tappable` and one in `Button`, and `longPress.show` may now return the tooltip so that hover can close it. No W8 story owns these files.
2. **The text floor is allowlisted per screen (`screen|text-size|*`), not per element.** One run found about 400 small texts at 390x844 alone. Their ids are often the text itself, which differs between en and ru, so per-element entries would have run to well over a thousand. Each screen gets one entry owned by its screen story (`STORY_OF` in the script). The trade-off: a new small text on a screen that is already allowlisted is not caught until that story fixes the screen and removes the entry. Touch size, spacing and the tap probe stay per element.
3. **A new allowlist group `F`, for the text floor only.** The foundation screens (Kit, menu, onboarding and the tutorial battle, whose small text is the battle HUD) must stay clean, and `--update-allowlist` still never writes any other check for them. The text floor arrived after they were built, so their existing small text is listed under `F` with its owner: F-05 for the Kit gallery, DLG-01 for settings, TUT-02 for the tutorial screens, HUB-02 for the menu.
4. **Map labels are exempt** from the text floor (`world` elements). They scale with the player's pinch zoom.
5. **13 CSS px, not 6.5 UI px.** On every phone size a UI px is 2 CSS px (`uiMetrics`: S >= 2), so the two are the same check there. CSS px is what `design/accessibility-requirements.md` A11Y-09 states.
6. **Battle terrain hover is not in this story.** The (i) Inspect terrain tooltip lives in `BattleScene.ts` and the order cards in `battlePanel.ts`, and CT-03 holds both this wave. They need the same `hoverTip()` call, which is a follow-up for BTL-01 or the next story on those files. Every menu and map control already gets hover from the kit.
7. **Hover delay 500 ms**: a common desktop tooltip delay, close to the 450 ms long-press.

## Gates (2026-10-10, production build via `vite preview`)

- `npx tsc --noEmit`: clean.
- `npx vitest run`: 81 files, 941 tests passed (`tests/inputContract.test.ts`: 15 new tests).
- `npx vite build`: OK.
- `node scripts/layout-check.mjs --no-shots`: 24 configurations x 150 screens, **passed**, 0 new. That is 1776 distinct violations, 1770 of them text-size, covered by 92 per-screen entries; the other 6 are the old entries. No `tap` violation anywhere.
- `node scripts/smoke.mjs`: ALL PASS (45). `node scripts/tutorial-smoke.mjs`: PASSED (48).
- Hover, checked by hand in Playwright on the Kit's v3 tab with a mouse. The tab labels, the volume stepper and the pager arrows show their long-press tip after 500 ms, and the tip closes when the mouse leaves.
