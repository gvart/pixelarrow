// The sim's fixed tables, loaded once from the exported data (godot/data/tables, src/dev/godotData.ts) before any sim
// runs: SimData.load({"war_stats": GameData.table("derived/war_stats")["WAR_STATS"], ...}).
#pragma once

#include <godot_cpp/classes/ref_counted.hpp>
#include <godot_cpp/variant/dictionary.hpp>

#include "captives.h"
#include "classes.h"
#include "item.h"
#include "landmarks.h"
#include "souls.h"
#include "stories.h"
#include "deeds.h"
#include "depth.h"
#include "food.h"
#include "honours.h"
#include "mobs.h"
#include "skills.h"
#include "soldiers.h"
#include "war_bosses.h"
#include "war_wild.h"
#include "crafting.h"
#include "economy.h"
#include "holders.h"
#include "professions.h"
#include "recipes.h"
#include "trade.h"
#include "town_level.h"

namespace sim {

struct Data {
	ClassTable classes;
	ItemTable items; // makeItem (item.h)
	StoryTables stories; // hiddenStories (stories.h)
	// depth, soldiers, skills, honours, deeds, food, captives, mobs and their data deps (load_tables.cpp)
	DepthTables depth;
	SoldierTables soldiers;
	SkillTables skills;
	HonourTables honours;
	DeedTables deeds;
	FoodTables food;
	CaptiveTables captives;
	MobTables mobs;
	WildTables wild;
	BossTables bosses;
	// economy, holders, trade, crafting (loaded when SimData.load gets their tables)
	EconomyTables economy;
	HolderTables holders;
	TradeTables trade;
	ProfTables professions;
	RecipeTables recipes;
	CraftTables craft;
	SoulTables souls; // souls.h
	TownTables town; // town_level.h
	LandmarkTables landmarks; // landmarks.h
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
