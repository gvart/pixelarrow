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
 *   the Salt Downs   a cliff-rimmed tableland east of the river, the silver road under its north rim.
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
}, { trees: 0.25, bushes: 0.3 });
