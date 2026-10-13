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

## Clips

### P5-VIDEO: gameplay clips for the landing (2026-10-13)

LND-06. Every clip is the **real game** (Phaser 3.90, dev server from this branch), driven by
`scripts/landing/record-clips.mjs` and encoded by `scripts/landing/encode-clips.sh`. Finals:
`landing/assets-staging/video/` (`<id>.webm` VP9, `<id>.mp4` H.264 High, `<id>-poster.avif`,
`<id>-poster.webp`; the hero also has `H1-av1.webm`). Raw PNG takes lived in the session scratch
directory and were deleted after encoding.

**How it is recorded.** Playwright's fake clock (`page.clock`) drives the game's
requestAnimationFrame, Date and performance.now, so the game advances exactly 1/30 s between two
screenshots: no dropped frames, and a seeded scenario repeats exactly. Frames are taken at the clip's
final size (DSF 1) with the game's own integer camera zoom (x2 to x4) and the camera on whole world
pixels, so the pixel art is never rescaled. The portrait column (`#game`, 0.64 × height) is widened by
an injected style and the game re-lays itself out (Phaser RESIZE). Staging goes only through the debug
handles (`__game`, `__state`), as `scripts/dev/screenshots.mjs` does: a seeded army (never over the
field cap of 12), auto-pause off, the HUD camera hidden on field shots. Nothing is drawn that the game
does not draw. **Loop:** each take is 0.5 s longer than the clip; its last 0.5 s cross-fades into its
first 0.5 s (checked: the last frame leads into the first). **Encode:** VP9 two-pass and H.264 at a
quality CRF, capped by a bitrate from the ADR-0011 byte budget; AVIF poster at the lowest CRF that fits
40 kB. 30 fps, no audio.

Re-run: `npx vite --config scripts/landing/vite.record.config.mjs --port <p> --strictPort`, then
`node scripts/landing/record-clips.mjs http://localhost:<p>/ [--only H1,G1]`, then
`bash scripts/landing/encode-clips.sh` (raw frames default to the git-ignored `shots/landing-clips/`).

| ID | Size, length | What the take is | WebM | MP4 | Poster AVIF / WebP |
| --- | --- | --- | --- | --- | --- |
| H1 | 1280x720, 8 s | Battle seed 101, plain: 9 hoplites + 3 peltasts vs 10 Celtic swordsmen + 4 javelineers; both lines advance and clash, javelins in the air, the player's cyan lattice under the phalanx. Zoom x2, HUD hidden, the player's own "Reduce shake" on (a calm ambient loop); the camera rides between the lines with a slow drift. | 1,124 kB (AV1: 1,046 kB) | 1,521 kB | 38.5 / 182 kB (t 4.0 s) |
| M1 | 960x540, 6 s | Overland map, campaign seed 20261006: the party leaves Rhegion along the road, passes a raider band (strength plate "15") and reaches Pylos. Route set with `setDestination`, ground on the road revealed, ambushes held off (`safeUntil`), map zoom x3, HUD hidden, camera eased on the party. | 523 kB | 518 kB | 28.2 / 66 kB |
| M2 | 960x540, 6 s | A ranked duel vs the demo opponent "Hektor" (the in-memory duel source the layout check uses): the demo duel army gets three Glory recruits, Find match, then both duel armies close and meet. Zoom x2, HUD hidden. | 762 kB | 864 kB | 33.4 / 101 kB |
| M3 | 960x540, 6 s | War map on the local demo shard (`Online` `{ preview: 'map' }`): a slow pan from home (Cavarian Meadows) south over the regions toward a rival army's march. Map zoom x2, the map's UI camera hidden. | 584 kB | 759 kB | 39.7 / 90 kB |
| M4 | 720x720, 5 s | Rhegion › Services › Smith: a legendary falcata (seeded into the stash, as the layout check does), the Aim line picked and Reforge pressed twice by real mouse clicks: "Durability +30%, was Aim +2%", then "Shield pierce +4%", gold 1,240 → 760. Full UI. | 155 kB | 116 kB | 26.9 / 45 kB |
| G1 | 960x540, 8 s | Battle seed 207: 7 hoplites, 2 archers, 3 Companions vs 10 Celtic swordsmen (level 2) + 3 javelineers. Scripted by tick: the line advances; once it is engaged the Companions swing to a point off the Celts' flank and charge (tick 318); the Celts' main group routs at tick 503. Played at the game's x2 speed, zoom x3, HUD hidden, the camera on the melee. A dry run of the same seed finds the ticks. | 747 kB | 1,062 kB | 38.1 / 114 kB (t 5.6 s) |
| G2 | 960x540, 8 s | War map as M3, zoom x1: a longer pass over the rival army, home and the march, towns (Entremont, Massalia, Avenio), rivers, mountains and the sea. One untimed pass first so the map's ground chunks are drawn. | 784 kB | 998 kB | 31.1 / 136 kB |
| G3 | 960x540, 8 s | The same duel as M2, 3 s on: the phalanx, set to the shield wall on deployment, holds as the duel armies clash. Zoom x3, HUD hidden. | 747 kB | 1,057 kB | 37.8 / 105 kB |
| G4 | 960x540, 5 s | As M4 at 16:9, the item card in full. | 153 kB | 114 kB | 25.6 / 43 kB |
| B1 | 360x360, 3 s | Battle seed 311: four Spartan hoplites on their base plate, braced and thrusting in a melee with Celtic swordsmen. Zoom x4, HUD hidden. | 190 kB | 114 kB | 11.1 / 17 kB |

All within ADR-0011: clips WebM ≤ 800 kB and MP4 ≤ 1.1 MB, the hero WebM ≤ 1.2 MB and MP4 ≤ 1.6 MB,
posters AVIF ≤ 40 kB. OG (the 11th item) is a still, made in LND-05, not here.

**Notes for the build.**
- The game has no landscape layout yet (v6 goal 3), so its HUD fills two thirds of a 960x540 frame; the
  field and map clips hide it, the forge clips keep the full UI. Re-record M4/G4 (and, if wanted, a HUD
  version of a battle) once the landscape layouts merge: the script is ready for it.
- Duels are small battles by design (a 10-man duel cap; the demo opponent fields 6), so M2 and G3 read
  smaller than the campaign battles.
- G3 is the shield wall holding a clash, not a deployment drag: the deployment is a few seconds before.
