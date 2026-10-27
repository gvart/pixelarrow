/**
 * W-62 world events in a region (src/war/world/events.ts): the region server tells every client the events running
 * anywhere and the next (`worldEvents`, on join and whenever one opens or closes). A small card at the top left names
 * the running one (here: "here", with its rule; elsewhere: where) with its countdown, or the next one to come; an event
 * that opens while you play shows as a note too (the roster's toasts).
 */
import type { ServerMsg } from '../../net/protocol';
import { EVENT_INFO, type WorldEvent } from '../../world/events';
import { worldRegion } from '../../world/graph';
import { EVENT_LOOK, eventIcon } from '../../world-view/eventLook';
import type { SandboxScene } from '../SandboxScene';
import { sandboxRoster } from './roster/state';

type Mk = (id: string, css: string, html?: string) => HTMLElement;

const clock = (ms: number) => {
  const t = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60, p = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
};

export function mountWorldEvents(s: SandboxScene, mk: Mk): void {
  const el = mk('rfWorldEv', 'top:4px;left:4px;max-width:260px;display:none;pointer-events:auto;padding:5px 8px');
  el.className = 'rf rf-card';
  let events: WorldEvent[] = [], next: WorldEvent | null = null;
  const seen = new Set<string>();
  const here = () => s.region?.id;
  const where = (e: WorldEvent) => (e.region === here() ? 'here' : worldRegion(e.region)?.name ?? e.region);

  const render = () => {
    const now = Date.now(), run = events.filter((e) => e.endAt > now).sort((a, b) => Number(b.region === here()) - Number(a.region === here()));
    const e = run[0];
    if (e) {
      const mine = e.region === here();
      el.style.borderLeft = `3px solid ${EVENT_LOOK[e.kind].color}`;
      el.innerHTML = `<div style="display:flex;gap:7px;align-items:flex-start">${eventIcon(e.kind, 22)}<div style="min-width:0">
        <div style="display:flex;gap:8px;align-items:baseline"><b style="color:${EVENT_LOOK[e.kind].color}">${EVENT_INFO[e.kind].name}</b><span class="rf-num" style="margin-left:auto">${clock(e.endAt - now)}</span></div>
        <div style="font-size:12px">${mine ? `${esc(worldRegion(e.region)?.name ?? e.region)} <span class="rf-dim">· here</span>` : esc(where(e))}</div>
        ${mine ? `<div class="rf-dim" style="font-size:11px;line-height:1.35">${EVENT_INFO[e.kind].rule}</div>` : ''}</div></div>`;
    } else if (next && next.startAt > now) {
      el.style.borderLeft = '';
      el.innerHTML = `<div style="display:flex;gap:6px;align-items:center;font-size:12px">${eventIcon(next.kind, 16)}<span class="rf-dim">Next:</span>${EVENT_INFO[next.kind].name} · ${esc(where(next))}<span class="rf-num" style="margin-left:6px">${clock(next.startAt - now)}</span></div>`;
    }
    el.style.display = e || (next && next.startAt > now) ? '' : 'none';
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
      if (!first || e.region === here()) sandboxRoster(s).onNote?.({ kind: 'info', text: `${EVENT_INFO[e.kind].name} ${e.region === here() ? 'here' : `in ${where(e)}`} for ${clock(e.endAt - Date.now())}: ${EVENT_INFO[e.kind].rule}` });
    }
    render();
  };

  s.sim.serverTaps.add(onServer);
  setInterval(render, 1000);
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
