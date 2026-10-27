/**
 * The network readout (Settings > Display > Network stats, `war.netStats`, default off): a small corner panel with the
 * round trip to the region server (ping), the server's tick time, snapshots a second, kilobytes a second, the page's
 * fps, and a warning when the server has sent nothing for over a second. Offline (the local sim): fps and the sim's
 * step time. The figures come from ../../net/client.ts stats through the sim worker (SimClient.netInfo), once a second.
 */
import type Phaser from 'phaser';
import type { SimClient } from '../simClient';

export const NET_STATS_KEY = 'war.netStats';
const EVENT = 'war-netstats';

/** Is the network readout on (stored; default off)? */
export function netStatsOn(): boolean {
  try {
    return localStorage.getItem(NET_STATS_KEY) === '1';
  } catch {
    return false;
  }
}

export function setNetStatsOn(on: boolean): void {
  try {
    localStorage.setItem(NET_STATS_KEY, on ? '1' : '0');
  } catch {
    /* blocked storage: this session only */
  }
  dispatchEvent(new CustomEvent(EVENT, { detail: on }));
}

const CSS = `#rfNet{position:fixed;left:8px;top:50%;transform:translateY(-50%);z-index:30;pointer-events:none;padding:4px 7px;min-width:96px;
  background:color-mix(in srgb,var(--rf-sunk,#0e0907) 82%,transparent);border:1px solid var(--rf-rule,#3a2418);border-radius:3px;
  font:600 10.5px/1.45 Inter,system-ui,sans-serif;color:var(--rf-muted,#bba58c);font-variant-numeric:tabular-nums;white-space:nowrap}
#rfNet b{color:var(--rf-ink,#f0d9b5);font-weight:700}#rfNet .good{color:var(--rf-good,#9fd47a)}#rfNet .warn{color:var(--rf-gold,#e0b867)}
#rfNet .bad{color:var(--rf-bad,#f08a70)}#rfNet .stall{color:var(--rf-bad,#f08a70);font-weight:700}`;

const tone = (v: number, ok: number, warn: number) => (v <= ok ? 'good' : v <= warn ? 'warn' : 'bad');
const row = (k: string, v: string) => `<div>${k} ${v}</div>`;

/** The readout over the scene (shown while the setting is on). */
export function mountNetStats(game: Phaser.Game, sim: SimClient, net: boolean): void {
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
  const el = document.createElement('div');
  el.id = 'rfNet';
  el.setAttribute('aria-label', 'Network stats');
  document.body.appendChild(el);
  let timer = 0;
  const draw = () => {
    const fps = Math.round(game.loop.actualFps);
    let html = row('FPS', `<b class="${fps >= 50 ? 'good' : fps >= 30 ? 'warn' : 'bad'}">${fps}</b>`);
    if (!net) html += row('Sim', `<b>${sim.stats.stepMs.toFixed(1)}</b> ms`) + row('Net', '<b>offline</b>');
    else {
      const n = sim.netInfo;
      if (!n) html += row('Net', '<b>…</b>');
      else {
        const s = Math.max(0.001, n.secs), rate = n.frames / s;
        html += row('Ping', n.rtt === null ? '<b>…</b>' : `<b class="${tone(n.rtt, 120, 300)}">${n.rtt}</b> ms`)
          + row('Tick', n.serverMs === null ? '<b>…</b>' : `<b class="${tone(n.serverMs, 30, 80)}">${n.serverMs.toFixed(1)}</b> ms`)
          + row('Snaps', `<b class="${rate >= 8.5 ? 'good' : rate >= 5 ? 'warn' : 'bad'}">${rate.toFixed(1)}</b>/s`)
          + row('In', `<b>${(n.bytes / s / 1024).toFixed(1)}</b> KB/s`);
        if (!n.open) html += '<div class="stall">reconnecting…</div>';
        else if (n.quiet > 1000) html += `<div class="stall">server stalled ${(n.quiet / 1000).toFixed(1)} s</div>`;
      }
    }
    el.innerHTML = html;
  };
  const set = (on: boolean) => {
    el.style.display = on ? '' : 'none';
    clearInterval(timer);
    if (net) sim.netStats(on);
    if (!on) return;
    draw();
    timer = setInterval(draw, 500) as unknown as number;
  };
  addEventListener(EVENT, (e) => set((e as CustomEvent<boolean>).detail));
  set(netStatsOn());
}
