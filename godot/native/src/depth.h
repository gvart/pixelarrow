// M7c region depth (src/war/sim/depth.ts): DEPTH, REGION_DEPTH, HOST and EARLY come from the exported table
// (src/war/sim/depth) through SimData.load; depthOf and depthRule are ported here.
#pragma once

#include <map>
#include <string>
#include <vector>

namespace sim {

struct DepthRule {
	double mob = 1, respawn = 0;
	struct {
		double ticks = 0, men = 0, players = 0;
	} claim;
	double yield = 1;
	double lairs[2] = { 0, 0 };
	double score = 0;
};

struct HostRules {
	struct {
		double hp = 1, dmg = 1;
	} captain, guard;
	struct {
		double every = 0, men = 0, r = 0;
	} raid;
};

struct EarlyRules {
	double depth = 0, clear = 0, rise = 0, hp = 0, giveUp = 0, again = 0;
};

struct DepthTables {
	std::vector<DepthRule> rules; // DEPTH
	std::map<std::string, double> region_depth; // REGION_DEPTH (looked up by id only)
	HostRules host; // HOST
	EarlyRules early; // EARLY
};

// What depthOf reads of a region: its id and its own depth field (has_depth false: absent).
struct DepthRegion {
	std::string id;
	bool has_depth = false;
	double depth = 0;
};

// A region's depth: its own field, else the world table, else 1 (test and sandbox maps play as an entry).
double depth_of(const DepthRegion &r);
const DepthRule &depth_rule(const DepthRegion &r);

} // namespace sim
