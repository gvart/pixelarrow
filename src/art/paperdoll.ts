/**
 * Procedural soldier, rider, chariot and animal sprites.
 *
 * Every figure is posed as a small 3D model (src/art/model3d.ts: spheres,
 * tapered limbs, ellipsoids, boxes, lines and single crisp pixels, in metres)
 * and rendered through the battle's isometric camera, so proportions stay
 * realistic (a man is ~1.75 m = ~34 px with a head of ~5 px), light always
 * falls from the upper left, and every facing is a true view rather than a
 * mirror image. Small features that would vanish at battle scale (eyes, a
 * Corinthian helmet's eye-slits, gilded trim, rivets, amulets) are placed as
 * depth-tested single pixels (Scene.dot), so they stay crisp.
 *
 * SHEET FORMAT (what a hand-drawn replacement must follow):
 *   - One sheet per figure, 4 rows (facings) of frames. A man has NFRAMES (40)
 *     columns, every other figure LEGACY_FRAMES (16); frame ids are always
 *     dir * NFRAMES + column, and the extra ids of a 16-column sheet alias the
 *     nearest legacy column (legacyFrame), so any frame id works on any sheet.
 *   - Columns (FRAME_NAMES): the original sixteen
 *       idle0 idle1 walk0..walk3 atk0 atk1 atk2 hit die0 die1 die2 walk4 walk5 die1b
 *     then idle2 idle3 walk6 walk7 run0..run5 wind follow block hit1
 *     dieB0..dieB3 rout0..rout3 win0 win1. ANIM lists every sequence in play
 *     order (idle 4, walk 8, run 6, attack 5, hit 2, two deaths of 4, rout 4,
 *     victory 2); use it (or attackFrames) instead of raw column numbers.
 *     Riders: walk = a four-beat walk, run = the gallop (ANIM.gallop), hit = the
 *     horse rears, die = the horse stumbles and goes over (the rider thrown ahead),
 *     dieB = it sits back and topples (the rider slid off behind).
 *     Animals: walk = trot (the bear ambles), run = gallop / lope, atk = crouch,
 *     coil, lunge, bite (the bear rears and swipes), two deaths; on a 16-column
 *     sheet (chariots, UI sheets) the extra columns alias the legacy ones.
 *   - Rows (DIRS): 0 facing field +x (screen down-right), 1 facing field -y (up-right,
 *     seen from behind: the player's army), 2 facing field +y (down-left, seen from the
 *     front: the enemy), 3 facing field -x (up-left). No mirroring at render time.
 *   - Frame size and the feet line depend on the figure (dollGeom): a man 56 x 72
 *     with the feet at y = 64, a rider 96 x 84 (hooves at 74), a chariot 128 x 96
 *     (84), wolf / boar 48 x 40 (34), bear 64 x 60 (52). The feet are centred on x.
 *     DollSpec.scale shrinks the model (the battle's 0.74) and DollSpec.res
 *     multiplies the pixels (the battle's 2, shown at scale 1 / res): both scale
 *     the frame and the feet line, so a 2x battle man is 84 x 108, feet at 96.
 *     Details that need the pixels (brows, straps, folds, strands, leaf-shaped
 *     spear heads, horse tack) are only built from ~28 px/m up (fineDetail).
 *   - Layers, back to front, each keyed by an `art` id from src/data/items.ts (or the
 *     class / mount / beast for bodies) and refined by the item def and rarity
 *     (DollSpec.gear): [cloak], legs (skin / trousers / greaves), tunic and skirt,
 *     body armour, arms, head / hair / beard, helmet and crest, shield (painted
 *     face: field, emblem, rim), weapon, trinket.
 *   - Rarity (0 common .. 4 legendary) changes the metal (tarnished bronze ->
 *     bronze -> burnished -> gilded trim -> orichalcum / starmetal), and the
 *     legendary pieces their silhouette (winged crest, flame-headed spear,
 *     sun-rayed shield, pauldrons). The battle adds the animated part
 *     (glint sweep, outline pulse, particles) from dollFx and the glint mask.
 *   - The player's side (row 1) always shows the painted shield face: the shield
 *     carried on the left side is turned towards the viewer.
 */
import { Scene, add, cross, mul, norm, sub, len, lerp3, CAM, project, type Material, type V3, type Hit } from './model3d';
import {
  BLOOD, BRONZE, BEAST, CLOTH, COATS, CREST, CREST_EXTRA, DARK_LEATHER, DARK_WOOD, DIVINE, EMBER, EYE, FELT, FIELD, GOLD, HAIR, HOOF, INK, IRON, IVORY,
  LEATHER, LINEN, MANE, ORICHALCUM, RIM_LIGHT, SKIN, STRING, WOOD, bronzeOf, ironOf, trimOf, BRIGHT_SILVER,
} from './materials';
import { EMBLEM_BITMAPS } from './emblems';
import { Pix, hash2 } from './pixels';
import type { Look } from '../data/units';
import { itemDef, rarityRank, type Item, type ItemPaint } from '../data/items';
import type { Hero } from '../data/units';
import { CLASSES, classOfHero, type BeastId, type MountId } from '../data/classes';
import { isMythId } from '../data/beasts';
import { MYTH_GEOM, buildMyth, mythBasis } from './beastArt';

export const FRAME_NAMES = [
  // 0..15: the original columns (indices kept for older callers)
  'idle0', 'idle1', 'walk0', 'walk1', 'walk2', 'walk3', 'atk0', 'atk1', 'atk2', 'hit', 'die0', 'die1', 'die2', 'walk4', 'walk5', 'die1b',
  // 16..39: men only (other figures alias these to legacy columns)
  'idle2', 'idle3', 'walk6', 'walk7', 'run0', 'run1', 'run2', 'run3', 'run4', 'run5', 'wind', 'follow', 'block', 'hit1',
  'dieB0', 'dieB1', 'dieB2', 'dieB3', 'rout0', 'rout1', 'rout2', 'rout3', 'win0', 'win1',
] as const;
export type FrameName = (typeof FRAME_NAMES)[number];
/** Columns of a man's sheet; frame ids are dir * NFRAMES + column for every sheet. */
export const NFRAMES = FRAME_NAMES.length;
/** Columns of a rider's, chariot's or animal's sheet. */
export const LEGACY_FRAMES = 16;
/** Column index of a frame name. */
export const FRAME: Record<FrameName, number> = Object.fromEntries(FRAME_NAMES.map((n, i) => [n, i])) as Record<FrameName, number>;
/** Rows: facings in field coordinates. */
export const DIRS: [number, number][] = [[1, 0], [0, -1], [0, 1], [-1, 0]];
export const NDIRS = DIRS.length;

/** Every animation of a man, in play order (frame columns). */
export const ANIM = {
  /** Breathing: neutral, breathe in, settle (spear tip dips), shift the shield. */
  idle: [FRAME.idle0, FRAME.idle2, FRAME.idle1, FRAME.idle3],
  /** Eight phases: arm swing, 1 px bob on the contacts, cloak and plume follow through. */
  walk: [FRAME.walk0, FRAME.walk1, FRAME.walk2, FRAME.walk3, FRAME.walk4, FRAME.walk5, FRAME.walk6, FRAME.walk7],
  /** Charge / run: long stride, leaning in, spear levelled, cloak streaming. */
  run: [FRAME.run0, FRAME.run1, FRAME.run2, FRAME.run3, FRAME.run4, FRAME.run5],
  /** Anticipation, windup (held), strike, follow-through, recover; the pose depends on the weapon. */
  attack: [FRAME.wind, FRAME.atk0, FRAME.atk1, FRAME.follow, FRAME.atk2],
  block: [FRAME.block],
  /** Flinch: snap back, then sag. */
  hit: [FRAME.hit, FRAME.hit1],
  /** Two deaths: toppling backwards, or crumpling to the knees and forwards. */
  die: [FRAME.die0, FRAME.die1, FRAME.die1b, FRAME.die2],
  dieB: [FRAME.dieB0, FRAME.dieB1, FRAME.dieB2, FRAME.dieB3],
  /** Fleeing: shield slung on the back, arms flailing. */
  rout: [FRAME.rout0, FRAME.rout1, FRAME.rout2, FRAME.rout3],
  /** Victory pose (a cosmetic picks which), two frames looped. */
  win: [FRAME.win0, FRAME.win1],
  /** Riders and animals: the gallop / lope is their run (a 16-column sheet shows its walk columns for it). */
  gallop: [FRAME.run0, FRAME.run1, FRAME.run2, FRAME.run3, FRAME.run4, FRAME.run5],
  /** Chariots and other 16-column figures: the three-step fall. */
  fall: [10, 11, 12],
} as const;

/**
 * Older name for the sequences (kept for callers outside the battle). The
 * attack here is the three-frame core (windup, strike, recover).
 */
export const ANIM_FRAMES = {
  idle: [0, 1],
  walk: ANIM.walk,
  /** The four gallop columns of a 16-column sheet (walk0..walk3). */
  gallop: [2, 3, 4, 5],
  attack: [6, 7, 8],
  hit: [9],
  die: ANIM.die,
  fall: ANIM.fall,
} as const;

/** The legacy column (0..15) a four-phase builder (rider, chariot, animal, myth) draws for a frame. */
export function legacyFrame(frame: number): number {
  if (frame < LEGACY_FRAMES) return frame === 13 ? 2 : frame === 14 ? 4 : frame === 15 ? 11 : frame;
  const n = FRAME_NAMES[frame] ?? 'idle0';
  if (n === 'idle2') return 0;
  if (n === 'idle3') return 1;
  if (n === 'walk6') return 3;
  if (n === 'walk7') return 5;
  if (n.startsWith('run')) return [2, 3, 4, 5, 2, 4][Number(n.slice(3))];
  if (n.startsWith('rout')) return 2 + Number(n.slice(4));
  if (n === 'wind') return 6;
  if (n === 'follow') return 7;
  if (n === 'block' || n === 'hit1') return 9;
  if (n.startsWith('dieB')) return [10, 11, 11, 12][Number(n.slice(4))];
  if (n === 'win0') return 0;
  if (n === 'win1') return 1;
  return 0;
}

/** The sheet column that holds a frame on a sheet with `cols` columns. */
export function sheetColumn(frame: number, cols: number): number {
  if (cols >= NFRAMES) return frame;
  const lf = legacyFrame(frame);
  return lf < cols ? lf : 0;
}

// ================================================================ weapon classes and timing

/** How a weapon moves: thrust, slash, chop, two-handed swing, draw, whirl or throw. */
export type WeaponClass = 'spear' | 'lance' | 'blade' | 'chop' | 'two' | 'bow' | 'sling' | 'jav' | 'none';

export function weaponClass(art?: string): WeaponClass {
  switch (art) {
    case 'spear':
    case 'spear_short':
      return 'spear';
    case 'lance':
      return 'lance';
    case 'sword':
    case 'kopis':
    case 'longsword':
      return 'blade';
    case 'axe':
    case 'club':
      return 'chop';
    case 'falx':
    case 'rhomphaia':
      return 'two';
    case 'bow':
    case 'bow_short':
      return 'bow';
    case 'sling':
      return 'sling';
    case 'javelins':
      return 'jav';
    default:
      return 'none';
  }
}

export const isRangedClass = (w: WeaponClass): boolean => w === 'bow' || w === 'sling' || w === 'jav';

/**
 * Seconds per frame of ANIM.attack for a weapon class (anticipation, windup
 * held, strike, follow-through, recover). Missile weapons start at the
 * release (the shot already left) and draw / whirl / cock before the next
 * shot instead (see aimFrame).
 */
const ATTACK_TIMES: Record<WeaponClass, number[]> = {
  spear: [0.05, 0.11, 0.05, 0.08, 0.12],
  lance: [0.05, 0.11, 0.06, 0.08, 0.12],
  blade: [0.06, 0.11, 0.04, 0.09, 0.12],
  chop: [0.07, 0.16, 0.05, 0.1, 0.14],
  two: [0.09, 0.17, 0.06, 0.1, 0.14],
  none: [0.05, 0.11, 0.05, 0.08, 0.12],
  bow: [0, 0, 0.08, 0.12, 0.14],
  sling: [0, 0, 0.08, 0.1, 0.12],
  jav: [0, 0, 0.08, 0.12, 0.14],
};

/** The frame of the attack `t` seconds after it began, or -1 once it is over. */
export function attackFrame(w: WeaponClass, t: number): number {
  const times = ATTACK_TIMES[w];
  let acc = 0;
  for (let i = 0; i < times.length; i++) {
    if (!times[i]) continue;
    acc += times[i];
    if (t < acc) return ANIM.attack[i];
  }
  return -1;
}

/** Total length (s) of a weapon's attack animation. */
export function attackLength(w: WeaponClass): number {
  return ATTACK_TIMES[w].reduce((a, b) => a + b, 0);
}

/**
 * Missile troops before the next shot (`until` seconds left): the archer
 * nocks then holds the full draw, the slinger whirls overhead (two frames
 * alternating), the javelineer draws back and cocks. -1 when not yet.
 */
export function aimFrame(w: WeaponClass, until: number, now: number): number {
  if (w === 'bow') return until < 0.25 ? FRAME.atk0 : until < 0.5 ? FRAME.wind : -1;
  if (w === 'sling') return until < 0.6 ? (Math.floor(now * 12) % 2 ? FRAME.atk0 : FRAME.wind) : -1;
  if (w === 'jav') return until < 0.22 ? FRAME.atk0 : until < 0.45 ? FRAME.wind : -1;
  return -1;
}

// ================================================================ the spec

export interface SheetGeom {
  fw: number;
  fh: number;
  /** Feet line (y) inside a frame; x is centred. */
  footY: number;
}

const GEOM = {
  man: { fw: 56, fh: 72, footY: 64 },
  horse: { fw: 96, fh: 84, footY: 74 },
  chariot: { fw: 128, fh: 96, footY: 84 },
  small: { fw: 48, fh: 40, footY: 34 },
  bear: { fw: 64, fh: 60, footY: 52 },
} satisfies Record<string, SheetGeom>;

/** Frame size of a man (the common case). */
export const FW = GEOM.man.fw;
export const FH = GEOM.man.fh;

/** An equipped piece's identity for the art: its item def and rarity rank (0..4). */
export interface GearTag {
  def?: string;
  r?: number;
}

export interface DollSpec {
  look: Look;
  weapon?: string; // art key
  shield?: { art: string; paint?: ItemPaint };
  helmet?: { art: string; paint?: ItemPaint };
  armor?: string;
  /** Class look (src/data/classes.ts ClassArt). */
  cloak?: string;
  trousers?: string;
  bare?: boolean;
  mount?: MountId;
  beast?: BeastId;
  /** Horse coat index (COATS). */
  coat?: number;
  /** Variation seed (wear, dirt, small kit differences). */
  seed?: number;
  /** Mythical beasts: 'sp' = the sheet of signature moves (src/art/beastArt.ts). */
  pose?: 'sp';
  /**
   * Model scale (default 1). The battlefield draws its figures at BATTLE_SCALE
   * (a man ~26 px tall on a 36 px tile); portraits and screens use 1.
   */
  scale?: number;
  /**
   * Render resolution (default 1): the figure is rasterised with `res` times
   * as many pixels each way and shown at the same world size (the sprite's
   * scale is 1 / res), so a 2x figure keeps its layout, feet line and
   * hitbox but gains real detail (facial features, folds, straps). dollGeom
   * reports the frame size in rendered pixels.
   */
  res?: number;
  /** Item defs and rarity per slot (finishes, legendary silhouettes); trinket = its def id. */
  gear?: { weapon?: GearTag; shield?: GearTag; helmet?: GearTag; armor?: GearTag; trinket?: GearTag };
  /** Crest colour override (a cosmetic): a CREST / CREST_EXTRA key. */
  crest?: string;
  /** Gold-trimmed cloak hem (the season cloak). */
  cloakTrim?: boolean;
  /** Army skin: every bronze piece at least burnished. */
  polish?: boolean;
  /** Victory pose cosmetic ('salute' | 'shield'; default: the weapon pumped overhead). */
  victory?: string;
  /** Culture of the wearer (a Celt's bowl helmet is the Celtic kind). */
  culture?: string;
}

/** Scale of the battlefield's figures: small, chunky miniatures on 36 x 18 tiles. */
export const BATTLE_SCALE = 0.74;
/** Render resolution of the battlefield's figures (see DollSpec.res). */
export const BATTLE_RES = 2;
/** Pixels per metre of a figure's render (model3d's camera at scale 1 draws 22.6 px/m). */
export const PPM = 16 * Math.SQRT2;
/** Fine detail (brows, straps, folds, strands) is added from this density on: battle 2x and portraits, not the 1x screens. */
export function fineDetail(d: DollSpec): boolean {
  return (d.scale ?? 1) * (d.res ?? 1) * PPM >= 28;
}

/** The visible cosmetic loadout (slot -> cosmetic id), see src/game/cosmetics.ts. */
export type CosmeticLoadout = Partial<Record<string, string>>;

/** Shield paint of an emblem cosmetic. */
export const COSMETIC_EMBLEMS: Record<string, ItemPaint> = {
  emblem_owl: { emblem: 'owl', field: 'cream', ink: 'ink' },
  emblem_lambda: { emblem: 'lambda', field: 'red', ink: 'cream' },
  emblem_pegasus: { emblem: 'horse', field: 'blue', ink: 'cream' },
  emblem_gorgon: { emblem: 'eye', field: 'ink', ink: 'gold' },
  emblem_pass_s: { emblem: 'star', field: 'gold', ink: 'red' },
  duel_emblem_bronze: { emblem: 'lambda', field: 'bronze', ink: 'cream' },
  duel_emblem_silver: { emblem: 'lambda', field: 'silver', ink: 'ink' },
  duel_emblem_gold: { emblem: 'star', field: 'gold', ink: 'red' },
};
/** Cloak palette key of a cloak cosmetic. */
export const COSMETIC_CLOAKS: Record<string, string> = { cloak_crimson: 'cloakCrimson', cloak_purple: 'cloakRoyal', cloak_pass_s: 'cloakGold' };
/** Crest colour of a crest cosmetic. */
export const COSMETIC_CRESTS: Record<string, string> = { crest_white: 'white', crest_gold: 'gold', crest_purple: 'purple', crest_black: 'black' };
/** Victory pose of a pose cosmetic. */
export const COSMETIC_POSES: Record<string, string> = { pose_salute: 'salute', pose_shield: 'shield' };

/** Dress a figure in the player's cosmetics (shield paint, cloak, crest, army skin, victory pose). */
export function applyCosmetics(d: DollSpec, lo: CosmeticLoadout | undefined): DollSpec {
  if (!lo || d.beast) return d;
  const o: DollSpec = { ...d };
  const skin = lo.army_skin;
  if (skin === 'skin_bronze') o.polish = true;
  if (skin === 'skin_macedon') {
    if (o.shield) o.shield = { ...o.shield, paint: { emblem: 'sunwheel', field: 'blue', ink: 'bronze' } };
    o.cloak = 'cloakRoyal';
    o.crest = 'purple';
  }
  const em = lo.emblem ? COSMETIC_EMBLEMS[lo.emblem] : undefined;
  if (em && o.shield) o.shield = { ...o.shield, paint: { ...em } };
  const cl = lo.cloak ? COSMETIC_CLOAKS[lo.cloak] : undefined;
  if (cl) {
    o.cloak = cl;
    o.cloakTrim = lo.cloak === 'cloak_pass_s';
  }
  const cr = lo.crest ? COSMETIC_CRESTS[lo.crest] : undefined;
  if (cr) o.crest = cr;
  const ps = lo.pose ? COSMETIC_POSES[lo.pose] : undefined;
  if (ps) o.victory = ps;
  return o;
}

export function dollFromHero(h: Pick<Hero, 'look' | 'equip' | 'cls' | 'arch' | 'culture' | 'id'>, cosmetics?: CosmeticLoadout): DollSpec {
  const cls = CLASSES[classOfHero({ cls: h.cls, arch: h.arch, culture: h.culture, weaponDef: h.equip.weapon?.def })];
  const seed = hashId(h.id ?? '');
  if (cls.kind === 'animal') return { look: h.look, beast: cls.beast, seed };
  const art = (it?: Item) => (it ? itemDef(it.def).art : undefined);
  const tag = (it?: Item): GearTag | undefined => (it ? { def: it.def, r: rarityRank(it.rarity) } : undefined);
  const twoHanded = h.equip.weapon ? !!itemDef(h.equip.weapon.def).twoHanded : false;
  const spec: DollSpec = {
    look: h.look,
    weapon: art(h.equip.weapon),
    shield: h.equip.shield && !twoHanded ? { art: art(h.equip.shield)!, paint: shieldPaintOf(h.equip.shield) } : undefined,
    helmet: h.equip.helmet ? { art: art(h.equip.helmet)!, paint: h.equip.helmet.paint } : undefined,
    armor: art(h.equip.armor),
    cloak: cls.art.cloak,
    trousers: cls.art.trousers,
    bare: cls.art.bare,
    mount: cls.mount,
    coat: cls.mount ? seed % COATS.length : undefined,
    seed: seed % 97,
    gear: {
      weapon: tag(h.equip.weapon),
      shield: h.equip.shield && !twoHanded ? tag(h.equip.shield) : undefined,
      helmet: tag(h.equip.helmet),
      armor: tag(h.equip.armor),
      trinket: tag(h.equip.trinket),
    },
    culture: h.culture,
  };
  return applyCosmetics(spec, cosmetics);
}

function shieldPaintOf(it: Item): ItemPaint | undefined {
  if (it.def === 'argyraspis') return { ...(it.paint ?? {}), field: 'silver' };
  return it.paint;
}

function hashId(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 100000;
}

const gearKey = (g?: GearTag) => (g ? `${g.def ?? ''}${g.r ?? ''}` : '');

export function dollKey(d: DollSpec): string {
  const l = d.look;
  const p = (x?: ItemPaint) => (x ? `${x.emblem ?? ''}.${x.field ?? ''}.${x.ink ?? ''}` : '');
  if (d.res && d.res !== 1) return `${dollKey({ ...d, res: undefined })}#r${d.res}`;
  if (d.scale && d.scale !== 1 && !isMythId(d.beast)) return `${dollKey({ ...d, scale: undefined })}@${d.scale}`;
  if (d.beast) return `beast_${d.beast}${d.pose ?? ''}${d.beast === 'hydra_head' || d.beast === 'kraken_arm' ? `_${(d.seed ?? 0) % 3}` : ''}`;
  const g = d.gear;
  const gk = g ? `_${gearKey(g.weapon)}.${gearKey(g.shield)}.${gearKey(g.helmet)}.${gearKey(g.armor)}.${gearKey(g.trinket)}` : '';
  const extra = `${d.crest ?? ''}${d.cloakTrim ? 't' : ''}${d.polish ? 'p' : ''}${d.victory ?? ''}${d.culture === 'celtic' ? 'c' : ''}`;
  return `doll3_${l.skin}${l.hair}${l.hairStyle}${l.beard}${l.tunic}_${d.weapon ?? '-'}_${d.shield?.art ?? '-'}${p(d.shield?.paint)}_${d.helmet?.art ?? '-'}${p(d.helmet?.paint)}_${d.armor ?? '-'}_${d.cloak ?? ''}${d.trousers ?? ''}${d.bare ? 'b' : ''}_${d.mount ?? ''}${d.coat ?? ''}_${(d.seed ?? 0) % 8}${gk}${extra}`;
}

export function dollGeom(d: DollSpec): SheetGeom {
  if (d.res && d.res !== 1) {
    const g = dollGeom({ ...d, res: undefined });
    return { fw: g.fw * d.res, fh: g.fh * d.res, footY: g.footY * d.res };
  }
  if (isMythId(d.beast)) return MYTH_GEOM[d.beast];
  if (d.scale && d.scale !== 1) {
    const g = dollGeom({ ...d, scale: undefined });
    return { fw: Math.ceil((g.fw * d.scale) / 2) * 2, fh: Math.ceil(g.fh * d.scale), footY: Math.round(g.footY * d.scale) };
  }
  if (d.beast === 'bear') return GEOM.bear;
  if (d.beast) return GEOM.small;
  if (d.mount === 'chariot') return GEOM.chariot;
  if (d.mount) return GEOM.horse;
  return GEOM.man;
}

/** Columns of this figure's sheet (a UI texture): NFRAMES for a man on foot, LEGACY_FRAMES otherwise. */
export function sheetFrames(d: DollSpec): number {
  return d.beast || d.mount ? LEGACY_FRAMES : NFRAMES;
}

/**
 * Distinct poses this figure's builder draws: every column (NFRAMES) for men,
 * riders and animals; the sixteen legacy ones for chariots and mythic beasts.
 * The battle's atlases draw frames one at a time, so a rider there has the
 * full set (a walk and a gallop, two deaths) while his UI sheet stays at 16.
 */
export function drawnFrames(d: DollSpec): number {
  return d.mount === 'chariot' || isMythId(d.beast) ? LEGACY_FRAMES : NFRAMES;
}

// ================================================================ rarity effects

export type FxParticles = 'embers' | 'motes' | 'sparkle';

export interface DollFx {
  /** Highest rarity rank worn (0..4). */
  rank: number;
  /** Rare and above: a highlight sweeps across the gear's metal now and then. */
  glint: boolean;
  /** Epic and above: a 1 px outline glow that pulses (colour). */
  outline: number | null;
  /** Legendary: sparse particles (which kind). */
  particles: FxParticles | null;
}

/** Outline colours by rank (palette-limited: epic violet, legendary gold). */
export const FX_OUTLINE = [0, 0, 0, 0xc890f0, 0xffe080];

/** What animated rarity effects a figure carries in battle. */
export function dollFx(d: DollSpec): DollFx {
  const g = d.gear ?? {};
  let rank = 0;
  let best: keyof NonNullable<DollSpec['gear']> | null = null;
  // ties go to the earlier slot: a legendary weapon's embers beat its matching helmet's motes
  for (const s of ['weapon', 'shield', 'helmet', 'armor', 'trinket'] as const) {
    const r = g[s]?.r ?? 0;
    if (r > rank) {
      rank = r;
      best = s;
    }
  }
  return {
    rank,
    glint: rank >= 2 || !!d.polish,
    outline: rank >= 3 ? FX_OUTLINE[rank] : null,
    particles: rank >= 4 ? (best === 'weapon' ? 'embers' : best === 'trinket' ? 'sparkle' : 'motes') : null,
  };
}

// ================================================================ rendering

/** Render the full sprite sheet (columns x 4 facings). */
export function renderSheet(d: DollSpec): Pix {
  const g = dollGeom(d);
  const cols = sheetFrames(d);
  const sheet = new Pix(g.fw * cols, g.fh * NDIRS);
  for (let dir = 0; dir < NDIRS; dir++) {
    for (let f = 0; f < cols; f++) sheet.blit(renderFrame(d, f, dir), f * g.fw, dir * g.fh);
  }
  return sheet;
}

export function renderFrame(d: DollSpec, frame: number, dir: number, mask?: Uint8Array): Pix {
  const g = dollGeom(d);
  const sc = new Scene();
  const [fx, fy] = DIRS[dir];
  const B = basis(fx, fy);
  // figures that draw every column get the frame as is; sixteen-column ones its legacy column
  const lf = drawnFrames(d) >= NFRAMES ? frame : legacyFrame(frame);
  if (isMythId(d.beast)) buildMyth(sc, d.beast, d.pose === 'sp' ? frame : lf, mythBasis(fx, fy), d.pose === 'sp', (d.seed ?? 0) % 3);
  else if (d.beast) buildBeast(sc, d.beast, lf, B, d.seed ?? 0);
  else if (d.mount === 'chariot') buildChariot(sc, d, lf, B, dir);
  else if (d.mount) buildRider(sc, d, lf, B, dir);
  else buildMan(sc, d, frame, B, dir, manPose(d, frame));
  const res = d.res ?? 1;
  const k = (isMythId(d.beast) ? 1 : d.scale ?? 1) * res;
  if (k !== 1) sc.scale(k);
  sc.px = res;
  return sc.render(g.fw, g.fh, Math.floor(g.fw / 2), g.footY, { mask });
}

/**
 * A frame plus its effect layers for rare+ gear: `ring` is a 1 px ring just
 * outside the silhouette (the epic / legendary outline glow, white: tint it),
 * `glint` the gear's metal pixels (white) for the highlight sweep.
 */
export function renderFrameFx(d: DollSpec, frame: number, dir: number): { px: Pix; ring: Pix; glint: Pix } {
  const g = dollGeom(d);
  const mask = new Uint8Array(g.fw * g.fh);
  const px = renderFrame(d, frame, dir, mask);
  return { px, ring: ringOf(px), glint: maskPix(px, mask) };
}

function ringOf(px: Pix): Pix {
  const out = new Pix(px.w, px.h);
  for (let y = 0; y < px.h; y++)
    for (let x = 0; x < px.w; x++) {
      if (px.alpha(x, y) > 0) continue;
      if (px.alpha(x - 1, y) > 0 || px.alpha(x + 1, y) > 0 || px.alpha(x, y - 1) > 0 || px.alpha(x, y + 1) > 0) out.set(x, y, 0xffffff);
    }
  return out;
}

function maskPix(px: Pix, mask: Uint8Array): Pix {
  const out = new Pix(px.w, px.h);
  for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) if (mask[y * px.w + x] && px.alpha(x, y) > 0) out.set(x, y, 0xffffff);
  return out;
}

// ================================================================ local frame

interface Basis {
  F: V3;
  R: V3;
  U: V3;
  /** Local (forward, right, up) -> world, relative to an origin. */
  at(o: V3, f: number, r: number, u: number): V3;
  dir(f: number, r: number, u: number): V3;
}

function basis(fx: number, fy: number): Basis {
  const F: V3 = [fx, fy, 0];
  const U: V3 = [0, 0, 1];
  const L = cross(F, U); // the figure's left
  const R: V3 = mul(L, -1);
  return {
    F,
    R,
    U,
    at: (o, f, r, u) => add(o, add(add(mul(F, f), mul(R, r)), mul(U, u))),
    dir: (f, r, u) => norm(add(add(mul(F, f), mul(R, r)), mul(U, u))),
  };
}

/** Two-bone IK: the middle joint between root a and end c, bending towards pole. */
function ik(a: V3, c: V3, l1: number, l2: number, pole: V3): { mid: V3; end: V3 } {
  let d = sub(c, a);
  let dl = len(d);
  const max = l1 + l2 - 1e-3;
  if (dl > max) {
    d = mul(d, max / dl);
    dl = max;
  }
  const end = add(a, d);
  const dir = mul(d, 1 / (dl || 1));
  const cosA = Math.max(-1, Math.min(1, (l1 * l1 + dl * dl - l2 * l2) / (2 * l1 * (dl || 1))));
  const pp = norm(sub(pole, mul(dir, pole[0] * dir[0] + pole[1] * dir[1] + pole[2] * dir[2])));
  const mid = add(add(a, mul(dir, l1 * cosA)), mul(pp, l1 * Math.sqrt(1 - cosA * cosA)));
  return { mid, end };
}

// ================================================================ the man

/** What the body is doing; the weapon class decides the arms for each. */
type Act = 'idle' | 'walk' | 'run' | 'rout' | 'wind' | 'cock' | 'strike' | 'follow' | 'recover' | 'block' | 'hit' | 'fall' | 'win';
/** Older arm names (riders, chariot crews). */
type ArmPose = Act | 'rest' | 'raise';

interface ManPose {
  /** Pelvis height and offset (forward, right). */
  hip: number;
  pf: number;
  pr: number;
  /** Torso lean forward (m of shoulder offset), sideways roll, and twist (+ = right shoulder forward, radians). */
  lean: number;
  roll: number;
  twist: number;
  /** Feet: [forward, right, lift]. */
  footL: V3;
  footR: V3;
  arm: ArmPose;
  /** Sub-step of the act (idle breath 0..3, victory 0..1). */
  k: number;
  /** Free-arm swing (walking) forward offset. */
  swing: number;
  /** Death: rotation (radians), backwards or forwards (dieB), and blood. */
  fall: number;
  fallFwd: boolean;
  dead: boolean;
  /** Seated on a horse / standing in a chariot. */
  seated?: boolean;
  /** Walk cycle angle (radians) or NaN. */
  phase: number;
  /** Breathing in (0..1): the chest lifts. */
  breath: number;
  /** Follow-through of cloak, crest tail and long hair (+ = trailing backwards, metres). */
  lag: number;
  /** Head nod (+ forward) for flinches. */
  nod: number;
  /** Victory with the shield raised overhead. */
  shieldUp?: boolean;
  /** Portraits: eyes closed this frame, head turned (radians, + = to his right). */
  blink?: boolean;
  yaw?: number;
}

function basePose(): ManPose {
  return {
    hip: 0.95, pf: 0, pr: 0, lean: 0, roll: 0, twist: 0, footL: [0.04, -0.12, 0], footR: [-0.04, 0.12, 0],
    arm: 'idle', k: 0, swing: 0, fall: 0, fallFwd: false, dead: false, phase: NaN, breath: 0, lag: 0.03, nod: 0,
  };
}

function manPose(d: DollSpec, frame: number): ManPose {
  const p = basePose();
  const wc = weaponClass(d.weapon);
  const heavy = wc === 'two' || wc === 'chop';
  const swingy = wc === 'blade' || heavy || wc === 'jav';
  const seed = d.seed ?? 0;
  // a fighting stance: left foot forward, behind the shield
  if (d.shield && !isRangedClass(wc)) {
    p.footL = [0.16, -0.13, 0];
    p.footR = [-0.12, 0.13, 0];
    p.hip = 0.93;
  }
  const name = FRAME_NAMES[frame] ?? 'idle0';
  const num = (pre: string) => Number(name.slice(pre.length));
  if (name.startsWith('idle')) {
    p.k = [0, 2, 1, 3][num('idle')];
    // breathe in (chest up), settle (spear tip dips), shift weight and shield
    if (p.k === 1) p.breath = 1;
    if (p.k === 2) {
      p.hip -= 0.03;
      p.lean += 0.03;
      p.lag = 0.02;
    }
    if (p.k === 3) {
      p.pr = (seed & 1 ? 0.02 : -0.02);
      p.roll = seed & 1 ? -0.02 : 0.02;
      p.breath = 0.5;
    }
  } else if (name.startsWith('walk')) {
    // eight phases, 45 degrees apart
    const k = num('walk');
    const ph = (k * Math.PI) / 4;
    p.arm = 'walk';
    p.phase = ph;
    // the swing foot lifts in an arc that peaks early (heel up, toe through), the stance foot stays planted
    const arc = (x: number) => Math.pow(Math.max(0, x), 0.75);
    p.footL = [0.24 * Math.cos(ph), -0.12, arc(Math.sin(ph)) * 0.13];
    p.footR = [-0.24 * Math.cos(ph), 0.12, arc(-Math.sin(ph)) * 0.13];
    // a clear 1 px bob: lowest on the contact frames (feet apart), highest when passing
    p.hip = 0.95 - Math.abs(Math.cos(ph)) * 0.06;
    // weight shifts over the planted foot: the pelvis sways sideways and the shoulders tilt the other way
    const sway = Math.sin(ph + 0.4);
    p.pr = -0.028 * sway;
    p.roll = 0.035 * sway;
    p.lean = 0.05;
    p.swing = -0.14 * Math.cos(ph);
    // counter-rotation: the shoulders turn against the hips as the arms swing
    p.twist = -0.1 * Math.cos(ph);
    // a slight nod on each contact
    p.nod = 0.008 * Math.abs(Math.cos(ph));
    // the cloak and crest bounce twice a stride, trailing behind the bob
    p.lag = 0.06 + 0.035 * Math.sin(2 * ph - 0.9);
  } else if (name.startsWith('run') || name.startsWith('rout')) {
    const rout = name.startsWith('rout');
    const n = rout ? 4 : 6;
    const k = rout ? num('rout') : num('run');
    const ph = (k * Math.PI * 2) / n;
    p.arm = rout ? 'rout' : 'run';
    p.phase = ph;
    const stride = rout ? 0.34 : 0.4;
    // running: the swing leg folds high behind, the body floats up between contacts
    p.footL = [stride * Math.cos(ph), -0.11, Math.pow(Math.max(0, Math.sin(ph)), 0.8) * 0.26];
    p.footR = [-stride * Math.cos(ph), 0.11, Math.pow(Math.max(0, -Math.sin(ph)), 0.8) * 0.26];
    p.hip = 0.92 - Math.abs(Math.cos(ph)) * 0.07 + Math.abs(Math.sin(ph)) * 0.02;
    p.pr = -0.022 * Math.sin(ph + 0.4);
    p.roll = 0.04 * Math.sin(ph + 0.4);
    p.lean = rout ? 0.2 : 0.17;
    p.swing = -0.28 * Math.cos(ph);
    p.twist = -0.16 * Math.cos(ph);
    p.nod = rout ? 0.02 : 0.01;
    p.lag = 0.2 + 0.05 * Math.sin(2 * ph);
  } else {
    switch (name) {
      case 'wind':
        p.arm = 'wind';
        p.lean = -0.02;
        p.twist = swingy ? -0.18 : wc === 'bow' ? -0.35 : 0;
        p.footL = [0.18, -0.13, 0];
        p.footR = [-0.16, 0.14, 0];
        p.lag = 0.02;
        break;
      case 'atk0':
        p.arm = 'cock';
        p.lean = heavy ? -0.07 : -0.04;
        p.twist = swingy ? -0.32 : wc === 'bow' ? -0.5 : wc === 'spear' ? -0.1 : 0;
        p.footL = [0.2, -0.13, 0];
        p.footR = [-0.2, 0.14, 0];
        p.hip = 0.93;
        p.lag = 0;
        break;
      case 'atk1':
        p.arm = 'strike';
        p.lean = wc === 'bow' ? 0 : heavy ? 0.14 : 0.11;
        p.pf = wc === 'bow' || wc === 'sling' ? 0 : 0.07;
        p.twist = swingy ? 0.22 : wc === 'bow' ? -0.5 : wc === 'spear' ? 0.12 : 0.05;
        p.footL = [0.32, -0.13, 0];
        p.footR = [-0.2, 0.14, 0];
        p.hip = 0.89;
        p.lag = 0.1;
        break;
      case 'follow':
        p.arm = 'follow';
        p.lean = wc === 'bow' ? 0.02 : heavy ? 0.17 : 0.13;
        p.pf = wc === 'bow' ? 0 : 0.09;
        p.twist = swingy ? 0.4 : wc === 'bow' ? -0.45 : 0.15;
        p.footL = [0.34, -0.13, 0];
        p.footR = [-0.18, 0.14, wc === 'jav' ? 0.06 : 0];
        p.hip = 0.88;
        p.lag = 0.06;
        break;
      case 'atk2':
        p.arm = 'recover';
        p.lean = 0.04;
        p.twist = swingy ? 0.12 : 0.02;
        p.footL = [0.22, -0.13, 0];
        p.footR = [-0.16, 0.14, 0];
        p.lag = -0.03;
        break;
      case 'block':
        p.arm = 'block';
        p.lean = -0.05;
        p.hip = 0.9;
        p.footL = [0.22, -0.15, 0];
        p.footR = [-0.22, 0.15, 0];
        p.lag = 0.05;
        break;
      case 'hit':
        p.arm = 'hit';
        p.lean = -0.1;
        p.pf = -0.05;
        p.hip = 0.91;
        p.nod = -0.04;
        p.lag = -0.05;
        break;
      case 'hit1':
        p.arm = 'hit';
        p.lean = -0.03;
        p.pf = -0.04;
        p.hip = 0.9;
        p.roll = 0.05;
        p.nod = 0.03;
        p.lag = 0.02;
        break;
      case 'die0':
        // the stagger: knees buckle, the head snaps back, a hand goes to the wound
        p.arm = 'fall';
        p.hip = 0.78;
        p.lean = -0.14;
        p.nod = -0.05;
        p.roll = 0.04;
        p.footL = [0.25, -0.15, 0];
        p.footR = [0.05, 0.15, 0];
        p.lag = -0.04;
        break;
      case 'die1':
        // toppling: the fall starts slowly (ease-in), arms thrown out
        p.arm = 'fall';
        p.hip = 0.64;
        p.fall = 0.5;
        p.dead = true;
        p.nod = -0.03;
        p.footL = [0.3, -0.15, 0.02];
        p.footR = [0.12, 0.18, 0];
        p.lag = -0.08;
        break;
      case 'die1b':
        // the body hits the ground hard: the fastest step, legs kicked up
        p.arm = 'fall';
        p.hip = 0.57;
        p.fall = 1.22;
        p.dead = true;
        p.footL = [0.31, -0.15, 0.06];
        p.footR = [0.16, 0.19, 0.03];
        p.lag = -0.1;
        break;
      case 'die2':
        // settled flat, the legs dropped
        p.arm = 'fall';
        p.hip = 0.55;
        p.fall = 1.5;
        p.dead = true;
        p.footL = [0.32, -0.16, 0];
        p.footR = [0.2, 0.2, 0];
        break;
      case 'dieB0':
      case 'dieB1':
      case 'dieB2':
      case 'dieB3': {
        // to the knees, then forwards onto the face
        const k = num('dieB');
        p.arm = 'fall';
        p.fallFwd = true;
        // down onto one knee, a pause, then the body pitches over (ease-in) and slumps
        p.hip = [0.58, 0.52, 0.48, 0.46][k];
        p.lean = [0.16, 0.26, 0.25, 0.25][k];
        p.roll = [0.03, 0.05, 0.02, 0][k];
        p.footL = [0.22, -0.14, 0];
        p.footR = [-0.3, 0.14, 0];
        p.fall = [0, 0.4, 1.0, 1.45][k];
        p.dead = k > 0;
        p.nod = [0.04, 0.08, 0.06, 0.02][k];
        p.lag = [-0.02, -0.06, -0.08, 0][k];
        break;
      }
      case 'win0':
      case 'win1':
        p.arm = 'win';
        p.k = num('win');
        p.shieldUp = d.victory === 'shield';
        p.lean = -0.04;
        p.hip = p.k ? 0.97 : 0.94;
        p.footL = [0.08, -0.14, 0];
        p.footR = [-0.08, 0.14, 0];
        p.lag = p.k ? -0.02 : 0.05;
        break;
    }
  }
  return p;
}

interface Skeleton {
  pelvis: V3;
  chest: V3;
  neck: V3;
  head: V3;
  shL: V3;
  shR: V3;
  hipL: V3;
  hipR: V3;
  kneeL: V3;
  kneeR: V3;
  ankleL: V3;
  ankleR: V3;
  elbowL: V3;
  elbowR: V3;
  handL: V3;
  handR: V3;
  /** The weapon's pointing direction (world) and where along it the hand grips (0..1 behind the hand). */
  wdir: V3;
  grip: number;
  /** Spine up and the torso's own forward (lean included). */
  up: V3;
  fwd: V3;
}

/** Per-man build: [width, height] factors from the seed (a formation is not a row of clones). */
function build(seed: number): [number, number] {
  return [0.94 + hash2(seed, 3, 11) * 0.14, 0.97 + hash2(seed, 5, 13) * 0.06];
}

/**
 * Hands (local forward, right, up from the chest base, pelvis + 0.36) and the
 * weapon direction (local) for a weapon class and act.
 */
function rig(d: DollSpec, p: ManPose): { R: V3; L: V3; w: V3; grip: number } {
  const wc = weaponClass(d.weapon);
  const sh = !!d.shield;
  const k = p.k;
  // default: weapon hand at the side, shield forearm across the body
  // relaxed arms hang with a slight bend; a held shield sits across the body
  let R: V3 = [0.08 + (sh ? 0 : p.swing), 0.25, -0.26];
  let L: V3 = sh ? [0.32, -0.04, 0.22] : [0.05 - p.swing, -0.25, -0.26];
  let w: V3 = [0.25, 0.05, 1];
  let grip = 0;
  // the shield arm: breathing shifts, bracing, raising
  if (sh) {
    if (p.arm === 'idle' && k === 3) L = [0.3, -0.06, 0.17];
    if (p.arm === 'idle' && k === 1) L = [0.32, -0.04, 0.24];
    if (p.arm === 'walk') L = [0.32, -0.05, 0.2 + Math.sin(p.phase * 2) * 0.015];
    if (p.arm === 'run') L = [0.38, -0.03, 0.27];
    if (p.arm === 'block') L = [0.4, -0.01, 0.42];
    if (p.arm === 'hit') L = [0.28, -0.07, 0.3];
    if (p.arm === 'cock' || p.arm === 'wind') L = [0.34, -0.03, 0.26];
    if (p.arm === 'strike' || p.arm === 'follow') L = [0.3, -0.08, 0.2];
  }
  const a = p.arm;
  const rest = a === 'idle' || a === 'rest' || a === 'walk';
  switch (wc) {
    case 'spear': {
      grip = 0.42;
      if (rest) {
        // upright, butt-spike near the foot: the hedge of a phalanx at rest; slanted forward on the march
        R = [0.1, 0.25, 0.08 + (a === 'walk' && !Number.isNaN(p.phase) ? Math.sin(p.phase * 2) * 0.012 : 0)];
        // a rider keeps it slanted up and forward, clear of the horse's neck
        w = p.seated ? [0.45, 0, 1] : a === 'walk' ? [0.32, 0.02, 1] : [0.08 + (k === 2 ? 0.06 : 0) + hash2(d.seed ?? 0, 1, 2) * 0.05, 0, 1];
        grip = 0.28;
      } else if (a === 'run') {
        // levelled for the charge, underarm
        R = [0.12, 0.24, -0.02];
        w = [1, 0, 0.06];
        grip = 0.5;
      } else if (a === 'wind') {
        R = [-0.14, 0.24, 0.5];
        w = [1, 0, -0.08];
      } else if (a === 'cock' || a === 'raise') {
        R = [-0.24, 0.22, 0.58];
        w = [1, 0, -0.16];
      } else if (a === 'strike') {
        R = [0.5, 0.16, 0.48];
        w = [1, 0, -0.22];
      } else if (a === 'follow') {
        R = [0.6, 0.12, 0.42];
        w = [1, -0.03, -0.3];
      } else if (a === 'recover') {
        R = [0.22, 0.24, 0.42];
        w = [1, 0, -0.04];
      } else if (a === 'block') {
        R = [-0.04, 0.26, 0.32];
        w = [1, 0, 0.12];
      } else if (a === 'hit') {
        R = [0.02, 0.3, 0.16];
        w = [0.45, 0.05, 1];
        grip = 0.3;
      } else if (a === 'rout') {
        R = [-0.05 + p.swing * 0.5, 0.26, -0.05];
        w = [-0.9, 0.1, 0.35];
        grip = 0.5;
      } else if (a === 'win') {
        if (d.victory === 'salute') {
          R = [0.14, 0.22, 0.62 + k * 0.04];
          w = [0.06, 0, 1];
          grip = 0.25;
        } else {
          R = [0.0, 0.24, 0.85 + k * 0.12];
          w = [0.15, 0, 1];
          grip = 0.4;
        }
      }
      break;
    }
    case 'lance': {
      grip = 0.35;
      if (rest) {
        // carried at the thigh, slanting up over the shoulder
        R = [0.12, 0.22, 0.12];
        w = p.seated ? [0.5, 0, 1] : [0.25, 0, 1];
        grip = 0.28;
      } else if (a === 'run') {
        // couched for the charge
        R = [0.1, 0.22, 0.06];
        w = [1, 0, -0.04];
        grip = 0.42;
      } else if (a === 'wind') {
        // drawn back along the flank
        R = [-0.16, 0.24, 0.12];
        w = [1, 0, 0.04];
      } else if (a === 'cock' || a === 'raise') {
        R = [-0.3, 0.26, 0.16];
        w = [1, 0, 0.0];
      } else if (a === 'strike') {
        R = [0.56, 0.14, 0.2];
        w = [1, 0, -0.12];
      } else if (a === 'follow') {
        R = [0.64, 0.1, 0.14];
        w = [1, -0.03, -0.18];
      } else if (a === 'recover') {
        R = [0.26, 0.2, 0.18];
        w = [1, 0, 0.05];
      } else if (a === 'hit') {
        R = [0.0, 0.3, 0.3];
        w = [0.6, 0.1, 0.8];
      } else if (a === 'rout') {
        R = [-0.05, 0.26, 0.0];
        w = [-0.8, 0.1, 0.5];
        grip = 0.5;
      } else if (a === 'win') {
        R = [0.05, 0.24, 0.8 + k * 0.1];
        w = [0.15, 0, 1];
        grip = 0.3;
      } else {
        R = [0.2, 0.2, 0.2];
        w = [1, 0, 0.1];
      }
      if (!sh) L = add(R, mul(norm(w), -0.32));
      break;
    }
    case 'blade':
    case 'chop':
    case 'none': {
      const chop = wc === 'chop';
      if (rest) w = chop ? [0.35, 0.05, 1] : [0.45, 0.08, 0.85];
      else if (a === 'run') {
        R = [0.14, 0.26, 0.1 + p.swing * 0.3];
        w = [0.8, 0.05, 0.6];
      } else if (a === 'wind') {
        R = [-0.08, 0.3, 0.52];
        w = chop ? [-0.4, 0.05, 1] : [-0.5, 0.2, 0.85];
      } else if (a === 'cock' || a === 'raise') {
        R = chop ? [-0.1, 0.2, 0.88] : [-0.12, 0.26, 0.8];
        w = chop ? [-0.65, 0, 0.75] : [-0.75, 0.15, 0.6];
      } else if (a === 'strike') {
        R = chop ? [0.46, 0.1, 0.36] : [0.46, 0.14, 0.4];
        w = chop ? [1, 0, -0.15] : [1, -0.2, 0.1];
      } else if (a === 'follow') {
        R = chop ? [0.42, 0.08, 0.02] : [0.42, -0.06, 0.08];
        w = chop ? [0.45, 0, -0.9] : [0.55, -0.65, -0.55];
      } else if (a === 'recover') {
        R = [0.24, 0.26, 0.2];
        w = [0.8, 0.1, 0.45];
      } else if (a === 'block') {
        R = [0.26, 0.2, 0.42];
        w = [0.55, -0.35, 0.8];
      } else if (a === 'hit') {
        R = [0.02, 0.3, 0.12];
        w = [0.5, 0.2, 0.7];
      } else if (a === 'rout') {
        R = [-0.08, 0.28, 0.0 + p.swing * 0.2];
        w = [-0.6, 0.2, 0.6];
      } else if (a === 'win') {
        R = d.victory === 'salute' ? [0.18, 0.2, 0.55] : [0.02, 0.24, 0.88 + k * 0.1];
        w = d.victory === 'salute' ? [0.12, 0, 1] : [0.1, 0.05, 1];
      }
      break;
    }
    case 'two': {
      // both hands on the haft: the left hand is placed along it below the right
      if (rest) {
        R = [0.22, 0.18, 0.2];
        w = [0.35, -0.1, 1];
      } else if (a === 'run') {
        R = [0.22, 0.2, 0.18];
        w = [0.6, -0.1, 0.8];
      } else if (a === 'wind') {
        R = [0.0, 0.22, 0.6];
        w = [-0.5, 0, 1];
      } else if (a === 'cock' || a === 'raise') {
        R = [-0.06, 0.12, 0.85];
        w = [-0.8, 0, 0.6];
      } else if (a === 'strike') {
        R = [0.52, 0.08, 0.3];
        w = [1, -0.1, -0.1];
      } else if (a === 'follow') {
        R = [0.42, -0.02, 0.0];
        w = [0.6, -0.3, -0.75];
      } else if (a === 'recover') {
        R = [0.3, 0.16, 0.15];
        w = [0.8, 0, 0.5];
      } else if (a === 'block') {
        R = [0.28, 0.24, 0.45];
        w = [0.2, -1, 0.35];
      } else if (a === 'win') {
        R = [0.0, 0.2, 0.9 + k * 0.08];
        w = [0.1, 0, 1];
      } else {
        R = [0.1, 0.26, 0.1];
        w = [0.4, 0, 0.9];
      }
      L = add(R, mul(norm(w), -0.3));
      break;
    }
    case 'bow': {
      L = [0.18, -0.22, 0.1 - (a === 'walk' ? p.swing * 0.3 : 0)];
      if (a === 'wind') {
        L = [0.48, -0.1, 0.42];
        R = [0.32, -0.04, 0.44];
      } else if (a === 'cock' || a === 'raise') {
        L = [0.62, -0.06, 0.5];
        R = [0.02, 0.06, 0.56];
      } else if (a === 'strike') {
        L = [0.62, -0.06, 0.5];
        R = [-0.12, 0.16, 0.56];
      } else if (a === 'follow') {
        L = [0.6, -0.08, 0.46];
        R = [-0.1, 0.22, 0.44];
      } else if (a === 'recover') {
        L = [0.4, -0.15, 0.3];
        R = [0.12, 0.24, 0.16];
      } else if (a === 'run' || a === 'rout') {
        L = [0.2 - p.swing * 0.5, -0.22, 0.12];
        R = [0.05 + p.swing * 0.5, 0.26, -0.02];
      } else if (a === 'win') {
        L = [0.1, -0.2, 0.88 + k * 0.1];
        R = [0.06, 0.25, 0.0];
      }
      break;
    }
    case 'sling': {
      if (a === 'wind' || a === 'cock' || a === 'raise') {
        R = [0.0, 0.16, 0.92];
        L = [0.45, -0.2, 0.42];
      } else if (a === 'strike') {
        R = [0.56, 0.16, 0.5];
        L = [0.2, -0.26, 0.15];
      } else if (a === 'follow') {
        R = [0.5, 0.0, 0.2];
        L = [0.12, -0.28, 0.05];
      } else if (a === 'recover') R = [0.2, 0.26, 0.0];
      else if (a === 'win') R = [0.02, 0.22, 0.9 + k * 0.1];
      else if (a === 'run' || a === 'rout') {
        R = [0.05 + p.swing * 0.6, 0.27, -0.05];
        if (!sh) L = [0.05 - p.swing * 0.6, -0.27, -0.05];
      }
      break;
    }
    case 'jav': {
      L = sh ? L : [0.12, -0.24, 0.05];
      w = [0.3, 0, 1];
      if (a === 'wind') {
        R = [-0.08, 0.27, 0.45];
        L = sh ? [0.36, -0.06, 0.32] : [0.42, -0.22, 0.42];
        w = [1, 0, 0.3];
      } else if (a === 'cock' || a === 'raise') {
        R = [-0.3, 0.28, 0.6];
        L = sh ? [0.38, -0.04, 0.34] : [0.5, -0.2, 0.48];
        w = [1, 0, 0.25];
      } else if (a === 'strike') {
        R = [0.46, 0.18, 0.62];
        w = [1, 0, 0.2];
      } else if (a === 'follow') {
        R = [0.5, 0.02, 0.18];
        w = [1, 0, 0.2];
      } else if (a === 'recover') {
        R = [0.18, 0.26, 0.1];
        w = [0.35, 0, 1];
      } else if (a === 'run' || a === 'rout') {
        R = [0.08 + p.swing * 0.5, 0.26, 0.05];
        w = [0.5, 0, 1];
      } else if (a === 'win') {
        R = [0.0, 0.24, 0.85 + k * 0.1];
        w = [0.1, 0, 1];
      }
      grip = 0.4;
      break;
    }
  }
  // routing men have flung the shield onto the back: both arms pump
  if (a === 'rout' && sh) L = [0.05 - p.swing * 0.6, -0.27, -0.02];
  if (a === 'win' && d.victory === 'shield' && sh) L = [0.12, -0.12, 0.92 + k * 0.08];
  if (a === 'fall') {
    R = [0.18, 0.32, 0.12];
    L = [0.12, -0.32, 0.18];
  }
  if (p.seated && a === 'hit' && !sh) L = [0.42, -0.1, 0.22];
  return { R, L, w, grip };
}

function skeleton(B: Basis, o: V3, d: DollSpec, p: ManPose): Skeleton {
  const [bw, bh] = build(d.seed ?? 0);
  const pelvis = B.at(o, p.pf, p.pr, p.hip * bh);
  const up = norm(add(add(B.U, mul(B.F, p.lean * 1.6)), mul(B.R, p.roll)));
  const fwd = norm(sub(B.F, mul(up, B.F[0] * up[0] + B.F[1] * up[1] + B.F[2] * up[2])));
  const chest = add(pelvis, mul(up, 0.36 * bh));
  const neck = add(pelvis, mul(up, (0.56 + p.breath * 0.012) * bh));
  const head = add(add(neck, mul(up, 0.13)), mul(B.F, 0.02 + p.nod + p.lean * 0.15));
  // the shoulder line turns with the twist (+ = right shoulder forward)
  const Rt = add(mul(B.R, Math.cos(p.twist)), mul(B.F, Math.sin(p.twist)));
  const shW = 0.2 * bw + p.breath * 0.006;
  const shL = add(add(neck, mul(Rt, -shW)), mul(up, -0.06 + p.breath * 0.01));
  const shR = add(add(neck, mul(Rt, shW)), mul(up, -0.06 + p.breath * 0.01));
  const hipL = B.at(pelvis, 0, -0.1, -0.04);
  const hipR = B.at(pelvis, 0, 0.1, -0.04);
  let footL = B.at(o, p.footL[0], p.footL[1], 0.06 + p.footL[2]);
  let footR = B.at(o, p.footR[0], p.footR[1], 0.06 + p.footR[2]);
  const legPole = B.dir(1, 0, 0.1);
  if (p.seated) {
    footL = B.at(pelvis, 0.12, -0.28, -0.72);
    footR = B.at(pelvis, 0.12, 0.28, -0.72);
  }
  const lL = ik(hipL, footL, 0.46 * bh, 0.44 * bh, p.seated ? B.dir(1, -0.6, 0) : legPole);
  const lR = ik(hipR, footR, 0.46 * bh, 0.44 * bh, p.seated ? B.dir(1, 0.6, 0) : legPole);
  const rg = rig(d, p);
  const base = add(pelvis, mul(B.U, 0.36));
  const hR = B.at(base, rg.R[0], rg.R[1], rg.R[2]);
  const hL = B.at(base, rg.L[0], rg.L[1], rg.L[2]);
  const aR = ik(shR, hR, 0.29, 0.27, B.dir(-0.4, 0.6, -1));
  const aL = ik(shL, hL, 0.29, 0.27, B.dir(-0.4, -0.6, -1));
  return {
    pelvis, chest, neck, head, shL, shR, hipL, hipR,
    kneeL: lL.mid, kneeR: lR.mid, ankleL: lL.end, ankleR: lR.end,
    elbowL: aL.mid, elbowR: aR.mid, handL: aL.end, handR: aR.end,
    wdir: B.dir(rg.w[0], rg.w[1], rg.w[2]), grip: rg.grip, up, fwd,
  };
}

/** Dust on the lower legs, scuffs: a little darker near the ground. */
const dusty: (k: number) => (l: V3, w: V3) => Hit | null = (k) => (_l, w) => (w[2] < 0.3 ? { shade: k * (1 - w[2] / 0.3) } : null);

const rankOf = (g?: GearTag) => Math.max(0, Math.min(4, g?.r ?? 1));
const EYE_PX = 0x2e1c16;

function buildMan(sc: Scene, d: DollSpec, _frame: number, B: Basis, dir: number, p: ManPose, origin: V3 = [0, 0, 0]): Skeleton {
  const k = skeleton(B, origin, d, p);
  const look = d.look;
  const skin = SKIN[Math.max(0, Math.min(3, look.skin))];
  const tunic = CLOTH[look.tunic] ?? CLOTH.tunicWhite;
  const seed = d.seed ?? 0;
  const g = d.gear ?? {};
  const armR = rankOf(g.armor);
  const back = dir === 1 || dir === 3;
  const { up, fwd } = k;
  const greaves = d.armor === 'cuirass' || d.helmet?.art === 'corinthian' || d.helmet?.art === 'attic' || (d.armor === 'scale' && seed % 3 === 0) || armR >= 3;
  const greaveMat = d.polish ? bronzeOf(Math.max(2, armR)) : bronzeOf(armR);
  // details that only resolve at 2x (battle) and in portraits: straps, folds, strands, brows
  const fine = fineDetail(d);

  // ---- cloak (behind the body, trailing as he moves)
  if (d.cloak && !p.seated) {
    const cm = CLOTH[d.cloak] ?? CLOTH.cloakRed;
    sc.group();
    const sway = Number.isNaN(p.phase) ? 0 : Math.sin(p.phase) * 0.035;
    const top = mul(add(k.shL, k.shR), 0.5);
    // a short chlamys over the shoulders that streams back when he runs
    const lift = Math.max(0, p.lag - 0.08) * 0.9;
    const bottom = B.at(k.pelvis, -0.2 - p.lag - sway * 0.5 - p.lean * 0.3, sway, -0.2 + lift);
    const mid = mul(add(top, bottom), 0.5);
    const along = sub(top, bottom);
    const trim = d.cloakTrim;
    sc.ellipsoid(add(mid, mul(B.F, -0.08)), mul(B.F, 0.06), mul(B.R, 0.19), mul(norm(along), len(along) / 2 + 0.05), cm, (l) => {
      if (l[2] < -0.8) return trim ? { ramp: GOLD.ramp, shade: 0.5 } : { shade: 0.8 };
      if (Math.abs(l[1]) > 0.9) return { shade: 0.6 };
      // hanging folds: soft vertical bands that gather towards the hem
      if (fine && l[0] < 0.2 && ((Math.floor((l[1] + 1.4) * 4.5 + (l[2] < -0.3 ? 0.5 : 0)) & 1) === 0)) return { shade: 0.45 };
      return null;
    });
    // a fold line down the middle
    sc.line(add(top, mul(B.F, -0.15)), add(bottom, mul(B.F, -0.1)), { ramp: cm.ramp.slice(2) }, 1);
    // the brooch at the shoulder
    sc.dot(B.at(k.shR, 0.04, 0.0, 0.04), trim ? 0xffe08a : 0xc8a050, 0.08);
  } else if (d.cloak && p.seated) {
    const cm = CLOTH[d.cloak] ?? CLOTH.cloakRed;
    sc.group();
    sc.ellipsoid(B.at(k.chest, -0.2, 0, -0.08), mul(B.F, 0.06), mul(B.R, 0.2), mul(B.dir(-0.6, 0, 1), 0.3), cm);
  }

  // ---- legs
  sc.group();
  const legMat = d.trousers ? CLOTH[d.trousers] ?? CLOTH.trouserBrown : skin;
  const checks: (l: V3, w: V3) => Hit | null = d.trousers
    ? (l, w) => (((Math.floor(w[2] * 22) + Math.floor((w[0] - w[1]) * 22)) & 1) === 0 ? { shade: 0.7 } : dusty(0.8)(l, w))
    : dusty(0.6);
  for (const [hip, knee, ankle] of [[k.hipL, k.kneeL, k.ankleL], [k.hipR, k.kneeR, k.ankleR]] as [V3, V3, V3][]) {
    sc.limb(hip, knee, 0.085, 0.062, legMat, checks);
    sc.limb(knee, ankle, greaves ? 0.064 : 0.056, 0.042, greaves ? greaveMat : legMat, greaves ? undefined : checks);
    if (greaves) sc.dot(add(knee, mul(B.F, 0.06)), greaveMat.ramp[0], 0.05, !!greaveMat.glint); // the knee boss catches the light
    // sandal / boot (some go barefoot)
    const sandal = d.trousers || seed % 5 !== 2;
    const toe = add(ankle, add(mul(B.F, 0.13), [0, 0, -0.04]));
    if (sandal) sc.limb(ankle, toe, 0.045, 0.035, d.trousers ? DARK_LEATHER : LEATHER);
    else sc.limb(ankle, toe, 0.042, 0.032, skin);
    if (fine && sandal && !d.trousers) {
      // the straps: a crossed thong over the instep and a band round the shin above the ankle
      const shin = lerp3(ankle, knee, 0.18);
      const across = norm(cross(sub(knee, ankle), B.F));
      sc.line(add(shin, mul(across, -0.05)), add(shin, mul(across, 0.05)), DARK_LEATHER, 0.5);
      sc.line(add(ankle, mul(B.F, 0.03)), add(toe, add(mul(across, 0.03), [0, 0, 0.02])), DARK_LEATHER, 0.5);
      sc.line(add(ankle, mul(B.F, 0.03)), add(toe, add(mul(across, -0.03), [0, 0, 0.02])), DARK_LEATHER, 0.5);
    }
    if (fine && greaves) sc.line(add(ankle, mul(B.F, 0.04)), add(lerp3(ankle, knee, 0.95), mul(B.F, 0.065)), { ramp: greaveMat.ramp.slice(0, 2) }, 0.5); // the shin ridge
  }

  // ---- body: hips, skirt, torso
  sc.group();
  const torsoMat: Material = d.bare ? skin : tunic;
  const skirtLen = d.bare ? 0.1 : 0.22;
  const swish = Number.isNaN(p.phase) ? 0 : Math.sin(p.phase) * 0.02;
  // the skirt of the tunic: a dark hem, a crease at the hip, and hanging pleats at 2x
  const pleats = (l: V3): Hit | null => {
    if (l[2] < -0.7) return { shade: 0.9 };
    if (l[1] > 0.55) return { shade: 0.4 };
    if (!d.bare && Math.abs(l[1] + 0.2) < 0.05 && l[0] > 0) return { shade: 0.6 };
    if (fine && !d.bare && l[2] < 0.5 && (Math.floor((Math.atan2(l[1], l[0]) + 4) * 2.3) & 1) === 0) return { shade: 0.4 };
    return null;
  };
  sc.blob(B.at(k.pelvis, -swish, 0, -0.06 - skirtLen / 2), B.F, B.R, B.U, 0.16, 0.2, skirtLen / 2 + 0.08, d.bare ? (d.trousers ? CLOTH[d.trousers] ?? LEATHER : LEATHER) : tunic, pleats);
  const [bw] = build(seed);
  // the tunic's body: cloth gathers under the belt and at the armpits
  const folds = (l: V3): Hit | null => {
    if (!fine) return null;
    if (l[2] < -0.55 && (Math.floor((Math.atan2(l[1], l[0]) + 4) * 2.3) & 1) === 0) return { shade: 0.35 };
    if (l[0] > 0.5 && Math.abs(l[1]) < 0.08) return { shade: 0.3 }; // the neckline's fall
    return null;
  };
  sc.ellipsoid(add(k.pelvis, mul(up, 0.15)), mul(fwd, 0.12), mul(B.R, 0.16 * bw), mul(up, 0.17), torsoMat, d.bare ? muscles : folds);
  sc.ellipsoid(add(k.pelvis, mul(up, 0.38 + p.breath * 0.008)), mul(fwd, 0.135 + p.breath * 0.006), mul(B.R, 0.2 * bw), mul(up, 0.17), torsoMat, d.bare ? muscles : folds);
  // body armour over the torso
  sc.group();
  armour(sc, d.armor, k, B, fwd, up, d.polish ? Math.max(2, armR) : armR, g.armor?.def, seed, !back);
  // belt (zoster) with a bronze buckle
  if (!d.bare || d.trousers) {
    sc.blob(add(k.pelvis, mul(up, 0.04)), fwd, B.R, up, 0.125 * bw, 0.17 * bw, 0.025, d.armor === 'mail' ? DARK_LEATHER : LEATHER, fine ? (l) => (l[2] < -0.5 ? { shade: 0.8 } : null) : undefined);
    if (!back) sc.dot(add(add(k.pelvis, mul(up, 0.04)), mul(fwd, 0.13)), 0xc8a050, 0.06);
    if (!back && fine) sc.dot(add(add(k.pelvis, mul(up, 0.04)), add(mul(fwd, 0.125), mul(B.R, 0.03))), 0x8a6a30, 0.06);
  }

  // ---- arms (skin; sleeves from the tunic; an armband on some)
  sc.group();
  for (const [sh, el, hd, side] of [[k.shL, k.elbowL, k.handL, -1], [k.shR, k.elbowR, k.handR, 1]] as [V3, V3, V3, number][]) {
    sc.limb(sh, el, 0.06, 0.048, skin, d.bare ? undefined : (_l, w) => (len(sub(w, sh)) < 0.12 ? { ramp: torsoMat.ramp } : null));
    sc.limb(el, hd, 0.046, 0.036, skin);
    sc.sphere(hd, 0.042, skin);
    if (side === 1 && seed % 3 === 0) sc.dot(add(mul(el, 0.6), mul(hd, 0.4)), 0xb08a3a, 0.05);
  }

  // ---- head
  sc.group();
  sc.limb(k.neck, add(k.neck, mul(up, 0.08)), 0.055, 0.05, skin);
  const H = k.head;
  // the head may turn (portraits glance aside): its features use a basis rotated about the neck
  const B0 = B;
  if (p.yaw) {
    const c = Math.cos(p.yaw);
    const sn = Math.sin(p.yaw);
    B = basis(B.F[0] * c - B.F[1] * sn, B.F[0] * sn + B.F[1] * c);
  }
  sc.sphere(H, 0.105, skin);
  sc.blob(B.at(H, 0.035, 0, -0.06), B.F, B.R, B.U, 0.07, 0.07, 0.06, skin); // jaw
  sc.sphere(B.at(H, 0.105, 0, -0.01), 0.022, skin); // nose
  const hair = HAIR[Math.max(0, Math.min(3, look.hair))];
  const hairStyle = look.hairStyle;
  const fullFace = d.helmet?.art === 'corinthian';
  // locks and curls: the hair and beard are combed into strands at 2x (a hash so no two men match)
  const strands = (l: V3): Hit | null => (fine && ((Math.floor((Math.atan2(l[1], l[0]) + 4) * 5) + Math.floor((l[2] + 1) * 4) + seed) & 1) === 0 ? { shade: 0.55 } : null);
  if (hairStyle !== 2) sc.blob(B.at(H, -0.025, 0, 0.03), B.F, B.R, B.U, 0.1, 0.112, 0.1, hair, strands);
  else if (fine) sc.blob(B.at(H, -0.03, 0, 0.04), B.F, B.R, B.U, 0.095, 0.106, 0.09, { ...hair, contrast: 0.6 }, (l) => (l[2] > 0.3 ? { shade: 0.6 } : { shade: 1.3 })); // cropped: a shadow of stubble
  if (hairStyle === 1) {
    // long hair down the back, swinging with the body
    sc.limb(B.at(H, -0.06, 0, -0.02), B.at(H, -0.1 - p.lag * 0.5, 0, -0.17 + Math.max(0, p.lag - 0.1) * 0.4), 0.07, 0.045, hair, strands);
  }
  if (look.beard >= 1 && !fullFace) {
    sc.blob(B.at(H, 0.05, 0, -0.085), B.F, B.R, B.U, 0.065, 0.075, look.beard === 2 ? 0.07 : 0.045, hair, strands);
    if (fine) sc.blob(B.at(H, 0.095, 0, -0.045), B.F, B.R, B.U, 0.02, 0.045, 0.012, hair); // moustache
  } else if (look.beard >= 1) sc.blob(B.at(H, 0.03, 0, -0.16), B.F, B.R, B.U, 0.05, 0.06, 0.04, hair, strands); // the beard below the cheek plates
  // the face: two eyes and a brow, as crisp pixels (hidden from behind by the head itself)
  if (!fullFace) {
    for (const s of [-1, 1]) {
      if (p.blink) sc.dot(B.at(H, 0.098, s * 0.042, 0.012), skin.ramp[3], 0.025); // lids down
      else sc.dot(B.at(H, 0.098, s * 0.042, 0.012), EYE_PX, 0.025);
      if (fine) {
        sc.dot(B.at(H, 0.095, s * 0.045, 0.038), hair.ramp[2], 0.025); // brow
        sc.dot(B.at(H, 0.093, s * 0.055, -0.01), skin.ramp[3], 0.02); // the cheek's hollow under the eye
      }
    }
    if (look.beard === 0) sc.dot(B.at(H, 0.09, 0, -0.07), skin.ramp[3], 0.025); // mouth shadow
    if (fine && look.beard === 0) sc.dot(B.at(H, 0.092, 0.012, -0.07), skin.ramp[3], 0.025);
    if (fine) sc.dot(B.at(H, 0.118, 0, -0.025), skin.ramp[3], 0.02); // the shadow under the nose
  }
  // headband for some bareheaded men; a laurel wreath for the laurel token
  if (!d.helmet && seed % 4 === 1 && hairStyle !== 2) ring(sc, B, H, 0.108, 0.03, 0x9a3a2a, 9);
  if (g.trinket?.def === 'laurel' && !d.helmet) ring(sc, B, H, 0.112, 0.035, 0x6e8a3a, 11, 0x9ab04a);
  if (d.helmet) helmet(sc, d, H, B, back, p);
  B = B0;

  // ---- trinket on the chest or belt
  if (g.trinket?.def) trinket(sc, g.trinket, k, B, back, H, !!d.helmet);

  // ---- shield
  if (d.shield) shield(sc, d.shield, k, B, dir, p, g.shield, !!d.polish);

  // ---- weapon
  if (d.weapon) weapon(sc, d.weapon, k, B, p, seed, g.weapon, !!d.polish, fine);

  // ---- a dead man bleeds; the body (and everything on it) topples backwards, or forwards onto the face
  if (p.fall) {
    if (p.fallFwd) {
      const pivot = B.at(origin, -0.25, 0, 0.05);
      sc.rotate(pivot, B.R, p.fall);
      sc.translate(mul(B.F, -Math.sin(Math.min(p.fall, Math.PI / 2)) * 0.55));
    } else {
      sc.rotate(origin, B.R, -p.fall);
      // keep the body centred on his spot: he falls back over his own feet
      sc.translate(mul(B.F, Math.sin(Math.min(p.fall, Math.PI / 2)) * 0.85));
    }
    if (p.dead && p.fall > 1.2) {
      sc.group();
      sc.blob(B.at(origin, p.fallFwd ? -0.1 : 0.05, 0.12, 0.005), B.F, B.R, B.U, 0.42, 0.3, 0.01, BLOOD);
    }
  }
  return k;
}

/** A ring of dots around the head (headband, wreath, brow band). */
function ring(sc: Scene, B: Basis, H: V3, r: number, h: number, c: number, n: number, c2?: number, glint = false): void {
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    sc.dot(B.at(H, Math.cos(a) * r, Math.sin(a) * r, h), c2 !== undefined && i % 2 ? c2 : c, 0.03, glint);
  }
}

/** Muscle shading on a bare chest: a sternum groove and the line under the pectorals. */
const muscles = (l: V3): Hit | null => {
  if (l[0] > 0.3 && Math.abs(l[1]) < 0.09 && l[2] > -0.6) return { shade: 0.8 };
  if (l[0] > 0.4 && Math.abs(l[2] + 0.1) < 0.12 && Math.abs(l[1]) > 0.15) return { shade: 0.7 };
  return null;
};

// ---------------------------------------------------------------- trinkets

function trinket(sc: Scene, t: GearTag, k: Skeleton, B: Basis, back: boolean, H: V3, helmeted: boolean): void {
  if (back) return;
  const chest = add(add(k.chest, mul(k.fwd, 0.15)), mul(k.up, 0.06));
  const belt = add(add(k.pelvis, mul(k.up, 0.04)), add(mul(k.fwd, 0.12), mul(B.R, -0.08)));
  const gl = (t.r ?? 0) >= 2;
  switch (t.def) {
    case 'owl_amulet':
      sc.dot(chest, 0xd8dcd8, 0.06, gl);
      sc.dot(add(chest, mul(k.up, -0.035)), 0x9aa0a0, 0.06);
      break;
    case 'herakles_knot':
      sc.dot(belt, 0xffe08a, 0.06, true);
      sc.dot(add(belt, mul(B.R, 0.035)), 0xc8963a, 0.06);
      break;
    case 'scarab':
      sc.dot(chest, 0x4a9ab0, 0.06, gl);
      break;
    case 'tanit_eye':
      sc.dot(chest, 0x3a6ab0, 0.06, gl);
      sc.dot(add(chest, mul(B.R, 0.03)), 0xe8f0f8, 0.06);
      break;
    case 'boar_tusk':
      sc.dot(chest, 0xeee6d0, 0.06);
      sc.dot(add(chest, add(mul(k.up, -0.035), mul(B.R, 0.025))), 0xd2c6a6, 0.06);
      break;
    case 'laurel':
      if (helmeted) {
        // a sprig tucked into the helmet's side
        sc.dot(B.at(H, 0.02, 0.13, 0.04), 0x6e8a3a, 0.06);
        sc.dot(B.at(H, -0.02, 0.135, 0.07), 0x9ab04a, 0.06);
      }
      break;
  }
}

// ---------------------------------------------------------------- body armour

function armour(sc: Scene, art: string | undefined, k: Skeleton, B: Basis, fwd: V3, up: V3, r: number, def: string | undefined, seed: number, front: boolean): void {
  if (!art) return;
  const at = (h: number) => add(k.pelvis, mul(up, h));
  const trimDots = (h: number, rad: number, c: number, n = 10) => {
    // a row of crisp dots around the torso at height h (gilded edges, rivets)
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.5) / n) * Math.PI * 2;
      sc.dot(add(at(h), add(mul(fwd, Math.cos(a) * rad * 0.75), mul(B.R, Math.sin(a) * rad))), c, 0.04, true);
    }
  };
  switch (art) {
    case 'cuirass': {
      const metal = bronzeOf(r);
      const shader = (l: V3): Hit | null => {
        if (l[0] > 0.25 && Math.abs(l[1]) < 0.1 && l[2] > -0.7) return { shade: 1 };
        if (l[0] > 0.35 && Math.abs(l[2] - 0.05) < 0.11 && Math.abs(l[1]) > 0.2) return { shade: 0.9 };
        if (l[0] > 0.3 && l[2] < -0.35 && ((Math.floor(l[2] * 6) & 1) === 0)) return { shade: 0.6 };
        // the muscled chest's lower edge and the lighter swell of the pectorals
        if (l[0] > 0.45 && Math.abs(l[1]) > 0.12 && Math.abs(l[1]) < 0.55 && l[2] > 0.12 && l[2] < 0.4) return { shade: -0.4 };
        if (Math.abs(l[1]) > 0.92) return { shade: 0.8 }; // the side hinge seam
        return null;
      };
      sc.ellipsoid(at(0.17), mul(fwd, 0.14), mul(B.R, 0.18), mul(up, 0.19), metal, shader);
      sc.ellipsoid(at(0.39), mul(fwd, 0.155), mul(B.R, 0.215), mul(up, 0.17), metal, shader);
      pteruges(sc, k, B, fwd, up, r >= 4 ? CLOTH.cloakCrimson : LEATHER, r >= 3);
      if (r >= 3) trimDots(0.53, 0.2, 0xffe08a, 12);
      if (r >= 3) trimDots(0.02, 0.17, 0xf0c860, 10);
      if (r >= 4) {
        // lion-mask pauldrons: the legendary silhouette
        for (const sh of [k.shL, k.shR]) sc.blob(add(sh, mul(up, 0.03)), fwd, B.R, up, 0.085, 0.09, 0.06, GOLD);
      }
      break;
    }
    case 'linothorax': {
      const bandRamp = r >= 3 ? GOLD.ramp : r >= 2 ? CLOTH.tunicRed.ramp : CLOTH.tunicOchre.ramp;
      const linen: Material = r <= 0 ? { ...LINEN, grit: 0.7 } : r >= 4 ? { ramp: [0xfffaf0, 0xf2ead8, 0xd8ccb0, 0xb0a488, 0x847a64], contrast: 0.9 } : LINEN;
      const band = (l: V3): Hit | null => (Math.abs(l[2] + 0.2) < 0.13 ? { ramp: bandRamp, shade: ((Math.floor(l[1] * 9) & 1) && r >= 2 ? 0.8 : 0) } : l[0] > 0.5 && Math.abs(l[1]) < 0.05 ? { shade: 0.6 } : null);
      sc.ellipsoid(at(0.17), mul(fwd, 0.135), mul(B.R, 0.175), mul(up, 0.19), linen, band);
      sc.ellipsoid(at(0.39), mul(fwd, 0.15), mul(B.R, 0.21), mul(up, 0.17), linen);
      // shoulder yoke flaps
      sc.blob(at(0.5), fwd, B.R, up, 0.12, 0.2, 0.05, linen, (l) => (l[2] > 0.5 ? { shade: -0.3 } : null));
      if (front) sc.dot(add(at(0.47), mul(fwd, 0.14)), r >= 3 ? 0xffe08a : 0x7a2420, 0.05, r >= 3);
      if (r >= 4) for (const sh of [k.shL, k.shR]) sc.dot(add(sh, mul(up, 0.04)), 0xffe08a, 0.06, true);
      pteruges(sc, k, B, fwd, up, linen, r >= 3);
      break;
    }
    case 'scale': {
      const metal = bronzeOf(r);
      const scales = (_l: V3, w: V3): Hit | null => (((Math.floor(w[2] * 26) + (Math.floor((w[0] - w[1]) * 18) & 1)) & 1) === 0 ? { shade: 0.9 } : null);
      sc.ellipsoid(at(0.17), mul(fwd, 0.14), mul(B.R, 0.18), mul(up, 0.2), metal, scales);
      sc.ellipsoid(at(0.39), mul(fwd, 0.155), mul(B.R, 0.215), mul(up, 0.17), metal, scales);
      pteruges(sc, k, B, fwd, up, LEATHER, r >= 3);
      if (r >= 3) trimDots(0.53, 0.2, 0xffe08a, 12);
      break;
    }
    case 'mail': {
      const metal = ironOf(r);
      const rings = (_l: V3, w: V3): Hit | null => (((Math.floor(w[2] * 30) + Math.floor((w[0] - w[1]) * 30)) & 1) === 0 ? { shade: 0.8 } : null);
      sc.ellipsoid(at(0.12), mul(fwd, 0.14), mul(B.R, 0.19), mul(up, 0.25), metal, rings);
      sc.ellipsoid(at(0.39), mul(fwd, 0.15), mul(B.R, 0.215), mul(up, 0.17), metal, rings);
      // shoulder doubling, with a bronze clasp on the chest
      sc.blob(at(0.5), fwd, B.R, up, 0.12, 0.22, 0.05, metal);
      if (front) sc.dot(add(at(0.44), mul(fwd, 0.15)), r >= 3 ? 0xffe08a : 0xc8a050, 0.05, r >= 3);
      if (r >= 4) for (const sh of [k.shL, k.shR]) sc.blob(add(sh, mul(up, 0.03)), fwd, B.R, up, 0.08, 0.085, 0.055, ORICHALCUM);
      break;
    }
    case 'leather': {
      const mat: Material = r >= 4 ? { ...DARK_LEATHER, ramp: CLOTH.cloakCrimson.ramp } : LEATHER;
      sc.ellipsoid(at(0.17), mul(fwd, 0.135), mul(B.R, 0.175), mul(up, 0.19), mat, (l) => (l[0] > 0.6 && Math.abs(l[1]) < 0.06 ? { shade: 0.9 } : null));
      sc.ellipsoid(at(0.39), mul(fwd, 0.148), mul(B.R, 0.205), mul(up, 0.165), mat);
      // studs
      if (r >= 2) trimDots(0.3, 0.17, r >= 3 ? 0xffe08a : 0xb8b0a0, 8);
      break;
    }
  }
  void def;
  void seed;
}

/** Hanging strips (pteruges) at the waist: alternating light / dark, gilded tips for epic gear. */
function pteruges(sc: Scene, k: Skeleton, B: Basis, fwd: V3, up: V3, mat: Material, gilt = false): void {
  sc.ellipsoid(add(k.pelvis, mul(up, -0.08)), mul(fwd, 0.16), mul(B.R, 0.21), mul(up, 0.11), mat, (l) => {
    const a = Math.atan2(l[1], l[0]);
    if (gilt && l[2] < -0.75) return { ramp: GOLD.ramp };
    return Math.floor((a + 4) * 4) & 1 ? { shade: 1 } : l[2] < -0.6 ? { shade: 0.5 } : null;
  });
}

// ---------------------------------------------------------------- helmets

/** The crest's colour: a cosmetic, else the helmet's paint with a per-man shade. */
function crestOf(d: DollSpec): Material {
  if (d.crest) return CREST_EXTRA[d.crest] ?? CREST[d.crest] ?? CREST.red;
  const f = d.helmet?.paint?.field ?? 'red';
  const s = (d.seed ?? 0) % 6;
  if (f === 'red' && s === 0) return CREST_EXTRA.deepred;
  if (f === 'red' && s === 3) return CREST_EXTRA.black;
  if (f === 'cream' && s === 0) return CREST_EXTRA.white;
  return CREST[f] ?? CREST.red;
}

function helmet(sc: Scene, d: DollSpec, H: V3, B: Basis, back: boolean, p: ManPose): void {
  const h = d.helmet!;
  const r = Math.max(rankOf(d.gear?.helmet), d.polish ? 2 : 0);
  sc.group();
  const crest = r >= 4 ? CREST_EXTRA.white : crestOf(d);
  const metal = bronzeOf(r);
  const trim = trimOf(r, metal);
  const art = h.art === 'montefortino' && d.culture === 'celtic' ? 'celtic' : h.art;
  const lag = p.lag;
  const fine = fineDetail(d);
  const sway = Number.isNaN(p.phase) ? 0 : Math.sin(p.phase) * 0.02;
  // the bowl's rim: a beaten edge a shade darker (a 2x detail)
  const rimmed = (l: V3): Hit | null => (fine && l[2] < -0.72 ? { shade: 0.7 } : null);
  const bowl = (rad = 0.122, mat: Material = metal) => sc.blob(B.at(H, -0.01, 0, 0.035), B.F, B.R, B.U, rad, rad * 0.98, rad * 0.92, mat, rimmed);
  // hinged cheek-pieces with a rivet at the hinge and a dark gap to the face
  const cheeks = (f: number, r: number, u: number, rf: number, ru: number) => {
    for (const sd of [-1, 1]) {
      sc.blob(B.at(H, f, sd * r, u), B.F, B.R, B.U, rf, 0.02, ru, metal, fine ? (l) => (l[0] > 0.6 ? { shade: 0.6 } : null) : undefined);
      if (fine && !back) sc.dot(B.at(H, f - 0.02, sd * (r + 0.015), u + ru * 0.9), trim.ramp[1], 0.03, !!trim.glint);
    }
  };
  const brow = (h0: number, rad: number) => {
    // a brow band / rim of crisp pixels: gilded from epic up
    if (r >= 3) ring(sc, B, H, rad, h0, 0xffe08a, 9, 0xf0c860, true);
  };
  const ridgeCrest = (h0: number, height: number, length: number, transverse = false) => {
    // horsehair crest: a sweep of spheres over the bowl, front to back (or ear to ear)
    sc.group();
    const n = 9;
    const hh = height * (r >= 4 ? 1.5 : r >= 3 ? 1.2 : 1);
    // horsehair: combed strands run along the crest (a 2x detail), the tips a shade darker
    const hairs = (l: V3): Hit | null => (fine ? (((Math.floor((l[2] + 1.2) * 6) + Math.floor((l[transverse ? 1 : 0] + 1) * 2)) & 1) === 0 ? { shade: 0.5 } : l[2] > 0.8 ? { shade: -0.3 } : null) : null);
    for (let i = 0; i <= n; i++) {
      const t = i / n - 0.5;
      const tail = Math.max(0, t) * lag * 0.6; // the back of the crest trails
      const a = transverse ? B.at(H, 0, t * length * 2, h0 + hh * (1 - 4 * t * t) * 0.7) : B.at(H, t * length * 2 - 0.02 - tail, sway * (t + 0.5), h0 + hh * (1 - 2.4 * t * t) * 0.8);
      sc.sphere(a, 0.042 + (1 - 4 * t * t) * 0.015, crest, hairs);
    }
    // tail of the crest hanging behind, swinging with the walk
    if (!transverse) sc.limb(B.at(H, -length * 1.05, 0, h0 + hh * 0.25), B.at(H, -length * 1.25 - lag * 0.8, sway * 2, h0 - 0.12 + Math.max(0, lag - 0.1) * 0.5), 0.04, 0.02, crest, hairs);
    // the crest box: a bronze holder the hair springs from
    if (fine && !transverse) sc.line(B.at(H, -length * 0.9, 0, h0 + 0.01), B.at(H, length * 0.9, 0, h0 + 0.01), trim, 0.5);
    // the crest's top edge catches the light
    if (!transverse) sc.dot(B.at(H, -0.02, 0, h0 + hh * 0.8 + 0.055), crest.ramp[0], 0.05, !!crest.glint);
    // legendary: two white wings rising from the temples
    if (r >= 4) {
      for (const s of [-1, 1]) {
        sc.limb(B.at(H, 0.0, s * 0.12, 0.06), B.at(H, -0.08 - lag * 0.3, s * 0.2, 0.26), 0.035, 0.012, CREST_EXTRA.white);
        sc.dot(B.at(H, -0.08 - lag * 0.3, s * 0.2, 0.27), 0xffe08a, 0.06, true);
      }
    }
  };
  switch (art) {
    case 'cap':
      sc.blob(B.at(H, -0.01, 0, 0.05), B.F, B.R, B.U, 0.112, 0.112, 0.08, LEATHER);
      if (r >= 3) brow(0.0, 0.112);
      break;
    case 'hood': {
      sc.blob(B.at(H, -0.02, 0, 0.03), B.F, B.R, B.U, 0.12, 0.125, 0.11, FELT);
      sc.limb(B.at(H, -0.01, 0, 0.1), B.at(H, -0.08 - lag * 0.3, 0, 0.32), 0.075, 0.015, FELT);
      sc.blob(B.at(H, -0.03, 0, -0.08), B.F, B.R, B.U, 0.09, 0.13, 0.08, FELT); // flaps
      if (r >= 3) sc.dot(B.at(H, -0.08, 0, 0.33), 0xffe08a, 0.06, true);
      break;
    }
    case 'pilos':
      bowl(0.118);
      sc.limb(B.at(H, -0.01, 0, 0.08), B.at(H, -0.02, 0, 0.27), 0.1, 0.018, metal);
      brow(0.0, 0.12);
      if (r >= 2) ridgeCrest(0.2, 0.05, 0.07, true);
      break;
    case 'montefortino': {
      bowl(0.122);
      sc.sphere(B.at(H, -0.01, 0, 0.16), 0.03, trim); // knob
      // a plume from the knob, nodding back as he moves
      sc.limb(B.at(H, -0.01, 0, 0.18), B.at(H, -0.12 - lag * 0.7, sway, 0.3 + (r >= 3 ? 0.06 : 0)), 0.035, 0.05, crest);
      cheeks(0.02, 0.09, -0.06, 0.05, 0.06); // cheek guards
      sc.blob(B.at(H, -0.1, 0, -0.04), B.F, B.R, B.U, 0.04, 0.1, 0.02, metal); // neck rim
      brow(-0.01, 0.124);
      if (r >= 4) ridgeCrest(0.2, 0.08, 0.1);
      break;
    }
    case 'celtic': {
      // Celtic bowl (Coolus / Agen): a ridged cap, a flat brim at the neck, iron band; horns from rare up
      const iron = r >= 3 ? GOLD : r >= 2 ? ironOf(r) : IRON;
      bowl(0.122);
      sc.blob(B.at(H, -0.02, 0, 0.0), B.F, B.R, B.U, 0.14, 0.135, 0.02, iron);
      sc.blob(B.at(H, -0.1, 0, -0.03), B.F, B.R, B.U, 0.06, 0.11, 0.02, metal); // neck brim
      sc.sphere(B.at(H, -0.01, 0, 0.16), 0.025, iron);
      if (r >= 2) {
        for (const s of [-1, 1]) {
          sc.limb(B.at(H, 0.0, s * 0.1, 0.1), B.at(H, 0.02, s * 0.2, 0.2), 0.035, 0.02, metal);
          sc.limb(B.at(H, 0.02, s * 0.2, 0.2), B.at(H, 0.06, s * 0.2, 0.3), 0.02, 0.012, metal);
          sc.dot(B.at(H, 0.06, s * 0.2, 0.31), metal.ramp[0], 0.06, true);
        }
      } else sc.limb(B.at(H, -0.01, 0, 0.17), B.at(H, -0.1 - lag * 0.6, sway, 0.26), 0.03, 0.04, crest);
      if (r >= 4) {
        // a boar crest along the bowl
        sc.limb(B.at(H, 0.06, 0, 0.2), B.at(H, -0.1, 0, 0.21), 0.04, 0.035, ORICHALCUM);
        sc.sphere(B.at(H, 0.09, 0, 0.19), 0.03, ORICHALCUM);
      }
      break;
    }
    case 'thracian':
      bowl(0.12);
      // the forward-curving Phrygian peak and a small crest along it
      sc.limb(B.at(H, -0.02, 0, 0.1), B.at(H, 0.08, 0, 0.2), 0.09, 0.05, metal);
      sc.limb(B.at(H, 0.08, 0, 0.2), B.at(H, 0.14, 0, 0.15), 0.05, 0.035, trim);
      cheeks(0.03, 0.095, -0.07, 0.06, 0.06);
      brow(0.0, 0.124);
      ridgeCrest(0.2, 0.06, 0.08);
      break;
    case 'boeotian':
      bowl(0.12);
      // wide folded brim
      sc.blob(B.at(H, 0, 0, 0.0), B.F, B.R, B.U, 0.19, 0.19, 0.035, metal, (l) => (Math.abs(l[0]) > 0.6 && l[2] > 0 ? { shade: 0.6 } : null));
      if (r >= 3) ring(sc, B, H, 0.19, 0.0, 0xffe08a, 12, 0xf0c860, true);
      if (r >= 2) ridgeCrest(0.17, 0.05, 0.08);
      break;
    case 'chalcidian':
    case 'attic':
    case 'corinthian': {
      const full = art === 'corinthian';
      sc.blob(B.at(H, -0.01, 0, full ? 0.0 : 0.03), B.F, B.R, B.U, 0.128, 0.126, full ? 0.15 : 0.11, metal, full
        ? (l) => (l[0] < -0.3 && l[2] < -0.5 ? { shade: 0.6 } : fine && l[0] > 0.55 && Math.abs(l[1]) < 0.06 && l[2] < -0.1 ? { shade: 1.4 } : fine && l[0] > 0.7 && Math.abs(l[1]) > 0.25 && Math.abs(l[1]) < 0.62 && l[2] > -0.05 && l[2] < 0.25 ? { shade: 1.6 } : null)
        : rimmed);
      if (full) {
        // eye-holes and the gap between the cheek plates: dark crisp pixels on the face
        if (!back) {
          for (const s of [-1, 1]) {
            sc.dot(B.at(H, 0.125, s * 0.045, 0.01), 0x1e1210, 0.03);
            sc.dot(B.at(H, 0.122, s * 0.065, 0.005), 0x2e1a14, 0.03);
          }
          sc.dot(B.at(H, 0.13, 0, -0.07), 0x1e1210, 0.03);
          sc.dot(B.at(H, 0.135, 0, -0.03), metal.ramp[0], 0.03, !!metal.glint); // the nose guard
        }
        // the flared neck guard
        sc.blob(B.at(H, -0.08, 0, -0.1), B.F, B.R, B.U, 0.06, 0.11, 0.03, metal);
      } else {
        cheeks(0.03, 0.1, -0.07, 0.06, 0.07);
        if (art === 'attic') sc.blob(B.at(H, 0.09, 0, 0.06), B.F, B.R, B.U, 0.05, 0.1, 0.02, trim); // the brow peak
        if (art === 'chalcidian' && !back) sc.dot(B.at(H, 0.13, 0, 0.0), metal.ramp[1], 0.03); // nasal
      }
      brow(full ? 0.06 : 0.04, 0.13);
      // the tall crest on its stilt: the silhouette of a hoplite
      sc.limb(B.at(H, -0.01, 0, 0.12), B.at(H, -0.01, 0, 0.17), 0.025, 0.025, trim);
      ridgeCrest(art === 'attic' ? 0.24 : 0.2, art === 'attic' ? 0.16 : art === 'chalcidian' ? 0.09 : 0.12, art === 'attic' ? 0.16 : 0.13, art === 'attic' && (d.seed ?? 0) % 5 === 4);
      break;
    }
  }
}

// ---------------------------------------------------------------- shields

function shieldFrame(n: V3): { s: V3; v: V3 } {
  // side axis across the face, up axis on it; keep emblems unmirrored for the viewer
  let s = norm(cross([0, 0, 1], n));
  if (len(s) < 0.1) s = [1, 0, 0];
  const v = norm(cross(n, s));
  return { s, v };
}

function shield(sc: Scene, sh: { art: string; paint?: ItemPaint }, k: Skeleton, B: Basis, dir: number, p: ManPose, tag?: GearTag, polish = false): void {
  sc.group();
  const r = Math.max(rankOf(tag), polish ? 2 : 0);
  const def = tag?.def;
  const paint = sh.paint ?? {};
  const fieldKey = paint.field ?? 'bronze';
  const metalField = fieldKey === 'bronze' || fieldKey === 'silver' || fieldKey === 'gold';
  const field = fieldKey === 'bronze' ? bronzeOf(r).ramp : fieldKey === 'silver' && r >= 2 ? BRIGHT_SILVER.ramp : FIELD[fieldKey] ?? FIELD.bronze;
  const ink = r >= 4 ? GOLD.ramp : INK[paint.ink ?? 'ink'] ?? INK.ink;
  const em = paint.emblem ? EMBLEM_BITMAPS[paint.emblem] : r >= 4 ? EMBLEM_BITMAPS.sunwheel : undefined;
  const rim = r >= 4 ? ORICHALCUM : trimOf(r, bronzeOf(r));
  const back = dir === 1 || dir === 3;
  // Held on the left forearm in front; seen from behind it is carried at the
  // left side, turned so its painted face shows to the viewer (the player).
  // Routing men sling it onto their backs.
  const L = mul(B.R, -1);
  let c: V3;
  let n: V3;
  if (p.arm === 'fall') {
    c = add(k.handL, mul(L, 0.1));
    n = norm(add(B.F, mul(L, 0.6)));
  } else if (p.arm === 'rout') {
    c = add(add(k.chest, mul(B.F, -0.24)), mul(B.U, 0.02));
    n = norm(add(mul(B.F, -1), mul(B.U, 0.15)));
  } else if (p.shieldUp) {
    c = add(k.handL, mul(B.U, 0.06));
    n = norm(add(mul(B.U, 0.6), mul(B.F, 0.8)));
  } else {
    c = add(k.handL, add(mul(B.F, 0.05), mul(L, 0.03)));
    n = norm(add(B.F, mul(L, 0.25)));
  }
  if (back && p.arm !== 'fall' && p.arm !== 'rout') {
    c = add(add(k.chest, mul(L, 0.3)), mul(B.F, 0.02));
    if (p.arm === 'block') c = add(c, mul(B.U, 0.08));
    n = norm(add(mul(CAM, 0.85), mul(L, 0.5)));
  }
  const { s, v } = shieldFrame(n);
  // face-on: the face is the side towards n; emblem grid 7x7 over the centre
  const flipX = project(s).x < 0 ? -1 : 1;
  // which side of the rim faces the light: the upper left on screen
  const litRim = (u: number, w: number): boolean => {
    const q = project(add(mul(s, u), mul(v, w)));
    return -q.x * 0.8 - q.y > 0;
  };
  const emblemAt = (u: number, w: number, spread: number): boolean => {
    if (!em) return false;
    const gx = Math.floor(((u * flipX) / spread + 0.5) * 7);
    const gy = Math.floor((0.5 - w / spread) * 7);
    return gx >= 0 && gy >= 0 && gx < 7 && gy < 7 && em[gy][gx] === '#';
  };
  const faceMat: Material = { ramp: field, metal: metalField, grit: r <= 0 ? 0.8 : r >= 2 ? 0.15 : 0.5, contrast: 1.05, glint: r >= 2 && metalField };
  switch (sh.art) {
    case 'hoplon': {
      const R = r >= 4 ? 0.5 : 0.46;
      const aspis = def === 'aspis';
      sc.ellipsoid(c, mul(n, 0.06), mul(s, R), mul(v, R), faceMat, (l) => {
        if (l[0] < 0) return { ramp: LEATHER.ramp };
        const rr = Math.sqrt(l[1] * l[1] + l[2] * l[2]);
        if (rr > 0.86) return litRim(l[1], l[2]) ? { ramp: fieldKey === 'bronze' || r >= 3 ? rim.ramp : RIM_LIGHT, shade: -0.6 } : { ramp: rim.ramp, shade: 0.9 };
        if (rr > 0.81) return { shade: 0.8 };
        if (aspis && rr > 0.66 && rr < 0.71) return { ramp: rim.ramp, shade: 0.3 }; // the Argive inner ring
        if (r >= 4 && rr > 0.58 && (Math.floor((Math.atan2(l[2], l[1]) + 4) * 2.55) & 1)) return { ramp: GOLD.ramp, shade: 0.6 }; // sun rays
        if (emblemAt(l[1], l[2], 1.3)) return { ramp: ink };
        return null;
      });
      if (r >= 3) {
        // gilded rivets around the rim
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + 0.3;
          sc.dot(add(add(c, mul(n, 0.07)), add(mul(s, Math.cos(a) * R * 0.92), mul(v, Math.sin(a) * R * 0.92))), 0xfff2b0, 0.05, true);
        }
      }
      break;
    }
    case 'oval': {
      const celt = def === 'celtic_shield';
      const hw = celt ? 0.28 : 0.3;
      const hh = celt ? 0.64 : 0.56;
      const boss = r >= 3 ? GOLD.ramp : ironOf(r).ramp;
      sc.ellipsoid(c, mul(n, 0.05), mul(s, hw), mul(v, hh), { ...faceMat, contrast: 0.95 }, (l) => {
        if (l[0] < 0) return { ramp: WOOD.ramp };
        if (Math.abs(l[1]) < 0.09 && Math.abs(l[2]) > 0.25) return { ramp: celt ? DARK_WOOD.ramp : WOOD.ramp }; // spina
        if (Math.abs(l[1]) < (celt ? 0.26 : 0.22) && Math.abs(l[2]) < (celt ? 0.14 : 0.2)) return { ramp: boss }; // boss
        const rr = Math.sqrt(l[1] * l[1] + l[2] * l[2]);
        if (rr > 0.9) return litRim(l[1], l[2]) ? { ramp: r >= 3 ? GOLD.ramp : RIM_LIGHT, shade: -0.3 } : { ramp: r >= 3 ? GOLD.ramp : field, shade: 1.1 };
        if (emblemAt(l[1] * 0.55, l[2], 1.0) && Math.abs(l[2]) > 0.25) return { ramp: ink };
        return null;
      });
      sc.dot(add(add(c, mul(n, 0.06)), mul(v, 0.02)), boss[0], 0.05, r >= 2);
      break;
    }
    case 'pelte': {
      sc.ellipsoid(c, mul(n, 0.04), mul(s, 0.3), mul(v, 0.27), { ramp: FIELD[paint.field ?? 'cream'] ?? field, grit: 0.6 }, (l) => {
        // the crescent notch at the top
        if (l[2] > 0.35 && Math.abs(l[1]) < 0.45 - (l[2] - 0.35) * 0.3) return { hole: true };
        if (l[0] < 0) return { ramp: WOOD.ramp };
        if (Math.sqrt(l[1] * l[1] + l[2] * l[2]) > 0.86) return { ramp: r >= 3 ? GOLD.ramp : LEATHER.ramp };
        if (emblemAt(l[1], l[2] + 0.1, 1.2)) return { ramp: ink };
        return null;
      });
      break;
    }
    case 'buckler':
    default: {
      sc.ellipsoid(c, mul(n, 0.05), mul(s, 0.21), mul(v, 0.21), { ramp: field, metal: true, grit: 0.4, glint: r >= 2 }, (l) => (l[0] < 0 ? { ramp: LEATHER.ramp } : Math.sqrt(l[1] * l[1] + l[2] * l[2]) < 0.3 ? { ramp: rim.ramp, shade: -0.5 } : null));
      break;
    }
  }
}


// ---------------------------------------------------------------- weapons

function weapon(sc: Scene, w: string, k: Skeleton, B: Basis, p: ManPose, seed: number, tag?: GearTag, polish = false, fine = false): void {
  sc.group();
  const r = Math.max(rankOf(tag), polish && (w === 'spear' || w === 'spear_short') ? 2 : 0);
  const def = tag?.def;
  const hR = k.handR;
  const hL = k.handL;
  const bronze = bronzeOf(r);
  const iron = ironOf(r);
  const shaftMat: Material = r >= 4 ? DARK_WOOD : r >= 3 ? DARK_WOOD : WOOD;
  const shaft = (a: V3, b: V3, mat: Material = shaftMat) => sc.line(a, b, mat, 1);
  const blade = (a: V3, b: V3, mat: Material = iron, width = 2) => sc.line(a, b, mat, width);
  const tip = (base: V3, d: V3, l = 0.24, mat: Material = bronze) => {
    sc.line(base, add(base, mul(d, l)), mat, 2);
    sc.line(add(base, mul(d, l)), add(base, mul(d, l + 0.05)), mat, 1);
    if (fine) {
      // a leaf-shaped blade with a midrib, and the socket's collar
      const side = norm(cross(d, Math.abs(d[2]) > 0.9 ? B.R : [0, 0, 1]));
      const flat = norm(cross(d, side));
      sc.ellipsoid(add(base, mul(d, l * 0.5 + 0.02)), mul(d, l * 0.5 + 0.02), mul(side, 0.028), mul(flat, 0.009), { ...mat, metal: true }, (q) => (Math.abs(q[1]) < 0.25 ? { shade: -0.5 } : null));
      sc.dot(add(base, mul(d, 0.02)), DARK_LEATHER.ramp[1], 0.04);
    }
    if (r >= 4) {
      // the legendary head burns: a glowing core and a bright point
      sc.line(add(base, mul(d, 0.04)), add(base, mul(d, l)), EMBER, 1);
      sc.dot(add(base, mul(d, l + 0.07)), 0xfff4c0, 0.08, true);
    }
  };
  const bands = (a: V3, d: V3, n: number, step: number) => {
    // gilded bands on the shaft (epic+)
    if (r < 3) return;
    for (let i = 0; i < n; i++) sc.dot(add(a, mul(d, i * step)), 0xffe08a, 0.05, true);
  };
  const dropped = p.dead || p.arm === 'fall';
  if (dropped && p.dead) {
    // the weapon lies beside the body
    const o = B.at([0, 0, 0], p.fallFwd ? -0.2 : 0.4, 0.45, 0.03);
    const along = norm(add(B.F, mul(B.R, 0.3 + (seed % 3) * 0.1)));
    if (w === 'spear' || w === 'spear_short' || w === 'lance' || w === 'javelins' || w === 'rhomphaia') {
      const l = w === 'lance' ? 3.2 : w === 'spear' ? 2.3 : 1.6;
      shaft(add(o, mul(along, -l / 2)), add(o, mul(along, l / 2)));
      tip(add(o, mul(along, l / 2)), along, w === 'rhomphaia' ? 0.6 : 0.2, w === 'rhomphaia' ? iron : bronze);
    } else if (w === 'bow' || w === 'bow_short' || w === 'sling') sc.line(o, add(o, mul(along, w === 'sling' ? 0.3 : 0.9)), w === 'sling' ? STRING : DARK_WOOD, 1);
    else blade(o, add(o, mul(along, 0.6)));
    return;
  }
  const d = k.wdir;
  switch (w) {
    case 'spear':
    case 'spear_short':
    case 'lance': {
      const L = w === 'lance' ? 3.4 : w === 'spear' ? (def === 'bronze_dory' ? 2.6 : 2.5) : 1.85;
      const grip = k.grip;
      const dd = d;
      const a = sub(hR, mul(dd, L * grip));
      const b = add(hR, mul(dd, L * (1 - grip)));
      shaft(a, b, w === 'lance' ? DARK_WOOD : shaftMat);
      const headMat = w === 'lance' || w === 'spear_short' ? iron : r >= 4 ? ORICHALCUM : bronze;
      tip(b, dd, def === 'bronze_dory' ? 0.28 : r >= 4 ? 0.3 : 0.22, headMat);
      // the sauroter (butt-spike), longer on the bronze-shod spear
      sc.line(a, sub(a, mul(dd, def === 'bronze_dory' ? 0.16 : 0.1)), r >= 3 ? GOLD : bronze, def === 'bronze_dory' ? 2 : 1);
      bands(add(b, mul(dd, -0.02)), mul(dd, -1), 3, 0.06);
      if (def === 'bronze_dory') sc.dot(add(b, mul(dd, -0.04)), bronze.ramp[0], 0.05, r >= 2);
      break;
    }
    case 'sword':
    case 'kopis':
    case 'longsword': {
      const L = w === 'longsword' ? 0.85 : 0.6;
      const bladeMat = r >= 4 ? DIVINE : def === 'xiphos' && r <= 1 ? bronze : iron;
      sc.line(sub(hR, mul(d, 0.09)), hR, DARK_LEATHER, 1); // grip
      sc.line(add(hR, mul(B.R, -0.05)), add(hR, mul(B.R, 0.05)), r >= 3 ? GOLD : bronze, 1); // guard
      if (def === 'falcata') sc.dot(sub(hR, mul(add(d, mul(B.F, -0.6)), 0.1)), r >= 3 ? 0xffe08a : 0xc8a050, 0.06); // the bird-head hilt
      if (w === 'kopis') {
        const mid = add(hR, mul(d, L * 0.55));
        blade(hR, mid, bladeMat);
        blade(mid, add(mid, mul(norm(add(d, mul(B.U, -0.35))), L * 0.45)), bladeMat);
      } else {
        const end = add(hR, mul(d, L));
        sc.line(hR, end, bladeMat, 1);
        sc.line(add(hR, mul(B.U, -0.015)), add(end, mul(B.U, -0.015)), { ramp: bladeMat.ramp.slice(2), glint: bladeMat.glint }, 0.5);
        if (r >= 4) sc.dot(add(end, mul(d, 0.03)), 0xffffff, 0.08, true);
      }
      break;
    }
    case 'axe':
    case 'club': {
      const end = add(hR, mul(d, 0.65));
      if (w === 'axe') {
        shaft(sub(hR, mul(d, 0.12)), end);
        const side = norm(cross(d, B.R));
        sc.box(add(end, mul(side, 0.06)), mul(d, 0.06), mul(B.R, 0.015), mul(side, 0.09), r >= 4 ? ORICHALCUM : iron);
        bands(sub(hR, mul(d, 0.05)), d, 3, 0.15);
      } else {
        sc.limb(hR, end, 0.025, 0.06, r >= 4 ? GOLD : WOOD, (l) => (r < 4 && (Math.floor(l[2] * 5) & 1) ? { shade: 0.8 } : null)); // knots
        if (r >= 2) sc.dot(end, r >= 3 ? 0xffe08a : 0xb8b0a0, 0.08, true);
      }
      break;
    }
    case 'falx':
    case 'rhomphaia': {
      // two-handed: haft between the hands, a long (curved) blade beyond
      const haft = w === 'falx' ? 0.75 : 0.95;
      const start = sub(hR, mul(d, 0.42));
      const end = add(start, mul(d, haft));
      shaft(start, end, DARK_WOOD);
      bands(start, d, 3, 0.2);
      const bend = norm(add(d, mul(B.U, w === 'falx' ? -0.8 : -0.15)));
      const bl = w === 'falx' ? 0.55 : 0.75;
      const mid = add(end, mul(d, bl * 0.5));
      const bm = r >= 4 ? DIVINE : iron;
      blade(end, mid, bm, 2);
      blade(mid, add(mid, mul(bend, bl * 0.55)), bm, 2);
      break;
    }
    case 'javelins': {
      // a sheaf in the left hand, one ready in the right (none just after the throw)
      const iron2 = def === 'saunion' ? iron : WOOD;
      const tipMat = r >= 4 ? EMBER : iron;
      const up = norm(add(B.U, mul(B.F, 0.15)));
      const sheaf = p.arm === 'rout' || p.arm === 'run' ? norm(add(B.U, mul(B.F, -0.3))) : up;
      for (const off of [-0.03, 0.03]) {
        const base = add(hL, mul(B.R, off));
        shaft(sub(base, mul(sheaf, 0.55)), add(base, mul(sheaf, 0.9)), iron2);
        sc.line(add(base, mul(sheaf, 0.9)), add(base, mul(sheaf, 1.0)), tipMat, 1);
      }
      if (p.arm !== 'strike' && p.arm !== 'follow') {
        shaft(sub(hR, mul(d, 0.6)), add(hR, mul(d, 0.85)), iron2);
        sc.line(add(hR, mul(d, 0.85)), add(hR, mul(d, 0.97)), tipMat, 1);
        if (r >= 4) sc.dot(add(hR, mul(d, 1.0)), 0xfff4c0, 0.08, true);
      }
      break;
    }
    case 'sling': {
      const cord: Material = def === 'balearic_sling' ? { ramp: [0x8a7a5a, 0x6a5a40, 0x4a3e2c] } : STRING;
      const stone = r >= 4 ? EMBER : def === 'rhodian_sling' ? IRON : LEATHER;
      if (p.arm === 'wind' || p.arm === 'cock' || p.arm === 'raise') {
        // the cords whirl overhead: the pouch sits on a different side each frame
        const c = add(hR, mul(B.U, 0.22));
        const ph = p.arm === 'wind' ? 0 : Math.PI;
        for (let i = 0; i < 8; i++) {
          const a0 = (i / 8) * Math.PI * 2;
          const a1 = ((i + 1) / 8) * Math.PI * 2;
          if (i % 2) sc.line(add(c, add(mul(B.F, Math.cos(a0) * 0.3), mul(B.R, Math.sin(a0) * 0.3))), add(c, add(mul(B.F, Math.cos(a1) * 0.3), mul(B.R, Math.sin(a1) * 0.3))), cord, 0.5);
        }
        const pouch = add(c, add(mul(B.F, Math.cos(ph) * 0.3), mul(B.R, Math.sin(ph) * 0.3)));
        sc.line(hR, pouch, cord, 0.5);
        sc.sphere(pouch, 0.04, stone);
      } else if (p.arm === 'strike' || p.arm === 'follow') {
        // released: the empty cords fly forward
        sc.line(hR, add(hR, B.dir(0.9, 0, 0.3)), cord, 0.5);
      } else {
        sc.line(hR, add(hR, B.dir(0.1, 0, -0.5)), cord, 0.5);
        sc.sphere(add(hR, B.dir(0.1, 0, -0.55)), 0.04, stone);
      }
      // the pouch of stones at the hip; spare slings round the head of a Balearic
      sc.sphere(B.at(k.pelvis, 0.02, -0.2, -0.05), 0.07, LEATHER);
      if (def === 'balearic_sling') ringAt(sc, k.head, B, 0.11, 0.05, 0x6a5a40);
      break;
    }
    case 'bow':
    case 'bow_short': {
      const short = w === 'bow_short';
      const half = short ? 0.42 : 0.62;
      const aiming = p.arm === 'cock' || p.arm === 'strike' || p.arm === 'follow' || p.arm === 'wind' || p.arm === 'raise';
      const drawn = p.arm === 'cock' || p.arm === 'raise';
      const grip = hL;
      const fwd = aiming ? norm(sub(hL, k.shL)) : B.F;
      const upv = norm(sub(B.U, mul(fwd, fwd[2])));
      const limbMat: Material = r >= 4 ? GOLD : def === 'cretan_bow' ? { ramp: [0xd8c8a0, 0xb8a47a, 0x8a7656, 0x5e4e3a] } : r >= 3 ? DARK_WOOD : DARK_WOOD;
      const stringMat: Material = r >= 4 ? DIVINE : STRING;
      const pts: V3[] = [];
      const bendK = drawn ? 1.6 : 1;
      for (let i = 0; i <= 6; i++) {
        const t = i / 6 - 0.5;
        const bend = (short ? (Math.abs(t) > 0.35 ? -0.06 : 0.1) * (1 - 4 * t * t) + (Math.abs(t) > 0.4 ? -0.05 : 0) : 0.14 * (1 - 4 * t * t) + (Math.abs(t) > 0.42 ? -0.03 : 0)) * bendK;
        pts.push(add(add(grip, mul(upv, t * 2 * half * (drawn ? 0.94 : 1))), mul(fwd, bend)));
      }
      for (let i = 0; i < 6; i++) sc.line(pts[i], pts[i + 1], limbMat, 1);
      // horn tips
      sc.dot(pts[0], r >= 3 ? 0xffe08a : 0xe8dcc0, 0.05, r >= 3);
      sc.dot(pts[6], r >= 3 ? 0xffe08a : 0xe8dcc0, 0.05, r >= 3);
      const nock = drawn || p.arm === 'wind' ? hR : add(grip, mul(fwd, -0.02));
      sc.line(pts[0], nock, stringMat, 0.5);
      sc.line(nock, pts[6], stringMat, 0.5);
      if (drawn || p.arm === 'wind') {
        sc.line(nock, add(grip, mul(fwd, 0.16)), WOOD, 1); // arrow
        sc.dot(add(grip, mul(fwd, 0.18)), r >= 4 ? 0xfff4c0 : 0xa8a8a0, 0.05, r >= 4);
      }
      // quiver on the back (a gorytos case at the hip for the steppe bow)
      if (short) sc.blob(B.at(k.pelvis, -0.08, -0.2, 0.0), B.F, B.R, B.U, 0.08, 0.05, 0.18, LEATHER);
      else {
        const qa = B.at(k.chest, -0.16, 0.08, -0.25);
        sc.limb(qa, B.at(k.chest, -0.2, 0.16, 0.25), 0.06, 0.06, LEATHER);
        sc.line(B.at(k.chest, -0.2, 0.16, 0.25), B.at(k.chest, -0.22, 0.18, 0.36), WOOD, 1);
        sc.dot(B.at(k.chest, -0.22, 0.18, 0.37), 0xd8ccb0, 0.06); // fletching
      }
      break;
    }
  }
}

function ringAt(sc: Scene, H: V3, B: Basis, r: number, h: number, c: number): void {
  ring(sc, B, H, r, h, c, 8);
}
// ================================================================ quadruped gaits

/** One foot: forward offset of the hoof / paw from its rest spot (m, along F) and lift. */
interface LegPose {
  x: number;
  z: number;
}

/** What a four-legged body is doing in a frame (horse, wolf, boar, bear). */
interface Gait {
  /** Per leg [fore-left, fore-right, hind-left, hind-right]. */
  legs: LegPose[];
  /** Height bob (+ up), body pitch about its centre (+ = nose up), roll about F (falling onto a side), sink (dying). */
  bob: number;
  pitch: number;
  roll: number;
  down: number;
  /** Rearing: pitch about the hind feet (+ = nose up). */
  rear: number;
  /** Head raised (+) / lowered, neck extended forward (+), head turned (+ = to its right). */
  head: number;
  neck: number;
  yaw: number;
  /** Tail swished sideways (+ right) and lifted. */
  tail: number;
  tailUp: number;
  /** One ear laid back (0..1). */
  ear: number;
  /** Spine: + extended (reaching), - gathered (hinds under the body, back arched). */
  stretch: number;
  /** Whole body shifted forward (a lunge). */
  lunge: number;
  /** Jaws open (0..1). */
  jaw: number;
}

function baseGait(): Gait {
  return { legs: [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }], bob: 0, pitch: 0, roll: 0, down: 0, rear: 0, head: 0, neck: 0, yaw: 0, tail: 0, tailUp: 0, ear: 0, stretch: 0, lunge: 0, jaw: 0 };
}

/**
 * Footfall patterns: when in the cycle (0..1) each leg [FL, FR, HL, HR] lands,
 * and how long it stays on the ground (duty).
 *   walk    four-beat lateral sequence (LH, LF, RH, RF), three feet down at a time
 *   trot    diagonal pairs (LF + RH, RF + LH)
 *   pace    lateral pairs (a bear's amble: the body sways)
 *   gallop  transverse, right lead (LH, RH, LF, RF, then suspension): the horse
 *   rotary  rotary (LH, RH, RF, LF): dogs, boars, with the spine flexing
 */
const GAITS = {
  walk: { off: [0.25, 0.75, 0.0, 0.5], duty: 0.65 },
  trot: { off: [0.0, 0.5, 0.5, 0.0], duty: 0.5 },
  pace: { off: [0.0, 0.5, 0.08, 0.58], duty: 0.6 },
  gallop: { off: [0.25, 0.38, 0.0, 0.1], duty: 0.33 },
  rotary: { off: [0.42, 0.3, 0.0, 0.12], duty: 0.35 },
} as const;
type GaitKind = keyof typeof GAITS;

/** A leg at `u` (0..1) of its own cycle: planted and moving back, then swinging forward in an arc. */
function legCycle(u: number, duty: number, stride: number, lift: number): LegPose {
  u = ((u % 1) + 1) % 1;
  if (u < duty) return { x: stride * (0.5 - u / duty), z: 0 };
  const t = (u - duty) / (1 - duty);
  const e = t * t * (3 - 2 * t);
  return { x: stride * (e - 0.5), z: lift * Math.sin(Math.PI * t) };
}

/** The four legs of a gait at phase `ph` (0..1); `lift` per leg pair [fore, hind]. */
function legsOf(kind: GaitKind, ph: number, stride: number, lift: [number, number]): LegPose[] {
  const g = GAITS[kind];
  return g.off.map((o, i) => legCycle(ph - o, g.duty, stride, lift[i < 2 ? 0 : 1]));
}

const TAU = Math.PI * 2;
const cyc = (ph: number, at: number) => Math.cos(TAU * (ph - at));

// ================================================================ horses and riders

/** The horse's pose for a frame of the full (40-column) set; a chariot's horses pass legacy columns through the same table. */
function horseGait(frame: number, seed = 0): Gait {
  const g = baseGait();
  const name = FRAME_NAMES[frame] ?? 'idle0';
  const num = (pre: string) => Number(name.slice(pre.length));
  // at rest a horse cocks one hind foot (the toe down, the hip dropped) and shifts now and then
  const restHind = (i: number) => {
    g.legs[i] = { x: 0.08, z: 0.025 };
    g.roll = i === 3 ? 0.02 : -0.02;
  };
  if (name.startsWith('idle')) {
    const k = num('idle');
    restHind(k === 2 ? 2 : 3);
    if (k === 1) {
      g.head = -0.08;
      g.tail = 0.35;
      g.ear = 1;
    } else if (k === 2) {
      // a head toss, turned to look aside
      g.head = 0.14;
      g.yaw = 0.3;
      g.tail = -0.1;
    } else if (k === 3) {
      g.head = -0.03;
      g.tail = -0.35;
      g.tailUp = 0.1;
      g.ear = 0.5;
      g.neck = 0.03;
    }
  } else if (name.startsWith('walk')) {
    // a four-beat walk: the head nods down as each fore lands, the body sways over the planted side
    const ph = num('walk') / 8;
    g.legs = legsOf('walk', ph, 0.5, [0.09, 0.08]);
    g.bob = 0.012 * cyc(ph, 0.1) * -1 + 0.012 * cyc(2 * ph, 0.25) * 0.5;
    g.head = -0.06 + 0.05 * cyc(2 * ph, 0.0);
    g.neck = 0.03 * cyc(2 * ph, 0.5);
    g.roll = 0.035 * Math.sin(TAU * (ph - 0.1));
    g.tail = 0.18 * Math.sin(TAU * ph);
    g.ear = ph > 0.5 ? 0.4 : 0;
  } else if (name.startsWith('run') || name.startsWith('rout')) {
    // transverse gallop, right lead: the hinds drive (nose up), the fores reach and land (nose down,
    // neck stretched), then a moment of suspension with every hoof folded under the body
    const rout = name.startsWith('rout');
    const ph = (rout ? num('rout') / 4 : num('run') / 6) + (rout ? 0.5 : 0);
    g.legs = legsOf('gallop', ph, 0.95, [0.28, 0.32]);
    g.bob = 0.05 * cyc(ph, 0.85) - 0.01;
    g.pitch = 0.09 * cyc(ph, 0.15);
    g.head = -0.04 + 0.12 * cyc(ph, 0.1);
    g.neck = 0.06 * cyc(ph, 0.45);
    g.stretch = cyc(ph, 0.45);
    g.tailUp = 0.3 + 0.1 * cyc(ph, 0.6);
    g.tail = 0.1 * Math.sin(TAU * ph);
    if (rout) {
      g.ear = 1;
      g.head += 0.06;
    }
  } else {
    switch (name) {
      case 'wind':
        // the rider winds up: the horse's head comes up, the hinds gather
        g.head = 0.1;
        g.legs[2] = { x: 0.06, z: 0 };
        g.legs[3] = { x: 0.1, z: 0 };
        g.ear = 0.3;
        break;
      case 'atk0':
        g.head = 0.14;
        g.neck = -0.03;
        g.bob = -0.025;
        g.pitch = 0.04;
        g.legs[2] = { x: 0.12, z: 0 };
        g.legs[3] = { x: 0.16, z: 0 };
        g.stretch = -0.4;
        break;
      case 'atk1':
        // the surge behind the strike: the neck stretches, a fore reaches
        g.head = -0.08;
        g.neck = 0.08;
        g.pitch = -0.03;
        g.lunge = 0.06;
        g.legs[1] = { x: 0.26, z: 0.1 };
        g.legs[0] = { x: 0.08, z: 0 };
        g.legs[2] = { x: -0.05, z: 0 };
        g.stretch = 0.6;
        g.ear = 0.6;
        break;
      case 'follow':
        g.head = -0.1;
        g.neck = 0.06;
        g.lunge = 0.08;
        g.legs[1] = { x: 0.3, z: 0 };
        g.legs[0] = { x: 0.12, z: 0 };
        g.legs[2] = { x: -0.12, z: 0 };
        g.legs[3] = { x: -0.06, z: 0 };
        g.stretch = 0.4;
        g.ear = 0.6;
        break;
      case 'atk2':
        g.head = -0.02;
        g.lunge = 0.03;
        g.legs[1] = { x: 0.14, z: 0 };
        g.legs[0] = { x: 0.06, z: 0 };
        break;
      case 'block':
        g.head = 0.08;
        g.bob = -0.015;
        g.ear = 1;
        break;
      case 'hit':
        // rearing: up on the hinds, the fores pawing, the head thrown up
        g.rear = 0.6;
        g.legs[0] = { x: 0.3, z: 0.4 };
        g.legs[1] = { x: 0.45, z: 0.3 };
        g.legs[2] = { x: 0.1, z: 0 };
        g.legs[3] = { x: 0.05, z: 0 };
        g.head = 0.2;
        g.neck = -0.04;
        g.ear = 1;
        g.tailUp = 0.2;
        g.jaw = 1;
        break;
      case 'hit1':
        // coming down: the fores reach for the ground
        g.rear = 0.25;
        g.legs[0] = { x: 0.42, z: 0.12 };
        g.legs[1] = { x: 0.5, z: 0.2 };
        g.legs[2] = { x: 0.08, z: 0 };
        g.head = 0.04;
        g.neck = 0.04;
        g.ear = 1;
        g.jaw = 0.5;
        break;
      case 'die0':
        // stumbling: the fores buckle (one knee on the ground), the nose dives, the hinds still stretched behind
        g.down = 0.1;
        g.pitch = -0.34;
        g.head = -0.3;
        g.neck = 0.05;
        g.legs[0] = { x: -0.38, z: 0.04 };
        g.legs[1] = { x: 0.12, z: 0.0 };
        g.legs[2] = { x: -0.22, z: 0 };
        g.legs[3] = { x: -0.12, z: 0 };
        g.ear = 1;
        break;
      case 'die1':
        // going over onto its left side
        g.down = 0.14;
        g.pitch = -0.18;
        g.roll = 0.6;
        g.head = -0.2;
        g.legs[0] = { x: 0.2, z: 0.2 };
        g.legs[1] = { x: 0.35, z: 0.15 };
        g.legs[2] = { x: -0.3, z: 0.1 };
        g.legs[3] = { x: 0.1, z: 0.2 };
        g.ear = 1;
        break;
      case 'die1b':
        // down on the side, legs kicking out
        g.down = 0.02;
        g.roll = 1.35;
        g.pitch = -0.05;
        g.head = -0.1;
        g.neck = 0.05;
        g.legs[0] = { x: 0.35, z: 0.3 };
        g.legs[1] = { x: 0.5, z: 0.1 };
        g.legs[2] = { x: -0.2, z: 0.3 };
        g.legs[3] = { x: -0.05, z: 0.15 };
        g.ear = 1;
        break;
      case 'die2':
        g.down = 0.02;
        g.roll = 1.5;
        g.head = -0.12;
        g.neck = 0.08;
        g.legs[0] = { x: 0.3, z: 0.12 };
        g.legs[1] = { x: 0.45, z: 0.02 };
        g.legs[2] = { x: -0.25, z: 0.12 };
        g.legs[3] = { x: -0.1, z: 0.04 };
        g.ear = 1;
        break;
      case 'dieB0':
      case 'dieB1':
      case 'dieB2':
      case 'dieB3': {
        // the hind legs give: the horse sits back, then topples onto its left side
        const k = num('dieB');
        g.down = [0.18, 0.16, 0.02, 0.02][k];
        g.pitch = [0.22, 0.12, -0.02, 0][k];
        g.roll = [0, -0.55, -1.3, -1.5][k];
        g.head = [0.18, 0.1, -0.12, -0.15][k];
        g.neck = [-0.04, 0, 0.06, 0.08][k];
        g.legs[2] = { x: [0.25, 0.3, 0.1, 0.0][k], z: [0.05, 0.15, 0.25, 0.1][k] };
        g.legs[3] = { x: [0.3, 0.25, 0.2, 0.1][k], z: [0.02, 0.1, 0.3, 0.15][k] };
        g.legs[0] = { x: [0.1, 0.25, 0.3, 0.35][k], z: [0, 0.1, 0.2, 0.05][k] };
        g.legs[1] = { x: [0.0, 0.2, 0.4, 0.45][k], z: [0, 0.05, 0.1, 0][k] };
        g.ear = 1;
        g.jaw = k < 2 ? 1 : 0;
        break;
      }
      case 'win0':
      case 'win1':
        g.head = num('win') ? 0.16 : 0.1;
        g.neck = -0.02;
        restHind(3);
        g.tailUp = 0.15;
        g.legs[1] = num('win') ? { x: 0.2, z: 0.1 } : { x: 0.15, z: 0.02 };
        break;
    }
  }
  void seed;
  return g;
}

/**
 * A horse standing on the origin, facing B.F, posed by a Gait. Returns the
 * saddle point (world) with the bob, sink and pitch applied, and the roll
 * (the caller rolls the rider with the horse).
 */
function buildHorse(sc: Scene, B: Basis, g: Gait, coat: Material, o: V3 = [0, 0, 0], tack: Material | null = LEATHER, cloth: Material | null = null, fine = false): V3 {
  const at = (f: number, r: number, u: number) => B.at(o, f + g.lunge, r, u + g.bob - g.down);
  // the body pitches about its centre; the hooves stay on the ground
  const centre = at(0, 0, 1.22);
  const cp = Math.cos(g.pitch);
  const sp = Math.sin(g.pitch);
  const bp = (f: number, r: number, u: number): V3 => {
    const p = at(f, r, u);
    const d = sub(p, centre);
    const fwd = d[0] * B.F[0] + d[1] * B.F[1] + d[2] * B.F[2];
    const up = d[2];
    const rt = d[0] * B.R[0] + d[1] * B.R[1] + d[2] * B.R[2];
    return add(centre, add(add(mul(B.F, fwd * cp - up * sp), mul(B.U, fwd * sp + up * cp)), mul(B.R, rt)));
  };
  const st = g.stretch;
  sc.group();
  // legs: shoulder / hip -> knee (carpus) or hock -> hoof, two-bone IK from the body down to the hoof
  const legs: [number, number, number][] = [[0.52 + 0.05 * st, -0.16, 0], [0.52 + 0.05 * st, 0.16, 1], [-0.58 - 0.06 * st, -0.16, 2], [-0.58 - 0.06 * st, 0.16, 3]];
  for (const [lf, lr, i] of legs) {
    const top = bp(lf, lr, 1.0);
    const hind = i >= 2;
    const lp = g.legs[i];
    const hoof = B.at(o, lf + g.lunge + lp.x, lr, 0.06 + lp.z);
    const { mid: knee } = ik(top, hoof, hind ? 0.5 : 0.46, hind ? 0.54 : 0.56, hind ? B.dir(-1, 0, -0.2) : B.dir(1, 0, -0.1));
    sc.limb(top, knee, 0.1, 0.055, coat);
    sc.limb(knee, hoof, 0.045, 0.035, coat, fine ? (_l, w) => (w[2] - hoof[2] < 0.1 ? { shade: 0.5 } : null) : undefined);
    sc.limb(hoof, add(hoof, mul(B.U, -0.06)), 0.045, 0.05, HOOF);
  }
  // barrel, chest and haunches (the barrel stretches with the gallop)
  sc.group();
  const body = bp(0, 0, 1.22);
  const bl = 0.72 + 0.04 * st;
  const pitchF = add(mul(B.F, cp), mul(B.U, sp));
  const pitchU = add(mul(B.U, cp), mul(B.F, -sp));
  sc.blob(body, pitchF, B.R, pitchU, bl, 0.27, 0.3 - 0.015 * st, coat, (l) => (l[2] < -0.75 ? { shade: 0.6 } : null));
  sc.blob(bp(0.5 + 0.04 * st, 0, 1.25), pitchF, B.R, pitchU, 0.32, 0.26, 0.32, coat);
  sc.blob(bp(-0.55 - 0.05 * st, 0, 1.28), pitchF, B.R, pitchU, 0.34, 0.29, 0.32, coat);
  // neck, head, ears, mane, tail
  const neckBase = bp(0.72 + 0.03 * st, 0, 1.45);
  const headTop = bp(1.02 + g.head * 0.1 + g.neck * 1.2, 0, 1.92 + g.head * 0.3 - g.neck * 0.5);
  sc.limb(neckBase, headTop, 0.17, 0.1, coat);
  const cy = Math.cos(g.yaw);
  const sy = Math.sin(g.yaw);
  const HF = add(mul(B.F, cy), mul(B.R, sy)); // the head's own forward
  const HR = add(mul(B.R, cy), mul(B.F, -sy));
  const muzzle = add(headTop, mul(norm(add(mul(HF, 0.55), mul(B.U, -0.55 + g.head - g.jaw * 0.05))), 0.48));
  const headDir = norm(sub(muzzle, headTop));
  sc.limb(headTop, muzzle, 0.1, 0.065, coat, fine ? (_l, w) => (len(sub(w, headTop)) < 0.16 ? null : { shade: 0.3 }) : undefined);
  sc.sphere(muzzle, 0.06, coat);
  if (g.jaw) sc.limb(add(muzzle, mul(headDir, -0.08)), add(muzzle, add(mul(headDir, -0.02), mul(B.U, -0.07 * g.jaw))), 0.04, 0.03, coat); // the lower jaw dropped
  for (const s of [-1, 1]) {
    // ears (one laid back when flicked), eyes and nostrils
    const back = g.ear > 0 && s === 1 ? g.ear : 0;
    sc.limb(add(headTop, mul(HR, s * 0.05)), add(headTop, add(add(mul(B.U, 0.13 - back * 0.05), mul(HR, s * 0.06)), mul(HF, -back * 0.08))), 0.025, 0.012, coat);
    sc.dot(add(add(headTop, mul(headDir, 0.12)), add(mul(HR, s * 0.085), mul(B.U, 0.02))), 0x1a1412, 0.03);
    if (fine) sc.dot(add(add(muzzle, mul(headDir, 0.04)), mul(HR, s * 0.035)), coat.ramp[4], 0.03);
  }
  sc.group();
  // the mane: a crest of hair falling to one side, combed into strands at 2x; it lifts in a gallop
  const strands = (_l: V3, w: V3): Hit | null => (fine && ((Math.floor((w[0] + w[1]) * 9) + Math.floor(w[2] * 11)) & 1) === 0 ? { shade: 0.6 } : null);
  const fly = Math.max(0, g.tailUp - 0.2) * 0.3;
  sc.limb(add(neckBase, mul(B.U, 0.14)), add(headTop, mul(B.U, 0.08 + fly)), 0.055, 0.045, MANE, strands);
  if (fine) sc.limb(add(add(neckBase, mul(B.U, 0.06)), mul(B.R, 0.1)), add(add(headTop, mul(B.U, 0.02)), mul(B.R, 0.09)), 0.04, 0.025, MANE, strands); // the mane's fall down the right of the neck
  if (fine) sc.limb(add(headTop, mul(B.U, 0.09)), add(headTop, add(mul(headDir, 0.14), mul(B.U, 0.06))), 0.035, 0.015, MANE); // forelock
  const tailRoot = bp(-0.86 - 0.04 * st, 0, 1.4);
  const tailDir = B.dir(-0.6 - g.tailUp * 0.5, g.tail, -0.8 + g.tailUp * 1.2);
  sc.limb(tailRoot, add(tailRoot, mul(tailDir, 0.6)), 0.06, 0.03, MANE, strands);
  // tack: saddle cloth, bridle, reins
  let saddle = bp(-0.08, 0, 1.52);
  if (cloth) {
    sc.group();
    sc.blob(bp(-0.1, 0, 1.44), pitchF, B.R, pitchU, 0.36, 0.3, 0.1, cloth, (l) => (l[2] < -0.5 ? { shade: 0.6 } : fine && l[2] < -0.2 && (Math.floor((l[0] + 1) * 7) & 1) === 0 ? { shade: 0.8 } : fine && Math.abs(l[0]) > 0.9 ? { shade: -0.4 } : null));
    saddle = bp(-0.08, 0, 1.56);
    // the girth under the belly
    if (fine) sc.blob(bp(-0.08, 0, 1.2), pitchF, B.R, pitchU, 0.03, 0.29, 0.3, DARK_LEATHER);
  }
  if (tack) {
    sc.line(add(headTop, mul(B.U, -0.04)), muzzle, tack, 1);
    sc.line(muzzle, add(saddle, mul(B.F, 0.3)), tack, 1);
    if (fine) {
      // bridle: noseband, cheek strap and browband with a bronze boss; a breast strap across the chest
      const nose = add(muzzle, mul(headDir, -0.06));
      for (const s of [-1, 1]) sc.line(add(nose, add(mul(HR, s * 0.06), mul(B.U, 0.04))), add(nose, add(mul(HR, s * 0.06), mul(B.U, -0.05))), tack, 0.5);
      sc.line(add(headTop, add(mul(HR, 0.1), mul(B.U, -0.02))), add(nose, add(mul(HR, 0.065), mul(B.U, 0.02))), tack, 0.5);
      sc.line(add(headTop, add(mul(HR, -0.1), mul(B.U, 0.08))), add(headTop, add(mul(HR, 0.1), mul(B.U, 0.08))), tack, 0.5);
      sc.dot(add(add(headTop, mul(headDir, 0.1)), add(mul(HR, 0.1), mul(B.U, -0.01))), 0xc8a050, 0.04);
      sc.line(bp(0.5, -0.26, 1.3), bp(0.74, 0, 1.26), tack, 0.5);
      sc.line(bp(0.74, 0, 1.26), bp(0.5, 0.26, 1.3), tack, 0.5);
      sc.dot(bp(0.76, 0, 1.26), 0xc8a050, 0.05);
    }
  }
  // rearing: the whole horse pitches up about the hind hooves
  if (g.rear) {
    const pivot = at(-0.6, 0, 0);
    sc.rotate(pivot, B.R, -g.rear);
    saddle = rotAbout(saddle, pivot, B.R, -g.rear);
  }
  return saddle;
}

/** Rodrigues rotation of a point about an axis through a pivot. */
function rotAbout(p: V3, pivot: V3, axis: V3, angle: number): V3 {
  const k = norm(axis);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const v = sub(p, pivot);
  return add(pivot, add(add(mul(v, c), mul(cross(k, v), s)), mul(k, (k[0] * v[0] + k[1] * v[1] + k[2] * v[2]) * (1 - c))));
}

/** The rider's body following his horse: seated, bobbing and leaning with the gait, the arms doing the frame's act. */
function riderPose(d: DollSpec, frame: number, g: Gait): ManPose {
  const p = manPose({ ...d, shield: d.shield }, frame);
  const name = FRAME_NAMES[frame] ?? 'idle0';
  p.seated = true;
  p.pf = 0;
  p.pr = 0;
  p.footL = [0, 0, 0];
  p.footR = [0, 0, 0];
  p.fall = 0;
  p.fallFwd = false;
  p.dead = false;
  p.phase = NaN;
  p.swing = 0;
  p.roll = g.roll * 0.5;
  p.twist *= 0.7;
  // a lean of his own per act, plus following the horse: forward with its pitch down, back when it rears
  let lean = 0.02;
  let nod = 0;
  if (name.startsWith('walk')) {
    lean = 0.06;
    nod = 0.01;
    p.lag = 0.04;
  } else if (name.startsWith('run')) {
    // forward seat in the gallop, the body rising a little in the suspension
    lean = 0.16 + 0.04 * g.stretch;
    nod = 0.015;
    p.lag = 0.18 + g.bob;
  } else if (name.startsWith('rout')) {
    lean = 0.24;
    nod = 0.03;
    p.lag = 0.22;
  } else {
    switch (name) {
      case 'wind':
        lean = -0.03;
        break;
      case 'atk0':
        lean = -0.06;
        break;
      case 'atk1':
        lean = 0.17;
        nod = 0.02;
        p.lag = 0.08;
        break;
      case 'follow':
        lean = 0.2;
        nod = 0.03;
        p.lag = 0.06;
        break;
      case 'atk2':
        lean = 0.06;
        break;
      case 'block':
        lean = -0.04;
        break;
      case 'hit':
        // thrown back as the horse rears, the free hand grabbing the mane
        lean = -0.05;
        nod = -0.03;
        p.lag = -0.08;
        break;
      case 'hit1':
        lean = -0.08;
        nod = 0.02;
        p.lag = -0.03;
        break;
      case 'die0':
        lean = 0.26;
        nod = 0.1;
        p.arm = 'fall';
        p.lag = -0.06;
        break;
      case 'die1':
        lean = 0.34;
        nod = 0.06;
        p.arm = 'fall';
        p.lag = -0.1;
        break;
      case 'dieB0':
        lean = -0.16;
        nod = -0.06;
        p.arm = 'fall';
        p.lag = -0.05;
        break;
      case 'dieB1':
        lean = -0.26;
        nod = -0.04;
        p.arm = 'fall';
        p.roll = -0.3;
        p.lag = -0.1;
        break;
      case 'win0':
      case 'win1':
        lean = -0.05;
        break;
    }
  }
  p.lean = lean - g.pitch * 0.6 - g.rear * 0.06;
  p.nod = nod - g.rear * 0.04;
  return p;
}

function buildRider(sc: Scene, d: DollSpec, frame: number, B: Basis, dir: number): void {
  const coat = COATS[(d.coat ?? 0) % COATS.length];
  const cloth = d.cloak ? CLOTH[d.cloak] ?? null : null;
  const g = horseGait(frame, d.seed ?? 0);
  const name = FRAME_NAMES[frame] ?? 'idle0';
  const fine = fineDetail(d);
  const horse = new Scene();
  const saddle = buildHorse(horse, B, g, coat, [0, 0, 0], LEATHER, cloth ?? CLOTH.tunicOchre, fine);
  const riderScene = new Scene();
  // the rider leaves the saddle once the horse is going over: die1b / die2 thrown ahead, dieB2 / dieB3 pinned behind
  const thrown = name === 'die1b' || name === 'die2' ? 1 : name === 'dieB2' || name === 'dieB3' ? 2 : 0;
  if (!thrown) {
    const p = riderPose(d, frame, g);
    // seated just above the saddle, the seat absorbing a little of the bob
    p.hip = saddle[2] + 0.08 - g.bob * 0.35;
    const pelvis = B.at([0, 0, 0], 0, 0, 0);
    void pelvis;
    buildMan(riderScene, d, frame, B, dir, p, [saddle[0], saddle[1], 0]);
    if (g.rear) riderScene.rotate(B.at([0, 0, 0], -0.6, 0, 0), B.R, -g.rear);
  } else {
    // flung clear: on his back beside the horse (die, which lies on its left: he lands to its right), or
    // on his face (dieB: to its left). The frame has little room below the feet line, so of the two
    // spots either way along the horse the one that projects upwards on screen is used.
    const f = thrown === 1 ? (name === 'die1b' ? FRAME.die1b : FRAME.die2) : name === 'dieB2' ? FRAME.dieB2 : FRAME.dieB3;
    const r = thrown === 1 ? 0.55 : -0.65;
    const spot = [B.at([0, 0, 0], 0.5, r, 0), B.at([0, 0, 0], -0.5, r, 0)].sort((a, b) => project(a).y - project(b).y)[0];
    // and he lies along whichever facing runs up the screen (a body stretched below the feet line would be cut)
    const kDir = [0, 1, 2, 3].sort((a, b) => project([DIRS[a][0], DIRS[a][1], 0]).y - project([DIRS[b][0], DIRS[b][1], 0]).y)[(dir + 1) % 2];
    const B2 = basis(DIRS[kDir][0], DIRS[kDir][1]);
    const pp = manPose({ ...d, cloak: undefined }, f);
    buildMan(riderScene, { ...d, cloak: undefined }, f, B2, kDir, pp, spot);
  }
  if (g.roll) {
    // the horse goes over onto a side (its left for die, right for dieB), hinging on the hooves of that side,
    // then is pulled back so it lies across where it stood; a rider still seated goes over with it
    const side = g.roll > 0 ? -1 : 1;
    const pivot = B.at([0, 0, 0], 0, side * 0.3, 0);
    const shift = mul(B.R, -side * Math.sin(Math.min(Math.abs(g.roll), Math.PI / 2)) * 0.7);
    horse.rotate(pivot, B.F, g.roll);
    horse.translate(shift);
    if (!thrown) {
      riderScene.rotate(pivot, B.F, g.roll * 0.85);
      riderScene.translate(shift);
    }
    if (Math.abs(g.roll) > 1.2) {
      horse.group();
      horse.blob(B.at([0, 0, 0], 0.1, side * 0.2, 0.005), B.F, B.R, B.U, 0.6, 0.35, 0.01, BLOOD);
    }
  }
  // draw order: the rider behind the horse's near side when he is thrown on the far side (the scene depth-tests anyway)
  merge(sc, horse);
  merge(sc, riderScene);
}

/** Two horses, a pole and a scythed two-wheeled car with a driver and the warrior (sixteen legacy columns). */
function buildChariot(sc: Scene, d: DollSpec, frame: number, B: Basis, dir: number): void {
  const name = FRAME_NAMES[frame];
  const wrecked = name === 'die1' || name === 'die2';
  const coatA = COATS[(d.coat ?? 0) % COATS.length];
  const coatB = COATS[((d.coat ?? 0) + 3) % COATS.length];
  const fine = fineDetail(d);
  // horses abreast in front: the legacy walk columns are their gallop, a little out of step with each other
  for (const [side, coat, j] of [[-0.42, coatA, 0], [0.42, coatB, 1]] as [number, Material, number][]) {
    const h = new Scene();
    let g: Gait;
    if (name.startsWith('walk')) {
      const ph = (frame - 2) / 4 + j * 0.08;
      g = baseGait();
      g.legs = legsOf('gallop', ph, 0.95, [0.28, 0.32]);
      g.bob = 0.05 * cyc(ph, 0.85) - 0.01;
      g.pitch = 0.09 * cyc(ph, 0.15);
      g.head = -0.04 + 0.12 * cyc(ph, 0.1);
      g.neck = 0.06 * cyc(ph, 0.45);
      g.stretch = cyc(ph, 0.45);
      g.tailUp = 0.3;
    } else if (wrecked) g = horseGait(name === 'die1' ? FRAME.die1 : FRAME.die2);
    else if (name === 'die0') g = horseGait(j ? FRAME.die0 : FRAME.hit1);
    else if (name === 'hit') g = horseGait(j ? FRAME.hit1 : FRAME.hit);
    else if (name.startsWith('atk')) g = horseGait(FRAME.run0 + (frame - FRAME.atk0) * 2 + j);
    else g = horseGait(frame === 1 ? (j ? FRAME.idle3 : FRAME.idle1) : j ? FRAME.idle0 : FRAME.idle2);
    const saddle = buildHorse(h, B, g, coat, B.at([0, 0, 0], 0.9, side, 0), LEATHER, null, fine);
    void saddle;
    if (g.roll) {
      const pivot = B.at([0, 0, 0], 0.9, side - 0.3, 0);
      h.rotate(pivot, B.F, g.roll);
      h.translate(mul(B.R, Math.sin(Math.min(g.roll, Math.PI / 2)) * 0.7));
    }
    merge(sc, h);
  }
  sc.group();
  const car = B.at([0, 0, 0], -0.75, 0, 0.78);
  const tilt = wrecked ? 0.5 : 0;
  // the pole and yoke
  sc.line(B.at(car, 0.3, 0, -0.1), B.at([0, 0, 0], 1.25, 0, 1.25), DARK_WOOD, 2);
  sc.line(B.at([0, 0, 0], 1.25, -0.5, 1.3), B.at([0, 0, 0], 1.25, 0.5, 1.3), DARK_WOOD, 1);
  // the car: a wicker box with a red-painted rail
  sc.box(car, mul(B.F, 0.36), mul(B.R, 0.5), mul(B.U, 0.28), WOOD, (l) => (l[2] > 0.6 ? { ramp: CLOTH.tunicRed.ramp } : ((Math.floor((l[0] + l[1]) * 6) & 1) === 0 ? { shade: 0.6 } : null)));
  // wheels with spokes and scythes on the hubs
  for (const s of [-1, 1]) {
    const hub = B.at([0, 0, 0], -0.8, s * 0.62, 0.48);
    const n = mul(B.R, s);
    const { s: ws, v: wv } = shieldFrame(n);
    const spin = (frame % 4) * 0.4;
    sc.ellipsoid(hub, mul(n, 0.05), mul(ws, 0.48), mul(wv, 0.48), DARK_WOOD, (l) => {
      const r = Math.sqrt(l[1] * l[1] + l[2] * l[2]);
      if (r > 0.82) return { ramp: IRON.ramp };
      if (r < 0.2) return { ramp: BRONZE.ramp };
      const a = Math.atan2(l[2], l[1]) + spin;
      const sp = ((a % (Math.PI / 3)) + Math.PI / 3) % (Math.PI / 3);
      return sp < 0.18 ? null : { hole: true };
    });
    if (!wrecked) sc.line(hub, add(hub, add(mul(n, 0.6), mul(B.F, -0.15))), IRON, 2);
  }
  // crew: the warrior (the hero) and a driver, standing in the car
  const crew = new Scene();
  if (!wrecked) {
    const p = manPose({ ...d, shield: undefined }, frame);
    p.footL = [0.08, -0.12, 0];
    p.footR = [-0.06, 0.12, 0];
    if (frame >= 10) p.arm = 'fall';
    p.fall = 0;
    p.dead = false;
    // braced against the car's bounce
    if (name.startsWith('walk')) {
      p.lean = 0.08;
      p.hip = 0.94 + 0.015 * cyc((frame - 2) / 4, 0.85);
    }
    buildMan(crew, { ...d, cloak: undefined, mount: undefined }, frame, B, dir, p, B.at(car, 0.02, 0.2, -0.22));
    const driver: DollSpec = { look: { ...d.look, tunic: 'tunicWhite', beard: 0 }, helmet: { art: 'cap' }, seed: 1 };
    const dp = manPose(driver, 0);
    dp.arm = 'idle';
    if (name.startsWith('walk')) {
      dp.lean = 0.1;
      dp.hip = 0.93 + 0.015 * cyc((frame - 2) / 4, 0.85);
    }
    buildMan(crew, driver, 0, B, dir, dp, B.at(car, 0.06, -0.22, -0.22));
  } else {
    const pp = manPose(d, name === 'die1' ? 11 : 12);
    buildMan(crew, { ...d, cloak: undefined }, name === 'die1' ? 11 : 12, B, dir, pp, B.at([0, 0, 0], 0.2, 0.9, 0));
  }
  merge(sc, crew);
  if (tilt) sc.rotate(B.at([0, 0, 0], -0.8, 0.6, 0), B.F, tilt * 0.6);
}

// ================================================================ animals

/** Body of a wild animal: lengths in metres, how it moves. */
interface BeastBody {
  /** Shoulder height, half-length, half-width, half-height of the barrel. */
  h: number;
  l: number;
  r: number;
  u: number;
  /** Leg radius; upper and lower bone lengths. */
  leg: number;
  up: number;
  low: number;
  /** Head size and the snout's length. */
  head: number;
  snout: number;
  /** Gait at a walk and at a run; stride (m) and foot lift for each. */
  walk: GaitKind;
  run: GaitKind;
  stride: [number, number];
  lift: [number, number];
}

const BODIES: Record<'wolf' | 'boar' | 'bear', BeastBody> = {
  wolf: { h: 0.55, l: 0.42, r: 0.13, u: 0.15, leg: 0.05, up: 0.24, low: 0.26, head: 0.1, snout: 0.2, walk: 'trot', run: 'rotary', stride: [0.36, 0.7], lift: [0.08, 0.16] },
  boar: { h: 0.5, l: 0.48, r: 0.22, u: 0.25, leg: 0.065, up: 0.2, low: 0.2, head: 0.15, snout: 0.22, walk: 'trot', run: 'rotary', stride: [0.3, 0.55], lift: [0.06, 0.14] },
  bear: { h: 0.75, l: 0.7, r: 0.38, u: 0.4, leg: 0.11, up: 0.32, low: 0.32, head: 0.17, snout: 0.17, walk: 'pace', run: 'rotary', stride: [0.5, 0.85], lift: [0.1, 0.18] },
};

/** The pose of a wild animal for a frame of the full set. */
/** The three wild animals (mythic beasts are built in src/art/beastArt.ts). */
type WildId = keyof typeof BODIES;
const wildOf = (beast: BeastId): WildId => (beast === 'boar' || beast === 'bear' ? beast : 'wolf');

function beastGait(beast: WildId, frame: number, seed: number): Gait {
  const b = BODIES[beast];
  const g = baseGait();
  const name = FRAME_NAMES[frame] ?? 'idle0';
  const num = (pre: string) => Number(name.slice(pre.length));
  const bear = beast === 'bear';
  const boar = beast === 'boar';
  if (name.startsWith('idle')) {
    const k = num('idle');
    if (k === 1) {
      // sniffing the ground, the tail low
      g.head = boar ? -0.1 : -0.22;
      g.neck = 0.04;
      g.tailUp = -0.1;
      g.ear = 0.4;
    } else if (k === 2) {
      // a look aside, one ear turned
      g.yaw = seed & 1 ? -0.4 : 0.4;
      g.head = 0.05;
      g.ear = 1;
      g.tail = 0.2;
    } else if (k === 3) {
      g.head = -0.06;
      g.tail = -0.25;
      g.ear = 0.6;
      g.bob = 0.008;
    }
    if (k === 0) g.bob = -0.005;
  } else if (name.startsWith('walk')) {
    // a trot (the bear ambles: lateral pairs, the body swaying), the head nodding with the stride
    const ph = num('walk') / 8;
    g.legs = legsOf(b.walk, ph, b.stride[0], [b.lift[0], b.lift[0]]);
    g.bob = 0.02 * cyc(2 * ph, 0.2);
    g.head = -0.05 + 0.05 * cyc(2 * ph, 0.45);
    g.roll = bear ? 0.1 * Math.sin(TAU * (ph + 0.05)) : 0.02 * Math.sin(TAU * ph);
    g.tail = 0.25 * Math.sin(TAU * ph);
    g.tailUp = bear ? 0 : 0.1;
  } else if (name.startsWith('run') || name.startsWith('rout')) {
    // a rotary gallop: the spine gathers as the hinds come under, extends as the fores reach; the head low
    const rout = name.startsWith('rout');
    const ph = rout ? num('rout') / 4 : num('run') / 6;
    g.legs = legsOf(b.run, ph, b.stride[1], [b.lift[1], b.lift[1] * 1.2]);
    g.stretch = cyc(ph, 0.45);
    g.bob = 0.04 * cyc(ph, 0.65) + 0.015;
    g.pitch = 0.1 * cyc(ph, 0.2);
    g.head = -0.12 + 0.06 * cyc(ph, 0.5);
    g.neck = 0.05 + 0.04 * g.stretch;
    g.tailUp = rout ? -0.35 : 0.25;
    g.tail = 0.1 * Math.sin(TAU * ph);
    g.ear = rout ? 1 : 0.3;
    if (rout) g.head -= 0.08;
  } else {
    switch (name) {
      case 'wind':
        // the crouch: belly low, ears back, eyes on the target (the bear rises)
        if (bear) {
          g.rear = 0.45;
          g.head = 0.1;
          g.legs[0] = { x: 0.1, z: 0.25 };
          g.legs[1] = { x: 0.15, z: 0.22 };
        } else {
          g.down = 0.1;
          g.head = -0.15;
          g.neck = 0.05;
          g.legs[2] = { x: 0.08, z: 0 };
          g.legs[3] = { x: 0.1, z: 0 };
          g.stretch = -0.3;
        }
        g.ear = 1;
        g.tailUp = -0.15;
        break;
      case 'atk0':
        // coiled: the hinds gathered under, the body shortened (the bear rears to its full height)
        if (bear) {
          g.rear = 0.95;
          g.head = 0.15;
          g.jaw = 1;
          g.legs[0] = { x: 0.2, z: 0.5 };
          g.legs[1] = { x: 0.3, z: 0.45 };
        } else {
          g.down = 0.14;
          g.head = -0.1;
          g.neck = 0.02;
          g.lunge = -0.08;
          g.legs[2] = { x: 0.2, z: 0 };
          g.legs[3] = { x: 0.24, z: 0 };
          g.legs[0] = { x: -0.05, z: 0 };
          g.stretch = -0.9;
          g.jaw = 0.5;
        }
        g.ear = 1;
        g.tailUp = -0.1;
        break;
      case 'atk1':
        // the lunge: airborne and stretched, jaws open (the boar's head drives up with the tusks; the bear swipes)
        if (bear) {
          g.rear = 0.55;
          g.head = 0.0;
          g.neck = 0.06;
          g.jaw = 1;
          g.lunge = 0.1;
          g.legs[1] = { x: 0.55, z: 0.3 };
          g.legs[0] = { x: 0.05, z: 0.4 };
          g.legs[2] = { x: -0.05, z: 0 };
        } else {
          // airborne: the fores reach ahead and up, the hinds trail, every paw clear of the ground
          g.lunge = 0.28;
          g.bob = 0.14;
          g.pitch = boar ? 0.12 : 0.06;
          g.stretch = 1;
          g.head = boar ? 0.2 : -0.02;
          g.neck = 0.1;
          g.jaw = 1;
          g.legs[0] = { x: 0.34, z: b.h * 0.85 };
          g.legs[1] = { x: 0.4, z: b.h * 0.75 };
          g.legs[2] = { x: -0.34, z: b.h * 0.75 };
          g.legs[3] = { x: -0.3, z: b.h * 0.85 };
        }
        g.ear = 1;
        g.tailUp = 0.2;
        break;
      case 'follow':
        // the bite: landed on the fores, the head down on the target (the bear's paws slam down)
        if (bear) {
          g.rear = 0.1;
          g.head = -0.2;
          g.neck = 0.08;
          g.jaw = 1;
          g.lunge = 0.14;
          g.legs[0] = { x: 0.3, z: 0 };
          g.legs[1] = { x: 0.34, z: 0 };
          g.legs[2] = { x: -0.1, z: 0 };
          g.stretch = 0.5;
        } else {
          g.lunge = 0.32;
          g.bob = 0.0;
          g.pitch = -0.1;
          g.stretch = 0.6;
          g.head = boar ? 0.05 : -0.22;
          g.neck = 0.1;
          g.jaw = 0.8;
          g.legs[0] = { x: 0.26, z: 0 };
          g.legs[1] = { x: 0.32, z: 0 };
          g.legs[2] = { x: -0.28, z: 0.06 };
          g.legs[3] = { x: -0.22, z: 0.1 };
        }
        g.ear = 1;
        break;
      case 'atk2':
        // backing off, the head still low
        g.lunge = bear ? 0.04 : 0.1;
        g.head = -0.1;
        g.neck = 0.04;
        g.jaw = 0.3;
        g.legs[1] = { x: 0.12, z: 0 };
        g.legs[2] = { x: -0.1, z: 0 };
        g.stretch = 0.2;
        g.ear = 0.6;
        break;
      case 'block':
      case 'hit':
        // the flinch: thrown back on the haunches, the head up and away, a yelp
        g.lunge = -0.1;
        g.down = 0.06;
        g.pitch = 0.12;
        g.head = 0.15;
        g.neck = -0.05;
        g.jaw = 1;
        g.legs[0] = { x: 0.18, z: 0.1 };
        g.legs[1] = { x: 0.14, z: 0 };
        g.legs[2] = { x: 0.1, z: 0 };
        g.legs[3] = { x: 0.14, z: 0 };
        g.ear = 1;
        g.tailUp = -0.3;
        break;
      case 'hit1':
        // cowering: low, the tail down
        g.down = 0.12;
        g.head = -0.08;
        g.lunge = -0.05;
        g.legs[0] = { x: 0.08, z: 0 };
        g.legs[2] = { x: 0.06, z: 0 };
        g.ear = 1;
        g.tailUp = -0.35;
        break;
      case 'die0':
        // the stumble: the fores fold, the chin drops
        g.down = 0.1;
        g.pitch = -0.25;
        g.head = -0.25;
        g.legs[0] = { x: -0.2, z: 0.04 };
        g.legs[1] = { x: 0.1, z: 0 };
        g.legs[2] = { x: -0.15, z: 0 };
        g.legs[3] = { x: -0.08, z: 0 };
        g.ear = 1;
        g.tailUp = -0.2;
        break;
      case 'die1':
        // going over onto its left side
        g.down = b.u * 0.3;
        g.pitch = -0.15;
        g.roll = 0.7;
        g.head = -0.15;
        g.legs[0] = { x: 0.15, z: 0.1 };
        g.legs[1] = { x: 0.25, z: 0.08 };
        g.legs[2] = { x: -0.2, z: 0.06 };
        g.legs[3] = { x: 0.05, z: 0.12 };
        g.ear = 1;
        break;
      case 'die1b':
        // on its side, the legs kicking
        g.down = 0.02;
        g.roll = 1.35;
        g.head = -0.08;
        g.neck = 0.05;
        g.legs[0] = { x: 0.25, z: 0.18 };
        g.legs[1] = { x: 0.3, z: 0.06 };
        g.legs[2] = { x: -0.15, z: 0.2 };
        g.legs[3] = { x: -0.05, z: 0.1 };
        g.ear = 1;
        break;
      case 'die2':
        g.down = 0.02;
        g.roll = 1.5;
        g.head = -0.1;
        g.neck = 0.06;
        g.legs[0] = { x: 0.2, z: 0.08 };
        g.legs[1] = { x: 0.28, z: 0.0 };
        g.legs[2] = { x: -0.2, z: 0.06 };
        g.legs[3] = { x: -0.08, z: 0.02 };
        g.ear = 1;
        break;
      case 'dieB0':
      case 'dieB1':
      case 'dieB2':
      case 'dieB3': {
        // sinking: the hinds give, then the belly on the ground, then the head goes down and the legs splay
        const k = num('dieB');
        g.down = [b.h * 0.25, b.h * 0.55, b.h * 0.62, b.h * 0.62][k];
        g.pitch = [0.15, 0.05, 0, 0][k];
        g.head = [0.12, 0.08, -0.22, -0.3][k];
        g.neck = [0, 0.02, 0.1, 0.14][k];
        g.jaw = [1, 0.6, 0.2, 0][k];
        const sp = [0.05, 0.15, 0.22, 0.26][k];
        g.legs[0] = { x: sp * 2, z: 0 };
        g.legs[1] = { x: sp * 2.4, z: 0 };
        g.legs[2] = { x: -sp, z: 0 };
        g.legs[3] = { x: -sp * 1.3, z: 0 };
        g.ear = 1;
        g.tailUp = -0.3;
        break;
      }
      case 'win0':
      case 'win1':
        // the howl / the bear up on its hinds
        if (bear) {
          g.rear = num('win') ? 0.95 : 0.85;
          g.head = 0.12;
          g.legs[0] = { x: 0.2, z: 0.5 };
          g.legs[1] = { x: 0.25, z: 0.45 + num('win') * 0.08 };
        } else {
          g.head = num('win') ? 0.4 : 0.32;
          g.neck = -0.03;
          g.jaw = num('win') ? 0.8 : 0.4;
        }
        g.tailUp = 0.3;
        break;
    }
  }
  return g;
}

function buildBeast(sc: Scene, id: BeastId, frame: number, B: Basis, seed: number): void {
  const beast = wildOf(id);
  const c = BEAST[beast];
  const b = BODIES[beast];
  const g = beastGait(beast, frame, seed);
  const name = FRAME_NAMES[frame] ?? 'idle0';
  const bear = beast === 'bear';
  const boar = beast === 'boar';
  const wolf = beast === 'wolf';
  const o: V3 = B.at([0, 0, 0], g.lunge, 0, 0);
  const at = (f: number, r: number, u: number) => B.at(o, f, r, u + g.bob - g.down);
  // the body pitches about the centre of the barrel; the feet stay where the gait put them
  const centre = at(0, 0, b.h);
  const cp = Math.cos(g.pitch);
  const sp = Math.sin(g.pitch);
  const bp = (f: number, r: number, u: number): V3 => {
    const p = at(f, r, u);
    const d = sub(p, centre);
    const fwd = d[0] * B.F[0] + d[1] * B.F[1] + d[2] * B.F[2];
    const up = d[2];
    const rt = d[0] * B.R[0] + d[1] * B.R[1] + d[2] * B.R[2];
    return add(centre, add(add(mul(B.F, fwd * cp - up * sp), mul(B.U, fwd * sp + up * cp)), mul(B.R, rt)));
  };
  const pitchF = add(mul(B.F, cp), mul(B.U, sp));
  const pitchU = add(mul(B.U, cp), mul(B.F, -sp));
  const st = g.stretch;
  // legs: shoulder / hip -> knee or hock -> paw, two-bone IK (the spine's stretch moves the leg roots)
  sc.group();
  const lx = b.l * 0.72;
  const legs: [number, number, number][] = [[lx + 0.06 * st, -b.r * 0.6, 0], [lx + 0.06 * st, b.r * 0.6, 1], [-lx - 0.08 * st, -b.r * 0.6, 2], [-lx - 0.08 * st, b.r * 0.6, 3]];
  for (const [lf, lr, i] of legs) {
    const top = bp(lf, lr, b.h - b.u * 0.25);
    const hind = i >= 2;
    const lp = g.legs[i];
    const foot = B.at(o, lf + lp.x, lr, 0.035 + lp.z);
    const { mid: knee } = ik(top, foot, b.up, b.low, hind ? B.dir(-1, 0, -0.3) : B.dir(1, 0, -0.2));
    sc.limb(top, knee, b.leg * 1.4, b.leg, c.coat);
    sc.limb(knee, foot, b.leg, b.leg * 0.85, i % 2 ? c.dark : c.coat);
    if (bear) sc.sphere(add(foot, mul(B.F, 0.04)), b.leg * 0.9, c.dark); // the paw
  }
  // body with a lighter belly and a darker back; the barrel stretches and arches with the gallop
  sc.group();
  const shade = (l: V3): Hit | null => (l[2] < -0.45 ? { ramp: c.belly.ramp } : l[2] > 0.7 ? { shade: 0.7 } : null);
  const arch = -0.05 * Math.min(0, st); // the back arches when gathered
  sc.blob(bp(0, 0, b.h + arch), pitchF, B.R, pitchU, b.l * (1 + 0.1 * st), b.r, b.u * (1 - 0.05 * st), c.coat, shade);
  sc.blob(bp(b.l * (0.55 + 0.08 * st), 0, b.h + b.u * 0.1), pitchF, B.R, pitchU, b.l * 0.45, b.r * 1.08, b.u * 1.05, c.coat, shade);
  if (boar) sc.limb(bp(-b.l * 0.4, 0, b.h + b.u * 0.85), bp(b.l * 0.6, 0, b.h + b.u * 1.05), 0.05, 0.07, c.dark); // bristle ridge
  if (bear) sc.blob(bp(b.l * 0.35, 0, b.h + b.u * 0.75), pitchF, B.R, pitchU, 0.25, 0.28, 0.18, c.coat); // shoulder hump
  // head: the neck swings up / down and out, the head turns
  sc.group();
  const neck = bp(b.l * 0.95 + g.neck * 0.5, 0, b.h + b.u * (boar ? 0.1 : 0.45));
  const cy = Math.cos(g.yaw);
  const sy = Math.sin(g.yaw);
  const HF = add(mul(B.F, cy), mul(B.R, sy));
  const HR = add(mul(B.R, cy), mul(B.F, -sy));
  const headC = add(neck, mul(norm(add(mul(HF, 0.7 + g.neck * 2), mul(B.U, (boar ? -0.4 : 0.25) + g.head * 1.5))), bear ? 0.28 : 0.2));
  const hr = b.head;
  sc.limb(neck, headC, hr * 1.1, hr, c.coat);
  const snoutDir = norm(add(mul(HF, 1), mul(B.U, (boar ? -0.45 : -0.2) + g.head * 0.8)));
  const snout = add(headC, mul(snoutDir, b.snout));
  sc.limb(headC, snout, hr * 0.75, hr * 0.38, wolf ? c.belly : c.coat);
  sc.sphere(snout, hr * 0.32, c.dark);
  if (g.jaw) {
    // the lower jaw dropped: a second, shorter muzzle below, and the teeth
    const jawDir = norm(add(snoutDir, mul(B.U, -0.5 * g.jaw)));
    const jawEnd = add(headC, mul(jawDir, b.snout * 0.8));
    sc.limb(add(headC, mul(B.U, -hr * 0.3)), jawEnd, hr * 0.45, hr * 0.25, wolf ? c.belly : c.coat);
    if (!bear) sc.line(add(snout, mul(B.U, -hr * 0.25)), add(snout, mul(B.U, -hr * 0.25 - 0.04 * g.jaw)), IVORY, 1);
  }
  for (const s of [-1, 1]) {
    // ears (laid back when flicked or fighting) and eyes
    const back = g.ear > 0 && (s === 1 || g.ear >= 1) ? g.ear : 0;
    const ear = add(headC, add(add(mul(HR, s * hr * 0.6), mul(B.U, hr * 0.8 - back * hr * 0.3)), mul(HF, -back * hr * 0.45)));
    sc.limb(add(headC, mul(HR, s * hr * 0.5)), ear, hr * 0.3, wolf ? 0.012 : hr * 0.2, c.dark);
    sc.sphere(add(headC, add(add(mul(HF, hr * 0.7), mul(HR, s * hr * 0.45)), mul(B.U, hr * 0.25))), 0.016, EYE);
  }
  if (boar) {
    for (const s of [-1, 1]) sc.line(add(snout, mul(HR, s * 0.05)), add(snout, add(mul(HR, s * 0.08), add(mul(B.U, 0.1), mul(HF, -0.02)))), IVORY, 1);
  }
  // tail: swishing, carried high at a run, tucked when beaten
  sc.group();
  const tail0 = bp(-b.l * 0.95, 0, b.h + b.u * 0.4);
  const tLen = wolf ? 0.45 : 0.12;
  const tDir = B.dir(-0.7 - g.tailUp * 0.3, g.tail, (wolf ? -0.55 : -0.4) + g.tailUp * 1.6);
  sc.limb(tail0, add(tail0, mul(tDir, tLen)), wolf ? 0.06 : 0.02, wolf ? 0.03 : 0.01, wolf ? c.coat : c.dark);
  // rearing (pitch up about the hind feet), falling onto a side
  if (g.rear) sc.rotate(B.at(o, -lx, 0, 0), B.R, -g.rear);
  if (g.roll) {
    const side = g.roll > 0 ? -1 : 1;
    const pivot = B.at(o, 0, side * b.r * 0.6, 0);
    sc.rotate(pivot, B.F, g.roll);
    sc.translate(mul(B.R, -side * Math.sin(Math.min(Math.abs(g.roll), Math.PI / 2)) * b.h * 0.55));
    if (Math.abs(g.roll) > 1.2) {
      sc.group();
      sc.blob(B.at(o, 0.1, side * b.u * 0.5, 0.005), B.F, B.R, B.U, b.l * 0.7, b.r * 1.4, 0.01, BLOOD);
    }
  } else if (name === 'dieB3') {
    sc.group();
    sc.blob(B.at(o, b.l * 0.6, 0.1, 0.005), B.F, B.R, B.U, b.l * 0.5, b.r * 1.2, 0.01, BLOOD);
  }
}


// ---------------------------------------------------------------- portraits

/** Display size (px) of a portrait; the texture is PORTRAIT_RES times larger each way. */
export const PORTRAIT_PX = 24;
export const PORTRAIT_RES = 2;
/**
 * The idle variants of an animated portrait (frame columns of its sheet):
 * breathing, a blink, glances aside, and three positions of a glint sweeping
 * across the metal. A roster picks a seeded sequence of these (portraitLoop).
 */
export const PORTRAIT_FRAMES = ['neutral', 'breath1', 'breath2', 'blink', 'glanceR', 'glanceR2', 'glanceL', 'glint0', 'glint1', 'glint2'] as const;
export type PortraitFrame = (typeof PORTRAIT_FRAMES)[number];
export const PORTRAIT_FRAME: Record<PortraitFrame, number> = Object.fromEntries(PORTRAIT_FRAMES.map((n, i) => [n, i])) as Record<PortraitFrame, number>;

/**
 * A head-and-shoulders bust of a figure, seen from the front 3/4 and lit like
 * the battlefield: box x box display pixels drawn at `res` times the
 * resolution (so the face has brows, a nose and a beard rather than four
 * pixels). Animals show the whole beast. `frame` picks an idle variant
 * (PORTRAIT_FRAMES).
 */
export function renderPortrait(d: DollSpec, frame = 0, res = PORTRAIT_RES, box = PORTRAIT_PX): Pix {
  const size = box * res;
  const name = PORTRAIT_FRAMES[frame] ?? 'neutral';
  if (d.beast) {
    // the whole animal, scaled into the box, nosing about on the breathing frames
    const sc = new Scene();
    const B = basis(0.4, 0.92);
    const col = name === 'breath1' || name === 'glanceR' ? 1 : name === 'breath2' ? 0 : name === 'glanceR2' || name === 'glanceL' ? 9 : 0;
    if (isMythId(d.beast)) buildMyth(sc, d.beast, 0, mythBasis(0.4, 0.92), false, (d.seed ?? 0) % 3);
    else buildBeast(sc, d.beast, col, B, d.seed ?? 0);
    const tall = isMythId(d.beast) ? 3.2 : d.beast === 'bear' ? 1.4 : 0.9;
    const zoom = (box / PPM / (tall * 1.15)) * res;
    sc.translate([0, 0, -tall * 0.45]);
    sc.scale(zoom);
    sc.px = res;
    return sc.render(size, size, size / 2, size / 2);
  }
  // the bust: no shield (it would hide the face at this angle), the spear kept as a hint of the kit
  const base: DollSpec = { ...d, scale: undefined, res: undefined, mount: undefined, shield: undefined };
  const spec: DollSpec = { ...base, scale: res, res: 1 };
  const sc = new Scene();
  const B = basis(0.4, 0.92);
  const p = manPose(spec, 0);
  p.arm = 'idle';
  switch (name) {
    case 'breath1':
      p.breath = 0.6;
      break;
    case 'breath2':
      p.breath = 1;
      p.hip += 0.006;
      p.lag = 0.04;
      break;
    case 'blink':
      p.blink = true;
      p.breath = 0.3;
      break;
    case 'glanceR':
      p.yaw = 0.28;
      p.nod = 0.01;
      p.twist = 0.04;
      break;
    case 'glanceR2':
      p.yaw = 0.14;
      p.breath = 0.4;
      break;
    case 'glanceL':
      p.yaw = -0.24;
      p.breath = 0.5;
      p.lag = 0.05;
      break;
  }
  // the man at `res` times his size, the window centred a little above the head so the crest fits
  const k = buildMan(sc, spec, 0, B, 2, p);
  const centre = add(k.head, [0, 0, 0.05]);
  const zoom = 1.45;
  sc.translate(mul(centre, -1));
  sc.scale(zoom * res);
  sc.px = res;
  const mask = new Uint8Array(size * size);
  const px = sc.render(size, size, size / 2, size / 2 + Math.round(res * 2), { mask, maskMetal: true });
  if (name.startsWith('glint')) {
    // a bright band sweeping across the metal, top-left to bottom-right
    const pos = [0.42, 0.58, 0.74][Number(name.slice(5))];
    const bw = Math.max(1, Math.round(res * 1.2));
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        if (!mask[y * size + x] || px.alpha(x, y) === 0) continue;
        const u = (x + y * 0.5) / (size * 1.5);
        if (Math.abs(u - pos) * size * 1.5 > bw) continue;
        const c = px.get(x, y);
        px.set(x, y, lighten(c, Math.abs(u - pos) * size * 1.5 < bw * 0.5 ? 0.5 : 0.22));
      }
  }
  return px;
}

function lighten(c: number, k: number): number {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  const t = (v: number, to: number) => Math.round(v + (to - v) * k);
  return (t(r, 255) << 16) | (t(g, 246) << 8) | t(b, 216);
}

/**
 * A seeded idle loop over PORTRAIT_FRAMES for one portrait (frame indices with
 * holds, played at PORTRAIT_FPS): slow breathing with a blink every few
 * breaths, a glance aside now and then and an occasional glint, in a
 * different order and rhythm per seed so a roster never moves in step.
 */
export const PORTRAIT_FPS = 6;
export function portraitLoop(seed: number): number[] {
  const F = PORTRAIT_FRAME;
  const out: number[] = [];
  const r = (i: number) => hash2(seed, i, 23);
  const breath = (hold: number) => out.push(F.neutral, F.neutral, F.breath1, F.breath2, F.breath2, F.breath2, F.breath1, ...new Array(hold).fill(F.neutral));
  const n = 4 + Math.floor(r(1) * 3);
  for (let i = 0; i < n; i++) {
    breath(2 + Math.floor(r(10 + i) * 4));
    const ev = r(20 + i);
    if (ev < 0.35) out.push(F.blink, F.neutral);
    else if (ev < 0.55) out.push(F.glanceR2, F.glanceR, F.glanceR, F.glanceR, F.glanceR2, F.neutral, F.neutral);
    else if (ev < 0.7) out.push(F.glanceL, F.glanceL, F.glanceL, F.glanceR2, F.neutral);
    else if (ev < 0.85) out.push(F.glint0, F.glint1, F.glint2);
    if (r(30 + i) < 0.3) out.push(F.blink);
  }
  if (!out.includes(F.glint0)) out.push(F.glint0, F.glint1, F.glint2, F.neutral);
  return out;
}

// ---------------------------------------------------------------- gear icons

/**
 * A helmet, shield or body armour on its own, blown up for an inventory icon
 * (seen from the front-right, lit like the soldiers), in the item's finish
 * when its def and rarity are given. Returns a w x h Pix.
 */
export function renderGearIcon(slot: 'helmet' | 'shield' | 'armor', art: string, paint: ItemPaint | undefined, w = 28, h = 28, tag?: GearTag): Pix {
  const sc = new Scene();
  const B = basis(0.4, 0.92);
  const d: DollSpec = { look: { skin: 1, hair: 0, hairStyle: 2, beard: 0, tunic: 'tunicWhite' }, helmet: slot === 'helmet' ? { art, paint } : undefined, gear: { helmet: tag, shield: tag, armor: tag }, seed: 1 };
  const p = manPose(d, 0);
  const k = skeleton(B, [0, 0, 0], d, p);
  let zoom = 1;
  let center: V3 = k.head;
  if (slot === 'helmet') {
    helmet(sc, d, k.head, B, false, p);
    zoom = 3.4;
    center = add(k.head, [0, 0, 0.08 + ((tag?.r ?? 0) >= 4 ? 0.04 : 0)]);
  } else if (slot === 'shield') {
    shield(sc, { art, paint }, { ...k, handL: B.at(k.chest, 0.3, 0, 0) }, B, 0, p, tag);
    zoom = 1.05;
    center = B.at(k.chest, 0.3, 0, 0);
  } else {
    armour(sc, art, { ...k, up: B.U, fwd: B.F }, B, B.F, B.U, rankOf(tag), tag?.def, 0, true);
    zoom = 2;
    center = B.at(k.pelvis, 0, 0, 0.3);
  }
  sc.translate(mul(center, -1));
  sc.scale(zoom);
  return sc.render(w, h, w / 2, h / 2);
}

// ---------------------------------------------------------------- helpers

function merge(dst: Scene, src: Scene): void {
  // keep crease groups distinct between the merged scenes
  const off = dst.group();
  for (const p of src.prims) {
    p.group += off * 1000;
    dst.prims.push(p);
  }
  for (const l of src.lines) {
    l.group += off * 1000;
    dst.lines.push(l);
  }
  for (const d of src.dots) dst.dots.push(d);
}

/** Deterministic tiny jitter for variety (wear spots). */
export function dollJitter(seed: number, i: number): number {
  return hash2(seed, i, 41);
}
