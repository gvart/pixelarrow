/** The page's end of the war's gate (./gate.ts): the gate socket, its pings and reconnects. */
import { SIM_VERSION } from '../../sim/version';
import { GATE_BEAT_MS, GATE_LEAVE, type GateMsg } from './gate';
import type { WarAuth } from './session';

export interface Gate {
  /** Resolves once the world lets this tab in. */
  readonly admitted: Promise<void>;
  /** Leave the war: the place frees at once, no reconnect. */
  stop(): void;
}

/** Open the gate socket as `auth`; `on` hears every gate message (and a reconnect's). Reconnects with a backoff. */
export function openGate(auth: Pick<WarAuth, 'protocols'>, on: (m: GateMsg) => void, base = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`): Gate {
  let ws: WebSocket | null = null, beat: ReturnType<typeof setInterval> | null = null, stopped = false, wait = 1000;
  let letIn: () => void = () => undefined;
  const admitted = new Promise<void>((ok) => (letIn = ok));
  const open = () => {
    if (stopped) return;
    const s = new WebSocket(`${base}/ws/war/world?sim=${SIM_VERSION}&gate=1`, auth.protocols);
    ws = s;
    s.onopen = () => {
      wait = 1000;
      beat = setInterval(() => s.readyState === WebSocket.OPEN && s.send('ping'), GATE_BEAT_MS);
    };
    s.onmessage = (e) => {
      if (typeof e.data !== 'string' || e.data === 'pong') return;
      try {
        const m = JSON.parse(e.data) as GateMsg;
        if (m.t !== 'gate') return;
        if (m.s === 'in') letIn();
        on(m);
      } catch {
        // not ours
      }
    };
    s.onclose = () => {
      if (beat) clearInterval(beat);
      beat = null;
      if (ws === s) ws = null;
      if (!stopped) setTimeout(open, (wait = Math.min(wait * 2, 15_000)));
    };
  };
  open();
  return {
    admitted,
    stop: () => {
      stopped = true;
      if (beat) clearInterval(beat);
      try { ws?.close(GATE_LEAVE, 'leave'); } catch { /* closed */ }
    },
  };
}
