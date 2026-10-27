/**
 * W-66 divine favour: the level curve, the bonus and its caps, earning from each source (fights, guardians, tasks,
 * stories, encounters, lairs, land) and claimSoul raising a man with his player's bonus.
 */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { api, devLogin } from '../helpers';
import { addFavour, encounterFavour, favourStmts, favourTick, fightFavour, getFavour, LAND_TICKS, landFavour, lairsCleared, storyFavour, FAVOUR_LOG } from '../../src/war/favour';
import { applyFight, claimSoul, type PersonRow } from '../../src/war/persons';
import { applyBossKill } from '../../src/war/bosses';
import { claimTask, tallyStmt, tasksOf } from '../../src/war/tasks';
import { joinAlliance } from '../../src/war/world/members';
import { FAVOUR_ATTR_MAX, FAVOUR_EARN, FAVOUR_MAX, FAVOUR_XP, favourBonus, favourLevel, favourTitle, withFavour } from '../../../src/war/net/favour';
import { makePerson } from '../../../src/war/sim/roster';
import { POINTS_PER_LEVEL } from '../../../src/data/perks';
import type { FightReport, Snapshot } from '../../../src/war/types';

const DB = () => env.DB!;
const xpOf = async (pid: number) => (await getFavour(env, pid)).xp;
const setXp = (pid: number, xp: number) =>
  DB().prepare('INSERT INTO war_favour (player_id, xp, level, updated_at) VALUES (?1, ?2, ?3, 0) ON CONFLICT (player_id) DO UPDATE SET xp = ?2, level = ?3').bind(pid, xp, favourLevel(xp)).run();

describe('the curve and the bonus', () => {
  it('level 2 at 200, level 10 at 16200, capped at FAVOUR_MAX', () => {
    expect(favourLevel(0)).toBe(1);
    expect(favourLevel(199)).toBe(1);
    expect(favourLevel(200)).toBe(2);
    expect(FAVOUR_XP[10]).toBe(16200);
    expect(favourLevel(16200)).toBe(10);
    expect(favourLevel(1e9)).toBe(FAVOUR_MAX);
    for (let l = 2; l <= FAVOUR_MAX; l++) expect(FAVOUR_XP[l]).toBeGreaterThan(FAVOUR_XP[l - 1]);
    expect(favourTitle(1)).toBe('Hero');
    expect(favourTitle(FAVOUR_MAX)).toBe('Olympian-touched');
  });

  it('points at every third level, kit at 5 and 10; a max-level fresh man stays below a level 3-4 veteran', () => {
    expect(favourBonus(1)).toEqual({ attr: 0, gearTier: 0 });
    expect(favourBonus(2)).toEqual({ attr: 0, gearTier: 0 });
    expect(favourBonus(3)).toEqual({ attr: 1, gearTier: 0 });
    expect(favourBonus(5)).toEqual({ attr: 1, gearTier: 1 });
    expect(favourBonus(6)).toEqual({ attr: 2, gearTier: 1 });
    expect(favourBonus(9)).toEqual({ attr: 3, gearTier: 1 });
    expect(favourBonus(10)).toEqual({ attr: 3, gearTier: 2 });
    const max = favourBonus(FAVOUR_MAX);
    expect(max).toEqual({ attr: FAVOUR_ATTR_MAX, gearTier: 2 });
    expect(favourBonus(99)).toEqual(max);
    // a level 4 veteran has 3 levels of points (and a skill at 3, and his deeds)
    expect(max.attr).toBeLessThan(3 * POINTS_PER_LEVEL);
    // the kit: common -> uncommon -> rare, never past it
    const p = makePerson('fav-kit', 'hoplite');
    expect(Object.values(p.hero.equip).every((it) => it!.rarity === 'common')).toBe(true);
    const q = withFavour(p, favourBonus(5)), r = withFavour(p, max);
    expect(Object.values(q.hero.equip).every((it) => it!.rarity === 'uncommon')).toBe(true);
    expect(Object.values(r.hero.equip).every((it) => it!.rarity === 'rare')).toBe(true);
    expect(r.hero.points).toBe(p.hero.points + FAVOUR_ATTR_MAX);
    expect(p.hero.equip.weapon!.rarity).toBe('common'); // pure
    expect(withFavour(p, favourBonus(1))).toBe(p);
  });
});

describe('earning', () => {
  it('adds up, levels up in D1, keeps the newest FAVOUR_LOG rows; GET /api/war/favour', async () => {
    const me = await devLogin(6601);
    expect(await getFavour(env, me.playerId)).toMatchObject({ xp: 0, level: 1, title: 'Hero', next: 200, recent: [] });
    expect(await addFavour(env, me.playerId, 150, 'win')).toBe(150);
    expect(await addFavour(env, me.playerId, 0, 'win')).toBe(0);
    await addFavour(env, me.playerId, 60, 'task');
    const row = await DB().prepare('SELECT xp, level FROM war_favour WHERE player_id = ?1').bind(me.playerId).first();
    expect(row).toEqual({ xp: 210, level: 2 });
    for (let i = 0; i < FAVOUR_LOG + 5; i++) await addFavour(env, me.playerId, 1, 'battle');
    const v = await getFavour(env, me.playerId);
    expect(v.recent).toHaveLength(FAVOUR_LOG);
    expect(v.recent[0]).toMatchObject({ amount: 1, reason: 'battle' });
    expect((await DB().prepare('SELECT COUNT(*) AS n FROM war_favour_log WHERE player_id = ?1').bind(me.playerId).first<{ n: number }>())!.n).toBe(FAVOUR_LOG);
    // a big jump: the level follows the total
    await addFavour(env, me.playerId, 20000, 'boss');
    expect((await DB().prepare('SELECT level FROM war_favour WHERE player_id = ?1').bind(me.playerId).first<{ level: number }>())!.level).toBe(favourLevel(20235));
    const r = await api('/api/war/favour', { token: me.token });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ xp: 20235, level: 11, title: favourTitle(11), bonus: favourBonus(11) });
    expect((await api('/api/war/favour')).status).toBe(401);
  });

  it('fights: won or fought, and kills (capped), written once with the fight', async () => {
    const me = await devLogin(6602), foe = await devLogin(6603);
    const a = makePerson('fav-a', 'hoplite'), b = makePerson('fav-b', 'archer');
    const report: FightReport = {
      tick: 10,
      persons: [
        { pid: a.id, owner: `p:${me.playerId}`, team: 0, state: 'fit', xp: 10, kills: 3, dmg: 50, levelUps: 0, hero: a.hero },
        { pid: b.id, owner: `p:${foe.playerId}`, team: 1, state: 'dead', xp: 0, kills: 40, dmg: 10, levelUps: 0, hero: { ...b.hero, equip: {} } },
      ],
      loot: {},
    };
    expect(fightFavour(report)).toEqual([
      [me.playerId, FAVOUR_EARN.win + 3 * FAVOUR_EARN.kill, 'win'],
      [foe.playerId, FAVOUR_EARN.battle + FAVOUR_EARN.killCap * FAVOUR_EARN.kill, 'battle'],
    ]);
    expect(await applyFight(DB(), 'fav:fight:1', 'test-ridge', report, 1000)).toBe(true);
    expect(await applyFight(DB(), 'fav:fight:1', 'test-ridge', report, 2000)).toBe(false);
    expect(await xpOf(me.playerId)).toBe(FAVOUR_EARN.win + 3 * FAVOUR_EARN.kill);
    expect(await xpOf(foe.playerId)).toBe(FAVOUR_EARN.battle + FAVOUR_EARN.killCap * FAVOUR_EARN.kill);
  });

  it('guardians: each killer, once', async () => {
    const a = await devLogin(6604), b = await devLogin(6605);
    const e = { t: 1, kind: 'bossSlain' as const, region: 'siren', boss: 'scylla', killers: [`p:${a.playerId}`, `p:${b.playerId}`, `p:${a.playerId}`] };
    expect(await applyBossKill(DB(), 'siren', 'fav-run', e, 1000)).toBe(true);
    expect(await applyBossKill(DB(), 'siren', 'fav-run', e, 2000)).toBe(false);
    expect(await xpOf(a.playerId)).toBe(FAVOUR_EARN.boss);
    expect(await xpOf(b.playerId)).toBe(FAVOUR_EARN.boss);
  });

  it('tasks: a claim pays the kind\'s favour', async () => {
    const MON = Date.UTC(2031, 0, 6, 12);
    const me = await devLogin(6606);
    await joinAlliance(DB(), me.playerId, 1 as never, MON, 1);
    const t = (await tasksOf(DB(), me.playerId, MON)).tasks[0];
    await tallyStmt(DB(), me.playerId, t.metric, t.need * 2, MON).run();
    await claimTask(env, me.playerId, 'daily', 0, MON);
    expect(await xpOf(me.playerId)).toBe(FAVOUR_EARN.task.daily);
  });

  it('stories and encounters: steps and ends, a lapse or a start nothing', () => {
    expect(storyFavour([{ kind: 'start' }, { kind: 'step', step: 'a' }, { kind: 'step', step: 'b' }, { kind: 'end' }])).toBe(2 * FAVOUR_EARN.storyStep + FAVOUR_EARN.storyEnd);
    expect(storyFavour(undefined)).toBe(0);
    expect(encounterFavour([{ kind: 'start', enc: 'x' }, { kind: 'step', enc: 'x', step: 's' }, { kind: 'end', enc: 'x' }])).toBe(FAVOUR_EARN.encounterStep + FAVOUR_EARN.encounterEnd);
    expect(encounterFavour([{ kind: 'lapse', enc: 'x' }])).toBe(0);
  });

  it('lairs cleared pay the players with men near; land pays claim points and the region, capped an hour', async () => {
    const me = await devLogin(6607), far = await devLogin(6608);
    const unit = (id: number, squad: number, x: number, y: number) => ({ id, squad, x, y, facing: 0, hp: 10, maxHp: 10, cls: 'hoplite', state: 'idle' as const });
    const lair = (state: string) => ({ id: 3, kind: 'wolves', x: 50, y: 50, squad: 9, alive: 0, count: 4, state, aggro: 0, leash: 0, guard: 0, nodes: 0 });
    const claim = (id: number, team: number) => ({ id, x: 0, y: 0, team, squad: -1, progress: 1, lairs: [], state: 'claimed' });
    const snap = (lairState: string, tick: number) => ({
      tick,
      units: [unit(0, 0, 55, 52), unit(1, 1, 200, 200)],
      squads: [{ id: 0, owner: `p:${me.playerId}`, team: 1, units: [0], order: 'idle' }, { id: 1, owner: `p:${far.playerId}`, team: 2, units: [1], order: 'idle' }],
      lairs: [lair(lairState)],
      claims: [claim(0, 1), claim(1, 1), claim(2, 2)],
    }) as unknown as Snapshot;
    // pure: the first sight records, a turn to cleared pays the near
    const seen = new Map<number, string>();
    expect(lairsCleared(snap('home', 1), seen)).toEqual([]);
    expect(lairsCleared(snap('cleared', 2), seen)).toEqual([me.playerId]);
    expect(lairsCleared(snap('cleared', 3), seen)).toEqual([]);
    // land: me 2 claims and the region (most claims), far 1 claim
    const L = FAVOUR_EARN.land;
    expect(landFavour(snap('home', 1))).toEqual([[me.playerId, 2 * L.claim + L.region], [far.playerId, L.claim]]);
    // through the room hook
    const writes: Promise<unknown>[] = [];
    const write = (_: string, f: () => Promise<unknown>) => void writes.push(f());
    const room = { s: snap('home', 1), currentTick: 1, snapshot() { return this.s; } };
    favourTick(env, room, write);
    room.s = snap('cleared', 2);
    room.currentTick = LAND_TICKS + 7;
    favourTick(env, room, write);
    await Promise.all(writes);
    expect(await xpOf(me.playerId)).toBe(FAVOUR_EARN.lair + 2 * L.claim + L.region);
    expect(await xpOf(far.playerId)).toBe(L.claim);
    // the hour's cap across regions
    const t = Date.UTC(2031, 0, 6, 12, 5);
    let got = 0;
    for (let i = 0; i < 20; i++) got += await addFavour(env, far.playerId, 4, 'land', t);
    expect(got).toBe(L.hourCap);
    expect(await addFavour(env, far.playerId, 4, 'land', t + 3_600_000)).toBe(4);
  });
});

describe('claimSoul with favour', () => {
  it('a claimed soul takes his player\'s bonus (points, kit) in D1 and in the person the room holds', async () => {
    const me = await devLogin(6609);
    const plain = makePerson('soul-fav-0', 'hoplite');
    expect(await claimSoul(DB(), me.playerId, plain, 'test-ridge', Date.now())).toBe(true);
    const row0 = await DB().prepare('SELECT points, gear FROM war_persons WHERE id = ?1').bind('soul-fav-0').first<PersonRow>();
    expect(row0!.points).toBe(0);
    await setXp(me.playerId, FAVOUR_XP[10]);
    const p = makePerson('soul-fav-1', 'hoplite');
    expect(await claimSoul(DB(), me.playerId, p, 'test-ridge', Date.now())).toBe(true);
    const row = await DB().prepare('SELECT points, gear FROM war_persons WHERE id = ?1').bind('soul-fav-1').first<PersonRow>();
    expect(row!.points).toBe(favourBonus(10).attr);
    const gear = JSON.parse(row!.gear) as Record<string, { rarity: string }>;
    expect(Object.values(gear).every((it) => it.rarity === 'rare')).toBe(true);
    // the DO hands the room this same person (setPerson)
    expect(p.hero.points).toBe(favourBonus(10).attr);
    expect(p.hero.equip.weapon!.rarity).toBe('rare');
  });

  it('favourStmts writes nothing for nothing', () => {
    expect(favourStmts(DB(), 1, 0, 'win', 0)).toEqual([]);
  });
});
