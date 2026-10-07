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

- **Formation drag faces the way you pull:** touch where the group should go,
  then pull. The soldiers face the direction the finger moves and the line is
  laid across that direction. A short pull mainly turns the group; a longer pull
  also deepens the block.

## Invariants (unchanged)

- `src/sim` stays pure and deterministic (fixed 20 Hz tick, seeded RNG, orders
  logged with their tick), so the server can re-run any battle.
- The economy in online mode is server-owned; the client never sets gold,
  items or territory directly.
- Old battle setups keep replaying (neutral defaults for new fields).

## Build order

1. Drag facing fix (small).
2. Battle terrain (in progress).
3. Unit classes, cavalry, art overhaul.
4. Online server foundations (in progress): server-owned armies, verified async
   attacks, garrisons, clans, duels, all scoped by `season_id`.
5. Hex shard world: hex generation, resources, marches, fog of war, forts and
   capitals, season lifecycle.
6. Beasts: lairs, boss battle mechanics, clan world bosses.
7. Town marketplace.
8. Offline tutorial and skirmish mode replacing the overland campaign.
