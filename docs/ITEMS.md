# Items: rarity, random stats, powers, sets and sources

Status: **built** (`src/data/items.ts`, `src/data/affixes.ts`, `src/data/sets.ts`,
`src/sim/powers.ts`, `src/game/sources.ts`). Where this page and the code
differ, the code wins; tune numbers in the data. 178 items, including 31 set
pieces and 12 named legendaries; the 16 powers have drawn icons.

## Summary

- Rarity adds random stats (uncommon 1 to legendary 4) and, on epic and legendary, a **power** (grade I / II); base stats scale only a little.
- 8 **sets** (3 rare of 3 pieces, 3 epic of 4, 2 legendary of 5) and 12 **named legendaries** (fixed power, one boss each).
- Legendaries and named items come only from beasts, world bosses and ladder bosses; named items and legendary set pieces are **bound**.
- Every item needs attributes (soft penalty) and fits only some classes (hard rule).
- Everything works in duels; the point budget prices rarity, named items and set bonuses.
- Campaign only: the Smith reforges one random stat for gold.

## Anatomy of an item

- **base item** (`ItemDef`: slot, weapon or shield kind, base stats, two-handed, shield wall, `family`, `weight`, optional `set`, `named`, `power`, `fixed`, `bound`);
- **rarity**: scales base stats, sets the random-stat count and power;
- **random stats** (`aff`, compact steps `"atkSpeed:2,hp:1"`): 0 to 4, rolled once;
- **power** (`pow`, epic and legendary only), rolled once from the slot's pool, or fixed on named items;
- condition and paint.

Name: strongest random stat as a word in front, power at the end (*Keen Iron
xiphos*, *Swift Kopis of Frenzy*). Set pieces and named legendaries keep their own name.

Instances store only id, rarity, condition and rolls (steps); stats are
computed at use time on client and server, so a re-tune changes owned items
with no save or server change.

## Requirements and class limits

### Attribute requirements

Heroes have STR, AGI, END, WIL: 4-7 at start by class, +2 points a level, cap 15.

| Item | Main attribute | Second attribute |
| --- | --- | --- |
| Spears, lances, axes, clubs and maces, longswords, falx, rhomphaia | STR | - |
| Short swords, curved swords (kopis, falcata, makhaira, sica) | AGI | STR |
| Bows, slings, javelins | AGI | - |
| Big and long shields | STR | END |
| Light shields (pelte, buckler, caetra) | AGI | - |
| Medium armour | END | - |
| Heavy armour | END | STR |
| Closed helmets (Corinthian, Attic, Chalcidian, Thracian, Phrygian, Illyrian, Boeotian, Montefortino and kin) | END | - |
| Caps, hoods, felt pilos, light armour | none at tier 1, else END | - |
| Trinkets | none at tier 1, else WIL | - |

- Main requirement = **5 / 7 / 9** by tier 1 / 2 / 3, **+0 / +0 / +1 / +2 / +3** for common to legendary.
- Rare set pieces need 9, epic set pieces 11, legendary set pieces and named legendaries 13.
- Second attribute: 3 less than the main one.
- Examples: common Dory STR 5; legendary Sauroter dory STR 12; Pelian ash STR 13; Hephaestean cuirass END 13, STR 10.

**Soft penalty.** Short of a requirement the item still equips; each missing
point takes 10% off all its stats (base and random, at most -70%), and while
any point is missing its power, its set count and named extras are off. The
card shows the requirement in red; equip and compare views show the real
numbers. Enemy and bot heroes get the attributes their gear needs.

### Class limits

Hard rule: a class equips only its weapon families, shield types and armour up
to its weight (the button says which classes can). Helmets and trinkets are
open to all. Gear a class may not use does nothing in battle; the server
refuses to equip it.

| Class | Weapon families | Shields | Armour up to |
| --- | --- | --- | --- |
| Militia | spear, short spear, club, javelins, sling | long | light |
| Spartan hoplite | spear | big | heavy |
| Thureophoros | short sword, curved sword, short spear | long | heavy |
| Celtic swordsman | longsword, short sword, curved sword | long | heavy |
| Thracian rhomphaia | rhomphaia | - | heavy |
| Cretan archer | bow | - | medium |
| Rhodian slinger | sling | - | light |
| Peltast javelineer | javelins | light | light |
| Scythian horse archer | short bow | - | heavy |
| Peltast | javelins, short spear | light, long | light |
| Thracian falx | falx | - | light |
| Gallic warband | axe, longsword, club | long | light |
| Fanatic | club, axe, short sword, curved sword | light | light |
| Companion cavalry | lance, curved sword | big (with a one-handed sword) | heavy |
| Thessalian horse | javelins, short sword | light | medium |
| Scythed chariot | curved sword, short sword, axe | - | heavy |
| Royal guard, Sacred Band | spear | big | heavy |

Families: **spear** (dory family, hasta, sarissa), **short spear** (longche,
Celtic leaf spear), **lance** (xyston, kontos), **javelins**, **short sword**
(xiphos family, akinakes, gladius), **curved sword** (kopis, falcata,
makhaira, sica), **longsword**, **axe** (axes, labrys), **club** (club, mace),
**falx**, **rhomphaia**, **sling**, **bow**, **short bow** (Scythian,
gorytos). Shields: **big** (hoplon family), **long** (oval family), **light**
(pelte, buckler, caetra). Armour weight: **light** (leather, hide, felt,
quilted, spolas), **medium** (linothorax family except plated, horn scale,
the Immortal's scale coat), **heavy** (scale, mail and cuirass families,
plated linothorax). Set pieces and named items follow the same rules.

## Rarity tiers

| Rarity | Colour | Base stats | Random stats | Steps per stat | Power | Duel points |
| --- | --- | --- | --- | --- | --- | --- |
| Common | grey | ×1.00 | 0 | - | - | 0 |
| Uncommon | green | ×1.03 | 1 | 1-2 | - | 1 |
| Rare | blue | ×1.06 | 2 | 1-2 | - | 2 |
| Epic | purple | ×1.07 | 3 | 1-2 | grade I | 4 |
| Legendary | gold | ×1.08 | 4 | 1-2 | grade II | 6 |
| Named legendary | gold, red gem on the frame | ×1.08 | fixed | fixed | fixed, grade II | 7 |

Steps (`AFFIX_STEPS`) are rolled per stat; a step is a fixed size per stat, so
balance can retune a stat without touching saves.

## Random stats

- Each stat comes from the pool of the item's slot (and weapon kind: a bow never rolls melee damage); never twice on one item.
- The stat the base item is about counts double (shield: Block, Armour; bow: Missile damage, Range).
- "Campaign and war map only" stats can roll anywhere but do nothing in duels (the card says so); they never roll on duel items.
- Rolls are a pure function of uid, base item and rarity (an item without `aff` rolls from a hash of its uid, client and server alike); an item may store them (`aff`, `pow`). Shop and merchant purchases store the rolls their offer card showed.

| Stat | Word | One step | Slots | Note |
| --- | --- | --- | --- | --- |
| Max HP | Hale | +3 | S H A T |  |
| Melee damage | Keen | +0.5 | Wm T |  |
| Missile damage | Deadly | +0.6 | Wr T |  |
| Attack speed | Swift | +3% | Wm T | divides attack time |
| Accuracy | True | +1.5% | Wm Wr H T |  |
| Armour (max defence) | Warded | +0.5 | S H A |  |
| Block | Stalwart | +2% | S |  |
| Morale | Brave | +3 | S H T |  |
| Stamina | Tireless | +6 | A T |  |
| Move speed | Fleet | +1.5% | H A T |  |
| Charge bonus | Driving | +0.04 | Wm S | spears, lances, swords on mounts |
| Block pierce | Hooking | +2% | Wm |  |
| Armour pierce | Piercing | +3% | Wr | missiles |
| Morale shock | Dread | +4% | Wm H |  |
| Ammo | Plenty | +2 (javelins +1) | Wr |  |
| Range | Far | +0.4 | Wr |  |
| Morale loss taken | Steady | -3% | H A T | multiplies moraleLoss |
| Knock-out chance (survive a mortal blow) | Lucky | +3% | H A T | campaign and war map only |
| Bonus XP after battle | Wise | +5% | H T |  |
| Bonus gold after battle | Gilded | +5% | T | campaign and war map only |
| Wear taken | Sturdy | -15% | Wm Wr S H A | campaign and war map only |

Slots: Wm melee weapon, Wr ranged weapon (bows, slings, javelins), S shield,
H helmet, A armour, T trinket.

## Powers

Epic gear rolls one at grade I, legendary at grade II, from its slot's powers;
named legendaries have a fixed one. One power per item; the same power on two
items does not stack (higher grade counts). Chances use the battle's seeded
RNG (replays and server verification match); per-unit power state is in
`Battle.hash()`. A proc emits a `proc` event and floats the power's icon over
the hero (`PROC_ICON`, `src/ui/battleFx.ts`). `PowerSystem` is created only
when a unit carries a power, a set special or a named extra.

| Power | Slots | Grade I (epic) | Grade II (legendary) |
| --- | --- | --- | --- |
| **Blood Price** | melee weapon | 8% chance on hit: double damage, wearer loses 5% of max HP (never below 1) | 10% chance, same cost |
| **Battle Frenzy** | weapon, trinket | on a kill: +20% attack speed (and shot speed) for 6 s (refreshes, does not stack) | +25% for 6 s |
| **Sunder** | weapon | 8% chance on hit: target max HP -10% for 8 s (HP capped to the new max) | 10% chance, -12% for 8 s |
| **Rend Armour** | weapon | 10% chance on hit: target armour -1.5 for 6 s, stacks twice | 12% chance, armour -2, stacks twice |
| **Second Wind** | armour, trinket | once per battle, below 30% HP: heal 15% of max HP and +30 stamina | heal 20% and +40 stamina |
| **Aegis** | shield | every 16 s the next frontal or side hit (blow or missile) is blocked for sure | every 13 s |
| **Retribution** | armour, shield | melee attackers take 8% of the damage they deal back (armour does not stop it) | 10% back |
| **Wolf's Hunger** | melee weapon | heal 5% of the damage dealt | heal 7% |
| **Terror** | weapon, helmet | on a kill: enemies within 3 units of the fallen lose 4 morale | lose 5 morale |
| **Steadfast** | helmet, trinket | aura: allies within 3 units (the wearer too) take 5% less morale damage | 7% less |
| **Eagle Eye** | ranged weapon | 15% chance a missile ignores block | 20% chance |
| **Twin Shot** | ranged weapon | 10% chance to loose a second missile for free (no ammo) | 13% chance |
| **Unshaken** | armour, helmet | charges (and a beast's charge or leap) cannot stun the wearer; charge damage taken -20% | -30% |
| **Momentum** | spear or lance, shield, trinket | charge impact damage +25% and charge stun +0.3 s | +35% and +0.4 s |
| **Last Stand** | armour, trinket | below 25% HP: +20% damage and the wearer cannot rout | +30% damage |
| **Executioner** | weapon | +30% damage against targets below 30% HP | +40% |

Powers that read HP, armour or morale work on beasts too; a beast's max HP
can be sundered at most once at a time. `powerReport` in
`src/dev/rarityBalance.ts` shows what each power adds.

## Sets

Set pieces are their own base items; they always drop at their set's rarity
with its random stats but **no random power** (the set bonus is the power).
Bonuses count pieces worn (a two-handed weapon keeps a worn set shield's
count, but the shield gives no stats). Special lines run in
`src/sim/powers.ts`, numbers in `SET_RULES` (`src/data/sets.ts`).

| Set | Rarity | Pieces (`id`: slot, built on) | Bonuses |
| --- | --- | --- | --- |
| **Agoge of Sparta** | rare | `agoge_dory` weapon, Dory spear; `agoge_pilos` helmet, Pilos helmet; `crimson_exomis` armour, Spolas | 2: +6 morale. 3: -20% morale loss, +3% block |
| **Peltast of Thrace** | rare | `fox_alopekis` helmet, Felt hood; `peltast_crescent` shield, Pelte; `thracian_darts` weapon, Akontia javelins | 2: +6% move speed. 3: +1 javelin throw, +1.3 missile damage |
| **Cretan Bowman** | rare | `gortyn_bow` weapon, Cretan bow; `cretan_cap` helmet, Leather cap; `gortyn_string` trinket, Archer's thumb ring | 2: +0.6 range. 3: +5% accuracy, +4 arrows |
| **Warband of Brennus** | epic | `brennus_blade` weapon, Celtic longsword; `boar_crest_helm` helmet, Coolus helm; `brennus_mail` armour, Noble's mail; `spiral_shield` shield, Bronze-bossed shield | 2: +1.5 melee damage. 3: +8% attack speed. 4: War Cry |
| **Immortals of Persia** | epic | `immortal_bow` weapon, Persian bow; `immortal_scale` armour, Persian scale coat; `immortal_tiara` helmet, Persian tiara; `golden_apple` trinket, Golden bulla | 2: +2% accuracy. 3: +2 ammo. 4: Rain of Arrows: every 5th shot looses 2 extra arrows |
| **Sacred Band of Thebes** | epic | `theban_dory` weapon, Sauroter dory; `band_shield` shield, Argive aspis; `theban_helm` helmet, Corinthian helm; `theban_linothorax` armour, Plated linothorax | 2: +2 morale. 3: +0.25 armour. 4: Bond of the Band: each other set wearer within 3 units gives +2% damage, +1% block (up to 4) |
| **Arms of Achilles** | legendary | `pelian_ash` weapon, Ash-wood dory; `achilles_shield` shield, Silver aspis; `achilles_helm` helmet, Attic helm; `hephaestean_cuirass` armour, Muscle cuirass; `thetis_anklet` trinket, Gold torc | 2: +3 HP. 3: +0.4 melee damage. 4: +1 armour. 5: Heel of Achilles: -50% damage from front and side hits; rear hits +50% |
| **Panoply of Alexander** | legendary | `alexander_kopis` weapon, Kopis; `ilion_shield` shield, Hoplon; `lion_scalp_helm` helmet, Phrygian helm; `issus_linothorax` armour, Painted linothorax; `bucephalus_bit` trinket, Horse pendant | 2: +8 morale. 3: +8% move speed. 4: +0.15 charge bonus. 5: Born to Rule: allies within 4 units +10% damage, +10 morale; while the wearer stands his group cannot rout |

**War Cry**: the first time the foe comes within 4 units, the enemies there
lose 10 morale (once per battle; it fires when the lines close, since armies
deploy 8+ units apart); the wearer's charges +20% morale shock.

Sources: the rare sets from ladder chapter 1 / 2 / 3 top chests, trading
posts and tier-3 campaign bands; the epic sets from trading posts (epic
slot), beast hoards, lair hoards, ladder chapter 4 / 5 chests (Brennus,
Immortals) and the ranked season reward (Sacred Band); Achilles from the
Kraken, Alexander from the Titan, both also from the campaign arc. Realms per
set: `REALM_SETS` (`src/online/merchants.ts`).

## Named legendaries

Always legendary: base item at ×1.08, fixed random stats, the extra below and
a fixed grade II power. Copies are not limited in an army; a world boss gives
at most one copy of its named item per player per season.

| Item | Slot | Built on | Power (II) | Extra | Source |
| --- | --- | --- | --- | --- | --- |
| **Club of Herakles** (`herakles_club`) | Weapon | Club | Terror | +10% morale shock | Nemean Lion |
| **Nemean lion pelt** (`nemean_pelt`) | Armour | Hide jerkin | Unshaken | -40% missile damage taken | Nemean Lion |
| **Bow of Philoctetes** (`philoctetes_bow`) | Weapon | Composite bow | Sunder | +0.5 range | Hydra |
| **Horn of the Minotaur** (`minotaur_horn`) | Trinket | Boar tusk | Momentum | +6 HP | Minotaur |
| **Hammer of the Cyclopes** (`cyclops_hammer`) | Weapon | Bronze mace | Rend Armour | +1 melee damage | Cyclops |
| **Harpy-wing helm** (`harpy_helm`) | Helmet | Chalcidian helm | Battle Frenzy | +3% move speed | Harpies |
| **Chimera-hide cuirass** (`chimera_cuirass`) | Armour | Horn scale | Retribution | none (armour 4.5, the base's) | Chimera |
| **Trident of Poseidon** (`poseidon_trident`) | Weapon | Hasta | Executioner | heavier haft: attack 1.25 s, charge bonus 0.35 | Kraken |
| **Aegis of Zeus** (`aegis_of_zeus`) | Shield | Silver aspis | Aegis | none: block 0.45, armour 1, +2 morale | Titan |
| **Golden Fleece** (`golden_fleece`) | Trinket | Gold stag plaque | Second Wind | +10% bonus XP (base +1 morale, +0.05 charge, no HP) | ladder floor 50 boss |
| **Helm of Hades** (`helm_of_hades`) | Helmet | Iron Boeotian helm | Steadfast | enemy missiles -30% accuracy against the wearer (armour 3) | ladder floor 40 boss |
| **Harpe of Perseus** (`harpe_of_perseus`) | Weapon | Sica | Blood Price | +5% attack speed | ladder floor 30 boss |

Fixed stats are `fixed` in `src/data/items.ts`. The non-stat extras are
`ItemDef.missileWard` (pelt: missiles and hurled boulders deal 40% less) and
`ItemDef.shroud` (helm: enemy missiles aim with 0.30 less accuracy); like a
power, they work only while the wearer meets the requirements.

## Where items come from

| Source | Common | Uncommon | Rare | Epic | Legendary | Sets | Named |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Campaign battles (enemy gear, `rollRarity` by band tier) | yes | yes | yes | tier 2-3 | - | rare set pieces: 4% of the rare pieces tier-3 bands carry | - |
| Campaign lair hoards (a fallen lair, once each) | yes | yes | yes | 1 sure | pity only | 25% of the sure epic is the lair culture's epic set | - |
| Campaign arc: the host, then reborn lairs | - | - | - | - | - | one missing piece of the campaign's legendary set | - |
| Campaign and war-map beasts (`rollBeastRarity`: rare 50 / epic 35 / legendary 15) | - | - | yes | yes | yes | 25% of epic drops are epic set pieces | 20% of legendary drops are the beast's named item |
| World bosses (Kraken, Titan) | - | - | - | yes | yes | legendary set pieces | Kraken: Trident; Titan: Aegis |
| War-map merchants, towns | basic | regional | 1 a day | - | - | - | - |
| War-map trading posts | - | - | yes | 1 a day | - | every piece of the realm's rare set; the epic is a piece of the realm's epic set 1 day in 3 (`REALM_SETS`) | - |
| War-map marketplace (players) | yes | yes | yes | yes | yes | rare and epic pieces | never (bound) |
| Duel shop (Glory) | yes | yes | yes | daily offer | - | - | - |
| Duel ladder, won floor (25% on replays) | yes | yes | yes | tier 3 | boss floors | - | floors 30 / 40 / 50 bosses |
| Duel ladder chapter chests (top tier) | - | - | yes | yes | yes | chapters 1-3: that chapter's rare set; 4-5: Brennus, Immortals | - |
| Ranked and unranked duels (per-duel spoils) | yes | yes | yes | - | - | - | - |
| Ranked season rewards | - | - | - | Strategos, Legend | - | Sacred Band piece of choice | - |

Numbers in `SOURCES` (`src/game/sources.ts`) and `SPOILS` (`src/duel/rules.ts`).

- **Loot follows the army** (`armyPick`). 70% of the time a weapon, shield or
  armour is re-picked among those a class of the player's army (duel or war
  army) can use; helmets and trinkets are unaffected. Applies to per-player
  picks: campaign beast hoards and town wares, ladder drops and chests,
  per-duel spoils, world-boss hoards and chests. Shared stock follows no
  army: war-map merchants (per region and UTC day), the duel shop's daily
  offers (per UTC day), a war-map lair's hoard.
- **Campaign bands** (`bandSetPieces`, seeded by the band). Each rare piece a
  tier-3 band hero wears is, 4% of the time, swapped for the set piece of that
  slot his class can use: archers Cretan, javelineers and peltasts Peltast,
  the rest of a Greek band Agoge; Celtic and Phoenician line troops none.
  Tier 3 (`lairTier`): from day 50 or 2 fallen lairs; a new band where danger
  is over 0.85, and after 2 fallen lairs every raider and mercenary band.
  About one rare set piece per 12 tier-3 wins.
- **Campaign arc.** A fallen lair's hoard (`lairHoard`, `Campaign.lairHoard`):
  3 pieces of tier-2+ gear, seeded by world and lair, following the army; the
  first a sure epic, 25% a piece of the lair culture's epic set (Greek Sacred
  Band, Phoenician Immortals, Celtic Brennus); the others `rollRarity(tier 3)`.
  Counts on the pity counter. The host and each reborn lair drop one piece of
  the campaign's legendary set (`arcSet`: Achilles or Alexander, fixed per
  world) the player does not own (`arcSetPiece`); nothing once all five are owned.
- **Beast hoards** (campaign beast bands, war-map lairs: `hoardItem`; the
  Beast Trial is practice and drops nothing). 25% of epic drops are an epic
  set piece (Brennus, Immortals, Sacred Band), 20% of legendary drops the
  beast's named item (into a free slot of its kind).
- **Per-duel spoils.** Won unranked duel: 8% chance of an item, won ranked
  12% (common 50 / uncommon 35 / rare 15). First ranked live win of each UTC
  day drops one for sure, at least uncommon (`duel_profiles.spoils_day`).
  Raids: half the ranked chance, no daily guarantee. Generated on the server
  from the match (or raid) seed and side, into the duel stash.
- **Ladder bosses.** First clear of floor 30, 40 or 50: 25% chance of that
  floor's named item (Harpe of Perseus, Helm of Hades, Golden Fleece), else
  `rollBeastRarity`; won replays 2% (else the usual 25% farm drop).
- **World bosses** (`bossChest`, `world_boss_chests`). Every contributor with
  at least 5% of the damage gets a chest on top of the hoard split: 40% a
  piece of the boss's legendary set they do not own yet this season (stash
  and heroes), else an epic once they own all five; 10% the boss's named
  item, at most one per player and boss per season (a second becomes an
  epic); else an epic piece.
- **Bad-luck protection** (`pityChest`). A non-legendary beast or world-boss
  chest adds 1 to a per-player counter; at 8 the next is legendary (its best
  piece turns legendary, the beast's named item 20% of the time; a world-boss
  chest gives a missing set piece, else the named item, else a legendary
  piece) and the counter resets; any legendary resets it. Counted chests: a
  won beast battle's loot and a fallen lair's hoard in the campaign (`pity`
  in the save); a slain lair beast's hoard and a world-boss chest on the war
  map (`loot_pity` track `war`, kept across seasons); a ladder boss floor's
  first-clear drop (track `duel`).
- **Bound items.** Named legendaries and legendary set pieces (`bound: true`)
  are refused by the marketplace (`bound_item`), merchant sale and the duel
  shop's buy-back; they are salvaged for a quarter of their value
  (`salvageValue`): gold in the campaign (town market sell button), gold on
  the war map (army screen, `POST /api/online/salvage`), Glory in duels
  (`POST /api/duel/shop/salvage`, a quarter of the shop price).
- **Stashes stay separate**: duel sources fill the duel
  stash, war and campaign sources the war or campaign stash.
- Server item rows carry `aff` and `pow`; only the server creates them
  (clients never send stats); marketplace escrow keeps them. Server code:
  `server/src/loot.ts`, `server/src/online/bosses.ts`,
  `server/src/duel/live.ts`, `async.ts`, `season.ts`; migration
  `0015_item_sources.sql`.

## Duel fairness

- Item points (`RARITY_POINTS`): 0 / 1 / 2 / 4 / 6, a named legendary 7
  (`NAMED_POINTS`). Each active set bonus line costs 1 point (`setLines`:
  pieces count as in battle, only those the hero's class may use and whose
  requirements he meets; a full legendary set on one hero: 5 × 6 + 4 = 34).
- Powers are allowed in ranked: deterministic in the seeded sim, verified by replay.
- Economy stats (gold, knock-out, wear) do nothing in duels.

## Balance targets

- Full kit of one rarity vs a full common kit, same hero and class, `npm run
  balance` win rate: uncommon 58%, rare 66%, epic 76%, legendary 85%.
- A proc power is worth about two steps of the stat it bends; a power that
  wins more than 60% against the same item without it is too strong.
- A legendary 5-piece set bonus beats a fifth random legendary item by about
  as much as one more legendary item.

Measured (rarity mirror, `src/dev/rarityBalance.ts`, level 5 / 10, 400 seeds):
uncommon 58 / 58, rare 68 / 64, epic 77 / 73, legendary 88 / 86. Without
powers epic wins 67 / 66 and legendary 78 / 77: a full set of powers is worth
about 10 points.

## Item power cap

**No single item may add more than 10 win-rate points.**

Measured by `itemCapReport` (`src/dev/rarityBalance.ts`, printed by `npm run
balance`): the rarity mirror's reference army (six hoplites, a swordsman, two
peltasts, a slinger, all common, level 5 and 10). Side 0 fits the item to
every man whose class may use it; side 1 is the same army without it. An item
no man can use (a bow, a Sacred Band piece) replaces the last four men with
the class that wears it most. A set is judged by its bonus lines: both sides
wear the pieces, side 1 with the bonus off. Delta = win rate - 50; a row is
OVER when more than one standard error (50/√n) above the cap.

| Rule | Value |
| --- | --- |
| Cap | +10 points at level 5 and level 10 |
| Cases | a plain legendary in each slot (rolls vary by seed), each named legendary, each set's bonus |
| Judged at | 400 seeds (1 SE 2.5 points); `npm run balance` prints 120 seeds (1 SE 4.6) |

Accepted exceptions: a plain legendary **weapon** (+13 / +9; +11.7 at level 5
over 1,200 seeds) and **shield** (+10 / +12; +11.3) sit just above the cap.
They are the reference the cap is set against and the legendary kit is on
target.

## Reforging at the Smith

The campaign's endgame gold sink.

- **Where**: the Smith row of every town's Services tab; open when the market
  is shut or sacked. Campaign only.
- **What**: any worn or stashed item with a random stat (uncommon and finer,
  set pieces included). Named legendaries keep their fixed stats.
- **How**: the player picks one line; it is drawn again from the item's
  normal pool (drop weights) minus its other lines, with normal steps (1–2).
  The line's own stat can come back. Other lines (in order), power, rarity,
  condition and value stay. Stored in `aff`.
- **Price**: `round5(base[tier] × rarity)`, base 20 / 40 / 80 for tiers 1–3,
  rarity ×1 / 1.5 / 2 / 3 for uncommon to legendary (20 g to 240 g). Flat, no
  cap, no refund.
- **Determinism**: the world RNG draws (`World.rng`) and the game saves at
  once, so an app kill can neither undo nor repeat a reforge.
- **Power**: never above a drop's roll. A legendary kit with every line at 2
  steps beats the natural one 62 / 60% (L5 / L10), with the best stats of each
  pool 69 / 66%: about 3.5 points an item. Perfecting one line of a tier-3
  legendary costs about 960 g or more.

## Open questions

1. A war-map or duel reforge (Glory); it needs the server.
2. Should the war-map season reset take legendary set pieces with it (season
   items) or keep them like the duel army keeps its gear?
