/**
 * The Kit's "Icons" page (story F-05): the morale glyphs and badge markers of the battle HUD (vector,
 * battle-readability R1/R2), the three icon looks on parchment and on stone, the v5 atlas keys with
 * the stand-in a staged key draws, and then every icon a screen can name, with its name.
 */
import { addIcon, scaleIcon } from '../../ui/kit';
import { MORALE_GLYPH, moraleGlyph, type MoraleState } from '../../ui/battleHud';
import { mosaicImage, mtext } from '../../ui/mosaic';
import { STAGED_ICONS } from '../../art/iconBitmaps';
import { TEXT_MIN } from '../../ui/tokens';
import { columns, kitIconNames, v5IconKeys } from './catalog';
import { G, type Cursor } from './common';

const CELL_W = 64;
const ROW = 15;

export function buildIcons(cur: Cursor): void {
  const { scene, w } = cur;
  const third = Math.floor(w / 3);

  cur.title('Morale glyphs');
  cur.note('Shapes that read without colour (A11Y-04): shield, cracked shield, falling standard. Tinted by state; wavering pulses.');
  const states = Object.keys(MORALE_GLYPH) as MoraleState[];
  const band = (y: number, dark: boolean, draw: (cx: number, i: number) => void) => {
    if (dark) cur.add(mosaicImage(scene, 0, y - 2, w, 26, 'topBar'));
    states.forEach((_, i) => draw(Math.round(third * i + third / 2), i));
  };
  band(cur.y + 2, false, (cx, i) => cur.add(moraleGlyph(scene, cx, cur.y + 11, 20, states[i])));
  cur.y += 24;
  states.forEach((s, i) => cur.add(mtext(scene, Math.round(third * i + third / 2), cur.y, s, 'pInk', { size: TEXT_MIN, align: 0.5, maxW: third - 2 })));
  cur.y += 12;
  band(cur.y + 2, true, (cx, i) => cur.add(moraleGlyph(scene, cx, cur.y + 13, 20, states[i])));
  cur.y += 30;

  cur.title('Badge markers');
  const markers: [string, string][] = [['marker_crest', 'captain'], ['marker_standard', 'Standard'], ['marker_disordered', 'disordered']];
  markers.forEach(([key, label], i) => {
    const cx = Math.round(third * i + third / 2);
    cur.add(scaleIcon(addIcon(scene, cx - 10, cur.y, key), 20 / 12));
    cur.add(mtext(scene, cx, cur.y + 22, label, 'pInk', { size: TEXT_MIN, align: 0.5, maxW: third - 2 }));
  });
  cur.y += 34;

  cur.title('Looks');
  cur.note('Full colour; light (on fills); dim (disabled: desaturated, never recoloured).');
  const sample = ['swords', 'coin', 'helmet', 'map', 'tent', 'laurel'];
  const step = Math.floor(w / sample.length);
  for (const [look, dark] of [['', false], ['L', true], ['D', false]] as const) {
    if (dark) cur.add(mosaicImage(scene, 0, cur.y - 2, w, 20, 'topBar'));
    sample.forEach((n, i) => cur.add(scaleIcon(addIcon(scene, i * step + Math.round((step - 16) / 2), cur.y, n, look), 16 / 12)));
    cur.y += 22;
  }

  cur.title('v5 atlas keys');
  cur.note(`A staged key draws the icon its slot shows today until its story ships it (F-04). Staged: ${STAGED_ICONS.length}.`);
  grid(cur, v5IconKeys().map(({ key, standIn }) => ({ icon: key, label: STAGED_ICONS.includes(key) ? `${key} > ${standIn}` : key })));

  const names = kitIconNames();
  cur.title(`Every icon (${names.length})`);
  cur.note('addIcon(scene, x, y, name): one meaning per icon; resources and modes are reserved (tokens.ts).');
  grid(cur, names.map((n) => ({ icon: n, label: n })));
}

function grid(cur: Cursor, cells: { icon: string; label: string }[]): void {
  const cols = columns(cur.w, CELL_W, G);
  const cw = Math.floor((cur.w - (cols - 1) * G) / cols);
  cells.forEach((c, i) => {
    const x = (i % cols) * (cw + G);
    const y = cur.y + Math.floor(i / cols) * ROW;
    cur.add(addIcon(cur.scene, x, y + 1, c.icon));
    cur.add(mtext(cur.scene, x + 15, y + 2, c.label, 'pInk', { size: TEXT_MIN, maxW: cw - 15 }));
  });
  cur.y += Math.ceil(cells.length / cols) * ROW;
}
