import { describe, expect, it, vi } from 'vitest';

// ../bossFx.ts only needs Phaser at run time (its CUES list is plain data)
vi.mock('phaser', () => ({ default: {} }));
import { RECIPES } from '../../src/audio/sfx';
import { TRACKS } from '../../src/audio/music';
import { CUES } from '../../src/war/view/bossFx';
import { ambienceFor, cueSfx, DEFAULT_SOUND, gatherSfx, HOLD_S, MusicDirector, parseSound, shotSfx, spatial, STATE_TRACK, strikeSfx, struckSince, wantState } from '../../src/war/view/sound/mix';

describe('war sound: spatial', () => {
  it('is full and centred in the middle of the view, panned and fading towards and past the edges', () => {
    const mid = spatial(0, 0, 800, 450, 1);
    expect(mid.vol).toBeCloseTo(1);
    expect(mid.pan).toBe(0);
    const right = spatial(700, 0, 800, 450, 1);
    expect(right.pan).toBeGreaterThan(0.5);
    expect(right.vol).toBeLessThan(1);
    expect(spatial(-700, 0, 800, 450, 1).pan).toBeLessThan(-0.5);
    expect(spatial(2400, 0, 800, 450, 1).vol).toBe(0);
  });

  it('is quieter zoomed out', () => {
    expect(spatial(0, 0, 800, 450, 0.25).vol).toBeLessThan(spatial(0, 0, 800, 450, 1).vol);
    expect(spatial(0, 0, 800, 450, 0.25).vol).toBeGreaterThan(0.3);
  });
});

describe('war sound: what plays', () => {
  it('maps blows, missiles and work to real recipes', () => {
    expect(strikeSfx('archer', 0.5)).toBeNull();
    for (const cls of ['hoplite', 'militia', 'celt_sword', 'mob_wolf', 'mob_bandit', 'mob_drakon', 'mob_maenad']) {
      const id = strikeSfx(cls, 0.9);
      expect(id && RECIPES[id], cls).toBeTypeOf('function');
    }
    for (const k of ['arrow', 'stone', 'javelin', 'bolt'] as const) for (const siege of [false, true]) {
      const s = shotSfx(k, siege);
      expect(RECIPES[s.release]).toBeTypeOf('function');
      expect(RECIPES[s.land]).toBeTypeOf('function');
    }
    expect(gatherSfx('wood')).toBe('chop');
    expect(gatherSfx('iron')).toBe('mine');
    expect(gatherSfx('olives')).toBeNull();
  });

  it('gives every guardian beat a sound, and the guardians their own voices', () => {
    for (const cue of CUES) for (const boss of ['drakon', 'scylla', 'gyges', 'chimera', 'brontes', 'bandit_king', 'maenad_queen', 'minotaur']) {
      const id = cueSfx(cue, boss);
      expect(id && RECIPES[id], `${cue} ${boss}`).toBeTypeOf('function');
    }
    expect(cueSfx('boss.roar', 'drakon')).toBe('dragonRoar');
    expect(cueSfx('boss.horn', 'bandit_king')).toBe('banditHorn');
    expect(cueSfx('boss.smash', 'brontes')).toBe('anvil');
  });
});

describe('war sound: blows between snapshots', () => {
  it('hears a blow struck in any snapshot skipped since the last one taken, once', () => {
    expect(struckSince(0, 1)).toBe(true);
    expect(struckSince(1, 1)).toBe(false);
    expect(struckSince(undefined, 3)).toBe(false);
    // a slow frame took every third snapshot: blows 0, 1 and 2 ticks old landed since, 3 was heard last time
    expect([0, 1, 2, 3].map((s) => struckSince(s, 3))).toEqual([true, true, true, false]);
  });
});

describe('war sound: music state', () => {
  it('picks the state from what is near', () => {
    expect(wantState({ foes: 0, fighting: 0, boss: false })).toBe('calm');
    expect(wantState({ foes: 4, fighting: 0, boss: false })).toBe('tension');
    expect(wantState({ foes: 4, fighting: 6, boss: false })).toBe('battle');
    expect(wantState({ foes: 4, fighting: 6, boss: true })).toBe('boss');
    for (const t of Object.values(STATE_TRACK)) expect(TRACKS[t]).toBeDefined();
  });

  it("steps up at once and down only HOLD_S after the higher state was last wanted", () => {
    const d = new MusicDirector();
    expect(d.update(0, { foes: 3, fighting: 5, boss: false })).toBe('battle');
    expect(d.update(1, { foes: 0, fighting: 0, boss: false })).toBe('battle');
    expect(d.update(HOLD_S - 0.5, { foes: 0, fighting: 0, boss: false })).toBe('battle');
    expect(d.update(HOLD_S + 0.5, { foes: 0, fighting: 0, boss: false })).toBe('calm');
  });
});

describe('war sound: ambience', () => {
  const base = { biome: {}, forest: 0, deep: 0, shallow: 0, built: 0, fire: 0 };
  it('chooses the beds of the biome round the camera', () => {
    expect(ambienceFor({ ...base, biome: { mountains: 1 } }, 1).gale).toBeGreaterThan(0.5);
    const desert = ambienceFor({ ...base, biome: { kyrene: 1 } }, 1);
    expect(desert.desert).toBeGreaterThan(0.5);
    expect(desert.birds ?? 0).toBe(0);
    expect(ambienceFor({ ...base, biome: { global: 1 }, forest: 0.6 }, 1).birds).toBeGreaterThan(0.5);
    expect(ambienceFor({ ...base, biome: { elaia: 1 }, deep: 0.5 }, 1).sea).toBeGreaterThan(0.4);
    expect(ambienceFor({ ...base, biome: { global: 1 }, shallow: 0.1 }, 1).river).toBeGreaterThan(0.3);
    expect(ambienceFor({ ...base, biome: { global: 1 }, built: 0.5 }, 1).murmur).toBeGreaterThan(0.5);
    expect(ambienceFor({ ...base, biome: { global: 1 }, fire: 0.7 }, 1).fire).toBeCloseTo(0.7);
  });
});

describe('war sound: settings', () => {
  it('parses stored settings and falls back on junk, field by field', () => {
    expect(parseSound(null)).toEqual(DEFAULT_SOUND);
    expect(parseSound('{nope')).toEqual(DEFAULT_SOUND);
    expect(parseSound('{"sound":false,"musicVol":3,"sfxVol":"x","ambVol":42}')).toEqual({ ...DEFAULT_SOUND, sound: false, musicVol: 3, ambVol: 10 });
  });
});
