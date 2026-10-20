/**
 * Dodona, alliance home NW (docs/WAR.md): a pine-and-oak valley round a cold lake, iron.
 * Layout: the valley floor (h2) holds a deep lake; forested ridges (h5) close it on the west and east, each cut by one
 * gap where a road comes in (forest ambush ground, both sides high). A snowmelt brook comes down from the north into
 * the lake; the young Ladon leaves it south, deep, crossed by the road bridge at its narrows by the town. The town (home
 * camp, market) sits on the lake's south-east shore; the knoll on the north-west shore (h4, the oracle's oaks) is the
 * fort site, its back to the lake. The first spurs of the Iron Teeth (rock) rise in the north-east corner with the iron
 * ore; bog iron in the fen at the lake's south-west end.
 * Art: the Dodona library (src/war/view/art.ts BIOMES): its tile variants and the set pieces placed here; the scatter
 * uses global pines and oaks and mountain firs.
 */
import type { Kit, RegionDef } from './kit.ts';

const def: RegionDef = {
  id: 'dodona',
  build(k: Kit) {
    k.fill(2);
    k.zone('dodona', () => 99);
    // the two ridges, each in two arms round its road gap; the Iron Teeth spur in the north-east corner
    k.ridge([[18, -6], [44, 22], [36, 58], [60, 76], [30, 106]], { crest: 5, step: 4, top: 4, reach: 34 });
    k.ridge([[24, 156], [52, 178], [40, 214], [64, 240], [52, 262]], { crest: 5, step: 4, top: 4, reach: 34 });
    k.ridge([[200, -6], [214, 30], [196, 62], [222, 102]], { crest: 5, step: 4, top: 5, reach: 34 });
    k.ridge([[226, 156], [196, 184], [216, 222], [200, 262]], { crest: 5, step: 4, top: 4, reach: 34 });
    k.hill([180, 236, 20, 12, -0.4], 4, 3);
    k.hill([96, 30, 16, 10, 0.5], 3, 3);
    k.mountains([[268, 40], [246, 20], [238, -8]], { width: 11, spurs: [[252, 54, 10, 7, 0.4]] });
    // the fort knoll on the north-west shore
    k.hill([72, 88, 18, 14, 0.3], 4, 4, 2);
    k.spot('fortSite', [72, 86]);
    // the lake, the brook into it and the Ladon out of it (narrows at the town bridge)
    k.waterBody([118, 112, 36, 22, 0.25], { shore: 3, beach: 2 });
    k.waterBody([150, 128, 22, 14, -0.4], { shore: 3, beach: 2 });
    k.river([[138, -6], [130, 26], [138, 56], [124, 92]], { half: 1.8, deep: false, bed: 1, bank: 3 });
    k.river([[124, 136], [128, 166], [116, 196], [104, 226], [92, 262]], { half: 4.5, bed: 0, bank: 4, narrows: [[[128, 166], 2.6]], fords: [[104, 226]], name: 'ladon' });
    k.paint('marsh', [92, 144, 14, 7, 0.4], { on: ['grass', 'sand'] });
    // town (home camp) and market on the south-east shore
    k.square([156, 168], 7);
    k.spot('homeCamp', [156, 168]);
    // roads: W through the west gap over the Ladon bridge; N down the brook; E through the east gap; S past the ford
    k.road([[-4, 128], [30, 128], [58, 140], [88, 158], [112, 164], [128, 166], [144, 168], [156, 168]], { bridges: [[128, 166]] });
    k.road([[60, 138], [62, 112], [72, 88]]);
    k.road([[128, -4], [142, 28], [158, 64], [170, 104], [166, 146], [156, 168]]);
    k.road([[260, 128], [226, 128], [200, 138], [176, 154], [156, 168]]);
    k.road([[128, 260], [134, 230], [146, 200], [156, 168]]);
    k.spot('westGap', [30, 128]);
    k.spot('ridge', [214, 64]);
    k.spot('eastGap', [224, 128]);
    // forest: the ridges and their slopes, copses on the valley floor; clearings by the town and the fields
    k.paint('forest', [36, 128, 34, 140, 0], { on: ['grass'], minH: 3 });
    k.paint('forest', [220, 128, 34, 140, 0], { on: ['grass'], minH: 3 });
    k.forest([70, 40, 34, 22, 0.3], [180, 60, 26, 24, -0.2], [74, 206, 34, 24, 0.4], [186, 216, 30, 22, -0.3], [104, 64, 12, 8, 0.5], [86, 186, 12, 8, 0.1], [240, 190, 14, 30, 0.1], [12, 190, 10, 30, 0]);
    // resources (food 2, wood 3, stone 2, iron 2) and set pieces
    k.resource('iron', [242, 60], 3, 12);
    k.piece('dodona/iron-bog', [92, 146], { r: 8, n: 2 });
    k.resource('stone', [214, 12], 2, 12);
    k.resource('stone', [44, 224], 2, 14);
    k.piece('dodona/oak-sacred', [72, 84], { r: 6 });
    k.piece('dodona/oracle-grove', [76, 92], { r: 6 });
    k.piece('dodona/timber-stand', [64, 50], { r: 14, n: 2 });
    k.piece('dodona/charcoal-pile', [188, 204], { r: 12 });
    k.piece('dodona/hut-ruin', [184, 44], { r: 12 });
    k.piece('watchtower', [226, 138], { r: 10 });
  },
};
export default def;
