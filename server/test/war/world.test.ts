/**
 * M4 world: the pure World (transfers, quota line, ownership, homes never fall), the region room's depart / arrive,
 * and WarWorldDO end to end over the API and sockets (a transfer between two region rooms, kept across an eviction).
 */
import { abortAllDurableObjects, env, runInDurableObject, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { NET_VERSION, type JoinMsg, type ServerMsg } from '../../../src/war/net/protocol';
import type { WorldServerMsg, WorldSnapshot } from '../../../src/war/net/world';
import { edge } from '../../../src/war/world';
import type { AllianceId, Side } from '../../../src/war/world/types';
import { makePerson } from '../../../src/war/sim/roster';
import { SIM_VERSION } from '../../../src/sim/version';
import { WarRoom } from '../../src/war/room';
import { warRegion } from '../../src/war/regions';
import { RETRY_MS, World, WORLD_NAME, type ArriveResult, type Ports } from '../../src/war/world/world';
import type { WarWorldDO } from '../../src/war/world/worldDO';
import { currentSeason } from '../../src/online/store';
import { api, BASE, devLogin } from '../helpers';

const T0 = 1_000_000;
const squad = (prefix: string, n = 12, cls = 'hoplite') => Array.from({ length: n }, (_, i) => makePerson(`${prefix}-${i}`, cls));

/** Fake rooms: every squad departs fine; `room` men fit per region and alliance before arrivals are refused. */
function fakes(room = Infinity, off = 0) {
  const arrived: { to: string; pid: number; alliance: AllianceId; ids: string[]; side: Side }[] = [];
  const departed: { from: string; squad: number; side: Side }[] = [];
  const men = new Map<string, number>();
  const ports: Ports = {
    depart: async (from, _pid, sq, side) => (departed.push({ from, squad: sq, side }), { ids: [`m${sq}a`, `m${sq}b`], off }),
    arrive: async (to, pid, alliance, ids, side): Promise<ArriveResult> => {
      const k = `${to}|${alliance}`, n = men.get(k) ?? 0;
      if (n + ids.length > room) return { error: 'full' };
      men.set(k, n + ids.length);
      arrived.push({ to, pid, alliance, ids, side });
      return { ok: true };
    },
  };
  return { ports, arrived, departed, men };
}

describe('World', () => {
  it('moves a squad over a border: travel time, a marker for its player only, arrival at the facing entry', async () => {
    const w = new World(), f = fakes();
    const t = await w.transfer(7, 0, { from: 'dodona', to: 'dodona-e', squad: 3 }, T0, f.ports);
    if ('error' in t) throw new Error(t.error);
    const e = edge('dodona', 'dodona-e')!;
    expect(f.departed).toEqual([{ from: 'dodona', squad: 3, side: 'E' }]);
    expect(t).toMatchObject({ from: 'dodona', to: 'dodona-e', men: 2, state: 'moving', departAt: T0, arriveAt: T0 + e.ms, side: 'W' });
    const counts = { members: [1, 0, 0, 0], clans: [0, 0, 0, 0] };
    expect(w.snapshot(7, 0, counts, T0).transit).toEqual([{ id: t.id, from: 'dodona', to: 'dodona-e', men: 2, departAt: T0, arriveAt: T0 + e.ms, state: 'moving' }]);
    expect(w.snapshot(8, 0, counts, T0).transit).toEqual([]);
    expect(w.snapshot(8, 0, counts, T0).alliances[0]).toMatchObject({ members: 1, inTransit: 2, regions: 1 });
    expect(w.nextDue()).toBe(T0 + e.ms);
    expect(await w.due(T0 + e.ms - 1, f.ports)).toBe(false);
    expect(f.arrived).toEqual([]);
    expect(await w.due(T0 + e.ms, f.ports)).toBe(true);
    expect(f.arrived).toEqual([{ to: 'dodona-e', pid: 7, alliance: 0, ids: ['m3a', 'm3b'], side: 'W' }]);
    expect(w.st.transit).toEqual([]);
    expect(w.nextDue()).toBeNull();
  });

  it('a squad away from the exit zone takes longer', async () => {
    const w = new World(), f = fakes(Infinity, 40);
    const t = await w.transfer(7, 0, { from: 'dodona', to: 'dodona-n', squad: 0 }, T0, f.ports);
    if ('error' in t) throw new Error(t.error);
    expect(t.arriveAt - T0).toBe(edge('dodona', 'dodona-n')!.ms + 40 * w.season.offExitMsPerTile);
  });

  it('enforces adjacency, known regions and an alliance; a room refusal is passed on', async () => {
    const w = new World(), f = fakes();
    expect(await w.transfer(7, 0, { from: 'dodona', to: 'kleisoura', squad: 0 }, T0, f.ports)).toMatchObject({ error: 'notAdjacent' });
    expect(await w.transfer(7, 0, { from: 'dodona', to: 'atlantis', squad: 0 }, T0, f.ports)).toMatchObject({ error: 'region' });
    expect(await w.transfer(7, null, { from: 'dodona', to: 'dodona-e', squad: 0 }, T0, f.ports)).toMatchObject({ error: 'noAlliance' });
    expect(f.departed).toEqual([]);
    const foes: Ports = { ...f.ports, depart: async () => ({ error: 'foes', detail: 'a foe within 20 tiles' }) };
    expect(await w.transfer(7, 0, { from: 'dodona', to: 'dodona-e', squad: 0 }, T0, foes)).toMatchObject({ error: 'foes' });
    const down: Ports = { ...f.ports, depart: async () => Promise.reject(new Error('evicted')) };
    expect(await w.transfer(7, 0, { from: 'dodona', to: 'dodona-e', squad: 0 }, T0, down)).toMatchObject({ error: 'unavailable' });
    expect(w.st.transit).toEqual([]);
  });

  it('queues arrivals while the quota is full, first come first served', async () => {
    const w = new World(), f = fakes(2); // room for one squad of 2 per region and alliance
    f.men.set('kleisoura|0', 2); // full already
    const a = await w.transfer(1, 0, { from: 'dodona-e', to: 'kleisoura', squad: 1 }, T0, f.ports);
    const b = await w.transfer(2, 0, { from: 'dodona-e', to: 'kleisoura', squad: 2 }, T0 + 1000, f.ports);
    const c = await w.transfer(3, 1, { from: 'skythia-w', to: 'kleisoura', squad: 3 }, T0, f.ports); // another alliance: own quota
    if ('error' in a || 'error' in b || 'error' in c) throw new Error('refused');
    const at = Math.max(a.arriveAt, b.arriveAt, c.arriveAt);
    expect(await w.due(at, f.ports)).toBe(true);
    expect(f.arrived.map((x) => x.pid)).toEqual([3]);
    expect(w.st.transit.map((t) => [t.pid, t.state])).toEqual([[1, 'queued'], [2, 'queued']]);
    expect(w.nextDue()).toBe(at + RETRY_MS);
    // room frees up for one squad: the first in line gets it, the second still waits
    f.men.set('kleisoura|0', 0);
    await w.due(at + RETRY_MS, f.ports);
    expect(f.arrived.map((x) => x.pid)).toEqual([3, 1]);
    expect(w.st.transit.map((t) => [t.pid, t.state])).toEqual([[2, 'queued']]);
    expect(w.snapshot(2, 0, { members: [], clans: [] }, at).transit[0]).toMatchObject({ state: 'queued' });
  });

  it('a home never changes owner: foreign claims and foes only besiege it', () => {
    const w = new World();
    expect(w.region('dodona')).toMatchObject({ owner: 0, besieged: false });
    expect(w.report('dodona', { live: [6, 12, 0, 0], claims: [0, 1, 0, 0], channel: [0, 0, 0, 0] })).toEqual({ rejected: true, changed: true });
    expect(w.region('dodona')).toMatchObject({ owner: 0, besieged: true, contested: true, claims: [0, 1, 0, 0] });
    w.report('dodona', { live: [6, 0, 0, 0], claims: [0, 0, 0, 0], channel: [0, 0, 0, 0] });
    expect(w.region('dodona')).toMatchObject({ owner: 0, besieged: false, contested: false });
  });

  it('neutrals and entries go to the alliance with the most claim points; a tie keeps the owner', () => {
    const w = new World();
    expect(w.region('kleisoura')!.owner).toBe(-1);
    w.report('kleisoura', { live: [12, 12, 0, 0], claims: [0, 0, 0, 0], channel: [1, 0, 0, 0] });
    expect(w.region('kleisoura')).toMatchObject({ owner: -1, contested: true });
    expect(w.report('kleisoura', { live: [12, 0, 0, 0], claims: [1, 0, 0, 0], channel: [0, 0, 0, 0] })).toMatchObject({ rejected: false });
    expect(w.region('kleisoura')).toMatchObject({ owner: 0, contested: false });
    w.report('kleisoura', { live: [12, 8, 0, 0], claims: [1, 1, 0, 0], channel: [0, 0, 0, 0] });
    expect(w.region('kleisoura')).toMatchObject({ owner: 0, contested: true });
    w.report('dodona-e', { live: [0, 12, 0, 0], claims: [0, 1, 0, 0], channel: [0, 0, 0, 0] });
    expect(w.region('dodona-e')!.owner).toBe(1);
    expect(w.snapshot(1, 1, { members: [], clans: [] }, T0).alliances[1]).toMatchObject({ regions: 2, soldiers: 20 });
  });
});

describe('WarRoom transfers', () => {
  const region = warRegion('dodona-e')!;
  const join = (pid: number, team: number, ids: string[][]): JoinMsg => ({ t: 'join', v: NET_VERSION, region: 'dodona-e', playerId: pid, team, squads: ids });

  it('hosts every world region (a stand-in map under its own id)', () => {
    expect(region.id).toBe('dodona-e');
    expect(warRegion('omphalos')!.entries.map((e) => e.side).sort()).toEqual(['E', 'N', 'S', 'W']);
    expect(warRegion('atlantis')).toBeNull();
  });

  it('a squad departs: its men leave the field without a corpse or a fight; foes near or a stranger squad refuse', () => {
    const r = new WarRoom({ region, seed: 1, cap: 600 });
    const g = squad('a');
    r.join(1, join(1, 0, [g.map((p) => p.id)]), [g]);
    r.tick();
    const [s] = r.squadsOf(1);
    expect(r.depart(2, s, 'N', 20)).toMatchObject({ error: 'notOwner' });
    const out = r.depart(1, s, 'N', 20); // team 0 spawned on the north entry
    expect(out).toEqual({ ids: g.map((p) => p.id), off: 0 });
    expect(r.quota().live[0]).toBe(0);
    expect(r.depart(1, s, 'N', 20)).toMatchObject({ error: 'notOwner' }); // gone already
    const t = r.tick();
    expect(t.fights).toEqual([]);
    expect(r.squadsOf(1)).toEqual([]);
    expect(r.personsHere().size).toBe(0);
    // from the south side: far from the exit; a foe beside it: refused
    const h = squad('b');
    r.join(1, join(1, 0, [h.map((p) => p.id)]), [h]);
    r.tick();
    const [s2] = r.squadsOf(1);
    expect((r.depart(1, s2, 'S', 0) as { off: number }).off).toBeGreaterThan(400);
    const k = squad('c'), f = squad('d');
    r.join(1, join(1, 0, [k.map((p) => p.id)]), [k]);
    r.join(3, { ...join(3, 1, [f.map((p) => p.id)]) }, [f]);
    r.tick();
    const [s3] = r.squadsOf(1);
    expect(r.depart(1, s3, 'N', 1000)).toMatchObject({ error: 'foes' }); // the foe squad on the east entry is within 1000
    expect(r.squadsOf(1)).toContain(s3);
  });

  it('arrivals come in at the facing entry, hold, wait on a full quota and are taken over by a rejoin', () => {
    const r = new WarRoom({ region, seed: 1, cap: 48 }); // 12 per alliance
    const g = squad('a'), h = squad('b', 1);
    const got = r.arrive(5, 0, g, 'E');
    if ('error' in got) throw new Error(got.error);
    expect(got.msg).toBeNull(); // offline
    r.tick();
    const e = region.entries.find((x) => x.side === 'E')!;
    const men = r.snapshot().units.filter((u) => u.squad === got.squad);
    expect(men).toHaveLength(12);
    for (const u of men) expect(u.x >= e.x - 1 && u.x <= e.x + e.w + 1 && u.y >= e.y - 1 && u.y <= e.y + e.h + 1).toBe(true);
    expect(r.arrive(6, 0, h, 'E')).toEqual({ error: 'full' });
    expect(r.arrive(5, 1, h, 'E')).toEqual({ error: 'team' }); // he serves alliance 0 here
    // his join takes them over: no new spawn
    const w = r.join(5, join(5, 0, [g.map((p) => p.id)])).msg as Extract<ServerMsg, { t: 'welcome' }>;
    expect(w).toMatchObject({ t: 'welcome', squads: [got.squad] });
    // online: the next arrival brings a fresh welcome
    r.tick();
    const r2 = new WarRoom({ region, seed: 1, cap: 600 });
    r2.join(5, join(5, 0, [h.map((p) => p.id)]), [h]);
    const more = r2.arrive(5, 0, squad('c', 4), 'W');
    expect(more).toMatchObject({ msg: { t: 'welcome' } });
    expect((more as { msg: Extract<ServerMsg, { t: 'welcome' }> }).msg.squads).toHaveLength(2);
    expect(r2.summary()).toEqual({ live: [5, 0, 0, 0], claims: [0, 0, 0, 0], channel: [0, 0, 0, 0] });
  });
});

interface Sock<M extends { t: string }> { ws: WebSocket; msgs: M[]; next(t: M['t']): Promise<M>; send(m: unknown): void }

async function connect<M extends { t: string }>(path: string, token: string): Promise<Sock<M>> {
  const res = await SELF.fetch(`${BASE}${path}?sim=${SIM_VERSION}`, { headers: { upgrade: 'websocket', 'sec-websocket-protocol': `pixelarrow.v1, ${token}` } });
  expect(res.status).toBe(101);
  const ws = res.webSocket!;
  ws.accept();
  const c: Sock<M> = {
    ws, msgs: [],
    send: (m) => ws.send(JSON.stringify(m)),
    next: (t) => new Promise((ok, fail) => {
      const t0 = Date.now();
      const poll = () => {
        const i = c.msgs.findIndex((m) => m.t === t);
        if (i >= 0) return ok(c.msgs.splice(i, 1)[0]);
        if (Date.now() - t0 > 20_000) return fail(new Error(`no ${t}: ${JSON.stringify(c.msgs).slice(0, 400)}`));
        setTimeout(poll, 20);
      };
      poll();
    }),
  };
  ws.addEventListener('message', (e) => {
    if (typeof e.data === 'string') c.msgs.push(JSON.parse(e.data) as M);
  });
  return c;
}

describe('WarWorldDO', () => {
  it('transfers a squad from one region room to the next, across an eviction, and the player rejoins it there', async () => {
    const me = await devLogin(7501);
    expect((await api('/api/war/world/transfer', { method: 'POST', token: me.token, json: { from: 'dodona-e', to: 'kleisoura', squad: 0 } })).status).toBe(409); // no alliance
    expect((await api('/api/war/world/dev/alliance', { method: 'POST', token: me.token, json: { alliance: 0 } })).status).toBe(200);
    await api('/api/war/dev/seed', { method: 'POST', token: me.token, json: {} });
    const ids = (await env.DB!.prepare("SELECT id FROM war_persons WHERE player_id = ?1 AND state = 'active' ORDER BY slot").bind(me.playerId).all<{ id: string }>()).results.map((r) => r.id);
    const where = async () => (await env.DB!.prepare('SELECT DISTINCT region FROM war_persons WHERE player_id = ?1 AND id IN (SELECT value FROM json_each(?2))').bind(me.playerId, JSON.stringify(ids)).all<{ region: string | null }>()).results.map((r) => r.region);

    // the world socket: a snapshot at once
    const map = await connect<WorldServerMsg>('/ws/war/world', me.token);
    expect(await map.next('world')).toMatchObject({ you: { id: me.playerId, alliance: 0 }, transit: [] });

    const a = await connect<ServerMsg>('/ws/war/dodona-e', me.token);
    a.send({ t: 'join', v: NET_VERSION, region: 'dodona-e', playerId: me.playerId, team: 0, squads: [ids] } satisfies JoinMsg);
    const wa = (await a.next('welcome')) as Extract<ServerMsg, { t: 'welcome' }>;
    const sq = wa.squads[0];
    expect(await where()).toEqual(['dodona-e']);

    expect((await api('/api/war/world/transfer', { method: 'POST', token: me.token, json: { from: 'dodona-e', to: 'skythia', squad: sq } })).status).toBe(409); // not adjacent
    // over the world socket
    map.send({ t: 'transfer', from: 'dodona-e', to: 'kleisoura', squad: sq });
    const tr = (await map.next('transferred')) as Extract<WorldServerMsg, { t: 'transferred' }>;
    expect(tr.transit).toMatchObject({ from: 'dodona-e', to: 'kleisoura', men: ids.length, state: 'moving' });
    expect(tr.transit.arriveAt - tr.transit.departAt).toBeGreaterThan(edge('dodona-e', 'kleisoura')!.ms); // left from the north entry, not the east
    expect(await where()).toEqual(['>kleisoura']);
    const snap = await (await api('/api/war/world', { token: me.token })).json<WorldSnapshot>();
    expect(snap.transit).toHaveLength(1);
    expect(snap.alliances[0]).toMatchObject({ members: 1, inTransit: ids.length });
    expect(snap.regions.find((r) => r.id === 'dodona')).toMatchObject({ owner: 0 });
    a.ws.close(1000);
    map.ws.close(1000);

    // the world goes away mid-road; its storage keeps the squad on the road
    await abortAllDurableObjects();
    const world = env.WAR_WORLD.get(env.WAR_WORLD.idFromName(WORLD_NAME));
    await runInDurableObject(world, async (o: WarWorldDO) => {
      expect((await o.snapshot(me.playerId, 0)).transit).toHaveLength(1);
      await o.arrivals(tr.transit.arriveAt + 1);
    });
    expect(await where()).toEqual(['kleisoura']);
    expect((await (await api('/api/war/world', { token: me.token })).json<WorldSnapshot>()).transit).toEqual([]);

    // he joins kleisoura with the same men: a rejoin of the squad that arrived
    const b = await connect<ServerMsg>('/ws/war/kleisoura', me.token);
    b.send({ t: 'join', v: NET_VERSION, region: 'kleisoura', playerId: me.playerId, team: 0, squads: [ids] } satisfies JoinMsg);
    const wb = (await b.next('welcome')) as Extract<ServerMsg, { t: 'welcome' }>;
    expect(wb.squads).toHaveLength(1);
    b.ws.close(1000);
  });

  it('alliance join: a clan is a sub-group of one alliance', async () => {
    const me = await devLogin(7502), mate = await devLogin(7503);
    expect((await api('/api/war/world/dev/alliance', { method: 'POST', token: me.token, json: { alliance: 4 } })).status).toBe(400);
    const season = (await currentSeason(env.DB!)).id, now = Date.now();
    const clan = (await env.DB!.prepare("INSERT INTO clans (season_id, shard_id, name, tag, created_by, created_at) VALUES (?1, 0, 'Oak Shields', 'OAK', ?2, ?3) RETURNING id").bind(season, me.playerId, now).first<{ id: number }>())!.id;
    for (const [p, role] of [[me.playerId, 'leader'], [mate.playerId, 'member']] as const)
      await env.DB!.prepare('INSERT INTO clan_members (season_id, player_id, clan_id, role, joined_at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(season, p, clan, role, now).run();
    expect((await api('/api/war/world/dev/alliance', { method: 'POST', token: me.token, json: { alliance: 2 } })).status).toBe(200);
    const other = await api('/api/war/world/dev/alliance', { method: 'POST', token: mate.token, json: { alliance: 1 } });
    expect(other.status).toBe(409);
    expect(await other.json()).toMatchObject({ error: { code: 'clan_alliance' } });
    expect((await api('/api/war/world/dev/alliance', { method: 'POST', token: mate.token, json: { alliance: 2 } })).status).toBe(200);
    const snap = await (await api('/api/war/world', { token: mate.token })).json<WorldSnapshot>();
    expect(snap.you).toEqual({ id: mate.playerId, alliance: 2 });
    expect(snap.alliances[2]).toMatchObject({ members: 2, clans: 1 });
  });
});
