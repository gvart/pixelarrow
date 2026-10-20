/**
 * The 37 regions of docs/WAR.md "World" as authoring data: role, biome family, rough position on the continent
 * (x east, y south, Omphalos at 0,0; only used to tell which side of a region each neighbour lies on), adjacency,
 * fauna, resources. The region scripts read it for their entries (one per neighbour, on the side facing it),
 * lairs and resource nodes; the generated JSON carries it as `meta` for the world layer.
 */
import type { MobKind } from '../../../src/war/types.ts';

export type Role = 'home' | 'entry' | 'neutral' | 'center';
/** Biome family: picks the art libraries and the draft template. */
export type Family = 'forest' | 'mountain' | 'steppe' | 'desert' | 'med' | 'wet';
export type Side = 'N' | 'E' | 'S' | 'W';
/** A WAR.md fauna entry: the sim mob kind standing in for it, the lore name, and whether it is the region's lair (tier 3/4). */
export interface Fauna { kind: MobKind; as: string; lair?: boolean }
export interface WorldRegion {
  id: string; name: string; role: Role; family: Family; pos: [number, number];
  adjacent: string[]; fauna: Fauna[]; resources: Record<string, number>;
  /** Sides on the sea (edge regions). */
  sea?: Side[];
  /** Draft template knobs. */
  relief: 'flat' | 'hills' | 'mountain' | 'plateau' | 'dunes' | 'canyon' | 'cliffs';
  water: 'none' | 'brook' | 'river' | 'lake' | 'marsh' | 'fjord';
  forest: number;
}

const F = (kind: MobKind, as: string, lair = false): Fauna => (lair ? { kind, as, lair } : { kind, as });
const wolves = F('wolf', 'wolves'), boars = F('boar', 'boars'), bears = F('bear', 'bears'), bandits = F('bandit', 'bandits');
const horses = F('ibex', 'wild horses'), lions = F('jackal', 'lions'), scorpions = F('jackal', 'scorpions');
const serpents = F('boar', 'river serpents'), harpies = F('wolf', 'harpies'), pirates = F('bandit', 'pirates');

export const WORLD: WorldRegion[] = [
  { id: 'dodona', name: 'Dodona', role: 'home', family: 'forest', pos: [-3, -3], adjacent: ['dodona-n', 'dodona-e', 'dodona-s', 'dodona-w'], fauna: [], resources: { food: 2, wood: 3, stone: 2, iron: 2 }, relief: 'hills', water: 'lake', forest: 0.6 },
  { id: 'dodona-n', name: 'Boreas Fjords', role: 'entry', family: 'forest', pos: [-3, -4.2], adjacent: ['dodona', 'dodona-w', 'dodona-e', 'krios'], fauna: [wolves, bears], resources: { food: 1, wood: 2, stone: 1 }, sea: ['N'], relief: 'cliffs', water: 'fjord', forest: 0.4 },
  { id: 'dodona-w', name: 'Western Heath', role: 'entry', family: 'steppe', pos: [-4.2, -3], adjacent: ['dodona', 'dodona-n', 'dodona-s', 'siren'], fauna: [wolves, boars], resources: { food: 1, wood: 1, stone: 2 }, sea: ['W'], relief: 'cliffs', water: 'marsh', forest: 0.1 },
  { id: 'dodona-e', name: 'Teeth Foothills', role: 'entry', family: 'mountain', pos: [-1.8, -3], adjacent: ['dodona', 'dodona-n', 'dodona-s', 'kleisoura', 'moors'], fauna: [bears, bandits], resources: { wood: 1, stone: 2, iron: 1 }, relief: 'mountain', water: 'brook', forest: 0.4 },
  { id: 'dodona-s', name: 'Ladon Oakwood', role: 'entry', family: 'forest', pos: [-3, -1.8], adjacent: ['dodona', 'dodona-w', 'dodona-e', 'stymphalia', 'moors'], fauna: [boars, wolves], resources: { food: 1, wood: 2 }, relief: 'hills', water: 'river', forest: 0.7 },
  { id: 'skythia', name: 'Skythia', role: 'home', family: 'steppe', pos: [3, -3], adjacent: ['skythia-n', 'skythia-e', 'skythia-s', 'skythia-w'], fauna: [], resources: { food: 3, wood: 1, stone: 2, horses: 3 }, relief: 'plateau', water: 'river', forest: 0.05 },
  { id: 'skythia-n', name: 'Frost Steppe', role: 'entry', family: 'steppe', pos: [3, -4.2], adjacent: ['skythia', 'skythia-w', 'skythia-e', 'krios'], fauna: [wolves, horses], resources: { food: 1, stone: 1, horses: 1 }, sea: ['N'], relief: 'flat', water: 'marsh', forest: 0.02 },
  { id: 'skythia-e', name: 'Chalk Coast', role: 'entry', family: 'steppe', pos: [4.2, -3], adjacent: ['skythia', 'skythia-n', 'skythia-s', 'ammon'], fauna: [horses, boars], resources: { food: 1, stone: 2, horses: 1 }, sea: ['E'], relief: 'cliffs', water: 'none', forest: 0.05 },
  { id: 'skythia-w', name: 'Teeth Eastern Slopes', role: 'entry', family: 'mountain', pos: [1.8, -3], adjacent: ['skythia', 'skythia-n', 'skythia-s', 'kleisoura', 'kimmeria'], fauna: [bears, bandits], resources: { wood: 2, stone: 2 }, relief: 'mountain', water: 'brook', forest: 0.4 },
  { id: 'skythia-s', name: 'Kurgan Hills', role: 'entry', family: 'steppe', pos: [3, -1.8], adjacent: ['skythia', 'skythia-w', 'skythia-e', 'ammos', 'kimmeria'], fauna: [horses, wolves], resources: { food: 2, horses: 1 }, relief: 'hills', water: 'brook', forest: 0.03 },
  { id: 'kyrene', name: 'Kyrene', role: 'home', family: 'desert', pos: [3, 3], adjacent: ['kyrene-n', 'kyrene-e', 'kyrene-s', 'kyrene-w'], fauna: [], resources: { food: 2, wood: 1, stone: 3, copper: 3 }, relief: 'canyon', water: 'river', forest: 0.05 },
  { id: 'kyrene-n', name: 'Thornscrub Rise', role: 'entry', family: 'desert', pos: [3, 1.8], adjacent: ['kyrene', 'kyrene-w', 'kyrene-e', 'ammos', 'savanna'], fauna: [lions, scorpions], resources: { stone: 2, copper: 1 }, relief: 'hills', water: 'none', forest: 0.05 },
  { id: 'kyrene-e', name: 'Lagoon Coast', role: 'entry', family: 'desert', pos: [4.2, 3], adjacent: ['kyrene', 'kyrene-n', 'kyrene-s', 'ammon'], fauna: [scorpions, bandits], resources: { food: 1, salt: 2 }, sea: ['E'], relief: 'dunes', water: 'marsh', forest: 0 },
  { id: 'kyrene-s', name: 'Southern Dunes', role: 'entry', family: 'desert', pos: [3, 4.2], adjacent: ['kyrene', 'kyrene-w', 'kyrene-e', 'delta'], fauna: [scorpions, lions], resources: { stone: 1, salt: 1 }, sea: ['S'], relief: 'dunes', water: 'none', forest: 0 },
  { id: 'kyrene-w', name: 'Eastbank Floodplain', role: 'entry', family: 'wet', pos: [1.8, 3], adjacent: ['kyrene', 'kyrene-n', 'kyrene-s', 'achelous', 'savanna'], fauna: [serpents, boars], resources: { food: 2, wood: 1 }, relief: 'flat', water: 'river', forest: 0.1 },
  { id: 'elaia', name: 'Elaia', role: 'home', family: 'med', pos: [-3, 3], adjacent: ['elaia-n', 'elaia-e', 'elaia-s', 'elaia-w'], fauna: [], resources: { food: 3, wood: 2, stone: 2, marble: 2 }, relief: 'hills', water: 'brook', forest: 0.15 },
  { id: 'elaia-n', name: 'Lakeshore Fens', role: 'entry', family: 'wet', pos: [-3, 1.8], adjacent: ['elaia', 'elaia-w', 'elaia-e', 'stymphalia', 'bacchae'], fauna: [serpents, boars], resources: { food: 2, wood: 1 }, relief: 'flat', water: 'marsh', forest: 0.1 },
  { id: 'elaia-w', name: 'Pirate Coves', role: 'entry', family: 'med', pos: [-4.2, 3], adjacent: ['elaia', 'elaia-n', 'elaia-s', 'siren'], fauna: [pirates, boars], resources: { food: 1, wood: 2 }, sea: ['W'], relief: 'cliffs', water: 'none', forest: 0.35 },
  { id: 'elaia-s', name: 'Cape of Winds', role: 'entry', family: 'med', pos: [-3, 4.2], adjacent: ['elaia', 'elaia-w', 'elaia-e', 'delta'], fauna: [boars, bandits], resources: { food: 1, stone: 2 }, sea: ['S'], relief: 'cliffs', water: 'none', forest: 0.1 },
  { id: 'elaia-e', name: 'Westbank Vineyards', role: 'entry', family: 'med', pos: [-1.8, 3], adjacent: ['elaia', 'elaia-n', 'elaia-s', 'achelous', 'bacchae'], fauna: [boars, wolves], resources: { food: 2, wood: 1 }, relief: 'hills', water: 'river', forest: 0.1 },
  { id: 'krios', name: 'Krios Glacier', role: 'neutral', family: 'mountain', pos: [0, -4.4], adjacent: ['dodona-n', 'skythia-n', 'kleisoura'], fauna: [F('bear', 'cyclops', true), wolves], resources: { stone: 1, iron: 2 }, sea: ['N'], relief: 'mountain', water: 'none', forest: 0.1 },
  { id: 'siren', name: 'Siren Estuary', role: 'neutral', family: 'wet', pos: [-4.4, 0], adjacent: ['dodona-w', 'elaia-w', 'stymphalia'], fauna: [F('bear', 'kraken', true), harpies], resources: { food: 1, wood: 1, silver: 1 }, sea: ['W'], relief: 'cliffs', water: 'river', forest: 0.1 },
  { id: 'ammon', name: 'Ammon Salt Flats', role: 'neutral', family: 'desert', pos: [4.4, 0], adjacent: ['skythia-e', 'kyrene-e', 'ammos'], fauna: [scorpions, lions], resources: { salt: 2, silver: 1 }, sea: ['E'], relief: 'flat', water: 'lake', forest: 0 },
  { id: 'delta', name: 'Achelous Delta', role: 'neutral', family: 'wet', pos: [0, 4.4], adjacent: ['elaia-s', 'kyrene-s', 'achelous'], fauna: [F('bear', 'hydra', true), serpents], resources: { food: 2, iron: 1, salt: 1 }, sea: ['S'], relief: 'flat', water: 'river', forest: 0.05 },
  { id: 'kleisoura', name: 'Kleisoura Pass', role: 'neutral', family: 'mountain', pos: [0, -2.7], adjacent: ['dodona-e', 'skythia-w', 'krios', 'saddle'], fauna: [bandits, bears], resources: { stone: 1, tin: 2 }, relief: 'mountain', water: 'brook', forest: 0.2 },
  { id: 'stymphalia', name: 'Lake Stymphalia', role: 'neutral', family: 'wet', pos: [-2.7, 0], adjacent: ['dodona-s', 'elaia-n', 'siren', 'erymanthos'], fauna: [F('wolf', 'Stymphalian harpies', true), serpents], resources: { food: 2, wood: 1 }, relief: 'flat', water: 'lake', forest: 0.15 },
  { id: 'achelous', name: 'Achelous Ford', role: 'neutral', family: 'wet', pos: [0, 2.7], adjacent: ['elaia-e', 'kyrene-w', 'delta', 'gorge'], fauna: [serpents, bandits], resources: { food: 1, tin: 2 }, relief: 'flat', water: 'river', forest: 0.1 },
  { id: 'ammos', name: 'Ammos Dunes', role: 'neutral', family: 'desert', pos: [2.7, 0], adjacent: ['skythia-s', 'kyrene-n', 'ammon', 'canyons'], fauna: [scorpions, lions], resources: { food: 1, stone: 1, copper: 1 }, relief: 'dunes', water: 'none', forest: 0 },
  { id: 'moors', name: 'Grey Moors', role: 'neutral', family: 'steppe', pos: [-1.5, -1.5], adjacent: ['dodona-e', 'dodona-s', 'saddle', 'erymanthos'], fauna: [wolves, bears], resources: { stone: 2, iron: 1 }, relief: 'plateau', water: 'marsh', forest: 0.05 },
  { id: 'kimmeria', name: 'Kimmerian Hills', role: 'neutral', family: 'steppe', pos: [1.5, -1.5], adjacent: ['skythia-w', 'skythia-s', 'saddle', 'canyons'], fauna: [bandits, horses], resources: { food: 1, stone: 1, horses: 1 }, relief: 'hills', water: 'brook', forest: 0.05 },
  { id: 'savanna', name: 'Lion Savanna', role: 'neutral', family: 'desert', pos: [1.5, 1.5], adjacent: ['kyrene-n', 'kyrene-w', 'canyons', 'gorge'], fauna: [lions, F('jackal', 'Nemean lion', true)], resources: { food: 1, wood: 1, copper: 1 }, relief: 'flat', water: 'brook', forest: 0.1 },
  { id: 'bacchae', name: 'Bacchae Hills', role: 'neutral', family: 'med', pos: [-1.5, 1.5], adjacent: ['elaia-n', 'elaia-e', 'erymanthos', 'gorge'], fauna: [boars, bandits], resources: { food: 2, wood: 1, marble: 1 }, relief: 'hills', water: 'brook', forest: 0.2 },
  { id: 'saddle', name: 'Eagle Saddle', role: 'neutral', family: 'mountain', pos: [0, -1.3], adjacent: ['kleisoura', 'moors', 'kimmeria', 'omphalos'], fauna: [F('bear', 'cyclops'), wolves], resources: { stone: 2, iron: 1 }, relief: 'plateau', water: 'none', forest: 0.1 },
  { id: 'erymanthos', name: 'Erymanthos Wood', role: 'neutral', family: 'forest', pos: [-1.3, 0], adjacent: ['stymphalia', 'moors', 'bacchae', 'omphalos'], fauna: [F('boar', 'Erymanthian boar', true), wolves], resources: { food: 1, wood: 3 }, relief: 'hills', water: 'brook', forest: 0.75 },
  { id: 'gorge', name: 'Gorge of the Falls', role: 'neutral', family: 'mountain', pos: [0, 1.3], adjacent: ['achelous', 'savanna', 'bacchae', 'omphalos'], fauna: [harpies, serpents], resources: { food: 1, stone: 2 }, relief: 'canyon', water: 'river', forest: 0.1 },
  { id: 'canyons', name: 'Red Canyons', role: 'neutral', family: 'desert', pos: [1.3, 0], adjacent: ['ammos', 'kimmeria', 'savanna', 'omphalos'], fauna: [F('bear', 'chimera', true), scorpions], resources: { stone: 1, copper: 2 }, relief: 'canyon', water: 'none', forest: 0 },
  { id: 'omphalos', name: 'Omphalos Plateau', role: 'center', family: 'med', pos: [0, 0], adjacent: ['saddle', 'erymanthos', 'gorge', 'canyons'], fauna: [F('bear', 'titan', true), F('bear', 'minotaur', true)], resources: { stone: 2, marble: 2, silver: 3 }, relief: 'plateau', water: 'lake', forest: 0.05 },
];

export const byId = new Map(WORLD.map((r) => [r.id, r]));

/** Where a region's neighbour lies: the side (dominant axis; a tie goes to E/W) and the place along it, 0..1 (N/S: west to east; E/W: north to south). */
export function sideOf(self: WorldRegion, nb: WorldRegion): { side: Side; along: number } {
  const dx = nb.pos[0] - self.pos[0], dy = nb.pos[1] - self.pos[1];
  const horiz = Math.abs(dx) >= Math.abs(dy) - 1e-9;
  const side: Side = horiz ? (dx > 0 ? 'E' : 'W') : dy > 0 ? 'S' : 'N';
  const minor = horiz ? dy / Math.abs(dx) : dx / Math.abs(dy);
  return { side, along: 0.5 + 0.34 * Math.max(-1, Math.min(1, minor)) };
}

/** Symmetry check of the table (adjacency both ways). */
export function checkWorld(): string[] {
  const bad: string[] = [];
  for (const r of WORLD) for (const a of r.adjacent) if (!byId.get(a)?.adjacent.includes(r.id)) bad.push(`${r.id} -> ${a}`);
  return bad;
}
