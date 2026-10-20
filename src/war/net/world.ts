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
 * Transfer: a squad of the player's standing in region `from` (by its room squad id, or his men there by person id, up
 * to TRANSFER_MAX) leaves it for the adjacent `to`. It may leave from
 * anywhere in `from`: from inside the entry zone that faces `to` it takes the border's travel time; from elsewhere it
 * takes longer, `offExitMsPerTile` (season config) per tile it stands away from that zone (walking there is quicker).
 * No foe may stand within `foeRadius` tiles. In transit the men are on the world map only (a marker from `from` to
 * `to`); on arrival they enter `to` at its entry zone facing `from`, or wait (`queued`) while their alliance's quota
 * there is full. They hold where they arrive; the player takes them over by joining `to`'s room (a rejoin).
 */
import { z } from 'zod';
import type { AllianceId } from '../world/types';

/** Most men one transfer moves (they arrive as one squad: MAX_SQUAD). */
export const TRANSFER_MAX = 12;

const transferFields = z.object({
  from: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  to: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  /** The squad id in `from`'s room (as the room's welcome lists it), or: */
  squad: z.number().int().min(0).max(2 ** 31).optional(),
  /** the person ids (the roster's) of the player's men standing in `from`, from one or more of his squads there. */
  ids: z.array(z.string().min(1).max(64)).min(1).max(TRANSFER_MAX).optional(),
  /** M6h haul: the regions after `to`, in order; the world chains the transfers on arrival, the player offline or not. */
  path: z.array(z.string().regex(/^[a-z0-9_-]{1,40}$/)).max(12).optional(),
});
const oneOf = (o: { squad?: number; ids?: string[] }) => (o.squad === undefined) !== (o.ids === undefined);
export const transferSchema = transferFields.refine(oneOf, 'squad or ids');
export type TransferOrder = z.infer<typeof transferSchema>;

export const worldClientMsgSchema = z.discriminatedUnion('t', [
  transferFields.extend({ t: z.literal('transfer') }),
  z.object({ t: z.literal('ping'), c: z.number().finite() }),
]);
export type WorldClientMsg = z.infer<typeof worldClientMsgSchema>;

export type TransferError = 'noAlliance' | 'region' | 'notAdjacent' | 'notOwner' | 'foes' | 'unavailable';

/** M6h: what a transit carries: each man's pack (by person id) and the cart his squad drove, if any. */
export interface TransitCargo {
  packs: Record<string, { lots: { r: string; n: number; o: string; s?: number }[]; items: import('../../data/items').Item[] }>;
  cart?: { type: 'handcart' | 'wagon'; lots: { r: string; n: number; o: string; s?: number }[]; items: import('../../data/items').Item[] };
}

/** M6h: a convoy on the world map (any alliance's transit seen by the player's: fog and Safe Roads). */
export interface ConvoySnap extends TransitSnap {
  alliance: AllianceId;
  /** The cart it drives (none: men only). */
  cart?: 'handcart' | 'wagon';
  /** Loads it carries, goods by good, items. */
  loads: number;
  goods: Record<string, number>;
  items: number;
  /** The player's own. */
  mine: boolean;
}

/** M6h: the last price board the alliance's men saw in a market town (src/war/... server market board). */
export interface BoardSeen {
  at: number;
  goods: Record<string, { ask: number | null; bid: number | null; askDepth: number; bidDepth: number }>;
  fills: { res: string | null; n: number; price: number; at: number }[];
}

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
  /** M6h: trade score per alliance so far (included in `scores`). */
  trade?: number[];
}

export interface WorldSnapshot {
  season: number;
  score: SeasonSnap;
  at: number;
  you: { id: number; alliance: AllianceId | null };
  alliances: AllianceStats[];
  regions: RegionState[];
  transit: TransitSnap[];
  /** M6h: convoys the player's alliance sees (his own included), with their cargo. */
  convoys?: ConvoySnap[];
  /** M6h: per market town, the last board the player's alliance saw there. */
  boards?: Record<string, BoardSeen>;
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
    return r.success && (r.data.t !== 'transfer' || oneOf(r.data)) ? r.data : null;
  } catch {
    return null;
  }
}
