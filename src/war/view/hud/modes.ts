/**
 * The view mode bar (W-36), bottom left over the minimap: a button per mode (../mapModes.ts; F2-F7) and, while a mode other
 * than Normal is on, its legend in a card above.
 */
import type { SandboxScene } from '../SandboxScene';
import { hex, MODES } from '../mapModes';

export class ModeBar {
  readonly el: HTMLDivElement;
  private legend: HTMLDivElement;
  private btns: HTMLButtonElement[];
  private shown = '';

  constructor(private s: SandboxScene) {
    this.el = document.createElement('div');
    this.el.className = 'rf';
    this.el.id = 'rfModes';
    this.el.style.cssText = 'left:4px;bottom:172px;width:168px;pointer-events:auto;display:flex;flex-direction:column;gap:2px';
    this.legend = document.createElement('div');
    this.legend.className = 'rf-card';
    this.legend.style.cssText = 'padding:4px 6px 5px;display:none';
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:2px';
    this.btns = MODES.map((m) => {
      const b = document.createElement('button');
      b.className = 'rf-tbtn';
      b.dataset.mode = m.id;
      b.style.cssText = 'width:100%;display:flex;justify-content:space-between;align-items:center';
      b.innerHTML = `<span>${m.name}</span><span class="rf-dim" style="font-size:8px">${m.key}</span>`;
      b.title = `${m.name} view (${m.key})`;
      b.onclick = () => { s.setMode(m.id); this.refresh(); };
      return b;
    });
    grid.append(...this.btns);
    this.el.append(this.legend, grid);
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    addEventListener('keydown', (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      const m = MODES.find((q) => q.key === e.key);
      if (!m) return;
      e.preventDefault(); // F5 would reload
      s.setMode(m.id);
      this.refresh();
    });
    this.refresh();
  }

  refresh(): void {
    const mode = this.s.mode;
    for (const b of this.btns) b.classList.toggle('on', b.dataset.mode === mode);
    const t = this.s.map.tint(mode, this.s.live());
    const html = t ? `<div class="rf-name" style="margin-bottom:4px">${MODES.find((m) => m.id === mode)!.name}</div>` + t.legend.map((q) =>
      `<div style="display:flex;align-items:center;gap:4px;margin-top:2px;font-size:10px;line-height:11px"><i style="width:9px;height:9px;flex:none;background:${hex(q.c)};box-shadow:0 0 0 1px #0e0907"></i>${q.label}</div>`).join('') : '';
    if (html === this.shown) return;
    this.shown = html;
    this.legend.innerHTML = html;
    this.legend.style.display = html ? '' : 'none';
  }
}
