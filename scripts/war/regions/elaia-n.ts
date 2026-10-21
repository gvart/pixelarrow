/**
 * Lakeshore Fens (docs/WAR.md): reed fens on Lake Stymphalia's south shore, the lake (N) above, Elaia (S) below, the
 * Bacchae Hills (E) off it, Elaia's two other entries at the north ends of the side edges. Strategic purpose: the
 * Lake Road's causeway landfall and a breadbasket (food, flax, herbs). Depth 1: river serpents in the reeds, boars.
 * Layout (Gemini reference shots/war/regions/proto/elaia-n.png): the deep lake fills the north; the Lake Road comes
 * over it on a single causeway, 8 tiles wide, and lands on a firm grassy tongue in the middle of a wide reed marsh cut by
 * shallow channels. Low islands (h3) flank the landfall a bowshot off the causeway, one with a ruined watch tower:
 * archers' ground over the narrows. South of the marsh the firm farmland stands a tier up (h3): wide fields and flax
 * strips by the channels, the farm village round its well (the claim point), and a higher bench (h5) along the south
 * and west edges toward Elaia's hills. Dry tracks on the side benches lead north to Elaia's other entries, a road east
 * to the Bacchae.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';

const def: RegionDef = {
  id: 'elaia-n',
  style: { trees: 0.6, dry: 0.4 },
  build(k: Kit) {
    const N = k.entry('stymphalia'), S = k.entry('elaia'), E = k.entry('bacchae'), NW = k.entry('elaia-w'), NE = k.entry('elaia-e');
    k.fill(2);
    k.zone('elaia', () => 99);
    // the firm land a tier up south of the marsh, the bench higher still along the south and west edges, the side
    // benches the tracks run on
    k.lift((x, y, s) => (y + 6 * Math.sin(x / 17 + s) > 128 ? 3 : NaN));
    k.lift((x, y, s) => (y + 5 * Math.sin(x / 13 + s) > 226 || x + 5 * Math.sin(y / 11) < 22 && y > 120 ? 5 : NaN));
    k.lift((x, y) => (x < 20 || x > 236 ? 3 : NaN));
    // the marsh and the lake; channels through the reeds; reed pools
    k.paint('marsh', [128, 92, 120, 42, 0], { rough: 8 });
    k.waterBody([128, 20, 100, 44, 0.02], { shore: 3, beach: 1, rough: 6 });
    for (const c of [[[34, 70], [70, 96], [92, 124], [88, 160], [70, 196], [60, 262]], [[226, 66], [190, 92], [168, 124], [176, 160], [196, 200], [204, 262]], [[60, 40], [70, 70], [56, 110], [40, 140]]] as Pt[][]) k.river(c, { half: 1.1, deep: false, bed: 1, bank: 2 });
    for (const b of [[60, 84, 6, 3, 0.4], [186, 84, 7, 3, -0.3], [100, 104, 4, 2, 0], [210, 108, 5, 3, 0.2], [40, 104, 4, 3, 0]] as const) k.waterBody([...b], { deep: false, beach: 0, rough: 1 });
    // the causeway and its landfall tongue; the islands over it
    k.causeway([[128, -6], [128, 30], [126, 62], [122, 82]], 2, 1);
    k.island([118, 98, 10, 16, 0.2], 2);
    k.spot('narrows', [127, 44]);
    k.spot('landfall', [120, 92]);
    for (const [b, h] of [[[100, 68, 8, 5, 0.4], 3], [[154, 72, 9, 6, -0.3], 3], [[90, 92, 5, 4, 0], 2], [[150, 102, 6, 4, 0.5], 2]] as const) k.island([...b], h, 1.5);
    k.spot('isleW', [100, 68]);
    k.spot('isleE', [154, 72]);
    // roads: the Lake Road over the causeway and the tongue to the village and on to Elaia; east to the Bacchae; the
    // side tracks north to Elaia's other entries
    const hub: Pt = [112, 150];
    k.road([N, [128, 30], [126, 62], [120, 92], [114, 124], hub, [120, 190], [126, 226], S], { w: 1.4, grade: 3 });
    k.road([hub, [160, 146], [208, 134], [236, 128], E], { w: 1.3, grade: 3 });
    k.road([hub, [70, 146], [30, 120], [12, 80], NW], { w: 1.1, grade: 3 });
    k.road([[208, 134], [240, 100], [246, 60], NE], { w: 1.1, grade: 3 });
    k.road([[152, 72], [140, 64], [129, 56]], { w: 0.8, grade: 2 });
    // the farmland: fields and flax by the channels, olive and herb gardens on the bench
    k.fields([70, 176, 26, 14, 0.2], 0.2);
    k.fields([176, 174, 24, 12, -0.15], -0.15);
    k.resource('food', [70, 176], 5, 16);
    k.resource('food', [176, 174], 4, 14);
    k.piece('elaia/herbs', [146, 180], { r: 8, n: 3 });
    k.piece('elaia/beehives', [96, 206], { r: 6, n: 2 });
    k.rows(['elaia/olive-orchard'], [40, 232, 22, 8, 0.1], { dx: 3, dy: 3 });
    // the farm village round its well, a second hamlet east; the ruined watch tower on the west isle; reeds' dead trees
    k.village([126, 166], 6);
    k.village([200, 160], 4);
    k.piece('watchtower', [100, 68], { r: 4 });
    k.piece('elaia/shrine', [132, 204], { r: 6 });
    k.forest([30, 200, 16, 20, 0.2], [230, 200, 18, 20, -0.2], [240, 60, 10, 30, 0]);
    // fauna: river serpents in the reeds either side of the causeway, boars in the south woods
    k.lair('boar', [70, 98], { as: 'river serpents' });
    k.lair('boar', [190, 100], { as: 'river serpents' });
    k.lair('boar', [30, 206], { as: 'boars' });
    k.lair('boar', [232, 210], { as: 'boars' });
    k.claim(hub, 160);
  },
};
export default def;
