# Global war

Living rules of the browser global war. Decisions: `docs/impl/global-war-rebuild.md` (W-01..W-17, temporary).

## World

37 hand-made regions on one continent ringed by sea. The world is mirror-symmetric in **topology** (every home has
the same number of entries, neutrals and routes to the centre) and different in **flavour** (biome, fauna,
specialty resource). The strategic world map is pixel art; region maps are true isometric (W-16).
Prototypes: `shots/war/gemini/` (git-ignored); prompts in `docs/playbook/PROMPTS_ART.md`
§21.

### Geography

| Feature | Where | Play role |
| --- | --- | --- |
| Omphalos Plateau | the centre: a high mesa (h6–7) with a cliff rim and a crater lake | fortress of the world; four ramps only, one per gate region |
| Iron Teeth | mountain chain from the plateau north to the sea (h7 peaks, impassable) | splits Dodona (NW) from Skythia (NE); one gap: Kleisoura Pass |
| Great River (Achelous) | rises on the plateau, falls through a gorge, runs south to a delta | splits Elaia (SW) from Kyrene (SE); deep, crossed at one ford, one ruined bridge, and a rock bridge in the gorge |
| River Ladon and Lake Stymphalia | springs in the west forest, feeds a big reed lake, leaves by an estuary to the west sea | splits Dodona from Elaia; shallow river (fords), deep lake, slow marsh |
| Ammos dune sea and the red canyons | east of the plateau, down to salt flats on the east coast | splits Skythia from Kyrene; sand slows, canyons channel armies, mesas are high ground |
| Coasts | all around: fjords (N-W), chalk cliffs (N-E), lagoons (S-E), coves and capes (S-W) | edge regions give flanking routes between neighbouring homes |

Height 0–7; a step of 1 is a slope, 2+ a cliff. Deep water and h7 rock are impassable; shallow water, sand, snow,
marsh, scree and forest slow; roads are fast; high ground gives + range and + damage (see the impl doc).

### Alliances

| Alliance home | Quadrant | Flavour | Specialty | Borders |
| --- | --- | --- | --- | --- |
| Dodona | NW | cold pine-and-oak highland, lake valley | iron | Iron Teeth (E), Ladon/Stymphalia (S) |
| Skythia | NE | open grass steppe plateau, burial mounds | horses | Iron Teeth (W), Ammos dunes (S) |
| Kyrene | SE | desert-edge oasis on a river terrace, red cliffs | copper | Ammos dunes (N), Great River (W) |
| Elaia | SW | terraced olive hills round a bay, marble | marble | Stymphalia (N), Great River (E) |

Each home sums to 9 resource points; through its entries each home reaches exactly one tin region, one silver
region and one of Krios/Achelous Delta, all two transfers away. Bronze = copper + tin, so tin and copper force trade
or war.

**Tin is scarce: exactly 2 sources on the map**, Kleisoura Pass (contested by Dodona and Skythia) and Achelous Ford
(contested by Elaia and Kyrene). Neither touches a home or is reachable from one home's entries only: each borders
one entry of each of its two homes plus two neutrals (Kleisoura: Krios, Eagle Saddle; Achelous: the delta, Gorge of
the Falls), so no alliance can sit on tin without its neighbour contesting it, and the far pair can raid it by the
gate.

### Resources and fauna

| Resource | Sources (rating 1–3 per region) |
| --- | --- |
| food (grain, fish, olives, dates) | everywhere except peaks; best in Skythia, Elaia, delta, fens |
| wood | forests: Dodona, Ladon Oakwood, Erymanthos Wood |
| stone | everywhere hilly |
| iron | Dodona, Krios, Grey Moors, Eagle Saddle, bog iron in the delta |
| copper | Kyrene, Red Canyons, Lion Savanna, Ammos |
| tin | Kleisoura Pass, Achelous Ford; nowhere else (scarce) |
| silver | Omphalos, Siren Estuary, Ammon Salt Flats |
| horses | Skythia, Frost Steppe, Kurgan Hills, Chalk Coast, Kimmerian Hills |
| marble | Elaia, Bacchae Hills, Omphalos |
| salt | Lagoon Coast, Southern Dunes, Ammon Salt Flats, Achelous Delta, Siren Estuary |

| Fauna tier | Mobs (W-12: clear to claim) | Found in |
| --- | --- | --- |
| 0 | none | homes |
| 1 | wolves, boars, wild horses (catchable), bandits | entries |
| 2 | bears, lions, scorpions, river serpents, harpies, pirates | entries, outer neutrals |
| 3 (lair) | cyclops, Erymanthian boar, Stymphalian harpies, chimera, Nemean lion, hydra, kraken | one per inner or edge neutral |
| 4 (boss) | titan, minotaur | Omphalos only |

### Regions

Role: home (4), entry (16, big, no-build band along the road, W-03), neutral (16), center (1). Adjacency is
symmetric. Every home's four entries also form a ring round it, so you can move between them without crossing the
home.

| id | name | role | biome | altitude and water | fauna | resources | adjacent |
| --- | --- | --- | --- | --- | --- | --- | --- |
| dodona | Dodona | home NW | pine-and-oak valley round a cold lake | valley h2, forested ridges h4–5, deep lake, shallow snowmelt brook | none | food 2, wood 3, stone 2, iron 2 | dodona-n, dodona-e, dodona-s, dodona-w |
| dodona-n | Boreas Fjords | entry | cold fjord coast, pine and rock | two deep fjord arms, cliffs h4–5 between them, one land bridge | wolves, bears | food 1, wood 2, stone 1 | dodona, dodona-w, dodona-e, krios |
| dodona-w | Western Heath | entry | windswept heath and sea cliffs | heath h2–3, sea cliffs h4, shallow peat bogs | wolves, boars | food 1, wood 1, stone 2 | dodona, dodona-n, dodona-s, siren |
| dodona-e | Teeth Foothills | entry | rocky foothills under the Iron Teeth | long ravine climbing east to h5, forested shoulders, fast shallow stream | bears, bandits | wood 1, stone 2, iron 1 | dodona, dodona-n, dodona-s, kleisoura, moors |
| dodona-s | Ladon Oakwood | entry | old oak forest on the upper Ladon | shallow river with two fords, wooded banks h2–3, one hill h4 | boars, wolves | food 1, wood 2 | dodona, dodona-w, dodona-e, stymphalia, moors |
| skythia | Skythia | home NE | grass steppe on a low plateau | plateau h3, burial mounds h4 (lookouts), shallow winding river, one gully | none | food 3, wood 1, stone 2, horses 3 | skythia-n, skythia-e, skythia-s, skythia-w |
| skythia-n | Frost Steppe | entry | tundra steppe on a cold coast | flat h2, frozen shallow ponds, coastal bluff h3 | wolves, wild horses | food 1, stone 1, horses 1 | skythia, skythia-w, skythia-e, krios |
| skythia-e | Chalk Coast | entry | grass downs ending in white chalk cliffs | downs h3–4, sea cliffs, one cove beach | wild horses, boars | food 1, stone 2, horses 1 | skythia, skythia-n, skythia-s, ammon |
| skythia-w | Teeth Eastern Slopes | entry | scree and pine under the Iron Teeth | slope climbing west to h5, scree, streams | bears, bandits | wood 2, stone 2 | skythia, skythia-n, skythia-s, kleisoura, kimmeria |
| skythia-s | Kurgan Hills | entry | rolling grass hills with burial mounds | mounds h3–4 (watch points), dry gullies, shallow brook | wild horses, wolves | food 2, horses 1 | skythia, skythia-w, skythia-e, ammos, kimmeria |
| kyrene | Kyrene | home SE | oasis town on a desert-edge river terrace | terrace h2, red cliffs h5 to the east, oasis springs, shallow river | none | food 2, wood 1, stone 3, copper 3 | kyrene-n, kyrene-e, kyrene-s, kyrene-w |
| kyrene-n | Thornscrub Rise | entry | dry thornscrub hills | hills h3–4, dry wadi (passable), cliff band | lions, scorpions | stone 2, copper 1 | kyrene, kyrene-w, kyrene-e, ammos, savanna |
| kyrene-e | Lagoon Coast | entry | salt lagoons behind a sand bar | shallow lagoons, sand bar, low dunes h1–2 | scorpions, bandits | food 1, salt 2 | kyrene, kyrene-n, kyrene-s, ammon |
| kyrene-s | Southern Dunes | entry | dune field down to the sea | dunes h1–3 (sand), rock outcrop h4 with a well | scorpions, lions | stone 1, salt 1 | kyrene, kyrene-w, kyrene-e, delta |
| kyrene-w | Eastbank Floodplain | entry | reeds and fields on the Great River's east bank | flat h1, shallow channels, the deep Great River on the west edge | river serpents, boars | food 2, wood 1 | kyrene, kyrene-n, kyrene-s, achelous, savanna |
| elaia | Elaia | home SW | terraced olive hills round a sheltered bay | bay h0–1, stepped terraces h2–4, headland h5 (citadel), shallow stream | none | food 3, wood 2, stone 2, marble 2 | elaia-n, elaia-e, elaia-s, elaia-w |
| elaia-n | Lakeshore Fens | entry | reed fens on Lake Stymphalia's south shore | marsh, shallow channels, low islands h1–2 | river serpents, boars | food 2, wood 1 | elaia, elaia-w, elaia-e, stymphalia, bacchae |
| elaia-w | Pirate Coves | entry | rocky coves and pine headlands | headlands h3–4, coves, sea caves | pirates, boars | food 1, wood 2 | elaia, elaia-n, elaia-s, siren |
| elaia-s | Cape of Winds | entry | rocky goat cape | stepped cape h2–5, cliff edges, one beach | boars, bandits | food 1, stone 2 | elaia, elaia-w, elaia-e, delta |
| elaia-e | Westbank Vineyards | entry | vine terraces on the Great River's west bank | terraces h1–3, the deep Great River on the east edge, fordable side channels | boars, wolves | food 2, wood 1 | elaia, elaia-n, elaia-s, achelous, bacchae |
| krios | Krios Glacier | neutral (edge N) | snow peaks at the north end of the Iron Teeth | h7 peaks impassable, glacier tongue h5 (snow), one icy col | cyclops (lair), wolves | stone 1, iron 2 | dodona-n, skythia-n, kleisoura |
| siren | Siren Estuary | neutral (edge W) | the Ladon's estuary, sea stacks and sea caves | tidal flats (shallow), deep channel, cliffs h4 | kraken (lair), harpies | food 1, wood 1, silver 1 | dodona-w, elaia-w, stymphalia |
| ammon | Ammon Salt Flats | neutral (edge E) | white salt flats, a dead lake, red buttes | flats h1 (fast, no cover), buttes h5 (fortress spots) | scorpions, lions | salt 2, silver 1 | skythia-e, kyrene-e, ammos |
| delta | Achelous Delta | neutral (edge S) | the Great River's delta marsh | maze of deep channels and shallow fords, mud islands h0–1 | hydra (lair), river serpents | food 2, iron 1, salt 1 | elaia-s, kyrene-s, achelous |
| kleisoura | Kleisoura Pass | neutral (mountain pass) | the one gap through the Iron Teeth | gorge 3 tiles wide between h7 walls, switchback climb to a saddle h5 with a ruined fort, archer ledges | bandits, bears | stone 1, tin 2 | dodona-e, skythia-w, krios, saddle |
| stymphalia | Lake Stymphalia | neutral (lake) | big reed lake between Dodona and Elaia | deep lake, reed marsh round it, shallow causeway, wooded isle h3 | Stymphalian harpies (lair), river serpents | food 2, wood 1 | dodona-s, elaia-n, siren, erymanthos |
| achelous | Achelous Ford | neutral (river) | the Great River at its widest, floodplain marsh | deep river split by a long island; one shallow ford, one ruined bridge (road), marsh banks | river serpents, bandits | food 1, tin 2 | elaia-e, kyrene-w, delta, gorge |
| ammos | Ammos Dunes | neutral (desert) | dune sea between Skythia and Kyrene | dunes h1–3 (sand), rocky ridges h3, one oasis | scorpions, lions | food 1, stone 1, copper 1 | skythia-s, kyrene-n, ammon, canyons |
| moors | Grey Moors | neutral (inner NW) | high moorland between the Iron Teeth and the west woods | moor h4–5, granite tors (high ground), peat bog, springs | wolves, bears | stone 2, iron 1 | dodona-e, dodona-s, saddle, erymanthos |
| kimmeria | Kimmerian Hills | neutral (inner NE) | rolling hills with a ruined hill fort | hills h3–4, hill fort h5, chalk streams (shallow) | bandits, wild horses | food 1, stone 1, horses 1 | skythia-w, skythia-s, saddle, canyons |
| savanna | Lion Savanna | neutral (inner SE) | dry grass and acacia with rock kopjes | flat h2, kopjes h4–5, dry wash | lions, Nemean lion (lair) | food 1, wood 1, copper 1 | kyrene-n, kyrene-w, canyons, gorge |
| bacchae | Bacchae Hills | neutral (inner SW) | vine and cypress hills | hills h2–4, cypress groves, shallow streams to the Great River | boars, bandits | food 2, wood 1, marble 1 | elaia-n, elaia-e, erymanthos, gorge |
| saddle | Eagle Saddle | neutral (gate N) | high saddle between the Iron Teeth and the plateau | saddle h5–6, cliff edges, one switchback road up the north ramp | cyclops, wolves | stone 2, iron 1 | kleisoura, moors, kimmeria, omphalos |
| erymanthos | Erymanthos Wood | neutral (gate W) | dense old forest on the plateau's west skirt, Ladon springs | forest, steep slope h3–6 to the west ramp, shallow springs | Erymanthian boar (lair), wolves | food 1, wood 3 | stymphalia, moors, bacchae, omphalos |
| gorge | Gorge of the Falls | neutral (gate S) | the Great River's gorge below the plateau | deep gorge with falls, two cliffside paths, a natural rock bridge, the south ramp | harpies, river serpents | food 1, stone 2 | achelous, savanna, bacchae, omphalos |
| canyons | Red Canyons | neutral (gate E) | red-rock canyon maze below the plateau | canyon floors h1, mesas h5 (fortress spots), dry washes, the east ramp | chimera (lair), scorpions | stone 1, copper 2 | ammos, kimmeria, savanna, omphalos |
| omphalos | Omphalos Plateau | center | high mesa with a ruined temple city | plateau h6–7, cliff rim, four ramps, crater lake (deep) | titan (boss), minotaur (labyrinth under the temple) | stone 2, marble 2, silver 3 | saddle, erymanthos, gorge, canyons |

Route length from any home to Omphalos: home → entry → inner neutral → gate → Omphalos (4 transfers), or by the
outer mid regions (5). Equal for all four.

## Soldiers

Every soldier is a persistent person (W-10, W-37); civilians are the same record with a non-combat class (W-38).
Built on the single-player hero (`src/data/units.ts` `Hero`, `src/sim/stats.ts` `computeStats`); the live sim only
sees the baked stat block. Numbers are first-pass targets for balance tests. **N** = fighters per player (below);
every other cap is written in terms of N.

### Army size N (proposal, owner to confirm)

| N | Players per region (600 cap) | With the 10% civilian quota | Attachment (a) | Formations (b) | Verdict |
| --- | --- | --- | --- | --- | --- |
| 20 (today) | 30 | 27 | 20 names, hard to know each | full lines (10×2), wedge, column | too few players per region |
| **12** | **50** | **45** | every man known by name | line 6×2 or 4×3, wedge 1-2-3-6, column 2×6 | **recommended** |
| 10 | 60 | 54 | very good | line 5×2, thin wedge | fallback if 50 players feels empty |
| 8 | 75 | 67 | best | 4×2 reads as a blob; lines and flanks lose meaning | no |

Recommendation: **N = 12, one squad per player**, which can split into two detachments of ≥ 4 (flank, guard a site,
work, as W-26 detaching already does). Several small squads per player multiply orders and UI without adding
tactics at this size. (d) Civilians count toward the 600 cap inside a 10% quota, so 12 gives 45–50 players per region,
inside the owner's 50–60 hope. Changing N later is one constant (`SQUAD_MAX`, today `MAX_ARMY` 20) plus re-tuned
scenarios.

### Record (server-side, one row per person)

| Field | Rule | Reused from |
| --- | --- | --- |
| class | militia on recruit → trained class → elite at level 6 | `src/data/classes.ts` |
| level, xp | 1–10, `xpToNext = 40 × level`; +2 attribute points per level | `MAX_LEVEL`, `xpToNext`, `POINTS_PER_LEVEL` |
| attributes | STR, AGI, END, WIL (5 neutral, max 15); class spread on recruit. WIL drives survival and the squad active cooldown (no morale in the war) | `src/data/perks.ts` `ATTR_*` |
| skills | 2 slots, unlocked at levels 3 and 7, picked from the family pool (≤ 4) | perks, reshaped |
| equipment | weapon (civilians: tool), armour, helmet, shield/offhand, trinket; item tier 1–3 × 5 rarities | `src/data/items.ts`, `gearRules.ts` requirements and class limits |
| honours | ≤ 3 battle traits ("Veteran of Kleisoura", "Held the Ford"): +2% to one stat, mostly a name | `src/data/traits.ts` shape |
| state | `fit` / `wounded(until, where)` / `captive(by, since)` / `dead`; kills, battles, home town | `Hero.wound` |

XP: 1 per 10 damage dealt, 10 per kill, 15 per fight survived (≥ N enemy soldiers took part), 5 per claim or siege
objective. Civilians: 1 per job (meal batch, bar, trade, site, patient). A wounded soldier keeps half the fight's XP.

### Classes

| Family | Train to (building) | Elite at L6 (+ rare kit) | Skills (P passive baked, F flag, A squad active) |
| --- | --- | --- | --- |
| Line | hoplite, thureophoros (barracks) | royal_guard, sacred_band | Shield Drill P (+6% block, +1 armour), Phalangite P (+0.15 reach, +1 dmg), Hold Fast F (+30% block while the squad holds), **Shield Wall A** |
| Shock | celt_sword, falx (barracks) | rhomphaia, gallic | Brawler P (+1.2 dmg), Shield Breaker P (−10% target block), Finisher F (+30% dmg vs men < 40% HP), **Berserk A** |
| Missile | archer, slinger, javelineer, peltast (range) | Cretan-set archer | Deep Quiver P (+40% ammo, +1 range), Eagle Eye P (+6% accuracy), Fire Archer F (brazier reach ×2, half pitch), **Volley A** |
| Rider | companion, thessalian, horse_archer (stable) | chariot | Horsemanship P, Lance Charge F, Ride Down F, **Wheel and Re-charge A**; only once the war sim has mounts |

Non-combat classes (W-38), six, each with its own loop and a tool in the weapon slot (same tiers and rarities):

| Class | Loop | Skills (2 of 3) |
| --- | --- | --- |
| Cook | food (+ salt) at a cookhouse → rations; a fed squad gets +5% HP next fight and heals 25% faster | Field Kitchen (cooks without a building), Salt Pork (rations keep 2×), Feast (+1 XP per fight to the fed squad) |
| Smith | copper + tin → bronze, ore → iron at a smelter; forge repairs and crafts tier 1–3 gear, rarity rolled on tool rarity + level | Alloy (+20% bronze per ore), Masterwork (+1 rarity step chance), Field Forge (repairs in the field) |
| Merchant | leads caravans (M6), better market prices, carries hand-off trades | Haggler (±8% price), Pack Mules (+50% load), Safe Roads (caravan hidden on the world map until close) |
| Engineer | leads a site: +50% build rate; builds rams, ladders, stone throwers, bridges | Master Builder (+25% rate), Sapper (+30% engine damage), Bridgewright (spans +4 tiles) |
| Physician | wounded heal 2× in his house; on the field +15% wounded share within 6 tiles | Field Surgeon (radius 10), Herbalist (salves from food), Triage (frees one patient at once per hour) |
| Forager | gathers 2× a soldier; farmer, woodcutter and miner are one class, the tool picks the node | Woodsman (wood ×1.25), Prospector (ore ×1.25), Pitchman (pitch ×2) |

Scout is not a class: there is no fog of war; if fog lands it becomes a Missile skill. Gathering stays a soldier
order (W-12); a forager is only faster.

### Into the live sim

| Step | When | What |
| --- | --- | --- |
| Bake | spawn, level-up, gear or skill change | `computeStats(hero)` → `WarStats` (the existing per-unit `u.st`); P skills, attributes, gear and honours land in it |
| Clamp | after bake | vs a fresh L1 common soldier of the class: HP ×1.4, melee and missile dmg ×1.4, armour +4, block +0.10, accuracy +0.12, attack ticks ≥ 0.85×, speed ×1.10 |
| Flags | bake | ≤ 3 bits per unit (`u.flags`) from F skills and item powers; read only in hit resolution |
| Squad active | order | one per squad (best-ranked A skill in it), 60 s cooldown (−2.5% per WIL point of the leader), 8 s buff = one multiplier on the squad, read in hit resolution |
| Civilians | spawn | `role: 'civ'`: never target, flee enemies within 10 tiles, work orders only, armour ×0.5 |

Cost at 600 units: bake ≈ 20 µs each, 12 ms once per region join (spread over ticks); ≈ 200 B per unit; per tick no
new loops, ≤ 2 branches per hit (flag, squad multiplier), < 0.1 ms on today's step. No per-unit ability timers,
auras or morale.

### Lifecycle

| Stage | Rule |
| --- | --- |
| Recruit | an owned town or home camp grows a pool: home 6/h, town 3/h, cap 30; a recruit costs 20 food and comes as L1 militia (civilian 30 food) |
| Train | barracks / range / stable / guild hall: 10 min + one tier-1 common kit (crafted or bought); class change only within a family, keeps level and XP |
| Promote | level 6 + the elite rare kit, at a fortress, 30 min |
| Fall | at 0 HP wounded with `woundedShare` 0.7 (+3% per END above 5, + physician, cap 0.9), else dead; the dead drop their gear |
| Heal | wounded leave with the squad; timer: field 6 h, camp 3 h, town 2 h, physician's house 1 h |
| Gear drops | the gear of a dead man lies 10 min: the winner picks it up (rare and above at 50% condition) or a smith salvages it (`salvageValue`) |
| Capture | a wounded man on a tile the enemy holds when the fight ends (no friendly within 15 tiles) becomes `captive` in the captor's nearest fort (≤ 20 per fort, extra are freed) |
| Prisoners | captor pays 1 food/h each; ransom = 30 × level silver, the owner pays or declines; a raid reaching the fort frees all; after 24 h they walk home. No execution or conversion |
| Veterans | survivors keep XP, gear and honours; gear wears per fight (`cond`), a smith repairs it |
| Roster | N in the field + N/2 reserve (barracks, healing, captive) + household; at the cap a recruit needs a retirement |
| Retire | returns half the gear value and leaves one honour on the alliance memorial; a level-10 soldier may retire into a civilian class at level 5 |

Household: separate from the N fighters, size `min(4, 1 + fit soldiers ÷ 4)` (with N = 12: 4). Separate so the
squad stays whole; tied to fit soldiers so nobody plays without an army (a merchant still needs a squad to escort
caravans). A trade-minded player fields a small guard squad and a full household.

In the region civilians are live units on the 600 cap inside a 10% sub-quota (60, split per alliance like W-06): a
separate cap would add bodies beyond the sim budget, and they cost the same per tick as soldiers. They are weak,
flee, can be captured, and work only inside own influence or with a squad within 15 tiles.

Into the economy (M6), never instead of fighting: rations, bronze, iron, gear, repairs, salves and engines are stock
or buffs that **soldiers consume**; merchants turn surplus into silver. No civilian claims land, wins a siege or holds
a region.

### Anti-oversaturation

| Lever | Bound |
| --- | --- |
| Power curve | a max squad (L10 elite, legendary kit) of N beats N fresh trained soldiers of the class, and wins ≤ 35% vs 2N; the clamp table enforces it |
| Item cap | the ITEMS.md rule (≤ +10 win-rate points per item), measured in the war sim |
| Counters | Line > Rider > Missile > Shock > Line, by class stats and flags; height and terrain still outweigh levels |
| Readability | ≤ 3 flags per unit and one active per squad; elites and veterans get a visible marker (crest, pip) |
| Upkeep | 1 food per soldier per hour in the field, 2 for elites, 1 per civilian; unpaid upkeep stops healing and XP |
| Attrition | ~30% of the fallen die and gear wears, so top squads still bleed |

### UI touchpoints

| Surface | Content |
| --- | --- |
| Roster panel | field squad, reserve, household; state chips (wound timer, captive where); drag to swap |
| Soldier card | paper doll, class and elite, level bar, 4 attributes, 2 skills, gear slots, honours, kills and battles |
| Level-up | toast on the squad card; at levels 3 and 7 a choice of 2 skills with a stat preview (as the campaign perk preview) |
| Live | squad active on the command card; veteran pips on unit bars; capture and ransom notices |

### Reuse and drop

| Reuse | Drop (war only) |
| --- | --- |
| `Hero`, `computeStats`, attributes, `xpToNext`, items, rarity, affixes, sets, requirements, `salvageValue`, traits shape, class defs and kits | morale, rout, stamina, auras, per-unit abilities, 5-tier perk trees (now 2 skill slots), medallions, campaign rest and physician gold |
| `warStats` (`src/war/sim/classes.ts`) stays the class baseline (and clamp base) and the mob path; new `warStatsOf(hero)` bakes a person | `MAX_ARMY` 20 as the war squad size (becomes `SQUAD_MAX` = N) |
