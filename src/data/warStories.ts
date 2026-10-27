/**
 * W-65 the neutral regions' story chains (the runner: src/war/sim/stories.ts). Each is told from its region's lore line
 * (docs/WAR.md "Region lore and depth"): a giver at the village well, 3-5 steps sent to places of the region, a named
 * foe, a choice where it is cheap, and a real reward (coin and goods, an item, a soul who joins). Points are tiles
 * (src/war/regions/<id>.spots.ts names the authored ones); the runner snaps each to open ground. Souls use the six
 * classes with war sprites (hoplite, archer, militia, slinger, javelineer, celt_sword).
 *
 * A new story: copy the template at the end of this file, fill it from the region's lore and its spots, add it to
 * STORIES, and drop its line from STORY_HOOKS. tests/war/stories.test.ts walks every story's places from its giver.
 */
import type { Story } from '../war/sim/stories';

const TEETH: Story = {
  id: 'cold-shafts', region: 'dodona-e', title: 'The Cold Shafts',
  giver: { name: 'Mnason', title: 'old ore-washer of the foothills', at: [87, 357], cls: 'civ_smith' },
  hook: 'My sons still lie under the Teeth.',
  backstory: 'My sons dug iron for the first muster. When the shafts fell in, the overseers ran with the ore and left them in the dark. The deserters hold the ravine shoulders still. Bring me the man who kept the tally.',
  steps: [
    {
      id: 'shaft', goal: 'Search the old diggings', label: 'Diggings',
      story: 'A shaft mouth breathes cold under the Teeth. In the frost: boot prints, and a tally-stick notched with names.',
      where: 'The diggings, north up the ravine. Mind the bears.',
      trigger: { kind: 'reach', at: [240, 140] }, reward: { goods: { coin: 10 } },
    },
    {
      id: 'cairns', goal: 'Follow the deserters\' cairns', label: 'Cairn',
      story: 'They stack stones where the ravine forks, so their own find the way. Now so will you.',
      where: 'Down the ravine to the southern shoulder, cairn by cairn.',
      trigger: { kind: 'track', marks: [[236, 190], [250, 225], [256, 251], [280, 282]] },
    },
    {
      id: 'camp', goal: 'Break the shoulder camp', label: 'Deserters',
      story: 'Six deserters guard the ore they never paid for. They were brave once, in the dark.',
      where: 'The camp on the ravine\'s south shoulder.',
      trigger: { kind: 'clear', at: [290, 322], mob: 'bandit', count: 6 }, reward: { goods: { iron: 10, coin: 20 } },
    },
    {
      id: 'lykon', goal: 'Face Lykon the Overseer', label: 'Lykon',
      story: 'Lykon kept the tally when the shafts fell, and ran with the ore. He has been running since.',
      where: 'His last guard, east along the shoulder.',
      trigger: { kind: 'clear', at: [340, 328], mob: 'bandit', count: 4, lead: true, name: 'Lykon the Overseer' },
    },
    {
      id: 'judge', goal: 'Judge Lykon', label: 'Lykon',
      story: 'Lykon kneels in the scree. "I counted them. I could not dig them out." Mnason\'s sons are owed something.',
      where: 'Choose on this card.',
      trigger: {
        kind: 'choice', options: [
          { id: 'spare', label: 'Spare him', text: 'He swears on the cold shafts to dig and fight for you. A debt paid in sweat.', reward: { soul: { cls: 'hoplite', level: 3, name: 'Lykon' }, goods: { iron: 10 } } },
          { id: 'slay', label: 'Slay him', text: 'The tally is closed. His iron falls where he does.', reward: { item: { def: 'kopis', rarity: 'rare' }, goods: { coin: 40 } } },
        ],
      },
    },
  ],
  end: 'Mnason pours water on the stones. The Teeth breathe a little warmer.',
  reward: { goods: { coin: 60 } },
};

const SLOPES: Story = {
  id: 'lost-season', region: 'skythia-w', title: 'The Lost Season',
  giver: { name: 'Opoia', title: 'widow of the tin-carter', at: [436, 341], cls: 'civ_merchant' },
  hook: 'They took my husband with the tin.',
  backstory: 'A tribe that lost its season hides in the scree pines and lives off the Tin Road. Three days ago they took our cart, our mules and my husband Ariapeithes. The pines do not give back what they take. Make them.',
  steps: [
    {
      id: 'cart', goal: 'Find the robbed tin cart', label: 'Cart',
      story: 'The cart lies on its side, the mules gone. Scree dust on the wheels: they came down from the pines.',
      where: 'On the Tin Road, west of the village.',
      trigger: { kind: 'reach', at: [330, 300] }, reward: { goods: { tin: 5 } },
    },
    {
      id: 'pines', goal: 'Raid the camp in the scree pines', label: 'Robbers',
      story: 'Smoke between the pines, and the clink of tin ingots counted twice.',
      where: 'The pines south-west, below the falls.',
      trigger: { kind: 'clear', at: [190, 385], mob: 'bandit', count: 6 }, reward: { goods: { tin: 10, coin: 15 } },
    },
    {
      id: 'carter', goal: 'Free Ariapeithes', label: 'Ariapeithes',
      story: 'He is roped to a pine, thinner than his wife remembers. Cut him loose; he will not go back to the road alone.',
      where: 'Bound in the robbers\' camp. Right-click him with your men.',
      trigger: { kind: 'rescue', at: [194, 389], cls: 'javelineer', level: 2, name: 'Ariapeithes' },
    },
    {
      id: 'skyles', goal: 'Face Skyles, chief of the lost season', label: 'Skyles',
      story: 'Skyles led his people out of the world above a season too late. He has been robbing it back ever since.',
      where: 'His hold on the spur above the narrows.',
      trigger: { kind: 'clear', at: [130, 300], mob: 'bandit', count: 5, lead: true, name: 'Skyles' },
    },
    {
      id: 'terms', goal: 'Decide the tribe\'s fate', label: 'Skyles',
      story: 'Skyles lies beaten among his last men. Behind him, the tribe\'s children watch from the pines.',
      where: 'Choose on this card.',
      trigger: {
        kind: 'choice', options: [
          { id: 'spare', label: 'Let them guard the road', text: 'Skyles swears his tribe to keep the Tin Road instead of robbing it. His eldest son rides with you.', reward: { soul: { cls: 'archer', level: 3, name: 'Skyles\' son' }, goods: { tin: 10 } } },
          { id: 'hang', label: 'Hang him by the road', text: 'The tribe scatters into the scree. His horn bow is yours.', reward: { item: { def: 'scythian_bow', rarity: 'rare' }, goods: { coin: 35 } } },
        ],
      },
    },
  ],
  end: 'Opoia walks her husband home along the Tin Road. The pines are quiet tonight.',
  reward: { goods: { coin: 50, food: 30 } },
};

const HEATH: Story = {
  id: 'heath-lanterns', region: 'dodona-w', title: 'Lanterns on the Heath',
  giver: { name: 'Aithra', title: 'peat-cutter of the heath', at: [404, 345], cls: 'civ_forager' },
  hook: 'The lanterns walked again last night.',
  backstory: 'The bogs keep the oath-breakers who fled Dodona\'s first muster. On still nights their lanterns walk the heath, always west, always the same way. Last night one called my name. Find where they go.',
  steps: [
    {
      id: 'lanterns', goal: 'Walk with the lanterns', label: 'Lantern',
      story: 'Pale lights hang low over the heather. They wait for you, and move on.',
      where: 'West from the village, over the ridge, light by light.',
      trigger: { kind: 'track', marks: [[362, 322], [330, 292], [316, 268], [282, 252]] },
    },
    {
      id: 'stone', goal: 'Find what the lanterns guard', label: 'Oath-stone',
      story: 'A drowned oath-stone, half sunk in peat. The names of those who fled are cut on it. One is fresh-cut.',
      where: 'Where the lights go out, at the bog\'s edge.',
      trigger: { kind: 'reach', at: [236, 244] }, reward: { goods: { coin: 15 } },
    },
    {
      id: 'oath', goal: 'Break the stone or keep it', label: 'Oath-stone',
      story: 'Break it and the oath dies with it: the lanterns rest. Keep it and they will light your way.',
      where: 'Choose on this card.',
      trigger: {
        kind: 'choice', options: [
          { id: 'break', label: 'Break the stone', text: 'It cracks like ice. Across the heath, the lanterns go out one by one.', reward: { goods: { food: 40, coin: 20 } }, next: 'pack' },
          { id: 'keep', label: 'Keep the oath', text: 'You set it upright. One lantern stays with you, small as an owl\'s eye.', reward: { item: { def: 'owl_amulet', rarity: 'uncommon' } }, next: 'pack' },
        ],
      },
    },
    {
      id: 'pack', goal: 'Drive off Grey-Muzzle\'s pack', label: 'Grey-Muzzle',
      story: 'The fresh name belongs to a man the wolves have kept at bay all night. Their old leader is grey to the eyes.',
      where: 'The heath south of the stone.',
      trigger: { kind: 'clear', at: [206, 262], mob: 'wolf', count: 6, lead: true, name: 'Grey-Muzzle' },
    },
    {
      id: 'oathman', goal: 'Free the last oath-breaker', label: 'Oath-breaker',
      story: 'Kleitos fled the muster and has run ever since. He is done running. He will keep his oath with your men.',
      where: 'Up a dead pine where the pack held him. Right-click him with your men.',
      trigger: { kind: 'rescue', at: [208, 265], cls: 'hoplite', level: 2, name: 'Kleitos' },
    },
  ],
  end: 'Aithra hears no voice in the bog tonight. The heath is only a heath.',
  reward: { goods: { coin: 50 } },
};

const LAGOON: Story = {
  id: 'salt-thieves', region: 'kyrene-e', title: 'Salt for Kyrene',
  giver: { name: 'Eryxo', title: 'last of the salt-cutters', at: [114, 378], cls: 'civ_cook' },
  hook: 'They sell my salt back to me.',
  backstory: 'We cut salt on the sand bar since we woke. Bandits emptied our huts and sell the salt back to Kyrene at thrice its weight in silver. I am the last who stayed. Find the thief who calls himself a king.',
  steps: [
    {
      id: 'huts', goal: 'Search the emptied huts', label: 'Huts',
      story: 'Pans smashed, racks burnt. Scratched on a pot: a tally of what was sold, and to whom.',
      where: 'The salt-cutters\' huts, east of the well.',
      trigger: { kind: 'reach', at: [150, 345] }, reward: { goods: { salt: 5 } },
    },
    {
      id: 'ruts', goal: 'Follow the salt-cart ruts', label: 'Ruts',
      story: 'Heavy carts went round the lagoon and up the sand bar, deep in the wet sand. The sea has not yet smoothed them.',
      where: 'South round the lagoon, then north up the sand bar.',
      trigger: { kind: 'track', marks: [[250, 412], [330, 432], [382, 372], [382, 300]] },
    },
    {
      id: 'store', goal: 'Break the thieves\' salt store', label: 'Store',
      story: 'Sacks of white salt stacked like a temple, and seven men who never cut a grain of it.',
      where: 'Their store at the narrows of the bar.',
      trigger: { kind: 'clear', at: [382, 205], mob: 'bandit', count: 7 }, reward: { goods: { salt: 15, coin: 15 } },
    },
    {
      id: 'magas', goal: 'Face Magas the Salt-King', label: 'Magas',
      story: 'Magas wears a crown of salt crystals and calls the lagoon his kingdom. Kings fall.',
      where: 'His hall at the bar\'s north end.',
      trigger: { kind: 'clear', at: [384, 96], mob: 'bandit', count: 4, lead: true, name: 'Magas the Salt-King' },
    },
    {
      id: 'crown', goal: 'Judge the Salt-King', label: 'Magas',
      story: 'His crown has cracked. "Spare me," says Magas, "and the salt flows to you, not Kyrene."',
      where: 'Choose on this card.',
      trigger: {
        kind: 'choice', options: [
          { id: 'spare', label: 'Take his oath', text: 'Magas sells to you now, at a fair weight. His best slinger is yours as a pledge.', reward: { soul: { cls: 'slinger', level: 3, name: 'Magas\' slinger' }, goods: { salt: 20 } } },
          { id: 'slay', label: 'End his reign', text: 'The salt is Eryxo\'s again. In his hall, a faience scarab for luck.', reward: { item: { def: 'scarab', rarity: 'rare' }, goods: { coin: 40 } } },
        ],
      },
    },
  ],
  end: 'Eryxo cuts the first salt in a season. She sets a handful aside for you.',
  reward: { goods: { coin: 50, salt: 10 } },
};

const CAPE: Story = {
  id: 'wind-watch', region: 'elaia-s', title: 'The Watch on the Steps',
  giver: { name: 'Melanthios', title: 'goatherd of the cape', at: [417, 264], cls: 'civ_forager' },
  hook: 'My boy went after the goats. The wind brought back his sling.',
  backstory: 'The wind on this cape blows toward the rim, and brigands watch the Delta road from its steps. My goats went over the fold wall in the night and my boy Philon went after them. Only his sling came home.',
  steps: [
    {
      id: 'fold', goal: 'Find the empty goat-fold', label: 'Fold',
      story: 'The fold gate hangs open. In the dust, a brigand\'s sling-stone with an eye scratched on it.',
      where: 'The fold south-west of the village.',
      trigger: { kind: 'reach', at: [350, 300] }, reward: { goods: { food: 20 } },
    },
    {
      id: 'steps', goal: 'Climb the cape\'s steps', label: 'Goat tracks',
      story: 'Goat tracks, then boot tracks over them, up the stepped cape into the wind.',
      where: 'West along the steps.',
      trigger: { kind: 'track', marks: [[302, 330], [252, 320], [204, 302]] },
    },
    {
      id: 'watch', goal: 'Take the brigands\' watch post', label: 'The Eye',
      story: 'The Eye of the Cape sees every cart on the Delta road. It did not see you coming.',
      where: 'Their post on the high step.',
      trigger: { kind: 'clear', at: [162, 290], mob: 'bandit', count: 5, lead: true, name: 'the Eye of the Cape' }, reward: { goods: { coin: 25 } },
    },
    {
      id: 'philon', goal: 'Free Philon', label: 'Philon',
      story: 'Philon sits tied among the stolen goats, sling-less and furious. He wants to fight with whoever freed him.',
      where: 'In the watch post. Right-click him with your men.',
      trigger: { kind: 'rescue', at: [165, 293], cls: 'slinger', level: 2, name: 'Philon' },
    },
    {
      id: 'home', goal: 'Bring word to Melanthios', label: 'Melanthios',
      story: 'The boy marches with you now. His father should hear it from you.',
      where: 'Back at the village well.',
      trigger: { kind: 'talk' }, reward: { item: { def: 'pelte', rarity: 'uncommon' } },
    },
  ],
  end: 'Melanthios laughs into the wind. "Then he is a soldier. Keep him fed."',
  reward: { goods: { coin: 40, food: 40 } },
};

const MOORS: Story = {
  id: 'bear-cairns', region: 'moors', title: 'The Cairns of the March',
  giver: { name: 'Sthenelos', title: 'last of the eastern march', at: [186, 306], cls: 'civ_physician' },
  hook: 'The first march still lies on these moors.',
  backstory: 'We were the first army Dodona sent east. The Great Bear met us on the moors and we never marched again. The tors are our cairns. Her grown cubs dig at them now, and the names are going.',
  steps: [
    {
      id: 'causeway', goal: 'Read the cairn at the causeway', label: 'Cairn',
      story: 'The names of the march, cut in granite. Under them, fresh claw marks. The cubs hunt the causeway.',
      where: 'The causeway across the bog, east of the village.',
      trigger: { kind: 'reach', at: [252, 252] }, reward: { goods: { stone: 10, coin: 10 } },
    },
    {
      id: 'claws', goal: 'Follow the claw marks', label: 'Claw marks',
      story: 'Torn turf and scored granite lead east, tor to tor.',
      where: 'East over the moor, toward the old fortress.',
      trigger: { kind: 'track', marks: [[300, 254], [342, 272], [378, 292]] },
    },
    {
      id: 'cubs', goal: 'Drive off the Great Bear\'s cubs', label: 'The cubs',
      story: 'Three bears the size of ox carts, digging at a cairn. They are only her children.',
      where: 'The cairn below the fortress.',
      trigger: { kind: 'clear', at: [396, 322], mob: 'bear', count: 3, lead: true, name: 'the Great Bear\'s cubs' }, reward: { goods: { hides: 10, coin: 20 } },
    },
    {
      id: 'shade', goal: 'Wake the shade under the cairn', label: 'Shade',
      story: 'A hoplite of the first march lies under the stones, waiting to be called. Call him.',
      where: 'The dug-up cairn. Right-click him with your men.',
      trigger: { kind: 'rescue', at: [398, 325], cls: 'hoplite', level: 3, name: 'Eurytos of the march' },
    },
    {
      id: 'names', goal: 'Honour the march', label: 'Cairn',
      story: 'The cairn is open. You may cut the names again, or take the march\'s bronze to war once more.',
      where: 'Choose on this card.',
      trigger: {
        kind: 'choice', options: [
          { id: 'names', label: 'Cut the names again', text: 'Name by name, into fresh granite. The march remembers who remembered them.', reward: { item: { def: 'laurel', rarity: 'rare' }, goods: { coin: 30 } } },
          { id: 'bronze', label: 'Take their bronze', text: 'Green shields, still sound. The dead would rather they fought.', reward: { item: { def: 'hoplon', rarity: 'rare' }, goods: { bronze: 10 } } },
        ],
      },
    },
  ],
  end: 'Sthenelos lies down on the tor. The Great Bear sleeps on. One day, someone will wake her.',
  reward: { goods: { coin: 80 } },
};

/** The region stories, by region id. */
export const STORIES: Readonly<Record<string, Story>> = Object.fromEntries([TEETH, SLOPES, HEATH, LAGOON, CAPE, MOORS].map((s) => [s.region, s]));
export const storyOf = (region: string): Story | null => STORIES[region] ?? null;

/** One-line hooks for the regions still without a chain (from docs/WAR.md lore): the giver and what he asks. */
export const STORY_HOOKS: Readonly<Record<string, { title: string; giver: string; hook: string }>> = {
  'dodona-n': { title: 'The Singing Ribs', giver: 'a drowned helmsman', hook: 'Wolves den in my longship. Clear the hull so the north wind can sing me to sleep.' },
  'dodona-s': { title: 'Names in the River', giver: 'an oak-priestess', hook: 'The Ladon carries a name I must not lose. Find the spear-oak it fell from.' },
  'skythia-n': { title: 'The Masterless Herd', giver: 'a rider who woke without his horse', hook: 'My mare grazes with the masterless herd on the frozen ponds. Bring her back.' },
  'skythia-e': { title: 'Faces in the Chalk', giver: 'a cliff-carver', hook: 'Someone cut a new face in the white cliff. It is mine, and I have not leapt.' },
  'skythia-s': { title: 'The Chieftain\'s Mound', giver: 'a mound-keeper', hook: 'Grave robbers opened the oldest mound. What they took will wake him.' },
  'kyrene-n': { title: 'The Throat of the Wadi', giver: 'a water-carrier', hook: 'The lions remember the army that died of thirst. They are hunting its last scout.' },
  'kyrene-s': { title: 'The Digger\'s Well', giver: 'the well-digger\'s ghost', hook: 'Sand chokes my well. Dig it out before the dunes walk over the outcrop.' },
  'kyrene-w': { title: 'After the Flood', giver: 'a reed-farmer', hook: 'The flood brought a serpent fat on the drowned. It nests in my channel.' },
  'elaia-n': { title: 'Bones in the Reeds', giver: 'the last fenwoman', hook: 'My people are bones in the reeds. The serpents will not let me bury them.' },
  'elaia-w': { title: 'What the Coast Lost', giver: 'a hanged pirate\'s widow', hook: 'He hid his last prize in the sea caves. His crew woke hungrier than he did.' },
  'elaia-e': { title: 'Wine for the Crossing', giver: 'a vintner of the first dead', hook: 'Boars trampled the oldest vine. Without its wine, no crossing of the river is lucky.' },
  kleisoura: { title: 'The Toll-Takers', giver: 'a tin-trader of the pass', hook: 'The deserters in the Wardens\' fort tax my tin twice. Break the toll.' },
  stymphalia: { title: 'The Empty Square', giver: 'a causeway ferryman', hook: 'The Reed Men hold the empty square. The bronze birds nest on the isle above them.' },
  achelous: { title: 'Charon\'s Due', giver: 'a soldier of the fleeing army', hook: 'The Ferrymen charge the dead to cross. My company still waits on the far bank.' },
  ammos: { title: 'The Caravan That Never Came', giver: 'a caravan-master', hook: 'My riders rob every caravan that arrives. Make them stop waiting for me.' },
  kimmeria: { title: 'Gold of the Kimmerians', giver: 'a Kimmerian shade', hook: 'The griffin keeps our gold in the broken gate. We would pay you with it.' },
  savanna: { title: 'The Unskinned Lion', giver: 'a hero\'s shield-bearer', hook: 'Every Kyrenean hero who went to skin the lion lies here. Mine was the last.' },
  bacchae: { title: 'Do Not Watch', giver: 'a goatherd who looked away', hook: 'My brother watched the dancers. Bring back what is left of him.' },
};

/*
 * Template (copy, fill, add to STORIES):
 *
 * const REGION: Story = {
 *   id: 'kebab-id', region: '<region id>', title: 'Title Case',
 *   giver: { name: 'Name', title: 'who he is', at: [x, y] (beside the village well), cls: 'civ_forager' },
 *   hook: 'One line under his "!".',
 *   backstory: 'Two or three short lines from the region lore: who was wronged, by whom, what he asks.',
 *   steps: [
 *     { id: 'clue', goal: 'Search the …', label: 'Marker', story: 'What you find.', where: 'Where it is.', trigger: { kind: 'reach', at: [x, y] }, reward: { goods: { coin: 10 } } },
 *     { id: 'trail', goal: 'Follow the …', label: 'Mark', story: '…', where: '…', trigger: { kind: 'track', marks: [[x, y], [x, y], [x, y]] } },
 *     { id: 'camp', goal: 'Break the … camp', label: 'Foes', story: '…', where: '…', trigger: { kind: 'clear', at: [x, y], mob: 'bandit', count: 6 } },
 *     { id: 'captive', goal: 'Free …', label: 'Name', story: '…', where: '… Right-click him with your men.', trigger: { kind: 'rescue', at: [x, y], cls: 'hoplite', level: 2, name: 'Name' } },
 *     { id: 'boss', goal: 'Face …', label: 'Name', story: '…', where: '…', trigger: { kind: 'clear', at: [x, y], mob: 'bandit', count: 4, lead: true, name: 'Name the …' } },
 *     { id: 'judge', goal: 'Judge …', label: 'Name', story: '…', where: 'Choose on this card.', trigger: { kind: 'choice', options: [
 *       { id: 'spare', label: 'Spare him', text: '…', reward: { soul: { cls: 'archer', level: 3, name: 'Name' } } },
 *       { id: 'slay', label: 'Slay him', text: '…', reward: { item: { def: 'kopis', rarity: 'rare' }, goods: { coin: 40 } } },
 *     ] } },
 *   ],
 *   end: 'The closing line.',
 *   reward: { goods: { coin: 50 } },
 * };
 *
 * Keep foes 25+ tiles from the region's own lairs (src/war/regions/<id>.json) so a step fights only its own; put a
 * captive 2-3 tiles from the camp that holds him and make him the step after it.
 */
