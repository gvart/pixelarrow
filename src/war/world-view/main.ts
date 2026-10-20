/**
 * The strategic world screen (M4c, W-02; world.html). The world map with ownership, fights, trade routes and fog, the
 * player's squads and transfers, the season standings; a region opens in the region sandbox (net mode).
 *
 *   world.html                live world: wrangler dev with DEV_AUTH=1 behind the vite proxy (./source.ts NetSource);
 *                             ?dev=<id> signs in as that dev player, ?alliance=0..3 joins that alliance if he has none
 *   world.html?offline=1      a mock world in memory (MockSource)
 *
 * Mouse: drag pans, wheel zooms, hover shows a region's card, click selects (a region with your men selects your
 * squad there: its neighbours light up; click one to order the transfer), double click enters a region.
 * Keys: Enter enters the hovered / selected region (or sends the transfer being ordered), Esc clears, T trade routes,
 * F fits the map. `window.__world` is the screen's state for scripts.
 */
import '@fontsource/inter/600.css';
import '@fontsource/cinzel/700.css';
import type { RegionState } from '../net/world';
import { ALLIANCES } from '../world/alliances';
import { worldRegion } from '../world/graph';
import { bar, CSS, uiZoom } from '../view/hud/kit';
import { draggable } from '../view/hud/drag';
import { inSight, isChokepoint, MARKET_TOWNS, PURPOSE, seasonStandings } from './geo';
import { allianceColor, ART, clock, WorldMap, type MapState } from './map';
import { MockSource, NetSource, travelMs, type WorldSource, type WorldView } from './source';

const q = new URLSearchParams(location.search);
const offline = q.has('offline');
const source: WorldSource = offline ? new MockSource() : new NetSource(q);

const style = document.createElement('style');
style.textContent = CSS + `
#wvBand{white-space:nowrap;top:0;left:50%;transform:translateX(-50%);height:40px;display:flex;align-items:center;gap:8px;padding:0 10px;pointer-events:auto}
.wv-panel{width:220px;padding:6px 8px 8px;pointer-events:auto}
.wv-row{display:flex;align-items:center;gap:6px;padding:3px 4px;border-radius:2px}
.wv-sw{width:10px;height:10px;flex:none;border:1px solid #0e0907}
.wv-flag{display:inline-block;padding:0 4px;margin:2px 3px 0 0;border:1px solid var(--rf-line);color:var(--rf-gold);font-size:11px;line-height:15px}
.wv-flag.bad{color:var(--rf-bad)}
.wv-kv{display:grid;grid-template-columns:62px 1fr;gap:1px 6px;margin-top:4px}
.wv-kv>:nth-child(odd){color:var(--rf-muted)}
#wvToast{left:50%;bottom:16px;transform:translateX(-50%);display:none;pointer-events:none}
`;
document.head.appendChild(style);

const canvas = document.getElementById('map') as HTMLCanvasElement;
const els: HTMLElement[] = [];
const mk = (id: string, cls: string, css: string, html = '') => {
  const el = document.createElement('div');
  el.id = id;
  el.className = `rf ${cls}`;
  el.style.cssText = css;
  el.innerHTML = html;
  document.body.appendChild(el);
  els.push(el);
  return el;
};
const band = mk('wvBand', 'rf-band', '');
const squadsEl = mk('wvSquads', 'rf-card wv-panel', 'left:8px;top:48px');
const seasonEl = mk('wvSeason', 'rf-card wv-panel', 'right:8px;top:48px');
const card = mk('wvCard', 'rf-card wv-panel', 'display:none;pointer-events:none;z-index:6;width:250px');
const order = mk('wvOrder', 'rf-card wv-panel', 'display:none;left:50%;bottom:16px;transform:translateX(-50%);width:300px');
const toast = mk('wvToast', 'rf-label', '');
/** The kit's scale a step smaller: the map is the screen here, the panels sit beside it. */
const zoom = () => Math.max(1, Math.round(uiZoom() * 0.8 * 4) / 4);
const scale = () => { const z = String(zoom()); for (const el of els) el.style.zoom = z; };
scale();
addEventListener('resize', scale);

const name = (id: string) => worldRegion(id)?.name ?? id;
const aName = (a: number) => (a >= 0 ? ALLIANCES[a].name : 'nobody');

let map: WorldMap;
/** Fit the map between the side panels, under the band. */
const fit = () => { const z = zoom(); map.fit({ top: 48 * z, left: 200 * z, right: 200 * z, bottom: 12 }); };
let view: WorldView | null = null;
const st: MapState = { regions: new Map(), transit: [], squads: new Map(), you: null, hover: null, selected: null, squadAt: null, targets: new Set(), routes: q.get('routes') !== '0', now: Date.now() };
let ordering: string | null = null;
let mouse = { x: 0, y: 0 };

function say(text: string, ms = 3500): void {
  toast.textContent = text;
  toast.style.display = '';
  clearTimeout((say as unknown as { t: number }).t);
  (say as unknown as { t: number }).t = setTimeout(() => (toast.style.display = 'none'), ms) as unknown as number;
}

const swatch = (a: number) => `<span class="wv-sw" style="background:${a >= 0 ? allianceColor(map.art, a) : 'transparent'}"></span>`;
const ownSquadsIn = () => new Set(st.squads.keys());
const sight = (id: string) => inSight(id, st.you as 0 | null, st.regions, ownSquadsIn());

function renderBand(): void {
  const you = st.you;
  band.innerHTML = `<span class="rf-name">World</span><span class="rf-dim">${view ? `season ${view.snap.season}` : ''}</span><span class="rf-sep"></span>
    ${you !== null ? `${swatch(you)}<span>${aName(you)}</span><span class="rf-sep"></span>` : ''}
    <span class="rf-dim" id="wvStatus">${view?.status ?? 'loading'}</span><span class="rf-sep"></span>
    <button class="rf-tbtn${st.routes ? ' on' : ''}" data-act="routes" title="trade routes (T)">Routes T</button>
    <button class="rf-tbtn" data-act="fit" title="fit the map (F)">Fit F</button>`;
}
band.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
  if (a === 'routes') (st.routes = !st.routes), renderBand();
  if (a === 'fit') fit();
});

function renderSquads(): void {
  const now = Date.now(), sq = view?.squads ?? [], tr = st.transit;
  const rows = sq.map((s) => `<div class="rf-row wv-row${st.squadAt === s.region ? ' on' : ''}" data-region="${s.region}" title="select: its neighbours light up">
      <b style="flex:1">${name(s.region)}</b><span class="rf-num">${s.men}</span><span class="rf-dim">${Object.entries(s.classes).map(([c, n]) => `${n} ${c.replace('_', ' ')}`).join(', ')}</span></div>`).join('');
  const road = tr.map((t) => `<div class="wv-row"><span style="flex:1">${name(t.from)} → ${name(t.to)}</span><span class="rf-num">${t.men}</span>
      <span class="${t.state === 'queued' ? 'wv-flag bad' : 'rf-num'}">${t.state === 'queued' ? 'waiting: quota full' : clock(Math.max(0, Math.ceil((t.arriveAt - now) / 1000)))}</span></div>`).join('');
  squadsEl.innerHTML = `<div class="rf-head"><span class="rf-name">Your squads</span></div>
    ${rows || '<div class="rf-dim" style="padding:4px">none in the field: enter a region to deploy</div>'}
    <div class="rf-cap" style="margin-top:6px">On the road <span class="rf-dim">${tr.length}</span></div>
    ${road || '<div class="rf-dim" style="padding:0 4px">nobody</div>'}
    <div class="rf-dim" style="margin-top:6px">Select a squad, click a lit neighbour to send it. Double-click a region to enter.</div>`;
}
squadsEl.addEventListener('click', (e) => {
  const r = (e.target as HTMLElement).closest<HTMLElement>('[data-region]')?.dataset.region;
  if (r) selectRegion(r);
});
draggable(squadsEl);

function renderSeason(): void {
  if (!view) return;
  const rows = seasonStandings(view.snap.regions), scores = view.scores;
  const ranked = [...rows].sort((a, b) => (scores ? scores[b.id] - scores[a.id] : b.rate - a.rate));
  const holder = view.snap.regions.find((r) => r.id === 'omphalos')?.owner ?? -1;
  const left = view.endsAt ? Math.max(0, Math.floor((view.endsAt - Date.now()) / 1000)) : null;
  seasonEl.innerHTML = `<div class="rf-head"><span class="rf-name">Season</span><span class="rf-dim" style="margin-left:auto">${left === null ? 'no season clock yet' : `${Math.floor(left / 86400)}d ${clock(left % 86400)} left`}</span></div>
    <div class="wv-row rf-dim" style="font-size:11px"><span style="flex:1">alliance</span><span style="width:44px;text-align:right">score</span><span style="width:40px;text-align:right">/ h</span><span style="width:38px;text-align:right">towns</span></div>
    ${ranked.map((r) => `<div class="wv-row${r.id === st.you ? ' rf-row on' : ''}"><img src="${ART}banners/${ALLIANCES[r.id].key}.png" width="12" height="17" alt="">
      <span style="flex:1">${aName(r.id)}${r.omphalos ? ' <span class="wv-flag">Omphalos</span>' : ''}</span>
      <span class="rf-num" style="width:44px;text-align:right">${scores ? scores[r.id] : '—'}</span>
      <span class="rf-num" style="width:40px;text-align:right;color:var(--rf-good)">+${r.rate}</span>
      <span class="rf-num" style="width:38px;text-align:right">${r.towns}</span></div>`).join('')}
    <div class="wv-kv"><span>Omphalos</span><span>${holder >= 0 ? `${aName(holder)} holds it` : 'unclaimed'}</span>
      <span>Frontier</span><span>${ranked.map((r) => `${aName(r.id).slice(0, 3)} ${r.frontier}/4`).join(' · ')}</span></div>
    <div class="rf-dim" style="margin-top:5px">Hegemony: Omphalos and 3 of the 4 frontier towns for 24 h ends the season.</div>`;
}
draggable(seasonEl);

function regionCard(id: string): string {
  const w = worldRegion(id)!, r = st.regions.get(id), [p1, p2] = PURPOSE[id] ?? ['', ''], you = st.you;
  const res = Object.entries(w.res).map(([k, n]) => `${k} ${n}`).join(' · ');
  const flags = [MARKET_TOWNS.has(id) && 'Market town', isChokepoint(id) && 'Chokepoint', r?.contested && 'Contested', r?.besieged && 'Besieged'].filter(Boolean)
    .map((f) => `<span class="wv-flag${f === 'Contested' || f === 'Besieged' ? ' bad' : ''}">${f}</span>`).join('');
  const owner = r?.owner ?? -1, seen = sight(id), mine = st.squads.get(id) ?? 0;
  let troops: string;
  if (!r) troops = '<span class="rf-dim">no report</span>';
  else if (!seen) troops = '<span class="rf-dim">unseen: not next to your land</span>';
  else {
    const live = r.live.flatMap((n, a) => (n > 0 ? [`${swatch(a)}${n}`] : []));
    troops = live.length ? `<span style="display:flex;gap:6px;align-items:center">${live.join(' ')}</span>` : '<span class="rf-dim">nobody</span>';
  }
  const quota = view?.quota[you ?? 0] ?? 150, ours = you !== null && r ? r.live[you] : 0;
  return `<div class="rf-head"><span class="rf-name">${w.name}</span><span class="rf-dim" style="margin-left:auto">${w.role}</span></div>
    <div style="margin-top:3px">${p1}<span class="rf-dim">${p2 ? ` · ${p2}` : ''}</span></div>
    <div>${flags}</div>
    <div class="wv-kv"><span>Owner</span><span style="display:flex;gap:4px;align-items:center">${swatch(owner)}${aName(owner)}</span>
      <span>Biome</span><span>${w.biome}</span><span>Goods</span><span>${res}</span>
      <span>Troops</span>${troops}
      ${you !== null && seen ? `<span>Garrison</span><span style="display:flex;gap:6px;align-items:center">${bar('ok', ours / quota, 70)}<span class="rf-num">${ours}/${quota}</span></span>` : ''}
      ${mine ? `<span>Yours</span><span>${mine} men</span>` : ''}</div>
    <div class="rf-dim" style="margin-top:4px">${st.targets.has(id) ? 'click: send the squad here' : 'double-click or Enter: enter the region'}</div>`;
}

function placeCard(): void {
  if (!st.hover || ordering) return void (card.style.display = 'none');
  card.innerHTML = regionCard(st.hover);
  card.style.display = '';
  const z = Number(card.style.zoom) || 1, r = card.getBoundingClientRect();
  let x = mouse.x + 18, y = mouse.y + 18;
  if (x + r.width > innerWidth - 4) x = mouse.x - r.width - 18;
  if (y + r.height > innerHeight - 4) y = innerHeight - r.height - 4;
  card.style.left = `${Math.max(4, x) / z}px`;
  card.style.top = `${Math.max(4, y) / z}px`;
}

function selectRegion(id: string | null): void {
  st.selected = id;
  st.squadAt = id && st.squads.has(id) ? id : null;
  st.targets = new Set(st.squadAt ? worldRegion(st.squadAt)!.adj : []);
  closeOrder();
  renderSquads();
}

function openOrder(to: string): void {
  const from = st.squadAt!, men = st.squads.get(from) ?? 0, r = st.regions.get(to), you = st.you ?? 0;
  const quota = view?.quota[you] ?? 150, there = r?.live[you] ?? 0, seen = sight(to), after = there + men;
  ordering = to;
  order.innerHTML = `<div class="rf-head"><span class="rf-name">Transfer</span><span class="rf-dim" style="margin-left:auto">${name(from)} → ${name(to)}</span></div>
    <div class="wv-kv"><span>Squad</span><span>${men} men</span>
      <span>Travel</span><span><b class="rf-num">${clock(Math.round(travelMs(from, to) / 1000))}</b> <span class="rf-dim">from the exit zone, +1.5 s a tile away from it</span></span>
      <span>Arrival</span><span>${seen ? `${bar(after > quota ? 'burn' : 'ok', after / quota, 70)} <span class="rf-num">${after}/${quota}</span>${after > quota ? ' <span class="wv-flag bad">waits in line</span>' : ''}` : '<span class="rf-dim">quota unseen (fog)</span>'}</span>
      <span>Owner</span><span>${aName(r?.owner ?? -1)}${r?.contested ? ' <span class="wv-flag bad">fighting</span>' : ''}</span></div>
    <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:6px"><button class="rf-tbtn" data-act="cancel">Cancel Esc</button><button class="rf-tbtn pri" data-act="send">Send ⏎</button></div>`;
  order.style.display = '';
  card.style.display = 'none';
}
function closeOrder(): void {
  ordering = null;
  order.style.display = 'none';
}
async function sendOrder(): Promise<void> {
  const from = st.squadAt, to = ordering;
  if (!from || !to) return;
  closeOrder();
  say(`sending the squad to ${name(to)}…`);
  const r = await source.transfer(from, to);
  if ('error' in r) say(`transfer refused: ${r.error}`, 5000);
  else say(`${r.ok.reduce((s, t) => s + t.men, 0)} men on the road to ${name(to)}`);
  selectRegion(null);
}
order.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
  if (a === 'send') void sendOrder();
  if (a === 'cancel') closeOrder();
});

function enter(id: string | null): void {
  if (!id) return;
  const p = new URLSearchParams({ region: id, world: '1' });
  if (source.mode === 'net') {
    p.set('net', `/ws/war/${id}`);
    p.set('dev', String(source.devId));
    p.set('team', String(st.you ?? 0));
  } else p.set('offline', '1');
  location.href = `sandbox.html?${p}`;
}

function apply(v: WorldView): void {
  view = v;
  st.regions = new Map(v.snap.regions.map((r: RegionState) => [r.id, r]));
  st.transit = v.snap.transit;
  st.squads = new Map(v.squads.map((s) => [s.region, s.men]));
  st.you = v.snap.you.alliance;
  if (st.squadAt && !st.squads.has(st.squadAt)) selectRegion(st.selected);
  renderBand();
  renderSquads();
  renderSeason();
}

// ---------- input ----------
let down: { x: number; y: number; mx: number; my: number; moved: boolean } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, mx: map.x, my: map.y, moved: false };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  mouse = { x: e.clientX, y: e.clientY };
  if (down) {
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (Math.hypot(dx, dy) > 4) down.moved = true;
    if (down.moved) (map.x = down.mx - dx / map.k), (map.y = down.my - dy / map.k);
  }
  st.hover = map.regionAt(...map.toMap(e.clientX, e.clientY));
  canvas.style.cursor = st.hover ? 'pointer' : 'default';
  placeCard();
});
canvas.addEventListener('pointerleave', () => { st.hover = null; placeCard(); });
canvas.addEventListener('pointerup', (e) => {
  const click = down && !down.moved;
  down = null;
  if (!click) return;
  const id = map.regionAt(...map.toMap(e.clientX, e.clientY));
  if (id && st.targets.has(id)) openOrder(id);
  else selectRegion(id);
});
canvas.addEventListener('dblclick', (e) => enter(map.regionAt(...map.toMap(e.clientX, e.clientY))));
canvas.addEventListener('wheel', (e) => { e.preventDefault(); map.zoom(e.deltaY > 0 ? 1 / 1.15 : 1.15, e.clientX, e.clientY); placeCard(); }, { passive: false });
addEventListener('keydown', (e: KeyboardEvent) => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === 'enter') ordering ? void sendOrder() : enter(st.hover ?? st.selected);
  else if (k === 'escape') ordering ? closeOrder() : selectRegion(null);
  else if (k === 't') (st.routes = !st.routes), renderBand();
  else if (k === 'f') fit();
  else if (k === '+' || k === '=') map.zoom(1.2, innerWidth / 2, innerHeight / 2);
  else if (k === '-') map.zoom(1 / 1.2, innerWidth / 2, innerHeight / 2);
});
addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- start ----------
void WorldMap.load(canvas).then(async (m) => {
  map = m;
  fit();
  addEventListener('resize', () => fit());
  renderBand();
  const frame = () => { st.now = Date.now(); map.draw(st); requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
  setInterval(() => { renderSquads(); renderSeason(); }, 1000);
  try {
    await source.start(apply);
  } catch (e) {
    say(String((e as Error).message), 60_000);
    band.querySelector('#wvStatus')!.textContent = 'offline: no server';
  }
  (window as unknown as { __world: unknown }).__world = { st, map, source, select: selectRegion, order: openOrder, hover: (id: string | null, x = 0, y = 0) => { st.hover = id; mouse = { x, y }; placeCard(); } };
});
