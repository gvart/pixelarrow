# Pixelarrow gameplay reference

The core single-player game and the battle simulation that every mode
(campaign, skirmish, tutorial, online war, duels) runs on. Mobile-first
pixel-art formation tactics in the ancient Mediterranean (Hellenes,
Carthaginians, Galatae), running as a Telegram Mini App and in any mobile
browser. The loop:

**Menu (Continue / New campaign) → overland map → march, hunt or flee bands,
visit villages and towns → encounter → deployment → battle → results / loot /
XP → back to the map.** The Army and Hero screens are reachable from the map
and from settlements. The player is an abstract commander: no commander unit
stands on the field.

The online war is in [DESIGN_V2.md](DESIGN_V2.md), duels in
[DUELS.md](DUELS.md), the UI in [UI_KIT.md](UI_KIT.md), the architecture and
invariants in [ROADMAP.md](ROADMAP.md).

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
- **Field camp** (`src/world/camp.ts`, `CampScene`): the party can pitch
  camp on open land away from settlements and build tents, a fire, a
  palisade, a forge and a training ground from **supplies**; the camp speeds
  healing, forages **food**, keeps bands out, repairs gear and drills the
  men. Food is eaten on the march and in camp (one ration per hero per day);
  both are bought in villages and towns.

## Hero progression (`src/data/perks.ts`)

- **Attributes:** STR, AGI, END, WIL, 5 = neutral, max 15. Archetypes start
  with a spread (hoplite 5/4/6/5, swordsman 6/5/5/4, slinger 4/7/4/5...) plus a
  little personal variation. Per point above 5: STR +0.35 melee damage, +1 HP,
  +0.02 charge; AGI +1.5% speed, +1.2% accuracy, −1.5% attack and shot time,
  +0.25 missile damage; END +3 HP, +5 stamina, +3% knock-out survival; WIL +3
  morale, −3% morale damage taken, +0.12 aura/shout radius, −2.5% ability
  cooldowns, and WIL 9 grants Rally Cry. **Two points per level**, spent in
  the Hero screen with a preview of every derived stat before confirming.
- **Perks:** one point at levels 2, 4, 6, 8, 10. Each class has its own
  five-tier tree (see Unit classes below); a perk needs the previous tier and
  the matching level. The three original trees, which the classes reuse:

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
- Bots develop by class (points along the class growth pattern, perks down
  the class tree) and **use abilities** with the same orders: bash when engaged, fury in
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

## Unit classes (`src/data/classes.ts`)

Every hero has a **class** (`Hero.cls`): one data entry that fixes his role,
attribute spread and growth, combat modifiers, the gear he is raised with
(by tier: recruit / veteran / elite), the cultures that field him, his cost
in the bot army budget, his default battle group, his **own five-tier perk
tree** and the colours of his clothing. Adding a class is adding one entry.
Saves from before classes map onto them (`classOfHero`: hoplite → Spartan
hoplite, skirmisher → slinger / archer / javelineer by weapon, swordsman →
thureophoros or Celtic swordsman by culture, animals by kind).

| Class | Role | Cost | Cultures | Kit (recruit) | Notes |
| --- | --- | --- | --- | --- | --- |
| Militia | levy | 60 | all | dory / club / javelins / sling | cheap, brittle; village recruits |
| Spartan hoplite | heavy | 100 | Greek | dory, hoplon, Corinthian | braced spear wall, the anti-cavalry line |
| Thureophoros | heavy | 85 | Greek, Punic | xiphos or longche, thureos | flexible medium foot |
| Celtic swordsman | heavy | 80 | Celtic | longsword, thureos, mail later | shock infantry |
| Thracian rhomphaia | heavy | 85 | Greek | two-handed rhomphaia, no shield | shield breaker, weak to missiles |
| Cretan archer | ranged | 50 | Greek, Punic | bow → Cretan bow | longest range, armour piercing |
| Rhodian slinger | ranged | 50 | all | sling → Rhodian sling | most ammunition |
| Peltast javelineer | ranged | 45 | all | javelins, pelte | heavy short-range volleys |
| Scythian horse archer | ranged (mounted) | 75 | Punic, Celtic | Scythian bow, hood | shoots on the move, kites |
| Peltast | light | 65 | Greek, Celtic | javelins + longche, pelte | throws then closes; hunts archers |
| Thracian falx | light | 75 | Greek, Celtic | falx | fast, hits hard, no shield |
| Gallic warband | light | 70 | Celtic | axe / longsword, thureos | cheap fierce charge |
| Fanatic | light | 70 | any (bands) | club / axe / kopis, buckler | hardly breaks (morale loss ×0.65) |
| Companion cavalry | cavalry | 160 | Greek | xyston lance, Boeotian helmet | shock riders: flank and rear charges |
| Thessalian horse | cavalry | 115 | Greek, Punic | javelins, buckler | lighter riders, throw then charge |
| Scythed chariot | cavalry | 260 | Punic | kopis; scythed wheels | breaks loose foot, dies in rough ground |
| Royal guard | elite | 130 | Greek | bronze dory, silver argyraspis, Attic | elite line |
| Sacred Band | elite | 125 | Greek | bronze dory, aspis, Corinthian | elite line |
| Wolf | beast | 50 | — | — | packs, flank, bolt when hurt |
| Wild boar | beast | 100 | — | — | armoured charge |
| Brown bear | beast | 250 | — | — | cleaves and knocks men down |

**Perk trees** — each class has its own five perks (tiers at levels 2, 4,
6, 8, 10; the old Hoplite / Skirmisher / Warrior trees are now the trees of
the classes that grew out of them). Twelve class-only perks fill the gaps:
*Drilled* (+5 morale, +4% block), *Iron Discipline* (+6 morale, −20% morale
damage), *Shield Breaker*, *Reaping Blow*, *Longshot* (+1.5 range), *Lead
Bullets*, *Zealot*, *Horsemanship* (+6% speed, +10 stamina, +6 HP), *Lance
Charge* (+0.3 charge impact), *Parthian Shot* (+8% accuracy, +25% arrows),
*Ride Down* (+50% damage to routing men), *Scythe Master* (scythes cut 40%
deeper). A perk outside the hero's class tree is blocked ("Another class").
Example trees: hoplite *Shield Drill → Shield Bash → Phalangite → Steady
Presence → Unbreakable*; Companion *Horsemanship → Lance Charge → Ride Down →
Rally Cry → Warlord*; horse archer *Horsemanship → Volley → Parthian Shot →
Eagle Eye → Skirmish Master*.

**New items:** longche, xyston (lance), falx, rhomphaia (polearm), Cretan
and Scythian bows, Rhodian sling, pelte, silver argyraspis, Scythian hood,
Thracian, Boeotian and Attic helmets. Bows, slings and javelins carry
**armour pierce** (a share of the target's armour ignored).

**Recruitment:** villages offer militia, slingers and javelineers; towns
offer their culture's classes (`townClasses`), weighted toward the common
ones, priced from the class cost, level and gear. Bands and garrisons are
built by class and tier (`src/game/enemy.ts`); cavalry appears from tier 2;
neutral bands include outlaws, hill tribes, pirates, deserters, cultists
(fanatics) and **beasts** (wolf packs, boars, a bear).

### Mounts

A mount is a **class property, not an item** (`MOUNTS` in classes.ts): it
cannot be looted or swapped, and the rider's gear works as on foot (no
shield wall, no shield bash from the saddle).

| Mount | Speed / gallop | +HP | +Stamina | Charge | Footprint | Accel / brake | Turn slow / fast |
| --- | --- | --- | --- | --- | --- | --- | --- |
| horse | ×1.55 / ×1.95 | 14 | 30 | +0.7 | radius 0.48 | 3.2 / 4.5 | 4 / 1.4 rad/s |
| chariot | ×1.6 / ×2.1 | 34 | 40 | +1.0 | radius 0.72 | 2.4 / 3.2 | 2.4 / 0.8 rad/s, scythes 11 |

### Mounted, chariot and animal rules (`src/sim/battle.ts`, `MOUNTED_RULES`)

- **Momentum.** Mounted units carry a speed (`spd`) that accelerates and
  brakes at the mount's rates and turns slowly at speed; they cannot stop
  dead. A rider that reaches a foe at ≥55% of his gallop delivers a
  **charge impact** scaled by speed: damage, a 0.7 s stun, a shove and
  terror (−8 morale, 40% of it to the men around). Riders drive on through
  unshielded or missile men at the gallop; chariots drive through anything
  that is not a braced spear wall.
- **Braced spears.** A charge into braced spears from the front balks:
  the impact is cut to a quarter, the horse rears (1.6 s stun), the rider
  takes the spear (×2.2) and −10 morale. Spearmen hit horses ×1.35 and a
  rider striking at a braced front misses 20% more often.
- **Flanks and pursuit.** Charges on a flank or the rear do ×1.3 damage and
  +1 morale shock; riders cut down routing men ×1.5 (more with Ride Down).
  Each horse within 2.5 paces costs men on foot morale (missile men twice,
  spear walls never). From the saddle men on foot take ×1.2.
- **Horse archers** shoot while moving (scatter ×1.3 at speed).
- **Chariots** cut everyone they pass with scythes (once a second per man),
  but forest, rough ground, water and fords slow them badly and wreck them
  (damage per second by terrain); riders lose speed and charge power there
  too (`cavSpeed`, `cavCharge`, `chariotSpeed`, `chariotDamage` in
  `src/data/terrain.ts`).
- **Animals** (`kind: 'animal'`) take no orders: they hunt anything within
  9 paces (the whole pack wakes when one is attacked), wolves circle to
  the flanks of their prey, boars charge, bears cleave and knock men down.
  Wounds shake them less (×0.6), but they **flee** at their rout threshold
  and never rally.
- Footprints: separation, reach and "outnumbered" counts use each unit's
  radius (a horse is worth ½ of a man in the outnumbered count, an animal
  ⅓).
- **Determinism and old replays.** All of this is gated on `stats.mount` /
  `stats.kind`: battles without mounts or animals run the exact old float
  operations. `tests/legacy.test.ts` replays five battles recorded before
  classes existed (`tests/fixtures/legacy-battles.json`) and checks their
  mid-battle and final hashes. The server schema (`server/src/battle.ts`)
  accepts the new optional stats.

### Bot AI for classes (`src/sim/ai.ts`)

- **Cavalry** waits behind the line until it is shot at or enemy missile
  men are within reach, then rides wide round a flank, charges the enemy
  flank or rear (or their missile men), breaks off after ~4 s of melee,
  regroups and charges again. Chariots always charge.
- **Horse archers** orbit at the edge of their range (Cantabrian circle),
  shooting on the move and keeping clear of melee.
- **Spearmen brace** when riders come at them from the front.
- **Animals** are run by the beast logic above, not by the commander.

## Equipment

All items are data in `src/data/items.ts`. Slots: weapon, shield, helmet,
body armour, trinket (passive, not drawn). Each owned item has a
**rarity** (five tiers: common, uncommon, rare, epic, legendary, scaling its positive stats; saves before v4 used common / fine / rare / heroic, mapped to common / uncommon / rare / epic),
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

Rarity adds random stats, and epic and legendary items a **power** (grade I
or II); item sets add bonuses by pieces worn, and named legendaries carry a
fixed power and an extra. The battle runs the powers, the sets' special lines
and the named extras (`src/sim/powers.ts`). Rules and numbers:
[ITEMS.md](ITEMS.md).

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
  `contact`, `flanked`, `rout`, `shot`, `impact`, `proc`, `end`, ...).
- Item powers and set specials live in `src/sim/powers.ts` (a `PowerSystem`,
  like `src/sim/myth.ts` for beasts): hooks on hit, on being hit, on kill, on
  low HP, timers and small auras, every chance from the battle's `Rng`, its
  state in `Battle.hash()`. A battle with no powers creates none, so older
  replays play exactly as before. A proc pushes a `proc` event and the
  renderer floats the power's icon over the hero.

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

`scripts/dev/balance.mjs` runs the harness in `src/dev/balance.ts` headless (via
Vite's module runner): 200 seeded matched battles (the ten-man reference army,
`standardArmy`, vs its bot army, both sides bot-driven), 100 battles against a
passive player, targeted rule tests, ability/aura and terrain mirror battles,
and the class round robin (`src/dev/classBalance.ts`). Current report:

| Metric | Value |
| --- | --- |
| Reference army vs matched bot | win 52% / loss 48% |
| Battle duration mean / median | 96 s / 85 s; 80% in 60–150 s |
| First group rout after contact (median) | 34–38 s |
| Passive player hits the 5-minute limit | 6% |
| Swordsmen charging braced hoplites: attacker routs within 15 s | 0% |
| 3 extra men hit the rear vs join the front: enemy line routs at | 13.5 s vs 101 s |

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

**Classes** (equal cost, both bot-driven, 26 seeds):

| Test | Result |
| --- | --- |
| Companions charge braced hoplites head on | hoplites win **100%**; 14% of riders down 10 s after the clash |
| 6 hoplites + 2 Companions vs the same cost in hoplites | cavalry side wins 42% |
| Peltasts vs Cretan archers | 81% |
| Companions vs archers | 81% |
| Horse archers vs hoplites / vs Celtic swordsmen | 52% / 100% |
| Scythed chariots vs militia (spears) | 0% |
| Wolves / boars / a bear vs militia (budgets 600 and 900) | 54% / 54% / 50% |

Class costs were fitted (`npm run balance`'s round robin, budgets 700 and
900 so that rounding the head count does not decide a matchup) until every
class's mean win rate against all others lies between 34% and 64%: Levy 54,
hoplite 50, thureophoros 50, Celt 64, rhomphaia 50, archer 34, slinger 43,
javelineer 64, horse archer 54, peltast 58, falx 40, Gaul 59, fanatic 46,
Companion 43, Thessalian 51, chariot 41, royal guard 47, Sacred Band 52.
The intended counters hold: spears beat riders head on (hoplites over
Companions / Thessalians / chariots 92–100%), riders beat missile men
(Companions over archers / slingers / javelineers 69–92%), peltasts beat
archers (85%), horse archers bleed slow heavy foot (Celts 100%,
thureophoroi 92%). Single matchups between two one-class armies are still
very decisive (many pairs above 60%): mixed armies and the player's orders
soften this, but pure-class rock-paper-scissors is sharper than the 60%
target.

`tests/balance.test.ts` checks the matched targets on smaller samples;
`tests/abilities.test.ts` covers each ability, auras, cooldowns, knock-outs
and replay determinism with abilities in the order log.

## Controls

- Tap a group's card, numeral or soldier to select it. Tap the same soldier again
  to select that hero alone; any order then detaches him (Solo / Join).
- **Formation drags** (deployment and battle, also online raids and live
  duels; `src/ui/dragFormation.ts`). Two plain direct-manipulation gestures;
  the **shape** (Line, Column, Wedge, Loose, Shield wall and its files x
  ranks) comes **only from the Formation buttons**, so no drag ever reshapes
  a group.
  - **Move:** press on or near the selected group (any of its soldiers or its
    dashed placement marker, 30 px grab radius) and drag. The group follows
    the finger, keeping the grab offset, its facing and its shape.
  - **Turn:** the selected group shows a facing arrow ending in a bronze
    **knob** 3 paces ahead of its front rank (drawn above the soldiers). Drag
    the knob: the group turns in place around its centre to face TOWARD the
    finger. Within 8 degrees of one of the eight field directions the facing
    snaps to it (a light haptic tick), so straight lines are easy. Within 0.6
    pace of the centre the facing does not change. When the knob and a
    soldier are both in reach, the closer one wins.
  - Live preview: dashed iso placement boxes, the arrow and knob, and a
    "files x ranks" label (e.g. 8X2).
  - Lift to commit. Cancel (no order): a move lifted back within 0.5 pace of
    its start, or a turn of less than 4 degrees.
  - Distances are in paces at the default 1x zoom (36 px tiles) and scale with the zoom, so the gestures
    feel the same on screen at any zoom.
- **Long-press the ground in deployment** for a tooltip: the terrain there,
  its height and what it does.
- Tap the ground to move the selected group there keeping its shape; it turns
  to face the nearest enemy group as seen from the destination (so a move
  never shows a flank; the knob sets any other facing). Tap an enemy to
  attack him.
- Orders: Hold, Advance, Charge, Throw/Loose, Shield wall, Fall back.
  Formations: Line, Column, Wedge, Loose (skirmish), Shield wall.
- **Pan versus order:** a one-finger drag on empty ground always pans, even
  with a group selected; only a press on or near the selected group or its
  knob starts a formation drag. A press needs 10 px of travel before it counts as a drag
  (less is a tap). Two fingers pinch-zoom and pan, never order; a second
  finger cancels a half-done formation drag (zoom snaps to whole multiples so
  pixels stay crisp). Mouse wheel zooms.
- A short hint explains the gesture on the first deployment (remembered in
  the settings as `seenGestureHint`).
- **Abilities:** with a hero or group selected, its abilities appear as
  medallions down the field's right edge with a cooldown sweep and a count of
  ready holders. Shouts and volleys use the best-placed holder; bashes and
  fury fire for every ready holder. Tapping an unusable one says why.
- **Camera:** opens at 1× (sprites are drawn at native size; more if both armies fit) centred on the player's
  army; once the fight starts it smoothly follows the melee (or the army)
  until the player pans or pinches; the eye button resumes following.
- Offline battles pause any time; orders can be given while paused.
  Auto-pause (settings): first contact, a group flanked, a group routing, a
  hero death (off by default). Online battles never pause or speed up
  (DESIGN_V2.md "Online battle rules").

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

`src/game/save.ts` holds a versioned schema (`SAVE_VERSION`, a migration
chain, validation): heroes with attributes, points, perks and wounds, the
stash and gold, and the world (`WorldSave`: map seed, time, party position and
route goal, bands with their army seeds, per-settlement stock epochs and
purchases, the field camp, world RNG). Older saves migrate forward. The JSON is
split into ≤3800-character chunks (`px_part_N` + `px_meta`) because Telegram
CloudStorage values are limited to 4096 chars. Inside Telegram the save goes
to CloudStorage and is mirrored to localStorage; in a normal browser
localStorage is used.

## Cloud save (`src/platform`)

The backend (`server/`, see server/README.md) is optional at runtime: every
online call resolves, failures only flip the sync badge to offline and are
retried with backoff. Outside Telegram (no `initData`) nothing is requested.

- **Sign-in:** at boot `POST /api/auth/telegram {initData}`; the session token
  lives in memory only and is renewed on a 401.
- **Cloud save:** every save gets `seq` (+1 per save, carried across devices)
  and `savedAt`. Local storage is written first, then a debounced (4 s)
  `PUT /api/save {revision, data}`; pending data is flushed when the app is
  backgrounded. Boot waits at most 6 s for `GET /api/save`: the server copy is
  adopted when it moved past our revision and we have no unsynced progress;
  if both changed, the higher `seq` wins (`src/platform/saveSync.ts`, pure and
  unit-tested). A 409 refetches, keeps the more-played copy and retries once.
- **Status badge:** a small cloud (synced / syncing / offline) in the menu,
  the army header and the world map.
- **Battle verify:** after each campaign battle the setup, order log,
  `deployOrders` and claim go to `POST /api/battle/verify`, fire-and-forget;
  mismatches are only logged.

## Art pipeline (`src/art`)

Everything but the icons is generated at boot from code. The icons are drawn
art in two atlases (`public/icons`, drawn by `src/art/iconBitmaps.ts`), with
the code-drawn icons as the fallback. The look is specified in
[ART_STYLE.md](ART_STYLE.md).

- `model3d.ts`: a small software renderer. Figures are posed as 3D primitives
  in metres and ray-cast per pixel through the battle camera (2:1 dimetric),
  lit from the upper left, quantised to each material's ramp
  (`materials.ts`) with Bayer dithering and a soft outline. Pure and
  deterministic.
- `paperdoll.ts`: soldiers, riders, chariots and animals built from those
  primitives with an IK skeleton per frame. Sheet format: 13 columns
  (`idle0 idle1 walk0-3 atk0-2 hit die0-2`) × 4 rows, one per facing (no
  mirroring). Layers keyed by item or class `art` id (cloak, legs, tunic,
  armour, arms, head, helmet, shield, weapon), so a hand-drawn sheet per layer
  can replace a builder. Sheets render lazily, one facing row at a time
  (`ensureDollRow` in `src/ui/sprites.ts`). Class portraits and gear icons use
  the same models.
- `ground.ts`, `terrainArt.ts`: the battlefield ground, trees and boulders.
- `worldArt.ts`, `overlandMap.ts`, `parchmentMap.ts`: the overland and war
  maps. `fx.ts` + `src/ui/battleFx.ts`: pooled, capped battle effects.
- `smoothUi.ts`, `vectorFont.ts`, `vectorIcons.ts`, `uiIcons.ts`: the UI
  (docs/UI_KIT.md).
- `/preview.html` on the dev server shows sample sprite sheets.

### Isometric projection (`src/art/iso.ts`)

The simulation keeps its own flat field coordinates (x lateral, y depth,
24 × 36 units); only the renderer projects. One field unit is one 36×18 px
diamond tile:

    screen.x = (x − y) · 18        screen.y = (x + y) · 9

so field +x runs down-right and field +y down-left. The battle line (field x)
therefore runs diagonally across the screen: your army stands bottom-left
facing up-right (seen from behind), the enemy top-right facing down-left.
`screenToIso` is the exact inverse and is used for every touch: tap-to-move,
the formation drags (move and the turn knob) and the deployment zone. Placement boxes are the
slot footprints projected, i.e. dashed iso diamonds; the deployment zone is a
projected band. Sprites are upright, anchored at the feet and depth-sorted by
screen y; the facing row (one of four) is picked from the projected facing
vector with hysteresis. Sprites are drawn at their native size: the default
camera is 1× (a man is ~34 px tall, a rider ~60 px on a 390-wide phone) and
follows the fighting; pinch/wheel zoom 1–3×. Touch targets cover a figure's
full height (and a horse's body); trees fade when a soldier stands behind
them.
