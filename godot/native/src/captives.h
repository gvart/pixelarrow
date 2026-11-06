// W-68 captives and dismissal (src/war/sim/captives.ts): CAPTIVE comes from the exported table (src/war/sim/captives),
// the world map from src/war/world/regions (WORLD_REGIONS: id and pos), both through SimData.
#pragma once

#include <string>
#include <vector>

namespace sim {

struct CaptiveRules {
	double askMs = 0, holdMs = 0, refuse = 0, refusePerLevel = 0, soulMs = 0, barMs = 0;
};

// What the sim reads of a world region (src/war/world/regions.ts WORLD_REGIONS), in table order.
struct WorldRegion {
	std::string id;
	double x = 0, y = 0; // pos
};

struct CaptiveTables {
	CaptiveRules CAPTIVE;
	std::vector<WorldRegion> WORLD_REGIONS;
};

// The chance he refuses to join his captor, by level.
double refuse_chance(double level);
// FNV-1a of a string (UTF-8 in, hashed over its UTF-16 code units as charCodeAt), as a fraction in [0, 1).
double unit_of(const std::string &id);
// Does this man refuse to join his captor? Fixed per man and level.
bool refuses(const std::string &id, double level);
// When the captor may ask him: `until` is when he is released (capture + holdMs).
double ask_at(double until);
// Where his soul may wake, in order: this region, then the world regions nearest to it.
std::vector<std::string> soul_regions(const std::string &from);

} // namespace sim
