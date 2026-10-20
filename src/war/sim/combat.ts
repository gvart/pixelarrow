/**
 * Combat rules of the war sim. Damage and block mirror the battle sim (src/sim/battle.ts
 * RULES: damageScale, armorK, side and missile block factors); the terrain rules are the
 * war's own (docs/impl/global-war-rebuild.md "Higher ground: + range and + damage vs lower").
 */
export const COMBAT = {
  damageScale: 0.34,
  armorK: 12,
  sideBlock: 0.35, // block factor vs a blow from the side (rear: no block)
  missileBlock: 1.25,
  maxBlock: 0.85,
  /**
   * War missiles hit harder than in the battle game, where ranged troops get a long approach
   * to shoot through: here a charge from 20 tiles gives them a few volleys only.
   */
  missileDmg: 2,
  /** High ground, after src/data/terrain.ts HEIGHT_RULES: melee +25% per level above the target, -20% per level below (2 levels count). */
  meleeDown: 0.25,
  meleeUp: 0.2,
  meleeMaxDiff: 2,
  /** Missiles +12% damage and +0.8 tiles range per level above the target (4 levels count: war heights run 0..7). */
  missileDown: 0.12,
  rangeDown: 0.8,
  missileMaxDiff: 4,
  /** Striking up at a higher man is slower. */
  uphillAtk: 1.2,
  /** Standing in a ford or marsh: own blows weaker and slower, own block halved. */
  bogDmg: 0.75,
  bogAtk: 1.25,
  bogBlock: 0.5,
  /** Missiles at a man in forest hit this much less often. */
  forestCover: 0.55,
  /** Hit chance falls by this share at full range. */
  falloff: 0.4,
};

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Melee damage multiplier for an attacker dh height levels above (negative: below) the target. */
export function meleeHeight(dh: number): number {
  const d = clamp(dh, -COMBAT.meleeMaxDiff, COMBAT.meleeMaxDiff);
  return d >= 0 ? 1 + COMBAT.meleeDown * d : 1 + COMBAT.meleeUp * d;
}

export function missileHeight(dh: number): number {
  return 1 + COMBAT.missileDown * clamp(dh, 0, COMBAT.missileMaxDiff);
}

export function heightRange(dh: number): number {
  return COMBAT.rangeDown * clamp(dh, 0, COMBAT.missileMaxDiff);
}

/** Damage after armour (src/sim/battle.ts applyDamage). */
export function afterArmour(raw: number, armor: number, ap: number): number {
  return Math.max(0.5, (raw * COMBAT.damageScale * COMBAT.armorK) / (COMBAT.armorK + armor * (1 - ap)));
}

/**
 * Block chance of a man facing `facing` against a hit coming from (fx,fy) towards him:
 * full block in front, a third from the side, none from behind.
 */
export function blockChance(block: number, facing: number, dx: number, dy: number, missile: boolean, bog: boolean): number {
  if (block <= 0) return 0;
  const d = Math.hypot(dx, dy) || 1;
  const front = (Math.cos(facing) * dx + Math.sin(facing) * dy) / d; // 1 = attacker straight ahead
  if (front < -0.5) return 0;
  let b = front < 0.5 ? block * COMBAT.sideBlock : block;
  if (missile) b *= COMBAT.missileBlock;
  if (bog) b *= COMBAT.bogBlock;
  return clamp(b, 0, COMBAT.maxBlock);
}

/** Chance a missile loosed from d tiles (of `range`) hits. */
export function hitChance(accuracy: number, d: number, range: number, forest: boolean): number {
  const p = accuracy * (1 - COMBAT.falloff * clamp(d / range, 0, 1)) * (forest ? COMBAT.forestCover : 1);
  return clamp(p, 0.05, 0.97);
}
