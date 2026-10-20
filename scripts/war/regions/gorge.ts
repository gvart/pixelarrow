/**
 * Gorge of the Falls (docs/WAR.md): the Great River's gorge below the Omphalos plateau (N), between the Bacchae Hills
 * (W) and the Lion Savanna (E), Achelous Ford (S) below. Strategic purpose: the River frontier's rim crossing on the
 * Sacred Way, the south gate to Omphalos; copper.
 * Layout: the young river runs shallow over the rim land (h4) from the plateau and falls at the head of a deep gorge
 * that splits the map north to south: cliff walls down to a floor (h1) with the deep river in it. The one quick
 * crossing is the natural rock bridge, 4 tiles wide at rim height, with a crag (h6) over its east end. The slow way
 * round: two cliffside paths cut down the walls to a ford on the gorge floor, where the copper veins crop out of the
 * west wall and the harpies nest. West of the gorge Bacchae's cypress and maquis, east of it Savanna's dry grass and
 * acacia; the Sacred Way runs from the north ramp past the crag to the bridge and on to both sides, a road south to
 * the ford country.
 */
import type { Kit, RegionDef } from './kit.ts';

const def: RegionDef = {
  id: 'gorge',
  style: { dry: 0.1, trees: 0.7, meadow: 0.3 },
  build(k: Kit) {
    const N = k.entry('omphalos'), S = k.entry('achelous'), E = k.entry('savanna'), W = k.entry('bacchae');
    k.fill(4);
    k.zone('elaia', [20, 128, 90, 170, 0], 10);
    k.zone('kyrene', [240, 150, 80, 150, 0], 10);
    k.zone('mountains', [106, 128, 22, 150, 0], 6);
    // the rim land: hills on both sides, lower toward the south
    k.hill([40, 60, 30, 20, 0.3], 5, 5);
    k.hill([200, 54, 34, 18, -0.3], 5, 5);
    k.basin([128, 250, 120, 30, 0], 3, 6, 4);
    // the river on the rim and the falls, the gorge (floor h1, cliff walls) and the deep river in it with the ford
    k.river([[110, -6], [111, 30], [108, 64]], { half: 2.6, deep: false, bed: 3, bank: 2 });
    const G: [number, number][] = [[108, 60], [106, 84], [104, 120], [100, 160], [102, 192], [100, 226], [98, 262]];
    k.cut(G, { h: 1, half: 11, bank: 0, t: 'sand' });
    k.river(G.slice(1), { half: 4.5, bed: 0, bank: 0.5, fords: [[102, 192]], fordHalf: 1.8, name: 'gorge' });
    k.spot('falls', [108, 64]);
    // the gorge walls: crags along both rims (massifs over them), the falls' lip at the head
    for (const dx of [-15, 15]) k.mountains(G.slice(1).map(([x, y]) => [x + dx, y] as [number, number]), { width: 3.2, wave: 1, foot: 4 });
    k.rockMass([96, 60, 8, 6, 0.3], { rough: 1, foot: 4 });
    k.rockMass([122, 58, 8, 6, -0.3], { rough: 1, foot: 4 });
    // the crag over the bridge's east end
    k.hill([124, 110, 6, 5, 0.3], 6, 1.5, 1);
    k.spot('crag', [124, 110]);
    // roads: the Sacred Way from the north ramp past the crag, over the rock bridge (rim height) west; east to the
    // savanna; south; the two cliffside paths down to the ford
    k.road([N, [130, 20], [136, 60], [138, 100], [138, 120]], { w: 1.4, grade: 4 });
    k.road([[138, 120], [116, 120], [104, 120], [90, 120], [70, 124], [30, 126], W], { w: 1, grade: 40, fill: true, bridges: [[104, 120]], span: 8, pass: 4 });
    k.road([[138, 120], [170, 124], [210, 128], E], { w: 1.4, grade: 4 });
    k.road([[138, 120], [146, 160], [140, 210], [130, 236], S], { w: 1.3, grade: 4 });
    k.road([[60, 150], [76, 172], [86, 186], [96, 192], [108, 192], [116, 186], [124, 176], [144, 172]], { w: 1, grade: 1.6, pass: 4 });
    k.spot('narrows', [110, 120]);
    k.spot('rockBridge', [104, 120]);
    // copper in the west wall over the floor, stone on the rims
    k.resource('copper', [92, 168], 3, 6);
    k.resource('stone', [180, 196], 3, 10);
    k.resource('stone', [44, 210], 2, 10);
    // the rims: cypress and maquis west, acacia and dry grass east; pieces
    k.forest([40, 70, 20, 12, 0.3], [30, 190, 16, 10, -0.2], [214, 70, 16, 10, 0.2]);
    k.patch('kyrene', 'hardpan', [220, 180, 18, 12, 0.2]);
    k.piece('elaia/shrine', [70, 112], { r: 8 });
    k.piece('mountains/cairn', [128, 128], { r: 5, n: 2 });
    k.piece('watchtower', [132, 104], { r: 6 });
    k.piece('mountains/eagle-nest', [86, 90], { r: 10, onRock: false });
    // fauna: harpies by the copper on the floor, river serpents at the ford and below the falls
    k.lair('wolf', [92, 160], { as: 'harpies' });
    k.lair('boar', [110, 200], { as: 'river serpents' });
    k.lair('wolf', [180, 60], { as: 'harpies' });
    k.claim([138, 124], 160);
  },
};
export default def;
