/**
 * The war's sound layer (all procedural Web Audio, src/audio): the sandbox's own AudioEngine with a voice cap sized for
 * 600-unit battles, fed once per sim snapshot from what team 0 sees (the fogged snapshot) and from the guardians' FX
 * beats, plus the HUD's clicks, panels, radial and toasts.
 *
 *  - combat: melee blows by class (swing 0), wounded cries and deaths (fall events), missile releases and landings
 *    (new and landed ShotSnaps); at most BUDGET field sounds start per snapshot, the loudest (nearest the view's centre)
 *    first; the engine's limiter then caps voices (VOICES) and steals the weakest.
 *  - siege: ram blows, thrower releases and boulder impacts, ladders raised, fire catching (and the fire bed while it
 *    burns), walls and engines collapsing.
 *  - work: chopping and mining gatherers, builders' mallets, carts rolling and the odd mule.
 *  - guardians: ../bossFx.ts `onCue` beats -> ./mix.ts cueSfx.
 *  - spatial: pan and loudness by screen place and zoom (./mix.ts spatial).
 *  - music: calm / tension / battle / boss by what is near the camera (./mix.ts MusicDirector), crossfaded by the engine.
 *  - ambience: the biome beds round the camera (./mix.ts ambienceFor), sampled twice a second.
 *  - the browser: the context starts on the first user gesture; a hidden tab suspends it.
 * Settings (master, music, effects, ambience, mute) persist in localStorage (./mix.ts loadSound) and the HUD's sound
 * panel (../hud/soundPanel.ts) edits them. `window.__warAudio` is the debug handle (scripts and the headless check).
 */
import { AudioEngine } from '../../../audio/engine';
import type { SfxId } from '../../../audio/sfx';
import type { BuildingSnap, SiegeSnap, Snapshot, UnitSnap, WarEvent } from '../../types';
import type { SandboxScene } from '../SandboxScene';
import { NEUTRAL_TEAM } from '../../sim/economy';
import { ambienceFor, cueSfx, gatherSfx, loadSound, MusicDirector, saveSound, shotSfx, spatial, STATE_TRACK, strikeSfx, struckSince, type AmbSample, type WarSoundSettings } from './mix';

/** Field sounds started per snapshot at most (10 Hz). */
const BUDGET = 8;
/** Voices at once (the engine's limiter). */
const VOICES = 20;
const PANELS: Record<string, string> = { rrPanel: 'roster', rrCard: 'soldier', cfTree: 'tree', cfWp: 'workplace', rfBuild: 'build', rfMarket: 'market', rfHandoff: 'handoff', rfLand: 'landmark', rfHolder: 'holder', rfSound: 'sound' };

interface Want { id: SfxId; x: number; y: number; pri?: number }

export class WarAudio {
  readonly engine = new AudioEngine(undefined, { max: VOICES, perSound: 3, minGap: 0.06 });
  settings: WarSoundSettings = loadSound();
  private readonly director = new MusicDirector();
  private tick = -1;
  private units = new Map<number, UnitSnap>();
  private sieges = new Map<number, SiegeSnap>();
  private buildings = new Map<number, BuildingSnap>();
  /** Shots in flight by key, with their landing tick. */
  private flying = new Map<string, { x: number; y: number; t1: number; land: SfxId }>();
  private wants: Want[] = [];
  private ambAt = 0;
  private fireLevel = 0;
  private rnd = 1;

  constructor(private readonly s: SandboxScene) {
    this.engine.configure(() => this.settings);
  }

  /** Once, after the HUD is up: gesture unlock, tab visibility, sim events, guardian beats, HUD sounds. */
  install(): void {
    const unlock = (): void => {
      const ua = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
      if (ua && !ua.isActive) return;
      this.engine.unlock();
    };
    for (const ev of ['pointerdown', 'pointerup', 'touchend', 'mousedown', 'keydown']) addEventListener(ev, unlock, { capture: true, passive: true });
    const vis = (): void => this.engine.setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', vis);
    addEventListener('pagehide', () => this.engine.setHidden(true));
    addEventListener('pageshow', vis);
    const prev = this.s.sim.onEvents;
    this.s.sim.onEvents = (ev) => {
      prev?.(ev);
      this.events(ev);
    };
    this.s.guardians.fx.onCue = (cue, x, y, boss) => {
      const id = cueSfx(cue, boss);
      if (id) this.at(id, x, y, 4);
    };
    this.hudSounds();
    this.s.events.on('update', () => this.update());
    Object.assign(window, { __warAudio: this });
  }

  /** New settings from the sound panel: apply and keep them. */
  apply(next: WarSoundSettings): void {
    this.settings = next;
    saveSound(next);
    this.engine.refresh();
  }

  /** A UI sound (no place). */
  ui(id: SfxId): void {
    this.engine.play(id);
  }

  debug(): Record<string, unknown> {
    return { ...this.engine.debug(), music: this.director.state, settings: this.settings };
  }

  // ---------------------------------------------------------------- per frame

  private update(): void {
    const cur = this.s.sim.cur;
    if (!cur || !this.engine.ctx) return;
    if (cur.tick !== this.tick) {
      // snapshots skipped since the last one taken (a slow frame): their blows still sound
      const gap = this.tick >= 0 && cur.tick > this.tick ? Math.min(10, cur.tick - this.tick) : 1;
      this.tick = cur.tick;
      this.snapshot(cur, gap);
      this.flush();
    }
    const now = performance.now();
    if (now - this.ambAt > 500) {
      this.ambAt = now;
      this.music(cur);
      this.ambience(cur);
    }
  }

  /** A tile point -> its place on screen relative to the view's centre. */
  private place(x: number, y: number): { vol: number; pan: number } {
    const cam = this.s.cameras.main, iso = this.s.iso, hw = cam.width / 2, hh = cam.height / 2;
    const dx = (iso.sx(x, y) - (cam.scrollX + hw)) * cam.zoom, dy = (iso.sy(x, y, iso.zAt(x, y)) - (cam.scrollY + hh)) * cam.zoom;
    return spatial(dx, dy, hw, hh, cam.zoom);
  }

  /** Play a sound at a tile point now (guardian beats, events: not budgeted). */
  private at(id: SfxId, x: number, y: number, pri = 0): void {
    const p = this.place(x, y);
    if (p.vol > 0.02) this.engine.play(id, { vol: p.vol, pan: p.pan, pri });
  }

  private want(id: SfxId, x: number, y: number, pri = 0): void {
    this.wants.push({ id, x, y, pri });
  }

  /** Start this snapshot's field sounds: the loudest BUDGET of them. */
  private flush(): void {
    if (!this.wants.length) return;
    const placed = this.wants.map((w) => ({ w, p: this.place(w.x, w.y) })).filter((e) => e.p.vol > 0.03);
    placed.sort((a, b) => b.p.vol - a.p.vol);
    for (const { w, p } of placed.slice(0, BUDGET)) this.engine.play(w.id, { vol: p.vol, pan: p.pan, pri: (w.pri ?? 0) + p.vol });
    this.wants = [];
  }

  private roll(): number {
    this.rnd = (Math.imul(this.rnd, 1664525) + 1013904223) >>> 0;
    return this.rnd / 4294967296;
  }

  private snapshot(cur: Snapshot, gap: number): void {
    const tick = cur.tick;
    // units: blows, work
    const next = new Map<number, UnitSnap>();
    let work = 0;
    for (const u of cur.units) {
      next.set(u.id, u);
      if (u.state === 'attack' && struckSince(u.swing, gap)) {
        const id = strikeSfx(u.cls, this.roll());
        if (id) this.want(id, u.x, u.y);
      } else if ((u.state === 'gather' || u.state === 'build') && (tick + u.id) % 9 === 0 && work < 4) {
        const id = u.state === 'build' ? 'hammer' : gatherSfx(u.carry ?? this.nodeRes(u.x, u.y));
        if (id) (this.want(id, u.x, u.y, -1), work++);
      }
    }
    this.units = next;
    // missiles: released, landed
    const seen = new Set<string>();
    for (const sh of cur.shots ?? []) {
      const key = `${sh.by}:${sh.t0}:${sh.x1.toFixed(1)}`;
      seen.add(key);
      if (this.flying.has(key)) continue;
      const fx = shotSfx(sh.kind, sh.siege !== undefined);
      this.flying.set(key, { x: sh.x1, y: sh.y1, t1: sh.t1, land: sh.fire ? 'fireWhoosh' : fx.land });
      if (tick - sh.t0 <= 2) this.want(fx.release, sh.x0, sh.y0, sh.siege !== undefined ? 3 : 0);
    }
    for (const [k, f] of this.flying) {
      if (f.t1 <= tick) {
        this.want(f.land, f.x, f.y, f.land === 'boulder' ? 4 : -1);
        this.flying.delete(k);
      } else if (!seen.has(k) && f.t1 < tick - 20) this.flying.delete(k);
    }
    // engines and carts
    const sieges = new Map<number, SiegeSnap>();
    for (const g of cur.sieges ?? []) {
      sieges.set(g.id, g);
      const was = this.sieges.get(g.id);
      if ((g.type === 'ram' || g.type === 'coveredRam') && g.state === 'attack' && struckSince(g.swing, gap)) this.want('ramHit', g.x, g.y, 3);
      if (g.state === 'raising' && was && was.state !== 'raising') this.want('ladderRaise', g.x, g.y, 2);
      if (g.state === 'destroyed' && was && was.state !== 'destroyed') this.want('splinter', g.x, g.y, 4);
      if ((g.burning ?? 0) > 0 && !((was?.burning ?? 0) > 0) && was) this.want('fireWhoosh', g.x, g.y, 2);
      if ((g.type === 'handcart' || g.type === 'wagon') && g.state === 'move' && !g.halted) {
        if ((tick + g.id) % 11 === 0) this.want('cartWheels', g.x, g.y, -1);
        if (g.type === 'wagon' && this.roll() < 0.006) this.want('mule', g.x, g.y);
      }
    }
    this.sieges = sieges;
    // buildings: catching fire, coming down
    const blds = new Map<number, BuildingSnap>();
    for (const b of cur.buildings ?? []) {
      blds.set(b.id, b);
      const was = this.buildings.get(b.id);
      if (!was) continue;
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      if ((b.burning ?? 0) > 0 && !((was.burning ?? 0) > 0)) this.want('fireWhoosh', cx, cy, 2);
      if ((b.state === 'destroyed' && was.state !== 'destroyed') || (b.rubble && !was.rubble)) this.want(b.tier !== undefined || b.walk ? 'wallCollapse' : 'splinter', cx, cy, 5);
    }
    this.buildings = blds;
  }

  /** The resource of the node nearest a gatherer (within 3 tiles). */
  private nodeRes(x: number, y: number): string | undefined {
    let best: string | undefined, bd = 9;
    for (const n of this.s.sim.nodes) {
      const d = (n.x - x) ** 2 + (n.y - y) ** 2;
      if (d < bd) (bd = d), (best = n.res);
    }
    return best;
  }

  private events(ev: WarEvent[]): void {
    if (!this.engine.ctx) return;
    for (const e of ev) {
      if (e.kind === 'fall') {
        const u = this.units.get(e.unit);
        if (u) this.want(e.wounded ? 'woundedCry' : 'death', u.x, u.y, 2);
      } else if (e.kind === 'razed') {
        const b = this.buildings.get(e.building);
        if (b) this.at('wallCollapse', b.x + b.w / 2, b.y + b.h / 2, 5);
      } else if (e.kind === 'raid') this.ui('warning');
      else if (e.kind === 'captainSlain') {
        const u = this.units.get(e.by);
        if (u) this.at('standardFall', u.x, u.y, 4);
      } else if (e.kind === 'landmark') this.ui('chime');
      else if (e.kind === 'wardenStrike') this.at('thunder', e.x + e.w / 2, e.y + e.h / 2, 5);
      else if (e.kind === 'cartCaptured' && e.team === 0) this.ui('coin');
    }
  }

  // ---------------------------------------------------------------- music and ambience

  private music(cur: Snapshot): void {
    const sq = this.s.sim.squads;
    let foes = 0, fighting = 0;
    for (const u of cur.units) {
      if (u.state === 'dead') continue;
      const team = sq.get(u.squad)?.team;
      const p = this.place(u.x, u.y);
      if (p.vol <= 0) continue;
      if (u.state === 'attack') fighting++;
      if (team !== undefined && team !== 0 && team !== NEUTRAL_TEAM && !sq.get(u.squad)?.civ) foes++;
    }
    let boss = false;
    for (const b of cur.bosses ?? []) if ((b.state === 'fight' || b.state === 'flight' || (b.state === 'perch' && b.raid > 0)) && this.place(b.x, b.y).vol > 0) boss = true;
    const st = this.director.update(performance.now() / 1000, { foes, fighting, boss });
    this.engine.music(STATE_TRACK[st]);
    this.engine.heat(Math.min(1, fighting / 30));
  }

  private ambience(cur: Snapshot): void {
    const s = this.s, cam = s.cameras.main, r = s.region, map = s.map;
    const c = s.tileAt({ x: cam.width / 2, y: cam.height / 2 });
    const R = Math.max(8, Math.min(60, cam.width / 2 / cam.zoom / 32));
    const sample: AmbSample = { biome: {}, forest: 0, deep: 0, shallow: 0, built: 0, fire: 0 };
    const N = 11;
    let n = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = Math.floor(c.x - R + (2 * R * (i + 0.5)) / N), y = Math.floor(c.y - R + (2 * R * (j + 0.5)) / N);
      if (x < 0 || y < 0 || x >= r.w || y >= r.h) continue;
      const k = y * r.w + x, name = map.biomeNames[map.biome[k]] ?? 'global';
      n++;
      sample.biome[name] = (sample.biome[name] ?? 0) + 1;
      if (r.terrain[k] === 'forest') sample.forest++;
      if (r.water[k] === 2) sample.deep++;
      else if (r.water[k] === 1) sample.shallow++;
    }
    if (n) {
      for (const k of Object.keys(sample.biome)) sample.biome[k] /= n;
      sample.forest /= n;
      sample.deep /= n;
      sample.shallow /= n;
    }
    let built = 0, fire = 0;
    for (const b of cur.buildings ?? []) {
      if (Math.abs(b.x - c.x) > R || Math.abs(b.y - c.y) > R) continue;
      if (b.state === 'done' && b.team !== undefined) built++;
      if (b.burning) fire += b.burning * this.place(b.x + b.w / 2, b.y + b.h / 2).vol;
    }
    for (const g of cur.sieges ?? []) if (g.burning) fire += g.burning * this.place(g.x, g.y).vol;
    this.fireLevel += (Math.min(1, fire) - this.fireLevel) * 0.5;
    sample.built = built / 40;
    sample.fire = this.fireLevel;
    this.engine.ambience(ambienceFor(sample, cam.zoom));
  }

  // ---------------------------------------------------------------- the HUD

  /** Clicks on HUD buttons, panels and the radial opening and closing, notices popping up. */
  private hudSounds(): void {
    document.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement | null)?.closest?.('button, [data-tool], [data-tab], .rf-tbtn');
      if (el && el.closest('.rf, #dev')) this.ui('click');
    }, true);
    const shown = (el: HTMLElement) => el.style.display !== 'none';
    const watch = (el: HTMLElement | null, open: SfxId, close: SfxId) => {
      if (!el) return;
      let was = shown(el);
      new MutationObserver(() => {
        const now = shown(el);
        if (now !== was) this.ui(now ? open : close);
        was = now;
      }).observe(el, { attributes: true, attributeFilter: ['style'] });
    };
    for (const id of Object.keys(PANELS)) watch(document.getElementById(id), 'panelOpen', 'panelClose');
    watch(document.getElementById('rfRadial'), 'radialOpen', 'radialClose');
    const toasts = document.getElementById('rrToasts');
    if (toasts) new MutationObserver((m) => { if (m.some((r) => r.addedNodes.length)) this.ui('toast'); }).observe(toasts, { childList: true });
  }
}
