# Art prompt library

The reusable image prompts of v5 and v6 and the prompts behind shipped art, in compact form: one template per
family plus a table of what changed per asset. Gemini makes the painted art (§1–§12), PixelLab the soldier sprites
(§13–§20); the global war world prototypes are §21, its PixelLab tiles and objects §22–§24, biome libraries §25 on. How to run a job: [ART.md](ART.md). Rejected attempts are kept only where the lesson needs them. Where a
log kept only a short form of a prompt, the short form is quoted; nothing here is reconstructed.

Word-for-word sources still in the repo: `docs/v5/art/STYLE_LOCK.md` (the PixelLab style block),
`scripts/art/pixellab/i5a/prompts.mjs` (every I5a clip prompt), `docs/v5/pixellab/I5c/prompts.json` (every I5c clip
prompt by id), `docs/v5/pixellab/I5b/polish.prompts.json` (every polish job).

**Gemini settings.** gemini.google.com, "Pro" mode, typed prompts, aspect asked in the prompt. Outputs: 2048x2048
(square), 3168x1344 (wide), 1408x3040 or 1536x2752 (tall), always JPEG (even for magenta-key jobs).

---

## 1. Reusable building blocks

Build a prompt as **opening line + T-STYLE + template + SUBJECT + EXCLUDE + ASPECT**. Generate one family seed
first (busts `bust_hoplite`, plates `plate_hydra`, frescoes `fresco_campaign`, icons the first grid), then attach it
to the rest. Variants are edits of the approved base. Ask for the largest size; `process.mjs` refuses sources
smaller than the shipped size.

### Opening lines

| Use | Text |
| --- | --- |
| First of a new family | `Create an image.` |
| First of a new family, reference from another family | `Create a NEW image, not an edit of the reference. The attached portrait is from the same mobile strategy game: match its painting style, palette, brushwork and lighting exactly, but this is a wide landscape scene, not a portrait.` |
| Later members (seed attached) | `Create a NEW image, not an edit of the reference. Match the attached reference exactly in style, palette, brushwork, lighting, background and framing; change only the subject.` |
| Variant of an approved image | `Edit the attached {X} image. Change only: {what}. Keep everything else identical: {list what must not move}.` |
| Same-chat fix | `Create a NEW image with the same prompt, but fix {what}: … Keep everything else from the first prompt: …` |
| Same-chat pixel set | `Next sprite of the same set, same big cells (one flat colour each), same palette and light from the upper left, flat #FF00FF magenta background` |

### Suffixes

| Suffix | Text |
| --- | --- |
| No-text guard | `EXCLUDE: any text, letters, numbers, runes, signatures, watermarks, logos, UI, borders or frames around the image, modern objects, extra limbs, duplicated figures, cropped heads, blood.` |
| Shields without letters | `plain bronze shields, NO lambda`; in EXCLUDE `symbols on shields` |
| Magenta key | `BACKGROUND: a perfectly flat solid #FF00FF magenta background, edge to edge, with no shadow, no gradient, no glow and no ground plane; no magenta anywhere inside the object.` |
| Mockup honesty | `Nothing else on the screen: no quests, no mail, no energy, no level bar, no gems, no extra buttons` |
| Size | `ASPECT: square 1:1, highest resolution available.` / `ASPECT: very wide landscape, 21:9 or the widest available, highest resolution available.` |

### Templates

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

**T-BUST** (class busts `bust_*`, Nikias `portrait_nikias*`)

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
BACKGROUND: [magenta key]
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

**T-PIXEL** (Gemini world pixel sprites; see §8 for what actually worked)

```
ROLE: a pixel-art game sprite for an isometric ancient-Mediterranean tactics game.
SUBJECT: {SUBJECT}, {FACING, e.g. facing down-right in a 2:1 isometric view}.
PIXEL GRID: true pixel art on a {W}x{H} art-pixel canvas, drawn so that every art pixel is a clean square block of 8x8 screen pixels; hard edges; no anti-aliasing, no blur, no gradients, no dithering noise, no sub-pixel detail.
PALETTE: only these colours (PA-WORLD): {the 35 hex values of docs/v5/art/palette.json › world, space-separated}.
STYLE: a selective coloured outline (a darker shade of the local colour, never black), 3 to 4 step hue-shifted ramps (shadows toward red-purple, lights toward cream), light from the upper left, chunky-realistic proportions about 6 heads tall, team colour only on shields, crests and standards.
BACKGROUND: a perfectly flat solid #FF00FF magenta background, edge to edge, with no shadow, no ground and no base plate (the game draws those); feet on one line at the bottom.
EXCLUDE: text, a frame, several sprites, a scene.
```

**T-FRAME** (raster 9-slice chrome; never used, the chrome stayed procedural)

```
ROLE: a 9-slice UI frame for a mobile game, carved from {MATERIAL: dark stone with a gold-ochre Greek-key meander / aged bronze with rivets}.
LAYOUT: a rectangular frame {B} pixels thick on every side around an empty centre; ALL ornaments (rosettes, rivets, corner bosses) only in the four corners; the four edges carry a pattern that repeats seamlessly and is uniform along its length, with no stains or ornaments in the middle of an edge.
BACKGROUND: the centre and the outside are a perfectly flat solid #FF00FF magenta.
LIGHT: from the upper left: lit top-left bevels, shaded bottom-right bevels.
ASPECT: square 1:1, highest resolution available.
EXCLUDE: text, a picture in the centre, perspective.
```

**T-MARK** (the app icon and favicon mark, §10)

```
ROLE: the app icon and browser favicon of a mobile strategy game set in the ancient Mediterranean; it must read as one bold shape at 16 pixels and still look rich at 512 pixels.
SUBJECT: {SUBJECT: one object in side profile}; its one dark opening a single clear shape; the object fills about 70 percent of the disc and is centred in it.
DISC: a perfect circle of dark black-glaze umber (#2a1a12 to #3a2418), like the ground of a red-figure Greek vase, edged by a ring of terracotta (#a8432c) carrying a simple bold Greek key meander band in terracotta and warm cream (#e7d6ad), the band about 8 percent of the diameter wide; the object sits inside the ring and does not touch it.
STYLE: painted like a red-figure Greek vase but with soft painted shading on the bronze: flat bold shapes, a heavy dark-brown outline (#2a1a12) of even weight around the object, light from the upper left, bronze #b08a3a with warm highlights, warm earth colours, no pure black and no pure white, very few internal details; hand-painted, not a photo, not a 3D render, not glossy digital art, not anime.
COMPOSITION: the disc centred, seen flat from the front, filling 94 percent of the square, nothing outside the disc.
BACKGROUND: a perfectly flat solid #FF00FF magenta background outside the disc, edge to edge, with no shadow, no gradient and no glow; no magenta anywhere inside the disc.
EXCLUDE: any text, letters, numbers, signatures, watermarks, a face or a person, more than one object, tiny details, perspective, a drop shadow.
ASPECT: square 1:1, highest resolution available.
```

---

## 2. Screen mockups (AS-01)

Design references, not assets. Each prompt is an allowlist naming every element the screen may show. Attach a
reference screen; tool *Create image*, 9:16 (outputs 1536x2752). Direction A was picked (V5-047).

**Shared style block S** (top of every first prompt in a chat):

```
Mobile game screen mockup, tall portrait phone screen 390x844 (9:19.5), in the exact style of the attached reference image: traditional antiquity, mosaic and parchment. Dark warm basalt page (#16120f); a dark carved-stone frame with a gold-ochre Greek-key (meander) border and small round rosettes at the four corners framing the content; warm cream parchment panels (#e7d6ad, selected #f0e3c2, shaded #dcc394) with subtle fibres and a thin dark-brown inked edge; dark ink text (#3a2414). Titles, plaques, buttons and tab labels in Cinzel bold ALL CAPS; body text and every number in Inter medium, sentence case. Top bar: a dark stone strip with a centred glazed teal plaque (#1f4f52) with a gold rim. Bottom tab bar: dark teal-stone (#16333a) with a gold top rim, five slots with an engraved icon and a Cinzel label: CAMPAIGN (banner icon), DUELS (crossed swords), WAR (centre: a big round bronze shield medallion with an engraved crossed-spears glyph, rising above the bar, its WAR label inside the bar), CODEX (closed book), SHOP (market stall). The selected tab is a parchment block. Colour jobs: terracotta (#a8432c) only for the single primary button; aged bronze (#7d5b30) for other live controls; flat grey stone only for the disabled Camp tile; red only for the small count badge (with a cream ring). Painted illustrations sit inside frames, never behind text. Text large and crisp enough to read on a phone; buttons at least 44 px tall. Spell every string exactly as given and show no other text: no screen title heading under the top bar, no watermark.
```

**Screen prompt, example A1** (Campaign hub, the picked direction):

> [S] Screen: the Campaign hub, CAMPAIGN tab selected. From top to bottom inside the frame: (1) the top bar with the plaque "PIXELARROW" and a gear icon on the right; (2) a parchment profile card: a painted bust of a Greek strategos with a bronze helmet and red crest in a bronze-rimmed square at the left; at the right "STRATEGOS EPAMEINON" in Cinzel, then "Day 14 · in Rhegion · Lairs 2/6", then a coin icon "240 Gold", a trophy icon "3 Trophies", a men icon "Warband 9 Men"; (3) a parchment card titled "FIRST STEPS (2 OF 4)" with a 4-segment bar, two segments gold with check marks and two dark brown, and the line "Win a battle" centred under it; (4) a wide painted fresco in a dark bronze riveted frame: ancient Greek wall painting on cracked plaster, hoplites with round shields marching along a sunlit coast at dawn, ships on the sea; (5) one wide terracotta-red stone button with pointed chevron ends and a gold rim: "CONTINUE THE MARCH"; (6) three square carved stone tiles in a row with engraved bronze icons: "ARMY" (Corinthian helmet) with a small red square badge "2" at the top right, "STASH" (chest), and "CAMP" (tent) shown flat grey and faded as unavailable, with the small caption "Pitch camp on the map" under it; (7) the tab bar. Nothing else on the screen.

Add to every screen prompt: "nothing on the left" of the top bar; "directly under it, with no heading"; the honesty
suffix; for screens without a fresco "No fresco of soldiers on this screen". List screens drop rows that would not fit.
A second screen in the same chat opens "a NEW, separate image (not an edit): the same {screen} in exactly the same
style…".

**Lessons:** two rejects of eight: a "+4" drawn as a badge on a portrait (read as a level), and doctrine icons reusing
the War medallion's reserved crossed spears. Both were fixed by an edit naming the change ("its own small round
bronze disc after Nikias"; "Steady = shield-wall icon, Rush = spearhead with speed lines; locked rows faded").

---

## 3. Class and beast busts (AS-02)

Seed `bust_hoplite` = T-STYLE + T-BUST + "It shows a CLASS of soldier (a type), not a named hero" and "eyes looking
toward the viewer's left"; its 1024 px copy was attached to every later prompt.

**Family prompt:** `[later-members opening line] It is one of a matching set of soldier-CLASS portraits for a mobile
strategy game (a type of soldier, not a named hero). [T-STYLE] SUBJECT: {SUBJECT}. FRAMING (same as the reference):
[T-BUST framing]. BACKGROUND: the same plain dark warm umber with a soft lighter glow behind the head, no scenery.
EXPRESSION: composed, alert, mouth closed, eyes toward the viewer's left. ASPECT: square 1:1, highest resolution
available.` Beasts: "change the subject to an animal … a wild animal that fights as a unit (a type of animal, no
human)", EXCLUDE adds "people, collars, harness, armour, extra legs, two heads, duplicated animals, cropped ears{, or
tusks}", the head filling the upper two thirds, EXPRESSION {alert, watchful / alert, stubborn / menacing}. Extras:
fanatic EXCLUDE "blood", EXPRESSION "intense, mouth closed"; chariot EXCLUDE "horses, wheels"; sacred_band EXCLUDE
"anything red".

All 21 shipped. SUBJECT (short form; capitals as sent):

| File | SUBJECT |
| --- | --- |
| hoplite | Spartan hoplite, bronze Corinthian helmet, tall red transverse horsehair crest, red cloak, bronze rim of a round aspis at the shoulder |
| militia | levy farmer-soldier: brown felt cap (pilos), plain undyed ochre wool tunic, no armour, short wooden spear upright at his shoulder |
| thureophoros | plain conical bronze pilos helmet, no crest, blue-grey linen tunic, upper edge of a tall OVAL thureos, cream with a red pattern and a vertical spine |
| celt_sword | iron Montefortino helmet with top knob and cheek guards, long drooping moustache, bronze torc, green checked cloak over mail, hilt and upper blade of a long sword |
| rhomphaia | tall bronze Phrygian-style helmet curving forward, cheek guards, brown fox-fur cloak, the long curved rhomphaia blade over the shoulder; no shield |
| archer | Cretan: bare head, short dark curly hair, cream linen tunic, quiver strap, fletchings and bow tip above the shoulder |
| slinger | Rhodian: bare head, short brown hair, short beard, white tunic, pouch of stones, a braided sling wound round his raised wrist |
| javelineer | Thracian: grey wolfskin cap (alopekis) with the animal's ears, light green tunic, exactly two javelins over the shoulder |
| horse_archer | Scythian: tall pointed felt hood with ear flaps tied under the chin, red embroidered kaftan, gorytos bow case with a short recurved bow |
| peltast | a LOW, ROUNDED open-faced bronze helmet hugging the skull, short brim-like peak, long cheek guards; NO tall crown, NO curving tip, NO crest; the crescent pelte is the main prop (first try shared the rhomphaia's silhouette) |
| falx | bare head, long dark hair, full beard, brown cloak over a red tunic, the inward-curved falx blade over his shoulder |
| gallic | limed pale spiky hair, long moustache, bare chest with blue woad swirls, bronze torc, upper edge of a long oval shield with an iron boss |
| fanatic | shaved head, grey ash on face and scalp, fierce stare, torn white tunic, black cloak, a short curved bronze knife raised |
| companion | bronze Boeotian helmet (open face, a wide flaring brim all round like a hat, no crest, no plume), short dark beard, deep purple cloak with an ochre-gold border over a bronze muscled cuirass, xyston lance upright beside his shoulder; no shield |
| thessalian | a pale cream FELT petasos with a very FLAT, very WIDE brim and a LOW crown, tied under the chin (cloth, not metal), clean-shaven, short Egyptian-blue chlamys, exactly two light javelins upright |
| chariot | Persian-style driver: soft cream-and-ochre felt tiara cap, LOW and ROUNDED, top bending forward, cloth brow band, long loose side flaps (NOT tall, NOT pointed, NOT tied under the chin), black curled beard, bronze SCALE armour, one raised fist gripping the reins |
| royal_guard | a GILDED Attic helmet, face open, low red crest front to back and two upright white plumes at the sides; grey-flecked beard; the polished SILVER rim and face of a round shield, the brightest cool shape in the image |
| sacred_band | the same Corinthian helmet as the reference with a tall DARK charcoal-black crest; dark Egyptian-blue cloak, white linen corselet; shield painted dark blue with one large golden Herakles CLUB (drawn as a picture, not a letter). NO red anywhere |
| wolf | grey and tawny fur, pale muzzle and throat, ears pricked, amber eyes, mouth closed |
| boar | dark brown-grey coat, a bristling dark mane along the neck and back, long snout, two curved pale ivory tusks, clearly visible |
| bear | huge, thick reddish-brown fur, heavy brow, small round ears, mouth open in a low roar showing fangs, massive shoulder hump |

**Lessons:** spell out the silhouette in capitals when two classes could look alike; name a colour rule to separate
look-alikes ("NO red anywhere"); follow the game kit over the bible.

---

## 4. Atlas icons (AS-03)

One prompt asks for a 2x2 grid of four icons on #FF00FF; a script cuts the quadrants and checks no opaque pixel
touches a quadrant edge. Grid 1 had `public/icons/ui.png` attached ("The attached sheet is the existing icon set of
my mobile strategy game; the new icons must match it exactly in style"); grids 2–6 had grid 1 attached.

```
Create a NEW image, not an edit of the reference. Match the attached reference exactly in style: the same heavy dark-brown outline (#2a1a12) of even weight, the same soft painted shading, light from the upper left, slightly chunky proportions, three-quarter view, warm materials (bronze #b08a3a, wood, cloth, stone), the same perfectly flat solid #FF00FF magenta background edge to edge, and the same 2x2 layout: one icon centred in each quarter, each filling about 80 percent of its quarter, wide empty gaps, nothing touching another icon or the image edge. ROLE: four more game icons for the same set{ROLE EXTRA}; each must read at 24 pixels. SUBJECTS (each a single object): top-left: {TL}; top-right: {TR}; bottom-left: {BL}; bottom-right: {BR}. EXCLUDE: text, letters, numbers, a frame, a badge, a disc or a circle behind an object, grid lines, shadows or glow on the background, more than one object per quarter{, blood}{, modern tools}; no magenta inside the objects. ASPECT: square 1:1, highest resolution available.
```

All shipped (frame: SUBJECT, short form): `helmet` bronze Corinthian helmet, tall red crest · `chest` closed wooden
chest with bronze bands · `tent` canvas army tent with a pennant · `arena` round stone arena from outside, tiers of
arches, two pennants · `book` thick leather-bound codex, dark red-brown cover, bronze corner caps and clasp · `banner`
red cloth war banner on a crossbar, bronze disc on the pole top · `war` two crossed spears behind a crested Corinthian
helmet, one engraved bronze relief, monochrome, no red · `season` bronze hourglass with golden sand in a green laurel
wreath · `doctrine_steady` tortoise with a high domed bronze-scale shell, walking steadily · `doctrine_rush` ram's head,
heavy curled horns, lowered to butt · `doctrine_hammer` war hammer, long haft, leather grip, blunt bronze head with a
back spike, diagonal · `doctrine_swarm` one striped amber-and-brown hornet, spread translucent wings, visible sting ·
`doctrine_fury` roaring lion's head, mane of flame-like red and gold locks · `standard` pole with a bronze crossbar,
topped by a sixteen-ray bronze sunburst disc, two purple ribbons, NO cloth flag · `works` a simple ancient wooden spade
with a plain straight wooden handle (no D-grip, no metal handle), crossed in an X with a sharpened stake (the first try
drew a modern D-grip) · `captain` a tall curved transverse red horsehair crest on its bronze holder, alone, NO helmet ·
`push` two levelled pike heads driving into the rim of a round enemy shield that tilts back · `bond` two forearms in
bronze bracers clasped at the wrist · `warcry` bearded Celt in profile, limed spiky hair, shouting, three curved bronze
sound strokes · `sunder` inward-curved falx blade splitting a round wooden shield · `aimed` recurved bow drawn taut,
three arrows nocked, pointing upper right · `recharge` war-horse head with a bronze forehead plate turning sharply,
circled by a bronze U-turn arrow · `scythe` spoked chariot wheel with a curved scythe blade from its hub.

**Lessons:** check every new subject against the existing atlas so no glyph repeats a reserved meaning (the bull head,
Gorgon, red roaring face, horn, stake fence and sun disc were avoided). Dark-outlined icons vanish on dark stone: the
chrome gives them a light ground.

---

## 5. Frescoes and splash key art (AS-04)

**Family prompt** (the approved `fresco_campaign` attached): F + SUBJECT + LIGHT + COMPOSITION + G.

```
F: Create a NEW image, not an edit of the reference. Match the attached reference banner exactly in style, palette, brushwork, fine craquelure and full-bleed framing (no border); change only the subject, the light and the composition as stated. It is one of a matching set of wide banner paintings for a mobile strategy game set in the ancient Mediterranean, 4th century BC. STYLE: [T-STYLE without EXCLUDE].
G: EXCLUDE: any text, letters, numbers, runes, symbols on shields, signatures, watermarks, logos, UI, borders or frames around the image, modern objects, extra limbs, duplicated figures, cropped heads, blood. ASPECT: very wide landscape, 21:9 or the widest available, highest resolution available.
```

COMPOSITION for thin strips (6:1 to 7.8:1): "this banner will be cropped to a very thin strip six [almost eight] times
wider than tall … every [figure / torch / the goods] between 35 and 65 percent of the image height; plain sky above and
plain ground below; nothing important at the far left or right edges".

| File | SUBJECT / LIGHT (short form) | Note |
| --- | --- | --- |
| fresco_campaign | a column of Greek hoplites marching along a sandy beach at dawn, seen from the side, red crests and cloaks, round bronze shields, spears upright; warships drawn up behind; low green hills; early sun low on the left over a calm sea | Seed (opening line "reference from another family", `bust_hoplite` attached). Then: no frame, full-bleed; column of 6 centred; plain bronze shields, NO lambda; heads to spear tips between 30 and 70%; then an EDIT "make the six hoplites about 25 percent smaller, move the whole column to the horizontal centre … more sky above … keep everything else identical". Shipped with `--ax 0.6` |
| fresco_ladder | a broad stepped stone tower of five terraces like a low ziggurat, a torch on each terrace, four or five small Greek warriors climbing the central stair; torchlit dusk, violet-blue sky, orange torch pools | Staged |
| fresco_arena | stone arena, crowd on the tiers, pennants; a Greek hoplite (red crest, red cloak, bronze shield) and a Celtic swordsman (iron helmet, checked green cloak, oval shield, long sword) face each other; torchlit dusk | `--ay 0.44` |
| fresco_shop | agora stall under a long cream and terracotta striped awning; amphorae, bronze helmets, shields, spearheads, bowls; one bearded merchant; stoa columns; warm afternoon | `--ay 0.56` crops out a lettered shield |
| fresco_war | a walled Greek hill town with a temple in the centre; two rival camps on the plain, red banners left, dark blue banners right, plain cloth; grey smoke of camp fires; overcast, smoky, cooler light | |
| splash_keyart | T-SPLASH via the family prompt: a front rank of about seven hoplites with locked plain bronze shields and levelled spears, more ranks behind, beach at dawn, seen from low; beached warships; a white Doric temple on a headland; top third empty sky; key figures in the central 60% of the width; NO lambda | Quality 62 for the budget |

**Lessons:** Gemini adds Greek letters to shields and paints a frame round "a banner" unless both are excluded by name.
Ask for the crop band in percentages of the height. Fix a composition with an edit of the nearly-right render ("keep
everything else identical"); Gemini may drop a figure instead of shrinking.

---

## 6. Settlement vignettes (AS-04)

Seed `vignette_town_greek` = T-STYLE + T-VIGNETTE with the fresco seed attached; then attached to the other five.

> Create a NEW image, not an edit of the reference. Match the attached reference settlement view exactly in style, palette, brushwork, fine craquelure, full-bleed framing (no border), viewpoint, distance, warm afternoon light from the upper left and the same horizontal bands (sky in the top quarter, the settlement across the middle third, ground and path in the lower quarter); change only the settlement as stated. … SUBJECT: {below}; seen from a low hill at a slight distance, no people in the foreground; 3 to 5 readable landmarks. The village centred, nothing important at the left and right edges. EXCLUDE: any text, letters, numbers, runes, inscriptions, signs, signatures, watermarks, logos, UI, borders or frames around the image, modern objects, {culture extras}, people in the foreground. ASPECT: landscape 21:9 or the widest available, highest resolution available.

Villages add "NOT a walled town … no fortifications, no towers, no gate". All shipped:

| File | SUBJECT (short form) |
| --- | --- |
| vignette_town_greek | walled Hellenic town: whitewashed walls, gate, square towers, terracotta roofs, small Doric temple on the top, olives |
| vignette_town_phoenician | walled Punic harbour town: ochre mudbrick walls and towers, flat-roofed ochre and white houses, date palms, round harbour with two ships under purple awnings; EXCLUDE adds domes, minarets |
| vignette_town_celtic | Galatian hill town: palisade of sharpened logs with a wooden gate tower, round houses with conical thatch, roof smoke, oak woods; EXCLUDE adds stone castles |
| vignette_village_greek | small Hellenic farming village, NOT walled: about eight whitewashed farmhouses with terracotta roofs and courtyards, a tiny four-column Doric shrine, olives, a threshing floor, grain fields, dry-stone field walls |
| vignette_village_phoenician | small Punic farming and fishing village, NOT walled: about seven flat-roofed ochre mudbrick houses on the shore, palms, irrigated gardens, a cove with two small boats under purple awnings |
| vignette_village_celtic | small Galatian village in a forest clearing, NOT a hill fort: five or six round thatched houses, smoke from one roof, a wattle cattle pen, a small grain field, a short partial stake fence, big oaks |

---

## 7. Beast plates and reward cutouts (AS-05)

**Hydra seed:** opening line "The attached animal portrait is from the same mobile strategy game: match its painting
style, palette, brushwork, warm umber background and lighting exactly, but this is a full creature plate, not a
head-and-shoulders portrait" (`bust_bear` attached) + T-PLATE; EXCLUDE adds "people, extra legs, more or fewer than
five heads, heads cut by the frame".

**Family prompt (hydra attached):**

```
Create a NEW image, not an edit of the reference. Match the attached reference bestiary plate exactly in style, palette, brushwork, fine craquelure, dark warm umber to red-brown background, warm key light from the upper left, chiaroscuro and full-bleed framing (no border); change only the creature and its ground cue. It is one of a matching set of bestiary plates for a codex in a mobile strategy game set in the ancient Mediterranean: the monster alone, dramatic, in the manner of a painted tomb fresco. STYLE: ancient Mediterranean fresco painting on lime plaster: earth pigments, visible confident brushwork, soft painted edges, warm and slightly desaturated, no pure black and no pure white; clear value contrast so it reads at small phone size. Hand-painted illustration, not a photo, not a 3D render. SUBJECT: {SUBJECT}. COMPOSITION: the whole creature centred and filling about 80 percent of the square frame, {the parts that must stay} fully inside the frame; one simple ground cue: {GROUND}; a strong silhouette against the background. EXCLUDE: any text, letters, numbers, runes, signatures, watermarks, logos, UI, borders or frames, people, modern objects, extra limbs, extra heads, duplicated creatures, parts cut by the frame, blood{, extras}. ASPECT: square 1:1, highest resolution available.
```

Write each SUBJECT from the manifest row **and** the battle figure (`src/art/beastArt.ts`) and hint
(`src/i18n/beasts.en.ts`), with exact part counts, so plate and battle agree. All shipped (short form):

| File | SUBJECT |
| --- | --- |
| plate_hydra | rising from a swamp: dark teal-green scaled body, pale belly, short back spines, four splayed clawed legs half in the water, exactly FIVE serpent heads on long curving necks fanning out, each wedge-shaped with a bony frill, yellow eyes, bared fangs; ground dark swamp water with reeds |
| plate_cyclops | lifting a huge grey boulder overhead: tan skin, ONE eye under a heavy brow, wild dark hair, short beard, a stubby horn, fur pelt, fur loincloth; a knotted club at his feet |
| plate_harpies | exactly three diving, talons out: gaunt grey-skinned women's heads and shoulders, dark feathers, screaming, glowing pale eyes; ragged grey-violet wings for arms; bronze talons; a jagged crag below |
| plate_nemean_lion | crouched to pounce, facing left: glinting golden metallic hide, dark ochre-brown mane; two snapped arrows on the rocks, bounced off its hide |
| plate_minotaur | charging left, horns first: dark brown bull hide, shaggy hump, bronze nose ring, wide ivory horns, leather kilt, bronze bracers, a double-headed labrys on a long haft |
| plate_chimera | facing left breathing a cone of orange fire: tawny lion body, goat head with curved horns rising from the back, green serpent tail with the snake head at the tip; exactly three heads, four legs, no wings |
| plate_kraken | rising from a stormy sea at a sandy beach: dark wine-red mantle out of white surf, two pale yellow eyes, hooked beak; exactly six sucker-lined tentacles, two slamming onto wet sand |
| plate_titan | hurling two boulders, one in each hand: grey weathered stone body with glowing orange molten cracks, bronze shoulder plates and wide belt, glowing eyes, a crown of bronze spikes, stern bearded face (the belt reads a little modern) |

**Cutouts:**

- `chest_closed`: "Create a NEW image … Use the attached painting ONLY as the style reference for the brushwork, the warm
  earth palette and the light from the upper left; do NOT copy its dark background or its creature" + T-STYLE (without
  background) + T-CUTOUT, "three-quarter front view from slightly above", BACKGROUND "… no shadow, no cast shadow, no
  gradient, no glow, no vignette, no texture and no floor; no magenta or pink anywhere inside the chest"; EXCLUDE coins,
  other objects, a table or ground. SUBJECT: dark warm oak planks, slightly domed lid, three broad bronze bands, riveted
  bronze corner plates, a bronze lion-head lock plate with a ring in its mouth; lid shut.
- `chest_open_empty` (shipped), `chest_open_full`: "Edit the attached chest image. Change only: {lid open, swung back and
  standing behind; empty inside, bare dark floor and walls in shadow / heaped above the rim with plain blank gold coins,
  a few spilling over the front edge}. Keep everything else identical: the same chest, the same oak planks, bronze
  bands, rivets and lion-head lock plate with its ring, the same three-quarter view, the same size and position in the
  frame, the same colours, painted style and light from the upper left" + the same BACKGROUND.
- `laurel_branch` (shipped, flipped: Gemini drew it bowing right): T-CUTOUT, portrait 3:4, "it must read at 26 by 36
  pixels", a single gilded laurel branch, stem from the bottom bowing out to the LEFT, tip curling to the upper right
  (the left half of a victor's wreath), 9 to 11 pairs of pointed gilded leaves; EXCLUDE ribbons, berries, a full
  wreath, a second branch.

---

## 8. World pixel sprites (AS-06)

All in one chat. The first prompt had real in-game sprites (two men, both standards, a base plate, a boulder, a tree)
captured from the running game and magnified 4x nearest attached. Shipped: `tile_stakes`, `tile_ditch`, `tile_laager`,
`tile_palisade`, `tile_rampart`; the two crests were drawn in code.

**Seed prompt:**

```
Create an image. ROLE: a pixel-art game sprite for an isometric ancient-Mediterranean tactics game. The attached picture shows sprites already in the game (a hoplite, a skirmisher, two army standards, a unit base, a boulder, a tree) magnified 4 times: match their pixel density, palette, soft sel-out outlines and light from the upper left exactly. SUBJECT: {SUBJECT}. PIXEL GRID: true pixel art. The whole sprite is about {W} art pixels wide and {H} art pixels tall, and every art pixel is drawn as one clean, equal, square block of solid colour (very large chunky pixels, about 24 by 24 screen pixels each), aligned to one grid; hard edges; no anti-aliasing, no blur, no gradients, no dithering noise, no sub-pixel detail, no thin lines finer than one block. PALETTE: only these colours: {PA-WORLD subset}. STYLE: a selective coloured outline (a darker shade of the local colour, never black), 3 to 4 step ramps, light from the upper left. BACKGROUND: a perfectly flat solid #FF00FF magenta background, edge to edge, with no shadow, no grass and no ground plane beyond the small patch of earth; the sprite centred. EXCLUDE: text, a frame, a grid overlay, several sprites, soldiers, a scene, a cast shadow on the magenta.
```

**Follow-ups:** the same-chat pixel-set opening line + SUBJECT + a size **relative to an approved sprite** or a cell
count + "No text, no anti-aliasing, no gradients, no detail smaller than one cell". The wordings that shipped:

| File | Wording that worked (short form) |
| --- | --- |
| tile_stakes | "even smaller and chunkier… 24 columns by 16 rows… FOUR stakes… 2 cells thick, 6 to 8 long… 2-cell point" (after two tries too fine and too tall) |
| tile_ditch | "back to the diamond ditch… exactly twice as wide as tall… NO dark outline… trench a 3-cell band of #2a1a12… 1-cell lit lip, 1-cell spoil ridge" |
| tile_laager | "cells twice as big… only about 37 cells wide… long side upper left to lower right, two big disc wheels, plank sides 3 to 4 planks high" |
| tile_palisade | "same cell size as this last wagon… six to seven upright rough logs… sharpened… one rope band… stepping down along the iso slope… HALF as wide as the wagon and a little TALLER" |
| tile_rampart | "Use the footprint of the approved ditch diamond: an isometric earth BLOCK… top face a flat 2:1 diamond… raised only 4 cells… lower-left face mid earth, lower-right shaded… ragged top edges" |

**Lessons:** say "a grid of N columns by M rows of big square cells, each one flat colour"; expect it to overshoot the
count; process with an explicit `--grid n` read from the image; relative sizes beat cell counts; anything under
~16 art px (a 12x12 crest, an 8x22 standard) is faster to draw in code.

---

## 9. Nikias portraits (AS-08)

Three frames (`portrait_nikias`, `_talk`, `_blink`, 384x384): frame 1 from T-BUST with the hoplite seed attached,
frames 2 and 3 edits of frame 1. SUBJECT: "Nikias, an old Greek strategos, white beard, bronze Corinthian helmet pushed
up on the head, red cloak; mouth closed, eyes open". The first render wore the helmet over the face and added a shield
(it read as the hoplite bust). The fix and the two edits shipped:

```
Create a NEW image with the same prompt, but fix the helmet: the bronze Corinthian helmet is PUSHED UP and tilted back on top of his head, resting high on the crown like a cap, so his WHOLE face is uncovered: forehead, eyes, cheeks, white hair at the temples and the full white beard are all visible; the helmet's empty eye holes and cheek guards sit above his forehead. No shield: only the red cloak, pinned at the shoulder. Keep everything else from the first prompt: the fresco style matching the attached reference, the framing, the plain dark warm umber background with its soft glow, mouth closed, eyes open. EXCLUDE: any text, letters, numbers, signatures, watermarks, borders or frames around the image, a shield. ASPECT: square 1:1, highest resolution available.
```

```
Edit the attached Nikias portrait. Change only: {his mouth, now open mid-word as if speaking, the lower teeth just hidden by the beard / his eyes, now closed in a blink, the eyelids relaxed}. Keep everything else identical: the same face, white beard, {closed mouth,} bronze Corinthian helmet pushed up on the head, red cloak, pose, framing, size and position in the frame, plain dark warm umber background with its soft glow, colours, painted fresco style and light from the upper left. EXCLUDE: any text, letters, numbers, signatures, watermarks, borders or frames around the image. ASPECT: square 1:1, highest resolution available.
```

**Lesson:** "pushed up on the head" alone reads as worn normally: say what shows ("resting high on the crown like a cap,
the whole face uncovered"). A prop the seed carries (the shield) must be excluded by name.

## 10. App icon and mark (AS-08)

A family of its own: one object in profile on a round red-figure disc with a Greek-key ring, on #FF00FF. It is the
app's mark (browser tab, home screen, Telegram bot picture), not an atlas icon, so it takes no `RESERVED_ICONS`
meaning. `Create an image.` + T-MARK with SUBJECT "a single bronze Corinthian hoplite helmet in side profile, facing the
viewer's left, with a tall arched red horsehair crest; the eye opening is one clear dark almond shape; the helmet and
crest together fill about 70 percent of the disc" and EXCLUDE "a face or a person inside the helmet, spears". Accepted
first try; the meander ring came out about 14% wide, not 8% (harmless; the favicons crop to the inner disc).
`node scripts/art/appicons.mjs <raw>` builds every size.

## 11. Landing page mockups (v6)

Three full-page desktop directions (outputs about 1024x4128): a shared page block (an allowlist of every
section and string, ending "Nothing else on the page: …") plus one direction block, seeded with `splash_keyart.jpg`
and a real battle screenshot. Lessons: name what each gameplay still shows (left open, Gemini invented a pixel smithy
for "Forge" and used the battlefield for "Campaign"); say "plain icon (no badges, no numbers on icons)"; edits keep the
layout but garble small text (copy is set in code, judge the direction); ask for counters as "—".

## 12. Landing hero layers (v6)

The pixel diorama is **rendered by the game's own code** (`scripts/art/landing/diorama.mjs`:
`renderGround`, terrain props and the paperdoll `renderFrame` in Node through Vite `ssrLoadModule`); its render on
`#100d0b` and `splash_keyart.jpg` are the seeds for the painted layers.

Sky layer (accepted first try; reuse for any dark painted backdrop, change the SUBJECT):

```
Create an image. ROLE: the farthest background layer of a website hero for PIXELARROW, a pixel-art formation-tactics game set in the ancient Mediterranean. The first attached picture is the real game battlefield drawn as a small tabletop diorama; on the website it floats in the middle of this background, but it is NOT part of this image. The second attached picture is the game's painted key art: match its painting style, warm palette and soft brushwork. SUBJECT: an empty night sky, a calm painted backdrop: a very dark warm ground (#100d0b to #1d1812, warm basalt brown-black, not blue, not purple), a faint warm haze near the bottom edge, a soft wide band of the Milky Way rising from the lower left to the upper right in warm cream and faint ochre, and many small soft stars in warm cream (#f0e3c2), a few a little brighter, never sharp white points; the upper left corner slightly warmer, as if a lamp glows just off the frame. Keep the whole image very dark: most of the area below 10 percent brightness and the brightest star no brighter than #f0e3c2, so cream text stays readable over any part of it. COMPOSITION: no horizon, no land, no sea, no moon, no clouds with shapes, no figures; detail spread evenly across the whole image so it can be cropped to any shape from 21:9 to 9:16. STYLE: painted, soft, a slight lime-plaster grain, not a photo, not a 3D render, not glossy digital art, no pure black and no pure white. EXCLUDE: any text, letters, numbers, logos, UI, a frame or border, the diorama, planets, comets, constellation lines, people, buildings. ASPECT: landscape 16:9, highest resolution available.
```

Light-only layer for `mix-blend-mode: screen` (accepted first try):

```
Create a NEW image, not an edit of the references. ROLE: a light-only overlay layer for the same website hero; on the page it is blended with the "screen" blend mode, so everything black disappears and only the light shows. SUBJECT: a soft cone of warm lamplight (#f2c879, a little cream at the core) entering from the upper left corner and falling diagonally down toward the centre right, widening as it goes, with soft feathered edges; brightest at the upper left edge where it enters and fading smoothly to nothing before the lower right corner; inside the beam, many tiny dust motes floating in the light: soft warm specks of different sizes, most very small, a few slightly larger and slightly out of focus, more of them inside the beam and almost none outside it. BACKGROUND: perfectly flat pure black #000000 everywhere outside the light, edge to edge, with no texture, no vignette, no stars and no colour noise. No lamp, no window, no objects, no diorama, no people: only the light and the dust. STYLE: painted, soft, gentle; no lens flare, no hard rays, no god-ray stripes, no bloom rings. EXCLUDE: any text, letters, numbers, logos, UI, a frame or border. ASPECT: landscape 16:9, highest resolution available.
```

Keyed foreground strip (a table edge with a helmet and a scroll): the first render stood the helmet upright at 80% of
the height. The same-chat fix that worked: "(1) … the table edge must fill only the bottom 12 percent of the image, and
the helmet and the scroll must lie low on the table, the helmet lying on its side with the crest along the table (not
standing upright), each prop no taller than 25 percent of the image height; the top two thirds of the image are empty
magenta; (2) the props and the table must be much darker, nearly silhouettes in a dark room: their faces in deep umber
shadow (#1d1812 to #342d25), with only a thin warm rim of lamplight on their top-left edges; (3) the magenta must be one
perfectly flat colour #FF00FF with no texture, no brush marks and no shading."

**Lessons:** "keep it very dark … so cream text stays readable" works for skies; light layers on pure black with
`screen` need no keying and compress to 5–14 kB; Gemini makes props tall and lit, so cap heights in % and plan a CSS
darken; `keyOut` tol 70 handles JPEG magenta; ship alpha layers as WebP.

---

## 13. PixelLab: tools, settings and the hard-won rules

Not Gemini: the PixelLab MCP, called by the agent. One character call makes 8 rotations; clips are made per facing.
The game uses 4 facings: `south-east`, `north-east`, `south-west`, `north-west` (paperdoll DIRS rows 0..3). Recipe and
QC checklists: [docs/v5/art/STYLE_LOCK.md](../v5/art/STYLE_LOCK.md); sheet layout `docs/v5/art/SHEET_FORMAT.md`; tools
in `scripts/art/pixellab/` (`fetch.mjs`, `fetchjobs.mjs`, `build.mjs`, `sheetbuild.mjs`, `remap.mjs`, `rig.mjs`,
`skeleton.mjs`, `spear.mjs`, `fixframes.mjs`, `proportion.mjs`, and the per-stage folders `rollout/`, `mounted/`,
`i5a/`, `i5b/`, `i5c/`, `polish/`).

**The style anchor (I1 → I1b → I3a).** A bake-off of standard-mode hoplites (I1) gave way to a darker "*300* / Lord of
the Rings" look (V5-087): character E3 (Pro Flash 68x68, high top-down), then H4, the production anchor:
`create_character`, `mode: pro`, `style_character_id` E3, `size: 68`, `view: high top-down`, `concept_image_url` = a
south view re-proportioned to seven heads by `proportion.mjs`, and the H4 description in STYLE_LOCK §3. Every later
class uses `style_character_id` H4 `b7624d6d-132a-458c-8e3d-d6960d175988`.

**Clip modes.** `animate_image_pixminimax` (1 generation per 68-px clip; keeps identity; 12–16 frames) for almost
everything; `animate_with_skeleton_v3` with our own keypoints (`rig.mjs`, `--grip x,y` on the drawn fist) for thrusts;
template clips drop the shield; v3 custom clips invent the weapon's path.

**Rules learned (I1–I3a):**

- A held weapon survives the rotation only when the prompt opens with it and sizes it ("holding a very long … spear
  vertically …, taller than the man"; "out at his right side, away from his body and clearly visible in every
  direction"). Check all 8 views; expect some to lose or double the weapon.
- Every spear prompt carries "single leaf-shaped spearhead, plain blunt butt end, no butt spike".
- A style character carries its proportions as well as its look: give pro a re-proportioned concept to change the body.
- The first frame decides the clip: draw the couched spear head-forward into it (`spear.mjs`) and pose with our own
  skeleton; from an upright spear the model swings the head over the shoulder. A first frame at the angle the model
  likes (level in SE) keeps a thrust from pivoting. Give a thrust a canvas its extension fits in.
- pixminimax adds sparks and blood whatever the prompt says: cut by colour, look at every cut frame, replace broken
  frames, and keep the fixes in JSON (`fixframes.mjs`) so a re-fetch replays them.
- Snap with a ramp-aware remap; nearest-colour snapping turns bronze into the grey metal ramp.
- Test every clip in SW, then check the back views (NE, NW) first: they break most.

## 14. PixelLab foot-class base characters (I4a)

The 13 foot classes as base characters (8 rotations): `create_character`, `mode: pro`, `style_character_id` H4,
`size: 68`, `view: high top-down`, no concept image. Classes taller than H4 were normalised by row-drop
(`rollout/normalise.mjs`) and re-imported (`mode: v3`, all 8 views given). Ids: `docs/v5/pixellab/bases.json`.

Prompt = `{WHO} with realistic adult proportions: seven heads tall, a small head{ in a snug helmet / cap}, long legs,
natural arms, broad shoulders, lean {muscular / wiry} build; {HEAD}; {CLOAK} hanging behind him; {BODY}, no white
cloth; {LEGS}; {SHIELD}; {WEAPON}, away from his body and clearly visible in every direction{TAIL}; heavy shadows,
desaturated dark warm colours like the style reference`. TAIL for spears: ", {a little / much} taller than the man,
single leaf-shaped (iron) spearhead at the top, plain blunt wooden butt end, no butt spike". Every colour is "dark …"
(dark weathered bronze, dark crimson, oxblood-brown, umber). Shipped fills (short form; exact phrases in quotes):

| Class | WHO | HEAD · CLOAK · BODY · LEGS | SHIELD · WEAPON |
| --- | --- | --- | --- |
| militia | grim weathered Greek peasant levy spearman | low rounded brown felt pilos cap, no helmet · short faded crimson wool · plain umber tunic, leather belt, no armour · bare legs, sandals | none, "his left hand empty at his side" · one wooden spear vertically in his right hand out at his right side + TAIL |
| thureophoros | grim veteran Carthaginian thureophoros infantryman | tall conical bronze pilos, no crest · purple-black · greyed-tan linothorax over a purple-black tunic · bronze greaves | tall oval thureos, shoulder to shin, umber hide, iron spine and boss · straight iron short sword down at his right side, point down |
| celt_sword | grim Celtic warrior swordsman with a long drooping moustache | low iron Montefortino with knob and cheek guards · muted green plaid, "the only green he wears" · iron ring mail, bronze torc · brown-and-black checked trousers | tall oval Celtic shield, umber-brown wood, iron boss and spine · long straight iron longsword down, point down |
| rhomphaia | grim tall Thracian rhomphaia warrior | "open-faced tall … bronze Phrygian helmet whose high crown curves forward like a Phrygian cap, hinged cheek guards, the face visible, no crest, no face mask" · crimson · iron scale corselet over oxblood tunic · brown trousers, bronze greaves | no shield · "one rhomphaia, a long two-handed weapon with a wooden shaft as long as his legs and a long single-edged slightly curved iron blade, gripped upright with both hands in front of his right side, the blade standing up above his head" |
| archer | lean grim Cretan archer | bare head, short curly hair and beard · short crimson · leather jerkin over oxblood tunic, quiver strap, "one quiver of arrows on his back" · bare legs, sandals | no shield · "only one bow: a plain wooden bow with a single thin curved limb and one straight string, held vertically in his left hand out at his left side, … no second bow, his right hand empty ready to draw" |
| slinger | lean grim Rhodian slinger | bare head, short hair and beard · crimson chlamys knotted at the right shoulder · oxblood tunic, leather belt, a pouch of lead bullets · bare legs, sandals | no shield · "one sling of dark leather cord hanging from his right hand out at his right side, its loaded pouch swinging near his knee" |
| javelineer | grim lean Carthaginian javelin skirmisher | soft umber felt Thracian cap with a tall forward-curving top and ear flaps · short purple-black · plain umber tunic · bare legs, sandals | small crescent pelte of wicker and hide, chest to hip · "two javelins held vertically together in his right hand …, each with one small leaf-shaped iron head at the top and a plain blunt wooden butt end" |
| peltast | grim lean Greek peltast skirmisher | "open-faced … Thracian helmet whose crown rises into a forward-curving peak …, a short brim over the eyes and hinged cheek guards, the face visible, no crest, no face mask" · short crimson · leather jerkin over oxblood tunic · tall leather boots | crescent pelte, hide with a bronze rim · one wooden spear + TAIL |
| falx | grim tall Dacian falx warrior | bare head, long black hair, full black beard · plain moss-green, "the only green he wears" · warm umber leather jerkin · brown trousers | no shield · "one falx, a heavy two-handed weapon with a long wooden haft and a long forward-curved iron sickle blade, gripped upright with both hands in front of his right side" |
| gallic | grim tall bare-chested Gallic warband warrior | limed hair in dull pale-grey spikes, long moustache · none · bare chest painted with blue woad swirls, bronze torc · green-and-umber plaid trousers | tall oval hide shield, iron boss · heavy iron war axe down at his right side |
| fanatic | grim wild-eyed Celtic religious fanatic, "a living man," | wild limed ash-blond mane, rough beard · ragged oxblood-black, torn at the hem · "bare chest and arms of living warm tan skin painted with bold dark blue woad patterns" · umber kilt with a rope belt, bare feet | none, "his left hand an empty fist" · heavy curved iron kopis down at his right side |
| royal_guard | tall grim Macedonian royal guardsman, a silver-shield veteran, | gilded bronze Attic helmet, open face, two tall bone-grey plumes, no transverse crest · royal purple · ornate gilded muscle cuirass over crimson · bronze greaves | very large aspis, chin to knee, "dull dark tarnished silver" face, bronze rim, muted star · very long spear + "much taller" TAIL |
| sacred_band | tall grim Theban Sacred Band hoplite | bronze Boeotian helmet, wide flaring brim, open face, no crest · very dark blue-black · bronze muscle cuirass over oxblood · bronze greaves | very large bronze aspis, muted dark-red club of Herakles · as royal_guard |

Archer, fanatic and falx are the review-fix versions (A3, A4, A4); falx hair and the fanatic's kilt were then retinted
(`rollout/retint.mjs`).

**Lessons:** with H4 as the style character, pro mode lands H4's build in one call. The model fits the figure's top to
the canvas top, so a bare head comes out 3–7 px tall: drop rows before the import, don't re-roll. Give the cloak a hue
family nothing else on the man uses (crimson Greeks, purple-black Carthaginians, green plaid Celts); a brown cloak on a
man in leather leaves no recolour group. For a helmet the model might draw as a Corinthian, write "open-faced …, the
face visible, no crest, no face mask". "Recurved composite bow" draws two limbs that read as two bows. "A living man …
warm tan skin" keeps a fanatic alive; grey ash on the body makes a ghoul. Two parts in one exact colour separate by a
box retint into a neighbouring ramp, not a re-roll.

## 15. PixelLab hoplite clip prompts (I3a): the foot-class template

pixminimax unless noted; `view: high top-down`, `direction` = the facing. The 15 clip descriptions, word for word, are
`CLIPS` in `scripts/art/pixellab/i5a/prompts.mjs`: the hoplite's text with `{W}` = "the long spear", `{S}` = "the
large round shield", `{H}` = "single leaf-shaped spearhead" and `{t}` = the facing ("towards the viewer's lower left";
"lower right"; "away from the viewer towards the upper right / left"). Example, walk (16 frames):
`steady disciplined marching walk in place towards the viewer's lower left, long natural strides, the long spear held upright in the right hand and swaying a little with each step, single leaf-shaped spearhead at the top, plain blunt butt end, no butt spike; the large round shield stays on the left arm across the body in every frame; the cloak sways`.

- `subject_description` front: "a tall grim Spartan hoplite in a dark bronze Corinthian helmet with a dark crimson
  crest, dark crimson cloak, a large round bronze shield with a red lambda and a long spear" (back facings "… seen from
  behind …, a large round bronze shield and a long spear"; levelled clips end "… and a long levelled spear").
- `initial_pose` "standing upright, the spear held upright in the right hand, the shield on the left arm"; levelled
  "standing with the spear levelled at the hip pointing forward, the shield on the left arm".
- Clips and frames: idle 12, look 16, adjust 12, walk 16, run 12, rout 12, kneel 12 (rotation canvas); ready, charge,
  brace, block, stagger 12 (the levelled guard frame); fallBack, fallFwd 12 (128 x 128 die canvas); cheer 12 (96 x 112
  tall canvas).
- Per-facing additions: look in SE NE NW "never further than over his shoulder"; run and kneel NE "the large round
  shield stays clearly visible on the left arm at his left side in every frame"; block "no sparks, no effects" (sparks
  came anyway).
- thrust (skeleton-v3, 14 frames, action "heavy spear thrust", `rig.mjs thrust <dir> guard_<dir>.png --grip x,y`):
  `grim muscular Spartan hoplite in a dark weathered bronze Corinthian helmet with a dark crimson crest, dark crimson cloak, dark bronze cuirass and greaves, one very large round bronze aspis with a muted red lambda on his left arm, one long heavy wooden spear held level at the hip in his right hand, always pointing forward the way he faces, single leaf-shaped spearhead at the front end, plain blunt wooden butt end, no butt spike`
  (back facings "… seen from behind …, away from the viewer, …"; SE "always pointing straight forward the way he faces
  at the same angle in every frame", from a flatter first frame).
- Rebuild: `fetchjobs.mjs docs/v5/pixellab/I3/jobs.json`, `sheetbuild.mjs docs/v5/pixellab/I3/hoplite.sheet.json`.

## 16. PixelLab animation of the shield-bearing foot classes (I5a)

royal_guard, sacred_band, thureophoros, militia, peltast and javelineer, each taken to the hoplite's full sheet.
`node scripts/art/pixellab/i5a/prompts.mjs <class> <anim> <dir>` prints every prompt word for word: the §15 prompts
with each class's subject, weapon and shield words (`CLASSES` in that file). Job ids `docs/v5/pixellab/I5a/<class>/jobs.json`,
picks and frame fixes `class.json`. First frames from `i5a/prep.mjs` (rotation, the 96 x 112 tall canvas, the 128 x 128
die canvas, the 128 x 112 levelled guard drawn by `i5a/guard.mjs`). `guard.mjs` found the same fist and grip for every
H4-based spear class, so thrust keypoints carry across them.

Class-specific clips beyond §15: thureophoros `slash` (one-handed sword cut, from the ready frame); peltast and
javelineer `throw`; militia two-handed spear clips (`rig5.mjs thrust2`) with no shield.

**Wordings that fixed rejects** (sent as redos; most are not in `prompts.mjs`):

- Every NE description ends `; seen from behind, the shield's dark back and rim face the viewer in every frame, never its
  {silver / painted} face`. Without it the model swings a bright shield face round to the viewer in back views.
- Silver faces: "dull and dark" keeps them out of the near-white colour cut.
- Levelled clips in back views: add "never raised upright" after "the long spear stays level …".
- Falls: "his one spear falls with him, only one spear in every frame; no blood at all, no red spray, no splatter, no
  particles, no effects" (the model still paints bursts: cut and replace frames). For a cleaner fall: "he slumps … no
  wound is shown; the same {cloak and tunic} in every frame".
- A non-generic helmet in fast clips: "his head keeps facing {t} and the wide-brimmed Boeotian helmet keeps the same round
  shape in every frame, no crest, no plume".
- A spear parry: "the spearhead still towards his front the way he faces … the spearhead never swings behind him".
- Sword slash: the SW wording is `SWORD.slash` in `prompts.mjs` ("one short straight blade, perfectly straight and rigid
  in every frame, never bending or curving … no swoosh arc, no motion trail, no smear"). The back view that shipped (NE
  a3, last frame pinned to the guard): `we watch him from behind and he never turns round: he lifts the short straight
  sword up and back over his right shoulder, steps forward on his left foot with the tall oval shield pushed ahead, then
  chops the blade down hard in front of him away from the viewer, his back, cloak and helmet towards us in every frame,
  …; one shield on the left arm with its dark back towards the viewer; …`.
- Javelin throws, back and SE facings: spell out the line per facing and start from the guard: `seen from behind, his
  back to the viewer in every frame: he lowers the spear from upright straight forward into a throwing grip over his
  right shoulder, the spear lying along the line from his shoulder up and away to the upper right, its spearhead far
  out at the upper right and the butt just behind his shoulder; he leans back, then lunges forward to the upper right and
  hurls the spear; it flies away to the upper right out of the frame, spearhead first; his empty right hand follows
  through towards the upper right; the spear is never across his body and never points left or down; …` (SE: from the
  levelled guard, "the spear always lies along the line from his shoulder down and away to the lower right and never
  points up or to the left"). Javelineer: "he passes one javelin to his left hand, where it stays upright behind the
  small crescent pelte shield" first.
- Shield vanishing in a back-view run: "the tall oval shield held out on the left arm beside his body, clearly visible at
  his left side next to the cloak in every frame, never hidden behind the cloak".

**Lessons:** the dark-back line on every NE prompt from the start costs nothing and removes the NE shield-face rejects.
Every pixminimax sword cut draws a swoosh: budget frame replacements. Describe a back-view blow from behind and pin the
last frame. For a crimson-cloaked class blood residue joins the cloak group, so review every fall after the cut; never
clear "red" on a purple-cloaked class.

## 17. PixelLab mounted and chariot bases (I4b)

`create_character`, `mode: pro`, body humanoid (not the quadruped template), `style_character_id` H4, `view: high
top-down`, **`size: 100` for a rider, `128` for the chariot** (a rider at 128 came out 1.3–1.45x H4). Ids, boxes and
groups: `docs/v5/pixellab/mounted.json`.

Rider block after WHO: "seated astride a real full-size {warhorse}, the whole horse seen from muzzle to hooves to tail,
with realistic adult proportions: the rider seven heads tall, a small head in a snug helmet, natural arms, broad
shoulders, lean muscular build, his legs hanging down the horse's flanks; the horse a real horse with realistic
proportions, much bigger than the man, its back as high as a standing man's shoulders, a long neck and head, a deep
chest, exactly four long slender legs with hooves; {GEAR}; {WEAPON}; {HORSE}; heavy shadows, desaturated dark warm
colours like the style reference". Fills (short form):

- **companion:** open-faced Boeotian cavalry helmet "shaped like a folded sun hat, a wide downturned brim all round";
  royal-purple cloak over the horse's back, "the only purple on the figure"; bronze cuirass; no shield; "one long wooden
  xyston lance held upright in his right hand out at his right side, slanting a little forward, away from the horse's
  head and clearly visible in every direction"; "weathered dark bay-brown horse, dull and dark like old leather, with a
  dark umber-brown mane and tail".
- **thessalian:** conical pilos with a narrow brim; short crimson chlamys; umber jerkin; "one small plain round dark
  bronze buckler on his left forearm, no bigger than his chest, no emblem, no painted sign"; exactly two javelins upright
  in his right hand; dark dun-grey horse, black mane, sheepskin saddle cloth.
- **horse_archer:** tall pointed umber felt Scythian hood with ear flaps, no helmet; crimson felt riding coat, "the only
  red he wears"; no shield; "one large recurved composite bow held up in his raised left hand, out to his left side at
  the height of his head, the whole bow standing upright above the horse's back"; quiver on his back; right hand on the
  reins; dark brown horse, black mane.
- **chariot** (`size: 128`): "grim Carthaginian scythed war chariot seen whole from the horses' muzzles to the back of
  the car: a light two-wheeled chariot pulled by exactly two real full-size horses side by side under one yoke on a
  single wooden pole, each horse with exactly four long slender legs …; one driver standing upright in the open car …;
  he holds the dark leather reins in both hands; one curved iron kopis sword in a scabbard at his hip; the car a low dark
  wooden box with a dark bronze rim, two large spoked dark wooden wheels, one long curved iron scythe blade sticking out
  sideways from each wheel hub; two dark bay horses …".

**Lessons:** one humanoid pro character carries rider and horse; measure head and withers before clips. The style
reference's lambda leaks into round shields ("plain …, no emblem"). A weapon at the side hides behind the horse: raise
it clear of the horse's back. A black mane takes a dark cloak's colours: give the cloak a hue the horse lacks.

## 18. PixelLab mounted and chariot clips (I5c)

Every prompt word for word, by id, with the `subject_description` and `initial_pose` strings:
`docs/v5/pixellab/I5c/prompts.json`; jobs `docs/v5/pixellab/I5c/<class>.jobs.json`; tools `scripts/art/pixellab/i5c/`
and `mounted/` (`keyframe.mjs`, `loopfind.mjs`).

**Call settings:** `animate_image_pixminimax`, `first_frame_url` = the base rotation pasted on the class's work canvas
(riders 144 x 160 at 22,44; chariot 176 x 176 at 24,40; 1 generation per 12–16-frame clip), `view: high top-down`.
Loops: `last_frame_url` = the first frame (idle, walk) or a stretched mid-gallop key (`keep_first_frame: false`,
`initial_pose` "mid-gallop, the legs stretched out front and back") for gallop, charge and rout loops. Every prompt
ends "exactly four legs on the horse in every frame" (chariot: "exactly two horses, each with exactly four legs, in
every frame"). Back views open "seen from behind, the rider faces away the whole time", say "away from us, never back
towards us" of the weapon, and add "no dust". Riders swap one weapon phrase ("the lance held upright in his right hand
with its single spearhead at the top"; "the bow held up in his left hand; one bow only"; "the two javelins held upright
in his right hand, the buckler on his left arm").

| Clip | Shipped ids | The wording that matters |
| --- | --- | --- |
| idle, walk | C/H/T-idle-1, -walk-1/2, K-idle-1/2 | "a real horse's calm four-beat walk: left hind, left fore, right hind, right fore, one hoof lifting and setting down at a time" |
| gallop / charge loops | C-chargeloop-1/2, H-gallopLoop-1/2, entry strides | "one full stride of a real horse's heavy gallop in place …, a seamless loop: the hind legs push off one after the other, the front legs reach forward and strike the ground one after the other, then a moment of suspension with all four legs gathered under the belly, back to the stretched pose" |
| lance thrust | C-thrust-2 (SW), -3 (SE), -4 (NE, NW) | "a couched lance thrust with the horse's momentum behind it: the rider swings the lance down level under his right arm … the spearhead always points forward in the direction the horse faces, never backwards" (SE: "he never swings the lance back over his shoulder") |
| shoot | H-shoot-1, -2 (on the gallop key both ends) | "at a full gallop the rider shoots from the saddle: he reaches back over his right shoulder to the quiver and takes one arrow, nocks it … draws the string back to his cheek … releases … one bow only, one arrow at a time" |
| javelin throw | T-throw-4, -5 | "lifts one javelin high above his right shoulder, tilting it so its small head points forward and down towards the ground ahead of the horse, like a harpoon … flings it forward and down … the javelin head always points the way the horse runs" |
| stagger, hit | C/H/T-stagger-1/2, K-hit-1/2 | "the horse is struck and shies in fright: it flinches, throws up its head and rears half up on its hind legs … drops heavily back onto all four hooves" |
| fall | C-fall-2/3, H-fall-2/3/5/7, T-fall-1/2, K-wreck-1/2 | "the rider is thrown clear of the saddle and falls hard to the ground in front of the horse, apart from it, and lies still on his back"; horse archer back views: "the rider never rises above the saddle and never stands up: … slides sideways off its near side, towards us"; chariot: "the pole snaps, the car slews round, tips over onto one wheel … the driver is thrown out … no blood, no fire" |
| cheer | C/H/T-cheer-1/2 | "the horse rears up proudly on its hind legs, forelegs pawing the air, then comes down and prances on the spot" |
| rout | C-rout-1/2, C-routloop-1, H-rout-2/3/4, T-rout-1/2, K-rout-1/2 | "he hunches low over the horse's neck and twists his head to look back over his shoulder in fear" (back: "head down, facing forward away from us the whole time") |
| chariot drive, charge | K-drive-1/2, K-charge-1/2 | "the two spoked wheels spin fast and the scythe blades on the hubs whirl round with them; the car bounces"; charge: "the driver crouches low in the car, lashes the reins and swings his curved sword overhead" |

**Lessons:** a lance prompt must say *couched … the spearhead always points forward … never backwards*; an overarm
draw turns the lance round. Pin loops with `last_frame_url`; a gallop entry run often already holds an 8-frame stride
that loops (`loopfind.mjs`), else key a loop on a stretched frame. A keyed loop keeps the key's posture, so a rout or any
posture change must be in the entry run. Deaths need "thrown clear … apart from it" or the rider stays draped on the
horse. Shoot on the move: pin the clip to the gallop key both ends and rotate frames so the release frame matches
across facings. For a javelin say "lifts it overhead … head points forward and down … flings it forward and down", and
cut frames where the head turns back. Light dust at the hooves needs a lightness cut in the bottom rows (`dust.mjs`);
earth clods share the coat colours, so cut them by shape. A two-horse chariot animates as one figure on a 176 canvas.

## 19. PixelLab shieldless, two-handed and missile foot classes (I5b)

rhomphaia, celt_sword, archer, falx, gallic, slinger, fanatic. pixminimax, `view: high top-down`; jobs and picks
`docs/v5/pixellab/I5b/<class>.jobs.json`, `.picks.json`; tools `scripts/art/pixellab/i5b/`. `initial_pose` is the rest
pose (rotation, tall and die canvases) or the guard pose (stance clips, attack). Back facings open "seen from behind,"
and drop what only shows from the front. Frames: guard 8, look and walk 16, attack 16, the rest 12.

**The recipe:** an 8-frame "takes his guard" clip (tall canvas, last frame = the guard) is the first frame for every
stance clip and the attack; the attack starts and ends on it so it joins `ready`. Stance and move clips are §15's with
the weapon slot swapped. The rhomphaia set as the template:

- subject `a tall grim Thracian rhomphaia warrior in an open-faced dark bronze Phrygian helmet, a dark crimson cloak, a dark iron scale corselet, dark brown trousers and dark bronze greaves, no shield, one long rhomphaia: a wooden shaft and a long slightly curved single-edged iron blade`; guard pose `in a low fighting guard, both hands on the shaft, the long curved blade pointed forward low ahead of him, knees bent`
- guard: `he takes his fighting guard in place: he grips the shaft with both hands, right hand at his right hip and left hand in front of his chest, and lowers the rhomphaia forward so the long curved iron blade points ahead of him towards the viewer's lower left at head height, the edge down, ready to strike; knees bent, the left foot a little forward; one rhomphaia only, both hands on the shaft at the end; no shield, no effects` (back: `seen from behind, his back and cloak to the viewer in every frame, … he keeps facing away towards the upper right, he does not turn round`)
- slash: `a heavy two-handed cleaving cut towards the viewer's lower left: from his low guard he heaves the rhomphaia back and up over his right shoulder with both hands on the shaft, steps forward onto his left foot with the hips turning first, and brings the long blade down hard in a diagonal arc from above his right shoulder to low at his left in front of him, the edge leading, the body following through low and bent forward, then he settles back into his low guard with the blade pointed forward; both hands on the shaft the whole time; the blade keeps its own long, slightly curved shape and size in every frame; one rhomphaia only; no smear, no sparks, no motion trails, no blood, no effects`
- stance clips: `both hands stay on the shaft and the long curved iron blade stays pointed forward towards the viewer's lower left in every frame; one rhomphaia only`; block catches the blow "on the wooden shaft"; kneel "leaning his weight on the rhomphaia planted upright beside him like a staff"

**The other attacks** (shipped; the shared tail is "no smear, no sparks, no motion trails, no blood, no effects"):

- **celt_sword** slash (guard: shield rim at his chin, longsword raised over its right edge): `a heavy one-handed cutting blow at an enemy in front of him towards the viewer's lower left: from his guard he draws the longsword back high over his right shoulder, then steps forward onto his left foot with the hips and shoulders turning, driving the tall shield forward with his body, and brings the long blade down hard in a diagonal arc into the enemy in front of him, ending low ahead of his left knee with the point still towards the viewer's lower left, then he recovers back into his guard behind the shield; he keeps facing the viewer's lower left in every frame; the shield stays on his left arm; one sword only, the straight blade keeps its shape and size; …` (back: `… his body keeps facing the upper left the whole time, he never turns round or sideways to the viewer`)
- **gallic** slash: the celt's with the axe, `he lifts the war axe straight up high over his right shoulder without turning away … his face and chest stay towards the viewer's lower left in every frame, he never turns his back or turns round`; block `takes cover in place: he crouches a little and pulls the tall oval shield up higher in front of his body until its rim is at his eyes … he does not turn`
- **falx** slash: the rhomphaia's as `a heavy two-handed hooking cut at an enemy in front of him … into the enemy in front of him, the inner edge leading … he keeps facing the viewer's lower left`
- **fanatic** slash: `a frenzied heavy hacking blow …: from his crouch he rears up and hauls the heavy curved kopis far back over his right shoulder, the whole body coiling, then lunges forward onto his left foot and hacks down hard with all his weight behind it, … ending low ahead of his left knee with his body bent forward over it, then he wrenches the blade back up and drops back into his crouch; his face and chest stay towards the viewer's lower left in every frame, he never turns his back; one kopis only, …`
- **archer** shoot (from the rest): `he shoots an arrow at an enemy ahead of him towards the viewer's lower left: he draws one arrow from the quiver over his right shoulder and nocks it on the string, turns side-on and raises the bow in his straight left arm towards the target, pulls the string back with his right hand all the way to his cheek, his back and right shoulder drawn tight, holds a moment, then releases: the string snaps forward, the bow arm recoils and the arrow is gone at once, his right hand flies back past his ear in the follow-through, then he lowers the bow to his side; one bow only, a single curved limb; no second bow, no effects, no motion trails`
- **slinger** sling (from the rest): `he slings a lead bullet at an enemy far ahead of him towards the viewer's lower left: he turns side-on with his weight on the back foot, raises the loaded sling over his head in his right hand and whirls it round in fast flat circles above his head, the two cords taut and the loaded pouch circling at their end, his left arm pointing at the target; then he steps forward onto his left foot and whips his right arm forward and down, letting one cord go: the pouch snaps open and the bullet is gone at once, the empty sling flicks forward past his left hip in the follow-through, then he lowers it to his side; one sling only, in the right hand; no flying bullet, no motion trails, no effects`
- Clean deaths (gallic, slinger, fanatic): `dying in battle: his strength suddenly gives out, his knees buckle and he topples over backwards … his body stays clean, no wounds, no red, no blood at all, no effects`

**Lessons:** at the blow pixminimax bends any blade into a crescent smear: drop those frames and hold the windup's peak.
Name the enemy and where the blow ends, or the cut drifts across the body and the man turns with it. For back facings
say what the body keeps doing, not only "seen from behind"; for a back-view look, "his back and the back of his head
stay to the viewer in every frame, his face never shows". Never ask the archer to handle the bow with both hands at rest
("flexes", "tests the string"): it draws a second bow. Loosed arrows, bullets and motion arcs come anyway: clear the
detached pieces (the game draws the missile). "Killed … he is struck" brings blood over the chest; drop such frames, a
colour cut holes the figure. A block "at a blow" turns him side-on; "takes cover … he does not turn" holds the facing.
A back-facing flee drifts off the 68 canvas unless told "on the same spot … he does not move away". A parry with a
blade brings a spark burst nearly every time. From behind the cloak hides a sling at the side (fixed in §20).

## 20. PixelLab polish of the I5b sheets

Every job word for word, with its first frame: `docs/v5/pixellab/I5b/polish.prompts.json`; tools
`scripts/art/pixellab/polish/`. Fixed fields as §19; the first frame is the exact input of the clip being replaced
(`polish/first.mjs`), or the new guard's last frame for clips re-run from a new guard. The wordings that worked:

- **A weapon's own shape, from behind** (falx NE guard): `… swings the falx forward and down so its curved iron blade
  reaches ahead of him … the falx keeps the shape it has at rest in every frame: a long blade curving forward with its
  point turned in at the tip like a sickle, dark iron, the same size as at rest …`.
- **Which hand, from behind** (gallic NW guard): `… the tall oval shield … on his left arm, on the viewer's left, and
  raises the war axe in his right hand on the viewer's right … clear of the shield and away from it … the axe stays in
  his right hand on his right side in every frame, it never crosses over the shield …`.
- **A sling not hidden by the cloak** (slinger NW walk / run): `his right arm swings out a little away from his body at
  his right side with the leather sling hanging from his right fist, the two cords and the pouch swinging clear of his
  body on the viewer's right in every frame; the short cloak hangs only down the middle of his back and never covers his
  right arm or the sling`.
- **A weighted blow** (slinger SE stab, archer NE stab): `draws … far back … with his weight on his back foot, then
  lunges forward onto his left foot … his hips and shoulders turning into the blow and his whole body following through,
  bent forward over it`; the archer adds `the bow thrusts straight forward, not upward`.
- **No enemy drawn:** open with `he alone, no other person in the frame:` and say `at the empty air in front of him …,
  as if at an enemy's head` and `only him, no enemy drawn`.
- **A fall backwards from behind** (fanatic NE / NW): `seen from behind, dying in battle: his strength suddenly gives out,
  he rocks back on his heels with his chest and head thrown back and his arms flung out, and topples over backwards
  towards the viewer's lower left / right … lying still face up; he falls backwards, never forwards, his head ends
  nearest the viewer …`.

**Lessons:** name the weapon's shape by the rest pose ("the shape it has at rest … the same size as at rest") rather than
an image ("a hook like a beak" drew a shepherd's crook). From behind, "left / right" alone is ambiguous: add "on the
viewer's left / right". "Onto the enemy's head" can make the model draw the enemy. A back-facing (NE) melee blow with a
short weapon still turns him to the camera; two re-runs did not fix it.

---

## 21. Global war world (ART-1)

Design prototypes for [docs/WAR.md](../WAR.md) § World, not assets. Raw renders: `shots/war/gemini/<job>/`
(git-ignored). Gemini 3.1 Pro, typed prompts; one chat for the world map, one chat for the four region maps so they
share a style. **Downloads failed this run:** "Download full size" fetched the file but nothing reached `~/Downloads`
(not even an `<a download>` of the blob), so each render was saved as its 1024x1024 in-page preview: shown 1:1 in a
fixed overlay, captured in 512 px tiles, stitched with `ffmpeg … hstack/vstack`. Regenerate at full size once
downloads work.

**World map, first prompt** (`worldmap/ART1_worldmap_1.png`: rejected, about 15 regions, no home tints, no visible pass):

```
Create an image. ROLE: a design prototype of the strategic world map for a dark, epic ancient-Mediterranean war strategy game, seen straight from above like a satellite view painted by hand. ASPECT: square 1:1, highest resolution available. STYLE: top-down hand-painted terrain map, dark muted epic palette (weathered bronze, umber, olive, slate blue sea, dark crimson accents), soft painted relief shading with light from the upper left so mountains and cliffs read as raised; everything organic and natural: irregular coastlines, meandering rivers with tributaries, mountain chains with foothills; no grid, no hexes, no geometric shapes, no straight lines except borders that follow terrain. GEOGRAPHY (one continent filling most of the square, dark sea all around): (1) CENTRE: a high flat-topped mesa plateau with sheer cliff edges, a small round crater lake on top and the ruins of a small temple city beside it; four ramps lead down from it, to the north, east, south and west. (2) NORTH: a jagged snowy mountain chain runs from the plateau straight north to the north coast, ending in glaciers at a cape; it has exactly one narrow pass in its middle. (3) SOUTH: one big river rises on the plateau, drops through a gorge with a waterfall, flows south across the land (with one long island in its widest part) and ends in a wide marshy delta at the south coast. (4) WEST: a smaller river flows west from a dense dark forest below the plateau into a big reed-fringed lake, then on to an estuary with sea stacks on the west coast. (5) EAST: a sand dune sea and a maze of red rock canyons with mesas east of the plateau, reaching white salt flats on the east coast. (6) NORTH-WEST quadrant: cold pine and oak forested hills, a lake valley, fjords on the coast; one small walled town in the middle. (7) NORTH-EAST quadrant: open green-gold grass steppe with small round burial mounds, chalk cliffs on the coast; one small walled town in the middle. (8) SOUTH-EAST quadrant: desert edge with a green palm oasis on a river terrace, red cliffs, lagoons and dunes on the coast; one small walled town in the middle. (9) SOUTH-WEST quadrant: terraced olive hills round a sheltered bay, rocky coves and a cape; one small walled town on the bay. REGION BORDERS: the land is divided into about 37 regions of different, irregular, organic shapes by thin pale dotted lines that follow ridges, rivers and coasts; the four home regions with the walled towns have their border line tinted in a faint colour each (north-west dark green, north-east bronze-gold, south-east terracotta, south-west deep blue); every other border line is pale cream. Nothing else: no text, no labels, no letters, no numbers, no legend, no compass rose, no icons, no units, no armies, no animals, no ships, no roads, no extra towns or villages, no frame or border around the image, no UI; nothing else.
```

**World map, same-chat fix** (`worldmap/ART1_worldmap_2.png`: kept):

```
Create a NEW image with the same prompt, but fix three things: (1) REGION BORDERS: the land must be cut into many more regions, about 37 in total, each roughly the same size (like the provinces of a strategy board game but with organic shapes); draw every border as a clearly visible pale cream dashed line, thicker than now, following ridges, rivers and coasts; there are no other lines on the map (no roads, no paths radiating from the towns); (2) the four home regions around the four walled towns must each be filled with a faint transparent colour wash inside their border: north-west dark green, north-east bronze-gold, south-east terracotta, south-west deep blue; (3) the snowy mountain chain in the north must show one clearly visible narrow pass (a thin gorge cutting across the chain from west to east) halfway between the plateau and the north coast. Keep everything else from the first prompt: the same geography, style, palette and the same list of what must not appear; nothing else.
```

**Region map block R** (the body of every region prompt, word for word; `{…}` is the per-region part in the table):

```
ROLE: a design prototype of one detailed region map for a dark, epic ancient-Mediterranean real-time war strategy game; armies of tiny soldiers will later move across it. ASPECT: square 1:1, highest resolution available. VIEW: strictly top-down (straight down, no perspective, no horizon, no sky). STYLE: detailed top-down pixel-art game terrain, dark muted epic palette (weathered bronze, umber, olive, slate, dark crimson accents), no pure black or white, soft relief shading with light from the upper left so height reads clearly: higher ground lighter, cliffs drawn as dark rock faces on their lower-right side; everything organic and natural: irregular shorelines, meandering water, ridges with foothills; no grid, no hexes, no tiles visible, no geometric shapes. The map fills the whole square edge to edge. REGION: {REGION}. ELEMENTS (only these): {ELEMENTS}. Nothing else: no text, no labels, no letters, no numbers, no icons, no soldiers, no people, no animals, no monsters, no carts, no ships, no flags, no frame or border around the image, no UI, no compass, no legend; nothing else.
```

Openings: the first region `Create an image.`; the entry and pass `Create a NEW image, not an edit of the previous one.
Match the previous image exactly in style, palette, pixel density, lighting and top-down view; change only the
region.`; the river `Create a NEW image, not an edit of the previous one. Match the Ladon Oakwood map exactly in
style, palette, pixel density, lighting and strictly top-down view (looking straight down, no sky, no horizon); change
only the region.`

| Job / file | REGION | ELEMENTS | Verdict |
| --- | --- | --- | --- |
| region-home / `ART1_elaia_1.png` | `Elaia, the south-west home region of one alliance: terraced olive hills round a sheltered bay` | `(1) a sheltered bay of dark blue sea in the lower-left third, with a pale sand beach along its inner shore; (2) a rocky headland on the bay's west side rising high above the sea with cliffs, and on its top a small walled citadel with stone walls and a few tiled roofs; (3) a small walled town of tiled-roof houses and one temple on the bay shore below the headland, with a small stone harbour mole; (4) the rest of the land: rising hills stepped into many curving olive terraces that follow the contour lines, olive trees in rows on the terraces, a few dark cypress trees; (5) one shallow stream winding from the hills in the upper right down to the bay; (6) one dirt road from the town that forks and leaves the map at four points: the top edge, the right edge, the bottom edge east of the bay, and the left edge north of the headland; (7) a few grey rock outcrops on the highest hilltop in the upper right` | kept, first try; sea runs down the whole left edge, the road leaves only at the top, right and bottom |
| region-entry / `ART1_ladon-oakwood_1.png` | `Ladon Oakwood, a big neutral entry region in front of a home: an old oak forest along a shallow river` | `(1) dense dark old oak forest covering about half of the map in irregular organic patches, with clearings of grass between them; (2) one shallow clear river winding from the top edge down to the bottom edge in wide meanders, with gravel banks; two fords where it is visibly shallow and wide with pebbles; (3) one forested hill clearly higher than the rest in the upper-left quarter, with a rocky top; (4) low wooded banks along the river; (5) one wide dirt road crossing the map from the left edge to the right edge through both fords, with a broad band of open grass about four times the road's width on both sides of it, kept free of trees; (6) a few fallen logs and mossy boulders in the forest` | kept, first try; one ford instead of two, the open no-build band is narrow |
| region-pass / `ART1_kleisoura_1_rejected.png` | `Kleisoura Pass, the only gap through a chain of impassable snowy mountains` | `(1) huge jagged grey mountains with snow on their peaks filling the top third and the bottom third of the map, clearly impassable, with sheer cliffs; (2) between them a narrow rocky gorge running from the left edge to the right edge; at its narrowest point in the left half the gorge floor is only a thin strip between two vertical cliff walls; (3) in the right half the gorge widens and a dirt road climbs in switchbacks up to a high saddle; (4) on the saddle the ruins of a small square stone fort with broken walls; (5) along both gorge walls, a few narrow rock ledges above the gorge floor, reachable by short side paths; (6) one small fast mountain stream along the gorge floor with patches of scree and boulders; (7) a few twisted pine trees on the ledges and on the saddle` | rejected: the top half is a side view of peaks against a sky |
| region-pass / `ART1_kleisoura_2.png` | same-chat fix, below | — | kept: the bottom range is truly top-down; the top range stays oblique, with a sliver of sky in the top-left corner |
| region-river / `ART1_achelous-ford_1.png` | `Achelous Ford, a neutral river region where a great river is at its widest, with a marshy floodplain` | `(1) one very wide, deep, dark-blue river flowing from the top edge to the bottom edge in a gentle curve, filling about a third of the map; (2) a long narrow island in the middle of the river with grass and a few willow trees; (3) one ford: a band of visibly shallow, light-coloured water with sandbars crossing from the left bank to the island and from the island to the right bank, in the upper half; (4) one ruined stone bridge in the lower half with a broken gap in its middle span; (5) on both banks a reed marsh floodplain with small pools, reed beds and muddy channels; (6) beyond the marsh, firm grass land along the left and right edges with a few trees; (7) one dirt road reaching the river from the left edge and from the right edge at the ford and at the ruined bridge` | kept, first try; the ford crosses bank to bank above the island instead of through it; captured at device-pixel ratio 1.5 and scaled back to 1024 |

Pass fix (same chat):

```
Create a NEW image with the same prompt, but fix the view: the top half was drawn as a side view of mountains with sky. Draw the whole map strictly from directly overhead like the Ladon Oakwood map before it: we look straight down on the mountain tops, so the peaks are seen from above as snowy ridgelines with shaded slopes falling away on both sides, never as triangles against a sky; no sky, no horizon anywhere. Keep everything else from the first prompt: the gorge running from the left edge to the right edge between mountains filling the top and bottom thirds, its narrowest point in the left half, the switchback road up to the saddle with the ruined square fort in the right half, the ledges, the stream, the scree and the few pines, the same style and palette, and the same list of what must not appear; nothing else.
```

**Lessons:** ask for the region count *and* "roughly the same size, like the provinces of a strategy board game" and
"no other lines": the first render had about 15 regions and roads radiating from the towns. Gemini washes a whole
quadrant (the home plus its entries) rather than one region, so ownership colour belongs in code. Mountains drift to a
side view (peaks against a sky) even with "strictly top-down"; "seen from above as ridgelines, never triangles against
a sky" fixes the near range, the far range stays oblique. Counts of small features (two fords) and wide clear bands
are not held.

### 21b. ART-2: pixel-art world map and isometric regions

Owner direction (2026-10-19): the strategic map is **pixel art**, region maps are **true isometric** (W-16), tin
sits only in Kleisoura and Achelous. Raw renders: `shots/war/gemini/art2/<job>/` (git-ignored), Gemini 3.1 Pro,
8 generations. One chat for the world map, one chat for all six regions.

**Capture (downloads still fail):** "Download full size" once more put nothing in `~/Downloads` (nor anywhere under
`~`), the extension cannot open `chrome://downloads`, and a `fetch` from the page to a localhost receiver is
blocked. What works, lossless and in one shot: draw the newest `<img>` (naturalWidth > 300, not the overlay) on a
canvas, show `toDataURL('image/png')` in a fixed full-screen overlay at **512 CSS px** (devicePixelRatio is 2,
`image-rendering: pixelated`), then `computer zoom` on region 0,0–512,512 with `save_to_disk` gives the 1024x1024
PNG; copy it from the screenshot folder. Exclude the overlay `<img>` when waiting for the next render.

**World map** (`worldmap/ART2_worldmap_1.png`: kept with drift; pixel art and all four tints right, but a stream
runs down the mountain chain instead of a west-east pass, and the four homes are drawn as circles):

```
Create an image. ROLE: a design prototype of the strategic world map for a dark, epic ancient-Mediterranean war strategy game. ASPECT: square 1:1, highest resolution available. VIEW: straight from above. STYLE: crisp PIXEL ART, like a hand-made 16-bit strategy game map: visible square pixels, limited dark muted epic palette (weathered bronze, umber, olive, slate blue sea, dark crimson accents), no pure black or white, dithered shading, relief shown with light from the upper left so mountains and cliffs read as raised; not a painting, no smooth gradients, no blur. Everything organic: irregular coastlines, meandering rivers, mountain chains with foothills; no grid, no hexes. GEOGRAPHY (one continent filling most of the square, dark sea all around): a high flat-topped mesa plateau with sheer cliffs and a small round crater lake in the exact centre; a jagged snowy mountain chain from the plateau straight north to the north coast with one narrow pass cutting across it halfway; one big river rising on the plateau, falling through a gorge and flowing south (with one long island) to a marshy delta on the south coast; a smaller river flowing west from a dark forest below the plateau into a big reed lake and on to an estuary with sea stacks on the west coast; a sand dune sea and red rock canyons east of the plateau reaching white salt flats on the east coast; north-west: cold pine forest hills, a lake valley, fjords; north-east: green-gold grass steppe with small burial mounds, chalk cliffs; south-east: desert edge with a palm oasis on a river terrace, red cliffs, lagoons and dunes; south-west: terraced olive hills round a sheltered bay, coves and a cape. REGIONS: the land is cut into exactly 37 regions, each a distinct irregular organic shape of roughly similar size, like the provinces of a strategy board game; every border is a clear, unbroken light-cream pixel line two pixels wide following ridges, rivers and coasts, and every region is fully enclosed by its border. The 37 regions, by position: (1) Omphalos, the plateau in the centre; four gate regions touching it: (2) Eagle Saddle north of it, (3) Red Canyons east, (4) Gorge of the Falls south, (5) Erymanthos Wood west; four mid regions on the axes: (6) Kleisoura Pass in the north, across the mountain pass, (7) Ammos Dunes in the east, (8) Achelous Ford in the south on the big river, (9) Lake Stymphalia in the west; four inner regions on the diagonals next to the gates: (10) Grey Moors north-west, (11) Kimmerian Hills north-east, (12) Lion Savanna south-east, (13) Bacchae Hills south-west; four coastal edge regions in the middle of each coast: (14) Krios Glacier at the north cape where the mountains meet the sea, (15) Ammon Salt Flats on the east coast, (16) Achelous Delta on the south coast, (17) Siren Estuary on the west coast; four home regions, one in each quadrant, each with one small walled town in its middle: (18) Dodona north-west, (19) Skythia north-east, (20) Kyrene south-east, (21) Elaia south-west; and round each home a ring of four entry regions, one on each side of it: around Dodona (22) Boreas Fjords north, (23) Teeth Foothills east, (24) Ladon Oakwood south, (25) Western Heath west; around Skythia (26) Frost Steppe north, (27) Chalk Coast east, (28) Kurgan Hills south, (29) Teeth Eastern Slopes west; around Kyrene (30) Thornscrub Rise north, (31) Lagoon Coast east, (32) Southern Dunes south, (33) Eastbank Floodplain west; around Elaia (34) Lakeshore Fens north, (35) Pirate Coves west, (36) Cape of Winds south, (37) Westbank Vineyards east. COLOUR: only the four home regions (18 to 21) are filled with a faint transparent colour wash inside their own border and nowhere else: Dodona dark green, Skythia bronze-gold, Kyrene terracotta, Elaia deep blue; the entry rings and all other regions keep the natural terrain colours. Nothing else: no text, no labels, no letters, no numbers, no legend, no compass rose, no icons, no roads, no units, no armies, no animals, no ships, no towns other than the four walled towns, no frame or border around the image, no UI; nothing else.
```

Same-chat fix (`worldmap/ART2_worldmap_2.png`: kept, best so far; the stream is gone and a border splits the chain
into a north and a south block, but no gorge is drawn and the homes stay round; Gemini treated it as an edit):

```
Create a NEW image with the same prompt, but fix three things: (1) the snowy mountain chain north of the plateau must show one clearly visible narrow pass: a thin gorge cutting straight across the chain from west to east, halfway between the plateau and the north coast, so the chain is split into a northern and a southern block; there is no river running along the chain; (2) the four home regions with the walled towns must have irregular organic outlines that follow the terrain like every other region, not circles; keep their faint colour washes (north-west dark green, north-east bronze-gold, south-east terracotta, south-west deep blue) inside their own border only; (3) keep exactly 37 regions, each fully enclosed by a clear unbroken light-cream pixel border. Keep everything else from the first prompt: the same pixel-art style, palette, geography, region layout and the same list of what must not appear; nothing else.
```

**Isometric region block I** (word for word in every region prompt; `{…}` is the per-region part below):

```
ROLE: a design prototype of one detailed region map for a dark, epic ancient-Mediterranean real-time war strategy game; armies of tiny soldiers will later move across it. ASPECT: square 1:1, highest resolution available. VIEW: true ISOMETRIC game view, 2:1 dimetric projection (ground lines run at about 26.6 degrees, like classic isometric strategy games): the whole region is one diamond-shaped block of land seen from above at an angle, floating on a plain very dark umber background; terrain has real raised height: hills, plateaus, river banks and cliffs rise as solid blocks whose side faces are visible as vertical rock or earth walls; the cut edges of the diamond show the earth layers. No perspective, no vanishing point, no horizon, no sky. STYLE: detailed pixel-art game terrain, visible square pixels, dark muted epic palette (weathered bronze, umber, olive, slate, dark crimson accents), no pure black or white, light from the upper left: top faces lit, left-facing walls mid-tone, right-facing walls dark; everything organic and natural: irregular shorelines, meandering water, ridges with foothills; no visible grid or tile lines, no hexes, no geometric shapes. REGION: {REGION}. ELEMENTS (only these): {ELEMENTS}. Nothing else: no text, no labels, no letters, no numbers, no icons, no soldiers, no people, no animals, no monsters, no carts, no ships, no flags, no frame, no UI, no compass, no legend; nothing else.
```

Openings: Elaia `Create an image.`; every later region `Create a NEW image, not an edit of the previous one. Match
the previous image(s) exactly in style, palette, pixel density, lighting and isometric diamond-block view; change
only the region.` Extra words in the closing list: Omphalos `no statues of monsters`, Southern Dunes `no camels`,
Stymphalia `no birds` and `no boats`.

| Job / file | REGION | ELEMENTS | Verdict |
| --- | --- | --- | --- |
| elaia / `ART2_elaia_1.png` | `Elaia, the south-west home region of one alliance: terraced olive hills round a sheltered bay` | `(1) a sheltered bay of dark blue sea cutting into the left corner of the diamond, with a pale sand beach along its inner shore; (2) a rocky headland on the bay's far side rising high above the sea on tall cliff walls, and on its top a small walled citadel with stone walls and a few tiled roofs; (3) a small walled town of tiled-roof houses and one temple on the bay shore below the headland, with a small stone harbour mole; (4) the rest of the land: hills rising in many curving olive terraces, each terrace a low raised step with a visible stone retaining wall, olive trees in rows on the terraces, a few dark cypress trees; (5) one shallow stream winding from the highest hills down to the bay in a small cut; (6) one dirt road from the town that forks and leaves the diamond at the middle of its four edges; (7) a few grey rock outcrops on the highest hilltop near the right corner` | kept, first try; terraces read as real steps, headland cliff wall good; the road leaves at two edges, not four |
| kleisoura / `ART2_kleisoura_1.png` | `Kleisoura Pass, the only gap through a chain of impassable snowy mountains` | `(1) two huge masses of jagged grey mountain with snow on their tops, one along the top-left edge and one along the bottom-right edge of the diamond, rising far above everything else as tall blocks with sheer vertical cliff walls, clearly impassable; (2) between them a narrow rocky gorge running across the diamond from the left corner to the right corner; at its narrowest point, in the left half, the gorge floor is only a thin strip between two vertical cliff walls; (3) in the right half the gorge widens and a dirt road climbs in switchbacks up to a raised saddle; (4) on the saddle the ruins of a small square stone fort with broken walls; (5) along both gorge walls a few narrow raised rock ledges above the gorge floor, reached by short side paths; (6) one small fast mountain stream along the gorge floor, with patches of scree and boulders; (7) one small seam of dark tin-bearing rock with a few spoil heaps at the foot of one gorge wall; (8) a few twisted pine trees on the ledges and on the saddle` | kept, first try; no sky at last (the iso block cures the side-view drift); the gorge runs along the diamond's long axis and the narrows are not pinched |
| achelous / `ART2_achelous_1.png` | `Achelous Ford, a neutral river region where a great river is at its widest, with a marshy floodplain` | `(1) one very wide, deep, dark-blue river flowing across the diamond from the top corner to the bottom corner in a gentle curve, filling about a third of the land, sunk below the land with low earth bank walls visible on both sides; (2) a long narrow raised island in the middle of the river with grass and a few willow trees; (3) one ford in the upper half: a band of visibly shallow, light-coloured water with sandbars, crossing from the left bank to the island and from the island to the right bank; (4) one ruined stone bridge in the lower half, standing on piers, with a broken gap in its middle span; (5) on both banks a low reed-marsh floodplain with small pools, reed beds and muddy channels; (6) beyond the marsh, firm grass land one step higher along the left and right edges, with a few trees; (7) one small grey gravel bar of tin-bearing stream sand with a few spoil heaps at the edge of the ford; (8) one dirt road reaching the river from the left edge and from the right edge at the ford and at the ruined bridge` | kept, first try; the ford now goes through the island; Gemini sparkle watermark in the bottom-right corner |
| omphalos / `ART2_omphalos_1.png` | `Omphalos Plateau, the centre of the world: a high mesa with a ruined temple city` | `(1) a huge flat-topped mesa filling most of the diamond, raised far above a narrow band of low rocky ground round its foot, with a sheer, tall vertical cliff wall all the way round its rim, irregular and organic in outline; (2) exactly four ramps cut into the cliff, one at the middle of each of the four diamond edges, each a steep narrow road climbing from the low ground to the top; (3) on top, a round crater lake of deep dark-blue water sunk into the plateau with its own small inner cliff walls, slightly off centre; (4) beside the lake, a ruined temple city of broken marble columns, roofless pale marble temples, fallen walls and paved streets; (5) at the temple's foot, one dark stone entrance stair leading down into the ground; (6) a few pale marble quarry cuts stepped into the plateau edge, and one small cave mouth with silver-grey ore in the cliff wall; (7) dry grass, rocks and a few wind-bent trees on the plateau top` | kept with drift: two ramps (one a stair), not four; one temple and loose columns, not a city; no stair down; the mesa is only moderately high |
| kyrene-desert / `ART2_southern-dunes_1.png` | `Southern Dunes, a desert entry region south of the oasis home Kyrene: a dune field running down to the sea` | `(1) a field of tall ochre and rust-coloured sand dunes covering most of the diamond, with curving crests, wind ripples and soft shadowed lee slopes, rising in several heights; (2) dark slate-blue sea along the bottom-right edge of the diamond, with a pale wet beach and a low sand bluff above it; (3) one high flat-topped outcrop of red rock near the centre, rising far above the dunes on sheer vertical red cliff walls, with a stone well and a small stone basin on its top and one narrow path climbing to it; (4) a few low red rock ribs breaking through the sand; (5) one shallow dry wadi with a gravel bed winding from the top edge toward the sea; (6) patches of white salt crust in a low hollow near the beach; (7) a few clumps of dry grass and two or three dead thorn trees; (8) one faint caravan track of trodden sand from the top corner to the outcrop and on to the left corner` | kept, first try; every element present; the dunes are smooth gradients, less crisp than the other regions |
| stymphalia / `ART2_stymphalia_1.png` | `Lake Stymphalia, a neutral lake region: a big reed lake between two homes` | `(1) one big deep lake of dark slate-blue water filling the middle of the diamond, irregular and organic in outline, sunk below the land; (2) a wide ring of reed marsh round the lake: reed beds, shallow green-brown water, mud flats and small pools, lowest along the left and bottom shores; (3) one raised causeway of packed earth and stones, a little above the water, crossing the shallow marsh and the lake's narrow neck from the left corner to the right corner; (4) one wooded island in the lake, raised high on low rocky cliff walls, with dark trees and one rocky top; (5) one shallow river entering the lake from the right corner side and one leaving it toward the left corner side; (6) firm grass ground one step higher along the top edges, with a few oaks and willows; (7) a few dead grey trees standing in the marsh water; (8) one dirt road on the firm ground reaching both ends of the causeway` | kept with drift: the causeway skirts the marsh instead of crossing the lake, a road rings the lake, the lake is a rounded rectangle; watermark bottom-right |

**Lessons:** the isometric diamond block is the strongest framing yet: no sky drift, cliffs read as walls, and six
regions in one chat share one look. Gemini keeps element lists but not counts or routes ("four ramps", "the road
leaves at four edges", "the causeway crosses the neck"), so ramps, exits and crossings belong in the region editor.
A same-chat "fix" reuses the old render almost pixel for pixel; use a new chat when the layout must change. Home
regions came out as circles both times: say "irregular outlines, not circles" in the first prompt.

## 22. Global war — PixelLab map spike (ART-3)

A short spike for W-19: can PixelLab build true-scale iso region art? Raws, the mock-up and its script
(`mock.mjs`, uses `scripts/art/lib/`) are in `shots/war/pixellab/spike/` (git-ignored). 35 generations
(2 x 10 for `create_tiles_pro` transition sets, 10 for the independent tiles, 1 per tile/object); VFX and
`create_map` are free.

| Call | Settings | Prompt (verbatim) | Result |
| --- | --- | --- | --- |
| `create_tiles_pro` `92268610-…` | isometric, 64, low top-down, segmentation, max_colors 48, seed 31 | `1). dark muted grass, olive-brown tufts 2). dry umber dirt ground 3). dark grey weathered rock 4). pale dull sand 5). shallow murky slate-blue water over pebbles 6). deep dark slate-blue water 7). grass top with a tall dark brown rock cliff side 8). dirt top with a tall dark brown rock cliff side` | 16 tiles (2 per item), good palette, but the diamond is **64 x 21**, not 2:1: low top-down is ~20 deg. Independent tiles need `tile_view_angle: 30` for 2:1 |
| `create_tiles_pro` `4dd226e7-…` | isometric, 64, low top-down, `tile_feature: tileset`, seed 31 | `dark muted olive grass to dry umber dirt, dark epic desaturated ancient Greek hillside` | kept: 16-tile corner set, 64 x 48 (2:1 top 64 x 31 + 17 px earth side), mask `NW<<3\|NE<<2\|SW<<1\|SE`, set bit = grass; NW = top vertex, NE = right, SW = left, SE = bottom |
| `create_tiles_pro` `a7097915-…` | same, tileset | `dark muted olive grass to shallow murky slate-blue water with a narrow muddy bank, dark epic desaturated ancient Greek river` | kept: water bit 0, grass bit 1; its grass is a little yellower than the dirt set's (sets cannot be chained) |
| `create_isometric_tile` `b72e27c6-…` | 64, block, highly detailed, detailed shading, seed 31 | `block of dark brown layered rock cliff with dark muted olive grass on top, dark epic desaturated colours` | exact 2:1 (64 x 32 top + 32 px side), but reads as brick, not rock; max size 64 |
| `create_map_object` `e72f6356-…` | 200 x 200, high top-down, high detail, detailed shading | `one gnarled old olive tree, thick twisted grey-brown trunk, wide rounded crown of dark muted grey-green olive leaves, seen from a high isometric three-quarter view, dark epic desaturated colours, heavy shadows` | kept, 6 m; adds a square grass base: next time add "no ground under it" |
| `create_map_object` `f4cd85fe-…` | 200 x 400, same | `one tall dark Mediterranean black pine tree, straight dark brown trunk, layered dark muted green needle canopy, seen from a high isometric three-quarter view, dark epic desaturated colours, heavy shadows` | kept, 12 m; came back on an **opaque grey ground** (keyed out by flood fill; holes inside the crown stay grey) |
| `create_map_object` `0e450639-…` | 96 x 72, same | `one large weathered dark grey granite boulder with moss in the cracks, seen from a high isometric three-quarter view, dark epic desaturated colours, heavy shadows` | kept; moss too lime: remap to the dark palette |
| `create_map_object` `8181ffaf-…` | 176 x 368, same | `one ancient Greek square stone watchtower, rough dark grey ashlar blocks, three storeys, small dark window slits, a wooden door at the bottom, a crenellated top with a dark wooden roof platform, seen from a high isometric three-quarter view showing two walls, dark epic desaturated colours, heavy shadows` | kept, 11 m, true iso walls; opaque grey ground again; a little medieval (crenels) |
| `vfx_workbench` effect `9d926b0e-…` | preset `smoke_puff`, ramp `#2a2118 #4a3a2a #6b5640 #8a7458`, size 16, canvas 48 x 40 | — | dust puff, 8 frames @ 12 fps, free; last 2 frames blank |
| `create_map` `11eaa4a5-…` | from tile group `4dd226e7` | — | iso tile map with `place_map_tiles` stacking (levels 0–63), but no auto-tiling (you pick each mask), `view_map` cannot draw tile layers, no export: not a tool for a 512 x 512 region |

**Lessons:** use `create_tiles_pro` with `tile_feature: tileset` (64 px; 128 is allowed) for every terrain pair:
it is the only call that gives 2:1 diamonds with transitions; each pair costs 10 and pairs do not share a base, so
pass the same colour words and seed and remap all tiles onto one palette afterwards. Tiles carry a 1-px dark rim:
strip it (the mock-up repaints the rim from 2 px inward) or the map shows a grid. Height is our renderer's job:
stack the same tile 1 level = 16 px (half the diamond) and its earth side draws the cliff. Objects: `create_map_object`
at true pixel size (33 px/m, up to 400 px) in high top-down already reads as iso and matches the soldiers' pixel
density; always key out a grey ground and ask for no base. FX: `vfx_workbench` presets recoloured to the dark ramp.

## 23. Global war — test-ridge tiles and objects (ART-4)

Real terrain sets and an object library for test-ridge (W-20). Raws: `shots/war/pixellab/art4/raw/` (git-ignored;
`tiles/<dir>/tile_<mask>.png`, `objects/<raw>.png`), fetched with `scripts/war/art/fetch.mjs`. `scripts/war/art/build.mjs`
(list in `assets.mjs`) writes `public/war/tiles/<pair>.png` + `tiles.json` and `public/war/objects/<id>.png` +
`objects.json`; `scripts/war/art/preview.mjs` draws the contact sheet and the 1:1 mock-up into `shots/war/pixellab/art4/`.
76 generations (7 sets x 10, objects ~0.4–1 each).

All tile sets: `create_tiles_pro`, isometric, `tile_size` 64, `low top-down`, `tile_feature: tileset`, seed 31, no palette
(unless noted). Tiles come back 64 x 48 (2:1 top + 16 px side), `tile_i` = mask i, set bit = the first terrain.

| Pair | Call | Prompt (verbatim) | Result |
| --- | --- | --- | --- |
| grass-dirt | `4dd226e7` (ART-3) | see §22 | reference: its full-grass tile is the grass of every set; its side is the `earth` side |
| grass-sand | `15ee8a0d` | `dark muted olive grass to pale dull dry sand` + `palette` (66 colours median-cut from the ART-3 tiles), `palette_name: dark epic ancient Greece` | **palette lock hurt**: grass came out brown with blue specks. Kept only because grass is replaced anyway; sand toned x0.82 |
| grass-rock | `11b1a38c` | `dark muted olive grass to dark grey weathered rock` | kept; its rock side is the `rock` cliff |
| grass-forest | `adbc0d25` | `dark muted olive grass to dark forest floor of brown pine needles, fallen leaves and roots` | rejected: reads as tilled soil in a grid |
| grass-forest | `dbdd9898` (seed 32) | `dark muted olive grass to dark forest floor of scattered brown pine needles, dry leaf litter and twigs` | kept |
| grass-marsh | `5f02d0cd` | `dark muted olive grass to dark marsh of black mud, murky puddles and sedge tufts` | kept; full marsh tile repeats visibly over big areas |
| grass-road | `dc427abc` | `dark muted olive grass to a packed pale earth road with worn ruts and small stones` | kept, toned x0.7 (raw is as pale as sand) |
| grass-shallow | `a7097915` (ART-3) | see §22 | kept; its full-water tile is the shallow water of shallow-deep |
| shallow-deep | `05ee02ca` | `shallow murky slate-blue water over pebbles to deep dark slate-blue water` | kept; shallow replaced by grass-shallow's water, deep toned x0.72 |

Objects: `create_map_object`, high top-down, high detail, detailed shading, basic mode. Every prompt ends with
`seen from a high isometric three-quarter view, dark epic desaturated colours, heavy shadows,` + the no-base clause
(`isolated on a transparent background, no ground, no grass, no base under it`, later `only the <thing> on a fully
transparent background, no ground, no grass, no base under it`). Subject part below.

| id | Call | Canvas | Subject (verbatim) | Result |
| --- | --- | --- | --- | --- |
| pine-a | `5f138634` | 200 x 400 | `one tall dark Mediterranean black pine tree, straight dark brown trunk, layered dark muted green needle canopy` | small grass square anyway, opaque white bg; base dropped |
| pine-b | `f4cd85fe` (ART-3) | 200 x 400 | see §22 | grey bg keyed (also inside the crown), base dropped |
| tall-tree | `f7af9159` | 240 x 400 | `one tall Mediterranean umbrella stone pine tree, tall bare reddish-brown trunk, flat wide dark muted green canopy on top` | not an umbrella pine (reads broadleaf); grass square + grey bg; graded sat 0.65 val 0.72 |
| cypress | `22d1629c` | 100 x 340 | `one tall slender dark Mediterranean cypress tree, narrow flame-shaped dense dark muted green crown, short dark brown trunk` | clean, no base |
| olive-a | `05b4c48b` | 200 x 200 | `one gnarled old olive tree, thick twisted grey-brown trunk, wide rounded crown of dark muted grey-green olive leaves` | clean |
| olive-b | `f4cb5094` | 180 x 200 | `one young olive tree, slender twisted grey trunk split in two, airy irregular crown of dark muted silver-grey-green olive leaves` | clean |
| oak | `ad7a2a11` | 300 x 340 | `one broad old oak tree, thick dark brown trunk and spreading branches, dense rounded crown of dark muted green oak leaves` | big grass disc anyway; base dropped |
| dead-tree | `9aa1eab1` | 160 x 240 | `one dead leafless tree, cracked pale grey-brown trunk, bare twisted branches` | clean |
| bush-a | `bef56f03` | 80 x 64 | `one low dense Mediterranean mastic shrub, small dark grey-green leaves, rounded clump` | clean |
| bush-b | `cf0ce6b4` | 72 x 80 | `one spiky dark juniper bush, dark blue-green needles, irregular upright clump` | too blue, soil ring; graded and dropped |
| reeds | `5a5372ee` | 64 x 80 | `one clump of tall marsh reeds and bulrushes, thin dull olive-brown stalks with dark brown seed heads` (+ `no water`) | dirt mound; dropped |
| boulder-a | `27f2ba41` | 96 x 80 | `one large weathered dark grey granite boulder with dark moss in the cracks` | clean |
| boulder-b | `65ddf82b` | 80 x 56 | `a small cluster of three rough dark grey limestone rocks, angular and weathered` | mossy base; dropped (keep neutral grey) |
| (rejected) | `59762e36` | 160 x 112 | `one short ruined ancient stone wall section, rough dark grey fieldstone blocks, broken uneven top, a few fallen stones` | an L-shaped ruin on a ground slab |
| wall-ruin | `c93797f6` | 144 x 112 | `one single straight free-standing piece of a ruined ancient stone wall, about two metres tall, rough dark grey fieldstone blocks, broken jagged top` + `only the wall itself on a fully transparent background, nothing under it: no floor, no ground slab, no grass, no base` | still a grass slab; dropped (keep neutral grey) |
| (rejected) | `715cbd3f` | 220 x 400 | `one ancient Greek square stone watchtower, ... a flat timber roof with a low stone parapet and no crenellations, ...` | crenellated castle tower anyway |
| watchtower | `65e341c4` | 220 x 400 | `one ancient Greek stone watchtower (pyrgos), square tower of rough dark grey ashlar blocks, three storeys tall, a few small dark window slits, a low wooden door at the bottom, a low-pitched roof of dark weathered terracotta tiles on top, no battlements, showing two walls` + `no ground, no base` | kept: no battlements, but an open top instead of the roof; ~11.5 m; graded val 0.68 |

**Lessons:** (1) do not pass `palette` to `create_tiles_pro`: the colours lock but the terrain reading is lost. (2) Grass
cannot be matched by prompt or seed, so the build replaces it: each top pixel is classed first/second terrain (nearest
colour to the set's full tiles, gated by the corner mask, two 3x3 majority passes) and first-terrain pixels take the
reference full tile's pixel at the same place, then the rim is repainted and everything snaps to one palette; across sets
grass is pixel-identical and no grid shows. (3) "no base" in the prompt is ignored about half the time (grass squares,
discs, slabs, soil mounds, opaque white/grey backgrounds): the build keys the border colour (and inside the crown with
`keyAll`) and drops the base per object (`base: { y0, x0, x1, cut, keep }` in `assets.mjs`), then removes specks. (4) PixelLab
objects are brighter and greener than the tiles: grade them (`grade: { sat, val }`).

## 24. Global war — art fixes, variant fills and the asset QA gate (ART-5)

Fixes to the ART-4 library plus the W-21 QA gate. Raws: `shots/war/pixellab/art5/raw/` (git-ignored). `build.mjs` now
reads `<pixellab dir>/<batch>/raw` (`batch` in `assets.mjs`, default `art4`) and ends with `qa.mjs`. Preview:
`node scripts/war/art/preview.mjs` -> `shots/war/pixellab/art5/` (contact sheet, variants field without/with variants,
two 40 x 40 test-ridge windows at 1:1 with the fallback rule). 47 generations (3 sets x 10, 1 fill sheet x 10, 7 objects x 1).

| Asset | Call | Settings | Prompt (verbatim) | Result |
| --- | --- | --- | --- | --- |
| watchtower | `create_map_object` `9a04562b` | 220 x 400, high top-down, high detail, detailed shading | `one ancient square stone watchtower of rough dark grey ashlar blocks, three storeys tall, small dark window slits, a low wooden door at the bottom, a crenellated top whose inside is a solid flat floor of dark wooden planks at the level of the battlements, the top is filled, not hollow, showing two walls, seen from a high isometric three-quarter view, dark epic desaturated colours, heavy shadows, only the tower on a fully transparent background, no ground, no grass, no base under it` | kept: closed planked top, 12 m, clean; graded sat 0.8 val 0.68 |
| (rejected) | `create_map_object` `067c491f` | same | `one ancient Greek stone watchtower (pyrgos), ... the top is closed by a solid low-pitched pyramid roof of dark weathered terracotta tiles that covers the whole tower, no opening at the top, no battlements, ...` | closed, but a bright red roof sitting on battlements anyway (reads medieval) |
| (rejected) | `create_map_object` `a71ca474`, `a9eb4178`, `2a0f8ff0`, `f0f8a54d` | 260–300 x 400, same | `one Mediterranean umbrella stone pine tree (Pinus pinea), a very tall straight bare reddish-brown trunk ... broad flat umbrella-shaped crown ... much wider than it is tall, flat on top`; `one Italian stone pine ... like an open umbrella or a parasol`; `... a thin flat horizontal canopy ... like a tabletop ... a giant mushroom`; `one stone pine (Pinus pinea) of the Roman campagna ...` | all broadleaf blob crowns (dome, lollipop), three with a grass square |
| stone-pine | `create_map_object` `5a38a8c6` | 300 x 400, same | `one umbrella stone pine tree shaped like a flat-topped savanna acacia: a very tall thin bare reddish-brown trunk, near the top it splits into a few bare branches that spread out sideways, holding one very wide, thin, flat-topped canopy of dark muted green pine needle clumps, the canopy is a flattened dome much wider than tall,` + the usual view/no-base tail | kept: the acacia comparison gives the flat umbrella crown; grey bg keyed (`keyAll`), 10 m, graded sat 0.8 val 0.85 |
| sand-shallow | `create_tiles_pro` `8292629f` | iso 64, low top-down, `tileset`, seed 31 | `pale dull dry sand to shallow murky slate-blue water over pebbles with a narrow wet sand edge, dark epic desaturated ancient Greek river bank` | kept; masks 6/9 are hard checkers |
| road-rock | `create_tiles_pro` `2fb9aac7` | same | `a packed pale earth road with worn ruts and small stones to dark grey weathered rock, dark epic desaturated ancient Greek mountain pass` | kept; straight block splits, not organic |
| (rejected) road-sand | `create_tiles_pro` `02180484` | same | `a packed pale earth road with worn ruts and small stones to pale dull dry sand, dark epic desaturated ancient Greek coast` | road and sand the same colour: no readable edge; road-sand uses the fallback (grass verge) |
| fills | `create_tiles_pro` `7038755a` | iso 64, `tile_view_angle: 30`, no tileset, seed 31 | `1). dark forest floor of scattered brown pine needles, dry leaf litter and twigs 2). dark forest floor with fallen pine cones, thin roots and patches of dark moss 3). dark marsh of black mud, murky puddles and sedge tufts 4). dark marsh with broken reed stubble, wet black mud and small puddles 5). dry umber dirt ground with small pebbles 6). dry umber dirt ground with cracks and a few dry grass blades 7). dark muted olive grass with dry tufts 8). dark muted olive grass with small stones and clover, dark epic desaturated ancient Greek hillside` | 16 independent tiles, 2 per item (64 x 64, 2:1 top from y 11); item 2 came out grassy (unused). Interiors of the variant fills |

**Build changes.** (1) Both terrains of every set are replaced by one shared fill per terrain (`FILLS`), pixel for
pixel; only the 1 px class boundary keeps the raw (toned) pixel, so the drawn bank survives. (2) In the outer band
(rimE >= 0.88) the class is the nearer corner's, so two terrains always meet at the edge midpoint and any two neighbour
tiles line up (ART-4 left raw second-terrain pixels on the edges: 64 edge mismatches). (3) `gate` per set widens the
corner gating of the classifier (shallow-deep 0.4: its raw deep patches were tiny). (4) Variants (`VARIANTS`): frame 0 =
the fill; others keep the fill's outer band (rimE >= 0.84–0.89, noisy line) and take the interior from a new painting
colour-matched (per-channel mean/std) to the fill, or the fill mirrored / shifted half a tile. (5) Object anchor = mean x
of the bottom rows (ART-4 foot overrides put several anchors beside the trunk); `metres` in `objects.json` is the design
height and the object palette is stored next to the tile palette.

**QA gate** (`scripts/war/art/qa.mjs`, run alone or at the end of the build; exit 1 with the list): tiles — 16 frames
and mask map, sizes, opaque top, every pixel in the palette, dark rim (outermost px vs 2 px inward, minus the same test
4 px in; raw PixelLab tiles score 0.2–0.6, gate 0.12), every same-terrain edge equals the terrain's full tile (>= 90%),
the colour step across every legal neighbour pair <= 1.8 x the full tile's own + 12, each terrain's full tile identical
in all sheets, variants share the band and change >= half the base's detail; objects — metadata, PNG size, binary alpha,
transparent border, trimmed, palette, `h = metres x 33` +-10%, anchor under the foot, no ground patch (bottom 12% rows:
a green run >= 25% of the width for trees/stone, an earth run >= 35% for bushes/reeds; catches 8 of the 9 ART-4 raws
that had bases, misses boulder-b's thin moss). Before ART-5: 89 failures (64 edge mismatches + 1 seam, 15 objects off
palette + no object palette, 7 heights vs the ART-4 targets, 2 anchors); after: 0. Not automated: open tops / wrong
species — still an eye check on the contact sheet.

**Lessons:** (1) PixelLab draws any "umbrella / stone pine" as a broadleaf; naming a flat-topped acacia gets the shape.
(2) Asking for a roof gets battlements plus a roof; a crenellated top "whose inside is a solid floor of planks" closes it.
(3) A full-tile variant cannot change its edge without seams; keep a thin edge band and swap the interior with a separate
painting — mirrored or shifted copies of the same tile still read as a grid (forest, dirt). (4) For land pairs with no
set, a grass buffer vertex reads fine; shores get a shallow band. Moving vertices can loop at 3-terrain spots, so grass
only ever gives way there.

## 25. Biome: Elaia (ART-6)

The first biome library (W-21): terraced olive hills round a bay, marble. Raws: `shots/war/pixellab/elaia/raw/`
(git-ignored). List: `scripts/war/art/biomes/elaia.mjs` (same format as `assets.mjs`). `node scripts/war/art/build.mjs`
builds the global set, then every biome with `--biome <name>` into `public/war/biomes/<name>/` (`tiles.json`,
`objects.json`, PNGs). A biome set's grass and every other global terrain it names is the **built global full tile**,
its cliffs can use the global sides, and its palettes are the global ones (first, unchanged) plus its own colours
(median cut over pixels > 12 away from the global palette: tiles +25, objects +64 max), so it joins the global sheets
pixel for pixel. QA (`qa.mjs`, which now also checks every biome folder) adds: palette starts with the global one, every
full tile shared with the global set is identical. Preview: `node scripts/war/art/preview.mjs --biome elaia` ->
`shots/war/pixellab/elaia/ELAIA_contact.png`, `ELAIA_patch_1x.png` (40 x 40 patch, noise borders, soldiers),
`ELAIA_patch_zoom2x.png`. 78 generations (4 sets + 1 fill sheet x 10, 28 objects x 1; 3 failed calls are free).

Tile sets: `create_tiles_pro`, isometric 64, low top-down, `tile_feature: tileset`, seed 31 (as §23). They came back
much brighter than the dark palette: each fill gets `grade: { sat, val }` (dry 0.75/0.6, rossa 0.8/0.68, marble 0.5/0.6,
grove 0.75/0.75). A first pass at dry 0.55/0.5 snapped to the global greens: dry grass read as grass.

| Pair | Call | Prompt (verbatim) | Result |
| --- | --- | --- | --- |
| grass-dry | `1d78f560` | `dark muted olive grass to dry dull straw-yellow Mediterranean summer grass with sparse brown tufts, dark epic desaturated ancient Greek hillside` | kept; earth side |
| grass-rossa | `eab57a4f` | `dark muted olive grass to dark rusty red terra rossa earth with small pale limestone pebbles, dark epic desaturated ancient Greek olive hillside` | kept; earth side (its own red side is too loud) |
| grass-marble | `4138d83c` | `dark muted olive grass to pale weathered grey-white limestone and marble bedrock slabs with dark cracks, dark epic desaturated ancient Greek hillside` | kept; its side is the `marble` cliff (graded); the slabs read a little like paving |
| grass-grove | `bb9d82ae` | `dark muted olive grass to olive grove ground of dark reddish-brown earth strewn with fallen dry grey-green olive leaves and small dry grass tufts, dark epic desaturated ancient Greek olive grove` | kept |
| fills | `a8909d68` (`tile_view_angle: 30`, no tileset) | `1). dry dull straw-yellow Mediterranean summer grass with sparse brown tufts 2). dry straw-yellow grass with small pale stones and dry thistles 3). dark rusty red terra rossa earth with small pale limestone pebbles 4). dark rusty red terra rossa earth with fine cracks and a few dry grass blades 5). pale weathered grey-white limestone bedrock slabs with dark cracks 6). pale grey-white marble rock with dark lichen spots and loose rubble 7). olive grove ground of dark reddish-brown earth strewn with fallen grey-green olive leaves 8). pale dull dry sand with scattered rounded grey pebbles and small shells, dark epic desaturated ancient Greek hillside` | 16 tiles, top vertex y 11: variant interiors of dry, rossa, marble, grove and the bay's pebble beach (sand variants inside Elaia) |

The beach is the global sand / sand-shallow pair with Elaia's pebble-and-shell sand variants: no new beach set.

Objects: `create_map_object`, high top-down, high detail, detailed shading, basic mode; every prompt ends with
`seen from a high isometric three-quarter view, dark epic desaturated colours, heavy shadows, only the <thing> on a fully
transparent background, no ground, no grass, no base under it` (plants: `no ground, no soil, no base under it`). Subject:

| id | Call | Canvas | Subject (verbatim) | Result |
| --- | --- | --- | --- | --- |
| olive-ancient | `e67a8531` | 220 x 200 | `one ancient gnarled olive tree, very thick hollow twisted grey trunk split into three, wide low irregular crown of dark muted silver-grey-green olive leaves` | white bg + grass slab: keyed, base dropped, graded grey-green |
| olive-orchard | `d181e4d7` | 180 x 180 | `one tended olive tree in an orchard, short leaning twisted grey-brown trunk, rounded pruned open crown of dark muted grey-green olive leaves with a few small dark olives` | clean |
| olive-tall | `d38dc264` | 180 x 232 | `one tall old olive tree, a single tall twisted grey trunk leaning to one side, tall uneven wind-swept crown of dark muted silver-green olive leaves` | slab dropped (180 x 230 failed: canvas must be divisible by 4) |
| cypress-tall | `e088c969` | 88 x 380 | `one very tall slender Italian cypress tree, narrow pointed column-shaped dense dark muted blue-green crown, short dark brown trunk` | clean, 10.5 m |
| cypress-flame | `5b4c60f0` | 112 x 280 | `one medium Mediterranean cypress tree, wider flame-shaped dense dark muted green crown with a slightly uneven tip, short dark brown trunk` | clean |
| stone-pine | `5a38a8c6` (ART-5) | — | reused from the global raw (§24) | — |
| (rejected) holm oak | `990480c5` | 260 x 280 | `one old holm oak tree (evergreen Quercus ilex), short thick dark grey trunk, dense dark round crown of small dark leathery blackish-green leaves` | palmate leaves (reads as chestnut / hemp) |
| holm-oak | `a8afba0d` | 240 x 260 | `one old evergreen holm oak tree, short thick gnarled dark grey trunk with a few spreading branches, a dense dark rounded dome crown made of many small dark blackish-green leaf clumps, like a dark Mediterranean ilex` | kept: clumped dome; pale bg keyed, grass disc dropped |
| maquis-a | `e631e831` | 96 x 72 | `one dense low Mediterranean maquis shrub, mastic and myrtle, rounded clump of small dark glossy grey-green leaves` | clean |
| maquis-b | `4eb56e7b` | 80 x 96 | `one tall Mediterranean tree heath maquis bush, upright spiky dark olive-green twigs with dull pinkish-white flower tips, irregular tall clump` | clean |
| maquis-c | `119b5c90` | 128 x 80 | `one wide sprawling kermes oak and broom maquis thicket, low tangled dark green leaves with a few dull yellow broom flowers` | lime: graded sat 0.4 |
| herbs | `8e20f9f2` | 64 x 48 | `one small low clump of wild rosemary and thyme, tiny grey-green needle leaves with small dull lavender-purple flowers` | drawn 1 m tall: `scale: 0.65` |
| vines | `e46652d4` | 160 x 112 | `one short straight row of three grapevines on wooden stakes, gnarled dark brown vine trunks with dark muted green leaves and small dark purple grape bunches, the row runs diagonally from the upper left to the lower right` | kept; the row runs along the tile y axis anyway |
| (rejected) | `eac0e0ef`, `2de1f6fc` | 144–160 x 112 | `one large weathered outcrop of pale grey-white marble rock, blocky fractured layers ...`; `... irregular natural outcrop ... rough organic silhouette, not a cube` | both a white cube ("not a cube" does not help) |
| marble-outcrop-a | `f769bb66` | 160 x 112 | `one low jagged ridge of weathered pale grey limestone crags, several sharp tilted rock fins and broken slabs of different heights leaning together, rough irregular silhouette with dark crevices` | kept: crags; grass base dropped (keep neutral) |
| marble-outcrop-b | `16026d8f` | 112 x 72 | `a low cluster of three weathered pale grey limestone and marble boulders, rounded and pitted with dark lichen spots` | clean |
| (rejected) | `9fe54328`, `ebe4d07c` | 176–200 x 180 | `one ancient marble quarry face, a tall stepped wall ... cut into flat vertical faces and square ledges ...`; `one tall cut cliff face of an ancient marble quarry ... showing two faces like the corner of a big block` | a brick wall on a slab; a cracked cube |
| marble-quarry | `d54f3bef` | 200 x 168 | `one rough natural hill of pale grey marble rock whose front has been cut away by quarrymen into a giant staircase of flat square steps and smooth sheer cut faces, rough broken natural rock on top and at the sides, a few loose cut blocks lying at the bottom step` | kept: a stepped cut block (still blocky, no natural top); moss dropped |
| wall-a / wall-b | `ef0ea0ce` / `acc796ff` | 112 x 80 | `one straight piece of a low dry-stone field wall, about one metre tall, rough stacked pale grey limestone fieldstones without mortar, the wall runs diagonally from the upper left to the lower right` (b: `upper right to the lower left`) | both came out along the tile y axis: wall-b is `mirror`ed for the x axis; b's grass strip dropped |
| shrine | `c83847e6` | 112 x 120 | `one small ancient Greek rural roadside shrine, a weathered marble herm pillar on a low stepped stone base with a small stone offering altar beside it, a clay oil lamp and a few olive sprigs on the altar` (+ `no base slab`) | kept: column on a plinth (plinth is the shrine's, not ground) |
| (rejected) | `2bef1460` | 96 x 72 | `a small group of three ancient Greek beehives, horizontal clay pipe hives stacked under a low flat stone slab roof ...` | three tiny pots |
| beehives | `8db371d9` | 112 x 72 | `three ancient Greek beehives in a row: tall upright woven straw skep hives shaped like domes, dull straw-brown, each standing on a flat grey stone` | kept, `scale: 0.8` |
| marble-deposit | `bbbe3413` | 128 x 104 | `a marble resource deposit: a pile of large rough-cut gleaming white marble blocks with grey veins stacked on wooden sledge rails, an iron wedge and a mallet lying on the top block` (+ `with the marble a little brighter`) | kept; `resource: marble` |
| olive-harvest | `b1d19d12` | 112 x 112 | `an olive harvest spot: two woven wicker baskets heaped with dark purple-black olives, a tall clay amphora and a wooden ladder leaning on a short wooden tripod` (+ `no cloth`) | kept (no ladder drawn), `scale: 0.75`; `resource: food` |
| goats | `4d90e5b6` | 128 x 80 | `a small herd of three shaggy dark brown and grey long-horned goats grazing close together` | kept (draws 2–3), `scale: 0.7`; `fauna`, `animateLater` |
| boar | `1a2ffbf2` | 96 x 64 | `one big bristly dark grey-brown wild boar with pale curved tusks, standing side-on facing left` | kept, `scale: 0.65`; `fauna`, `mob`, `animateLater` |

**Lessons:** (1) Small subjects fill the canvas whatever their size: pick the canvas from metres x 33 (a 1 m boar wants
~48 x 36) or downscale (`scale`, area resample + hard alpha). (2) PixelLab ignores the asked direction of linear pieces
(walls, vine rows): generate one, `mirror` for the other axis. (3) "Not a cube" still gives a cube for any marble or
quarry; crags, fins and a "hill cut into a giant staircase" get organic rock. (4) Canvas sides must be divisible by 4
(the call fails, free). (5) Biome fills need stronger colour than looks right on the raw: the palette snap pulls
near-global hues onto the global greens, so use a small "far" threshold (12) for the biome's own colours.
(6) Goats and boar are static props; animate them later as PixelLab characters if they move.

## 26. Global war — 1 m terrain cells and real mountains (terrain fix)

Raws: `shots/war/pixellab/tfix/raw/` (git-ignored), listed in `assets.mjs` (batch `tfix`). 27 generations (2 tile calls x 10,
7 objects; the first spire failed because canvas sides must be divisible by 4).

| Asset | Call | Settings | Prompt (verbatim) | Result |
| --- | --- | --- | --- | --- |
| rock-snow | `create_tiles_pro` `222eaec1` | iso 64, low top-down, `tileset`, seed 31 | `dark grey weathered mountain rock with deep cracks and scree to old grey-white mountain snow, dark epic desaturated ancient Greek mountain peak` | kept: its rock (#15) is the new rock fill everywhere (the old one read as flagstones), its side the `crag` cliff; snow toned x0.8 |
| rock-fills | `create_tiles_pro` `89795ea4` | iso 64, `tile_view_angle: 30`, no tileset, seed 31 | `1). dark grey fractured mountain rock with deep jagged cracks 2). dark grey rock with loose scree and angular gravel 3). dark grey-brown weathered limestone with pale lichen spots 4). dark grey rock with small broken boulders and a few dry grass tufts 5). dark grey rock with long parallel strata cracks 6). dark grey rock rubble and scree, dark shadows between stones 7). old grey-white snow with dark rock poking through 8). old grey-white wind-packed snow with faint ripples, dark epic desaturated ancient Greek mountain` | rock variants #0–3, snow variants #12, 14, 15; strata (#8, 9) read as planks, rubble (#10, 11) too busy |
| crag-a | `create_map_object` `077bc3da` | 240 x 400, high top-down, high detail, detailed shading | `one tall jagged dark grey mountain rock crag, a broken pinnacle of fractured weathered grey rock with sharp vertical cracks and ledges,` + tail | kept, 11 m; grass slab anyway (dropped), blue-grey: graded |
| spire | `create_map_object` `cd81b899` | 128 x 400, same | `one thin tall needle-shaped rock spire of dark grey weathered stone, a narrow eroded natural pillar with cracks and small ledges,` + tail | kept, 11 m; a little obelisk-like; grass base dropped |
| crag-b | `create_map_object` `18bb71ba` | 180 x 220, same | `one medium jagged dark grey rock crag, a cluster of three sharp fractured grey rock teeth of different heights,` + tail | kept, 6 m; lime moss graded to sat 0.25 |
| (rejected) | `create_map_object` `541c9179` | 300 x 240, same | `one broad low outcrop of dark grey mountain rock, stacked broken angular slabs with deep cracks, wider than tall,` + tail | a stack of cubes |
| outcrop | `create_map_object` `95ee5d7f` | 280 x 200, same | `one rough natural outcrop of dark grey mountain rock, an irregular rounded mass of weathered fractured stone with jagged broken edges and deep cracks, no straight lines, no cubes, wider than tall,` + tail | kept, 5 m; still blocky; grass slab dropped |
| crag-snow | `create_map_object` `d5672e21` | 260 x 400, same | `one jagged dark grey mountain peak crag whose top and ledges are capped with old grey-white snow, fractured rock with snow in the cracks,` + tail | kept, 10 m, used sparsely (boxy tower shape) |
| scree | `create_map_object` `25a29771` | 240 x 128, same | `a wide low fan of loose grey scree, a spill of small broken angular grey rock fragments and pebbles spreading out in a cone shape,` + view part of the tail + `only the stones on a fully transparent background, no grass, no soil` | kept as a scree cone at wall feet (kind `scree`, walkable) |

Tail = `seen from a high isometric three-quarter view, dark epic desaturated colours, heavy shadows, only the rock on a fully
transparent background, no ground, no grass, no base under it`.

**Renderer (no art needed):** the ground is drawn in 1 m cells (the region's visual layer, 2 x 2 per sim tile) with
32 x 32 frames cut at runtime from the 2 m sheets (`src/war/view/fineArt.ts`). The transition shape is the 2 m frame
scaled to half size; the colours are the fills at full size at the cell's place in its tile, so texel density stays the
soldiers'. Transition cells draw a curved edge: Gaussian-weighted corner values interpolated over the cell and cut at 0.5,
so coasts are contours, not corner-mask teeth. Tall cliffs draw the `crag` side strip per level with varied column
offsets and dithered shades.

**Lessons:** (1) PixelLab rock objects come out blue-grey and often on a grass slab: grade sat ~0.45 and drop the slab
with `keep: 'notgreen'` plus a `cut`. (2) "Outcrop" and "snowy peak" tend to come out as stacked cubes or a tower;
pinnacles, teeth and spires come out well. (3) The mountain mass has to be terrain (tall cliff steps); objects only break
up the lips. A forest of crags reads as a field of rock trees.

## 27. Livelier idles and construction clips (ANIM-1)

Owner feedback: "idle, walking, fighting all look the same". The audit showed the shipped sheets already have 16
distinct clips per class in 4 facings; the war sandbox (`src/war/view/units.ts`) plays only idle / walk / attack /
fallFwd, shows thrust while closing on a foe (the sim's `fighting` is set while charging), loops the attack regardless
of the blow, and the stock idle is a near-still breath (≈260 px change over the clip). So ANIM-1 added only what was
missing: two bigger idles per class and, for the militia, construction clips (W-22). 40 pixminimax jobs, 40 generations
quoted, no redos.

| clip | classes | first frame | frames @ fps | notes |
| --- | --- | --- | --- | --- |
| `breathe` | militia, hoplite, archer, slinger | rot | 16 @ 8 | deep breath, sigh, head dips, neck roll; 3x the stock idle's pixel change |
| `shift` | same | rot | 16 @ 8 | weight from foot to foot, hip sway, glance down and up; ≈4.5x |
| `build` | militia | tall (96 x 112) | 12 @ 10 | spear to the left shoulder, mallet on a stake, two blows; `align: false` (the stake throws off the feet search) |
| `carry` | militia | tall | 9 @ 12 | a log on the left shoulder, walking in place; frames 3–11 kept (0–2 lift the log or pop it in) |

Prompts word for word: `node scripts/art/pixellab/anim1/prompts.mjs <class> <anim> <dir>` (fields: subject, initial
pose, description, `view: high top-down`, direction = the facing). Back facings open "seen from behind, his back to the
viewer in every frame, he never turns round:" and add ", seen from behind" to the subject; hoplite NE keeps §16's
dark-back shield line. Job ids: `docs/v5/pixellab/ANIM1/<class>.jobs.json`; append specs `<class>.sheet.json`
(`anim1/spec.mjs`). The idle wordings:

- breathe: `standing at rest in place, tired after a long march: he takes a deep slow breath, the chest swelling and the
  shoulders lifting high, then lets it out with a heavy sigh, the shoulders dropping and the head dipping forward, then
  rolls his head and neck once and straightens up again; the cloak stirs with the movement; the feet stay on the same
  spot, he does not walk away; {what the hands keep}; no effects`
- shift: `standing at rest in place, restless: he shifts his weight onto his left leg, the hips swaying over and the right
  knee bending loose, glances down and to the side, then shifts his weight back across onto his right leg, the left knee
  relaxing, and looks up ahead again; a slow easy sway of the whole body from foot to foot; …same tail`
- build: `he alone, at work in place: he passes his one spear across into his left hand and holds it upright against his
  left shoulder, then with his right hand swings a short wooden mallet up over his right shoulder and brings it down hard
  onto the top of one wooden stake standing in the ground in front of his feet, bending forward from the hips with the
  blow, two heavy blows, his whole body behind each one; … one spear only …; one mallet, one stake; no shield; no sparks,
  no dust, no effects`
- carry: `walking in place {toward} with steady heavy steps, carrying one long rough wooden log on his left shoulder,
  steadied by his left hand, the log lying along his shoulder and bobbing with each step, his back a little bent under
  the weight; the one wooden spear held upright in his right hand …; one log only; no shield; no effects`

**Pipeline.** The old clip jobs' downloads have expired (404), so `sheetbuild.mjs` cannot rebuild a whole class any more.
`anim1/append.mjs <spec>` runs sheetbuild on the new clips only (the class's own ramps, parts and feet) and appends them
to the shipped sheet: old frames are copied unchanged, every new colour goes to the nearest (OKLab) colour of the same
colour group or metal group already in the sheet (outline / shadow to the nearest ungrouped one), so `colorGroups`,
`metal` and `tiers` stay valid. Then `qc.mjs` (0 failures on all four; the spear-end warnings are the same heuristic noise
the stock clips give) and `sheetgifs.mjs --strips`. `anim1/motion.mjs` measures how much a clip moves.

**Lessons:** (1) pixminimax's idle stays tiny unless the prompt names a big readable action (a sigh with the head
dropping, a hip sway); "slow calm breathing" gives ≈1 px. (2) New props (mallet, stake, log) appear from the first
generated frame or are lifted in over 2–3 frames; drop those frames for a loop. (3) The log comes out longer than the
man in every facing; consistent, so it was kept. (4) Back-view idles still turn the head to a profile mid-clip (archer,
slinger NE / NW); the body stays turned away, so they were kept. (5) Build sparks are cut by the colour pipeline.

### 27b. Work clips and the swordsman's jump (ANIM-2)

Owner play-test: gathering played the attack (work.ts fell back build -> thrust -> attack), building looked like
attacking, and swordsmen "jumped" when attacking on the move.

**The jump** was the art: celt_sword's `charge` (played while closing on an attack order) climbs up to 25 px over
its 12 frames in the back facings (feet row 101 -> 76) and snaps down on the loop; javelineer's NE charge drifts 16.
`anim2/ground.mjs <class> <anim>` shifts every frame so its lowest opaque row sits on the row's anchor; celt_sword's
charge also got `hold: 3` (the crouch plays once). Strips: `shots/war/anim2/celt_before/`, `celt_after/`.

**Work clips** (`workClips`, src/war/view/anim.ts): gather plays `chop` (wood), `mine` (stone, marble, ores, salt) or
`harvest` (food) by the carried resource, which the sim sets from the node on the gatherer's first tick; `build` while
labouring (else chop); `carry` while walking loaded (else walk); never an attack. Classes without them idle at work.

| clip | classes | frames @ fps | notes |
| --- | --- | --- | --- |
| `chop` | militia, hoplite | 10 @ 10 | axe onto a log at his feet; the log splits and pops back on the loop |
| `mine` | militia, hoplite | 10 @ 10 | pickaxe onto a rock; the sparks are cut by the colour pipeline |
| `harvest` | militia, hoplite | 10 @ 8 | bends to a low bush, olives into a basket at the hip |
| `build` | hoplite (militia: §27) | 10 @ 10 | mallet on a stake |
| `carry` | hoplite (militia: §27) | 10 @ 12 | log on the left shoulder, shield on his back, spear upright |

pixminimax, tall canvas (96 x 112), 12 frames = 1 generation (16 = 2), `view: high top-down`. Prompts word for word:
`[AWAY=1] [SHORT=1] node scripts/art/pixellab/anim1/prompts.mjs <class> <chop|mine|harvest|mallet|haul> <dir>`
(`mallet` / `haul` are the build / carry wordings with the weapon put away); every work wording opens `he alone, at work
in place: {stow};` where stow is militia `first he lays his spear down on the ground behind him, and from then on his
hands hold no spear; no shield`, hoplite `first he swings the large round shield onto his back and lays his long spear
down on the ground behind him, and from then on the shield hangs on his back and his hands hold no spear`. Jobs:
`docs/v5/pixellab/ANIM2/<class>.jobs.json` (`ROUND=ANIM2 anim1/job.mjs`); append specs `ROUND=ANIM2 anim1/spec.mjs
<class>` then `anim1/append.mjs docs/v5/pixellab/ANIM2/<class>.sheet.json`. 40 generations (a1 tests and redos
included); archer, slinger, javelineer and celt_sword got none (budget: militia + hoplite first, per the brief).

**Lessons:** (1) The weapon is set down in 1-2 frames and stays lying on the ground for the whole clip (reads as put
down; drop frames 0-1). (2) "into a tree just out of the picture" still draws a tree trunk as tall as the man; a log at
his feet is a small prop that reads. (3) Rocks, bushes, stakes appear unasked; kept, they show what he works on. (4)
North-east work clips turn to face the viewer or a right profile by frame 2-5 for both classes, the "seen from behind
... never turns round" opening notwithstanding; appending `AWAY=1` (`he keeps facing away from the viewer towards the
upper right in every frame: only his back, the back of his head and his cloak are seen, never his face or chest; what
he works on lies beyond him, on the far side of his body`) helped the militia chop (a3); hoplite chop / mine with it
are over pixminimax's 1000-character cap. (5) The carry log comes out twice his height in SE; `SHORT=1` adds `a short
log no longer than he is tall, its ends close to his shoulder`. (6) The hoplite's shield goes onto his back in most
clips, but vanishes in a few (mine SE / SW). (7) The hoplite sheet has no warm wood ramp, so its logs, stake and
mallet land on dark crimson; the militia bush lands on brown (no green in either sheet). Follow-up if they jar.
QC (`qc.mjs`): 0 failures on both sheets.

### 27c. Work clips for the other four, carried loads, hoplite fixes (ANIM-3)

**Hoplite fixes, no generations.** North-east chop and mine are the north-west frames mirrored about the row
anchors (`anim3/mirror.mjs hoplite north-west north-east chop mine`). The logs, chips, stakes, mallets and rocks that
sheetbuild put on the cloak ramp (the raws are reddish, the hoplite has no warm wood ramp) go to the wood group by
lightness rank (`anim3/wood.mjs`): per frame the 8-connected cloak / crest / emblem components that are big and reach
above the hips (the cloak, the crest) or are mostly emblem colours off the ground (the shield emblem) stay; force
boxes cover a prop touching the cloak (`build:se:-22,-70,-4,-50:2-5 carry:se:-27,-71,27,-41 carry:sw:-7,-48,6,-40
carry:sw:6,-58,24,-38`). The tiers no longer recolour the props with the cloak. `anim3/hl.mjs` paints a colour
group green to check, `anim3/zoom.mjs` reads box coordinates.

**Work clips: archer, slinger, javelineer, celt_sword** (chop, mine, harvest, build). Same recipe as §27b
(pixminimax, tall canvas, 12 frames = 1 generation, `view: high top-down`); fields from
`node scripts/art/pixellab/anim3/batch.mjs <chop|mine|harvest|mallet> <class>` (anim1/prompts.mjs plus two edits:
north-east work clips get `AWAY=short` = `; he keeps facing away towards the upper right in every frame, only his
back seen, never his face; what he works on lies beyond him`, and `short rough log` / `short wooden mallet` become
`short rough pale grey-brown log` / `short pale grey-brown wooden mallet`, so the props land on wood, not the cloak).
New stow wordings:

- archer `first he slings his bow across his back beside the quiver, and from then on the bow stays on his back and his hands hold no bow`
- slinger `first he tucks his sling into his belt, and from then on his hands hold no sling`
- javelineer `first he slings the small crescent shield onto his back and lays his two javelins down on the ground behind him, and from then on the shield hangs on his back and his hands hold no javelin`
- celt_sword `first he slides the long sword into its scabbard at his left hip and slings the tall oval shield onto his back, and from then on the sword stays in its scabbard, the shield hangs on his back and his hands hold no sword`

Subjects (the I5 class WHO, `, seen from behind` in the back facings): javelineer `a grim lean Carthaginian javelin
skirmisher in a soft umber felt Thracian cap with a tall forward-curving top and ear flaps, a short purple-black
cloak, a plain umber tunic, bare legs and sandals, a small crescent wicker shield and two javelins`; celt_sword `a grim
Celtic warrior swordsman with a long drooping moustache, a low iron Montefortino helmet with a top knob and cheek
guards, a muted green plaid cloak over iron ring mail, a bronze torc, brown-and-black checked trousers, a tall oval
Celtic shield and a long straight iron sword`. Jobs: `docs/v5/pixellab/ANIM3/<class>.jobs.json`; picks in
`anim1/spec.mjs` ANIMS3; one command rebuilds a class: `node scripts/art/pixellab/anim3/build.mjs <class>` (north-west
stand-ins, spec, append, mirror, load anchors). Review: `anim3/shots.mjs shots/war/anim3 <class>`.

54 generations (cap 70): 16 chop (all four facings), then build, harvest and mine without the north-east wherever it
could be mirrored (archer and slinger build kept theirs). No redos.

**Carried loads.** Owner: the log carry was a huge log whenever they built. Carry is now the class's walk with a small
load sprite on a per-frame anchor; no carry clip per material, no generations. `anim3/loads.mjs` draws the six loads
in code in the dark ramps (src/assets/loads): wood a bundle of four short planks tied with a cord (on the shoulder),
stone a dressed block, marble a small pale block, ore / salt a tied sack, food a basket of olives, pitch a clay jar
(held at the chest). `anim3/anchors.mjs` writes `loads` into each manifest: the left shoulder 44 px up and 6 px to the
side, the chest 34 px up, plus the walk's per-frame bob and body centre. `anim.ts loadOf(u)` maps `UnitSnap.carry`;
`units.ts` draws it over him (a chest load under him in the north facings). The militia / hoplite log carry clips are
stripped (`anim3/strip.mjs`). Preview: `anim3/carrygif.mjs`.

**Lessons:** (1) Naming the wood colour (pale grey-brown) fixed the crimson logs: the mallets come out near white,
the logs a natural tan. (2) The north-east still turns to a profile in most work clips with AWAY=short; the
north-west mirrored is a cheaper and reliable north-east (the tool changes hands, unnoticed at game size). (3) The
weapon goes away in 1-3 frames; drop up to 4 where the tool is not yet in hand or the prop pops in (archer chop SE,
slinger chop SW, celt_sword chop / build / harvest). (4) ground.mjs is wrong for work clips: the log or rock in front
of the feet is the lowest row and lifts him 3-5 px; the appended clips already stand on the anchor. (5) celt_sword's
log lands on his iron ramp (grey bark, pink ends): his sheet has no warm brown.

## 28. Biome: Kyrene (ART-7)

The desert biome (W-21): Kyrene's oasis town on a river terrace with red cliffs and copper, plus its entries and
neighbours from docs/WAR.md (Southern Dunes, Lagoon Coast salt lagoons, Ammos dunes, Ammon salt flats, Red Canyons).
Raws: `shots/war/pixellab/kyrene/raw/` (git-ignored). List: `scripts/war/art/biomes/kyrene.mjs`; built into
`public/war/biomes/kyrene/` by `node scripts/war/art/build.mjs --biome kyrene` (or the full build), same rules as §25.
Preview: `node scripts/war/art/preview.mjs --biome kyrene` -> `shots/war/pixellab/kyrene/KYRENE_contact.png`,
`KYRENE_patch_1x.png` (40 x 40: oasis pool in oasis grass, dunes, red-rock shelf with the mesa and copper, hardpan, reg,
salt flat, a squad), `KYRENE_patch_zoom2x.png`. 99 generations (6 sets + 1 fill sheet x 10, 29 objects x 1).

**Shared base.** Every Kyrene set is `sand-<terrain>` (first terrain = the global sand), so the sand of every Kyrene
sheet is the built global sand pixel for pixel; grass, shallow water and every other global terrain are the global
ones; the palette is the global palette (first, unchanged) + Kyrene colours. The land buffer of the fallback is
**sand**, not grass (`fallback.buffer.land`): dune-hardpan, oasis-shallow and the like get a sand verge / bank.
`preview.mjs` now reads `buffer.land`; the game's `src/war/view/autotile.ts` still hardcodes grass (follow-up).

Tile sets: `create_tiles_pro`, isometric 64, low top-down, `tile_feature: tileset`, seed 31 (as §23). Fill grades
(`{ sat, val }`): dune 0.8/0.74, hardpan 1.1/0.9, red rock 0.62/0.6, reg 0.9/0.95, salt 0.5/0.6, oasis 0.85/0.82. A
first pass at hardpan 0.7/0.66 and reg 0.75/0.75 snapped to dark olive (hardpan read as grass, reg as holes).

| Pair | Call | Prompt (verbatim) | Result |
| --- | --- | --- | --- |
| sand-dune | `73a5c978` | `pale dull dry sand to deep dull ochre-orange wind-rippled dune sand with long soft curved ripple lines, dark epic desaturated ancient North African desert` | kept; ripples read; straight block splits |
| sand-hardpan | `4570c4d8` | `pale dull dry sand to dark tan cracked dry clay hardpan with a network of polygon mud cracks, dark epic desaturated ancient North African desert` | kept |
| sand-redrock | `056704a9` | `pale dull dry sand to dark rusty red sandstone desert bedrock with flat layered ledges and dark cracks, dark epic desaturated ancient North African red canyon` | kept; its red side (graded) is the `redrock` cliff (red cliffs h5) |
| sand-reg | `ebedeac5` | `pale dull dry sand to dark brown stony desert pavement of densely packed small grey-brown and black gravel pebbles, dark epic desaturated ancient North African desert` | kept |
| sand-salt | `1c47a090` | `pale dull dry sand to a flat dull grey-white salt flat crust with raised polygon salt ridges, dark epic desaturated ancient North African salt pan` | kept; the polygons read a little like paving |
| sand-oasis | `83db5c22` | `pale dull dry sand to lush dark green oasis grass with damp dark earth and small leafy weeds, dark epic desaturated ancient North African oasis` | kept; the most organic edges of the six |
| fills | `3fa738fa` (`tile_view_angle: 30`, no tileset) | `1). deep dull ochre-orange wind-rippled dune sand with long soft curved ripple lines 2). dull ochre-orange dune sand with a sharp wind-scoured crest and fine ripples 3). dark tan cracked dry clay hardpan with polygon mud cracks and a few pebbles 4). dark rusty red sandstone desert bedrock with flat layered ledges and loose red rubble 5). dark brown stony desert pavement of packed small grey-brown and black gravel pebbles 6). flat dull grey-white salt flat crust with raised polygon salt ridges 7). lush dark green oasis grass with fallen dry palm fronds and dark damp earth 8). pale dull dry sand with scattered small dark stones and a few dry grass blades, dark epic desaturated ancient North African desert` | 16 tiles, top vertex y 11: variants of all six terrains + Kyrene's stony sand (replaces the global sand variants inside Kyrene) |

Objects: `create_map_object`, high top-down, high detail, detailed shading, basic mode; every prompt ends with
`seen from a high isometric three-quarter view, dark epic desaturated colours, heavy shadows, only the <thing> on a fully
transparent background, no ground, no sand, no base under it` (plants: `no ground, no sand, no soil, no base under it`;
animals: `standing side-on facing left` before the tail). Subject:

| id | Call | Canvas | Subject (verbatim) | Result |
| --- | --- | --- | --- | --- |
| date-palm-tall | `5be1a05c` | 200 x 380 | `one very tall old date palm tree, a long slender slightly curving rough grey-brown ringed trunk, a crown of long arching feathery dark muted green fronds with hanging clusters of dull orange dates` | kept, 11.4 m; white bg, shadow disc dropped |
| date-palm-mid | `82202c8f` | 180 x 280 | `one medium date palm tree, a straight rough grey-brown trunk covered in old frond stubs, a full round crown of long arching feathery dark muted green fronds` | kept; sand diamond under it dropped (x0..x1 + keep neutral) |
| date-palm-clump | `3dfe73c1` | 160 x 160 | `one young date palm clump, three short thick rough brown trunks leaning apart from one root, each with a bushy crown of stiff arching dark muted green fronds` | kept (drew two trunks) |
| (rejected) doum palm | `2c726ba0`, `5784fd97` | 220–240 x 300 | `one Egyptian doum palm tree, a grey-brown trunk that forks into two and then four branches like a Y, ...`; `one Egyptian doum palm (Hyphaene thebaica), a branching palm ... like a candelabra with four green tufts` | both a plain single-trunk palm: kept as `date-palm-young` and `date-palm-fruit`; **no doum palm** |
| acacia | `37b04b8c` | 260 x 200 | `one umbrella thorn acacia of the African savanna (Acacia tortilis), a thin crooked dark trunk that splits low into a few long bare branches spreading out sideways, holding one very wide, very thin, perfectly flat-topped table-shaped canopy ... like a tabletop, three times wider than it is thick` | a dome, not a table; kept |
| acacia-old | `ebc71f21` | 240 x 200 | `one flat-topped savanna umbrella thorn acacia tree, a short dark twisted trunk splitting into several bare spreading branches, one very wide thin flat-topped canopy of small dark muted olive-green leaves, much wider than tall` | a dome (reads oak-like); kept |
| thorn-tree | `a6145348` | 180 x 140 | `one small scrubby desert thorn acacia tree, a crooked dark grey trunk with thorny zigzag branches and a sparse uneven crown of tiny dull olive-green leaves` | round leaf blobs, not thorny; kept |
| tamarisk | `ba6827ea` | 180 x 172 | `one tamarisk tree, several thin dark reddish-brown trunks, a soft feathery wispy crown of fine dull grey-green needle foliage with faint dull pink flower plumes` | kept (blue-grey) |
| saltbush | `c1763a97` | 72 x 48 | `one low round desert saltbush shrub, dense clump of small dull silver-grey-green leaves` | kept |
| camelthorn | `3b3a43ff` | 64 x 44 | `one low spiky camelthorn desert bush, tangled thorny dull brown-green twigs with a few tiny leaves` | kept |
| (rejected) | `38892e1a` | 80 x 72 | `one tall white broom retama desert bush, many thin upright leafless dull grey-green switch stems in a loose fountain-shaped clump` | a saguaro cactus |
| broom | `79ab144e` | 88 x 64 | `one rounded desert broom shrub (Retama), a loose airy tangle of many thin leafless dull grey-green twiggy stems, wider than tall, like a witch's broom, not a cactus` | kept |
| dry-grass | `6443d446` | 48 x 32 | `one small clump of dry desert grass tufts, thin pale straw-yellow and dull brown blades sticking up and bending over` | kept, `scale: 0.7`; kind `grass` (the bush ground test reads straw as soil) |
| reeds | `3efd5b01` | 64 x 80 | `one clump of tall oasis papyrus reeds and rushes, thin dull green stalks with feathery dark green tufts on top and a few brown seed heads` (+ `no water`) | kept |
| mesa | `baf32d19` | 300 x 380 | `one tall isolated red sandstone mesa butte, a flat rough top with a few loose rocks, sheer cliff sides cut by deep vertical fluted grooves and cracks, rust-red and dark brown layered rock, a ragged rocky apron of fallen red boulders at its foot, rough organic natural silhouette` | kept, 9.4 m, close to the Gemini mesa; red-earth apron dropped by colour (`base.drop`) |
| rock-pillar | `61089733` | 120 x 320 | `one tall thin red sandstone rock pillar, a weathered hoodoo spire of stacked rust-red and dark brown rock layers, narrower in the middle, a slightly wider cap rock on top, rough jagged sides with dark cracks` | kept, 9 m; reads as stacked blocks |
| (rejected) red-crags | `3f068aa8` | 200 x 160 | `one low jagged ridge of weathered rust-red sandstone crags, several sharp tilted rock fins and broken layered slabs ...` | a diorama on a thick ground slab with sides |
| boulder-red | `433d39a3` | 96 x 72 | `one large weathered rust-red sandstone boulder, rounded by wind with dark horizontal layer lines and cracks` | kept |
| rocks-red | `c23bdc41` | 88 x 56 | `a small cluster of three angular dark red-brown desert rocks with a dark desert varnish, sharp broken edges` | kept |
| well | `f4771a4e` | 112 x 112 | `one ancient desert well, a round low wall of rough mud-brick and pale stone, a wooden beam frame over it with a rope and a leather bucket, a clay water jar beside it` | kept |
| ruin-wall | `f192a057` | 112 x 96 | `one straight piece of a ruined ancient mud-brick wall, about two metres tall, sun-dried dull tan-brown mud bricks with crumbling eroded rounded top and a few fallen bricks, the wall runs diagonally from the upper left to the lower right` | kept (runs along x) |
| ruin-corner | `6242db63` | 136 x 120 | `one ruined corner of an ancient mud-brick house, two short crumbling walls ... one with a broken doorway arch ...` (+ `no floor`) | sand floor anyway: dropped by colour |
| nomad-tent | `38218516` | 160 x 104 | `one black Bedouin nomad tent woven of dark goat hair, a long low sagging roof held up by wooden poles and guy ropes, one side open showing striped rugs and a clay jar inside` | kept |
| copper-ore | `9a64c0ca` | 128 x 88 | `a copper ore resource deposit: a low outcrop of dark red-brown rock streaked with bright green malachite and blue-green copper stains, broken chunks of ore heaped in front with a woven basket and a bronze pick lying on them` (+ `with the green ore a little brighter`) | kept; `resource: copper` |
| oasis-spring | `ff6716cd` | 112 x 80 | `an oasis spring water source: a small round pool of dark clear water ringed by flat pale stones, a few tall green reeds at one side and two clay water jars standing on the stones` | kept; `resource: water` |
| camels | `7d986561` | 112 x 80 | `two dromedary camels standing close together, dusty dull tan-brown fur, one hump each, long necks, one with a striped woven saddle blanket` | kept; `fauna`, `animateLater` |
| jackal | `6212438c` | 48 x 36 | `one lean golden jackal, dull sandy-tan and grey fur, big ears, bushy dark-tipped tail` | kept, `scale: 0.7`; `fauna`, `mob`, `animateLater` |
| gazelle | `acc6c5b8` | 56 x 48 | `one slender dorcas gazelle, dull sandy-fawn back, pale belly, a dark side stripe, thin curved ringed horns` | kept; `fauna`, `animateLater` |

**Build change.** `base.drop: [[hex, tol], ...]` drops pixels near a colour (manhattan) in rows >= y0, and `keep` is
optional: sand floors and red-earth aprons are neither green nor grey, so `keep` alone cannot remove them.

**Lessons:** (1) PixelLab has one palm: forked doum palms, "candelabra" or not, come back as a date palm. (2) Every
acacia prompt (flat, table, tortilis) gives a dome; the §24 acacia trick works for stone pines, not for acacias. (3)
"Retama / broom" alone gives a saguaro; name the shape and say "not a cactus". (4) Sand-paired sets come back as
straight block splits (as road-rock in §24); oasis grass is the exception. (5) The QA ground test only looks for green
(trees, stone) or soil (plants): sand floors and red aprons pass it, so look at the contact sheet. (6) Desaturating a tan
or grey-brown fill lands it on the global olive greens after the palette snap: keep sat >= 0.9 for earth tones.

**Art fix (mesa, pillar, acacias, doum palm).** The ART-7 mesa read as a tree stump, the pillar as stacked bricks, the
acacias as domes, and there was no doum palm. 23 generations (6 `create_map_object`, 1 `create_object_pro_flash` at
~9, 8 `create_image_pixflux` img2img). `create_map_object` keeps drawing rock as cubes, cakes and bricks, whatever the
prompt says. What worked was `create_image_pixflux` img2img (1 generation, up to 400 x 400) over a rough init image:
either another model's output or a shape drawn in code (silhouette, flat colours, shading, noise). Inits go up with
`get_upload_url` and are passed as `init_image_url: upload:<id>`. The pixflux "transparent" output is a flat grey
background, so these raws use `keyAll`. Common settings: `no_background`, high top-down, highly detailed, detailed
shading, selective outline. Each prompt ends with `dark epic desaturated colours, heavy shadows, detailed pixel art`.

| id | Call | Init (strength) | Prompt (verbatim, before the shared tail) | Result |
| --- | --- | --- | --- | --- |
| (rejected) mesa | `45112a69` map_object 400 x 320 | — | `one huge broad flat-topped red sandstone mesa, much wider than tall, a perfectly flat level caprock table on top with a hard pale rim, sheer cliff walls banded by many horizontal sedimentary strata layers ... a wide sloping skirt of talus scree ... like a desert butte of Monument Valley` | a striped cube on a slab with bricks |
| (rejected) mesa | `59f14e84` map_object 400 x 300 | — | `one big rough natural desert hill of red sandstone eroded into a mesa: a wide irregular kidney-shaped flat plateau top with a ragged broken crumbling rim, steep eroded cliff faces cut by gullies and buttresses ...` | a layer cake / tree stump on a ground slab |
| (rejected) mesa | `3fcc3cc5`, `efb385ae`, `2932d462` pixflux | drawn mesa end (180, 100, 140) | as below (`... eroded gullies and buttresses, a skirt of talus scree ...`) | 180: the striped init unchanged; 100 and 140: flared, fibrous bottoms with a log-grain top, a stump again |
| mesa | `78bf3391` pixflux 400 x 400, seed 5 | drawn mesa end (320) | `the end of a huge red sandstone mesa seen from a high isometric three-quarter view: a flat pale caprock plateau top with a ragged rim, a sheer weathered cliff face of horizontal sedimentary rock strata in rust-red, ochre and dark brown, at its foot a heap of loose fallen rock rubble, broken boulders and gravel scree, rough natural rock` (`isometric: true`) | kept as raw `mesa-end`. `mirrorJoin` adds its mirror image at the cut right edge, giving a 746 x 332 ridge (about 33 m along the diagonal, 10 m tall). Footprint 12 x 12 |
| (rejected) rock-pillar | `cfb3e13c`, `5e90d7f6` map_object 128 / 112 x 300 | — | `one tall natural desert hoodoo rock spire ... no bricks, no blocks`; `... shaped like a melting candle or a termite mound ... like the hoodoos of Bryce Canyon` | stacked blocks both times ("no bricks" adds bricks) |
| (rejected) rock-pillar | `f0ff71e5` pixflux | drawn hoodoo (150) | `a tall natural red sandstone hoodoo rock spire, irregular wind-eroded knobbly column ...` | a cairn of round boulders |
| rock-pillar | `9e60a699` pixflux 112 x 300 | drawn hoodoo (230) | `one tall natural hoodoo of red sandstone, a single solid monolithic rock spire, smooth wind-sculpted wavy sides with bulges and a pinched neck, soft horizontal sedimentary bands, a darker flat cap rock on top, a little rubble at its foot` | kept (raw `hoodoo`), 8 m |
| (rejected) acacia | `1e7e9a06` map_object 320 x 168 | — | `one African umbrella thorn acacia tree, a thin dark trunk forking low into several long thin bare branches that fan out wide like the ribs of an open umbrella ... one very flat thin horizontal layer of dark muted olive-green foliage like a flat table top ...` | a dome again (a wide, short canvas does not help) |
| (seed) | `530a7839` pro_flash 256 x 160, 1 direction (~9 gens) | — | `umbrella thorn acacia tree (Acacia tortilis) of the African savanna: thin dark trunk splitting into long thin bare branches spreading outward, one very flat, very thin, wide table-shaped canopy ... canopy four times wider than thick ...` | a correct flat table, but tiny (135 x 71). Used as the init after a 2x nearest upscale |
| acacia | `76440984` pixflux 320 x 192 | pro_flash acacia x2 (220) | `an umbrella thorn acacia tree (Acacia tortilis): thin dark crooked trunk, long thin bare branches spreading out wide like umbrella ribs, one very flat thin wide table-top canopy of small dark muted olive-green leaves, flat top and flat underside` | kept (raw `acacia-table`), 4.3 m |
| acacia-old | `8ed7998d` pixflux 320 x 192, seed 11 | `acacia` mirrored (110) | `an old umbrella thorn acacia tree (Acacia tortilis): crooked dark trunk leaning, long thin bare spreading branches, a very wide flat thin table-top canopy ..., slightly lopsided, flat top and flat underside` | kept (raw `acacia-table-old`) |
| doum-palm | `84b2f490` pixflux 200 x 300 | drawn Y-fork trunk with 4 fan tufts (110) | `one Egyptian doum palm tree (Hyphaene thebaica): a grey-brown ringed trunk that forks into two branches, each forking again, four crowns of stiff round fan-shaped palm leaves, dark muted grey-green` | kept (raw `doum-forked`), 8 m, the first real doum palm. Its fan crowns are small |

**Lessons (fix):** (7) When `create_map_object` gets a shape wrong, draw the shape and run pixflux img2img over it.
Strength sets how much of the drawing survives. About 100–150 restyles the drawing but invents detail (stump flares,
fringes, cobbles). About 220–320 keeps the drawn geometry and turns it into pixel art. (8) Rubble drawn as a regular grid
of cells comes back as bricks; scatter irregular boulders instead. (9) A rock bigger than 400 px is an end piece cut
flat at one edge plus its mirror (`mirrorJoin`), so the seam matches pixel for pixel. (10) pro_flash draws the acacia
shape correctly but small and at ~9 generations; use it as an init, not as the asset.

**Mesa redo (ART-8 refine).** The fix mesa read as a flat, front-facing striped slab with no iso side face. Now `mesa` (6 x 6,
7.6 m) and `butte` (4 x 4, 6.6 m) are heightfields drawn by `scripts/war/art/relief.mjs` (`mesa-big`, `mesa-butte`) in the
game's projection: a superellipse caprock aligned to the tile axes (so the SW and SE faces both show; SW lit, SE shaded by
the rim normal), a sheer cliff to 0.55 h, a banded slope to 0.25 h, and a talus skirt. They are textured with the kept
ART-7 raw `mesa-end` (`78bf3391`) reprojected onto each face. The wall is sampled by (screen x, depth below the rim), so
the strata follow each face in perspective. The cap and talus are sampled by screen position. Raws `mesa-iso`,
`butte-iso` are these renders, with no new generation. `mirrorJoin` is gone from the build. Four pixflux tries over the
same reliefs were rejected:

| Call | Strength | Prompt (start) | Result |
| --- | --- | --- | --- |
| `4f9c30df` | 230 | `a big isolated red sandstone mesa butte ... two sheer cliff faces in perspective, the left face sunlit ...` | tartan stump (the init had crack lines) |
| `b8613711` | 200 | `an isolated red sandstone butte of the desert, a flat caprock top, sheer weathered cliff walls ...` | tartan stump |
| `65c0e04b`, `0e0fbb76` | 290 | `a red sandstone mesa / tall butte seen from a high isometric three-quarter view ...` | two faces, but plaid |
| `02fffb57`, `2ed52922` | 300 | as above + `uneven horizontal ... layers ... with weathered ledges` (init with no buttress streaks) | still plaid |

**Lesson (11):** pixflux turns banded rock with any vertical streaks into plaid or a tree stump at every strength. When a
kept raw already has the right texture, reproject it onto a drawn shape instead.

## 29. Biome: Iron Teeth mountains (ART-8)

Owner: "mountains must look more real, more tall" (the sandbox drew them as stacked flat cliff levels, a terraced layer
cake). The mountain mass is now painted **massif sprites** (kind `massif`) drawn over the impassable rock area; tiles are
the ground round and under them. Raws: `shots/war/pixellab/mountains/raw/` (git-ignored). List:
`scripts/war/art/biomes/mountains.mjs`; built by `node scripts/war/art/build.mjs --biome mountains` into
`public/war/biomes/mountains/`. Preview: `node scripts/war/art/preview.mjs --biome mountains` ->
`MOUNTAINS_contact.png`, `MOUNTAINS_range_1x.png` (56 x 56 tiles of the chain round the Kleisoura Pass, 25 massifs, a
squad on the road), `MOUNTAINS_pass_1x.png` (1600 x 900 crop). 92 generations (6 tile calls x 10, 10 pixflux, 22 map objects).

**Mountains: pixflux img2img over the approved Gemini art.** `create_map_object` draws a mountain as a smooth blue
pyramid on a diamond base (rejected: `fe62eb0c` "one huge isolated alpine mountain peak ...", `18255ffc` "a wide
mountain massif, three jagged snow-capped ... peaks"). `create_image_pixflux` (1 generation, 400 px) with an init crop of
`shots/war/gemini/art2/kleisoura/ART2_kleisoura_1.png` (scaled 0.65–0.95, `isometric`, high top-down, highly detailed,
highly detailed shading, `no_background`) keeps the prototype's painted rock and snow. The result is opaque on the dark
background anyway: the build floods the background, drops the background colour, and drops everything under a hand-read
foot polyline (`base.below`: ledges, cliffs, river, trees PixelLab kept from the crop); ridge-a and peak-big also keep
only neutral greys (brown cliffs out; the other pieces' snow is lilac, so they skip that). Prompt (ridges): `a long
mountain ridge of jagged snow-capped dark grey rock peaks, steep fractured rock faces with snow in the gullies, dark cliff
bands, isometric pixel art, dark epic desaturated colours, only the mountains on a transparent background, no ground`;
peaks: `a huge tall mountain massif with two jagged snow-capped dark grey rock summits, steep fractured rock faces with
snow in the gullies, sharp ridges, dark cliff bands, ...` (same tail).

| id | Call | Init crop (x, y, w, h of the 1024 px Gemini image) | Strength | Result |
| --- | --- | --- | --- | --- |
| ridge-a | `dfdc3263` | 20, 80, 620, 460 | 250 | kept: the best; runs along the tile y axis |
| ridge-b | `ab1339c9` (seed 7) | same, brown pixels painted background first (masked) | 200 | kept; masked inits get streaks and a river drawn into the empty part, and lilac snow |
| (rejected) | `73a9d818` (seed 11) | 380, 370, 630, 430, masked | 220 | peaks on a cliff block over a grey plateau |
| peak-twin | `52aed892` (seed 13) | 300, 70, 420, 407, masked | 220 | kept; left side cut flat by the crop (cut to a slope by the foot line) |
| (unused) | `3a1bb017` (seed 17) | 0, 300, 420, 328, masked | 220 | new peaks cut off by the top edge |
| peak-big | `f2c391cb` | 300, 70, 420, 407 | 250 | kept: the tallest piece |
| (unused) | `4f2374ab` | 0, 300, 420, 328 | 250 | right summit cut off by the top edge |
| ridge-c | `40248f1a` (seed 21) | 20, 80, 620, 460 | 230 | kept |
| (rejected) | `2053d876` | 380, 370, 630, 430 | 250 | a row of peaks on a sheer cliff wall |
| peak-d | `64f107f6` (seed 5) | 300, 70, 420, 407 | 230 | kept |

**Massifs** (`compose`: one sprite pasted back to front from pieces built earlier in the list, so it can exceed one 400 px
canvas): `massif-a` = peak-big behind ridge-b and ridge-a (644 x 480), `massif-b` = peak-twin + ridge-b + ridge-a,
`massif-c` = peak-d + ridge-c + ridge-b, `massif-high` = peak-big and peak-twin behind massif-b (720 x 650, four
canvases). Every piece and massif has an `-x` mirror for a chain along the tile x axis. Pieces overlap so the back
piece's foot is always under a front piece (the peaks' foot ends at a ledge, so the back ridge sits up to ~60 px above
the peak's foot).

**Tiles.** Sets vs the global grass (plus rock-scree), `create_tiles_pro`, isometric 64, low top-down,
`tile_feature: tileset`, seed 31:

| Pair | Call | Prompt (verbatim) | Result |
| --- | --- | --- | --- |
| grass-scree | `13c4f212` | `dark muted olive grass to loose dark grey mountain scree of small broken angular stones and gravel, dark epic desaturated ancient Greek mountain slope` | kept; side `rock` |
| grass-meadow | `2af39b25` | `dark muted olive grass to short cold blue-green alpine meadow turf with small grey stones and tiny pale flowers, dark epic desaturated ancient Greek high mountain pasture` | teal: `grade.hue -75` (new) turns it to a cool dark green |
| grass-gravel | `a3f7d872` | `dark muted olive grass to packed pale grey-brown mountain gravel with small rounded pebbles and grit, dark epic desaturated ancient Greek mountain pass` | kept |
| grass-snow | `4418d45e` | `dark muted olive grass to old grey-white mountain snow patches with thin melt edges, dark epic desaturated ancient Greek high mountain meadow` | kept; snow = the global snow; reads as hard white squares in a meadow, use sparingly |
| rock-scree | `d316baf4` | `dark grey weathered mountain rock with deep cracks to loose dark grey mountain scree of small broken angular stones and gravel, dark epic desaturated ancient Greek mountain slope` | kept: the commonest mountain pair; `globalFull` (new) keeps the global rock tile un-delined |
| fills | `c6456277` (`tile_view_angle: 30`, no tileset) | `1). loose dark grey mountain scree of small broken angular stones 2). dark grey scree with a few larger fallen rocks and grit 3). short cold blue-green alpine meadow turf with small grey stones 4). cold blue-green alpine turf with tiny pale flowers and moss 5). packed pale grey-brown mountain gravel with small rounded pebbles 6). pale grey-brown gravel with wheel ruts and grit 7). steep dark grey rock slab with long tilted cracks and ledges 8). dark grey rock with patches of alpine grass and lichen, dark epic desaturated ancient Greek mountain` | item order ignored: 0–3 scree, 4–7 rock with boulders (rock variants), 8–15 teal turf (unused: stays teal after the colour match); no gravel, no slab |

Objects: `create_map_object`, high top-down, high detail, detailed shading; tail as §25 (`seen from a high isometric
three-quarter view, dark epic desaturated colours, heavy shadows, only the <thing> on a fully transparent background, no
ground, no grass, no base under it`; plants `no ground, no soil, no base under it`; animals `standing side-on facing left`).

| id | Call | Canvas | Subject (verbatim) | Result |
| --- | --- | --- | --- | --- |
| fir | `af526cc7` | 120 x 360 | `one tall dark mountain silver fir tree, a narrow dense dark blackish-green conical crown of drooping tiered branches down to the ground, a straight dark brown trunk` | white bg + shadow disc: keyed, dropped |
| fir-snow | `c8f302f0` | 112 x 280 | `one medium dark mountain fir tree with old grey-white snow lying on its tiered branches, a dense dark blackish-green conical crown, short dark brown trunk` | clean |
| black-pine | `e085861a` | 180 x 340 | `one tall old black pine of the Greek mountains, a straight dark grey scaly trunk, a dark green crown of dense needle clumps in uneven flat tiers, wind-bent irregular top` | grass slab dropped |
| juniper | `ef41dc3d` | 96 x 56 | `one low creeping dwarf mountain juniper shrub, a wide flat mat of dense dark blue-green scaly foliage with a few dull blue berries, twisted grey woody stems, wider than tall` | `scale: 0.6` |
| rhododendron | `0be79a71` | 80 x 56 | `one low rounded alpine shrub, dwarf mountain rhododendron, a dense clump of small dark leathery green leaves with a few dull pink flower clusters` | clean |
| alpine-grass | `9dfd1bc8` | 56 x 40 | `one small clump of tough alpine grass tussocks, stiff dull green and straw blades with a few small dull blue gentian flowers` | kind `bush` (the grass ground test reads it as a patch) |
| cliff-face | `6fc08c1a` | 320 x 280 | `one tall sheer mountain cliff face of dark grey fractured rock, a long jagged rock wall with deep vertical cracks and chimneys, narrow ledges with old snow, a broken uneven top edge, the wall runs diagonally from the upper left to the lower right, rough organic natural silhouette` | a blocky wedge; kept, use sparingly |
| rockfall | `442d7848` | 176 x 104 | `a fresh mountain rockfall: a heap of big fallen angular dark grey boulders and smaller broken rock fragments spilled in a wide fan, sharp fresh broken faces` | kept |
| boulder-field | `945b7d93` | 200 x 120 | `a field of big scattered rounded grey granite boulders of different sizes lying apart from each other, some half sunk, a few small stones between them` | kept |
| (rejected) | `96f2da4f` | 280 x 160 | `a long wide fan of loose grey mountain scree spilling down a slope, countless small broken angular grey rock fragments ...` | a volcano cone on a grey disc |
| road-edge | `50639405` | 128 x 80 | `one straight piece of the outer edge of a mountain switchback road: a low dry-stone retaining wall of rough grey fieldstones about one metre tall holding up the road shoulder, a few loose stones on top, the wall runs diagonally from the upper left to the lower right` | a walled box with an earth top; `scale: 0.7`, `-x` mirror |
| (rejected) | `afa4ef4c` | 80 x 72 | `two mountain pass cairns: rough cone-shaped piles of flat grey stones stacked by travellers, one taller and one small, standing close together` | two little pine trees |
| cairn | `5bbd7f16` | 64 x 64 | `one mountain pass cairn: a rough waist-high pile of flat grey stones stacked into a lumpy cone, flat slabs with gaps between them, a long thin standing stone on top` (+ `not a tree`) | kept; grass base dropped |
| watch-post | `8c9cffbd` | 160 x 200 | `one ruined ancient mountain watch post: a small square tower of rough dark grey fieldstone broken down to about two storeys, one corner collapsed, a dark empty doorway, no roof, the broken top is jagged rubble, a spill of fallen stones at one side` | crenellated and open (a ruin, reads less broken than asked); slab dropped |
| iron-ore | `5b6d418d` | 128 x 96 | `an iron ore resource deposit: a low outcrop of dark grey-black rock streaked with rusty red-brown iron oxide stains and veins, broken chunks of heavy reddish-black ore heaped in front with a woven basket and an iron pick lying on them` | mauve slab dropped by colour; `resource: iron` |
| (rejected) | `11410032` | 128 x 96 | `a tin ore resource deposit: a low outcrop of pale grey granite cut by bands of white quartz and dark glossy black cassiterite tin veins, a small heap of dark tin ore pebbles ...` | grey boulders, no veins |
| tin-ore | `4581ab3f` | 128 x 96 | `a tin ore resource deposit: a broken face of pale grey granite rock with thick shiny black-brown tin ore veins and white quartz bands running through it, a heap of dark lustrous black ore lumps in front, a leather sack and a bronze pick lying beside it` | kept; `resource: tin` |
| ibex | `b70f2d24` | 64 x 56 | `one alpine ibex wild mountain goat, stocky dull grey-brown body, huge backward-curving ridged horns` | `scale: 0.8`; `fauna`, `animateLater` |
| bear | `177ad7da` | 96 x 68 | `one big brown bear, heavy shaggy dark brown fur, a shoulder hump, walking on four legs` | `fauna`, `mob`, `animateLater` |
| eagle-nest | `d88753c5` | 96 x 112 | `a golden eagle nest: a big bowl of piled dry sticks on top of a small jagged grey rock crag, one dark brown eagle with a pale head perched on the rim of the nest` | `fauna: eagle`, `animateLater` |

**Placement (renderer, not done here).** A massif covers footprint `[fw, fh]` tiles at `(x0, y0)` of impassable rock: the
footprint is drawn as flat rock ground at the foot height (no cliff strips inside it) and the sprite's `anchor` (its foot)
sits on the footprint's south vertex `(x0 + fw, y0 + fh)`. Chains along the tile x axis use the `-x` sprites, along y the
plain ones; rows 6–8 tiles apart stack into depth (back rows `massif-high`). An object stands behind a massif (drawn
before it) when `x < x0 + fw && y < y0 + fh`, else after it. Scree (1–3 tiles, rock-scree / grass-scree) rings every
footprint. Reference: the mountains branch of `preview.mjs`.

**Build changes.** `base.below` (foot polyline), `compose` (a sprite from earlier pieces), `grade.hue` on fills,
`globalFull` on a set (its global full tiles are not delined again: rock has dark rims).

**Lessons:** (1) PixelLab map objects cannot draw a mountain; img2img over an approved painting can, at 230–250 strength.
(2) Masking the init (painting the unwanted part background) makes pixflux invent streaks, rivers and trees there and
tints the snow lilac; crop unmasked and cut along a foot line instead. (3) Every crop cut by an image edge gives a piece
with a flat side: hide it behind another piece or cut it to a slope. (4) A 400 px mountain next to an 11 m fir reads as
a hill; height comes from stacking pieces back to front (massif-high) and rows of massifs, not from one sprite. (5) A
biome fill that comes back teal needs a hue turn, not desaturation (desaturated it reads as wet slate). (6) Fill sheets
ignore the item order when items are close in colour: check every frame.

**Refine: varied relief pieces (ART-8 refine).** The owner approved the direction. The problem was that every massif
was built from the same six cone pieces, so a range read as a field of cones (an egg carton). 29 generations, all
`create_image_pixflux`. Eleven new pieces and their `-x` mirrors give varied silhouettes and sizes. Each init is a
heightfield drawn by `scripts/war/art/relief.mjs` (`node scripts/war/art/relief.mjs <out dir>` writes the inits and
`below.json`, the foot lines). The heightfield is rendered in the game's projection (1 tile = 64 x 32, height in px),
lit from the upper left. It has a broad massif body under the summits (separate cones read as teeth), ridged-noise
aretes and snow above a line. It is textured by the luminance of `shots/war/gemini/region-pass/ART1_kleisoura_2.png`
(fractures, snow streaks, mirror-wrapped). Settings: 220 strength, `isometric`, `no_background`, high top-down, highly
detailed, highly detailed shading, seed as below. Every prompt ends with `isometric pixel art, dark epic desaturated
colours, only the mountain(s) / hill / rocks on a transparent background, no ground`.

Build: `R_FOOT` = the init's foot line moved 6 px up, plus `trimFoot` (new in the build: drop the bottom n px of every
column, 12 by default). That removes the light scree rim PixelLab paints round the base, which reads as a plinth.

| id (footprint) | Call (seed) | Prompt (start, verbatim) | Result |
| --- | --- | --- | --- |
| (rejected) | `85fdc7af` (3) | `a tall asymmetric mountain peak ... tilted rock strata and deep cracks ...` | bricks: the init's strata and crack lines formed a grid |
| (rejected) | `16c0fc1c` (31), 200 | `a huge mountain massif with three jagged snow-capped dark grey rock summits ...` | smooth cones (an untextured, blurred init) |
| (rejected) | `a5d58c6c` (31), `3a03c695` (7) | as massif-great / saddle-long | first textured inits: closer, still separate cones |
| peak-lean (5 x 7) | `b05b0ce4` (3) | `an asymmetric mountain peak with a long sloping shoulder on one side and a steep broken rock face on the other, fractured dark grey rock with cliff bands, tilted rock layers and cracks, snow on the summit and in the gullies` | kept |
| peak-horn (6 x 6) | `0c4c2304` (5) | `a tall sharp horn-shaped mountain summit with three steep rock aretes, fractured dark grey rock faces with cliff bands and cracks, snow on the top and in the gullies` | kept: the most natural |
| saddle-long (4 x 9) | `0d261581` (7) | `a long mountain ridge with two unequal snow-capped dark grey rock summits joined by a low saddle, steep fractured rock faces with cliff bands and snow in the gullies` | kept (fluted) |
| (rejected) | `e1628788` (9) | `a long jagged knife-edge mountain ridge with many small sharp rock teeth along its crest ...` | a fortress wall with battlements (init too steep) |
| ridge-broken (4 x 8) | `3411e052` (9) | `a long broken mountain ridge with two rocky humps and a ragged crest, fractured dark grey rock faces with ledges, cracks and gullies, old snow along the crest` | kept, over a wider and lower init |
| spur (4 x 8) | `94ef0361` (13) | `a mountain spur, a rocky ridge falling from a high snowy end down to low foothills, fractured dark grey rock faces with cliff bands and gullies, scree at its foot` | kept; plain = high end at the back, falls along +y |
| shoulder (5 x 7) | `bf60ba24` (17) | `a broad rounded mountain shoulder, a wide massive slope of weathered dark grey rock with broken ledges, cracks and gullies, a little old snow on the crest, scree at its foot` | kept |
| foothill-a (4 x 5) | `ef843d7a` (19) | `a low rounded rocky foothill, weathered dark grey rock outcrops and broken ledges with loose scree and a few small stones, no snow` | kept, trim 18 |
| foothill-b (3 x 7) | `fa6d0b07` (23) | `a long low rocky foothill ridge, weathered dark grey rock outcrops, broken ledges and loose scree slopes, no snow` | kept |
| crags (4 x 5) | `b1814f87` (29) | `a cluster of broken jagged rock crags, tilted sharp dark grey rock fins and splintered pinnacles with deep cracks, loose rubble and scree between them` | kept, trim 20 (it had a ground disc) |
| massif-great (6 x 6) | `0fe030ab` (31) | `a huge mountain massif with one great snow-capped summit and two lower summits on a broad base, steep fractured dark grey rock faces with cliff bands, tilted rock layers, snow in the gullies` | kept: the biggest single piece |
| (rejected) | `b03ae53c` (37) | `a massive mountain wall, a long high snow-capped crest ...` | a sheer slab |
| massif-twin (6 x 7) | `e321846c` (37) | `a big mountain massif with two snow-capped dark grey rock summits side by side on a broad base, steep fractured rock faces with ledges, cracks and snow-filled gullies` | kept |

Fixes, same settings unless noted:

| id | Call | Init (strength) | Prompt (start, verbatim) | Result |
| --- | --- | --- | --- | --- |
| cliff-face (3 x 7, + `-x`) | `3ac98ab3` (47) | relief `cliff`: a fin with bulging steep sides (220) | `a tall natural mountain cliff, a long jagged wall of fractured dark grey rock with deep cracks, chimneys, broken ledges and a ragged uneven top, a little old snow on the ledges, scree at its foot` | kept: a natural rock wall, not a wedge |
| road-edge (4 x 1, + `-x`) | `9fa05507` (3) | drawn row of lumpy shaded fieldstones in courses along the x axis (200) | `a low dry-stone retaining wall along a mountain road, rough rounded grey fieldstones stacked without mortar in uneven courses, an irregular broken top, a few fallen stones lying in front` (detailed shading) | kept: an organic stone edge, no box (reads low, more like a stone row than a wall) |
| (rejected) | `1fa1c0ff` (8) | same (150) | `a short stretch of a low ancient dry-stone wall about one metre high ... the front face of the stacked stones visible ...` | the same stone row |
| watch-post | `5d09a711` (5) | the old raw `8c9cffbd`, cut along a jagged line (back-left wall stump, collapsed front-right corner), with a drawn rubble heap (200) | `a ruined ancient mountain watch post, the broken stump of a square tower of rough dark grey fieldstone, one corner collapsed, jagged broken walls with no roof and no battlements, a dark empty doorway, a heap of fallen stones and rubble spilling down one side` (detailed shading) | kept: broken walls, rubble |

**Cores, long ridges and roles.** At 1/4 zoom the sandbox showed a carpet of small, equal cones. A range needs big
dominant masses in the middle and small pieces at the rim. Two summit tops were made for this. Their relief init pushes
the foot off the bottom of the canvas (`oy`), so only the top ~400 px are drawn. Settings as above:
`summit-a` `0e84dced` (51) `the upper part of a huge towering mountain, one great snow-capped dark grey rock summit with
sharp aretes, steep fractured rock faces with cliff bands and snow-filled gullies, a big snowfield below the top`, and
`summit-b` `54fd6558` (53) `the upper part of a huge towering mountain with two great snow-capped dark grey rock summits,
..., a big snowfield between the tops`. They are `part: true` (new in the build): built for `compose` only, never
written out. Compose parts may now give `at: [u, v]`, the tile where the part's foot goes, as on the map. The canvas is
then sized to fit, so pieces stack the way the map stacks them and their bases merge. `core-a` and `core-b` (14 x 14,
~570 px, 17 m) are a summit over 7–8 relief pieces. `ridge-long-a` and `ridge-long-b` (6 x 24, ~800 px wide) are four
pieces chained along y. All four have `-x` mirrors. Every massif sprite has `role` in objects.json: `core` (core-*,
massif-a/b/c, massif-high: the middle of a wide rock area), `ridge` (single peaks, ridges, spurs, massif-great/twin), or
`foothill` (foothill-*, crags, shoulder: the rim).

**Snow patches.** `grass-snow` now has `organic: 0.6` (new in the build). The raw split is ignored. Instead, the
corner weight is warped by smooth noise, with a soft melt line between snow and grass. The patches get lobed edges
instead of hard squares, and the outer band still follows the corners, so seams pass QA. No new generation.

**Range mock-up.** `preview.mjs` builds each chain from three rows (cores and long ridges on the crest, then the middle,
then foothills), with rows 5–6 tiles
apart. A row walks along x and places the next piece of its mixed list 0.6–0.75 of the previous footprint further on,
with y jittered by a tile. The bases overlap, so each foot hides under the piece in front. Outputs:
`MOUNTAINS_range_1x.png`, `MOUNTAINS_range_quarter.png` (1/4 zoom), `MOUNTAINS_pass_1x.png`.

**Lessons (refine):** (7) Regular line patterns in an init (strata lines, crack lines, column streaks) come back as
bricks, battlements or tartan. Shade with soft noise and a painted texture instead. (8) The init's slope sets the
result: a long ridge more than ~60 px tall per tile of half-width comes back as a wall. (9) PixelLab still flutes rock
vertically. Varied silhouettes and overlapping rows, not one better piece, make a range read as a chain.

## 30. Buildings (ART-B)

Build-mode art (W-22..W-24) in `public/war/buildings/`: wall kits, gates, towers, bridges, seven buildings, two site
props, each in four states (foundation, scaffold, done, damaged). Raws: `shots/war/pixellab/buildings/raw/` (git-ignored;
`tex/` elevations, `objects/` map objects and state raws). Inits: `node scripts/war/art/kit-inits.mjs <dir>/inits` (wall
and bridge elevations) and `node scripts/war/art/buildings.mjs --inits` (state inits). Build: `node
scripts/war/art/buildings.mjs` (ends with the QA gate). Preview: `node scripts/war/art/buildings-preview.mjs` ->
`BUILDINGS_contact.png`, `BUILDINGS_outpost_1x.png`, `BUILDINGS_fort_scaffold_1x.png`, `BUILDINGS_bridges_1x.png`,
`BUILDINGS_seams_3x.png`, `BUILDINGS_walls_1x.png`. 31 generations (5 elevations, 12 map objects, 14 state img2img).

**Method: textured boxes, not sprites, for anything that must join.** PixelLab cannot draw a wall piece that tiles, and
it ignores the asked direction of linear pieces (§25). So walls, gates, towers and bridges come from a small iso box
renderer in `buildings.mjs` at true scale (1 m along a tile axis = 16 px across + 8 px down, 1 m up = 33 px), with a
depth buffer. Its faces are textured with PixelLab front elevations. Each elevation is pixflux img2img over a periodic
init drawn at 33 px/m with a 66 px (2 m) period. The build quilts it back to an exact period along a min-cost vertical
seam, then squeezes it to 32 face columns per tile. Every face samples the texture by world position, and box extents
are half-open, so pieces drawn tile by tile join pixel for pixel on both axes. Damaged and half-built tops are boxes cut
into 1/16 m slices.

| Texture | Call | Init (strength) | Prompt (verbatim) | Result |
| --- | --- | --- | --- | --- |
| palisade | pixflux `7eb5a5c5`, side, no_background, seed 31 | 264 x 128 logs with pointed tips and two rope bands (220) | `flat front view of a long ancient palisade wall of sharpened dark weathered timber logs standing side by side, bark texture, pale cut points, two bands of rope lashing, dark epic desaturated colours, pixel art` | kept |
| ashlar | pixflux `51ecb6e0`, same | 264 x 176 coursed blocks + 0.8 m merlons (220) | `flat front view of a long ancient Greek city wall of large dark grey ashlar stone blocks in even courses with dark joints, weathered chipped edges, a row of square merlons on top, dark epic desaturated colours, pixel art` | kept; opaque grey background (the init's alpha is used) |
| (rejected) | pixflux `99ba697c`, same | 264 x 116 arch bays (220) | `flat side view of an ancient stone arch bridge, a row of round arches on square piers ...` | white line art |
| arches | pixflux `a55d882b`, side, opaque, lineless, seed 7 | same (280) | `side elevation of an ancient Roman stone arch bridge built of dark grey weathered ashlar blocks, round arches on square piers, wedge-shaped voussoir stones round each arch, moss in the joints, a low stone parapet along the top, shaded pixel art texture, dark epic desaturated colours` | kept |
| trestle | pixflux `b5ffd7c7`, side, no_background, seed 31 | 264 x 104 piles, X braces, deck beam, railing (220) | `flat side view of a rough wooden trestle bridge, dark weathered timber piles with diagonal cross bracing, a heavy deck beam, a simple post and rail railing on top, rope lashings, dark epic desaturated colours, pixel art` | kept |

Kits (`kits[]`), three wall tiers upgraded in place (W-27): `palisade` (3 m, 0.4 m thick, no walk), `rampart` (log
facing to a 2.6 m plank walk behind log parapets to 3.8 m, 1.4 m thick, burnable) and `stone-wall` (Greek cyclopean,
a 5.0 m flagged walk 1.1 m wide between plain parapets to 5.97 m, 1.8 m thick); `walkwayM` / `walkwayPx` /
`walkwayWidthM` in objects.json. One sheet per state, 16 frames of 96 x 254 indexed by the neighbour mask (+x 1, +y 2,
-x 4, -y 8; gates and towers count as neighbours), tile top vertex at (48, 206). Stairs (`stair-stone`, `stair-wood`,
kind `stair`): a 2 x 1 flight along the wall's inner face up to a landing at walk height, pieces `x+n x-n x+s x-s y+w
y-w y+e y-e` (axis, rising towards +/-, the wall on the n/s or w/e side), frames 176 x 278, the NW tile's top vertex at
(88, 214); no seam test. Bridges: `bridge-wood` (trestle, deck 2 m) and `bridge-stone` (2 m arch bays, deck 2.5 m),
frames `deck-x`, `deck-y`, `end-x0`, `end-x1`, `end-y0`, `end-y1` (abutment ramps). Towers, gates and the keep are
renderer models at the sim's footprints (see the Greek redo below). States: `buildOrder` foundation (trench, string on
stakes or a first course of big blocks) -> rising (~1/3, materials stacked by it) -> scaffold (~2/3, poles, ledgers,
plank stage) -> done, each shown from `progress` (0, 0.25, 0.6, 1 of the labour); then damaged; gates also `open`.

Buildings: `create_map_object`, high top-down, high detail, detailed shading, tail as §25 (`seen from a high isometric
three-quarter view, dark epic desaturated colours, heavy shadows, only the <thing> on a fully transparent background, no
ground, no grass, no base under it`). Each sprite is scaled to its footprint width ((fw + fh) x 32 px).

| id (footprint) | Call | Canvas | Subject (verbatim) | Result |
| --- | --- | --- | --- | --- |
| (rejected) | `a9339583` | 256 x 224 | `an ancient Greek army field camp: three small pitched tents of dark undyed canvas and leather on wooden poles arranged round a stone-ringed camp fire with a cooking pot on a tripod, a few rolled bedrolls, a weapon rack with spears and round shields` | tents on a grass and dirt slab |
| camp (4 x 4) | `883da2cc` | 256 x 200 | `an ancient Greek army field camp: three small ridge tents of dark undyed canvas on wooden poles with guy ropes, around a small camp fire ringed with stones with a bronze cooking pot on an iron tripod, a rack of spears and round shields, a few rolled bedrolls and sacks, each item standing directly on the transparent background` (+ `no dirt, no floor`) | kept; its sand patch flooded out (`ground: sand`) |
| storehouse (3 x 3) | `c9e1eb41` | 192 x 256 | `an ancient Greek storehouse: a long rectangular building of rough dark grey fieldstone walls with a low-pitched roof of dark weathered terracotta tiles, one wide wooden door, a few clay amphorae and sacks stacked by the door, showing two walls` | kept; two-tone grey background (keyed from two corners), grass rim dropped |
| outpost (3 x 3) | `c7fa4bf4` | 192 x 280 | `an ancient frontier outpost: a tall wooden banner pole with a long dark red cloth banner, standing inside a small square ring of sharpened timber palisade stakes about chest high with a gap for an entrance, a small wooden lookout platform and a brazier beside the pole` | kept; grass slab inside the ring dropped by colour (`groundAll`) |
| barracks (4 x 3) | `eedd6c92` | 224 x 280 | `an ancient Greek barracks: a long low hall of dark grey fieldstone and timber with a low-pitched roof of dark weathered terracotta tiles, a covered wooden porch on posts along the long side, racks of spears and round bronze shields by the door, showing two walls` | clean |
| (replaced by the megaron) keep (4 x 4) | `a9e4232c` | 256 x 400 | `one massive ancient Greek stone keep: a big square fortified tower house of rough dark grey ashlar blocks, three storeys, small dark window slits, a heavy wooden door at the bottom, a crenellated top whose inside is a solid flat floor of dark wooden planks at the level of the battlements, the top is filled, not hollow, showing two walls` | kept (a little medieval, as §24) |
| farm (4 x 4) | `d8a727c4` | 256 x 160 | `a small square ancient farm plot: neat parallel furrows of dark tilled brown earth with rows of ripe dull golden barley, enclosed by a low fence of rough wooden stakes and woven wattle, a wooden hand plough leaning on the fence` (+ `only the field and its fence ..., no grass round it, nothing outside the fence`) | kept; grass rim dropped |
| (rejected) | `7b168539`, `b7d38ee6` | 192 x 224 / 176 | `an ancient Greek olive press: a round stone crushing basin with a big upright stone millstone wheel ...`; `an ancient Greek olive oil press workshop: a wide round stone trapetum basin ...` | both a well on a paved slab |
| olive-press (3 x 3) | `23e61811` | 192 x 176 | `an ancient olive mill: one huge grey millstone wheel standing upright on its edge inside a wide shallow round stone basin, a wooden pole through the wheel's centre for turning it, next to it a tall wooden frame press with a heavy horizontal wooden beam and a big square stone weight, two tall clay amphorae of oil` (+ `no paving, no floor`) | kept: wheel in a basin (no frame press) |
| lumber-pile (1 x 1) | `c872b491` | 96 x 72 | `a construction site lumber pile: a neat stack of rough dark brown cut timber logs and a few sawn planks on two cross beams, an axe stuck in the top log` | clean |
| stone-pile (1 x 1) | `594dd609` | 96 x 72 | `a construction site stone pile: a heap of rough-cut dark grey building stone blocks stacked on each other, a few smaller broken stones, a wooden mallet and an iron chisel on the top block` | clean (a stepped pyramid) |

State raws: `create_image_pixflux` img2img, 200 strength (farm scaffold 180), `isometric`, high top-down, highly
detailed, detailed shading, no_background, seed 31, over the `--inits` images (the done sprite; scaffold: upper half
erased along a 2:1 V line + drawn poles and planks; damaged: holes in the top third + charring; sides padded to a multiple
of 4, the keep shrunk to 400 px). Every prompt ends with `high isometric three-quarter view, dark epic desaturated
colours, pixel art, transparent background`. Calls (scaffold / damaged): barracks `3f015178` / `93fd3dd9`, camp
`255b2696` / `d88a46b7`, farm `27a9cb23` / `1fffc692`, keep `b4e76bed` / `183c9a5d`, olive-press `f1b129e9` / `67456a79`,
outpost `da7f7bce` / `31c524ed`, storehouse `fd58f803` / `4c18e2d8`. Prompt starts: scaffold `<building> under
construction: half-built ... walls with ragged unfinished tops, no roof yet, wooden scaffolding poles and planks` (camp:
`tents half pitched, bare wooden tent poles ...`; farm: `half the field freshly ploughed ..., a half-built fence`; mill:
`basin half built ..., the big millstone wheel ... lying on wooden rollers`); damaged `a burnt and ruined <building>:
... blackened with soot, the roof collapsed with charred broken beams and holes, ... rubble` (keep: `broken battlements,
a collapsed corner`; farm: `the barley field scorched black and trampled`). The fort is composed (see the Greek redo below). PixelLab buildings get `rising` without a generation: the scaffold
sprite cut to ~1/3 over the footprint's middle line, a stone or lumber pile pasted by it.

**Format.** `objects[]` = one sprite per building state (`<id>-<state>`), the shared object fields plus `tileOrigin`
(px of the top vertex of the footprint's north tile: draw there), `basePx` (the footprint diamond under the structure;
QA: h = metres x 33 + basePx), `building`, `state`, `material`, `burnable`. `buildings[]` groups the states per building
with footprint, material and (gates) axis. Palette: tile palette + global object palette + 48 own colours.

**QA** (`qa.mjs` `qaBuildings`, also run by the CLI): every sprite passes the object checks (border limit 0.75 for
boxy sprites, `borderMax`); every kit sheet: size, binary alpha, palette, and the seam test: straight runs along both
axes and a corner (bridges: spans with abutments) are laid out as on the map and every tile boundary is searched for
cracks (a transparent px with opaque px within 2 left and right and within 3 above and below, more than inside the
tiles) and empty columns. It caught a scaffold that ran past the 64 px frame (frames are now 96 wide), 1 px ledgers that
rasterised with holes and slice tops without their side faces.

**Lessons:** (1) Anything that must tile: render it from textured boxes; use PixelLab for the texture (img2img over a
periodic init) and quilt the result back to the period. (2) pixflux "no_background" over an init with holes still paints
its grey background into them: char what is left inside (`charHoles`) or keep the init closed. (3) pixflux wants sides
divisible by 4 and at most 400 (the call fails, free). (4) "Olive press" and "trapetum" give a well; "a millstone wheel
standing on its edge in a basin" gives a mill. (5) Map objects again came on slabs (camp, outpost, farm): flood the slab
from the outside by colour; inside a fence drop it by colour.

### Greek redo (ART-B2): stone fortifications are Mycenaean, not medieval

Owner decision: the stone set read as a European castle (square crenellated towers, flat machine-made ashlar). Now: a
cyclopean wall (huge fitted polygonal blocks, plain parapets, no crenels), square and round towers (cyclopean socle,
isodomic ashlar shaft, arrow slits, shuttered ports, terracotta roofs at a Greek pitch), the Lion Gate (monolithic
jambs, a massive lintel, the relieving triangle with its relief) and the keep as a megaron (columned porch with red
shafts, timber band, tiled gable roof, pediment to the front) on a terrace; the fort (10 x 10, 20 m) is the citadel:
the cyclopean ring, round towers on the corners, the Lion Gate in the +y side, the megaron on a 2.6 m terrace. 5
generations. Inits: `node scripts/war/art/kit-inits.mjs <pixellab>/buildings/inits` (the long textures repeat every 4
tiles: 400 px drawn, quilted to 264 = 8 m, squeezed to 128 face px).

| Texture | Call | Init (strength) | Prompt (verbatim) | Result |
| --- | --- | --- | --- | --- |
| cyclopean | pixflux `7055aa08`, side, opaque, lineless, highly detailed shading, seed 7 | 400 x 200 periodic Voronoi blocks lit top-left, 5 m wall + 0.9 m parapet with capping (230) | `flat front elevation of an ancient Mycenaean cyclopean fortification wall: huge irregular polygonal limestone boulders fitted tightly together, rough weathered hand-cut faces, each block lit from the upper left with a dark shadowed lower edge, small stones wedged in the gaps, a low parapet of smaller stones with flat capping slabs on top, dark grey and warm beige stone, dark epic desaturated colours, shaded pixel art texture` | kept: painted blocks with real light and shadow |
| isodomic | pixflux `b1c53889`, same | 400 x 200 even 0.55 m courses, drafted margins (230) | `flat front elevation of an ancient Greek isodomic ashlar wall: even horizontal courses of large rectangular limestone blocks with drafted margins and rough picked centres, tight dark joints, chipped weathered edges, each block lit from the upper left, dark grey and warm beige stone, dark epic desaturated colours, shaded pixel art texture` | kept (towers, megaron, stairs) |
| liongate | pixflux `f1d20a40`, same | 132 x 196: jambs, 2.8 x 3.2 m opening, lintel, relieving triangle with two lions at a column (200) | `flat front elevation of the Lion Gate of Mycenae: two massive monolithic stone door jambs, a huge single stone lintel across them, above it a triangular relieving niche filled with a carved relief slab of two rampant lions facing a central column, big ashlar limestone blocks around it, a dark open gateway below, weathered grey and beige stone, dark epic desaturated colours, shaded pixel art` | kept (front faces of the gate; the opening is geometry) |
| (rejected) rooftiles | pixflux `81a88bf1`, `8486590b`, opaque, lineless, seeds 7 / 11 | 264 x 264 pan and cover tiles (220, 200) | `flat texture of an ancient Greek terracotta tiled roof seen straight on: rows of flat pan tiles with long half-round cover tiles running down the slope ...` | plaid both times (lesson (11) again): the drawn init is the texture |

**Renderer additions** (`buildings.mjs`): `cells()` (a grid of 1/16 m columns) gives round towers (`cylinder`, textured
by angle, lit by the normal), sloped roofs (`roof` with `pyramid` / `cone` / gable height fields, shaded by slope),
rubble heaps and talus, and sloped rafters (`beam`). Footprints are the sim's (src/war/sim/economy.ts): `stone-tower`
(+ art variant `stone-tower-round`) and `wood-tower` 2 x 2 (4 m, NW tile on the wall line; fighting platform at 7.2 m
behind a plain parapet with a small tiled shelter over the back corner / 5.65 m under a shingle roof: `platformM`),
gates 2 x 1 (4 m, a 2.8 m opening; `open` = leaves swung in), `keep` 4 x 4, fort 10 x 10; camp 4 x 4 and outpost 3 x 3
(the sim moved to the art). Damaged reads wrecked: stone thrown down to about half height in whole courses with a
continuous talus of fallen stones and big blocks on both faces, soot on the broken tops, tower roofs fallen in with
charred beams, the megaron's front fallen with rafters down into it; wood snapped per log (stumps, half-burnt and
standing logs), charred black from every top with embers, fallen logs. Mock-ups: `greek/GREEK_fort_states_1x.png`,
`GREEK_outpost_open_1x.png`, `GREEK_walls_tiers_1x.png`, `GREEK_states_1x.png`.

**Lessons:** (12) A damage profile that dips inside every tile repeats as teeth (crenels!) along a run, because a run
reuses one frame per mask: throw the whole run down to one height and vary it by a little smooth noise, in whole
courses (1 px steps between 1/16 m slices show as hatching). (13) Rubble as per-tile heaps repeats as bumps: lay a
continuous talus along the face. (14) Slender towers with steep cones read as a fairy-tale castle: stocky shafts and
low-pitched roofs read Greek. (15) Bigger textures beat tile-period repeats: a 4-tile period with the same quilting.


### Wall-walks rebuilt (W-28): thick walls, front layer, placed stairs, free towers

Owner play-test of the W-27 mock-ups: men on walls and towers floated on top (nothing in front of them), walls 1 tile
thin (no passing), the stair did not reach the walk, the wood tower had no way up. 0 generations: everything is the box
renderer over the existing elevations (cyclopean, isodomic, palisade). Mock-ups: `walls2/WALLS2_stone_1x.png`,
`WALLS2_wood_1x.png`, `WALLS2_tiers_1x.png`, `WALLS2_states_1x.png`.

- **Blob wall kits** (`rampart` walk 3.0 m, `stone-wall` walk 5.0 m; parapet 1.0 m, 0.25 / 0.45 m thick): every wall
  tile is a full 2 x 2 m block to the walk, so walls are built 2 tiles deep (4 m walk, two files pass). 81 frames per
  state (rows of 16): `frameOf[mask | open << 4]`; mask = sides with a wall or gate tile (no face, no parapet), open =
  exposed sides without a parapet (a stair top, a joined tower, a ladder head; the face stays). A parapet runs on by its
  thickness past its -x / -y end when that side is connected: it closes an inner corner's notch in the tile drawn before
  it (extending both ends narrowed stair openings).
- **Layers**: `states[s]` = back (faces, walk, -x / -y parapets), `front[s]` = the +x / +y parapets (towers: the rails,
  the wood tower's roof and front posts). Draw per tile back -> units at `walkwayPx` -> front. The front parapet hides a
  man's legs to the thigh on the near file and to the shins on the far one.
- **Stairs** `stair-stone` / `stair-wood` (ramp-stair: plank ramp with cleats on stringers, posts under the high end):
  1 x 2 and 1 x 3, square to the wall, both axes and both directions (`x+2 ... y-3`, `wallAt`), top step flush with the
  walk at the face; a unit's z = topM x distance from the low end / length.
- **Ladder** (1 x 1): `<rampart|stone-wall|tower-wood>-<n|e|s|w>`, leaning on the face on that side, top at `topM`;
  construction states lie on the ground.
- **Towers** `tower-stone` / `tower-wood` (kits, 16 frames by open mask, 2 x 2, flush with the footprint): platform =
  the tier's walk height, so a 2-deep walk placed against a side joins level. Stone: cyclopean socle, isodomic body, a
  door on the first non-open side of +y, +x, -x, -y (an arched door, `DOOR`: a limestone voussoir arch round two shut
  oak leaves with iron bands, 1.24 m wide, 2.2 m to the crown, drawn by the face material so it shows in every state;
  its threshold step is laid from the foundation on), a roofed stair-house over the internal stair.
  Wood: braced posts, plank platform, log rail, shingle roof 2.9 m above the platform (lower eaves hid the archers).
  `stone-tower-done` / `wood-tower-done` objects are the standalone (nothing open) renders.

**Lessons:** (16) Split a structure men stand on into back and front layers by face orientation (+x / +y in front): one
depth buffer per layer, the renderer interleaves units. (17) A roof in the front layer must clear a standing man's head
seen from the far side of the platform: eave >= platform + 2.9 m at this view.

### Fire-arrow kit (W-35): brazier, pitch kiln, pitch icon

0 generations: all drawn in `buildings.mjs` (box renderer) and `ui.mjs` (glyph). Mock-up:
`node scripts/war/art/brazier-preview.mjs` -> `shots/war/pixellab/brazier/BRAZIER_mock_1x.png` (a lit brazier on a
stone wall walk between archers, one lit on the ground, the kiln working), `BRAZIER_states_1x.png`, `BRAZIER.gif`.

- **Brazier** (`brazier`, 1 x 1, 1.2 m): a bronze tripod (lion-paw feet, ring brace, legs bowed out) under a shallow
  bowl of coals 0.8 m across, voxelised on a 1/16 m grid (`vox`). States `unlit` (= `done`), `lit` (glowing coals),
  `destroyed` (= `damaged`: the same solid turned 100 degrees about a horizontal axis, ash and coals spilt beside it;
  does not block). Placed whole: its own `buildOrder: ['done']`, `progress.done 0`. No ground of its own, so it stands on
  a wall walk at `walkwayPx` like a unit. Flames are the siege fire v2 emitters, not baked in: `fx.lit` = tongue-m-a +
  tongue-s-b / -c on the coals, embers above (anchor at sprite px `at`).
- **Pitch kiln** (`pitch-kiln`, 2 x 2, 2.2 m to the vent's lip): a coiled clay dome on a cyclopean ring, a stoking
  mouth to the south-west with soot over it, a clay vent collar on top, a woodstack and pitch jars by it. Foundation =
  trench and first course; rising = the ring and the dome's lower 0.6 m (hollow, 0.2 m wall); scaffold = 1.25 m with
  poles on the two near sides; damaged = the crown broken in, sherds in front, soot. `fx.working` (over `done`):
  smoke-wisp-b from the vent at alpha 0.45, a small tongue in the mouth.
- **Pitch icon** `res-pitch` (32 / 24 + @2x): a terracotta jar brimming with black pitch running down it, drawn from
  shapes in two late ramps (`pitch`, `clay`).

**Lessons:** (18) Boxes narrower than 1 screen px drop out (the renderer samples pixel centres): voxelise thin parts at
1/16 m, not finer. (19) Adding colours to a shared snap palette moves earlier art: put new ramps after the snap set
(`LATE` in `ui.mjs`) and snap only the new, exact-colour art to them. The buildings palette is a median cut over every
sprite, so new sprites re-pick it: rerun the full `buildings.mjs` (it rewrites every PNG).

## 31. Siege (W-29)

Siege art in `public/war/siege/`: the ram, the stone thrower, siege ladders, breach and tower rubble, the stone shot and
the fire FX. Build: `node scripts/war/art/siege.mjs` (ends with the QA gate, `qa.mjs` `qaSiege`, also run by the qa CLI).
Preview: `node scripts/war/art/siege-preview.mjs` -> `shots/war/pixellab/siege/SIEGE_contact.png`, `SIEGE_states_1x.png`,
`SIEGE_mock_1x.png` (a ram at the Lion Gate with its crew, a raised ladder with a climber, a carried ladder, a thrower
firing, a breach with rubble, a burning palisade with smoke, a burnt ram) and `SIEGE_mock_2x_crop.png`. FX raws:
`shots/war/pixellab/siege/raw/fx/` (git-ignored). **0 PixelLab generations** (the FX are free vfx_workbench exports).

**Method: the box renderer, not sprites.** Engines need four exact facings, construction states, a wreck and moving parts
(the log, the arm), all at true scale; PixelLab ignores asked directions (§25) and cannot animate a part of an object. So
everything is modelled in `siege.mjs` with the buildings renderer (exported from `buildings.mjs`), along +x once, and
turned (e as built, w mirrored, s / n swapped axes); textures and palette are the walls' (palisade wood, cyclopean and
isodomic stone).

| Piece | Model |
| --- | --- |
| ram (3 x 2 tiles along its facing) | Greek "tortoise": 6 x 3.2 m wheeled shed, six solid disc wheels, posts to 1.3 m eaves, a 2.7 m gable of lashed rawhide panels (drawn texture: 18 x 13 px hides, stitches, a lashing rope every metre) hanging to 0.7 m on the long sides, a log slung from the ridge on ropes with a bronze ram head 0.9 m past the front. Back / front layers: front = the roof and the near side, crew (two files of four) between. Swing: 8 frames, log offsets -0.5..+0.55 m, hit at frame 6 |
| thrower (3 x 2) | (polish: was a 4 m onager) Greek lithobolos (palintone), 6.4 m: a wheeled chassis, a stock on trestles, a spring frame near the front with two upright rope skeins under bronze washers, two arms swinging in the horizontal plane, a bowstring drawn by a slider with an iron claw, a winch at the back. Throw: 8 frames, arms swept back 72 deg with the claw at 1.9 m (cocked, loaded) -> 25 deg, string straight, stone gone at frame 3 (`release` = tile offsets + zM per facing, over the stock in front of the string) |
| siege ladder | 0.76 m wide, rungs every 0.36 m, iron hooks at the head; long (stone wall) / short (rampart) from the kits' `walkwayM` + `parapetM` + 0.3 m, foot 0.3 x the height out; raised on every side, carried flat on both axes (bearers, `carryPx`), push-off (7 frames, rotating on its foot) and knocked down broken |
| rubble | breach heaps per wall tile (1 along the run x the wall's depth: stone 2 deep, rampart 2 deep, palisade 1 deep; variants a / b), profile by depth only at the run ends so neighbours join; tower rubble 2 x 2 (stone: a socle corner standing, big blocks, charred beams; wood: post stumps and fallen beams) |
| states | foundation (sills / rails laid out, hides stacked), rising (chassis, wheels, posts / bed, skein), scaffold (bare rafters / buffer frame, the arm lying by it), done (= moving), damaged (holes in the hides, scorched), destroyed (burnt out: stumps, the roof fallen in, the log on the ground / the arm broken) |

FX: `vfx_workbench`, free, exported to My effects and downloaded as sheets; the build trims each to a horizontal strip.
Fire ramp `#3a1a10 #7a2a14 #b0461c #d8762c #eeae52 #f6d48a`, `light: false`.

| FX | Call | Result |
| --- | --- | --- |
| flame-m | `campfire` part, fire ramp; effect `7d27726f` | 38 x 39, 8 frames @ 12 fps loop, ~1.1 m |
| flame-s | same, `size: 0.55`; `ac61623c` | ~0.7 m |
| flame-l | same, `size: 1.8`; `f0259104` | 63 x 65, ~1.9 m |
| (rejected) | `fire_wall` part, fire ramp | a flat-bottomed block of flame: reads as a box |
| smoke | `smoke_column`, ramp `#1c1916 #2e2925 #433c35 #5a5148 #716659`, `size: 2.2`; `9492055b` | 52 x 163, 16 frames @ 10 fps, ~4.9 m |
| embers | `ember_rise`, ramp `#5a1e10 #a8401a #e0822e #f6c46a`, `size: 1.6, amount: 1.5`; `e1486346` | 12 frames |
| fire-arrow-trail | `smoke_trail` in the fire ramp, `size: 0.5`; `e94a3acb` | 44 x 18, flies +x (rotate to the flight) |
| scorch | `scorch_mark`, `size: 1.4, heat: 0.5` (the minimum); `c125a78b` | smouldering decal loop; `scorch-cold` = frame 0 with the reds burnt to char |

**Polish: PixelLab paint over the box render** (owner: the engines were "composed boxes"). The done body of each
engine (no moving parts) is rendered per facing on the strip canvas and cropped to
`shots/war/pixellab/siege/raw/paint-in/<id>.png`; one `edit_image_pro_flash` text edit per facing repaints it at the
same size (`raw/paint/<id>.png`, not in the repo, 6 generations each); `siege.mjs` pastes it back and draws the moving
parts (`mv` boxes: the ram's log, the thrower's arms, string, slider, stone) over it wherever the full render shows
them (a marker material finds those pixels), so every strip frame keeps exact geometry. The ram is split into back
and front by the front render's mask; damaged = the paint scorched, holes burnt where the damaged hides are gone.
Construction states and the wreck stay rendered. The shed is symmetric: w and n reuse the e and s paint. 36
generations (ram e, s; thrower e, s, w, n). Jobs: ram `5aa51674`, `32cdc272`; thrower e `7274ae21`, s `ff1ec93d`,
w `91fdb37e`, n `64b5d150`. Prompts (verbatim, `no_background: true`):

- ram: `Repaint this crude block model as detailed dark pixel art of the same object, keeping its exact outline, size, perspective and every part in place: an ancient Greek battering-ram shed (a siege tortoise) on six solid wooden wheels. The gabled roof and the side flaps are covered with overlapping stitched rawhide panels, dark brown and tan, sewn seams and lashing ropes running down the slope; heavy rough-hewn oak posts, eave beams and sills with wood grain and iron nails; the open front end shows the dark inside. Light from the left: the left-facing sides brighter. Heavy shadows, desaturated dark warm colours, crisp pixel art, no outline glow, no ground, no shadow on the ground.`
- thrower: `Repaint this crude block model as detailed dark pixel art of the same object, keeping its exact outline, size, perspective and every part in place: an ancient Greek torsion stone thrower (lithobolos) on a low wheeled timber chassis: a long heavy wooden stock on trestles, a tall spring frame of squared oak beams near the front holding two upright twisted rope skeins capped by round bronze washers, a winch drum with spokes at the back, four solid wooden wheels. Rough-hewn timber with wood grain, iron bands and nails, tight rope coils. Light from the left: the left-facing sides brighter. Heavy shadows, desaturated dark warm colours, crisp pixel art, no ground, no shadow on the ground.`

The paint keeps the silhouette and the light; it turns the plaid hide boxes into stitched leather and the beams into
grained timber, but loses small parts (the thrower's bronze washers came back as wood). A rebuild without the paint
files falls back to the box render (and says so).

**Lessons:** (1) Machines with moving parts and facings: model them in the box renderer; a part is a set of boxes keyed
by one parameter (log offset, arm angle, ladder angle), so animations are free and exact. (2) A thin diagonal piece (a
raised ladder) has opaque opposite corners when trimmed: the object QA takes `thin: true` for it. (3) Big hide panels
(1 m) read as plaid on a roof at this scale; 0.5 m panels with close tones read as leather. (4) A tall gable makes the
ram a house on wheels: keep the ridge under 3 m and the hides low so the wheels half show.

### 31.1 Fire redo (fire v2)

Owner: "the fire looks off": one big cartoon flame blob per tile at one height in front of the wall, smoke as solid grey
columns. Target: flames that cling to the wood, smoke as drifting wisps, charring, a dying loop.
Build: `scripts/war/art/fire.mjs` (called by `siege.mjs`); mock-up `node scripts/war/art/fire-preview.mjs` ->
`shots/war/pixellab/siege/fire2/` (`FIRE2_mock_1x.png`, `FIRE2_mock_2x_crop.png`, `FIRE2.gif`: palisade runs at low,
medium, high and dying, and a burning wooden tower). **0 PixelLab generations**: drawn procedurally, so no prompts.
The v1 vfx flames are only read for the shared palette (the other siege art stays unchanged).

| FX | How it is drawn |
| --- | --- |
| tongue-s/m/l-a/b/c | One tapering, swaying column (0.33 / 0.6 / 1.0 m), 12 frames. Heat comes from the column's axis and its base: dark red edges and tips, orange, then a yellow core drawn as a checker with holes so the wood shows through. Shape a is plain, b has a forked tip, c leans and throws off a lick |
| fire-sheet-x/y-m/l | The burning foot of one wall tile, its base on the 1:2 iso run line. A row of joined tongues whose peaks wander, so the base of the fire is continuous |
| embers | 9 sparks rising with drift, each cooling from yellow to red on its own phase |
| heat-glow | A dithered iso ellipse in reds, blend `add` |
| smoke-wisp-a/b | 20 puffs rising, widening (r 4-28 px) and drifting +x. Each frame is ordered-dithered to binary alpha and drawn at a renderer alpha of 0.45-0.75 |
| smoulder | A pulsing ember bed with flame stubs sunk into it (only their tips show) |
| flame-s/m/l, smoke | Legacy ids for the old one-per-tile placement: clusters of tongues, and an alias of smoke-wisp-a |
| char-palisade/tower-wood-* | Overlays matched frame by frame to the kit sheets. The wood is darkened, keeping its grain, below a ragged burn line that rises from each column's foot: scorch at 35%, charred at 65%, smoulder at 75% with short glowing cracks along the grain |

Placement is in `objects.json` `fireNote`, with density per tile and per intensity on each fx entry.

**Lessons:** (1) One big flame per tile reads as a sticker at any quality. Fire reads as wood burning when it is many
small emitters spread along the face and up the height, plus a continuous burning foot. (2) Keep a flame's core
translucent: a checker of holes, since QA allows only binary alpha. (3) Smoke from a few puffs reads as beads. 20
overlapping, widening puffs, dithered, read as wisps. (4) A second flame sheet halfway up the face reads as a stripe,
so keep the sheet at the foot only. (5) Charring must darken the wood's own pixels. Flat char colours turn the wall
into a black slab.

## 32. UI kit (W-25)

The war game UI in `public/war/ui/` + `ui.json`: 10 frames (meander panel, riveted iron small panel and bar, parchment
tooltip, hover label, plaque, square and round minimap, divider + ornament), 5 buttons (large, small, icon: normal /
hover / pressed / disabled; tab active / inactive / hover; toggle on / off / disabled), bars (track, fills hp,
construction, burn, ok, water; slider track + knob), 58 icons at 32 and 24 px (11 resources, 6 unit classes, 21
buildings, 20 actions) and 7 cursors with hotspots. Every PNG has an `@2x` twin; everything is snapped to one palette
(`ui.json` `palette`). `ui.json` records the 9-slice margins (`slice {l,t,r,b}`; `edges: "tile"` + `period` for the
meander panel, whose edges repeat rather than stretch), fixed heights, the bar fill rect and the minimap window.
Build: `node scripts/war/art/ui.mjs` (fetches raws from `scripts/war/art/ui-jobs.json` into
`shots/war/pixellab/ui/raw/`, ends with the QA gate: sizes, @2x, binary alpha, palette, no icon background, slices leave
a centre). Preview: `node scripts/war/art/ui-preview.mjs` -> `shots/war/ui/UI_contact.png`, `UI_hud_mock.png` (1440x900
HUD over a `?scenario=build-test` sandbox shot, drawn as HTML with CSS `border-image` from the recorded slices).
**60 PixelLab generations** (cap 60): 25 for the sheet, 35 pixen icons.

**Method.** One `create_ui_asset` sheet, with `pieces` laid out so every element sits at a known rect, gives the frames
and controls one look; the build cuts them, rebuilds stretchable edges (a clean column / row copied over rivets),
clears the drawn sword from the icon button, and derives the button states by tone (hover +18% warm, pressed -22% and 1 px
down, disabled desaturated). Icons with a subject (resources, units, buildings) are pixen 32x32 one per call; pictograms
(actions, formations, cursors, stairs, ladders, ram, thrower, stone bridge, camp, tin) are drawn in `ui.mjs` from shapes
on a 32 grid with the glyph shader (light edge up-left, dark down-right, 1 px outline) and rasterised at 32 and 24.

| Asset | Call | Prompt (verbatim) | Result |
| --- | --- | --- | --- |
| kit sheet | `create_ui_asset` 512x512, 18 `pieces` (main panel, small panel, tooltip, label plate, button, 2 icon buttons, 2 tabs, toggle + knob, minimap, health bar, slider + knob, divider, toolbar, resource bar), `color_palette: dark iron grey, aged bronze, dull gold highlights, charcoal stone, parchment cream, oxblood red`; `4e07c490` | `dark epic ancient Greek war game UI kit sheet: heavy dark iron and aged bronze frames with riveted corners, a Greek meander (key pattern) border engraved in bronze along the frame edges, dark charcoal stone panel fill, parchment inset accents, desaturated gritty colours, crisp pixel art, no text` | kept; binary alpha; 25 generations |
| (rejected) | pixen 256x32 | `game UI icon strip, a single row of 8 separate square 32x32 resource icons ...` | 13 tiny unrelated tiles: pixen does not lay out sheets |
| icons | pixen 32x32, `no_background`, `outline: single color outline` | `game UI icon, <subject>, <name> icon, dark epic ancient Greek style, desaturated gritty colours, thick dark outline, readable silhouette` | kept, ids in `ui-jobs.json` |

Subjects (verbatim): food `a sheaf of golden wheat with a round loaf of bread`; wood `a bundle of three cut timber logs`;
stone `a pile of rough grey quarried stone blocks`; marble `a smooth white polished marble block with pale grey veins`;
copper `a lump of raw copper ore, orange copper and green patina on dark rock`; iron `a dark grey forged iron bar ingot
with a rough hammered surface`; bronze `a gleaming golden-brown bronze oxhide ingot (four-cornered ancient ingot shape)`;
silver `a small stack of shiny silver ancient Greek drachma coins`; salt `a small brown sack overflowing with white salt
crystals`; olives `a sprig of dark green olives with silver-green leaves`; hoplite `a bronze Corinthian helmet with a dark
red horsehair crest in front of a round bronze hoplite shield`; archer `a wooden recurve bow drawn with an arrow nocked`;
slinger `a leather sling with a round grey stone in its pouch, cords swinging`; javelineer `three light throwing javelins
with iron tips bundled diagonally`; militia `a rough wooden club crossed with a farmer's pitchfork`; swordsman `a long
iron sword pointing up diagonally with a small round wooden shield behind it` (style `dark epic ancient style`);
storehouse `a small timber storehouse barn with a tiled roof and sacks and amphorae at its door`; outpost `a small wooden
watch post with a lookout platform and a red pennant on top`; fort `a square stone fort with thick grey walls and corner
towers`; barracks (2nd try, prefix `isolated object on transparent background:`, suffix `, no ground`) `a long timber
barracks hall with a red tiled roof and a round bronze shield and crossed spears on its front wall`; farm `a small farm: a
field of golden wheat rows with a little thatched hut`; olive press `an ancient olive press: a round stone basin with a
heavy upright millstone and a wooden beam, a clay jar of oil beside it`; palisade `a short section of palisade fence of
sharpened wooden stakes lashed with rope`; rampart `a timber rampart: a thick wall of horizontal logs with a plank walkway
and log parapet on top`; stone wall `a section of massive grey cyclopean stone city wall of large fitted blocks`; wood
tower `a tall wooden watchtower of log posts with a railed platform on top`; stone tower `a square grey stone defensive
tower with battlements on top and a dark arrow slit`; gate `a heavy wooden double gate with iron bands set in a stone
gateway`; wooden bridge `a small wooden plank bridge on log trestles with a rope railing, side view`.
Rejected: tin `two pale bluish-silver tin ingots stacked` (a horn shape; drawn instead), camp `an army field camp: two
small canvas tents beside a campfire` (opaque ground square) and its retry (a red bat shape; drawn instead), barracks 1st
try (a grey wall on an opaque block).

**Lessons:** (1) `create_ui_asset` costs 25 generations but one sheet with explicit `pieces` gives every frame and control
in one consistent style at known rects; ask for each control once and derive states in code. (2) Its frames carry
rivets and a meander that are not periodic enough to stretch: flatten stretched edges from a clean column / row, and
mark meander edges as tiled. (3) pixen at 32x32 makes good single icons (1 generation) but ignores sheet layouts and
sometimes paints a ground square: QA the border ring of every icon. (4) Pictograms (actions, formations, cursors) are
cheaper and more readable drawn from shapes than generated; give them the same outline and light direction. (5) Other
agents share the 10-job PixelLab queue: submit a few at a time.

**Red-figure theme (W-32, kit 2).** `node scripts/war/art/ui-redfigure.mjs` runs after `ui.mjs` (which still makes the
icons and cursors; `ui-preview.mjs` is gone, the live HUD shots replace it): it replaces `frames/`, `buttons/`, `bars/`
and adds `accents/`, sets `theme: "redfigure"` in `ui.json`. Frames, buttons, tabs, bars and the round minimap ring are
drawn from a 5 x 6 px running key (`#####.` / `#...#.` / `#.###.` / `#.#...` / `#.####`), terracotta on black, 0
generations: `band` (key top and bottom), `card` (key top, thin border), `tooltip`, `label`, `minimap-round` (168 px,
the key at 2x mapped to polar coordinates; window r 70). Meander edges tile with period 6: box widths minus the side
slices must be a multiple of 6 (the HUD snaps them). Buttons: normal / hover / pressed / disabled / active by fill and
border tone. Accents: pixen 40x40, `no_background`, side view, trimmed and area-scaled to 26 px tall, snapped to the
terracotta ramp. **4 generations**, 2 kept:

| Asset | Prompt (verbatim) | Result |
| --- | --- | --- |
| runner | `ancient Greek red-figure vase painting style: a running Greek hoplite with a round shield and spear, mid-stride, flat terracotta orange figure with thin black line details, side view, isolated on transparent background` (east) | kept |
| horse | `ancient Greek red-figure vase painting style: a galloping horse, flat terracotta orange silhouette with thin black line details for mane and legs, side view, isolated on transparent background` (west, `lineless`) | kept (walks rather than gallops; reads well) |
| (rejected) | the runner as `a running Greek warrior athlete with a round shield and a crested helmet` (`lineless`) | muddy, the shield swallows the body |
| (rejected) | the horse as `a galloping horse with flowing mane and tail, terracotta orange body with black outline` | thin and yellow |

**Lessons:** a geometric ornament is exact and periodic only when drawn in code; generate only the painted figures.

**Map icons (W-36 polish).** 13 icons for the minimap, full map and view mode switcher: `lair-<mob>` (6), `mk-claim`,
`mode-<mode>` (6). Pixen 32x32, `no_background`, `outline: single color outline`; prompt `game UI icon, <subject>,
<name> icon, dark epic ancient Greek style, desaturated gritty colours, thick dark outline, readable silhouette`; 24 px
by area average + hard alpha, @2x nearest. **15 generations**, 13 kept. Subjects (verbatim): wolf `the head of a
snarling grey wolf, front view`; boar `the head of a wild boar with curved pale tusks, three-quarter view`; bear `the
head of a roaring brown bear, front view`; bandit `a bandit's dark hooded head with a red cloth mask over the face and a
curved dagger`; jackal `the head of a sandy golden jackal with tall pointed ears, three-quarter view`; ibex `the head of
a mountain ibex with very long curved ridged horns, side view`; claim (2nd try) `a single tall wooden flagpole planted in
a small mound of earth with a large cream and red rectangular cloth flag waving to the right`; normal (2nd try) `a
single large almond-shaped human eye with a dark iris and lashes, seen from the front` (+ `warm cream and terracotta
colours`); altitude `a stepped mountain peak with a snowy top and horizontal contour bands of green, ochre and brown`;
movement `an ancient Greek leather sandal with straps` (+ `warm brown leather`); ownership `a waving blue and red war
banner on a short spear pole`; biomes `a green olive branch with silver-green leaves crossed with a golden wheat ear`;
resources `a small iron pickaxe resting on a heap of ore lumps with orange copper and grey stone`. Rejected: claim `a
tall wooden standard pole with a cream cloth banner and a bronze laurel finial` (read as a candelabrum), eye `an open eye
drawn in terracotta and black like on an ancient Greek vase` (drew a vase with an eye). Lesson: name one plain object;
"like on a vase" makes the vase the subject.

## 33. Mobs (W-12)

Neutral-region creatures as soldier-format sheets (`src/assets/sheets/mob_<mob>/`, SHEET_FORMAT v2; rows SE, NE, SW,
NW; anims `idle`, `walk`, `run`, `attack`, `hit`, `die`), listed for the sim in `public/war/mobs.json`. 118 PixelLab
generations. Ids, jobs and build specs: `docs/v5/pixellab/MOBS/` (`<mob>.jobs.json`, `<mob>.sheet.json`); tools
`scripts/art/pixellab/mobs/` (`build.mjs` spec → sheet, `shrink.mjs`, `contact.mjs` contact sheet + GIFs, `lineup.mjs`,
`scale.mjs`, `bandit.mjs`). Rebuild: `fetch.mjs <character> docs/v5/pixellab/MOBS/raw/<mob>`, `fetchjobs.mjs
docs/v5/pixellab/MOBS/<mob>.jobs.json docs/v5/pixellab/MOBS/raw/<mob>`, `mobs/build.mjs docs/v5/pixellab/MOBS/<mob>.sheet.json`.
Review: `shots/war/mobs/` (git-ignored).

**Bases:** `create_character`, `mode: pro`, `body_type: quadruped`, `style_character_id` H4, `size: 68`, `view: high
top-down` (10 generations each). A standard-mode wolf (1 generation, `size: 40`) was tried first: true size, but a
flat blue-black dog; pro with H4 gave the dark-epic look at once. Pro fills the 68 canvas whatever the animal, so every
frame is shrunk at build to true scale (33 px/m, the 58 px soldier): wolf and boar 0.55, bear 0.75, ibex 0.62, jackal
0.45 (area average, hard alpha, snapped back into the base's own rotation palette). Prompt shape: `grim {animal}, a real
wild {animal} with realistic proportions, not cute: {build}; {coat in dark colours}; standing on all four legs; heavy
shadows, desaturated dark warm colours like the style reference`. Fills:

| mob | template | id | build · coat |
| --- | --- | --- | --- |
| wolf | dog | `e4ee44f4-a23e-498f-b6ae-c06a5dc15c13` | grim lean grey wolf · long slender legs, deep narrow chest, long muzzle, small pointed ears, thick bushy tail hanging low behind · dark grizzled grey-brown fur, darker along the back, paler dusky belly |
| boar | bear | `21f40bc0-ea4e-47d6-809c-a6d3d3960f06` | grim heavy wild boar · massive humped shoulder and deep chest, short sturdy legs with small hooves, long wedge-shaped snout, two short curved pale yellowed tusks, small eyes, a bristly crest of stiff dark hair along the spine, a thin tail · coarse dark umber-brown and soot-grey bristled hide |
| bear | bear | `68bea633-63d6-4446-baed-e1ea44e9be81` | grim huge brown bear · massive heavy body, a big muscular shoulder hump, thick strong legs with long dark claws, a broad heavy head with a long muzzle and small round ears, a short stub tail · shaggy dark umber-brown fur, darker on the legs, a little grizzled on the hump |
| ibex | horse | `106440b3-1b29-4219-83f6-2af6b5d6e0b3` | grim wild mountain ibex, a real wild ibex billy goat · stocky muscular body, sturdy legs with small hard hooves, a short dark beard, a pair of very long heavy ridged horns sweeping back in a curve over its back · coarse dark grey-brown coat, darker on the legs and chest, a little paler on the belly |

**Clips** (4 facings each, 1 generation per facing): templates where the quadruped template has one (`idle` for the
dog, `idle-long` 15 frames for bear and boar, `idle-shaking-head` for the ibex; `walk-8-frames`, `running-8-frames`;
bear `attack-left` 7 frames, the swipe; ibex `dying` 6 frames), pixminimax 8 frames on an 80 x 80 canvas (the rotation
at 6,8) for the rest. `subject_description` "a grim lean grey wild wolf with dark grizzled fur" / "a grim heavy wild
boar with dark bristly umber hide and short curved tusks" / "a grim huge brown bear with shaggy dark umber fur" (back
facings add ", seen from behind"), `initial_pose` "standing on all four legs". `{t}`: "towards the viewer's lower
right / left"; back facings open `seen from behind, its back and tail towards the viewer in every frame, it never
turns round:` and say "away from the viewer towards the upper right / left".

- wolf attack: `the wolf attacks in place {t}: it crouches low with its head down and ears flat, then springs forward in a short heavy lunge with its jaws wide open and snaps a hard bite at the empty air ahead of it, its whole body weight driving forward behind the head, then pulls back into its stance; the wolf alone, no other animal or person in the frame; the same wolf with exactly four legs in every frame; no blood, no effects, no motion trails` (back facings drop "and ears flat" and "with its jaws wide open")
- boar attack: `the boar charges in place {t}: it lowers its heavy head, digs in its hind legs and lunges forward hard, then drives its head and tusks upward in a vicious goring toss at the empty air ahead of it, its whole massive body behind the blow, then steps back into its stance; the boar alone, …; no blood, no dust, no effects, no motion trails`
- death (wolf, boar, bear): `the {animal} takes a mortal blow: it flinches with its head thrown up and its body recoiling, staggers sideways on buckling legs, then its strength gives out and it collapses heavily onto its side on the ground and lies still; its {fur / hide} stays clean, no wounds, no red, no blood at all; the same {animal} with exactly four legs in every frame; no dust, no effects` (bear: "flinches and rears its head back with a roar, its massive body recoiling"; back facings open "seen from behind, its back and rump towards the viewer:")
- `hit` = death frames 0, 1, 1, 0 (the flinch), no generation.
- **jackal** (0 generations): the wolf's frames shrunk to 0.45 and the palette tinted sandy (`tint`: OKLab hue 70°,
  chroma 0.07, lift 0.08; outline untouched). **bandit** (0 generations): the militia sheet with the crimson cloak
  ramp swapped for a mud-dark olive-brown one; the owner disliked it (a recolour reads as the militia). **Polish:** a
  real outfit by the civilian process (§35): the militia's four rotations as one 2x2 grid, one `edit_image_pro_flash`
  edit (6 generations, job `e1f32805`): `Re-dress the same man in all four views as a grim ancient Greek hill bandit,
  an outlaw, no armour: remove the spear, the felt cap and the crimson cloak; keep the same body, size, pose, feet and
  face in each view. He wears a ragged hooded cloak of dark mud-brown wool, torn and frayed at the hem, the hood up
  over his head; a dark grey-green cloth face wrap over his nose and mouth, only his eyes show; mismatched scraps of
  worn leather armour: one dark leather shoulder piece, a scuffed brown leather chest strap and a laced leather bracer;
  a dirty undyed tunic with ragged edges; wrapped shins and worn sandals. A short iron sword held low in his right
  hand. Heavy shadows, desaturated dark warm colours, same pixel art style.` The north-west view came back half turned
  to the viewer: it is the north-east view mirrored (`bandit/prep.mjs`). Clips: pixminimax, 12 frames on 96 x 96 at
  (14, 24), south-west and north-west generated, the east facings mirrored: idle, look, walk, run, ready, charge,
  thrust, block, fallBack, fallFwd, cheer (21 generations; from behind both falls are one forward fall). Every prompt:
  `node scripts/art/pixellab/bandit/prompts.mjs [anim dir]`. The other soldier clips a mob never plays come from these
  (`docs/v5/pixellab/BANDIT/bandit.sheet.json`: adjust, breathe, shift from idle / look; rout from run; kneel, brace
  from ready; stagger from fallBack; build from thrust; carry from walk), so the sheet keeps every clip name. Build:
  `fetchjobs.mjs docs/v5/pixellab/BANDIT/bandit.jobs.json docs/v5/pixellab/BANDIT/raw/bandit` (copy fallFwd NW to
  fallBack NW), `mobs/build.mjs docs/v5/pixellab/BANDIT/bandit.sheet.json`, `anim2/ground.mjs mob_bandit` on every
  standing clip. 27 generations. Back views that turned to the viewer mid-clip (0 generations, `bandit/backs.mjs`, then
  `anim2/ground.mjs`): mirroring cannot help (the north-east is already the north-west mirrored), so the back rows reuse
  the bandit's own back frames: look / adjust = idle (forward / reversed); block holds its parry (frames 0-3, held,
  back down); thrust and build = the thrust wind-up up and back (the turned lunge dropped, the peak on the strike frame);
  cheer = the block parry shaken over the shoulder. Charge stays a side-on run.

**Lessons:** (1) pixminimax paints blood on a struck animal even with "no blood" (wolf SE death a1: a red splat on the
flank; replaced by a2 with "takes a mortal blow … stays clean"); the clean wording still left red on the neck, so the
build cuts saturated pixels (chroma over 0.14), refills holes inside the body from their neighbours and drops loose
bits under a tenth of the body (spray, dust). (2) PixelLab draws a flat grey ground shadow under some bear views
(NE rotation, NE death, SE swipe): `shadow: true` cuts neutral greys and the thin outline ring left around them; never
on a grey animal (it erased the ibex). (3) A template idle for a quadruped barely moves; fine for mobs. (4) Back-facing
pixminimax bites lift the head towards the camera; a boar SE death drifts round to face east. Kept. (5) Feet anchor =
bottom centre of each row's first idle frame.

### 32.1 HUD style prototypes (Gemini)

Owner on `UI_hud_mock.png`: too big, too much space, boring. Two directions, both compact (about half the footprint):
**A minimal floating** (Manor Lords, Total War Pharaoh) and **B red-figure pottery** (black + terracotta). Gemini Pro,
"Create image" tool, 6 generations, each a fresh chat with a clean 1440x900 base attached: a `?scenario=siege` sandbox
shot with every DOM panel hidden (Playwright, `s.focus(124, 462, 1)`). Out: `shots/war/ui/proto/<A|B>/` (1024x637, the
in-page preview; see the download note below). Footprint is the share of the screen under HUD at 1024x637; the current
mock-up is about 35%.

The element allowlist is the same in every prompt (resource strip with 11 resources, fps, minimap, squad card with
class icon, name, count, hp bar, 3 orders and 4 formations, build bar with Camp/Walls/Siege and 8 buildings, tooltip
with costs, "E: Raise ladder" hover label); each prompt ends with the "Nothing else on the screen" list.

| File | Prompt (verbatim) | Footprint | Verdict |
| --- | --- | --- | --- |
| A1_floating_strips | `Edit the attached screenshot of my isometric pixel-art ancient Greek war game (1440x900, keep the 16:10 aspect). Keep the battlefield, soldiers, trees, ram, ladder, palisade and fort exactly as they are. Change only: paint a game HUD over it in a MINIMAL FLOATING style (the feel of Manor Lords and Total War Pharaoh): slim semi-transparent dark charcoal strips with soft edges, thin 1 px warm gold hairlines, small crisp pixel-art icons, a small clean pixel font, very compact, maximum battlefield visible. The HUD has exactly these elements. (1) Top: one thin strip about 26 px tall across the top centre with 11 small resource icons, each with a number: food 412, wood 238, stone 120, marble 0, copper 36, tin 12, iron 18, bronze 24, silver 9, salt 30, olives 64. (2) Top right corner: tiny grey text "60 fps". (3) Bottom left: a small square minimap about 150 px wide with a thin dark border and a small white view rectangle. (4) Bottom centre: a compact selected-squad card about 360x90 px: a small bronze helmet class icon, the name "Hoplites", the count "22/24", a thin red health bar, then one row of 3 small order icons (move arrow, attack sword, hold shield) and 4 small formation icons (line, column, wedge, loose). (5) Bottom right: a slim build bar collapsed to one row about 40 px tall: 3 tiny tabs "Camp", "Walls", "Siege" and 8 small building icons (palisade, rampart, stone wall, tower, gate, ladder, ram, stone thrower). (6) One small dark tooltip just above the build bar: "Stone wall" with two cost icons, stone 40 and wood 10. (7) Next to the ladder carried by the soldiers at upper left: a small cursor hover label "E: Raise ladder". Nothing else on the screen: no quests, no mail, no level bar, no gems, no chat, no portraits, no hero, no extra buttons, no extra panels, no title text. The whole HUD covers less than 15% of the screen. Keep the pixel-art look: crisp hard pixel edges.` | ~13% | best A: clean and readable; 3 formations not 4, 7 buildings + a collapse arrow |
| A2_icon_clusters | as A1, style and layout sentences replaced: `... in an ULTRA-MINIMAL FLOATING style (the feel of Manor Lords): no frames and no solid panels at all; every element floats directly over the battlefield as a small cluster of crisp pixel-art icons and small white pixel-font numbers, readable thanks to a soft dark transparent shadow behind each cluster that fades into the battlefield. Very compact, maximum battlefield visible. ... (1) Top left: one single row of 11 small resource icons with numbers, about 24 px tall: ... (3) Bottom left: a tiny round minimap about 130 px wide with a thin pale rim and a small white view rectangle. (4) Bottom centre: a floating selected-squad cluster about 320x70 px: ... a thin red health bar under the name, and next to it one row of 3 small order icons ... (5) Right edge, vertically centred: a slim vertical build bar 36 px wide: 3 tiny tab icons at its top for Camp, Walls and Siege, then 8 small building icons in a column (...). (6) One small dark tooltip to the left of the stone wall icon: ... The whole HUD covers less than 10% of the screen.` (other sentences as A1) | ~8% | smallest; vertical build bar works; 2 invented order icons (up arrow, figure), only 2 tab icons, blank minimap |
| A3_edge_bands | as A1, with: `... in a MINIMAL EDGE-HUGGING style (the feel of Total War Pharaoh): everything sits flush against the screen edges as thin semi-transparent dark bronze-brown glass bands with a 1 px muted gold top line, ... the whole centre of the screen is free battlefield. ... (1) Top edge: one thin band 24 px tall across the full width with 11 small resource icons, each with a number, spaced evenly from the left: ...; at the far right end of that band tiny grey text "60 fps". (2) Bottom edge: one thin band 48 px tall across the full width that holds three groups: at the left a small square minimap 120 px wide that rises a little above the band, with a small white view rectangle; in the middle the selected squad: ...; at the right the build bar: ... (3) One small dark tooltip just above the stone wall icon: ... (4) Next to the ladder ... The whole HUD covers less than 12% of the screen.` | ~19% | reject: band drawn twice as tall as asked, tooltip covers the tabs, an extra order icon, ladder repainted raised |
| B1_black_bands | as A1, with: `... in a GREEK RED-FIGURE POTTERY style: only two colours, glossy black and terracotta orange (like an Athenian red-figure vase), with a little cream for numbers. Slim solid black bands edged by thin terracotta lines and a thin terracotta meander (Greek key) border; small terracotta painted figure silhouettes (a running hoplite, a horse) used sparingly as tiny ornaments at the band ends; all icons drawn as flat terracotta shapes on black, like vase painting. Crisp pixel art, very compact, maximum battlefield visible.` element list as A1 with black panels, terracotta icons and health bar, cream view rectangle, `a thin meander frame` on the minimap; `no vases` added to the nothing-else list | ~14% | best B: on-theme and compact; resource icons stayed full colour, 3 formations, "ram" drawn as the animal, ladder repainted |
| B2_vase_frieze | `... in a bold GREEK RED-FIGURE VASE FRIEZE style: strictly two colours, glossy black and terracotta orange, no other colours anywhere in the HUD. Each HUD element is a narrow black frieze band like the decorated band around a red-figure vase: a thin terracotta meander (Greek key) line along its top and bottom edge, a tiny painted terracotta figure silhouette at each end (a running hoplite with a round shield, a galloping horse). Every icon is a flat terracotta silhouette on black, every number and label is terracotta too.` minimap: `a small round minimap about 130 px wide framed like the round tondo inside a Greek cup, with a meander ring and a small terracotta view rectangle`; card `about 340x80 px` with `a terracotta Corinthian helmet silhouette`; rest as B1 | ~19% | most distinctive (true two-colour icons, tondo minimap) but the minimap came out ~190 px, loose figures float under it, bronze drawn as an Ionic column |
| B3_floating_chips | `... MINIMAL and FLOATING but drawn in GREEK RED-FIGURE POTTERY colours: small separate black pills and chips (slightly transparent glossy black, about 85% opaque) with a single thin terracotta outline, every icon a flat terracotta orange silhouette, every number and label terracotta orange; the only ornament is a very thin terracotta meander line under the resource strip and one tiny terracotta running-hoplite silhouette at its left end.` resource strip top left `about 24 px tall`, minimap `about 120 px wide with a thin terracotta outline`, squad chip `about 300x64 px`, build bar `about 36 px tall`; `no other figures` added; `less than 10%` | ~12% | A x B hybrid, compact; icons partly coloured and shifted by one (two wheat icons, no stone), hoplite ornament in its own box |

**Download note.** In this Chrome the "Download full size" button and a scripted `<a download>` both saved nothing,
and Gemini's CSP blocks `fetch` to localhost. What works: overlay the newest generated `img` (a `blob:` URL) 1:1 at
the top-left with `javascript_tool`, then `computer` `zoom` on that region with `save_to_disk: true` (gives the
1024x637 preview, not full size). The image file input appears only while the "+" menu is open; tag it with an
`aria-label` from JS so `find` returns a ref for `file_upload`. Insert long prompts with `execCommand('insertText')`
(typing times out).

**Lessons:** (1) Every render repainted the carried ladder (raised or moved): mention "do not move or raise the ladder"
next time. (2) Gemini rounds "4 formations" down to 3 and "8 buildings" down to 7 in every style: count in the review,
or ask for the build bar with numbered slots. (3) "Two colours only" holds for frames but not for resource icons unless
the prompt says "no other colours anywhere in the HUD" (B2). (4) Size words ("26 px", "48 px") are honoured for strips,
not for bands with three groups or framed minimaps.

## 34. Biome: Dodona (ART-9)

Dense oak, beech and silver fir forest of the NW home region (docs/WAR.md: Dodona, Ladon Oakwood, Teeth Foothills): the
oracle grove, bog iron, timber and pitch. Raws: `shots/war/pixellab/dodona/raw/` (git-ignored). List:
`scripts/war/art/biomes/dodona.mjs`. Build `node scripts/war/art/build.mjs --biome dodona`, QA `qa.mjs` (passes), preview
`node scripts/war/art/preview.mjs --biome dodona` -> `shots/war/pixellab/dodona/DODONA_contact.png`, `DODONA_patch_1x.png`
(44 x 44 forest edge round a clearing, squad in the clearing, a file on the path under the trees), `DODONA_patch_nofade_1x.png`,
`DODONA_fade_compare_1x.png` (left no fade, right fade), `DODONA_patch_zoom2x.png`. 96 generations (5 sets + 2 fill sheets
x 10, 26 `create_map_object` x 1).

Terrains: `litter` (deep forest floor), `moss`, `fern` (undergrowth), `mud` (path) each paired with the global grass; `bank`
(stream bank) paired with the global shallow water. Clearings are the global grass with Dodona variants (global grass
variants + wildflower and clover grass), no own set. Sets: `create_tiles_pro`, isometric 64, low top-down,
`tile_feature: tileset`, seed 31, graded sat 0.8–0.9 / val 0.8. Litter, fern and mud came back as straight block splits
(stair steps on the map) and moss without a mask-8 tile (its tile_8 is a second mask 0): all four use `organic: 0.6`.

| Pair | Call | Prompt (verbatim) | Result |
| --- | --- | --- | --- |
| grass-litter | `9a5bf453` | `dark muted olive grass to deep dark forest floor of brown fallen oak and beech leaf litter with dark twigs and a few acorns, dark epic desaturated ancient Greek oak forest` | kept; organic |
| grass-moss | `a1a6008c` | `dark muted olive grass to thick dark mossy forest ground, soft cushions of deep green moss over damp dark earth with small roots, dark epic desaturated ancient Greek oak forest` | no mask-8 tile: organic |
| grass-fern | `521687cc` | `dark muted olive grass to dense low fern undergrowth, many small dark green bracken fronds over dark brown forest earth, dark epic desaturated ancient Greek oak forest` | kept; organic |
| grass-mud | `ea0c817f` | `dark muted olive grass to a dark wet muddy forest path of trodden brown mud with puddles, hoof prints and cart ruts, dark epic desaturated ancient Greek oak forest` | kept; organic |
| bank-shallow | `e57b498a` | `dark wet forest stream bank of brown mud, rounded grey pebbles and exposed roots to shallow murky slate-blue stream water, dark epic desaturated ancient Greek oak forest brook` | kept (bank first) |
| fills | `cd0f4cfd` (`tile_view_angle: 30`, no tileset) | `1). deep dark forest floor of brown fallen oak and beech leaf litter 2). dark forest floor leaf litter with fallen twigs, acorns and beech nuts 3). thick dark green moss cushions over damp dark earth 4). dense low dark green bracken fern undergrowth over dark earth 5). dark wet trodden mud path with puddles and hoof prints 6). dark wet stream bank mud with rounded grey pebbles and roots 7). lush dark green forest clearing grass with small dull white and yellow wildflowers 8). dark green clearing grass with clover tufts and a few fallen leaves, dark epic desaturated ancient Greek oak forest` | only the first 4 items, 4 tiles each: 0–7 litter, 8–11 moss, 12–15 fern; litter 3, 4, 6, 7 failed the rim check |
| fills2 | `8003c3fb` (same) | `1). dark wet trodden brown mud forest path with puddles, hoof prints and cart ruts 2). dark wet forest stream bank mud with rounded grey pebbles and exposed roots 3). lush dark green forest clearing grass with small dull white and yellow wildflowers 4). dark green forest clearing grass with clover tufts and a few fallen oak leaves, dark epic desaturated ancient Greek oak forest` | 4 items x 4 in order: mud, bank, flowered and clover clearing grass |

Objects: `create_map_object`, high top-down, high detail, detailed shading, basic mode; every prompt ends with `seen from a
high isometric three-quarter view, dark epic desaturated colours, heavy shadows, only the <thing> on a fully transparent
background, no ground, no soil, no base under it` (plants) or `..., no ground, no grass, no base under it` (the rest).
Subject (verbatim, before the tail):

| id | Call | Canvas | Subject | Result |
| --- | --- | --- | --- | --- |
| oak-sacred | `3c4515e1` | 400 x 400 | `one huge ancient sacred oak tree of the oracle of Dodona, enormous thick gnarled furrowed dark grey-brown trunk with spreading massive limbs, a vast broad dense crown of dark muted green lobed oak leaf clumps, a few small bronze votive bells and pale cloth ribbons hanging from the low branches` | grey bg + dirt disc (dirt = trunk colours): cut under a `below` polyline round the root flare; 2 x 2, 10 m |
| oak-a | `3e22bfd2` | 320 x 332 | `one tall old European oak tree, thick straight furrowed dark grey-brown trunk, broad rounded crown made of many dark muted green lobed oak leaf clumps with deep shadows between them` | white bg + grass block: base dropped |
| oak-b | `dfda2b18` | 260 x 264 | `one medium oak tree leaning slightly, twisted dark brown trunk forking low into two limbs, uneven irregular crown of dark muted olive-green lobed oak leaf clumps` | grey cast shadow: `drop` its colour |
| beech-a | `aefee5fd` | 280 x 396 | `one tall mature European beech tree, tall smooth pale silver-grey trunk, tall dense oval crown of small dark muted green beech leaves in layered sprays` | clean (white bg keyed) |
| beech-young | `21c14136` | 180 x 232 | `one young beech tree, slender smooth pale grey trunk, narrow airy crown of dark muted green and dull copper-brown beech leaves` | clean |
| fir-silver | `680fb86e` | 160 x 396 | `one very tall silver fir tree, straight dark grey trunk, tall narrow conical crown of dense flat tiers of dark blue-green needle branches with a pointed top` | pale blue bg + shadow ellipse: `drop` |
| fir-silver-b | `6ed6a245` | 120 x 264 | `one medium silver fir tree, dark grey trunk, dense conical crown of drooping dark blue-green needle branches, slightly ragged uneven tiers` | clean |
| pitch-pine | `8ae6b3c1` | 140 x 332 | `one tall old pine tree tapped for pitch, tall straight reddish-brown scaly trunk with a long pale scraped bark wound oozing amber resin, a small clay pot tied under the wound, high rounded crown of dark muted green pine needles` | grass disc dropped; `resource: pitch` |
| (rejected) timber | `13b95483` | 160 x 112 | `a timber resource stand: a big neat stack of freshly felled long oak and fir logs with pale cut ends, a woodcutter's double axe stuck in a chopping stump and a few wood chips` | a log pile on a grass block, not a stand |
| timber-stand | `735af61e` | 200 x 300 | `a rich timber stand: a tight cluster of five tall straight young oak and silver fir trees growing close together, dense dark muted green crowns, a few trunks marked with pale axe notches, two cut logs lying at their foot` | all firs, on a ground block: grass `drop` + `below` the block's top edges; `resource: wood`, `rich` |
| log-fallen | `0db6b9fd` | 160 x 80 | `one long fallen mossy oak log lying on its side, thick dark grey-brown cracked bark with patches of green moss and small bracket fungi, a broken splintered end and a few short snapped branch stubs, the log runs diagonally from the upper left to the lower right` | runs the other way (tile y axis); `scale: 0.8` |
| stump-a | `66db7c77` | 64 x 56 | `one old cut oak tree stump, flat axe-cut top showing pale growth rings, thick dark furrowed bark, a few roots spreading out` | clean, `scale: 0.75` |
| stump-moss | `a1218c36` | 80 x 72 | `one big old hollow rotting tree stump covered in thick green moss, jagged broken top, dark crumbling wood, a small cluster of pale mushrooms at its foot` | grass slab: x range + cut + keep notgreen |
| fern-a | `f35b94e9` | 72 x 56 | `one clump of tall bracken fern, many arching dark muted green feathery fronds spreading out from the centre` | clean, `scale: 0.75` |
| fern-b | `24f28600` | 56 x 44 | `one small low clump of hart's-tongue and shield fern, a few short broad dark green fronds and curled young fiddleheads` | clean, `scale: 0.55` |
| fern-c | `452862e7` | 112 x 64 | `one wide patch of dense bracken ferns, several overlapping clumps of dark muted green and a few dull rust-brown dying fronds, irregular wide spreading shape` | clean, `scale: 0.62` |
| mushrooms | `f7cf68fb` | 48 x 40 | `one small clump of wild forest mushrooms, a few dull red-brown and pale cream toadstools of different heights growing close together with a tiny tuft of moss` | `scale: 0.36`, moss tuft dropped |
| boulder-moss-a | `26a02221` | 112 x 80 | `one big rounded grey granite boulder thickly covered in dark green moss on top, a few lichen spots and ivy on its side` | moss fringe at the foot dropped |
| boulder-moss-b | `b1eff51e` | 96 x 64 | `a low cluster of three weathered grey stones half covered in thick dark green moss and small ferns growing in the cracks between them` | ground disc: `below` polyline |
| bramble | `4ecce8cc` | 112 x 72 | `one dense tangled bramble thicket, arching thorny dark red-brown blackberry canes with dark green leaves and a few small black berries, irregular wide mound` | clean, `scale: 0.67` |
| oracle-grove | `b4195dcd` | 200 x 160 | `an ancient Greek forest oracle shrine: a small ring of five rough tall grey standing stones with moss, in the middle a bronze tripod cauldron on a low flat stone altar, a few hanging bronze votive bells on a short wooden post` | six stones on a grass disc with a paved floor: grass dropped, paving kept (the shrine's floor); 3 x 3, `sacred` |
| hut-ruin | `1954cea1` | 200 x 180 | `one ruined abandoned woodcutter's hut in a forest, low walls of rough dark logs partly collapsed, a broken sagging thatched roof with a big hole, a rotten wooden door, an old axe stuck in a chopping block beside it` | clean (plank roof, no axe) |
| charcoal-pile | `aa08c249` | 140 x 112 | `one ancient charcoal burner's pile: a round dome-shaped mound of stacked wood logs covered with dark earth and turf, thin wisps of grey smoke rising from small vent holes, a few split logs and a wooden rake leaning on it` | grass rim dropped |
| iron-bog | `926e88cb` | 140 x 96 | `an iron bog-ore resource deposit: a heap of dug-up lumpy dark rust-red and brown limonite iron ore nodules beside a small rust-orange stained puddle, a wooden spade stuck in the heap and a woven basket of ore` | clean; `resource: iron` |
| red-deer | `7bc4f304` | 96 x 96 | `one red deer stag standing side-on facing left, dull dark reddish-brown coat, pale rump, head raised with large branching antlers` | clean, `scale: 0.8`; `fauna`, `animateLater` |
| owl | `20db2686` | 64 x 48 | `one tawny hunting owl swooping low with wide spread brown mottled wings and outstretched talons, round face with dark eyes` | clean, `scale: 0.6`; `fauna`, `flying`, `animateLater` |

**Canopy fade (for the renderer).** A dense forest hides units. Rule used by the mock-up: when a tree is drawn in front of a
unit (greater depth x + y) and its sprite box overlaps the unit's sprite box, draw the tree at 35% opacity (fade over
~150 ms in game, restore when the unit leaves). Only `kind: tree` fades; bushes, ferns and stones stay opaque. With it, a
file under the trees and a squad behind the edge read clearly; without it they disappear (`DODONA_fade_compare_1x.png`).
The game may refine it to a soft circle round each unit instead of the whole sprite, and should also fade over the
player's buildings and the cursor's tile.

**Lessons:** (1) A numbered fill prompt with 8 items gets 4 tiles each for the first 4 only; ask for 4 items to get all 4.
(2) Forest-floor sets come back as straight block splits like the sand sets: use `organic`. (3) Several dark forest
terrains that only pair with grass put grass verges wherever they touch: paint big single-terrain blobs (litter
dominant, moss in large patches, fern only along edges), not a fine mix. (4) PixelLab puts trees on ground blocks and
cast shadows on pale backgrounds; when the dirt shares the trunk's colours, a `below` polyline round the root flare is
the only clean cut. (5) Asked for a "timber stand", it drew a log pile; "a tight cluster of trees" gives the stand.
(6) Place set pieces in their own glades and keep the cells in front of them (south-east) free of trees, or the canopy
hides them.

## 35. Civilians (ART-S)

The six W-38 classes as soldier-format sheets, `src/assets/sheets/civ_<class>/` (SHEET_FORMAT v2, wrapped; rows SE,
NE, SW, NW; `variation` and `rarity` off, no colour groups yet). Clips: `idle`, `walk`, `run` (the flee), the work
clip(s), `hit`, `die`; 12 frames each. Work clips by class: cook `cook`, smith `forge`, merchant `trade`, engineer
`build`, physician `heal`, forager `chop`, `mine`, `harvest` (the names `workClips` in src/war/view/anim.ts already
plays for gathering and building). 104 PixelLab generations. Jobs, specs and the base edit prompts:
`docs/v5/pixellab/CIV/` (`bases.jobs.json`, `<class>.jobs.json`, `<class>.sheet.json`); tools
`scripts/art/pixellab/civ/` (`grid.mjs`, `prep.mjs`, `prompts.mjs`, `spec.mjs`, `view.mjs`) plus `mobs/build.mjs`
(now with `rotations`, `mirror:` jobs and wrapping) and `anim2/ground.mjs`. Review: `shots/war/civ/` (git-ignored).

**Bases: the militia re-dressed, not recoloured.** The militia's four game-facing rotations (character
`4860b1e6-…`) packed into one 136 x 136 grid (`civ/grid.mjs pack`, SE NE / SW NW) and re-dressed with **one**
`edit_image_pro_flash` text edit per class (6 generations for all four views, `no_background: true`); the same body,
size, feet and face come back in every view, and the four views stay consistent with each other because they are
one image. `transfer_outfit` / `edit_image` would cost 10–25 per call. Every edit opens `Re-dress the same man in all
four views as {WHO}, a civilian, no armour{, no weapon}: remove the spear and the crimson cloak; keep the same body,
size, pose, feet and face in each view.` and ends `Heavy shadows, desaturated dark (warm) colours, same pixel art
style.` One hue family per class so they read apart at 58 px:

| class | WHO · outfit · tools |
| --- | --- |
| cook | grim ancient Greek army cook · bareheaded, short dark hair and beard; dull rust-orange short tunic, sleeves rolled up; long stained greyed-linen apron to the shins · dark bronze cooking pot in the left hand, long wooden ladle in the right |
| smith | grim ancient Greek blacksmith · bare muscular soot-darkened arms; short dark charcoal sleeveless tunic; thick dark brown leather apron chest to knees; rolled leather headband, full black beard · heavy iron hammer down in the right hand, long iron tongs in the left |
| merchant | grim ancient Greek travelling merchant · wide flat-brimmed brown felt petasos; long dark teal-blue robe with a dull ochre border, dark ochre mantle over the left shoulder; fat leather satchel across the chest, coin purse · small dark bronze balance scale held up in the left hand |
| engineer | grim ancient Greek siege engineer and master builder · low round grey-green felt cap; dull moss-green knee-length tunic, broad leather tool belt with chisel and plumb bob; coil of rope over the shoulder; short grey beard · heavy wooden mallet in the right hand, long wooden measuring rod in the left |
| physician | grim old ancient Greek physician · bald, long grey hair and beard; long dull oatmeal-beige chiton to the ankles, dark slate-blue himation over the left shoulder; leather bag of herbs at the hip · tall plain wooden staff upright in the right hand ("no white cloth") |
| forager | grim lean ancient Greek peasant forager, farmer and woodcutter · wide conical straw sun hat; rough undyed brown-grey sleeveless tunic, rope belt; wicker basket on his back · woodcutter's axe down in the right hand, sickle in the belt |

**Clips.** pixminimax, 12 frames, 1 generation each, on a 96 x 96 canvas with the rotation at (14, 24)
(`civ/prep.mjs`: head room for a raised hammer, width for a fall), `view: high top-down`. **Only south-west and
north-west are generated; south-east and north-east are their mirrors** (build spec `"mirror:<facing>"`): half the
generations, at the price of the tool changing hands in the mirrored rows. Every prompt word for word:
`node scripts/art/pixellab/civ/prompts.mjs <class> <anim> <dir>`; the subject is the class's WHO with its tools
(", seen from behind" on NW), initial pose "standing upright at rest, his arms down at his sides", `{hands}` = what
each hand keeps ("the bronze pot stays in his left hand and the wooden ladle in his right hand"). The shared clips:

- idle: `standing at rest in place: he takes a deep slow breath, the chest swelling and the shoulders lifting, then lets it out with a sigh, the shoulders dropping and the head dipping, shifts his weight from one foot to the other and glances to the side; the feet stay on the same spot, he does not walk away; {hands}; no effects`
- walk: `walking in place {t} with an easy unhurried civilian gait, natural strides, his free arm swinging a little; {hands}; …`
- run (SW): `fleeing in fear: running hard in place {t}, hunched forward, long fast strides, his free arm pumping, he throws one frightened glance back over his shoulder; {hands}; on the same spot, he does not move away; no dust, no effects`
- run (NW, the wording that held the back view; initial pose "… seen from behind, his back to the viewer …"): `we see him from behind the whole time: he flees in fear, running hard in place straight away from us into the picture towards the upper left; his back, the back of his head and the soles of his feet face the viewer in every frame, never sideways, never in profile, he never turns round; hunched forward, fast strides, arms pumping; {hands}; …`
- die (SW): `dying: his strength suddenly gives out, he clutches his chest, his knees buckle and he topples over backwards and lies still on his back on the ground; {the tools} fall beside him; his body and clothes stay clean, no wounds, no red, no blood at all, no effects`; NW falls forwards: `seen from behind, dying: … he pitches forward away from the viewer towards the upper left, falls onto his front and lies still face down on the ground, his back towards us; …`
- hit = die frames 1, 2, 2, 1 (he clutches his chest), no generation.
- Work (every one opens `he alone, at work in place:` and carries "the feet stay on the same spot, he does not walk away"; NW opens "seen from behind, his back to the viewer in every frame, he never turns round:" and ends with §27b's AWAY tail): cook `he sets the bronze pot down on the ground in front of his feet, bends over it and stirs it slowly round and round with the long wooden ladle, lifts the ladle to his mouth to taste, then bends and stirs again; … no fire, no steam`; smith `a small dark iron anvil stands on the ground in front of his feet; he holds a bar of iron on it with the tongs in his left hand, swings the heavy hammer up over his right shoulder and brings it down hard onto the bar on the anvil … two heavy blows … no sparks, no fire, no glow`; merchant `he holds the small bronze balance scale up before his chest in his left hand, reaches into the satchel at his hip with his right hand, takes out a coin and drops it into one pan, the pans swing and settle, he leans in and studies them, nods, then tips the coin back into his satchel`; engineer `he plants the long measuring rod upright beside him in his left hand, then … swings the wooden mallet up over his right shoulder and brings it down hard onto the top of one wooden stake …`; physician `he leans the tall staff into the crook of his right arm, takes a small clay bowl out of the bag at his hip … grinds herbs in it with a small pestle …`; forager chop / mine / harvest are §27b's (mine and harvest: "first he lays the axe down on the ground behind him"; harvest drops the olives "over his shoulder into the wicker basket on his back").

Build: `civ/spec.mjs <class> <work,…> [anim=sw/nw attempt]` → `mobs/build.mjs docs/v5/pixellab/CIV/<class>.sheet.json`
(`shrink: 1`: frames stay at true scale and are only snapped to the base's own palette; saturated sparks and blood
cut, specks dropped) → `anim2/ground.mjs civ_<class> idle walk run <work…>`. Contact sheet and GIFs beside the
militia: `mobs/contact.mjs shots/war/civ civ_cook civ_smith …`.

**Lessons:** (1) A 2x2 grid in one Pro Flash edit is the cheap way to re-dress a base: 6 generations for four
consistent views of the same body, where a recolour (the bandit) changes nothing the eye reads. (2) pixminimax turns
a back-facing flee into a left profile (cook, smith, merchant, engineer a1); only "we see him from behind the whole
time … the soles of his feet face the viewer … never sideways, never in profile" held the back (a2). (3) Back-view
falls ask for a fall forwards, away from the viewer; a backwards fall from behind turns him round. (4) The forge
sparks come anyway; the build's chroma cut removes them, but the pickaxe's white burst is neutral: those frames
are replaced by their neighbours (`keep` in `forager.sheet.json`; `spec.mjs` rewrites the spec, so re-add it). (5) Back-view work clips still drift towards a profile
(cook stirring, engineer building); kept.

## 36. Crafting art (ART-C)

Workplaces, the engineer's engines and fortifications, and the crafting icons (WAR.md "Crafting and professions").
Job ids: `scripts/war/art/craft-jobs.json`. Builds: `node scripts/war/art/buildings.mjs` (then `siege.mjs`: its palette
starts from the buildings one), `node scripts/war/art/ui-craft.mjs` (after `ui.mjs` and `ui-redfigure.mjs`; note
`ui.mjs` wipes `public/war/ui/`, and the W-36 map icons are not rebuilt by it). Mock-ups: `node
scripts/war/art/craft-preview.mjs` -> `shots/war/craft-art/` (`CRAFT_workplaces`, `CRAFT_states`, `CRAFT_quarter_1x`,
`CRAFT_engines`, `CRAFT_forts`, `CRAFT_icons_{32,24}_3x`, `CRAFT_mock_1x`, `CRAFT_mock_2x_crop`). **78 PixelLab
generations**: 17 map objects, 34 state img2img, 2 Pro Flash paints (6 each), 4 pixflux paints, 11 pixen icons.

**Workplaces** (`WORKPLACES` in `buildings.mjs`, the BUILDINGS pipeline of §30): one building type per level, `forge` ->
`forge2` -> `forge3` (`chain`, `level`, `upgrade` in `buildings[]`); the sorting floor is `upgradeOf: storehouse` and has
two levels (WAR.md has no L3). Footprints per WAR.md: forge, infirmary, sorting floor 3 x 3, cookhouse 3 x 2, workshop
4 x 3, market stall 2 x 2. `create_map_object`, high top-down, high detail, detailed shading, the §25 tail (`, seen from a
high isometric three-quarter view, dark epic desaturated colours, heavy shadows, only the <thing> on a fully transparent
background, no ground, no grass[, no floor], no base under it`); grade sat 0.6 val 0.78, grass flooded. Subjects
(verbatim, canvas):

| id | Subject |
| --- | --- |
| forge (192²) | `a small ancient Greek open-air smithy: a low forge hearth of clay and rough stones with glowing coals and a leather bellows, a dark bronze anvil on a tree stump, a stone water trough, a rack of tongs and hammers, under a simple lean-to roof of rough dark timber and reed thatch on two posts` |
| forge2 (192 x 224) | `an ancient Greek smithy: a small rectangular workshop of rough dark grey fieldstone walls with a low-pitched roof of dark weathered terracotta tiles and a short square stone chimney, the front side open on stout wooden posts, inside a stone forge hearth glowing orange, an anvil, a quench trough and racks of tools, showing two walls` |
| forge3 (192 x 240) | `a large ancient Greek master smithy: a long workshop of dark grey ashlar stone with a low-pitched roof of dark weathered terracotta tiles and two square stone chimneys, an open colonnaded front on stout posts, two forge hearths glowing orange, two anvils, racks of finished bronze shields, spears and helmets, sacks of charcoal and a pile of iron bars, showing two walls` |
| cookhouse (160²) | `a small ancient Greek army field kitchen: a stone-ringed fire pit with a big dark bronze cauldron on an iron tripod, a small domed clay bread oven, a rough wooden table with bowls, clay jars and grain sacks, under a lean-to roof of rough timber and reed thatch on posts` |
| cookhouse2 (160 x 176) | `an ancient Greek cookhouse: a small rectangular building of rough pale grey stone with a low-pitched roof of dark weathered terracotta tiles and a short clay chimney, beside it two domed clay bread ovens, clay amphorae, sacks of grain and a bronze cauldron over a small fire, showing two walls` |
| cookhouse3 (160 x 192) | `a large ancient Greek army mess kitchen: a long stone building with a low-pitched roof of dark weathered terracotta tiles and a square stone chimney, a covered porch on wooden posts along the front with a long trestle table, three domed clay bread ovens in a row, a huge bronze cauldron on a stone hearth, rows of amphorae, hanging hams and bundles of herbs, showing two walls` |
| infirmary (192²) | `an ancient Greek army field infirmary: a large open-sided tent of dark undyed canvas on wooden poles with guy ropes, inside two low wooden cots with dark woollen blankets, a small table with clay jars of salve, rolls of linen bandages and a bronze basin` |
| infirmary2 (192 x 208) | `an ancient Greek infirmary with a herb garden: a small rectangular building of rough grey stone with a low-pitched roof of dark weathered terracotta tiles and a covered porch on wooden posts with two cots under it, beside it a small herb garden enclosed by a low stone wall with rows of green herb beds and a wooden rack of drying herb bundles, clay jars, showing two walls` (+ `no grass outside the garden wall`) |
| infirmary3 (192 x 224) | `an ancient Greek iatreion, a healing sanctuary of Asclepius: a small stone hall like a temple with four plain columns across its front porch, a low triangular pediment and a low-pitched roof of dark weathered terracotta tiles, a stone altar in front with a bronze staff and serpent, a stone water basin and a few herb beds beside it, showing two walls` |
| workshop (224 x 192) | `an ancient Greek carpenter's yard: a timber lean-to shed with a rough plank roof on posts, a heavy workbench with saws, axes and mallets, two sawhorses with a log being sawn, stacks of planks and squared beams, a half-built wooden shield screen on two wheels` |
| workshop2 (224 x 208) | `an ancient Greek engineer's workshop: a long timber-framed shed with a low-pitched roof of dark weathered terracotta tiles and open sides on stout posts, two workbenches with tools, a pole lathe, coils of rope, stacks of planks and beams, bronze fittings, a large spoked wooden wheel leaning on a post, showing two walls` |
| workshop3 (224 x 240) | `a large ancient Greek siege engineer's workshop: a tall hall of dark grey stone and heavy timber with a low-pitched roof of dark weathered terracotta tiles and a wide open double door, beside it a tall wooden treadwheel crane with a rope and pulley, a half-built bolt-throwing catapult on trestles in front, stacks of squared beams, coils of rope and iron fittings, showing two walls` (the catapult did not come) |
| market-stall (128 x 144) | `an ancient Greek market stall: a small wooden booth with a slanted awning of faded dark red and cream striped cloth on four posts, a wooden counter with clay amphorae, baskets of olives and grain sacks` |
| market-stall2 (128 x 160) | `an ancient Greek agora shop: a small stone booth like a tiny stoa with two short stone columns and a low-pitched roof of dark weathered terracotta tiles, a counter with amphorae, bolts of dyed cloth, a bronze balance scale and baskets, a faded red cloth awning, showing two walls` |
| market-stall3 (128 x 176) | `a rich ancient Greek merchant's counting house: a small building of pale limestone with two columns at its porch and a low-pitched roof of dark weathered terracotta tiles, a marble counter with a bronze balance scale and stacks of silver coins, sealed amphorae and iron-bound wooden chests, a long dark red cloth banner hanging by the door, showing two walls` |
| sorting-floor (192 x 208) | `an ancient Greek storehouse with a sorting floor: a long rectangular building of rough dark grey fieldstone walls with a low-pitched roof of dark weathered terracotta tiles and one wide wooden door, against its side a roofed open sorting shed on posts with wooden racks of drying flax bundles, baskets and sacks, and a small turf-covered charcoal mound beside it, showing two walls` |
| sorting-floor2 (192 x 208) | `an ancient Greek storehouse with a tannery: <the storehouse as above>, beside it a roofed open shed on posts with brown animal hides stretched on wooden frames to dry, three round stone tanning vats of dark liquid, stacked folded leather, showing two walls` |

States: §30's recipe (pixflux img2img 200 over `--inits`, isometric, high top-down, highly detailed, detailed shading,
no_background, seed 31, tail `high isometric three-quarter view, dark epic desaturated colours, pixel art, transparent
background`). Scaffold: `<an ancient Greek stone smithy> under construction: half-built rough fieldstone walls with ragged
unfinished tops, no roof yet, wooden scaffolding poles and planks` (timber: `bare wooden posts and rafters, no roof planks
/ thatch / tiles yet`; tent: `a canvas field tent half pitched: bare wooden tent poles and ridge pole, the dark canvas only
half raised and hanging loose, guy ropes on the ground, cots stacked`; stall: `bare wooden posts and a half-built counter,
no awning yet, planks stacked`; temple / counting house: `column drums half stacked`). Damaged: `a burnt and ruined <...>:
walls blackened with soot, the tiled roof collapsed with charred broken beams and holes, <smashed amphorae / cracked ovens
/ broken chests / burnt hide frames>, rubble` (tent: `the dark canvas scorched black with big burnt holes, charred broken
tent poles`). Rising = the scaffold cut down (no generation), foundation = drawn.

**Working fx** (`buildings[].fx.working`: siege fx ids at sprite px of the done sprite) are found on the sprite, not placed
by hand: the hearth = the centroid of fire-coloured px before the palette snap (heat-glow, a tongue, forge embers), the
smoke = the top px for the chimneyed forge2/3 and cookhouse2/3 (smoke-wisp-b / -a, alpha 0.55 / 0.45), else a wisp over
the hearth. Infirmary, workshop, stall and sorting floor have none (`workingNote`): the crafter's work clip is the activity.

**Engines** (`siege.mjs`, generic `engine()`; schema as the ram / thrower: facings, foundation .. destroyed, crew,
back/front layers, anim strips): `mantlet` (1 x 1, a 2 m plank screen with iron bands, pointed plank tops, a view slit,
wings, push poles; front layer when facing e / s), `covered-ram` (4 x 2, 8 m, eight wheels, wet hides to the ground,
iron-scaled end bays and iron-plated gables at both ends, a ram's-head log, crew 10, swing strip), `oxybeles` (2 x 1, a
torsion bolt thrower on a pedestal, shoot strip with releaseFrame and release point, `bolt` projectile in 8 directions),
`siege-tower` (2 x 2, 9.7 m, an open braced ground storey with a centred ladder, hide-hung upper storeys, arrow ports, a
drawbridge hinged at 6.2 m on the facing side lowered over 7 frames in the `bridge` strip; crew 8). The two big bodies
are kept front-to-back symmetric (a bridge opening and a plated gable at both ends, the ladder centred) so w / n reuse
the e / s paint. Paints (`raw/paint/`): covered ram by `edit_image_pro_flash` text, 6 generations each (the ram's §31
prompt with `covered battering-ram shed ... on eight solid wooden wheels. The gabled roof and the side curtains hanging to
the ground are covered with overlapping stitched wet rawhide panels, dark glossy brown, sewn seams and lashing ropes; both
end bays of the roof and both gable ends are sheathed in riveted dark iron plates, an opening in each gable`); the tower
(136 x 384) is past Pro Flash's 256 px limit, so pixflux img2img, strength 170, seed 7 (260 barely changed it):
`detailed dark pixel art of an ancient Greek wheeled siege tower of three storeys on six solid wooden wheels: an open
ground storey of heavy oak posts with X braces, two upper storeys clad in planks and hung with wet dark brown rawhides
with stitched seams and lashing ropes, small dark arrow ports, a fighting top with a timber rail, rough-hewn timber with
wood grain and iron nails, light from the left, heavy shadows, desaturated dark warm colours, transparent background`;
pixflux paints its background in, so the paint is masked to the render's silhouette (`paintMask`). Mantlet and oxybeles
stay box renders (small; a paint was not worth 12 generations each).

**Fortifications** (`buildings.mjs`, 0 generations): `ditch` kit (16 frames by neighbour mask, a 1.4 m wide, 1.4 m deep
pit, every state, damaged = filled with fascines; rendered 1 m into the joined neighbours and clipped to the tile's own
diamond, since the pit is below ground and the near ground hides it; seam-tested like the palisade), `stakes` (1 x 1,
nine angled sharpened stakes, voxelised), `<stone|wood>-gate-<x|y>[-deep-<side>]-iron` (`variantOf` the plain gate:
riveted 0.5 m iron plates and two straps on the leaves), `hides-palisade` / `hides-rampart` overlay kits (the wall's frame
layout, drawn over its done frame; rendered from the wall's own boxes with a depth-only marker colour, so only the
visible hide shows).

**Icons** (`ui-craft.mjs`): goods and remedies pixen 32x32, `no_background`, `single color outline`, the §32 template
`game UI icon, <subject>, <name> icon, dark epic ancient Greek style, desaturated gritty colours, thick dark outline,
readable silhouette`. Subjects: hides `a folded brown animal hide with fur on one side and the rough pale underside
showing`; flax (2nd try) `a sheaf of long straight dry flax stalks bound in the middle with twine, pale straw yellow with
a few tiny pale blue flowers on top`; herbs `a small bunch of green healing herbs tied with string, sage and thyme
leaves`; charcoal `a small heap of black charcoal lumps with glowing orange embers in the cracks`; leather `a rolled sheet
of smooth tanned brown leather tied with a thong`; linen `a neatly folded stack of pale cream linen cloth`; oil `a small
terracotta oil jug (lekythos) with golden olive oil dripping from its lip and a green olive leaf`; bandages `two rolled
linen bandages, one partly unrolled, pale cream cloth`; salves `a small round clay pot full of thick green herbal salve
with a wooden spatula in it`; theriac `a small dark glass vial of red-brown antidote potion sealed with wax, a coiled
green snake around it`. Rejected: flax `a tied bundle of long pale golden flax stalks with small blue flowers at the top`
(a sack with blue gems). Node icons (72, `node-<tree>-<node>`, listed per tree in ui.json `craftNodes`) and badges
(`badge-quality-*`, `badge-rarity-*`, rarity ramps from `src/ui/tokens.ts`) are drawn: glyph.mjs pictograms (the shared
renderer, moved out of ui.mjs) at 80% on a red-figure medallion (black disc, terracotta ring; a cream ring = the free
root, a double light ring with studs = a capstone).

**Lessons:** (1) Map objects come on slabs again (paving, grass): flooding the grass is enough when the paving reads as
the building's yard. (2) Pro Flash edits stop at 256 px a side: tall sprites go through pixflux img2img (~170) with the
result masked to the render. (3) Keep painted machines symmetric front to back and make the asymmetric parts moving
boxes: one paint serves two facings. (4) Anything below ground must be clipped to its own tile's diamond and rendered
with its neighbours' continuation, or the far walls notch and the pit spills over the next tile's ground. (5) The
buildings palette is picked over every sprite and snaps the workplace fires away: find hearths before the snap and let
the fx bring the glow back.

## 37. World map art (M4c)

Owner: "the world map should be very flat, with some art in it, but the colour balance must be clear and each region
must be clear." Strategic view only (W-02). Prototypes: `shots/war/worldmap/proto/` (git-ignored), Gemini Pro, 3
generations, each a fresh chat, captured as in §21b (devicePixelRatio was 1 here: four 512 px canvas tiles, `zoom` on
0,0–417,417 of the 1564-wide frame at `scale: 1`, stitched with ffmpeg `hstack/vstack`).

| File | Prompt | Verdict |
| --- | --- | --- |
| `WM_A_flat_board.png` (1024²) | A, below | flattest and calmest, cream borders read well; only ~21 regions, homes drawn as rings (circle + 4 entries) |
| `WM_B_redfigure_frame.png` (1024x765) | B, below | dark 3 px borders with a cream inner edge are the clearest; meander frame and black sea tie to the W-32 kit; ~27 regions, homes still rings |
| `WM_C_political_dither.png` (1024x765) | C, below | **reference for the assets**: flat fills with a light 2-colour checker dither, glyphs kept to region edges, sand coast edge, alliance wash over home + entries, puzzle-piece regions, no rings; borders a little thin, so the assets take B's dark + cream double border |

A (square):

```
Create an image. ROLE: a design prototype of the strategic world map for an ancient-Greek war strategy game; it is a flat board you read, not a landscape you walk on. ASPECT: square 1:1, highest resolution available. VIEW: straight down, perfectly flat, like a printed board-game map: no perspective, no relief shading, no shadows, no 3D, no hills rising up. STYLE: crisp PIXEL ART with visible square pixels and a limited palette; every region is a clearly bordered shape filled with ONE calm, flat, slightly desaturated colour by biome (pine green, olive green, straw steppe, pale sand, rust red, grey stone, snow white, reed teal), with only a little light painted detail on top as small flat pixel glyphs: tiny clusters of pine and oak trees, small triangle mountain glyphs, little olive-tree dots, wavy dune strokes, a few palm glyphs; the glyphs are sparse and small so the flat fill stays dominant and there is free room for labels. Region borders are strong, even, 2-pixel cream-coloured lines; the coast is a clean darker outline; the sea around is one calm flat dark slate blue with a few short wave dashes. GEOGRAPHY: one roughly square continent filling most of the image, divided into 37 regions of similar size with irregular organic outlines (not circles, not hexes, not a grid): (1) CENTRE: one region, a round flat stone-grey plateau with a small blue crater lake and a tiny temple glyph; (2) around it four gate regions: north a grey high saddle, west a dense dark forest, south a gorge where a river leaves the plateau, east red canyons; (3) NORTH: a narrow chain of snowy mountain glyphs runs from the centre straight up to the north coast, with one gap halfway marked by a small pass glyph, the chain ends in a glacier region at the north coast; (4) SOUTH: a blue river runs from the centre straight down to a fan-shaped delta at the south coast, with one ford marked across it halfway; (5) WEST: a big blue lake region in the middle of the west side, with a small river running to the west coast estuary; (6) EAST: a pale sand dune region in the middle of the east side, with a white salt-flat region on the east coast; (7) four HOME regions, one per corner quadrant, each a larger region with a tiny walled town glyph and a clear translucent colour tint over its flat fill: north-west home tinted deep blue-green (pine highland with a small lake), north-east home tinted gold (grass steppe), south-east home tinted terracotta red (desert oasis with palms), south-west home tinted purple (olive hills round a bay); each home is surrounded by a ring of four smaller entry regions. Clear colour balance: calm muted fills, strong light borders, a few accents. No text, no labels, no letters, no numbers, no legend, no compass, no frame, no units, no arrows.
```

B (4:3, red-figure frame):

```
Create an image. ROLE: a design prototype of the strategic world map for an ancient-Greek war strategy game: a flat board you read at a glance, armies hop between neighbouring regions. ASPECT: landscape 4:3, highest resolution available. VIEW: straight down, completely flat cartographic look like an old printed map redrawn in PIXEL ART: no perspective, no relief, no cast shadows. STYLE: crisp pixel art, visible square pixels, limited palette in the colours of Greek red-figure pottery plus calm earth tones: the sea is flat glossy near-black brown with a thin terracotta-orange coast line and a terracotta meander (Greek key) band framing the whole map; the land regions are calm flat fills by biome (muted pine green, olive green, straw yellow, pale sand, rust red, warm grey, off-white snow, teal reed marsh), each region clearly separated from its neighbours by a strong 3-pixel near-black border line with a 1-pixel cream inner edge. Light painted detail only: small flat pixel glyphs scattered sparsely inside regions (little pine trees, round oak trees, olive dots in rows, triangle mountains with white tips, wavy dune strokes, palm trees, reed tufts), leaving open flat space in the middle of each region for a label. REGIONS: exactly 37 regions, each with an irregular organic outline that follows the land (never circles, never hexagons, never a grid), all of similar size. LAYOUT (the continent fills the frame): one centre region, a flat grey plateau with a round blue crater lake and a small temple glyph, surrounded by 4 gate regions (N grey saddle, W dark forest, S river gorge, E red canyons) and 4 inner regions on the diagonals (NW moorland, NE grassy hills, SE dry savanna with acacias, SW cypress hills); from the centre a line of three regions runs to each coast: NORTH a chain of snowy mountain glyphs up to a glacier on the north coast, with one narrow pass cut through it; SOUTH a wide blue river flowing down to a fan delta, crossed once by a ford; WEST a large blue reed lake, then a river estuary at the west coast; EAST a pale dune sea, then white salt flats on the east coast. In each of the four corners an alliance HOME region with a small walled-town glyph and a tinted colour wash: north-west deep blue-green (pine valley with a cold lake), north-east gold (grass steppe), south-east terracotta (oasis with palms), south-west violet (olive terraces round a bay); each home is ringed by exactly four entry regions that touch each other around it. The overall colour balance is calm and clear: muted flat fills, strong dark borders, a few bright accents (the four home tints, the river and lakes). No text, no letters, no numbers, no legend, no compass rose, no units, no arrows.
```

C (4:3, political map, the reference):

```
Create an image. ROLE: a design prototype of the strategic world map for an ancient-Greek war strategy game, the political overview where armies move between neighbouring regions. ASPECT: landscape 4:3, highest resolution available. VIEW: straight down and completely flat, like a political map in a classic 16-bit strategy game: no perspective, no relief, no shadows. STYLE: crisp PIXEL ART, visible square pixels, limited palette, no gradients. Each region is ONE flat, calm, mid-value colour by biome with a very light 2-colour checker dither texture, and a few small flat pixel glyphs for its landscape: pine trees, round oaks, olive rows, cypress spikes, acacias, palms, triangle mountains with snow caps, dune ripples, reed tufts, burial mounds, red buttes. The glyphs sit near the edges of each region and leave the middle empty for a name label. Borders: every region outlined by an even 2-pixel dark umber line, so all regions read as separate puzzle pieces; coast drawn as a 1-pixel light sand edge; sea flat dark slate blue. REGIONS: about 37 regions of similar size, puzzle-piece shapes with irregular organic wavy outlines; NONE of them is a circle or ring, the home regions too are irregular blobs. LAYOUT: a centre region (grey stone plateau with a crater lake and a temple glyph) touching 4 gate regions (north saddle, west forest, south gorge, east red canyons), which are separated from each other by 4 diagonal inner regions (moor, grass hills, savanna, cypress hills); from the centre to each coast runs a line of regions: north a snowy mountain chain to a glacier, cut once by a narrow pass; south a big blue river down to a delta, crossed once by a ford; west a big reed lake and then an estuary; east a dune sea and then white salt flats. In each corner quadrant a HOME region with a walled town glyph, surrounded by four entry regions forming a ring around it, the home and its four entries share one translucent alliance colour wash: north-west blue, north-east gold, south-east red, south-west violet; all other regions have no wash. Clear colour balance: calm muted fills, strong dark borders, bright accents only on water and the four alliance washes. No text, no letters, no numbers, no legend, no compass, no frame, no units, no arrows.
```

**Lessons:** Gemini never reaches 37 regions (21, 27, ~30) and draws a home with its 4 entries as a ring of 5 unless the
prompt says "NONE of them is a circle or ring" (C). The prototypes set look and colour balance only; the region shapes
come from the layout script below, where the WAR.md adjacency is checked.

### 37b. Assets (`public/war/world/`, built by `scripts/war/world-art/`)

Reference: prototype C (flat dithered fills, glyphs off the label, alliance wash) with B's dark + cream double border.
Pipeline, deterministic (a rerun gives the same bytes): `layout.mjs` draws the NW quadrant as a 32x24 cell grid and
mirrors it into the other three (WAR.md topology is mirror-symmetric; a home's ring of entries meets the axis chains
at four-corner points, so non-neighbours only touch diagonally); `raster.mjs` warps it with seeded value noise into
organic shapes at 1024x768 logical px, cuts a rounded coast, keeps each region's largest piece; `regions.mjs` fails
the build unless every WAR.md adjacency has ≥ 12 px of shared border and no other pair does, then traces polygons,
centroid, label anchor (+ `labelRoom`) and one crossing point per adjacency; `paint.mjs` paints fills, coast, rivers,
lakes and glyphs, writes `base`/`borders` at 2x (2048x1536) and 4x (`@2x`), `region-ids.png` for hit tests,
`regions.json`, markers and banners, and warns when two neighbouring fills are closer than 28 (RGB distance);
`mock.html` + `mock.mjs` compose the view (tints, borders, labels, markers) into `shots/war/worldmap/WM_mock*.png`.
Raws: `fetch.mjs` → `shots/war/pixellab/worldmap/raw/` (git-ignored), job ids in `jobs.json`; trimmed 1x copies ship in `public/war/world/src/` so a fresh checkout rebuilds without them.

PixelLab `create_image_pixflux`, 29 generations, `no_background`, palette-locked (`color_image_base64` = 32 kit/biome
colours), `detail: low` unless noted. Glyphs open with `tiny map icon for a flat strategy world map:` and end with
`simple flat pixel art`; markers open with `map marker icon for a strategy game:`; banners with `alliance banner icon:
a hanging cloth banner on a crossbar,`.

| Name | Size, view, outline/shading | Middle of the prompt |
| --- | --- | --- |
| pine | 32², high top-down, single colour / basic | a tight cluster of three dark green pine trees seen from slightly above |
| oak | 32², high top-down | two round leafy green oak trees with short brown trunks |
| olive (redo, seed 203) | 32², high top-down | a small olive grove, five little round silver-green olive tree crowns with dark trunks, arranged in two rows (first try drew one tiny tree) |
| cypress | 32², side | three tall thin dark green cypress trees side by side |
| palm | 32², side | two date palm trees with green fronds and thin brown trunks |
| acacia | 32², side | one flat-topped acacia tree, wide umbrella crown of olive green, thin trunk |
| mountain | 48x32, side | a pair of grey rocky mountain peaks, simple triangle shapes, lit left side light grey, shadow side darker |
| peak | 48x32, side | a pair of tall jagged mountain peaks with white snow caps, grey rock below, simple triangle shapes |
| dune | 48x32, high top-down, lineless / flat | a small group of pale sand dunes, curved crest lines with a darker ochre shadow side |
| reed | 32², side | a clump of green reed tufts and cattails standing in a little shallow water |
| mound | 32², side | a round grassy burial mound (kurgan), low dome of straw-green grass with a small standing stone on top |
| butte | 32², side | a red rock butte, a flat-topped mesa with steep rust-red cliff sides |
| vine | 32², high top-down | a few rows of grape vines on stakes, dark green leaves with tiny purple grapes, seen from above at an angle |
| tor | 32², side | a granite tor, a small pile of rounded grey boulders with a few purple heather tufts |
| scrub | 32², side | a dry thorny scrub bush, khaki and olive twigs, low and wide |
| town | 48², high top-down, medium detail | (`small map icon …`) an ancient Greek walled town, a ring of cream stone walls with two square towers and a few terracotta-red tiled roofs inside |
| temple | 48², side, medium detail | (`small map icon …`) a ruined ancient Greek temple, cream marble columns on a stepped base, some columns broken |
| ford | 32², high top-down, flat | (`tiny map marker …`) a river ford, a short band of light sandy stepping stones crossing blue water from left to right, seen from above |
| pass | 48x32, side | (`small map icon …`) a mountain pass, a narrow gap between two grey rock peaks with a small ruined stone watchtower in the gap |
| fort | 32², high top-down, black outline / flat | a small square stone fort with four corner towers and a gate, cream stone with dark outline |
| battle | 32², black outline / flat | contested battle, two crossed bronze swords over a round terracotta-red and black disc |
| transit | 32², black outline / flat | an army on the march, a small round black shield with terracotta rim and a spear behind it, on a little black pennant shape |
| home | 32², black outline / flat | home capital, a small cream Greek temple front with a terracotta pediment on a black round badge with terracotta rim |
| banner dodona | 32x48, black outline / basic, medium | deep blue cloth with a terracotta border and a cream oak leaf emblem, swallow-tail bottom |
| banner skythia (redo, seed 225) | 32x48 | golden yellow cloth with a terracotta border, in the middle a simple black silhouette of a galloping horse seen from the side, swallow-tail bottom (first try drew a cross) |
| banner kyrene | 32x48 | crimson red cloth with a black border and a cream sun disc emblem, swallow-tail bottom |
| banner elaia | 32x48 | deep violet purple cloth with a terracotta border and a cream olive branch emblem, swallow-tail bottom |

**Lessons:** (1) A cell grid + smooth warp gives exact adjacency by construction; the check catches the corners, where
the coast cut ate two short borders twice (fixed by moving the a/b seam inward and a gentler coast warp). (2) Gemini
colours do not survive neighbours: tune fills with the RGB-distance warning, alternate light/dark between neighbours.
(3) Pixflux at 32 px often adds a small ground base under plants (reed, cypress, vine); fine on a flat map. (4) Ask for
the emblem as "a simple silhouette of X seen from the side", or it invents heraldry.
