import { describe, expect, it } from 'vitest';
import { entrySpot, ownCentre } from '../../src/war/view/entry';
import type { Snapshot } from '../../src/war/types';

const entries = [
  { side: 'N' as const, x: 208, y: 0, w: 96, h: 20 },
  { side: 'E' as const, x: 492, y: 208, w: 20, h: 96 },
];

describe('world entry', () => {
  it("puts a team on its entry's middle, as the server does (0 N, 1 E)", () => {
    expect(entrySpot({ w: 512, h: 512, entries }, 0)).toEqual({ x: 256, y: 10 });
    expect(entrySpot({ w: 512, h: 512, entries }, 1)).toEqual({ x: 502, y: 256 });
  });

  it('falls back to the entry nearest that edge, then the map middle', () => {
    expect(entrySpot({ w: 512, h: 512, entries }, 3)).toEqual({ x: 256, y: 10 }); // no W entry: N is nearer (0, 256) than E
    expect(entrySpot({ w: 100, h: 60, entries: [] }, 2)).toEqual({ x: 50, y: 30 });
  });

  it("centres on the player's living men only", () => {
    const s = {
      squads: [{ id: 0, team: 1 }, { id: 1, team: 0 }],
      units: [
        { squad: 0, x: 0, y: 0, state: 'idle' },
        { squad: 1, x: 10, y: 20, state: 'idle' },
        { squad: 1, x: 30, y: 40, state: 'move' },
        { squad: 1, x: 500, y: 500, state: 'dead' },
      ],
    } as unknown as Snapshot;
    expect(ownCentre(s)).toEqual({ x: 20, y: 30 });
    expect(ownCentre({ ...s, squads: [{ id: 0, team: 1 }] } as unknown as Snapshot)).toBeNull();
    expect(ownCentre(null)).toBeNull();
  });
});
