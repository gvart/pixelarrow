/**
 * W-172 tasks per path (src/war/net/tasks.ts PATH_TASKS): a builder or trader never draws a task only a fighting army can do,
 * alone or with partners, on a draw or a reroll, over many players and periods; every path can fill its day and week alone.
 */
import { describe, expect, it } from 'vitest';
import { DAILY, drawTasks, PATH_TASKS, periodOf, rerollTask, TASK_METRICS, TASKS, WEEKLY, type TaskMetric } from '../../src/war/net/tasks';
import { TASK_LORE } from '../../src/war/net/questLore';
import { offlineTasks } from '../../src/war/view/hud/tasks';
import { PATH_IDS } from '../../src/war/world/start';

const NOW = Date.UTC(2031, 0, 6, 12);
/** What takes a fighting army: the metrics a warrior alone draws. */
const FIGHTING: readonly TaskMetric[] = ['wins', 'kills', 'chief', 'lair', 'guard', 'soul', 'secret', 'encounter'];

describe('W-172 tasks per path', () => {
  it('every metric belongs to some path; fights only to the warrior', () => {
    for (const m of TASK_METRICS) expect(PATH_IDS.some((p) => PATH_TASKS[p].includes(m)), m).toBe(true);
    for (const m of FIGHTING) {
      expect(PATH_TASKS.warrior, m).toContain(m);
      expect(PATH_TASKS.builder, m).not.toContain(m);
      expect(PATH_TASKS.trader, m).not.toContain(m);
    }
  });

  it.each(PATH_IDS)('%s fills his day and week alone, with a reroll to spare', (path) => {
    for (const [pool, n] of [[DAILY, TASKS.daily], [WEEKLY, TASKS.weekly]] as const) {
      const solo = new Set(pool.filter((t) => !t.partner && PATH_TASKS[path].includes(t.metric)).map((t) => t.metric));
      expect(solo.size, path).toBeGreaterThanOrEqual(n + 1);
    }
  });

  it.each(PATH_IDS)('%s only draws and rerolls his own work, solo or partnered, over players and periods', (path) => {
    for (const kind of ['daily', 'weekly'] as const) {
      for (let d = 0; d < 10; d++) {
        const p = periodOf(kind, NOW + d * 86_400_000 * (kind === 'weekly' ? 7 : 1));
        for (let pid = 1; pid <= 20; pid++) {
          for (const solo of [true, false]) {
            const got = drawTasks(1, p, pid, solo, path);
            expect(got).toHaveLength(kind === 'daily' ? TASKS.daily : TASKS.weekly);
            for (const t of got) expect(PATH_TASKS[path], t.id).toContain(t.metric);
            const again = rerollTask(1, p, pid, got.map((t) => t.id), got[0].id, solo, path);
            expect(again, `${path} ${kind} ${pid}`).not.toBeNull();
            expect(PATH_TASKS[path]).toContain(again!.metric);
          }
        }
      }
    }
  });

  it('no path (a dev player) keeps the whole pool', () => {
    const metrics = new Set<TaskMetric>();
    for (let pid = 1; pid <= 200; pid++) for (const t of drawTasks(1, periodOf('daily', NOW), pid, true)) metrics.add(t.metric);
    expect(metrics.has('wins') && metrics.has('built') && metrics.has('townSale')).toBe(true);
  });

  it('the offline panel draws by his path, and the new work has its words', () => {
    for (const t of offlineTasks(7, NOW, 'trader').tasks) expect(PATH_TASKS.trader).toContain(t.metric);
    for (const m of ['built', 'townSale'] as const) {
      expect(TASK_LORE[m].goal.split(' ').length).toBeLessThanOrEqual(7);
      expect(TASK_LORE[m].goal).not.toMatch(/[0-9]/);
    }
  });
});
