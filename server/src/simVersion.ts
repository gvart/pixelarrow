/**
 * Which sim versions this server accepts (design/adr/ADR-0001-determinism-replay.md).
 *
 * Clients send `simVersion` (src/sim/version.ts SIM_VERSION) with every battle
 * ticket, submission and verify call, and `?sim=` on their sockets. The
 * server accepts MIN_SIM_VERSION..SIM_VERSION and replays each battle with
 * the version it was played under (server/src/battle.ts REPLAYERS).
 */
import { z } from 'zod';
import { SIM_VERSION } from '../../src/sim/version';
import { SIM_VERSION_REJECTED } from '../../src/online/protocol';
import { ApiError } from './errors';

export { SIM_VERSION };

/**
 * The oldest client rules still accepted. Raise it to turn stale clients away
 * (they get 426 `sim_version_unsupported` and a "please reload" message);
 * every version from here to SIM_VERSION needs an entry in REPLAYERS.
 */
export const MIN_SIM_VERSION = 1;

/** Clients from before versioning send nothing: they run version 1. */
export const LEGACY_SIM_VERSION = 1;

/** The wire field (optional: today's live clients do not send it). Range checks are resolveSimVersion's. */
export const SimVersionField = z.number().int().min(0).max(1_000_000).optional();

/** 426 `sim_version_unsupported`: the client must reload (an old build) or the server is behind (a newer build). */
function unsupported(version: number): ApiError {
  const message =
    version > SIM_VERSION
      ? 'This game version is newer than the server. Please reload the game.'
      : 'Your game version is out of date. Please reload the game to keep playing online.';
  return new ApiError(426, SIM_VERSION_REJECTED, message, { simVersion: version, min: MIN_SIM_VERSION, max: SIM_VERSION });
}

/** The version a client runs, or 426 `sim_version_unsupported` when this server cannot take it. */
export function resolveSimVersion(v: number | undefined): number {
  const version = v ?? LEGACY_SIM_VERSION;
  if (version < MIN_SIM_VERSION || version > SIM_VERSION) throw unsupported(version);
  return version;
}

const SocketSimParam = z.string().regex(/^\d{1,7}$/).transform(Number).optional();

/**
 * The `?sim=` parameter of a socket upgrade (absent: a pre-versioning client,
 * v1); 400 when malformed. Live lockstep has no grace window: both players
 * and the relay's replay must run the same rules, so a socket must run
 * exactly SIM_VERSION.
 */
export function socketSimVersion(raw: string | undefined): number {
  const parsed = SocketSimParam.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, 'bad_request', 'Bad sim version');
  const version = parsed.data ?? LEGACY_SIM_VERSION;
  if (version !== SIM_VERSION) throw unsupported(version);
  return version;
}
