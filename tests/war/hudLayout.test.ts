/**
 * The HUD layout (src/war/view/hud/layout.ts): for the panel sizes the HUD shows (art px, measured at the audit's
 * screens) at the four audited windows, no two placed panels meet and none leaves the window.
 */
import { describe, expect, it } from 'vitest';
import { GAP, solve, TOP, type Box, type Frame, type Placed, type Stacks } from '../../src/war/view/hud/layout';

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
  'home-guide-chat': { tl: [guide, event], bl: [mini, chatShut], bc: [card, b('rfSoul', 315, 50)], br: [dock] },
  'home-chat-open': { tl: [guide, event], bl: [mini, b('rfLegend', 150, 90), chatOpen], bc: [card, b('rfSoul', 315, 50)], br: [dock] },
  'home-roster-chat': { tl: [guide, event], bl: [mini, chatOpen], lwin: [b('rrPanel', 300, 520), b('rrCard', 280, 400)], bc: [card], br: [dock] },
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

  it('a left window hides the top-left column and the chat, and ends above the minimap', () => {
    const p = solve(FRAMES['1440x900'], { tl: [guide], bl: [mini, chatOpen], lwin: [b('rrPanel', 300, 800)] });
    expect(p.rfGuide.off).toBe(true);
    expect(p.rfChat.off).toBe(true);
    expect(p.rrPanel.y + p.rrPanel.h).toBeLessThanOrEqual(p.minimap.y - GAP);
  });

  it('the chest opens above the command card where they would meet', () => {
    const f = FRAMES['1100x700'], wide = b('rfCard', 600, 90), p = solve(f, { bc: [wide], br: [dock], rwin: [b('rfChest', 330, 300)] });
    expect(p.rfChest.y + p.rfChest.h).toBeLessThanOrEqual(p.rfCard.y - GAP);
  });
});
