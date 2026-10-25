/**
 * The nine landmarks at true scale (W-48, docs/WAR.md "Landmarks"): each a real place laid out with the city kit
 * (kit.ts Site: wall rings, street grids, blocks of lots, single pieces), every building a pre-built sim building (W-47)
 * whose condition follows the lore (the Dead City's quarters mostly fallen in, the citadel's walls whole). Sizes are
 * in sim tiles (2 m): the Dead City 320 x 220 (640 x 440 m inside its necropolis), the Citadel 200 x 184, the Temple
 * City the whole mesa top. A builder shapes the ground (both kit runs) and queues the pieces; it returns the site,
 * its gates (unit points just outside, for the roads in), the lair points of a bandit host and its spots.
 * Population: a landmark's standing houses are capped (capHomes) so its recruit pool stays as docs/WAR.md has it.
 */
import { spline } from '../shapes.ts';
import { ZVIS } from '../../../src/war/regions/visual.ts';
import { inPoly, type District, type Kit, type Pt, type Sample, type Side4, type Site, type WallSet } from './kit.ts';

export interface Landmark { site: Site; gates: Pt[]; host: Pt[]; spots: Record<string, Pt> }
type Gate = { side: Side4; at: Pt };

const CIT: WallSet = { wall: 'citadel-curtain', tower: 'citadel-tower', gate: 'citadel-gatehouse' };
const ARCH: WallSet = { wall: 'arch-wall', tower: 'arch-tower', gate: 'arch-gate' };
const AMM: WallSet = { wall: 'ammon-wall', tower: 'ammon-tower', gate: 'ammon-gate' };
const CYC: WallSet = { wall: 'cyclops-wall', tower: 'cyclops-tower', gate: 'cyclops-gatehouse' };
const OBS: WallSet = { wall: 'obsidian-wall', tower: 'obsidian-tower', gate: 'obsidian-gate' };

/**
 * W-51: levels between a landmark's terraces (heights run 0..15). The Dead City's are real tiers of 4 (sight, missile
 * range and damage, a 4 m cliff), drawn as tall as the old 2-level tiers at 4x relief (Site.lift = 8 / tier; ramps a
 * level per run / tier tiles, so they keep their length and look). The citadel keeps 2: Drakon's raid is balanced on it
 * (tests/war/landmarkBalance.test.ts; at 3 or 4 a 4-squad raid no longer brings him down in 20 min).
 */
const CITADEL_TIER = 2, DEAD_CITY_TIER = 4;
const hash = (x: number, y: number, k: number) => {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(k, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
/** Unit point `d` tiles outside a gate. */
const out = (s: Site, g: Gate, d = 6): Pt => {
  const [x, y] = g.at;
  return g.side === 'N' ? s.u(x, y - d) : g.side === 'S' ? s.u(x, y + d) : g.side === 'W' ? s.u(x - d, y) : s.u(x + d, y);
};
/** `n` pieces (cycling ids) on free ground in site rect x0..x1, y0..y1, a `margin` of free tiles round each; returns how many stood. */
function scatter(s: Site, ids: string[], x0: number, y0: number, x1: number, y1: number, n: number, seed: number, o: { margin?: number; hp?: number; ruin?: number; h?: number } = {}) {
  const m = o.margin ?? 1;
  let done = 0;
  for (let t = 0; t < n * 60 && done < n; t++) {
    const id = ids[done % ids.length], [w, h] = s.fp(id);
    const x = x0 + Math.floor(hash(t, done, seed) * Math.max(1, x1 - x0 - w)), y = y0 + Math.floor(hash(done, t, seed + 1) * Math.max(1, y1 - y0 - h));
    if (!s.free(x - m, y - m, w + 2 * m, h + 2 * m) || !flat(s, x, y, w, h, o.h)) continue;
    if (s.put(id, x, y, { hp: o.hp ?? 0.6, ruined: hash(x, y, seed + 2) < (o.ruin ?? 0) })) done++;
  }
  return done;
}
/** A key piece at the nearest free, level ground to site tile (x, y) (spiralling out to r tiles); returns its NW tile. */
function putNear(s: Site, id: string, x: number, y: number, o: { hp?: number; ruined?: boolean } = {}, r = 12): Pt | null {
  const [w, h] = s.fp(id);
  for (let d = 0; d <= r; d++) for (let j = -d; j <= d; j++) for (let i = -d; i <= d; i++) {
    if (Math.max(Math.abs(i), Math.abs(j)) !== d) continue;
    if (flat(s, x + i, y + j, w, h) && s.put(id, x + i, y + j, o)) return [x + i, y + j];
  }
  return null;
}
/** Whether site tiles x..x+w-1, y..y+h-1 are dry and one level (`h` if given). */
function flat(s: Site, x: number, y: number, w: number, h: number, lv?: number) {
  const h0 = lv ?? s.hAt(x, y);
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (!s.dry(i, j) || s.hAt(i, j) !== h0) return false;
  return true;
}
/** A yard (kept clear) on site tiles x0..x1, y0..y1; its centre as a unit point. */
function yard(s: Site, x0: number, y0: number, x1: number, y1: number, t?: string): Pt {
  if (t) s.pave(x0, y0, x1, y1, t);
  s.keep(x0, y0, x1, y1);
  return s.u((x0 + x1) / 2, (y0 + y1) / 2);
}
/** At most `max` of the site's dwellings stand (the rest in ruins, the ones furthest from (cx, cy) first). */
function capHomes(s: Site, max: number, cx: number, cy: number) {
  const homes = s.pieces.filter((p) => !p.ruined && (s.typeOf(p.id) === 'house' || s.typeOf(p.id) === 'cottage'));
  homes.sort((a, b) => Math.hypot(a.x - s.x0 - cx, a.y - s.y0 - cy) - Math.hypot(b.x - s.x0 - cx, b.y - s.y0 - cy));
  for (const p of homes.slice(max)) p.ruined = true;
}
const inRect = (b: number[], r: number[], m = 0) => b[0] < r[2] + m && b[2] > r[0] - m && b[1] < r[3] + m && b[3] > r[1] - m;
/** Blocks of a grid filled by district (`pick` names it per block, null: leave it), skipping the reserved rects. */
function quarters(s: Site, blocks: number[][], reserved: number[][], pick: (b: number[]) => District | null, seed: number) {
  let n = 0;
  for (const b of blocks) {
    if (reserved.some((r) => inRect(b, r, 1))) continue;
    const d = pick(b);
    if (d) n += s.block(b[0], b[1], b[2], b[3], d, seed + b[0] * 7 + b[1]);
  }
  return n;
}
/** A bandit stronghold: a walled-in yard in a quarter (two towers, a storehouse, a workshop); its lair point. */
function stronghold(s: Site, set: WallSet, x: number, y: number, work: string): Pt {
  s.put(set.tower, x, y);
  s.put(set.tower, x + 17, y + 17);
  s.put('@town-storehouse', x + 13, y + 1, { hp: 0.6 });
  s.put(work, x + 1, y + 15, { hp: 0.6 });
  return yard(s, x + 4, y + 4, x + 16, y + 15);
}

// ======================================================================================= the organic city kit helpers

/** Outline `p` moved `d` tiles toward its centre (an inner ring). */
const inset = (p: Pt[], d: number): Pt[] => {
  const cx = p.reduce((a, q) => a + q[0], 0) / p.length, cy = p.reduce((a, q) => a + q[1], 0) / p.length;
  return p.map(([x, y]) => { const l = Math.hypot(cx - x, cy - y) || 1; return [x + ((cx - x) * d) / l, y + ((cy - y) * d) / l]; });
};
/** Whether site tile (x, y) is within the outline `p` shrunk by `m` tiles (distance to its edges). */
const within = (p: Pt[], x: number, y: number, m = 0) => {
  if (!inPoly(p, x, y)) return false;
  if (m <= 0) return true;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [ax, ay] = p[j], [bx, by] = p[i], dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    if (Math.hypot(ax + dx * t - x, ay + dy * t - y) < m) return false;
  }
  return true;
};
/**
 * Winding lanes (W-49: the grown street plan of the reference, shots/war/landmarks/proto/ammon/ammon_1.png): `n` lanes
 * `w` wide, each leaving a street at a right angle and wandering 14-36 tiles, kept inside `ok`; returns their ends.
 */
function lanes(s: Site, from: Sample[][], n: number, w: number, ok: (x: number, y: number) => boolean, seed: number): Pt[] {
  const ends: Pt[] = [];
  for (let m = 0, tries = 0; m < n && tries < n * 6; tries++) {
    const c = from[Math.floor(hash(tries, seed, 1) * from.length)], p = c[Math.floor(hash(tries, seed, 2) * c.length)];
    if (!p) continue;
    const side = hash(tries, seed, 3) < 0.5 ? 1 : -1, len = 14 + hash(tries, seed, 4) * 22;
    let a = Math.atan2(p.tx * side, -p.ty * side), x = p.x, y = p.y;
    const h0 = s.hAt(Math.floor(x), Math.floor(y));
    const pts: Pt[] = [[x, y]];
    for (let d = 0; d < len; d += 6) {
      a += (hash(tries, d, seed + 5) - 0.5) * 1.1;
      x += Math.cos(a) * 6; y += Math.sin(a) * 6;
      if ((d >= 12 && !ok(x, y)) || x < 0 || y < 0 || x >= s.w || y >= s.h || s.hAt(Math.floor(x), Math.floor(y)) !== h0) break;
      pts.push([x, y]);
    }
    if (pts.length < 4) continue;
    s.street(pts, w);
    ends.push(pts[pts.length - 1]);
    m++;
  }
  return ends;
}

// ======================================================================================= Drakon's Citadel (krios)

/**
 * The Wardens' northern citadel crowning a crag over the glacier (site 200 x 184; W-49 reference
 * shots/war/landmarks/proto/citadel/citadel_1.png): the crag rises two levels on cliffs out of the ice; the outer curtain
 * traces its edge with towers at every turn, the main gate and barbican on the south face at the head of the switchback
 * road that zigzags down the crag to the ruined village, small gates west and east on short ramps; the outer ward with
 * its halls, stables, smithies and cisterns round the yard (Drakon's P1) and the bone pit; the inner ward a tier (CITADEL_TIER levels) up
 * on the crag's summit behind its own wall, reached by one ramp from the yard through its gate, with the keep (Drakon's
 * roof), the treasury, the temple and the commander's halls. Drawn at twice-real relief (Site.lift).
 */
export function citadel(k: Kit, at: Pt, hb: number): Landmark {
  const T = CITADEL_TIER, ho = hb + T, hi = hb + 2 * T;
  const C: Pt[] = [[34, 22], [92, 8], [158, 12], [188, 38], [194, 96], [180, 128], [138, 140], [96, 138], [52, 130], [20, 98], [16, 52]];
  const I: Pt[] = [[84, 16], [150, 18], [176, 42], [174, 78], [140, 88], [100, 84], [80, 54]];
  const s = k.site('citadel', at, [200, 184], { claim: [70, 104], guardians: [{ boss: 'drakon', at: [70, 104], perches: [], pit: [158.5, 108.5] }] });
  // the ground: the glacier round the crag, the outer ward a tier up, the summit a tier more
  const cc = s.u(104, 76);
  k.paint('snow', [cc[0], cc[1] - 4, 64, 50, 0.2], { on: ['grass', 'dirt', 'forest'], rough: 6 });
  k.patch('mountains', 'snow', [cc[0], cc[1], 120, 100, 0.2], ['grass', 'dirt', 'forest']); // the glacier all round (visual: the sim keeps its ground)
  s.levelBy((x, y) => (inPoly(I, x + 0.5, y + 0.5) ? hi : inPoly(C, x + 0.5, y + 0.5) ? ho : within(C, x, y, -14) ? hb : undefined));
  const crag = new Set<number>();
  for (let y = 0; y < 184; y++) for (let x = 0; x < 200; x++) if (inPoly(C, x + 0.5, y + 0.5)) crag.add(y * 4096 + x);
  s.paintSet(crag, 'dirt');
  k.patch('mountains', 'gravel', [cc[0], cc[1], 56, 46, 0], ['dirt'], undefined, ho); // the wards' trodden gravel
  // W-51: the crag drawn ~14 m over the glacier and the summit ~6 m over the ward (visual only), sheer next to the 33 px/m walls
  s.lift = 2; s.base = hb; s.levels = [[hb, hb], [ho, hb + 28], [hi, Math.min(ZVIS, hb + 40)]];
  s.look = { ground: 'snow', pave: 'rock', inside: (x, y) => s.hAt(x, y) >= ho };
  s.liftOnly = (x, y) => inPoly(C, x + 0.5, y + 0.5) || s.hAt(x, y) >= ho || s.vz.has(y * 4096 + x); // snowed-in wards, trodden dark flags
  // the walls: the curtain along the crag's edge, the inner ward's wall along the summit's
  const O = s.wallTrace(CIT, inset(C, 3), { step: 22, every: 22, gates: [[66, 134], [18, 76], [192, 72]], seed: 11 });
  const IW = s.wallTrace(CIT, inset(I, 2), { step: 18, every: 22, gates: [[104, 84]], seed: 13 });
  const near = (g: Pt) => O.gates.reduce((a, b) => (Math.hypot(b.at[0] - g[0], b.at[1] - g[1]) < Math.hypot(a.at[0] - g[0], a.at[1] - g[1]) ? b : a));
  const gS = near([66, 134]), gW = near([18, 76]), gE = near([192, 72]), gI = IW.gates[0];
  const out = (g: { side: Side4; at: Pt }, d: number): Pt => { const [x, y] = g.at; return g.side === 'N' ? [x, y - d] : g.side === 'S' ? [x, y + d] : g.side === 'W' ? [x - d, y] : [x + d, y]; };
  // the barbican before the main gate, the switchback road down the crag face to the village
  const [bx, by] = out(gS, 3);
  s.levelBy((x, y) => (Math.abs(x + 0.5 - bx) <= 6 && y >= gS.at[1] && y <= by + 3 ? ho : undefined)); // the barbican's ground, level with the ward
  s.force('arch-barbican-x', Math.round(bx) - 3, Math.round(by) - 1);
  // the forecourt before the barbican (room to form up under the towers), the road on from its foot
  const fx0 = Math.round(bx) - 11, fy0 = Math.round(by) + 3;
  s.levelBy((x, y) => (x >= fx0 && x < fx0 + 22 && y >= fy0 && y < fy0 + 8 ? ho : undefined));
  s.plaza(bx, fy0 + 4, 11, 4.5);
  const z0: Pt = [bx + 10, fy0 + 6];
  const zig: Pt[] = [z0, [z0[0] + 26, z0[1] + 2], [z0[0] + 30, z0[1] + 8], [z0[0] - 10, z0[1] + 12], [z0[0] - 14, z0[1] + 18], [z0[0] + 14, z0[1] + 24], [z0[0] + 16, z0[1] + 32]];
  const fS = s.ramp(zig, 5, ho, hb, { run: 60 / T, flat: 2 });
  const fW = s.ramp([out(gW, 2), out(gW, 7), [out(gW, 10)[0], out(gW, 7)[1] + 14]], 4, ho, hb, { run: 12 / T, flat: 5 });
  const fE = s.ramp([out(gE, 2), out(gE, 7), [out(gE, 10)[0], out(gE, 7)[1] + 14]], 4, ho, hb, { run: 12 / T, flat: 5 });
  const fI = s.ramp([out(gI, 1), out(gI, 6), [out(gI, 8)[0] - 6, out(gI, 14)[1]]], 4, hi, ho, { run: 10 / T, flat: 4 });
  // the crag's skirt: broken granite ledges, snow drifted on them, round the wards but where the ramps come down
  s.skirtKinds = { a: 'drift', b: 'rock', cut: -0.15 };
  // (four ledges deep within the drafted width, so the face breaks into rock steps; the tiles it takes are as before: Drakon's raid is tuned on them)
  const sk = s.skirt(C, ho, 8, { steps: 4, seed: 19, open: [fS, fW, fE, ...zig], lo: 0.1, hi: 0.85 });
  // the summit: the keep, the treasury, the temple, a cistern, the commander's halls, stores
  if (!putNear(s, 'citadel-keep', 120, 30)) throw new Error('citadel: no ground for the keep');
  s.plaza(123, 44, 10, 5);
  s.put('arch-treasury', 106, 26); s.put('arch-chapel', 142, 30); s.put('arch-cistern', 132, 56);
  for (const [x, y] of [[94, 40], [94, 56], [150, 46]]) s.put('arch-barracks', x, y);
  for (const [x, y] of [[112, 62], [150, 60]]) s.put('@town-storehouse', x, y);
  // the outer ward: the yard (Drakon's P1) inside the main gate, the ward road between the gates, the way up
  // Drakon's post: the yard just inside the main gate (within his aggro of the barbican)
  const yd: Pt = [gS.at[0], gS.at[1] - 6];
  s.guardians[0].at = yd;
  s.plaza(yd[0], yd[1] - 4, 16, 10);
  s.plaza(70, 100, 10, 7);
  s.street([out(gW, -4), [40, 92], [56, 100]], 4);
  s.street([[86, 104], [130, 106], [168, 96], out(gE, -4)], 4);
  s.street([out(gS, -4), [68, 118]], 5);
  s.street([[82, 98], [96, 96], fI], 4);
  s.street([[40, 92], [30, 62], [52, 34], [84, 26]], 3);
  s.street([[130, 106], [154, 126]], 3);
  s.street([[56, 100], [60, 70], [76, 52]], 3);
  s.street([[123, 48], [110, 70], [118, 80]], 3); s.street([[123, 48], [150, 40], [164, 56], [150, 76]], 3);
  s.put('citadel-bone-pit', 157, 107);
  s.plaza(158, 109, 7, 5, 'dirt');
  const ward: District = { ids: [['arch-barracks', 3], ['arch-stables', 2], ['arch-forge', 1], ['arch-workshop', 2], ['@town-storehouse', 2], ['arch-cistern', 1], ['@town-cookhouse', 1]], ruin: 0.15, hp: [0.6, 0.6], empty: 0.08, alley: 0.3 };
  const outer = (x: number, y: number) => within(C, x, y, 8) && !inPoly(I, x, y) && !within(I, x, y, -3);
  const wardLanes = (x: number, y: number) => within(C, x, y, 9) && !within(I, x, y, -4) && Math.hypot(x - yd[0], y - yd[1]) > 18;
  lanes(s, [s.street([[40, 92], [30, 62], [52, 34], [84, 26]], 3), s.street([[130, 106], [154, 126]], 3)], 24, 2, wardLanes, 17);
  lanes(s, [s.street([[123, 48], [150, 40], [164, 56], [150, 76]], 3)], 10, 2, (x, y) => within(I, x, y, 7), 18);
  s.infill(outer, ward, { seed: 14, front: 1, back: 6 });
  const summit = (x: number, y: number) => within(I, x, y, 6);
  s.infill(summit, { ids: [['arch-barracks', 2], ['@town-storehouse', 2], ['arch-workshop', 1], ['arch-house-b', 2], ['arch-stables', 1]], ruin: 0.1, hp: [0.6, 0.6], empty: 0.1 }, { seed: 15, front: 1, back: 5 });
  // the ruined village where the road leaves the glacier, either side of it
  const vc = s.u(fS[0] - 30, 172);
  k.paint('dirt', [vc[0], vc[1], 26, 8, 0], { on: ['grass', 'snow'], rough: 3 });
  s.street([fS, [fS[0] - 30, 176], [fS[0] - 70, 182]], 3, 'dirt');
  s.street([[fS[0] - 24, 176], [fS[0] - 40, 160]], 2, 'dirt');
  const village: District = { ids: [['@town-cottage', 4], ['@town-house-a', 2], ['arch-house-a', 2], ['@town-house-b', 1]], ruin: 1, hp: [0.6, 0.6], empty: 0.3, alley: 0.4 };
  s.infill((x, y) => y > 148 && !within(C, x, y, -6), village, { seed: 21, front: 1, back: 2 });
  // dressing: drifts in the wards' lee, talus and drifts at the crag's foot, ice on the glacier round it
  const ward2 = (x: number, y: number) => s.hAt(x, y) >= ho && !s.streets.has(y * 4096 + x);
  s.dress(['mountains/snow-drift'], ward2, 70, 23, { gap: 4 });
  const foot = (x: number, y: number) => !sk.has(y * 4096 + x) && [[2, 0], [-2, 0], [0, 2], [0, -2]].some(([dx, dy]) => sk.has((y + dy) * 4096 + x + dx));
  s.dress(['mountains/talus-granite', 'mountains/snow-drift', 'mountains/talus-granite'], foot, 60, 24, { gap: 3 });
  s.dress(['mountains/ice-patch', 'mountains/snow-drift'], (x, y) => s.hAt(x, y) <= hb && !sk.has(y * 4096 + x) && !within(C, x, y, -16) && y < 150, 40, 25, { gap: 6 });
  // P2: Drakon takes the roofs of the towers either side of the main gate, then the keep's
  const towers = O.corners.slice().sort((a, b) => Math.hypot(a[0] - gS.at[0], a[1] - gS.at[1]) - Math.hypot(b[0] - gS.at[0], b[1] - gS.at[1]));
  s.guardians[0].perches = [[gS.at[0], gS.at[1]], ...towers.slice(0, 4).map(([x, y]): Pt => [x + 1.5, y + 1.5])];
  return {
    site: s, host: [],
    gates: [fS, fW, fE].map(([x, y]) => s.u(x, y)),
    spots: { citadel: s.u(yd[0], yd[1]), barbican: s.u(bx, by), village: s.u(fS[0] - 30, 176) },
  };
}

// ======================================================================================= the Dead City of Ammon

/**
 * The abandoned city on the great butte by the dead lake (site 320 x 220; W-49 reference
 * shots/war/landmarks/proto/ammon/ammon_1.png): the butte rises three levels on cliffs out of the salt flats, its
 * battered mudbrick wall tracing the cliff edge with square towers, the main gate on the south face and the west
 * gate, each at the head of a ramp cut along the cliff, and the postern stair to the lake in the south-east. Inside,
 * a grown plan: paved avenues from the gates meet at the agora (stoas west and east, stalls), a sacred way runs east
 * to the walled precinct of Ammon (pylon temple, a way of statues), a street climbs north to the acropolis two levels
 * up on its own wall (the palace, treasuries, the guard); a ring street inside the wall, streets from the agora out to
 * it, winding lanes between, small plazas with wells and cisterns; dense quarters of mudbrick houses, courtyard
 * houses and tenements packed along every street (most fallen in), craftsmen by the west gate, four bandit
 * strongholds; the necropolis of mastabas along the road below the south gate.
 */
export function deadCity(k: Kit, at: Pt, hb: number): Landmark {
  const T = DEAD_CITY_TIER, hc = hb + T, hu = hb + 2 * T, ha = hb + 3 * T; // the lower city, the upper city, the acropolis (each step a cliff: impassable but by ramps)
  const P: Pt[] = [[96, 14], [170, 6], [236, 8], [284, 20], [308, 52], [312, 104], [304, 150], [282, 184], [236, 200], [170, 206], [118, 200], [80, 180], [60, 140], [58, 90], [70, 44]];
  const AC: Pt[] = [[214, 22], [258, 14], [290, 28], [298, 58], [278, 76], [234, 80], [212, 60]];
  const AG = [158, 100, 214, 134], TP = [238, 92, 298, 146];
  const U: Pt[] = [[146, 12], [236, 8], [284, 20], [308, 52], [312, 104], [306, 150], [262, 152], [228, 144], [222, 108], [206, 92], [160, 70], [140, 40]];
  const s = k.site('ammon', at, [320, 220], { claim: [186, 117], guardians: [{ boss: 'bandit_king', at: [252, 48], postern: [300, 176] }] });
  // the ground: the salt flats (the whole region: sand, hardpan round the butte, white salt beyond), the lower and
  // upper city a tier and two up on its butte, the acropolis a tier more; the dead lake south-east
  k.maskPaint(() => 'sand');
  const c0 = s.u(160, 110);
  k.patch('kyrene', 'hardpan', [c0[0], c0[1], 96, 72, 0], ['sand'], hb);
  k.patch('kyrene', 'salt', [128, 128, 200, 200, 0], ['sand'], hb);
  s.levelBy((x, y) => (inPoly(AC, x + 0.5, y + 0.5) ? ha : inPoly(U, x + 0.5, y + 0.5) && inPoly(P, x + 0.5, y + 0.5) ? hu : inPoly(P, x + 0.5, y + 0.5) ? hc : undefined));
  // the butte's sandstone cliffs ~7 m over the flats, the terraces' faces 3-4 m (visual only, W-51)
  s.lift = 2; s.base = hb; s.levels = [[hb, hb], [hc, hb + 14], [hu, hb + 21], [ha, Math.min(ZVIS, hb + 29)]];
  s.liftOnly = (x, y) => inPoly(P, x + 0.5, y + 0.5) || s.vz.has(y * 4096 + x);
  // the city's own ground: pale sand, flagged avenues (not the flats' dunes)
  s.look = { ground: 'sand', pave: 'paving', rough: 'rubble', inside: (x, y) => inPoly(P, x + 0.5, y + 0.5) };
  for (let y = 186; y < 220; y++) { const x0 = 300 - Math.round(Math.sqrt(Math.max(0, 1 - ((y - 222) / 36) ** 2)) * 46); if (x0 < 320) s.flood(x0, y, 320, y + 1, y > 200 ? 2 : 1, hb - 1); }
  // the walls: the city wall along the cliff edge, the acropolis wall
  const W = s.wallTrace(AMM, inset(P, 3), { step: 26, every: 26, gates: [[132, 200], [60, 100], [298, 166]], breach: 0.05, seed: 31 });
  const AW = s.wallTrace(ARCH, inset(AC, 2), { step: 18, every: 22, gates: [[244, 80]], seed: 32 });
  const gate = (g: Pt) => W.gates.reduce((a, b) => (Math.hypot(b.at[0] - g[0], b.at[1] - g[1]) < Math.hypot(a.at[0] - g[0], a.at[1] - g[1]) ? b : a));
  const gS = gate([132, 200]), gW = gate([60, 100]), gE = gate([298, 166]), gA = AW.gates[0];
  // the ramps down the cliff, cut along its face (S: west along the south face; W: north along the west face; the postern stair to the lake shore)
  const out = (g: { side: Side4; at: Pt }, d: number): Pt => { const [x, y] = g.at; return g.side === 'N' ? [x, y - d] : g.side === 'S' ? [x, y + d] : g.side === 'W' ? [x - d, y] : [x + d, y]; };
  const fS = s.ramp([out(gS, 2), out(gS, 7), [out(gS, 9)[0] - 10, out(gS, 11)[1]], [out(gS, 9)[0] - 26, out(gS, 13)[1]]], 4, hc, hb, { run: 12 / T, flat: 6 });
  const fW = s.ramp([out(gW, 2), out(gW, 7), [out(gW, 10)[0], out(gW, 7)[1] - 10], [out(gW, 12)[0], out(gW, 7)[1] - 26]], 4, hc, hb, { run: 12 / T, flat: 6 });
  const fE = s.ramp([out(gE, 2), out(gE, 6), [out(gE, 8)[0] + 2, out(gE, 8)[1] + 10]], 3, hc, hb, { run: 8 / T, flat: 4 });
  const fA = s.ramp([out(gA, 1), out(gA, 6), [out(gA, 8)[0] - 4, out(gA, 12)[1]]], 4, ha, hu, { run: 10 / T, flat: 4 });
  /** A street on one tier only: the parts of the curve whose ground (and 3 tiles round) is level h. */
  const tierOk = (x: number, y: number, h: number) => [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]].every(([dx, dy]) => s.hAt(Math.floor(x + dx), Math.floor(y + dy)) === h);
  const streetOn = (pts: Pt[], w: number, h: number): Sample[][] => {
    const out: Sample[][] = [];
    let run: Pt[] = [];
    const flush = () => { if (run.length >= 5) out.push(s.street(run.filter((_, n) => n % 3 === 0 || n === run.length - 1), w)); run = []; };
    for (const p of spline(pts, 1)) { if (tierOk(p.x, p.y, h)) run.push([p.x, p.y]); else flush(); }
    flush();
    return out;
  };
  // the acropolis: the palace on its terrace, treasuries (the hoard), the guard's halls, stores, a cistern, a chapel
  if (!putNear(s, 'ammon-palace', 246, 34)) throw new Error('ammon: no ground for the palace');
  s.plaza(249, 52, 9, 6);
  s.put('arch-treasury', 232, 30); s.put('arch-treasury', 264, 28);
  for (const [x, y] of [[222, 40], [276, 40]]) s.put('arch-barracks', x, y);
  s.put('arch-cistern', 236, 60); s.put('arch-chapel', 268, 58);
  for (const [x, y] of [[226, 50], [280, 50]]) s.put('@town-storehouse', x, y);
  // the agora: paved, stoas down its west and east sides, stalls between, statues, a well; the claim on its heart
  s.pave(AG[0], AG[1], AG[2], AG[3], 'paving');
  s.keep(AG[0], AG[1], AG[2], AG[3]);
  for (let n = 0; n < 5; n++) { freePut(s, '@town-stoa', AG[0] + 1, AG[1] + 2 + n * 6); freePut(s, '@town-stoa', AG[2] - 3, AG[1] + 2 + n * 6); }
  for (let n = 0; n < 4; n++) for (const [y, m] of [[AG[1] + 2, 0], [AG[3] - 4, 1]] as const) freePut(s, `@town-stall-${'abc'[(n + m) % 3]}`, AG[0] + 8 + n * 11, y);
  freePut(s, '@town-statue', 172, 112); freePut(s, '@town-statue', 200, 112); freePut(s, '@town-well', 186, 124);
  // the precinct of Ammon: its wall (gate west, toward the agora), the pylon temple, the way of statues, chapels, the priests' houses
  const PG = s.ring(AMM, TP[0], TP[1], TP[2], TP[3], { gates: [['W', 0.5]], every: 30, seed: 33 });
  s.pave(TP[0] + 3, TP[1] + 3, TP[2] - 3, TP[3] - 3, 'paving');
  s.keep(TP[0] + 3, TP[1] + 3, TP[2] - 3, TP[3] - 3);
  freePut(s, 'ammon-temple', 280, 116);
  for (let x = 246; x <= 274; x += 4) { freePut(s, '@town-statue', x, 114); freePut(s, '@town-statue', x, 124); }
  freePut(s, 'arch-chapel', 246, 98); freePut(s, 'arch-chapel', 262, 98, { ruined: true }); freePut(s, 'arch-chapel', 254, 134);
  freePut(s, 'ammon-house-a', 242, 132, { hp: 0.5 }); freePut(s, 'ammon-house-b', 284, 98, { ruined: true }); freePut(s, 'arch-cistern', 284, 134);
  // four strongholds of the host in the quarters (before the streets: the lanes go round them)
  const SH: [number, number][] = [[86, 120], [104, 52], [150, 160], [244, 160]];
  const host = SH.map(([x, y]) => stronghold(s, AMM, x, y, 'ammon-workshop'));
  // the avenues from the gates to the agora, the sacred way, the acropolis street, the postern street
  const sacred = s.ramp([[PG[0].at[0] - 4, PG[0].at[1]], [AG[2] + 6, 119], [AG[2] - 1, 119]], 5, hu, hc, { run: 10 / T, flat: 6 });
  const climb = s.ramp([[200, 76], [196, 88], [190, AG[1] + 1]], 4, hu, hc, { run: 10 / T, flat: 3 });
  s.force('ammon-gate-x', 197, 70, { hp: 0.6 }); // the gate on the climb to the upper city
  const av = [
    s.street([out(gW, -4), [92, 106], [124, 112], [AG[0], 117]], 4),
    s.street([out(gS, -4), [136, 176], [152, 150], [176, AG[3]]], 4),
    s.street([[AG[2] - 6, AG[3]], [228, 156], [262, 172], out(gE, -4)], 3),
    s.street([[200, 66], [208, 58], [222, 72], fA], 4),
    ...streetOn([[200, 66], [176, 48], [168, 24]], 3, hu), ...streetOn([[222, 72], [226, 100], [232, 132]], 3, hu),
  ];
  void sacred; void climb;
  // the ring street inside the wall, streets from the agora and the avenues out to it
  const R = inset(P, 15);
  const ring = streetOn([...R, R[0], R[1]], 2, hc);
  const radial = ([[[AG[0] + 10, AG[1]], [150, 70], [140, 34]], [[AG[0], AG[3] - 6], [120, 150], [96, 170]], [[200, AG[3]], [208, 168], [212, 192]],
    [[124, 112], [110, 84], [86, 66]], [[152, 150], [118, 178]], [[170, 100], [150, 74], [128, 40]]] as Pt[][]).flatMap((p) => streetOn(p, 2, hc));
  // winding lanes, small plazas with wells and cisterns where some of them end
  const city = (x: number, y: number) => within(P, x, y, 9) && !inPoly(AC, x, y) && !(x > TP[0] - 2 && x < TP[2] + 2 && y > TP[1] - 2 && y < TP[3] + 2);
  const ends = lanes(s, [...av, ...ring, ...radial], 40, 1.6, (x, y) => city(x, y) && (tierOk(x, y, hc) || tierOk(x, y, hu)), 35);
  ends.filter((_, n) => n % 4 === 0).slice(0, 9).forEach(([x, y], n) => {
    s.plaza(x, y, 4.5, 3.5);
    s.force(n % 2 ? 'arch-cistern' : '@town-well', Math.round(x) - (n % 2 ? 1 : 0), Math.round(y) - (n % 2 ? 1 : 0), { hp: 0.5 });
  });
  // the quarters: tenements along the avenues, the rich under the acropolis, craftsmen by the west gate, houses elsewhere
  const avTiles = new Set<number>();
  for (const c of av) for (const p of c) for (let d = -7; d <= 7; d++) for (let e = -7; e <= 7; e++) avTiles.add(Math.floor(p.y + d) * 4096 + Math.floor(p.x + e));
  // W-51: the dense mudbrick blocks (2x2 to 4x4 packs of cube houses) fill the quarters back to back, the courtyard houses among them
  // (blocks are storerooms, not homes: most stand, battered; the homes among them are capped below)
  const houses: District = { ids: [['ammon-block-a', 3], ['ammon-block-b', 4], ['ammon-block-c', 3], ['ammon-block-d', 3], ['ammon-house-a', 1], ['ammon-house-c', 1]], ruin: 0.3, hp: [0.25, 0.55], empty: 0.06, alley: 0.06 };
  const tenements: District = { ids: [['ammon-tenement', 2], ['ammon-block-c', 3], ['ammon-block-d', 3], ['ammon-block-b', 2], ['ammon-workshop', 1]], ruin: 0.3, hp: [0.25, 0.55], empty: 0.05, alley: 0.05 };
  const rich: District = { ids: [['ammon-house-c', 3], ['ammon-block-d', 2], ['ammon-block-c', 2], ['arch-house-c', 1], ['ammon-house-b', 1]], ruin: 0.7, hp: [0.3, 0.6], empty: 0.08 };
  const crafts: District = { ids: [['ammon-workshop', 4], ['arch-workshop', 2], ['@town-storehouse', 1], ['arch-forge', 1], ['ammon-house-a', 2]], ruin: 0.5, hp: [0.3, 0.6], empty: 0.1 };
  const garden = 'arch-garden';
  s.infill((x, y) => city(x, y) && avTiles.has(y * 4096 + x), tenements, { seed: 41, front: 1 });
  s.infill((x, y) => city(x, y) && s.hAt(x, y) === hu, rich, { seed: 42, front: 1, back: 6 });
  s.infill((x, y) => city(x, y) && x < 124 && Math.abs(y - 108) < 34, crafts, { seed: 43, front: 1, back: 3 });
  s.infill(city, houses, { seed: 44, front: 1, back: 10, garden });
  s.infill(city, { ...houses, ruin: 0.4, ids: [['ammon-block-a', 3], ['ammon-block-b', 2]] }, { seed: 45, front: 1, back: 12 }); // the gaps, small packs
  // the butte's skirt: red sandstone talus and fallen blocks round its foot, but where the ramps come down
  s.skirtKinds = { a: 'redrock', b: 'redrock', cut: 0 };
  const sk = s.skirt(P, hc, 6, { steps: 2, seed: 37, open: [fS, fW, fE], lo: 0.2, hi: 0.45 });
  const foot = (x: number, y: number) => !sk.has(y * 4096 + x) && !inPoly(P, x + 0.5, y + 0.5) && [[2, 0], [-2, 0], [0, 2], [0, -2]].some(([dx, dy]) => sk.has((y + dy) * 4096 + x + dx));
  s.dress(['kyrene/talus-red', 'kyrene/boulder-red', 'kyrene/rocks-red'], foot, 90, 52, { gap: 3 });
  // the life of the dead city: palms in the yards and plazas, stalls and amphorae on the agora, rubble and fallen walls in the quarters
  const open = (x: number, y: number) => city(x, y) && ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => s.taken(x + dx, y + dy));
  s.dress(['kyrene/date-palm-tall', 'kyrene/date-palm-mid', 'kyrene/date-palm-fruit', 'kyrene/date-palm-young', 'kyrene/palm-pot'], open, 70, 53, { gap: 6 });
  const quarter = (x: number, y: number) => city(x, y) && !s.streets.has(y * 4096 + x);
  s.dress(['kyrene/rubble-heap-mud', 'kyrene/debris-mud', 'kyrene/wall-fallen-mud', 'kyrene/ruin-sanded', 'kyrene/debris-mud'], quarter, 160, 54, { gap: 3 });
  const agora = (x: number, y: number) => x >= AG[0] + 4 && x < AG[2] - 4 && y >= AG[1] + 4 && y < AG[3] - 4 && !(Math.abs(x - 186) < 8 && Math.abs(y - 117) < 8);
  s.dress(['kyrene/stall-awning', 'kyrene/amphora-stack', 'kyrene/handcart', 'kyrene/stall-awning'], agora, 22, 55, { gap: 4, streets: true });
  // the necropolis: mastabas and grave plots along the road below the south gate, out over the flats
  const flats = (x: number, y: number) => !inPoly(P, x, y) && !within(P, x, y, -6) && y > 150 && x < 150 && s.dry(x, y);
  const nec = [s.street([fS, [fS[0] - 18, fS[1] + 2], [8, 212]], 3, 'dirt'), s.street([[fS[0] - 14, fS[1] + 1], [30, 176], [10, 150]], 2, 'dirt')];
  void nec;
  s.infill(flats, { ids: [['ammon-tomb', 4], ['arch-tomb-a', 3], ['arch-tomb-b', 2]], ruin: 0.25, hp: [0.3, 0.6], empty: 0.45, alley: 0.5 }, { seed: 51, front: 1, back: 6 });
  capHomes(s, 12, 249, 45);
  return {
    site: s, host,
    gates: [fS, fW].map(([x, y]) => s.u(x, y)),
    spots: { agora: s.u(186, 117), palace: s.u(249, 52), necropolis: s.u(fS[0] - 20, fS[1] + 4), postern: s.u(fE[0], fE[1]) },
  };
}
/** A piece on reserved ground of its own (the agora's paving, a precinct): only other pieces stop it. */
const freePut = (s: Site, id: string, x: number, y: number, o: { hp?: number; ruined?: boolean } = {}) => s.force(id, x, y, o);

// ======================================================================================= the Temple City of the Navel (omphalos)

/**
 * The sacred city on the mesa top (site 340 x 330, the mesa at `hm`): the four ramp gatehouses at the ramp heads, each
 * a small gate fort; the processional way from the south ramp through the Great Fair agora (stoas, ten stalls) to the
 * peribolos of the great temple (the omphalos before it, treasuries along the sacred way inside, chapels, statues);
 * the labyrinth east of the precinct round the undercroft, the titan's arena south-east, the theatre on the slope north
 * of the precinct; pilgrims' quarters south of the agora, mostly fallen in; cisterns on the crater lake's shore.
 */
export function templeCity(k: Kit, at: Pt, hm: number): Landmark {
  const s = k.site('navel', at, [340, 330], {
    claim: [200, 200],
    guardians: [{ boss: 'titan', at: [295, 184], perches: [[295, 175]] }, { boss: 'minotaur', at: [308.5, 100.5] }],
  });
  const on = (id: string, x: number, y: number, o: { hp?: number; ruined?: boolean } = {}) => { const [w, h] = s.fp(id); return flat(s, x, y, w, h, hm) && s.put(id, x, y, o); };
  // the ramp gate forts: the Lion Gate between two towers, a wall run either side
  const ramp = (x: number, y: number, axis: 'x' | 'y') => {
    if (axis === 'x') { s.force('navel-ramp-gate-x', x, y); on('arch-tower', x - 3, y - 1); on('arch-tower', x + 5, y - 1); on('arch-wall-x', x - 7, y - 1); on('arch-wall-x', x + 8, y - 1); }
    else { s.force('navel-ramp-gate-y', x, y); on('arch-tower', x - 1, y - 3); on('arch-tower', x - 1, y + 5); on('arch-wall-y', x - 1, y - 7); on('arch-wall-y', x - 1, y + 8); }
  };
  // the processional ways: south ramp - agora - precinct south gate; the east, west and north ramps in
  const ways: [number, number, number, number][] = [[197, 220, 203, 330], [197, 150, 203, 184], [200, 160, 250, 166], [0, 163, 203, 169], [200, 165, 340, 171], [165, 0, 171, 166]];
  const wayC: Sample[][] = [];
  for (const [a, b, c, d] of ways) {
    s.level(a, b, c, d, hm, true, false);
    const vert = d - b > c - a, w = vert ? c - a : d - b;
    wayC.push(s.street(vert ? [[(a + c) / 2, b], [(a + c) / 2, d]] : [[a, (b + d) / 2], [c, (b + d) / 2]], w + 0.5));
  }
  // the sanctuary terrace two levels over the city (its retaining wall a cliff), ramps up to its west and south gates
  s.levelBy((x, y) => (x >= 206 && x < 290 && y >= 66 && y < 150 ? hm + 2 : undefined));
  // W-51: the mesa's limestone cliffs drawn ~12 m over the plain (the whole rim, past the site's bounds), the sanctuary
  // terrace ~4 m over the city (visual only); the ramps up keep their grade, drawn steep
  s.lift = 2; s.base = hm - 4; s.liftPad = 120;
  s.levels = [[hm - 1, hm - 1], [hm, hm + 21], [hm + 2, Math.min(ZVIS, hm + 29)]];
  s.roadLevels = [[hm - 3, hm - 3], [hm - 2, hm + 5], [hm - 1, hm + 13], [hm, hm + 21], [hm + 2, Math.min(ZVIS, hm + 29)]];
  s.look = { ground: 'dry', pave: 'paving', rough: 'ruin', inside: (x, y) => s.hAt(x, y) >= hm };
  ramp(166, 6, 'x'); ramp(198, 316, 'x'); ramp(6, 164, 'y'); ramp(326, 166, 'y');
  for (let y = 230; y < 310; y += 14) { on('@town-statue', 195, y); on('@town-statue', 204, y); }
  // the peribolos of the great temple (gates west and south), the temple and the omphalos, treasuries, chapels
  const P = s.ring(ARCH, 206, 66, 290, 150, { gates: [['W', 0.5], ['S', 0.48]], every: 28, breach: 0.15, seed: 61 });
  for (const g of P) {
    const [x, y] = g.at;
    if (g.side === 'W') s.ramp([[x - 2, y], [x - 6, y], [x - 16, y]], 5, hm + 2, hm, { run: 4, flat: 2 });
    else s.ramp([[x, y + 2], [x, y + 6], [x, y + 15]], 5, hm + 2, hm, { run: 4, flat: 2 });
  }
  s.pave(209, 69, 287, 147, 'paving');
  s.put('navel-temple', 240, 82);
  s.put('navel-omphalos', 244, 96);
  for (let n = 0; n < 4; n++) { s.put('arch-treasury', 226, 100 + n * 10); s.put('arch-treasury', 262, 100 + n * 10, n === 3 ? { ruined: true } : {}); }
  s.put('arch-chapel', 214, 74); s.put('arch-chapel', 272, 74); s.put('arch-cistern', 274, 132);
  for (const [x, y] of [[236, 98], [252, 98], [236, 112], [252, 112]]) s.put('@town-statue', x, y);
  yard(s, 238, 118, 256, 134);
  // the theatre on the slope north of the precinct, the arena south-east, the labyrinth east
  on('arch-theatre', 228, 46);
  s.put('navel-arena', 290, 170);
  labyrinth(s, 298, 90, 10, 71);
  // the Great Fair agora: four stoas, ten stalls, the claim on its open heart
  const A = [170, 182, 232, 220];
  s.pave(A[0], A[1], A[2], A[3], 'paving');
  yard(s, 194, 194, 208, 206);
  for (let n = 0; n < 5; n++) { freePut(s, '@town-stoa', 172, 184 + n * 6); freePut(s, '@town-stoa', 228, 184 + n * 6); }
  for (let n = 0; n < 5; n++) { freePut(s, `@town-stall-${'abc'[n % 3]}`, 178 + n * 9 + (n >= 2 ? 4 : 0), 183); freePut(s, `@town-stall-${'abc'[(n + 1) % 3]}`, 178 + n * 9 + (n >= 2 ? 4 : 0), 217); }
  // the pilgrims' quarters south of the agora either side of the way
  const pil: District = { ids: [['arch-house-a', 3], ['arch-house-b', 2], ['arch-house-c', 1], ['arch-tenement', 2], ['@town-cottage', 1], ['arch-workshop', 1], ['arch-block-b', 2], ['arch-block-c', 1]], ruin: 0.8, hp: [0.3, 0.6], empty: 0.1 };
  // W-49: the quarters as grown, not gridded: lanes winding off the sacred ways, lots packed along them
  const inR = (r: number[]) => (x: number, y: number) => x >= r[0] && x < r[2] && y >= r[1] && y < r[3];
  const pilR = [inR([140, 226, 194, 300]), inR([208, 226, 280, 300])];
  const reserved = [[198, 58, 298, 158], [222, 38, 248, 60], [284, 162, 308, 188], [292, 84, 324, 116], [166, 178, 236, 224]].map(inR);
  const rim = (x: number, y: number) => [[8, 0], [-8, 0], [0, 8], [0, -8]].every(([dx, dy]) => s.hAt(x + dx, y + dy) === hm && s.dry(x + dx, y + dy));
  const town = (x: number, y: number) => s.hAt(x, y) === hm && s.dry(x, y) && rim(x, y) && !reserved.some((f) => f(x, y));
  const ends = lanes(s, wayC, 140, 2, town, 69);
  ends.filter((_, n) => n % 5 === 0).slice(0, 10).forEach(([x, y], n) => { s.plaza(x, y, 4, 3); s.force(n % 2 ? 'arch-cistern' : '@town-well', Math.round(x) - (n % 2 ? 1 : 0), Math.round(y) - (n % 2 ? 1 : 0), { hp: 0.5 }); });
  s.infill((x, y) => pilR.some((f) => f(x, y)) && town(x, y), pil, { seed: 63, front: 1, back: 6, garden: 'arch-garden' });
  // W-51: the rest of the mesa packed with the fallen Greek blocks (storerooms) and house shells, as the reference
  const outer: District = { ...pil, ruin: 0.75, empty: 0.12, ids: [...pil.ids, ['arch-workshop', 2], ['@town-storehouse', 1], ['arch-block-a', 3], ['arch-block-b', 3], ['arch-block-c', 2], ['arch-block-d', 2]] };
  s.infill((x, y) => !pilR.some((f) => f(x, y)) && town(x, y), outer, { seed: 67, front: 1, back: 12, garden: 'arch-garden' });
  scatter(s, ['arch-cistern'], 150, 70, 170, 150, 3, 65, { h: hm });
  capHomes(s, 10, 200, 200);
  // dressing: cypresses along the ways and the precinct, fallen stones and column drums in the quarters, talus under the rim
  const top = (x: number, y: number) => s.hAt(x, y) === hm && ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => s.taken(x + dx, y + dy));
  s.dress(['elaia/cypress-tall', 'elaia/cypress-flame', 'elaia/cypress-tall'], (x, y) => top(x, y) && !s.streets.has(y * 4096 + x), 120, 71, { gap: 5 });
  s.dress(['elaia/debris-stone', 'elaia/wall-fallen-stone', 'elaia/debris-stone', 'elaia/talus-lime'], (x, y) => top(x, y) && s.roughAt(x, y), 220, 72, { gap: 3 });
  const rimFoot = (x: number, y: number) => s.hAt(x, y) < hm - 1 && [[3, 0], [-3, 0], [0, 3], [0, -3]].some(([dx, dy]) => s.hAt(x + dx, y + dy) >= hm);
  s.dress(['elaia/talus-lime', 'elaia/debris-stone'], rimFoot, 120, 73, { gap: 3 });
  return { site: s, host: [], gates: [], spots: { templeSquare: s.u(200, 200), market: s.u(200, 200), labyrinth: s.u(308, 100), arena: s.u(295, 175), precinct: s.u(248, 108) } };
}
/** A walled maze (labyrinth wall tiles) of `n` x `n` cells from site tile (x, y), entered from the west; the minotaur's den in the middle. */
function labyrinth(s: Site, x: number, y: number, n: number, seed: number) {
  const N = 2 * n + 1, open = new Uint8Array(N * N);
  const st: [number, number][] = [[0, 0]], seen = new Uint8Array(n * n);
  seen[0] = 1;
  open[N + 1] = 1;
  let t = 0;
  while (st.length) {
    const [cx, cy] = st[st.length - 1];
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [cx + dx, cy + dy, dx, dy]).filter(([a, b]) => a >= 0 && b >= 0 && a < n && b < n && !seen[b * n + a]);
    if (!nb.length) { st.pop(); continue; }
    const [a, b, dx, dy] = nb[Math.floor(hash(cx * 31 + cy, t++, seed) * nb.length)];
    seen[b * n + a] = 1;
    open[(2 * cy + 1 + dy) * N + 2 * cx + 1 + dx] = 1;
    open[(2 * b + 1) * N + 2 * a + 1] = 1;
    st.push([a, b]);
  }
  const m = n - (n % 2 ? 0 : 1);
  for (let j = m - 1; j <= m + 1; j++) for (let i = m - 1; i <= m + 1; i++) open[j * N + i] = 1; // the den
  open[N * 1 + 0] = 1; // the way in, west
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (!open[j * N + i]) s.put('navel-labyrinth', x + i, y + j);
}

// ======================================================================================= the Rim Watchtower (siren)

/**
 * The beacon of the rim on its sea stack (site 150 x 130, the sea to the west): the stack top walled round (towers, a
 * gate east) with the beacon, the watch's barracks, a cistern, a chapel and the keeper's house; the walled stair down
 * to the harbour town on the shore below (fishers' houses and stores, half fallen in), the cliff stoas, the quay with
 * its jetties and warehouses; the sea cave under the stack (nereid pearls). Scylla in the water by the cave.
 */
export function rimWatch(k: Kit, at: Pt, hb: number): Landmark {
  // the coast: the first dry tile from the west on each row, found on the ground as drafted
  const probe = k.site('rim', at, [150, 130], { guardians: [] });
  k.sites.pop();
  const coast = (y: number) => { for (let x = 0; x < 150; x++) if (probe.dry(x, y)) return x; return 150; };
  const cx = Math.min(70, Math.max(6, coast(28))), sx = cx + 2;
  const s = k.site('rim', at, [150, 130], {
    claim: [sx + 58, 80],
    guardians: [{ boss: 'scylla', at: [Math.max(0, coast(56) - 3), 56], heads: 'shore', flats: [sx + 40, 70] }],
  });
  s.level(sx, 8, sx + 40, 48, hb + 3, false, false);
  s.level(sx + 40, 20, sx + 52, 34, hb + 2);
  s.level(sx + 40, 48, 150, 130, hb);
  // W-51: the sea stack drawn ~12 m over the flats, its stair landing ~6 m (visual only), a skirt of fallen crag round it
  s.base = hb; s.lift = 2; s.levels = [[hb, hb], [hb + 2, hb + 12], [hb + 3, Math.min(ZVIS, hb + 24)]];
  s.liftOnly = (x, y) => x >= sx - 2 && x < sx + 54 && y >= 6 && y < 50;
  const stack: Pt[] = [[sx, 8], [sx + 40, 8], [sx + 40, 20], [sx + 52, 20], [sx + 52, 34], [sx + 40, 34], [sx + 40, 48], [sx, 48]];
  s.ring(ARCH, sx, 8, sx + 40, 48, { gates: [['E', 0.5]], every: 30, seed: 81 });
  s.put('rim-beacon', sx + 18, 20);
  s.put('arch-barracks', sx + 4, 12); s.put('arch-barracks', sx + 4, 36); s.put('arch-cistern', sx + 30, 12);
  s.put('arch-chapel', sx + 30, 36); s.put('rim-keeper-house', sx + 6, 26); s.put('@town-storehouse', sx + 28, 24);
  s.put('rim-stair-x-', sx + 41, 27); s.put('rim-stair-x-', sx + 44, 27);
  freePut(s, '@town-stoa', sx + 14, 50); freePut(s, '@town-stoa', sx + 22, 50);
  // the harbour town below the stack
  const town: District = { ids: [['@town-cottage', 3], ['arch-house-a', 3], ['rim-keeper-house', 2], ['@town-storehouse', 1], ['arch-workshop', 1]], ruin: 0.55, hp: [0.4, 0.6], empty: 0.3 };
  const tb = s.grid(sx + 48, 56, 148, 128, { bw: 14, bh: 10, avX: [sx + 74], avY: [80] });
  quarters(s, tb, [[sx + 52, 74, sx + 66, 88]], () => town, 83);
  yard(s, sx + 52, 74, sx + 66, 88);
  // the quay: jetties out over the water, warehouses behind
  for (let y = 60; y < 124; y += 14) { const c = coast(y); if (c > 1 && c < 140) { freePut(s, '@jetty', c - 1, y); s.put('@town-warehouse', c + 2, y, { hp: 0.6 }); } }
  s.node('landmark/sea-cave', Math.max(1, coast(52) - 1), 52);
  capHomes(s, 8, sx + 60, 80);
  s.skirtKinds = { a: 'rock', b: 'rock', cut: 0 };
  const sk = s.skirt(stack, hb + 2, 6, { steps: 2, seed: 83, foot: hb, lo: 0.3, hi: 0.6, open: [[sx + 46, 40], [sx + 50, 52], [sx + 60, 30]], openR: 9 });
  s.dress(['elaia/debris-stone', 'elaia/wall-fallen-stone', 'elaia/talus-lime'], (x, y) => !sk.has(y * 4096 + x) && s.hAt(x, y) <= hb && [[2, 0], [0, 2], [-2, 0], [0, -2]].some(([dx, dy]) => sk.has((y + dy) * 4096 + x + dx)), 30, 84, { gap: 3 });
  s.look = { ground: 'rock', pave: 'paving', inside: (x, y) => s.hAt(x, y) > hb }; // the stack's bare rock top: crag faces under it
  return { site: s, host: [], gates: [s.u(149, 80), s.u(sx + 74, 129)], spots: { landmark: s.u(sx + 20, 28), harbour: s.u(sx + 60, 80) } };
}

// ======================================================================================= the Sunken Temple (delta)

/**
 * The river-god's temple on the largest mud island of a lagoon (site 220 x 150): the lagoon shallow, two deep channels
 * across it; the temple island with its colonnaded precinct (the half-sunk temple, the spring, two shrines, the
 * priests' houses, a treasury); the drowned quarter west (houses standing in the shallows along causeway streets,
 * nearly all fallen in), the shrine isle east; stone causeways and jetties between the islands.
 */
export function sunkenTemple(k: Kit, at: Pt, hb: number): Landmark {
  const s = k.site('sunken', at, [220, 150], { claim: [112, 88], guardians: [{ boss: 'river_god', at: [115, 52], flats: 'water' }] });
  const B = (x: number, y: number, rx: number, ry: number, a = 0): [number, number, number, number, number] => { const [ux, uy] = s.u(x, y); return [ux, uy, rx / 4, ry / 4, a]; };
  k.waterBody(B(104, 76, 236, 156), { deep: false, beach: 2, rough: 5 });
  k.waterBody(B(75, 76, 9, 170, 0.08), { deep: true, shore: 0.5, beach: 0, rough: 1.5 });
  k.waterBody(B(155, 76, 9, 170, -0.06), { deep: true, shore: 0.5, beach: 0, rough: 1.5 });
  // the islands
  k.island(B(115, 62, 66, 80, 0.1), hb, 3);
  k.island(B(190, 72, 46, 72, -0.2), hb, 3);
  s.level(94, 28, 138, 60, hb);
  // causeways: east-west across all three, north to the land, south to the shore
  for (const [a, b, c, d] of [[0, 60, 220, 64], [112, 0, 116, 24], [112, 100, 116, 150], [30, 0, 34, 60], [188, 108, 192, 150]]) { s.level(a, b, c, d, hb, true, false); s.keep(a, b, c, d); }
  // the precinct: a colonnade round the temple, the spring and the shrines
  colonnade(s, 94, 30, 138, 58);
  s.put('sunken-temple', 112, 38);
  s.put('achelous-spring', 104, 48); s.put('sunken-shrine', 126, 48); s.put('sunken-shrine', 98, 36);
  for (const [x, y] of [[90, 70], [96, 76], [130, 70], [136, 76]]) s.put('sunken-house', x, y, { hp: 0.5 });
  s.put('arch-treasury', 120, 74); s.put('arch-cistern', 102, 86); s.put('sunken-jetty', 146, 40); s.put('sunken-jetty', 83, 80);
  yard(s, 104, 82, 122, 96);
  // the drowned quarter: houses standing in the shallows along causeway streets
  for (const y of [20, 40, 84, 104, 124]) { s.level(4, y, 66, y + 2, hb, true, false); s.keep(4, y, 66, y + 2); }
  const drowned: District = { ids: [['sunken-house', 4], ['arch-house-a', 1], ['arch-tenement', 1]], ruin: 0.85, hp: [0.25, 0.5], empty: 0.3 };
  for (const [y0, y1] of [[4, 20], [22, 40], [42, 60], [64, 84], [86, 104], [106, 124], [126, 146]]) s.block(4, y0, 66, y1, drowned, 90 + y0);
  // the shrine isle
  s.put('sunken-shrine', 184, 48); s.put('arch-chapel', 196, 44); s.put('sunken-shrine', 176, 84);
  scatter(s, ['sunken-house', 'arch-house-a'], 168, 70, 212, 104, 8, 93, { ruin: 0.7, hp: 0.5 });
  s.put('sunken-jetty', 165, 70); s.put('sunken-jetty', 214, 56);
  capHomes(s, 8, 112, 60);
  // dressing: reeds on the islands' edges, fallen columns and stones by the precinct and in the drowned quarter
  const edge = (x: number, y: number) => [[2, 0], [-2, 0], [0, 2], [0, -2]].some(([dx, dy]) => !s.dry(x + dx, y + dy));
  s.dress(['kyrene/reeds', 'kyrene/reeds', 'elaia/maquis-a'], edge, 140, 95, { gap: 3 });
  s.dress(['elaia/debris-stone', 'elaia/wall-fallen-stone', 'elaia/debris-stone'], (x, y) => !s.taken(x, y) && x > 4 && x < 150 && y > 20 && y < 110, 60, 96, { gap: 4 });
  return { site: s, host: [], gates: [s.u(114, -4), s.u(114, 154), s.u(32, -4), s.u(190, 154)], spots: { landmark: s.u(115, 44) } };
}
/** A colonnade wall (sunken-colonnade pieces, 2 tiles a segment) round site tiles x0..x1, y0..y1, open in the middle of the south side. */
function colonnade(s: Site, x0: number, y0: number, x1: number, y1: number) {
  const mid = (x0 + x1) / 2;
  for (let x = x0; x + 2 <= x1; x += 2) { s.put('sunken-colonnade-x', x, y0); if (Math.abs(x + 1 - mid) > 3) s.put('sunken-colonnade-x', x, y1 - 1); }
  for (let y = y0 + 1; y + 2 <= y1 - 1; y += 2) { s.put('sunken-colonnade-y', x0, y); s.put('sunken-colonnade-y', x1 - 1, y); }
}

// ======================================================================================= the Cyclopean Gatehouse (saddle)

/**
 * The giants' gate fort at the head of the north ramp (site 152 x 64): the barrier wall of giant blocks across the
 * ramp head with the gatehouse astride the road (Brontes on its top), and behind it the walled ward (gates south and
 * north on the road, towers every 22) with the guardroom halls, cisterns, stores, a forge and a chapel; the eagle
 * crater (star iron) east of the ward.
 */
export function cyclopsGate(k: Kit, at: Pt, h: number): Landmark {
  const s = k.site('cyclops', at, [152, 64], { claim: [70, 22], guardians: [{ boss: 'brontes', at: [84, 49], perches: [[84, 45.5]] }] });
  s.level(0, 0, 152, 48, h);
  // W-51: the ward on its crag ~5 m over the switchbacks below (visual only), the road climbing steep to the gate
  s.base = h - 3; s.lift = 2; s.levels = [[h - 1, h - 1], [h, h + 14]]; s.roadLevels = [[h - 3, h - 3], [h - 2, h + 3], [h - 1, h + 8], [h, h + 14]];
  s.look = { ground: 'scree', pave: 'paving', inside: (x, y) => y < 48 }; // the giants' ward on bare scree
  s.liftOnly = (x, y) => y < 48 || s.hAt(x, y) < h;
  s.pave(82, 0, 87, 64); s.keep(82, 0, 87, 64);
  s.pave(74, 0, 87, 3); s.keep(74, 0, 87, 3);
  s.pave(72, 54, 87, 64); s.keep(72, 54, 87, 64);
  const W = s.line(CYC, 'x', 0, 44, 152, { gates: [0.535], every: 22, seed: 101 });
  s.ring(CYC, 44, 2, 124, 42, { gates: [['S', 0.5], ['N', 0.5]], every: 22, seed: 102 });
  void W;
  for (const [x, y] of [[50, 8], [50, 16], [50, 24]]) s.put('arch-barracks', x, y);
  s.put('arch-cistern', 50, 32); s.put('arch-cistern', 112, 32);
  for (const [x, y] of [[110, 8], [110, 16]]) s.put('@town-storehouse', x, y);
  s.put('arch-forge', 96, 8); s.put('arch-chapel', 96, 24);
  yard(s, 62, 10, 80, 34);
  s.node('landmark/eagle-crater', 136, 20);
  s.dress(['mountains/talus-granite', 'mountains/boulder-field', 'mountains/talus-granite'], (x, y) => y >= 49 && !s.streets.has(y * 4096 + x), 24, 103, { gap: 4 });
  s.dress(['mountains/alpine-grass', 'mountains/juniper'], (x, y) => y < 44 && !s.streets.has(y * 4096 + x), 40, 104, { gap: 3 });
  return { site: s, host: [], gates: [], spots: { gatehouse: s.u(84, 46), ward: s.u(70, 22) } };
}

// ======================================================================================= the Oracle Grove (erymanthos)

/**
 * The sanctuary at the Ladon springs (site 150 x 124): the temenos wall (towers, gates west, south and east, long
 * fallen in places) round the oracle's naiskos with its tripods, the springs of Memory and of Lethe, the priestess's
 * house and the priests' row, the treasuries along the sacred way from the south gate, chapels, the pilgrims' stoas,
 * the theatre in the north-west corner; the pilgrims' village outside the south gate, mostly empty.
 */
export function oracleGrove(k: Kit, at: Pt, hb: number): Landmark {
  const s = k.site('oracle', at, [150, 124], { claim: [74, 66], guardians: [{ boss: 'grove_queen', at: [74, 56] }] });
  s.wild = true; // the sacred grove keeps its oaks
  s.level(16, 6, 134, 104, hb);
  const G = s.ring(ARCH, 20, 8, 130, 100, { gates: [['W', 0.5], ['S', 0.5], ['E', 0.35]], every: 30, breach: 0.25, seed: 121 });
  s.pave(73, 60, 77, 97); s.keep(73, 60, 77, 97);
  s.put('oracle-shrine', 72, 40);
  s.put('spring-memory', 52, 54); s.put('spring-lethe', 96, 58);
  s.put('oracle-house', 86, 26);
  for (let n = 0; n < 5; n++) s.put('oracle-house', 40 + n * 10, 14, n === 3 ? { ruined: true } : { hp: 0.6 });
  for (let n = 0; n < 3; n++) { s.put('arch-treasury', 66, 66 + n * 10, n === 2 ? { ruined: true } : {}); s.put('arch-treasury', 79, 66 + n * 10); }
  s.put('arch-chapel', 104, 30); s.put('arch-chapel', 44, 74);
  freePut(s, '@town-stoa', 100, 72); freePut(s, '@town-stoa', 110, 72);
  s.put('arch-theatre', 26, 26);
  for (const [x, y] of [[66, 50], [82, 50], [70, 36], [80, 36]]) s.put('@town-statue', x, y);
  s.put('arch-cistern', 112, 88);
  yard(s, 60, 46, 92, 64);
  s.node('landmark/asphodel-meadow', 50, 88);
  // the pilgrims' village south of the gate
  const vil: District = { ids: [['@town-cottage', 3], ['oracle-house', 2], ['arch-house-a', 2]], ruin: 0.7, hp: [0.4, 0.6], empty: 0.35 };
  quarters(s, s.grid(10, 106, 146, 124, { bw: 14, bh: 16, avX: [75] }), [], () => vil, 123);
  capHomes(s, 6, 75, 60);
  // dressing: fallen stones of the temenos where it is breached, stones by the springs
  s.dress(['elaia/wall-fallen-stone', 'elaia/debris-stone', 'elaia/herbs'], (x, y) => (x < 26 || x > 124 || y < 14 || y > 94) && x > 14 && x < 136 && y > 4 && y < 104, 40, 124, { gap: 4 });
  s.dress(['elaia/herbs', 'elaia/maquis-a', 'elaia/maquis-c'], (x, y) => x > 26 && x < 124 && y > 14 && y < 94 && !s.streets.has(y * 4096 + x), 50, 125, { gap: 4 });
  return { site: s, host: [], gates: G.map((g) => out(s, g, 8)), spots: { landmark: s.u(74, 50) } };
}

// ======================================================================================= Titan's Forge (gorge)

/**
 * The cave-works on the east rim by the falls and the rock bridge (site 110 x 120, the roads through it laid first and
 * kept as its streets): the great anvil under the falls' cliff with Gyges chained before it, a row of furnaces and the
 * water bellows, the slag heap, workshops and stores, the workers' halls, a cistern; the works walled north and east
 * (gates on the roads), the two cliffside guard towers over the bridge road.
 */
export function titanForge(k: Kit, at: Pt): Landmark {
  const s = k.site('forge', at, [110, 120], { claim: [62, 70], guardians: [{ boss: 'gyges', at: [27.5, 30.5] }] });
  s.keepRoads();
  const on = (id: string, x: number, y: number, o: { hp?: number; ruined?: boolean } = {}) => { const [w, h] = s.fp(id); return flat(s, x, y, w, h) && s.put(id, x, y, o); };
  on('titan-anvil', 26, 24);
  for (let n = 0; n < 6; n++) on('titan-furnace', 20 + (n % 3) * 6, n < 3 ? 40 : 48);
  on('titan-bellows', 34, 24); on('titan-bellows', 20, 24);
  on('titan-slag', 20, 58);
  for (const [x, y] of [[56, 10], [56, 20], [56, 30]]) on('titan-hall', x, y);
  for (const [x, y] of [[70, 44], [76, 44], [70, 52], [76, 52]]) on('arch-workshop', x, y);
  for (const [x, y] of [[56, 84], [62, 84], [56, 92]]) on('@town-storehouse', x, y);
  on('arch-cistern', 70, 64); on('arch-forge', 84, 20); on('arch-forge', 84, 28);
  on('titan-tower', 18, 100); on('titan-tower', 18, 112);
  // the walls: north across the rim (a gate on the road), east down the works (a gate on the east road)
  s.line(CYC, 'x', 16, 2, 80, { gates: [0.32], every: 22, seed: 141 });
  s.line(CYC, 'y', 93, 5, 112, { gates: [0.85], every: 26, ends: false, outer: '+', seed: 142 });
  yard(s, 52, 62, 66, 76);
  // the forgemen's quarter down the rim toward the bridge, a second row of furnaces, sheds of charcoal and ore
  const men: District = { ids: [['arch-house-a', 3], ['@town-cottage', 2], ['arch-workshop', 2], ['titan-furnace', 1], ['@town-storehouse', 1]], ruin: 0.55, hp: [0.4, 0.6], empty: 0.2 };
  quarters(s, s.grid(46, 78, 92, 116, { bw: 12, bh: 9 }), [[52, 62, 66, 76]], () => men, 143);
  scatter(s, ['titan-furnace', 'arch-workshop', '@town-storehouse', 'titan-hall'], 18, 6, 92, 76, 16, 144, { hp: 0.6 });
  capHomes(s, 4, 60, 60);
  // dressing: slag, ore and charcoal heaps and fallen stone round the works (walkable)
  s.dress(['elaia/debris-stone', 'mountains/talus-granite', 'kyrene/rubble-heap-mud'], (x, y) => x > 14 && x < 92 && y > 4 && y < 118, 50, 145, { gap: 3 });
  return { site: s, host: [], gates: [], spots: { anvil: s.u(27, 25), works: s.u(60, 60) } };
}

// ======================================================================================= the Obsidian Hold (canyons)

/**
 * The rock-cut hold on the mesa over the canyon junction (site 120 x 92, the mesa at `hm`, its cliffs kept): rock walls
 * and towers cut from the basalt (gates east toward the junction ramp and south), rock-cut halls, the vent kiln over its
 * fissure, the obsidian glass fields, cisterns, stores, a forge and barracks, an inner pair of towers over the kiln.
 */
export function obsidianHold(k: Kit, at: Pt, hm: number): Landmark {
  const s = k.site('obsidian', at, [120, 92], { claim: [56, 58], guardians: [{ boss: 'chimera', at: [60, 50] }] });
  s.level(6, 6, 114, 86, hm, false, false);
  // W-51: the hold's mesa ~6 m over the canyon floors (visual only); the ramps up drawn steep
  s.base = hm - 3; s.lift = 2; s.levels = [[hm - 1, hm - 1], [hm, hm + 12]]; s.roadLevels = [[hm - 3, hm - 3], [hm - 2, hm + 3], [hm - 1, hm + 7], [hm, hm + 12]];
  s.liftOnly = (x, y) => x >= 6 && x < 114 && y >= 6 && y < 86;
  s.look = { ground: 'redrock', pave: 'paving', inside: (x, y) => x >= 6 && x < 114 && y >= 6 && y < 86 }; // rock-cut: bare red rock
  const G = s.ring(OBS, 6, 6, 114, 86, { gates: [['E', 0.7], ['S', 0.5]], every: 24, seed: 161 });
  for (const [x, y] of [[12, 12], [12, 20], [12, 28]]) s.put('obsidian-hall', x, y);
  s.put('obsidian-kiln', 82, 30);
  s.put('obsidian-tower', 76, 24); s.put('obsidian-tower', 88, 36);
  s.put('obsidian-field', 92, 18); s.put('obsidian-field', 98, 24); s.put('obsidian-field', 22, 66);
  s.put('arch-cistern', 40, 12); s.put('arch-cistern', 96, 66);
  for (const [x, y] of [[50, 12], [56, 12], [62, 12]]) s.put('@town-storehouse', x, y);
  s.put('arch-barracks', 12, 50); s.put('arch-barracks', 12, 58); s.put('arch-forge', 40, 22);
  yard(s, 44, 40, 76, 70);
  scatter(s, ['@town-storehouse', 'arch-workshop', 'obsidian-hall', 'arch-tenement', 'arch-cistern'], 10, 10, 110, 82, 24, 162, { hp: 0.6, margin: 1 });
  capHomes(s, 4, 60, 50);
  s.dress(['kyrene/rocks-red', 'kyrene/boulder-red', 'kyrene/talus-red'], (x, y) => (x < 6 || x >= 114 || y < 6 || y >= 86), 40, 163, { gap: 4 });
  s.dress(['kyrene/debris-mud', 'kyrene/rocks-red'], (x, y) => x > 8 && x < 112 && y > 8 && y < 84 && !s.streets.has(y * 4096 + x), 40, 164, { gap: 4 });
  return { site: s, host: [], gates: G.map((g) => out(s, g, 8)), spots: { hold: s.u(60, 50) } };
}
