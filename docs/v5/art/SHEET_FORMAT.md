# Soldier sprite-sheet format (v2, I3b)

Pre-made sheets (PixelLab) replace the procedural soldier one class at a time. A
class without a sheet, or whose image has not loaded yet, is drawn by
`src/art/paperdoll.ts` exactly as before. Code: `src/art/sheetManifest.ts`
(format, rules), `src/art/sheetDoll.ts` (drawing), `src/art/sheetAnim.ts`
(battle picker), `src/art/sheetRegistry.ts` (where sheets come from).

A class ships **one** fully animated body in its basic-tier colours. Veteran and
elite are runtime recolours of named colour groups (V5-092). Rarity is the metal
swap on top (V5-088).

## Files

```
src/assets/sheets/<class>/manifest.json
src/assets/sheets/<class>/<image>.png      the one image the manifest names
```

Anything placed there ships. Manifests are bundled; the image is an asset URL,
fetched the first time a figure of that class is drawn. Dev placeholders live
in `src/dev/sheets/` (V5-091) and load only on the dev server with
`?sheets=dev`. `?sheets=off` draws everything procedurally.

## Image layout

Rows are facings (named in `rows`, top to bottom). Columns are animation frames
(`anims[*].col`, `frames`). Every frame is `frame.w` x `frame.h`.

A wide sheet may wrap: with `wrap: N`, column `c` sits at x `(c % N) * frame.w`
in band `floor(c / N)`. Each band holds every row, so a frame's y is
`(band * rows.length + row) * frame.h`. Keep the PNG at most 4096 px wide.

PNG, RGBA, no colour profile: colour groups and metal are matched by exact RGB.
The decoded image stays in memory while the class is in use, at w x h x 4 bytes,
so crop frames tight.

## manifest.json

```json
{
  "version": 2,
  "class": "hoplite",
  "image": "hoplite.png",
  "frame": { "w": 96, "h": 80 },
  "wrap": 42,
  "anchor": { "x": 48, "y": 74 },
  "anchors": { "south-east": { "x": 30, "y": 74 }, "north-east": { "x": 30, "y": 74 }, "south-west": { "x": 66, "y": 74 }, "north-west": { "x": 66, "y": 74 } },
  "scale": 0.5,
  "rows": ["south-east", "north-east", "south-west", "north-west"],
  "colorGroups": {
    "cloak": ["#3a2220", "#512d28", "#6c3c32", "#874c3e", "#a05c49"],
    "crest": ["#4b1a17", "#8f2b20", "#cf452f"],
    "trim":  ["#362921", "#634a34", "#94704c"],
    "skin":  ["#64402e", "#8e5c48", "#b47e64", "#d6a282", "#f0c8a6"]
  },
  "tiers": {
    "basic": {},
    "veteran": { "cloak": ["#4b1b18", "#6a231c", "#8f2d21", "#b03a2a", "#cf4832"] },
    "elite": {
      "cloak": ["#1a1616", "#242020", "#302a2a", "#3e3636", "#4c4444"],
      "crest": ["#5a3a1a", "#c8963a", "#fff2b0"]
    }
  },
  "anims": {
    "idle":   { "col": 0,  "frames": 12, "fps": 8 },
    "thrust": { "col": 12, "frames": 14, "fps": 16, "strike": 7 },
    "brace":  { "col": 26, "frames": 12, "fps": 10, "hold": 5 }
  },
  "metal": [
    { "kind": "bronze", "colors": ["#fbe6a6", "#dcb060", "#ae7c3a", "#7a5228", "#4a321c"], "slots": ["shield", "helmet", "armor"] },
    { "kind": "iron", "colors": ["#f0f2ec", "#b4bcc0", "#7e8890"], "slots": ["weapon"] }
  ],
  "portrait": { "x": 24, "y": 4, "size": 16 }
}
```

| field | meaning |
| --- | --- |
| `version` | `2`. v1 (one image per tier) is rejected |
| `image` | the one image, relative to the manifest |
| `frame` | frame size in art px |
| `wrap` | optional: columns per band of a wide sheet (see Image layout) |
| `anchor` | the art pixel the figure stands on (feet centre; riders and chariots: between hooves or wheels). It lands on the procedural feet line, so plates, rings and FX line up |
| `anchors` | optional per image row (by row name): that row's own anchor, e.g. feet left of centre on the rows facing right, so a spear reaching ahead fits a narrower frame. Default `anchor`. A sheet figure's box is the procedural box widened about the feet to hold the whole frame of every row, so nothing is clipped |
| `scale` | game px per art px relative to the battle scale (V5-089): a figure at `BATTLE_SCALE`, res 1. The battle draws at res 2, so `0.5` and `1` map art px to whole rendered px. Other screens scale by their model scale / `BATTLE_SCALE`, snapped to a whole factor (or 1/n) |
| `rows` | directions of the image rows (PixelLab's 8 names) |
| `facings` | the row for game facing 0..3 (field +x, -y, +y, -x). Default `south-east, north-east, south-west, north-west`. Never mirrored |
| `colorGroups` | recolourable groups: the exact colours of each group in the image, **dark to light**. Any lowercase name is allowed. `skin`, `cloak` and `crest` also take the per-man variation. A colour may belong to one group only, and never to a metal group |
| `tiers` | per tier, the groups it recolours: a ramp of the same length, dark to light, replacing the group's colours by position. A group a tier leaves out keeps its colours; `basic` is usually `{}` |
| `anims` | per animation: first column, frame count (1..64), fps. `strike` is the attack's impact or release frame (default frames/2). `hold` is the first frame of the looping part of a clip with an entry (default 0: the whole clip loops) |
| `metal` | exact metal colours, **light to dark**, per group. `kind` picks the rarity ramps (`bronzeOf` / `ironOf`); `slots` says whose rarity sets it (the highest; default all four) |
| `portrait` | optional bust crop (an art-px square) of the front idle frame. Default: 40% of the figure's height from just above its head |

Only `idle` is required. `parseManifest` checks the manifest on load. It
rejects unknown names, overlapping columns, bad or shared colours, tier ramps
of the wrong length and an image smaller than the layout, listing every
problem; that class then stays procedural.

## Tiers and per-man variation

The colour map of a figure is built once per key and cached:

1. **Tier** (V5-088): `TIER_RULE` takes the mean item tier (`ItemDef.tier`,
   1..3) of the worn weapon, shield, helmet and armour, leaving empty slots out.
   Below 1.75 is basic, below 2.5 veteran, otherwise elite. Each group then
   takes its tier ramp, or keeps its own colours.
2. **Skin** (V5-095): the man's `Look.skin` (0..3, already seeded at
   recruitment) picks one of `SKIN_TONES`. The sheet's skin ramp is drawn as
   tone 1 (olive); 0 is paler, 2 browner, 3 deep brown.
3. **Shade** (V5-095): the man's seed picks one of `SHADE_STEPS` (x0.9, x1,
   x1.1), applied to `cloak` and `crest` after the tier.
4. **Rarity**: each metal group is spread over its rank's 5-colour ramp. Metal
   of rank 2 and up is the glint mask, and the epic outline ring is the
   silhouette; `dollFx` animates both as before.

The key is `sheet_<class>.<tier>.<skin><shade>_<metal ranks>...`. That gives at
most 3 tiers x 4 skins x 3 shades = 36 looks per rarity mix per class. Atlases
hold only frames that are on screen (6 s TTL), so the cost scales with the
variants actually in a battle.

## Animations and fallbacks

Timing uses the battle clock (sim time, which runs on real frame time) and each
clip's own `fps`. Loops wrap cleanly, and a man's loop has a phase of its own.

| animation | when (battle) | falls back to |
| --- | --- | --- |
| idle | standing | (required) |
| look / adjust | idle, seeded per man: one window in two of 7-11 s plays one | idle (not played) |
| walk / run | moving, run above 1.3x marching speed; strides on a stride clock at his pace | run <-> walk, then idle |
| charge | moving under a charge order | run |
| ready | standing in contact (`u.engaged`) | idle |
| brace | group in shield wall, standing; a blow taken in the wall keeps the stance | block |
| block | a blocked blow (0.22 s) | brace, idle |
| thrust / slash / throw / shoot / sling | attack by weapon class (spear+lance / blade+chop+two / javelins / bow / sling) | attack |
| attack | any other attack | thrust, slash, idle |
| stagger | stunned (`u.stun > 0`) | hit |
| hit | hit (0.24 s) | stagger, idle |
| rout | routing | run |
| fallFwd / fallBack | death (the man's seeded side) | die / dieB |
| die / dieB | (generic deaths) | fallFwd, fallBack, hit / fallBack, die |
| kneel | knocked out (`u.ko`), once down (V5-090) | (none: lies still) |
| cheer / win | victory | each other, then idle |

Fallbacks are tried depth first, never visiting an animation twice, and end at
`idle`. A sheet that has only the new names (stagger, brace, fallFwd, cheer...)
therefore serves the old states too.

**Strike timing.** An attack's `strike` frame is on screen at the sim's attack.
The frames before it are the windup, played over the last `strike / fps`
seconds of the cooldown while the man is in contact. The frames after it are
the follow-through. Missiles use the same rule: the draw is spread over the aim
window before the shot (a sling whirls), and the release plays from the strike
frame.

**Held loops.** A clip with `hold` plays frames `0..hold-1` once on entering the
state, then loops `hold..frames-1`. Coming back to the same state within 0.5 s
(after a block, a flinch) resumes the loop without the entry.

Procedural callers that pass old column ids (UI sheets, the camp) get the
matching frame of the state on the sheet.

## Not on sheets (yet)

Shield paint, cloak and crest cosmetics, hair and beard, the `Look` body
variation (beyond skin) and the victory-pose cosmetic are not drawn on sheet
figures.
