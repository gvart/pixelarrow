/**
 * Server replay of a duel battle the client fought against a bot (ladder
 * floors and async attacks): the server fixed the seed and both armies, the
 * client sends its order log and its claim, and only a replay that ends as
 * claimed counts.
 */
import { z } from 'zod';
import { LIMITS, LoggedOrderSchema, REPLAYERS, replayBattle } from '../battle';
import { ApiError } from '../errors';
import { LEGACY_SIM_VERSION, resolveSimVersion, SimVersionField } from '../simVersion';
import type { BattleSetup, LoggedOrder } from '../../../src/sim/types';

export const SubmitBody = z.object({
  /** The client's SIM_VERSION; absent = a client from before versioning (v1). */
  simVersion: SimVersionField,
  ticket: z.string().regex(/^[0-9a-f]{32}$/),
  orders: z.array(LoggedOrderSchema).max(LIMITS.maxOrders),
  deployOrders: z.number().int().min(0).max(LIMITS.maxOrders).optional(),
  claim: z.object({ winner: z.union([z.literal(0), z.literal(1), z.literal(-1)]), ticks: z.number().int().min(0), hash: z.string().max(16) }),
});
export type Submission = z.infer<typeof SubmitBody>;
export type Replayed = ReturnType<typeof replayBattle>;

/** What a ticket fixed: the setup and the sim version it was issued under (its `sim_version` column). */
export interface IssuedBattle {
  setup: BattleSetup;
  simVersion: number;
}

/**
 * Replays a submission with the ticket's sim version. The MIN_SIM_VERSION
 * floor is for new tickets only: a client running the version its ticket was
 * issued under (an old client with no `simVersion` finishing a v1 ticket from
 * before a raise) is replayed with REPLAYERS[that version], as long as this
 * server still has it (ADR-0001, "In-flight tickets"). Callers pass only
 * tickets that exist, are open and unexpired (ticketPreamble). Otherwise a
 * version this server does not take is 426 `sim_version_unsupported` and
 * leaves the ticket open.
 * On a rejection `reject(claim, result)` closes the ticket first, then the
 * ApiError is thrown (409 `sim_version_mismatch` when the client runs another
 * version than the ticket was issued under, 422 `sim_rejected`, or
 * `replay_mismatch` with `mismatchMessage`).
 */
export async function verifyBattle(
  issued: IssuedBattle,
  body: Submission,
  reject: (claim: string, result?: string) => Promise<void>,
  mismatchMessage = 'The battle did not replay as reported; it does not count',
): Promise<Replayed> {
  const claimJson = JSON.stringify(body.claim);
  const requested = body.simVersion ?? LEGACY_SIM_VERSION;
  const simVersion = requested === issued.simVersion && REPLAYERS[requested] ? requested : resolveSimVersion(body.simVersion);
  if (simVersion !== issued.simVersion) {
    await reject(claimJson, JSON.stringify({ simVersion, ticket: issued.simVersion }));
    throw new ApiError(409, 'sim_version_mismatch', 'This battle was started under another game version; it does not count', { simVersion, ticket: issued.simVersion });
  }
  let out: Replayed;
  try {
    out = replayBattle(issued.setup, body.orders as LoggedOrder[], body.deployOrders, simVersion);
  } catch (e) {
    await reject(claimJson);
    throw new ApiError(422, 'sim_rejected', `The simulation rejected this battle: ${(e as Error).message}`);
  }
  const s = out.summary;
  const mismatches: string[] = [];
  if (s.winner !== body.claim.winner) mismatches.push(`winner: claimed ${body.claim.winner}, server ${s.winner}`);
  if (s.ticks !== body.claim.ticks) mismatches.push(`ticks: claimed ${body.claim.ticks}, server ${s.ticks}`);
  if (s.hash !== body.claim.hash) mismatches.push(`hash: claimed ${body.claim.hash}, server ${s.hash}`);
  if (mismatches.length) {
    await reject(claimJson, JSON.stringify({ mismatches }));
    throw new ApiError(422, 'replay_mismatch', mismatchMessage, { mismatches });
  }
  return out;
}
