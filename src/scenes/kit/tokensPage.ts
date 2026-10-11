/**
 * The Kit's "Tokens" and "Type" pages (story F-05): every colour token of src/ui/tokens.ts as a
 * swatch with its name and hex, the chrome's surfaces, spacing, radius and motion; then every type
 * role in both faces, the font colours on their surfaces and the text rules (wrap, step-down).
 */
import { uiIgnore } from '../../ui/layout';
import { MButton, mosaicImage, mtext } from '../../ui/mosaic';
import { DISPLAY_MIN, LINE_RATIO, MOSAIC, MOTION, RADIUS, SPACE, TEXT_MIN, lineHeight } from '../../ui/tokens';
import type { FontKey } from '../../ui/kit';
import { SURFACES, columns, hexOf, tokenGroups, typeRoles } from './catalog';
import { G, type Cursor } from './common';

const SW = 14;
const CELL_W = 64;
const CELL_H = 21;

/** Colour tokens in groups, then surfaces, spacing, radius and motion. */
export function buildTokens(cur: Cursor): void {
  const { scene, w } = cur;
  const cols = columns(w, CELL_W, G);
  const cw = Math.floor((w - (cols - 1) * G) / cols);
  for (const grp of tokenGroups()) {
    cur.title(grp.title);
    cur.note(`${grp.source} in tokens.ts`);
    grp.swatches.forEach((s, i) => {
      const x = (i % cols) * (cw + G);
      const y = cur.y + Math.floor(i / cols) * CELL_H;
      const g = scene.add.graphics();
      g.fillStyle(s.color, 1);
      g.fillRect(x, y + 1, SW, SW);
      g.lineStyle(1, MOSAIC.parchEdge, 1);
      g.strokeRect(x + 0.5, y + 1.5, SW - 1, SW - 1);
      cur.add(g);
      cur.add(mtext(scene, x + SW + 3, y, s.name, 'pInk', { size: TEXT_MIN, maxW: cw - SW - 3 }));
      cur.add(mtext(scene, x + SW + 3, y + 10, hexOf(s.color), 'pSec', { size: TEXT_MIN, maxW: cw - SW - 3 }));
    });
    cur.y += Math.ceil(grp.swatches.length / cols) * CELL_H;
  }

  cur.title('Surfaces');
  cur.note('mosaicUi.ts: the chrome is drawn, never a bitmap (art bible 7.1)');
  const sw = 44;
  const scol = columns(w, sw, G);
  const sg = scol > 1 ? Math.floor((w - scol * sw) / (scol - 1)) : 0;
  SURFACES.forEach((st, i) => {
    const x = (i % scol) * (sw + sg);
    const y = cur.y + Math.floor(i / scol) * 34;
    cur.add(mosaicImage(scene, x, y, sw, 22, st));
    cur.add(mtext(scene, x + sw / 2, y + 23, st, 'pSec', { size: TEXT_MIN, align: 0.5, maxW: sw }));
  });
  cur.y += Math.ceil(SURFACES.length / scol) * 34;

  cur.title('Spacing');
  for (const [k, v] of Object.entries(SPACE)) {
    const g = scene.add.graphics();
    g.fillStyle(MOSAIC.bronze, 1);
    g.fillRect(40, cur.y + 2, v * 4, 5);
    cur.add(g);
    cur.add(mtext(scene, 0, cur.y, `${k} ${v}`, 'pInk', { size: TEXT_MIN, maxW: 38 }));
    cur.y += 10;
  }
  cur.note('UI px; one bar = 4x its size. Touch targets: TAP 22 (44 pt), gap 3.');

  cur.title('Radius and motion');
  for (const [k, v] of Object.entries(RADIUS)) {
    const g = scene.add.graphics();
    g.fillStyle(MOSAIC.terra, 1);
    g.fillRoundedRect(0, cur.y, 30, 14, v / 2);
    cur.add(g);
    cur.add(mtext(scene, 36, cur.y + 3, `${k}: ${v} CSS px`, 'pInk', { size: TEXT_MIN, maxW: w - 36 }));
    cur.y += 18;
  }
  cur.note(Object.entries(MOTION).map(([k, v]) => `${k} ${v} ms`).join(' · '));
  cur.note('All motion is off under Reduce motion (A11Y-12).');
}

const DISPLAY_SAMPLE = 'Strategos · Стратег';
const TEXT_SAMPLE = 'March at dawn · Выступаем на рассвете';
/** TYPE.display is for big numbers (balances, the floor medallion). */
const NUMBER_SAMPLE = '1,234 · 640 · 12K';

/** Every type role in its face, the font colours on their surfaces, and the text rules. */
export function buildType(cur: Cursor): void {
  const { scene, w } = cur;
  cur.title('Type scale');
  cur.note(`Cinzel caps for display, Inter for text. Floor: text ${TEXT_MIN}, display ${DISPLAY_MIN} (13 / 14 CSS px). Line height ${LINE_RATIO.toFixed(2)}x.`);
  for (const r of typeRoles()) {
    const face = r.face === 'display' ? 'Cinzel caps' : r.face === 'micro' ? 'decoration only' : 'Inter';
    cur.add(mtext(scene, 0, cur.y, `${r.name} · ${r.size} · ${face}`, 'pSec', { size: TEXT_MIN, maxW: w }));
    cur.y += Math.ceil(lineHeight(TEXT_MIN)) + 1;
    const str = r.face === 'display' ? DISPLAY_SAMPLE.toUpperCase() : r.name === 'display' ? NUMBER_SAMPLE : TEXT_SAMPLE;
    const t = mtext(scene, 0, cur.y, str, r.face === 'display' ? 'rInk' : 'pInk', { size: r.size, maxW: w });
    // TYPE.micro is for plates and flourishes only (A11Y-09 exempts it): the layout check does not count it
    if (r.face === 'micro') uiIgnore(t);
    cur.add(t);
    cur.y += Math.ceil(lineHeight(r.size)) + 4;
  }

  cur.title('Ink on parchment');
  const inks: [FontKey, string][] = [
    ['pInk', 'pInk: body'], ['pSec', 'pSec: secondary'], ['pMuted', 'pMuted: locked'], ['pOff', 'pOff: disabled'], ['pGood', 'pGood: gain'], ['pBad', 'pBad: loss, error'],
    ['pGold', 'pGold: reward'], ['pXp', 'pXp: experience'], ['pPremium', 'pPremium: Drachmae'], ['rInk', 'RINK: CINZEL'], ['hInk', 'hInk: heading'],
  ];
  fontRows(cur, inks);

  cur.title('Type on stone');
  const stoneFonts: [FontKey, string][] = [['rCream', 'RCREAM: ON FILLS'], ['rGold', 'RGOLD: TITLES'], ['rOff', 'ROFF: DISABLED'], ['light', 'light: body on stone'], ['gold', 'gold: numbers'], ['sec', 'sec: captions'], ['good', 'good: gain'], ['bad', 'bad: loss']];
  const rows = Math.ceil(stoneFonts.length / 2);
  const h = rows * 11 + 6;
  cur.add(mosaicImage(scene, 0, cur.y, w, h, 'topBar'));
  cur.y += 3;
  fontRows(cur, stoneFonts);
  cur.y += 3;

  cur.title('Text rules');
  cur.note('A must-show fact wraps (wrap: true); a word is never cut:', 'pInk');
  cur.note('Hire costs 120 gold and 2 days: the recruit joins your warband at the next town you enter.');
  cur.note('A button label steps down to 6.5, then is written in Inter, then is cut with its full text on long press:', 'pInk');
  for (const room of [Math.min(w, 130), 80, 50]) {
    cur.add(new MButton(scene, 0, cur.y, room, 24, { label: 'Continue the march', variant: 'secondary', id: `kit.fit.${room}` }));
    cur.y += 24 + G;
  }
  cur.note('Numbers are Inter with even digits: 1,234 · 56,789 · 12K · 99+');
}

function fontRows(cur: Cursor, fonts: [FontKey, string][]): void {
  const half = Math.floor((cur.w - G) / 2);
  fonts.forEach(([font, label], i) => {
    cur.add(mtext(cur.scene, (i % 2) * (half + G), cur.y + Math.floor(i / 2) * 11, label, font, { size: 7, maxW: half }));
  });
  cur.y += Math.ceil(fonts.length / 2) * 11;
}
