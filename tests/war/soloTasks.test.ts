/**
 * W-73 solo tasks (src/war/net/tasks.ts): a player with no realistic partner never draws a task that needs another
 * player (selling abroad, guard and market contracts); the wild gives him tasks he can do alone (a chief, a hidden
 * quest, an encounter, lairs). With partners the partner tasks stay in the pool.
 */
import { describe, expect, it } from 'vitest';
import { DAILY, drawTasks, periodOf, rerollTask, TASK_METRICS, TASKS, WEEKLY } from '../../src/war/net/tasks';
import { TASK_LORE } from '../../src/war/net/questLore';
import { offlineTasks } from '../../src/war/view/hud/tasks';

const NOW = Date.UTC(2031, 0, 6, 12);
const SOLO_METRICS = ['chief', 'secret', 'encounter', 'lair'] as const;

describe('solo tasks (W-73)', () => {
  it('partner tasks are marked; every pool can still be filled alone', () => {
    const partner = [...DAILY, ...WEEKLY].filter((t) => t.partner).map((t) => t.id).sort();
    expect(partner).toEqual(['d-contract', 'd-guard', 'd-sell', 'w-contract', 'w-guard', 'w-sell']);
    for (const m of SOLO_METRICS) {
      expect(TASK_METRICS).toContain(m);
      expect(DAILY.some((t) => t.metric === m && !t.partner), m).toBe(true);
    }
    expect(new Set(WEEKLY.filter((t) => !t.partner).map((t) => t.metric)).size).toBeGreaterThanOrEqual(TASKS.weekly + 2);
  });

  it('a solo draw (and reroll) never holds a partner task; a partnered one may', () => {
    let partnered = 0;
    for (const kind of ['daily', 'weekly'] as const) {
      for (let day = 0; day < 14; day++) {
        const p = periodOf(kind, NOW + day * 86_400_000 * (kind === 'weekly' ? 7 : 1));
        for (let pid = 1; pid <= 30; pid++) {
          const solo = drawTasks(1, p, pid, true);
          expect(solo).toHaveLength(kind === 'daily' ? TASKS.daily : TASKS.weekly);
          expect(solo.some((t) => t.partner)).toBe(false);
          const held = solo.map((t) => t.id);
          expect(rerollTask(1, p, pid, held, held[0], true)?.partner).toBeUndefined();
          if (drawTasks(1, p, pid).some((t) => t.partner)) partnered++;
        }
      }
    }
    expect(partnered).toBeGreaterThan(50);
  });

  it('offline the player is alone: no partner task', () => {
    for (let pid = 0; pid < 40; pid++) for (const t of offlineTasks(pid, NOW).tasks) expect(t.id, t.id).not.toMatch(/sell|guard|contract/);
  });

  it('each solo task has a giver, a short imperative goal (7 words or fewer, no numbers), a story and where', () => {
    for (const m of SOLO_METRICS) {
      const l = TASK_LORE[m];
      expect(l.giver.name).toBeTruthy();
      expect(l.goal.split(' ').length, l.goal).toBeLessThanOrEqual(7);
      expect(l.goal).not.toMatch(/[0-9]/);
      expect(l.story.length).toBeGreaterThan(40);
      expect(l.where.length).toBeGreaterThan(20);
    }
  });
});
