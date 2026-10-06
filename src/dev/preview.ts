/** Dev-only sprite sheet preview: open /preview.html on the dev server. */
import { renderSheet, FW, FH, NFRAMES, type DollSpec } from '../art/paperdoll';

const specs: DollSpec[] = [
  { look: { skin: 1, hair: 0, hairStyle: 0, beard: 1, tunic: 'tunicBlue' }, weapon: 'spear', shield: { art: 'hoplon', paint: { emblem: 'lambda', field: 'bronze', ink: 'ink' } }, helmet: { art: 'corinthian', paint: { field: 'red' } }, armor: 'linothorax' },
  { look: { skin: 2, hair: 1, hairStyle: 1, beard: 2, tunic: 'tunicGreen' }, weapon: 'spear', shield: { art: 'hoplon', paint: { emblem: 'owl', field: 'cream', ink: 'red' } }, helmet: { art: 'pilos' }, armor: 'cuirass' },
  { look: { skin: 0, hair: 3, hairStyle: 1, beard: 1, tunic: 'tunicOchre' }, weapon: 'longsword', shield: { art: 'oval', paint: { emblem: 'boar', field: 'red', ink: 'cream' } }, helmet: { art: 'montefortino', paint: { field: 'ink' } }, armor: 'mail' },
  { look: { skin: 3, hair: 0, hairStyle: 2, beard: 0, tunic: 'tunicWhite' }, weapon: 'javelins', shield: { art: 'buckler', paint: { field: 'bronze' } } },
  { look: { skin: 1, hair: 2, hairStyle: 0, beard: 2, tunic: 'tunicRed' }, weapon: 'axe', shield: { art: 'hoplon', paint: { emblem: 'trident', field: 'ink', ink: 'cream' } }, helmet: { art: 'chalcidian', paint: { field: 'cream' } }, armor: 'scale' },
  { look: { skin: 2, hair: 0, hairStyle: 0, beard: 0, tunic: 'tunicWhite' }, weapon: 'sling' },
  { look: { skin: 1, hair: 1, hairStyle: 0, beard: 1, tunic: 'tunicGreen' }, weapon: 'bow', helmet: { art: 'cap' }, armor: 'leather' },
  { look: { skin: 1, hair: 0, hairStyle: 0, beard: 1, tunic: 'tunicBlue' }, weapon: 'club', shield: { art: 'hoplon', paint: { emblem: 'sunwheel', field: 'red', ink: 'ink' } } },
];
const scale = Number(new URLSearchParams(location.search).get('s') ?? 3);
for (const s of specs) {
  const sheet = renderSheet(s).toCanvas();
  const c = document.createElement('canvas');
  c.width = FW * NFRAMES * scale;
  c.height = FH * 2 * scale;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sheet, 0, 0, c.width, c.height);
  document.body.appendChild(c);
}
