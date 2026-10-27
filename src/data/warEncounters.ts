/**
 * W-65 random encounters (the runner: src/war/sim/encounters.ts): short happenings on the road while a player's men
 * travel a neutral region. Each kind: 1-2 lines of lore, one or two steps, a small reward (coin, goods, now and then an
 * item or a soul). Steps use the runner's triggers: reach (here, the nearest town or lair, the story's giver), clear (foes
 * spawned at the spot; `fauna`: the region's beasts; +1 man per two depths), choice (buttons; a risk may turn a search
 * into a fight), guide (reach him, then the nearest town).
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
];

/** The encounter kinds by id. */
export const ENCOUNTERS: Readonly<Record<string, EncounterDef>> = Object.fromEntries(LIST.map((d) => [d.id, d]));
