# Pixelarrow v2 design: seasonal hex war

Decisions from the design interview (2026-10-07). This document supersedes the
overland (Mount & Blade style) campaign as the main game. Where it conflicts
with DESIGN.md or ROADMAP.md, this document wins.

## Game structure

- **Main game: a shared, online, seasonal hex map.** Players start on a home hex,
  capture neighbouring hexes, join clans and expand.
- **Offline:** the overland campaign is retired as the main mode. Offline play
  becomes a tutorial plus skirmish battles against bots (and a sandbox for
  trying formations). The existing battle game, army and gear screens are reused.
- **Seasons:** 3 months. At the end of a season everything resets (map,
  territory, heroes, gear, resources) except cosmetics, titles/ranks, season
  rewards and Telegram Stars purchases.
- **Shards:** about 500 players per map shard (several thousand hexes). New
  shards open as players join. One Durable Object group per shard.

## Hex map

- **Pace:** real time. Armies march hex to hex and take real minutes to hours;
  actions are limited by march time and stamina/energy. Built for checking in a
  few times a day from Telegram.
- **Hex resources:** farmland (food), forest (wood), mines (iron/bronze for
  gear), towns (gold, recruits). Holding a mix matters.
- **Terrain → battlefield:** a hex's terrain (plains, hills, forest, river and
  ford, coast, rocks) becomes the battlefield, using the battle terrain system.
- **Forts and capitals:** fortified objective hexes with strong garrisons and
  big bonuses; holding capitals is the clan endgame and decides season ranking.
- **Fog of war:** players see hexes near their own territory and allies;
  scouting reveals more.
- **Neutral defenders: no free land.** Every unclaimed hex is held by neutral
  enemies that must be defeated in battle before the hex can be claimed. They
  vary by hex type and region:
  - Farmland: peasant militia and brigands.
  - Forest: wolf packs, wild boars, outlaw archers.
  - Hills and mountains: hill tribes with slingers and javelins, bears.
  - Coast: pirates and raiders from the sea.
  - Mines: deserter mercenaries guarding the shafts.
  - Towns: city hoplite garrisons with walls.
  - Ruins and shrines: cultists and fanatics.
  - Beast lairs: mythical beasts (see below).

  Strength scales with the hex tier and the distance from the shard's starting
  areas. Higher tiers need several victories in a row. Neutral defenders
  slowly return to hexes that are abandoned.
- **Garrisons:** an owned hex is defended by the garrison its owner left there.
  Attacks against it are async: the attacker fights the garrison under bot AI,
  and the server re-runs the battle from seed + order log before applying it.
- **Live duels:** friendly real-time duels between online players (lockstep on
  the deterministic sim).

## Mythical beasts

- **Beast lairs hold hexes:** Hydra, Minotaur, Nemean Lion, Cyclops, Harpy
  flocks, Chimera sit on valuable hexes, often near forts. Defeating them takes
  the hex and drops rare loot (legendary gear, trophies).
- **Real boss battles:** beasts fight on the battlefield as large multi-tile
  creatures with special mechanics, for example:
  - Hydra regrows heads unless they are finished quickly.
  - Cyclops throws boulders that scatter tight formations.
  - Harpies dive at ranged units and ignore the front line.
  - Nemean Lion is immune to arrows and javelins.
  - Minotaur charges through lines; Chimera breathes fire in a cone.
- **Clan raids on world bosses:** a few huge bosses per season (for example a
  Kraken on the coast, a Titan inland) with shared HP. Many clan attacks wear
  them down; loot is split by damage dealt.

## Clans

- Create and join through Telegram invite links (`startapp=clan_<code>`).
- Roles: leader, officer, member. Leaders and officers invite, kick and promote.
- Clan-owned shared territory; members can garrison clan hexes.
- Bonus for adjacent clan-owned hexes.

## Trading

- **Marketplace in towns:** players list gear and resources at a price in towns
  they can reach; others buy. The server holds items in escrow. A small tax on
  each sale acts as a gold sink. No direct player-to-player trades.

## Units and heroes

- **1 hero = 1 soldier**, with a **class** set by recruitment and gear. Army cap
  stays 20. Each class has its own perk tree.
- **Roster:**
  - Heavy infantry: Spartan hoplite (dory + aspis), thureophoros, Celtic
    swordsman, Thracian rhomphaia warrior.
  - Ranged: Cretan archer, Rhodian slinger, peltast javelineer, Scythian horse
    archer.
  - Light/shock melee: peltast, Thracian falx warrior, Gallic warband, fanatic.
  - Cavalry and elites: Companion cavalry, Thessalian horse, chariot, plus elite
    units (royal guard, Sacred Band).
- Cavalry needs mounted movement, charge momentum, and vulnerability to braced
  spears in the sim.

## Art direction

- Gritty, more realistic look, close to the reference screenshots.
- Bigger soldiers: about 32–40 px tall (currently about 24 px), realistic
  proportions (no big heads).
- Muted bronze, crimson and earth palette; softer outlines; shading on muscle
  and armour; dust, blood and wear.
- Each class reads clearly from its silhouette: helmet crest, shield shape,
  weapon length, and horse.
- All art stays procedural, using the documented layer format, so hand-drawn
  sheets can replace it later.

## Controls

- **Formation slingshot (supersedes "face the way you pull"):** press on or next
  to the selected group (or its placement marker), drag to where it should
  stand, then pull BACK. The soldiers face away from the finger, like aiming a
  slingshot. Without lifting, pushing the finger sideways or forward stretches
  or narrows the line (width versus depth), with a live preview of placement
  boxes and a facing arrow.
- **Pan versus order:** a one-finger drag on empty ground always pans the
  camera. A formation drag only starts on or next to the selected group or its
  marker. A tap on the ground moves the group there. Two fingers zoom.

## UI

- **Battle command panel:** a grouped, colour-coded bar with fewer buttons
  visible at once:
  - Movement: bronze.
  - Attack: red.
  - Formation: blue.
  - Abilities: gold, with cooldowns.

  Icons are big and labels short; a long-press on any button explains it.
  Group cards show unit portraits, health and morale.
- **Items:** a distinct pixel icon for every item. Five rarity tiers: Common
  (grey), Uncommon (green), Rare (blue), Epic (purple), Legendary (gold). Each
  item has a coloured frame. Rare and above get a soft pulsing glow, and
  Legendary items add sparkles and also glow on the soldier in battle. Tap any
  item to see its stats.
- **Army and hero screen:** an RPG character sheet.
  - A big animated portrait wearing the hero's gear, with the equipment slots
    around it.
  - Stat bars with tooltips.
  - The class perk tree and abilities with icons.
  - Stars or rank, kills and battles.
- **Stash:** a grid inventory with item icons, rarity frames and glow.
  - Equip by tap or drag and drop.
  - A compare popup shows green and red stat changes.
  - Filters and sorting.
- **Post-battle report:**
  - An animated VICTORY or DEFEAT banner.
  - Icon tiles that count up: duration, kills, losses, gold and XP.
  - The hero of the battle (MVP), plus a row for each hero with XP bars,
    level-ups and wounds.
  - Loot revealed as cards opening one by one with their rarity glow; tap to
    inspect before picking.
- **Hex map: a map on a war table.**
  - A painted terrain board on a wooden table.
  - Raised hex tiles with thickness and shadows.
  - Miniature-style trees, mountains, towns, forts and armies.
  - Banners in clan colours.
  - Fog of war as drifting clouds or parchment.
  - Candle-light vignette, animated water, and smoke rising from towns.

## Invariants (unchanged)

- `src/sim` stays pure and deterministic (fixed 20 Hz tick, seeded RNG, orders
  logged with their tick), so the server can re-run any battle.
- The economy in online mode is server-owned; the client never sets gold,
  items or territory directly.
- Old battle setups keep replaying (neutral defaults for new fields).

## Build order

1. Drag facing fix (small).
2. Battle terrain (in progress).
3. Unit classes, cavalry, art overhaul (done; see DESIGN.md "Unit classes").
4. Online server foundations (in progress): server-owned armies, verified async
   attacks, garrisons, clans, duels, all scoped by `season_id`.
5. Hex shard world: hex generation, resources, marches, fog of war, forts and
   capitals, season lifecycle.
6. Beasts: lairs, boss battle mechanics, clan world bosses.
7. Town marketplace.
8. Offline tutorial and skirmish mode replacing the overland campaign.

## Monetization and economy

- **Stars buy only Drachmae.** Drachmae are the game's single premium
  currency, sold in Stars packs. Everything premium is priced in Drachmae, never
  directly in Stars:
  - cosmetics: shield emblems, banners, cloaks, clan flags, army skins and
    map-table themes;
  - the seasonal pass (free and paid tracks);
  - consumables, as a shortcut to gold.

  No direct power purchases: no gear or heroes for Drachmae.
- **Drachmae** are account-wide and tradeable between players. Marketplace
  listings can be priced in gold or Drachmae, and the game takes a 10% fee on
  every sale, which is removed from the economy. Drachmae never convert back
  to Stars, so there are no payouts to players. Check Telegram's current rules
  for Stars and digital goods before launch.
- **Consumables:** healing salves, morale wine, a war horn (a one-time rally),
  sharpening stones (+damage for one battle) and march rations (faster
  marches).
  - Bought with gold, or with Drachmae as a shortcut.
  - Daily cap per player.
  - At most one consumable per battle in PvP attacks and duels.

## Localization, audio and onboarding

- **Languages:** English and Russian, picked from the Telegram user's language
  and switchable in settings. All UI text goes through a translation table.
- **Audio:**
  - Procedural retro sound effects: clashes, shield hits, javelins, horns and
    UI clicks.
  - A few looping ancient-style music tracks (lyre and drums).
  - Volume and mute in settings; muted while Telegram is in the background.
- **Onboarding:** a skippable guided tutorial battle of 3–4 minutes with a
  narrator (select, slingshot formation, charge, shield wall, abilities),
  followed by a guided first hex capture online.

## Online battle rules

- **No pause online.** There is no pause, no auto-pause and no speed-up in any
  online battle (attacks on garrisons and neutrals, live duels). Offline
  battles (campaign, skirmish, tutorial) keep pause and auto-pause.
- **Timed preparation:** every online battle starts with a 15-second
  deployment phase with a visible countdown. Players see the enemy's deployment
  zone but not its final positions (in a duel the server holds back the
  opponent's deployment orders until the battle starts). The battle starts automatically when the
  timer ends; "Ready" from both sides starts it early.
- **Live movement on the hex map:** other armies inside your vision move live
  through the shard WebSocket, instead of only updating on refresh.
- **Possible later tuning:** if attacks feel too cheap, a won hex takes a few
  minutes to occupy (the army is exposed during that time), or armies get a
  longer rest after each battle.

## UX principles (hard requirements for every screen)

- **Everything fits.** No overlapping, clipped, cut-off or collapsing
  elements, and no text running outside its box. This must hold on small and
  large phones and inside Telegram's safe area.
- **Long content** uses one clear pattern per screen:
  - tabs for separate sections (for example Hero: Stats | Gear | Perks);
  - vertical scrolling lists with momentum and a visible scroll hint for long
    collections (roster, inventory, marketplace);
  - compact cards that expand on tap for details.

  Never shrink text or buttons to make content fit.
- **Readable:** pixel text at its native integer scale; at least about 8 px
  base font times the UI scale. Text that might not fit gets a short form,
  wraps to a fixed number of lines, or ends in "…" with the full text on tap.
  It never overflows.
- **Touch targets:** at least about 44 × 44 pt, with at least 4 pt of spacing.
  The most important actions are reachable by thumb at the bottom of the
  screen.
- **Clear hierarchy:** one primary action per screen (filled, red); secondary
  actions are outlined; destructive actions ask for confirmation. Use
  consistent icons and colour meanings everywhere (rarity colours, the battle
  panel's category colours).
- **Feedback:** every tap gives an immediate visual press state, a sound and a
  haptic. Loading and disabled states are visible, and a disabled button says
  why on tap. Empty states explain what to do next.
- **Discoverable:** a long-press on any icon or button shows a tooltip. Show a
  first-time hint once per screen.
- **Automated checks:** every screen is tested in Playwright at 320 × 568
  (small), 375 × 667, 390 × 844, 430 × 932 and 360 × 780 (Android), with and
  without the Telegram safe-area insets. A layout check fails CI when:
  - interactive elements overlap;
  - text overflows its container or is clipped;
  - an element falls outside the safe area;
  - a touch target is below the minimum size.

  Each scene exposes its UI element bounds for the check, for example through a
  debug registry. Screenshots of every screen and size are saved for review.

## Economy decisions (2026-10-07)

- At most one consumable per battle in **all** online battles: PvP, neutrals,
  beasts and world bosses.
- The premium season pass (500 Dr) returns about **600 Dr** over its tiers, so
  a full season pays for the next pass.
- `supporter_banner` is no longer a Stars product. It becomes a normal
  cosmetic priced in Drachmae; players who already bought it keep it.
- Unchanged:
  - daily caps count shop purchases only;
  - no marketplace listing fee, only the 10% sale fee;
  - buyers can buy anywhere in their shard, but listing an item needs a
    reachable town.
