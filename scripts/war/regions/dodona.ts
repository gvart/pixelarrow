/**
 * Dodona, alliance home NW (docs/WAR.md): a pine-and-oak valley round a cold lake, iron.
 * Layout (Gemini reference shots/war/regions/proto/dodona.png; W-52 set pieces, ./setpieces.ts relief): the valley floor
 * (h2) holds a deep lake with a second basin joined on its east; two great forested ridges close it along the whole west
 * and east edges, each standing on stacked grey rock walls (a six-level wall up to a h8 bench, a four-level wall up to
 * the h12-14 crest; the east one walled down to a ledge along the edge too), each cut in its middle by one sheer gap
 * where a road comes in (forest ambush ground, both sides high). A higher bench runs along the north edge from the west ridge; a snowmelt brook comes down from the north into
 * the lake; the young Ladon leaves it south, deep, crossed by the road bridge at its narrows by the town and lower down
 * by a ford. The town (home camp, market) sits on the lake's south-east shore; the knoll on the north-west shore (h6 on a
 * four-level rock wall, the oracle's oaks) is the fort site, its back to the lake. The first spurs of the Iron Teeth
 * (rock) rise in the north-east corner with the iron ore; bog iron in the fen at the lake's south-west end.
 * Art: the Dodona library (src/war/view/art.ts BIOMES): its tile variants and the set pieces placed here; the scatter
 * uses global pines and oaks and mountain firs; the ridge walls in the mountains zone (granite).
 */
import { fbm, type Kit, type RegionDef } from './kit.ts';
import { profile, relief, valley } from './setpieces.ts';

const def: RegionDef = {
  id: 'dodona',
  build(k: Kit) {
    k.fill(2);
    k.zone('dodona', () => 99);
    // the ridges' grey rock walls
    k.zone('mountains', [24, 128, 30, 150, 0], 6);
    k.zone('mountains', [232, 128, 30, 150, 0], 6);
    k.zone('mountains', [60, 14, 60, 16, 0.1], 6);
    // the lake and its second basin first (the relief leaves the water)
    k.waterBody([118, 112, 36, 22, 0.25], { shore: 3, beach: 2 });
    k.waterBody([150, 128, 22, 14, -0.4], { shore: 3, beach: 2 });
    // the land: the valley floor rolling a little, the two ridges a cross-section from their edge (crest at h12-14, a
    // four-level wall down to the h8 bench, a six-level wall down to the valley), a lower bench along the north edge from
    // the west ridge
    relief(k, (x, y, s) => {
      let v = 2.3 + 0.5 * fbm(x, y, 24, s);
      const ridge = (u: number) => profile([[0, 14], [16, 13.2], [24, 12.4], [27, 8.6], [38, 8.2], [44, 2.4]], u);
      v = Math.max(v, ridge(x + 9 * fbm(x, y, 26, s + 1) + 3 * fbm(x, y, 7, s + 2)));
      // the east ridge also drops in a wall to a ledge along the east edge (its valley walls face away from the view)
      const ue = 256 - x + 3 * fbm(x, y, 7, s + 4);
      v = Math.max(v, Math.min(ridge(ue + 9 * fbm(x, y, 26, s + 3)), profile([[3, 8.6], [5, 13.4]], ue)));
      const north = y + 6 * fbm(x, y, 20, s + 5) + Math.max(0, x - 90) * 0.5;
      v = Math.max(v, profile([[0, 8.6], [16, 8.2], [22, 2.4]], north));
      return v > 9 ? v + 0.7 * fbm(x, y, 6, s + 6) : v; // a rugged crest
    }, { cliffs: [[2, 8], [8, 12]] });
    // the fort knoll on the north-west shore: a flat top on a four-level rock wall
    k.plateau([72, 88, 18, 14, 0.3], 6, { rough: 2 });
    // the gaps: one sheer cut through each ridge where the roads come in
    valley(k, [[-8, 128], [30, 128], [50, 136]], { floor: 2, rim: 0, half: 5, wall: 0, reach: 0 });
    valley(k, [[264, 128], [226, 128], [206, 134]], { floor: 2, rim: 0, half: 5, wall: 0, reach: 0 });
    k.mountains([[268, 40], [246, 20], [238, -8]], { width: 11, spurs: [[252, 54, 10, 7, 0.4]] });
    k.spot('fortSite', [72, 86]);
    // the brook into the lake and the Ladon out of it (narrows at the town bridge)
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
    // tracks up each ridge arm from its gap, cut up the walls (the archers' ground over the gaps)
    for (const t of [[[56, 134], [48, 116], [40, 104], [28, 92], [14, 84]], [[56, 142], [46, 160], [34, 170], [20, 180], [8, 190]], [[206, 132], [214, 110], [222, 96], [234, 88], [242, 84]], [[206, 140], [212, 160], [224, 172], [234, 180], [242, 186]]] as [number, number][][]) k.road(t, { w: 1, grade: 2.5 });
    k.spot('westGap', [30, 128]);
    k.spot('ridge', [214, 64]);
    k.spot('eastGap', [224, 128]);
    // forest: the ridges and their slopes, copses on the valley floor; clearings by the town and the fields
    k.paint('forest', [36, 128, 34, 140, 0], { on: ['grass'], minH: 3 });
    k.paint('forest', [220, 128, 34, 140, 0], { on: ['grass'], minH: 3 });
    k.forest([70, 40, 34, 22, 0.3], [180, 60, 26, 24, -0.2], [74, 206, 34, 24, 0.4], [186, 216, 30, 22, -0.3], [104, 64, 12, 8, 0.5], [86, 186, 12, 8, 0.1], [240, 190, 14, 30, 0.1], [12, 190, 10, 30, 0]);
    // resources (food 2, wood 3, stone 2, iron 2) and set pieces
    k.resource('iron', [242, 60], 3, 12);
    // the home agora and the town round it: houses and workshops along the roads, farms and a press beyond
    k.agora([156, 168]);
    k.houses([156, 168], 18, 16, 40, ['house-a', 'house-b', 'forge', 'house-a', 'workshop', 'cottage', 'storehouse', 'house-b']);
    k.outskirts([156, 168], 5, 34, 56, ['farm', 'cottage', 'farm', 'storehouse']);
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
