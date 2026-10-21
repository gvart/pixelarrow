import type { SimState } from './sim/state';
import type { Hero } from '../data/units';
import type { Item } from '../data/items';
import type { Product } from '../data/recipes';
export type TerrainKind = 'grass' | 'forest' | 'sand' | 'marsh' | 'rock' | 'road' | 'snow' | 'dirt';
export type WaterKind = 0 | 1 | 2; // 0 none, 1 shallow (ford), 2 deep (impassable)
export interface RegionData {
  id: string; name: string; w: number; h: number; // tiles
  height: number[]; terrain: TerrainKind[]; water: WaterKind[]; // row-major, length w*h; height 0..15 (W-51)
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
  lairs?: { kind: MobKind; x: number; y: number; count?: number;
    /** M7c: a bandit host's captain (bandit kind): he and his elite guard; the claim points holding this lair open once he falls. */
    captain?: boolean }[];
  /** Region claim banners: open once every guard lair of `lairs` (indices into lairs) is cleared; r: influence radius once claimed. */
  claimPoints?: { x: number; y: number; lairs: number[]; r?: number }[];
  /**
   * M6d (additive, src/war/sim/trade.ts): safe zones (a trade town's walled market court; `gates`: its gate rects), the
   * caravan yards outside them (not safe), and ambush spots (high ground or woods over a road), in tiles.
   */
  safe?: SafeRect[];
  yard?: TileRect[];
  ambush?: TileRect[];
  /** M7a (additive, src/war/sim/prebuilt.ts): the region's pre-built structures (town pieces, landmark pieces). */
  prebuilt?: PrebuiltEntry[];
  /** M7c: danger depth 0 (homes) .. 4 (rim, Omphalos); absent: src/war/sim/depth.ts REGION_DEPTH, else 1. */
  depth?: number;
  /** M7d (additive, src/war/sim/bosses.ts): the region's guardians (landmark bosses) and where they fight. */
  guardians?: GuardianEntry[];
  /** M7d: the map side facing the dead water: a depth-4 rim region's Warden strikes fall in its outer band. */
  rim?: 'N' | 'E' | 'S' | 'W';
}
/**
 * M7d: a guardian of the region (src/data/warBosses.ts id) and its posts, in tiles: (x,y) its lair (the yard, the palace,
 * the cave mouth); perches: roofs and tower tops it fights from (Drakon: the keep roof first, then the towers he flies
 * between; Brontes, the Titan: the gate top); heads: Scylla's six heads along the cliff; postern: the Bandit King's way
 * out; pit: where called packs come from (Drakon's bone pit); flats: where a beaten guardian drags itself (Scylla, the
 * River-God's channel).
 */
export interface GuardianEntry {
  boss: string; x: number; y: number;
  perches?: [number, number][]; heads?: [number, number][]; postern?: [number, number]; pit?: [number, number]; flats?: [number, number];
}
/**
 * M7a: a pre-built structure (docs/WAR.md "Pre-built structures"): a building of `type` standing done at the start, its
 * footprint centred on (x,y) (rot as placeBuilding) or, for wall lines, the flat x,y `tiles` given; hp: share of max hp
 * (default 1, landmark pieces 0.6); state 'ruined': a ruin from the start; claim: the claim point (index into claimPoints)
 * whose holder owns it (default: the first point whose radius covers it); landmark: rebuilt only by its restore rule (M7d).
 */
export interface PrebuiltEntry {
  type: BuildingType; x: number; y: number; rot?: 0 | 1; tiles?: number[]; hp?: number; state?: 'done' | 'ruined'; claim?: number; landmark?: boolean;
  /** M7d: a landmark piece's art (public/war/landmarks/landmarks.json piece id) and its own max hp (the keep's 8000). */
  art?: string; maxHp?: number;
}
export interface TileRect { x: number; y: number; w: number; h: number }
export interface SafeRect extends TileRect { gates?: TileRect[] }
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
  // M7a: repairBuilding: the squad mends a damaged building of its team to full (src/war/sim/prebuilt.ts REPAIR: per 10%
  // hp, 5% of its cost from the network and 5% of its labour; engineers faster). rebuild: a ruin on the team's ground
  // becomes a site at RUIN.rebuild of its cost and labour (landmark pieces: never); with a squad it builds it.
  | { kind: 'repairBuilding'; squad: SquadId; building: number }
  | { kind: 'rebuild'; building: number; squad?: SquadId; team?: number }
  // M7f: restoreLandmark: the squad (with an engineer of the landmark's level and nodes: Fortifier, Master Builder; level
  // 10 also Poliorcetes or Archimedes) restores the region's landmark its team holds: the bill (src/data/warLandmarks.ts)
  // comes from the team's network, every piece goes to full and its function wakes (refused: a `landmarkRefused` event).
  | { kind: 'restoreLandmark'; squad: SquadId }
  | WallOrder
  | BridgeOrder
  | SiegeOrder
  // M5c: the squad's active (SquadSnap.active) fires if it is ready
  | { kind: 'active'; squad: SquadId }
  // M5f civilians (src/war/sim/civilians.ts): a civilian squad stands round its team's done store building (camp,
  // storehouse, fort) and works there by class (cook, smith, merchant, physician). Civilian squads take only work orders
  // (move, hold, stop, formation, gather, build, civWork, detach, merge with another civilian squad).
  | { kind: 'civWork'; squad: SquadId; building: number }
  | CraftOrder
  | TradeOrder;
/**
 * M6 trade (src/war/sim/trade.ts). load: the squad's men walk to a holder and each takes a load into his pack every
 * PORTER.every ticks (`res`: only that good; `n`: at most that many goods) until the packs are full or it is empty; a
 * squad crewing a cart loads the cart (it rolls there first). unload: packs (or the crewed cart) into the holder.
 * Holders: own store (and the home strongroom through it), own chest, own cart, any loot pile; an enemy chest with no
 * unit of its owner within CHEST.guard, an enemy store once its team's influence there is gone. escort: the squad keeps
 * round cart `cart`, takes on foes within ESCORT.engage tiles of it and comes back past ESCORT.leash. salvagePile: a
 * smith squad breaks item `uid` of a pile up in place (PILE.salvage ticks) into some of its recipe's goods.
 */
export interface HolderRef { building?: number; cart?: number; pile?: number }
/** M6e (server bridges): one of a squad (or these persons' men), a cart, a building, a team's home strongroom. */
export interface CargoRef { squad?: number; persons?: string[]; cart?: number; building?: number; reserve?: number }
export interface CargoAt { slots: { hold: import('./sim/holders').Hold; cap: number; x: number; y: number }[]; team: number; owner: string }
export type TradeOrder =
  | { kind: 'load'; squad: SquadId; from: HolderRef; res?: ResourceKind; n?: number }
  | { kind: 'unload'; squad: SquadId; to: HolderRef; res?: ResourceKind }
  | { kind: 'escort'; squad: SquadId; cart: number }
  | { kind: 'salvagePile'; squad: SquadId; pile: number; uid: string };
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
export type SiegeType = 'ram' | 'stoneThrower' | 'siegeLadder' | 'mantlet' | 'coveredRam' | 'oxybeles' | 'siegeTower'
  // M6b carts (built at a workshop, a player's; trade.ts CART): a handcart pulled by 2 men, a wagon with a driver
  | 'handcart' | 'wagon';
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
  /** M6b carts: the owning player, cargo (goods, item count, loads of most), halted by a foe near, capture progress 0..1. */
  owner?: string; cargo?: Partial<Record<ResourceKind, number>>; items?: number; loads?: number; cap?: number; halted?: true; capture?: number;
  /** M6k: the cart's first items (uid, def, rarity, quality; at most 8). */
  list?: HoldItem[];
}
export interface UnitSnap { id: UnitId; squad: SquadId; x: number; y: number; facing: number; hp: number; maxHp: number; cls: string; state: 'idle' | 'move' | 'attack' | 'dead' | 'gather' | 'build'; wounded?: boolean; swing?: number; ready?: number; carry?: ResourceKind; load?: number;
  /** M2c: what it does at its target while standing there: torching, beating out a fire, pushing a ladder, crewing an engine (state build: building one). */
  task?: 'ignite' | 'extinguish' | 'push' | 'crew';
  /** Height level it stands on (ground, stair or walkway). on: the building whose walkway, platform or stair it stands on. */
  z?: number; on?: number;
  /** M5b: a person (WarPerson id) and his level; missing on class-spawned men. */
  pid?: string; level?: number;
  /** M5f civilians: at work at his building (cook, forge, trade, heal: the clip to play); fleeing (run). */
  work?: 'cook' | 'forge' | 'trade' | 'heal'; flee?: true;
  /** M6a: loads in his pack (a porter). */
  pack?: number;
  /** M6d combat tag: ticks left before he may enter a safe zone (he hit or was hit; absent: none). */
  tag?: number }
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
  dish?: Product; bandages?: number; theriac?: true;
  /** M7a: blessed at a temple or shrine (wounded share and healing up). */
  blessed?: true }
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
  /** M6c: loot piles on the field. */
  piles?: PileSnap[];
  /** M7a: towns of pre-built pieces (grouped by claim point). */
  towns?: TownSnap[];
  /** M7f: the region's landmark (src/data/warLandmarks.ts), as its panel shows it. */
  landmark?: LandmarkSnap;
  /** M7d: the region's guardians (src/war/sim/bosses.ts) and a Rim Warden strike being marked. */
  bosses?: BossSnap[];
  warden?: WardenSnap;
  /** M5f: rations per team (cooks make them, squads near a cook eat them). */
  rations?: Record<number, number>;
  /** M5h: dishes, remedies, kits and caravan goods per team (src/data/recipes.ts Product). */
  supplies?: Record<number, Partial<Record<Product, number>>>;
}
/** M7f: a region's memory (WarBuildSim.memory). */
export interface RegionMemory {
  pieces: { i: number; hp: number; ruin: boolean; gone: boolean; team: number }[];
  claims: number[];
  guardians: { id: string; state: BossSnap['state']; left: number }[];
  landmark: { captured: boolean; restored: boolean };
}
/**
 * M7f: a landmark (docs/WAR.md "Landmarks"): its holder (an alliance team; -1: its guardian or nobody), its state
 * (guarded: its guardian lives; unclaimed: guardian slain, nobody holds it; damaged: held, function dormant; restored:
 * held and restored, its function wakes), the standing pieces' mean hp share, ruined pieces, own men of the holder
 * inside its walls and foes there (garrisoned: restored, >= LANDMARK_GARRISON own men and no foe: +2 score an hour).
 */
export interface LandmarkSnap {
  id: string; holder: number; state: 'guarded' | 'unclaimed' | 'damaged' | 'restored'; hp: number; ruined: number; pieces: number;
  men: number; foes: number; garrisoned: boolean;
}
/**
 * M7d: a guardian as the view sees it: its body unit (the bar's), hp of all its parts, the phase it is in (index into
 * `phases`, the hp shares they start below), what it does (perch: on a roof out of melee reach; flight; flee: running for
 * the postern; away: escaped, back in respawnIn; slain: respawnIn while its region is unheld), parts alive of its linked
 * targets (Scylla's heads, the Chimera's heads), the raid it faces (foe squads near) and its hp scale for it; fx: the move
 * it makes now (breath cone from x,y towards tx,ty, r wide; sweep, crash, stomp, smash: a ring of r; rock and boulder: a
 * throw landing at tx,ty; snatch: a man pulled into the water at tx,ty), `t` ticks ago; hide: units of its squads the view
 * does not draw (the Chimera's other heads share the lion's body).
 */
export interface BossSnap {
  id: string; name: string; squad: SquadId; unit: UnitId; x: number; y: number; hp: number; maxHp: number; phase: number; phases: readonly number[];
  state: 'idle' | 'fight' | 'perch' | 'flight' | 'flee' | 'away' | 'slain'; parts?: { alive: number; total: number }; raid: number; scale: number;
  respawnIn?: number; fx?: { kind: 'breath' | 'sweep' | 'crash' | 'stomp' | 'smash' | 'rock' | 'boulder' | 'snatch' | 'charge'; x: number; y: number; tx: number; ty: number; r: number; t: number };
  hide?: UnitId[];
}
/** M7d: a Rim Warden strike marked on an 8 x 8 patch of the rim band, landing in `in` ticks (60% max hp to every man in it). */
export interface WardenSnap { x: number; y: number; w: number; h: number; in: number }
/**
 * A lair: its mob squad (team MOB_TEAM), mobs alive of `count`; state home (idle, wandering), chase, return (leashed back,
 * healing), flee (a herd), cleared (respawnIn: ticks until it may come back while its area is unclaimed). aggro, leash,
 * guard: radii in tiles (guard 0: a herd, it locks no nodes); nodes: resource nodes it locks while it lives.
 */
export interface LairSnap {
  id: number; kind: MobKind; x: number; y: number; squad: SquadId; alive: number; count: number;
  /** M7c: a bandit host's captain lair (claim opens once he falls), its captain alive. */
  captain?: boolean;
  state: 'home' | 'chase' | 'return' | 'flee' | 'cleared'; aggro: number; leash: number; guard: number; nodes: number; respawnIn?: number;
}
/**
 * M7a: a town (the pre-built pieces round claim point `claim`, -1: those outside any): its owner (NEUTRAL_TEAM, MOB_TEAM
 * or an alliance team), houses standing of all, its recruit pool (an hour) and cap, favour and prestige (score an hour,
 * uncapped), ruined (3/4 of its houses and its temple down: no pool, no favour).
 */
export interface TownSnap { claim: number; team: number; houses: number; standing: number; pool: number; cap: number; favour: number; prestige: number; ruined: boolean }
/**
 * A claim point: locked (a guard lair of its zone lives), open, channel (squad channelling, progress 0..1), contested
 * (foes near: progress reset), claimed (by team).
 */
export interface ClaimSnap { id: number; x: number; y: number; team: number; squad: SquadId; progress: number; lairs: number[]; state: 'locked' | 'open' | 'channel' | 'contested' | 'claimed';
  /** M7c: men of the claiming team the channel needs beside the banner, and of how many players. */
  men?: number; players?: number }
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
  | 'hides' | 'flax' | 'herbs' | 'charcoal' | 'leather' | 'linen' | 'oil'
  // M6a: minted from silver at a forge L2 (docs/WAR.md "Coin")
  | 'coin'
  // M7e rare goods (docs/WAR.md "Rare goods"): one per landmark with a node, and its boss's kill
  | 'dragonbone' | 'nereidPearl' | 'starIron' | 'asphodel' | 'titanBronze' | 'obsidian';
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
  | 'workshop' | 'workshop2' | 'workshop3' | 'stall' | 'stall2' | 'stall3' | 'sortingFloor' | 'sortingFloor2'
  // M6a: a player's chest (1x1, owner-only, never feeds crafting)
  | 'chest'
  // M7a pre-built pieces (docs/WAR.md "Pre-built structures"; placed only by the region, rebuilt from ruins)
  | 'house' | 'cottage' | 'tent' | 'temple' | 'shrine' | 'stoa' | 'statue' | 'well' | 'jetty' | 'warehouse' | 'board' | 'cache';
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
  /** M6a: a store's or chest's goods and item count; a chest's owner. */
  goods?: Partial<Record<ResourceKind, number>>; items?: number; owner?: string;
  /** M7a: a pre-built piece (landmark: restored only by its rule); a ruin (rubble, no function; rebuilt by its ground's owner); a fouled well; under repair. */
  pre?: true; landmark?: true; ruin?: true; fouled?: true; mend?: true;
  /** M7d: a landmark piece's art (public/war/landmarks/landmarks.json piece id). */
  art?: string;
  /** M7a stoa: stall sites under its roof. */
  stalls?: number;
  /** M6k: a store's or chest's first items (at most 8). */
  list?: HoldItem[];
}
/** A crafting order: its id, recipe (or 'repair' / 'salvage' of an item def), the crafter's unit once started (-1 waiting), progress 0..1. */
export interface QueueSnap { id: number; recipe: string; kind: 'craft' | 'repair' | 'salvage'; by: UnitId; progress: number }
/** A gatherable node: a region object (obj = index into region.objects) or a finished farm/press (building = its id). */
export interface NodeSnap { id: number; res: ResourceKind; x: number; y: number; amount: number; max: number; obj?: number; building?: number;
  /** A living guard lair stands near: no gathering. */
  guarded?: true;
  /** M7e: a landmark's rare-good node: only the region's holder gathers it. */
  rare?: true }
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
  /** M6b scenarios and benches: a finished, empty cart of `owner` (team `team`) at (x,y); its siege id. */
  spawnCart(team: number, owner: string, type: 'handcart' | 'wagon', x: number, y: number): number;
  /** Spawn the region's lairs (neutral play; once). */
  spawnMobs(): void;
  /** M7a (src/war/sim/prebuilt.ts): the region's towns; a team's recruit pool (an hour) and cap from its houses; its favour and prestige (score an hour, capped); the upkeep multiplier of its squad resting at (x,y) (a well near). */
  towns(): TownSnap[];
  population(team: number): { rate: number; cap: number };
  prestige(team: number): number;
  upkeepAt(team: number, x: number, y: number): number;
  /**
   * M7c, M7d stub (src/war/sim/mobs.ts): register the region boss (src/data/warBosses.ts id; null: none): while it lives
   * the region is held (its pre-built pieces the mobs', gates shut) and no claim point opens; bossDown: it fell.
   */
  setBoss(id: string | null): void;
  bossDown(id?: string): void;
  /** M7d (src/war/sim/bosses.ts): wake the region's guardians (spawnMobs does it too); a dev and test hook: deal `dmg` to guardian `boss`'s body (its phases follow). */
  spawnGuardians(): void;
  /**
   * M7f: what the region remembers once its room empties (the server keeps it across DO restarts and in D1): its
   * pre-built pieces' hp, ruin and owner, the claim points' holders, its guardians (slain or away and the ticks until they
   * are back) and its landmark's capture and restore. recall() lays it onto a fresh sim, `elapsed` ticks later (guardians
   * whose time ran out while the region was unheld are back, their landmark as the season found it).
   */
  memory(): RegionMemory;
  recall(m: RegionMemory, elapsed: number): void;
  hurtBoss(boss: string, dmg: number, owner?: string, part?: number): void;
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
  /** M6c: pile `id`'s items are scrapped: they go, their salvage value comes back (0: no such pile or no items). */
  salvage(id: number): number;
  /**
   * M6e-M6i (server bridges): the live holds of a squad's men (or these persons' men: packs), a cart, a store or chest,
   * or a team's home strongroom, each with its size in loads and where it is; null when there is none.
   */
  cargo(ref: CargoRef): CargoAt | null;
  /** M6h: cart `id` leaves the field for a world transit (no wreck, no pile); its type and cargo (null: no such cart). */
  stowCart(id: number): { type: 'handcart' | 'wagon'; hold: import('./sim/holders').Hold } | null;
  /** M6i: an undone capture: cart `id` is `owner`'s (team `team`) again. */
  setCartOwner(id: number, team: number, owner: string): void;
  /** M6e: goods and items fall at (x,y) as a loot pile (boss loot); its id (-1: none, e.g. in a safe zone). */
  dropPile(x: number, y: number, lots: readonly import('./sim/holders').Lot[], items: readonly Item[]): number;
  /** M6a: pay `cost` from the store network of `team` at (x,y) (upkeep, the server); false (nothing taken) when it lacks any of it. */
  drawAt(team: number, x: number, y: number, cost: Partial<Record<ResourceKind, number>>): boolean;
  /** M6a: goods the store network of `team` at (x,y) holds (its stores and the home strongroom). */
  goodsAt(team: number, x: number, y: number): Partial<Record<ResourceKind, number>>;
  /** M6d: every unit of `owner` inside a safe zone walks out to the nearest yard (logout). */
  walkOut(owner: string): void;
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
  /** M4 transfer out: the fight so far of these persons' living men (XP, kills, as endFight), reported now and cleared. */
  reportPersons(ids: string[]): PersonResult[];
  /** M4 transfer in: these persons' living men take the hit points they lost elsewhere (by person id; never below 1). */
  hurtPersons(lost: Record<string, number>): void;
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
/** M6k: an item in a hold as the view sees it (src/war/sim/holders.ts itemList). */
export interface HoldItem { uid: string; def: string; rarity: string; q?: 0 | 1 | 2 }
/** M6c: a loot pile: its goods, item count, loads, `left` ticks until it is gone; salvage: a smith's progress 0..1. */
export interface PileSnap { id: number; x: number; y: number; goods: Partial<Record<ResourceKind, number>>; items: number; loads: number; left: number; salvage?: number;
  /** M6k: the pile's first items (uid for salvagePile; at most 8). */
  list?: HoldItem[] }
/**
 * One person's fight: XP earned (half when wounded or captive, none when dead), level-ups, and the hero after it.
 * fort: a captive's holding building (the captor's nearest standing fort or camp), absent when the captor holds none.
 */
export interface PersonResult {
  pid: string; owner: string; team: number; state: 'fit' | 'wounded' | 'captive' | 'dead'; captor?: number; fort?: number;
  xp: number; kills: number; dmg: number; levelUps: number; hero: Hero;
  /** A battle honour won in this fight (src/war/sim/honours.ts; set by the region room, not the sim). */
  honour?: { name: string; stat: HonourStat };
}
/** loot: items picked up from piles per team since the last report (M6c; the server mints them until M6e places them). */
export interface FightReport { tick: number; persons: PersonResult[]; loot: Record<number, Item[]> }
export type WarEvent =
  | { t: number; kind: 'fall'; unit: UnitId; by: UnitId; wounded: boolean }
  | { t: number; kind: 'objective'; squad: SquadId; what: 'claim' | 'building' }
  | { t: number; kind: 'pickup'; drop: number; team: number; items: number }
  // M6b: a cart taken by `team` (its new owner `owner`)
  | { t: number; kind: 'cartCaptured'; cart: number; team: number; owner: string }
  | { t: number; kind: 'capture'; unit: UnitId; pid: string; captor: number }
  | { t: number; kind: 'levelUp'; unit: UnitId; pid: string; level: number }
  // M5e: a holding building (fort, camp) of `team` raided: foe soldiers `by` reached it with none of its team near, or it fell
  // (fell: destroyed); the captives held there go free
  | { t: number; kind: 'raid'; building: number; team: number; by?: number; fell: boolean }
  // M5h: a crafting order finished: the made, mended or salvaged item for `owner`'s stash (salvage: item gone, goods to stock)
  | { t: number; kind: 'crafted'; order: number; building: number; team: number; owner: string; pid?: string; recipe: string; what: 'craft' | 'repair' | 'salvage'; item: Item }
  // W-45: a region boss (src/data/warBosses.ts) fell; killers: the owners (`p:<player id>`) of the squads that hurt it,
  // the one who struck the last blow first. The server writes the kill and mints its loot (server/src/war/bosses.ts).
  | { t: number; kind: 'bossSlain'; region: string; boss: string; killers: string[]; x?: number; y?: number }
  // M7a: a pre-built piece (owned by `owner`) brought down to a ruin, by `by` (-1: unknown, fire or a stone); a temple or
  // shrine: sacrilege (the razer's alliance loses score, server)
  | { t: number; kind: 'razed'; building: number; type: BuildingType; owner: number; by: number; sacrilege?: true }
  // M7c: a bandit host's captain fell (its claim point may open)
  | { t: number; kind: 'captainSlain'; lair: number; by: number }
  // M7d: a guardian entered phase `phase` (index into its WarBoss phases); escaped (the Bandit King by the postern: back
  // after a while with half his host); came back (24 h unheld: full hp, its landmark reset); a Rim Warden strike landed
  | { t: number; kind: 'bossPhase'; region: string; boss: string; phase: number }
  | { t: number; kind: 'bossFled'; region: string; boss: string }
  | { t: number; kind: 'bossBack'; region: string; boss: string }
  // M7f: a landmark's state changed (captured: its pieces took the capture damage; restored: its function wakes); a
  // restore refused (why: not held, no engineer of the level and nodes in the squad, goods short)
  | { t: number; kind: 'landmark'; id: string; state: LandmarkSnap['state']; holder: number }
  | { t: number; kind: 'landmarkRefused'; id: string; squad: SquadId; why: 'held' | 'engineer' | 'goods' }
  | { t: number; kind: 'wardenStrike'; x: number; y: number; w: number; h: number; hit: number };
