/**
 * Cape of Winds (docs/WAR.md): a rocky goat cape, Elaia (N) inland, the Achelous Delta (E) along the coast, Elaia's
 * two other entries at the south ends of the side edges, the sea (S). Strategic purpose: a fortress over the Delta
 * approach, room on its slopes. Depth 1: boars in the scrub, brigands watching the Delta road from the steps.
 * Layout (Gemini reference shots/war/regions/proto/elaia-s.png; W-52 set pieces): the whole cape is one massif that
 * climbs from sheer sea cliffs in four rolling tiers on pale limestone walls (h5-6, h9-10, h12-13) to a wide summit (h14-15) in the
 * north-west with the ruined fort. Only two paths reach
 * the top: the road up from Elaia and the road down toward the Delta, each by ramps through every wall. A small sand
 * beach lies at the cape's foot in the south; goat terraces and scrub on the steps; the coast track joins Elaia's other
 * entries along the lowest tier, the claim point where it meets the Delta road.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';
import { fbm } from './kit.ts';
import { massif, profile, relief } from './setpieces.ts';

const def: RegionDef = {
  id: 'elaia-s',
  style: { dry: 0.15, dryHigh: false, trees: 0.08, bushes: 0.12 },
  build(k: Kit) {
    const N = k.entry('elaia'), E = k.entry('delta'), SW = k.entry('elaia-w'), SE = k.entry('elaia-e');
    k.fill(2);
    k.zone('elaia', () => 99);
    // the sea along the south first, so the cape's lowest tier stands on it as sheer cliffs
    k.waterBody([128, 280, 250, 44, 0], { shore: 4, beach: 0, rough: 6 });
    const cape = massif(k, {
      outline: [[-12, -12], [268, -12], [268, 176], [232, 214], [176, 232], [110, 238], [50, 236], [-12, 230]],
      crown: [[-12, -12], [96, -12], [100, 44], [72, 82], [-12, 92]],
      base: 2, tiers: 4, step: 3, wobble: 0.22,
    });
    // the cape's relief over the massif's contours (setpieces.ts relief): a four-level sea cliff, each tier rolling a
    // level or two up to its next wall (2-3 levels of pale limestone), the summit table at h14-15
    relief(k, (x, y, s) => {
      const t = cape.t(x, y);
      if (t < 0) return NaN;
      return profile([[0, 5], [0.85, 6.6], [1, 9], [1.85, 10.4], [2, 12], [2.8, 12.6], [3, 14.6], [4, 15]], t) + 0.45 * fbm(x, y, 10, s) + (t < 1 ? 0.5 * fbm(x, y, 4, s + 1) : 0);
    }, { cliffs: [[6.6, 9], [10.4, 12], [12.6, 14.6]] });
    k.spot('fortress', [42, 40]);
    // a strand of fallen rock at the cliffs' foot (h1, 2-3 units), so the sea lies low under the walls
    {
      const { W, H, K } = k, r = Math.round(2.5 * K), near = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (k.water[y * W + x]) {
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && dx * dx + dy * dy <= r * r) near[ny * W + nx] = 1;
        }
      }
      for (let i = 0; i < W * H; i++) if (near[i] && !k.water[i]) { k.height[i] = 1; k.terrain[i] = 'sand'; }
    }
    // the beach in a cove at the cape's foot
    k.waterBody([160, 238, 24, 10, 0.1], { shore: 2, beach: 5, rough: 2 });
    k.spot('beach', [160, 224]);
    // roads: up from Elaia to the summit, down toward the Delta, ramps through the walls; the coast track
    const hub: Pt = [196, 170];
    k.road([N, [128, 20], [110, 40], [80, 46], [56, 44], [42, 40]], { w: 1.2, grade: 2, fill: true });
    k.road([[80, 46], [104, 86], [136, 116], [170, 142], hub, [222, 150], [244, 132], E], { w: 1.2, grade: 2, fill: true });
    k.road([SW, [30, 214], [70, 206], [110, 200], [150, 192], hub, [222, 200], [244, 212], SE], { w: 1.1, grade: 2, fill: true });
    k.road([[150, 192], [156, 210], [160, 222]], { w: 1, grade: 1.5 });
    k.road([[136, 116], [150, 106], [158, 102]], { w: 0.9, grade: 1.5 }); // the brigands' step
    // the ruined fort on the summit, the goats' terraces, scrub and pines
    k.piece('wall-ruin', [42, 40], { r: 12, n: 6, gap: 5 });
    k.piece('watchtower', [36, 34], { r: 4 });
    k.piece('watchtower', [50, 46], { r: 4 });
    k.piece('elaia/goats', [60, 140], { r: 10, n: 2 });
    k.piece('elaia/goats', [170, 80], { r: 10 });
    k.piece('elaia/shrine', [70, 20], { r: 6 });
    k.forest([30, 120, 12, 8, 0.4], [180, 60, 12, 8, -0.3], [60, 190, 12, 6, 0.2], [226, 100, 10, 8, 0], [120, 150, 8, 5, 0.6], [200, 196, 9, 5, -0.4], [110, 60, 7, 4, 0.2]);
    k.resource('stone', [60, 60], 3, 10);
    k.resource('stone', [200, 100], 2, 10);
    k.resource('food', [60, 150], 2, 12);
    k.village([206, 130], 3);
    // fauna: brigands on the steps over the Delta road, boars in the scrub
    k.lair('bandit', [156, 104], { as: 'bandits' });
    k.lair('boar', [30, 120], { as: 'boars' });
    k.lair('boar', [60, 190], { as: 'boars' });
    k.lair('boar', [214, 96], { as: 'boars' });
    k.claim(hub, 160);
  },
};
export default def;
