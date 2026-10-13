# v5 asset pipeline: raw Gemini image to shipped art

This is the path from a raw image in `docs/v5/gemini/` to a file the game loads. Every step is a script under `scripts/art/`: Node 20+, no new dependencies.
- Images are decoded and encoded by `scripts/art/lib/png.mjs`. JPEG and WebP go through macOS `sips`.
- The in-game check reuses `scripts/layout-check.mjs` through Playwright, which is already a dev dependency.

The rules come from `design/art/art-bible.md` (§8 sizes, formats, names, pixel rules). The list of what to make is in `docs/v5/art/ASSET_LIST.md`. The prompts are in `docs/v5/ASSET_LOG.md` › Templates.

**An asset reaches `public/` only after it has been seen in the real game at 390x844, 360x780 and 320x640.** `promote.mjs` refuses otherwise.

## Overview

| Step | Script | In | Out | Gate |
| --- | --- | --- | --- | --- |
| 1. Generate | (assets agent, Chrome + Gemini) | template + manifest row | `docs/v5/gemini/<ART-id>_<file stem>_<n>.png` | ASSET_LOG Queue entry |
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

1. Pick a row in `ASSET_LIST.md`.
2. Fill its template (`docs/v5/ASSET_LOG.md` › Templates) with the row's **Subject**, then add a Queue entry.
3. The assets agent saves every download as `docs/v5/gemini/<ART-id>_<file stem>_<n>.png`, for example `docs/v5/gemini/ART-013_bust_hoplite_2.png`. Never overwrite: n counts attempts.
4. Families (all busts, all plates, all frescoes) are made **from an approved seed**. The first approved asset of a family is attached as the style reference for the rest. Nikias frames 2 and 3, and the two open chests, are **edits** of their frame 1 or closed chest.
5. Before saving, read the image for invented content (memory "Verify generated mockups"):
   - text or letters;
   - extra limbs or heads;
   - modern objects;
   - wrong headgear for the class (§5.2 of the art bible);
   - for magenta assets, a cast shadow or gradient on the background.

## 2–4. Key out, trim, exact resize: `process.mjs`

```
node scripts/art/process.mjs ART-013 docs/v5/gemini/ART-013_bust_hoplite_2.png [--ax 0.5 --ay 0.25] [--tol 60] [--fringe 3]
```

The recipe comes from the asset's `kind` in `docs/v5/art/asset-manifest.json`:

| kind | Steps |
| --- | --- |
| `painted` (fresco, vignette, bust, plate, splash) | Cover-crop to the exact aspect at the anchor (`ax`, `ay`, 0..1; busts use ay 0.25 so the head is kept), then **one area-average downscale**. It refuses to upscale: a source smaller than the tier is regenerated. The output is forced opaque. |
| `cutout` (chest, laurel) | Key out #FF00FF (`tol` 60 RGB distance, a soft ramp of 60 more for anti-aliased edges), despill the edge band (`fringe` px; R and B pulled down to G), trim to the opaque box, contain at the anchor (`ay` 1 = sitting on the bottom edge). |
| `icon` | As `cutout`, then centred at `fill` (0.88) of a 160 square, leaving room for the code's drop shadow. |
| `frame` (9-slice chrome) | Key out, then an exact cover to the size (aspect kept). |
| `pixel` (world art) | Hard key (binary alpha), trim, **detect the fake-pixel block size** (`detectGrid`: the largest n whose grid lines carry about all the colour edges), unscale by majority colour per block, snap to **PA-WORLD**, binary alpha, then **pad** into the exact canvas, centred, feet on the bottom row. **Never scaled to fit**: too big means regenerate. `--grid n` overrides the detection. |

Ad hoc (an asset not in the manifest yet, such as world art from a GDD): `--kind pixel --size 32x32 --out <file>`.

## 4b. 9-slice: `nineslice.mjs` (painted chrome only)

The v5 chrome is procedural (art bible §7.1), so no manifest asset needs this today. Any later raster frame, button face or plaque carries `"slice": [l, t, r, b]` in the manifest:

```
node scripts/art/nineslice.mjs <id>          # or: --file <png> --slice 40,40,40,40
```

It measures how much each edge strip varies along the axis it will be stretched on. A rosette or rivet in the middle of an edge fails: ornaments belong in the corners. It also writes `.9-wide`, `.9-tall` and `.9-small` previews rebuilt from the nine pieces. Load the result in Phaser with `scene.add.nineslice(x, y, key, frame, w, h, l, r, t, b)`, using the insets from `.slice.json`.

## 5. Audit: `check.mjs`

```
node scripts/art/check.mjs ART-013          # one asset (staged file)
node scripts/art/check.mjs                  # every asset, plus manifest/ASSET_LIST drift and public/ui orphans
node scripts/art/check.mjs --shipped ART-013  # the shipped file, with its KB budget
```

| Check | Rule |
| --- | --- |
| Name | Matches the art bible §8.4 pattern |
| Size | Exactly the manifest size |
| Painted | Fully opaque |
| Cutout, icon, frame | Has transparency, **no magenta residue**: visible pixels near #FF00FF, or a magenta tint in the 1 px edge band |
| Icon | Does not touch the top or bottom edge |
| Pixel | Binary alpha, every pixel in PA-WORLD |
| Shipped | Within the KB budget |

The verdicts are PASS, FAIL and **NOT ASSESSED** (no file to measure). NOT ASSESSED is counted separately and is never a pass. Exit code 1 on any FAIL.

## 5b. Atlas packing: `atlas.mjs` (icons)

```
node scripts/art/atlas.mjs icons_ui
```

It rebuilds the atlas from the **current** `public/icons/ui.{png,json}` frames, plus every staged manifest icon whose `atlas` is `icons_ui`. A staged frame with an existing id (for example `ui:chest`) replaces the old cell; a new id is added. Packing:
- shelves, tallest first;
- 2 px gap;
- at most 2048 px wide;
- the same TexturePacker hash JSON `BootScene` loads (`this.load.atlas`).

The output goes to `docs/v5/art/staging/atlas/`. A frame that is not staged keeps its old cell, and the script says so.

**WebP twins (QA-05).** The game loads `public/icons/<ui|items>.webp` and falls back on the PNG only when the WebP fails to load or decode. When `atlas.mjs --out public/icons --looked` ships an atlas, it runs `scripts/art/webp.mjs` (cwebp, near-lossless 60: every channel within 2/255) and records the PNG's sha256 in `scripts/art/webp-lock.json`; `tests/iconAtlas.test.ts` fails when a shipped PNG has no matching WebP. Without libwebp installed the ship step fails: install it and run `node scripts/art/webp.mjs ui`. `preview.mjs` serves the staged PNG for both image URLs.

## 6. In the real game: `preview.mjs`

```
npm run dev -- --port <free port>        # your own port: other agents' servers may hold 5173/519x
node scripts/art/preview.mjs ART-013 http://localhost:<port>/
```

How it works:
- `scripts/art/lib/override-hook.mjs` is preloaded into `scripts/layout-check.mjs` (`node --import`). It wraps Playwright so every browser context answers the game's own request for the asset (the manifest's `preview.url`, for example `ui/banner_campaign.jpg`, or `icons/ui.webp`, `icons/ui.png` + `.json` for atlas frames) with the **staged** file.
- The real game then renders the candidate in the real slots, through the layout check's real fixtures (campaign save, heroes, stash). Nothing under `public/` changes.

It makes two runs:
1. **Layout verdict at DPR 1** on the asset's screens at 390x844, 360x780 and 320x640. The layout check is calibrated at DPR 1: at DPR 3 it reports about 30 false tab-bar violations (seen 2026-10-10).
2. **Shots at DPR 3**, the density a 3x phone draws painted art at. Blur, fringes and bad crops only show there.

It writes a contact sheet per screen (the three sizes side by side) and `preview.json`: the sha256 of the staged file, the layout exit code, and the sheets.

**Read every sheet** and check:
1. The slot is filled with no plain-parchment fallback.
2. No blur or shimmer.
3. Faces and helmets are not cropped (busts: eyes on the upper third).
4. No clash with the chrome or the text.
5. It matches its family (palette, light from the upper left, line weight).
6. Pixel art is crisp, at an integer scale.

An asset whose slot the game does not load yet (`preview: null`) is **NOT ASSESSED** (exit 3), and it cannot be promoted. Wire its `RASTERS` key or atlas frame in a UI story first, then preview.

Test run, 2026-10-10:
- A staged chest icon (ART-050, made from a magenta-keyed upscale of the current `ui:chest`) was swapped into the Campaign hub's Stash tile.
- Layout check: clean at all three sizes.
- Sheet: `docs/v5/art/staging/preview/ART-050/menu-sheet.png` (git-ignored).

## 7. Ship: `promote.mjs`

```
node scripts/art/promote.mjs ART-013 --looked
node scripts/art/promote.mjs --atlas icons_ui --looked
```

It refuses unless all of these hold:
- `check.mjs` passes;
- a `preview.json` exists for **this exact staged content** (sha256 match);
- that preview's layout check exited 0;
- `--looked` is passed, which states the contact sheets were read.

A `.jpg` destination is encoded by `sips` at quality 82 (or the manifest's `quality`). A PNG is copied. Atlases are promoted whole.

Then:
1. Run `check.mjs --shipped <id>` (the size budget).
2. Move the ASSET_LOG Queue entry to Done, with the raw file, the staged file, the destination and the preview sheet.

## Where files go

| What | Where | In git |
| --- | --- | --- |
| Raw downloads | `docs/v5/gemini/` | yes (provenance) |
| Staged, previews, atlases in progress | `docs/v5/art/staging/` | no (`docs/v5/art/.gitignore`) |
| Opaque painted art | `public/ui/` (frescoes, vignettes, Nikias, splash), `public/ui/busts/`, `public/ui/beasts/` | yes |
| Cutouts | `public/ui/` | yes |
| Icons | `public/icons/ui.{png,json}` (atlas) | yes |
| World pixel art | `public/world/` (new), or procedural in `src/art/` | yes |
| Loading code | `src/ui/mosaic/raster.ts` `RASTERS` (key → file), `src/art/iconBitmaps.ts` `ICON_ATLASES` | yes |

## Naming

`<category>_<subject>[_<variant>].<ext>`, lowercase snake case (art bible §8.4). The texture key is `ui_<file stem>`, for example `ui_bust_hoplite`. The atlas frame is `ui:<subject>`.

## Tests of the scripts themselves (2026-10-10)

| Script | Case | Result |
| --- | --- | --- |
| `contrast.mjs` | 38 pairs | All pass after the badge-ring fix; **seen failing first** (alert on stone 2.08:1) |
| `process.mjs` painted | `public/ui/banner_campaign.jpg` → ART-001 (1080x480) | **Refused** (source 1060x420 is below the tier: the placeholder must be regenerated) |
| `process.mjs` painted | `public/ui/banner_campaign.jpg` → ART-004 (1032x132) | Exact size, opaque, PASS |
| `process.mjs` icon | Magenta-backed 10x upscale of `ui:chest` → ART-050 | First run **FAIL** (`check` caught a 10 px magenta fringe); with `--fringe 12`, PASS |
| `process.mjs` pixel | `ui:helmet` reduced to 24 px, nearest x8 on magenta, `--kind pixel --size 32x32` | Grid detected 8 (first version wrongly picked 32: fixed); 32x32, binary alpha, PA-WORLD only |
| `nineslice.mjs` | The chest icon as a "frame" | **FAIL** as it should (the lock and bands vary along the edges) |
| `atlas.mjs` | `icons_ui` with 1 staged frame | 109 frames, 1 replaced, 2044x358 |
| `preview.mjs` | ART-050 on `menu` | Layout clean ×3 sizes, sheet shows the new chest in the Stash tile |

| `promote.mjs` | Three refusal paths: no `--looked`; an atlas frame promoted alone; ART-004 with no preview | All three refused |

The success path of `promote.mjs` was not run. Shipping a test asset into `public/` would change the game, and this story must not do that.
