// The sim's fixed tables, loaded once from the exported data (godot/data/tables, src/dev/godotData.ts) before any sim
// runs: SimData.load({"war_stats": GameData.table("derived/war_stats")["WAR_STATS"], ...}).
#pragma once

#include <godot_cpp/classes/ref_counted.hpp>
#include <godot_cpp/variant/dictionary.hpp>

#include "bosses.h"
#include "captives.h"
#include "civilians.h"
#include "classes.h"
#include "item.h"
#include "landmarks.h"
#include "souls.h"
#include "start.h"
#include "stats.h"
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
#include "encounters.h"
#include "prebuilt.h"
#include "roster.h"
#include "economy.h"
#include "holders.h"
#include "professions.h"
#include "recipes.h"
#include "roam.h"
#include "siege.h"
#include "trade.h"
#include "town_level.h"
#include "warlords.h"
#include "alliance_ai.h"
#include "season_clock.h"
#include "works.h"
#include "net_guide.h"

namespace sim {

// What the room (room.h) reads of src/data/warNpcTowns (NPC.reach) and src/data/warTownBoard (BOARD.rest): W-194 town rest.
struct RoomTables {
	double npcReach = 0, restPerSec = 0, restFoeR = 0;
	std::set<std::string> CHOKEPOINTS; // src/war/world/season (the honours; membership only)
};

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
	CivilianTables civilians;
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
	WorksTables works; // FIRE, FORT (src/war/sim/works)
	RoamTables roam; // roam.h
	BossSimTables boss_sim; // bosses.h
	WarlordTables warlords; // warlords.h
	AllyAiTables ally; // alliance_ai.h
	SeasonTables season; // season_clock.h
	SiegeTables siege; // SIEGE, RAM, THROWER... (src/war/sim/siege)
	EncTables encounters; // encounters.h (ENC, ENCOUNTERS)
	PrebuiltTables prebuilt; // prebuilt.h
	RosterTables roster; // roster.h
	StatTables stats; // stats.h: the item rules and the war bake (warStatsOf)
	StartTables start; // start.h: PATHS, FAMILIES
	RoomTables room; // room.h: the town rest
	GuideTables guide; // net_guide.h: the guide, the stories by region, robbers, world events (room_life.cpp)
	std::map<std::string, std::vector<std::string>> names; // NAMES by culture (src/data/names, freeName), lookup only
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
