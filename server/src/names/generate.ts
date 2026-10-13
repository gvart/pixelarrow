/**
 * Generated display names (ADR-0009 §6, M-DN-2): `<Adjective><Unit><4 digits>`,
 * never the Telegram name. Validation and renames are ADR-0009's
 * `names/validate.ts`; it should take `nameKey` from here (or move it there).
 */

const ADJECTIVES = [
  'Swift', 'Bold', 'Iron', 'Grim', 'Brave', 'Silent', 'Stout', 'Keen', 'Red', 'Grey', 'Golden', 'Bronze',
  'Wild', 'Steady', 'Proud', 'Quick', 'Stern', 'Loyal', 'Fierce', 'Calm', 'Sly', 'Tall', 'Young', 'Old',
];
const UNITS = [
  'Archer', 'Spear', 'Hoplite', 'Rider', 'Slinger', 'Peltast', 'Shield', 'Lancer', 'Scout', 'Guard', 'Hunter', 'Warden',
  'Bowman', 'Pikeman', 'Captain', 'Herald', 'Sentry', 'Ranger', 'Raider', 'Knight', 'Squire', 'Marshal', 'Hero', 'Veteran',
];

/** A fresh `<Adjective><Unit><4 digits>` name; `rng` returns [0, 1). */
export function generateDisplayName(rng: () => number = Math.random): string {
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length) % xs.length];
  return `${pick(ADJECTIVES)}${pick(UNITS)}${1000 + (Math.floor(rng() * 9000) % 9000)}`;
}

const FOLD: Record<string, string> = { '0': 'o', '1': 'l', '3': 'e', '4': 'a', '5': 's', '7': 't' };

/**
 * The uniqueness key (`players.display_name_key`): lower-cased, without spaces,
 * `_` and `-`, look-alike digits folded, so `Adm1n` and `admin` collide.
 */
export function nameKey(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
    .replace(/[013457]/g, (d) => FOLD[d]);
}
