/**
 * Sprite sheet preview: open /preview.html on the dev server (also in the build).
 * One card per unit class: the four facings standing, then the enemy-side
 * facing walking / galloping, striking, hit and fallen. ?s=N scales, ?b=1 draws at battlefield scale, ?full=1
 * shows complete 13 x 4 sheets instead.
 */
import { renderFrame, renderSheet, dollGeom, dollFromHero, BATTLE_SCALE, NFRAMES, NDIRS, type DollSpec } from '../art/paperdoll';
import { CLASS_LIST } from '../data/classes';
import { makeHero, setBotLevel } from '../game/heroes';
import { Rng } from '../sim/rng';

const q = new URLSearchParams(location.search);
const scale = Number(q.get('s') ?? 2);
const full = q.get('full') === '1';
/** ?b=1: the figures at battlefield scale. */
const battle = q.get('b') === '1';

document.body.style.cssText = 'margin:0;padding:12px;background:#4a4a36;color:#f0e6d0;font:12px monospace;display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start';

CLASS_LIST.forEach((c, i) => {
  const rng = new Rng(100 + i * 7);
  const h = makeHero(rng, { nextId: 1 + i * 50 }, c.cultures[0] ?? 'greek', c.id, 1, 3);
  setBotLevel(h, 3);
  const spec: DollSpec = { ...dollFromHero(h), scale: battle ? BATTLE_SCALE : undefined };
  const g = dollGeom(spec);
  const card = document.createElement('div');
  card.style.cssText = 'background:#7b8058;padding:4px;border:2px solid #2b1d1a';
  const label = document.createElement('div');
  label.textContent = c.name;
  label.style.cssText = 'color:#2b1d1a;font-weight:bold';
  card.appendChild(label);
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d')!;
  if (full) {
    const sheet = renderSheet(spec).toCanvas();
    cv.width = g.fw * NFRAMES * scale;
    cv.height = g.fh * NDIRS * scale;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sheet, 0, 0, cv.width, cv.height);
  } else {
    const frames: [number, number][] = [[0, 0], [1, 0], [2, 0], [3, 0], [2, 3], [2, 6], [2, 7], [2, 9], [2, 12]];
    cv.width = g.fw * frames.length * scale;
    cv.height = g.fh * scale;
    ctx.imageSmoothingEnabled = false;
    frames.forEach(([dir, f], k) => ctx.drawImage(renderFrame(spec, f, dir).toCanvas(), k * g.fw * scale, 0, g.fw * scale, g.fh * scale));
  }
  card.appendChild(cv);
  document.body.appendChild(card);
});
