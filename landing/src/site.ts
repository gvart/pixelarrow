// One place for the landing's URLs and head copy (docs/v6/landing/STRUCTURE.md, "Global chrome" and
// "SEO and metadata"). Sections import from here so a link never drifts between the hero, the nav,
// the closing call to action and the footer.

export const SITE_URL = 'https://pixelarrow.app';
export const PLAY_URL = 'https://play.pixelarrow.app/';

// The Mini App link, t.me/<bot>/<app>, comes from the same values the bot uses (TELEGRAM_BOT_USERNAME
// and TELEGRAM_APP_NAME, server/src/env.ts). They are not in the repo, so the build reads
// PUBLIC_TELEGRAM_URL; until it is set the buttons open Telegram's own site instead of a guess.
export const TELEGRAM_URL: string = import.meta.env.PUBLIC_TELEGRAM_URL || 'https://telegram.org/';

// ≤ 60 characters (V6-025, LAND-06 SEO pass) so search results show it whole.
export const TITLE = 'Pixelarrow: pixel-art phalanx battles of the ancient world';
export const DESCRIPTION =
  'Command pixel-art phalanxes in real-time battles: a campaign, ranked duels and a seasonal online war. Free to play in your web browser and in Telegram.';
export const OG_IMAGE = {
  url: `${SITE_URL}/og.jpg`,
  width: 1200,
  height: 630,
  alt: 'Two pixel-art formations face each other on a battlefield diorama: Pixelarrow, Hold the line.',
};

export const NAV = [
  { href: '#features', label: 'Features' },
  { href: '#classes', label: 'Classes' },
  { href: '#modes', label: 'Modes' },
  { href: '#leaderboards', label: 'Leaderboards' },
  { href: '#faq', label: 'FAQ' },
] as const;
