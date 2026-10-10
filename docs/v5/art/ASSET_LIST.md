# v5 menu-art asset list

Story S2-ART-BIBLE. Rules: `design/art/art-bible.md`. Pipeline: `docs/v5/art/ASSET_PIPELINE.md`. Prompt templates: `docs/v5/ASSET_LOG.md` › Templates.

The machine-readable source is `docs/v5/art/asset-manifest.json`. The tables below are generated from it by `node scripts/art/list.mjs`, so edit the manifest, not the tables. `scripts/art/check.mjs` fails if an ID is in the manifest but missing here.

## How this list was built

- **Only what the code has.** Every row names the slot in the current code (file:line) that shows it, from a survey of every place a menu screen draws an illustration, portrait, thumbnail, banner, reward or tab icon (2026-10-10, branch `v5` @ 82df08e). Nothing here is for a feature that does not exist. Assets for new v5 expansions are added later from their GDDs.
- **Sizes.** "Size px" is the shipped file. It is the largest on-screen slot in UI px times 6, the device pixels per UI px on a 3x phone (`S = 2 x RS`, `RS <= 3`; `src/ui/kit.ts:46`, `src/platform/renderScale.ts`). So the art is only ever scaled **down** on phones. The one exception, the full-screen splash, is noted in its row.
- **Painted, not pixel.** Every asset here is menu art, so it is painted (art bible §8). Pixel art stays on the map and the battlefield. Hero figures in the Hero and Army niches stay the game's own pixel sprites, at an integer scale (art bible §8.6): they need no new file.
- **Not wired.** "Preview" names the layout-check screens that show the asset today. Where it says "not wired", no code loads the file yet (new slot or new texture key): `scripts/art/preview.mjs` reports NOT ASSESSED and `promote.mjs` refuses. The wiring story adds the `RASTERS` key or atlas frame first.

## What is deliberately not on the list

| Thing in the code | Why there is no asset |
| --- | --- |
| Buttons, tiles, panels, the meander frame, plaques, the tab bar, the War medallion body, portrait wells, niches | The chrome stays procedural (`src/art/mosaicUi.ts`, the V4 decision): it is sharp at every density and its states come from tokens. §7 of the art bible gives the rules; the 9-slice tooling exists for any later raster chrome. |
| `modeArt` modes `beasts` and `online` | No caller in the code. |
| Lair vignette | `SettlementScene` never shows a lair: it bounces to World. |
| Clan crest or banner | The clan screen has no crest slot. The `clan_flag` cosmetics are drawn by `renderCosmeticHD`. |
| Cosmetics (emblems, banners, cloaks, crests, auras, poses, flags, skins, themes) | They are drawn in code from the server catalog (`src/ui/econ/textures.ts`). Painting them is a separate decision. |
| Leaderboard medals 1-3 | They are vector discs. The audit fix (DUE-3) is a colour change: the 3rd place goes from terracotta to bronze. |
| Rarity gems, ✓/✗ placement glyphs, info glyphs | Simple geometric symbols stay vector (create-game-assets: "prefer SVG/vector for simple geometric symbols"). `ui:info` already exists. |
| World encounter band figure, Hero and Army niches, battle HUD portraits | These are world pixel sprites shown at an integer scale (art bible §8.6), not menu illustrations. |
| `portrait_leader.jpg` | It is retired. The profile card shows the leader's class bust. |
| Logo lettering | Gemini cannot letter reliably (no text in any generated asset). The logo is set in Cinzel in code over `splash_keyart`. |
| The 101 other icons in `icons_ui` and the 189 in `icons_items` | They are kept as they are (64 and 96 px cells). Regenerating them at 160 px is open issue OI-3 in the art bible. Here only the 8 that are missing, wrong or visibly blurry. |

<!-- list:start -->
| Category | Assets |
| --- | --- |
| Frescoes (mode banners) | 5 |
| Settlement vignettes | 6 |
| Class busts | 21 |
| Narrator portrait | 3 |
| Beast plates | 8 |
| Icons (atlas icons_ui) | 23 |
| Reward art: chests | 3 |
| Reward art: laurels | 1 |
| Splash key art | 1 |
| **Total** | **71** |

### Frescoes (mode banners) (5)

| ID | File | Size px | Kind | Template | Subject | Slot in code | Preview |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ART-001 | `fresco_campaign.jpg` | 1080x480 | painted | T-FRESCO | hoplite column marching along a beach at dawn, ships beached behind, hills | MenuScene.ts:79 FrescoBanner: content width ~176 x (w/3.4..w/2.2) UI px, cover-cropped; keep the subject inside the central 3.4:1 band | menu |
| ART-002 | `fresco_ladder.jpg` | 1032x168 | painted | T-FRESCO | a stepped stone tower of trials with torches on each terrace, warriors climbing | DuelScene.ts:726 mode banner (Ladder tab): inner (w-8) x 28 UI px, ~6:1; replaces procedural modeArt "ladder" | not wired |
| ART-003 | `fresco_arena.jpg` | 1032x168 | painted | T-FRESCO | a stone arena with pennants, two champions facing each other, crowd on the tiers | DuelScene.ts:726 mode banner (Arena tab): inner (w-8) x 28 UI px, ~6:1; replaces procedural modeArt "arena" | not wired |
| ART-004 | `fresco_shop.jpg` | 1032x132 | painted | T-FRESCO | an agora market stall under a striped awning, amphorae, bronze goods, a merchant | ShopScene.ts:161 mode banner: inner (w-8) x 22 UI px, ~7.6:1; replaces procedural modeArt "shop" | not wired |
| ART-005 | `fresco_war.jpg` | 1032x432 | painted | T-FRESCO | rival armies encamped around a walled hill town, banners, smoke of camp fires | FirstRunScene.ts:73 "Online war" mode card (today icon only; card art to be wired, audit FR-3), 2.4:1 | not wired |

### Settlement vignettes (6)

| ID | File | Size px | Kind | Template | Subject | Slot in code | Preview |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ART-006 | `vignette_town_greek.jpg` | 1032x420 | painted | T-VIGNETTE | a walled town, Hellenic: whitewashed walls, terracotta roofs, a small Doric temple, olive trees | SettlementScene.ts:81 FrescoBanner (kind town, culture greek): inner (aw-8) x 70 UI px (~2.4:1), x 30 on short screens (cover-crop keeps the central band); replaces the upscaled map tile (audit SET-1) | not wired |
| ART-007 | `vignette_town_phoenician.jpg` | 1032x420 | painted | T-VIGNETTE | a walled town, Carthaginian: flat-roofed ochre mudbrick, palm trees, a harbour with purple awnings | SettlementScene.ts:81 FrescoBanner (kind town, culture phoenician): inner (aw-8) x 70 UI px (~2.4:1), x 30 on short screens (cover-crop keeps the central band); replaces the upscaled map tile (audit SET-1) | not wired |
| ART-008 | `vignette_town_celtic.jpg` | 1032x420 | painted | T-VIGNETTE | a walled town, Galatian: round thatched houses, a timber palisade, oak woods | SettlementScene.ts:81 FrescoBanner (kind town, culture celtic): inner (aw-8) x 70 UI px (~2.4:1), x 30 on short screens (cover-crop keeps the central band); replaces the upscaled map tile (audit SET-1) | not wired |
| ART-009 | `vignette_village_greek.jpg` | 1032x420 | painted | T-VIGNETTE | a small farming village, Hellenic: whitewashed walls, terracotta roofs, a small Doric temple, olive trees | SettlementScene.ts:81 FrescoBanner (kind village, culture greek): inner (aw-8) x 70 UI px (~2.4:1), x 30 on short screens (cover-crop keeps the central band); replaces the upscaled map tile (audit SET-1) | not wired |
| ART-010 | `vignette_village_phoenician.jpg` | 1032x420 | painted | T-VIGNETTE | a small farming village, Carthaginian: flat-roofed ochre mudbrick, palm trees, a harbour with purple awnings | SettlementScene.ts:81 FrescoBanner (kind village, culture phoenician): inner (aw-8) x 70 UI px (~2.4:1), x 30 on short screens (cover-crop keeps the central band); replaces the upscaled map tile (audit SET-1) | not wired |
| ART-011 | `vignette_village_celtic.jpg` | 1032x420 | painted | T-VIGNETTE | a small farming village, Galatian: round thatched houses, a timber palisade, oak woods | SettlementScene.ts:81 FrescoBanner (kind village, culture celtic): inner (aw-8) x 70 UI px (~2.4:1), x 30 on short screens (cover-crop keeps the central band); replaces the upscaled map tile (audit SET-1) | not wired |

### Class busts (21)

| ID | File | Size px | Kind | Template | Subject | Slot in code | Preview |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ART-012 | `bust_militia.jpg` | 288x288 | painted | T-BUST | a levy farmer-soldier, felt cap, plain tunic, short spear, no armour | every portrait well of a militia hero (addPortrait callers: profile card 40, recruit 30, roster 26, MVP 46, duel rows 21-26 UI px); also replaces portrait_leader.jpg on the profile card | not wired |
| ART-013 | `bust_hoplite.jpg` | 288x288 | painted | T-BUST | a Spartan hoplite, bronze Corinthian helmet with a red transverse crest, red cloak, bronze aspis rim at the shoulder | every portrait well of a hoplite hero (addPortrait callers: profile card 40, recruit 30, roster 26, MVP 46, duel rows 21-26 UI px); also replaces portrait_leader.jpg on the profile card | not wired |
| ART-014 | `bust_thureophoros.jpg` | 288x288 | painted | T-BUST | a thureophoros, bronze Boeotian helmet, linen tunic, oval thureos shield edge at the shoulder | every portrait well of a thureophoros hero (addPortrait callers: profile card 40, recruit 30, roster 26, MVP 46, duel rows 21-26 UI px); also replaces portrait_leader.jpg on the profile card | not wired |
| ART-015 | `bust_celt_sword.jpg` | 288x288 | painted | T-BUST | a Celtic swordsman, long moustache, bronze torc, checked cloak, iron Montefortino helmet | every portrait well of a celt_sword hero (addPortrait callers: profile card 40, recruit 30, roster 26, MVP 46, duel rows 21-26 UI px); also replaces portrait_leader.jpg on the profile card | not wired |
| ART-016 | `bust_rhomphaia.jpg` | 288x288 | painted | T-BUST | a Thracian rhomphaia warrior, tall Phrygian helmet, fox-fur cloak, long curved blade over the shoulder | every portrait well of a rhomphaia hero (addPortrait callers: profile card 40, recruit 30, roster 26, MVP 46, duel rows 21-26 UI px); also replaces portrait_leader.jpg on the profile card | not wired |
| ART-017 | `bust_archer.jpg` | 288x288 | painted | T-BUST | a Cretan archer, bare head with short curly hair, leather quiver strap, light tunic | every portrait well of a archer hero (addPortrait callers: profile card 40, recruit 30, roster 26, MVP 46, duel rows 21-26 UI px); also replaces portrait_leader.jpg on the profile card | not wired |
| ART-018 | `bust_slinger.jpg` | 288x288 | painted | T-BUST | a Rhodian slinger, bare head, sling cord wound round the wrist, pouch of stones, plain tunic | every portrait well of a slinger hero (addPortrait callers: profile card 40, recruit 30, roster 26, MVP 46, duel rows 21-26 UI px); also replaces portrait_leader.jpg on the profile card | not wired |
| ART-019 | `bust_javelineer.jpg` | 288x288 | painted | T-BUST | a peltast javelineer, Thracian cap, two javelins over the shoulder, crescent pelte | every portrait well of a javelineer hero (addPortrait callers: profile card 40, recruit 30, roster 26, MVP 46, duel rows 21-26 UI px); also replaces portrait_leader.jpg on the profile card | not wired |
| ART-020 | `bust_horse_archer.jpg` | 288x288 | painted | T-BUST | a Scythian horse archer, pointed felt hood, patterned kaftan, gorytos bow case | every portrait well of a horse_archer hero (addPortrait callers: profile card 40, recruit 30, roster 26, MVP 46, duel rows 21-26 UI px); also replaces portrait_leader.jpg on the profile card | not wired |
| ART-021 | `bust_peltast.jpg` | 288x288 | painted | T-BUST | a peltast, Thracian helmet, crescent wicker pelte shield, light tunic | every portrait well of a peltast hero (addPortrait callers: profile card 40, recruit 30, roster 26, MVP 46, duel rows 21-26 UI px); also replaces portrait_leader.jpg on the profile card | not wired |
| ART-022 | `bust_falx.jpg` | 288x288 | painted | T-BUST | a Dacian falx warrior, bare head, long hair, wool cloak, two-handed curved falx over the shoulder | every portrait well of a falx hero (addPortrait callers: profile card 40, recruit 30, roster 26, MVP 46, duel rows 21-26 UI px); also replaces portrait_leader.jpg on the profile card | not wired |
| ART-023 | `bust_gallic.jpg` | 288x288 | painted | T-BUST | a Gallic warband warrior, limed spiky hair, bare chest, blue woad marks, long oval shield edge | every portrait well of a gallic hero (addPortrait callers: profile card 40, recruit 30, roster 26, MVP 46, duel rows 21-26 UI px); also replaces portrait_leader.jpg on the profile card | not wired |
| ART-024 | `bust_fanatic.jpg` | 288x288 | painted | T-BUST | a wild-eyed fanatic, shaved head, ash smeared on the face, torn tunic, raised knife | every portrait well of a fanatic hero (addPortrait callers: profile card 40, recruit 30, roster 26, MVP 46, duel rows 21-26 UI px); also replaces portrait_leader.jpg on the profile card | not wired |
| ART-025 | `bust_companion.jpg` | 288x288 | painted | T-BUST | a Macedonian Companion cavalryman, bronze Boeotian helmet, purple-bordered cloak, muscled cuirass | every portrait well of a companion hero (addPortrait callers: profile card 40, recruit 30, roster 26, MVP 46, duel rows 21-26 UI px); also replaces portrait_leader.jpg on the profile card | not wired |
| ART-026 | `bust_thessalian.jpg` | 288x288 | painted | T-BUST | a Thessalian horseman, wide-brimmed petasos hat over a bronze helmet, short chlamys cloak pinned at the shoulder | every portrait well of a thessalian hero (addPortrait callers: profile card 40, recruit 30, roster 26, MVP 46, duel rows 21-26 UI px); also replaces portrait_leader.jpg on the profile card | not wired |
| ART-027 | `bust_chariot.jpg` | 288x288 | painted | T-BUST | a scythed-chariot driver, Persian tiara cap, scale armour, reins in hand | every portrait well of a chariot hero (addPortrait callers: profile card 40, recruit 30, roster 26, MVP 46, duel rows 21-26 UI px); also replaces portrait_leader.jpg on the profile card | not wired |
| ART-028 | `bust_royal_guard.jpg` | 288x288 | painted | T-BUST | a royal guardsman, gilded Thracian helmet with white plumes, silver-faced aspis rim, scale cuirass | every portrait well of a royal_guard hero (addPortrait callers: profile card 40, recruit 30, roster 26, MVP 46, duel rows 21-26 UI px); also replaces portrait_leader.jpg on the profile card | not wired |
| ART-029 | `bust_sacred_band.jpg` | 288x288 | painted | T-BUST | a Theban Sacred Band hoplite, Boeotian helmet, club emblem on the shield rim, linothorax | every portrait well of a sacred_band hero (addPortrait callers: profile card 40, recruit 30, roster 26, MVP 46, duel rows 21-26 UI px); also replaces portrait_leader.jpg on the profile card | not wired |
| ART-030 | `bust_wolf.jpg` | 288x288 | painted | T-BUST-BEAST | a grey wolf, head and shoulders, ears up, amber eyes | every portrait well of a wolf hero (addPortrait callers: profile card 40, recruit 30, roster 26, MVP 46, duel rows 21-26 UI px); also replaces portrait_leader.jpg on the profile card | not wired |
| ART-031 | `bust_boar.jpg` | 288x288 | painted | T-BUST-BEAST | a wild boar, head and shoulders, bristling dark mane, curved tusks | every portrait well of a boar hero (addPortrait callers: profile card 40, recruit 30, roster 26, MVP 46, duel rows 21-26 UI px); also replaces portrait_leader.jpg on the profile card | not wired |
| ART-032 | `bust_bear.jpg` | 288x288 | painted | T-BUST-BEAST | a brown bear, head and shoulders, heavy brow, open mouth | every portrait well of a bear hero (addPortrait callers: profile card 40, recruit 30, roster 26, MVP 46, duel rows 21-26 UI px); also replaces portrait_leader.jpg on the profile card | not wired |

### Narrator portrait (3)

| ID | File | Size px | Kind | Template | Subject | Slot in code | Preview |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ART-033 | `portrait_nikias.jpg` | 384x384 | painted | T-BUST | Nikias, an old Greek strategos, white beard, bronze Corinthian helmet pushed up on the head, red cloak; mouth closed, eyes open | FirstRunScene.ts:100 (64 UI px) and tutorial narrator (32 UI px); replaces procedural renderNarrator. Frames 2 and 3 are EDITS of frame 1 (only the mouth or eyes change) | not wired |
| ART-034 | `portrait_nikias_talk.jpg` | 384x384 | painted | T-BUST | Nikias, an old Greek strategos, white beard, bronze Corinthian helmet pushed up on the head, red cloak; mouth open mid-word | FirstRunScene.ts:100 (64 UI px) and tutorial narrator (32 UI px); replaces procedural renderNarrator. Frames 2 and 3 are EDITS of frame 1 (only the mouth or eyes change) | not wired |
| ART-035 | `portrait_nikias_blink.jpg` | 384x384 | painted | T-BUST | Nikias, an old Greek strategos, white beard, bronze Corinthian helmet pushed up on the head, red cloak; eyes closed | FirstRunScene.ts:100 (64 UI px) and tutorial narrator (32 UI px); replaces procedural renderNarrator. Frames 2 and 3 are EDITS of frame 1 (only the mouth or eyes change) | not wired |

### Beast plates (8)

| ID | File | Size px | Kind | Template | Subject | Slot in code | Preview |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ART-036 | `plate_hydra.jpg` | 288x288 | painted | T-PLATE | the Lernaean Hydra, many serpent heads on long necks rising from a swamp | CodexScene.ts:35 / BeastTrialScene.ts:64 row thumbnail (16 UI px today, 32 after audit CDX-2) and the trial sheet header (encounter hydra) | not wired |
| ART-037 | `plate_cyclops.jpg` | 288x288 | painted | T-PLATE | a one-eyed Cyclops giant lifting a boulder | CodexScene.ts:35 / BeastTrialScene.ts:64 row thumbnail (16 UI px today, 32 after audit CDX-2) and the trial sheet header (encounter cyclops) | not wired |
| ART-038 | `plate_harpies.jpg` | 288x288 | painted | T-PLATE | three harpies diving, woman-headed birds with bronze talons | CodexScene.ts:35 / BeastTrialScene.ts:64 row thumbnail (16 UI px today, 32 after audit CDX-2) and the trial sheet header (encounter harpies) | not wired |
| ART-039 | `plate_nemean_lion.jpg` | 288x288 | painted | T-PLATE | the Nemean Lion, golden hide, massive mane, crouched to pounce | CodexScene.ts:35 / BeastTrialScene.ts:64 row thumbnail (16 UI px today, 32 after audit CDX-2) and the trial sheet header (encounter nemean_lion) | not wired |
| ART-040 | `plate_minotaur.jpg` | 288x288 | painted | T-PLATE | the Minotaur, bull-headed giant with a double axe, charging | CodexScene.ts:35 / BeastTrialScene.ts:64 row thumbnail (16 UI px today, 32 after audit CDX-2) and the trial sheet header (encounter minotaur) | not wired |
| ART-041 | `plate_chimera.jpg` | 288x288 | painted | T-PLATE | the Chimera, lion body, goat head on the back, serpent tail, breathing fire | CodexScene.ts:35 / BeastTrialScene.ts:64 row thumbnail (16 UI px today, 32 after audit CDX-2) and the trial sheet header (encounter chimera) | not wired |
| ART-042 | `plate_kraken.jpg` | 288x288 | painted | T-PLATE | the Kraken, giant tentacles rising from a stormy sea around a beach | CodexScene.ts:35 / BeastTrialScene.ts:64 row thumbnail (16 UI px today, 32 after audit CDX-2) and the trial sheet header (encounter kraken) | not wired |
| ART-043 | `plate_titan.jpg` | 288x288 | painted | T-PLATE | a Titan, a giant of the old gods made of stone and bronze, hurling two boulders | CodexScene.ts:35 / BeastTrialScene.ts:64 row thumbnail (16 UI px today, 32 after audit CDX-2) and the trial sheet header (encounter titan) | not wired |

### Icons (atlas icons_ui) (23)

| ID | File | Size px | Kind | Template | Subject | Slot in code | Preview |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ART-044 | `icon_book.png` (frame `ui:book`) | 160x160 | icon | T-ICON | a closed leather-bound codex with bronze corners and clasp | TabBar Codex tab (18 UI px); replaces the paw ui:beast on the tab (audit MENU-3) | not wired |
| ART-045 | `icon_banner.png` (frame `ui:banner`) | 160x160 | icon | T-ICON | a red cloth war banner with a bronze disc on a pole | TabBar Campaign tab (18 UI px); replaces the signpost ui:march on the tab (audit MENU-3) | not wired |
| ART-046 | `icon_war.png` (frame `ui:war`) | 160x160 | icon | T-ICON | two crossed spears behind a crested helmet, engraved bronze relief | War medallion glyph on the TabBar (audit MENU-2) | not wired |
| ART-047 | `icon_season.png` (frame `ui:season`) | 160x160 | icon | T-ICON | an hourglass wreathed in laurel | Duels Arena season line (audit DUE-7: grey placeholder disc today) | not wired |
| ART-048 | `icon_arena.png` (frame `ui:arena`) | 160x160 | icon | T-ICON | a stone arena seen from outside, arches and pennants | Duels search and Arena tab (audit DUE-6: blurry upscale today) | duel-ranked, duel-searching |
| ART-049 | `icon_helmet.png` (frame `ui:helmet`) | 160x160 | icon | T-ICON | a bronze Corinthian helmet with a red crest | Campaign hub Army tile (26.4 UI px: the 64 px cell blurs) | menu |
| ART-050 | `icon_chest.png` (frame `ui:chest`) | 160x160 | icon | T-ICON | a wooden chest with bronze bands, closed | Campaign hub Stash tile (26.4 UI px) | menu |
| ART-051 | `icon_tent.png` (frame `ui:tent`) | 160x160 | icon | T-ICON | a canvas army tent with a pennant | Campaign hub Camp tile (26.4 UI px) | menu |
| ART-057 | `icon_doctrine_steady.png` (frame `ui:doctrine_steady`) | 160x160 | icon | T-ICON | a tortoise with a domed bronze-plated shell, walking steadily, head forward | Doctrine steady (ai-doctrines.md R2): encounter sheet doctrine row and battle top-bar doctrine chip (AI-01, WLD-01) | not wired |
| ART-058 | `icon_doctrine_rush.png` (frame `ui:doctrine_rush`) | 160x160 | icon | T-ICON | a ram's head with heavy curled horns, lowered to butt | Doctrine rush (ai-doctrines.md R2): encounter sheet doctrine row and battle top-bar doctrine chip (AI-01, WLD-01) | not wired |
| ART-059 | `icon_doctrine_hammer.png` (frame `ui:doctrine_hammer`) | 160x160 | icon | T-ICON | a heavy war hammer with a long wooden haft and a spiked bronze head | Doctrine hammer (ai-doctrines.md R2): encounter sheet doctrine row and battle top-bar doctrine chip (AI-01, WLD-01) | not wired |
| ART-060 | `icon_doctrine_swarm.png` (frame `ui:doctrine_swarm`) | 160x160 | icon | T-ICON | a single striped hornet with spread wings and a sting | Doctrine swarm (ai-doctrines.md R2): encounter sheet doctrine row and battle top-bar doctrine chip (AI-01, WLD-01) | not wired |
| ART-061 | `icon_doctrine_fury.png` (frame `ui:doctrine_fury`) | 160x160 | icon | T-ICON | a roaring lion's head with a flaming red-gold mane | Doctrine fury (ai-doctrines.md R2): encounter sheet doctrine row and battle top-bar doctrine chip (AI-01, WLD-01) | not wired |
| ART-062 | `icon_active_push.png` (frame `ui:push`) | 160x160 | icon | T-ICON | two level pike heads driving into an enemy round shield that tilts back | Signature active push, Push of Pike (abilities.md R3): ability medallion and Perks tab card (AB-02, F-04) | not wired |
| ART-063 | `icon_active_bond.png` (frame `ui:bond`) | 160x160 | icon | T-ICON | two forearms in bronze bracers, hands clasped at the wrist | Signature active bond, Sacred Bond (abilities.md R3): ability medallion and Perks tab card (AB-02, F-04) | not wired |
| ART-064 | `icon_active_warcry.png` (frame `ui:warcry`) | 160x160 | icon | T-ICON | a bearded warrior's head in side profile, shouting, with curved sound strokes from the open mouth | Signature active warcry, War-cry (abilities.md R3): ability medallion and Perks tab card (AB-02, F-04) | not wired |
| ART-065 | `icon_active_sunder.png` (frame `ui:sunder`) | 160x160 | icon | T-ICON | a curved falx blade splitting a round wooden shield | Signature active sunder, Sunder (abilities.md R3): ability medallion and Perks tab card (AB-02, F-04) | not wired |
| ART-066 | `icon_active_aimed.png` (frame `ui:aimed`) | 160x160 | icon | T-ICON | a drawn recurved bow with three arrows nocked together | Signature active aimed, Aimed Volley (abilities.md R3): ability medallion and Perks tab card (AB-02, F-04) | not wired |
| ART-067 | `icon_active_recharge.png` (frame `ui:recharge`) | 160x160 | icon | T-ICON | a horse's head turning, circled by a curved U-turn arrow | Signature active recharge, Wheel and Re-charge (abilities.md R3): ability medallion and Perks tab card (AB-02, F-04) | not wired |
| ART-068 | `icon_active_scythe.png` (frame `ui:scythe`) | 160x160 | icon | T-ICON | a spoked chariot wheel with a long curved scythe blade on its hub | Signature active scythe, Scythe Run (abilities.md R3): ability medallion and Perks tab card (AB-02, F-04) | not wired |
| ART-069 | `icon_standard.png` (frame `ui:standard`) | 160x160 | icon | T-ICON | an army standard: a pole with a crossbar, topped by a bronze sixteen-ray sun disc, two ribbons | The Standard (abilities.md R5): Raise the standard medallion, standard_bearer perk card, bearer badge (AB-03, F-04) | not wired |
| ART-070 | `icon_works.png` (frame `ui:works`) | 160x160 | icon | T-ICON | an iron-shod digging spade crossed with a sharpened wooden stake | Field works (field-works.md): the Works button and tray in deployment (FW-03) | not wired |
| ART-071 | `icon_captain.png` (frame `ui:captain`) | 160x160 | icon | T-ICON | a tall transverse red horsehair crest on its curved bronze holder, no helmet | Band captain (ai-doctrines.md R6): captain row of the encounter sheet and band plate crest (AI-02, WLD-01) | not wired |

### Reward art: chests (3)

| ID | File | Size px | Kind | Template | Subject | Slot in code | Preview |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ART-052 | `chest_closed.png` | 288x272 | cutout | T-CUTOUT | a closed wooden treasure chest with bronze bands and a lion-head lock, three-quarter front view | duelParts.ts:218 ChestSlot (16x13 UI), DuelScene.ts:975 (x2), :1039 opening (x3, 48 UI px); replaces CHEST_CLOSED pixel sprite (audit DUE-11) | not wired |
| ART-053 | `chest_open_empty.png` | 288x272 | cutout | T-CUTOUT | the same chest, lid open, empty inside (EDIT of chest_closed) | ChestSlot claimed state; Results spoils empty state (audit RES-4) | not wired |
| ART-054 | `chest_open_full.png` | 288x272 | cutout | T-CUTOUT | the same chest, lid open, heaped with gold coins (EDIT of chest_closed) | ChestSlot ready state; DuelScene.ts:1040 opening | not wired |

### Reward art: laurels (1)

| ID | File | Size px | Kind | Template | Subject | Slot in code | Preview |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ART-055 | `laurel_branch.png` | 160x216 | cutout | T-CUTOUT | a single gilded laurel branch curving upward, leaves in pairs (the left branch; the right is mirrored in code) | ResultsScene.ts:201 laurels beside the banner plaque (26x36 UI px max); replaces the pixel LAUREL grid (audit RES-2) | not wired |

### Splash key art (1)

| ID | File | Size px | Kind | Template | Subject | Slot in code | Preview |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ART-056 | `splash_keyart.jpg` | 780x1688 | painted | T-SPLASH | a hoplite phalanx with locked shields on a beach at dawn, seen from low, ships and a temple on the headland behind; empty sky in the top third for the logo | BootScene (audit BOOT-1) and FirstRun offer background (audit FR-1); full-bleed cover, 9:19.5, keep the subject in the central 320x568-CSS safe area. Exception to the x6 rule: x2 CSS (soft painting, full screen) | not wired |

<!-- list:end -->
