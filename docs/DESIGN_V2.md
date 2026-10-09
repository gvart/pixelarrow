# Pixelarrow v2 design: the seasonal online war

The online game: a shared, seasonal war map. Where it conflicts with
GAMEPLAY.md (the single-player core and the battle sim) or ROADMAP.md, this
document wins for online play. Duels are in DUELS.md.

## Game structure

- **Main game: a shared, online, seasonal war map.** Players start on a home
  region (their camp), capture neighbouring regions, join clans and expand.
- **Offline:** the overland campaign, the tutorial, skirmishes and the beast
  trial (GAMEPLAY.md). The battle game, army and gear screens are shared.
- **Seasons:** 3 months. At the end of a season everything resets (map,
  territory, heroes, gear, resources) except cosmetics, titles/ranks, season
  rewards and Telegram Stars purchases.
- **Shards:** about 150 players per shard (`ONLINE_RULES.shardCapacity`) on
  one hand-authored map of ~300 regions. New shards open as players join. One
  Durable Object per shard.

## Map

One hand-authored map per season, a graph of regions joined by routes (no
hexes). No backwards compatibility with the old hex shards. The first map is
the Western Mediterranean (`westmed`: Massalia, Iberia, the Balearics,
Sardinia and Corsica, Sicily, Carthage and the African coast, Etruria and
Latium).

- **Pace:** real time. Armies march region to region along routes that take
  real minutes; energy (100, +12/h) pays for marches (2 per route, at most 12
  routes a march) and attacks (10). Built for checking in a few times a day.
- **Regions** (`kind`): plots, towns, forts, capitals, beast lairs, trading
  posts and sea. Each has a tier 1-5 (defender strength and income), a
  battlefield site, an income mix (food, wood, bronze, gold, recruits) and
  season points (region 1, town 3, fort 10, capital 100). +10% income per
  adjacent region held by the same clan or player, up to +50%; income piles
  up for 24 h at most.
- **Terrain → battlefield:** a region's site (plains, hills, forest, river and
  ford, coast, rocks) becomes the battlefield.
- **Forts and capitals:** strong garrisons and big bonuses; holding capitals
  is the clan endgame and decides season ranking.
- **Fog of war:** players see regions within 2 routes of their own, their
  clan's land and their army (more with a watchtower).
- **Neutral defenders: no free land.** Every unclaimed region is held by
  neutrals that must be beaten first, by kind and terrain: farmland militia
  and brigands, forest wolves, boars and outlaw archers, hill tribes with
  slingers, javelins and bears, coastal pirates, deserter mercenaries, city
  hoplite garrisons, cultists, and mythical beasts in lairs. Strength scales
  with tier; losses re-raise after 6 h; neutrals return to abandoned land.
- **Garrisons:** an owned region is defended by the garrison its owner left
  there (up to 12). Attacks are async: the attacker fights the garrison under
  bot AI, and the server re-runs the battle from seed + order log before
  applying it.

### Data model

- `src/online/maps/<mapId>.json`, imported by the client and the Worker,
  validated by `src/online/mapSchema.ts`:
  `{id, version, cell, w, h, mask, terrain, regions[], edges[]}`. `mask` is
  the RLE of region ids on a hidden square grid; `terrain` the RLE of
  sea | shelf | sand | land | forest | hills | mountain | marsh.
- Region: `{id, name, kind, tier, site, spawn?, campPlot?, label: [x, y], revealPan?}`.
- Edge: `{a, b, minutes, naval?, waypoints: [[x, y]...]}` (the dotted route;
  ships cross the sea on `naval` edges between coastal regions).
- Authored in `maps-src/` and compiled by `scripts/buildMap.ts`; the
  validator checks connectivity, spawn count and fairness, and that edges
  touch both regions.

### Engine

- `src/online/world.ts`: `WorldGraph` (`info(id)`, `adjacent`, `neighbours`,
  `within(id, hops)`, `path(from, to, ok)`, `pos(id)`, `all()`), built from
  the map JSON. Every online rule uses it: attack adjacency, bosses, sight,
  live visibility, march paths, spawns, income and score, merchants, lairs,
  defenders, the demo shard, the coach.
- A location is an integer `loc` (region id). D1 keeps only regions whose
  state changed, keyed by `(season, shard, loc)`; a shard row records its
  `map_id`.

### Rendering

- Parchment ancient map (ART_STYLE.md §12 "World map"): cream parchment,
  lavender sea, sage land, parchment-cloud fog, dotted animated routes, a
  city reveal with a camera pan. The offline overland map uses the same look.
- Procedural (no image assets): terrain baked from the mask into chunked
  textures; fog erased per revealed region with a dissolve; armies and ships
  move smoothly along route waypoints (`src/scenes/online/regionMapView.ts`).

### Camp

- Every player's home region is their **camp**; up to 2 forward camps can be
  made on held regions marked `campPlot`, with the army standing there.
- Buildings: palisade, granary, forge, barracks, watchtower; levels 1-3, one
  construction at a time per camp; they add income, sight, garrison and
  militia. Resting at a camp restores energy and halves wounds (once per 4 h
  per camp). A camp lost in battle is razed.
- Rules in `src/online/rules.ts` (`CAMP_RULES`) and `src/online/camps.ts`;
  server in `server/src/online/camps.ts`; the same isometric `CampScene` as
  the offline field camp.

## Mythical beasts

- **Beast lairs hold regions:** Hydra, Minotaur, Nemean Lion, Cyclops, Harpy
  flocks, Chimera sit in lair regions, often near forts. Defeating one takes
  the region and drops its hoard (rare, epic or legendary gear) and a trophy
  entitlement; the beast returns 48 h after the region falls back to the
  neutrals.
- **Real boss battles:** beasts fight on the battlefield as large multi-tile
  creatures with special mechanics, for example:
  - Hydra regrows heads unless they are finished quickly.
  - Cyclops throws boulders that scatter tight formations.
  - Harpies dive at ranged units and ignore the front line.
  - Nemean Lion is immune to arrows and javelins.
  - Minotaur charges through lines; Chimera breathes fire in a cone.
- **Clan raids on world bosses:** a few huge bosses per season (for example a
  Kraken on the coast, a Titan inland) with shared HP. Many clan attacks wear
  them down; loot is split by damage dealt. Boss HP lives on the server;
  raids are verified 120 s segments (`server/src/online/bosses.ts`).
- **Sim** (`src/data/beasts.ts` `MYTHS` / `ENCOUNTERS`, `src/sim/myth.ts`
  `MythSystem`, created only when a beast is on the field, so a setup without
  one plays exactly as before): beasts are large animal units with HP per
  level, armour, missile resistance, a terror aura and a bot AI each. The
  hydra is a body and five heads that regrow unless the body is struck; the
  kraken is rooted at the shore with arms that drag men in. `npm run balance`
  (`src/dev/beastBalance.ts`) checks that a sensible army beats each beast
  about half the time and a naive one almost never.
- **Offline:** about one overland band in fourteen is a beast; the Beast
  trial (menu: Beasts) fights any beast or world boss with the campaign army.

## Clans

- Create and join through Telegram invite links (`startapp=clan_<code>`).
- Roles: leader, officer, member. Leaders and officers invite, kick and promote.
- Clan-owned shared territory; members can garrison clan regions.
- Bonus for adjacent clan-owned regions.

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

- **Formation drags (supersede the slingshot):** drag the selected group to
  move it (facing and shape kept); drag the bronze knob at the tip of its
  facing arrow to turn it in place toward the finger (snaps to the eight
  field directions). The formation shape comes only from the Formation
  buttons. Live preview of placement boxes and the facing arrow.
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
- **War map:** the parchment map of "Map" above, with miniature props and
  figures (`src/art/warTable.ts`), banners in clan colours and fog as
  parchment clouds.

## Invariants (unchanged)

- `src/sim` stays pure and deterministic (fixed 20 Hz tick, seeded RNG, orders
  logged with their tick), so the server can re-run any battle.
- The economy in online mode is server-owned; the client never sets gold,
  items or territory directly.
- Old battle setups keep replaying (neutral defaults for new fields).

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
  - Bought with gold, or with Drachmae as a shortcut, from the merchants on
    the war map (towns and trading posts, docs/DUELS.md "War-map shops on the
    map"); the menu shop keeps only the wallet, the pass and cosmetics.
  - Daily cap per player (all merchants together).
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
  narrator (select, drag to move, turn knob, charge, shield wall, abilities),
  followed by coach marks on the first online visit.

## Online battle rules

- **No pause online.** There is no pause, no auto-pause and no speed-up in any
  online battle (attacks on garrisons and neutrals, live duels). Offline
  battles (campaign, skirmish, tutorial) keep pause and auto-pause.
- **Timed preparation:** every online battle starts with a 15-second
  deployment phase with a visible countdown. Players see the enemy's deployment
  zone but not its final positions (in a duel the server holds back the
  opponent's deployment orders until the battle starts). The battle starts automatically when the
  timer ends; "Ready" from both sides starts it early.
- **Live movement on the map:** other armies inside your vision move live
  through the shard WebSocket, instead of only updating on refresh.
- **Possible later tuning:** if attacks feel too cheap, a won region takes a few
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
- **Readable:** body text at least 16 CSS px (size 7 at S = 2), smooth
  vector type (docs/UI_KIT.md "Type"). Text that might not fit gets a short form,
  wraps to a fixed number of lines, or ends in "…" with the full text on tap.
  It never overflows.
- **Touch targets:** at least about 44 × 44 pt, with at least 4 pt of spacing.
  The most important actions are reachable by thumb at the bottom of the
  screen.
- **Clear hierarchy:** one primary action per screen (filled, terracotta); secondary
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
  - daily caps count merchant purchases (docs/DUELS.md "War-map shops on the
    map");
  - no marketplace listing fee, only the 10% sale fee;
  - buyers can buy anywhere in their shard, but listing an item needs a
    reachable town.
