/**
 * Server replay of a duel battle the client fought against a bot (ladder
 * floors and async attacks): the server fixed the seed and both armies, the
 * client sends its order log and its claim, and only a replay that ends as
 * claimed counts.
 */
import { z } from 'zod';
import { LIMITS, LoggedOrderSchema, replayBattle } from '../battle';
import { ApiError } from '../errors';
import type { BattleSetup, LoggedOrder } from '../../../src/sim/types';

export const SubmitBody = z.object({
  ticket: z.string().regex(/^[0-9a-f]{32}$/),
  orders: z.array(LoggedOrderSchema).max(LIMITS.maxOrders),
  deployOrders: z.number().int().min(0).max(LIMITS.maxOrders).optional(),
  claim: z.object({ winner: z.union([z.literal(0), z.literal(1), z.literal(-1)]), ticks: z.number().int().min(0), hash: z.string().max(16) }),
});
export type Submission = z.infer<typeof SubmitBody>;
export type Replayed = ReturnType<typeof replayBattle>;

/**
 * Replays a submission. On a rejection `reject(claim, result)` closes the
 * ticket first, then the ApiError is thrown (422 `sim_rejected` or
 * `replay_mismatch` with `mismatchMessage`).
 */
export async function verifyBattle(
  setup: BattleSetup,
  body: Submission,
  reject: (claim: string, result?: string) => Promise<void>,
  mismatchMessage = 'The battle did not replay as reported; it does not count',
): Promise<Replayed> {
  const claimJson = JSON.stringify(body.claim);
  let out: Replayed;
  try {
    out = replayBattle(setup, body.orders as LoggedOrder[], body.deployOrders);
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
