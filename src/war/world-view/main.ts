/**
 * The strategic world screen (M4c, W-02; world.html). The world map with ownership, fights, trade routes and fog, the
 * player's squads and transfers, the season standings; a region opens in the region sandbox (net mode).
 *
 *   world.html                live world: wrangler dev with DEV_AUTH=1 behind the vite proxy (./source.ts NetSource);
 *                             ?dev=<id> signs in as that dev player, ?alliance=0..3 joins that alliance if he has none
 *   world.html?offline=1      a mock world in memory (MockSource)
 *
 * Mouse: drag pans, wheel zooms, hover shows a region's card (./regionCard.ts), click selects and docks its card at the
 * right with an Enter button (a region with your men selects your squad there: its neighbours light up; click one to
 * order the transfer), double click enters a region. L opens the map key (./legend.ts).
 * Keys: Enter enters the hovered / selected region (or sends the transfer being ordered), Esc clears, T trade routes,
 * F fits the map, H the haul planner (M6l: from, to and cart; while it is open a click on the map picks the destination,
 * shift-click the start). Convoys (carts and porters on the road) show by fog and the Safe Roads rule; a market town's
 * hover card shows its price board as your men last saw it; the season panel adds today's trade score. `window.__world` is the screen's state for scripts.
 * W-63: settlements show as markers sized by level with fealty lines vassal to overlord; hover names lord and ties.
 * W-64: a crown by each monarch's home, pacts and truces as lines home to home; crown news (`crownNews`) as a toast.
 * W-62: world events glow on the map with a marker and their countdown; the events card (bottom left) names the running
 * one, its rule and the next; B opens the season scoreboard (the last season's result, title holders, your banners and
 * crests, what a season's end keeps and resets).
 */
import '@fontsource/inter/600.css';
import '@fontsource/cinzel/700.css';
import type { RegionState } from '../net/world';
import { ALLIANCES } from '../world/alliances';
import { worldRegion, WORLD_IDS } from '../world/graph';
import { bar, CSS, fitHeight, placeTip, uiZoom, UNIT_ICON } from '../view/hud/kit';
import { loadGlyphs } from '../view/hud/glyph';
import { medal, titleTip, TITLES, TITLE_ORDER } from '../view/hud/titles';
import { draggable } from '../view/hud/drag';
import { convoySeen, HAUL_LOADS, inSight, isChokepoint, MARKET_TOWNS, planHaul, seasonStandings, TRADE_CAP, type HaulKind } from './geo';
import { CARD_CSS, crest, dangerHtml, loreLine, regionCardHtml, resIcon, type CardCtx } from './regionCard';
import { LEGEND_CSS, legendHtml } from './legend';
import { allianceColor, ART, clock, WorldMap, type MapState } from './map';
import { MOCK_MASTERED, MOCK_SETTLEMENTS, MockSource, NetSource, travelMs, type WorldSource, type WorldTitle, type WorldView } from './source';
import { REGION_DEPTH } from '../sim/depth';
import { LANDMARK_FUNCTION } from '../../data/warLore';
import { landmarkOfRegion } from '../../data/warLandmarks';
import { domainOf, warlord, WARLORDS } from '../../data/warWarlords';
import { bossesOfRegion } from '../../data/warBosses';
import { keys } from '../input/keys';
import { mountGameMenu } from '../menu/gameMenu';
import { EVENT_INFO, type WorldEvent } from '../world/events';
import { EVENT_LOOK, eventIcon } from './eventLook';
import type { Crest, SeasonBoard } from '../net/world';
import { chatBusy, mountChat, type ChatHandle } from '../view/hud/chat';
import { mountPins, type PinHandle } from '../view/hud/pins';
import { MockChat, NetChat, OfflineChat, worldTaps } from '../net/chatLink';
import { warAuth } from '../net/session';
import { levelName } from '../net/settlements';
import { wipeCard } from '../view/hud/wipeCard';
import { wiped, type WipeState } from '../sim/tunnel';

const q = new URLSearchParams(location.search);
const offline = q.has('offline');
const source: WorldSource = offline ? new MockSource() : new NetSource(q);

const style = document.createElement('style');
style.textContent = CSS + CARD_CSS + LEGEND_CSS + `
:root{--rf-body:600 13px/1.35 Inter,system-ui,sans-serif}
.rf-tbtn{font-size:13px}.rf-cap,.rf-cap .rf-dim{font-size:13px}
#wvBand{white-space:nowrap;top:0;left:0;right:0;height:40px;display:flex;align-items:center;justify-content:center;gap:8px;padding:0 10px;pointer-events:auto;
  border:0;border-radius:0;background:linear-gradient(180deg,rgba(30,33,39,.94),rgba(13,15,18,.9));box-shadow:inset 0 -1px 0 var(--hud-gold-lo),inset 0 -2px 0 rgba(0,0,0,.6),0 1px 0 var(--hud-edge),0 4px 14px rgba(0,0,0,.45);backdrop-filter:blur(3px)}
#wvBand kbd{display:inline-block;min-width:15px;padding:2px 4px 1px;margin-left:5px;border:0;border-radius:2px;font:700 10px/1.1 Inter,system-ui,sans-serif;color:var(--hud-gold-hi);text-align:center;background:linear-gradient(180deg,#2a2d34,#15171b);box-shadow:inset 0 0 0 1px var(--hud-bronze),0 1px 0 var(--hud-edge)}
.wv-panel{width:240px;padding:6px 8px 8px;pointer-events:auto}
.wv-row{display:flex;align-items:center;gap:6px;padding:3px 4px;border-radius:2px}
.wv-sw{width:10px;height:10px;flex:none;border:1px solid #0e0907}
.wv-flag{display:inline-block;padding:0 4px;margin:2px 3px 0 0;border:1px solid var(--rf-line);color:var(--rf-gold);font-size:13px;line-height:17px}
.wv-flag.bad{color:var(--rf-bad)}
.wv-kv{display:grid;grid-template-columns:62px 1fr;gap:2px 6px;margin-top:4px}
.wv-kv>:nth-child(odd){color:var(--rf-muted)}
.wv-hint{margin-top:6px;color:var(--rf-muted);line-height:1.35}
.wv-tabs{display:flex;margin-top:8px;border-bottom:1px solid var(--rf-line)}
.wv-tabs .rf-tab{font-size:13px;height:24px}
.wv-sq{display:grid;grid-template-columns:1fr auto;align-items:center;gap:2px 6px;padding:4px 6px;margin-top:4px;background:var(--rf-sunk);border:1px solid var(--rf-rule)}
.wv-sq.on{border-color:var(--rf-title);background:var(--rf-sel)}
.wv-sq .cls{grid-column:1/-1;display:flex;gap:6px;color:var(--rf-muted)}
.wv-sq .cls span{display:inline-flex;align-items:center;gap:2px}
.st-row{display:grid;grid-template-columns:12px 1fr 34px 28px 40px;gap:0 5px;align-items:center;padding:3px 4px}
.st-row.me{background:var(--rf-sel);box-shadow:inset 3px 0 0 var(--rf-title)}
.st-row .n{text-align:right;font-variant-numeric:tabular-nums}
.st-row.hd{color:var(--rf-muted);padding-bottom:1px}
.st-goal{margin-top:6px;padding:5px 7px;background:var(--rf-sunk);border:1px solid var(--rf-rule);line-height:1.35}
.st-goal b{color:var(--rf-gold)}
#wvToast{left:50%;bottom:16px;transform:translateX(-50%);display:none;pointer-events:none;font-size:13px}
.wt-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:4px}
.wt-t{display:flex;align-items:center;gap:5px;padding:3px;background:var(--rf-sunk);border:1px solid var(--rf-rule)}
.wt-t:hover{border-color:var(--rf-accent)}
.wt-who{display:flex;align-items:center;gap:3px;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wt-who .wv-sw{width:7px;height:7px}
.wt-n{font:700 13px/1.2 Cinzel,serif;color:var(--rf-accent);white-space:normal;word-break:keep-all;overflow-wrap:normal;hyphens:none}
.we-ev{display:flex;gap:7px;align-items:flex-start;padding:5px;margin-top:4px;background:var(--rf-sunk);border:1px solid var(--rf-rule);border-left:3px solid var(--we-c)}
.we-ev b{color:var(--we-c)}
.we-t{font:600 15px/1 Inter,sans-serif;font-variant-numeric:tabular-nums;color:var(--rf-text);margin-left:auto;white-space:nowrap}
.we-rule{font-size:13px;line-height:1.35;color:var(--rf-muted);margin-top:2px}
.sb-win{display:flex;gap:10px;align-items:center;padding:6px;margin-top:4px;background:var(--rf-sunk);border:1px solid var(--rf-rule)}
.sb-row{display:grid;grid-template-columns:30px 12px 1fr 54px 50px;gap:0 6px;align-items:center;padding:2px 4px}
.sb-row.top{color:var(--rf-gold)}
.sb-keep{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:4px;font-size:13px;line-height:1.4}
.sb-keep>div{padding:4px 6px;background:var(--rf-sunk);border:1px solid var(--rf-rule)}
.sb-crest{display:inline-flex;align-items:center;gap:4px;padding:2px 6px 2px 3px;margin:2px 4px 0 0;border:1px solid var(--rf-line);font-size:13px}
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
const card = mk('wvCard', 'rf-card wv-panel', 'display:none;pointer-events:none;z-index:6;width:300px');
/** The clicked region's card, docked at the right in the season panel's place with real buttons (the hover card follows the pointer). */
const pin = mk('wvPin', 'rf-card wv-panel', 'display:none;z-index:5;right:8px;top:48px;width:300px');
const legendEl = mk('wvLegend', 'rf-card wv-panel', 'display:none;right:316px;bottom:12px;width:400px;z-index:5');
const order = mk('wvOrder', 'rf-card wv-panel', 'display:none;left:50%;bottom:16px;transform:translateX(-50%);width:300px');
const haulEl = mk('wvHaul', 'rf-card wv-panel', 'display:none;left:50%;bottom:12px;transform:translateX(-50%);width:264px');
const toast = mk('wvToast', 'rf-label', '');
const eventsEl = mk('wvEvents', 'rf-card wv-panel', 'left:8px;bottom:12px;width:250px');
const boardEl = mk('wvBoard', 'rf-card wv-panel', 'display:none;left:50%;top:56px;transform:translateX(-50%);width:360px;z-index:7');
const tip = mk('wvTip', 'rf-tip', 'display:none;z-index:8');
/** The kit's scale a step smaller: the map is the screen here, the panels sit beside it. */
const zoom = () => Math.max(1, Math.round(uiZoom() * 0.8 * 4) / 4);
const scale = () => { const z = String(zoom()); for (const el of els) el.style.zoom = z; };
scale();
void loadGlyphs();
// W-61: the season panel's emblems carry their words in a kit tooltip; the docked region card, the key and the squads explain their terms the same way
for (const p of [seasonEl, pin, legendEl, squadsEl, boardEl]) {
  p.addEventListener('pointerover', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]');
    if (!el) return void (tip.style.display = 'none');
    tip.innerHTML = `<span class="tip-w">${el.dataset.tip!}</span>`;
    tip.style.display = '';
    placeTip(tip, el);
  });
  p.addEventListener('pointerleave', () => (tip.style.display = 'none'));
}
addEventListener('resize', scale);

const name = (id: string) => worldRegion(id)?.name ?? id;
const aName = (a: number) => (a >= 0 ? ALLIANCES[a].name : 'nobody');

let map: WorldMap;
/** Fit the map between the side panels, under the band. */
const fit = () => { const z = zoom(); map.fit({ top: 48 * z, left: 200 * z, right: 200 * z, bottom: 12 }); };
let view: WorldView | null = null;
const st: MapState = { regions: new Map(), transit: [], squads: new Map(), you: null, hover: null, selected: null, squadAt: null, targets: new Set(), routes: q.get('routes') !== '0', now: Date.now(), convoys: [], haul: null };
let ordering: string | null = null;
let mouse = { x: 0, y: 0 };
/** M7g: the landmark marker under the pointer (its region id): its card wins over the region's. */
let hoverLm: string | null = null;
/** W-72: the warlord pennant under the pointer (his id); W-73: the mastery star under it (its region). */
let hoverLord: string | null = null, hoverMastered: string | null = null;
// W-72: each warlord's hall and the lands his bands take and raid (src/data/warWarlords.ts domainOf)
st.warlords = WARLORDS.flatMap((w) => domainOf(w).map((region, i) => ({ id: w.id, region, seat: i === 0, tint: w.tint })));

function say(text: string, ms = 3500): void {
  toast.textContent = text;
  toast.style.display = 'block'; // '' would fall back to the sheet's display:none
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
    <button class="rf-tbtn${legendOpen ? ' on' : ''}" data-act="legend" title="what the map's colours, lines and markers mean (L)">Map key<kbd>L</kbd></button>
    <button class="rf-tbtn${st.routes ? ' on' : ''}" data-act="routes" title="show the trade roads (T)">Roads<kbd>T</kbd></button>
    <button class="rf-tbtn${haul.open ? ' on' : ''}" data-act="haul" title="plan a haul: path, travel time, chokepoints and ambush risk (H)">Haul<kbd>H</kbd></button>
    <button class="rf-tbtn${boardOpen ? ' on' : ''}" data-act="board" title="the season scoreboard: last season's result, titles, your banners (B)">Scoreboard<kbd>B</kbd></button>
    <button class="rf-tbtn" data-act="fit" title="fit the whole map on screen (F)">Fit<kbd>F</kbd></button>`;
}
band.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
  if (a === 'routes') (st.routes = !st.routes), renderBand();
  if (a === 'fit') fit();
  if (a === 'haul') toggleHaul();
  if (a === 'board') toggleBoard();
  if (a === 'legend') toggleLegend();
});

// ---------- the map key ----------
let legendOpen = q.has('legend');
function renderLegend(): void {
  if (!legendOpen || !map) return void (legendEl.style.display = 'none');
  legendEl.innerHTML = legendHtml((a) => allianceColor(map.art, a), st.you);
  legendEl.style.display = '';
}
function toggleLegend(): void {
  legendOpen = !legendOpen;
  renderLegend();
  renderBand();
}
legendEl.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('[data-act="close"]')) toggleLegend(); });
draggable(legendEl);

// ---------- W-62 world events and the season scoreboard ----------
const left = (at: number) => clock(Math.max(0, Math.ceil((at - Date.now()) / 1000)));
const evStyle = (e: WorldEvent) => `--we-c:${EVENT_LOOK[e.kind].color}`;
/** The events card: the running event (where, its rule, time left), and the next one to come. */
function renderEvents(): void {
  const ev = view?.snap.events;
  const active = (ev?.active ?? []).filter((e) => e.endAt > Date.now()), next = ev?.next ?? null;
  eventsEl.innerHTML = `<div class="rf-head"><span class="rf-name">World events</span><span class="rf-dim" style="margin-left:auto">one every ~3 h</span></div>
    ${active.map((e) => `<div class="we-ev" style="${evStyle(e)};cursor:pointer" data-region="${e.region}" title="click: select it on the map">${eventIcon(e.kind, 24)}<div style="flex:1;min-width:0">
      <div style="display:flex;align-items:baseline;gap:6px"><b>${EVENT_INFO[e.kind].name}</b><span class="we-t">${left(e.endAt)}</span></div>
      <div>${name(e.region)}</div><div class="we-rule">${EVENT_INFO[e.kind].rule}</div></div></div>`).join('')
      || '<div class="rf-dim" style="padding:4px">all quiet on the map</div>'}
    ${next ? `<div class="wv-row" style="margin-top:4px;padding:2px 0;align-items:flex-start">${eventIcon(next.kind, 20)}<div style="flex:1;min-width:0"><div style="display:flex"><span class="rf-dim">Next: ${EVENT_INFO[next.kind].name}</span><span class="rf-num" style="margin-left:auto">in ${left(next.startAt)}</span></div><div>${name(next.region)}</div></div></div>` : ''}`;
}
eventsEl.addEventListener('click', (e) => {
  const r = (e.target as HTMLElement).closest<HTMLElement>('[data-region]')?.dataset.region;
  if (r) selectRegion(r);
});

let boardOpen = q.has('board');
const ordinal = ['1st', '2nd', '3rd', '4th'];
/** The season scoreboard: the last finished season (winner, final and event score, title holders), your crests, the rules of the season's end. */
function renderBoard(): void {
  if (!boardOpen || !view) return void (boardEl.style.display = 'none');
  const b: SeasonBoard | null = view.snap.last ?? null, crests: Crest[] = view.snap.crests ?? [], now = view.snap.score;
  const board = b ? (() => {
    const ranked = b.scores.map((v, a) => ({ a, v })).sort((x, y) => y.v - x.v);
    const w = b.winner;
    return `<div class="sb-win">${w !== null ? `<img src="${ART}banners/${ALLIANCES[w].key}.png" width="24" height="34" alt="">` : ''}<div>
        <div class="rf-name" style="font-size:15px">${w !== null ? `${aName(w)} won season ${b.season}` : `Season ${b.season} ended in a tie`}</div>
        <div class="rf-dim">${b.reason === 'hegemony' ? 'by hegemony: Omphalos and 3 frontier towns for 24 h' : 'on time, by the highest score'} · ${new Date(b.at).toLocaleDateString()}</div>
        ${w !== null ? `<div class="rf-dim">${b.banners} player${b.banners === 1 ? '' : 's'} earned the ${aName(w)} banner</div>` : ''}</div></div>
      <div class="sb-row rf-dim" style="font-size:11px"><span></span><span></span><span>alliance</span><span style="text-align:right">score</span><span style="text-align:right">events</span></div>
      ${ranked.map((r, i) => `<div class="sb-row${i === 0 && w !== null ? ' top' : ''}"><span class="rf-dim">${ordinal[i]}</span>${swatch(r.a)}<span>${aName(r.a)}${r.a === st.you ? ' <span class="rf-dim">(you)</span>' : ''}</span><span class="rf-num" style="text-align:right">${r.v}</span><span class="rf-num rf-dim" style="text-align:right">${b.event[r.a] ?? 0}</span></div>`).join('')}
      <div class="rf-cap" style="margin-top:6px">Title holders <span class="rf-dim">each earned his title's crest</span></div>
      ${b.titles.length ? `<div class="wt-grid">${b.titles.map((t) => `<div class="wt-t">${medal(t.id, 24)}<div style="min-width:0"><div class="wt-who">${t.alliance >= 0 ? swatch(t.alliance) : ''}${t.player}</div><div class="wt-n">${t.name}</div></div></div>`).join('')}</div>` : '<div class="rf-dim">no titles were held</div>'}`;
  })() : `<div class="rf-dim" style="padding:6px 2px">No season has ended yet. Season ${now.id} ends in ${Math.floor(now.left / 86_400_000)}d ${clock(Math.floor((now.left % 86_400_000) / 1000))}; its board appears here.</div>`;
  const mine = crests.length
    ? crests.map((c) => `<span class="sb-crest" title="season ${c.season}">${c.kind === 'banner' ? `<img src="${ART}banners/${ALLIANCES[c.alliance]?.key ?? 'dodona'}.png" width="11" height="15" alt="">${aName(c.alliance)} banner` : `${medal(c.title ?? '', 16)}${TITLES[c.title ?? '']?.name ?? c.title} crest`}<span class="rf-dim">S${c.season}</span></span>`).join('')
    : '<span class="rf-dim">none yet: win a season with your alliance, or hold a title at its end</span>';
  boardEl.innerHTML = `<div class="rf-head"><span class="rf-name">Season scoreboard</span><button class="rf-tbtn x" data-act="close" style="margin-left:auto" title="close (B, Esc)">×</button></div>
    ${board}
    <div class="rf-cap" style="margin-top:6px">Your banners and crests</div><div>${mine}</div>
    <div class="rf-cap" style="margin-top:6px">At a season's end</div>
    <div class="sb-keep"><div><b style="color:var(--rf-good)">You keep</b><br>your men and their levels<br>gear and goods at home<br>banners and crests</div>
      <div><b style="color:var(--rf-bad)">Starts over</b><br>alliance score, titles<br>region control, claim points<br>landmarks and their guardians</div></div>
    <div class="rf-dim" style="margin-top:4px">Men out in the regions march home when the next season begins.</div>`;
  boardEl.style.display = '';
}
function toggleBoard(): void {
  boardOpen = !boardOpen;
  renderBoard();
  renderBand();
}
boardEl.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('[data-act="close"]')) toggleBoard(); });
draggable(boardEl);
draggable(eventsEl);

const CLASS_NAME: Record<string, string> = { militia: 'militia', hoplite: 'hoplites', celt_sword: 'swordsmen', archer: 'archers', slinger: 'slingers', javelineer: 'javelineers' };
function renderSquads(): void {
  const now = Date.now(), sq = view?.squads ?? [], tr = st.transit;
  const rows = sq.map((s) => `<div class="wv-sq rf-row${st.squadAt === s.region ? ' on' : ''}" data-region="${s.region}" data-tip="Select it: the regions it can march to glow">
      <b>${name(s.region)}</b><span class="rf-num">${s.men} men</span>
      <span class="cls">${Object.entries(s.classes).map(([c, n]) => `<span title="${n} ${CLASS_NAME[c] ?? c}">${UNIT_ICON[c] ? `<img src="war/ui/icons/24/${UNIT_ICON[c]}.png" width="18" height="18" alt="">` : ''}${n} ${CLASS_NAME[c] ?? c.replace('_', ' ')}</span>`).join('')}</span></div>`).join('');
  const road = tr.map((t) => `<div class="wv-row"><span style="flex:1">${name(t.from)} → ${name(t.to)}</span><span class="rf-num">${t.men}</span>
      <span class="${t.state === 'queued' ? 'wv-flag bad' : 'rf-num'}"${t.state === 'queued' ? ' data-tip="The region is full for your alliance: they march in when there is room"' : ''}>${t.state === 'queued' ? 'waiting: full' : clock(Math.max(0, Math.ceil((t.arriveAt - now) / 1000)))}</span></div>`).join('');
  squadsEl.innerHTML = `<div class="rf-head"><span class="rf-name">Your squads</span></div>
    ${rows || '<div class="rf-dim" style="padding:4px">None in the field yet: enter a region to deploy.</div>'}
    ${tr.length ? `<div class="rf-cap" style="margin-top:8px">Marching <span class="rf-dim">${tr.length}</span></div>${road}` : ''}
    <div class="wv-hint">Click a squad, then a glowing region to march. Double-click any region to enter it.</div>`;
}
squadsEl.addEventListener('click', (e) => {
  const r = (e.target as HTMLElement).closest<HTMLElement>('[data-region]')?.dataset.region;
  if (r) selectRegion(r);
});
draggable(squadsEl);

type SeasonTab = 'titles' | 'trade' | 'peace';
let seasonTab: SeasonTab = 'titles';
function renderSeason(): void {
  if (!view) return;
  const rows = seasonStandings(view.snap.regions), scores = view.scores;
  const ranked = [...rows].sort((a, b) => (scores ? scores[b.id] - scores[a.id] : b.rate - a.rate));
  const holder = view.snap.regions.find((r) => r.id === 'omphalos')?.owner ?? -1;
  const left = view.endsAt ? Math.max(0, Math.floor((view.endsAt - Date.now()) / 1000)) : null;
  const ids = ranked.map((r) => r.id), tabs: [SeasonTab, string][] = [['titles', 'Titles'], ...(view.trade ? [['trade', 'Trade'] as [SeasonTab, string]] : []), ...(view.snap.score.peace ? [['peace', 'Peace'] as [SeasonTab, string]] : [])];
  if (!tabs.some(([k]) => k === seasonTab)) seasonTab = 'titles';
  const body = seasonTab === 'trade' && view.trade ? tradeHtml(ids, view.trade) : seasonTab === 'peace' ? peaceHtml(ids, view.snap.score.peace) : titlesHtml(view.titles ?? []);
  seasonEl.innerHTML = `<div class="rf-head"><span class="rf-name">Season</span><span class="rf-dim" style="margin-left:auto">${left === null ? 'no clock yet' : `${Math.floor(left / 86400)}d ${clock(left % 86400)} left`}</span></div>
    <div class="st-row hd"><span></span><span>Alliance</span><span class="n" data-tip="Season score so far">Score</span><span class="n" data-tip="Score gained each hour from the land held now">/h</span><span class="n" data-tip="Market towns held">Towns</span></div>
    ${ranked.map((r) => `<div class="st-row${r.id === st.you ? ' me' : ''}"><img src="${ART}banners/${ALLIANCES[r.id].key}.png" width="12" height="17" alt="">
      <span>${aName(r.id)}</span>
      <span class="n">${scores ? scores[r.id] : '—'}</span>
      <span class="n" style="color:var(--rf-good)">+${r.rate}</span>
      <span class="n">${r.towns}</span></div>`).join('')}
    <div class="st-goal" data-tip="Frontier towns held: ${ranked.map((r) => `${aName(r.id)} ${r.frontier} of 4`).join(', ')}">
      <b>Omphalos:</b> ${holder >= 0 ? `held by ${aName(holder)}` : 'unclaimed'}<br>
      <span class="rf-dim">Hold Omphalos and 3 of the 4 frontier towns for 24 h to win early; else the top score wins.</span></div>
    <div class="wv-tabs">${tabs.map(([k, l]) => `<button class="rf-tab${seasonTab === k ? ' on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
    ${body}`;
}
seasonEl.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]')?.dataset.tab as SeasonTab | undefined;
  if (t) (seasonTab = t), renderSeason();
});

/** W-61: the peace score per alliance so far (trade volume, contracts filled, works raised). */
function peaceHtml(ids: number[], peace: Record<string, number[]> | undefined): string {
  if (!peace) return '';
  const sum = (a: number) => Object.values(peace).reduce((x, v) => x + (v[a] ?? 0), 0);
  return `<div class="rf-dim" style="margin:6px 0 2px">Score from peaceful play: goods sold to others, contracts filled, works raised.</div>
    ${ids.map((a) => `<div class="wv-row" style="padding:2px 4px">${swatch(a)}<span style="flex:1">${aName(a)}</span><span class="rf-dim" data-tip="sold · contracts · works">${['volume', 'contracts', 'works'].map((k) => peace[k]?.[a] ?? 0).join(' · ')}</span><span class="rf-num" style="width:34px;text-align:right">${sum(a)}</span></div>`).join('')}`;
}

/** W-61: the season's titles: an emblem and holder each (his alliance's colour), the words in the tooltip. */
function titlesHtml(t: WorldTitle[]): string {
  const cell = (id: string) => {
    const x = t.find((y) => y.id === id);
    return `<div class="wt-t" data-tip="${(x ? titleTip(x) : `<b class="k">${TITLES[id].name}</b> · unclaimed`).replace(/"/g, '&quot;')}">${medal(id, 24)}<div style="min-width:0"><div class="wt-who">${x ? `${x.alliance >= 0 ? swatch(x.alliance) : ''}${x.player}` : '<span class="rf-dim">unclaimed</span>'}</div><div class="wt-n">${TITLES[id].name}</div></div></div>`;
  };
  return `<div class="wt-grid" style="margin-top:6px">${TITLE_ORDER.map(cell).join('')}</div>`;
}
/** W-61: the map's emblems: each holder's home region gets his titles' icons after its name. */
function emblems(t: WorldTitle[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const x of t) if (x.home && TITLES[x.id]) m.set(x.home, [...(m.get(x.home) ?? []), TITLES[x.id].icon]);
  return m;
}

/** M6l: today's trade score per alliance against the daily cap. */
function tradeHtml(ids: number[], trade: number[]): string {
  return `<div class="rf-dim" style="margin:6px 0 2px">Trade score today, up to ${TRADE_CAP}: 1 for each 100 coin sold to other alliances.</div>
    ${ids.map((a) => `<div class="wv-row" style="padding:2px 4px">${swatch(a)}<span style="flex:1">${aName(a)}</span>${bar(trade[a] >= TRADE_CAP ? 'burn' : 'ok', trade[a] / TRADE_CAP, 56)}<span class="rf-num" style="width:44px;text-align:right">${trade[a]}/${TRADE_CAP}</span></div>`).join('')}`;
}
draggable(seasonEl);

const LM_STATE: Record<string, string> = { guarded: 'Guarded: gates shut', unclaimed: 'Guardian slain, free to claim', damaged: 'Damaged: power asleep', restored: 'Restored: power awake' };
const RARE_NAME: Record<string, string> = { dragonbone: 'Dragonbone', nereidPearl: 'Nereid pearl', starIron: 'Star iron', asphodel: 'Asphodel', titanBronze: 'Titan bronze', obsidian: 'Obsidian' };
const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
const colorOf = (a: number) => allianceColor(map.art, a);
/** A card's header: an emblem, the name and a plain-words line under it. */
const cardHead = (emblem: string, title: string, sub: string) => `<div class="rc-hd">${emblem}<div class="rc-tt"><div class="rf-name rc-name">${title}</div><div class="rc-sub">${sub}</div></div></div>`;
const tile = (k: string, v: string, tipText = '') => `<div class="rc-tile"${tipText ? ` data-tip="${tipText}"` : ''}><span class="rc-k">${k}</span><span class="rc-v">${v}</span></div>`;

/** M7g: a landmark's hover card: name, lore, guardian alive or slain (back in), holder and state, danger, rare good, power. */
function landmarkCard(id: string): string {
  const lm = landmarkOfRegion(id), r = st.regions.get(id), w = r?.landmark;
  if (!lm || !w) return regionCardFor(id);
  const bosses = bossesOfRegion(id).map((b) => b.name.replace(/^the /, 'The ')).join(' and ');
  const back = w.backAt ? Math.max(0, Math.round((w.backAt - Date.now()) / 1000)) : 0;
  const guard = w.guardian === 'alive' ? '<span style="color:var(--rf-bad)">Alive</span>' : `${w.guardian === 'slain' ? 'Slain' : 'Escaped'}${back ? ` <span class="dim">· back in ${clock(back)}</span>` : ''}`;
  const rare = lm.rare ? `<span class="rc-good">${resIcon(kebab(lm.rare))}${RARE_NAME[lm.rare]}</span>` : '';
  const emblem = `<span class="rc-crest" style="--c:${w.holder >= 0 ? colorOf(w.holder) : '#e0b867'}"><img src="war/ui/icons/24/bld-fort.png" width="28" height="28" alt=""></span>`;
  return `${cardHead(emblem, lm.name, `Landmark in ${name(id)}`)}
    <div class="rc-tags"><span class="rc-tag ${w.state === 'restored' ? 'good' : w.state === 'damaged' ? 'bad' : 'gold'}">${LM_STATE[w.state]}${w.holder >= 0 ? ` · ${Math.round(w.hp * 100)}%` : ''}</span></div>
    <div class="rc-lore">${loreLine(id)}</div>
    <div class="rc-tiles">${tile('Held by', `${w.holder >= 0 ? `<i class="wv-sw" style="background:${colorOf(w.holder)}"></i>${aName(w.holder)}` : w.guardian === 'alive' ? 'Its guardian' : 'Nobody'}`)}
      ${tile('Danger', dangerHtml(REGION_DEPTH[id] ?? 1))}
      ${tile('Guardian', guard)}</div>
    <div class="rc-note">${w.guardian === 'alive' ? 'Guarded by' : 'Its guardian:'} <b style="color:var(--rf-ink)">${bosses}</b></div>
    <div class="rc-sec">Its power once held</div><div style="line-height:1.4">${LANDMARK_FUNCTION[lm.id] ?? ''}</div>
    ${rare ? `<div class="rc-sec">Rare good</div><div class="rc-goods">${rare}</div>` : ''}
    <div class="rc-mine" style="margin-top:8px">+2 score an hour while restored and garrisoned${w.garrisoned ? ' · <b style="color:var(--rf-good)">earning now</b>' : ''}</div>`;
}

/** W-72: a warlord's hover card: his name and title, his hall, his band, the lands he raids from. */
function lordCard(id: string): string {
  const w = warlord(id);
  if (!w) return '';
  const [seat, ...lands] = domainOf(w), col = `#${w.tint.toString(16).padStart(6, '0')}`;
  const emblem = `<span class="rc-crest" style="--c:${col}"><img src="war/ui/icons/24/act-attack.png" width="28" height="28" alt=""></span>`;
  return `${cardHead(emblem, esc(w.name), `${esc(w.title.charAt(0).toUpperCase() + w.title.slice(1))} · a rival warlord`)}
    <div class="rc-tiles">${tile('Hall', name(seat))}${tile('Band', esc(w.band.replace(/^the /, 'The ')))}${tile('Danger', dangerHtml(REGION_DEPTH[seat] ?? 2))}</div>
    <div class="rc-note">His bands raid from ${lands.map(name).join(' and ')}.</div>`;
}

/** W-73: a mastered region's hover card. */
function masteredCard(id: string): string {
  const emblem = `<span class="rc-crest" style="--c:#e0b867"><span style="font:700 22px/1 serif;color:#f2d48a">★</span></span>`;
  return `${cardHead(emblem, `${name(id)} mastered`, 'by you, this season')}<div class="rc-note">Every lair, chief and hidden quest done.</div>`;
}

/** W-63: a settlement's hover card: its level, lord and region, its overlord with the tribute, its vassals. */
function settlementCard(id: number): string {
  const list = st.settlements ?? [], w = list.find((x) => x.id === id);
  if (!w) return '';
  const over = w.overlord_id !== null ? list.find((x) => x.id === w.overlord_id) : null, vas = list.filter((x) => x.overlord_id === w.id);
  const icon = w.level >= 5 ? 'bld-fort' : w.level >= 4 ? 'bld-tower-stone' : w.level >= 2 ? 'bld-storehouse' : 'bld-camp';
  const mine = st.me != null && w.lord_pid === st.me, lv = Math.max(1, w.level);
  const emblem = `<span class="rc-crest" style="--c:${mine ? '#e0b867' : '#7a3418'}"><img src="war/ui/icons/24/${icon}.png" width="28" height="28" alt=""></span>`;
  return `${cardHead(emblem, esc(w.name), `${levelName(w.level)} in ${name(w.region)}`)}
    <div class="rc-tiles">${tile('Lord', `${esc(w.lord ?? '?')}${mine ? ' <span class="dim">(you)</span>' : ''}`)}
      ${tile('Level', `<span class="rc-pips d2">${[1, 2, 3, 4, 5].map((k) => `<i class="${k <= lv ? 'on' : ''}"></i>`).join('')}</span>`, `${levelName(w.level)}: level ${lv} of 5`)}
      ${tile('People', String(w.people))}</div>
    <div class="rc-sec">Fealty</div>
    <div style="line-height:1.45">${over ? `Sworn to <b>${esc(over.name)}</b> <span class="rf-dim">· pays ${w.tribute_pct}% tribute</span>` : '<span class="rf-dim">Free: sworn to nobody</span>'}
      ${vas.length ? `<br>Vassals: ${vas.map((v) => `${esc(v.name)} <span class="rf-dim">${v.tribute_pct}%</span>`).join(', ')}` : ''}</div>`;
}
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The region card (./regionCard.ts) with what this screen knows; `pinned`: the docked copy with real buttons. */
function regionCardFor(id: string, pinned = false): string {
  const you = st.you;
  const mode: CardCtx['mode'] = haul.open ? 'haul' : st.targets.has(id) ? 'march' : st.squadAt === id ? 'squad' : 'enter';
  return regionCardHtml(id, {
    you, region: st.regions.get(id), seen: sight(id), mine: st.squads.get(id) ?? 0, quota: view?.quota[you ?? 0] ?? 150,
    event: view?.snap.events?.active.find((x) => x.region === id && x.endAt > Date.now()), board: view?.boards?.[id],
    mode: pinned && mode === 'haul' ? 'enter' : mode, pinned, color: colorOf, now: Date.now(),
  });
}

// ---------- M6l haul planner ----------
const haul: { open: boolean; from: string; to: string; kind: HaulKind } = { open: false, from: 'dodona', to: 'ammos', kind: 'wagon' };
const WORLD_SORTED = [...WORLD_IDS].sort((a, b) => Number(MARKET_TOWNS.has(b)) - Number(MARKET_TOWNS.has(a)) || name(a).localeCompare(name(b)));
const RISK = { low: ['clear', 'var(--rf-good)'], watch: ['watch', 'var(--rf-gold)'], high: ['high', 'var(--rf-bad)'], unknown: ['unseen', 'var(--rf-muted)'] } as const;
const chip = (r: keyof typeof RISK) => `<span class="wv-flag" style="color:${RISK[r][1]};margin:0">${RISK[r][0]}</span>`;
function replan(): void {
  st.haul = haul.open ? planHaul(haul.from, haul.to, haul.kind, st.you as 0 | null, st.regions, ownSquadsIn()) : null;
}
function renderHaul(): void {
  replan();
  if (!haul.open) return void (haulEl.style.display = 'none');
  const p = st.haul, opts = (sel: string) => WORLD_SORTED.map((id) => `<option value="${id}"${id === sel ? ' selected' : ''}>${name(id)}${MARKET_TOWNS.has(id) ? ' ◆' : ''}</option>`).join('');
  haulEl.innerHTML = `<div class="rf-head"><span class="rf-name">Haul planner</span><button class="rf-tbtn x" data-act="close" style="margin-left:auto" title="close (H)">×</button></div>
    <div class="wv-kv" style="grid-template-columns:40px 1fr;align-items:center"><span>From</span><select data-k="from">${opts(haul.from)}</select><span>To</span><select data-k="to">${opts(haul.to)}</select></div>
    <div class="rf-segs" style="margin-top:5px">${(['handcart', 'wagon', 'porters'] as const).map((k) => `<button class="rf-tbtn${haul.kind === k ? ' on' : ''}" data-kind="${k}" title="${HAUL_LOADS[k]} loads">${k}</button>`).join('')}</div>
    ${p ? `<div class="wv-kv" style="grid-template-columns:86px 1fr"><span>Travel time</span><span><b class="rf-num">${clock(Math.round(p.ms / 1000))}</b> <span class="rf-dim">${p.legs.length} legs · ${HAUL_LOADS[haul.kind]} loads</span></span>
      <span>Risk</span><span>${chip(p.risk)}</span>
      <span>Chokepoints</span><span>${p.chokepoints.length ? p.chokepoints.map(name).join(', ') : '<span class="rf-dim">none</span>'}</span></div>
      <div style="margin-top:4px;max-height:180px;overflow:auto">${p.legs.map((l) => `<div class="wv-row" style="padding:1px 2px" title="${l.why}"><span style="flex:1">${name(l.to)}${isChokepoint(l.to) ? ' <span class="rf-dim">choke</span>' : ''}</span><span class="rf-num rf-dim">${clock(Math.round(l.ms / 1000))}</span>${chip(l.risk)}</div>`).join('')}</div>
      <div class="rf-dim" style="margin-top:4px">Risk from what your alliance sees now: fights, foe land, chokepoints with ambush spots. Escort the risky legs.</div>`
      : '<div class="rf-dim" style="margin-top:6px">pick two different regions</div>'}`;
  haulEl.style.display = '';
}
function toggleHaul(): void {
  haul.open = !haul.open;
  if (haul.open && st.selected) haul.from = st.selected;
  renderHaul();
  renderBand();
  renderPin();
}
haulEl.addEventListener('change', (e) => {
  const el = e.target as HTMLSelectElement;
  if (el.dataset.k === 'from') haul.from = el.value;
  if (el.dataset.k === 'to') haul.to = el.value;
  renderHaul();
});
haulEl.addEventListener('click', (e) => {
  const t = e.target as HTMLElement, k = t.closest<HTMLElement>('[data-kind]')?.dataset.kind as HaulKind | undefined;
  if (k) (haul.kind = k), renderHaul();
  if (t.closest('[data-act="close"]')) toggleHaul();
});
draggable(haulEl);

function placeCard(): void {
  // the docked card already shows the selected region: no second copy under the pointer
  if (!st.hover || ordering || (st.hover === st.selected && st.hoverSettle == null && !hoverLm && !hoverLord && !hoverMastered && pin.style.display !== 'none')) return void (card.style.display = 'none');
  card.innerHTML = hoverLord ? lordCard(hoverLord) : hoverMastered ? masteredCard(hoverMastered) : st.hoverSettle != null ? settlementCard(st.hoverSettle) : hoverLm ? landmarkCard(hoverLm) : regionCardFor(st.hover);
  card.style.width = hoverLord ? '290px' : hoverMastered ? '260px' : st.hoverSettle != null ? '290px' : hoverLm ? '310px' : '300px';
  card.style.display = '';
  const z = Number(card.style.zoom) || 1, r = card.getBoundingClientRect();
  let x = mouse.x + 18, y = mouse.y + 18;
  if (x + r.width > innerWidth - 4) x = mouse.x - r.width - 18;
  if (y + r.height > innerHeight - 4) y = innerHeight - r.height - 4;
  card.style.left = `${Math.max(4, x) / z}px`;
  card.style.top = `${Math.max(4, y) / z}px`;
}

/** The selected region's card, docked bottom centre (hidden while a transfer is ordered or a haul is planned). */
function renderPin(): void {
  const id = st.selected;
  const show = !!id && !ordering && !haul.open && !!worldRegion(id);
  pin.style.display = show ? '' : 'none';
  seasonEl.style.display = show ? 'none' : '';
  if (!show) return;
  pin.innerHTML = regionCardFor(id, true);
  fitHeight(pin, 8);
}
pin.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
  if (a === 'enter') enter(st.selected);
  if (a === 'close') selectRegion(null);
});

function selectRegion(id: string | null): void {
  st.selected = id;
  st.squadAt = id && st.squads.has(id) ? id : null;
  st.targets = new Set(st.squadAt ? worldRegion(st.squadAt)!.adj : []);
  closeOrder();
  renderSquads();
  renderPin();
  placeCard();
}

function openOrder(to: string): void {
  const from = st.squadAt!, men = st.squads.get(from) ?? 0, r = st.regions.get(to), you = st.you ?? 0;
  const quota = view?.quota[you] ?? 150, there = r?.live[you] ?? 0, seen = sight(to), after = there + men;
  ordering = to;
  const owner = r?.owner ?? -1;
  order.innerHTML = `<div class="rc-hd">${crest(owner, 30, owner >= 0 ? colorOf(owner) : undefined)}<div class="rc-tt"><div class="rf-name rc-name">March to ${name(to)}</div><div class="rc-sub">from ${name(from)} · ${men} men</div></div></div>
    <div class="rc-tiles">
      <div class="rc-tile" data-tip="From the region's exit; men further from it take a little longer"><span class="rc-k">Travel</span><span class="rc-v">${clock(Math.round(travelMs(from, to) / 1000))}</span></div>
      <div class="rc-tile"><span class="rc-k">Held by</span><span class="rc-v">${owner >= 0 ? `<i class="wv-sw" style="background:${colorOf(owner)}"></i>` : ''}${aName(owner)}</span></div>
      <div class="rc-tile"><span class="rc-k">Danger</span><span class="rc-v">${dangerHtml(REGION_DEPTH[to] ?? 1)}</span></div></div>
    ${seen ? `<div class="rc-room"><span>Your alliance after</span><span class="rc-bar"><i style="width:${Math.min(100, Math.round((after / quota) * 100))}%;${after > quota ? 'background:var(--rf-bad)' : ''}"></i></span><b>${after}<span class="dim">/${quota}</span></b></div>
      ${after > quota ? '<div class="rf-hint" style="font-size:13px;margin-top:3px">Full: some men wait in line until there is room.</div>' : ''}` : '<div class="rc-room" style="grid-template-columns:1fr"><span>Hidden: you cannot see how many men stand there.</span></div>'}
    ${r?.contested ? '<div class="rc-tags"><span class="rc-tag bad">Fighting there now</span></div>' : ''}
    <div class="rc-act" style="justify-content:flex-end"><button class="rf-tbtn" data-act="cancel">Cancel<kbd style="margin-left:6px">Esc</kbd></button><button class="rf-tbtn pri big rc-go" data-act="send">March<kbd>⏎</kbd></button></div>`;
  order.style.display = '';
  card.style.display = 'none';
  renderPin();
}
function closeOrder(): void {
  ordering = null;
  order.style.display = 'none';
  renderPin();
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
    if (source.devId) p.set('dev', String(source.devId));
    p.set('team', String(st.you ?? 0));
  } else p.set('offline', '1');
  location.href = `sandbox.html?${p}`;
}

// W-64: crown news (an election, a new monarch, a pact broken) from the world's chat socket, as a toast
worldTaps.add((m) => { if (m.t === 'crownNews') say((m as unknown as { text: string }).text, 8000); });
worldTaps.add((m) => {
  if (m.t !== 'claimAttacked') return;
  const c = m as unknown as { region: string; name: string };
  say(`${worldRegion(c.region)?.name ?? c.name}: your claim point is being taken!`, 10_000);
});

function apply(v: WorldView): void {
  view = v;
  st.regions = new Map(v.snap.regions.map((r: RegionState) => [r.id, r]));
  st.transit = v.snap.transit;
  st.squads = new Map(v.squads.map((s) => [s.region, s.men]));
  st.you = v.snap.you.alliance;
  st.convoys = (v.convoys ?? []).filter((c) => convoySeen(c, st.you as 0 | null, st.regions, ownSquadsIn()));
  st.emblems = emblems(v.titles ?? []);
  st.events = v.snap.events?.active ?? [];
  st.crown = v.snap.crown; // W-64: monarchs and pacts
  if (haul.open) renderHaul();
  if (st.squadAt && !st.squads.has(st.squadAt)) selectRegion(st.selected);
  renderBand();
  renderSquads();
  renderSeason();
  renderEvents();
  renderBoard();
  renderLegend();
  renderPin();
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
  hoverLm = map.landmarkAt(st, ...map.toMap(e.clientX, e.clientY));
  st.hover = map.eventAt(st, ...map.toMap(e.clientX, e.clientY)) ?? st.hover;
  st.hoverSettle = map.settlementAt(st, ...map.toMap(e.clientX, e.clientY)); // W-63: a settlement's card wins
  hoverLord = map.lordAt(st, ...map.toMap(e.clientX, e.clientY))?.id ?? null; // W-72, W-73: a pennant's or a star's card wins
  hoverMastered = hoverLord ? null : map.masteryAt(st, ...map.toMap(e.clientX, e.clientY));
  canvas.style.cursor = st.hover ? 'pointer' : 'default';
  placeCard();
});
canvas.addEventListener('pointerleave', () => { st.hover = null; placeCard(); });
canvas.addEventListener('pointerup', (e) => {
  const click = down && !down.moved;
  down = null;
  if (!click) return;
  if (e.button === 1) { const [x, y] = map.toMap(e.clientX, e.clientY); return pins?.click(e.clientX, e.clientY, { x, y }, e.shiftKey); }
  const id = map.regionAt(...map.toMap(e.clientX, e.clientY));
  if (haul.open && id) { if (e.shiftKey) haul.from = id; else haul.to = id; renderHaul(); return; }
  if (id && st.targets.has(id)) openOrder(id);
  else selectRegion(id);
});
canvas.addEventListener('dblclick', (e) => enter(map.regionAt(...map.toMap(e.clientX, e.clientY))));
canvas.addEventListener('wheel', (e) => { e.preventDefault(); map.zoom(e.deltaY > 0 ? 1 / 1.15 : 1.15, e.clientX, e.clientY); placeCard(); }, { passive: false });
// Esc with nothing selected or open: the in-game menu; F10: settings (src/war/menu)
mountGameMenu({ idle: () => !ordering && !st.selected && !haul.open && !boardOpen && !legendOpen && !chatBusy() });
keys.setContexts(() => ['world', 'global']);
addEventListener('keydown', (e: KeyboardEvent) => {
  const a = keys.act(e);
  if (a === 'back' && boardOpen) return void toggleBoard();
  if (a === 'back' && legendOpen && !ordering && !st.selected) return void toggleLegend();
  // W-62 E6: Enter with nothing to enter opens the alliance chat
  if (a === 'world.enter') ordering ? void sendOrder() : st.hover ?? st.selected ? enter(st.hover ?? st.selected) : chat?.open();
  else if (a === 'back') ordering ? closeOrder() : selectRegion(null);
  else if (a === 'world.routes') (st.routes = !st.routes), renderBand();
  else if (a === 'world.haul') toggleHaul();
  else if (!a && e.key.toLowerCase() === 'b' && !e.ctrlKey && !e.metaKey && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)) toggleBoard();
  else if (!a && e.key.toLowerCase() === 'l' && !e.ctrlKey && !e.metaKey && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement)) toggleLegend();
  else if (a === 'world.fit') fit();
  else if (a === 'world.zoomIn') map.zoom(1.2, innerWidth / 2, innerHeight / 2);
  else if (a === 'world.zoomOut') map.zoom(1 / 1.2, innerWidth / 2, innerHeight / 2);
});
addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- start ----------
void WorldMap.load(canvas).then(async (m) => {
  map = m;
  fit();
  addEventListener('resize', () => fit());
  renderBand();
  renderLegend();
  chat = mountWorldChat(m);
  pins = mountWorldPins(m);
  const frame = () => { st.now = Date.now(); map.draw(st); requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
  setInterval(() => { renderSquads(); renderSeason(); renderEvents(); renderPin(); }, 1000);
  // W-63: the world's settlements (markers and fealty lines), again every minute online
  const settlements = async () => {
    if (source.mode === 'offline') return void ((st.settlements = MOCK_SETTLEMENTS), (st.me = 1));
    const auth = await warAuth(source.devId).catch(() => null);
    const r = await fetch('/api/war/settlements', { headers: auth?.headers ?? {} }).catch(() => null);
    const j = r?.ok ? ((await r.json()) as { settlements?: MapState['settlements'] }) : null;
    if (j?.settlements) st.settlements = j.settlements;
    if (auth) st.me = auth.pid;
  };
  void settlements();
  setInterval(() => void settlements(), 60_000);
  // W-73: the regions the player mastered this season (a star each), again every minute online
  const mastered = async () => {
    if (source.mode === 'offline') return void (st.mastered = new Set(MOCK_MASTERED));
    const auth = await warAuth(source.devId).catch(() => null);
    const r = await fetch('/api/war/mastery', { headers: auth?.headers ?? {} }).catch(() => null);
    const j = r?.ok ? ((await r.json()) as { mastered?: string[] }) : null;
    if (j?.mastered) st.mastered = new Set(j.mastered);
  };
  void mastered();
  setInterval(() => void mastered(), 60_000);
  try {
    await source.start(apply);
  } catch (e) {
    say(String((e as Error).message), 60_000);
    band.querySelector('#wvStatus')!.textContent = 'offline: no server';
  }
  if (source.mode === 'net') watchTunnel();
  // the region view's events card (Show on map, ../view/hud/worldEvents.ts): ?focus=<region> centred and selected
  const focus = q.get('focus'), fc = focus ? m.art.regions[focus]?.centroid : null;
  if (focus && fc && worldRegion(focus)) {
    (m.x = fc[0] - canvas.clientWidth / 2 / m.k), (m.y = fc[1] - canvas.clientHeight / 2 / m.k);
    selectRegion(focus);
  }
  (window as unknown as { __world: unknown }).__world = { st, map, source, haul: (from: string, to: string, kind: HaulKind = 'wagon') => { Object.assign(haul, { open: true, from, to, kind }); renderHaul(); renderBand(); }, select: selectRegion, order: openOrder, hover: (id: string | null, x = 0, y = 0, lm = false) => { st.hover = id; hoverLm = lm ? id : null; mouse = { x, y }; placeCard(); } };
});

// ---------- W-66 his army destroyed (../view/hud/wipeCard.ts): the card over the map, home to watch the tunnel ----------
function watchTunnel(): void {
  const homeOf = () => (st.you !== null ? ALLIANCES[st.you]?.home : undefined);
  const el = document.createElement('div');
  el.id = 'rfWipe';
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  document.body.appendChild(el);
  const wipe = wipeCard(el, worldRegion(homeOf() ?? '')?.name ?? 'your home town', () => enter(homeOf() ?? null));
  let t: WipeState | null = null, shown = false;
  const pull = async () => {
    const auth = await warAuth(source.devId).catch(() => null);
    const r = await fetch('/api/war/tunnel', { headers: auth?.headers ?? {} }).catch(() => null);
    if (r?.ok) t = await r.json();
    const dead = !!t && wiped(t); // no man he can field (the rest dead, wounded or captive)
    if (dead && !shown) (shown = true), wipe.show(true);
    if (!dead) (shown = false), wipe.show(false);
  };
  void pull();
  setInterval(() => void pull(), 10_000);
  setInterval(() => wipe.set(t, Date.now()), 500);
}

// ---------- personal markers (../view/hud/pins.ts): a middle click, this player only; in map px ----------
let pins: PinHandle | null = null;
function mountWorldPins(m: WorldMap): PinHandle {
  return mountPins({
    project: (p) => { const r = canvas.getBoundingClientRect(), [x, y] = m.toScreen(p.x, p.y); return { x: x + r.left, y: y + r.top }; },
    area: () => ({ x0: 24, y0: 64, x1: innerWidth - 24, y1: innerHeight - 24 }),
    focus: (p) => void ((m.x = p.x - canvas.clientWidth / 2 / m.k), (m.y = p.y - canvas.clientHeight / 2 / m.k)),
    far: () => '',
  });
}

// ---------- W-62 E6 alliance chat (../view/hud/chat.ts): above the events card; world marks in map px ----------
let chat: ChatHandle | null = null;
function mountWorldChat(m: WorldMap): ChatHandle {
  const link = !offline ? new NetChat(Number(q.get('dev')) || null) : q.has('chat') ? new MockChat() : new OfflineChat();
  const at = (c: { at: string; x: number; y: number }): [number, number] | null => (c.at === 'world' ? [c.x, c.y] : m.art.regions[c.at]?.centroid ?? null);
  const h = mountChat({
    link,
    scope: 'world',
    zoom,
    place: (el) => {
      const r = eventsEl.getBoundingClientRect(), z = zoom();
      el.style.left = '8px';
      el.style.bottom = `${eventsEl.offsetHeight ? (innerHeight - r.top + 6) / z : 12}px`;
    },
    project: (c) => {
      const p = at(c), r = canvas.getBoundingClientRect();
      if (!p) return null;
      const [x, y] = m.toScreen(p[0], p[1]);
      return { x: x + r.left, y: y + r.top };
    },
    pick: (x, y) => { const r = canvas.getBoundingClientRect(), [mx, my] = m.toMap(x - r.left, y - r.top); return { x: mx, y: my }; },
    focus: (c) => { const p = at(c); if (p) (m.x = p[0] - canvas.clientWidth / 2 / m.k), (m.y = p[1] - canvas.clientHeight / 2 / m.k); },
    where: (id) => (id === 'world' ? 'World map' : name(id)),
  });
  (window as unknown as { __chat: unknown }).__chat = link;
  return h;
}
