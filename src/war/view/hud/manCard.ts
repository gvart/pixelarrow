/**
 * micro (../micro.ts): the card of the one man picked out of a block, docked in the command panel's #cManCard slot
 * (./hud.ts mounts it there). It shows what is known of him (name, level and class, hp, his kit) and his three micro
 * orders as text buttons with their keycaps: fall back (out of the fight, behind his block), to the rear rank, rejoin
 * his slot. Each has a tooltip in the shared layout (./theme.ts tipHtml) and a hotkey (src/war/input, `order.fallBack`,
 * `order.rear`, `order.rejoin`; ../micro.ts runs them). Look: ./theme.ts `.hud-man`.
 */
import type { ActionId } from '../../input/actions';
import { keys } from '../../input/keys';
import { tipHtml } from './theme';

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

/** Each order: its button label, its hotkey action and what it does (the tooltip). */
export const MAN_ACTS: { a: ManAct; label: string; key: ActionId; what: string }[] = [
  { a: 'fallBack', label: 'Fall back', key: 'order.fallBack', what: 'he leaves the fight and keeps behind his block, away from the nearest foe' },
  { a: 'rear', label: 'To rear', key: 'order.rear', what: 'he swaps places with the nearest man of the rear rank' },
  { a: 'rejoin', label: 'Rejoin', key: 'order.rejoin', what: 'he takes his slot in the block again' },
];
/** The hotkey action of each order. */
export const MAN_KEY: Record<ManAct, ActionId> = Object.fromEntries(MAN_ACTS.map((x) => [x.a, x.key])) as Record<ManAct, ActionId>;

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&${({ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' } as Record<string, string>)[c]};`);
/** A keycap's text: Mac modifiers as symbols to fit the button. */
const cap = (id: ActionId) => keys.label(id).replace(/Option\+/g, '⌥').replace(/Cmd\+/g, '⌘').replace(/Ctrl\+/g, '⌃').replace(/Shift\+/g, '⇧');

export class ManCard {
  readonly el: HTMLDivElement;
  private body: HTMLDivElement;
  private btns = new Map<ManAct, HTMLButtonElement>();
  private why = new Map<ManAct, string>();
  private shown = '';
  private slot: HTMLElement | null = null;

  constructor(onAct: (a: ManAct) => void) {
    const el = (this.el = document.createElement('div'));
    el.id = 'rfManCard';
    el.className = 'hud-man';
    this.body = document.createElement('div');
    this.body.className = 'hud-man-body';
    const row = document.createElement('div');
    row.className = 'hud-man-acts';
    for (const { a, label } of MAN_ACTS) {
      const b = document.createElement('button');
      b.className = 'rf-tbtn';
      b.dataset.act = a;
      b.innerHTML = `<span>${label}</span><kbd class="hud-kbd"></kbd>`;
      b.addEventListener('click', (e) => { e.stopPropagation(); if (this.can(a)) onAct(a); });
      this.btns.set(a, b);
      row.append(b);
    }
    el.append(this.body, row);
    const caps = () => { for (const { a, key } of MAN_ACTS) { const k = this.btns.get(a)!.querySelector('kbd')!; k.textContent = cap(key); k.style.display = k.textContent ? '' : 'none'; } };
    caps();
    keys.onChange(caps);
  }

  /** The HUD docks the card in its slot; `tipOn` gives each button the HUD's tooltip. */
  mount(slot: HTMLElement, tipOn: (el: HTMLElement, html: () => string) => void): void {
    this.slot = slot;
    for (const { a, label, key, what } of MAN_ACTS) {
      tipOn(this.btns.get(a)!, () => {
        const why = this.why.get(a);
        return tipHtml(label, `${what}${why ? `<div class="rf-hint" style="margin-top:3px">not now: ${esc(why)}</div>` : ''}`, keys.label(key));
      });
    }
  }

  /** May he take order a now (shown, and not off)? */
  can(a: ManAct): boolean {
    return !!this.el.parentElement && !this.why.get(a);
  }

  /** Show man m in the slot (nothing without one). */
  show(m: ManInfo): void {
    if (!this.slot) return;
    const pct = m.maxHp > 0 ? Math.max(0, Math.min(100, (m.hp / m.maxHp) * 100)) : 0;
    const html = `<div class="hud-man-head"><span class="rf-name">${esc(m.name)}</span><span class="hud-man-cls">${m.level !== undefined ? `L${m.level} ` : ''}${esc(m.cls)}</span></div>
      <div class="hud-hp"><i class="hp" style="width:${pct.toFixed(1)}%"></i><span>${Math.ceil(m.hp)} / ${Math.round(m.maxHp)}</span></div>
      <div class="hud-man-kit">${m.back ? '<span class="hud-chip gold">Falling back</span>' : ''}${m.kit.length ? `<span title="${esc(m.kit.join(', '))}">${m.kit.map(esc).join(', ')}</span>` : ''}</div>`;
    if (html !== this.shown) (this.shown = html), (this.body.innerHTML = html);
    for (const [a, b] of this.btns) {
      const off = m.off[a] ?? (a === 'rejoin' && !m.back ? 'he is in his slot' : a === 'fallBack' && m.back ? 'he is falling back' : undefined);
      this.why.set(a, off ?? '');
      b.classList.toggle('off', !!off);
      b.setAttribute('aria-disabled', off ? 'true' : 'false');
    }
    if (this.el.parentElement !== this.slot) this.slot.append(this.el);
  }

  hide(): void {
    if (this.el.parentElement) this.el.remove();
  }
}
