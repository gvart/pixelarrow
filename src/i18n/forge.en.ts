/**
 * The town Smith's forge reroll (EC-01, design/gdd/forge-reroll.md): the Services row, the item
 * list and the reforge sheet. Spread into en.ts; ru.ts spreads forge.ru.ts.
 */
export const FORGE_EN = {
  'forge.smith': 'Smith',
  'forge.rowSub': 'Reforge one random stat · from {n} g',
  'forge.go': 'Choose',
  'forge.tip': 'Pick an item, then the random stat to draw again',
  'forge.none': 'No item with a random stat. Uncommon and finer gear has them.',
  'forge.intro': 'The Smith reforges one random stat of an item: it is drawn again, as at a drop. The power and the other stats stay.',
  'forge.gold': 'You have {n} gold',
  'forge.worn': 'Worn by {name}',
  'forge.stash': 'In the stash',
  'forge.title': 'Reforge',
  'forge.pick': 'Choose the stat to draw again',
  'forge.powerStays': 'Power: {name} (stays)',
  'forge.act': 'Reforge {n}',
  'forge.poor': 'Need {n} gold. You have {gold}.',
  'forge.was': 'Was: {line}',
  'forge.new': 'New',
  'forge.done': 'Reforged: {line}',
  'forge.named': 'A named item keeps its stats',
} as const;
