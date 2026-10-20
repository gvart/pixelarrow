import type { SimState } from './sim/state';
import type { Hero } from '../data/units';
import type { Item } from '../data/items';
import type { Product } from '../data/recipes';
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
  // attackMove: march to (x,y) and take on any foe squad in sight on the way (as an attack order), then march on; holds at
  // the end. stop: the march ends where the men stand; they form up there (same shape, facing) and hold (order 'hold').
  | { kind: 'attackMove'; squad: SquadId; x: number; y: number }
  | { kind: 'stop'; squad: SquadId }
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
  | SiegeOrder
  // M5c: the squad's active (SquadSnap.active) fires if it is ready
  | { kind: 'active'; squad: SquadId }
  // M5f civilians (src/war/sim/civilians.ts): a civilian squad stands round its team's done store building (camp,
  // storehouse, fort) and works there by class (cook, smith, merchant, physician). Civilian squads take only work orders
  // (move, hold, stop, formation, gather, build, civWork, detach, merge with another civilian squad).
  | { kind: 'civWork'; squad: SquadId; building: number }
  | CraftOrder;
/**
 * M5h crafting (src/war/sim/crafting.ts): orders on a team's done workplace (BUILDINGS workplace), its queue at most
 * CRAFT.queue long. craft: recipe id (src/data/recipes.ts RECIPES) whose workplace kind matches and level is reached;
 * a civilian of the recipe's class at work there (civWork) holding its node starts it (inputs leave the stock then) and
 * works it for secs / workRate. cancelCraft: the order goes, inputs taken come back. repair / salvage: an item of
 * `owner`'s stash (the server sends it) mended to its max condition, or broken up for 30% of its recipe's inputs
 * (Goldsmith 60%). Items come out in a `crafted` event (the server mints them into the owner's stash); goods go to the
 * team stock, dishes and remedies to the team's supplies.
 */
export type CraftOrder =
  | { kind: 'craft'; squad?: undefined; team: number; building: number; recipe: string }
  | { kind: 'cancelCraft'; squad?: undefined; team: number; building: number; order: number }
  | { kind: 'repair'; squad?: undefined; team: number; building: number; owner: string; item: Item }
  | { kind: 'salvage'; squad?: undefined; team: number; building: number; owner: string; item: Item };
// --- M2c siege (src/war/sim/siege.ts, fire and breaches in works.ts; docs/impl/global-war-rebuild.md W-29) ---
export type SiegeType = 'ram' | 'stoneThrower' | 'siegeLadder' | 'mantlet' | 'coveredRam' | 'oxybeles' | 'siegeTower';
/**
 * M5h3 engineer designs (siege.ts, docs/WAR.md "Crafting and professions"): built like the M2c engines, only by a team with
 * a living engineer holding the node (mantlet Carpenter, coveredRam Rams, oxybeles Artillerist, siegeTower Poliorcetes).
 * mantlet: movable cover; its team's men just behind it dodge MANTLET.cover of the missiles from in front. coveredRam: a
 * ram with a hide roof (more hp, better cover, slow to catch fire). oxybeles: bolt thrower; crewed and standing, it shoots
 * the nearest foe man in sight in range, the bolt goes through up to OXY.pierce men. siegeTower: raiseLadder docks it on
 * the wall face: a towerBridge building joins the ground at its foot to the walkway, fast and for many at once (not pushed
 * off; it goes when the tower burns or breaks).
 */
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
  | { kind: 'fireArrows'; squad: SquadId; on: boolean }
  | FortOrder;
/**
 * M5h3 fortifications (Fortifier node, works.ts): fortify a done building of the team, paid at once from its stock.
 * ironGate: a gate's hp +50% (iron 10, charcoal 10, once); wetHides: a wood piece catches at half the chance for
 * WET.ticks (hides 1 a tile). Stakes and ditch are placed tiles (placeBuilding type 'stakes' / 'ditch', BUILDINGS field).
 */
export type FortKind = 'ironGate' | 'wetHides';
export interface FortOrder { kind: 'fortify'; squad?: undefined; team: number; building: number; fort: FortKind }
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
  z?: number; on?: number;
  /** M5b: a person (WarPerson id) and his level; missing on class-spawned men. */
  pid?: string; level?: number;
  /** M5f civilians: at work at his building (cook, forge, trade, heal: the clip to play); fleeing (run). */
  work?: 'cook' | 'forge' | 'trade' | 'heal'; flee?: true }
// wounded: set on dead units, true = wounded, false = killed. state 'attack' only while striking in reach or shooting in range
// (closing in is 'move'). 'gather': harvesting at a node; 'build': labouring at a site. carry/load: what and how much it
// carries (set while it has a load, any state: play the carry clip while it walks). swing: ticks since the unit's last blow or shot (0 = it landed / was loosed this tick), set while
// 'attack' once it has struck; ready: steps before the one that strikes or shoots next (0 = the next step), if it stays in reach. Play the attack clip once per swing.
export interface SquadSnap { id: SquadId; owner: string; team: number; units: UnitId[]; order: Order['kind'];
  /** M5c: the squad active, when a man of it holds one. */
  active?: ActiveSnap;
  /**
   * W-35, archer squads only: fire arrows toggled `on`; available: a living man stands within BRAZIER.radius of a lit
   * brazier of his team and the stockpile holds pitch for a shot; else they loose plain arrows and reason says why.
   */
  fireArrows?: FireArrowsSnap;
  /** M5f: a civilian squad (work orders only), running from a foe; fed by a cook (rations). */
  civ?: true; flee?: true; fed?: true;
  /** M5h: the dish it ate last (while fed), bandages it carries, theriac on (venom ignored). */
  dish?: Product; bandages?: number; theriac?: true }
export interface FireArrowsSnap { on: boolean; available: boolean; reason?: 'noBrazier' | 'noPitch' }
export type MissileKind = 'arrow' | 'stone' | 'javelin' | 'bolt';
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
  /** M5d: gear of the dead lying on the field. */
  drops?: DropSnap[];
  /** M5f: rations per team (cooks make them, squads near a cook eat them). */
  rations?: Record<number, number>;
  /** M5h: dishes, remedies, kits and caravan goods per team (src/data/recipes.ts Product). */
  supplies?: Record<number, Partial<Record<Product, number>>>;
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
  /**
   * count (at most SQUAD_MAX) men of class cls; with `persons` (M5b) one man per person instead (count and cls are then
   * ignored), each with his own baked stats (src/war/sim/classes.ts warStatsOf).
   */
  spawnSquad(owner: string, team: number, cls: string, count: number, x: number, y: number, persons?: readonly WarPerson[]): SquadId;
  order(o: Order): void;
  step(): void;               // advance one 10 Hz tick
  snapshot(): Snapshot;
  stats(): { stepMs: number; units: number; /** W-39: of stepMs, the fog update (0 on ticks without one). */ visionMs?: number };
}

// --- M2a: resources, gathering, construction (rules: src/war/sim/economy.ts) ---
export type ResourceKind = 'food' | 'wood' | 'stone' | 'marble' | 'copper' | 'tin' | 'iron' | 'bronze' | 'silver' | 'salt' | 'pitch'
  // M5h crafting goods (src/data/recipes.ts CRAFT_GOODS): raw hides, flax, herbs; refined charcoal, leather, linen, oil
  | 'hides' | 'flax' | 'herbs' | 'charcoal' | 'leather' | 'linen' | 'oil';
export type BuildingType =
  | 'camp' | 'storehouse' | 'outpost' | 'fort' | 'barracks' | 'farm' | 'olivePress'
  | 'palisade' | 'rampart' | 'stoneWall' | 'woodStairs' | 'stoneStairs' | 'ladder' | 'woodTower' | 'stoneTower' | 'woodGate' | 'stoneGate'
  | 'woodBridge' | 'stoneBridge'
  // W-35: brazier (1x1 on open ground, or on the team's own walkway / tower platform deck, no influence needed; paid at once, done and lit on
  // placement, burns BRAZIER.life seconds; no squad needed); pitchKiln: a pitch node fed by the team's wood
  | 'brazier' | 'pitchKiln'
  // M5h3: towerBridge (a docked siege tower's bridge onto a walkway, never placed), stakes and ditch (Fortifier field
  // tiles, placed 1x1 in the team's influence: open ground, men slower over them, engines cannot cross; stakes wound
  // foe men on them; attackBuilding on a ditch fills it)
  | 'towerBridge' | 'stakes' | 'ditch'
  // M5h workplaces (docs/WAR.md "Workplaces"): chains of 3 levels by `upgrade`; the sorting floor upgrades a storehouse
  | 'forge' | 'forge2' | 'forge3' | 'cookhouse' | 'cookhouse2' | 'cookhouse3' | 'infirmary' | 'infirmary2' | 'infirmary3'
  | 'workshop' | 'workshop2' | 'workshop3' | 'stall' | 'stall2' | 'stall3' | 'sortingFloor' | 'sortingFloor2';
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
  /** M5h3: an iron-bound gate; wet hides on it (fire-resistant for now). */
  iron?: true; wet?: true;
  /**
   * M2d: a bridge piece: its axis, step along the line (dir), width, part (a ramp on the start / far bank, or deck), deck
   * level (the higher bank's height; finished tiles walk at it over the water) and row centres (as BridgePlan pieces).
   * Units on it have `on` = this piece.
   */
  bridge?: { axis: BridgeAxis; dir: [number, number]; width: number; part: 'end0' | 'end1' | 'deck'; deck: number; rows: number[] };
  /** M5h: a workplace's crafting queue (first = next), oldest first. */
  queue?: QueueSnap[];
}
/** A crafting order: its id, recipe (or 'repair' / 'salvage' of an item def), the crafter's unit once started (-1 waiting), progress 0..1. */
export interface QueueSnap { id: number; recipe: string; kind: 'craft' | 'repair' | 'salvage'; by: UnitId; progress: number }
/** A gatherable node: a region object (obj = index into region.objects) or a finished farm/press (building = its id). */
export interface NodeSnap { id: number; res: ResourceKind; x: number; y: number; amount: number; max: number; obj?: number; building?: number;
  /** A living guard lair stands near: no gathering. */
  guarded?: true }
/** Team influence: bit `team` of mask[y*w+x] is set where the team may build. */
/**
 * W-39 fog of war (src/war/sim/vision.ts): a team's vision on a grid of `cell` x `cell` tiles (w x h cells, row-major).
 * state: 0 unexplored, 1 explored (seen once: terrain and last-seen buildings, no units), 2 visible now. version bumps on change.
 */
export interface FogGrid { team: number; w: number; h: number; cell: number; state: Uint8Array; version: number }
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
  /** W-39 fog: the team sees tile point (x,y) now. */
  visibleTo(team: number, x: number, y: number): boolean;
  /** The team's fog grid (live; copy before posting). */
  teamGrid(team: number): FogGrid;
  /** Foreign buildings as the team last saw them (current where visible). */
  lastSeen(team: number): BuildingSnap[];
  /**
   * M5d: the fight is over: every person who took part since the last call is reported once (XP, level-ups, state); a
   * wounded man with no friendly within CAPTURE_R and a foe near is taken captive. Tallies start afresh.
   */
  endFight(): FightReport;
  /** M5d: a smith salvages drop `id`: it goes, its salvage value comes back (0: no such drop). */
  salvage(id: number): number;
  /** M5d: the sim event log since the last call (kills, falls, objectives, pickups, captures, level-ups). */
  events(): WarEvent[];
  /** M5g: a person changed off the field (level-up choice, dev XP): his living man takes the new record, baked again (HP keeps its wounds). false: not on the field. */
  setPerson(p: WarPerson): boolean;
  /**
   * M5e eviction resume (src/war/sim/state.ts): the sim's whole live state as JSON-safe data (units with hp, wounds and
   * flags, squads and orders, sites and buildings, siege, stock, fog, mobs, tick and rng). importState puts it into a
   * fresh sim of the same region and seed, which then steps on exactly as the saved one would have.
   */
  exportState(): SimState;
  importState(s: SimState): void;
  /** M5e: these persons' living men leave the field at once, unreported (D1 already sent them home). */
  dropPersons(ids: string[]): void;
}
export declare function createSim(region: RegionData, seed: number): WarBuildSim; // implemented in src/war/sim/index.ts

// --- M5 soldiers (docs/WAR.md "Soldiers", src/war/sim/classes.ts, skills.ts, soldiers.ts, roster.ts) ---
export type WarSkillId =
  | 'shieldDrill' | 'phalangite' | 'holdFast' | 'shieldWall'
  | 'brawler' | 'shieldBreaker' | 'finisher' | 'berserk'
  | 'deepQuiver' | 'eagleEye' | 'fireArcher' | 'volley'
  | 'horsemanship' | 'lanceCharge' | 'rideDown' | 'wheel';
export type HonourStat = 'hp' | 'dmg' | 'armor' | 'block' | 'accuracy';
/** A persistent soldier as the live sim sees him: the hero record (class, level, attributes, gear), his skills, his honours (+2% to one stat each). */
export interface WarPerson { id: string; hero: Hero; skills?: WarSkillId[]; honours?: { name: string; stat: HonourStat }[] }
/** A squad active: ready in `ready` ticks (0 = now), buff on for `on` more ticks (0 = off). */
export interface ActiveSnap { skill: WarSkillId; ready: number; on: number }
/** Gear of a dead man: `items` pieces, `left` ticks until it is gone; team: the fallen's. */
export interface DropSnap { id: number; x: number; y: number; team: number; items: number; left: number }
/**
 * One person's fight: XP earned (half when wounded or captive, none when dead), level-ups, and the hero after it.
 * fort: a captive's holding building (the captor's nearest standing fort or camp), absent when the captor holds none.
 */
export interface PersonResult {
  pid: string; owner: string; team: number; state: 'fit' | 'wounded' | 'captive' | 'dead'; captor?: number; fort?: number;
  xp: number; kills: number; dmg: number; levelUps: number; hero: Hero;
}
/** loot: gear picked up per team since the last report (rare and above at reduced condition). */
export interface FightReport { tick: number; persons: PersonResult[]; loot: Record<number, Item[]> }
export type WarEvent =
  | { t: number; kind: 'fall'; unit: UnitId; by: UnitId; wounded: boolean }
  | { t: number; kind: 'objective'; squad: SquadId; what: 'claim' | 'building' }
  | { t: number; kind: 'pickup'; drop: number; team: number; items: number }
  | { t: number; kind: 'capture'; unit: UnitId; pid: string; captor: number }
  | { t: number; kind: 'levelUp'; unit: UnitId; pid: string; level: number }
  // M5e: a holding building (fort, camp) of `team` raided: foe soldiers `by` reached it with none of its team near, or it fell
  // (fell: destroyed); the captives held there go free
  | { t: number; kind: 'raid'; building: number; team: number; by?: number; fell: boolean }
  // M5h: a crafting order finished: the made, mended or salvaged item for `owner`'s stash (salvage: item gone, goods to stock)
  | { t: number; kind: 'crafted'; order: number; building: number; team: number; owner: string; pid?: string; recipe: string; what: 'craft' | 'repair' | 'salvage'; item: Item };
