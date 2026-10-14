/**
 * The global floor (design/ux/landscape-v6.md §1, §3.6; V6-020): below 320 CSS px of height not
 * even a 22-UI top row plus five 26-UI rail keys fit, so the game shows the `RotateCard` instead
 * of a layout. It is a size rule, never a scene's choice; every matrix size is above it.
 */
import type { Lang } from '../../../i18n';

/** The floor: a window under this many CSS px tall shows the rotate card. */
export const FLOOR_MIN_H = 320;

/** Is a W x H CSS px safe area below the floor? */
export function belowFloor(_cssW: number, cssH: number): boolean {
  return cssH < FLOOR_MIN_H;
}

/**
 * The card's one line (§15: the only new string of the spec). Kept here, not in the shared i18n
 * tables, so the primitive owns it; a test pins both languages.
 */
const TEXT: Record<Lang, string> = {
  en: 'Turn your phone or make the window taller',
  ru: 'Поверните телефон или сделайте окно выше',
};

export function rotateCardText(l: Lang): string {
  return TEXT[l];
}
