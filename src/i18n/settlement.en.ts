/**
 * The v5 Settlement (SET-01, design/ux/screens-campaign.md C-6): the Services
 * tab with the Drillmaster, the hire Undo toast, the recruit sheet and the
 * sacked or closed state. Spread into en.ts; ru.ts spreads settlement.ru.ts.
 */
export const SETTLEMENT_EN = {
  'set.tab.services': 'Services',
  'set.undo': 'Undo',
  'set.undone': '{name} sent home: {n} gold back',
  'set.volunteer': 'Volunteer',
  'set.sacked': 'Sacked by the host',
  'set.closed': 'The gates are shut',
  'set.reopens': { one: 'Reopens in {n} day', other: 'Reopens in {n} days' },
  'set.servicesStay': 'Services stay open.',
  'set.provisions': 'Provisions',
  'set.foodHave': 'Rations: {n} now',
  'set.supHave': 'Supplies: {n} now',
  'set.physician': 'Physician',
  'set.physicianSub': { one: 'Heal {n} wounded man now', other: 'Heal all {n} wounded now' },
  'set.noPatients': 'No patients',
  'set.drill': 'Drillmaster',
  'set.drillSub': 'Retrain a perk · {n} g × tier',
  'set.drillFree': { one: '{n} free retrain waiting', other: '{n} free retrains waiting' },
  'set.drillGo': 'Choose',
  'set.drillTip': 'Pick a man, then a perk tier to retrain',
  'set.drillNone': 'No man has a perk to retrain yet',
  'set.buyBody': '{name} for {n} gold. You have {gold}.',
  'set.strong': 'Strong against',
  'set.weak': 'Weak against',
} as const;
