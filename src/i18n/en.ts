/**
 * English strings: the source table. Every key here must exist in every other
 * language (tests/i18n.test.ts checks keys, parameters and font coverage).
 *
 * - `{name}` is replaced by the parameter `name`.
 * - A plural entry is an object of CLDR forms (`one`, `few`, `many`, `other`);
 *   the form is picked by the parameter `n`.
 * - Keys are grouped by screen: `common.*` (shared), `kit.*` (UI kit),
 *   `menu.*`, `settings.*`, ... Add a screen's keys under its own prefix.
 */
export const EN = {
  // ---- shared words
  'common.ok': 'OK',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.back': 'Back',
  'common.stay': 'Stay',
  'common.confirm': 'Confirm',
  'common.on': 'On',
  'common.off': 'Off',
  'common.yes': 'Yes',
  'common.no': 'No',
  'common.loading': 'Loading...',
  'common.retry': 'Retry',
  'common.gold': 'Gold',
  'common.day': 'Day {n}',
  'common.level': 'Level {n}',
  'common.heroes': { one: '{n} hero', other: '{n} heroes' },
  'common.items': { one: '{n} item', other: '{n} items' },
  'common.seconds': { one: '{n} second', other: '{n} seconds' },
  'common.minutes': { one: '{n} minute', other: '{n} minutes' },

  // ---- UI kit
  'kit.tapForMore': 'Tap to read more',
  'kit.more': 'More',
  'kit.less': 'Less',
  'kit.disabled': 'Not available right now',
  'kit.empty.title': 'Nothing here yet',
  'kit.scrollHint': 'Scroll for more',
  'kit.confirm.title': 'Are you sure?',

  // ---- rarities (docs/DESIGN_V2.md "Items": five tiers)
  'rarity.common': 'Common',
  'rarity.uncommon': 'Uncommon',
  'rarity.rare': 'Rare',
  'rarity.epic': 'Epic',
  'rarity.legendary': 'Legendary',

  // ---- equipment slots and goods
  'slot.weapon': 'Weapon',
  'slot.shield': 'Shield',
  'slot.helmet': 'Helmet',
  'slot.armor': 'Armour',
  'slot.trinket': 'Trinket',
  'res.gold': 'Gold',
  'res.food': 'Food',
  'res.wood': 'Wood',
  'res.bronze': 'Bronze',
  'res.recruits': 'Recruits',
  'res.drachmae': 'Drachmae',

  // ---- battle panel categories (colours: src/ui/theme.ts)
  'battle.cat.movement': 'Movement',
  'battle.cat.attack': 'Attack',
  'battle.cat.formation': 'Formation',
  'battle.cat.abilities': 'Abilities',

  // ---- main menu
  'menu.subtitle': 'Shields of the Middle Sea',
  'menu.continue': 'Continue',
  'menu.newCampaign': 'New campaign',
  'menu.online': 'Online',
  'menu.shop': 'Shop',
  'menu.settings': 'Settings',
  'menu.cloudSave': 'Cloud save',
  'menu.cloudSaveOf': 'Cloud save - {name}',
  'menu.localSave': 'Local save',
  'menu.resetTitle': 'New campaign?',
  'menu.resetBody': 'Your army, stash and map will be lost forever.',
  'menu.resetOk': 'Begin',
  'menu.noSave': 'No campaign saved yet: start a new one.',
  'menu.tip.gold': 'Gold in your treasury',
  'menu.tip.army': 'Heroes in your army',
  'menu.tip.day': 'Days on campaign',
  'menu.tip.record': 'Battles won / fought',

  // ---- settings
  'settings.title': 'Settings',
  'settings.pauseContact': 'Pause on first contact',
  'settings.pauseFlank': 'Pause when flanked',
  'settings.pauseRout': 'Pause when a group routs',
  'settings.pauseDeath': 'Pause on hero death',
  'settings.haptics': 'Haptic feedback',
  'settings.dmgNumbers': 'Damage numbers',
  'settings.sound': 'Sound',
  'settings.music': 'Music',
  'settings.effects': 'Effects',
  'settings.language': 'Language',
  'settings.lang.auto': 'Auto',
  'settings.lang.en': 'English',
  'settings.lang.ru': 'Русский',
  'settings.tab.game': 'Game',
  'settings.tab.audio': 'Audio',
  'settings.tab.language': 'Language',
  'settings.volumeDown': 'Quieter',
  'settings.volumeUp': 'Louder',
} as const;
