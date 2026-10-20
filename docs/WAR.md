# Global war

Living rules of the browser global war. Why each region matters: "Strategic geography". Decisions: `docs/impl/global-war-rebuild.md` (W-01..W-17, temporary).

## Lore

W-42. Every warrior here died in the real world. They did not reach an afterlife: they woke on **Metaxy** (proposal,
owner to confirm; Greek "the in-between"), one continent hung between death and what comes after.

- **Why alliances fight.** Metaxy keeps only the strong. Each season the alliances that hold its heart and its roads
  rise; the rest fade. Nobody fights for land for its own sake: land is how the world measures who is worth keeping.
- **Ascension.** The alliance that wins a season (hegemony, or the top season score) **ascends to Elysion**: its
  warriors' names are set in the season's roll of honour, their legacy carries into the next season, and the world
  is reborn for those still waiting.
- **Erasure.** The forgotten drink from **Lethe**: an alliance that keeps losing is struck from history and from the
  universe, as if it had never lived. In play this is flavour for the season reset and the standings, not a wipe of
  anyone's account.
- **The edge.** Metaxy has no ocean. Its shores (fjords, coves, lagoons, the tables below still call them coasts)
  meet a narrow fringe of grey dead water that dissolves into mist and then **the Abyss**. Colossal **Rim Wardens**
  watch from it: sea serpents coiled in the mist, titans half-sunk in the void, winged horrors over the cliffs. They
  forbid anyone to go further; the map ends where they stand.
- **Omphalos.** The navel of the in-between: the ruined temple on the mesa is where the way up opens, so holding it
  scores most (10 an hour) and holding it with three frontier towns ends the season (hegemony).
- **Homes never fall** because a dead warrior cannot die twice: in his own hall he always wakes again. What can be
  lost is everything outside it.

## World

37 hand-made regions on one continent ringed by the Abyss and its Rim Wardens (see Lore). The world is
mirror-symmetric in **topology** (every home has the same number of entries, neutrals and routes to the centre) and
different in **flavour** (biome, fauna, specialty resource). The strategic world map is one painted continent with
the regions inked over it; region maps are true isometric (W-16). Prompts and pipeline: `docs/playbook/PROMPTS_ART.md`
§37c–d.

### Geography

| Feature | Where | Play role |
| --- | --- | --- |
| Omphalos Plateau | the centre: a high mesa (h6–7) with a cliff rim and a crater lake | fortress of the world; four ramps only, one per gate region |
| Iron Teeth | mountain chain from the plateau north to the shore (h7 peaks, impassable) | splits Dodona (NW) from Skythia (NE); one gap: Kleisoura Pass |
| Great River (Achelous) | rises on the plateau, falls through a gorge, runs south to a delta | splits Elaia (SW) from Kyrene (SE); deep, crossed at one ford, one ruined bridge, and a rock bridge in the gorge |
| River Ladon and Lake Stymphalia | springs in the west forest, feeds a big reed lake, leaves by an estuary on the west shore | splits Dodona from Elaia; shallow river (fords), deep lake, slow marsh |
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
| iron | Dodona, Teeth Foothills, Krios, Grey Moors, Eagle Saddle; in the south only bog iron in the delta |
| copper | Kyrene, Thornscrub Rise, Red Canyons, Lion Savanna, Gorge of the Falls (east of the plateau only, bar the gorge) |
| tin | Kleisoura Pass, Achelous Ford; nowhere else (scarce) |
| silver | Omphalos, Siren Estuary, Ammon Salt Flats |
| horses | Skythia, Frost Steppe, Kurgan Hills, Chalk Coast, Kimmerian Hills |
| marble | Elaia, Bacchae Hills, Omphalos |
| salt | Lagoon Coast, Southern Dunes, Ammon Salt Flats, Achelous Delta, Siren Estuary (the north's only salt is at the two edges) |
| pitch (pines) | Dodona, Boreas Fjords, Teeth Foothills, Teeth Eastern Slopes, Pirate Coves; none in the south-east |
| flax (wet fields) | Lakeshore Fens, Eastbank Floodplain, Achelous Delta, Lake Stymphalia |
| herbs | forest and marsh: Ladon Oakwood, Erymanthos Wood, Lake Stymphalia, Lakeshore Fens, Achelous Delta, Bacchae Hills |
| olives (oil) | Elaia, Bacchae Hills, Westbank Vineyards |
| hides | from kills (W-12); richest in Skythia's steppe entries, Lion Savanna and the lairs |

| Fauna tier | Mobs (W-12: clear to claim) | Found in |
| --- | --- | --- |
| 0 | none | homes |
| 1 | wolves, boars, wild horses (catchable), bandits | entries |
| 2 | bears, lions, scorpions, river serpents, harpies, pirates | entries, outer neutrals |
| 3 (lair) | cyclops, Erymanthian boar, Stymphalian harpies, chimera, Nemean lion, hydra, kraken | one per inner or edge neutral |
| 4 (boss) | titan, minotaur, and the region bosses | Omphalos, and per depth: "Living regions" |

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
| siren | Siren Estuary | neutral (edge W) | the Ladon's estuary, sea stacks and sea caves | tidal flats (shallow), deep channel, cliffs h4 | kraken (lair), harpies | food 1, salt 1, silver 1 | dodona-w, elaia-w, stymphalia |
| ammon | Ammon Salt Flats | neutral (edge E) | white salt flats, a dead lake, red buttes | flats h1 (fast, no cover), buttes h5 (fortress spots) | scorpions, lions | salt 2, silver 1 | skythia-e, kyrene-e, ammos |
| delta | Achelous Delta | neutral (edge S) | the Great River's delta marsh | maze of deep channels and shallow fords, mud islands h0–1 | hydra (lair), river serpents | food 2, iron 1, salt 1 | elaia-s, kyrene-s, achelous |
| kleisoura | Kleisoura Pass | neutral (mountain pass) | the one gap through the Iron Teeth | gorge 3 tiles wide between h7 walls, switchback climb to a saddle h5 with a ruined fort, archer ledges | bandits, bears | stone 1, tin 2 | dodona-e, skythia-w, krios, saddle |
| stymphalia | Lake Stymphalia | neutral (lake) | big reed lake between Dodona and Elaia | deep lake, reed marsh round it, shallow causeway, wooded isle h3 | Stymphalian harpies (lair), river serpents | food 2, wood 1 | dodona-s, elaia-n, siren, erymanthos |
| achelous | Achelous Ford | neutral (river) | the Great River at its widest, floodplain marsh | deep river split by a long island; one shallow ford, one ruined bridge (road), marsh banks | river serpents, bandits | food 1, tin 2 | elaia-e, kyrene-w, delta, gorge |
| ammos | Ammos Dunes | neutral (desert) | dune sea between Skythia and Kyrene | dunes h1–3 (sand), rocky ridges h3, one oasis with a ruined caravanserai | scorpions, lions | food 2, stone 1 | skythia-s, kyrene-n, ammon, canyons |
| moors | Grey Moors | neutral (inner NW) | high moorland between the Iron Teeth and the west woods | moor h4–5, granite tors (high ground), peat bog, springs | wolves, bears | stone 2, iron 1 | dodona-e, dodona-s, saddle, erymanthos |
| kimmeria | Kimmerian Hills | neutral (inner NE) | rolling hills with a ruined hill fort | hills h3–4, hill fort h5, chalk streams (shallow) | bandits, wild horses | food 1, stone 1, horses 1 | skythia-w, skythia-s, saddle, canyons |
| savanna | Lion Savanna | neutral (inner SE) | dry grass and acacia with rock kopjes | flat h2, kopjes h4–5, dry wash | lions, Nemean lion (lair) | food 1, wood 1, copper 1 | kyrene-n, kyrene-w, canyons, gorge |
| bacchae | Bacchae Hills | neutral (inner SW) | vine and cypress hills | hills h2–4, cypress groves, shallow streams to the Great River | boars, bandits | food 2, wood 1, marble 1 | elaia-n, elaia-e, erymanthos, gorge |
| saddle | Eagle Saddle | neutral (gate N) | high saddle between the Iron Teeth and the plateau | saddle h5–6, cliff edges, one switchback road up the north ramp | cyclops, wolves | stone 2, iron 1 | kleisoura, moors, kimmeria, omphalos |
| erymanthos | Erymanthos Wood | neutral (gate W) | dense old forest on the plateau's west skirt, Ladon springs | forest, steep slope h3–6 to the west ramp, shallow springs | Erymanthian boar (lair), wolves | food 1, wood 3 | stymphalia, moors, bacchae, omphalos |
| gorge | Gorge of the Falls | neutral (gate S) | the Great River's gorge below the plateau | deep gorge with falls, two cliffside paths, a natural rock bridge, the south ramp | harpies, river serpents | stone 2, copper 1 | achelous, savanna, bacchae, omphalos |
| canyons | Red Canyons | neutral (gate E) | red-rock canyon maze below the plateau | canyon floors h1, mesas h5 (fortress spots), dry washes, the east ramp | chimera (lair), scorpions | stone 1, copper 2 | ammos, kimmeria, savanna, omphalos |
| omphalos | Omphalos Plateau | center | high mesa with a ruined temple city | plateau h6–7, cliff rim, four ramps, crater lake (deep) | titan (boss), minotaur (labyrinth under the temple) | stone 2, marble 2, silver 3 | saddle, erymanthos, gorge, canyons |

Route length from any home to Omphalos: home → entry → inner neutral → gate → Omphalos (4 transfers), or by the
outer mid regions (5). Equal for all four.

## Strategic geography

Why each region matters. The map has four **frontiers**, each crossed at exactly three places: a coast crossing (edge
neutral), a road crossing (mid neutral, market town) and a rim crossing (gate to Omphalos). Two are **metal
frontiers** (tin and iron side by side), two are **trade frontiers** (salt, silver and a caravan town).

| Frontier | Between | Coast crossing | Road crossing | Rim crossing | Prize |
| --- | --- | --- | --- | --- | --- |
| Iron Teeth (metal) | Dodona – Skythia | Krios icy col | Kleisoura Pass | Eagle Saddle | tin (Kleisoura) + iron (Krios, Saddle) |
| Great River (metal) | Elaia – Kyrene | Achelous Delta channels | Achelous Ford and bridge | Gorge rock bridge | tin (Achelous) + the south's only iron (Delta) |
| Ladon and Stymphalia (trade) | Dodona – Elaia | Siren tidal flats | Stymphalia causeway | Erymanthos Wood | salt + silver (Siren), causeway town, timber |
| Ammos dunes (trade) | Skythia – Kyrene | Ammon salt flats | Ammos oasis | Red Canyons | salt + silver (Ammon), caravanserai, copper |

Each home sits on one metal and one trade frontier. The two diagonal pairs (Dodona–Kyrene, Skythia–Elaia) never
border: each needs what the other makes, so they are natural trade partners, and their caravans cross a neighbour's
land or the centre.

### Purpose of every region

Types: **resource heart** (scarce goods), **trade hub** (market town on a route), **chokepoint** (pass, ford, bridge
site, isthmus), **fortress** (high ground), **breadbasket** (food, flax, olives), **sacred** (season score),
**buffer** (room to manoeuvre, no single decisive point), **coastal** (landing sites for later naval play). The last
column is the authoring brief for the region map (widths in tiles; W-41 drafts must meet it too).

| id | Primary | Secondary | Why (goods, route) | Region map must have |
| --- | --- | --- | --- | --- |
| dodona | resource heart (iron, wood, pitch) | trade hub (home agora) | Tin Road and Lake Road start here | agora with road exits E and S; ore field by the forge quarter; pine ridges; lake shore |
| skythia | breadbasket (grain, horses, hides) | trade hub (home agora) | Tin Road and Desert Road start here; open home | agora with road exits W and S; wide pastures; 3+ burial mounds as lookouts |
| kyrene | resource heart (copper, stone) | trade hub (home agora) | River Road and Desert Road start here | agora with road exits N and W; copper mine in the red cliffs; oasis gardens |
| elaia | resource heart (marble, oil) | coastal (bay harbour) | Lake Road and River Road start here | agora with road exits N and E; quarry; olive press terraces; harbour quay; citadel headland |
| dodona-n | buffer | coastal | way to Krios iron and the col | one land bridge 8–12 wide between the fjords, cliffs both sides; pines |
| dodona-w | buffer | coastal | Dodona's salt and silver lifeline to Siren | coast track along the cliffs; bogs flanking it; open heath for a field battle |
| dodona-e | chokepoint (Teeth ravine) | resource heart (iron 1) | Tin Road; to Grey Moors | ravine road 6–10 wide climbing E; wooded shoulders above it; ore node off the road |
| dodona-s | chokepoint (Ladon fords) | breadbasket (herbs, timber) | Lake Road; to Grey Moors | two fords 6–8 wide, 60+ apart; hill h4 covering both; road between them |
| skythia-n | buffer | coastal | way to Krios iron | flat open steppe; frozen ponds that slow; bluff h3 over the coast |
| skythia-e | buffer | coastal | Skythia's salt and silver lifeline to Ammon | cliff-top track; cove beach; downs with long sight lines |
| skythia-w | chokepoint (scree road) | resource heart (Skythia's only timber and pitch) | Tin Road; to Kimmerian Hills | one switchback road through scree; pine stands; streams to cross |
| skythia-s | buffer | breadbasket | Desert Road; to Kimmerian Hills | mounds h3–4 over the road; dry gullies for flank marches |
| kyrene-n | chokepoint (wadi) | resource heart (copper 1) | Desert Road; to Lion Savanna | one wadi 6–8 wide through a cliff band; ridge h4 above; copper outcrop |
| kyrene-e | resource heart (salt 2) | coastal | coast track to Ammon | salt pans; sand bar road 4–6 wide between lagoon and sea |
| kyrene-s | resource heart (salt) | buffer | way to Delta iron | outcrop h4 with the only well; slow dunes round it |
| kyrene-w | breadbasket (food, flax) | chokepoint (east bridgehead) | River Road; to Lion Savanna | bridgehead square at the river edge; channels; flax fields open to raids |
| elaia-n | breadbasket (food, flax, herbs) | chokepoint (causeway landfall) | Lake Road; to Bacchae | causeway landfall on firm ground; reed channels; low islands for archers |
| elaia-w | coastal | resource heart (pitch) | coast track to Siren | coves with beaches; sea caves (pirate lair); pine headlands |
| elaia-s | fortress (stepped cape) | buffer | way to Delta iron | stepped cape h2–5 over the Delta approach; one beach |
| elaia-e | breadbasket (olives, food) | chokepoint (west bridgehead) | River Road; to Bacchae | bridgehead square; terraces overlooking the river; fordable side channels |
| krios | resource heart (iron 2) | chokepoint (icy col) | Teeth coast crossing | col 4–6 wide in snow; cyclops lair at the richest ore |
| siren | resource heart (salt, silver) | coastal | Lake coast crossing | tidal flats with tide-cut paths; kraken lair in the sea caves by the silver; cliff h4 |
| ammon | resource heart (salt 2, silver) | fortress (buttes) | Ammos coast crossing | open flats with no cover; 2–3 buttes h5 with one path up each |
| delta | resource heart (bog iron, salt) | breadbasket (food, flax) | River coast crossing | channel maze with fords; mud islands; hydra lair on the iron |
| kleisoura | chokepoint (the pass) | resource heart (tin 2) | Tin Road; toll fort market | gorge 3 wide between h7 walls; archer ledges; ruined fort on the saddle h5 with a market court; tin mine in a side cleft |
| stymphalia | trade hub (causeway town) | chokepoint (causeway) | Lake Road | causeway 3–4 wide across the reeds; town square mid-lake; wooded isle h3 (harpy lair) |
| achelous | chokepoint (ford and bridge site) | resource heart (tin 2) | River Road; bridge town market | one ford 6 wide; ruined bridge via the long island (rebuildable); town square on the island; tin at the island's head |
| ammos | trade hub (oasis caravanserai) | buffer | Desert Road | caravanserai court at the oasis (the only water); road across the sand; ridges h3 for raiders |
| moors | fortress (granite tors) | resource heart (iron 1) | Dodona's pocket; to Saddle and Erymanthos | 2–3 tors h5 with flat tops; a bog splitting the moor; roads from both entries |
| kimmeria | fortress (hill fort) | breadbasket (horses) | Skythia's pocket; to Saddle and Canyons | hill fort h5 with one gate path; chalk streams; open slopes |
| savanna | resource heart (copper 1, hides) | fortress (kopjes) | Kyrene's pocket; to Canyons and Gorge | kopjes h4–5; Nemean lion lair; dry wash as a hidden way |
| bacchae | breadbasket (olives, food) | resource heart (marble 1) | Elaia's pocket; to Erymanthos and Gorge | vine terraces; cypress groves for cover; small quarry |
| saddle | chokepoint (north ramp) | resource heart (iron 1) | Sacred Way; Teeth rim crossing | one switchback road up a cliff edge; flat saddle for a camp; cyclops on the ore |
| erymanthos | chokepoint (west ramp) | resource heart (timber 3, herbs) | Sacred Way; Lake rim crossing | dense forest with one cart road to the ramp; clearings; boar lair |
| gorge | chokepoint (rock bridge) | resource heart (copper 1) | Sacred Way; River rim crossing | rock bridge 4 wide over the falls; two cliffside paths; copper veins in the walls |
| canyons | chokepoint (canyon maze) | resource heart (copper 2) | Sacred Way; Ammos rim crossing | 3+ canyon floors joining at the ramp; 2 mesas h5 over them; chimera lair |
| omphalos | sacred (season score) | resource heart (silver 3, marble 2) | end of the Sacred Way; Great Fair | exactly four ramps; temple city with a big agora; titan arena; labyrinth entrance; crater lake |

### Economy geography

Tin is everyone's import. Beyond tin, each home exports what others lack and imports what only the far side has.

| Home | Exports | Must import (critical) | Nearest source (transfers) | Contested with |
| --- | --- | --- | --- | --- |
| Dodona | iron, timber, pitch | copper (bronze), salt (rations, leather), silver (T3), marble (T3 workplaces), tin | Siren salt and silver 2, Kleisoura tin 2, copper 5 | Elaia at Siren; Skythia at Kleisoura and Krios |
| Skythia | grain, horses, hides | iron, copper, marble, timber for engines, tin | Krios iron 2, Ammon salt and silver 2, Canyons copper 3 | Dodona at Krios and Kleisoura; Kyrene at Ammon and Canyons |
| Kyrene | copper, salt, stone | iron, timber and pitch (siege), marble, tin | Delta iron 2, Achelous tin 2, pitch 4 | Elaia at Delta and Achelous; Skythia at Ammon |
| Elaia | marble, oil, linen, food | iron, copper, tin, horses | Delta iron 2, Achelous tin 2, Gorge copper 3 | Kyrene at Delta and Achelous; Dodona at Siren |

Rules: no home holds tin, silver or more than one metal; every tin, silver, salt and iron source outside the homes
is two transfers from two homes, so each is contested; copper is the east's (Kyrene sells it, the gates give a
little); T3 crafting needs silver and marble, so a high-end army needs Omphalos, Elaia or a long haul.

### Trade routes

Market towns: the 4 home agoras, 4 frontier towns (Kleisoura toll fort, Stymphalia causeway town, Achelous bridge
town, Ammos caravanserai) and the Great Fair on Omphalos. The four frontier towns are safe-zone exchanges ("Trade");
prices are only player offers, so the money is in hauling what is scarce across a frontier or through the centre.

| Route | Regions | Goods typically moved | Chokepoints on it | Raiding pays |
| --- | --- | --- | --- | --- |
| Tin Road (N) | dodona – dodona-e – kleisoura – skythia-w – skythia | iron, timber, pitch east; horses, hides, grain west; tin both ways | Teeth ravine, Kleisoura gorge, scree road | on the ravine shoulders and the scree; the pass holder taxes instead |
| Lake Road (W) | dodona – dodona-s – stymphalia – elaia-n – elaia | iron, pitch, timber south; marble, oil, linen north; Siren salt and silver join at the lake | Ladon fords, the causeway | on the causeway (single file, no room to form) and at the fords |
| River Road (S) | elaia – elaia-e – achelous – kyrene-w – kyrene | oil, marble, linen east; copper, salt, stone west; tin and Delta iron join at the ford | the bridgeheads, the ford and bridge | at the bridgeheads; a burnt bridge strands a caravan |
| Desert Road (E) | skythia – skythia-s – ammos – kyrene-n – kyrene | horses, hides, grain south; copper, salt north; Ammon silver joins at the oasis | Kurgan gullies, the oasis well, Thornscrub wadi | in the dunes (sand slows wagons) and at the wadi |
| Sacred Way (cross, 8 transfers an arm) | iron arm: dodona – dodona-s – moors – saddle or erymanthos – omphalos – canyons or gorge – savanna – kyrene-n – kyrene; marble arm: skythia – skythia-s – kimmeria – saddle or canyons – omphalos – erymanthos or gorge – bacchae – elaia-n – elaia | the diagonal trade: iron for copper, horses and hides for marble and oil; the richest loads | the four ramps; the inner pockets at each end | on the ramps and in the gates; the holder of Omphalos taxes both arms |

Coast tracks (Krios col, Siren flats, Ammon flats, Delta channels) are smugglers' bypasses: no toll and no town, but
lairs, slow ground and no influence to shelter in. The inner ring (moors – saddle – kimmeria – canyons – savanna –
gorge – bacchae – erymanthos) is as short as the road through Omphalos but runs through a third alliance's pocket.

### Geopolitics

| Topic | Rule of the map |
| --- | --- |
| Natural frontiers | Iron Teeth, Great River, Ladon–Stymphalia, Ammos dunes; each crossed only at its coast, road and rim crossings |
| Invasion corridors | three per home: the frontier road (fast, chokepointed), the coast track (slow, lairs), the rim (own pocket → gate → the neighbour's pocket) |
| Defensive pockets | home + entry ring + inner region (moors, kimmeria, savanna, bacchae); the inner region watches both gates of the home's sector |
| Chokepoints guarding home | Dodona 3 (land bridge, ravine, fords), Kyrene 3 (wadi, sand bar, river), Elaia 3 (causeway landfall, river, cape), Skythia 1 (scree road): the steppe is open, paid back in food, horses and nearer metals |
| The centre's pull | Omphalos: season score, silver 3 and marble 2, the Great Fair, the tax on the Sacred Way; each gate is shared by two neighbours, so the race to the centre is a fight at the gates |
| Where alliances collide | Kleisoura + Krios (Dodona–Skythia metals), Achelous + Delta (Elaia–Kyrene metals), Siren and Stymphalia (Dodona–Elaia), Ammon and Ammos (Skythia–Kyrene), then the four gates |
| Diagonals | Dodona–Kyrene and Skythia–Elaia never border and need each other's goods: trade partners first, allies of convenience against the shared neighbour |

| Phase | Goals |
| --- | --- |
| Early (days 1–3) | clear the entries and the inner pocket (its tier-1 boss); raid the near edge lifeline's fields for salt and silver (depth 4: the region itself waits); open both frontier roads to the first caravans |
| Mid (weeks 1–2) | hold or deny your metal frontier's tin; take a frontier town from its bandit host; run the first long hauls; take a gate landmark; raid the rival's road |
| Late (week 3 on) | take a rim landmark with allies; restore landmarks with traded rare goods; siege the ramps and hold Omphalos; cut a rival's imports by holding its pass or bridge; keep 3+ market towns |

### Season score and victory

| Source | Score | Notes |
| --- | --- | --- |
| Omphalos | 10 an hour | only while no enemy squad stands on the plateau |
| Frontier town (Kleisoura, Stymphalia, Achelous, Ammos) | 3 an hour | town square held |
| Gate (saddle, erymanthos, gorge, canyons) | 2 an hour | |
| Other claimed neutral | 1 an hour | |
| Restored landmark, garrisoned | +2 an hour | ≤ 6 an hour an alliance ("Living regions") |
| Temples, shrines, statues held intact | 0.25 / 0.1 / 0.1 an hour | ≤ 2 an hour an alliance; razing a temple or shrine −10 |
| Trade sale of goods from ≥ 3 transfers away ("Trade") | 1 per 100 coin of price, ≤ 60 a day | traders score, not only armies |
| Razing an enemy home building | 5 | homes never fall (W-09) |

Victory: **hegemony** ends the season early when one alliance holds Omphalos and 3 of the 4 frontier towns for 24 h;
otherwise the highest score at the season's end wins. The old war (DESIGN_V2) ranked by capitals; here homes cannot
fall, so the score sits on the centre and the roads, which a trailing side can still raid back.

### Balance check

Transfers from home (0 = at home).

| Alliance | Tin | Iron | Copper | Silver | Salt | Marble | Pitch | Chokepoints at home | Routes it ends | Edge |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Dodona | 2 | 0 | 5 | 2 | 2 | 4 | 0 | 3 | Tin, Lake, Sacred (iron arm) | iron and timber at home; copper far |
| Skythia | 2 | 2 | 3 | 2 | 2 | 4 | 1 | 1 | Tin, Desert, Sacred (marble arm) | metals near; open home |
| Kyrene | 2 | 2 | 0 | 2 | 1 | 4 | 4 | 3 | River, Desert, Sacred (iron arm) | copper and salt at home; no timber |
| Elaia | 2 | 2 | 3 | 2 | 2 | 0 | 1 | 3 | Lake, River, Sacred (marble arm) | marble and oil at home; iron only at the Delta |

Fair: every home has tin, silver and salt at ≤ 2, ends two frontier roads and one Sacred Way arm, and reaches
Omphalos in 4. Asymmetric: what is far differs (Dodona copper, Kyrene timber, Skythia safety, Elaia iron).

### Authoring checklist by type

| Type | The region map must have |
| --- | --- |
| Trade hub | a town square ≥ 24 × 24 with stall and house sites; roads to every route exit; a caravan yard by the square; one defensible and one open approach |
| Chokepoint | the narrow (3–10 wide) with high ground on at least one side; a long slow bypass so it is never a hard wall; a site for a toll fort or gate; room ≥ 40 × 40 on both sides to form up |
| Resource heart | the scarce nodes in 1–2 fields at a defensible spot; the lair on the richest node; a haul road to the owners' exit; room for a camp and storehouse |
| Fortress | a mesa, tor or hill with ≤ 2 ways up and a flat top ≥ 30 × 30; sight over the road |
| Breadbasket | wide flat fields and farm sites near water; open ground that is hard to hold (raid bait) |
| Sacred | temple ruins with a big agora on top; exactly four ramps; room for a 600-man fight |
| Buffer | room to manoeuvre, scattered cover, two ways through, no single decisive point |
| Coastal | a beach or cove landing site and cliffs, kept clear for later naval play |
| Home | its agora, one road exit per entry, a workplace quarter, the specialty field near the forge |

## Living regions

W-47 (with W-42 lore, W-45 bosses, W-46 loot, W-44 economy). Nothing on a region map is decoration: every structure is
a sim building with a function, an owner, hp and capture, raze and repair rules; every region has lore and a **depth**;
the deep regions hold **landmarks**, pre-built strongholds that are hard to take and strong once held. Tables in this
section supersede the fauna column of "Regions" for the neutrals.

### Region lore and depth

Depth is how far a region lies from the living halls, counted in danger rather than transfers: the homes are safe
(0), the far rim and the centre are the deepest (4), where Metaxy is thinnest and the Abyss looks in.

| Depth | Regions | Guardian | Mob hp and damage | Lairs | Boss | Claim channel | Lair respawn | Node yield | Score an hour | Boss loot |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 4 homes | none | – | 0 | – | owned | – | as authored | – | – |
| 1 | 16 entries | packs (fauna tier 1–2), a bandit camp on the road entries | ×1.0 | 3–5 | none | 30 s, 3 men (today) | 10 min | ×1.0 | 0 | – |
| 2 | 4 frontier towns, 4 inner pockets | towns: a bandit host; pockets: a tier-1 boss + packs | ×1.25 | 4–6 | tier 1 (pockets) | 60 s, 6 men | 20 min | ×1.25 | 1 (towns 3) | tier 1 |
| 3 | 4 gates | a tier-2 boss in its landmark + a tier-3 lair + packs | ×1.5 | 5–7 | tier 2 | 90 s, 9 men from 2+ players | 30 min | ×1.5 + a rare good | 2 (+2 landmark) | tier 2 |
| 4 | 4 rim edges, Omphalos | a tier-3 boss with phases in its landmark + elite packs; Warden strikes on the rim | ×2.0 | 6–8 | tier 3 | 120 s, 12 men from 3+ players | 60 min | ×2.0 (+ a rare good) | rim 1 (+2 landmark), Omphalos 10 | tier 3 |

| Rule | Value |
| --- | --- |
| Boss and claim | a region with a boss opens its claim point only once the boss is slain (W-45); bandit hosts likewise once their captain falls |
| Boss respawn | never within the season while the region is held; back (full hp, landmark reset to its start state) after 24 h unheld, and at season start |
| Lifelines stay reachable | a rim region's salt, silver and iron fields lie outside its landmark, guarded by depth-4 lairs only: a 2–3 squad raid clears one and hauls for the hour until it respawns, so coin and salt flow early; holding the region needs the boss |
| Warden strikes (depth 4 rim) | the outermost 12 tiles to the dead water are a no-build band; every 15 min a Rim Warden strikes a marked 8×8 patch of it (10 s telegraph, 60% max hp to every man in it, buildings untouched) |
| Bandit host | a captain (bandit ×3 hp, ×1.5 damage, a 12-man elite guard) + 3–6 bandit lairs that hold a town: they man its pre-built walls and towers, keep its gates shut and send an 8-man raid party at carts on an adjacent route every 30 min (M6j) |
| Boss tiers (`src/data/warBosses.ts`) | tier = depth − 1, except Omphalos (tier 3): depth 2 → tier 1, depth 3 → tier 2, depth 4 → tier 3; the four signature legendaries stay on the rim |

Today's boss list needs four moves for this to be symmetric (each home faces the same guardians at the same depth):
the Lion of the Savanna and the Griffin drop to tier 1, the Panoply of Alexander moves to the new Bandit King of Ammon,
the Titan of Krios becomes the dragon Drakon (keeping the Aegis), and Bacchae, the gates and Omphalos get their bosses.

| id | Name | Depth | Guardian | Lore (Metaxy) |
| --- | --- | --- | --- | --- |
| dodona | Dodona | 0 | none | The first dead of the north woke under the oracle oak; its leaves still whisper the muster, and here they always wake again. |
| skythia | Skythia | 0 | none | Riders who died in the saddle woke on the steppe beside their horses; the burial mounds are their own graves, kept as lookouts. |
| kyrene | Kyrene | 0 | none | A caravan lost to thirst woke at an oasis that was waiting for it, under red cliffs full of the copper they dug in life. |
| elaia | Elaia | 0 | none | Sailors the sea took washed into the bay; they cut the terraces and the headland citadel so water would never take them twice. |
| dodona-n | Boreas Fjords | 1 | wolves, bears | The longships of the drowned rot in the fjord arms; wolves den in the hulls and the north wind sings in their ribs. |
| dodona-w | Western Heath | 1 | wolves, boars | The peat bogs keep the oath-breakers who fled Dodona's first muster; on still nights the heath is full of their lanterns. |
| dodona-e | Teeth Foothills | 1 | bears, bandit camp | Deserters from the first iron diggings hold the ravine shoulders; their old shafts still breathe cold from under the Teeth. |
| dodona-s | Ladon Oakwood | 1 | boars, wolves | An oak wood grown from the spears of a slaughtered host; the Ladon carries their names down to the lake. |
| skythia-n | Frost Steppe | 1 | wolves, wild horses | The herds of riders who never woke graze the frozen ponds, masterless, waiting to be caught. |
| skythia-e | Chalk Coast | 1 | wild horses, boars | Faces of those who leapt rather than fade are cut in the white cliffs; the downs end where the dead water begins. |
| skythia-w | Teeth Eastern Slopes | 1 | bears, bandit camp | A tribe that lost its season hid in the scree pines and lives by robbing the Tin Road. |
| skythia-s | Kurgan Hills | 1 | wild horses, wolves | Mounds of chieftains older than any alliance; from their tops the Desert Road shows all the way to the dunes. |
| kyrene-n | Thornscrub Rise | 1 | lions, scorpions | The wadi is the throat where a whole army died of thirst; the lions remember the taste. |
| kyrene-e | Lagoon Coast | 1 | scorpions, bandit camp | The salt-cutters' huts on the sand bar were emptied by bandits who sell the salt back to Kyrene. |
| kyrene-s | Southern Dunes | 1 | scorpions, lions | The one well on the outcrop was dug by a man who died digging it; the dunes walk over everyone else. |
| kyrene-w | Eastbank Floodplain | 1 | river serpents, boars | Fields fed by the Great River's floods; serpents come up the channels with every flood, fat on the drowned. |
| elaia-n | Lakeshore Fens | 1 | river serpents, boars | The fenfolk who stayed when the bronze birds came are bones in the reeds; the serpents hunt what is left. |
| elaia-w | Pirate Coves | 1 | pirates, boars | Pirates hanged in life woke here still hungry; the sea caves hold whatever the coast track lost. |
| elaia-s | Cape of Winds | 1 | boars, bandit camp | A goatherds' cape where the wind blows toward the rim; brigands watch the Delta road from its steps. |
| elaia-e | Westbank Vineyards | 1 | boars, wolves | Vines of the first Elaian dead; their wine is poured at every crossing of the river for luck. |
| kleisoura | Kleisoura Pass | 2 | bandit host (the Toll-Takers), bears | The pass fort was the Rim Wardens' toll; when they withdrew to the mist, deserters took it and still tax the tin. |
| stymphalia | Lake Stymphalia | 2 | bandit host (the Reed Men), harpy lair | The causeway town emptied when the bronze-feathered birds nested on the isle; reed bandits hold the empty square. |
| achelous | Achelous Ford | 2 | bandit host (the Ferrymen), river serpents | The bridge broke under a fleeing army; the island town fell to ferrymen who, like Charon, charge the dead to cross. |
| ammos | Ammos Dunes | 2 | bandit host (the Sand Riders), lions | The caravan that never arrived camps forever round the oasis, and its riders rob every caravan that does. |
| moors | Grey Moors | 2 | Great Bear of the Moors (tier 1) | The bear sleeps on the bones of the first Dodonan army to march east; the granite tors were its cairns. |
| kimmeria | Kimmerian Hills | 2 | Griffin (tier 1) | The hill fort of the Kimmerians, a people the mist swallowed whole; a griffin nests in its broken gate and keeps their gold. |
| savanna | Lion Savanna | 2 | Lion of the Savanna (Nemean, tier 1) | A lion whose hide turns blades hunts the kopjes; every Kyrenean hero who went to skin it lies there. |
| bacchae | Bacchae Hills | 2 | the Maenad Queen and her thiasos (tier 1) | Women who died in the god's frenzy still dance in the cypress groves and tear apart any man who watches. |
| saddle | Eagle Saddle | 3 | Brontes the Cyclops (tier 2) | Landmark: Cyclopean Gatehouse. The Wardens' giant masons walled the north ramp; the last of them still keeps the gate. |
| erymanthos | Erymanthos Wood | 3 | the Maenad Queen of the Grove and her maenads (tier 2) | Landmark: Oracle Grove. The springs of Memory and of Lethe rise side by side; the god's maenads dance between them and keep the forgetting for themselves. |
| gorge | Gorge of the Falls | 3 | Gyges the Hundred-Handed (tier 2) | Landmark: Titan's Forge. Chained under the falls, the hundred-hander still forges the bronze of a war long lost. |
| canyons | Red Canyons | 3 | Chimera (tier 2) | Landmark: Obsidian Hold. A rock-cut hold over the canyon junction, built on a vent the chimera breathes through. |
| krios | Krios Glacier | 4 | Drakon the White (tier 3), Warden strikes | Landmark: Drakon's Citadel. The Wardens' northern citadel stands on a titan frozen into the ice; a dragon took it and sleeps on its iron. |
| siren | Siren Estuary | 4 | Scylla (tier 3), Warden strikes | Landmark: Rim Watchtower. The beacon that warned ships off the Abyss; the sirens sing from the mist and Scylla feeds below. |
| ammon | Ammon Salt Flats | 4 | the Bandit King and his host (tier 3), Warden strikes | Landmark: Dead City of Ammon. The oracle that named a conqueror son of a god; his armour is worn now by a king of thieves. |
| delta | Achelous Delta | 4 | Achelous the River-God (tier 3), Warden strikes | Landmark: Sunken Temple. The god who wrestled Heracles lost a horn and his temple to the sea; he still changes shape. |
| omphalos | Omphalos Plateau | 4 | the Titan (tier 3), the Minotaur (tier 3) | The navel of the in-between, where the way up opens; a titan who tried to climb it guards the arena, the minotaur the labyrinth. |

### Landmarks

Nine pre-built strongholds, one in every depth-3 and depth-4 neutral, so each home faces the same set at the same
distance (two gates and two rim edges each side of it, Omphalos for all). Each is authored as pre-built structures
(next section) that start **neutral at 60% hp, gates shut**, held by its guardian.

| Landmark | Region (depth) | Pre-built layout | Guardian, phases | To take | Once held (restored) | Rare good |
| --- | --- | --- | --- | --- | --- | --- |
| **Drakon's Citadel** | krios (4) | the great castle on the glacier tongue over the icy col: stone curtain (cyclopean wall ×2 hp) with 6 towers, a twin gatehouse, the keep (6×6, 8000 hp), barracks, forge L2, cistern well, bone pit | **Drakon the White**: P1 (100–60%) in the yard, claw and tail sweeps (knock 2); P2 (60–30%) on the keep roof, out of melee reach, fire breath in a cone on the yard and the gate (ignites wood, 30% max hp); P3 (< 30%) crashes down enraged, calls 2 drake packs from the bone pit | ram or tower through the gate under fire; archers and an oxybeles bring him off the roof; 8+ squads from 3+ players | the strongest fort on the map: walls and towers already built, influence 32, holds the col (Teeth coast crossing) and Krios iron; keep is a fort (store, recruits 3/h) | dragonbone |
| **Rim Watchtower** | siren (4) | a beacon tower on a sea stack (h4) over the tidal flats, a walled stair, the keeper's house, a cliff stoa, sea-cave quay | **Scylla**: six heads strike from the cave (each a linked target, 1 man snatched per 6 s within 4 tiles of the water); her body is open only while ≤ 2 heads live; at 50% she drags onto the flats | split squads kill heads at once along the cliff; physicians to save the snatched; 6–8 squads | Rim Sight: the holder sees all transits on the Lake frontier on the world map and the region whole (no fog); the beacon tower is a stone tower cap 12 | nereid pearl |
| **Dead City of Ammon** | ammon (4) | the big abandoned city on the great butte by the dead lake: walls with 2 gates and 8 towers, ~30 houses (half ruined), agora with 2 stoas and stalls, temple of Ammon (oracle), palace (keep, 6000 hp), lake postern | **the Bandit King** (a champion in Alexander's armour, 12 elite guard) + a 6-lair host in the quarters, archers on the walls: P1 street by street (each quarter's lair holds its houses); P2 the palace gate; P3 (< 30%) he runs for the postern: if he reaches it and lives 60 s he is back in 1 h with half the host | storm both gates at once, clear quarters, cut the postern; 8+ squads from 3+ players | a second home-sized town: recruit pool 6/h, cap 30 (its houses); oracle: once a day names the region an enemy alliance has sent most men toward; palace hoard (once): 20 loads and 6 tier-2 items to a pile | – |
| **Sunken Temple** | delta (4) | the half-sunk temple of Achelous on the largest mud island: temple (4×4, sanctum), colonnade walls, two shrines, the river god's spring, a stone jetty, causeways (fords) between islands | **Achelous**: P1 (100–66%) a bull-horned giant on the island; P2 (66–33%) a serpent in the channels (venom, reachable only from fords); P3 (< 33%) a bull that charges through ranks (knock 3) | hold the fords on several islands at once; theriac against venom; 6–8 squads | Horn of Plenty: a food node (max 200, regrow 2/s) and a cookhouse L3 that cooks feasts without oil; the spring heals the wounded as a physician's house (1 h) | – |
| **Temple City of the Navel** | omphalos (4) | the ruined temple city on the mesa: temple (8×8, 12000 hp), Great Fair agora with 10 stall sites and 4 stoas, 4 ramp gatehouses, titan arena, labyrinth (a walled maze round the temple undercroft), crater-lake wells | **the Titan**: P1 throws boulders (range 30, area 3, breaks wood) from the arena; P2 (< 50%) stomps (knock 4 in radius 4) and tears stones from the ramp gates. **The Minotaur** in the labyrinth: only from inside, in single file; opens the sanctum | two fights at once (arena and maze), the ramps under the titan's stones; 10+ squads from 4+ players | the season's prize (10 an hour, hegemony); restored: +2 an hour, the four ramp gates are stone gates the holder controls | – |
| **Cyclopean Gatehouse** | saddle (3) | a gatehouse of giant blocks astride the switchback road at the top of the north ramp: cyclopean walls (3000 hp a tile), 2 towers, the gate, a guardroom barracks, the eagle crater | **Brontes**: P1 hurls rocks from the gate top (range 25); P2 (< 50%) comes down and smashes (knock 2; his blows hit buildings ×3, his own walls too) | engines or ladders up the switchbacks; 4–6 squads from 2+ players | bars the north ramp: the holder's gate on the only road up; a fort (store) | star iron |
| **Oracle Grove** | erymanthos (3) | the sacred grove at the Ladon springs: shrine, priestess's house, the Spring of Memory and the Spring of Lethe (wells), a ring of ancient oaks (wood nodes; felling 3 kills the grove) | **the Maenad Queen of the Grove** and 8 maenads: P1 the thiasos dances through the oaks (fast, tears at the flanks); P2 (< 40%) frenzied (+30% damage), calls 2 maenad packs from the grove's edge | a held line round the springs, archers into the dance; 4–6 squads from 2+ players | Memory: a squad that drinks (once a day) gets +25% XP for 1 h; the holder sees every town's price board on the world map; Lethe: an enemy captive who drinks walks home at once (frees cells) | asphodel |
| **Titan's Forge** | gorge (3) | a cave forge under the falls by the rock bridge: the great anvil (a forge L3+, 4000 hp), water bellows, slag heap, two cliffside guard towers | **Gyges the Hundred-Handed**: P1 chained, three blows at once at three targets in reach 6; P2 (< 50%) breaks his chains and fights on the rock bridge (4 wide), throws men into the gorge (knock 2) | missiles from the cliff paths, a line on the bridge; 4–6 squads from 2+ players | the only titan-bronze smelt (bronze 4 + charcoal 4 → 1, 120 s) and a forge with +2 craft grade; holds the rock bridge | titan bronze |
| **Obsidian Hold** | canyons (3) | a rock-cut hold in the mesa (h5) over the canyon junction at the east ramp: rock walls (not burnable, only stone throwers hurt them), 2 towers, the vent kiln, obsidian glass field | **Chimera**: lion head (melee), goat head (fire breath, ignites), serpent tail (venom); each head a linked target; with the goat dead she stops burning, with the serpent dead she stops poisoning | close under the breath, theriac; 4–6 squads from 2+ players | the vent kiln: pitch without wood (yield 1/s, the south-east's only pitch); a fortress over three canyon floors | obsidian |

| Rule | Value |
| --- | --- |
| Damaged on capture | when the claim completes, every landmark piece drops to min(its hp, 40%), its gates to 0 (open) and its unique function goes dormant ("the place remembers its master"); a landmark later taken from another alliance keeps whatever hp the siege left |
| Patch (fortifications) | any engineer with Fortifier (L5): walls, towers and gates back to 60% at half their build cost per hp; the landmark is then a working fort |
| Restore (keep and function) | an engineer of level 8 with Fortifier and Master Builder (Drakon's Citadel and the Temple City: level 10, Poliorcetes or Archimedes) leads a restore site at the keep: bulk goods + rare goods below; done, every piece goes to 100% and the function wakes |
| Landmark bonus | +2 score an hour while restored and ≥ 6 own men stand inside its walls with no enemy there |
| Season start | each landmark is reset: neutral, 60% hp, gates shut, its guardian back |

| Restore | Bulk | Rare goods (own + from another landmark) |
| --- | --- | --- |
| Drakon's Citadel | stone 600, iron 60 | dragonbone 20, titan bronze 10 |
| Rim Watchtower | stone 300, marble 40 | nereid pearl 10, star iron 5 |
| Dead City of Ammon | stone 500, wood 200 | obsidian 10, star iron 5 |
| Sunken Temple | stone 300, marble 60 | asphodel 10, nereid pearl 5 |
| Temple City of the Navel | marble 300, stone 300 | titan bronze 20, dragonbone 10, asphodel 10 |
| Cyclopean Gatehouse | stone 400 | star iron 10, obsidian 5 |
| Oracle Grove | wood 100, marble 40 | asphodel 10, nereid pearl 5 |
| Titan's Forge | stone 300, bronze 40 | titan bronze 10, star iron 5 |
| Obsidian Hold | stone 300 | obsidian 10, dragonbone 5 |

### Rare goods

Six new goods (additive to `ResourceKind`), one per landmark that has a node. They are raw, physical and tradeable
like any good (W-44); the only way to restore a landmark is to own one rare good and buy, haul or raid the other.

| Good | Source | Rate | Used in |
| --- | --- | --- | --- |
| dragonbone | Drakon's kill (20 to the pile); the bone pit node in the Citadel | node 1 per 10 min, max 20 | Citadel, Obsidian Hold, Temple City |
| nereid pearl | Scylla's kill (15); the sea-cave node under the Rim Watchtower | 1 per 10 min, max 20 | Rim Watchtower, Sunken Temple, Oracle Grove |
| star iron | Brontes' kill (10); the eagle crater node (meteoric iron) | 1 per 10 min, max 20 | Gatehouse, Rim Watchtower, Dead City, Titan's Forge |
| asphodel | the Maenad Queen of the Grove's kill (10); the grove's flower node (a forager with Herb Finder) | 1 per 10 min, max 20 | Oracle Grove, Sunken Temple, Temple City |
| titan bronze | Gyges' kill (10); the slag heap (20, once); after restore, the forge's smelt | smelt 1 per 120 s | Titan's Forge, Citadel, Temple City |
| obsidian | the Chimera's kill (10); the glass field node | 1 per 10 min, max 20 | Obsidian Hold, Gatehouse, Dead City |

Nodes work only for the holder of the region (claim gate) and at landmark yield (no depth multiplier). A rare good
carries its origin stamp, so selling it in a far town scores as trade.

### Pre-built structures

Every town piece and every built-looking prop the region scripts place today (`scripts/war/regions/kit.ts` town
dressing, biome props) becomes a sim building, a node, a herd or terrain. The town pieces are placed by the region
JSON as **pre-built** buildings (`done`, full hp unless the table says otherwise; landmarks 60%).

| Today (object id) | Becomes | Footprint | HP | Material | Function |
| --- | --- | --- | --- | --- | --- |
| town-house-a, town-house-b | house | 3×3 | 900 | stone | population: +0.5 recruits an hour and +2 cap to the town's pool (homes and towns); 1 load of food inside at season start |
| town-cottage, kyrene/nomad-tent, dodona/hut-ruin (ruined) | cottage / tent | 3×2 / 2×2 | 400 / 150 | wood, burnable | population: +0.25 an hour, +1 cap |
| town-temple | temple | 4×4 | 3000 | stone | blessing: a squad that stands in its precinct 30 s is blessed 15 min (wounded share +0.05 within the 0.9 cap, heal ×1.15); Elysion favour +0.25 score an hour while intact |
| elaia/shrine, dodona/oracle-grove, dodona/oak-sacred | shrine | 2×2 | 800 | stone | blessing within 8 tiles; favour +0.1 an hour |
| town-stoa | stoa | 2×6 | 2000 | stone | covered market hall: 2 stall sites under its roof (each a stall L2 once taken) and a store of its owner's network |
| town-statue | statue | 1×1 | 400 | stone | prestige +0.1 score an hour; its owner may engrave a retired soldier's honour on it (moved from the home memorial) |
| town-well, kyrene/well, kyrene/oasis-spring | well | 1×1 | 800 | stone | water: own squads resting within 12 tiles pay upkeep ×0.8; own idle men within 6 tiles of a burning building put it out ×2 faster; a foe beside it 30 s fouls it for 30 min |
| town-jetty | jetty | 1×4 | 300 | wood, burnable | fishing: a food node (max 40, regrow 0.2/s); a landing site for later naval play |
| town-stall-a/b/c | stall (L1) | 2×2 | as `BUILDINGS` | wood | as today; a rented site in a trade court |
| town-warehouse | warehouse | 3×2 | 1200 | stone | rented warehouse (20 loads) in a trade town; elsewhere a store |
| town-workshop, town-storehouse, town-forge, town-cookhouse, town-olive-press, town-farm | workshop, storehouse, forge, cookhouse, olivePress, farm (L1) | as `BUILDINGS` | as `BUILDINGS` | as `BUILDINGS` | as today: a town comes with a working quarter |
| town-tower | stoneTower | 2×2 | 2500 | stone | platform cap 9, door |
| town-wall-x/y | stoneWall (2 tiles) | 2×1 | 1500 a tile | stone | walkway wall |
| town-gate-x/y | stoneGate | 2×1 | 2500 | stone | opens for its owner (neutral: open; bandit-held: shut) |
| town-board | board | 1×1 | 150 | wood, burnable | the price board; razed, the town shows no prices until rebuilt (wood 10) |
| town-goods | cache | 1×1 | 100 | wood | 2 loads of the region's goods at season start, lootable by anyone; gone once empty |
| kyrene/ruin-wall, kyrene/ruin-corner, wall-ruin, elaia/wall-a/b | stoneWall pieces, ruined | 1×1 a tile | 0 / 1500 | stone | rubble (slow ×2, cover); rebuilt by the ground's owner at half cost: a head start for a fort |
| mountains/watch-post, watchtower | woodTower | 2×2 | 800 | wood, burnable | platform cap 6 over the road |
| elaia/beehives, elaia/herbs | herbs node | 1×1 | – | – | herbs, max 10, regrow 0.02/s |
| dodona/timber-stand, dodona/charcoal-pile, dodona/iron-bog, mountains/cairn | wood (max 120), charcoal (20, once), iron, stone (30) nodes | – | – | – | gathered as any node |
| elaia/goats, kyrene/camels, kyrene/gazelle, mountains/ibex | passive herds (as ibex) | – | – | – | hunt for food and hides |
| rocks, buttes, mesas, rock pillars, rockfall, eagle nests, massifs | terrain | – | – | – | block, height and cover; not structures |

| Rule | Value |
| --- | --- |
| Owner at season start | homes: their alliance; neutral regions: team **neutral** (new team id; mobs never attack it, nobody may use it); bandit-held towns and landmarks: the mob team while the host or boss lives |
| Who owns a town | a town is the pre-built group round its claim point (the agora's market spot, a village's well): it belongs to the alliance that holds that point; pieces outside any claim radius follow region influence (whoever's covers them), else neutral. Taking the point flips every piece in its radius at once, at the hp it has |
| Use | only the owner uses a building's function; gates open for the owner and allies, neutral gates stand open |
| Capture | no building is taken by itself: buildings follow their claim point or influence, so a town is taken by clearing its guardian or garrison and claiming |
| Raze | any side may attack a building it does not own (never inside a safe court: court walls, towers, gates and stalls are untouchable while the zone is safe); at 0 hp it becomes a **ruin** in place (rubble footprint: slow ×2, cover, no function) and drops half its goods as a pile |
| Ruined stays ruined | a ruin is rebuilt only by the owner of its ground: 75% of the build cost (stone reused) and 75% labour; landmark pieces only by their restore rule |
| Repair | a new `repair` order on a damaged building: any squad, engineers ×1.5; per 10% hp, 5% of the build cost and 5% of its labour |
| Razed town | houses ruined cut the pool (their rate and cap); with ≥ 3/4 of its houses and its temple ruined a town is **ruined**: no pool, no favour, and a frontier town scores 1 an hour instead of 3 until half its houses stand again |
| Sacrilege | razing a temple or shrine costs the razer's alliance 10 score; no score is ever gained by razing outside homes (the home rule of 5 stays) |
| Homes | home pre-built pieces belong to the home alliance and may be razed by raiders, never its hall (W-09) |

### Balance

Effort is a raid's men and minutes against a typical first-week squad; reward is per day of holding.

| Depth | Raid to take | Time | Reward a day held | Ratio |
| --- | --- | --- | --- | --- |
| 1 | 1 squad | 5–10 min | nodes ×1.0, villages' pool | baseline |
| 2 | 2–3 squads (2 players) | 15–25 min | nodes ×1.25, tier-1 boss loot once, 24 score (towns 72), a town's pool and buildings | ×2–3 effort, ×2–4 reward |
| 3 | 4–6 squads (2+ players), engines help | 30–45 min | nodes ×1.5, a rare good 144/day max, tier-2 loot, 48 score (+48 restored), a fort already built | ×5 effort, ×5 reward |
| 4 | 8–10 squads (3–4 players), engines, physicians, theriac | 60–90 min | nodes ×2, rare good, tier-3 loot with a signature chance, 24 score (+48 restored), the strongest forts | ×10 effort, ×8 reward + the fort |

| Check | Rule |
| --- | --- |
| Coordinated play | depth 3 claims need men of 2+ players, depth 4 of 3+; every depth-4 guardian has a phase one squad cannot answer alone (the roof, six heads, two islands, two fights) |
| One landmark cannot win | a restored landmark gives at most 4 an hour (gate 2 + 2) against Omphalos's 10; landmark bonuses count ≤ 6 an hour an alliance; hegemony stays Omphalos + 3 frontier towns |
| Restoration forces trade | every restore needs a rare good from a landmark on another frontier, so the holder must buy, haul or raid across the map |
| Prestige cap | temples, shrines and statues together ≤ 2 an hour an alliance |
| Strong but takeable | a restored landmark is a finished fort; it falls to a siege like any other (rams, towers, throwers), and its new holder inherits the breaches |
| Symmetry | every home has, at the same distance, two bandit-held towns (each shared with a neighbour), one tier-1 pocket boss, two depth-3 and two depth-4 landmarks |

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
| Merchant | leads carts (M6), runs a rented stall, brokers hand-offs and contracts | Haggler (stall rent −50%), Pack Mules (+50% load), Safe Roads (caravan hidden on the world map until close) |
| Engineer | leads a site: +50% build rate; builds rams, ladders, stone throwers, bridges | Master Builder (+25% rate), Sapper (+30% engine damage), Bridgewright (spans +4 tiles) |
| Physician | wounded heal 2× in his house; on the field +15% wounded share within 6 tiles | Field Surgeon (radius 10), Herbalist (salves from food), Triage (frees one patient at once per hour) |
| Forager | gathers 2× a soldier; farmer, woodcutter and miner are one class, the tool picks the node | Woodsman (wood ×1.25), Prospector (ore ×1.25), Pitchman (pitch ×2) |

Scout is not a class: there is no fog of war; if fog lands it becomes a Missile skill. Gathering stays a soldier
order (W-12); a forager is only faster.

### Into the live sim

| Step | When | What |
| --- | --- | --- |
| Bake | spawn, level-up, gear or skill change | `computeStats(hero)` → `WarStats` (the existing per-unit `u.st`); P skills, attributes, gear and honours land in it |
| Clamp | after bake | vs a fresh L1 common soldier of the class: HP ×1.4, melee and missile dmg ×1.4, armour +4, block +0.10, accuracy +0.12, attack ticks ≥ 0.85×, speed ×1.10, range +1.5 tiles, ammo ×1.5, armour pierce +0.08, block pierce +0.12 (the last four: drop legendaries and crafted missile weapons went past them; war bake only, item data unchanged) |
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
| Gear drops | a physical loot pile anyone may carry off (W-46, "Trade" → "Loot piles") |
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
or buffs that **soldiers consume**; merchants move and sell it to other players ("Trade"). No civilian claims land, wins a siege or holds
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

## Crafting and professions

W-40. Every civilian class has a profession tree that opens with its level; every made thing has a recipe; crafted
weapons, armour and tools roll rarity, random stats and a quality on the existing item system (docs/ITEMS.md).
Crafting is economy work on the civilian loop: it adds no units, flags or per-tick logic to the 600-unit sim.

### Trees

Each tree: a free root at L1, 9 nodes, 2 capstones at L10 (pick one). 1 point per level from L2 to L9 (8 points), so a
crafter leaves at least one node out. A node needs its level and the node in brackets. Respec at a workplace: 50
silver, once a day. The three skills per class in the Classes table become nodes (\*); civilians have no skill slots.
XP per job = the recipe's tier (1–3; dishes, remedies and refining 1).

| L | Smith | Cook | Physician |
| --- | --- | --- | --- |
| 1 | **Smelter** (root): bronze, repair at a forge; spears, short spears, lances, javelins, clubs, shields | **Camp Cook** (root): ration at a camp or store (M5f loop) | **Healer** (root): heal at camp or fort (M5f), bandage |
| 2 | Armourer: light and medium armour, open helmets | Baker: barley bread, cookhouse L2 | Bonesetter: wound timers −15% at his camp or fort |
| 2 | Bladesmith: swords, curved swords, axes, falx, rhomphaia | Field Kitchen\*: rations away from a building at 60% speed | Field Surgeon\*: field radius 6 → 10 |
| 3 | Bowyer: bows, short bows, slings | Salt Pork\*: salt pork; rations keep 24 h, not 12 | Herbalist\*: salve |
| 3 | Field Forge\*: repairs within 15 tiles of an own squad, 50% speed | Stew Pot (Baker): lentil soup, fish stew | Triage\*: frees one patient at once per hour |
| 4 | Alloy\*: bronze +20% a smelt | Herb Cook (Stew Pot): kykeon | Rhizotomist (Herbalist): theriac |
| 4 | Journeyman (2 family nodes): tier 2 of his families | Spartan Mess (Stew Pot): black broth | Battle Dresser: a bandage counts double |
| 6 | Heavy Armour (Armourer, Journeyman): heavy armour, closed helmets | Quartermaster (Salt Pork): march stores; fed squads' upkeep −25% | Field Tent (Bonesetter): tent kit |
| 7 | Master (Journeyman): tier 3 of his families | Big Pot (2 dish nodes): batch ×1.5 | Iatreion (Bonesetter): his infirmary L3 heals in 1 h |
| 8 | Masterwork\* (Master): +2 craft grade, masterwork chance | Feast\* (Big Pot): feast | Anatomist (Triage): remedies batch ×1.5 |
| 10 | **Reforger**: re-rolls one random stat (ITEMS.md "Reforging", for materials + silver 2/5/10 by tier) · **Goldsmith**: trinkets, salvage returns 60% | **Head Cook**: dishes last +50% · **Symposiarch**: after a won fight a fed squad's wounded heal 1 h sooner | **Asclepiad**: once a fight, the first man to die within 10 tiles is wounded instead · **Proxenos of the sick**: captives he holds heal, ransom +30% |

| L | Engineer | Merchant | Forager |
| --- | --- | --- | --- |
| 1 | **Builder** (root): build ×1.5 (M5f), tools T1 | **Trader** (root): runs a rented stall (offers stay listed while offline) | **Gatherer** (root): gathers ×2 (M5f) |
| 2 | Carpenter: mantlet | Haggler\*: stall rent −50% | Woodsman\*: wood ×1.25 |
| 2 | Master Builder\*: build +25% | Packer: caravan goods | Prospector\*: ore ×1.25 |
| 3 | Toolmaker (Carpenter): tools T2 for every class | Pack Mules\*: load +50% | Pitchman\*: pitch ×2 |
| 3 | Bridgewright\*: spans +4 tiles | Appraiser: sees rolls before buying; a town's last 20 trades of a good | Charcoal Burner: charcoal |
| 4 | Rams (Carpenter): covered ram | Contracts (Packer): 2 open contracts | Hunter: hides from kills within 15 tiles |
| 5 | Fortifier (Master Builder): iron-bound gate, wet hides, stakes, ditch | Safe Roads\*: carts hidden on the world map until close | Tanner (Hunter): leather |
| 6 | Instrument Maker (Toolmaker): tools T3 | Broker (Contracts): 4 contracts, escrowed hand-offs (M6) | Weaver: flax on farms, linen |
| 7 | Artillerist (Rams): oxybeles; stone thrower crew −1 | Banker (Broker): letters of credit backed by his escrowed coin | Presser: oil at an olive press |
| 8 | Sapper\* (Rams): engine damage +30% | Factor (Appraiser): 3 standing buy orders that fill while he is offline | Herb Finder: herbs from forest and marsh gathering |
| 10 | **Poliorcetes**: siege tower · **Archimedes**: throwers and oxybeles on stone towers, range +20% | **Emporos**: convoy +1 cart; his cart is a stall in own influence · **Proxenos**: ransom −30%, buys back fallen gear from the enemy salvage pool | **Steward**: refining −20% input, batch ×1.5 · **Pathfinder**: works in neutral regions with no squad near, flees ×1.3 faster |

Identities: smith = gear (weaponsmith or armourer), cook = squad buffs, physician = fewer deaths and faster heals,
engineer = sieges, forts and every class's tools, merchant = silver and caravans, forager = raw and refined goods.

### Goods and recipe format

New stock kinds (additive to `ResourceKind`): raw **hides, flax, herbs**; refined **charcoal, leather, linen, oil**;
products **bandages, salves, theriac**, caravan goods (rations exist). Olives stay `food` until the Presser makes oil;
for materials, felt counts as linen, horn and bone as hides, gold as silver ×2, faience as stone + copper.

Recipe: `{ id, prof, node, at: building + level, inputs: { good: n }, secs, out: { item | good | engine, n } }`.
Inputs leave the team stock when the order starts; time is divided by the crafter's `workRate` (level, tool). Items go
to the stash of the player whose civilian made them, goods to the team stock.

### Smith (full list)

Every base item (`BASE_ITEMS`; set pieces and named legendaries stay drops: region bosses, `src/data/warBosses.ts`) has a recipe built from its slot, tier and
`material` (bows with none: wood + hides):

| Slot | Main material T1 / T2 / T3 | Extras | Secs T1 / T2 / T3 |
| --- | --- | --- | --- |
| Weapon, melee and javelins | 3 / 5 / 8 | wood 2; leather 1 at T2+ | 60 / 120 / 240 |
| Bow, short bow, sling | 3 / 5 / 8 (wood or leather) | bows hides 1, slings linen 1 | 60 / 120 / 240 |
| Shield | 4 / 6 / 9 | wood 3, leather 1 | 90 / 180 / 360 |
| Helmet | 2 / 4 / 6 | leather 1 | 60 / 120 / 240 |
| Armour, light and medium | 4 / 6 / 9 | – | 90 / 180 / 360 |
| Armour, heavy | – / 10 / 14 | leather 2, linen 2 | – / 300 / 600 |
| Trinket (Goldsmith) | 1 / 2 / 3 | – | 40 / 80 / 160 |

Iron adds charcoal equal to the iron (steel twice); every T3 weapon, shield, helmet and heavy armour adds silver 1. The
forge level must reach the tier; T2 needs Journeyman, T3 Master. Smelt: copper 1 + tin 1 → bronze 2 (Alloy 2.4), 15 s.

| Node | T1 | T2 | T3 |
| --- | --- | --- | --- |
| Smelter | dory, ash_dory, longche, lancea, javelins, ankyle, club; hoplon, thureos, hide_shield, gerron, pelte, buckler | bronze_dory, sarissa, hasta, xyston, saunion, gaesum, pilum, soliferrum, bronze_mace; macedonian_aspis, boeotian_shield, celtic_shield, scutum, punic_shield, caetra, bronze_pelte | sauroter_dory, kontos; aspis, argyraspis, spartan_aspis, legion_scutum, bossed_shield |
| Bladesmith | xiphos, akinakes, axe | iron_xiphos, kopis, makhaira, sica, longsword, falx, rhomphaia, sagaris, dolabra | gladius, falcata, chieftain_sword, labrys |
| Bowyer | self_bow, sling, shepherd_sling | bow, cretan_bow, persian_bow, scythian_bow, balearic_sling, rhodian_sling, staff_sling | gorytos_bow, achaean_sling |
| Armourer | leather, hide_jerkin, felt_coat, quilted, spolas, linothorax; cap, pilos, scythian_hood, wolfskin_cap, bronze_skullcap, felt_pilos, konos, persian_tiara | painted_linothorax, scaled_linothorax, horn_scale | – |
| Heavy Armour | – | scale, persian_scale, triple_disc, bell_cuirass; montefortino, chalcidian, thracian, boeotian, iron_pilos, phrygian, illyrian, apulo_corinthian, coolus, negau | mail, cuirass, iron_scale, hamata, noble_mail, plated_linothorax, iron_cuirass; attic, corinthian, hellenistic, iron_boeotian, crested_chalcidian, gilded_thracian, horned_helm |
| Goldsmith | the 10 tier-1 trinkets | the 13 tier-2 trinkets | gold_torc, gold_stag, pythian_token |

Who may wear it is still `CLASS_GEAR`: spearmen need a Smelter, archers a Bowyer, hoplites a Heavy Armour smith.
The fresh kit of every class a home trains (first tier-1 option a slot, `FRESH_KIT`) crafts as tier 1 whatever the
item's tier (longsword, falx, bow, montefortino, thracian): T1 forge, T1 cost and time, closed helmets under Armourer;
its rolls keep the item's tier cap.

### Other recipes (representative)

| Recipe (node) | Inputs → out | At | Secs | Effect |
| --- | --- | --- | --- | --- |
| **Cook** ration (root) | food 4 (+ salt 1: ×1.5) → 4 | camp, store, cookhouse | 10 | fed 10 min: damage taken ×0.95, heal ×1.25 (M5f) |
| barley bread (Baker) | food 6 → 6 | cookhouse 2 | 20 | as ration, 20 min |
| salt pork (Salt Pork) | food 4, salt 2 → 4 | cookhouse | 30 | as ration, never spoils |
| lentil soup / fish stew (Stew Pot) | food 6, herbs 1 / + salt 1, oil 1 → 6 | cookhouse 2 | 30 / 40 | 15 / 20 min: taken ×0.94 / ×0.93, heal ×1.4 |
| kykeon (Herb Cook) | food 4, herbs 2 → 6 | cookhouse 2 | 30 | 15 min: missile damage +4%, accuracy +0.02 |
| black broth (Spartan Mess) | food 6, salt 1 → 6 | cookhouse 2 | 40 | 15 min: melee damage +4%, taken ×0.95 |
| march stores (Quartermaster) | food 8, salt 2 → 4 | cookhouse | 60 | carried by a squad: refeeds it twice in the field |
| feast (Feast) | food 30, salt 4, oil 4 → 12 | cookhouse 3 | 120 | 30 min: ration buff + 1 XP per fight |
| **Physician** bandage (root) | linen 1 → 3 | infirmary | 15 | squad stock ≤ N; a man falling uses one: wounded share +0.05 |
| salve (Herbalist) | herbs 2, oil 1 → 2 | infirmary 2 | 30 | one wounded man's timer −1 h (the campaign `healing_salve`) |
| theriac (Rhizotomist) | herbs 3, salt 1, food 2 → 2 | infirmary 2 | 60 | squad ignores venom for 30 min |
| tent kit (Field Tent) | linen 6, wood 4 → 1 | infirmary | 90 | 2×2 tent in own influence, heals as a camp for 1 h |
| **Engineer** tools T1 / T2 / T3 | wood 3, stone 1 / bronze 3, wood 2 / iron 4, charcoal 4, wood 2 (+ silver 1: scales, signet, dioptra) | workshop 1 / 2 / 3 | 40 / 90 / 180 | the 18 `CIV_TOOLS`, rolled like items |
| mantlet (Carpenter) | wood 12, hides 2 | workshop or on site | 60 | crew 2; stops 60% of frontal missiles for the men behind |
| covered ram (Rams) | wood 100, hides 6, iron 4 | on site | 300 | ram hp 1400, crew take missiles ×0.3 |
| oxybeles (Artillerist) | wood 60, bronze 6, linen 4 | workshop 3 or on site | 240 | crew 2; bolt vs men, 30 tiles, one per 6 s |
| siege tower (Poliorcetes) | wood 240, hides 20, iron 10 | on site | 900 | crew 8; docks on a wall, men step onto the walkway |
| iron-bound gate / wet hides / stakes / ditch (Fortifier) | iron 10, charcoal 10 / hides 1 a tile / wood 3 a tile / labour 120 a tile | wall or ground | – | gate hp +50% / wood wall ignites at half the chance / men −50% speed, blocks engines / engines cannot cross |
| **Merchant** amphora / fish jar / linen bale / ingot crate (Packer) | oil 4, wood 1 / food 4, salt 2 / linen 6 / bronze 5 | market stall 2 | 20 | caravan goods: 10 to a load, 3–5× the value per load of their inputs (M6) |
| contract (Contracts) | coin in escrow | market stall | – | supply (n of a good by a time), buy order (paid when filled), escort (pays the escort on arrival) |
| **Forager** charcoal (Charcoal Burner) | wood 4 → 2 | sorting floor | 30 | for iron |
| leather (Tanner) / linen (Weaver) | hides 2, salt 1 → 2 / flax 3 → 2 | sorting floor 2 / 1 | 60 / 45 | – |
| oil (Presser) | food 4 → 1 | olive press | 30 | – |

Rams, ladders and stone throwers stay open to any squad (W-29); the engineer's designs are better ones. A squad holds
one dish at a time (the last eaten); no dish gives more than +5% to a stat. Venom (new mob flag: scorpion, river
serpent, hydra, chimera): a hit sets the man's `venom` bit for 20 s; falling with it, his wounded share is −0.2.

### Crafted item rolls

Craft grade **G** = crafter level (1–10) + tool tier − 1 + ⌊tool rarity rank ÷ 2⌋ + workplace level − 1 + 2
(Masterwork) + 1 (crafted at home in its specialty: Dodona iron, Kyrene copper and bronze, Skythia hides). Range 1–19.

| G | Common | Uncommon | Rare | Epic | Legendary |
| --- | --- | --- | --- | --- | --- |
| 1–3 | 80 | 18 | 2 | 0 | 0 |
| 4–6 | 60 | 30 | 9 | 1 | 0 |
| 7–9 | 42 | 36 | 18 | 4 | 0 |
| 10–12 | 30 | 36 | 24 | 9.95 | 0.05 |
| 13–15 | 20 | 34 | 30 | 15.85 | 0.15 |
| 16+ | 12 | 30 | 34 | 23.7 | 0.3 |

Tier caps rarity (T1 ≤ rare, T2 ≤ epic, T3 any; the excess falls one step). Random stats and an epic/legendary power
then roll exactly as a drop's (`itemAffixes`, `itemPower`), seeded by the order and stored on the item (`aff`, `pow`).

| Quality | Chance | Base stats | Random-stat steps | Max condition | Wear |
| --- | --- | --- | --- | --- | --- |
| crude | max(0, 30 − 3G)% | ×0.95 | 1 | 80 | ×1.25 |
| fine (and every drop) | the rest | ×1.00 | 1–2 | 100 | ×1 |
| masterwork | Masterwork node: 5% + 1% per G above 8, ≤ 15% | ×1.02 (cap fallback) | first line 2 | 100 | ×0.75 |

War pool: rolls skip what the war ignores (morale, stamina, steady, moraleShock, goldBonus; chargeBonus until mounts)
and powers that need morale or stuns (Terror, Steadfast, Unshaken, Momentum). Lucky (`koChance`) is +3% wounded share
a step, inside the 0.9 cap. Three new war-only stats: **Breaching** +5% damage vs buildings and engines (melee
weapons), **Deft** +4% work rate and **Bountiful** +3% job output (tools; tools roll Deft, Bountiful, Sturdy, Wise).
The maker's name stays on the card ("forged by Nikias of Dodona").

Caps: a masterwork legendary is the drop legendary × 1.04 on base stats; the bake clamp (HP ×1.4, damage ×1.4, armour
+4 …) still bounds every man, so the ≤ 2× rule holds (a max squad of N wins ≤ 35% vs 2N fresh). `itemCapReport` adds a
masterwork legendary per slot; it read over the +10-point cap at ×1.04 (as the drop legendaries of weapon, shield and armour already do), so masterwork is ×1.02 (`QUALITY_MULT`).

Durability: condition as today (stats × (0.6 + 0.4 × cond)). Repair at a forge (Field Forge: in the field): per 10
condition, 10% of the recipe's main material (min 1) and 10% of its time; masterwork −25%. A repair started below 50
takes 5 off max condition; at max 50 the item can only be salvaged (30% of the inputs, Goldsmith 60%).

### Balance (M5h6, `npm run balance:war`)

Expected values, no dice. A play week = 14 h at the forge + 7 unattended queues of 5. Smiths: T1 forge L4 stone hammer
(G 4, work ×1.09), T2 L6 journeyman bronze uncommon (G 8, ×1.32), T3 L10 master + Masterwork, iron rare (G 17, ×1.65).

| Check | Result | Target |
| --- | --- | --- |
| fresh kit for 12, T1 forge, one slot | worst hoplite 1.1 h (wood 132, flax 72, copper / tin / iron 36); others 0.2–1 h; T2 forge ≤ 0.6 h, T3 ≤ 0.3 h | ≤ 2 h |
| legendaries of a master smith a week | 352 tier-3 crafts × 0.3% = 1.06 (copper and tin 1063 each, silver 176: tin and silver come from neutrals) | ~1 |
| one max squad (48 legendary pieces), 3 master smiths | 333 crafts a legendary; 4–22 play weeks (archer 4, gallic 4.5, rhomphaia 8, royal guard 21, sacred band 22) | drops (beast loot 15% legendary) are the faster road |
| rarity mix | crafted T3 at G 17: 12 / 30 / 34 / 23.7 / 0.3%; T1 at a T1 forge (G 4) 60 / 30 / 10; T1 drops 85 / 14 / 1, T3 drops 30 / 40 / 25 / 5 | crafted ≥ drops below legendary |
| power through `warStatsOf` (L10, attributes 15) | max crafted kit = drop-legendary kit = the cap on every clamped stat (royal guard HP 52 → 60, dmg 10 → 12.6, armour 8.8 → 10.5) | ≤ cap; max squad ≤ 35% vs 2N (tests/war/balance.test.ts) |

### Workplaces

| Building | Footprint | Cost; labour | Hosts | L2 (upgrade in place) | L3 |
| --- | --- | --- | --- | --- | --- |
| forge | 3×3 | wood 40, stone 60; 1500 | smelt, smith T1, repairs | stone 80, iron 10: T2 | stone 120, bronze 20, marble 10: T3 |
| cookhouse | 3×2 | wood 50, stone 20; 900 | dishes of its level | stone 40: ovens | stone 60, bronze 10: feast |
| infirmary (iatreion) | 3×3 | wood 60, stone 30; 1200 | heals as a camp, bandage, tent kit | wood 30, herbs 10: herb garden (salve, theriac) | stone 80, marble 10: 1 h heals (Iatreion) |
| workshop | 4×3 | wood 80, stone 20; 1200 | tools T1, mantlet | wood 60, bronze 10: tools T2 | wood 100, iron 20: tools T3, oxybeles |
| market stall | 2×2 | wood 30; 400 | offers, contracts | stone 60 (agora): caravan goods | marble 20, silver 10: letters of credit |
| sorting floor | storehouse upgrade | wood 40, stone 20; 600 | charcoal, linen | wood 40, salt 10: tannery (leather) | – |

Each level adds a crafter slot (1 / 2 / 3 at once) and +1 grade. One queue per workplace, ≤ 5 orders. Levels are
building types chained by `upgrade` (`forge` → `forge2` → `forge3`), as walls are; they burn by their material.

### How it stays light

| Rule | Cost |
| --- | --- |
| Orders run on the civilian loop (every `CIV.every` ticks): `{ recipe, by, endTick }`, checked only there | ≤ 40 workplaces a region, < 0.05 ms a batch |
| One roll at completion from `Rng(hash(seed, building, order))`; the sim emits `crafted`, the server mints the item | no item code in the step |
| Items reach a soldier's stats only at equip, level-up or spawn (`warStatsOf` bake, M5b) | no per-tick item logic |
| Dishes: one fed record per squad `{ inn, melee, missile, acc, heal, xp, until }`; bandages, theriac, venom: one count or bit read at hit or fall | ≤ 2 branches a hit, as the squad active |
| Engines and fortifications are rows in `SIEGE` and `BUILDINGS` | existing code paths |

### Reuse and new

| Reuse | New |
| --- | --- |
| `BASE_ITEMS`, `tier`, `material`, `RARITY_MULT`, `itemAffixes`, `itemPower`, `freezeRolls`, `AFFIXES`, `POWERS`, `cond`, `salvageValue`, `CLASS_GEAR`, `requirements` | `src/data/recipes.ts` (`recipeFor(def)` from the smith template; other recipes as data), `src/data/professions.ts` (trees) |
| `CIV_CLASSES`, `CIV_TOOLS`, `workRate`, the `civWork` order and `CIV.every` loop, M5f cook/smith/physician numbers | `Item.q` (0 crude, 1 fine, 2 masterwork), `Item.mc` max condition, `Item.mk` maker; `QUALITY_MULT` in `itemMods` |
| `Hero.perks` holds a civilian's node ids | war affix filter + Breaching, Deft, Bountiful; mob `venom` flag |
| `BUILDINGS` with `upgrade`, `SIEGE`, team `stock` | 7 goods, 6 workplace chains, 4 engines (mantlet, covered ram, oxybeles, siege tower), 4 fortifications |
| campaign `healing_salve`; ITEMS.md "Reforging at the Smith" for the Reforger | `craft` / `cancelCraft` / `repair` / `salvage` orders; crafting persistence |

## Trade

W-11, W-44, W-46. A fully player-driven economy: the game sells nothing, buys nothing and quotes no price. Every good
is gathered, made or minted by a player and sits somewhere on a map (a store, a chest, a cart, a man's back, a loot
pile); it moves only by being carried and changes hands only by a hand-off, a fill at a stall, or a raid.

### Coin

| Rule | Value | Why |
| --- | --- | --- |
| Source | silver from the silver nodes (Siren, Ammon, Omphalos) minted at a forge L2: silver 1 → coin 20, 30 s, any smith | the money supply is the contested silver: whoever holds it prints money, and it costs miners and a road home |
| Back | coin 20 → silver 1 at a forge; rent and tax are coin paid to players, moved, not destroyed | coin never falls below its silver, so no runaway inflation |
| Carried | 200 coin = 1 load, kept in strongboxes (a store's coin) like any good | coin is raided like grain |
| Game costs | ransom, respec, training kit, Reforger: the "silver" prices elsewhere in this doc become coin 1:1; bullion inputs (T3 gear, stall L3) stay silver | one currency, one bullion |

### Goods live in places

| Holder | Size | Who may take | Notes |
| --- | --- | --- | --- |
| store (camp, storehouse, fort) | unlimited, as today | its alliance; enemies by looting | a team's stores joined by its influence in a region form one **network**: crafting, building and upkeep draw from it (today's team stock, now per network) |
| chest | building 1×1, wood 10, 8 loads, owner-only | owner; enemies by looting | ≤ 4 a player a region; holds, never feeds crafting |
| home strongroom | the home storehouse + one chest a player | never lootable (W-09) | the only safe store outside a trade town; replaces the stash and the treasury table |
| rented warehouse | a trade-town site, 20 loads | renter only | safe while rent is paid; unpaid 3 days: locked, never confiscated |
| porter | CARRY 10 = 1 load (today's worker load); 5 items = 1 load | his squad | any soldier or civilian; −10% speed loaded |
| cart | see Carts | its driver's player | captured with its cargo |
| a man | his worn kit | – | an item is worn or in a holder, nowhere else |

A crafted item lands in the workplace's output chest for the crafter's player; equipping needs the man and the item in
the same region within 4 tiles.

### Carts

| Cart | Recipe (engineer, workshop) | Loads | Speed (× man) | HP / armour | Crew |
| --- | --- | --- | --- | --- | --- |
| handcart | wood 30, hides 2; workshop 1, 60 s | 6 | 0.8 | 200 / 2 | 2 men pull it (any class); one alone ×0.5 |
| wagon | wood 80, bronze 4, hides 6, food 40 (draught mules); workshop 2, 180 s | 12 (Pack Mules 18) | 0.6 | 450 / 6 | a driver within 2 tiles; a merchant driver adds his nodes |

| Rule | Value |
| --- | --- |
| Ground | road ×1.3; shallow ford ×0.5; slope up ×0.6; sand ×0.5; forest and marsh only on a road; no stairs, walkways or ladders; bridges ≥ 2 wide |
| Per player | 2 carts in the world (Emporos 3); a convoy = his carts and the squads escorting them |
| `escort` order (new `Order` kind) | the squad keeps a column round the cart, engages enemies within 12 tiles of it, returns past 20 |
| Under attack | the cart halts while an enemy is within 8 tiles, resumes 10 s after; it never fights |
| Between regions | carts and loaded porters ride the world transfer, cargo on the transit row; wagon ×1.5 travel time, porters ×1.2; a `haul` order chains transfers along the world path and keeps driving offline (W-07) |
| World map | in transit seen like squads (by alliances with men in or next to either end); Safe Roads: only by alliances with men at the destination |
| Fire | wood: torches and fire arrows ignite it like a wood building |

### Trade towns

| Town | Safe zone | Sites | Holder takes |
| --- | --- | --- | --- |
| Kleisoura, Stymphalia, Achelous, Ammos | the walled market court (authored bounds, 2 gates) | 6 stalls, 6 warehouses; a caravan yard outside each gate (not safe) | rent 10 coin a day a site; tax 5% of each fill, into its strongbox in the court |
| Great Fair (Omphalos) | none: the richest and most dangerous market | 10 stalls, 4 warehouses | rent 20, tax 8% |
| home agoras | none: the alliance's own market | stall sites in the agora | nothing |

Holder = the alliance that claims the region (influence and forts outside the court), so the frontier-town score
reads "region held": the court itself cannot be fought over. A town that changes hands keeps its stalls and rents;
an unheld town charges nothing.

| Safe-zone rule | Value |
| --- | --- |
| Inside | no attack, fire, capture, looting or loot piles; no building but on rented sites; no claim, healing, recruiting or upkeep relief |
| Entry | by a gate; refused for 20 s after a man hit or was hit (combat tag), so it is no escape mid-fight |
| Limits | ≤ 6 units of a player inside (porters, merchant, drivers) + his carts; the rest wait in the yard; a fighter inside 15 min is walked out; logout walks all his units out |
| Not a base | goods only in rented sites (1 stall + 1 warehouse a player a town); no army can form inside |

### Stalls, offers and the board

| Piece | Rule |
| --- | --- |
| Sell offer | goods or items already in the seller's stall: what, n, price each; listed while he is offline |
| Buy order | coin escrowed in the stall's strongbox: what, n, price; fills when a seller in town accepts |
| Fill | in the court, buyer takes an offer (or seller an order): goods stall → buyer's warehouse, coin back, tax to the holder, at once; the buyer hauls it out himself |
| Price board | an object in each court: per good best ask, best bid, depth, last 10 fills; the world hover card shows the last board your men saw (fog) |
| Stall level | L1 4 offers; L2 8 + caravan goods; L3 12 + letters of credit; Trader and Factor add standing orders |

### Hand-offs, contracts, letters

| Kind | Rule |
| --- | --- |
| Hand-off | anywhere both players have a unit within 4 tiles: both confirm one window (cart, chest or porter loads, items, coin) within 60 s; swapped at once, nothing in flight |
| Escrowed hand-off (Broker) | each side drops its half at the broker's stall when it can; collected once both are in; refunded after 48 h |
| Contract (2 open, Broker 4) | posted at a stall, coin escrowed: **carry** (take these sealed loads from A to B; the carrier escrows 50% of the declared value), **supply** (deliver n of a good to my warehouse by a time), **escort** (paid when my cart arrives with ≥ 75% of its cargo); sealed loads unload only at B |
| Letter of credit (Banker, stall L3) | the banker escrows coin in his strongbox at town B and sells at A a letter for his own fee; the letter is an item named to its buyer, redeemable only by him at B, so a stolen one is worthless |

### Loot piles (W-46, every fight)

| Who falls | Carried loads and items | Worn kit |
| --- | --- | --- |
| killed | all to a pile | every piece to the pile, −25 condition each (the M5d rule replaced) |
| wounded, carried off with his squad | all to a pile | kept |
| captured | all to a pile | all to a pile at the capture tile; he walks home in a militia tunic when ransomed or freed |
| cart wrecked (0 HP) or chest or store burnt | all to a pile; fire spoils half the goods | – |

| Pile rule | Value |
| --- | --- |
| Form | a sim object on the tile (not a unit, not a building); piles within 1 tile merge up to 8 loads |
| Pick up | any unit with free carry, any side, during or after the fight: 1 load or 1 item per 2 s; first hands win, no claim or owner priority |
| Smith | may salvage a pile's item in place (`salvageValue`, 30 s) |
| Decay | 15 min, then gone (items scrapped, goods spoilt): the only loss to nobody |
| Safe zone | no falls inside, so no piles; a pile at a gate is outside |

Power curve: 70–90% of the fallen are wounded and keep kit, XP and honours; a killed veteran loses kit he would have
lost anyway as a dead man, and a won field gives it back; a tier-1 kit for 12 is ≤ 2 h of a forge. Losing a rare kit
hurts; the player still has his squad, his level and his home strongroom.

### Raiding

| Act | Rule | Gain |
| --- | --- | --- |
| Capture a cart | an enemy unit beside it 5 s with no owner or ally within 8 tiles: it is his, cargo and all; retaken the same way | the cargo; 5 XP to the squad |
| Wreck a cart | fight it to 0 HP | a pile |
| Loot a chest or store | porters at it, no owner unit within 10 tiles: 1 load per 2 s a porter; a store only once its region influence is gone | what they carry |
| Ambush spots | region JSON `ambush` rects (additive: high ground or woods over a road, 1–3 per route region); bandit lairs on the coast tracks | where bots and raiders wait |

### Season score and anti-abuse

| Rule | Value |
| --- | --- |
| Trade score | a fill or a paid carry or supply contract: 1 per 100 coin when the goods' **origin** (stamped when gathered, made or minted) is ≥ 3 transfers from the town and the two players are of different alliances; ≤ 60 a day an alliance |
| Raid score | none: raiding pays in cargo |
| Alt funnelling | accounts that shared an IP or device in 7 days cannot hand off, fill, contract or capture carts from each other; one-sided hand-offs only within an alliance, ≤ 300 coin (last-fill value) a day to a receiver; receiving needs account age ≥ 48 h and one fight |
| Wash trading | same-alliance fills score nothing; a town ignores origin stamps of its own region |
| Caps | 2–3 carts, 4 chests a region, 1 stall + 1 warehouse a town, 2–4 contracts, a letter ≤ 500 coin |
| Season start | each player gets his squad and START.food in his home strongroom, no coin and no goods (owner to confirm) |

### What changes in today's code

| Today | Becomes |
| --- | --- |
| team stock per team per region (`works.ts` `stock`) | per store network; each store keeps its contents; crafting, build and upkeep draw from the network where the work stands |
| server `war_stock` (food, silver) per player, `war_treasury` | contents of the home strongroom and chests (room state, D1 snapshot); the treasury is the alliance strongbox at home |
| war stash (`war_items` minted to a player) | `war_items.place` = holder id + region, or a person id; the stash screen lists where your things are |
| merchant stub (sells surplus for silver) | removed: the merchant runs a stall, drives carts, brokers |
| upkeep from server food | from the network where the squad stands, or its porters and carts; unpaid: the existing penalty |
| recruit, train, ransom, respec | coin or food from the home strongroom |
| M5d gear drops (winner picks up, rare+ at 50%) | loot piles above |

### Performance and ownership

Carts are live units (one body, radius 0.9) inside the 10% civilian quota: they path, collide and take hits like a
man, so leaving them out would add unbounded bodies; 2 carts × 50 players cannot all be out at once, which is the
scarcity we want. Chests, stalls and warehouses are buildings; piles are tile objects; cargo is a ≤ 4-lot record
touched only on load, unload, pick-up, capture or loot. Bench: 600 units with 40 carts, 200 chests and 100 piles
≤ 8 ms/step.

| Sim (`src/war/sim`, deterministic) | Server (`server/src/war`) | World (`WarWorldDO`) |
| --- | --- | --- |
| carts, porters' loads, store networks, chests, piles and decay, capture and loot, safe-zone rules and combat tag, `escort`, raider and escort bots | holder contents with the room, item places, offers and buy orders (D1 `war_offers`), rent, tax, escrow, contracts, letters, origin stamps, anti-abuse, trade score | transits with cargo, `haul` chains, Safe Roads visibility |
