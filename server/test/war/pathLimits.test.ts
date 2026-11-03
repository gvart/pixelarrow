/**
 * W-85, W-86, W-101..W-104 in D1 and the room: every way a man can join goes through the path's check. Players are made
 * through the real start (/api/war/start); the numbers come from the table (src/war/world/start.ts).
 */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { isCivClass } from '../../../src/data/classes';
import type { ServerMsg, JoinMsg } from '../../../src/war/net/protocol';
import { NET_VERSION } from '../../../src/war/net/protocol';
import { CAPTIVE, refuses } from '../../../src/war/sim/captives';
import { makePerson, promotesTo } from '../../../src/war/sim/roster';
import { FAMILY_OF } from '../../../src/war/sim/skills';
import { TUNNEL } from '../../../src/war/sim/tunnel';
import { FAMILIES, FAMILY_IDS, PATHS, pathStart, START_CLASSES, type PathId, type StartFamily } from '../../../src/war/world/start';
import { WarRoom } from '../../src/war/room';
import { warRegion } from '../../src/war/regions';
import { armyCount, claimSoul, fitCount, movePerson, type PersonRow } from '../../src/war/persons';
import { namedSoul } from '../../src/war/captives';
import { settleTunnelFor } from '../../src/war/raise';
import { pathOf } from '../../src/war/start';
import { api, devLogin } from '../helpers';

const DB = () => env.DB!;
const HOUR = 3_600_000;
const REGION = 'test-ridge';
type Who = { playerId: number; token: string };
const startPost = (t: string, p: string, json: unknown) => api(`/api/war/start${p}`, { method: 'POST', token: t, json });
const post = (t: string, p: string, json: unknown = {}) => api(`/api/war${p}`, { method: 'POST', token: t, json });
const code = async (r: Response) => ((await r.json()) as { error?: { code: string } }).error?.code;
const family = (c: string) => FAMILY_OF[c as keyof typeof FAMILY_OF];
const row = (id: string) => DB().prepare('SELECT * FROM war_persons WHERE id = ?1').bind(id).first<PersonRow>();
const soul = (id: string, cls: string, level = 1) => makePerson(`soul-${id}`, cls, { level });
const claim = (pid: number, id: string, cls: string) => claimSoul(DB(), pid, soul(id, cls), REGION, Date.now());
const soldiersOf = (path: PathId, f: StartFamily | null) => pathStart(path, f).filter((c) => !isCivClass(c));
interface Roster { persons: { id: string; cls: string; state: string; level: number }[]; caps: { army: number; household: number; fighters: number; path: string | null; family: string | null } }
const roster = async (t: string) => (await api('/api/war/roster', { token: t })).json<Roster>();

/** A player through the whole start, on this path. */
async function onPath(id: number, path: PathId, f: StartFamily | null = null): Promise<Who> {
  const me = await devLogin(id);
  expect((await startPost(me.token, '/alliance', { alliance: 0 })).status).toBe(200);
  expect((await startPost(me.token, '/home', { region: 'dodona' })).status).toBe(200);
  expect((await startPost(me.token, '/path', { path, ...(f ? { family: f } : {}) })).status).toBe(200);
  return me;
}
const CASES: [PathId, StartFamily | null][] = [...FAMILY_IDS.map((f): [PathId, StartFamily] => ['warrior', f]), ['builder', null], ['trader', null]];

describe('the roster and the start', () => {
  it('the first men fit the path: the start grant is within every limit', async () => {
    let id = 8100;
    for (const [path, f] of CASES) {
      const me = await onPath(id++, path, f), r = await roster(me.token);
      expect(r.caps, `${path} ${f}`).toMatchObject({ army: PATHS[path].cap, household: PATHS[path].workers, path, family: f });
      expect(r.caps.fighters).toBeLessThanOrEqual(PATHS[path].cap);
      expect(r.persons.filter((p) => isCivClass(p.cls)).length).toBeLessThanOrEqual(PATHS[path].workers);
    }
  });

  it('pathOf: a player with no path (dev) is NO_PATH', async () => {
    const dev = await devLogin(8110);
    expect(await pathOf(DB(), dev.playerId)).toEqual({ path: null, family: null });
    const b = await onPath(8111, 'builder');
    expect(await pathOf(DB(), b.playerId)).toEqual({ path: 'builder', family: null });
  });
});

describe('a soul claimed in D1', () => {
  it('each path: the man who fills the cap is written, the next is refused and nothing is written', async () => {
    let id = 8120;
    for (const [path, f] of CASES) {
      const me = await onPath(id, path, f), cls = soldiersOf(path, f)[0], tag = `${id++}`;
      for (let k = await armyCount(DB(), me.playerId); k < PATHS[path].cap; k++) expect(await claim(me.playerId, `${tag}-${k}`, cls), `${path} ${k}`).toBe(true);
      expect(await armyCount(DB(), me.playerId)).toBe(PATHS[path].cap);
      expect(await claim(me.playerId, `${tag}-over`, cls), path).toBe(false);
      expect(await row(`soul-${tag}-over`)).toBeNull();
    }
  });

  it('a warrior: out of family refused, nothing written; a builder takes the same man', async () => {
    const me = await onPath(8130, 'warrior', 'line'), b = await onPath(8131, 'builder');
    const other = START_CLASSES.find((c) => family(c) !== 'line')!;
    expect(await claim(me.playerId, '8130-a', other)).toBe(false);
    expect(await row('soul-8130-a')).toBeNull();
    expect(await claim(b.playerId, '8130-a', other)).toBe(true);
  });

  it('a named soul out of family stays a soul for the next claimer', async () => {
    const owner = await onPath(8132, 'warrior', 'shock'), line = await onPath(8133, 'warrior', 'line');
    const mine = (await roster(owner.token)).persons[0];
    await DB().prepare("UPDATE war_persons SET state = 'soul', held_at = ?2 WHERE id = ?1").bind(mine.id, REGION).run();
    const p = namedSoul((await row(mine.id))!, Date.now()).person;
    expect(await claimSoul(DB(), line.playerId, p, REGION, Date.now())).toBe(false);
    expect(await row(mine.id)).toMatchObject({ state: 'soul', player_id: owner.playerId });
    const shock = await onPath(8134, 'warrior', 'shock');
    expect(await claimSoul(DB(), shock.playerId, p, REGION, Date.now())).toBe(true);
    expect(await row(mine.id)).toMatchObject({ state: 'active', player_id: shock.playerId, region: REGION });
  });

  it('a named worker soul moves only under the worker cap', async () => {
    const from = await onPath(8135, 'builder'), to = await onPath(8136, 'warrior', 'line');
    const civ = (await roster(from.token)).persons.find((p) => isCivClass(p.cls))!;
    await DB().prepare("UPDATE war_persons SET state = 'soul', held_at = ?2 WHERE id = ?1").bind(civ.id, REGION).run();
    for (let k = 0; k < PATHS.warrior.workers; k++) {
      const w = makePerson(`w8136-${k}`, 'civ_cook');
      await DB().prepare("INSERT INTO war_persons (id, player_id, cls, state) VALUES (?1, ?2, 'civ_cook', 'active')").bind(w.id, to.playerId).run();
    }
    expect(await movePerson(DB(), civ.id, to.playerId, { from: 'soul', region: REGION }, Date.now())).toBe(false);
    await DB().prepare("UPDATE war_persons SET state = 'dead' WHERE id = 'w8136-0'").run();
    expect(await movePerson(DB(), civ.id, to.playerId, { from: 'soul', region: REGION }, Date.now())).toBe(true);
  });
});

describe('W-102 the Tunnel of Shades', () => {
  const T0 = 1_900_000_000_000, MIN = 60_000;

  it('a floor at cap room 1: one man rises, then none, and he is of the family', async () => {
    const f: StartFamily = 'missile', me = await onPath(8140, 'warrior', f), cls = soldiersOf('warrior', f)[0];
    for (let k = await armyCount(DB(), me.playerId); k < PATHS.warrior.cap - 1; k++) expect(await claim(me.playerId, `8140-${k}`, cls)).toBe(true);
    // all but 2 wounded: far under the floor, one place left under the cap
    await DB().prepare("UPDATE war_persons SET state = 'wounded', until_at = ?2 WHERE player_id = ?1 AND id NOT IN (SELECT id FROM war_persons WHERE player_id = ?1 ORDER BY id LIMIT 2)").bind(me.playerId, T0 + 5000 * MIN).run();
    expect(await armyCount(DB(), me.playerId)).toBe(PATHS.warrior.cap - 1);
    expect(await settleTunnelFor(DB(), me.playerId, T0)).toMatchObject({ alive: 2, nextAt: T0 + TUNNEL.everyMs, pending: 1 });
    expect(await settleTunnelFor(DB(), me.playerId, T0 + 600 * MIN)).toMatchObject({ alive: 3, raised: 1, nextAt: null, pending: 0 });
    expect(await armyCount(DB(), me.playerId)).toBe(PATHS.warrior.cap);
    expect(await settleTunnelFor(DB(), me.playerId, T0 + 1200 * MIN)).toMatchObject({ raised: 0, nextAt: null });
    expect(await armyCount(DB(), me.playerId)).toBe(PATHS.warrior.cap);
  });

  it('a builder\'s floor is his cap: his dead guards come back up to it and no further', async () => {
    const me = await onPath(8141, 'builder');
    await DB().prepare("UPDATE war_persons SET state = 'dead', updated_at = ?2 WHERE player_id = ?1 AND cls NOT LIKE 'civ\\_%' ESCAPE '\\'").bind(me.playerId, T0 - MIN).run();
    expect(await settleTunnelFor(DB(), me.playerId, T0)).toMatchObject({ alive: 0, floor: PATHS.builder.cap, pending: PATHS.builder.cap });
    expect(await settleTunnelFor(DB(), me.playerId, T0 + 600 * MIN)).toMatchObject({ alive: PATHS.builder.cap, raised: PATHS.builder.cap, nextAt: null, pending: 0 });
    expect(await fitCount(DB(), me.playerId)).toBe(PATHS.builder.cap);
    expect(await armyCount(DB(), me.playerId)).toBe(PATHS.builder.cap);
  });

  it('every family\'s wipe raises his own: not a militiaman for a Celt', async () => {
    let id = 8142;
    for (const f of FAMILY_IDS) {
      const me = await onPath(id++, 'warrior', f);
      // no fallen on record: they all left (a dismissal), so the fallback class rises
      await DB().prepare("UPDATE war_persons SET state = 'retired' WHERE player_id = ?1").bind(me.playerId).run();
      await settleTunnelFor(DB(), me.playerId, T0);
      await settleTunnelFor(DB(), me.playerId, T0 + 600 * MIN);
      const men = (await DB().prepare("SELECT cls FROM war_persons WHERE player_id = ?1 AND state = 'active'").bind(me.playerId).all<{ cls: string }>()).results;
      expect(men.length, f).toBe(TUNNEL.floor);
      for (const m of men) expect(family(m.cls), f).toBe(f);
    }
  });
});

describe('a captive asked to join', () => {
  /** Man `cls` of a stranger held by `captor`, past the wait; `refuse`: his roll. */
  async function held(captor: Who, id: string, cls: string, refuse = false): Promise<string> {
    const owner = await devLogin(captor.playerId + 500);
    let k = 0;
    while (refuses(`${id}-${k}`, 1) !== refuse) k++;
    const pid = `${id}-${k}`, until = Date.now() + CAPTIVE.holdMs - CAPTIVE.askMs - HOUR;
    await DB().prepare("INSERT INTO war_persons (id, player_id, cls, level, state, until_at, captor_pid, held_at) VALUES (?1, ?2, ?3, 1, 'captive', ?4, ?5, ?6)").bind(pid, owner.playerId, cls, until, captor.playerId, REGION).run();
    return pid;
  }

  it('out of family: refused before he is asked, for a warrior; he stays captive and has not refused', async () => {
    const me = await onPath(8150, 'warrior', 'line');
    const other = START_CLASSES.find((c) => family(c) !== 'line')!, id = await held(me, 'w8150-a', other, true);
    expect(await code(await post(me.token, `/captives/${id}/join`))).toBe('wrong_family');
    expect(await row(id)).toMatchObject({ state: 'captive', refused: 0 });
  });

  it('a builder at his cap: refused; under it he joins, waiting at home', async () => {
    const me = await onPath(8151, 'builder');
    for (let k = await armyCount(DB(), me.playerId); k < PATHS.builder.cap; k++) expect(await claim(me.playerId, `8151-${k}`, 'archer')).toBe(true);
    const id = await held(me, 'w8151-a', 'slinger');
    expect(await code(await post(me.token, `/captives/${id}/join`))).toBe('army_full');
    await DB().prepare("UPDATE war_persons SET state = 'dead' WHERE id = 'soul-8151-3'").run();
    expect((await post(me.token, `/captives/${id}/join`)).status).toBe(200);
    expect(await row(id)).toMatchObject({ state: 'active', player_id: me.playerId, region: null });
  });
});

describe('promotion', () => {
  it('stays within his family', async () => {
    const dev = await onPath(8160, 'warrior', 'line');
    const hop = (await roster(dev.token)).persons.find((p) => p.cls === 'hoplite')!;
    await DB().prepare(`UPDATE war_persons SET level = 6, honours = '[{"name":"Held the Ford","stat":"armor"}]' WHERE id = ?1`).bind(hop.id).run();
    const foreign = promotesTo(FAMILIES.shock.start[0])[0];
    expect(family(foreign)).not.toBe('line');
    expect(await code(await post(dev.token, `/persons/${hop.id}/promote`, { cls: foreign }))).toBe('not_promotable');
    expect(await row(hop.id)).toMatchObject({ cls: 'hoplite', state: 'active' });
  });
});

describe('W-103 workers', () => {
  /** A builder with `workers` workers and two level-10 soldiers to retire (dev seed, every man at home). */
  async function builderWith(id: number, workers: number): Promise<{ me: Who; vets: string[] }> {
    const me = await onPath(id, 'builder');
    const squad = [{ cls: 'hoplite', level: 10 }, { cls: 'hoplite', level: 10 }, ...Array.from({ length: workers }, () => ({ cls: 'civ_cook' }))];
    expect((await post(me.token, '/dev/seed', { squad })).status).toBe(200);
    return { me, vets: (await roster(me.token)).persons.filter((p) => !isCivClass(p.cls)).map((p) => p.id) };
  }

  it('a builder\'s 6th worker allowed, 7th refused (a veteran retiring into a trade)', async () => {
    const { me, vets } = await builderWith(8170, PATHS.builder.workers - 1);
    expect((await post(me.token, `/persons/${vets[0]}/retire`, { civ: 'civ_smith' })).status).toBe(200);
    expect((await roster(me.token)).persons.filter((p) => isCivClass(p.cls))).toHaveLength(PATHS.builder.workers);
    expect(await code(await post(me.token, `/persons/${vets[1]}/retire`, { civ: 'civ_smith' }))).toBe('household_full');
    expect(await row(vets[1])).toMatchObject({ cls: 'hoplite', state: 'active' });
  });

  it('workers are not soldiers: a full household leaves the soldier cap alone, and the other way round', async () => {
    const { me } = await builderWith(8171, PATHS.builder.workers);
    for (let k = 2; k < PATHS.builder.cap; k++) expect(await claim(me.playerId, `8171-${k}`, 'hoplite')).toBe(true);
    expect(await armyCount(DB(), me.playerId)).toBe(PATHS.builder.cap);
    expect(await claim(me.playerId, '8171-over', 'hoplite')).toBe(false);
  });

  it('a warrior holds 2, a trader 3, as the table says, and level is no way round', async () => {
    for (const [i, path] of (['warrior', 'trader'] as const).entries()) {
      const me = await onPath(8172 + i, path, path === 'warrior' ? 'line' : null);
      const vet = { cls: 'hoplite', level: 10 }, civ = { cls: 'civ_cook' };
      expect((await post(me.token, '/dev/seed', { squad: [vet, ...Array(PATHS[path].workers).fill(civ)] })).status, path).toBe(200);
      const v = (await roster(me.token)).persons.find((p) => !isCivClass(p.cls))!;
      expect(await code(await post(me.token, `/persons/${v.id}/retire`, { civ: 'civ_smith' })), path).toBe('household_full');
    }
  });
});

describe('dev seed', () => {
  it('goes through the check too: past the cap, past the household, out of family', async () => {
    const me = await onPath(8180, 'builder');
    const hop = { cls: 'hoplite' }, civ = { cls: 'civ_cook' };
    expect(await code(await post(me.token, '/dev/seed', { squad: Array(PATHS.builder.cap + 1).fill(hop) }))).toBe('army_full');
    expect(await code(await post(me.token, '/dev/seed', { squad: Array(PATHS.builder.workers + 1).fill(civ) }))).toBe('household_full');
    const w = await onPath(8181, 'warrior', 'line');
    expect(await code(await post(w.token, '/dev/seed', { squad: [{ cls: START_CLASSES.find((c) => family(c) !== 'line')! }] }))).toBe('wrong_family');
    // no squad named: the path's own first men, not a 12-man army of hoplites
    expect((await post(me.token, '/dev/seed', {})).status).toBe(200);
    expect((await roster(me.token)).caps.fighters).toBeLessThanOrEqual(PATHS.builder.cap);
  });
});

describe('the room', () => {
  const region = warRegion('test-ridge')!;
  const room = () => new WarRoom({ region, seed: 3, cap: 600 });
  const join = (pid: number, team: number, n: number, cls: string): JoinMsg => ({ t: 'join', v: NET_VERSION, region: 'test-ridge', playerId: pid, team, army: [{ cls, count: n }] });
  const sent = (r: ReturnType<WarRoom['tick']>, pid: number) => (r.msgs.get(pid) ?? []) as ServerMsg[];

  function claimIn(w: WarRoom, pid: number, cls: string): { soul: number; msgs: ServerMsg[]; souls: number } {
    const sq = w.squadsOf(pid)[0], u = w.snapshot().units.find((x) => x.squad === sq)!;
    const soul = w.sim.spawnSoul(u.x + 2, u.y, cls);
    w.order(pid, { kind: 'claimSoul', squad: sq, soul });
    const msgs: ServerMsg[] = [];
    let souls = 0;
    for (let t = 0; t < 400 && !msgs.some((m) => m.t === 'soul'); t++) {
      const r = w.tick();
      msgs.push(...sent(r, pid));
      souls += r.souls.length;
    }
    return { soul, msgs, souls };
  }

  it('its gate tells a warrior why: a stranger is "family", a full army "full"; a builder takes the stranger', () => {
    const w = room(), other = START_CLASSES.find((c) => family(c) !== 'line')!;
    w.join(1, join(1, 0, 2, 'hoplite'));
    w.tick();
    w.setPath(1, { path: 'warrior', family: 'line' });
    w.setArmy(1, 2);
    const a = claimIn(w, 1, other);
    expect(a.msgs.find((m) => m.t === 'soul')).toMatchObject({ state: 'refused', soul: a.soul, why: 'family', have: 2 });
    expect(a.souls).toBe(0);
    w.setArmy(1, PATHS.warrior.cap);
    const b = claimIn(w, 1, 'hoplite');
    expect(b.msgs.find((m) => m.t === 'soul')).toMatchObject({ state: 'refused', soul: b.soul, why: 'full', have: PATHS.warrior.cap });
    w.setPath(1, { path: 'builder', family: null });
    w.setArmy(1, 2);
    const c = claimIn(w, 1, other);
    expect(c.msgs.find((m) => m.t === 'soul')).toMatchObject({ state: 'claimed', soul: c.soul });
    expect(c.souls).toBe(1);
    // a builder's cap is his own
    w.setArmy(1, PATHS.builder.cap);
    expect(claimIn(w, 1, 'hoplite').msgs.find((m) => m.t === 'soul')).toMatchObject({ state: 'refused', why: 'full', have: PATHS.builder.cap });
  });

  it('a refused family does not close the guide\'s soul step; a full army still does', () => {
    const w = new WarRoom({ region, seed: 3, cap: 600, home: 0 });
    w.join(1, join(1, 0, 2, 'hoplite'));
    w.tick();
    w.setPath(1, { path: 'warrior', family: 'line' });
    w.setArmy(1, 2);
    w.startGuide(1, null);
    w.tick();
    const other = START_CLASSES.find((c) => family(c) !== 'line')!;
    const sq = w.squadsOf(1)[0], u = w.snapshot().units.find((x) => x.squad === sq)!;
    w.order(1, { kind: 'claimSoul', squad: sq, soul: w.sim.spawnSoul(u.x + 2, u.y, other) });
    let got: ReturnType<WarRoom['tick']>['guided'] = [];
    for (let t = 0; t < 400; t++) got = [...got, ...w.tick().guided.filter((d) => d.step === 'soul')];
    expect(got).toEqual([]);
  });

  it('its state keeps who is on what path over a save, so a resumed room still gates him', () => {
    const w = room();
    w.join(1, join(1, 0, 2, 'hoplite'));
    w.tick();
    w.setPath(1, { path: 'trader', family: null });
    expect(w.saveState().paths).toEqual([[1, { path: 'trader', family: null }]]);
  });
});
