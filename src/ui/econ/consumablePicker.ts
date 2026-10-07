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
 * undefined when closed with Back. With nothing held it resolves null at once
 * when `skipIfEmpty` is set, else shows a short explanation.
 */
import Phaser from 'phaser';
import { Button, addPanel, addText } from '../kit';
import { ItemIcon, openModal, type UiScene } from '../widgets';
import { uiId } from '../layout';
import { ellipsize, wrapText, LINE_H } from '../textfit';
import { SIZE } from '../theme';
import { BATTLE_CONSUMABLES, CONSUMABLES, type ConsumableId } from '../../data/consumables';
import { econ } from './source';
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

function openPicker(scene: UiScene, held: ConsumableId[], inv: Partial<Record<string, number>>, title: string | undefined, resolve: (v: ConsumableId | null | undefined) => void): void {
  const { VW, VH } = scene.m;
  const w = Math.min(VW - 12, 210);
  const inner = w - 16;
  const hint = wrapText(t('cons.hint'), inner - 4, 2);
  const rowH = 40;
  const listH = held.length ? held.length * (rowH + SIZE.gap) : 44;
  let done = false;
  const finish = (v: ConsumableId | null | undefined) => {
    if (done) return;
    done = true;
    m.close();
    resolve(v);
  };
  const m = openModal(scene, { title: title ?? t('cons.title'), w, h: Math.min(VH - 12, 26 + hint.lines.length * LINE_H + 6 + listH + SIZE.btnH + 16), onClose: () => !done && ((done = true), resolve(undefined)) });
  const { c, x } = m;
  let y = m.y + 24;
  c.add(addText(scene, x + 8, y, hint.lines.join('\n'), 'dim'));
  y += hint.lines.length * LINE_H + 6;
  let sel: ConsumableId | null = held[0] ?? null;
  const rows: Phaser.GameObjects.Container[] = [];
  const draw = () => {
    rows.forEach((r) => r.destroy());
    rows.length = 0;
    if (!held.length) {
      const r = scene.add.container(0, 0);
      const e = wrapText(t('cons.emptyHint'), inner - 4, 2);
      r.add(addText(scene, x + 8 + inner / 2, y, ellipsize(t('cons.empty'), inner), 'red', 0.5));
      r.add(addText(scene, x + 8 + inner / 2, y + 12, e.lines.join('\n'), 'dim', 0.5).setCenterAlign());
      c.add(r);
      rows.push(r);
      return;
    }
    held.forEach((id, i) => {
      const d = CONSUMABLES[id];
      const ry = y + i * (rowH + SIZE.gap);
      const on = sel === id;
      const r = scene.add.container(0, 0);
      r.add(addPanel(scene, x + 8, ry, inner, rowH, on ? 'buttonSel' : 'button'));
      r.add(new ItemIcon(scene, x + 12, ry + 8, { consumable: id }, { size: 24, tip: false, qty: inv[id], rarity: 'rare' }));
      const desc = wrapText(tOr(`consumable.${id}.desc`, d.desc), inner - 44, 2);
      r.add(addText(scene, x + 42, ry + 4, ellipsize(tOr(`consumable.${id}.name`, d.name), inner - 40), on ? 'light' : 'red'));
      r.add(addText(scene, x + 42, ry + 15, desc.lines.join('\n'), on ? 'light' : 'dim'));
      const z = scene.add.zone(x + 8, ry, inner, rowH).setOrigin(0, 0).setInteractive();
      uiId(z, `cons:${id}`);
      z.on('pointerup', () => {
        hapticSelect();
        sel = sel === id ? null : id;
        draw();
      });
      r.add(z);
      c.add(r);
      rows.push(r);
    });
  };
  draw();
  const by = m.y + m.h - 8 - SIZE.btnH;
  const bw = Math.floor((inner - SIZE.gap) / 2);
  c.add(new Button(scene, x + 8, by, bw, SIZE.btnH, { label: held.length ? t('cons.none') : t('cons.go'), id: 'cons.none', onClick: () => finish(null) }));
  const use = new Button(scene, x + 8 + bw + SIZE.gap, by, inner - bw - SIZE.gap, SIZE.btnH, { label: t('cons.use'), icon: 'check', variant: 'primary', id: 'cons.use', onClick: () => finish(sel) });
  if (!held.length) use.setEnabled(false, t('cons.emptyHint'));
  c.add(use);
}
