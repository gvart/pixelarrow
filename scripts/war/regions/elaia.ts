/**
 * Elaia, alliance home SW (docs/WAR.md): terraced olive hills round a sheltered bay, marble.
 * Layout (Gemini reference shots/war/regions/proto/elaia.png; W-52 set pieces, ./setpieces.ts relief): the bay opens to
 * the sea by a strait in the south-west corner; round it a great amphitheatre of curved olive terraces climbs away from
 * the water toward the north, east and south corners: the harbour shore (h2), then terraces at h4, 6, 8 and 10, each
 * a tall retaining wall (two levels) over the one below, along noisy contours that follow the shore, olives in rows
 * along them. On the bay's north-west shore the citadel headland (h10) rises straight out of the sea on sheer walls,
 * one ramp up (fort site); the town and harbour sit on the north-east shore (home camp) where a brook comes down from
 * the north in a sheer ravine cut through the terraces and widens into a deep estuary, crossed by the old bridge at its
 * narrows. North-east the marble knoll stands a five-level wall over the top terrace (h15), a quarry cut into it in
 * benches; the east road climbs to it through a sunken cut (ambush) between the knoll and the south-east vineyard spur.
 */
import { E, fbm, type Kit, type RegionDef } from './kit.ts';
import { pit, profile, relief, valley } from './setpieces.ts';

const OLIVES = E(['olive-orchard', 'olive-orchard', 'olive-tall', 'olive-ancient']);
const BAY: [number, number] = [68, 184];
/** The amphitheatre's contour coordinate: distance from the bay (squeezed north-south), bent by noise. */
const terraceD = (x: number, y: number) => Math.hypot(x - BAY[0], (y - BAY[1]) / 0.85) + 10 * fbm(x, y, 30, 41) + 3 * fbm(x, y, 8, 42);

const def: RegionDef = {
  id: 'elaia',
  style: { dry: 0.15, trees: 0.15, bushes: 0.25 },
  build(k: Kit) {
    k.fill(1);
    k.zone('elaia', () => 99);
    // the bay, its strait and the open sea in the corner (before the relief: it leaves the water)
    k.waterBody([BAY[0], BAY[1], 46, 34, 0.35], { shore: 3, beach: 2 });
    k.river([[58, 204], [44, 214], [32, 232], [12, 246], [-8, 262]], { half: 8, bed: 0, bank: 2 });
    k.waterBody([-6, 266, 40, 30, 0.4], { shore: 3, beach: 2 });
    // the amphitheatre: one elevation climbing away from the bay along noisy contours that follow the shore, snapped by
    // the cliff bands into flat terraces (h2 shore, 4, 6, 8, 10) under tall retaining walls; the marble knoll a wall
    // higher again in the north-east, the vineyard spur a low swell in the south-east
    relief(k, (x, y, s) => {
      const d = terraceD(x, y);
      let v = profile([[48, 1], [58, 1.6], [76, 2.4], [82, 3.2], [190, 10.6], [300, 10.9]], d);
      const kn = Math.hypot((x - 210) * 0.9 + (y - 56) * 0.4, (y - 56) * 0.95 - (x - 210) * 0.3) + 4 * fbm(x, y, 9, s + 2);
      v = Math.max(v, 15.4 - 2.5 * Math.max(0, kn - 30));
      const sp = Math.hypot((x - 222) * 0.7 + (y - 200) * 0.5, (y - 200) - (x - 222) * 0.4) + 4 * fbm(x, y, 10, s + 3);
      return v + 2.2 * Math.max(0, Math.min(1, (30 - sp) / 14));
    }, { cliffs: [[2, 4], [4, 6], [6, 8], [8, 10], [10, 15]], jitter: 0.15 });
    // the citadel headland on the bay's north-west shore: sheer walls straight out of the sea, a flat top
    k.plateau([34, 150, 25, 15, -0.35], 10);
    k.spot('fortSite', [32, 148]);
    // the brook's ravine: a sheer cut through the terraces down to the shore
    const brook: [number, number][] = [[150, -6], [146, 18], [128, 42], [134, 70], [118, 96], [112, 124]];
    valley(k, brook, { floor: 1, rim: 0, half: 4, wall: 0, reach: 0 });
    // the marble quarry cut into the knoll in benches
    pit(k, [224, 58], { r: 11, ry: 7, rot: 0.4, depth: 6, benches: 3, marble: true, spot: null });
    // the brook (shallow) in its ravine and the deep estuary below it, narrows at the old bridge
    k.river(brook, { half: 1.6, deep: false, bed: 1, bank: 0.5 });
    k.river([[113, 118], [110, 138], [104, 152], [98, 162]], { half: 4.5, bed: 0, bank: 2, narrows: [[[110, 138], 2.5]], name: 'estuary' });
    // town square and harbour (home camp)
    k.square([124, 160], 6.5);
    k.spot('homeCamp', [122, 160]);
    // roads: W past the citadel over the old bridge to the town; the citadel ramp; N down the brook; E up the cut; S on the coast
    k.road([[-4, 120], [22, 118], [50, 124], [74, 128], [96, 132], [110, 138], [118, 150], [122, 160]], { bridges: [[110, 138]] });
    k.road([[46, 124], [52, 136], [44, 144], [34, 148]], { grade: 2.5 }); // cut up into the headland
    k.road([[128, -4], [116, 22], [108, 50], [104, 80], [96, 106], [86, 128]]);
    k.road([[122, 160], [144, 156], [166, 146], [186, 134], [210, 126], [234, 128], [260, 128]], { grade: 5 });
    k.road([[122, 160], [128, 182], [140, 206], [134, 232], [128, 260]]);
    k.spot('eastCut', [190, 132]);
    k.spot('oldBridge', [110, 138]);
    k.spot('marbleKnoll', [208, 56]);
    k.road([[200, 64], [194, 96], [186, 134]], { grade: 3 });
    k.road([[200, 64], [214, 60], [226, 58]], { w: 1, grade: 2 }); // down the quarry's benches
    k.road([[226, 128], [230, 160], [220, 196], [196, 214]], { w: 1, grade: 3 }); // the vineyard track up the spur
    k.spot('olives', [150, 96]);
    k.spot('fortress', [30, 150]);
    // ground: the vineyards, marble on the knoll, holm-oak copses, stone pines on the headland
    k.patch('elaia', 'rossa', [196, 186, 18, 8, -0.4]);
    k.patch('elaia', 'rossa', [168, 222, 12, 6, -0.2]);
    k.patch('elaia', 'marble', [210, 54, 10, 7, 0.4]);
    k.forest([30, 60, 22, 12, 0.4], [70, 24, 16, 8, 0.2], [244, 92, 10, 18, 0.3], [236, 240, 16, 9, -0.3], [176, 40, 12, 5, 0.1], [22, 176, 8, 5, 0.3], [160, 232, 10, 6, 0.6]);
    // olives in rows along the terrace contours, kept off the walls (a tile whose ground 2 units round is level)
    const level = (x: number, y: number) => {
      const h = k.height[k.at([x, y])];
      return [[2, 0], [-2, 0], [0, 2], [0, -2]].every(([dx, dy]) => { const j = k.at([x + dx, y + dy]); return j < 0 || k.height[j] === h; });
    };
    k.rowsAt((x, y) => OLIVES[Math.abs(Math.round(x * 7 + y * 13)) % OLIVES.length], (x, y) => {
      const d = terraceD(x, y), r = d / 6;
      return d > 84 && Math.abs(r - Math.round(r)) < 0.13 && level(x, y) && Math.hypot(x - 124, y - 160) > 34;
    }, ['grass', 'dry', 'grove', 'rossa'], 4);
    k.rows(['elaia/vines'], [196, 186, 17, 7, -0.4], { dx: 2, dy: 3 });
    k.rows(['elaia/vines'], [168, 222, 11, 5, -0.2], { dx: 2, dy: 3 });
    // resources (food 3, wood 2, stone 2, marble 2) and town pieces
    k.resource('marble', [210, 54], 4, 10);
    // the home agora, the town round it, olive presses on the terraces, jetties in the harbour
    k.agora([124, 160]);
    k.houses([124, 160], 18, 16, 40, ['house-a', 'house-b', 'house-a', 'workshop', 'storehouse', 'house-b', 'cottage']);
    k.outskirts([124, 160], 5, 32, 56, ['olive-press', 'farm', 'olive-press', 'cottage']);
    k.jetty([124, 160], 60);
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
