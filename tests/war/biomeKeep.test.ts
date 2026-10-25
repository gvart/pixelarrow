import { describe, expect, it } from 'vitest';
// @ts-ignore -- the art build is a node script (no types)
import { keepForeign } from '../../scripts/war/art/keepForeign.mjs';

const obj = (id: string, extra: object = {}) => ({ id, file: `${id}.png`, ...extra });

describe('biome rebuild keeps the objects other scripts wrote (build.mjs --biome)', () => {
  const built = { pxPerMetre: 33, palette: ['#111111', '#222222'], objects: [obj('olive'), obj('vines')] };
  const prev = {
    pxPerMetre: 33,
    borderMax: 0.75,
    palette: ['#111111', '#333333', '#444444'],
    objects: [obj('olive'), obj('town-house-a', { town: true }), obj('town-house-a-ruined', { town: true, state: 'ruined' }), obj('waterfall-tall')],
  };

  it('keeps the town set and hand-composed pieces after the rebuilt ones', () => {
    const { json, kept } = keepForeign(prev, built);
    expect(json.objects.map((o: { id: string }) => o.id)).toEqual(['olive', 'vines', 'town-house-a', 'town-house-a-ruined', 'waterfall-tall']);
    expect(kept).toEqual(['town-house-a', 'town-house-a-ruined', 'waterfall-tall']);
  });

  it('keeps the rebuilt palette first and appends the colours the kept pieces brought', () => {
    const { json } = keepForeign(prev, built);
    expect(json.palette).toEqual(['#111111', '#222222', '#333333', '#444444']);
    expect(json.borderMax).toBe(0.75);
  });

  it('a rebuilt entry replaces its old one, and a first build is passed through', () => {
    const { json } = keepForeign({ ...prev, objects: [obj('olive', { w: 1 })] }, built);
    expect(json.objects.find((o: { id: string }) => o.id === 'olive')).toEqual(obj('olive'));
    expect(keepForeign(null, built).json).toBe(built);
  });
});
