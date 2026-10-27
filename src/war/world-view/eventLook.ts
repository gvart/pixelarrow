/**
 * W-62: how a world event looks on the world map and the region banner: its colour and the kit icon on its marker
 * (public/war/ui/icons/<px>/<icon>.png; the soul storm's unit icon is drawn as a ghost).
 */
import type { WorldEventKind } from '../world/events';

export const EVENT_LOOK: Record<WorldEventKind, { color: string; icon: string; ghost?: boolean }> = {
  bossWake: { color: '#d0503a', icon: 'act-attack' },
  caravanRush: { color: '#e0b867', icon: 'trade-wagon' },
  soulStorm: { color: '#9fd4ff', icon: 'unit-hoplite', ghost: true },
  landmarkSiege: { color: '#f08a50', icon: 'bld-ram' },
};

/** The event's icon as HTML (`px` 24 or 32). */
export const eventIcon = (kind: WorldEventKind, px = 20): string => {
  const l = EVENT_LOOK[kind];
  return `<img src="war/ui/icons/24/${l.icon}.png" srcset="war/ui/icons/24/${l.icon}@2x.png 2x" width="${px}" height="${px}" alt="" style="flex:none;${l.ghost ? 'filter:grayscale(1) brightness(1.7) drop-shadow(0 0 3px #9fd4ff);' : ''}">`;
};
