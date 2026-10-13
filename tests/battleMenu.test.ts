// BTL-01: the battle HUD's rules (design/ux/hud.md): the ⋯ menu's items by state (A11Y-08, A11Y-18),
// the medallion rail's cap (Z5), the badge markers' budget (§G) and the order bar's words at the text floor (§I).
import { describe, expect, it, vi } from 'vitest';
import { setLang, t } from '../src/i18n';
import { measureText } from '../src/ui/textfit';

vi.mock('phaser', () => {
  class C {}
  return { default: { GameObjects: { Container: C, Image: C, Text: C, Graphics: C, Rectangle: C }, Scene: C } };
});
const { battleMenuItems, battleMenuNote } = await import('../src/ui/sheets/battleMenu');
const { BADGE_MARKERS_MAX, MED_H, MORE_H, RAIL_MAX, RAIL_SHORT_FIELD, badgeKey, badgeMarkers, railLayout } = await import('../src/ui/battleHud');

const base = { phase: 'battle' as const, realtimeLocked: false, tutorial: false, online: false };

describe('the ⋯ battle menu (hud.md §D)', () => {
  it('deployment: Leave, Reset all, Sound, Settings; online deployment has no Reset all', () => {
    expect(battleMenuItems({ ...base, phase: 'deploy' })).toEqual(['leave', 'resetAll', 'sound', 'settings']);
    expect(battleMenuItems({ ...base, phase: 'deploy', online: true })).toEqual(['leave', 'sound', 'settings']);
  });

  it('the fight offline: Retreat, Sound, Settings', () => {
    expect(battleMenuItems(base)).toEqual(['retreat', 'sound', 'settings']);
    expect(battleMenuNote(base)).toBeNull();
  });

  it('a fight that cannot pause offers only Retreat and Sound, and says the battle continues (A11Y-18)', () => {
    const locked = { ...base, realtimeLocked: true, online: true };
    expect(battleMenuItems(locked)).toEqual(['retreat', 'sound']);
    expect(battleMenuNote(locked)).toBe('battle.menu.continues');
  });

  it('the tutorial: Skip tutorial, Sound, Settings; after the end: Sound, Settings', () => {
    expect(battleMenuItems({ ...base, tutorial: true })).toEqual(['skip', 'sound', 'settings']);
    expect(battleMenuItems({ ...base, phase: 'ended' })).toEqual(['sound', 'settings']);
  });

  it('every item is translated in en and ru', () => {
    for (const lang of ['en', 'ru'] as const) {
      setLang(lang);
      for (const k of ['battle.menu.retreat', 'battle.menu.leave', 'battle.menu.resetAll', 'battle.menu.skip', 'battle.menu.settings', 'battle.menu.soundOn', 'battle.menu.soundOff', 'battle.menu.continues', 'battle.menu.key', 'battle.more.key'] as const) {
        expect(t(k), `${lang} ${k}`).not.toBe(k);
      }
    }
    setLang('en');
  });
});

describe('the medallion rail (hud.md Z5)', () => {
  it('shows at most 3, then the More key', () => {
    expect(railLayout(2, 300, 400)).toEqual({ shown: 2, more: false });
    expect(railLayout(3, 300, 400)).toEqual({ shown: 3, more: false });
    expect(railLayout(5, 300, 400)).toEqual({ shown: RAIL_MAX, more: true });
  });

  it('shows 2 on a field under 420 pt', () => {
    expect(railLayout(3, RAIL_SHORT_FIELD - 1, 400)).toEqual({ shown: 2, more: true });
  });

  it('never runs past its room: what does not fit goes behind More', () => {
    const room = 2 * (MED_H + 4) + MORE_H + 4;
    expect(railLayout(3, 300, room)).toEqual({ shown: 2, more: true });
    for (let n = 1; n <= 5; n++)
      for (const r of [40, 80, 120, 160, 200, 260]) {
        const { shown, more } = railLayout(n, 300, r);
        expect(shown).toBeLessThanOrEqual(RAIL_MAX);
        expect(shown).toBeLessThanOrEqual(n);
        expect(more).toBe(shown < n);
        if (shown > 0) expect(shown * (MED_H + 4) + (more ? MORE_H + 4 : 0)).toBeLessThanOrEqual(r);
      }
  });
});

describe('badge markers (hud.md §G; RD-02 hand-off)', () => {
  const readout = { state: 'steady' as const, standard: false, captain: false, disordered: false, flanked: false };
  const spec = (o: Record<string, unknown>) => ({ numeral: 'I', mine: true, selected: false, readout: { ...readout, ...(o.readout as object) }, ...o }) as Parameters<typeof badgeMarkers>[0];

  it('feinting and a queued step get their own markers', () => {
    expect(badgeMarkers(spec({ feinting: true }))).toEqual(['feint']);
    expect(badgeMarkers(spec({ queued: true }))).toEqual(['queued']);
    expect(badgeMarkers(spec({ feinting: true, queued: true }))).toEqual(['feint', 'queued']);
  });

  it('at most 2 markers, by priority: reticle, rank, disordered, feint, queued', () => {
    const all = spec({ focused: true, feinting: true, queued: true, readout: { captain: true, disordered: true } });
    expect(badgeMarkers(all)).toEqual(['reticle', 'crest']);
    expect(badgeMarkers(all).length).toBe(BADGE_MARKERS_MAX);
    expect(badgeMarkers(spec({ feinting: true, queued: true, readout: { disordered: true } }))).toEqual(['disordered', 'feint']);
  });

  it('the badge rebuilds when a marker changes', () => {
    expect(badgeKey(spec({ feinting: true }))).not.toBe(badgeKey(spec({})));
    expect(badgeKey(spec({ queued: true }))).not.toBe(badgeKey(spec({ feinting: true })));
  });
});

describe('the top bar words fit their keys at the text floor (hud.md §C Z1)', () => {
  it('Menu, Pause, Play in en and ru fit a 30 UI px key at 6.5', () => {
    for (const lang of ['en', 'ru'] as const) {
      setLang(lang);
      for (const k of ['battle.menu.key', 'battle.strip.pause', 'battle.strip.play'] as const) expect(measureText(t(k), true, 6.5), `${lang} ${k}`).toBeLessThanOrEqual(30 - 4);
    }
    setLang('en');
  });
});
