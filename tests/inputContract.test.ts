/**
 * IN-02: the menu input contract. Layout-check's rules for text size (A11Y-09) and the tap probe (the v3
 * container-origin quirk, MECH §3), next to the existing 44 pt and 4 pt rules (A11Y-06, A11Y-07); and hover
 * tips for a mouse (A11Y-15).
 */
import { describe, expect, it } from 'vitest';
import { TEXT_MIN_PT, checkLayout, type UiElement } from '../src/ui/layoutCheck';
import { HOVER_MS, canHover, hoverTip, type HoverPointer, type HoverTarget } from '../src/ui/hover';
// @ts-expect-error plain .mjs module without types
import { MATRIX, PER_SCREEN, loadAllowlist, splitEntry, storyOf } from '../scripts/lib/layoutMatrix.mjs';
import layoutCheckSrc from '../scripts/layout-check.mjs?raw';

const el = (id: string, kind: UiElement['kind'], x: number, y: number, w: number, h: number, extra: Partial<UiElement> = {}): UiElement => {
  const rect = { x, y, w, h };
  return { id, kind, rect, visible: rect, scene: 'S', path: id, text: kind === 'text' ? id : undefined, ...extra };
};
const W = { width: 390, height: 844 };
const checks = (els: UiElement[], kind: string) => checkLayout(els, W).filter((v) => v.check === kind).map((v) => v.ids.join('+'));

describe('layout-check: the 44 pt / 4 pt contract (A11Y-06, A11Y-07)', () => {
  it('fails a target under 44 x 44 pt and a gap under 4 pt, and passes 44 pt targets 4 pt apart', () => {
    const els = [
      el('small', 'interactive', 10, 10, 43, 60),
      el('a', 'interactive', 10, 100, 44, 44),
      el('b', 'interactive', 57, 100, 44, 44), // 3 pt from a
      el('c', 'interactive', 10, 200, 44, 44),
      el('d', 'interactive', 58, 200, 44, 44), // 4 pt from c
    ];
    expect(checks(els, 'touch-size')).toEqual(['small']);
    expect(checks(els, 'spacing')).toEqual(['a+b']);
  });
});

describe('layout-check: text size (A11Y-09)', () => {
  it('the floor is 6.5 UI px = 13 CSS px', () => {
    expect(TEXT_MIN_PT).toBe(13);
  });

  it('fails meaningful text under 13 CSS px', () => {
    const els = [el('tiny', 'text', 10, 10, 40, 12, { size: 11 }), el('ok', 'text', 10, 40, 40, 14, { size: 13 }), el('big', 'text', 10, 80, 40, 20, { size: 16 })];
    expect(checks(els, 'text-size')).toEqual(['tiny']);
  });

  it('allows rounding, and skips map labels (they scale with zoom), empty lines and texts of unknown size', () => {
    const els = [
      el('round', 'text', 10, 10, 40, 12, { size: 12.9 }),
      el('map', 'text', 10, 40, 40, 8, { size: 8, world: true }),
      el('blank', 'text', 10, 80, 40, 8, { size: 8, text: '  ' }),
      el('legacy', 'text', 10, 120, 40, 8),
    ];
    expect(checks(els, 'text-size')).toEqual([]);
  });

  it('a hidden text (nothing visible) is not judged', () => {
    const els = [el('scrolled-away', 'text', 10, 10, 40, 10, { size: 8, visible: { x: 10, y: 10, w: 0, h: 0 } })];
    expect(checks(els, 'text-size')).toEqual([]);
  });
});

describe('layout-check: tap probe (MECH §3)', () => {
  it('reports a control whose hit area misses part of what it draws', () => {
    const els = [el('shifted', 'interactive', 10, 10, 60, 44, { tapMiss: 'top-left' }), el('fine', 'interactive', 10, 100, 60, 44)];
    const v = checkLayout(els, W).filter((x) => x.check === 'tap');
    expect(v.map((x) => x.ids[0])).toEqual(['shifted']);
    expect(v[0].detail).toContain('top-left');
  });
});

// ------------------------------------------------------------------ hover

/** A fake game object with a fake clock: `advance(ms)` runs the timers that are due. */
function fake(enabled = true) {
  const handlers = new Map<string, ((p: HoverPointer) => void)[]>();
  let now = 0;
  let timers: { at: number; cb: () => void; live: boolean }[] = [];
  const obj: HoverTarget = {
    scene: {
      time: {
        delayedCall(ms, cb) {
          const t = { at: now + ms, cb, live: true };
          timers.push(t);
          return { remove: () => (t.live = false) };
        },
      },
    },
    input: { enabled },
    on(event, fn) {
      handlers.set(event, [...(handlers.get(event) ?? []), fn]);
      return obj;
    },
    once(event, fn) {
      handlers.set(event, [...(handlers.get(event) ?? []), fn]);
      return obj;
    },
  };
  return {
    obj,
    emit: (event: string, p: HoverPointer = mouse) => handlers.get(event)?.forEach((f) => f(p)),
    advance(ms: number) {
      now += ms;
      const due = timers.filter((t) => t.live && t.at <= now);
      timers = timers.filter((t) => !due.includes(t));
      due.forEach((t) => t.cb());
    },
  };
}
const mouse: HoverPointer = { wasTouch: false, isDown: false };
const finger: HoverPointer = { wasTouch: true, isDown: true };

describe('hover tips (A11Y-15)', () => {
  it('only a mouse that is not pressing hovers', () => {
    expect(canHover(mouse)).toBe(true);
    expect(canHover(finger)).toBe(false);
    expect(canHover({ wasTouch: true, isDown: false })).toBe(false);
    expect(canHover({ wasTouch: false, isDown: true })).toBe(false);
  });

  it('a mouse resting on a control shows its long-press tip after HOVER_MS, and leaving closes it', () => {
    const f = fake();
    const shown: string[] = [];
    let open = 0;
    hoverTip(f.obj, 'Fortified: +2 armour', (text) => {
      shown.push(text);
      open++;
      return { active: true, destroy: () => open-- };
    });
    f.emit('pointerover');
    f.advance(HOVER_MS - 1);
    expect(shown).toEqual([]);
    f.advance(1);
    expect(shown).toEqual(['Fortified: +2 armour']);
    expect(open).toBe(1);
    f.emit('pointerout');
    expect(open).toBe(0);
  });

  it('a touch never shows a hover tip (the long-press does)', () => {
    const f = fake();
    const shown: string[] = [];
    hoverTip(f.obj, 'tip', (t) => shown.push(t));
    f.emit('pointerover', finger);
    f.advance(HOVER_MS * 3);
    expect(shown).toEqual([]);
  });

  it('leaving or pressing before HOVER_MS cancels the tip', () => {
    const f = fake();
    const shown: string[] = [];
    hoverTip(f.obj, 'tip', (t) => shown.push(t));
    f.emit('pointerover');
    f.advance(HOVER_MS / 2);
    f.emit('pointerout');
    f.advance(HOVER_MS);
    f.emit('pointerover');
    f.advance(HOVER_MS / 2);
    f.emit('pointerdown');
    f.advance(HOVER_MS);
    expect(shown).toEqual([]);
  });

  it('reads the tip when it shows (a disabled reason can change), and shows nothing for none', () => {
    const f = fake();
    const shown: string[] = [];
    let tip: string | undefined;
    hoverTip(f.obj, () => tip, (t) => shown.push(t));
    f.emit('pointerover');
    f.advance(HOVER_MS);
    tip = 'Needs 40 gold';
    f.emit('pointerout');
    f.emit('pointerover');
    f.advance(HOVER_MS);
    expect(shown).toEqual(['Needs 40 gold']);
  });

  it('a control whose input is off shows no tip', () => {
    const f = fake(false);
    const shown: string[] = [];
    hoverTip(f.obj, 'tip', (t) => shown.push(t));
    f.emit('pointerover');
    f.advance(HOVER_MS);
    expect(shown).toEqual([]);
  });
});

// ------------------------------------------------------------------ allowlist

describe('layout allowlist (AC1: existing violations, each with its owning story)', () => {
  const allowed: Map<string, string> = loadAllowlist(new URL('../scripts/layout-allowlist', import.meta.url).pathname);
  const keys = [...allowed.keys()];
  /** The foundation screens (owner F in the SCREENS table): clean at the phone portrait sizes, apart from the text-size floor. */
  const foundation = (screen: string) => /^(menu|kit-|codex)/.test(screen) && !screen.startsWith('menu-shop');
  const phonePortrait = new Set([...MATRIX.phone, ...MATRIX.v5]);

  it('keeps every entry in its owning story file (scripts/layout-allowlist/<story>.json)', () => {
    for (const [e, story] of allowed) expect(story, e).toBe(storyOf(splitEntry(e).key.split('|')[0]));
  });

  it('allows a whole screen only for the text-size floor; touch size, spacing and the tap probe stay per element', () => {
    for (const e of keys) {
      const { key, size } = splitEntry(e);
      if (key.endsWith('|*')) expect(key.split('|')[1], e).toBe('text-size');
      if (foundation(key.split('|')[0]) && (!size || phonePortrait.has(size))) expect(key.split('|')[1], e).toBe('text-size');
    }
  });

  it('the script reads the per-story allowlist and per-screen entries', () => {
    expect(layoutCheckSrc).toContain("join(root, 'scripts/layout-allowlist')");
    expect(PER_SCREEN).toEqual(new Set(['text-size']));
  });
});
