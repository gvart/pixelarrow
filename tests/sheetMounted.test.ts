import { afterEach, beforeAll, describe, expect, it } from 'vitest';
// @ts-ignore -- node built-ins; the browser tsconfig has no @types/node
import { readFileSync } from 'node:fs';
// @ts-ignore
import { inflateSync } from 'node:zlib';
import { ANIM, BATTLE_RES, BATTLE_SCALE, dollGeom, renderFrame, renderFrameFx, type DollSpec } from '../src/art/paperdoll';
import { Pix } from '../src/art/pixels';
import { bronzeOf } from '../src/art/materials';
import { ANIM_FALLBACK, SHEET_ANIMS, anchorOf, coreAnimOf, parseManifest, recolorMap, resolveAnim, sheetFrameId, sheetVariant, type SheetAnim, type SheetManifest } from '../src/art/sheetManifest';
import { clearSheets, installSheetDolls, registerSheet, setSheetPixels, setSheetsEnabled, sheetFactor } from '../src/art/sheetDoll';
import { attackWant, chooseManAnim, pickDeathAnim, pickManAnim, type AnimTable, type ManState } from '../src/art/sheetAnim';

const LOOK = { skin: 1, hair: 1, hairStyle: 0, beard: 1, tunic: 'tunicRed' };
const MAN: DollSpec = { look: LOOK, weapon: 'spear', cls: 'hoplite', scale: BATTLE_SCALE, res: BATTLE_RES, gear: { helmet: { def: 'pilos', r: 3 } } };
const RIDER: DollSpec = {
  look: LOOK, weapon: 'lance', helmet: { art: 'boeotian' }, armor: 'linothorax', cloak: 'cloakPurple', mount: 'horse', coat: 0, seed: 3, cls: 'companion',
  scale: BATTLE_SCALE, res: BATTLE_RES, gear: { weapon: { def: 'xyston', r: 0 }, helmet: { def: 'boeotian', r: 0 }, armor: { def: 'linothorax', r: 0 } },
};

const SKIN = ['#704030', '#c08060'];
const CLOAK = ['#401010', '#802020'];
const BRONZE = ['#ffeecc', '#ccaa88', '#886644'];

/** A one-column sheet: a skin pixel, a cloak pixel and a metal pixel above the feet (4, 9). */
function tiny(extra: Partial<SheetManifest> = {}): { m: SheetManifest; px: Pix } {
  const m: SheetManifest = {
    version: 2, class: 'hoplite', image: 'x.png', frame: { w: 8, h: 10 }, anchor: { x: 4, y: 9 }, scale: 0.5,
    rows: ['south-east', 'north-east', 'south-west', 'north-west'], colorGroups: { skin: SKIN, cloak: CLOAK },
    anims: { idle: { col: 0, frames: 1, fps: 1 } }, metal: [{ kind: 'bronze', colors: BRONZE, slots: ['helmet'] }], ...extra,
  };
  const px = new Pix(8, 40);
  for (let r = 0; r < 4; r++) {
    px.set(3, r * 10 + 8, 0xc08060);
    px.set(4, r * 10 + 8, 0x802020);
    px.set(5, r * 10 + 8, 0xccaa88);
  }
  return { m, px };
}

describe('manifest flags: variation and rarity', () => {
  it('checks the flags', () => {
    const { m } = tiny();
    expect(() => parseManifest({ ...m, variation: { skin: false, shade: true }, rarity: { metal: false } })).not.toThrow();
    expect(() => parseManifest({ ...m, variation: { skin: 'no' } })).toThrow(/variation.skin/);
    expect(() => parseManifest({ ...m, variation: { hair: false } })).toThrow(/variation.hair/);
    expect(() => parseManifest({ ...m, rarity: { glint: false } })).toThrow(/rarity.glint/);
    expect(() => parseManifest({ ...m, rarity: 1 })).toThrow(/rarity must be an object/);
  });

  it('variation.skin / shade false keep the skin and the cloak as drawn, in one variant', () => {
    const { m } = tiny();
    const dark = recolorMap(m, 'basic', { skin: 3, shade: 0 });
    expect(dark.get(0xc08060)).not.toBe(0xc08060);
    expect(dark.get(0x802020)).not.toBe(0x802020);
    const off = { ...m, variation: { skin: false, shade: false } };
    const flat = recolorMap(off, 'basic', { skin: 3, shade: 0 });
    expect(flat.get(0xc08060)).toBe(0xc08060);
    expect(flat.get(0x802020)).toBe(0x802020);
    // one flag alone leaves the other on
    expect(recolorMap({ ...m, variation: { skin: false } }, 'basic', { skin: 3, shade: 0 }).get(0x802020)).not.toBe(0x802020);
    // every man of such a sheet is the same variant (one key, one colour map)
    expect(sheetVariant(0, 5, off)).toEqual(sheetVariant(3, 77, off));
    expect(sheetVariant(0, 5, off)).toEqual({ skin: 1, shade: 1 });
    expect(sheetVariant(0, 5)).toEqual(sheetVariant(0, 5, m));
  });

  describe('drawn', () => {
    beforeAll(() => installSheetDolls());
    afterEach(() => clearSheets());
    const metalAt = (d: DollSpec) => {
      const { px, glint } = renderFrameFx(d, sheetFrameId('idle', 0), 0);
      for (let y = 0; y < px.h; y++)
        for (let x = 0; x < px.w; x++) if (glint.alpha(x, y)) return { c: (px.data[(y * px.w + x) * 4] << 16) | (px.data[(y * px.w + x) * 4 + 1] << 8) | px.data[(y * px.w + x) * 4 + 2] };
      return null;
    };

    it('rarity.metal false keeps the metal as drawn, and its glint', () => {
      const a = tiny();
      registerSheet(a.m);
      setSheetPixels('hoplite', a.px);
      const swapped = metalAt(MAN);
      expect(swapped).not.toBeNull();
      expect(bronzeOf(3).ramp).toContain(swapped!.c);
      clearSheets();
      const b = tiny({ rarity: { metal: false } });
      registerSheet(b.m);
      setSheetPixels('hoplite', b.px);
      const kept = metalAt(MAN);
      expect(kept).toEqual({ c: 0xccaa88 });
    });
  });
});

const man = (o: Partial<ManState> = {}): ManState => ({
  t: 10, id: 3, victory: false, sinceAtk: 99, shot: false, wc: 'spear', sinceBlock: 99, sinceHit: 99, stunned: false, routing: false, moving: false,
  running: false, charging: false, shieldWall: false, engaged: false, aimUntil: -1, pace: 1, ...o,
});
const table = (names: SheetAnim[]): AnimTable => Object.fromEntries(names.map((n) => [n, { frames: 8, fps: 10, strike: 4 }]));
const on = (names: SheetAnim[]) => (a: SheetAnim) => resolveAnim(a, (x) => names.includes(x));

describe('new attack clips and their fallbacks', () => {
  it('maps the sim attacks: a shot by weapon, a missile man\'s blow at close quarters a stab', () => {
    expect(attackWant('spear', false)).toBe('thrust');
    expect(attackWant('lance', false)).toBe('thrust');
    expect(attackWant('blade', false)).toBe('slash');
    expect(attackWant('two', false)).toBe('slash');
    expect(attackWant('bow', true)).toBe('shoot');
    expect(attackWant('jav', true)).toBe('throw');
    expect(attackWant('sling', true)).toBe('sling');
    expect(attackWant('bow', false)).toBe('stab');
    expect(attackWant('jav', false)).toBe('stab');
    expect(attackWant('none', false)).toBe('attack');
  });

  it('falls back slash -> thrust -> attack, throw -> shoot -> attack, sling -> throw, stab -> thrust', () => {
    expect(on(['idle', 'thrust', 'attack'])('slash')).toBe('thrust');
    expect(on(['idle', 'attack'])('slash')).toBe('attack');
    expect(on(['idle', 'shoot', 'attack'])('throw')).toBe('shoot');
    expect(on(['idle', 'attack'])('throw')).toBe('attack');
    expect(on(['idle', 'throw', 'shoot'])('sling')).toBe('throw');
    expect(on(['idle', 'shoot'])('sling')).toBe('shoot');
    expect(on(['idle', 'thrust'])('stab')).toBe('thrust');
    expect(on(['idle', 'attack'])('stab')).toBe('attack');
    // the procedural figure shows them all as its attack
    for (const a of ['slash', 'throw', 'shoot', 'sling', 'stab'] as const) expect(coreAnimOf(a)).toBe('attack');
    expect(ANIM_FALLBACK.stab).toEqual(['thrust']);
  });

  it('a ranged man\'s blow plays his stab, released at the sim\'s attack', () => {
    const T = table(['idle', 'stab', 'shoot']);
    expect(pickManAnim(man({ wc: 'bow', sinceAtk: 0 }), T)).toEqual({ anim: 'stab', i: 4 });
    expect(pickManAnim(man({ wc: 'bow', sinceAtk: 0, shot: true }), T)).toEqual({ anim: 'shoot', i: 4 });
    // a javelin: the release on the strike frame at the shot (the projectile spawns on that tick)
    expect(pickManAnim(man({ wc: 'jav', sinceAtk: 0, shot: true }), table(['idle', 'throw']))).toEqual({ anim: 'throw', i: 4 });
  });

  it('keeps the frame ids of the older clips', () => {
    expect(SHEET_ANIMS.indexOf('cheer')).toBe(24);
    expect(SHEET_ANIMS.slice(25, 29)).toEqual(['stab', 'gallop', 'drive', 'wreck']);
    expect(SHEET_ANIMS.slice(29)).toEqual(['breathe', 'shift', 'build', 'carry']);
  });
});

describe('riders and chariots on the picker', () => {
  const R = table(['idle', 'walk', 'gallop', 'thrust', 'throw', 'shoot', 'stagger', 'fallFwd', 'fallBack', 'rout', 'cheer', 'kneel']);
  const want = (o: Partial<ManState>, T = R) => chooseManAnim(man({ mount: 'horse', ...o }), T).want;
  const pick = (o: Partial<ManState>, T: AnimTable) => pickManAnim(man(o), T).anim;

  it('maps a rider\'s states to his clips', () => {
    expect(want({})).toBe('idle');
    expect(want({ moving: true })).toBe('walk');
    expect(want({ moving: true, running: true })).toBe('gallop');
    expect(want({ moving: true, charging: true })).toBe('charge');
    expect(want({ sinceAtk: 0, wc: 'lance' })).toBe('thrust');
    expect(want({ sinceAtk: 0, wc: 'jav', shot: true })).toBe('throw');
    expect(want({ sinceAtk: 0, wc: 'bow', shot: true, moving: true })).toBe('shoot'); // shooting from the saddle
    expect(want({ stunned: true })).toBe('stagger');
    expect(want({ routing: true, moving: true })).toBe('rout');
    expect(want({ victory: true })).toBe('cheer');
    // what shows on his sheet: the charge and a missing run as the gallop, a hit as the stagger
    expect(pick({ mount: 'horse', moving: true, charging: true }, R)).toBe('gallop');
    expect(pick({ mount: 'horse', sinceHit: 0.1 }, R)).toBe('stagger');
    const G = table(['idle', 'gallop']);
    expect(pick({ mount: 'horse', moving: true }, G)).toBe('gallop');
    expect(pick({ mount: 'horse', routing: true, moving: true }, G)).toBe('gallop');
    expect(pick({ mount: 'horse', victory: true }, G)).toBe('idle');
  });

  it('a rider falls with his horse and never kneels', () => {
    expect(pickDeathAnim(0, false, false, 3, R, 'horse').anim).toBe('fallFwd');
    expect(pickDeathAnim(0, true, false, 3, R, 'horse').anim).toBe('fallBack');
    expect(pickDeathAnim(9, false, true, 3, R, 'horse').anim).toBe('fallFwd');
    expect(pickDeathAnim(9, false, true, 3, R).anim).toBe('kneel'); // a man on foot does
  });

  it('maps a chariot\'s states: idle, drive, charge, hit, wreck, rout', () => {
    const C = table(['idle', 'drive', 'charge', 'hit', 'wreck', 'rout']);
    const c = (o: Partial<ManState>, T = C) => pick({ mount: 'chariot', wc: 'blade', ...o }, T);
    expect(c({})).toBe('idle');
    expect(c({ moving: true })).toBe('drive');
    expect(c({ moving: true, running: true })).toBe('drive');
    expect(c({ moving: true, charging: true })).toBe('charge');
    expect(c({ sinceHit: 0.1 })).toBe('hit');
    expect(c({ stunned: true })).toBe('hit');
    expect(c({ routing: true, moving: true })).toBe('rout');
    // no attack clip: the scythes cut as it drives on (never an idle frame mid-charge)
    expect(c({ moving: true, sinceAtk: 0 })).toBe('drive');
    expect(c({ engaged: true, swingIn: 0 })).toBe('idle');
    expect(pickDeathAnim(0.2, true, false, 3, C, 'chariot')).toEqual({ anim: 'wreck', i: 2 });
    // fallbacks: drive -> gallop -> run, wreck -> die
    expect(c({ moving: true }, table(['idle', 'gallop']))).toBe('gallop');
    expect(c({ moving: true }, table(['idle', 'run']))).toBe('run');
    expect(pickDeathAnim(0, false, false, 3, table(['idle', 'die']), 'chariot').anim).toBe('die');
  });
});

/** Decode a placeholder PNG (8-bit RGBA, filter 0 rows: what scripts/dev/placeholder-sheet.mjs writes). */
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

/** Lowest opaque row and mean opaque x of a frame. */
function footprint(f: Pix): { low: number; mx: number } {
  let low = -1;
  let sx = 0;
  let n = 0;
  for (let y = 0; y < f.h; y++)
    for (let x = 0; x < f.w; x++)
      if (f.alpha(x, y)) {
        low = y;
        sx += x;
        n++;
      }
  return { low, mx: sx / n };
}

describe('the placeholder companion sheet (mounted)', () => {
  beforeAll(() => installSheetDolls());
  afterEach(() => clearSheets());
  const dir = 'src/dev/sheets/companion/';

  it('is a valid rider sheet with per-row anchors and the skin tone off', () => {
    const m = registerSheet(JSON.parse(readFileSync(`${dir}manifest.json`, 'utf8')));
    expect(m.anims.gallop).toBeDefined();
    expect(m.variation).toEqual({ skin: false });
    expect(anchorOf(m, 0).x).toBeLessThan(anchorOf(m, 2).x); // facing right: the rider stands left of centre
  });

  it('widens the rider box about the hooves and stands every row on them, as the procedural rider', () => {
    setSheetsEnabled(false);
    const proc = dollGeom(RIDER);
    const procFrames = [0, 1, 2, 3].map((dir) => renderFrame(RIDER, ANIM.idle[0], dir));
    setSheetsEnabled(true);
    const m = registerSheet(JSON.parse(readFileSync(`${dir}manifest.json`, 'utf8')));
    setSheetPixels('companion', readPng(dir + m.image!));
    const k = sheetFactor(m, RIDER);
    expect(k).toBe(2);
    const g = dollGeom(RIDER);
    // the box holds the whole art frame of every row about the same feet point
    for (let r = 0; r < 4; r++) {
      const an = anchorOf(m, r);
      expect(g.footY).toBeGreaterThanOrEqual(an.y * k);
      expect(g.fh - g.footY).toBeGreaterThanOrEqual((m.frame.h - an.y) * k);
      expect(g.fw / 2).toBeGreaterThanOrEqual(Math.max(an.x, m.frame.w - an.x) * k);
    }
    expect(g.fw).toBeGreaterThanOrEqual(proc.fw);
    expect(g.footY).toBeGreaterThanOrEqual(proc.footY);
    for (let dir = 0; dir < 4; dir++) {
      const f = renderFrame(RIDER, sheetFrameId('idle', 0), dir);
      expect([f.w, f.h]).toEqual([g.fw, g.fh]);
      const a = footprint(f);
      const p = footprint(procFrames[dir]);
      // hooves on the feet line, and the figure in the same place across the feet point, in every row
      expect(Math.abs(a.low - g.footY - (p.low - proc.footY))).toBeLessThanOrEqual(1);
      expect(Math.abs(a.mx - g.fw / 2 - (p.mx - proc.fw / 2))).toBeLessThanOrEqual(1.5);
    }
    // every rider clip draws (the battle asks for these)
    for (const a of ['walk', 'gallop', 'charge', 'thrust', 'stagger', 'fallFwd', 'fallBack', 'rout', 'cheer'] as SheetAnim[]) {
      const f = renderFrame(RIDER, sheetFrameId(a, 0), 2);
      expect(footprint(f).low, a).toBeGreaterThan(0);
    }
  });
});
