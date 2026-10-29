/**
 * W-66 the Tunnel of Shades on the HUD (docs/WAR.md "Tunnel of Shades"; rules: src/war/sim/tunnel.ts). While the player
 * has fewer than 6 men, one rises from his home town's tunnel every 10 min:
 *  - the countdown pill, top centre: "Next shade rises in 7:42, 3/6";
 *  - when his last man he can field falls (the rest dead, wounded or captive), the "Your army is destroyed" card: a lore
 *    line, the time until his first man is back (a rise, a wounded man fit, a captive home), and a button to his home
 *    town to watch the tunnel (no account reset);
 *  - the line of shades at the tunnel mouth and the man rising there (../tunnelLine.ts reads this module's host).
 * Online the server keeps the clock (GET /api/war/tunnel, the men due rise on the read; server/src/war/raise.ts); a rise
 * pulls the roster again. Offline the same rule runs here on a local clock (his men on this map count), the raised man
 * spawns at the mouth, and a dev button runs the clock x60.
 */
import { settleTunnel, TUNNEL, tunnelLine, wiped, type WipeState } from '../../sim/tunnel';
import { ARMY_MAX } from '../../sim/soldiers';
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
import { wipeCard } from './wipeCard';

type Mk = (id: string, css: string, html?: string) => HTMLElement;

/** GET /api/war/tunnel (server/src/war/raise.ts TunnelView). */
interface NetTunnel extends WipeState { alive: number; floor: number; nextAt: number | null; pending: number; raised?: number }
/** Online: the tunnel read again this often (ms), and right after the countdown runs out. */
const PULL_MS = 10_000;
/** Offline dev speed: the tunnel clock runs this many times faster. */
const FAST = 60;
/** Offline: the raised man joins the map after the line's rise (ms: the shade reaches the mouth, flashes, stands). */
const SPAWN_AFTER = 2800;

/** A rise the line shows: when (performance ms) and of what class. */
export interface Rise { at: number; cls: string }
export interface TunnelHost extends WipeState {
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
    alive: 0, nextAt: null, pending: 0, ever: false, rises: [], fit: 0, wounded: 0, woundedAt: null, captive: 0, captiveAt: null,
    now: () => (s.sim.net ? Date.now() : at0 + (Date.now() - base) * speed),
    tunnel: () => homeTunnel(s),
  };
  hosts.set(s, host);
  if (import.meta.env.DEV) (window as unknown as { __tunnel: TunnelHost }).__tunnel = host; // scripts and the dev console
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

  // ---------- the army destroyed card (./wipeCard.ts) ----------
  const home = WORLD_REGIONS.find((w) => w.id === homeId())?.name ?? 'your home town';
  let shown = false;
  const wipe = wipeCard(mk('rfWipe', ''), home, () => {
    const t = homeTunnel(s);
    if (t) return s.focus(t.x, t.y + 3, 1.6);
    // not at home: his home town, watching (a join with nobody: the server lets him look on)
    const q = new URLSearchParams(location.search);
    q.set('region', homeId());
    q.set('world', '1');
    if (q.has('net')) q.set('net', `/ws/war/${homeId()}`);
    location.href = `sandbox.html?${q}`;
  });

  /** His living men on this map (online: his squads). */
  const mineHere = () => {
    const me = `p:${s.sim.playerId}`, mine = new Set((s.sim.cur?.squads ?? []).filter((q) => q.owner === me).map((q) => q.id));
    return (s.sim.cur?.units ?? []).filter((u) => mine.has(u.squad) && u.state !== 'dead');
  };

  // ---------- the clock ----------
  let pulling = false, known = false, pulledFor: number | null = null, inflight = 0, inflightUntil = 0;
  const pull = async () => {
    if (pulling) return;
    pulling = true;
    try {
      const t = await s.sim.api<NetTunnel>('GET', 'tunnel');
      if (!t) return;
      const was = host.alive, due = host.nextAt !== null && Date.now() >= host.nextAt;
      // the men risen since the last read: by this read, or by another (the roster's) once the clock ran out
      const raised = t.raised || (known && due && t.alive > was ? t.alive - was : 0);
      known = true;
      Object.assign(host, { alive: t.alive, nextAt: t.nextAt, pending: t.pending, fit: t.fit, wounded: t.wounded, woundedAt: t.woundedAt, captive: t.captive, captiveAt: t.captiveAt });
      host.ever ||= t.pending < TUNNEL.floor || t.alive > 0 || t.nextAt !== null || t.wounded > 0 || t.captive > 0;
      for (let k = 0; k < raised; k++) host.rises.push({ at: performance.now() + k * 1200, cls: classFor(s, k) });
      if (raised || t.alive > was) void R.pull();
      // at home: once the line's rise played, the risen men march in (a join picks his men at home; ../../net/client.ts)
      const at = homeTunnel(s);
      if (raised && at) setTimeout(() => {
        const before = mineHere().length;
        s.sim.spawn('you', myTeam(), classFor(s, 0), ARMY_MAX, at.x, at.y + at.h / 2 + 0.8);
        // the camera goes to him once he stands in the region (the server places him on the road in)
        let tries = 0;
        const look = setInterval(() => {
          const men = mineHere();
          if (men.length > before) s.focus(men[0].x, men[0].y, 1);
          if (men.length > before || ++tries > 60) clearInterval(look);
        }, 500);
      }, SPAWN_AFTER + (raised - 1) * 1200);
    } finally {
      pulling = false;
    }
  };
  const offline = () => {
    const now = host.now(), t = homeTunnel(s);
    if (Date.now() > inflightUntil) inflight = 0;
    const alive = armyMen(s) + inflight;
    host.ever ||= alive > 0 || R.fallenClasses().length > 0;
    if (!host.ever || !t) return void Object.assign(host, { alive, fit: alive, nextAt: null, pending: 0 });
    const st = settleTunnel({ alive, nextAt: host.nextAt }, now);
    Object.assign(host, { alive: st.alive, fit: st.alive, nextAt: st.nextAt, pending: st.pending }); // offline: no wounded or captives
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
  let hereWas = 0;
  setInterval(() => {
    if (s.sim.net) {
      // the countdown ran out: the read raises him; his last man here fell: read again soon (the card)
      if (host.nextAt !== null && host.now() >= host.nextAt && pulledFor !== host.nextAt) (pulledFor = host.nextAt), void pull();
      const here = mineHere().length;
      if (hereWas > 0 && here === 0) for (const ms of [1500, 5000]) setTimeout(() => void pull(), ms);
      hereWas = here;
    } else offline();
    const line = host.ever ? tunnelLine(host.alive, host.nextAt, host.now()) : null;
    pill.style.display = line ? 'flex' : 'none';
    if (line) pillText.textContent = line;
    // his last man he can field fell (the rest dead, wounded or captive): the card once (again only after men stood once more)
    const dead = host.ever && wiped(host);
    if (dead && !shown) (shown = true), wipe.show(true);
    if (!dead) (shown = false), wipe.show(false);
    wipe.set(host, host.now());
  }, 250);
  return host;
}
