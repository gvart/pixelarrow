/**
 * Sprite sheet preview: open /preview.html on the dev server (also in the build).
 *
 *   /preview.html            one card per unit class: the four facings standing, then the
 *                            enemy-side facing walking, striking, hit and fallen.
 *   ?s=N                     pixel scale (default 2); ?b=1 battlefield scale; ?full=1 whole sheets;
 *                            ?r=N render resolution (DollSpec.res, the battle uses 2): N times the
 *                            pixels at the same size on screen.
 *   ?g=gear                  the gallery: every helmet / armour / shield / weapon at the five
 *                            rarities, side by side, at battlefield scale.
 *   ?g=anim                  every animation of each weapon class (front and back rows), plus a
 *                            live loop per animation.
 *   ?g=fx                    rarity effects live (glint sweep, outline pulse, particles) on a
 *                            small formation, and the cosmetics on the player's army.
 *   ?g=all                   all of the above.
 */
import {
  renderFrame, renderFrameFx, renderSheet, dollGeom, dollFromHero, dollFx, applyCosmetics, attackFrame, weaponClass, ANIM,
  BATTLE_SCALE, NDIRS, FRAME_NAMES, sheetFrames, type DollSpec, type GearTag,
} from '../art/paperdoll';
import { CLASS_LIST, type ClassId } from '../data/classes';
import { ITEM_LIST, RARITIES } from '../data/items';
import { makeHero, setBotLevel } from '../game/heroes';
import { Rng } from '../sim/rng';
import { RARITY_COLOR } from '../ui/theme';
import type { Pix } from '../art/pixels';

const q = new URLSearchParams(location.search);
/** Render resolution of the figures; the canvas scale is per rendered pixel, so the figures keep their size. */
const res = Number(q.get('r') ?? 1);
const scale = Number(q.get('s') ?? (q.get('g') ? 4 : 2)) / res;
const full = q.get('full') === '1';
/** ?b=1: the figures at battlefield scale (the gallery always is). */
const battle = q.get('b') === '1' || !!q.get('g');
const gal = q.get('g');

document.body.style.cssText = 'margin:0;padding:12px;background:#4a4a36;color:#f0e6d0;font:12px monospace;display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const GRASS = '#8f8a42';

function card(title: string, wide = false): HTMLDivElement {
  const c = document.createElement('div');
  c.style.cssText = `background:${GRASS};padding:4px;border:2px solid #2b1d1a;${wide ? 'flex-basis:100%;' : ''}`;
  const l = document.createElement('div');
  l.textContent = title;
  l.style.cssText = 'color:#2b1d1a;font-weight:bold;margin-bottom:2px';
  c.appendChild(l);
  document.body.appendChild(c);
  return c;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const cv = document.createElement('canvas');
  cv.width = w * scale;
  cv.height = h * scale;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [cv, ctx];
}

const draw = (ctx: CanvasRenderingContext2D, px: Pix, x: number, y: number) => ctx.drawImage(px.toCanvas(), x * scale, y * scale, px.w * scale, px.h * scale);

/** A bare hoplite to dress piece by piece. */
const BASE: DollSpec = { look: { skin: 1, hair: 1, hairStyle: 0, beard: 1, tunic: 'tunicWhite' }, seed: 7, scale: BATTLE_SCALE, res };

function labelRow(c: HTMLElement, labels: string[], cw: number, colors?: number[]): void {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex';
  labels.forEach((t, i) => {
    const s = document.createElement('div');
    s.textContent = t;
    s.style.cssText = `width:${cw * scale}px;font-size:10px;color:${colors ? hex(colors[i]) : '#2b1d1a'};text-shadow:0 1px 0 #2b1d1a`;
    row.appendChild(s);
  });
  c.appendChild(row);
}

/** One row of figures: the same body with each item at each rarity. */
function gearRows(title: string, rows: { name: string; spec: (r: number) => DollSpec; frame?: number; dir?: number }[]): void {
  const c = card(title);
  const g = dollGeom(BASE);
  labelRow(c, ['', ...RARITIES], g.fw, [0, ...RARITIES.map((r) => RARITY_COLOR[r])]);
  for (const row of rows) {
    const line = document.createElement('div');
    line.style.cssText = 'display:flex;align-items:center';
    const name = document.createElement('div');
    name.textContent = row.name;
    name.style.cssText = `width:${g.fw * scale}px;color:#2b1d1a;font-size:10px`;
    line.appendChild(name);
    const [cv, ctx] = canvas(g.fw * 5, g.fh);
    for (let r = 0; r < 5; r++) draw(ctx, renderFrame(row.spec(r), row.frame ?? 0, row.dir ?? 0), r * g.fw, 0);
    line.appendChild(cv);
    c.appendChild(line);
  }
}

const tag = (def: string, r: number): GearTag => ({ def, r });

function gearGallery(): void {
  const helmets = ITEM_LIST.filter((d) => d.slot === 'helmet');
  gearRows('Helmets x rarity (front 3/4)', [
    ...helmets.map((h) => ({ name: h.name, spec: (r: number) => ({ ...BASE, helmet: { art: h.art, paint: { field: 'red' } }, gear: { helmet: tag(h.id, r) } }) })),
    { name: 'Celtic (Montefortino on a Celt)', spec: (r: number) => ({ ...BASE, culture: 'celtic', helmet: { art: 'montefortino' }, gear: { helmet: tag('montefortino', r) } }) },
  ]);
  const armors = ITEM_LIST.filter((d) => d.slot === 'armor');
  gearRows('Body armour x rarity', armors.map((a) => ({ name: a.name, spec: (r: number) => ({ ...BASE, armor: a.art, helmet: { art: 'attic' }, gear: { armor: tag(a.id, r), helmet: tag('attic', 1) } }) })));
  const shields = ITEM_LIST.filter((d) => d.slot === 'shield');
  gearRows('Shields x rarity (front, enemy side)', shields.map((s) => ({ name: s.name, dir: 2, spec: (r: number) => ({ ...BASE, weapon: 'spear', shield: { art: s.art, paint: s.id === 'argyraspis' ? { field: 'silver', emblem: 'star', ink: 'ink' } : { emblem: 'owl', field: 'red', ink: 'cream' } }, gear: { shield: tag(s.id, r) } }) })));
  gearRows('Shields x rarity (back, player side)', shields.map((s) => ({ name: s.name, dir: 1, spec: (r: number) => ({ ...BASE, weapon: 'spear', shield: { art: s.art, paint: { emblem: 'lambda', field: 'bronze', ink: 'red' } }, gear: { shield: tag(s.id, r) } }) })));
  const weapons = ITEM_LIST.filter((d) => d.slot === 'weapon');
  gearRows('Weapons x rarity (windup)', weapons.map((w) => ({ name: w.name, frame: ANIM.attack[1], spec: (r: number) => ({ ...BASE, weapon: w.art, shield: w.twoHanded || weaponClass(w.art) === 'bow' ? undefined : { art: 'pelte', paint: { field: 'cream' } }, gear: { weapon: tag(w.id, r) } }) })));
  const trinkets = ITEM_LIST.filter((d) => d.slot === 'trinket');
  gearRows('Trinkets (front)', trinkets.map((t) => ({ name: t.name, dir: 2, spec: (r: number) => ({ ...BASE, look: { ...BASE.look, beard: 0 }, gear: { trinket: tag(t.id, r) } }) })));
}

/** Per weapon class: every animation, front (enemy) and back (player) rows. */
function animGallery(): void {
  const kits: [string, DollSpec][] = [
    ['Hoplite: dory + aspis', { ...BASE, weapon: 'spear', shield: { art: 'hoplon', paint: { emblem: 'lambda', field: 'red', ink: 'cream' } }, helmet: { art: 'corinthian' }, armor: 'cuirass', cloak: 'cloakRed', gear: { weapon: tag('dory', 2), helmet: tag('corinthian', 2), armor: tag('cuirass', 1) } }],
    ['Swordsman: kopis + thureos', { ...BASE, weapon: 'kopis', shield: { art: 'oval', paint: { field: 'cream', emblem: 'star', ink: 'red' } }, helmet: { art: 'thracian' }, armor: 'linothorax' }],
    ['Thracian: rhomphaia', { ...BASE, weapon: 'rhomphaia', helmet: { art: 'thracian' }, cloak: 'cloakBrown', trousers: 'trouserBrown' }],
    ['Archer: Cretan bow', { ...BASE, weapon: 'bow', helmet: { art: 'cap' }, look: { ...BASE.look, tunic: 'tunicGreen' }, gear: { weapon: tag('cretan_bow', 1) } }],
    ['Slinger: Balearic sling', { ...BASE, weapon: 'sling', look: { ...BASE.look, tunic: 'tunicWhite', hairStyle: 1 }, gear: { weapon: tag('balearic_sling', 1) } }],
    ['Peltast: javelins + pelte', { ...BASE, weapon: 'javelins', shield: { art: 'pelte', paint: { field: 'cream', emblem: 'crescent', ink: 'red' } }, helmet: { art: 'thracian' } }],
    ['Celt: longsword + long shield', { ...BASE, culture: 'celtic', weapon: 'longsword', shield: { art: 'oval', paint: { field: 'blue', emblem: 'boar', ink: 'cream' } }, helmet: { art: 'montefortino' }, armor: 'mail', trousers: 'checkGreen', gear: { shield: tag('celtic_shield', 1) } }],
    ['Axeman', { ...BASE, weapon: 'axe', shield: { art: 'buckler' }, helmet: { art: 'pilos' }, armor: 'leather' }],
  ];
  const seqs: [string, readonly number[]][] = [
    ['idle', ANIM.idle], ['walk', ANIM.walk], ['run', ANIM.run], ['attack', ANIM.attack], ['block', ANIM.block], ['hit', ANIM.hit],
    ['die', ANIM.die], ['dieB', ANIM.dieB], ['rout', ANIM.rout], ['win', ANIM.win],
  ];
  const all = seqs.flatMap(([, s]) => s);
  for (const [name, spec] of kits) {
    const c = card(name, true);
    const g = dollGeom(spec);
    labelRow(c, seqs.flatMap(([n, s]) => s.map((_, i) => (i === 0 ? n : ''))), g.fw);
    for (const dir of [2, 1]) {
      const [cv, ctx] = canvas(g.fw * all.length, g.fh);
      all.forEach((f, i) => draw(ctx, renderFrame(spec, f, dir), i * g.fw, 0));
      c.appendChild(cv);
    }
    // live loops
    const live = document.createElement('div');
    live.style.cssText = 'display:flex;gap:6px';
    const wc = weaponClass(spec.weapon);
    for (const [n, s] of seqs) {
      const frames = s.map((f) => renderFrame(spec, f, 0));
      const [cv, ctx] = canvas(g.fw, g.fh);
      const lab = document.createElement('div');
      lab.style.cssText = 'font-size:10px;color:#2b1d1a';
      lab.textContent = n;
      const box = document.createElement('div');
      box.append(lab, cv);
      live.appendChild(box);
      const t0 = performance.now();
      const tick = () => {
        const t = (performance.now() - t0) / 1000;
        let f: number;
        if (n === 'attack') {
          const fr = attackFrame(wc, t % 1.0);
          f = fr < 0 ? 0 : s.indexOf(fr as never);
          if (f < 0) f = 0;
        } else if (n === 'die' || n === 'dieB') f = Math.min(s.length - 1, Math.floor((t % 1.6) / 0.09));
        else f = Math.floor(t * (n === 'idle' ? 2.4 : n === 'walk' ? 10 : n === 'run' || n === 'rout' ? 13 : 4)) % s.length;
        ctx.clearRect(0, 0, cv.width, cv.height);
        draw(ctx, n === 'attack' && attackFrame(wc, t % 1.0) < 0 ? renderIdle(spec) : frames[f], 0, 0);
        requestAnimationFrame(tick);
      };
      tick();
    }
    c.appendChild(live);
  }
}

const idleCache = new Map<DollSpec, Pix>();
function renderIdle(spec: DollSpec): Pix {
  let p = idleCache.get(spec);
  if (!p) idleCache.set(spec, (p = renderFrame(spec, 0, 0)));
  return p;
}

/** A small formation per rarity, with the battle's effects drawn the same way (glint band, ring pulse, particles). */
function fxGallery(): void {
  const c = card('Rarity effects in formation (live): common .. legendary', true);
  const g = dollGeom(BASE);
  const cols = 4;
  const rows = 2;
  const W = g.fw + (cols - 1) * 14 + 16;
  const H = g.fh + (rows - 1) * 7 + 4;
  const hero = (cls: ClassId, i: number, r: number) => {
    const h = makeHero(new Rng(500 + i * 13 + r * 101), { nextId: 1000 + i + r * 40 }, 'greek', cls, 1, 3);
    setBotLevel(h, 3);
    for (const it of Object.values(h.equip)) if (it) it.rarity = RARITIES[r];
    return { ...dollFromHero(h), scale: BATTLE_SCALE, res };
  };
  const [cv, ctx] = canvas(W * 5, H + 8);
  c.appendChild(cv);
  const units: { x: number; y: number; spec: DollSpec; fr: ReturnType<typeof renderFrameFx>[]; seed: number }[] = [];
  for (let r = 0; r < 5; r++)
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < cols; col++) {
        const spec = hero(row === 0 ? 'hoplite' : 'royal_guard', col + row * 4, r);
        units.push({ x: r * W + 8 + col * 14 - row * 7, y: 4 + row * 7, spec, fr: ANIM.idle.map((f) => renderFrameFx(spec, f, 1)), seed: col * 7 + row * 3 + r });
      }
  units.sort((a, b) => a.y - b.y);
  const parts: { x: number; y: number; vy: number; life: number; c: number }[] = [];
  const t0 = performance.now();
  const tmp = document.createElement('canvas');
  const tick = () => {
    const t = (performance.now() - t0) / 1000;
    ctx.fillStyle = GRASS;
    ctx.fillRect(0, 0, cv.width, cv.height);
    for (const u of units) {
      const fx = dollFx(u.spec);
      const f = u.fr[Math.floor(t * 2.4 + u.seed * 0.37) % u.fr.length];
      if (fx.outline !== null) {
        const a = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * (fx.rank >= 4 ? 4.5 : 3) + u.seed));
        tint(tmp, f.ring, fx.outline);
        ctx.globalAlpha = a;
        ctx.drawImage(tmp, u.x * scale, u.y * scale, f.ring.w * scale, f.ring.h * scale);
        ctx.globalAlpha = 1;
      }
      draw(ctx, f.px, u.x, u.y);
      if (fx.glint) {
        const period = fx.rank >= 4 ? 1.6 : 2.6;
        const ph = ((t + u.seed * 0.23) % period) / period;
        const bx = Math.floor(ph * (f.glint.w + 30)) - 10;
        if (bx >= 0 && bx < f.glint.w) {
          tint(tmp, f.glint, 0xfff8e0);
          ctx.globalAlpha = 0.9;
          ctx.drawImage(tmp, bx, 0, 2, f.glint.h, (u.x + bx) * scale, u.y * scale, 2 * scale, f.glint.h * scale);
          ctx.globalAlpha = 1;
        }
      }
      if (fx.particles && Math.random() < 0.05 && parts.length < 40) {
        const col = fx.particles === 'embers' ? (Math.random() < 0.5 ? 0xffb040 : 0xffe080) : fx.particles === 'motes' ? 0xfff6c8 : 0xd0f0ff;
        parts.push({ x: u.x + g.fw / 2 + (Math.random() - 0.5) * 12, y: u.y + g.footY - 8 - Math.random() * 16, vy: -6 - Math.random() * 6, life: 1 + Math.random(), c: col });
      }
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= 1 / 60;
      p.y += p.vy / 60;
      if (p.life <= 0) parts.splice(i, 1);
      else {
        ctx.fillStyle = hex(p.c);
        ctx.fillRect(Math.round(p.x) * scale, Math.round(p.y) * scale, scale, scale);
      }
    }
    requestAnimationFrame(tick);
  };
  tick();

  // cosmetics on the player's army
  const looks: [string, Record<string, string>][] = [
    ['none', {}],
    ['emblem_owl + cloak_crimson', { emblem: 'emblem_owl', cloak: 'cloak_crimson' }],
    ['skin_macedon', { army_skin: 'skin_macedon' }],
    ['skin_bronze + crest_white', { army_skin: 'skin_bronze', crest: 'crest_white' }],
    ['emblem_gorgon + crest_gold', { emblem: 'emblem_gorgon', crest: 'crest_gold' }],
    ['season: emblem/cloak pass', { emblem: 'emblem_pass_s', cloak: 'cloak_pass_s', crest: 'crest_purple' }],
  ];
  const c2 = card('Cosmetics on the army (back / front / victory pose)', true);
  for (const [name, lo] of looks) {
    const h = makeHero(new Rng(77), { nextId: 900 }, 'greek', 'hoplite', 1, 2);
    const spec = { ...applyCosmetics(dollFromHero(h), lo), scale: BATTLE_SCALE };
    const box = document.createElement('div');
    box.style.cssText = 'display:inline-block;margin-right:8px;font-size:10px;color:#2b1d1a';
    box.textContent = name;
    const [cv2, ctx2] = canvas(g.fw * 4, g.fh);
    draw(ctx2, renderFrame(spec, 0, 1), 0, 0);
    draw(ctx2, renderFrame(spec, 0, 2), g.fw, 0);
    draw(ctx2, renderFrame({ ...spec, victory: lo.pose ? undefined : 'salute' }, ANIM.win[1], 0), g.fw * 2, 0);
    draw(ctx2, renderFrame({ ...spec, victory: 'shield' }, ANIM.win[1], 0), g.fw * 3, 0);
    box.appendChild(document.createElement('br'));
    box.appendChild(cv2);
    c2.appendChild(box);
  }
}

function tint(dst: HTMLCanvasElement, px: Pix, color: number): void {
  dst.width = px.w;
  dst.height = px.h;
  const x = dst.getContext('2d')!;
  x.clearRect(0, 0, px.w, px.h);
  x.drawImage(px.toCanvas(), 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = hex(color);
  x.fillRect(0, 0, px.w, px.h);
  x.globalCompositeOperation = 'source-over';
}

function classCards(): void {
  CLASS_LIST.forEach((c, i) => {
    const rng = new Rng(100 + i * 7);
    const h = makeHero(rng, { nextId: 1 + i * 50 }, c.cultures[0] ?? 'greek', c.id, 1, 3);
    setBotLevel(h, 3);
    const spec: DollSpec = { ...dollFromHero(h), scale: battle ? BATTLE_SCALE : undefined };
    const g = dollGeom(spec);
    const cd = card(c.name);
    const [cv, ctx] = full ? canvas(g.fw * sheetFrames(spec), g.fh * NDIRS) : canvas(g.fw * 11, g.fh);
    if (full) draw(ctx, renderSheet(spec), 0, 0);
    else {
      const frames: [number, number][] = [[0, 0], [1, 0], [2, 0], [3, 0], [2, ANIM.walk[2]], [2, ANIM.run[1]], [2, ANIM.attack[1]], [2, ANIM.attack[2]], [2, ANIM.attack[3]], [2, ANIM.hit[0]], [2, ANIM.die[3]]];
      frames.forEach(([dir, f], k) => draw(ctx, renderFrame(spec, f, dir), k * g.fw, 0));
    }
    cd.title = FRAME_NAMES.join(' ');
    cd.appendChild(cv);
  });
}

if (gal === 'gear' || gal === 'all') gearGallery();
if (gal === 'anim' || gal === 'all') animGallery();
if (gal === 'fx' || gal === 'all') fxGallery();
if (!gal) classCards();
