// SimData.load for the tables of depth, soldiers, skills, honours, deeds, food, captives and mobs (and the warWild,
// warBosses, units, perks and world/regions rows they read): each is read when its table is in `tables`, by its
// exported name (GameData.table("src/war/sim/mobs") under "src/war/sim/mobs").
#pragma once

#include <godot_cpp/variant/dictionary.hpp>

namespace sim {

struct Data;
void load_tables(Data &d, const godot::Dictionary &tables);

} // namespace sim
