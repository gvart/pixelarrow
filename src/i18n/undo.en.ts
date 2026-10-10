/**
 * English strings of undo (CT-03, design/gdd/controls.md R4): the 3 s battle
 * Undo chip, the deployment Undo and the Reset-all confirm. Spread into en.ts;
 * ru.ts spreads undo.ru.ts (same keys, same {params}).
 */
export const UNDO_EN = {
  'undo.chip': 'Undo',
  'undo.tip.battle': 'Take back your last order. For 3 s only; you can always give the order again.',
  'undo.tip.deploy': 'Take back the last change to your deployment (up to 10 steps).',
  'undo.why.none': 'Nothing to undo yet',
  'undo.banner.done': 'Order undone',
  'undo.banner.deploy': 'Change undone',
  'undo.reset.title': 'Reset all groups?',
  'undo.reset.body': 'Every group goes back to where it started. This clears your Undo steps.',
  'undo.reset.ok': 'Reset all',
} as const;
