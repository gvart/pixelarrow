import { describe, expect, it } from 'vitest';
import { CLASSES, type ClassId } from '../src/data/classes';
import { CLASS_GEAR, classGearBlocker } from '../src/data/gearRules';
import { ITEMS } from '../src/data/items';
import { SHEET_TIERS, TIER_BANDS, TIER_RULE, gearTier, type SheetTier } from '../src/art/sheetManifest';

const GEAR_CLASSES = Object.keys(CLASS_GEAR);
const defs = Object.values(ITEMS);

/** Per slot the class may fill, the item tiers it may wear there (0 = left empty). */
function slotTiers(cls: string): number[][] {
  return TIER_RULE.slots
    .map((s) => [...new Set(defs.filter((d) => d.slot === s && classGearBlocker(cls, d) === null).map((d) => d.tier))])
    .filter((ts) => ts.length)
    .map((ts) => [0, ...ts]);
}

/** Every worn-tier list the class can put together (empty slots dropped). */
function outfits(cls: string): number[][] {
  let out: number[][] = [[]];
  for (const ts of slotTiers(cls)) out = out.flatMap((o) => ts.map((t) => (t ? [...o, t] : o)));
  return out;
}

/** The kit's lowest and highest outfit at kit tier t (0..2), as worn tiers. */
function kitEnds(cls: ClassId, t: number): [number[], number[]] {
  const lo: number[] = [];
  const hi: number[] = [];
  for (const s of TIER_RULE.slots) {
    const ts = (CLASSES[cls].kit[s]?.[t] ?? []).map((id) => (id && ITEMS[id] ? ITEMS[id].tier : 0));
    if (!ts.length) continue;
    if (Math.min(...ts)) lo.push(Math.min(...ts));
    if (Math.max(...ts)) hi.push(Math.max(...ts));
  }
  return [lo, hi];
}

const rank = (t: SheetTier) => SHEET_TIERS.indexOf(t);

describe('gear tier rule, per class (V5-088 as revised)', () => {
  it('has a band for every class with gear and none for animals', () => {
    expect(Object.keys(TIER_BANDS).sort()).toEqual([...GEAR_CLASSES].sort());
    expect(gearTier('wolf', [3, 3])).toBe('basic');
  });

  it('keeps every band monotonic', () => {
    for (const c of GEAR_CLASSES) {
      const b = TIER_BANDS[c];
      expect(b.hi, c).toBeGreaterThan(b.lo);
      expect(b.veteranFrom, c).toBeGreaterThan(b.lo);
      expect(b.eliteFrom, c).toBeGreaterThan(b.veteranFrom);
      expect(b.hi, c).toBeGreaterThan(b.eliteFrom);
    }
  });

  it('lets every class reach basic, veteran and elite with gear it may wear', () => {
    for (const c of GEAR_CLASSES) {
      const seen = new Set(outfits(c).map((o) => gearTier(c, o)));
      expect([...seen].sort(), c).toEqual([...SHEET_TIERS].sort());
    }
  });

  it('never lowers the tier when a piece is added or upgraded', () => {
    for (const c of GEAR_CLASSES) {
      const slots = slotTiers(c);
      let outs: number[][] = [[]];
      for (const ts of slots) outs = outs.flatMap((o) => ts.map((t) => [...o, t]));
      for (const o of outs) {
        const tier = rank(gearTier(c, o.filter(Boolean)));
        o.forEach((t, i) => {
          const up = slots[i].filter((u) => u > t);
          for (const u of up) {
            const better = o.map((x, j) => (j === i ? u : x)).filter(Boolean);
            expect(rank(gearTier(c, better)), `${c} ${o} slot ${i} -> ${u}`).toBeGreaterThanOrEqual(tier);
          }
        });
      }
    }
  });

  it('draws a class kit-tier 1 levy as basic and its best kit-tier 3 man as elite', () => {
    for (const c of GEAR_CLASSES as ClassId[]) {
      const kitVaries = [0, 1, 2].some((t) => kitEnds(c, t).some((o) => o.join() !== kitEnds(c, 0)[0].join()));
      if (!kitVaries) continue; // the royal guard: one kit, always elite
      expect(gearTier(c, kitEnds(c, 0)[0]), c).toBe('basic');
      expect(gearTier(c, kitEnds(c, 2)[1]), c).toBe('elite');
    }
    expect(gearTier('royal_guard', kitEnds('royal_guard', 0)[0])).toBe('elite');
  });

  it('maps the hoplite sensibly', () => {
    const b = TIER_BANDS.hoplite;
    expect(b.slots).toBe(4);
    expect([b.lo, b.hi]).toEqual([1, 3]);
    expect(gearTier('hoplite', [1, 1, 1, 1])).toBe('basic'); // dory, hoplon, pilos, linothorax
    expect(gearTier('hoplite', [1, 1])).toBe('basic'); // spear and shield only
    expect(gearTier('hoplite', [2, 1, 2, 2])).toBe('veteran'); // bronze dory, hoplon, chalcidian, cuirass-class kit
    expect(gearTier('hoplite', [2, 2, 2, 2])).toBe('veteran');
    expect(gearTier('hoplite', [2, 3, 2, 3])).toBe('elite');
    expect(gearTier('hoplite', [3, 3, 3, 3])).toBe('elite');
  });

  it('lets the classes the old rule capped show all three tiers from their own kit', () => {
    for (const c of ['rhomphaia', 'thessalian'] as ClassId[]) {
      const seen = new Set<SheetTier>();
      for (let t = 0; t < 3; t++) for (const o of kitEnds(c, t)) seen.add(gearTier(c, o));
      expect([...seen].sort(), c).toEqual([...SHEET_TIERS].sort());
    }
  });
});
