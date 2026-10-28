/**
 * W-66 the "Your army is destroyed" card (docs/WAR.md "Tunnel of Shades"), shared by the region HUD (./tunnel.ts) and
 * the world map (../../world-view/main.ts): a lore line, a live countdown to the next man, a button home to watch the
 * tunnel, Close. No Phaser here: the world map loads it too.
 */
import { clock, TUNNEL } from '../../sim/tunnel';

export interface WipeCard {
  el: HTMLElement;
  shown(): boolean;
  show(on: boolean): void;
  /** The countdown: the next rise on the tunnel clock (null: not known yet) at `now`. */
  set(nextAt: number | null, now: number): void;
}

/** The card, as a full-page overlay (hidden), into `el` (an empty element on the page); `home`: his home town's name. */
export function wipeCard(el: HTMLElement, home: string, watch: () => void): WipeCard {
  el.classList.add('rf');
  el.style.cssText = 'position:fixed;inset:0;display:none;pointer-events:auto;background:radial-gradient(ellipse at center,rgba(8,10,20,.55),rgba(0,0,0,.82));align-items:center;justify-content:center;z-index:30';
  el.innerHTML = `<div class="rf-card" style="width:380px;max-width:calc(100vw - 32px);padding:16px 18px 14px;text-align:center">
    <div class="rf-name" style="font-size:20px;margin-bottom:8px">Your army is destroyed</div>
    <div class="rf-dim" style="font-style:italic;line-height:1.45;margin-bottom:12px">The shades of your fallen walk back through the Tunnel of Shades in ${home}. The dead do not stay idle on Metaxy for long.</div>
    <div style="margin-bottom:4px">The next man rises in <b id="rfWipeT" style="color:var(--hud-gold-hi);font:700 16px/1 Cinzel,serif">…</b></div>
    <div class="rf-dim" style="font-size:11.5px;margin-bottom:14px">Until ${TUNNEL.floor} men stand again, one rises every ${TUNNEL.everyMs / 60_000} minutes, level 1 in starter kit. Past ${TUNNEL.floor}, men come only from souls.</div>
    <div style="display:flex;gap:8px;justify-content:center"><button class="rf-tbtn pri" id="rfWipeGo" style="height:28px;padding:0 14px">Watch the tunnel</button><button class="rf-tbtn" id="rfWipeX" style="height:28px">Close</button></div>
  </div>`;
  const t = el.querySelector<HTMLElement>('#rfWipeT')!;
  const card: WipeCard = {
    el,
    shown: () => el.style.display !== 'none',
    show: (on) => void (el.style.display = on ? 'flex' : 'none'),
    set: (nextAt, now) => void (t.textContent = nextAt === null ? '…' : clock(nextAt - now)),
  };
  el.querySelector<HTMLElement>('#rfWipeX')!.onclick = () => card.show(false);
  el.querySelector<HTMLElement>('#rfWipeGo')!.onclick = () => (card.show(false), watch());
  return card;
}
