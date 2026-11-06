// Economy and building data (src/war/sim/economy.ts), line for line: the BUILDINGS and RESOURCE_NODES tables and the
// constants come from the exported table src/war/sim/economy (SimData.load "economy"); footprints, rectangle and
// polyline tiles, door locks and who needs a man are ported. One tile = 2 m.
#pragma once

#include <array>
#include <optional>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

#include <godot_cpp/variant/dictionary.hpp>

#include "holders.h"

namespace sim {

using Spot = std::array<double, 4>; // x, y, fx, fy

// Optional numbers that are never 0 when set (tier, walk, cap, depth, chest, cache) read 0 for undefined, as `!d.chest`.
struct BuildingDef {
	double w = 0, h = 0, hp = 0;
	Cost cost;
	double labour = 0, workers = 0, influence = 0;
	std::string material; // "wood" | "stone"
	bool store = false;
	std::string wall; // "" | "segment" | "tower" | "gate"
	bool perTile = false;
	struct Yields {
		std::string res;
		double max, regrow, rate;
	};
	std::optional<Yields> yields;
	double tier = 0, walk = 0, cap = 0, depth = 0;
	std::string access; // "" | "stairs" | "ladder"
	bool door = false, burnable = false, bridge = false;
	struct Upgrade {
		std::string to;
		Cost cost;
		double labour;
	};
	std::optional<Upgrade> upgrade;
	bool brazier = false;
	std::string field; // "" | "stakes" | "ditch"
	struct Workplace {
		std::string kind;
		int level;
		std::optional<std::vector<Spot>> spots;
	};
	std::optional<Workplace> workplace;
	double chest = 0;
	bool prebuilt = false;
	double cache = 0;
	bool house = false;
};

struct NodeDef {
	std::string res;
	double max, regrow, rate, slots;
	bool rare = false;
};

struct EconomyTables {
	std::vector<std::string> types; // BUILDINGS keys in order
	std::unordered_map<std::string, BuildingDef> BUILDINGS;
	std::unordered_map<std::string, NodeDef> RESOURCE_NODES; // looked up by object id only
	int NEUTRAL_TEAM = 6;
	struct { double slow, spill, rebuild; } RUIN{};
	struct { double step, cost, labour; } REPAIR{};
	struct { double stoneMelee; } WALLS{};
	struct { double cap, guard; } CHEST{};
	struct { double every, reach; } STAFF{};
	std::vector<std::string> ACCESS;
	struct { double share, fee; } TERMS{};
	struct { double wood, stone, perMan, tell; } LOCK{};
	struct { double cap; } HOUSE{};
	struct { double radius, pitch, life; } BRAZIER{};
	struct FieldRule { double slow, dmg; };
	FieldRule FIELD_STAKES{}, FIELD_DITCH{};
	struct { double wood, pineR, pineBoost, pineMax, fromPine; } KILN{};
	std::unordered_set<std::string> PINES; // membership only
	struct {
		double maxSpanWood, maxSpanStone;
		std::vector<double> widths;
		double width, piece, ramp, cost;
		std::string kitWood, kitStone;
	} BRIDGE{};
	struct Kit { std::string segment, tower, gate; };
	Kit WALL_KIT_WOOD, WALL_KIT_TIMBER, WALL_KIT_STONE;
	double SEGMENT = 4, CARRY = 10, CLAIM_RADIUS = 20, CANCEL_REFUND = 0.75;
	struct { double refund, ticks; } DEMOLISH{};
	double WORK_DEFENCE = 1.5;
};
void load_economy(const godot::Dictionary &t, EconomyTables &out);
Cost cost_of(const godot::Dictionary &d);

const BuildingDef &building(const std::string &type);
// Footprint (w, h) of a building after rotation.
std::array<double, 2> rotated(const std::string &type, int rot);
// Tiles (flat x,y) of a w x h footprint centred on (x, y), snapped to whole tiles.
std::vector<int> rect_tiles(double x, double y, double w, double h);
// Tiles (flat x,y) of a polyline, 4-connected, without repeats.
std::vector<int> line_tiles(const std::vector<double> &points);
// Door hit points of a building (0: no lock).
double lock_of(const BuildingDef &d);
bool needs_person(const std::string &t, const BuildingDef &d);

} // namespace sim
