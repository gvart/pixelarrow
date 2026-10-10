# v5 Asset log and Gemini queue

Owner: the `assets` agent (the only agent that touches Chrome). Other stories add requests to the queue. Every entry records the prompt, the file in `docs/v5/gemini/` and the processed destination.

## Queue

(empty: mockup directions come in Phase 2)

## Done

## Templates

Owner: art-director (S2-ART-BIBLE). Rules: `design/art/art-bible.md`. Sizes and subjects: `docs/v5/art/ASSET_LIST.md`. Processing: `docs/v5/art/ASSET_PIPELINE.md`.

### How to use them

1. Copy the template named in the asset's row (`T-…`).
2. Replace `{SUBJECT}` with the row's Subject, word for word.
3. Paste **T-STYLE first, then the template**: every painted prompt starts with the same style block, which keeps the families consistent.

**Family seeds**
- Generate one asset of a family first (busts: `bust_hoplite`; plates: `plate_hydra`; frescoes: `fresco_campaign`; icons: `icon_book`).
- Once it is approved, **attach it as the style reference** for the rest of its family. Add: *"Match the attached reference exactly in style, palette, brushwork, lighting and framing; change only the subject."*
- Variants (`portrait_nikias_talk` and `_blink`, `chest_open_empty` and `_full`) are **edits of the approved base**. Attach it and say *"Change only: {what}. Keep everything else identical: pose, framing, colours, lighting, background."*

**Output size.** Ask for the largest size Gemini gives at the aspect named; `process.mjs` refuses sources smaller than the shipped size. File every download as `docs/v5/gemini/<ART-id>_<file stem>_<n>.png`.

**Before saving, reject on sight**
- text, letters, numbers, signatures or watermarks;
- extra or missing limbs or heads;
- modern objects;
- the wrong headgear for the class (art bible §5.2);
- a frame or border painted around the image;
- on #FF00FF assets: a shadow, gradient or ground plane on the magenta, or magenta inside the subject.

### T-STYLE (prefix for every painted template)

```
STYLE: ancient Mediterranean fresco painting on lime plaster: earth pigments (yellow ochre, red ochre, burnt umber, terre verte, a little Egyptian blue), visible confident brushwork, subtle fine craquelure, soft painted edges, warm and slightly desaturated, no pure black and no pure white. Light from the upper left, shadows to the lower right. Clear value contrast on the subject so it reads at small phone size. Hand-painted illustration, not a photo, not a 3D render, not glossy digital art, not anime, not comic ink.
EXCLUDE: any text, letters, numbers, runes, signatures, watermarks, logos, UI, borders or frames around the image, modern objects, extra limbs, duplicated figures, cropped heads.
```

### T-FRESCO (mode banners: `fresco_*`)

```
[T-STYLE]
ROLE: a wide banner illustration for a mobile game menu, shown inside a bronze frame.
SUBJECT: {SUBJECT}.
COMPOSITION: a horizontal frieze in registers like a Greek wall painting: the action runs along one band across the centre of the image; keep heads, weapons and the focal action inside the central horizontal third, so the image survives a crop to a strip 6 times wider than tall; calm background (sky, sea, plaster) at the top and bottom edges; 3 to 7 figures, all fully inside the frame.
ASPECT: very wide landscape, 21:9 or wider, at the highest resolution available.
PALETTE ANCHORS: warm plaster cream #e7d6ad, ochre, terracotta #a8432c, bronze #b08a3a, sea teal-blue; red cloaks and bronze shields on the Greek side.
```

### T-VIGNETTE (settlement vignettes: `vignette_*`)

```
[T-STYLE]
ROLE: a wide establishing view of a settlement, the header of a town screen in a mobile game.
SUBJECT: {SUBJECT}, seen from a low hill at a slight distance, no people in the foreground.
COMPOSITION: horizontal bands: sky in the top quarter, the settlement's wall or roof line across the middle third (the part that must survive a crop to a thin strip), ground and path in the lower quarter; 3 to 5 readable landmarks; nothing important at the left and right edges.
ASPECT: landscape 21:9, highest resolution available.
LIGHT: warm afternoon sun from the upper left.
```

### T-BUST (class busts `bust_*` and Nikias `portrait_nikias*`)

```
[T-STYLE]
ROLE: a character portrait for a small round or square portrait frame in a mobile strategy game; it must be recognisable at 40 pixels.
SUBJECT: {SUBJECT}.
FRAMING: head and shoulders, front three-quarter view, the figure turned slightly to the viewer's left, eyes on the upper third of the image, the top of the head or crest 6 to 10 percent below the top edge, chin at about 60 percent of the height, shoulders cut by the bottom edge; the whole face and headgear inside the central circle of the image. The headgear silhouette and the one listed prop are the clearest, most contrasting shapes.
BACKGROUND: plain dark warm umber (#26211b to #342d25), a soft lighter glow behind the head, no scenery.
EXPRESSION: composed, alert, mouth closed.
ASPECT: square 1:1, highest resolution available.
```

### T-BUST-BEAST (`bust_wolf`, `bust_boar`, `bust_bear`)

```
[T-STYLE]
ROLE: an animal portrait for a small portrait frame in a mobile strategy game; it must be recognisable at 40 pixels.
SUBJECT: {SUBJECT}.
FRAMING: head and shoulders, three-quarter view toward the viewer's left, the head filling the upper two thirds, ears or tusks fully inside the frame.
BACKGROUND: plain dark warm umber (#26211b), a soft glow behind the head.
ASPECT: square 1:1, highest resolution available.
```

### T-PLATE (beast plates: `plate_*`)

```
[T-STYLE]
ROLE: a bestiary plate for a codex in a mobile game, in the manner of a painted tomb fresco or a vase painting: the monster alone, dramatic.
SUBJECT: {SUBJECT}.
COMPOSITION: the whole creature, or its unmistakable upper body for very large beasts, centred and filling about 80 percent of the frame; one simple ground cue (rock, swamp, shore); a strong silhouette against the background.
BACKGROUND: dark warm umber to deep red-brown, a warm key light from the upper left on the creature, chiaroscuro.
ASPECT: square 1:1, highest resolution available.
```

### T-ICON (atlas icons: `icon_*`)

```
ROLE: a game icon for a mobile strategy game menu, one of a set; it must read at 24 pixels.
SUBJECT: {SUBJECT}, a single object.
STYLE: a painted icon with a heavy dark-brown outline (#2a1a12) of even weight around the whole silhouette, three-quarter view, light from the upper left, warm materials (bronze #b08a3a, wood, cloth, stone), soft painted shading, slightly chunky proportions, centred, filling about 85 percent of the square.
BACKGROUND: a perfectly flat solid #FF00FF magenta background, edge to edge, with no shadow, no gradient, no glow and no ground plane; no magenta anywhere inside the object.
EXCLUDE: text, letters, numbers, a frame, a badge or a circle behind the object, more than one object.
ASPECT: square 1:1, highest resolution available.
```

Attach `public/icons/ui.png` as the style reference for the first icon: it shows the set the new icons must match.

### T-CUTOUT (reward art: `chest_*`, `laurel_branch`)

```
[T-STYLE, without its background]
ROLE: a reward object shown alone in a mobile game modal.
SUBJECT: {SUBJECT}.
FRAMING: the whole object, three-quarter front view, sitting on the bottom of the frame, centred, filling about 85 percent of the frame, nothing cut off.
BACKGROUND: a perfectly flat solid #FF00FF magenta background, edge to edge, with no shadow, no gradient, no glow and no floor; no magenta anywhere inside the object.
ASPECT: square 1:1 (laurel: portrait 3:4), highest resolution available.
```

### T-SPLASH (`splash_keyart`)

```
[T-STYLE]
ROLE: the full-screen key art behind the title of a portrait mobile game.
SUBJECT: {SUBJECT}.
COMPOSITION: tall portrait; the empty sky in the top third stays calm for a logo laid on in code; the phalanx and the beach in the middle and lower thirds; all key figures inside the central 60 percent of the width, so the image survives a crop to any phone shape.
ASPECT: tall portrait 9:19.5 (or 9:16, the tallest available), highest resolution available.
LIGHT: dawn from the upper left over the sea.
```

### T-PIXEL (world pixel sprites: map props, units, beasts; from later GDDs)

```
ROLE: a pixel-art game sprite for an isometric ancient-Mediterranean tactics game.
SUBJECT: {SUBJECT}, {FACING, e.g. facing down-right in a 2:1 isometric view}.
PIXEL GRID: true pixel art on a {W}x{H} art-pixel canvas (exact sizes in art bible section 8.5: soldier 32x32, mounted 48x48, lair beast 96x96, world boss 160x128), drawn so that every art pixel is a clean square block of 8x8 screen pixels; hard edges; no anti-aliasing, no blur, no gradients, no dithering noise, no sub-pixel detail.
PALETTE: only these colours (PA-WORLD): #2a1a12 #442618 #5e2427 #2e3e56 #7b503d #a87464 #dbac99 #f8d5c2 #9c8b78 #d6c0a8 #e8e2d4 #5a4a44 #836c65 #ac9283 #d2b68e #6a4a1e #b08a3a #e0c070 #7a2a2e #a12735 #cc7677 #3d5a78 #7a7a88 #5b3f2a #765d35 #9a8f3b #bba96a #4a5a2e #a8b46a #5d4070 #ae8a9a #978b81 #fde1c8 #d02030 #7fd0e0.
STYLE: a selective coloured outline (a darker shade of the local colour, never black), 3 to 4 step hue-shifted ramps (shadows toward red-purple, lights toward cream), light from the upper left, chunky-realistic proportions about 6 heads tall, team colour only on shields, crests and standards.
BACKGROUND: a perfectly flat solid #FF00FF magenta background, edge to edge, with no shadow, no ground and no base plate (the game draws those); feet on one line at the bottom.
EXCLUDE: text, a frame, several sprites, a scene.
```

Processing: `node scripts/art/process.mjs <name> <raw> --kind pixel --size {W}x{H}`. It detects the 8 px blocks, snaps to PA-WORLD and pads the sprite into the canvas. It never scales.

### T-FRAME (raster 9-slice chrome, only if a later story replaces procedural chrome)

```
ROLE: a 9-slice UI frame for a mobile game, carved from {MATERIAL: dark stone with a gold-ochre Greek-key meander / aged bronze with rivets}.
LAYOUT: a rectangular frame {B} pixels thick on every side around an empty centre; ALL ornaments (rosettes, rivets, corner bosses) only in the four corners; the four edges carry a pattern that repeats seamlessly and is uniform along its length, with no stains or ornaments in the middle of an edge.
BACKGROUND: the centre and the outside are a perfectly flat solid #FF00FF magenta.
LIGHT: from the upper left: lit top-left bevels, shaded bottom-right bevels.
ASPECT: square 1:1, highest resolution available.
EXCLUDE: text, a picture in the centre, perspective.
```

Processing: `process.mjs` (kind `frame`), then `nineslice.mjs` with the manifest's `slice` insets.
