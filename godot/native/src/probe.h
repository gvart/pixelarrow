// SimProbe: the sim's pure rules for GDScript tests (tests/sim/test_rules.gd checks them against TS vectors).
#pragma once

#include <godot_cpp/classes/ref.hpp>
#include <godot_cpp/classes/ref_counted.hpp>
#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/dictionary.hpp>
#include <godot_cpp/variant/string.hpp>

namespace godot {

class SimProbe : public RefCounted {
	GDCLASS(SimProbe, RefCounted)

public:
	static Dictionary combat_constants();
	static double melee_height(double dh);
	static double missile_height(double dh);
	static double height_range(double dh);
	static double after_armour(double raw, double armor, double ap);
	static double block_chance(double block, double facing, double dx, double dy, bool missile, bool bog);
	static double hit_chance(double accuracy, double d, double range, bool forest);
	static Array formation_offsets(const String &shape, int n, int64_t seed);
	// stats.h: a person's war stats (warStatsOf) with the perks of `path` at `level` (withPerks, perkFx; "" none)
	static Dictionary war_stats(const Dictionary &person, const String &path, double level);
	static Dictionary perk_fx(const String &path, double level);
	// war_wild.h chiefLoot: {goods: [[good, n]...], item: [def, rarity] or null}
	static Dictionary chief_loot(const String &id, double depth, const String &seed);

protected:
	static void _bind_methods();
};

} // namespace godot
