/**
 * The town Smith's forge (EC-01, design/gdd/forge-reroll.md), two parchment sheets:
 *
 * - the list: every item the Smith takes (worn and stashed, finest first), each a row with its
 *   icon, name in its rarity ink, who wears it and the price. A tap opens the item.
 * - the item: its random-stat lines as selectable rows (the weakest selected first), the power that
 *   stays, the gold in hand and Reforge under the thumb. After a reforge the new line is marked
 *   and the old one shown under it; when gold is short the reason is written on the sheet, not
 *   only behind a grey button.
 *
 * Labels never cut (Director, 320 wide): a stat name wraps onto a second line instead.
 * The scene owns the rule call and the save (`reforge`); this file only draws.
 */
import Phaser from 'phaser';
import { ScrollArea, addIcon, scaleIcon, type FontKey, type UIMetrics } from '../kit';
import { ItemIcon, addScrollHint } from '../widgets';
import { LINE_H } from '../textfit';
import { MOSAIC, TEXT_MIN } from '../tokens';
import { addRowFace, mtext, mw, openParchmentSheet, rarityInk, sheetActionsH, wrapWords, SHEET_TITLE_H, TAP, GAP, type MButtonOpts } from '../mosaic';
import { makePressable } from '../mosaic/base';
import { itemName } from '../sheet';
import { POWERS, itemAffixes, itemPower, type AffixId } from '../../data/affixes';
import { itemDef, normalizeRarity, type Item } from '../../data/items';
import type { Hero } from '../../data/units';
import { affixLineText, forgeDefaultLine, type ForgeCandidate, type ForgeRefusal, type ForgeResult } from '../../game/gear';
import { forgeCost, groupDigits } from '../../game/economy';
import { lang, t, tOr, type TKey } from '../../i18n';

type UiScene = Phaser.Scene & { m: UIMetrics; ui: Phaser.GameObjects.Container };
type C = Phaser.GameObjects.Container;

export interface ForgeSheetOpts {
  /** The items the Smith takes (forgeCandidates), re-read on every redraw. */
  candidates: () => ForgeCandidate[];
  /** Gold in hand. */
  gold: () => number;
  /** Reforge `line` of `item`: the rule call, the save and the scene's refresh. */
  reforge: (item: Item, line: number) => ForgeResult | ForgeRefusal;
}

const PAD = 8;

/** Gold as the player reads it: thousands grouped ("12 450" in Russian). */
export const goldText = (n: number): string => groupDigits(n, lang());

/** A line as text: "Damage +1". */
export function forgeLineText(it: Item, [id, n]: [AffixId, number]): string {
  return `${tOr(`mod.${id}`, id)} ${affixLineText(it, id, n)}`;
}

/** Wrapped lines of `s` in `font` at `size` within `w` (never cut). */
function lines(s: string, w: number, font: FontKey, size = TEXT_MIN): string[] {
  return wrapWords(s, w, (z) => mw(z, font, size));
}

/** A paragraph into `c`; returns its height. */
function para(scene: Phaser.Scene, c: C, x: number, y: number, s: string, font: FontKey, w: number, size = TEXT_MIN): number {
  const ls = lines(s, w, font, size);
  if (!ls.length) return 0;
  c.add(mtext(scene, x, y, ls.join('\n'), font, { size }));
  return Math.ceil((ls.length * LINE_H * size) / 7);
}

/** Sheet width: the recruit sheet's, wider on a wide screen. */
const sheetW = (VW: number): number => Math.min(VW - 16, 240);

// ------------------------------------------------------------------ the list

function fillList(scene: UiScene, c: C, o: ForgeSheetOpts, w: number, onPick: (cand: ForgeCandidate) => void, area: ScrollArea | null): number {
  let y = 0;
  y += para(scene, c, 0, y, t('forge.intro'), 'pInk', w) + 4;
  const gold = o.gold();
  y += para(scene, c, 0, y, t('forge.gold', { n: goldText(gold) }), 'pSec', w) + 4;
  const list = o.candidates();
  if (!list.length) {
    y += para(scene, c, 0, y, t('forge.none'), 'pBad', w) + 2;
    return y;
  }
  const IS = 20;
  for (const cand of list) {
    const it = cand.item;
    const cost = forgeCost(it);
    const price = goldText(cost);
    const pw = Math.ceil(mw(price, 'pInk', TEXT_MIN)) + 14;
    const tx = IS + 8;
    const tw = w - tx - pw - 6;
    const name = lines(itemName(it), tw, rarityInk(scene, it.rarity), 7).slice(0, 2);
    const sub = lines(cand.hero ? t('forge.worn', { name: cand.hero.name }) : t('forge.stash'), tw, 'pSec');
    const rh = Math.max(TAP + 4, 6 + name.length * LINE_H + sub.length * Math.ceil((LINE_H * TEXT_MIN) / 7) + 4);
    const r = scene.add.container(0, y);
    const rb = { owner: r, w, h: rh };
    addRowFace(scene, r, w, rh);
    r.add(new ItemIcon(scene, 4, Math.round((rh - IS) / 2), { item: it }, { size: IS, tip: false, glow: false }));
    r.add(mtext(scene, tx, 4, name.join('\n'), rarityInk(scene, it.rarity), { box: rb }));
    r.add(mtext(scene, tx, 4 + name.length * LINE_H, sub.join('\n'), 'pSec', { size: TEXT_MIN, box: rb }));
    const py = Math.round((rh - 10) / 2);
    r.add(scaleIcon(addIcon(scene, w - pw - 2, py - 1, 'coin'), 0.75));
    r.add(mtext(scene, w - 4, py, price, gold >= cost ? 'pInk' : 'pBad', { size: TEXT_MIN, align: 1, box: rb }));
    makePressable(r, { w, h: rh, inset: 1, onTap: () => !area?.moved && onPick(cand), tip: itemName(it) });
    c.add(r);
    y += rh + GAP;
  }
  return y;
}

/** The Smith's list (Services › Smith). */
export function openForgeSheet(scene: UiScene, o: ForgeSheetOpts): { close: () => void } {
  const { VW, VH } = scene.m;
  const w = sheetW(VW);
  const iw = w - PAD * 2 - 4;
  const closeBtn: MButtonOpts[] = [{ label: t('common.close'), variant: 'neutral', id: 'forge.close', onClick: () => s.close() }];
  const probe = scene.add.container(0, 0);
  const contentH = fillList(scene, probe, o, iw, () => undefined, null);
  probe.destroy();
  const h = Math.min(VH - 12, SHEET_TITLE_H + contentH + PAD * 2 + sheetActionsH(closeBtn, w) + 6);
  const s = openParchmentSheet(scene, { title: t('forge.smith'), w, h, id: 'forge.sheet', actions: closeBtn });
  let area: ScrollArea | null = null;
  const draw = () => {
    area?.destroy();
    area = new ScrollArea(scene, s.c, s.body.x + 2, s.body.y, s.body.w - 2, s.body.h, scene.m.S);
    const a = area;
    const ch = fillList(scene, a.content, o, iw, (cand) => openForgeItemSheet(scene, { ...o, item: cand.item, hero: cand.hero, onClose: draw }), a);
    a.setContentHeight(ch);
    addScrollHint(scene, s.c, a, MOSAIC.parch);
  };
  draw();
  s.c.once('destroy', () => area?.destroy());
  return { close: s.close };
}

// ------------------------------------------------------------------ one item

export interface ForgeItemOpts extends ForgeSheetOpts {
  item: Item;
  hero?: Hero;
  onClose?: () => void;
}

interface ItemState {
  sel: number;
  /** The last reforge on this sheet: its line is marked and the old line shown. */
  last: ForgeResult | null;
}

function fillItem(scene: UiScene, c: C, o: ForgeItemOpts, w: number, st: ItemState, onSel: (i: number) => void, area: ScrollArea | null): number {
  const it = o.item;
  const def = itemDef(it.def);
  const ink = rarityInk(scene, it.rarity);
  let y = 0;
  // the item: icon, name (wraps), rarity · slot, who wears it
  const IS = 26;
  const tx = IS + 6;
  const tw = w - tx;
  c.add(new ItemIcon(scene, 0, 0, { item: it }, { size: IS, tip: false, glow: false }));
  const name = lines(itemName(it), tw, ink, 7).slice(0, 2);
  c.add(mtext(scene, tx, 0, name.join('\n'), ink));
  let hy = name.length * LINE_H;
  const meta = `${t(`rarity.${normalizeRarity(it.rarity)}` as TKey)} · ${t(`slot.${def.slot}` as TKey)} · ${o.hero ? t('forge.worn', { name: o.hero.name }) : t('forge.stash')}`;
  hy += para(scene, c, tx, hy, meta, 'pSec', tw);
  y = Math.max(IS, hy) + 6;
  y += para(scene, c, 0, y, t('forge.pick'), 'pSec', w) + 3;
  // the random-stat lines: label left (wraps, never cut), value right
  itemAffixes(it).forEach((ln, i) => {
    const fresh = st.last?.line === i;
    const val = affixLineText(it, ln[0], ln[1]);
    const vw = Math.ceil(mw(val, 'pInk', 7));
    const tag = fresh ? t('forge.new') : '';
    const tagW = tag ? Math.ceil(mw(tag, 'pGood', TEXT_MIN)) + 6 : 0;
    const lw = w - 14 - vw - tagW - 10;
    const label = lines(tOr(`mod.${ln[0]}`, ln[0]), lw, 'rInk', 7);
    const was = fresh && st.last ? lines(t('forge.was', { line: forgeLineText(it, st.last.before) }), w - 20, 'pSec') : [];
    const rh = Math.max(TAP + 2, 6 + label.length * LINE_H + was.length * Math.ceil((LINE_H * TEXT_MIN) / 7) + 4);
    const r = scene.add.container(0, y);
    const rb = { owner: r, w, h: rh };
    addRowFace(scene, r, w, rh, i === st.sel);
    // the selection mark: a filled bronze dot when chosen, a ring when not
    const g = scene.add.graphics();
    const cy = 4 + Math.round((label.length * LINE_H) / 2);
    g.lineStyle(1, MOSAIC.bronzeLo, 1).strokeCircle(7, cy, 3.5);
    if (i === st.sel) g.fillStyle(MOSAIC.bronze, 1).fillCircle(7, cy, 2.2);
    r.add(g);
    r.add(mtext(scene, 14, 4, label.join('\n'), 'rInk', { box: rb }));
    r.add(mtext(scene, w - 4, cy - 4, val, fresh ? 'pGood' : 'pInk', { align: 1, box: rb }));
    if (tag) r.add(mtext(scene, w - 4 - vw - 6, cy - 3, tag, 'pGood', { size: TEXT_MIN, align: 1, box: rb }));
    if (was.length) r.add(mtext(scene, 14, 4 + label.length * LINE_H, was.join('\n'), 'pSec', { size: TEXT_MIN, box: rb }));
    makePressable(r, { w, h: rh, inset: 1, onTap: () => !area?.moved && onSel(i), tip: forgeLineText(it, ln) });
    c.add(r);
    y += rh + GAP;
  });
  const pow = itemPower(it);
  if (pow) y += para(scene, c, 0, y + 1, t('forge.powerStays', { name: tOr(`power.${pow.id}.name`, POWERS[pow.id].name) }), 'pMuted', w) + 4;
  // gold in hand, and why Reforge is grey when it is
  const cost = forgeCost(it);
  const gold = o.gold();
  if (gold < cost) y += para(scene, c, 0, y + 2, t('forge.poor', { n: goldText(cost), gold: goldText(gold) }), 'pBad', w) + 2;
  else y += para(scene, c, 0, y + 2, t('forge.gold', { n: goldText(gold) }), 'pSec', w) + 2;
  return y + 4;
}

/** One item at the Smith: pick a line, Reforge. */
export function openForgeItemSheet(scene: UiScene, o: ForgeItemOpts): { close: () => void } {
  const { VW, VH } = scene.m;
  const w = sheetW(VW);
  const iw = w - PAD * 2 - 4;
  const st: ItemState = { sel: forgeDefaultLine(o.item), last: null };
  const cost = forgeCost(o.item);
  const reason = () => (o.gold() < cost ? t('forge.poor', { n: goldText(cost), gold: goldText(o.gold()) }) : undefined);
  const actions: MButtonOpts[] = [
    { label: t('common.close'), variant: 'neutral', id: 'forge.itemClose', onClick: () => s.close() },
    {
      label: t('forge.act', { n: goldText(cost) }),
      icon: 'coin',
      variant: reason() ? 'disabled' : 'primary',
      disabledReason: reason(),
      id: 'forge.reforge',
      onClick: () => act(),
    },
  ];
  // the tallest the sheet can need: every line carrying its "was" note
  const probe = scene.add.container(0, 0);
  const contentH = fillItem(scene, probe, o, iw, { sel: st.sel, last: { line: 0, before: ['hp', 2], after: ['hp', 2], cost } }, () => undefined, null) + LINE_H * 2;
  probe.destroy();
  const h = Math.min(VH - 12, SHEET_TITLE_H + contentH + PAD * 2 + sheetActionsH(actions, w) + 6);
  const s = openParchmentSheet(scene, { title: t('forge.title'), w, h, id: 'forge.item', actions, onClose: () => o.onClose?.() });
  const btn = s.buttons.find((b) => b.opts.label === actions[1].label);
  let area: ScrollArea | null = null;
  let scrolled = 0;
  const draw = () => {
    area?.destroy();
    area = new ScrollArea(scene, s.c, s.body.x + 2, s.body.y, s.body.w - 2, s.body.h, scene.m.S);
    const a = area;
    a.setContentHeight(
      fillItem(scene, a.content, o, iw, st, (i) => {
        st.sel = i;
        draw();
      }, a),
    );
    addScrollHint(scene, s.c, a, MOSAIC.parch);
    // a redraw (a line picked, a reforge) keeps the place the player scrolled to
    a.setScroll(scrolled);
    a.onScroll((v) => (scrolled = v));
    const why = reason();
    btn?.setEnabled(!why, why);
  };
  const act = () => {
    const r = o.reforge(o.item, st.sel);
    if (typeof r === 'string') {
      draw();
      return;
    }
    st.last = r;
    draw();
  };
  draw();
  s.c.once('destroy', () => area?.destroy());
  return { close: s.close };
}
