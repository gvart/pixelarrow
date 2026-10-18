# v5 asset pipeline: raw Gemini image to shipped art

From a raw image in `docs/v5/gemini/` to a file the game loads. Every step is a script under `scripts/art/` (Node 20+, no new dependencies). PNG via `scripts/art/lib/png.mjs`; JPEG and WebP via macOS `sips`; the in-game check reuses `scripts/layout-check.mjs` through Playwright.

What to make: `docs/v5/art/ASSET_LIST.md`. Prompt templates: `docs/playbook/PROMPTS_ART.md`.

**An asset reaches `public/` only after it has been seen in the real game at 390x844, 360x780 and 320x640.** `promote.mjs` refuses otherwise.

## Overview

| Step | Script | In | Out | Gate |
| --- | --- | --- | --- | --- |
| 1. Generate | (Chrome + Gemini) | template + manifest row | `docs/v5/gemini/<ART-id>_<file stem>_<n>.png` | — |
| 2–4. Key out, trim, exact size | `process.mjs <id> <raw>` | raw image | `docs/v5/art/staging/<file>.png` | refuses upscaling; pixel art: grid found |
| 4b. 9-slice (chrome only) | `nineslice.mjs <id>` | staged frame | `.slice.json` + stretched previews | edges uniform along their stretch |
| 5. Audit | `check.mjs <id>` | staged file | PASS / FAIL / NOT ASSESSED | exact size, alpha, no magenta, palette, name |
| 5b. Atlas (icons only) | `atlas.mjs icons_ui` | staged icons + current atlas | `staging/atlas/icons_ui.{png,json}` | ≤ 4096 px |
| 6. **In the real game** | `preview.mjs <id> [baseUrl]` | staged file | layout-check verdict + contact sheets | layout check clean, sheets read |
| 7. Ship | `promote.mjs <id> --looked` | staged file | `public/...` (JPEG via `sips`) | check PASS + preview of this exact file |
| 8. Budget | `check.mjs --shipped <id>` | shipped file | PASS / FAIL | KB budget |
| — | `contrast.mjs` | `palette.json` | ratio table | text ≥ 4.5, UI ≥ 3 |
| — | `list.mjs` | manifest | `ASSET_LIST.md` tables | — |

## 1. Generate

1. Pick a row in `ASSET_LIST.md`; fill its template with the row's **Subject**.
2. Save every download as `docs/v5/gemini/<ART-id>_<file stem>_<n>.png` (e.g. `ART-013_bust_hoplite_2.png`). Never overwrite: n counts attempts.
3. Families (busts, plates, frescoes) are made **from an approved seed**: the family's first approved asset is the style reference. Nikias frames 2 and 3 and the two open chests are **edits** of frame 1 or the closed chest.
4. Before saving, reject invented content: text or letters; extra limbs or heads; modern objects; wrong headgear for the class; on magenta assets, a cast shadow or gradient on the background.

## 2–4. Key out, trim, exact resize: `process.mjs`

```
node scripts/art/process.mjs ART-013 docs/v5/gemini/ART-013_bust_hoplite_2.png [--ax 0.5 --ay 0.25] [--tol 60] [--fringe 3]
```

Recipe by the asset's `kind` in `docs/v5/art/asset-manifest.json`:

| kind | Steps |
| --- | --- |
| `painted` (fresco, vignette, bust, plate, splash) | Cover-crop to the exact aspect at the anchor (`ax`, `ay`, 0..1; busts ay 0.25 to keep the head), then **one area-average downscale**. Refuses to upscale (regenerate a smaller source). Output forced opaque. |
| `cutout` (chest, laurel) | Key out #FF00FF (`tol` 60 RGB distance, soft ramp of 60 more for AA edges), despill the edge band (`fringe` px; R and B pulled down to G), trim to the opaque box, contain at the anchor (`ay` 1 = on the bottom edge). |
| `icon` | As `cutout`, then centred at `fill` (0.88) of a 160 square, leaving room for the code's drop shadow. |
| `frame` (9-slice chrome) | Key out, then exact cover to the size (aspect kept). |
| `pixel` (world art) | Hard key (binary alpha), trim, **detect the fake-pixel block size** (`detectGrid`: the largest n whose grid lines carry about all colour edges), unscale by majority colour per block, snap to **PA-WORLD**, binary alpha, **pad** into the exact canvas, centred, feet on the bottom row. **Never scaled to fit**: too big means regenerate. `--grid n` overrides detection. |

Ad hoc (not in the manifest): `--kind pixel --size 32x32 --out <file>`.

## 4b. 9-slice: `nineslice.mjs` (painted chrome only)

The chrome is procedural, so no manifest asset needs this today. A raster frame, button face or plaque carries `"slice": [l, t, r, b]` in the manifest:

```
node scripts/art/nineslice.mjs <id>          # or: --file <png> --slice 40,40,40,40
```

Measures how much each edge strip varies along its stretch axis (ornaments belong in the corners, not mid-edge) and writes `.9-wide`, `.9-tall`, `.9-small` previews rebuilt from the nine pieces. In Phaser: `scene.add.nineslice(x, y, key, frame, w, h, l, r, t, b)` with the insets from `.slice.json`.

## 5. Audit: `check.mjs`

```
node scripts/art/check.mjs ART-013          # one asset (staged file)
node scripts/art/check.mjs                  # every asset, plus manifest/ASSET_LIST drift and public/ui orphans
node scripts/art/check.mjs --shipped ART-013  # the shipped file, with its KB budget
```

| Check | Rule |
| --- | --- |
| Name | Matches the naming pattern (below) |
| Size | Exactly the manifest size |
| Painted | Fully opaque |
| Cutout, icon, frame | Has transparency, **no magenta residue** (visible pixels near #FF00FF, or a magenta tint in the 1 px edge band) |
| Icon | Does not touch the top or bottom edge |
| Pixel | Binary alpha, every pixel in PA-WORLD |
| Shipped | Within the KB budget |

Verdicts: PASS, FAIL, **NOT ASSESSED** (no file; counted separately, never a pass). Exit 1 on any FAIL.

## 5b. Atlas packing: `atlas.mjs` (icons)

```
node scripts/art/atlas.mjs icons_ui
```

Rebuilds the atlas from the **current** `public/icons/ui.{png,json}` frames plus every staged manifest icon whose `atlas` is `icons_ui`: a staged frame with an existing id (e.g. `ui:chest`) replaces its cell, a new id is added, an unstaged frame keeps its old cell (reported). Shelves tallest first, 2 px gap, at most 2048 px wide, TexturePacker hash JSON as `BootScene` loads (`this.load.atlas`). Output: `docs/v5/art/staging/atlas/`.

**WebP twins.** The game loads `public/icons/<ui|items>.webp`, falling back on the PNG only when the WebP fails. `atlas.mjs --out public/icons --looked` runs `scripts/art/webp.mjs` (cwebp, near-lossless 60: every channel within 2/255) and records the PNG's sha256 in `scripts/art/webp-lock.json`; `tests/iconAtlas.test.ts` fails when a shipped PNG has no matching WebP. Without libwebp the ship step fails: install it and run `node scripts/art/webp.mjs ui`. `preview.mjs` serves the staged PNG for both URLs.

## 6. In the real game: `preview.mjs`

```
npm run dev -- --port <free port>        # your own port: other agents' servers may hold 5173/519x
node scripts/art/preview.mjs ART-013 http://localhost:<port>/
```

`scripts/art/lib/override-hook.mjs` is preloaded into `scripts/layout-check.mjs` (`node --import`) and wraps Playwright so every context answers the game's request for the asset (the manifest's `preview.url`, e.g. `ui/banner_campaign.jpg`, or `icons/ui.webp`, `icons/ui.png` + `.json` for atlas frames) with the **staged** file. The real game renders it in the real slots through the layout check's fixtures; nothing under `public/` changes.

Two runs:
1. **Layout verdict at DPR 1** at 390x844, 360x780, 320x640 (the check is calibrated at DPR 1; DPR 3 gives ~30 false tab-bar violations).
2. **Shots at DPR 3**, where blur, fringes and bad crops show.

Writes a contact sheet per screen (three sizes side by side) and `preview.json` (staged file sha256, layout exit code, sheets).

**Read every sheet**: slot filled (no plain-parchment fallback); no blur or shimmer; faces and helmets not cropped (busts: eyes on the upper third); no clash with chrome or text; matches its family (palette, upper-left light, line weight); pixel art crisp at an integer scale.

An asset whose slot the game does not load yet (`preview: null`) is **NOT ASSESSED** (exit 3) and cannot be promoted: wire its `RASTERS` key or atlas frame first.

## 7. Ship: `promote.mjs`

```
node scripts/art/promote.mjs ART-013 --looked
node scripts/art/promote.mjs --atlas icons_ui --looked
```

Refuses unless: `check.mjs` passes; a `preview.json` exists for **this exact staged content** (sha256); that preview's layout check exited 0; `--looked` is passed (the sheets were read). A `.jpg` destination is encoded by `sips` at quality 82 (or the manifest's `quality`); a PNG is copied; atlases are promoted whole (never a frame alone). Then run `check.mjs --shipped <id>`.

## Where files go

| What | Where | In git |
| --- | --- | --- |
| Raw downloads | `docs/v5/gemini/` | yes (provenance) |
| Staged, previews, atlases in progress | `docs/v5/art/staging/` | no (`docs/v5/art/.gitignore`) |
| Opaque painted art | `public/ui/` (frescoes, vignettes, Nikias, splash), `public/ui/busts/`, `public/ui/beasts/` | yes |
| Cutouts | `public/ui/` | yes |
| Icons | `public/icons/ui.{png,json}` (atlas) | yes |
| World pixel art | `public/world/`, or procedural in `src/art/` | yes |
| Loading code | `src/ui/mosaic/raster.ts` `RASTERS` (key → file), `src/art/iconBitmaps.ts` `ICON_ATLASES` | yes |

## Naming

`<category>_<subject>[_<variant>].<ext>`, lowercase snake case. Texture key `ui_<file stem>` (e.g. `ui_bust_hoplite`); atlas frame `ui:<subject>`.
