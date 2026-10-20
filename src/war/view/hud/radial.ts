/**
 * The radial menu (W-34) drawn as a pie: every option of the context action (../interact.ts) is an equal wedge of a ring
 * round the press point, the first centred at the top, with its icon and a short label; the hub names the target, or the
 * hovered option (its reason when greyed). Motion: the ring scales and turns in (150 ms) with the wedges staggered; the
 * hovered wedge pops out; closing or running an action collapses it (90 ms). Selection is by angle (interact.ts), so the
 * pie only shows state. CSS transforms and opacity only (compositor-friendly).
 */
import { icon } from './kit';
import type { Option } from '../interact';

/** Art px: the ring's inner (hub) and outer radius. */
export const RI = 34, RO = 86;
const GAP = 0.035; // radians between wedges
const BOX = RO + 12;

const CSS = `
#rfRadial{z-index:7;pointer-events:none;width:0;height:0}
#rfRadial .pie{position:absolute;left:${-BOX}px;top:${-BOX}px;width:${2 * BOX}px;height:${2 * BOX}px;transform:scale(.55) rotate(-28deg);opacity:0;
  transition:transform .15s cubic-bezier(.2,.9,.3,1.15),opacity .1s ease-out}
#rfRadial.on .pie{transform:none;opacity:1}
#rfRadial.out .pie{transform:scale(.82);opacity:0;transition:transform .09s ease-in,opacity .09s ease-in}
#rfRadial .pie::before{content:'';position:absolute;left:${BOX - RO - 4}px;top:${BOX - RO - 4}px;width:${2 * RO + 8}px;height:${2 * RO + 8}px;border-radius:50%;
  box-shadow:0 0 0 1px #0e0907,inset 0 0 0 1px #0e0907,0 0 0 2px #b8592a,0 4px 14px rgba(0,0,0,.55)}
#rfRadial .w{position:absolute;inset:0;opacity:0;transform:scale(.8);transition:transform .12s cubic-bezier(.2,.9,.3,1.3),opacity .1s}
#rfRadial.on .w{opacity:1;transform:none}
#rfRadial .w svg{position:absolute;inset:0;overflow:visible}
#rfRadial .w path{fill:rgba(23,16,13,.94);stroke:#7a3418;stroke-width:1.5;transition:fill .08s,stroke .08s}
#rfRadial .w .in{position:absolute;display:flex;flex-direction:column;align-items:center;gap:2px;transform:translate(-50%,-50%);
  font:700 11px/1 Inter,sans-serif;color:#f0d9b5;white-space:nowrap;text-shadow:0 1px 0 #0e0907}
#rfRadial .w.sel path{fill:#4a2414;stroke:#de8a4e;stroke-width:2}
#rfRadial .w.sel .in{color:#f2b27a}
#rfRadial .w.off path{fill:rgba(37,24,18,.9);stroke:#4a3a32}
#rfRadial .w.off .in{color:#9a8878}
#rfRadial .w.off .ic{opacity:.4;filter:grayscale(.8)}
#rfRadial .w.off.sel path{fill:#33201a;stroke:#8a786a}
#rfRadial .hub{position:absolute;left:${BOX - RI + 3}px;top:${BOX - RI + 3}px;width:${2 * RI - 6}px;height:${2 * RI - 6}px;border-radius:50%;
  background:#0e0907;box-shadow:0 0 0 2px #b8592a,0 0 0 3px #0e0907}
#rfRadial .cap{position:absolute;left:${BOX - RI + 7}px;top:${BOX - RI + 7}px;width:${2 * RI - 14}px;height:${2 * RI - 14}px;display:flex;flex-direction:column;
  align-items:center;justify-content:center;text-align:center;overflow:hidden}
#rfRadial .cap .n{font:700 11px/11px Cinzel,serif;color:#f2b27a;letter-spacing:.02em;overflow-wrap:anywhere}
#rfRadial .cap .d{font:600 9.5px/11px Inter,sans-serif;color:#bba58c;margin-top:2px}
#rfRadial .cap .d.why{color:#f08a70}
@media (prefers-reduced-motion:reduce){#rfRadial .pie,#rfRadial .w{transition:none}}
`;

/** Two-word verbs keep their second word ("fire arrows", "move up"). */
const TWO = new Set(['fire', 'raise', 'push', 'pack', 'move', 'shield', 'wet', 'pick', 'let']);
const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
const short = (label: string) => {
  const w = label.replace(/\(.*\)/, '').trim().split(' ');
  return TWO.has(w[0]) && w[1] && !/^(at|to)$/.test(w[1]) && (w[0] !== 'move' || w[1] === 'up') ? `${w[0]} ${w[1]}` : w[0];
};

/** An annular sector path from angle a0 to a1 (radians, 0 = right, clockwise), centred on (c, c). */
const sector = (a0: number, a1: number) => {
  const c = BOX, P = (r: number, a: number) => `${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`, big = a1 - a0 > Math.PI ? 1 : 0;
  return `M${P(RO, a0)}A${RO} ${RO} 0 ${big} 1 ${P(RO, a1)}L${P(RI, a1)}A${RI} ${RI} 0 ${big} 0 ${P(RI, a0)}Z`;
};

export class Radial {
  readonly el: HTMLDivElement;
  private wedges: HTMLDivElement[] = [];
  private cap!: HTMLDivElement;
  private opts: Option[] = [];
  private target = '';
  private hideT = 0;

  constructor() {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    this.el = document.createElement('div');
    this.el.id = 'rfRadial';
    this.el.className = 'rf';
    this.el.style.display = 'none';
    document.body.appendChild(this.el);
  }

  /** Open at client point (x, y) with the options. */
  open(x: number, y: number, opts: Option[]): void {
    clearTimeout(this.hideT);
    const z = Number(this.el.style.zoom) || 1, n = opts.length, step = (2 * Math.PI) / n;
    this.opts = opts;
    // the target: the recommended action's words after its verb
    const lead = opts[0].label.replace(/\(.*\)/, '').trim();
    this.target = lead.slice(short(lead).length).replace(/^\s*(at|to)\s+/, '').trim() || 'here';
    this.el.style.left = `${x / z}px`;
    this.el.style.top = `${y / z}px`;
    this.el.className = 'rf';
    const pie = document.createElement('div');
    pie.className = 'pie';
    this.wedges = opts.map((o, i) => {
      const mid = -Math.PI / 2 + i * step, half = n === 1 ? Math.PI - 0.001 : step / 2 - GAP / 2, w = document.createElement('div');
      w.className = 'w' + (o.off ? ' off' : '');
      w.style.transitionDelay = `${i * 18}ms`;
      const rIc = (RI + RO) / 2 + 2, ix = BOX + rIc * Math.cos(mid), iy = BOX + rIc * Math.sin(mid);
      w.innerHTML = `<svg width="${2 * BOX}" height="${2 * BOX}"><path d="${n === 1 ? sector(-Math.PI / 2, Math.PI * 1.5 - 0.001) : sector(mid - half, mid + half)}"/></svg>
        <div class="in" style="left:${ix}px;top:${iy}px">${icon(o.icon, 32)}<span>${short(o.label)}</span></div>`;
      w.dataset.dx = String(Math.cos(mid) * 6);
      w.dataset.dy = String(Math.sin(mid) * 6);
      return w;
    });
    const hub = document.createElement('div');
    hub.className = 'hub';
    this.cap = document.createElement('div');
    this.cap.className = 'cap';
    pie.append(...this.wedges, hub, this.cap);
    this.el.replaceChildren(pie);
    this.el.style.display = '';
    this.pick(-1);
    void this.el.offsetWidth; // start from the closed pose
    this.el.classList.add('on');
  }

  /** Highlight option i (-1: none) and caption it. */
  pick(i: number): void {
    this.wedges.forEach((w, j) => {
      const on = j === i;
      w.classList.toggle('sel', on);
      if (this.el.classList.contains('on')) w.style.transitionDelay = '0ms';
      w.style.transform = on ? `translate(${w.dataset.dx}px,${w.dataset.dy}px) scale(1.05)` : '';
    });
    const o = this.opts[i];
    this.cap.innerHTML = o
      ? `<div class="n">${cap(short(o.label))}</div>${o.off ? `<div class="d why">${o.off}</div>` : `<div class="d">${o.label.slice(short(o.label).length).trim() || 'release'}</div>`}`
      : `<div class="n">${cap(this.target)}</div>`;
  }

  /** Collapse and hide. */
  close(): void {
    if (this.el.style.display === 'none') return;
    this.el.classList.remove('on');
    this.el.classList.add('out');
    clearTimeout(this.hideT);
    this.hideT = window.setTimeout(() => { this.el.style.display = 'none'; this.el.replaceChildren(); }, 100);
  }
}
