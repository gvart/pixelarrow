/**
 * World protocol (M4): the strategic layer served by the single WarWorldDO (server/src/war/world/). The static world
 * (regions, borders, alliances) is shared code (src/war/world); the wire carries only what changes.
 *
 *   REST  GET  /api/war/world                     -> WorldSnapshot for the signed-in player
 *         POST /api/war/world/transfer  TransferOrder -> { transit: TransitSnap }
 *         POST /api/war/world/dev/alliance { alliance } (DEV_AUTH=1) join an alliance
 *   WS    /ws/war/world: server -> { t: 'world', ...WorldSnapshot } on connect and on every change (at most 1/s);
 *         client -> { t: 'transfer', ...TransferOrder } | { t: 'ping', c }; server -> transferred | error | pong.
 *
 * Transfer: a squad of the player's standing in region `from` leaves it for the adjacent `to`. It may leave from
 * anywhere in `from`: from inside the entry zone that faces `to` it takes the border's travel time; from elsewhere it
 * takes longer, `offExitMsPerTile` (season config) per tile it stands away from that zone (walking there is quicker).
 * No foe may stand within `foeRadius` tiles. In transit the men are on the world map only (a marker from `from` to
 * `to`); on arrival they enter `to` at its entry zone facing `from`, or wait (`queued`) while their alliance's quota
 * there is full. They hold where they arrive; the player takes them over by joining `to`'s room (a rejoin).
 */
import { z } from 'zod';
import type { AllianceId } from '../world/types';

export const transferSchema = z.object({
  from: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  to: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  /** The squad id in `from`'s room (as the room's welcome lists it). */
  squad: z.number().int().min(0).max(2 ** 31),
});
export type TransferOrder = z.infer<typeof transferSchema>;

export const worldClientMsgSchema = z.discriminatedUnion('t', [
  transferSchema.extend({ t: z.literal('transfer') }),
  z.object({ t: z.literal('ping'), c: z.number().finite() }),
]);
export type WorldClientMsg = z.infer<typeof worldClientMsgSchema>;

export type TransferError = 'noAlliance' | 'region' | 'notAdjacent' | 'notOwner' | 'foes' | 'unavailable';

/** A squad on the move (the player's own). */
export interface TransitSnap {
  id: number;
  from: string;
  to: string;
  men: number;
  departAt: number;
  arriveAt: number;
  /** moving: on the road; queued: arrived, waiting for room in the alliance's quota at `to`. */
  state: 'moving' | 'queued';
}

/** What the world knows of a region from its room. */
export interface RegionState {
  id: string;
  /** Owning alliance (-1: nobody). A home always belongs to its alliance (W-09). */
  owner: AllianceId | -1;
  /** Claim points held per alliance. */
  claims: number[];
  /** Live soldiers per alliance. */
  live: number[];
  /** Men of more than one alliance (or of a foe of the owner) stand there. */
  contested: boolean;
  /** A home with foes in it or foes claiming in it. */
  besieged: boolean;
}

export interface AllianceStats {
  id: AllianceId;
  members: number;
  clans: number;
  regions: number;
  soldiers: number;
  inTransit: number;
}

/** How a season ended: its final scores and the winner (null: a tie at the top). */
export interface SeasonResult { at: number; reason: 'hegemony' | 'time'; winner: AllianceId | null; scores: number[] }

/** The season clock and score ("Season score and victory"). */
export interface SeasonSnap {
  id: number;
  startAt: number;
  endAt: number;
  /** ms to the end (0 once ended). */
  left: number;
  /** Score so far per alliance (whole points). */
  scores: number[];
  /** Score per hour per alliance now. */
  rates: number[];
  /** Owner of Omphalos (-1: nobody) and of each frontier town. */
  omphalos: AllianceId | -1;
  towns: Record<string, AllianceId | -1>;
  /** The alliance holding Omphalos and 3 frontier towns, since when, and when that ends the season. */
  hegemony: { alliance: AllianceId; since: number; endsAt: number } | null;
  /** Set once the season is over: results frozen. */
  ended: SeasonResult | null;
}

export interface WorldSnapshot {
  season: number;
  score: SeasonSnap;
  at: number;
  you: { id: number; alliance: AllianceId | null };
  alliances: AllianceStats[];
  regions: RegionState[];
  transit: TransitSnap[];
}

export type WorldServerMsg =
  | ({ t: 'world' } & WorldSnapshot)
  | { t: 'transferred'; transit: TransitSnap }
  | { t: 'error'; code: TransferError | 'parse'; detail?: string }
  | { t: 'pong'; c: number };

export function parseWorldMsg(text: string): WorldClientMsg | null {
  if (text.length > 1024) return null;
  try {
    const r = worldClientMsgSchema.safeParse(JSON.parse(text));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}
