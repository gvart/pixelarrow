/**
 * The view mode switcher (W-36), tucked into the minimap's top-right corner: one button showing the current mode's icon
 * (../mapModes.ts) with its name beside it. A click unfolds the six modes upward as a drawer (icon, name, key; staggered),
 * picking one folds it back; Esc or a click elsewhere folds it too. F2-F7 switch directly. While a mode other than Normal
 * is on, its legend sits in a card above the minimap.
 */
import type { SandboxScene } from '../SandboxScene';
import { hex, MODES, type LegendRow, type MapMode } from '../mapModes';
import { icon } from './kit';

const CSS = `
#rfModes{left:142px;bottom:142px;width:30px;height:30px;pointer-events:auto}
#rfModes>.rf-btn{position:absolute;left:0;top:0}
#rfModes .cap{position:absolute;left:34px;top:6px;font:600 12px/1 Inter,sans-serif;color:var(--rf-ink);background:var(--rf-panel);box-shadow:inset 0 0 0 1px var(--rf-rule);padding:3px 6px;white-space:nowrap;pointer-events:none;transition:opacity .12s}
#rfModes.open .cap{opacity:0}
#rfModes .drawer{position:absolute;left:-2px;bottom:34px;display:flex;flex-direction:column;gap:2px;pointer-events:none}
#rfModes.open .drawer{pointer-events:auto}
#rfModes .opt{display:flex;align-items:center;gap:6px;width:140px;height:30px;padding:0 7px 0 3px;border:0;cursor:pointer;color:var(--rf-ink);font:600 12px/1 Inter,sans-serif;
  background:var(--rf-panel);box-shadow:inset 0 0 0 1px var(--rf-rule),0 0 0 1px #0e0907;opacity:0;transform:translateY(10px) scale(.92);transform-origin:16px 100%;
  transition:opacity .09s ease-in,transform .09s ease-in}
#rfModes.open .opt{opacity:1;transform:none;transition:opacity .14s ease-out,transform .16s cubic-bezier(.2,.9,.3,1.25)}
#rfModes .opt:hover{background:var(--rf-hover);box-shadow:inset 0 0 0 1px var(--rf-line),0 0 0 1px #0e0907}
#rfModes .opt.on{background:var(--rf-sel);box-shadow:inset 3px 0 0 var(--rf-title),inset 0 0 0 1px var(--rf-line),0 0 0 1px #0e0907;color:var(--rf-title)}
#rfModes .opt .k{margin-left:auto;font:600 10.5px/1 Inter,sans-serif;color:var(--rf-muted)}
#rfLegend{left:4px;bottom:176px;pointer-events:none;padding:5px 8px 7px;min-width:150px;transition:opacity .12s}
#rfLegend .rf-name{margin-bottom:5px;padding-bottom:4px;border-bottom:1px solid var(--rf-rule)}
#rfLegend .lr{display:flex;align-items:center;gap:6px;margin-top:3px;font:600 12px/15px Inter,sans-serif}
#rfLegend .sw{width:14px;height:10px;flex:none;box-shadow:0 0 0 1px #0e0907}
#rfLegend .sw.ln{height:3px}
@media (prefers-reduced-motion:reduce){#rfModes .opt,#rfModes.open .opt{transition:none}}
`;

/** A legend swatch: a colour, striped when hatched, a thin bar for lines. */
export const swatch = (q: LegendRow) => {
  const c = hex(q.c);
  return `<i class="sw${q.line ? ' ln' : ''}" style="background:${q.hatch ? `repeating-linear-gradient(135deg,${c} 0 2px,#2a1c14 2px 4px)` : c}"></i>`;
};

/** The current mode's name and legend rows ('' in Normal). */
export function legendHtml(s: SandboxScene): string {
  const t = s.map.tint(s.mode, s.live());
  return t ? `<div class="rf-name">${MODES.find((m) => m.id === s.mode)!.name}</div>` + t.legend.map((q) => `<div class="lr">${s.mode === 'resources' && !q.hatch ? icon('res-' + q.label.toLowerCase()) : swatch(q)}${q.label}</div>`).join('') : '';
}

export class ModeBar {
  readonly el: HTMLDivElement;
  /** The legend card, its own anchored element (bottom left, over the minimap). */
  readonly legend: HTMLDivElement;
  private btn: HTMLButtonElement;
  private cap: HTMLSpanElement;
  private opts: HTMLButtonElement[];
  private shown = '';
  private shownMode = '';

  constructor(private s: SandboxScene) {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    this.el = document.createElement('div');
    this.el.className = 'rf';
    this.el.id = 'rfModes';
    this.btn = document.createElement('button');
    this.btn.className = 'rf-btn';
    this.btn.id = 'rfModeBtn';
    this.btn.onclick = () => this.toggle(!this.el.classList.contains('open'));
    this.cap = document.createElement('span');
    this.cap.className = 'cap';
    const drawer = document.createElement('div');
    drawer.className = 'drawer';
    this.opts = MODES.map((m, i) => {
      const b = document.createElement('button');
      b.className = 'opt';
      b.dataset.mode = m.id;
      b.innerHTML = `${icon(m.icon)}<span>${m.name}</span><span class="k">${m.key}</span>`;
      b.title = m.about;
      // unfold from the button up: the nearest option first
      b.style.transitionDelay = `0ms`;
      b.dataset.d = String((MODES.length - 1 - i) * 22);
      b.onclick = () => this.pick(m.id);
      return b;
    });
    drawer.append(...this.opts);
    this.el.append(drawer, this.btn, this.cap);
    this.legend = document.createElement('div');
    this.legend.className = 'rf rf-card';
    this.legend.id = 'rfLegend';
    this.legend.style.display = 'none';
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    addEventListener('pointerdown', (e) => { if (!this.el.contains(e.target as Node)) this.toggle(false); }, true);
    addEventListener('keydown', (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'Escape' && this.el.classList.contains('open')) { e.stopImmediatePropagation(); this.toggle(false); return; }
      const m = MODES.find((q) => q.key === e.key);
      if (!m) return;
      e.preventDefault(); // F5 would reload
      this.pick(m.id);
    }, true);
    this.refresh();
  }

  private toggle(open: boolean): void {
    if (open === this.el.classList.contains('open')) return;
    for (const b of this.opts) b.style.transitionDelay = open ? `${b.dataset.d}ms` : '0ms';
    this.el.classList.toggle('open', open);
    this.legend.style.opacity = open ? '0' : '';
  }

  private pick(m: MapMode): void {
    this.s.setMode(m);
    this.toggle(false);
    this.refresh();
  }

  refresh(): void {
    const mode = this.s.mode;
    if (mode !== this.shownMode) {
      this.shownMode = mode;
      const md = MODES.find((q) => q.id === mode)!;
      this.btn.innerHTML = icon(md.icon);
      this.btn.title = `View: ${md.name} (F2-F7)`;
      this.cap.textContent = md.name;
      for (const b of this.opts) b.classList.toggle('on', b.dataset.mode === mode);
    }
    const html = legendHtml(this.s);
    if (html === this.shown) return;
    this.shown = html;
    this.legend.innerHTML = html;
    this.legend.style.display = html ? '' : 'none';
  }
}
