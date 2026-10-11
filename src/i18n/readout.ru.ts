import type { READOUT_EN } from './readout.en';

/** Russian twin of readout.en.ts. */
export const READOUT_RU: Record<keyof typeof READOUT_EN, string> = {
  'readout.bar.h': 'З',
  'readout.bar.m': 'Д',
  'readout.flanked': 'Обошли!',
  'readout.tip.steady': 'Боевой дух: твёрд (целый щит).',
  'readout.tip.wavering': 'Боевой дух: дрогнули (треснувший щит). Треть воинов пала духом.',
  'readout.tip.routing': 'Боевой дух: бегут (падающее знамя). Отряд обращён в бегство.',
  'readout.tip.bars': 'Полосы: {hp} здоровье, {mor} боевой дух.',
  'readout.tip.standard': 'Несёт штандарт (знамя).',
};
