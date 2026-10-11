/**
 * The event card and the journal (EV-03; design/gdd/campaign-events.md R4,
 * "Touch UI needs"; design/ux/screens-campaign.md C-4). The deck's own text
 * (titles, bodies, choice labels, result lines) is events.en.ts; these are the
 * card's chrome and the effects in words (a cost or a gain is never colour
 * only). events.ru.ts / eventcard.ru.ts have the same keys.
 */
export const EVENTCARD_EN = {
  'evc.journal': 'Journal',
  'evc.journalTip': 'The last 20 events and what you chose',
  'evc.journalEmpty': 'No events yet. They find you on the march, in towns, in camp and after battles.',
  'evc.failed': 'It went badly',
  /** Back on the card takes the choice that costs nothing, after this confirm (screen-flow.md §4). */
  'evc.chooseQ': 'Take this choice?',
  'evc.chooseBody': '{label}. It costs you nothing.',
  'evc.chooseNo': 'Back to the card',
  // the effects of a choice, in words (R2); costs and losses carry a minus
  'evc.fx.gold': '{n} gold',
  'evc.fx.food': '{n} food',
  'evc.fx.supplies': '{n} supplies',
  'evc.fx.recruit': { one: '+{n} man joins', other: '+{n} men join' },
  'evc.fx.xp.all': '+{n} XP to all',
  'evc.fx.xp.one_random': '+{n} XP to one man',
  'evc.fx.xp.lowest': '+{n} XP to the greenest',
  'evc.fx.wound.all': 'Everyone wounded {h} h',
  'evc.fx.wound.one_random': 'A man wounded {h} h',
  'evc.fx.wound.lowest': 'The greenest wounded {h} h',
  'evc.fx.heal': 'All wounds healed',
  'evc.fx.item': 'An item: {rarity}',
  'evc.fx.band.bandits': 'A fight with bandits',
  'evc.fx.band.raiders': 'A fight with raiders',
  'evc.fx.band.mercs': 'A fight with mercenaries',
  'evc.fx.band.captain': 'they have a captain',
  'evc.fx.band.hunts': 'they hunt you',
  'evc.fx.band.bounty': 'bounty x{n}',
  'evc.fx.reveal.lair': 'A lair revealed',
  'evc.fx.reveal.radius': 'The land around revealed',
  'evc.fx.retrain': 'A free perk retrain',
  'evc.fx.price': 'Town prices {p}% for {d} days',
  'evc.fx.closed': 'Town closed {d} days',
  'evc.fx.next.xp': 'Next battle: +50% XP',
  'evc.fx.next.gold': 'Next battle: +50% gold',
  'evc.fx.next.pick': 'Next battle: +1 loot pick',
  'evc.fx.none': 'Nothing gained, nothing lost',
  'evc.fx.chance': '{p}% it works',
  'evc.fx.else': 'If not:',
  // why a choice can't be taken (R4.4)
  'evc.block.gold': 'Need {need} gold (you have {have})',
  'evc.block.food': 'Need {need} food (you have {have})',
  'evc.block.supplies': 'Need {need} supplies (you have {have})',
  'evc.block.room': 'No room in the army ({have}/{need})',
  // what went differently when the choice was made (Campaign.chooseEvent notes)
  'evc.note.room': 'The army is full: some could not join.',
  'evc.note.no_target': 'No one was fit to take it.',
  'evc.note.no_spawn': 'The band never found you.',
} as const;
