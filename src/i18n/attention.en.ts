/**
 * English strings of the attention budget (CT-07, design/gdd/controls.md R10b,
 * R11; formations-orders.md R2, R3; abilities.md R5.3): the Orb shape, the
 * Feint key, Raise the standard, the zoom key, the facing pips and their coach
 * cards. Spread into en.ts; ru.ts spreads attention.ru.ts (same keys, same {params}).
 * The `battle.*` keys complete families the scene looks up by name
 * (battle.cmd.<shape>, battle.order.<order>, battle.formation.<shape>).
 */
export const ATTENTION_EN = {
  // the Orb (formations-orders.md R2; V5-041: all-round, not for a frontal line)
  'battle.cmd.orb': 'Orb',
  'battle.shape.orb': 'no flanks; weak head-on',
  'battle.tip.orb': 'A ring facing outward: no flank or rear to hit. Slow, and it loses head-on to a line. Use it against riders and flank attacks.',
  'battle.formation.orb': 'orb',
  'attn.orb.why.riders': 'Riders cannot form an orb',
  'attn.orb.warn': 'An orb loses head-on to a line. It is for riders and flank attacks.',
  'attn.coach.orb': 'New shape: Orb. A ring with no flanks: strong against riders and flank attacks, weak head-on.',
  // the Feint (formations-orders.md R3)
  'battle.order.feint': 'feinting',
  'attn.feint': 'Feint',
  'attn.tip.feint': 'Feigned retreat: run back for 4 s, then turn and charge. Enemies who chase are disordered. Once every 30 s.',
  'attn.tip.backCd': 'Fall back. Feint is ready again in {n} s.',
  'attn.coach.feint': 'New order: Feint. Light troops run back, then turn and charge the enemies who chase them.',
  // Raise the standard (abilities.md R5.3)
  'attn.std.name': 'Standard',
  'attn.std.sub': 'once',
  'attn.std.tip': 'Raise the standard, once per battle: allies near the bearer regain morale, and routing men turn back.',
  'attn.std.banner': '{name} raises the standard!',
  'attn.std.why.raised': 'Raised already: once per battle',
  'attn.std.why.lost': 'The standard is lost',
  'attn.std.why.routing': 'The bearer is fleeing',
  'attn.std.why.stunned': 'The bearer is stunned',
  'attn.std.note.broken': 'Army broken: it restores morale but turns no routers back',
  // single-tap alternatives (A11Y-14)
  'attn.zoom': 'Zoom {n}×',
  'attn.tip.zoom': 'Zoom: each tap steps 1×, 2×, 3× (like a pinch).',
  'attn.pips.banner': 'Tap a direction to face',
  'attn.pip': 'Face',
} as const;
