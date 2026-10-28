/**
 * The war's door on the region page (net mode; src/war/net/gate.ts):
 *
 *  - The line: while the war is full the region view waits behind a card with the player's place, how many wait and a
 *    rough wait; he goes in by himself when the gate lets him (the gate's `in`).
 *  - The idle kick: IDLE_MS without input (pointer, keys, wheel, touch) shows a WARN_MS warning with "Still here";
 *    then the war's sockets close (region, gate, chat), his place frees, and a "You were idle" card offers Rejoin (a
 *    reload: through the gate again). `?idle=<s>` shortens IDLE_MS (dev checks). Never a browser dialog.
 *
 * `window.__gate` shows each card (screenshots, offline).
 */
import type { GateMsg } from '../../net/gate';
import { haltChat } from '../../net/chatLink';
import { injectMenuCss } from '../../menu/style';
import type { SandboxScene } from '../SandboxScene';
import { icon, ring, uiZoom } from './kit';

export const IDLE_MS = 15 * 60_000;
export const WARN_MS = 60_000;

/** Where the idle clock stands: playing, warned (ms left), or out. */
export function idlePhase(sinceInput: number, idleMs = IDLE_MS, warnMs = WARN_MS): { phase: 'play' } | { phase: 'warn'; left: number } | { phase: 'out' } {
  if (sinceInput < idleMs) return { phase: 'play' };
  if (sinceInput < idleMs + warnMs) return { phase: 'warn', left: idleMs + warnMs - sinceInput };
  return { phase: 'out' };
}

/** A wait in words: "under a minute", "about 4 min", "about 1 h 20 min". */
export function waitText(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 1) return 'under a minute';
  return m < 60 ? `about ${m} min` : `about ${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
}

const CSS = `
.gt-modal{z-index:30;background:radial-gradient(ellipse at center,rgba(5,6,7,.35),rgba(5,6,7,.78))}
body.gt-clean .rf:not(#rfGate),body.gt-clean .gd-mk{visibility:hidden}
.gt-modal.soft{background:rgba(5,6,7,.38)}
.gt-card{width:320px;text-align:left}
.gt-card .mn-h{justify-content:center}
.gt-place{display:flex;align-items:center;justify-content:center;gap:12px;margin:6px 0 4px}
.gt-n{font:700 44px/1 Cinzel,serif;color:var(--rf-title);text-shadow:0 2px 0 #050506}
.gt-n small{font-size:20px;color:var(--rf-accent);margin-right:1px}
.gt-of{font:600 12px/1.35 Inter,sans-serif;color:var(--rf-muted)}
.gt-of b{color:var(--rf-ink)}
.gt-wait{display:flex;align-items:center;justify-content:center;gap:6px;margin:6px 0 10px;font:700 13px/1 Inter,sans-serif;color:var(--rf-gold)}
.gt-p{margin:0 2px 12px;font:600 12px/1.45 Inter,sans-serif;color:var(--rf-ink)}
.gt-p.dim{color:var(--rf-muted);font-size:11.5px}
.gt-ring{display:flex;justify-content:center;margin:8px 0 10px}
.gt-ring .rf-ring b{font-size:20px}
.gt-card .mn-big{justify-content:center}
.gt-card .mn-big .t{flex:none}
`;

type Card = { kind: 'queue'; place: number; of: number; eta: number } | { kind: 'warn'; left: number } | { kind: 'idle' };

export function mountGate(s: SandboxScene): void {
  injectMenuCss();
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
  let el: HTMLElement | null = null, shown: Card['kind'] | null = null;

  const close = () => { el?.remove(); el = null; shown = null; document.body.classList.remove('gt-clean'); };
  const show = (c: Card) => {
    if (!el || shown !== c.kind) {
      close();
      el = document.createElement('div');
      el.id = 'rfGate';
      el.className = `rf mn-modal gt-modal${c.kind === 'warn' ? ' soft' : ''}`;
      el.style.zoom = String(uiZoom());
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      el.addEventListener('wheel', (e) => e.stopPropagation());
      document.body.appendChild(el);
    }
    shown = c.kind;
    document.body.classList.toggle('gt-clean', c.kind !== 'warn'); // the line and the idle card: the region alone behind them
    if (c.kind === 'queue') {
      el.innerHTML = `<div class="rf-card mn-card gt-card" role="status" aria-live="polite">
        <div class="mn-h"><span class="rf-name">The war is full</span></div>
        <div class="gt-place"><span class="gt-n"><small>#</small>${c.place}</span><span class="gt-of">your place in line<br><b>${c.of}</b> ${c.of === 1 ? 'player waits' : 'players wait'}</span></div>
        <div class="gt-wait"><span class="mn-spin"></span>${c.place === 1 ? 'You are next' : `Wait ${waitText(c.eta)}`}</div>
        <p class="gt-p">Every place in the war is taken. When one frees, the first in line goes in by himself. Keep this tab open.</p>
        <button class="mn-big" data-k="menu">${icon('act-cancel', 24)}<div class="t">Main menu</div></button>
      </div>`;
    } else if (c.kind === 'warn') {
      const sec = Math.ceil(c.left / 1000);
      const body = `<div class="gt-ring">${ring(c.left / WARN_MS, 64, `<b>${sec}</b>`)}</div>
        <p class="gt-p">No input for ${Math.round(idleMs / 60_000)} minutes. In ${sec} s you leave the war and your place goes to the next in line.</p>`;
      const card = el.querySelector('.gt-body');
      if (card) card.innerHTML = body; // the countdown ticks: keep the button (and its focus)
      else {
        el.innerHTML = `<div class="rf-card mn-card gt-card" role="alertdialog" aria-label="Are you still there?">
          <div class="mn-h"><span class="rf-name">Still there?</span></div>
          <div class="gt-body">${body}</div>
          <button class="mn-big pri" data-k="here">${icon('act-move', 24)}<div class="t">Still here</div></button>
        </div>`;
        el.querySelector<HTMLElement>('[data-k=here]')!.focus();
      }
    } else {
      el.innerHTML = `<div class="rf-card mn-card gt-card" role="dialog" aria-label="You were idle">
        <div class="mn-h"><span class="rf-name">You were idle</span></div>
        <p class="gt-p">You left the war after ${Math.round(idleMs / 60_000)} minutes without input, and your place went to the next in line.</p>
        <p class="gt-p dim">Rejoin to play on. If the war is full, you wait in line.</p>
        <button class="mn-big pri" data-k="rejoin">${icon('act-move', 24)}<div class="t">Rejoin</div></button>
        <button class="mn-big" data-k="menu">${icon('act-cancel', 24)}<div class="t">Main menu</div></button>
      </div>`;
      el.querySelector<HTMLElement>('[data-k=rejoin]')!.focus();
    }
    const by = (k: string) => el!.querySelector<HTMLElement>(`[data-k=${k}]`);
    const menu = by('menu'), rejoin = by('rejoin'), here = by('here');
    if (menu) menu.onclick = () => (location.href = 'index.html');
    if (rejoin) rejoin.onclick = () => location.reload();
    if (here) here.onclick = () => { last = Date.now(); close(); };
  };

  const q = new URLSearchParams(location.search);
  const idleMs = Number(q.get('idle')) > 0 ? Number(q.get('idle')) * 1000 : IDLE_MS;
  let last = Date.now(), admitted = false, out = false;
  (window as unknown as { __gate: unknown }).__gate = {
    queue: (place: number, of: number, eta: number) => show({ kind: 'queue', place, of, eta }),
    warn: (left = WARN_MS) => show({ kind: 'warn', left }),
    idle: () => show({ kind: 'idle' }),
    clear: close,
  };
  if (!q.has('net')) return;

  s.sim.serverTaps.add((m) => {
    if (m.t !== 'gate' || out) return;
    const g: GateMsg = m;
    if (g.s === 'queue') show({ kind: 'queue', place: g.place, of: g.of, eta: g.eta });
    else {
      if (shown === 'queue') close();
      if (!admitted) last = Date.now(); // the idle clock starts once he is in
      admitted = true;
    }
  });
  // warned, a pointer drift is not enough: a click, key, wheel or touch (inside the card only its button closes it)
  const seen = (e: Event) => {
    if (out || (shown === 'warn' && e.type === 'pointermove')) return;
    last = Date.now();
    if (shown === 'warn' && !el?.contains(e.target as Node)) close();
  };
  for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart']) addEventListener(ev, seen, { capture: true, passive: true });
  const tick = setInterval(() => {
    if (!admitted || out || shown === 'queue') return;
    const p = idlePhase(Date.now() - last, idleMs);
    if (p.phase === 'warn') show({ kind: 'warn', left: p.left });
    else if (p.phase === 'out') {
      out = true;
      clearInterval(tick);
      s.sim.stopNet();
      haltChat();
      show({ kind: 'idle' });
    }
  }, 250);
}
