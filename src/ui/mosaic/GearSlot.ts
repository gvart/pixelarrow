/**
 * GearSlot: an equipment slot as a carved stone socket (the item in its
 * rarity frame with a condition pip, or the slot's engraved icon), the mount
 * socket of a riding class and the layout of a row of slots.
 */
import Phaser from 'phaser';
import { addIcon, tappable } from '../kit';
import { uiId } from '../layout';
import { ItemIcon, showTooltip } from '../widgets';
import { SLOT_ICON } from '../sheet';
import type { Item, Slot } from '../../data/items';
import { t, tOr, type TKey } from '../../i18n';
import { heroClass } from '../../sim/stats';
import type { Hero } from '../../data/units';
import { ACCENT, MOSAIC } from '../tokens';
import { TAP } from './base';

export interface GearSlotOpts {
  slot: Slot | 'mount';
  item?: Item;
  size: number;
  onTap: () => void;
  selected?: boolean;
  /** Long-press / empty-slot text. */
  tip?: string;
  /** The icon of an empty slot (default the slot's). */
  icon?: string;
  area?: Phaser.GameObjects.Zone | null;
}

/** An equipment slot as a carved stone socket: the item in its rarity frame with a condition pip, or the slot's engraved icon. `w` / `h` serve the drop-target bounds. */
export class GearSlot extends Phaser.GameObjects.Container {
  readonly w: number;
  readonly h: number;

  constructor(scene: Phaser.Scene, x: number, y: number, o: GearSlotOpts) {
    super(scene, Math.round(x), Math.round(y));
    this.w = o.size;
    this.h = o.size;
    const s = o.size;
    const g = scene.add.graphics();
    g.fillStyle(0x0e0b08, 1);
    g.fillRoundedRect(-0.5, -0.5, s + 1, s + 1, 2.4);
    g.fillStyle(o.selected ? MOSAIC.goldHi : MOSAIC.bronze, 1);
    g.fillRoundedRect(0, 0, s, s, 2);
    g.fillStyle(MOSAIC.stone1, 1);
    g.fillRoundedRect(1.2, 1.2, s - 2.4, s - 2.4, 1.4);
    g.fillStyle(0x000000, 0.35);
    g.fillRect(1.2, 1.2, s - 2.4, 1.6);
    this.add(g);
    if (o.item) {
      const ic = new ItemIcon(scene, 2, 2, { item: o.item }, { size: s - 4, tip: false, glow: false });
      this.add(ic);
      const it = o.item;
      const pc = it.cond > 66 ? MOSAIC.inkGood : it.cond > 33 ? MOSAIC.segDone : ACCENT.dangerFill;
      const pw = s - 8;
      const pip = scene.add.graphics();
      pip.fillStyle(0x000000, 0.7);
      pip.fillRect(4, s - 5, pw, 2);
      pip.fillStyle(pc === MOSAIC.inkGood ? 0x7fd05a : pc, 1);
      pip.fillRect(4, s - 5, Math.max(1, Math.round((pw * Math.max(0, Math.min(100, it.cond))) / 100)), 2);
      this.add(pip);
    } else {
      const ic = addIcon(scene, Math.round((s - 12) / 2), Math.round((s - 12) / 2), o.icon ?? (o.slot === 'mount' ? 'advance' : SLOT_ICON[o.slot]), o.selected ? 'L' : 'D');
      this.add(ic);
    }
    this.setSize(s, s);
    this.setInteractive(new Phaser.Geom.Rectangle(s / 2, s / 2, s, s), Phaser.Geom.Rectangle.Contains);
    tappable(this, null, o.onTap, o.tip ?? (o.slot !== 'mount' ? t(`slot.${o.slot}` as TKey) : undefined));
    uiId(this, `slot:${o.slot}`);
    scene.add.existing(this);
  }
}

/** The mount of a riding class: a socket like a slot (not an item: the class rides it). */
export function mountSlot(scene: Phaser.Scene, x: number, y: number, hero: Hero, size: number): GearSlot | null {
  const cls = heroClass(hero);
  if (!cls.mount) return null;
  const name = tOr(`mount.${cls.mount}`, cls.mount);
  const g: GearSlot = new GearSlot(scene, x, y, { slot: 'mount', size, icon: cls.mount === 'chariot' ? 'f_wedge' : 'advance', tip: name, onTap: () => showTooltip(scene, `${name}\n${t('hero.mountTip')}`, g) });
  return g;
}

export interface SlotGrid {
  /** Edge of a slot. */
  ss: number;
  /** Top-left of slot `i` inside a box `inner` wide. */
  pos: (i: number) => { x: number; y: number };
  /** Height of the whole block. */
  h: number;
}

/** Lay `count` slots of at most `max` in rows inside `inner` px: one row when they stay 22 or wider (a touch target), else two or three rows. */
export function slotGrid(inner: number, count: number, max: number, gap = 2): SlotGrid {
  let rows = 1;
  let cols = count;
  let ss = 0;
  for (rows = 1; rows <= 3; rows++) {
    cols = Math.ceil(count / rows);
    ss = Math.min(max, Math.floor((inner - (cols - 1) * gap) / cols));
    if (ss >= TAP) break;
  }
  ss = Math.max(TAP, ss);
  const step = cols > 1 ? Math.min(ss + 8, Math.floor((inner - ss) / (cols - 1))) : 0;
  return {
    ss,
    h: rows * ss + (rows - 1) * 3,
    pos: (i) => {
      const r = Math.floor(i / cols);
      const k = Math.min(cols, count - r * cols);
      return { x: Math.round((inner - (ss + step * (k - 1))) / 2) + (i % cols) * step, y: r * (ss + 3) };
    },
  };
}
