# v6 asset log

Raw Gemini downloads go to docs/v6/gemini/. Log every prompt and its outcome here. Gameplay clips are logged here too.

## Queue

Landing jobs for the direction picked in `docs/v6/landing/DIRECTION_PICK.md` (B, "Night Tabletop", amended).
Specs: `docs/v6/landing/ART_DIRECTION.md` §8. Owner of the Chrome tab: the `assets` agent, one job at a time.

| ID | Asset | Source | Notes |
| --- | --- | --- | --- |
| LND-01 | Hero diorama slab (pixel) | **Real game render first** (a scratch capture of a battle field at integer scale on a transparent ground, HUD hidden); Gemini only for the slab's earth sides if the engine cannot draw them | Two separate formation layers (player, enemy) for the scroll moment; PA-WORLD palette; no text |
| LND-02 | Lamp and dust layer | Code (CSS radial gradient + a tiny AVIF dust sprite) | Not generated |
| LND-03 | Class busts for the web | Re-export the shipped v5 busts (`public/ui/busts/`) through Astro `<Picture>` | Nothing new to generate unless a class in STRUCTURE.md §3 has no bust |
| LND-04 | Beast plates (wolf, boar, bear, mythical) | Re-export v5 plates (`public/ui/beasts/`) | |
| LND-05 | Open Graph image 1200x630 | Composite: LND-01 render + code-set wordmark | Not generated |
| LND-06 | Gameplay clips H1, M1–M4, G1–G4, B1 | `video` agent, Playwright recording | List and specs: `docs/v6/landing/STRUCTURE.md` › Clips needed; budgets ADR-0011 |
| LND-07 | Optional painted "chronicle" band (one wide fresco at night for the closing CTA) | Gemini, fresco family prompt (PROMPTS_ART §5) with `fresco_war` attached, LIGHT: night, torchlit | Only if the build story wants it; painted art never behind text |

## Done

### P2-LAND: landing page mockup directions (2026-10-13)

- **Tool:** gemini.google.com in Claude in Chrome, mode "3.1 Pro", typed prompts, no tool or aspect picker.
  One new tab, closed at the end; one new chat per direction (B's fix was an edit in B's chat).
- **Seeds attached to every first prompt** (through the page's hidden `image/*` input):
  `public/ui/splash_keyart.jpg` (painted style) and `docs/v5/audit/shots/battle-fight-390x844.png`
  (the real pixel battlefield).
- **Outputs:** JPEG, 1024x4128 (A, C) or 1088x3904 (B). Re-encoded with `sips` at quality 82 to stay under 2 MB
  (0.8–1.0 MB each). Raws are committed (this folder is not gitignored, unlike `docs/v5/gemini/`).
- **Files:** `docs/v6/gemini/P2-LAND/`.

**Shared page block L1** (the start of prompts A, verbatim):

> Create an image. A full-length web page design mockup for a desktop browser 1440 px wide, shown as ONE very tall vertical image of the whole page from top to bottom. It is the launch site of PIXELARROW, a free formation-tactics strategy game set in the ancient Mediterranean (Greeks, Carthaginians and Celts, 4th century BC) that you play in the browser and in Telegram. The two attached images are from the real game: the painted picture shows the painted style of its menus and key art; the phone screenshot shows the real battlefield, which is isometric pixel art seen from above, olive and straw grass, small soldiers on base plates with round shields, a river, trees and rocks. Every gameplay picture on the page must look like that screenshot (crisp isometric pixel art seen from above, framed as a video still with a small round play button), never like a 3D render. Typography: headlines and buttons in Cinzel bold capitals; body text in Inter, sentence case. No pure black and no pure white anywhere. The page sections from top to bottom, and nothing else: (1) a slim top navigation: the wordmark "PIXELARROW" at the left; links "Features", "Classes", "Modes", "Leaderboards", "FAQ"; a small button "Play" at the right. (2) the hero (described below) with the headline "HOLD THE LINE", the line "Command pixel phalanxes in real-time battles across the ancient Mediterranean. Free in your browser and in Telegram.", a primary button "PLAY IN BROWSER" and a secondary button "OPEN IN TELEGRAM". (3) a features row of four short items, each with a small icon and a title: "Real-time battles you can pause", "Formations: line, wedge, column", "Morale breaks lines", "Every soldier is a hero with a name". (4) a classes section titled "CHOOSE YOUR MEN": a row of six painted head-and-shoulders portraits in the style of the attached painting, each with a name under it: "Spartan hoplite" (Corinthian helmet, red crest), "Cretan archer" (bare head, bow), "Companion cavalry" (Boeotian helmet), "Celtic swordsman" (iron helmet, long sword), "Thracian falx" (Thracian helmet, curved blade), "Rhodian slinger" (bare head, sling). (5) a modes section titled "FOUR WAYS TO FIGHT" with four tiles, each with a pixel-art gameplay still and one line: "Campaign" — "March an overland map, hunt bands, recruit in towns."; "Duels" — "Ranked 1v1, live or against a saved defence."; "War" — "A shared seasonal map: take regions with your clan."; "Forge" — "Reforge one line of an item at the town smith." (6) a live section titled "THE WAR RIGHT NOW": two counters labelled "Players" and "Battles fought" whose values are shown as a long dash "—"; beside them two small tables, "Top duelists" with columns "#", "Player", "League" and five rows of neutral placeholder names, and "War standings" with columns "#", "Clan", "Regions" and five rows. (7) a gameplay clips section titled "SEE IT MOVE": a grid of four pixel-art video stills with play buttons, captioned "A formation breaks", "The war map", "A ranked duel", "At the forge". (8) a FAQ titled "QUESTIONS" with four collapsed rows: "Is it free to play?", "Do I need Telegram?", "Can I play on a laptop?", "Is my progress saved?". (9) a closing band repeating "PLAY IN BROWSER" and "OPEN IN TELEGRAM". (10) a footer with the wordmark and the links "Privacy", "Terms", "Refunds", "Telegram". Spell every string exactly as given and show no other text. Nothing else on the page: no app store badges, no Steam or Discord, no pricing, no newsletter form, no download button, no countdown, no character levels, no gems or coins, no extra sections. ASPECT: very tall vertical portrait, the tallest aspect available (9:16 or taller), highest resolution available.

**L2** (used for B and C) = L1 with section (5) changed after A showed an invented smithy scene. In (5),
"each with a pixel-art gameplay still" became "each with a still", and this sentence was added after the Forge line:

> The stills: Campaign = a top-down pixel-art overland map with a road, a walled town and a small marching party; Duels = two small pixel armies facing each other on the isometric field; War = a parchment map of regions joined by dotted routes with small coloured banners; Forge = a game menu card listing an item's stat lines with one line highlighted (not a smithy scene).

**L3** (used for C) = L2 with "each with a small icon" in (3) changed to "each with a small plain icon (no badges, no numbers on icons)", after B #1 showed a number badge.

**Direction blocks** (appended after the shared block, verbatim):

- **A, "Lamplit Chronicle"** (L1 + A):
  > DIRECTION A, "Lamplit Chronicle": a dark warm basalt page (#16120f) lit like a museum of frescoes at night. The hero fills the whole first screen: the attached painted key art re-painted as a wide night scene, the same phalanx of hoplites with plain bronze shields (no letters or symbols on them) on the beach, now at night by torchlight, warm firelight on bronze, a dark sea and a few stars; the headline and buttons sit on the dark sky at the left, never over faces. Sections sit on dark stone (#26211b) with thin gold-ochre (#e6c885) rules; a thin Greek-key meander band only at the very top and bottom of the page; parchment (#e7d6ad) cards with dark ink only for the FAQ and the two tables. The primary button is terracotta (#a8432c) with a thin gold rim; the secondary is outlined in bronze (#7d5b30). Gold Cinzel headlines. The class portraits sit in round bronze frames with a soft warm lamplight glow behind them. Painted art and pixel stills are never blended inside one frame.
- **B, "Night Tabletop"** (L2 + B):
  > DIRECTION B, "Night Tabletop": the hero is the real pixel-art battlefield from the attached screenshot built as a huge isometric diorama: a diamond-shaped slab of olive and straw pixel grass with a river and pixel trees, and two formations of tiny pixel soldiers on base plates about to clash, floating in a dark slate-blue night (#141a1f fading to #1d2a30), lit by one warm lamp from the upper left so the slab's far edges fall into shadow, a little dust in the lamplight. Under the player's formation a faint translucent cyan (#7fd0e0) diamond lattice marks its footprint: this cyan lattice is the page's signature motif, repeated as thin cyan diamond-grid dividers between sections. The headline and buttons sit at the left over the dark night, never over the diorama. Cards are dark slate tiles with a 1 px warm outline, like the base plates of miniatures. Headlines in warm cream (#f0e3c2) Cinzel; the primary button terracotta (#a8432c), the secondary outlined in cream. The class portraits are painted busts in the attached painting's style inside dark square frames with a bronze edge. Mostly pixel art, little painting; painted art and pixel art never blended inside one frame.
- **B fix (edit, same chat as B #1):**
  > Edit the image you just made. Change only these two things: (1) the small icon above "Every soldier is a hero with a name" must be a plain bronze Corinthian helmet in profile, with no badge, no number and no circle on it; (2) in the "SEE IT MOVE" grid, the second still, captioned "The war map", must show the same parchment map of regions joined by dotted routes with small coloured banners as the War tile, not a battlefield. Keep everything else identical: layout, colours, text, the diorama hero, every other still and section.
- **C, "Wine-dark Dusk"** (L3 + C):
  > DIRECTION C, "Wine-dark Dusk": cinematic and layered. The hero is a full-bleed painted vista in the attached painting's style but at dusk, built as clearly separated parallax depth layers: a plum and wine sky (#42313b, #5e1a28) with a low coral sunset (#d77f7d) on the horizon; a headland with a small pale temple; beached warships on a dark sea; and in the near foreground the dark silhouettes of a phalanx's helmets, crests, plain round shields (no letters or symbols on them) and levelled spear points against the sunset, with a few drifting orange embers. A huge "PIXELARROW" wordmark in coral Cinzel capitals stands across the sky behind the foreground silhouettes, so the spear tips overlap the letters; the headline, line and buttons sit under it at the left. Below the hero the page fades into a deep plum ground (#2a2030); sections are separated by soft warm light shafts rather than lines; each mode tile and clip has its pixel still inside a thin coral frame; the class portraits sit in tall arched niches. Headlines in warm cream (#f0e3c2); the primary button coral-terracotta, the secondary outlined in cream. Painted art and pixel art are never blended inside one frame.

**Renders**

| # | File | Prompt | Verdict | Why (checked tile by tile against the allowlist) |
| --- | --- | --- | --- | --- |
| 1 | `landing_A_lamplit_1.jpg` | L1 + A | **Kept, with notes** | Every section and string present, nothing extra; counters "—"; shields plain. Notes: the Forge tile and "At the forge" clip show a pixel smithy with two smiths, a scene the game does not have (the forge is the Smith row of a town's Services tab): misleading as a still, so L2 was written; the Campaign tile shows the iso battlefield, not the top-down overland map; the War standings table has placeholder region counts (3, 4). Acceptable for a direction mockup; none of these may reach the build. |
| 2 | `landing_B_tabletop_1.jpg` | L2 + B | **Rejected** | The "Every soldier is a hero with a name" icon carries a round badge "8", which reads as a hero level the landing must not imply; the "The war map" clip shows a battlefield. |
| 3 | `landing_B_tabletop_2.jpg` | B fix (edit of #2) | **Kept, with notes** | Helmet icon plain; war-map clip now the region map; everything else unchanged. Notes: the edit garbled some body text ("phaianxes", "breeks", "cavairy", "faix") and the Forge card's stat names are gibberish; the copy is set in code, so this does not matter for the direction. Leaderboard rows are "PlayerOne / [League]" placeholders, regions "—". |
| 4 | `landing_C_dusk_1.jpg` | L3 + C | **Kept, with notes** | Every section and string present, nothing extra; counters "—". Notes: the Thracian falx bust wears a crested Corinthian-style helmet like the hoplite (breaks the art bible's one-headgear-per-class rule; the build uses the shipped v5 busts anyway); the leaderboard tables show placeholder numbers (league "3", regions "5") and Greek-sounding names; "March ain map" typo; Forge card stat names are gibberish. |

Pick and review: `docs/v6/landing/DIRECTION_PICK.md`.

### P5-LAND-ART: hero layers, OG image, favicon set (2026-10-13)

Spec of every final (size, format, weight, target path): `docs/v6/landing/ASSET_SPEC.md`.
Staged finals: `landing/assets-staging/` (hero/, og/, favicon/). Composite check at 1920x1080:
`docs/v6/art/P5-LAND-hero-preview.jpg`.

**Queue status:** LND-01 done (engine render, see below); LND-02 done (painted beam layer plus the CSS glow);
LND-05 done (code composite); favicon set copied (v5 AS-08); LND-03, LND-04 unchanged (re-export in the build);
LND-06 is the `video` agent's; LND-07 not requested. **Mode cards: no art generated** — the tiles use the real clip
posters M1–M4 (decision A4 in ASSET_SPEC: the P2 mockups invented a smithy and a battlefield campaign map; a
recording cannot).

**Engine renders (not Gemini).** `scripts/art/landing/diorama.mjs` (with `slab.ts`, `units.ts`, `units.json`)
draws the diorama with the game's own art code: `generateBattlefield(11, plain, river, rocky, woods 0.3)` on an
18x18 field, `renderGround` masked to the iso diamond, cut earth sides (36 px, soil ramp from PA-WORLD, lit left,
shaded right), trees and boulders placed exactly as `BattleScene.addTerrainProps` places them, and two formations
from `makeHero` + `dollFromHero` + paperdoll `renderFrame` at `BATTLE_SCALE` / `BATTLE_RES` on `renderBasePlate`
plates: 10x3 Greek hoplites facing up-right (row 1), 9x3 Celtic swordsmen facing down-left (row 2), the river
behind the Celts. Picked from a sheet of 15 seeds (seed 11: copses at the far corners, an open centre for the
lines, rocks near the front). Re-running is byte-identical (checked with `cmp`).

**Gemini.** gemini.google.com in Claude in Chrome, mode "3.1 Pro", one new tab and one chat, closed at the end.
Seeds attached to the first prompt (hidden `image/*` input): `docs/v6/gemini/P5/seed_slab_2x.png` (the engine
render above on `#100d0b`, 2x) and `public/ui/splash_keyart.jpg` (painted style). Downloads moved by a mover that
takes only one new `Gemini_Generated_Image_*` absent from a start listing. All outputs JPEG; the sky raw was
re-encoded with `sips` q82 to stay under 2 MB.

**S1, sky** (first prompt, verbatim):

> Create an image. ROLE: the farthest background layer of a website hero for PIXELARROW, a pixel-art formation-tactics game set in the ancient Mediterranean. The first attached picture is the real game battlefield drawn as a small tabletop diorama; on the website it floats in the middle of this background, but it is NOT part of this image. The second attached picture is the game's painted key art: match its painting style, warm palette and soft brushwork. SUBJECT: an empty night sky, a calm painted backdrop: a very dark warm ground (#100d0b to #1d1812, warm basalt brown-black, not blue, not purple), a faint warm haze near the bottom edge, a soft wide band of the Milky Way rising from the lower left to the upper right in warm cream and faint ochre, and many small soft stars in warm cream (#f0e3c2), a few a little brighter, never sharp white points; the upper left corner slightly warmer, as if a lamp glows just off the frame. Keep the whole image very dark: most of the area below 10 percent brightness and the brightest star no brighter than #f0e3c2, so cream text stays readable over any part of it. COMPOSITION: no horizon, no land, no sea, no moon, no clouds with shapes, no figures; detail spread evenly across the whole image so it can be cropped to any shape from 21:9 to 9:16. STYLE: painted, soft, a slight lime-plaster grain, not a photo, not a 3D render, not glossy digital art, no pure black and no pure white. EXCLUDE: any text, letters, numbers, logos, UI, a frame or border, the diorama, planets, comets, constellation lines, people, buildings. ASPECT: landscape 16:9, highest resolution available.

**S2, lamp beam and dust** (same chat, verbatim):

> Create a NEW image, not an edit of the references. ROLE: a light-only overlay layer for the same website hero; on the page it is blended with the "screen" blend mode, so everything black disappears and only the light shows. SUBJECT: a soft cone of warm lamplight (#f2c879, a little cream at the core) entering from the upper left corner and falling diagonally down toward the centre right, widening as it goes, with soft feathered edges; brightest at the upper left edge where it enters and fading smoothly to nothing before the lower right corner; inside the beam, many tiny dust motes floating in the light: soft warm specks of different sizes, most very small, a few slightly larger and slightly out of focus, more of them inside the beam and almost none outside it. BACKGROUND: perfectly flat pure black #000000 everywhere outside the light, edge to edge, with no texture, no vignette, no stars and no colour noise. No lamp, no window, no objects, no diorama, no people: only the light and the dust. STYLE: painted, soft, gentle; no lens flare, no hard rays, no god-ray stripes, no bloom rings. EXCLUDE: any text, letters, numbers, logos, UI, a frame or border. ASPECT: landscape 16:9, highest resolution available.

**S3, foreground props** (same chat, verbatim):

> Create a NEW image, not an edit of the references. ROLE: the nearest foreground layer of the same website hero, shown in front of the diorama and cut out by a script. The second attached picture shows the game's painted style: match its palette and brushwork. SUBJECT: the near edge of a dark wooden war table seen from just above it, running along the whole bottom edge of the image like the bottom of a stage: an old dark oak plank edge (#2a1a12 to #442618) about one eighth of the image height. On the table, cut off by the left and right frame edges: at the lower left, a loosely rolled papyrus scroll with a bronze stylus lying beside it; at the lower right, a plain bronze Corinthian hoplite helmet with a red horsehair crest resting on its side on the table, facing left, partly cut off by the right edge. The props reach no higher than one third of the image height; the middle of the table edge is empty. LIGHT: the room is dark; the props are mostly dark silhouettes (#1d1812 to #342d25) with a thin warm rim light from a lamp at the upper left (#b08a3a bronze, #f2c879 highlights) on their top-left edges. BACKGROUND: everything above the table and the props is a perfectly flat solid #FF00FF magenta, edge to edge, with no shadow, no gradient, no glow and no light on it; no magenta anywhere inside the table or the props. STYLE: painted, soft edges, not a photo, not a 3D render, not glossy digital art, no pure black and no pure white. EXCLUDE: any text, letters, numbers, runes or symbols on the helmet, the scroll or the table, logos, UI, a frame or border, coins, dice, gems, candles, maps with writing, people, hands, the diorama. ASPECT: very wide landscape, 21:9 or the widest available, highest resolution available.

**S3 fix** (same chat, verbatim):

> Create a NEW image with the same prompt, but fix three things: (1) everything is far too tall: the table edge must fill only the bottom 12 percent of the image, and the helmet and the scroll must lie low on the table, the helmet lying on its side with the crest along the table (not standing upright), each prop no taller than 25 percent of the image height; the top two thirds of the image are empty magenta; (2) the props and the table must be much darker, nearly silhouettes in a dark room: their faces in deep umber shadow (#1d1812 to #342d25), with only a thin warm rim of lamplight on their top-left edges; (3) the magenta must be one perfectly flat colour #FF00FF with no texture, no brush marks and no shading. Keep everything else from the first prompt: the same two props at the same sides, the painted style, no text or symbols, the very wide aspect.

**Renders**

| # | File (`docs/v6/gemini/P5/`) | Prompt | Size | Verdict | Why |
| --- | --- | --- | --- | --- | --- |
| 1 | `landing_sky_1.jpg` | S1 | 2752x1536 | **Kept** | Warm basalt night, ochre Milky Way band, soft cream stars, no horizon, no objects, no text. Dark enough for cream text with the build's scrim; the band is brightest in the centre, so text stays in the left third. |
| 2 | `landing_beam_1.jpg` | S2 | 2752x1536 | **Kept** | Soft cone from the upper left, dust motes inside it, pure black outside, no lamp or rays. Strong at the source: used at about 0.5 opacity with `screen`. |
| 3 | `landing_fg_1.jpg` | S3 | 3168x1344 | **Rejected** | The helmet stands upright and fills 80% of the height, the table is a third of the image and the props are fully lit, not silhouettes: it would bury the diorama. Plain helmet, no symbols (that part was right). |
| 4 | `landing_fg_2.jpg` | S3 fix | 3168x1344 | **Kept, with notes** | Props now low (helmet on its side, scroll and stylus), flat magenta (key residue 0 after `keyOut` tol 70), no text or symbols. Notes: still lit more than asked and the table band is about 25% of the height; the build darkens it (`brightness(.7)`) and sinks it partly below the fold. |

**Processing:** `docs/v6/landing/ASSET_SPEC.md` › Regenerating. Measured problem: `sips` AVIF with alpha does not
render in Chromium (the keyed foreground vanished in the composite), so alpha layers ship as WebP only.

**OG composite:** an HTML page in headless Chromium (Playwright, 1200x630, DPR 1): `landing_hero_sky_1280` cover,
the still diorama at its native 2x placed at (300, -150), the beam at 0.5 with `screen`, a left-to-right
`#100d0b` scrim (92% → 0 by 55% width), then "PIXELARROW" (Cinzel 700, 30 px, `#c9b896`), "HOLD THE LINE"
(Cinzel 700, 84 px, `#f0e3c2`), "Pixel-art formation battles. Free in your browser and in Telegram." (Inter 24 px)
and "pixelarrow.app" (Inter 20 px). Exported PNG → JPEG q55 (143 kB; q70 was 206 kB, q62 173 kB).
