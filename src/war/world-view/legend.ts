/**
 * The world map's key (./main.ts, L): what the colours, lines and markers drawn by ./map.ts mean, each beside a small
 * copy of its look (inline SVG for the lines and washes, the map's own icons for the markers).
 */
import { ALLIANCES } from '../world/alliances';
import { EVENT_LOOK, eventIcon } from './eventLook';

const svgLine = (stroke: string, dash = '', width = 3.5, extra = '') => `<svg width="34" height="14" viewBox="0 0 34 14" aria-hidden="true"><line x1="2" y1="7" x2="32" y2="7" stroke="rgba(14,9,7,.8)" stroke-width="${width + 3}" stroke-linecap="round"/><line x1="2" y1="7" x2="32" y2="7" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>${extra}</svg>`;
const wash = (fill: string, edge: string, hatch = '') => `<svg width="34" height="18" viewBox="0 0 34 18" aria-hidden="true">${hatch ? `<defs><pattern id="h${hatch.replace(/\W/g, '')}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="${fill}"/><line x1="0" y1="0" x2="0" y2="6" stroke="${hatch}" stroke-width="2.5"/></pattern></defs>` : ''}<rect x="1" y="1" width="32" height="16" fill="${hatch ? `url(#h${hatch.replace(/\W/g, '')})` : fill}" stroke="${edge}" stroke-width="2"/></svg>`;
const disc = (inner: string, ring: string, bg = '#17100d') => `<span class="lg-disc" style="--r:${ring};--b:${bg}">${inner}</span>`;
const img = (src: string, w = 18, h = 18) => `<img src="${src}" width="${w}" height="${h}" alt="">`;
const crown = `<svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true"><path d="M1 12V3l4 4 3-6 3 6 4-4v9z" fill="#e0b867" stroke="#6b4a14" stroke-width="1.2"/></svg>`;

const row = (look: string, text: string, sub = '') => `<div class="lg-row"><span class="lg-look">${look}</span><span>${text}${sub ? `<span class="lg-sub">${sub}</span>` : ''}</span></div>`;

/** The key's HTML; `color(a)` is an alliance's map colour, `you` the player's alliance (null: none). */
export function legendHtml(color: (a: number) => string, you: number | null): string {
  const hexA = (h: string, a: number) => `rgba(${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)},${a})`;
  const land = ALLIANCES.map((a) => row(wash(hexA(color(a.id), 0.45), color(a.id)), `${a.name}${a.id === you ? ' <span class="lg-you">you</span>' : ''}`)).join('');
  return `<div class="rf-head"><span class="rf-name">Map key</span><button class="rf-tbtn x" data-act="close" style="margin-left:auto" title="close (L)">×</button></div>
    <div class="lg-cols">
    <div><div class="rc-sec">Land</div>
      ${land}
      ${row(wash('rgba(120,120,128,.35)', '#77777f'), 'Unclaimed', 'nobody holds it')}
      ${row(wash('rgba(120,120,128,.3)', '#77777f', 'rgba(240,138,112,.85)'), 'Fighting', 'stripes in the attacker’s colour')}
      ${row(wash('rgba(242,178,122,.25)', '#f2b27a').replace('stroke-width="2"', 'stroke-width="2" stroke-dasharray="5 3"'), 'You can march here', 'glows round your selected squad')}
    </div>
    <div><div class="rc-sec">Lines</div>
      ${row(svgLine('#f0d9b5', '7 5'), 'Trade road')}
      ${row(svgLine('#e0b867', '2 5'), 'Sacred Way', 'the road through Omphalos')}
      ${row(svgLine('#c9a6e8', '', 2.6, '<path d="M26 3l6 4-6 4z" fill="#c9a6e8" stroke="#0e0907" stroke-width="1"/>'), 'Fealty', 'a vassal town to its overlord')}
      ${row(`<svg width="34" height="14" viewBox="0 0 34 14" aria-hidden="true"><line x1="2" y1="7" x2="32" y2="7" stroke="rgba(14,9,7,.8)" stroke-width="6" stroke-linecap="round"/><line x1="2" y1="7" x2="17" y2="7" stroke="${color(0)}" stroke-width="3" stroke-linecap="round"/><line x1="17" y1="7" x2="32" y2="7" stroke="${color(1)}" stroke-width="3" stroke-linecap="round"/></svg>`, 'Pact', 'two alliances allied')}
      ${row(svgLine('#f0d9b5', '5 4', 2.6), 'Truce', 'no fighting for a while')}
    </div>
    <div class="lg-wide"><div class="rc-sec">Markers</div><div class="lg-grid">
      ${row(img(`war/world/banners/${ALLIANCES[you ?? 0].key}.png`, 13, 19), 'Your squad', 'with its men')}
      ${row(img('war/world/markers/battle.png', 22, 22), 'Battle')}
      ${row(img('war/world/markers/fort.png', 22, 22), 'Siege')}
      ${row(disc(img('war/ui/icons/24/bld-fort.png', 14, 14), '#e0b867'), 'Landmark', 'a guarded wonder')}
      ${row(disc(crown, color(you ?? 0)), 'Monarch', 'an alliance’s crowned ruler')}
      ${row(`<span class="lg-seal">${img('war/ui/icons/24/bld-storehouse.png', 13, 13)}</span>`, 'Settlement', 'bigger: a higher level')}
      ${row(disc(eventIcon('soulStorm', 14), EVENT_LOOK.soulStorm.color), 'World event', 'with its time left')}
      ${row(disc(img('war/ui/icons/24/trade-cart.png', 14, 14), color(you ?? 0)), 'Cart on the road')}
    </div></div>
    </div>`;
}

export const LEGEND_CSS = `
.lg-cols{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}
.lg-wide{grid-column:1/-1}
.lg-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}
.lg-row{display:flex;align-items:center;gap:8px;min-height:24px;font:600 13px/1.2 Inter,sans-serif}
.lg-look{flex:none;width:36px;display:flex;align-items:center;justify-content:center}
.lg-sub{display:block;font:600 13px/1.2 Inter,sans-serif;color:var(--rf-muted)}
.lg-you{font-size:13px;color:var(--rf-gold)}
.lg-disc{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--b);box-shadow:inset 0 0 0 2px var(--r),0 0 0 1px #0e0907}
.lg-seal{width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 35%,#f6e6c8,#c9ae86);box-shadow:inset 0 0 0 1.5px #7a3418,0 0 0 1.5px #0e0907}
`;
