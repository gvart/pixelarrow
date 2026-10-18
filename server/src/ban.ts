/**
 * Bans (admin panel). Every session lookup joins `players.banned_at`
 * (server/src/auth/sessions.ts), so a ban takes effect everywhere within the
 * 30 s session cache, and at once in the isolate that issued it. Sign-in
 * checks the player row directly.
 */
import { ApiError } from './errors';
import { forgetSessions } from './auth/sessions';

/** Call after a ban or unban: drops this isolate's cached session lookups. */
export function forgetBans(): void {
  forgetSessions();
}

export const bannedError = () =>
  new ApiError(403, 'banned', 'This account is banned. Contact support through the bot (/paysupport) if you think this is a mistake.');
