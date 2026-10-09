/**
 * Shared pieces of the army, hero, stash, settlement and online army screens
 * (built on the UI kit, docs/UI_KIT.md): the portrait stage with the animated
 * figure, rank stars, group badges, chips, equipment slot tiles, the item
 * card / compare popup, the stash grid with filters and sorting, and drag and
 * drop from the stash onto equipment slots.
 */
import Phaser from 'phaser';
import { scaleIcon, Button, Meter, ScrollArea, addIcon, addPanel, addText, tappable, type FontKey } from './kit';
import { Badge, ItemIcon, Grid, addEmptyState, openModal, showTooltip, subjectName, type Modal, type UiScene } from './widgets';
import { uiFrame, uiId } from './layout';
import { ellipsize, measureText, wrapText, LINE_H } from './textfit';
import { SIZE, COLOR, RARITY_COLOR } from './theme';
import { ensureFonts, rarityFont, FONT_GOOD_LIGHT, FONT_RED_LIGHT } from './fonts';
import { dollFrame, dollFxKey, dollFxOf, dollGeomOf, dollOrigin, ensureDoll, ensureItemIcon, fitItemIcon } from './sprites';
import { cosmeticLoadout } from '../game/cosmetics';
import { renderStage, renderGroupBadge, GROUP_COLOR, ROLE_COLOR } from '../art/sheetArt';
import { ANIM, attackLength, dollFromHero, dollGeom, weaponClass } from '../art/paperdoll';
import { itemDef, itemValue, normalizeRarity, SLOTS, type Item, type Slot } from '../data/items';
import type { Hero } from '../data/units';
import { computeStats, heroClass } from '../sim/stats';
import {
  compareItem, cycle, fmtStat, isUpgrade, itemModLines, queryStash, RARITY_FILTERS, SLOT_FILTERS, STASH_SORTS, STATS, shoots,
  type RarityFilter, type SlotFilter, type StashSort, type StatDelta, type StatId,
} from '../game/gear';
import { t, tOr, type TKey } from '../i18n';
import { ROLE } from './tokens';

export const SLOT_ICON: Record<Slot, string> = { weapon: 'spear', shield: 'shield', helmet: 'helmet', armor: 'armor', trinket: 'ring' };
export const ROMAN = ['I', 'II', 'III', 'IV'];

// ------------------------------------------------------------------ names (translated data)

export const className = (h: Hero): string => {
  const c = heroClass(h);
  return tOr(`class.${c.id}.name`, c.name);
};
export const roleName = (role: string): string => tOr(`role.${role}`, role);
export const itemName = (it: Item): string => subjectName({ item: it });
export const groupName = (g: number): string => tOr(`group.${g}`, ROMAN[g] ?? '');

// ------------------------------------------------------------------ textures

function tex(scene: Phaser.Scene, key: string, make: () => { toCanvas(): HTMLCanvasElement }): string {
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, make().toCanvas());
  return key;
}

export function stageTexture(scene: Phaser.Scene, w: number, h: number, accent: number): string {
  return tex(scene, `stage_${w}x${h}_${accent.toString(16)}`, () => renderStage(w, h, accent));
}

/** Rank stars (filled up to n of max) as a row of 7 px icons, 8 px apart. Returns the width. */
/**
 * A hero's rank as bronze pips (diamonds): the gold star belongs to ladder
 * floor ratings only (docs/UI_V3.md "One icon, one meaning"). Returns the width.
 */
export function addStars(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, n: number, max = 5): number {
  const g = scene.add.graphics();
  for (let i = 0; i < max; i++) {
    const cx = Math.round(x + i * 8) + 3.5;
    const cy = Math.round(y) + 3.5;
    const pts = [{ x: cx, y: cy - 3.5 }, { x: cx + 3, y: cy }, { x: cx, y: cy + 3.5 }, { x: cx - 3, y: cy }];
    g.fillStyle(0x000000, 0.5);
    g.fillPoints(pts.map((p) => ({ x: p.x + 0.5, y: p.y + 0.6 })), true);
    g.fillStyle(i < n ? 0xd2a564 : 0x3a2f25, 1);
    g.fillPoints(pts, true);
    if (i < n) {
      g.fillStyle(0xf8e4b8, 0.8);
      g.fillPoints([{ x: cx, y: cy - 3.5 }, { x: cx + 1.2, y: cy - 1.4 }, { x: cx - 1.2, y: cy - 1.4 }], true);
    }
  }
  parent.add(g);
  return max * 8 - 1;
}

/** A round group badge with its roman numeral (12 x 12, numeral beside it when `label`). */
export function addGroupBadge(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, group: number): void {
  parent.add(scene.add.image(Math.round(x), Math.round(y), tex(scene, `gbadge_${group}`, () => renderGroupBadge(group))).setOrigin(0, 0));
  const n = ROMAN[group] ?? '?';
  parent.add(addText(scene, Math.round(x + 6), Math.round(y + 2), n, 'light', 0.5));
}

/** A coloured pill with light text (role, status). Returns its width. */
export function addChip(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, text: string, color: number, maxW = 200, alignRight = false): number {
  const s = ellipsize(text, maxW - 6, true);
  const w = measureText(s, true) + 6;
  if (alignRight) x -= w;
  const g = scene.add.graphics();
  g.fillStyle(0x1d140f, 1);
  g.fillRoundedRect(Math.round(x), Math.round(y), w, 12, 3);
  g.fillStyle(color, 1);
  g.fillRoundedRect(Math.round(x) + 1, Math.round(y) + 1, w - 2, 10, 3);
  parent.add(g);
  const txt = addText(scene, Math.round(x + 3), Math.round(y + 2), s, 'light');
  uiFrame(txt, g as unknown as Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, w, 12, Math.round(x), Math.round(y));
  parent.add(txt);
  return w;
}

/** A unit role's pill colour: the role palette of src/ui/tokens.ts (never the danger red). */
export const roleColor = (role: string): number => (ROLE as Record<string, number>)[role] ?? ROLE_COLOR[role] ?? 0x6b5d4c;

// ------------------------------------------------------------------ portrait stage

export interface StageOpts {
  /** Facing row (default 0: three-quarter view, weapon side). */
  dir?: number;
  /** Doll scale (1 or 2). */
  scale?: number;
  accent?: number;
}

/**
 * The figure on a lit stage, w x h, wearing the hero's actual gear. Idles and
 * now and then swings his weapon. Returns a container (the caller adds it).
 */
export class Stage extends Phaser.GameObjects.Container {
  private sprite: Phaser.GameObjects.Sprite;
  private timer: Phaser.Time.TimerEvent;
  private busy = false;

  constructor(scene: Phaser.Scene, x: number, y: number, readonly w: number, readonly h: number, hero: Hero, o: StageOpts = {}) {
    super(scene, Math.round(x), Math.round(y));
    const cls = heroClass(hero);
    const accent = o.accent ?? roleColor(cls.role);
    this.add(scene.add.image(0, 0, stageTexture(scene, w, h, accent)).setOrigin(0, 0));
    const dir = o.dir ?? 0;
    const spec0 = dollFromHero(hero, cosmeticLoadout());
    const g0 = dollGeom(spec0);
    // pick the largest integer scale that fits (riders are big), and render the figure at that
    // resolution rather than blowing a 1x sheet up: the stage shows twice the detail
    const fit = Math.max(1, Math.min(o.scale ?? 2, Math.floor((h - 6) / (g0.footY + 2)), Math.floor((w - 4) / Math.min(g0.fw, 64))));
    const spec = fit > 1 ? { ...spec0, res: fit } : spec0;
    const key = ensureDoll(scene, spec, [dir]);
    const g = dollGeomOf(key);
    const footY = h - Math.max(4, Math.round(h * 0.12));
    const sh = scene.add.image(w / 2, footY, g0.fw > 48 ? 'shadow_big' : 'shadow').setAlpha(0.45).setScale(fit * (g0.fw > 48 ? 1 : 1.2), fit);
    this.add(sh);
    this.sprite = scene.add.sprite(Math.round(w / 2), footY, key, dollFrame(dir, 0)).setOrigin(...dollOrigin(key));
    this.add(this.sprite);
    // keep the figure inside the stage (riders' lances, tall crests); the crop is in rendered pixels
    const vis = { x: Math.round(w / 2 - g.fw / 2), y: Math.round(footY - g.footY) };
    const cropX = Math.max(0, Math.ceil(2 - vis.x));
    const cropY = Math.max(0, Math.ceil(2 - vis.y));
    this.sprite.setCrop(cropX, cropY, g.fw - cropX * 2, g.fh - cropY);
    // rarity effects: the epic / legendary outline pulse, the glint sweep, legendary motes
    const fxKey = dollFxKey(key);
    const fx = dollFxOf(key);
    const crop = (o: Phaser.GameObjects.Sprite) => o.setCrop(cropX, cropY, g.fw - cropX * 2, g.fh - cropY);
    const ring = fxKey && fx?.outline != null ? crop(scene.add.sprite(this.sprite.x, footY, fxKey, `r${dollFrame(dir, 0)}`).setOrigin(...dollOrigin(key)).setTint(fx.outline)) : null;
    const glint = fxKey && fx?.glint ? scene.add.sprite(this.sprite.x, footY, fxKey, `g${dollFrame(dir, 0)}`).setOrigin(...dollOrigin(key)).setTint(0xfff6d8).setVisible(false) : null;
    if (ring) {
      this.addAt(ring, this.getIndex(this.sprite));
      scene.tweens.add({ targets: ring, alpha: { from: 0.3, to: 0.85 }, duration: (fx?.rank ?? 0) >= 4 ? 700 : 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    if (glint) this.add(glint);
    let cur = 0;
    const show = (fr: number) => {
      cur = fr;
      this.sprite.setFrame(dollFrame(dir, fr));
      ring?.setFrame(`r${dollFrame(dir, fr)}`);
      if (ring) crop(ring);
    };
    let f = 0;
    this.timer = scene.time.addEvent({
      delay: 300,
      loop: true,
      callback: () => {
        if (!this.scene || this.busy) return;
        f = (f + 1) % ANIM.idle.length;
        show(ANIM.idle[f]);
      },
    });
    // a swing every few seconds, with the weapon's own timing
    const wc = weaponClass(spec.weapon);
    const swing = () => {
      if (!this.scene) return;
      this.busy = true;
      let t = 0;
      for (const fr of [...ANIM.attack, ANIM.idle[0]]) {
        const at = t;
        scene.time.delayedCall(at * 1000 * 1.5, () => this.scene && show(fr));
        t += fr === ANIM.idle[0] ? 0 : Math.max(0.06, attackLength(wc) / ANIM.attack.length);
      }
      scene.time.delayedCall(t * 1500 + 60, () => (this.busy = false));
    };
    const loop = scene.time.addEvent({ delay: 3600, loop: true, callback: swing });
    // the glint sweeps across the metal every couple of seconds; legendary gear sheds motes
    let gt = 0;
    const fxTimer = glint || fx?.particles
      ? scene.time.addEvent({
          delay: 50,
          loop: true,
          callback: () => {
            if (!this.scene) return;
            gt += 0.05;
            if (glint) {
              const period = (fx?.rank ?? 0) >= 4 ? 1.8 : 2.6;
              const ph = (gt % period) / 0.45;
              if (ph < 1) {
                const bx = Math.floor(g.fw * 0.2 + ph * g.fw * 0.6);
                glint.setFrame(`g${dollFrame(dir, cur)}`).setCrop(bx, cropY, 2, g.fh - cropY).setVisible(true).setAlpha(0.9);
              } else glint.setVisible(false);
            }
            if (fx?.particles && Math.random() < 0.18) {
              const cols = fx.particles === 'embers' ? [0xffb040, 0xffe080] : fx.particles === 'sparkle' ? [0xd0f0ff, 0xffffff] : [0xfff6c8, 0xffe8a0];
              const px = scene.add.rectangle(Math.round(w / 2 + (Math.random() - 0.5) * 14 * fit), Math.round(footY - Math.random() * g0.footY * 0.7 * fit), fit, fit, cols[Math.floor(Math.random() * cols.length)]).setOrigin(0, 0);
              this.add(px);
              scene.tweens.add({ targets: px, y: px.y - 10 * fit, alpha: 0, duration: 1000 + Math.random() * 500, onComplete: () => px.destroy() });
            }
          },
        })
      : null;
    this.once('destroy', () => {
      this.timer.remove();
      loop.remove();
      fxTimer?.remove();
    });
    scene.add.existing(this);
  }
}

// ------------------------------------------------------------------ equipment slot tiles

export interface SlotTileOpts {
  size?: number;
  selected?: boolean;
  onTap: () => void;
  area?: ScrollArea | null;
}

/** An equipment slot: the item in its rarity frame (with a condition pip), or an empty slot with the slot icon. */
export function addSlotTile(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, slot: Slot, it: Item | undefined, o: SlotTileOpts): Phaser.GameObjects.GameObject {
  const size = o.size ?? SIZE.cell;
  if (it) {
    const ic = new ItemIcon(scene, x, y, { item: it }, { size, onTap: o.onTap, area: o.area, selected: o.selected });
    uiId(ic, `slot:${slot}`);
    parent.add(ic);
    // condition pip along the bottom edge
    const cm = new Meter(scene, x + 3, y + size - 4, size - 6, 2, it.cond > 66 ? COLOR.good : it.cond > 33 ? COLOR.xp : COLOR.bad).setValue(it.cond, 100);
    parent.add(cm);
    return ic;
  }
  const bg = addPanel(scene, x, y, size, size, o.selected ? 'slotSel' : 'slot');
  bg.setInteractive();
  uiId(bg, `slot:${slot}`);
  tappable(bg, o.area ?? null, o.onTap, t(`slot.${slot}` as TKey));
  parent.add(bg);
  parent.add(addIcon(scene, x + Math.round((size - 12) / 2), y + Math.round((size - 12) / 2), SLOT_ICON[slot], o.selected ? 'L' : 'D'));
  return bg;
}

/** The mount of a riding class: a framed tile (not an item: the class rides it). */
export function addMountTile(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, hero: Hero, size: number = SIZE.cell): void {
  const cls = heroClass(hero);
  if (!cls.mount) return;
  const bg = addPanel(scene, x, y, size, size, 'slot');
  bg.setInteractive();
  uiId(bg, 'slot:mount');
  const name = tOr(`mount.${cls.mount}`, cls.mount);
  tappable(bg, null, () => showTooltip(scene, `${name}\n${t('hero.mountTip')}`, bg), name);
  parent.add(bg);
  parent.add(addIcon(scene, x + Math.round((size - 12) / 2), y + Math.round((size - 12) / 2), cls.mount === 'chariot' ? 'f_wedge' : 'advance', 'D'));
}

// ------------------------------------------------------------------ drag and drop

export interface DropTarget {
  rect: () => { x: number; y: number; w: number; h: number };
  accepts: (it: Item) => boolean;
  drop: (it: Item) => void;
}

/**
 * Drag an item from the stash onto an equipment slot: a long press on a stash
 * cell lifts a ghost icon; valid slots light up; release over one to equip.
 */
export class DragDrop {
  private ghost: Phaser.GameObjects.Image | null = null;
  private item: Item | null = null;
  private marks: Phaser.GameObjects.Graphics | null = null;
  targets: DropTarget[] = [];

  constructor(private scene: UiScene) {
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => this.ghost?.setPosition(p.x / scene.m.S, p.y / scene.m.S - 6));
    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => this.end(p));
  }

  get dragging(): boolean {
    return !!this.ghost;
  }

  /** Make `icon` draggable (long press). `area`: the scroll area it sits in. */
  attach(icon: Phaser.GameObjects.GameObject, it: Item, area: ScrollArea | null): void {
    let timer: Phaser.Time.TimerEvent | null = null;
    icon.on('pointerdown', (p: Phaser.Input.Pointer) => {
      timer?.remove();
      timer = this.scene.time.delayedCall(300, () => {
        timer = null;
        if (!p.isDown || (area && area.moved)) return;
        area?.cancelDrag();
        this.start(it, p);
      });
    });
    icon.on('pointerup', () => timer?.remove());
    icon.on('pointerout', () => timer?.remove());
    icon.once('destroy', () => timer?.remove());
  }

  start(it: Item, p: Phaser.Input.Pointer): void {
    this.cancel();
    const { S } = this.scene.m;
    this.item = it;
    this.ghost = fitItemIcon(this.scene.add.image(p.x / S, p.y / S - 6, ensureItemIcon(this.scene, it, 32)), 32).setAlpha(0.92).setDepth(10);
    this.scene.ui.add(this.ghost);
    this.marks = this.scene.add.graphics();
    this.scene.ui.add(this.marks);
    for (const tg of this.targets) {
      if (!tg.accepts(it)) continue;
      const r = tg.rect();
      this.marks.lineStyle(2, 0xffe080, 1);
      this.marks.strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
    }
    this.scene.tweens.add({ targets: this.marks, alpha: { from: 1, to: 0.35 }, duration: 380, yoyo: true, repeat: -1 });
    this.scene.ui.bringToTop(this.ghost);
  }

  private end(p: Phaser.Input.Pointer): void {
    if (!this.ghost || !this.item) return;
    const it = this.item;
    const x = p.x / this.scene.m.S;
    const y = p.y / this.scene.m.S;
    this.cancel();
    for (const tg of this.targets) {
      const r = tg.rect();
      if (x >= r.x - 4 && x <= r.x + r.w + 4 && y >= r.y - 4 && y <= r.y + r.h + 4 && tg.accepts(it)) {
        tg.drop(it);
        return;
      }
    }
  }

  cancel(): void {
    this.ghost?.destroy();
    this.ghost = null;
    this.marks?.destroy();
    this.marks = null;
    this.item = null;
  }
}

/** UI-pixel bounds of an object inside the scene's UI root. */
export function uiBoundsOf(scene: UiScene, obj: Phaser.GameObjects.Components.Transform & { w?: number; h?: number; width?: number; height?: number }): { x: number; y: number; w: number; h: number } {
  const m = obj.getWorldTransformMatrix();
  const S = scene.m.S;
  const w = obj.w ?? obj.width ?? 0;
  const h = obj.h ?? obj.height ?? 0;
  return { x: m.tx / S, y: m.ty / S, w, h };
}

// ------------------------------------------------------------------ item card / compare popup

export interface CardAction {
  label: string;
  icon?: string;
  variant?: 'primary' | 'secondary' | 'destructive';
  onClick: () => void;
  /** Disabled, with the reason a tap shows. */
  disabled?: string;
  id?: string;
}

export interface ItemCardOpts {
  item: Item;
  /** Compare against what this hero carries in the item's slot. */
  hero?: Hero;
  /** The item is the hero's own (no compare, "equipped" note). */
  equipped?: boolean;
  /** Extra lines under the description (price, seller...). */
  notes?: { text: string; font?: FontKey }[];
  actions: CardAction[];
  title?: string;
  /** Show the gold value line (default true; off where gold means nothing, e.g. the Glory-only duel shop). */
  worth?: boolean;
}

const deltaText = (d: StatDelta): string => `${d.delta > 0 ? '+' : ''}${fmtStat(d.id, d.delta)}`;

/**
 * The item card: big icon in its rarity frame, name in the rarity colour,
 * rarity and slot, condition, value, every stat. With a hero (and the item
 * not his), it is the compare popup: the slot's current item beside it and
 * each stat that changes in green (better) or red (worse).
 */
export function openItemCard(scene: UiScene, o: ItemCardOpts): Modal {
  ensureFonts(scene);
  const { VW, VH } = scene.m;
  const it = o.item;
  const def = itemDef(it.def);
  const rarity = normalizeRarity(it.rarity);
  const w = Math.min(VW - 12, 210);
  const inner = w - 16;
  // ---- measure the content
  const cmp = o.hero && !o.equipped ? compareItem(o.hero, it) : null;
  const changed = cmp ? cmp.deltas.filter((d) => d.better !== null) : [];
  const mods = itemModLines(it);
  const desc = wrapText(tOr(`item.${def.id}.desc`, def.desc), inner - 4, 3);
  const notes = o.notes ?? [];
  const headH = 40;
  const cmpH = cmp ? 30 + Math.max(1, changed.length) * 11 + (cmp.displaced.length ? 10 : 0) + 4 : 0;
  const modsH = 12 + Math.ceil(mods.length / 2) * 10 + 4;
  const bodyH = cmpH + modsH + desc.lines.length * LINE_H + 4 + notes.length * LINE_H;
  const footH = o.actions.length ? SIZE.btnH + 10 : 0;
  const want = 26 + headH + bodyH + footH + 8;
  const m = openModal(scene, { title: o.title ?? (cmp ? t('stash.compare') : t('stash.item')), w, h: Math.min(want, VH - 12) });
  const { c, x, y, h } = m;
  const bx = x + 8;
  let cy = y + 24;
  // ---- header: icon, name, rarity + slot, condition, value
  c.add(bigItemIcon(scene, bx, cy + 1, it, 34));
  const tx = bx + 38;
  const tw = inner - 38;
  c.add(addText(scene, tx, cy, ellipsize(itemName(it), tw), rarityFont(rarity)));
  c.add(addText(scene, tx, cy + 10, ellipsize(`${t(`rarity.${rarity}` as TKey)} · ${t(`slot.${def.slot}` as TKey)}${def.twoHanded ? ` · ${t('stash.twoHanded')}` : ''}`, tw), 'dim'));
  c.add(new Meter(scene, tx, cy + 22, Math.max(20, tw - 46), 4, it.cond > 66 ? COLOR.good : it.cond > 33 ? COLOR.xp : COLOR.bad).setValue(it.cond, 100));
  c.add(addText(scene, tx + Math.max(20, tw - 46) + 3, cy + 20, `${Math.round(it.cond)}%`, it.cond < 34 ? 'red' : 'ink'));
  if (o.worth !== false) {
    c.add(scaleIcon(addIcon(scene, tx - 1, cy + 28, 'coin'), 0.75));
    c.add(addText(scene, tx + 10, cy + 30, ellipsize(t('stash.worth', { n: itemValue(it) }), tw - 10), 'dim'));
  }
  cy += headH;
  // ---- scrolling body (compare, stats, description, notes)
  const viewH = y + h - 8 - footH - cy;
  const area = new ScrollArea(scene, c, bx, cy, inner, viewH, scene.m.S);
  const b = area.content;
  let by = 0;
  if (cmp && o.hero) {
    b.add(addPanel(scene, 0, by, inner, cmpH - 4, 'inset'));
    const eq = cmp.equipped;
    b.add(addText(scene, 4, by + 4, ellipsize(t('stash.vsEquipped', { name: o.hero.name }), inner - 8), 'dim'));
    if (eq) {
      b.add(new ItemIcon(scene, 4, by + 12, { item: eq }, { size: 16, tip: false, glow: false }));
      b.add(addText(scene, 23, by + 16, ellipsize(itemName(eq), inner - 27 - 70), rarityFont(eq.rarity)));
    } else b.add(addText(scene, 4, by + 16, t('stash.emptySlot'), 'dim'));
    const dp = cmp.power[1] - cmp.power[0];
    b.add(addText(scene, inner - 4, by + 16, t('hero.power', { n: `${dp > 0 ? '+' : ''}${dp}` }), dp > 0 ? 'good' : dp < 0 ? 'red' : 'dim', 1));
    let ry = by + 30;
    if (!changed.length) {
      b.add(addText(scene, 4, ry, t('stash.noChange'), 'dim'));
      ry += 11;
    }
    for (const d of changed) {
      b.add(addText(scene, 4, ry, ellipsize(t(`stat.${d.id}` as TKey), inner - 90), 'ink'));
      b.add(addText(scene, inner - 44, ry, `${fmtStat(d.id, d.cur)}>${fmtStat(d.id, d.next)}`, 'dim', 1));
      b.add(addText(scene, inner - 4, ry, deltaText(d), d.better ? 'good' : 'red', 1));
      ry += 11;
    }
    if (cmp.displaced.length) b.add(addText(scene, 4, ry, ellipsize(t('stash.alsoRemoves', { name: cmp.displaced.map(itemName).join(', ') }), inner - 8), 'red'));
    by += cmpH;
  }
  b.add(addText(scene, 0, by, t('stash.stats'), 'red'));
  by += 12;
  const colW = Math.floor(inner / 2);
  mods.forEach((ml, i) => {
    const mx = (i % 2) * colW;
    const my = by + Math.floor(i / 2) * 10;
    const val = addText(scene, mx + colW - 4, my, ml.text, ml.good ? 'ink' : 'red', 1);
    b.add(val);
    b.add(addText(scene, mx, my, ellipsize(tOr(`mod.${ml.key}`, ml.key), colW - val.width - 8), 'dim'));
  });
  by += Math.ceil(mods.length / 2) * 10 + 4;
  if (desc.lines.length) {
    b.add(addText(scene, 0, by, desc.lines.join('\n'), 'ink'));
    by += desc.lines.length * LINE_H + 4;
  }
  for (const n of notes) {
    b.add(addText(scene, 0, by, ellipsize(n.text, inner - 3), n.font ?? "dim"));
    by += LINE_H;
  }
  area.setContentHeight(by);
  // ---- actions (primary on the right, under the thumb)
  if (o.actions.length) {
    const n = o.actions.length;
    const fy = y + h - 8 - SIZE.btnH;
    const bw = Math.floor((inner - (n - 1) * SIZE.gap) / n);
    o.actions.forEach((a, i) => {
      const btn = new Button(scene, bx + i * (bw + SIZE.gap), fy, i === n - 1 ? inner - i * (bw + SIZE.gap) : bw, SIZE.btnH, {
        label: a.label,
        icon: a.icon,
        variant: a.variant ?? 'secondary',
        id: a.id,
        onClick: () => {
          m.close();
          a.onClick();
        },
      });
      if (a.disabled) btn.setEnabled(false, a.disabled);
      c.add(btn);
    });
  }
  c.once('destroy', () => area.destroy());
  return m;
}

// ------------------------------------------------------------------ stash grid with filters

export interface StashState {
  slot: SlotFilter;
  rarity: RarityFilter;
  sort: StashSort;
}

export const defaultStashState = (): StashState => ({ slot: 'all', rarity: 'all', sort: 'rarity' });

export interface StashGridOpts {
  items: () => Item[];
  state: StashState;
  /** Selected hero: upgrade arrows on items that would make him stronger. */
  hero?: () => Hero | undefined;
  onTap: (it: Item) => void;
  onState?: (s: StashState) => void;
  drag?: DragDrop;
  /** Empty-state action (e.g. "Find a fight"). */
  empty?: { title: string; hint: string };
  cell?: number;
  selected?: () => string | null;
}

/**
 * The stash as an inventory grid: slot filter chips (or a cycling button on
 * short screens), rarity filter and sort buttons, then the items in their
 * rarity frames with condition pips and green upgrade arrows.
 */
export class StashGrid {
  readonly c: Phaser.GameObjects.Container;
  private grid: Grid | null = null;
  private list: Item[] = [];

  constructor(private scene: UiScene, parent: Phaser.GameObjects.Container, private x: number, private y: number, private w: number, private h: number, private o: StashGridOpts) {
    ensureFonts(scene);
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

  private set(s: Partial<StashState>): void {
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
    const gap = SIZE.gap;
    let cy = y;
    const chipW = Math.floor((w - 5 * gap) / 6);
    const twoRows = h >= 130 && chipW >= 22;
    if (twoRows) {
      SLOT_FILTERS.forEach((f, i) => {
        const bx = x + i * (chipW + gap);
        const b = new Button(scene, bx, cy, i === 5 ? w - 5 * (chipW + gap) : chipW, SIZE.btnH, {
          icon: f === 'all' ? 'people' : SLOT_ICON[f],
          iconOnly: true,
          label: f === 'all' ? t('stash.all') : t(`slot.${f}` as TKey),
          style: st.slot === f ? 'buttonSel' : 'button',
          id: `filter:${f}`,
          onClick: () => this.set({ slot: f }),
        });
        this.c.add(b);
      });
      cy += SIZE.btnH + gap;
    }
    const n = twoRows ? 2 : 3;
    const bw = Math.floor((w - (n - 1) * gap) / n);
    let bx = x;
    if (!twoRows) {
      this.c.add(
        new Button(scene, bx, cy, bw, SIZE.btnH, {
          label: st.slot === 'all' ? t('stash.all') : t(`slot.${st.slot}` as TKey),
          icon: st.slot === 'all' ? undefined : SLOT_ICON[st.slot],
          id: 'filter:slot',
          tip: t('stash.slotTip'),
          onClick: () => this.set({ slot: cycle(SLOT_FILTERS, st.slot) }),
        }),
      );
      bx += bw + gap;
    }
    this.c.add(
      new Button(scene, bx, cy, bw, SIZE.btnH, {
        label: st.rarity === 'all' ? t('stash.anyRarity') : t(`rarity.${st.rarity}` as TKey),
        id: 'filter:rarity',
        font: st.rarity === 'all' ? 'ink' : rarityFont(st.rarity),
        tip: t('stash.rarityTip'),
        onClick: () => this.set({ rarity: cycle(RARITY_FILTERS, st.rarity) }),
      }),
    );
    bx += bw + gap;
    this.c.add(
      new Button(scene, bx, cy, x + w - bx, SIZE.btnH, {
        label: t(`stash.sort.${st.sort}` as TKey),
        id: 'filter:sort',
        tip: t('stash.sortTip'),
        onClick: () => this.set({ sort: cycle(STASH_SORTS, st.sort) }),
      }),
    );
    cy += SIZE.btnH + gap + 1;
    const gh = y + h - cy;
    const all = this.o.items();
    this.list = queryStash(all, st);
    this.c.add(addPanel(scene, x, cy, w, gh, 'inset'));
    if (!this.list.length) {
      const filtered = all.length > 0;
      this.c.add(
        addEmptyState(scene, x + 2, cy + 2, w - 4, gh - 4, {
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
      render: (i, cc, size, area) => {
        const it = this.list[i];
        const sel = this.o.selected?.() === it.uid;
        const ic = new ItemIcon(scene, 0, 0, { item: it }, { size, area, selected: sel, tip: false, onTap: () => this.o.drag?.dragging || this.o.onTap(it) });
        cc.add(ic);
        cc.add(new Meter(scene, 3, size - 4, size - 6, 2, it.cond > 66 ? COLOR.good : it.cond > 33 ? COLOR.xp : COLOR.bad).setValue(it.cond, 100));
        if (hero && isUpgrade(hero, it)) {
          const g = scene.add.graphics();
          g.fillStyle(0x1d140f, 1);
          g.fillTriangle(size - 9, 7, size - 5, 2, size - 1, 7);
          g.fillStyle(0x7fd05a, 1);
          g.fillTriangle(size - 8, 6, size - 5, 3, size - 2, 6);
          g.fillRect(size - 6, 6, 2, 3);
          cc.add(g);
        }
        this.o.drag?.attach(ic, it, area);
      },
    });
  }
}

/** Rarity colour of an item (for frames drawn by hand). */
export const rarityColor = (it: Item): number => RARITY_COLOR[normalizeRarity(it.rarity)];

/** Group colour (roster badges, group buttons). */
export const groupColor = (g: number): number => GROUP_COLOR[g] ?? 0x8a7a6a;

/** The equipment slots a hero shows, in sheet order. */
export const heroSlots = (): Slot[] => SLOTS;

export { FONT_GOOD_LIGHT, FONT_RED_LIGHT };

/**
 * A count badge on the top edge of tab `i` of a Tabs bar at (x, y), width w,
 * n tabs: above the label so it never covers it.
 */
export function addTabBadge(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, w: number, n: number, i: number, count: number | string): void {
  const tw = Math.floor((w - SIZE.gap * (n - 1)) / n);
  const right = i === n - 1 ? x + w : x + i * (tw + SIZE.gap) + tw;
  parent.add(new Badge(scene, right - 6, y + 1, count));
}

/** An item icon drawn at twice its pixel size inside its rarity frame (cards, details). */
export function bigItemIcon(scene: Phaser.Scene, x: number, y: number, it: Item, size = 34, opts: { onTap?: () => void } = {}): ItemIcon {
  const ic = new ItemIcon(scene, x, y, { item: it }, { size, tip: false, onTap: opts.onTap });
  const key = ensureItemIcon(scene, it);
  for (const o of ic.list) {
    if (o instanceof Phaser.GameObjects.Image && o.texture.key === key) {
      // the smooth icon redrawn at 32 UI px (not the 16 px one scaled up)
      fitItemIcon(o.setTexture(ensureItemIcon(scene, it, 32)), 32);
      o.setPosition(Math.floor((size - 32) / 2), Math.floor((size - 32) / 2));
    }
  }
  return ic;
}

/**
 * Give every text inside a scroll area's content (that has no box yet) the
 * content's own rect as its box, so the layout check measures it against
 * the scrolling page, not the fixed panel behind the viewport.
 */
export function frameScrollTexts(area: ScrollArea, w: number): void {
  const content = area.content;
  const h = Math.max(area.contentHeight, area.viewHeight);
  type R = { x: number; y: number; w: number; h: number };
  const panels: R[] = [];
  const texts: { o: Phaser.GameObjects.BitmapText; x: number; y: number }[] = [];
  const walk = (list: Phaser.GameObjects.GameObject[], ox: number, oy: number) => {
    for (const o of list) {
      const any = o as unknown as { __uiFrame?: unknown; list?: Phaser.GameObjects.GameObject[]; x: number; y: number; texture?: { key: string }; width: number; height: number };
      if (o instanceof Phaser.GameObjects.Image && !o.input && any.texture?.key.startsWith('panel_')) panels.push({ x: ox + any.x, y: oy + any.y, w: any.width, h: any.height });
      if (o instanceof Phaser.GameObjects.BitmapText && !any.__uiFrame) {
        texts.push({ o, x: ox + o.x - o.originX * o.width, y: oy + o.y - o.originY * o.height + o.height / 2 });
      }
      if (any.list) walk(any.list, ox + any.x, oy + any.y);
    }
  };
  walk(content.list, 0, 0);
  for (const tx of texts) {
    const inPanel = panels.some((p) => tx.x + 1 >= p.x && tx.x + 1 <= p.x + p.w && tx.y >= p.y && tx.y <= p.y + p.h);
    if (!inPanel) uiFrame(tx.o, content, w, h);
  }
}

// ------------------------------------------------------------------ class card (recruiting)

export interface ClassCardOpts {
  /** A sample hero of the class (his gear is shown). */
  hero: Hero;
  title?: string;
  /** Price line, e.g. "60 gold". */
  price?: string;
  action?: CardAction;
}

/** What a class is good and bad at (role based), for recruit cards. */
export function roleTraits(role: string): { good: string; bad: string } {
  return { good: tOr(`role.${role}.good`, ''), bad: tOr(`role.${role}.bad`, '') };
}

/**
 * A recruit's class card: the figure on a stage, class, role, what the class
 * is for, strong and weak against, his main stats and the price, with the
 * hire action under the thumb.
 */
export function openClassCard(scene: UiScene, o: ClassCardOpts): Modal {
  ensureFonts(scene);
  const { VW, VH } = scene.m;
  const h = o.hero;
  const cls = heroClass(h);
  const w = Math.min(VW - 12, 210);
  const inner = w - 16;
  const desc = wrapText(tOr(`class.${cls.id}.desc`, cls.desc), inner - 4, 4);
  const rt = roleTraits(cls.role);
  const s = computeStats(h);
  const stats: StatId[] = ['hp', shoots(s) ? 'ranged' : 'dmg', 'armor', 'speed', 'morale'];
  const stageH = VH < 300 ? 0 : VH >= 400 ? 116 : 70;
  const want = 26 + stageH + 26 + desc.lines.length * LINE_H + 26 + stats.length * 12 + 6 + (o.price ? 12 : 0) + (o.action ? SIZE.btnH + 10 : 0) + 8;
  const m = openModal(scene, { title: o.title ?? className(h), w, h: Math.min(want, VH - 12) });
  const { c, x, y } = m;
  const bx = x + 8;
  const cy = y + 24;
  const area = new ScrollArea(scene, c, bx, cy, inner, y + m.h - 8 - (o.action ? SIZE.btnH + 6 : 0) - cy, scene.m.S);
  const b = area.content;
  let by = 0;
  if (stageH) {
    b.add(new Stage(scene, 0, 0, inner, stageH, h, { scale: 2 }));
    by += stageH + 4;
  }
  const chipW = addChip(scene, b, 0, by, roleName(cls.role), roleColor(cls.role), inner);
  if (cls.mount) addChip(scene, b, chipW + 4, by, tOr(`mount.${cls.mount}`, cls.mount), 0x8a6a3a, inner - chipW - 4);
  by += 15;
  b.add(addText(scene, 0, by, desc.lines.join('\n'), 'ink'));
  by += desc.lines.length * LINE_H + 3;
  if (rt.good) b.add(addText(scene, 0, by, ellipsize(`+ ${rt.good}`, inner), 'good'));
  if (rt.bad) b.add(addText(scene, 0, by + 10, ellipsize(`- ${rt.bad}`, inner), 'red'));
  by += 23;
  for (const id of stats) {
    const d = STATS[id];
    const v = d.get(s);
    b.add(addText(scene, 0, by, ellipsize(t(`stat.${id}` as TKey), 64), 'dim'));
    b.add(new Meter(scene, 66, by + 2, inner - 66 - 30, 4, COLOR.xp).setValue(v, d.max));
    b.add(addText(scene, inner, by, fmtStat(id, v), 'ink', 1));
    by += 12;
  }
  if (o.price) {
    by += 3;
    const pr = wrapText(o.price, inner - 4, 2);
    b.add(addText(scene, 0, by, pr.lines.join("\n"), "red"));
    by += (pr.lines.length - 1) * LINE_H;
    by += 10;
  }
  area.setContentHeight(by);
  frameScrollTexts(area, inner);
  if (o.action) {
    const a = o.action;
    const fy = y + m.h - 8 - SIZE.btnH;
    const bw = Math.floor((inner - SIZE.gap) / 2);
    c.add(new Button(scene, bx, fy, bw, SIZE.btnH, { label: t('common.close'), onClick: () => m.close() }));
    const btn = new Button(scene, bx + bw + SIZE.gap, fy, inner - bw - SIZE.gap, SIZE.btnH, {
      label: a.label,
      icon: a.icon,
      variant: a.variant ?? 'primary',
      id: a.id,
      onClick: () => {
        m.close();
        a.onClick();
      },
    });
    if (a.disabled) btn.setEnabled(false, a.disabled);
    c.add(btn);
  }
  c.once('destroy', () => area.destroy());
  return m;
}
