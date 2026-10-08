import { describe, expect, it } from 'vitest';
import {
  ANIM, ANIM_FRAMES, BATTLE_RES, BATTLE_SCALE, FRAME_NAMES, LEGACY_FRAMES, NFRAMES, PORTRAIT_FRAMES, PORTRAIT_PX, PORTRAIT_RES, aimFrame, applyCosmetics, attackFrame, attackLength,
  dollFx, dollGeom, dollKey, fineDetail, legacyFrame, portraitLoop, renderFrame, renderFrameFx, renderPortrait, sheetColumn, sheetFrames, weaponClass, type DollSpec,
} from '../src/art/paperdoll';
import { renderItemIcon, itemIconKey } from '../src/art/itemIcons';
import { renderCosmetic } from '../src/art/cosmeticArt';
import { ITEM_LIST } from '../src/data/items';

const HOPLITE: DollSpec = {
  look: { skin: 1, hair: 1, hairStyle: 0, beard: 1, tunic: 'tunicWhite' },
  weapon: 'spear',
  shield: { art: 'hoplon', paint: { emblem: 'lambda', field: 'red', ink: 'cream' } },
  helmet: { art: 'corinthian', paint: { field: 'red' } },
  armor: 'cuirass',
  cloak: 'cloakRed',
  seed: 3,
  scale: BATTLE_SCALE,
};

const solid = (px: { w: number; h: number; alpha(x: number, y: number): number }) => {
  let n = 0;
  for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) if (px.alpha(x, y) > 0) n++;
  return n;
};

describe('soldier sheets', () => {
  it('keeps the sixteen original columns and appends the new ones', () => {
    expect(FRAME_NAMES.slice(0, 16)).toEqual(['idle0', 'idle1', 'walk0', 'walk1', 'walk2', 'walk3', 'atk0', 'atk1', 'atk2', 'hit', 'die0', 'die1', 'die2', 'walk4', 'walk5', 'die1b']);
    expect(NFRAMES).toBe(40);
    expect(new Set(FRAME_NAMES).size).toBe(NFRAMES);
    expect(ANIM.walk).toHaveLength(8);
    expect(ANIM.idle).toHaveLength(4);
    expect(ANIM.run).toHaveLength(6);
    expect(ANIM.attack).toHaveLength(5);
    expect(ANIM_FRAMES.attack).toEqual([6, 7, 8]);
    // every animation frame is a valid column, and every column maps to a legacy one for riders and animals
    for (const seq of Object.values(ANIM)) for (const f of seq) expect(f).toBeLessThan(NFRAMES);
    for (let f = 0; f < NFRAMES; f++) {
      expect(legacyFrame(f)).toBeGreaterThanOrEqual(0);
      expect(legacyFrame(f)).toBeLessThan(LEGACY_FRAMES);
      expect(sheetColumn(f, LEGACY_FRAMES)).toBeLessThan(LEGACY_FRAMES);
      expect(sheetColumn(f, NFRAMES)).toBe(f);
    }
    expect(sheetFrames(HOPLITE)).toBe(NFRAMES);
    expect(sheetFrames({ ...HOPLITE, mount: 'horse' })).toBe(LEGACY_FRAMES);
  });

  it('draws every frame of a man, with distinct poses', () => {
    const seen = new Set<string>();
    for (let f = 0; f < NFRAMES; f++) {
      const px = renderFrame(HOPLITE, f, 2);
      expect(solid(px)).toBeGreaterThan(60);
      seen.add(Array.from(px.data).join(','));
    }
    // no two columns are the same picture
    expect(seen.size).toBe(NFRAMES);
  });

  it('times each weapon class its own way', () => {
    expect(attackFrame('spear', 0)).toBe(ANIM.attack[0]);
    expect(attackFrame('spear', 10)).toBe(-1);
    expect(attackLength('two')).toBeGreaterThan(attackLength('blade'));
    // missiles start at the release
    expect(attackFrame('bow', 0)).toBe(ANIM.attack[2]);
    expect(aimFrame('bow', 0.1, 0)).toBe(ANIM.attack[1]);
    expect(aimFrame('bow', 2, 0)).toBe(-1);
    expect(weaponClass('rhomphaia')).toBe('two');
    expect(weaponClass(undefined)).toBe('none');
  });
});

describe('render resolution', () => {
  it('scales the frame and the feet line by res, keys the sheet by it, and keeps the figure the same size', () => {
    const g1 = dollGeom(HOPLITE);
    const g2 = dollGeom({ ...HOPLITE, res: BATTLE_RES });
    expect(g2).toEqual({ fw: g1.fw * BATTLE_RES, fh: g1.fh * BATTLE_RES, footY: g1.footY * BATTLE_RES });
    expect(dollKey({ ...HOPLITE, res: 2 })).not.toBe(dollKey(HOPLITE));
    expect(dollKey({ ...HOPLITE, res: 1 })).toBe(dollKey(HOPLITE));
    // the 2x man covers about four times the pixels of the 1x man (same silhouette, finer raster)
    const a = solid(renderFrame(HOPLITE, 0, 2));
    const b = solid(renderFrame({ ...HOPLITE, res: 2 }, 0, 2));
    expect(b / a).toBeGreaterThan(3);
    expect(b / a).toBeLessThan(5);
    // fine detail switches on with the pixel density: the battle at 2x and portraits, not the 1x screens
    expect(fineDetail(HOPLITE)).toBe(false);
    expect(fineDetail({ ...HOPLITE, res: 2 })).toBe(true);
    expect(fineDetail({ ...HOPLITE, scale: 1 })).toBe(false);
  });

  it('draws every frame of a 2x man, each distinct, with riders and animals too', () => {
    const seen = new Set<string>();
    const hd = { ...HOPLITE, res: 2 };
    for (let f = 0; f < NFRAMES; f++) {
      const px = renderFrame(hd, f, 1);
      expect(solid(px)).toBeGreaterThan(240);
      seen.add(Array.from(px.data).join(','));
    }
    expect(seen.size).toBe(NFRAMES);
    for (const gal of ANIM.gallop) expect(solid(renderFrame({ ...hd, mount: 'horse' }, gal, 2))).toBeGreaterThan(400);
    expect(solid(renderFrame({ look: HOPLITE.look, beast: 'wolf', scale: BATTLE_SCALE, res: 2 }, 2, 0))).toBeGreaterThan(100);
  });
});

describe('portraits', () => {
  it('renders a bust at the portrait resolution, with distinct idle variants, and a 1x still', () => {
    const size = PORTRAIT_PX * PORTRAIT_RES;
    const seen = new Set<string>();
    // bare-headed: a blink is hidden behind a Corinthian helmet
    const face: DollSpec = { ...HOPLITE, helmet: undefined };
    for (let f = 0; f < PORTRAIT_FRAMES.length; f++) {
      const px = renderPortrait(face, f);
      expect(px.w).toBe(size);
      expect(px.h).toBe(size);
      expect(solid(px)).toBeGreaterThan(size * size * 0.25);
      seen.add(Array.from(px.data).join(','));
    }
    expect(seen.size).toBe(PORTRAIT_FRAMES.length);
    const still = renderPortrait(HOPLITE, 0, 1);
    expect(still.w).toBe(PORTRAIT_PX);
    expect(solid(still)).toBeGreaterThan(PORTRAIT_PX * PORTRAIT_PX * 0.25);
    // animals and riders have one too
    expect(solid(renderPortrait({ look: HOPLITE.look, beast: 'bear' }, 0))).toBeGreaterThan(200);
    expect(solid(renderPortrait({ ...HOPLITE, mount: 'horse' }, 0))).toBeGreaterThan(200);
  });

  it('gives every hero an idle loop of its own that uses every variant kind', () => {
    const a = portraitLoop(1);
    const b = portraitLoop(2);
    expect(a.length).toBeGreaterThan(20);
    expect(a.join()).not.toBe(b.join());
    for (const f of a) expect(f).toBeLessThan(PORTRAIT_FRAMES.length);
    expect(a).toContain(PORTRAIT_FRAMES.indexOf('breath2'));
    expect(a).toContain(PORTRAIT_FRAMES.indexOf('glint1'));
  });
});

describe('gear and rarity visuals', () => {
  it('keys a sheet by the loadout: item, rarity and cosmetics all change it', () => {
    const k0 = dollKey(HOPLITE);
    expect(dollKey({ ...HOPLITE, gear: { helmet: { def: 'corinthian', r: 4 } } })).not.toBe(k0);
    expect(dollKey({ ...HOPLITE, gear: { helmet: { def: 'corinthian', r: 3 } } })).not.toBe(dollKey({ ...HOPLITE, gear: { helmet: { def: 'corinthian', r: 4 } } }));
    expect(dollKey(applyCosmetics(HOPLITE, { crest: 'crest_white' }))).not.toBe(k0);
    expect(dollKey(applyCosmetics(HOPLITE, {}))).toBe(k0);
  });

  it('changes the picture with the rarity of a piece', () => {
    const pics = [0, 2, 3, 4].map((r) => Array.from(renderFrame({ ...HOPLITE, gear: { shield: { def: 'hoplon', r }, helmet: { def: 'corinthian', r } } }, 0, 2).data).join(','));
    expect(new Set(pics).size).toBe(4);
  });

  it('gives rare+ gear a glint mask, epic an outline, legendary particles', () => {
    expect(dollFx(HOPLITE)).toMatchObject({ rank: 0, glint: false, outline: null, particles: null });
    expect(dollFx({ ...HOPLITE, gear: { armor: { def: 'cuirass', r: 2 } } })).toMatchObject({ rank: 2, glint: true, outline: null });
    expect(dollFx({ ...HOPLITE, gear: { armor: { def: 'cuirass', r: 3 } } }).outline).not.toBeNull();
    expect(dollFx({ ...HOPLITE, gear: { weapon: { def: 'dory', r: 4 }, helmet: { def: 'attic', r: 4 } } }).particles).toBe('embers');
    const fx = renderFrameFx({ ...HOPLITE, gear: { armor: { def: 'cuirass', r: 3 }, shield: { def: 'hoplon', r: 3 } } }, 0, 1);
    expect(solid(fx.ring)).toBeGreaterThan(40);
    expect(solid(fx.glint)).toBeGreaterThan(10);
  });

  it('dresses the army in cosmetics', () => {
    const d = applyCosmetics(HOPLITE, { emblem: 'emblem_owl', cloak: 'cloak_purple', crest: 'crest_gold', army_skin: 'skin_bronze', pose: 'pose_shield' });
    expect(d.shield?.paint?.emblem).toBe('owl');
    expect(d.cloak).toBe('cloakRoyal');
    expect(d.crest).toBe('gold');
    expect(d.polish).toBe(true);
    expect(d.victory).toBe('shield');
    // beasts are left alone
    expect(applyCosmetics({ look: HOPLITE.look, beast: 'wolf' }, { cloak: 'cloak_purple' }).cloak).toBeUndefined();
  });

  it('draws item icons in their finish and cosmetic previews for the new slots', () => {
    for (const d of ITEM_LIST) {
      const a = renderItemIcon({ uid: 'a', def: d.id, rarity: 'common', cond: 100 });
      const b = renderItemIcon({ uid: 'b', def: d.id, rarity: 'legendary', cond: 100 });
      expect(solid(a)).toBeGreaterThan(5);
      if (d.slot !== 'trinket') expect(Array.from(a.data).join(','), d.id).not.toBe(Array.from(b.data).join(','));
      expect(itemIconKey({ uid: 'a', def: d.id, rarity: 'common', cond: 100 })).not.toBe(itemIconKey({ uid: 'b', def: d.id, rarity: 'legendary', cond: 100 }));
    }
    for (const [id, slot] of [['crest_gold', 'crest'], ['aura_embers', 'aura'], ['pose_salute', 'pose']]) expect(solid(renderCosmetic(id, slot))).toBeGreaterThan(40);
  });
});
