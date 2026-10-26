/** Sandbox scenario types (`sandbox.html?scenario=<id>&seed=<n>`): see ./index.ts for the catalogue, ./run.ts for how one is played. */
import type { Behaviour } from '../sim/bots';
import type { BridgeOrder, BuildingType, Order, ResourceKind, SafeRect, TileRect, WallOrder } from '../types';

/** What a squad does as soon as it stands (its id is only known then): a move or an attack-move to (x, y). */
export interface ScenarioGo { kind: 'move' | 'attackMove'; x: number; y: number }

/**
 * A gather order on the region's `res` node nearest (x, y) (./run.ts resolveOrder): node ids are the region's object
 * order, so they shift whenever the region is re-dressed; a point and a kind do not.
 */
export interface GatherNear { kind: 'gatherNear'; squad: number; res: ResourceKind; x: number; y: number }
/**
 * An attack on the region's pre-built `type` piece nearest (x, y) (./run.ts nearestPrebuilt): building ids are the
 * region's pre-built order, so they shift whenever the region is re-dressed; a point and a kind do not.
 */
export interface AttackBuildingNear { kind: 'attackBuildingNear'; squad: number; type: BuildingType; x: number; y: number }
export type ScenarioOrder = Order | GatherNear | AttackBuildingNear;

/** count: at most SQUAD_MAX (the sim clamps it). owner: the spawn's owner (default you / bot); a team-1 squad without a bot and with an owner other than `bot` stands idle. */
export interface ScenarioSquad { team: number; cls: string; count: number; x: number; y: number; bot?: Behaviour; owner?: string;
  /** M5h3, own civilians: the persons' level and profession nodes (src/data/professions.ts ids), set on the sandbox roster. */
  level?: number; nodes?: string[];
  /** An order given the moment it stands (no squad ids to count). */
  go?: ScenarioGo }

/** The dev console's scenario groups (the picker lists them in this order). */
export const GROUPS = ['sandbox', 'movement', 'combat', 'economy', 'building', 'siege', 'mobs', 'bosses', 'civilians', 'fog', 'limits', 'clips'] as const;
export type ScenarioGroup = (typeof GROUPS)[number];
export const GROUP_NAME: Record<ScenarioGroup, string> = {
  sandbox: 'Sandbox', movement: 'Movement', combat: 'Combat', economy: 'Economy', building: 'Building', siege: 'Siege',
  mobs: 'Mobs', bosses: 'Bosses', civilians: 'Civilians', fog: 'Fog & vision', limits: 'Limits', clips: 'Clips & trailer',
};

export interface Scenario {
  id: string;
  name: string;
  goal: string;
  /** The dev console's group (default sandbox) and the "what to check" list shown under the goal. */
  group?: ScenarioGroup;
  check?: string[];
  /** The player's team (default 0; ?team= overrides): own squads of this team are yours, the stock goes to it. */
  team?: number;
  /** The sim seed when the URL names none (default 1). */
  seed?: number;
  /** M7d: the world region it plays on (src/war/regions/<id>.json; default test-ridge). */
  region?: string;
  /** M7d: guardians hurt to this share of their hp at the start (a raid joined late, a phase to look at). */
  bosses?: { boss: string; to: number }[];
  squads: ScenarioSquad[];
  camera: { x: number; y: number; zoom: number };
  /** Neutral play (W-12): spawn the region's lairs (src/war/sim/mobs.ts); no claim anchor, the claim point gives the first. */
  neutral?: true;
  /** Economy start (M2b): claim anchors, own stock, and sites a squad (index into squads) lays out and builds. */
  economy?: {
    claims: { team: number; x: number; y: number; r?: number }[];
    stock?: Partial<Record<ResourceKind, number>>;
    /** Team 1's stockpile (its walls, its siege bots' engines). */
    foeStock?: Partial<Record<ResourceKind, number>>;
    /** Wall lines a squad lays out (before the sites, so stairs and ladders find their wall). */
    walls?: (Omit<WallOrder, 'kind' | 'squad'> & { squad: number; phase?: number })[];
    sites?: { squad: number; type: BuildingType; x: number; y: number; rot?: 0 | 1; phase?: number }[];
    /** Bridges standing at the start: laid out for `team` after the prebuild and done at once. */
    bridges?: (Omit<BridgeOrder, 'kind' | 'squad' | 'team'> & { team: number })[];
    /**
     * Fast-forward up to this many ticks per phase before play, each team's squads building its sites (a standing
     * base): walls and sites go down by `phase` (default 0), each phase built before the next is laid out.
     */
    prebuild?: number;
  };
  /** W-60: souls waiting on the map from the start (src/war/sim/souls.ts; level default 1, site default shrine). */
  souls?: { x: number; y: number; cls: string; level?: number; site?: 'shrine' | 'ruin' | 'battlefield' | 'lair' }[];
  /** W-60: these squads (index into squads) start at this satiety (0..100: below 40 hungry, below 15 starving). */
  hunger?: { squad: number; sat: number }[];
  /** W-60: food or rations into a squad's packs (spread over its men) or, with no squad, the first standing store of yours. */
  food?: { squad?: number; res: 'food' | 'ration'; n: number }[];
  /** M6k: carts standing ready after the prebuild (ids from 0 in this order, after any engine built before). */
  carts?: { team: number; owner: string; type: 'handcart' | 'wagon'; x: number; y: number }[];
  /** M6k: zones merged into the region before the sim starts (RegionData safe, yard, ambush). */
  zones?: { safe?: SafeRect[]; yard?: TileRect[]; ambush?: TileRect[] };
  /**
   * After the prebuild: orders, `settle` ticks stepped at once (squads take post), then more squads (ids go on from
   * `squads`) and the orders `then`.
   */
  after?: {
    orders: ScenarioOrder[]; settle?: number; squads: ScenarioSquad[]; then?: ScenarioOrder[];
    /** Then `settle` more ticks at once (engines get built) and these orders. */
    later?: { settle: number; orders: ScenarioOrder[] };
  };
}
