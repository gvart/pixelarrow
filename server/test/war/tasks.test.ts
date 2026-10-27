/**
 * W-62 E7 daily and weekly tasks and the alliance wonder: the deterministic draw, progress from the server's tallies
 * (hooks in works, contracts, fights and the room's gather watch), the daily and weekly reset, claims (reward, score
 * caps), the daily reroll, and the wonder's stages (goods and labour per stage, perks, score, top contributors).
 */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { devLogin } from '../helpers';
import { good, setGood } from './goods';
import { claimTask, fightTallies, rerollOne, tallyOf, tallyStmt, tasksOf } from '../../src/war/tasks';
import { GatherWatch } from '../../src/war/taskWatch';
import { addLabour, bonusesOf, give as giveWork, openWorks, perksOf, worksOf } from '../../src/war/works';
import { joinAlliance } from '../../src/war/world/members';
import { DAY_MS, DAILY, dayOf, drawTasks, periodOf, rerollTask, TASKS, taskDef, WEEKLY, type TaskView } from '../../../src/war/net/tasks';
import { WONDER } from '../../../src/war/net/works';
import type { FightReport, UnitSnap } from '../../../src/war/types';

const DB = () => env.DB!;
const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code ?? String(e));
/** Monday 2031-01-06 12:00 UTC: a fixed day and week. */
const MON = Date.UTC(2031, 0, 6, 12);
const S = 1;

async function player(n: number, alliance: number, season = S) {
  const p = await devLogin(n);
  await joinAlliance(DB(), p.playerId, alliance as never, MON, season);
  return p.playerId;
}
const tally = (pid: number, t: Pick<TaskView, 'metric'>, n: number, now = MON) => tallyStmt(DB(), pid, t.metric, n, now).run();

describe('the draw (E7)', () => {
  it('is deterministic by season, period and player; no metric twice; resets by UTC day and ISO week', () => {
    const d = periodOf('daily', MON), w = periodOf('weekly', MON);
    expect(drawTasks(S, d, 7).map((t) => t.id)).toEqual(drawTasks(S, d, 7).map((t) => t.id));
    expect(drawTasks(S, d, 7)).toHaveLength(TASKS.daily);
    expect(drawTasks(S, w, 7)).toHaveLength(TASKS.weekly);
    for (let pid = 1; pid < 40; pid++) {
      const ms = drawTasks(S, d, pid).map((t) => t.metric);
      expect(new Set(ms).size).toBe(ms.length);
    }
    // players and days differ
    const sets = new Set(Array.from({ length: 20 }, (_, i) => drawTasks(S, d, 100 + i).map((t) => t.id).join()));
    expect(sets.size).toBeGreaterThan(5);
    expect(periodOf('daily', MON + DAY_MS).key).not.toBe(d.key);
    // the week: Monday 00:00 to Monday 00:00 UTC
    expect(w.from).toBe(dayOf(Date.UTC(2031, 0, 6)));
    expect(periodOf('weekly', Date.UTC(2031, 0, 12, 23, 59)).key).toBe(w.key);
    expect(periodOf('weekly', Date.UTC(2031, 0, 13)).key).not.toBe(w.key);
    expect(d.ends).toBe(Date.UTC(2031, 0, 7));
    // a reroll: none held, no metric of the others
    const held = drawTasks(S, d, 7).map((t) => t.id), next = rerollTask(S, d, 7, held, held[0])!;
    expect(held).not.toContain(next.id);
    expect(held.slice(1).map((id) => taskDef(id)!.metric)).not.toContain(next.metric);
    for (const t of [...DAILY, ...WEEKLY]) expect(taskDef(t.id)).toBe(t);
  });
});

describe('tasks (E7)', () => {
  it('drawn on first read; progress from the tallies of their period; a claim pays and scores once', async () => {
    const p = await player(8801, 2);
    const v = await tasksOf(DB(), p, MON);
    expect(v.tasks.filter((t) => t.kind === 'daily').map((t) => t.id)).toEqual(drawTasks(S, periodOf('daily', MON), p).map((t) => t.id));
    expect(v.tasks.filter((t) => t.kind === 'weekly')).toHaveLength(TASKS.weekly);
    expect(v.rerolls).toBe(TASKS.rerolls);
    const t = v.tasks[0];
    expect(t.have).toBe(0);
    expect(await code(claimTask(env, p, 'daily', 0, MON))).toBe('not_done');
    // yesterday's tally does not count; half of today's does half
    await tally(p, t, t.need * 5, MON - DAY_MS);
    await tally(p, t, t.need / 2);
    expect((await tasksOf(DB(), p, MON)).tasks[0].have).toBeCloseTo(t.need / 2, 6);
    await tally(p, t, t.need * 3);
    const u = (await tasksOf(DB(), p, MON)).tasks[0];
    expect(u.have).toBe(t.need); // capped at the need
    const coin = await good(p, 'coin');
    const r = await claimTask(env, p, 'daily', 0, MON);
    expect(r.reward).toEqual(taskDef(t.id)!.reward);
    expect(await good(p, 'coin')).toBe(coin + (t.reward.coin ?? 0));
    expect(r.pts).toBe(t.pts);
    const kind = t.score === 'peace' ? 'tasks' : 'feats';
    const pts = await DB().prepare('SELECT points FROM war_peace_score WHERE alliance = 2 AND day = ?1 AND kind = ?2').bind(dayOf(MON), kind).first<{ points: number }>();
    expect(pts!.points).toBe(t.pts);
    expect(await code(claimTask(env, p, 'daily', 0, MON))).toBe('claimed');
    expect((await tasksOf(DB(), p, MON)).tasks[0].claimed).toBe(true);
    // the next day: new tasks, nothing claimed, nothing carried over
    const next = await tasksOf(DB(), p, MON + DAY_MS);
    expect(next.tasks.filter((x) => x.kind === 'daily').every((x) => !x.claimed && x.have === 0)).toBe(true);
    // the weekly tasks are the same all week and count every day of it
    const wk = next.tasks.find((x) => x.kind === 'weekly')!;
    expect(wk.id).toBe(v.tasks.find((x) => x.kind === 'weekly')!.id);
  });

  it('the score stays under the alliance\'s daily cap; the reward is paid still', async () => {
    const p = await player(8811, 3);
    const v = await tasksOf(DB(), p, MON), t = v.tasks[0];
    const kind = t.score === 'peace' ? 'tasks' : 'feats', cap = t.score === 'peace' ? TASKS.peaceCap : TASKS.warCap;
    await DB().prepare('INSERT INTO war_peace_score (season, alliance, day, kind, points) VALUES (?1, 3, ?2, ?3, ?4)').bind(S, dayOf(MON), kind, cap - 1).run();
    await tally(p, t, t.need);
    const coin = await good(p, 'coin'), r = await claimTask(env, p, 'daily', 0, MON);
    expect(r.pts).toBe(1);
    expect(await good(p, 'coin')).toBe(coin + (t.reward.coin ?? 0));
  });

  it('one free reroll a day: a fresh task whose progress starts now; claimed tasks stay', async () => {
    const p = await player(8821, 0);
    const v = await tasksOf(DB(), p, MON), old = v.tasks[1];
    const next = rerollTask(S, periodOf('daily', MON), p, v.tasks.filter((x) => x.kind === 'daily').map((x) => x.id), old.id)!;
    await tallyStmt(DB(), p, next.metric, 5, MON).run(); // done before the reroll: does not count
    const r = await rerollOne(DB(), p, 'daily', 1, MON);
    expect(r.id).toBe(next.id);
    expect(r.have).toBe(0);
    await tallyStmt(DB(), p, next.metric, 1, MON).run();
    const after = await tasksOf(DB(), p, MON);
    expect(after.tasks[1].id).toBe(next.id);
    expect(after.tasks[1].have).toBe(Math.min(1, next.n));
    expect(after.rerolls).toBe(0);
    expect(await code(rerollOne(DB(), p, 'weekly', 0, MON))).toBe('no_reroll');
    // tomorrow: a reroll again (the weekly one); a claimed task cannot be rerolled
    expect((await rerollOne(DB(), p, 'weekly', 0, MON + DAY_MS)).kind).toBe('weekly');
    const t2 = (await tasksOf(DB(), p, MON + 2 * DAY_MS)).tasks[0];
    await tally(p, t2, t2.need, MON + 2 * DAY_MS);
    await claimTask(env, p, 'daily', 0, MON + 2 * DAY_MS);
    expect(await code(rerollOne(DB(), p, 'daily', 0, MON + 2 * DAY_MS))).toBe('claimed');
  });

  it('the hooks tally: goods and labour to works, fights (wins, kills), the gather watch', async () => {
    const p = await player(8831, 1, 9101), q = await player(8832, 1, 9101), now = Date.now(), d = dayOf(now);
    await setGood(p, 'stone', 300);
    await giveWork(env, p, 'temple', { stone: 120 }, now, 9101);
    await addLabour(env, 1, 'temple', { [p]: 1800, [q]: 600 }, now, 9101);
    expect(await tallyOf(DB(), p, d, d + 1, 9101)).toMatchObject({ workGoods: 120, labour: 1800 });
    // a fight: p's men walk off and the foe's do not: a win and his men's kills; q lost
    const man = (owner: string, team: number, state: string, kills: number) => ({ pid: `x${owner}${kills}`, owner, team, state, kills }) as unknown as FightReport['persons'][number];
    const rep = { tick: 1, persons: [man(`p:${p}`, 1, 'fit', 3), man(`p:${p}`, 1, 'wounded', 1), man(`p:${q}`, 2, 'dead', 0)], loot: {} } as FightReport;
    await DB().batch(fightTallies(DB(), rep, now));
    expect(await tallyOf(DB(), p, d, d + 1)).toMatchObject({ wins: 1, kills: 4 });
    expect((await tallyOf(DB(), q, d, d + 1)).wins).toBeUndefined();
    // the gather watch: a man cuts wood and drops it at a store: counted; a carrier fetching stone from a store: not
    const w = new GatherWatch(), owner = () => `p:${p}`;
    const u = (id: number, state: UnitSnap['state'], carry?: string, load = 0) => ({ id, squad: 1, x: 0, y: 0, facing: 0, hp: 1, maxHp: 1, cls: 'civ_worker', state, carry, load }) as UnitSnap;
    w.step([u(1, 'gather', 'wood', 2), u(2, 'move', 'stone', 5)], owner);
    w.step([u(1, 'move', 'wood', 4), u(2, 'move', 'stone', 5)], owner);
    w.step([u(1, 'idle'), u(2, 'idle')], owner);
    expect(w.drain()).toEqual([[p, 'gatherWood', 4]]);
    expect(w.drain()).toEqual([]);
    // a man who dies with his load gathered nothing
    w.step([u(3, 'gather', 'stone', 3)], owner);
    w.step([u(3, 'dead', 'stone', 3)], owner);
    w.step([], owner);
    expect(w.drain()).toEqual([]);
  });
});

describe('the wonder (E7 alliance projects)', () => {
  it('raised in stages: each needs its goods and labour, opens the next, perks the alliance and scores', async () => {
    const season = 9201, a = await player(8851, 2, season), b = await player(8852, 2, season), now = Date.now();
    const [s1, s2, s3] = WONDER.stages;
    let v = (await worksOf(DB(), 2, season)).find((w) => w.id === 'wonder')!;
    expect(v.stage).toBe(0);
    expect(v.need).toEqual(s1.goods);
    expect(v.stages!.map((s) => s.done)).toEqual([false, false, false]);
    expect(await openWorks(DB(), 2, season)).toContain('wonder');
    // stage 1: goods from two members, then labour; what is not needed is not taken
    for (const [k, n] of Object.entries(s1.goods)) await setGood(a, k, n);
    await setGood(b, 'stone', 500);
    expect(await giveWork(env, b, 'wonder', { stone: 500 }, now, season)).toEqual({ stone: 500 });
    expect(await giveWork(env, a, 'wonder', { ...s1.goods, marble: 5 }, now, season)).toEqual({ ...s1.goods, stone: s1.goods.stone - 500 });
    expect(await addLabour(env, 2, 'wonder', { [a]: s1.labour * 3600 + 50 }, now, season)).toBeCloseTo(s1.labour * 3600, 3);
    v = (await worksOf(DB(), 2, season)).find((w) => w.id === 'wonder')!;
    expect(v.stage).toBe(1);
    expect(v.done).toBe(false);
    expect(v.need).toEqual(s2.goods);
    expect(v.goods).toEqual({});
    expect(v.labour).toBe(0);
    expect(v.stages!.map((s) => s.done)).toEqual([true, false, false]);
    expect(v.by[0].pid).toBe(a); // the most given first
    expect(await perksOf(DB(), 2, season)).toEqual({ travel: s1.bonus.travel });
    // stage 2 only takes stage 2's goods
    expect(await code(giveWork(env, a, 'wonder', { wood: 10 }, now, season))).toBe('not_needed');
    for (const [k, n] of Object.entries(s2.goods)) await setGood(a, k, n);
    await giveWork(env, a, 'wonder', s2.goods, now, season);
    await addLabour(env, 2, 'wonder', { [b]: s2.labour * 3600 }, now, season);
    expect((await bonusesOf(DB(), season)).get(2)).toEqual({ sight: s2.bonus.sight });
    // stage 3: the wonder stands; repairs and the task boost
    for (const [k, n] of Object.entries(s3.goods)) await setGood(a, k, n);
    await giveWork(env, a, 'wonder', s3.goods, now, season);
    await addLabour(env, 2, 'wonder', { [a]: s3.labour * 3600 }, now, season);
    v = (await worksOf(DB(), 2, season)).find((w) => w.id === 'wonder')!;
    expect(v.done).toBe(true);
    expect(v.stage).toBe(3);
    expect(await openWorks(DB(), 2, season)).not.toContain('wonder');
    expect(await code(giveWork(env, a, 'wonder', { stone: 1 }, now, season))).toBe('done');
    expect(await perksOf(DB(), 2, season)).toEqual({ travel: s1.bonus.travel, sight: s2.bonus.sight, repairCost: s3.bonus.repairCost, tasks: s3.bonus.tasks });
    const pts = await DB().prepare("SELECT SUM(points) AS p FROM war_peace_score WHERE alliance = 2 AND kind = 'works'").first<{ p: number }>();
    expect(pts!.p).toBeGreaterThanOrEqual(s1.score + s2.score + s3.score);
  });
});
