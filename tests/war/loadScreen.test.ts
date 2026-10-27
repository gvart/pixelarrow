import { describe, expect, it } from 'vitest';
import { LoadProgress, PARTS, STALL_MS, regionTitle, sceneReady } from '../../src/war/view/loadScreen';

describe('loading screen', () => {
  it('fills the bar by the parts weights, never backwards', () => {
    const p = new LoadProgress(0);
    expect(p.fraction()).toBe(0);
    const all = Object.values(PARTS).reduce((a, b) => a + b, 0);
    expect(p.set('art', 0.5, 10)).toBe(true);
    expect(p.fraction()).toBeCloseTo((PARTS.art * 0.5) / all);
    expect(p.set('art', 0.25, 20)).toBe(false); // no step back
    expect(p.fraction()).toBeCloseTo((PARTS.art * 0.5) / all);
    for (const k of Object.keys(PARTS) as (keyof typeof PARTS)[]) p.set(k, 1, 30);
    expect(p.fraction()).toBe(1);
  });

  it('counts a stall from the last step forward only', () => {
    const p = new LoadProgress(0);
    p.set('region', 1, 1000);
    expect(p.stalled(1000 + STALL_MS - 1)).toBe(false);
    p.set('region', 1, 1000 + STALL_MS - 1); // the same value again is no progress
    expect(p.stalled(1001 + STALL_MS)).toBe(true);
    p.set('art', 0.1, 1001 + STALL_MS);
    expect(p.stalled(1002 + STALL_MS)).toBe(false);
  });

  it('is ready only with the snapshot, the art, the camera and the view baked', () => {
    const ok = { snap: true, art: true, camera: true, pending: 0 };
    expect(sceneReady(ok)).toBe(true);
    expect(sceneReady({ ...ok, snap: false })).toBe(false);
    expect(sceneReady({ ...ok, art: false })).toBe(false);
    expect(sceneReady({ ...ok, camera: false })).toBe(false);
    expect(sceneReady({ ...ok, pending: 3 })).toBe(false);
    expect(sceneReady({ ...ok, pending: -1 })).toBe(false); // before the first frame
  });

  it('names the region with its kind and lore', () => {
    expect(regionTitle('dodona')).toMatchObject({ name: 'Dodona', kind: 'Home town' });
    expect(regionTitle('dodona').lore).toMatch(/oracle oak/);
    expect(regionTitle('dodona-n').kind).toBe('Borderland');
    const lm = regionTitle('krios');
    expect(lm.kind).toBe('Landmark');
    expect(lm.lore.startsWith('Landmark:')).toBe(false);
    expect(regionTitle('test-ridge')).toEqual({ name: '', kind: 'Region', lore: '' });
  });
});
