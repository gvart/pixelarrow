/**
 * Icons only the duel hub needs (the kit has no trophy, chest, lock or pen):
 * painted in the kit's smooth icon style (src/art/iconStyle.ts) and
 * registered under the kit's texture names (`icon_`, `iconL_`, `iconD_`), so
 * `addIcon` and `Button({ icon })` use them like any other icon.
 */
import Phaser from 'phaser';
import { panelK, ICON_PX } from '../../ui/kit';
import { paintIcon, type IconPart, type IconLook } from '../../art/iconStyle';

export const DUEL_ICONS: Record<string, IconPart[]> = {
  trophy: [
    { d: 'M6.2 5H3.4V7.6C3.4 9.9 5 11.4 7.3 11.6L7 9.8C5.9 9.6 5.2 8.8 5.2 7.6V6.8H6.2Z', tone: 'gold' },
    { d: 'M17.8 5H20.6V7.6C20.6 9.9 19 11.4 16.7 11.6L17 9.8C18.1 9.6 18.8 8.8 18.8 7.6V6.8H17.8Z', tone: 'gold' },
    { d: 'M6 2.8H18V8.4C18 11.9 15.4 14.4 12 14.4C8.6 14.4 6 11.9 6 8.4Z', tone: 'gold' },
    { d: 'M10.7 14H13.3V17.6H10.7Z', tone: 'gold' },
    { d: 'M7.4 17.4H16.6V21.2H7.4Z', tone: 'wood' },
    { d: 'M8.4 4.6L8.4 9', tone: 'gleam', detail: true, w: 1 },
  ],
  chest: [
    { d: 'M2.8 10.2H21.2V20.8H2.8Z', tone: 'wood' },
    { d: 'M2.8 10.2V7.6C2.8 5.4 4.4 3.8 6.6 3.8H17.4C19.6 3.8 21.2 5.4 21.2 7.6V10.2Z', tone: 'wood' },
    { d: 'M2.8 9.4H21.2V11.2H2.8Z', tone: 'bronze' },
    { d: 'M6.2 3.9H8.2V20.8H6.2Z', tone: 'bronze' },
    { d: 'M15.8 3.9H17.8V20.8H15.8Z', tone: 'bronze' },
    { d: 'M10.4 8.6H13.6V14.2H10.4Z', tone: 'gold' },
    { d: 'M12 11.2L12 12.8', tone: 'ink', detail: true, w: 1 },
  ],
  lock: [
    { d: 'M7.2 11V7.6A4.8 4.8 0 0 1 16.8 7.6V11H14.6V7.6A2.6 2.6 0 0 0 9.4 7.6V11Z', tone: 'steel' },
    { d: 'M4.8 10.4H19.2V21.2H4.8Z', tone: 'bronze' },
    { d: 'M12 13.8L12 17.6', tone: 'ink', detail: true, w: 1.8 },
  ],
  pen: [
    { d: 'M3.6 20.4L4.8 15.4L15.6 4.6L19.4 8.4L8.6 19.2Z', tone: 'wood' },
    { d: 'M3.6 20.4L4.8 15.4L8.6 19.2Z', tone: 'ivory' },
    { d: 'M15.6 4.6L17.6 2.6L21.4 6.4L19.4 8.4Z', tone: 'red' },
    { d: 'M6.6 15.6L15.8 6.4', tone: 'gleam', detail: true, w: 0.9 },
  ],
  copy: [
    { d: 'M8.4 2.6H19.6V15.8H8.4Z', tone: 'stone' },
    { d: 'M4.4 8.2H15.6V21.4H4.4Z', tone: 'ivory' },
    { d: 'M7 12H13M7 15H13M7 18H11', tone: 'ink', detail: true, w: 0.9 },
  ],
  bin: [
    { d: 'M9.4 2.6H14.6V5H9.4Z', tone: 'iron' },
    { d: 'M3.8 4.8H20.2V7.6H3.8Z', tone: 'iron' },
    { d: 'M5.4 8.6H18.6L17.2 21.4H6.8Z', tone: 'iron' },
    { d: 'M9.4 11V18.8M12 11V18.8M14.6 11V18.8', tone: 'ink', detail: true, w: 1 },
  ],
};

const LOOKS: [string, IconLook][] = [
  ['icon_', 'full'],
  ['iconL_', 'light'],
  ['iconD_', 'dim'],
];

/** Registers the duel icons once per game (no-op when they exist). */
export function ensureDuelIcons(scene: Phaser.Scene): void {
  if (scene.textures.exists('icon_trophy')) return;
  const K = panelK(scene);
  for (const [name, parts] of Object.entries(DUEL_ICONS)) {
    for (const [prefix, look] of LOOKS) {
      const key = `${prefix}${name}`;
      if (scene.textures.exists(key)) continue;
      scene.textures.addCanvas(key, paintIcon(name, parts, look, ICON_PX * K))?.setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
  }
}
