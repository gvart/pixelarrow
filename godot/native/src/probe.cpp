#include "probe.h"

#include <godot_cpp/core/class_db.hpp>

#include "combat.h"
#include "formation.h"
#include "roster.h"
#include "stats.h"
#include "war_wild.h"

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

static String gs(const std::string &s) { return String::utf8(s.c_str()); }

// WarStats as TS has it: knock, work and breach only when set
Dictionary SimProbe::war_stats(const Dictionary &person, const String &path, double level) {
	const sim::WarStats s = sim::with_perks(sim::war_stats_of(sim::war_person_from(person)), sim::perk_fx(path.utf8().get_data(), level));
	Dictionary d;
	d["maxHp"] = s.maxHp;
	d["dmg"] = s.dmg;
	d["reach"] = s.reach;
	d["atkTicks"] = s.atkTicks;
	d["rangedDmg"] = s.rangedDmg;
	d["range"] = s.range;
	d["ammo"] = s.ammo;
	d["shotTicks"] = s.shotTicks;
	d["shotSpeed"] = s.shotSpeed;
	d["missile"] = s.missile == sim::STONE ? "stone" : s.missile == sim::JAVELIN ? "javelin" : "arrow";
	d["accuracy"] = s.accuracy;
	d["armor"] = s.armor;
	d["block"] = s.block;
	d["ap"] = s.ap;
	d["speed"] = s.speed;
	if (s.knock != 0) d["knock"] = s.knock;
	d["bp"] = s.bp;
	d["ws"] = s.ws;
	d["flags"] = s.flags;
	if (s.work != -1) d["work"] = s.work;
	if (s.breach != -1) d["breach"] = s.breach;
	return d;
}

Dictionary SimProbe::perk_fx(const String &path, double level) {
	const sim::PerkFx f = sim::perk_fx(path.utf8().get_data(), level);
	Dictionary d;
	const std::pair<const char *, double> all[] = { { "hp", f.hp }, { "dmg", f.dmg }, { "armor", f.armor }, { "wounded", f.wounded }, { "work", f.work },
		{ "siteCost", f.siteCost }, { "siteHp", f.siteHp }, { "cartLoads", f.cartLoads }, { "cartSpeed", f.cartSpeed }, { "cartHp", f.cartHp } };
	for (const auto &[k, v] : all)
		if (v != 0) d[k] = v;
	return d;
}

Dictionary SimProbe::chief_loot(const String &id, double depth, const String &seed) {
	const sim::ChiefDrop c = sim::chief_loot(id.utf8().get_data(), depth, seed.utf8().get_data());
	Dictionary d;
	Array goods;
	for (const auto &g : c.goods) {
		Array e;
		e.push_back(gs(g.first));
		e.push_back(g.second);
		goods.push_back(e);
	}
	d["goods"] = goods;
	if (c.item) {
		Array it;
		it.push_back(gs(c.item->first));
		it.push_back(gs(c.item->second));
		d["item"] = it;
	} else
		d["item"] = Variant();
	return d;
}

void SimProbe::_bind_methods() {
	ClassDB::bind_static_method("SimProbe", D_METHOD("war_stats", "person", "path", "level"), &SimProbe::war_stats);
	ClassDB::bind_static_method("SimProbe", D_METHOD("perk_fx", "path", "level"), &SimProbe::perk_fx);
	ClassDB::bind_static_method("SimProbe", D_METHOD("chief_loot", "id", "depth", "seed"), &SimProbe::chief_loot);
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
