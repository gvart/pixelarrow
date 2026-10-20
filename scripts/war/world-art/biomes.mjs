// Per-region look of the world map: one calm flat fill + a 1-step dither tone, and the PixelLab glyphs scattered on it.
// glyphs: [name, weight]; density: glyphs per 10 000 logical px²; extra: hand-placed features (see paint.mjs).
const B = (fill, alt, glyphs, density, extra = []) => ({ fill, alt, glyphs, density, extra });

export const BIOMES = {
  dodona: B('#5f7a45', '#68834e', [['pine', 3], ['oak', 1]], 2.2, ['town', 'lake:dodona']),
  'dodona-n': B('#4d5f52', '#56685b', [['pine', 3], ['mountain', 1]], 2.4),
  'dodona-w': B('#8a7462', '#937d6b', [['tor', 2], ['scrub', 2]], 1.8),
  'dodona-e': B('#6e6450', '#776d59', [['pine', 2], ['mountain', 2]], 2.4),
  'dodona-s': B('#43633a', '#4c6c43', [['oak', 4], ['pine', 1]], 2.8),
  skythia: B('#c2ad5e', '#cbb667', [['mound', 2]], 1.0, ['town']),
  'skythia-n': B('#a3a98f', '#acb298', [['tor', 1], ['scrub', 1]], 1.0),
  'skythia-e': B('#93a86c', '#9cb175', [['mound', 1], ['scrub', 1]], 1.2),
  'skythia-w': B('#857865', '#8e816e', [['pine', 2], ['mountain', 2]], 2.4),
  'skythia-s': B('#a39a56', '#aca35f', [['mound', 3]], 1.4),
  kyrene: B('#c88f58', '#d19861', [['palm', 3], ['butte', 1]], 1.8, ['town', 'pool:kyrene']),
  'kyrene-n': B('#a99060', '#b29969', [['scrub', 3], ['butte', 1]], 1.8),
  'kyrene-e': B('#cfc79a', '#d8d0a3', [['reed', 1], ['dune', 1]], 1.0, ['lagoons']),
  'kyrene-s': B('#dcb97a', '#e5c283', [['dune', 4], ['butte', 1]], 1.8),
  'kyrene-w': B('#a6ad74', '#afb67d', [['reed', 2], ['palm', 1]], 1.8),
  elaia: B('#7d8a52', '#86935b', [['olive', 4], ['cypress', 1]], 2.4, ['town']),
  'elaia-n': B('#5e7d68', '#678671', [['reed', 3]], 2.0, ['ponds']),
  'elaia-w': B('#5d6d48', '#667651', [['pine', 3], ['tor', 1]], 2.0),
  'elaia-s': B('#9a8c70', '#a39579', [['tor', 2], ['scrub', 2]], 1.6),
  'elaia-e': B('#a39a5a', '#aca363', [['vine', 3], ['olive', 1]], 2.2),
  krios: B('#d5dcdd', '#ccd3d4', [['peak', 1]], 3.0),
  siren: B('#97a097', '#a0a9a0', [['reed', 2], ['tor', 1]], 1.6),
  ammon: B('#e6e0cc', '#ddd7c3', [['butte', 1]], 0.8, ['salt-lake']),
  delta: B('#5f8a6c', '#689375', [['reed', 2]], 1.8),
  kleisoura: B('#8d8a84', '#96938d', [['peak', 1], ['mountain', 1]], 2.6, ['pass']),
  stymphalia: B('#6f9583', '#789e8c', [['reed', 1]], 1.6, ['lake:stymphalia']),
  achelous: B('#7f9a5a', '#88a363', [['reed', 2], ['oak', 1]], 1.6, ['ford']),
  ammos: B('#dcc185', '#e5ca8e', [['dune', 1]], 2.6, ['oasis']),
  moors: B('#8b8c76', '#94957f', [['tor', 2], ['scrub', 1]], 1.6),
  kimmeria: B('#b0b878', '#b9c181', [['mound', 1], ['oak', 1]], 1.4),
  savanna: B('#c9a24f', '#d2ab58', [['acacia', 3], ['butte', 1]], 1.6),
  bacchae: B('#6f7d46', '#78864f', [['cypress', 2], ['vine', 2]], 2.2),
  saddle: B('#a99f8a', '#b2a893', [['mountain', 2], ['tor', 1]], 1.6),
  erymanthos: B('#344d31', '#3d563a', [['pine', 3], ['oak', 1]], 3.4),
  gorge: B('#8d6d55', '#96765e', [['mountain', 1]], 1.4),
  canyons: B('#ad613f', '#b66a48', [['butte', 1]], 2.0),
  omphalos: B('#c4b89c', '#cdc1a5', [['tor', 1]], 0.6, ['temple', 'lake:omphalos']),
};

export const SEA = { deep: '#26303f', shelf: '#2f3d4e', wave: '#3b4b5e' };
export const COAST = '#d8c597'; // 1 logical px sand edge on the land side
export const WATER = { fill: '#4a78a0', edge: '#36608a', light: '#6b97ba' };
export const BORDER = { dark: '#251812', light: '#f0d9b5' };

// Alliance colours (kit palette): tints are translucent overlays drawn by the view, never baked into base.png.
export const ALLIANCES = {
  dodona: { name: 'Dodona', color: '#2e6c9c' },
  skythia: { name: 'Skythia', color: '#f0c050' },
  kyrene: { name: 'Kyrene', color: '#b42c22' },
  elaia: { name: 'Elaia', color: '#7d4f9e' },
};
