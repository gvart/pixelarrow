// The sim's fixed tables, loaded once from the exported data (godot/data/tables, src/dev/godotData.ts) before any sim
// runs: SimData.load({"war_stats": GameData.table("derived/war_stats")["WAR_STATS"], ...}).
#pragma once

#include <godot_cpp/classes/ref_counted.hpp>
#include <godot_cpp/variant/dictionary.hpp>

#include "classes.h"
#include "item.h"
#include "landmarks.h"
#include "souls.h"
#include "stories.h"
#include "town_level.h"

namespace sim {

struct Data {
	ClassTable classes;
	ItemTable items; // makeItem (item.h)
	StoryTables stories; // hiddenStories (stories.h)
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
