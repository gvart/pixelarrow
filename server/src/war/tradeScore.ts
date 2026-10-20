/**
 * Trade score (M6h; docs/WAR.md "Season score and anti-abuse"). M6f: no score yet; the fill hook is the seam.
 */
import type { Env } from '../env';
import type { FillHook } from './market';

export const fillHook = (_env: Env): FillHook | undefined => undefined;
