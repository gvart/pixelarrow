/**
 * The Army template's parts (screens-campaign.md C-7): the hero card and its
 * one-line collapsed form, a roster row, the group disc, the footer and the
 * option sheet. Every text is at least 6.5 UI px (A11Y-09); numbers are never
 * cut (G14); selection is never colour alone (G13); grey only for disabled (G2).
 */
import Phaser from 'phaser';
import type { Hero } from '../../data/units';
import type { Slot } from '../../data/items';
import { heroClass } from '../../sim/stats';
import { dollFromHero } from '../../art/paperdoll';
import { addPortrait } from '../sprites';
import { addIcon, tappable, type ScrollArea } from '../kit';
import { uiFrame, uiId } from '../layout';
import { wrapText } from '../textfit';
import { ROMAN, Stage, addStars, className, groupName, roleColor, roleName } from '../sheet';
import { heroStars, powerRating } from '../../game/gear';
import { GROUP_COLOR, MOSAIC, ACCENT, TEXT_MIN, lineHeight } from '../tokens';
import { GAP, GearSlot, MBadge, MButton, MIconButton, TAP, addNiche, addPortraitWell, addRowFace, mosaicImage, mountSlot, mtext, mw, slotGrid, type MButtonOpts } from '../mosaic';
import { makePressable, wrapWords } from '../mosaic/base';
import { navLayer } from '../../platform/nav';
import { t } from '../../i18n';
import { addClassBust } from './busts';
import { SLOT_ORDER, footerLayout, groupNameBeside } from './layout';
import type { ArmySource } from './source';

type C = Phaser.GameObjects.Container;
const LV_FILL = MOSAIC.bronze;
const PILL_H = 13;
/** Line pitch of 6.5 text, UI px. */
export const ARMY_LH = Math.ceil(lineHeight(TEXT_MIN));

/** A filled pill with cream text at 6.5 (a level, a role, a status); a long word list wraps onto a second line. Returns its width. */
export function armyPill(scene: Phaser.Scene, parent: C, x: number, y: number, text: string, color: number, maxW: number): number {
  const lines = wrapWords(text, maxW - 8, (s) => mw(s, 'onAccent', TEXT_MIN)).slice(0, 2);
  const txts = lines.map((l, i) => mtext(scene, 0, 0, l, 'onAccent', { size: TEXT_MIN, maxW: maxW - 8 }).setPosition(Math.round(x) + 4, Math.round(y) + 2.5 + i * ARMY_LH));
  const w = Math.ceil(Math.max(...txts.map((tx) => tx.width))) + 8;
  const h = PILL_H + (lines.length - 1) * ARMY_LH;
  const g = scene.add.graphics();
  g.fillStyle(0x1a0d06, 1);
  g.fillRoundedRect(Math.round(x), Math.round(y), w, h, 3);
  g.fillStyle(color, 1);
  g.fillRoundedRect(Math.round(x) + 0.7, Math.round(y) + 0.7, w - 1.4, h - 1.4, 2.6);
  parent.add(g);
  for (const tx of txts) parent.add(uiFrame(tx, g, w, h, Math.round(x), Math.round(y)));
  return w;
}

/** Height of an armyPill with `text` at `maxW` (one or two lines). */
export const armyPillH = (text: string, maxW: number): number => PILL_H + (Math.min(2, wrapWords(text, maxW - 8, (s) => mw(s, 'onAccent', TEXT_MIN)).length) - 1) * ARMY_LH;

/** Width of an armyPill with `text` (unfitted). */
export const armyPillW = (text: string): number => Math.ceil(mw(text, 'onAccent', TEXT_MIN)) + 8;

/** A battle-group disc: the group's colour (art bible 4.2, never red) with its cream numeral (G3, G13). */
export function addGroupDisc(scene: Phaser.Scene, parent: C, x: number, y: number, g: number, d = 15): void {
  const gr = scene.add.graphics();
  gr.fillStyle(0x1a0d06, 1);
  gr.fillCircle(x + d / 2, y + d / 2, d / 2 + 0.8);
  gr.fillStyle(GROUP_COLOR[g] ?? MOSAIC.bronze, 1);
  gr.fillCircle(x + d / 2, y + d / 2, d / 2);
  parent.add(gr);
  const n = mtext(scene, x + d / 2, y + (d - 8) / 2, ROMAN[g] ?? '?', 'rCream', { size: TEXT_MIN, align: 0.5 });
  parent.add(uiId(n, 'army.groupDisc'));
}

/** A small check mark (the selected group, G13). */
function addCheck(scene: Phaser.Scene, parent: C, x: number, y: number): void {
  const g = scene.add.graphics();
  g.fillStyle(0x1a0d06, 1);
  g.fillCircle(x, y, 4.6);
  g.fillStyle(MOSAIC.inkGood, 1);
  g.fillCircle(x, y, 3.8);
  g.lineStyle(1.2, MOSAIC.cream, 1);
  g.beginPath();
  g.moveTo(x - 2, y);
  g.lineTo(x - 0.5, y + 1.6);
  g.lineTo(x + 2.2, y - 1.6);
  g.strokePath();
  parent.add(g);
}

// ------------------------------------------------------------------ the hero card

export interface HeadOpts {
  /** Group buttons (null: this army has no groups to change). */
  onGroup: ((g: number) => void) | null;
  onSlot: (s: Slot) => void;
  /** The slot the stash is filtered to (lit). */
  selectedSlot?: Slot | 'all' | null;
}

export interface HeadResult {
  h: number;
  slots: Map<Slot, GearSlot>;
}

/**
 * The selected hero's card: his figure in a stone niche (an integer-scaled pixel sprite) with the
 * class bust in the niche's corner; name, class, Lv and role pills, Power and rank stars; group
 * buttons I-IV and the group's name; the gear slots in the shared order (ARM-8).
 */
export function addArmyHead(scene: Phaser.Scene, parent: C, x0: number, y0: number, cw: number, h: Hero, src: ArmySource, o: HeadOpts): HeadResult {
  const cls = heroClass(h);
  const P = 5;
  const nw = 56;
  const nh = 72;
  const card = scene.add.container(x0, y0);
  const bg = mosaicImage(scene, 0, 0, cw, 10, 'parchment');
  card.add(bg);
  const box = { owner: card, w: cw, h: 400 };
  card.add(new Stage(scene, P, P, nw, nh, h, { scale: 2 }));
  addNiche(scene, card, P, P, nw, nh);
  addClassBust(scene, card, P + 2, P + 2, 20, cls.id);
  const st = src.status(h);
  if (st) armyPill(scene, card, P + 2, P + nh - PILL_H - 2, st.text, ACCENT.dangerFill, nw - 4);
  // the right column
  const tx = P + nw + 7;
  const tw = cw - tx - P;
  let y = P;
  card.add(mtext(scene, tx, y, h.name, 'rInk', { size: 7.5, maxW: tw, box }));
  y += 11;
  const cl = wrapText(className(h), tw, 2, false, TEXT_MIN).lines;
  cl.forEach((l, i) => card.add(mtext(scene, tx, y + i * ARMY_LH, l, 'pSec', { size: TEXT_MIN, box })));
  y += cl.length * ARMY_LH + 3;
  const lvW = armyPill(scene, card, tx, y, t('hero.level', { n: h.level }), LV_FILL, tw);
  const role = roleName(cls.role);
  const roleW = mw(role, 'onAccent', TEXT_MIN) + 8;
  if (lvW + 3 + roleW <= tw) {
    armyPill(scene, card, tx + lvW + 3, y, role, roleColor(cls.role), tw - lvW - 3);
    y += PILL_H + 3;
  } else {
    y += PILL_H + 2;
    armyPill(scene, card, tx, y, role, roleColor(cls.role), tw);
    y += armyPillH(role, tw) + 3;
  }
  const pw = mtext(scene, tx, y, t('hero.power', { n: powerRating(h) }), 'rInk', { size: 7, box });
  card.add(pw);
  if (pw.width + 4 + 39 <= tw) addStars(scene, card, tx + pw.width + 4, y + 1, heroStars(h), 5, {});
  else addStars(scene, card, tx, (y += 10), heroStars(h), 5, {});
  y += 10;
  // groups, under the niche and the column
  let gy = Math.max(P + nh, y) + 4;
  if (o.onGroup) {
    const inner = cw - 2 * P;
    const gw = Math.max(TAP, Math.min(30, Math.floor((inner - 3 * GAP) / 4)));
    const bw = 4 * gw + 3 * GAP;
    ROMAN.forEach((r, g) => {
      const on = h.group === g;
      const gx = P + g * (gw + GAP);
      card.add(
        new MIconButton(scene, gx, gy, gw, TAP, {
          text: r,
          variant: on ? 'lit' : 'secondary',
          label: `${t('army.group')} ${r}: ${groupName(g)}. ${t('army.groupTip')}`,
          id: `army.group.${g}`,
          onClick: () => o.onGroup!(g),
        }),
      );
      // the group's colour as a stripe under its numeral (the battle's group colours)
      const s = scene.add.graphics();
      s.fillStyle(GROUP_COLOR[g], 1);
      s.fillRect(gx + 4, gy + TAP - 4, gw - 8, 2);
      card.add(s);
      if (on) addCheck(scene, card, gx + gw - 3, gy + 3);
    });
    const name = groupName(h.group);
    if (groupNameBeside(inner - bw - 4, mw(name, 'pSec', TEXT_MIN))) {
      card.add(mtext(scene, P + bw + 4, gy + 7, name, 'pSec', { size: TEXT_MIN, maxW: inner - bw - 4, box }));
      gy += TAP + 4;
    } else {
      card.add(mtext(scene, P, gy + TAP + 2, name, 'pSec', { size: TEXT_MIN, maxW: inner, box }));
      gy += TAP + 2 + 9 + 3;
    }
  }
  // the slots: tap for the item card (and the stash filtered to the slot); stash items drop on them
  const n = SLOT_ORDER.length + (cls.mount ? 1 : 0);
  const grid = slotGrid(cw - 2 * P, n, 26);
  const slots = new Map<Slot, GearSlot>();
  SLOT_ORDER.forEach((s, i) => {
    const p = grid.pos(i);
    const gs = new GearSlot(scene, P + p.x, gy + p.y, { slot: s, item: h.equip[s], size: grid.ss, selected: o.selectedSlot === s, onTap: () => o.onSlot(s) });
    card.add(gs);
    slots.set(s, gs);
  });
  if (cls.mount) {
    const p = grid.pos(SLOT_ORDER.length);
    const m = mountSlot(scene, P + p.x, gy + p.y, h, grid.ss);
    if (m) card.add(m);
  }
  const ch = gy + grid.h + P + 1;
  bg.destroy();
  card.addAt(mosaicImage(scene, 0, 0, cw, ch, 'parchment'), 0);
  box.h = ch;
  parent.add(card);
  return { h: ch, slots };
}

/**
 * The card collapsed to one line (P21) while the roster scrolls under it: the portrait, name, Lv and
 * Power. A tap brings the whole card back.
 */
export function addMiniHead(scene: Phaser.Scene, parent: C, x: number, y: number, w: number, h: Hero, src: ArmySource, onTap: () => void): C {
  const c = scene.add.container(x, y);
  const H = TAP + 2;
  c.add(mosaicImage(scene, 0, 0, w, H, 'parchmentSel'));
  const cls = heroClass(h);
  const ps = H - 6;
  addPortraitWell(scene, c, 4, 3, ps, roleColor(cls.role));
  c.add(addPortrait(scene, dollFromHero(h), 4, 3, { size: ps }));
  const box = { owner: c, w, h: H };
  const right = w - 18;
  const pw = mtext(scene, right, 7, `${powerRating(h)}`, 'rInk', { size: 7, align: 1, box });
  c.add(pw);
  const lv = t('hero.level', { n: h.level });
  const lvX = right - pw.width - 4 - armyPillW(lv);
  armyPill(scene, c, lvX, 5, lv, LV_FILL, 60);
  const nx = ps + 9;
  c.add(mtext(scene, nx, 7, h.name, 'rInk', { size: 7, maxW: Math.max(20, lvX - nx - 4 - (src.pending(h) ? 12 : 0)), box }));
  if (src.pending(h)) c.add(new MBadge(scene, lvX - 8, 6, src.pending(h)));
  // a chevron: "the whole card is above"
  const up = addIcon(scene, w - 15, (H - 12) / 2, 'chevL', 'D');
  up.setAngle(90).setOrigin(0.5).setPosition(w - 9, H / 2);
  c.add(up);
  c.setSize(w, H);
  makePressable(c, { w, h: H, onTap, tip: t('army5.miniTip') });
  uiId(c, 'army.mini');
  parent.add(c);
  return c;
}

// ------------------------------------------------------------------ a roster row

/** Height of a roster row, UI px (>= 52 pt: three short lines). */
export const ARMY_ROW_H = 34;

/**
 * One hero on the roster: his own portrait (V5-045) in a role-tinted well (a cross over it when
 * wounded); name and the points count badge; Lv and the full class name (ARM-4); rank stars or his
 * status; the group disc in the group's colour and his Power on the right.
 */
export function addRosterRow(scene: Phaser.Scene, row: C, w: number, rh: number, h: Hero, src: ArmySource, selected: boolean): void {
  const box = { owner: row, w, h: rh };
  addRowFace(scene, row, w, rh, selected);
  const cls = heroClass(h);
  const ps = rh - 8;
  const py = Math.round((rh - ps) / 2);
  addPortraitWell(scene, row, 5, py, ps, roleColor(cls.role));
  row.add(addPortrait(scene, dollFromHero(h), 5, py, { size: ps }));
  const st = src.status(h);
  if (st?.bad) {
    const wg = scene.add.graphics();
    wg.fillStyle(0x000000, 0.5);
    wg.fillRect(5, py, ps, ps);
    row.add(wg);
    row.add(addIcon(scene, 5 + (ps - 12) / 2, py + (ps - 12) / 2, 'cross', 'L'));
  }
  const x = ps + 12;
  const right = w - 6;
  addGroupDisc(scene, row, right - 15, 3, h.group);
  const pt = mtext(scene, right, 21, `${powerRating(h)}`, 'rInk', { size: 7, align: 1, box });
  row.add(pt);
  const pend = src.pending(h);
  const nameW = right - 19 - x - (pend ? 16 : 0);
  const name = mtext(scene, x, 3, h.name, 'rInk', { size: 7, maxW: nameW, box });
  row.add(uiId(name, 'roster.name'));
  if (pend) row.add(new MBadge(scene, x + name.width + 9, 7, pend));
  const sub = `${t('hero.level', { n: h.level })} · ${className(h)}`;
  row.add(mtext(scene, x, 13, sub, 'pSec', { size: TEXT_MIN, maxW: right - pt.width - 4 - x, box }));
  if (st) row.add(mtext(scene, x, 23, st.text, st.bad ? 'pBad' : 'pSec', { size: TEXT_MIN, maxW: right - pt.width - 4 - x, box }));
  else addStars(scene, row, x, 24, heroStars(h));
}

// ------------------------------------------------------------------ the footer

/**
 * The fixed footer: Dismiss (bronze with a skull; confirms) on the left and Sheet (the screen's one
 * primary) on the right, 24 pt apart (C-7, P4). No back button here: the top bar's is the only one (N3).
 */
export class ArmyFooter extends Phaser.GameObjects.Container {
  readonly h = 32;
  constructor(scene: Phaser.Scene, x: number, bottom: number, w: number, dismiss: MButtonOpts, sheet: MButtonOpts) {
    super(scene, x, bottom - 32);
    this.add(mosaicImage(scene, 0, 0, w, this.h, 'sheet'));
    const nat = (b: MButtonOpts) => mw(b.label.toUpperCase(), 'rCream', 7) + 16 + (b.icon ? 14 : 0);
    const f = footerLayout(w, nat(dismiss), nat(sheet));
    this.add(new MButton(scene, f.dismiss.x, 4, f.dismiss.w, 24, dismiss));
    this.add(new MButton(scene, f.sheet.x, 4, f.sheet.w, 24, sheet));
    uiId(this, 'army.footer');
    scene.add.existing(this);
  }

  get top(): number {
    return this.y;
  }
}


// ------------------------------------------------------------------ option sheet (filter, sort)

export interface OptionSheetOpts<T> {
  title: string;
  options: { id: T; label: string }[];
  selected: T;
  onPick: (id: T) => void;
  id: string;
}

/**
 * Pick one of a few options on a sheet over a scrim (P11): two columns of bronze buttons, the
 * current one lit with a check (G13). The X, a tap outside and Back close it.
 */
export function openOptionSheet<T>(scene: Phaser.Scene & { ui: C; m: { VW: number; VH: number } }, frame: { x: number; w: number; bottom: number }, o: OptionSheetOpts<T>): C {
  const root = scene.add.container(0, 0);
  scene.ui.add(root);
  const scrim = scene.add.rectangle(0, 0, scene.m.VW, scene.m.VH, 0x0d0907, 0.45).setOrigin(0, 0);
  scrim.setInteractive();
  root.add(scrim);
  const close = () => root.destroy();
  scrim.on('pointerup', close);
  const P = 8;
  const cols = 2;
  const bw = Math.floor((frame.w - P * 2 - GAP * (cols - 1)) / cols);
  const rows = Math.ceil(o.options.length / cols);
  const h = P + 20 + rows * (TAP + GAP) - GAP + P + 2;
  const sheet = scene.add.container(frame.x, frame.bottom - h);
  root.add(sheet);
  sheet.add(mosaicImage(scene, 0, 0, frame.w, h, 'sheet'));
  // swallow taps on the sheet itself (only the scrim closes)
  const hit = scene.add.zone(0, 0, frame.w, h).setOrigin(0, 0).setInteractive();
  sheet.add(hit);
  uiId(hit, `${o.id}.bg`);
  sheet.add(mtext(scene, P + 2, P + 2, o.title, 'rInk', { size: 8, maxW: frame.w - P * 2 - TAP - 4, box: { owner: sheet, w: frame.w, h } }));
  const x = new MIconButton(scene, frame.w - TAP - 4, 4, TAP, TAP, { icon: 'xmark', label: t('mosaic.close'), variant: 'secondary', id: `${o.id}.close`, onClick: close });
  sheet.add(x);
  o.options.forEach((op, i) => {
    const on = op.id === o.selected;
    const bx = P + (i % cols) * (bw + GAP);
    const by = P + 20 + Math.floor(i / cols) * (TAP + GAP);
    sheet.add(
      new MButton(scene, bx, by, bw, TAP, {
        label: op.label,
        icon: on ? 'check' : undefined,
        variant: on ? 'lit' : 'secondary',
        id: `${o.id}.${String(op.id)}`,
        onClick: () => {
          close();
          o.onPick(op.id);
        },
      }),
    );
  });
  uiId(sheet, o.id);
  navLayer(root, close, scene);
  return root;
}

/** Make a plain row container tappable inside the page's scroll area (a drag scrolls, a tap selects). */
export function tappableRow(row: C, w: number, h: number, area: ScrollArea, onTap: () => void): void {
  row.setSize(w, h);
  row.setInteractive(new Phaser.Geom.Rectangle(w / 2, h / 2, w, h), Phaser.Geom.Rectangle.Contains);
  tappable(row, area, onTap);
}
