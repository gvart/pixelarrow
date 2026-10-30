/**
 * W-65 the neutral regions' story chains (the runner: src/war/sim/stories.ts). Each is told from its region's lore line
 * (docs/WAR.md "Region lore and depth"): a giver at the village well, 3-5 steps sent to places of the region, a named
 * foe, a choice where it is cheap, and a real reward (coin and goods, an item, a soul who joins). Points are tiles
 * (src/war/regions/<id>.spots.ts names the authored ones); the runner snaps each to open ground. Souls use the six
 * classes with war sprites (hoplite, archer, militia, slinger, javelineer, celt_sword).
 *
 * A new story: copy the template at the end of this file, fill it from the region's lore and its spots, and add it to
 * STORIES. tests/war/stories.test.ts walks every story's places from its giver.
 */
import type { Pt, Story } from '../war/sim/stories';
import type { MobKind, RegionData } from '../war/types';
import { depthOf } from '../war/sim/depth';
import { chiefsOfKind, warChief } from './warBosses';

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
      trigger: { kind: 'clear', at: [268, 304], mob: 'bandit', count: 6 }, reward: { goods: { iron: 10, coin: 20 } },
    },
    {
      id: 'lykon', goal: 'Face Lykon the Overseer', label: 'Lykon',
      story: 'Lykon kept the tally when the shafts fell, and ran with the ore. He has been running since.',
      where: 'His last guard, by the stream east of the camp.',
      trigger: { kind: 'clear', at: [340, 262], mob: 'bandit', count: 4, lead: true, name: 'Lykon the Overseer' },
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
  end: 'Mnason pours water on the stones, and the Teeth breathe a little warmer. In Lykon\'s tally-sack lies a shard of the Wardens\' oath: "Nothing from below comes up." The shafts say otherwise.',
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
  end: 'Opoia walks her husband home along the Tin Road. Under Skyles\' saddle-cloth, wrapped like a relic, was a shard of the Wardens\' oath: "The roads are kept in every season."',
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
  end: 'Aithra hears no voice in the bog tonight. Where the drowned stone stood, the peat gives up an older piece, a shard of the Wardens\' oath: "The forsworn walk until they keep it."',
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
  end: 'Eryxo cuts the first salt in a season and sets a handful aside for you. Under the Salt-King\'s seat lay a shard of the Wardens\' oath: "Salt on every threshold, against the dark." She salts her door that night.',
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
  end: 'Melanthios laughs into the wind. "Then he is a soldier. Keep him fed." The Eye of the Cape sat on a shard of the Wardens\' oath: "We face the wind that blows outward." The wind still blows that way.',
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
  end: 'Sthenelos lies down on the tor. The cairn\'s last stone is no granite but a shard of the Wardens\' oath: "Our names fall before our watch does." The rest of it lies in the Great Bear\'s den, and she sleeps on.',
  reward: { goods: { coin: 80 } },
};

const FJORDS: Story = {
  id: 'singing-ribs', region: 'dodona-n', title: 'The Singing Ribs',
  giver: { name: 'Phereklos', title: 'a drowned helmsman', at: [192, 452], cls: 'civ_engineer' },
  hook: 'Wolves den in my longship. The wind cannot sing in her.',
  backstory: 'I steered a longship of the drowned up the eastern arm and beached her when the sea let go of us. The north wind sang in her ribs and I slept. Now wolves den in the hull, and the song is choked with fur. Clear her, so I can sleep.',
  steps: [
    {
      id: 'oar', goal: 'Find the steering oar', label: 'Oar',
      story: 'His oar lies on the shingle at the head of the fjord, his name burnt into the loom. Gnawed. Wolves have carried it here and dropped it.',
      where: 'Where the eastern fjord ends, north-east of the village.',
      trigger: { kind: 'reach', at: [378, 402] }, reward: { goods: { wood: 15 } },
    },
    {
      id: 'spoor', goal: 'Follow the wolf spoor up the shore', label: 'Spoor',
      story: 'Paw prints in the frost, bones of seals, a scrap of sail. The pack runs the shore between the hull and the sea.',
      where: 'North along the fjord\'s western shore.',
      trigger: { kind: 'track', marks: [[348, 360], [342, 315], [340, 275]] },
    },
    {
      id: 'hull', goal: 'Drive the Hound from the hull', label: 'The Hound',
      story: 'The longship lies keel-up on the shore, ribs to the sky. The pack sleeps in her belly, and the biggest of them was born in the north wind.',
      where: 'The beached hull on the fjord shore.',
      trigger: { kind: 'clear', at: [338, 232], mob: 'wolf', count: 6, lead: true, name: 'the Hound of Boreas' }, reward: { goods: { hides: 10, coin: 20 } },
    },
    {
      id: 'ribs', goal: 'Decide what becomes of the hull', label: 'Hull',
      story: 'The hull is empty. The wind comes down the fjord and finds the ribs again. Phereklos asked for a song. A pyre would do as well, and the oak is sound.',
      where: 'Choose on this card.',
      trigger: {
        kind: 'choice', options: [
          { id: 'sing', label: 'Leave her to the wind', text: 'You leave the ribs bare. By dusk the wind is singing in them, low and steady, all the way to the village.', reward: { item: { def: 'wolfskin_cap', rarity: 'rare' }, goods: { coin: 20 } } },
          { id: 'strip', label: 'Strip her for timber', text: 'Old oak, bent by the sea and dry as bone. Your carts take every rib. The wind passes over the empty shore with nothing to sing in.', reward: { goods: { wood: 50, pitch: 10, coin: 20 } } },
        ],
      },
    },
  ],
  end: 'Phereklos sits by the well and listens to the north. Wedged in the keel where the Hound slept was a shard of the Wardens\' oath: "No keel passes the grey water." Whatever the wind tells him, he does not say.',
  reward: { goods: { coin: 50 } },
};

const OAKWOOD: Story = {
  id: 'river-names', region: 'dodona-s', title: 'Names in the River',
  giver: { name: 'Kleodora', title: 'oak-priestess of the Ladon', at: [324, 428], cls: 'civ_physician' },
  hook: 'The Ladon carries a name I must not lose.',
  backstory: 'This wood grew from the spears of a host cut down to the last man. Each oak keeps one name, and when its bark falls the Ladon carries the name down to the lake and it is gone. Last night the river brought me a strip of bark with a name half washed away. Find the oak it fell from.',
  steps: [
    {
      id: 'ford', goal: 'Search the eastern ford', label: 'Ford',
      story: 'Strips of bark are caught in the ford stones, names cut into them. Most are blurred. One is fresh, and it was torn, not shed.',
      where: 'The ford on the Ladon, north-east of the village.',
      trigger: { kind: 'reach', at: [438, 294] }, reward: { goods: { coin: 10 } },
    },
    {
      id: 'upstream', goal: 'Follow the bark upstream', label: 'Bark',
      story: 'Torn bark in the shallows, then on the bank, then in the ferns. Something drags it from the wood to the water.',
      where: 'Upstream along the inner bank, toward the oak wood.',
      trigger: { kind: 'track', marks: [[420, 215], [385, 150], [320, 115]] },
    },
    {
      id: 'oak', goal: 'Drive the Rooting Sow from the spear-oak', label: 'The Sow',
      story: 'A great sow and her litter root at the foot of one oak. Its bark hangs in strips, and between the roots shows the bronze butt of a spear.',
      where: 'The spear-oak in the wood ring west of the hill.',
      trigger: { kind: 'clear', at: [178, 235], mob: 'boar', count: 4, lead: true, name: 'the Rooting Sow' }, reward: { goods: { food: 20, hides: 5 } },
    },
    {
      id: 'spearman', goal: 'Wake the spearman of the oak', label: 'Amphimachos',
      story: 'The oak was his spear, and the name was his. With the bark torn off he is waking, and he does not know where his host has gone.',
      where: 'At the roots of the spear-oak. Right-click him with your men.',
      trigger: { kind: 'rescue', at: [181, 238], cls: 'hoplite', level: 3, name: 'Amphimachos' },
    },
    {
      id: 'name', goal: 'Bring his name to Kleodora', label: 'Kleodora',
      story: 'Amphimachos marches with you. His name should be cut where the river cannot reach it.',
      where: 'Back at the village well.',
      trigger: { kind: 'talk' }, reward: { item: { def: 'sauroter_dory', rarity: 'rare' } },
    },
  ],
  end: 'Kleodora cuts the name into her lintel. "Wood forgets," she says. "Stone forgets slower." The spear-butt stood in a shard of the Wardens\' oath: "No name goes to Lethe while we stand." They no longer stand.',
  reward: { goods: { coin: 50, food: 20 } },
};

const STEPPE: Story = {
  id: 'masterless-herd', region: 'skythia-n', title: 'The Masterless Herd',
  giver: { name: 'Saulios', title: 'a rider who woke without his horse', at: [410, 440], cls: 'civ_forager' },
  hook: 'My mare grazes with the masterless herd. Bring her back.',
  backstory: 'We died together in the saddle, my mare and I. I woke on the steppe and she did not wake beside me. Now she runs with the herds of riders who never woke at all, out on the frozen ponds. A Scythian without his horse is only a man. Bring her back.',
  steps: [
    {
      id: 'hooves', goal: 'Follow her hoofprints west', label: 'Hoofprints',
      story: 'One set of prints, shod in the old way, apart from the herd\'s. She is looking for something too.',
      where: 'West across the steppe, print by print.',
      trigger: { kind: 'track', marks: [[350, 410], [280, 395], [205, 352]] },
    },
    {
      id: 'pond', goal: 'Search the western pond', label: 'Pond',
      story: 'Her bridle, frozen into the ice at the pond\'s edge. Blood on the snow, not hers. Wolf tracks circle the pond three times.',
      where: 'The frozen pond in the west.',
      trigger: { kind: 'reach', at: [140, 298] }, reward: { goods: { leather: 5 } },
    },
    {
      id: 'pack', goal: 'Break Frost-Jaw\'s pack', label: 'Frost-Jaw',
      story: 'They have cut her from the herd and run her into the reeds. Their leader has a jaw white with old frost and he is patient.',
      where: 'The reeds south of the pond.',
      trigger: { kind: 'clear', at: [165, 360], mob: 'wolf', count: 6, lead: true, name: 'Frost-Jaw' }, reward: { goods: { hides: 10, coin: 15 } },
    },
    {
      id: 'home', goal: 'Lead the mare to Saulios', label: 'Saulios',
      story: 'She is lame and wild-eyed, but she follows your men. She remembers the smell of a camp.',
      where: 'Back at the village well.',
      trigger: { kind: 'talk' }, reward: { soul: { cls: 'archer', level: 3, name: 'Saulios' } },
    },
  ],
  end: 'Saulios puts his face in her mane and says nothing for a long time. Her bridle was knotted round a shard of the Wardens\' oath: "No rider goes over the edge." Then he asks where you ride next.',
  reward: { goods: { coin: 40, food: 30 }, item: { def: 'horse_pendant', rarity: 'uncommon' } },
};

const CHALK: Story = {
  id: 'chalk-faces', region: 'skythia-e', title: 'Faces in the Chalk',
  giver: { name: 'Ariston', title: 'a carver of the white cliffs', at: [170, 392], cls: 'civ_smith' },
  hook: 'Someone cut my face in the cliff. I have not leapt.',
  backstory: 'Those who would rather leap than fade cut their faces in the chalk, and then they go over. I have carved forty faces for others. This morning there was a new one on the cliff, and it was mine. I have not leapt. I do not mean to.',
  steps: [
    {
      id: 'face', goal: 'Look at the new face', label: 'Face',
      story: 'His face, well cut, the chalk dust still wet. Below it, the turf is worn by boots, and at the edge a rope has rubbed a groove into the chalk.',
      where: 'The cliff top north-east of the village.',
      trigger: { kind: 'reach', at: [432, 182] }, reward: { goods: { stone: 10 } },
    },
    {
      id: 'leapers', goal: 'Break Bias the Chisel\'s band', label: 'Bias',
      story: 'The Leapers cut a face for a man first, then push him, and sell what he leaves behind. Bias holds the chisel. He has done it forty times.',
      where: 'Their camp on the downs north along the cliffs.',
      trigger: { kind: 'clear', at: [400, 80], mob: 'bandit', count: 5, lead: true, name: 'Bias the Chisel' }, reward: { goods: { coin: 25, bronze: 5 } },
    },
    {
      id: 'roped', goal: 'Cut Teres loose', label: 'Teres',
      story: 'A slinger trussed by the cliff edge, his face already cut on the chalk below. He was to go over at dusk.',
      where: 'In the Leapers\' camp. Right-click him with your men.',
      trigger: { kind: 'rescue', at: [403, 83], cls: 'slinger', level: 2, name: 'Teres' },
    },
    {
      id: 'chalk', goal: 'Decide about Ariston\'s face', label: 'Face',
      story: 'Ariston\'s face is still on the cliff. A face cut is a promise to the sea. It can be cut out.',
      where: 'Choose on this card.',
      trigger: {
        kind: 'choice', options: [
          { id: 'erase', label: 'Cut it out', text: 'You chip his face off the cliff and let the chalk fall into the dead water. He will fade when he fades, and not before.', reward: { goods: { stone: 15, coin: 30 } } },
          { id: 'keep', label: 'Leave it', text: 'A good face, and his own work in a way. Let the cliff keep it. Bias carried an eye bead to watch his victims; it watches for you now.', reward: { item: { def: 'eye_bead', rarity: 'rare' } } },
        ],
      },
    },
  ],
  end: 'Ariston goes back to his chisel; on the next face he cuts, the eyes are open. Under Bias\' work he finds an older cutting, a shard of the Wardens\' oath: "No shade leaps, and none is pushed."',
  reward: { goods: { coin: 50 } },
};

const KURGANS: Story = {
  id: 'chieftain-mound', region: 'skythia-s', title: 'The Chieftain\'s Mound',
  giver: { name: 'Madyes', title: 'keeper of the mounds', at: [424, 393], cls: 'civ_cook' },
  hook: 'Grave robbers opened the oldest mound.',
  backstory: 'The mounds here are older than any alliance, and I keep them. Three nights ago robbers sank a shaft into the oldest, north of the village, and took the gold torc from the chieftain\'s chest. He sleeps lightly without it. Bring it back before he wakes and comes for it himself.',
  steps: [
    {
      id: 'mound', goal: 'Look into the opened mound', label: 'Mound',
      story: 'A shaft through the turf into the dark. The chieftain lies on his horses\' bones with his arms crossed over nothing. The earth around him is warm.',
      where: 'The oldest mound, north of the village.',
      trigger: { kind: 'reach', at: [428, 106] }, reward: { goods: { coin: 10 } },
    },
    {
      id: 'beads', goal: 'Follow the dropped gold beads', label: 'Beads',
      story: 'A torn bag leaks gold beads, one every hundred paces. The robbers were in a hurry. They knew what sleeps there.',
      where: 'West along the hills.',
      trigger: { kind: 'track', marks: [[380, 122], [330, 96], [285, 76]] },
    },
    {
      id: 'robbers', goal: 'Face Tisamenos the Grave-Robber', label: 'Tisamenos',
      story: 'Tisamenos has robbed every mound from here to the dunes. He wears the torc already, and it does not sit well on him.',
      where: 'His camp by the northern road.',
      trigger: { kind: 'clear', at: [240, 60], mob: 'bandit', count: 5, lead: true, name: 'Tisamenos the Grave-Robber' }, reward: { goods: { coin: 25, bronze: 5 } },
    },
    {
      id: 'torc', goal: 'Decide the torc\'s fate', label: 'Torc',
      story: 'The torc is heavy, old gold, warm in the hand. Madyes wants it back on the chieftain\'s chest. Nobody else knows you have it.',
      where: 'Choose on this card.',
      trigger: {
        kind: 'choice', options: [
          { id: 'return', label: 'Return it to the mound', text: 'You lay the torc on his chest and close the shaft. Under the turf, something settles.', reward: { goods: { coin: 40, food: 20 } } },
          { id: 'keep', label: 'Keep the gold', text: 'Gold is gold. Behind you the mound breathes out, and on the hills the wolves begin to howl.', reward: { item: { def: 'gold_torc', rarity: 'rare' } }, next: 'hounds' },
        ],
      },
    },
    {
      id: 'hounds', goal: 'Face the Chieftain\'s Hounds', label: 'Hounds',
      story: 'He was buried with his hounds. They have come out of the mound to fetch what he is owed.',
      where: 'On the hills between the mound and the village.',
      trigger: { kind: 'clear', at: [400, 182], mob: 'wolf', count: 6, lead: true, name: 'the Chieftain\'s Hounds' }, reward: { goods: { hides: 10 } },
    },
  ],
  end: 'Madyes sits on the mound\'s shoulder and watches the Desert Road. The chieftain keeps a shard of the Wardens\' oath under his tongue: "We watch from the high places." He sleeps, or pretends to.',
  reward: { goods: { coin: 40 } },
};

const DUNES: Story = {
  id: 'diggers-well', region: 'kyrene-s', title: 'The Digger\'s Well',
  giver: { name: 'Lakritos', title: 'the well-digger\'s ghost', at: [393, 216], cls: 'civ_engineer' },
  hook: 'Sand chokes my well. Dig it out before the dunes walk.',
  backstory: 'I dug the one well on the outcrop. I died at the bottom of it, the day the water came. The dunes walk over everything else here, but they have never had my well. Now the sand is in its throat, and something lives in the sand. Find my spade. I will dig it out myself.',
  steps: [
    {
      id: 'well', goal: 'Look into the choked well', label: 'Well',
      story: 'Sand to within a man\'s height of the lip. In the sand, bones gnawed clean, and the yelping of something below.',
      where: 'The well on the outcrop, west of the village.',
      trigger: { kind: 'reach', at: [252, 220] }, reward: { goods: { salt: 5 } },
    },
    {
      id: 'den', goal: 'Drive out Mother Thirst', label: 'Mother Thirst',
      story: 'Jackals have dug their den into the well\'s throat. Their mother is old and grey and has fed on the thirsty for longer than the village has stood.',
      where: 'The den beside the well.',
      trigger: { kind: 'clear', at: [255, 236], mob: 'jackal', count: 6, lead: true, name: 'Mother Thirst' }, reward: { goods: { hides: 5, coin: 15 } },
    },
    {
      id: 'cord', goal: 'Follow the digger\'s knotted cord', label: 'Cord',
      story: 'His measuring cord runs out from the well, a knot every fathom, half buried. It leads to where he first found damp sand.',
      where: 'South-east along the long dune, knot by knot.',
      trigger: { kind: 'track', marks: [[312, 300], [352, 332], [388, 362]] },
    },
    {
      id: 'spade', goal: 'Bring the spade to Lakritos', label: 'Lakritos',
      story: 'At the cord\'s end, under the lip of a dune: a bronze spade worn thin, and an amulet of Bes tied to its handle.',
      where: 'Back at the village well.',
      trigger: { kind: 'talk' }, reward: { item: { def: 'bes_amulet', rarity: 'rare' } },
    },
  ],
  end: 'By morning the ghost has dug the well clear, and the water is sweet. At the bottom lay what he died digging toward, a shard of the Wardens\' oath: "We dig until the water comes."',
  reward: { goods: { coin: 50, salt: 10 } },
};

const COVES: Story = {
  id: 'coast-lost', region: 'elaia-w', title: 'What the Coast Lost',
  giver: { name: 'Chryseis', title: 'widow of a hanged pirate', at: [425, 200], cls: 'civ_cook' },
  hook: 'He hid his last prize in the sea caves.',
  backstory: 'My husband Neleus was hanged on the headland for a pirate, and he was one. Before they took him he hid his last prize in the sea caves. His crew woke here as hungry as they died, and they want it. So do I. It is all I have of him.',
  steps: [
    {
      id: 'gallows', goal: 'Find the hanging tree', label: 'Gallows',
      story: 'His rope still hangs from the branch. Cut into the bark at the height of a hanged man\'s hand: three notches pointing to the coves.',
      where: 'On the ridge west of the village.',
      trigger: { kind: 'reach', at: [205, 254] }, reward: { goods: { coin: 10 } },
    },
    {
      id: 'crew', goal: 'Break Dromon One-Ear\'s crew', label: 'Dromon',
      story: 'Neleus\'s crew camp on the middle cove, digging every hole on the beach. Dromon took his place and his ear was the price.',
      where: 'Their camp on the middle cove.',
      trigger: { kind: 'clear', at: [112, 264], mob: 'bandit', count: 6, lead: true, name: 'Dromon One-Ear' }, reward: { goods: { coin: 20, pitch: 5 } },
    },
    {
      id: 'cave', goal: 'Search the southern sea cave', label: 'Sea cave',
      story: 'Behind the tide line, a chest of coin and a wax tablet. On it, in Chryseis\'s hand: the night he would come ashore, sold to the harbour-master for twenty drachmae.',
      where: 'The cave under the southern cove.',
      trigger: { kind: 'reach', at: [80, 404] },
    },
    {
      id: 'prize', goal: 'Decide who gets the prize', label: 'Prize',
      story: 'She sold him to the rope. She wants his gold. The tablet is in your hand and she does not know you have read it.',
      where: 'Choose on this card.',
      trigger: {
        kind: 'choice', options: [
          { id: 'give', label: 'Give it to the widow', text: 'You hand her the chest and keep the tablet. She weighs the coin, and looks at you, and pays your share without being asked.', reward: { goods: { coin: 60 } } },
          { id: 'keep', label: 'Keep it, show her the tablet', text: 'She reads it, and says nothing, and goes back to her hut. Neleus\'s seal ring was in the chest. It suits you better.', reward: { item: { def: 'signet_ring', rarity: 'rare' }, goods: { coin: 30, silver: 5 } } },
        ],
      },
    },
  ],
  end: 'On the headland, someone has taken down the rope at last. The noose was knotted round a shard of the Wardens\' oath: "The drowned are let ashore." Neleus came ashore. The rope was waiting.',
  reward: { goods: { coin: 30, food: 20 } },
};

const VINEYARDS: Story = {
  id: 'crossing-wine', region: 'elaia-e', title: 'Wine for the Crossing',
  giver: { name: 'Oinopion', title: 'vintner of the first dead', at: [97, 230], cls: 'civ_merchant' },
  hook: 'Boars trampled the oldest vine.',
  backstory: 'The first Elaians who drowned planted these vines, and their wine is poured at every crossing of the river, for luck. Without it no one crosses lucky. The boars came down in the night and tore the oldest vine out by the root. Drive them off, and find me a cutting that still lives.',
  steps: [
    {
      id: 'rows', goal: 'Drive the boars from the vineyard', label: 'Boars',
      story: 'Stakes snapped, leaves in the mud, the old root dragged out like a drowned man. The boars are still at it.',
      where: 'The vineyard south of the farm.',
      trigger: { kind: 'clear', at: [70, 272], mob: 'boar', count: 4 }, reward: { goods: { food: 15 } },
    },
    {
      id: 'trail', goal: 'Follow the great boar\'s trail', label: 'Trail',
      story: 'One trail is deeper than the rest, and green leaves are caught in it. The one who led them ate the oldest vine and went east.',
      where: 'East across the hills, wallow by wallow.',
      trigger: { kind: 'track', marks: [[122, 298], [172, 318], [222, 330]] },
    },
    {
      id: 'tusk', goal: 'Kill the Black Tusk', label: 'Black Tusk',
      story: 'A boar as black as pitch, his tusks yellow with age, lying in his wallow with vine leaves in his bristles. A green cutting still clings to him.',
      where: 'His wallow on the slope to the east.',
      trigger: { kind: 'clear', at: [272, 330], mob: 'boar', count: 3, lead: true, name: 'the Black Tusk' }, reward: { goods: { hides: 10, food: 20 } },
    },
    {
      id: 'cutting', goal: 'Bring the cutting to Oinopion', label: 'Oinopion',
      story: 'The cutting from the Black Tusk\'s bristles is alive. It should go back in the ground before it dries.',
      where: 'Back at the farm in the west.',
      trigger: { kind: 'talk' }, reward: { item: { def: 'hermes_token', rarity: 'rare' } },
    },
  ],
  end: 'Oinopion plants the cutting and pours the last of last year\'s wine on it. "For your next crossing." The old root had grown round a shard of the Wardens\' oath: "Every crossing is poured for."',
  reward: { goods: { coin: 40, oil: 10 } },
};

const PASS: Story = {
  id: 'toll-takers', region: 'kleisoura', title: 'The Toll-Takers',
  giver: { name: 'Hagnon', title: 'tin-trader of the pass', at: [205, 230], cls: 'civ_merchant' },
  hook: 'The deserters tax my tin twice. Break the toll.',
  backstory: 'The Rim Wardens took one toll at this pass, and then they went into the mist. The deserters who took their fort take two: one at the fort and one on the Saddle road, where nobody sees. My carts cannot pay it twice. Break the second toll and I will make it worth your while.',
  steps: [
    {
      id: 'stone', goal: 'Read the Wardens\' toll-stone', label: 'Toll-stone',
      story: 'The Wardens cut one toll into this stone, a tenth of all tin. Below it, fresh and crooked: a second tenth.',
      where: 'Where the Saddle road leaves the pass, south of the fort.',
      trigger: { kind: 'reach', at: [298, 330] }, reward: { goods: { tin: 5 } },
    },
    {
      id: 'post', goal: 'Break the second toll post', label: 'Toll post',
      story: 'A barricade of carts across the Saddle road, and tin stacked behind it. Every ingot is stamped twice.',
      where: 'Further down the Saddle road.',
      trigger: { kind: 'clear', at: [290, 420], mob: 'bandit', count: 5 }, reward: { goods: { tin: 10, coin: 10 } },
    },
    {
      id: 'sosias', goal: 'Face Sosias the Collector', label: 'Sosias',
      story: 'Sosias keeps the second toll\'s ledger and the second toll\'s silver. He has gone west to the torrent, where he thinks no one will follow.',
      where: 'His hideout by the western torrent.',
      trigger: { kind: 'clear', at: [132, 226], mob: 'bandit', count: 4, lead: true, name: 'Sosias the Collector' },
    },
    {
      id: 'ledger', goal: 'Decide what to do with the ledger', label: 'Ledger',
      story: 'Sosias\'s ledger lists every cart taxed twice, and the few that were not. Every one of those is Hagnon\'s. He has been paying the toll-takers to tax his rivals.',
      where: 'Choose on this card.',
      trigger: {
        kind: 'choice', options: [
          { id: 'burn', label: 'Burn the ledger', text: 'The pages curl in the fire. Hagnon smiles and pays you well, for a fire is cheaper than a reckoning.', reward: { goods: { tin: 20, coin: 40 } } },
          { id: 'expose', label: 'Keep it for the traders', text: 'Hagnon\'s seal is on the last page. The traders of the pass will want to see it, and they will pay to.', reward: { item: { def: 'curse_tablet', rarity: 'rare' }, goods: { coin: 30 } } },
        ],
      },
    },
  ],
  end: 'Tin moves through Kleisoura once-taxed again; whose silence, is another matter. The Wardens\' toll-stone cracks as you pass, and a shard of the Wardens\' oath falls at your feet: "One toll at the pass, and no more."',
  reward: { goods: { coin: 40 } },
};

const LAKE: Story = {
  id: 'empty-square', region: 'stymphalia', title: 'The Empty Square',
  giver: { name: 'Nikias', title: 'ferryman of the causeway', at: [192, 432], cls: 'civ_engineer' },
  hook: 'The Reed Men burnt my ferry.',
  backstory: 'The town on the causeway emptied the day the bronze-feathered birds nested on the isle. The Reed Men moved into the empty square, and now they take a tithe from anyone who crosses. I would not pay. They burnt my ferry and took my oarsman into the reeds.',
  steps: [
    {
      id: 'ferry', goal: 'Find the burnt ferry', label: 'Ferry',
      story: 'Charred ribs in the shallows at the causeway\'s foot. Reed rope, cut, and a trail of trampled reeds going west along the shore.',
      where: 'The foot of the causeway, east of the village.',
      trigger: { kind: 'reach', at: [296, 402] }, reward: { goods: { wood: 10 } },
    },
    {
      id: 'reeds', goal: 'Break the reed camp', label: 'Reed Men',
      story: 'Huts of bundled reed on stilts, and men who live off what crosses the lake. They are not expecting you to wade.',
      where: 'The reeds on the southern shore.',
      trigger: { kind: 'clear', at: [230, 378], mob: 'bandit', count: 6 }, reward: { goods: { coin: 15, food: 15 } },
    },
    {
      id: 'oarsman', goal: 'Free Pasion the oarsman', label: 'Pasion',
      story: 'Pasion is tied in a reed hut, sling still on his belt. They meant to sell him across the lake.',
      where: 'In the reed camp. Right-click him with your men.',
      trigger: { kind: 'rescue', at: [232, 381], cls: 'slinger', level: 2, name: 'Pasion' },
    },
    {
      id: 'tithe', goal: 'Face Kalamos the Tithe-Taker', label: 'Kalamos',
      story: 'Kalamos counts the tithe on the eastern road, where the carts come round the lake. Above him, a bronze feather turns slowly in the air and falls.',
      where: 'The road on the eastern shore.',
      trigger: { kind: 'clear', at: [440, 255], mob: 'bandit', count: 5, lead: true, name: 'Kalamos the Tithe-Taker' },
    },
    {
      id: 'chest', goal: 'Decide what to do with the tithe', label: 'Tithe',
      story: 'His chest is full of what the town\'s people left behind when they fled. They are not coming back for it. Probably.',
      where: 'Choose on this card.',
      trigger: {
        kind: 'choice', options: [
          { id: 'square', label: 'Leave it in the square', text: 'You set the chest on the temple steps in the empty square. Nikias says no one will come back for it. You leave it anyway, and take only the shield they hung there for the god.', reward: { item: { def: 'votive_shield', rarity: 'rare' } } },
          { id: 'keep', label: 'Keep it', text: 'Coin is coin. The birds on the isle watch you load it.', reward: { goods: { coin: 50, bronze: 10 } } },
        ],
      },
    },
  ],
  end: 'Nikias builds a new ferry and does not look at the isle when he rows past. Kalamos wore a shard of the Wardens\' oath on a cord: "What nests on the isle stays on it." Nothing stayed.',
  reward: { goods: { coin: 40 } },
};

const FORD: Story = {
  id: 'charons-due', region: 'achelous', title: 'Charon\'s Due',
  giver: { name: 'Deinias', title: 'a soldier of the fleeing army', at: [72, 300], cls: 'civ_forager' },
  hook: 'My company still waits on the far bank.',
  backstory: 'We broke at the river, and the bridge broke under us. I came over. My company did not. They are on the island still, waiting for a boat, and the Ferrymen charge the dead to cross, as Charon does. My file-leader will not pay. He never paid for anything.',
  steps: [
    {
      id: 'bridge', goal: 'Read the mark on the bridge', label: 'Bridge',
      story: 'The stumps of the bridge, and the company\'s mark scratched on the last stone: a crooked shield and a number, crossed out, crossed out, crossed out.',
      where: 'The broken bridge on the western channel.',
      trigger: { kind: 'reach', at: [168, 240] }, reward: { goods: { coin: 10 } },
    },
    {
      id: 'obol', goal: 'Pay the ferryman or find a ford', label: 'Ferryman',
      story: 'A boat below the stumps, a hooded man at the pole. An obol a head, he says, as the old ferryman takes.',
      where: 'Choose on this card.',
      trigger: {
        kind: 'choice', options: [
          { id: 'pay', label: 'Pay the obol', text: 'He bites the coin and pushes off. Halfway over, he whistles, and on the island bank men stand up out of the reeds.', next: 'ambush' },
          { id: 'ford', label: 'Find a ford', text: 'The dead do not pay twice. You turn north, along the bank, looking for shallow water.', next: 'fords' },
        ],
      },
    },
    {
      id: 'fords', goal: 'Wade the northern ford', label: 'Ford',
      story: 'Shallow water over gravel, cold as Lethe. On the far side, boot prints that go round and round in the mud.',
      where: 'North along the bank and over the ford, onto the island.',
      trigger: { kind: 'track', marks: [[176, 178], [188, 133], [222, 158]] },
    },
    {
      id: 'ambush', goal: 'Face Porthmeus the Ferryman', label: 'Porthmeus',
      story: 'Porthmeus keeps the company on the island because a company waiting to cross is a company that pays. Each day he names a new price.',
      where: 'The island landing across the western channel.',
      trigger: { kind: 'clear', at: [216, 190], mob: 'bandit', count: 5, lead: true, name: 'Porthmeus the Ferryman' }, reward: { goods: { coin: 25 } },
    },
    {
      id: 'file', goal: 'Free the last of the company', label: 'Philomelos',
      story: 'Of the company, only the file-leader is left, chained to the landing post. The rest paid, one by one, and crossed to wherever the boat goes.',
      where: 'At the landing. Right-click him with your men.',
      trigger: { kind: 'rescue', at: [218, 193], cls: 'hoplite', level: 3, name: 'Philomelos' },
    },
  ],
  end: 'Deinias and Philomelos stand together and look at the river, and do not speak. Among the obols in Porthmeus\' fare-box lay a shard of the Wardens\' oath: "The dead cross free."',
  reward: { goods: { coin: 50 }, item: { def: 'knucklebones', rarity: 'rare' } },
};

const OASIS: Story = {
  id: 'caravan-never-came', region: 'ammos', title: 'The Caravan That Never Came',
  giver: { name: 'Hanno', title: 'master of a lost caravan', at: [212, 250], cls: 'civ_merchant' },
  hook: 'My riders rob every caravan that arrives. Make them stop waiting for me.',
  backstory: 'I sent my riders ahead to the oasis and promised I would follow with the caravan. The caravan died in the dunes, and I with it, and I woke here years after them. They are still waiting for me. They rob every caravan that arrives, in case it is mine, and it never is. Their outrider is my son. He does not know my face.',
  steps: [
    {
      id: 'lookout', goal: 'Climb to the riders\' lookout', label: 'Lookout',
      story: 'A cairn of caravan bells, one from every caravan they have robbed. None is Hanno\'s. Someone polishes them every day.',
      where: 'The lookout on the dunes north-east of the town.',
      trigger: { kind: 'reach', at: [372, 162] }, reward: { goods: { coin: 15 } },
    },
    {
      id: 'battos', goal: 'Bring down Himilko the Outrider', label: 'Himilko',
      story: 'Himilko rides out at every dust cloud. He has his father\'s jaw and none of his patience.',
      where: 'His riders\' camp in the dunes to the north.',
      trigger: { kind: 'clear', at: [330, 88], mob: 'bandit', count: 5, lead: true, name: 'Himilko the Outrider' }, reward: { goods: { coin: 20, salt: 10 } },
    },
    {
      id: 'father', goal: 'Tell Hanno what his son said', label: 'Hanno',
      story: 'Beaten, Himilko only asks: "Has the caravan come?" Hanno should hear that from you.',
      where: 'Back at the oasis.',
      trigger: { kind: 'talk' },
    },
    {
      id: 'word', goal: 'Choose what Himilko is told', label: 'Hanno',
      story: 'Hanno is afraid. If his son learns the caravan is dead, he may follow it. If he does not, he will wait forever.',
      where: 'Choose on this card.',
      trigger: {
        kind: 'choice', options: [
          { id: 'truth', label: 'Tell Himilko the truth', text: 'Himilko looks at the old man a long time. Then he lays his spear down at his father\'s feet, and picks it up again, and asks to ride with you.', reward: { soul: { cls: 'javelineer', level: 3, name: 'Himilko' } } },
          { id: 'wait', label: 'Let him wait', text: 'Himilko goes back to his dunes to wait. His riders leave your carts alone from now on, and pay you to say nothing.', reward: { goods: { coin: 40, silver: 10 } } },
        ],
      },
    },
  ],
  end: 'Hanno sits by the water and watches the dunes, waiting for no one. The cairn of bells was built on a shard of the Wardens\' oath: "No one is left waiting in the sand."',
  reward: { goods: { coin: 40, salt: 10 } },
};

const BACCHAE: Story = {
  id: 'do-not-watch', region: 'bacchae', title: 'Do Not Watch',
  giver: { name: 'Komatas', title: 'a goatherd who looked away', at: [120, 436], cls: 'civ_forager' },
  hook: 'My brother watched the dancers. Bring back what is left of him.',
  backstory: 'The women who died in the god\'s frenzy still dance up in the cypress grove, and they tear apart any man who watches. My brother Lykidas said it was a story. He went up to watch. I heard him singing, and then I heard him stop. Bring back what is left of him. Do not look at the grove.',
  steps: [
    {
      id: 'cloak', goal: 'Follow the shreds of his cloak', label: 'Cloak',
      story: 'Strips of wool on the thorns, pulled apart by hands, not teeth. They lead north toward the grove.',
      where: 'North up the hills, shred by shred.',
      trigger: { kind: 'track', marks: [[142, 380], [112, 302], [122, 222]] },
    },
    {
      id: 'boar', goal: 'Drive off the Ivy Boar', label: 'Ivy Boar',
      story: 'The god\'s beasts clean up after the god\'s women. A boar with ivy grown into his bristles roots where the trail ends.',
      where: 'Below the grove, on the hillside.',
      trigger: { kind: 'clear', at: [182, 168], mob: 'boar', count: 3, lead: true, name: 'the Ivy Boar' }, reward: { goods: { hides: 5, food: 15 } },
    },
    {
      id: 'head', goal: 'Find Lykidas', label: 'Lykidas',
      story: 'In the ivy at the grove\'s edge lies his head, eyes open. It is still singing the god\'s hymn, very softly. Behind you, in the cypresses, someone laughs.',
      where: 'At the edge of the cypress grove. Do not go in.',
      trigger: { kind: 'reach', at: [150, 136] },
    },
    {
      id: 'rite', goal: 'Decide what to do with Lykidas', label: 'Lykidas',
      story: 'The head will not stop singing. Komatas asked for what is left. The grove is watching to see what you do.',
      where: 'Choose on this card.',
      trigger: {
        kind: 'choice', options: [
          { id: 'bury', label: 'Bury him here', text: 'You bury him under the ivy without looking at the grove. The singing stops. The laughing stops too, which is worse.', reward: { item: { def: 'gorgoneion', rarity: 'rare' }, goods: { coin: 20 } } },
          { id: 'carry', label: 'Carry him home', text: 'You wrap the head in your cloak and do not look back. It sings all the way down the hill.', reward: { goods: { coin: 20 } }, next: 'home' },
        ],
      },
    },
    {
      id: 'home', goal: 'Bring Lykidas to his brother', label: 'Komatas',
      story: 'The head is still singing. Komatas is waiting by the well.',
      where: 'Back at the village well.',
      trigger: { kind: 'talk' }, reward: { item: { def: 'knucklebones', rarity: 'rare' } },
    },
  ],
  end: 'Komatas does not go up into the hills again; on still nights the village hears the singing. Lykidas died holding a shard of the Wardens\' oath: "We look outward, never in." He looked in.',
  reward: { goods: { coin: 50 } },
};

const WADI: Story = {
  id: 'wadi-throat', region: 'kyrene-n', title: 'The Throat of the Wadi',
  giver: { name: 'Eurybatos', title: 'water-carrier of the wadi', at: [200, 404], cls: 'civ_forager' },
  hook: 'The lions remember the army that died of thirst. They are hunting its last scout.',
  backstory: 'An army marched into the wadi and lay down in it, man by man, for want of water. The lions ate well that year and they remember. One scout lived long enough to go on north looking for a well. He came back last night, and the lions came with him.',
  steps: [
    {
      id: 'skins', goal: 'Search the slot where the army lay', label: 'Water-skins',
      story: 'Water-skins by the hundred, dry as leaves, where the army lay down. One is fresh-cut and still damp: the scout came back here to drink, and there was nothing to drink.',
      where: 'The gravel slot of the wadi, north-east of the village.',
      trigger: { kind: 'reach', at: [256, 232] }, reward: { goods: { coin: 10 } },
    },
    {
      id: 'arrows', goal: 'Follow the scout\'s arrow marks', label: 'Arrow mark',
      story: 'Arrows scratched into the rock, pointing north, the way scouts mark a road for the army behind them. There has been no army behind him for a hundred years. Pug marks cross every one.',
      where: 'North up the wadi and out into the scrub.',
      trigger: { kind: 'track', marks: [[256, 190], [256, 150], [230, 100]] },
    },
    {
      id: 'pride', goal: 'Break Ochre-Mane\'s pride', label: 'Ochre-Mane',
      story: 'The pride has him treed on a butte. Their old male is red as the cliffs and grey at the jaw, and he was a cub the year the army died.',
      where: 'The scrub under the north-west butte.',
      trigger: { kind: 'clear', at: [180, 60], mob: 'lion', count: 4, lead: true, name: 'Ochre-Mane' }, reward: { goods: { hides: 10, coin: 20 } },
    },
    {
      id: 'scout', goal: 'Bring the scout down', label: 'Agathon',
      story: 'Agathon has been on that rock two days with three arrows left. He will not come down until he sees spears, and then he will not stop talking about the well.',
      where: 'On the butte where the pride held him. Right-click him with your men.',
      trigger: { kind: 'rescue', at: [183, 63], cls: 'archer', level: 2, name: 'Agathon' },
    },
    {
      id: 'well', goal: 'Decide what becomes of the scout\'s map', label: 'Map',
      story: 'He found the well. His map shows water under the north scrub, marked for a general a hundred years dead. The army in the wadi is still waiting for it.',
      where: 'Choose on this card.',
      trigger: {
        kind: 'choice', options: [
          { id: 'army', label: 'Read it to the army', text: 'You read the map aloud in the slot, to the dry skins and the bones. The wind in the wadi drops. Eurybatos says the throat has never been so quiet.', reward: { goods: { coin: 30, food: 30 } } },
          { id: 'keep', label: 'Keep the map', text: 'Water is worth more than gold out here, and you know where it is. Agathon\'s thumb ring comes with the map; he will not need it to draw a bow for a general now.', reward: { item: { def: 'thumb_ring', rarity: 'rare' }, goods: { copper: 15 } } },
        ],
      },
    },
  ],
  end: 'Eurybatos pours a skin out in the wadi, as every morning; today he smiles. Agathon\'s map was weighted with a shard of the Wardens\' oath: "No army thirsts behind us." One did.',
  reward: { goods: { coin: 50, copper: 10 } },
};

const FLOOD: Story = {
  id: 'after-flood', region: 'kyrene-w', title: 'After the Flood',
  giver: { name: 'Amasis', title: 'reed-farmer of the floodplain', at: [300, 416], cls: 'civ_forager' },
  hook: 'The flood brought a serpent fat on the drowned. It nests in my channel.',
  backstory: 'Every flood the serpents come up the channels from the Great River, and every flood they go back. Not this one. It came up the middle channel fat on the drowned and did not go back, and now it eats what the flood left: my goats, my neighbour\'s dog, my neighbour. Kill it before the water falls and it comes looking for more.',
  steps: [
    {
      id: 'field', goal: 'Look at the flattened flax', label: 'Flax',
      story: 'A furrow through the flax as wide as a cart, the stalks laid flat and slick. At the end of it, a sandal, and nothing else of the man who wore it.',
      where: 'The flax fields north-west of the village.',
      trigger: { kind: 'reach', at: [236, 320] }, reward: { goods: { flax: 10 } },
    },
    {
      id: 'skins', goal: 'Follow its shed skins up the channel', label: 'Shed skin',
      story: 'It has grown so fast it sheds as it goes. Each skin is longer than the last, papery and cold, caught on the reeds of the middle channel.',
      where: 'North up the middle channel, skin by skin.',
      trigger: { kind: 'track', marks: [[250, 280], [250, 230], [252, 180]] },
    },
    {
      id: 'nest', goal: 'Kill the Flood-Fed', label: 'Flood-Fed',
      story: 'It lies coiled in a drowned reed bed, thick as a man, two of its brood beside it. Its belly is still round with the flood\'s dead.',
      where: 'Its nest where the channel splits in the north reeds.',
      trigger: { kind: 'clear', at: [255, 130], mob: 'serpent', count: 3, lead: true, name: 'the Flood-Fed' }, reward: { goods: { hides: 10, coin: 20 } },
    },
    {
      id: 'home', goal: 'Bring Amasis what the nest held', label: 'Amasis',
      story: 'In the nest, among the shed skins: rings, bracelets, a child\'s clay horse. What the drowned wore. Amasis will know whose they are.',
      where: 'Back at the farm village.',
      trigger: { kind: 'talk' }, reward: { item: { def: 'serpent_ring', rarity: 'rare' } },
    },
  ],
  end: 'Amasis lays the rings out, and the village comes to find its own. One ring nobody claims: its stone is a shard of the Wardens\' oath, "When the water rises, we stand in it." He gives it to you.',
  reward: { goods: { coin: 40, food: 30 } },
};

const FENS: Story = {
  id: 'reed-bones', region: 'elaia-n', title: 'Bones in the Reeds',
  giver: { name: 'Phaenna', title: 'the last fenwoman', at: [250, 328], cls: 'civ_forager' },
  hook: 'My people are bones in the reeds. The serpents will not let me bury them.',
  backstory: 'When the bronze birds came to the lake, the farmers went up the wall to the fields and the fenfolk stayed in the reeds. We always had. Now they are bones out there and I am the last who knows the way to the burial isle. The serpents lie on the old path, and they are fat on my people.',
  steps: [
    {
      id: 'poles', goal: 'Find the old burial path', label: 'Pole',
      story: 'Grey poles stand in the marsh, one every hundred paces, each with a rag of colour tied to it. The fenfolk carried their dead out this way, pole to pole, in the old days.',
      where: 'Down the wall and north into the reeds, pole by pole.',
      trigger: { kind: 'track', marks: [[228, 256], [220, 232], [236, 205]] },
    },
    {
      id: 'coil', goal: 'Drive the Grave-Coil off the path', label: 'Grave-Coil',
      story: 'Where the path turns east to the isle, the reeds are flattened in a ring. Something old and very long lies in it, with two younger ones, and the bones round them are not all fish.',
      where: 'The reed bed east of the landfall, on the way to the isle.',
      trigger: { kind: 'clear', at: [300, 240], mob: 'serpent', count: 3, lead: true, name: 'the Grave-Coil' }, reward: { goods: { hides: 10, coin: 15 } },
    },
    {
      id: 'isle', goal: 'Reach the burial isle', label: 'Isle',
      story: 'The low isle is white with bones, the fenfolk\'s and their dogs\', dragged here by the serpents to lie on in the sun. Phaenna\'s mother wore a gold bulla; it is here, in the grass.',
      where: 'The eastern isle off the landfall.',
      trigger: { kind: 'reach', at: [322, 210] }, reward: { goods: { herbs: 10 } },
    },
    {
      id: 'rite', goal: 'Choose how they are laid to rest', label: 'Bones',
      story: 'The fenfolk gave their dead to the lake. The farmers on the wall would raise a mound. The bones do not care. Phaenna will.',
      where: 'Choose on this card.',
      trigger: {
        kind: 'choice', options: [
          { id: 'lake', label: 'Give them to the lake', text: 'You sink them in the deep water off the isle, as the fenfolk did, with stones on their chests. The lake closes over them without a sound. Phaenna nods: that is how it is done.', reward: { goods: { coin: 25, food: 20, herbs: 10 } } },
          { id: 'mound', label: 'Raise a mound', text: 'You heap the bones on the isle and raise turf over them, where nothing can drag them off again. Phaenna says it is a farmer\'s grave. She keeps the bulla on its string and gives you her father\'s instead.', reward: { item: { def: 'bulla', rarity: 'rare' }, goods: { coin: 15 } } },
        ],
      },
    },
  ],
  end: 'Phaenna walks the pole path alone, tying fresh rags to each pole. The last pole stands in a shard of the Wardens\' oath: "The dead lie as their own would lay them." Now they do.',
  reward: { goods: { coin: 50 } },
};

const KIMMERIANS: Story = {
  id: 'kimmerian-gold', region: 'kimmeria', title: 'Gold of the Kimmerians',
  giver: { name: 'Teushpa', title: 'a Kimmerian shade', at: [410, 228], cls: 'civ_physician' },
  hook: 'The griffin keeps our gold in the broken gate. We would pay you with it.',
  backstory: 'The mist took my people whole, all but our gold, and the griffin sits on that in the broken gate. It drops what it does not eat on the downs, and the one-eyed thieves from the north pick the bones for our gold. They do it in our name. Stop them, and I will show you what the griffin keeps.',
  steps: [
    {
      id: 'kill', goal: 'Look at the griffin\'s leavings', label: 'Bones',
      story: 'A horse, picked clean and dropped from a height, its ribs driven into the turf. Gold leaf from a Kimmerian bridle is caught in them, and boot prints have been at it already.',
      where: 'The open downs north-west of the village, under the fort hill.',
      trigger: { kind: 'reach', at: [330, 140] }, reward: { goods: { coin: 10 } },
    },
    {
      id: 'wolves', goal: 'Drive off the griffin\'s wolves', label: 'Wolves',
      story: 'Where the griffin hunts, the wolves eat after it, and they have grown bold on its leavings. A pack is tearing at a fresh kill further down the slope, and they do not mean to share it.',
      where: 'Down the slope toward the fort hill\'s foot.',
      trigger: { kind: 'clear', at: [345, 180], mob: 'wolf', count: 6 }, reward: { goods: { hides: 10 } },
    },
    {
      id: 'arimaspos', goal: 'Face Arimaspos One-Eye', label: 'Arimaspos',
      story: 'Arimaspos says his people have robbed griffins since the world above was young, and that a man with one eye aims better. His camp sits at the fort hill\'s foot, as close to the gate as he dares.',
      where: 'His camp at the east foot of the fort hill.',
      trigger: { kind: 'clear', at: [330, 256], mob: 'bandit', count: 5, lead: true, name: 'Arimaspos One-Eye' }, reward: { goods: { coin: 25, bronze: 5 } },
    },
    {
      id: 'stag', goal: 'Decide the gold stag\'s fate', label: 'Gold stag',
      story: 'In his packs, the best of what he picked from the griffin\'s kills: a gold stag plaque, its legs folded under it, the Kimmerian kind. Teushpa promised you gold. This is gold.',
      where: 'Choose on this card.',
      trigger: {
        kind: 'choice', options: [
          { id: 'return', label: 'Give it to Teushpa', text: 'The shade takes the stag in both hands. "One of us," he says, and a rider of his people wakes on the downs to ride with you. "The rest are under the griffin."', reward: { soul: { cls: 'archer', level: 3, name: 'a Kimmerian rider' }, goods: { coin: 20 } } },
          { id: 'keep', label: 'Keep it', text: 'Teushpa watches you put it away and says nothing. A shade cannot stop you. The griffin can, and it has more.', reward: { item: { def: 'gold_stag', rarity: 'rare' } } },
        ],
      },
    },
  ],
  end: 'Teushpa looks up at the broken gate. Under the Griffin, with the gold, lies his people\'s share, a shard of the Wardens\' oath: "The mist takes no people whole." "It lied," he says. "When you are ready."',
  reward: { goods: { coin: 50, bronze: 10 } },
};

const SAVANNA: Story = {
  id: 'unskinned-lion', region: 'savanna', title: 'The Unskinned Lion',
  giver: { name: 'Pyrrhias', title: 'shield-bearer of the last hero', at: [318, 388], cls: 'civ_engineer' },
  hook: 'Every Kyrenean hero who went to skin the lion lies here. Mine was the last.',
  backstory: 'Every hero of Kyrene who wanted a lion-skin cloak came here, to the one lion whose hide turns blades. They all lie on the savanna. My master Alkimos went last. I carried his shield as far as the waterhole and he told me to wait. I have been waiting a long time.',
  steps: [
    {
      id: 'waterhole', goal: 'Search the waterhole', label: 'Shield',
      story: 'Alkimos\'s shield lies face-down in the mud, scored to the bronze. His sword lies beside it in two pieces. It broke on the Lion\'s hide, and then the pride came for what was left.',
      where: 'The muddy waterhole by the wash, west of the village.',
      trigger: { kind: 'reach', at: [276, 352] }, reward: { goods: { coin: 10 } },
    },
    {
      id: 'pride', goal: 'Break Aithousa\'s pride', label: 'Aithousa',
      story: 'The Lion hunts alone. His mate does not. Aithousa leads four lionesses up the wash, and they drag the heroes the Lion leaves to their lie-up in the high grass.',
      where: 'Up the dry wash to the north, in the high grass.',
      trigger: { kind: 'clear', at: [330, 110], mob: 'lion', count: 4, lead: true, name: 'Aithousa the Lioness' }, reward: { goods: { hides: 10, coin: 20 } },
    },
    {
      id: 'alkimos', goal: 'Wake Alkimos', label: 'Alkimos',
      story: 'He lies among the bones of older heroes, his hilt still in his fist. He is dead, as everyone here is dead, and he wants to know if he got the skin.',
      where: 'In the pride\'s lie-up. Right-click him with your men.',
      trigger: { kind: 'rescue', at: [333, 113], cls: 'hoplite', level: 3, name: 'Alkimos' },
    },
    {
      id: 'hide', goal: 'Tell Alkimos how to skin the Lion', label: 'Alkimos',
      story: 'Alkimos wants to go back up the great kopje tonight, alone, with a borrowed sword. Pyrrhias has the old story: Herakles cut the hide with the beast\'s own claws.',
      where: 'Choose on this card.',
      trigger: {
        kind: 'choice', options: [
          { id: 'hold', label: 'Hold him back', text: 'You tell him a hero who goes alone lies in the grass with the others. He laughs for the first time in a hundred years and ties a Herakles knot in his belt. He will go with your men, or not at all.', reward: { item: { def: 'herakles_knot', rarity: 'rare' }, goods: { coin: 20 } } },
          { id: 'claws', label: 'Tell him of the claws', text: 'You take a claw from Aithousa\'s paw and give it to him. "Not hers," he says, giving it back. "His." He keeps the story and you keep the claw.', reward: { item: { def: 'lion_claw', rarity: 'rare' } } },
        ],
      },
    },
  ],
  end: 'Pyrrhias hangs the scored shield over the gate. Under the great kopje the Lion sleeps on a shard of the Wardens\' oath: "We are the hide between the dead and the dark." His hide turns blades. His own claws do not.',
  reward: { goods: { coin: 50, copper: 10 } },
};

/** The region stories, by region id: every depth 1-2 neutral region has one (tests/war/stories.test.ts). */
export const STORIES: Readonly<Record<string, Story>> = Object.fromEntries([TEETH, SLOPES, HEATH, LAGOON, CAPE, MOORS, FJORDS, OAKWOOD, STEPPE, CHALK, KURGANS, DUNES, COVES, VINEYARDS, PASS, LAKE, FORD, OASIS, BACCHAE, WADI, FLOOD, FENS, KIMMERIANS, SAVANNA].map((s) => [s.region, s]));
export const storyOf = (region: string): Story | null => STORIES[region] ?? null;

// ---------------------------------------------------------------- world-fill: hidden quests

/**
 * world-fill hidden quests: 2-3 in every region past the homes, at spots the region kit's fill pass leaves in the
 * region JSON (`RegionData.secrets`: a spot, its template and where the next step lies). No giver and no "!": a
 * player's men walk onto the spot (a dead man with a note, a cairn, a shrine, a ruin) and the chain begins with a short
 * notice (src/war/sim/secrets.ts runs them on the story runner, per player). Each is 1-3 steps and ends in loot or a
 * fight with a named chief (src/data/warBosses.ts WAR_CHIEFS). Pays scale with depth and stay modest (the region story
 * is the big earner).
 */
export interface HiddenCtx {
  /** The spot and the next step's place, tiles. */
  at: Pt; then: Pt;
  /** The region's fighting beast (its lairs' first non-bandit, non-passive kind; wolves if none) and a chief of it not leading a lair here. */
  beast: MobKind; chief: string | null;
  depth: number;
}
export interface HiddenTemplate {
  id: string;
  /** What the men find (the notice's first words). */
  find: string;
  make(c: HiddenCtx): Pick<Story, 'title' | 'hook' | 'backstory' | 'steps' | 'end' | 'reward'>;
}

const pay = (c: HiddenCtx, coin: number) => Math.round(coin * (1 + 0.5 * c.depth));

export const HIDDEN: readonly HiddenTemplate[] = [
  {
    id: 'corpse', find: 'A dead man with a note',
    make: (c) => ({
      title: 'The Dead Man\'s Note', hook: 'A traveller lies in the grass, a wax tablet in his fist.',
      backstory: '"They came out of the brush at dusk. If you read this, they are still near. Take what I carried, and pay them back for me."',
      steps: [{
        id: 'killers', goal: 'Hunt down what killed him', label: 'Killers', story: 'Tracks lead off from the body, fresh.', where: 'Close by, where the tracks lead.',
        trigger: { kind: 'clear', at: c.then, mob: c.beast, count: 3 + Math.min(3, c.depth) },
      }],
      end: 'You bury him under a cairn. His purse was not empty.',
      reward: { goods: { coin: pay(c, 14), hides: 4 } },
    }),
  },
  {
    id: 'cache', find: 'A cairn marked with a hidden sign',
    make: (c) => ({
      title: 'The Smuggler\'s Cache', hook: 'A cairn with a mark scratched under the top stone.',
      backstory: 'Smugglers of the old roads marked their caches this way: a cairn, and the goods a short walk off.',
      steps: [{
        id: 'dig', goal: 'Dig up the cache', label: 'Cache', story: 'Loose stones, and under them a sealed jar.', where: 'A short walk from the cairn.',
        trigger: { kind: 'reach', at: c.then }, reward: { goods: { coin: pay(c, 10), iron: 4 + c.depth, salt: 3 } },
      }],
      end: 'The jar is yours. Whoever buried it will not be back.',
    }),
  },
  {
    id: 'shrine', find: 'A forgotten shrine',
    make: (c) => ({
      title: 'The Forgotten Shrine', hook: 'Moss over an altar; old offerings, gnawed bones around it.',
      backstory: 'Someone made offerings here once. Something big has been feeding on them since, and it sleeps close by.',
      steps: c.chief ? [{
        id: 'beast', goal: 'Slay the beast that haunts the shrine', label: 'Beast', story: 'It lifts its head from the bones. It is larger than it should be.', where: 'Its lair by the shrine.',
        trigger: { kind: 'clear', at: c.then, mob: c.beast, count: 1, chief: c.chief, name: warChief(c.chief)?.name ?? 'the beast' }, reward: { item: { def: 'eye_bead', rarity: 'rare' } },
      }] : [{
        id: 'beast', goal: 'Drive off the beasts at the shrine', label: 'Beasts', story: 'They feed on the offerings, and will not share.', where: 'By the shrine.',
        trigger: { kind: 'clear', at: c.then, mob: c.beast, count: 4 },
      }],
      end: 'The altar is clean again. A little warmth stays in the stone.',
      reward: { goods: { coin: pay(c, 16) } },
    }),
  },
  {
    id: 'ruin', find: 'A ruined watch-post',
    make: (c) => ({
      title: 'The Ruined Watch-Post', hook: 'A tumbled tower; a fresh fire-pit inside.',
      backstory: 'The post fell long ago, but someone sleeps here now: deserters, by the boot prints, with a strongbox.',
      steps: [
        { id: 'look', goal: 'Search the ruin', label: 'Ruin', story: 'Boot prints, a tally scratched on the wall, and voices beyond it.', where: 'Inside the ruin, a few steps on.', trigger: { kind: 'reach', at: c.then } },
        { id: 'camp', goal: 'Break the deserters', label: 'Deserters', story: 'They grab their spears. Their leader keeps the strongbox.', where: 'In the ruin.', trigger: { kind: 'clear', at: c.then, mob: 'bandit', count: 3 + Math.min(3, c.depth), lead: true } },
      ],
      end: 'The strongbox holds a season\'s tolls.',
      reward: { goods: { coin: pay(c, 18), bronze: 3 } },
    }),
  },
];
const HIDDEN_BY_ID = new Map(HIDDEN.map((h) => [h.id, h]));

/** The hidden quests of a region from its `secrets` (the same on the server, the page and in tests). */
export function hiddenStories(r: RegionData): Story[] {
  const lairs = r.lairs ?? [];
  const beast = lairs.find((l) => l.kind !== 'bandit' && l.kind !== 'ibex')?.kind ?? 'wolf';
  const used = new Set(lairs.flatMap((l) => (l.chief ? [l.chief] : [])));
  const depth = depthOf(r);
  return (r.secrets ?? []).flatMap((s, n): Story[] => {
    const t = HIDDEN_BY_ID.get(s.quest);
    if (!t) return [];
    const pool = chiefsOfKind(beast).filter((c) => !used.has(c.id));
    const chief = pool.length ? pool[n % pool.length].id : null;
    const m = t.make({ at: [s.x, s.y], then: s.then, beast, chief, depth });
    return [{ id: `hidden:${r.id}:${n}`, region: r.id, hidden: true, giver: { name: t.find, title: '', at: [s.x, s.y], cls: '' }, ...m }];
  });
}

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
