# Landing asset spec (P5-LAND-ART)

> **Art direction**: `docs/v6/landing/ART_DIRECTION.md` (B "Night Tabletop", amended) and V6-015 (the wow
> amendments). **Budget**: `design/adr/ADR-0011-landing-stack-and-budget.md`. **Prompts and verdicts**:
> `docs/v6/ASSET_LOG.md` › P5-LAND-ART. Written with `/asset-spec` (solo review: autonomous run).
> **Location**: V6-LAND-01 moved every final out of `landing/assets-staging/` (now gone) to
> its target path below and wires it. Weights are measured on disk (`stat`), not estimated.

## Decisions

| # | Decision | Why |
|---|---|---|
| A1 | The **terrain and the formations are rendered by the game's own code**, not generated. `scripts/art/landing/diorama.mjs` calls `renderGround`, `renderTree`, `renderBoulder`, `renderBasePlate` and the paperdoll `renderFrame` on a battlefield from `generateBattlefield` (seed 11, river ford). | ART_DIRECTION L1 ("if it could be mistaken for gameplay, it must be gameplay") and §6 (engine render preferred; Gemini cannot hold a pixel grid). The output is deterministic: a re-run is byte-identical. |
| A2 | The units are pre-rendered layers (player, enemy) rather than drawn in the browser. | The paperdoll code is far larger than the 80 kB lazy hero module allows; two transparent 2x layers (14 kB each) give the scroll moment (the lines advance) at no runtime cost. The hero module can still animate them by translating whole layers in whole pixels. |
| A3 | The sky, the lamp beam and the foreground props are **painted** (Gemini), soft, and never pixel. | They are atmosphere, not gameplay. The foreground is a war table (scroll, stylus, the game's Corinthian helmet mark), so the diorama reads as a miniature on a commander's table under one lamp. |
| A4 | **Mode cards use the real clip posters** (`video` agent M1–M4), not generated art. | The honesty rule (DIRECTION_PICK finding 6): the P2 mockups invented a smithy for the Forge and a battlefield for the Campaign map. A recording of the real screen cannot lie. No Gemini mode art was made. |
| A5 | OG image = a code composite of the real layers plus code-set type (Cinzel 700, Inter), exported once to JPEG. | ART_DIRECTION §8 ("composite in code"), no generated lettering. |
| A6 | Favicons = the shipped v5 set (`scripts/art/appicons.mjs`, AS-08), copied unchanged. | Same mark as the game; nothing new to generate. |
| A7 | Painted layers ship as already-encoded files from `public/` with a hand-written `<picture>`; they are **not** fed to Astro `<Picture>`. Pixel layers ship as **lossless WebP + PNG fallback**, never lossy AVIF. | A lossy re-encode blurs pixel art (L3) and double-compresses the painted layers. The painted finals are already inside budget. |
| A8 | **No AVIF with alpha.** macOS `sips` writes AVIF alpha that Chromium does not render (measured: the foreground vanished). Alpha layers are WebP (+ PNG for pixel art). | Measured in a headless Chromium composite, P5-LAND-ART. |

## Hero: depth planes (desktop ≥ 768 px)

At most 4 depth planes (ADR-0011). Plane 3 is one plane made of three stacked files of the same canvas.

| Plane | File(s) (in `landing/public/hero/`) | Size | Format | Weight | Target path | Use |
|---|---|---|---|---|---|---|
| 1 Sky and stars | `landing_hero_sky_1920.avif` / `.webp`; `landing_hero_sky_1280.avif` / `.webp` | 1920x1080; 1280x720 | AVIF q75, WebP q60, opaque | 50.1 / 18.6 kB; 22.0 / 10.1 kB | `landing/public/hero/` | Full-bleed `object-fit: cover`, slowest parallax. The left third is the warm lamp side: text sits there (on its own dark scrim, L4). |
| 2 Lamp beam and dust | `landing_hero_beam_1920.avif` / `.webp`; `landing_hero_beam_960.avif` / `.webp` | 1920x1080; 960x540 | opaque on black | 13.7 / 11.9 kB; 5.1 / 4.7 kB | `landing/public/hero/` | `mix-blend-mode: screen`, opacity about 0.5. The pointer-follow lamp (V6-015 (1)) moves this layer a few px; never over the headline at full strength. |
| 3a Diorama terrain | `landing_hero_terrain_ground_1x.webp` / `.png` + `landing_hero_terrain_props_1x.webp` / `.png` (or the merged `landing_hero_terrain_1x.*`) | 648x426 game px | lossless WebP, PNG | 44.4 / 66.6 kB + 5.4 / 11.4 kB (merged 47.4 / 71.8 kB) | `landing/public/hero/` | Shown at an **integer CSS scale** (2x = 1296x852 on desktop) with `image-rendering: pixelated`. Ground under the units, props (trees, rocks) may be drawn over the units when they overlap. |
| 3b Formations | `landing_hero_units_player_2x.webp` / `.png`, `landing_hero_units_enemy_2x.webp` / `.png` | 1296x852 (the slab's 2x canvas; figures at the battle's native 2x render) | lossless WebP, PNG | 14.6 / 32.9 kB; 13.1 / 31.0 kB | `landing/public/hero/` | Same box as 3a at 2x. Scroll moment: move each layer toward the other along the iso axis (player up-right, enemy down-left) in whole 2x pixels; the resting pose is the file as is. |
| 3 Still (poster) | `landing_hero_diorama_still_2x.webp` / `.png` | 1296x852 | lossless WebP, PNG | 85.1 / 140.4 kB | `landing/public/hero/` | Ground + props + both formations in one file: the LCP image, the reduced-motion and no-JS hero, and the mobile hero. Swap to the separate 3a/3b layers only after the hero module loads. |
| 4 Foreground props | `landing_hero_fg_1920.webp`, `landing_hero_fg_960.webp` | 1920x459; 960x229 | WebP q75, alpha | 23.5 kB; 9.5 kB | `landing/public/hero/` | Bottom of the hero, fastest parallax. Position it partly below the fold (about `bottom: -120px` at 1920) and darken (`filter: brightness(.7)`) so it frames, not competes. Desktop only. |

**Desktop totals** (AVIF where offered): still diorama 85.1 + sky 50.1 + beam 13.7 + fg 23.5 = **172 kB** above the
fold, plus the lazy 3a/3b layers (49.8 + 27.7 kB) after LCP. Budget: ≤ 450 kB for all layers; LCP layer ≤ 120 kB.
Pass.

**Layout notes for the build** (from the 1920x1080 composite, `docs/v6/art/P5-LAND-hero-preview.jpg`):
the diorama box starts at about x = 600 (31%) and its left copse reaches into the text column at 1920; keep the
headline column ≤ 560 px or push the diorama right by 40–80 px. The diorama box has 64 game px (128 at 2x) of
empty space above the far corner, reserved for tree tops.

## Hero: mobile (< 768 px)

ADR-0011: two layers, no beam image, no foreground, no hero video.

| Layer | File | Size | Weight | Use |
|---|---|---|---|---|
| Sky | `landing_hero_sky_m780.avif` / `.webp` | 780x1388 (a 9:16 crop from the warm left side) | 33.9 / 10.7 kB | Cover behind everything; the lamp glow is CSS (`radial-gradient`, `#f2c879` at 0–18%). |
| Diorama | `landing_hero_diorama_still_2x.webp` | 1296x852 | 85.1 kB | Width 432 CSS px (exactly 1:1 device pixels on a DPR 3 phone), centred and cropped by the viewport (L3: crop, do not scale by fractions). |

**Mobile total**: 33.9 + 85.1 = **119 kB** (budget ≤ 180 kB; LCP layer 85.1 kB ≤ 120 kB). Pass.

## Open Graph / Twitter

| File | Size | Format | Weight | Target | Notes |
|---|---|---|---|---|---|
| `landing_og_1200x630.jpg` (now `landing/public/og.jpg`) | 1200x630 | JPEG q55 | 143.3 kB (budget ≤ 150 kB) | `landing/public/og.jpg`; `og:image`, `twitter:image` (`summary_large_image`), absolute URL `https://pixelarrow.app/og.jpg`, `og:image:width` 1200, `og:image:height` 630, `og:image:alt` "Two pixel-art formations face each other on a battlefield diorama: Pixelarrow, Hold the line." | Left: "PIXELARROW", "HOLD THE LINE", "Pixel-art formation battles. Free in your browser and in Telegram.", "pixelarrow.app" in Cinzel 700 / Inter on a dark scrim. Right: the still diorama at its native 2x (integer), cropped by the frame. Sky and beam behind. Rendered from an HTML composite in headless Chromium (recipe in ASSET_LOG). |

## Favicon set

Copied unchanged from the game's `public/` (AS-08, `scripts/art/appicons.mjs`), now in `landing/public/` (moved by V6-LAND-01).
Target: `landing/public/` at the same names, plus a `manifest.webmanifest` written by the build story.

| File | Size | Weight |
|---|---|---|
| `favicon.ico` | 48x48 (multi-size ICO) | 8.1 kB |
| `favicon-32.png` | 32x32 | 2.4 kB |
| `apple-touch-icon.png` | 180x180 | 45.7 kB |
| `icon-192.png` | 192x192 | 62.3 kB |
| `icon-512.png` | 512x512 | 368.7 kB |
| `icon-maskable-512.png` | 512x512 | 245.8 kB |

Only `favicon.ico`, `favicon-32.png` and `apple-touch-icon.png` are linked from the page head (56 kB, never on the
critical path: browsers fetch them at idle). The 192/512 files serve the web manifest only. Source to regenerate:
the AS-08 raw mark through `node scripts/art/appicons.mjs <raw>`.

## Mode cards and clips

No still art. Each mode tile uses its clip poster (`video` agent: M1 Campaign, M2 Duels, M3 War, M4 Forge; AVIF
≤ 40 kB at the clip size, ADR-0011). Class busts and beast plates: the shipped v5 files (LND-03, LND-04), unchanged.

## Not produced, and why

| Asset | Status |
|---|---|
| LND-07 painted "chronicle" band | Not requested by the build story yet; stays in the queue. |
| Cyan formation lattice under the player's line | Drawn in code (1 px `#7fd0e0` diamond grid at 25%), not an image: it must animate and stay crisp. |
| Hero ambient video H1 | The `video` agent's job. |

## Regenerating

- Pixel layers: `node scripts/art/landing/diorama.mjs` (formation layout in `scripts/art/landing/units.json`). The
  still is ground + props + enemy + player stacked in that order.
- Painted layers: the raws in `docs/v6/gemini/P5/` cropped and encoded as listed above (cover crop, area-average
  downscale with `scripts/art/lib/ops.mjs`; AVIF via `sips`, WebP via `cwebp`; the foreground keyed with
  `keyOut` tol 70, fringe 3, cropped to its alpha box).
