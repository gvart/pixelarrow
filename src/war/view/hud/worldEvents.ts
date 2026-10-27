/**
 * W-62 world events in a region (src/war/world/events.ts): the region server tells every client the events running
 * anywhere and the next (`worldEvents`, on join and whenever one opens or closes). A small card at the top left names
 * the running one (here first) or the next one to come, in plain words (./explain.ts): what it is, what to do, and
 * "starts in" / "ends in"; its tooltip holds the full rule and reward, and a click (or its Show on map link) opens the
 * world map with that region selected. An event that opens while you play shows as a short note too (the roster's
 * toasts). The card stacks under the first-hour tracker (./guide.ts) and gives way to a left panel (forge, market,
 * roster, memorial) and to the open alliance chat (./chat.ts) below it.
 */
import type { ServerMsg } from '../../net/protocol';
import { EVENT_INFO, type WorldEvent } from '../../world/events';
import { worldRegion } from '../../world/graph';
import { EVENT_LOOK, eventIcon } from '../../world-view/eventLook';
import type { SandboxScene } from '../SandboxScene';
import { sandboxRoster } from './roster/state';
import { tipper } from './roster/ui';
import { leftPanelOpen } from './kit';
import { eventHelp, eventWhen } from './explain';

type Mk = (id: string, css: string, html?: string) => HTMLElement;

const clock = (ms: number) => {
  const t = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60, p = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
};

/** The toast for an event that opens: its name, where and how long (the rule is on the card). */
export const eventNote = (e: WorldEvent, where: string, now = Date.now()) => `${EVENT_INFO[e.kind].name} ${where === 'here' ? 'here' : `in ${where}`} · ${clock(e.endAt - now)}`;

/** The world map's page (as the HUD's World button opens it), with `focus` selected and centred there. */
export function worldHref(focus?: string): string {
  const q = new URLSearchParams(location.search), w = new URLSearchParams();
  if (q.has('net')) { if (q.get('dev')) w.set('dev', q.get('dev')!); } else w.set('offline', '1');
  if (focus) w.set('focus', focus);
  return `world.html?${w}`;
}

/** The card's inner HTML for event e (`mine`: it is in this region; `soon`: it has not started). */
export function eventCardHtml(e: WorldEvent, where: string, mine: boolean, now: number): string {
  const h = eventHelp(e), c = EVENT_LOOK[e.kind].color, soon = e.startAt > now, name = worldRegion(e.region)?.name ?? e.region;
  const tip = `<b>${EVENT_INFO[e.kind].name}</b> · ${esc(name)}<div style="margin-top:3px">${esc(h.rule)}</div><div class="rf-dim" style="margin-top:3px">World events come about every 3 h, somewhere on the map. Click the card to see this one on the world map.</div>`;
  return `<div data-tip="${attr(tip)}" style="display:flex;gap:7px;align-items:flex-start;cursor:pointer">${eventIcon(e.kind, 22)}<div style="min-width:0;flex:1">
    <div style="display:flex;gap:6px;align-items:baseline"><b style="color:${c}">${soon ? 'Next: ' : ''}${EVENT_INFO[e.kind].name}</b><span class="rf-dim" style="font-size:12px">${mine ? 'here' : esc(where)}</span></div>
    <div style="font-size:12px;line-height:1.35">${esc(cap(h.what))}.</div>
    <div style="font-size:12px;line-height:1.35;color:var(--rf-gold)">${soon ? 'When it starts: ' : ''}${esc(h.todo)}.</div>
    <div style="display:flex;align-items:baseline;gap:8px;margin-top:2px;font-size:12px"><span class="rf-num" data-clock>${eventWhen(e, now)}</span><span data-act="map" style="margin-left:auto;color:var(--rf-title);text-decoration:underline">Show on map</span></div></div></div>`;
}

export function mountWorldEvents(s: SandboxScene, mk: Mk): void {
  const el = mk('rfWorldEv', 'top:4px;left:4px;width:264px;display:none;pointer-events:auto;padding:5px 8px');
  el.className = 'rf rf-card';
  const tip = mk('rfWorldEvTip', 'display:none;z-index:7;width:300px;white-space:normal;line-height:1.35');
  tip.className = 'rf rf-tip';
  let events: WorldEvent[] = [], next: WorldEvent | null = null;
  const seen = new Set<string>();
  const here = () => s.region?.id;
  const where = (e: WorldEvent) => (e.region === here() ? 'here' : worldRegion(e.region)?.name ?? e.region);

  // built anew only when what it tells changes (the tooltip keeps its anchor); the clock ticks in place
  let key = '', has = false;
  const render = () => {
    const now = Date.now(), run = events.filter((e) => e.endAt > now).sort((a, b) => Number(b.region === here()) - Number(a.region === here()));
    const e = run[0] ?? (next && next.startAt > now ? next : null);
    has = !!e;
    if (e) {
      const k = `${e.kind}:${e.region}:${e.startAt}:${e.startAt > now}`;
      if (k !== key) {
        key = k;
        el.style.borderLeft = `3px solid ${EVENT_LOOK[e.kind].color}`;
        el.dataset.region = e.region;
        el.innerHTML = eventCardHtml(e, where(e), e.region === here(), now);
      } else {
        const t = el.querySelector<HTMLElement>('[data-clock]');
        if (t) t.textContent = eventWhen(e, now);
      }
    }
    place();
  };
  /** Shown while there is an event to tell, under the quest tracker while it shows (both top left), else in the corner. */
  const place = () => {
    el.style.display = has && !leftPanelOpen() && !document.querySelector('#rfChat.open') ? '' : 'none';
    if (el.style.display === 'none') tip.style.display = 'none';
    const g = document.getElementById('rfGuide'), z = Number(el.style.zoom) || 1;
    el.style.top = g && g.style.display !== 'none' ? `${Math.round(g.getBoundingClientRect().bottom / z + 6)}px` : '4px';
  };

  const onServer = (m: ServerMsg) => {
    if (m.t !== 'worldEvents') return;
    const first = !events.length && !seen.size;
    events = m.events;
    next = m.next;
    for (const e of m.events) {
      const k = `${e.kind}:${e.startAt}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (!first || e.region === here()) sandboxRoster(s).onNote?.({ kind: 'info', text: eventNote(e, where(e)) });
    }
    render();
  };

  // a click (or its Show on map link): the world map, that region selected and centred
  el.addEventListener('click', () => { if (el.dataset.region) location.href = worldHref(el.dataset.region); });
  tipper(el, tip);
  s.sim.serverTaps.add(onServer);
  setInterval(render, 1000);
  setInterval(place, 200);
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (t: string) => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
