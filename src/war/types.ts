export type TerrainKind = 'grass' | 'forest' | 'sand' | 'marsh' | 'rock' | 'road' | 'snow' | 'dirt';
export type WaterKind = 0 | 1 | 2; // 0 none, 1 shallow (ford), 2 deep (impassable)
export interface RegionData {
  id: string; name: string; w: number; h: number; // tiles
  height: number[]; terrain: TerrainKind[]; water: WaterKind[]; // row-major, length w*h
  entries: { side: 'N' | 'E' | 'S' | 'W'; x: number; y: number; w: number; h: number }[];
  noBuild: { x: number; y: number; w: number; h: number }[];
  /** Map objects (public/war/objects/objects.json ids) by foot point in tiles; blocking ones close their footprint (src/war/region/objects.ts). */
  objects?: { id: string; x: number; y: number }[];
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
  | { kind: 'formation'; squad: SquadId; shape: 'line' | 'column' | 'wedge' | 'loose' };
export interface UnitSnap { id: UnitId; squad: SquadId; x: number; y: number; facing: number; hp: number; maxHp: number; cls: string; state: 'idle' | 'move' | 'attack' | 'dead'; wounded?: boolean; swing?: number; ready?: number }
// wounded: set on dead units, true = wounded, false = killed. state 'attack' only while striking in reach or shooting in range
// (closing in is 'move'). swing: ticks since the unit's last blow or shot (0 = it landed / was loosed this tick), set while
// 'attack' once it has struck; ready: steps before the one that strikes or shoots next (0 = the next step), if it stays in reach. Play the attack clip once per swing.
export interface SquadSnap { id: SquadId; owner: string; team: number; units: UnitId[]; order: Order['kind'] }
export type MissileKind = 'arrow' | 'stone' | 'javelin';
/**
 * A missile in flight: loosed by unit `by` at tick t0 from (x0,y0) on ground height z0 (levels), lands at (x1,y1)
 * on height z1 on tick t1 (flight t1 - t0 ticks). kind: arrow (bow), stone (sling), javelin.
 */
export interface ShotSnap { x0: number; y0: number; x1: number; y1: number; t0: number; t1: number; z0: number; z1: number; by: UnitId; kind: MissileKind }
export interface Snapshot { tick: number; units: UnitSnap[]; squads: SquadSnap[]; shots?: ShotSnap[] }
export interface WarSim {
  readonly region: RegionData;
  spawnSquad(owner: string, team: number, cls: string, count: number, x: number, y: number): SquadId;
  order(o: Order): void;
  step(): void;               // advance one 10 Hz tick
  snapshot(): Snapshot;
  stats(): { stepMs: number; units: number };
}
export declare function createSim(region: RegionData, seed: number): WarSim; // implemented in src/war/sim/index.ts
