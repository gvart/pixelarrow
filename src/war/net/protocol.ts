/**
 * Live region protocol (M3, docs/impl/global-war-rebuild.md W-05..W-07): one WebSocket per player to the region's
 * WarRegionDO (server/src/war/). Server-authoritative: the client only sends the messages below (JSON text, zod-checked);
 * the server answers with JSON control messages (ServerMsg) and sends the world as binary delta snapshots (./codec.ts),
 * filtered to what the client may see (./interest.ts).
 *
 *   client -> join   { t, v, region, playerId, team, squads } once to enter; again to bring more squads (same team).
 *                    squads: person ids (D1 war_persons, M5e) per squad; the server loads and spawns them. `army`
 *                    (class + count) instead is a dev-only join (the server allows it only with DEV_AUTH=1).
 *   client -> order  { t, o }                                 an Order for one of the player's own squads (squad control,
 *                    work, building, walls, bridges, upgrades, siege, civilians, actives); squad-less orders (a planned
 *                    site, cancelSite, upgrade) act for the player's team
 *   client -> check  { t, id, ... }                            a placement check for the player's team -> checked
 *   client -> mend   { t, kind, building, uid }                M5h4: repair or salvage stash item `uid` at a workplace of
 *                    the player's team (the server loads the item; queue state rides on BuildingSnap.queue)
 *                    M6: load / unload / escort / salvagePile for his own squads (holders checked by the room)
 *   client -> stow   { t, dir, site, squad|cart, goods?, uids? }  M6f: goods between his packs or cart and his stall,
 *                    warehouse (in a market court) or home strongroom (at home) -> stowed | error
 *                    site `contract` (+ contract id): a carry's sealed loads out at A, a carry or supply delivered at B
 *   client -> handoff { t, op, with, squad|cart, goods?, uids? }  M6g: the hand-off window with another player here
 *                    (offer my half, confirm, cancel) -> handoff to both
 *   client -> dev    { t, op, ... }                           DEV_AUTH=1 only (refused `forbidden` otherwise): the dev
 *                    panel's helpers for the player's team: stock (goods into the home strongroom), claim (an influence
 *                    anchor), spawn (a squad of any class and team at a point; his own team's is his), skip (ticks at once)
 *   client -> view   { t, x0, y0, x1, y1 }                    camera rect in tiles (interest management)
 *   client -> ping   { t, c }
 *   server -> welcome | refused | queued | error | pong | checked   (JSON)
 *   server -> nodes | influence                               the economy view (./economy.ts): resource nodes his team
 *                    sees (changes only), his team's influence mask (RLE, on change)
 *   server -> binary frame                                    (snapshot delta or keyframe)
 */
import { z } from 'zod';
import { SQUAD_MAX } from '../sim/soldiers';
import type { NodeRow } from './economy';
import type { BridgePlan, BuildingType, Order, PlaceResult, ResourceKind, SquadId, WallPlan } from '../types';

/** Bumped on any wire change (messages or the binary frame layout). */
export const NET_VERSION = 8;
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
/** Flat x,y tile points of a wall or bridge drag (and its towers, gates, inside point). */
const pts = (max: number) => z.array(num).max(max * 2).refine((a) => a.length % 2 === 0, 'x,y pairs');
const BUILDING_TYPES = ['camp', 'storehouse', 'outpost', 'fort', 'barracks', 'farm', 'olivePress', 'palisade', 'rampart', 'stoneWall', 'woodStairs', 'stoneStairs', 'ladder', 'woodTower', 'stoneTower', 'woodGate', 'stoneGate', 'woodBridge', 'stoneBridge', 'brazier', 'pitchKiln',
  // M5h workplaces (L2/L3 come by upgrade; listed for checks of every type)
  'forge', 'forge2', 'forge3', 'cookhouse', 'cookhouse2', 'cookhouse3', 'infirmary', 'infirmary2', 'infirmary3', 'workshop', 'workshop2', 'workshop3', 'stall', 'stall2', 'stall3', 'sortingFloor', 'sortingFloor2', 'chest',
  // M5h3 Fortifier field tiles; towerBridge (listed for checks: the sim never places one)
  'stakes', 'ditch', 'towerBridge',
  // M7a pre-built pieces (listed for checks: only the region places them)
  'house', 'cottage', 'tent', 'temple', 'shrine', 'stoa', 'statue', 'well', 'jetty', 'warehouse', 'board', 'cache'] as const satisfies readonly BuildingType[];
const rot = z.union([z.literal(0), z.literal(1)]).optional();
/** Every good (src/war/types.ts ResourceKind). */
export const GOODS = ['food', 'wood', 'stone', 'marble', 'copper', 'tin', 'iron', 'bronze', 'silver', 'salt', 'pitch', 'hides', 'flax', 'herbs', 'charcoal', 'leather', 'linen', 'oil', 'coin',
  // M7e rare goods
  'dragonbone', 'nereidPearl', 'starIron', 'asphodel', 'titanBronze', 'obsidian'] as const satisfies readonly ResourceKind[];
export const goodSchema = z.enum(GOODS);
/** M6: one holder on the field: a store or chest (building), a cart, a loot pile. */
const holderRef = z
  .object({ building: id.optional(), cart: id.optional(), pile: id.optional() })
  .strict()
  .refine((o) => [o.building, o.cart, o.pile].filter((x) => x !== undefined).length === 1, 'one holder');
const amount = z.number().finite().positive().max(1e6);
/** building or siege target: exactly one. */
const target = { building: id.optional(), siege: id.optional() };
const oneTarget = (o: { building?: number; siege?: number }) => (o.building === undefined) !== (o.siege === undefined);

/**
 * The orders a player may send (W-08 squad control, M2 work and building, M2c siege, M5c actives, M5f civilians). The
 * room checks the squad is the player's own; squad-less site orders act for the player's team; the sim checks the rest
 * (placement, stock, engine team, targets) as it does for a local player.
 */
export const orderSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('move'), squad: id, x: num, y: num }),
  z.object({ kind: z.literal('attack'), squad: id, target: id }),
  z.object({ kind: z.literal('hold'), squad: id }),
  z.object({ kind: z.literal('attackMove'), squad: id, x: num, y: num }),
  z.object({ kind: z.literal('stop'), squad: id }),
  z.object({ kind: z.literal('formation'), squad: id, shape: z.enum(['line', 'column', 'wedge', 'loose']) }),
  z.object({ kind: z.literal('stopWork'), squad: id }),
  z.object({ kind: z.literal('fireArrows'), squad: id, on: z.boolean() }),
  z.object({ kind: z.literal('detach'), squad: id, count: z.number().int().min(1).max(MAX_SQUAD).optional(), unitIds: z.array(id).min(1).max(MAX_SQUAD).optional() }),
  z.object({ kind: z.literal('merge'), squad: id, into: id }),
  z.object({ kind: z.literal('active'), squad: id }),
  // work and building
  z.object({ kind: z.literal('gather'), squad: id, node: id }),
  z.object({ kind: z.literal('build'), squad: id, site: id }),
  z.object({ kind: z.literal('civWork'), squad: id, building: id }),
  z.object({ kind: z.literal('placeBuilding'), squad: id.optional(), type: z.enum(BUILDING_TYPES), x: num, y: num, rot }),
  z.object({ kind: z.literal('placeWall'), squad: id.optional(), material: z.enum(['wood', 'timber', 'stone']), points: pts(32), towers: pts(16).optional(), gates: pts(16).optional(), inside: pts(1).optional() }),
  z.object({ kind: z.literal('placeBridge'), squad: id.optional(), material: z.enum(['wood', 'stone']), points: pts(2), width: z.number().int().min(1).max(3).optional() }),
  z.object({ kind: z.literal('upgrade'), building: id, squad: id.optional() }),
  z.object({ kind: z.literal('cancelSite'), site: id }),
  z.object({ kind: z.literal('claimRegion'), squad: id, point: id }),
  // M7a: mend a damaged building of the player's team; rebuild a ruin on its ground
  z.object({ kind: z.literal('repairBuilding'), squad: id, building: id }),
  z.object({ kind: z.literal('rebuild'), building: id, squad: id.optional() }),
  // M5h crafting: queue a recipe at (or cancel an order of) a workplace of the player's team; repair and salvage carry a
  // stash item and come from the server (M5h4)
  z.object({ kind: z.literal('craft'), building: id, recipe: z.string().regex(/^[a-z_]+(:[a-z0-9_]+)?$/).max(48) }),
  z.object({ kind: z.literal('cancelCraft'), building: id, order: id }),
  // M5h3 Fortifier: iron-bind a gate or hang wet hides on a done building of the player's team (the sim checks the node)
  z.object({ kind: z.literal('fortify'), building: id, fort: z.enum(['ironGate', 'wetHides']) }),
  // siege
  z.object({ kind: z.literal('buildSiege'), squad: id, type: z.enum(['ram', 'stoneThrower', 'siegeLadder', 'mantlet', 'coveredRam', 'oxybeles', 'siegeTower']), x: num, y: num }),
  z.object({ kind: z.literal('crew'), squad: id, siege: id }),
  z.object({ kind: z.literal('uncrew'), squad: id }),
  z.object({ kind: z.literal('deploy'), squad: id, pack: z.boolean().optional() }),
  z.object({ kind: z.literal('raiseLadder'), squad: id, wallTile: pts(1).refine((a) => a.length === 2, 'one tile') }),
  z.object({ kind: z.literal('pushLadder'), squad: id, ladder: id }),
  z.object({ kind: z.literal('attackBuilding'), squad: id, ...target }).refine(oneTarget, 'building or siege'),
  z.object({ kind: z.literal('ignite'), squad: id, ...target }).refine(oneTarget, 'building or siege'),
  z.object({ kind: z.literal('extinguish'), squad: id, ...target }).refine(oneTarget, 'building or siege'),
  // M6 trade (src/war/sim/trade.ts): porters and carts load from and unload into holders, escort a cart, a smith breaks
  // up a pile's item; the room checks the holder exists and the squad may use it, the sim the rest
  z.object({ kind: z.literal('load'), squad: id, from: holderRef, res: goodSchema.optional(), n: amount.optional() }),
  z.object({ kind: z.literal('unload'), squad: id, to: holderRef, res: goodSchema.optional() }),
  z.object({ kind: z.literal('escort'), squad: id, cart: id }),
  z.object({ kind: z.literal('salvagePile'), squad: id, pile: id, uid: z.string().min(1).max(120) }),
]);
/** A sim order as it comes over the wire: the room fills in `team` for squad-less orders (the player's team). */
type Teamless<O> = O extends { team: number } ? Omit<O, 'team'> & { team?: number } : O;
export type NetOrder = z.infer<typeof orderSchema> & Teamless<Order>;

/** A placement check for the player's team (the build UI's live preview), answered by `checked` with the same id. */
export const checkSchema = z.discriminatedUnion('kind', [
  z.object({ t: z.literal('check'), id: id, kind: z.literal('building'), type: z.enum(BUILDING_TYPES), x: num, y: num, rot }),
  z.object({ t: z.literal('check'), id: id, kind: z.literal('wall'), material: z.enum(['wood', 'timber', 'stone']), points: pts(32), towers: pts(16).optional(), gates: pts(16).optional(), inside: pts(1).optional() }),
  z.object({ t: z.literal('check'), id: id, kind: z.literal('bridge'), material: z.enum(['wood', 'stone']), points: pts(2), width: z.number().int().min(1).max(3).optional() }),
]);
export type CheckMsg = z.infer<typeof checkSchema>;

const baseMsgSchema = z.discriminatedUnion('t', [
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
  z.object({ t: z.literal('mend'), kind: z.enum(['repair', 'salvage']), building: id, uid: z.string().min(1).max(120) }),
  // M6f: goods and items between the player's squad packs (or his cart) and his site here: his stall or warehouse in
  // a market town's court, his home strongroom at home; `in` from the field into the site, `out` back
  z.object({
    t: z.literal('stow'), dir: z.enum(['in', 'out']), site: z.enum(['stall', 'warehouse', 'strongroom', 'contract']), squad: id.optional(), cart: id.optional(),
    goods: z.record(goodSchema, amount).optional(), uids: z.array(z.string().min(1).max(120)).max(20).optional(), contract: id.optional(),
  }).refine((o) => (o.squad === undefined) !== (o.cart === undefined), 'squad or cart').refine((o) => (o.site === 'contract') === (o.contract !== undefined), 'a contract site names its contract'),
  // M6g: the hand-off window with player `with` (both here, carriers within 4 tiles): offer (or change) my half, confirm, cancel
  z.object({
    t: z.literal('handoff'), op: z.enum(['offer', 'confirm', 'cancel']), with: z.number().int().positive(),
    squad: id.optional(), cart: id.optional(), goods: z.record(goodSchema, amount).optional(), uids: z.array(z.string().min(1).max(120)).max(20).optional(),
  }).refine((o) => o.op !== 'offer' || (o.squad === undefined) !== (o.cart === undefined), 'an offer names its squad or cart'),
]);
/** Dev helpers (the F1 panel); the region refuses them unless the server runs with DEV_AUTH=1. */
export const devSchema = z.discriminatedUnion('op', [
  z.object({ t: z.literal('dev'), op: z.literal('stock'), res: goodSchema, n: amount }),
  z.object({ t: z.literal('dev'), op: z.literal('claim'), x: num, y: num, r: z.number().positive().max(64).optional() }),
  z.object({ t: z.literal('dev'), op: z.literal('spawn'), team: z.number().int().min(0).max(ALLIANCES - 1), cls: z.string().regex(/^[a-z_]{1,24}$/), count: z.number().int().min(1).max(MAX_SQUAD), x: num, y: num }),
  z.object({ t: z.literal('dev'), op: z.literal('skip'), ticks: z.number().int().min(1).max(600) }),
]);
export type DevMsg = z.infer<typeof devSchema>;

export const clientMsgSchema = z.union([baseMsgSchema, checkSchema, devSchema]);
export type ClientMsg = z.infer<typeof baseMsgSchema> | CheckMsg | DevMsg;
export type JoinMsg = Extract<ClientMsg, { t: 'join' }>;
export type MendMsg = Extract<ClientMsg, { t: 'mend' }>;
export type StowMsg = Extract<ClientMsg, { t: 'stow' }>;
export type HandoffMsg = Extract<ClientMsg, { t: 'handoff' }>;

/** Why a join or an order was turned down. */
export type Refusal = 'version' | 'region' | 'player' | 'team' | 'army' | 'squads' | 'quota';
export type OrderError = 'notOwner' | 'notJoined' | 'badTarget' | 'bad' | 'forbidden';

export type ServerMsg =
  | { t: 'welcome'; v: number; region: string; you: { id: number; team: number }; squads: SquadId[]; tick: number; quota: Quota }
  /** Over the alliance quota: waits in line (`pos`, 1 = next) and is let in by a welcome once there is room. */
  | { t: 'queued'; reason: 'quota'; pos: number; need: number; quota: Quota }
  | { t: 'refused'; reason: Refusal; detail?: string }
  | { t: 'error'; code: OrderError | 'parse' | 'tooBig'; detail?: string }
  | { t: 'pong'; c: number; tick: number }
  | { t: 'checked'; id: number; result: PlaceResult | WallPlan | BridgePlan | null }
  /** M6f: a stow went through: what moved (goods by good, item count) and what did not fit (left where it was). */
  | { t: 'stowed'; dir: 'in' | 'out'; site: string; goods: Record<string, number>; items: number; left?: Record<string, number> }
  /** M6g: the hand-off window with `with`: open (halves by player, who confirmed, until tick), done, or closed (`why`). */
  | { t: 'handoff'; with: number; state: 'open' | 'done' | 'closed'; halves?: Record<number, { goods: Record<string, number>; uids: string[] }>; ok?: number[]; until?: number; why?: string }
  /** Resource nodes his team sees that changed (packed rows, ./economy.ts), and ids gone. */
  | { t: 'nodes'; rows: NodeRow[]; gone?: number[] }
  /** His team's influence: bit `team` of the w x h mask as alternating runs (outside first); v the sim's version. */
  | { t: 'influence'; team: number; w: number; h: number; v: number; runs: number[] };

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
