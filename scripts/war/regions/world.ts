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
  { id: 'siren', name: 'Siren Estuary', role: 'neutral', family: 'wet', pos: [-4.4, 0], adjacent: ['dodona-w', 'elaia-w', 'stymphalia'], fauna: [F('bear', 'kraken', true), harpies], resources: { food: 1, salt: 1, silver: 1 }, sea: ['W'], relief: 'cliffs', water: 'river', forest: 0.1 },
  { id: 'ammon', name: 'Ammon Salt Flats', role: 'neutral', family: 'desert', pos: [4.4, 0], adjacent: ['skythia-e', 'kyrene-e', 'ammos'], fauna: [scorpions, lions], resources: { salt: 2, silver: 1 }, sea: ['E'], relief: 'flat', water: 'lake', forest: 0 },
  { id: 'delta', name: 'Achelous Delta', role: 'neutral', family: 'wet', pos: [0, 4.4], adjacent: ['elaia-s', 'kyrene-s', 'achelous'], fauna: [F('bear', 'hydra', true), serpents], resources: { food: 2, iron: 1, salt: 1 }, sea: ['S'], relief: 'flat', water: 'river', forest: 0.05 },
  { id: 'kleisoura', name: 'Kleisoura Pass', role: 'neutral', family: 'mountain', pos: [0, -2.7], adjacent: ['dodona-e', 'skythia-w', 'krios', 'saddle'], fauna: [bandits, bears], resources: { stone: 1, tin: 2 }, relief: 'mountain', water: 'brook', forest: 0.2 },
  { id: 'stymphalia', name: 'Lake Stymphalia', role: 'neutral', family: 'wet', pos: [-2.7, 0], adjacent: ['dodona-s', 'elaia-n', 'siren', 'erymanthos'], fauna: [F('wolf', 'Stymphalian harpies', true), serpents], resources: { food: 2, wood: 1 }, relief: 'flat', water: 'lake', forest: 0.15 },
  { id: 'achelous', name: 'Achelous Ford', role: 'neutral', family: 'wet', pos: [0, 2.7], adjacent: ['elaia-e', 'kyrene-w', 'delta', 'gorge'], fauna: [serpents, bandits], resources: { food: 1, tin: 2 }, relief: 'flat', water: 'river', forest: 0.1 },
  { id: 'ammos', name: 'Ammos Dunes', role: 'neutral', family: 'desert', pos: [2.7, 0], adjacent: ['skythia-s', 'kyrene-n', 'ammon', 'canyons'], fauna: [scorpions, lions], resources: { food: 2, stone: 1 }, relief: 'dunes', water: 'none', forest: 0 },
  { id: 'moors', name: 'Grey Moors', role: 'neutral', family: 'steppe', pos: [-1.5, -1.5], adjacent: ['dodona-e', 'dodona-s', 'saddle', 'erymanthos'], fauna: [wolves, bears], resources: { stone: 2, iron: 1 }, relief: 'plateau', water: 'marsh', forest: 0.05 },
  { id: 'kimmeria', name: 'Kimmerian Hills', role: 'neutral', family: 'steppe', pos: [1.5, -1.5], adjacent: ['skythia-w', 'skythia-s', 'saddle', 'canyons'], fauna: [bandits, horses], resources: { food: 1, stone: 1, horses: 1 }, relief: 'hills', water: 'brook', forest: 0.05 },
  { id: 'savanna', name: 'Lion Savanna', role: 'neutral', family: 'desert', pos: [1.5, 1.5], adjacent: ['kyrene-n', 'kyrene-w', 'canyons', 'gorge'], fauna: [lions, F('jackal', 'Nemean lion', true)], resources: { food: 1, wood: 1, copper: 1 }, relief: 'flat', water: 'brook', forest: 0.1 },
  { id: 'bacchae', name: 'Bacchae Hills', role: 'neutral', family: 'med', pos: [-1.5, 1.5], adjacent: ['elaia-n', 'elaia-e', 'erymanthos', 'gorge'], fauna: [boars, bandits], resources: { food: 2, wood: 1, marble: 1 }, relief: 'hills', water: 'brook', forest: 0.2 },
  { id: 'saddle', name: 'Eagle Saddle', role: 'neutral', family: 'mountain', pos: [0, -1.3], adjacent: ['kleisoura', 'moors', 'kimmeria', 'omphalos'], fauna: [F('bear', 'cyclops'), wolves], resources: { stone: 2, iron: 1 }, relief: 'plateau', water: 'none', forest: 0.1 },
  { id: 'erymanthos', name: 'Erymanthos Wood', role: 'neutral', family: 'forest', pos: [-1.3, 0], adjacent: ['stymphalia', 'moors', 'bacchae', 'omphalos'], fauna: [F('boar', 'Erymanthian boar', true), wolves], resources: { food: 1, wood: 3 }, relief: 'hills', water: 'brook', forest: 0.75 },
  { id: 'gorge', name: 'Gorge of the Falls', role: 'neutral', family: 'mountain', pos: [0, 1.3], adjacent: ['achelous', 'savanna', 'bacchae', 'omphalos'], fauna: [harpies, serpents], resources: { stone: 2, copper: 1 }, relief: 'canyon', water: 'river', forest: 0.1 },
  { id: 'canyons', name: 'Red Canyons', role: 'neutral', family: 'desert', pos: [1.3, 0], adjacent: ['ammos', 'kimmeria', 'savanna', 'omphalos'], fauna: [F('bear', 'chimera', true), scorpions], resources: { stone: 1, copper: 2 }, relief: 'canyon', water: 'none', forest: 0 },
  { id: 'omphalos', name: 'Omphalos Plateau', role: 'center', family: 'med', pos: [0, 0], adjacent: ['saddle', 'erymanthos', 'gorge', 'canyons'], fauna: [F('bear', 'titan', true), F('bear', 'minotaur', true)], resources: { stone: 2, marble: 2, silver: 3 }, relief: 'plateau', water: 'lake', forest: 0.05 },
];

export const byId = new Map(WORLD.map((r) => [r.id, r]));

/** The side a neighbour lies on (dominant axis; a tie goes to E/W) and where along it it would like its entry, 0..1 (N/S: west to east; E/W: north to south). */
function facing(self: WorldRegion, nb: WorldRegion): { side: Side; want: number } {
  const dx = nb.pos[0] - self.pos[0], dy = nb.pos[1] - self.pos[1];
  const horiz = Math.abs(dx) >= Math.abs(dy) - 1e-9;
  const side: Side = horiz ? (dx > 0 ? 'E' : 'W') : dy > 0 ? 'S' : 'N';
  const minor = horiz ? dy / Math.abs(dx) : dx / Math.abs(dy);
  return { side, want: 0.5 + 0.34 * Math.max(-1, Math.min(1, minor)) };
}

/** Entry places a pair of neighbours may share (one along value for both, so the edges line up). */
const SLOTS = [0.16, 0.33, 0.5, 0.67, 0.84];
/** Entries on one side keep at least this far apart. */
export const ENTRY_GAP = 0.3;

/**
 * One `along` per border, the same on both sides of it (an exit on A's east edge at along a is B's west entry at a), so
 * a transfer comes out where it went in. Each side wants its entries ordered as its neighbours lie (`facing`), which a
 * diagonal pair cannot give both of its ends; chosen by a small deterministic search over SLOTS: entries on a side
 * ENTRY_GAP apart (hard), near the middle, and few order swaps against either end's wish.
 */
const ALONG: Map<string, number> = (() => {
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const pairs = [...new Set(WORLD.flatMap((r) => r.adjacent.map((a) => key(r.id, a))))].sort();
  const val = new Map(pairs.map((p) => [p, 0.5]));
  // per region side: its pairs and what each wants there
  const sides = new Map<string, { pair: string; want: number }[]>();
  for (const r of WORLD) for (const a of r.adjacent) {
    const f = facing(r, byId.get(a)!), k = `${r.id}:${f.side}`;
    if (!sides.has(k)) sides.set(k, []);
    sides.get(k)!.push({ pair: key(r.id, a), want: f.want });
  }
  const sidesOf = new Map(pairs.map((p) => [p, [...sides.values()].filter((s) => s.some((e) => e.pair === p))]));
  // start from the wish of the more crowded end (a home's four single entries stay in the middle)
  for (const p of pairs) {
    const ends = sidesOf.get(p)!.map((s) => ({ n: s.length, want: s.find((e) => e.pair === p)!.want }));
    const m = Math.max(...ends.map((e) => e.n)), w = ends.filter((e) => e.n === m).reduce((t, e, _, a) => t + e.want / a.length, 0);
    val.set(p, SLOTS.reduce((b, v) => (Math.abs(v - w) < Math.abs(b - w) ? v : b)));
  }
  const sideCost = (s: { pair: string; want: number }[]) => {
    let c = 0;
    for (let i = 0; i < s.length; i++) {
      const vi = val.get(s[i].pair)!;
      c += (vi - 0.5) ** 2;
      for (let j = i + 1; j < s.length; j++) {
        const vj = val.get(s[j].pair)!;
        if (Math.abs(vi - vj) < ENTRY_GAP - 1e-9) c += 100;
        else if (Math.sign(vi - vj) !== Math.sign(s[i].want - s[j].want) && Math.abs(s[i].want - s[j].want) > 1e-9) c += 0.15;
      }
    }
    return c;
  };
  for (let round = 0; round < 50; round++) {
    let moved = false;
    for (const p of pairs) {
      const cur = val.get(p)!, cost = () => sidesOf.get(p)!.reduce((t, s) => t + sideCost(s), 0);
      let best = cur, bc = cost();
      for (const v of SLOTS) { val.set(p, v); const c = cost(); if (c < bc - 1e-9) (bc = c), (best = v); }
      val.set(p, best);
      if (best !== cur) moved = true;
    }
    if (!moved) break;
  }
  for (const s of sides.values()) if (sideCost(s) >= 100) throw new Error(`entries crowd a side: ${s.map((e) => e.pair).join(', ')}`);
  return val;
})();

/** Where a region's neighbour lies: the side and the place along it, 0..1 (N/S: west to east; E/W: north to south), shared by both ends of the border. */
export function sideOf(self: WorldRegion, nb: WorldRegion): { side: Side; along: number } {
  const { side } = facing(self, nb);
  return { side, along: ALONG.get(self.id < nb.id ? `${self.id}|${nb.id}` : `${nb.id}|${self.id}`)! };
}

/** Symmetry check of the table (adjacency both ways). */
export function checkWorld(): string[] {
  const bad: string[] = [];
  for (const r of WORLD) for (const a of r.adjacent) if (!byId.get(a)?.adjacent.includes(r.id)) bad.push(`${r.id} -> ${a}`);
  for (const r of WORLD) if (!BRIEF[r.id]) bad.push(`${r.id}: no brief`);
  return bad;
}

// ======================================================================= strategic geography (docs/WAR.md)

/** Region types of docs/WAR.md "Purpose of every region". */
export type Purpose = 'resource' | 'trade' | 'choke' | 'fortress' | 'bread' | 'sacred' | 'buffer' | 'coastal';
/**
 * A feature the region map must have (its "Region map must have" line), checked on the built map by ./checks.ts:
 * square (town square >= 24 x 24 flat tiles at spot `market`), narrows (a passage <= 10 tiles wide at spot `narrows`),
 * highGround (2+ levels over the narrows, near it), bridgeSite (a river narrows a bridge can span), nodes (the scarce
 * goods' nodes, the lair by the richest, a haul road to an entry), fields (farm plots near water at spot `fields`),
 * olives (groves at spot `olives`), ridge (a defensive ridge 2+ levels over the land at spot `ridge`), fortress (a flat
 * top >= 30 x 30 with at most `ways` ways up at spot `fortress`), beach (a landing beach), lookouts (3+ mounds).
 */
export type Need = 'square' | 'narrows' | 'highGround' | 'bridgeSite' | 'nodes' | 'fields' | 'olives' | 'ridge' | 'fortress' | 'beach' | 'lookouts';
export interface Brief { purpose: [Purpose, Purpose]; needs: Need[]; ways?: number; goods?: string[] }

/** Goods that count as scarce (a resource heart's nodes; silver and salt have no node art: a spot). */
export const SCARCE = ['tin', 'iron', 'copper', 'marble', 'silver', 'salt'] as const;

/** Per region: purpose (primary, secondary), the checked must-haves, and the new goods of the "Resources" table (meta only). */
export const BRIEF: Record<string, Brief> = {
  dodona: { purpose: ['resource', 'trade'], needs: ['square', 'nodes', 'ridge'], goods: ['pitch'] },
  skythia: { purpose: ['bread', 'trade'], needs: ['square', 'lookouts'], goods: ['hides'] },
  kyrene: { purpose: ['resource', 'trade'], needs: ['square', 'nodes'] },
  elaia: { purpose: ['resource', 'coastal'], needs: ['square', 'nodes', 'olives', 'fortress', 'beach'], ways: 1, goods: ['olives'] },
  'dodona-n': { purpose: ['buffer', 'coastal'], needs: ['narrows', 'highGround', 'ridge', 'beach'], goods: ['pitch'] },
  'dodona-w': { purpose: ['buffer', 'coastal'], needs: ['ridge', 'beach'] },
  'dodona-e': { purpose: ['choke', 'resource'], needs: ['narrows', 'highGround', 'nodes'], goods: ['pitch'] },
  'dodona-s': { purpose: ['choke', 'bread'], needs: ['narrows', 'highGround', 'bridgeSite', 'fields'], goods: ['herbs'] },
  'skythia-n': { purpose: ['buffer', 'coastal'], needs: ['ridge', 'beach'], goods: ['hides'] },
  'skythia-e': { purpose: ['buffer', 'coastal'], needs: ['ridge', 'beach'], goods: ['hides'] },
  'skythia-w': { purpose: ['choke', 'resource'], needs: ['narrows', 'highGround'], goods: ['pitch'] },
  'skythia-s': { purpose: ['buffer', 'bread'], needs: ['ridge', 'fields'], goods: ['hides'] },
  'kyrene-n': { purpose: ['choke', 'resource'], needs: ['narrows', 'highGround', 'nodes'] },
  'kyrene-e': { purpose: ['resource', 'coastal'], needs: ['nodes', 'narrows', 'beach'] },
  'kyrene-s': { purpose: ['resource', 'buffer'], needs: ['nodes', 'ridge'] },
  'kyrene-w': { purpose: ['bread', 'choke'], needs: ['square', 'fields', 'narrows', 'bridgeSite'], goods: ['flax'] },
  'elaia-n': { purpose: ['bread', 'choke'], needs: ['fields', 'narrows'], goods: ['flax', 'herbs'] },
  'elaia-w': { purpose: ['coastal', 'resource'], needs: ['beach', 'ridge'], goods: ['pitch'] },
  'elaia-s': { purpose: ['fortress', 'buffer'], needs: ['fortress', 'beach'], ways: 2 },
  'elaia-e': { purpose: ['bread', 'choke'], needs: ['square', 'olives', 'narrows', 'bridgeSite'], goods: ['olives'] },
  krios: { purpose: ['resource', 'choke'], needs: ['nodes', 'narrows', 'highGround'] },
  siren: { purpose: ['resource', 'coastal'], needs: ['nodes', 'beach'], goods: ['flax'] },
  ammon: { purpose: ['resource', 'fortress'], needs: ['nodes', 'fortress'], ways: 1 },
  delta: { purpose: ['resource', 'bread'], needs: ['nodes', 'fields', 'narrows'], goods: ['flax', 'herbs'] },
  kleisoura: { purpose: ['choke', 'resource'], needs: ['narrows', 'highGround', 'square', 'nodes'] },
  stymphalia: { purpose: ['trade', 'choke'], needs: ['square', 'narrows', 'highGround'], goods: ['flax', 'herbs'] },
  achelous: { purpose: ['choke', 'resource'], needs: ['narrows', 'bridgeSite', 'square', 'nodes'] },
  ammos: { purpose: ['trade', 'buffer'], needs: ['square', 'ridge'] },
  moors: { purpose: ['fortress', 'resource'], needs: ['fortress', 'nodes'], ways: 2 },
  kimmeria: { purpose: ['fortress', 'bread'], needs: ['fortress'], ways: 1 },
  savanna: { purpose: ['resource', 'fortress'], needs: ['nodes', 'fortress'], ways: 2, goods: ['hides'] },
  bacchae: { purpose: ['bread', 'resource'], needs: ['olives', 'fields', 'nodes'], goods: ['olives', 'herbs'] },
  saddle: { purpose: ['choke', 'resource'], needs: ['narrows', 'highGround', 'nodes'] },
  erymanthos: { purpose: ['choke', 'resource'], needs: ['narrows', 'highGround'], goods: ['herbs'] },
  gorge: { purpose: ['choke', 'resource'], needs: ['narrows', 'highGround', 'nodes'] },
  canyons: { purpose: ['choke', 'resource'], needs: ['narrows', 'highGround', 'nodes'] },
  omphalos: { purpose: ['sacred', 'resource'], needs: ['square', 'fortress'], ways: 4 },
};

/** The trade routes of docs/WAR.md "Trade routes" as region sequences; a step may offer alternatives (the Sacred Way's gates). */
export const ROUTES: { name: string; path: string[][] }[] = [
  { name: 'Tin Road', path: [['dodona'], ['dodona-e'], ['kleisoura'], ['skythia-w'], ['skythia']] },
  { name: 'Lake Road', path: [['dodona'], ['dodona-s'], ['stymphalia'], ['elaia-n'], ['elaia']] },
  { name: 'River Road', path: [['elaia'], ['elaia-e'], ['achelous'], ['kyrene-w'], ['kyrene']] },
  { name: 'Desert Road', path: [['skythia'], ['skythia-s'], ['ammos'], ['kyrene-n'], ['kyrene']] },
  { name: 'Sacred Way (iron arm)', path: [['dodona'], ['dodona-s'], ['moors'], ['saddle', 'erymanthos'], ['omphalos'], ['canyons', 'gorge'], ['savanna'], ['kyrene-n'], ['kyrene']] },
  { name: 'Sacred Way (marble arm)', path: [['skythia'], ['skythia-s'], ['kimmeria'], ['saddle', 'canyons'], ['omphalos'], ['erymanthos', 'gorge'], ['bacchae'], ['elaia-n'], ['elaia']] },
];

/**
 * The legs a region's roads must join, per route through it: [a, b], each a neighbour (its entry) or 'market' (the
 * route ends at this region's square). Only real neighbours count (a step's alternatives need not all border it).
 */
export function routeLegs(id: string): { route: string; a: string; b: string }[] {
  const out: { route: string; a: string; b: string }[] = [], adj = new Set(byId.get(id)?.adjacent ?? []);
  for (const r of ROUTES) r.path.forEach((step, n) => {
    if (!step.includes(id)) return;
    const prev = n > 0 ? r.path[n - 1].filter((p) => adj.has(p)) : ['market'];
    const next = n < r.path.length - 1 ? r.path[n + 1].filter((p) => adj.has(p)) : ['market'];
    for (const a of prev) for (const b of next) if (!out.some((o) => (o.a === a && o.b === b) || (o.a === b && o.b === a))) out.push({ route: r.name, a, b });
  });
  return out;
}
