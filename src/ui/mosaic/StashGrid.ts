/**
 * MStashGrid: the stash as an inventory grid on parchment (filter chips, the
 * items in their rarity frames with condition pips and upgrade arrows).
 */
import Phaser from 'phaser';
import type { ScrollArea, UIMetrics } from '../kit';
import { Grid, ItemIcon } from '../widgets';
import { SLOT_ICON, defaultStashState, type StashGridOpts } from '../sheet';
import { cycle, isUpgrade, queryStash, RARITY_FILTERS, SLOT_FILTERS, STASH_SORTS } from '../../game/gear';
import type { Item } from '../../data/items';
import { t, type TKey } from '../../i18n';
import type { Hero } from '../../data/units';
import { ACCENT, MOSAIC } from '../tokens';
import { GAP, TAP, mosaicImage, mtext } from './base';
import { MButton } from './controls';
import { MIconButton } from './iconButton';
import { addParchmentEmpty } from './EmptyState';

type C = Phaser.GameObjects.Container;
type UiScene = Phaser.Scene & { m: UIMetrics; ui: C };

const FILTER_H = TAP;

/**
 * The stash as an inventory grid on parchment: filter chips (slot, rarity, sort), then the items in
 * their rarity frames with condition pips and green upgrade arrows. Same options as the v3 `StashGrid`.
 */
export interface MStashGridOpts extends StashGridOpts {
  /** Lay every item out in the page instead of scrolling inside: the page's own scroll area (taps ignore its drags). */
  inline?: ScrollArea;
}

export class MStashGrid {
  readonly c: C;
  /** Height used from `y` (inline mode: the whole grid; else the box it was given). */
  height = 0;
  private grid: Grid | null = null;
  private list: Item[] = [];

  constructor(private scene: UiScene, parent: C, private x: number, private y: number, private w: number, private h: number, private o: MStashGridOpts) {
    this.c = scene.add.container(0, 0);
    parent.add(this.c);
    this.build();
  }

  get scroll(): number {
    return this.grid?.list.area.scrollY ?? 0;
  }

  rebuild(keepScroll = true): void {
    const s = keepScroll ? this.scroll : 0;
    this.build();
    this.grid?.list.area.setScroll(s);
  }

  destroy(): void {
    this.grid?.destroy();
    this.grid = null;
    this.c.destroy();
  }

  private buildInline(cy: number, area: ScrollArea): void {
    const scene = this.scene;
    const { x, w } = this;
    const cell = this.o.cell ?? 28;
    const hero = this.o.hero?.();
    const cols = Math.max(1, Math.floor((w - 3 + GAP) / (cell + GAP)));
    const pad = Math.floor((w - 3 - (cols * (cell + GAP) - GAP)) / 2);
    const rows = Math.max(1, Math.ceil(this.list.length / cols));
    const gh = Math.max(40, rows * (cell + GAP) - GAP + 8);
    this.c.add(mosaicImage(scene, x, cy, w, gh, 'parchmentWell'));
    if (!this.list.length) this.c.add(addParchmentEmpty(scene, x + 2, cy + 2, w - 4, gh - 4, { icon: 'shield', title: t('stash.noMatch'), hint: t('stash.noMatchHint') }));
    this.list.forEach((it, i) => {
      const cc = scene.add.container(x + 3 + pad + (i % cols) * (cell + GAP), cy + 4 + Math.floor(i / cols) * (cell + GAP));
      this.c.add(cc);
      stashCell(scene, this.o, it, cc, cell, area, hero);
    });
    this.height = cy + gh - this.y;
  }

  private set(s: Partial<ReturnType<typeof defaultStashState>>): void {
    Object.assign(this.o.state, s);
    this.o.onState?.(this.o.state);
    this.rebuild(false);
  }

  private build(): void {
    const scene = this.scene;
    this.grid?.destroy();
    this.grid = null;
    this.c.removeAll(true);
    const { x, y, w, h } = this;
    const st = this.o.state;
    let cy = y;
    const chipW = Math.floor((w - 5 * GAP) / 6);
    const twoRows = h >= 140 && chipW >= TAP;
    if (twoRows) {
      SLOT_FILTERS.forEach((f, i) => {
        const bw = i === 5 ? w - 5 * (chipW + GAP) : chipW;
        this.c.add(new MIconButton(scene, x + i * (chipW + GAP), cy, bw, FILTER_H, { icon: f === 'all' ? 'people' : SLOT_ICON[f], variant: st.slot === f ? 'secondary' : 'neutral', label: f === 'all' ? t('stash.all') : t(`slot.${f}` as TKey), id: `filter:${f}`, onClick: () => this.set({ slot: f }) }));
      });
      cy += FILTER_H + GAP;
    }
    const n = twoRows ? 2 : 3;
    const bw = Math.floor((w - (n - 1) * GAP) / n);
    let bx = x;
    if (!twoRows) {
      this.c.add(
        new MButton(scene, bx, cy, bw, FILTER_H, {
          label: st.slot === 'all' ? t('stash.all') : t(`slot.${st.slot}` as TKey),
          icon: st.slot === 'all' ? undefined : SLOT_ICON[st.slot],
          variant: st.slot === 'all' ? 'neutral' : 'secondary',
          id: 'filter:slot',
          tip: t('stash.slotTip'),
          onClick: () => this.set({ slot: cycle(SLOT_FILTERS, st.slot) }),
        }),
      );
      bx += bw + GAP;
    }
    this.c.add(
      new MButton(scene, bx, cy, bw, FILTER_H, {
        label: st.rarity === 'all' ? t('stash.anyRarity') : t(`rarity.${st.rarity}` as TKey),
        variant: st.rarity === 'all' ? 'neutral' : 'secondary',
        id: 'filter:rarity',
        tip: t('stash.rarityTip'),
        onClick: () => this.set({ rarity: cycle(RARITY_FILTERS, st.rarity) }),
      }),
    );
    bx += bw + GAP;
    this.c.add(new MButton(scene, bx, cy, x + w - bx, FILTER_H, { label: t(`stash.sort.${st.sort}` as TKey), icon: 'scales', variant: 'neutral', id: 'filter:sort', tip: t('stash.sortTip'), onClick: () => this.set({ sort: cycle(STASH_SORTS, st.sort) }) }));
    cy += FILTER_H + GAP + 1;
    const inline = this.o.inline;
    const gh = inline ? 0 : y + h - cy;
    const all = this.o.items();
    this.list = queryStash(all, st);
    if (inline) {
      this.buildInline(cy, inline);
      return;
    }
    this.height = h;
    this.c.add(mosaicImage(scene, x, cy, w, gh, 'parchmentWell'));
    if (!this.list.length) {
      const filtered = all.length > 0;
      this.c.add(
        addParchmentEmpty(scene, x + 2, cy + 2, w - 4, gh - 4, {
          icon: 'shield',
          title: filtered ? t('stash.noMatch') : this.o.empty?.title ?? t('stash.emptyTitle'),
          hint: filtered ? t('stash.noMatchHint') : this.o.empty?.hint ?? t('stash.emptyHint'),
          action: filtered ? { label: t('stash.clearFilters'), onClick: () => this.set({ slot: 'all', rarity: 'all' }) } : undefined,
        }),
      );
      return;
    }
    const cell = this.o.cell ?? 28;
    const hero = this.o.hero?.();
    this.grid = new Grid(scene, this.c, x + 3, cy + 3, w - 4, gh - 6, {
      count: this.list.length,
      cell,
      render: (i, cc, size, area) => stashCell(scene, this.o, this.list[i], cc, size, area, hero),
    });
  }
}

/** One stash cell: the item in its rarity frame, a condition pip, an optional price tag and the upgrade arrow. */
function stashCell(scene: UiScene, o: MStashGridOpts, it: Item, cc: C, size: number, area: ScrollArea | null, hero: Hero | undefined): void {
  const sel = o.selected?.() === it.uid;
  const ic = new ItemIcon(scene, 0, 0, { item: it }, { size, area, selected: sel, tip: false, onTap: () => o.drag?.dragging || o.onTap(it) });
  cc.add(ic);
  cc.add(condPip(scene, 3, size - 4, size - 6, it.cond));
  const pr = o.price?.(it);
  if (pr) {
    const pt = mtext(scene, size - 2, 1, pr.text, 'light', { size: 5.5, align: 1 });
    const bg = scene.add.rectangle(size - 3 - pt.width, 1, pt.width + 2, 7, 0x000000, 0.65).setOrigin(0, 0);
    cc.add([bg, pt]);
  }
  if (hero && isUpgrade(hero, it)) {
    const g = scene.add.graphics();
    g.fillStyle(0x1d140f, 1);
    g.fillTriangle(size - 9, 7, size - 5, 2, size - 1, 7);
    g.fillStyle(0x7fd05a, 1);
    g.fillTriangle(size - 8, 6, size - 5, 3, size - 2, 6);
    g.fillRect(size - 6, 6, 2, 3);
    cc.add(g);
  }
  o.drag?.attach(ic, it, area);
}

/** A thin condition bar (green, then amber, then red). */
function condPip(scene: Phaser.Scene, x: number, y: number, w: number, cond: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.7);
  g.fillRect(x, y, w, 2);
  g.fillStyle(cond > 66 ? 0x7fd05a : cond > 33 ? MOSAIC.segDone : ACCENT.dangerFill, 1);
  g.fillRect(x, y, Math.max(1, Math.round((w * Math.max(0, Math.min(100, cond))) / 100)), 2);
  return g;
}
