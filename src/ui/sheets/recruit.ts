/**
 * Recruiting in a settlement (SET-01, design/ux/screens-campaign.md C-6):
 *
 * - the recruit sheet: the man himself at 3x on a stage (his own face, V5-045), his class bust in the
 *   corner when it is shipped, class and role, what the class is for, strong and weak against, his
 *   stats and an ink attribute line, and Hire under the thumb. One close affordance, the X (G5).
 * - the hire Undo toast (controls.md R4.3: hiring is not confirmed; it can be taken back for 4 s).
 * - `undoHire`, the pure reversal the toast runs: the man leaves, the gold comes back and he is on
 *   offer again.
 */
import Phaser from 'phaser';
import { Meter, ScrollArea, mosaicPanelImage, type FontKey, type UIMetrics } from '../kit';
import { addScrollHint } from '../widgets';
import { uiFrame, uiId } from '../layout';
import { LINE_H } from '../textfit';
import { MOSAIC, TEXT_MIN } from '../tokens';
import { COLOR } from '../theme';
import { MButton, TAP, mtext, mw, openParchmentSheet, wrapWords, SHEET_TITLE_H, SHEET_ACTION_H } from '../mosaic';
import { Stage, className, roleColor, roleName, roleTraits } from '../sheet';
import { armyPill, armyPillH, armyPillW } from '../army/parts';
import { addClassBust, ensureBusts } from '../army/busts';
import { computeStats, heroClass } from '../../sim/stats';
import { STATS, fmtStat, shoots, type StatId } from '../../game/gear';
import type { Hero } from '../../data/units';
import { retrainPerks } from '../../data/perks';
import type { Campaign } from '../../game/campaign';
import { t, tOr, type TKey } from '../../i18n';

type UiScene = Phaser.Scene & { m: UIMetrics; ui: Phaser.GameObjects.Container };
type C = Phaser.GameObjects.Container;

/** Seconds the hire Undo stays (controls.md R4.3). */
export const HIRE_UNDO_S = 4;

/** What a hire needs to be taken back. */
export interface HireReceipt {
  /** The settlement. */
  sid: number;
  /** The offer's index in the settlement's pool. */
  index: number;
  heroId: string;
  price: number;
}

/**
 * Take a hire back: the man leaves the army, his price is refunded and he is on offer again (his
 * index leaves the settlement's bought list). False when he is no longer in the army.
 */
export function undoHire(camp: Campaign, r: HireReceipt): boolean {
  const i = camp.data.heroes.findIndex((h) => h.id === r.heroId);
  if (i < 0) return false;
  camp.data.heroes.splice(i, 1);
  camp.data.gold += r.price;
  const bought = camp.world.s.places[r.sid]?.bought;
  const k = bought ? bought.indexOf(r.index) : -1;
  if (bought && k >= 0) bought.splice(k, 1);
  return true;
}

/** Whether the Drillmaster has work (abilities.md R7): some man has a perk tier he could switch to its other path. */
export function canRetrainAny(heroes: readonly Hero[]): boolean {
  return heroes.some((h) => h.perks.some((_, tier) => retrainPerks(h, tier) !== null));
}

// ------------------------------------------------------------------ the undo toast

/**
 * A toast with an Undo button, just above `bottom` (the action bar), for HIRE_UNDO_S seconds. A
 * newer one replaces it; it goes with the scene. Returns its close.
 */
export function showUndoToast(scene: UiScene, text: string, bottom: number, onUndo: () => void): () => void {
  undoToasts.get(scene)?.();
  const { VW } = scene.m;
  const w = Math.min(VW - 16, 240);
  const bw = Math.max(TAP + 18, Math.ceil(mw(t('set.undo'), 'rInk', 7)) + 30);
  const tw = w - bw - 18;
  const lines = wrapWords(text, tw, (s) => mw(s, 'light', 7)).slice(0, 3);
  const h = Math.max(TAP + 8, lines.length * LINE_H + 12);
  const x = Math.round((VW - w) / 2);
  const c = scene.add.container(x, Math.round(bottom - h - 4));
  scene.ui.add(c);
  uiId(c, 'town.undoToast');
  const bg = mosaicPanelImage(scene, 0, 0, w, h, 'chipStone').setInteractive();
  c.add(bg);
  c.add(scene.add.rectangle(2, 2, 2, h - 4, COLOR.good).setOrigin(0, 0));
  const txt = mtext(scene, 9, Math.round((h - lines.length * LINE_H) / 2), lines.join('\n'), 'light', { size: 7 });
  c.add(uiFrame(txt, c, w - bw - 8, h));
  let done = false;
  const close = () => {
    if (done) return;
    done = true;
    if (undoToasts.get(scene) === close) undoToasts.delete(scene);
    if (!c.scene) return;
    scene.tweens.add({ targets: c, alpha: 0, duration: 180, onComplete: () => c.destroy() });
  };
  c.add(
    new MButton(scene, w - bw - 4, Math.round((h - TAP) / 2), bw, TAP, {
      label: t('set.undo'),
      icon: 'back',
      variant: 'secondary',
      id: 'town.undo',
      onClick: () => {
        if (done) return;
        close();
        onUndo();
      },
    }),
  );
  c.setAlpha(0);
  scene.tweens.add({ targets: c, alpha: 1, duration: 120 });
  scene.time.delayedCall(HIRE_UNDO_S * 1000, close);
  undoToasts.set(scene, close);
  c.once('destroy', () => undoToasts.get(scene) === close && undoToasts.delete(scene));
  return close;
}

const undoToasts = new WeakMap<Phaser.Scene, () => void>();

// ------------------------------------------------------------------ the recruit sheet

export interface RecruitSheetOpts {
  hero: Hero;
  price: number;
  /** Why he cannot be hired (army full, too little gold); undefined when he can. */
  blocked?: string;
  /** A volunteer of the floor (campaign-arc.md R1.5). */
  volunteer?: boolean;
  onHire: () => void;
}

const PAD = 8;

/** Lines of `s` in `font` at `size` wrapped to `w`. */
function para(scene: Phaser.Scene, c: C, x: number, y: number, s: string, font: FontKey, w: number, size = 7): number {
  const ls = wrapWords(s, w, (z) => mw(z, font, size));
  if (!ls.length) return 0;
  c.add(mtext(scene, x, y, ls.join('\n'), font, { size }));
  return Math.ceil((ls.length * LINE_H * size) / 7);
}

/** The sheet's content into `c`, `w` wide; returns its height. */
function fill(scene: UiScene, c: C, o: RecruitSheetOpts, w: number, stageH: number): number {
  const h = o.hero;
  const cls = heroClass(h);
  let y = 0;
  if (stageH) {
    c.add(new Stage(scene, 0, 0, w, stageH, h, { scale: 3 }));
    // the class bust in the stage's corner (V5-045: the class's face; the man keeps his own)
    addClassBust(scene, c, w - 34, 4, 30, cls.id);
    y += stageH + 5;
  }
  y += para(scene, c, 0, y, `${className(h)} · ${t('hero.level', { n: h.level })}`, 'pSec', w, TEXT_MIN) + 3;
  const pw = armyPill(scene, c, 0, y, roleName(cls.role), roleColor(cls.role), w);
  let ph = armyPillH(roleName(cls.role), w);
  if (cls.mount) {
    const m = tOr(`mount.${cls.mount}`, cls.mount);
    armyPill(scene, c, pw + 4, y, m, MOSAIC.bronze, w - pw - 4);
    ph = Math.max(ph, armyPillH(m, w - pw - 4));
  }
  if (o.volunteer) armyPill(scene, c, w - armyPillW(t('set.volunteer')), y, t('set.volunteer'), MOSAIC.bronze, w);
  y += ph + 5;
  y += para(scene, c, 0, y, tOr(`class.${cls.id}.desc`, cls.desc), 'pInk', w) + 4;
  const rt = roleTraits(cls.role);
  if (rt.good) y += para(scene, c, 0, y, `+ ${t('set.strong')}: ${rt.good}`, 'pGood', w, TEXT_MIN) + 2;
  if (rt.bad) y += para(scene, c, 0, y, `- ${t('set.weak')}: ${rt.bad}`, 'pSec', w, TEXT_MIN) + 2;
  y += 3;
  const s = computeStats(h);
  const stats: StatId[] = ['hp', shoots(s) ? 'ranged' : 'dmg', 'armor', 'speed', 'morale'];
  const labelW = Math.min(80, Math.max(...stats.map((id) => mw(t(`stat.${id}` as TKey), 'pSec', TEXT_MIN))) + 6);
  for (const id of stats) {
    const d = STATS[id];
    const v = d.get(s);
    c.add(mtext(scene, 0, y, t(`stat.${id}` as TKey), 'pSec', { size: TEXT_MIN, maxW: labelW }));
    const val = fmtStat(id, v);
    const vw = mw(val, 'pInk', TEXT_MIN);
    c.add(new Meter(scene, labelW, y + 4, Math.max(20, w - labelW - vw - 8), 4, COLOR.xp).setValue(v, d.max));
    c.add(mtext(scene, w, y, val, 'pInk', { size: TEXT_MIN, align: 1 }));
    y += 12;
  }
  y += 3;
  const a = h.attrs;
  const attrs = `${t('attr.str.short')} ${a.str} · ${t('attr.agi.short')} ${a.agi} · ${t('attr.end.short')} ${a.end} · ${t('attr.wil.short')} ${a.wil}`;
  y += para(scene, c, 0, y, attrs, 'pInk', w, TEXT_MIN);
  return y + 2;
}

/** The recruit sheet (Hire › tap a portrait). */
export function openRecruitSheet(scene: UiScene, o: RecruitSheetOpts): { close: () => void } {
  const { VW, VH } = scene.m;
  const w = Math.min(VW - 16, 230);
  const iw = w - PAD * 2 - 4;
  // the stage draws the figure at the largest whole scale (up to 3x) its height and width allow
  const stageH = VH < 300 ? 0 : VH >= 380 ? 120 : 84;
  const probe = scene.add.container(0, 0);
  const contentH = fill(scene, probe, o, iw, stageH);
  probe.destroy();
  const h = Math.min(VH - 12, SHEET_TITLE_H + contentH + PAD * 2 + SHEET_ACTION_H + 10);
  const s = openParchmentSheet(scene, {
    title: o.hero.name,
    w,
    h,
    id: 'recruit.sheet',
    actions: [
      {
        label: `${t('town.hire')} ${o.price}`,
        icon: 'coin',
        variant: o.blocked ? 'disabled' : 'primary',
        disabledReason: o.blocked,
        id: 'town.hireCard',
        onClick: () => {
          s.close();
          o.onHire();
        },
      },
    ],
  });
  const area = new ScrollArea(scene, s.c, s.body.x + 2, s.body.y, s.body.w - 2, s.body.h, scene.m.S);
  fill(scene, area.content, o, iw, stageH);
  area.setContentHeight(contentH);
  addScrollHint(scene, s.c, area, MOSAIC.parch);
  s.c.once('destroy', () => area.destroy());
  // the class bust arrives after the first open: draw it then
  ensureBusts(scene, [heroClass(o.hero).id], () => {
    if (!area.content.scene || !stageH) return;
    addClassBust(scene, area.content, iw - 34, 4, 30, heroClass(o.hero).id);
  });
  return { close: s.close };
}
