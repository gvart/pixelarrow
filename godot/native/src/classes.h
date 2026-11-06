// Fresh-class combat numbers (src/war/sim/classes.ts warStats): read from the derived/war_stats table the TS exports
// (src/dev/godotData.ts), not recomputed (docs/impl/godot-port.md G-10). Baked persons (warStatsOf) come from GDScript.
#pragma once

#include <cmath>
#include <string>
#include <unordered_map>

#include "vision.h"

namespace sim {

enum Missile { ARROW, STONE, JAVELIN };

struct WarStats {
	double maxHp = 0, dmg = 0, reach = 0;
	int atkTicks = 1;
	double rangedDmg = 0, range = 0, ammo = 0;
	int shotTicks = 1;
	double shotSpeed = 0;
	Missile missile = ARROW;
	double accuracy = 0, armor = 0, block = 0, ap = 0, speed = 1;
	double knock = 0; // 0: none (TS undefined)
	double bp = 0, ws = 0;
	int flags = 0;
	double work = -1, breach = -1; // -1: undefined
};

struct ClassTable {
	std::unordered_map<std::string, WarStats> by_id;

	// warStats(cls): an unknown class is militia
	const WarStats &of(const std::string &cls) const {
		const auto it = by_id.find(cls);
		return it != by_id.end() ? it->second : by_id.at("militia");
	}

	// vision.ts sightOf
	int sight_of(const std::string &cls) const {
		if (cls == "scout") return VISION.scout;
		const double r = of(cls).range;
		return r > 0 ? std::max(VISION.ranged, int(std::ceil(r)) + 3) : VISION.melee;
	}
};

} // namespace sim
