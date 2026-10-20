/**
 * Elaia, alliance home SW (docs/WAR.md): terraced olive hills round a sheltered bay, marble.
 * Layout (Gemini reference shots/war/gemini/art2/elaia): the bay opens to the sea by a strait in the south-west corner;
 * round it the land climbs in curved olive terraces (h1-4, one level per band, bands 20-26 tiles wide, following the
 * shore) like an amphitheatre. On the bay's north-west shore the citadel headland (h5, sea cliffs, one ramp) is the fort
 * site; the town and harbour sit on the north-east shore (home camp) where a brook comes down from the north in a
 * ravine through the terraces and widens into a deep estuary, crossed by the old bridge at its narrows. North-east the
 * marble knoll (h5) crowns the terraces; the east road climbs to it through a sunken cut (ambush) between the knoll and
 * the south-east vineyard spur.
 */
import { E, fbm, type Kit, type RegionDef } from './kit.ts';

const OLIVES = E(['olive-orchard', 'olive-orchard', 'olive-tall', 'olive-ancient']);
const BAY: [number, number] = [68, 184];

const def: RegionDef = {
  id: 'elaia',
  style: { dry: 0.15 },
  build(k: Kit) {
    k.fill(1);
    k.zone('elaia', () => 99);
    // terraces round the bay: noisy contour bands, one level per band, up to h4 inland
    k.lift((x, y, s) => {
      const d = Math.hypot(x - BAY[0], (y - BAY[1]) / 0.85) + 9 * fbm(x, y, 26, s) + 3 * fbm(x, y, 7, s + 1);
      return 1 + Math.max(0, Math.min(3, Math.floor((d - 54) / 15)));
    });
    // the marble knoll (NE), the north ridge and the vineyard spur (SE) rise over the terraces; the inland bowl (E) sinks
    k.hill([208, 58, 34, 24, 0.4], 6, 5);
    k.ridge([[150, 30], [176, 18], [204, 22]], { crest: 5, step: 4, top: 2, reach: 18 });
    k.hill([218, 200, 34, 22, -0.4], 5, 5);
    k.basin([200, 128, 26, 14, 0.2], 3, 0, 4);
    // the bay, its strait and the open sea in the corner
    k.waterBody([BAY[0], BAY[1], 46, 34, 0.35], { shore: 3, beach: 2 });
    k.river([[58, 204], [44, 214], [32, 232], [12, 246], [-8, 262]], { half: 8, bed: 0, bank: 2 });
    k.waterBody([-6, 266, 40, 30, 0.4], { shore: 3, beach: 2 });
    // the citadel headland on the bay's north-west shore: sea cliffs, flat top
    k.plateau([34, 150, 25, 15, -0.35], 5);
    k.spot('fortSite', [32, 148]);
    // the brook (shallow) in its ravine and the deep estuary below it, narrows at the old bridge
    k.river([[150, -6], [146, 18], [128, 42], [134, 70], [118, 96], [112, 124]], { half: 1.6, deep: false, bed: 1, bank: 2 });
    k.river([[113, 118], [110, 138], [104, 152], [98, 162]], { half: 4.5, bed: 0, bank: 2, narrows: [[[110, 138], 2.5]], name: 'estuary' });
    // town square and harbour (home camp)
    k.square([124, 160], 6.5);
    k.spot('homeCamp', [122, 160]);
    // roads: W past the citadel over the old bridge to the town; the citadel ramp; N down the brook; E up the cut; S on the coast
    k.road([[-4, 120], [22, 118], [50, 124], [74, 128], [96, 132], [110, 138], [118, 150], [122, 160]], { bridges: [[110, 138]] });
    k.road([[46, 124], [52, 136], [44, 144], [34, 148]], { fill: true, grade: 2.5 });
    k.road([[128, -4], [116, 22], [108, 50], [104, 80], [96, 106], [86, 128]]);
    k.road([[122, 160], [144, 156], [166, 146], [186, 134], [210, 126], [234, 128], [260, 128]], { grade: 5 });
    k.road([[122, 160], [128, 182], [140, 206], [134, 232], [128, 260]]);
    k.spot('eastCut', [190, 132]);
    k.spot('oldBridge', [110, 138]);
    k.spot('marbleKnoll', [208, 56]);
    k.road([[200, 64], [194, 96], [186, 134]], { grade: 3 });
    k.spot('olives', [150, 96]);
    k.spot('fortress', [30, 150]);
    // ground: groves on the terraces, the vineyards, marble on the knoll, holm-oak copses, stone pines on the headland
    k.patch('elaia', 'grove', [150, 96, 34, 20, 0.6]);
    k.patch('elaia', 'grove', [60, 86, 30, 14, 0.1]);
    k.patch('elaia', 'rossa', [196, 186, 18, 8, -0.4]);
    k.patch('elaia', 'rossa', [168, 222, 12, 6, -0.2]);
    k.patch('elaia', 'marble', [210, 54, 10, 7, 0.4]);
    k.forest([30, 60, 22, 12, 0.4], [70, 24, 16, 8, 0.2], [244, 92, 10, 18, 0.3], [236, 240, 16, 9, -0.3], [176, 40, 12, 5, 0.1], [22, 176, 8, 5, 0.3], [160, 232, 10, 6, 0.6]);
    k.rows(OLIVES, [150, 96, 40, 24, 0.6], { dx: 3, dy: 3 });
    k.rows(OLIVES, [60, 86, 34, 16, 0.1], { dx: 3, dy: 3 });
    k.rows(OLIVES, [176, 176, 30, 20, -0.4], { dx: 4, dy: 3 });
    k.rows(['elaia/vines'], [196, 186, 17, 7, -0.4], { dx: 2, dy: 3 });
    k.rows(['elaia/vines'], [168, 222, 11, 5, -0.2], { dx: 2, dy: 3 });
    // resources (food 3, wood 2, stone 2, marble 2) and town pieces
    k.resource('marble', [210, 54], 4, 10);
    k.piece('elaia/marble-quarry', [218, 62], { r: 10 });
    k.resource('food', [140, 172], 3, 12);
    k.resource('stone', [70, 40], 3, 14);
    k.piece('elaia/shrine', [204, 48], { r: 8 });
    k.piece('elaia/shrine', [26, 146], { r: 6 });
    k.piece('elaia/beehives', [142, 150], { r: 10, n: 2 });
    k.piece('elaia/wall-a', [112, 168], { r: 8, n: 3 });
    k.piece('elaia/wall-b', [132, 166], { r: 8, n: 2 });
    k.piece('elaia/goats', [170, 60], { r: 16 });
    k.piece('elaia/goats', [226, 210], { r: 16 });
    k.piece('watchtower', [214, 62], { r: 8 });
  },
};
export default def;
