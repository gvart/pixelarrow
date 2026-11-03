import { describe, expect, it, vi } from 'vitest';

// the panel's state choice is pure; its DOM and scene modules are not loaded here
vi.mock('../src/war/view/hud/kit', () => ({ icon: () => '' }));
vi.mock('../src/war/view/hud/roster/state', () => ({ sandboxRoster: () => null }));
vi.mock('../src/war/view/hud/tunnel', () => ({ tunnelHost: () => undefined }));
vi.mock('../src/war/view/hud/souls', () => ({ armyMen: () => 0 }));
vi.mock('../src/war/input/keys', () => ({ keys: { label: () => '' } }));
vi.mock('../src/war/view/side', () => ({ myTeam: () => 0 }));
const { armyText } = await import('../src/war/view/hud/armyPanel');

const base = { men: 8, max: 12, here: 5, waiting: 0, group: null, wipe: null, key: 'Ctrl+A' };

describe('army panel state', () => {
  it('men here: a click selects them', () => {
    const v = armyText(base);
    expect(v.count).toBe('<b>8</b> / 12 men');
    expect(armyText({ ...base, men: 41, here: 36 }).count).toBe('<b>41</b> men');
    expect(armyText({ ...base, waiting: 3 }).count).toBe('<b>8</b> / 12 men · <b>3</b> at home');
    expect(v.line).toBe('Click or Ctrl+A: select them');
    expect(v.pick).toBe(true);
  });
  it('none here: the one place or road they are on, or no men here', () => {
    expect(armyText({ ...base, here: 0, group: { region: 'Larisa', road: false } }).line).toBe('Your men are in Larisa');
    expect(armyText({ ...base, here: 0, group: { region: 'Larisa', road: true } }).line).toBe('On the road to Larisa');
    const v = armyText({ ...base, men: 0, here: 0 });
    expect(v.line).toBe('No men here');
    expect(v.pick).toBe(false);
  });
  it('after a wipe: the tunnel countdown', () => {
    const v = armyText({ ...base, men: 0, here: 0, wipe: { alive: 0, floor: 6, nextAt: 462_000, now: 0 } });
    expect(v.line).toBe('Next man rises in 7:42 · 0/6');
    expect(v.tone).toBe('gold');
    expect(armyText({ ...base, here: 0, wipe: { alive: 0, floor: 6, nextAt: null, now: 0 } }).line).toBe('Next man rises in … · 0/6');
  });
});
