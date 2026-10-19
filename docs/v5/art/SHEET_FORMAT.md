# Soldier sprite-sheet format (v2)

Pre-made sheets (PixelLab) replace the procedural soldier per class; a class
without a sheet, or whose image has not loaded, is drawn by
`src/art/paperdoll.ts`. Code: `src/art/sheetManifest.ts` (format, rules),
`src/art/sheetDoll.ts` (drawing), `src/art/sheetAnim.ts` (battle picker),
`src/art/sheetRegistry.ts` (sources).

A class ships **one** fully animated body in basic-tier colours. Veteran and
elite are runtime recolours of named colour groups; rarity is the metal swap on top.

## Files

```
src/assets/sheets/<class>/manifest.json
src/assets/sheets/<class>/<image>.png      the one image the manifest names
```

Anything there ships. Dev placeholders live in `src/dev/sheets/` and load only
on the dev server: `?sheets=dev` (packed), `?sheets=dev-raw` (unpacked),
`?sheets=dev:companion,thessalian` (only those; others keep shipped art).
`?sheets=off` draws everything procedurally.

## Image layout

Rows are facings (named in `rows`, top to bottom); columns are animation
frames (`anims[*].col`, `frames`); every frame is `frame.w` x `frame.h`.

With `wrap: N`, column `c` sits at x `(c % N) * frame.w` in band
`floor(c / N)`; each band holds every row, so y is
`(band * rows.length + row) * frame.h`. PNG at most 4096 px wide.

PNG, RGBA, no colour profile: colour groups and metal are matched by exact RGB.

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
| `version` | `2` (v1 is rejected; `3` is packed, see below) |
| `image` | the one image, relative to the manifest |
| `frame` | frame size in art px |
| `wrap` | optional: columns per band (see Image layout) |
| `anchor` | the art pixel the figure stands on (feet centre; riders and chariots: between hooves or wheels); lands on the procedural feet line so plates, rings and FX line up |
| `anchors` | optional per row name: that row's anchor (e.g. feet left of centre on right-facing rows). Default `anchor`. The figure's box is the procedural box widened about the feet to hold every row's frame |
| `scale` | game px per art px relative to the battle scale (a figure at `BATTLE_SCALE`, res 1). The battle draws at res 2, so `0.5` and `1` map to whole rendered px. Other screens scale by model scale / `BATTLE_SCALE`, snapped to a whole factor (or 1/n) |
| `rows` | directions of the image rows (PixelLab's 8 names) |
| `facings` | the row for game facing 0..3 (field +x, -y, +y, -x). Default `south-east, north-east, south-west, north-west`. Never mirrored |
| `colorGroups` | recolourable groups: exact colours, **dark to light**; any lowercase name. `skin`, `cloak`, `crest` also take per-man variation. A colour belongs to one group only, never to a metal group |
| `tiers` | per tier, the groups it recolours: a same-length ramp, dark to light, replacing by position. Omitted groups keep their colours; `basic` is usually `{}` |
| `anims` | per animation: first column, frame count (1..64), fps. `strike`: impact or release frame (default frames/2). `hold`: first frame of the looping part (default 0: whole clip loops) |
| `metal` | exact metal colours, **light to dark**, per group. `kind` picks the rarity ramps (`bronzeOf` / `ironOf`); `slots`: whose rarity sets it (the highest; default all four) |
| `portrait` | optional bust crop (art-px square) of the front idle frame. Default: 40% of the figure's height from just above the head (riders and chariots: see below) |
| `variation` | optional `{ "skin": false, "shade": false }`, default `true`: `skin: false` keeps `skin` as drawn; `shade: false` keeps `cloak` and `crest` as drawn |
| `rarity` | optional `{ "metal": false }`, default `true`: keeps metal as drawn. Rank 2+ metal still glints, the epic outline still glows |

Only `idle` is required. `parseManifest` rejects unknown names, overlapping
columns, bad or shared colours, tier ramps of the wrong length and an image
smaller than the layout, listing every problem; the class stays procedural.

## Riders and chariots

Mounted classes (`companion`, `thessalian`, `horse_archer`, `chariot`) use the
same manifest. Frames as big as needed (≈96 x 112 rider, 128 x 112 chariot);
`anchor` / `anchors` between hooves or wheels. The box starts from the
procedural rider's (96 x 84, hooves at 74) or chariot's (128 x 96, wheels at
84), widened about that point. Same art px per metre as foot sheets means the
same `scale`.

A PixelLab horse often shares hex colours with the rider's skin or bronze, so
skin tone and rarity would recolour it: set `"variation": { "skin": false }`
and/or `"rarity": { "metal": false }`, or keep rider colours off the coat.
There is no per-pixel group mask.

| state (battle) | rider | chariot |
| --- | --- | --- |
| standing | idle | idle |
| moving | walk; gallop above 1.3x walking speed | drive |
| charge order | charge | charge |
| attack | thrust (lance, spear), throw (javelins), shoot (bow), slash (blade) | its weapon's clip; none: it drives on |
| hit / stunned | hit / stagger | hit |
| routing | rout | rout |
| death | fallFwd / fallBack (never kneels) | wreck |
| victory | cheer / win | cheer / win |

Default mounted portrait: centred on the highest solid 6 x 6 px block of the
front idle frame (the head), spanning 30% of the height from it to the anchor.
A sheet with no attack clip skips the attack states.

## Tiers and per-man variation

The colour map is built once per key and cached:

1. **Tier**: gear score = summed `ItemDef.tier` (1..3) of worn weapon, shield,
   helmet and armour, divided by the slots the class may fill (`CLASS_GEAR`),
   an empty slot counting 0. Each class's band (`TIER_BANDS`, from its kit in
   `src/data/classes.ts`) is the score range of its three kit tiers split in
   thirds: basic, veteran, elite. A class whose kit never varies (royal guard)
   splits the range of everything it may equip. Rarity never moves the tier.
   `DollSpec.sheetTier` forces it.
2. **Skin**: `Look.skin` (0..3) picks one of `SKIN_TONES`; the sheet's ramp is
   tone 1 (olive), 0 paler, 2 browner, 3 deep brown. Off with `variation.skin: false`.
3. **Shade**: the man's seed picks one of `SHADE_STEPS` (x0.9, x1, x1.1) for
   `cloak` and `crest`, after the tier. Off with `variation.shade: false`.
4. **Rarity**: each metal group is spread over its rank's 5-colour ramp (off
   with `rarity.metal: false`). Rank 2+ metal is the glint mask, the epic
   outline ring the silhouette; `dollFx` animates both.

Key: `sheet_<class>.<tier>.<skin><shade>_<metal ranks>...`: at most 36 looks
per rarity mix per class.

## Animations and fallbacks

Timing uses the battle clock and each clip's `fps`; a man's loop has its own phase.

| animation | when (battle) | falls back to |
| --- | --- | --- |
| idle | standing | (required) |
| look / adjust | idle, seeded per man: one window in two of 7-11 s plays one | idle (not played) |
| walk / run | moving, run above 1.3x marching speed; strides on a stride clock | run <-> walk, then idle |
| gallop | riders: moving above 1.3x walking speed | run |
| drive | chariots: moving | gallop, run |
| charge | moving under a charge order | gallop, run |
| ready | standing in contact (`u.engaged`) | idle |
| brace | shield wall, standing; a blow taken in the wall keeps the stance | block |
| block | a blocked blow (0.22 s) | brace, idle |
| thrust | attack: spear, lance | attack |
| slash | attack: blade, chop, two-handed | thrust, attack |
| throw | shot: javelins | shoot, attack |
| shoot | shot: bow | attack |
| sling | shot: sling | throw (then shoot, attack) |
| stab | a missile man's blow at close quarters | thrust (then attack) |
| attack | any other attack | thrust, slash, idle |
| stagger | stunned (`u.stun > 0`) | hit |
| hit | hit (0.24 s) | stagger, idle |
| rout | routing | gallop, run |
| fallFwd / fallBack | death (seeded side) | die / dieB |
| die / dieB | (generic deaths) | fallFwd, fallBack, hit / fallBack, die |
| wreck | chariots: death | die |
| kneel | knocked out (`u.ko`), once down | (none: lies still) |
| cheer / win | victory | each other, then idle |
| breathe / shift | idle variants (ANIM-1: militia, hoplite, archer, slinger), bigger than look / adjust | idle |
| build / carry | construction work (militia) | idle / walk |

Fallbacks are tried depth first, never twice, ending at `idle`.

The attack clip follows `weaponClass` of the weapon's art (as `ATTACK_TIMES`).
A blow (`lastAttackTick`) and a shot (`lastShotTick`) are told apart as the sim
does; `isRangedClass` weapons shoot, and their close-quarters blows are `stab`.

**Strike timing.** The `strike` frame is on screen at the sim's attack; frames
before it are the windup, played over the last `strike / fps` s of the
cooldown while in contact; frames after are follow-through. Missiles: the draw
spreads over the aim window, the release plays from the strike frame, and the
projectile spawns on the shot's tick, so `strike` is the frame the missile leaves.

**Held loops.** A clip with `hold` plays `0..hold-1` once on entry, then loops
`hold..frames-1`; re-entering within 0.5 s resumes the loop.

Procedural callers passing old column ids (UI sheets, the camp) get the
matching frame of the state.

## Not on sheets (yet)

Shield paint, cloak and crest cosmetics, hair and beard, `Look` body variation
(beyond skin) and the victory-pose cosmetic.

## Packed sheets (v3)

Art is committed as v2; the build never ships the v2 image. `scripts/art/pack/`
packs each `src/assets/sheets/<class>/` into `src/generated/sheets/<class>/`
(git-ignored), which the registry reads. Vite build and dev server run it
first (`sheetPackPlugin`, `vite.config.ts`); `npm run sheets:pack` by hand
(with dev placeholders). A class repacks only when its manifest, image or the
packer changed.

The packer, losslessly:

1. Trims every frame to its opaque box, keeping the offset (`anchor`, `anchors`, `portrait` stay exact).
2. Stores identical trimmed frames once.
3. Shelf-packs into pages of at most 2048 x 2048 per group: `core` (everything a battle shows) and `extra` (`look`, `adjust`, `cheer`, `win`). A frame both use is on a core page.
4. Writes each page as the smallest PNG: indexed (tRNS) at ≤256 colours, else RGBA; no colour chunks. Fully transparent pixels become 0,0,0,0; all others are exact. Every frame is verified against the source after decoding; a mismatch fails the build.

Packed manifest = v2 with `version: 3`, no `image` or `wrap`, plus:

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
| `pages` | page images, relative to the manifest, with size and group |
| `rects` | stored frames, 5 numbers each: page, x, y, w, h |
| `cells` | 3 numbers per frame, index `col * rows.length + row`: stored frame (`-1`: empty) and offset `dx, dy` |
| `source` | what it was packed from (`sha1` covers manifest, image and packer) |

`idle` must be on core pages. A class draws from its sheet once its core pages
load; frames are read and recoloured from their rect only. An extra page loads
the first time one of its clips is asked for; until then the clip shows its
fallback. v2 manifests still load unchanged.

**Memory.** A decoded page is w x h x 4 bytes. The battle atlas sweep
(`src/ui/sprites.ts`, once a second) bounds the caches:

- An extra page unread for 6 s (`PAGE_TTL_MS`) is dropped and reloads from the browser cache.
- While all core pages exceed 48 MB (`CORE_BUDGET`), classes unused for 60 s (`CLASS_IDLE_MS`) lose theirs, oldest first, and are procedural until asked for again.
- Colour maps are an LRU of 256 (`PALETTE_CAP`, ≈1 KB each).
- Battle atlases hold only on-screen frames (6 s TTL), so looks do not grow GPU memory.

`sheetMemoryStats()` reports decoded bytes (`window.__sheetMem()` in dev).
Art with more than 256 colours per page packs as RGBA (larger download, same
decoded size).
