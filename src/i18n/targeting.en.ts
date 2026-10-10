/**
 * English strings of battle targeting (CT-02, design/gdd/controls.md R3):
 * focus fire, the focus chip, "Advance to range". Spread into en.ts; ru.ts
 * spreads targeting.ru.ts (same keys, same {params}).
 */
export const TARGETING_EN = {
  'target.chip.focus': 'Focus',
  'target.tip.focus': 'Your missile men shoot at the marked enemy group first. Tap to clear: they shoot at the nearest again.',
  'target.chip.advance': 'To range',
  'target.tip.advance': 'Advance to range: march until the target is within reach of your missiles.',
  'target.banner.focus': 'Focus fire on this group',
  'target.banner.clear': 'Focus cleared: shooting at the nearest',
} as const;
