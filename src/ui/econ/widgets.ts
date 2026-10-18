/**
 * Shared bits of the economy screens: the Drachma icon, the purse strip,
 * goods and cosmetic textures, reward names and the "available in Telegram /
 * offline / closed" states (built on the kit's empty state).
 */
import Phaser from 'phaser';
import { addIcon, registerUiAssets, scaleIcon } from '../kit';
import { subjectName } from '../widgets';
import { addParchmentEmpty } from '../mosaic/EmptyState';
import { mosaicImage, mtext, mw, wrapWords } from '../mosaic/base';
import { TEXT_MIN, lineHeight } from '../tokens';
import type { CosmeticInfo, EconomyCatalog, PassReward } from '../../platform/api';
import type { EconState } from '../../game/economy';
import { t, tOr } from '../../i18n';
import type { UiScene } from '../mosaic/subShell';
import { addSignInGate, gateForScene, showsSignInGate } from '../account/gate';

/**
 * Makes sure the 'drachma' kit icon (icon_drachma, iconL_, iconD_) exists: it
 * is one of the smooth UI icons (src/art/vectorIcons.ts), registered with the
 * rest of the kit's assets.
 */
export function ensureEconIcons(scene: Phaser.Scene): void {
  if (scene.textures.exists('icon_drachma')) return;
  registerUiAssets(scene);
}

export const currencyIcon = (c: 'gold' | 'drachmae'): string => (c === 'gold' ? 'wargold' : 'drachma');

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

/**
 * The unavailable states as an empty state with a Retry action (not outside Telegram), or the loading line, on a
 * parchment well. `rowW` (landscape panes, landscape-v6 §15): the state as one band that wide, centred in the well.
 */
export function addEconState(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, w: number, h: number, s: EconState | 'loading', onRetry: () => void, rowW?: number): void {
  parent.add(mosaicImage(scene, x, y, w, h, 'parchmentWell'));
  if (s === 'loading') {
    const tx = mtext(scene, x + w / 2, y + h / 2 - 4, t('econ.loading'), 'pSec', { align: 0.5, maxW: w - 8 });
    parent.add(tx);
    scene.tweens.add({ targets: tx, alpha: { from: 1, to: 0.35 }, duration: 500, yoyo: true, repeat: -1 });
    return;
  }
  // the web with no session: AU-01 Sign in to play online (V6-ACCT-07), never "outside Telegram"
  if (s === 'outside' && showsSignInGate()) {
    const sc = scene as UiScene;
    addSignInGate(sc, parent, x, y, w, h, gateForScene(scene.sys.settings.key), () => scene.scene.restart(scene.sys.settings.data));
    return;
  }
  const title = s === 'outside' ? t('econ.outside') : s === 'offline' ? t('econ.offline') : s === 'closed' ? t('econ.closed') : t('econ.error');
  const hint = s === 'outside' ? t('econ.outsideHint') : s === 'offline' ? t('econ.offlineHint') : s === 'closed' ? t('econ.closedHint') : t('econ.offlineHint');
  if (rowW) {
    const bw = Math.min(w - 8, rowW);
    const bh = Math.min(h - 8, 64);
    const bx = x + Math.round((w - bw) / 2);
    const by = y + Math.round((h - bh) / 2);
    parent.add(mosaicImage(scene, bx, by, bw, bh, 'parchment'));
    parent.add(addParchmentEmpty(scene, bx, by, bw, bh, { row: true, icon: s === 'outside' ? 'flag' : 'tent', title, hint, action: s === 'outside' ? undefined : { label: t('econ.retry'), icon: 'repair', onClick: onRetry } }));
    return;
  }
  parent.add(addParchmentEmpty(scene, x + 2, y + 2, w - 4, h - 4, { icon: s === 'outside' ? 'flag' : 'tent', title, hint, action: s === 'outside' ? undefined : { label: t('econ.retry'), icon: 'repair', onClick: onRetry } }));
}

/**
 * AU-20, the wallet where the platform has no payment provider yet (the web): a parchment
 * well with the shop icon, a title and the reason (design/ux/accounts-v6.md §11.2). It has
 * no button: nothing can be done here. Lays out to the width given; returns its height.
 */
export function addComingSoon(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, w: number, o: { title: string; body: string }): number {
  const tx = 24;
  const tw = w - tx - 6;
  const tLh = Math.ceil(lineHeight(7.5));
  const bLh = Math.ceil(lineHeight(TEXT_MIN));
  const title = wrapWords(o.title, tw, (s) => mw(s, 'rInk', 7.5));
  const body = wrapWords(o.body, tw, (s) => mw(s, 'pSec', TEXT_MIN));
  const h = 6 + title.length * tLh + 3 + body.length * bLh + 6;
  const c = scene.add.container(Math.round(x), Math.round(y));
  parent.add(c);
  c.add(mosaicImage(scene, 0, 0, w, h, 'parchmentWell'));
  c.add(scaleIcon(addIcon(scene, 6, 7, 'shop', 'D'), 1.2));
  const frame = { owner: c, w, h };
  title.forEach((l, i) => c.add(mtext(scene, tx, 6 + i * tLh, l, 'rInk', { size: 7.5, box: frame })));
  const by = 6 + title.length * tLh + 3;
  body.forEach((l, i) => c.add(mtext(scene, tx, by + i * bLh, l, 'pSec', { size: TEXT_MIN, box: frame })));
  return h;
}
