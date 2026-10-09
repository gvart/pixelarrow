# Items: rarity, random stats, powers, sets and sources

Status: **partly built**. Step 1 (random stats, requirements, class limits,
the 43 new items, set stat bonuses, the item card) and step 2 (powers, set
special lines and the named items' extras in battle, `src/sim/powers.ts`;
the rebalance below) are in. Step 3 is next: drop sources for set pieces and
named items, loot weighted to the army's classes, per-duel spoils, bad-luck
protection and duel point costs. Where this page and the code differ, the
code wins.

Before this work an item's rarity only multiplied its
base stats (×1 to ×1.6, `RARITY_MULT` in `src/data/items.ts`), so a
legendary was a bigger common. This document turns rarity into what the item
*does*: random stats, a power on epic and legendary gear, item sets and
named legendaries, and decides where each kind of item comes from. The
numbers are starting values for `npm run balance`; change them in the data,
not here, once it is built.

New items: 31 set pieces and 12 named legendaries, each with its drawn icon,
as are the 16 powers. With them the game has **178 items**.

## Summary

| Topic | Decision |
| --- | --- |
| Common | the base item only |
| Uncommon | +1 random stat |
| Rare | +2 random stats |
| Epic | +3 random stats and 1 **power** (grade I) |
| Legendary | +4 random stats and 1 **power** (grade II) |
| Random stats | rolled from the slot's pool, never the same stat twice on an item; each rolls 1-2 **steps** |
| Base stats | still scale with rarity, but less: ×1, 1.03, 1.06, 1.07, 1.08 (was up to ×1.6): the random stats and the power carry the difference |
| Powers | 16 proc and aura effects (double hit at a blood price, attack speed on kill, max-HP sunder...), in two grades |
| Sets | 3 rare sets (3 pieces), 3 epic sets (4 pieces), 2 legendary sets (5 pieces); bonuses at 2, 3, 4, 5 pieces |
| Named legendaries | 12 fixed items with a fixed power and story, each from one boss |
| Sources | common to epic from battles and shops, epic sets from trading posts, beasts and late ladder chests, legendaries and named items only from beasts, world bosses and ladder bosses |
| Duels | everything works in duels (powers are deterministic in the seeded sim); the point budget prices rarity, named items and set bonuses |
| Trading | named legendaries and legendary set pieces are **bound**: never on the marketplace |
| Requirements | every item needs attribute points (STR, AGI, END, WIL) by tier and rarity; short of them it still works, weaker (soft penalty) |
| Class limits | each class can use only its weapon families, shield types and armour weight (hard rule) |

## Anatomy of an item

An owned item is:

- its **base item** (`ItemDef`: slot, weapon or shield kind, base stats, two-handed, shield wall);
- its **rarity**, which scales the base stats a little and sets how many random stats and whether a power it has;
- its **random stats** (affixes): 0 to 4, rolled once when the item is made;
- its **power** (epic and legendary only), rolled once from the slot's pool, or fixed on named items;
- optionally its **set** (set pieces are their own base items);
- its condition and paint, as today.

The name shows the strongest random stat as a word in front and the power
at the end: *Keen Iron xiphos*, *Swift Kopis of Frenzy*. Set pieces and named
legendaries keep their own name.

## Requirements and class limits

### Attribute requirements

Heroes have four attributes (STR, AGI, END, WIL), start at 4-7 by class, gain
2 points a level and cap at 15, so a level-10 hero reaches about 13-15 in his
main attribute. Every item now asks for some of them.

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

Main requirement = **5 / 7 / 9** by item tier 1 / 2 / 3, **+0 / +0 / +1 / +2 / +3**
for common / uncommon / rare / epic / legendary. Rare set pieces need 9, epic
set pieces 11, legendary set pieces and named legendaries 13. The second
attribute needs 3 less than the main one.

Examples: a common Dory needs STR 5 (any recruit); a legendary Sauroter dory
STR 12; Pelian ash STR 13; a Hephaestean cuirass END 13 and STR 10.

**Soft penalty.** A hero short of a requirement can still equip the item;
each missing point takes 10% off all its stats (base and random, at most
-70%), and while any point is missing its power and its set count are off.
The item card shows the requirement in red and the penalty; the equip and
compare views show the real numbers. Enemy and bot heroes are generated with
the attributes their gear needs.

### Class limits

A class can equip only its weapon families, shield types and armour up to its
weight. This is a hard rule: the item cannot be equipped (the button says
which classes can). Helmets and trinkets are open to every class.

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
quilted, spolas), **medium** (the linothorax family except plated, horn scale,
the Immortal's scale coat), **heavy** (scale, mail and cuirass families,
plated linothorax).

These come from each class's current starting kit, so no class loses its
own gear. Set pieces and named items follow the same rules (the Arms of
Achilles fit hoplites and guards, Brennus's warband the Celtic swordsman).

**Loot follows the army.** 70% of weapon, shield and armour drops and shop
offers fit a class in the player's army (duel army or war army), 30% are
any item (to sell, or for future recruits).

**Existing heroes.** Gear a hero's class may not use does nothing in battle,
wherever it comes from. Campaign saves (v5) move it to the stash with a
one-time note; war and duel armies on the server keep it equipped (shown in
red) until the player swaps it, and the server refuses to equip it again.
Gear a hero lacks the stats for stays on with the soft penalty. Duel respec
(20 Glory × level) stays as it is.

## Rarity tiers

| Rarity | Colour | Base stats | Random stats | Steps per stat | Power | Duel points |
| --- | --- | --- | --- | --- | --- | --- |
| Common | grey | ×1.00 | 0 | - | - | 0 |
| Uncommon | green | ×1.03 | 1 | 1-2 | - | 1 |
| Rare | blue | ×1.06 | 2 | 1-2 | - | 2 |
| Epic | purple | ×1.07 | 3 | 1-2 | grade I | 4 |
| Legendary | gold | ×1.08 | 4 | 1-2 | grade II | 6 |
| Named legendary | gold, red gem on the frame | ×1.08 | fixed | fixed | fixed, grade II | 7 |

Steps are rolled per stat, so two rares of the same base item differ (step 2
first had epic and legendary at 2-3 steps and base stats up to ×1.20; the
rebalance against the targets below brought both down, `AFFIX_STEPS` and
`RARITY_MULT`). A step
is a fixed size per stat (table below); storing steps instead of values lets
balance retune a stat without touching saves.

## Random stats

Rules:

- Each stat comes from the pool of the item's slot (and weapon kind: a bow
  never rolls melee damage); the same stat never rolls twice on one item.
- Weighting: the stat the base item is about counts double (a shield rolls
  Block and Armour more often, a bow Missile damage and Range).
- Stats marked "campaign and war map only" can roll on any item but do
  nothing in duels (the card says so).
- Random stats and the power are a pure function of the item's uid, base item
  and rarity, so every item, old ones included, has them without a save
  change; an item may also store them (`aff`, `pow`). Shop and merchant
  purchases store the rolls their offer card showed.

| Stat | Word | One step | Slots | Note |
| --- | --- | --- | --- | --- |
| Max HP | Hale | +3 | S H A T |  |
| Melee damage | Keen | +0.5 | Wm T |  |
| Missile damage | Deadly | +0.6 | Wr T |  |
| Attack speed | Swift | +3% | Wm T | new stat: divides attack time |
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

Examples (base stats already scaled by rarity):

| Item | Rolls |
| --- | --- |
| Uncommon Xiphos | dmg 8.2, reach 1.1, attack 1.0 s; **Swift** +6% attack speed (2 steps) |
| Rare Hoplon | block 0.48, armour 1.1; **Stalwart** +4% block (2), **Brave** +3 morale (1) |
| Epic Kopis of Frenzy | dmg 10.2; **Keen** +1.0 dmg (2), **Hooking** +4% block pierce (2), **True** +1.5% accuracy (1); power **Battle Frenzy I** |
| Legendary Composite bow of Twin Shot | missile dmg up 8%; **Deadly** +1.2 (2), **Far** +0.8 range (2), **Plenty** +4 arrows (2), **Piercing** +3% armour pierce (1); power **Twin Shot II** |

## Powers

Epic gear rolls one power at grade I, legendary gear at grade II, from the
powers its slot allows. Named legendaries have a fixed one. A hero can carry
several powers (one per item); the same power on two items does not stack
(the higher grade counts). Chances use the battle's seeded RNG, so replays and
server verification still match. A proc shows its power icon over the hero
(the battle FX already used for abilities).

| Power | Slots | Grade I (epic) | Grade II (legendary) |
| --- | --- | --- | --- |
| **Blood Price** | melee weapon | 8% chance on hit: the hit does double damage, and the wearer loses 5% of max HP (never below 1) | 10% chance, same cost |
| **Battle Frenzy** | weapon, trinket | on a kill: +20% attack speed (and shot speed) for 6 s (refreshes, does not stack) | +25% for 6 s |
| **Sunder** | weapon | 8% chance on hit: the target's max HP drops by 10% for 8 s (its HP is capped to the new max) | 10% chance, max HP -12% for 8 s |
| **Rend Armour** | weapon | 10% chance on hit: target armour -1.5 for 6 s, stacks twice | 12% chance, armour -2, stacks twice |
| **Second Wind** | armour, trinket | once per battle, when HP drops below 30%: heal 15% of max HP and +30 stamina | heal 20% and +40 stamina |
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

The first numbers (grade I up to 12% Blood Price, Terror 8 / 12 morale,
Steadfast 10% / 15%, Retribution 15% / 25%...) made an epic kit win 95%
against common; the morale powers (Terror, Steadfast) and Retribution,
Aegis and Blood Price weighed most and were cut hardest. `powerReport` in
`src/dev/rarityBalance.ts` shows what each one adds.

Powers that read HP, armour or morale work on beasts too; a beast's max HP
can be sundered at most once at a time.

## Sets

Set pieces are their own base items with their own pictures; they always drop
at their set's rarity, with that rarity's random stats, but **no random
power**: the set bonus is the power. Bonuses count the pieces a hero wears
(a two-handed weapon does not switch off a worn set shield's count, but the
shield gives no stats). A legendary set's 5-piece bonus is the strongest
single effect in the game, so its pieces drop only from world bosses.

### Agoge of Sparta (rare, 3 pieces)

Source: duel ladder chapter 1 top chest; Spartan trading posts; Greek bands in the campaign (tier 3).

| Pieces worn | Bonus |
| --- | --- |
| 2 | +6 morale |
| 3 | -20% morale loss and +3% block |

| Piece | Slot | Built on | Looks like |
| --- | --- | --- | --- |
| **Agoge dory** (`agoge_dory`) | Weapon | Dory spear | a long spear with a dark iron head and a crimson ribbon tied below the head |
| **Agoge pilos** (`agoge_pilos`) | Helmet | Pilos helmet | a conical bronze pilos helmet with a crimson band round the rim |
| **Crimson exomis** (`crimson_exomis`) | Armour | Spolas | a crimson linen tunic worn off one shoulder, a leather belt, small bronze shoulder brooch |

### Peltast of Thrace (rare, 3 pieces)

Source: duel ladder chapter 2 top chest; Thracian trading posts; Thracian bands in the campaign (tier 3).

| Pieces worn | Bonus |
| --- | --- |
| 2 | +6% move speed |
| 3 | +1 javelin throw and +1.3 missile damage |

| Piece | Slot | Built on | Looks like |
| --- | --- | --- | --- |
| **Fox-skin alopekis** (`fox_alopekis`) | Helmet | Felt hood | a Thracian cap of red fox fur, the fox's head on the brow and its tail hanging behind |
| **Peltast's crescent** (`peltast_crescent`) | Shield | Pelte | a crescent pelte shield painted with a black-and-ochre eye pattern |
| **Thracian darts** (`thracian_darts`) | Weapon | Akontia javelins | three short javelins with red-dyed leather throwing thongs |

### Cretan Bowman (rare, 3 pieces)

Source: duel ladder chapter 3 top chest; Cretan trading posts; archer bands in the campaign (tier 3).

| Pieces worn | Bonus |
| --- | --- |
| 2 | +0.6 range |
| 3 | +5% accuracy and +4 arrows |

| Piece | Slot | Built on | Looks like |
| --- | --- | --- | --- |
| **Bow of Gortyn** (`gortyn_bow`) | Weapon | Cretan bow | a horn-backed Cretan bow with gold tip caps, an arrow nocked |
| **Cretan archer's cap** (`cretan_cap`) | Helmet | Leather cap | a pale felt skullcap with a short brim and a single dark feather |
| **Gortyn bowstring** (`gortyn_string`) | Trinket | Archer's thumb ring | a coiled spare bowstring of twisted sinew tied with a small bronze tag |

### Warband of Brennus (epic, 4 pieces)

Source: Celtic trading posts (epic slot); beast hoards (epic drops); duel ladder chapter 4 top chest.

| Pieces worn | Bonus |
| --- | --- |
| 2 | +1.5 melee damage |
| 3 | +8% attack speed |
| 4 | War Cry: the first time the foe comes within 4 units, the enemies there lose 10 morale (once per battle); the wearer's charges +20% morale shock |

| Piece | Slot | Built on | Looks like |
| --- | --- | --- | --- |
| **Brennus's blade** (`brennus_blade`) | Weapon | Celtic longsword | a long Celtic sword with a gold hilt shaped like a little man with outstretched arms |
| **Boar-crest helm** (`boar_crest_helm`) | Helmet | Coolus helm | a round bronze Celtic helmet with a bronze boar figure standing on top |
| **Brennus's mail** (`brennus_mail`) | Armour | Noble's mail | an iron mail shirt with a shoulder cape fastened by a gold boar-head clasp |
| **Spiral-boss shield** (`spiral_shield`) | Shield | Bronze-bossed shield | a tall oval Celtic shield painted red, a bronze boss and swirling three-armed bronze fittings |

### Immortals of Persia (epic, 4 pieces)

Source: Persian trading posts (epic slot); beast hoards (epic drops); duel ladder chapter 5 top chest.

| Pieces worn | Bonus |
| --- | --- |
| 2 | +5% accuracy |
| 3 | +4 ammo |
| 4 | Rain of Arrows: every 5th shot looses 2 extra arrows |

| Piece | Slot | Built on | Looks like |
| --- | --- | --- | --- |
| **Immortal's bow** (`immortal_bow`) | Weapon | Persian bow | a Persian composite bow with a gold-wrapped grip and a gold tassel |
| **Immortal's scale coat** (`immortal_scale`) | Armour | Persian scale coat | a long coat of small gold-and-bronze scales, a blue embroidered hem below |
| **Immortal's tiara** (`immortal_tiara`) | Helmet | Persian tiara | a soft deep-blue felt Persian hood with gold embroidery and lappets |
| **Golden apple** (`golden_apple`) | Trinket | Golden bulla | a golden apple-shaped spear butt hanging from a short loop |

### Sacred Band of Thebes (epic, 4 pieces)

Source: Theban trading posts (epic slot); beast hoards (epic drops); ranked season reward (Strategos and Legend pick one piece).

| Pieces worn | Bonus |
| --- | --- |
| 2 | +8 morale |
| 3 | +1.5 armour |
| 4 | Bond of the Band: every other set wearer within 3 units gives +4% damage and +3% block (up to 4) |

| Piece | Slot | Built on | Looks like |
| --- | --- | --- | --- |
| **Theban dory** (`theban_dory`) | Weapon | Sauroter dory | a long spear with a bronze head, a bronze butt-spike and a white ribbon |
| **Shield of the Band** (`band_shield`) | Shield | Argive aspis | a round bronze aspis with a black face and the gold club of Herakles |
| **Theban helm** (`theban_helm`) | Helmet | Corinthian helm | a bronze Corinthian helmet with a black-and-white crest |
| **Theban linothorax** (`theban_linothorax`) | Armour | Plated linothorax | a white linothorax with a bronze chest plate bearing the club of Herakles |

### Arms of Achilles (legendary, 5 pieces)

Source: world boss: the Kraken (one piece per victorious raid for contributors, see Sources).

| Pieces worn | Bonus |
| --- | --- |
| 2 | +10 HP |
| 3 | +1.2 melee damage |
| 4 | +3 armour |
| 5 | Heel of Achilles: -50% damage from front and side hits; rear hits deal +50% |

| Piece | Slot | Built on | Looks like |
| --- | --- | --- | --- |
| **Pelian ash** (`pelian_ash`) | Weapon | Ash-wood dory | a massive dark ash-wood spear with a long gold-bronze head glowing faintly |
| **Shield of Achilles** (`achilles_shield`) | Shield | Silver aspis | a round gold-bronze shield engraved with rings of tiny scenes around a central gold star |
| **Helm of Achilles** (`achilles_helm`) | Helmet | Attic helm | a gold Attic helmet with a towering gold horsehair crest |
| **Hephaestean cuirass** (`hephaestean_cuirass`) | Armour | Muscle cuirass | a gold-and-bronze muscle cuirass with glowing ember-orange seams |
| **Anklet of Thetis** (`thetis_anklet`) | Trinket | Gold torc | a gold anklet set with pearls and a small sea shell |

### Panoply of Alexander (legendary, 5 pieces)

Source: world boss: the Titan (one piece per victorious raid for contributors, see Sources).

| Pieces worn | Bonus |
| --- | --- |
| 2 | +8 morale |
| 3 | +8% move speed |
| 4 | +0.15 charge bonus |
| 5 | Born to Rule: allies within 4 units +10% damage and +10 morale; while the wearer stands his group cannot rout |

| Piece | Slot | Built on | Looks like |
| --- | --- | --- | --- |
| **Kopis of Alexander** (`alexander_kopis`) | Weapon | Kopis | a kopis with a gold lion-head hilt and a bright steel blade |
| **Shield of Ilion** (`ilion_shield`) | Shield | Hoplon | an old round bronze shield, dented and worn, a gold Athena head in the centre |
| **Lion-scalp helm** (`lion_scalp_helm`) | Helmet | Phrygian helm | an iron helmet shaped like a lion's head, jaws open over the brow, two white plumes |
| **Linothorax of Issus** (`issus_linothorax`) | Armour | Painted linothorax | a white-and-gold linothorax with a gold Gorgon face on the chest and gold scales on the belly |
| **Bit of Bucephalus** (`bucephalus_bit`) | Trinket | Horse pendant | a gold horse bit with ox-head cheek pieces |

## Named legendaries

Twelve fixed items, each from one boss. Always legendary, fixed stats (their
base item at ×1.08, four fixed random stats picked to fit the story, plus the
extra effect below) and a fixed grade II power. They are rare enough that
copies are not limited in an army; world bosses give at most one copy of
their named item per player per season (see Sources).

| Item | Slot | Built on | Power (II) | Extra | Source | Story |
| --- | --- | --- | --- | --- | --- | --- |
| **Club of Herakles** (`herakles_club`) | Weapon | Club | Terror | +10% morale shock | Nemean Lion | Wild olive, torn from the ground at Nemea. |
| **Nemean lion pelt** (`nemean_pelt`) | Armour | Hide jerkin | Unshaken | -40% missile damage taken | Nemean Lion | No arrow ever pierced it. |
| **Bow of Philoctetes** (`philoctetes_bow`) | Weapon | Composite bow | Sunder | +0.5 range | Hydra | Herakles' bow; the arrows still carry the Hydra's venom. |
| **Horn of the Minotaur** (`minotaur_horn`) | Trinket | Boar tusk | Momentum | +6 HP | Minotaur | Cut from the bull of the labyrinth. |
| **Hammer of the Cyclopes** (`cyclops_hammer`) | Weapon | Bronze mace | Rend Armour | +1 melee damage | Cyclops | Struck the thunderbolts of Zeus. |
| **Harpy-wing helm** (`harpy_helm`) | Helmet | Chalcidian helm | Battle Frenzy | +3% move speed | Harpies | Feathers that fell like knives. |
| **Chimera-hide cuirass** (`chimera_cuirass`) | Armour | Horn scale | Retribution | +1 armour | Chimera | Lion, goat and serpent; it still smells of fire. |
| **Trident of Poseidon** (`poseidon_trident`) | Weapon | Hasta | Executioner | +0.04 charge bonus | Kraken | Fished from the beast's jaws. |
| **Aegis of Zeus** (`aegis_of_zeus`) | Shield | Silver aspis | Aegis | +5 morale | Titan | Goatskin of Amaltheia with the Gorgon's head. |
| **Golden Fleece** (`golden_fleece`) | Trinket | Gold stag plaque | Second Wind | +10% bonus XP | duel ladder floor 50 boss | Taken from Colchis by Jason. |
| **Helm of Hades** (`helm_of_hades`) | Helmet | Iron Boeotian helm | Steadfast | enemy missiles -30% accuracy against the wearer | duel ladder floor 40 boss | The Cap of Darkness. |
| **Harpe of Perseus** (`harpe_of_perseus`) | Weapon | Sica | Blood Price | +5% attack speed | duel ladder floor 30 boss | The sickle that took the Gorgon's head. |

In battle the two extras that are not plain stats are `ItemDef.missileWard`
(the pelt: missiles and hurled boulders deal 40% less) and `ItemDef.shroud`
(the helm: enemy missiles aim with 0.30 less accuracy at the wearer); like a
power, they work only while the wearer meets the item's requirements.

Set special lines run in `src/sim/powers.ts` with their numbers in
`SET_RULES` (`src/data/sets.ts`). War Cry sounds when the lines close rather
than at the start: armies deploy 8 or more units apart, so a cry "at battle
start within 4 units" would never reach anyone.

## Where items come from

| Source | Common | Uncommon | Rare | Epic | Legendary | Sets | Named |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Campaign battles (enemy gear, `rollRarity` by band tier) | yes | yes | yes | tier 2-3 | - | rare set pieces: 4% of rare drops from tier-3 bands of the set's culture | - |
| Campaign and war-map beasts (`rollBeastRarity`: rare 50 / epic 35 / legendary 15) | - | - | yes | yes | yes | epic set pieces: 25% of epic drops | 20% of legendary drops are the beast's named item |
| World bosses (Kraken, Titan) | - | - | - | yes | yes | legendary set pieces (below) | Kraken: Trident; Titan: Aegis |
| War-map merchants, towns | basic | regional | 1 a day | - | - | - | - |
| War-map trading posts | - | - | yes | 1 a day | - | the 1 epic is a piece of the region's epic set 1 day in 3; rare set pieces of the region's culture | - |
| War-map marketplace (players) | yes | yes | yes | yes | yes | rare and epic pieces | never (bound) |
| Duel shop (Glory) | yes | yes | yes | daily offer | - | - | - |
| Duel ladder, won floor (25% on replays) | yes | yes | yes | tier 3 | boss floors | - | floors 30 / 40 / 50 bosses, see below |
| Duel ladder chapter chests (top tier) | - | - | yes | yes | yes | chapters 1-3: a rare set piece of that chapter's set; chapters 4-5: an epic set piece | - |
| Ranked and unranked duels (per-duel spoils) | yes | yes | yes | - | - | - | - |
| Ranked season rewards | - | - | - | Strategos, Legend | - | Sacred Band piece of choice | - |

Details:

- **Per-duel spoils.** A won unranked duel drops an item 8% of the time, a
  won ranked duel 12% (common 50 / uncommon 35 / rare 15). The first ranked
  win of each UTC day drops one for sure, at least uncommon. Raids (async)
  pay half these chances. Generated on the server from the match seed.
- **Ladder bosses.** First clear of floor 30, 40 or 50 has a 25% chance of
  that floor's named item (Harpe of Perseus, Helm of Hades, Golden Fleece),
  otherwise `rollBeastRarity` as today; won replays of those floors 2%.
- **World bosses.** Every contributor with at least 5% of the damage in a
  victorious raid gets a chest: 40% a piece of the boss's legendary set (a
  piece they do not own yet, while there is one), 10% the boss's named item,
  else an epic.
- **Bad-luck protection.** A beast or world-boss chest that is not legendary
  adds 1 to a per-player counter; at 8 the next one is legendary and the
  counter resets. Named items: at most one copy per player per season from
  world bosses (duplicates become an epic).
- **Bound items.** Named legendaries and legendary set pieces cannot be
  listed on the marketplace or sold to merchants; they can be salvaged for
  gold or Glory (a quarter of their value).
- **Duel and war stashes stay separate** (docs/DUELS.md): duel sources fill
  the duel stash, war and campaign sources the war or campaign stash.

## Duel fairness

- Item points (`RARITY_POINTS`): 0 / 1 / 2 / 4 / 6 as today, a named
  legendary 7. Each active set bonus line costs 1 point (a full legendary set
  worn by one hero: 5 × 6 + 4 = 34 points).
- Powers are allowed in ranked: they are deterministic in the seeded sim and
  verified by replay like everything else.
- Economy stats (gold, survivor, durable) never roll on duel items, and do
  nothing in duels if a war item ever reaches one.

## Balance targets

- A full kit of one rarity against a full common kit, same hero, same class,
  `npm run balance` win rate: uncommon 58%, rare 66%, epic 76%, legendary 85%.
  Today's ×1.6 legendary is the reference for "legendary": the new legendary
  should land within 5 points of it.
- A proc power is worth about two steps of the stat it bends; a power that
  wins duels on its own (more than 60% against the same item without it) is
  too strong.
- A legendary 5-piece set bonus beats a fifth random legendary item by about
  as much as one more legendary item.

Measured with `npm run balance` (the rarity mirror, `src/dev/rarityBalance.ts`;
level 5 / level 10; "Now" at 400 seeds per cell, the first two columns at 120):

| Rarity | Target | Step 1 (no powers in battle) | Powers on, step 1 numbers | Now |
| --- | --- | --- | --- | --- |
| Uncommon | 58% | 65 / 60 | 65 / 60 | 58 / 58 |
| Rare | 66% | 70 / 72 | 70 / 72 | 68 / 64 |
| Epic | 76% | 83 / 75 | 95 / 92 | 77 / 73 |
| Legendary | 85% | 96 / 97 | 99 / 100 | 88 / 86 |

Without their powers the epic kit now wins 67 / 66% and the legendary kit
78 / 77%: a full set of powers is worth about 10 points.

## Code changes (steps 1 and 2 built; sources, spoils and duel points are step 3)

- `src/data/items.ts`: `Item` gets `aff?: string` (steps, compact: `"atkSpeed:2,hp:1"`)
  and `pow?: PowerId`; `ItemDef` gets `set?`, `named?`, `power?`, `fixed?`
  (fixed affixes) and `bound?`. `RARITY_MULT` becomes 1 / 1.05 / 1.10 / 1.15
  / 1.20. New tables `AFFIXES`, `POWERS`, `SETS` (new file
  `src/data/affixes.ts`). New base items for the 43 set pieces and named
  items.
- Requirements and limits: `ItemDef` gets `family` and `weight` (from the
  tables above), requirements are computed from tier, rarity and family;
  `ClassDef` gets `weapons`, `shields`, `armor`. `equipInto` refuses a
  class-limited item (UI explains), `itemMods(item, hero)` applies the soft
  penalty; loot and shop rolls take the army's classes.
- `itemMods(item)` adds the affix values; `StatMods` gets `atkSpeed`,
  `goldBonus`, `durable`, `koChance`, `moraleLoss`. `src/sim/stats.ts`
  collects powers (best grade per power) and set counts into `CombatStats`.
- `src/sim/powers.ts` (`PowerSystem`, created only when a unit carries a
  power, a set special or a named extra): power hooks (on hit, on being hit,
  on kill, on low HP, timers, auras) with per-unit power state in
  `Battle.hash()`; procs draw from the battle RNG; a `proc` event, and the
  renderer floats the power's icon over the hero (`PROC_ICON` in
  `src/ui/battleFx.ts`: vector stand-ins until the atlas's `power:<id>`
  icons are wired in).
- `makeItem` rolls affixes and the power from its seeded RNG, so every
  existing source (ladder, chests, merchants, campaign loot) gets them for
  free; sources above add the set and named rolls and the pity counter.
- Server: duel and war item rows carry `aff` and `pow`; only the server
  creates them (clients never send stats); marketplace escrow keeps them;
  bound items are refused by listing and merchant sale.
- UI: item card lines (random stats in green, the power with its icon in
  purple or gold, set progress "2/4" with active bonuses lit), compare
  popup counts them, `offerSummary` shows the best three.
- Migration: on load, every uncommon-or-better item without `aff` rolls its
  stats (and epic and legendary their power) from a hash of its uid, so an
  item always rolls the same and nobody loses an item's worth. Server rows
  the same on read.
- Tests: affix pools by slot, no duplicate stat, seeded rolls, migration
  idempotent, each power's hook in the sim, replay determinism with powers,
  balance targets.

## Open questions

1. Rerolling: a forge that rerolls one random stat for gold (campaign / war)
   or Glory (duels)? Not in this design; easy to add on top of steps.
2. Should the war-map season reset take legendary set pieces with it (season
   items) or keep them like the duel army keeps its gear?
