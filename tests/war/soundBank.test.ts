import { describe, expect, it } from 'vitest';
import { readText } from '../support/nodeIo';
import { asBeast, beastOf, BEASTS, LOOPS, pickVariant, pitchRate, SAMPLE_BANK, sampleUrl, SampleThrottle, SFX_SAMPLE, type SampleId } from '../../src/audio/bank';
import { Crossfade, loopTargets, PROC_COVER, procCover } from '../../src/audio/loops';
import { busDb } from '../../src/audio/mixer';
import { AudioRng } from '../../src/audio/rng';
import { SamplePlayer } from '../../src/audio/samples';
import { RECIPES } from '../../src/audio/sfx';
import { MOB_KINDS } from '../../src/war/sim/mobs';
import { WORLD_REGIONS } from '../../src/war/world/regions';
import { beastSample, DEFAULT_SOUND, parseSound } from '../../src/war/view/sound/mix';

const IDS = Object.keys(SAMPLE_BANK) as SampleId[];
const exists = (p: string) => {
  try {
    readText(p);
    return true;
  } catch {
    return false;
  }
};

/** The SOUND.md table rows: id -> variants. */
function soundTable(): Map<string, number> {
  const md = readText('docs/playbook/SOUND.md');
  const rows = new Map<string, number>();
  for (const m of md.matchAll(/^\| ([a-z]+\.[a-zA-Z.]+) \| (\d+) \| [\d.]+ \| -\d+ \| .+ \|$/gm)) rows.set(m[1], Number(m[2]));
  return rows;
}

describe('sound bank: the manifest', () => {
  it('has a beast entry for every mob kind that is not men', () => {
    const beasts = MOB_KINDS.filter((k) => k !== 'bandit');
    expect([...BEASTS].sort()).toEqual([...beasts].sort());
    for (const b of BEASTS) for (const w of ['attack', 'cry', 'death'] as const) expect(SAMPLE_BANK[`beast.${b}.${w}`]).toBeDefined();
  });

  it('agrees with SOUND.md: the same ids, and never more variants shipped than planned', () => {
    const t = soundTable();
    expect([...t.keys()].sort()).toEqual([...IDS].sort());
    for (const id of IDS) expect(SAMPLE_BANK[id].v).toBeLessThanOrEqual(t.get(id)!);
  });

  it('ships every file it claims, in both formats', () => {
    for (const id of IDS) for (let k = 1; k <= SAMPLE_BANK[id].v; k++) for (const ext of ['ogg', 'm4a'] as const) {
      expect(exists(`public/${sampleUrl(id, k, ext)}`), `${id}-${k}.${ext}`).toBe(true);
    }
  });

  it('maps procedural ids only to real recipes and samples; loops are on the ambience bus', () => {
    for (const [sfx, sid] of Object.entries(SFX_SAMPLE)) {
      expect(RECIPES[sfx as keyof typeof RECIPES]).toBeDefined();
      expect(SAMPLE_BANK[sid!]).toBeDefined();
    }
    for (const id of LOOPS) expect(SAMPLE_BANK[id]).toMatchObject({ bus: 'amb', loop: true });
  });

  it('finds the beast behind a unit class or mob kind; men and guardians have none', () => {
    expect(beastOf('mob_wolf')).toBe('wolf');
    expect(beastOf('mob_moor_bear')).toBe('bear');
    expect(beastOf('mob_savanna_lion')).toBe('lion');
    expect(beastOf('mob_drakon')).toBeNull();
    expect(beastOf('mob_bandit')).toBeNull();
    expect(beastOf('hoplite')).toBeNull();
    expect(asBeast('bandit')).toBeNull();
    for (const k of MOB_KINDS) expect(beastSample(`mob_${k}`, 'cry')).toBe(k === 'bandit' ? undefined : `beast.${k}.cry`);
    expect(beastSample('serpent', 'attack')).toBe('beast.serpent.attack');
  });
});

describe('sound bank: variants and pitch', () => {
  it('never picks the variant just played', () => {
    const r = new AudioRng(7);
    let last: number | undefined;
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const k = pickVariant(4, last, r);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThan(4);
      expect(k).not.toBe(last);
      seen.add(k);
      last = k;
    }
    expect(seen.size).toBe(4);
    expect(pickVariant(1, 0, r)).toBe(0);
  });

  it('jitters pitch within the cents asked, and not at all for 0', () => {
    const r = new AudioRng(3);
    expect(pitchRate(0, r)).toBe(1);
    for (let i = 0; i < 100; i++) {
      const v = pitchRate(100, r);
      expect(v).toBeGreaterThanOrEqual(Math.pow(2, -100 / 1200) - 1e-9);
      expect(v).toBeLessThanOrEqual(Math.pow(2, 100 / 1200) + 1e-9);
    }
  });
});

describe('sound bank: throttle for crowded fights', () => {
  it('lets at most `rate` starts of one id through a second, the rest wait for the window', () => {
    const t = new SampleThrottle();
    let ok = 0;
    for (let i = 0; i < 100; i++) if (t.admit('hit.metal', 10, i * 0.01)) ok++;
    expect(ok).toBe(10);
    expect(t.admit('hit.metal', 10, 1.001)).toBe(true);
    // other ids are counted apart; rate 0 is no cap
    expect(t.admit('hit.wood', 10, 0.5)).toBe(true);
    for (let i = 0; i < 50; i++) expect(t.admit('amb.surf', 0, 0)).toBe(true);
  });

  it('spaces slow ids (a cry under 1 per second) by their period', () => {
    const t = new SampleThrottle();
    expect(t.admit('beast.wolf.cry', 0.5, 0)).toBe(true);
    expect(t.admit('beast.wolf.cry', 0.5, 1.5)).toBe(false);
    expect(t.admit('beast.wolf.cry', 0.5, 2.01)).toBe(true);
  });
});

describe('sound bank: biome loops and the crossfade', () => {
  const at = (biome: string | undefined, o: Partial<{ moors: number; water: number; built: number; high: number }> = {}) =>
    loopTargets({ biome, moors: 0, water: 0, built: 0, high: 0, ...o });

  it('gives every world region biome a ground loop', () => {
    for (const b of new Set(WORLD_REGIONS.map((w) => w.biome))) expect(Object.keys(at(b)).length, b).toBeGreaterThan(0);
    expect(at('mountains')).toEqual({ 'amb.glacier': 0.8 });
    expect(Object.keys(at('coast'))).toEqual(['amb.surf']);
    expect(at(undefined)).toEqual({});
  });

  it('brings the moors, the surf near water and a town in on top', () => {
    const lv = at('mountains', { moors: 0.5, water: 0.6, built: 0.3 });
    expect(lv['amb.moors']).toBeGreaterThan(0.5);
    expect(lv['amb.glacier']).toBeLessThan(0.8);
    expect(lv['amb.surf']).toBeCloseTo(0.6);
    expect(lv['amb.town']).toBeCloseTo(0.9);
  });

  it('crossfades at equal power: the bed holds its loudness mid-way', () => {
    const f = new Crossfade(4);
    f.set({ 'amb.forest': 1 });
    f.step(10);
    expect(f.gains()['amb.forest']).toBeCloseTo(1);
    f.set({ 'amb.surf': 1 });
    f.step(2);
    const g = f.gains();
    expect(f.levelOf('amb.forest')).toBeCloseTo(0.5);
    expect((g['amb.forest'] ?? 0) ** 2 + (g['amb.surf'] ?? 0) ** 2).toBeCloseTo(1);
    f.step(2.5);
    expect(f.gains()['amb.forest']).toBeUndefined();
    expect(f.gains()['amb.surf']).toBeCloseTo(1);
  });

  it('steps the procedural beds back only for loops that are loaded', () => {
    const proc = { wind: 0.8, birds: 0.6, sea: 0.5, fire: 0.4 };
    const loops = { 'amb.forest': 1, 'amb.surf': 0.5 } as const;
    expect(procCover(proc, loops, () => false)).toEqual(proc);
    const c = procCover(proc, loops, (id) => id === 'amb.forest' || id === 'amb.surf');
    expect(c.birds).toBeUndefined();
    expect(c.sea).toBeCloseTo(0.25);
    expect(c.wind).toBe(0.8);
    expect(c.fire).toBe(0.4);
    for (const id of LOOPS) expect(PROC_COVER[id].length).toBeGreaterThan(0);
  });
});

describe('sound bank: the lazy loader', () => {
  /** A fake context: decodes anything but '.ogg' when `noOpus`. */
  function rig(noOpus = false) {
    const urls: string[] = [];
    const ctx = {
      currentTime: 0,
      decodeAudioData: async (b: ArrayBuffer) => {
        if (noOpus && (b as ArrayBuffer & { ext?: string }).ext === 'ogg') throw new Error('no opus');
        return { duration: 0.5 } as AudioBuffer;
      },
    } as unknown as BaseAudioContext;
    const fetcher = async (u: string) => {
      urls.push(u);
      return { ok: true, arrayBuffer: async () => Object.assign(new ArrayBuffer(8), { ext: u.split('.').pop() }) };
    };
    return { urls, p: new SamplePlayer(ctx, {} as AudioNode, new AudioRng(1), 'ogg', fetcher) };
  }

  /** Run `f` as if `id` shipped `v` variants. */
  async function shipped(id: SampleId, v: number, f: () => Promise<void>) {
    const was = SAMPLE_BANK[id].v;
    SAMPLE_BANK[id].v = v;
    try {
      await f();
    } finally {
      SAMPLE_BANK[id].v = was;
    }
  }

  it('fetches nothing until asked, then each variant once, and ignores ids without files', () => shipped('hit.metal', 3, async () => {
    const { urls, p } = rig();
    expect(urls).toEqual([]);
    await shipped('hit.wood', 0, async () => {
      await p.request('hit.wood');
      expect(urls).toEqual([]);
      expect(p.ready('hit.wood')).toBe(false);
    });
    await Promise.all([p.request('hit.metal'), p.request('hit.metal')]);
    expect(urls).toEqual(['war/sfx/hit.metal-1.ogg', 'war/sfx/hit.metal-2.ogg', 'war/sfx/hit.metal-3.ogg']);
    expect(p.ready('hit.metal')).toBe(true);
  }));

  it('falls back to m4a when the browser cannot decode the Opus it claims', () => shipped('ui.coin', 2, async () => {
    const { urls, p } = rig(true);
    await p.request('ui.coin');
    expect(p.ready('ui.coin')).toBe(true);
    expect(urls).toEqual(['war/sfx/ui.coin-1.ogg', 'war/sfx/ui.coin-1.m4a', 'war/sfx/ui.coin-2.m4a']);
  }));
});

describe('sound settings: the interface volume', () => {
  it('parses and defaults uiVol, and drives the UI bus apart from effects', () => {
    expect(parseSound(null).uiVol).toBe(DEFAULT_SOUND.uiVol);
    expect(parseSound(JSON.stringify({ uiVol: 3 })).uiVol).toBe(3);
    expect(parseSound(JSON.stringify({ uiVol: 'x' })).uiVol).toBe(DEFAULT_SOUND.uiVol);
    const b = busDb({ sound: true, musicVol: 5, sfxVol: 10, uiVol: 5 });
    expect(b.ui).toBeLessThan(b.sfx);
    expect(busDb({ sound: true, musicVol: 5, sfxVol: 6 }).ui).toBe(busDb({ sound: true, musicVol: 5, sfxVol: 6, uiVol: 6 }).ui);
  });
});
