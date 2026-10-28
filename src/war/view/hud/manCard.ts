/**
 * micro (../micro.ts): the small card floating by the one man picked out of a block. It shows what is known of him (name,
 * level and class, hp, his kit) and his three micro orders: fall back (out of the fight, behind his block), to the rear
 * rank, rejoin his slot. Styling is minimal on purpose (the kit's card and text buttons, ./kit.ts): the HUD reskin
 * restyles it.
 */
export type ManAct = 'fallBack' | 'rear' | 'rejoin';

/** What the card shows of a man. */
export interface ManInfo {
  id: number;
  name: string;
  /** Class name; level when known. */
  cls: string;
  level?: number;
  hp: number;
  maxHp: number;
  /** His kit's item names (weapon first), when known. */
  kit: string[];
  /** Falling back now. */
  back: boolean;
  /** Orders he may not take, with why (a civilian, alone in his squad). */
  off: Partial<Record<ManAct, string>>;
}

const ACTS: [ManAct, string][] = [['fallBack', 'Fall back'], ['rear', 'To rear'], ['rejoin', 'Rejoin']];
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&${({ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' } as Record<string, string>)[c]};`);

export class ManCard {
  readonly el: HTMLDivElement;
  private body: HTMLDivElement;
  private btns = new Map<ManAct, HTMLButtonElement>();
  private shown = '';

  constructor(onAct: (a: ManAct) => void) {
    const el = (this.el = document.createElement('div'));
    el.id = 'rfManCard';
    el.className = 'rf rf-card';
    el.style.cssText = 'position:fixed;display:none;z-index:6;width:204px;padding:6px 8px;font-size:12px;line-height:15px;white-space:normal';
    this.body = document.createElement('div');
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:3px;margin-top:5px';
    for (const [a, label] of ACTS) {
      const b = document.createElement('button');
      b.className = 'rf-tbtn';
      b.dataset.act = a;
      b.textContent = label;
      b.style.cssText = 'flex:1;padding:2px 0;font-size:11px';
      b.addEventListener('click', (e) => { e.stopPropagation(); onAct(a); });
      this.btns.set(a, b);
      row.append(b);
    }
    el.append(this.body, row);
    document.body.appendChild(el);
  }

  /** Show man m with the card's bottom-left corner at client px (x, y), kept on screen. */
  show(m: ManInfo, x: number, y: number): void {
    const pct = m.maxHp > 0 ? Math.max(0, Math.min(100, (m.hp / m.maxHp) * 100)) : 0;
    const html = `<div style="display:flex;justify-content:space-between;gap:6px"><b class="rf-name">${esc(m.name)}</b><span class="rf-dim">${m.level !== undefined ? `L${m.level} ` : ''}${esc(m.cls)}</span></div>
      <div style="display:flex;align-items:center;gap:6px;margin-top:3px"><div class="rf-bar" style="flex:1"><i class="hp" style="width:${pct.toFixed(0)}%"></i></div><span class="rf-num">${Math.ceil(m.hp)}/${Math.round(m.maxHp)}</span></div>
      ${m.kit.length ? `<div class="rf-dim" style="margin-top:3px">${m.kit.map(esc).join(', ')}</div>` : ''}
      ${m.back ? '<div style="margin-top:3px;color:var(--rf-gold)">Falling back</div>' : ''}`;
    if (html !== this.shown) (this.shown = html), (this.body.innerHTML = html);
    for (const [a, b] of this.btns) {
      const off = m.off[a] ?? (a === 'rejoin' && !m.back ? 'in his slot' : a === 'fallBack' && m.back ? 'falling back' : undefined);
      b.disabled = !!off;
      b.title = off ?? '';
    }
    const el = this.el;
    el.style.display = '';
    const r = el.getBoundingClientRect();
    el.style.left = `${Math.round(Math.max(4, Math.min(innerWidth - r.width - 4, x)))}px`;
    el.style.top = `${Math.round(Math.max(4, Math.min(innerHeight - r.height - 4, y - r.height)))}px`;
  }

  hide(): void {
    if (this.el.style.display !== 'none') this.el.style.display = 'none';
  }
}
