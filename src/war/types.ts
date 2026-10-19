export type TerrainKind = 'grass' | 'forest' | 'sand' | 'marsh' | 'rock' | 'road' | 'snow' | 'dirt';
export type WaterKind = 0 | 1 | 2; // 0 none, 1 shallow (ford), 2 deep (impassable)
export interface RegionData {
  id: string; name: string; w: number; h: number; // tiles
  height: number[]; terrain: TerrainKind[]; water: WaterKind[]; // row-major, length w*h
  entries: { side: 'N' | 'E' | 'S' | 'W'; x: number; y: number; w: number; h: number }[];
  noBuild: { x: number; y: number; w: number; h: number }[];
  /** Map objects (public/war/objects/objects.json ids) by foot point in tiles; blocking ones close their footprint (src/war/region/objects.ts). */
  objects?: { id: string; x: number; y: number; /** Massifs: brightness 0..1 (src/war/region/massifs.ts). */ shade?: number }[];
  /** Tiles closed to movement besides terrain and objects (the ground massifs stand on), as runs [start, length, ...] of row-major indices. */
  blocked?: number[];
  /** Visual-only terrain at 2x the grid (1 m cells), run-length encoded (src/war/regions/visual.ts); the sim ignores it. */
  visual?: { scale: 2; rle: number[] };
  /** Biome per sim tile: index into `names`, run-length encoded (src/war/regions/visual.ts); picks the art library. Visual only. */
  biomes?: { names: string[]; rle: number[] };
}
export type SquadId = number; export type UnitId = number;
export type Order =
  | { kind: 'move'; squad: SquadId; x: number; y: number }
  | { kind: 'attack'; squad: SquadId; target: SquadId }
  | { kind: 'hold'; squad: SquadId }
  | { kind: 'formation'; squad: SquadId; shape: 'line' | 'column' | 'wedge' | 'loose' }
  // M2a economy and building (src/war/sim/works.ts). Ids of nodes and sites come from resourceNodes() / snapshot().buildings.
  // placeBuilding / placeWall: the squad's team (or `team`, with no squad) lays the site(s) out (if checkPlacement / checkWall
  // pass); a squad builds them, without one they stay planned. build: the squad works on any unfinished site of its team
  // (a planned one, one left half done, a damaged one). Each site takes at most snapshot maxWorkers at once (one per work
  // slot round its footprint); the rest of the squad waits nearby. stopWork: the squad drops its gather or build order and holds.
  // cancelSite: an unfinished site goes (it leaves the snapshot), its tiles open, its workers stop; materials still on the way
  // go back to the stockpile in full, those delivered at CANCEL_REFUND (75%). Labour is lost.
  // detach: `unitIds` (living units of the squad) or the last `count` living ones leave as a new squad of the same owner and
  // team, holding where they stand; its id is the next squad id (snapshot squads.length before the tick). At least one unit stays.
  // merge: every unit of `squad` joins `into` (same owner and team) and takes up its order; `squad` is left empty.
  | { kind: 'gather'; squad: SquadId; node: number }
  | { kind: 'build'; squad: SquadId; site: number }
  | { kind: 'placeBuilding'; squad?: SquadId; team?: number; type: BuildingType; x: number; y: number; rot?: 0 | 1 }
  | { kind: 'stopWork'; squad: SquadId }
  | { kind: 'cancelSite'; site: number; squad?: undefined }
  | { kind: 'detach'; squad: SquadId; count?: number; unitIds?: UnitId[] }
  | { kind: 'merge'; squad: SquadId; into: SquadId }
  | WallOrder;
export interface UnitSnap { id: UnitId; squad: SquadId; x: number; y: number; facing: number; hp: number; maxHp: number; cls: string; state: 'idle' | 'move' | 'attack' | 'dead' | 'gather' | 'build'; wounded?: boolean; swing?: number; ready?: number; carry?: ResourceKind; load?: number }
// wounded: set on dead units, true = wounded, false = killed. state 'attack' only while striking in reach or shooting in range
// (closing in is 'move'). 'gather': harvesting at a node; 'build': labouring at a site. carry/load: what and how much it
// carries (set while it has a load, any state: play the carry clip while it walks). swing: ticks since the unit's last blow or shot (0 = it landed / was loosed this tick), set while
// 'attack' once it has struck; ready: steps before the one that strikes or shoots next (0 = the next step), if it stays in reach. Play the attack clip once per swing.
export interface SquadSnap { id: SquadId; owner: string; team: number; units: UnitId[]; order: Order['kind'] }
export type MissileKind = 'arrow' | 'stone' | 'javelin';
/**
 * A missile in flight: loosed by unit `by` at tick t0 from (x0,y0) on ground height z0 (levels), lands at (x1,y1)
 * on height z1 on tick t1 (flight t1 - t0 ticks). kind: arrow (bow), stone (sling), javelin.
 */
export interface ShotSnap { x0: number; y0: number; x1: number; y1: number; t0: number; t1: number; z0: number; z1: number; by: UnitId; kind: MissileKind }
export interface Snapshot {
  tick: number; units: UnitSnap[]; squads: SquadSnap[]; shots?: ShotSnap[];
  buildings?: BuildingSnap[];
  /** Per-team stockpile (team -> resource -> amount). */
  stock?: Record<number, Partial<Record<ResourceKind, number>>>;
  /** Bumped whenever influence() changes: re-read the overlay then. */
  influenceVersion?: number;
}
export interface WarSim {
  readonly region: RegionData;
  spawnSquad(owner: string, team: number, cls: string, count: number, x: number, y: number): SquadId;
  order(o: Order): void;
  step(): void;               // advance one 10 Hz tick
  snapshot(): Snapshot;
  stats(): { stepMs: number; units: number };
}

// --- M2a: resources, gathering, construction (rules: src/war/sim/economy.ts) ---
export type ResourceKind = 'food' | 'wood' | 'stone' | 'marble' | 'copper' | 'tin' | 'iron' | 'bronze' | 'silver' | 'salt';
export type BuildingType =
  | 'camp' | 'storehouse' | 'outpost' | 'fort' | 'barracks' | 'farm' | 'olivePress'
  | 'palisade' | 'stoneWall' | 'woodTower' | 'stoneTower' | 'woodGate' | 'stoneGate';
/** foundation: marked out, materials arriving; scaffold: labour under way (the footprint blocks); damaged: done below half hp. */
export type BuildState = 'foundation' | 'scaffold' | 'done' | 'damaged' | 'destroyed';
export type PlaceReason = 'bounds' | 'noBuild' | 'water' | 'rock' | 'blocked' | 'overlap' | 'influence' | 'slope' | 'node' | 'short';
/** A dragged wall line (flat x,y points, tiles): split into segments; towers and gates (flat x,y) snap onto the line. */
export interface WallOrder { kind: 'placeWall'; squad?: SquadId; team?: number; material: 'wood' | 'stone'; points: number[]; towers?: number[]; gates?: number[] }
/** tiles: the footprint as flat tile x,y. */
export interface PlaceResult { ok: boolean; reason?: PlaceReason; tiles: number[] }
export interface WallPlan { ok: boolean; reason?: PlaceReason; pieces: { type: BuildingType; tiles: number[]; ok: boolean; reason?: PlaceReason }[] }
/**
 * A site or building. x,y: footprint centre (tiles); w,h: footprint after rotation; tiles: flat tile x,y (wall pieces follow
 * the line). progress: labour done 0..1; delivered: materials on site 0..1 (labour never runs ahead of it).
 */
export interface BuildingSnap {
  id: number; type: BuildingType; team: number; x: number; y: number; w: number; h: number; rot: 0 | 1; tiles: number[];
  state: BuildState; progress: number; delivered: number; hp: number; maxHp: number;
  /** Workers holding a work slot now (labouring, hauling or walking to it); most it takes at once. */
  workers: number; maxWorkers: number;
}
/** A gatherable node: a region object (obj = index into region.objects) or a finished farm/press (building = its id). */
export interface NodeSnap { id: number; res: ResourceKind; x: number; y: number; amount: number; max: number; obj?: number; building?: number }
/** Team influence: bit `team` of mask[y*w+x] is set where the team may build. */
export interface InfluenceMap { w: number; h: number; mask: Uint8Array; version: number }
export interface WarBuildSim extends WarSim {
  checkPlacement(team: number, type: BuildingType, x: number, y: number, rot?: 0 | 1): PlaceResult;
  checkWall(team: number, o: Omit<WallOrder, 'kind' | 'squad'>): WallPlan;
  resourceNodes(): NodeSnap[];
  influence(): InfluenceMap;
  /** A claim anchor (claimed region, scenario start): projects influence radius r around (x,y). */
  claim(team: number, x: number, y: number, r?: number): void;
  addStock(team: number, res: ResourceKind, n: number): void;
  damageBuilding(id: number, dmg: number): void;
}
export declare function createSim(region: RegionData, seed: number): WarBuildSim; // implemented in src/war/sim/index.ts
