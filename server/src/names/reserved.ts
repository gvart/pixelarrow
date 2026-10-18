/**
 * Reserved names (ADR-0009 §6), compared on the folded key (validate.ts
 * nameKey). Words of 5 or more characters are refused anywhere in a key
 * ("AdminBob", "PixelarrowSupport"); shorter ones only as the whole key, so
 * "Modest" stays allowed while "mod" does not.
 */
export const RESERVED = [
  'admin', 'administrator', 'moderator', 'mod', 'support', 'system', 'official', 'pixelarrow',
  'telegram', 'cloudflare', 'deletedplayer', 'hiddenplayer', 'null', 'undefined',
  'админ', 'администратор', 'модератор', 'мод', 'поддержка', 'система', 'официальный',
  'пиксельарроу', 'телеграм', 'телеграмм', 'удалённыйигрок', 'скрытыйигрок',
];
