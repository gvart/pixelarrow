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
  door with a threshold on the first non-open side of +y, +x, -x, -y, a roofed stair-house over the internal stair.
  Wood: braced posts, plank platform, log rail, shingle roof 2.9 m above the platform (lower eaves hid the archers).
  `stone-tower-done` / `wood-tower-done` objects are the standalone (nothing open) renders.

**Lessons:** (16) Split a structure men stand on into back and front layers by face orientation (+x / +y in front): one
depth buffer per layer, the renderer interleaves units. (17) A roof in the front layer must clear a standing man's head
seen from the far side of the platform: eave >= platform + 2.9 m at this view.

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
| thrower (2 x 1) | onager-type torsion engine: timber bed 4 x 1.4 m, a rope skein in bronze-capped side frames, one arm with a cup throwing forward against a padded buffer frame, a windlass at the back. Throw: 8 frames, arm -100 deg (cocked, loaded) -> +24 deg (hits the pad), stone released at frame 3 (`release` = tile offsets + zM per facing) |
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
