/**
 * W-62 E6: the alliance chat in a region view (./chat.ts), above the minimap (above the map mode's legend while it
 * shows). Live regions (?net) follow the world's chat socket; a region opened offline from the world map (?world, or
 * ?chat=1 anywhere) gets the mock alliance. Marks here are this region's tile points.
 */
import { MockChat, NetChat } from '../../net/chatLink';
import { worldRegion } from '../../world/graph';
import type { SandboxScene } from '../SandboxScene';
import { mountChat } from './chat';
import { uiZoom } from './kit';

/** Above the round minimap (168 px at the bottom left). */
const ABOVE_MINI = 184;

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
    place: (el) => {
      const lg = document.getElementById('rfLegend');
      const up = lg && lg.offsetHeight > 0 && getComputedStyle(lg).opacity !== '0' && getComputedStyle(lg).display !== 'none';
      el.style.left = '4px';
      el.style.bottom = `${up ? Math.max(ABOVE_MINI, (innerHeight - lg.getBoundingClientRect().top + 4) / uiZoom()) : ABOVE_MINI}px`;
    },
    project: (m) => {
      if (m.at !== id) return null;
      const p = s.toScreen(m.x, m.y), r = canvas();
      return { x: p.x + r.left, y: p.y + r.top };
    },
    pick: (x, y) => { const r = canvas(); return s.tileAt({ x: x - r.left, y: y - r.top }); },
    focus: (m) => { if (m.at === id) s.focus(m.x, m.y); },
    where: (at) => (at === 'world' ? 'World map' : at === id ? 'here' : worldRegion(at)?.name ?? at),
  });
  (window as unknown as { __chat: unknown }).__chat = link;
}
