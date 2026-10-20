/**
 * The 37 world regions as data (docs/WAR.md "Regions"; the table there is the source, keep both in step).
 *
 * pos: the strategic map in world units, Omphalos at the origin, y south. Homes sit at (±7, ±7) with their four
 * entries 2.5 units away on N/E/S/W; the inner neutrals at (±3.5, ±3.5), the gates 3 from the centre, the mid and edge
 * neutrals between the quadrants. Crossing sides and travel times come from these places (./graph.ts).
 */
import type { WorldRegion } from './types';

type Row = Omit<WorldRegion, 'adj'> & { adj: string };
const r = (row: Row): WorldRegion => ({ ...row, adj: row.adj.split(/,\s*/) });

export const WORLD_REGIONS: readonly WorldRegion[] = [
  // ---- Dodona (NW)
  r({ id: 'dodona', name: 'Dodona', role: 'home', biome: 'dodona', alliance: 0, pos: { x: -7, y: -7 }, res: { food: 2, wood: 3, stone: 2, iron: 2 }, fauna: [], adj: 'dodona-n, dodona-e, dodona-s, dodona-w' }),
  r({ id: 'dodona-n', name: 'Boreas Fjords', role: 'entry', biome: 'coast', alliance: 0, pos: { x: -7, y: -9.5 }, res: { food: 1, wood: 2, stone: 1 }, fauna: ['wolf', 'bear'], adj: 'dodona, dodona-w, dodona-e, krios' }),
  r({ id: 'dodona-w', name: 'Western Heath', role: 'entry', biome: 'dodona', alliance: 0, pos: { x: -9.5, y: -7 }, res: { food: 1, wood: 1, stone: 2 }, fauna: ['wolf', 'boar'], adj: 'dodona, dodona-n, dodona-s, siren' }),
  r({ id: 'dodona-e', name: 'Teeth Foothills', role: 'entry', biome: 'mountains', alliance: 0, pos: { x: -4.5, y: -7 }, res: { wood: 1, stone: 2, iron: 1 }, fauna: ['bear', 'bandit'], adj: 'dodona, dodona-n, dodona-s, kleisoura, moors' }),
  r({ id: 'dodona-s', name: 'Ladon Oakwood', role: 'entry', biome: 'dodona', alliance: 0, pos: { x: -7, y: -4.5 }, res: { food: 1, wood: 2 }, fauna: ['boar', 'wolf'], adj: 'dodona, dodona-w, dodona-e, stymphalia, moors' }),
  // ---- Skythia (NE)
  r({ id: 'skythia', name: 'Skythia', role: 'home', biome: 'skythia', alliance: 1, pos: { x: 7, y: -7 }, res: { food: 3, wood: 1, stone: 2, horses: 3 }, fauna: [], adj: 'skythia-n, skythia-e, skythia-s, skythia-w' }),
  r({ id: 'skythia-n', name: 'Frost Steppe', role: 'entry', biome: 'skythia', alliance: 1, pos: { x: 7, y: -9.5 }, res: { food: 1, stone: 1, horses: 1 }, fauna: ['wolf', 'wild horse'], adj: 'skythia, skythia-w, skythia-e, krios' }),
  r({ id: 'skythia-e', name: 'Chalk Coast', role: 'entry', biome: 'coast', alliance: 1, pos: { x: 9.5, y: -7 }, res: { food: 1, stone: 2, horses: 1 }, fauna: ['wild horse', 'boar'], adj: 'skythia, skythia-n, skythia-s, ammon' }),
  r({ id: 'skythia-w', name: 'Teeth Eastern Slopes', role: 'entry', biome: 'mountains', alliance: 1, pos: { x: 4.5, y: -7 }, res: { wood: 2, stone: 2 }, fauna: ['bear', 'bandit'], adj: 'skythia, skythia-n, skythia-s, kleisoura, kimmeria' }),
  r({ id: 'skythia-s', name: 'Kurgan Hills', role: 'entry', biome: 'skythia', alliance: 1, pos: { x: 7, y: -4.5 }, res: { food: 2, horses: 1 }, fauna: ['wild horse', 'wolf'], adj: 'skythia, skythia-w, skythia-e, ammos, kimmeria' }),
  // ---- Kyrene (SE)
  r({ id: 'kyrene', name: 'Kyrene', role: 'home', biome: 'kyrene', alliance: 2, pos: { x: 7, y: 7 }, res: { food: 2, wood: 1, stone: 3, copper: 3 }, fauna: [], adj: 'kyrene-n, kyrene-e, kyrene-s, kyrene-w' }),
  r({ id: 'kyrene-n', name: 'Thornscrub Rise', role: 'entry', biome: 'kyrene', alliance: 2, pos: { x: 7, y: 4.5 }, res: { stone: 2, copper: 1 }, fauna: ['lion', 'scorpion'], adj: 'kyrene, kyrene-w, kyrene-e, ammos, savanna' }),
  r({ id: 'kyrene-e', name: 'Lagoon Coast', role: 'entry', biome: 'coast', alliance: 2, pos: { x: 9.5, y: 7 }, res: { food: 1, salt: 2 }, fauna: ['scorpion', 'bandit'], adj: 'kyrene, kyrene-n, kyrene-s, ammon' }),
  r({ id: 'kyrene-s', name: 'Southern Dunes', role: 'entry', biome: 'kyrene', alliance: 2, pos: { x: 7, y: 9.5 }, res: { stone: 1, salt: 1 }, fauna: ['scorpion', 'lion'], adj: 'kyrene, kyrene-w, kyrene-e, delta' }),
  r({ id: 'kyrene-w', name: 'Eastbank Floodplain', role: 'entry', biome: 'marsh', alliance: 2, pos: { x: 4.5, y: 7 }, res: { food: 2, wood: 1 }, fauna: ['river serpent', 'boar'], adj: 'kyrene, kyrene-n, kyrene-s, achelous, savanna' }),
  // ---- Elaia (SW)
  r({ id: 'elaia', name: 'Elaia', role: 'home', biome: 'elaia', alliance: 3, pos: { x: -7, y: 7 }, res: { food: 3, wood: 2, stone: 2, marble: 2 }, fauna: [], adj: 'elaia-n, elaia-e, elaia-s, elaia-w' }),
  r({ id: 'elaia-n', name: 'Lakeshore Fens', role: 'entry', biome: 'marsh', alliance: 3, pos: { x: -7, y: 4.5 }, res: { food: 2, wood: 1 }, fauna: ['river serpent', 'boar'], adj: 'elaia, elaia-w, elaia-e, stymphalia, bacchae' }),
  r({ id: 'elaia-w', name: 'Pirate Coves', role: 'entry', biome: 'coast', alliance: 3, pos: { x: -9.5, y: 7 }, res: { food: 1, wood: 2 }, fauna: ['pirate', 'boar'], adj: 'elaia, elaia-n, elaia-s, siren' }),
  r({ id: 'elaia-s', name: 'Cape of Winds', role: 'entry', biome: 'coast', alliance: 3, pos: { x: -7, y: 9.5 }, res: { food: 1, stone: 2 }, fauna: ['boar', 'bandit'], adj: 'elaia, elaia-w, elaia-e, delta' }),
  r({ id: 'elaia-e', name: 'Westbank Vineyards', role: 'entry', biome: 'elaia', alliance: 3, pos: { x: -4.5, y: 7 }, res: { food: 2, wood: 1 }, fauna: ['boar', 'wolf'], adj: 'elaia, elaia-n, elaia-s, achelous, bacchae' }),
  // ---- edge neutrals
  r({ id: 'krios', name: 'Krios Glacier', role: 'neutral', biome: 'mountains', alliance: null, pos: { x: 0, y: -10 }, res: { stone: 1, iron: 2 }, fauna: ['cyclops (lair)', 'wolf'], adj: 'dodona-n, skythia-n, kleisoura' }),
  r({ id: 'siren', name: 'Siren Estuary', role: 'neutral', biome: 'coast', alliance: null, pos: { x: -10.5, y: 0 }, res: { food: 1, wood: 1, silver: 1 }, fauna: ['kraken (lair)', 'harpy'], adj: 'dodona-w, elaia-w, stymphalia' }),
  r({ id: 'ammon', name: 'Ammon Salt Flats', role: 'neutral', biome: 'kyrene', alliance: null, pos: { x: 10.5, y: 0 }, res: { salt: 2, silver: 1 }, fauna: ['scorpion', 'lion'], adj: 'skythia-e, kyrene-e, ammos' }),
  r({ id: 'delta', name: 'Achelous Delta', role: 'neutral', biome: 'marsh', alliance: null, pos: { x: 0, y: 10 }, res: { food: 2, iron: 1, salt: 1 }, fauna: ['hydra (lair)', 'river serpent'], adj: 'elaia-s, kyrene-s, achelous' }),
  // ---- mid neutrals (the two tin sources, the lake, the dunes)
  r({ id: 'kleisoura', name: 'Kleisoura Pass', role: 'neutral', biome: 'mountains', alliance: null, pos: { x: 0, y: -7 }, res: { stone: 1, tin: 2 }, fauna: ['bandit', 'bear'], adj: 'dodona-e, skythia-w, krios, saddle' }),
  r({ id: 'stymphalia', name: 'Lake Stymphalia', role: 'neutral', biome: 'marsh', alliance: null, pos: { x: -7, y: 0 }, res: { food: 2, wood: 1 }, fauna: ['Stymphalian harpies (lair)', 'river serpent'], adj: 'dodona-s, elaia-n, siren, erymanthos' }),
  r({ id: 'achelous', name: 'Achelous Ford', role: 'neutral', biome: 'marsh', alliance: null, pos: { x: 0, y: 7 }, res: { food: 1, tin: 2 }, fauna: ['river serpent', 'bandit'], adj: 'elaia-e, kyrene-w, delta, gorge' }),
  r({ id: 'ammos', name: 'Ammos Dunes', role: 'neutral', biome: 'kyrene', alliance: null, pos: { x: 7, y: 0 }, res: { food: 1, stone: 1, copper: 1 }, fauna: ['scorpion', 'lion'], adj: 'skythia-s, kyrene-n, ammon, canyons' }),
  // ---- inner neutrals
  r({ id: 'moors', name: 'Grey Moors', role: 'neutral', biome: 'mountains', alliance: null, pos: { x: -3.5, y: -3.5 }, res: { stone: 2, iron: 1 }, fauna: ['wolf', 'bear'], adj: 'dodona-e, dodona-s, saddle, erymanthos' }),
  r({ id: 'kimmeria', name: 'Kimmerian Hills', role: 'neutral', biome: 'skythia', alliance: null, pos: { x: 3.5, y: -3.5 }, res: { food: 1, stone: 1, horses: 1 }, fauna: ['bandit', 'wild horse'], adj: 'skythia-w, skythia-s, saddle, canyons' }),
  r({ id: 'savanna', name: 'Lion Savanna', role: 'neutral', biome: 'kyrene', alliance: null, pos: { x: 3.5, y: 3.5 }, res: { food: 1, wood: 1, copper: 1 }, fauna: ['lion', 'Nemean lion (lair)'], adj: 'kyrene-n, kyrene-w, canyons, gorge' }),
  r({ id: 'bacchae', name: 'Bacchae Hills', role: 'neutral', biome: 'elaia', alliance: null, pos: { x: -3.5, y: 3.5 }, res: { food: 2, wood: 1, marble: 1 }, fauna: ['boar', 'bandit'], adj: 'elaia-n, elaia-e, erymanthos, gorge' }),
  // ---- gates to the plateau
  r({ id: 'saddle', name: 'Eagle Saddle', role: 'neutral', biome: 'mountains', alliance: null, pos: { x: 0, y: -3 }, res: { stone: 2, iron: 1 }, fauna: ['cyclops', 'wolf'], adj: 'kleisoura, moors, kimmeria, omphalos' }),
  r({ id: 'erymanthos', name: 'Erymanthos Wood', role: 'neutral', biome: 'dodona', alliance: null, pos: { x: -3, y: 0 }, res: { food: 1, wood: 3 }, fauna: ['Erymanthian boar (lair)', 'wolf'], adj: 'stymphalia, moors, bacchae, omphalos' }),
  r({ id: 'gorge', name: 'Gorge of the Falls', role: 'neutral', biome: 'mountains', alliance: null, pos: { x: 0, y: 3 }, res: { food: 1, stone: 2 }, fauna: ['harpy', 'river serpent'], adj: 'achelous, savanna, bacchae, omphalos' }),
  r({ id: 'canyons', name: 'Red Canyons', role: 'neutral', biome: 'kyrene', alliance: null, pos: { x: 3, y: 0 }, res: { stone: 1, copper: 2 }, fauna: ['chimera (lair)', 'scorpion'], adj: 'ammos, kimmeria, savanna, omphalos' }),
  // ---- the centre
  r({ id: 'omphalos', name: 'Omphalos Plateau', role: 'center', biome: 'plateau', alliance: null, pos: { x: 0, y: 0 }, res: { stone: 2, marble: 2, silver: 3 }, fauna: ['titan (boss)', 'minotaur'], adj: 'saddle, erymanthos, gorge, canyons' }),
];
