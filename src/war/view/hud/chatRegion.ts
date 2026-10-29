/**
 * W-62 E6: the alliance chat in a region view (./chat.ts), above the minimap (above the map mode's legend while it
 * shows). Live regions (?net) follow the world's chat socket; a region opened offline from the world map (?world, or
 * ?chat=1 anywhere) gets the mock alliance. Marks here are this region's tile points. W-69: a Shift+click links a man
 * from his roster row, his squad pip or the docked man card (items carry their own `data-chat-link`).
 */
import { MockChat, NetChat } from '../../net/chatLink';
import { manLink } from '../../net/chatLinks';
import { worldRegion } from '../../world/graph';
import type { SandboxScene } from '../SandboxScene';
import { mountChat } from './chat';
import { uiZoom } from './kit';
import { GAP, TOP } from './layout';
import { sandboxRoster } from './roster/state';
import { portrait, PORTRAIT_H, PORTRAIT_W, scarMarks } from './roster/portrait';

/** The guide's folded header (./guide.ts): the open chat leaves it room. */
const GUIDE_HEAD = 34;
/** The open log's height: 164 px, less on a short window so the panel stays under the top-left cards; at least 72. */
export const LOG_H = 164, LOG_MIN = 72;
/** The log height that keeps the open panel's top `gap` below `above` (CSS px), given its rect now and its log's height. */
export const chatLogFit = (top: number, z: number, logH: number, above: number, gap = 6) =>
  Math.round(Math.max(LOG_MIN, Math.min(LOG_H, logH - (above + gap - top) / z)));

export function mountRegionChat(s: SandboxScene): void {
  const q = new URLSearchParams(location.search);
  if (!q.has('net') && !q.has('world') && !q.has('chat')) return;
  const link = q.has('net') ? new NetChat(Number(q.get('dev')) || null) : new MockChat();
  const id = s.region.id;
  const canvas = () => s.game.canvas.getBoundingClientRect();
  mountChat({
    link,
    scope: id,
    zoom: uiZoom,
    // the HUD layout stacks it over the minimap and the legend (./layout.ts); open on a short window, the log gives
    // up height rather than run over the guide's header (the top-left column folds to make room)
    place: (el, open) => {
      el.style.left = '4px';
      if (!open) return;
      const z = uiZoom(), above = (TOP + GUIDE_HEAD + GAP) * z;
      el.style.setProperty('--ch-log-h', `${chatLogFit(el.getBoundingClientRect().top, z, parseFloat(el.style.getPropertyValue('--ch-log-h')) || LOG_H, above)}px`);
    },
    project: (m) => {
      if (m.at !== id) return null;
      const p = s.toScreen(m.x, m.y), r = canvas();
      return { x: p.x + r.left, y: p.y + r.top };
    },
    pick: (x, y) => { const r = canvas(); return s.tileAt({ x: x - r.left, y: y - r.top }); },
    focus: (m) => { if (m.at === id) s.focus(m.x, m.y); },
    where: (at) => (at === 'world' ? 'World map' : at === id ? 'here' : worldRegion(at)?.name ?? at),
    linkAt: (el) => {
      const unit = (uid: number) => s.sim.cur?.units.find((u) => u.id === uid)?.pid;
      const pip = el.closest<HTMLElement>('.hud-pip[data-uid]')?.dataset.uid;
      const pid = el.closest<HTMLElement>('.rr-row[data-pid]')?.dataset.pid
        ?? (pip !== undefined ? unit(Number(pip)) : undefined)
        ?? (el.closest('#rfManCard') && s.micro.picked ? s.micro.picked.u.pid : undefined);
      const p = pid !== undefined ? sandboxRoster(s).roster.get(pid) : undefined;
      return p ? manLink(p) : null;
    },
    portrait: (c, cls, scars) => {
      const img = portrait(s, cls);
      if (!img) return;
      const g = c.getContext('2d')!;
      g.imageSmoothingEnabled = false;
      g.drawImage(img, 0, 0, PORTRAIT_W * 2, PORTRAIT_H * 2);
      scarMarks(g, scars);
    },
  });
  (window as unknown as { __chat: unknown }).__chat = link;
}
