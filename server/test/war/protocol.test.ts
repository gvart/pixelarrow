import { describe, expect, it } from 'vitest';
import { MAX_CLIENT_MSG, NET_VERSION, parseClientMsg, splitQuota } from '../../../src/war/net/protocol';

const join = { t: 'join', v: NET_VERSION, region: 'test-ridge', playerId: 7, team: 2, army: [{ cls: 'hoplite', count: 20 }] };

describe('war net protocol', () => {
  it('accepts the client messages', () => {
    expect(parseClientMsg(JSON.stringify(join))).toMatchObject({ t: 'join', team: 2 });
    expect(parseClientMsg('{"t":"order","o":{"kind":"move","squad":3,"x":10.5,"y":4}}')).toMatchObject({ o: { kind: 'move', squad: 3 } });
    expect(parseClientMsg('{"t":"order","o":{"kind":"formation","squad":0,"shape":"wedge"}}')).not.toBeNull();
    expect(parseClientMsg('{"t":"view","x0":0,"y0":0,"x1":40,"y1":30}')).not.toBeNull();
    expect(parseClientMsg('{"t":"ping","c":1}')).not.toBeNull();
  });

  it('rejects bad, oversized and out-of-slice messages', () => {
    expect(parseClientMsg('not json')).toBeNull();
    expect(parseClientMsg('{"t":"spawn"}')).toBeNull();
    expect(parseClientMsg(JSON.stringify({ ...join, team: 4 }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ ...join, army: [{ cls: 'hoplite', count: 21 }] }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ ...join, army: Array(4).fill({ cls: 'hoplite', count: 1 }) }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ ...join, region: '../x' }))).toBeNull();
    // building is not a live order yet
    expect(parseClientMsg('{"t":"order","o":{"kind":"placeBuilding","team":0,"type":"camp","x":1,"y":1}}')).toBeNull();
    expect(parseClientMsg('{"t":"order","o":{"kind":"move","squad":-1,"x":1,"y":1}}')).toBeNull();
    expect(parseClientMsg(`{"t":"ping","c":1,"pad":"${'x'.repeat(MAX_CLIENT_MSG)}"}`)).toBeNull();
  });

  it('splits the cap between the alliances', () => {
    expect(splitQuota(600)).toEqual([150, 150, 150, 150]);
    expect(splitQuota(602)).toEqual([151, 151, 150, 150]);
  });
});
