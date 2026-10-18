import { afterEach, beforeAll, describe, expect, it } from 'vitest';
// @ts-ignore -- node built-ins; the browser tsconfig has no @types/node
import { readFileSync } from 'node:fs';
// @ts-ignore
import { inflateSync } from 'node:zlib';
import { ANIM, BATTLE_RES, BATTLE_SCALE, dollGeom, dollKey, procColumn, renderFrame, renderFrameFx, renderPortrait, setSheetHook, type DollSpec } from '../src/art/paperdoll';
import { Pix } from '../src/art/pixels';
import { bronzeOf, ironOf } from '../src/art/materials';
import {
  ANIM_FALLBACK, SHADE_STEPS, SHEET_ANIMS, SKIN_TONES, coreAnimOf, decodeSheetFrame, frameCell, gearTier, imageSize, metalSwap, parseManifest, recolorMap, resolveAnim, shadeColor,
  sheetFrameId, sheetVariant, type SheetAnim, type SheetManifest,
} from '../src/art/sheetManifest';
import { clearSheets, installSheetDolls, isSheetDoll, registerSheet, setSheetPixels, setSheetsEnabled, sheetFactor, sheetIndex, tierOfDoll } from '../src/art/sheetDoll';
import { ambientAt, attackAnimOf, chooseManAnim, holdFrame, newAnimMemory, pickDeathAnim, pickManAnim, type AnimTable, type ManState } from '../src/art/sheetAnim';

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
const CLOAK_SRC = ['#401010', '#802020'];
const CLOAK_ELITE = ['#101010', '#303030'];
const SKIN_SRC = ['#704030', '#c08060'];

/**
 * A tiny sheet: 8 x 10 frames, feet at (4, 9); every frame a 2 x 4 block whose
 * colour encodes its column, a metal pixel on top, a cloak pixel and a skin
 * pixel under it.
 */
function tinySheet(anims: SheetManifest['anims']): { m: SheetManifest; px: Pix } {
  const m: SheetManifest = {
    version: 2,
    class: 'hoplite',
    image: 'hoplite.png',
    frame: { w: 8, h: 10 },
    anchor: { x: 4, y: 9 },
    scale: 0.5,
    rows: ['south', 'south-east', 'north-east', 'south-west', 'north-west'],
    colorGroups: { cloak: CLOAK_SRC, skin: SKIN_SRC },
    tiers: { basic: {}, elite: { cloak: CLOAK_ELITE } },
    anims,
    metal: [{ kind: 'bronze', colors: BRONZE_SRC, slots: ['helmet'] }],
  };
  const cols = Math.max(...Object.values(anims).map((a) => a!.col + a!.frames));
  const px = new Pix(cols * 8, 5 * 10);
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < cols; c++) {
      for (let y = 5; y < 9; y++) for (let x = 3; x < 5; x++) px.set(c * 8 + x, r * 10 + y, (c << 16) | (r << 8) | 0x40);
      px.set(c * 8 + 4, r * 10 + 4, 0xccaa88);
      px.set(c * 8 + 3, r * 10 + 4, 0x802020);
      px.set(c * 8 + 3, r * 10 + 3, 0xc08060);
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
    expect(() => parseManifest({ ...tinySheet(FULL).m, version: 1 })).toThrow(/version must be 2/);
    expect(() => parseManifest({ ...tinySheet(FULL).m, image: undefined })).toThrow(/image missing/);
    expect(() => parseManifest({ ...tinySheet(FULL).m, tiers: { elite: { cloak: ['#000000'] } } })).toThrow(/tiers.elite.cloak must be 2/);
    expect(() => parseManifest({ ...tinySheet(FULL).m, tiers: { elite: { cape: ['#000000'] } } })).toThrow(/no such colour group/);
    expect(() => parseManifest({ ...tinySheet(FULL).m, colorGroups: { cloak: ['#ccaa88'] } })).toThrow(/also in metal/);
    expect(() => parseManifest({ ...tinySheet(FULL).m, colorGroups: { cloak: ['#123456'], crest: ['#123456'] } })).toThrow(/also in cloak/);
    expect(() => parseManifest({ ...tinySheet(FULL).m, anims: { idle: { col: 0, frames: 4, fps: 4, hold: 4 } } })).toThrow(/hold out of range/);
  });

  it('lays a wide sheet out in bands of every row', () => {
    const m = { ...tinySheet(FULL).m, wrap: 10 };
    expect(frameCell(m, 3, 2)).toEqual([24, 20]);
    expect(frameCell(m, 13, 2)).toEqual([24, 70]); // band 1 starts below the 5 rows of band 0
    expect(imageSize(m)).toEqual([80, 250]); // 44 columns: 5 bands
    expect(imageSize(tinySheet(FULL).m)).toEqual([44 * 8, 50]);
    expect(() => parseManifest({ ...m, wrap: 2.5 })).toThrow(/wrap/);
  });

  it('falls back from every animation to one the sheet has, ending at idle', () => {
    for (const a of SHEET_ANIMS) expect(resolveAnim(a, (x) => x === 'idle')).toBe('idle');
    const has = (x: SheetAnim) => ['idle', 'attack', 'block', 'run', 'walk', 'win', 'hit', 'die', 'dieB'].includes(x);
    expect(resolveAnim('thrust', has)).toBe('attack');
    expect(resolveAnim('brace', has)).toBe('block');
    expect(resolveAnim('cheer', has)).toBe('win');
    expect(resolveAnim('charge', has)).toBe('run');
    expect(resolveAnim('stagger', has)).toBe('hit');
    // new-only sheets: the pairs stand in for each other
    const neu = (x: SheetAnim) => ['idle', 'thrust', 'brace', 'stagger', 'fallFwd', 'fallBack', 'cheer', 'run'].includes(x);
    expect(resolveAnim('hit', neu)).toBe('stagger');
    expect(resolveAnim('block', neu)).toBe('brace');
    expect(resolveAnim('attack', neu)).toBe('thrust');
    expect(resolveAnim('die', neu)).toBe('fallFwd');
    expect(resolveAnim('dieB', neu)).toBe('fallBack');
    expect(resolveAnim('win', neu)).toBe('cheer');
    expect(resolveAnim('walk', neu)).toBe('run');
    expect(resolveAnim('ready', neu)).toBe('idle');
    expect(resolveAnim('fallBack', has)).toBe('dieB');
    expect(resolveAnim('rout', has)).toBe('run');
    expect(resolveAnim('look', has)).toBe('idle');
    // no cycles: every chain ends
    for (const a of SHEET_ANIMS) expect(coreAnimOf(a)).toBeTruthy();
    expect(ANIM_FALLBACK.idle).toEqual([]);
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
  });

  it('recolours the colour groups by tier, skin tone and shade step', () => {
    const m = tinySheet(FULL).m;
    const plain = { skin: 1, shade: 1 };
    expect(recolorMap(m, 'basic', plain).get(0x802020)).toBe(0x802020);
    expect(recolorMap(m, 'veteran', plain).get(0x802020)).toBe(0x802020); // no veteran recolour on this sheet
    expect(recolorMap(m, 'elite', plain).get(0x802020)).toBe(0x303030);
    expect(recolorMap(m, 'elite', plain).get(0x401010)).toBe(0x101010);
    // the skin takes the man's tone, the cloak his shade step (on top of the tier)
    expect(recolorMap(m, 'basic', { skin: 3, shade: 1 }).get(0xc08060)).toBe(SKIN_TONES[3](0xc08060));
    expect(recolorMap(m, 'basic', { skin: 3, shade: 1 }).get(0x802020)).toBe(0x802020);
    expect(recolorMap(m, 'elite', { skin: 1, shade: 2 }).get(0x802020)).toBe(shadeColor(0x303030, SHADE_STEPS[2]));
    // tones run fair to dark
    const lum = (c: number) => ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255);
    for (let i = 1; i < SKIN_TONES.length; i++) expect(lum(SKIN_TONES[i](0xc08060))).toBeLessThan(lum(SKIN_TONES[i - 1](0xc08060)));
  });

  it('gives each man a seeded variant from a bounded set', () => {
    expect(sheetVariant(2, 5)).toEqual(sheetVariant(2, 5));
    expect(sheetVariant(9, 0).skin).toBe(SKIN_TONES.length - 1);
    expect(sheetVariant(undefined, undefined).skin).toBe(1);
    const seen = new Set<string>();
    for (let seed = 0; seed < 200; seed++) for (let skin = 0; skin < 4; skin++) seen.add(JSON.stringify(sheetVariant(skin, seed)));
    expect(seen.size).toBe(SKIN_TONES.length * SHADE_STEPS.length);
    // the shade steps are spread over the seeds
    const shades = Array.from({ length: 300 }, (_, i) => sheetVariant(1, i).shade);
    for (let k = 0; k < SHADE_STEPS.length; k++) expect(shades.filter((x) => x === k).length).toBeGreaterThan(60);
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
    // a blow: the strike frame (thrust 6 frames: 3) at the sim's attack, the follow-through after it
    expect(pick({ sinceAtk: 0 })).toEqual({ anim: 'thrust', i: 3 });
    expect(pick({ sinceAtk: 0.1 })).toEqual({ anim: 'thrust', i: 4 });
  });

  it('winds a blow up so its strike frame meets the attack', () => {
    const pick = (o: Partial<ManState>) => pickManAnim(man({ engaged: true, ...o }), T);
    // thrust: 6 frames at 14 fps, strike 3: the windup is the last 3 / 14 s of the cooldown
    expect(pick({ swingIn: 0.5 }).anim).toBe('idle'); // not yet: the ready stance (idle on this sheet)
    expect(pick({ swingIn: 3 / 14 - 0.01 })).toEqual({ anim: 'thrust', i: 0 });
    expect(pick({ swingIn: 0.1 })).toEqual({ anim: 'thrust', i: 1 });
    expect(pick({ swingIn: 0 })).toEqual({ anim: 'thrust', i: 2 });
    expect(pick({ swingIn: 0, sinceAtk: 0 })).toEqual({ anim: 'thrust', i: 3 });
    // missile men jab without a windup; moving men walk on
    expect(pick({ swingIn: 0, wc: 'bow' }).anim).toBe('idle');
    expect(pick({ swingIn: 0, moving: true }).anim).toBe('walk');
  });

  it('runs strides on the stride clock and loops cleanly', () => {
    const W = { idle: T.idle, walk: { frames: 16, fps: 12 } } as AnimTable;
    // every frame of a 16-frame walk shows, in order, and wraps from 15 to 0
    const seq = Array.from({ length: 40 }, (_, k) => pickManAnim(man({ moving: true, stride: k / 12 / 0.92 + 0.0001, id: 0 }), W).i);
    for (let k = 1; k < seq.length; k++) expect((seq[k] - seq[k - 1] + 16) % 16).toBeLessThanOrEqual(1);
    expect(new Set(seq).size).toBe(16);
    // the stride clock, not the battle clock, sets the phase: a change of t alone does not move the foot
    expect(pickManAnim(man({ moving: true, stride: 2, t: 10 }), W)).toEqual(pickManAnim(man({ moving: true, stride: 2, t: 30 }), W));
  });

  it('plays the entry of a held clip once, then loops its hold', () => {
    const B = { idle: T.idle, brace: { frames: 6, fps: 10, hold: 3 } } as AnimTable;
    expect(holdFrame(0, B.brace!)).toBe(0);
    expect(holdFrame(0.25, B.brace!)).toBe(2);
    expect(holdFrame(0.35, B.brace!)).toBe(3);
    expect(holdFrame(0.65, B.brace!)).toBe(3); // 6 frames in: back to the hold's first
    const mem = newAnimMemory();
    const at = (t: number, o: Partial<ManState> = {}) => pickManAnim(man({ t, shieldWall: true, ...o }), B, mem).i;
    expect(at(10)).toBe(0);
    expect(at(10.25)).toBe(2);
    expect(at(10.45)).toBe(4);
    // a blow taken in the wall keeps the stance where it was
    expect(at(10.48, { sinceBlock: 0.05 })).toBe(4);
    expect(at(10.55)).toBe(5);
    // out of the wall for a while: the next brace steps in again
    pickManAnim(man({ t: 11.1, moving: true }), B, mem);
    expect(at(13)).toBe(0);
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
    setSheetPixels('hoplite', px);
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
    setSheetPixels('hoplite', px);
    expect(dollKey(HOPLITE)).toMatch(/^sheet_hoplite\.basic\.1\d_/);
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
    setSheetPixels('hoplite', px);
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

  it('recolours the one image by the tier the gear calls for and the man, and none when sheets are off', () => {
    const { m, px } = tinySheet(FULL);
    registerSheet(m);
    setSheetPixels('hoplite', px);
    // a seed whose shade step is none
    const plain = { ...HOPLITE, seed: Array.from({ length: 50 }, (_, i) => i).find((i) => sheetVariant(1, i).shade === 1) };
    const elite = { ...plain, gear: { weapon: { def: 'bronze_dory', r: 0 }, shield: { def: 'aspis', r: 0 }, helmet: { def: 'corinthian', r: 0 }, armor: { def: 'cuirass', r: 0 } } };
    const g = dollGeom(HOPLITE);
    const cx = Math.floor(g.fw / 2);
    const cloakAt = (d: DollSpec) => renderFrame(d, 0, 0).get(cx - 1, g.footY - 5);
    const skinAt = (d: DollSpec) => renderFrame(d, 0, 0).get(cx - 1, g.footY - 6);
    expect(cloakAt(plain)).toBe(0x802020);
    expect(cloakAt(elite)).toBe(0x303030);
    // the same frames, shaded per man: skin by his Look, cloak by his seed (each in the key)
    const dark = { ...plain, look: { ...LOOK, skin: 3 } };
    expect(skinAt(dark)).toBe(SKIN_TONES[3](0xc08060));
    expect(skinAt(plain)).toBe(0xc08060);
    expect(dollKey(dark)).not.toBe(dollKey(plain));
    const seeds = Array.from({ length: 12 }, (_, i) => ({ ...elite, seed: i }));
    expect(new Set(seeds.map(cloakAt)).size).toBe(SHADE_STEPS.length);
    expect(new Set(seeds.map(dollKey)).size).toBe(SHADE_STEPS.length);
    // rarity stays the metal swap on top of the tier
    const metalY = g.footY - 5;
    expect(renderFrame({ ...elite, gear: { ...elite.gear, helmet: { def: 'corinthian', r: 4 } } }, 0, 0).get(cx, metalY)).toBe(bronzeOf(4).ramp[2]);
    expect(dollKey(elite)).toMatch(/^sheet_hoplite\.elite\./);
    setSheetsEnabled(false);
    expect(isSheetDoll(elite)).toBe(false);
    expect(dollKey(elite)).toMatch(/^doll3_/);
  });

  it('widens the box for art reaching past it, with per-row anchors, about the same feet point', () => {
    const { m, px } = tinySheet(FULL);
    const base = dollGeom(HOPLITE);
    registerSheet(m);
    setSheetPixels('hoplite', px);
    expect(dollGeom(HOPLITE)).toEqual(base); // the tiny frame fits the procedural box
    // game row 2 (south-west) stands at art x 1: its block (art x 3..4) is drawn 2..3 px right of the feet
    clearSheets();
    const wide = { ...m, frame: { w: 8, h: 10 }, anchors: { 'south-west': { x: 1, y: 9 } }, scale: 6 };
    registerSheet(wide);
    setSheetPixels('hoplite', px);
    const g = dollGeom(HOPLITE);
    const k = sheetFactor(wide, HOPLITE);
    expect(k).toBe(12);
    expect(g.fw).toBeGreaterThan(base.fw);
    expect(g.footY).toBeGreaterThanOrEqual(9 * k);
    const f = renderFrame(HOPLITE, sheetFrameId('idle', 0), 2);
    const cx = Math.floor(g.fw / 2);
    expect([f.w, f.h]).toEqual([g.fw, g.fh]);
    expect(f.alpha(cx + 2 * k, g.footY - 1)).toBe(255);
    expect(f.alpha(cx + 4 * k - 1, g.footY - 1)).toBe(255);
    expect(f.alpha(cx + 1, g.footY - 1)).toBe(0);
    expect(() => parseManifest({ ...m, anchors: { east: { x: 1, y: 1 } } })).toThrow(/not a row/);
  });

  it('cuts a portrait bust from the front idle frame', () => {
    const { m, px } = tinySheet(FULL);
    registerSheet(m);
    setSheetPixels('hoplite', px);
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

  it('is one valid image with its colour groups and tier recolours', () => {
    const m = registerSheet(JSON.parse(readFileSync(`${dir}manifest.json`, 'utf8')));
    const img = readPng(dir + m.image);
    const [w, h] = imageSize(m);
    expect(img.w).toBeGreaterThanOrEqual(w);
    expect(img.h).toBe(h);
    // its metal and every colour group are exactly the listed colours (the swaps find their pixels)
    const count = (cs: string[]) => {
      const set = new Set(cs.map((c) => parseInt(c.slice(1), 16)));
      let n = 0;
      for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3] && set.has((img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2])) n++;
      return n;
    };
    expect(count(m.metal!.flatMap((g) => g.colors))).toBeGreaterThan(1000);
    for (const [name, cs] of Object.entries(m.colorGroups!)) expect(count(cs), name).toBeGreaterThan(name === 'trim' || name === 'crest' ? 100 : 1000);
    // the tiers are told apart by their recolour
    expect(Object.keys(m.tiers!.veteran!).length).toBeGreaterThan(0);
    expect(m.tiers!.elite!.cloak).not.toEqual(m.tiers!.veteran!.cloak);
    expect(m.anims.brace!.hold).toBeGreaterThan(0);
    // drawn end to end: a battle frame of every animation it has, standing on the procedural feet line
    setSheetPixels('hoplite', img);
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
