/**
 * The HUD layout (src/war/view/hud/layout.ts): for the panel sizes the HUD shows (art px, measured at the audit's
 * screens) at the four audited windows, no two placed panels meet and none leaves the window.
 */
import { describe, expect, it } from 'vitest';
import { clearOnRay, GAP, sideClosers, solve, TOP, type Box, type Frame, type Placed, type Rect, type Stacks } from '../../src/war/view/hud/layout';

/** The audit's windows in art px (CSS px / the auto UI scale). */
const FRAMES: Record<string, Frame> = {
  '1280x800': { w: 1280 / 1.25, h: 800 / 1.25 },
  '1440x900': { w: 1440 / 1.5, h: 900 / 1.5 },
  '1920x1080': { w: 1920 / 1.75, h: 1080 / 1.75 },
  '1100x700': { w: 1100 / 1.25, h: 700 / 1.25 },
};

const b = (id: string, w: number, h: number, o: Partial<Box> = {}): Box => ({ id, w, h, ...o });
const mini = b('minimap', 168, 168), dock = b('rfDock', 106, 36), card = b('rfCard', 487, 90, { dx: 0 });
const guide = b('rfGuide', 262, 356, { min: 34, yields: true }), event = b('rfWorldEv', 264, 70, { yields: true });
const chatShut = b('rfChat', 340, 20, { yields: true }), chatOpen = b('rfChat', 340, 230, { yields: true });

/** The audit's states. */
const STATES: Record<string, Stacks> = {
  'home-roster-chat-beside': { bl: [mini, b('rfChat', 340, 230, { beside: true })], lwin: [b('rrPanel', 300, 520)], bc: [card], br: [dock] },
  'home-guide-chat': { tl: [guide, event], bl: [mini, chatShut], bc: [card, b('rfSoul', 315, 50)], br: [dock] },
  'home-chat-open': { tl: [guide, event], bl: [mini, b('rfLegend', 150, 90), chatOpen], bc: [card, b('rfSoul', 315, 50)], br: [dock] },
  'home-roster-chat': { tl: [guide, event], bl: [mini, b('rfChat', 340, 230, { beside: true })], lwin: [b('rrPanel', 300, 520), b('rrCard', 280, 400)], bc: [card], br: [dock] },
  'ridge-build': { bl: [mini, chatShut], bc: [card, b('rfBuild', 420, 80), b('rfSoul', 315, 50)], br: [dock] },
  'ridge-chest': { bl: [mini, chatShut], bc: [card], br: [dock], rwin: [b('rfChest', 330, 380)], tr: [b('rfQuest', 250, 150)] },
  'boss-fight': {
    tc: [b('rfGuard', 400, 60), b('rfTunnel', 300, 26)], lane: [b('rfBossBanner', 400, 110)],
    tr: [b('rfDev', 163, 24), b('rfNet', 100, 60), b('rfLand', 290, 30, { min: 30 })], bl: [mini, chatOpen], bc: [card], br: [dock],
  },
  'wipe': { tl: [guide], tc: [b('rfTunnel', 330, 26), b('rrToasts', 240, 40)], lane: [b('rfQBanner', 340, 146)], bl: [mini, chatShut], br: [dock] },
};

const meet = (a: Placed, c: Placed) => a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h;

describe('HUD zones', () => {
  for (const [vp, f] of Object.entries(FRAMES)) {
    for (const [name, st] of Object.entries(STATES)) {
      it(`${vp} ${name}: no two panels meet, all inside the window`, () => {
        const out = Object.entries(solve(f, st)).filter(([, p]) => !p.off);
        for (const [id, p] of out) {
          expect(p.x, `${id} x`).toBeGreaterThanOrEqual(0);
          expect(p.y, `${id} y`).toBeGreaterThanOrEqual(0);
          expect(p.x + p.w, `${id} right`).toBeLessThanOrEqual(f.w + 0.01);
          expect(p.y + p.h, `${id} bottom`).toBeLessThanOrEqual(f.h + 0.01);
        }
        for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
          expect(meet(out[i][1], out[j][1]), `${out[i][0]} meets ${out[j][0]}`).toBe(false);
        }
      });
    }
  }

  it('stacks a column with a gap, the next panel pushed down', () => {
    const p = solve(FRAMES['1920x1080'], { tl: [b('a', 200, 100), b('c', 200, 50)] });
    expect(p.a.y).toBe(TOP);
    expect(p.c.y).toBe(TOP + 100 + GAP);
  });

  it('shrinks the guide (it scrolls) before leaving a panel out, and keeps the open chat', () => {
    const f = FRAMES['1100x700'], p = solve(f, { tl: [guide, event], bl: [mini, chatOpen] });
    expect(p.rfChat.off).toBeUndefined();
    expect(p.rfGuide.h).toBeLessThan(guide.h);
    expect(p.rfGuide.y + p.rfGuide.h).toBeLessThanOrEqual(p.rfChat.y - GAP);
  });

  it('a left window hides the top-left column and the shut chat, and ends above the minimap', () => {
    const p = solve(FRAMES['1440x900'], { tl: [guide], bl: [mini, chatShut], lwin: [b('rrPanel', 300, 800)] });
    expect(p.rfGuide.off).toBe(true);
    expect(p.rfChat.off).toBe(true);
    expect(p.rrPanel.y + p.rrPanel.h).toBeLessThanOrEqual(p.minimap.y - GAP);
  });

  it('an open chat stands beside a left window when there is room, the window keeping the whole column', () => {
    const f = FRAMES['1440x900'], chat = b('rfChat', 340, 230, { beside: true });
    const p = solve(f, { bl: [mini, chat], lwin: [b('rrPanel', 300, 800)], bc: [card] });
    expect(p.rfChat.x).toBeGreaterThanOrEqual(p.rrPanel.x + p.rrPanel.w + GAP);
    expect(p.rrPanel.y + p.rrPanel.h).toBe(p.minimap.y - GAP);
    expect(p.rfChat.y + p.rfChat.h).toBeLessThanOrEqual(p.rfCard.y);
  });

  it('an open chat stays under a left window, which ends above it', () => {
    const p = solve(FRAMES['1100x700'], { bl: [mini, b('rfChat', 340, 230)], lwin: [b('rrPanel', 300, 800), b('rrCard', 280, 400, { dx: 306 })] });
    expect(p.rfChat.off).toBeUndefined();
    expect(p.rrPanel.y + p.rrPanel.h).toBeLessThanOrEqual(p.rfChat.y - GAP);
    expect(p.rrCard.y + p.rrCard.h).toBeLessThanOrEqual(p.rfChat.y - GAP);
  });

  it('the bottom-centre column shares one centre line, moved right as one clear of the minimap', () => {
    // 1520x750 at UI scale 1.25: a card wide enough to meet the minimap under the build bar and the soul prompt
    const f = { w: 1520 / 1.25, h: 750 / 1.25 }, wide = b('rfCard', 880, 110);
    const p = solve(f, { bl: [mini, chatShut], bc: [wide, b('rfBuild', 474, 146), b('rfSoul', 315, 50)], br: [dock] });
    const mid = (q: Placed) => q.x + q.w / 2;
    expect(mid(p.rfBuild)).toBeCloseTo(mid(p.rfCard));
    expect(mid(p.rfSoul)).toBeCloseTo(mid(p.rfCard));
    expect(p.rfCard.x).toBeGreaterThanOrEqual(p.minimap.x + p.minimap.w + GAP);
    expect(p.rfCard.y + p.rfCard.h).toBe(f.h - 4); // on the bottom edge, not lifted over the minimap
    for (const id of ['rfCard', 'rfBuild', 'rfSoul']) {
      expect(meet(p[id], p.minimap), `${id} meets the minimap`).toBe(false);
      expect(meet(p[id], p.rfChat), `${id} meets the chat`).toBe(false);
    }
  });

  it('the bottom-centre column stays centred when nothing is in its way', () => {
    const f = FRAMES['1920x1080'], p = solve(f, { bl: [mini], bc: [card, b('rfBuild', 420, 80)], br: [dock] });
    expect(p.rfCard.x + p.rfCard.w / 2).toBeCloseTo(f.w / 2);
    expect(p.rfBuild.x + p.rfBuild.w / 2).toBeCloseTo(f.w / 2);
  });

  it('a shrunk menu window that fills its column to the card stays shown (no float drift leaves it out)', () => {
    // measured live at 1280x720 (UI scale 1.25), a 12-man squad selected, Tasks opened
    const f = { w: 1024, h: 576 }, wide = b('rfCard', 541.6, 100.1);
    const p = solve(f, { tr: [b('rfDev', 162.9625, 23), b('rfTasks', 360, 491.3, { min: 120 })], bl: [mini], bc: [wide], br: [dock] });
    expect(p.rfTasks.off).toBeUndefined();
    expect(p.rfTasks.y + p.rfTasks.h).toBeLessThanOrEqual(p.rfCard.y - GAP + 1e-6);
  });

  it('the chest opens above the command card where they would meet', () => {
    const f = FRAMES['1100x700'], wide = b('rfCard', 600, 90), p = solve(f, { bc: [wide], br: [dock], rwin: [b('rfChest', 330, 300)] });
    expect(p.rfChest.y + p.rfChest.h).toBeLessThanOrEqual(p.rfCard.y - GAP);
  });

  it('one window a side: the market opening closes the roster and its card, a companion opens beside its window', () => {
    expect(sideClosers(['rrPanel', 'rrCard'], ['rrPanel', 'rrCard', 'rfMarket'])).toEqual(['rrPanel', 'rrCard']);
    expect(sideClosers(['rfMarket'], ['rfMarket', 'rfHandoff'])).toEqual([]); // the hand-off beside the market
    expect(sideClosers(['rrPanel'], ['rrPanel', 'rrCard'])).toEqual([]); // the soldier card beside the roster
    expect(sideClosers(['rfTasks'], ['rfTasks', 'rfChest'])).toEqual([]); // the right side is the menus' own
    expect(sideClosers([], ['rrPanel', 'rrCard'])).toEqual([]); // opened together
  });

  // 1280x720 at UI scale 1.25 in CSS px: the minimap bottom left, the command card bottom centre, the dock bottom right
  const HUD_1280: Rect[] = [{ l: 5, t: 505, r: 215, b: 715 }, { l: 302, t: 590, r: 979, b: 715 }, { l: 1146, t: 674, r: 1279, b: 719 }];
  const area = { x0: 100, y0: 80, x1: 1180, y1: 690 };
  const under = (p: { x: number; y: number }, hw: number, hh: number) => HUD_1280.some((d) => p.x > d.l - hw && p.x < d.r + hw && p.y > d.t - hh && p.y < d.b + hh);

  it('an edge pointer towards the bottom-left corner stays clear of the minimap and the card, pointing the same way', () => {
    const cx = 640, cy = 385, ex = 120, ey = 690, at = clearOnRay(cx, cy, ex, ey, 90, 18, area, HUD_1280);
    expect(under(at, 90, 18)).toBe(false);
    expect(at.x).toBeLessThan(cx);
    expect(at.y).toBeGreaterThan(cy);
  });

  it('an edge pointer below the card keeps clear of it', () => {
    const at = clearOnRay(640, 385, 640, 690, 110, 18, area, HUD_1280);
    expect(under(at, 110, 18)).toBe(false);
    expect(at.y).toBeLessThanOrEqual(590 - 18);
  });

  it('an edge pointer with nothing in its way stays on the edge', () => {
    expect(clearOnRay(640, 385, 1180, 200, 80, 18, area, HUD_1280)).toEqual({ x: 1180, y: 200 });
  });
});
