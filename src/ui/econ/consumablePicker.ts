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
import { LINE_H, measureText } from '../textfit';
import { ScrollArea, addIcon, scaleIcon } from '../kit';
import { addScrollHint } from '../widgets';
import { MOSAIC } from '../tokens';
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
/** Room at the row's right for the pick mark (a ring, or a check in a bronze disc). */
const MARK = 14;
/** Height of `n` lines of text at `size`. */
const linesH = (n: number, size = 7) => Math.ceil((n * LINE_H * size) / 7);

/** The words of one row: its name, the held count and the effect wrapped to the row (never cut). */
function rowText(id: ConsumableId, qty: number, w: number): { name: string[]; qty: string; desc: string[]; h: number } {
  const d = CONSUMABLES[id];
  const q = `×${fmtCount(qty)}`;
  const tx = w - PAD * 2 - ICON - PAD - MARK;
  const name = wrapWords(tOr(`consumable.${id}.name`, d.name), tx, (s) => mw(s, 'rInk', 7));
  const desc = wrapWords(tOr(`consumable.${id}.desc`, d.desc), tx, (s) => mw(s, 'pSec', DESC));
  return { name, qty: q, desc, h: Math.max(30, 6 + linesH(name.length) + 1 + linesH(desc.length, DESC) + 5) };
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
  // the title keeps its whole words beside the X: on the narrowest canvas a shorter one
  const full = title ?? t('cons.title');
  const head = measureText(full, false, 6.5, 'roman') <= w - 52 ? full : t('gap.cons.titleShort');
  const m = openParchmentSheet(scene, { title: head, w, h, actions, id: 'cons.picker', onClose: () => !done && ((done = true), resolve(undefined)) });
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
  // the rows scroll when the canvas is too short for all of them (they never run under the actions)
  const room = m.body.y + m.body.h - y;
  const total = rows.reduce((a, r) => a + r.h + 4, 0) - 4;
  const area = total > room ? new ScrollArea(scene, c, x, y, inner, room, scene.m.S) : null;
  if (area) {
    area.setContentHeight(total);
    addScrollHint(scene, c, area, MOSAIC.parch);
    c.once('destroy', () => area.destroy());
  }
  const parts: Phaser.GameObjects.Container[] = [];
  const draw = () => {
    parts.forEach((r) => r.destroy());
    parts.length = 0;
    let ry = area ? 0 : y;
    held.forEach((id, i) => {
      const rt = rows[i];
      const on = sel === id;
      const r = scene.add.container(area ? 0 : x, ry);
      addRowFace(scene, r, inner, rt.h, on);
      // the held count sits under the icon, so the name has the row's whole width
      const iy = Math.round((rt.h - ICON - 9) / 2);
      r.add(addGoodsIcon(scene, PAD, iy, 'consumable', id, ICON));
      r.add(mtext(scene, PAD + ICON / 2, iy + ICON + 1, rt.qty, 'pInk', { size: 7, align: 0.5 }));
      const tx = PAD + ICON + PAD;
      r.add(mtext(scene, tx, 6, rt.name.join('\n'), 'rInk', { size: 7 }));
      r.add(mtext(scene, tx, 7 + linesH(rt.name.length), rt.desc.join('\n'), 'pSec', { size: DESC }));
      // the pick reads by shape, not colour alone (G13): a check in a bronze disc and an inked rim, else an empty ring
      const g = scene.add.graphics();
      const mx = inner - PAD - 5;
      if (on) {
        g.lineStyle(1.5, MOSAIC.parchEdge, 1).strokeRect(0.75, 0.75, inner - 1.5, rt.h - 1.5);
        g.fillStyle(MOSAIC.meanderLo, 1).fillCircle(mx, 11, 6);
      } else g.lineStyle(1, MOSAIC.parchEdge, 0.8).strokeCircle(mx, 11, 5.5);
      r.add(g);
      if (on) {
        const ck = scaleIcon(addIcon(scene, 0, 0, 'check', 'L'), 0.67);
        ck.setPosition(Math.round(mx - ck.displayWidth / 2), Math.round(11 - ck.displayHeight / 2));
        r.add(ck);
      }
      makePressable(r, {
        w: inner,
        h: rt.h,
        onTap: () => {
          if (area?.moved) return;
          hapticSelect();
          sel = sel === id ? null : id;
          use?.setEnabled(sel !== null, t('gap.cons.pickOne'));
          draw();
        },
      });
      uiId(r, `cons:${id}`);
      (area ? area.content : c).add(r);
      parts.push(r);
      ry += rt.h + 4;
    });
  };
  draw();
}
