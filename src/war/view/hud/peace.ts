/**
 * W-61 peaceful play on the HUD (docs/WAR.md "Peaceful play"), in the red-figure kit:
 *
 *   top centre   the town level badge: your team's town here (Snapshot.townLevels), its name and five pips; click for
 *                the town card: what it measured (kinds of building, stone share, walls closed), the perks every man
 *                of yours inside enjoys, and what the next level needs
 *   top right    Works (the corner button): your alliance's works (temple, road and bridge, beacon line) with goods and
 *                labour against their needs, who gave what, and a form to give goods from your home strongroom; the
 *                season's titles (Merchant Prince, Master Builder, Warden, Warlord) and your own peace stats under it
 * Online the panels read /api/war/works and /api/war/titles; offline they show the works' needs only.
 */
import { GOODS } from '../../net/protocol';
import { WORKS, type WorkView } from '../../net/works';
import { TOWN_LEVELS, TOWN_MAX, TOWN_PERKS } from '../../sim/townLevel';
import type { TownLevelSnap } from '../../types';
import type { SandboxScene } from '../SandboxScene';
import { myTeam } from '../side';
import { draggable } from './drag';
import { bar, fitHeight, icon } from './kit';
import { esc } from './roster/ui';
import { setTitlesLine } from './roster/panel';

type Mk = (id: string, css: string, html?: string) => HTMLElement;

export interface TitleRow { id: string; name: string; pid: number; player: string; alliance: number; home: string | null; value: number }
export interface PeaceStats { sold: number; contracts: number; labourHours: number; guardHours: number }
const TITLE_OF: Record<string, string> = { merchantPrince: 'coin sold', masterBuilder: 'man-hours', warden: 'hours held', warlord: 'foes down' };
const ICONED = new Set(['food', 'wood', 'stone', 'marble', 'pitch', 'coin', 'iron', 'bronze', 'silver', 'salt', 'hides', 'charcoal']);
const gi = (r: string) => (ICONED.has(r) ? icon('res-' + r) : `<span class="rf-dim">${r}</span>`);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const fmt = (n: number) => (n >= 100 ? String(Math.round(n)) : String(Math.round(n * 10) / 10));

/** The perks of a town level as lines (cumulative). */
export function perkLines(level: number): string[] {
  const p = TOWN_PERKS[Math.max(0, Math.min(TOWN_MAX, level))], out: string[] = [];
  if (p.store) out.push(`chests hold ${p.store} more loads`);
  if (p.hunger < 1) out.push(`food keeps: hunger ${pct(1 - p.hunger)} slower`);
  if (p.souls > 1) out.push(`souls wake ${pct(p.souls - 1)} more often nearby`);
  if (p.repair > 1) out.push(`repairs ${pct(p.repair - 1)} faster`);
  return out;
}

/** The pips of a level: five, the reached ones lit. */
const pips = (lv: number) => `<span style="display:inline-flex;gap:2px;margin-left:4px">${[1, 2, 3, 4, 5].map((k) => `<i style="display:inline-block;width:7px;height:7px;transform:rotate(45deg);border:1px solid var(--rf-line);background:${k <= lv ? 'var(--rf-gold)' : 'var(--rf-sunk)'}"></i>`).join('')}</span>`;

/** The town card (also the badge's tooltip). */
export function townCard(t: TownLevelSnap | null): string {
  if (!t || t.level < 1) return `<div class="rf-cap">No town here</div><div class="rf-dim">Build a camp or a store: your town starts round it.</div>`;
  const need = TOWN_LEVELS[Math.min(TOWN_MAX, t.level + 1)];
  const row = (k: string, v: string, ok: boolean | null = null) => `<div class="mk-row" style="display:flex;gap:6px;min-height:18px"><span class="rf-dim" style="flex:1">${k}</span><span class="rf-num" style="${ok === false ? 'color:var(--rf-bad)' : ok ? 'color:var(--rf-good)' : ''}">${v}</span></div>`;
  const perks = perkLines(t.level);
  const next = t.level < TOWN_MAX ? perkLines(t.level + 1).filter((l) => !perks.includes(l)) : [];
  return `<div style="display:flex;align-items:center;gap:6px">${icon('bld-camp', 32)}<div style="flex:1"><div class="rf-name">${esc(t.name)}${pips(t.level)}</div><div class="rf-dim">level ${t.level} of ${TOWN_MAX} · ${t.r * 2} m round</div></div></div>
    <div class="rf-cap" style="margin-top:6px">Built</div>
    ${row('kinds of building', `${t.variety}${t.level < TOWN_MAX && need.variety ? ` / ${need.variety}` : ''}`, t.level < TOWN_MAX && need.variety ? t.variety >= need.variety : null)}
    <div style="display:flex;align-items:center;gap:6px"><span class="rf-dim" style="flex:1">stone</span>${bar('ok', t.stone, 80)}<span class="rf-num" style="width:34px;text-align:right">${pct(t.stone)}</span></div>
    ${row('walls closed', t.closed ? 'yes' : 'no', t.level < TOWN_MAX && need.closed ? t.closed : null)}
    ${row('all walls stone', t.stoneWalls ? 'yes' : 'no', t.level < TOWN_MAX && need.stoneWalls ? t.stoneWalls : null)}
    <div class="rf-cap" style="margin-top:6px">Perks for every man of yours inside</div>
    ${perks.length ? perks.map((l) => `<div style="color:var(--rf-good)">+ ${l}</div>`).join('') : '<div class="rf-dim">none yet: a Hamlet gives the first</div>'}
    ${t.next.length ? `<div class="rf-cap" style="margin-top:6px">${esc(TOWN_LEVELS[t.level + 1].name)} needs</div>${t.next.map((l) => `<div>• ${esc(l)}</div>`).join('')}${next.length ? `<div class="rf-dim" style="margin-top:2px">then: ${next.join('; ')}</div>` : ''}` : '<div class="rf-dim" style="margin-top:6px">the highest level</div>'}`;
}

/** The offline view of the works: needs only. */
const offlineWorks = (): WorkView[] => WORKS.map((w) => ({ id: w.id, name: w.name, text: w.text, region: 'home', x: 0, y: 0, goods: {}, need: w.goods, labour: 0, needLabour: w.labour, done: false, by: [] }));

/** The works panel's body: each work's progress, contributors and the give form. */
export function worksHtml(list: WorkView[], online: boolean, form: { work: string; res: string; n: number }): string {
  const one = (w: WorkView) => {
    const goods = Object.entries(w.need).map(([r, n]) => `<div style="display:flex;align-items:center;gap:4px">${gi(r)}${bar(w.done || (w.goods[r] ?? 0) >= n ? 'ok' : 'construction', (w.goods[r] ?? 0) / n, 90)}<span class="rf-num" style="width:70px;text-align:right">${fmt(w.goods[r] ?? 0)} / ${n}</span></div>`).join('');
    const by = w.by.slice(0, 5).map((b) => `<span class="mk-pill" title="${b.goods} goods, ${b.labour} man-hours">${esc(b.name)} ${b.goods ? `${b.goods}g` : ''}${b.labour ? ` ${b.labour}h` : ''}</span>`).join(' ');
    return `<div class="rf-row" style="padding:4px 2px;border-bottom:1px solid var(--rf-rule)">
      <div style="display:flex;align-items:center;gap:6px">${icon(w.id === 'road' ? 'bld-bridge-stone' : w.id === 'beacons' ? 'bld-tower-stone' : 'bld-stone-wall')}<b style="flex:1">${esc(w.name)}</b>${w.done ? '<span style="color:var(--rf-good)">stands</span>' : `<span class="rf-dim">${esc(w.region)} ${w.x ? `(${Math.round(w.x)}, ${Math.round(w.y)})` : ''}</span>`}</div>
      <div class="rf-dim" style="margin:1px 0 3px 30px">${esc(w.text)} for the whole alliance</div>
      <div style="margin-left:30px">${goods}<div style="display:flex;align-items:center;gap:4px"><span class="rf-dim" style="width:24px">men</span>${bar(w.done ? 'ok' : 'construction', w.labour / w.needLabour, 90)}<span class="rf-num" style="width:70px;text-align:right">${fmt(w.labour)} / ${w.needLabour} h</span></div>
      ${by ? `<div style="margin-top:3px;display:flex;flex-wrap:wrap;gap:3px">${by}</div>` : '<div class="rf-dim" style="margin-top:2px">nobody has given yet</div>'}</div></div>`;
  };
  const open = list.filter((w) => !w.done);
  const goods = GOODS.filter((g) => list.some((w) => w.id === form.work && w.need[g]));
  return `${list.map(one).join('')}
    ${open.length ? `<div class="rf-cap" style="margin-top:6px">Give from your home strongroom</div>
    <div class="mk-form"><select data-f="work">${open.map((w) => `<option value="${w.id}"${w.id === form.work ? ' selected' : ''}>${esc(w.name)}</option>`).join('')}</select><select data-f="res">${goods.map((g) => `<option${g === form.res ? ' selected' : ''}>${g}</option>`).join('')}</select><input type="number" data-f="n" value="${form.n}" min="1" style="width:56px"><button class="rf-tbtn mk-b pri" data-act="give"${online ? '' : ' disabled title="online only"'}>Give</button></div>
    <div class="rf-dim">Labour: send men of your alliance to stand at the site; every man there works it.</div>` : ''}`;
}

/** Titles and the player's own stats. */
export function titlesHtml(t: TitleRow[], mine: PeaceStats | null, me: number | null): string {
  return `<div class="rf-cap" style="margin-top:8px">Titles this season</div>
    ${t.length ? t.map((x) => `<div class="mk-row" style="display:flex;gap:6px;min-height:20px${x.pid === me ? ';color:var(--rf-gold)' : ''}"><b style="width:118px">${esc(x.name)}</b><span style="flex:1">${esc(x.player)}</span><span class="rf-num">${fmt(x.value)}</span><span class="rf-dim" style="width:64px">${TITLE_OF[x.id] ?? ''}</span></div>`).join('') : '<div class="rf-dim">none claimed yet</div>'}
    ${mine ? `<div class="rf-dim" style="margin-top:3px">You: ${fmt(mine.sold)} coin sold · ${mine.contracts} contracts · ${fmt(mine.labourHours)} man-hours · ${fmt(mine.guardHours)} h held</div>` : ''}`;
}

const CSS = `
#rfWorks select{font:600 12px/1 Inter,sans-serif;height:23px;background:var(--rf-sunk);color:var(--rf-ink);border:1px solid var(--rf-line);padding:0 2px}
#rfWorks input[type=number]{height:21px}
#rfWorks .mk-form{display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:4px;margin:4px 0;background:var(--rf-sunk);border:1px solid var(--rf-rule)}
#rfWorks .mk-b{height:20px;padding:0 6px;font-size:11px}
#rfWorks .mk-pill{font:700 10.5px/14px Inter,sans-serif;padding:0 4px;border:1px solid var(--rf-line);background:var(--rf-sunk);white-space:nowrap}
#rfTownCard .rf-cap,#rfWorks .rf-cap{font:700 11px/1.4 Cinzel,serif;color:var(--rf-accent)}
`;

export function mountPeace(s: SandboxScene, mk: Mk): void {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  // ---------- the town badge and card ----------
  const badge = mk('rfTown', 'top:4px;left:50%;transform:translateX(-50%);pointer-events:auto;padding:2px 8px;cursor:pointer;display:none');
  badge.className = 'rf rf-card';
  const tcard = mk('rfTownCard', 'top:34px;left:50%;transform:translateX(-50%);width:260px;pointer-events:auto;padding:6px 8px;display:none');
  tcard.className = 'rf rf-card';
  let open = false, key = '';
  const mine = (): TownLevelSnap | null => s.sim.cur?.townLevels?.find((t) => t.team === myTeam()) ?? null;
  badge.onclick = () => ((open = !open), (key = ''), draw());
  const draw = () => {
    const t = mine(), k = JSON.stringify(t) + open;
    if (k === key) return;
    key = k;
    badge.style.display = t ? '' : 'none';
    if (t) badge.innerHTML = `<span style="display:inline-flex;align-items:center;gap:4px" title="your town here: click for its card">${icon('bld-camp')}<b>${esc(t.name)}</b>${pips(t.level)}</span>`;
    tcard.style.display = open && t ? '' : 'none';
    if (open) tcard.innerHTML = townCard(t);
  };
  setInterval(draw, 500);

  // ---------- the works panel and titles ----------
  const win = mk('rfWorks', 'top:40px;right:110px;width:380px;display:none;pointer-events:auto;padding:4px 8px 8px');
  win.className = 'rf rf-card';
  draggable(win, '.rf-head');
  const form = { work: 'temple', res: 'stone', n: 50 };
  let works: WorkView[] = offlineWorks(), titles: TitleRow[] = [], stats: PeaceStats | null = null, msg = '', bad = false;
  const online = () => !!s.sim.net;
  const render = () => {
    if (win.style.display === 'none') return;
    win.innerHTML = `<div class="rf-head rf-ph">${icon('node-engineer-master-builder', 32)}<div style="flex:1"><div class="rf-name">Alliance works</div><div class="sub">big shared projects: every member's goods and men count${online() ? '' : ' · offline'}</div></div><button class="rf-tbtn x" data-act="close" title="close">×</button></div>
      ${worksHtml(works, online(), form)}${titlesHtml(titles, stats, s.sim.playerId ?? null)}<div class="mk-msg rf-dim${bad ? ' bad' : ''}" style="margin-top:4px;min-height:15px${bad ? ';color:var(--rf-bad)' : ''}">${esc(msg)}</div>`;
    fitHeight(win);
  };
  const load = async () => {
    if (!online()) return render();
    const [w, t] = await Promise.all([s.sim.api<{ works: WorkView[] }>('GET', 'works'), s.sim.api<{ titles: TitleRow[]; mine: PeaceStats }>('GET', 'titles')]);
    if (w?.works?.length) works = w.works;
    if (t?.titles) (titles = t.titles), (stats = t.mine), strip();
    render();
  };
  // the roster's titles strip: who holds each title (yours in gold)
  const strip = () => {
    const me = s.sim.playerId ?? null;
    setTitlesLine(titles.length ? `<div style="display:flex;flex-wrap:wrap;gap:3px;margin:4px 2px 0">${titles.map((x) => `<span style="font:700 10.5px/14px Inter,sans-serif;padding:0 4px;border:1px solid var(--rf-line);background:var(--rf-sunk)${x.pid === me ? ';color:var(--rf-gold)' : ''}" data-tip="${esc(`${x.name}: ${x.player}, ${fmt(x.value)} ${TITLE_OF[x.id] ?? ''}`)}">${esc(x.name)} · ${esc(x.player)}</span>`).join('')}</div>` : '');
  };
  const pollTitles = async () => {
    if (!online()) return;
    const t = await s.sim.api<{ titles: TitleRow[]; mine: PeaceStats }>('GET', 'titles');
    if (t?.titles) (titles = t.titles), (stats = t.mine), strip();
  };
  setTimeout(() => void pollTitles(), 3000);
  setInterval(() => void pollTitles(), 300_000);
  const toggle = (on = win.style.display === 'none') => {
    win.style.display = on ? '' : 'none';
    if (on) void load();
  };
  win.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement | HTMLSelectElement, k = el.dataset.f as keyof typeof form | undefined;
    if (!k) return;
    (form as Record<string, unknown>)[k] = el.type === 'number' ? Number(el.value) : el.value;
    if (k === 'work') {
      const w = works.find((x) => x.id === form.work);
      if (w && !w.need[form.res]) form.res = Object.keys(w.need)[0];
      render();
    }
  });
  win.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!t || (t as HTMLButtonElement).disabled) return;
    if (t.dataset.act === 'close') return toggle(false);
    if (t.dataset.act === 'give')
      void s.sim.api<{ given?: Record<string, number>; error?: string; message?: string }>('POST', `works/${form.work}/give`, { goods: { [form.res]: form.n } }).then((r) => {
        bad = !r || !!r.error;
        msg = !r ? 'no answer' : r.error ? (r.message ?? r.error) : `gave ${Object.entries(r.given ?? {}).map(([g, n]) => `${fmt(n)} ${g}`).join(', ')}`;
        void load();
      });
  });
  const corner = document.getElementById('rfDev');
  const b = document.createElement('button');
  b.className = 'rf-tbtn';
  b.id = 'rfWorksBtn';
  b.textContent = 'Works';
  b.title = 'alliance works and the season\'s titles';
  b.onclick = () => toggle();
  corner?.insertBefore(b, corner.children[1] ?? null);
}
