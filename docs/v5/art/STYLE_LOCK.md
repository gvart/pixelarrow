# Unit style lock (I3a)

One recipe for every soldier sheet, so all 18 classes look like one set with the
hoplite H4 (the dark-epic E3 look of I1b, redrawn at realistic adult proportions).
Follow it exactly; when a class needs to deviate, write the deviation and the reason
into that class's section of `docs/v5/ASSET_LOG.md`.

Scripts: `scripts/art/pixellab/`. Raws go under `docs/v5/pixellab/<round>/raw/`
(gitignored). Generating is not shipping: only `sheetbuild.mjs` writes
`src/assets/sheets/<class>/`.

## 1. Style anchors

| anchor | PixelLab character id | what it is |
| --- | --- | --- |
| **H4** (primary) | `b7624d6d-132a-458c-8e3d-d6960d175988` | the I3a hoplite: E3 style, realistic proportions, 68 x 68, high top-down, 8 directions |
| E3 (secondary) | `62d4f135-e00e-45d6-9daa-f2c1d1d6734f` | the approved I1b look (big helmet, short legs: proportions **not** to copy) |

New classes use **H4** as `style_character_id`. E3 is only kept for reference.

## 2. Base character: fixed parameters

Two calls per class. Expect about 1.5 tries per class (H1–H3 of the hoplite were rejected).

**Step A — the first draft** (`create_character`):

| param | value |
| --- | --- |
| `mode` | `pro` (10 generations at size 68) |
| `style_character_id` | H4 `b7624d6d-132a-458c-8e3d-d6960d175988` |
| `size` | `68` (canvas 68 x 68) |
| `view` | `high top-down` |
| `n_directions` | 8 (pro: always) |
| outline / shading / detail / proportions | ignored by pro mode: they come from the style character |
| `description` | the style block below with the class slot filled |

**Step B — re-proportion and redraw** (only when step A comes back with a big helmet or short legs. With E3 as
the style character every hoplite prompt did, so H4 needed it; with H4 as the style character step A usually lands
the proportions already (I4a)):

1. Measure the south view of the draft (`node scripts/art/pixellab/ascii.mjs <south.png>`): the rows of crest, helmet, torso and
   legs.
2. `node scripts/art/pixellab/proportion.mjs <draft south.png> <concept.png> --bands <crest>,<helmet>,<torso>,<legs> --feet 65`
   so that, helmet top to feet = 58 px: helmet (with the face) about 9–10 px, chin to crotch about 20 px, legs
   about 26 px (47 %). The hoplite's bands: `3:10:0.6:0.75:7:33,11:24:0.68:0.78:8:33,25:48:0.86,49:65:1.55`
   (y0:y1:scaleY:scaleX:radius:centreX; a held weapon outside the radius stays put).
3. Upscale the concept 4x (nearest) and upload it (`get_upload_url` + curl).
4. `create_character` again, same params as step A plus `concept_image_url: upload:<id>` and the description
   opening "… with the realistic adult proportions of the concept: seven heads tall, a small head in a snug helmet,
   long legs, natural arms …".

**Normalisation (every class, every figure category):** foot soldiers stand with the feet on row 65–66 of the
68 canvas and **58 ± 2 px from the top of the skull to the feet** (`rig.mjs STATURE_PX`): measured at the skull,
not at a crest, plume, pilos point or Phrygian crown; the chin at 45 px and the pelvis at 26 px above the feet
(`rig.mjs SHAPE_PX`, which the skeleton keypoints are warped to). Never rescale (it breaks the pixel clusters).
A figure that comes back too tall (bare heads do: pro fits the top of the figure to rows 3–5, and refuses sizes
under 66 with H4 as the style) is normalised without resampling: whole rows (and a few columns) that repeat their
neighbour are dropped below the chin, the same count in all 8 views, the figure re-aligned on its feet row, and the
8 views imported back as a v3 character (0.25 generations) so every animation starts from them
(`scripts/art/pixellab/rollout/normalise.mjs --rows k --cols c`, the per-class numbers in
`docs/v5/pixellab/bases.json`). Do not change the pose (a weapon raised for headroom) to fix the framing.
Riders, chariots and beasts get their own row in this table when they are made.

| category | canvas | feet row | skull top → feet | chin | pelvis |
| --- | --- | --- | --- | --- | --- |
| foot soldier | 68 x 68 | 65–66 | 58 ± 2 | 45 | 26 |

## 3. The prompt style block (verbatim) and the class slot

```
<CLASS SLOT: who he is, e.g. "tall grim Spartan hoplite"> with the realistic adult proportions of the concept: seven heads tall, a small head in a snug helmet, long legs, natural arms, broad shoulders, lean muscular build; <GEAR SLOT: helmet, crest, cloak, armour, legs, shield, in that order, each with its dark colour>; <WEAPON SLOT: one ... held ... in his right hand ..., clearly visible in every direction, ...>; heavy shadows, desaturated dark warm colours like the style reference
```

Rules for the slots:

- Colours only from the dark-epic families: dark weathered bronze, dark crimson, oxblood-brown, umber leather,
  dark iron; **no white cloth**, nothing bright.
- Name every held item once with "one", with its size and where it is ("one very large round bronze aspis on his
  left arm, chin to knee").
- A spear or long weapon: "held vertically in his right hand out at his right side, away from his body and clearly
  visible in every direction, much taller than the man, single leaf-shaped spearhead at the top, plain blunt
  wooden butt end, no butt spike". Without "out at his right side … in every direction" the weapon is hidden in
  NW or crosses the face in SE (I1b E1, I3a H1).

The hoplite H4 description, word for word:

```
tall grim Spartan hoplite with the realistic adult proportions of the concept: seven heads tall, a small head in a snug helmet, long legs, natural arms, broad shoulders, lean muscular build; dark weathered bronze Corinthian helmet covering the face with a deep dark crimson horsehair crest; deep dark crimson cloak hanging behind him; dark bronze muscle cuirass over a dark oxblood-brown tunic, worn dark leather straps, no white cloth; dark bronze greaves; one very large round bronze aspis on his left arm, chin to knee, dark bronze rim and a muted dark-red lambda; one very long wooden spear held vertically in his right hand out at his right side, away from his body and clearly visible in every direction, much taller than the man, single leaf-shaped spearhead at the top, plain blunt wooden butt end, no butt spike; heavy shadows, desaturated dark warm colours like the style reference
```

## 4. QC checklist: rotations (before any animation is paid for)

Make the contact sheet (`node scripts/art/pixellab/sheet.mjs out.png --scale 6 --rot <name> <rotations dir>`
plus the four game facings at scale 8 beside H4's) and check, per game facing (SE, NE, SW, NW):

1. Every item of the prompt is there exactly once: one weapon, one shield; nothing invented (a second spear, a
   sword, a bag, a belt of a new colour).
2. The weapon is visible in all four game facings, its head at the top, its butt plain and blunt.
3. The head faces the facing (no head turned backwards); nothing cut off by the canvas.
4. Helmet top to feet is 58 ± 2 px, feet on row 65–66, helmet about a seventh of the height, legs about half.
5. Colours: dark-epic only; side by side with H4 at zoom 1–3 the class reads as the same set (outline weight,
   shading steps, pixel density, bronze and crimson ramps).
6. Log the attempt (prompt verbatim, id, outcome and why) in `docs/v5/ASSET_LOG.md` and
   `docs/playbook/PROMPTS_ART.md` before the next call.

## 5. Colour pipeline

Unit sheets are not hard-snapped (V5-087). Every frame goes through `scripts/art/pixellab/groups.mjs`
(called by `sheetbuild.mjs`):

1. **Invented colours are cut, not remapped**: a pixel with OKLab chroma over 0.14 (sparks, glows, the bright blood
   PixelLab adds to hits and deaths whatever the prompt says), lightness over 0.86 (flashes) or a light neutral grey
   (ghost trails on fast spears) is made transparent; then detached specks under 5 px and loose crimson splats under
   60 px. Blood that touches the body is cleared by a `clear` fix with `red: true` in the spec.
2. **Ramp-aware remap** onto PA-WORLD-DARK (`docs/v5/pixellab/palette-dark.json`) limited to the class's ramps
   (spec `ramps`; the hoplite: outline, crimson, umber, darkBronze, skin): ramp by hue and chroma, step by lightness.
   Add a ramp to the palette file when a class has a hue the ramps lack (I4a added purpleBlack and plaidGreen).
3. **Parts** with one exclusive hex set each (a step two parts share is nudged by 1 in one channel, invisible):
   `cloak` (crimson), `crest` (crimson blobs at the top of the figure, carried frame to frame), `emblem` (crimson
   painted on the shield: bordered by bronze, never by outline or background), `trim` (the lightest bronze step: what
   the elite gilds), `metal` (the other bronze steps: rarity of shield, helmet, armour), `weaponMetal` (the spearhead,
   when the spear's head end is found: rarity of the weapon), `wood` (thin pixels on the spear line, the butt), `skin`,
   `shadow` (the darkest bronze step, not recoloured), `outline`.
   The mapping above is the hoplite's default; any other ramp falls to `shadow`. A class whose groups sit in other
   ramps declares them in the spec's `parts`: `{ "<ramp>": "<part>" }`, with per-step keys `"<ramp>:<step>"` or
   `"<ramp>:<from>-<to>"` (a step key wins over a range, a range over the whole ramp, the ramp over the default).
   Royal guard: `{ "purpleBlack": "cloak", "linen": "crest", "metal": "metal" }`; sacred band: `{ "purpleBlack":
   "cloak", "metal": "cloak" }`; falx: `{ "skin:0": "shadow" }` (the leather on skin step 0 leaves the skin group).
   Only crimson cloak is split into crest and emblem or dropped as a splat; the spear line also takes the `metal`
   ramp (iron heads).
   A class with no crest or no shield emblem sets `"crest": false` / `"emblem": false` in the spec: otherwise the
   highest crimson blob (the cloak at the shoulders) is labelled crest, and crimson enclosed by brown emblem; with the
   flag that crimson stays `cloak`. The QC stature (`qc.mjs --spec`) is measured from the first metal / trim pixel by
   default; the spec's `stature` changes that: `{ "skipTop": <rows> }` drops headgear rows (a Phrygian crown: bases.json
   `headgear_top` to `crown`), `{ "from": "any" }` measures from the first opaque non-weapon pixel (bare-headed archer,
   falx, slinger, gallic, fanatic; the spear line found by the spear detection and the wood / weapon metal groups are
   not counted). Both combine. `"px"` / `"tol"` in the same field replace the 58 ± 3 target (mounted: riders about
   84-92 px from helmet top to hooves, the chariot driver about 100); `qc.mjs --stature N[:tol]` is the CLI shortcut
   and wins over the spec. They combine with `skipTop` / `from`.
   The light-neutral-grey cut (step 1) also takes a lit iron blade: iron-clad classes set `"greyCut": 0.8` (default
   0.55, the OKLab lightness above which a neutral grey is cut as a ghost trail).
4. The manifest lists `colorGroups` (cloak, crest, trim, skin, emblem, wood; dark to light), `metal` (light to dark)
   and the tier ramps (`tiers.veteran`, `tiers.elite`: anchor colours in the spec, interpolated to each group's
   length). Hoplite tiers: veteran = wine cloak, scarlet crest, polished trim; elite = black cloak and crest, gold trim
   (the I1b elite probe's colours).
   Iron-clad classes set `"metalKind": { "metal": "iron", "weaponMetal": "iron" }` in the sheet spec: each metal group's
   manifest `kind` (default `bronze`), so rarity follows the iron ramp (`ironOf`), and at rank 0 an iron group keeps
   the sheet's own colours (bronze still spreads over dull bronze). `"metalSlots": { "metal": ["helmet", "armor"] }`
   narrows the gear a metal group follows for its rarity (default shield, helmet and armour for `metal`, the weapon for
   `weaponMetal`), e.g. when the shield is wood. Both are per group and optional. `"spear": false` turns off the
   spear-line detection for classes without a spear (swords, axes, bows), whose plaid cloak, leather and skin would
   otherwise be tagged `wood` / `weaponMetal` along the longest thin line (default on). The hoplite sets none of them.

## 6. Animation recipe

All clips start from the class's own frames: the 68 rotation (`rot`), the rotation with the weapon redrawn levelled
(`guard`, `spear.mjs`, 128 x 112), on a tall canvas (`tall`, 96 x 112, for a weapon raised overhead) or centred on
a big canvas (`die`, 128 x 128, room to lie down). `docs/v5/pixellab/I3/hoplite.sheet.json` › canvases has the
offsets. Cost at these sizes: pixminimax 1 generation (68 canvas) or 2 (128); skeleton-v3 3 (12–15 frames).

| clip | mode | frames, fps | first frame | notes |
| --- | --- | --- | --- | --- |
| idle | pixminimax | 12 @ 8 | rot | "slow calm breathing … feet stay planted" |
| look | pixminimax | 16 @ 8 | rot | "only the head and shoulders turn, never further than over his shoulder" |
| adjust | pixminimax | 12 @ 10 | rot | shield hitched and resettled |
| walk | pixminimax | 16 @ 16 | rot | "marching walk in place towards …" |
| run | pixminimax | 12 @ 16 | rot | back views: "the shield stays clearly visible on the left arm" |
| rout | pixminimax | 12 @ 16 | rot | hunched, head low; the weapon still head-up |
| kneel | pixminimax | 12 @ 8, hold 4 | rot | sinks to the right knee, leans on the shield |
| ready | pixminimax | 12 @ 8 | guard | weapon level, pointing forward in every frame |
| charge | pixminimax | 12 @ 16 | guard | heavy run, weapon levelled |
| brace | pixminimax | 12 @ 10, hold 5 | guard | crouch behind the shield, then hold |
| block | pixminimax | 12 @ 14 | guard | sparks come anyway: the invented-colour cut removes them |
| stagger | pixminimax (SW: skeleton) | 12 @ 12 | guard | reels back and steps back up (the sim moves the man, the sprite keeps its anchor) |
| fallBack / fallFwd | pixminimax | 12 @ 12 | die | blood comes anyway: cut, or a `red` clear fix |
| cheer | pixminimax | 12 @ 10, hold 3 | tall | the 68 canvas has no room for a spear raised overhead (a1 rejected) |
| thrust | **skeleton-v3** | 14 @ 14, strike 6 | guard | `rig.mjs thrust <dir> guard.png --grip x,y`; see below |

**Skeletons without hand-fitting** (`scripts/art/pixellab/rig.mjs`): the doll rig's body (paperdoll skeleton(),
1.76 m), posed per clip and weapon (`WEAPONS.spear` one hand + shield, `WEAPONS.pike` two hands), projected through
the battle camera and warped to the style-lock proportions (STATURE_PX, SHAPE_PX), so the fit is the same for every
class; only the shins' centre column is measured. `--grip x,y` (the fist `spear.mjs` prints) moves the weapon hand of
every frame by the rest frame's miss: PixelLab draws the fist higher than the camera would. A hand never leaves the
arm's reach (no stretched "noodle" arm). Print the payload with `kp.mjs`; check it first with `--sheet overlay.png
--ghost 1`.

**The thrust** (spear and shield): guard → a short draw-back along the shaft with the weight on the rear foot →
the lead (left) foot steps in, the hips and shoulders turn, the shield drives forward with the body → the arm
extends last, the hand moving along the spear's own line (same height and side; 1.1 m of travel, most of it from the
lunge) → a held follow-through with the rear heel up → back up to guard. In SE the first frame's spear must be drawn
flatter (`spear.mjs --vec 1,0.22`): from the camera-true angle PixelLab levels the spear during the clip (a pivot).

**SE guard** (I5a): move the grip back. The head should be at least ~50 px ahead of the fist and clearly visible beyond the shield rim (`spear.mjs --ahead 52 --behind 10`). With 38 / 20 the leaf hides behind the shield and the long butt behind the man reads as the point. This applies to every levelled SE clip (ready, charge, brace, block, stagger, thrust).

Order of work per class: base QC → SW test of every clip (cheapest; reject before rolling out) → the other three
facings, the back views (NE, NW) checked first → review → spec → `sheetbuild.mjs` → `qc.mjs` → preview.

## 7. QC checklist: clips and sheet

Per clip and facing, on `clipsheet.mjs` contact sheets (scale 2–4) and at 1x in the preview:

1. Spearhead leads the facing (levelled clips) or points up (upright clips) in every frame; the butt is plain and
   blunt; one spear only (no ghost or doubled shaft).
2. One shield in every frame; it never vanishes, pops in or doubles (back views!).
3. No invented items, effects or colours left after the cut (sparks, blood, glows).
4. The head never turns backwards; nothing cut off by the canvas.
5. Height and head size the same as the rotations; no style drift from H4 / E3.
6. The motion reads: weight, steps, the whole body in an attack.

Then `node scripts/art/pixellab/qc.mjs src/assets/sheets/<class>/manifest.json --spec <spec> --out <dir>`
(palette legal, groups exclusive and used, tier ramps sized, stature 58 ± 3 on the idle frames, feet on the anchor,
nothing clipped, the spear-end heuristic; it writes `<class>_contact.png` and `<class>_lineup.png` beside H4 and E3)
and `sheetgifs.mjs` for GIFs at real fps. Log every rejected frame with the reason.

## 8. Cost per class (measured on the hoplite)

| item | generations |
| --- | --- |
| base: pro 68 with H4 style (+ a second pro call when step B is needed), v3 import if normalised | 10–20 |
| 7 clips on the 68 canvas x 4 facings (pixminimax 1) | 28 |
| 7 clips on 128 canvases x 4 (pixminimax 2) | 56 |
| cheer on 96 x 112 x 4 (pixminimax 1) | 4 |
| thrust x 4 (skeleton-v3 3) | 12 |
| redos (about 1 clip-direction in 6) | ~20 |
| **total, quoted** | **~130–140** |

Billing ran about 12 % over the quotes: plan **~150 per foot class**, ~2,500 for the other 17. Tiers cost nothing
(runtime recolours). Riders and chariots need bigger canvases: expect pixminimax 2 for every clip and more redos.
