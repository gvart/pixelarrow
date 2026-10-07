# Pixelarrow — design notes (milestone 2)

Mobile-first pixel-art formation tactics set in the ancient Mediterranean
(Hellenes, Carthaginians, Galatae). It runs as a Telegram Mini App and in any
mobile browser. The loop:

**Main menu (Continue / New campaign) → overland map → march, hunt or flee
bands, visit villages and towns → encounter → Deployment → Battle → Results /
loot / XP → back to the map.** The Army and Hero screens are reachable from
the map and from settlements. The player is an abstract commander: no
commander unit stands on the field.

The online future (shared world, clans, Telegram Stars) and the invariants
the code keeps for it are in [ROADMAP.md](ROADMAP.md).

## Campaign and the overland map (`src/world`)

- **Start:** three heroes (a veteran hoplite, a young hoplite and a peltast),
  60 gold, a helmet and an amulet, standing in the starting town. Army cap 20.
- **Map** (`map.ts`): a 112×112 tile map generated from a seed and never
  saved. Elevation = fractal value noise + a sea basin opening to the
  south-west + ridge noise; thresholds by percentile give ~36% sea, ~9% hills,
  ~8% mountains on every seed. Moisture noise splits the lowland into plain,
  scrubland and forest; low shores become beaches; deep water lies away from
  the coast. Rivers run downhill from the hills to the sea; roads are A*
  paths over a spanning tree of towns and villages (plus a few loops); 4
  towns (preferably coastal), 9 villages and 6 lairs (bandit camps, pirate
  coves, Galatae war camps) are placed on the largest landmass, lairs far
  from the start. **Danger** grows with distance from the start and near lairs.
- **Travel** (`path.ts`, `world.ts`): tap a spot, a settlement or a band; an
  8-direction A* route avoids sea and mountains; crossing a tile costs 0.55 h
  on roads, 1 h on plain, 1.15 scrub, 1.2 shore, 1.8 forest, 2.1 hills, +1.4 to
  ford a river, divided by party speed (3.2 tiles/h, slower for big armies).
  **Time passes only while the party moves or camps** (1.6 game hours per real
  second on the march, 4 when camping). Day/night tint in stepped levels.
- **Bands** (`PartyState`): bandits and pirates (rabble: levies, swordsmen,
  slingers), Galatae raiders (long swords, axes, javelins) and rival
  mercenaries (a proper line). Size, level and gear tier come from the danger
  at their home and the date; their army is built by the enemy generator
  (`buildArmy`) from a stored seed, so the strength shown on the map is the
  army you fight. Every quarter hour a band decides: within 7 tiles it
  **chases** the player if its power is ≥1.1× the player's fit army, **flees**
  if <0.8×, otherwise wanders around its lair (mercenaries patrol between
  towns). Lairs and towns send out new bands every 10 h (up to 16).
- **Strength indicator:** a plate above each band with its head count,
  coloured by power ratio: weak (<0.5), weaker, even (0.85–1.15), strong,
  deadly (>1.7).
- **Encounters:** contact (0.8 tiles) opens a dialog — Attack (deployment and
  battle), Flee (chance 15–90%: easier from big bands and with a small party,
  harder from raiders; failure forces the fight), Take ransom (bands weaker
  than 0.35× surrender: 6 gold per man), or Let them go when you caught a weaker
  band. After any fight or escape both sides break off for a few hours. A
  victory destroys the band; a defeat or retreat shrinks it by the men you
  killed. If the whole army dies, three volunteers join at the starting town.
- **Settlements:** villages offer 1–3 raw volunteers (40 gold each, stock
  refreshes every 48 h); towns offer 2–4 trained men (levels 1–3, kitted out,
  60–200 gold) and a market (10 wares, bought at 1.5× value, any stash item
  sold at its value; refreshes every 72 h). Pools are deterministic per
  settlement and refresh epoch; the save only records what was bought.
  **Rest** 8 h at a time; a town **physician** heals all wounds for 1 gold per
  wound-hour. Gold sinks: recruits, gear, repairs (Army screen), healing.
- **Wounds:** a hero struck down may only be **knocked out** (chance 40%,
  +3% per END point above 5, more with some perks). He survives with a
  36-hour wound and half XP. Wounded heroes sit out battles (if everyone is
  wounded, all fight). Wounds heal 1 h per hour on the road, 1.5 camping,
  2.5 resting in a village, 3 in a town.

## Hero progression (`src/data/perks.ts`)

- **Attributes:** STR, AGI, END, WIL, 5 = neutral, max 15. Archetypes start
  with a spread (hoplite 5/4/6/5, swordsman 6/5/5/4, slinger 4/7/4/5...) plus a
  little personal variation. Per point above 5: STR +0.35 melee damage, +1 HP,
  +0.02 charge; AGI +1.5% speed, +1.2% accuracy, −1.5% attack and shot time,
  +0.25 missile damage; END +3 HP, +5 stamina, +3% knock-out survival; WIL +3
  morale, −3% morale damage taken, +0.12 aura/shout radius, −2.5% ability
  cooldowns, and WIL 9 grants Rally Cry. **Two points per level**, spent in
  the Hero screen with a preview of every derived stat before confirming.
- **Perks:** one point at levels 2, 4, 6, 8, 10. Three five-tier trees; a perk
  needs the previous tier of its tree and the matching level:

| Tier (Lv) | Hoplite | Skirmisher | Warrior |
| --- | --- | --- | --- |
| 1 (2) | Shield Drill: +6% block, +1 armour | Fleet-footed: +8% speed, +10 stamina | Brawler: +1.2 damage, +0.1 shock |
| 2 (4) | **Shield Bash** (ability) | **Volley** (ability) | **Berserk** (ability) |
| 3 (6) | Phalangite: +0.15 reach, +0.15 brace, +1 dmg | Deep Quiver: +40% ammo, +6% acc, +1 range | Bloodlust: kills restore 8 morale, 10 stamina; +6 HP |
| 4 (8) | **Steady Presence** (aura) | **Eagle Eye** (aura) | **Rally Cry** (ability) |
| 5 (10) | Unbreakable: +10 HP, −40% morale damage, +10% survival | Skirmish Master: +2 missile dmg, +6% speed | **Warlord** (aura) |

- **Abilities** are `{ kind: 'ability', unit, ability }` orders, validated and
  logged by the sim like any order, so replays stay exact:
  - *Shield Bash* (12 s, needs a shield and an enemy close in front): stuns him
    1.5 s, then **dazed** 2 s (cannot block, takes +20% damage), shoved back
    half a pace, small hit and −6 morale.
  - *Volley* (20 s): every missile-man within 6 paces with a target looses two
    free shots at once (+30% damage, +10% accuracy).
  - *Berserk* (40 s): 8 s of fury: +50% damage, 25% faster blows, +0.5 morale
    shock, +10% speed, cannot rout; block ×0.6, armour −2; winded (−15
    stamina) after.
  - *Rally Cry* (45 s): allies within 4 paces (+WIL) regain 35% of their morale;
    routing men there turn back to the fight.
- **Auras** are recomputed every half second and cover allies (and the
  holder) within their radius: *Steady Presence* (3.5) −20% morale damage and
  +1 morale/s even in melee; *Eagle Eye* (5) +12% accuracy, +15% missile
  damage; *Warlord* (3) +12% melee damage.
- Bots develop by archetype (points along a fixed pattern, perks down their
  tree) and **use abilities** with the same orders: bash when engaged, fury in
  a frontal melee, a volley when two or more shooters have targets, a shout
  when several men nearby waver.

## Heroes and the army

- 1 hero = 1 soldier. Up to 20 heroes, each with a name unique within the
  roster (36–48 names per culture, then numbered: "Hanno II"). Each hero has a level (1–10), XP,
  1–2 traits, attributes, perks, a look (skin, hair, beard, tunic colour) and five equipment slots.
- HP, morale and stamina are derived from level, attributes, traits, perks and gear
  (`src/sim/stats.ts`). Hit points refill between battles; knock-outs leave wounds (above).
- **Permadeath:** heroes killed in battle are removed with their gear.
  Recruits are hired in villages and towns (see above).
- **Traits** (`src/data/traits.ts`): Veteran, Steady, Swift, Brute, Keen-eyed,
  Stalwart, Tough and the negative Skittish. Heroes may gain a trait at levels
  3, 5 and 8 (Skittish turns into Steady).
- **Groups:** heroes belong to one of four battle groups —
  I Phalanx, II Skirmish, III Reserve, IV Flank — assigned in deployment.

## Equipment

All items are data in `src/data/items.ts`. Slots: weapon, shield, helmet,
body armour, trinket (passive, not drawn). Each owned item has a
**rarity** (common / fine / rare / heroic, scaling its positive stats),
a **condition** 0–100 (low condition weakens it; repairs cost gold) and
optional **paint** (shield emblem and colours, helmet crest colour).

| Weapon | Role | Notes |
| --- | --- | --- |
| Spear (dory) | melee | reach 1.9–2.0, braces against charges |
| Sword (xiphos, kopis, falcata, longsword) | melee | faster, short reach |
| Axe | melee | slow, pierces shields |
| Club | melee | cheap, extra morale shock |
| Sling | ranged | long range, lots of ammo |
| Bow | ranged | two-handed (no shield), longest range |
| Javelins | hybrid | 3–4 heavy throws, then a short spear |

Shields block frontal attacks (hoplon > oval > buckler). Hoplon and oval
shields allow the **shield wall**. A bow and a shield are exclusive.

## Battle simulation (`src/sim`)

A pure TypeScript, real-time simulation with no Phaser imports:

- Fixed timestep of 20 ticks/s, a seeded `Rng` (mulberry32) and no
  `Math.random`. Facing is a unit vector (no trigonometry), units are updated in
  id order. Same seed + same orders at the same ticks ⇒ the same battle
  (`Battle.hash()` fingerprints the state; tests check replay).
- Orders (`Order` in `src/sim/types.ts`) are logged with their tick.
  `issue()` applies an order immediately between steps; `schedule()` applies
  it at the next step, which is what a future lockstep PvP layer will use.
- The renderer only reads state and drains events (`hit`, `block`, `death`,
  `contact`, `flanked`, `rout`, `shot`, `impact`, `end`, ...).

### Rules

- **Facing and flanking:** a hit is front / side / rear, judged by the
  target's facing. Side hits do ×1.3 damage and ×1.8 morale damage; rear hits
  do ×1.6 damage and ×2.8 morale damage. Units fighting one enemy keep facing
  it, so a second enemy on their flank gets these bonuses.
- **Shields:** block chance applies to frontal hits (only 35% of it from the
  side, never from behind) and is improved against missiles. Shield wall:
  +15% frontal block, harder to push, but half speed and slower attacks.
- **Braced spears:** a charge that lands on the front of a braced shield wall
  does only 35% of its impact damage, does not stun, and *bounces*: the
  attacker is checked (0.5 s stun), winded and shaken. Braced spearmen also get
  a free thrust at a man still running onto their points, with a ×(1 + 6 ×
  charge bonus) brace bonus (×3.4 for a dory). Costly for the attacker, but not
  an instant rout.
- **Reach:** a weapon's reach decides who strikes first and lets the second
  rank of spearmen fight.
- **Charges:** units running for 0.8 s build momentum; the first blow lands
  with ×1.4+ damage, extra morale damage and a short stun. Spearmen holding
  their ground punish chargers with a brace bonus.
- **Pace:** 55% base hit chance, a global damage scale of 0.34 and morale loss
  of 0.5 per point of damage (`RULES` in `src/sim/battle.ts`).
- **Missiles:** slings, bows and javelins fire projectiles with travel time,
  lead and scatter; they hit whatever stands at the landing point. Ammo is
  limited. Javelin groups keep their throws until ordered (or when charging).
- **Stamina:** running, fighting and blocking tire soldiers. Below 30 stamina
  they move and strike slower and block worse; resting recovers it.
- **Morale:** damage, nearby deaths and nearby routs lower morale (the
  cascade); enemy deaths raise it. Being outnumbered in melee erodes it.
  Below 25% of maximum a soldier routs and runs for his own edge (taking
  extra damage); out of danger he regains morale and rallies above 55%.
  Fleeing off the field saves his life but he takes no further part.
- **Spacing:** soldiers are discs that push each other apart; braced shield
  walls are harder to shove.
- **End:** a side with nobody left standing (dead, routing or fled) loses.
  After 5 minutes the stronger side wins, or it is a stalemate.
- **Knock-outs:** a mortal blow rolls the victim's knock-out chance (in the
  sim's seeded RNG); a knocked-out man drops like the dead for the rest of the
  battle (`ko` in the result) but lives on, wounded.
- **Retreat** (`{ kind: 'retreat' }`, the flag button in battle, with a
  confirmation): the whole army leaves the field and the battle ends at once
  as a defeat. Every man who is routing (60%) or locked in melee (35%) may be
  cut down, +15% if badly wounded, all multiplied by the enemy's **pursuit**:
  its men still fighting (weighted by stamina) divided by the retreating army's
  size plus its men free to cover the withdrawal (0.5 for two equal fresh
  armies, 1 for a broken army). Everyone else survives. No loot, gold only
  for enemies already slain, and survivors keep their full XP. It is a logged
  order like any other, so replays reproduce it.

### Battle terrain (`src/data/terrain.ts`, `src/sim/terrain.ts`, `src/world/battlefield.ts`)

Every battle is fought on a seeded **terrain grid**, one cell per field unit
(24 × 36), with a terrain kind and a height level 0–3 per cell. The grid is
part of `BattleSetup` (`terrain: { w, h, cells, height, name }`, plain strings),
so a battle replays, and the server verifies it, without regenerating
anything. A setup **without** `terrain` (older clients, old logs) is an open
flat plain and plays exactly as before; so does an all-open flat grid
(`tests/terrain.test.ts` checks both).

- **Generation** (`generateBattlefield(seed, site)`): the site comes from the
  overland tile where the armies meet (`siteAt`: the tile's terrain, forest
  share around it, a river within a tile, the sea within two, mountains near
  → rocks); skirmishes get a random site. Plains, scrub, woodland, hills and
  beaches each have a profile: elliptical hills with stepped heights, forest
  and scrub patches by thresholded noise, rock clusters ringed by rough
  ground, a meandering river with a 3–4 cell ford between the deployment
  zones, the sea and a beach along one flank. The centre of each deployment
  front is never blocked.
- **Effects** (all data in `TERRAIN` / `HEIGHT_RULES`):

| Terrain | Speed | Other |
| --- | --- | --- |
| Open ground | ×1 | — |
| Scrub | ×0.88 | 10% missile cover, slight scatter |
| Forest | ×0.62 | 38% missile cover, ranks scatter (±0.45), block ×0.85, no braced spear wall (brace bonus ×0.35) |
| River | ×0.32 | no shield wall, block ×0.55, scatter |
| Ford | ×0.55 | no shield wall, block ×0.7 |
| Rough ground | ×0.78 | block ×0.92, brace ×0.8 |
| Beach sand | ×0.85 | — |
| Rocks, sea | impassable | men slide along them; slots on them move to free ground |

  **High ground:** melee blows +25% per level above the target (−20% per
  level below, capped at two levels), a charge downhill +15% impact per level,
  missiles +12% damage and +0.8 range per level shot downhill ("better
  sight"); climbing to a higher level is ×0.7 speed and costs extra stamina.
  Missile cover is rolled in the sim's seeded RNG only when the target stands
  in cover, so open-field battles consume the same random numbers as before.
- **Bot:** at deployment the main line moves onto the highest ground in its
  zone (if clearly higher) and skirmishers form up deep in the nearest wood;
  a line on a hill **holds** it while the enemy climbs (up to 50 s, or until
  it is shot at from below); facing a river it makes for the ford, and waits
  on its bank rather than wade across under fire or onto men holding the far
  bank (up to 55 s); advancing skirmishers prefer a wood within range.
- **Rendering:** the iso ground texture is painted per pixel from the grid
  (forest floor, scrub, sand, stony ground, water with ripples and foam,
  ford stepping stones, lighter ground per height level with a dark face and
  lit lip on every contour step). Trees and boulders are upright sprites,
  depth-sorted with the soldiers by screen y; a tree fades while a soldier
  stands behind it. Water glints shimmer in stepped frames. One battlefield
  texture is kept at a time. The deployment banner names the site.

### Bot AI (`src/sim/ai.ts`)

Uses the same orders as the player. The main line waits briefly (shield wall
if shot at), then advances keeping formation and charges at close range.
Skirmishers move into range and loose, then retire behind the line when
threatened or out of ammo. Flankers swing wide around the enemy's largest
group and charge its side. The reserve follows the line and is committed when
the line wavers, the enemy breaks or time runs on.

If nothing has happened for 8 s (no blow, block or missile on either side)
after the first 25 s, the bot commits every group that can still fight to an
attack, so battles do not drift into a stand-off.

Armies come from `src/game/enemy.ts`. `buildArmy` takes a culture, size,
level, gear tier, target power and a make-up (`line`, `bandits`, `raiders`,
`mercs`); world bands use it untuned (their natural power is what the map
shows). The skirmish opponent (`generateEnemyArmy`, used by the balance
harness) is sized to the player's army and tuned until its `heroPower` is
about 120% of the player's (`ENEMY_POWER`). The power formula underrates a
disciplined hoplite phalanx, so 120% on paper is an even fight on the field;
abilities and auras add 4–5% each on paper.

### Balance (`npm run balance`)

`scripts/balance.mjs` runs the harness in `src/dev/balance.ts` headless (via
Vite's module runner): 200 seeded matched battles (the ten-man reference army
of milestone 1, `standardArmy`, vs its bot army, both sides bot-driven), 100
battles against a passive player, targeted rule tests, and **ability/aura
mirror battles**. Milestone 1 tuning (before → after):

| Metric | Before | After |
| --- | --- | --- |
| Starting army win rate vs matched bot | 69% | 54% |
| Battle duration mean / median | 45 s / 40 s | 86 s / 75 s |
| Battles lasting 60–150 s | 3% | 70% |
| First group rout after contact (median) | 11–12 s | 34–38 s |
| Passive player: 5-minute limit reached | 37% | 1% |
| Swordsmen charging braced hoplites: attacker routs within 15 s | 34% | 0% |
| ... HP lost in the clash (first 5 s), attacker vs defender | even | 23 vs 16 |
| ... attacker wins (equal numbers) | 52% | 26% |
| 3 extra men hit the rear vs join the front: enemy line routs at | 3 s vs 17 s | 9.5 s vs 63 s |

After milestone 2 (attributes, knock-outs, single-rank lines for up to 8
men, bot abilities) the matched numbers hold: player win 47% / loss 53%,
duration mean 80 s / median 72 s, 68% of battles in 60–150 s, first group rout
34–38 s after contact, passive player hits the time limit 1%, braced hoplites
still never rout a charging line within 15 s, rear attack routs the line at
8.8 s vs 76 s from the front.

**Abilities and auras** — mirror battles of identical level-4 ten-man armies
(both bot-driven, sides alternated), only one side has the perk, 160 seeds:

| Perk given to | Win rate |
| --- | --- |
| nobody (baseline) | 49% |
| Shield Bash, all line men | 59% (was 66%: daze 3 s → 2 s, morale hit 9 → 6) |
| Berserk, all line men | 57% |
| Volley, one skirmisher | 54% |
| Rally Cry, one hero | 54% |
| Steady Presence aura, one hero | 59% |
| Eagle Eye aura, one skirmisher | 52% |
| Warlord aura, one hero | 56% |

Every one helps; none decides a battle alone. Bash on a whole line is among
the strongest, as it should be for a group-wide tier-2 perk; Eagle Eye matters
little with only three missile-men in the army (it shines in archer-heavy
bands).

**Terrain** — the same mirror armies (120 seeds each, both bot-driven);
win/loss for the named side. Defending a ridge is the clear advantage it
should be; symmetric fields stay even, and broken ground makes battles longer:

| Field | Win / loss | Median length |
| --- | --- | --- |
| flat open plain (control) | 46% / 54% | 94 s |
| defending a ridge vs attacking it | **63% / 38%** | 143 s |
| river across the middle, ford in the centre | 49% / 51% | 103 s |
| generated plain / scrub / forest / hills / beach | 45–54% | 96–141 s |

`tests/balance.test.ts` checks the matched targets on smaller samples;
`tests/abilities.test.ts` covers each ability, auras, cooldowns, knock-outs
and replay determinism with abilities in the order log.

## Controls

- Tap a group tag, tab or soldier to select a group. Tap the same soldier again
  to select that hero alone; any order then detaches him (Solo / Join).
- **Formation drag faces the pull** (deployment and battle): with a group
  selected, touch where it should stand and pull. The soldiers face the
  direction the finger moves (the pull vector taken through the inverse iso
  projection), the front rank is laid across it centred on the touch point. A
  short pull only turns the group; every 1.5 paces of pull beyond 2.5 adds a
  rank (`src/ui/dragFormation.ts`). Dashed placement boxes and a facing arrow
  preview the result live.
- **Long-press the ground in deployment** for a tooltip: the terrain there,
  its height and what it does.
- Tap the ground to move a group keeping its shape; tap an enemy to attack him.
- Orders: Hold, Advance, Charge, Throw/Loose, Shield wall, Fall back.
  Formations: Line, Column, Wedge, Loose (skirmish), Shield wall.
- One-finger drag with nothing selected pans; two fingers pinch-zoom and pan
  (zoom snaps to whole multiples so pixels stay crisp). Mouse wheel zooms.
- **Abilities:** with a hero or group selected, its abilities appear as
  buttons above the info strip with a stepped cooldown sweep and a count of
  ready holders. Shouts and volleys use the best-placed holder; bashes and
  fury fire for every ready holder. Tapping an unusable one says why.
- **Camera:** opens at 2× (more if both armies fit) centred on the player's
  army; once the fight starts it smoothly follows the melee (or the army)
  until the player pans or pinches; the eye button resumes following.
- Pause any time; orders can be given while paused. Auto-pause (settings):
  first contact, a group flanked, a group routing, a hero death (off by default).

## Loot and rewards

After a battle only enemies **your side actually killed** drop their real
gear, with their condition and battle wear. You pick: 3 items for a victory,
4 if you lost at most 20% of your men, 5 for a flawless one, 1 for a
stalemate, none for a defeat. Gold: 20 + 12 per kill (+60 for a win).
XP per survivor: 12 + 10 per kill (+12 for a win), modified by XP bonuses;
knocked-out heroes get half. The results screen animates every survivor's XP
bar; a level-up flashes the bar, pops the level and a "Level up!" stamp and
throws confetti.

## Saves

`src/game/save.ts` holds a versioned schema (`SAVE_VERSION` = 3, migration chain,
validation). v3 adds hero attributes, points, perks and wounds and the world
(`WorldSave`: map seed, time, party position and route goal, bands with their
army seeds, per-settlement stock epochs and purchases, world RNG). v2 saves
migrate: heroes get neutral attributes and the points their levels earned,
and the army sets out on a new map. The JSON is split into ≤3800-character chunks (`px_part_N` +
`px_meta`) because Telegram CloudStorage values are limited to 4096 chars.
Inside Telegram (Bot API 6.9+) the save goes to CloudStorage and is mirrored to
localStorage; in a normal browser localStorage is used.

## Online client (`src/platform`)

The backend (`server/`, see server/README.md) is optional at runtime: every
online call resolves, failures only flip the sync badge to offline and are
retried with backoff. Outside Telegram (no `initData`) nothing is requested.

- **Sign-in:** at boot `POST /api/auth/telegram {initData}`; the session token
  lives in memory only and is renewed on a 401.
- **Cloud save:** every save gets `seq` (+1 per save, carried across devices)
  and `savedAt`. Local storage is written first, then a debounced (4 s)
  `PUT /api/save {revision, data}`; pending data is flushed when the app is
  backgrounded. `px_sync` (next to the save) remembers the server revision and
  the `seq` last agreed on. Boot waits at most 6 s for `GET /api/save`: the
  server copy is adopted when it moved past our revision and we have no
  unsynced progress; if both changed, the higher `seq` wins
  (`src/platform/saveSync.ts`, pure and unit-tested). A 409 refetches, keeps
  the more-played copy and retries once; a newer copy from another device
  replaces the campaign only outside battle and returns to the menu. A new
  campaign keeps counting `seq`, so it outranks the old one.
- **Status badge:** a small cloud (synced / syncing / offline) in the menu
  footer, the army header and under the world-map top bar.
- **Shop:** Menu → Shop lists `GET /api/shop/products`; Buy → invoice →
  `Telegram.WebApp.openInvoice`; on `paid` the client polls
  `/api/entitlements` (the grant comes from the bot webhook). Entitlements are
  cached locally so cosmetics show offline. `supporter_banner` gives the
  world-map party a golden standard and the army header golden trim.
- **Battle verify:** after each battle the setup (snapshot at creation), order
  log, `deployOrders` and claim (winner, ticks, retreated, hash) go to
  `POST /api/battle/verify`, fire-and-forget; mismatches are only logged (v1).

## Online mode: seasonal hex war (`src/online`, `src/scenes/online`, `server/src/online`)

The main game of [DESIGN_V2.md](DESIGN_V2.md), phase 1. It sits next to the
offline campaign (menu → **Online**) and shares nothing with it: the online
army, its heroes, gear and resources live on the server (D1) and change only
through validated endpoints (protocol: [server/README.md](../server/README.md#online-mode-seasonal-hex-war)).
Offline progress does not transfer. Without Telegram, or when the API is down
or not configured (503), the Online screen says **Online unavailable** and the
campaign is untouched.

**World.** A season (90 days) has shards of ~500 players; a shard is a hex
disc of radius 34 (~3.5k hexes, axial q/r) generated from the shard seed
(`src/online/hex.ts`): sea toward the rim, highlands inland, plains,
farmland, forest, hills, mines, towns, rare ruins, ~1–2% forts, and seven
capitals (the centre and six around it). Each hex has a battlefield site that
becomes the battle's terrain grid. Yields per hour: farmland food, forest wood,
mines bronze, towns gold and recruits, forts and capitals a large bonus on
top; +10% per adjacent hex held by the same clan (or player), up to +50%.
Income accrues lazily from server time (capped at 24 h) and is collected with
one tap. Season points: hex 1, fort 10, capital 100; at the season's end every
shard is ranked into `season_rewards` (titles Archon for the best clan,
Basileus, Strategos, Polemarch, Veteran) and the next season starts from
nothing.

**Neutral defenders** (`src/online/defenders.ts`): no hex is free. Farmland
and plains: militia and brigands; forest: wolf packs and boars, or outlaw
archers; hills: hill tribes (slingers, javelins, a bear); coast: pirates;
mines and forts: deserter mercenaries; towns and capitals: city garrisons;
ruins: cultists. Size and level grow with hex tier and with depth into the
shard (homes are on the outer rings). Animals are placeholder soldiers
(`arch: 'animal:wolf'`, unarmed, beefy attributes) until the classes pass
gives them bodies. Losses persist until a respawn (6 h); towns, forts and
capitals need 2/3/4 victories in a row (a siege that decays after 6 h). An
owned hex nobody guards whose income was ignored for 72 h falls back to the
neutrals.

**Army, energy, marches.** A new player gets a home hex (protected), five
heroes and a small purse. The field army stands on a hex; it marches through
land not held by rivals along an A* path (6–12 min per hex by terrain, 1
energy per hex; energy 100, +12/h). It attacks hexes next to it (10 energy);
a capture moves it in. Heroes left in an owned (or clan) hex are its garrison
(up to 12, the army must stand there); without one a small militia defends.
Recruiting costs gold, food and a recruit point; gear moves between the
stash and heroes on the server. Knocked-out heroes rest 2 h of real time;
the dead are gone.

**Fog of war.** The server only sends hexes within 3 of the player's and
clan's land and armies; foreign garrisons are only sized from next door.

**Attacks** are async: the server fixes the seed and both armies in a ticket
(and locks the hex in the shard Durable Object), the client fights the battle
in the normal battle scene against the bot AI and submits its order log; the
server replays the stored setup with `src/sim` and only applies a matching
result (both sides' casualties, XP, loot from enemies the attacker killed,
siege progress or capture, plunder of uncollected income).

**Clans**: one shard and season; leader, officers and members; invite links
`t.me/<bot>/<app>?startapp=clan_<code>` shared through Telegram's share sheet
(the game reads `start_param`, and the bot's `/start clan_<code>` opens the
game with it). A newcomer joining by invite is placed in the clan's shard.
Clan land is shared: members garrison each other's hexes and get the
adjacency bonus.

**Live duels**: friendly in this phase. Players online in the shard are listed
in the duel lobby; a challenge accepted starts the same battle on both phones.
The battle scene runs with a lockstep driver (`src/online/lockstep.ts`):
deployment orders are echoed by the server in one order, battle orders are
sealed into 2-tick turns two turns ahead (≈200–300 ms input delay), nobody
simulates an unsealed turn, hashes are compared every 10 turns and the server
replays the whole log at the end. No pause or speed-up in duels; the
accepting player commands side 1 (their army deploys at the top).

**Client** (`src/scenes/online`): `OnlineScene` (hex map with pan/pinch,
owned / clan / rival colours, homes, forts, capitals, armies and the march
route; hex panel with yields, defenders, siege, garrison and March / Attack /
Garrison / Halt; income; duel lobby and challenges; results),
`OnlineArmyScene` (heroes, groups, gear, stash, recruiting, choosing a
garrison), `ClanScene`. The battle scene takes a `BattleSource`
(`src/online/battleSource.ts`) instead of the campaign's pending battle, so
everything the sim adds to `BattleSetup` (terrain today) flows through.

## Economy (`server/src/economy`, `server/src/online/market.ts`, `src/data/consumables.ts`)

Server-owned; endpoints and exact rules in server/README.md "Economy".

- **Stars buy only Drachmae** (packs 100/250/500/1000 Stars → 100/275/600/1300
  Dr). Everything premium is a server-side Drachmae debit, idempotent per
  client request id. Drachmae are account-wide; a refunded pack is debited
  again (the balance may go negative, which blocks spending). The old 5-Star
  `supporter_banner` stays as a legacy Stars entitlement and a banner cosmetic.
- **Cosmetics** (emblems, banners, cloaks, clan flags, army skins, table
  themes) are account-wide entitlements with a per-slot loadout. Prices live
  in `server/src/economy/catalog.ts`.
- **Consumables** (`src/data/consumables.ts`): bought with season gold or
  Drachmae, daily caps per UTC day, held per season. At most one per battle
  (attacks and duels); battle consumables are baked into the server-built
  `BattleSetup` (unit stats; `setup.consumables` records the ids), so clients
  and the replay agree. TODO(sim): the war horn reuses Rally Cry on the best
  hero; a true one-shot army rally needs a sim feature.
- **Season pass**: 30 tiers × 100 XP from verified attacks and duels; free
  track for everyone, premium track for 500 Dr per season; idempotent claims.
- **Town marketplace**: list stash items, food/wood/bronze or consumables in a
  town you hold or stand on/next to; escrow on listing; gold or Drachmae; 10%
  fee burned on every sale; 48 h expiry (resolved lazily); 20 open listings;
  price bounds per rarity; audit log. Listings are season-scoped: at season
  end they are left behind with the season (goods vanish, Drachmae already
  earned stay).



Everything is generated at boot from code; there are no image files.

- `paperdoll.ts` — layered soldier generator. Sheet format: 32×40 frames,
  feet at y = 37; 13 columns (`idle0 idle1 walk0-3 atk0-2 hit die0-2`) by
  2 rows (row 0 facing down-right, row 1 facing up-right; left-facing is a
  horizontal mirror), i.e. the four isometric diagonals. Layers, back to front:
  legs, tunic, body armour, head/hair/beard, helmet, back-view shield (carried
  on the left side, angled out so its painted face shows), arm, front-view
  shield, 1px outline, weapon. Each layer is keyed by the item's `art` id, so a hand-drawn sheet per
  layer in the same grid can replace a draw function later.
- `emblems.ts` — 7×7 shield emblems, painted on round (hoplon) and oval shields (lambda, owl, horse, trident, sun wheel,
  lion, eye, scorpion, boar, Tanit, club, star).
- `ground.ts` — isometric grass plain made of 2:1 diamond tiles: each pixel is
  mapped back to field coordinates, tiles get their own tone, a dithered seam
  (dark lower edges, lit upper edges) and value noise + Bayer 4×4 dithering;
  tufts, flowers, dirt; blood decals; shadows; selection rings.
- `iso.ts` — the projection (see below).
- `worldArt.ts` — the overland map at 8 px per tile in a top-down 3/4 view:
  per-pixel terrain with domain-warped borders, Bayer-dithered ramps, shallow
  water bands, wave glints and shore foam; rivers and roads stroked between
  tile centres; trees, olive groves, scrub, hill humps and snow-capped peaks
  drawn row by row so near ones overlap; walled towns with a temple, thatched
  villages, lairs with tents and a skull pole; standard-bearer figures for the
  party and the bands (two walk frames).
- `fx.ts` + `src/ui/battleFx.ts` — battle effects, all stepped and dithered,
  pooled and capped (≤240 particles, ≤24 numbers): aura ground rings (iso
  ellipses, 8 shimmer frames, stepped alpha pulse) in each aura's colour,
  particle bursts and floating outlined ability icons, stun stars orbiting
  the head, buff pips (max two) above heads, rally waves and morale sparkles,
  floating damage numbers (Settings toggle). Berserkers flicker red and
  shake; dazed men are tinted.
- `font.ts`, `icons.ts`, `uiTextures.ts` — pixel font, dark-red pictograms
  and parchment panels / scroll rolls.
- `/preview.html` on the dev server shows sample sprite sheets.

### Isometric projection (`src/art/iso.ts`)

The simulation keeps its own flat field coordinates (x lateral, y depth,
24 × 36 units); only the renderer projects. One field unit is one 24×12 px
diamond tile:

    screen.x = (x − y) · 12        screen.y = (x + y) · 6

so field +x runs down-right and field +y down-left. The battle line (field x)
therefore runs diagonally across the screen: your army stands bottom-left
facing up-right (seen from behind), the enemy top-right facing down-left.
`screenToIso` is the exact inverse and is used for every touch: tap-to-move,
drag-to-draw formation lines and the deployment zone. Placement boxes are the
slot footprints projected, i.e. dashed iso diamonds; the deployment zone is a
projected band. Sprites are upright, anchored at the feet and depth-sorted by
screen y; the facing row/mirror is picked from the projected facing vector
(with hysteresis). The default camera is at least 2× (a soldier is then
about 64 px tall on a 390-wide phone) and follows the fighting; pinch/wheel
zoom 1–4×.

## Known gaps (milestone 2)

- No food or wages yet: the economy runs on loot, recruits, gear, repairs
  and healing. Bands do not fight each other or besiege settlements.
- Battle terrain is read from the overland tile (the overland map itself is
  slated to become a hex map, see DESIGN_V2.md); no sieges, sailing or cavalry.
  Units are not raised on hills in the iso view: height is shown by shading
  and contour steps only.
- Defeat on the map does not capture the commander; the band simply keeps
  its survivors and both sides break off.
- Ability and aura balance was tuned in mirror battles of level-4 armies;
  late-campaign armies (level 8–10, full trees) are untuned.
- The world map texture (896×896) is rendered at scene start (~0.3 s on a
  desktop, more on phones); it is cached per seed for the session.
- Determinism relies on IEEE doubles and `Math.sqrt` (correctly rounded), so
  replays match on the same engine; cross-platform lockstep PvP should add
  periodic `hash()` desync checks or move to fixed-point maths.
- No sound or music, no tutorial beyond hint strips and banners.
- The Phaser bundle is ~1.4 MB (~390 KB gzipped) in a single chunk.

## Next steps

See [ROADMAP.md](ROADMAP.md): accounts and server-validated battles on
Cloudflare Workers + Durable Objects + D1, async then live PvP, a shared world
map with territories and clans, Telegram Stars. Gameplay: terrain battles,
food and wages, sieges, more troop types, sound.
