/**
 * E3 the memorial panel: the home memorial statue selected (../../memorial.ts), the list of the player's fallen, each with
 * his class, level, kills, battles, deeds and where he fell, newest first, and the trophies of the guardians his men
 * slew. Also the panel `__memorial.open()` shows for scripts.
 */
import type { SandboxScene } from '../../SandboxScene';
import { memorialStatue, mountMemorialLayer } from '../../memorial';
import { draggable } from '../drag';
import { glyph } from '../glyph';
import { card } from '../codex';
import { deedIcon } from './card';
import { SandboxRoster } from './state';
import { esc } from './ui';

type Mk = (id: string, css: string, html?: string) => HTMLElement;
export const MEMORIAL_W = 300;
const tip = (html: string) => `data-tip="${esc(html)}"`;

function html(R: SandboxRoster): string {
  const graves = R.memorial(), trophies = R.trophies();
  const rows = graves.map((g) => {
    const h = g.p.hero, deeds = (g.p.deeds ?? []).map((d) => `<span class="rr-hon deed" ${tip(card({ icon: deedIcon(d.id), name: esc(d.name), kind: 'deed', w: 180 }))}>${glyph(deedIcon(d.id), 13)}${esc(d.name)}</span>`).join('');
    const honour = g.p.honours?.[0]?.name;
    return `<div class="mm-grave">
      <div class="mm-top">${glyph('ui:skull', 14)}<b>${esc(h.name)}</b><span class="rf-dim">${SandboxRoster.className(h.cls)} · level ${h.level}</span></div>
      <div class="mm-rec"><span>${glyph('ui:sword', 13)}${h.kills} kills</span><span>${glyph('ui:swords', 13)}${h.battles} battles</span><span class="rf-dim">fell in ${esc(g.region)}</span></div>
      ${honour || deeds ? `<div class="mm-deeds">${honour ? `<span class="rr-hon">${glyph('ui:laurel', 13)}${esc(honour)}</span>` : ''}${deeds}</div>` : ''}
    </div>`;
  }).join('');
  const tr = trophies.map((t) => `<div class="mm-trophy">${glyph('ui:trophy', 16)}<span>${esc(t.name.replace(/^./, (c) => c.toUpperCase()))}</span><span class="rf-dim">${esc(t.region)}</span></div>`).join('');
  return `<div class="rf-card rr-card">
    <div class="rf-head">${glyph('ui:laurel', 18)}<span class="rf-name" style="font-size:16px">The Memorial</span><span style="flex:1"></span><button class="rf-tbtn x" data-act="closeMem" data-tip="close">✕</button></div>
    <div class="rf-dim" style="margin:2px 0 6px">${graves.length ? `${graves.length} fallen lie here. A grave stands for each before the statue.` : 'No man of yours has fallen yet.'}</div>
    <div class="mm-list">${rows}</div>
    ${tr ? `<div class="rf-cap rr-cap">Trophies</div>${tr}` : ''}
  </div>`;
}

const CSS = `
.mm-list{display:flex;flex-direction:column;gap:5px;max-height:340px;overflow-y:auto}
.mm-grave{border:1px solid var(--rf-line);background:var(--rf-raised);padding:5px 6px}
.mm-top{display:flex;align-items:center;gap:5px;font:600 13px/1.2 Inter,sans-serif}
.mm-top .rf-dim{margin-left:auto;font-weight:400;font-size:11px}
.mm-rec{display:flex;gap:10px;align-items:center;margin-top:3px;font:12px/1.2 Inter,sans-serif}
.mm-rec span{display:inline-flex;align-items:center;gap:3px}
.mm-rec .rf-dim{margin-left:auto;font-size:11px}
.mm-deeds{display:flex;flex-wrap:wrap;gap:3px;margin-top:4px}
.mm-trophy{display:flex;align-items:center;gap:6px;padding:3px 0;font:600 12px/1.2 Inter,sans-serif;color:var(--rf-gold)}
.mm-trophy .rf-dim{margin-left:auto;font-weight:400}
`;

/** Mount the memorial: the graves and trophies on the map, the panel while the memorial statue is selected. */
export function mountMemorial(s: SandboxScene, mk: Mk, R: SandboxRoster): void {
  mountMemorialLayer(s, { graves: () => R.memorial().length, trophies: () => R.trophies() });
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const el = mk('mmPanel', `top:50px;left:4px;width:${MEMORIAL_W}px;display:none;pointer-events:auto`);
  draggable(el);
  let forced = false, closed = -1, last = '';
  const render = () => {
    const m = memorialStatue(s), b = s.build.selectedBuilding();
    const on = forced || (!!m && b?.id === m.id && closed !== m.id);
    if (b?.id !== m?.id) closed = -1; // a new selection of it opens it again
    el.style.display = on ? '' : 'none';
    if (!on) return;
    const h = html(R);
    if (h !== last) el.innerHTML = last = h;
  };
  el.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-act="closeMem"]')) {
      forced = false;
      closed = memorialStatue(s)?.id ?? -1;
      render();
    }
  });
  el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
  setInterval(render, 250);
  (window as unknown as { __memorial: unknown }).__memorial = { open: (v = true) => { forced = v; render(); } };
}
