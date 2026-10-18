# Soldier sprite-sheet format (I2)

Pre-made sheets (PixelLab) replace the procedural soldier one class at a time. A
class without a sheet, or whose image has not loaded yet, is drawn by
`src/art/paperdoll.ts` exactly as before. Code: `src/art/sheetManifest.ts`
(format, rules), `src/art/sheetDoll.ts` (drawing), `src/art/sheetAnim.ts`
(battle picker), `src/art/sheetRegistry.ts` (where sheets come from).

## Files

```
src/assets/sheets/<class>/manifest.json
src/assets/sheets/<class>/<tier>.png      one per gear tier: basic, veteran, elite
```

Anything dropped there ships: manifests are bundled, images are asset URLs
fetched the first time a figure of that class and tier is drawn. Dev
placeholders live in `src/dev/sheets/` and load only on the dev server with
`?sheets=dev`. `?sheets=off` draws everything procedurally.

## Image layout

Rows are facings (named in `rows`, top to bottom), columns are animation
frames (`anims[*].col`, `frames`). Every frame is `frame.w` x `frame.h`. All
tier images of a class share the layout. PNG, RGBA, no colour profile (the
metal is matched by exact RGB).

## manifest.json

```json
{
  "version": 1,
  "class": "hoplite",
  "frame": { "w": 64, "h": 64 },
  "anchor": { "x": 32, "y": 58 },
  "scale": 0.5,
  "rows": ["south", "south-east", "east", "north-east", "north", "north-west", "west", "south-west"],
  "facings": ["south-east", "north-east", "south-west", "north-west"],
  "tiers": { "basic": "basic.png", "veteran": "veteran.png", "elite": "elite.png" },
  "anims": {
    "idle": { "col": 0, "frames": 4, "fps": 4 },
    "thrust": { "col": 4, "frames": 6, "fps": 14 },
    "shoot": { "col": 10, "frames": 6, "fps": 10, "strike": 4 }
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
| `frame` | frame size in art px |
| `anchor` | the art pixel the figure stands on (feet centre; riders and chariots: between hooves / wheels). It lands on the procedural feet line, so plates, rings and FX line up |
| `scale` | game px per art px on the battlefield (a figure at `BATTLE_SCALE`, res 1). The battle draws at res 2, so `0.5` (a ~48 px figure) and `1` (a ~32 px figure) map art px to whole rendered px. Other screens scale by their model scale / `BATTLE_SCALE` and snap to a whole factor (or 1/n) |
| `rows` | directions of the image rows (PixelLab's 8 names) |
| `facings` | the row for game facing 0..3 (field +x, -y, +y, -x). Default `south-east, north-east, south-west, north-west`. Never mirrored |
| `tiers` | image per tier; a missing tier shows the nearest one (lower first) |
| `anims` | per animation: first column, frame count (1..64), fps; `strike` = the release frame of a missile attack (default frames/2) |
| `metal` | exact metal colours, light to dark, per group; `kind` picks the rarity ramps (`bronzeOf` / `ironOf`); `slots` = whose rarity sets it (highest; default all four) |
| `portrait` | optional bust crop (art px square) of the front idle frame; default: 45% of the figure's height from its top |

Only `idle` is required. Checked on load (`parseManifest`): unknown names,
overlapping columns, bad colours and an image smaller than the layout are
rejected with every problem listed, and that class stays procedural.

## Animations and fallbacks

| animation | when (battle) | falls back to |
| --- | --- | --- |
| idle, walk, run, attack, block, hit, die, dieB, rout, win | as today | walk/run/rout -> idle chain, die -> hit -> idle |
| thrust / slash / throw / shoot / sling | attack by weapon class (spear+lance / blade+chop+two / javelins / bow / sling) | attack |
| brace | group in shield wall, standing or blocking | block |
| charge | moving under a charge order | run |
| ready | standing in contact (`u.engaged`) | idle |
| stagger | stunned (`u.stun > 0`) | hit |
| fallFwd / fallBack | death (the man's seeded side) | die / dieB |
| kneel | knocked out (`u.ko`), looped once down | (none: lies still) |
| look / adjust | idle, seeded per man: one window in two of 7-11 s | (not played) |
| cheer | victory | win |

Procedural callers that pass the old column ids (UI sheets, the camp) get
the matching frame of the state on the sheet. Missile draws are spread over
the aim window before the shot (`strike` frames), the release plays from the
strike frame after it.

## Gear tier

`TIER_RULE`: the mean item tier (`ItemDef.tier`, 1..3) of the worn weapon,
shield, helmet and armour (empty slots left out): < 1.75 basic, < 2.5 veteran,
else elite. Rarity never moves the tier.

## Rarity

Each metal group's colours are spread by position over its rank's 5-colour
ramp (`bronzeOf` / `ironOf`, rank 0 tarnished .. 4 orichalcum / starmetal;
army-skin polish lifts bronze to 2). Metal of rank 2+ is the glint mask; the
epic outline ring is the silhouette; `dollFx` animates both as before.

## Not on sheets (yet)

Shield paint, cloak and crest cosmetics, the `Look` body variation and the
victory-pose cosmetic are not drawn on sheet figures.
