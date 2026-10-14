# ADR-0013: Responsive scale policy: size classes, whole-number S, the UIMetrics contract and the legacy column

## Status
Accepted with the legacy-column deviation (Director, 2026-10-14, V6-055)

## Date
2026-10-14

## Last Verified
2026-10-14

## Decision Makers
Autonomous v6 run, story V6-RFND-01, written in the `lead-programmer` role from the accepted UX spec `design/ux/landscape-v6.md` §1–§2 (V6-020) and the interim mode in V6-021.

## Summary
Every wide screen showed the game as a portrait phone column: `index.html` capped `#game` at 0.64 × its height, and `uiMetrics` picked the UI scale from height alone (V6-018). This ADR amends ADR-0005: `#game` fills the safe area, `uiMetrics` reports a size class (compact, medium, expanded) with a whole-number S per class and the content caps, and a scene that has not migrated keeps laying out in its v5 column, centred in the full-size box, until its family migrates (RSCR stories; RSCR-11 removes the column).

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Phaser 3.90 (ADR-0003) |
| **Domain** | UI, Core (scale manager) |
| **Knowledge Risk** | MEDIUM. The decision relies on Phaser's RESIZE scale mode sizing the game from the parent through `ScaleManager.getParentBounds()`, which the game already overrides for the render scale (`src/platform/renderScale.ts`). `getParentBounds`, `refresh` (emits `resize` synchronously), `step` (re-measures every `resizeInterval`) and `updateScale` (RESIZE: `canvas.width = floor(parentSize)`) were read in `node_modules/phaser/src/scale/ScaleManager.js` 3.90.0; Context7 was not reachable in this run. Overriding a prototype method is not public API: a Phaser upgrade must re-check it. |
| **References Consulted** | `design/ux/landscape-v6.md` §0–§2, §16; `docs/v6/audit/UI.md` §1; `docs/v6/DECISIONS.md` V6-018, V6-020, V6-021, V6-030, V6-039; ADR-0005; `src/ui/kit.ts` (`uiMetrics`), `src/scenes/BaseScene.ts`, `src/platform/renderScale.ts`, `index.html`; the scenes' pointer code (`src/ui/kit.ts` ScrollArea, `src/ui/sheet.ts` DragDrop, `src/scenes/{Battle,Camp}Scene.ts`, `src/scenes/online/OnlineScene.ts`). |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | `tests/uiMetrics.test.ts` (the §1.1 matrix, the v5 table, resize rule); `scripts/layout-check.mjs` across the matrix with 0 new violations; pixel compare of Menu, Battle and Kit at 390x844, 360x780 and 320x693 (plain and Telegram insets) before and after; the opted-in path checked live (an opted-in scene fills 1280x800, crossing 900x900 → 1280x800 → 800x400 rebuilds). |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0003 (Phaser 3.90), ADR-0005 (the kit contract this amends) |
| **Enables** | V6-RFND-02 (layout primitives and the opted-in Kit Layouts page), V6-RFND-03 (the landscape layout-check rules read `cls`, `land`, `contentW` and the legacy flag), V6-RFND-04, every V6-RSCR story (each opts its family in) |
| **Blocks** | V6-RFND-02, V6-RFND-03 and the RSCR stories rely on the contract below |
| **Ordering Note** | RSCR-11 deletes the legacy column once every family has opted in. |

## Context

### Problem Statement
The canvas was a 0.64-aspect column on every screen wider than a phone: 36–48% of a laptop used, a 250 CSS px sliver at 844x390 (UI.md §1). The UI scale `S = clamp(floor(min(W/190, H/400)), 2, 4)` grew only with height, so 1920x1080 stayed at S = 2. Removing the cap alone would hand every screen a 640-UI-px-wide box it was never laid out for: rows and bars would stretch across a laptop (the "stretched brick" finding) and the layout check would fail on screens no story has touched yet.

### Constraints
- Phones in portrait stay pixel-identical to v5 (brief goal 3, spec §16.9).
- Every merge stays green and shippable (V6-021): no screen may get worse before its family migrates.
- Whole CSS px per UI px, so the pixel-art panels and the 4-pt grid stay crisp (UI_KIT.md, spec §2.1).
- No platform checks in game code (ADR-0006).

### Requirements
- `uiMetrics` returns `cls`, `land`, `short`, `navW`, `contentW` as spec §1.2 defines, measured on the safe-area CSS box.
- S per class from spec §2.1; the §1.1 matrix reproduced exactly.
- `#game` fills the safe area at every size.
- A scene that has not migrated keeps its v5 width; a scene that opts in gets the full box.
- Crossing a class threshold rebuilds the scene within one frame of the resize settling; within a class it reflows.

## Decision

### 1. Size classes and S (`src/ui/sizeClass.ts`, pure)
Measured on the game box in CSS px (the safe area: `#game`), `short = min(W, H)`, `aspect = W / H`:

| Class | Rule | S (CSS px per UI px) |
|---|---|---|
| compact | `short < 480` | `clamp(floor(min(W/190, H/400)), 2, 4)` (the v5 formula) |
| medium | `short ≥ 480`, not expanded | `clamp(floor(min(W/384, H/480)), 2, 3)` |
| expanded | `short ≥ 480`, `aspect ≥ 1.1`, `W ≥ 960` | `clamp(floor(min(W/480, H/360)), 2, 3)`; up to 4 only when `short ≥ 1800` |

`land = aspect ≥ 1`. S is multiplied by RS (ADR-0005's render scale) and stays whole in CSS px; fractional S is rejected.

Resulting matrix (UI px): 390x844 compact 2 → 195×422; 360x780 → 180×390; 320x693 → 160×346; 844x390 compact landscape 2 → 422×195, rail 84; 768x1024 medium 2 → 384×512; 820x1180 medium 2 → 410×590; 1024x768 expanded 2 → 512×384, rail 72; 1280x800 expanded 2 → 640×400; 1440x900 expanded 2 → 720×450; 1920x1080 expanded **3** → 640×360.

### 2. The UIMetrics contract (amends ADR-0005)
`uiMetrics(scene)` (still exported by `src/ui/kit.ts`) returns `{ S, VW, VH, cls, land, short, navW, contentW, legacy }`:
- `short`: `VH < 240`. Scenes read it instead of their own `VH < 300 / < 240 / ≥ 350` thresholds when they migrate.
- `navW`: 84 in compact landscape, 72 in medium and expanded landscape, 0 with a tab bar. (Sub-screens draw no rail; they ignore it.)
- `contentW`: `min(VW - navW, CONTENT_MAX)`.
- `legacy`: the scene has not migrated (below).

The §2.3 maxima are constants in `sizeClass.ts`: `CONTENT_MAX` 640, `READING_MAX` 300, `ROW_MAX` 360, `BUTTON_MAX` 240, `CTA_MAX` 300, `DIALOG_MAX` 320, side panels 240…320. Migrated scenes read the fields and constants, never their own magic numbers.

### 3. `#game` fills the safe area; the legacy column lives in the game box
`index.html` drops `* 0.64`: `#game` is the safe area (inset by `--pa-t/b/l/r`) at every size, on the stone stage colour. The game box Phaser sizes the canvas from is chosen by `src/platform/renderScale.ts`'s `getParentBounds` override:
- **legacy column on** (a scene that has not migrated): `min(W, H × 0.64)` of the safe area, the v5 width, centred in `#game` (`--pa-col`, `margin: 0 auto`). Metrics use the v5 formula and report `cls: 'compact'`, `land: false`, `legacy: true`, so the scene builds exactly its v5 layout.
- **off** (a scene that opted in): the whole safe area, with the class metrics above.

`BaseScene` has `protected readonly responsive = false`; a migrated scene overrides it with `true`. `initUi()` calls `setLegacyColumn(scale, !responsive)`, which re-measures and resizes the game synchronously before the scene reads its metrics, so a scene never lays out in the other mode's box. Scenes outside `BaseScene` (Boot, BeastTrial) run in the current mode, legacy at start.

In portrait, `min(W, H × 0.64) = W` for every phone, so the column is the whole safe area and nothing changes, by construction.

### 4. Resizing
`BaseScene` still waits for the size to settle (150 ms) and ignores Phaser's no-op `resize` events. Then `resizeAction(before, after)`: a change of `cls` or `land` → `onResized()` (rebuild with the same scene data); otherwise → `onReflow()`, which defaults to `onResized()` until a migrated scene reflows in place. A legacy scene always rebuilds, as in v5. Field scenes keep their in-place `onResized` overrides.

### Key interfaces
```ts
// src/ui/sizeClass.ts
export type SizeClass = 'compact' | 'medium' | 'expanded';
export interface UIMetrics { S; VW; VH; cls: SizeClass; land: boolean; short: boolean; navW: number; contentW: number; legacy: boolean }
export function sizeClass(w: number, h: number): { cls: SizeClass; land: boolean };
export function classScale(cls: SizeClass, w: number, h: number): number;
export function legacyColumnWidth(w: number, h: number): number;
export function metricsFor(devW: number, devH: number, rs: number, legacy: boolean): UIMetrics;
export function resizeAction(before: UIMetrics, after: UIMetrics): 'rebuild' | 'reflow';
// src/platform/renderScale.ts
export function legacyColumn(): boolean;
export function setLegacyColumn(scale: Phaser.Scale.ScaleManager, on: boolean): void;
// src/scenes/BaseScene.ts
protected readonly responsive: boolean; protected onReflow(): void;
```

## Alternatives Considered

### Alternative 1: Full-size canvas, legacy scenes drawn through camera viewports offset to the column
Every camera of a legacy scene gets `setViewport(colX, 0, colW, H)`. The canvas fills the window in every mode, and Phaser's hit tests follow the camera offset. Rejected: about a dozen places use raw `pointer.x / S` as UI px or compare taps with camera-relative positions (ScrollArea's press test, the scroll clip in the patched `hitTest`, DragDrop's ghost and drop, Camp's tile tap, the war map's `overUi`, Battle's badge taps, ghost grabs and gesture taps). Each would mis-hit by `colX` on wide screens only, so "nothing gets worse" would need edits across field scenes that the RSCR stories own, and a missed one is a silent bug. The chosen design gives an identical picture for unmigrated scenes with no input change.

### Alternative 2: Remove the cap and let every scene see the full box at once (big bang)
Rejected in V6-021: every unmigrated menu would stretch to 640 UI px and the layout check would fail on screens no story touches until their RSCR story lands.

### Alternative 3: Fractional S for smooth growth
Rejected by the spec (§2.1, §17): it blurs the pixel-art panels and breaks the whole-UI-px rule.

### Alternative 4: Opt in per family through a registry of scene keys
Equivalent, but a field on the scene keeps the switch next to the code that must honour it, and a test or a page can flip it without touching a shared list (no merge conflicts between RSCR stories).

## Consequences

### Positive
- `#game` fills the safe area everywhere; the letterbox CSS is gone and the `letterbox` check (RFND-03) can measure it.
- Migrated scenes get the classes, the scale and the caps from one pure, tested module.
- Unmigrated scenes are exactly v5 at every size, so every existing screen and allowlist entry still holds; the families migrate one story at a time.
- 1920x1080 reaches S = 3 for migrated scenes (readable at desk distance).

### Negative
- Until a family migrates, its screens still show the v5 column on wide screens (now on the stone stage instead of the page background); only migrated scenes use the full canvas.
- A scene switch between a legacy and a migrated scene resizes the canvas (a refresh, no reload); the cost is one `resize` per switch.
- The scale override relies on a non-public Phaser method (`getParentBounds`), as the render scale already did.

### Neutral
- `uiMetrics` keeps its name and the `S, VW, VH` fields; existing callers compile unchanged.

## Risks
- A Phaser upgrade changes `getParentBounds`/`refresh` → the canvas size breaks visibly at once; ADR-0003's upgrade checklist should re-run the fullscreen smoke and this ADR's tests.
- A migrated scene that launches a legacy overlay scene in parallel would put both in one box; no scene does that today (`scene.launch` is unused). Revisit if one does.
- Wide-screen pixel compare of the legacy column differs by sub-pixel resampling (the column is 691.2 CSS px at 1920x1080 in both versions; v5 centred it with a transform, now with margins).

## Test strategy
- `tests/uiMetrics.test.ts`: every §1.1 row (class, land, S, VW × VH, nav), RS invariance, S = 4 only from short 1800, the caps; the v5 table from UI.md §1 for legacy metrics; portrait identical in both modes; `resizeAction` across and within classes.
- `scripts/layout-check.mjs` over the matrix: 0 new violations against the V6-GATE-01 allowlists.
- Smokes (`scripts/smoke.mjs`, `tutorial-smoke.mjs`, `fullscreen-smoke.mjs`): unchanged results.
- Before/after screenshots of Menu and Battle at 390x844, 1280x800 and 1920x1080; pixel compare at the three portrait sizes.

## GDD and spec requirements addressed
- TR-v6-rsp-001 (no letterboxed column for migrated scenes; `#game` fills), TR-v6-rsp-002 (classes and whole S), the foundation of TR-v6-rsp-006 (844x390 is compact landscape, 422 × 195 UI px).
- design/ux/landscape-v6.md §1, §1.1, §1.2, §2.1, §2.3, §16.1, §16.9, §16.11.

## Related
- ADR-0005 (amended: the metrics contract), ADR-0006 (no platform checks: the column is a size rule, not a platform one), ADR-0012 (input; pointer coordinates are unchanged by this design).
- V6-018, V6-020, V6-021 in `docs/v6/DECISIONS.md`; stories V6-RFND-01…04 and V6-RSCR-01…11.
