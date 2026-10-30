/**
 * W-62 world events in a region (src/war/world/events.ts): the region server tells every client the events running
 * anywhere and the next (`worldEvents`, on join and whenever one opens or closes). A small card at the top left names
 * the running one (here first) or the next one to come, in plain words (./explain.ts): what it is, what to do, and
 * "starts in" / "ends in" as chips (./qcard.ts); its details fold holds the full rule, and a click (or Show on map) opens the
 * world map with that region selected. An event that opens while you play shows as a short note too (the roster's
 * toasts). The card stacks under the first-hour tracker (./guide.ts) and gives way to a left panel (forge, market,
 * roster, memorial) and to the open alliance chat (./chat.ts) below it.
 */
import type { ServerMsg } from '../../net/protocol';
import { EVENT_INFO, type WorldEvent, type WorldEventKind } from '../../world/events';
import { worldRegion } from '../../world/graph';
import { EVENT_LOOK, eventIcon } from '../../world-view/eventLook';
import type { SandboxScene } from '../SandboxScene';
import { sandboxRoster } from './roster/state';
import { icon } from './kit';
import { chip, details, qcard } from './qcard';
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

/** The timer chip's text: the clock while it runs ("8:29"), "in 1:00:57" before it starts. */
const when = (e: WorldEvent, now: number) => (e.startAt > now ? `in ${clock(e.startAt - now)}` : clock(e.endAt - now));

/** What an event pays, as a chip. */
const GAIN: Record<WorldEventKind, (t: string) => string> = {
  soulStorm: (t) => chip.any(icon('unit-hoplite'), t, 'good', 'Souls to claim: new men'),
  bossWake: (t) => chip.any(icon('trade-pile'), t, 'gold', 'Its rare goods drop more times over'),
  caravanRush: (t) => chip.score(t),
  landmarkSiege: (t) => chip.score(t),
};

/** The event's toast: its icon, the short goal, where and how long. */
export const eventToast = (e: WorldEvent, where: string, now = Date.now()) =>
  ({ kind: 'info' as const, icon: eventIcon(e.kind, 22), text: eventHelp(e).goal, chips: chip.where(where === 'here' ? 'here' : where) + chip.time(clock(e.endAt - now)) });

/** The card's inner HTML for event e (`mine`: it is in this region; `soon`: it has not started): the compact card
 * (./qcard.ts), the event's name over its goal, the timer, place and gain as chips, Show on map; the rest in details. */
export function eventCardHtml(e: WorldEvent, where: string, mine: boolean, now: number): string {
  const h = eventHelp(e), soon = e.startAt > now, name = worldRegion(e.region)?.name ?? e.region;
  return qcard({
    key: `event:${e.kind}`, icon: eventIcon(e.kind, 24), kind: `${soon ? 'Next · ' : ''}${EVENT_INFO[e.kind].name}`, tone: EVENT_LOOK[e.kind].color, goal: h.goal,
    chips: `<span data-clock style="display:contents">${chip.time(when(e, now), '', eventWhen(e, now))}</span>${chip.where(mine ? 'here' : where)}${GAIN[e.kind](h.gain)}`,
    cta: '<button class="rf-tbtn" data-act="map">Show on map</button>',
    more: details({ title: `${EVENT_INFO[e.kind].name} · ${name}`, story: `${cap(h.what)}.`, lines: [[soon ? 'When it starts' : 'To do', `${h.todo}.`], ['Rule', h.rule]], from: 'World events come about every 3 h, somewhere on the map.' }),
  });
}

export function mountWorldEvents(s: SandboxScene, mk: Mk): void {
  const el = mk('rfWorldEv', 'top:4px;left:4px;width:264px;display:none;pointer-events:auto;padding:5px 8px');
  el.className = 'rf rf-card';
  let events: WorldEvent[] = [], next: WorldEvent | null = null;
  const seen = new Set<string>();
  let heard = false;
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
        const t = el.querySelector<HTMLElement>('[data-clock] span span');
        if (t) t.textContent = when(e, now);
      }
    }
    place();
  };
  /** Shown while there is an event to tell; the HUD layout puts it under the guide (./layout.ts). */
  const place = () => {
    el.style.display = has ? '' : 'none';
  };

  const onServer = (m: ServerMsg) => {
    if (m.t !== 'worldEvents') return;
    // the first word on joining: only the events here are news (later, any event that opens is)
    const first = !heard;
    heard = true;
    events = m.events;
    next = m.next;
    for (const e of m.events) {
      const k = `${e.kind}:${e.startAt}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (!first || e.region === here()) sandboxRoster(s).onNote?.(eventToast(e, where(e)));
    }
    render();
  };

  // a click (or its Show on map link): the world map, that region selected and centred
  el.addEventListener('click', () => { if (el.dataset.region) location.href = worldHref(el.dataset.region); });
  s.sim.serverTaps.add(onServer);
  setInterval(render, 1000);
  setInterval(place, 200);
}

const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
