/**
 * Eagle Saddle (docs/WAR.md): the high saddle between the Iron Teeth and the Omphalos plateau; Kleisoura (N), the
 * Grey Moors (W), the Kimmerian Hills (E), Omphalos (S). Strategic purpose: the Teeth frontier's rim crossing, the
 * north gate on the Sacred Way; iron.
 * Layout: the Teeth's last peaks close the north corners, leaving a notch for the road down from Kleisoura. The saddle
 * (h6, a flat camp ground with a ruined camp and a watch post) is climbed easily from the moors and the hills by
 * stepped slopes, but falls south to the plateau's skirt (h2) in a cliff edge: the Sacred Way goes down it by one
 * switchback ramp, 4 tiles wide, under the saddle's lip (the choke). The slow way down is the wooded spur far east.
 * The iron crops out on the saddle's north-east shoulder with the cyclops on it; wolves on the moor side and in the
 * spur woods; buttresses of the plateau stand in the south corners.
 */
import type { Kit, RegionDef } from './kit.ts';

const def: RegionDef = {
  id: 'saddle',
  style: { meadow: 0.15, trees: 0.6 },
  build(k: Kit) {
    const N = k.entry('kleisoura'), S = k.entry('omphalos'), E = k.entry('kimmeria'), W = k.entry('moors');
    k.fill(3);
    k.zone('mountains', () => 99);
    // the saddle: stepped slopes up from the moors and the hills, a flat top
    k.hill([128, 104, 104, 64, 0], 6, 4, 4);
    k.plateau([124, 106, 36, 22, 0.1], 6, { rough: 3 });
    // the Teeth's last peaks round the north notch, the plateau's buttresses in the south corners
    k.mountains([[-6, 44], [36, 30], [80, 22], [100, -6]], { width: 16, foot: 4 });
    k.mountains([[158, -6], [176, 22], [222, 32], [262, 40]], { width: 16, foot: 4 });
    k.rockMass([24, 230, 40, 36, 0.3], { rough: 3 });
    k.rockMass([236, 236, 30, 30, -0.3], { rough: 3 });
    // the south falls in a cliff edge to the plateau's skirt; the wooded spur far east comes down in steps
    k.basin([118, 222, 128, 74, 0], 2, 0, 1.5);
    k.hill([214, 176, 20, 34, 0.25], 5, 3.5, 2);
    // crags along the lip, either side of the ramp's head
    k.rockMass([64, 145, 42, 3.4, -0.04], { rough: 0.8, foot: 2 });
    k.rockMass([170, 147, 34, 3.4, 0.04], { rough: 0.8, foot: 2 });
    k.forest([214, 180, 16, 30, 0.25], [40, 150, 14, 10, 0.2]);
    // roads: down from Kleisoura through the notch; in from the moors and the hills; the switchback ramp south
    // M7d: the Cyclopean Gatehouse astride the switchback road at the top of the ramp; Brontes on its gate top
    k.landmark('cyclops', [121, 132.75], { guardians: [{ boss: 'brontes', at: [14, 6.5], perches: [[14, 2.5]] }], nodes: [['landmark/eagle-crater', 24, 6]] });
    k.road([N, [130, 24], [130, 60], [126, 96], [124, 108]], { w: 1.4, grade: 4 });
    k.road([W, [30, 126], [64, 120], [96, 112], [124, 108]], { w: 1.4, grade: 4 });
    k.road([E, [226, 128], [190, 120], [156, 112], [124, 108]], { w: 1.4, grade: 4 });
    k.road([[124, 108], [128, 134], [126, 146], [118, 153], [96, 154], [82, 156], [86, 162], [110, 163], [130, 166], [134, 186], [130, 210], [128, 236], S], { w: 1, fill: true, grade: 16 });
    k.spot('narrows', [102, 154]);
    k.road([[168, 86], [162, 102], [152, 111]], { w: 1, grade: 3 });
    k.spot('camp', [116, 104]);
    k.spot('spur', [214, 176]);
    // the camp: a ruined palisade and a watch post on the lip over the ramp
    k.piece('wall-ruin', [112, 100], { r: 8, n: 4, gap: 4 });
    k.piece('mountains/watch-post', [138, 128], { r: 5 });
    k.piece('mountains/cairn', [130, 40], { r: 6, n: 2 });
    k.piece('mountains/eagle-nest', [60, 40], { r: 10, onRock: true });
    k.piece('mountains/eagle-nest', [200, 30], { r: 10, onRock: true });
    k.piece('mountains/rockfall', [70, 206], { r: 12, n: 2 });
    // resources (stone 2, iron 1): the iron on the north-east shoulder, stone under the cliff
    k.resource('iron', [168, 80], 3, 6);
    k.resource('stone', [76, 196], 3, 10);
    k.resource('stone', [180, 210], 2, 10);
    // fauna: the cyclops on the ore, wolves on the moor side and in the spur woods
    k.lair('bear', [172, 86], { count: 8, as: 'cyclops' });
    k.lair('wolf', [44, 150], { as: 'wolves' });
    k.lair('wolf', [218, 186], { as: 'wolves' });
    k.claim([118, 104], 160);
  },
};
export default def;
