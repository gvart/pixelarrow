# Redesign v4 "Mosaic & Parchment" - Gemini brief

Style reference: `reference/00-home-style-b.png`. Current screens: `current/*.png` (390x844 @2x).

## Decisions (locked)

- Parchment content panels with dark ink text, framed by dark carved stone with a Greek-key (meander) border. Dark page background.
- Painted menus (frames, banners, portraits). The game world (battle, maps, unit sprites) stays pixel art.
- Type: Cinzel for titles, plaques and buttons. Inter for body text and numbers.
- Navigation: a bottom tab bar organized by mode: **Campaign · Duels · WAR (center, raised) · Codex · Shop**. Each mode tab is that mode's hub. Profile and settings sit in the top bar. Beasts move to Codex.
- One primary action per screen (terracotta). Real money stays blue.

## A. Screen mockups (send back 1 image per screen, portrait 9:19.5)

Use this prompt for each screen, with the current screenshot attached:

> Redesign this mobile game screen in the exact style of the attached reference (traditional antiquity, mosaic and parchment, carved stone frame with Greek-key border, parchment panels, terracotta primary button, bottom tab bar "Campaign, Duels, War, Codex, Shop" with War in the center and raised). Keep every piece of information and every action from the current screen. Use the same layout grid and the same component looks as the reference: profile card, plaque title, parchment cards, tile buttons. Real, readable English text only, no placeholder text. Pixel-art game sprites stay pixel art.

Priority order:

1. `menu.png` -> **Campaign hub** (Campaign tab selected): leader card (name, day, gold, trophies, warband), "First steps 2 of 4" onboarding card (disappears once done), painted fresco banner, Continue the march (opens the world map), 3 tiles: Army (roster, "!" badge when points are unspent), Stash (Army on the Stash tab), Camp (enabled only when a camp is pitched on the map; otherwise greyed with "Pitch camp on the map"). There are NO quests.
2. `duel-ladder.png` -> **Duels hub** (Duels tab selected): Glory chip, duel level, segmented Ladder | Arena, chest-ready tip, next-floor card (team points vs cap), chapter with 3 chests and 5 floor tiles with stars, locked chapters; actions Team (alert badge) and Shop; primary Fight floor 5.
3. `online.png` -> **War hub** (War tab selected; the hex map stays pixel art, restyle only the chrome around it): situation line + resources (gold, food, wood, bronze, energy); map actions Army, Collect (primary when income waits), Lobby (live duel challenges, badge), Clan, Home camp; hex panel with tier, yield/h, defenders and March / Attack / Merchant / Garrison.
4. `army.png` -> Army roster (no tab bar, back arrow in the top bar).
5. `shop-shop.png` -> Shop (Shop tab selected).
6. `results.png` -> Battle results (victory sheet).
7. `village.png` -> Settlement (Hire tab).
8. `battle-fight.png` -> Battle HUD (chrome only: top bar, group cards, order buttons).
9. *(new)* **Codex** (Codex tab selected): a list of Beasts, Units and Lore entries as illustrated cards.

## B. Assets (text-free, for the game itself)

Rules for every asset: **no text, no letters**. A flat **#FF00FF magenta background** wherever transparency is needed (we key it out). Front view, no perspective, even lighting from the top-left. Exact size as listed (or a 2x multiple).

| # | File name | Size (px) | What |
|---|---|---|---|
| 1 | `frame_stone.png` | 512x512 | Dark carved-stone frame with a gold-ochre Greek-key border, 64 px thick on every side, with a corner rosette in each corner. Magenta center. Must 9-slice: the middle of each edge repeats seamlessly. |
| 2 | `panel_parchment.png` | 256x256 | Light warm parchment panel, subtle fibres and stains, thin dark-brown inked edge 8 px in. Edges and center must stretch cleanly (no big stains near the edges). |
| 3 | `bg_basalt.png` | 512x512 | Dark warm basalt / tiny mosaic tesserae, very low contrast, **seamlessly tileable**. |
| 4 | `btn_terracotta.png` | 384x96 | Primary button: terracotta-red stone slab, carved bevel, thin gold rim. Magenta outside. |
| 5 | `btn_bronze.png` | 384x96 | Secondary button: aged bronze, same shape. |
| 6 | `btn_stone.png` | 384x96 | Neutral / disabled button: grey stone, same shape. |
| 7 | `plaque_title.png` | 512x112 | Title plaque: deep teal-blue stone with a gold rim and small Greek-key ends (as in the reference "PIXELARROW" plaque). |
| 8 | `tile_stone.png`, `tile_terracotta.png`, `tile_glaze.png` | 256x256 each | Square tile faces for shortcut tiles: grey carved stone / terracotta / teal glaze. Bevelled, magenta outside, empty center (we place the icon). |
| 9 | `banner_campaign.png` | 1024x384 | Ancient Greek wall-painting (fresco) on cracked plaster: hoplites marching along a coast at dawn. |
| 10 | `banner_war.png` | 1024x384 | Fresco: armies around a walled city, siege towers, banners. |
| 11 | `banner_duels.png` | 1024x384 | Fresco: two champions duelling in an arena, crowd. |
| 12 | `banner_codex.png` | 1024x384 | Fresco: a hydra / mythical beasts, scrolls. |
| 13 | `portrait_nikias.png` | 512x512 | Painted portrait of an old Greek strategos, white beard, Corinthian helmet with red crest, red cloak, bust, plain dark background. |
| 14 | `tabbar.png` | 1170x200 | Bottom tab bar background: dark carved stone strip with a thin gold top rim. No icons. |
| 15 | `tab_selected.png` | 200x200 | Selected-tab highlight: a parchment rectangle with a gold Greek-key frame. Magenta outside. |
| 16 | `tab_war_raised.png` | 260x260 | Raised center tab: a round bronze shield boss medallion, magenta outside, empty center. |

Generate the screen mockups (A1-A3) first. Once the Campaign hub is approved, the assets in B have to match it.
