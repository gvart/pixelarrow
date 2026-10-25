/**
 * Frost Steppe (docs/WAR.md): flat tundra steppe on the cold north coast, Skythia (S) inland, the Krios Glacier (W)
 * on the way to its iron, Skythia's two other entries at the north ends of the side edges, the sea (N). Strategic
 * purpose: a buffer on the way to Krios and a coast. Depth 1: wolves, and the masterless herds of riders who never
 * woke grazing the frozen ponds.
 * Layout (Gemini reference shots/war/regions/proto/skythia-n.png): the flat frost-brown steppe (h2) runs to a
 * coastal bluff (h5, a three-level wall) over the sea, broken by one pebble beach; in the north-west it climbs in two stepped terraces (h8-9,
 * h11-12) under the Krios side. Frozen shallow ponds lie scattered over the steppe (they slow), snow patches and cairns
 * round them; one long low ridge (h5-7) crosses the steppe south-west to north-east, the Krios road running along its
 * foot. The claim point where Skythia's road meets it.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';
import { fbm } from './kit.ts';
import { massif, profile, relief } from './setpieces.ts';

const def: RegionDef = {
  id: 'skythia-n',
  style: { dry: -1, dryHigh: false, trees: 0.03, bushes: 0.04, meadow: 0.4 },
  build(k: Kit) {
    const S = k.entry('skythia'), W = k.entry('krios'), NW = k.entry('skythia-w'), NE = k.entry('skythia-e');
    k.fill(2);
    k.zone('elaia', () => 99);
    k.zone('mountains', [40, 50, 70, 50, 0.3], 10);
    // the coastal bluff, the north-west terraces
    const nw = massif(k, { outline: [[-12, -12], [150, -12], [132, 36], [92, 74], [40, 98], [-12, 104]], crown: [[-12, -12], [70, -12], [60, 30], [24, 52], [-12, 56]], base: 4, tiers: 2, step: 3, wobble: 0.15 });
    // the sea under the bluff, the pebble beach
    k.waterBody([128, -18, 230, 34, 0], { shore: 3, beach: 0, rough: 6 });
    k.basin([170, 22, 22, 9, 0.1], 1, 0, 2);
    k.waterBody([170, 10, 24, 8, 0.1], { shore: 2, beach: 6, rough: 2 });
    k.spot('beach', [170, 22]);
    // the long low ridge
    const ridge = massif(k, { outline: [[24, 236], [70, 196], [130, 160], [190, 130], [244, 96], [252, 112], [200, 148], [140, 180], [80, 216], [34, 250]], crown: [[40, 236], [130, 170], [240, 104], [140, 174]], base: 2, tiers: 2, steps: [3, 1], wobble: 0.1 });
    k.spot('ridge', [136, 170]);
    // the relief (setpieces.ts relief): the steppe barely rolling, the coastal bluff a three-level wall over it, the
    // north-west terraces on four- and three-level walls to h11-12, the ridge a three-level wall to its rolling crest
    relief(k, (x, y, s) => {
      const a = nw.t(x, y), b = ridge.t(x, y);
      if (a >= 0) return profile([[0, 8], [0.9, 8.8], [1, 11], [2, 12.4]], a) + 0.45 * fbm(x, y, 10, s);
      if (b >= 0) return profile([[0, 5.2], [2, 6.8]], b) + 0.4 * fbm(x, y, 9, s + 1);
      return (y + 6 * Math.sin(x / 19 + s) + 3 * fbm(x, y, 7, s + 2) < 64 ? 5.2 : 2) + 0.6 * fbm(x, y, 24, s + 3);
    }, { cliffs: [[2.8, 5], [5.8, 8], [8.8, 11]] });
    // the frost-browned steppe: bare earth in wide drifts over the grass
    for (const b of [[150, 110, 80, 40, 0.5], [80, 200, 60, 36, -0.3], [214, 214, 50, 40, 0.2], [190, 60, 50, 22, 0], [40, 130, 30, 24, 0]] as const) k.paint('dirt', [...b], { rough: 10 });
    // the frozen ponds (shallow), snow round them
    for (const [x, y, rx, ry] of [[116, 104, 18, 10], [206, 196, 20, 12], [60, 150, 11, 7], [190, 76, 9, 6], [110, 226, 9, 6]] as const) {
      k.waterBody([x, y, rx, ry, 0.4], { deep: false, beach: 0, rough: 2 });
      k.paint('snow', [x, y, rx + 6, ry + 5, 0.4], { rough: 3, on: ['grass', 'dirt', 'sand'] });
    }
    // roads: Skythia's road to the claim point, the Krios road along the ridge's foot, the tracks to Skythia's other
    // entries; the path up the terraces
    const hub: Pt = [140, 186];
    k.road([S, [132, 230], hub], { w: 1.3, grade: 3 });
    k.road([hub, [100, 196], [60, 160], [26, 132], W], { w: 1.3, grade: 3 });
    k.road([hub, [180, 150], [220, 90], [244, 50], NE], { w: 1.1, grade: 3 });
    k.road([[60, 160], [70, 110], [30, 70], [14, 46], NW], { w: 1.1, grade: 2, fill: true });
    k.road([[70, 110], [54, 80], [44, 64]], { w: 1, grade: 1.3, fill: true });
    // cairns, a herders' hamlet, the few trees in the lee of the bluff
    k.piece('mountains/cairn', [110, 110], { r: 10, n: 2, gap: 6 });
    k.piece('mountains/cairn', [200, 190], { r: 12, n: 2, gap: 6 });
    k.piece('mountains/ice-patch', [70, 140], { r: 6, n: 2 });
    k.village([200, 220], 4);
    k.forest([220, 40, 10, 6, 0], [90, 40, 10, 6, 0.3]);
    k.resource('stone', [40, 56], 3, 10);
    k.resource('food', [210, 230], 2, 12);
    // fauna: wolves on the terraces and the ridge, the wild herds by the ponds
    k.lair('wolf', [44, 60], { as: 'wolves' });
    k.lair('wolf', [190, 130], { as: 'wolves' });
    k.lair('ibex', [116, 90], { as: 'wild horses' });
    k.lair('ibex', [210, 170], { as: 'wild horses' });
    k.claim(hub, 160);
  },
};
export default def;
