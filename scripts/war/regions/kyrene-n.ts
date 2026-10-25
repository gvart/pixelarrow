/**
 * Thornscrub Rise (docs/WAR.md): dry thornscrub hills between the Ammos Dunes (N) and Kyrene (S), the Lion Savanna (W)
 * off it, Kyrene's two other entries at the north ends of the side edges. Strategic purpose: the Desert Road's wadi
 * chokepoint and a copper outcrop. Depth 1: lions and scorpions.
 * Layout (Gemini reference shots/war/regions/proto/kyrene-n.png; W-52 cliffed relief, ./setpieces.ts relief): three great
 * flat-topped red mesas cross the map west to east, the west block, the tower block by the slot and the east block (a
 * narrow canyon between the last two), sheer walls of five or six levels from a talus shelf (h7) over the rolling scrub
 * (h2-7, low benches) to crowns at h12-15; four buttes stand off them in the scrub. The Desert Road goes through in one
 * dry wadi, a gravel slot between the west and tower blocks' walls, the throat where an army died of thirst. On the
 * tower block beside the slot's lip a rocky crest (h15) carries a ruined tower, reached by one path up the canyon from
 * the south mouth. The copper crops out at the cliff foot east of the mouth, the lions' lair by it. The west block ends
 * short of the west edge: the long slow way round by the Savanna road. Thornscrub hills on both sides; the claim point south of the slot on Kyrene's side.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';
import { fbm } from './kit.ts';
import { relief } from './setpieces.ts';

/** The mesa line's centre (the set pieces sit along it). */
const by = (x: number) => 126 + 9 * Math.sin(x / 31) + 4 * Math.cos(x / 13);
/** The mesas and buttes: blob (centre, radii, turn) and crown level. */
const MESAS: [number, number, number, number, number, number][] = [
  [86, 128, 37, 24, -0.15, 13], [58, 114, 18, 16, 0.3, 13.6], // the west block
  [148, by(148) - 2, 16, 21, 0.1, 13.4], // the tower block by the slot
  [214, by(212) + 4, 36, 25, 0.2, 12.8], [234, 104, 16, 14, 0.4, 13.4], // the east block
  [98, 74, 8, 6, 0.3, 12], [162, 76, 9, 6, -0.2, 12], [198, 180, 8, 6, 0.4, 12], [60, 178, 7, 5, 0, 12], // buttes
];

const def: RegionDef = {
  id: 'kyrene-n',
  style: { dry: 0.2, trees: 0.3, bushes: 0.8 },
  build(k: Kit) {
    const N = k.entry('ammos'), S = k.entry('kyrene'), W = k.entry('savanna'), NW = k.entry('kyrene-w'), NE = k.entry('kyrene-e');
    k.fill(3);
    k.zone('kyrene', () => 99);
    k.paint('sand', [128, 128, 200, 200, 0], { rough: 8 });
    // the scrub's ground: hardpan and gravel flats between the hills
    for (const b of [[100, 60, 40, 22, 0.3], [180, 210, 40, 20, -0.2], [40, 140, 22, 40, 0], [224, 120, 24, 30, 0.2]] as const) k.patch('kyrene', 'hardpan', [...b], ['sand']);
    for (const b of [[150, 70, 30, 16, 0.2], [100, 220, 30, 18, 0]] as const) k.patch('kyrene', 'reg', [...b], ['sand']);
    // W-52 cliffed relief (./setpieces.ts relief): three great flat-topped red mesas cross the map west to east, the west
    // block, the tower block by the slot and the east block, a canyon between the last two, buttes standing off them in
    // the scrub; sheer walls of five or six levels from a talus shelf (h7) to crowns at h12-15. The slot is cut through.
    const mesa = (x: number, y: number, s: number) => {
      let q = -Infinity, top = 13;
      for (const [cx, cy, rx, ry, rot, t] of MESAS) {
        const c = Math.cos(rot), sn = Math.sin(rot), u = (x - cx) * c + (y - cy) * sn, v = (y - cy) * c - (x - cx) * sn;
        const d = (1 - ((u / rx) ** 4 + (v / ry) ** 4) ** 0.25) * Math.min(rx, ry); // squarish blocks
        if (d > q) { q = d; top = t; }
      }
      q += 5 * fbm(x, y, 22, s + 10) + 3 * fbm(x, y, 9, s) + 1.5 * fbm(x, y, 3.5, s + 1);
      q = Math.min(q, Math.abs(x - 128) - 3.2 + 0.4 * fbm(x, y, 6, s + 8), Math.abs(x - 170 - 4 * Math.sin(y / 9)) - 3.5 + fbm(x, y, 5, s + 9));
      return [q, top] as const;
    };
    let ms = 0;
    relief(k, (x, y, s) => {
      ms = s;
      const [q, top] = mesa(x, y, s);
      if (q >= 0) return top + 0.9 * fbm(x, y, 14, s + 4) + 0.7 * fbm(x, y, 4, s + 5);
      let g = 3.6 + 2.4 * fbm(x, y, 30, s + 2) + 0.5 * fbm(x, y, 7, s + 6);
      if (q > -9) g = Math.max(g, 7 + 0.45 * q); // the talus shelf round each mesa's foot
      return g;
    }, { cliffs: [[4.4, 6.6], [7, 11.5]] }); // low scrub benches and the shelf stand over the flats; the mesa walls
    // thornscrub hills both sides of the band
    for (const b of [[60, 56, 34, 18, 0.4], [200, 58, 36, 16, -0.3], [62, 214, 34, 16, 0.2], [204, 212, 34, 18, -0.4], [150, 26, 16, 8, 0]] as const) k.hill([...b], 7, 4, 3);
    k.plateau([146, by(146) - 2, 9, 5, 0.2], 15, { rough: 1 });
    k.spot('crest', [146, by(146) - 2]);
    k.cut([[128, by(128) - 44], [129, by(128) - 8], [128, by(128)], [127, by(128) + 8], [128, by(128) + 44]], { h: 3, half: 2, bank: 0, t: 'dirt' });
    k.spot('narrows', [128, by(128)]);
    k.patchWhere('kyrene', 'redrock', (x, y) => mesa(x, y, ms)[0] > -2, ['sand']);
    k.patch('kyrene', 'reg', [128, by(128), 3, 42, 0], ['dirt', 'sand']);
    // roads: the Desert Road down the slot; the path up the crest from the south mouth; the side tracks; the Savanna
    // road round the band's west end
    const hub: Pt = [126, 182];
    k.road([N, [126, 40], [128, 80], [128, by(128) - 20], [128, by(128)], [128, by(128) + 20], [126, 160], hub, [128, 220], S], { w: 1.2, grade: 3 });
    k.road([[130, by(130) + 40], [150, by(150) + 40], [172, by(172) + 34], [176, by(176) + 20], [166, by(166) + 8], [152, by(152) + 2], [148, by(148) - 1]], { w: 0.9, grade: 1.2, fill: true });
    k.road([[126, 40], [80, 46], [30, 44], NW], { w: 1.1, grade: 3 });
    k.road([[126, 40], [180, 46], [230, 44], NE], { w: 1.1, grade: 3 });
    k.road([hub, [80, 170], [36, 150], [16, 130], W], { w: 1.2, grade: 3 });
    // copper at the cliff foot east of the mouth, stone on the hills
    k.resource('copper', [138, by(138) + 40], 3, 6);
    k.spot('copper', [138, by(138) + 40]);
    k.resource('stone', [60, 60], 3, 10);
    k.resource('stone', [204, 200], 2, 10);
    // the ruined tower on the crest, rockfall in the slot's mouths, the waystation by the hub
    k.piece('watchtower', [146, by(146) - 2], { r: 4 });
    k.piece('wall-ruin', [150, by(150) - 4], { r: 4, n: 2, gap: 3 });
    k.piece('mountains/rockfall', [120, by(120) - 36], { r: 6, n: 2 });
    k.piece('kyrene/ruin-wall', [100, 190], { r: 6, n: 3, gap: 4 });
    k.village([96, 204], 3);
    k.forest([200, 66, 14, 8, 0.3], [62, 204, 12, 8, 0]);
    // fauna: lions by the copper and in the north scrub, scorpions in the hills
    k.lair('jackal', [154, by(154) + 46], { as: 'lions' });
    k.lair('jackal', [196, 64], { as: 'lions' });
    k.lair('jackal', [58, 64], { as: 'scorpions' });
    k.lair('jackal', [210, 206], { as: 'scorpions' });
    // thornscrub: clumps of thorn trees and acacias on the hills both sides of the band (the scatter's bushes are too small
    // to show zoomed out)
    for (const b of [[50, 50, 10, 7, 0.4], [80, 76, 8, 6, 0], [190, 56, 10, 6, -0.3], [222, 90, 8, 6, 0], [176, 92, 7, 5, 0],
      [50, 196, 10, 7, 0.2], [84, 226, 8, 6, 0], [196, 196, 10, 7, -0.4], [220, 228, 8, 5, 0], [30, 120, 6, 8, 0]] as const)
      k.rows(['kyrene/thorn-tree', 'kyrene/acacia', 'kyrene/acacia-old', 'kyrene/thorn-tree'], [...b], { dx: 5, dy: 4, on: ['sand', 'dune', 'reg', 'hardpan'] });
    k.claim(hub, 160);
  },
};
export default def;
