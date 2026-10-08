import { describe, expect, it } from 'vitest';
import { Campaign, scrapValue } from '../src/game/campaign';
import { MUSTER, canField, classRows, fieldHeroes, fieldIds, musterOf, reserveChanges, shiftClass, toggleReserve } from '../src/game/muster';
import type { Hero } from '../src/data/units';

/** A campaign with `n` men, the first `wounded` of them resting. */
function army(n: number, wounded = 0): Campaign {
  const c = Campaign.fresh(77);
  c.data.gold = 10_000;
  while (c.data.heroes.length < n) c.recruit();
  c.data.heroes.forEach((h, i) => {
    h.group = i % 4;
    h.wound = i < wounded ? 12 : 0;
  });
  return c;
}

describe('the muster', () => {
  it('fields the fit men up to the caps, in roster order, and keeps the reserve and the wounded in camp', () => {
    const c = army(18, 2);
    const m = musterOf(c.data.heroes);
    const field = fieldIds(m);
    expect(field).toHaveLength(MUSTER.fieldCap);
    expect(field).not.toContain(c.data.heroes[0].id);
    expect(field).not.toContain(c.data.heroes[1].id);
    // the oldest fit men march first
    expect(field[0]).toBe(c.data.heroes[2].id);
    c.setReserve(c.data.heroes[2].id, true);
    expect(fieldHeroes(c.data.heroes).map((h) => h.id)).not.toContain(c.data.heroes[2].id);
    expect(c.fitHeroes()).toHaveLength(MUSTER.fieldCap);
    expect(c.reserves().length).toBe(18 - MUSTER.fieldCap);
  });

  it('caps a battle group at groupCap for the men joining it, never cutting the standing formation', () => {
    const c = army(14);
    for (const h of c.data.heroes) h.group = 0;
    const m = musterOf(c.data.heroes);
    expect(fieldIds(m)).toHaveLength(MUSTER.fieldCap);
    expect(canField(m, c.data.heroes[13].id)).toBe('cap');
    // a full group: a man sent to the reserve cannot come back while it stays full
    const c2 = army(8);
    for (const h of c2.data.heroes) h.group = 0;
    c2.setReserve(c2.data.heroes[7].id, true);
    const m2 = musterOf(c2.data.heroes);
    expect(fieldIds(m2)).toHaveLength(7);
    expect(canField(m2, c2.data.heroes[7].id)).toBe('group');
    c2.data.heroes[7].group = 1;
    expect(canField(musterOf(c2.data.heroes), c2.data.heroes[7].id)).toBeNull();
  });

  it('toggles a man between the formation and the reserve, never emptying the formation', () => {
    const c = army(3);
    const m = musterOf(c.data.heroes);
    expect(toggleReserve(m, m[0].id)).toEqual({ ok: true, reserve: true });
    expect(toggleReserve(m, m[1].id)).toEqual({ ok: true, reserve: true });
    expect(toggleReserve(m, m[2].id)).toEqual({ ok: false, why: 'last' });
    expect(toggleReserve(m, m[0].id)).toEqual({ ok: true, reserve: false });
    m[1].wounded = true;
    expect(toggleReserve(m, m[1].id)).toEqual({ ok: false, why: 'wounded' });
    const changes = reserveChanges(musterOf(c.data.heroes), m);
    expect(changes).toEqual({ [m[1].id]: true });
  });

  it('refuses to field past the formation cap and explains why', () => {
    const c = army(15);
    const m = musterOf(c.data.heroes);
    const out = m.find((h) => !fieldIds(m).includes(h.id))!;
    expect(canField(m, out.id)).toBe('cap');
    expect(toggleReserve(m, out.id)).toEqual({ ok: false, why: 'cap' });
  });

  it('+/- per unit type fields the strongest reserve of a class and benches the weakest', () => {
    const c = army(6);
    const m = musterOf(c.data.heroes);
    const rows = classRows(m);
    expect(rows.reduce((a, r) => a + r.total, 0)).toBe(6);
    const cls = rows[0].cls;
    const before = rows[0].field;
    const r = shiftClass(m, cls, -1);
    expect(r.ok).toBe(true);
    expect(classRows(m).find((x) => x.cls === cls)!.field).toBe(before - 1);
    const benched = m.find((h) => h.id === (r as { id: string }).id)!;
    const fieldedOfClass = m.filter((h) => h.cls === cls && fieldIds(m).includes(h.id));
    for (const h of fieldedOfClass) expect(h.power).toBeGreaterThanOrEqual(benched.power);
    const back = shiftClass(m, cls, 1);
    expect(back.ok).toBe(true);
    expect(classRows(m).find((x) => x.cls === cls)!.field).toBe(before);
    expect(shiftClass(m, cls, 1)).toEqual({ ok: false, why: 'wounded' });
  });

  it('older saves without the flag field everyone fit, up to the cap', () => {
    const c = army(5);
    for (const h of c.data.heroes as (Hero & { reserve?: boolean })[]) delete h.reserve;
    expect(c.fitHeroes()).toHaveLength(5);
  });

  it('scraps a stash item for supplies in camp', () => {
    const c = army(3);
    const w = c.world;
    const it = c.data.stash[0];
    const sup = w.supplies;
    const got = c.scrap(it.uid);
    expect(got).toBe(scrapValue(it));
    expect(got).toBeGreaterThanOrEqual(1);
    expect(w.supplies).toBeCloseTo(Math.min(120, sup + got));
    expect(c.data.stash.find((x) => x.uid === it.uid)).toBeUndefined();
    expect(c.scrap('nope')).toBe(-1);
  });
});
