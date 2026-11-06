#include "probe.h"

#include <godot_cpp/core/class_db.hpp>

#include "combat.h"
#include "formation.h"

namespace godot {

Dictionary SimProbe::combat_constants() {
	const sim::CombatRules &c = sim::COMBAT;
	Dictionary d;
	d["damageScale"] = c.damageScale;
	d["armorK"] = c.armorK;
	d["sideBlock"] = c.sideBlock;
	d["missileBlock"] = c.missileBlock;
	d["maxBlock"] = c.maxBlock;
	d["missileDmg"] = c.missileDmg;
	d["meleeDown"] = c.meleeDown;
	d["meleeUp"] = c.meleeUp;
	d["meleeMaxDiff"] = c.meleeMaxDiff;
	d["missileDown"] = c.missileDown;
	d["rangeDown"] = c.rangeDown;
	d["missileFullDiff"] = c.missileFullDiff;
	d["missileMaxDiff"] = c.missileMaxDiff;
	d["uphillAtk"] = c.uphillAtk;
	d["bogDmg"] = c.bogDmg;
	d["bogAtk"] = c.bogAtk;
	d["bogBlock"] = c.bogBlock;
	d["forestCover"] = c.forestCover;
	d["falloff"] = c.falloff;
	return d;
}

double SimProbe::melee_height(double dh) { return sim::melee_height(dh); }
double SimProbe::missile_height(double dh) { return sim::missile_height(dh); }
double SimProbe::height_range(double dh) { return sim::height_range(dh); }
double SimProbe::after_armour(double raw, double armor, double ap) { return sim::after_armour(raw, armor, ap); }
double SimProbe::block_chance(double block, double facing, double dx, double dy, bool missile, bool bog) { return sim::block_chance(block, facing, dx, dy, missile, bog); }
double SimProbe::hit_chance(double accuracy, double d, double range, bool forest) { return sim::hit_chance(accuracy, d, range, forest); }

Array SimProbe::formation_offsets(const String &shape, int n, int64_t seed) {
	const sim::Shape s = shape == "column" ? sim::Shape::Column : shape == "wedge" ? sim::Shape::Wedge : shape == "loose" ? sim::Shape::Loose : sim::Shape::Line;
	sim::Mulberry rng{ uint32_t(seed) };
	Array out;
	for (double v : sim::formation_offsets(s, n, rng)) out.push_back(v);
	return out;
}

void SimProbe::_bind_methods() {
	ClassDB::bind_static_method("SimProbe", D_METHOD("combat_constants"), &SimProbe::combat_constants);
	ClassDB::bind_static_method("SimProbe", D_METHOD("melee_height", "dh"), &SimProbe::melee_height);
	ClassDB::bind_static_method("SimProbe", D_METHOD("missile_height", "dh"), &SimProbe::missile_height);
	ClassDB::bind_static_method("SimProbe", D_METHOD("height_range", "dh"), &SimProbe::height_range);
	ClassDB::bind_static_method("SimProbe", D_METHOD("after_armour", "raw", "armor", "ap"), &SimProbe::after_armour);
	ClassDB::bind_static_method("SimProbe", D_METHOD("block_chance", "block", "facing", "dx", "dy", "missile", "bog"), &SimProbe::block_chance);
	ClassDB::bind_static_method("SimProbe", D_METHOD("hit_chance", "accuracy", "d", "range", "forest"), &SimProbe::hit_chance);
	ClassDB::bind_static_method("SimProbe", D_METHOD("formation_offsets", "shape", "n", "seed"), &SimProbe::formation_offsets);
}

} // namespace godot
