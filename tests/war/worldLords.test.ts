/**
 * W-76 proposal, live warlords on the world map (src/war/world-view/lords.ts): the pennants follow what the region rooms
 * last reported (RegionState.lords): a land he holds nothing in loses its pennant, a land no room has reported keeps the
 * domain's, a raid warned or under way rings its land (for a few minutes at most), a fallen lord shows his hall only,
 * struck, with the time he is back; the card's numbers add up his lands.
 */
import { describe, expect, it } from 'vitest';
import { domainOf, WARLORDS } from '../../src/data/warWarlords';
import type { LordWorld, RegionState } from '../../src/war/net/world';
import { lordInfo, lordMarks, RAID_SHOW_MS } from '../../src/war/world-view/lords';

const W = WARLORDS[0], [SEAT, ...LANDS] = domainOf(W), NOW = 1_000_000_000;
const region = (id: string, lords?: LordWorld[]): RegionState => ({ id, owner: -1, claims: [0, 0, 0, 0], live: [0, 0, 0, 0], contested: false, besieged: false, ...(lords ? { lords } : {}) });
const marks = (rs: RegionState[], now = NOW) => lordMarks(rs, now).filter((m) => m.id === W.id);

describe('live warlords on the world map', () => {
  it('nothing reported: his whole domain as the static pennants', () => {
    expect(marks([]).map((m) => [m.region, m.seat])).toEqual(domainOf(W).map((r, i) => [r, i === 0]));
    expect(lordInfo(W.id, [], NOW)).toMatchObject({ known: false, holds: 0 });
  });

  it('a land reported empty loses its pennant; held lands carry places and rough men', () => {
    const rs = [region(SEAT, [{ id: W.id, holds: 2, men: 14 }]), region(LANDS[0], [{ id: W.id, holds: 0, men: 0 }])];
    const m = marks(rs);
    expect(m.find((x) => x.region === SEAT)).toMatchObject({ seat: true, holds: 2, men: 14 });
    expect(m.some((x) => x.region === LANDS[0])).toBe(false);
    expect(lordInfo(W.id, rs, NOW)).toMatchObject({ known: true, holds: 2, men: 14, lands: [SEAT] });
  });

  it('a raid rings its land with its time, then fades a few minutes after it set out', () => {
    const rs = [region(LANDS[0], [{ id: W.id, holds: 1, men: 6, raid: { at: NOW + 40_000 } }])];
    expect(marks(rs).find((x) => x.region === LANDS[0])?.raid).toBe(true);
    expect(lordInfo(W.id, rs, NOW).raid).toEqual({ region: LANDS[0], at: NOW + 40_000 });
    expect(marks(rs, NOW + 40_000 + RAID_SHOW_MS + 1).find((x) => x.region === LANDS[0])?.raid).toBeFalsy();
    expect(lordInfo(W.id, rs, NOW + 40_000 + RAID_SHOW_MS + 1).raid).toBeUndefined();
  });

  it('fallen anywhere: his hall only, struck, with when he is back; after that the live lands again', () => {
    const back = NOW + 3_600_000;
    const rs = [region(SEAT, [{ id: W.id, holds: 0, men: 0, backAt: back }]), region(LANDS[0], [{ id: W.id, holds: 2, men: 9 }])];
    expect(marks(rs)).toEqual([expect.objectContaining({ region: SEAT, seat: true, fallen: true })]);
    expect(lordInfo(W.id, rs, NOW)).toMatchObject({ backAt: back, holds: 0 });
    expect(marks(rs, back + 1).map((m) => m.region)).toEqual(domainOf(W).filter((r) => r !== SEAT));
  });

  it('every lord gets his own pennants', () => {
    expect(new Set(lordMarks([], NOW).map((m) => m.id))).toEqual(new Set(WARLORDS.map((w) => w.id)));
  });
});
