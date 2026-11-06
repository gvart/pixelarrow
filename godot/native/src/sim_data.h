// The sim's fixed tables, loaded once from the exported data (godot/data/tables, src/dev/godotData.ts) before any sim
// runs: SimData.load({"war_stats": GameData.table("derived/war_stats")["WAR_STATS"], ...}).
#pragma once

#include <godot_cpp/classes/ref_counted.hpp>
#include <godot_cpp/variant/dictionary.hpp>

#include "classes.h"
#include "crafting.h"
#include "economy.h"
#include "holders.h"
#include "professions.h"
#include "recipes.h"
#include "trade.h"

namespace sim {

struct Data {
	ClassTable classes;
	// economy, holders, trade, crafting (loaded when SimData.load gets their tables)
	EconomyTables economy;
	HolderTables holders;
	TradeTables trade;
	ProfTables professions;
	RecipeTables recipes;
	CraftTables craft;
};
const Data &data();

} // namespace sim

namespace godot {

class SimData : public RefCounted {
	GDCLASS(SimData, RefCounted)

public:
	static void load(const Dictionary &tables);
	static bool loaded();
	static int sight_of(const String &cls);

protected:
	static void _bind_methods();
};

} // namespace godot
