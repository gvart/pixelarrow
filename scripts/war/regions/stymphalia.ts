/**
 * Lake Stymphalia (docs/WAR.md): the big reed lake between Dodona (N) and Elaia (S), Siren (W) and Erymanthos (E) off
 * it. Strategic purpose: the causeway town of the Lake Road, a frontier market (season score) and its chokepoint.
 * Layout: a deep lake fills the middle. The town stands on an island in its east half round a square (the claim point)
 * with stalls, a timber yard and a caravan yard, reached by three causeways: from the north (Dodona) a long single-file
 * one, 3-4 tiles wide, watched by the wooded harpy isle (h3) a bowshot off it, the defensible approach; from the south
 * (Elaia) a broad one over shallow flats, the open approach; from the east a middle one landing in the reed marsh. The
 * slow bypasses: the marsh round the lake's east end, and the shallow Ladon, which comes down from the oakwood in the
 * north-west, crosses the lake's west end and leaves west to Siren; the shore track by the Siren road wades it. North
 * shore oaks (Dodona), east woods climbing toward Erymanthos (h3), south fens with flax fields.
 */
import type { Kit, RegionDef } from './kit.ts';

const def: RegionDef = {
  id: 'stymphalia',
  style: { trees: 0.8 },
  build(k: Kit) {
    const N = k.entry('dodona-s'), S = k.entry('elaia-n'), E = k.entry('erymanthos'), W = k.entry('siren');
    k.fill(2);
    k.zone('dodona', [128, 30, 150, 44, 0], 8);
    k.zone('dodona', [250, 128, 40, 130, 0], 8);
    // the land: oak hills on the north shore, the east woods rising to the plateau skirt, the low south fens
    k.hill([60, 22, 40, 18, 0.2], 3, 4);
    k.hill([196, 24, 34, 16, -0.2], 3, 4);
    k.lift((x, y, s) => (x + 12 * Math.sin(y / 23) + 6 * Math.cos(y / 9 + s) > 222 ? 3 : NaN));
    k.basin([128, 236, 150, 34, 0], 1, 0, 6);
    // the reed marsh round the lake and its east end, then the lake (deep core, shallow rim)
    k.paint('marsh', [118, 126, 112, 86, 0.1], { rough: 8 });
    k.paint('marsh', [212, 130, 34, 76, 0.05], { rough: 6 });
    k.waterBody([116, 124, 86, 62, 0.12], { shore: 3, beach: 1.5, rough: 6 });
    // reed islets in the west of the lake
    for (const b of [[70, 104, 7, 4, 0.5], [86, 150, 9, 5, -0.3], [52, 140, 5, 3, 0.2], [104, 82, 5, 3, 0.8]] as const) {
      k.island([...b], 1, 1.5);
      k.paint('marsh', [b[0], b[1], b[2] + 1, b[3] + 1, b[4]], { rough: 1 });
    }
    // the shallow flats under the south causeway
    k.waterBody([150, 176, 16, 22, 0], { deep: false, rough: 3 });
    // the Ladon: from the oakwood (NW) through the lake's west end, out west to Siren; shallow, wadeable
    k.river([[52, -6], [58, 22], [50, 50], [44, 70]], { half: 2.6, deep: false, bed: 0, bank: 4 });
    k.river([[34, 120], [18, 114], [-6, 112]], { half: 3.2, deep: false, bed: 0, bank: 4, fords: [[14, 113]], name: 'ladon' });
    // the town island, the harpy isle off the north causeway
    k.island([150, 124, 22, 17, 0.2], 1);
    k.island([166, 86, 9, 7, 0.4], 2);
    k.hill([166, 86, 7, 5, 0.4], 3, 2, 1);
    k.spot('isle', [166, 86]);
    // causeways: N narrow (the choke), E middle, S broad; the spur to the isle
    k.causeway([[150, 50], [150, 106]], 0.9);
    k.causeway([[170, 124], [216, 128]], 1.3);
    k.causeway([[150, 142], [150, 198]], 2.4);
    k.causeway([[151, 80], [158, 82], [163, 85]], 0.6);
    k.spot('narrows', [150, 97]);
    // the town: square, stalls round it, the caravan yard east of it
    k.square([148, 124], 7);
    k.paint('dirt', [164, 120, 6, 5, 0], { rough: 1 });
    k.spot('caravanYard', [164, 120]);
    // roads: N down to the causeway head, over it to the square; S over the broad causeway; E over the marsh up to the
    // woods; the north shore track west to the Ladon ford and the Siren road along the south-west shore
    k.road([N, [128, 20], [146, 40], [150, 56], [150, 106], [148, 124]], { w: 0.9, grade: 4 });
    k.road([[148, 124], [150, 150], [150, 196], [140, 222], [128, 260]], { w: 1.6 });
    k.road([[148, 124], [190, 126], [216, 128], [236, 126], E], { w: 1.3 });
    k.road([[146, 44], [110, 46], [72, 56], [40, 84], [22, 104], [14, 113], [6, 126], W], { w: 1.2 });
    k.road([[140, 222], [96, 206], [56, 186], [30, 160], [10, 140], W], { w: 1.2 });
    k.spot('fordW', [14, 113]);
    // fields on the south fens (flax, food 2), woods
    k.fields([90, 222, 22, 9, 0.15], 0.15);
    k.resource('food', [90, 222], 6, 14);
    k.fields([200, 222, 16, 8, -0.2], -0.2);
    k.forest([60, 20, 34, 12, 0.2], [198, 22, 30, 12, -0.2], [236, 70, 16, 34, 0.1], [238, 196, 14, 30, -0.1], [166, 86, 6, 4, 0.4]);
    // town pieces: houses, stalls, the timber yard, a shrine; fishing huts and a watch post on the shores
    k.piece('dodona/hut-ruin', [138, 112], { r: 10, n: 5, gap: 4 });
    k.piece('dodona/hut-ruin', [140, 138], { r: 10, n: 4, gap: 4 });
    k.piece('elaia/beehives', [158, 140], { r: 6 });
    k.piece('elaia/wall-a', [160, 112], { r: 4, n: 2 });
    k.piece('elaia/wall-b', [160, 136], { r: 4, n: 2 });
    k.piece('elaia/shrine', [134, 124], { r: 4 });
    k.piece('dodona/timber-stand', [166, 116], { r: 5 });
    k.piece('elaia/goats', [166, 126], { r: 4 });
    k.piece('watchtower', [158, 60], { r: 6 });
    k.piece('dodona/hut-ruin', [32, 98], { r: 8 });
    k.piece('dodona/hut-ruin', [196, 210], { r: 8 });
    k.piece('elaia/beehives', [70, 200], { r: 8, n: 2 });
    k.piece('dodona/oracle-grove', [62, 26], { r: 10 });
    // fauna: the Stymphalian harpies on the isle, river serpents in the east marsh and at the Ladon's mouth
    k.lair('wolf', [167, 86], { count: 10, as: 'Stymphalian harpies' });
    k.lair('boar', [214, 160], { as: 'river serpents' });
    k.lair('boar', [40, 132], { as: 'river serpents' });
    k.claim([148, 124], 120);
  },
};
export default def;
