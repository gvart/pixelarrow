/**
 * Shared bits of the economy screens: the Drachma icon, the purse strip,
 * goods and cosmetic textures, reward names and the "available in Telegram /
 * offline / closed" states (built on the kit's empty state).
 */
import Phaser from 'phaser';
import { addIcon, addPanel, addText, registerUiAssets } from '../kit';
import { addEmptyState, subjectName } from '../widgets';
import { ellipsize, measureText } from '../textfit';
import type { CosmeticInfo, EconomyCatalog, PassReward } from '../../platform/api';
import type { EconState } from '../../game/economy';
import { t, tOr } from '../../i18n';

/**
 * Makes sure the 'drachma' kit icon (icon_drachma, iconL_, iconD_) exists: it
 * is one of the smooth UI icons (src/art/vectorIcons.ts), registered with the
 * rest of the kit's assets.
 */
export function ensureEconIcons(scene: Phaser.Scene): void {
  if (scene.textures.exists('icon_drachma')) return;
  registerUiAssets(scene);
}

export const currencyIcon = (c: 'gold' | 'drachmae'): string => (c === 'gold' ? 'coin' : 'drachma');

export { addCosmetic, addGoodsIcon, cosmeticTexture, fitCosmetic, fitGoodsIcon, goodsTexture } from './textures';

export function cosmeticName(c: Pick<CosmeticInfo, 'id' | 'name'>): string {
  return tOr(`cosmetic.${c.id}`, c.name);
}

/** "40 gold", "15 Drachmae", "1x Morale wine", "Season victor emblem". */
export function rewardName(r: PassReward, cat: EconomyCatalog | null): string {
  if (r.kind === 'gold') return t('pass.reward.gold', { n: r.amount });
  if (r.kind === 'drachmae') return t('pass.reward.drachmae', { n: r.amount });
  if (r.kind === 'consumable') return t('pass.reward.consumable', { n: r.qty, name: subjectName({ consumable: r.id }) });
  const c = cat?.cosmetics.find((x) => x.id === r.id);
  return t('pass.reward.cosmetic', { name: c ? cosmeticName(c) : r.id });
}

/** Price text with its currency: "80 gold" / "15 Dr". */
export function priceText(n: number, c: 'gold' | 'drachmae'): string {
  return c === 'gold' ? t('econ.gold', { n }) : t('econ.dr', { n });
}

export interface Purse {
  drachmae: number | null;
  gold: number | null;
}

/**
 * The purse in a top bar, right-aligned at x: Drachmae (and season gold when
 * known), each with its icon. Returns the width used.
 */
export function addPurse(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, p: Purse, maxW: number): number {
  ensureEconIcons(scene);
  const parts: [string, string][] = [];
  if (p.gold !== null) parts.push(['coin', `${p.gold}`]);
  parts.push(['drachma', p.drachmae === null ? '-' : `${p.drachmae}`]);
  let cx = x;
  let used = 0;
  for (const [icon, txt] of parts.reverse()) {
    const w = measureText(txt) + 14;
    if (used + w > maxW) break;
    const tx = addText(scene, cx, y + 2, txt, 'ink', 1);
    parent.add(tx);
    parent.add(addIcon(scene, cx - tx.width - 13, y, icon));
    cx -= w + 4;
    used += w + 4;
  }
  return used;
}

/** The unavailable states as an empty state with a Retry action (not outside Telegram). */
export function addEconState(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, w: number, h: number, s: EconState | 'loading', onRetry: () => void): void {
  if (s === 'loading') {
    parent.add(addPanel(scene, x, y, w, h, 'cardLocked'));
    const tx = addText(scene, x + w / 2, y + h / 2 - 4, ellipsize(t('econ.loading'), w - 8), 'sec', 0.5);
    parent.add(tx);
    scene.tweens.add({ targets: tx, alpha: { from: 1, to: 0.35 }, duration: 500, yoyo: true, repeat: -1 });
    return;
  }
  const title = s === 'outside' ? t('econ.outside') : s === 'offline' ? t('econ.offline') : s === 'closed' ? t('econ.closed') : t('econ.error');
  const hint = s === 'outside' ? t('econ.outsideHint') : s === 'offline' ? t('econ.offlineHint') : s === 'closed' ? t('econ.closedHint') : t('econ.offlineHint');
  parent.add(addPanel(scene, x, y, w, h, 'cardLocked'));
  parent.add(addEmptyState(scene, x + 2, y + 2, w - 4, h - 4, { icon: s === 'outside' ? 'flag' : 'tent', title, hint, action: s === 'outside' ? undefined : { label: t('econ.retry'), icon: 'repair', onClick: onRetry } }));
}

/** Short human time for wallet history: "3d", "5h", "now". */
export function ago(at: number, now: number): string {
  const m = Math.max(0, Math.round((now - at) / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}
