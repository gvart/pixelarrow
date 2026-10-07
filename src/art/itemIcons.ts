/** 16x16 item icons: weapons and trinkets drawn by hand, gear rendered with the soldiers' own 3D layers. */
import { itemDef, type Item } from '../data/items';
import { P } from './palette';
import { Pix } from './pixels';
import { renderGearIcon } from './paperdoll';

const SZ = 16;

function centerInto(src: Pix): Pix {
  let x0 = src.w, y0 = src.h, x1 = -1, y1 = -1;
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++)
      if (src.alpha(x, y) > 0) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  const out = new Pix(SZ, SZ);
  if (x1 < 0) return out;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const dx = Math.floor((SZ - w) / 2);
  const dy = Math.floor((SZ - h) / 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (src.alpha(x0 + x, y0 + y) > 0) out.set(dx + x, dy + y, src.get(x0 + x, y0 + y));
  return out;
}

const wood = (i: number) => (i % 3 === 0 ? P.wood[2] : P.wood[1]);

function weaponIcon(art: string, id: string): Pix {
  const px = new Pix(SZ, SZ);
  switch (art) {
    case 'spear':
    case 'spear_short':
    case 'lance': {
      // dory: long; longche: short; xyston: longest, iron butt-spike and a grip
      const short = art === 'spear_short';
      px.line(short ? 4 : 1, short ? 11 : 14, 10, 5, art === 'lance' ? (i: number) => (i % 4 === 0 ? P.wood[0] : P.wood[1]) : wood);
      const head = art === 'lance' ? P.iron : P.bronze;
      px.set(11, 4, head[1]);
      px.set(12, 3, head[0]);
      px.set(13, 2, head[0]);
      px.set(14, 1, head[1]);
      px.set(12, 4, head[2]);
      px.set(11, 3, head[2]);
      if (art === 'lance') {
        px.set(0, 15, P.iron[0]);
        px.set(5, 10, P.leather[1]);
        px.set(6, 9, P.leather[1]);
      } else if (!short) px.set(0, 15, P.bronze[2]);
      if (short) px.set(4, 11, P.bronze[2]);
      if (id === 'bronze_dory') {
        // bronze-shod: socket bands and a broader head
        px.set(4, 11, P.bronze[0]);
        px.set(7, 8, P.bronze[0]);
        px.set(13, 3, P.bronze[1]);
        px.set(12, 2, P.bronze[1]);
        px.set(1, 14, P.bronze[1]);
      }
      break;
    }
    case 'sword':
    case 'kopis':
    case 'longsword': {
      const len = art === 'longsword' ? 10 : 8;
      px.line(2, 13, 3, 12, P.wood[2]);
      px.line(2, 10, 5, 13, P.bronze[1]);
      for (let i = 0; i < len; i++) {
        px.set(5 + i, 10 - i, i === len - 1 ? P.iron[0] : P.iron[1]);
        px.set(5 + i, 11 - i, P.iron[2]);
      }
      if (art === 'kopis') {
        px.set(5 + len - 2, 11 - len + 3, P.iron[1]);
        px.set(5 + len - 3, 11 - len + 4, P.iron[1]);
      }
      px.set(1, 14, P.bronze[0]);
      if (id === 'falcata') {
        // Iberian: dark blued blade, hooked bird-head pommel, gold inlay
        for (let i = 0; i < len; i++) px.set(5 + i, 11 - i, P.iron[3]);
        px.set(0, 13, P.gold);
        px.set(1, 13, P.gold);
        px.set(0, 14, P.gold);
        px.set(7, 8, P.gold);
      }
      break;
    }
    case 'axe':
      px.line(2, 14, 11, 5, wood);
      px.rect(9, 1, 3, 6, P.iron[1]);
      px.vline(12, 1, 6, P.iron[0]);
      px.vline(8, 2, 5, P.iron[2]);
      break;
    case 'club':
      px.line(2, 14, 10, 6, P.wood[1]);
      px.line(3, 14, 11, 6, P.wood[2]);
      px.rect(9, 2, 5, 5, P.wood[1]);
      px.set(10, 2, P.wood[0]);
      px.set(9, 3, P.wood[0]);
      px.set(13, 6, P.wood[2]);
      px.set(11, 4, P.wood[2]);
      break;
    case 'sling': {
      // sling: linen cords and a stone; Balearic: black wool, two stones; Rhodian: a cast lead bullet
      const cord = id === 'balearic_sling' ? 0x3a2e2a : P.linen[2];
      px.line(3, 2, 7, 11, cord);
      px.line(12, 2, 9, 11, cord);
      px.rect(6, 11, 5, 3, id === 'rhodian_sling' ? P.leather[2] : P.leather[1]);
      if (id === 'rhodian_sling') {
        px.rect(7, 12, 3, 1, 0x6a7076);
        px.set(8, 11, 0x9aa0a6);
      } else px.set(8, 12, P.iron[1]);
      if (id === 'balearic_sling') {
        px.set(13, 13, P.iron[1]);
        px.set(14, 14, P.iron[2]);
      }
      px.set(3, 1, P.leather[2]);
      px.set(12, 1, P.leather[2]);
      break;
    }
    case 'bow': {
      // composite bow; Cretan: horn-backed (cream tips and grip)
      for (let y = 1; y <= 14; y++) {
        const t = (y - 1) / 13;
        px.set(4 + Math.round(5 * Math.sin(t * Math.PI)), y, P.wood[1]);
      }
      px.vline(4, 1, 14, P.linen[1]);
      px.line(5, 8, 14, 8, P.wood[0]);
      px.set(14, 7, P.iron[0]);
      px.set(14, 9, P.iron[0]);
      if (id === 'cretan_bow') {
        for (const y of [1, 2, 13, 14]) px.set(4 + Math.round(5 * Math.sin(((y - 1) / 13) * Math.PI)), y, 0xe6dcc4);
        px.set(9, 7, 0xe6dcc4);
        px.set(9, 9, 0xe6dcc4);
      }
      break;
    }
    case 'bow_short':
      // Scythian recurve: short, double-curved, tips bent forward
      for (let y = 3; y <= 12; y++) {
        const t = (y - 3) / 9;
        px.set(5 + Math.round(3 * Math.sin(t * Math.PI) - (Math.abs(t - 0.5) < 0.12 ? 1 : 0)), y, P.wood[1]);
      }
      px.set(6, 2, P.wood[2]);
      px.set(7, 1, P.wood[2]);
      px.set(6, 13, P.wood[2]);
      px.set(7, 14, P.wood[2]);
      px.vline(5, 3, 12, P.linen[1]);
      px.line(6, 8, 14, 8, P.wood[0]);
      px.set(14, 7, P.iron[0]);
      px.set(14, 9, P.iron[0]);
      px.set(6, 8, 0xa83224);
      break;
    case 'falx':
    case 'rhomphaia': {
      // a long haft and a curved (falx) or straight (rhomphaia) blade
      px.line(1, 15, 7, 9, P.wood[2]);
      px.line(2, 15, 8, 9, P.wood[1]);
      if (art === 'falx') {
        for (let i = 0; i < 6; i++) px.set(8 + i, 8 - i + (i > 3 ? (i - 3) : 0), P.iron[i === 5 ? 0 : 1]);
        px.set(14, 5, P.iron[1]);
        px.set(14, 6, P.iron[2]);
      } else {
        for (let i = 0; i < 7; i++) {
          px.set(8 + i, 8 - i, P.iron[1]);
          px.set(9 + i, 8 - i, P.iron[2]);
        }
        px.set(15, 1, P.iron[0]);
      }
      break;
    }
    case 'javelins': {
      // akontia: wooden shafts with a thong loop; saunia: all-iron, barbed
      const iron = id === 'saunion';
      for (const o of [0, 3]) {
        px.line(1 + o, 14, 11 + o, 4, iron ? (i: number) => (i % 2 ? P.iron[2] : P.iron[1]) : wood);
        px.set(12 + o, 3, P.iron[1]);
        px.set(13 + o, 2, P.iron[0]);
        if (iron) px.set(11 + o, 3, P.iron[0]);
      }
      if (!iron) {
        px.set(5, 9, P.leather[0]);
        px.set(8, 9, P.leather[0]);
      }
      break;
    }
  }
  return px;
}

function trinketIcon(id: string): Pix {
  const px = new Pix(SZ, SZ);
  // cord
  px.line(3, 1, 7, 6, P.leather[1]);
  px.line(12, 1, 8, 6, P.leather[1]);
  switch (id) {
    case 'owl_amulet':
      px.ellipse(4, 6, 8, 8, (_x, _y, e) => (e ? P.bronze[2] : P.bronze[1]));
      px.set(6, 9, P.outline);
      px.set(9, 9, P.outline);
      px.set(7, 11, P.bronze[0]);
      px.set(8, 11, P.bronze[0]);
      break;
    case 'herakles_knot':
      px.ellipse(3, 7, 6, 6, (_x, _y, e) => (e ? P.gold : null));
      px.ellipse(7, 7, 6, 6, (_x, _y, e) => (e ? P.goldDark : null));
      px.rect(7, 9, 2, 2, 0xa83224);
      break;
    case 'scarab':
      px.ellipse(4, 6, 8, 9, (_x, _y, e, u) => (e ? 0x2e6a6a : u < 0 ? 0x5aa8a0 : 0x3e8a84));
      px.vline(8, 7, 13, 0x245050);
      break;
    case 'laurel':
      for (let i = 0; i < 6; i++) {
        px.set(3 + i, 8 + Math.abs(3 - i), 0x5f7a45);
        px.set(12 - i, 8 + Math.abs(3 - i), 0x5f7a45);
        px.set(3 + i, 7 + Math.abs(3 - i), 0x7f9a5e);
        px.set(12 - i, 7 + Math.abs(3 - i), 0x7f9a5e);
      }
      break;
    case 'tanit_eye':
      px.ellipse(3, 7, 10, 6, (_x, _y, e) => (e ? 0x2b4a6a : 0xe6dcc4));
      px.rect(7, 9, 2, 2, 0x2b4a6a);
      break;
    case 'boar_tusk':
      px.line(5, 6, 6, 13, 0xe6dcc4);
      px.line(6, 6, 7, 12, 0xd2c4a4);
      px.line(7, 13, 10, 12, 0xe6dcc4);
      break;
    default:
      px.ellipse(5, 7, 6, 6, () => P.gold);
  }
  return px;
}

/** Marks that tell apart gear sharing one 3D model (same art key). */
function gearDetail(px: Pix, id: string): void {
  // opaque bounds
  let x0 = SZ, y0 = SZ, x1 = -1, y1 = -1;
  for (let y = 0; y < SZ; y++)
    for (let x = 0; x < SZ; x++)
      if (px.alpha(x, y) > 0) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  if (x1 < 0) return;
  const cx = Math.round((x0 + x1) / 2);
  const cy = Math.round((y0 + y1) / 2);
  switch (id) {
    case 'aspis':
      // Argive masterwork: a gilded rim
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          if (px.alpha(x, y) === 0) continue;
          const edge = px.alpha(x - 1, y) === 0 || px.alpha(x + 1, y) === 0 || px.alpha(x, y - 1) === 0 || px.alpha(x, y + 1) === 0;
          if (edge) px.set(x, y, P.gold);
        }
      break;
    case 'celtic_shield':
      // the spina: a vertical rib with a round boss
      for (let y = y0 + 2; y <= y1 - 2; y++) px.set(cx, y, P.wood[2]);
      px.rect(cx - 1, cy - 1, 3, 3, P.iron[1]);
      px.set(cx, cy, P.iron[0]);
      break;
    case 'thureos':
      // a horizontal iron boss strip
      px.rect(cx - 2, cy, 5, 1, P.iron[1]);
      break;
  }
}

export function renderItemIcon(item: Item): Pix {
  const def = itemDef(item.def);
  let px: Pix;
  if (def.slot === 'weapon') px = weaponIcon(def.art, def.id);
  else if (def.slot === 'trinket') px = trinketIcon(def.id);
  else {
    const paint = item.def === 'argyraspis' ? { ...(item.paint ?? {}), field: 'silver' } : item.paint;
    px = centerInto(renderGearIcon(def.slot as 'helmet' | 'shield' | 'armor', def.art, paint));
    gearDetail(px, def.id);
    return px;
  }
  px.outline(P.outline);
  return px;
}

export function itemIconKey(item: Item): string {
  const p = item.paint;
  return `item_${item.def}_${p?.emblem ?? ''}${p?.field ?? ''}${p?.ink ?? ''}`;
}
