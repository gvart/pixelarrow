import { afterEach, beforeAll, describe, expect, it } from 'vitest';
// @ts-ignore -- node built-ins; the browser tsconfig has no @types/node
import { readFileSync } from 'node:fs';
// @ts-ignore
import { inflateSync } from 'node:zlib';
import { ANIM, BATTLE_RES, BATTLE_SCALE, dollGeom, dollKey, procColumn, renderFrame, renderFrameFx, renderPortrait, setSheetHook, type DollSpec } from '../src/art/paperdoll';
import { Pix } from '../src/art/pixels';
import { bronzeOf, ironOf } from '../src/art/materials';
import {
  ANIM_FALLBACK, SHEET_ANIMS, coreAnimOf, decodeSheetFrame, gearTier, metalSwap, parseManifest, resolveAnim, sheetFrameId, tierImage, type SheetAnim, type SheetManifest,
} from '../src/art/sheetManifest';
import { clearSheets, installSheetDolls, isSheetDoll, registerSheet, setSheetPixels, setSheetsEnabled, sheetFactor, sheetIndex, tierOfDoll } from '../src/art/sheetDoll';
import { ambientAt, attackAnimOf, chooseManAnim, pickDeathAnim, pickManAnim, type AnimTable, type ManState } from '../src/art/sheetAnim';

const LOOK = { skin: 1, hair: 1, hairStyle: 0, beard: 1, tunic: 'tunicRed' };
const HOPLITE: DollSpec = {
  look: LOOK,
  weapon: 'spear',
  shield: { art: 'hoplon' },
  helmet: { art: 'corinthian' },
  armor: 'cuirass',
  cls: 'hoplite',
  scale: BATTLE_SCALE,
  res: BATTLE_RES,
  gear: { weapon: { def: 'dory', r: 0 }, shield: { def: 'hoplon', r: 0 }, helmet: { def: 'pilos', r: 0 }, armor: { def: 'linothorax', r: 0 } },
};

const BRONZE_SRC = ['#ffeecc', '#ccaa88', '#886644'];

/** A tiny sheet: 8 x 10 frames, feet at (4, 9); every frame a 2 x 4 block whose colour encodes its column, a metal pixel on top. */
function tinySheet(anims: SheetManifest['anims']): { m: SheetManifest; px: Pix } {
  const m: SheetManifest = {
    version: 1,
    class: 'hoplite',
    frame: { w: 8, h: 10 },
    anchor: { x: 4, y: 9 },
    scale: 0.5,
    rows: ['south', 'south-east', 'north-east', 'south-west', 'north-west'],
    tiers: { basic: 'b.png', elite: 'e.png' },
    anims,
    metal: [{ kind: 'bronze', colors: BRONZE_SRC, slots: ['helmet'] }],
  };
  const cols = Math.max(...Object.values(anims).map((a) => a!.col + a!.frames));
  const px = new Pix(cols * 8, 5 * 10);
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < cols; c++) {
      for (let y = 5; y < 9; y++) for (let x = 3; x < 5; x++) px.set(c * 8 + x, r * 10 + y, (c << 16) | (r << 8) | 0x40);
      px.set(c * 8 + 4, r * 10 + 4, 0xccaa88);
    }
  return { m, px };
}

const FULL: SheetManifest['anims'] = {
  idle: { col: 0, frames: 4, fps: 4 },
  walk: { col: 4, frames: 8, fps: 12 },
  attack: { col: 12, frames: 5, fps: 14 },
  block: { col: 17, frames: 1, fps: 4 },
  hit: { col: 18, frames: 2, fps: 8 },
  die: { col: 20, frames: 4, fps: 12 },
  win: { col: 24, frames: 2, fps: 3 },
  thrust: { col: 26, frames: 6, fps: 14 },
  shoot: { col: 32, frames: 6, fps: 10, strike: 4 },
  look: { col: 38, frames: 4, fps: 3 },
  kneel: { col: 42, frames: 2, fps: 2 },
};

describe('sheet manifests', () => {
  it('checks a manifest and lists every problem', () => {
    expect(() => parseManifest(tinySheet(FULL).m)).not.toThrow();
    expect(() => parseManifest({ ...tinySheet(FULL).m, anims: { walk: { col: 0, frames: 2, fps: 4 } } })).toThrow(/idle is required/);
    expect(() => parseManifest({ ...tinySheet(FULL).m, anims: { idle: { col: 0, frames: 4, fps: 4 }, walk: { col: 2, frames: 4, fps: 4 } } })).toThrow(/overlaps/);
    expect(() => parseManifest({ ...tinySheet(FULL).m, facings: ['south', 'east', 'north', 'west'] })).toThrow(/facings/);
    expect(() => parseManifest({ ...tinySheet(FULL).m, metal: [{ kind: 'bronze', colors: ['red'] }] })).toThrow(/#rrggbb/);
  });

  it('falls back from every animation to one the sheet has, ending at idle', () => {
    for (const a of SHEET_ANIMS) expect(resolveAnim(a, (x) => x === 'idle')).toBe('idle');
    const has = (x: SheetAnim) => ['idle', 'attack', 'block', 'run', 'walk', 'win', 'hit', 'die', 'dieB'].includes(x);
    expect(resolveAnim('thrust', has)).toBe('attack');
    expect(resolveAnim('brace', has)).toBe('block');
    expect(resolveAnim('cheer', has)).toBe('win');
    expect(resolveAnim('charge', has)).toBe('run');
    expect(resolveAnim('stagger', has)).toBe('hit');
    expect(resolveAnim('fallBack', has)).toBe('dieB');
    expect(resolveAnim('rout', has)).toBe('run');
    expect(resolveAnim('look', has)).toBe('idle');
    // no cycles: every chain ends
    for (const a of SHEET_ANIMS) expect(coreAnimOf(a)).toBeTruthy();
    expect(ANIM_FALLBACK.idle).toBeNull();
  });

  it('numbers sheet frames above the procedural columns, which they fall back to', () => {
    const id = sheetFrameId('thrust', 3);
    expect(id).toBeGreaterThan(1000);
    expect(decodeSheetFrame(id)).toEqual({ anim: 'thrust', i: 3 });
    expect(decodeSheetFrame(5)).toBeNull();
    expect(procColumn(id)).toBe(ANIM.attack[3]);
    expect(procColumn(sheetFrameId('cheer', 1))).toBe(ANIM.win[1]);
    expect(procColumn(sheetFrameId('look', 5))).toBe(ANIM.idle[1]);
    expect(procColumn(7)).toBe(7);
  });

  it('picks the gear tier from the mean item tier, rarity aside', () => {
    expect(gearTier([])).toBe('basic');
    expect(gearTier([1, 1, 1, 1])).toBe('basic');
    expect(gearTier([1, 2, 2, 2])).toBe('veteran');
    expect(gearTier([2, 2])).toBe('veteran');
    expect(gearTier([3, 3, 2, 2])).toBe('elite');
    expect(tierOfDoll(HOPLITE)).toBe('basic');
    expect(tierOfDoll({ ...HOPLITE, gear: { weapon: { def: 'bronze_dory', r: 4 }, shield: { def: 'aspis', r: 0 }, helmet: { def: 'corinthian', r: 0 }, armor: { def: 'cuirass', r: 0 } } })).toBe('elite');
    expect(tierOfDoll({ ...HOPLITE, gear: { weapon: { def: 'dory', r: 4 }, shield: { def: 'hoplon', r: 4 } } })).toBe('basic');
    const m = tinySheet(FULL).m;
    expect(tierImage(m, 'veteran')).toBe('basic');
    expect(tierImage(m, 'elite')).toBe('elite');
  });

  it('spreads the art metal over the rarity ramp', () => {
    const src = [0xffeecc, 0xccaa88, 0x886644];
    const legendary = metalSwap(src, bronzeOf(4).ramp);
    expect(legendary.get(0xffeecc)).toBe(bronzeOf(4).ramp[0]);
    expect(legendary.get(0xccaa88)).toBe(bronzeOf(4).ramp[2]);
    expect(legendary.get(0x886644)).toBe(bronzeOf(4).ramp[4]);
    expect(metalSwap([0x123456], ironOf(0).ramp).get(0x123456)).toBe(ironOf(0).ramp[0]);
  });
});

const man = (o: Partial<ManState> = {}): ManState => ({
  t: 10, id: 3, victory: false, sinceAtk: 99, shot: false, wc: 'spear', sinceBlock: 99, sinceHit: 99, stunned: false, routing: false, moving: false,
  running: false, charging: false, shieldWall: false, engaged: false, aimUntil: -1, pace: 1, ...o,
});

describe('sheet animation picker', () => {
  const T = FULL as AnimTable;
  it('maps weapon classes to their attacks', () => {
    expect(attackAnimOf('spear')).toBe('thrust');
    expect(attackAnimOf('lance')).toBe('thrust');
    expect(attackAnimOf('blade')).toBe('slash');
    expect(attackAnimOf('two')).toBe('slash');
    expect(attackAnimOf('bow')).toBe('shoot');
    expect(attackAnimOf('sling')).toBe('sling');
    expect(attackAnimOf('jav')).toBe('throw');
    expect(attackAnimOf('none')).toBe('attack');
  });

  it('maps sim states to animations in manFrame order', () => {
    const want = (o: Partial<ManState>) => chooseManAnim(man(o), T).want;
    expect(want({ victory: true })).toBe('cheer');
    expect(want({ sinceAtk: 0.1 })).toBe('thrust');
    expect(want({ sinceAtk: 0.1, wc: 'blade' })).toBe('slash');
    expect(want({ sinceAtk: 0.1, wc: 'bow' })).toBe('attack'); // an archer at close quarters jabs
    expect(want({ sinceAtk: 0.05, wc: 'bow', shot: true })).toBe('shoot');
    expect(want({ sinceBlock: 0.1 })).toBe('block');
    expect(want({ sinceBlock: 0.1, shieldWall: true })).toBe('brace');
    expect(want({ stunned: true })).toBe('stagger');
    expect(want({ sinceHit: 0.1 })).toBe('hit');
    expect(want({ routing: true, moving: true })).toBe('rout');
    expect(want({ moving: true })).toBe('walk');
    expect(want({ moving: true, running: true })).toBe('run');
    expect(want({ moving: true, charging: true })).toBe('charge');
    expect(want({ wc: 'bow', aimUntil: 0.3 })).toBe('shoot');
    expect(want({ shieldWall: true })).toBe('brace');
    expect(want({ engaged: true })).toBe('ready');
    // a finished attack gives way to the next state
    expect(want({ sinceAtk: 2, moving: true })).toBe('walk');
  });

  it('shows fallbacks where the sheet lacks an animation', () => {
    const pick = (o: Partial<ManState>) => pickManAnim(man(o), T);
    expect(pick({ victory: true }).anim).toBe('win');
    expect(pick({ sinceAtk: 0.1, wc: 'blade' }).anim).toBe('attack');
    expect(pick({ shieldWall: true }).anim).toBe('block');
    expect(pick({ moving: true, charging: true }).anim).toBe('walk'); // no charge, no run
    expect(pick({ stunned: true }).anim).toBe('hit');
    expect(pick({ engaged: true }).anim).toBe('idle');
    expect(pick({ sinceAtk: 0.1 })).toEqual({ anim: 'thrust', i: 1 });
  });

  it('times missile draws before the shot and the release after it', () => {
    // bow: aim 0.5 s before the shot through the frames up to the strike (4), the release from it
    expect(pickManAnim(man({ wc: 'bow', aimUntil: 0.49 }), T)).toEqual({ anim: 'shoot', i: 0 });
    expect(pickManAnim(man({ wc: 'bow', aimUntil: 0.01 }), T)).toEqual({ anim: 'shoot', i: 3 });
    expect(pickManAnim(man({ wc: 'bow', shot: true, sinceAtk: 0 }), T)).toEqual({ anim: 'shoot', i: 4 });
    expect(chooseManAnim(man({ wc: 'bow', shot: true, sinceAtk: 0.25 }), T).want).toBe('idle');
  });

  it('plays seeded ambient idles now and then, only those the sheet has', () => {
    let seen = 0;
    for (let t = 0; t < 200; t += 0.1) if (ambientAt(t, 5, T)) seen++;
    expect(seen).toBeGreaterThan(0);
    expect(seen).toBeLessThan(2000 * 0.5);
    for (let t = 0; t < 50; t += 0.1) expect(ambientAt(t, 5, { idle: T.idle })).toBeNull();
    // two men are not in step
    const a = Array.from({ length: 300 }, (_, i) => !!ambientAt(i * 0.1, 1, T));
    const b = Array.from({ length: 300 }, (_, i) => !!ambientAt(i * 0.1, 2, T));
    expect(a).not.toEqual(b);
  });

  it('falls forwards or backwards, and a knocked-out man kneels', () => {
    expect(pickDeathAnim(0, false, false, 1, T)).toEqual({ anim: 'die', i: 0 });
    expect(pickDeathAnim(5, false, false, 1, T)).toEqual({ anim: 'die', i: 3 });
    expect(pickDeathAnim(0.1, true, false, 1, T).anim).toBe('die'); // no dieB / fallBack on this sheet
    expect(pickDeathAnim(5, false, true, 1, T).anim).toBe('kneel');
    expect(pickDeathAnim(5, false, true, 1, { idle: T.idle, die: T.die }).anim).toBe('die');
  });
});

describe('sheet-backed figures', () => {
  beforeAll(() => installSheetDolls());
  afterEach(() => {
    clearSheets();
    setSheetsEnabled(true);
  });

  it('draws a class without a sheet exactly as before', () => {
    const militia = { ...HOPLITE, cls: 'militia' };
    setSheetHook(null);
    const before = { key: dollKey(militia), px: Array.from(renderFrame(militia, 5, 2).data), pt: Array.from(renderPortrait(militia, 0).data) };
    installSheetDolls();
    const { m, px } = tinySheet(FULL);
    registerSheet(m);
    setSheetPixels('hoplite', 'basic', px);
    expect(dollKey(militia)).toBe(before.key);
    expect(Array.from(renderFrame(militia, 5, 2).data)).toEqual(before.px);
    expect(Array.from(renderPortrait(militia, 0).data)).toEqual(before.pt);
    // a sheet class whose image is not loaded is procedural too
    clearSheets();
    registerSheet(m);
    expect(isSheetDoll(HOPLITE)).toBe(false);
    expect(dollKey(HOPLITE)).toBe((setSheetHook(null), dollKey(HOPLITE)));
    installSheetDolls();
  });

  it('cuts frames from the sheet with the feet on the procedural feet line', () => {
    const { m, px } = tinySheet(FULL);
    registerSheet(m);
    setSheetPixels('hoplite', 'basic', px);
    expect(dollKey(HOPLITE)).toMatch(/^sheet_hoplite\.basic_/);
    const g = dollGeom(HOPLITE);
    expect(sheetFactor(m, HOPLITE)).toBe(1); // 0.5 game px per art px, drawn at 2x
    const f = renderFrame(HOPLITE, sheetFrameId('thrust', 2), 2);
    expect([f.w, f.h]).toEqual([g.fw, g.fh]);
    // the block's bottom row (art y 8) sits just above the feet line, its left column (art x 3) one left of centre
    const cx = Math.floor(g.fw / 2);
    expect(f.alpha(cx - 1, g.footY - 1)).toBe(255);
    expect(f.alpha(cx, g.footY)).toBe(0);
    expect(f.alpha(cx - 3, g.footY - 1)).toBe(0);
    // column 26 + 2 of image row 3 (south-west: game row 2)
    expect(f.get(cx, g.footY - 2) >> 8).toBe((28 << 8) | 3);
    // a legacy column shows its state's sheet frame (walk3 -> walk 3 of 8)
    expect(sheetIndex(ANIM.walk[3], m.anims as AnimTable)).toEqual({ anim: 'walk', i: 3 });
    expect(sheetIndex(ANIM.run[0], m.anims as AnimTable)).toEqual({ anim: 'walk', i: 0 });
    // the screens' 1x figure snaps to whole art pixels
    expect(sheetFactor(m, { ...HOPLITE, res: 1, scale: 1 })).toBe(1);
    expect(sheetFactor({ ...m, scale: 1 }, HOPLITE)).toBe(2);
  });

  it('swaps the metal by rarity and marks rare+ metal for the glint', () => {
    const { m, px } = tinySheet(FULL);
    registerSheet(m);
    setSheetPixels('hoplite', 'basic', px);
    const g = dollGeom(HOPLITE);
    const cx = Math.floor(g.fw / 2);
    const at = (d: DollSpec) => renderFrameFx(d, 0, 0);
    const metalY = g.footY - 5; // art y 4, one rendered px per art px
    const common = at(HOPLITE);
    expect(common.px.get(cx, metalY)).toBe(bronzeOf(0).ramp[2]);
    expect(common.glint.alpha(cx, metalY)).toBe(0);
    const legend = { ...HOPLITE, gear: { ...HOPLITE.gear, helmet: { def: 'pilos', r: 4 } } };
    const l = at(legend);
    expect(l.px.get(cx, metalY)).toBe(bronzeOf(4).ramp[2]);
    expect(l.glint.alpha(cx, metalY)).toBe(255);
    expect(l.ring.alpha(cx - 2, g.footY - 2)).toBe(255);
    expect(dollKey(legend)).not.toBe(dollKey(HOPLITE));
    // a weapon's rarity does not touch the helmet group's metal
    expect(at({ ...HOPLITE, gear: { ...HOPLITE.gear, weapon: { def: 'dory', r: 4 } } }).px.get(cx, metalY)).toBe(bronzeOf(0).ramp[2]);
  });

  it('shows the tier image the gear calls for, and none when sheets are off', () => {
    const { m, px } = tinySheet(FULL);
    registerSheet(m);
    setSheetPixels('hoplite', 'basic', px);
    const elite = { ...HOPLITE, gear: { weapon: { def: 'bronze_dory', r: 0 }, shield: { def: 'aspis', r: 0 }, helmet: { def: 'corinthian', r: 0 }, armor: { def: 'cuirass', r: 0 } } };
    // elite not loaded yet: procedural
    expect(isSheetDoll(elite)).toBe(false);
    setSheetPixels('hoplite', 'elite', px);
    expect(dollKey(elite)).toMatch(/^sheet_hoplite\.elite_/);
    setSheetsEnabled(false);
    expect(isSheetDoll(elite)).toBe(false);
    expect(dollKey(elite)).toMatch(/^doll3_/);
  });

  it('cuts a portrait bust from the front idle frame', () => {
    const { m, px } = tinySheet(FULL);
    registerSheet(m);
    setSheetPixels('hoplite', 'basic', px);
    const p = renderPortrait(HOPLITE, 0, 2, 24);
    expect([p.w, p.h]).toEqual([48, 48]);
    let n = 0;
    for (let i = 3; i < p.data.length; i += 4) if (p.data[i]) n++;
    expect(n).toBeGreaterThan(50);
  });
});

/** Decode the placeholder PNG (8-bit RGBA, filter 0 rows: what scripts/dev/placeholder-sheet.mjs writes). */
function readPng(path: string): Pix {
  const buf = readFileSync(path);
  let o = 8;
  let w = 0;
  let h = 0;
  const idat: Uint8Array[] = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString('ascii', o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') [w, h] = [data.readUInt32BE(0), data.readUInt32BE(4)];
    if (type === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  const all = new Uint8Array(idat.reduce((n, d) => n + d.length, 0));
  idat.reduce((at, d) => (all.set(d, at), at + d.length), 0);
  const raw = inflateSync(all);
  const p = new Pix(w, h);
  for (let y = 0; y < h; y++) p.data.set(raw.subarray(y * (w * 4 + 1) + 1, (y + 1) * (w * 4 + 1)), y * w * 4);
  return p;
}

describe('the placeholder hoplite sheet', () => {
  beforeAll(() => installSheetDolls());
  afterEach(() => clearSheets());
  const dir = 'src/dev/sheets/hoplite/';

  it('is a valid manifest whose images fit it, with the tiers told apart', () => {
    const m = registerSheet(JSON.parse(readFileSync(`${dir}manifest.json`, 'utf8')));
    const imgs = (['basic', 'veteran', 'elite'] as const).map((t) => readPng(dir + m.tiers[t]));
    for (const p of imgs) {
      expect(p.w).toBeGreaterThanOrEqual(Math.max(...Object.values(m.anims).map((a) => a!.col + a!.frames)) * m.frame.w);
      expect(p.h).toBe(m.rows.length * m.frame.h);
    }
    expect(Array.from(imgs[0].data)).not.toEqual(Array.from(imgs[1].data));
    expect(Array.from(imgs[1].data)).not.toEqual(Array.from(imgs[2].data));
    // its metal is exactly the listed colours (the rarity swap finds every metal pixel)
    const metal = new Set(m.metal!.flatMap((g) => g.colors.map((c) => parseInt(c.slice(1), 16))));
    let hits = 0;
    for (let i = 0; i < imgs[0].data.length; i += 4) if (imgs[0].data[i + 3] && metal.has((imgs[0].data[i] << 16) | (imgs[0].data[i + 1] << 8) | imgs[0].data[i + 2])) hits++;
    expect(hits).toBeGreaterThan(1000);
    // drawn end to end: a battle frame of every animation it has, standing on the procedural feet line
    setSheetPixels('hoplite', 'basic', imgs[0]);
    for (const a of Object.keys(m.anims) as SheetAnim[]) {
      const f = renderFrame(HOPLITE, sheetFrameId(a, 0), 2);
      let lowest = -1;
      for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (f.alpha(x, y)) lowest = y;
      if (a === 'idle' || a === 'walk' || a === 'thrust' || a === 'brace') {
        // within a rendered pixel or two of the procedural figure's lowest pixel
        setSheetsEnabled(false);
        const p = renderFrame({ ...HOPLITE, cls: undefined }, ANIM.idle[0], 2);
        setSheetsEnabled(true);
        let pl = -1;
        for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.alpha(x, y)) pl = y;
        expect(Math.abs(lowest - pl)).toBeLessThanOrEqual(1);
      }
    }
  });
});
