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
import { sandboxRoster } from './roster/state';
import { portrait, PORTRAIT_H, PORTRAIT_W, scarMarks } from './roster/portrait';

export { chatLogFit, LOG_H, LOG_MIN } from './layout';

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
    // the HUD layout places it (./layout.ts): over the minimap and the legend, or beside a left window; open, it fits
    // the log to the room
    place: () => {},
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
