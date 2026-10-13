/** QA-04: the online camp's per-second refetch sends one request at a time and toasts a repeated error once. */
import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => {
  class C {}
  return { default: { GameObjects: { Container: C, Image: C, Text: C, Graphics: C, Rectangle: C, Zone: C, BitmapText: C, Sprite: C }, Scene: C, Loader: { Events: {} }, Geom: { Rectangle: C }, Math: { Clamp: (v: number) => v } } };
});
const toast = vi.fn();
vi.mock('../src/ui/widgets', async (orig) => ({ ...(await orig<object>()), toast: (...a: unknown[]) => toast(...a) }));
const { CampScene } = await import('../src/scenes/CampScene');

type Fetcher = { fetch(): Promise<void> };
const fetchOf = (self: object) => (CampScene.prototype as unknown as Fetcher).fetch.call(self);

describe('CampScene.fetch', () => {
  it('does not start a second request while one is pending', async () => {
    let done!: (v: unknown) => void;
    const camps = vi.fn(() => new Promise((r) => (done = r)));
    const self = { fetching: false, lastError: '', d: { source: { camps } }, sys: { isActive: () => true }, apply: vi.fn() };
    const a = fetchOf(self);
    void fetchOf(self);
    expect(camps).toHaveBeenCalledTimes(1);
    done({});
    await a;
    expect(self.apply).toHaveBeenCalledTimes(1);
    void fetchOf(self);
    expect(camps).toHaveBeenCalledTimes(2);
    done({});
  });

  it('toasts the same failure once, and again after a success', async () => {
    toast.mockClear();
    let fail = true;
    const camps = vi.fn(async () => {
      if (fail) throw new Error('offline');
      return {};
    });
    const self = { fetching: false, lastError: '', d: { source: { camps } }, sys: { isActive: () => true }, apply: vi.fn() };
    await fetchOf(self);
    await fetchOf(self);
    await fetchOf(self);
    expect(toast).toHaveBeenCalledTimes(1);
    fail = false;
    await fetchOf(self);
    fail = true;
    await fetchOf(self);
    expect(toast).toHaveBeenCalledTimes(2);
  });
});
