/**
 * W-66 the Tunnel of Shades on the HUD (docs/WAR.md "Tunnel of Shades"; rules: src/war/sim/tunnel.ts). While the player
 * has fewer than 6 men, one rises from his home town's tunnel every 10 min:
 *  - the countdown pill, top centre: "Next shade rises in 7:42, 3/6";
 *  - when his last man falls, the "Your army is destroyed" card: a lore line, the time until the first man rises, and a
 *    button to his home town to watch the tunnel (no account reset);
 *  - the line of shades at the tunnel mouth and the man rising there (../tunnelLine.ts reads this module's host).
 * Online the server keeps the clock (GET /api/war/tunnel, the men due rise on the read; server/src/war/raise.ts); a rise
 * pulls the roster again. Offline the same rule runs here on a local clock (his men on this map count), the raised man
 * spawns at the mouth, and a dev button runs the clock x60.
 */
import { settleTunnel, TUNNEL, tunnelLine, clock } from '../../sim/tunnel';
import { START_CLASSES } from '../../world/start';
import { ALLIANCES } from '../../world/alliances';
import { WORLD_REGIONS } from '../../world/regions';
import type { BuildingSnap } from '../../types';
import type { SandboxScene } from '../SandboxScene';
import { myTeam } from '../side';
import { mountTunnelLine } from '../tunnelLine';
import { glyph } from './glyph';
import { sandboxRoster } from './roster/state';
import { armyMen } from './souls';

type Mk = (id: string, css: string, html?: string) => HTMLElement;

/** GET /api/war/tunnel (server/src/war/raise.ts TunnelView). */
interface NetTunnel { alive: number; floor: number; nextAt: number | null; pending: number; raised?: number }
/** Online: the tunnel read again this often (ms), and right after the countdown runs out. */
const PULL_MS = 10_000;
/** Offline dev speed: the tunnel clock runs this many times faster. */
const FAST = 60;
/** Offline: the raised man joins the map after the line's rise (ms: the shade reaches the mouth, flashes, stands). */
const SPAWN_AFTER = 2200;

/** A rise the line shows: when (performance ms) and of what class. */
export interface Rise { at: number; cls: string }
export interface TunnelHost {
  /** Men alive (what the floor counts), the next rise on the tunnel clock (null: none pending), men still to come. */
  alive: number; nextAt: number | null; pending: number;
  /** He ever had men (before his first squad there is no tunnel). */
  ever: boolean;
  /** The tunnel clock now (ms; offline it may run fast). */
  now(): number;
  /** The rises so far this session, newest last. */
  rises: Rise[];
  /** The home town's tunnel on this map (null: not his home region, or not loaded). */
  tunnel(): BuildingSnap | null;
}
const hosts = new WeakMap<SandboxScene, TunnelHost>();
export const tunnelHost = (s: SandboxScene): TunnelHost | undefined => hosts.get(s);

const homeId = () => ALLIANCES[myTeam()]?.home ?? '';
/** The tunnel piece of this map when it is his home region. */
export const homeTunnel = (s: SandboxScene): BuildingSnap | null =>
  s.region.id === homeId() ? (s.sim.cur?.buildings ?? []).find((b) => b.type === 'tunnel' && !b.ruin && b.state !== 'destroyed') ?? null : null;

/** The class the next raised man takes: one of his latest fallen (of the start classes), else militia. */
function classFor(s: SandboxScene, k: number): string {
  const start = START_CLASSES as readonly string[];
  const fallen = sandboxRoster(s).fallenClasses().filter((c) => start.includes(c));
  return fallen.length ? fallen[k % fallen.length] : 'militia';
}

export function mountTunnel(s: SandboxScene, mk: Mk): TunnelHost {
  const R = sandboxRoster(s);
  let speed = 1, base = Date.now(), at0 = base; // offline: tunnel clock = at0 + (Date.now() - base) * speed
  const host: TunnelHost = {
    alive: 0, nextAt: null, pending: 0, ever: false, rises: [],
    now: () => (s.sim.net ? Date.now() : at0 + (Date.now() - base) * speed),
    tunnel: () => homeTunnel(s),
  };
  hosts.set(s, host);
  mountTunnelLine(s, host);

  // ---------- the countdown pill ----------
  const pill = mk('rfTunnel', 'left:50%;top:46px;transform:translateX(-50%);display:none;pointer-events:auto;padding:4px 10px;align-items:center;gap:6px;white-space:nowrap');
  pill.className = 'rf rf-card';
  pill.title = 'The Tunnel of Shades: while you have fewer than 6 men, one rises in your home town every 10 min';
  pill.innerHTML = glyph('ui:hourglass', 16);
  const pillText = document.createElement('span');
  pill.append(pillText);
  const fast = document.createElement('button');
  fast.className = 'rf-tbtn';
  fast.id = 'rfTunnelFast';
  fast.title = 'dev: the tunnel clock x60';
  fast.onclick = () => {
    at0 = host.now();
    base = Date.now();
    speed = speed === 1 ? FAST : 1;
    fast.textContent = speed === 1 ? `x${FAST}` : 'x1';
    fast.classList.toggle('on', speed !== 1);
  };
  fast.textContent = `x${FAST}`;
  if (!s.sim.net || import.meta.env.DEV) pill.append(fast);

  // ---------- the army destroyed card ----------
  const wipe = mk('rfWipe', 'inset:0;display:none;pointer-events:auto;background:radial-gradient(ellipse at center,rgba(8,10,20,.55),rgba(0,0,0,.82));align-items:center;justify-content:center;z-index:30');
  const home = WORLD_REGIONS.find((w) => w.id === homeId())?.name ?? 'your home town';
  wipe.innerHTML = `<div class="rf-card" style="width:380px;padding:16px 18px 14px;text-align:center">
    <div class="rf-name" style="font-size:20px;margin-bottom:8px">Your army is destroyed</div>
    <div class="rf-dim" style="font-style:italic;line-height:1.45;margin-bottom:12px">The shades of your fallen walk back through the Tunnel of Shades in ${home}. The dead do not stay idle on Metaxy for long.</div>
    <div style="margin-bottom:4px">The first man rises in <b id="rfWipeT" style="color:#bfe0ff">10:00</b></div>
    <div class="rf-dim" style="font-size:11.5px;margin-bottom:14px">Until ${TUNNEL.floor} men stand again, one rises every ${TUNNEL.everyMs / 60_000} minutes, level 1 in starter kit. Past ${TUNNEL.floor}, men come only from souls.</div>
    <div style="display:flex;gap:8px;justify-content:center"><button class="rf-tbtn pri" id="rfWipeGo" style="height:28px;padding:0 14px">Watch the tunnel</button><button class="rf-tbtn" id="rfWipeX" style="height:28px">Close</button></div>
  </div>`;
  const wipeT = wipe.querySelector<HTMLElement>('#rfWipeT')!;
  let shown = false;
  const showWipe = (on: boolean) => void (wipe.style.display = on ? 'flex' : 'none');
  wipe.querySelector<HTMLElement>('#rfWipeX')!.onclick = () => showWipe(false);
  wipe.querySelector<HTMLElement>('#rfWipeGo')!.onclick = () => {
    showWipe(false);
    const t = homeTunnel(s);
    if (t) return s.focus(t.x, t.y + 3, 1.6);
    const q = new URLSearchParams(location.search);
    q.set('region', homeId());
    if (q.has('net')) q.set('net', `/ws/war/${homeId()}`);
    location.href = `sandbox.html?${q}`;
  };

  // ---------- the clock ----------
  let pulling = false, pulledFor: number | null = null, inflight = 0, inflightUntil = 0;
  const pull = async () => {
    if (pulling) return;
    pulling = true;
    try {
      const t = await s.sim.api<NetTunnel>('GET', 'tunnel');
      if (!t) return;
      const was = host.alive;
      Object.assign(host, { alive: t.alive, nextAt: t.nextAt, pending: t.pending });
      host.ever ||= t.pending < TUNNEL.floor || t.alive > 0 || t.nextAt !== null;
      for (let k = 0; k < (t.raised ?? 0); k++) host.rises.push({ at: performance.now() + k * 1200, cls: classFor(s, k) });
      if (t.raised || t.alive > was) void R.pull();
    } finally {
      pulling = false;
    }
  };
  const offline = () => {
    const now = host.now(), t = homeTunnel(s);
    if (Date.now() > inflightUntil) inflight = 0;
    const alive = armyMen(s) + inflight;
    host.ever ||= alive > 0 || R.fallenClasses().length > 0;
    if (!host.ever || !t) return void Object.assign(host, { alive, nextAt: null, pending: 0 });
    const st = settleTunnel({ alive, nextAt: host.nextAt }, now);
    Object.assign(host, { alive: st.alive, nextAt: st.nextAt, pending: st.pending });
    for (let k = 0; k < st.raise; k++) {
      const cls = classFor(s, host.rises.length), rise = { at: performance.now() + k * 1200, cls };
      host.rises.push(rise);
      inflight++;
      inflightUntil = Date.now() + SPAWN_AFTER + k * 1200 + 3000;
      setTimeout(() => {
        R.raise(cls);
        s.sim.spawn('you', myTeam(), cls, 1, t.x, t.y + t.h / 2 + 0.8);
      }, SPAWN_AFTER + k * 1200);
    }
  };
  if (s.sim.net) {
    void pull();
    setInterval(() => void pull(), PULL_MS);
  }
  setInterval(() => {
    if (s.sim.net) {
      // the countdown ran out: the read raises him
      if (host.nextAt !== null && host.now() >= host.nextAt && pulledFor !== host.nextAt) (pulledFor = host.nextAt), void pull();
    } else offline();
    const line = host.ever ? tunnelLine(host.alive, host.nextAt, host.now()) : null;
    pill.style.display = line ? 'flex' : 'none';
    if (line) pillText.textContent = line;
    // the last man fell: the card once (again only after men stood once more)
    const dead = host.ever && host.alive === 0 && host.pending > 0;
    if (dead && !shown) (shown = true), showWipe(true);
    if (!dead) shown = false;
    if (host.nextAt !== null) wipeT.textContent = clock(host.nextAt - host.now());
  }, 250);
  return host;
}
