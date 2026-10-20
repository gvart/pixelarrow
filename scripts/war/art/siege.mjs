// Siege art (W-29) -> public/war/siege/ (objects.json + PNGs): a hide-roofed ram shed, an onager-type stone thrower, siege
// ladders, rubble for breaches and fallen towers, the stone shot and the fire FX. Prompts and lessons: PROMPTS_ART.md "Siege".
// Usage: node scripts/war/art/siege.mjs [pixellab dir]   (FX raws in <dir>/siege/raw/fx: vfx_workbench exports)
//
// Engines, ladders and rubble are drawn by the box renderer of buildings.mjs (true scale, exact facings, the walls'
// textures and palette); a machine is modelled once along +x and turned to its four facings (e +x, s +y, w -x, n -y).
// Ram: back + front layer (front = the roof and the near side over the crew). QA: qa.mjs (qaSiege).
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writeImage } from '../../art/lib/png.mjs';
import { blank, crop, paste, alphaBox, snapToPalette } from '../../art/lib/ops.mjs';
import { PPM, TEX, hash, mul, clamp, renderBoxes, cells, roof, masonry, rubMat, rough, planks, woodSolid, solid, scorch, burn, loadTextures, extendPalette, footOf, CHAR, EMBER, EARTH } from './buildings.mjs';
import { runSiegeQa } from './qa.mjs';
import { fireArt, FIRE_NOTE } from './fire.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const PIX = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '/Users/v.gladis/Workspace/Personal/pixelarrow/shots/war/pixellab';
const FXRAW = join(PIX, 'siege/raw/fx'), OUT = join(ROOT, 'public/war/siege');
const B = JSON.parse(readFileSync(join(ROOT, 'public/war/buildings/objects.json')));
const FACINGS = ['e', 's', 'w', 'n'], STATES = ['foundation', 'rising', 'scaffold', 'done', 'damaged', 'destroyed'];
const BUILD_ORDER = ['foundation', 'rising', 'scaffold', 'done'], PROGRESS = B.progress;
loadTextures();

// ---- geometry helpers (local metres; a machine is built along +x over [0, L] x [0, Wd])
// turn a model built along +x to a facing: e as built, w mirrored, s / n the y-axis versions
const turn = (f, L) => (b) => (f === 'e' ? b : f === 'w' ? { ...b, x0: L - b.x1, x1: L - b.x0 } : f === 's' ? { ...b, x0: b.y0, x1: b.y1, y0: b.x0, y1: b.x1 } : { ...b, x0: b.y0, x1: b.y1, y0: L - b.x1, y1: L - b.x0 });
const turnPt = (f, L) => ([x, y]) => (f === 'e' ? [x, y] : f === 'w' ? [L - x, y] : f === 's' ? [y, x] : [y, L - x]);
const box = (x0, x1, y0, y1, z0, z1, mat) => ({ x0, x1, y0, y1, z0, z1, mat });
// a round rod along y (wheels, skeins, windlass drums): columns over x whose z spans the circle
const rodY = (cx, cz, R, y0, y1, mat) => cells(cx - R, cx + R, y0, y1, (x) => { const dx = x - cx, h = Math.sqrt(Math.max(0, R * R - dx * dx)); return h > 0.02 ? { z0: Math.max(0, cz - h), z1: cz + h, mat } : null; });
// a straight beam in the x-z plane from p0 to p1 (arms, ladder rails, struts), t thick, between y0 and y1
function seg([ax, az], [bx, bz], t, y0, y1, mat, step = 1 / 24) {
  const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / step)), out = [];
  for (let i = 0; i <= n; i++) { const x = ax + ((bx - ax) * i) / n, z = az + ((bz - az) * i) / n; out.push(box(x - t / 2, x + t / 2, y0, y1, Math.max(0, z - t / 2), z + t / 2, mat)); }
  return out;
}
const ball = (cx, cy, cz, R, mat) => cells(cx - R, cx + R, cy - R, cy + R, (x, y) => { const d = R * R - (x - cx) ** 2 - (y - cy) ** 2; return d > 0 ? { z0: cz - Math.sqrt(d), z1: cz + Math.sqrt(d), mat } : null; }, 1 / 24);

// ---- materials
const W = () => TEX.wood;
const timber = (i = 2, k = 0) => (face, x, y, z) => mul(W()[i], 0.9 + 0.18 * hash(Math.floor((x + y) * 7), Math.floor(z * 9), k));
const wheelMat = (cx, cz) => (face, x, y, z) => { const r = Math.hypot(x - cx, z - cz); return face === '+y' || face === '-y' ? (r < 0.09 ? mul(W()[0], 0.8) : r > 0.37 ? mul(W()[1], 0.8) : mul(W()[2], 0.86 + 0.12 * hash(Math.floor((x - cx) * 6), 1, 3))) : mul(W()[1], 0.75); };
const BRONZE = [[64, 48, 30, 255], [104, 78, 44, 255], [142, 108, 58, 255], [176, 140, 84, 255]];
const bronze = (face, x, y, z) => BRONZE[face === 'top' ? 3 : face === '+y' ? 2 : face === '+x' ? 2 : 1];
const ROPE = [[92, 78, 58, 255], [122, 104, 78, 255], [148, 128, 96, 255]];
const rope = (face, x, y, z) => mul(ROPE[(Math.floor((x + z) * 14) + Math.floor(y * 14)) % 3], 1);
// rawhide panels lashed over the roof: u along the eaves, v down the slope (px at 33 px/m)
const HIDE = [[54, 38, 29], [78, 56, 40], [101, 76, 54], [124, 96, 70], [146, 116, 86]];
const hideTex = (u, v) => {
  const row = Math.floor(v / 13), uu = u + row * 7 + Math.floor(hash(row & 63, 3, 30) * 9), col = Math.floor(uu / 18), fu = uu - col * 18, fv = v - row * 13;
  if (fv < 1 || fu < 1) return HIDE[1]; // seams
  if (fu === 2 && fv % 3 === 1) return HIDE[4]; // stitches
  if (((u % 33) + 33) % 33 < 1) return ROPE[0]; // lashing ropes down the slope
  const t = hash(col & 63, row & 63, 31), m = hash(Math.floor(u / 3), Math.floor(v / 3), 32);
  return HIDE[Math.min(4, 2 + Math.floor(t * 1.6) - (m < 0.15 ? 1 : 0) + (m > 0.9 ? 1 : 0))];
};
const IRON = [[30, 30, 34, 255], [46, 46, 52, 255], [66, 66, 72, 255], [92, 90, 92, 255]];
const iron = (face, x, y, z) => IRON[face === 'top' ? 3 : face === '+y' ? 2 : face === '+x' ? 1 : 0];
const logMat = (face, x, y, z) => mul(W()[face === 'top' ? 3 : 2], 0.78 + 0.22 * hash(Math.floor(x * 5), Math.floor((y + z) * 11), 6)); // barked trunk
const stoneShot = (face, x, y, z) => mul(TEX.lime[face === 'top' ? 3 : 2], 0.85 + 0.25 * hash(Math.floor(x * 30), Math.floor(y * 30) + Math.floor(z * 30), 41));

// ---- the ram: a wheeled shed 6 x 3 m with a gable of hides on posts, a bronze-capped log slung from the ridge
const RAM = { L: 6, Wd: 4, fp: [3, 2], eave: 1.3, ridge: 2.7, y0: 0.4, y1: 3.6 };
function ramBoxes(state, swing = 0, k = 1) {
  const { L, eave, ridge } = RAM, back = [], front = [], cy = 2, dmg = state === 'damaged', gone = state === 'destroyed';
  const sillY = [[0.78, 1.02], [2.98, 3.22]], posts = [0.45, 2.0, 3.55, 5.1];
  const near = (b) => b.y0 >= 2.5; // the +y side (local): in front of the crew
  const add = (...bs) => bs.forEach((b) => (near(b) ? front : back).push(b));
  // chassis: two sills, cross beams; the wheels outside the sills
  const zc = 0.42, zs = [0.48, 0.74];
  if (state === 'foundation') { // sills and cross beams laid out on the ground, a stack of hides
    for (const [a, b] of sillY) back.push(box(0.4, 5.6, a, b, 0, 0.24, timber(2, 1)));
    for (const x of [0.6, 2.4, 4.2]) back.push(box(x, x + 0.25, 1.2, 2.8, 0, 0.2, timber(3, 2)));
    back.push(...[0, 1, 2].map((i) => box(4.8, 5.8, 0.2 + i * 0.05, 0.9, 0.24 + i * 0.12, 0.36 + i * 0.12, solid(mul([...HIDE[2 - (i % 2)], 255], 1)))));
    return { back, front };
  }
  if (!gone) for (const [a, b] of sillY) add(box(0.4, 5.6, a, b, zs[0], zs[1], timber(2, 1)));
  if (!gone) for (const x of [0.5, 1.9, 3.3, 4.7]) back.push(box(x, x + 0.22, 1.02, 2.98, zs[0], zs[1] - 0.04, timber(3, 2)));
  for (const wx of [1.0, 3.0, 5.0]) for (const [a, b] of [[0.58, 0.76], [3.24, 3.42]]) {
    if (gone && wx === 5.0 && a > 1) continue; // a wheel burnt off
    add(...rodY(wx, zc, 0.42, a, b, wheelMat(wx, zc)).map((c) => (gone ? { ...c, z0: Math.max(0, c.z0 - (a > 1 ? 0.25 : 0)), z1: Math.max(0.05, c.z1 - (a > 1 ? 0.25 : 0)) } : c)));
    if (!gone) add(box(wx - 0.05, wx + 0.05, a - 0.04, b + 0.04, zc - 0.05, zc + 0.05, solid([46, 40, 36, 255]))); // hub
  }
  if (gone) { // burnt out: charred chassis down on its axles, post stumps, rafters fallen in, the log on the ground
    for (const [a, b] of sillY) back.push(box(0.4, 5.6, a, b, 0.1, 0.34, timber(1, 1)));
    for (const x of posts) for (const [a, b] of [[0.8, 0.98], [3.02, 3.2]]) { const h = 0.5 + 0.7 * hash(Math.floor(x * 3), a > 1 ? 1 : 0, k + 7); add(box(x, x + 0.18, a, b, 0.34, 0.34 + h, timber(1, 3))); }
    back.push(...seg([0.3, 0.2], [6.4, 0.25], 0.32, 1.84, 2.16, timber(2, 4)), box(6.4, 6.85, 1.78, 2.22, 0.02, 0.46, iron));
    for (let i = 0; i < 6; i++) { const x = 0.6 + i * 0.9 + 0.3 * hash(i, k, 9), a = 0.9 + 1.8 * hash(i, k, 10); back.push(...seg([x, 0.35 + 0.5 * hash(i, k, 11)], [x + 0.6, 0.7 + 0.8 * hash(i, k, 12)], 0.12, a, a + 0.12, timber(1, 5))); }
    return { back, front };
  }
  // posts and eave plates
  const postH = state === 'rising' ? 0.9 : eave;
  for (const x of posts) for (const [a, b] of [[0.8, 0.98], [3.02, 3.2]]) add(box(x, x + 0.18, a, b, zs[1], zs[1] + postH, timber(2, 3)));
  if (state === 'rising') return { back, front };
  for (const [a, b] of [[0.72, 0.98], [3.02, 3.28]]) add(box(0.4, 5.6, a, b, eave + zs[1], eave + zs[1] + 0.16, timber(3, 3)));
  const zE = eave + zs[1] + 0.16, zR = ridge + zs[1];
  // ridge beam on two king posts, the log hung under it on ropes (the log swings along x: swing in metres)
  back.push(box(0.4, 5.6, cy - 0.1, cy + 0.1, zR - 0.2, zR, timber(3, 4)));
  for (const x of [0.45, 5.1]) back.push(box(x, x + 0.16, cy - 0.08, cy + 0.08, zs[1], zR - 0.2, timber(2, 5)));
  // the log (moving: `mv`, drawn over the painted shed per frame): a 6.5 m trunk with an iron cap 1 m past the front
  const lz = 1.25, s = swing, mv = (b) => ({ ...b, mv: true });
  back.push(mv(box(-0.3 + s, 6.2 + s, cy - 0.17, cy + 0.17, lz - 0.17, lz + 0.17, logMat)));
  for (const x of [0.6, 5.6]) back.push(mv(box(x + s, x + 0.12 + s, cy - 0.19, cy + 0.19, lz - 0.19, lz + 0.19, rope))); // lashings
  back.push(mv(box(6.2 + s, 6.85 + s, cy - 0.23, cy + 0.23, lz - 0.23, lz + 0.23, iron)), mv(box(6.85 + s, 7.05 + s, cy - 0.15, cy + 0.15, lz - 0.15, lz + 0.15, iron)), mv(box(7.05 + s, 7.15 + s, cy - 0.08, cy + 0.08, lz - 0.08, lz + 0.08, iron)));
  for (const x of [1.4, 4.4]) back.push(...seg([x, zR - 0.2], [x + s, lz + 0.17], 0.05, cy - 0.02, cy + 0.02, rope).map(mv));
  // rafters (scaffold: the bare frame, no hides)
  const fz = (x, y) => zE + (zR - zE) * (1 - Math.abs(y - cy) / (cy - RAM.y0));
  if (state === 'scaffold') {
    for (const x of [0.45, 1.6, 2.8, 4.0, 5.1]) for (const sg of [-1, 1]) { const ys = sg < 0 ? [RAM.y0, cy] : [cy, RAM.y1]; for (let y = ys[0]; y < ys[1]; y += 1 / 16) add(box(x, x + 0.14, y, y + 1 / 16, fz(x, y + 1 / 32) - 0.14, fz(x, y + 1 / 32), timber(3, 7))); }
    back.push(...[0, 1, 2, 3].map((i) => box(-0.9, 0.0, 0.5 + i * 0.05, 1.4, i * 0.12, 0.12 + i * 0.12, solid([...HIDE[1 + (i % 2)], 255])))); // hides stacked by it
    return { back, front };
  }
  const holes = dmg ? (x, y) => { for (let i = 0; i < 4; i++) { const hx = 0.8 + 4.4 * hash(i, k, 21), hy = RAM.y0 + 0.4 + 2.1 * hash(i, k, 22), r = 0.35 + 0.3 * hash(i, k, 23); if (Math.hypot(x - hx, (y - hy) * 1.3) < r) return true; } return false; } : null;
  const rf = roof(0.3, 5.7, RAM.y0, RAM.y1, fz, (x, y) => [x, Math.abs(y - cy)], { holes, tex: hideTex });
  front.push(...rf);
  // hides hanging from the eaves to knee height on both long sides (the crew's legs show under them)
  for (const [y0, y1, nr] of [[RAM.y0, RAM.y0 + 0.06, 0], [RAM.y1 - 0.06, RAM.y1, 1]]) for (let x = 0.3; x < 5.7; x += 1 / 16) {
    if (holes && holes(x, nr ? RAM.y1 - 0.2 : RAM.y0 + 0.2)) continue;
    const bottom = 0.7 + 0.1 * Math.sin(x * 5.2 + nr) + (dmg ? 0.4 * hash(Math.floor(x * 3), nr, k) : 0);
    (nr ? front : back).push(box(x, x + 1 / 16, y0, y1, bottom, zE, (f, xx, yy, z) => [...hideTex(Math.floor(xx * PPM), Math.floor((zE - z) * PPM) + 7), 255].map((c, i) => (i < 3 ? clamp(c * 0.9) : 255))));
  }
  return { back, front };
}
const RAM_CREW = [1.9, 2.75, 3.6, 4.45].flatMap((x) => [[x, 1.45], [x, 2.55]]); // local metres: two files of four on the log
const RAM_SWING = [0, -0.18, -0.36, -0.5, -0.32, 0.12, 0.55, 0.3]; // the log drawn back slowly, driven forward, recoil

// ---- the stone thrower: a Greek lithobolos (palintone), 6.4 x 4 m on a wheeled chassis: a long stock (trough) on
// trestles, a spring frame near the front with two upright rope skeins capped by bronze washers, two arms swinging in the
// horizontal plane, a bowstring drawn back by a slider in the stock, a winch at the back. Moving parts (arms, string,
// slider, stone) carry `mv`: they are drawn by the renderer over the PixelLab-painted body per frame.
const TH = { L: 6, Wd: 4, fp: [3, 2], sk: 4.7, skY: [1.55, 2.45], arm: 1.35, zA: [1.86, 2.04], zS: [1.9, 1.95], tr: [1.6, 1.86] };
const armTip = (side, deg, d = TH.arm) => { const a = (deg * Math.PI) / 180; return [TH.sk - d * Math.sin(a), TH.skY[side] + (side ? 1 : -1) * d * Math.cos(a)]; };
// a straight beam in the x-y plane (arms, string), t wide, between z0 and z1
function segXY([ax, ay], [bx, by], t, z0, z1, mat, step = 1 / 24) {
  const L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(L / step)), out = [];
  for (let i = 0; i <= n; i++) { const x = ax + ((bx - ax) * i) / n, y = ay + ((by - ay) * i) / n; out.push(box(x - t / 2, x + t / 2, y - t / 2, y + t / 2, z0, z1, mat)); }
  return out;
}
const cylZ = (cx, cy, R, z0, z1, mat) => cells(cx - R, cx + R, cy - R, cy + R, (x, y) => (Math.hypot(x - cx, y - cy) < R ? { z0, z1, mat } : null), 1 / 24);
const skeinMat = (face, x, y, z) => mul(ROPE[(Math.floor(z * 18) + (face === '+x' ? 1 : 0)) % 3], face === 'top' ? 1.1 : 0.95);
// pose: deg = arm sweep from straight out (+-y) towards the back; claw = x of the slider's claw (the string's middle)
function throwerBoxes(state, { deg = 72, claw = 1.9, loaded = true } = {}, k = 2) {
  const out = [], gone = state === 'destroyed', mv = (b) => ({ ...b, mv: true }), cy = 2;
  const sills = [[1.05, 1.3], [2.7, 2.95]], zc = 0.38;
  if (state === 'foundation') { // sills and cross beams laid out, the stock beside them
    for (const [a, b] of sills) out.push(box(-0.2, 6.2, a, b, 0, 0.24, timber(2, 1)));
    for (const x of [0.3, 2.6, 5.0]) out.push(box(x, x + 0.22, 1.3, 2.7, 0, 0.2, timber(3, 2)));
    out.push(box(0.2, 5.8, 3.3, 3.62, 0, 0.26, timber(2, 3)));
    return out;
  }
  // chassis on four low solid wheels
  for (const wx of [0.6, 5.3]) for (const [a, b] of [[0.86, 1.04], [2.96, 3.14]]) {
    if (gone && wx > 5 && a > 2) continue;
    out.push(...rodY(wx, zc, 0.38, a, b, wheelMat(wx, zc)).map((c) => (gone ? { ...c, z1: Math.max(0.05, c.z1 - 0.15), z0: Math.max(0, c.z0 - 0.15) } : c)));
  }
  for (const [a, b] of sills) out.push(box(-0.2, 6.2, a, b, gone ? 0.05 : 0.4, gone ? 0.3 : 0.64, timber(2, 1)));
  if (!gone) for (const x of [0.3, 2.6, 5.0]) out.push(box(x, x + 0.22, 1.3, 2.7, 0.42, 0.62, timber(3, 2)));
  if (gone) { // burnt out: the stock broken across the chassis, the spring frame fallen, an arm on the ground
    out.push(...seg([0.2, 0.35], [3.4, 0.9], 0.26, 1.85, 2.15, timber(1, 4)), ...seg([3.6, 0.3], [5.9, 0.6], 0.26, 1.9, 2.2, timber(1, 4)));
    out.push(box(4.3, 4.6, 1.2, 2.9, 0.3, 0.55, timber(1, 5)), ...cylZ(4.7, 1.55, 0.16, 0.3, 0.75, solid(mul(ROPE[0], 0.5))), box(4.4, 4.75, 2.6, 3.0, 0.1, 0.9, timber(1, 5)));
    out.push(...segXY([4.6, 3.3], [3.4, 3.7], 0.14, 0.05, 0.22, timber(1, 7)));
    return out;
  }
  // trestles carrying the stock
  for (const x of [0.7, 2.7, 4.2]) out.push(box(x, x + 0.2, cy - 0.12, cy + 0.12, 0.62, TH.tr[0], timber(2, 3)));
  if (state === 'rising') return out;
  // the stock (trough), its groove darker
  out.push(box(-0.1, 6.3, cy - 0.21, cy + 0.21, TH.tr[0], TH.tr[1], (f, x, y, z) => (f === 'top' && Math.abs(y - cy) < 0.07 ? mul(W()[0], 0.8) : timber(3, 4)(f, x, y, z))));
  // the spring frame: bottom beam under the stock, top beam, outer and middle stiles; the skeins between them
  const fx = [TH.sk - 0.22, TH.sk + 0.22];
  out.push(box(fx[0], fx[1], 1.1, 2.9, 1.36, 1.58, timber(2, 5)));
  for (const [a, b] of [[1.1, 1.28], [2.72, 2.9], [1.86, 2.14]]) out.push(box(fx[0], fx[1], a, b, a > 1.5 && a < 2.5 ? TH.tr[1] : 0.64, 2.56, timber(2, 5)));
  out.push(box(fx[0] - 0.05, fx[1] + 0.05, 1.05, 2.95, 2.56, 2.74, timber(3, 5)));
  out.push(...[0.98, 5.9].map((x) => box(x, x + 0.18, cy - 0.3, cy + 0.3, 0.62, 1.2, timber(2, 6)))); // the stock's end blocks
  if (state === 'scaffold') { out.push(...segXY([0.6, 3.4], [2.0, 3.6], 0.14, 0, 0.16, timber(2, 7)), ...segXY([2.4, 3.4], [3.8, 3.6], 0.14, 0, 0.16, timber(2, 7))); return out; } // the arms lie by it, not yet fitted
  for (const y of TH.skY) out.push(...cylZ(TH.sk, y, 0.16, 1.58, 2.56, skeinMat), ...cylZ(TH.sk, y, 0.22, 2.74, 2.84, bronze), box(TH.sk - 0.3, TH.sk + 0.3, y - 0.04, y + 0.04, 2.84, 2.9, bronze)); // skeins, washers, levers
  // the winch at the back: a drum on two cheeks, spokes
  for (const y of [1.5, 2.36]) out.push(box(0.12, 0.62, y, y + 0.14, 0.64, 1.45, timber(2, 6)));
  out.push(...rodY(0.38, 1.25, 0.15, 1.64, 2.36, timber(1, 6)));
  for (const [a, b] of [[1.6, 2.55], [0.9, 1.6]]) out.push(...seg([0.38, 1.25], [0.38 + (b - 1.25) * 0.4, b], 0.06, a < 1 ? 1.42 : 2.38, a < 1 ? 1.48 : 2.44, timber(3, 6)));
  // moving: arms, string, slider with its claw, the stone
  const tips = [0, 1].map((s) => armTip(s, deg));
  for (const s of [0, 1]) out.push(...segXY([TH.sk, TH.skY[s]], tips[s], 0.13, TH.zA[0], TH.zA[1], timber(2, 8)).map(mv), ...cylZ(tips[s][0], tips[s][1], 0.08, TH.zA[0] - 0.02, TH.zA[1] + 0.02, iron).map(mv));
  for (const s of [0, 1]) out.push(...segXY(tips[s], [claw, cy], 0.035, TH.zS[0], TH.zS[1], rope, 1 / 32).map(mv));
  out.push(mv(box(claw - 0.05, claw + 1.3, cy - 0.12, cy + 0.12, TH.tr[1], TH.tr[1] + 0.12, timber(3, 9))), mv(box(claw - 0.12, claw + 0.06, cy - 0.08, cy + 0.08, TH.tr[1], TH.tr[1] + 0.24, iron)));
  if (loaded) out.push(...ball(claw + 0.22, cy, TH.tr[1] + 0.29, 0.17, stoneShot).map(mv));
  return out;
}
// arm sweep, claw x, stone in the slider: drawn and loaded, the trigger, the arms flying forward, the release, overshoot, settle
const THROW = [[72, 1.9, 1], [72, 1.9, 1], [50, 3.0, 1], [25, null, 0], [14, null, 0], [30, null, 0], [22, null, 0], [25, null, 0]].map(([deg, c, l]) => ({ deg, claw: c ?? armTip(0, deg)[0], loaded: !!l }));
const THROW_RELEASE = 3;
const THROW_FROM = [4.9, 2.0, 2.15]; // where the stone leaves (local m): over the stock, in front of the string

// ---- siege ladders: long (stone wall) and short (rampart), leaning on a face, carried flat, pushed off and lying broken.
// Built with the wall face at u = 2 (x) of the ladder's own tile, across v (y); turned to the face's side like the build
// ladder kit (n -y, e +x, s +y, w -x).
const LT = Object.fromEntries(['stone-wall', 'rampart'].map((id) => { const K = B.kits.find((q) => q.id === id); return [id, { walkM: K.walkwayM, walkPx: K.walkwayPx, topM: +(K.walkwayM + K.parapetM + 0.3).toFixed(2) }]; }));
for (const t of Object.values(LT)) { t.footM = +Math.max(1.0, t.topM * 0.3).toFixed(2); t.len = +Math.hypot(t.topM, t.footM).toFixed(2); }
const sideTurn = (side) => (b) => (side === 'e' ? b : side === 'w' ? { ...b, x0: 2 - b.x1, x1: 2 - b.x0 } : side === 's' ? { ...b, x0: b.y0, x1: b.y1, y0: b.x0, y1: b.x1 } : { ...b, x0: b.y0, x1: b.y1, y0: 2 - b.x1, y1: 2 - b.x0 });
// a ladder of length len from its foot (u, 0) at angle phi to the ground (towards +u); broken: rungs and the top missing
function ladderBoxes(len, u0, phi, { broken = false, k = 3, v0 = 0.62 } = {}) {
  const c = Math.cos(phi), s = Math.sin(phi), P = (t) => [u0 + t * c, t * s], out = [], v1 = v0 + 0.76, lt = broken ? len * 0.72 : len;
  for (const [a, b] of [[v0, v0 + 0.13], [v1 - 0.13, v1]]) out.push(...seg(P(0), P(a < 1 ? lt : len * 0.92), 0.13, a, b, timber(2, k)));
  for (let t = 0.3; t < lt - 0.1; t += 0.36) { if (broken && hash(Math.floor(t * 3), k, 51) < 0.25) continue; const [u, z] = P(t); out.push(box(u - 0.045, u + 0.045, v0 + 0.1, v1 - 0.1, Math.max(0, z - 0.045), z + 0.045, timber(3, k + 1))); }
  if (!broken) { const [u, z] = P(len); for (const v of [v0, v1 - 0.1]) out.push(...seg([u, z], [u + 0.18 * s, z - 0.18 * c + 0.12], 0.07, v, v + 0.1, solid([58, 54, 52, 255]))); } // iron hooks at the head
  return out;
}

// ---- rubble: breaches through a wall (1 tile along the run x the wall's depth) and fallen towers (2 x 2), walkable heaps.
// The heap profile across the wall depends on depth only at the run ends, so neighbouring breach tiles join.
function breachBoxes(material, deep, k) {
  const Dm = deep * 2, out = [], env = (u) => Math.min(1, u / 0.5, (2 - u) / 0.5), hc = (v) => { const t = Math.abs(v - Dm / 2) / (Dm / 2 + 0.7); return t >= 1 ? 0 : (material === 'stone' ? 1.25 : 0.55) * (1 - t * t); };
  if (material === 'stone') {
    const m = rubMat(k);
    out.push(...cells(0, 2, -0.7, Dm + 0.7, (x, y, i, j) => { const h = hc(y) * (0.78 + 0.22 * env(x) * (2 * hash(i, j, k) - 1)) * (0.75 + 0.25 * hash(i >> 1, j >> 1, k + 1)); return h > 0.05 ? { z0: 0, z1: h, mat: m } : null; }, 0.2));
    for (let i = 0; i < 3; i++) { const u = 0.25 + 1.1 * hash(i, k, 61), v = 0.2 + (Dm - 1) * hash(i, k, 62), sz = 0.45 + 0.25 * hash(i, k, 63); out.push(box(u, u + sz * 1.3, v, v + sz, hc(v) * 0.6, hc(v) * 0.6 + sz * 0.7, masonry(TEX.cyclo, { row0: 30 + i * 41, top: rough }))); }
  } else {
    const m = (f, x, y, z) => mul(W()[Math.floor(hash(Math.floor(x * 5), Math.floor(y * 5), k) * 2)], 0.55 + 0.3 * hash(Math.floor(x * 9), Math.floor(y * 9), k + 2));
    out.push(...cells(0, 2, -0.4, Dm + 0.4, (x, y, i, j) => { const h = hc(y) * (0.6 + 0.4 * hash(i, j, k)); return h > 0.04 ? { z0: 0, z1: h, mat: m } : null; }, 0.25));
    for (let i = 0; i < 2 + deep; i++) { const v = 0.1 + (Dm - 0.4) * hash(i, k, 64), z = hc(v) * 0.8; out.push(...seg([-0.1 + 0.3 * hash(i, k, 65), z], [2.1 - 0.3 * hash(i, k, 66), z + 0.15], 0.26, v, v + 0.26, timber(i % 2, 8))); }
    for (let i = 0; i < 2; i++) { const u = 0.3 + 1.2 * hash(i, k, 67); out.push(box(u, u + 0.26, Dm / 2 - 0.13, Dm / 2 + 0.13, 0, 0.4 + 0.5 * hash(i, k, 68), timber(1, 9))); } // stumps
  }
  return out;
}
function towerRubble(material, k) {
  const out = [];
  if (material === 'stone') {
    const m = rubMat(k);
    out.push(...cells(-0.6, 4.6, -0.6, 4.6, (x, y, i, j) => { const d = Math.hypot(x - 2, y - 2) / 2.9; if (d >= 1) return null; const h = 2.0 * (1 - d * d) * (0.65 + 0.35 * hash(i, j, k)); return h > 0.05 ? { z0: 0, z1: h, mat: m } : null; }, 0.22));
    for (const [x, y, w] of [[0, 0, 4], [0, 0, 0.6]]) out.push(box(x, x + w, y, y + 0.6, 0, 1.1 + 0.3 * hash(w, k, 3), masonry(TEX.cyclo, { row0: 12, top: rough }))); // the socle's back corner still standing
    out.push(box(0, 0.6, 0, 4, 0, 1.2, masonry(TEX.cyclo, { row0: 60, top: rough })));
    for (let i = 0; i < 4; i++) { const u = 0.4 + 3 * hash(i, k, 71), v = 0.4 + 3 * hash(i, k, 72), sz = 0.5 + 0.3 * hash(i, k, 73); out.push(box(u, u + sz * 1.3, v, v + sz, 1.0, 1.0 + sz * 0.7, masonry(TEX.iso, { row0: 20 + i * 33, top: rough }))); }
    out.push(...seg([0.6, 1.9], [3.2, 0.5], 0.18, 1.6, 1.78, timber(1, 4)), ...seg([1.2, 1.6], [3.8, 0.3], 0.18, 2.6, 2.78, timber(1, 5))); // charred floor beams
  } else {
    const m = (f, x, y, z) => mul(W()[Math.floor(hash(Math.floor(x * 5), Math.floor(y * 5), k) * 2)], 0.5 + 0.3 * hash(Math.floor(x * 9), Math.floor(y * 9), k + 2));
    out.push(...cells(-0.4, 4.4, -0.4, 4.4, (x, y, i, j) => { const d = Math.hypot(x - 2, y - 2) / 2.6; if (d >= 1) return null; const h = 0.8 * (1 - d * d) * (0.5 + 0.5 * hash(i, j, k)); return h > 0.04 ? { z0: 0, z1: h, mat: m } : null; }, 0.25));
    for (const [x, y, h] of [[0.1, 0.1, 1.6], [3.6, 0.1, 0.7], [0.1, 3.6, 1.0], [3.6, 3.6, 0.4]]) out.push(box(x, x + 0.3, y, y + 0.3, 0, h, timber(1, 6))); // post stumps
    for (let i = 0; i < 5; i++) { const v = 0.3 + 3.2 * hash(i, k, 74), z = 0.5 + 0.3 * hash(i, k, 77); out.push(...seg([-0.3 + 0.8 * hash(i, k, 75), z], [4.2 - 0.8 * hash(i, k, 76), z + 0.3 * hash(i, k, 78)], 0.24, v, v + 0.24, timber(i % 2, 7))); }
  }
  return out;
}

// ---- render: frames on one canvas, cropped to their union; tileOrigin = px of world (0, 0, 0) (the footprint's top vertex)
const charImg = (im, k, f = 0.5) => scorch(im, k, f);
function renderSet(boxSets, Hm, post = null, pad = 220) {
  const W0 = 2 * pad + 8 * 32, ox = pad + 4 * 32, oy = Math.ceil(Hm * PPM) + 40, H0 = oy + 8 * 16 + pad;
  const ims = boxSets.map((bs, i) => { let im = renderBoxes(bs, W0, H0, ox, oy); if (post) im = post(im, i); return im; });
  const bb = ims.map((im) => alphaBox(im, 1)).filter((b) => b.w > 0);
  const x0 = Math.min(...bb.map((b) => b.x)), y0 = Math.min(...bb.map((b) => b.y)), x1 = Math.max(...bb.map((b) => b.x + b.w)), y1 = Math.max(...bb.map((b) => b.y + b.h));
  return { ims: ims.map((im) => crop(im, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 })), tileOrigin: { x: ox - x0, y: oy - y0 } };
}
const one = (bs, Hm, post) => { const r = renderSet([bs], Hm, post && ((im) => post(im))); return { im: r.ims[0], tileOrigin: r.tileOrigin }; };
const strip = (ims) => { const s = blank(ims[0].w * ims.length, ims[0].h); ims.forEach((im, i) => paste(s, im, i * im.w, 0)); return s; };

const sprites = [], sheets = []; // sprites: { meta, im }; sheets: { file, im }
function sprite(id, kind, r, fp, extra = {}) {
  const a = footOf(r.im), base = Math.min((fp[0] + fp[1]) * 16, r.im.h - 4);
  sprites.push({ im: r.im, meta: { id, kind, file: `${id}.png`, w: r.im.w, h: r.im.h, metres: Math.max(0.05, +((r.im.h - base) / PPM).toFixed(2)), basePx: base, anchor: a, tileOrigin: r.tileOrigin, footprint: fp, blocksMovement: false, ...extra } });
  return id;
}
const postOf = (state, k) => (state === 'damaged' ? (im) => charImg(im, k, 0.8) : state === 'destroyed' ? (im) => burn(im, k) : null);

// ---- PixelLab paint: each engine's body (done, at rest, without its moving parts) is rendered per facing on the fixed
// canvas, cropped (raw/paint-in/<id>.png) and repainted by one Pro Flash edit (raw/paint/<id>.png, same size); the moving
// parts (`mv`: the ram's log, the thrower's arms, string, slider, stone) are drawn over it by the renderer wherever the
// full render shows them (found with a marker material). Without a painted file the box render stands in.
const PAINT = join(PIX, 'siege/raw/paint'), PAINT_IN = join(PIX, 'siege/raw/paint-in'), MARK = [255, 0, 255, 255], missing = [];
const canvasOf = (Hm, pad = 220) => { const W0 = 2 * pad + 8 * 32, ox = pad + 4 * 32, oy = Math.ceil(Hm * PPM) + 40; return { W0, H0: oy + 8 * 16 + pad, ox, oy }; };
const full = (bs, C) => renderBoxes(bs, C.W0, C.H0, C.ox, C.oy);
const isMark = (d, i) => d[i + 3] && d[i] === 255 && d[i + 1] === 0 && d[i + 2] === 255;
// src: the painted file to use (the ram's shed is symmetric: w and n use the e and s paint at their own place)
function paint(id, im, src = id) {
  const b = alphaBox(im, 1), x = b.x - 2, y = b.y - 2, w = Math.ceil((b.w + 4) / 4) * 4, h = Math.ceil((b.h + 4) / 4) * 4;
  mkdirSync(PAINT_IN, { recursive: true });
  writeImage(join(PAINT_IN, `${id}.png`), crop(im, { x, y, w, h }));
  const f = join(PAINT, `${src}.png`);
  if (!existsSync(f)) { missing.push(src); return im; }
  const p = readImage(f), out = blank(im.w, im.h);
  for (let yy = 0; yy < p.h; yy++) for (let xx = 0; xx < p.w; xx++) { const s = (yy * p.w + xx) * 4; if (p.data[s + 3] >= 128) out.data.set([p.data[s], p.data[s + 1], p.data[s + 2], 255], ((y + yy) * im.w + x + xx) * 4); }
  return out;
}
// the painted body (where keep(i), e.g. one layer of it) with the moving parts of boxes `bs` over it
function compose(body, bs, C, keep = null) {
  const n = full(bs, C), m = full(bs.map((b) => (b.mv ? { ...b, mat: () => MARK, lit: true } : b)), C), out = blank(body.w, body.h);
  for (let i = 0; i < out.data.length; i += 4) {
    if (isMark(m.data, i)) out.data.set(n.data.subarray(i, i + 4), i);
    else if (body.data[i + 3] && (!keep || keep(i))) out.data.set(body.data.subarray(i, i + 4), i);
  }
  return out;
}
// full-canvas images cropped to their union (as renderSet)
function cropSet(ims, C) {
  const bb = ims.map((im) => alphaBox(im, 1)).filter((b) => b.w > 0);
  const x0 = Math.min(...bb.map((b) => b.x)), y0 = Math.min(...bb.map((b) => b.y)), x1 = Math.max(...bb.map((b) => b.x + b.w)), y1 = Math.max(...bb.map((b) => b.y + b.h));
  return { ims: ims.map((im) => crop(im, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 })), tileOrigin: { x: C.ox - x0, y: C.oy - y0 } };
}
const cropOne = (im, C) => { const r = cropSet([im], C); return { im: r.ims[0], tileOrigin: r.tileOrigin }; };

// engines
const engines = [];
{ // ram
  const e = { id: 'ram', kind: 'ram', material: 'wood', burnable: true, layered: true, facings: FACINGS, heightM: RAM.ridge + 0.74, footprint: {}, crew: {}, states: {}, front: {}, anims: {}, buildOrder: BUILD_ORDER, progress: PROGRESS };
  for (const f of FACINGS) {
    const T = turn(f, RAM.L), fp = f === 'e' || f === 'w' ? RAM.fp : [RAM.fp[1], RAM.fp[0]], C = canvasOf(5);
    e.footprint[f] = fp; e.crew[f] = RAM_CREW.map(turnPt(f, RAM.L)).map(([x, y]) => [+(x / 2).toFixed(2), +(y / 2).toFixed(2)]);
    e.states[f] = {}; e.front[f] = {};
    const D = ramBoxes('done', 0), back = D.back.map(T), front = D.front.map(T);
    const body = paint(`ram-${f}`, full([...back, ...front].filter((b) => !b.mv), C), `ram-${{ w: 'e', n: 's' }[f] ?? f}`), fr = full(front, C);
    const inFront = (i) => fr.data[i + 3] > 0, inBack = (i) => !fr.data[i + 3];
    for (const s of STATES) {
      const L = ramBoxes(s, 0), post = postOf(s, 3 + FACINGS.indexOf(f)), isWood = { blocksMovement: s !== 'foundation', material: 'wood', burnable: true, engine: 'ram', facing: f, state: s };
      if (s === 'done' || s === 'damaged') { // painted
        const bk = compose(body, back, C, inBack), fo = compose(body, [], C, inFront);
        if (s === 'damaged') { const dm = full(L.front.map(T), C); for (let i = 0; i < fo.data.length; i += 4) if (fo.data[i + 3] && !dm.data[i + 3]) fo.data.set(mul(CHAR, 1 + 0.5 * hash(i, 3, 7)), i); } // holes burnt in the hides
        e.states[f][s] = sprite(`ram-${f}-${s}`, 'ram', cropOne(post ? post(bk) : bk, C), fp, { ...isWood, source: 'PixelLab Pro Flash paint over the renderer (log drawn)', layer: 'back' });
        e.front[f][s] = sprite(`ram-${f}-${s}-front`, 'ram', cropOne(post ? post(fo) : fo, C), fp, { ...isWood, source: 'PixelLab Pro Flash paint over the renderer', layer: 'front' });
        continue;
      }
      e.states[f][s] = sprite(`ram-${f}-${s}`, 'ram', one(L.back.map(T), 5, post), fp, { ...isWood, source: 'renderer (hide roof drawn)', layer: 'back' });
      if (L.front.length) e.front[f][s] = sprite(`ram-${f}-${s}-front`, 'ram', one(L.front.map(T), 5, post), fp, { ...isWood, source: 'renderer (hide roof drawn)', layer: 'front' });
    }
    // swing: the back layer per frame (the front layer is the done front sprite)
    const r = cropSet(RAM_SWING.map((sw) => compose(body, ramBoxes('done', sw).back.map(T), C, inBack)), C), file = `ram-${f}-swing.png`;
    sheets.push({ file, im: strip(r.ims) });
    e.anims[f] = { swing: { file, layer: 'back', front: e.front[f].done, frames: r.ims.length, fps: 10, frame: { w: r.ims[0].w, h: r.ims[0].h }, tileOrigin: r.tileOrigin, hitFrame: 6, logM: RAM_SWING } };
  }
  engines.push(e);
}
{ // stone thrower (lithobolos)
  const e = { id: 'thrower', kind: 'thrower', material: 'wood', burnable: true, layered: false, facings: FACINGS, heightM: 2.9, footprint: {}, states: {}, anims: {}, release: {}, buildOrder: BUILD_ORDER, progress: PROGRESS };
  for (const f of FACINGS) {
    const T = turn(f, TH.L), fp = f === 'e' || f === 'w' ? TH.fp : [TH.fp[1], TH.fp[0]], C = canvasOf(4);
    e.footprint[f] = fp; e.states[f] = {};
    const body = paint(`thrower-${f}`, full(throwerBoxes('done', THROW[0]).map(T).filter((b) => !b.mv), C));
    for (const s of STATES) {
      const post = postOf(s, 9 + FACINGS.indexOf(f)), meta = { blocksMovement: s !== 'foundation', material: 'wood', burnable: true, engine: 'thrower', facing: f, state: s };
      if (s === 'done' || s === 'damaged') { const im = compose(body, throwerBoxes('done', THROW[0]).map(T), C); e.states[f][s] = sprite(`thrower-${f}-${s}`, 'thrower', cropOne(post ? post(im) : im, C), fp, { ...meta, source: 'PixelLab Pro Flash paint over the renderer (arms, string, slider drawn)' }); continue; }
      e.states[f][s] = sprite(`thrower-${f}-${s}`, 'thrower', one(throwerBoxes(s).map(T), 4, post), fp, { ...meta, source: 'renderer' });
    }
    const r = cropSet(THROW.map((p) => compose(body, throwerBoxes('done', p).map(T), C)), C), file = `thrower-${f}-throw.png`;
    sheets.push({ file, im: strip(r.ims) });
    const [wx, wy] = turnPt(f, TH.L)([THROW_FROM[0], THROW_FROM[1]]);
    e.release[f] = { x: +(wx / 2).toFixed(2), y: +(wy / 2).toFixed(2), zM: THROW_FROM[2] };
    e.anims[f] = { throw: { file, frames: r.ims.length, fps: 12, frame: { w: r.ims[0].w, h: r.ims[0].h }, tileOrigin: r.tileOrigin, releaseFrame: THROW_RELEASE, idle: 'frame 0 (cocked, loaded) = the done sprite' } };
  }
  engines.push(e);
}
if (missing.length) console.warn(`siege: no PixelLab paint for ${[...new Set(missing)].join(', ')} (box render used; inputs in ${PAINT_IN})`);
// projectile: the stone shot (~0.34 m), with its ground shadow left to the renderer
const projectiles = [{ id: 'stone-shot', sprite: sprite('stone-shot', 'projectile', one(ball(1, 1, 0.2, 0.17, stoneShot), 1), [1, 1], { metresNote: 'diameter 0.34 m', source: 'renderer' }), diameterM: 0.34, spin: 'none (round)' }];
// fix the projectile metadata: it has no footprint diamond
{ const p = sprites.find((s) => s.meta.id === 'stone-shot').meta; p.basePx = 0; p.metres = +(p.h / PPM).toFixed(2); p.footprint = [1, 1]; }

// ladders
const ladders = { id: 'siege-ladder', material: 'wood', burnable: true, targets: LT, pieces: {}, carry: {}, pushOff: {}, note: '' };
for (const [t, L] of Object.entries(LT)) {
  const len = L.len, uf = 2 - L.footM, phi0 = Math.atan2(L.topM, L.footM);
  for (const side of ['n', 'e', 's', 'w']) {
    const M = sideTurn(side);
    ladders.pieces[`${t}-${side}`] = sprite(`ladder-${t}-${side}`, 'ladder', one(ladderBoxes(len, uf, phi0).map(M), L.topM + 1), [1, 1], { material: 'wood', burnable: true, target: t, side, state: 'raised', thin: true, source: 'renderer' });
    ladders.pieces[`${t}-${side}-down`] = sprite(`ladder-${t}-${side}-down`, 'ladder', one(ladderBoxes(len, uf, Math.PI, { broken: true }).map(M), 1), [1, 1], { material: 'wood', burnable: true, target: t, side, state: 'knocked-down', source: 'renderer' });
    const ph = [phi0, 1.4, 1.66, 2.0, 2.45, 2.85, Math.PI], r = renderSet(ph.map((p, i) => ladderBoxes(len, uf, p, { broken: i === ph.length - 1 }).map(M)), L.topM + 1), file = `ladder-${t}-${side}-pushoff.png`;
    sheets.push({ file, im: strip(r.ims) }); ladders.pushOff[`${t}-${side}`] = { file, frames: ph.length, fps: 8, frame: { w: r.ims[0].w, h: r.ims[0].h }, tileOrigin: r.tileOrigin };
  }
  for (const ax of ['x', 'y']) { // carried flat (drawn lifted by carryPx), bearers on both sides
    const n = Math.ceil(len / 2), M = ax === 'x' ? (b) => b : sideTurn('s');
    const bearers = [0.15, 0.38, 0.62, 0.85].map((q, i) => [0.1 + q * len, i % 2 ? 1.62 : 0.38]).map(([u, v]) => (ax === 'x' ? [u / 2, v / 2] : [v / 2, u / 2]).map((c) => +c.toFixed(2)));
    ladders.carry[`${t}-${ax}`] = { sprite: sprite(`ladder-${t}-carry-${ax}`, 'ladder', one(ladderBoxes(len, 0.1, 0, { v0: 0.62 }).map(M), 1), ax === 'x' ? [n, 1] : [1, n], { material: 'wood', burnable: true, target: t, state: 'carried', source: 'renderer' }), footprint: ax === 'x' ? [n, 1] : [1, n], carryM: 1.45, carryPx: Math.round(1.45 * PPM), bearers };
  }
}
ladders.note = 'pieces <target>-<side>: on the ladder\'s own tile, leaning on the wall face on that side (n -y, e +x, s +y, w -x; inside or outside = the side), foot footM from the face, head at topM (walk + parapet + 0.3 m); a climber at height z stands footM x (1 - z / topM) out from the face. -down: knocked down, lying broken away from the wall (spills ~3 tiles out). pushOff: the fall from raised to down. carry: lying flat, drawn carryPx above the ground over its footprint, bearers = tile offsets of the carrying men.';

// rubble
const rubble = [];
for (const [mat, deep, kitId] of [['stone', 2, 'stone-wall'], ['wood', 2, 'rampart'], ['wood', 1, 'palisade']]) for (const ax of ['x', 'y']) for (const v of ['a', 'b']) {
  const k = 80 + (v === 'b' ? 7 : 0) + deep, M = ax === 'x' ? (b) => b : sideTurn('s'), fp = ax === 'x' ? [1, deep] : [deep, 1], id = `breach-${kitId}-${ax}-${v}`;
  rubble.push({ id, wall: kitId, axis: ax, variant: v, footprint: fp, walkable: true, sprite: sprite(id, 'rubble', one(breachBoxes(mat, deep, k).map(M), 2, mat === 'wood' ? (im) => burn(im, k) : null), fp, { material: mat, burnable: false, source: 'renderer + cyclopean elevation' }) });
}
for (const mat of ['stone', 'wood']) { const id = `tower-rubble-${mat}`; rubble.push({ id, tower: `tower-${mat}`, footprint: [2, 2], walkable: true, sprite: sprite(id, 'rubble', one(towerRubble(mat, 90), 3, mat === 'wood' ? (im) => burn(im, 90) : null), [2, 2], { material: mat, burnable: false, source: 'renderer + cyclopean / isodomic elevations' }) }); }

// ---- FX: vfx_workbench exports (grid sheets) -> horizontal strips trimmed to the union of their frames
const FX = [ // old: the v1 flames / smoke / embers, replaced by fire.mjs; read only so the shared palette stays put
  { old: true, id: 'flame-s', raw: 'flame-s', w: 38, h: 39, n: 8, fps: 12, anchor: [19, 34], use: 'small burning piece (a ladder, a cart, one log); ~0.7 m' },
  { old: true, id: 'flame-m', raw: 'flame-m', w: 38, h: 39, n: 8, fps: 12, anchor: [19, 34], use: 'a burning wall tile, an engine on fire; ~1.1 m' },
  { old: true, id: 'flame-l', raw: 'flame-l', w: 63, h: 65, n: 8, fps: 12, anchor: [31, 58], use: 'a blaze (a ram, a tower, a gate); ~1.9 m' },
  { old: true, id: 'smoke', raw: 'smoke', w: 52, h: 163, n: 16, fps: 10, anchor: [26, 162], use: 'smoke plume over a fire, ~4.9 m' },
  { old: true, id: 'embers', raw: 'embers', w: 55, h: 86, n: 12, fps: 12, anchor: [24, 80], use: 'embers rising over a fire or a burnt piece' },
  { id: 'fire-arrow-trail', raw: 'arrow-trail', w: 44, h: 18, n: 8, fps: 12, anchor: [41, 10], use: 'trail behind a fire arrow; drawn flying +x (head at the anchor), rotate to the flight' },
  { id: 'scorch', raw: 'scorch', w: 61, h: 27, n: 12, fps: 10, anchor: [31, 14], decal: true, use: 'ground decal, smouldering loop' },
];
const fx = [], oldFx = [];
for (const f of FX) {
  const raw = readImage(join(FXRAW, `${f.raw}.png`)), cols = Math.floor(raw.w / f.w);
  let ims = [...Array(f.n)].map((_, i) => crop(raw, { x: (i % cols) * f.w, y: Math.floor(i / cols) * f.h, w: f.w, h: f.h }));
  ims.forEach((im) => { for (let i = 3; i < im.data.length; i += 4) im.data[i] = im.data[i] >= 128 ? 255 : 0; });
  const bb = ims.map((im) => alphaBox(im, 1)).filter((b) => b.w > 0), x0 = Math.min(...bb.map((b) => b.x)), y0 = Math.min(...bb.map((b) => b.y)), x1 = Math.max(...bb.map((b) => b.x + b.w)), y1 = Math.max(...bb.map((b) => b.y + b.h));
  ims = ims.map((im) => crop(im, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }));
  if (f.old) { oldFx.push(strip(ims)); continue; }
  const file = `fx-${f.id}.png`; sheets.push({ file, im: strip(ims) });
  fx.push({ id: f.id, file, frames: f.n, fps: f.fps, loop: true, frame: { w: x1 - x0, h: y1 - y0 }, anchor: { x: f.anchor[0] - x0, y: Math.min(f.anchor[1], y1 - 1) - y0 }, ...(f.decal && { decal: true }), use: f.use, source: `vfx_workbench (${f.raw})` });
  if (f.id === 'scorch') { // the cold decal: frame 0 with the hot reds burnt down to char
    const im = { w: ims[0].w, h: ims[0].h, data: new Uint8Array(ims[0].data) };
    for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3] && im.data[i] > im.data[i + 1] + 40) im.data.set(mul(CHAR, 1 + 0.4 * hash(i, 1, 2)), i);
    sheets.push({ file: 'fx-scorch-cold.png', im });
    fx.push({ id: 'scorch-cold', file: 'fx-scorch-cold.png', frames: 1, fps: 0, loop: false, frame: { w: im.w, h: im.h }, anchor: { x: f.anchor[0] - x0, y: f.anchor[1] - y0 }, decal: true, use: 'ground decal after a fire', source: 'vfx_workbench (scorch), cooled' });
  }
}

// ---- fire v2: procedural tongues, embers, glow, smoke wisps, smoulder, legacy clusters, charring overlays (fire.mjs)
const FIRE = fireArt(ROOT); fx.push(...FIRE.fx);

// ---- palette + write
const G = JSON.parse(readFileSync(join(ROOT, 'public/war/tiles/tiles.json'))), GO = JSON.parse(readFileSync(join(ROOT, 'public/war/objects/objects.json')));
const pal = extendPalette([...G.palette, ...GO.palette, ...B.palette], [...sprites.map((s) => s.im), ...sheets.map((s) => s.im), ...oldFx], 64);
const firePal = extendPalette(pal, FIRE.sheets.map((s) => s.im), 16); // fire colours added after: the other art's palette stays put
mkdirSync(OUT, { recursive: true });
for (const s of sprites) writeImage(join(OUT, s.meta.file), snapToPalette(s.im, pal));
for (const s of sheets) writeImage(join(OUT, s.file), snapToPalette(s.im, pal));
for (const s of FIRE.sheets) writeImage(join(OUT, s.file), snapToPalette(s.im, firePal));
const json = {
  pxPerMetre: PPM, tileMetres: 2, borderMax: 0.75,
  note: 'Siege art (W-29). objects[]: every single sprite (anchor = foot; tileOrigin = px of the top vertex of the footprint\'s north tile: draw at that tile\'s top vertex minus tileOrigin; metres = h above the footprint diamond basePx). engines[]: per facing (e +x, s +y, w -x, n -y: the way the ram / thrower points) footprint and states (buildOrder + progress as buildings, then damaged, destroyed); done = built and moving. Ram is layered: states = BACK sprite, front = FRONT sprite (roof, near side): draw back, the crew at crew[] (tile offsets from the footprint NW corner), then front. anims[facing]: horizontal strips (frame n at x = n * frame.w), drawn at their own tileOrigin: ram swing (back layer; hitFrame = the log fully out), thrower throw (frame 0 = cocked + loaded; releaseFrame: spawn stone-shot at release[facing], tile offsets + zM). ladders: see ladders.note. rubble[]: walkable heaps for breached wall tiles (wall run axis, the wall\'s depth across; variants a/b alternate along a run) and fallen towers. fx[]: looping strips with an anchor (flames and smoke: the anchor sits on the burning point; scorch decals on the ground). Colours = tiles.json palette + palette.',
  buildOrder: BUILD_ORDER, progress: PROGRESS,
  palette: firePal.slice(G.palette.length), engines, ladders, rubble, projectiles, fx, fireNote: FIRE_NOTE, char: FIRE.char,
  objects: sprites.map((s) => s.meta),
};
writeFileSync(join(OUT, 'objects.json'), JSON.stringify(json, null, 1) + '\n');
console.log(`siege: ${engines.length} engines, ${Object.keys(ladders.pieces).length} ladder pieces, ${rubble.length} rubble, ${fx.length} fx, ${sprites.length} sprites, ${sheets.length + FIRE.sheets.length} sheets, palette +${firePal.length - G.palette.length - GO.palette.length - B.palette.length}`);
process.exit(runSiegeQa().length ? 1 : 0);
