/**
 * After-battle replay check (POST /api/battle/verify). Fire-and-forget: only
 * when signed in, mismatches are logged to the console, gameplay never waits.
 */
import type { Battle } from '../sim/battle';
import type { BattleSetup } from '../sim/types';
import { online } from './cloud';

/** Deep copy of the setup as it was when the battle was created (the sim may mutate nested objects). */
export function snapshotSetup(setup: BattleSetup): BattleSetup {
  return JSON.parse(JSON.stringify(setup)) as BattleSetup;
}

export function reportBattle(setup: BattleSetup | null, sim: Battle, deployOrders: number | undefined): void {
  if (!setup || !online.signedIn) return;
  try {
    online.verifyBattle({
      setup,
      orders: sim.orderLog.map((o) => ({ tick: o.tick, side: o.side, order: o.order })),
      deployOrders,
      claim: { winner: (sim.winner ?? -1) as 0 | 1 | -1, ticks: sim.tick, retreated: sim.retreated, hash: sim.hash() },
    });
  } catch {
    /* never let reporting break the results screen */
  }
}
