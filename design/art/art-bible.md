# Art Bible: Pixelarrow (v5)

> **Status**: Draft, authored autonomously (the owner was asleep; every choice is logged in `docs/v5/art/ANSWERS.md`)
> **Owned By**: art-director
> **Last Updated**: 2026-10-10
> **Art Director Sign-Off (AD-ART-BIBLE)**: SKIPPED 2026-10-10 — lean mode
> **Scope**: all 9 sections (the brief asks for type, chrome, icon, portrait and pixel rules, so the `standard` minimum of sections 1–4 is not enough).
> **Inputs**: `docs/v5/audit/UI.md` and its shots, `docs/ART_STYLE.md` (world pixel art), `docs/redesign/V4_SPEC.md` and mockups A1–A3, `docs/UI_KIT.md`, `docs/v5/DECISIONS.md` (V5-013), and the code (`src/ui/tokens.ts`, `src/art/vectorFont.ts`, `src/ui/kit.ts`, `src/platform/renderScale.ts`, `src/ui/mosaic/raster.ts`).
> **No game concept yet.** `design/gdd/game-concept.md` is written in Phase 2 (V5-007). This bible anchors on the README pitch: "pixel-art formation tactics in the ancient Mediterranean: locked shields, thrown javelins, flanks wheeling, lines that break when morale breaks". Re-check sections 1–2 against `VISION.md` when it lands.

Companion files:
- `docs/v5/art/palette.json`: every token and the contrast pairs.
- `docs/v5/art/ASSET_PIPELINE.md`: from a raw image to a shipped asset.
- `docs/v5/art/ASSET_LIST.md`: what to make, at which size.
- `docs/v5/ASSET_LOG.md` › Templates: the Gemini prompts.

---

## 1. Visual Identity Statement

**One-line rule:** *The world is a pixel tabletop and everything about it is a painted chronicle.* You **act** on pixel art: the map, the battlefield, the soldiers on it. You **read** painted art: menus, portraits, banners, rewards, the codex. When in doubt, ask whether the player is acting on a place or reading a record.

**Principles.** These are visual pillars. Each serves part of the pitch and comes with a design test.

| # | Pillar | Serves | Design test |
| --- | --- | --- | --- |
| P1 | **Painted chronicle, pixel battlefield.** Two media, never blended inside one frame. | The tabletop fantasy of moving formations, and the "history of your warband" fantasy. | If an image sits in a portrait well, a fresco frame, a plate or a reward modal, it is **painted**. If it moves on the field or the map, it is **pixel**, at an integer scale. A pixel sprite is never cropped or blurred into a painted slot (the audit's G8, the headless MVP). |
| P2 | **Read it at a glance on a phone.** Legibility beats ornament. | A mobile, portrait Telegram game where you make tactical decisions in seconds. | If an ornament, a texture or a colour costs contrast or size, cut the ornament. Text is at least 4.5:1 and 13 CSS px. A state is never shown by colour alone. A portrait reads at 21 UI px by its headgear silhouette. |
| P3 | **Every colour has one job.** | Formation tactics are about reading roles fast. The UI must teach roles the same way. | When you reach for a colour, look it up in §4.2. Terracotta means "do this", bronze "you can do this", grey "you cannot", red "danger or loss", blue "real money", gold "reward". Using a colour outside its job is a bug: grey on live buttons (G2), red headers (G3), a blue role pill (G4). |
| P4 | **Bronze, ochre and lamplight.** | The ancient Mediterranean: warm, sun-baked, desaturated, earth pigments. | With an ambiguous hue, pick the warmer, less saturated neighbour. No pure black, no pure white, no neon. Light falls from the upper left, in both media. |

## 2. Mood & Atmosphere

Every state below has its own temperature and light, so a screenshot tells you where you are.

| State | Emotional target | Light | Descriptors | Energy | Carrier |
| --- | --- | --- | --- | --- | --- |
| **Hubs (Campaign, Codex, Shop)** | Calm command: "my warband, my plans" | Warm afternoon lamplight on parchment; low contrast in the background, high in the content | warm, orderly, tactile, inked | measured | Parchment cards inside the dark meander frame; the campaign fresco at dawn |
| **Duels hub** | Rivalry, ceremony | Torchlit dusk, with orange pools on stone | competitive, ceremonial, warm-dark | rising | Arena and ladder frescoes at dusk; gold chests |
| **War hub** | Strategy at scale, tension | Overcast and smoky, cooler | martial, wary, layered | measured-tense | War fresco with camp smoke; the dark teal tab bar |
| **World map** | Exploration, the unknown edge | Even daylight; cream and lavender fog | open, airy, inviting | contemplative | Parchment fog and a lavender sea (ART_STYLE §12) |
| **Battle** | Clarity under pressure | Bright noon, olive and straw, crisp shadows to the south-east | legible, dusty, kinetic | high | Team colour only on shields and standards; a cyan formation lattice |
| **Victory** | Earned triumph | Gold dawn | radiant, generous | burst, then calm | Laurels, a gold glow, the class bust of the MVP |
| **Defeat / rout** | Loss with dignity, not humiliation | Dusk, desaturated, ash grey | sober, heavy, quiet | low | Dimmed laurels, a wine plaque, no red flashing |
| **Codex / beasts** | Myth, awe, danger | Lamplit scriptorium; the beast plates in strong chiaroscuro | ancient, ominous, curious | contemplative | Beast plates painted like a vase or tomb fresco: dark ground, lit monster |
| **First run / splash** | Invitation, scale | Dawn over the sea | heroic, fresh | rising | Splash key art: the phalanx on the beach |

## 3. Shape Language

- **Character silhouettes (menu busts).** Class identity is carried by the **headgear silhouette** plus **one prop at the shoulder**: crest, cap, hood, helmet, hair, then shield rim, bow, blade or javelins. At 21 UI px only those two survive. No two classes share a headgear silhouette (§5.2 has the table).
- **World silhouettes (pixel).** Formations read as **blocks**: miniature base plates joined into strips and shields in a row (ART_STYLE §9). The individual soldier stays "chunky-realistic", about 6 heads tall. Beasts break the block grammar on purpose: curved, irregular, 3–6 times taller than a man.
- **Environment.** The map is square tiles with organic coasts and dotted borders. The battlefield is the 2:1 iso grid. Painted vignettes use horizontal bands (sky, wall line, ground) so they survive the cover-crop from 2.4:1 down to 5.6:1.
- **UI shape grammar.** It echoes carved stone and Greek architecture:
  - rectangles with 2 UI px radius;
  - bevelled slabs for actions;
  - arches for niches;
  - a circle only for the War medallion, badges and portrait discs;
  - the meander band only on the screen frame.

  The chevron-ended hero CTA is reserved for the one primary action of a hub.
- **Hero shapes and supporting shapes.**
  - The eye goes first to the terracotta primary, then to painted art, then to ink text.
  - Chrome (stone, meander) is low-contrast and recedes.
  - Painted art never sits behind text. Text sits on parchment or on a solid plaque, never on a painting.

## 4. Color System

### 4.1 Primary palette

| Token | Hex | Role in this world |
| --- | --- | --- |
| `page` | #16120f | Basalt night behind everything; the "outside" of the chronicle |
| `stone1–3` | #26211b / #342d25 / #463d33 | Carved frame, bars, the dark ground of busts and plates |
| `parch` / `parchHi` / `parchLo` | #e7d6ad / #f0e3c2 / #dcc394 | The page of the chronicle: content lives here; Hi = selected, Lo = shaded |
| `ink` / `inkSec` | #3a2414 / #5e4129 | Writing on the page |
| `terra` | #a8432c | Fired clay: **the one action to take now** |
| `bronze` | #7d5b30 | Worked metal: **any other available action**, frames, the War medallion |
| `gold` | #e6c885 | Gilding: titles on stone, rewards |
| `teal` / `tabBar` | #1f4f52 / #16333a | Glazed tile: plaques and navigation |

### 4.2 Semantic colours (one job each)

| Colour | Means | Never used for |
| --- | --- | --- |
| Terracotta `terra` | The single primary action of the screen | Headers, decoration, a second CTA |
| Bronze `bronze` | Every enabled non-primary action: secondary, neutral, Close, Flee, Dismiss, steppers, unselected filters | Disabled states |
| Grey `off` #5f5a53 | **Disabled only**, always with a reason line or a lock (§7.3) | Any enabled control (audit G2: a lint flags `neutral` on an enabled button) |
| Wine `wine` #5e1a28 | Destructive actions (with a confirm) | Plain "back" |
| Red `alert` #b3261e and `inkBad` | Errors, losses, alert badges | Names, group I, section headers, hints, 3rd place (audit G3) |
| Blue `purchase` #1b6fa3 | Real money (Telegram Stars) only | Role pills (G4), info |
| Gold `gold` / `inkGold` | Rewards, Glory, chests, laurels | Body text |
| Rarity inks | Item names only | Anything else |
| Group colours `group1–4` | Battle groups I–IV, always with their numeral | Anything else |

**Group colours change** (audit G3). Group I is no longer red. The groups become ochre #8a5a12, olive #3f6b25, slate-teal #2b5d6b and plum #5b3a7a, each carrying a cream numeral. This also has to change in battle (`src/art/sheetArt.ts` `GROUP_COLOR`), so both places agree.

### 4.3 Contrast-checked pairs

`node scripts/art/contrast.mjs` checks every pair in `docs/v5/art/palette.json`. Text must reach 4.5:1 (V5-013) and non-text UI 3:1; the script exits 1 on any failure. The gate was seen to fail: an alert badge on stone came out at 2.08:1, which is why badges carry a cream ring. Run of 2026-10-10:

| Foreground | Background | Use | Ratio | Needs | Result |
| --- | --- | --- | --- | --- | --- |
| `ink` #3a2414 | `parch` #e7d6ad | body text on parchment | 10.14:1 | 4.5:1 | pass |
| `ink` #3a2414 | `parchLo` #dcc394 | body text on shaded parchment | 8.51:1 | 4.5:1 | pass |
| `ink` #3a2414 | `parchHi` #f0e3c2 | body text on selected parchment | 11.42:1 | 4.5:1 | pass |
| `inkSec` #5e4129 | `parch` #e7d6ad | secondary text, captions, disabled reasons | 6.46:1 | 4.5:1 | pass |
| `inkSec` #5e4129 | `parchLo` #dcc394 | secondary text on shaded parchment | 5.42:1 | 4.5:1 | pass |
| `inkGood` #33581d | `parch` | gains, better stat | 5.72:1 | 4.5:1 | pass |
| `inkBad` #8f2818 | `parch` | losses, errors, alerts only | 5.88:1 | 4.5:1 | pass |
| `inkGold` #5e3f00 | `parch` | reward gold amount | 6.69:1 | 4.5:1 | pass |
| `inkXp` #1f4f7a | `parch` | experience | 5.95:1 | 4.5:1 | pass |
| `inkPremium` #56389a | `parch` | Drachmae amount | 6.02:1 | 4.5:1 | pass |
| rarity inks (common … legendary) | `parch` | item names | 5.72–6.63:1 | 4.5:1 | pass |
| `rarLegendary` #6e4600 | `parchLo` | legendary on shaded parchment | 4.84:1 | 4.5:1 | pass |
| `cream` #fdf3de | `terra` #a8432c | primary button label | 5.44:1 | 4.5:1 | pass |
| `cream` | `bronze` #7d5b30 | secondary / neutral button label | 5.59:1 | 4.5:1 | pass |
| `cream` | `wine` #5e1a28 | destructive button label | 11.52:1 | 4.5:1 | pass |
| `cream` | `purchase` #1b6fa3 | real-money button label | 4.95:1 | 4.5:1 | pass |
| `cream` | `teal` #1f4f52 | title plaque | 8.29:1 | 4.5:1 | pass |
| `cream` | `tabBar` #16333a | tab label | 12.14:1 | 4.5:1 | pass |
| `cream` | `alert` #b3261e | alert badge count | 5.93:1 | 4.5:1 | pass |
| `cream` | `stone2` #342d25 | text on dark stone bars | 12.31:1 | 4.5:1 | pass |
| `gold` #e6c885 | `stone1` #26211b | gold title on the dark frame | 9.85:1 | 4.5:1 | pass |
| `gold` | `teal` | gold title on the plaque | 5.64:1 | 4.5:1 | pass |
| `offText` #e4ddd0 | `off` #5f5a53 | disabled button label (still readable) | 5.06:1 | 4.5:1 | pass |
| `cream` | `group1–4` | group numerals | 5.36–8.17:1 | 4.5:1 | pass |
| `terra` / `bronze` / `off` | `parch` | button edge on parchment | 4.17 / 4.29 / 4.76:1 | 3:1 | pass |
| `parch` | `page` | card on the basalt page | 12.97:1 | 3:1 | pass |
| `parchEdge` #5a3d22 | `parch` | card inked edge, dividers | 6.88:1 | 3:1 | pass |
| `alert` | `parch` | alert badge on parchment | 4.55:1 | 3:1 | pass |
| `cream` ring | `stone2` | alert badge on stone (red on stone alone is 2.08:1, **fail**, hence the ring) | 12.31:1 | 3:1 | pass |

Two values move from today's tokens:
- `offText` goes from #d6cebf to #e4ddd0, so a disabled label stays readable.
- `group1–4` are new.

The other tokens equal `MOSAIC` in `src/ui/tokens.ts`.

### 4.4 Area temperature

| Area | Temperature |
| --- | --- |
| Hubs | Warm, neutral light |
| Duels | Warm, dark (dusk) |
| War | Cool-neutral |
| Map | Cream and lavender |
| Battle | Olive and straw |
| Codex plates | Dark ground with a warm key light |

The **UI palette** (above) and the **world palette** PA-WORLD (§8.5) are separate. The UI never samples world colours, except the shared team red, which belongs only on shields and standards.

### 4.5 Colourblind safety

| Colour pair at risk | Backup cue |
| --- | --- |
| Red alert vs green gain (protan/deutan) | Alerts are badges with a count or a glyph; gains show "+" and an up arrow. |
| Rarity (5 inks) | A rarity gem or letter on the cell corner (audit G13); never the frame colour alone. |
| Group I–IV colours | Always shown with their Roman numeral. |
| Placement valid / invalid (cyan vs red) | ✓ / ✗ glyphs on the ghost. |
| HP vs morale bars | Labels in the expanded card, and different end caps. |
| Enabled vs disabled | Bevel, rim and shadow vs flat, plus a lock or reason line (§7.3); never hue alone. |
| Threat plates on the map | A threat icon. |

## 5. Character Design Direction

### 5.1 Archetype

There is no single player character. **The strategos is whoever leads the warband**, and the profile card shows that leader's class bust. `portrait_leader.jpg`, the same face for every leader, is retired. Nikias, the narrator, is the one fixed character: an old strategos with a white beard, a Corinthian helmet pushed up and a red cloak.

### 5.2 Telling classes apart at a glance (bust headgear plus prop)

| Role | Classes → identifying headgear / prop |
| --- | --- |
| levy | militia → felt cap, short spear |
| heavy | hoplite → Corinthian helm, red transverse crest · thureophoros → Boeotian helm, oval shield · celt_sword → Montefortino, moustache, torc · rhomphaia → tall Phrygian helm, long curved blade |
| ranged | archer → bare curly head, quiver strap · slinger → bare head, sling cord · javelineer → Thracian cap, two javelins · horse_archer → pointed felt hood, bow case |
| light | peltast → Thracian helm, crescent pelte · falx → long hair, two-handed falx · gallic → limed spiky hair, woad · fanatic → shaved head, ash, knife |
| cavalry | companion → Boeotian helm, purple-bordered cloak · thessalian → petasos hat · chariot → Persian tiara cap, reins |
| elite | royal_guard → gilded Thracian helm, white plumes · sacred_band → Boeotian helm, club emblem |
| beast | wolf · boar · bear → the animal's head and shoulders |

Two more cues run alongside the headgear:
- **Culture** shows in dress and grooming: Greek, Carthaginian and Celtic (`src/data/names.ts`).
- **Role colour** is shown by the portrait well (`addPortraitWell`), not painted into the bust.

### 5.3 Allies, enemies and beasts in the world (pixel)

- Team colour sits only on shields, crests and standards (ART_STYLE §9). Enemies get a purple-slate tint when engaged.
- Beasts are 3–6 times a man's height, and their silhouettes are not humanoid.

### 5.4 Expression and pose

- **Busts:** composed, alert, mouth closed, eyes to camera-left (toward the content). No grimaces, except the fanatic.
- **Nikias:** frames 2 (talk) and 3 (blink) are edits of frame 1.
- **World sprites:** see ART_STYLE §10.

### 5.5 Detail and distance (LOD)

| Art | Rule |
| --- | --- |
| Busts | Painted at 288 px and read at 21–46 UI px. Only the headgear, face mass and one prop survive, so no fine jewellery carries meaning. |
| World sprites | Fine detail only at 2x density (ART_STYLE §13b `fineDetail`). |

## 6. Environment Design Language

- **Architecture by culture**, in the painted vignettes and the frescoes:

  | Culture | Look |
  | --- | --- |
  | Hellenic | Whitewashed walls, terracotta roofs, Doric temples, olives |
  | Carthaginian | Flat-roofed ochre mudbrick, palms, a harbour with purple awnings |
  | Galatian | Round thatched houses, a timber palisade, oak woods |

  Today culture only shows in the settlement caption. The vignettes make it visible.
- **Texture philosophy.**
  - Menus are **fresco on plaster**: earth pigments (ochre, umber, terre verte, Egyptian blue used sparingly), visible brush texture, fine craquelure, soft edges. They are not photoreal, not 3D-rendered, and not glossy digital painting.
  - The world is pixel art with clustered tufts and dotted borders (ART_STYLE §5, §7).
- **Prop density.**

  | Art | Density |
  | --- | --- |
  | Vignettes | 3–5 readable props (walls, temple, trees, harbour) |
  | Frescoes | One action, 3–7 figures |
  | Beast plates | The beast alone, plus one ground cue |
  | Busts | No props beyond the class's one |

- **Storytelling without text.**
  - The fresco of each mode shows what the mode is: the march, the tower, the arena, the market, the siege camp.
  - The vignettes show who lives there.
  - Chest states (closed / open empty / open full) show reward state without a label.

## 7. UI/HUD Visual Direction

### 7.1 Diegetic or screen space

All screen-space. The chrome is the "carved stone and parchment" object: the meander frame, plaques and parchment cards. **The chrome stays procedural** (`src/art/mosaicUi.ts`, the V4 decision): it is sharp at every density, and its states come from tokens. The battle HUD moves to the same family (audit G7). The dark v3 dialogs are removed.

### 7.2 Typography

**Decision: two faces, bundled web fonts, rasterized to bitmap atlases. Cinzel is all caps only.**

**Faces**

| Face | Use | Case | Minimum |
| --- | --- | --- | --- |
| **Cinzel 700** (display) | Plaques, screen titles, button labels, tab labels, section headers | **ALL CAPS only** | 7 UI px (14 CSS) |
| Cormorant SC 700 | Cinzel's Cyrillic fallback (Cinzel has no Cyrillic) | caps | 7 UI px |
| **Inter 500** (text) | Body text, every number (tabular digits), hero names, card titles, captions | sentence case | **6.5 UI px (13 CSS)** for anything that carries meaning (audit G10) |
| Inter 600 *(proposed, one more @fontsource file)* | Hero names and card titles, which today are mixed-case Cinzel | sentence case | 7 UI px |

**Size scale** (kit units; 1 unit = 2 CSS px at the 390 reference)

| Role | Size |
| --- | --- |
| Display L | 10 (the screen plaque) |
| Display M | 8 (card titles in caps, primary buttons) |
| Display S | 7 (tabs, small buttons) |
| Body | 7 |
| Caption | 6.5 |
| Numbers | Same as their row, tabular |

Line height is 9/7 of the size. Negative line spacing is never allowed.

**Why caps-only Cinzel.** Every word split the audit found (G1: "Strat egos", "First st eps", "Duel s", "Spo il s", "Tit an", "Cycl ops") is **mixed-case Cinzel**. Caps Cinzel in the same pipeline renders clean ("CONTINUE THE MARCH", "PIXELARROW", the tab labels; checked on today's shots at DPR 1 and DPR 3). Measured on 2026-10-10 in Chromium with the bundled `cinzel-latin-700` font:
- The advance table in `src/art/fontMetrics.ts` matches `measureText`. For example, "Strategos" is 566 as a whole string and 566 as the sum of glyphs. Cinzel's lowercase kerning is within ±2/1000 em.
- So the **metrics are right, and the gaps come from the bitmap-atlas rendering path** (`renderVectorAtlas` per-glyph cells and clipping, and the BitmapText layout at K). That is a code story (open issue OI-1).
- The caps-only rule avoids the defect's visible cases today and is good typography anyway: Cinzel's lowercase is small caps, so title case in Cinzel reads as noise at 7 UI px.

**How to load (web font, rendered to bitmap).**
1. Bundle the woff2 files with `@fontsource` (already in `package.json`). Use no CDN: Telegram webviews and privacy.
2. Before any atlas is drawn, `await document.fonts.load(...)` for each face **and** assert `document.fonts.check(...)`. If the check fails, block the boot or retry; never rasterize a fallback face into the atlas.
3. Rasterize each face and colour once into a Phaser BitmapFont atlas at K = ceil(S) device px per UI px (`src/art/vectorFont.ts`). The text then costs no per-string texture and stays sharp on 3x phones.
4. Regression test (OI-1): render "Strategos", "First steps", "Duels", "Available" and "Cyclops" through BitmapText and through canvas `fillText` of the whole string, and compare the ink gaps between letters. Any gap wider than 0.15 em inside a word fails.

**Alternatives rejected**
- A pixel bitmap font. It clashes with the painted menus, its Cyrillic is weak, and its sizes are coarse.
- Phaser `Text` objects for everything. Each string is its own canvas texture, which costs memory and re-renders.

### 7.3 Frames, buttons and cards: enabled and disabled are never confused

| Element | Enabled | Pressed | Selected | Disabled |
| --- | --- | --- | --- | --- |
| **Button** (terra / bronze / wine / purchase) | Raised slab: 1 UI px light bevel top-left, 1 UI px gold rim, 1 UI px drop shadow; full-colour icon; cream label | Moves down 1 UI px; no shadow; fill 8% darker | — | **Flat** `off` grey: no bevel, no rim, no shadow; icon desaturated at 50%; label `offText`; **plus** a one-line reason under it in `inkSec`, or a lock glyph when there is no room. Never red. |
| **Tile** (stone / terracotta / glaze) | Bevel, engraved full-colour icon, Cinzel caps label | Down 1 px | — | Flat grey, faded icon, caption with the reason (the Camp tile today is right) |
| **Segment / filter / tab** | Parchment track, ink label | — | `parchHi` block **plus** a bronze rim **plus** a ✓ or underline (not a lighter fill alone, audit G13) | Faded label and lock |
| **Stepper (− / +)** | Both bronze (audit G2: never grey minus with bronze plus) | — | — | Grey only at the limit, with the value showing why |
| **Card** | Parchment, a 1 UI px `parchEdge` inked edge, 2 UI px radius | — | `parchHi` | — |
| **Sheet / modal** | A parchment sheet over a **45% `page` scrim**, one ✕ at top right. A footer "Close" only when there is no other action (G5). Nested modals replace the sheet content and are never stacked (G6). Never parchment inside parchment. | — | — | — |
| **Badge** | `alert` disc with a cream count and a **cream ring**. One per destination, only for something actionable (G11). | — | — | — |

**Frames**
- The **meander screen frame** (gold-ochre on dark stone, rosettes at the corners) is only around the screen.
- A **bronze riveted frame** (4 UI px) goes around frescoes and vignettes.
- A **bronze rim** goes on a role-colour well for portraits.
- The **stone arch** niche is for pixel figures (§8.6).

**Lint rule (for the UI story).** These fail review:
- an enabled `MButton` with the `neutral` variant;
- any red text on parchment that is not `inkBad` in an error, loss or alert context.

### 7.4 Iconography

- **Style:** painted, as in today's `public/icons/ui.png`.
  - A single object in a three-quarter view.
  - A heavy dark-brown outline (#2a1a12, about 2.5% of the cell).
  - Light from the upper left, with bronze, wood, cloth and stone materials.
  - Saturated only in the object's own colours. No background, no text, no frame.
- **Cell:** 160x160 px for new or regenerated icons. The object fills 88% of the cell and is centred, with room for the code's drop shadow.
- **Read test:** the silhouette must identify the icon at 24 device px (12 UI px on a 1x screen), in greyscale.
- **One meaning per icon** (the `RESERVED_ICONS` in `tokens.ts`):
  - Resources and modes never share an icon.
  - Food is wheat, never a heart (OAR-3).
  - Codex is a book; Campaign is a banner (MENU-3).
  - The War medallion carries an engraved crossed-spears-and-helmet glyph (MENU-2).
- **States** come from the chrome, not from recoloured icons. A disabled icon is desaturated to 50% and set at 60% opacity.
- **Vector instead of painted** for simple geometric symbols: ✓, ✗, chevrons, the info "i", rarity gems, plus and minus.

### 7.5 UI animation feel

Carved and weighty, never bouncy:

| What | Motion |
| --- | --- |
| Press | 60 ms |
| Sheets | Rise in 180 ms ease-out |
| Rewards | Get the only "burst" (glow plus count-up) |

Everything respects `motion()` and Reduce motion.

### 7.6 Art direction vs readability: conflicts and how they were decided

| Conflict | Decision |
| --- | --- |
| Cinzel's "roman" feel vs legibility in small mixed case | Cinzel caps only; names and long titles in Inter (§7.2) |
| An ornate painted frame for every button vs crisp states | The chrome stays procedural; only illustrations are painted |
| Painted busts vs per-hero variety (today every hero has its own rendered face) | Class busts (21 assets) beat 18 x N faces; variety returns through the culture-specific dress in the class prompt. **Director to confirm** (D-4) |
| Fresco texture behind text | Never: text sits on parchment or plaques, not on paintings |

## 8. Asset Standards

### 8.1 Engine facts these standards rest on (from the code)

| Fact | Value |
| --- | --- |
| UI unit | 1 UI px = S device px. `S = clamp(floor(min(Wcss/190, Hcss/400)), 2, 4) x RS`, with `RS = min(3, round(dpr x 4) / 4)` (`src/ui/kit.ts:46`, `src/platform/renderScale.ts`). |
| Phones | S = 2 x RS, up to **6 device px per UI px** on a 3x phone. Tablets and desktop can reach 12 (2x upscale accepted there). |
| `RS` can be fractional (2.75) | So **UI px are not whole device px**. Pixel art must be scaled in device px (§8.6). |
| Painted rasters | Loaded by `BootScene` from `RASTERS` (`src/ui/mosaic/raster.ts`) and cover-cropped into a canvas at w x K by `coverTexture`, smoothing on (≥128 px sources), LINEAR filter. |
| Icon atlases | `public/icons/ui.{png,json}` (64 px cells, 109 frames) and `items.{png,json}` (96 px cells, 189 frames), TexturePacker hash JSON. |
| Fonts | `@fontsource` web fonts rendered to BitmapFont atlases (§7.2). |

### 8.2 Resolution tiers

| Tier | Rule | Examples |
| --- | --- | --- |
| **Painted, standard** | Shipped px = largest on-screen slot in UI px **x 6**, so phones only ever scale down | fresco 1080x480, vignette 1032x420, bust 288, Nikias 384, plate 288, chest 288x272, laurel 160x216 |
| **Icon** | 160x160 cell (largest icon slot is 26.4 UI px = 158 device px) | `icon_book` |
| **Full-bleed** | x2 CSS (soft painting, full screen) | splash 780x1688 |
| **Pixel (world)** | Native art px, never resampled (§8.5) | 32x32 soldier canvas |

A painted source smaller than its tier is **regenerated, never upscaled**: `resizeArea` refuses. Example: today's `banner_campaign.jpg` is 1060x420, below the 1080x480 tier, and the pipeline rejects it.

### 8.3 Formats, budgets, folders

| Kind | Format | Budget | Folder |
| --- | --- | --- | --- |
| Opaque painted (fresco, vignette, bust, plate, portrait, splash) | JPEG q82 (macOS `sips`) | fresco ≤160 KB, vignette ≤130, bust ≤30, plate ≤35, Nikias frame ≤40, splash ≤220 | `public/ui/`, `public/ui/busts/`, `public/ui/beasts/` |
| Painted cutout with alpha (chest, laurel) | PNG-32 | ≤100 KB | `public/ui/` |
| Icons | Packed into an atlas PNG + JSON | atlas ≤ 2048 px wide, ≤ 4096 px tall | `public/icons/` |
| World pixel art | PNG-32 (binary alpha) or drawn in code | — | `public/world/` (new) or procedural |
| Raw generator output | As downloaded | — | `docs/v5/gemini/` |
| Processed, not yet shipped | PNG | — | `docs/v5/art/staging/` (git-ignored) |

The total menu art is about **2.2 MB** for the 56 assets in the list. Since `BootScene` preloads all of `RASTERS`, **busts and plates must load lazily per scene** (open issue OI-4).

### 8.4 Naming

`<category>_<subject>[_<variant>].<ext>`: lowercase snake case, ASCII, no size suffix (each file has one size, and the manifest records it).

- **Categories:** fresco, vignette, bust, portrait, plate, icon, chest, laurel, splash, frame, btn, plaque, tile, medal, crest, logo, reward, ui.
- **Examples:** `fresco_campaign.jpg`, `vignette_town_celtic.jpg`, `bust_sacred_band.jpg`, `portrait_nikias_blink.jpg`, `icon_book.png` (atlas frame `ui:book`).

This departs from the framework default `[category]_[name]_[variant]_[size]` because sizes live in `docs/v5/art/asset-manifest.json`. `scripts/art/check.mjs` enforces the pattern.

### 8.5 Pixel-art rules for world sprites

**Medium**
- True pixel art: every art pixel is one square of one colour.
- No anti-aliasing to the background (binary alpha).
- No gradients, no blur, no rotation, no sub-pixel placement.
- Sel-out outlines in the darker local colour, never black (ART_STYLE §3).
- 3–4 step hue-shifted ramps (ART_STYLE §4).

**Palette.** **PA-WORLD**, 35 colours, locked in `docs/v5/art/palette.json` › `world`:

| Group | Colours |
| --- | --- |
| Outlines | #2a1a12, #442618, #5e2427, #2e3e56 |
| Skin | #7b503d, #a87464, #dbac99, #f8d5c2 |
| Linen | #9c8b78, #d6c0a8, #e8e2d4 |
| Metal | #5a4a44, #836c65, #ac9283, #d2b68e |
| Bronze | #6a4a1e, #b08a3a, #e0c070 |
| Team red | #7a2a2e, #a12735, #cc7677 |
| Enemy slate | #3d5a78, #7a7a88 |
| Grass | #5b3f2a, #765d35, #9a8f3b, #bba96a |
| Foliage | #4a5a2e, #a8b46a |
| Sea | #5d4070, #ae8a9a |
| Map parchment | #978b81, #fde1c8 |
| FX | #d02030 (hit), #7fd0e0 (selection) |

A scene uses about 40 colours at most (ART_STYLE §6). `process.mjs` snaps pixel assets to PA-WORLD, and `check.mjs` fails any pixel outside it.

**Grid and exact sizes** (art px, the battle at `BATTLE_RES` 1x art scale)

| Thing | Canvas | Notes | Source |
| --- | --- | --- | --- |
| Infantryman | **32x32** | Figure 20–24 tall, feet on the bottom row, centred; shield 9–11; base plate 18x8 | measured (ART_STYLE §2) |
| Mounted (horse + rider), boar, bear | **48x48** | Feet on the bottom row | decided |
| Lair beast (hydra, cyclops, lion, minotaur, chimera, harpy flock) | **96x96** | — | decided |
| World boss (kraken, titan) | **160x128** | — | decided |
| Battlefield iso cell | 32x16 | Formations snap to it | measured |
| Map land tile | 20x20 | — | measured |
| Map settlement | town 50x44, village 28x22, lair 24x20 | Bottom-centre on the ground | `src/art/worldArt.ts` |
| Party / band figure | 24x22 | — | `worldArt.ts` |
| Menu pixel props (torch, pennant) | 7x14, 12x14 | — | `menuSprites.ts` |

**Generated pixel art**
- Gemini draws at about 8 screen px per art px on a **flat #FF00FF background** (no shadow on the background, no gradient, no ground plane).
- `process.mjs --kind pixel` then:
  1. keys out the magenta with a hard key;
  2. detects the block size;
  3. unscales;
  4. snaps to PA-WORLD;
  5. forces binary alpha;
  6. pads the result into the exact canvas, feet to the bottom.

  It is never scaled down to fit. Too big means regenerate.
- **#FF00FF is reserved for keying:** no PA-WORLD colour is near it.

**Animation frames** (ART_STYLE §10)
- Same canvas, same feet line, same palette across a strip.
- Frames laid left to right with no gap; the strip name ends in `_<anim>_<n>` (frame count).

### 8.6 Painted menu art and pixel world art side by side, without scaling artefacts

1. **Separate slots.** Painted art goes in painted slots (wells, frescoes, plates, reward modals). Pixel art goes only in **world windows**:
   - the map and the battlefield;
   - the Hero and Army **stone niches**;
   - the world encounter dialog.

   A pixel sprite is never cropped into a portrait well. That rule retires the headless MVP crop (RES-1).
2. **Pixel art scales by an integer in device px.** `scale = floor(slotDevicePx / spritePx)`, at least 1, with NEAREST filter. Snap the position to whole device px.

   Compute this in device px, not UI px: with RS = 2.75 a "3x UI" scale is 16.5 device px per art px and smears. If the niche is larger than the sprite at that scale, centre the sprite on the niche floor; never fill by fractional scaling.

   Today the Hero niche shows a 1x sprite in a large arch (HRO-2). The rule makes it the largest whole multiple that fits.
3. **Painted art only scales down, smoothed.** The source is at least slot x 6.

   When the downscale ratio is above 2, `coverTexture` must halve step by step (a mip chain) before the final draw. A single 6.8:1 `drawImage` (a 288 bust into a 21 UI px well at K=2) shimmers.

   Painted art has a floor of 16 UI px: below that, use an icon.
4. **No mixed-media frame.** Never put a pixel sprite on a painted backdrop, or a painted bust on a pixel backdrop. The niche floor (`renderStage`) is pixel and procedural, so it is a world window.
5. **The chrome is resolution-independent.** It is procedural at K, and the same for both media.
6. **Light agrees.** Both media are lit from the upper left, with shadows to the lower right.

## 9. Reference Direction

| Reference | Take | Avoid |
| --- | --- | --- |
| **Attic red- and black-figure vase painting** | Profile silhouette clarity; a restrained ochre, black and cream palette; figures as readable shapes on a plain ground (beast plates and busts read this way at 21 px) | Flat two-colour everywhere. Menus stay full-colour fresco. |
| **Minoan and Pompeian wall frescoes** (Knossos, the Villa of the Mysteries) | Plaster texture, craquelure, earth pigments, horizontal registers (the frescoes' band composition) | Faded, low-contrast passages. Our art must stay legible at phone size, so push value contrast in the focal area. |
| **Pixel Formation** (the battle reference, `docs/ART_STYLE.md`) | Iso battlefield techniques: base plates, the formation lattice, sel-out, tufted grass | Copying sprites, emblems or the logo (ART_STYLE's own rule) |
| **Darkest Dungeon (2016) portraits and UI** | Heavy inked silhouettes that survive tiny portrait sizes; one strong key light; dark grounds | The grimdark desaturation. We are warm and sunlit. |

---

## Open issues

| ID | Issue | Owner |
| --- | --- | --- |
| OI-1 | Cinzel mixed-case words split in the **bitmap-atlas rendering path**: the metrics are correct (measured). Find the cause in `renderVectorAtlas` / BitmapText at K, and add the 5-word test (§7.2). The caps-only rule hides it meanwhile. | UI tech story |
| OI-2 | No game concept or VISION yet: re-check §1–2 when `VISION.md` lands. | art-director |
| OI-3 | 101 legacy icons in `icons_ui` (64 px cells) blur above 10 UI px on 3x phones. Regenerate them at 160 px, as a batch with the T-ICON template. | assets agent |
| OI-4 | `BootScene` preloads every raster. With 56 menu assets, busts and plates must load per scene. `coverTexture` needs a mip chain (§8.6.3). | UI tech story |
| OI-5 | `src/art/sheetArt.ts` `GROUP_COLOR` (red group I) must move to `group1–4`. | battle UI story |
| OI-6 | Only `fresco_campaign` and 4 icons have a slot the game loads today. The other 51 assets need their `RASTERS` keys or atlas frames wired before `preview.mjs` can check them (it reports NOT ASSESSED until then). | UI stories |
| OI-7 | The 3 Nikias frames as painted edits may drift. If they do, use a single painted bust with a code-driven blink overlay. | assets agent |

## Not authored this run

None. All 9 sections are written. The AD-ART-BIBLE gate was skipped (lean review mode, V5-010).
