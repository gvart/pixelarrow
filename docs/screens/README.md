# Pixelarrow - screen reference

Every screen of the app, captured at 390x844 (iPhone 14 size, 2x pixels), English, grouped by flow. Each section has a contact sheet in this folder (`NN-*.jpg`); a screen's number (e.g. `06.04`) is its label on the sheet. Individual full-size shots are not committed: regenerate them with `node scripts/layout-check.mjs http://localhost:5173/ --sizes 390x844 --langs en --insets plain --dpr 2` (they land in `shots/layout/`).

## The app in one paragraph

Pixelarrow is a mobile-first, portrait-only pixel-art formation-tactics game set in the ancient Mediterranean (Greeks, Celts, Carthaginians; myths). It runs as a Telegram Mini App and in the browser. Modes: an offline **campaign** (march a warband across a procedural coast, fight bandits, raise heroes), **Duels** (a persistent duel army: PvE ladder, live ranked PvP, async raids), the seasonal **online war** (shared hex map, clans, sieges, world bosses) and **Beasts** (mythical boss fights). Battles are real-time with pause, on an isometric pixel-art field, commanded by group orders and formations.

## Current visual language (for redesign briefs)

- **Theme "Bronze & Stone"**: dark warm-brown panels, bronze/gold borders and highlights, parchment for maps, small-caps serif titles (Cormorant SC) + Inter body text.
- **One primary action per screen** in terracotta red; selection is bronze; disabled is grey with a reason. Real-money (Telegram Stars) buttons are blue.
- **Chrome types**: *v3 screens* (Home, Duels, Hero, Shop, Settings, Beasts) use a header with title + currency chips + labelled icon actions; *Strategos screens* (World, Online map, Army) use a one-sentence situation bar on top and a 3-4 slot command strip at the bottom; Battle has its own HUD.
- **Tabs**: segmented (top level) > underline (sub level) > card pickers. Modals are bottom/centre sheets with dimmed backdrop.
- **Rarity colours** on item frames: common grey, uncommon green, rare blue, epic purple, legendary gold.
- Currencies: gold (campaign), war gold/food/wood/bronze/energy (online), Glory (duels), Drachmae (premium), Telegram Stars (real money).

## Navigation map

```
First run (offer / modes / reward) -> Tutorial battle -> Home
Home
 |- Continue the march -> World map -> Camp | Settlement (Hire/Buy/Sell/Rest) | Encounter -> Battle -> Results
 |     `- Party -> Army (Roster | Stash) -> Hero sheet (Stats | Gear | Perks | Skills)
 |- Duels -> Ladder | Arena  (+ Team, Shop full views; Raids, Leaderboards) -> Battle -> Results
 |- Online -> Join -> War map -> hex panel (March / Attack / Merchant / Garrison / Beast) ; Army ; Collect ; Clan ; Home camp
 |- Beasts -> Beast trial -> Battle
 |- Shop -> Shop | Pass | Wallet ; Marketplace (Browse | Mine | Sell)
 `- Settings -> Notifications | About | New campaign
```

## 01. Onboarding & Home

First launch and the home screen. The first-run flow is a mentor (Nikias, an old strategos) talking to the player over a grass backdrop; the home screen is the hub for every mode.

Contact sheet: [01-onboarding-home.jpg](01-onboarding-home.jpg)

| # | Screen | What it does |
|---|---|---|
| 01.01 | `first-run-offer` | First launch. Mentor portrait and speech bubble offer a ~3-minute tutorial battle. Primary: Tutorial (recommended); secondary: Skip. |
| 01.02 | `first-run-resume` | Returning player who abandoned the tutorial: mentor asks to pick it up. Primary: Resume tutorial; secondary: Skip. |
| 01.03 | `first-run-modes` | "Two ways to fight": explains the two main modes as cards - Campaign (offline march along the coast) and Online war (shared seasonal map, clans, live duels). Buttons: Online / Campaign. |
| 01.04 | `first-run-reward` | "Training complete": mentor hands out the tutorial reward (+60 gold and a Chalcidian helm item card). Primary: Continue. |
| 01.05 | `first-run-skip` | Confirmation dialog over the first-run screen: "Skip the tutorial? You can replay it any time from Settings." Stay / Skip. |
| 01.06 | `menu` | HOME. Top: game title over a live looping pixel skirmish of the player's own men. Save card: leader name, day, gold, trophies, warband size. One primary action (Continue the march), three mode tiles (Duels, Online, Beasts), utility row (Shop, Settings) and a 'First steps 2 of 4' checklist with progress bar. |
| 01.07 | `menu-settings` | Settings sheet: Audio (sound toggle, music/effects steppers), Language (Auto / English / Russian segmented), Battle pauses and numbers (damage numbers, auto-pause on first contact / flanked / group routs / hero death). |
| 01.08 | `menu-settings-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 01.09 | `menu-settings-notify` | Settings > Notifications: toggles for Telegram bot messages (attacks, marches, full treasury, duels, clan, world bosses, season end, market sales, quiet at night). |
| 01.10 | `menu-settings-about` | Settings > About: digital-goods notice and links to Terms of Service, Privacy Policy, Refund Policy. |
| 01.11 | `menu-settings-about-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 01.12 | `menu-reset` | Destructive confirm "New campaign?" listing exactly what is lost (warband, stash, gold, map) and what is kept (settings, Duels army, Glory, online war, Drachmae, looks). Cancel / Begin. |

## 02. Tutorial battle

A scripted first battle. Nikias appears as a narrator card and the UI spotlights exactly one control per step (gold focus ring, hand pointer). Each step is unlocked by doing it.

Contact sheet: [02-tutorial.jpg](02-tutorial.jpg)

| # | Screen | What it does |
|---|---|---|
| 02.01 | `tutorial-intro` | Tutorial step 1: deployment view (8 men, 2 groups, 11 foes). Narrator card at the bottom: raiders are coming. |
| 02.02 | `tutorial-select` | Step 2: the Phalanx group card is spotlighted; narrator says tap the card of your hoplites (I). |
| 02.03 | `tutorial-pan` | Step 3: hand-pointer animation teaches dragging one finger to pan the camera. |
| 02.04 | `tutorial-sling` | Step 4: drag the selected hoplites to the flag; they keep facing and formation. |
| 02.05 | `tutorial-fight` | Step 5: "Well placed! Now tap Fight!" - the Fight! button is spotlighted. |
| 02.06 | `tutorial-move` | Step 6: battle running but paused while the narrator talks; tap ground ahead to march there. Shows an ability medallion (Shield Bash) at the right edge. |
| 02.07 | `tutorial-wall` | Step 7: javelins incoming - tap Formation and pick Wall (shield wall). |
| 02.08 | `tutorial-loose` | Step 8: pick the slingers group (II) and tap Shoot. |
| 02.09 | `tutorial-skip` | Skip-tutorial confirmation over a tutorial step (Stay / Skip). |

## 03. Campaign: world map & field camp

Single-player campaign: a procedurally generated coast seen as a parchment map with fog; the party marches in real time. Camping opens an isometric pixel-art camp scene.

Contact sheet: [03-world-camp.jpg](03-world-camp.jpg)

| # | Screen | What it does |
|---|---|---|
| 03.01 | `world` | Campaign WORLD MAP. Situation bar: "Day 1, 08:00 - Road, safe. Tap the map to march, a town to enter." + gold, fit men, food, supplies. Parchment map with fog-of-war, the party token and the home town (Rhegion). Command strip: Menu, Camp, Party (with alert badge). |
| 03.02 | `world-encounter` | Encounter dialog at night on the world map: a band (Mercenaries, strong, 8 men, Galatae ~Lv 3) bars the way; shows your army strength, a risk warning and Attack / Flee 47% (chance). |
| 03.03 | `camp` | Isometric FIELD CAMP (detailed pixel art: tents, forge, fire, palisade). Top: day/time, location, purse; right rail: buildable structures with counts. Bottom: Muster, Loot, End day (primary), Strike camp. |
| 03.04 | `camp-place` | Placing a structure in camp: the build rail item is selected and the bottom changes to Cancel / Place. |
| 03.05 | `camp-muster` | "The muster" sheet: formation slots per class with +/- (e.g. Militia 6/6), then the roster list with each man's state (Formation / Resting). |
| 03.06 | `camp-muster-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 03.07 | `camp-temper` | "Temper gear" sheet at the camp forge: list of items per hero with the supply cost to upgrade. |

## 04. Campaign: villages & towns

Entering a settlement from the world map. One screen with a building illustration, the purse/headcount bar and tabs: Hire, Buy, Sell, Rest (villages only have Hire and Rest).

Contact sheet: [04-settlements.jpg](04-settlements.jpg)

| # | Screen | What it does |
|---|---|---|
| 04.01 | `village` | VILLAGE (Pylos): small illustration, gold and men count, tabs Hire / Rest. Volunteer cards: portrait, name, level, class, role tag (Levy, Ranged), one-line strength and price. 'New volunteers in 40h'. |
| 04.02 | `town-market` | TOWN (Rhegion) > Buy: shop list of weapons/armour with rarity colour, slot, key stat and gold price. |
| 04.03 | `town-market-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 04.04 | `town-recruits` | TOWN > Hire: richer volunteer pool (slinger, Thracian rhomphaia, falx, Cretan archer) with role tags (Ranged, Heavy infantry, Light/shock). |
| 04.05 | `town-recruits-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 04.06 | `town-recruit-card` | Recruit detail card: full-body sprite on a banner backdrop, role, pros/cons, stat bars (health, missile dmg, armour, speed, morale), attributes, Close / Hire 59. |
| 04.07 | `town-sell` | TOWN > Sell: filter chips (all, weapon, shield, helmet, armour, trinket), rarity/sort filters and the stash grid with rarity-coloured frames. |
| 04.08 | `town-rest` | TOWN > Rest: list of wounded with hours to heal; buy food/supplies, rest 8 hours, or pay the physician to heal all (primary). |

## 05. Army, hero sheet & stash

Managing the campaign warband ("Strategos" chrome: situation bar on top, command strip at the bottom) and the per-hero character sheet (paper-doll with gear slots, Stats / Gear / Perks / Skills tabs).

Contact sheet: [05-army-hero.jpg](05-army-hero.jpg)

| # | Screen | What it does |
|---|---|---|
| 05.01 | `army` | ARMY (campaign warband). Situation: who has points to spend, men/hurt/gold. Selected hero header (sprite, class, level, power, group I-IV selector, 5 gear slots). Roster | Stash tabs, filters, hero rows (portrait, level, class, stars, power, group badge, ! for points). Strip: Map, Sheet (primary), Dismiss. |
| 05.02 | `army-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 05.03 | `army-stash` | ARMY > Stash: filter chips and the item grid; green arrows mark upgrades for the selected hero. |
| 05.04 | `army-town-item` | Stash item COMPARE popup in a town: item card (rarity, condition, worth), side-by-side stat deltas vs the equipped item (green better / red worse), item stats, flavour text; Sell / Repair / Equip. |
| 05.05 | `hero` | HERO SHEET > Stats. Header (name, power), paper-doll with gear slots around a banner, pager 1/9, class and tags, XP bar. Tabs Stats/Gear/Perks/Skills with badges. STR/AGI/END/WIL with +/- and derived bars (health, damage...). |
| 05.06 | `hero-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 05.07 | `hero-gear` | HERO SHEET > Gear: stash grid filtered for this hero (upgrade arrows). |
| 05.08 | `hero-perks` | HERO SHEET > Perks: perk tree as a vertical list by level - available (gold) vs locked with requirement. |
| 05.09 | `hero-perks-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 05.10 | `hero-skills` | HERO SHEET > Skills: active abilities and auras with cooldown, description and unlock level. |
| 05.11 | `stash-compare` | Compare popup from the hero sheet: a legendary spear vs the equipped one with deltas; Equip. |
| 05.12 | `stash-detail` | Equipped item card (condition 55%): stats, flavour, Take off / Repair 11. |

## 06. Battle

The real-time tactics battle on an isometric pixel-art field. Top bar: pause/play, speed, clock, flee and the strength of both armies. Bottom sheet: group cards, formation chip and order buttons.

Contact sheet: [06-battle.jpg](06-battle.jpg)

| # | Screen | What it does |
|---|---|---|
| 06.01 | `battle-deploy` | BATTLE DEPLOYMENT. Top: Leave, men count (2 groups, 10 foes), Men. Banner 'Deploy vs Galatae - Beach'. Isometric field (river, beach, trees, rocks) with the formation and group numerals. Bottom: group cards (Phalanx, Skirmish, Reserve, Flank), Formation: Line chip, Reset, Fight! (primary). |
| 06.02 | `battle-deploy-formation` | Formation (shape) sheet during deployment: Line, Column, Wedge, Loose, Wall - each with a one-line meaning. |
| 06.03 | `battle-groups` | "Assign groups" modal: each hero with weapon and I/II/III/IV toggles. |
| 06.04 | `battle-fight` | BATTLE IN PROGRESS (paused). Top: Play, 1x speed, clock, Flee; strength bars 'You 95% vs 100% Foe'. Hint pill: 'Paused. Give orders, then tap Play.' Bottom: group cards, 'Orders - Phalanx I', Formation chip, order buttons Advance / Charge / Hold / Shoot / Back. |
| 06.05 | `battle-ring` | Battle with a group selected (order in force lit: Hold). |
| 06.06 | `battle-ring-soldier` | Battle with a single soldier selected: info strip (name, level, weapon, HP/MOR/STA bars) and the 'Alone' detach action. |
| 06.07 | `battle-shapes` | Formation sheet opened mid-battle. |
| 06.08 | `battle-retreat` | "Sound the retreat?" confirm: explains consequences (pursuit %, no spoils). Stay / Retreat. |
| 06.09 | `battle-online-deploy` | ONLINE ATTACK deployment: no pause; top shows seconds left to deploy with a draining bar; primary is Ready. |
| 06.10 | `battle-duel-deploy` | LIVE DUEL deployment: 'Both ready: the battle starts', Ready greyed after pressing. |
| 06.11 | `battle-online-fight` | Online battle running: Follow camera toggle instead of pause, 'Live' clock, hint 'Phalanx I holding. Contact soon.' |

## 07. Battle results

After-battle report with three tabs (Summary, Heroes, Spoils). Same screen is reused for campaign, online-war, ranked duel and raid results.

Contact sheet: [07-results.jpg](07-results.jpg)

| # | Screen | What it does |
|---|---|---|
| 07.01 | `results` | RESULTS > Summary: laurel 'Victory vs Galatae' header, tiles for time, kills, losses, +gold, +XP, 'Hero of the battle' card. Primary: Spoils. |
| 07.02 | `results-heroes` | RESULTS > Heroes: each hero with XP gained bar, kills, level-ups and wounds. |
| 07.03 | `results-spoils` | RESULTS > Spoils: 'Choose spoils 0/5' grid of loot cards (item, rarity, condition). Primary: Take spoils. |
| 07.04 | `results-spoils-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 07.05 | `results-inspect` | Loot item inspect: stat bars vs what the hero wears now; Close / Take. |
| 07.06 | `results-online` | Online-war result: 'Verified by the server', 'Hex taken!', level-up line. |
| 07.07 | `duel-ranked-result` | Ranked duel result: +Glory, +XP, rating change, promotion (Gold III). |
| 07.08 | `duel-raid-result` | Raid result: raid rating +16, duel XP. |

## 08. Mythical beasts

PvE boss fights against mythical beasts from Greek myth, each with its own mechanics and counter.

Contact sheet: [08-beasts.jpg](08-beasts.jpg)

| # | Screen | What it does |
|---|---|---|
| 08.01 | `trial` | BEAST TRIAL list: banner illustration, then cards per beast (Lernaean Hydra, Cyclops, Harpies, Nemean Lion, Minotaur, Chimera, Kraken, Titan) with sprite, level or 'World boss' tag and one-line mechanic. |
| 08.02 | `trial-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 08.03 | `trial-info` | Beast info sheet (Hydra): portrait on a stage, 'How it fights' bullets, 'Counter' advice in green, drops. Close / Fight it. |
| 08.04 | `battle-beast` | Battle against a beast (Cyclops) on a riverbank - same battle HUD. |

## 09. Duels: ladder, team & shop

Duels mode, part 1: a persistent duel army (separate from the campaign), a PvE ladder tower with chapters/stars/chests, team presets, recruitment and a Glory shop.

Contact sheet: [09-duels-ladder-team-shop.jpg](09-duels-ladder-team-shop.jpg)

| # | Screen | What it does |
|---|---|---|
| 09.01 | `duel-closed` | Duels when offline / not in Telegram: empty state 'Available in Telegram'. |
| 09.02 | `duel-ladder` | DUELS HUB > Ladder. Header: title, Glory chip, Team (alert) and Shop actions. Duel level chip, tower banner, Ladder | Arena segmented switch, chest-ready tip, next-floor card (team pts vs cap), farm Glory bar, chapter with 3 pixel chests and 5-floor tiles with stars, locked chapters. Primary: Fight floor 5. |
| 09.03 | `duel-ladder-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 09.04 | `duel-ladder-open` | Ladder with chapter 2 expanded (floor tiles 11-15 locked). |
| 09.05 | `duel-ladder-open-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 09.06 | `duel-floor` | Floor sheet: reward, your team vs enemy vs allowed points, star rules, enemy army list with class tags. Close / Fight. |
| 09.07 | `duel-floor-farm` | Replay of a cleared floor (farm Glory): same sheet with Farm action and daily farm limit. |
| 09.08 | `duel-chest` | Chapter chest popup: big pixel chest, +Glory, Collect. |
| 09.09 | `duel-chest-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 09.10 | `duel-chest-item` | Chapter chest with an item reward (rare helmet) plus Glory. |
| 09.11 | `duel-chest-item-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 09.12 | `duel-team` | DUELS > Team: hint who has points, 'Duel heroes: 7', Symbols legend, preset cards (Team 1, Wall, +), rename/duplicate/delete, 'Use for' chips (Ladder, Arena, Defence), points vs budget bar, hero rows with toggles, bench. Primary: Recruit. |
| 09.13 | `duel-team-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 09.14 | `duel-team-presets` | Team with 5 presets (cards row). |
| 09.15 | `duel-team-presets-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 09.16 | `duel-team-delete` | Delete preset confirm (heroes stay in roster). |
| 09.17 | `duel-team-delete-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 09.18 | `duel-recruit` | Recruit-a-hero sheet: class rows with points cost, role tag and Glory price; elite classes locked by duel level. |
| 09.19 | `duel-recruit-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 09.20 | `duel-dismiss` | Dismiss-a-hero sheet (bench only). |
| 09.21 | `duel-dismiss-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 09.22 | `duel-hero` | Duel hero sheet (same layout as campaign hero sheet) with Respec (40 Glory) and Dismiss. |
| 09.23 | `duel-hero-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 09.24 | `duel-shop-offers` | DUELS > Shop > Today: shop banner, Today/Gear/Sell underline tabs, timer to new offers, 'Compare with: best in team', offer cards (item, rarity, -20% badge, stat deltas vs the hero who'd use it, Buy). |
| 09.25 | `duel-shop-offers-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 09.26 | `duel-shop-gear` | Shop > Gear: slot filter chips and items by rarity with Glory prices. |
| 09.27 | `duel-shop-gear-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 09.28 | `duel-shop-sell` | Shop > Sell: stash grid with sell price on each cell. |

## 10. Duels: arena, raids & leaderboards

Duels mode, part 2: the Arena with live ranked/unranked PvP, async Raids against other players' defence teams, leaderboards and season rewards.

Contact sheet: [10-duels-arena.jpg](10-duels-arena.jpg)

| # | Screen | What it does |
|---|---|---|
| 10.01 | `duel-ranked` | DUELS > Arena: season line (days left, best). Live PvP card (league badge Silver I, won/lost, rewards, Find match primary, Unranked) and Raids card (Gold III, raids left today, defence team row, Raid, Log). 'Top' opens leaderboards. |
| 10.02 | `duel-ranked-locked` | Arena at duel level 1: Unranked only, plus a locked card 'Unlocks at Duel Lv 5' with progress bar. |
| 10.03 | `duel-searching` | Ranked matchmaking search: concentric rings around the colosseum icon, timer, search range bar, explanation, your lineup portraits, your league. Strip: Cancel. |
| 10.04 | `duel-searching-unranked` | Unranked search (wide range from the start). |
| 10.05 | `duel-found` | Opponent found: You (Silver I) vs Hektor (Gold III), 'Preparing the field...'. |
| 10.06 | `duel-raid` | RAIDS > pick a defender: your defence summary, three opponents labelled Easier / Even / Harder with league, men and points. Primary: Raid <name>; Log. |
| 10.07 | `duel-raid-locked` | Raids locked (unlock at duel level 5). |
| 10.08 | `duel-defence` | Defence team picker sheet: choose which preset a bot plays when others raid you. |
| 10.09 | `duel-raid-log` | Raid log: who raided you / whom you raided, won/lost, rating and Glory changes. |
| 10.10 | `duel-board-live` | Live leaderboard (Live | Legend tabs): podium medals, league crests, rating, your row pinned at the bottom. |
| 10.11 | `duel-board-live-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 10.12 | `duel-board-legend` | Legend leaderboard (top players by rating). |
| 10.13 | `duel-board-raids` | Raids leaderboard with league tags. |
| 10.14 | `duel-board-raids-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 10.15 | `duel-season-reward` | 'The season is over!' popup: peak league rewards (+Glory, banner/shield cosmetic) and earned title. Collect. |

## 11. Online war: map & hexes

The seasonal online war: a shared hex map of the western Mediterranean. Players hold hexes for hourly income, march their army (real minutes + energy), attack defenders, besiege towns, fight beast lairs and world bosses.

Contact sheet: [11-online-war-map.jpg](11-online-war-map.jpg)

| # | Screen | What it does |
|---|---|---|
| 11.01 | `online` | Online war unavailable (outside Telegram): 'Online unavailable' card with Back to menu. |
| 11.02 | `online-join` | 'Season war' join dialog explaining the shared hex map; Back / Join. |
| 11.03 | `online-map` | WAR MAP: situation bar ('Income is waiting on your hexes: tap Collect') with resources (gold, food, wood, bronze, energy). Pixel-art regional map with your home hex. Strip: Army, Collect (primary), Duels (badge), Clan. |
| 11.04 | `online-hex-neutral` | Hex panel - neutral land: tier, yield per hour, defenders and power; March 15m / Attack. |
| 11.05 | `online-hex-far` | Hex panel - a town out of reach: city garrison, siege progress 1/2, Merchant, Attack (off), March 11m. |
| 11.06 | `online-hex-own` | Hex panel - your hex: income waiting, no garrison; Collect / Garrison / March. |
| 11.07 | `online-hex-rival` | Hex panel - another player's home hex ([ARG] clan). |
| 11.08 | `online-hex-town` | Hex panel - a coastal town (Emporion) with merchant and siege. |
| 11.09 | `online-hex-market` | Hex panel - a big capital (Massalia, tier 5) with large garrison. |
| 11.10 | `online-hex-post` | Hex panel - a trading post (harbour) held by pirates. |
| 11.11 | `online-march` | Army marching: 'Marching - 10m' bar with Halt; the army token moves on the map. |
| 11.12 | `online-lobby` | 'Players online' lobby: challenge others to friendly duels (Challenge / Busy). |
| 11.13 | `online-challenge` | Incoming challenge popup: Decline / Fight. |
| 11.14 | `online-result` | Online battle result popup (siege wave, kills, gold, wounded, level-up, verified by server). |
| 11.15 | `online-lair` | Hex with a beast lair (Cyclops, tier 4): Attack / March / Beast info. |
| 11.16 | `online-lair-info` | Lair beast info sheet (Cyclops): how it fights, counter, drops. |
| 11.17 | `online-boss` | Hex with a world boss (Titan, HP 63%). |
| 11.18 | `online-boss-info` | World boss sheet: HP bar, top damage by player and clan, your damage, mechanics, counter; Raid it. |
| 11.19 | `online-boss-info-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 11.20 | `online-camp` | Online HOME CAMP: isometric camp with temple ruins, buildings rail (barracks, houses...). Bottom: Rest / Build. |

## 12. Online war: coach marks

First-visit coach marks on the war map: 7 steps, each dims the screen, highlights one element and explains it.

Contact sheet: [12-online-coach.jpg](12-online-coach.jpg)

| # | Screen | What it does |
|---|---|---|
| 12.01 | `online-coach-home` | Coach 1/7: 'Your home hex: your army starts here.' |
| 12.02 | `online-coach-neighbour` | Coach 2/7: 'Tap a hex next to yours.' |
| 12.03 | `online-coach-defenders` | Coach 3/7: every free hex has defenders - read who holds it. |
| 12.04 | `online-coach-march` | Coach 4/7: March takes real minutes and energy. |
| 12.05 | `online-coach-attack` | Coach 5/7: Attack - 15 s to place men, no pause online. |
| 12.06 | `online-coach-collect` | Coach 6/7: hexes yield gold and goods every hour - Collect. |
| 12.07 | `online-coach-clan` | Coach 7/7: join a clan. |

## 13. Online army & map merchants

The online army (separate from the campaign roster) and the merchants that sit in towns and trading posts on the war map.

Contact sheet: [13-online-army-merchants.jpg](13-online-army-merchants.jpg)

| # | Screen | What it does |
|---|---|---|
| 13.01 | `online-army-closed` | Online army error state: 'Something went wrong' with Retry. |
| 13.02 | `online-army` | ONLINE ARMY: header with war gold, food, energy; selected hero head with group selector and gear; Roster | Stash; hero rows with status (wounded, in battle, holds a hex). Strip: Recruit, Market, Shop, Map. |
| 13.03 | `online-army-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 13.04 | `online-army-stash` | Online army > Stash grid. |
| 13.05 | `online-army-recruit` | Recruit sheet: cost in war gold/food/recruits; class rows with role tags and + buttons. |
| 13.06 | `online-army-garrison` | Garrison picker: tap heroes to station them on a hex (0/12); Station. |
| 13.07 | `merchant-town` | MERCHANT in a town: banner, status lines (in reach, 10% clan discount, restock timer), sections Supplies and basic gear / Thracian goods / Rare today; each offer with daily limit, description and price in war gold or Drachmae. |
| 13.08 | `merchant-town-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 13.09 | `merchant-post` | HARBOUR trading post merchant out of reach (prices greyed, 'hold this hex or stand next to it'). |
| 13.10 | `merchant-post-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 13.11 | `merchant-buy` | Buy confirmation 'Buy Morale wine? Costs 72 war gold.' |
| 13.12 | `merchant-buy-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 13.13 | `merchant-item` | Merchant item card (epic Iron pilos): stats, flavour, 'Sold for war gold only'. |
| 13.14 | `merchant-item-scrolled` | Same screen scrolled to the end (shows the rest of the content). |

## 14. Shop, season pass, wallet & marketplace

Monetisation and economy: cosmetics shop for Drachmae (premium currency), the season pass, the wallet with Telegram Stars packs, and the player-to-player marketplace.

Contact sheet: [14-shop-pass-market.jpg](14-shop-pass-market.jpg)

| # | Screen | What it does |
|---|---|---|
| 14.01 | `menu-shop` | Shop loading state ('Opening the market...'). |
| 14.02 | `shop-shop` | SHOP > Shop: Drachmae balance in header, Shop | Pass | Wallet segmented tabs. Cosmetics grid: shield emblems, banners, clan flags, army looks, war tables (equipped/owned states, price). Consumables note. |
| 14.03 | `shop-shop-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 14.04 | `shop-cosmetic` | Cosmetic preview sheet (Pegasus emblem): big icon, category, price; Close / Buy 120. |
| 14.05 | `shop-cosmetic-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 14.06 | `shop-pass` | SHOP > Pass: season tier 7/30, pass XP bar, Need 500 Dr (premium) / Claim all; two-column Free vs Premium reward track with claim states. |
| 14.07 | `shop-pass-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 14.08 | `shop-wallet` | SHOP > Wallet: Drachmae balance, packs bought with Telegram Stars (bonus % and 'Best value' tag), legal links, transaction history. |
| 14.09 | `shop-wallet-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 14.10 | `consumable-picker` | 'Take a consumable?' sheet before a battle: one per battle (Morale wine, Sharpening stone); None / Take it. |
| 14.11 | `consumable-picker-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 14.12 | `market-browse` | MARKETPLACE > Browse (player-to-player): filters (All, Any coin, Newest), Find..., listing rows (item, seller, status, price in war gold or Drachmae), Show more. |
| 14.13 | `market-browse-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 14.14 | `market-detail` | Listing detail: item compare vs your hero, price, seller, town, fee. |
| 14.15 | `market-detail-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 14.16 | `market-goods` | Listing detail for goods (40x Bronze). |
| 14.17 | `market-goods-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 14.18 | `market-mine` | Market > Mine: your listings (expired / sold). |
| 14.19 | `market-sell` | Market > Sell: pick an item or goods stack from a grid. |
| 14.20 | `market-sell-form` | List-for-sale form: currency toggle, price stepper with allowed range, 10% fee and 'You get', town; Cancel / List. |

## 15. UI kit gallery (dev)

Developer gallery of the UI kit components (not reachable by players; useful as a design-system reference).

Contact sheet: [15-ui-kit.jpg](15-ui-kit.jpg)

| # | Screen | What it does |
|---|---|---|
| 15.01 | `kit-controls` | UI kit: buttons (primary, secondary, delete, disabled, badge), category colours, stat-compare bars, stat tiles, text overflow, expandable card, item row. |
| 15.02 | `kit-items` | UI kit: every item icon in every rarity frame. |
| 15.03 | `kit-items-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 15.04 | `kit-lists` | UI kit: virtualised list (500 rows) and empty state. |
| 15.05 | `kit-lists-scrolled` | Same screen scrolled to the end (shows the rest of the content). |
| 15.06 | `kit-v3` | UI kit v3: screen header, currency chips, tip lines, mode tiles (incl. locked), toggles, stepper, progress bar, locked feature card, pager, ghost/Stars buttons. |
| 15.07 | `kit-v3-scrolled` | Same screen scrolled to the end (shows the rest of the content). |

## Not captured

- **Clan screen** (create / invite / members / roles): needs a live server login, so it has no demo state to screenshot.
- Live, non-demo variants of online screens look the same as the demo-shard shots above.