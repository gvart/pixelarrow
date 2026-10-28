/**
 * W-67 boss voice: every guardian's lines (src/data/warBosses.ts `voice`) and when they are said
 * (src/war/view/hud/bossBanner.ts voices): the wake once, a line per phase (each of those skipped at once), the epitaph,
 * nothing again on a resume.
 */
import { describe, expect, it } from 'vitest';
import { WAR_BOSSES } from '../../src/data/warBosses';
import { voiceLine, voiceMem, voices, type Voice } from '../../src/war/view/hud/bossBanner';
import type { BossSnap } from '../../src/war/types';

const words = (t: string) => t.trim().split(/\s+/).length;

describe('boss lines', () => {
  it('has 15 bosses, each with a title, a taunt, a line per phase past the first and an epitaph, 12 words at most', () => {
    expect(WAR_BOSSES).toHaveLength(15);
    for (const b of WAR_BOSSES) {
      const v = b.voice;
      expect(v.title, b.id).toBeTruthy();
      expect(v.phases, b.id).toHaveLength(b.phases.length - 1);
      for (const l of [v.wake, ...v.phases, v.epitaph, v.fled ?? 'x', v.back ?? 'x']) {
        expect(l.trim(), b.id).not.toBe('');
        expect(words(l), `${b.id}: ${l}`).toBeLessThanOrEqual(12);
      }
    }
  });
  it('gives the Bandit King, the one who escapes, a line to flee and to come back', () => {
    const k = WAR_BOSSES.find((b) => b.id === 'bandit_king')!.voice;
    expect(k.fled && k.back).toBeTruthy();
  });
});

const snap = (o: Partial<BossSnap>): BossSnap => ({
  id: 'drakon', name: 'Drakon the White', squad: 1, unit: 1, x: 0, y: 0, hp: 100, maxHp: 100, phase: 0, phases: [1, 0.6, 0.565],
  state: 'idle', raid: 0, scale: 1, ...o,
});
const kinds = (vs: Voice[]) => vs.map((v) => (v.kind === 'phase' ? `phase${v.phase}` : v.kind));

describe('voices', () => {
  it('wakes once on the first fight, then says each phase, the skipped ones in order, then the epitaph', () => {
    const m = voiceMem(snap({}));
    expect(voices(m, snap({}))).toEqual([]);
    expect(kinds(voices(m, snap({ state: 'fight', hp: 99 })))).toEqual(['wake']);
    expect(voices(m, snap({ state: 'idle', hp: 100 }))).toEqual([]); // a leash reset: no second wake
    expect(kinds(voices(m, snap({ state: 'fight', hp: 50, phase: 2 })))).toEqual(['phase1', 'phase2']);
    expect(kinds(voices(m, snap({ state: 'slain', hp: 0, phase: 2 })))).toEqual(['slain']);
    expect(kinds(voices(m, snap({ state: 'slain', hp: 0, phase: 2 })))).toEqual([]);
  });
  it('wakes a perched guardian when it is first hurt, and before a phase hit in the same snapshot', () => {
    const m = voiceMem(snap({ id: 'brontes', state: 'perch', phases: [1, 0.85] }));
    expect(voices(m, snap({ id: 'brontes', state: 'perch', phases: [1, 0.85] }))).toEqual([]);
    expect(kinds(voices(m, snap({ id: 'brontes', state: 'perch', hp: 80, phase: 1, phases: [1, 0.85] })))).toEqual(['wake', 'phase1']);
  });
  it('does not wake one already fighting when first seen (a resume or a reconnect)', () => {
    const m = voiceMem(snap({ state: 'fight', hp: 70, phase: 1 }));
    expect(voices(m, snap({ state: 'fight', hp: 60, phase: 1 }))).toEqual([]);
  });
  it('says the escape and the return, and wakes again after it', () => {
    const k = { id: 'bandit_king', phases: [1, 0.6, 0.3] };
    const m = voiceMem(snap({ ...k, state: 'flee', hp: 20, phase: 2 }));
    expect(kinds(voices(m, snap({ ...k, state: 'away', hp: 20, phase: 2 })))).toEqual(['fled']);
    expect(kinds(voices(m, snap({ ...k, state: 'idle', hp: 100, phase: 0 })))).toEqual(['back']);
    expect(kinds(voices(m, snap({ ...k, state: 'fight', hp: 100, phase: 0 })))).toEqual(['wake']);
  });
  it('finds a line for every voice a boss can say, none for an escape it never makes', () => {
    expect(voiceLine({ kind: 'phase', boss: 'drakon', phase: 2 })).toMatch(/citadel/);
    expect(voiceLine({ kind: 'slain', boss: 'minotaur', phase: 0 })).toBeTruthy();
    expect(voiceLine({ kind: 'fled', boss: 'drakon', phase: 0 })).toBeNull();
  });
});
