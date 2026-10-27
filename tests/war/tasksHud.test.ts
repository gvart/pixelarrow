import { describe, expect, it } from 'vitest';
// W-62 E7 the Tasks panel (src/war/view/hud/tasks.ts) and the wonder card on the Works tab (src/war/view/hud/peaceCards.ts).
import { offlineTasks, tasksHtml, until } from '../../src/war/view/hud/tasks';
import { offlineWorks, worksHtml } from '../../src/war/view/hud/peaceCards';
import { DAILY, TASKS, WEEKLY } from '../../src/war/net/tasks';
import { fill, GUIDE_LORE, ORDER_LORE, TASK_LORE } from '../../src/war/net/questLore';
import { GUIDE_STEPS } from '../../src/war/net/guide';
import { WONDER } from '../../src/war/net/works';

const NOW = Date.UTC(2031, 0, 6, 12);

describe('E7 tasks panel', () => {
  it('lists the day\'s and the week\'s draw with reroll buttons; a done task offers Claim, a claimed one says so', () => {
    const v = offlineTasks(42, NOW);
    expect(v.tasks.filter((t) => t.kind === 'daily')).toHaveLength(TASKS.daily);
    expect(v.tasks.filter((t) => t.kind === 'weekly')).toHaveLength(TASKS.weekly);
    let html = tasksHtml(v, true);
    expect(html).toContain('Today');
    expect(html).toContain('This week');
    expect(html).toContain('resets in 12h 0m');
    expect(html.match(/data-act="reroll"/g)).toHaveLength(5);
    expect(html).not.toContain('data-act="claim"');
    v.tasks[0] = { ...v.tasks[0], have: v.tasks[0].need };
    v.tasks[1] = { ...v.tasks[1], have: v.tasks[1].need, claimed: true };
    html = tasksHtml({ ...v, rerolls: 0, boost: 1.5 }, true);
    expect(html.match(/data-act="claim"/g)).toHaveLength(1);
    expect(html).toContain('Claimed');
    expect(html).toContain('reroll used today');
    expect(html).toContain('+50%');
    expect(until(3 * 86_400_000 + 4 * 3_600_000)).toBe('3d 4h');
  });
});

describe('quest lore on the tasks, the guide and the orders', () => {
  it('every task names its giver, story, where to go and how it pays, with Track on open ones', () => {
    for (const t of [...DAILY, ...WEEKLY]) expect(TASK_LORE[t.metric].giver.name).toBeTruthy();
    for (const s of GUIDE_STEPS) expect(GUIDE_LORE[s.id].story.length).toBeGreaterThan(20);
    for (const k of ['attack', 'defend', 'rally', 'supply'] as const) expect(ORDER_LORE[k].pay).toBeTruthy();
    const v = offlineTasks(42, NOW), html = tasksHtml(v, true), lore = TASK_LORE[v.tasks[0].metric];
    expect(html).toContain(lore.giver.name);
    expect(html).toContain('Where');
    expect(html).toContain('press Claim here: the reward goes into your home strongroom');
    expect(html.match(/data-act="track"/g)).toHaveLength(v.tasks.length);
    expect(fill('Raise a camp in {town}', { town: 'Dodona' })).toBe('Raise a camp in Dodona');
  });
});

describe('E7 wonder card', () => {
  it('heads the works tab with its stage track, perks and the current stage\'s needs', () => {
    const list = offlineWorks();
    expect(list.at(-1)!.id).toBe('wonder');
    const html = worksHtml(list, true, { work: 'temple', res: 'stone', n: 50 });
    expect(html.indexOf(WONDER.name)).toBeLessThan(html.indexOf('Temple at the shrine'));
    for (const s of WONDER.stages) expect(html).toContain(s.name);
    expect(html).toContain('Stage 1 of 3');
    expect(html).toContain('sunken-temple-ruined');
    const w = { ...list.at(-1)!, stage: 2, stages: list.at(-1)!.stages!.map((s, k) => ({ ...s, done: k < 2 })), by: [{ pid: 1, name: 'Kleon', goods: 900, labour: 12 }] };
    const h2 = worksHtml([w], true, { work: 'wonder', res: 'marble', n: 50 }, { marble: 10 });
    expect(h2).toContain('Stage 3 of 3');
    expect(h2).toContain('sunken-temple-intact');
    expect(h2).toContain('Kleon');
    expect(h2).toContain('data-act="give"');
  });
});
