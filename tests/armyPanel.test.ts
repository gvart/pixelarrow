import { describe, expect, it, vi } from 'vitest';

// the panel's state choice is pure; its DOM and scene modules are not loaded here
vi.mock('../src/war/view/hud/kit', () => ({ icon: () => '' }));
vi.mock('../src/war/view/hud/roster/state', () => ({ sandboxRoster: () => null }));
vi.mock('../src/war/view/hud/tunnel', () => ({ tunnelHost: () => undefined }));
vi.mock('../src/war/input/keys', () => ({ keys: { label: () => '' } }));
vi.mock('../src/war/view/side', () => ({ myTeam: () => 0 }));
const { armyText } = await import('../src/war/view/hud/armyPanel');

const base = { men: 8, max: 12, here: 5, away: [] as [string, number][], wipe: null, key: 'Ctrl+A' };

describe('army panel state', () => {
  it('men here: a click selects them', () => {
    const v = armyText(base);
    expect(v.count).toBe('<b>8</b> / 12 men · <b>5</b> here');
    expect(v.line).toBe('Click or Ctrl+A: select the 5 here');
    expect(v.pick).toBe(true);
  });
  it('none here: where they are, or no men here', () => {
    expect(armyText({ ...base, here: 0, away: [['Larisa', 4], ['Kleisoura', 2]] }).line).toBe('No men here · 4 in Larisa, 2 in Kleisoura');
    const v = armyText({ ...base, men: 0, here: 0 });
    expect(v.line).toBe('No men here');
    expect(v.pick).toBe(false);
  });
  it('after a wipe: the tunnel countdown', () => {
    const v = armyText({ ...base, men: 0, here: 0, wipe: { alive: 0, nextAt: 462_000, now: 0 } });
    expect(v.line).toBe('Next man rises in 7:42 · 0/6');
    expect(v.tone).toBe('gold');
    expect(armyText({ ...base, here: 0, wipe: { alive: 0, nextAt: null, now: 0 } }).line).toBe('Next man rises in … · 0/6');
  });
});
