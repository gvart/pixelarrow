/**
 * Procedural layered "paper-doll" soldier generator.
 *
 * SHEET FORMAT (also what a hand-drawn replacement must follow):
 *   - Frame size FW x FH = 32 x 40 px. Feet baseline at y = 37, body centred on x = 15/16.
 *   - 13 columns (frames): idle0 idle1 walk0..walk3 atk0 atk1 atk2 hit die0 die1 die2.
 *   - 2 rows (directions): row 0 = facing down-right (3/4 front), row 1 = facing up-right (3/4 back).
 *     Left-facing directions are produced by mirroring horizontally at render time.
 *   - Layers are composited back-to-front: legs, tunic, body armour, head/hair/beard, helmet,
 *     [back view: side-carried shield, painted face out], arm, [front view: shield], then a
 *     1px outline, then the weapon. In the iso battle view row 0 + mirror gives the two
 *     downward diagonal facings and row 1 + mirror the two upward ones.
 *   - Each layer is keyed by an `art` id from src/data/items.ts (e.g. 'hoplon', 'corinthian',
 *     'linothorax', 'spear'). To use hand-drawn art, provide a PNG per layer in this same
 *     13x2 frame grid and composite them in the same order instead of calling the draw* functions.
 *   - Colours come from src/art/palette.ts; tunic/skin/hair/crest/shield paint are looked up per hero.
 */
import { P, tunicRamp } from './palette';
import { Pix } from './pixels';
import { EMBLEM_BITMAPS } from './emblems';
import type { Look } from '../data/units';
import { itemDef, type Item, type ItemPaint } from '../data/items';
import type { Hero } from '../data/units';

export const FW = 32;
export const FH = 40;
export const FRAME_NAMES = ['idle0', 'idle1', 'walk0', 'walk1', 'walk2', 'walk3', 'atk0', 'atk1', 'atk2', 'hit', 'die0', 'die1', 'die2'] as const;
export const NFRAMES = FRAME_NAMES.length;
export const ANIM_FRAMES = {
  idle: [0, 1],
  walk: [2, 3, 4, 5],
  attack: [6, 7, 8],
  hit: [9],
  die: [10, 11, 12],
} as const;
const AY = 37; // feet baseline

export interface DollSpec {
  look: Look;
  weapon?: string; // art key
  shield?: { art: string; paint?: ItemPaint };
  helmet?: { art: string; paint?: ItemPaint };
  armor?: string;
}

export function dollFromHero(h: Pick<Hero, 'look' | 'equip'>): DollSpec {
  const art = (it?: Item) => (it ? itemDef(it.def).art : undefined);
  const twoHanded = h.equip.weapon ? !!itemDef(h.equip.weapon.def).twoHanded : false;
  return {
    look: h.look,
    weapon: art(h.equip.weapon),
    shield: h.equip.shield && !twoHanded ? { art: art(h.equip.shield)!, paint: h.equip.shield.paint } : undefined,
    helmet: h.equip.helmet ? { art: art(h.equip.helmet)!, paint: h.equip.helmet.paint } : undefined,
    armor: art(h.equip.armor),
  };
}

export function dollKey(d: DollSpec): string {
  const l = d.look;
  const p = (x?: ItemPaint) => (x ? `${x.emblem ?? ''}.${x.field ?? ''}.${x.ink ?? ''}` : '');
  return `doll_${l.skin}${l.hair}${l.hairStyle}${l.beard}${l.tunic}_${d.weapon ?? '-'}_${d.shield?.art ?? '-'}${p(d.shield?.paint)}_${d.helmet?.art ?? '-'}${p(d.helmet?.paint)}_${d.armor ?? '-'}`;
}

type ArmPose = 'rest' | 'raise' | 'strike' | 'recover';

interface Pose {
  bob: number; // upper body down offset
  lean: number; // upper body x offset
  feet: [number, number]; // x offsets of back/front foot
  lift: [number, number]; // lifted feet
  arm: ArmPose;
  shieldUp: number;
  kneel: number;
  noWeapon?: boolean;
}

const POSES: Pose[] = [
  { bob: 0, lean: 0, feet: [0, 0], lift: [0, 0], arm: 'rest', shieldUp: 0, kneel: 0 },
  { bob: 1, lean: 0, feet: [0, 0], lift: [0, 0], arm: 'rest', shieldUp: 0, kneel: 0 },
  { bob: 0, lean: 0, feet: [-1, 1], lift: [0, 0], arm: 'rest', shieldUp: 0, kneel: 0 },
  { bob: 1, lean: 0, feet: [0, 0], lift: [0, 1], arm: 'rest', shieldUp: 0, kneel: 0 },
  { bob: 0, lean: 0, feet: [1, -1], lift: [0, 0], arm: 'rest', shieldUp: 0, kneel: 0 },
  { bob: 1, lean: 0, feet: [0, 0], lift: [1, 0], arm: 'rest', shieldUp: 0, kneel: 0 },
  { bob: 0, lean: -1, feet: [-1, 0], lift: [0, 0], arm: 'raise', shieldUp: 1, kneel: 0 },
  { bob: 0, lean: 1, feet: [-1, 1], lift: [0, 0], arm: 'strike', shieldUp: 0, kneel: 0 },
  { bob: 0, lean: 0, feet: [0, 0], lift: [0, 0], arm: 'recover', shieldUp: 0, kneel: 0 },
  { bob: 0, lean: -1, feet: [0, 0], lift: [0, 0], arm: 'rest', shieldUp: 2, kneel: 0 },
  { bob: 3, lean: -1, feet: [0, 0], lift: [0, 0], arm: 'rest', shieldUp: 0, kneel: 3, noWeapon: false },
  { bob: 6, lean: -3, feet: [0, 0], lift: [0, 0], arm: 'rest', shieldUp: 0, kneel: 6, noWeapon: true },
  { bob: 0, lean: 0, feet: [0, 0], lift: [0, 0], arm: 'rest', shieldUp: 0, kneel: 0, noWeapon: true },
];

const ranged = (w?: string) => w === 'sling' || w === 'bow' || w === 'javelins';

/** Render the full sprite sheet (13 frames x 2 directions). */
export function renderSheet(d: DollSpec): Pix {
  const sheet = new Pix(FW * NFRAMES, FH * 2);
  for (let dir = 0; dir < 2; dir++) {
    for (let f = 0; f < NFRAMES; f++) {
      const frame = f === 12 ? renderLying(d, dir) : renderFrame(d, f, dir);
      sheet.blit(frame, f * FW, dir * FH);
    }
  }
  return sheet;
}

export function renderFrame(d: DollSpec, frameIdx: number, dir: number): Pix {
  const pose = POSES[frameIdx];
  const px = new Pix(FW, FH);
  const ux = pose.lean;
  const uy = pose.bob;
  const back = dir === 1;
  const bow = d.weapon === 'bow';

  drawLegs(px, d, pose, back);
  drawTorso(px, d, ux, uy, back);
  drawHead(px, d.look, ux, uy, back);
  if (d.helmet) drawHelmet(px, d.helmet, ux, uy, back);
  // Seen from behind, the shield is carried on the left side, angled out, so
  // its painted face (and emblem) stays visible to the viewer.
  if (back && d.shield) drawShieldSide(px, d.shield, ux, uy - pose.shieldUp);
  const armAfterShield = pose.arm === 'raise' || pose.arm === 'strike';
  const hand = handPos(d.weapon, pose.arm, back, ux, uy);
  if (!armAfterShield || back) drawArm(px, d.look, hand, ux, uy, back);
  if (!back && d.shield) drawShieldFront(px, d.shield, ux, uy - pose.shieldUp);
  if (!back && bow) drawBowArm(px, d.look, ux, uy);
  if (armAfterShield && !back) drawArm(px, d.look, hand, ux, uy, back);
  px.outline(P.outline);
  if (!pose.noWeapon && d.weapon) drawWeapon(px, d.weapon, pose.arm, hand, back, ux, uy);
  return px;
}

function renderLying(d: DollSpec, dir: number): Pix {
  // Draw an idle figure without weapon/shield, then rotate it 90 degrees onto the ground.
  const stand = new Pix(FW, FH);
  const pose = POSES[0];
  const back = dir === 1;
  drawLegs(stand, d, pose, back);
  drawTorso(stand, d, 0, 0, back);
  drawHead(stand, d.look, 0, 0, back);
  if (d.helmet) drawHelmet(stand, d.helmet, 0, 0, back);
  const out = new Pix(FW, FH);
  // Shield lying flat beside the body.
  if (d.shield) {
    const paint = d.shield.paint ?? {};
    const field = P.shieldField[paint.field ?? 'bronze'] ?? P.bronze[1];
    out.ellipse(17, 31, 11, 5, (_x, _y, edge) => (edge ? P.bronze[2] : field));
  }
  for (let y = 0; y < FH; y++) {
    for (let x = 0; x < FW; x++) {
      if (stand.alpha(x, y) === 0) continue;
      const nx = y - 12 + 2; // head (y~13) -> x~3
      const ny = 28 + (x - 11);
      out.set(nx, ny, stand.get(x, y));
    }
  }
  // A dropped weapon.
  if (d.weapon === 'spear' || d.weapon === 'javelins') {
    out.line(2, 36, 29, 33, P.wood[1]);
    out.set(30, 33, P.bronze[1]);
    out.set(31, 33, P.bronze[0]);
  } else if (d.weapon) {
    out.line(22, 37, 28, 36, P.iron[1]);
    out.set(21, 37, P.wood[2]);
  }
  out.outline(P.outline);
  return out;
}

// ------------------------------------------------------------------ body

function skinRamp(look: Look): number[] {
  return P.skin[Math.max(0, Math.min(3, look.skin))];
}

function drawLegs(px: Pix, d: DollSpec, pose: Pose, back: boolean): void {
  const sk = skinRamp(d.look);
  const greaves = d.armor === 'cuirass';
  const k = pose.kneel;
  const legs = back ? [[16, 0], [13, 1]] : [[13, 0], [16, 1]]; // [x, isFront]
  for (const [lx, front] of legs) {
    const idx = front ? 1 : 0;
    const fo = pose.feet[idx];
    const lift = pose.lift[idx];
    const top = AY - 5 + Math.min(k, 3);
    const bottom = AY - lift;
    for (let y = top; y <= bottom; y++) {
      const shiftX = y >= AY - 2 ? fo : 0;
      const isFoot = y === bottom;
      let c0 = front ? sk[1] : sk[2];
      let c1 = front ? sk[2] : sk[2];
      if (greaves && y < AY - 1 && !isFoot) {
        c0 = front ? P.bronze[1] : P.bronze[2];
        c1 = P.bronze[2];
      }
      if (isFoot) {
        c0 = P.leather[2];
        c1 = P.leather[2];
      }
      px.set(lx + shiftX, y, c0);
      px.set(lx + 1 + shiftX, y, c1);
      if (isFoot && !back) px.set(lx + 2 + shiftX, y, P.leather[2]);
      if (isFoot && back) px.set(lx - 1 + shiftX, y, P.leather[2]);
    }
    if (k >= 3) {
      // kneeling: knee forward
      px.set(lx + 2, AY - 2, front ? sk[1] : sk[2]);
    }
  }
}

export function drawTorso(px: Pix, d: DollSpec, ux: number, uy: number, back: boolean): void {
  const t = tunicRamp(d.look.tunic);
  const x0 = 12 + ux;
  const ty = AY - 15 + uy;
  // torso rows
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 7; c++) {
      const col = c === 0 ? t[0] : c === 6 ? t[2] : t[1];
      px.set(x0 + c, ty + r, col);
    }
  }
  // skirt (does not bob as much: anchored to hips)
  const sy = AY - 9 + Math.max(0, uy - 1);
  const skirt = [
    [0, 7],
    [0, 8],
    [-1, 9],
    [-1, 9],
  ];
  skirt.forEach(([o, w], r) => {
    for (let c = 0; c < w; c++) {
      const x = 12 + ux + o + c;
      let col = t[1];
      if (c === 0) col = t[0];
      if (c === w - 1) col = t[2];
      if (r >= 1 && (c === 3 || c === 6)) col = t[2];
      px.set(x, sy + r, col);
    }
  });
  // belt
  px.hline(x0, x0 + 6, ty + 5, P.leather[2]);
  px.set(x0 + 3, ty + 5, P.bronze[1]);

  const a = d.armor;
  if (!a) return;
  if (a === 'leather') {
    for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) px.set(x0 + c, ty + r, c === 0 ? P.leather[0] : c === 6 ? P.leather[2] : P.leather[1]);
    px.hline(x0, x0 + 6, ty, P.leather[0]);
    px.set(x0 + 3, ty + 2, P.leather[2]);
    px.set(x0 + 3, ty + 3, P.leather[2]);
    for (let c = 0; c < 9; c += 2) px.set(x0 - 1 + c, sy, P.leather[1]);
  } else if (a === 'linothorax') {
    for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) px.set(x0 + c, ty + r, c === 0 ? P.linen[0] : c === 6 ? P.linen[2] : P.linen[1]);
    // shoulder yoke & decorative band
    px.hline(x0, x0 + 6, ty, P.linen[0]);
    px.hline(x0, x0 + 6, ty + 3, P.tunicOchre[1]);
    if (!back) px.set(x0 + 4, ty + 1, P.tunicOchre[2]);
    // pteruges
    for (let c = 0; c < 9; c++) {
      const col = c % 2 === 0 ? P.linen[1] : P.linen[2];
      px.set(x0 - 1 + c, sy, col);
      px.set(x0 - 1 + c, sy + 1, col);
      if (c % 2 === 0) px.set(x0 - 1 + c, sy + 2, P.linen[2]);
    }
  } else if (a === 'scale') {
    for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) px.set(x0 + c, ty + r, (r + c) % 2 === 0 ? P.bronze[1] : r % 2 === 0 ? P.bronze[2] : P.bronze[0]);
    for (let c = 0; c < 9; c++) px.set(x0 - 1 + c, sy, c % 2 === 0 ? P.bronze[2] : P.bronze[1]);
  } else if (a === 'mail') {
    for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) px.set(x0 + c, ty + r, (r + c) % 2 === 0 ? P.iron[1] : P.iron[2]);
    for (let c = 0; c < 9; c++) {
      px.set(x0 - 1 + c, sy, (c + 1) % 2 === 0 ? P.iron[1] : P.iron[2]);
      px.set(x0 - 1 + c, sy + 1, c % 2 === 0 ? P.iron[2] : P.iron[3]);
    }
    px.hline(x0, x0 + 6, ty, P.iron[0]);
    px.hline(x0, x0 + 6, ty + 5, P.leather[2]);
  } else if (a === 'cuirass') {
    for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) px.set(x0 + c, ty + r, c === 0 ? P.bronze[0] : c >= 5 ? P.bronze[2] : P.bronze[1]);
    if (!back) {
      px.set(x0 + 2, ty + 1, P.bronze[0]);
      px.set(x0 + 4, ty + 1, P.bronze[0]);
      px.set(x0 + 3, ty + 2, P.bronze[2]);
      px.set(x0 + 3, ty + 3, P.bronze[2]);
      px.set(x0 + 2, ty + 3, P.bronze[0]);
      px.set(x0 + 4, ty + 3, P.bronze[0]);
    } else {
      px.vline(x0 + 3, ty + 1, ty + 4, P.bronze[2]);
    }
    for (let c = 0; c < 9; c++) {
      const col = c % 2 === 0 ? P.leather[1] : P.leather[2];
      px.set(x0 - 1 + c, sy, col);
      px.set(x0 - 1 + c, sy + 1, col);
    }
  }
}

export function drawHead(px: Pix, look: Look, ux: number, uy: number, back: boolean): void {
  const sk = skinRamp(look);
  const hc = P.hair[look.hair] ?? P.hair[0];
  const hs = P.hairShade[look.hair] ?? P.hairShade[0];
  const x0 = 13 + ux;
  const y0 = AY - 23 + uy;
  // neck
  px.set(x0 + 2, y0 + 7, sk[2]);
  px.set(x0 + 3, y0 + 7, sk[2]);
  // skull
  const rows = [
    [1, 4],
    [0, 6],
    [0, 6],
    [0, 6],
    [0, 6],
    [0, 6],
    [1, 4],
  ];
  rows.forEach(([o, w], r) => {
    for (let c = 0; c < w; c++) px.set(x0 + o + c, y0 + r, c === 0 && o === 0 ? sk[0] : sk[1]);
  });
  if (!back) {
    // face toward the right
    px.set(x0 + 6, y0 + 4, sk[1]); // nose
    px.set(x0 + 4, y0 + 3, P.outline); // eye
    px.set(x0 + 5, y0 + 5, sk[2]); // mouth shade
    px.set(x0 + 1, y0 + 3, sk[2]); // ear
    // hair
    px.hline(x0 + 1, x0 + 4, y0, hc);
    px.hline(x0, x0 + 5, y0 + 1, hc);
    px.set(x0 + 5, y0 + 1, hs);
    if (look.hairStyle !== 2) {
      px.vline(x0, y0 + 2, y0 + 4, hc);
      px.set(x0 + 1, y0 + 2, hs);
    }
    if (look.hairStyle === 1) {
      px.vline(x0 - 1, y0 + 2, y0 + 7, hs);
      px.vline(x0, y0 + 5, y0 + 7, hc);
    }
    if (look.beard >= 1) {
      px.hline(x0 + 2, x0 + 5, y0 + 6, hc);
      px.set(x0 + 5, y0 + 5, hc);
      px.set(x0 + 2, y0 + 5, hs);
    }
    if (look.beard === 2) {
      px.hline(x0 + 2, x0 + 4, y0 + 7, hs);
      px.set(x0 + 3, y0 + 5, hc);
      px.set(x0 + 4, y0 + 5, hc);
    }
  } else {
    // seen from behind: mostly hair, a sliver of cheek on the right
    for (let r = 0; r < 6; r++) {
      const w = r === 0 ? 4 : 5;
      const o = r === 0 ? 1 : 0;
      for (let c = 0; c < w; c++) px.set(x0 + o + c, y0 + r, look.hairStyle === 2 && r > 1 ? sk[1] : c === 0 ? hs : hc);
    }
    px.set(x0 + 5, y0 + 3, sk[2]); // ear
    if (look.hairStyle === 1) {
      px.hline(x0, x0 + 4, y0 + 6, hc);
      px.hline(x0, x0 + 4, y0 + 7, hs);
    }
    if (look.beard === 2) px.set(x0 + 5, y0 + 6, hc);
  }
}

function crestColor(paint?: ItemPaint): number {
  return P.crest[(paint?.field ?? 'red') as keyof typeof P.crest] ?? P.crest.red;
}

export function drawHelmet(px: Pix, h: { art: string; paint?: ItemPaint }, ux: number, uy: number, back: boolean): void {
  const x0 = 13 + ux;
  const y0 = AY - 23 + uy;
  const B = P.bronze;
  const crest = crestColor(h.paint);
  const crestShade = crest === P.crest.cream ? 0xb9ad94 : crest === P.crest.ink ? 0x14100e : 0x7a2018;
  switch (h.art) {
    case 'cap': {
      px.hline(x0 + 1, x0 + 4, y0 - 1, P.leather[1]);
      px.hline(x0, x0 + 5, y0, P.leather[1]);
      px.hline(x0, x0 + 5, y0 + 1, P.leather[2]);
      px.set(x0, y0, P.leather[0]);
      break;
    }
    case 'pilos': {
      px.set(x0 + 2, y0 - 3, B[1]);
      px.hline(x0 + 2, x0 + 3, y0 - 2, B[1]);
      px.hline(x0 + 1, x0 + 4, y0 - 1, B[1]);
      px.hline(x0 + 0, x0 + 5, y0, B[1]);
      px.hline(x0 - 1, x0 + 6, y0 + 1, B[2]);
      px.set(x0 + 1, y0 - 1, B[0]);
      px.set(x0 + 2, y0 - 2, B[0]);
      px.set(x0 + 1, y0, B[0]);
      break;
    }
    case 'montefortino': {
      px.hline(x0 + 1, x0 + 4, y0 - 1, B[1]);
      px.hline(x0, x0 + 5, y0, B[1]);
      px.hline(x0, x0 + 5, y0 + 1, B[1]);
      px.hline(x0 - 1, x0 + 6, y0 + 2, B[2]);
      px.set(x0 + 1, y0, B[0]);
      px.set(x0 + 2, y0 - 1, B[0]);
      px.set(x0 + 2, y0 - 2, B[2]);
      px.set(x0 + 3, y0 - 2, B[2]);
      // short plume
      px.set(x0 + 2, y0 - 3, crest);
      px.set(x0 + 3, y0 - 3, crest);
      px.set(x0 + 1, y0 - 4, crest);
      px.set(x0 + 2, y0 - 4, crestShade);
      // cheek guard
      if (!back) {
        px.vline(x0 + 3, y0 + 3, y0 + 5, B[1]);
        px.set(x0 + 2, y0 + 3, B[2]);
      } else px.vline(x0 + 5, y0 + 3, y0 + 4, B[2]);
      break;
    }
    case 'chalcidian':
    case 'corinthian': {
      const full = h.art === 'corinthian';
      px.hline(x0 + 1, x0 + 4, y0 - 1, B[1]);
      for (let r = 0; r < (full ? 7 : 3); r++) {
        for (let c = 0; c < 6; c++) px.set(x0 + c, y0 + r, c === 0 ? B[0] : c >= 4 ? B[2] : B[1]);
      }
      if (!full && !back) {
        // cheek piece + open ear
        px.vline(x0 + 4, y0 + 3, y0 + 5, B[1]);
        px.vline(x0 + 5, y0 + 3, y0 + 4, B[2]);
      }
      if (full && !back) {
        px.hline(x0 + 3, x0 + 5, y0 + 3, P.outline); // eye slit
        px.set(x0 + 6, y0 + 3, B[2]);
        px.set(x0 + 6, y0 + 4, B[1]); // nasal
        px.set(x0 + 5, y0 + 5, P.outline); // mouth gap
        px.set(x0 + 4, y0 + 6, B[2]);
        px.set(x0 + 5, y0 + 6, B[2]);
        px.set(x0 + 1, y0 + 1, B[0]);
      }
      if (full && back) {
        px.hline(x0, x0 + 5, y0 + 6, B[3]);
      }
      // tall horsehair crest running front-to-back
      const cy = y0 - 2;
      px.hline(x0 - 1, x0 + 5, cy, crest);
      px.hline(x0 - 2, x0 + 4, cy - 1, crest);
      px.hline(x0 - 1, x0 + 3, cy - 2, crest);
      px.set(x0 - 2, cy + 1, crestShade);
      px.set(x0 - 2, cy, crestShade);
      px.set(x0 + 5, cy - 1, crestShade);
      px.hline(x0, x0 + 3, cy + 1, B[2]); // crest holder
      break;
    }
  }
}

// ------------------------------------------------------------------ arms & shields

interface Hand {
  x: number;
  y: number;
}

function handPos(weapon: string | undefined, arm: ArmPose, back: boolean, ux: number, uy: number): Hand {
  const ty = AY - 15 + uy;
  if (back) {
    switch (arm) {
      case 'rest':
        return { x: 20 + ux, y: ty + 4 };
      case 'raise':
        return { x: 19 + ux, y: ty - 1 };
      case 'strike':
        return { x: 22 + ux, y: ty - 2 };
      case 'recover':
        return { x: 20 + ux, y: ty + 1 };
    }
  }
  if (weapon === 'bow') {
    switch (arm) {
      case 'raise':
        return { x: 14 + ux, y: ty };
      case 'strike':
        return { x: 13 + ux, y: ty + 1 };
      default:
        return { x: 11 + ux, y: ty + 4 };
    }
  }
  switch (arm) {
    case 'rest':
      return { x: 11 + ux, y: ty + 4 };
    case 'raise':
      return ranged(weapon) && weapon !== 'javelins' ? { x: 12 + ux, y: ty - 5 } : { x: 9 + ux, y: ty - 1 };
    case 'strike':
      return weapon === 'spear' ? { x: 17 + ux, y: ty } : { x: 18 + ux, y: ty + 1 };
    case 'recover':
      return { x: 13 + ux, y: ty + 2 };
  }
}

function drawArm(px: Pix, look: Look, hand: Hand, ux: number, uy: number, back: boolean): void {
  const sk = skinRamp(look);
  const sx = back ? 19 + ux : 12 + ux;
  const sy = AY - 15 + uy;
  const tun = tunicRamp(look.tunic);
  px.set(sx, sy, tun[1]);
  px.set(sx, sy + 1, tun[2]);
  px.line(sx, sy + 1, hand.x, hand.y, sk[1]);
  px.line(sx + (back ? -1 : 0), sy + 2, hand.x, hand.y + 1, sk[2]);
  px.set(hand.x, hand.y, sk[0]);
}

function drawBowArm(px: Pix, look: Look, ux: number, uy: number): void {
  const sk = skinRamp(look);
  const sy = AY - 15 + uy;
  px.line(18 + ux, sy + 1, 21 + ux, sy + 1, sk[1]);
  px.line(18 + ux, sy + 2, 21 + ux, sy + 2, sk[2]);
}

function shieldColors(paint?: ItemPaint): { field: number; fieldLight: number; fieldShade: number; ink: number } {
  const fieldKey = paint?.field ?? 'bronze';
  const field = P.shieldField[fieldKey] ?? P.bronze[1];
  const ink = P.shieldInk[paint?.ink ?? 'ink'] ?? P.outline;
  const light = fieldKey === 'bronze' ? P.bronze[0] : lighten(field, 0.18);
  const shade = fieldKey === 'bronze' ? P.bronze[2] : darken(field, 0.2);
  return { field, fieldLight: light, fieldShade: shade, ink };
}

export function drawShieldFront(px: Pix, s: { art: string; paint?: ItemPaint }, ux: number, uy: number): void {
  const col = shieldColors(s.paint);
  const ty = AY - 15 + uy;
  if (s.art === 'hoplon') {
    const bx = 14 + ux;
    const by = ty - 2;
    const w = 11;
    const h = 13;
    px.ellipse(bx, by, w, h, (_x, _y, edge, u, v) => {
      if (edge) return u + v < -0.2 ? P.bronze[0] : u + v > 0.5 ? P.bronze[3] : P.bronze[1];
      if (u < -0.35 && v < -0.2) return col.fieldLight;
      if (u > 0.45 || v > 0.6) return col.fieldShade;
      return col.field;
    });
    // inner rim ring
    px.ellipse(bx + 1, by + 1, w - 2, h - 2, (_x, _y, edge, u, v) => (edge && u + v > 0.6 ? col.fieldShade : null));
    const em = s.paint?.emblem ? EMBLEM_BITMAPS[s.paint.emblem] : undefined;
    if (em) px.bitmap(bx + 2, by + 3, em, { '#': col.ink });
    else px.rect(bx + 4, by + 5, 3, 3, P.bronze[1]);
  } else if (s.art === 'oval') {
    const em = s.paint?.emblem ? EMBLEM_BITMAPS[s.paint.emblem] : undefined;
    const bx = (em ? 14 : 15) + ux;
    const by = ty - 3;
    const w = em ? 9 : 8;
    const h = 16;
    px.ellipse(bx, by, w, h, (_x, _y, edge, u, v) => {
      if (edge) return u + v < 0 ? col.fieldLight : darken(col.field, 0.35);
      return u < -0.4 ? col.fieldLight : u > 0.5 ? col.fieldShade : col.field;
    });
    if (em) {
      // spina above and below a painted emblem
      px.vline(bx + 4, by + 2, by + 3, P.wood[1]);
      px.vline(bx + 4, by + 12, by + 13, P.wood[1]);
      emblemClipped(px, em, bx + 1, by + 5, col.ink, bx, by, w, h);
    } else {
      // spina and boss
      px.vline(bx + 4, by + 2, by + h - 3, P.wood[1]);
      px.rect(bx + 3, by + 6, 3, 4, P.iron[1]);
      px.set(bx + 3, by + 6, P.iron[0]);
      px.set(bx + 5, by + 9, P.iron[2]);
      // painted bands from the emblem colour
      const ink = col.ink;
      px.set(bx + 2, by + 3, ink);
      px.set(bx + 2, by + 4, ink);
      px.set(bx + 2, by + 11, ink);
      px.set(bx + 2, by + 12, ink);
      px.set(bx + 6, by + 3, ink);
      px.set(bx + 6, by + 12, ink);
    }
  } else if (s.art === 'buckler') {
    const bx = 17 + ux;
    const by = ty + 1;
    px.ellipse(bx, by, 7, 7, (_x, _y, edge, u, v) => (edge ? (u + v < 0 ? P.bronze[0] : P.bronze[2]) : u + v < -0.4 ? col.fieldLight : col.field));
    px.rect(bx + 3, by + 3, 1, 1, P.bronze[0]);
    px.set(bx + 2, by + 3, P.bronze[2]);
  }
}

/** Paint an emblem, keeping only the pixels well inside the shield's ellipse (w x h at sx, sy). */
function emblemClipped(px: Pix, em: string[], ex: number, ey: number, ink: number, sx: number, sy: number, w: number, h: number): void {
  const cx = sx + (w - 1) / 2;
  const cy = sy + (h - 1) / 2;
  for (let j = 0; j < em.length; j++) {
    for (let i = 0; i < em[j].length; i++) {
      if (em[j][i] !== '#') continue;
      const x = ex + i;
      const y = ey + j;
      if (((x - cx) / (w / 2 - 1)) ** 2 + ((y - cy) / (h / 2 - 1)) ** 2 > 1) continue;
      px.set(x, y, ink);
    }
  }
}

/**
 * Back view (3/4 from behind): the shield hangs on the soldier's left side, the
 * one turned toward the viewer, angled outwards so its painted face shows. It is
 * a little narrower than the front view (foreshortened) and lit from the left.
 */
function drawShieldSide(px: Pix, s: { art: string; paint?: ItemPaint }, ux: number, uy: number): void {
  const ty = AY - 15 + uy;
  const col = shieldColors(s.paint);
  const em = s.paint?.emblem ? EMBLEM_BITMAPS[s.paint.emblem] : undefined;
  if (s.art === 'hoplon') {
    const bx = 5 + ux;
    const by = ty - 2;
    const w = 10;
    const h = 13;
    px.ellipse(bx, by, w, h, (_x, _y, edge, u, v) => {
      if (edge) return u < -0.3 ? P.bronze[0] : u + v > 0.5 ? P.bronze[3] : P.bronze[1];
      if (u < -0.35 && v < -0.2) return col.fieldLight;
      if (u > 0.5 || v > 0.6) return col.fieldShade;
      return col.field;
    });
    // the rim's thickness shows on the far (right) edge
    px.ellipse(bx + 1, by, w - 1, h, (_x, _y, edge, u) => (edge && u > 0.55 ? P.bronze[2] : null));
    if (em) emblemClipped(px, em, bx + 1, by + 3, col.ink, bx, by, w, h);
    else px.rect(bx + 4, by + 5, 2, 3, P.bronze[1]);
  } else if (s.art === 'oval') {
    const bx = 5 + ux;
    const by = ty - 3;
    const w = 9;
    const h = 16;
    px.ellipse(bx, by, w, h, (_x, _y, edge, u, v) => {
      if (edge) return u + v < 0 ? col.fieldLight : darken(col.field, 0.35);
      return u < -0.4 ? col.fieldLight : u > 0.5 ? col.fieldShade : col.field;
    });
    if (em) {
      px.vline(bx + 4, by + 2, by + 3, P.wood[1]);
      px.vline(bx + 4, by + 12, by + 13, P.wood[1]);
      emblemClipped(px, em, bx + 1, by + 5, col.ink, bx, by, w, h);
    } else {
      px.vline(bx + 4, by + 2, by + h - 3, P.wood[1]);
      px.rect(bx + 3, by + 6, 3, 4, P.iron[1]);
      px.set(bx + 3, by + 6, P.iron[0]);
      px.set(bx + 2, by + 3, col.ink);
      px.set(bx + 2, by + 12, col.ink);
      px.set(bx + 6, by + 3, col.ink);
      px.set(bx + 6, by + 12, col.ink);
    }
  } else if (s.art === 'buckler') {
    const bx = 8 + ux;
    const by = ty + 1;
    px.ellipse(bx, by, 7, 7, (_x, _y, edge, u, v) => (edge ? (u + v < 0 ? P.bronze[0] : P.bronze[2]) : u + v < -0.4 ? col.fieldLight : col.field));
    px.set(bx + 3, by + 3, P.bronze[0]);
  }
}

// ------------------------------------------------------------------ weapons

function drawWeapon(px: Pix, w: string, arm: ArmPose, hand: Hand, back: boolean, _ux: number, _uy: number): void {
  const wood = (i: number) => (i % 3 === 0 ? P.wood[2] : P.wood[1]);
  const spearTip = (x: number, y: number, dx: number, dy: number) => {
    // leaf-shaped bronze head pointing along (dx, dy) (unit-ish integer direction)
    px.set(x, y, P.bronze[1]);
    px.set(x + dx, y + dy, P.bronze[0]);
    px.set(x + 2 * dx, y + 2 * dy, P.bronze[0]);
    px.set(x + 3 * dx, y + 3 * dy, P.bronze[1]);
    if (dy === 0) {
      px.set(x + dx, y - 1, P.bronze[2]);
      px.set(x + dx, y + 1, P.bronze[2]);
    } else if (dx === 0) {
      px.set(x - 1, y + dy, P.bronze[2]);
      px.set(x + 1, y + dy, P.bronze[2]);
    } else {
      px.set(x + dx, y, P.bronze[2]);
      px.set(x, y + dy, P.bronze[2]);
    }
  };
  switch (w) {
    case 'spear': {
      if (arm === 'rest' || arm === 'recover') {
        const x = hand.x - 1;
        if (arm === 'rest') {
          px.line(x, 7, x, AY - 1, wood);
          spearTip(x, 6, 0, -1);
          px.set(x, AY, P.bronze[2]);
        } else {
          const [x0, y0, x1, y1] = back ? [hand.x - 7, hand.y + 5, hand.x + 8, hand.y - 9] : [hand.x - 12, hand.y + 3, hand.x + 12, hand.y - 4];
          px.line(x0, y0, x1, y1, wood);
          spearTip(x1, y1, 1, back ? -1 : 0);
        }
      } else if (arm === 'raise') {
        const [x0, y0, x1, y1] = back ? [hand.x - 9, hand.y + 6, hand.x + 7, hand.y - 8] : [hand.x - 9, hand.y + 2, hand.x + 14, hand.y - 3];
        px.line(x0, y0, x1, y1, wood);
        spearTip(x1, y1, 1, back ? -1 : 0);
      } else {
        const [x0, y0, x1, y1] = back ? [hand.x - 9, hand.y + 8, hand.x + 5, hand.y - 6] : [hand.x - 13, hand.y - 1, hand.x + 10, hand.y];
        px.line(x0, y0, x1, y1, wood);
        spearTip(x1 + 1, y1, 1, back ? -1 : 0);
      }
      break;
    }
    case 'sword':
    case 'kopis':
    case 'longsword': {
      const len = w === 'longsword' ? 9 : 7;
      let dx = 0;
      let dy = -1;
      if (arm === 'raise') {
        dx = -1;
        dy = -1;
      } else if (arm === 'strike') {
        dx = 1;
        dy = 1;
      } else if (arm === 'recover') {
        dx = 1;
        dy = -1;
      }
      if (back && arm === 'rest') {
        dx = 0;
        dy = -1;
      }
      // grip, guard, blade
      px.set(hand.x - dx, hand.y - dy, P.wood[2]);
      const gx = hand.x + dx;
      const gy = hand.y + dy;
      if (dx === 0) px.hline(gx - 1, gx + 1, gy, P.bronze[1]);
      else {
        px.set(gx + dy, gy, P.bronze[1]);
        px.set(gx, gy - dx, P.bronze[1]);
      }
      for (let i = 1; i <= len; i++) {
        const bx = gx + dx * i;
        const by = gy + dy * i;
        px.set(bx, by, i === len ? P.iron[0] : P.iron[1]);
        if (dx === 0) px.set(bx + 1, by, P.iron[2]);
        else px.set(bx + 1, by, P.iron[2]);
      }
      if (w === 'kopis') {
        // forward-curved belly near the tip
        px.set(gx + dx * (len - 2) + 1 + (dx === 0 ? 1 : 0), gy + dy * (len - 2), P.iron[1]);
      }
      break;
    }
    case 'axe':
    case 'club': {
      let dx = 0;
      let dy = -1;
      if (arm === 'raise') {
        dx = -1;
        dy = -1;
      } else if (arm === 'strike') {
        dx = 1;
        dy = 1;
      } else if (arm === 'recover') {
        dx = 1;
        dy = -1;
      }
      const len = 7;
      for (let i = -1; i <= len; i++) {
        px.set(hand.x + dx * i, hand.y + dy * i, i % 2 ? P.wood[1] : P.wood[2]);
        if (w === 'club' && i > 3) px.set(hand.x + dx * i + 1, hand.y + dy * i, P.wood[0]);
      }
      const ex = hand.x + dx * len;
      const ey = hand.y + dy * len;
      if (w === 'axe') {
        // head perpendicular to the haft
        const px1 = -dy;
        const py1 = dx;
        for (let k = 1; k <= 3; k++) {
          px.set(ex + px1 * k, ey + py1 * k, P.iron[k === 3 ? 0 : 1]);
          px.set(ex + px1 * k - dx, ey + py1 * k - dy, P.iron[2]);
        }
        px.set(ex + px1 * 3 + dx, ey + py1 * 3 + dy, P.iron[0]);
      } else {
        px.rect(ex - 1, ey - 1, 3, 3, P.wood[1]);
        px.set(ex - 1, ey - 1, P.wood[0]);
        px.set(ex + 1, ey + 1, P.wood[2]);
      }
      break;
    }
    case 'javelins': {
      if (arm === 'rest' || arm === 'recover') {
        const x = hand.x - 1;
        for (const [ox, top] of [
          [0, 11],
          [1, 13],
        ]) {
          px.line(x + ox, top, x + ox, AY - 3, wood);
          px.set(x + ox, top - 1, P.iron[1]);
          px.set(x + ox, top - 2, P.iron[0]);
        }
      } else if (arm === 'raise') {
        const [x0, y0, x1, y1] = back ? [hand.x - 6, hand.y + 5, hand.x + 6, hand.y - 7] : [hand.x - 7, hand.y + 1, hand.x + 12, hand.y - 2];
        px.line(x0, y0, x1, y1, wood);
        px.set(x1 + 1, y1 + (back ? -1 : 0), P.iron[1]);
        px.set(x1 + 2, y1 + (back ? -2 : 0), P.iron[0]);
      }
      // 'strike' = released, nothing in hand
      break;
    }
    case 'sling': {
      if (arm === 'rest' || arm === 'recover') {
        px.vline(hand.x, hand.y + 1, hand.y + 4, P.linen[2]);
        px.rect(hand.x - 1, hand.y + 5, 2, 2, P.leather[1]);
      } else if (arm === 'raise') {
        // whirling loop above the head
        const cx = hand.x + 1;
        const cy = hand.y - 4;
        const ring = [
          [0, -3], [1, -3], [2, -2], [3, -1], [3, 0], [2, 1], [1, 2], [0, 2], [-1, 1], [-2, 0], [-2, -1], [-1, -2],
        ];
        ring.forEach(([ox, oy], i) => px.set(cx + ox, cy + oy, i % 3 === 0 ? P.linen[1] : P.linen[2]));
        px.rect(cx + 3, cy - 2, 2, 2, P.leather[1]);
      } else {
        px.line(hand.x, hand.y, hand.x + 6, hand.y - 3, P.linen[2]);
      }
      break;
    }
    case 'bow': {
      if (back) {
        px.line(hand.x + 1, hand.y - 8, hand.x + 1, hand.y + 6, P.wood[1]);
        px.set(hand.x + 2, hand.y - 8, P.wood[2]);
        px.set(hand.x + 2, hand.y + 6, P.wood[2]);
        break;
      }
      const ty = AY - 15 + _uy;
      const bx = 21 + _ux;
      const top = ty - 6;
      const bot = ty + 9;
      // bow stave curving forward
      for (let y = top; y <= bot; y++) {
        const t = (y - top) / (bot - top);
        const bulge = Math.round(2 * Math.sin(t * Math.PI));
        px.set(bx + bulge, y, y === top || y === bot ? P.wood[2] : P.wood[1]);
      }
      if (arm === 'raise') {
        px.line(bx, top, hand.x, hand.y, P.linen[0]);
        px.line(bx, bot, hand.x, hand.y, P.linen[0]);
        px.line(hand.x, hand.y, bx + 6, hand.y, P.wood[0]);
        px.set(bx + 7, hand.y, P.iron[0]);
      } else {
        px.vline(bx, top, bot, P.linen[1]);
      }
      break;
    }
  }
}

function lighten(c: number, t: number): number {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return (Math.round(r + (255 - r) * t) << 16) | (Math.round(g + (255 - g) * t) << 8) | Math.round(b + (255 - b) * t);
}

function darken(c: number, t: number): number {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return (Math.round(r * (1 - t)) << 16) | (Math.round(g * (1 - t)) << 8) | Math.round(b * (1 - t));
}
