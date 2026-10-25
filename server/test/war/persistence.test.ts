/**
 * M5e in the region room: joins by person id, fights written back to D1 once, state saved and restored after an
 * eviction (the pure WarRoom, then WarRegionDO over the socket with a real eviction).
 */
import { abortAllDurableObjects, env, runDurableObjectAlarm, runInDurableObject, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { NET_VERSION, type JoinMsg, type ServerMsg } from '../../../src/war/net/protocol';
import { makePerson } from '../../../src/war/sim/roster';
import { SIM_VERSION } from '../../../src/sim/version';
import type { WarPerson } from '../../../src/war/types';
import { WarRoom, type Fight } from '../../src/war/room';
import { spot } from './spot';
import { warRegion } from '../../src/war/regions';
import { applyFight, claimForJoin } from '../../src/war/persons';
import { loadState, type WarRegionDO } from '../../src/war/regionDO';
import { api, BASE, devLogin } from '../helpers';

const region = warRegion('test-ridge')!;
const squad = (prefix: string, cls: string, n = 12, level = 1) => Array.from({ length: n }, (_, i) => makePerson(`${prefix}-${i}`, cls, { level }));
const join = (pid: number, team: number, ids: string[][]): JoinMsg => ({ t: 'join', v: NET_VERSION, region: 'test-ridge', playerId: pid, team, squads: ids });
const ids = (g: WarPerson[][]) => g.map((s) => s.map((p) => p.id));

describe('WarRoom with persons', () => {
  it('spawns persons by id, refuses unloaded or class joins when armies are off', () => {
    const r = new WarRoom({ region, seed: 1, cap: 600, allowArmy: false });
    const g = [squad('a', 'hoplite', 12, 4)];
    expect(r.join(1, join(1, 0, ids(g))).msg).toMatchObject({ t: 'refused', reason: 'army', detail: 'soldiers not loaded' });
    expect(r.join(1, { ...join(1, 0, ids(g)), squads: undefined, army: [{ cls: 'hoplite', count: 12 }] }).msg).toMatchObject({ t: 'refused', reason: 'army' });
    expect(r.join(1, join(1, 0, ids(g)), g).msg).toMatchObject({ t: 'welcome', squads: [0] });
    r.tick();
    const units = r.snapshot().units;
    expect(units.map((u) => u.pid)).toEqual(g[0].map((p) => p.id));
    expect(units.every((u) => u.level === 4)).toBe(true);
    expect(r.personsHere()).toEqual(new Set(g[0].map((p) => p.id)));
    expect(r.spawnsNew(1)).toBe(true); // online: a further join brings more squads
    r.leave(1);
    expect(r.spawnsNew(1)).toBe(false); // offline with squads standing: a rejoin
  });

  it('releases the persons of a join that leaves the line', () => {
    const r = new WarRoom({ region, seed: 1, cap: 48 }); // 12 per alliance
    r.join(1, join(1, 0, ids([squad('a', 'hoplite')])), [squad('a', 'hoplite')]);
    const g = [squad('b', 'hoplite', 6)];
    expect(r.join(2, join(2, 0, ids(g)), g).msg).toMatchObject({ t: 'queued' });
    expect(r.personsHere().has('b-0')).toBe(true);
    r.leave(2);
    expect(r.takeReleased()).toEqual(g[0].map((p) => p.id));
    expect(r.takeReleased()).toEqual([]);
  });

  it('reports a finished fight once, and the write-back to D1 is idempotent', async () => {
    const me = await devLogin(7401), foe = await devLogin(7402);
    for (const [who, cls] of [[me, 'hoplite'], [foe, 'archer']] as const)
      expect((await api('/api/war/dev/seed', { method: 'POST', token: who.token, json: { squad: Array(12).fill({ cls, level: 3 }), reserve: [] } })).status).toBe(200);
    const load = async (who: { playerId: number }) => {
      const rows = (await env.DB!.prepare("SELECT id FROM war_persons WHERE player_id = ?1 AND state = 'active' ORDER BY slot").bind(who.playerId).all<{ id: string }>()).results;
      const got = await claimForJoin(env.DB!, who.playerId, 'test-ridge', [rows.map((x) => x.id)], new Set(), Date.now());
      if (typeof got === 'string') throw new Error(got);
      return got;
    };
    const ga = await load(me), gb = await load(foe);
    const r = new WarRoom({ region, seed: 3, cap: 600, fightQuiet: 30 });
    r.join(me.playerId, join(me.playerId, 0, ids(ga)), ga);
    r.join(foe.playerId, join(foe.playerId, 1, ids(gb)), gb);
    r.tick();
    // bring them together and let them fight to the end
    const [sa] = r.squadsOf(me.playerId), [sb] = r.squadsOf(foe.playerId);
    r.order(me.playerId, { kind: 'attack', squad: sa, target: sb });
    r.order(foe.playerId, { kind: 'attack', squad: sb, target: sa });
    const fights: Fight[] = [];
    for (let t = 0; t < 6000 && !fights.length; t++) fights.push(...r.tick().fights);
    expect(fights).toHaveLength(1);
    const f = fights[0];
    expect(f.id).toMatch(new RegExp(`^test-ridge:${r.epoch}:\\d+$`));
    expect(f.report.persons.length).toBeGreaterThan(12);
    const states = new Set(f.report.persons.map((p) => p.state));
    expect(states.has('fit') || states.has('wounded') || states.has('dead')).toBe(true);
    // write it back, twice
    const now = Date.now();
    expect(await applyFight(env.DB!, f.id, 'test-ridge', f.report, now)).toBe(true);
    const read = () => env.DB!.prepare('SELECT id, state, xp, level, kills, battles, region FROM war_persons WHERE player_id IN (?1, ?2) ORDER BY id').bind(me.playerId, foe.playerId).all();
    const once = (await read()).results;
    expect(await applyFight(env.DB!, f.id, 'test-ridge', f.report, now + 1000)).toBe(false);
    expect((await read()).results).toEqual(once);
    for (const p of f.report.persons) {
      const row = once.find((x) => x.id === p.pid) as { state: string; xp: number; battles: number; region: string | null };
      expect(row.state).toBe(p.state === 'fit' ? 'active' : p.state);
      expect(row.xp).toBe(p.hero.xp);
      if (p.state !== 'fit') expect(row.region).toBeNull();
    }
    expect(f.report.persons.some((p) => p.xp > 0)).toBe(true);
    // the fight is over: no second report while all is quiet
    for (let t = 0; t < 100; t++) expect(r.tick().fights).toEqual([]);
  });

  it('saves the whole region and resumes it exactly: hit points, finished buildings, orders', () => {
    const opts = { region, seed: 1, cap: 600, epoch: 'e' };
    const r = new WarRoom(opts);
    const g = [squad('s', 'hoplite', 12, 2), squad('t', 'archer', 5)];
    r.join(1, join(1, 0, ids(g)), g);
    r.join(2, { t: 'join', v: NET_VERSION, region: 'test-ridge', playerId: 2, team: 1, army: [{ cls: 'peltast', count: 7 }] });
    r.sim.addStock(0, 'wood', 400);
    r.sim.addStock(0, 'stone', 400);
    for (let i = 0; i < 5; i++) r.tick();
    const camp = r.snapshot().units.find((u) => u.squad === 0)!;
    const [sx, sy] = spot(r, Math.round(camp.x), Math.round(camp.y));
    r.sim.order({ kind: 'placeBuilding', squad: 0, type: 'camp', x: sx, y: sy });
    r.order(1, { kind: 'attack', squad: 1, target: 2 });
    r.order(2, { kind: 'attack', squad: 2, target: 1 });
    const hurt = () => r.snapshot().units.some((u) => u.state !== 'dead' && u.hp < u.maxHp);
    for (let i = 0; i < 4000 && !(r.snapshot().buildings!.some((b) => b.state === 'done') && hurt()); i++) r.tick();
    const before = r.snapshot();
    expect(before.buildings!.some((b) => b.state === 'done')).toBe(true);
    expect(before.units.some((u) => u.state !== 'dead' && u.hp < u.maxHp)).toBe(true);
    const st = JSON.parse(JSON.stringify(r.saveState()));
    // all persons still deployed here: an exact resume; the twin room runs on uninterrupted
    const persons = new Map([...g[0], ...g[1]].map((p) => [p.id, p]));
    const back = WarRoom.restore(opts, st, persons);
    const strip = (s: ReturnType<WarRoom['snapshot']>) => JSON.stringify({ ...s, shots: undefined });
    expect(strip(back.snapshot())).toBe(strip(before));
    expect(back.online()).toBe(0);
    expect(back.active()).toBe(true);
    expect(back.quota().live).toEqual(r.quota().live);
    r.leave(1);
    r.leave(2);
    for (let i = 0; i < 300; i++) (r.tick(), back.tick());
    expect(strip(back.snapshot())).toBe(strip(r.snapshot()));
    // a rejoin hands the squads back (no new spawn)
    expect(back.spawnsNew(1)).toBe(false);
    expect(back.join(1, join(1, 0, ids(g))).msg).toMatchObject({ t: 'welcome' });
  });

  it('a man D1 sent home after the save leaves the restored field', () => {
    const r = new WarRoom({ region, seed: 1, cap: 600 });
    const g = [squad('s', 'hoplite', 6)];
    r.join(1, join(1, 0, ids(g)), g);
    r.tick();
    const st = r.saveState();
    const back = WarRoom.restore({ region, seed: 1, cap: 600 }, st, new Map(g[0].slice(1).map((p) => [p.id, p])));
    back.tick();
    expect(back.snapshot().units.filter((u) => u.state !== 'dead').map((u) => u.pid)).toEqual(g[0].slice(1).map((p) => p.id));
    expect(back.quota().live[0]).toBe(5);
    expect(back.sim.endFight().persons).toEqual([]); // unreported
  });
});

interface Client { ws: WebSocket; msgs: ServerMsg[]; next(t: ServerMsg['t']): Promise<ServerMsg>; send(m: unknown): void }

async function connect(token: string): Promise<Client> {
  const res = await SELF.fetch(`${BASE}/ws/war/test-ridge?sim=${SIM_VERSION}`, { headers: { upgrade: 'websocket', 'sec-websocket-protocol': `pixelarrow.v1, ${token}` } });
  expect(res.status).toBe(101);
  const ws = res.webSocket!;
  ws.accept();
  const c: Client = {
    ws, msgs: [],
    send: (m) => ws.send(JSON.stringify(m)),
    next: (t) => new Promise((ok, fail) => {
      const t0 = Date.now();
      const poll = () => {
        const i = c.msgs.findIndex((m) => m.t === t);
        if (i >= 0) return ok(c.msgs.splice(i, 1)[0]);
        if (Date.now() - t0 > 20_000) return fail(new Error(`no ${t}: ${JSON.stringify(c.msgs)}`));
        setTimeout(poll, 20);
      };
      poll();
    }),
  };
  ws.addEventListener('message', (e) => {
    if (typeof e.data === 'string') c.msgs.push(JSON.parse(e.data) as ServerMsg);
  });
  return c;
}

const stats = async () => (await (await SELF.fetch(`${BASE}/api/war/test-ridge/stats`)).json<{ units: number; online: number; running: boolean }>());

describe('WarRegionDO persistence', () => {
  it('a rejoin also brings the men named from home as a fresh squad', async () => {
    const me = await devLogin(7404);
    await api('/api/war/dev/seed', { method: 'POST', token: me.token, json: {} });
    const rows = (await env.DB!.prepare("SELECT id FROM war_persons WHERE player_id = ?1 AND state = 'active' ORDER BY slot").bind(me.playerId).all<{ id: string }>()).results.map((r) => r.id);
    const deployed = async () => (await env.DB!.prepare("SELECT COUNT(*) AS n FROM war_persons WHERE player_id = ?1 AND region = 'test-ridge'").bind(me.playerId).first<{ n: number }>())!.n;
    const c = await connect(me.token);
    c.send(join(me.playerId, 0, [rows.slice(0, 6)]));
    expect(await c.next('welcome')).toMatchObject({ squads: [expect.any(Number)] });
    c.ws.close(1000);
    await new Promise((r) => setTimeout(r, 200));
    const again = await connect(me.token);
    again.send(join(me.playerId, 0, [rows.slice(6)]));
    expect(((await again.next('welcome')) as Extract<ServerMsg, { t: 'welcome' }>).squads).toHaveLength(1); // the rejoin
    expect(((await again.next('welcome')) as Extract<ServerMsg, { t: 'welcome' }>).squads).toHaveLength(2); // and the men from home
    expect(await deployed()).toBe(12);
    again.ws.close(1000);
  });

  it('joins with persisted soldiers and resumes the region after an eviction', async () => {
    const me = await devLogin(7403);
    await api('/api/war/dev/seed', { method: 'POST', token: me.token, json: {} });
    const rows = (await env.DB!.prepare("SELECT id FROM war_persons WHERE player_id = ?1 AND state = 'active' ORDER BY slot").bind(me.playerId).all<{ id: string }>()).results.map((r) => r.id);
    const c = await connect(me.token);
    c.send(join(me.playerId, 0, [['nobody']]));
    expect(await c.next('refused')).toMatchObject({ reason: 'army', detail: 'no soldier nobody' });
    c.send(join(me.playerId, 0, [rows]));
    expect(await c.next('welcome')).toMatchObject({ you: { id: me.playerId, team: 0 } });
    const deployed = async () => (await env.DB!.prepare("SELECT COUNT(*) AS n FROM war_persons WHERE player_id = ?1 AND region = 'test-ridge'").bind(me.playerId).first<{ n: number }>())!.n;
    expect(await deployed()).toBe(12);
    const before = await stats();
    expect(before.units).toBeGreaterThanOrEqual(12);
    c.ws.close(1000);
    await new Promise((r) => setTimeout(r, 200));

    // the object goes away; its storage keeps the region, and the pending alarm brings it back
    const stub = env.WAR_REGION.get(env.WAR_REGION.idFromName('test-ridge'));
    await runInDurableObject(stub, async (o: WarRegionDO, state) => {
      await o.settled();
      expect(await loadState(state.storage)).toMatchObject({ v: 2, region: 'test-ridge' });
    });
    await abortAllDurableObjects(); // a crash or deploy: the running loop holds the object, so no graceful eviction
    expect(await runDurableObjectAlarm(env.WAR_REGION.get(env.WAR_REGION.idFromName('test-ridge')))).toBe(true); // a fresh stub: the old one died with the object
    const after = await stats();
    expect(after).toMatchObject({ units: before.units, online: 0, running: true });
    expect(await deployed()).toBe(12);
    // the player takes his restored squad back with a rejoin
    const again = await connect(me.token);
    again.send(join(me.playerId, 0, [rows]));
    const w = (await again.next('welcome')) as Extract<ServerMsg, { t: 'welcome' }>;
    expect(w.squads).toHaveLength(1);
    expect((await stats()).units).toBe(before.units);
    again.ws.close(1000);
  });
});
