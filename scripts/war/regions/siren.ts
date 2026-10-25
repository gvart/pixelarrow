/**
 * Siren Estuary (docs/WAR.md): the wet west coast between the Western Heath and the Pirate Coves, the rim's beacon on
 * its sea stack (W-48 landmark rimWatch, ./landmarks.ts) with the harbour town under it and Scylla in the water by the
 * sea cave. Strategic purpose: silver, salt and flax by the sea; beaches.
 * The land is the raid-tuned draft (./drafts.ts template: the landmark, roads, river, hub, nodes, beaches) with the
 * W-52 set pieces of the reference (shots/war/landmarks/proto/rim/rim_1.png: a dark rock stack over the sea, the
 * estuary's tidal flats and channels beside it) laid round it (./draftCompose.ts keeps what the raids and the purpose
 * use as drafted):
 *   the Siren Head   a great stepped headland north of the stack, its crown bare dark rock, falling to the sea in
 *                    sheer cliffs and to the river in terraces;
 *   the estuary      the river mouth south of the stack spread into tidal flats: sand bars, shallow pools, reed beds;
 *   the Salt Downs   a cliff-rimmed tableland east of the river, the silver road under its north rim;
 *   the salt flats   the whole south-east sunk to tidal salt marsh (h1) with shallow pans and creeks, the roads
 *                    crossing it on their old raised beds.
 */
import type { Kit } from './kit.ts';
import { composeOnDraft } from './draftCompose.ts';
import { massif } from './setpieces.ts';

export default composeOnDraft('siren', { staging: [47, 312] }, (k: Kit) => {
  massif(k, {
    outline: [[14, -12], [114, -12], [120, 30], [104, 70], [72, 96], [34, 104], [14, 100]],
    crown: [[22, 10], [56, 8], [62, 34], [40, 52], [22, 44]],
    base: 2, tiers: 3, steps: [2, 2, 3], wobble: 0.25,
  });
  // the head's crown in dark pines, a wind-bent wood down its east tiers
  k.forest([40, 28, 26, 22, 0.3], [92, 52, 14, 22, 0.5]);
  // the estuary: the low ground round the river mouth, tidal sand, pools and reeds
  k.basin([52, 228, 60, 32, 0.15], 1, 0, 4);
  k.paint('sand', [50, 230, 58, 30, 0.15], { on: ['grass', 'dirt'], rough: 6 });
  for (const [x, y, rx, ry, a] of [[22, 212, 9, 4, 0.4], [46, 240, 12, 4, -0.2], [74, 222, 8, 3, 0.6], [92, 246, 10, 3, 0.1], [30, 246, 6, 3, 0], [64, 204, 6, 3, -0.4]] as const) k.waterBody([x, y, rx, ry, a], { deep: false, beach: 1, rough: 1.5 });
  k.paint('marsh', [84, 214, 18, 10, 0.3], { on: ['grass', 'sand'], rough: 4 });
  k.paint('marsh', [12, 196, 10, 14, 0], { on: ['grass', 'sand'], rough: 4 });
  // the Salt Downs east of the river
  massif(k, {
    outline: [[176, 58], [214, 56], [236, 50], [266, 64], [266, 116], [206, 118], [180, 98]],
    crown: [244, 86], base: 2, tiers: 2, steps: [2, 2], wobble: 0.2,
  });
  // the salt flats: the south-east sunk to tidal marsh, pans and creeks
  k.basin([194, 204, 70, 60, 0.15], 1, 0, 6);
  k.paint('marsh', [194, 204, 66, 56, 0.15], { on: ['grass', 'dirt'], rough: 8 });
  k.paint('sand', [214, 222, 40, 30, -0.3], { on: ['marsh'], rough: 6 });
  for (const [x, y, rx, ry, a] of [[160, 172, 9, 4, 0.3], [222, 160, 12, 5, -0.2], [176, 226, 10, 4, 0.5], [236, 200, 9, 6, 0], [208, 244, 12, 4, 0.1], [150, 236, 8, 4, -0.3], [244, 240, 7, 4, 0.4], [196, 152, 6, 3, 0]] as const) k.waterBody([x, y, rx, ry, a], { deep: false, beach: 1, rough: 1.5 });
  for (const c of [[[262, 176], [230, 186], [210, 212], [184, 238], [170, 262]], [[150, 150], [170, 190], [160, 214]]] as const) k.river(c.map((p) => [p[0], p[1]] as [number, number]), { half: 1, deep: false, bed: 0, bank: 1 });
}, { trees: 0.25, bushes: 0.3 });
