# ADR-0003: Engine version — Phaser 4.2 for v5

## Status
Proposed

## Date
2026-10-10

## Last Verified
2026-10-10, against phaser 4.2.1 (npm `latest`) and the v5 branch at `b829290`.

## Decision Makers
- Author: engine spike (S2-P4-SPIKE), acting for the technical-director.
- Approver: the user, through the Director. Only the technical-director may move this ADR to Accepted, and only after the user confirms.

## Summary
v5 must choose between staying on Phaser 3.90, the last Phaser 3 release, and moving to Phaser 4 (decision V5-005). A bounded spike moved the game to phaser 4.2.1 in under two hours: three small fixes, no runtime errors, and visual parity on the screens checked. So this ADR proposes upgrading now, before v5 gameplay work starts. A short parity pass must finish before the upgrade merges.

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Phaser 3.90.0 → Phaser 4.2.1 (TypeScript 7, Vite 8) |
| **Domain** | Core / Rendering / UI |
| **Knowledge Risk** | MEDIUM. Phaser 4 was released in 2026, and parts of its renderer changed after the model's training data. The spike checked each claim against the installed source in `node_modules/phaser/src`, not against memory. |
| **References Consulted** | Phaser 4 API docs through Context7 (`/websites/phaser_io`, `/websites/phaser_io_phaser4`): `Components.Mask#setMask`, `FilterList#addMask`, `Components.Filters`, `setTintMode`. Phaser 4.2.1 source: `ParseXMLBitmapFont.js`, `Mask.js`, `Filters.js`, `GameObject.js`, `Container.js`. Prior analysis: `docs/v5/audit/MECHANICS.md` §3. Evidence: `docs/v5/spike/P4.md`. |
| **Post-Cutoff APIs Used** | `GameObject#enableFilters()` and `filters.external.addMask(gameObject)`, the Phaser 4 Mask filter. |
| **Verification Required** | Run the full layout check and every smoke script on the v4 build: no new violations, all PASS. Check the remaining risky screens by eye at 390, 360 and 320 widths: Duel, Online, Clan, Merchant, BeastTrial, Results and FirstRun. Measure battle FPS on a real phone, Telegram on iOS and Android, against 3.90. Measure the cost of the Mask filter on a screen with several scroll areas. |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | None |
| **Enables** | `project.yaml` `engine.*` (left unset until V5-005 is decided); every v5 story that touches rendering or UI. |
| **Blocks** | Phase 3/4 UI and rendering stories. They should be written against the version chosen here. |
| **Ordering Note** | Merge the upgrade, if accepted, before v5 UI and gameplay stories branch. Every UI story merged on 3.90 first adds rebase and re-verification work. |

## Context

### Problem Statement
pixelarrow runs on Phaser 3.90, the final Phaser 3 release. Phaser 4 is the maintained line: 4.0.0 shipped, and 4.2.1 is now npm `latest`. v5 is about to add a lot of UI and rendering code. If v5 is written on 3.90 and migrated later, that new code has to be migrated too. If v5 stays on 3.90 for good, the game sits on an unmaintained engine.

### Constraints
- Portrait Telegram Mini App, 390x844 baseline, rendered at devicePixelRatio through a ScaleManager patch (`src/platform/renderScale.ts`).
- All art is procedural. It lives in canvas textures (`textures.addCanvas`, more than 110 call sites) and Graphics objects. There are no image assets to re-export.
- All text is one hand-built bitmap font cache entry (`registerVectorFont` in `src/ui/kit.ts`). `add.text` is never used.
- The deterministic simulation and the server do not import Phaser, so they are not affected (ADR on determinism, V5-008).
- Overnight autonomous run: the effort must stay bounded and reversible.

### Requirements
- Same look: pixel art crisp at DPR scale, smooth UI text.
- No regression in the layout check, the unit tests or the touch smoke tests.
- Battle frame rate at least as good as on 3.90 on target phones.
- Bundle growth must stay small. The bundle is a 3.1 MB minified main chunk, about 0.94 MB gzipped.

## Decision

**UPGRADE to Phaser 4 (`phaser@^4.2.1`) now, as the first engine story of v5.** Merge the spike branch once the parity pass in "Verification Required" is green. If that pass finds a problem that cannot be fixed within 2 days, stay on 3.90 for v5. See Alternative 1.

### Architecture Diagram
```
src/main.ts ── new Phaser.Game (unchanged config: AUTO, pixelArt, roundPixels, RESIZE)
   │
   ├─ platform/renderScale.ts  ScaleManager.getParentBounds patch  ── unchanged, works on 4.2.1
   ├─ ui/kit.ts
   │    ├─ registerVectorFont   retroFont cache entry: v = 1 - y/h (v4 bottom-up UVs)
   │    └─ screenMask(obj, g)   WebGL: enableFilters + filters.external.addMask(g)
   │                            Canvas: setMask(g.createGeometryMask())
   │         ├─ ScrollArea      (every scrolling list)
   │         └─ CampScene       (the camp viewport)
   └─ ui/sheet.ts, ui/mosaic/Niche.ts, scenes/duel/duelParts.ts
        Graphics.fillPoints/strokePoints take Vector2[] in v4 typings (cast, no runtime change)
```

### Key Interfaces
- `screenMask(obj: Phaser.GameObjects.Container, g: Phaser.GameObjects.Graphics): void` in `src/ui/kit.ts`. This is the only way to clip a container to a screen rectangle.
- Hand-built bitmap font entries put `v0` / `v1` in Phaser 4 bottom-up texture space: `v = 1 - y / height`.

### Implementation Guidelines
- Code must never call `setMask(...createGeometryMask())` directly. Under WebGL in Phaser 4 it does nothing except log a console warning, so content is not clipped. Use `screenMask`.
- Code must never hand-build texture UVs in top-down space. Phaser 4 UVs count up from the bottom edge, as in `ParseXMLBitmapFont`.
- Do not use Phaser 3 pipeline, preFX or postFX APIs. Effects use Phaser 4 filters (`enableFilters`, `filters.internal` / `filters.external`).
- Tint: `setTint` keeps its v3 meaning. Fill tint is `setTint(c).setTintMode(Phaser.TintModes.FILL)`. Do not use `setTintFill`: in Phaser 4 it is a deprecated method that does nothing. The game does not use it today.
- Pin the minor version: use `^4.2.1` and re-run the layout check before taking any 4.x minor bump.
- After this ADR is accepted, set `engine.*` in `project.yaml` to Phaser 4.2.

## Alternatives Considered

### Alternative 1: Stay on Phaser 3.90 for all of v5
- **Description**: Keep `phaser@^3.90.0`, and look at v4 again after v5 ships.
- **Pros**: No migration risk during v5. 3.90 is stable, and every v4 screen is already verified on it. The bundle is about 39 kB gzip smaller.
- **Cons**: 3.90 is the last Phaser 3 release, so fixes and browser-compatibility work now go into 4.x. All v5 UI code would be written against v3 masking and UV semantics, and would have to be migrated later at a higher cost.
- **Rejection Reason**: The spike measured the migration as small: 4 commits, about 20 changed lines. The real risk is the long tail of screens not yet checked, and a bounded parity pass covers that. Paying the cost now, before v5 adds code, is cheaper than paying it after.

### Alternative 2: Upgrade later, mid-v5 or after the MVP
- **Description**: Start v5 on 3.90 and migrate when a v4 feature is needed.
- **Pros**: Defers the work.
- **Cons**: The same fixes would be needed later, across more code, and parity would have to be re-verified over more screens. The game needs no v4 feature, so "when needed" may never come, and this becomes Alternative 1 by default.
- **Rejection Reason**: It costs the most of the three options and gives nothing in exchange.

## Consequences

### Positive
- The engine is on the maintained line, with the v4 renderer, filters and later fixes.
- v5 UI code is written once, against the final masking and UV rules.
- The Mask filter clips through the renderer itself, not the stencil-based v3 geometry mask, and it works under rotation and scale.

### Negative
- The minified main chunk grows from 3,102 kB to 3,279 kB (+5.7%). Gzipped, it grows from 938.7 kB to 978.1 kB (+4.2%).
- Each Mask filter (`filters.external`) allocates and redraws a camera-sized texture. In software GL, the Settings sheet took 586–888 ms to open, against 239–362 ms on 3.90. On the Metal GPU the difference was within noise. This must be made cheaper (a low `scaleFactor`, an internal mask, or a camera clip) and measured on a phone before merge.
- Glyph placement differs by about 1 device pixel (a sub-pixel UV difference). Text is very slightly softer or lower. See `docs/v5/spike/p4/kit-text-crop-v3-left-v4-right.png`.

## Risks
- **Unverified screens hide a v4-only bug.** Mitigation: the full layout check and the smoke scripts, plus a visual pass by eye over the screens listed under Verification Required, before merge.
- **Mask filter cost on low-end Android.** Mitigation: profile a scroll-heavy screen on a mid-range phone. The fallback is clipping by camera viewport, one camera per scroll area.
- **The ScaleManager patch breaks in a later 4.x minor**, because it relies on private fields. Mitigation: pin the 4.2 minor, and treat a minor bump as its own story that re-runs the layout check.
- **The software-GL FPS reading is noisy.** Mitigation: the decision does not rest on the headless FPS number. Phone measurement is a merge gate.

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| systems-index.md (UI Kit, Rendering/Art pipeline) | All text is drawn with the vector bitmap font, and the procedural art is drawn into canvas textures. | Both paths were verified on 4.2.1. The font needed a UV flip. Canvas textures needed no change. |
| systems-index.md (Battle view) | The battle renders through world and UI cameras with `ignore`. | Verified: the battle and world map render the same on 4.2.1 without code changes. |

## Performance Implications
- **CPU**: Headless SwiftShader battle FPS was 18.3 on 3.90 and 13.2–17.2 on 4.2.1, with the machine also running other jobs. The clean rerun is in P4.md. With Metal GPU, both hit the 60 FPS vsync cap. Not conclusive; must be measured on a phone.
- **Memory**: Not measured. Each Mask filter adds a framebuffer.
- **Load Time**: +39 kB gzip in the main chunk. Boot to the Menu took 0.7 s on 3.90 and 0.9 s on 4.2.1 locally.
- **Network**: None.

## Migration Plan
1. Merge the spike commits: the dependency bump, the Graphics typings casts, the font UV flip and `screenMask`.
2. Run the parity pass: the full layout check, every `scripts/*smoke*.mjs`, and checking the remaining scenes by eye at 3 widths. Fix what it finds. Estimate: 1–2 days.
3. Measure FPS on a phone, Telegram on iOS and Android, and record it in `docs/v5/spike/P4.md`.
4. Set `engine` in `project.yaml`. Move this ADR to Accepted (technical-director, after the user confirms).

## Validation Criteria
- The layout check shows no new violations compared with 3.90.
- All smoke scripts pass. `vitest` shows 525/525. `tsc` shows 0 errors.
- Battle FPS on a mid-range phone is within 10% of 3.90.
- No Phaser console warnings at runtime, especially the `setMask ... not supported in WebGL` warning.

## Related
- `docs/v5/spike/P4.md`: the spike evidence and numbers.
- `docs/v5/audit/MECHANICS.md` §3: the Phaser 4 risk note this spike tested.
- `docs/v5/DECISIONS.md`: V5-005 (the spike), V5-008 (the three Foundation ADRs), V5-010 (`engine.*` unset until decided).
- Engine validation: NOT ASSESSED. No engine is configured (`engine.name` is unset in `project.yaml`), so no engine specialist was spawned.
