/**
 * The region view plays as the signed-in player's alliance (src/war/view/side.ts), not as team 0: a Kyrene player
 * (team 2) gets his own fog, colours, selection, entry and cards.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isMine, myTeam, setMyTeam, slot } from '../../src/war/view/side';
import { entrySpot, ownCentre } from '../../src/war/view/entry';
import { fogged } from '../../src/war/view/simClient';
import type { BuildingSnap, Snapshot } from '../../src/war/types';

const KYRENE = 2;

afterEach(() => setMyTeam(0));

const snap = {
  tick: 1,
  squads: [{ id: 0, team: 0, owner: 'p:1', order: 'hold', units: [1] }, { id: 1, team: KYRENE, owner: 'you', order: 'hold', units: [2, 3] }],
  units: [
    { id: 1, squad: 0, x: 50, y: 50, state: 'idle' },
    { id: 2, squad: 1, x: 10, y: 90, state: 'idle' },
    { id: 3, squad: 1, x: 30, y: 90, state: 'move' },
  ],
  buildings: [
    { id: 10, team: 0, x: 60, y: 60, tiles: [60, 60] },
    { id: 11, team: KYRENE, x: 20, y: 95, tiles: [20, 95] },
  ],
  sieges: [{ id: 20, team: 0, x: 55, y: 55 }, { id: 21, team: KYRENE, x: 15, y: 92 }],
  shots: [],
} as unknown as Snapshot;

describe('the player side for a Kyrene player (team 2)', () => {
  it('is set by the welcome and asked by isMine', () => {
    setMyTeam(KYRENE);
    expect(myTeam()).toBe(KYRENE);
    expect(isMine(KYRENE)).toBe(true);
    expect(isMine(0)).toBe(false);
  });

  it('draws his side in the own colour slot and Dodona in his', () => {
    setMyTeam(KYRENE);
    expect([0, 1, 2, 3].map(slot)).toEqual([2, 1, 0, 3]);
    setMyTeam(0);
    expect([0, 1, 2, 3].map(slot)).toEqual([0, 1, 2, 3]);
  });

  it('enters from the south and opens the camera on his men', () => {
    const entries = [{ side: 'N' as const, x: 208, y: 0, w: 96, h: 20 }, { side: 'S' as const, x: 208, y: 492, w: 96, h: 20 }];
    expect(entrySpot({ w: 512, h: 512, entries }, KYRENE)).toEqual({ x: 256, y: 502 });
    expect(ownCentre(snap, KYRENE)).toEqual({ x: 20, y: 90 });
  });

  it('keeps his own side whole under the fog and hides the unseen foe', () => {
    const sees = (_x: number, y: number) => y > 80; // he sees only the south
    const f = fogged(snap, KYRENE, sees, []);
    expect(f.units.map((u) => u.id)).toEqual([2, 3]);
    expect(f.buildings!.map((b) => b.id)).toEqual([11]);
    expect(f.sieges!.map((e) => e.id)).toEqual([21]);
    // a foe building seen before stays drawn where it was last seen
    const seen = [{ id: 10, team: 0, x: 60, y: 60, tiles: [60, 60] }] as unknown as BuildingSnap[];
    expect(fogged({ ...snap, buildings: [] }, KYRENE, sees, seen).buildings!.map((b) => b.id)).toEqual([10]);
  });

  it('selects only his own men', async () => {
    setMyTeam(KYRENE);
    vi.stubGlobal('window', { addEventListener: () => undefined });
    const { Selection } = await import('../../src/war/view/select');
    const scene = { sim: { address: null as unknown, cur: { units: [] } }, selected: new Set<number>() };
    const sel = new Selection(scene as never);
    const drawn = snap.units.map((u) => ({ u, x: u.x, y: u.y, facing: 0, team: u.squad === 0 ? 0 : KYRENE }));
    sel.sync(drawn as never);
    sel.set([1, 2, 3]);
    expect([...sel.units]).toEqual([2, 3]);
    vi.unstubAllGlobals();
  });
});
