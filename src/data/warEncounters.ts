/**
 * W-65 random encounters (the runner: src/war/sim/encounters.ts): short happenings on the road while a player's men
 * travel a neutral region. Each kind: 1-2 lines of lore, 1-3 steps, a small reward (coin, goods, now and then an
 * item or a soul). Steps use the runner's triggers: reach (here, the nearest town or lair, the story's giver), clear (foes
 * spawned at the spot; `fauna`: one of the region's hunters; +1 man per two depths), choice (buttons; a risk may turn a
 * search into a fight), guide (reach him, then the nearest town), track (follow rolled marks; the trail's end is the
 * next step's spot), rescue (a captive's soul to claim). `biomes` / `beasts` keep a kind to the regions that fit it.
 *
 * A new kind: copy one, give it an id, a weight and Greek-flavoured lore, and keep its pay small.
 */
import type { EncounterDef } from '../war/sim/encounters';

const LIST: EncounterDef[] = [
  {
    id: 'ambush', title: 'Ambush!', weight: 3, near: [6, 8],
    lore: 'The reeds part and bronze glints. Deserters of the old muster spring from cover, hungry for your packs.',
    end: 'They fled or fell. Their purses were lighter than their boasts.',
    steps: [
      { id: 'fight', goal: 'Beat off the ambush', label: 'Ambush', text: 'They are on you. Close ranks.', trigger: { kind: 'clear', mob: 'bandit', count: 3 }, reward: { goods: { coin: 8, food: 10 } } },
    ],
  },
  {
    id: 'deserter', title: 'A Wounded Deserter', weight: 2,
    figure: { cls: 'hoplite', count: 1, name: 'Deserter' },
    lore: 'A hoplite lies by the road, an arrow in his thigh. ‘By Zeus Xenios, friend: water, and I am yours.’',
    end: 'The road takes him one way or another.',
    steps: [
      { id: 'go', goal: 'Go to the wounded man', label: 'Deserter', text: 'He waves a torn cloak at your men.', trigger: { kind: 'reach' } },
      {
        id: 'judge', goal: 'Decide his fate', label: 'Deserter', text: 'He ran from the muster. He will not run again, he swears.', trigger: { kind: 'choice', options: [
          { id: 'help', label: 'Bind his wound', text: 'He will follow your standard. Claim his soul when a place is free.', reward: { soul: { cls: 'hoplite', level: 2, name: 'Damon' } } },
          { id: 'strip', label: 'Take his gear', text: 'A good spear is wasted on a man who ran.', reward: { item: { def: 'dory', rarity: 'common' }, goods: { coin: 3 } } },
          { id: 'leave', label: 'Leave him', text: 'The crows will judge him.' },
        ] },
      },
    ],
  },
  {
    id: 'shrine', title: 'The Wayside Herm', weight: 2,
    figure: { cls: 'civ_physician', count: 1, name: 'Herm-keeper' },
    lore: 'A herm of Hermes at the crossroads, heaped with old offerings. The god of thieves is always watching.',
    end: 'The herm stares on, smiling its stone smile.',
    steps: [
      { id: 'go', goal: 'Look at the shrine', label: 'Herm', text: 'Copper coins green with age, a cup of soured wine.', trigger: { kind: 'reach' } },
      {
        id: 'search', goal: 'Search the offerings?', label: 'Herm', text: 'Hermes loves a bold thief, the soldiers say. Sometimes.', trigger: { kind: 'choice', options: [
          { id: 'take', label: 'Take the offerings', text: 'Old coin, and maybe the god\'s wrath.', reward: { goods: { coin: 12 } }, risk: { chance: 0.35, text: 'Robbers who use the herm as a lure step from the olives.', next: 'keepers' } },
          { id: 'offer', label: 'Leave an offering', text: 'A crust and a prayer. Herbs grow thick round a happy herm.', reward: { goods: { herbs: 6 } } },
          { id: 'pass', label: 'Pass by', text: 'Not today, trickster.' },
        ] },
      },
      { id: 'keepers', goal: 'Drive off the robbers', label: 'Robbers', text: 'The god of thieves laughs last.', trigger: { kind: 'clear', mob: 'bandit', count: 3 }, reward: { goods: { coin: 10 } }, next: 'end' },
    ],
  },
  {
    id: 'cache', title: 'A Buried Cache', weight: 2,
    lore: 'Fresh earth under a split olive, a shepherd\'s mark cut in its bark: something was hidden here in haste.',
    end: 'The hole is filled again. The olive keeps its secret.',
    steps: [
      { id: 'go', goal: 'Find the marked olive', label: 'Cache', text: 'A cross cut deep, still weeping sap.', trigger: { kind: 'reach' } },
      {
        id: 'dig', goal: 'Dig up the cache?', label: 'Cache', text: 'Something dug here before you. Something with claws.', trigger: { kind: 'choice', options: [
          { id: 'dig', label: 'Dig', text: 'Iron bars wrapped in a hide, and a pouch of coin.', reward: { goods: { iron: 8, coin: 6 } }, risk: { chance: 0.3, text: 'Beasts were nosing the same earth, and they want it back.', next: 'beasts' } },
          { id: 'leave', label: 'Leave it', text: 'Let the shepherd keep his own.' },
        ] },
      },
      { id: 'beasts', goal: 'Drive off the beasts', label: 'Beasts', text: 'Then dig in peace.', trigger: { kind: 'clear', mob: 'fauna', count: 2 }, reward: { goods: { iron: 8, coin: 6 } }, next: 'end' },
    ],
  },
  {
    id: 'merchant', title: 'A Lost Merchant', weight: 2, needs: 'town',
    figure: { cls: 'civ_merchant', count: 1, name: 'Merchant' },
    lore: 'A Phoenician trader with a laden mule has lost the road. ‘Lead me to a town, friend, and my purse opens.’',
    end: 'He counts out your coin twice, the Phoenician way, and haggles for nothing.',
    steps: [
      { id: 'guide', goal: 'Guide the merchant to a town', label: 'Merchant', text: 'Reach him, then walk him to the nearest town. He follows your men.', trigger: { kind: 'guide' }, reward: { goods: { coin: 15, salt: 6 } } },
    ],
  },
  {
    id: 'beset', title: 'Travellers Beset', weight: 2,
    figure: { cls: 'civ_forager', count: 3, name: 'Pilgrims' },
    lore: 'Screams on the road: pilgrims back to back with their staves, a pack of beasts circling. Save them and they pay what they can.',
    end: 'They kiss your men\'s hands and go on to the god, a little poorer.',
    steps: [
      { id: 'save', goal: 'Save the travellers', label: 'Beasts', text: 'Kill the beasts before they drag one off.', trigger: { kind: 'clear', mob: 'fauna', count: 3 }, reward: { goods: { coin: 10, food: 8 } } },
    ],
  },
  {
    id: 'eagles', title: 'Eagles of Zeus', weight: 1, needs: 'lair',
    lore: 'Two eagles wheel over the hills ahead. The old men say: where Zeus\'s eagles circle, beasts or bandits den.',
    end: 'The omen was true. The gods remember the ones who heed them.',
    steps: [
      { id: 'follow', goal: 'Follow the eagles', label: 'Omen', text: 'They circle over a den the region has not yet seen cleared.', trigger: { kind: 'reach', at: 'lair' }, reward: { goods: { coin: 6 } } },
    ],
  },
  {
    id: 'rumour', title: 'A Shepherd\'s Rumour', weight: 1, needs: 'story',
    figure: { cls: 'civ_forager', count: 1, name: 'Shepherd' },
    lore: 'A shepherd spits and points: ‘Trouble in the village. The old one by the well has a tale, and pay for whoever ends it.’',
    end: 'The village well. Someone there has waited a long time.',
    steps: [
      { id: 'go', goal: 'Find the one by the well', label: 'Rumour', text: 'Seek the villager with the ‘!’ over his head.', trigger: { kind: 'reach', at: 'giver' }, reward: { goods: { coin: 5 } } },
    ],
  },
  {
    id: 'toll', title: 'Toll of the Road', weight: 1, minDepth: 2, near: [8, 11],
    lore: 'Bandits bar the path with an overturned cart. ‘A toll for Hermes,’ grins their chief. Pay it in blood, or go round.',
    end: 'The road is open, for a while.',
    steps: [
      {
        id: 'answer', goal: 'Answer the toll-takers', label: 'Toll', text: 'They count your spears and hope you can not count theirs.', trigger: { kind: 'choice', options: [
          { id: 'fight', label: 'Break the toll', text: 'Their chief\'s purse is fat with other men\'s coin.', next: 'fight' },
          { id: 'round', label: 'Go round', text: 'A longer road, a whole skin.' },
        ] },
      },
      { id: 'fight', goal: 'Break the toll-takers', label: 'Toll', text: 'Overturn their cart on them.', trigger: { kind: 'clear', mob: 'bandit', count: 4 }, reward: { goods: { coin: 14 }, item: { def: 'pilos', rarity: 'uncommon' } } },
    ],
  },
  {
    id: 'barrow', title: 'A Hero\'s Barrow', weight: 1,
    lore: 'A cairn of the first war, a bronze helm on top gone green. The dead of the old wars do not love thieves.',
    end: 'The barrow is quiet again.',
    steps: [
      { id: 'go', goal: 'Climb to the barrow', label: 'Barrow', text: 'Names cut in the stones, worn to whispers.', trigger: { kind: 'reach' } },
      {
        id: 'rite', goal: 'Honour the dead, or rob them?', label: 'Barrow', text: 'A libation, or the helm.', trigger: { kind: 'choice', options: [
          { id: 'honour', label: 'Pour a libation', text: 'A shade rises from the stones to march with you. Claim his soul when a place is free.', reward: { soul: { cls: 'militia', level: 2, name: 'Old Arkas' } } },
          { id: 'rob', label: 'Take the helm', text: 'Bronze is bronze.', reward: { item: { def: 'montefortino', rarity: 'common' } }, risk: { chance: 0.4, text: 'Grave-robbers were here first and do not share.', next: 'robbers' } },
          { id: 'leave', label: 'Leave them be', text: 'Sleep, old ones.' },
        ] },
      },
      { id: 'robbers', goal: 'Drive off the grave-robbers', label: 'Robbers', text: 'Then the helm is yours by right of spear.', trigger: { kind: 'clear', mob: 'bandit', count: 3 }, reward: { item: { def: 'montefortino', rarity: 'common' } }, next: 'end' },
    ],
  },
  {
    id: 'flock', title: 'A Strayed Flock', weight: 1,
    figure: { cls: 'civ_forager', count: 1, name: 'Goatherd' },
    lore: 'A goatherd boy weeps over his flock scattered in the scrub. ‘Pan drove them mad. Help me, and take one for your pot.’',
    end: 'Pan\'s panic passes. The boy whistles his goats home.',
    steps: [
      { id: 'herd', goal: 'Help round up the goats', label: 'Goats', text: 'They bleat from the scrub ahead.', trigger: { kind: 'reach' } },
      { id: 'back', goal: 'Bring the last goat in', label: 'Goats', text: 'One more, up on the rocks.', trigger: { kind: 'reach', off: 9 }, reward: { goods: { food: 15 } } },
    ],
  },
  {
    id: 'lionfold', title: 'The Lion at the Fold', weight: 2, beasts: ['lion'],
    figure: { cls: 'civ_forager', count: 1, name: 'Shepherd' },
    lore: 'A shepherd crouches by a torn ewe, sling shaking. ‘The tawny one comes back every dusk. I have no more sheep to give it.’',
    end: 'The fold sleeps. Somewhere a lion does not.',
    steps: [
      { id: 'go', goal: 'Reach the shepherd', label: 'Shepherd', text: 'Fresh pug-marks circle the thorn fence.', trigger: { kind: 'reach' } },
      { id: 'hunt', goal: 'Kill the lion', label: 'Lion', text: 'It breaks from the long grass. Shields up before the pounce.', trigger: { kind: 'clear', mob: 'lion', count: 1 }, reward: { goods: { food: 12, hides: 4 }, item: { def: 'lion_claw', rarity: 'common' } } },
    ],
  },
  {
    id: 'ford', title: 'The Serpent of the Ford', weight: 2, beasts: ['serpent'],
    lore: 'Bones in the shallows and a drag-mark wide as a cart. Ferrymen say the river keeps a warden, and the warden keeps the ford.',
    end: 'The water runs clear over the ford again.',
    steps: [
      {
        id: 'ford', goal: 'Cross the ford, or go round?', label: 'Ford', text: 'Something huge shifts under the brown water.', trigger: { kind: 'choice', options: [
          { id: 'fight', label: 'Draw it out', text: 'Spears in the shallows. Mind the venom.', next: 'warden' },
          { id: 'offer', label: 'Pour wine to the river', text: 'The water stills. On the far bank, a drowned man\'s purse.', reward: { goods: { coin: 5 } } },
          { id: 'round', label: 'Go round', text: 'A day lost, every man whole.' },
        ] },
      },
      { id: 'warden', goal: 'Kill the river serpent', label: 'Serpent', text: 'It rises hissing from the reeds.', trigger: { kind: 'clear', mob: 'serpent', count: 1 }, reward: { goods: { coin: 10, herbs: 4 }, item: { def: 'serpent_ring', rarity: 'common' } } },
    ],
  },
  {
    id: 'slavers', title: 'The Slavers\' Camp', weight: 2,
    lore: 'Smoke, a whip-crack, a chain of men led off the road. Slavers sell the dead twice here: once to the mines, once to the gods below.',
    end: 'The chains lie empty in the ash.',
    steps: [
      { id: 'camp', goal: 'Break the slavers\' camp', label: 'Slavers', text: 'They drop their whips for spears.', trigger: { kind: 'clear', mob: 'bandit', count: 3 }, reward: { goods: { coin: 8 } } },
      { id: 'free', goal: 'Free the bound captive', label: 'Captive', text: 'One captive is left, roped to the stake.', trigger: { kind: 'rescue', cls: 'peltast', level: 2, name: 'Lykos' } },
    ],
  },
  {
    id: 'herd', title: 'Tracks of a Stolen Herd', weight: 2,
    figure: { cls: 'civ_forager', count: 1, name: 'Herdsman' },
    lore: 'A herdsman holds a cut halter. ‘Rustlers took my cattle at dawn. Follow the tracks, bring them back, and share the beef.’',
    end: 'The cattle low their way home.',
    steps: [
      { id: 'trail', goal: 'Follow the herd\'s tracks', label: 'Tracks', text: 'Hoof-prints and fresh dung, heading for the hills.', trigger: { kind: 'track', marks: 3 } },
      { id: 'rustlers', goal: 'Take back the herd', label: 'Rustlers', text: 'The rustlers have stopped to drink.', trigger: { kind: 'clear', mob: 'bandit', count: 3 }, reward: { goods: { food: 18, hides: 4, coin: 5 } } },
    ],
  },
  {
    id: 'shade', title: 'The Unburied Shade', weight: 2,
    figure: { cls: 'hoplite', count: 1, name: 'Shade', shade: true },
    lore: 'A hoplite by the road, grey as ash, his wound still open. ‘I fell here and no one sang for me. Give me the rites, or I cannot go on.’',
    end: 'Even here, between the worlds, the dead must be honoured.',
    steps: [
      { id: 'go', goal: 'Go to the grey soldier', label: 'Shade', text: 'His bones lie in the ditch behind him, picked clean.', trigger: { kind: 'reach' } },
      {
        id: 'rites', goal: 'Grant him the rites?', label: 'Shade', text: 'An obol for the ferryman, a handful of earth, a song.', trigger: { kind: 'choice', options: [
          { id: 'bury', label: 'Bury him with the rites', text: 'He lays his shield at your feet and walks into the light.', reward: { item: { def: 'votive_shield', rarity: 'common' }, goods: { herbs: 3 } } },
          { id: 'enlist', label: 'Ask him to march with you', text: 'He bows. Unsung, he will fight on. Claim his soul when a place is free.', reward: { soul: { cls: 'hoplite', level: 2, name: 'Grey Menon' } } },
          { id: 'rob', label: 'Take the obol yourself', text: 'Coin is coin, even a dead man\'s.', reward: { goods: { coin: 4 } }, risk: { chance: 0.5, text: 'Carrion-eaters were at his bones, and they want the rest.', next: 'carrion' } },
        ] },
      },
      { id: 'carrion', goal: 'Drive off the carrion-eaters', label: 'Beasts', text: 'The shade watches, and does not help.', trigger: { kind: 'clear', mob: 'fauna', count: 2 }, reward: { goods: { coin: 4 } }, next: 'end' },
    ],
  },
  {
    id: 'well', title: 'The Poisoned Well', weight: 1, biomes: ['elaia', 'dodona', 'kyrene'],
    figure: { cls: 'civ_physician', count: 1, name: 'Village elder' },
    lore: 'A hamlet of the dead-and-waiting retches by its well. ‘Someone fouled it in the night. Apollo\'s arrows, or a man\'s hand?’',
    end: 'Clean water at last. The hamlet will remember who brought it.',
    steps: [
      {
        id: 'judge', goal: 'Help the sick hamlet?', label: 'Well', text: 'A dead dog in the water, and boot-marks leading off.', trigger: { kind: 'choice', options: [
          { id: 'seal', label: 'Seal the well, share your water', text: 'They bless your men with bread and bitter herbs.', reward: { goods: { food: 8, herbs: 5 } } },
          { id: 'hunt', label: 'Hunt the poisoner', text: 'Boot-marks and a spilled sack of hemlock.', next: 'trail' },
          { id: 'leave', label: 'Leave them to the god', text: 'Plague is no enemy a spear can kill.' },
        ] },
      },
      { id: 'trail', goal: 'Follow the poisoner\'s trail', label: 'Trail', text: 'Hemlock leaves crushed underfoot.', trigger: { kind: 'track', marks: 2 } },
      { id: 'poisoner', goal: 'Catch the well-poisoners', label: 'Poisoners', text: 'Bandits, waiting for the hamlet to empty.', trigger: { kind: 'clear', mob: 'bandit', count: 2 }, reward: { goods: { coin: 12, herbs: 4 } } },
    ],
  },
  {
    id: 'map', title: 'A Deserter\'s Map', weight: 1,
    lore: 'A dead man under a cork-oak, a scrap of hide in his fist: a charcoal map, three marks, and a cross by a split rock.',
    end: 'Whatever he ran with, he never came back for it.',
    steps: [
      { id: 'marks', goal: 'Follow the marks on the map', label: 'Map', text: 'The first mark: a cairn with a white stone on top.', trigger: { kind: 'track', marks: 3, off: 8 } },
      {
        id: 'dig', goal: 'Dig at the split rock?', label: 'Cache', text: 'The ground under the rock rings hollow.', trigger: { kind: 'choice', options: [
          { id: 'dig', label: 'Dig', text: 'A muster chest: bronze, coin, a good helm.', reward: { goods: { bronze: 6, coin: 10 }, item: { def: 'chalcidian', rarity: 'common' } }, risk: { chance: 0.3, text: 'His old comrades followed the same map.', next: 'comrades' } },
          { id: 'leave', label: 'Leave it buried', text: 'Some debts follow the coin.' },
        ] },
      },
      { id: 'comrades', goal: 'Drive off his old comrades', label: 'Deserters', text: 'They want what he stole from them.', trigger: { kind: 'clear', mob: 'bandit', count: 3 }, reward: { goods: { bronze: 6, coin: 10 } }, next: 'end' },
    ],
  },
  {
    id: 'oak', title: 'The Speaking Oak', weight: 1, biomes: ['dodona', 'mountains'],
    figure: { cls: 'civ_physician', count: 1, name: 'Selloi priest' },
    lore: 'A lone oak split by Zeus\'s bolt, bronze cauldrons ringing in its boughs. A barefoot priest listens. ‘Ask, and the god answers.’',
    end: 'The cauldrons fall silent. Zeus has said his word.',
    steps: [
      { id: 'go', goal: 'Climb to the struck oak', label: 'Oak', text: 'Thunder rolls though the sky is clear.', trigger: { kind: 'reach' } },
      {
        id: 'ask', goal: 'What do you ask the god?', label: 'Oak', text: 'The priest waits for your offering.', trigger: { kind: 'choice', options: [
          { id: 'victory', label: 'Ask for victory', text: '‘Strength to the one who gives.’ He ties a charm to your captain\'s spear.', reward: { item: { def: 'eye_bead', rarity: 'common' } } },
          { id: 'road', label: 'Ask the road ahead', text: '‘Where the doves settle, bread.’ Wild grain and figs in the next hollow.', reward: { goods: { food: 12 } } },
          { id: 'bronze', label: 'Take a cauldron', text: 'Good bronze, and the god is busy elsewhere.', reward: { goods: { bronze: 8 } }, risk: { chance: 0.5, text: 'No bolt falls, but the oak\'s keepers come with axes.', next: 'keepers' } },
        ] },
      },
      { id: 'keepers', goal: 'Beat off the oak\'s keepers', label: 'Keepers', text: 'They swing their axes in the god\'s name.', trigger: { kind: 'clear', mob: 'bandit', count: 3 }, reward: { goods: { bronze: 8 } }, next: 'end' },
    ],
  },
];

/** The encounter kinds by id. */
export const ENCOUNTERS: Readonly<Record<string, EncounterDef>> = Object.fromEntries(LIST.map((d) => [d.id, d]));
