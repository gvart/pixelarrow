# The image pipeline, end to end

From "we need a picture" to a file the game loads. Scripts: [docs/v5/art/ASSET_PIPELINE.md](../v5/art/ASSET_PIPELINE.md).
What exists and at which size: [docs/v5/art/ASSET_LIST.md](../v5/art/ASSET_LIST.md), generated from
`docs/v5/art/asset-manifest.json`. Soldier sprites: [docs/v5/art/STYLE_LOCK.md](../v5/art/STYLE_LOCK.md). Prompts:
[PROMPTS_ART.md](PROMPTS_ART.md).

```
manifest row → prompt (template + seed) → Gemini (one job at a time) → raw in docs/<ver>/gemini/<job>/
  → process.mjs → check.mjs → wire the slot in code → look at it in the game (Playwright screenshots)
  → promote.mjs --looked → check.mjs --shipped → asset log entry
```

## 1. Art bible essentials

| Rule | Detail |
| --- | --- |
| Two media, never mixed in one frame | You **act** on pixel art (map, battlefield, soldiers). You **read** painted art (menus, portraits, banners, rewards, codex). A pixel sprite is never cropped or blurred into a painted slot. |
| Read it on a phone | Text ≥ 4.5:1 and ≥ 13 CSS px; no state by colour alone; a bust reads at 21 UI px by its headgear silhouette. |
| One job per colour | Terracotta = the one action now; bronze = any other live action; grey = disabled only; red = danger or loss; blue = real money; gold = reward. |
| Warm, lit from the upper left | Earth pigments, no pure black or white, no neon; both media lit from the upper left. |
| Painted style | Ancient Mediterranean fresco on lime plaster: ochre, umber, terre verte, a little Egyptian blue, visible brushwork, fine craquelure, soft edges. Not a photo, 3D render, glossy digital art, anime or comic ink. |
| Class busts | Identity = headgear silhouette + one prop at the shoulder; no two classes share a headgear silhouette. Where the bible and the game kit disagree, **the kit wins** (V5-050). |
| Chrome is code | Frames, buttons, tiles, plaques, the tab bar are procedural (`src/art/mosaicUi.ts`). Only illustrations are generated. |
| Icons | Painted, single object, three-quarter view, heavy #2a1a12 outline, 160x160 cell, object at 88%, reads at 24 px in greyscale. One meaning per icon (`RESERVED_ICONS` in `src/ui/tokens.ts`). Simple symbols (✓ ✗ chevrons, info, gems) stay vector. |
| No text in any generated image | Logos and labels are set in code. |
| Pixel art | True pixel art, binary alpha, palette PA-WORLD (`docs/v5/art/palette.json` › `world`), sel-out outlines, 3–4 step ramps, integer scaling only. The iso cell is **36x18** (V5-066). |

## 2. The Gemini workflow

1. **One job at a time.** One `assets` agent owns the Chrome tab with Gemini; other stories queue requests in the
   asset log. The Director never drives Chrome.
2. **Tool.** gemini.google.com, "Pro" mode, in Claude in Chrome where the owner is logged in. Read the
   `chrome-browser` skill, load the `mcp__claude-in-chrome__*` tools in one ToolSearch call, open a new tab, never
   touch the owner's other tabs or settings, close the tab at the end.
3. **Prompt.** "Create an image…" (first), "Create a NEW image, not an edit of the reference…" (family members),
   "Edit the attached … Change only: …" (variants). Ask for the aspect in the prompt; no picker needed.
4. **Seeds.** Approve one asset of a family, then attach it to every later prompt of that family ("Match the
   attached reference exactly in style…; change only the subject"). Attach through the page's hidden `image/*` input.
5. **Download** into `docs/<ver>/gemini/<job>/<ART-id>_<stem>_<n>.<ext>` (`n` counts attempts; never overwrite).
   The mover takes only a `Gemini_Generated_Image_*` file absent from a start listing of `~/Downloads` and newer
   than the start time, and refuses on anything but one match. Never move anything else out of `~/Downloads`.
6. **Raw is gitignored** (V5-049); processed files, promoted assets and contact sheets are committed.
7. **Limits.** On a quota message, CAPTCHA or Chrome's "automatic multiple downloads" block: log it, stop, carry on
   with code-drawn or placeholder art, ask the owner. Never change browser or account settings.
8. **Log** every prompt word for word and every render with its verdict.

## 3. Verify mockups and renders for invented features

An early hub mockup invented a "Quests" tile (owner's rule: verify generated mockups). Since then:

- **Before the prompt:** list the screen's real elements from the scene code. The prompt names every element it
  may show (an allowlist) and ends with "Nothing else on the screen: no quests, no mail, no energy, no level bar, no
  gems, no extra buttons".
- **After the render:** compare tile by tile (top bar, profile, cards, CTA, tiles, caption, tab bar, nothing extra).
  Reject on an extra element, a misleading placement (a "+4" on a portrait read as a level), or a reserved glyph
  reused (the War medallion's crossed spears on doctrine rows).
- **Reject on sight, for every asset:** text, letters or numbers (a lambda on a shield counts); extra or missing
  limbs or heads; modern objects (a D-grip spade); the wrong headgear; a painted frame; on #FF00FF assets, a shadow,
  gradient or floor on the magenta, or magenta inside the subject.
- New features appear in a mockup only once they have a GDD and a story.

## 4. Process, check, look, promote

All scripts are in `scripts/art/` (Node 20, no extra dependencies; JPEG and WebP through macOS `sips`).

```bash
node scripts/art/process.mjs ART-013 <raw> [--ax 0.5 --ay 0.25] [--tol 60] [--fringe 3] [--grid n]  # key/crop/size
node scripts/art/check.mjs ART-013                 # audit the staged file (docs/v5/art/staging/, gitignored)
node scripts/art/atlas.mjs icons_ui                # icons: rebuild the atlas from current + staged
npm run dev -- --port <free port>
node scripts/art/promote.mjs ART-013 --looked      # after looking at it in the game
node scripts/art/promote.mjs --atlas icons_ui --looked
node scripts/art/check.mjs --shipped ART-013       # size budget
node scripts/art/contrast.mjs                      # palette pairs: text ≥ 4.5, UI ≥ 3
node scripts/art/list.mjs                          # regenerate ASSET_LIST.md
node scripts/art/nineslice.mjs <id>                # raster 9-slice chrome only
node scripts/art/appicons.mjs <raw>                # app icon and favicon set from one mark
```

| Kind | What `process.mjs` does |
| --- | --- |
| `painted` (fresco, vignette, bust, plate, splash) | Cover-crop at the anchor, one area-average downscale, opaque. **Refuses to upscale.** Busts use `--ay 0.25`. |
| `cutout` (chest, laurel) | Key #FF00FF (tol 60 plus a soft ramp), despill, trim, contain (`ay 1` sits on the bottom). |
| `icon` | As cutout, centred at 0.88 of a 160 square. |
| `frame` | Key out, exact cover; then `nineslice.mjs`. |
| `pixel` | Hard key, detect the fake-pixel block (`--grid n` above 32), unscale by majority colour, snap to PA-WORLD, binary alpha, pad into the canvas. **Never scaled to fit**: too big means regenerate. |

`promote.mjs` refuses unless `check.mjs` passes and you pass `--looked` (the v5 `preview.mjs` and its layout check
are gone). So the story that **wires the slot** looks at it in the game and promotes.

**Looking:** a scratch Playwright run (system Chrome) of the screen that shows it: the slot is filled (no fallback);
no blur or shimmer at DPR 3; faces and helmets not cropped at the narrowest crop; no clash with chrome or text;
matches its family; pixel art crisp at an integer scale.

## 5. Sizes and budgets

Shipped px = the largest on-screen slot in UI px × 6, so phones only scale down. A source below its tier is
regenerated, never upscaled. For landscape slots, apply the rule to the widest slot and check the crop at both the
narrowest phone and the widest desktop.

| Asset | Shipped size | Format | Budget | Folder |
| --- | --- | --- | --- | --- |
| Fresco (mode banner) | 1080x480 (strips such as the shop 1032x132) | JPEG q82 | ≤ 160 KB | `public/ui/` |
| Settlement vignette | 1032x420 | JPEG | ≤ 130 KB | `public/ui/` |
| Class bust | 288x288 | JPEG | ≤ 30 KB | `public/ui/busts/` |
| Beast plate | 288x288 | JPEG | ≤ 35 KB | `public/ui/beasts/` |
| Nikias frame | 384x384 | JPEG | ≤ 40 KB | `public/ui/` |
| Splash key art | 780x1688 | JPEG | ≤ 220 KB | `public/ui/` |
| Chest | 288x272 | PNG-32 | ≤ 100 KB | `public/ui/` |
| Laurel branch | 160x216 | PNG-32 | ≤ 100 KB | `public/ui/` |
| Icon | 160x160 cell | atlas PNG + JSON | atlas ≤ 2048 wide, ≤ 4096 tall | `public/icons/` |
| World pixel sprite | native art px (bible: soldier 32x32, mounted 48x48, lair beast 96x96, boss 160x128; works 36x20–72x52) | PNG binary alpha | — | `public/world/` |

Over budget: lower the manifest row's `quality` (the splash shipped at 62) or re-encode a PNG with adaptive filters
and RGB quantized in steps of 4 (134 → 61 KB). Preview that exact file again before promoting. Alpha layers for the
web ship as WebP (`sips` AVIF with alpha does not show in Chromium).

Names: `<category>_<subject>[_<variant>].<ext>`, lowercase snake case, no size suffix; texture key `ui_<stem>`;
atlas frame `ui:<subject>`. `check.mjs` enforces it.

## 6. What Gemini can and cannot do

| Works | Doesn't |
| --- | --- |
| Painted busts, plates, frescoes, vignettes, splash: 12 of 12 accepted first try once a seed was attached | Lettering of any kind (it adds a lambda to shields unless told not to) |
| A 2x2 grid of four icons per prompt, cut into quadrants by script | Holding a pixel-grid cell count (overshot 1.4x–2.6x, cell size drifted) |
| Edits that keep geometry (closed → open empty → open full chest) | Tiny pixel sprites at exact grids (drawn in code, V5-066) |
| Relative sizes in a pixel set ("half as wide as the wagon") | Mirroring on request (flip with `sips -f horizontal`) |
| Very dark backdrops and light-only layers for the web | Low, dark props: it makes them tall and lit unless capped by % |

## 7. Open items

`fresco_ladder`, `chest_closed` and `chest_open_full` staged, not promoted; OI-3: regenerate the 101 legacy 64 px
icons at 160 px. To preview a class bust, run `preview.mjs` on its opt-in `army-bust-<class>` screen. Keep the
approved v5 seeds attached for new art (for example `bust_hoplite`).
