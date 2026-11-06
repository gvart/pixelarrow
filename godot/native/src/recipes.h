// Recipes and crafted item rolls (src/data/recipes.ts), as the sim uses them: the RECIPES rows and roll tables from the
// exported table src/data/recipes, item tiers, war stat pools and powers from derived/crafting (godotData.ts CRAFTABLE,
// so the affix rules and materialOf stay in TS), rarities (src/data/items), stat steps (src/data/affixes) and civilian
// tool tiers (src/data/classes CIV_TOOLS). craftGrade and craftRoll are ported line for line.
#pragma once

#include <algorithm>
#include <array>
#include <cstdint>
#include <optional>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

#include <godot_cpp/variant/dictionary.hpp>

#include "holders.h"
#include "item.h"

namespace sim {

using Goods = Cost;

struct Recipe {
	std::string id, kind, prof, node;
	std::vector<std::string> needs;
	std::string at;
	int lv = 1;
	Goods inputs;
	double secs = 0;
	struct Out {
		std::string item, tool, good, product, engine, fort; // "" = undefined
		double n = 0;
	} out;
	int tier = 1;
	double xp = 1;
	bool perTile = false;
};

struct Dish {
	double inn, melee, missile, acc, heal, xp, mins;
};

// derived/crafting CRAFTABLE: an item or a civilian tool.
struct Craftable {
	int tier = 1;
	std::vector<std::pair<std::string, double>> pool; // warAffixPool
	std::vector<std::string> powers;                  // powerPool without WAR_POWER_IGNORED
	std::string main;                                 // items: first good of one unit of its material
	bool tool = false;
};

struct RecipeTables {
	std::unordered_map<std::string, Recipe> RECIPES; // looked up by id only
	std::unordered_map<std::string, std::string> BATCH_NODES;
	std::unordered_map<std::string, Dish> DISHES;
	double FED_CAP = 0.05;
	std::vector<std::array<double, 5>> RARITY_ODDS;
	std::vector<double> TIER_CAP, QUALITY_MC;
	std::vector<std::string> RARITIES;                     // src/data/items
	std::vector<std::pair<double, double>> AFFIX_STEPS;    // src/data/affixes
	std::unordered_map<std::string, int> CIV_TOOLS;        // src/data/classes: tool id -> tier
	std::unordered_map<std::string, Craftable> CRAFTABLE;  // every ITEMS and CIV_TOOLS id
};
// tables: "recipes", "items", "affixes", "classes" (src/data/...) and "derived_crafting" (derived/crafting)
void load_recipes(const godot::Dictionary &tables, RecipeTables &out);

struct GradeOpts {
	int level = 1;
	std::optional<int> toolTier;
	std::optional<std::string> toolRarity;
	std::optional<int> wpLevel;
	bool masterwork = false, specialty = false;
};
int craft_grade(const GradeOpts &o);
const std::array<double, 5> &odds_row(int g);
inline double crude_chance(int g) { return std::max(0, 30 - 3 * g) / 100.0; }
inline double masterwork_chance(int g) { return std::min(15, 5 + std::max(0, g - 8)) / 100.0; }

// craftRoll's seed: a string (hashed) or a number (>>> 0).
struct RollSeed {
	std::optional<std::string> str;
	double num = 0;
};
struct RollOpts {
	bool masterwork = false;
	std::optional<std::string> maker;
};
Item craft_roll(const std::string &defId, int g, const RollSeed &seed, const RollOpts &o = {});

// JS `x >>> 0` and String(x) of an integral number.
uint32_t to_uint32(double x);
std::string js_int_str(double x);

} // namespace sim
