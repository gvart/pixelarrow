/**
 * FL-02: scene transitions never swallow a tap (V5-067). Phaser skips input
 * under a container at alpha 0, so every entry fade starts at ENTRY_ALPHA.
 * The live check (a tap 30 ms into a screen's entry lands) is in
 * scripts/regression/hub-flows.mjs.
 */
import { describe, expect, it } from 'vitest';
import baseSrc from '../src/scenes/BaseScene.ts?raw';
import { ENTRY_ALPHA, motion, tweenTo } from '../src/ui/motion';

const code = baseSrc.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

function fakeScene() {
  const added: Record<string, unknown>[] = [];
  const scene = { tweens: { add: (cfg: Record<string, unknown>) => (added.push(cfg), null) }, time: { delayedCall: () => null } };
  return { scene: scene as unknown as Parameters<typeof tweenTo>[0], added };
}

describe('V5-067: entry fades take taps from their first frame', () => {
  it('a tween to a visible alpha starts at ENTRY_ALPHA, not 0 (a sheet sliding in)', () => {
    const was = motion.reduced;
    motion.reduced = false;
    const { scene, added } = fakeScene();
    const box = { alpha: 0, y: 12 };
    tweenTo(scene, box, { y: 0, alpha: 1 }, 240);
    expect(box.alpha).toBe(ENTRY_ALPHA);
    expect(added).toHaveLength(1);
    motion.reduced = was;
  });

  it('a fade out is left alone', () => {
    const was = motion.reduced;
    motion.reduced = false;
    const { scene } = fakeScene();
    const box = { alpha: 0 };
    tweenTo(scene, box, { alpha: 0 }, 180);
    expect(box.alpha).toBe(0);
    motion.reduced = was;
  });

  it('under Reduce motion the change is instant', () => {
    const was = motion.reduced;
    motion.reduced = true;
    const { scene, added } = fakeScene();
    const box = { alpha: 0 };
    tweenTo(scene, box, { alpha: 1 }, 240);
    expect(box.alpha).toBe(1);
    expect(added).toHaveLength(0);
    motion.reduced = was;
  });

  it('the screen entry (BaseScene) starts the ui at ENTRY_ALPHA and never sets alpha 0', () => {
    expect(code).toMatch(/ui\.alpha = ENTRY_ALPHA/);
    expect(code).not.toMatch(/\.alpha = 0\b|setAlpha\(0\)/);
  });

  it('a field transition fades through parchment, Reduce motion and a relayout cut', () => {
    expect(code).toMatch(/fadeIn\(MOTION\.fade/);
    expect(code).toMatch(/instant = motion\.reduced \|\| this\.relayingOut/);
  });
});
