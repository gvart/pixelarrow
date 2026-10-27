/**
 * W-62 E7 the Tasks panel (rules: src/war/net/tasks.ts, server/src/war/tasks.ts), in the red-figure kit like the Works
 * window (./peace.ts): the corner button "Tasks" (a gold pip when one is ready to claim) opens a window with today's
 * three tasks and the week's two, each a card: its icon, title, the hint as a dim line, a progress bar with have / need,
 * the reward and score chips, and Claim (when done) or the reroll (one free a UTC day). The resets count down in the
 * section heads. Online it reads /api/war/tasks (polled each minute for the pip); offline it shows the draw, unprogressed.
 */
import { DAY_MS, drawTasks, periodOf, TASKS, type TaskKind, type TaskMetric, type TasksView, type TaskView } from '../../net/tasks';
import { WAR_SEASON } from '../../world/alliances';
import type { SandboxScene } from '../SandboxScene';
import { draggable } from './drag';
import { glyph } from './glyph';
import { fitHeight, icon } from './kit';
import { esc, tipper } from './roster/ui';
import { keys } from '../../input/keys';

type Mk = (id: string, css: string, html?: string) => HTMLElement;
const attr = esc;
const fmt = (n: number) => (n >= 100 ? String(Math.round(n)) : String(Math.round(n * 10) / 10));

/** Each metric's icon. */
const METRIC_ICON: Record<TaskMetric, () => string> = {
  gatherWood: () => icon('res-wood', 32), gatherStone: () => icon('res-stone', 32), deliver: () => icon('bld-storehouse', 32),
  wins: () => glyph('ui:swords', 30), kills: () => glyph('ui:skull', 30), soul: () => icon('res-asphodel', 32),
  caravan: () => icon('trade-wagon', 32), guard: () => glyph('ui:shield', 30), labour: () => glyph('ui:people', 30),
  workGoods: () => icon('node-engineer-master-builder', 32), sellAlliance: () => icon('node-merchant-emporos', 32), contract: () => icon('trade-contract', 32),
};
const ICONED = new Set(['food', 'wood', 'stone', 'marble', 'coin', 'silver']);
const gi = (r: string) => (ICONED.has(r) ? icon('res-' + r) : `<span class="rf-dim">${r}</span>`);

/** "5h 12m", "3d 4h", "12m". */
export const until = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60_000)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m % 60}m` : `${m % 60}m`;
};

/** The offline view: this player's draw, nothing done. */
export function offlineTasks(pid: number, now: number): TasksView {
  const tasks: TaskView[] = [];
  for (const kind of ['daily', 'weekly'] as const) {
    const p = periodOf(kind, now);
    drawTasks(WAR_SEASON.id, p, pid).forEach((t, slot) => tasks.push({ kind, slot, id: t.id, title: t.title, hint: t.hint, metric: t.metric, have: 0, need: t.n, per: t.per ?? 1, unit: t.unit ?? '', reward: t.reward, score: t.score, pts: t.pts, claimed: false, ends: p.ends }));
  }
  return { tasks, rerolls: TASKS.rerolls, boost: 1, now };
}

const ready = (t: TaskView) => !t.claimed && t.have >= t.need - 1e-6;

let closer: (() => void) | null = null;
/** Close the Tasks window (the Works window opens in its place: ./peace.ts). */
export const closeTasks = () => closer?.();

/** One task card. */
function card(t: TaskView, rerolls: number, online: boolean): string {
  const f = Math.min(1, t.have / t.need), done = ready(t);
  const num = `${fmt(t.have / t.per)}<span class="rf-dim">/${fmt(t.need / t.per)}${t.unit ? ` ${t.unit}` : ''}</span>`;
  const rw = Object.entries(t.reward).map(([r, n]) => `<span class="rf-ichip gold" data-tip="${attr(`<b class="k">Reward</b> · ${n} ${r}<br><span class="rf-dim tip-w">into your home strongroom</span>`)}">${gi(r)}${n}</span>`).join('');
  const sc = t.score === 'peace'
    ? `<span class="rf-ichip good" data-tip="${attr(`<b class="k">Peace score</b> · +${t.pts} for your alliance<br><span class="rf-dim tip-w">tasks add at most ${TASKS.peaceCap} a day per alliance</span>`)}">${glyph('ui:laurel', 18)}+${t.pts}</span>`
    : `<span class="rf-ichip tk-war" data-tip="${attr(`<b class="k">War score</b> · +${t.pts} for your alliance<br><span class="rf-dim tip-w">feats add at most ${TASKS.warCap} a day per alliance</span>`)}">${glyph('ui:swords', 18)}+${t.pts}</span>`;
  const act = t.claimed
    ? `<span class="tk-claimed">${glyph('ui:check', 14)}Claimed</span>`
    : done
      ? `<button class="rf-tbtn pri" data-act="claim" data-k="${t.kind}" data-s="${t.slot}"${online ? '' : ' disabled'}>Claim</button>`
      : `<button class="rf-tbtn tk-re" data-act="reroll" data-k="${t.kind}" data-s="${t.slot}"${online && rerolls > 0 ? '' : ' disabled'} data-tip="${attr(rerolls > 0 ? `<b class="k">Reroll</b> · draw another task<br><span class="rf-dim tip-w">${rerolls} free reroll left today; its progress starts now</span>` : '<b class="k">Reroll</b> · none left today<br><span class="rf-dim tip-w">one free reroll each UTC day</span>')}">↻</button>`;
  return `<div class="tk-card rf-well${done ? ' ready' : ''}${t.claimed ? ' claimed' : ''}">
    <div class="tk-ic">${METRIC_ICON[t.metric]()}</div>
    <div class="tk-body"><div class="tk-top"><span class="tk-name">${esc(t.title)}</span><span class="rf-num tk-n">${num}</span></div>
      <div class="tk-hint rf-dim" data-tip="${attr(`<b class="k">${esc(t.title)}</b><br>${esc(t.hint)}`)}">${esc(t.hint)}</div>
      <div class="tk-prog"><div class="rf-bar"><i class="${done || t.claimed ? 'ok' : 'construction'}" style="width:${(f * 100).toFixed(1)}%"></i></div></div>
      <div class="tk-foot">${rw}${sc}<span class="tk-act">${act}</span></div></div></div>`;
}

/** The panel's body: the daily and the weekly section, the rerolls and the wonder's boost. */
export function tasksHtml(v: TasksView, online: boolean): string {
  const sec = (kind: TaskKind, name: string) => {
    const list = v.tasks.filter((t) => t.kind === kind), done = list.filter((t) => t.claimed).length, ends = list[0]?.ends ?? periodOf(kind, v.now).ends;
    return `<div class="rf-sec">${name} <span class="rf-dim">${done}/${list.length} · resets in ${until(ends - v.now)}</span></div>${list.map((t) => card(t, v.rerolls, online)).join('')}`;
  };
  const boost = v.boost > 1 ? `<span class="rf-ichip gold" data-tip="${attr(`<b class="k">Hall of the Twelve</b> · task rewards +${Math.round((v.boost - 1) * 100)}%<br><span class="rf-dim tip-w">your alliance's wonder stands</span>`)}">${glyph('ui:star', 18)}+${Math.round((v.boost - 1) * 100)}%</span>` : '';
  return `${sec('daily', 'Today')}${sec('weekly', 'This week')}
    <div class="tk-note"><span class="rf-dim">${v.rerolls > 0 ? `${v.rerolls} free reroll left today` : 'reroll used today'}</span>${boost}</div>`;
}

const CSS = `
.tk-card{display:flex;gap:8px;padding:5px 6px;margin-bottom:4px}
.tk-card.ready{border-color:#6a5326;box-shadow:inset 0 0 0 1px #3a2a14,0 0 6px rgba(224,184,103,.25)}
.tk-card.claimed{opacity:.6}
.tk-ic{width:40px;height:40px;flex:none;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 65%,#3a2516,#120b08);border:1px solid var(--rf-line);box-shadow:inset 0 0 0 1px #0e0907}
.tk-body{flex:1;min-width:0}
.tk-top{display:flex;align-items:baseline;gap:6px}
.tk-name{flex:1;min-width:0;font:700 13px/1.15 Cinzel,serif;color:var(--rf-title);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tk-n{font:700 12px/1 Inter,sans-serif;color:var(--rf-gold)}.claimed .tk-n,.ready .tk-n{color:var(--rf-good)}
.tk-hint{font-size:11.5px;line-height:1.25;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tk-prog{margin:4px 0}.tk-prog .rf-bar{width:100%}
.tk-foot{display:flex;align-items:center;gap:4px;flex-wrap:wrap}.tk-foot .rf-ichip{height:20px}.tk-foot .rf-tbtn{height:22px}
.tk-war{color:#e08a6a;border-color:#5a2c22}
.tk-act{margin-left:auto}
.tk-re{width:26px;padding:0;font-size:14px}
.tk-claimed{display:inline-flex;align-items:center;gap:3px;font:600 11px/1 Inter,sans-serif;color:var(--rf-good)}
.tk-note{display:flex;align-items:center;justify-content:space-between;margin-top:4px;font-size:11px}
#rfTasksBtn{position:relative}
#rfTasksBtn.pip::after{content:'';position:absolute;right:-2px;top:-2px;width:7px;height:7px;border-radius:50%;background:var(--rf-gold);box-shadow:0 0 4px var(--rf-gold)}
`;

export function mountTasks(s: SandboxScene, mk: Mk): void {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const tip = mk('rfTasksTip', 'display:none;z-index:7');
  tip.className = 'rf rf-tip';
  const win = mk('rfTasks', 'top:40px;right:110px;width:360px;display:none;pointer-events:auto;padding:4px 8px 8px');
  win.className = 'rf rf-card rf-esc';
  draggable(win, '.rf-head');
  tipper(win, tip);
  const online = () => !!s.sim.net;
  let v: TasksView = offlineTasks(s.sim.playerId ?? 0, Date.now()), msg = '', bad = false;
  const btn = document.createElement('button');
  const render = () => {
    btn.classList.toggle('pip', v.tasks.some(ready));
    if (win.style.display === 'none') return;
    const scroll = win.scrollTop, done = v.tasks.filter((t) => t.claimed).length;
    win.innerHTML = `<div class="rf-head rf-ph">${icon('trade-contract', 32)}<div style="flex:1;min-width:0"><div class="rf-name">Tasks</div><div class="sub">${done} of ${v.tasks.length} claimed${online() ? '' : ' · offline'}</div></div><button class="rf-tbtn x" data-act="close" title="close (Esc)">×</button></div>
      ${tasksHtml(v, online())}<div class="mk-msg rf-dim" style="min-height:15px${bad ? ';color:var(--rf-bad)' : ''}">${esc(msg)}</div>`;
    win.scrollTop = scroll;
    fitHeight(win);
  };
  const load = async () => {
    if (online()) {
      const r = await s.sim.api<TasksView>('GET', 'tasks');
      if (r?.tasks) v = r;
    } else v = offlineTasks(s.sim.playerId ?? 0, Date.now());
    render();
  };
  const toggle = (on = win.style.display === 'none') => {
    win.style.display = on ? '' : 'none';
    btn.classList.toggle('on', on);
    if (on) {
      // one window in this corner: Works and Tasks share it
      const works = document.getElementById('rfWorks');
      if (works && works.style.display !== 'none') works.querySelector<HTMLElement>('[data-act="close"]')?.click();
      void load();
    }
  };
  closer = () => { if (win.style.display !== 'none') toggle(false); };
  addEventListener('keydown', (e: KeyboardEvent) => { if (keys.act(e) === 'back') closer?.(); });
  win.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!t || (t as HTMLButtonElement).disabled) return;
    const a = t.dataset.act;
    if (a === 'close') return toggle(false);
    if (a !== 'claim' && a !== 'reroll') return;
    void s.sim.api<{ reward?: Record<string, number>; pts?: number; task?: TaskView; error?: string; message?: string }>('POST', `tasks/${t.dataset.k}/${t.dataset.s}/${a}`).then((r) => {
      bad = !r || !!r.error;
      msg = !r ? 'no answer' : r.error ? (r.message ?? r.error) : a === 'claim' ? `claimed: ${Object.entries(r.reward ?? {}).map(([g, n]) => `${n} ${g}`).join(', ')}${r.pts ? ` · +${fmt(r.pts)} score` : ''}` : `new task: ${r.task?.title ?? ''}`;
      void load();
    });
  });
  btn.className = 'rf-tbtn';
  btn.id = 'rfTasksBtn';
  btn.textContent = 'Tasks';
  btn.title = 'daily and weekly tasks';
  btn.onclick = () => toggle();
  const corner = document.getElementById('rfDev');
  corner?.insertBefore(btn, document.getElementById('rfWorksBtn')?.nextSibling ?? corner.children[1] ?? null);
  // the countdowns and the pip: every minute (the server read only while online)
  setInterval(() => (online() ? void load() : ((v = { ...v, now: Date.now() }), render())), 60_000);
  setTimeout(() => void load(), 4000);
  // dev: fill the panel offline (screenshots, layout checks)
  if (import.meta.env.DEV) (window as unknown as { __tasks: unknown }).__tasks = {
    view: (x: TasksView) => ((v = x), render()),
    open: () => toggle(true),
    offline: (pid: number, now = Date.now()) => ((v = offlineTasks(pid, now)), render()),
    DAY_MS,
  };
}
