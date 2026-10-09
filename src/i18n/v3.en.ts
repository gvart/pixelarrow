/**
 * English strings of the v3 UI (docs/UI_V3.md): resource names and their
 * explanations, the shared components (header, chips, locked states, pager,
 * toggles) and the redesigned screens. Spread into en.ts; ru.ts spreads
 * v3.ru.ts.
 */
export const V3_EN = {
  // ---- resources: one name, one icon, one explanation each (src/ui/tokens.ts RESOURCES)
  'res.gold.campaign': 'Campaign gold',
  'res.gold.war': 'War gold',
  'res.glory': 'Glory',
  'res.stars': 'Stars',
  'res.power': 'Power',
  'res.wins': 'Wins',
  'res.xp': 'XP',
  'res.tip.gold.campaign': 'Campaign gold: earned in campaign battles, spent in towns on men, gear and repairs. The online war keeps its own gold.',
  'res.tip.gold.war': 'War gold of the online war season: from your hexes, raids and the season pass. The campaign keeps its own gold.',
  'res.tip.glory': 'Glory: the duel currency. Won on ladder floors, in matches and raids; spent in the Duels shop on gear and recruits.',
  'res.tip.drachmae': 'Drachmae: the premium currency, bought with Telegram Stars. Buys looks and the season pass; kept across seasons.',
  'res.tip.stars': 'Telegram Stars: real money, paid through Telegram. Only Drachmae packs cost Stars, and every purchase asks first.',
  'res.tip.power': 'Power: how strong the hero is with his gear, attributes and perks. Higher is better.',
  'res.tip.wins': 'Campaign battles won (of all fought).',
  'res.tip.xp': 'Experience: fill the bar to reach the next level.',
  /** "250 Stars" on a real-money button. */
  'res.starsPrice': '{n} Stars',
  // ---- shared components
  'v3.back': 'Back',
  'v3.prev': 'Previous hero',
  'v3.next': 'Next hero',
  'v3.pager': '{i} / {n}',
  'v3.dismiss': 'Hide this tip',
  'v3.locked': 'Locked',
  'v3.unlocksAt': 'Unlocks at level {n}',
  'v3.needMore': 'Need {n} more {res}',
  'v3.on': 'On',
  'v3.off': 'Off',
  'v3.buyConfirmTitle': 'Pay with Telegram Stars?',
  'v3.buyConfirmBody': '{what} for {n} Stars. Telegram asks you to confirm the payment next; Stars are real money.',
  'v3.payStars': 'Pay {n} Stars',
} as const;
