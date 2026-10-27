/**
 * W-62 E5 replays in the HUD: the recorder on the sim client's snapshots (./buffer.ts, the last 3 minutes as this
 * client saw them, online and offline), "Watch the battle" offered after a big fight, siege or guardian kill
 * (./moments.ts), and the replay mode:
 *
 *   top centre     REPLAY tag, how far behind live, Esc back
 *   bottom centre  the replay bar: scrub track (the clip's in-out range, the moments marked), back 5 s / play / on 5 s,
 *                  the time, speed 0.5x-4x, the man followed, In / Out / Clip, Live
 *   the map        free camera (drag, wheel, WASD and arrows); click a man to follow him, empty ground lets go
 *   keys           Esc live (or stops a clip), Space or K play / pause, J / L 5 s back / on, - / = speed, I / O in / out
 *
 * While it plays the view draws from ./player.ts (../simClient.ts `replay`): live orders and the camera rect are held
 * back, the rest of the HUD is hidden, and the live sim runs on beneath. Clip: the in-out range played again at the
 * chosen speed and recorded off the canvas (./clip.ts), the HUD never in it, then downloaded.
 */
import type { SandboxScene } from '../SandboxScene';
import { ReplayBuffer } from './buffer';
import { Moments, type Moment } from './moments';
import { RATES, ReplayPlayer, TICK_MS } from './player';
import { clipType, download, recordClip, type ClipRec } from './clip';
import { menuBtn } from '../hud/kit';

type Mk = (id: string, css: string, html?: string) => HTMLElement;

const SKIP = 50; // J / L: 5 s
const TOAST_MS = 25_000;
const PICK_PX = 26;

const svg = (d: string, w = 14) => `<svg width="${w}" height="${w}" viewBox="0 0 14 14" aria-hidden="true"><path d="${d}" fill="currentColor"/></svg>`;
const G = {
  play: svg('M3 1.5 L12 7 L3 12.5 Z'),
  pause: svg('M3 2 H6 V12 H3 Z M8 2 H11 V12 H8 Z'),
  back: svg('M7 2 L1 7 L7 12 Z M13 2 L7 7 L13 12 Z'),
  fwd: svg('M1 2 L7 7 L1 12 Z M7 2 L13 7 L7 12 Z'),
  follow: svg('M7 3 C3.5 3 1.5 7 1.5 7 C1.5 7 3.5 11 7 11 C10.5 11 12.5 7 12.5 7 C12.5 7 10.5 3 7 3 Z M7 5 A2 2 0 1 0 7 9 A2 2 0 1 0 7 5 Z'),
  clip: svg('M1 3 H10 V11 H1 Z M10.5 6 L13 4 V10 L10.5 8 Z'),
  stop: svg('M2.5 2.5 H11.5 V11.5 H2.5 Z'),
  live: svg('M2 2 L8 7 L2 12 Z M9 2 H12 V12 H9 Z'),
  replay: svg('M7 1.5 A5.5 5.5 0 1 1 1.6 6 H0 L2.5 3 L5 6 H3.2 A3.9 3.9 0 1 0 7 3.1 Z M6.2 4.5 H7.6 V7.2 L9.6 8.4 L8.9 9.6 L6.2 8 Z', 13),
};

const CSS = `
body.war-replay>:not(#game):not(.rp){display:none!important}
#rpPad{position:fixed;inset:0;z-index:3;touch-action:none}
#rpPad.drag{cursor:grabbing!important}
.rp .rp-card{padding:7px 10px 6px;display:flex;flex-direction:column;gap:6px}
.rp-track{position:relative;height:17px;cursor:pointer}
.rp-track .tr{position:absolute;left:0;right:0;top:5px;height:6px;background:var(--rf-sunk);border:1px solid var(--rf-rule);box-shadow:inset 0 1px 2px rgba(0,0,0,.7)}
.rp-track .rg{position:absolute;top:5px;height:6px;background:linear-gradient(#7a3418,#5a2610);border-top:1px solid #b0542a}
.rp-track .mk{position:absolute;top:13px;height:3px;min-width:3px;background:var(--rf-gold);box-shadow:0 0 0 1px #0e0907}
.rp-track .mk.siege{background:var(--rf-bad)}.rp-track .mk.boss{background:#c08cf0}
.rp-track .io{position:absolute;top:2px;width:2px;height:12px;background:var(--rf-title);margin-left:-1px}
.rp-track .hd{position:absolute;top:1px;width:10px;height:14px;margin-left:-5px;background:linear-gradient(#ffe0b8,#de8a4e);border:1px solid #0e0907;box-shadow:0 0 0 1px #7a3418,0 1px 3px rgba(0,0,0,.6)}
.rp-track .lv{position:absolute;right:-1px;top:2px;width:3px;height:12px;background:var(--rf-good);opacity:.8}
.rp-row{display:flex;align-items:center;gap:4px;white-space:nowrap}
.rp-row .rf-tbtn{min-width:26px;padding:0 6px}
.rp-row .rf-tbtn svg,.rp-fol svg,#rpToast svg{display:block;flex:none}
.rp-row .rf-tbtn.big{min-width:34px}
.rp-time{font:700 12.5px/1 Inter,sans-serif;color:var(--rf-ink);min-width:86px;text-align:center;font-variant-numeric:tabular-nums}
.rp-time i{font-style:normal;color:var(--rf-muted);font-weight:600}
.rp-seg{display:flex}.rp-seg .rf-tbtn{min-width:32px;padding:0 5px;margin-right:-1px;font-size:11.5px}
.rp-fol{flex:1;min-width:0;display:flex;align-items:center;gap:5px;padding:0 4px;color:var(--rf-muted);font-size:11.5px}
.rp-fol span{overflow:hidden;text-overflow:ellipsis}
.rp-fol.on{color:var(--rf-title)}
.rp-top{display:flex;align-items:center;gap:8px;font-size:12px}
.rp-top .tag{display:inline-flex;align-items:center;gap:5px;font:700 12px/1 Cinzel,serif;letter-spacing:.12em;color:var(--rf-title)}
.rp-top .tag i{width:7px;height:7px;border-radius:50%;background:#e04a2a;box-shadow:0 0 6px #e04a2a;animation:rpBlink 1.4s steps(2) infinite}
.rp-top.rec .tag{color:#ff9c80}
.rp-top b{color:var(--rf-accent)}
@keyframes rpBlink{50%{opacity:.25}}
#rpToast .rf-card{display:flex;align-items:center;gap:9px;padding:7px 9px 6px 8px}
#rpToast .ttl{font:var(--rf-title-font);color:var(--rf-title)}
#rpToast .sub{font:600 11.5px/1.3 Inter,sans-serif;color:var(--rf-muted);margin-top:2px}
#rpToast .ic{width:24px;height:24px;color:var(--rf-accent);display:flex;align-items:center;justify-content:center}
#rpToast{animation:rpIn .25s ease-out}
@keyframes rpIn{from{transform:translate(-50%,-8px);opacity:0}}`;

const mmss = (ticks: number) => {
  const s = Math.max(0, Math.round((ticks * TICK_MS) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const TITLE: Record<Moment['kind'], string> = { fight: 'The battle is over', siege: 'The siege is over', boss: 'The guardian is slain' };

export interface Replay { buf: ReplayBuffer; moments: Moments; open(range?: { from: number; to: number }): void; close(): void; readonly active: boolean }

export function mountReplay(s: SandboxScene, mk: Mk): Replay {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const buf = new ReplayBuffer(), moments = new Moments();
  s.sim.onSnap = (cur, fog) => {
    if (buf.frames.length && cur.tick <= buf.last) moments.reset(); // a new sim or region: the record starts over
    moments.feed(buf.push(cur, fog));
  };

  // ---------- the offer after a big moment ----------
  const toast = mk('rpToast', 'left:50%;top:46px;transform:translateX(-50%);pointer-events:auto;display:none;z-index:5');
  toast.innerHTML = `<div class="rf-card"><div class="ic">${G.replay.replace(/13/g, '22')}</div><div><div class="ttl"></div><div class="sub"></div></div>
    <button class="rf-tbtn pri" data-act="watch">${G.play} Watch the battle</button><button class="rf-tbtn x" data-act="x" title="dismiss">×</button></div>`;
  let offer: Moment | null = null, toastAt = 0;
  const showToast = (m: Moment | null, title: string, sub: string) => {
    offer = m;
    toast.querySelector('.ttl')!.textContent = title;
    toast.querySelector('.sub')!.textContent = sub;
    toast.querySelector<HTMLElement>('[data-act=watch]')!.style.display = m ? '' : 'none';
    toast.style.display = '';
    toastAt = performance.now();
  };
  toast.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (a === 'watch' && offer) open(offer);
    if (a) toast.style.display = 'none';
  });
  moments.onMoment = (m) => {
    if (player) return;
    const what = m.kind === 'boss' ? 'and his fall' : m.razed ? `${m.fell} fell, ${m.razed} ${m.razed === 1 ? 'building' : 'buildings'} destroyed` : `${m.fell} men fell`;
    showToast(m, TITLE[m.kind], `${mmss(m.to - m.from)} of it recorded${m.kind === 'boss' ? '' : ' · ' + what}`);
  };

  // ---------- the HUD's menu bar: the Replay button (beside World; ../hud/kit.ts menuBtn) ----------
  const rb = menuBtn('rfReplay', 'menu-replay', 'Replay', 'watch the last 3 minutes again (what your men saw)', 'replay.open', 1);
  rb.style.marginRight = '6px'; // World and Replay apart from the windows' buttons
  rb.onclick = () => open();

  // ---------- replay mode ----------
  const pad = document.createElement('div');
  pad.id = 'rpPad';
  pad.className = 'rp';
  pad.style.display = 'none';
  document.body.appendChild(pad);
  const top = mk('rpTop', 'left:50%;top:6px;transform:translateX(-50%);display:none;z-index:5');
  top.classList.add('rp', 'rf-label', 'rp-top');
  const bar = mk('rpBar', 'left:50%;bottom:6px;transform:translateX(-50%);width:720px;max-width:calc(100vw - 16px);pointer-events:auto;display:none;z-index:5');
  bar.classList.add('rp');
  top.classList.add('rp');
  toast.classList.add('rp');
  bar.innerHTML = `<div class="rf-card rp-card">
    <div class="rp-track" id="rpTrack"><div class="tr"></div><div class="rg"></div><div class="mks"></div><div class="lv" title="live"></div><div class="io" data-io="in"></div><div class="io" data-io="out"></div><div class="hd"></div></div>
    <div class="rp-row">
      <button class="rf-tbtn" data-act="back" title="5 s back (J)">${G.back}</button>
      <button class="rf-tbtn big pri" data-act="play" title="play / pause (Space, K)"></button>
      <button class="rf-tbtn" data-act="fwd" title="5 s on (L)">${G.fwd}</button>
      <div class="rp-time" id="rpTime"></div>
      <div class="rp-seg">${RATES.map((r) => `<button class="rf-tbtn" data-rate="${r}" title="speed (- / =)">${r === 0.5 ? '½' : r}×</button>`).join('')}</div>
      <div class="rf-sep"></div>
      <div class="rp-fol" id="rpFol" title="click a man on the map to follow him; drag the map to let go">${G.follow}<span></span></div>
      <button class="rf-tbtn" data-act="in" title="the clip starts here (I)">In</button>
      <button class="rf-tbtn" data-act="out" title="the clip ends here (O)">Out</button>
      <button class="rf-tbtn" data-act="clip" title="record the In-Out range as a video file (webm), without the HUD">${G.clip} Clip</button>
      <div class="rf-sep"></div>
      <button class="rf-tbtn" data-act="live" title="back to the live game (Esc)">${G.live} Live</button>
    </div></div>`;
  const $ = <T extends HTMLElement>(q: string) => bar.querySelector<T>(q)!;
  const track = $('#rpTrack'), head = $('.hd'), range = $('.rg'), marks = $('.mks'), ioIn = $('[data-io=in]'), ioOut = $('[data-io=out]');
  const playBtn = $('[data-act=play]'), timeEl = $('#rpTime'), fol = $('#rpFol'), folName = fol.querySelector('span')!;
  if (!clipType()) Object.assign($<HTMLButtonElement>('[data-act=clip]'), { disabled: true, title: 'this browser cannot record video' });

  let player: ReplayPlayer | null = null;
  let inPt = 0, outPt = 0, follow = -1;
  let saved: { x: number; y: number; zoom: number } | null = null;
  let rec: ClipRec | null = null;
  let recEnd = 0;

  function open(m?: { from: number; to: number }): void {
    if (buf.frames.length < 2) { showToast(null, 'Nothing recorded yet', 'replays keep the last 3 minutes of what your men saw'); return; }
    if (player) close();
    const cam = s.cameras.main;
    saved = { x: cam.scrollX, y: cam.scrollY, zoom: cam.zoom };
    player = new ReplayPlayer(buf);
    inPt = Math.max(buf.first, m?.from ?? buf.first);
    outPt = Math.min(buf.last, m?.to ?? buf.last);
    if (outPt - inPt < 10) (inPt = buf.first), (outPt = buf.last);
    player.seek(inPt);
    s.sim.replay = player;
    setFollow(-1);
    document.body.classList.add('war-replay');
    for (const el of [pad, top, bar]) el.style.display = '';
    toast.style.display = 'none';
    // a moment: the camera on where the blows fell (the men fighting halfway through it)
    if (m) {
      const mid = buf.snapshot(buf.indexAt((inPt + outPt) / 2))?.units ?? [];
      const fighting = mid.filter((u) => u.state === 'attack'), pick = fighting.length ? fighting : mid.filter((u) => u.state !== 'dead');
      if (pick.length) s.focus(pick.reduce((a, u) => a + u.x, 0) / pick.length, pick.reduce((a, u) => a + u.y, 0) / pick.length);
    }
    paint();
  }

  function close(): void {
    if (!player) return;
    rec?.cancel();
    rec = null;
    player = null;
    s.sim.replay = null;
    document.body.classList.remove('war-replay');
    for (const el of [pad, top, bar]) el.style.display = 'none';
    const cam = s.cameras.main;
    if (saved) cam.setZoom(saved.zoom).setScroll(saved.x, saved.y);
  }

  const setFollow = (id: number) => {
    follow = id;
    player?.picked.clear();
    if (id >= 0) player?.picked.add(id);
  };
  const seek = (t: number) => { if (player && !rec) player.seek(t); };
  const at = (e: PointerEvent) => {
    const r = track.getBoundingClientRect();
    return buf.first + Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (buf.last - buf.first);
  };

  // ---------- clip ----------
  const startClip = () => {
    if (!player || rec) return;
    if (outPt - inPt < 5) (inPt = buf.first), (outPt = buf.last);
    player.seek(inPt);
    player.playing = true;
    rec = recordClip(s.game);
    recEnd = outPt;
    if (!rec) showToast(null, 'Clips need a browser that records video', 'Chrome, Edge or Firefox can');
  };
  const finishClip = async () => {
    const r = rec;
    rec = null;
    if (!r) return;
    const blob = await r.stop();
    if (player) player.playing = false;
    if (!blob) return;
    const d = new Date(), p = (n: number) => String(n).padStart(2, '0');
    download(blob, `pixelarrow-battle-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.webm`);
    showToast(null, 'Clip saved', `${(blob.size / 2 ** 20).toFixed(1)} MB webm, in your downloads`);
    if (player) toast.style.display = '';
  };
  (window as unknown as { __replay: unknown }).__replay = { buf, moments, open, close, clip: startClip, get player() { return player; }, get rec() { return rec; } };

  // ---------- the bar ----------
  bar.addEventListener('click', (e) => {
    const t = e.target as HTMLElement, a = t.closest<HTMLElement>('[data-act]')?.dataset.act, r = t.closest<HTMLElement>('[data-rate]')?.dataset.rate;
    if (!player) return;
    if (r) player.rate = Number(r);
    if (a === 'live') close();
    else if (a === 'clip') (rec ? void finishClip() : startClip());
    else if (rec) return;
    else if (a === 'play') { if (player.t >= buf.last - 0.01) player.seek(inPt); player.playing = !player.playing; }
    else if (a === 'back') seek(player.t - SKIP);
    else if (a === 'fwd') seek(player.t + SKIP);
    else if (a === 'in') { inPt = Math.min(player.t, outPt - 10); }
    else if (a === 'out') { outPt = Math.max(player.t, inPt + 10); }
    paint();
  });
  let scrub = false;
  track.addEventListener('pointerdown', (e) => { if (rec) return; scrub = true; track.setPointerCapture(e.pointerId); seek(at(e)); paint(); });
  track.addEventListener('pointermove', (e) => { if (scrub) { seek(at(e)); paint(); } });
  track.addEventListener('pointerup', () => { scrub = false; });

  /** innerHTML only when it changed (a button rebuilt under the pointer loses its click). */
  const html = (el: HTMLElement, h: string) => { if (el.dataset.h !== h) (el.dataset.h = h), (el.innerHTML = h); };
  const pct = (t: number) => `${(((t - buf.first) / Math.max(1, buf.last - buf.first)) * 100).toFixed(2)}%`;
  let shown = '';
  function paint(): void {
    const p = player;
    if (!p) return;
    head.style.left = pct(p.t);
    range.style.left = pct(inPt);
    range.style.width = `calc(${pct(outPt)} - ${pct(inPt)})`;
    ioIn.style.left = pct(inPt);
    ioOut.style.left = pct(outPt);
    const ms = moments.found.filter((m) => m.to > buf.first);
    const key = ms.map((m) => `${m.from}-${m.to}`).join() + '|' + buf.first;
    if (key !== shown) {
      shown = key;
      marks.innerHTML = ms.map((m) => `<div class="mk ${m.kind}" title="${TITLE[m.kind]}" style="left:${pct(Math.max(m.from, buf.first))};width:calc(${pct(m.to)} - ${pct(Math.max(m.from, buf.first))})"></div>`).join('');
    }
    html(playBtn, p.playing ? G.pause : G.play);
    // the time within the clip range (fixed ticks: it runs while playing, as the whole window slides along with live)
    const into = p.t - inPt;
    html(timeEl, `${into < 0 ? '−' : ''}${mmss(Math.abs(into))} <i>/ ${mmss(outPt - inPt)}</i>`);
    bar.querySelectorAll<HTMLElement>('[data-rate]').forEach((b) => b.classList.toggle('on', Number(b.dataset.rate) === p.rate));
    const d = follow >= 0 ? s.drawn.find((x) => x.u.id === follow) : null;
    fol.classList.toggle('on', !!d);
    folName.textContent = d ? manName(d.u.cls, d.u.state) : 'Click to follow';
    for (const b of bar.querySelectorAll<HTMLButtonElement>('[data-act=back],[data-act=fwd],[data-act=play],[data-act=in],[data-act=out]')) b.disabled = !!rec;
    $('[data-act=clip]').classList.toggle('on', !!rec);
    html($('[data-act=clip]'), rec ? `${G.stop} Stop` : `${G.clip} Clip`);
    top.classList.toggle('rec', !!rec);
    const behind = mmss(buf.last - p.t);
    html(top, rec
      ? `<span class="tag"><i></i>REC</span><span>${mmss(p.t - inPt)} / ${mmss(recEnd - inPt)}</span><span class="rf-dim">the HUD is left out</span>`
      : `<span class="tag"><i></i>REPLAY</span><span><b>${behind}</b> behind live</span><span class="rf-dim"><b>Space</b> play · <b>J</b> / <b>L</b> ±5 s · <b>Esc</b> back to live</span>`);
  }

  // ---------- free camera, following ----------
  let down: { x: number; y: number; sx: number; sy: number; moved: boolean } | null = null;
  pad.addEventListener('pointerdown', (e) => {
    const cam = s.cameras.main;
    down = { x: e.clientX, y: e.clientY, sx: cam.scrollX, sy: cam.scrollY, moved: false };
    pad.setPointerCapture(e.pointerId);
  });
  pad.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (!down.moved && Math.hypot(dx, dy) < 5) return;
    down.moved = true;
    pad.classList.add('drag');
    setFollow(-1);
    const cam = s.cameras.main;
    cam.setScroll(down.sx - dx / cam.zoom, down.sy - dy / cam.zoom);
  });
  pad.addEventListener('pointerup', (e) => {
    pad.classList.remove('drag');
    const was = down;
    down = null;
    if (!was || was.moved || e.button !== 0) return;
    let best = -1, bd = PICK_PX;
    for (const d of s.drawn) {
      if (d.u.state === 'dead') continue;
      const p = s.toScreen(d.x, d.y), dd = Math.hypot(p.x - e.clientX, p.y - 8 - e.clientY);
      if (dd < bd) (bd = dd), (best = d.u.id);
    }
    setFollow(best);
    paint();
  });
  pad.addEventListener('wheel', (e) => { e.preventDefault(); s.zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? -1 : 1); }, { passive: false });

  // ---------- keys: every key is the replay's while it plays (the live game's are held back) ----------
  addEventListener('keydown', (e: KeyboardEvent) => {
    if (!player) return;
    e.stopPropagation();
    const k = e.key, p = player;
    if (k === 'Escape') { if (rec) void finishClip(); else close(); }
    else if (rec) return;
    else if (k === ' ' || k === 'k' || k === 'K') { if (p.t >= buf.last - 0.01) p.seek(inPt); p.playing = !p.playing; }
    else if (k === 'j' || k === 'J') seek(p.t - SKIP);
    else if (k === 'l' || k === 'L') seek(p.t + SKIP);
    else if (k === '-' || k === '=' || k === '+') p.rate = RATES[Math.max(0, Math.min(RATES.length - 1, RATES.indexOf(p.rate as never) + (k === '-' ? -1 : 1)))];
    else if (k === 'i' || k === 'I') inPt = Math.min(p.t, outPt - 10);
    else if (k === 'o' || k === 'O') outPt = Math.max(p.t, inPt + 10);
    else return;
    e.preventDefault();
    paint();
  }, true);

  // ---------- each frame: play on, follow, end a clip, the toast's time ----------
  s.events.on('preupdate', (_t: number, dt: number) => {
    if (toast.style.display !== 'none' && performance.now() - toastAt > TOAST_MS) toast.style.display = 'none';
    const p = player;
    if (!p) return;
    p.step(dt);
    if (rec && (p.t >= recEnd - 1e-6 || !p.playing)) void finishClip();
    if (follow >= 0) {
      const d = p.units().find((x) => x.u.id === follow);
      if (d) {
        const cam = s.cameras.main, tx = s.iso.sx(d.x, d.y) - cam.width / 2, ty = s.iso.sy(d.x, d.y, s.iso.zAt(d.x, d.y)) - cam.height / 2;
        const k = 1 - Math.exp(-dt / 140);
        cam.setScroll(cam.scrollX + (tx - cam.scrollX) * k, cam.scrollY + (ty - cam.scrollY) * k);
      }
    }
    paint();
  });

  return { buf, moments, open, close, get active() { return !!player; } };
}

const CLS: Record<string, string> = { militia: 'Militiaman', hoplite: 'Hoplite', celt_sword: 'Swordsman', archer: 'Archer', slinger: 'Slinger', javelineer: 'Javelineer' };
const manName = (cls: string, state: string) => `${CLS[cls] ?? cls.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())}${state === 'dead' ? ' (fallen)' : ''}`;
