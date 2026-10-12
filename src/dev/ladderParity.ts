/**
 * Ladder parity harness (V5-052, BAL-02): `npm run balance:ladder [-- N [from-to]]`.
 *
 * V5-052 asks that no ladder floor gets more than 5 pts easier or harder
 * after a sim, AI or data change. This harness measures it against a frozen
 * anchor, the ladder as it was before EC-05 (commit 9570d6f^1), which is the
 * reference of the V5-073 numbers (47 of 50 within ±5; 29 +8, 31 −6, 36 −6):
 *  - `ladderParity/floors.frozen.json`: each floor's bot army (stats, kit,
 *    doctrine, field) as the pre-EC-05 code built it;
 *  - `ladderParity/ai.frozen.ts`: the pre-EC-05 `src/sim/ai.ts`.
 * The challenger (side 0) is always the frozen floor army, steady, driven by
 * the frozen bot. Per floor and seed, two paired battles run on today's sim:
 *  - ref: the frozen floor (frozen bot, its old doctrine) on its old field;
 *  - now: today's floor (`ladderFloor` + `ladderSetup`, today's bot).
 * Δ = now − ref, the floor's win rate. A positive Δ means the floor got harder.
 * At 300 seeds one paired standard error on Δ is about 3 pts.
 *
 * Both arms seat their bots the same way (after both armies stand), so the
 * only differences between them are the floor's army, doctrine, field and bot.
 * The frozen copies are never updated: re-record them only on purpose, with a
 * new anchor and a DECISIONS row.
 */
import { BotAI } from '../sim/ai';
import { Battle } from '../sim/battle';
import type { ArmySpec, BattleSetup, DoctrineId, Side } from '../sim/types';
import { LADDER, ladderFloor, ladderSetup } from '../duel/ladder';
import { generateBattlefield, type BattleSite } from '../world/battlefield';
import { ONLINE_RULES } from '../online/rules';
import { BotAI as FrozenBotAI } from './ladderParity/ai.frozen';
import frozenFloors from './ladderParity/floors.frozen.json';

interface FrozenFloor {
  floor: number;
  doctrine: DoctrineId;
  site: BattleSite;
  army: ArmySpec;
}

const FROZEN = frozenFloors as unknown as FrozenFloor[];

/** Floors V5-073 accepts within ±8 instead of ±5. */
export const PARITY_ACCEPTED: Readonly<Record<number, number>> = { 29: 8, 31: 8, 36: 8 };

type Brain = { deploy(b: Battle): void; think(b: Battle): void };

/** One battle, both sides bot-driven: `frozen` sides get the pre-EC-05 bot. Returns the winner (-1 = none). */
function fight(setup: BattleSetup, frozen: [boolean, boolean]): number {
  const b = new Battle({ ...setup, armies: [{ ...setup.armies[0], bot: false }, { ...setup.armies[1], bot: false }] });
  const inner = b as unknown as { bots: Brain[]; botSide: boolean[] };
  for (const side of [0, 1] as Side[]) {
    const a = setup.armies[side];
    const Ctor = frozen[side] ? FrozenBotAI : BotAI;
    const bot = new Ctor(side, b.seed ^ (0x5bd1e995 * (side + 1)), a.doctrine, a.holdField === true);
    inner.botSide[side] = true;
    inner.bots.push(bot);
    bot.deploy(b);
  }
  b.startBattle();
  for (let i = 0; i < b.timeLimitTicks + 10 && b.phase !== 'ended'; i++) {
    b.step();
    b.drainEvents();
  }
  return b.winner ?? -1;
}

/** The challenger: the frozen floor army as a steady side 0 that fights to the end. */
function challenger(fr: FrozenFloor): ArmySpec {
  return { ...fr.army, bot: true, doctrine: 'steady', holdField: true };
}

export interface ParityRow {
  floor: number;
  doctrine: DoctrineId;
  ref: number;
  now: number;
  delta: number;
}

/** The parity of one floor over `n` paired seeds (win rates in %); `doctrine` tries another doctrine for today's floor (a FLOOR_DOCTRINE scan). */
export function floorParity(floor: number, n: number, doctrine?: DoctrineId): ParityRow {
  const fr = FROZEN[floor - 1];
  const today = ladderFloor(floor);
  if (doctrine) today.doctrine = doctrine;
  let ref = 0;
  let now = 0;
  for (let i = 0; i < n; i++) {
    const seed = (floor * 100_003 + i * 7919 + 1) >>> 0;
    const refSetup: BattleSetup = {
      seed,
      armies: [challenger(fr), { ...fr.army }],
      timeLimit: ONLINE_RULES.battleTimeLimit,
      terrain: generateBattlefield(seed, fr.site),
    };
    const nowSetup = ladderSetup(seed, [], [], today);
    nowSetup.armies[0] = challenger(fr);
    if (fight(refSetup, [true, true]) === 1) ref++;
    if (fight(nowSetup, [true, false]) === 1) now++;
  }
  const pct = (k: number) => Math.round((1000 * k) / n) / 10;
  return { floor, doctrine: today.doctrine ?? 'steady', ref: pct(ref), now: pct(now), delta: Math.round(pct(now) - pct(ref)) };
}

/** The full scan as text: one line per floor and a summary. */
export function ladderParityReport(n = 300, from = 1, to: number = LADDER.floors): string {
  const lines = [`Ladder parity vs the pre-EC-05 anchor (${n} paired seeds per arm; floor win rate, Δ = now − ref)`];
  lines.push('  floor  doctrine  ref     now     Δ     verdict');
  let inside = 0;
  let total = 0;
  for (let f = from; f <= to; f++) {
    const r = floorParity(f, n);
    const band = PARITY_ACCEPTED[f] ?? 5;
    const ok = Math.abs(r.delta) <= 5;
    const verdict = ok ? 'ok' : Math.abs(r.delta) <= band ? `accepted (±${band}, V5-073)` : 'OUT';
    if (ok) inside++;
    total++;
    lines.push(`  ${String(f).padStart(5)}  ${r.doctrine.padEnd(8)}  ${`${r.ref}%`.padEnd(6)}  ${`${r.now}%`.padEnd(6)}  ${(r.delta > 0 ? `+${r.delta}` : `${r.delta}`).padEnd(4)}  ${verdict}`);
  }
  lines.push(`  within ±5: ${inside} of ${total}`);
  return lines.join('\n');
}
