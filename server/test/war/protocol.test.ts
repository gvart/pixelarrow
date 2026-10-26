import { describe, expect, it } from 'vitest';
import { MAX_CLIENT_MSG, NET_VERSION, parseClientMsg, splitQuota } from '../../../src/war/net/protocol';

const join = { t: 'join', v: NET_VERSION, region: 'test-ridge', playerId: 7, team: 2, army: [{ cls: 'hoplite', count: 12 }] };

describe('war net protocol', () => {
  it('accepts the client messages', () => {
    expect(parseClientMsg(JSON.stringify(join))).toMatchObject({ t: 'join', team: 2 });
    expect(parseClientMsg('{"t":"order","o":{"kind":"move","squad":3,"x":10.5,"y":4}}')).toMatchObject({ o: { kind: 'move', squad: 3 } });
    expect(parseClientMsg('{"t":"order","o":{"kind":"formation","squad":0,"shape":"wedge"}}')).not.toBeNull();
    expect(parseClientMsg('{"t":"view","x0":0,"y0":0,"x1":40,"y1":30}')).not.toBeNull();
    expect(parseClientMsg('{"t":"ping","c":1}')).not.toBeNull();
    // W-53: any order with a squad may name the men it goes to
    expect(parseClientMsg('{"t":"order","o":{"kind":"move","squad":3,"units":[4,9,17],"x":10.5,"y":4}}')).toMatchObject({ o: { units: [4, 9, 17] } });
    expect(parseClientMsg('{"t":"order","o":{"kind":"gather","squad":0,"units":[1],"node":2}}')).toMatchObject({ o: { units: [1] } });
  });

  it('rejects bad, oversized and out-of-slice messages', () => {
    expect(parseClientMsg('not json')).toBeNull();
    expect(parseClientMsg('{"t":"spawn"}')).toBeNull();
    expect(parseClientMsg(JSON.stringify({ ...join, team: 4 }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ ...join, army: [{ cls: 'hoplite', count: 13 }] }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ ...join, army: Array(4).fill({ cls: 'hoplite', count: 1 }) }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ ...join, region: '../x' }))).toBeNull();
    expect(parseClientMsg('{"t":"order","o":{"kind":"placeBuilding","squad":0,"type":"castle","x":1,"y":1}}')).toBeNull();
    expect(parseClientMsg('{"t":"order","o":{"kind":"attackBuilding","squad":0}}')).toBeNull(); // a target is needed
    expect(parseClientMsg('{"t":"order","o":{"kind":"ignite","squad":0,"building":1,"siege":2}}')).toBeNull(); // one target
    expect(parseClientMsg('{"t":"order","o":{"kind":"placeWall","squad":0,"material":"wood","points":[1,2,3]}}')).toBeNull();
    expect(parseClientMsg('{"t":"order","o":{"kind":"raiseLadder","squad":0,"wallTile":[1,2,3,4]}}')).toBeNull();
    expect(parseClientMsg('{"t":"order","o":{"kind":"move","squad":-1,"x":1,"y":1}}')).toBeNull();
    expect(parseClientMsg('{"t":"order","o":{"kind":"move","squad":0,"units":[],"x":1,"y":1}}')).toBeNull();
    expect(parseClientMsg(`{"t":"order","o":{"kind":"hold","squad":0,"units":[${Array.from({ length: 49 }, (_, i) => i)}]}}`)).toBeNull();
    expect(parseClientMsg('{"t":"order","o":{"kind":"fortify","building":1,"fort":"greekFire"}}')).toBeNull();
    expect(parseClientMsg(`{"t":"ping","c":1,"pad":"${'x'.repeat(MAX_CLIENT_MSG)}"}`)).toBeNull();
  });

  it('accepts work, building, siege and civilian orders and placement checks', () => {
    const ok = (o: object) => expect(parseClientMsg(JSON.stringify({ t: 'order', o }))).toMatchObject({ o });
    ok({ kind: 'attackMove', squad: 0, x: 3, y: 4 });
    ok({ kind: 'stop', squad: 0 });
    ok({ kind: 'gather', squad: 0, node: 4 });
    ok({ kind: 'build', squad: 0, site: 2 });
    ok({ kind: 'placeBuilding', squad: 0, type: 'barracks', x: 10, y: 12, rot: 1 });
    ok({ kind: 'placeBuilding', type: 'brazier', x: 10.5, y: 12.5 });
    ok({ kind: 'placeWall', squad: 1, material: 'timber', points: [1, 1, 9, 1], gates: [5, 1], inside: [5, 4] });
    ok({ kind: 'placeBridge', squad: 1, material: 'wood', points: [1, 1, 9, 1], width: 2 });
    ok({ kind: 'upgrade', building: 3 });
    ok({ kind: 'cancelSite', site: 3 });
    ok({ kind: 'buildSiege', squad: 0, type: 'ram', x: 5, y: 5 });
    for (const type of ['mantlet', 'coveredRam', 'oxybeles', 'siegeTower']) ok({ kind: 'buildSiege', squad: 0, type, x: 5, y: 5 });
    ok({ kind: 'placeBuilding', squad: 0, type: 'stakes', x: 5.5, y: 5.5 });
    ok({ kind: 'placeBuilding', type: 'ditch', x: 5.5, y: 6.5 });
    ok({ kind: 'fortify', building: 2, fort: 'ironGate' });
    ok({ kind: 'fortify', building: 2, fort: 'wetHides' });
    ok({ kind: 'crew', squad: 0, siege: 1 });
    ok({ kind: 'uncrew', squad: 0 });
    ok({ kind: 'deploy', squad: 0, pack: true });
    ok({ kind: 'raiseLadder', squad: 0, wallTile: [17, 20] });
    ok({ kind: 'pushLadder', squad: 0, ladder: 9 });
    ok({ kind: 'attackBuilding', squad: 0, siege: 2 });
    ok({ kind: 'ignite', squad: 0, building: 2 });
    ok({ kind: 'extinguish', squad: 0, building: 2 });
    ok({ kind: 'civWork', squad: 0, building: 0 });
    ok({ kind: 'detach', squad: 0, unitIds: [1, 2, 3, 4] });
    ok({ kind: 'active', squad: 0 });
    expect(parseClientMsg(JSON.stringify({ t: 'check', id: 1, kind: 'building', type: 'camp', x: 1, y: 2 }))).toMatchObject({ t: 'check', kind: 'building' });
    expect(parseClientMsg(JSON.stringify({ t: 'check', id: 2, kind: 'wall', material: 'stone', points: [1, 1, 5, 1] }))).toMatchObject({ kind: 'wall' });
    expect(parseClientMsg(JSON.stringify({ t: 'check', id: 3, kind: 'bridge', material: 'wood', points: [1, 1, 5, 1] }))).toMatchObject({ kind: 'bridge' });
  });

  it('splits the cap between the alliances', () => {
    expect(splitQuota(600)).toEqual([150, 150, 150, 150]);
    expect(splitQuota(602)).toEqual([151, 151, 150, 150]);
  });
});
