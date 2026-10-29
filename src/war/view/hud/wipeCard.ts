/**
 * W-66 the "Your army is destroyed" card (docs/WAR.md "Tunnel of Shades"), shared by the region HUD (./tunnel.ts) and
 * the world map (../../world-view/main.ts): a lore line, a live countdown to his first man back (the tunnel's next rise,
 * a wounded man fit: whichever comes first, and what each will bring), a button home to watch the
 * tunnel, Close. No Phaser here: the world map loads it too.
 */
import { span, TUNNEL, wipeLine, wipeNext, type WipeState } from '../../sim/tunnel';

export interface WipeCard {
  el: HTMLElement;
  shown(): boolean;
  show(on: boolean): void;
  /** The countdown at `now` to his first man back (the next rise, a wounded man fit; null: not known yet). */
  set(t: WipeState | null, now: number): void;
}

/** The card, as a full-page overlay (hidden), into `el` (an empty element on the page); `home`: his home town's name. */
export function wipeCard(el: HTMLElement, home: string, watch: () => void): WipeCard {
  el.classList.add('rf');
  el.style.cssText = 'position:fixed;inset:0;display:none;pointer-events:auto;background:radial-gradient(ellipse at center,rgba(8,10,20,.55),rgba(0,0,0,.82));align-items:center;justify-content:center;z-index:30';
  el.innerHTML = `<div class="rf-card" style="width:380px;max-width:calc(100vw - 32px);padding:16px 18px 14px;text-align:center">
    <div class="rf-name" style="font-size:20px;margin-bottom:8px">Your army is destroyed</div>
    <div class="rf-dim" style="font-style:italic;line-height:1.45;margin-bottom:12px">The shades of your fallen walk back through the Tunnel of Shades in ${home}. The dead do not stay idle on Metaxy for long.</div>
    <div style="margin-bottom:4px"><span id="rfWipeH">The next man rises in</span> <b id="rfWipeT" style="color:var(--hud-gold-hi);font:700 16px/1 Cinzel,serif">…</b></div>
    <div id="rfWipeL" style="font-size:12px;margin-bottom:6px"></div>
    <div class="rf-dim" style="font-size:11.5px;margin-bottom:14px">Until ${TUNNEL.floor} men stand again, one rises every ${TUNNEL.everyMs / 60_000} minutes, level 1 in starter kit. Past ${TUNNEL.floor}, men come only from souls.</div>
    <div style="display:flex;gap:8px;justify-content:center"><button class="rf-tbtn pri" id="rfWipeGo" style="height:28px;padding:0 14px">Watch the tunnel</button><button class="rf-tbtn" id="rfWipeX" style="height:28px">Close</button></div>
  </div>`;
  const t = el.querySelector<HTMLElement>('#rfWipeT')!, head = el.querySelector<HTMLElement>('#rfWipeH')!, line = el.querySelector<HTMLElement>('#rfWipeL')!;
  const card: WipeCard = {
    el,
    shown: () => el.style.display !== 'none',
    show: (on) => void (el.style.display = on ? 'flex' : 'none'),
    set: (w, now) => {
      const n = w ? wipeNext(w) : null;
      head.textContent = n?.text ?? 'The next man rises in';
      t.textContent = n?.at == null ? '…' : span(n.at - now);
      line.textContent = w ? wipeLine(w, now) : '';
    },
  };
  el.querySelector<HTMLElement>('#rfWipeX')!.onclick = () => card.show(false);
  el.querySelector<HTMLElement>('#rfWipeGo')!.onclick = () => (card.show(false), watch());
  return card;
}
