/**
 * Live army movement (docs/DESIGN_V2.md "Online battle rules"): when an army
 * sets out, halts or moves into a conquered region, every player online in the
 * shard who can see any of it gets an `army_*` message through the shard
 * socket (RegionDO.liveMove). The fog of war is applied here, per receiver:
 * a march is cut down to the regions within sight of the receiver's land and
 * of their own and clan mates' armies, further from their camps' watchtowers
 * (src/online/liveArmies.ts sightSteps);
 * nothing a receiver cannot see is sent. Own and clan armies go out whole.
 *
 * Failures never break the action that moved the army: live updates are a
 * nicety on top of the map refresh.
 */
import { ONLINE_RULES } from '../../../src/online/rules';
import { allSteps, sightSet, sightSteps, type MarchStep, type Tower } from '../../../src/online/liveArmies';
import { shardTowers } from './camps';
import type { WorldGraph } from '../../../src/online/world';
import type { LiveArmyMsg } from '../../../src/online/protocol';
import type { PlayerCtx } from './context';
import { shardStub } from './context';
import { armyState, playerNames, type ProfileRow } from './store';

export type ArmyMove = { kind: 'march'; path: number[]; at: number[] } | { kind: 'pos'; pos: number };

export interface LiveOut {
  to: number;
  msg: LiveArmyMsg;
}

/** Arrival to announce at `at` (to the players who see the last region). */
export interface LiveArrival {
  at: number;
  loc: number;
  to: number[];
  /** Everyone who was told about this march (a halt hides it from those who no longer see it). */
  told: number[];
}

interface Viewer {
  pid: number;
  clan: number | null;
  sources: number[];
  /** Watchtowers of the viewer's and their clan's camps (see further). */
  towers?: Tower[];
  whole: boolean;
}

/**
 * Pure: the messages for each viewer. `viewers` carry their vision sources
 * (held regions and armies) and whether they see the mover whole (themselves or
 * a clan mate).
 */
export function liveMessages(
  world: WorldGraph,
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
      if (!v.whole && !sightSet(world, v.sources, sight, v.towers).has(move.pos)) continue;
      out.push({ to: v.pid, msg: { type: 'army_pos', ...base, loc: move.pos, now } });
    }
    return { out, arrival: null };
  }
  const last = move.path[move.path.length - 1];
  const arrival: LiveArrival = { at: move.at[move.at.length - 1], loc: last, to: [], told: [] };
  for (const v of viewers) {
    const steps: MarchStep[] = v.whole ? allSteps(move.path, move.at) : sightSteps(world, move.path, move.at, v.sources, sight, v.towers);
    if (!steps.length) continue;
    out.push({
      to: v.pid,
      msg: { type: 'army_march', ...base, path: steps.map((s) => s.loc), at: steps.map((s) => s.at), until: steps.map((s) => s.until), now },
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
    const world = pc.shard.world;
    // The owner's arrival notification (a halt or a capture cancels it).
    const end = move.kind === 'march' ? move.at[move.at.length - 1] : 0;
    const last = move.kind === 'march' ? move.path[move.path.length - 1] : null;
    await stub.marchNotice(pc.pid, last !== null && end - pc.now >= MARCH_NOTICE_MIN_MS ? { at: end, loc: last, place: world.has(last) ? world.info(last).name : `#${last}` } : null);
    const online = await stub.livePlayers();
    if (!online.length) {
      await stub.liveMove(pc.pid, [], null);
      return;
    }
    const sight = ONLINE_RULES.sight;
    // Only vision sources within sight of the move matter.
    const near = sightSet(world, move.kind === 'march' ? move.path : [move.pos], sight);
    const [rows, profs, towers] = await Promise.all([
      pc.db
        .prepare('SELECT loc, owner_id, clan_id FROM online_regions WHERE season_id = ?1 AND shard_id = ?2 AND owner_id IS NOT NULL')
        .bind(pc.shard.season, pc.shard.id)
        .all<{ loc: number; owner_id: number; clan_id: number | null }>(),
      pc.db
        .prepare(
          `SELECT p.player_id, p.army_loc, p.march, m.clan_id FROM online_profiles p
           LEFT JOIN clan_members m ON m.season_id = p.season_id AND m.player_id = p.player_id
           WHERE p.season_id = ?1 AND p.shard_id = ?2`,
        )
        .bind(pc.shard.season, pc.shard.id)
        .all<Pick<ProfileRow, 'army_loc' | 'march'> & { player_id: number; clan_id: number | null }>(),
      shardTowers(pc.db, pc.shard, pc.now),
    ]);
    const clanOf = new Map(profs.results.map((p) => [p.player_id, p.clan_id]));
    const armies = profs.results.map((p) => ({ pid: p.player_id, clan: p.clan_id, pos: armyState(p, pc.now).pos })).filter((a) => near.has(a.pos));
    const held = rows.results.filter((x) => near.has(x.loc));
    const moverClan = pc.clan?.clanId ?? null;
    const viewers: Viewer[] = online
      .filter((pid) => clanOf.has(pid))
      .map((pid) => {
        const clan = clanOf.get(pid) ?? null;
        const mine = (owner: number | null, c: number | null) => owner === pid || (clan !== null && c === clan);
        const sources: number[] = [...held.filter((x) => mine(x.owner_id, x.clan_id)).map((x) => x.loc), ...armies.filter((a) => a.pid !== pc.pid && mine(a.pid, a.clan)).map((a) => a.pos)];
        const seeing = towers.filter((t) => mine(t.pid, t.clan)).map((t) => ({ loc: t.loc, hops: t.hops }));
        return { pid, clan, sources, towers: seeing, whole: pid === pc.pid || (clan !== null && clan === moverClan) };
      });
    const name = (await playerNames(pc.db, [pc.pid])).get(pc.pid) ?? pc.name;
    const { out, arrival } = liveMessages(world, { pid: pc.pid, name, clan: moverClan }, move, viewers, pc.now, sight);
    await stub.liveMove(pc.pid, out, arrival);
  } catch (e) {
    console.warn('live army push failed', e);
  }
}
