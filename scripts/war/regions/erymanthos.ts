/**
 * Erymanthos Wood (docs/WAR.md): a dense old oak forest on the west skirt of the central plateau, the oracle's walled
 * sanctuary in a sacred grove (W-48 landmark oracleGrove, ./landmarks.ts), the springs of the Ladon. Strategic purpose:
 * the scarp chokepoint on the road to Omphalos; wood and herbs.
 * The land is the raid-tuned draft (./drafts.ts template: the landmark, roads, the scarp's road cut, hub, stream) with
 * the W-52 set pieces of the reference (shots/war/regions/proto/erymanthos.png) laid round it (./draftCompose.ts keeps
 * what the raid and the purpose use as drafted; ./setpieces.ts relief):
 *   the scarp       the only high ground: a strip of wooded upland along the whole east edge on one long grey cliff wall
 *                   (h2 to h6), a second wall stacked over it north (h10) and south (h8) of the road cut, where the
 *                   Omphalos road climbs between sheer walls;
 *   the forest      everything else one flat floor (h2) under dense dark oaks, a few clearings, mossy boulders and
 *                   fallen trees; the stream rises in a spring pool in a clearing by the north corner and runs at the
 *                   scarp's foot to the south corner;
 *   the sanctuary   the oracle's walled grove in the south-west, as drafted.
 * The draft ground round the region-edge entries is kept only along the roads (entryBand), so no bowl is left there.
 */
import type { Kit, Pt } from './kit.ts';
import { fbm } from './kit.ts';
import { composeOnDraft } from './draftCompose.ts';
import { profile, relief } from './setpieces.ts';

/**
 * The scarp's foot (unit x along y): stepping east in jumps toward the south corner, so the wall shows faces toward the
 * viewer between its long runs, and west of the stream's lower course, so the stream runs at its foot.
 */
const wallX = (y: number) => profile([[-10, 182], [34, 184], [40, 196], [100, 194], [150, 199], [160, 206], [182, 208], [188, 216], [270, 218]], y);
/** Units behind the scarp's rim (< 0: the forest floor in front of it). */
const behind = (x: number, y: number, s: number) => x - wallX(y) - 2.5 * fbm(x, y, 9, s) - fbm(x, y, 3.5, s + 1);

// the draft's knolls by the sanctuary's north corners on the forest floor too (the site band kept them, cut square)
export default composeOnDraft('erymanthos', { staging: [162, 410], entryBand: 6, flatten: [[24, 132, 64, 172], [88, 132, 118, 150]] }, (k: Kit) => {
  // the scarp and the flat forest floor (the stream's water and the draft's rock stay)
  let rs = 0;
  relief(k, (x, y, s) => {
    rs = s;
    const d = behind(x, y, s);
    if (d < 0) return 2;
    const back = d - 7 - 2 * fbm(x, y, 7, s + 2);
    const north = y < 84 + 8 * fbm(x, y, 12, s + 3), south = y > 178 + 8 * fbm(x, y, 12, s + 4);
    if (back > 0 && north && y < 50 + 6 * fbm(x, y, 12, s + 8) && back > 8) return 12.6 + 0.5 * fbm(x, y, 10, s + 5); // the crown, a tier higher
    if (back > 0 && north) return 9.7 + 0.6 * fbm(x, y, 10, s + 5);
    if (back > 0 && south) return (y < 222 + 6 * fbm(x, y, 12, s + 9) ? 9.2 : 7.6) + 0.5 * fbm(x, y, 10, s + 6); // stepping down to the south corner
    return 6.2 + 0.4 * fbm(x, y, 14, s + 7);
  });
  // the scarp's grey rock: its walls in the mountains' granite
  k.zone('mountains', (_i, x, y) => (behind(x, y, rs) > -1.5 ? 99 : 0));
  // the spring: the stream rises in a pool in a clearing by the north corner (no water above it)
  k.each((i, x, y) => {
    if (k.water[i] && x < 18 && y < 7) { k.water[i] = 0; k.height[i] = 2; k.terrain[i] = 'grass'; }
  });
  const spring: Pt = [22, 6];
  k.waterBody([spring[0], spring[1], 6, 4, 0.3], { deep: false, beach: 1, rough: 1 });
  // the old forest: dense over the floor and the upland, but the sanctuary, the crossroads and a few clearings
  const clear: [Pt, number][] = [[spring, 12], [[139, 115], 12], [[60, 60], 9], [[100, 30], 7], [[30, 110], 8], [[150, 200], 8], [[226, 40], 7]];
  const s = k.seed();
  k.each((i, x, y) => {
    if (k.terrain[i] === 'forest' && x > 36 && x < 120 && y > 144 && y < 222) k.terrain[i] = 'grass'; // the sanctuary's grove open
    if (k.water[i] || (k.terrain[i] !== 'grass' && k.terrain[i] !== 'dirt')) return;
    if (k.inSite(x, y) || (x > 36 && x < 120 && y > 144 && y < 222)) return;
    if (clear.some(([p, r]) => Math.hypot(x - p[0], y - p[1]) < r + 3 * fbm(x, y, 6, s))) return;
    if (fbm(x, y, 18, s + 1) > 0.2) return; // small glades
    const d = behind(x, y, rs);
    if (d > -2 && d < 5) return; // the scarp's rim and foot bare, so its walls show
    k.terrain[i] = 'forest';
  });
  // huge oaks in clumps (the scatter's firs between), mossy boulders and fallen trees
  for (const b of [[40, 30, 16, 10, 0.3], [90, 60, 14, 12, 0], [60, 120, 12, 14, 0.4], [170, 60, 14, 10, -0.2], [180, 160, 10, 14, 0], [24, 200, 10, 14, 0], [130, 230, 14, 10, 0.2], [228, 70, 12, 20, 0], [234, 210, 10, 18, 0]] as const)
    k.rows(['dodona/oak-a', 'dodona/oak-b', 'dodona/oak-a', 'dodona/beech-a'], [...b], { dx: 6, dy: 5, on: ['forest', 'grass'] });
  for (const p of [[30, 14], [70, 44], [118, 70], [44, 96], [160, 96], [176, 128], [110, 120], [26, 150], [180, 220], [150, 170]] as Pt[]) {
    k.piece('dodona/boulder-moss-a', p, { r: 6, n: 2, gap: 3 });
    k.piece('dodona/log-fallen', [p[0] + 4, p[1] + 3], { r: 6 });
  }
  k.piece('dodona/boulder-moss-b', [spring[0] + 6, spring[1] + 5], { r: 4, n: 2 });
  k.piece('dodona/stump-moss', [134, 108], { r: 6, n: 3 });
}, { trees: 0.7 });
