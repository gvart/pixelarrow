/**
 * CDX-01: the Codex is the one home of beasts and doctrines (V5-029, screens-modes.md M-1). The Beast
 * trial list is retired and its route lands on the Codex; the Trial fight lives on the beast sheet and
 * comes back to it; a doctrine is locked until it is met.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import codexSrc from '../src/scenes/CodexScene.ts?raw';
import trialSrc from '../src/scenes/BeastTrialScene.ts?raw';
import { DOCTRINE_IDS } from '../src/sim/types';
import { ENCOUNTER_IDS } from '../src/data/beasts';
import { EN } from '../src/i18n/en';
import { RU } from '../src/i18n/ru';
import { state } from '../src/state';
import { trialBattle, practiceOf } from '../src/game/campaignBattle';
import { Campaign } from '../src/game/campaign';
import { readText } from './support/nodeIo.js';

// the sheets draw with Phaser; the rules tested here are pure. Phaser itself needs a browser.
vi.mock('phaser', () => {
  class C {}
  return { default: { GameObjects: { Container: C, Image: C, Text: C, Graphics: C, Rectangle: C, Zone: C }, Scene: C, Loader: { Events: {} } } };
});
const { trialRedirect } = await import('../src/scenes/BeastTrialScene');
const { metDoctrines, noteDoctrine, noteLastBattle } = await import('../src/ui/sheets/doctrine');
const { SHIPPED_PLATES, plateUrl } = await import('../src/ui/beastInfo');

/** A Map-backed localStorage for the node test run. */
function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => void m.delete(k),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
  };
}

describe('the Beast trial route lands on the Codex (V5-029, AC 1)', () => {
  it('forwards to the Codex with the named beast open', () => {
    expect(trialRedirect({ from: 'Codex', open: 'hydra' })).toEqual({ open: 'hydra' });
    expect(trialRedirect({})).toEqual({});
    expect(trialRedirect(undefined)).toEqual({});
  });

  it('has no list of its own any more, only the forward', () => {
    expect(trialSrc).toMatch(/this\.scene\.start\('Codex', trialRedirect\(data\)\)/);
    expect(trialSrc).not.toMatch(/ParchmentRow|openBeastSheet|trialBattle/);
  });
});

describe('Trial fight from the beast sheet (TRL-1, N1, AC 2)', () => {
  it('fight() builds a practice battle from the Codex and starts Battle with explicit data', () => {
    const fight = codexSrc.slice(codexSrc.indexOf('fight(enc: EncounterId)'));
    expect(fight).toMatch(/trialBattle\(state\.campaign, enc, 'Codex'/);
    expect(fight).toMatch(/this\.scene\.start\('Battle', \{\}\)/);
    expect(codexSrc).not.toMatch(/scene\.start\('Battle'\)/);
  });

  it("the practice tag names the Codex and the beast, so Results' Onward reopens that sheet", () => {
    const camp = Campaign.fresh(7);
    const p = trialBattle(camp, 'minotaur', 'Codex', 11);
    expect(practiceOf(p)).toEqual({ enc: 'minotaur', from: 'Codex' });
    // Results starts BeastTrial { from, open }, which lands here
    expect(trialRedirect({ from: practiceOf(p)!.from, open: practiceOf(p)!.enc })).toEqual({ open: 'minotaur' });
  });

  it('the sheet action is the Trial fight with the practice caption, and the reason when there are no fit men', () => {
    const open = codexSrc.slice(codexSrc.indexOf('openBeast(enc: EncounterId)'));
    expect(open).toContain("t('codex.trialFight')");
    expect(open).toContain("t('codex.trialCaption')");
    expect(open).toContain("t('trial.empty')");
  });
});

describe('doctrines in the Codex (AC 3)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage());
  });

  it('none is met at first; a met doctrine is remembered once, in the GDD order', () => {
    expect(metDoctrines()).toEqual([]);
    expect(noteDoctrine('swarm')).toBe(true);
    expect(noteDoctrine('steady')).toBe(true);
    expect(noteDoctrine('swarm')).toBe(false);
    expect(noteDoctrine('nonsense')).toBe(false);
    expect(noteDoctrine(undefined)).toBe(false);
    expect(metDoctrines()).toEqual(['steady', 'swarm']);
  });

  it('a corrupt record reads as nothing met', () => {
    localStorage.setItem('pixelarrow:codex.doctrines', '{oops');
    expect(metDoctrines()).toEqual([]);
    localStorage.setItem('pixelarrow:codex.doctrines', '["fury", 3, "x"]');
    expect(metDoctrines()).toEqual(['fury']);
  });

  it('the last battle teaches its doctrine; a Trial (practice) teaches none', () => {
    const camp = Campaign.fresh(9);
    const practice = trialBattle(camp, 'hydra', 'Codex', 3);
    state.last = { outcome: {} as never, enemy: { ...practice.enemy, doctrine: 'rush' }, fallen: [], practice } as never;
    noteLastBattle();
    expect(metDoctrines()).toEqual([]);
    state.last = { outcome: {} as never, enemy: { ...practice.enemy, doctrine: 'hammer' }, fallen: [] } as never;
    noteLastBattle();
    expect(metDoctrines()).toEqual(['hammer']);
    state.last = null;
  });

  it('every doctrine has a name, tell, how, counter and who in English and Russian', () => {
    for (const id of DOCTRINE_IDS)
      for (const part of ['name', 'tell', 'how', 'counter', 'who']) {
        const k = `doctrine.${id}.${part}` as keyof typeof EN;
        expect(EN[k], k).toBeTruthy();
        expect((RU as Record<string, unknown>)[k], k).toBeTruthy();
      }
  });

  it('a locked doctrine row says how to learn it, and only a met doctrine opens a sheet', () => {
    expect(codexSrc).toContain("t('codex.unknown')");
    expect(codexSrc).toContain("t('codex.unknownHint')");
    expect(codexSrc).toMatch(/if \(!metDoctrines\(\)\.includes\(id\)\) return;/);
  });
});

describe('beast plates (AS-05)', () => {
  it('every plate it lists is shipped under public/ (promoted through scripts/art/promote.mjs)', () => {
    for (const enc of SHIPPED_PLATES) {
      expect(ENCOUNTER_IDS).toContain(enc);
      expect(() => readText(`public/${plateUrl(enc)}`), enc).not.toThrow();
    }
  });
});
