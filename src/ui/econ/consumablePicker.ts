/**
 * Consumable picker for PvP attacks and duels (docs/DESIGN_V2.md: at most one
 * consumable per battle). Self-contained: other screens call it before
 * `onlineApi.attackStart(hex, id)` or a duel challenge and pass the answer on.
 *
 *   const pick = await pickBattleConsumable(scene);    // scene: a BaseScene (ui + m)
 *   if (pick === undefined) return;                    // closed: do not start the battle
 *   await onlineApi.attackStart(hex, pick ?? undefined); // null: fight without one
 *
 * It fetches the inventory itself (GET /api/online/consumables) unless one is
 * passed, lists the held battle consumables (morale wine, war horn, sharpening
 * stone) with their effect, and resolves the chosen id, null for "none", or
 * undefined when closed with the X or Back (the battle is not started). With
 * nothing held it resolves null at once when `skipIfEmpty` is set, else says
 * where to buy them and offers "Fight without".
 *
 * A kit sheet (DLG-02): parchment rows with the goods icon, the name, the held
 * count (grouped by `fmtCount`) and the whole effect (wrapped, never cut).
 */
import Phaser from 'phaser';
import type { UiScene } from '../widgets';
import { uiId } from '../layout';
import { LINE_H } from '../textfit';
import { addRowFace, mtext, mw, openParchmentSheet, sheetActionsH, SHEET_TITLE_H, wrapWords, type MButtonOpts } from '../mosaic';
import { makePressable } from '../mosaic/base';
import { addGoodsIcon } from './textures';
import { BATTLE_CONSUMABLES, CONSUMABLES, type ConsumableId } from '../../data/consumables';
import { econ } from './source';
import { fmtCount } from '../../scenes/duel/hubLayout';
import { hapticSelect } from '../../platform/telegram';
import { t, tOr } from '../../i18n';

export interface PickOpts {
  /** Held consumables (id -> qty); fetched when left out. */
  inventory?: Partial<Record<string, number>>;
  /** Resolve null without a dialog when nothing is held (default false). */
  skipIfEmpty?: boolean;
  title?: string;
}

/** Ask which battle consumable to take (one per battle). See the module comment. */
export async function pickBattleConsumable(scene: UiScene, o: PickOpts = {}): Promise<ConsumableId | null | undefined> {
  let inv = o.inventory;
  if (!inv) {
    try {
      inv = (await econ().consumables()).inventory;
    } catch {
      inv = {};
    }
  }
  if (!scene.sys.isActive()) return undefined;
  const held = BATTLE_CONSUMABLES.filter((id) => (inv?.[id] ?? 0) > 0);
  if (!held.length && o.skipIfEmpty) return null;
  return new Promise((resolve) => openPicker(scene, held, inv ?? {}, o.title, resolve));
}

const PAD = 8;
const ICON = 18;
const DESC = 6.5;
/** Height of `n` lines of text at `size`. */
const linesH = (n: number, size = 7) => Math.ceil((n * LINE_H * size) / 7);

/** The words of one row: its name, the held count and the effect wrapped to the row (never cut). */
function rowText(id: ConsumableId, qty: number, w: number): { name: string; qty: string; desc: string[]; h: number } {
  const d = CONSUMABLES[id];
  const q = `×${fmtCount(qty)}`;
  const tx = w - PAD * 2 - ICON - PAD;
  const desc = wrapWords(tOr(`consumable.${id}.desc`, d.desc), tx, (s) => mw(s, 'pSec', DESC));
  return { name: tOr(`consumable.${id}.name`, d.name), qty: q, desc, h: Math.max(30, 6 + 11 + linesH(desc.length, DESC) + 5) };
}

function openPicker(scene: UiScene, held: ConsumableId[], inv: Partial<Record<string, number>>, title: string | undefined, resolve: (v: ConsumableId | null | undefined) => void): void {
  const { VW, VH } = scene.m;
  const w = Math.min(VW - 16, 240);
  const inner = w - PAD * 2;
  const hint = wrapWords(t('cons.hint'), inner, (s) => mw(s, 'pSec', 7));
  const rows = held.map((id) => rowText(id, inv[id] ?? 0, inner));
  const empty = !held.length ? wrapWords(t('gap.cons.emptyHint'), inner, (s) => mw(s, 'pSec', 7)) : [];
  const listH = held.length ? rows.reduce((a, r) => a + r.h + 4, 0) : 12 + linesH(empty.length) + 4;
  let done = false;
  let sel: ConsumableId | null = held[0] ?? null;
  const finish = (v: ConsumableId | null | undefined) => {
    if (done) return;
    done = true;
    m.close();
    resolve(v);
  };
  // the way out is the X (or Back): no battle. "None" fights without one; "Take it" fights with the pick.
  const actions: MButtonOpts[] = held.length
    ? [
        { label: t('cons.none'), variant: 'secondary', id: 'cons.none', onClick: () => finish(null) },
        { label: t('cons.use'), icon: 'check', variant: 'primary', id: 'cons.use', disabledReason: t('gap.cons.pickOne'), onClick: () => sel && finish(sel) },
      ]
    : [{ label: t('cons.go'), icon: 'swords', variant: 'primary', id: 'cons.none', onClick: () => finish(null) }];
  const h = Math.min(VH - 12, SHEET_TITLE_H + linesH(hint.length) + 6 + listH + sheetActionsH(actions, w) + 4);
  const m = openParchmentSheet(scene, { title: title ?? t('cons.title'), w, h, actions, id: 'cons.picker', onClose: () => !done && ((done = true), resolve(undefined)) });
  const { c } = m;
  const x = m.body.x;
  let y = m.body.y;
  c.add(mtext(scene, x, y, hint.join('\n'), 'pSec', { size: 7 }));
  y += linesH(hint.length) + 6;
  const use = m.buttons.find((b) => b.opts?.label === t('cons.use'));
  if (!held.length) {
    c.add(mtext(scene, x + inner / 2, y, t('cons.empty'), 'rInk', { size: 7, align: 0.5, maxW: inner }));
    c.add(mtext(scene, x + inner / 2, y + 12, empty.join('\n'), 'pSec', { size: 7, align: 0.5 }).setCenterAlign());
    return;
  }
  const parts: Phaser.GameObjects.Container[] = [];
  const draw = () => {
    parts.forEach((r) => r.destroy());
    parts.length = 0;
    let ry = y;
    held.forEach((id, i) => {
      const rt = rows[i];
      const on = sel === id;
      const r = scene.add.container(x, ry);
      addRowFace(scene, r, inner, rt.h, on);
      r.add(addGoodsIcon(scene, PAD, Math.round((rt.h - ICON) / 2), 'consumable', id, ICON));
      const tx = PAD + ICON + PAD;
      const qw = mw(rt.qty, 'pInk');
      r.add(mtext(scene, tx, 6, rt.name, 'rInk', { size: 7, maxW: inner - tx - qw - PAD * 2 }));
      r.add(mtext(scene, inner - PAD, 6, rt.qty, 'pInk', { size: 7, align: 1 }));
      r.add(mtext(scene, tx, 17, rt.desc.join('\n'), 'pSec', { size: DESC }));
      makePressable(r, {
        w: inner,
        h: rt.h,
        onTap: () => {
          hapticSelect();
          sel = sel === id ? null : id;
          use?.setEnabled(sel !== null, t('gap.cons.pickOne'));
          draw();
        },
      });
      uiId(r, `cons:${id}`);
      c.add(r);
      parts.push(r);
      ry += rt.h + 4;
    });
  };
  draw();
}
