# v5 Asset log and Gemini queue

Owner: the `assets` agent (the only agent that touches Chrome). Other stories add requests to the queue. Every entry records the prompt, the file in `docs/v5/gemini/` and the processed destination.

## Queue

(empty: AS-01 moved to Done. Next: AS-02 busts.)

## Done

### AS-01 Hub mockup directions A, B, C (2026-10-10)

Mockups only: they are design references, not game assets, so they have no ART id, no manifest row and nothing goes to `public/`. Raws are kept untouched in `docs/v5/gemini/AS-01/` (in git as provenance, per ASSET_PIPELINE "Where files go"). Previews (420 px wide, JPEG q70, 88–109 KB) are in `docs/v5/ux/hub-mockups/`. The recommendation is in `docs/v5/ux/HUB_PICK.md`.

**Tool and settings.** gemini.google.com, model "Gemini 3.1 Pro", tool *Create image*, aspect **9:16** (the tallest the picker offers; 9:19.5 is not available). Every output is 1536x2752 JPEG. Every Campaign/Codex prompt had `docs/redesign/reference/A1-campaign-hub.jpg` attached as the style reference. No limit, CAPTCHA or consent dialog was hit.

**Shared style block (S), sent at the top of every first prompt in a chat.** HUB_DIRECTIONS' block, re-checked against the art bible (its TODO): parchment hexes changed to `parch` #e7d6ad / `parchHi` #f0e3c2 / `parchLo` #dcc394, page #16120f, teal #1f4f52, tab bar #16333a, terra #a8432c, bronze #7d5b30; Cinzel ALL CAPS only (§7.2); a colour-jobs sentence (§4.2); "illustrations never behind text" (§3); "no screen title heading" (the reference has a "CAMPAIGN HUB" heading that is not in the allowlist).

```
Mobile game screen mockup, tall portrait phone screen 390x844 (9:19.5), in the exact style of the attached reference image: traditional antiquity, mosaic and parchment. Dark warm basalt page (#16120f); a dark carved-stone frame with a gold-ochre Greek-key (meander) border and small round rosettes at the four corners framing the content; warm cream parchment panels (#e7d6ad, selected #f0e3c2, shaded #dcc394) with subtle fibres and a thin dark-brown inked edge; dark ink text (#3a2414). Titles, plaques, buttons and tab labels in Cinzel bold ALL CAPS; body text and every number in Inter medium, sentence case. Top bar: a dark stone strip with a centred glazed teal plaque (#1f4f52) with a gold rim. Bottom tab bar: dark teal-stone (#16333a) with a gold top rim, five slots with an engraved icon and a Cinzel label: CAMPAIGN (banner icon), DUELS (crossed swords), WAR (centre: a big round bronze shield medallion with an engraved crossed-spears glyph, rising above the bar, its WAR label inside the bar), CODEX (closed book), SHOP (market stall). The selected tab is a parchment block. Colour jobs: terracotta (#a8432c) only for the single primary button; aged bronze (#7d5b30) for other live controls; flat grey stone only for the disabled Camp tile; red only for the small count badge (with a cream ring). Painted illustrations sit inside frames, never behind text. Text large and crisp enough to read on a phone; buttons at least 44 px tall. Spell every string exactly as given and show no other text: no screen title heading under the top bar, no watermark.
```

The screen part of each prompt is HUB_DIRECTIONS' prompt for that screen, word for word, with these additions: "nothing on the left" of the top bar; "directly under it, with no heading"; a closing "Nothing else on the screen: no quests, no mail, no energy, no level bar, no gems, no extra buttons"; B1 and C1 add "No fresco of soldiers on this screen (the map / company scroll replaces it)"; B1 adds "no other lettering on the map". The Codex prompts drop the last rows that would not fit (A: 5 of 8 beasts; C: 6 of 8) and add "No fresco, no profile card, no buttons, no search bar, no Units or Lore section". B-Codex and C-Codex were sent in the A-Codex chat as "a NEW, separate image (not an edit): the same Codex hub in exactly the same style…".

**Renders** (every one compared to its allowlist tile by tile: top bar, profile, first steps, slot, CTA, three tiles, caption, tab bar, and nothing extra)

| # | Raw file | Prompt | Verdict | Tile-by-tile notes |
| --- | --- | --- | --- | --- |
| 1 | `docs/v5/gemini/AS-01/hub_A_campaign_1.jpg` | S + A1 | **Accepted** | Every allowlisted element present, nothing extra. Text exact and readable. Deviations (not invented, logged for the build): "First Steps (2 of 4)" in mixed-case Cinzel (bible §7.2 says caps only); Army badge is a red square without the cream ring. |
| 2 | `docs/v5/gemini/AS-01/hub_B_campaign_1.jpg` | S + B1 | **Accepted** | Strip, first steps, map (Rhegion, red banner, dotted route into fog, cartouche with the status line), CTA, tiles, tab bar. Nothing extra. Deviations: strip bust has no red crest; WAR label drawn on the medallion, not in the bar; same caps/badge notes as #1. |
| 3 | `docs/v5/gemini/AS-01/hub_C_campaign_1.jpg` | S + C1 | **Rejected** | No invented feature, but the "+4" was drawn as a badge **on Nikias's portrait**, so it reads as "Nikias +4" (a level or count that does not exist). Strategos bust lost its crest. Regenerated as an edit (#4). |
| 4 | `docs/v5/gemini/AS-01/hub_C_campaign_2.jpg` | edit of #3: "Change only: the "+4" … its own small round bronze disc … after Nikias; portraits slightly smaller; give the strategos bust a red horsehair crest" | **Accepted** | "+4" is now its own disc; crest back; everything else unchanged. Note: the disc touches the scroll's right roller even at 390 (a 320 warning, see HUB_PICK). |
| 5 | `docs/v5/gemini/AS-01/hub_A_codex_1.jpg` | S + A2 (5 beasts) | **Accepted** | Plaque CODEX, gear, Beasts ✓ \| Doctrines, 5 rows with the exact `myth.*.hint1` lines and levels, a 6th row cut by the frame (scrolling), CODEX tab selected. Nothing extra. Note: Harpies drawn as one harpy (the hint says a flock of six). |
| 6 | `docs/v5/gemini/AS-01/hub_B_codex_1.jpg` | B2 in the same chat | **Rejected** | Both doctrine icons reuse the **War medallion's crossed-spears glyph** (bible §7.4: one meaning per icon, the glyph is reserved for War). Locked rows not faded. Regenerated as an edit (#7). |
| 7 | `docs/v5/gemini/AS-01/hub_B_codex_2.jpg` | edit of #6: Steady = shield-wall icon, Rush = spearhead with speed lines; locked rows faded | **Accepted** | Distinct icons, faded "? Unknown doctrine" rows with locks. Note: the faded text is probably below 4.5:1; the build must keep the reason legible (A11Y, see HUB_PICK). The icons are placeholders: AS-03 paints the 5 doctrine icons. |
| 8 | `docs/v5/gemini/AS-01/hub_C_codex_1.jpg` | C2 in the same chat (6 beasts) | **Accepted** | Two-column grid, 6 cards, names and levels exact, 3rd row cut (scrolling), nothing extra. Note: the grid drops the hint line (ELEMENT_MAP E066 "Kept"), see HUB_PICK. |

**Totals:** 8 renders, 6 accepted (A ×2, B ×2, C ×2), 2 rejected and regenerated as edits. **Invented features: none** (no Quests, mail, energy, Play button, XP bar or gems in any render). The two rejections were a misleading badge placement and a reserved-glyph reuse.

**Previews** (`sips`, 420 px wide, q70): `docs/v5/ux/hub-mockups/hub_A_campaign_1.jpg`, `hub_B_campaign_1.jpg`, `hub_C_campaign_2.jpg`, `hub_A_codex_1.jpg`, `hub_B_codex_2.jpg`, `hub_C_codex_1.jpg`.

**Browser note.** In the first chat a click landed on the generated image and opened Gemini's image editor; the B1 prompt typed there went nowhere (the editor was closed without saving, nothing was sent). B1 was then sent in a fresh chat.

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
