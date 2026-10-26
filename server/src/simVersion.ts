/**
 * The sim version check (design/adr/ADR-0001-determinism-replay.md).
 *
 * Clients send `?sim=` (src/sim/version.ts SIM_VERSION) on their sockets. The server
 * runs one sim, today's, so it takes only SIM_VERSION: anything else is a
 * stale (or newer) bundle and gets 426 `sim_version_unsupported` (sockets: an
 * error frame and close 4426) and a "please reload" message. There is no
 * grace window and no older sim to replay with (V5-074).
 */
import { z } from 'zod';
import { SIM_VERSION } from '../../src/sim/version';
import { ApiError } from './errors';

export { SIM_VERSION };

/** The error code of a refused sim version (HTTP 426, or a socket's `error` frame). */
export const SIM_VERSION_REJECTED = 'sim_version_unsupported';
/** The close code of a socket refused for its sim version. */
export const SIM_VERSION_CLOSE = 4426;

/** 426 `sim_version_unsupported`: the client must reload (an old build) or the server is behind (a newer build). */
function unsupported(version: number | undefined): ApiError {
  const message =
    version !== undefined && version > SIM_VERSION
      ? 'This game version is newer than the server. Please reload the game.'
      : 'Your game version is out of date. Please reload the game to keep playing online.';
  return new ApiError(426, SIM_VERSION_REJECTED, message, { simVersion: version ?? null, expected: SIM_VERSION });
}

/** Throws 426 `sim_version_unsupported` unless the client runs SIM_VERSION. */
export function checkSimVersion(v: number | undefined): void {
  if (v !== SIM_VERSION) throw unsupported(v);
}

const SocketSimParam = z.string().regex(/^\d{1,7}$/).transform(Number).optional();

/** The `?sim=` parameter of a socket upgrade: 400 when malformed, 426 unless it is SIM_VERSION. */
export function checkSocketSimVersion(raw: string | undefined): void {
  const parsed = SocketSimParam.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, 'bad_request', 'Bad sim version');
  checkSimVersion(parsed.data);
}
