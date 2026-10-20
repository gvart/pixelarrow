/**
 * The strategic world (M4, docs/WAR.md "World", W-02/W-03/W-09): 37 regions joined by transfers between adjacent ones.
 * Pure data types shared by the client (world map) and the server (WarWorldDO).
 */

/** The four sides of a region map; every region map has an entry zone on each (RegionData.entries). */
export type Side = 'N' | 'E' | 'S' | 'W';

/** home: an alliance's home (W-09: besieged, never taken); entry: a home's big neutral approach with a no-build band. */
export type RegionRole = 'home' | 'entry' | 'neutral' | 'center';

/** Alliance index 0..3: also the team number inside a region room. */
export type AllianceId = 0 | 1 | 2 | 3;

/** The art library a region draws from (public/war/biomes/<biome>/, W-21). */
export type BiomeKey = 'dodona' | 'skythia' | 'kyrene' | 'elaia' | 'mountains' | 'marsh' | 'coast' | 'plateau';

export type ResourceKey = 'food' | 'wood' | 'stone' | 'iron' | 'copper' | 'tin' | 'silver' | 'horses' | 'marble' | 'salt';

export interface WorldRegion {
  id: string;
  name: string;
  role: RegionRole;
  biome: BiomeKey;
  /** The alliance whose home this is (homes), or whose home this entry serves (entries); null for neutrals. */
  alliance: AllianceId | null;
  /** Place on the strategic map, in world units (y grows south); also sets crossing sides and travel times. */
  pos: { x: number; y: number };
  /** Ratings 1..3 (docs/WAR.md "Resources and fauna"). */
  res: Partial<Record<ResourceKey, number>>;
  fauna: string[];
  /** Neighbour ids (symmetric). */
  adj: string[];
}

/** A border between two adjacent regions: where it leaves each map and how long a transfer over it takes. */
export interface WorldEdge {
  a: string;
  b: string;
  /** The entry side of `a` that faces `b`, and of `b` that faces `a`. */
  sideA: Side;
  sideB: Side;
  /** Travel time of a squad between the two (ms, before the season's scale). */
  ms: number;
}

export interface Alliance {
  id: AllianceId;
  key: string;
  name: string;
  home: string;
  quadrant: 'NW' | 'NE' | 'SE' | 'SW';
  specialty: ResourceKey;
  /** Banner colour on the world map. */
  color: string;
}

export interface SeasonConfig {
  id: number;
  name: string;
  /** Multiplies every edge's travel time (dev worlds run faster). */
  travelScale: number;
  /** Extra transfer time per tile a squad stands away from the exit zone toward its target (ms). */
  offExitMsPerTile: number;
  /** A squad may not leave with a foe (mobs included) this close to its centre (tiles). */
  foeRadius: number;
}
