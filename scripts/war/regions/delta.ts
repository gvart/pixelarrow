/**
 * Achelous Delta (docs/WAR.md): where the Achelous meets the southern sea, the river-god's half-sunk temple on the
 * largest mud island of a lagoon (W-48 landmark sunkenTemple, ./landmarks.ts), the hydra in the reeds. Strategic
 * purpose: food, iron and salt; a chokepoint at the river fords.
 * The land is the raid-tuned draft (./drafts.ts template: the lagoon and its causeways, rivers, fords, roads, hub,
 * nodes, fields) with the W-52 set pieces of the reference (shots/war/landmarks/proto/sunken/sunken_1.png: dark water,
 * mud islands with dead trees and reeds) laid round it (./draftCompose.ts keeps what the raids and the purpose use as
 * drafted):
 *   the river terrace   the old flood terrace north of the great river east of the fields, two bluffs over its north bank;
 *   the fens            west and east of the lagoon: reed marsh cut by creeks, pools and mud islands with dead trees,
 *                       down to the sea.
 */
import type { Blob, Kit, Pt } from './kit.ts';
import { composeOnDraft } from './draftCompose.ts';
import { massif } from './setpieces.ts';

export default composeOnDraft('delta', { staging: [236, 373] }, (k: Kit) => {
  massif(k, {
    outline: [[84, -12], [268, -12], [268, 50], [210, 42], [150, 36], [104, 40], [84, 26]],
    crown: [226, 6], base: 1, tiers: 2, steps: [2, 2], wobble: 0.2,
  });
  // the fens: reed marsh with creeks, pools and mud islands, west and east of the lagoon down to the sea
  const fen = (b: Blob, pools: Blob[], dead: Pt[], creeks: Pt[][]) => {
    k.basin(b, 1, 0, 4);
    k.paint('marsh', b, { on: ['grass', 'sand', 'dirt'], rough: 6 });
    for (const p of pools) k.waterBody(p, { deep: false, beach: 0, rough: 1.5 });
    for (const c of creeks) k.river(c, { half: 1.1, deep: false, bed: 0, bank: 1.5 });
    for (const p of dead) k.piece('dead-tree', p, { r: 7, n: 4, gap: 2 });
  };
  fen([28, 170, 34, 76, 0.05],
    [[14, 120, 8, 5, 0.3], [40, 140, 10, 5, -0.4], [18, 160, 6, 9, 0.1], [44, 214, 10, 6, 0.5], [16, 226, 11, 5, 0], [30, 104, 7, 4, 0.2], [48, 180, 7, 4, 0.8], [8, 186, 5, 4, 0]],
    [[26, 132], [12, 206], [42, 166], [50, 230]],
    [[[46, 96], [30, 130], [36, 160], [20, 196], [30, 236], [24, 262]], [[4, 140], [18, 176], [48, 196]]]);
  fen([226, 186, 36, 64, -0.05],
    [[212, 150, 9, 5, 0.4], [240, 170, 10, 6, -0.3], [218, 214, 11, 5, 0.2], [244, 222, 8, 5, 0], [236, 140, 7, 4, 0], [204, 192, 6, 4, 0.6], [250, 246, 8, 4, 0]],
    [[226, 160], [246, 196], [206, 230]],
    [[[262, 140], [232, 158], [226, 190], [240, 220], [230, 262]], [[200, 170], [222, 200], [258, 206]]]);
}, { trees: 0.4, bushes: 0.4 });
