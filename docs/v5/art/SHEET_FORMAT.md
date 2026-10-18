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
`?sheets=dev`; `?sheets=dev:companion,thessalian` loads only those (the other
classes keep their shipped art). `?sheets=off` draws everything procedurally.

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
| `portrait` | optional bust crop (an art-px square) of the front idle frame. Default: 40% of the figure's height from just above its head (riders and chariots: the crew's, see Riders and chariots) |
| `variation` | optional `{ "skin": false, "shade": false }`, each default `true`. `skin: false` keeps the `skin` group as drawn (no per-man tone); `shade: false` keeps `cloak` and `crest` as drawn (no shade step). Every man of the sheet is then the same variant for that part |
| `rarity` | optional `{ "metal": false }`, default `true`. `false` keeps the metal colours as drawn (no rarity ramp swap). Metal of rank 2 and up still glints, and the epic outline still glows |

Only `idle` is required. `parseManifest` checks the manifest on load. It
rejects unknown names, overlapping columns, bad or shared colours, tier ramps
of the wrong length and an image smaller than the layout, listing every
problem; that class then stays procedural.

## Riders and chariots

A mounted class (`companion`, `thessalian`, `horse_archer`, `chariot`) ships the
same manifest. Its frame is as big as the art needs: about 96 x 112 for a rider,
128 x 112 for the chariot. `anchor` / `anchors` sit between the hooves or the
wheels, per row.

The figure's box starts from the procedural rider's (96 x 84, hooves at 74) or
chariot's (128 x 96, wheels at 84) and is widened about that point to hold
every row's frame. Plates, selection rings, flags and rarity overlays stay on the
same ground point.

`scale` works as for men: the same art px per metre as the foot sheets means the
same `scale`.

A PixelLab horse often shares hex colours with the rider's skin or bronze. The
per-man skin tone and the rarity swap would then recolour the horse too. To
prevent that, set `"variation": { "skin": false }` and/or
`"rarity": { "metal": false }`, or give the rider colours the coat does not use.
There is no per-pixel group mask.

| state (battle) | rider | chariot |
| --- | --- | --- |
| standing | idle | idle |
| moving | walk; gallop above 1.3x its walking speed | drive |
| charge order | charge | charge |
| attack | thrust (lance, spear), throw (javelins), shoot (bow), slash (blade) | its weapon's clip; none: it drives on |
| hit / stunned | hit / stagger | hit |
| routing | rout | rout |
| death | fallFwd / fallBack (never kneels) | wreck |
| victory | cheer / win | cheer / win |

Portraits: without `portrait`, a mounted bust is centred on the highest solid
6 x 6 px block of the front idle frame (the head; a lance or bow is too thin)
and spans 30% of the height from it to the anchor.

A sheet with no attack clip at all (no thrust, slash, attack...) skips the
attack states. The figure keeps doing what it is otherwise doing, e.g. a
chariot drives on.

## Tiers and per-man variation

The colour map of a figure is built once per key and cached:

1. **Tier** (V5-088, revised): the gear score is the summed item tier
   (`ItemDef.tier`, 1..3) of the worn weapon, shield, helmet and armour,
   divided by the number of those slots the class may fill (`CLASS_GEAR`), an
   empty slot counting 0. Each class has its own band (`TIER_BANDS`, worked
   out once at load from its kit in `src/data/classes.ts`): the score range
   of its three kit tiers, split in thirds, so basic is the bottom third,
   veteran the middle, elite the top. A class whose kit never varies (the
   royal guard) splits the range of everything it may equip instead. A fixed
   1.75 / 2.5 cut left most classes' own kits unable to reach elite (the
   thessalian's best kit averages 2.0, the rhomphaia's 2.33), and leaving
   empty slots out made a bow-only levy archer outrank a fully kitted one.
   Rarity still never moves the tier. Each group then takes its tier ramp,
   or keeps its own colours. A `DollSpec.sheetTier` forces the tier (the sheet
   preview uses it to show all three).
2. **Skin** (V5-095): the man's `Look.skin` (0..3, already seeded at
   recruitment) picks one of `SKIN_TONES`. The sheet's skin ramp is drawn as
   tone 1 (olive); 0 is paler, 2 browner, 3 deep brown. Off with
   `variation.skin: false`.
3. **Shade** (V5-095): the man's seed picks one of `SHADE_STEPS` (x0.9, x1,
   x1.1), applied to `cloak` and `crest` after the tier. Off with
   `variation.shade: false`.
4. **Rarity**: each metal group is spread over its rank's 5-colour ramp (off
   with `rarity.metal: false`). Metal of rank 2 and up is the glint mask, and
   the epic outline ring is the silhouette; `dollFx` animates both as before,
   with or without the swap.

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
| gallop | riders: moving above 1.3x walking speed | run |
| drive | chariots: moving | gallop, run |
| charge | moving under a charge order | gallop, run |
| ready | standing in contact (`u.engaged`) | idle |
| brace | group in shield wall, standing; a blow taken in the wall keeps the stance | block |
| block | a blocked blow (0.22 s) | brace, idle |
| thrust | attack: spear, lance | attack |
| slash | attack: blade, chop, two-handed (a one-hand or two-hand cut) | thrust, attack |
| throw | shot: javelins | shoot, attack |
| shoot | shot: bow | attack |
| sling | shot: sling | throw (then shoot, attack) |
| stab | a missile man's blow at close quarters (bow, sling, javelins; not a shot) | thrust (then attack) |
| attack | any other attack (no weapon class) | thrust, slash, idle |
| stagger | stunned (`u.stun > 0`) | hit |
| hit | hit (0.24 s) | stagger, idle |
| rout | routing | gallop, run |
| fallFwd / fallBack | death (the man's seeded side) | die / dieB |
| die / dieB | (generic deaths) | fallFwd, fallBack, hit / fallBack, die |
| wreck | chariots: death | die |
| kneel | knocked out (`u.ko`), once down (V5-090) | (none: lies still) |
| cheer / win | victory | each other, then idle |

Fallbacks are tried depth first, never visiting an animation twice, and end at
`idle`. A sheet that has only the new names (stagger, brace, fallFwd, cheer...)
therefore serves the old states too.

The attack clip follows the sim's weapon class: `weaponClass` of the weapon's art,
the same class that times the procedural attack in `ATTACK_TIMES`. A blow
(`lastAttackTick`) and a shot (`lastShotTick`) are told apart as the sim does.
`isRangedClass` weapons (bow, sling, javelins) shoot, and their blows at close
quarters are the `stab`.

**Strike timing.** An attack's `strike` frame is on screen at the sim's attack.
The frames before it are the windup, played over the last `strike / fps`
seconds of the cooldown while the man is in contact. The frames after it are
the follow-through. Missiles use the same rule: the draw is spread over the aim
window before the shot (a sling whirls), and the release plays from the strike
frame. The battle spawns the projectile on the shot's tick, so `strike` should be
the frame where the missile leaves the hand or the string.

**Held loops.** A clip with `hold` plays frames `0..hold-1` once on entering the
state, then loops `hold..frames-1`. Coming back to the same state within 0.5 s
(after a block, a flinch) resumes the loop without the entry.

Procedural callers that pass old column ids (UI sheets, the camp) get the
matching frame of the state on the sheet.

## Not on sheets (yet)

Shield paint, cloak and crest cosmetics, hair and beard, the `Look` body
variation (beyond skin) and the victory-pose cosmetic are not drawn on sheet
figures.

## Packed sheets (v3, I3c)

The art is authored and committed as v2 (above). The build never ships the v2
image: `scripts/art/pack/` packs each `src/assets/sheets/<class>/` into
`src/generated/sheets/<class>/` (git-ignored), and the registry reads only
that. The vite build and dev server run the packer first (`sheetPackPlugin` in
`vite.config.ts`); `npm run sheets:pack` runs it by hand (with the dev
placeholders). A class repacks only when its manifest, its image or the packer
changed.

What the packer does, losslessly:

1. Trims every frame (column x row) to its opaque box and keeps the box's
   offset in the frame, so `anchor`, `anchors` and `portrait` (frame
   coordinates) stay exact.
2. Stores identical trimmed frames once (held poses, clips that reuse frames).
3. Shelf-packs them into pages of at most 2048 x 2048 per clip group: `core`
   (everything a battle shows) and `extra` (`look`, `adjust`, `cheer`, `win`:
   ambient idles and victory). A frame both groups use is on a core page.
4. Writes each page as the smallest PNG it finds: indexed (with tRNS) at 256
   colours or fewer, else RGBA; no colour chunks. Fully transparent pixels are
   written as 0,0,0,0; every other pixel, and so every colour group and metal
   colour, is exact. Each frame is checked against the source after the PNGs
   are decoded again, and a mismatch fails the build.

The packed manifest is the v2 manifest with `version: 3`, no `image` or `wrap`,
and a `packed` block:

```json
"packed": {
  "pages": [{ "file": "hoplite.0.png", "w": 611, "h": 273, "group": "core" },
            { "file": "hoplite.1.png", "w": 147, "h": 100, "group": "extra" }],
  "rects": [0, 0, 0, 30, 49, ...],
  "cells": [0, 6, 2, ...],
  "source": { "image": "hoplite.png", "w": 2982, "h": 216, "sha1": "..." }
}
```

| field | meaning |
| --- | --- |
| `pages` | the page images, relative to the manifest, with their size and group |
| `rects` | stored frames, 5 numbers each: page, x, y, w, h |
| `cells` | 3 numbers per frame, index `col * rows.length + row`: the stored frame (`-1`: empty) and its offset `dx, dy` in the frame |
| `source` | what it was packed from (`sha1` covers the manifest, the image and the packer) |

`idle` must be on core pages. At runtime (`src/art/sheetDoll.ts`) a class is
drawn from its sheet once its core pages are loaded. A frame is read and
recoloured from its rect only. An extra page loads the first time one of its
clips is asked for. Until it arrives, the clip shows its fallback (the table
above, so `cheer` shows `win`, then `idle`), and the clip itself is drawn once
the page is in. v2 manifests still load unchanged: `?sheets=dev` loads the
packed dev placeholders and `?sheets=dev-raw` the unpacked ones.

**Memory.** A decoded page takes w x h x 4 bytes. The battle atlas sweep
(`src/ui/sprites.ts`, once a second) also bounds the sheet caches:

- An extra page nobody read for 6 s (`PAGE_TTL_MS`, the atlas frame TTL) is
  dropped and reloads, from the browser cache, on next use.
- While the core pages of all classes exceed 48 MB (`CORE_BUDGET`), the
  classes unused for 60 s (`CLASS_IDLE_MS`, no live battle rows) lose theirs,
  oldest first. Such a class is procedural again until a figure asks for it.
- The colour maps (tier x variant x rarity mix) are an LRU of 256
  (`PALETTE_CAP`, about 1 KB each).
- Battle atlases hold only frames on screen, so the number of looks does not
  grow GPU memory.

`sheetMemoryStats()` reports the decoded bytes (`window.__sheetMem()` in dev
builds).

| sheet | decoded before → after | download before → after |
| --- | --- | --- |
| placeholder hoplite (71 cols x 4 rows, 42 x 54) | 2.46 → 0.69 MB (core 0.64) | 63.9 → 40.0 KB |
| synthetic 16 clips x 14 frames x 4 rows, 84 x 108 (res-2 procedural) | 33.2 → 14.3 MB (core 11.6) | 831 → 617 KB |

Trimming does most of the work: packing fills 94-96% of each page, and
procedural frames have few duplicates to remove. PixelLab art with more
colours per page may go over 256 colours, and then packs as RGBA (larger
downloads, the same decoded size).
