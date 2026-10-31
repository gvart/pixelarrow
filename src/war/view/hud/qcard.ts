/**
 * The compact quest card, one format for the guide (./guide.ts), the tracked quest (./quest.ts), the tasks (./tasks.ts),
 * the world events (./worldEvents.ts), the crown's orders (./crown.ts) and the toasts (./roster/toast.ts): a verb icon,
 * a short imperative goal, then chips with icons (the input as a key, the reward, the distance, the timer, the
 * progress) and a call to action where there is one. Cards carry no numbers in their text: the chips show them.
 *
 * The story, the giver, where to go in full and the rules wait in a details fold: shown beside the card on hover, and
 * opened inside it by the (i) button (touch). The open folds are kept by card key, so a card built anew keeps its fold.
 */
import { icon, placeTip, uiZoom } from './kit';
import { glyph } from './glyph';
import { Z } from './theme';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface QCard {
  /** The card's key: its open details fold is kept under it. */
  key: string;
  /** The verb icon (HTML, about 24 px). */
  icon: string;
  /** The goal, plain text: a short imperative ("Build a camp in Kyrene"). */
  goal: string;
  /** A small label over the goal ("Daily task", "Landmark siege"), plain text. */
  kind?: string;
  /** The label's colour (CSS). */
  tone?: string;
  /** The chips (HTML, from `chip`). */
  chips?: string;
  /** The call to action (HTML: a button with `data-act`), at the chips' end. */
  cta?: string;
  /** Progress 0..1 as a bar under the goal (left out: none). */
  bar?: number;
  /** The details fold (HTML, from `details`): story, giver, where, rules. */
  more?: string;
  /** Extra HTML after the chips (choice buttons). */
  extra?: string;
}

const open = new Set<string>();
/** Is card `key`'s details fold open (its (i) pressed)? */
export const qcOpen = (key: string) => open.has(key);

/** One compact card. */
export function qcard(c: QCard): string {
  style();
  const on = c.more && open.has(c.key);
  const bar = c.bar === undefined ? '' : `<div class="rf-bar qc-bar"><i class="${c.bar >= 1 ? 'ok' : 'construction'}" style="width:${(Math.max(0, Math.min(1, c.bar)) * 100).toFixed(1)}%"></i></div>`;
  const chips = c.chips || c.cta ? `<div class="qc-chips">${c.chips ?? ''}${c.cta ? `<span class="qc-cta">${c.cta}</span>` : ''}</div>` : '';
  return `<div class="qc-wrap${on ? ' open' : ''}" data-qc="${esc(c.key)}"><div class="qc"><span class="qc-ic">${c.icon}</span><div class="qc-b">${c.kind ? `<div class="qc-k"${c.tone ? ` style="color:${c.tone}"` : ''}>${esc(c.kind)}</div>` : ''}<div class="qc-goal">${esc(c.goal)}</div>${bar}${chips}${c.extra ?? ''}</div>${c.more ? `<button class="qc-i" data-qc-i title="Details" aria-label="Details">i</button>` : ''}</div>${c.more ? `<div class="qc-more">${c.more}</div>` : ''}</div>`;
}

/** The details fold's body: a heading, short paragraphs (the story in plain type, no italics) and labelled lines. */
export function details(d: { title?: string; story?: string | string[]; lines?: [string, string][]; from?: string }): string {
  const story = (Array.isArray(d.story) ? d.story : d.story ? [d.story] : []).map((t) => `<p>${esc(t)}</p>`).join('');
  const lines = (d.lines ?? []).filter(([, v]) => v).map(([k, v]) => `<p><b>${esc(k)}</b> ${esc(v)}</p>`).join('');
  return `${d.title ? `<div class="qc-mt">${esc(d.title)}</div>` : ''}${story}${lines}${d.from ? `<p class="qc-from">${esc(d.from)}</p>` : ''}`;
}

// ---------------------------------------------------------------- chips

const ICONED = new Set(['food', 'wood', 'stone', 'marble', 'coin', 'silver', 'iron', 'copper', 'tin', 'bronze']);
/** The mouse with its right button lit: "right-click". */
const MOUSE = '<svg class="qc-mouse" viewBox="0 0 12 16" width="11" height="15" aria-hidden="true"><rect x="1" y="1" width="10" height="14" rx="5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M6 1.2 A4.8 4.8 0 0 1 10.8 6 L6 6 Z" fill="currentColor"/><line x1="6" y1="1.5" x2="6" y2="6" stroke="currentColor" stroke-width="1.2"/></svg>';

export const chip = {
  /** Any chip: an icon (HTML) and a short text. */
  any: (ic: string, text: string, cls = '', tip = '') => (style(), `<span class="qc-chip${cls ? ` ${cls}` : ''}"${tip ? ` title="${esc(tip)}"` : ''}>${ic}${text ? `<span>${esc(text)}</span>` : ''}</span>`),
  /** The reward: one gold chip a good, its icon and +n. */
  reward: (r: Record<string, number>) => Object.entries(r).filter(([, n]) => n > 0).map(([g, n]) => chip.any(ICONED.has(g) ? icon(`res-${g}`) : '', `${ICONED.has(g) ? '' : `${g} `}+${Math.round(n * 100) / 100}`, 'gold', `Reward: ${Math.round(n * 100) / 100} ${g}`)).join(''),
  /** The way to the target ("656 m"). */
  dist: (text: string) => (text ? chip.any(icon('act-move'), text, '', 'How far it is') : ''),
  /** A timer ("ends in 8:29"). */
  time: (text: string, cls = '', tip = '') => chip.any(glyph('ui:hourglass', 16), text, cls, tip),
  /** Progress ("3/5", "0/40 stone"). */
  prog: (text: string, done = false) => (text ? chip.any(done ? glyph('ui:check', 14) : '', text, done ? 'good' : '', 'Progress') : ''),
  /** A place ("Krios Glacier"). */
  where: (text: string) => chip.any(glyph('ui:map', 16), text),
  /** Alliance score (+n, war or peace). */
  score: (text: string, war = false) => chip.any(glyph(war ? 'ui:swords' : 'ui:laurel', 16), text, war ? 'war' : 'good', `${war ? 'War' : 'Peace'} score for your alliance`),
  /**
   * The input that does it: a key as a keycap ('B'), 'rmb' as a right-click mouse, 'auto' as "by itself"; with the
   * thing it acts on (an icon, HTML) after it.
   */
  key: (key: string, on = '') => {
    const k = key === 'rmb' ? `<span class="hud-kbd qc-kbd" title="Right-click">${MOUSE}</span>` : key === 'auto' ? '' : `<kbd class="hud-kbd qc-kbd" title="Press ${esc(key)}">${esc(key)}</kbd>`;
    return `<span class="qc-chip key">${k}${on}${key === 'auto' ? '<span>by itself</span>' : ''}</span>`;
  },
};

// ---------------------------------------------------------------- style and the details fold

const CSS = `
.qc-wrap{min-width:0}
.qc{display:flex;gap:7px;align-items:flex-start}
.qc-ic{flex:none;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:3px;background:var(--hud-slot-bg);box-shadow:var(--hud-slot)}
.qc-ic img,.qc-ic .gl{max-width:24px;max-height:24px}
.qc-b{flex:1;min-width:0}
.qc-k{font:700 10.5px/1.25 Inter,system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--hud-gold)}
.qc-goal{font:700 14px/1.25 Inter,system-ui,sans-serif;color:var(--hud-title);text-shadow:0 1px 0 rgba(0,0,0,.6)}
.qc-bar{width:100%;margin-top:4px}
.qc-chips{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-top:5px}
.qc-chip{display:inline-flex;align-items:center;gap:3px;height:21px;padding:0 6px 0 3px;border-radius:2px;font:700 12.5px/1 Inter,system-ui,sans-serif;color:var(--hud-ink);background:rgba(0,0,0,.42);box-shadow:inset 0 0 0 1px var(--hud-rule);white-space:nowrap}
.qc-chip img{width:16px;height:16px}
.qc-chip .gl{width:16px;height:16px}
.qc-chip.gold{color:var(--hud-gold-hi);background:#1c140c;box-shadow:inset 0 0 0 1px var(--hud-gold-lo)}
.qc-chip.good{color:var(--hud-good);box-shadow:inset 0 0 0 1px #3d5a2a}
.qc-chip.war{color:#f08a70;box-shadow:inset 0 0 0 1px #5a2c22}
.qc-chip.bad{color:var(--hud-bad);box-shadow:inset 0 0 0 1px #6e2c20}
.qc-chip.key{padding:0 5px 0 2px;background:rgba(226,189,104,.08);box-shadow:inset 0 0 0 1px var(--hud-bronze)}
.qc-kbd{display:inline-flex;align-items:center;justify-content:center;min-width:17px;height:16px;padding:0 4px;font-size:11.5px;vertical-align:0}
.qc-mouse{display:block}
.qc-cta{margin-left:auto}
.qc-cta .rf-tbtn{height:21px;padding:0 8px;font-size:12px}
.qc-i{flex:none;width:18px;height:18px;min-width:18px;margin-top:1px;padding:0;border:0;border-radius:50%;font:700 12px/18px Georgia,serif;color:var(--hud-muted);text-align:center;cursor:pointer;background:rgba(0,0,0,.35);box-shadow:inset 0 0 0 1px var(--hud-bronze)}
.qc-i:hover,.qc-wrap.open .qc-i{color:var(--hud-gold-hi);box-shadow:inset 0 0 0 1px var(--hud-gold)}
.qc-more{display:none;margin-top:6px;padding-top:5px;border-top:1px solid var(--hud-rule)}
.qc-wrap.open .qc-more{display:block}
.qc-more p,#qcTip p{margin:0 0 4px;font:500 13px/1.4 Inter,system-ui,sans-serif;color:var(--hud-ink);white-space:normal}
.qc-more p b,#qcTip p b{font-weight:700;color:var(--hud-title)}
.qc-more .qc-from,#qcTip .qc-from{color:var(--hud-muted);margin-bottom:0}
.qc-mt{margin-bottom:4px;font:700 13px/1.2 Cinzel,serif;color:var(--hud-title)}
.rr-toast .rr-tt{font:700 13px/1.25 Inter,system-ui,sans-serif}
.rr-toast .qc-chip{height:19px;margin-left:2px}
.rr-toast .rr-act{height:21px;padding:0 8px;margin-left:4px;font-size:12px}
#qcTip{position:fixed;z-index:${Z.tip};pointer-events:none;width:280px;display:none}
`;

let styled = false;
let tip: HTMLElement | null = null;
/** The stylesheet and the fold's handlers, once. */
function style(): void {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
  // (i): open or shut the fold in place (before the card's own click: a card that opens the map stays put)
  document.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest?.('[data-qc-i]');
    if (!b) return;
    e.stopPropagation();
    e.preventDefault();
    const w = b.closest<HTMLElement>('.qc-wrap'), k = w?.dataset.qc;
    if (!w || !k) return;
    if (open.has(k)) open.delete(k);
    else open.add(k);
    w.classList.toggle('open', open.has(k));
    hide();
  }, true);
  // hover: the fold beside the card (not over a chip or button with its own tooltip, nor when it is open already)
  document.addEventListener('mouseover', (e) => {
    const t = e.target as HTMLElement, w = t.closest?.<HTMLElement>('.qc-wrap');
    const more = w?.querySelector<HTMLElement>(':scope>.qc-more');
    if (!w || !more || w.classList.contains('open') || t.closest('[data-tip],button,input')) return hide();
    tip ??= Object.assign(document.createElement('div'), { id: 'qcTip', className: 'rf rf-tip' });
    if (!tip.isConnected) document.body.appendChild(tip);
    tip.style.zoom = String(uiZoom());
    if (tip.dataset.k !== w.dataset.qc || tip.style.display === 'none') {
      tip.dataset.k = w.dataset.qc ?? '';
      tip.innerHTML = more.innerHTML;
      tip.style.display = 'block';
    }
    placeTip(tip, w);
  });
  addEventListener('blur', hide);
}
function hide(): void {
  if (tip) tip.style.display = 'none';
}

/** A story or encounter step's verb icon, by its trigger (../../sim/stories.ts, ../../sim/encounters.ts). */
export const TRIGGER_ICON: Record<string, string> = { talk: 'act-assign', reach: 'act-move', track: 'act-move', clear: 'act-attack', rescue: 'mk-claim', choice: 'trade-contract', guide: 'act-escort' };
export const triggerIcon = (kind: string) => icon(TRIGGER_ICON[kind] ?? 'mk-claim');
