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

**Step B — re-proportion and redraw** (only when step A comes back with a big helmet or short legs, which it
does for most prompts; the hoplite needed it):

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
68 canvas and **58 px from the helmet top (crest not counted) to the feet** (`rig.mjs STATURE_PX`); the chin at
45 px and the pelvis at 26 px above the feet (`rig.mjs SHAPE_PX`). A class that comes back taller or shorter by
more than 2 px is rejected (or re-proportioned in step B), never rescaled: rescaling breaks the pixel clusters.
Riders, chariots and beasts get their own row in this table when they are made.

| category | canvas | feet row | helmet top → feet | chin | pelvis |
| --- | --- | --- | --- | --- | --- |
| foot soldier | 68 x 68 | 65–66 | 58 | 45 | 26 |

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

Later sections (the colour pipeline, animations per type, the sheet QC) follow when the hoplite sheet ships.
