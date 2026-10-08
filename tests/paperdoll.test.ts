import { describe, expect, it } from 'vitest';
import {
  ANIM, ANIM_FRAMES, BATTLE_SCALE, FRAME_NAMES, LEGACY_FRAMES, NFRAMES, aimFrame, applyCosmetics, attackFrame, attackLength, dollFx, dollKey,
  legacyFrame, renderFrame, renderFrameFx, sheetColumn, sheetFrames, weaponClass, type DollSpec,
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
