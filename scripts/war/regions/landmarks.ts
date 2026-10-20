/**
 * The nine landmarks at true scale (W-48, docs/WAR.md "Landmarks"): each a real place laid out with the city kit
 * (kit.ts Site: wall rings, street grids, blocks of lots, single pieces), every building a pre-built sim building (W-47)
 * whose condition follows the lore (the Dead City's quarters mostly fallen in, the citadel's walls whole). Sizes are
 * in sim tiles (2 m): the Dead City 320 x 220 (640 x 440 m inside its necropolis), the Citadel 200 x 184, the Temple
 * City the whole mesa top. A builder shapes the ground (both kit runs) and queues the pieces; it returns the site,
 * its gates (unit points just outside, for the roads in), the lair points of a bandit host and its spots.
 * Population: a landmark's standing houses are capped (capHomes) so its recruit pool stays as docs/WAR.md has it.
 */
import type { District, Kit, Pt, Side4, Site, WallSet } from './kit.ts';

export interface Landmark { site: Site; gates: Pt[]; host: Pt[]; spots: Record<string, Pt> }
type Gate = { side: Side4; at: Pt };

const CIT: WallSet = { wall: 'citadel-curtain', tower: 'citadel-tower', gate: 'citadel-gatehouse' };
const ARCH: WallSet = { wall: 'arch-wall', tower: 'arch-tower', gate: 'arch-gate' };
const AMM: WallSet = { wall: 'ammon-wall', tower: 'ammon-tower', gate: 'ammon-gate' };
const CYC: WallSet = { wall: 'cyclops-wall', tower: 'cyclops-tower', gate: 'cyclops-gatehouse' };
const OBS: WallSet = { wall: 'obsidian-wall', tower: 'obsidian-tower', gate: 'obsidian-gate' };

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

// ======================================================================================= Drakon's Citadel (krios)

/**
 * The Wardens' northern citadel on the glacier shoulder (site 200 x 184): the outer curtain (towers every 22 tiles,
 * three gatehouses, the barbican before the main south gate) round the outer ward with its quarters (barracks west,
 * stables and the forges east, the bone pit, cisterns, the chapel), the inner ward a level up with the commander's
 * halls, and the donjon on the highest ground with the keep (Drakon's roof); a switchback road climbs from the ruined
 * outer village below to the barbican. The approach is at `hb`, the wards hb+1..hb+3.
 */
export function citadel(k: Kit, at: Pt, hb: number): Landmark {
  const s = k.site('citadel', at, [200, 184], {
    claim: [102, 76],
    guardians: [{ boss: 'drakon', at: [102, 129], perches: [], pit: [23.5, 65.5] }],
  });
  // the ground: the approach and village at hb, the outer ward up one, the inner ward two, the donjon three
  s.level(0, 140, 200, 184, hb);
  s.level(8, 6, 192, 137, hb + 1);
  s.level(56, 14, 148, 90, hb + 2);
  s.level(84, 22, 120, 52, hb + 3);
  // the rings
  const O = s.ring(CIT, 8, 6, 192, 137, { gates: [['S', 0.5], ['W', 0.42], ['E', 0.58]], every: 22, seed: 11 });
  s.ring(CIT, 56, 14, 148, 90, { gates: [['S', 0.5], ['W', 0.6]], every: 24, seed: 12 });
  s.ring(CIT, 84, 22, 120, 52, { gates: [['S', 0.5]], every: 40, seed: 13 });
  const gS = O.find((g) => g.side === 'S')!, gx = Math.round(gS.at[0]);
  // P2: Drakon takes the roofs of the south curtain's towers either side of the main gate, then the keep's
  const south = s.pieces.filter((p) => p.id === CIT.tower && p.y === s.y0 + 134).map((p): Pt => [p.x - s.x0 + 1.5, 135.5]).sort((a, b) => Math.abs(a[0] - gx) - Math.abs(b[0] - gx));
  s.guardians[0].perches = [[gx, 135.5], ...south.slice(0, 4), [102, 33]];
  s.force('arch-barbican-x', gx - 3, 137);
  // the donjon: the keep, a cistern, the treasury
  s.put('citadel-keep', 99, 30);
  s.put('arch-cistern', 88, 26); s.put('arch-treasury', 112, 26);
  // the inner ward: the commander's halls, the chapel, stores; the yard south of the donjon kept clear
  yard(s, 86, 56, 118, 86, 'dirt');
  for (const [x, y] of [[60, 20], [60, 30], [136, 20], [136, 30]]) s.put('arch-barracks', x, y);
  s.put('arch-chapel', 126, 56); s.put('arch-cistern', 62, 56);
  for (const [x, y] of [[62, 66], [62, 74], [134, 66], [134, 74]]) s.put('@town-storehouse', x, y);
  s.put('@forge2', 72, 42); s.put('@well', 122, 48);
  // the outer ward: barracks west, the bone pit and its yard, stables and forges east, the south yard (Drakon's P1)
  for (let n = 0; n < 5; n++) s.put('arch-barracks', 14, 12 + n * 8);
  s.put('citadel-bone-pit', 22, 64);
  yard(s, 14, 56, 40, 84, 'dirt');
  for (const [x, y] of [[14, 92], [24, 92], [14, 104], [24, 104]]) s.put('@town-storehouse', x, y);
  s.put('arch-cistern', 40, 116); s.put('arch-workshop', 14, 118); s.put('arch-workshop', 24, 118);
  for (let n = 0; n < 5; n++) s.put('arch-stables', 160, 12 + n * 7);
  s.put('arch-forge', 160, 52); s.put('arch-forge', 170, 52); s.put('arch-workshop', 160, 60); s.put('arch-workshop', 170, 60);
  s.put('arch-cistern', 160, 100); s.put('@town-storehouse', 170, 100); s.put('@town-storehouse', 170, 108);
  s.put('arch-chapel', 64, 100); s.put('arch-cistern', 132, 104);
  yard(s, 80, 96, 124, 130, 'dirt');
  // the ward's lean-tos and sheds along the curtain, the inner ward's offices
  scatter(s, ['arch-workshop', '@town-storehouse', 'arch-barracks', 'arch-stables', '@town-cookhouse'], 12, 10, 188, 133, 34, 14, { hp: 0.6 });
  scatter(s, ['@town-storehouse', 'arch-workshop', '@town-cookhouse'], 60, 18, 144, 86, 10, 15, { hp: 0.6 });
  // the switchback road from the barbican down to the village, the village in ruins either side of it
  const zig: [number, number, number, number][] = [[gx - 1, 141, gx + 2, 150], [gx - 44, 147, gx + 2, 150], [gx - 44, 147, gx - 41, 158], [gx - 44, 155, gx + 44, 158], [gx + 41, 155, gx + 44, 166], [gx - 10, 163, gx + 44, 166], [gx - 10, 163, gx - 7, 184]];
  for (const [a, b, c, d] of zig) { s.pave(a, b, c, d); s.keep(a, b, c, d); }
  const village: District = { ids: [['@town-cottage', 4], ['@town-house-a', 2], ['arch-house-a', 2], ['@town-house-b', 1]], ruin: 1, hp: [0.6, 0.6], empty: 0.25, alley: 0.4 };
  const vb = s.grid(4, 168, 196, 184, { bw: 16, bh: 14, sw: 2 });
  quarters(s, vb, [[gx - 11, 160, gx - 6, 184]], () => village, 21);
  s.put('arch-chapel', gx + 16, 170, { ruined: true });
  return {
    site: s, host: [],
    gates: [s.u(gx, 186), ...O.filter((g) => g.side !== 'S').map((g) => out(s, g))],
    spots: { citadel: s.u(102, 66), barbican: s.u(gx, 141), village: s.u(gx, 176) },
  };
}

// ======================================================================================= the Dead City of Ammon

/**
 * The abandoned city on the butte by the dead lake (site 320 x 220): the necropolis west outside the walls (tombs in
 * rows along dirt paths), the city wall (towers every 26 tiles, gates on every side, a postern by the lake, a few
 * breaches) round a Hippodamian grid of blocks, its main avenues from the gates crossing at the agora (stoas, stalls,
 * statues, a well); the temple of Ammon's precinct in the north-west, the palace on its walled acropolis in the
 * north-east a level up; quarters of mudbrick houses and tenements (most fallen in, many lots empty), a craftsmen's
 * quarter by the west gate, cisterns, and four bandit strongholds held by the King's host.
 */
export function deadCity(k: Kit, at: Pt, hb: number): Landmark {
  const R = [60, 8, 300, 212], gx = 180, gy = 110;
  const s = k.site('ammon', at, [320, 220], { claim: [gx + 12, gy + 10], guardians: [{ boss: 'bandit_king', at: [255, 60], postern: [264, 2] }] });
  s.level(52, 0, 320, 220, hb + 1);
  s.level(220, 16, 290, 74, hb + 2);
  const G = s.ring(AMM, R[0], R[1], R[2], R[3], { gates: [['N', 0.5], ['N', 0.84], ['S', 0.5], ['W', 0.5], ['E', 0.5]], every: 26, breach: 0.06, seed: 31 });
  s.ring(AMM, 220, 16, 290, 74, { gates: [['S', 0.5], ['W', 0.5]], every: 30, seed: 32 });
  // the inner pomerium street round the walls
  for (const [a, b, c, d] of [[63, 11, 297, 13], [63, 207, 297, 209], [63, 11, 65, 209], [295, 11, 297, 209]]) { s.pave(a, b, c, d); s.keep(a, b, c, d); }
  // the palace acropolis: the palace, its stores and treasury (the hoard), the guard's halls, a cistern, rich houses
  s.put('ammon-palace', 252, 28);
  yard(s, 246, 52, 266, 64);
  s.put('arch-treasury', 240, 22); s.put('arch-treasury', 266, 22);
  for (const [x, y] of [[226, 22], [226, 30], [276, 22], [276, 30]]) s.put('@town-storehouse', x, y);
  s.put('arch-barracks', 226, 40); s.put('arch-barracks', 272, 40); s.put('arch-cistern', 240, 50); s.put('arch-chapel', 272, 50);
  scatter(s, ['ammon-house-c', 'arch-house-b'], 224, 58, 288, 70, 6, 33, { hp: 0.5 });
  // the precinct of Ammon: the temple between its stoas, chapels, statues, the priests' houses
  const T = [68, 16, 132, 70];
  s.pave(T[0], T[1], T[2], T[3], 'dirt');
  s.keep(T[0], T[1], T[2], T[3]);
  const putT = (id: string, x: number, y: number, o: { hp?: number; ruined?: boolean } = {}) => s.force(id, x, y, o);
  putT('ammon-temple', 98, 26);
  putT('@town-stoa', 76, 22); putT('@town-stoa', 76, 36); putT('@town-stoa', 122, 22); putT('@town-stoa', 122, 36);
  putT('arch-chapel', 86, 52); putT('arch-chapel', 108, 52, { ruined: true });
  for (const x of [94, 98, 104, 108]) putT('@town-statue', x, 44);
  putT('ammon-house-a', 72, 60, { hp: 0.5 }); putT('ammon-house-b', 118, 60, { ruined: true }); putT('arch-cistern', 98, 60);
  // the street grid, its main avenues from the gates
  const blocks = s.grid(66, 14, 294, 206, { bw: 20, bh: 12, sw: 2, aw: 4, avX: [gx], avY: [gy] });
  // the agora where they cross: stoas west and east, stalls north and south, statues, a well; the claim on its open heart
  const A = [gx - 26, gy - 18, gx + 26, gy + 18];
  s.pave(A[0], A[1], A[2], A[3]);
  yard(s, gx + 6, gy + 4, gx + 18, gy + 14);
  for (const [x, y] of [[A[0] + 1, gy - 15], [A[0] + 1, gy + 5], [A[2] - 3, gy - 15], [A[2] - 3, gy + 5]]) freePut(s, '@town-stoa', x, y);
  for (let n = 0; n < 5; n++) for (const [y, m] of [[A[1] + 1, 0], [A[3] - 3, 1]] as const) {
    const x = gx - 22 + n * 9 + (n >= 3 ? 4 : 0);
    freePut(s, `@town-stall-${'abc'[(n + m) % 3]}`, x, y);
  }
  freePut(s, '@town-statue', gx - 8, gy - 8); freePut(s, '@town-statue', gx - 8, gy + 8); freePut(s, '@town-well', gx + 8, gy - 8);
  // four strongholds of the host in the quarters, a craftsmen's quarter by the west gate
  const SH: [number, number][] = [[78, 150], [244, 150], [150, 34], [196, 168]];
  const host = SH.map(([x, y]) => stronghold(s, AMM, x, y, 'ammon-workshop'));
  const houses: District = { ids: [['ammon-house-a', 3], ['ammon-house-b', 3], ['ammon-house-c', 2], ['arch-house-a', 1], ['arch-house-b', 1]], ruin: 0.8, hp: [0.25, 0.55], empty: 0.55, alley: 0.2 };
  const tenements: District = { ids: [['ammon-tenement', 4], ['arch-tenement', 2], ['ammon-house-b', 1]], ruin: 0.8, hp: [0.25, 0.55], empty: 0.35 };
  const rich: District = { ids: [['ammon-house-c', 3], ['arch-house-b', 3]], ruin: 0.75, hp: [0.3, 0.6], empty: 0.45 };
  const crafts: District = { ids: [['ammon-workshop', 3], ['arch-workshop', 2], ['@town-storehouse', 1], ['arch-forge', 1], ['ammon-house-a', 1]], ruin: 0.5, hp: [0.3, 0.6], empty: 0.35 };
  const reserved = [T, A, [218, 14, 292, 76], ...SH.map(([x, y]) => [x, y, x + 20, y + 20])];
  quarters(s, blocks, reserved, (b) => {
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    if (cx < 120 && Math.abs(cy - gy) < 40) return crafts;
    if (Math.abs(cx - gx) < 16 && cy > 150) return crafts;
    if (cx > 200 && cy < 110) return rich;
    if (Math.abs(cx - gx) < 26 || Math.abs(cy - gy) < 16) return tenements;
    return houses;
  }, 41);
  scatter(s, ['arch-cistern'], 70, 20, 290, 200, 6, 43, { margin: 1, hp: 0.5 });
  // the necropolis outside the west wall: tombs in rows along dirt paths, a road from the west gate past them
  const nb = s.grid(4, 30, 54, 190, { bw: 10, bh: 9, sw: 2, t: 'dirt' });
  quarters(s, nb, [], () => ({ ids: [['arch-tomb-a', 3], ['arch-tomb-b', 2], ['ammon-tomb', 2]], ruin: 0.25, hp: [0.3, 0.6], empty: 0.7, alley: 0.5 }), 51);
  capHomes(s, 12, 255, 45);
  const gW = G.find((g) => g.side === 'W')!;
  s.pave(0, Math.round(gW.at[1]) - 2, 60, Math.round(gW.at[1]) + 2);
  return {
    site: s, host,
    gates: G.filter((g) => !(g.side === 'N' && g.at[0] > 240)).map((g) => (g.side === 'W' ? s.u(-3, g.at[1]) : out(s, g, 12))),
    spots: { agora: s.u(gx + 12, gy + 9), palace: s.u(255, 40), necropolis: s.u(28, 110), postern: s.u(264, 2) },
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
  for (const [a, b, c, d] of ways) { s.level(a, b, c, d, hm, true, false); s.keep(a, b, c, d); }
  ramp(166, 6, 'x'); ramp(198, 316, 'x'); ramp(6, 164, 'y'); ramp(326, 166, 'y');
  for (let y = 230; y < 310; y += 14) { on('@town-statue', 195, y); on('@town-statue', 204, y); }
  // the peribolos of the great temple (gates west and south), the temple and the omphalos, treasuries, chapels
  const P = s.ring(ARCH, 206, 66, 290, 150, { gates: [['W', 0.5], ['S', 0.48]], every: 28, breach: 0.15, seed: 61 });
  void P;
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
  s.pave(A[0], A[1], A[2], A[3]);
  yard(s, 194, 194, 208, 206);
  for (const [x, y] of [[172, 184], [172, 206], [228, 184], [228, 206]]) freePut(s, '@town-stoa', x, y);
  for (let n = 0; n < 5; n++) { freePut(s, `@town-stall-${'abc'[n % 3]}`, 178 + n * 9 + (n >= 2 ? 4 : 0), 183); freePut(s, `@town-stall-${'abc'[(n + 1) % 3]}`, 178 + n * 9 + (n >= 2 ? 4 : 0), 217); }
  // the pilgrims' quarters south of the agora either side of the way
  const pil: District = { ids: [['arch-house-a', 3], ['arch-house-b', 2], ['arch-tenement', 2], ['@town-cottage', 1], ['arch-workshop', 1]], ruin: 0.8, hp: [0.3, 0.6], empty: 0.4 };
  const qb = [...s.grid(140, 226, 194, 300, { bw: 16, bh: 10 }), ...s.grid(208, 226, 280, 300, { bw: 16, bh: 10 })];
  quarters(s, qb.filter((b) => flat(s, b[0], b[1], b[2] - b[0], b[3] - b[1], hm)), [], () => pil, 63);
  // the outer quarters: inns and houses of the festival crowds west of the agora, the priests' town north of the
  // lake and east of the north way, the craftsmen (votive workshops) by the east way; fewer standing the further out
  const outer: District = { ...pil, ruin: 0.85, empty: 0.5, ids: [...pil.ids, ['arch-workshop', 2], ['@town-storehouse', 1]] };
  const ob = [...s.grid(14, 176, 120, 300, { bw: 16, bh: 10 }), ...s.grid(30, 12, 160, 64, { bw: 16, bh: 10 }), ...s.grid(176, 12, 200, 160, { bw: 10, bh: 10 }), ...s.grid(214, 176, 286, 222, { bw: 16, bh: 10 })];
  quarters(s, ob.filter((b) => flat(s, b[0], b[1], b[2] - b[0], b[3] - b[1], hm)), [[284, 166, 304, 188]], () => outer, 67);
  scatter(s, ['arch-cistern'], 150, 70, 170, 150, 3, 65, { h: hm });
  capHomes(s, 10, 200, 200);
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
  return { site: s, host: [], gates: G.map((g) => out(s, g, 8)), spots: { hold: s.u(60, 50) } };
}
