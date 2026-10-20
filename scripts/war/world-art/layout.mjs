// World map layout (M4c art): the 37 regions of docs/WAR.md "World" as a hand-placed cell grid, warped into organic
// shapes. Deterministic: same code, same seed, same map. Logical px = 1/2 map px (the map is 2x pixel art).
import { readFileSync } from 'node:fs';

export const LW = 1024; // logical width  (map px 2048)
export const LH = 768; // logical height (map px 1536)
export const SCALE = 2; // map px per logical px
export const GX = 32;
export const GY = 24; // grid cells
export const CELL = 30; // logical px per cell
export const OX = (LW - GX * CELL) / 2;
export const OY = (LH - GY * CELL) / 2;

// Quadrant-local tokens (NW quadrant drawn; the other three are its mirrors). Topology is mirror-symmetric (WAR.md).
const TOKENS = {
  NW: { a: 'dodona-n', b: 'dodona-w', c: 'dodona-e', d: 'dodona-s', D: 'dodona', O: 'moors', R: 'krios', P: 'kleisoura', N: 'saddle', Z: 'siren', Y: 'stymphalia', W: 'erymanthos', X: 'omphalos' },
  NE: { a: 'skythia-n', b: 'skythia-e', c: 'skythia-w', d: 'skythia-s', D: 'skythia', O: 'kimmeria', R: 'krios', P: 'kleisoura', N: 'saddle', Z: 'ammon', Y: 'ammos', W: 'canyons', X: 'omphalos' },
  SW: { a: 'elaia-s', b: 'elaia-w', c: 'elaia-e', d: 'elaia-n', D: 'elaia', O: 'bacchae', R: 'delta', P: 'achelous', N: 'gorge', Z: 'siren', Y: 'stymphalia', W: 'erymanthos', X: 'omphalos' },
  SE: { a: 'kyrene-s', b: 'kyrene-e', c: 'kyrene-w', d: 'kyrene-n', D: 'kyrene', O: 'savanna', R: 'delta', P: 'achelous', N: 'gorge', Z: 'ammon', Y: 'ammos', W: 'canyons', X: 'omphalos' },
};

// NW quadrant, x 0..15 (15 = next to the N axis), y 0..11 (11 = next to the W axis).
function nwToken(x, y) {
  if (x === 0 || y === 0) return '.';
  if (x >= 14) return y <= 3 ? 'R' : y <= 6 ? 'P' : y <= 9 ? 'N' : 'X';
  if (y >= 10) return x <= 4 ? 'Z' : x <= 10 ? 'Y' : 'W';
  if (x >= 11 && y >= 7) return 'O';
  if (x >= 10 && y >= 4 && y <= 6) return 'c';
  if (y <= 2 && x >= 5) return 'a';
  if (y === 3 && x >= 10) return 'a';
  if (x <= 4) return 'b';
  if (y >= 8 || (x === 10 && y >= 7)) return 'd';
  return 'D';
}

export function gridLabel(cx, cy) {
  const east = cx >= GX / 2;
  const south = cy >= GY / 2;
  const fx = east ? GX - 1 - cx : cx;
  const fy = south ? GY - 1 - cy : cy;
  const t = nwToken(fx, fy);
  if (t === '.') return null;
  return TOKENS[(south ? 'S' : 'N') + (east ? 'E' : 'W')][t];
}

// docs/WAR.md "Regions" table: id, name, role, biome text, adjacency. The single source the art is checked against.
export function readWarRegions(root) {
  const md = readFileSync(`${root}/docs/WAR.md`, 'utf8');
  const sec = md.slice(md.indexOf('### Regions'), md.indexOf('## Soldiers'));
  const rows = sec.split('\n').filter((l) => /^\| [a-z]/.test(l) && !l.startsWith('| id '));
  return rows.map((l) => {
    const c = l.split('|').slice(1, -1).map((s) => s.trim());
    return { id: c[0], name: c[1], role: c[2], biome: c[3], adjacent: c[7].split(',').map((s) => s.trim()) };
  });
}
