/**
 * The region's loading screen: one front card from the page's first paint (sandbox.html runs this module as its own
 * entry, ahead of ./main.ts's big import graph) until the region is playable, then a short fade. Every way in lands
 * here: the menu's muster and home pick, the world map's travel, a settlement jump (each a page load of sandbox.html).
 *
 * The bar is real progress, weighted by PARTS: the region file, the terrain and object art (per image), the soldier
 * sheets, the scene, the first snapshot, the building / siege / trade art, the camera on the player's men, and the
 * chunks the view shows baked. `watchScene` decides the region is ready (see `sceneReady`).
 *
 * The failure path: a boot error, or no progress for STALL_MS, turns the card into a message with Retry (a reload) and
 * Main menu. Net mode's line at the gate (./hud/gate.ts) takes over the screen: the loader steps aside for its card.
 * `window.__load` is the loader, for scripts.
 */
import '@fontsource/inter/600.css';
import '@fontsource/cinzel/700.css';
import { WORLD_REGIONS } from '../regions';
import { loreOf } from '../../data/warLore';
import { TOKENS, UI } from './hud/kit';
import type { SandboxScene } from './SandboxScene';

/** What fills the bar, and how much of it. */
export const PARTS = { region: 4, art: 34, sheets: 14, scene: 4, snapshot: 10, buildArt: 10, camera: 4, view: 20 } as const;
export type Part = keyof typeof PARTS;
/** Shown at least this long once up (no flicker when loading is quick); the fade out. */
export const MIN_SHOW_MS = 400;
export const FADE_MS = 420;
/** No progress for this long: the region did not load. */
export const STALL_MS = 25_000;
/** World entry: the camera waits this long after the first snapshot for the player's men, then opens where it is. */
export const CAMERA_WAIT_MS = 6_000;

/** The parts' progress (0-1 each, never back) and the bar's fraction; the time of the last step forward. */
export class LoadProgress {
  private at = new Map<Part, number>();
  last: number;
  constructor(now: number) { this.last = now; }

  /** Part p is fraction f done; false when that is no step forward. */
  set(p: Part, f: number, now: number): boolean {
    const v = Math.max(0, Math.min(1, f));
    if (v <= (this.at.get(p) ?? 0)) return false;
    this.at.set(p, v);
    this.last = now;
    return true;
  }

  get(p: Part): number { return this.at.get(p) ?? 0; }

  fraction(): number {
    let sum = 0, all = 0;
    for (const [k, w] of Object.entries(PARTS) as [Part, number][]) { sum += w * this.get(k); all += w; }
    return sum / all;
  }

  stalled(now: number): boolean { return now - this.last > STALL_MS; }
}

/** The world map's name and lore line of a region, and what kind of place it is. */
export function regionTitle(id: string): { name: string; kind: string; lore: string } {
  const w = WORLD_REGIONS.find((r) => r.id === id) as { name: string; role: string } | undefined;
  const lore = loreOf(id);
  const kind = !w ? 'Region' : w.role === 'home' ? 'Home town' : w.role === 'entry' ? 'Borderland'
    : w.role === 'center' ? 'The heart of the war' : lore.startsWith('Landmark:') ? 'Landmark' : 'Wild land';
  return { name: w?.name ?? '', kind, lore: lore.replace(/^Landmark: [^.]+\.\s*/, '') };
}

/** What the scene shows now, for `sceneReady`. */
export interface SceneState {
  /** A snapshot is in. */
  snap: boolean;
  /** The building, siege and trade art settled (loaded or failed). */
  art: boolean;
  /** The camera stands where the player starts. */
  camera: boolean;
  /** Visible chunks still to bake (-1 before the first frame). */
  pending: number;
}

/** Playable: the snapshot in, the art settled, the camera placed and every chunk it shows baked. */
export const sceneReady = (s: SceneState): boolean => s.snap && s.art && s.camera && s.pending === 0;

const CSS = TOKENS + `
#rfLoad{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:#0e0907;color:var(--rf-ink);
  font:600 12px/1.3 Inter,system-ui,sans-serif;user-select:none;transition:opacity ${FADE_MS}ms ease;cursor:progress}
#rfLoad.out{opacity:0;pointer-events:none}
#rfLoad .ld-bg{position:absolute;inset:0;background:#0e0907 url(war/world/base.jpg) center/cover no-repeat;opacity:.32;filter:blur(2px) saturate(.7);transform:scale(1.06);animation:ld-drift 40s ease-in-out infinite alternate}
#rfLoad .ld-bg::after{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 50% 46%,rgba(14,9,7,.35) 0%,rgba(14,9,7,.82) 60%,#0e0907 100%)}
#rfLoad .ld-col{position:relative;display:flex;flex-direction:column;align-items:center;text-align:center;width:min(440px,calc(100vw - 32px))}
#rfLoad .ld-em{position:relative;width:132px;height:132px;margin-bottom:14px}
#rfLoad .ld-ring{position:absolute;inset:0;background:url(${UI}frames/minimap-round@2x.png) center/100% 100% no-repeat;image-rendering:pixelated;animation:ld-turn 24s linear infinite}
#rfLoad .ld-core{position:absolute;inset:16px;border-radius:50%;background:radial-gradient(circle,#2c1c15 0%,#17100d 70%);box-shadow:inset 0 0 18px #0e0907}
#rfLoad .ld-core i{position:absolute;inset:0;margin:auto;width:64px;height:64px;background:url(${UI}icons/32/unit-hoplite@2x.png) center/64px 64px no-repeat;image-rendering:pixelated;animation:ld-pulse 1.8s ease-in-out infinite}
#rfLoad .ld-kind{font:700 10px/1 Inter,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:var(--rf-accent)}
#rfLoad h1{margin:6px 0 0;font:700 34px/1.05 Cinzel,serif;letter-spacing:.08em;color:var(--rf-title);text-shadow:0 2px 0 #3d1a0b,0 0 18px rgba(222,138,78,.3)}
#rfLoad .ld-orn{display:flex;align-items:center;gap:8px;margin:10px 0 0}
#rfLoad .ld-orn i{display:block;width:90px;height:1px;background:linear-gradient(90deg,transparent,var(--rf-accent),transparent)}
#rfLoad .ld-orn b{width:6px;height:6px;transform:rotate(45deg);background:var(--rf-accent)}
#rfLoad .ld-lore{min-height:34px;margin:10px 0 0;font:italic 500 13px/1.4 Georgia,serif;color:#d2bc9e;letter-spacing:.02em}
#rfLoad .ld-bar{position:relative;width:280px;height:10px;margin:18px 0 0;padding:2px;border:1px solid var(--rf-line);background:var(--rf-sunk);box-shadow:0 0 0 1px #0e0907}
#rfLoad .ld-bar b{display:block;height:100%;width:0;background:linear-gradient(90deg,#7a3418,#de8a4e 70%,#f2b27a);transition:width .3s ease-out;position:relative;overflow:hidden}
#rfLoad .ld-bar b::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,240,216,.35),transparent);transform:translateX(-100%);animation:ld-shine 1.6s ease-in-out infinite}
#rfLoad .ld-step{margin:8px 0 0;min-height:15px;font:600 11.5px/1.3 Inter,sans-serif;color:var(--rf-muted);letter-spacing:.03em}
#rfLoad .ld-err{display:none;margin:16px 0 0;padding:12px 16px 14px;border:1px solid var(--rf-line);background:var(--rf-panel);box-shadow:0 0 0 1px #0e0907,0 6px 24px rgba(0,0,0,.5)}
#rfLoad .ld-err h2{margin:0 0 6px;font:700 15px/1.2 Cinzel,serif;color:var(--rf-title)}
#rfLoad .ld-err p{margin:0 0 12px;color:var(--rf-bad);max-width:360px;overflow-wrap:anywhere}
#rfLoad .ld-err button{height:28px;min-width:96px;margin:0 4px;padding:0 14px;font:700 13px/1 Cinzel,serif;letter-spacing:.04em;color:var(--rf-ink);background:var(--rf-raised);border:1px solid var(--rf-line);cursor:pointer}
#rfLoad .ld-err button.pri{background:var(--rf-sel);color:#fff0d8;border-color:var(--rf-accent)}
#rfLoad .ld-err button:hover,#rfLoad .ld-err button:focus-visible{filter:brightness(1.2);outline:none}
#rfLoad.fail{cursor:default}
#rfLoad.fail .ld-err{display:block}
#rfLoad.fail .ld-bar,#rfLoad.fail .ld-step{display:none}
#rfLoad.fail .ld-ring,#rfLoad.fail .ld-core i{animation:none;filter:grayscale(.6) brightness(.7)}
@keyframes ld-turn{to{transform:rotate(360deg)}}
@keyframes ld-pulse{0%,100%{transform:scale(1);opacity:.85;filter:drop-shadow(0 0 0 rgba(242,178,122,0))}50%{transform:scale(1.08);opacity:1;filter:drop-shadow(0 0 8px rgba(242,178,122,.55))}}
@keyframes ld-shine{to{transform:translateX(100%)}}
@keyframes ld-drift{from{transform:scale(1.06)}to{transform:scale(1.12) translate(-1%,.6%)}}
@media (prefers-reduced-motion:reduce){#rfLoad .ld-ring,#rfLoad .ld-core i,#rfLoad .ld-bg,#rfLoad .ld-bar b::after{animation:none}}
`;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** The screen on the page: progress, the step's words, ready (fade out), fail (Retry), step aside. */
export class LoadScreen {
  readonly progress = new LoadProgress(performance.now());
  private el: HTMLElement;
  private bar: HTMLElement;
  private stepEl: HTMLElement;
  private shown = performance.now();
  private state: 'loading' | 'done' | 'failed' = 'loading';
  private stall: ReturnType<typeof setInterval>;
  /** Keys go nowhere while the screen is up (no pan, no menu); the browser's own shortcuts still work. */
  private block = (e: KeyboardEvent) => { if (this.state !== 'done') e.stopImmediatePropagation(); };

  constructor(id: string) {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    const t = regionTitle(id);
    this.el = document.createElement('div');
    this.el.id = 'rfLoad';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
    this.el.innerHTML = `<div class="ld-bg"></div><div class="ld-col">
      <div class="ld-em"><div class="ld-ring"></div><div class="ld-core"><i></i></div></div>
      <div class="ld-kind">${esc(t.kind)}</div><h1>${esc(t.name || 'Entering')}</h1>
      <div class="ld-orn"><i></i><b></b><i></i></div>
      <p class="ld-lore">${esc(t.lore)}</p>
      <div class="ld-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><b></b></div>
      <div class="ld-step">Reading the land…</div>
      <div class="ld-err" role="alert"><h2>The region did not load</h2><p></p>
        <button class="pri" data-k="retry">Retry</button><button data-k="menu">Main menu</button></div>
    </div>`;
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('wheel', (e) => e.stopPropagation());
    this.el.querySelector<HTMLElement>('[data-k=retry]')!.onclick = () => location.reload();
    this.el.querySelector<HTMLElement>('[data-k=menu]')!.onclick = () => (location.href = 'index.html');
    this.bar = this.el.querySelector('.ld-bar b')!;
    this.stepEl = this.el.querySelector('.ld-step')!;
    document.body.appendChild(this.el);
    addEventListener('keydown', this.block, true);
    addEventListener('keyup', this.block, true);
    this.stall = setInterval(() => {
      if (this.state === 'loading' && this.progress.stalled(performance.now())) this.fail('Nothing came back for a while. The connection may have dropped, or the region server is down.');
    }, 1000);
  }

  get loading(): boolean { return this.state === 'loading'; }

  /** The region's own name once its file is in (regions the world map does not list). */
  name(n: string): void {
    const h = this.el.querySelector('h1')!;
    if (h.textContent === 'Entering' && n) h.textContent = n;
  }

  /** Part p is fraction f done (0-1); `step`: the words under the bar (what comes next), shown when it moves forward. */
  set(p: Part, f: number, step?: string): void {
    if (this.state !== 'loading' || !this.progress.set(p, f, performance.now())) return;
    const v = this.progress.fraction();
    this.bar.style.width = `${(v * 100).toFixed(1)}%`;
    this.bar.parentElement!.setAttribute('aria-valuenow', String(Math.round(v * 100)));
    if (step) this.stepEl.textContent = step;
  }

  /** A setter for part p, for the loaders' progress callbacks. */
  part(p: Part, step?: string): (f: number) => void {
    return (f) => this.set(p, f, step);
  }

  /** The region is playable: the bar full, then fade out (after MIN_SHOW_MS at least). */
  done(): void {
    if (this.state !== 'loading') return;
    for (const p of Object.keys(PARTS) as Part[]) this.progress.set(p, 1, performance.now());
    this.bar.style.width = '100%';
    this.state = 'done';
    clearInterval(this.stall);
    const wait = Math.max(0, MIN_SHOW_MS - (performance.now() - this.shown));
    setTimeout(() => this.leave(), wait);
  }

  /** Another card takes over (the gate's line): gone at once, no error. */
  yieldTo(): void {
    if (this.state !== 'loading') return;
    this.state = 'done';
    clearInterval(this.stall);
    this.leave();
  }

  private leave(): void {
    removeEventListener('keydown', this.block, true);
    removeEventListener('keyup', this.block, true);
    this.el.classList.add('out');
    setTimeout(() => this.el.remove(), FADE_MS + 50);
  }

  /** Loading failed: the message and Retry. */
  fail(msg: string): void {
    if (this.state !== 'loading') return;
    this.state = 'failed';
    clearInterval(this.stall);
    this.el.classList.add('fail');
    this.el.setAttribute('role', 'alertdialog');
    this.el.querySelector('.ld-err p')!.textContent = msg;
    this.el.querySelector<HTMLElement>('[data-k=retry]')!.focus();
  }
}

/**
 * Follow the scene to ready, frame by frame: the first snapshot, the art, the camera (`camera()`: placed; world entry
 * waits for the player's men, at most CAMERA_WAIT_MS after the first snapshot), then the view's chunks; ready held two
 * frames (the sprites drawn over the baked ground), then `done`.
 */
export function watchScene(ld: LoadScreen, s: SandboxScene, camera: () => boolean): void {
  let art = false, snapAt = 0, most = 0, held = 0;
  void Promise.allSettled(s.artLoads).then(() => (art = true, ld.set('buildArt', 1)));
  let settled = 0;
  for (const p of s.artLoads) void p.finally(() => ld.set('buildArt', ++settled / s.artLoads.length));
  s.sim.serverTaps.add((m) => { if (m.t === 'gate' && m.s === 'queue') ld.yieldTo(); });
  const tick = () => {
    if (!ld.loading) { s.game.events.off('poststep', tick); return; }
    const now = performance.now(), snap = !!s.sim.cur;
    if (snap && !snapAt) (snapAt = now), ld.set('snapshot', 1, 'Mustering your men…');
    const cam = snap && (camera() || now - snapAt > CAMERA_WAIT_MS);
    if (cam) ld.set('camera', 1, 'Painting the ground…');
    // the chunks the view wants once the camera is placed: the bar follows them down to none
    if (cam && s.viewPending > 0) most = Math.max(most, s.viewPending);
    if (cam && s.viewPending >= 0 && most) ld.set('view', 1 - s.viewPending / most);
    held = sceneReady({ snap, art, camera: cam, pending: s.viewPending }) ? held + 1 : 0;
    if (held >= 2) ld.done();
  };
  s.game.events.on('poststep', tick);
}

/** The page's loading screen, up from the first paint (sandbox.html loads this module before ./main.ts). */
export const loader: LoadScreen | null = typeof document !== 'undefined' && document.getElementById('game')
  ? new LoadScreen(new URLSearchParams(location.search).get('region') ?? 'test-ridge')
  : null;
if (loader) (window as unknown as { __load: LoadScreen }).__load = loader;
