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
 *                    site, cancelSite, upgrade) act for the player's team. W-53: `o.units` sends it to any of his men
 *                    instead (every id must be his), gathered into one squad first
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
 *   server -> soul                                          W-60: his claim on a soul went through or was refused (his
 *                    army is full)
 *   server -> nodes | influence | stock | fog                 the economy view (./economy.ts): resource nodes his team
 *                    sees (changes only), his team's influence mask (RLE, on change), his team's stockpile (on change)
 *   server -> wild                                          W-65: the region's lairs, claim points and roaming groups (on change)
 *   server -> allies                                        the players whose men are his friends (his alliance, pacts; on change)
 *   server -> binary frame                                   (snapshot delta or keyframe)
 */
import { z } from 'zod';
import { ARMY_MAX } from '../sim/soldiers';
import type { NodeRow } from './economy';
import type { BridgePlan, BuildingType, GoodKind, Order, PlaceResult, SquadId, TownLevelSnap, WallPlan } from '../types';

/** Bumped on any wire change (messages or the binary frame layout). */
export const NET_VERSION = 10;
/** Positions go out in 1/QUANT tile steps. */
export const QUANT = 8;
/** Ticks between keyframes (a full frame of what the client sees; deltas in between). */
export const KEYFRAME_EVERY = 50;
/** W-65: ticks between checks of the region's neutral state for the `wild` message. */
export const WILD_EVERY = 20;
/** Vision radius in tiles round each living unit of the team (shared by the alliance). */
export const VISION = 28;
/** Tiles added round the client's camera rect. */
export const CAMERA_MARGIN = 8;
/** Men per squad (the whole army, ARMY_MAX) and squads per player. */
export const MAX_SQUAD = ARMY_MAX;
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
  'house', 'cottage', 'tent', 'temple', 'shrine', 'stoa', 'statue', 'well', 'jetty', 'warehouse', 'board', 'cache', 'tunnel'] as const satisfies readonly BuildingType[];
const rot = z.union([z.literal(0), z.literal(1)]).optional();
/** Every good (src/war/types.ts ResourceKind). */
export const GOODS = ['food', 'wood', 'stone', 'marble', 'copper', 'tin', 'iron', 'bronze', 'silver', 'salt', 'pitch', 'hides', 'flax', 'herbs', 'charcoal', 'leather', 'linen', 'oil', 'coin',
  // M7e rare goods
  'dragonbone', 'nereidPearl', 'starIron', 'asphodel', 'titanBronze', 'obsidian',
  // W-60: the cookhouse's ration
  'ration'] as const satisfies readonly GoodKind[];
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

/** W-53: an order to these men of the player's (any of his squads), gathered into one squad first (src/war/types.ts Order). */
const U = { units: z.array(id).min(1).max(MAX_SQUAD * (MAX_SQUADS + 1)).optional() };
/**
 * The orders a player may send (W-08 squad control, M2 work and building, M2c siege, M5c actives, M5f civilians). The
 * room checks the squad is the player's own; squad-less site orders act for the player's team; the sim checks the rest
 * (placement, stock, engine team, targets) as it does for a local player.
 */
export const orderSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('move'), squad: id, ...U, x: num, y: num }),
  z.object({ kind: z.literal('attack'), squad: id, ...U, target: id }),
  z.object({ kind: z.literal('hold'), squad: id, ...U }),
  z.object({ kind: z.literal('attackMove'), squad: id, ...U, x: num, y: num }),
  z.object({ kind: z.literal('stop'), squad: id, ...U }),
  z.object({ kind: z.literal('formation'), squad: id, ...U, shape: z.enum(['line', 'column', 'wedge', 'loose']) }),
  z.object({ kind: z.literal('stopWork'), squad: id, ...U }),
  z.object({ kind: z.literal('fireArrows'), squad: id, ...U, on: z.boolean() }),
  z.object({ kind: z.literal('detach'), squad: id, ...U, count: z.number().int().min(1).max(MAX_SQUAD).optional(), unitIds: z.array(id).min(1).max(MAX_SQUAD).optional() }),
  z.object({ kind: z.literal('merge'), squad: id, ...U, into: id }),
  z.object({ kind: z.literal('active'), squad: id, ...U }),
  // micro: one man of the squad falls back, swaps to its rear rank or rejoins (never with `units`: he stays in it)
  z.object({ kind: z.literal('man'), squad: id, unit: id, act: z.enum(['fallBack', 'rear', 'rejoin']) }),
  // work and building
  z.object({ kind: z.literal('gather'), squad: id, ...U, node: id }),
  z.object({ kind: z.literal('build'), squad: id, ...U, site: id }),
  z.object({ kind: z.literal('civWork'), squad: id, ...U, building: id }),
  z.object({ kind: z.literal('placeBuilding'), squad: id.optional(), ...U, type: z.enum(BUILDING_TYPES), x: num, y: num, rot }),
  z.object({ kind: z.literal('placeWall'), squad: id.optional(), ...U, material: z.enum(['wood', 'timber', 'stone']), points: pts(32), towers: pts(16).optional(), gates: pts(16).optional(), inside: pts(1).optional() }),
  z.object({ kind: z.literal('placeBridge'), squad: id.optional(), ...U, material: z.enum(['wood', 'stone']), points: pts(2), width: z.number().int().min(1).max(3).optional() }),
  z.object({ kind: z.literal('upgrade'), building: id, squad: id.optional(), ...U }),
  z.object({ kind: z.literal('cancelSite'), site: id }),
  // tear down a finished building of the player's team (a quarter of its materials back; the sim checks the rest)
  z.object({ kind: z.literal('demolish'), building: id }),
  z.object({ kind: z.literal('claimRegion'), squad: id, ...U, point: id }),
  // W-60: walk to soul `soul` and claim him (the room's gate: fewer than ARMY_MAX men across all regions)
  z.object({ kind: z.literal('claimSoul'), squad: id, ...U, soul: id }),
  // M7a: mend a damaged building of the player's team; rebuild a ruin on its ground
  z.object({ kind: z.literal('repairBuilding'), squad: id, ...U, building: id }),
  z.object({ kind: z.literal('rebuild'), building: id, squad: id.optional(), ...U }),
  // M5h crafting: queue a recipe at (or cancel an order of) a workplace of the player's team; repair and salvage carry a
  // stash item and come from the server (M5h4)
  z.object({ kind: z.literal('craft'), building: id, recipe: z.string().regex(/^[a-z_]+(:[a-z0-9_]+)?$/).max(48) }),
  z.object({ kind: z.literal('cancelCraft'), building: id, order: id }),
  // M5h3 Fortifier: iron-bind a gate or hang wet hides on a done building of the player's team (the sim checks the node)
  z.object({ kind: z.literal('fortify'), building: id, fort: z.enum(['ironGate', 'wetHides']) }),
  // siege
  z.object({ kind: z.literal('buildSiege'), squad: id, ...U, type: z.enum(['ram', 'stoneThrower', 'siegeLadder', 'mantlet', 'coveredRam', 'oxybeles', 'siegeTower']), x: num, y: num }),
  z.object({ kind: z.literal('crew'), squad: id, ...U, siege: id }),
  z.object({ kind: z.literal('uncrew'), squad: id, ...U }),
  z.object({ kind: z.literal('deploy'), squad: id, ...U, pack: z.boolean().optional() }),
  z.object({ kind: z.literal('raiseLadder'), squad: id, ...U, wallTile: pts(1).refine((a) => a.length === 2, 'one tile') }),
  z.object({ kind: z.literal('pushLadder'), squad: id, ...U, ladder: id }),
  z.object({ kind: z.literal('attackBuilding'), squad: id, ...U, ...target }).refine(oneTarget, 'building or siege'),
  z.object({ kind: z.literal('ignite'), squad: id, ...U, ...target }).refine(oneTarget, 'building or siege'),
  z.object({ kind: z.literal('extinguish'), squad: id, ...U, ...target }).refine(oneTarget, 'building or siege'),
  // M6 trade (src/war/sim/trade.ts): porters and carts load from and unload into holders, escort a cart, a smith breaks
  // up a pile's item; the room checks the holder exists and the squad may use it, the sim the rest
  z.object({ kind: z.literal('load'), squad: id, ...U, from: holderRef, res: goodSchema.optional(), n: amount.optional() }),
  z.object({ kind: z.literal('unload'), squad: id, ...U, to: holderRef, res: goodSchema.optional() }),
  z.object({ kind: z.literal('escort'), squad: id, ...U, cart: id }),
  z.object({ kind: z.literal('salvagePile'), squad: id, ...U, pile: id, uid: z.string().min(1).max(120) }),
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
    goods: z.partialRecord(goodSchema, amount).optional(), uids: z.array(z.string().min(1).max(120)).max(20).optional(), contract: id.optional(),
  }).refine((o) => (o.squad === undefined) !== (o.cart === undefined), 'squad or cart').refine((o) => (o.site === 'contract') === (o.contract !== undefined), 'a contract site names its contract'),
  // M6g: the hand-off window with player `with` (both here, carriers within 4 tiles): offer (or change) my half, confirm, cancel
  z.object({
    t: z.literal('handoff'), op: z.enum(['offer', 'confirm', 'cancel']), with: z.number().int().positive(),
    squad: id.optional(), cart: id.optional(), goods: z.partialRecord(goodSchema, amount).optional(), uids: z.array(z.string().min(1).max(120)).max(20).optional(),
  }).refine((o) => o.op !== 'offer' || (o.squad === undefined) !== (o.cart === undefined), 'an offer names its squad or cart'),
  // W-62: the first-hour guide: hide it for good (the tracker's ×)
  z.object({ t: z.literal('guide'), op: z.literal('hide') }),
  // W-65: a choice at the open choice step of the region's story (src/war/sim/stories.ts)
  z.object({ t: z.literal('story'), op: z.literal('choose'), option: z.string().regex(/^[a-z0-9_-]{1,32}$/) }),
  // W-65: a choice at the open random encounter (src/war/sim/encounters.ts)
  z.object({ t: z.literal('encounter'), op: z.literal('choose'), option: z.string().regex(/^[a-z0-9_-]{1,32}$/) }),
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
/** notYourGround (W-63): a build inside a settlement off the player's plot (its lord: on another's plot); the detail says why. */
/** atPeace (W-64): a claim on a point held by an alliance his own has a pact or truce with; the detail says which. */
export type OrderError = 'notOwner' | 'notJoined' | 'badTarget' | 'bad' | 'forbidden' | 'notYourGround' | 'atPeace';

/**
 * W-63: a settlement of the region as its room sends it (server/src/war/settlements.ts): its centre piece and ground
 * (x, y, r), its lord (player id, name) and the alliance whose banner it flies (team; null: the lord serves none),
 * town level, overlord settlement, citizens' plots (inclusive tile rects) and the receiving player's role there.
 */
export interface SettlementNet {
  id: number; centre: number; x: number; y: number; r: number; name: string; lord: number; lordName: string; team: number | null;
  level: number; overlord: number | null; tribute: number;
  plots: { pid: number; x0: number; y0: number; x1: number; y1: number }[];
  role: 'lord' | 'citizen' | 'garrison' | null;
}

export type ServerMsg =
  | { t: 'welcome'; v: number; region: string; you: { id: number; team: number }; squads: SquadId[]; tick: number; quota: Quota }
  /** Over the alliance quota: waits in line (`pos`, 1 = next) and is let in by a welcome once there is room. */
  | { t: 'queued'; reason: 'quota'; pos: number; need: number; quota: Quota }
  | { t: 'refused'; reason: Refusal; detail?: string }
  | { t: 'error'; code: OrderError | 'parse' | 'tooBig'; detail?: string }
  /**
   * `ms`: the region loop's mean tick time over its last ticks (the network readout, ../view/hud/netStats.ts); `idle`:
   * no armies stand here or the loop rests (no snapshots is then no stall).
   */
  | { t: 'pong'; c: number; tick: number; ms?: number; idle?: boolean }
  | { t: 'checked'; id: number; result: PlaceResult | WallPlan | BridgePlan | null }
  /** M6f: a stow went through: what moved (goods by good, item count) and what did not fit (left where it was). */
  | { t: 'stowed'; dir: 'in' | 'out'; site: string; goods: Record<string, number>; items: number; left?: Record<string, number> }
  /** M6g: the hand-off window with `with`: open (halves by player, who confirmed, until tick), done, or closed (`why`). */
  | { t: 'handoff'; with: number; state: 'open' | 'done' | 'closed'; halves?: Record<number, { goods: Record<string, number>; uids: string[] }>; ok?: number[]; until?: number; why?: string }
  /** Resource nodes his team sees that changed (packed rows, ./economy.ts), and ids gone. */
  | { t: 'nodes'; rows: NodeRow[]; gone?: number[] }
  /** His team's influence: bit `team` of the w x h mask as alternating runs (outside first); v the sim's version. */
  | { t: 'influence'; team: number; w: number; h: number; v: number; runs: number[] }
  /** W-39: his team's fog of war, w x h cells of `cell` tiles as [state, count] runs (./economy.ts encodeFog), on change; v the grid's version. */
  | { t: 'fog'; team: number; w: number; h: number; cell: number; v: number; runs: number[] }
  /** W-60: the store his men stand next to (building id; null: none within STORE_NEAR) and its goods, whole units, when either changed. Never a team total. */
  | { t: 'stock'; team: number; store: number | null; goods: Record<string, number> }
  /** W-61: his team's town level here (Snapshot.townLevels; null: none), when it changed. */
  | { t: 'town'; team: number; town: TownLevelSnap | null }
  /**
   * W-65: the region's neutral state (Snapshot.lairs and claims: authored places, their state and squad ids), on join
   * and when it changed (checked every WILD_EVERY ticks). The live view drew no lair, claim banner or map mark without it.
   */
  | { t: 'wild'; lairs: import('../types').LairSnap[]; claims: import('../types').ClaimSnap[]; roam?: import('../types').RoamSnap[] }
  /**
   * W-60: a soul his squad went for: claimed (the new man's person id, class, level and name), refused (his army is full:
   * `have` men across all regions, ARMY_MAX at most).
   */
  | { t: 'soul'; state: 'claimed' | 'refused'; soul: number; squad: SquadId; pid?: string; cls?: string; level?: number; name?: string; have?: number }
  /** W-62: the world events running now (any region; src/war/world/events.ts) and the next, on join and whenever one opens or closes. */
  | { t: 'worldEvents'; events: import('../world/events').WorldEvent[]; next: import('../world/events').WorldEvent | null }
  /**
   * W-62: his first-hour guide in his home region (./guide.ts): the steps done, hidden for good; `step`: the one just
   * done, `paid`: its reward is in his strongroom (a soul step with a full army closes unpaid). Sent on his join and
   * with each step.
   */
  | { t: 'guide'; done: string[]; hidden?: true; step?: string; paid?: true }
  /**
   * W-65: his progress in this region's story (src/war/sim/stories.ts StorySave), on his join and whenever it moves;
   * `notes`: what just happened (begun, a step done with its reward, the chain done), for the banners.
   */
  | { t: 'story'; save: import('../sim/stories').StorySave; notes?: import('../sim/stories').StoryNote[] }
  /**
   * W-65: his random encounters here (src/war/sim/encounters.ts EncSave), on his join and whenever one moves; `notes`:
   * what just happened (one sprang, a step done or a choice made with its reward, it ended or lapsed), for the banners.
   */
  | { t: 'encounter'; save: import('../sim/encounters').EncSave; notes?: import('../sim/encounters').EncNote[] }
  /** W-63: the region's settlements (SettlementNet), on his join and whenever one changes. */
  | { t: 'settlements'; list: SettlementNet[] }
  /**
   * The other players here whose men are his friends: his alliance's, and those of an alliance at peace with his (a pact
   * or truce in force). On join and when it changed (checked every WILD_EVERY ticks); their men get yellow bars.
   */
  | { t: 'allies'; players: number[] }
  /** The online cap (./gate.ts): not from the region socket, the gate's state passed on by ./client.ts. */
  | import('./gate').GateMsg;

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
