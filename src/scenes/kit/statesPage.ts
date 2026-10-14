/**
 * The Kit's "States" page (story F-05, KIT-2): every control family as a variant x state grid. Rows
 * are the variants (ADR-0005's roles), columns the states: default, pressed (held as a finger would
 * hold it), selected where the control has one, disabled with its reason (flat grey and a lock; a tap
 * says why). Then the error and alert states, badges and chips.
 *
 * "Focused" and "hover" (V6-INP-04, input-v6.md §2.1, §4.4): the real keyboard focus ring (two-tone,
 * drawn 2 UI px outside the control by src/ui/focusRing.ts) and the mouse hover rim, on parchment and
 * on stone, next to the pressed and disabled looks they must not be confused with. Every control on
 * this page also takes real focus (Tab) and hover.
 */
import Phaser from 'phaser';
import { Button } from '../../ui/kit';
import { toast } from '../../ui/widgets';
import {
  KeyButton, MBadge, MBar, MButton, MChip, MIconButton, ParchmentRow, ROW_H, SWITCH_H, SegmentedSwitch, StoneTile, TAP, addTipLine, mtext,
  type MButtonVariant, type MIconButtonVariant, type KeyVariant, type StoneTileVariant,
} from '../../ui/mosaic';
import { MOSAIC, RESOURCES, TEXT_MIN } from '../../ui/tokens';
import { drawFocusRing, drawHoverRim } from '../../ui/focusRing';
import { G, holdDown, type Cursor } from './common';

type Obj = Phaser.GameObjects.Container;

/** Column heads over a grid of `n` cells across `x0..w`. */
function heads(cur: Cursor, x0: number, names: string[]): number {
  const cw = Math.floor((cur.w - x0 - (names.length - 1) * G) / names.length);
  names.forEach((n, i) => cur.add(mtext(cur.scene, x0 + i * (cw + G) + cw / 2, cur.y, n, 'pSec', { size: TEXT_MIN, align: 0.5, maxW: cw })));
  cur.y += 10;
  return cw;
}

/** A row label in the left column (`lw` wide), centred on a row `h` tall. */
function rowLabel(cur: Cursor, text: string, lw: number, h: number): void {
  cur.add(mtext(cur.scene, 0, cur.y + Math.round((h - 8) / 2), text, 'pInk', { size: TEXT_MIN, maxW: lw - 2 }));
}

export function buildStates(cur: Cursor): void {
  const { scene, w } = cur;
  const tap = (s: string) => () => toast(scene, s);
  const press = <T extends Obj>(o: T): T => (holdDown(o), o);

  cur.note('Rows: variants. Columns: default, pressed (held), selected, disabled with a reason (tap it). Grey means disabled only.');

  // ---------------------------------------------------------------- focus and hover
  cur.title('Focus and hover');
  // inset by the ring's reach (5 px), which sits outside the control and would be clipped at the page edge
  const fx = 5;
  const fw = Math.floor((w - 2 * fx - 3 * G) / 4);
  heads(cur, 0, ['focused', 'hover', 'focused', 'hover']);
  // a little room for the ring, which sits outside the control
  cur.y += 4;
  const ring = scene.add.graphics();
  const sample: [MButtonVariant, string][] = [['secondary', 'Collect'], ['secondary', 'Collect'], ['primary', 'Fight'], ['primary', 'Fight']];
  sample.forEach(([v, label], i) => {
    const b = cur.add(new MButton(scene, fx + i * (fw + G), cur.y, fw, 24, { label, variant: v, onClick: tap(v), id: `kit.focus.${i}` }));
    const r = { x: b.x, y: b.y, w: b.w, h: b.h };
    if (i % 2 === 0) drawFocusRing(ring, r);
    else drawHoverRim(ring, r);
  });
  cur.add(ring);
  cur.y += 24 + 4 + G;
  const rw = Math.floor((w - 2 * fx - 2 * G) / 2);
  const row = cur.add(new ParchmentRow(scene, fx, cur.y, rw, { title: 'Focused row', icon: 'helmet', onClick: tap('row'), id: 'kit.focus.row' }));
  const row2 = cur.add(new ParchmentRow(scene, fx + rw + 2 * G, cur.y, rw, { title: 'Hover row', icon: 'helmet', onClick: tap('row'), id: 'kit.focus.row2' }));
  const ring2 = scene.add.graphics();
  drawFocusRing(ring2, { x: row.x, y: row.y, w: rw, h: ROW_H });
  drawHoverRim(ring2, { x: row2.x, y: row2.y, w: rw, h: ROW_H });
  cur.add(ring2);
  cur.y += ROW_H + 4 + G;
  cur.note('Focused: a basalt line and a cream line 2 px outside, shown only after a key (Tab, arrows), never on touch. Hover: the rim lightens, mouse only. Neither moves the control.');

  // ---------------------------------------------------------------- MButton
  cur.title('MButton');
  let cw = heads(cur, 0, ['default', 'pressed', 'disabled']);
  const mb: [MButtonVariant, string, string?][] = [['primary', 'Fight', 'swords'], ['secondary', 'Collect', 'coin'], ['neutral', 'Close'], ['lit', 'Lit'], ['purchase', '250', 'tgstar']];
  for (const [v, label, icon] of mb) {
    const id = (s: string) => `kit.mbtn.${v}.${s}`;
    cur.add(new MButton(scene, 0, cur.y, cw, 24, { label, icon, variant: v, onClick: tap(v), id: id('up') }));
    cur.add(press(new MButton(scene, cw + G, cur.y, cw, 24, { label, icon, variant: v, onClick: tap(v), id: id('down') })));
    cur.add(new MButton(scene, 2 * (cw + G), cur.y, w - 2 * (cw + G), 24, { label, icon, variant: 'disabled', disabledReason: `${v}: needs 100 gold`, id: id('off') }));
    cur.y += 24 + G;
  }
  cur.note('primary, secondary, neutral (dark bronze), lit (the toggle in force), purchase. Disabled is flat grey; the lock takes the icon\'s place where it fits.');
  // the hero chevron needs width: default and pressed side by side (its disabled face is the grey one above)
  const hw = Math.floor((w - G) / 2);
  cur.add(new MButton(scene, 0, cur.y, hw, 28, { label: 'March', variant: 'primaryHero', onClick: tap('hero'), id: 'kit.mbtn.hero.up' }));
  cur.add(press(new MButton(scene, hw + G, cur.y, w - hw - G, 28, { label: 'March', variant: 'primaryHero', onClick: tap('hero'), id: 'kit.mbtn.hero.down' })));
  cur.y += 28 + 2;
  cur.note('primaryHero, default and pressed: the one way forward on a hub.');
  cur.add(new MButton(scene, 0, cur.y, w, 24, { label: 'Garrison', icon: 'helmet', variant: 'disabled', disabledReason: 'Needs a settlement', id: 'kit.mbtn.reason' }));
  cur.y += 24 + 2;
  cur.note('Needs a settlement: the reason line under a disabled button (art bible 7.3).');
  const longW = Math.min(w, 110);
  cur.add(new MButton(scene, 0, cur.y, longW, 24, { label: 'Army with a very long label', variant: 'secondary', badge: 3, onClick: tap('long'), id: 'kit.mbtn.long' }));
  cur.y += 24 + 2;
  cur.note('A label that does not fit: 6.5, then Inter, then cut with the whole label on long press. A count badge.');

  // ---------------------------------------------------------------- v3 Button
  cur.title('Button (v3)');
  cw = heads(cur, 0, ['default', 'pressed', 'disabled']);
  const vb: ['primary' | 'secondary' | 'destructive' | 'ghost' | 'purchase', string][] = [['primary', 'Hire'], ['secondary', 'Sell'], ['destructive', 'Scrap'], ['ghost', 'Later'], ['purchase', 'Buy']];
  for (const [v, label] of vb) {
    const id = (s: string) => `kit.btn.${v}.${s}`;
    cur.add(new Button(scene, 0, cur.y, cw, 24, { label, variant: v, onClick: tap(v), id: id('up') }));
    cur.add(press(new Button(scene, cw + G, cur.y, cw, 24, { label, variant: v, onClick: tap(v), id: id('down') })));
    const off = new Button(scene, 2 * (cw + G), cur.y, w - 2 * (cw + G), 24, { label, variant: v, disabledReason: `${v}: not now`, id: id('off') });
    off.setEnabled(false);
    cur.add(off);
    cur.y += 24 + G;
  }
  cur.note('The legacy button: destructive is wine and always confirms; ghost draws dark bronze.');

  // ---------------------------------------------------------------- MIconButton
  cur.title('MIconButton');
  const lw = 50;
  const iheads = ['default', 'pressed', 'disabled'];
  cw = heads(cur, lw, iheads);
  const ib: MIconButtonVariant[] = ['secondary', 'neutral', 'primary', 'selected', 'lit'];
  for (const v of ib) {
    rowLabel(cur, v, lw, TAP);
    const cx = (i: number) => lw + i * (cw + G) + Math.round((cw - TAP) / 2);
    const id = (s: string) => `kit.ibtn.${v}.${s}`;
    cur.add(new MIconButton(scene, cx(0), cur.y, TAP, TAP, { icon: 'eye', label: v, variant: v, onClick: tap(v), id: id('up') }));
    cur.add(press(new MIconButton(scene, cx(1), cur.y, TAP, TAP, { icon: 'eye', label: v, variant: v, onClick: tap(v), id: id('down') })));
    cur.add(new MIconButton(scene, cx(2), cur.y, TAP, TAP, { icon: 'eye', label: v, variant: v, off: `${v}: not yet`, id: id('off') }));
    cur.y += TAP + G;
  }
  rowLabel(cur, 'badge, count', lw, TAP);
  cur.add(new MIconButton(scene, lw + Math.round((cw - TAP) / 2), cur.y, TAP, TAP, { icon: 'chest', label: 'Badge', badge: 3, onClick: tap('badge'), id: 'kit.ibtn.badge' }));
  cur.add(new MIconButton(scene, lw + cw + G + Math.round((cw - TAP) / 2), cur.y, TAP, TAP, { icon: 'tent', label: 'Count', variant: 'neutral', count: '2', onClick: tap('count'), id: 'kit.ibtn.count' }));
  cur.add(new MIconButton(scene, lw + 2 * (cw + G) + Math.round((cw - TAP) / 2), cur.y, TAP, TAP, { text: 'III', label: 'Group', variant: 'neutral', onClick: tap('group'), id: 'kit.ibtn.text' }));
  cur.y += TAP + G;

  // ---------------------------------------------------------------- KeyButton
  cur.title('KeyButton (battle)');
  const klw = 34;
  cw = heads(cur, klw, ['up', 'held', 'lit', 'off']);
  const kb: KeyVariant[] = ['primary', 'bronze', 'stone'];
  for (const v of kb) {
    rowLabel(cur, v, klw, TAP);
    const kx = (i: number) => klw + i * (cw + G);
    const id = (s: string) => `kit.key.${v}.${s}`;
    cur.add(new KeyButton(scene, kx(0), cur.y, cw, TAP, { label: 'Go', icon: 'charge', iconOnly: true, variant: v, onClick: tap(v), id: id('up') }));
    cur.add(press(new KeyButton(scene, kx(1), cur.y, cw, TAP, { label: 'Go', icon: 'charge', iconOnly: true, variant: v, onClick: tap(v), id: id('down') })));
    cur.add(new KeyButton(scene, kx(2), cur.y, cw, TAP, { label: 'Go', icon: 'charge', iconOnly: true, variant: v, lit: true, onClick: tap(v), id: id('lit') }));
    cur.add(new KeyButton(scene, kx(3), cur.y, w - kx(3), TAP, { label: 'Go', icon: 'charge', iconOnly: true, variant: v, disabledReason: `${v}: on cooldown`, id: id('off') }));
    cur.y += TAP + G;
  }
  cur.note('up: default, held: pressed, lit: the order in force, off: on cooldown. stone draws dark bronze (ADR-0005).');

  // ---------------------------------------------------------------- StoneTile
  cur.title('StoneTile');
  cw = heads(cur, 0, ['default', 'pressed', 'disabled']);
  const tiles: [StoneTileVariant, string, string][] = [['stone', 'Army', 'helmet'], ['terracotta', 'Duels', 'swords'], ['glaze', 'World', 'map'], ['bronze', 'Stash', 'chest']];
  const th = Math.min(cw, 48);
  for (const [v, label, icon] of tiles) {
    const id = (s: string) => `kit.tile.${v}.${s}`;
    cur.add(new StoneTile(scene, 0, cur.y, cw, th, { icon, label, variant: v, onClick: tap(v), id: id('up') }));
    cur.add(press(new StoneTile(scene, cw + G, cur.y, cw, th, { icon, label, variant: v, onClick: tap(v), id: id('down') })));
    const off = cur.add(new StoneTile(scene, 2 * (cw + G), cur.y, w - 2 * (cw + G), th, { icon, label, variant: v, disabled: 'Locked until day 3', id: id('off') }));
    cur.y += off.totalH + G;
  }

  // ---------------------------------------------------------------- SegmentedSwitch and rows
  cur.title('Switch and rows');
  cur.add(new SegmentedSwitch(scene, 0, cur.y, w, { options: [{ id: 'l', label: 'Ladder', icon: 'ladder' }, { id: 'a', label: 'Arena', icon: 'arena' }, { id: 'r', label: 'Raids', icon: 'raid', off: 'Unlocks at duel level 5' }], selected: 'l', onChange: (id) => toast(scene, id), id: 'kit.switch' }));
  cur.y += SWITCH_H + 2;
  cur.note('Selected: the parchment block with a bronze rim. Off: a lock and a faded label.');
  const rows = [
    { title: 'Default row', icon: 'helmet', value: '+80', onClick: tap('row') },
    { title: 'Selected row', icon: 'people', selected: true, badge: 2, onClick: tap('row') },
    { title: 'Disabled row', icon: 'lock', disabled: 'Clear floor 10 to open' },
  ];
  rows.forEach((o, i) => {
    cur.add(new ParchmentRow(scene, 0, cur.y, w, { ...o, id: `kit.row.${i}` }));
    cur.y += ROW_H + G;
  });
  cur.note('Rows: default, selected (lit block, count badge), disabled (tap says why). The subtitle line is left off: it still draws under 6.5 (F-02 note 4).');

  // ---------------------------------------------------------------- badges and chips
  cur.title('Badges');
  const bx = [0, 1, 2, 3, 4].map((i) => Math.round(((i + 0.5) * w) / 5));
  const badges: [number | string, string][] = [[0, '0: none'], [1, '1'], [12, '12'], [120, '120'], ['!', '"!": dot']];
  badges.forEach(([n, lab], i) => {
    cur.add(new MBadge(scene, bx[i], cur.y + 7, n));
    cur.add(mtext(scene, bx[i], cur.y + 16, lab, 'pSec', { size: TEXT_MIN, align: 0.5, maxW: Math.floor(w / 5) - 2 }));
  });
  cur.y += 28;
  cur.note('Counts of something to act on only, 99+ at most; nothing for 0; a non-number is a quiet dot (G11).');

  cur.title('Chips');
  const chipRow = (chips: MChip[]) => {
    let x = 0;
    for (const ch of chips) {
      if (x > 0 && x + ch.w > w) {
        x = 0;
        cur.y += ch.h + G;
      }
      ch.x = x;
      ch.y = cur.y;
      cur.add(ch);
      x += ch.w + G;
    }
    cur.y += (chips[chips.length - 1]?.h ?? 18) + G;
  };
  chipRow([
    new MChip(scene, 0, 0, { icon: 'coin', value: 240 }),
    new MChip(scene, 0, 0, { icon: 'trophy', value: 3 }),
    new MChip(scene, 0, 0, { icon: 'people', value: '9 men' }),
  ]);
  const tapChip = new MChip(scene, 0, 0, { icon: 'coin', value: '1.2K', surface: 'stone', onClick: tap('gold') });
  chipRow([new MChip(scene, 0, 0, { icon: 'laurel', value: 640, surface: 'stone' }), tapChip, press(new MChip(scene, 0, 0, { icon: 'drachma', value: 75, surface: 'stone', onClick: tap('drachmae') }))]);
  chipRow([new MChip(scene, 0, 0, { icon: 'coin', value: 1234567, w: 44 }), new MChip(scene, 0, 0, { icon: 'xp', value: 'Experience', w: 44 })]);
  cur.note('Parchment, stone, tappable and pressed. A number never cuts: it shrinks to 6.5, then writes 1.2M; only a word is cut.');

  // ---------------------------------------------------------------- error and alert
  cur.title('Error and alert');
  cur.y += addTipLine(scene, cur.c, 0, cur.y, w, { text: 'Your team is over this floor\'s budget.', tone: 'warn' }) + G;
  cur.y += addTipLine(scene, cur.c, 0, cur.y, w, { text: 'A warning on a card.', card: true, tone: 'warn' }) + G;
  cur.note('Not enough gold: 120 of 200.', 'pBad');
  cur.add(new MBar(scene, 0, cur.y, w, { value: 0, max: 5, color: RESOURCES.glory.color, label: 'Tickets', right: '0 / 5', quiet: true, h: 4 }));
  cur.y += 11 + 4 + G;
  cur.note(`Red (#${MOSAIC.alert.toString(16)}) is for errors, losses and alerts only, always with a word or a glyph (A11Y-04).`);
}
