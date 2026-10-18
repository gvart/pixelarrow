# Pixelarrow v2 design: the seasonal online war

The online game; wins over GAMEPLAY.md for online play. Duels: DUELS.md.

## Game structure

- Shared seasonal war map: start on a home region (camp), capture
  neighbours, join clans. Offline modes are in GAMEPLAY.md.
- **Seasons:** 3 months; all resets except cosmetics, titles, season rewards
  and Stars purchases.
- **Shards:** ~150 players (`ONLINE_RULES.shardCapacity`), one ~300-region
  map, one Durable Object each; new shards open as needed.

## Map

One hand-authored map per season: regions joined by routes. First map:
`westmed` (Western Mediterranean).

- **Pace:** real time; routes take real minutes. Energy 100, +12/h; march 2
  per route (max 12 routes), attack 10.
- **Regions** (`kind`): plot, town, fort, capital, lair, trading post, sea.
  Tier 1-5 (defender strength, income), a battlefield site (plains, hills,
  forest, river and ford, coast, rocks), an income mix (food, wood, bronze,
  gold, recruits), season points (region 1, town 3, fort 10, capital 100).
  +10% income per adjacent same-owner region, max +50%; accrues 24 h max.
  Capitals decide season ranking.
- **Fog:** regions within 2 routes of yours, clan land, your army (more with
  a watchtower).
- **Neutrals:** every unclaimed region has defenders by kind and terrain;
  strength scales with tier, losses re-raise after 6 h, they return to
  abandoned land.
- **Garrisons:** up to 12. Attacks are async under bot AI; the server re-runs
  from seed + order log before applying.

### Data model

- `src/online/maps/<mapId>.json` (client and Worker), validated by
  `src/online/mapSchema.ts`: `{id, version, cell, w, h, mask, terrain,
  regions[], edges[]}`. `mask` = RLE of region ids on a hidden square grid;
  `terrain` = RLE of sea | shelf | sand | land | forest | hills | mountain |
  marsh.
- Region: `{id, name, kind, tier, site, spawn?, campPlot?, label: [x, y], revealPan?}`.
- Edge: `{a, b, minutes, naval?, waypoints: [[x, y]...]}`; ships use `naval`
  edges between coastal regions.
- Source in `maps-src/`, compiled by `scripts/buildMap.ts`; the validator
  checks connectivity, spawn count and fairness, and edge endpoints.

### Engine

- `src/online/world.ts` `WorldGraph` (`info`, `adjacent`, `neighbours`,
  `within(id, hops)`, `path(from, to, ok)`, `pos`, `all`) from the map JSON;
  every online rule uses it.
- Location = integer `loc` (region id). D1 stores only changed regions,
  keyed `(season, shard, loc)`; a shard row records its `map_id`.

### Rendering

- Parchment map (ART_STYLE.md §12 "World map"), shared with the overland
  map. Procedural: terrain baked into chunked textures, fog dissolves per
  region, armies and ships follow waypoints (`src/scenes/online/regionMapView.ts`).

### Camp

- Home region = **camp**; up to 2 forward camps on held `campPlot` regions
  where the army stands.
- Palisade, granary, forge, barracks, watchtower; levels 1-3, one build at a
  time per camp. Resting restores energy and halves wounds (once per 4 h per
  camp). A camp lost in battle is razed.
- `src/online/rules.ts` (`CAMP_RULES`), `src/online/camps.ts`,
  `server/src/online/camps.ts`; same `CampScene` as offline.

## Mythical beasts

- **Lairs:** Hydra, Minotaur, Nemean Lion, Cyclops, Harpies, Chimera. A kill
  takes the region, drops its hoard (rare+ gear) and a trophy; the beast
  returns 48 h after the region falls back to neutrals.
- **Mechanics:** Hydra regrows heads; Cyclops boulders scatter formations;
  Harpies dive at ranged units; Nemean Lion immune to missiles; Minotaur
  charges through lines; Chimera breathes a fire cone.
- **Clan raids on world bosses:** Kraken, Titan; shared server HP, loot by
  damage, raids are verified 120 s segments (`server/src/online/bosses.ts`).
- **Sim:** `src/data/beasts.ts` (`MYTHS`, `ENCOUNTERS`), `src/sim/myth.ts`
  `MythSystem` (only when a beast is on the field). Large units with HP per
  level, armour, missile resistance, terror aura, own AI. Hydra = body + 5
  heads that regrow unless the body is struck; kraken rooted at the shore.
  `npm run balance` (`src/dev/beastBalance.ts`): sensible army ~50%, naive
  almost never.
- **Offline:** ~1 overland band in 14 is a beast; Beast trial (menu: Beasts).

## Clans

- Telegram invite links (`startapp=clan_<code>`). Roles leader, officer
  (both invite, kick, promote), member. Shared territory, members garrison
  it, adjacency bonus.

## Trading

- Town marketplace in reachable towns; server escrow; sale fee; no direct
  trades.

## Units and heroes

- **1 hero = 1 soldier**; class from recruitment and gear; army cap 20; a perk
  tree per class (roster in GAMEPLAY.md). Cavalry: charge momentum, weak to
  braced spears.

## Art direction

- Gritty, realistic; soldiers ~32-40 px, realistic proportions; muted
  bronze/crimson/earth palette; class readable from silhouette. Procedural,
  in the documented layer format so hand sheets can replace it.

## Controls

- Drag the selected group to move it (facing, shape kept); drag the bronze
  knob at its facing arrow to turn (snaps to 8 directions); shape only from
  Formation buttons.
- One-finger drag on empty ground pans; a formation drag starts only on/next
  to the selected group or marker; tap ground to move; two fingers zoom.

## UI

- **Battle command panel:** colour groups: Movement bronze, Attack red,
  Formation blue, Abilities gold (cooldowns); long-press explains. Group
  cards: portrait, health, morale.
- **Items:** icon per item; rarity Common (grey), Uncommon (green), Rare
  (blue), Epic (purple), Legendary (gold); Rare+ glow, Legendary sparkles and
  glows on the soldier. Tap for stats.
- **Hero screen:** RPG sheet: portrait in gear with slots, stat bars, perks,
  abilities, rank, kills. **Stash:** grid, equip by tap or drag, compare
  popup, filters.
- **Post-battle report:** VICTORY/DEFEAT banner; count-up tiles (duration,
  kills, losses, gold, XP); MVP and a row per hero (XP, level-ups, wounds);
  loot cards revealed one by one.
- **War map:** the parchment map ("Map"), props (`src/art/warTable.ts`),
  clan banners, cloud fog.

## Invariants (unchanged)

- `src/sim` is pure and deterministic (20 Hz tick, seeded RNG, orders logged
  with tick) so the server can re-run any battle.
- Online economy is server-owned; the client never sets gold, items or
  territory.
- Old battle setups keep replaying (neutral defaults for new fields).

## Monetization and economy

- **Stars buy only Drachmae.** Drachmae buy cosmetics, the season pass (free
  and paid tracks) and consumables; never gear or heroes. Account-wide,
  tradeable, never convert back to Stars. Listings in gold or Drachmae, 10%
  sale fee removed from the economy.
- **Consumables:** healing salves, morale wine, war horn, sharpening stones,
  march rations; sold by war-map merchants (docs/DUELS.md "War-map shops on
  the map") with a daily cap across all merchants. The menu shop keeps only
  wallet, pass and cosmetics.

## Localization, audio and onboarding

- **Localization:** English and Russian, from Telegram's language,
  switchable; all UI text via a translation table.
- **Audio:** procedural SFX, looping lyre-and-drum music; volume/mute; muted
  while Telegram is backgrounded.
- **Onboarding:** skippable 3-4 min narrated tutorial battle, then coach
  marks on the first online visit.

## Online battle rules

- **No pause online:** no pause, auto-pause or speed-up in any online battle;
  offline battles keep them.
- **Timed preparation:** 15 s deployment with countdown; enemy zone visible,
  not positions (duels: server withholds the opponent's deployment orders).
  Starts at timer end or when both press "Ready".
- Armies in your vision move live over the shard WebSocket.

## UX principles (hard requirements for every screen)

- **Everything fits:** no overlap, clipping or overflow, any phone, inside
  Telegram's safe area. Long content: tabs, scrolling lists with a hint, or
  expandable cards; never shrink text or buttons.
- **Readable:** body ≥ 16 CSS px (size 7 at S = 2), vector type
  (docs/UI_KIT.md "Type"); long text gets a short form, fixed wrap, or "…".
- **Touch targets:** ≥ ~44 × 44 pt, ≥ 4 pt apart; key actions at the bottom.
- **Hierarchy:** one primary action (filled terracotta), secondary outlined,
  destructive confirms.
- **Feedback:** press state, sound, haptic on every tap; a disabled button
  says why; empty states say what next. Long-press tooltips; a first-time
  hint once per screen.
- **Automated checks:** Playwright at 320 × 568, 375 × 667, 390 × 844,
  430 × 932, 360 × 780, with and without safe-area insets. CI fails on
  overlapping interactives, overflowing text, out-of-safe-area elements or
  small targets. Scenes expose UI bounds (debug registry).

## Economy decisions (2026-10-07)

- One consumable per battle in **all** online battles and duels.
- Premium pass (500 Dr) returns ~**600 Dr** over its tiers.
- `supporter_banner` is a Drachmae cosmetic, not a Stars product.
- Daily caps count merchant purchases; no listing fee; buy anywhere in the
  shard, list only in a reachable town.

