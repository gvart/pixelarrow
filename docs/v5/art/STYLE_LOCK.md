# Unit style lock

One recipe for every soldier sheet, so all 18 classes read as one set with the
hoplite H4 (dark-epic look at realistic adult proportions). Follow it exactly;
log any class deviation and its reason in `docs/playbook/PROMPTS_ART.md`.

Scripts: `scripts/art/pixellab/`. Raws go under `docs/v5/pixellab/<round>/raw/`
(gitignored). Only `sheetbuild.mjs` writes `src/assets/sheets/<class>/`.

## 1. Style anchors

| anchor | PixelLab character id | what it is |
| --- | --- | --- |
| **H4** (primary) | `b7624d6d-132a-458c-8e3d-d6960d175988` | the hoplite: realistic proportions, 68 x 68, high top-down, 8 directions |
| E3 (reference only) | `62d4f135-e00e-45d6-9daa-f2c1d1d6734f` | the dark-epic look (big helmet, short legs: proportions **not** to copy) |

New classes use **H4** as `style_character_id`.

## 2. Base character: fixed parameters

Expect about 1.5 tries per class.

**Step A — first draft** (`create_character`):

| param | value |
| --- | --- |
| `mode` | `pro` (10 generations at size 68) |
| `style_character_id` | H4 |
| `size` | `68` |
| `view` | `high top-down` |
| `n_directions` | 8 |
| outline / shading / detail / proportions | ignored by pro (from the style character) |
| `description` | the style block below with the slots filled |

**Step B — re-proportion and redraw** (only when A returns a big helmet or short legs):

1. Measure the south view (`node scripts/art/pixellab/ascii.mjs <south.png>`): rows of crest, helmet, torso, legs.
2. `node scripts/art/pixellab/proportion.mjs <draft south.png> <concept.png> --bands <crest>,<helmet>,<torso>,<legs> --feet 65` so that helmet top to feet = 58 px: helmet (with face) ≈9–10, chin to crotch ≈20, legs ≈26 (47 %). Hoplite bands: `3:10:0.6:0.75:7:33,11:24:0.68:0.78:8:33,25:48:0.86,49:65:1.55` (y0:y1:scaleY:scaleX:radius:centreX; a held weapon outside the radius stays put).
3. Upscale the concept 4x (nearest), upload it (`get_upload_url` + curl).
4. `create_character` with step A's params plus `concept_image_url: upload:<id>`, description opening "… with the realistic adult proportions of the concept: seven heads tall, a small head in a snug helmet, long legs, natural arms …".

**Normalisation (every class):** feet on row 65–66 of the 68 canvas and **58 ± 2 px from skull top to feet** (`rig.mjs STATURE_PX`), measured at the skull, not a crest, plume, pilos point or Phrygian crown; chin 45 px and pelvis 26 px above the feet (`rig.mjs SHAPE_PX`, the skeleton keypoints' warp). Never rescale. A figure too tall (bare heads: pro fits the top to rows 3–5 and refuses sizes under 66 with H4) is normalised without resampling: whole rows (and a few columns) repeating their neighbour are dropped below the chin, the same count in all 8 views, re-aligned on the feet row, and imported back as a v3 character (0.25 generations) (`scripts/art/pixellab/rollout/normalise.mjs --rows k --cols c`; per-class numbers in `docs/v5/pixellab/bases.json`). Never change the pose to fix framing.

| category | canvas | feet row | skull top → feet | chin | pelvis |
| --- | --- | --- | --- | --- | --- |
| foot soldier | 68 x 68 | 65–66 | 58 ± 2 | 45 | 26 |

## 3. The prompt style block (verbatim) and the class slot

```
<CLASS SLOT: who he is, e.g. "tall grim Spartan hoplite"> with the realistic adult proportions of the concept: seven heads tall, a small head in a snug helmet, long legs, natural arms, broad shoulders, lean muscular build; <GEAR SLOT: helmet, crest, cloak, armour, legs, shield, in that order, each with its dark colour>; <WEAPON SLOT: one ... held ... in his right hand ..., clearly visible in every direction, ...>; heavy shadows, desaturated dark warm colours like the style reference
```

- Colours only from the dark-epic families: dark weathered bronze, dark crimson, oxblood-brown, umber leather, dark iron; **no white cloth**, nothing bright.
- Name every held item once with "one", with size and place ("one very large round bronze aspis on his left arm, chin to knee").
- Spear or long weapon: "held vertically in his right hand out at his right side, away from his body and clearly visible in every direction, much taller than the man, single leaf-shaped spearhead at the top, plain blunt wooden butt end, no butt spike". Without "out at his right side … in every direction" the weapon hides in NW or crosses the face in SE.

The hoplite H4 description, word for word:

```
tall grim Spartan hoplite with the realistic adult proportions of the concept: seven heads tall, a small head in a snug helmet, long legs, natural arms, broad shoulders, lean muscular build; dark weathered bronze Corinthian helmet covering the face with a deep dark crimson horsehair crest; deep dark crimson cloak hanging behind him; dark bronze muscle cuirass over a dark oxblood-brown tunic, worn dark leather straps, no white cloth; dark bronze greaves; one very large round bronze aspis on his left arm, chin to knee, dark bronze rim and a muted dark-red lambda; one very long wooden spear held vertically in his right hand out at his right side, away from his body and clearly visible in every direction, much taller than the man, single leaf-shaped spearhead at the top, plain blunt wooden butt end, no butt spike; heavy shadows, desaturated dark warm colours like the style reference
```

## 4. QC checklist: rotations (before any animation is paid for)

Contact sheet: `node scripts/art/pixellab/sheet.mjs out.png --scale 6 --rot <name> <rotations dir>` plus the four game facings at scale 8 beside H4's. Per game facing (SE, NE, SW, NW):

1. Every prompt item exactly once (one weapon, one shield); nothing invented.
2. Weapon visible in all four facings, head at the top, butt plain and blunt.
3. Head faces the facing; nothing cut off by the canvas.
4. Skull top to feet 58 ± 2 px, feet on row 65–66, helmet ≈1/7 of the height, legs ≈1/2.
5. Dark-epic colours only; beside H4 at zoom 1–3 it reads as the same set (outline weight, shading steps, pixel density, bronze and crimson ramps).
6. Log the attempt (prompt verbatim, id, outcome, why) in `docs/playbook/PROMPTS_ART.md` before the next call.

## 5. Colour pipeline

Unit sheets are not hard-snapped. Every frame goes through `scripts/art/pixellab/groups.mjs` (called by `sheetbuild.mjs`):

1. **Invented colours are cut, not remapped**: OKLab chroma over 0.14 (sparks, glows, PixelLab's bright blood), lightness over 0.86 (flashes) or a light neutral grey (ghost trails) become transparent; then detached specks under 5 px and loose crimson splats under 60 px. Blood touching the body: a `clear` fix with `red: true` in the spec.
2. **Ramp-aware remap** onto PA-WORLD-DARK (`docs/v5/pixellab/palette-dark.json`) limited to the class's ramps (spec `ramps`; hoplite: outline, crimson, umber, darkBronze, skin): ramp by hue and chroma, step by lightness. Add a ramp to the palette file when a class needs a missing hue (e.g. purpleBlack, plaidGreen).
3. **Parts**, each with an exclusive hex set (a shared step is nudged by 1 in one channel): `cloak` (crimson), `crest` (crimson blobs at the top, carried frame to frame), `emblem` (crimson on the shield, bordered by bronze, never by outline or background), `trim` (lightest bronze step: what the elite gilds), `metal` (other bronze steps: rarity of shield, helmet, armour), `weaponMetal` (spearhead, when the head end is found: weapon rarity), `wood` (thin pixels on the spear line, the butt), `skin`, `shadow` (darkest bronze step, not recoloured), `outline`. Any other ramp falls to `shadow`.
   - Spec `parts`: `{ "<ramp>": "<part>" }`, per-step `"<ramp>:<step>"` or `"<ramp>:<from>-<to>"` (step beats range beats ramp beats default). Royal guard `{ "purpleBlack": "cloak", "linen": "crest", "metal": "metal" }`; sacred band `{ "purpleBlack": "cloak", "metal": "cloak" }`; falx `{ "skin:0": "shadow" }`. Only crimson cloak is split into crest and emblem or dropped as a splat; the spear line also takes the `metal` ramp (iron heads).
   - `"crest": false` / `"emblem": false`: no crest or emblem, that crimson stays `cloak`.
   - `stature` (for `qc.mjs --spec`; default measured from the first metal / trim pixel): `{ "skipTop": <rows> }` drops headgear rows (Phrygian crown: bases.json `headgear_top` to `crown`); `{ "from": "any" }` measures from the first opaque non-weapon pixel (bare heads; spear line, wood and weapon metal not counted); `"px"` / `"tol"` replace the 58 ± 3 target (riders ≈84-92 px helmet top to hooves, chariot driver ≈100). All combine. `qc.mjs --stature N[:tol]` wins over the spec.
   - `"greyCut"`: OKLab lightness above which a neutral grey is cut (default 0.55; iron-clad classes 0.8, so lit blades survive).
   - `"alignMax": [dx, dy]` (default `[6, 8]`): largest frame-0 drift sheetbuild re-anchors on the feet; clips from a model-drawn stance drift 7-16 px and set e.g. `[18, 8]`.
4. **Manifest**: `colorGroups` (cloak, crest, trim, skin, emblem, wood; dark to light), `metal` (light to dark), `tiers.veteran` / `tiers.elite` (spec anchor colours interpolated to each group's length). Hoplite: veteran = wine cloak, scarlet crest, polished trim; elite = black cloak and crest, gold trim.
   - `"metalKind": { "metal": "iron", "weaponMetal": "iron" }`: per-group manifest `kind` (default `bronze`); iron follows `ironOf`, and at rank 0 an iron group keeps the sheet's colours.
   - `"metalSlots": { "metal": ["helmet", "armor"] }`: narrows the gear a metal group follows (default shield, helmet, armour for `metal`; weapon for `weaponMetal`).
   - `"spear": false`: no spear-line detection (swords, axes, bows), so cloak, leather and skin are not tagged `wood` / `weaponMetal` (default on).

## 6. Animation recipe

Clips start from the class's own frames: the 68 rotation (`rot`), the rotation with the weapon redrawn levelled (`guard`, `spear.mjs`, 128 x 112), a tall canvas (`tall`, 96 x 112, weapon overhead) or a big centred canvas (`die`, 128 x 128). Offsets: `docs/v5/pixellab/I3/hoplite.sheet.json` › canvases. Cost: pixminimax 1 generation (68) or 2 (128); skeleton-v3 3 (12–15 frames).

| clip | mode | frames, fps | first frame | notes |
| --- | --- | --- | --- | --- |
| idle | pixminimax | 12 @ 8 | rot | "slow calm breathing … feet stay planted" |
| look | pixminimax | 16 @ 8 | rot | "only the head and shoulders turn, never further than over his shoulder" |
| adjust | pixminimax | 12 @ 10 | rot | shield hitched and resettled |
| walk | pixminimax | 16 @ 16 | rot | "marching walk in place towards …" |
| run | pixminimax | 12 @ 16 | rot | back views: "the shield stays clearly visible on the left arm" |
| rout | pixminimax | 12 @ 16 | rot | hunched, head low; weapon still head-up |
| kneel | pixminimax | 12 @ 8, hold 4 | rot | sinks to the right knee, leans on the shield |
| ready | pixminimax | 12 @ 8 | guard | weapon level, pointing forward every frame |
| charge | pixminimax | 12 @ 16 | guard | heavy run, weapon levelled |
| brace | pixminimax | 12 @ 10, hold 5 | guard | crouch behind the shield, then hold |
| block | pixminimax | 12 @ 14 | guard | sparks get cut |
| stagger | pixminimax (SW: skeleton) | 12 @ 12 | guard | reels back and steps back up (sprite keeps its anchor) |
| fallBack / fallFwd | pixminimax | 12 @ 12 | die | blood: cut, or a `red` clear fix |
| cheer | pixminimax | 12 @ 10, hold 3 | tall | 68 has no room for a spear overhead |
| thrust | **skeleton-v3** | 14 @ 14, strike 6 | guard | `rig.mjs thrust <dir> guard.png --grip x,y` |

**Skeletons without hand-fitting** (`rig.mjs`): the doll rig's body (paperdoll skeleton(), 1.76 m), posed per clip and weapon (`WEAPONS.spear` one hand + shield, `WEAPONS.pike` two hands), projected through the battle camera and warped to STATURE_PX / SHAPE_PX; only the shins' centre column is measured. `--grip x,y` (the fist `spear.mjs` prints) moves every frame's weapon hand by the rest frame's miss. A hand never leaves arm's reach. Print the payload with `kp.mjs`; check with `--sheet overlay.png --ghost 1`.

**The thrust** (spear and shield): guard → short draw-back along the shaft, weight on the rear foot → lead (left) foot steps in, hips and shoulders turn, shield drives forward → arm extends last along the spear's own line (1.1 m of travel, mostly lunge) → held follow-through, rear heel up → back to guard. In SE draw the first frame's spear flatter (`spear.mjs --vec 1,0.22`), or PixelLab pivots it.

**SE guard**: spearhead at least ~50 px ahead of the fist and clear of the shield rim (`spear.mjs --ahead 52 --behind 10`) for every levelled SE clip (ready, charge, brace, block, stagger, thrust).

Order per class: base QC → SW test of every clip → other facings (back views NE, NW first) → review → spec → `sheetbuild.mjs` → `qc.mjs` → preview.

## 7. QC checklist: clips and sheet

Per clip and facing, on `clipsheet.mjs` contact sheets (scale 2–4) and at 1x in the preview:

1. Spearhead leads the facing (levelled) or points up (upright) every frame; butt plain and blunt; one spear only.
2. One shield every frame; never vanishes, pops in or doubles (back views!).
3. No invented items, effects or colours after the cut.
4. Head never turns backwards; nothing cut off.
5. Height and head size as the rotations; no style drift from H4.
6. The motion reads: weight, steps, whole body in an attack.

Then `node scripts/art/pixellab/qc.mjs src/assets/sheets/<class>/manifest.json --spec <spec> --out <dir>` (palette legal, groups exclusive and used, tier ramps sized, stature 58 ± 3 on idle frames, feet on the anchor, nothing clipped, spear-end heuristic; writes `<class>_contact.png` and `<class>_lineup.png` beside H4 and E3) and `sheetgifs.mjs` for GIFs at real fps. Log every rejected frame with the reason.

## 8. Cost per class

| item | generations |
| --- | --- |
| base: pro 68 with H4 (+ step B call), v3 import if normalised | 10–20 |
| 7 clips on 68 x 4 facings (pixminimax 1) | 28 |
| 7 clips on 128 x 4 (pixminimax 2) | 56 |
| cheer on 96 x 112 x 4 | 4 |
| thrust x 4 (skeleton-v3 3) | 12 |
| redos (≈1 clip-direction in 6) | ~20 |

Plan **~150 per foot class** (billing runs ≈12 % over quotes). Tiers are free (runtime recolours). Riders and chariots: pixminimax 2 for every clip and more redos.
