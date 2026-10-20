/**
 * Mounts the crafting views (M5h5) on the HUD (../hud.ts hands its element maker, so the UI scale applies):
 *
 *   right, under the corner   the workplace panel of the selected own workplace (./workplace.ts)
 *   right of the soldier card the profession tree of a civilian (./tree.ts): Tree on his card, or a crafter's row
 *
 * Both re-render at 4 Hz while open, only when their HTML changed (so hover and scroll hold). Crafters at a workplace:
 * the men of own civilian squads on civWork standing by it (their trade), in unit id order (the sim's slot order).
 */
import { CIV_CLASSES, isCivClass } from '../../../../data/classes';
import { BUILDINGS } from '../../../sim/economy';
import { workRate, WORK } from '../../../sim/civilians';
import type { BuildingSnap } from '../../../types';
import type { SandboxScene } from '../../SandboxScene';
import type { RosterHooks } from '../roster';
import { sandboxRoster } from '../roster/state';
import { tipper } from '../roster/ui';
import { fitHeight } from '../kit';
import { sandboxCraft } from './state';
import { TREE_CSS, treeHtml, TREE_W } from './tree';
import { WP_CSS, WP_PROF, WP_W, workplaceHtml, type Crafter, type Idle, type WpView } from './workplace';

type Mk = (id: string, css: string, html?: string) => HTMLElement;
const TEAM = 0;

export function mountCraft(s: SandboxScene, mk: Mk, roster: RosterHooks): void {
  const R = sandboxRoster(s), C = sandboxCraft(s, R);
  const style = document.createElement('style');
  style.textContent = TREE_CSS + WP_CSS;
  document.head.appendChild(style);
  const wpEl = mk('cfWp', `top:66px;right:4px;width:${WP_W}px;display:none;pointer-events:auto`);
  const treeEl = mk('cfTree', `top:50px;left:4px;width:${TREE_W}px;display:none;pointer-events:auto`);
  const tip = mk('cfTip', 'display:none;z-index:7');
  tip.className = 'rf rf-tip';
  const unTip = [tipper(wpEl, tip), tipper(treeEl, tip)];
  for (const el of [wpEl, treeEl]) el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });

  let treePid: string | null = null, picked: string | null = null, lastT = '', lastW = '', wpId = -1;
  const view: WpView = { tab: '', all: false, recipe: null };
  C.onNote = (text, kind) => R.onNote?.({ kind: kind === 'bad' ? 'capture' : kind === 'made' ? 'levelUp' : 'info', text });

  const workplace = (): BuildingSnap | undefined => {
    const b = s.build.selectedBuilding();
    return b && b.team === TEAM && BUILDINGS[b.type]?.workplace && (b.state === 'done' || b.state === 'damaged') ? b : undefined;
  };
  const centre = (q: number): [number, number] | null => {
    let x = 0, y = 0, n = 0;
    for (const d of s.drawn) if (d.u.squad === q && d.u.state !== 'dead') (x += d.x), (y += d.y), n++;
    return n ? [x / n, y / n] : null;
  };
  /** Own civilian squads of the workplace's trade: at work by it, and the rest. */
  const crew = (b: BuildingSnap): { crafters: Crafter[]; idle: Idle[] } => {
    const prof = WP_PROF[BUILDINGS[b.type].workplace!.kind], cls = prof ? `civ_${prof}` : '';
    const units = s.sim.cur?.units ?? [], crafters: Crafter[] = [], idle: Idle[] = [];
    for (const q of s.sim.cur?.squads ?? []) {
      if (q.team !== TEAM || !q.civ) continue;
      const men = q.units.map((id) => units[id]).filter((u) => u && u.state !== 'dead' && u.cls === cls);
      if (!men.length) continue;
      const c = centre(q.id), near = c && Math.hypot(c[0] - b.x, c[1] - b.y) <= Math.max(b.w, b.h) / 2 + 5;
      if (q.order === 'civWork' && near) {
        for (const u of men) {
          const civ = C.civ(u.pid), hero = !s.sim.net && u.pid ? R.roster.get(u.pid)?.hero : undefined;
          crafters.push({ unit: u.id, squad: q.id, civ, rate: hero ? workRate(hero) : 1 + WORK.perLevel * ((civ?.level ?? 1) - 1) });
        }
      } else idle.push({ squad: q.id, men: men.length, name: CIV_CLASSES[cls as keyof typeof CIV_CLASSES]?.name + 's', at: q.order === 'civWork' ? 'at work elsewhere' : q.order });
    }
    crafters.sort((a, b2) => a.unit - b2.unit);
    return { crafters, idle };
  };

  // no re-render between a press and its click (the stock ticks on, and a row replaced under the pointer eats the click)
  let pressed = false;
  for (const el of [wpEl, treeEl]) el.addEventListener('pointerdown', () => (pressed = true));
  addEventListener('pointerup', () => setTimeout(() => (pressed = false), 0), true);
  const render = () => {
    if (pressed) return;
    const b = workplace();
    if (b?.id !== wpId) { wpId = b?.id ?? -1; view.recipe = null; view.tab = ''; }
    wpEl.style.display = b ? '' : 'none';
    if (b) {
      if (s.sim.net) void C.pull();
      const { crafters, idle } = crew(b);
      const html = workplaceHtml(C, b, crafters, idle, view, s.sim.cur?.stock?.[TEAM] ?? {});
      if (html !== lastW) {
        const list = wpEl.querySelector<HTMLElement>('.wp-list'), top = list?.scrollTop ?? 0;
        wpEl.innerHTML = lastW = html;
        const l2 = wpEl.querySelector<HTMLElement>('.wp-list');
        if (l2) l2.scrollTop = top;
      }
      fitHeight(wpEl);
    }
    const c = C.civ(treePid ?? undefined);
    treeEl.style.display = c ? '' : 'none';
    if (c) {
      // right of the soldier card when it shows, else of the roster panel, else at the left edge
      const z = Number(treeEl.style.zoom) || 1, anchor = [document.getElementById('rrCard'), document.getElementById('rrPanel')].find((e) => e && e.style.display !== 'none');
      treeEl.style.left = `${anchor ? anchor.getBoundingClientRect().right / z + 4 : 4}px`;
      const html = treeHtml(C, c, picked);
      if (html !== lastT) treeEl.innerHTML = lastT = html;
      fitHeight(treeEl);
    }
    for (const f of unTip) f();
  };
  const openTree = (pid: string) => { treePid = treePid === pid ? null : pid; picked = null; render(); };
  roster.tree = openTree;
  C.onChange = () => { roster.render(); render(); };

  treeEl.addEventListener('click', (e) => {
    const t = e.target as HTMLElement, n = t.closest<HTMLElement>('[data-node]'), take = t.closest<HTMLElement>('[data-take]'), a = t.closest<HTMLElement>('[data-act]');
    if (!treePid) return;
    if (take) void C.pick(treePid, take.dataset.take!).then(() => { roster.render(); render(); });
    else if (n) picked = picked === n.dataset.node ? null : n.dataset.node!;
    else if (a?.dataset.act === 'respec') void C.respec(treePid).then(() => { roster.render(); render(); });
    else if (a?.dataset.act === 'closeTree') treePid = null;
    render();
  });
  wpEl.addEventListener('click', (e) => {
    const t = e.target as HTMLElement, b = workplace();
    if (!b) return;
    const d = (k: string) => t.closest<HTMLElement>(`[data-${k}]`)?.dataset[k];
    const a = d('act');
    if (a === 'closeWp') s.build.selected = -1;
    else if (a === 'all') view.all = !view.all;
    else if (d('tab')) view.tab = d('tab')!;
    else if (d('queue')) C.craft(b, d('queue')!);
    else if (d('recipe')) view.recipe = view.recipe === d('recipe') ? null : d('recipe')!;
    else if (d('cancel')) C.cancel(b, Number(d('cancel')));
    else if (d('assign')) s.sim.order({ kind: 'civWork', squad: Number(d('assign')), building: b.id });
    else if (d('repair')) C.mend('repair', b, d('repair')!);
    else if (d('salvage')) C.mend('salvage', b, d('salvage')!);
    else if (d('civ')) { const pid = d('civ')!; if (!s.sim.net && R.roster.get(pid)) roster.card(pid); openTree(pid); return; }
    render();
    setTimeout(render, 150); // the order lands on the next snapshot
  });
  addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && treePid) { treePid = null; render(); }
  });
  setInterval(render, 250);
  // scripts (scripts/war, Playwright): open a tree, read the stash
  (window as unknown as { __craft: unknown }).__craft = { C, tree: openTree, view, isCiv: isCivClass, select: (id: number) => { s.build.selected = id; render(); }, scene: s };
}
