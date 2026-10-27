/**
 * The online cap (src/war/net/gate.ts): who is in the war, who waits, and in what order. Pure; WarWorldDO keeps one
 * GateTab per gate socket (its attachment) and applies the plan. Nothing is stored: the sockets are the truth, so an
 * evicted object rebuilds the line from them.
 */
import { GATE_EXPIRE_MS, MAX_ONLINE_DEFAULT } from '../../../../src/war/net/gate';

export interface GateTab {
  pid: number;
  /** Exempt from the cap (WAR_ADMIN_PIDS): always in, never counted. */
  admin: boolean;
  /** Let in. */
  in: boolean;
  /** When the tab connected (its pid's earliest tab is its place in line). */
  at: number;
  /** Its last sign of life (the last auto-answered ping, else `at`). */
  seen: number;
}

export interface GatePlan {
  /** Tabs silent past GATE_EXPIRE_MS: close them. */
  expired: number[];
  /** Tabs let in now. */
  admit: number[];
  /** Players let in from the line now (the line's pace, for the estimate). */
  fromLine: number[];
  /** Place in line by tab index (1 = next); tabs in have none. */
  place: Map<number, number>;
  /** Players in (held places too), and waiting. */
  online: number;
  waiting: number;
}

/** WAR_MAX_ONLINE, else MAX_ONLINE_DEFAULT. */
export const gateCap = (v: string | undefined) => (v?.trim() && Number(v) >= 0 ? Math.floor(Number(v)) : MAX_ONLINE_DEFAULT);

/** WAR_ADMIN_PIDS: comma-separated player ids exempt from the cap. */
export const gateAdmin = (v: string | undefined, pid: number) => !!v && v.split(',').some((s) => Number(s.trim()) === pid);

/**
 * The gate's next state. `held`: players whose last tab dropped by accident, their place kept until the time given
 * (expired ones are removed from the map). Admins and players already in (another tab, a held place) go in at once;
 * then the line, earliest first, while there is room.
 */
export function planGate(tabs: GateTab[], held: Map<number, number>, cap: number, now: number): GatePlan {
  const expired: number[] = [], live: number[] = [];
  tabs.forEach((t, i) => (now - t.seen > GATE_EXPIRE_MS ? expired : live).push(i));
  for (const [pid, until] of held) if (until <= now) held.delete(pid);
  const inside = new Set<number>(held.keys());
  for (const i of live) if (tabs[i].in && !tabs[i].admin) inside.add(tabs[i].pid);
  const admit: number[] = [], fromLine: number[] = [];
  const line = new Map<number, { at: number; tabs: number[] }>();
  for (const i of live) {
    const t = tabs[i];
    if (t.in) continue;
    if (t.admin || inside.has(t.pid)) { admit.push(i); continue; }
    const q = line.get(t.pid);
    if (q) (q.at = Math.min(q.at, t.at)), q.tabs.push(i);
    else line.set(t.pid, { at: t.at, tabs: [i] });
  }
  const order = [...line.entries()].sort((a, b) => a[1].at - b[1].at || a[0] - b[0]);
  const place = new Map<number, number>();
  let n = 0;
  for (const [pid, q] of order) {
    if (inside.size < cap) {
      inside.add(pid);
      fromLine.push(pid);
      admit.push(...q.tabs);
    } else {
      n++;
      for (const i of q.tabs) place.set(i, n);
    }
  }
  return { expired, admit, fromLine, place, online: inside.size, waiting: n };
}

/** Rough wait for `place`: the line's recent pace (players let in from it over the last 15 min), else half an hour a place spread over the cap. */
export function gateEta(place: number, letIn: number[], cap: number, now: number): number {
  const recent = letIn.filter((t) => now - t < 15 * 60_000);
  const step = recent.length >= 2 ? (now - Math.min(...recent)) / recent.length : (30 * 60_000) / Math.max(1, cap);
  return Math.round(place * step);
}
