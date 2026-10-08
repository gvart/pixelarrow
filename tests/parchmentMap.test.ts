import { describe, expect, it } from 'vitest';
import { getMap } from '../src/online/world';
import { MapFields, bakeChunk, campZone, fogCells, stateSignature } from '../src/art/parchmentMap';
import { archOf, settlementProp } from '../src/art/mapProps';

describe('parchment map', () => {
  const world = getMap('westmed');
  const f = new MapFields(world);

  it('fogs land out of sight and clears the sea near known coasts', () => {
    const known = new Set(world.within(3, 2));
    const fog = fogCells(f, known);
    const at = (id: number) => fog[f.cellIndex(world.pos(id).x, world.pos(id).y)];
    expect(at(3)).toBe(0);
    expect(at(4)).toBe(1); // Roma, far away
    expect(fog.some((v) => v === 0)).toBe(true);
  });

  it('bakes chunks deterministically and signs state changes', () => {
    const st = { fog: fogCells(f, new Set(world.within(3, 3))), owner: new Map<number, number>() };
    const a = bakeChunk(f, st, 1, 5600, 640, 64, 64);
    const b = bakeChunk(f, st, 1, 5600, 640, 64, 64);
    expect(a.w).toBe(64);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    const s0 = stateSignature(f, st, 270, 25, 300, 50);
    const st2 = { fog: st.fog, owner: new Map([[3, 0x3f78c0]]) };
    expect(stateSignature(f, st2, 270, 25, 300, 50)).not.toBe(s0);
  });

  it('has a settlement miniature for every land region and camp zones on camp plots', () => {
    for (const r of world.all()) {
      if (r.kind === 'sea') continue;
      const p = settlementProp(r.kind, r.name, archOf(r.name, r.label[0], r.label[1], r.coast), r.id);
      expect(p, r.name).not.toBeNull();
      expect(p!.ax).toBeGreaterThanOrEqual(0);
      expect(p!.ax).toBeLessThan(p!.pix.w);
    }
    const plot = world.all().find((r) => r.campPlot)!;
    expect(campZone(f, plot.id).length).toBeGreaterThan(3);
  });
});
