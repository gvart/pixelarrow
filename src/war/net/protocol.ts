/**
 * Live region protocol (M3, docs/impl/global-war-rebuild.md W-05..W-07): one WebSocket per player to the region's
 * WarRegionDO (server/src/war/). Server-authoritative: the client only sends the messages below (JSON text, zod-checked);
 * the server answers with JSON control messages (ServerMsg) and sends the world as binary delta snapshots (./codec.ts),
 * filtered to what the client may see (./interest.ts).
 *
 *   client -> join   { t, v, region, playerId, team, squads } once to enter; again to bring more squads (same team).
 *                    squads: person ids (D1 war_persons, M5e) per squad; the server loads and spawns them. `army`
 *                    (class + count) instead is a dev-only join (the server allows it only with DEV_AUTH=1).
 *   client -> order  { t, o }                                 an Order for one of the player's own squads
 *   client -> view   { t, x0, y0, x1, y1 }                    camera rect in tiles (interest management)
 *   client -> ping   { t, c }
 *   server -> welcome | refused | queued | error | pong       (JSON)
 *   server -> binary frame                                    (snapshot delta or keyframe)
 */
import { z } from 'zod';
import { SQUAD_MAX } from '../sim/soldiers';
import type { Order, SquadId } from '../types';

/** Bumped on any wire change (messages or the binary frame layout). */
export const NET_VERSION = 2;
/** Positions go out in 1/QUANT tile steps. */
export const QUANT = 8;
/** Ticks between keyframes (a full frame of what the client sees; deltas in between). */
export const KEYFRAME_EVERY = 50;
/** Vision radius in tiles round each living unit of the team (shared by the alliance). */
export const VISION = 28;
/** Tiles added round the client's camera rect. */
export const CAMERA_MARGIN = 8;
/** Men per squad (M5: SQUAD_MAX) and squads per player. */
export const MAX_SQUAD = SQUAD_MAX;
export const MAX_SQUADS = 3;
/** Live soldier cap per region (W-06), split evenly between the alliances unless quotas are given. */
export const DEFAULT_CAP = 600;
export const ALLIANCES = 4;
/** Biggest client message accepted (bytes). */
export const MAX_CLIENT_MSG = 4096;

const num = z.number().finite();
const id = z.number().int().min(0).max(2 ** 31);

/** The orders a player may send in this slice (squad control, W-08); building and siege come later. */
export const orderSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('move'), squad: id, x: num, y: num }),
  z.object({ kind: z.literal('attack'), squad: id, target: id }),
  z.object({ kind: z.literal('hold'), squad: id }),
  z.object({ kind: z.literal('formation'), squad: id, shape: z.enum(['line', 'column', 'wedge', 'loose']) }),
  z.object({ kind: z.literal('stopWork'), squad: id }),
  z.object({ kind: z.literal('fireArrows'), squad: id, on: z.boolean() }),
  z.object({ kind: z.literal('detach'), squad: id, count: z.number().int().min(1).max(MAX_SQUAD).optional() }),
  z.object({ kind: z.literal('merge'), squad: id, into: id }),
]);
export type NetOrder = z.infer<typeof orderSchema> & Order;

export const clientMsgSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('join'),
    v: z.number().int(),
    region: z.string().regex(/^[a-z0-9_-]{1,40}$/),
    playerId: z.number().int().positive(),
    team: z.number().int().min(0).max(ALLIANCES - 1),
    // M5e: the player's persons by id, one list per squad; exactly one of squads and army
    squads: z.array(z.array(z.string().regex(/^[A-Za-z0-9_-]{1,40}$/)).min(1).max(MAX_SQUAD)).min(1).max(MAX_SQUADS).optional(),
    // dev only (DEV_AUTH=1: load tests): fresh men by class and count
    army: z.array(z.object({ cls: z.string().regex(/^[a-z_]{1,24}$/), count: z.number().int().min(1).max(MAX_SQUAD) })).min(1).max(MAX_SQUADS).optional(),
  }),
  z.object({ t: z.literal('order'), o: orderSchema }),
  z.object({ t: z.literal('view'), x0: num, y0: num, x1: num, y1: num }),
  z.object({ t: z.literal('ping'), c: num }),
]);
export type ClientMsg = z.infer<typeof clientMsgSchema>;
export type JoinMsg = Extract<ClientMsg, { t: 'join' }>;

/** Why a join or an order was turned down. */
export type Refusal = 'version' | 'region' | 'player' | 'team' | 'army' | 'squads' | 'quota';
export type OrderError = 'notOwner' | 'notJoined' | 'badTarget' | 'bad';

export type ServerMsg =
  | { t: 'welcome'; v: number; region: string; you: { id: number; team: number }; squads: SquadId[]; tick: number; quota: Quota }
  /** Over the alliance quota: waits in line (`pos`, 1 = next) and is let in by a welcome once there is room. */
  | { t: 'queued'; reason: 'quota'; pos: number; need: number; quota: Quota }
  | { t: 'refused'; reason: Refusal; detail?: string }
  | { t: 'error'; code: OrderError | 'parse' | 'tooBig'; detail?: string }
  | { t: 'pong'; c: number; tick: number };

/** Live soldiers per alliance against its quota. */
export interface Quota { cap: number; per: number[]; live: number[] }

/** Parse a client text message; null when it is not valid JSON or fails the schema. */
export function parseClientMsg(text: string): ClientMsg | null {
  if (text.length > MAX_CLIENT_MSG) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const r = clientMsgSchema.safeParse(raw);
  return r.success ? (r.data as ClientMsg) : null;
}

/** Per-alliance quotas: `cap` split evenly (the remainder to the first alliances). */
export function splitQuota(cap: number, alliances = ALLIANCES): number[] {
  const base = Math.floor(cap / alliances), extra = cap - base * alliances;
  return Array.from({ length: alliances }, (_, i) => base + (i < extra ? 1 : 0));
}
