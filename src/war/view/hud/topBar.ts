/**
 * The top bar (the Dota 2 hybrid HUD; its look: ./theme.ts #rfTop): one slim glass strip with a gold trim.
 *
 *   left     the goods at hand (W-60: the store his men stand by, never a total; ./chest.ts stockAtHand) and his men in
 *            the region; a click opens the squad chest (I)
 *   centre   a plaque: the region's name; online the season, its day and the time left (GET /api/war/world each
 *            minute), offline the sandbox's clock
 *   right    divine favour (level, title and the way to the next level; a click opens its window, ./favour.ts), the
 *            menu buttons (World, Replay, Holdings, Works, Crown, Tasks: ./kit.ts menuBtn fills the slot), Settings
 * Panels anchored at the top sit below it (./theme.ts, --hud-top).
 */
import type { SandboxScene } from '../SandboxScene';
import type { WorldSnapshot } from '../../net/world';
import { keys } from '../../input/keys';
import { myTeam } from '../side';
import { stockAtHand } from './chest';
import { favourNow } from './favour';
import { goodIcon, goodName } from './goods';
import { icon, MENU_BAR } from './kit';
import { esc } from './roster/ui';
import { tipHtml } from './theme';

type TipOn = (el: HTMLElement, html: () => string) => void;

/** The goods the bar shows, in order. */
const GOODS = ['food', 'wood', 'stone', 'iron', 'coin'] as const;
const DAY_MS = 86_400_000;

/** "4d 06h", "5h 12m", "12m". */
const left = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60_000)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  return d ? `${d}d ${String(h).padStart(2, '0')}h` : h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m % 60}m`;
};
/** Sim ticks (10 a second) as "12:34" or "1:02:03". */
const clock = (ticks: number) => {
  const t = Math.floor(ticks / 10), h = Math.floor(t / 3600), mm = String(Math.floor((t % 3600) / 60)).padStart(h ? 2 : 1, '0'), ss = String(t % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};
const fmt = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(Math.floor(n)));

const GEAR = '<svg class="ic" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path fill="#e2bd68" stroke="#030304" stroke-width=".8" d="M8.6 1.5h2.8l.4 2.3 1.5.7 2-1.3 2 2-1.3 2 .6 1.5 2.4.4v2.8l-2.4.4-.6 1.5 1.3 2-2 2-2-1.3-1.5.6-.4 2.4H8.6l-.4-2.4-1.5-.6-2 1.3-2-2 1.3-2-.6-1.5-2.4-.4V8.6l2.4-.4.6-1.5-1.3-2 2-2 2 1.3 1.5-.7z"/><circle cx="10" cy="10" r="2.9" fill="#16181c" stroke="#030304" stroke-width=".8"/></svg>';

/** Mount the bar; its menu slot (id MENU_BAR) takes the menu buttons. */
export function mountTopBar(s: SandboxScene, tipOn: TipOn): { el: HTMLElement; refresh(): void } {
  const el = document.createElement('div');
  el.className = 'rf';
  el.id = 'rfTop';
  el.innerHTML = `<div class="tb-l"></div>
    <div class="tb-plaque"><div class="tb-region">${esc(s.region.name)}</div><div class="tb-sub"></div></div>
    <div class="tb-r"><button class="tb-fav" id="rfTopFavour"><span class="n"></span><span style="display:flex;flex-direction:column;gap:2px"><span class="t"></span><span class="bar"><i></i></span></span></button>
      <span class="tb-rule"></span><div id="${MENU_BAR}"></div><span class="tb-rule"></span>
      <button class="rf-btn tb-gear" id="rfTopSettings">${GEAR}</button></div>`;
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  document.body.appendChild(el);
  const $ = <T extends HTMLElement>(q: string) => el.querySelector<T>(q)!;
  const res = $('.tb-l'), sub = $('.tb-sub'), fav = $<HTMLButtonElement>('.tb-fav');

  // ---------- goods at hand and his men ----------
  const chip = (id: string, ic: string) => {
    const c = document.createElement('div');
    c.className = 'tb-res';
    c.dataset.res = id;
    c.style.cursor = 'pointer';
    c.innerHTML = `${icon(ic)}<b>0</b>`;
    c.onclick = () => document.getElementById('rfChestBtn')?.click();
    res.appendChild(c);
    return c;
  };
  let stock: Record<string, number> = {}, men = 0;
  const chips = GOODS.map((r) => {
    const c = chip(r, goodIcon(r));
    tipOn(c, () => tipHtml(goodName(r), Object.keys(stock).length ? `${Math.floor(stock[r] ?? 0)} in the store by your men. Click: the squad chest.` : 'No store of yours by your men: bring them to one to use its goods.', keys.label('panel.chest')));
    return c;
  });
  const menChip = chip('men', 'unit-hoplite');
  menChip.classList.add('men');
  tipOn(menChip, () => tipHtml('Your men here', `${men} of your men stand in this region. Click: the squad chest.`, keys.label('panel.chest')));

  // ---------- the season (online) or the sandbox clock ----------
  let season: { n: number; start: number; end: number; over: boolean } | null = null;
  const loadSeason = async () => {
    if (!s.sim.net) return;
    const w = await s.sim.api<WorldSnapshot>('GET', 'world');
    if (w?.score) season = { n: w.season, start: w.score.startAt, end: w.score.endAt, over: !!w.score.ended };
  };
  void loadSeason();
  setInterval(() => void loadSeason(), 60_000);
  tipOn($('.tb-plaque'), () => tipHtml(esc(s.region.name), season ? `Season ${season.n}: day ${Math.floor((Date.now() - season.start) / DAY_MS) + 1}, ${season.over ? 'over' : `ends in ${left(season.end - Date.now())}`}.` : 'Offline: the sandbox clock counts the time since you came in.'));

  // ---------- favour and settings ----------
  fav.onclick = () => document.getElementById('rfFavourBtn')?.click();
  tipOn(fav, () => {
    const v = favourNow();
    return tipHtml(`Divine favour · level ${v.level}`, `${esc(v.title)}: it makes the men you raise better. ${v.next === null ? 'The highest level.' : `${v.xp} / ${v.next} favour to level ${v.level + 1}.`}`, keys.label('panel.favour'));
  });
  const gear = $<HTMLButtonElement>('.tb-gear');
  // the settings open on their key (the game menu's handler, ../../menu/gameMenu.ts, with the page's hooks)
  gear.onclick = () => {
    const b = keys.map['menu.settings']?.[0];
    if (b) dispatchEvent(new KeyboardEvent('keydown', { code: b.code, ctrlKey: !!b.mod, metaKey: !!b.mod, altKey: !!b.alt, shiftKey: !!b.shift, bubbles: true }));
  };
  tipOn(gear, () => tipHtml('Settings', 'controls, display, sound; Esc opens the menu', keys.label('menu.settings')));

  let favKey = '';
  const refresh = () => {
    const cur = s.sim.cur;
    stock = stockAtHand(s);
    const any = Object.keys(stock).length > 0;
    chips.forEach((c, i) => {
      const n = stock[GOODS[i]] ?? 0, t = any ? fmt(n) : '–';
      const b = c.querySelector('b')!;
      if (b.textContent !== t) b.textContent = t;
      c.classList.toggle('none', !any);
    });
    men = cur ? cur.units.filter((u) => u.state !== 'dead' && cur.squads.some((q) => q.id === u.squad && q.team === myTeam() && !q.civ)).length : 0;
    menChip.querySelector('b')!.textContent = String(men);
    const line = season
      ? `Season ${season.n} · Day <b>${Math.floor((Date.now() - season.start) / DAY_MS) + 1}</b> · ${season.over ? 'over' : `<b>${left(season.end - Date.now())}</b> left`}`
      : `Offline · <b>${clock(cur?.tick ?? 0)}</b>`;
    if (sub.innerHTML !== line) sub.innerHTML = line;
    const v = favourNow(), span = v.next === null ? 1 : v.next - v.from, f = v.next === null ? 1 : Math.max(0, Math.min(1, (v.xp - v.from) / span));
    const k = `${v.level}|${v.title}|${f.toFixed(2)}`;
    if (k !== favKey) {
      favKey = k;
      fav.querySelector('.n')!.textContent = `${v.level}`;
      fav.querySelector('.t')!.textContent = v.title;
      fav.querySelector<HTMLElement>('.bar i')!.style.width = `${(f * 100).toFixed(1)}%`;
    }
    fav.classList.toggle('on', !!document.getElementById('rfFavourBtn')?.classList.contains('on'));
  };
  return { el, refresh };
}
