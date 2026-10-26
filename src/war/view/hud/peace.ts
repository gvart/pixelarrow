/**
 * W-61 peaceful play on the HUD (docs/WAR.md "Peaceful play"), in the red-figure kit. Icon-led and read in two seconds;
 * the words live in tooltips:
 *
 *   top centre   the town badge: your team's town here (Snapshot.townLevels), a gold ring filling towards the next level
 *                round the level numeral, and its name; click for the town card (after Anno 1800's needs and Civ VI's city
 *                panel): the next level's needs as an icon checklist with fill bars, the perks every man of yours inside
 *                enjoys as icon chips, and the next level's perks as a greyed row
 *   top right    Works (the corner button), two tabs: Works, a project card per alliance work (after Rise of Kingdoms'
 *                alliance buildings): its art, one big progress bar, the goods and labour as have/need chips, the top
 *                three givers and the bonus it grants as a reward chip; pick a card to contribute goods from your home
 *                strongroom. Titles, the season's standings: each title's emblem, holder and lead, and your own run at it.
 *                The roster strip shows the titles as emblems (./titles.ts).
 * Online the panels read /api/war/works and /api/war/titles; offline they show the works' needs only.
 */
import type { WorkView } from '../../net/works';
import type { TownLevelSnap } from '../../types';
import type { SandboxScene } from '../SandboxScene';
import { myTeam } from '../side';
import { draggable } from './drag';
import { fitHeight, icon } from './kit';
import { esc, tipper } from './roster/ui';
import { setTitlesLine } from './roster/panel';
import { offlineWorks, titlesHtml, titlesStrip, townBadge, townCard, worksHtml, type GiveForm, type PeaceStats, type TitleRow } from './peaceCards';

type Mk = (id: string, css: string, html?: string) => HTMLElement;
const fmt = (n: number) => (n >= 100 ? String(Math.round(n)) : String(Math.round(n * 10) / 10));

const CSS = `
#rfTown{padding:3px 10px 3px 4px}
.tw-badge{display:inline-flex;align-items:center;gap:6px}
#rfTownCard .tw-top{display:flex;align-items:center;gap:8px;padding-bottom:4px}
.tw-ladder{display:inline-flex;gap:4px;margin-top:4px}
.tw-ladder i{width:8px;height:8px;transform:rotate(45deg);border:1px solid var(--rf-line);background:var(--rf-sunk)}
.tw-ladder i.on{background:var(--rf-gold);border-color:#6a5326}.tw-ladder i.cur{box-shadow:0 0 4px var(--rf-gold)}
.tw-chips{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px}.tw-chips .rf-ichip{justify-content:center;padding:0 3px 0 0}.tw-chips>.rf-dim{grid-column:1/-1}
.tw-next{margin-top:5px;padding-top:5px;border-top:1px dashed var(--rf-rule)}
.tw-nl{display:flex;align-items:center;gap:4px;margin-bottom:4px;font:700 11px/1 Cinzel,serif;letter-spacing:.04em}.tw-nl span{margin-left:auto;font:600 10.5px/1 Inter,sans-serif;color:var(--rf-gold)}
#rfWorks .rf-tabs{display:flex;align-items:flex-end;height:24px;margin:0 0 6px;border-bottom:1px solid var(--rf-rule)}
.wk-card{padding:6px;margin-bottom:6px}
.wk-card.on{border-color:var(--rf-accent)}
.wk-card.done{background:#121a0c;border-color:#3f5a2c}
.wk-top{display:flex;align-items:center;gap:8px}
.wk-art{width:48px;height:48px;flex:none;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 70%,#3a2516,#120b08);border:1px solid var(--rf-line);box-shadow:inset 0 0 0 1px #0e0907;overflow:hidden}
.wk-art img{max-width:44px;max-height:46px;object-fit:contain;image-rendering:auto}
.wk-tt{flex:1;min-width:0}
.wk-name{font:700 14px/1.15 Cinzel,serif;color:var(--rf-title)}
.wk-loc{display:inline-flex;align-items:center;gap:3px;margin-top:3px;color:var(--rf-muted);font-size:11px}
.wk-prog{display:flex;align-items:center;gap:8px;margin:7px 0 6px}.wk-prog .rf-bar{flex:1}
.wk-prog b{font:700 15px/1 Cinzel,serif;color:var(--rf-gold);min-width:52px;text-align:right}.done .wk-prog b{color:var(--rf-good)}
.wk-needs{display:flex;flex-wrap:wrap;gap:4px}
.wk-need{background:linear-gradient(90deg,#3a2a14 var(--f),var(--rf-raised) var(--f))}
.wk-need.good{background:#1d2a14}
.wk-foot{display:flex;align-items:center;gap:6px;margin-top:6px;min-height:24px}
.wk-top3{flex:1;display:flex;align-items:center;gap:4px}
.wk-av{position:relative;width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font:700 12px/1 Cinzel,serif;color:var(--rf-ink);background:radial-gradient(circle at 50% 35%,#3a2516,#120b08);box-shadow:inset 0 0 0 2px var(--c),0 0 0 1px #0e0907}
.wk-av i{position:absolute;right:-4px;bottom:-3px;font:700 8.5px/11px Inter,sans-serif;font-style:normal;width:11px;height:11px;border-radius:50%;text-align:center;color:#0e0907;background:var(--c)}
.wk-give{display:flex;align-items:center;gap:5px;margin-top:6px;padding-top:6px;border-top:1px solid var(--rf-rule)}
.wk-give .rf-step .rf-tbtn{width:23px;padding:0}.wk-give input{width:46px}
.wk-go{margin-left:auto}
.ti-row{display:flex;align-items:center;gap:8px;padding:5px 4px;border-bottom:1px solid #1d130e}
.ti-row.me{background:var(--rf-sel)}
.ti-name{font:700 13px/1.1 Cinzel,serif;color:var(--rf-title)}
.ti-who{margin-top:2px}
.ti-you{display:flex;align-items:center;gap:5px;margin-top:3px;font-size:11px}
.ti-v{display:flex;flex-direction:column;align-items:flex-end;gap:2px}.ti-v b{font-size:15px;color:var(--rf-gold)}.ti-v span{font-size:10.5px}
.ti-strip{display:flex;flex-wrap:wrap;gap:3px 8px;margin:5px 2px 0}
.ti-s{display:inline-flex;align-items:center;gap:4px;font:600 11px/1 Inter,sans-serif;color:var(--rf-ink)}.ti-s.me{color:var(--rf-gold)}
`;

export function mountPeace(s: SandboxScene, mk: Mk): void {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const tip = mk('rfPeaceTip', 'display:none;z-index:7');
  tip.className = 'rf rf-tip';
  // ---------- the town badge and card ----------
  const badge = mk('rfTown', 'top:4px;left:50%;transform:translateX(-50%);pointer-events:auto;cursor:pointer;display:none');
  badge.className = 'rf rf-card';
  const tcard = mk('rfTownCard', 'top:42px;left:50%;transform:translateX(-50%);width:316px;pointer-events:auto;padding:6px 8px 8px;display:none');
  tcard.className = 'rf rf-card';
  tipper(badge, tip);
  tipper(tcard, tip);
  let open = false, key = '';
  const mine = (): TownLevelSnap | null => s.sim.cur?.townLevels?.find((t) => t.team === myTeam()) ?? null;
  badge.onclick = () => ((open = !open), (key = ''), draw());
  const draw = () => {
    const t = mine(), k = JSON.stringify(t) + open;
    if (k === key) return;
    key = k;
    badge.style.display = t ? '' : 'none';
    badge.classList.toggle('on', open);
    if (t) badge.innerHTML = townBadge(t);
    tcard.style.display = open && t ? '' : 'none';
    if (open) tcard.innerHTML = townCard(t);
  };
  setInterval(draw, 500);

  // ---------- the works window: works and titles ----------
  const win = mk('rfWorks', 'top:40px;right:110px;width:380px;display:none;pointer-events:auto;padding:4px 8px 8px');
  win.className = 'rf rf-card';
  draggable(win, '.rf-head');
  tipper(win, tip);
  const form: GiveForm = { work: 'temple', res: 'stone', n: 50 };
  let tab: 'works' | 'titles' = 'works';
  let works: WorkView[] = offlineWorks(), titles: TitleRow[] = [], stats: PeaceStats | null = null, msg = '', bad = false;
  const online = () => !!s.sim.net;
  const home = () => (s.sim.cur?.stock?.[myTeam()] ?? {}) as Record<string, number>;
  const render = () => {
    if (win.style.display === 'none') return;
    const scroll = win.scrollTop;
    const raised = works.filter((w) => w.done).length;
    win.innerHTML = `<div class="rf-head rf-ph">${icon('node-engineer-master-builder', 32)}<div style="flex:1;min-width:0"><div class="rf-name">Alliance works</div><div class="sub">${raised} of ${works.length} raised this season${online() ? '' : ' · offline'}</div></div><button class="rf-tbtn x" data-act="close" title="close">×</button></div>
      <div class="rf-tabs">${(['works', 'titles'] as const).map((t) => `<button class="rf-tab${t === tab ? ' on' : ''}" data-tab="${t}">${t === 'works' ? 'Works' : 'Titles'}</button>`).join('')}</div>
      ${tab === 'works' ? worksHtml(works, online(), form, home()) : titlesHtml(titles, stats, s.sim.playerId ?? null)}<div class="mk-msg rf-dim" style="min-height:15px${bad ? ';color:var(--rf-bad)' : ''}">${esc(msg)}</div>`;
    win.scrollTop = scroll;
    fitHeight(win);
  };
  const load = async () => {
    if (!online()) return render();
    const [w, t] = await Promise.all([s.sim.api<{ works: WorkView[] }>('GET', 'works'), s.sim.api<{ titles: TitleRow[]; mine: PeaceStats }>('GET', 'titles')]);
    if (w?.works?.length) works = w.works;
    if (t?.titles) (titles = t.titles), (stats = t.mine), strip();
    render();
  };
  // the roster's titles strip: an emblem and holder per title (yours glows)
  const strip = () => setTitlesLine(titlesStrip(titles, s.sim.playerId ?? null));
  const pollTitles = async () => {
    if (!online()) return;
    const t = await s.sim.api<{ titles: TitleRow[]; mine: PeaceStats }>('GET', 'titles');
    if (t?.titles) (titles = t.titles), (stats = t.mine), strip();
  };
  setTimeout(() => void pollTitles(), 3000);
  setInterval(() => void pollTitles(), 300_000);
  const toggle = (on = win.style.display === 'none') => {
    win.style.display = on ? '' : 'none';
    document.getElementById('rfWorksBtn')?.classList.toggle('on', on);
    if (on) void load();
  };
  win.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement;
    if (el.dataset.f === 'n') form.n = Math.max(1, Math.floor(Number(el.value)) || 1);
  });
  win.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-tab]');
    if (!t || (t as HTMLButtonElement).disabled) return;
    if (t.dataset.tab) return ((tab = t.dataset.tab as typeof tab), (msg = ''), render());
    const a = t.dataset.act;
    if (a === 'close') return toggle(false);
    if (a === 'pick') {
      const w = works.find((x) => x.id === t.dataset.w);
      if (w) (form.work = w.id), (form.res = Object.keys(w.need).find((r) => (w.goods[r] ?? 0) < w.need[r]) ?? Object.keys(w.need)[0]);
    } else if (a === 'res') form.res = t.dataset.r!;
    else if (a === 'step') form.n = Math.max(1, form.n + Number(t.dataset.d));
    else if (a === 'max') form.n = Number(t.dataset.n);
    else if (a === 'give')
      return void s.sim.api<{ given?: Record<string, number>; error?: string; message?: string }>('POST', `works/${form.work}/give`, { goods: { [form.res]: form.n } }).then((r) => {
        bad = !r || !!r.error;
        msg = !r ? 'no answer' : r.error ? (r.message ?? r.error) : `gave ${Object.entries(r.given ?? {}).map(([g, n]) => `${fmt(n)} ${g}`).join(', ')}`;
        void load();
      });
    render();
  });
  const corner = document.getElementById('rfDev');
  const b = document.createElement('button');
  b.className = 'rf-tbtn';
  b.id = 'rfWorksBtn';
  b.textContent = 'Works';
  b.title = 'alliance works and the season\'s titles';
  b.onclick = () => toggle();
  corner?.insertBefore(b, corner.children[1] ?? null);
  // dev: fill the panels offline (screenshots, layout checks)
  if (import.meta.env.DEV) (window as unknown as { __peace: unknown }).__peace = {
    titles: (t: TitleRow[], m: PeaceStats | null) => ((titles = t), (stats = m), strip(), render()),
    works: (w: WorkView[]) => ((works = w), render()),
    tab: (x: typeof tab) => ((tab = x), render()),
  };
}
