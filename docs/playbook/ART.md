# The image pipeline, end to end

From "we need a picture" to a file the game loads. Rules: [design/art/art-bible.md](../../design/art/art-bible.md).
Scripts: [docs/v5/art/ASSET_PIPELINE.md](../v5/art/ASSET_PIPELINE.md). What exists and at which size:
[docs/v5/art/ASSET_LIST.md](../v5/art/ASSET_LIST.md), generated from `docs/v5/art/asset-manifest.json`. The
prompts: [PROMPTS_ART.md](PROMPTS_ART.md).

```
manifest row → prompt (template + seed) → Gemini (one job at a time) → raw in docs/<ver>/gemini/<job>/
  → process.mjs → check.mjs → wire the slot in code → preview.mjs (real game, 3 sizes) → read the sheets
  → promote.mjs --looked → check.mjs --shipped → ASSET_LOG entry
```

## 1. Art bible essentials

| Rule | Detail |
| --- | --- |
| Two media, never mixed in one frame | You **act** on pixel art (map, battlefield, soldiers). You **read** painted art (menus, portraits, banners, rewards, codex). A pixel sprite is never cropped or blurred into a painted slot (§1 P1, §8.6). |
| Read it on a phone | Text ≥ 4.5:1 and ≥ 13 CSS px; no state by colour alone; a bust reads at 21 UI px by its headgear silhouette. |
| One job per colour | Terracotta = the one action now; bronze = any other live action; grey = disabled only; red = danger or loss; blue = real money; gold = reward (§4.2). |
| Warm and lit from the upper left | Earth pigments, no pure black or white, no neon; both media lit from the upper left. |
| Painted style | Ancient Mediterranean fresco on lime plaster: ochre, umber, terre verte, a little Egyptian blue, visible brushwork, fine craquelure, soft edges. Not a photo, 3D render, glossy digital art, anime or comic ink. |
| Class busts | Identity = headgear silhouette + one prop at the shoulder. No two classes share a headgear silhouette (§5.2). Where the bible and the game kit disagree, **the kit wins** (V5-050). |
| Chrome is code | Frames, buttons, tiles, plaques, the tab bar are procedural (`src/art/mosaicUi.ts`). Only illustrations are generated. |
| Icons | Painted, single object, three-quarter view, heavy #2a1a12 outline, 160x160 cell, object at 88%, reads at 24 px in greyscale. One meaning per icon (`RESERVED_ICONS` in `src/ui/tokens.ts`). Simple symbols (✓ ✗ chevrons, info, gems) stay vector. |
| No text in any generated image | Gemini cannot letter reliably; logos and labels are set in code. |
| Pixel art | True pixel art, binary alpha, palette PA-WORLD (35 colours in `docs/v5/art/palette.json` › `world`), sel-out outlines, 3–4 step ramps, scaled only by integers in device px. The iso cell is **36x18** in code (V5-066). |

## 2. The Gemini workflow

1. **One job at a time.** Only one agent (the `assets` agent) owns the Chrome tab with Gemini. Subagents do not
   share a browser; other stories add requests to a queue in the asset log. The Director never drives Chrome.
2. **Tool.** gemini.google.com, "Pro" mode ("Gemini 3.1 Pro" in the log), in Claude in Chrome where the owner is
   logged in. Read the `chrome-browser` skill, load the `mcp__claude-in-chrome__*` tools in one ToolSearch call,
   open a new tab, never touch the owner's other tabs or account settings, close the tab at the end.
3. **Prompt.** Typed as "Create an image…" (first) or "Create a NEW image, not an edit of the reference…"
   (family members) or "Edit the attached … Change only: …" (variants). No tool or aspect picker was needed
   after AS-01; the aspect is asked for in the prompt.
4. **Seeds.** Make one asset of a family first, approve it, then attach it to every later prompt of that family
   as the style reference ("Match the attached reference exactly in style…; change only the subject").
   References are attached through the page's hidden `image/*` input.
5. **Download.** Save into `docs/<ver>/gemini/<job>/<ART-id>_<file stem>_<n>.<ext>`; `n` counts attempts, never
   overwrite. A safe mover script takes only a `Gemini_Generated_Image_*` file that was absent from a start
   listing of `~/Downloads` and newer than the start time, and refuses on anything but one match. Never move
   anything else out of `~/Downloads` (an earlier helper moved an unrelated file and had to put it back).
6. **Raw is gitignored** (V5-049): raws stay on disk in the main worktree, never committed. Processed files,
   promoted assets and contact sheets are committed.
7. **Limits.** If Gemini or Chrome blocks (a quota message, a CAPTCHA, or Chrome's "automatic multiple downloads"
   block seen in AS-02), log it, stop Gemini use, carry on with code-drawn or placeholder art, and ask the owner
   to change the browser setting. Never change browser or account settings yourself.
8. **Log.** Every prompt word for word, every render with its verdict and why, in the asset log.

## 3. Verify mockups and renders for invented features

The rule from the owner (memory "verify generated mockups"): an early Campaign hub mockup invented a "Quests"
tile. Since then:

- **Before the prompt:** list the screen's real elements from the scene code (`docs/v5/ux/ELEMENT_MAP.md`). The
  prompt names every element it may show (an allowlist) and ends with "Nothing else on the screen: no quests,
  no mail, no energy, no level bar, no gems, no extra buttons". Never put an invented feature in a prompt.
- **After the render:** compare it to the allowlist **tile by tile** (top bar, profile, cards, CTA, tiles,
  caption, tab bar, and nothing extra). Reject and regenerate on any extra element, a misleading placement
  (AS-01 C: a "+4" drawn on a portrait read as a level), or a reserved glyph reused (AS-01 B: the War
  medallion's crossed spears on doctrine rows).
- **For every asset, reject on sight:** text, letters or numbers (a lambda on every shield counts); extra or
  missing limbs or heads; modern objects (a D-grip spade); the wrong headgear for the class; a painted frame
  round the image; on #FF00FF assets, a shadow, gradient or floor on the magenta, or magenta inside the subject.
- New features may appear in a mockup only once they have a GDD and a story.

## 4. Process, check, preview, look, promote

All scripts are in `scripts/art/` (Node 20, no extra dependencies; JPEG and WebP through macOS `sips`).

```bash
# 1. key out / crop / exact size, by the manifest row's kind
node scripts/art/process.mjs ART-013 <raw> [--ax 0.5 --ay 0.25] [--tol 60] [--fringe 3] [--grid n]
# 2. audit the staged file (docs/v5/art/staging/, gitignored)
node scripts/art/check.mjs ART-013
# 3. icons only: rebuild the atlas from the current atlas + staged icons
node scripts/art/atlas.mjs icons_ui
# 4. in the real game, at 390x844, 360x780 and 320x640 (DPR 1 verdict, DPR 3 contact sheets)
npm run dev -- --port <free port>          # your own port
node scripts/art/preview.mjs ART-013 http://localhost:<port>/
# 5. READ every contact sheet, then ship
node scripts/art/promote.mjs ART-013 --looked
node scripts/art/promote.mjs --atlas icons_ui --looked
# 6. size budget of the shipped file
node scripts/art/check.mjs --shipped ART-013
# helpers
node scripts/art/contrast.mjs              # every palette pair: text ≥ 4.5, UI ≥ 3
node scripts/art/list.mjs                  # regenerate ASSET_LIST.md from the manifest
node scripts/art/nineslice.mjs <id>        # raster 9-slice chrome only
```

| Kind | What `process.mjs` does |
| --- | --- |
| `painted` (fresco, vignette, bust, plate, splash) | Cover-crop at the anchor, one area-average downscale, opaque. **Refuses to upscale.** Busts use `--ay 0.25`. |
| `cutout` (chest, laurel) | Key #FF00FF (tol 60 plus a soft ramp), despill the fringe, trim, contain (`ay 1` sits on the bottom). |
| `icon` | As cutout, centred at 0.88 of a 160 square. |
| `frame` | Key out, exact cover to the size. Then `nineslice.mjs`. |
| `pixel` | Hard key, detect the fake-pixel block (`detectGrid`, max 32; use `--grid n` above that), unscale by majority colour, snap to PA-WORLD, binary alpha, pad into the exact canvas. **Never scaled to fit**: too big means regenerate. |

`preview.mjs` reports **NOT ASSESSED** (exit 3) when no game slot loads the file yet (`preview: null` in the
manifest), and `promote.mjs` refuses without a preview of this exact file (sha256), a layout exit 0 and
`--looked`. So the story that **wires the slot** (a `RASTERS` key in `src/ui/mosaic/raster.ts` or an atlas
frame) previews and promotes. Generating and wiring are separate stories.

**When you read a sheet, check:** the slot is filled (no parchment fallback); no blur or shimmer at DPR 3; faces
and helmets not cropped at the narrowest crop; no clash with chrome or text; it matches its family; pixel art
crisp at an integer scale. Also look in the game itself for slots the layout fixtures do not reach (AS-04 used
a scratch Playwright run to see the Phoenician and Celtic vignettes; AS-06 placed the works sprites into a live
battle because no slot loaded them yet).

**Contact sheets** go to `docs/<ver>/art/<job>-contact.jpg` (about 140 KB): each asset at its real slot sizes,
on its real backgrounds, beside the in-game sprites for scale.

## 5. Sizes and budgets

Shipped px = the largest on-screen slot in UI px × 6 (a 3x phone), so phones only scale down. A source below
its tier is regenerated, never upscaled.

| Asset | Shipped size | Format | Budget | Folder |
| --- | --- | --- | --- | --- |
| Fresco (mode banner) | 1080x480 (strips such as the shop 1032x132) | JPEG q82 | ≤ 160 KB | `public/ui/` |
| Settlement vignette | 1032x420 | JPEG | ≤ 130 KB | `public/ui/` |
| Class bust | 288x288 | JPEG | ≤ 30 KB | `public/ui/busts/` |
| Beast plate | 288x288 | JPEG | ≤ 35 KB | `public/ui/beasts/` |
| Nikias frame | 384x384 | JPEG | ≤ 40 KB | `public/ui/` |
| Splash key art | 780x1688 | JPEG | ≤ 220 KB | `public/ui/` |
| Chest | 288x272 | PNG-32 | ≤ 100 KB (manifest 90) | `public/ui/` |
| Laurel branch | 160x216 | PNG-32 | ≤ 100 KB (manifest 50) | `public/ui/` |
| Icon | 160x160 cell | atlas PNG + JSON | atlas ≤ 2048 wide, ≤ 4096 tall | `public/icons/` |
| World pixel sprite | native art px (soldier 32x32, mounted 48x48, lair beast 96x96, boss 160x128, works 36x20–72x52) | PNG binary alpha | — | `public/world/` |

Over budget: lower the manifest row's `quality` (the splash shipped at 62, the Celtic vignettes at 70), or
re-encode a PNG with adaptive filters and RGB quantized in steps of 4 (the open chest went from 134 KB to 61 KB).
Preview that exact file again before promoting.

Names: `<category>_<subject>[_<variant>].<ext>`, lowercase snake case, no size suffix; texture key
`ui_<stem>`; atlas frame `ui:<subject>`. `check.mjs` enforces it.

## 6. What Gemini can and cannot do (measured in v5)

| Works | Doesn't |
| --- | --- |
| Painted busts, plates, frescoes, vignettes, splash: 12 of 12 accepted first try in AS-05 once a seed was attached | Lettering of any kind (it adds a lambda to shields unless told "plain bronze shields, NO lambda") |
| A 2x2 grid of four icons per prompt, cut into quadrants by script (one family, fewer downloads) | Holding a pixel-grid cell count: it overshot by 1.4x to 2.6x and changed cell size between images |
| Edits that keep geometry (closed → open empty → open full chest) | Tiny pixel sprites at exact grids (a 10x10 crest, a 16x44 banner): those were drawn in code (V5-066) |
| Relative sizes in a pixel set ("half as wide as the wagon and a little taller") | Mirroring on request (the laurel came out the wrong way; it was flipped with `sips -f horizontal`) |

## 7. For v6

- Start a new job folder (`docs/v6/gemini/<job>/`) and a new asset log, but keep the v5 templates and seeds: they
  are the family. Attach the approved v5 seed (for example `bust_hoplite`) to keep new art in the same style.
- Landscape layouts will need wider frescoes and vignettes: re-run the tier rule (slot × 6) for the widest
  landscape slot before generating, and check the crop at both the narrowest phone and the widest desktop.
- Open items at the end of v5 (from `public/` on `v5`): 4 of 21 busts promoted (17 staged in
  `docs/v5/gemini/AS-02/processed/`); `fresco_ladder`, `chest_closed` and `chest_open_full` staged, not promoted;
  the Nikias frames ART-033..035 never generated; OI-3 (regenerate the 101 legacy 64 px icons at 160 px).
