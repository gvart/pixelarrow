/**
 * W-61 peaceful play on the HUD (docs/WAR.md "Peaceful play"), in the red-figure kit. Icon-led and read in two seconds;
 * the words live in tooltips:
 *
 *   top centre   the town badge: your team's town here (Snapshot.townLevels), a gold ring filling towards the next level
 *                round the level numeral, and its name; click for the town card (after Anno 1800's needs and Civ VI's city
 *                panel): the next level's needs as an icon checklist with fill bars, the perks every man of yours inside
 *                enjoys as icon chips, and the next level's perks as a greyed row
 *                W-63: over a settlement (./settlements.ts) the badge and card are the settlement's (./settleCards.ts)
 *   top right    Works (the corner button), two tabs: Works, a project card per alliance work (after Rise of Kingdoms'
 *                alliance buildings): its art, one big progress bar, the goods and labour as have/need chips, the top
 *                three givers and the bonus it grants as a reward chip (E7: the alliance's wonder heads the tab, its stage
 *                track with each stage's perk and its top five givers); pick a card to contribute goods from your home
 *                strongroom. Titles, the season's standings: each title's emblem, holder and lead, and your own run at it.
 *                The roster strip shows the titles as emblems (./titles.ts).
 * Online the panels read /api/war/works and /api/war/titles; offline they show the works' needs only.
 */
import type { WorkView } from '../../net/works';
import type { TownLevelSnap } from '../../types';
import type { SandboxScene } from '../SandboxScene';
import { myTeam } from '../side';
import { settleHosts } from './settlements';
import { keys } from '../../input/keys';
import { draggable } from './drag';
import { closeCornerWindows, CORNER_BOTTOM, fitHeight, icon, LEFT_PANELS, menuBtn } from './kit';
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
.wk-art{width:48px;height:48px;flex:none;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 70%,#2b2f37,#0d0f12);border:1px solid var(--rf-line);box-shadow:inset 0 0 0 1px #050506;overflow:hidden}
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
.wk-av{position:relative;width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font:700 12px/1 Cinzel,serif;color:var(--rf-ink);background:radial-gradient(circle at 50% 35%,#2b2f37,#0d0f12);box-shadow:inset 0 0 0 2px var(--c),0 0 0 1px #050506}
.wk-av i{position:absolute;right:-4px;bottom:-3px;font:700 8.5px/11px Inter,sans-serif;font-style:normal;width:11px;height:11px;border-radius:50%;text-align:center;color:#050506;background:var(--c)}
.wk-give{display:flex;align-items:center;gap:5px;margin-top:6px;padding-top:6px;border-top:1px solid var(--rf-rule)}
.wk-give .rf-step .rf-tbtn{width:23px;padding:0}.wk-give input{width:46px}
.wk-go{margin-left:auto}
.wd-card{padding:7px 7px 8px;border-color:#6a5326;background:linear-gradient(180deg,#1f1610,var(--rf-sunk) 60%)}
.wd-art{width:76px;height:76px;flex:none;display:flex;align-items:flex-end;justify-content:center;background:radial-gradient(circle at 50% 75%,#4a3018,#0d0f12);border:1px solid #6a5326;box-shadow:inset 0 0 0 1px #050506;overflow:hidden}
.wd-art img{max-width:72px;max-height:74px;object-fit:contain}
.wd-tier{font:700 10px/1 Cinzel,serif;letter-spacing:.12em;text-transform:uppercase;color:var(--rf-gold);margin-bottom:3px}
.wd-name{font-size:16px}
.wd-stage{margin-top:4px;font-size:11.5px;color:var(--rf-muted)}.wd-stage b{color:var(--rf-ink)}
.wd-track{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;margin:8px 0 2px}
.wd-st{padding:4px 4px 5px;border:1px solid var(--rf-rule);background:var(--rf-sunk)}
.wd-st.cur{border-color:var(--rf-accent)}.wd-st.done{border-color:#3f5a2c;background:#121a0c}
.wd-st .rf-bar{margin:4px 0}
.wd-sn{display:flex;align-items:center;gap:4px;font:700 11px/1.1 Cinzel,serif;color:var(--rf-title);white-space:nowrap;overflow:hidden}
.wd-k{width:14px;height:14px;flex:none;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;font:700 9px/1 Inter,sans-serif;color:var(--rf-ink);background:var(--rf-raised);border:1px solid var(--rf-line)}
.done .wd-k{background:#1d2a14;border-color:#3f5a2c}
.wd-pk{display:flex;flex-wrap:wrap;gap:2px}.wd-pk .rf-ichip{height:20px;font-size:11px}
.wd-givers{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3px 10px}
.wd-giver{display:flex;align-items:center;gap:6px;min-width:0;font-size:11px}.wd-gn{flex:1;min-width:0;color:var(--rf-ink);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wd-giver .rf-dim{white-space:nowrap}
.wd-hint{flex:1;font-size:11px}
.ti-row{display:flex;align-items:center;gap:8px;padding:5px 4px;border-bottom:1px solid #1a1c20}
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
  tcard.className = 'rf rf-card rf-esc';
  tipper(badge, tip);
  tipper(tcard, tip);
  let open = false, key = '';
  const mine = (): TownLevelSnap | null => s.sim.cur?.townLevels?.find((t) => t.team === myTeam()) ?? null;
  badge.onclick = () => ((open = !open), (key = ''), draw());
  const draw = () => {
    // W-63: over a settlement the badge and card are the settlement's (./settlements.ts)
    const host = settleHosts.get(s), st = host?.here() ?? null;
    if (host && st) {
      const k = `s${host.key()}${open}`;
      if (k === key) return;
      key = k;
      badge.style.display = '';
      badge.classList.toggle('on', open);
      badge.innerHTML = host.badge();
      tcard.style.display = open ? '' : 'none';
      tcard.style.width = '336px';
      if (open) {
        // fits the window (the terms form makes it long): scrolls inside, keeps its place, the form's send in view
        const top = tcard.scrollTop, had = !!tcard.querySelector('[data-sa="send-terms"]');
        tcard.innerHTML = host.card();
        fitHeight(tcard);
        tcard.scrollTop = top;
        if (!had) tcard.querySelector('[data-sa="send-terms"]')?.scrollIntoView({ block: 'nearest' });
      }
      return;
    }
    tcard.style.width = '316px';
    const t = mine(), k = JSON.stringify(t) + open;
    if (k === key) return;
    key = k;
    badge.style.display = t ? '' : 'none';
    badge.classList.toggle('on', open);
    if (t) badge.innerHTML = townBadge(t);
    tcard.style.display = open && t ? '' : 'none';
    if (open) (tcard.innerHTML = townCard(t)), fitHeight(tcard);
  };
  setInterval(draw, 500);
  addEventListener('keydown', (e: KeyboardEvent) => { if (keys.act(e) === 'back' && open) ((open = false), (key = ''), draw()); });
  tcard.addEventListener('click', (e) => { settleHosts.get(s)?.click(e); key = ''; draw(); });
  tcard.addEventListener('input', (e) => settleHosts.get(s)?.input(e));
  tcard.addEventListener('change', () => ((key = ''), draw()));
  // the badge and card sit top centre unless a left panel (forge, market, roster, maybe dragged) reaches under them:
  // then they step right of it (5 Hz; CSS px from the rects, art px for left)
  /** The right edge of the left panels under `r`'s band, or `x` when none reaches past it. */
  const clearOf = (r: DOMRect, x: number, gap: number) => {
    for (const id of LEFT_PANELS) {
      const p = document.getElementById(id);
      if (!p || p.style.display === 'none') continue;
      const q = p.getBoundingClientRect();
      if (q.width && q.top < r.bottom && r.top < q.bottom && q.left + q.width / 2 < innerWidth / 2) x = Math.max(x, q.right + gap);
    }
    return x;
  };
  const place = (el: HTMLElement) => {
    if (el.style.display === 'none') return;
    const r = el.getBoundingClientRect(), z = Number(el.style.zoom) || 1;
    el.style.left = `${Math.round(clearOf(r, (innerWidth - r.width) / 2, 6 * z) / z)}px`;
    el.style.transform = 'none';
  };
  // their tooltip: placeTip may put it left of the badge, over a left panel; then it goes right of its own panel
  let tipOf: HTMLElement | null = null;
  const placeTipClear = () => {
    if (tip.style.display === 'none') tipOf = null;
    if (!tipOf || tipOf.style.display === 'none') return;
    const t = tip.getBoundingClientRect(), z = Number(tip.style.zoom) || 1;
    if (clearOf(t, t.left, 0) === t.left) return;
    const x = Math.min(innerWidth - t.width - 4, tipOf.getBoundingClientRect().right + 6 * z);
    tip.style.left = `${x / z}px`;
  };
  for (const el of [badge, tcard]) el.addEventListener('pointerover', () => ((tipOf = el), placeTipClear()));
  setInterval(() => (place(badge), place(tcard), placeTipClear()), 200);

  // ---------- the works window: works and titles ----------
  const win = mk('rfWorks', 'top:40px;right:4px;width:380px;display:none;pointer-events:auto;padding:4px 8px 8px');
  win.className = 'rf rf-card rf-esc';
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
    const plain = works.filter((w) => !w.stages), raised = plain.filter((w) => w.done).length;
    win.innerHTML = `<div class="rf-head rf-ph">${icon('node-engineer-master-builder', 32)}<div style="flex:1;min-width:0"><div class="rf-name">Alliance works</div><div class="sub">${raised} of ${plain.length} raised this season${online() ? '' : ' · offline'}</div></div><button class="rf-tbtn x" data-act="close" title="close (Esc)">×</button></div>
      <div class="rf-tabs">${(['works', 'titles'] as const).map((t) => `<button class="rf-tab${t === tab ? ' on' : ''}" data-tab="${t}">${t === 'works' ? 'Works' : 'Titles'}</button>`).join('')}</div>
      ${tab === 'works' ? worksHtml(works, online(), form, home()) : titlesHtml(titles, stats, s.sim.playerId ?? null)}<div class="mk-msg rf-dim" style="min-height:15px${bad ? ';color:var(--rf-bad)' : ''}">${esc(msg)}</div>`;
    win.scrollTop = scroll;
    fitHeight(win, CORNER_BOTTOM);
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
    b.classList.toggle('on', on);
    if (on) { closeCornerWindows(b.id); void load(); }
  };
  addEventListener('keydown', (e: KeyboardEvent) => { if (keys.act(e) === 'back' && win.style.display !== 'none') toggle(false); });
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
  const b = menuBtn('rfWorksBtn', 'node-engineer-master-builder', 'Alliance works', 'works and the season\'s titles', 'panel.works', 3);
  b.onclick = () => toggle();
  // dev: fill the panels offline (screenshots, layout checks)
  if (import.meta.env.DEV) (window as unknown as { __peace: unknown }).__peace = {
    titles: (t: TitleRow[], m: PeaceStats | null) => ((titles = t), (stats = m), strip(), render()),
    works: (w: WorkView[]) => ((works = w), render()),
    tab: (x: typeof tab) => ((tab = x), render()),
  };
}
