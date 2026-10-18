# Pixelarrow gameplay reference

Single-player game and the battle sim all modes use. Ancient Mediterranean
formation tactics (Hellenes, Carthaginians, Galatae); Telegram Mini App and
mobile browsers. Loop: menu → overland map → encounter → deployment → battle
→ results / loot / XP → map. No commander unit. Online war:
[DESIGN_V2.md](DESIGN_V2.md); duels: [DUELS.md](DUELS.md); UI:
[UI_KIT.md](UI_KIT.md); architecture: [ROADMAP.md](ROADMAP.md).

## Campaign and the overland map (`src/world`)

- **Start:** veteran hoplite, young hoplite, peltast; 60 gold, helmet,
  amulet; starting town. Army cap 20.
- **Map** (`map.ts`): 112×112 from a seed, never saved; ~36% sea, ~9% hills,
  ~8% mountains (percentile thresholds); plain, scrub, forest, beaches;
  rivers downhill; roads A* over a spanning tree of settlements. 4 towns, 9
  villages, 6 lairs (bandit camps, pirate coves, Galatae camps; far from
  start). **Danger** grows with distance from start and near lairs.
- **Travel** (`path.ts`, `world.ts`): 8-dir A* avoiding sea and mountains.
  Hours per tile: road 0.55, plain 1, scrub 1.15, shore 1.2, forest 1.8,
  hills 2.1, ford +1.4; ÷ party speed (3.2 tiles/h, slower when big). **Time
  passes only while moving or camping** (1.6 game h/real s marching, 4
  camping).
- **Bands** (`PartyState`): bandits, pirates, Galatae raiders, rival
  mercenaries. Size, level, gear from home danger and date; army from
  `buildArmy` with a stored seed (shown strength = real). Every 15 game min
  within 7 tiles: **chase** at ≥ 1.1× the player's fit power, **flee** <
  0.8×, else wander (mercenaries patrol towns). Lairs and towns spawn every
  10 h (max 16). Plate colour by power ratio: weak < 0.5, weaker, even
  0.85-1.15, strong, deadly > 1.7.
- **Encounters** (0.8 tiles): Attack; Flee (15-90%, easier from big bands
  with a small party, harder from raiders; failure forces battle); Take
  ransom (< 0.35× surrender, 6 gold/man); Let them go. Then both break off a
  few hours. Victory destroys the band; defeat/retreat shrinks it by your
  kills. A wiped army gets 3 volunteers at the starting town.
- **Settlements:** villages 1-3 volunteers (40 gold, 48 h refresh); towns 2-4
  trained men (levels 1-3, 60-200 gold) and a market (10 wares at 1.5×
  value, buys at value, 72 h). Deterministic per settlement and epoch; save
  records purchases only. **Rest** 8 h; town **physician** 1 gold per
  wound-hour.
- **Wounds:** a struck-down hero may be **knocked out** (40%, +3% per END
  above 5, perks): 36 h wound, half XP; sits out unless all are wounded.
  Heal/h: road 1, camp 1.5, village 2.5, town 3.
- **Field camp** (`src/world/camp.ts`, `CampScene`): on open land away from
  settlements; tents, fire, palisade, forge, training ground from
  **supplies**; speeds healing, forages **food**, keeps bands out, repairs,
  drills. One ration per hero per day.

## Hero progression (`src/data/perks.ts`)

- **Attributes** STR, AGI, END, WIL: 5 neutral, max 15; class spread (hoplite
  5/4/6/5, swordsman 6/5/5/4, slinger 4/7/4/5...) plus small variation. Per
  point above 5: STR +0.35 melee dmg, +1 HP, +0.02 charge; AGI +1.5% speed,
  +1.2% accuracy, −1.5% attack/shot time, +0.25 missile dmg; END +3 HP, +5
  stamina, +3% knock-out survival; WIL +3 morale, −3% morale damage taken,
  +0.12 aura/shout radius, −2.5% cooldowns; WIL 9 grants Rally Cry. **2
  points per level**, spent with a preview.
- **Perks:** one point at levels 2, 4, 6, 8, 10; a five-tier tree per class;
  each tier needs the previous tier and level. The three base trees:

| Tier (Lv) | Hoplite | Skirmisher | Warrior |
| --- | --- | --- | --- |
| 1 (2) | Shield Drill: +6% block, +1 armour | Fleet-footed: +8% speed, +10 stamina | Brawler: +1.2 damage, +0.1 shock |
| 2 (4) | **Shield Bash** (ability) | **Volley** (ability) | **Berserk** (ability) |
| 3 (6) | Phalangite: +0.15 reach, +0.15 brace, +1 dmg | Deep Quiver: +40% ammo, +6% acc, +1 range | Bloodlust: kills restore 8 morale, 10 stamina; +6 HP |
| 4 (8) | **Steady Presence** (aura) | **Eagle Eye** (aura) | **Rally Cry** (ability) |
| 5 (10) | Unbreakable: +10 HP, −40% morale damage, +10% survival | Skirmish Master: +2 missile dmg, +6% speed | **Warlord** (aura) |

- **Abilities** are logged `{ kind: 'ability', unit, ability }` orders:
  - *Shield Bash* (12 s; shield and an enemy close in front): 1.5 s stun,
    then **dazed** 2 s (no block, +20% damage taken), shoved half a pace,
    small hit, −6 morale.
  - *Volley* (20 s): missile-men within 6 paces with a target loose two free
    shots (+30% damage, +10% accuracy).
  - *Berserk* (40 s): 8 s: +50% damage, 25% faster blows, +0.5 morale shock,
    +10% speed, no rout; block ×0.6, armour −2; −15 stamina after.
  - *Rally Cry* (45 s): allies within 4 paces (+WIL) regain 35% morale;
    routing men there return.
- **Auras** (recomputed every 0.5 s, include the holder): *Steady Presence*
  (r 3.5) −20% morale damage, +1 morale/s even in melee; *Eagle Eye* (5)
  +12% accuracy, +15% missile dmg; *Warlord* (3) +12% melee dmg.
- Bots level by class and use abilities: bash when engaged, fury in frontal
  melee, volley with ≥ 2 shooters on target, shout when men waver.

## Heroes and the army

- 1 hero = 1 soldier; ≤ 20 heroes; names unique in the roster (36-48 per
  culture, then numbered: "Hanno II"). Level 1-10, XP, 1-2 traits,
  attributes, perks, a look (skin, hair, beard, tunic) and five gear slots.
- HP, morale, stamina derive from level, attributes, traits, perks, gear
  (`src/sim/stats.ts`). HP refills between battles.
- **Permadeath:** heroes killed in battle are removed with their gear.
- **Abandoned battles** (`src/game/campaignBattle.ts`): a campaign battle
  (band or skirmish; not Beast Trial, duels or war) stands from Fight. The
  save records enemy, field, men and deployment orders. If the app closes
  before the end, the next launch resolves it with the pre-battle orders only
  and applies the result (deaths, wounds, XP, gold, band) and shows the
  report. Deterministic, so reopening can't reroll it. Leaving during
  deployment is free.
- **Traits** (`src/data/traits.ts`): Veteran, Steady, Swift, Brute,
  Keen-eyed, Stalwart, Tough, negative Skittish. May gain one at levels 3, 5,
  8 (Skittish → Steady).
- **Groups:** I Phalanx, II Skirmish, III Reserve, IV Flank, set in
  deployment.

## Unit classes (`src/data/classes.ts`)

`Hero.cls` is one data entry: role, attribute spread and growth, combat
modifiers, gear by tier (recruit / veteran / elite), cultures, bot budget
cost, default group, five-tier perk tree, clothing colours.

| Class | Role | Cost | Cultures | Notes |
| --- | --- | --- | --- | --- |
| Militia | levy | 64 | all | cheap, brittle; village recruits |
| Spartan hoplite | heavy | 100 | Greek | braced spear wall, the anti-cavalry line |
| Thureophoros | heavy | 85 | Greek, Punic | flexible medium foot |
| Celtic swordsman | heavy | 80 | Celtic | shock infantry |
| Thracian rhomphaia | heavy | 85 | Greek | shield breaker, weak to missiles |
| Cretan archer | ranged | 47 | Greek, Punic | longest range, armour piercing |
| Rhodian slinger | ranged | 47 | all | most ammunition |
| Peltast javelineer | ranged | 45 | all | heavy short-range volleys |
| Scythian horse archer | ranged (mounted) | 75 | Punic, Celtic | shoots on the move, kites |
| Peltast | light | 65 | Greek, Celtic | throws then closes; hunts archers |
| Thracian falx | light | 75 | Greek, Celtic | fast, hits hard, no shield |
| Gallic warband | light | 70 | Celtic | cheap fierce charge |
| Fanatic | light | 70 | any (bands) | hardly breaks (morale loss ×0.65) |
| Companion cavalry | cavalry | 155 | Greek | shock riders: flank and rear charges |
| Thessalian horse | cavalry | 115 | Greek, Punic | lighter riders, throw then charge |
| Scythed chariot | cavalry | 255 | Punic | breaks loose foot, dies in rough ground |
| Royal guard | elite | 125 | Greek | elite line |
| Sacred Band | elite | 115 | Greek | elite line |
| Wolf | beast | 53 | — | packs, flank, bolt when hurt |
| Wild boar | beast | 107 | — | armoured charge |
| Brown bear | beast | 250 | — | cleaves and knocks men down |

**Class-only perks** (mixed with the base trees): *Drilled* (+5 morale, +4%
block), *Iron Discipline* (+6 morale, −20% morale damage), *Shield Breaker*,
*Reaping Blow*, *Longshot* (+1.5 range), *Lead Bullets*, *Zealot*,
*Horsemanship* (+6% speed, +10 stamina, +6 HP), *Lance Charge* (+0.3 charge
impact), *Parthian Shot* (+8% accuracy, +25% arrows), *Ride Down* (+50% vs
routing), *Scythe Master* (scythes +40%). Off-class perks are blocked
("Another class"). E.g. Companion: *Horsemanship → Lance Charge → Ride Down
→ Rally Cry → Warlord*.

Bows, slings, javelins have **armour pierce**. **Recruitment:** villages
offer militia, slingers, javelineers; towns their culture's classes
(`townClasses`). Bands and garrisons are built by class and tier
(`src/game/enemy.ts`); cavalry from tier 2; neutrals include outlaws, hill
tribes, pirates, deserters, cultists and **beasts** (wolves, boars, bear).

### Mounts

A mount is a **class property, not an item** (`MOUNTS` in classes.ts):
never looted or swapped; rider gear works as on foot (no shield wall or
bash from the saddle).

| Mount | Speed / gallop | +HP | +Stamina | Charge | Footprint | Accel / brake | Turn slow / fast |
| --- | --- | --- | --- | --- | --- | --- | --- |
| horse | ×1.55 / ×1.95 | 14 | 30 | +0.7 | radius 0.48 | 3.2 / 4.5 | 4 / 1.4 rad/s |
| chariot | ×1.6 / ×2.1 | 34 | 40 | +1.0 | radius 0.72 | 2.4 / 3.2 | 2.4 / 0.8 rad/s, scythes 11 |

### Mounted, chariot and animal rules (`src/sim/battle.ts`, `MOUNTED_RULES`)

- **Momentum:** mounted units carry `spd` (mount accel/brake, slow turns at
  speed, no dead stop). Contact at ≥ 55% gallop = speed-scaled **charge
  impact**: damage, 0.7 s stun, shove, −8 morale (40% to nearby men). Riders
  ride through unshielded or missile men; chariots through anything but a
  braced spear wall.
- **Braced spears (front):** impact ×0.25, 1.6 s rear-up stun, rider takes
  ×2.2 and −10 morale. Spearmen hit horses ×1.35; riders miss braced fronts
  20% more.
- Flank/rear charges ×1.3 damage, +1 morale shock; vs routing ×1.5 (more with
  Ride Down). Each horse within 2.5 paces drains foot morale (missile men ×2,
  spear walls 0). Foot take ×1.2 from the saddle.
- Horse archers shoot moving (scatter ×1.3). Chariots scythe everyone passed
  (1/s per man). Forest, rough, water, fords slow and damage chariots and
  slow riders (`cavSpeed`, `cavCharge`, `chariotSpeed`, `chariotDamage`).
- **Animals** (`kind: 'animal'`): no orders; hunt within 9 paces (pack wakes
  together); wolves flank, boars charge, bears knock down. Wound shock ×0.6;
  **flee** at rout threshold, never rally.
- Spacing uses unit radius (outnumbered count: horse ½, animal ⅓).
- Gated on `stats.mount` / `stats.kind`; `tests/fixtures/replay-v2*.json`
  pin hashes (ADR-0001); `server/src/battle.ts` accepts the optional stats.

### Bot AI for classes (`src/sim/ai.ts`)

- **Cavalry** waits until shot at or missile men are in reach, rides wide,
  charges flank/rear or missile men, breaks off after ~4 s melee, repeats.
  Chariots always charge. **Horse archers** orbit at range edge. **Spearmen
  brace** vs frontal riders.

## Equipment

Items are data in `src/data/items.ts`. Slots: weapon, shield, helmet, body
armour, trinket (passive, not drawn). Each owned item has a **rarity**
(common, uncommon, rare, epic, legendary; scales positive stats), a
**condition** 0-100 (low weakens it; repairs cost gold) and optional
**paint** (shield emblem and colours, helmet crest colour).

| Weapon | Role | Notes |
| --- | --- | --- |
| Spear (dory) | melee | reach 1.9–2.0, braces against charges |
| Sword (xiphos, kopis, falcata, longsword) | melee | faster, short reach |
| Axe | melee | slow, pierces shields |
| Club | melee | cheap, extra morale shock |
| Sling | ranged | long range, lots of ammo |
| Bow | ranged | two-handed (no shield), longest range |
| Javelins | hybrid | 3–4 heavy throws, then a short spear |

Shields block frontal hits (hoplon > oval > buckler); hoplon and oval allow
the **shield wall**; no bow with a shield. Epic/legendary items add a
**power**, sets add piece bonuses, named legendaries a fixed power and extra
(`src/sim/powers.ts`). Rules: [ITEMS.md](ITEMS.md).

## Battle simulation (`src/sim`)

Pure TypeScript, no Phaser. 20 ticks/s, seeded `Rng` (mulberry32), no
`Math.random`, facing as a unit vector, id-order updates: same seed + same
orders at the same ticks ⇒ same battle (`Battle.hash()`). Orders (`Order`,
`src/sim/types.ts`) are logged with their tick; `issue()` applies now,
`schedule()` next step. The renderer only reads state and drains events
(`hit`, `block`, `death`, `contact`, `flanked`, `rout`, `shot`, `impact`,
`proc`, `end`, ...). `PowerSystem` (`src/sim/powers.ts`, like
`src/sim/myth.ts`) runs item powers via hooks (hit, hurt, kill, low HP,
timers, auras) on the battle `Rng`, hashed; created only when needed; a
`proc` event floats the power icon.

### Rules

- **Facing:** side hits ×1.3 damage, ×1.8 morale damage; rear ×1.6, ×2.8. A
  unit fighting one enemy keeps facing it.
- **Shields:** block on front hits (35% from the side, never rear), better
  vs missiles. Shield wall: +15% frontal block, harder to push, half speed,
  slower attacks.
- **Braced spears:** a charge onto a braced wall's front: 35% impact, no
  stun, attacker bounces (0.5 s stun, winded, shaken). Free thrust at a man
  running in, ×(1 + 6 × charge bonus) (dory ×3.4).
- **Reach** sets who strikes first; second spear rank fights.
- **Charges:** 0.8 s running = momentum; first blow ×1.4+, extra morale
  damage, short stun.
- **Pace** (`RULES`, `src/sim/battle.ts`): 55% base hit, damage scale 0.34,
  0.5 morale per damage.
- **Missiles:** travel time, lead, scatter; hit whoever is at the landing
  point; limited ammo; javelins held until ordered or charging.
- **Stamina:** below 30, slower moves and blows, worse blocks.
- **Morale:** lowered by damage, nearby deaths and routs, being outnumbered;
  raised by enemy deaths. Rout below 25% (to own edge, extra damage taken);
  rally above 55% once safe. Fled men live but are out.
- **Spacing:** discs push apart; braced walls resist.
- **End:** a side with nobody standing loses; after 5 min the stronger side
  wins or stalemate.
- **Knock-outs:** mortal blows roll knock-out (seeded); `ko` in the result.
- **Retreat** (`{ kind: 'retreat' }`, confirmed): ends as a defeat. Routing
  men (60%) and men in melee (35%) may die, +15% if badly wounded, × enemy
  **pursuit** = enemy men still fighting (stamina-weighted) / (own size +
  own men free to cover) (0.5 equal fresh, 1 broken). No loot, gold only for
  kills so far, full XP for survivors.

### Battle terrain (`src/data/terrain.ts`, `src/sim/terrain.ts`, `src/world/battlefield.ts`)

Seeded grid, one cell per field unit (24 × 36), kind + height 0-3, in
`BattleSetup.terrain` (`{ w, h, cells, height, name }`) so replays never
regenerate. Missing or all-open flat = plain (`tests/terrain.test.ts`).

- **Generation** (`generateBattlefield(seed, site)`): site from the overland
  tile (`siteAt`: terrain, forest share, river within 1, sea within 2,
  mountains → rocks); skirmishes random. Stepped elliptical hills, noise
  forest/scrub, rocks ringed by rough ground, a river with a 3-4 cell ford
  between zones, sea and beach on a flank. Deployment front centres are
  never blocked.
- **Effects** (`TERRAIN` / `HEIGHT_RULES`):

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

  **High ground:** melee +25%/level above, −20% below (cap 2); downhill
  charge +15% impact/level; missiles +12% damage, +0.8 range/level downhill;
  climbing ×0.7 speed, extra stamina. Cover rolls only when in cover.
- **Bot:** line onto clearly higher ground, skirmishers into the nearest
  wood; holds a hill ≤ 50 s (or until shot from below); goes for the ford and
  waits on the bank ≤ 55 s rather than wade under fire.
- **Rendering:** ground painted per pixel from the grid; trees and boulders
  depth-sorted, fading when a soldier is behind; the deployment banner names
  the site.

### Bot AI (`src/sim/ai.ts`)

Same orders as the player. Line: brief wait (shield wall if shot), advance in
formation, charge close. Skirmishers loose, retire behind the line when
threatened or dry. Flankers hit the side of the enemy's largest group.
Reserve commits when the line wavers, the enemy breaks or time runs on.
After 25 s, 8 s with no blow, block or missile commits every able group.

`buildArmy` (`src/game/enemy.ts`): culture, size, level, gear tier, target
power, make-up (`line`, `bandits`, `raiders`, `mercs`); untuned for world
bands. Skirmish foe (`generateEnemyArmy`) is tuned to ~120% of the player's
`heroPower` (`ENEMY_POWER`), an even fight in play.

### Balance (`npm run balance`)

`scripts/dev/balance.mjs` runs `src/dev/balance.ts` headless: 200 matched
battles (`standardArmy` vs its bot army), 100 vs a passive player, rule
tests, perk and terrain mirrors, class round robin
(`src/dev/classBalance.ts`). Current report:

| Metric | Value |
| --- | --- |
| Reference army vs matched bot | win 52% / loss 48% |
| Duration mean / median | 96 s / 85 s; 80% in 60–150 s |
| First group rout after contact (median) | 34–38 s |
| Passive player hits the 5-min limit | 6% |
| Swordsmen charging braced hoplites: attacker routs ≤ 15 s | 0% |
| 3 extra men at the rear vs front: enemy routs at | 13.5 s vs 101 s |
| Perk mirrors (baseline 49%) | Bash 59, Berserk 57, Volley 54, Rally 54, Steady 59, Eagle Eye 52, Warlord 56 |
| Terrain mirrors | flat 46/54; defending a ridge **63/38**; river ford 49/51; generated 45–54% |

Class costs are fitted (budgets 700 and 900) so each class's mean win rate
vs all others is 34-64%; duel points = cost / 10, rounded. Counters: spears
beat riders head on, riders beat missile men, peltasts beat archers, horse
archers bleed heavy foot, militia beat cavalry. `tests/balance.test.ts` and
`tests/abilities.test.ts` check targets, abilities and replay.

## Controls

- Tap a group's card, numeral or soldier to select; tap the soldier again for
  that hero alone (any order detaches him: Solo / Join).
- **Formation drags** (`src/ui/dragFormation.ts`; deployment, battle, raids,
  live duels). **Shape** (Line, Column, Wedge, Loose, Shield wall, files x
  ranks) comes **only from the Formation buttons**.
  - **Move:** drag on/near the selected group (soldier or dashed marker, 30
    px grab radius); offset, facing, shape kept.
  - **Turn:** drag the bronze **knob** 3 paces ahead of the front rank; the
    group turns in place toward the finger, snapping within 8° of the 8
    field directions (haptic); dead zone 0.6 pace. Closer of knob/soldier
    wins.
  - Preview: iso boxes, arrow, knob, "files x ranks" (8X2). Lift commits;
    cancelled if moved < 0.5 pace or turned < 4°. Paces at 1x (36 px tiles),
    scaled with zoom.
- Tap ground: move keeping shape, facing the nearest enemy group from there.
  Tap an enemy: attack. Long-press ground in deployment: terrain tooltip.
- Orders: Hold, Advance, Charge, Throw/Loose, Shield wall, Fall back.
  Formations: Line, Column, Wedge, Loose, Shield wall.
- **Pan versus order:** one-finger drag on empty ground always pans; 10 px
  travel makes a drag. Two fingers pinch-zoom/pan, never order, and cancel a
  formation drag; zoom snaps to whole multiples; wheel zooms. First
  deployment shows a hint (`seenGestureHint`).
- **Abilities:** medallions on the right edge with cooldown sweep and ready
  count; shouts and volleys use the best-placed holder, bash and fury every
  ready holder; an unusable one says why.
- **Camera:** opens at 1× on your army, follows the melee until you pan;
  the eye button resumes.
- Offline battles pause any time (orders allowed). Auto-pause options:
  contact, flanked, routing, hero death (off by default). Online never
  pauses (DESIGN_V2.md "Online battle rules").

## Loot and rewards

Only enemies **your side killed** drop their real gear (with condition and
wear). Picks: victory 3, ≤ 20% men lost 4, flawless 5, stalemate 1, defeat
0. Gold: 20 + 12 per kill (+60 win). XP per survivor: 12 + 10 per kill (+12
win), × XP bonuses; knocked-out heroes half. Results animate XP bars and
level-ups.

## Beast Trial (practice)

`src/scenes/BeastTrialScene.ts`, `trialBattle` in
`src/game/campaignBattle.ts`. Codex → beast → *Fight it*: campaign army vs
the beast at Codex level (army average +1, world boss +3) on its own field,
fresh seed. Practice changes nothing: no hoard, gold, pity, deaths, wounds,
XP, wear or counters; never saved in progress. Results read "Practice: no
spoils". Hoards come only from overland beast bands, lairs, world bosses.

## Saves

`src/game/save.ts`: versioned (`SAVE_VERSION`, migrations, validation):
heroes, stash, gold, `WorldSave` (map seed, time, party, bands with army
seeds, settlement epochs and purchases, camp, world RNG). Split into ≤ 3800
char chunks (`px_part_N` + `px_meta`) for CloudStorage's 4096 limit;
mirrored to localStorage (localStorage only outside Telegram).

**Crash safety:** two alternating part slots (`px_part_N`, `px_part1_N`);
`px_meta` `{v, n, s, pn}` written last points at the current one; the other
is the fallback. An unloadable save is never silently replaced:

- raw text kept in `px_corrupt` / `px_corrupt_N` (first kept; `readBackup`);
- **newer** build (higher version or unknown items): session read-only, menu
  asks to update; a newer server copy is held (`saveSync.ts` `hold`);
- **corrupt** with no backup, mirror or cloud copy: new campaign, menu says
  the old save was kept.

Removing an item def needs a migration. The `battle` field marks a battle in
progress ("Abandoned battles").

## Cloud save (`src/platform`)

The backend (`server/`) is optional: failures flip the sync badge to offline
and retry with backoff; outside Telegram (no `initData`) nothing is sent.

- **Sign-in:** `POST /api/auth/telegram {initData}` at boot; token in memory,
  renewed on 401.
- **Cloud save:** each save has `seq` (+1 per save, across devices) and
  `savedAt`. Local first, then debounced (4 s) `PUT /api/save {revision,
  data}`, flushed on backgrounding. Boot waits ≤ 6 s for `GET /api/save`:
  adopt the server copy if past our revision with no unsynced progress; if
  both changed, higher `seq` wins (`src/platform/saveSync.ts`). 409:
  refetch, keep the more-played copy, retry once.
- **Badge:** synced / syncing / offline in menu, army header, world map.
- **Battle verify:** campaign battle setup, order log, `deployOrders` and
  claim to `POST /api/battle/verify` (fire-and-forget).

## Art pipeline (`src/art`)

All art but icons is generated at boot; icons are two drawn atlases
(`public/icons`, `src/art/iconBitmaps.ts`) with code-drawn fallbacks. Look:
[ART_STYLE.md](ART_STYLE.md).

- `model3d.ts`: pure software renderer; 3D primitives in metres ray-cast
  through the 2:1 dimetric camera, lit upper left, material ramps
  (`materials.ts`), Bayer dither, soft outline.
- `paperdoll.ts`: figures with a per-frame IK skeleton. Sheet: 13 columns
  (`idle0 idle1 walk0-3 atk0-2 hit die0-2`) × 4 facing rows, no mirroring.
  Layers by `art` id (cloak, legs, tunic, armour, arms, head, helmet, shield,
  weapon). Rows render lazily (`ensureDollRow`, `src/ui/sprites.ts`).
- `ground.ts`, `terrainArt.ts` (battlefield); `worldArt.ts`,
  `overlandMap.ts`, `parchmentMap.ts` (maps); `fx.ts` + `src/ui/battleFx.ts`
  (pooled effects); `smoothUi.ts`, `vectorFont.ts`, `vectorIcons.ts`,
  `uiIcons.ts` (UI). `/preview.html` shows sample sheets.

### Isometric projection (`src/art/iso.ts`)

The sim uses flat field coordinates (x lateral, y depth, 24 × 36); only the
renderer projects. One unit = a 36×18 px diamond:

    screen.x = (x − y) · 18        screen.y = (x + y) · 9

Your army stands bottom-left facing up-right. `screenToIso` (exact inverse)
handles every touch. Sprites are foot-anchored, depth-sorted by screen y;
facing row from the projected facing with hysteresis. Native size at 1× (man
~34 px, rider ~60 px on a 390-wide phone); zoom 1-3×. Touch targets cover a
figure's full height.

