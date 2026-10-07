/**
 * Live army movement (docs/DESIGN_V2.md "Online battle rules"): when an army
 * sets out, halts or moves into a conquered hex, every player online in the
 * shard who can see any of it gets an `army_*` message through the shard
 * socket (RegionDO.liveMove). The fog of war is applied here, per receiver:
 * a march is cut down to the hexes within sight of the receiver's land and
 * of their own and clan mates' armies (src/online/liveArmies.ts sightSteps);
 * nothing a receiver cannot see is sent. Own and clan armies go out whole.
 *
 * Failures never break the action that moved the army: live updates are a
 * nicety on top of the map refresh.
 */
import { hexDistance, type Axial } from '../../../src/online/hex';
import { ONLINE_RULES } from '../../../src/online/rules';
import { allSteps, sightSteps, type MarchStep } from '../../../src/online/liveArmies';
import type { LiveArmyMsg } from '../../../src/online/protocol';
import type { PlayerCtx } from './context';
import { shardStub } from './context';
import { armyState, hexRowsIn, playerNames, type ProfileRow } from './store';

export type ArmyMove = { kind: 'march'; path: Axial[]; at: number[] } | { kind: 'pos'; pos: Axial };

export interface LiveOut {
  to: number;
  msg: LiveArmyMsg;
}

/** Arrival to announce at `at` (to the players who see the last hex). */
export interface LiveArrival {
  at: number;
  q: number;
  r: number;
  to: number[];
  /** Everyone who was told about this march (a halt hides it from those who no longer see it). */
  told: number[];
}

interface Viewer {
  pid: number;
  clan: number | null;
  sources: Axial[];
  whole: boolean;
}

/**
 * Pure: the messages for each viewer. `viewers` carry their vision sources
 * (held hexes and armies) and whether they see the mover whole (themselves or
 * a clan mate).
 */
export function liveMessages(
  mover: { pid: number; name: string; clan: number | null },
  move: ArmyMove,
  viewers: readonly Viewer[],
  now: number,
  sight = ONLINE_RULES.sight,
): { out: LiveOut[]; arrival: LiveArrival | null } {
  const out: LiveOut[] = [];
  const base = { player: mover.pid, name: mover.name, clan: mover.clan };
  if (move.kind === 'pos') {
    for (const v of viewers) {
      if (!v.whole && !v.sources.some((s) => hexDistance(s, move.pos) <= sight)) continue;
      out.push({ to: v.pid, msg: { type: 'army_pos', ...base, q: move.pos.q, r: move.pos.r, now } });
    }
    return { out, arrival: null };
  }
  const last = move.path[move.path.length - 1];
  const arrival: LiveArrival = { at: move.at[move.at.length - 1], q: last.q, r: last.r, to: [], told: [] };
  for (const v of viewers) {
    const steps: MarchStep[] = v.whole ? allSteps(move.path, move.at) : sightSteps(move.path, move.at, v.sources, sight);
    if (!steps.length) continue;
    out.push({
      to: v.pid,
      msg: { type: 'army_march', ...base, path: steps.map((s) => [s.q, s.r]), at: steps.map((s) => s.at), until: steps.map((s) => s.until), now },
    });
    arrival.told.push(v.pid);
    if (steps[steps.length - 1].until === null) arrival.to.push(v.pid);
  }
  return { out, arrival };
}

/** Marches at least this long notify their owner on arrival (when offline then). */
export const MARCH_NOTICE_MIN_MS = 5 * 60_000;

/** Pushes an army move to everyone online in the shard who can see it. Never throws. */
export async function pushArmyMove(pc: PlayerCtx, move: ArmyMove): Promise<void> {
  try {
    const stub = shardStub(pc.env, pc.shard);
    // The owner's arrival notification (a halt or a capture cancels it).
    const end = move.kind === 'march' ? move.at[move.at.length - 1] : 0;
    const last = move.kind === 'march' ? move.path[move.path.length - 1] : null;
    await stub.marchNotice(pc.pid, last && end - pc.now >= MARCH_NOTICE_MIN_MS ? { at: end, q: last.q, r: last.r } : null);
    const online = await stub.livePlayers();
    if (!online.length) {
      await stub.liveMove(pc.pid, [], null);
      return;
    }
    const hexes = move.kind === 'march' ? move.path : [move.pos];
    const sight = ONLINE_RULES.sight;
    const q0 = Math.min(...hexes.map((h) => h.q)) - sight;
    const q1 = Math.max(...hexes.map((h) => h.q)) + sight;
    const r0 = Math.min(...hexes.map((h) => h.r)) - sight;
    const r1 = Math.max(...hexes.map((h) => h.r)) + sight;
    const inBox = (h: Axial) => h.q >= q0 && h.q <= q1 && h.r >= r0 && h.r <= r1;
    const [rows, profs] = await Promise.all([
      hexRowsIn(pc.db, pc.shard, q0, q1, r0, r1),
      pc.db
        .prepare(
          `SELECT p.player_id, p.army_q, p.army_r, p.march, m.clan_id FROM online_profiles p
           LEFT JOIN clan_members m ON m.season_id = p.season_id AND m.player_id = p.player_id
           WHERE p.season_id = ?1 AND p.shard_id = ?2`,
        )
        .bind(pc.shard.season, pc.shard.id)
        .all<Pick<ProfileRow, 'army_q' | 'army_r' | 'march'> & { player_id: number; clan_id: number | null }>(),
    ]);
    const clanOf = new Map(profs.results.map((p) => [p.player_id, p.clan_id]));
    const armies = profs.results.map((p) => ({ pid: p.player_id, clan: p.clan_id, pos: armyState(p, pc.now).pos })).filter((a) => inBox(a.pos));
    const moverClan = pc.clan?.clanId ?? null;
    const viewers: Viewer[] = online
      .filter((pid) => clanOf.has(pid))
      .map((pid) => {
        const clan = clanOf.get(pid) ?? null;
        const mine = (owner: number | null, c: number | null) => owner === pid || (clan !== null && c === clan);
        const sources: Axial[] = [
          ...rows.filter((x) => x.owner_id !== null && mine(x.owner_id, x.clan_id)).map((x) => ({ q: x.q, r: x.r })),
          ...armies.filter((a) => a.pid !== pc.pid && mine(a.pid, a.clan)).map((a) => a.pos),
        ];
        return { pid, clan, sources, whole: pid === pc.pid || (clan !== null && clan === moverClan) };
      });
    const name = (await playerNames(pc.db, [pc.pid])).get(pc.pid) ?? pc.name;
    const { out, arrival } = liveMessages({ pid: pc.pid, name, clan: moverClan }, move, viewers, pc.now, sight);
    await stub.liveMove(pc.pid, out, arrival);
  } catch (e) {
    console.warn('live army push failed', e);
  }
}
