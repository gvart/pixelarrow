/**
 * The home picker's lore: every place a new player may make his home (each alliance's home city and its four gate
 * regions, src/war/world/start.ts homeChoices), a few lines of Metaxy lore and what the choice means for play. Facts
 * follow docs/WAR.md ("Regions", "Strategic geography", "Region lore and depth"); the numbers (neighbours, resources,
 * beasts) come from the region data (src/war/world/regions.ts), not from here.
 */

/** 1 easy (the home city: no beasts, it never falls), 2 medium (an outlying gate), 3 hard (a gate on a contested road). */
export type HomeDifficulty = 1 | 2 | 3;
export interface HomeLore { lore: string; play: string; difficulty: HomeDifficulty }

export const DIFFICULTY_NAME: Record<HomeDifficulty, string> = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };

export const HOME_LORE: Record<string, HomeLore> = {
  // ---- Dodona (NW, iron)
  dodona: {
    lore: 'The first dead of the north woke under the oracle oak, and its leaves still whisper the muster. Pine ridges ring a cold lake; the forges smoke with Dodona\'s iron. A warrior who falls anywhere in Metaxy wakes here again.',
    play: 'Safe ground with no beasts, and rich timber and iron. The Tin Road and the Lake Road both start here, two marches from the front.',
    difficulty: 1,
  },
  'dodona-n': {
    lore: 'The longships of the drowned rot in the fjord arms; wolves den in the hulls and the north wind sings in their ribs. One land bridge crosses between the cliffs. Beyond it the Krios Glacier rises, where the Wardens\' citadel holds a dragon asleep on its iron.',
    play: 'A quiet corner off the main roads: the way to Krios iron. Wolves and bears to clear, but no rival alliance shares the border.',
    difficulty: 2,
  },
  'dodona-w': {
    lore: 'The peat bogs keep the oath-breakers who fled Dodona\'s first muster; on still nights the heath is full of their lanterns. A cliff track runs south to the Siren Estuary, where the sirens sing from the mist.',
    play: 'Dodona\'s lifeline to salt and silver at Siren. Open heath for a field battle, bogs on both flanks; wolves and boars only.',
    difficulty: 2,
  },
  'dodona-e': {
    lore: 'Deserters from the first iron diggings hold the ravine shoulders under the Iron Teeth. Their old shafts still breathe cold, and the Tin Road climbs past them to Kleisoura, the only gap through the mountains.',
    play: 'The front with Skythia. The ravine is a chokepoint on the Tin Road with iron off the road; expect bears, a bandit camp, and Skythian squads.',
    difficulty: 3,
  },
  'dodona-s': {
    lore: 'An oak wood grown from the spears of a slaughtered host; the Ladon carries their names down to the lake. Two fords cross the river under one wooded hill.',
    play: 'The Lake Road runs south to the Stymphalia causeway and Elaia. Hold the hill and you hold both fords; herbs and timber in the wood.',
    difficulty: 3,
  },
  // ---- Skythia (NE, horses)
  skythia: {
    lore: 'Riders who died in the saddle woke on the steppe beside their horses. The burial mounds are their own graves, kept now as lookouts over the grass. A warrior who falls anywhere in Metaxy wakes here again.',
    play: 'Safe ground with no beasts, rich grain, the best horses in the world, and long sight lines. The Tin Road and the Desert Road both start here.',
    difficulty: 1,
  },
  'skythia-n': {
    lore: 'The herds of riders who never woke graze the frozen ponds, masterless, waiting to be caught. The steppe ends at a cold bluff over the dead water, and the Krios Glacier glitters to the west.',
    play: 'A quiet corner off the main roads: the way to Krios iron. Flat and open; the frozen ponds slow a march. Wolves and wild horses only.',
    difficulty: 2,
  },
  'skythia-e': {
    lore: 'Faces of those who leapt rather than fade are cut in the white cliffs; the downs end where the dead water begins. A cliff-top track runs south to the salt flats of Ammon.',
    play: 'Skythia\'s lifeline to salt and silver at Ammon. Long views over the downs and one cove beach; wild horses and boars only.',
    difficulty: 2,
  },
  'skythia-w': {
    lore: 'A tribe that lost its season hid in the scree pines under the Iron Teeth, and lives by robbing the Tin Road. One switchback climbs west to Kleisoura, the only gap through the mountains.',
    play: 'The front with Dodona, and Skythia\'s only timber and pitch. A narrow scree road; expect bears, a bandit camp, and Dodonan squads.',
    difficulty: 3,
  },
  'skythia-s': {
    lore: 'Mounds of chieftains older than any alliance roll away to the south. From their tops the Desert Road shows all the way to the dunes and the oasis where a lost caravan still camps.',
    play: 'The Desert Road runs south to the Ammos oasis and Kyrene. The mounds watch the road; dry gullies hide a flank march. Good grazing.',
    difficulty: 3,
  },
  // ---- Kyrene (SE, copper)
  kyrene: {
    lore: 'A caravan lost to thirst woke at an oasis that was waiting for it, under red cliffs full of the copper they dug in life. The springs never fail. A warrior who falls anywhere in Metaxy wakes here again.',
    play: 'Safe ground with no beasts, and the world\'s richest copper and stone. The River Road and the Desert Road both start here.',
    difficulty: 1,
  },
  'kyrene-n': {
    lore: 'The wadi is the throat where a whole army died of thirst; the lions remember the taste. A cliff band closes the hills, with copper showing in the rock.',
    play: 'The Desert Road runs north to the Ammos oasis and Skythia. One narrow wadi through the cliffs; lions and scorpions guard it.',
    difficulty: 3,
  },
  'kyrene-e': {
    lore: 'The salt-cutters\' huts on the sand bar were emptied by bandits, who sell the salt back to Kyrene. Shallow lagoons lie on one side of the road and the dead water on the other.',
    play: 'Rich salt pans, and the coast track to the Ammon flats. A narrow sand-bar road; scorpions and a bandit camp to clear first.',
    difficulty: 2,
  },
  'kyrene-s': {
    lore: 'The one well on the outcrop was dug by a man who died digging it; the dunes walk over everyone else. Southward the dunes fall to the Achelous Delta, where a river-god still changes shape.',
    play: 'A quiet corner: salt, and the way to the delta\'s bog iron. The dunes slow every march; the outcrop well is the only high ground.',
    difficulty: 2,
  },
  'kyrene-w': {
    lore: 'Fields fed by the Great River\'s floods. River serpents come up the channels with every flood, fat on the drowned. Across the water, Elaia\'s vines climb the far bank.',
    play: 'The front with Elaia, and a breadbasket of food and flax. The River Road runs west to the Achelous ford and its tin; the fields lie open to raids.',
    difficulty: 3,
  },
  // ---- Elaia (SW, marble)
  elaia: {
    lore: 'Sailors the sea took washed into the bay. They cut the terraces and the headland citadel so that water would never take them twice. A warrior who falls anywhere in Metaxy wakes here again.',
    play: 'Safe ground with no beasts, rich in grain, olives and marble, with a harbour quay. The Lake Road and the River Road both start here.',
    difficulty: 1,
  },
  'elaia-n': {
    lore: 'The fenfolk who stayed when the bronze birds came are bones in the reeds now; the serpents hunt what is left. The causeway across Lake Stymphalia makes landfall here.',
    play: 'A breadbasket of food, flax and herbs. The Lake Road runs north over the causeway to Dodona; low islands make good archer posts.',
    difficulty: 3,
  },
  'elaia-w': {
    lore: 'Pirates hanged in life woke here still hungry. The sea caves under the pine headlands hold whatever the coast track lost.',
    play: 'The coast track to salt and silver at Siren, and pitch from the pines. Pirates in the caves, boars on the headlands.',
    difficulty: 2,
  },
  'elaia-s': {
    lore: 'A goatherds\' cape where the wind always blows toward the rim. Brigands watch the Delta road from its steps.',
    play: 'A natural fortress: the stepped cape overlooks the way to the delta\'s bog iron. Clear the bandit camp and the boars first.',
    difficulty: 2,
  },
  'elaia-e': {
    lore: 'Vines of the first Elaian dead climb the terraces above the Great River; their wine is poured at every crossing for luck. Kyrene\'s floodplain lies on the far bank.',
    play: 'The front with Kyrene. The River Road runs east to the Achelous ford and its tin; terraces overlook the river and its fordable channels.',
    difficulty: 3,
  },
};
