/**
 * Thornscrub Rise (docs/WAR.md): dry thornscrub hills between the Ammos Dunes (N) and Kyrene (S), the Lion Savanna (W)
 * off it, Kyrene's two other entries at the north ends of the side edges. Strategic purpose: the Desert Road's wadi
 * chokepoint and a copper outcrop. Depth 1: lions and scorpions.
 * Layout (Gemini reference shots/war/regions/proto/kyrene-n.png; W-52 set pieces): a broad band of red cliffs crosses
 * the map west to east as one great wall, a sheer skirt (h7) over the h3 scrub under a flat top (h10); the Desert
 * Road goes through it in one dry wadi, a gravel slot 8 tiles wide between the walls, the throat where an army died of
 * thirst. On the east block beside the slot's lip a rocky crest (h11) carries a ruined tower over it, reached by one path up from the south mouth. The copper crops out at the cliff
 * foot east of the mouth, the lions' lair by it. The band ends short of the west edge: the long slow way round by
 * the Savanna road. Thornscrub hills on both sides; the claim point south of the slot on Kyrene's side.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';
import { massif } from './setpieces.ts';

/** The band's centre line and half-width. */
const by = (x: number) => 126 + 9 * Math.sin(x / 31) + 4 * Math.cos(x / 13);
const bw = (x: number) => 24 + 4 * Math.sin(x / 23);

const def: RegionDef = {
  id: 'kyrene-n',
  style: { dry: 0.2, trees: 0.3, bushes: 0.8 },
  build(k: Kit) {
    const N = k.entry('ammos'), S = k.entry('kyrene'), W = k.entry('savanna'), NW = k.entry('kyrene-w'), NE = k.entry('kyrene-e');
    k.fill(3);
    k.zone('kyrene', () => 99);
    k.paint('sand', [128, 128, 200, 200, 0], { rough: 8 });
    // thornscrub hills both sides of the band
    for (const b of [[60, 56, 34, 18, 0.4], [200, 58, 36, 16, -0.3], [62, 214, 34, 16, 0.2], [204, 212, 34, 18, -0.4], [150, 26, 16, 8, 0]] as const) k.hill([...b], 5, 6, 3);
    // the scrub's ground: hardpan and gravel flats between the hills
    for (const b of [[100, 60, 40, 22, 0.3], [180, 210, 40, 20, -0.2], [40, 140, 22, 40, 0], [224, 120, 24, 30, 0.2]] as const) k.patch('kyrene', 'hardpan', [...b], ['sand']);
    for (const b of [[150, 70, 30, 16, 0.2], [100, 220, 30, 18, 0]] as const) k.patch('kyrene', 'reg', [...b], ['sand']);
    // the cliff band (its west end short of the edge), the crest by the slot, the slot cut through it
    // W-52 set piece (./setpieces.ts): the band is one great red-rock wall, a sheer skirt (h7) under a broad flat top
    // (h10), ending short of the west edge; the slot is cut through it
    const blockW = (x0: number, x1: number, grow: number): Pt[] => {
      const top: Pt[] = [], bot: Pt[] = [];
      for (let x = x0; x <= x1; x += 12) { top.push([x, by(x) - bw(x) - grow]); bot.unshift([x, by(x) + bw(x) + grow]); }
      return [...top, ...bot];
    };
    massif(k, { outline: blockW(52, 272, 6), crown: blockW(70, 272, -7), base: 3, tiers: 2, steps: [4, 3], wobble: 0.2 });
    k.plateau([146, by(146) - 2, 9, 5, 0.2], 11, { rough: 1 });
    k.spot('crest', [146, by(146) - 2]);
    k.cut([[128, by(128) - 44], [129, by(128) - 8], [128, by(128)], [127, by(128) + 8], [128, by(128) + 44]], { h: 3, half: 2, bank: 0, t: 'dirt' });
    k.spot('narrows', [128, by(128)]);
    k.patch('kyrene', 'redrock', [150, by(150), 130, 40, 0], ['sand'], undefined, 7);
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
