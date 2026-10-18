/**
 * Generated display names (ADR-0009 §6, M-DN-2): `<Adjective><Unit><4 digits>`,
 * never the Telegram name. Every name it returns passes `validate.ts`.
 */
import { validateDisplayName } from './validate';

const ADJECTIVES = [
  'Swift', 'Bold', 'Iron', 'Grim', 'Brave', 'Silent', 'Stout', 'Keen', 'Red', 'Grey', 'Golden', 'Bronze',
  'Wild', 'Steady', 'Proud', 'Quick', 'Stern', 'Loyal', 'Fierce', 'Calm', 'Sly', 'Tall', 'Young', 'Old',
];
const UNITS = [
  'Archer', 'Spear', 'Hoplite', 'Rider', 'Slinger', 'Peltast', 'Shield', 'Lancer', 'Scout', 'Guard', 'Hunter', 'Warden',
  'Bowman', 'Pikeman', 'Captain', 'Herald', 'Sentry', 'Ranger', 'Raider', 'Knight', 'Squire', 'Marshal', 'Hero', 'Veteran',
];

/** A fresh `<Adjective><Unit><4 digits>` name that passes the validator; `rng` returns [0, 1). */
export function generateDisplayName(rng: () => number = Math.random): string {
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length) % xs.length];
  for (;;) {
    // Some pairs run past 16 characters, and digits fold to letters in the key: draw again.
    const name = `${pick(ADJECTIVES)}${pick(UNITS)}${1000 + (Math.floor(rng() * 9000) % 9000)}`;
    if (validateDisplayName(name).ok) return name;
  }
}
