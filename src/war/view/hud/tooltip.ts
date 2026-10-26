/**
 * Nested tooltips (W-55, after Crusader Kings III). A tooltip that holds game terms (./codex.ts `term`, `.tt[data-term]`)
 * fills a thin gold bar along its foot while the pointer rests; once full it is held: it takes the pointer, so the player
 * can move into it and hover a term, which opens that term's card beside it, itself holdable, and so on. A held tooltip
 * stays while the pointer is on its anchor, on it or on a deeper one, and while the pointer is travelling towards it
 * (a short grace), so crossing the panel to reach it does not drop it. Leaving everything closes the chain.
 *
 * One chain per base tooltip element: `tipChain(base, close)`; the owner calls `shown(anchor)` after it fills and places
 * the base, `holds(node)` in its pointer-out handler (keep the base when the pointer went into the chain), and `isHeld()`
 * to leave a held base to the chain (no switching to another anchor, no hiding when its anchor re-renders away).
 */
import { placeTip } from './kit';
import { termCard } from './codex';

const HOLD_MS = 550, GRACE_MS = 700;

export interface TipChain {
  /** The base was filled and placed for `anchor`. */
  shown(anchor: HTMLElement): void;
  /** The owner hid the base. */
  hidden(): void;
  /** Is node n in the chain's tooltips (the pointer went there). */
  holds(n: EventTarget | null): boolean;
  /** The base is held: the chain decides when it closes. */
  isHeld(): boolean;
}

export function tipChain(base: HTMLElement, close: () => void): TipChain {
  const tips: HTMLElement[] = [base];
  const anchors: (HTMLElement | null)[] = [null];
  const timers: number[] = [];
  let grace = 0, raf = 0, recheck = 0, last: PointerEvent | null = null;
  /** Each held level's distance from the pointer at the last move (moving towards it or away). */
  const gap: number[] = [];

  const held = (i: number) => tips[i]?.classList.contains('held');
  const arm = (i: number) => {
    const t = tips[i];
    clearTimeout(timers[i]);
    t.classList.remove('held', 'arm');
    t.style.pointerEvents = 'none';
    if (!t.querySelector('.tt')) return;
    void t.offsetWidth; // restart the bar's fill
    t.classList.add('arm');
    timers[i] = window.setTimeout(() => { if (!anchors[i]?.isConnected || !anchors[i]!.offsetParent) return cut(i); t.classList.add('held'); t.style.pointerEvents = 'auto'; }, HOLD_MS);
  };
  const level = (i: number): HTMLElement => {
    if (!tips[i]) {
      const t = document.createElement('div');
      t.className = 'rf rf-tip cx-tip';
      t.style.cssText = `display:none;position:fixed;z-index:${7 + i};zoom:${base.style.zoom}`;
      document.body.appendChild(t);
      tips[i] = t;
    }
    return tips[i];
  };
  /** Close the levels from i on (i = 0: the whole chain, and tell the owner). */
  const cut = (i: number) => {
    for (let k = Math.max(1, i); k < tips.length; k++) {
      clearTimeout(timers[k]);
      tips[k].style.display = 'none';
      tips[k].classList.remove('held', 'arm');
      anchors[k] = null;
    }
    if (i === 0) {
      clearTimeout(timers[0]);
      base.classList.remove('held', 'arm');
      base.style.pointerEvents = 'none';
      anchors[0] = null;
      close();
    }
  };
  const open = (i: number, term: HTMLElement) => {
    const t = level(i), html = termCard(term.dataset.term!);
    if (!html) return;
    cut(i);
    anchors[i] = term;
    t.style.zoom = base.style.zoom;
    t.innerHTML = html;
    t.style.display = '';
    placeTip(t, term);
    arm(i);
  };
  const deepest = () => { let d = 0; for (let k = 1; k < tips.length; k++) if (anchors[k]) d = k; return d; };
  const inside = (el: Element | null, n: Node | null) => !!el && !!n && el.contains(n);
  const dist = (el: HTMLElement, x: number, y: number) => {
    const r = el.getBoundingClientRect();
    return Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
  };

  const move = (e: PointerEvent) => {
    if (!anchors[0] || base.style.display === 'none') return;
    // its panel closed, or re-rendered it away: nothing to hold on to
    if (!anchors[0].offsetParent) { cut(0); return; }
    const n = e.target as Node, top = deepest();
    // the deepest level the pointer is on (a held tip, or the anchor of a level)
    let on = -1;
    for (let k = top; k >= 0; k--) if ((held(k) && inside(tips[k], n)) || inside(anchors[k], n)) { on = k; break; }
    if (on >= 0 && inside(tips[on], n)) {
      const tt = (n as Element).closest?.('.tt[data-term]') as HTMLElement | null;
      if (tt && inside(tips[on], tt)) { if (anchors[on + 1] !== tt) open(on + 1, tt); grace = 0; return; }
    }
    // a held level past `on` may be on its way: keep it while the pointer closes in, for a moment
    const next = on + 1, prev = gap[next] ?? Infinity;
    for (let k = 0; k <= top; k++) gap[k] = held(k) ? dist(tips[k], e.clientX, e.clientY) : Infinity;
    if (next <= top && held(next) && gap[next] <= prev + 1.5) { // not moving away from it
      const now = performance.now();
      if (!grace || gap[next] < prev - 0.5) grace = now; // still closing in
      if (now - grace < GRACE_MS) { clearTimeout(recheck); recheck = window.setTimeout(() => last && move(last), GRACE_MS + 20); return; }
    }
    grace = 0;
    if (on < top) cut(on + 1);
  };
  window.addEventListener('pointermove', (e: PointerEvent) => { last = e; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => move(e)); }, { passive: true });

  return {
    shown(anchor) { cut(1); anchors[0] = anchor; grace = 0; gap.length = 0; arm(0); },
    hidden() { cut(1); anchors[0] = null; clearTimeout(timers[0]); base.classList.remove('held', 'arm'); base.style.pointerEvents = 'none'; },
    holds: (t) => !!t && tips.some((x, i) => (i === 0 ? held(0) : x.style.display !== 'none') && x.contains(t as Node)),
    isHeld: () => held(0) && !!anchors[0],
  };
}

/** The description cards' and the chain's CSS (the kit's tooltip frame is ./kit.ts .rf-tip). */
export const TIP_CSS = `
.rf-tip.arm::after{content:'';position:absolute;left:3px;right:3px;bottom:1px;height:2px;background:var(--rf-gold);transform-origin:left;animation:cx-hold ${HOLD_MS}ms linear both;opacity:.85}
.rf-tip.held::after{animation:none;transform:none;box-shadow:0 0 4px rgba(224,184,103,.8)}
@keyframes cx-hold{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.cx{white-space:normal;line-height:1.35}
.cx-head{display:flex;align-items:center;gap:7px}
.cx-ic{width:32px;height:32px;flex:none;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 40%,#2c1c14,#140c08);border:1px solid #7a5a28;box-shadow:inset 0 0 0 1px #0e0907}
.cx-ic.sm{width:26px;height:26px}
.cx-name{font:700 13.5px/1.1 Cinzel,serif;color:var(--rf-title);letter-spacing:.02em}
.cx-kind{font:700 9.5px/1.2 Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--rf-muted);margin-top:2px}
.cx-flav{font:italic 500 12px/1.35 Georgia,'Times New Roman',serif;color:#d2bc9e;margin:6px 0 2px}
.cx-rule{height:1px;margin:5px 0 4px;background:linear-gradient(90deg,var(--rf-line),rgba(122,52,24,.15))}
.cx-fx{display:flex;align-items:center;gap:5px;margin:2px 0}
.cx-fx>span{flex:1;min-width:0}
.cx-v{font-weight:700;color:var(--rf-ink)}.cx-v.pos{color:var(--rf-good)}.cx-v.neg{color:var(--rf-bad)}
.cx-body{margin-top:5px}
.cx-body i{font:italic 500 12px/1.35 Georgia,serif;color:#d2bc9e}
.cx-state{display:flex;align-items:center;gap:5px;margin-top:6px;padding-top:5px;border-top:1px solid var(--rf-rule);font-size:11.5px}
.cx-state.good{color:var(--rf-good)}.cx-state.bad{color:var(--rf-bad)}.cx-state.gold{color:var(--rf-gold)}.cx-state.dim{color:var(--rf-muted)}
.cx-tab{display:grid;grid-template-columns:auto 1fr;gap:2px 8px;font-size:11.5px}
.cx-tab>:nth-child(odd){color:var(--rf-muted)}
.cx-tag{font:700 9.5px/1 Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--rf-accent);margin-right:4px}
.tt{color:#9cc9e4;border-bottom:1px dotted rgba(156,201,228,.55)}
.rf-tip.held .tt{cursor:help}
.rf-tip.held .tt:hover{color:#c6e2f2;border-bottom-style:solid}
`;
