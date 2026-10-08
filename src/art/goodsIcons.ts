/**
 * 16x16 icons for consumables (src/data/consumables.ts) and resources /
 * currencies (src/online/rules.ts RESOURCE_KEYS, plus Drachmae). Same style as
 * the item icons (src/art/itemIcons.ts): flat pixel shapes, 1 px dark outline.
 */
import { P } from './palette';
import { Pix } from './pixels';

const SZ = 16;
export type GoodsKind = 'consumable' | 'resource';
export const CONSUMABLE_ICON_IDS = ['healing_salve', 'morale_wine', 'war_horn', 'sharpening_stone', 'march_rations'] as const;
export const RESOURCE_ICON_IDS = ['gold', 'food', 'wood', 'bronze', 'recruits', 'drachmae'] as const;

function coin(px: Pix, x: number, y: number, face: number, rim: number, mark: number): void {
  px.ellipse(x, y, 7, 7, (_x, _y, e) => (e ? rim : face));
  px.set(x + 3, y + 3, mark);
  px.set(x + 2, y + 2, 0xffffff, 120);
}

function consumable(id: string): Pix {
  const px = new Pix(SZ, SZ);
  switch (id) {
    case 'healing_salve':
      // squat clay jar with a green balm and a linen tie
      px.ellipse(3, 6, 10, 9, (_x, _y, e, u) => (e ? P.leather[2] : u < -0.2 ? P.leather[0] : P.leather[1]));
      px.rect(5, 3, 6, 3, P.linen[1]);
      px.hline(5, 10, 5, P.linen[2]);
      px.rect(6, 4, 4, 1, 0x6fae5a);
      px.set(7, 9, 0x8fce6a);
      px.set(8, 10, 0x6fae5a);
      break;
    case 'morale_wine':
      // red-figure amphora with two handles
      px.ellipse(4, 4, 8, 10, (_x, _y, e, u) => (e ? 0x6e2a18 : u < -0.3 ? 0xc0603a : 0xa04a2c));
      px.rect(7, 1, 2, 3, 0xa04a2c);
      px.hline(6, 9, 1, 0x6e2a18);
      px.vline(3, 4, 7, 0x6e2a18);
      px.vline(12, 4, 7, 0x6e2a18);
      px.hline(5, 10, 8, P.outline);
      px.set(7, 14, 0x6e2a18);
      px.set(8, 14, 0x6e2a18);
      break;
    case 'war_horn':
      // curved bronze horn with a leather strap
      for (let i = 0; i < 11; i++) {
        const x = 2 + i;
        const y = 12 - Math.round(Math.sin((i / 10) * Math.PI * 0.8) * 7);
        const r = Math.round(i / 4);
        for (let k = -r; k <= r; k++) px.set(x, y + k, k < 0 ? P.bronze[0] : P.bronze[1]);
      }
      px.vline(13, 2, 9, P.bronze[2]);
      px.line(4, 12, 11, 8, P.leather[2]);
      break;
    case 'sharpening_stone':
      // grey whetstone bar with a spark
      px.rect(2, 8, 11, 4, P.iron[2]);
      px.hline(2, 12, 8, P.iron[1]);
      px.hline(3, 11, 9, P.iron[1]);
      px.hline(2, 12, 11, P.iron[3]);
      px.set(12, 5, P.gold);
      px.set(13, 4, 0xfff0a0);
      px.set(11, 4, P.gold);
      px.set(13, 6, P.gold);
      break;
    case 'march_rations':
      // bread loaf on a cloth sack
      px.rect(2, 7, 12, 7, P.linen[2]);
      px.hline(2, 13, 7, P.linen[1]);
      px.ellipse(4, 3, 9, 6, (_x, _y, e, _u, v) => (e ? 0x7a4a22 : v < -0.2 ? 0xd8a060 : 0xb8803e));
      px.set(6, 5, 0x7a4a22);
      px.set(8, 4, 0x7a4a22);
      px.set(10, 5, 0x7a4a22);
      break;
    default:
      px.ellipse(4, 4, 8, 8, () => P.parchDark);
  }
  px.outline(P.outline);
  return px;
}

function resource(id: string): Pix {
  const px = new Pix(SZ, SZ);
  switch (id) {
    case 'gold':
      coin(px, 1, 7, P.gold, P.goldDark, P.goldDark);
      coin(px, 7, 7, P.gold, P.goldDark, P.goldDark);
      coin(px, 4, 2, 0xf0d070, P.goldDark, P.goldDark);
      break;
    case 'drachmae':
      // silver tetradrachm with Athena's owl
      px.ellipse(2, 2, 12, 12, (_x, _y, e, u, v) => (e ? 0x6a7076 : u + v < -0.6 ? 0xe8ecee : 0xc4c8cc));
      px.rect(6, 5, 4, 5, 0x7a8086);
      px.set(6, 6, 0xffffff);
      px.set(9, 6, 0xffffff);
      px.set(7, 10, 0x6a7076);
      px.set(8, 10, 0x6a7076);
      break;
    case 'food':
      // wheat sheaf
      for (const dx of [-3, 0, 3]) {
        px.line(8 + dx / 3, 14, 8 + dx, 5, 0x9a8a3e);
        for (let k = 0; k < 4; k++) {
          px.set(8 + dx - 1, 2 + k * 1.5, P.gold);
          px.set(8 + dx + 1, 2.5 + k * 1.5, 0xc8a048);
        }
      }
      px.hline(6, 10, 10, P.leather[1]);
      break;
    case 'wood':
      // two stacked logs
      for (const [y, x] of [[8, 1], [3, 4]]) {
        px.rect(x, y, 10, 5, P.wood[1]);
        px.hline(x, x + 9, y, P.wood[0]);
        px.hline(x, x + 9, y + 4, P.wood[2]);
        px.ellipse(x + 8, y, 4, 5, (_x, _y, e) => (e ? P.wood[2] : 0xc8a070));
      }
      break;
    case 'bronze':
      // trapezoid ingot
      for (let y = 0; y < 6; y++) px.hline(3 - Math.floor(y / 2), 12 + Math.floor(y / 2), 6 + y, y === 0 ? P.bronze[0] : y < 3 ? P.bronze[1] : P.bronze[2]);
      px.hline(4, 11, 5, P.bronze[0]);
      px.set(6, 7, 0xffffff, 140);
      break;
    case 'recruits':
      // a crested helmeted head
      px.ellipse(4, 4, 8, 9, (_x, _y, e, u) => (e ? P.bronze[2] : u < -0.2 ? P.bronze[0] : P.bronze[1]));
      px.rect(6, 8, 4, 4, P.skin[1][1]);
      px.vline(7, 8, 12, P.bronze[2]);
      px.rect(5, 1, 6, 3, P.crest.red);
      px.hline(5, 10, 1, 0xc84a34);
      px.rect(5, 13, 6, 2, P.tunicRed[1]);
      break;
    default:
      px.ellipse(4, 4, 8, 8, () => P.parchDark);
  }
  px.outline(P.outline);
  return px;
}

export function renderGoodsIcon(kind: GoodsKind, id: string): Pix {
  return kind === 'consumable' ? consumable(id) : resource(id);
}

export function goodsIconKey(kind: GoodsKind, id: string): string {
  return `goods_${kind}_${id}`;
}
