/**
 * W-62 E6: the page's end of the alliance chat (./chat.ts). NetChat follows the world's chat socket
 * (/ws/war/world?chat=1, as the page's player: ./session.ts), reconnecting with a backoff; MockChat (offline pages) is
 * a made-up alliance in memory: a few lines of history, allies who answer now and then, your marks and lines echoed
 * back (masked like the server's).
 */
import { SIM_VERSION } from '../../sim/version';
import { PHRASES, type ChatMsg, type ChatServerMsg, type MarkKind } from './chat';
import { maskText } from './chatFilter';
import { warAuth } from './session';

export type ChatOut =
  | { t: 'say'; text: string }
  | { t: 'say'; phrase: number }
  | { t: 'mark'; kind: MarkKind; at: string; x: number; y: number }
  | { t: 'mute'; pid: number; on: boolean }
  | { t: 'report'; id: number };

export interface ChatLink {
  start(on: (m: ChatServerMsg) => void): void;
  send(m: ChatOut): void;
  /** live: the socket is up (offline: always). */
  readonly live: boolean;
}

const wsBase = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;

export class NetChat implements ChatLink {
  live = false;
  private ws: WebSocket | null = null;
  private on: (m: ChatServerMsg) => void = () => undefined;
  private wait = 1000;

  constructor(private dev: number | null) {}

  start(on: (m: ChatServerMsg) => void): void {
    this.on = on;
    void this.open();
  }

  private async open(): Promise<void> {
    const auth = await warAuth(this.dev).catch(() => null);
    if (!auth) return void setTimeout(() => void this.open(), (this.wait = Math.min(this.wait * 2, 30_000)));
    const ws = new WebSocket(`${wsBase()}/ws/war/world?sim=${SIM_VERSION}&chat=1`, auth.protocols);
    this.ws = ws;
    ws.onopen = () => ((this.live = true), (this.wait = 1000));
    ws.onmessage = (e) => {
      if (typeof e.data !== 'string') return;
      try {
        this.on(JSON.parse(e.data) as ChatServerMsg);
      } catch {
        // not ours
      }
    };
    ws.onclose = () => {
      this.live = false;
      this.ws = null;
      setTimeout(() => void this.open(), (this.wait = Math.min(this.wait * 2, 30_000)));
    };
  }

  send(m: ChatOut): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }
}

/** Offline: the player is pid 1; Kallias, Myrto and Brasidas are about. */
export class MockChat implements ChatLink {
  readonly live = true;
  private on: (m: ChatServerMsg) => void = () => undefined;
  private seq = 100;
  private sent: number[] = [];
  constructor(private name = 'You') {}

  start(on: (m: ChatServerMsg) => void): void {
    this.on = on;
    const now = Date.now(), m = 60_000;
    const msgs: ChatMsg[] = [
      { id: 1, pid: 7, name: 'Kallias', at: now - 9 * m, text: 'Wagon of iron leaving Dodona for Stymphalia' },
      { id: 2, pid: 8, name: 'Myrto', at: now - 8 * m, phrase: 15 },
      { id: 3, pid: 9, name: 'Brasidas', at: now - 6 * m, text: 'Skythia scouts at the Kleisoura ford, 2 squads' },
      { id: 4, pid: 7, name: 'Kallias', at: now - 5 * m, phrase: 1 },
      { id: 5, pid: 8, name: 'Myrto', at: now - 2 * m, phrase: 7 },
    ];
    on({ t: 'chat', you: 1, msgs, muted: [] });
  }

  send(m: ChatOut): void {
    const now = Date.now();
    if (m.t === 'mute' || m.t === 'report') return m.t === 'report' ? this.on({ t: 'chatError', code: 'reported' }) : undefined;
    this.sent = [...this.sent.filter((t) => t > now - 10_000), now];
    if (this.sent.length > 5) return this.on({ t: 'chatError', code: 'slow' });
    if (m.t === 'mark') {
      this.on({ t: 'marked', mark: { id: ++this.seq, pid: 1, name: this.name, kind: m.kind, at: m.at, x: m.x, y: m.y, t: now } });
      if (m.kind === 'help' || m.kind === 'gather') this.reply(PHRASES.indexOf('On my way'));
      return;
    }
    this.on({ t: 'said', msg: { id: ++this.seq, pid: 1, name: this.name, at: now, ...('text' in m ? { text: maskText(m.text.trim()) } : { phrase: m.phrase }) } });
    if ('phrase' in m && PHRASES[m.phrase]?.startsWith('Need')) this.reply(PHRASES.indexOf('On my way'));
  }

  private reply(phrase: number): void {
    setTimeout(() => this.on({ t: 'said', msg: { id: ++this.seq, pid: 8, name: 'Myrto', at: Date.now(), phrase } }), 1800);
  }

  /** A made-up ally's mark (scripts and screenshots). */
  allyMark(kind: MarkKind, at: string, x: number, y: number, name = 'Brasidas'): void {
    const pid = ({ Kallias: 7, Myrto: 8, Brasidas: 9 } as Record<string, number>)[name] ?? 10;
    this.on({ t: 'marked', mark: { id: ++this.seq, pid, name, kind, at, x, y, t: Date.now() } });
  }
}
