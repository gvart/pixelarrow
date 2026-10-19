# Art prompt library

The reusable image prompts of v5 and v6 and the prompts behind shipped art, in compact form: one template per
family plus a table of what changed per asset. Gemini makes the painted art (§1–§12), PixelLab the soldier sprites
(§13–§20); the global war world prototypes are §21. How to run a job: [ART.md](ART.md). Rejected attempts are kept only where the lesson needs them. Where a
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
