/**
 * W-72 proposal, rival warlords in the live room: the room runs the director of a region in a domain, sends `warlords`
 * (the list on change, the notes; a raid's warning only to its target team), counts the players present as pressure,
 * keeps the warlords across a save and restore, and leaves rooms outside every domain alone.
 */
import { describe, expect, it } from 'vitest';
import { NET_VERSION, type JoinMsg, type ServerMsg } from '../../../src/war/net/protocol';
import { domainOf, WARLORD, WARLORDS, warlordsOf } from '../../../src/data/warWarlords';
import { WORLD_REGIONS } from '../../../src/war/world/regions';
import type { RegionData } from '../../../src/war/types';
import { WarRoom } from '../../src/war/room';
import { warRegion } from '../../src/war/regions';

const W = WARLORDS[0], SEAT = W.seat, MARCH = domainOf(W)[1];
const join = (pid: number, team: number, region: string): JoinMsg => ({ t: 'join', v: NET_VERSION, region, playerId: pid, team, army: [{ cls: 'hoplite', count: 4 }] });

function flat(id: string, n = 160): RegionData {
  return {
    id, name: id, w: n, h: n, height: Array(n * n).fill(1), terrain: Array(n * n).fill('grass'), water: Array(n * n).fill(0),
    entries: (['N', 'E', 'S', 'W'] as const).map((side) => ({ side, x: side === 'W' ? 0 : side === 'E' ? n - 4 : n / 2 - 2, y: side === 'N' ? 0 : side === 'S' ? n - 4 : n / 2 - 2, w: 4, h: 4 })),
    noBuild: [], objects: [], lairs: [], claimPoints: [{ x: 60, y: 80, lairs: [] }],
  };
}

function live(room: WarRoom) {
  const msgs = new Map<number, ServerMsg[]>();
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) for (const [pid, ms] of room.tick().msgs) (msgs.get(pid) ?? msgs.set(pid, []).get(pid)!).push(...ms);
  };
  const lords = (pid: number) => (msgs.get(pid) ?? []).flatMap((m) => (m.t === 'warlords' ? [m] : []));
  return { step, lords, notes: (pid: number) => lords(pid).flatMap((m) => m.ev ?? []) };
}

describe('W-72 warlords in the live room', () => {
  it('a seat room: his hall at claim point 0, the lord, the list on the wire', () => {
    const region = warRegion(SEAT)!;
    const room = new WarRoom({ region, seed: 1, cap: 600, warlords: true });
    room.setWarlordAge(0);
    room.join(1, join(1, 0, SEAT));
    const { step, lords } = live(room);
    step(WARLORD.think * 3);
    const list = lords(1).flatMap((m) => m.list ?? []).at(-1)!;
    expect(list).toMatchObject({ id: W.id, seat: true });
    expect(list.holds[0]).toMatchObject({ place: 'c0', x: region.claimPoints![0].x, y: region.claimPoints![0].y });
    expect(list.lord).toBeGreaterThanOrEqual(0);
    expect(room.present()).toBe(1);
  });

  it('no director outside the domains, nor when not asked for', () => {
    const none = WORLD_REGIONS.find((r) => !warlordsOf(r.id).length)!;
    expect(new WarRoom({ region: flat(none.id), seed: 1, cap: 600, warlords: true }).warlords).toBeNull();
    expect(new WarRoom({ region: flat(SEAT), seed: 1, cap: 600 }).warlords).toBeNull();
  });

  it('a raid is warned only to the target team; the warlords survive a save and restore', () => {
    const region = flat(MARCH);
    const room = new WarRoom({ region, seed: 3, cap: 600, warlords: true });
    room.setWarlordAge(WARLORD.grow.marchDay);
    room.join(1, join(1, 0, MARCH));
    room.join(2, join(2, 1, MARCH));
    room.sim.claim(0, 112, 80, 14);
    room.sim.order({ kind: 'placeBuilding', team: 0, type: 'storehouse', x: 112, y: 80 });
    const { step, notes } = live(room);
    step(2);
    room.sim.finishSite(room.sim.snapshot().buildings!.find((b) => b.type === 'storehouse')!.id);
    // everyone's men far off: the storehouse stands undefended
    for (const s of room.sim.snapshot().squads) if (s.owner.startsWith('p:')) room.sim.order({ kind: 'move', squad: s.id, x: 20, y: 150 });
    step(WARLORD.raid.every + WARLORD.raid.warn + 100);
    expect(notes(1).some((n) => n.what === 'warn' && n.team === 0)).toBe(true);
    expect(notes(2).some((n) => n.what === 'warn')).toBe(false);
    expect(notes(2).some((n) => n.what === 'rise' || n.what === 'took')).toBe(true);
    const st = room.saveState();
    expect(st.warlords).toBeDefined();
    const back = WarRoom.restore({ region, seed: 3, cap: 600, warlords: true }, st, new Map());
    expect(back.warlords!.snaps()[0].holds.map((h) => h.place)).toEqual(room.warlords!.snaps()[0].holds.map((h) => h.place));
  });
});
