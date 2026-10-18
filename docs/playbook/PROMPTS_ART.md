# Art prompt library

Every Gemini prompt used in v5 (AS-08 included), grouped by asset type, quoted word for word from
[docs/v5/ASSET_LOG.md](../v5/ASSET_LOG.md) and [docs/v5/ux/HUB_DIRECTIONS.md](../v5/ux/HUB_DIRECTIONS.md).
Where the log kept only a short form of a prompt, this file says so and quotes the short form; nothing here was
reconstructed or invented. How to run a job: [ART.md](ART.md).

## What is captured

| Job | Asset type | Renders | Full prompt recorded | Short form only |
| --- | --- | --- | --- | --- |
| AS-01 | Hub screen mockups | 8 | 4 (S + screen prompt + the recorded additions) | 4 (two edits, two "same chat" Codex prompts whose prefix is elided) |
| AS-02 | Class and beast busts | 23 | 23 (family prompt + the exact SUBJECT) | 0 |
| AS-03 | Atlas icons (6 grids of 4) | 6 | 6 (grid prompt + the exact SUBJECTs) | 0 |
| AS-04 | Frescoes, vignettes, splash | 14 | 1 (the seed) | 13 (family F/G verbatim, SUBJECT short) |
| AS-05 | Beast plates, chests, laurel | 12 | 1 (the seed) | 11 (family F/G verbatim, SUBJECT short; cutouts described in prose) |
| AS-06 | World pixel sprites | 14 | 1 (the seed) | 13 (follow-up pattern verbatim, specifics quoted in short) |
| AS-08 | Nikias portraits, app icon mark | 5 | 5 | 0 |
| I1 | PixelLab hoplite bake-off (characters and clips, §13) | 10 characters + 10 clip jobs | 5 (3 character prompts, 2 attack prompts) + the call settings | 0 |
| **Total (Gemini)** | | **82** | **41** | **41** |

**Missing.** No v5 render is unrecorded. Not recorded anywhere: the prompts for art that predates v5 and still
ships or exists (`public/ui/banner_campaign.jpg`, `public/ui/portrait_leader.jpg`, the 101 legacy icons in
`public/icons/ui.png` and the 189 in `items.png`). The v4 brief that preceded them is quoted in §11; whether it
produced those files is not recorded. The Nikias portraits (ART-033..035), queued in AS-07, were sent and shipped in AS-08 (§10).

**Gemini settings.** gemini.google.com, "Pro" mode ("Gemini 3.1 Pro"), typed prompts, no tool picker after
AS-01 (AS-01 used the *Create image* tool with aspect 9:16). Outputs were 2048x2048 (square), 3168x1344
(wide), 1408x3040 or 1536x2752 (tall), all JPEG.

---

## 1. Reusable building blocks

Pulled out of the prompts below. Build a new prompt as **opening line + T-STYLE + template + SUBJECT + EXCLUDE
suffix + ASPECT**.

### Opening lines

| Use | Text |
| --- | --- |
| First asset of a new family (no reference) | `Create an image.` |
| First asset of a new family, with a reference from another family | `Create a NEW image, not an edit of the reference. The attached portrait is from the same mobile strategy game: match its painting style, palette, brushwork and lighting exactly, but this is a wide landscape scene, not a portrait.` |
| Later members of a family (seed attached) | `Create a NEW image, not an edit of the reference. Match the attached reference exactly in style, palette, brushwork, lighting, background and framing; change only the subject.` |
| Variant of an approved image | `Edit the attached chest image. Change only: {what}. Keep everything else identical: …` |
| Follow-up in the same chat, fixing one thing (AS-08) | `Create a NEW image with the same prompt, but fix {what}: … Keep everything else from the first prompt: …` |
| Follow-up in the same chat (pixel sets) | `Next sprite of the same set, same big cells (one flat colour each), same palette and light from the upper left, flat #FF00FF magenta background` |

### Reusable suffixes

| Suffix | Text |
| --- | --- |
| No-text guard (painted) | `EXCLUDE: any text, letters, numbers, runes, signatures, watermarks, logos, UI, borders or frames around the image, modern objects, extra limbs, duplicated figures, cropped heads, blood.` |
| Shields without letters | `plain bronze shields, NO lambda` and in EXCLUDE `symbols on shields` |
| Magenta key background | `BACKGROUND: a perfectly flat solid #FF00FF magenta background, edge to edge, with no shadow, no gradient, no glow and no ground plane; no magenta anywhere inside the object.` |
| Mockup honesty guard | `Nothing else on the screen: no quests, no mail, no energy, no level bar, no gems, no extra buttons` |
| Size | `ASPECT: square 1:1, highest resolution available.` / `ASPECT: very wide landscape, 21:9 or the widest available, highest resolution available.` |

### The templates (verbatim from ASSET_LOG › Templates)

**How to use them.** Copy the template named in the asset's manifest row. Replace `{SUBJECT}` with the row's
Subject, word for word. Paste T-STYLE first, then the template. Generate one family seed first (busts:
`bust_hoplite`; plates: `plate_hydra`; frescoes: `fresco_campaign`; icons: the first grid), then attach it to
the rest. Variants are edits of the approved base. Ask for the largest size; `process.mjs` refuses sources
smaller than the shipped size.

**T-STYLE** (prefix for every painted template)

```
STYLE: ancient Mediterranean fresco painting on lime plaster: earth pigments (yellow ochre, red ochre, burnt umber, terre verte, a little Egyptian blue), visible confident brushwork, subtle fine craquelure, soft painted edges, warm and slightly desaturated, no pure black and no pure white. Light from the upper left, shadows to the lower right. Clear value contrast on the subject so it reads at small phone size. Hand-painted illustration, not a photo, not a 3D render, not glossy digital art, not anime, not comic ink.
EXCLUDE: any text, letters, numbers, runes, signatures, watermarks, logos, UI, borders or frames around the image, modern objects, extra limbs, duplicated figures, cropped heads.
```

**T-FRESCO** (mode banners `fresco_*`)

```
[T-STYLE]
ROLE: a wide banner illustration for a mobile game menu, shown inside a bronze frame.
SUBJECT: {SUBJECT}.
COMPOSITION: a horizontal frieze in registers like a Greek wall painting: the action runs along one band across the centre of the image; keep heads, weapons and the focal action inside the central horizontal third, so the image survives a crop to a strip 6 times wider than tall; calm background (sky, sea, plaster) at the top and bottom edges; 3 to 7 figures, all fully inside the frame.
ASPECT: very wide landscape, 21:9 or wider, at the highest resolution available.
PALETTE ANCHORS: warm plaster cream #e7d6ad, ochre, terracotta #a8432c, bronze #b08a3a, sea teal-blue; red cloaks and bronze shields on the Greek side.
```

**T-VIGNETTE** (settlement vignettes `vignette_*`)

```
[T-STYLE]
ROLE: a wide establishing view of a settlement, the header of a town screen in a mobile game.
SUBJECT: {SUBJECT}, seen from a low hill at a slight distance, no people in the foreground.
COMPOSITION: horizontal bands: sky in the top quarter, the settlement's wall or roof line across the middle third (the part that must survive a crop to a thin strip), ground and path in the lower quarter; 3 to 5 readable landmarks; nothing important at the left and right edges.
ASPECT: landscape 21:9, highest resolution available.
LIGHT: warm afternoon sun from the upper left.
```

**T-BUST** (class busts `bust_*` and Nikias `portrait_nikias*`)

```
[T-STYLE]
ROLE: a character portrait for a small round or square portrait frame in a mobile strategy game; it must be recognisable at 40 pixels.
SUBJECT: {SUBJECT}.
FRAMING: head and shoulders, front three-quarter view, the figure turned slightly to the viewer's left, eyes on the upper third of the image, the top of the head or crest 6 to 10 percent below the top edge, chin at about 60 percent of the height, shoulders cut by the bottom edge; the whole face and headgear inside the central circle of the image. The headgear silhouette and the one listed prop are the clearest, most contrasting shapes.
BACKGROUND: plain dark warm umber (#26211b to #342d25), a soft lighter glow behind the head, no scenery.
EXPRESSION: composed, alert, mouth closed.
ASPECT: square 1:1, highest resolution available.
```

**T-BUST-BEAST** (`bust_wolf`, `bust_boar`, `bust_bear`)

```
[T-STYLE]
ROLE: an animal portrait for a small portrait frame in a mobile strategy game; it must be recognisable at 40 pixels.
SUBJECT: {SUBJECT}.
FRAMING: head and shoulders, three-quarter view toward the viewer's left, the head filling the upper two thirds, ears or tusks fully inside the frame.
BACKGROUND: plain dark warm umber (#26211b), a soft glow behind the head.
ASPECT: square 1:1, highest resolution available.
```

**T-PLATE** (beast plates `plate_*`)

```
[T-STYLE]
ROLE: a bestiary plate for a codex in a mobile game, in the manner of a painted tomb fresco or a vase painting: the monster alone, dramatic.
SUBJECT: {SUBJECT}.
COMPOSITION: the whole creature, or its unmistakable upper body for very large beasts, centred and filling about 80 percent of the frame; one simple ground cue (rock, swamp, shore); a strong silhouette against the background.
BACKGROUND: dark warm umber to deep red-brown, a warm key light from the upper left on the creature, chiaroscuro.
ASPECT: square 1:1, highest resolution available.
```

**T-ICON** (atlas icons `icon_*`; attach `public/icons/ui.png` as the style reference for the first)

```
ROLE: a game icon for a mobile strategy game menu, one of a set; it must read at 24 pixels.
SUBJECT: {SUBJECT}, a single object.
STYLE: a painted icon with a heavy dark-brown outline (#2a1a12) of even weight around the whole silhouette, three-quarter view, light from the upper left, warm materials (bronze #b08a3a, wood, cloth, stone), soft painted shading, slightly chunky proportions, centred, filling about 85 percent of the square.
BACKGROUND: a perfectly flat solid #FF00FF magenta background, edge to edge, with no shadow, no gradient, no glow and no ground plane; no magenta anywhere inside the object.
EXCLUDE: text, letters, numbers, a frame, a badge or a circle behind the object, more than one object.
ASPECT: square 1:1, highest resolution available.
```

**T-CUTOUT** (reward art `chest_*`, `laurel_branch`)

```
[T-STYLE, without its background]
ROLE: a reward object shown alone in a mobile game modal.
SUBJECT: {SUBJECT}.
FRAMING: the whole object, three-quarter front view, sitting on the bottom of the frame, centred, filling about 85 percent of the frame, nothing cut off.
BACKGROUND: a perfectly flat solid #FF00FF magenta background, edge to edge, with no shadow, no gradient, no glow and no floor; no magenta anywhere inside the object.
ASPECT: square 1:1 (laurel: portrait 3:4), highest resolution available.
```

**T-SPLASH** (`splash_keyart`)

```
[T-STYLE]
ROLE: the full-screen key art behind the title of a portrait mobile game.
SUBJECT: {SUBJECT}.
COMPOSITION: tall portrait; the empty sky in the top third stays calm for a logo laid on in code; the phalanx and the beach in the middle and lower thirds; all key figures inside the central 60 percent of the width, so the image survives a crop to any phone shape.
ASPECT: tall portrait 9:19.5 (or 9:16, the tallest available), highest resolution available.
LIGHT: dawn from the upper left over the sea.
```

**T-PIXEL** (world pixel sprites; see §8 for what actually worked)

```
ROLE: a pixel-art game sprite for an isometric ancient-Mediterranean tactics game.
SUBJECT: {SUBJECT}, {FACING, e.g. facing down-right in a 2:1 isometric view}.
PIXEL GRID: true pixel art on a {W}x{H} art-pixel canvas (exact sizes in art bible section 8.5: soldier 32x32, mounted 48x48, lair beast 96x96, world boss 160x128), drawn so that every art pixel is a clean square block of 8x8 screen pixels; hard edges; no anti-aliasing, no blur, no gradients, no dithering noise, no sub-pixel detail.
PALETTE: only these colours (PA-WORLD): #2a1a12 #442618 #5e2427 #2e3e56 #7b503d #a87464 #dbac99 #f8d5c2 #9c8b78 #d6c0a8 #e8e2d4 #5a4a44 #836c65 #ac9283 #d2b68e #6a4a1e #b08a3a #e0c070 #7a2a2e #a12735 #cc7677 #3d5a78 #7a7a88 #5b3f2a #765d35 #9a8f3b #bba96a #4a5a2e #a8b46a #5d4070 #ae8a9a #978b81 #fde1c8 #d02030 #7fd0e0.
STYLE: a selective coloured outline (a darker shade of the local colour, never black), 3 to 4 step hue-shifted ramps (shadows toward red-purple, lights toward cream), light from the upper left, chunky-realistic proportions about 6 heads tall, team colour only on shields, crests and standards.
BACKGROUND: a perfectly flat solid #FF00FF magenta background, edge to edge, with no shadow, no ground and no base plate (the game draws those); feet on one line at the bottom.
EXCLUDE: text, a frame, several sprites, a scene.
```

**T-FRAME** (raster 9-slice chrome; never used in v5, the chrome stayed procedural)

```
ROLE: a 9-slice UI frame for a mobile game, carved from {MATERIAL: dark stone with a gold-ochre Greek-key meander / aged bronze with rivets}.
LAYOUT: a rectangular frame {B} pixels thick on every side around an empty centre; ALL ornaments (rosettes, rivets, corner bosses) only in the four corners; the four edges carry a pattern that repeats seamlessly and is uniform along its length, with no stains or ornaments in the middle of an edge.
BACKGROUND: the centre and the outside are a perfectly flat solid #FF00FF magenta.
LIGHT: from the upper left: lit top-left bevels, shaded bottom-right bevels.
ASPECT: square 1:1, highest resolution available.
EXCLUDE: text, a picture in the centre, perspective.
```

**T-MARK** (the app icon and favicon mark; AS-08, §12)

```
ROLE: the app icon and browser favicon of a mobile strategy game set in the ancient Mediterranean; it must read as one bold shape at 16 pixels and still look rich at 512 pixels.
SUBJECT: {SUBJECT: one object in side profile, e.g. a bronze Corinthian hoplite helmet facing the viewer's left with a tall arched red horsehair crest}; its one dark opening (eye hole) a single clear shape; the object fills about 70 percent of the disc and is centred in it.
DISC: a perfect circle of dark black-glaze umber (#2a1a12 to #3a2418), like the ground of a red-figure Greek vase, edged by a ring of terracotta (#a8432c) carrying a simple bold Greek key meander band in terracotta and warm cream (#e7d6ad), the band about 8 percent of the diameter wide; the object sits inside the ring and does not touch it.
STYLE: painted like a red-figure Greek vase but with soft painted shading on the bronze: flat bold shapes, a heavy dark-brown outline (#2a1a12) of even weight around the object, light from the upper left, bronze #b08a3a with warm highlights, warm earth colours, no pure black and no pure white, very few internal details; hand-painted, not a photo, not a 3D render, not glossy digital art, not anime.
COMPOSITION: the disc centred, seen flat from the front, filling 94 percent of the square, nothing outside the disc.
BACKGROUND: a perfectly flat solid #FF00FF magenta background outside the disc, edge to edge, with no shadow, no gradient and no glow; no magenta anywhere inside the disc.
EXCLUDE: any text, letters, numbers, signatures, watermarks, a face or a person, more than one object, tiny details, perspective, a drop shadow.
ASPECT: square 1:1, highest resolution available.
```

---

## 2. Screen mockups (AS-01, hub directions A, B, C)

Mockups are design references, not assets: no ART id, nothing goes to `public/`. Each prompt is an allowlist:
it names every element the screen may show. Attach `docs/redesign/reference/A1-campaign-hub.jpg` as the style
reference. Tool: *Create image*, aspect 9:16; outputs 1536x2752.

**Shared style block S** (sent at the top of every first prompt in a chat; the art-bible-corrected version):

```
Mobile game screen mockup, tall portrait phone screen 390x844 (9:19.5), in the exact style of the attached reference image: traditional antiquity, mosaic and parchment. Dark warm basalt page (#16120f); a dark carved-stone frame with a gold-ochre Greek-key (meander) border and small round rosettes at the four corners framing the content; warm cream parchment panels (#e7d6ad, selected #f0e3c2, shaded #dcc394) with subtle fibres and a thin dark-brown inked edge; dark ink text (#3a2414). Titles, plaques, buttons and tab labels in Cinzel bold ALL CAPS; body text and every number in Inter medium, sentence case. Top bar: a dark stone strip with a centred glazed teal plaque (#1f4f52) with a gold rim. Bottom tab bar: dark teal-stone (#16333a) with a gold top rim, five slots with an engraved icon and a Cinzel label: CAMPAIGN (banner icon), DUELS (crossed swords), WAR (centre: a big round bronze shield medallion with an engraved crossed-spears glyph, rising above the bar, its WAR label inside the bar), CODEX (closed book), SHOP (market stall). The selected tab is a parchment block. Colour jobs: terracotta (#a8432c) only for the single primary button; aged bronze (#7d5b30) for other live controls; flat grey stone only for the disabled Camp tile; red only for the small count badge (with a cream ring). Painted illustrations sit inside frames, never behind text. Text large and crisp enough to read on a phone; buttons at least 44 px tall. Spell every string exactly as given and show no other text: no screen title heading under the top bar, no watermark.
```

**Additions to every screen prompt** (from the log): "nothing on the left" of the top bar; "directly under it,
with no heading"; a closing "Nothing else on the screen: no quests, no mail, no energy, no level bar, no gems,
no extra buttons"; B1 and C1 add "No fresco of soldiers on this screen (the map / company scroll replaces it)";
B1 adds "no other lettering on the map". The Codex prompts drop the last rows that would not fit (A: 5 of 8
beasts; C: 6 of 8) and add "No fresco, no profile card, no buttons, no search bar, no Units or Lore section".

**Prompt A1 (Campaign hub, direction A "Fresco Hall")**

> [Shared style block] Screen: the Campaign hub, CAMPAIGN tab selected. From top to bottom inside the frame: (1) the top bar with the plaque "PIXELARROW" and a gear icon on the right; (2) a parchment profile card: a painted bust of a Greek strategos with a bronze helmet and red crest in a bronze-rimmed square at the left; at the right "STRATEGOS EPAMEINON" in Cinzel, then "Day 14 · in Rhegion · Lairs 2/6", then a coin icon "240 Gold", a trophy icon "3 Trophies", a men icon "Warband 9 Men"; (3) a parchment card titled "FIRST STEPS (2 OF 4)" with a 4-segment bar, two segments gold with check marks and two dark brown, and the line "Win a battle" centred under it; (4) a wide painted fresco in a dark bronze riveted frame: ancient Greek wall painting on cracked plaster, hoplites with round shields marching along a sunlit coast at dawn, ships on the sea; (5) one wide terracotta-red stone button with pointed chevron ends and a gold rim: "CONTINUE THE MARCH"; (6) three square carved stone tiles in a row with engraved bronze icons: "ARMY" (Corinthian helmet) with a small red square badge "2" at the top right, "STASH" (chest), and "CAMP" (tent) shown flat grey and faded as unavailable, with the small caption "Pitch camp on the map" under it; (7) the tab bar. Nothing else on the screen.

**Prompt A2 (Codex hub)**

> [Shared style block] Screen: the Codex hub, CODEX tab selected. Top bar plaque "CODEX", gear icon at the right, no back arrow. At the top of the content a two-part parchment segmented switch: "BEASTS" (selected, lighter with a bronze rim and a tick) and "DOCTRINES". Then a list of parchment rows, each with a square painted beast portrait at the left, the name in Cinzel, a two-line description in Inter, and a small state at the right: "LERNAEAN HYDRA" — "Five heads strike on long necks; each is a target of its own." — "Level 7"; "CYCLOPS" — "Hurls boulders at the tightest knot of men: stunned, thrown aside, shaken." — "Level 5"; "HARPIES" — "A flock of six circles out of reach." — "Level 4"; "NEMEAN LION" — "Arrows, javelins and sling stones glance off its hide." — "Level 6"; "MINOTAUR" — "Charges straight through lines, trampling and tossing men aside." — "Level 8"; "CHIMERA" — "Breathes fire in a cone: men burn and lose heart." — "Level 6"; "KRAKEN" — "Rooted at the shore: six arms slam men and drag them into the surf." — "World boss"; "TITAN" — "Hurls two boulders at once and stamps on the crowd." — "World boss". The tab bar at the bottom. Nothing else.

**Prompt B1 (Campaign hub, direction B "War Table")**

> [Shared style block] Screen: the Campaign hub, CAMPAIGN tab selected. From top to bottom: (1) the top bar with the plaque "PIXELARROW" and a gear icon on the right; (2) a slim parchment strip: a small painted bust of a Greek strategos (bronze helmet, red crest) at the left, "STRATEGOS EPAMEINON" in Cinzel, then at the right a coin icon "240", a trophy icon "3", a men icon "9"; (3) a parchment card titled "FIRST STEPS (2 OF 4)" with a 4-segment bar, two segments gold with check marks and two dark brown, and the line "Win a battle"; (4) a tall painted map vignette in a dark bronze riveted frame, taking about a third of the screen: an antique hand-drawn map on aged parchment of a rocky Mediterranean coast with a sea in faded blue, small hills and olive trees drawn in ink, a walled town lettered "Rhegion", and a small red banner standing next to it; a dotted ink route leading off toward unexplored fog at the map's edge; at the bottom edge of the map a small parchment cartouche reading "Day 14 · in Rhegion · Lairs 2/6"; (5) one wide terracotta-red stone button with pointed chevron ends: "CONTINUE THE MARCH"; (6) three square carved stone tiles: "ARMY" (helmet) with a small red badge "2", "STASH" (chest), and "CAMP" (tent) flat grey and faded, with the caption "Pitch camp on the map"; (7) the tab bar. Nothing else on the screen.

**Prompt B2 (Codex hub)**

> [Shared style block] Screen: the Codex hub, CODEX tab selected. Top bar plaque "CODEX", gear icon right, no back arrow. The content looks like the pages of an ancient bestiary: a parchment segmented switch "BEASTS" | "DOCTRINES" with "DOCTRINES" selected (lighter, bronze rim, tick). Below, parchment rows, each with an engraved round bronze icon at the left, the name in Cinzel and one line in Inter: "STEADY" — "Flanks at 14 s, presses after 25 s."; "RUSH" — "Charges at once, flanks early, never retreats."; then three rows shown as faded ink with a small lock: "? Unknown doctrine". The tab bar at the bottom. Nothing else.

**Prompt C1 (Campaign hub, direction C "Muster Roll")**

> [Shared style block] Screen: the Campaign hub, CAMPAIGN tab selected. From top to bottom: (1) the top bar with the plaque "PIXELARROW" and a gear icon on the right; (2) a parchment profile card: a painted bust of a Greek strategos (bronze helmet, red crest) in a bronze-rimmed square; "STRATEGOS EPAMEINON"; "Day 14 · in Rhegion · Lairs 2/6"; a coin icon "240 Gold", a trophy icon "3 Trophies", a men icon "Warband 9 Men"; (3) a parchment card "FIRST STEPS (2 OF 4)" with a 4-segment bar (two gold segments with ticks, two dark brown) and the line "Win a battle"; (4) a wide parchment scroll with rolled ends titled "THE COMPANY", holding a row of five small painted head-and-shoulders portraits of ancient Greek soldiers in round bronze frames (two hoplites in Corinthian helmets, a peltast with a light cap, a slinger bare-headed, an older veteran with a beard), each with a first name under it in Inter: "Lykon", "Damon", "Kleon", "Phaidros", "Nikias", and a small "+4" disc at the end of the row; the "Kleon" portrait has a small white bandage glyph on its frame; (5) one wide terracotta-red stone button with pointed chevron ends: "CONTINUE THE MARCH"; (6) three square carved stone tiles: "ARMY" (helmet) with a small red badge "2", "STASH" (chest), and "CAMP" (tent) flat grey and faded, with the caption "Pitch camp on the map"; (7) the tab bar. Nothing else on the screen.

**Prompt C2 (Codex hub)**

> [Shared style block] Screen: the Codex hub, CODEX tab selected. Top bar plaque "CODEX", gear icon right, no back arrow. A parchment segmented switch "BEASTS" (selected) | "DOCTRINES". Below it a grid of two columns of tall parchment cards, each with a painted beast portrait filling the top and the name in Cinzel under it plus one small line: "LERNAEAN HYDRA" / "Level 7"; "CYCLOPS" / "Level 5"; "HARPIES" / "Level 4"; "NEMEAN LION" / "Level 6"; "MINOTAUR" / "Level 8"; "CHIMERA" / "Level 6"; "KRAKEN" / "World boss"; "TITAN" / "World boss" (the last row may be cut by the bottom of the screen, as in a scrolling list). The tab bar at the bottom. Nothing else.

| # | Raw | Prompt | Result | Why |
| --- | --- | --- | --- | --- |
| 1 | `hub_A_campaign_1.jpg` | S + A1 | Kept (direction A picked, V5-047) | Every allowlisted element, nothing extra |
| 2 | `hub_B_campaign_1.jpg` | S + B1 | Kept | Nothing extra; WAR label drawn on the medallion |
| 3 | `hub_C_campaign_1.jpg` | S + C1 | **Rejected** | "+4" drawn as a badge on Nikias's portrait, reads as a level that does not exist |
| 4 | `hub_C_campaign_2.jpg` | Short form: edit of #3, "Change only: the "+4" … its own small round bronze disc … after Nikias; portraits slightly smaller; give the strategos bust a red horsehair crest" | Kept | |
| 5 | `hub_A_codex_1.jpg` | S + A2 (5 beasts) | Kept | Exact hint lines |
| 6 | `hub_B_codex_1.jpg` | Short form: B2 "in the same chat" as "a NEW, separate image (not an edit): the same Codex hub in exactly the same style…" | **Rejected** | Doctrine icons reused the War medallion's reserved crossed-spears glyph; locked rows not faded |
| 7 | `hub_B_codex_2.jpg` | Short form: edit of #6, "Steady = shield-wall icon, Rush = spearhead with speed lines; locked rows faded" | Kept | |
| 8 | `hub_C_codex_1.jpg` | Short form: C2 in the same chat (6 beasts) | Kept | |

Previews: `docs/v5/ux/hub-mockups/`. Pick: `docs/v5/ux/HUB_PICK.md`.

---

## 3. Class and beast busts (AS-02)

Seed: `bust_hoplite` from T-STYLE + T-BUST, plus "It shows a CLASS of soldier (a type), not a named hero" and
"eyes looking toward the viewer's left". Its 1024 px copy was attached to every later prompt.

**Family prompt (F + SUBJECT + G), soldiers**

```
Create a NEW image, not an edit of the reference. Match the attached reference exactly in style, palette, brushwork, lighting, background and framing; change only the subject. It is one of a matching set of soldier-CLASS portraits for a mobile strategy game (a type of soldier, not a named hero). STYLE: ancient Mediterranean fresco painting on lime plaster: earth pigments (yellow ochre, red ochre, burnt umber, terre verte, a little Egyptian blue), visible confident brushwork, subtle fine craquelure, soft painted edges, warm and slightly desaturated, no pure black and no pure white. Light from the upper left, shadows to the lower right. Hand-painted illustration, not a photo, not a 3D render. EXCLUDE: any text, letters, numbers, runes, signatures, watermarks, logos, borders or frames, modern objects, extra limbs, duplicated figures, cropped heads. SUBJECT: {SUBJECT}. FRAMING (same as the reference): head and shoulders, front three-quarter view, turned slightly to the viewer's left, eyes on the upper third of the image, the top of the headgear or hair 6 to 10 percent below the top edge, shoulders cut by the bottom edge, the whole face and headgear inside the central circle; the headgear silhouette and the one listed prop are the clearest, most contrasting shapes. BACKGROUND: the same plain dark warm umber with a soft lighter glow behind the head, no scenery. EXPRESSION: composed, alert, mouth closed, eyes toward the viewer's left. ASPECT: square 1:1, highest resolution available.
```

Per-subject tweaks: fanatic: EXCLUDE adds "blood", EXPRESSION "intense, mouth closed"; chariot: EXCLUDE adds
"horses, wheels"; sacred_band: EXCLUDE adds "anything red".

**Family prompt, beasts** (T-BUST-BEAST merged into the family)

```
Create a NEW image, not an edit of the reference. Match the attached reference exactly in style, palette, brushwork, lighting and background; change the subject to an animal. It is one of a matching set of unit portraits for a mobile strategy game; this one shows a wild animal that fights as a unit (a type of animal, no human). STYLE: [as the family prompt]. EXCLUDE: any text, letters, numbers, signatures, watermarks, logos, borders or frames, people, collars, harness, armour, modern objects, extra legs, two heads, duplicated animals, cropped ears{, or tusks}, blood. SUBJECT: {SUBJECT}. FRAMING: head and shoulders, three-quarter view turned toward the viewer's left, the head filling the upper two thirds of the image, the tips of the ears 6 to 10 percent below the top edge and fully inside the frame, shoulders cut by the bottom edge, the head inside the central circle; the head silhouette {and the tusks / the open mouth} are the clearest, most contrasting shapes. BACKGROUND: the same plain dark warm umber as the reference with a soft lighter glow behind the head, no scenery. EXPRESSION: {alert, watchful / alert, stubborn / menacing}, eyes toward the viewer's left. ASPECT: square 1:1, highest resolution available.
```

| # | ART | File | SUBJECT as sent | Result | Why |
| --- | --- | --- | --- | --- | --- |
| 1 | 013 | bust_hoplite | T-STYLE + T-BUST: a Spartan hoplite, bronze Corinthian helmet with a tall red transverse horsehair crest, red cloak, the bronze rim of a round aspis shield at the shoulder | Seed; **promoted** (ARM-01) | Crest reads red at 21 px |
| 2 | 012 | bust_militia | a Greek levy militiaman, a farmer-soldier: a brown felt cap (pilos), plain undyed ochre wool tunic, no armour, a short wooden spear with an iron head held upright at his shoulder | **Promoted** (ARM-01) | |
| 3 | 014 | bust_thureophoros | a Hellenistic thureophoros: plain conical bronze pilos helmet with no crest, dark hair, blue-grey linen tunic, the upper edge of a tall OVAL thureos shield, cream with a red pattern and a vertical spine | **Promoted** (AS-07) | Matches the sprite |
| 4 | 015 | bust_celt_sword | a Celtic swordsman: iron Montefortino helmet with a top knob and cheek guards, long drooping moustache, bronze torc, green checked cloak over mail, hilt and upper blade of a long sword | **Promoted** (AS-07) | Small unhistorical nasal |
| 5 | 016 | bust_rhomphaia | a Thracian rhomphaia warrior: tall bronze Phrygian-style helmet curving forward, cheek guards, brown fox-fur cloak, ochre tunic, the long curved blade of a two-handed rhomphaia over the shoulder; no shield | **Promoted** (AS-07) | |
| 6 | 017 | bust_archer | a Cretan archer: bare head, short dark curly hair, cream linen tunic, leather quiver strap, fletchings and the bow tip above the shoulder | **Promoted** (AS-07) | |
| 7 | 018 | bust_slinger | a Rhodian slinger: bare head, short straight brown hair, short beard, white tunic, pouch of stones on a strap, a braided sling wound round his raised wrist | **Promoted** (ARM-01) | |
| 8 | 019 | bust_javelineer | a Thracian javelineer: grey wolfskin cap (alopekis) with the animal's ears, light green tunic, exactly two javelins over the shoulder | **Promoted** (AS-07) | |
| 9 | 020 | bust_horse_archer | a Scythian horse archer: tall pointed felt hood with ear flaps tied under the chin, red embroidered kaftan, gorytos bow case with a short recurved bow | **Promoted** (AS-07) | |
| 10 | 021 | bust_peltast (1) | a Thracian peltast: open-faced bronze Thracian helmet, forward-curving crown, short peak, cheek guards, brown cloak, crescent wicker pelte | **Rejected** | Same headgear silhouette as the rhomphaia (bible §3) |
| 11 | 021 | bust_peltast (2) | as #10 but: a LOW, ROUNDED open-faced bronze helmet hugging the skull, short brim-like peak, long cheek guards; NO tall crown, NO curving tip, NO crest; the crescent pelte is the main prop | **Promoted** (ARM-01) | |
| 12 | 022 | bust_falx | a Thracian falx warrior: bare head, long dark hair, full beard, brown wool cloak over a red tunic, the inward-curved blade of a two-handed falx over his shoulder | **Promoted** (AS-07) | |
| 13 | 023 | bust_gallic | a Gallic warband warrior: limed pale spiky hair, long moustache, bare chest with blue woad swirls, bronze torc, the upper edge of a long oval shield with an iron boss | **Promoted** (AS-07) | |
| 14 | 024 | bust_fanatic (run 1) | a cult fanatic: shaved head, grey ash on face and scalp, fierce stare, torn white tunic, black cloak, a short curved bronze knife raised; expression: intense, mouth closed (the bible's one grimace exception); EXCLUDE adds blood | Not saved | Chrome blocked the download |
| 15 | 024 | bust_fanatic | a cult fanatic: shaved head, grey ash on face and scalp, fierce stare, torn white tunic, black cloak, a short curved bronze knife raised | **Promoted** (AS-07) | |
| 16 | 025 | bust_companion | a Macedonian Companion cavalryman: bronze Boeotian helmet (an open face, a wide flaring brim all round like a hat, no crest, no plume), short dark beard, a deep purple cloak with a broad ochre-gold border pinned at the shoulder over a bronze muscled cuirass, the long wooden shaft and iron head of a cavalry lance (xyston) held upright beside his shoulder; no shield | **Promoted** (AS-07) | |
| 17 | 026 | bust_thessalian | a Thessalian light horseman: a pale cream FELT petasos sun hat with a very FLAT, very WIDE round brim and a LOW shallow crown, tied with a cord under the chin (cloth, not metal), young clean-shaven face, a short Egyptian-blue chlamys cloak pinned at the shoulder over a white tunic, exactly two light javelins held upright beside his shoulder | **Promoted** (AS-07) | Distinct from the companion at 21 px |
| 18 | 027 | bust_chariot | a Persian-style scythed-chariot driver: a soft cream-and-ochre felt Persian tiara cap, LOW and ROUNDED, its top bending forward, with a cloth band round the brow and long side flaps hanging loose at the cheeks (NOT tall, NOT pointed, NOT tied under the chin), black curled beard, red tunic under a shirt of overlapping bronze SCALE armour, one raised fist gripping the leather reins, the reins running out of the frame | **Promoted** (AS-07) | Cap taller than asked, still distinct |
| 19 | 028 | bust_royal_guard | a Macedonian royal guardsman (a silver-shield man): a GILDED Attic helmet with the face open, a short brow peak, hinged cheek pieces, a low red horsehair crest running front to back and two upright white feather plumes, one at each side of the helmet; short grey-flecked beard; bronze muscled cuirass, a purple cloak; the polished SILVER rim and face of a round shield at his shoulder, the brightest cool shape in the image | **Promoted** (AS-07) | |
| 20 | 029 | bust_sacred_band | a Theban Sacred Band hoplite: the same kind of bronze Corinthian helmet as the reference but with a tall DARK charcoal-black horsehair crest; a dark Egyptian-blue cloak, white linen corselet; at his shoulder the round bronze-rimmed shield, its face painted dark blue with one large golden Herakles CLUB emblem (a single knobbly wooden club, drawn as a picture, not a letter), the club clearly visible. NO red anywhere | **Promoted** (AS-07) | Told apart from the hoplite (V5-050) |
| 21 | 030 | bust_wolf | a grey wolf: grey and tawny fur with a pale muzzle and throat, ears pricked up, amber eyes, mouth closed | **Promoted** (AS-07) | |
| 22 | 031 | bust_boar | a wild boar: dark brown-grey coarse coat, a bristling dark mane standing up along the neck and back, small dark eye, long snout, two curved pale ivory tusks curling up from the lower jaw, clearly visible | **Promoted** (AS-07) | |
| 23 | 032 | bust_bear | a huge brown bear: thick reddish-brown fur, a heavy brow ridge, small round ears, mouth open in a low roar showing teeth and fangs, a massive hump of shoulder | **Promoted** (AS-07) | |

**Lessons:** spell out the silhouette in capitals when two classes could look alike ("LOW, ROUNDED … NO tall
crown"); name a colour rule to separate look-alikes ("NO red anywhere"); follow the game kit over the bible.

---

## 4. Atlas icons (AS-03)

Each prompt asked for a 2x2 grid of four icons on #FF00FF; a script cut the quadrants and checked no opaque
pixel touched a quadrant edge. Grid 1 had `public/icons/ui.png` attached; grids 2–6 had grid 1 attached.

**Grid 1 prompt** (T-ICON adapted to a grid)

```
Create an image. The attached sheet is the existing icon set of my mobile strategy game; the new icons must match it exactly in style. ROLE: four game icons for a mobile strategy game menu, one of a set; each must read at 24 pixels. LAYOUT: a 2x2 grid of four separate icons, one centred in each quarter of the square image, each filling about 80 percent of its quarter, with a wide empty gap between them; no icon touches or overlaps another or the image edge. SUBJECTS (each a single object): top-left: {TL}; top-right: {TR}; bottom-left: {BL}; bottom-right: {BR}. STYLE: a painted icon with a heavy dark-brown outline (#2a1a12) of even weight around the whole silhouette, three-quarter view, light from the upper left, warm materials (bronze #b08a3a, wood, cloth, stone), soft painted shading, slightly chunky proportions. BACKGROUND: a perfectly flat solid #FF00FF magenta background, edge to edge, with no shadow, no gradient, no glow and no ground plane; no magenta anywhere inside the objects. EXCLUDE: text, letters, numbers, a frame, a badge or a circle behind an object, grid lines, more than one object per quarter. ASPECT: square 1:1, highest resolution available.
```

**Family prompt, grids 2–6**

```
Create a NEW image, not an edit of the reference. Match the attached reference exactly in style: the same heavy dark-brown outline (#2a1a12) of even weight, the same soft painted shading, light from the upper left, slightly chunky proportions, three-quarter view, warm materials (bronze #b08a3a, wood, cloth, stone), the same perfectly flat solid #FF00FF magenta background edge to edge, and the same 2x2 layout: one icon centred in each quarter, each filling about 80 percent of its quarter, wide empty gaps, nothing touching another icon or the image edge. ROLE: four more game icons for the same set{ROLE EXTRA}; each must read at 24 pixels. SUBJECTS (each a single object): top-left: {TL}; top-right: {TR}; bottom-left: {BL}; bottom-right: {BR}. EXCLUDE: text, letters, numbers, a frame, a badge, a disc or a circle behind an object, grid lines, shadows or glow on the background, more than one object per quarter{, blood}{, modern tools}; no magenta inside the objects. ASPECT: square 1:1, highest resolution available.
```

ROLE EXTRA: grid 3 ", emblems of four enemy battle styles"; grid 5 "ability icons … (special moves of ancient
soldiers)"; grid 6 "(ancient Mediterranean, 4th century BC)".

| Grid | Pos | ART | Frame | SUBJECT as sent | Result |
| --- | --- | --- | --- | --- | --- |
| 1 | TL | 049 | `ui:helmet` | a bronze Corinthian helmet with a tall red horsehair crest | Seed; promoted (in `ui.png`) |
| 1 | TR | 050 | `ui:chest` | a closed wooden chest with bronze bands | Promoted (in `ui.png`) |
| 1 | BL | 051 | `ui:tent` | a canvas army tent with a small pennant on its pole | Promoted (in `ui.png`) |
| 1 | BR | 048 | `ui:arena` | a round stone arena seen from outside, tiers of arches, two small pennants on top | Promoted (in `ui.png`) |
| 2 | TL | 044 | `ui:book` | a closed thick leather-bound book (a codex), dark red-brown leather cover, bronze corner caps and a bronze clasp | **Promoted** (AS-07) |
| 2 | TR | 045 | `ui:banner` | a red cloth war banner hanging from a short crossbar on a wooden pole, a round bronze disc on top of the pole | **Promoted** (AS-07) |
| 2 | BL | 046 | `ui:war` | two crossed spears behind a crested Corinthian helmet, all in one engraved bronze relief, monochrome bronze, no red | **Promoted** (AS-07) |
| 2 | BR | 047 | `ui:season` | an hourglass with a bronze frame and golden sand, wreathed by a green laurel wreath | **Promoted** (AS-07) |
| 3 | TL | 057 | `ui:doctrine_steady` | a tortoise with a high domed shell plated like bronze scales, walking steadily, head forward | Promoted (CDX-01) |
| 3 | TR | 058 | `ui:doctrine_rush` | a ram's head with heavy curled horns, lowered as if to butt | Promoted (CDX-01) |
| 3 | BL | 059 | `ui:doctrine_hammer` | a heavy war hammer with a long wooden haft, a leather-wrapped grip and a blunt bronze head with a spike on the back, shown diagonally | Promoted (CDX-01) |
| 3 | BR | 060 | `ui:doctrine_swarm` | a single large striped hornet in amber and dark brown with spread translucent wings and a visible sting | Promoted (CDX-01) |
| 4 | TL | 061 | `ui:doctrine_fury` | a roaring lion's head, mouth wide open with fangs, a wild mane of flame-like red and gold locks | Promoted (CDX-01) |
| 4 | TR | 069 | `ui:standard` | an ancient army standard: a vertical wooden pole with a short bronze crossbar near the top, topped by a large bronze sixteen-ray sunburst disc, two short purple ribbons, NO cloth flag | **Promoted** (AS-07) |
| 4 | BL | 070 | `ui:works` | an iron-shod wooden digging spade crossed in an X with a sharpened wooden stake | **Rejected**: modern D-grip and steel shaft |
| 4 | BR | 071 | `ui:captain` | a tall curved transverse horsehair helmet crest, bright red, on its curved bronze crest holder, the crest alone with NO helmet | **Promoted** (AS-07) |
| 5 | TL | 062 | `ui:push` | the iron heads of two long pikes held level side by side, driving into the bronze rim of a round enemy shield that tilts backwards | **Promoted** (AS-07) |
| 5 | TR | 063 | `ui:bond` | two muscular forearms in bronze bracers, hands firmly clasped at the wrist | **Promoted** (AS-07) |
| 5 | BL | 064 | `ui:warcry` | the head of a bearded Celtic warrior in side profile with pale limed spiky hair, mouth wide open shouting, three curved bronze sound strokes | **Promoted** (AS-07) |
| 5 | BR | 065 | `ui:sunder` | a long inward-curved iron falx blade with a wooden grip, splitting a round wooden shield that cracks in two | **Promoted** (AS-07) |
| 6 | TL | 066 | `ui:aimed` | a short recurved composite bow drawn taut, with three arrows nocked together on the string, pointing to the upper right | **Promoted** (AS-07) |
| 6 | TR | 067 | `ui:recharge` | the head and neck of a brown war horse with a bronze forehead plate, turning sharply, encircled by a thick curved bronze U-turn arrow | **Promoted** (AS-07) |
| 6 | BL | 068 | `ui:scythe` | a spoked wooden chariot wheel with a bronze rim and a long curved iron scythe blade sticking out from its hub | **Promoted** (AS-07) |
| 6 | BR | 070 | `ui:works` | a simple ancient wooden spade with a plain straight wooden handle (no D-grip, no metal handle) and a flat iron-edged blade, crossed in an X with a sharpened wooden stake | **Promoted** (AS-07) |

All 14 staged icons shipped in AS-07 (reused, not regenerated; `STAGED_ICONS` is empty).
**Lessons:** check every new subject against the existing atlas so no glyph repeats a reserved meaning (the bull
head, Gorgon, red roaring face, horn, stake fence and sun disc were avoided). Dark-outlined icons vanish on
dark stone (2–53% of pixels at 3:1 on `stone2`): the chrome must give them a light ground.

---

## 5. Frescoes and splash key art (AS-04)

**Seed prompt** (`fresco_campaign` #1, `bust_hoplite` attached; T-STYLE + T-FRESCO, composition tightened to a
3.4:1 band)

```
Create a NEW image, not an edit of the reference. The attached portrait is from the same mobile strategy game: match its painting style, palette, brushwork and lighting exactly, but this is a wide landscape scene, not a portrait. ROLE: a wide banner illustration for a mobile game menu, shown inside a bronze frame. STYLE: ancient Mediterranean fresco painting on lime plaster: earth pigments (yellow ochre, red ochre, burnt umber, terre verte, a little Egyptian blue), visible confident brushwork, subtle fine craquelure, soft painted edges, warm and slightly desaturated, no pure black and no pure white. Light from the upper left, shadows to the lower right. Clear value contrast on the subject so it reads at small phone size. Hand-painted illustration, not a photo, not a 3D render, not glossy digital art, not anime, not comic ink. SUBJECT: a column of Greek hoplites marching along a sandy beach at dawn, seen from the side, bronze Corinthian helmets with red crests, red cloaks, round bronze shields, spears upright; two or three warships with oars drawn up on the beach behind them; low green hills in the distance; the early sun low on the left over a calm sea. COMPOSITION: a horizontal frieze in registers like a Greek wall painting: the march runs along one band across the centre of the image; keep every head, crest, shield and spear tip inside the central horizontal band (from 30 to 70 percent of the height), so the image survives a crop to a strip 3.4 times wider than tall; calm pale dawn sky at the top and plain sand at the bottom; 5 to 7 figures, all fully inside the frame, none cut by the left or right edge. PALETTE ANCHORS: warm plaster cream #e7d6ad, ochre, terracotta #a8432c, bronze #b08a3a, sea teal-blue. EXCLUDE: any text, letters, numbers, runes, signatures, watermarks, logos, UI, borders or frames around the image, modern objects, extra limbs, duplicated figures, cropped heads, blood. ASPECT: very wide landscape, 21:9 or the widest available, highest resolution available.
```

**Fresco family prompt (seed #2 attached): F + SUBJECT + LIGHT + COMPOSITION + G**

```
F: Create a NEW image, not an edit of the reference. Match the attached reference banner exactly in style, palette, brushwork, fine craquelure and full-bleed framing (no border); change only the subject, the light and the composition as stated. It is one of a matching set of wide banner paintings for a mobile strategy game set in the ancient Mediterranean, 4th century BC. STYLE: ancient Mediterranean fresco painting on lime plaster: earth pigments (yellow ochre, red ochre, burnt umber, terre verte, a little Egyptian blue), visible confident brushwork, subtle fine craquelure, soft painted edges, warm and slightly desaturated, no pure black and no pure white; clear value contrast on the subject so it reads at small phone size. Hand-painted illustration, not a photo, not a 3D render, not glossy digital art.
G: EXCLUDE: any text, letters, numbers, runes, symbols on shields, signatures, watermarks, logos, UI, borders or frames around the image, modern objects, extra limbs, duplicated figures, cropped heads, blood. ASPECT: very wide landscape, 21:9 or the widest available, highest resolution available.
```

COMPOSITION for thin strips (ladder, arena 6:1; shop 7.8:1), as recorded: "this banner will be cropped to a very
thin strip six [almost eight] times wider than tall … every [figure, torch, the goods, the merchant's head]
between 35 and 65 percent of the image height; plain sky above and plain ground below; nothing important at the
far left or right edges".

| # | ART | File | SUBJECT / LIGHT as sent (short form) | Result | Why |
| --- | --- | --- | --- | --- | --- |
| 1 | 001 | fresco_campaign | the seed prompt above | **Rejected** | A carved frame painted round the picture; a lambda (Λ) on every shield; the column ran off the right edge |
| 2 | 001 | fresco_campaign | "same subject … fixing four problems": no frame, full-bleed; column of 6 centred; plain bronze shields, NO lambda; heads to spear tips between 30 and 70% | Family seed, not shipped | Group right of centre; the 3.4:1 crop cut the 6th man |
| 3 | 001 | fresco_campaign | EDIT of #2: "make the six hoplites about 25 percent smaller, move the whole column to the horizontal centre … more sky above … keep everything else identical" | **Promoted** | Gemini dropped a man instead of shrinking (5, still in range); `--ax 0.6` |
| 4 | 002 | fresco_ladder | a broad stepped stone tower of five terraces like a low ziggurat, a torch on each terrace, four or five small Greek warriors climbing the central stair; torchlit dusk, violet-blue sky, orange torch pools | Kept, staged | |
| 5 | 003 | fresco_arena | stone arena, crowd on the tiers, pennants; a Greek hoplite (red crest, red cloak, bronze shield) and a Celtic swordsman (iron helmet, checked green cloak, oval shield, long sword) face each other; torchlit dusk | **Promoted** | `--ay 0.44` keeps the crest in the strip |
| 6 | 004 | fresco_shop | agora stall under a long cream and terracotta striped awning; amphorae, bronze helmets, shields, spearheads, bowls; one bearded merchant; stoa columns; warm afternoon | **Promoted** | A lambda on one shield lies outside the shipped crop (`--ay 0.56`) |
| 7 | 005 | fresco_war | a walled Greek hill town with a temple in the centre; two rival camps on the plain, red banners left, dark blue banners right, plain cloth; grey smoke of camp fires; overcast, smoky, cooler light | **Promoted** | Plain banners, no fighting |
| 14 | 056 | splash_keyart | T-SPLASH via the fresco family prompt: a front rank of about seven hoplites with locked plain bronze shields and levelled spears, more ranks behind, beach at dawn, seen from low; beached warships; a white Doric temple on a headland; top third empty sky; key figures in the central 60% of the width; NO lambda | **Promoted** (quality 62 for the budget) | Sky top third free for the code-set logo |

**Lessons:** Gemini adds Greek letters to shields and paints a frame round "a banner" unless both are excluded
by name. Ask for the crop band in percentages of the height. Fix a composition with an edit of the nearly-right
render ("keep everything else identical") rather than a new render.

---

## 6. Settlement vignettes (AS-04)

Seed `vignette_town_greek` = T-STYLE + T-VIGNETTE with the fresco seed attached; then attached to the other five.

**Vignette family prompt** (as recorded; the log elides the middle with "…")

> Create a NEW image, not an edit of the reference. Match the attached reference settlement view exactly in style, palette, brushwork, fine craquelure, full-bleed framing (no border), viewpoint, distance, warm afternoon light from the upper left and the same horizontal bands (sky in the top quarter, the settlement across the middle third, ground and path in the lower quarter); change only the settlement as stated. … SUBJECT: {below}; seen from a low hill at a slight distance, no people in the foreground; 3 to 5 readable landmarks. The village centred, nothing important at the left and right edges. EXCLUDE: any text, letters, numbers, runes, inscriptions, signs, signatures, watermarks, logos, UI, borders or frames around the image, modern objects, {culture extras}, people in the foreground. ASPECT: landscape 21:9 or the widest available, highest resolution available.

Villages add "NOT a walled town … no fortifications, no towers, no gate" so a village never reads as a town.

| # | ART | File | SUBJECT as sent (short form) | Result |
| --- | --- | --- | --- | --- |
| 8 | 006 | vignette_town_greek | walled Hellenic town: whitewashed walls, gate, square towers, terracotta roofs, small Doric temple on the top, olives (fresco seed attached) | Seed; **promoted** (SET-01) |
| 9 | 007 | vignette_town_phoenician | walled Punic harbour town: ochre mudbrick walls and towers, flat-roofed ochre and white houses, date palms, round harbour with two ships under purple awnings; EXCLUDE adds domes, minarets | **Promoted** |
| 10 | 008 | vignette_town_celtic | Galatian hill town: palisade of sharpened logs with a wooden gate tower, round houses with conical thatch, roof smoke, oak woods; EXCLUDE adds stone castles | **Promoted** |
| 11 | 009 | vignette_village_greek | small Hellenic farming village, NOT walled: about eight whitewashed farmhouses with terracotta roofs and courtyards, a tiny four-column Doric shrine, olives, a threshing floor, grain fields, dry-stone field walls | **Promoted** |
| 12 | 010 | vignette_village_phoenician | small Punic farming and fishing village, NOT walled: about seven flat-roofed ochre mudbrick houses on the shore, palms, irrigated gardens, a cove with two small boats under purple awnings | **Promoted** |
| 13 | 011 | vignette_village_celtic | small Galatian village in a forest clearing, NOT a hill fort: five or six round thatched houses, smoke from one roof, a wattle cattle pen, a small grain field, a short partial stake fence, big oaks | **Promoted** |

Culture extras to exclude: domes and minarets (Punic), stone castles (Celtic). Architecture by culture is in the
art bible §6.

---

## 7. Beast plates and reward cutouts (AS-05)

**Hydra seed prompt** (`bust_bear` attached)

```
Create a NEW image, not an edit of the reference. The attached animal portrait is from the same mobile strategy game: match its painting style, palette, brushwork, warm umber background and lighting exactly, but this is a full creature plate, not a head-and-shoulders portrait. ROLE: a bestiary plate for a codex in a mobile game, in the manner of a painted tomb fresco or a vase painting: the monster alone, dramatic. STYLE: [T-STYLE, word for word]. SUBJECT: the Lernaean Hydra rising from a swamp: a heavy dark teal-green scaled body with a pale belly and a row of short spines along the back, four short splayed clawed legs half in the water, and exactly FIVE serpent heads on long curving necks rising from the front of the body, fanning out; each head wedge-shaped with a small bony frill, yellow eyes and bared fangs; a coiling tail behind. COMPOSITION: the whole creature centred and filling about 80 percent of the square frame, all five heads fully inside the frame with space above them; one simple ground cue: dark swamp water with a few reeds; a strong silhouette against the background. BACKGROUND: dark warm umber to deep red-brown, a warm key light from the upper left on the creature, chiaroscuro. EXCLUDE: any text, letters, numbers, runes, signatures, watermarks, logos, UI, borders or frames around the image, people, modern objects, extra legs, more or fewer than five heads, heads cut by the frame, blood. ASPECT: square 1:1, highest resolution available.
```

**Plate family prompt (hydra seed attached): F + SUBJECT + COMPOSITION + G**

```
F: Create a NEW image, not an edit of the reference. Match the attached reference bestiary plate exactly in style, palette, brushwork, fine craquelure, dark warm umber to red-brown background, warm key light from the upper left, chiaroscuro and full-bleed framing (no border); change only the creature and its ground cue. It is one of a matching set of bestiary plates for a codex in a mobile strategy game set in the ancient Mediterranean: the monster alone, dramatic, in the manner of a painted tomb fresco. STYLE: ancient Mediterranean fresco painting on lime plaster: earth pigments, visible confident brushwork, soft painted edges, warm and slightly desaturated, no pure black and no pure white; clear value contrast so it reads at small phone size. Hand-painted illustration, not a photo, not a 3D render.
COMPOSITION: the whole creature centred and filling about 80 percent of the square frame, {the parts that must stay} fully inside the frame; one simple ground cue: {GROUND}; a strong silhouette against the background.
G: EXCLUDE: any text, letters, numbers, runes, signatures, watermarks, logos, UI, borders or frames, people, modern objects, extra limbs, extra heads, duplicated creatures, parts cut by the frame, blood{, extras}. ASPECT: square 1:1, highest resolution available.
```

Each SUBJECT was written from the manifest row **and** the in-game model in `src/art/beastArt.ts` (colours,
props, part counts) and the hint text in `src/i18n/beasts.en.ts`, so the plate and the battle figure agree.

| # | ART | File | SUBJECT as sent (short form) | Result |
| --- | --- | --- | --- | --- |
| 1 | 036 | plate_hydra | seed prompt above | Seed; **promoted** (CDX-01) |
| 2 | 037 | plate_cyclops | a one-eyed Cyclops lifting a huge grey boulder overhead with both hands: tan skin, ONE eye under a heavy brow, wild dark hair, short dark beard, a small stubby horn, a shaggy fur pelt over one shoulder, leather belt, fur loincloth; a knotted wooden club at his feet | **Promoted** |
| 3 | 038 | plate_harpies | exactly three harpies diving, wings swept back, talons out: gaunt grey-skinned woman's heads and shoulders, chest in dark feathers, wild black hair, screaming mouths, glowing pale eyes; ragged dark grey-violet wings instead of arms; bird legs with long curved bronze talons; a jagged rocky crag below | **Promoted** (three read at 32 px; the game's flock is six) |
| 4 | 039 | plate_nemean_lion | the Nemean Lion crouched to pounce, facing left: glinting golden metallic hide, massive dark ochre-brown mane, golden eyes, fangs, claws out, dark tail tuft; two snapped arrows on the rocks, bounced off its hide | **Promoted** |
| 5 | 040 | plate_minotaur | the Minotaur charging left, head lowered, horns first: dark brown bull hide, shaggy hump, bronze nose ring, wide ivory horns; plain leather kilt, bronze bracers; a double-headed bronze labrys on a long haft | **Promoted** |
| 6 | 041 | plate_chimera | the Chimera facing left breathing a cone of orange fire: tawny lion body, dark mane, scorched streaks on the flanks; a grey-brown goat head with curved ivory horns rising from the back; a green scaled serpent tail arcing over with the snake head at the tip; exactly three heads, four legs, no wings | **Promoted** |
| 7 | 042 | plate_kraken | the Kraken rising from a stormy sea at the edge of a sandy beach: dark wine-red and maroon, a tapering dome mantle out of white surf, two pale yellow eyes, a hooked dark beak; exactly six sucker-lined tentacles, two slamming onto the sand; wet sand foreground | **Promoted** |
| 8 | 043 | plate_titan | a Titan hurling two boulders, one raised in each hand: a massive body of grey weathered stone with glowing orange molten cracks, bronze shoulder plates and a wide bronze belt, glowing eyes, a crown of bronze spikes, a stern bearded stone face | **Promoted** (belt plate a little modern; regeneration candidate) |

**Cutout prompts** (recorded in prose, not word for word):

- `chest_closed`: "Create a NEW image … Use the attached painting ONLY as the style reference for the brushwork, the warm earth
  palette and the light from the upper left; do NOT copy its dark background or its creature" + T-STYLE (without
  background) + T-CUTOUT with the SUBJECT, "three-quarter front view from slightly above", BACKGROUND "perfectly
  flat solid #FF00FF … no shadow, no cast shadow, no gradient, no glow, no vignette, no texture and no floor; no
  magenta or pink anywhere inside the chest"; EXCLUDE adds coins, other objects, a table or ground.
- Open chests: "Edit the attached chest image. Change only: {what}. Keep everything else identical: the same
  chest, the same oak planks, bronze bands, rivets and lion-head lock plate with its ring, the same three-quarter
  view, the same size and position in the frame, the same colours, painted style and light from the upper left"
  + the same BACKGROUND.
- Laurel: T-CUTOUT, portrait 3:4, "it must read at 26 by 36 pixels", EXCLUDE ribbons, berries, a full wreath, a
  second branch.

| # | ART | File | SUBJECT as sent (short form) | Result |
| --- | --- | --- | --- | --- |
| 9 | 052 | chest_closed | a closed treasure chest of dark warm oak planks, slightly domed lid, three broad bronze bands, bronze corner plates with rivets, a bronze lion-head lock plate with a ring in its mouth; lid shut | Cutout seed; staged |
| 10 | 053 | chest_open_empty | EDIT of #9: lid open, swung back and standing behind; empty inside, bare dark floor and walls in shadow | **Promoted** (RES-01; re-encoded 134 → 61 KB) |
| 11 | 054 | chest_open_full | EDIT of #10: heaped above the rim with plain blank gold coins, a few spilling over the front edge; no coins on the background | Staged |
| 12 | 055 | laurel_branch | a single gilded laurel branch: stem from the bottom, bowing out to the LEFT, tip curling to the upper right (the left half of a victor's wreath); 9 to 11 pairs of pointed gilded leaves; portrait 3:4 | **Promoted**, after flipping (Gemini drew it bowing right) |

---

## 8. World pixel sprites (AS-06)

All in one chat. The first prompt had `ref/ingame_sprites_x4.png` attached: real in-game sprites (two men, both
group standards, a base plate, a boulder, a tree) captured from the running game and magnified 4x nearest.

**Seed prompt** (stakes #1)

```
Create an image. ROLE: a pixel-art game sprite for an isometric ancient-Mediterranean tactics game. The attached picture shows sprites already in the game (a hoplite, a skirmisher, two army standards, a unit base, a boulder, a tree) magnified 4 times: match their pixel density, palette, soft sel-out outlines and light from the upper left exactly. SUBJECT: one segment of a field-works line of sharpened wooden STAKES (a chevaux-de-frise row): five or six rough pale-wood poles with dark-brown pointed tips, driven into the ground at a 45 degree slant, all leaning the same way toward the upper right, set in a single row that runs diagonally from the upper left to the lower right like the edge of a 2:1 isometric diamond tile; a little turned dark earth at their feet. PIXEL GRID: true pixel art. The whole sprite is about 36 art pixels wide and 24 art pixels tall, and every art pixel is drawn as one clean, equal, square block of solid colour (very large chunky pixels, about 24 by 24 screen pixels each), aligned to one grid; hard edges; no anti-aliasing, no blur, no gradients, no dithering noise, no sub-pixel detail, no thin lines finer than one block. PALETTE: only these colours: #2a1a12 #442618 #5e2427 #7b503d #a87464 #9c8b78 #d6c0a8 #e8e2d4 #5a4a44 #836c65 #ac9283 #d2b68e #6a4a1e #b08a3a #5b3f2a #765d35 #9a8f3b #bba96a #4a5a2e. STYLE: a selective coloured outline (a darker shade of the local colour, never black), 3 to 4 step ramps, light from the upper left. BACKGROUND: a perfectly flat solid #FF00FF magenta background, edge to edge, with no shadow, no grass and no ground plane beyond the small patch of earth; the sprite centred. EXCLUDE: text, a frame, a grid overlay, several sprites, soldiers, a scene, a cast shadow on the magenta.
```

**Follow-up pattern** (every later prompt, same chat): "Next sprite of the same set, same big cells (one flat
colour each), same palette and light from the upper left, flat #FF00FF magenta background" + SUBJECT + a size
**relative to an approved sprite** ("about half as wide as the wagon and a little taller") or a cell count +
"No text, no anti-aliasing, no gradients, no detail smaller than one cell". Relative sizes worked better than
cell counts.

| # | ART | File | Prompt (short form, as recorded) | Grid → art px | Result |
| --- | --- | --- | --- | --- | --- |
| 1 | 072 | tile_stakes | seed prompt above | no grid (~130 px wide) | **Rejected**: crossed X stakes, horizontal row, far too fine |
| 2 | 072 | tile_stakes | "MUCH lower resolution… a grid of exactly 48 columns by 32 rows… three or four stakes, each 2 cells thick… diagonal row" | 34 → 50x44 | **Rejected**: taller than a man |
| 3 | 072 | tile_stakes | "even smaller and chunkier… 24 columns by 16 rows… FOUR stakes… 2 cells thick, 6 to 8 long… 2-cell point" | 68 → 27x18 | Family seed; **promoted** |
| 4 | 073 | tile_ditch | "a flat diamond-shaped patch (2:1 floor tile) about 24x12… a narrow trench… far bank lit, near bank shaded, spoil ridge" | 68 → 34x20 | **Rejected**: dark outline reads as a pasted tile |
| 5 | 073 | tile_ditch | "only the trench itself… a band 3 to 4 cells wide… 2 across per 1 down… about 24 columns long" | 68 → 35x22 | **Rejected**: reads as a log |
| 6 | 073 | tile_ditch | "back to the diamond ditch… exactly twice as wide as tall… NO dark outline… trench a 3-cell band of #2a1a12… 1-cell lit lip, 1-cell spoil ridge" | 68 → 32x20 | **Promoted** |
| 7 | 074 | tile_laager | "one WAGON of a wagon laager… two-axle farm wagon with high plank sides… four disc wheels… rolled hide… about 24x18 cells" | 30 → 72x53 | **Rejected**: one row too tall |
| 8 | 074 | tile_laager | "cells twice as big… only about 37 cells wide… long side upper left to lower right, two big disc wheels, plank sides 3 to 4 planks high" | 34 → 62x46 | **Promoted** |
| 9 | 075 | tile_palisade | "same cell size as this last wagon… six to seven upright rough logs… sharpened… one rope band… stepping down along the iso slope… HALF as wide as the wagon and a little TALLER" | 48 → 33x48 | **Promoted** |
| 10 | 076 | tile_rampart | "earthen RAMPART… low long mound… flat walkway… lit upper face, shaded front face… turf tufts… one third of the palisade's height" | 48 → 36x32 | **Rejected**: reads as a box |
| 11 | 076 | tile_rampart | "Use the footprint of the approved ditch diamond: an isometric earth BLOCK… top face a flat 2:1 diamond… raised only 4 cells… lower-left face mid earth, lower-right shaded… ragged top edges" | 60 → 36x24 | **Promoted** |
| 12 | 077 | crest_captain | (first try came back empty) "a very small pixel-art icon… about 12 cells wide and 12 tall… the red horsehair crest… arched red brush on a curved bronze holder" | 64 → 24x24 | **Rejected → code-drawn** |
| 13 | 078 | crest_standard | "the army STANDARD… pole, crossbar, bronze sun disc, red square banner with a fringe and a cream stripe, two ribbons… 14 cells wide and 44 tall" | ~42 → 21x82 | **Rejected** |
| 14 | 078 | crest_standard | "cells TWICE as big… only 8 cells wide (plus 3 for ribbons) and 22 tall… disc 4 cells, banner 5x6" | ~24 → 32x117 | **Rejected → code-drawn** |

**Lessons:** tell Gemini the image is "a grid of N columns by M rows of big square cells, each one flat
colour"; expect it to overshoot the count; process with an explicit `--grid n` read from the image; anything
under ~16 art px is faster to draw in code.

---

## 9. UI frames and chrome

No raster frame was generated in v5: the chrome stayed procedural (art bible §7.1). The T-FRAME template above
and `nineslice.mjs` are ready if a later story needs one. The v4 brief's frame and button specs are in §11.

## 10. Nikias (ART-033..035): queued in AS-07, sent in AS-08

Subjects from the manifest (T-BUST; frames 2 and 3 are edits of frame 1, only the mouth or eyes change):

| ART | File | Subject |
| --- | --- | --- |
| 033 | portrait_nikias.jpg (384x384) | Nikias, an old Greek strategos, white beard, bronze Corinthian helmet pushed up on the head, red cloak; mouth closed, eyes open |
| 034 | portrait_nikias_talk.jpg | … mouth open mid-word |
| 035 | portrait_nikias_blink.jpg | … eyes closed |

**AS-07 (2026-10-13):** written and queued, not sent (Chrome was not connected). **AS-08 (2026-10-13):** sent in one
chat, `seed_hoplite.jpg` (the 1024 px `bust_hoplite` raw) attached to #1, the approved frame 1 attached to the two
edits. Four renders, three shipped; OI-7 (edit drift) did not happen. Details in
[docs/v5/ASSET_LOG.md](../v5/ASSET_LOG.md) › AS-08.

| # | Prompt | Outcome |
| --- | --- | --- |
| 1 | family opening line + T-STYLE + T-BUST, the manifest SUBJECT (block 1) | **Rejected:** the helmet was worn down over the face and a shield rim added; it read as the hoplite class bust |
| 2 | same-chat fix (block 2) | **Accepted**, frame 1 (`portrait_nikias`) |
| 3 | edit of frame 1, the mouth (block 3) | **Accepted** (`portrait_nikias_talk`); only the mouth changed |
| 4 | edit of frame 1, the eyes (block 4) | **Accepted** (`portrait_nikias_blink`); only the eyes changed |

**Lesson:** "helmet pushed up on the head" alone is read as a helmet worn normally. Say what shows: "resting high on
the crown like a cap, the whole face uncovered, the empty eye holes above the forehead". A prop not asked for (the
shield) came from the hoplite seed; exclude it by name.

```
Create a NEW image, not an edit of the reference. Match the attached reference exactly in style, palette, brushwork, lighting, background and framing; change only the subject. STYLE: ancient Mediterranean fresco painting on lime plaster: earth pigments (yellow ochre, red ochre, burnt umber, terre verte, a little Egyptian blue), visible confident brushwork, subtle fine craquelure, soft painted edges, warm and slightly desaturated, no pure black and no pure white. Light from the upper left, shadows to the lower right. Clear value contrast on the subject so it reads at small phone size. Hand-painted illustration, not a photo, not a 3D render, not glossy digital art, not anime, not comic ink. EXCLUDE: any text, letters, numbers, runes, signatures, watermarks, logos, UI, borders or frames around the image, modern objects, extra limbs, duplicated figures, cropped heads. ROLE: a character portrait for a small round or square portrait frame in a mobile strategy game; it must be recognisable at 40 pixels. SUBJECT: Nikias, an old Greek strategos, white beard, bronze Corinthian helmet pushed up on the head, red cloak; mouth closed, eyes open. FRAMING: head and shoulders, front three-quarter view, the figure turned slightly to the viewer's left, eyes on the upper third of the image, the top of the head or crest 6 to 10 percent below the top edge, chin at about 60 percent of the height, shoulders cut by the bottom edge; the whole face and headgear inside the central circle of the image. The headgear silhouette and the one listed prop are the clearest, most contrasting shapes. BACKGROUND: plain dark warm umber (#26211b to #342d25), a soft lighter glow behind the head, no scenery. EXPRESSION: composed, alert, mouth closed. ASPECT: square 1:1, highest resolution available.
```

```
Create a NEW image with the same prompt, but fix the helmet: the bronze Corinthian helmet is PUSHED UP and tilted back on top of his head, resting high on the crown like a cap, so his WHOLE face is uncovered: forehead, eyes, cheeks, white hair at the temples and the full white beard are all visible; the helmet's empty eye holes and cheek guards sit above his forehead. No shield: only the red cloak, pinned at the shoulder. Keep everything else from the first prompt: the fresco style matching the attached reference, the framing, the plain dark warm umber background with its soft glow, mouth closed, eyes open. EXCLUDE: any text, letters, numbers, signatures, watermarks, borders or frames around the image, a shield. ASPECT: square 1:1, highest resolution available.
```

```
Edit the attached Nikias portrait. Change only: his mouth, now open mid-word as if speaking, the lower teeth just hidden by the beard. Keep everything else identical: the same face, white beard, bronze Corinthian helmet pushed up on the head, red cloak, pose, framing, size and position in the frame, plain dark warm umber background with its soft glow, colours, painted fresco style and light from the upper left. EXCLUDE: any text, letters, numbers, signatures, watermarks, borders or frames around the image. ASPECT: square 1:1, highest resolution available.
```

```
Edit the attached Nikias portrait. Change only: his eyes, now closed in a blink, the eyelids relaxed. Keep everything else identical: the same face, white beard, closed mouth, bronze Corinthian helmet pushed up on the head, red cloak, pose, framing, size and position in the frame, plain dark warm umber background with its soft glow, colours, painted fresco style and light from the upper left. EXCLUDE: any text, letters, numbers, signatures, watermarks, borders or frames around the image. ASPECT: square 1:1, highest resolution available.
```

## 11. Before v5: the v4 brief

[docs/redesign/GEMINI_BRIEF.md](../redesign/GEMINI_BRIEF.md) (v4 "Mosaic & Parchment") is the earlier brief. Its
mockup prompt, sent with the current screenshot attached:

> Redesign this mobile game screen in the exact style of the attached reference (traditional antiquity, mosaic and parchment, carved stone frame with Greek-key border, parchment panels, terracotta primary button, bottom tab bar "Campaign, Duels, War, Codex, Shop" with War in the center and raised). Keep every piece of information and every action from the current screen. Use the same layout grid and the same component looks as the reference: profile card, plaque title, parchment cards, tile buttons. Real, readable English text only, no placeholder text. Pixel-art game sprites stay pixel art.

It also lists 16 text-free asset specs (frame, panel, basalt tile, three buttons, plaque, tiles, four banners,
Nikias, tab bar, selected tab, raised War tab), with the rule "no text, no letters; a flat #FF00FF background
wherever transparency is needed; front view, even lighting from the top-left; exact size". Results of that brief
were not logged. An early Campaign hub render of that period invented a "Quests" tile (the owner's memory note);
v5 replaced open-ended mockup prompts with allowlist prompts (§2).

## 12. App icon and mark (AS-08)

A new family, **T-MARK** (§1): one object in profile on a round red-figure disc with a Greek-key ring, on #FF00FF.
It is the app's own mark (browser tab, home screen, Telegram bot picture), not an in-game icon: it is not in the
atlas and does not take a `RESERVED_ICONS` meaning. `node scripts/art/appicons.mjs <raw>` builds every size from
the one render; the favicon sizes (16, 32, 48) use only the inner disc so the helmet still reads.

| # | Prompt | Outcome |
| --- | --- | --- |
| 5 | `Create an image.` + T-MARK with the helmet SUBJECT (below) | **Accepted** (`docs/v5/gemini/AS-08/app_mark_1.jpg`). The meander ring came out about 14% of the diameter, not 8%; harmless at 180 px and up, and the favicons crop it away |

```
Create an image. ROLE: the app icon and browser favicon of a mobile strategy game set in the ancient Mediterranean; it must read as one bold shape at 16 pixels and still look rich at 512 pixels. SUBJECT: a single bronze Corinthian hoplite helmet in side profile, facing the viewer's left, with a tall arched red horsehair crest; the eye opening is one clear dark almond shape; the helmet and crest together fill about 70 percent of the disc and are centred in it. DISC: a perfect circle of dark black-glaze umber (#2a1a12 to #3a2418), like the ground of a red-figure Greek vase, edged by a ring of terracotta (#a8432c) carrying a simple bold Greek key meander band in terracotta and warm cream (#e7d6ad), the band about 8 percent of the diameter wide; the helmet sits inside the ring and does not touch it. STYLE: painted like a red-figure Greek vase but with soft painted shading on the bronze: flat bold shapes, a heavy dark-brown outline (#2a1a12) of even weight around the helmet and crest, light from the upper left, bronze #b08a3a with warm highlights, warm earth colours, no pure black and no pure white, very few internal details; hand-painted, not a photo, not a 3D render, not glossy digital art, not anime. COMPOSITION: the disc centred, seen flat from the front, filling 94 percent of the square, nothing outside the disc. BACKGROUND: a perfectly flat solid #FF00FF magenta background outside the disc, edge to edge, with no shadow, no gradient and no glow; no magenta anywhere inside the disc. EXCLUDE: any text, letters, numbers, signatures, watermarks, a face or a person inside the helmet, spears, more than one object, tiny details, perspective, a drop shadow. ASPECT: square 1:1, highest resolution available.
```

## 13. PixelLab soldier sprites (I1 hoplite bake-off)

Not Gemini: the PixelLab MCP (`create_character`, `animate_character`), called by the agent. One prompt makes a
character in 8 directions; clips are made per direction. Full log, ids and the generation count:
[docs/v5/ASSET_LOG.md](../v5/ASSET_LOG.md) › I1. Tools: `scripts/art/pixellab/` (`fetch.mjs` download and unpack,
`build.mjs` strips + PA-WORLD snap + contact sheet + GIF, `sheet.mjs`, `measure.mjs`); preview `/hoplite-bakeoff.html`.

**Call settings** (every character): `mode: standard`, `n_directions: 8`, `outline: selective outline`,
`shading: basic shading`, `detail: medium detail`, `proportions: {"type": "preset", "name": "realistic_male"}`,
`size` 48 or 32, `view` `low top-down` or `high top-down`. The game uses 4 of the 8 directions: `south-east`,
`north-east`, `south-west`, `north-west` (paperdoll DIRS rows 0..3).

**P1**

```
ancient Greek hoplite soldier: bronze Corinthian helmet covering the face with a red horsehair crest, large round bronze aspis shield on the left arm, long wooden dory spear with a bronze tip held upright in the right hand, white linen linothorax armour, short red tunic skirt, bronze greaves on the shins, sandals
```

**P2** (the one that worked: the spear first and biggest)

```
ancient Greek hoplite soldier holding a very long wooden spear (dory) vertically in his right hand, the spear taller than the man with a bronze leaf tip above his head; big round bronze aspis shield on his left arm; bronze Corinthian helmet covering the face with a red horsehair crest; white linen linothorax body armour; short red tunic; bronze greaves; sandals
```

**P3**

```
ancient Greek hoplite: bronze muscle cuirass over a short red tunic, bronze greaves covering both shins, bronze Corinthian helmet covering the face with a red horsehair crest, big round bronze aspis shield on the left arm, very long wooden spear (dory) held vertically in the right hand, taller than the man, bronze leaf tip above his head, sandals
```

| # | Attempt | size, view | Prompt | Outcome |
| --- | --- | --- | --- | --- |
| 1 | A | 48, low | P1 | **Rejected:** spear missing in 6/8 views, all 4 game facings among them |
| 2 | A2 | 48, low | P2 | **Promoted** (variant A): spear 8/8; armour red not white, no greaves |
| 3 | A3 | 48, low | P3 | **Rejected:** spear missing SE, E, W |
| 4 | B | 48, high | P3 | **Rejected:** spear missing SE, E, NE, NW, W |
| 5 | C | 32, low | P3 | **Rejected:** spear missing SE; grey iron cuirass |
| 6 | D | 32, high | P3 | **Rejected:** spear missing SE, E, NE, NW, W |
| 7 | B2 | 48, high | P2 | **Rejected:** two spears in 5 views (invented) |
| 8 | C2 | 32, low | P2 | **Promoted** (variant C) |
| 9 | D2 | 32, high | P2 | **Promoted** (variant D) |
| 10 | B3 | 48, high | P2 | **Promoted** (variant B): spear in all 4 game facings |

**Walk:** template `walking-8-frames` on the 4 game facings (no prompt). **Attack, v3 custom** (`frame_count: 8`):

ATK1 (A2)

```
thrusting the long spear forward overarm at shoulder height while the round shield stays in front of the body, then pulling the spear back
```

ATK2 (B3, C2, D2)

```
overarm spear thrust: raises the long spear above the shoulder with the point forward, stabs it straight ahead in the direction he is facing, the round shield kept in front of the chest, then pulls the spear back; he keeps facing the same direction and holds the same spear and shield in every frame
```

**Mode comparison on D2:** template `lead-jab` (NE, SW) and skeleton-v3 `lead-jab` (all 4); no prompt (the clip
is the template's).

| # | Variant | Clip, mode | Outcome |
| --- | --- | --- | --- |
| 11 | A2 | walk, template | Kept: spear steady; no shield in SE, NE, NW |
| 12 | B3 | walk, template | Kept, flawed: SE shield pops in; NE shield becomes a white oval, then vanishes (invented) |
| 13 | C2 | walk, template | Kept, flawed: NE shield pops in; NW loses shield and spear for a frame |
| 14 | D2 | walk, template | Kept, flawed: SE a big black shield appears in frames 7–8 (invented) |
| 15 | A2 | attack, v3 ATK1 | Kept, flawed: SE turns to face south, spear across the body; SW fair |
| 16 | B3 | attack, v3 ATK2 | **Rejected:** facing drifts, the shield jumps and shrinks, a second shield appears in SW, spear double-ended in NW |
| 17 | C2 | attack, v3 ATK2 | Kept, flawed: shield holds; the spear always stabs to screen-left (wrong in SE, NE) |
| 18 | D2 | attack, v3 ATK2 | Kept, flawed: shield holds; spear becomes a double-ended staff (SE, NE, NW), vanishes in SW |
| 19 | D2 | attack, template lead-jab | SW steady but the spear never moves; NE loses the shield |
| 20 | D2 | attack, skeleton-v3 lead-jab | SW **the only correct thrust**; NE **rejected** (shield gone, ghost scraps); SE turns south; NW spear gone |

**Lessons:** in standard mode a held weapon survives the rotation only when the prompt opens with it and sizes it
("holding a very long … spear vertically …, taller than the man"); expect about half the characters to come back
with the spear lost or doubled, and check every one of the 8 views. Say the shield size too (every aspis came out a
third of the body). v3 custom clips invent the weapon's path (a lateral swing, a double-ended staff); template clips
hold identity but have no spear motions; skeleton-v3 holds identity best in front views and breaks in the back view.
Next time pose the thrust ourselves (`animate_with_skeleton_v3`, keypoints from the procedural rig) and check NE first.
Snap with a ramp-aware remap: the nearest-colour snap turns PixelLab bronze into the grey metal ramp.
