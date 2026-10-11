/**
 * The Campaign hub's rules (HUB-02, design/ux/screens-campaign.md C-3), pure and
 * unit-tested: the status line, the Army badge count and the fresco slot. The
 * scene (src/scenes/MenuScene.ts) only reads the save and draws.
 */
import { t } from '../../i18n';
import { perkSlots } from '../../data/perks';
import type { ArcStage } from '../../world/world';

export interface HubStatus {
  hasSave: boolean;
  day: number;
  /** The town the army is inside, if any. */
  place?: string;
  /** Wounded men. */
  hurt: number;
  /** Lairs burnt, and lairs on the map. */
  lairsDown: number;
  lairs: number;
  arc: ArcStage;
}

/**
 * "Lairs n/6" once the arc has moved (a lair burnt, or the host on the march). Before that the
 * count would be a flat 0/6 for a goal no player can act on yet: lair assaults are not in the game.
 */
export function showLairs(s: HubStatus): boolean {
  return s.hasSave && s.lairs > 0 && (s.lairsDown > 0 || s.arc !== 'lairs');
}

/** The profile card's status line: the more urgent half first (hurt men before the day), then the arc. */
export function hubStatusLine(s: HubStatus): string {
  if (!s.hasSave) return t('menu.status.fresh');
  if (s.arc === 'won' || s.arc === 'post') return t('hub.status.won', { n: s.day });
  const head = s.hurt > 0 ? t('menu.status.hurt', { n: s.hurt }) : s.place ? t('menu.where.inside', { n: s.day, place: s.place }) : t('menu.where.day', { n: s.day });
  return showLairs(s) ? `${head} · ${t('hub.status.lairs', { n: s.lairsDown, total: s.lairs })}` : head;
}

/** Men with a point or a perk slot to spend: the Army tile's count badge (G11), none at 0. */
export function pendingMen(heroes: readonly { points: number; level: number; perks: readonly unknown[] }[]): number {
  return heroes.filter((h) => h.points > 0 || h.perks.length < perkSlots(h.level)).length;
}

/** Below this screen height (CSS px) the hub is compact (C-3 MENU-1: 320x640, 320x568). */
export const COMPACT_CSS_H = 700;

/** The fresco's widest and narrowest shapes (width per height), and the one-line banner of a short screen. */
export const FRESCO_TALL = 2.2;
export const FRESCO_FLAT = 3.4;
export const FRESCO_BANNER_H = 22;

/**
 * The fresco slot for a column `w` wide with `room` UI px left above the fold (MENU-1: the Army, Stash
 * and Camp tiles stay above it): as tall as the room allows between 2.2:1 and 3.4:1; else the one-line
 * banner; else none (the fresco is the last item of the C-3 hierarchy, and its tap is the primary's).
 */
export function frescoSlot(w: number, room: number): { h: number; kind: 'full' | 'banner' | 'none' } {
  if (room >= Math.round(w / FRESCO_FLAT)) return { h: Math.min(Math.round(w / FRESCO_TALL), Math.floor(room)), kind: 'full' };
  if (room >= FRESCO_BANNER_H) return { h: FRESCO_BANNER_H, kind: 'banner' };
  return { h: 0, kind: 'none' };
}
