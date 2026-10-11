# v5 Asset log and Gemini queue

Owner: the `assets` agent (the only agent that touches Chrome). Other stories add requests to the queue. Every entry records the prompt, the file in `docs/v5/gemini/` and the processed destination.

## Queue

Empty. (The AS-02 remainder, ART-024 to ART-032, was made on 2026-10-10 and moved to Done.)

## Done

### AS-06 Expansion pixel art: field works, captain marker, standard banner (2026-10-11)

**Scope.** The story row: works (stakes, ditch, wagon laager, palisade, rampart; field-works.md R5 "distinct iso art that reads at 1x zoom"), the captain marker (ai-doctrines.md R6: "a 10 px glyph" over his head) and the Standard bearer's banner (abilities.md R5.5, battle-readability.md R2). New manifest rows **ART-072 to ART-078** (`kind: pixel`, `dest: public/world/`, `preview: null`). Nothing invented: every row is a cell kind or marker named in those GDDs. The works sim (FW-01) and works art wiring (FW-03) are not in the code yet, so no game slot loads these files.

**Sizes (decided here, from the code).** The art bible has no size for works or markers. They come from the real battle at 1x zoom (`BattleScene` camera zoom 1 at DPR 1; terrain props drawn 1 art px = 1 world px):
- the iso cell is **36x18** (`src/art/iso.ts` ISO_HW 18, ISO_HH 9; `terrain.w` = `sim.width`, so one terrain cell = one field unit, measured in the page). The art bible §8.5 says 32x16 ("measured", from the ART_STYLE video): **open issue for the art-director**, the code is 36x18;
- a man's figure is about 20x50 world px with his spear (frame 40x99 at BATTLE_RES 2, shown at 0.5), a group standard is 13x44 (`ground.ts` renderStandard), a boulder 48x36;
- so: `tile_stakes` 36x24, `tile_ditch` 36x20 (ground decal), `tile_rampart` 36x24, `tile_palisade` 36x48 (taller than a man), `tile_laager` 72x52 (one wagon per 2-cell laager segment, field-works.md R3 "laager: 2 cells"), `crest_captain` 10x10, `crest_standard` 16x44 (the group standards' height).
- **Names.** §8.4 has no world-sprite category, so the works use `tile_` and the markers `crest_` (both in the allowed list); `scripts/art/list.mjs` got two TITLES entries so ASSET_LIST.md shows them.

**Tool.** gemini.google.com, "Pro" mode, one chat ("Isometric Wooden Stakes Sprite") in a new tab I created, typed prompts, no tool or aspect picker. The first prompt had `docs/v5/gemini/AS-06/ref/ingame_sprites_x4.png` attached through the page's hidden `image/*` input: the real in-game sprites (two men, both group standards, a base plate, a boulder, a tree) captured from the running game's textures and magnified 4x nearest. No CAPTCHA, quota message or block; one prompt (the first crest) came back **empty** (no image, no error) and was simply re-sent. Downloads: 14, each moved by `grab.sh` (scratch) from `~/Downloads` only if it was the single `Gemini_Generated_Image_*` file absent from the start listing and newer than the start marker; nothing else in `~/Downloads` was touched. The tab was closed.

**Raws** (V5-049, gitignored): `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/sd-69ad2c/docs/v5/gemini/AS-06/ART-07N_<stem>_<n>.jpeg` (all 2528x1696, 1792x2400 or 2400x1792 JPEG) plus `ref/`. **Processed**: `docs/v5/gemini/AS-06/processed/tile_*.png` (5 files, copies of the ignored `docs/v5/art/staging/`).

**Can Gemini draw on the grid?** Partly. It draws real block pixel art (flat cells on one grid) once told the image is "a grid of N columns by M rows of big square cells, each one flat colour", but it **does not hold the count**: it overshot the asked cell count by 1.4x to 2.6x on every image, and changed cell size from image to image in one chat. The fake-pixel size is 34 to 68 raw px, above `detectGrid`'s max of 32, so every file was processed with an explicit `--grid n` read from the image (scan with `grid.mjs`, scratch: edge energy on period p, fractional, 8 to 160; the cell count was also checked by eye on the screenshot). Unscaling is by majority colour per cell, then PA-WORLD snap, binary alpha and pad: **never scaled to fit**. Where the unscaled art was larger than its canvas, the item was regenerated (stakes 1 and 2, laager 1) or dropped to code (crest, standard). Block purity of the accepted raws at their grid (share of pixels within RGB 48 of their cell mean): stakes 0.75 (Gemini's grid drifts across this image; the unscaled result was checked cell by cell and is clean), ditch 0.97, laager 0.98, palisade 0.89, rampart 1.00.

**Prompts.** The seed prompt (stakes 1), word for word:

```
Create an image. ROLE: a pixel-art game sprite for an isometric ancient-Mediterranean tactics game. The attached picture shows sprites already in the game (a hoplite, a skirmisher, two army standards, a unit base, a boulder, a tree) magnified 4 times: match their pixel density, palette, soft sel-out outlines and light from the upper left exactly. SUBJECT: one segment of a field-works line of sharpened wooden STAKES (a chevaux-de-frise row): five or six rough pale-wood poles with dark-brown pointed tips, driven into the ground at a 45 degree slant, all leaning the same way toward the upper right, set in a single row that runs diagonally from the upper left to the lower right like the edge of a 2:1 isometric diamond tile; a little turned dark earth at their feet. PIXEL GRID: true pixel art. The whole sprite is about 36 art pixels wide and 24 art pixels tall, and every art pixel is drawn as one clean, equal, square block of solid colour (very large chunky pixels, about 24 by 24 screen pixels each), aligned to one grid; hard edges; no anti-aliasing, no blur, no gradients, no dithering noise, no sub-pixel detail, no thin lines finer than one block. PALETTE: only these colours: #2a1a12 #442618 #5e2427 #7b503d #a87464 #9c8b78 #d6c0a8 #e8e2d4 #5a4a44 #836c65 #ac9283 #d2b68e #6a4a1e #b08a3a #5b3f2a #765d35 #9a8f3b #bba96a #4a5a2e. STYLE: a selective coloured outline (a darker shade of the local colour, never black), 3 to 4 step ramps, light from the upper left. BACKGROUND: a perfectly flat solid #FF00FF magenta background, edge to edge, with no shadow, no grass and no ground plane beyond the small patch of earth; the sprite centred. EXCLUDE: text, a frame, a grid overlay, several sprites, soldiers, a scene, a cast shadow on the magenta.
```

Every later prompt was a follow-up in the same chat: "Next sprite of the same set, same big cells (one flat colour each), same palette and light from the upper left, flat #FF00FF magenta background" + SUBJECT + a size **relative to an approved sprite** ("about half as wide as the wagon and a little taller") or a cell count + "No text, no anti-aliasing, no gradients, no detail smaller than one cell". Relative sizes worked better than cell counts.

| # | Raw | ART | Prompt (short) | Grid → art px | Verdict |
| --- | --- | --- | --- | --- | --- |
| 1 | `ART-072_tile_stakes_1.jpeg` | 072 | seed prompt above | no grid found (fine, ~130 art px wide) | **Rejected**: crossed X stakes (a cheval-de-frise frame), horizontal row, far too fine |
| 2 | `ART-072_tile_stakes_2.jpeg` | 072 | "MUCH lower resolution… a grid of exactly 48 columns by 32 rows… three or four stakes, each 2 cells thick… diagonal row" | 34 → 50x44 | **Rejected**: clean grid, but 50x44 is taller than a man (stakes are waist-high); larger than the 36x24 canvas |
| 3 | `ART-072_tile_stakes_3.jpeg` | 072 | "even smaller and chunkier… 24 columns by 16 rows… FOUR stakes… 2 cells thick, 6 to 8 long… 2-cell point" | 68 → 27x18 | **Accepted (family seed)**: four slanted stakes on an earth strip, knee to waist high beside the men |
| 4 | `ART-073_tile_ditch_1.jpeg` | 073 | "a flat diamond-shaped patch (2:1 floor tile) about 24x12… a narrow trench… far bank lit, near bank shaded, spoil ridge" | 68 → 34x20 | **Rejected**: a dark outline round the diamond reads as a pasted tile; trench not dark enough; one pink cell |
| 5 | `ART-073_tile_ditch_2.jpeg` | 073 | "only the trench itself… a band 3 to 4 cells wide… 2 across per 1 down… about 24 columns long" | 68 → 35x22 | **Rejected**: reads as a log; slope too steep |
| 6 | `ART-073_tile_ditch_3.jpeg` | 073 | "back to the diamond ditch… exactly twice as wide as tall… NO dark outline… trench a 3-cell band of #2a1a12… 1-cell lit lip, 1-cell spoil ridge" | 68 → 32x20 | **Accepted**: dark trench along the long axis; three cells join into one continuous trench in the game |
| 7 | `ART-074_tile_laager_1.jpeg` | 074 | "one WAGON of a wagon laager… two-axle farm wagon with high plank sides… four disc wheels… rolled hide… about 24x18 cells" | 30 → 72x53 | **Rejected**: one row too tall for 72x52; the cell is half the set's |
| 8 | `ART-074_tile_laager_2.jpeg` | 074 | "cells twice as big… only about 37 cells wide… long side upper left to lower right, two big disc wheels, plank sides 3 to 4 planks high" | 34 → 62x46 | **Accepted**: one wagon per 2-cell laager segment; as tall as a man's chest, reads as a wagon at 1x |
| 9 | `ART-075_tile_palisade_1.jpeg` | 075 | "same cell size as this last wagon… six to seven upright rough logs… sharpened… one rope band… stepping down along the iso slope… HALF as wide as the wagon and a little TALLER" | 48 → 33x48 | **Accepted**: the best of the set; taller than the men |
| 10 | `ART-076_tile_rampart_1.jpeg` | 076 | "earthen RAMPART… low long mound… flat walkway… lit upper face, shaded front face… turf tufts… one third of the palisade's height" | 48 → 36x32 | **Rejected**: reads as a log or a box; slope too steep |
| 11 | `ART-076_tile_rampart_2.jpeg` | 076 | "Use the footprint of the approved ditch diamond: an isometric earth BLOCK… top face a flat 2:1 diamond… raised only 4 cells… lower-left face mid earth, lower-right shaded… ragged top edges" | 60 → 36x24 | **Accepted**: a raised earth block; three in a row show faint seams (see notes) |
| 12 | `ART-077_crest_captain_1.jpeg` | 077 | (first try came back empty) "a very small pixel-art icon… about 12 cells wide and 12 tall… the red horsehair crest… arched red brush on a curved bronze holder" | 64 → 24x24 | **Rejected → code-drawn**: 2.4x the 10x10 grid, and a hook-shaped crest that does not read as a crest |
| 13 | `ART-078_crest_standard_1.jpeg` | 078 | "the army STANDARD… pole, crossbar, bronze sun disc, red square banner with a fringe and a cream stripe, two ribbons… 14 cells wide and 44 tall" | ~42 → 21x82 (weak grid) | **Rejected**: 1.9x the 44 px height |
| 14 | `ART-078_crest_standard_2.jpeg` | 078 | "cells TWICE as big… only 8 cells wide (plus 3 for ribbons) and 22 tall… disc 4 cells, banner 5x6" | ~24 → 32x117 (weak grid) | **Rejected → code-drawn**: Gemini kept the same fine cells; 2.6x too tall |

**Totals:** 14 renders; 5 accepted (one per work), 9 rejected; 2 items (ART-077, ART-078) moved to code-drawn art. No render had text, letters, people or modern objects.

**Pipeline.** `process.mjs ART-072..076 --grid n`: exact canvases, 7 to 16 colours, key residue 0. `check.mjs`: **5 PASS** (exact size, binary alpha, every pixel in PA-WORLD, name), ART-077 and ART-078 **NOT ASSESSED** (no file; code-drawn). `preview.mjs ART-072` → **NOT ASSESSED** (exit 3: `preview: null`, no game slot loads world works art) and `promote.mjs ART-072 --looked` → **REFUSED** (no preview record). **Nothing promoted**; `public/` is untouched.

**Side by side in the real game.** Since `preview.mjs` cannot show them, a throwaway Playwright script (scratch, not committed) started a fresh deployment on the dev server, loaded the five staged PNGs as textures into the running `BattleScene` and placed them one pace in front of the player's groups at the scene's own 1x zoom, feet on the bottom vertex of their cell diamond, depth by y like trees: 3 stakes, 3 ditch cells, 3 rampart cells with 3 palisade cells behind, one wagon. Shots at 390x844, DPR 1 and DPR 3 (the bottom half of the contact sheet is the DPR 3 crop). Read:
1. All five read at 1x as what they are: stakes, a dark trench, a raised earth bank, a timber wall, a wagon.
2. Scale is right against the men: stakes knee to waist high, wagon chest high, palisade above head height, rampart a low step.
3. Crisp at an integer scale, light from the upper left like the boulders and trees, sel-out outlines in dark brown.
4. Stakes are the brightest thing on the field (pale wood #e8e2d4). That serves R5 (they must read), but if the art-director finds them loud, FW-03 can tint them.
5. Three rampart blocks in a row show faint seams between cells (each block has its own lit edge). Acceptable for a generated assault rampart; a seamless long rampart would need a code-drawn strip.

**Contact sheet:** `docs/v5/art/AS-06-contact.jpg` (1307x760, 135 KB). Top: the five works at 3x nearest on grass, then the in-game sprites for scale (an ally and an enemy man at the battle's 0.5 display scale, a group standard, a base plate, a boulder). Bottom: the DPR 3 crop of the real deployment with the works placed beside groups I, II and IV.

**For FW-03 (works art wired), RD-01 (badges) and AB-03.**
- Load `public/world/tile_*.png` (after promotion) or draw them from the staged files; each is drawn with its feet on the bottom vertex of its cell diamond (origin 0.5, 1), depth y. The sprites run along field +x (screen down-right); use `setFlipX` for a line along field y. `tile_laager` covers 2 cells (one wagon per segment), the others one cell. `tile_ditch` is a ground decal: draw it under the men (or paint it into the ground texture). Then add a manifest `preview` (a battle fixture with works), run `preview.mjs`, read the sheets, `promote.mjs --looked`.
- **ART-077 captain crest (10x10) and ART-078 Standard banner (16x44) are code-drawn**, like every other battle glyph and the group standards: the crest as a 10 px glyph beside the morale glyphs (battle-readability R2, `src/art/icons*` / `vectorIcons.ts`), the banner as a variant of `ground.ts` `renderStandard` (same 44 px height, 4-frame wave) with a bronze sun disc and a red square cloth, matching the atlas icon `icon_standard` (ART-069). Their manifest rows have status `code-drawn` and no raw is used.

### AS-05 Beast plates, reward chests and the laurel branch (2026-10-11)

**Scope.** The story row: the 8 beast plates (ART-036 to ART-043), the 3 chests (ART-052 to ART-054) and the laurel branch (ART-055). No new manifest rows. Every plate is a beast that exists in the game (`src/data/beasts.ts` MythIds, `src/i18n/beasts.en.ts` hints); each SUBJECT was written from the manifest row **plus** the in-game model in `src/art/beastArt.ts` (colours, props, part counts) and the hint text, so the plate and the battle figure agree (story AC 1).

**Tool.** gemini.google.com, "Pro" mode, one new chat in a new tab of a fresh tab group, prompts typed as "Create an image…" / "Edit…" with no tool picker and no aspect picker. Plates and chests: 2048x2048 JPEG; laurel: 1792x2400 (3:4). All above their tiers, nothing upscaled. References attached through the page's hidden `image/*` input (`file_upload`). No CAPTCHA, quota message or download block. Downloads were moved by `grab.sh` (scratch): only a `Gemini_Generated_Image_*.jpeg` absent from the start listing and newer than the start marker, refusing on anything but one match. **Note:** during the run three `Gemini_Generated_Image_*.jpg` files (1024 px, `.jpg` not `.jpeg`) appeared in `~/Downloads` that this run did not download (`metewr…`, `1rvxat…`, `4pguk8…`, from another session); the script refused the ambiguous match once, the minotaur was then taken by its exact name, and those three files were **left untouched**. Nothing else in `~/Downloads` was moved. The tab was closed.

**Raws.** Per V5-049, gitignored, in `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/sd-69ad2c/docs/v5/gemini/AS-05/` as `ART-0NN_<stem>_1.jpeg`, plus `ref/` (the 1024 px references attached) and `ART-055_laurel_branch_1_flipped.jpeg` (below). **Processed** (`process.mjs`; plates kind painted: square cover, one area downscale to 288, opaque; chests and laurel kind cutout: key #FF00FF tol 60, fringe 3, trim, contain): `docs/v5/gemini/AS-05/processed/<file stem>.png`, 12 files, 1.8 MB, copies of the ignored `docs/v5/art/staging/`. **Contact sheet:** `docs/v5/art/AS-05-contact.jpg` (1180x470, 140 KB): row 1 each plate at 136, then 32 (the CDX-2 row thumbnail), 16 (today's thumbnail) and 48 on `stone2`; row 2 the three chests at 144x136 on parchment and on `stone1`, the laurel pair (shipped left branch + code mirror) at 80x108; row 3 the chests at the 48 UI opening size and the 16x13 ChestSlot, the laurel pair at 80x108 and at the 26x36 slot on `wine` (defeat) and on parchment.

**Family seeds.** Plates: there was no approved plate, so `plate_hydra` was made first from T-STYLE + T-PLATE with the AS-02 `bust_bear` (1024 px) attached, so the plates share the beast busts' umber ground, glow, light and brushwork. It was approved and its 1024 px copy attached to the other seven. Chests: `chest_closed` was made from T-STYLE + T-CUTOUT with the hydra seed attached for brushwork and palette only; `chest_open_empty` is an **edit** of `chest_closed`, and `chest_open_full` an **edit** of `chest_open_empty` (same geometry, so the two open states swap without a jump). Laurel: `chest_closed` attached as the cutout style reference.

**Hydra seed prompt (bust_bear attached):**

```
Create a NEW image, not an edit of the reference. The attached animal portrait is from the same mobile strategy game: match its painting style, palette, brushwork, warm umber background and lighting exactly, but this is a full creature plate, not a head-and-shoulders portrait. ROLE: a bestiary plate for a codex in a mobile game, in the manner of a painted tomb fresco or a vase painting: the monster alone, dramatic. STYLE: [T-STYLE, word for word]. SUBJECT: the Lernaean Hydra rising from a swamp: a heavy dark teal-green scaled body with a pale belly and a row of short spines along the back, four short splayed clawed legs half in the water, and exactly FIVE serpent heads on long curving necks rising from the front of the body, fanning out; each head wedge-shaped with a small bony frill, yellow eyes and bared fangs; a coiling tail behind. COMPOSITION: the whole creature centred and filling about 80 percent of the square frame, all five heads fully inside the frame with space above them; one simple ground cue: dark swamp water with a few reeds; a strong silhouette against the background. BACKGROUND: dark warm umber to deep red-brown, a warm key light from the upper left on the creature, chiaroscuro. EXCLUDE: any text, letters, numbers, runes, signatures, watermarks, logos, UI, borders or frames around the image, people, modern objects, extra legs, more or fewer than five heads, heads cut by the frame, blood. ASPECT: square 1:1, highest resolution available.
```

**Plate family prompt (hydra seed attached): F + SUBJECT + COMPOSITION + G.**

```
F: Create a NEW image, not an edit of the reference. Match the attached reference bestiary plate exactly in style, palette, brushwork, fine craquelure, dark warm umber to red-brown background, warm key light from the upper left, chiaroscuro and full-bleed framing (no border); change only the creature and its ground cue. It is one of a matching set of bestiary plates for a codex in a mobile strategy game set in the ancient Mediterranean: the monster alone, dramatic, in the manner of a painted tomb fresco. STYLE: ancient Mediterranean fresco painting on lime plaster: earth pigments, visible confident brushwork, soft painted edges, warm and slightly desaturated, no pure black and no pure white; clear value contrast so it reads at small phone size. Hand-painted illustration, not a photo, not a 3D render.
COMPOSITION: the whole creature centred and filling about 80 percent of the square frame, {the parts that must stay} fully inside the frame; one simple ground cue: {GROUND}; a strong silhouette against the background.
G: EXCLUDE: any text, letters, numbers, runes, signatures, watermarks, logos, UI, borders or frames, people, modern objects, extra limbs, extra heads, duplicated creatures, parts cut by the frame, blood{, extras}. ASPECT: square 1:1, highest resolution available.
```

**Cutout prompts.** `chest_closed`: "Create a NEW image … Use the attached painting ONLY as the style reference for the brushwork, the warm earth palette and the light from the upper left; do NOT copy its dark background or its creature" + T-STYLE (without background) + T-CUTOUT with the SUBJECT below, "three-quarter front view from slightly above", BACKGROUND "perfectly flat solid #FF00FF … no shadow, no cast shadow, no gradient, no glow, no vignette, no texture and no floor; no magenta or pink anywhere inside the chest"; EXCLUDE adds coins, other objects, a table or ground. The open chests: "Edit the attached chest image. Change only: {what}. Keep everything else identical: the same chest, the same oak planks, bronze bands, rivets and lion-head lock plate with its ring, the same three-quarter view, the same size and position in the frame, the same colours, painted style and light from the upper left" + the same BACKGROUND. Laurel: T-CUTOUT, portrait 3:4, "it must read at 26 by 36 pixels", EXCLUDE ribbons, berries, a full wreath, a second branch.

| # | Raw | ART | SUBJECT as sent (short; source in code) | Verdict | Notes (checked on the 2048 raw and at 288 / 32 / 16) |
| --- | --- | --- | --- | --- | --- |
| 1 | `ART-036_plate_hydra_1.jpeg` | 036 | seed prompt above (beastArt: teal scale, pale belly, back spines, 4 splayed legs, 5 neck stumps; hint "Five heads strike on long necks") | **Accepted (plate seed)** | Exactly five frilled heads, four legs, coiling tail, swamp and reeds. Top head ~6% below the edge. Craquelure visible. No text. |
| 2 | `ART-037_plate_cyclops_1.jpeg` | 037 | a one-eyed Cyclops lifting a huge grey boulder overhead with both hands: tan skin, ONE eye under a heavy brow, wild dark hair, short dark beard, a small stubby horn, a shaggy fur pelt over one shoulder, leather belt, fur loincloth; a knotted wooden club at his feet (beastArt `giant` cyclops: giantSkin, horn stub, pelt, club; hint "hurls boulders", "his club") | **Accepted** | One eye, horn stub, pelt, club on the ground, boulder ~4% below the top edge. Hands correct. A metal belt buckle, small, not modern-looking at 32. |
| 3 | `ART-038_plate_harpies_1.jpeg` | 038 | exactly three harpies diving, wings swept back, talons out: gaunt grey-skinned woman's heads and shoulders, chest in dark feathers, wild black hair, screaming mouths, glowing pale eyes; ragged dark grey-violet wings instead of arms; bird legs with long curved bronze talons; a jagged rocky crag below (beastArt `harpy`: harpySkin, feather, wild black hair, screaming mouth; hint "dive on archers") | **Accepted** | Three harpies, two wings and two bird legs each, no human arms, no nudity, bronze talons. The top-left wingtip comes within ~2% of the top edge but is not cut. They dive toward the lower left. Three, not the game's flock of six: three read at 32 px, six would not. |
| 4 | `ART-039_plate_nemean_lion_1.jpeg` | 039 | the Nemean Lion crouched to pounce, facing left: glinting golden metallic hide, massive dark ochre-brown mane, golden eyes, fangs, claws out, dark tail tuft; two snapped arrows on the rocks, bounced off its hide (beastArt `cat` lion: lion coat, mane, gold highlights; hint "Arrows … glance off its hide", "pounces") | **Accepted** | Four legs, one tail; the broken arrows carry the "missiles glance off" hint. Reads at 16 px as a gold lion. |
| 5 | `ART-040_plate_minotaur_1.jpeg` | 040 | the Minotaur charging left, head lowered, horns first: dark brown bull hide, shaggy hump, bronze nose ring, wide ivory horns; plain leather kilt, bronze bracers; a double-headed bronze labrys on a long haft (beastArt `giant` bull: bull hide, ivory horns, nose ring, bronze bracers, labrys; hint "Charges straight through lines") | **Accepted** | Two arms, two legs (hooves), five-fingered hands (checked zoomed), one head, a bull's tail. The bracer's engraving is an abstract scroll, no letters. |
| 6 | `ART-041_plate_chimera_1.jpeg` | 041 | the Chimera facing left breathing a cone of orange fire: tawny lion body, dark mane, scorched streaks on the flanks; a grey-brown goat head with curved ivory horns rising from the back; a green scaled serpent tail arcing over with the snake head at the tip; exactly three heads, four legs, no wings (beastArt `cat` chimera: goat, serpent tail, scorched streaks; hints fire cone, goat bleat, serpent tail) | **Accepted** | Exactly three heads in the right places, four legs, no wings. The fire runs out of the left edge (a cone, not a body part); the creature is whole. |
| 7 | `ART-042_plate_kraken_1.jpeg` | 042 | the Kraken rising from a stormy sea at the edge of a sandy beach: dark wine-red and maroon, a tapering dome mantle out of white surf, two pale yellow eyes, a hooked dark beak; exactly six sucker-lined tentacles, two slamming onto the sand; wet sand foreground (beastArt `krakenBody`: kraken maroon, mantle dome, eyes, beak, surf; hint "Rooted at the shore: six arms") | **Accepted** | Six tentacles, all tips inside. The sky came out warm umber rather than stormy, which keeps it in the plate family. Squid-like mantle matches the code's tapering dome. |
| 8 | `ART-043_plate_titan_1.jpeg` | 043 | a Titan hurling two boulders, one raised in each hand: a massive body of grey weathered stone with glowing orange molten cracks, bronze shoulder plates and a wide bronze belt, glowing eyes, a crown of bronze spikes, a stern bearded stone face (beastArt `giant` titan: stone + ember cracks, bronze pauldrons and belt, glowing eyes, spiked bronze crown; hint "Hurls two boulders at once") | **Accepted** | Two boulders, two arms, two legs, five-fingered hands. The plain rectangular belt plate is a little modern in shape (a broad bronze buckle); at 32 px it reads as a bronze belt. A regeneration candidate if the art-director objects. |
| 9 | `ART-052_chest_closed_1.jpeg` | 052 | a closed treasure chest of dark warm oak planks, slightly domed lid, three broad bronze bands, bronze corner plates with rivets, a bronze lion-head lock plate with a ring in its mouth; lid shut | **Accepted (cutout seed)** | Flat magenta, no shadow, no magenta in the chest; key residue 0. No text. |
| 10 | `ART-053_chest_open_empty_1.jpeg` | 053 | EDIT of #9: lid open, swung back and standing behind; empty inside, bare dark floor and walls in shadow | **Accepted** | Same chest, bands, rivets and lion lock. The open lid makes the trimmed box taller, so after `contain` the chest body is drawn somewhat smaller than the closed one in the same 288x272 frame (see the sheet). |
| 11 | `ART-054_chest_open_full_1.jpeg` | 054 | EDIT of #10: heaped above the rim with plain blank gold coins, a few spilling over the front edge; no coins on the background | **Accepted** | Geometry identical to #10, so empty and full swap cleanly. Blank coins, one small painted glint, no text. |
| 12 | `ART-055_laurel_branch_1.jpeg` | 055 | a single gilded laurel branch: stem from the bottom, bowing out to the LEFT, tip curling to the upper right (the left half of a victor's wreath); 9 to 11 pairs of pointed gilded leaves; portrait 3:4 | **Accepted, mirrored** | Gemini drew it bowing to the RIGHT. Since the manifest wants the **left** branch (the right is mirrored in code), the raw was flipped horizontally with `sips -f horizontal` into `ART-055_laurel_branch_1_flipped.jpeg` and that was processed. Leaves alternate more than they pair; painted, not pixel (RES-2). On the sheet the shipped branch + its code mirror form a wreath. |

**Totals:** 12 renders, 12 accepted on the first try, 0 regenerated. No render had text, letters, extra limbs, extra heads or modern objects beyond the two belt-buckle notes.

**Pipeline.** `process.mjs` ×12 (key residue 0 on all), `check.mjs` 12 PASS (exact size, painted opaque / cutout with alpha and no magenta, name). `preview.mjs ART-036` and `preview.mjs ART-055` gave **NOT ASSESSED** (manifest `preview: null`: no game slot loads `plate_*`, `chest_*` or `laurel_branch` yet, ASSET_LIST "not wired"), and `promote.mjs ART-036 --looked` / `ART-055 --looked` were **REFUSED** (no preview record). **Nothing promoted**; `public/` is untouched. All 12 are staged in `processed/` with status NOT ASSESSED.

**For CDX-01, RES-01 and the duel/chest story.**
- CodexScene and BeastTrialScene need `RASTERS` keys for the plates (lazy per scene, OI-4) and manifest `preview` entries; then run `preview.mjs` and `promote.mjs` on the files in `processed/` (copy them back to `docs/v5/art/staging/`; the sha must match). The plates read at 32 px (CDX-2); at 16 px they read as colour blobs, so CDX-2's 32 px thumbnail is needed.
- ChestSlot / DuelScene and ResultsScene (spoils, laurels) need the same. The laurel ships as the left branch; mirror it in code for the right (`setFlipX`). The closed chest is drawn larger than the open ones in the same frame; if the ChestSlot swaps states in place, anchor all three at the bottom and accept the size change, or scale the closed one to the open body width in code.
- Harpies: the plate shows three (readable); the game's flock is six.

### AS-04 Frescoes, settlement vignettes and the splash key art (2026-10-11)

**Scope.** The story row: the 5 frescoes (ART-001 to ART-005), the 6 settlement vignettes (ART-006 to ART-011) and the splash key art (ART-056). No new manifest rows. All subjects are scenes from ASSET_LIST; none shows UI or a feature the game lacks.

**Tool.** gemini.google.com, "Pro" mode, one new chat in a new tab, prompts typed as "Create an image…" / "Create a NEW image…" with no tool picker and no aspect picker. Every wide output is 3168x1344 JPEG (2.36:1); the splash is 1408x3040 (0.46:1). All are above their tiers, so nothing was upscaled; `fresco_campaign` is now 1080x480 from a 3168 px source (the old 1060x420 `banner_campaign.jpg` was below the tier). References were attached through the page's hidden image input (`file_upload`). No CAPTCHA, quota message or download block. Each download was moved by a script that takes only a `Gemini_Generated_Image_*` absent from a start listing and newer than the start time, refusing on anything but one match; at the end `~/Downloads` held no file that was not in the start listing. The tab was closed.

**Raws.** Per V5-049, gitignored, in `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/sd-69ad2c/docs/v5/gemini/AS-04/` as `ART-0NN_<stem>_<n>.jpeg`. **Processed** (`process.mjs`, kind painted: cover at the anchor, one area downscale, opaque): `docs/v5/gemini/AS-04/processed/<file stem>.png`, 12 files, 11 MB, copies of the ignored `docs/v5/art/staging/`. **Contact sheet:** `docs/v5/art/AS-04-contact.jpg` (1136x840, 141 KB): the campaign fresco at 2.25:1 and at the 3.4:1 the slot crops to on narrow phones; war, ladder, arena and shop; each vignette full and at the 5.6:1 short-screen strip (centred, as `coverTexture` crops); the splash with the 320x568-of-390x844 safe area outlined.

**Family seeds.** Frescoes: `fresco_campaign` was made first from T-STYLE + T-FRESCO with the approved `bust_hoplite` (AS-02 seed, 1024 px) attached, so the frescoes share the busts' light and palette. Its accepted render #2 (1584 px JPEG) was then attached to every other fresco and to the splash. Vignettes: `vignette_town_greek` (from the fresco seed) was approved and attached to the other five.

**Seed prompt, #1 (bust_hoplite attached; T-STYLE + T-FRESCO, composition tightened to the 3.4:1 band):**

```
Create a NEW image, not an edit of the reference. The attached portrait is from the same mobile strategy game: match its painting style, palette, brushwork and lighting exactly, but this is a wide landscape scene, not a portrait. ROLE: a wide banner illustration for a mobile game menu, shown inside a bronze frame. STYLE: ancient Mediterranean fresco painting on lime plaster: earth pigments (yellow ochre, red ochre, burnt umber, terre verte, a little Egyptian blue), visible confident brushwork, subtle fine craquelure, soft painted edges, warm and slightly desaturated, no pure black and no pure white. Light from the upper left, shadows to the lower right. Clear value contrast on the subject so it reads at small phone size. Hand-painted illustration, not a photo, not a 3D render, not glossy digital art, not anime, not comic ink. SUBJECT: a column of Greek hoplites marching along a sandy beach at dawn, seen from the side, bronze Corinthian helmets with red crests, red cloaks, round bronze shields, spears upright; two or three warships with oars drawn up on the beach behind them; low green hills in the distance; the early sun low on the left over a calm sea. COMPOSITION: a horizontal frieze in registers like a Greek wall painting: the march runs along one band across the centre of the image; keep every head, crest, shield and spear tip inside the central horizontal band (from 30 to 70 percent of the height), so the image survives a crop to a strip 3.4 times wider than tall; calm pale dawn sky at the top and plain sand at the bottom; 5 to 7 figures, all fully inside the frame, none cut by the left or right edge. PALETTE ANCHORS: warm plaster cream #e7d6ad, ochre, terracotta #a8432c, bronze #b08a3a, sea teal-blue. EXCLUDE: any text, letters, numbers, runes, signatures, watermarks, logos, UI, borders or frames around the image, modern objects, extra limbs, duplicated figures, cropped heads, blood. ASPECT: very wide landscape, 21:9 or the widest available, highest resolution available.
```

**Fresco family prompt (seed #2 attached): F + SUBJECT + LIGHT + COMPOSITION + G.**

```
F: Create a NEW image, not an edit of the reference. Match the attached reference banner exactly in style, palette, brushwork, fine craquelure and full-bleed framing (no border); change only the subject, the light and the composition as stated. It is one of a matching set of wide banner paintings for a mobile strategy game set in the ancient Mediterranean, 4th century BC. STYLE: ancient Mediterranean fresco painting on lime plaster: earth pigments (yellow ochre, red ochre, burnt umber, terre verte, a little Egyptian blue), visible confident brushwork, subtle fine craquelure, soft painted edges, warm and slightly desaturated, no pure black and no pure white; clear value contrast on the subject so it reads at small phone size. Hand-painted illustration, not a photo, not a 3D render, not glossy digital art.
G: EXCLUDE: any text, letters, numbers, runes, symbols on shields, signatures, watermarks, logos, UI, borders or frames around the image, modern objects, extra limbs, duplicated figures, cropped heads, blood. ASPECT: very wide landscape, 21:9 or the widest available, highest resolution available.
```

COMPOSITION for the strips (ladder, arena 6:1; shop 7.8:1): "this banner will be cropped to a very thin strip six [almost eight] times wider than tall … every [figure, torch, the goods, the merchant's head] between 35 and 65 percent of the image height; plain sky above and plain ground below; nothing important at the far left or right edges".

**Vignette family prompt (vignette_town_greek attached):** "Create a NEW image, not an edit of the reference. Match the attached reference settlement view exactly in style, palette, brushwork, fine craquelure, full-bleed framing (no border), viewpoint, distance, warm afternoon light from the upper left and the same horizontal bands (sky in the top quarter, the settlement across the middle third, ground and path in the lower quarter); change only the settlement as stated. … SUBJECT: {below}; seen from a low hill at a slight distance, no people in the foreground; 3 to 5 readable landmarks. The village centred, nothing important at the left and right edges. EXCLUDE: any text, letters, numbers, runes, inscriptions, signs, signatures, watermarks, logos, UI, borders or frames around the image, modern objects, {culture extras}, people in the foreground. ASPECT: landscape 21:9 or the widest available, highest resolution available." `vignette_town_greek` itself was T-STYLE + T-VIGNETTE with the fresco seed attached. Villages add "NOT a walled town … no fortifications, no towers, no gate" so a village never reads as a town.

| # | Raw | ART | SUBJECT / LIGHT as sent (short) | Verdict | Notes (crop = `process.mjs` anchor; checked at shipped size and at the slot's narrowest crop) |
| --- | --- | --- | --- | --- | --- |
| 1 | `ART-001_fresco_campaign_1.jpeg` | 001 | seed prompt above | **Rejected** | A carved wooden **frame painted round the picture**; a **lambda (Λ) on every shield** (a letter); the column runs off the right edge. |
| 2 | `ART-001_fresco_campaign_2.jpeg` | 001 | "same subject … fixing four problems": no frame, full-bleed; column of 6 centred; plain bronze shields, NO lambda; heads to spear tips between 30 and 70% | **Accepted as family seed**, not shipped | Fixed all three, but the group sits right of centre and the 6th man touches the right edge; in the game at 360 and 320 the 3.4:1 crop cut him. |
| 3 | `ART-001_fresco_campaign_3.jpeg` | 001 | EDIT of #2: "make the six hoplites about 25 percent smaller, move the whole column to the horizontal centre … more sky above … keep everything else identical" | **Accepted, PROMOTED** | Gemini dropped one man instead of shrinking (5 hoplites, within 3–7) and left sand on the right. `--ax 0.6`. In the menu slot: all 5 whole at 390; at 360 and 320 (3.4:1) heads, faces, shields and the ships inside, only the crest tips touch the frame. No text. |
| 4 | `ART-002_fresco_ladder_1.jpeg` | 002 | a broad stepped stone tower of five terraces like a low ziggurat, a torch on each terrace, four or five small Greek warriors climbing the central stair; torchlit dusk, violet-blue sky, orange torch pools | **Accepted** | At 6.1:1 the strip keeps terraces 2–4, four climbers and six torches; the top terrace is cut, the stair still reads as an ascent. Smoother stone than the seed (slightly more digital), craquelure and palette match. |
| 5 | `ART-003_fresco_arena_1.jpeg` | 003 | stone arena, crowd on the tiers, pennants; a Greek hoplite (red crest, red cloak, bronze shield) and a Celtic swordsman (iron helmet, checked green cloak, oval shield, long sword) face each other; torchlit dusk | **Accepted** | `--ay 0.44` keeps the hoplite's crest inside the 6.1:1 strip. Plain shields, plain pennants, no letters. The hoplite holds no spear (shield only): fine for "champions facing". |
| 6 | `ART-004_fresco_shop_1.jpeg` | 004 | agora stall under a long cream and terracotta striped awning; amphorae, bronze helmets, shields, spearheads, bowls; one bearded merchant; stoa columns; warm afternoon | **Accepted** | One shield on the ground carries a **lambda**, at 71–88% of the height: it lies **outside** the shipped 7.8:1 crop (`--ay 0.56`, rows 39–69%), checked on the staged file. The crop keeps the awning edge, the merchant's head, the helmets and the amphorae. |
| 7 | `ART-005_fresco_war_1.jpeg` | 005 | a walled Greek hill town with a temple in the centre; two rival camps on the plain, red banners left, dark blue banners right, plain cloth; grey smoke of camp fires; overcast, smoky, cooler light | **Accepted** | Plain banners, no emblems, no fighting. Edge tents are cut by the frame (background only). |
| 8 | `ART-006_vignette_town_greek_1.jpeg` | 006 | walled Hellenic town: whitewashed walls, gate, square towers, terracotta roofs, small Doric temple on the top, olives (fresco seed attached) | **Accepted (vignette seed)** | Two tiny figures at the gate, mid-ground (not foreground). The crenellations look a little medieval. At the 5.6:1 short-screen strip the wall, gate and roofs survive and the temple is cut (the template only promises the wall/roof line). |
| 9 | `ART-007_vignette_town_phoenician_1.jpeg` | 007 | walled Punic harbour town: ochre mudbrick walls and towers, flat-roofed ochre and white houses, date palms, round harbour with two ships under purple awnings; EXCLUDE adds domes, minarets | **Accepted** | Purple awnings and palms read in the strip. Same layout as #8 (the family). |
| 10 | `ART-008_vignette_town_celtic_1.jpeg` | 008 | Galatian hill town: palisade of sharpened logs with a wooden gate tower, round houses with conical thatch, roof smoke, oak woods; EXCLUDE adds stone castles | **Accepted** | |
| 11 | `ART-009_vignette_village_greek_1.jpeg` | 009 | small Hellenic farming village, NOT walled: about eight whitewashed farmhouses with terracotta roofs and courtyards, a tiny four-column Doric shrine, olives, a threshing floor, grain fields, dry-stone field walls | **Accepted** | Clearly a village, not the town. |
| 12 | `ART-010_vignette_village_phoenician_1.jpeg` | 010 | small Punic farming and fishing village, NOT walled: about seven flat-roofed ochre mudbrick houses on the shore, palms, irrigated gardens, a cove with two small boats under purple awnings | **Accepted** | |
| 13 | `ART-011_vignette_village_celtic_1.jpeg` | 011 | small Galatian village in a forest clearing, NOT a hill fort: five or six round thatched houses, smoke from one roof, a wattle cattle pen, a small grain field, a short partial stake fence, big oaks | **Accepted** | Two cattle in the pen. No towers. |
| 14 | `ART-056_splash_keyart_1.jpeg` | 056 | T-SPLASH via the fresco family prompt: a front rank of about seven hoplites with locked plain bronze shields and levelled spears, more ranks behind, beach at dawn, seen from low; beached warships; a white Doric temple on a headland; top third empty sky; key figures in the central 60% of the width; NO lambda | **Accepted** | Plain shields, no text, sky top third empty for the code-set logo. The phalanx runs off the right edge (the army continuing): the front-right hoplite is partly outside the 320x568 safe area, the front rank's other heads are inside. The image is 0.46:1, so a 390x844 phone shows all of it; only phones wider than 9:19.5 crop top and bottom. |

**Totals:** 14 renders, 12 accepted (one per asset), 2 regenerated for `fresco_campaign` (#1 rejected: painted frame and lambda lettering; #2 kept as the family seed, replaced in the slot by the edit #3). No extra limbs, modern objects, UI or invented features in any render.

**Pipeline.** `process.mjs` ×12, `check.mjs` 12 PASS (exact size, opaque, name). `preview.mjs` with a dev server on port 5347:
- **ART-001** on `menu`: layout check passed at 390x844, 360x780 and 320x640 (320x640: 5 known violations, 0 new). Sheet `docs/v5/art/staging/preview/ART-001/menu-sheet.png` (ignored) read at DPR 3: the slot is filled, sharp, the five hoplites and ships inside the frame at 390; at 360 and 320 the 3.4:1 crop keeps heads, faces and shields, crest tips touch the frame; no clash with the plaque, the CTA or the text; matches the hoplite portrait beside it (light from the left, same bronze and red). `promote.mjs ART-001 --looked` **shipped `public/ui/fresco_campaign.jpg`** (q82, 128 KB, `check --shipped` PASS, budget 160 KB).
- **ART-002 to ART-011 and ART-056: NOT ASSESSED** (exit 3, manifest `preview: null`, no slot loads them yet). Not promoted; staged in `processed/`.

**For HUB-02 and the wiring stories.**
- The game still loads `ui/banner_campaign.jpg` (`RASTERS.ui_banner_campaign`, MenuScene). The preview swapped the staged file into that request, so the check is real, but the shipped `fresco_campaign.jpg` is not loaded until HUB-02 points the key at it (and retires `banner_campaign.jpg`, a manifest `legacy` file).
- DuelScene (ladder, arena), ShopScene (shop), FirstRunScene (war card, splash), BootScene (splash) and SettlementScene (vignettes, by `kind` + `culture`) need their `RASTERS` keys and manifest `preview` entries; then `preview.mjs` and `promote.mjs` run on the files in `processed/` (copy them back to `docs/v5/art/staging/`; the sha must match the preview).
- Greek vignettes lose the temple on short screens (30 UI px tall); the wall, gate and roofs carry the culture there.

### AS-03 Icons: the 8 atlas icons (with the Codex book) and 15 v5 icons (2026-10-10)

**Scope.** The story row: the 8 `icons_ui` rows of ASSET_LIST (ART-044 to ART-051; ART-044 is the Codex book) and the v5 icons for features that have a GDD and a story: 5 doctrines (ai-doctrines.md R2, AI-01), 7 signature actives (abilities.md R3, AB-02), the Standard (abilities.md R5, AB-03), Works (field-works.md, FW-03) and the band captain's crest (ai-doctrines.md R6, AI-02). The 15 new rows are ART-057 to ART-071 in `asset-manifest.json` (ASSET_LIST regenerated by `list.mjs`, 71 assets). Frame keys: `ui:doctrine_<id>`, `ui:<ability id>` (push, bond, warcry, sunder, aimed, recharge, scythe), `ui:standard`, `ui:works`, `ui:captain`. Every subject was checked against the 109 frames already in `public/icons/ui.png` so none repeats an existing glyph (one meaning per icon, bible §7.4): the bull head (`power:momentum`), Gorgon (`power:terror`), roaring red face (`ui:berserk`), horn and trumpet (`ui:horn`, `ui:rally`), stake fence (`camp:palisade`) and sun disc (`power:retribution`) were avoided.

**Not in scope (follow-up, OI-3 / D-10).** The 101 legacy 64 px icons in `icons_ui` and the 189 in `icons_items` stay as they are. ANSWERS D-10 schedules their 160 px regeneration as a later batch; AS-03 does only the rows above.

**Tool.** gemini.google.com, "Pro" mode, one new chat in a new tab, prompts typed as "Create an image…" with no tool picker. To keep one family and spend fewer downloads, each prompt asked for a **2x2 grid of four icons** on flat #FF00FF; a scratch script (`tools.mjs split`, using `scripts/art/lib`) cut each grid into exact quadrants and checked that no opaque pixel touches a quadrant edge (0 on all 24 quadrants). Grid 1 is 1024x1024 (512 px quadrants), grids 2 to 6 are 2048x2048 (1024 px quadrants): all above the 160 px tier, so no upscale. No CAPTCHA, quota message or download block. Each download was moved by a script that takes only a `Gemini_Generated_Image_*` absent from a start listing and newer than the start time, refusing on anything but one match; `~/Downloads` matched its start listing at the end. The tab was closed.

**Raws.** Per V5-049, gitignored, in `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/sd-69ad2c/docs/v5/gemini/AS-03/`: the six grids `gridN_<subjects>_1.jpeg` and the quadrants `ART-0NN_icon_<stem>_<n>.png`. **Processed** (`process.mjs`, kind icon: key #FF00FF tol 60, fringe 3, trim, contain at 0.88 of 160x160, centred): `docs/v5/gemini/AS-03/processed/icon_*.png`, 23 files, 804 KB, copies of the ignored `docs/v5/art/staging/`. **Contact sheet:** `docs/v5/art/AS-03-contact.jpg` (1140x528, 124 KB): each icon at 96 on parchment, 32 and 24 on parchment, 24 on `stone2`, 24 in greyscale.

**Seed.** Grid 1 (helmet, chest, tent, arena) was made from T-ICON with `public/icons/ui.png` (2x, JPEG) attached as the style reference, as Templates says. It was approved, and the grid-1 JPEG was attached to every later prompt.

**Prompt, grid 1 (T-ICON adapted to a grid):**

```
Create an image. The attached sheet is the existing icon set of my mobile strategy game; the new icons must match it exactly in style. ROLE: four game icons for a mobile strategy game menu, one of a set; each must read at 24 pixels. LAYOUT: a 2x2 grid of four separate icons, one centred in each quarter of the square image, each filling about 80 percent of its quarter, with a wide empty gap between them; no icon touches or overlaps another or the image edge. SUBJECTS (each a single object): top-left: {TL}; top-right: {TR}; bottom-left: {BL}; bottom-right: {BR}. STYLE: a painted icon with a heavy dark-brown outline (#2a1a12) of even weight around the whole silhouette, three-quarter view, light from the upper left, warm materials (bronze #b08a3a, wood, cloth, stone), soft painted shading, slightly chunky proportions. BACKGROUND: a perfectly flat solid #FF00FF magenta background, edge to edge, with no shadow, no gradient, no glow and no ground plane; no magenta anywhere inside the objects. EXCLUDE: text, letters, numbers, a frame, a badge or a circle behind an object, grid lines, more than one object per quarter. ASPECT: square 1:1, highest resolution available.
```

**Family prompt, grids 2 to 6 (seed attached):**

```
Create a NEW image, not an edit of the reference. Match the attached reference exactly in style: the same heavy dark-brown outline (#2a1a12) of even weight, the same soft painted shading, light from the upper left, slightly chunky proportions, three-quarter view, warm materials (bronze #b08a3a, wood, cloth, stone), the same perfectly flat solid #FF00FF magenta background edge to edge, and the same 2x2 layout: one icon centred in each quarter, each filling about 80 percent of its quarter, wide empty gaps, nothing touching another icon or the image edge. ROLE: four more game icons for the same set{ROLE EXTRA}; each must read at 24 pixels. SUBJECTS (each a single object): top-left: {TL}; top-right: {TR}; bottom-left: {BL}; bottom-right: {BR}. EXCLUDE: text, letters, numbers, a frame, a badge, a disc or a circle behind an object, grid lines, shadows or glow on the background, more than one object per quarter{, blood}{, modern tools}; no magenta inside the objects. ASPECT: square 1:1, highest resolution available.
```

ROLE EXTRA: grid 3 ", emblems of four enemy battle styles"; grid 5 "ability icons … (special moves of ancient soldiers)"; grid 6 "(ancient Mediterranean, 4th century BC)".

| # | Grid raw | Quadrant | ART | SUBJECT as sent | Verdict | Notes (seen at 160, 32 and 24 px) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `grid1_helmet_chest_tent_arena_1.jpeg` | TL | 049 `ui:helmet` | a bronze Corinthian helmet with a tall red horsehair crest | **Accepted (seed)** | Crest and cheek guards read at 24. |
| 2 | grid 1 | TR | 050 `ui:chest` | a closed wooden chest with bronze bands | **Accepted** | |
| 3 | grid 1 | BL | 051 `ui:tent` | a canvas army tent with a small pennant on its pole | **Accepted** | |
| 4 | grid 1 | BR | 048 `ui:arena` | a round stone arena seen from outside, tiers of arches, two small pennants on top | **Accepted** | Two rows of arches clear at 24. |
| 5 | `grid2_book_banner_war_season_1.jpeg` | TL | 044 `ui:book` | a closed thick leather-bound book (a codex), dark red-brown leather cover, bronze corner caps and a bronze clasp | **Accepted** | A book, not a paw (MENU-3). |
| 6 | grid 2 | TR | 045 `ui:banner` | a red cloth war banner hanging from a short crossbar on a wooden pole, a round bronze disc on top of the pole | **Accepted** | Distinct from `ui:flag` (a flag on a staff) by the crossbar and disc. |
| 7 | grid 2 | BL | 046 `ui:war` | two crossed spears behind a crested Corinthian helmet, all in one engraved bronze relief, monochrome bronze, no red | **Accepted** | All bronze, so it stays apart from the red-crested `ui:helmet` (MENU-2). |
| 8 | grid 2 | BR | 047 `ui:season` | an hourglass with a bronze frame and golden sand, wreathed by a green laurel wreath | **Accepted** | The wreath tells it from the plain `ui:hourglass`. |
| 9 | `grid3_steady_rush_hammer_swarm_1.jpeg` | TL | 057 `ui:doctrine_steady` | a tortoise with a high domed shell plated like bronze scales, walking steadily, head forward | **Accepted** | Slow, holds: the testudo image. |
| 10 | grid 3 | TR | 058 `ui:doctrine_rush` | a ram's head with heavy curled horns, lowered as if to butt | **Accepted** | Not the bull of `power:momentum`. |
| 11 | grid 3 | BL | 059 `ui:doctrine_hammer` | a heavy war hammer with a long wooden haft, a leather-wrapped grip and a blunt bronze head with a spike on the back, shown diagonally | **Accepted** | The thinnest silhouette of the set (103 opaque px at 24); still a hammer at 24 on parchment. |
| 12 | grid 3 | BR | 060 `ui:doctrine_swarm` | a single large striped hornet in amber and dark brown with spread translucent wings and a visible sting | **Accepted** | Translucent wings keyed clean (residue 0, no pink cast). |
| 13 | `grid4_fury_standard_works_captain_1.jpeg` | TL | 061 `ui:doctrine_fury` | a roaring lion's head, mouth wide open with fangs, a wild mane of flame-like red and gold locks | **Accepted** | |
| 14 | grid 4 | TR | 069 `ui:standard` | an ancient army standard: a vertical wooden pole with a short bronze crossbar near the top, topped by a large bronze sixteen-ray sunburst disc, two short purple ribbons, NO cloth flag | **Accepted** | No cloth, so it does not repeat the Campaign banner. Purple ribbons survived the key. |
| 15 | grid 4 | BL | 070 `ui:works` | an iron-shod wooden digging spade crossed in an X with a sharpened wooden stake | **Rejected** | The spade has a modern D-grip and steel shaft (bible: no modern objects). |
| 16 | grid 4 | BR | 071 `ui:captain` | a tall curved transverse horsehair helmet crest, bright red, on its curved bronze crest holder, the crest alone with NO helmet | **Accepted** | Reads as a red crest hook at 24; no helmet, so not `ui:helmet`. |
| 17 | `grid5_push_bond_warcry_sunder_1.jpeg` | TL | 062 `ui:push` | the iron heads of two long pikes held level side by side, driving into the bronze rim of a round enemy shield that tilts backwards | **Accepted** | Three pikes instead of two, plus small dark impact strokes. The shield and level pikes read at 24 on parchment; the dark shafts fade on stone. |
| 18 | grid 5 | TR | 063 `ui:bond` | two muscular forearms in bronze bracers, hands firmly clasped at the wrist | **Accepted** | |
| 19 | grid 5 | BL | 064 `ui:warcry` | the head of a bearded Celtic warrior in side profile with pale limed spiky hair, mouth wide open shouting, three curved bronze sound strokes | **Accepted** | A profile with limed hair and sound arcs, unlike the red front face of `ui:berserk`. |
| 20 | grid 5 | BR | 065 `ui:sunder` | a long inward-curved iron falx blade with a wooden grip, splitting a round wooden shield that cracks in two | **Accepted** | The blade reads more like a curved sword than a falx; the split shield carries the meaning. A few splinters float free, inside the trim box. No blood. |
| 21 | `grid6_aimed_recharge_scythe_works_1.jpeg` | TL | 066 `ui:aimed` | a short recurved composite bow drawn taut, with three arrows nocked together on the string, pointing to the upper right | **Accepted** | The string is drawn loosely, not on the arrows' nocks; bow plus three arrows is clear at 24 on parchment. Thin on stone. |
| 22 | grid 6 | TR | 067 `ui:recharge` | the head and neck of a brown war horse with a bronze forehead plate, turning sharply, encircled by a thick curved bronze U-turn arrow | **Accepted** | |
| 23 | grid 6 | BL | 068 `ui:scythe` | a spoked wooden chariot wheel with a bronze rim and a long curved iron scythe blade sticking out from its hub | **Accepted** | |
| 24 | grid 6 | BR | 070 `ui:works` | a simple ancient wooden spade with a plain straight wooden handle (no D-grip, no metal handle) and a flat iron-edged blade, crossed in an X with a sharpened wooden stake | **Accepted** | T-grip wooden spade, historically fine. |

**Totals:** 6 renders (24 quadrants), 23 accepted, 1 rejected and regenerated (works: a modern D-grip spade). No text, letters, extra objects or reserved glyphs in any render.

**Pipeline.** `process.mjs` ×23, `check.mjs` 23 PASS (160x160, alpha, no magenta residue, not touching top/bottom, name). `atlas.mjs icons_ui`: 128 frames (4 replaced, 19 added), 2044x586, in `docs/v5/art/staging/atlas/` (ignored). `preview.mjs` with a dev server on port 5291:
- ART-049, ART-050, ART-051 on `menu`: layout clean at 390, 360 and 320; the sheet shows the new helmet, chest and tent sharp in the Army, Stash and Camp tiles (Camp greyed by its disabled state, as the chrome intends).
- ART-048 on `duel-ranked` and `duel-searching`: clean; the arena is sharp in the Arena tab, the Live PvP header and the search well.
- ART-044 to ART-047 and ART-057 to ART-071: **NOT ASSESSED** (exit 3, `preview: null`, no slot loads them yet).

`promote.mjs --atlas icons_ui --looked` was **REFUSED** ("ART-044 has no preview record"): an atlas ships whole, and 19 of its members have no wired slot. **Nothing was promoted; `public/` is untouched.** F-04 wires the frames (book, banner, war, season and the v5 keys), then previews and promotes the atlas from these exact staged files (`processed/` holds the copies).

**Legibility at 24 px (AC 1).** `contrast.mjs` checks palette pairs, not icons, so a scratch measure was run: the share of each icon's opaque pixels at 24 px that reach 3:1 against the background.
- On `parch`: 50–98% (lowest warcry 50%, bond 61%, tent 63%; most 80–98%). Every icon is readable there; checked by eye on the contact sheet.
- On `stone2`: 2–53%. The family's #2a1a12 outline is about 1.2:1 against #342d25, so the dark-outlined painted style (the same as the 101 legacy icons) does not separate from dark stone on its own. **Finding for F-04 / the UI stories:** where an icon sits on stone (top bar, tab bar, medallions), the chrome must give it a light ground (a parchment well, as the hub tiles and tabs already do, or a cream ring as badges have). Repainting the icons lighter would break the family.

**For the art-director / F-04.**
- Story text says processed icons go to `public/art/v5/**`, and F-04 AC 1 builds the atlas "from `public/art/v5/icons`". The pipeline (D-9) forbids anything in `public/` before a preview of a wired slot, so the 23 are in `docs/v5/gemini/AS-03/processed/` instead. F-04 should either read from there or move them into `public/art/v5/icons/` as part of wiring.
- `ui:doctrine_hammer` and `ui:aimed` are the thinnest shapes; if they read poorly in their real slots, regenerate them heavier.

### AS-02 Class busts, all 21 (2026-10-10, in two runs)

**Tool.** gemini.google.com, model "Gemini 3.1 Pro", in one chat. Each prompt was typed as "Create an image…" with no tool picker. Every output is a 2048x2048 JPEG.

**Raws.** Per V5-049 the raws are not in this branch. They are in `/Users/v.gladis/Workspace/Personal/pixelarrow/.claude/worktrees/sd-69ad2c/docs/v5/gemini/AS-02/`, which is gitignored and never deleted. They were briefly committed here, then removed with `git rm --cached`. **Processed** (`process.mjs`, kind painted, cover at anchor 0.5/0.25, area downscale to 288x288, opaque): `docs/v5/gemini/AS-02/processed/bust_<class>.png`, 21 files, 3.3 MB (12 from run 1, 9 from run 2 below). These are copies of `docs/v5/art/staging/`, which is ignored. **Contact sheet:** `docs/v5/art/AS-02-contact.jpg` (138 KB, all 21, regenerated in run 2). It shows each bust at 192, 40 and 21 px beside the game's own sprite from `preview.html`.

**Family seed.** Following the ASSET_LOG Templates, `bust_hoplite` was made first from T-STYLE + T-BUST. The prompt added "It shows a CLASS of soldier (a type), not a named hero" (V5-045) and "eyes looking toward the viewer's left". It was approved, and a 1024 px copy was then attached to **every** later prompt as the style reference.

**Family prompt (F + SUBJECT + G).** It is T-STYLE + T-BUST in condensed form, with the reference sentence from Templates added:

```
Create a NEW image, not an edit of the reference. Match the attached reference exactly in style, palette, brushwork, lighting, background and framing; change only the subject. It is one of a matching set of soldier-CLASS portraits for a mobile strategy game (a type of soldier, not a named hero). STYLE: ancient Mediterranean fresco painting on lime plaster: earth pigments (yellow ochre, red ochre, burnt umber, terre verte, a little Egyptian blue), visible confident brushwork, subtle fine craquelure, soft painted edges, warm and slightly desaturated, no pure black and no pure white. Light from the upper left, shadows to the lower right. Hand-painted illustration, not a photo, not a 3D render. EXCLUDE: any text, letters, numbers, runes, signatures, watermarks, logos, borders or frames, modern objects, extra limbs, duplicated figures, cropped heads. SUBJECT: {SUBJECT}. FRAMING (same as the reference): head and shoulders, front three-quarter view, turned slightly to the viewer's left, eyes on the upper third of the image, the top of the headgear or hair 6 to 10 percent below the top edge, shoulders cut by the bottom edge, the whole face and headgear inside the central circle; the headgear silhouette and the one listed prop are the clearest, most contrasting shapes. BACKGROUND: the same plain dark warm umber with a soft lighter glow behind the head, no scenery. EXPRESSION: composed, alert, mouth closed, eyes toward the viewer's left. ASPECT: square 1:1, highest resolution available.
```

**Subjects follow the game kit (`src/data/classes.ts`) where the art bible §5.2 or the manifest disagree** (story AC 1: "matches its class kit in the game sprite"). Each was checked against the class's sprite in `preview.html?s=6`. Deviations from the bible's table:
- **thureophoros:** the kit has pilos/montefortino, not Boeotian. Painted as a conical bronze pilos, which is also distinct from the Celt's Montefortino.
- **sacred_band:** the kit and sprite show a Corinthian helmet with a black crest, a blue cloak and a blue aspis with a gold club, not a Boeotian helmet.
- **royal_guard:** the kit is an Attic helmet and the sprite has a red crest. The bible's white plumes are kept as an extra.
- **thessalian:** the kit is a Boeotian helmet. The bible's petasos is kept: the brim reads the same and it stays distinct from the Companion.

These last three are queued, not made. The bible's "no two classes share a headgear silhouette" rule cannot fully hold for hoplite and sacred_band, which are both Corinthian in the kit. The plan is to tell them apart by crest colour and cloak (red and red, against black and blue). The art-director should decide whether §5.2 follows the kit.

| # | ART | Raw (v5 worktree) | SUBJECT | Verdict | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | 013 | `ART-013_bust_hoplite_1.jpg` | T-STYLE + T-BUST: a Spartan hoplite, bronze Corinthian helmet with a tall red transverse horsehair crest, red cloak, the bronze rim of a round aspis shield at the shoulder | **Accepted (seed)** | The crest is drawn front-to-back rather than transverse, but it reads red at 21 px. Its top is about 5% below the edge, so it is not cropped. No text or extra limbs. |
| 2 | 012 | `ART-012_bust_militia_1.jpg` | a Greek levy militiaman, a farmer-soldier: a brown felt cap (pilos), plain undyed ochre wool tunic, no armour, a short wooden spear with an iron head held upright at his shoulder | **Accepted** | |
| 3 | 014 | `ART-014_bust_thureophoros_1.jpg` | a Hellenistic thureophoros: plain conical bronze pilos helmet with no crest, dark hair, blue-grey linen tunic, the upper edge of a tall OVAL thureos shield, cream with a red pattern and a vertical spine | **Accepted** | Matches the sprite: blue tunic, cream shield with red pattern. |
| 4 | 015 | `ART-015_bust_celt_sword_1.jpg` | a Celtic swordsman: iron Montefortino helmet with a top knob and cheek guards, long drooping moustache, bronze torc, green checked cloak over mail, hilt and upper blade of a long sword | **Accepted** | The helmet has a small nasal, which is not historical. The checked cloak matches the sprite's `checkGreen`. |
| 5 | 016 | `ART-016_bust_rhomphaia_1.jpg` | a Thracian rhomphaia warrior: tall bronze Phrygian-style helmet curving forward, cheek guards, brown fox-fur cloak, ochre tunic, the long curved blade of a two-handed rhomphaia over the shoulder; no shield | **Accepted** | |
| 6 | 017 | `ART-017_bust_archer_1.jpg` | a Cretan archer: bare head, short dark curly hair, cream linen tunic, leather quiver strap, fletchings and the bow tip above the shoulder | **Accepted** | |
| 7 | 018 | `ART-018_bust_slinger_1.jpg` | a Rhodian slinger: bare head, short straight brown hair, short beard, white tunic, pouch of stones on a strap, a braided sling wound round his raised wrist | **Accepted** | One raised hand, anatomically correct. |
| 8 | 019 | `ART-019_bust_javelineer_1.jpg` | a Thracian javelineer: grey wolfskin cap (alopekis) with the animal's ears, light green tunic, exactly two javelins over the shoulder | **Accepted** | The kit's `wolfskin_cap`. The full wolf head is a strong silhouette, and the human face keeps it apart from `bust_wolf`. |
| 9 | 020 | `ART-020_bust_horse_archer_1.jpg` | a Scythian horse archer: tall pointed felt hood with ear flaps tied under the chin, red embroidered kaftan, gorytos bow case with a short recurved bow | **Accepted** | Red matches the sprite tunic. |
| 10 | 021 | `ART-021_bust_peltast_1.jpg` | a Thracian peltast: open-faced bronze Thracian helmet, forward-curving crown, short peak, cheek guards, brown cloak, crescent wicker pelte | **Rejected** | Its helmet silhouette is the same tall forward-curled crown as the rhomphaia (#5), which breaks bible §3 "no two classes share a headgear silhouette". |
| 11 | 021 | `ART-021_bust_peltast_2.jpg` | as #10 but: a LOW, ROUNDED open-faced bronze helmet hugging the skull, short brim-like peak, long cheek guards; NO tall crown, NO curving tip, NO crest; the crescent pelte is the main prop | **Accepted** | Distinct from the rhomphaia. The two horns of the pelte read clearly. |
| 12 | 022 | `ART-022_bust_falx_1.jpg` | a Thracian falx warrior: bare head, long dark hair, full beard, brown wool cloak over a red tunic, the inward-curved blade of a two-handed falx over his shoulder | **Accepted** | |
| 13 | 023 | `ART-023_bust_gallic_1.jpg` | a Gallic warband warrior: limed pale spiky hair, long moustache, bare chest with blue woad swirls, bronze torc, the upper edge of a long oval shield with an iron boss | **Accepted** | |
| 14 | 024 | (not saved) | a cult fanatic: shaved head, grey ash on face and scalp, fierce stare, torn white tunic, black cloak, a short curved bronze knife raised; expression: intense, mouth closed (the bible's one grimace exception); EXCLUDE adds blood | **Looked right, not saved** | Seen in the chat: bald, ash-grey, knife raised, black cloak, no text. Download blocked (below). Remade in run 2 (#15). |

**Totals:** 14 renders, 12 accepted, 1 rejected and regenerated (peltast: a headgear silhouette clash), and 1 not saved (fanatic). No render had text, extra limbs or modern objects. Faces share one "family" look because every render had the seed attached, and that is intended.

**Pipeline.** `process.mjs` and then `check.mjs` gave PASS ×12: 288x288, opaque, name. `preview.mjs ART-013` gave **NOT ASSESSED** (exit 3): manifest `preview` is null, because no game slot loads `bust_*` yet (ASSET_LIST "not wired", OI-6). `promote.mjs ART-013 --looked` was **REFUSED** (no preview record). So **nothing was promoted**, and `public/` is untouched. All 12 are staged in `processed/` with status **NOT ASSESSED** until a UI story (HUB-02, ARM-01, HERO-01, or the recruit/Codex screens) wires `RASTERS` keys and the per-scene lazy load (OI-4). Then `preview.mjs` and `promote.mjs` can be run on these exact files.

**Side-by-side with the sprite.** Sprites roll their gear per hero: the preview militia, for example, has no cap and carries a thureos. Each bust shows the kit's signature item instead (the tier-1 or tier-2 headgear and the class weapon), and none shows gear outside the kit.

**Limit hit.** After the 14th render, Gemini's "Download full size image" fetched the image (network 200) but no file reached `~/Downloads`. It failed three times, by script click and by real click. This looks like Chrome's per-site "automatic multiple downloads" block. Changing it is a browser setting, so it was left alone, and two workarounds were denied by the permission system: a localhost receiver, and a second tab to inspect. Following the brief, Gemini use stopped there. No CAPTCHA or quota message appeared. To resume, the owner allows multiple downloads for gemini.google.com in Chrome, then the 9 in the Queue are run.

**Housekeeping.** An earlier version of the helper script moved an older, unrelated Gemini file (an icon sheet from 2026-10-09) out of `~/Downloads` by mistake. It was put back as `~/Downloads/Gemini_Generated_Image_restored-from-oct09.jpg`.

#### Run 2: the remaining 9 (2026-10-10, after the owner allowed multiple downloads for gemini.google.com)

**Tool.** Same as run 1: gemini.google.com, "Pro" mode, one new chat in a new tab, no tool picker, the same 1024 px `seed_hoplite.jpg` attached to **every** prompt through the page's hidden image input. Every output is a 2048x2048 JPEG. No CAPTCHA, quota message or download block: all 9 downloads arrived. Each new file in `~/Downloads` was moved by a script that takes only a `Gemini_Generated_Image_*` file absent from a listing made at the run's start and newer than the start time, and refuses if more than one matches; `~/Downloads` matched its start listing at the end. The tab was closed.

**Prompts.** Soldiers: the family prompt above, word for word, with {SUBJECT} from the table (fanatic: EXCLUDE adds "blood" and EXPRESSION is "intense, mouth closed"; chariot: EXCLUDE adds "horses, wheels"; sacred_band: EXCLUDE adds "anything red"). Beasts: there is no beast-plate style for busts in the art bible (T-PLATE is for myth plates), so they use T-BUST-BEAST merged into the same family prompt:

```
Create a NEW image, not an edit of the reference. Match the attached reference exactly in style, palette, brushwork, lighting and background; change the subject to an animal. It is one of a matching set of unit portraits for a mobile strategy game; this one shows a wild animal that fights as a unit (a type of animal, no human). STYLE: [as the family prompt]. EXCLUDE: any text, letters, numbers, signatures, watermarks, logos, borders or frames, people, collars, harness, armour, modern objects, extra legs, two heads, duplicated animals, cropped ears{, or tusks}, blood. SUBJECT: {SUBJECT}. FRAMING: head and shoulders, three-quarter view turned toward the viewer's left, the head filling the upper two thirds of the image, the tips of the ears 6 to 10 percent below the top edge and fully inside the frame, shoulders cut by the bottom edge, the head inside the central circle; the head silhouette {and the tusks / the open mouth} are the clearest, most contrasting shapes. BACKGROUND: the same plain dark warm umber as the reference with a soft lighter glow behind the head, no scenery. EXPRESSION: {alert, watchful / alert, stubborn / menacing}, eyes toward the viewer's left. ASPECT: square 1:1, highest resolution available.
```

**Kit decisions (V5-050: the kit wins where the bible's table disagrees).**
- **companion:** the kit's Boeotian helmet, drawn as bronze with a domed crown and wide brim; purple cloak with an ochre border (`cloakPurple`), xyston.
- **thessalian:** the kit also says Boeotian, which would give the companion's silhouette. Following ASSET_LIST ("petasos hat over a bronze helmet") it is a cream **felt** petasos with a very flat, very wide brim and a low crown, so it differs from the companion in material, colour and shape; blue cloak (`cloakBlue`), two javelins.
- **chariot:** the kit's `persian_tiara`, asked for low, soft and cream so it does not repeat the horse archer's tall red pointed hood; scale armour, red tunic, reins.
- **royal_guard:** the kit's Attic helmet, gilded, with the sprite's red crest and the bible's white plumes; the argyraspis is the silver shield; purple cloak.
- **sacred_band:** per V5-050, the kit's Corinthian helmet, told apart from the hoplite by a black crest, a dark blue cloak and a blue shield with a gold Theban club.

| # | ART | Raw (v5 worktree) | SUBJECT | Verdict | Notes |
| --- | --- | --- | --- | --- | --- |
| 15 | 024 | `ART-024_bust_fanatic_1.jpg` | a cult fanatic: shaved head, grey ash on face and scalp, fierce stare, torn white tunic, black cloak, a short curved bronze knife raised | **Accepted** | Bald, ash-grey scalp, knife in a raised fist, torn white tunic, black cloak (kit `tunicWhite` + `cloakBlack`). Hand anatomy correct. A few small brown stains on the tunic read as dirt, not blood. |
| 16 | 025 | `ART-025_bust_companion_1.jpg` | a Macedonian Companion cavalryman: bronze Boeotian helmet (an open face, a wide flaring brim all round like a hat, no crest, no plume), short dark beard, a deep purple cloak with a broad ochre-gold border pinned at the shoulder over a bronze muscled cuirass, the long wooden shaft and iron head of a cavalry lance (xyston) held upright beside his shoulder; no shield | **Accepted** | Brim and lance are the two clearest shapes. No hand on the lance, which is fine at 40 px. |
| 17 | 026 | `ART-026_bust_thessalian_1.jpg` | a Thessalian light horseman: a pale cream FELT petasos sun hat with a very FLAT, very WIDE round brim and a LOW shallow crown, tied with a cord under the chin (cloth, not metal), young clean-shaven face, a short Egyptian-blue chlamys cloak pinned at the shoulder over a white tunic, exactly two light javelins held upright beside his shoulder | **Accepted** | Exactly two javelins. The brim reaches about 13% from each side edge, still inside the frame. Distinct from the companion at 21 px (cream against bronze, blue against purple). |
| 18 | 027 | `ART-027_bust_chariot_1.jpg` | a Persian-style scythed-chariot driver: a soft cream-and-ochre felt Persian tiara cap, LOW and ROUNDED, its top bending forward, with a cloth band round the brow and long side flaps hanging loose at the cheeks (NOT tall, NOT pointed, NOT tied under the chin), black curled beard, red tunic under a shirt of overlapping bronze SCALE armour, one raised fist gripping the leather reins, the reins running out of the frame | **Accepted** | The cap came out taller than asked, but it is cream, soft and folded forward, so it doesn't read as the horse archer's red hood. Top about 4% below the edge, not cropped. Scale armour and reins clear. No horses or wheels. |
| 19 | 028 | `ART-028_bust_royal_guard_1.jpg` | a Macedonian royal guardsman (a silver-shield man): a GILDED Attic helmet with the face open, a short brow peak, hinged cheek pieces, a low red horsehair crest running front to back and two upright white feather plumes, one at each side of the helmet; short grey-flecked beard; bronze muscled cuirass, a purple cloak; the polished SILVER rim and face of a round shield at his shoulder, the brightest cool shape in the image | **Accepted** | The helmet has a small nasal guard, which an Attic helmet shouldn't have, but the face is open and the two white plumes plus the silver shield make it unmistakable. Plume tips about 4% below the top edge. |
| 20 | 029 | `ART-029_bust_sacred_band_1.jpg` | a Theban Sacred Band hoplite: the same kind of bronze Corinthian helmet as the reference but with a tall DARK charcoal-black horsehair crest; a dark Egyptian-blue cloak, white linen corselet; at his shoulder the round bronze-rimmed shield, its face painted dark blue with one large golden Herakles CLUB emblem (a single knobbly wooden club, drawn as a picture, not a letter), the club clearly visible. NO red anywhere | **Accepted** | Meets V5-050: black crest, dark blue cloak, blue shield with a large gold club, no red. Side by side with the hoplite, it reads differently at 21 px. |
| 21 | 030 | `ART-030_bust_wolf_1.jpg` | a grey wolf: grey and tawny fur with a pale muzzle and throat, ears pricked up, amber eyes, mouth closed | **Accepted** | Ears inside the frame. Warmer (more tawny) than the sprite's grey, but within the subject. Easy to tell from the javelineer's wolfskin cap, because that bust has a human face. |
| 22 | 031 | `ART-031_bust_boar_1.jpg` | a wild boar: dark brown-grey coarse coat, a bristling dark mane standing up along the neck and back, small dark eye, long snout, two curved pale ivory tusks curling up from the lower jaw, clearly visible | **Accepted** | Two tusks (the far one at the snout tip). The mane silhouette is strong. |
| 23 | 032 | `ART-032_bust_bear_1.jpg` | a huge brown bear: thick reddish-brown fur, a heavy brow ridge, small round ears, mouth open in a low roar showing teeth and fangs, a massive hump of shoulder | **Accepted** | Open mouth as in ASSET_LIST. Jaw and ears inside the frame. Beasts are exempt from the "mouth closed" rule (§5.4 covers soldiers). |

**Run 2 totals:** 9 renders, 9 accepted on the first try, 0 regenerated. No render had text, extra limbs or modern objects. **All AS-02 busts:** 23 renders, 21 accepted, 1 rejected (peltast #10), 1 not saved (fanatic #14, remade as #15).

**Run 2 pipeline.** `process.mjs ART-024 … ART-032` (kind painted, 288x288, opaque, key residue 0), then `check.mjs` gave 9 PASS. `preview.mjs ART-024` gave **NOT ASSESSED** (exit 3, no game slot loads `bust_*`), and `promote.mjs ART-024 --looked` was **REFUSED** (no preview record). **Nothing promoted**, and `public/` is untouched. The 9 are copied into `processed/` with status NOT ASSESSED, like the first 12.

**Contact sheet.** `docs/v5/art/AS-02-contact.jpg` was regenerated with all 21 (1400x1443, JPEG q30, 138 KB) from the same HTML layout and the same `preview.html` sprite crops. Looking at the whole sheet, the 9 new busts match the first 12 in background, glow, light direction and framing. They are slightly smoother and less craquelured than the seed, which is acceptable at 21 to 46 px.

**For the art-director.** §5.2 of the art bible still lists thessalian as "petasos hat", sacred_band as "Boeotian helm" and royal_guard as "gilded Thracian helm". The busts follow V5-050 and the kit instead (thessalian: petasos over the kit's Boeotian, which keeps it apart from the companion). The table should be updated in the next art story, as V5-050 says.


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
