// The living hero diorama (V6-LAND-02, V6-015 amendment 1): the lazy hero module.
//
// A canvas over the poster still plays one short battle on the slab with the game's own sprites
// (scripts/art/landing/sprites.mjs): the hoplites and the Celts march, the Celts charge, the lines
// clash, men fall and the ranks behind step up, the Celts break and rout, the hoplites pursue and
// raise their spears; then the board resets and it plays again. Feel follows the game's own juice
// tiers (src/ui/battleFx.ts JUICE_TIERS: impact, kill, rout, army break; trauma shake on a smooth
// value noise; a 60 ms hit-stop on impact; cream dust). Plain 2D canvas, no library: the figures
// are pre-rendered, so the module is only choreography and blits.
//
// Loaded by Hero.astro after load and idle, only at >= 768 px, without reduced motion or data
// saver. The poster stays underneath; the canvas fades in once its first frame matches it.
import atlas from './atlas.json';

type Anim = 'idle' | 'walk' | 'run' | 'attack' | 'hit' | 'die' | 'dieB' | 'rout' | 'win';
interface Side { anims: Record<string, number[][]>; attack: number[][] }
const SIDES = atlas.sides as unknown as Record<'player' | 'enemy', Side>;
const FR = atlas.frames as number[][];

// Field geometry (src/art/iso.ts, scripts/art/landing/units.ts): 18x18 field, 2x canvas, 64 px of sky.
const HW = 18, HH = 9, F = 18, TOP = 64, K = 2;
const W = 2 * F * HW * K, H = 426 * K;
const sx = (x: number, y: number) => ((x - y) * HW + F * HW) * K;
const sy = (x: number, y: number) => ((x + y) * HH + TOP) * K;

// Feel (battleFx.ts): trauma per event, shake offset at full trauma in game px, decay per second.
const TRAUMA = { impact: 0.2, rout: 0.4, armyBreak: 0.5 };
const MAX_OFFSET = 8, TRAUMA_DECAY = 1.5, NOISE_HZ = 24, HITSTOP = 0.06;
const DUST = '#f0e2c8';

// The script, in seconds of battle time. One loop is LOOP seconds; the units fade out and back in.
const MARCH = 1.6, CHARGE = 3.9, CONTACT = 4.7, BREAK = 9.4, PURSUE_END = 10.9, FADE_OUT = 13.4, LOOP = 14.1;
const E_DEATHS = [5.25, 5.8, 6.35, 6.8, 7.3, 7.75, 8.2, 8.6, 9.0];
const P_DEATHS = [6.1, 7.95];

/** Small seeded PRNG so every loop (and every capture) plays the same battle. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 1-D value noise in [-1, 1] (battleFx.ts valueNoise): shake that glides, never buzzes. */
function noise(t: number, seed: number): number {
  const at = (i: number) => {
    let h = Math.imul(i ^ Math.imul(seed, 0x27d4eb2d), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 15), 0x297a2d39);
    h ^= h >>> 13;
    return ((h >>> 0) / 0xffffffff) * 2 - 1;
  };
  const i = Math.floor(t), f = t - i, s = f * f * (3 - 2 * f);
  return at(i) * (1 - s) + at(i + 1) * s;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, t: number) => { const u = clamp01((t - a) / (b - a)); return u * u * (3 - 2 * u); };

interface Man {
  side: 0 | 1; v: number; x: number; y: number; hx: number; hy: number; col: number; rank: number;
  anim: Anim; at: number; odo: number; delay: number; alive: boolean; diedAt: number; dieAnim: 'die' | 'dieB';
  nextAtk: number; hitAt: number; vx: number; alpha: number;
}
interface Mote { x: number; y: number; vx: number; vy: number; ph: number }
interface Grain { x: number; y: number; vx: number; vy: number; g: number; life: number; max: number; s: number }

export function start(hero: HTMLElement): void {
  const wrap = hero.querySelector<HTMLElement>('.hero__diorama-wrap');
  if (!wrap) return;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.className = 'hero__live pixel';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;

  const load = (src: string) => new Promise<HTMLImageElement>((ok, no) => {
    const i = new Image();
    i.decoding = 'async';
    i.onload = () => i.decode().then(() => ok(i), () => ok(i));
    i.onerror = no;
    i.src = src;
  });

  Promise.all([load('/hero/landing_hero_terrain_1x.webp'), load('/hero/landing_hero_sprites_2x.webp')]).then(([ground, sheet]) => {
    run(hero, wrap, canvas, ctx, ground, sheet);
  }, () => { /* the poster stays: nothing to undo */ });
}

function run(hero: HTMLElement, wrap: HTMLElement, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, ground: HTMLImageElement, sheet: HTMLImageElement): void {
  const R = rng(20261013);
  const men: Man[] = (atlas.men as number[][]).map(([side, v, x, y, rank, col]) => ({
    side: side as 0 | 1, v, x, y, hx: x, hy: y, col, rank, anim: 'idle', at: -R() * 2, odo: R() * 4, delay: R() * 0.3,
    alive: true, diedAt: 0, dieAnim: 'die', nextAtk: 0, hitAt: 0, vx: 0, alpha: 1,
  }));
  const motes: Mote[] = Array.from({ length: 34 }, () => ({ x: R() * W, y: R() * H, vx: 4 + R() * 6, vy: -3 - R() * 5, ph: R() * 6.28 }));
  const grains: Grain[] = [];
  const kills: { t: number; side: 0 | 1; done: boolean }[] = [];
  let t = 0, stop = 0, trauma = 0, real = 0, fade = 1, broken = false, looped = false;

  const reset = () => {
    for (const m of men) Object.assign(m, { x: m.hx, y: m.hy, anim: 'idle', at: -R() * 2, alive: true, diedAt: 0, nextAtk: 0, hitAt: 0, vx: 0, alpha: 1 });
    kills.length = 0;
    for (const k of E_DEATHS) kills.push({ t: k, side: 1, done: false });
    for (const k of P_DEATHS) kills.push({ t: k, side: 0, done: false });
    grains.length = 0;
    broken = false;
  };
  reset();

  const dust = (x: number, y: number, n: number, life: number, big: boolean) => {
    for (let i = 0; i < n && grains.length < 240; i++) {
      const a = (i / n) * Math.PI * 2 + R() * 0.6;
      const v = 22 * (0.5 + R() * 0.6);
      const max = life * (0.7 + R() * 0.5);
      grains.push({ x, y: y - 3 * K, vx: Math.cos(a) * v * K, vy: (Math.sin(a) * v * 0.5 - 10) * K, g: 10 * K, life: max, max, s: big && R() < 0.5 ? 3 * K : big || R() < 0.3 ? 2 * K : K });
    }
  };

  // Where each line's front rank stands (field y) at battle time t.
  const pFront = (tt: number) => 14.65 - 0.9 * smooth(MARCH, CONTACT - 0.2, tt) - 0.3 * smooth(CONTACT + 0.3, BREAK, tt) - 0.55 * smooth(BREAK + 0.2, PURSUE_END, tt);
  const eFront = (tt: number) => {
    const march = 11.55 + 0.4 * smooth(MARCH, CHARGE, tt);
    if (tt < CHARGE) return march;
    // the charge: the last stretch at a run, eased in so the line accelerates into the spears
    if (tt < CONTACT) return march + (pFront(CONTACT) - 1.15 - 11.95) * ((tt - CHARGE) / (CONTACT - CHARGE)) ** 1.6;
    // pushed back by the hoplites, with a knock-back on impact
    return pFront(tt) - 1.15 - 0.09 * Math.exp(-(tt - CONTACT) * 9);
  };
  const front = (m: Man) => (m.side === 0 ? pFront(t - m.delay) : eFront(t - m.delay));
  /** Rank behind the living front, so a fallen man's file steps up. */
  const effRank = (m: Man) => {
    let r = 0;
    for (const o of men) if (o.side === m.side && o.col === m.col && o.rank < m.rank && o.alive && !(o.side === 1 && broken)) r++;
    return r;
  };
  const play = (m: Man, a: Anim) => { if (m.anim !== a) { m.anim = a; m.at = t; } };
  const nearestFoe = (m: Man) => {
    let best: Man | null = null, d = 1e9;
    for (const o of men) if (o.side !== m.side && o.alive && effRank(o) === 0) {
      const dd = Math.abs(o.x - m.x);
      if (dd < d) { d = dd; best = o; }
    }
    return best;
  };

  const step = (dt: number) => {
    t += dt;
    // scheduled falls: the nearest foe strikes, the man falls with the game's kill dust
    for (const k of kills) if (!k.done && t >= k.t) {
      k.done = true;
      const pool = men.filter((m) => m.side === k.side && m.alive && effRank(m) === 0);
      const m = pool[Math.floor(R() * pool.length)];
      if (!m) continue;
      m.alive = false; m.diedAt = t; m.dieAnim = R() < 0.5 ? 'die' : 'dieB'; play(m, m.dieAnim);
      const foe = nearestFoe(m);
      if (foe && foe.anim !== 'attack') { play(foe, 'attack'); foe.nextAtk = t + 0.9; }
      dust(sx(m.x, m.y), sy(m.x, m.y), 3, 0.45, false);
    }
    if (!broken && t >= BREAK) {
      broken = true;
      trauma = Math.min(1, trauma + TRAUMA.armyBreak);
      for (const m of men) if (m.side === 1 && m.alive) {
        m.delay = R() * 0.5;
        m.vx = (R() - 0.5) * 0.35;
        if (R() < 0.35) dust(sx(m.x, m.y), sy(m.x, m.y), 2, 1, true);
      }
    }
    if (t >= CONTACT && t - dt < CONTACT) {
      trauma = Math.min(1, trauma + TRAUMA.impact);
      stop = HITSTOP;
      for (const m of men) if (m.side === 1 && effRank(m) === 0) dust(sx(m.x, m.y + 0.55), sy(m.x, m.y + 0.55), 4, 0.8, true);
    }
    for (const m of men) {
      if (!m.alive) continue;
      if (m.side === 1 && broken) {
        if (t < BREAK + m.delay) { play(m, 'hit'); continue; }
        if (m.anim !== 'rout') { play(m, 'rout'); trauma = Math.min(1, trauma + (m.delay < 0.05 ? TRAUMA.rout * 0.25 : 0)); }
        const v = 1.55 * dt;
        m.y -= v; m.x += m.vx * dt; m.odo += v;
        m.alpha = smooth(6.6, 8.6, m.y);
        continue;
      }
      const ty = front(m) + effRank(m) * (m.side === 0 ? 0.75 : -0.85);
      const dy = ty - m.y;
      const charging = m.side === 1 && t > CHARGE && t < CONTACT + 0.2;
      const vmax = (charging ? 1.9 : 0.75) * dt;
      const mv = Math.max(-vmax, Math.min(vmax, dy * Math.min(1, dt * 7)));
      m.y += mv;
      m.odo += Math.abs(mv);
      const moving = Math.abs(mv) > 0.12 * dt;
      const melee = t > CONTACT && t < BREAK + 0.3 && effRank(m) <= (m.side === 0 ? 1 : 0);
      if (m.hitAt && t >= m.hitAt) { m.hitAt = 0; if (m.anim !== 'attack') play(m, 'hit'); }
      if (m.anim === 'attack' && t - m.at < 0.42) continue;
      if (m.anim === 'hit' && t - m.at < 0.18) continue;
      if (melee && t >= m.nextAtk) {
        play(m, 'attack');
        m.nextAtk = t + 0.7 + R() * 1.1;
        // the struck man flinches (the game's hit frames) unless he is about to fall
        const foe = nearestFoe(m);
        if (foe && R() < 0.5) foe.hitAt = t + 0.16; // on the strike frame
      } else if (moving) play(m, charging ? 'run' : 'walk');
      else if (m.side === 0 && t > PURSUE_END - 0.4) play(m, 'win');
      else play(m, 'idle');
      if (melee && m.nextAtk === 0) m.nextAtk = t + R() * 0.8;
    }
  };

  const frameOf = (m: Man): number => {
    const side = SIDES[m.side === 0 ? 'player' : 'enemy'];
    const set = side.anims[m.anim]?.[m.v] ?? side.anims.idle[m.v];
    const e = Math.max(0, t - m.at);
    let i = 0;
    switch (m.anim) {
      case 'walk': i = Math.floor(m.odo / 0.06) % set.length; break;
      case 'run': i = Math.floor(m.odo / 0.11) % set.length; break;
      case 'rout': i = Math.floor(m.odo / 0.12) % set.length; break;
      case 'attack': {
        let acc = 0;
        i = set.length - 1;
        for (const [f, s] of side.attack) { acc += s; if (e < acc) { i = f; break; } }
        break;
      }
      case 'hit': i = e < 0.08 ? 0 : 1; break;
      case 'die': case 'dieB': i = Math.min(set.length - 1, Math.floor(e / 0.11)); break;
      case 'win': i = Math.floor(e / 0.4) % set.length; break;
      default: i = Math.floor((e + m.odo) / 0.45) % set.length;
    }
    return set[i];
  };

  const blit = (f: number, x: number, y: number) => {
    const r = FR[f];
    ctx.drawImage(sheet, r[0], r[1], r[2], r[3], x + r[4], y + r[5], r[2], r[3]);
  };

  const lattice = (a: number) => {
    // the game's formation lattice under the hoplites: 1 px cyan iso lines on the formation's cells
    const live = men.filter((m) => m.side === 0 && m.alive);
    if (!live.length || a <= 0) return;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const m of live) { x0 = Math.min(x0, m.x); x1 = Math.max(x1, m.x); y0 = Math.min(y0, m.y); y1 = Math.max(y1, m.y); }
    const g = 0.75, pad = 0.375;
    x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
    ctx.globalAlpha = 0.28 * a;
    ctx.fillStyle = '#7fd0e0';
    const line = (ax: number, ay: number, bx: number, by: number) => {
      // a 2:1 iso line in whole game pixels (two canvas px per game px)
      const p = Math.round(sx(ax, ay) / K), q = Math.round(sx(bx, by) / K);
      const py = sy(ax, ay) / K, qy = sy(bx, by) / K;
      const n = Math.abs(q - p);
      for (let i = 0; i <= n; i += 2) {
        const u = n ? i / n : 0;
        ctx.fillRect((p + (q - p) * u) * K, Math.round(py + (qy - py) * u) * K, 2 * K, K);
      }
    };
    for (let x = x0; x <= x1 + 1e-6; x += g) line(x, y0, x, y1);
    for (let y = y0; y <= y1 + 1e-6; y += g) line(x0, y, x1, y);
    ctx.globalAlpha = 1;
  };

  const draw = (rt: number) => {
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(ground, 0, 0, W, H);
    lattice(fade * smooth(0.2, 1.0, t) * (1 - smooth(FADE_OUT - 1, FADE_OUT, t)));
    const order = men.slice().sort((a, b) => (a.x + a.y) - (b.x + b.y));
    for (const m of order) {
      const a = m.alpha * fade * (m.alive ? 1 : 1 - smooth(m.diedAt + 2.5, m.diedAt + 4, t) * 0.35);
      if (a <= 0.01) continue;
      ctx.globalAlpha = a;
      const x = Math.round(sx(m.x, m.y)), y = Math.round(sy(m.x, m.y));
      if (m.alive) blit(atlas.plate, x, y);
      blit(frameOf(m), x, y);
    }
    ctx.globalAlpha = 1;
    for (const g of grains) {
      ctx.globalAlpha = clamp01(g.life / g.max) * 0.85;
      ctx.fillStyle = DUST;
      ctx.fillRect(Math.round(g.x / K) * K, Math.round(g.y / K) * K, g.s, g.s);
    }
    // dust motes drifting in the lamp beam
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#f2c879';
    for (const m of motes) {
      ctx.globalAlpha = 0.18 + 0.22 * Math.max(0, Math.sin(rt * 0.9 + m.ph));
      ctx.fillRect(Math.round(m.x / K) * K, Math.round(m.y / K) * K, K, K);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  };

  // Lamp: on fine pointers the warm light and the beam follow the pointer, eased (never hover-only content).
  const lamp = hero.querySelector<HTMLElement>('.hero__lamp');
  const beam = hero.querySelector<HTMLElement>('.hero__beam');
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  let px = 0.3, py = 0.35, lx = px, ly = py;
  if (fine && lamp) {
    hero.classList.add('is-lit');
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      px = (e.clientX - r.left) / r.width;
      py = (e.clientY - r.top) / r.height;
    }, { passive: true });
  }

  let visible = true, raf = 0, prev = 0, shown = false;
  const frame = (now: number) => {
    raf = 0;
    const dt = prev ? Math.min(0.05, (now - prev) / 1000) : 0;
    prev = now;
    real += dt;
    if (stop > 0) stop -= dt;
    else step(dt);
    if (t >= LOOP) { t = 0; reset(); looped = true; }
    fade = t >= FADE_OUT ? 1 - smooth(FADE_OUT, LOOP - 0.1, t) : looped ? smooth(0, 0.6, t) : 1;
    for (let i = grains.length - 1; i >= 0; i--) {
      const g = grains[i];
      g.life -= dt;
      if (g.life <= 0) { grains.splice(i, 1); continue; }
      g.vy += g.g * dt; g.x += g.vx * dt; g.y += g.vy * dt;
    }
    for (const m of motes) {
      m.x += m.vx * dt; m.y += m.vy * dt;
      if (m.y < 0) m.y += H;
      if (m.x > W) m.x -= W;
    }
    draw(real);
    // trauma shake on the board (game px -> CSS px), smooth noise, quadratic in trauma
    trauma = Math.max(0, trauma - TRAUMA_DECAY * dt);
    const k = (MAX_OFFSET * trauma * trauma * canvas.clientWidth) / (W / K);
    wrap.style.translate = trauma > 0 ? `${Math.round(k * noise(real * NOISE_HZ, 3))}px ${Math.round(k * noise(real * NOISE_HZ, 7))}px` : '';
    if (fine && lamp) {
      lx += (px - lx) * Math.min(1, dt * 4);
      ly += (py - ly) * Math.min(1, dt * 4);
      lamp.style.translate = `${Math.round(lx * hero.clientWidth)}px ${Math.round(ly * hero.clientHeight)}px`;
      if (beam) beam.style.translate = `${((lx - 0.3) * 24).toFixed(1)}px ${((ly - 0.35) * 12).toFixed(1)}px`;
    }
    if (!shown) {
      shown = true;
      wrap.appendChild(canvas);
      requestAnimationFrame(() => hero.classList.add('is-live'));
    }
    if (visible && !document.hidden) raf = requestAnimationFrame(frame);
  };
  const resume = () => { if (!raf && visible && !document.hidden) { prev = 0; raf = requestAnimationFrame(frame); } };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; resume(); }).observe(hero);
  document.addEventListener('visibilitychange', resume);
  resume();
}
