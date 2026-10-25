/**
 * Lakeshore Fens (docs/WAR.md): reed fens on Lake Stymphalia's south shore, the lake (N) above, Elaia (S) below, the
 * Bacchae Hills (E) off it, Elaia's two other entries at the north ends of the side edges. Strategic purpose: the
 * Lake Road's causeway landfall and a breadbasket (food, flax, herbs). Depth 1: river serpents in the reeds, boars.
 * Layout (Gemini reference shots/war/regions/proto/elaia-n.png; W-52 set pieces): the deep lake fills the north third; the Lake Road comes
 * over it on a single causeway, 8 tiles wide, and lands on a firm grassy tongue in the middle of a wide reed marsh cut by
 * shallow channels. Low islands (h3) flank the landfall a bowshot off the causeway, one with a ruined watch tower:
 * archers' ground over the narrows. South of the marsh the firm farmland stands a four-level wall up (h7, rolling), the region's
 * second set piece: a grid of wide fields round the farm village at the crossroads (the claim point), a higher bench
 * (h12-13) along the west edge, and the table's south rim a wall down to the lowland meadows (h2) toward Elaia. Dry tracks on the side benches lead north to Elaia's other entries, a road east
 * to the Bacchae.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';
import { fbm } from './kit.ts';
import { profile, relief } from './setpieces.ts';

const def: RegionDef = {
  id: 'elaia-n',
  style: { trees: 0.06, bushes: 0.1, dry: 0.4 },
  build(k: Kit) {
    const N = k.entry('stymphalia'), S = k.entry('elaia'), E = k.entry('bacchae'), NW = k.entry('elaia-w'), NE = k.entry('elaia-e');
    k.fill(2);
    k.zone('elaia', () => 99);
    // the marsh and the lake
    k.paint('marsh', [128, 100, 124, 40, 0], { rough: 8 });
    k.waterBody([134, 14, 112, 70, 0.02], { shore: 4, beach: 1, rough: 7 });
    // the land (setpieces.ts relief): the marsh low by the lake, a four-level wall up to the rolling farm table, the west
    // bench a wall higher again, the side benches over the marsh at the north ends, the table's south rim a wall down to
    // the lowland meadows toward Elaia
    relief(k, (x, y, s) => {
      const t = y + 8 * Math.sin(x / 17 + s) + 4 * Math.sin(x / 6) + 4 * fbm(x, y, 9, s + 1);
      let v = profile([[112, 1.6], [124, 2.2], [130, 7], [200, 7.6], [220, 7.2], [228, 2], [256, 2.4]], t) + 1.1 * fbm(x, y, 22, s + 2) + (y > 130 && y < 220 ? 1.0 * Math.max(0, 1 - x / 160) : 0);
      const w = x + 5 * Math.sin(y / 11 + s) + 3 * fbm(x, y, 6, s + 3);
      const south = Math.max(0, Math.min(1, (y - 120) / 20));
      v = Math.max(v, south * profile([[16, 13.4], [26, 12.6], [34, 10], [44, 7.6], [45, 0]], w) + 0.8 * fbm(x, y, 7, s + 4));
      const side = Math.min(w, 256 - x + 5 * Math.sin(y / 9 + s));
      if (y < 140) v = Math.max(v, profile([[12, 6], [20, 5], [26, 2]], side) + 0.4 * fbm(x, y, 5, s + 5));
      return v;
    }, { cliffs: [[2, 6.5], [9.5, 12]] });
    // channels through the reeds; a brook over the farmland down to the south edge
    for (const c of [[[30, 84], [56, 100], [80, 96], [100, 116], [96, 134]], [[232, 80], [204, 98], [180, 94], [164, 112], [170, 134]], ] as Pt[][]) k.river(c, { half: 1.1, deep: false, bed: 1, bank: 2 });
    k.river([[92, 140], [80, 172], [62, 198], [56, 214]], { half: 1.1, deep: false, bed: 5, bank: 3 });
    for (const b of [[60, 84, 6, 3, 0.4], [186, 84, 7, 3, -0.3], [100, 104, 4, 2, 0], [210, 108, 5, 3, 0.2], [40, 104, 4, 3, 0]] as const) k.waterBody([...b], { deep: false, beach: 0, rough: 1 });
    // the causeway and its landfall tongue; the islands over it
    k.causeway([[128, -6], [128, 30], [126, 62], [122, 82]], 2, 1);
    k.island([118, 98, 10, 16, 0.2], 2);
    k.spot('narrows', [127, 44]);
    k.spot('landfall', [120, 92]);
    for (const [b, h] of [[[88, 100, 8, 5, 0.4], 3], [[160, 104, 9, 6, -0.3], 3], [[70, 112, 5, 4, 0], 2], [[192, 112, 6, 4, 0.5], 2]] as const) k.island([...b], h, 1.5);
    k.spot('isleW', [88, 100]);
    k.spot('isleE', [160, 104]);
    // roads: the Lake Road over the causeway and the tongue to the village and on to Elaia; east to the Bacchae; the
    // side tracks north to Elaia's other entries
    const hub: Pt = [112, 150];
    k.road([N, [128, 30], [126, 62], [120, 92], [114, 124], hub, [120, 190], [126, 226], S], { w: 1.4, grade: 3, fill: true });
    k.road([hub, [160, 146], [208, 134], [236, 128], E], { w: 1.3, grade: 3 });
    k.road([hub, [70, 146], [30, 120], [12, 80], NW], { w: 1.1, grade: 3 });
    k.road([[208, 134], [240, 100], [246, 60], NE], { w: 1.1, grade: 3 });
    k.road([[158, 104], [142, 100], [124, 96]], { w: 0.8, grade: 2 });
    k.road([[70, 182], [40, 200], [28, 224]], { w: 0.9, grade: 2 }); // a track up onto the west bench
    // the farmland: fields and flax by the channels, olive and herb gardens on the bench
    k.fields([176, 176, 40, 22, 0], 0, { plot: 16, wide: 12 });
    k.fields([66, 182, 40, 26, 0], 0, { plot: 16, wide: 12 });
    k.resource('food', [70, 176], 5, 16);
    k.resource('food', [176, 174], 4, 14);
    k.piece('elaia/herbs', [146, 180], { r: 8, n: 3 });
    k.piece('elaia/beehives', [96, 206], { r: 6, n: 2 });
    k.rows(['elaia/olive-orchard'], [40, 232, 22, 8, 0.1], { dx: 3, dy: 3 });
    // the farm village round its well, a second hamlet east; the ruined watch tower on the west isle; reeds' dead trees
    k.village([126, 166], 6);
    k.village([200, 160], 4);
    k.piece('watchtower', [88, 100], { r: 4 });
    k.piece('elaia/shrine', [132, 204], { r: 6 });
    k.forest([24, 230, 14, 12, 0.2], [236, 232, 14, 12, -0.2], [248, 50, 6, 20, 0]);
    // fauna: river serpents in the reeds either side of the causeway, boars in the south woods
    k.lair('boar', [70, 98], { as: 'river serpents' });
    k.lair('boar', [190, 100], { as: 'river serpents' });
    k.lair('boar', [24, 230], { as: 'boars' });
    k.lair('boar', [236, 232], { as: 'boars' });
    k.claim(hub, 160);
  },
};
export default def;
