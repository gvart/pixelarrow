/**
 * Region lore and guardians (docs/WAR.md "Region lore and depth", W-42): one line of Metaxy lore per world region and
 * who guards it, for the world map's hover card. Depth is src/war/sim/depth.ts REGION_DEPTH.
 */
export interface RegionLore { guardian: string; lore: string }

export const REGION_LORE: Readonly<Record<string, RegionLore>> = {
  dodona: { guardian: 'none', lore: 'The first dead of the north woke under the oracle oak; its leaves still whisper the muster, and here they always wake again.' },
  skythia: { guardian: 'none', lore: 'Riders who died in the saddle woke on the steppe beside their horses; the burial mounds are their own graves, kept as lookouts.' },
  kyrene: { guardian: 'none', lore: 'A caravan lost to thirst woke at an oasis that was waiting for it, under red cliffs full of the copper they dug in life.' },
  elaia: { guardian: 'none', lore: 'Sailors the sea took washed into the bay; they cut the terraces and the headland citadel so water would never take them twice.' },
  'dodona-n': { guardian: 'wolves, bears', lore: 'The longships of the drowned rot in the fjord arms; wolves den in the hulls and the north wind sings in their ribs.' },
  'dodona-w': { guardian: 'wolves, boars', lore: "The peat bogs keep the oath-breakers who fled Dodona's first muster; on still nights the heath is full of their lanterns." },
  'dodona-e': { guardian: 'bears, bandit camp', lore: 'Deserters from the first iron diggings hold the ravine shoulders; their old shafts still breathe cold from under the Teeth.' },
  'dodona-s': { guardian: 'boars, wolves', lore: 'An oak wood grown from the spears of a slaughtered host; the Ladon carries their names down to the lake.' },
  'skythia-n': { guardian: 'wolves, wild horses', lore: 'The herds of riders who never woke graze the frozen ponds, masterless, waiting to be caught.' },
  'skythia-e': { guardian: 'wild horses, boars', lore: 'Faces of those who leapt rather than fade are cut in the white cliffs; the downs end where the dead water begins.' },
  'skythia-w': { guardian: 'bears, bandit camp', lore: 'A tribe that lost its season hid in the scree pines and lives by robbing the Tin Road.' },
  'skythia-s': { guardian: 'wild horses, wolves', lore: 'Mounds of chieftains older than any alliance; from their tops the Desert Road shows all the way to the dunes.' },
  'kyrene-n': { guardian: 'lions, scorpions', lore: 'The wadi is the throat where a whole army died of thirst; the lions remember the taste.' },
  'kyrene-e': { guardian: 'scorpions, bandit camp', lore: "The salt-cutters' huts on the sand bar were emptied by bandits who sell the salt back to Kyrene." },
  'kyrene-s': { guardian: 'scorpions, lions', lore: 'The one well on the outcrop was dug by a man who died digging it; the dunes walk over everyone else.' },
  'kyrene-w': { guardian: 'river serpents, boars', lore: "Fields fed by the Great River's floods; serpents come up the channels with every flood, fat on the drowned." },
  'elaia-n': { guardian: 'river serpents, boars', lore: 'The fenfolk who stayed when the bronze birds came are bones in the reeds; the serpents hunt what is left.' },
  'elaia-w': { guardian: 'pirates, boars', lore: 'Pirates hanged in life woke here still hungry; the sea caves hold whatever the coast track lost.' },
  'elaia-s': { guardian: 'boars, bandit camp', lore: "A goatherds' cape where the wind blows toward the rim; brigands watch the Delta road from its steps." },
  'elaia-e': { guardian: 'boars, wolves', lore: 'Vines of the first Elaian dead; their wine is poured at every crossing of the river for luck.' },
  kleisoura: { guardian: 'bandit host (the Toll-Takers), bears', lore: "The pass fort was the Rim Wardens' toll; when they withdrew to the mist, deserters took it and still tax the tin." },
  stymphalia: { guardian: 'bandit host (the Reed Men), harpy lair', lore: 'The causeway town emptied when the bronze-feathered birds nested on the isle; reed bandits hold the empty square.' },
  achelous: { guardian: 'bandit host (the Ferrymen), river serpents', lore: 'The bridge broke under a fleeing army; the island town fell to ferrymen who, like Charon, charge the dead to cross.' },
  ammos: { guardian: 'bandit host (the Sand Riders), lions', lore: 'The caravan that never arrived camps forever round the oasis, and its riders rob every caravan that does.' },
  moors: { guardian: 'Great Bear of the Moors (tier 1)', lore: 'The bear sleeps on the bones of the first Dodonan army to march east; the granite tors were its cairns.' },
  kimmeria: { guardian: 'Griffin (tier 1)', lore: 'The hill fort of the Kimmerians, a people the mist swallowed whole; a griffin nests in its broken gate and keeps their gold.' },
  savanna: { guardian: 'Lion of the Savanna (Nemean, tier 1)', lore: 'A lion whose hide turns blades hunts the kopjes; every Kyrenean hero who went to skin it lies there.' },
  bacchae: { guardian: 'the Maenad Queen and her thiasos (tier 1)', lore: "Women who died in the god's frenzy still dance in the cypress groves and tear apart any man who watches." },
  saddle: { guardian: 'Brontes the Cyclops (tier 2)', lore: "Landmark: Cyclopean Gatehouse. The Wardens' giant masons walled the north ramp; the last of them still keeps the gate." },
  erymanthos: { guardian: 'the Maenad Queen of the Grove and her maenads (tier 2)', lore: "Landmark: Oracle Grove. The springs of Memory and of Lethe rise side by side; the god's maenads dance between them and keep the forgetting for themselves." },
  gorge: { guardian: 'Gyges the Hundred-Handed (tier 2)', lore: "Landmark: Titan's Forge. Chained under the falls, the hundred-hander still forges the bronze of a war long lost." },
  canyons: { guardian: 'Chimera (tier 2)', lore: 'Landmark: Obsidian Hold. A rock-cut hold over the canyon junction, built on a vent the chimera breathes through.' },
  krios: { guardian: 'Drakon the White (tier 3), Warden strikes', lore: "Landmark: Drakon's Citadel. The Wardens' northern citadel stands on a titan frozen into the ice; a dragon took it and sleeps on its iron." },
  siren: { guardian: 'Scylla (tier 3), Warden strikes', lore: 'Landmark: Rim Watchtower. The beacon that warned ships off the Abyss; the sirens sing from the mist and Scylla feeds below.' },
  ammon: { guardian: 'the Bandit King and his host (tier 3), Warden strikes', lore: 'Landmark: Dead City of Ammon. The oracle that named a conqueror son of a god; his armour is worn now by a king of thieves.' },
  delta: { guardian: 'Achelous the River-God (tier 3), Warden strikes', lore: 'Landmark: Sunken Temple. The god who wrestled Heracles lost a horn and his temple to the sea; he still changes shape.' },
  omphalos: { guardian: 'the Titan (tier 3), the Minotaur (tier 3)', lore: 'The navel of the in-between, where the way up opens; a titan who tried to climb it guards the arena, the minotaur the labyrinth.' },
};

/** A region's lore line ('' when it has none). */
export const loreOf = (id: string): string => REGION_LORE[id]?.lore ?? '';

/** What each landmark does once held and restored (docs/WAR.md "Landmarks", once held). */
export const LANDMARK_FUNCTION: Record<string, string> = {
  drakons_citadel: 'The strongest fort on the map: walls and towers built, influence 32, holds the col and Krios iron; the keep is a fort (store, recruits 3 an hour).',
  rim_watchtower: 'Rim Sight: every transit on the Lake frontier shows on the world map and the region lies open (no fog); the beacon is a stone tower for 12.',
  dead_city: 'A second home-sized town: recruit pool 6 an hour, cap 30; the oracle names once a day where an enemy sends most men; the palace hoard (once).',
  sunken_temple: 'Horn of Plenty: a food node (200, regrows 2/s) and a cookhouse L3 that cooks feasts without oil; the spring heals as a physician\'s house.',
  temple_city: 'The season\'s prize (10 an hour, hegemony); restored: +2 an hour, the four ramp gates are stone gates the holder controls.',
  cyclopean_gatehouse: 'Bars the north ramp: the holder\'s gate on the only road up; a fort (store).',
  oracle_grove: 'Memory: a squad that drinks gets +25% XP for an hour; every town\'s price board on the world map. Lethe frees a captive at once.',
  titans_forge: 'The only titan-bronze smelt (bronze 4 + charcoal 4 -> 1 in 120 s), a forge with +2 craft grade; holds the rock bridge.',
  obsidian_hold: 'The vent kiln: pitch without wood (1/s, the south-east\'s only pitch); a fortress over three canyon floors.',
};
