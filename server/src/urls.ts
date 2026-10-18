import type { Env } from './env';

/** The game (web and Telegram Mini App) and its API: play.pixelarrow.app (ADR-0007). */
export const gameUrl = (env: Env): string => env.GAME_URL || 'https://play.pixelarrow.app';

/** The landing site, which also serves the legal pages: pixelarrow.app (ADR-0007). */
export const landingUrl = (env: Env): string => env.LANDING_URL || 'https://pixelarrow.app';

/** Local dev origins, from DEV_ORIGINS in .dev.vars only (comma-separated). */
const devOrigins = (env: Env): string[] =>
  (env.DEV_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/** Origins that may send cookie-authenticated unsafe requests: the game's own, plus dev. */
export const gameOrigins = (env: Env): string[] => [new URL(gameUrl(env)).origin, ...devOrigins(env)];
