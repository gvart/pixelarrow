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
  /** Neutral fauna (W-12, src/war/sim/mobs.ts): a lair or camp of one mob kind at (x,y), its pack size (default per kind). */
  lairs?: { kind: MobKind; x: number; y: number; count?: number }[];
  /** Region claim banners: open once every guard lair of `lairs` (indices into lairs) is cleared; r: influence radius once claimed. */
  claimPoints?: { x: number; y: number; lairs: number[]; r?: number }[];
}
export type MobKind = 'wolf' | 'boar' | 'bear' | 'bandit' | 'jackal' | 'ibex';
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
  // placeBuilding of an access piece (W-28): woodStairs (1x2) / stoneStairs (1x3) must run straight into the inside face of
  // the team's walkway wall (rampart, stoneWall) with open ground below their foot, else reason 'attach'; a ladder (1x1) goes
  // beside any walkway wall or tower, any team's (no influence needed: attackers scale foe walls). Towers stand anywhere.
  | { kind: 'placeBuilding'; squad?: SquadId; team?: number; type: BuildingType; x: number; y: number; rot?: 0 | 1 }
  | { kind: 'stopWork'; squad: SquadId }
  | { kind: 'cancelSite'; site: number; squad?: undefined }
  | { kind: 'detach'; squad: SquadId; count?: number; unitIds?: UnitId[] }
  | { kind: 'merge'; squad: SquadId; into: SquadId }
  // upgrade (W-27): a finished wall piece of the team becomes a site for its next tier in place (palisade -> rampart ->
  // stoneWall, woodTower -> stoneTower, woodGate -> stoneGate); the old piece keeps standing (blocking, its walkway open)
  // until the new tier is done (palisade -> rampart grows the inner row). With a squad it builds it, without one (`team`) it stays planned. cancelSite reverts it.
  | { kind: 'upgrade'; building: number; squad?: SquadId; team?: number }
  // claimRegion (W-12, src/war/sim/mobs.ts): the squad walks to claim point `point` (index into region.claimPoints) and
  // channels there; dropped unless the point is unowned and its zone's guard lairs are cleared.
  | { kind: 'claimRegion'; squad: SquadId; point: number }
  | WallOrder
  | BridgeOrder
  | SiegeOrder;
// --- M2c siege (src/war/sim/siege.ts, fire and breaches in works.ts; docs/impl/global-war-rebuild.md W-29) ---
export type SiegeType = 'ram' | 'stoneThrower' | 'siegeLadder';
/**
 * buildSiege: the team pays the engine's cost from its stockpile at once (SIEGE in siege.ts) and the squad builds it at
 * (x,y) on open ground (labour like a site); it then stands idle, uncrewed. crew: the squad becomes the engine's crew (it
 * needs SIEGE.crew living men beside it to move or work; extra men follow it); move / hold / attackBuilding / deploy /
 * raiseLadder sent to a crewing squad drive its engine; any other order (or uncrew) leaves the engine where it stands.
 * attackBuilding: a ram rolls up to the building and batters it; a stone thrower closes into range, deploys and shoots;
 * a squad with no engine hacks at it (melee, weak) or shoots it (arrows: next to nothing, but fire arrows set wood alight).
 * `siege` instead of `building`: the target is an enemy engine. deploy: a stone thrower sets up where it stands (pack: packs
 * up to move again; a move order packs it first). raiseLadder: a crewed siege ladder is carried to the foot of the enemy
 * walkway wall or tower tile `wallTile` (flat x,y) on its outer face and raised: a ladder building of the crew's team
 * (BuildingSnap siege) joins the ground to that deck while it stands. pushLadder: defenders on the deck beside a foe
 * ladder push it off (takes time; climbers on it fall). ignite: men with torches walk up to a wood building or engine and
 * set it burning (stone does not burn); extinguish: they beat out the fire (slow). fireArrows: archers loose fire arrows
 * (slower reload) that set wood alight where they land; W-35: only a man within BRAZIER.radius of a lit brazier of his team
 * does, and each fire arrow takes BRAZIER.pitch from the stockpile; else plain arrows (SquadSnap.fireArrows.reason).
 */
export type SiegeOrder =
  | { kind: 'buildSiege'; squad: SquadId; type: SiegeType; x: number; y: number }
  | { kind: 'crew'; squad: SquadId; siege: number }
  | { kind: 'uncrew'; squad: SquadId }
  | { kind: 'deploy'; squad: SquadId; pack?: boolean }
  | { kind: 'attackBuilding'; squad: SquadId; building?: number; siege?: number }
  | { kind: 'raiseLadder'; squad: SquadId; wallTile: number[] }
  | { kind: 'pushLadder'; squad: SquadId; ladder: number }
  | { kind: 'ignite'; squad: SquadId; building?: number; siege?: number }
  | { kind: 'extinguish'; squad: SquadId; building?: number; siege?: number }
  | { kind: 'fireArrows'; squad: SquadId; on: boolean };
/**
 * building: under construction (progress = labour 0..1); idle: built, standing; move: rolling or carried; deploying /
 * packing: a stone thrower setting up or packing (progress 0..1); deployed: set up, stationary; attack: battering (ram) or
 * shooting (thrower) its target; raising: a ladder going up (progress 0..1); raised: the ladder stands (`ladder`: its ladder
 * building, draw that and not the engine); destroyed: wreck.
 */
export type SiegeState = 'building' | 'idle' | 'move' | 'deploying' | 'deployed' | 'packing' | 'attack' | 'raising' | 'raised' | 'destroyed';
export interface SiegeSnap {
  id: number; type: SiegeType; team: number; x: number; y: number; facing: number; hp: number; maxHp: number; state: SiegeState;
  progress: number;
  /** Crewing squad (-1 none); crew needed to move or work; crew men beside it now. */
  crew: SquadId; crewNeed: number; crewHere: number;
  /** Ticks to its next blow or shot (0 = ready), and since its last (0 = this tick), set once it struck. */
  reload?: number; swing?: number;
  /** Building it attacks (or the wall a ladder goes up / stands on). */
  target?: number;
  /** Fire intensity 0..1 while it burns. */
  burning?: number;
  ladder?: number;
}
export interface UnitSnap { id: UnitId; squad: SquadId; x: number; y: number; facing: number; hp: number; maxHp: number; cls: string; state: 'idle' | 'move' | 'attack' | 'dead' | 'gather' | 'build'; wounded?: boolean; swing?: number; ready?: number; carry?: ResourceKind; load?: number;
  /** M2c: what it does at its target while standing there: torching, beating out a fire, pushing a ladder, crewing an engine (state build: building one). */
  task?: 'ignite' | 'extinguish' | 'push' | 'crew';
  /** Height level it stands on (ground, stair or walkway). on: the building whose walkway, platform or stair it stands on. */
  z?: number; on?: number }
// wounded: set on dead units, true = wounded, false = killed. state 'attack' only while striking in reach or shooting in range
// (closing in is 'move'). 'gather': harvesting at a node; 'build': labouring at a site. carry/load: what and how much it
// carries (set while it has a load, any state: play the carry clip while it walks). swing: ticks since the unit's last blow or shot (0 = it landed / was loosed this tick), set while
// 'attack' once it has struck; ready: steps before the one that strikes or shoots next (0 = the next step), if it stays in reach. Play the attack clip once per swing.
export interface SquadSnap { id: SquadId; owner: string; team: number; units: UnitId[]; order: Order['kind'];
  /**
   * W-35, archer squads only: fire arrows toggled `on`; available: a living man stands within BRAZIER.radius of a lit
   * brazier of his team and the stockpile holds pitch for a shot; else they loose plain arrows and reason says why.
   */
  fireArrows?: FireArrowsSnap }
export interface FireArrowsSnap { on: boolean; available: boolean; reason?: 'noBrazier' | 'noPitch' }
export type MissileKind = 'arrow' | 'stone' | 'javelin';
/**
 * A missile in flight: loosed by unit `by` at tick t0 from (x0,y0) on ground height z0 (levels), lands at (x1,y1)
 * on height z1 on tick t1 (flight t1 - t0 ticks). kind: arrow (bow), stone (sling), javelin.
 */
export interface ShotSnap { x0: number; y0: number; x1: number; y1: number; t0: number; t1: number; z0: number; z1: number; by: UnitId; kind: MissileKind;
  /** M2c: a fire arrow. siege: a stone thrower's boulder (kind 'stone', by = -1 - siege id), lands with a splash. */
  fire?: true; siege?: number }
export interface Snapshot {
  tick: number; units: UnitSnap[]; squads: SquadSnap[]; shots?: ShotSnap[];
  buildings?: BuildingSnap[];
  /** Per-team stockpile (team -> resource -> amount). */
  stock?: Record<number, Partial<Record<ResourceKind, number>>>;
  /** Bumped whenever influence() changes: re-read the overlay then. */
  influenceVersion?: number;
  /** M2c siege engines (destroyed ones stay as wrecks). */
  sieges?: SiegeSnap[];
  /** Neutral lairs (after spawnMobs) and region claim points. */
  lairs?: LairSnap[];
  claims?: ClaimSnap[];
}
/**
 * A lair: its mob squad (team MOB_TEAM), mobs alive of `count`; state home (idle, wandering), chase, return (leashed back,
 * healing), flee (a herd), cleared (respawnIn: ticks until it may come back while its area is unclaimed). aggro, leash,
 * guard: radii in tiles (guard 0: a herd, it locks no nodes); nodes: resource nodes it locks while it lives.
 */
export interface LairSnap {
  id: number; kind: MobKind; x: number; y: number; squad: SquadId; alive: number; count: number;
  state: 'home' | 'chase' | 'return' | 'flee' | 'cleared'; aggro: number; leash: number; guard: number; nodes: number; respawnIn?: number;
}
/**
 * A claim point: locked (a guard lair of its zone lives), open, channel (squad channelling, progress 0..1), contested
 * (foes near: progress reset), claimed (by team).
 */
export interface ClaimSnap { id: number; x: number; y: number; team: number; squad: SquadId; progress: number; lairs: number[]; state: 'locked' | 'open' | 'channel' | 'contested' | 'claimed' }
export interface WarSim {
  readonly region: RegionData;
  spawnSquad(owner: string, team: number, cls: string, count: number, x: number, y: number): SquadId;
  order(o: Order): void;
  step(): void;               // advance one 10 Hz tick
  snapshot(): Snapshot;
  stats(): { stepMs: number; units: number };
}

// --- M2a: resources, gathering, construction (rules: src/war/sim/economy.ts) ---
export type ResourceKind = 'food' | 'wood' | 'stone' | 'marble' | 'copper' | 'tin' | 'iron' | 'bronze' | 'silver' | 'salt' | 'pitch';
export type BuildingType =
  | 'camp' | 'storehouse' | 'outpost' | 'fort' | 'barracks' | 'farm' | 'olivePress'
  | 'palisade' | 'rampart' | 'stoneWall' | 'woodStairs' | 'stoneStairs' | 'ladder' | 'woodTower' | 'stoneTower' | 'woodGate' | 'stoneGate'
  | 'woodBridge' | 'stoneBridge'
  // W-35: brazier (1x1 on open ground, or on the team's own walkway / tower platform deck, no influence needed; paid at once, done and lit on
  // placement, burns BRAZIER.life seconds; no squad needed); pitchKiln: a pitch node fed by the team's wood
  | 'brazier' | 'pitchKiln';
/** foundation: marked out, materials arriving; scaffold: labour under way (the footprint blocks); damaged: done below half hp. */
export type BuildState = 'foundation' | 'scaffold' | 'done' | 'damaged' | 'destroyed';
export type PlaceReason = 'bounds' | 'noBuild' | 'water' | 'rock' | 'blocked' | 'overlap' | 'influence' | 'slope' | 'node' | 'short' | 'attach' | 'span' | 'bank' | 'cost';
/** A dragged wall line (flat x,y points, tiles): split into segments; towers and gates (flat x,y) snap onto the line. */
export interface WallOrder {
  kind: 'placeWall'; squad?: SquadId; team?: number; material: 'wood' | 'timber' | 'stone'; points: number[]; towers?: number[]; gates?: number[];
  /** A point on the inside (x,y): a thick wall's inner row and its stairs go on that side. Default: the centre of the team's claims and influence buildings. */
  inside?: number[];
}
/**
 * Bridges (M2d W-24, v2 W-33, src/war/sim/works.ts): a drag from bank to bank (`points`: first and last tile points). The
 * line snaps to the nearest of 4 directions: a grid axis ('x', 'y': diagonal on screen) or a grid diagonal ('h': along
 * +-(1,-1), screen-horizontal; 'v': along +-(1,1), screen-vertical). The bridge is `width` tiles wide (1-3, default 2)
 * across the line, laid out in rows one step along it: an axis row is `width` tiles beside the line (+y along x, +x along
 * y; a 3-wide one centred on it); a diagonal row is a staircase band of round(width x sqrt 2) + 1 tiles (its core about
 * `width` tiles wide) centred on the line. A ramp row on each bank (the last dry rows before the water) and deck pieces of
 * 2 rows over the water between them. Valid when it starts on a dry bank ('bank'), reaches a dry far bank within the line
 * ('bank'), spans at most BRIDGE.maxSpan[material] tiles of water bank to bank ('span'; a diagonal row step is sqrt 2
 * tiles), its ramps sit on open ground ('water', 'blocked', 'overlap', 'noBuild', banks more than a level apart: 'slope')
 * and at least one ramp lies in the team's influence ('influence'; the water and the far bank need none). Pieces are built
 * like walls (per-tile cost and labour) from both banks inwards: a deck piece takes workers only once the piece before it
 * (towards either bank) is done, so they stand on the finished deck.
 */
export type BridgeAxis = 'x' | 'y' | 'h' | 'v';
export interface BridgeOrder { kind: 'placeBridge'; squad?: SquadId; team?: number; material: 'wood' | 'stone'; points: number[]; width?: number }
export interface BridgePlan {
  ok: boolean; reason?: PlaceReason; axis: BridgeAxis;
  /** The snapped step along the line (from the drag's start) and the width in tiles. */
  dir: [number, number]; width: number;
  /** Water bank to bank along the line in tiles (0 when there is none); maxSpan: the material's limit. */
  span: number; maxSpan: number;
  /**
   * Ramps (end0: the drag's start bank, end1: the far one) and decks, in order along the line. rows: each row's centre
   * (flat tile x,y, continuous) in line order.
   */
  pieces: { type: BuildingType; part: 'end0' | 'end1' | 'deck'; tiles: number[]; rows: number[]; ok: boolean }[];
}
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
  /**
   * Wall tier (economy.ts BuildingDef.tier); walk: walkway / platform height in levels above the ground over the whole
   * footprint (0 until done); depth: wall thickness in tiles (1 palisade, 2 rampart / stone wall: line + inner row).
   */
  tier?: number; walk?: number; depth?: number;
  /** woodStairs / stoneStairs / ladder: the wall or tower they lean on. Stairs' tiles run bottom first, steps: their levels above the ground. */
  attach?: number; steps?: number[];
  /** Stone tower: its door tile (x,y), at ground level, with the inner stair to the platform. */
  door?: number[];
  /** Tower platform (ladder: 1) capacity. */
  cap?: number;
  /** While an upgrade is under way (state scaffold): the tier still standing. */
  upgradeFrom?: BuildingType;
  /** M2c: fire intensity 0..1 while it burns. */
  burning?: number;
  /** W-35 brazier: lit (archers near it may loose fire arrows); fuel left 0..1. attach: the wall or tower it stands on. */
  lit?: boolean; fuel?: number;
  /** M2c: a destroyed wall, gate or tower lies as rubble (walkable at ground level, slow; no deck). */
  rubble?: true;
  /** M2c: a ladder raised by siege engine `siege`; push: defenders' progress pushing it off 0..1. */
  siege?: number; push?: number;
  /**
   * M2d: a bridge piece: its axis, step along the line (dir), width, part (a ramp on the start / far bank, or deck), deck
   * level (the higher bank's height; finished tiles walk at it over the water) and row centres (as BridgePlan pieces).
   * Units on it have `on` = this piece.
   */
  bridge?: { axis: BridgeAxis; dir: [number, number]; width: number; part: 'end0' | 'end1' | 'deck'; deck: number; rows: number[] };
}
/** A gatherable node: a region object (obj = index into region.objects) or a finished farm/press (building = its id). */
export interface NodeSnap { id: number; res: ResourceKind; x: number; y: number; amount: number; max: number; obj?: number; building?: number;
  /** A living guard lair stands near: no gathering. */
  guarded?: true }
/** Team influence: bit `team` of mask[y*w+x] is set where the team may build. */
export interface InfluenceMap { w: number; h: number; mask: Uint8Array; version: number }
export interface WarBuildSim extends WarSim {
  checkPlacement(team: number, type: BuildingType, x: number, y: number, rot?: 0 | 1): PlaceResult;
  checkWall(team: number, o: Omit<WallOrder, 'kind' | 'squad'>): WallPlan;
  checkBridge(team: number, o: Omit<BridgeOrder, 'kind' | 'squad'>): BridgePlan;
  resourceNodes(): NodeSnap[];
  influence(): InfluenceMap;
  /** A claim anchor (claimed region, scenario start): projects influence radius r around (x,y). */
  claim(team: number, x: number, y: number, r?: number): void;
  addStock(team: number, res: ResourceKind, n: number): void;
  damageBuilding(id: number, dmg: number): void;
  /** Scenarios: the team's unfinished bridge pieces done at once (standing bridges at the start). */
  finishBridges(team: number): void;
  /** Spawn the region's lairs (neutral play; once). */
  spawnMobs(): void;
}
export declare function createSim(region: RegionData, seed: number): WarBuildSim; // implemented in src/war/sim/index.ts
