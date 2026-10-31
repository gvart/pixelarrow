/**
 * W-73 the solo loop on the server: a player with no active alliance partner draws no partner task (and gets them back
 * once two others are active); the wild's deeds (lairs, chiefs, hidden quests, encounters) count for the solo tasks;
 * region mastery counts each deed of the region once and, when complete, pays favour and the banner once.
 */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { devLogin } from '../helpers';
import { soloOf, tallyOf, tallyStmt, tasksOf } from '../../src/war/tasks';
import { masteredOf, masteryOf, recordWild } from '../../src/war/mastery';
import { getFavour } from '../../src/war/favour';
import { joinAlliance } from '../../src/war/world/members';
import { WAR_REGIONS, warRegion } from '../../src/war/regions';
import { dayOf, taskDef } from '../../../src/war/net/tasks';
import { MASTERY, masteryNeed } from '../../../src/war/net/mastery';
import { masteryDeed } from '../../../src/war/sim/deeds';
import type { Deed, RegionData } from '../../../src/war/types';
import { NET_VERSION, type JoinMsg } from '../../../src/war/net/protocol';
import { makePerson } from '../../../src/war/sim/roster';
import { WarRoom } from '../../src/war/room';

const DB = () => env.DB!;
const S = 1;
const MON = Date.UTC(2031, 0, 6, 12);
async function player(n: number, alliance: number) {
  const p = await devLogin(n);
  await joinAlliance(DB(), p.playerId, alliance as never, MON, S);
  return p.playerId;
}

describe('solo tasks on the server (W-73)', () => {
  it('alone: no partner task; two active members: partner tasks may come back', async () => {
    const me = await player(8901, 3);
    expect(await soloOf(DB(), me, MON, S)).toBe(true);
    const v = await tasksOf(DB(), me, MON, S);
    for (const t of v.tasks) expect(taskDef(t.id)!.partner, t.id).toBeUndefined();
    const a = await player(8902, 3), b = await player(8903, 3), far = await player(8904, 1);
    await tallyStmt(DB(), a, 'kills', 1, MON, S).run();
    await tallyStmt(DB(), far, 'kills', 1, MON, S).run();
    expect(await soloOf(DB(), me, MON, S)).toBe(true); // one partner, one of another alliance
    await tallyStmt(DB(), b, 'kills', 1, MON - 2 * 86_400_000, S).run();
    expect(await soloOf(DB(), me, MON, S)).toBe(false);
    expect(await soloOf(DB(), me, MON + 3 * 86_400_000, S)).toBe(true); // they went quiet
  });
});

describe('region mastery on the server (W-73)', () => {
  it('each deed counts once; the last one masters the region: favour and the banner once, tallies for the tasks', async () => {
    const r = WAR_REGIONS.map((id) => warRegion(id)!).find((x) => (x.lairs ?? []).some((l) => l.chief) && (x.secrets ?? []).length)!;
    const need = masteryNeed(r), me = await player(8911, 2);
    await DB().prepare("INSERT INTO war_persons (id, player_id, cls, name, level, xp, points, kills, battles, attrs, skills, gear, honours, state, region, created_at, updated_at) VALUES ('ms-1', ?1, 'hoplite', 'Damon', 3, 0, 0, 0, 0, '{}', '[]', '{}', '[]', 'active', ?2, ?3, ?3)").bind(me, r.id, MON).run();
    const fav0 = (await getFavour(env, me)).xp;
    const all = [...need.lairs.map((key) => ({ kind: 'lair' as const, key })), ...need.chiefs.map((key) => ({ kind: 'chief' as const, key })), ...need.secrets.map((key) => ({ kind: 'secret' as const, key }))];
    const first = await recordWild(env, me, r, all.slice(0, 2), MON, S);
    expect(first?.done).toBe(false);
    expect(await recordWild(env, me, r, all.slice(0, 1), MON, S)).toBeNull(); // the same lair cleared again after its respawn
    // a quest's own chief (not one the region was built with) counts for the task only
    expect(await recordWild(env, me, r, [{ kind: 'chief', key: 'not-of-this-region' }], MON, S)).toBeNull();
    const v = await recordWild(env, me, r, all.slice(2), MON, S);
    expect(v).toMatchObject({ region: r.id, done: true, lairs: [need.lairs.length, need.lairs.length], chiefs: [need.chiefs.length, need.chiefs.length], secrets: [need.secrets.length, need.secrets.length] });
    expect((await getFavour(env, me)).xp).toBe(fav0 + MASTERY.favour);
    expect(await masteredOf(DB(), me, S)).toEqual([r.id]);
    const deeds = JSON.parse((await DB().prepare("SELECT deeds FROM war_persons WHERE id = 'ms-1'").first<{ deeds: string }>())!.deeds) as Deed[];
    expect(deeds).toEqual([masteryDeed(r.id, r.name)]);
    // again: nothing more
    await recordWild(env, me, r, all, MON, S);
    expect((await getFavour(env, me)).xp).toBe(fav0 + MASTERY.favour);
    expect((await masteryOf(DB(), me, r, S)).done).toBe(true);
    const t = await tallyOf(DB(), me, dayOf(MON), dayOf(MON) + 1, S);
    expect(t.lair).toBe(need.lairs.length * 2 + 1);
    expect(t.chief).toBe(need.chiefs.length * 2 + 1);
    expect(t.secret).toBe(need.secrets.length * 2);
  });
});

describe('region mastery end to end (W-81)', () => {
  it('his men clear every lair in the room: the room\'s wild deeds master the region, 300 favour and the banner on his men', async () => {
    const n = 96;
    const r: RegionData = {
      id: 'w81-flat', name: 'Flat Hollow', w: n, h: n, depth: 0, height: Array(n * n).fill(1), terrain: Array(n * n).fill('grass'), water: Array(n * n).fill(0),
      entries: (['N', 'E', 'S', 'W'] as const).map((side) => ({ side, x: side === 'W' ? 0 : side === 'E' ? n - 4 : n / 2 - 2, y: side === 'N' ? 0 : side === 'S' ? n - 4 : n / 2 - 2, w: 4, h: 4 })),
      noBuild: [], objects: [], lairs: [{ kind: 'wolf', x: 40.5, y: 48.5, count: 3 }, { kind: 'boar', x: 56.5, y: 48.5, count: 2 }], claimPoints: [],
    };
    const need = masteryNeed(r);
    expect(need).toEqual({ lairs: ['0', '1'], chiefs: [], secrets: [] });
    const me = await player(8921, 0);
    const men = Array.from({ length: 12 }, (_, k) => makePerson(`w81-${k}`, 'hoplite', { level: 3 }));
    for (const p of men) await DB().prepare("INSERT INTO war_persons (id, player_id, cls, name, level, xp, points, kills, battles, attrs, skills, gear, honours, state, region, created_at, updated_at) VALUES (?1, ?2, 'hoplite', 'Damon', 3, 0, 0, 0, 0, '{}', '[]', '{}', '[]', 'active', ?3, ?4, ?4)").bind(p.id, me, r.id, MON).run();
    const room = new WarRoom({ region: r, seed: 3, cap: 600, wild: true });
    const m: JoinMsg = { t: 'join', v: NET_VERSION, region: r.id, playerId: me, team: 0, squads: [men.map((p) => p.id)] };
    expect(room.join(me, m, [men]).msg.t).toBe('welcome');
    room.tick();
    const sq = room.squadsOf(me)[0], deeds: Pick<import('../../../src/war/net/mastery').WildDeed, 'kind' | 'key'>[] = [];
    for (const l of room.snapshot().lairs!) {
      room.sim.order({ kind: 'attack', squad: sq, target: l.squad });
      for (let t = 0; t < 3000 && room.snapshot().lairs![l.id].state !== 'cleared'; t++) deeds.push(...room.tick().wild.filter((d) => d.pid === me));
      deeds.push(...room.tick().wild.filter((d) => d.pid === me));
    }
    expect(deeds.map((d) => `${d.kind}:${d.key}`).sort()).toEqual(['lair:0', 'lair:1']);
    const fav0 = (await getFavour(env, me)).xp;
    const v = await recordWild(env, me, r, deeds, MON, S);
    expect(v).toMatchObject({ region: r.id, done: true, lairs: [2, 2] });
    expect((await getFavour(env, me)).xp).toBe(fav0 + MASTERY.favour);
    expect(await masteredOf(DB(), me, S)).toEqual([r.id]);
    const row = await DB().prepare("SELECT deeds FROM war_persons WHERE id = 'w81-0'").first<{ deeds: string }>();
    expect(JSON.parse(row!.deeds) as Deed[]).toEqual([masteryDeed(r.id, r.name)]);
  }, 60_000);
});
