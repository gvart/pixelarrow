/** Personal map markers (src/war/view/hud/pinStore.ts): capped per view, removable, kept per scope in storage. */
import { describe, expect, it } from 'vitest';
import { PIN_MAX, PinStore } from '../../src/war/view/hud/pinStore';

const mem = () => {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe('personal markers', () => {
  it('holds at most PIN_MAX: the oldest drops, the new one takes the lowest free number', () => {
    const s = new PinStore('dodona', mem());
    for (let i = 0; i < PIN_MAX; i++) s.add(i, i);
    expect(s.list().map((p) => p.n)).toEqual([1, 2, 3, 4, 5]);
    const p = s.add(9, 9);
    expect(s.list()).toHaveLength(PIN_MAX);
    expect(s.list()[0]).toMatchObject({ n: 2, x: 1 });
    expect(p).toEqual({ n: 1, x: 9, y: 9 });
  });

  it('removes one by its number, and clears all', () => {
    const s = new PinStore('dodona', mem());
    s.add(1, 1); s.add(2, 2); s.add(3, 3);
    s.remove(2);
    expect(s.list().map((p) => p.n)).toEqual([1, 3]);
    expect(s.add(4, 4).n).toBe(2);
    s.clear();
    expect(s.list()).toEqual([]);
  });

  it('survives a reload per scope; a blocked or broken store just forgets', () => {
    const st = mem();
    const a = new PinStore('dodona', st);
    a.add(10.04, 20.06);
    new PinStore('world', st).add(300, 400);
    expect(new PinStore('dodona', st).list()).toEqual([{ n: 1, x: 10, y: 20.1 }]);
    expect(new PinStore('world', st).list()).toEqual([{ n: 1, x: 300, y: 400 }]);
    a.clear();
    expect(st.m.has('pa.war.pins.dodona')).toBe(false);
    st.m.set('pa.war.pins.kyrene', '{not json');
    expect(new PinStore('kyrene', st).list()).toEqual([]);
    const no = () => { throw new Error('blocked'); };
    const b = new PinStore('dodona', { getItem: no, setItem: no, removeItem: no });
    expect(() => b.add(1, 1)).not.toThrow();
    expect(b.list()).toHaveLength(1);
  });
});
