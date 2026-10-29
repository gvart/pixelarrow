/**
 * W-62 E6 the alliance chat panel and map marks, shared by the region view (./hud.ts, above the minimap) and the world
 * map (../../world-view/main.ts, above the events card). Wire: ../../net/chat.ts, ../../net/chatLink.ts.
 *
 *  - Collapsed: a small "Alliance" tab (unread count) and the last few lines, fading after LINE_FADE_MS.
 *  - Open (Enter in a region, Enter with nothing to enter on the world map, or a click on the tab): the log, the quick
 *    phrases (the quote button), the four marks and a text field (CHAT_MAX chars). Enter sends and closes, Esc closes.
 *    A line's name: hover shows mute and report (mutes are kept server side; muted players' lines are hidden).
 *  - W-69 two channels, a tab each with its own unread count: Alliance (marks too) and World (every player of every
 *    alliance; no marks). While the field is open, Shift+click on an item (chest, gear slots, loot) or a man (roster
 *    row, squad pip, man card) puts "[its name]" in the field; sent, it is a gold tag whose hover is the full card
 *    (./chatTags.ts; the snapshot rides the message: ../../net/chatLinks.ts).
 *  - Marks: P (rebindable, `chat.mark`) or a mark button arms placing; P again steps the kind; a click places it here
 *    (this region's tile point, or the world map's px), Esc or right click cancels. Alliance marks of this view show for
 *    MARK_MS as a pin with a pulse and the placer's name, at the screen edge as an arrow while off screen (a click on
 *    it, or on the mark's line in the log, centres the view there); each one arriving plays a short horn.
 */
import { CHAT_MAX, chatText, MARK_INFO, MARK_KINDS, MARK_MS, PHRASES, type ChatChannel, type ChatMsg, type ChatServerMsg, type Mark, type MarkKind } from '../../net/chat';
import { encodeDraft, linkLabel, tagParts, type ChatLinkData } from '../../net/chatLinks';
import { markedLink, mountTagTip, tagHtml } from './chatTags';
import type { ChatLink } from '../../net/chatLink';
import { keys } from '../../input/keys';
import { loadSound } from '../sound/mix';

export interface ChatView {
  link: ChatLink;
  /** Where marks placed in this view go ('world' or the region id). */
  scope: string;
  /** Position the panel (left / bottom in the panel's own zoomed px); open, it may set `--ch-log-h` to fit the room above. */
  place(el: HTMLElement, open: boolean): void;
  zoom(): number;
  /** A mark's screen point here (CSS px), or null when it is not of this view. */
  project(m: Mark): { x: number; y: number } | null;
  /** The mark point under a screen point (null: none). */
  pick(cx: number, cy: number): { x: number; y: number } | null;
  /** Centre the view on a mark. */
  focus(m: Mark): void;
  /** A scope's name ("World map", a region's). */
  where(at: string): string;
  /** Whether Enter may open the panel now (a region's left window holds that corner: the chat waits). */
  canOpen?(): boolean;
  /** W-69: the man (or item) a Shift+click on this element links, beside the `data-chat-link` ones. */
  linkAt?(el: HTMLElement): ChatLinkData | null;
  /** W-69: draw a linked man's portrait into his card's canvas. */
  portrait?(c: HTMLCanvasElement, cls: string, scars: number): void;
}

export interface ChatHandle {
  /** The chat holds Esc (its field is open or a mark is being placed): the game menu waits. */
  busy(): boolean;
  open(): void;
}

const LINE_FADE_MS = 14_000;
const SHOWN = 6;

/** A map mark's look (its pin layer and edge pointers, the tag above it, the edge arrow in `--mk-c`), for `layer` and
 * `edges` selectors: the alliance marks here and the personal markers (./pins.ts) share it. */
export const markCss = (layer: string, edges: string) => `
${layer},${edges}{position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:3;overflow:hidden}${edges}{z-index:5}
${layer} .mk{position:absolute;width:0;height:0;transition:opacity .4s}
${layer} .mk .pin{position:absolute;left:-15px;top:-44px;filter:drop-shadow(0 2px 2px rgba(0,0,0,.7));animation:mkDrop .38s cubic-bezier(.3,1.6,.5,1)}
${layer} .mk .ring{position:absolute;left:-22px;top:-9px;width:44px;height:18px;border-radius:50%;border:2px solid var(--mk-c);box-shadow:0 0 6px var(--mk-c);animation:mkPulse 1.4s ease-out infinite}
${layer} .mk .ring.b{animation-delay:.7s}
${layer} .mk .dot{position:absolute;left:-3px;top:-2px;width:6px;height:4px;border-radius:50%;background:var(--mk-c);box-shadow:0 0 0 1px #050506}
${layer} .mk .nm{position:absolute;left:0;top:-62px;transform:translateX(-50%);padding:2px 6px;white-space:nowrap;font:700 11px/1.2 Inter,sans-serif;color:#fff6e2;background:rgba(10,11,13,.86);border:1px solid var(--rf-rule);border-left:2px solid var(--mk-c)}
${layer} .mk .nm i{font-style:normal;color:var(--mk-c);margin-right:4px}
${edges} .edge{position:absolute;width:0;height:0;pointer-events:auto;cursor:pointer}
${edges} .edge .ar{position:absolute;left:-17px;top:-17px;width:34px;height:34px;border-radius:50%;background:rgba(10,11,13,.9);border:2px solid var(--mk-c);box-shadow:0 0 8px var(--mk-c);display:flex;align-items:center;justify-content:center;animation:mkBeat 1s ease-in-out infinite}
${edges} .edge .tip{position:absolute;left:-6px;top:-6px;width:0;height:0;border-left:9px solid var(--mk-c);border-top:6px solid transparent;border-bottom:6px solid transparent;transform-origin:6px 6px}
${edges} .edge .nm{position:absolute;left:0;top:20px;transform:translateX(-50%);white-space:nowrap;font:700 10px/1 Inter,sans-serif;color:#fff6e2;text-shadow:0 1px 0 #050506,0 0 3px #050506}
@keyframes mkPulse{0%{transform:scale(.4);opacity:1}100%{transform:scale(1.5);opacity:0}}
@keyframes mkDrop{0%{transform:translateY(-26px);opacity:0}100%{transform:none;opacity:1}}
@keyframes mkBeat{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}
`;

const CSS = `
#rfChat{position:fixed;z-index:4;width:340px;pointer-events:none;color:var(--rf-ink);font:var(--rf-body)}
#rfChat .ch-tab{pointer-events:auto;display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 8px 0 6px;margin-top:3px;cursor:pointer;background:rgba(10,11,13,.82);border:1px solid var(--rf-rule);box-shadow:inset 0 1px 0 rgba(239,207,134,.08);font:700 11px/1 Cinzel,serif;color:var(--rf-title);letter-spacing:.05em}
#rfChat .ch-tab:hover{border-color:var(--rf-line);background:rgba(44,28,21,.92)}
#rfChat .ch-tab .k{font:600 10px/1 Inter,sans-serif;color:var(--rf-muted);letter-spacing:0;padding:2px 4px;border:1px solid var(--rf-rule);background:var(--rf-sunk)}
#rfChat .ch-dot{width:7px;height:7px;border-radius:50%;background:var(--rf-good);box-shadow:0 0 4px var(--rf-good)}
#rfChat .ch-dot.off{background:var(--rf-disabled);box-shadow:none}
#rfChat .ch-box{display:flex;flex-direction:column}
#rfChat.open .ch-box{pointer-events:auto;padding:6px 8px 7px}
#rfChat .ch-head{display:none;align-items:center;gap:6px;padding:0 0 5px;margin-bottom:4px;border-bottom:1px solid var(--rf-line);box-shadow:0 1px 0 var(--rf-sunk)}
#rfChat.open .ch-head{display:flex}
#rfChat .ch-head .rf-name{font-size:13px}
#rfChat .ch-chan{height:20px;padding:0 7px;display:inline-flex;align-items:center;gap:4px;font:700 11.5px/1 Cinzel,serif;letter-spacing:.05em;color:var(--rf-muted);background:none;border:1px solid transparent;cursor:pointer}
#rfChat .ch-chan:hover{color:var(--rf-title)}
#rfChat .ch-chan.on{color:var(--rf-title);background:var(--rf-sel);border-color:var(--rf-line)}
#rfChat .ch-chan .u,#rfChat .ch-tab .u{min-width:16px;height:15px;padding:0 4px;font:700 10px/15px Inter,sans-serif;text-align:center;color:#1a0e08;background:var(--rf-accent);letter-spacing:0}
#rfChat .ch-tab .w{color:var(--rf-muted);font:600 10px/1 Inter,sans-serif;letter-spacing:0}
#rfChat .ch-tag{color:var(--rf-gold);font-weight:700;cursor:help}
#rfChat .ch-tag:hover{text-decoration:underline;text-underline-offset:2px}
#rfChat.world [data-mk],#rfChat.world .ch-mk-sep{display:none}
#rfChat .ch-head .sub{font:600 10.5px/1 Inter,sans-serif;color:var(--rf-muted)}
#rfChat .ch-log{display:flex;flex-direction:column;gap:1px;max-height:132px;overflow:hidden}
#rfChat.open .ch-log{height:var(--ch-log-h,164px);max-height:none;overflow-y:auto;padding:3px 2px 3px 3px;background:var(--rf-sunk);border:1px solid var(--rf-rule);box-shadow:inset 0 1px 3px rgba(0,0,0,.6)}
#rfChat .ch-l{position:relative;padding:2px 5px;font:600 12px/1.35 Inter,sans-serif;color:var(--rf-ink);word-wrap:break-word;overflow-wrap:anywhere;transition:opacity .6s}
#rfChat:not(.open) .ch-l{background:linear-gradient(90deg,rgba(10,11,13,.78) 60%,rgba(10,11,13,0));text-shadow:0 1px 0 #050506,0 0 3px #050506}
#rfChat:not(.open) .ch-l.old{opacity:0}
#rfChat.open .ch-l:hover{background:var(--rf-hover)}
#rfChat .ch-l .tm{font:600 10px/1 Inter,sans-serif;color:var(--rf-disabled);margin-right:4px}
#rfChat:not(.open) .ch-l .tm{display:none}
#rfChat .ch-l .n{color:var(--rf-title);font-weight:700;cursor:default}
#rfChat .ch-l .n.me{color:var(--rf-gold)}
#rfChat .ch-l .ph{color:var(--rf-gold);font-style:italic}
#rfChat .ch-l .ph::before{content:'\\201C'}#rfChat .ch-l .ph::after{content:'\\201D'}
#rfChat .ch-l.sys{color:var(--rf-muted);font-style:italic;font-size:11.5px}
#rfChat .ch-l.sys.bad{color:var(--rf-bad)}
#rfChat .ch-l.mk{cursor:pointer}
#rfChat .ch-l.mk .mi{display:inline-block;vertical-align:-3px;margin-right:3px}
#rfChat .ch-l.mk b.kd{color:var(--mk-c)}
#rfChat .ch-l .wh{color:var(--rf-muted);text-decoration:underline dotted;text-underline-offset:2px}
#rfChat .ch-acts{position:absolute;right:3px;top:1px;display:none;gap:2px}
#rfChat.open .ch-l:hover .ch-acts{display:flex}
#rfChat .ch-acts button{height:17px;padding:0 5px;font:700 9.5px/1 Inter,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:var(--rf-muted);background:var(--rf-raised);border:1px solid var(--rf-rule);cursor:pointer}
#rfChat .ch-acts button:hover{color:var(--rf-bad);border-color:#6a2c1c}
#rfChat .ch-bar{display:none;align-items:center;gap:3px;margin-top:5px}
#rfChat.open .ch-bar{display:flex}
#rfChat .ch-ib{width:24px;height:23px;flex:none;padding:0;display:flex;align-items:center;justify-content:center;background:var(--rf-raised);border:1px solid var(--rf-rule);cursor:pointer;position:relative}
#rfChat .ch-ib:hover{border-color:var(--rf-accent);background:var(--rf-hover)}
#rfChat .ch-pop.on ~ .ch-box [data-a="phrases"],#rfChat .ch-ib.on{border-color:var(--rf-title);background:var(--rf-sel);box-shadow:inset 0 0 0 1px #050506}
#rfChat .ch-ib svg{display:block}
#rfChat .ch-sep{width:1px;height:17px;background:var(--rf-rule);margin:0 2px}
#rfChat input.ch-in{flex:1;min-width:0;width:auto;height:23px;padding:0 6px;font:600 12px/1 Inter,sans-serif;color:var(--rf-ink);background:var(--rf-sunk);border:1px solid var(--rf-line);outline:none;user-select:text}
#rfChat input.ch-in:focus{border-color:var(--rf-accent);box-shadow:0 0 0 1px rgba(207,162,90,.25)}
#rfChat input.ch-in::placeholder{color:var(--rf-disabled)}
#rfChat .ch-cnt{position:absolute;right:6px;bottom:100%;margin-bottom:2px;font:600 10px/1 Inter,sans-serif;color:var(--rf-disabled)}
#rfChat .ch-pop{display:none;pointer-events:auto;margin-bottom:4px;padding:6px;grid-template-columns:1fr 1fr;gap:2px}
#rfChat .ch-pop.on{display:grid}
#rfChat .ch-pop .rf-sec{grid-column:1/-1;margin:0 0 3px}
#rfChat .ch-pop button{height:22px;padding:0 7px;text-align:left;font:600 11.5px/1 Inter,sans-serif;color:var(--rf-ink);background:var(--rf-sunk);border:1px solid var(--rf-rule);cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#rfChat .ch-pop button:hover{border-color:var(--rf-accent);color:#fff6e2;background:var(--rf-hover)}
#rfChat .ch-mutes{display:none;pointer-events:auto;margin-bottom:4px;padding:6px 8px}
#rfChat .ch-mutes.on{display:block}
#rfChat .ch-mutes .r{display:flex;align-items:center;gap:6px;padding:2px 0}
#rfChat .ch-mutes .r button{margin-left:auto}
${markCss('#rfMarks', '#rfMarkEdges')}
#rfMarkPick{position:fixed;left:0;top:0;width:100%;height:100%;z-index:3;cursor:crosshair}
#rfMarkHint{position:fixed;z-index:9;pointer-events:none;padding:3px 7px;white-space:nowrap;font:600 11.5px/1.3 Inter,sans-serif;color:var(--rf-ink);background:rgba(10,11,13,.9);border:1px solid var(--rf-rule);border-left:3px solid var(--mk-c)}
#rfMarkHint b{color:var(--mk-c)}#rfMarkHint .k{color:var(--rf-muted);font-size:10.5px}
`;

/** The kinds' glyphs (16 px grid): a banner, crossed swords, a shield, a cry. */
const GLYPH: Record<MarkKind, string> = {
  gather: '<path d="M4 2h1.6v12H4z"/><path d="M5.6 2.5h7l-2 2.6 2 2.6h-7z"/>',
  attack: '<path d="M2.5 2.5l2.2.2 7.3 7.3-1.6 1.6L3.1 4.3zM13.5 2.5l-.2 2.2-3.6 3.6-1.6-1.6 3.6-3.6z"/><path d="M2.6 11.8l1.6 1.6 1.9-.6-1-1-1.3-1.3-1 1-.2.3zM13.4 11.8l-1.6 1.6-1.9-.6 1-1 1.3-1.3 1 1 .2.3zM5.4 9.8l4.6-4.6 1.2 1.2-4.6 4.6z"/>',
  defend: '<path d="M8 1.8l5.2 1.8v4.1c0 3.2-2.2 5.4-5.2 6.6-3-1.2-5.2-3.4-5.2-6.6V3.6z"/>',
  help: '<path d="M6.8 2h2.4l-.4 7.6H7.2z"/><circle cx="8" cy="12.4" r="1.4"/>',
};
export const markIcon = (k: MarkKind, size = 14, fill = '#fff6e2') => `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="${fill}">${GLYPH[k]}</svg>`;
/** The pin: a shield-shaped drop in the kind's colour, the glyph inside. */
const pin = (k: MarkKind) => `<svg class="pin" width="30" height="44" viewBox="0 0 30 44"><path d="M15 43 4 26C1 21 1 14 4 9 7 4 11 2 15 2s8 2 11 7c3 5 3 12 0 17z" fill="#050506"/><path d="M15 39.5 5.8 25C3.4 21 3.4 15 5.8 10.6 8.2 6.4 11.4 4.4 15 4.4s6.8 2 9.2 6.2c2.4 4.4 2.4 10.4 0 14.4z" fill="${MARK_INFO[k].color}"/><path d="M15 6.4c-2.6 0-5 1.4-6.8 4.4" stroke="rgba(255,255,255,.45)" stroke-width="1.6" fill="none"/><g transform="translate(7 8)" fill="#1a0e08">${GLYPH[k]}</g></svg>`;
const ICON_QUOTE = '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M2 3h12v8H8l-3.5 3v-3H2z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 6h6v1.4H5zM5 8.2h4v1.4H5z"/></svg>';
const ICON_SEND = '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2.5 14.5 8 2 13.5l1.6-4.6L9 8 3.6 7.1z"/></svg>';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hhmm = (t: number) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

/** A line of the log: `ch` its channel (none: a notice, shown in both); `links` its tags' snapshots. */
type Line = { at: number; html: string; cls: string; id?: number; pid?: number; mark?: Mark; ch?: ChatChannel; links?: ChatLinkData[]; name?: string };
const CH_NAME: Record<ChatChannel, string> = { ally: 'Alliance', world: 'World' };

/** A short horn for a mark (two rising notes), a soft tick for a line; the war's sound settings (master x sfx). */
let ac: AudioContext | null = null;
function blip(kind: 'mark' | 'line'): void {
  const s = loadSound();
  if (!s.sound) return;
  const vol = (s.masterVol / 10) * (s.sfxVol / 10) * (kind === 'mark' ? 0.22 : 0.07);
  if (vol <= 0) return;
  try {
    ac ??= new AudioContext();
    const t = ac.currentTime, notes = kind === 'mark' ? [[523, 0], [784, 0.11]] : [[1046, 0]];
    for (const [f, d] of notes) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = kind === 'mark' ? 'triangle' : 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t + d);
      g.gain.linearRampToValueAtTime(vol, t + d + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + (kind === 'mark' ? 0.32 : 0.09));
      o.connect(g).connect(ac.destination);
      o.start(t + d);
      o.stop(t + d + 0.35);
    }
  } catch {
    // no audio
  }
}

let mounted: ChatHandle | null = null;
/** The page's chat holds Esc (the game menu's idle check). */
export const chatBusy = () => mounted?.busy() ?? false;

export function mountChat(v: ChatView): ChatHandle {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'rfChat';
  root.className = 'rf';
  root.innerHTML = `<div class="ch-mutes rf-card"></div><div class="ch-pop rf-card"><div class="rf-sec">Quick phrases</div>${PHRASES.map((p, i) => `<button data-ph="${i}" title="${esc(p)}">${esc(p)}</button>`).join('')}</div>
    <div class="ch-box"><div class="ch-head"><span class="ch-dot"></span><button class="ch-chan" data-ch="ally">Alliance<span class="u"></span></button><button class="ch-chan" data-ch="world">World<span class="u"></span></button><span class="sub"></span><span style="margin-left:auto;display:flex;gap:3px"><button class="rf-tbtn" data-a="mutes" style="height:19px;padding:0 6px;font-size:10.5px;display:none"></button><button class="rf-tbtn x" data-a="close" title="Close (Esc)" style="height:19px;width:19px">×</button></span></div>
    <div class="ch-log"></div>
    <div class="ch-bar" style="position:relative"><button class="ch-ib" data-a="phrases" title="Quick phrases">${ICON_QUOTE}</button><span class="ch-sep ch-mk-sep"></span>${MARK_KINDS.map((k) => `<button class="ch-ib" data-mk="${k}" title="${MARK_INFO[k].name}: then click the map">${markIcon(k, 13, MARK_INFO[k].color)}</button>`).join('')}<span class="ch-sep"></span><input class="ch-in" maxlength="${CHAT_MAX}" spellcheck="false" autocomplete="off"><span class="ch-cnt"></span><button class="ch-ib" data-a="send" title="Send (Enter)">${ICON_SEND}</button></div></div>
    <div class="ch-tab" data-a="open"><span class="ch-dot"></span><span class="nm"></span><span class="u" style="display:none"></span><span class="w"></span><span class="k"></span></div>`;
  root.addEventListener('pointerdown', (e) => e.stopPropagation());
  root.addEventListener('wheel', (e) => e.stopPropagation());
  document.body.appendChild(root);
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const box = $('.ch-box'), log = $('.ch-log'), input = $<HTMLInputElement>('.ch-in'), cnt = $('.ch-cnt'), pop = $('.ch-pop'), mutesEl = $('.ch-mutes');
  const tab = $('.ch-tab'), unreadEl = $('.ch-tab .u'), keyEl = $('.ch-tab .k'), tabName = $('.ch-tab .nm'), tabOther = $('.ch-tab .w'), mutesBtn = $<HTMLButtonElement>('[data-a="mutes"]'), sub = $('.ch-head .sub');

  const layer = document.createElement('div');
  layer.id = 'rfMarks';
  const edges = document.createElement('div');
  edges.id = 'rfMarkEdges';
  document.body.append(layer, edges);

  let you = 0, open = false, armed: MarkKind | null = null, lastKind: MarkKind = 'gather';
  let lines: Line[] = [];
  const muted = new Set<number>(), names = new Map<number, string>();
  const marks = new Map<number, { m: Mark; el: HTMLElement; edge: HTMLElement }>();
  let silencedUntil = 0;
  /** W-69: the channel shown and spoken in; each one's unread lines; the links Shift+clicked into the field. */
  let chan: ChatChannel = 'ally';
  const unread: Record<ChatChannel, number> = { ally: 0, world: 0 };
  let picked: ChatLinkData[] = [];
  /** The open log follows new lines unless the player scrolled up. */
  let pinned = true;

  const lineOf = (m: ChatMsg): Line => {
    names.set(m.pid, m.name);
    const me = m.pid === you;
    const words = m.phrase !== undefined ? `<span class="ph">${esc(chatText(m))}</span>` : tagParts(m.text ?? '', m.links).map((x) => (typeof x === 'string' ? esc(x) : tagHtml(x.link, x.i))).join('');
    const acts = me ? '' : `<span class="ch-acts"><button data-mute="${m.pid}" title="Hide ${esc(m.name)}'s messages">Mute</button><button data-rep="${m.id}" title="Report this message to the moderators">Report</button></span>`;
    return { at: m.at, id: m.id, pid: m.pid, cls: '', ch: m.ch ?? 'ally', links: m.links, name: m.name, html: `<span class="tm">${hhmm(m.at)}</span><span class="n${me ? ' me' : ''}">${esc(m.name)}</span>: ${words}${acts}` };
  };
  const markLine = (m: Mark): Line => ({
    at: m.t, pid: m.pid, mark: m, cls: 'mk', ch: 'ally',
    html: `<span class="tm">${hhmm(m.t)}</span><span class="mi">${markIcon(m.kind, 13, MARK_INFO[m.kind].color)}</span><span class="n${m.pid === you ? ' me' : ''}">${esc(m.name)}</span> <span class="rf-dim">marks</span> <b class="kd" style="--mk-c:${MARK_INFO[m.kind].color}">${MARK_INFO[m.kind].name}</b> · <span class="wh">${esc(v.where(m.at))}</span>`,
  });
  const sys = (text: string, bad = false) => push({ at: Date.now(), cls: `sys${bad ? ' bad' : ''}`, html: esc(text) });

  function push(l: Line, quiet = false): void {
    lines.push(l);
    if (lines.length > 120) lines = lines.slice(-100);
    if (!quiet && l.ch && (!open || l.ch !== chan) && l.pid !== you) unread[l.ch]++;
    render();
  }

  function render(): void {
    const now = Date.now(), shown = lines.filter((l) => (l.pid === undefined || !muted.has(l.pid)) && (!l.ch || l.ch === chan));
    const list = open ? shown : shown.slice(-SHOWN);
    log.innerHTML = list.map((l, i) => `<div class="ch-l ${l.cls}${!open && now - l.at > LINE_FADE_MS ? ' old' : ''}" data-i="${shown.length - list.length + i}">${l.html}</div>`).join('');
    (log as HTMLElement & { _rows?: Line[] })._rows = shown;
    if (!open || pinned) log.scrollTop = log.scrollHeight;
    const other: ChatChannel = chan === 'ally' ? 'world' : 'ally';
    tabName.textContent = CH_NAME[chan];
    unreadEl.style.display = unread[chan] ? '' : 'none';
    unreadEl.textContent = String(Math.min(unread[chan], 99));
    tabOther.textContent = unread[other] ? `${CH_NAME[other]} ${Math.min(unread[other], 99)}` : '';
    for (const b of root.querySelectorAll<HTMLElement>('[data-ch]')) {
      const c = b.dataset.ch as ChatChannel, u = b.querySelector<HTMLElement>('.u')!;
      b.classList.toggle('on', c === chan);
      u.style.display = c !== chan && unread[c] ? '' : 'none';
      u.textContent = String(Math.min(unread[c], 99));
    }
    root.classList.toggle('world', chan === 'world');
    input.placeholder = chan === 'world' ? 'Message every alliance…' : 'Message allies…';
    keyEl.textContent = keys.label('chat.open') || 'Enter';
    for (const d of root.querySelectorAll('.ch-dot')) d.classList.toggle('off', !v.link.live);
    sub.textContent = v.link.live ? (chan === 'world' ? 'everyone' : 'allies only') : 'connecting…';
    mutesBtn.style.display = muted.size ? '' : 'none';
    mutesBtn.textContent = `Muted ${muted.size}`;
    for (const b of root.querySelectorAll<HTMLElement>('[data-mk]')) b.classList.toggle('on', armed === b.dataset.mk);
  }

  function setOpen(on: boolean, focus = on): void {
    open = on;
    root.classList.toggle('open', on);
    box.classList.toggle('rf-card', on);
    tab.style.display = on ? 'none' : '';
    if (on) (unread[chan] = 0), (pinned = true);
    else {
      tagTip.hide();
      pop.classList.remove('on');
      mutesEl.classList.remove('on');
      input.blur();
    }
    render();
    place();
    if (focus) input.focus();
  }

  log.addEventListener('scroll', () => { if (open) pinned = log.scrollTop + log.clientHeight >= log.scrollHeight - 8; });
  // keys typed into the field drive nothing else (WASD would pan the camera)
  input.addEventListener('focus', () => keys.suspend(true));
  input.addEventListener('blur', () => { keys.suspend(false); keys.release(); });
  /** The field's length as sent (a tag one character), and its limit with the tags' names let in. */
  const draft = () => encodeDraft(input.value, picked);
  const count = () => {
    const d = draft(), n = d.text.length;
    input.maxLength = CHAT_MAX + d.links.reduce((a, l) => a + linkLabel(l).length + 1, 0);
    cnt.textContent = n > CHAT_MAX - 40 ? `${n}/${CHAT_MAX}` : '';
  };
  input.addEventListener('input', count);
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); sendText(); setOpen(false); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  });
  const sendText = () => {
    const d = draft(), t = d.text.trim();
    input.value = '';
    picked = [];
    count();
    if (!t) return;
    if (silencedUntil > Date.now()) return sys(`You are muted for spam for ${Math.ceil((silencedUntil - Date.now()) / 1000)} s.`, true);
    v.link.send({ t: 'say', text: t.slice(0, CHAT_MAX), ...(d.links.length ? { links: d.links } : {}), ...(chan === 'world' ? { ch: 'world' as const } : {}) });
  };
  const setChan = (c: ChatChannel) => { chan = c; unread[c] = 0; pinned = true; if (armed && c === 'world') arm(null); render(); };

  // W-69: Shift+click on an item or a man while the field is open puts its tag in the field
  const linkOf = (t: EventTarget | null) => (t instanceof HTMLElement && !root.contains(t) ? markedLink(t) ?? v.linkAt?.(t) ?? null : null);
  for (const type of ['pointerdown', 'mousedown', 'click'] as const) {
    addEventListener(type, (e: Event) => {
      if (!open || !(e as MouseEvent).shiftKey) return;
      const l = linkOf(e.target);
      if (!l) return;
      e.preventDefault();
      e.stopPropagation();
      if (type !== 'click') return;
      const tag = `[${linkLabel(l)}]`, at = input.selectionStart ?? input.value.length;
      const v0 = input.value, pre = v0.slice(0, at) + (at && !/\s$/.test(v0.slice(0, at)) ? ' ' : '');
      const next = `${pre}${tag} ${v0.slice(input.selectionEnd ?? at)}`;
      if (encodeDraft(next, [...picked, l]).links.length <= draft().links.length) return sys('No room for another link in this message.', true);
      picked.push(l);
      input.value = next;
      count();
      input.focus();
      input.setSelectionRange(pre.length + tag.length + 1, pre.length + tag.length + 1);
    }, true);
  }
  // a tag's hover: its card
  const tagTip = mountTagTip();
  log.addEventListener('pointerover', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('.ch-tag');
    if (!t) return;
    const l = (log as HTMLElement & { _rows?: Line[] })._rows?.[Number(t.closest<HTMLElement>('.ch-l')?.dataset.i)];
    const link = l?.links?.[Number(t.dataset.li)];
    if (link) tagTip.show(link, l?.pid === you ? 'your' : `${l?.name ?? 'their'}'s`, t, v.portrait);
  });
  log.addEventListener('pointerout', (e) => { if ((e.target as HTMLElement).closest('.ch-tag')) tagTip.hide(); });

  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement, a = t.closest<HTMLElement>('[data-a]')?.dataset.a;
    const ch = t.closest<HTMLElement>('[data-ch]')?.dataset.ch as ChatChannel | undefined;
    if (ch) return setChan(ch);
    if (a === 'open') return setOpen(true);
    if (a === 'close') return setOpen(false);
    if (a === 'send') { sendText(); input.focus(); return; }
    if (a === 'phrases') { pop.classList.toggle('on'); mutesEl.classList.remove('on'); return; }
    if (a === 'mutes') { renderMutes(); mutesEl.classList.toggle('on'); pop.classList.remove('on'); return; }
    const ph = t.closest<HTMLElement>('[data-ph]')?.dataset.ph;
    if (ph !== undefined) { v.link.send({ t: 'say', phrase: Number(ph), ...(chan === 'world' ? { ch: 'world' as const } : {}) }); pop.classList.remove('on'); return; }
    const mk = t.closest<HTMLElement>('[data-mk]')?.dataset.mk as MarkKind | undefined;
    if (mk) return arm(armed === mk ? null : mk);
    const mu = t.closest<HTMLElement>('[data-mute]')?.dataset.mute;
    if (mu) { const pid = Number(mu); muted.add(pid); v.link.send({ t: 'mute', pid, on: true }); sys(`${names.get(pid) ?? 'That player'} is muted. Unmute from the Muted list.`); return; }
    const un = t.closest<HTMLElement>('[data-unmute]')?.dataset.unmute;
    if (un) { muted.delete(Number(un)); v.link.send({ t: 'mute', pid: Number(un), on: false }); renderMutes(); render(); return; }
    const rep = t.closest<HTMLElement>('[data-rep]')?.dataset.rep;
    if (rep) { v.link.send({ t: 'report', id: Number(rep) }); t.closest('.ch-acts')?.remove(); return; }
    const row = t.closest<HTMLElement>('.ch-l.mk');
    if (row) { const l = (log as HTMLElement & { _rows?: Line[] })._rows?.[Number(row.dataset.i)]; if (l?.mark) v.focus(l.mark); }
  });
  const renderMutes = () => {
    mutesEl.innerHTML = `<div class="rf-sec">Muted players</div>${[...muted].map((pid) => `<div class="r"><span>${esc(names.get(pid) ?? `Player ${pid}`)}</span><button class="rf-tbtn" data-unmute="${pid}" style="height:19px;font-size:10.5px">Unmute</button></div>`).join('') || '<div class="rf-dim">Nobody.</div>'}`;
  };

  // ---------- marks ----------
  const pick = document.createElement('div');
  pick.id = 'rfMarkPick';
  pick.style.display = 'none';
  const hint = document.createElement('div');
  hint.id = 'rfMarkHint';
  hint.style.display = 'none';
  document.body.append(pick, hint);
  const hintText = () => {
    if (!armed) return;
    hint.style.setProperty('--mk-c', MARK_INFO[armed].color);
    hint.innerHTML = `<b>${MARK_INFO[armed].name}</b> · click to mark <span class="k">· ${esc(keys.label('chat.mark') || 'P')} next kind · Esc cancel</span>`;
  };
  function arm(k: MarkKind | null): void {
    armed = k;
    if (k) lastKind = k;
    pick.style.display = hint.style.display = k ? '' : 'none';
    hintText();
    render();
  }
  const follow = (e: PointerEvent) => {
    const w = hint.offsetWidth, flip = e.clientX + 16 + w > innerWidth - 4;
    hint.style.left = `${flip ? e.clientX - 12 - w : e.clientX + 16}px`;
    hint.style.top = `${Math.min(e.clientY + 14, innerHeight - 30)}px`;
  };
  addEventListener('pointermove', (e) => { if (armed) follow(e as PointerEvent); });
  pick.addEventListener('contextmenu', (e) => e.preventDefault());
  pick.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (e.button !== 0 || !armed) return arm(null);
    const p = v.pick(e.clientX, e.clientY);
    if (p) v.link.send({ t: 'mark', kind: armed, at: v.scope, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });
    arm(null);
  });

  function addMark(m: Mark): void {
    const c = MARK_INFO[m.kind].color;
    push(markLine(m), m.pid === you);
    if (muted.has(m.pid)) return;
    blip('mark');
    if (!v.project(m)) return; // another view's: its line only
    const el = document.createElement('div');
    el.className = 'mk';
    el.style.setProperty('--mk-c', c);
    el.innerHTML = `<div class="ring"></div><div class="ring b"></div><div class="dot"></div>${pin(m.kind)}<div class="nm"><i>${MARK_INFO[m.kind].name}</i>${esc(m.name)}</div>`;
    const edge = document.createElement('div');
    edge.className = 'edge';
    edge.style.setProperty('--mk-c', c);
    edge.innerHTML = `<div class="ar">${markIcon(m.kind, 16, c)}</div><div class="tip"></div><div class="nm">${esc(m.name)}</div>`;
    edge.addEventListener('pointerdown', (e) => { e.stopPropagation(); v.focus(m); });
    layer.append(el);
    edges.append(edge);
    const old = [...marks.values()].find((x) => x.m.pid === m.pid); // one mark a player: the new one replaces his last
    if (old) drop(old.m.id);
    marks.set(m.id, { m, el, edge });
    if (marks.size === 1) requestAnimationFrame(frame);
  }
  const drop = (id: number) => { const x = marks.get(id); if (!x) return; x.el.remove(); x.edge.remove(); marks.delete(id); };

  function frame(): void {
    const now = Date.now(), W = innerWidth, H = innerHeight, M = 30;
    for (const { m, el, edge } of marks.values()) {
      const left = m.t + MARK_MS - now;
      if (left <= 0) { drop(m.id); continue; }
      const p = v.project(m);
      if (!p) { el.style.display = edge.style.display = 'none'; continue; }
      const fade = String(Math.min(1, left / 2500));
      const inside = p.x >= 0 && p.y >= 0 && p.x <= W && p.y <= H;
      el.style.display = inside ? '' : 'none';
      edge.style.display = inside ? 'none' : '';
      if (inside) { el.style.transform = `translate(${p.x}px,${p.y}px)`; el.style.opacity = fade; continue; }
      const cx = W / 2, cy = H / 2, dx = p.x - cx, dy = p.y - cy;
      const k = Math.min((cx - M) / Math.max(1e-6, Math.abs(dx)), (cy - M) / Math.max(1e-6, Math.abs(dy)));
      const ang = Math.atan2(dy, dx);
      edge.style.transform = `translate(${cx + dx * k}px,${cy + dy * k}px)`;
      edge.style.opacity = fade;
      (edge.querySelector('.tip') as HTMLElement).style.transform = `rotate(${ang}rad) translateX(19px)`;
    }
    if (marks.size) requestAnimationFrame(frame);
  }

  // ---------- wire ----------
  v.link.start((m: ChatServerMsg) => {
    if (m.t === 'chat') {
      you = m.you;
      muted.clear();
      for (const p of m.muted) muted.add(p);
      lines = lines.filter((l) => l.cls.startsWith('sys') || l.mark);
      for (const x of m.msgs) lines.push(lineOf(x));
      lines.sort((a, b) => a.at - b.at);
      render();
    } else if (m.t === 'said') {
      push(lineOf(m.msg));
      if (m.msg.pid !== you && !muted.has(m.msg.pid)) blip('line');
    } else if (m.t === 'marked') addMark(m.mark);
    else if (m.t === 'chatError') {
      if (m.code === 'slow') sys('Slow down: too many messages. That one was not sent.', true);
      else if (m.code === 'silenced') { silencedUntil = m.until ?? Date.now() + 60_000; sys(`Muted for spam for ${Math.ceil((silencedUntil - Date.now()) / 1000)} s.`, true); }
      else if (m.code === 'noAlliance') sys('Join an alliance to chat.', true);
      else if (m.code === 'reported') sys('Reported. A moderator will look at it.');
      else if (m.code === 'link') sys('You can only link your own men. That message was not sent.', true);
    }
  });

  addEventListener('keydown', (e: KeyboardEvent) => {
    const a = keys.act(e);
    if (a === 'chat.open' && !open && (v.canOpen?.() ?? true)) { e.preventDefault(); setOpen(true); }
    else if (a === 'chat.mark' && chan === 'ally') { e.preventDefault(); arm(armed ? MARK_KINDS[(MARK_KINDS.indexOf(armed) + 1) % MARK_KINDS.length] : lastKind); }
    else if (a === 'back' && armed) arm(null);
    else if (a === 'back' && open) setOpen(false);
  });

  const place = () => { root.style.zoom = String(v.zoom()); v.place(root, open); };
  place();
  addEventListener('resize', place);
  setInterval(() => { place(); if (!open) render(); }, 1000);
  render();

  return (mounted = {
    busy: () => !!armed || open,
    open: () => setOpen(true),
  });
}
