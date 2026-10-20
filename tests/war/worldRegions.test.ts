import { describe, expect, it } from 'vitest';
import { WORLD_REGIONS } from '../../src/war/regions';
import { parseRegion } from '../../src/war/region/schema';
import { mirrorChecks, type Borders } from '../../scripts/war/regions/checks';

const files = import.meta.glob('../../src/war/regions/*.json', { eager: true, import: 'default' });
const HAND = ['elaia', 'kyrene', 'dodona', 'skythia', 'kleisoura', 'omphalos'];

describe('world regions (scripts/war/regions)', () => {
  const regions = WORLD_REGIONS.map((w) => ({ w, r: parseRegion(files[`../../src/war/regions/${w.id}.json`]) as ReturnType<typeof parseRegion> & { meta?: { role: string; draft?: boolean; adjacent: { id: string; side: string }[] } } }));

  it('has all 37, each parsing, 512 x 512, with one entry per neighbour on its side', () => {
    expect(regions).toHaveLength(37);
    for (const { w, r } of regions) {
      expect([r.w, r.h]).toEqual([512, 512]);
      expect(r.meta?.role).toBe(w.role);
      expect(r.entries.map((e) => e.side)).toEqual(r.meta!.adjacent.map((a) => a.side));
    }
  });

  it('lines up every shared border: the exit on one side is the entry on the other', () => {
    expect(mirrorChecks(regions.map(({ w, r }) => ({ id: w.id, ...r }) as unknown as Borders))).toEqual([]);
  });

  it('marks only the 31 not hand-made as drafts', () => {
    for (const { w, r } of regions) expect(!!r.meta?.draft).toBe(!HAND.includes(w.id));
  });

  it('has tin nodes in exactly the two tin regions', () => {
    const tin = regions.filter(({ r }) => r.objects?.some((o) => o.id === 'mountains/tin-ore')).map(({ w }) => w.id).sort();
    expect(tin).toEqual(['achelous', 'kleisoura']);
  });

  it('gives neutral regions lairs and a claim point, homes none', () => {
    for (const { w, r } of regions) {
      if (w.role === 'home') expect(r.lairs ?? []).toHaveLength(0);
      else expect(r.claimPoints?.length).toBeGreaterThan(0);
    }
  });
});
