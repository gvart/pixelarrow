import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: {} }));
import { isMobileDevice, renderScaleFor } from '../src/platform/renderScale';

describe('render scale', () => {
  it('follows the screen density in quarter steps, at most 3x on a desktop', () => {
    expect(renderScaleFor(1, false)).toBe(1);
    expect(renderScaleFor(1.3, false)).toBe(1.25);
    expect(renderScaleFor(2, false)).toBe(2);
    expect(renderScaleFor(4, false)).toBe(3);
    expect(renderScaleFor(0, false)).toBe(1);
  });

  it('stops at 2x on a phone (texture memory grows with its square; iOS WebViews crash past their budget)', () => {
    expect(renderScaleFor(3, true)).toBe(2);
    expect(renderScaleFor(2.625, true)).toBe(2);
    expect(renderScaleFor(1.5, true)).toBe(1.5);
  });

  it('knows phones and tablets, iPadOS included', () => {
    expect(isMobileDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15')).toBe(true);
    expect(isMobileDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile')).toBe(true);
    expect(isMobileDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 5)).toBe(true);
    expect(isMobileDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 0)).toBe(false);
    expect(isMobileDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130')).toBe(false);
  });
});
