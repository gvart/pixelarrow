import { describe, expect, it, vi } from 'vitest';
// The guardian bar's compact row (src/war/view/hud/guardianBar.ts): no empty separators, singular squad; the phase's
// words in its tooltip.
vi.mock('../../src/war/view/hud/craft/state', () => ({}));
vi.mock('../../src/war/view/hud/roster/state', () => ({}));
vi.mock('../../src/war/view/hud/buildingCard', () => ({}));
vi.mock('../../src/war/view/hud/chest', () => ({}));
import { guardianHtml } from '../../src/war/view/hud/guardianBar';
import type { BossSnap } from '../../src/war/types';

const boss: BossSnap = { id: 'minotaur', name: 'the Minotaur', squad: 1, unit: 1, x: 0, y: 0, hp: 500, maxHp: 1000, phase: 0, phases: [1], state: 'fight', raid: 1, scale: 1 };
const note = (b: BossSnap) => /class="rf-dim gn">([^<]*)</.exec(guardianHtml(b))![1];
const tip = (b: BossSnap) => /title="([^"]*)"/.exec(guardianHtml(b))![1];

describe('guardian bar note', () => {
  it('a one-phase guardian with no phase line: just the raid, one squad singular', () => {
    expect(note(boss)).toBe('1 squad near');
  });
  it('phases and lines join with one separator each', () => {
    expect(note({ ...boss, id: 'drakon', phases: [1, 0.6, 0.3], phase: 1, raid: 3 })).toBe('phase 2/3 · 3 squads near');
    expect(tip({ ...boss, id: 'drakon', phases: [1, 0.6, 0.3], phase: 1, raid: 3 })).toBe('phase 2/3: on the roofs: fire breath, out of melee reach · 3 squads near');
    expect(note({ ...boss, phases: [1, 0.5], raid: 0 })).toBe('phase 1/2');
  });
});
