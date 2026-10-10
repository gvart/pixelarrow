import type { TARGETING_EN } from './targeting.en';

/** Russian twin of targeting.en.ts. */
export const TARGETING_RU: Record<keyof typeof TARGETING_EN, string> = {
  'target.chip.focus': 'Цель',
  'target.tip.focus': 'Стрелки бьют сначала по отмеченному отряду врага. Нажмите, чтобы снять цель: они снова стреляют по ближайшим.',
  'target.chip.advance': 'На выстрел',
  'target.tip.advance': 'Подойти на выстрел: идти, пока цель не окажется в досягаемости стрелков.',
  'target.banner.focus': 'Огонь по этому отряду',
  'target.banner.clear': 'Цель снята: огонь по ближайшим',
};
