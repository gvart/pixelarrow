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
 * 2 since FO-01, the first rule change of sim train 2 (ADR-0001 step 3,
 * V5-033): v1 clients get 426 and the reload message.
 */
export const MIN_SIM_VERSION = 2;

/**
 * The oldest client rules a live socket (/ws/*) still accepts (V5-033). Live
 * lockstep pairs only clients of the same version (the shard's DuelHub, the
 * MatchmakerDO queue, the DuelDO join). It was 1 while v1 and v2 rules were
 * identical; FO-01, the first rule-changing train-2 story, raised it and
 * MIN_SIM_VERSION to 2 (ADR-0001, "Adding a version"), so a v1 socket now
 * gets an error frame and close 4426.
 */
export const SOCKET_MIN_SIM_VERSION = 2;

/** Clients from before versioning send nothing: they run version 1. */
export const LEGACY_SIM_VERSION = 1;

/** The wire field (optional: today's live clients do not send it). Range checks are resolveSimVersion's. */
export const SimVersionField = z.number().int().min(0).max(1_000_000).optional();

/** 426 `sim_version_unsupported`: the client must reload (an old build) or the server is behind (a newer build). */
function unsupported(version: number, min = MIN_SIM_VERSION): ApiError {
  const message =
    version > SIM_VERSION
      ? 'This game version is newer than the server. Please reload the game.'
      : 'Your game version is out of date. Please reload the game to keep playing online.';
  return new ApiError(426, SIM_VERSION_REJECTED, message, { simVersion: version, min, max: SIM_VERSION });
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
 * v1); 400 when malformed, 426 outside SOCKET_MIN_SIM_VERSION..SIM_VERSION.
 * Both players and the relay's replay must run the same rules, so live duels
 * pair only sockets of the same version.
 */
export function socketSimVersion(raw: string | undefined, min = SOCKET_MIN_SIM_VERSION): number {
  const parsed = SocketSimParam.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, 'bad_request', 'Bad sim version');
  const version = parsed.data ?? LEGACY_SIM_VERSION;
  if (version < min || version > SIM_VERSION) throw unsupported(version, min);
  return version;
}

/** The socket's sim version as the gateway forwards it to a Durable Object (`x-sim-version`; absent = v1). */
export function forwardedSimVersion(headers: Headers): number {
  const v = Number(headers.get('x-sim-version'));
  return Number.isSafeInteger(v) && v > 0 ? v : LEGACY_SIM_VERSION;
}

/** 409 `sim_version_mismatch` text for a live duel between clients of different rules. */
export const SIM_MISMATCH_MESSAGE = 'That player runs another game version. One of you needs to reload the game.';
