// A player's path as the sim's limits read it (src/war/world/start.ts): PlayerPath, NO_PATH, the caps of each path
// (soldierCap, workerCap, cartCap), mayHold, unlockLevel and manRefusal, line for line. PATHS and FAMILIES come from the
// exported table src/war/world/start; FAMILY_OF from the skills table, the civilian classes from the civilians'.
#pragma once

#include <map>
#include <optional>
#include <string>
#include <vector>

#include <godot_cpp/variant/dictionary.hpp>

namespace sim {

struct StartTables {
	struct Path {
		double cap = 0, workers = 0, carts = 0;
	};
	std::vector<std::pair<std::string, Path>> PATHS; // PATH_IDS order
	std::map<std::string, std::map<std::string, double>> FAMILIES; // family -> unlocks (class -> level), lookup only
};
// tables["src/war/world/start"] (absent: left empty)
void load_start_tables(const godot::Dictionary &tables, StartTables &out);

// path, family: "" for null; level: TS undefined is 1 where read
struct PlayerPath {
	std::string path, family;
	std::optional<double> level;
};
inline const PlayerPath NO_PATH{};

double soldier_cap(const std::string &path);
double worker_cap(const std::string &path);
double cart_cap(const std::string &path);
bool may_hold(const PlayerPath &p, const std::string &cls);
double unlock_level(const std::string &family, const std::string &cls);
// "" null: he may join; else 'family' | 'locked' | 'full' | 'household'
std::string man_refusal(const PlayerPath &p, const std::string &cls, double soldiers, double workers);

PlayerPath player_path_from(const godot::Dictionary &d);

} // namespace sim
