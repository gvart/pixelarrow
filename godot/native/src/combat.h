// Combat rules of the war sim (src/war/sim/combat.ts), line for line. COMBAT mirrors the TS constants; tests/sim/test_rules.gd
// checks them against the exported table.
#pragma once

#include "js_math.h"

namespace sim {

struct CombatRules {
	double damageScale = 0.34, armorK = 12, sideBlock = 0.35, missileBlock = 1.25, maxBlock = 0.85, missileDmg = 2;
	double meleeDown = 0.25, meleeUp = 0.2, meleeMaxDiff = 2;
	double missileDown = 0.12, rangeDown = 0.8, missileFullDiff = 4, missileMaxDiff = 8;
	double uphillAtk = 1.2, bogDmg = 0.75, bogAtk = 1.25, bogBlock = 0.5, forestCover = 0.55, falloff = 0.4;
};
inline const CombatRules COMBAT{};

inline double clamp(double v, double lo, double hi) { return v < lo ? lo : v > hi ? hi : v; }

// Melee damage multiplier for an attacker dh height levels above (negative: below) the target.
inline double melee_height(double dh) {
	const double d = clamp(dh, -COMBAT.meleeMaxDiff, COMBAT.meleeMaxDiff);
	return d >= 0 ? 1 + COMBAT.meleeDown * d : 1 + COMBAT.meleeUp * d;
}

// Counted levels of a missile shot from dh levels above the target (W-51).
inline double height_levels(double dh) {
	const double d = dh > 0 ? dh : 0, full = d < COMBAT.missileFullDiff ? d : COMBAT.missileFullDiff;
	return full + ((d < COMBAT.missileMaxDiff ? d : COMBAT.missileMaxDiff) - full) / 2;
}
inline double missile_height(double dh) { return 1 + COMBAT.missileDown * height_levels(dh); }
inline double height_range(double dh) { return COMBAT.rangeDown * height_levels(dh); }

// Damage after armour (src/sim/battle.ts applyDamage).
inline double after_armour(double raw, double armor, double ap) {
	const double v = (raw * COMBAT.damageScale * COMBAT.armorK) / (COMBAT.armorK + armor * (1 - ap));
	return v > 0.5 ? v : 0.5;
}

// Block chance of a man facing `facing` against a hit from (dx,dy): full in front, a third from the side, none behind.
inline double block_chance(double block, double facing, double dx, double dy, bool missile, bool bog) {
	if (block <= 0) return 0;
	double d = js::hypot(dx, dy);
	if (d == 0 || d != d) d = 1; // `|| 1`: 0 and NaN fall back
	const double front = (js::cos(facing) * dx + js::sin(facing) * dy) / d;
	if (front < -0.5) return 0;
	double b = front < 0.5 ? block * COMBAT.sideBlock : block;
	if (missile) b *= COMBAT.missileBlock;
	if (bog) b *= COMBAT.bogBlock;
	return clamp(b, 0, COMBAT.maxBlock);
}

// Chance a missile loosed from d tiles (of `range`) hits.
inline double hit_chance(double accuracy, double d, double range, bool forest) {
	const double p = accuracy * (1 - COMBAT.falloff * clamp(d / range, 0, 1)) * (forest ? COMBAT.forestCover : 1);
	return clamp(p, 0.05, 0.97);
}

} // namespace sim
