/**
 * Eastbank Floodplain (docs/WAR.md): reeds and fields on the Great River's east bank, Achelous Ford (W) over the
 * river, Kyrene (E) up on the desert edge, the Lion Savanna (N) off it, Kyrene's two other entries at the east edge's
 * ends. Strategic purpose: the River Road's east bridgehead and Kyrene's breadbasket (food, flax), open to raids.
 * Depth 1: river serpents up the channels, boars in the reeds.
 * Layout (Gemini reference shots/war/regions/proto/kyrene-w.png): the deep river fills the west edge; at the stone
 * bridge over its narrows stands the bridgehead town (h1) round its square, its mudbrick quarters north and south of
 * the road band, a jetty and a ruined old span. East of it the flat floodplain (h1) is cut by shallow winding channels
 * with reeds, wide flax and grain strips between them, unfenced, mudbrick farm huts by the fields; the River Road
 * crosses it on a raised bank, fording the channels. The east third rises a tier (h4) behind a sand cliff to the
 * dry palm ground of Kyrene, the road climbing it by a ramp.
 */
import type { Kit, Pt, RegionDef } from './kit.ts';

const def: RegionDef = {
  id: 'kyrene-w',
  style: { dry: 0.4, trees: 0.7 },
  build(k: Kit) {
    const W = k.entry('achelous'), E = k.entry('kyrene'), N = k.entry('savanna'), NE = k.entry('kyrene-n'), SE = k.entry('kyrene-s');
    k.fill(1);
    k.zone('kyrene', [236, 128, 70, 170, 0], 10);
    // the desert-edge tier behind its sand cliff
    k.lift((x, y, s) => (x + 9 * Math.sin(y / 19 + s) + 4 * Math.cos(y / 6) > 188 ? 4 : NaN));
    k.paint('sand', [226, 128, 44, 160, 0], { rough: 8 });
    k.paint('marsh', [52, 128, 14, 130, 0], { rough: 8 });
    k.paint('marsh', [90, 60, 16, 10, 0.4], { rough: 4 });
    k.paint('marsh', [80, 200, 12, 14, 0.2], { rough: 4 });
    // the Great River along the west edge, narrowing at the bridge
    k.river([[30, -6], [26, 60], [24, 128], [30, 190], [26, 262]], { half: 11, bed: 0, bank: 1, narrows: [[[24, 128], 2.8]], name: 'river' });
    // the channels over the floodplain (shallow, reeds along them)
    const ch: Pt[][] = [
      [[44, 50], [80, 70], [110, 60], [140, 84], [150, 120], [158, 150], [160, 200], [148, 262]],
      [[44, 200], [76, 186], [100, 158], [96, 120], [116, 96], [130, 40], [120, -6]],
      [[44, 96], [70, 104], [84, 140], [70, 176], [80, 226], [100, 262]],
    ];
    ch.forEach((c, n) => k.river(c, { half: 1.4, deep: false, bed: 0, bank: 1.5, name: `channel${n}` }));
    // the bridgehead square
    const hub: Pt = [62, 128];
    k.square(hub, 7, 1);
    // roads: the River Road over the bridge, across the floodplain on its bank, up the ramp to Kyrene; north to the
    // savanna; the east edge's tracks
    k.road([W, [6, 128], [24, 128], [44, 128], hub], { w: 1.4, grade: 3, bridges: [[24, 128]], span: 8 });
    k.road([hub, [100, 132], [140, 126], [170, 130], [200, 128], [230, 128], E], { w: 1.5, grade: 2.4, fill: true });
    k.road([hub, [92, 96], [118, 56], [126, 20], N], { w: 1.2, grade: 3, fill: true });
    k.road([[200, 128], [224, 90], [244, 54], NE], { w: 1.1, grade: 3 });
    k.road([[200, 128], [226, 168], [244, 204], SE], { w: 1.1, grade: 3 });
    k.spot('narrows', [24, 128]);
    k.spot('bridge', [24, 128]);
    // the fields between the channels (flax and grain)
    k.fields([126, 186, 22, 14, 0.5], 0.5);
    k.fields([168, 80, 16, 12, -0.4], -0.4);
    k.fields([118, 160, 14, 8, 0.2], 0.2);
    k.resource('food', [126, 186], 5, 16);
    k.resource('food', [168, 80], 4, 12);
    // the town: the agora, the quarters either side of the road band, the jetty; farm huts; a ruined span
    k.agora(hub);
    k.scatterTown(['house-a', 'house-b', 'workshop', 'house-a', 'cottage', 'storehouse'].map((id) => `elaia/town-${id}`), [66, 92], { n: 8, r1: 26, gap: 5 });
    k.scatterTown(['house-b', 'cottage', 'house-a', 'farm', 'cottage'].map((id) => `elaia/town-${id}`), [66, 164], { n: 6, r1: 24, gap: 5 });
    k.jetty([46, 150], 14);
    k.piece('wall-ruin', [36, 112], { r: 4, n: 2, gap: 3 });
    k.village([150, 210], 4);
    k.village([200, 70], 3);
    // the palm ground: an oasis spring, palms and tamarisk
    k.oasis([222, 176], 2.2);
    k.oasis([214, 84], 1.6);
    k.forest([100, 40, 14, 8, 0.4], [60, 236, 16, 10, 0.2]);
    // fauna: river serpents up the channels, boars in the reeds
    k.lair('boar', [150, 116], { as: 'river serpents' });
    k.lair('boar', [86, 220], { as: 'river serpents' });
    k.lair('boar', [104, 40], { as: 'boars' });
    k.lair('boar', [210, 220], { as: 'boars' });
    k.claim(hub, 140);
  },
};
export default def;
