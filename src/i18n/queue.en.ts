/**
 * English strings of the order queue (CT-04, design/gdd/controls.md R5, R6):
 * the "Then…" chip and its queued step, and paused staging (the plan). Spread
 * into en.ts; ru.ts spreads queue.ru.ts (same keys, same {params}).
 */
export const QUEUE_EN = {
  'queue.chip.then': 'Then…',
  'queue.tip.then': 'Queue the next order for when this group arrives: tap Then…, then an order key.',
  'queue.banner.arm': 'Then… pick the order for arrival',
  'queue.banner.queued': 'On arrival: {order}',
  'queue.banner.fired': 'Arrived: {order}',
  'queue.chip.queued': '→ {order}',
  'queue.tip.queued': 'Queued for when the group arrives. Tap to cancel it.',
  'queue.banner.cancel': 'Queued order cancelled',
  'queue.chip.clear': 'Clear plan',
  'queue.tip.clear': 'Remove every order planned while paused.',
  'queue.tip.ghost': "Remove this group's planned orders",
  'queue.banner.staged': 'Planned: {n}. Play gives the orders.',
  'queue.banner.issued': 'Plan given',
  'queue.banner.cleared': 'Plan cleared',
  'queue.banner.removed': 'Planned order removed',
} as const;
