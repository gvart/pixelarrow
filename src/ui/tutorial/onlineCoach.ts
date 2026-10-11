/**
 * Coach marks of the first visit to the online war table (docs/DESIGN_V2.md
 * "Onboarding": a guided first hex capture). One at a time, in the
 * first-time-hint style of the kit but anchored: a dark bubble with an arrow
 * at the element, a pulsing ring round it and the rest of the screen dimmed:
 * your home hex, tap a neighbour (waits until you do), its defenders, March,
 * Attack (the 15 s deployment and Ready, said once), Collect, Clan. How far
 * the player got is kept in the settings (synced with the save, so per
 * account); screenshot and layout runs (seenHints '*') never see them unless
 * a step is forced.
 */
import Phaser from 'phaser';
import { addText } from '../kit';
import { MButton, mosaicImage } from '../mosaic';
import { MOSAIC } from '../tokens';
import { uiBlocker, uiId } from '../layout';
import { wrapText, LINE_H } from '../textfit';
import { SIZE } from '../theme';
import { Spotlight, type Rect } from './spotlight';
import { ONLINE_COACH, nextCoach, type CoachId } from '../../game/tutorial';
import { state } from '../../state';
import { tutorialStep } from '../../audio/hooks';
import { haptic } from '../../platform/telegram';
import { t, type TKey } from '../../i18n';
import type { UiScene } from '../widgets';

/** What the coach needs from the online map scene (UI pixels). */
export interface CoachHost {
  readonly scene: UiScene;
  /** Your home hex on screen. */
  homeRect(): Rect | null;
  /** A free hex next to your army, to tap. */
  neighbourRect(): Rect | null;
  /** Bring that neighbour into the free map area when it is off screen (regions can be far apart); false: none known yet. */
  showNeighbour(): boolean;
  /** The free map area (between the top bar and the panel or the bottom bar). */
  mapRect(): Rect;
  /** A hex next to the army is selected and its panel is up. */
  neighbourOpen(): boolean;
  /** An element of the HUD by its layout id (`online.hexInfo`, `online.act.march`...) or button label. */
  element(id: string): Rect | null;
  /** A modal is open (the coach waits). */
  busy(): boolean;
  /** The stone rail of map keys: the card is placed opposite it, never over its keys (WAR-6). */
  rail?(): Rect | null;
}

/**
 * Where the coach card goes (UI px): above a low target, else below; with a rail, the card keeps to its left,
 * and for a target on the rail itself it sits beside the rail at the target's height, the arrow pointing right.
 */
export function bubblePlace(at: Rect | null, w: number, h: number, VW: number, VH: number, rail: Rect | null): { x: number; y: number; w: number; side: 'above' | 'below' | 'left' } {
  const right = rail ? rail.x - 6 : VW - 8;
  const bw = Math.min(w, right - 8);
  if (at && rail && at.x >= rail.x - 2) {
    const y = Math.round(Math.max(4, Math.min(VH - 4 - h, at.y + at.h / 2 - h / 2)));
    return { x: Math.round(right - bw), y, w: bw, side: 'left' };
  }
  let y: number;
  let side: 'above' | 'below' = 'below';
  if (!at) y = Math.round((VH - h) / 2);
  else if (at.y + at.h / 2 > VH / 2) {
    y = at.y - 8 - h;
    side = 'above';
  } else y = at.y + at.h + 8;
  y = Math.max(4, Math.min(VH - 4 - h, y));
  const cx = at ? at.x + at.w / 2 : VW / 2;
  const x = Math.round(Math.max(8, Math.min(right - bw, cx - bw / 2)));
  return { x, y, w: bw, side };
}

const TARGET: Partial<Record<CoachId, string>> = {
  defenders: 'online.hexInfo',
  march: 'online.act.march',
  attack: 'online.act.attack',
};

/** Should the coach run for this player? (seenHints '*' = staged runs without hints) */
export function coachDue(): boolean {
  const st = state.campaign?.data.settings;
  if (!st || (st.seenHints ?? []).includes('*') || (window as { __noFirstRun?: boolean }).__noFirstRun) return false;
  return nextCoach(st.onlineCoach) !== null;
}

export class OnlineCoach {
  private host: CoachHost;
  private scene: UiScene;
  readonly layer: Phaser.GameObjects.Container;
  private spot: Spotlight;
  private bubble: Phaser.GameObjects.Container;
  private arrow: Phaser.GameObjects.Graphics;
  private step: CoachId | null;
  private shownFor = '';
  /** The neighbour mark brought its region on screen once (the player may pan away after). */
  private focused = false;
  /** Forced (layout check, screenshots): nothing is saved. */
  private forced: boolean;

  constructor(host: CoachHost, parent: Phaser.GameObjects.Container, force?: CoachId) {
    this.host = host;
    this.scene = host.scene;
    this.forced = !!force;
    this.step = force ?? nextCoach(state.campaign.data.settings.onlineCoach);
    this.layer = this.scene.add.container(0, 0);
    parent.add(this.layer);
    this.spot = new Spotlight(this.scene, this.layer);
    this.bubble = this.scene.add.container(0, 0);
    this.arrow = this.scene.add.graphics();
    this.layer.add([this.arrow, this.bubble]);
    this.refresh();
  }

  get current(): CoachId | null {
    return this.step;
  }

  /** The target of the current mark (null: none on screen right now). */
  private target(): { rect: Rect | null; hole: Rect | null; wait: boolean } | null {
    const h = this.host;
    switch (this.step) {
      case 'home': {
        const r = h.homeRect();
        return { rect: r, hole: r, wait: false };
      }
      case 'neighbour':
        // the whole map is open: tap the ringed hex (or any next to the army)
        return { rect: h.neighbourRect(), hole: h.mapRect(), wait: true };
      case 'defenders':
      case 'march':
      case 'attack': {
        const r = h.element(TARGET[this.step]!);
        if (this.step === 'defenders' && !h.neighbourOpen()) return null;
        return { rect: r, hole: r, wait: false };
      }
      case 'collect': {
        const r = h.element('online.bar.collect');
        return { rect: r, hole: r, wait: false };
      }
      case 'clan': {
        const r = h.element('online.bar.clan');
        return { rect: r, hole: r, wait: false };
      }
      default:
        return null;
    }
  }

  /** Re-place the mark (the HUD was rebuilt, a hex selected, the camera moved). */
  refresh(): void {
    if (!this.step) return this.clear();
    if (this.host.busy()) return this.clear();
    // the neighbour mark is done once a hex next to the army is open
    if (this.step === 'neighbour' && this.host.neighbourOpen()) return this.advance();
    // nothing to point at (no March here, say): on to the next
    if ((this.step === 'march' || this.step === 'attack') && this.host.neighbourOpen() && !this.target()?.rect && this.host.element('online.hexInfo')) return this.advance();
    if (this.step === 'neighbour' && !this.focused) this.focused = this.host.showNeighbour();
    const tg = this.target();
    if (!tg) return this.clear();
    const key = `${this.step}|${JSON.stringify(tg.rect)}|${JSON.stringify(tg.hole)}`;
    if (key === this.shownFor) return;
    this.shownFor = key;
    const pad = 2;
    const grow = (r: Rect | null) => (r ? { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 } : null);
    this.spot.show({ hole: grow(tg.hole), dim: 0.45, ring: tg.rect ? grow(tg.rect)! : false, block: true });
    this.drawBubble(t(`coach.${this.step}` as TKey), tg.rect, !tg.wait);
  }

  private drawBubble(text: string, at: Rect | null, button: boolean): void {
    const s = this.scene;
    const { VW, VH } = s.m;
    this.bubble.removeAll(true);
    this.arrow.clear();
    // only a column rail at the right edge leaves room beside it (a row of keys across the top does not)
    const r0 = this.host.rail?.() ?? null;
    const rail = r0 && r0.h > r0.w && r0.x - 14 >= 120 ? r0 : null;
    // the card's width: what is left of the rail (opposite it, WAR-6), at most 176
    const w0 = Math.min(VW - 16, 176, rail ? rail.x - 14 : VW);
    const lines = wrapText(text, w0 - 14, 7).lines;
    const h = 7 + lines.length * LINE_H + (button ? SIZE.btnH + 6 : 3);
    // above the target when it sits low, else below; beside the rail for a rail key; never on it
    const pl = bubblePlace(at, w0, h, VW, VH, rail);
    const { x, y, w } = pl;
    const below = pl.side === 'below';
    const cx = at ? at.x + at.w / 2 : VW / 2;
    const zone = s.add.zone(x, y, w, h).setOrigin(0, 0).setInteractive();
    uiBlocker(uiId(zone, 'coach.bubble'));
    this.bubble.add(zone);
    this.bubble.add(mosaicImage(s, x, y, w, h, 'parchment'));
    this.bubble.add(addText(s, x + 7, y + 5, lines.join('\n'), 'pInk'));
    if (button) {
      const last = ONLINE_COACH.indexOf(this.step!) === ONLINE_COACH.length - 1;
      const bw = 64;
      this.bubble.add(new MButton(s, x + w - bw - 4, y + h - SIZE.btnH - 4, bw, SIZE.btnH, { label: t(last ? 'coach.done' : 'coach.next'), icon: 'check', variant: 'primary', id: 'coach.next', onClick: () => this.advance() }));
      // where we are: 2 / 7
      this.bubble.add(addText(s, x + 7, y + h - 17, `${ONLINE_COACH.indexOf(this.step!) + 1} / ${ONLINE_COACH.length}`, 'pSec'));
    }
    if (at && pl.side === 'left') {
      // the arrow from the card's right edge to the rail key
      const ay = Math.round(Math.max(y + 8, Math.min(y + h - 8, at.y + at.h / 2)));
      this.arrow.fillStyle(MOSAIC.parch, 1);
      this.arrow.fillTriangle(x + w - 1, ay - 5, x + w - 1, ay + 5, x + w + 5, ay);
    } else if (at) {
      // the arrow from the bubble to the target
      const ax = Math.round(Math.max(x + 8, Math.min(x + w - 8, cx)));
      this.arrow.fillStyle(MOSAIC.parch, 1);
      if (below) this.arrow.fillTriangle(ax - 5, y + 1, ax + 5, y + 1, ax, y - 6);
      else this.arrow.fillTriangle(ax - 5, y + h - 1, ax + 5, y + h - 1, ax, y + h + 6);
    }
  }

  private clear(): void {
    this.shownFor = '';
    this.spot.show(null);
    this.bubble.removeAll(true);
    this.arrow.clear();
  }

  /** Next mark (saved: a mark is seen once). */
  advance(): void {
    if (!this.step) return;
    const i = ONLINE_COACH.indexOf(this.step);
    if (!this.forced) {
      state.campaign.data.settings.onlineCoach = i + 1;
      void state.save();
    }
    tutorialStep();
    haptic('light');
    this.step = this.forced ? null : nextCoach(i + 1);
    this.shownFor = '';
    this.refresh();
  }

  update(time: number): void {
    this.spot.update(time);
  }

  destroy(): void {
    this.layer.destroy();
  }
}
