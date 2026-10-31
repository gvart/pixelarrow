/**
 * W-79 proposal, early mercy in the region room (server/src/war/room.ts; rule: src/war/sim/depth.ts EARLY): in a home a
 * man the wild knocks down stays listed in the field (personsHere: no rejoin can claim him twice), the fight report
 * leaves him out, and once he is up he is a living man on the wire again.
 */
import { describe, expect, it } from 'vitest';
import { NET_VERSION, type JoinMsg } from '../../../src/war/net/protocol';
import { EARLY } from '../../../src/war/sim/depth';
import { makePerson } from '../../../src/war/sim/roster';
import { WarRoom } from '../../src/war/room';
import { warRegion } from '../../src/war/regions';

const region = warRegion('dodona')!;

describe('W-79 early mercy online', () => {
  it('a man knocked down at home stays here, goes unreported, and gets up', () => {
    const room = new WarRoom({ region, seed: 3, cap: 600, home: 0 });
    const p = makePerson('w79-a', 'militia');
    const m: JoinMsg = { t: 'join', v: NET_VERSION, region: 'dodona', playerId: 1, team: 0, squads: [[p.id]] };
    expect(room.join(1, m, [[p]]).msg.t).toBe('welcome');
    room.tick();
    const sq = room.squadsOf(1)[0], u0 = room.snapshot().units.find((u) => u.squad === sq)!;
    room.sim.addLair({ kind: 'wolf', x: u0.x, y: u0.y - 11, count: 6 }); // near enough to rouse, far enough that home they leave him be
    const fights: ReturnType<WarRoom['tick']>['fights'] = [];
    let down = false;
    for (let t = 0; t < 1200 && !down; t++) {
      fights.push(...room.tick().fights);
      down = !!room.snapshot().units.find((u) => u.id === u0.id)?.down;
    }
    expect(down).toBe(true);
    expect(room.personsHere().has(p.id)).toBe(true);
    // the wolves go home; he lies until the field is quiet, then rises
    let up = false;
    for (let t = 0; t < EARLY.giveUp && !up; t++) {
      fights.push(...room.tick().fights);
      up = room.snapshot().units.find((u) => u.id === u0.id)?.state !== 'dead';
    }
    expect(up).toBe(true);
    expect(fights.flatMap((f) => f.report.persons).filter((x) => x.state !== 'fit')).toEqual([]);
    expect(room.squadsOf(1)).toEqual([sq]);
  }, 60_000);
});
