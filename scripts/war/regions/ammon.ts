/**
 * Ammon Salt Flats (docs/WAR.md): a dead desert coast of white salt flats, a dead lake and red buttes, the Dead City of
 * Ammon on its butte (W-48 landmark deadCity, ./landmarks.ts). Strategic purpose: salt and silver, a fortress butte.
 * The land is the raid-tuned draft (./drafts.ts template: the city on its three-tier butte, the lake, the sea, the
 * necropolis, roads, hub, the fort) with the W-52 set pieces of the reference (shots/war/regions/proto/ammon.png) laid
 * round it (./draftCompose.ts keeps what the raid and the purpose use as drafted):
 *   the city butte  as drafted: the dominant set piece; its pylon temple faces south (toward the viewer), so two more
 *                   pylon gates and statues line a short way up to its pylon from the south;
 *   the fort butte  the lone red butte by the north corner raised to a tall flat top (h7) on sheer red walls over a talus
 *                   tier (h3), one ramp up (the drafted fortress keeps one way up);
 *   the flats       white salt with rectangular salt pans by the lake and by the necropolis (six beds each between mud
 *                   bunds, salt heaped along them), palms here and there; draft ground kept round the entries only
 *                   along the roads (entryBand).
 */
import type { Kit, Pt, RegionDef } from './kit.ts';
import { fbm } from './kit.ts';
import { composeOnDraft } from './draftCompose.ts';

const FORT: Pt = [34, 44];

const base = composeOnDraft('ammon', { staging: [330, 350], entryBand: 6 }, (k: Kit) => {
  // salt pans: shallow rectangles in the flats (sim tiles), where no road runs; each ringed by a dark mud bund and
  // white salt raked into heaps along its sides (visual only), so they read as worked pans, not ponds
  const pans: [number, number][] = [];
  for (const [x, y] of [[312, 64], [334, 64], [312, 80], [184, 448], [206, 448], [184, 466]]) {
    const c = k.at([(x + 9) / 2, (y + 5) / 2]);
    if (c >= 0 && k.roadDist[c] > 6 && !k.water[c] && k.height[c] <= 1) { k.waterRect(x, y, x + 18, y + 10, 1, 0); pans.push([x, y]); }
  }
  // each pan split into six beds by low mud bunds (dry, level with the flats: walkable) and ringed by one
  k.each((i, ux, uy) => {
    const sx = 2 * ux + 0.5, sy = 2 * uy + 0.5;
    for (const [x, y] of pans) {
      if (sx < x - 1 || sx >= x + 19 || sy < y - 1 || sy >= y + 11) continue;
      const inner = sx >= x && sx < x + 18 && sy >= y && sy < y + 10;
      const wall = !inner || Math.abs(sx - (x + 6)) < 0.6 || Math.abs(sx - (x + 12)) < 0.6 || Math.abs(sy - (y + 5)) < 0.6;
      if (wall) { k.water[i] = 0; k.height[i] = 1; k.terrain[i] = 'dirt'; }
    }
  });
  for (const [x, y] of pans) for (const [dx, dy] of [[3, -3.5], [9, -3.5], [15, -3.5], [21, 3], [21, 8], [3, 13], [11, 13], [17, 13], [-3, 2], [-3, 7]]) k.piece('mountains/snow-drift', [(x + dx) / 2, (y + dy) / 2], { r: 1.2 });
  // the temple of Ammon reads from afar: its pylon faces south (+y, toward the viewer), so the way up to it comes from
  // the south through two more pylon gates on its axis, statues either side (W-48 site tiles; the precinct's paving)
  const tp = k.sites[0];
  if (tp) {
    tp.force('ammon-gate-x', 279, 123);
    tp.force('ammon-gate-x', 279, 129);
    for (const y of [124, 128, 132]) { tp.force('@town-statue', 277, y); tp.force('@town-statue', 286, y); }
  }
  // the silver and salt knolls crusted white like the flats round them
  k.patchWhere('kyrene', 'salt', (x, y) => Math.hypot(x - 169.4, y - 56) < 14 || Math.hypot(x - 40.8, y - 160) < 14, ['sand']);
  // palms by the lake, the sea and the tracks
  for (const p of [[20, 140], [14, 176], [150, 20], [236, 40], [168, 104], [236, 140], [100, 236], [60, 120]] as Pt[]) k.piece('kyrene/date-palm-tall', p, { r: 6, n: 2, gap: 3 });
  for (const p of [[24, 92], [200, 20], [150, 236]] as Pt[]) k.piece('kyrene/doum-palm', p, { r: 6 });
  // the fort butte's red sandstone (its walls in the kyrene stone)
  k.patchWhere('kyrene', 'redrock', (x, y) => Math.hypot(x - FORT[0], (y - FORT[1]) * 1.15) < 22 && k.height[k.at([x, y])] >= 3, ['sand', 'grass', 'dirt']);
});

/** The fort butte raised after the draft's keep (the fortress spot keeps the drafted h4 top otherwise). */
function fortButte(k: Kit) {
  const s = k.seed();
  k.each((i, x, y) => {
    if (k.water[i] || k.terrain[i] === 'road') return;
    const d = Math.hypot(x - FORT[0], (y - FORT[1]) * 1.15);
    if (d > 26) return;
    if (k.height[i] === 4 && d < 16) k.height[i] = 7; // the drafted top
    else if (k.height[i] <= 2 && d < 19 + 2.5 * fbm(x, y, 7, s) && y < FORT[1] + 9) k.height[i] = 3; // the talus tier behind
  });
  // the one ramp, re-laid up the taller walls (built up from the flats)
  k.road([[FORT[0], FORT[1] + 34], [FORT[0], FORT[1] + 24], [FORT[0], FORT[1] + 9]], { w: 1.3, fill: true, grade: 2.2 });
}

const def: RegionDef = { ...base, build(k: Kit) { base.build(k); fortButte(k); } };
export default def;
